"""PE (Windows executable) inspection — catching renamed executors.

Renaming `krnl.exe` to `homework.exe` defeats every name signature. It does not
defeat this: the compiler stamps the *original* file name, company and product
into a version resource inside the binary, and executor builds almost never
bother to strip it. Reading that resource turns a renamed file back into a
name Candy can match against the threat database.

Also computes per-section Shannon entropy, because packed and crypted payloads
have a characteristic high-entropy code section that plain compiled code does
not.

Written directly against the PE format with the standard library — no pefile,
no LIEF, nothing to install.
"""
from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Resource type 16 (RT_VERSION) holds VS_VERSIONINFO.
RT_VERSION = 16
IMAGE_DIRECTORY_ENTRY_RESOURCE = 2

# A compiled code section sits around 6.0-6.7 bits/byte. Compressed or
# encrypted data approaches 8.0. 7.2 is the usual dividing line.
PACKED_ENTROPY_THRESHOLD = 7.2

MAX_PE_READ = 64 * 1024 * 1024


@dataclass
class Section:
    name: str
    virtual_address: int
    virtual_size: int
    raw_offset: int
    raw_size: int
    characteristics: int
    entropy: float = 0.0

    @property
    def executable(self) -> bool:
        # IMAGE_SCN_MEM_EXECUTE | IMAGE_SCN_CNT_CODE
        return bool(self.characteristics & 0x20000020)


@dataclass
class PEInfo:
    path: str
    is_pe: bool = False
    is_dll: bool = False
    machine: int = 0
    timestamp: int = 0
    subsystem: int = 0
    sections: list[Section] = field(default_factory=list)
    version_strings: dict[str, str] = field(default_factory=dict)
    error: str | None = None

    # ------------------------------------------------------------ helpers
    @property
    def original_filename(self) -> str | None:
        value = self.version_strings.get("OriginalFilename")
        return value.strip() if value else None

    @property
    def company(self) -> str | None:
        value = self.version_strings.get("CompanyName")
        return value.strip() if value else None

    @property
    def product(self) -> str | None:
        value = self.version_strings.get("ProductName")
        return value.strip() if value else None

    @property
    def has_version_info(self) -> bool:
        return bool(self.version_strings)

    @property
    def max_code_entropy(self) -> float:
        code = [s.entropy for s in self.sections if s.executable]
        return max(code) if code else 0.0

    @property
    def looks_packed(self) -> bool:
        return self.max_code_entropy >= PACKED_ENTROPY_THRESHOLD

    def renamed_from(self, actual_name: str) -> str | None:
        """The declared original name, when it disagrees with the file's name.

        Extension differences alone are ignored (`foo.exe` vs `foo.dll` happens
        legitimately during builds); a different stem is what matters.
        """
        declared = self.original_filename
        if not declared:
            return None
        declared_stem = Path(declared).stem.lower()
        actual_stem = Path(actual_name).stem.lower()
        if not declared_stem or declared_stem == actual_stem:
            return None
        return declared

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_pe": self.is_pe,
            "is_dll": self.is_dll,
            "original_filename": self.original_filename,
            "company": self.company,
            "product": self.product,
            "max_code_entropy": round(self.max_code_entropy, 2),
            "looks_packed": self.looks_packed,
            "sections": [s.name for s in self.sections],
            "error": self.error,
        }


def shannon_entropy(data: bytes) -> float:
    """Bits of entropy per byte, 0.0 (uniform) to 8.0 (random)."""
    if not data:
        return 0.0
    counts = [0] * 256
    for byte in data:
        counts[byte] += 1
    length = len(data)
    entropy = 0.0
    for count in counts:
        if count:
            probability = count / length
            entropy -= probability * math.log2(probability)
    return entropy


def inspect(path: str | Path, *, read_limit: int = MAX_PE_READ) -> PEInfo:
    """Parse a PE file. Never raises — failures land in ``PEInfo.error``."""
    info = PEInfo(path=str(path))
    try:
        raw = Path(path).read_bytes()[:read_limit]
    except OSError as exc:
        info.error = f"unreadable: {exc}"
        return info
    return inspect_bytes(raw, str(path))


def inspect_bytes(raw: bytes, path: str = "<memory>") -> PEInfo:
    """Parse PE content already in memory (this is what the tests drive)."""
    info = PEInfo(path=path)
    try:
        if len(raw) < 0x40 or raw[:2] != b"MZ":
            info.error = "not a PE file (no MZ header)"
            return info
        pe_offset = struct.unpack_from("<I", raw, 0x3C)[0]
        if pe_offset + 24 > len(raw) or raw[pe_offset:pe_offset + 4] != b"PE\0\0":
            info.error = "not a PE file (no PE signature)"
            return info

        machine, section_count, timestamp = struct.unpack_from("<HHI", raw, pe_offset + 4)
        optional_size, characteristics = struct.unpack_from("<HH", raw, pe_offset + 20)
        info.is_pe = True
        info.machine = machine
        info.timestamp = timestamp
        info.is_dll = bool(characteristics & 0x2000)

        optional_offset = pe_offset + 24
        magic = struct.unpack_from("<H", raw, optional_offset)[0]
        is_pe32_plus = magic == 0x20B
        # Subsystem sits at a fixed offset inside the optional header, and the
        # data directory count/array follow it; the only difference between
        # PE32 and PE32+ that matters here is the 16-byte shift.
        info.subsystem = struct.unpack_from("<H", raw, optional_offset + 68)[0]
        directory_offset = optional_offset + (112 if is_pe32_plus else 96)
        directory_count = struct.unpack_from(
            "<I", raw, optional_offset + (108 if is_pe32_plus else 92))[0]

        section_offset = optional_offset + optional_size
        info.sections = _parse_sections(raw, section_offset, section_count)

        if directory_count > IMAGE_DIRECTORY_ENTRY_RESOURCE:
            entry = directory_offset + IMAGE_DIRECTORY_ENTRY_RESOURCE * 8
            if entry + 8 <= len(raw):
                resource_rva, resource_size = struct.unpack_from("<II", raw, entry)
                if resource_rva and resource_size:
                    info.version_strings = _read_version_strings(raw, info.sections, resource_rva)
    except (struct.error, IndexError, ValueError) as exc:
        info.error = f"malformed PE: {exc}"
    return info


def _parse_sections(raw: bytes, offset: int, count: int) -> list[Section]:
    sections: list[Section] = []
    for index in range(min(count, 96)):  # PE allows 96 sections; cap the loop
        base = offset + index * 40
        if base + 40 > len(raw):
            break
        name_bytes = raw[base:base + 8]
        name = name_bytes.rstrip(b"\0").decode("ascii", "replace")
        virtual_size, virtual_address, raw_size, raw_offset = struct.unpack_from("<IIII", raw, base + 8)
        characteristics = struct.unpack_from("<I", raw, base + 36)[0]
        section = Section(name=name, virtual_address=virtual_address, virtual_size=virtual_size,
                          raw_offset=raw_offset, raw_size=raw_size, characteristics=characteristics)
        if raw_offset and raw_size and raw_offset + raw_size <= len(raw):
            section.entropy = shannon_entropy(raw[raw_offset:raw_offset + raw_size])
        sections.append(section)
    return sections


def _rva_to_offset(sections: list[Section], rva: int) -> int | None:
    for section in sections:
        start = section.virtual_address
        end = start + max(section.virtual_size, section.raw_size)
        if start <= rva < end:
            return section.raw_offset + (rva - start)
    return None


def _read_version_strings(raw: bytes, sections: list[Section], resource_rva: int) -> dict[str, str]:
    """Walk the resource tree to RT_VERSION and parse VS_VERSIONINFO."""
    root = _rva_to_offset(sections, resource_rva)
    if root is None:
        return {}
    version_entries = _resource_entries(raw, root, root, want_id=RT_VERSION)
    for entry_offset in version_entries:
        # type -> name -> language: two more levels, take the first of each.
        for name_level in _resource_entries(raw, root, entry_offset):
            for lang_level in _resource_entries(raw, root, name_level):
                data = _read_resource_data(raw, sections, lang_level)
                if data:
                    strings = _parse_version_info(data)
                    if strings:
                        return strings
    return {}


def _resource_entries(raw: bytes, root: int, directory: int, want_id: int | None = None) -> list[int]:
    """Child offsets of a resource directory (subdirectories or data entries)."""
    if directory + 16 > len(raw):
        return []
    named, ids = struct.unpack_from("<HH", raw, directory + 12)
    results: list[int] = []
    for index in range(named + ids):
        entry = directory + 16 + index * 8
        if entry + 8 > len(raw):
            break
        name_or_id, offset_to_data = struct.unpack_from("<II", raw, entry)
        if want_id is not None:
            is_name = bool(name_or_id & 0x80000000)
            if is_name or name_or_id != want_id:
                continue
        target = root + (offset_to_data & 0x7FFFFFFF)
        results.append(target)
    return results


def _read_resource_data(raw: bytes, sections: list[Section], entry: int) -> bytes | None:
    """A leaf resource entry: RVA + size pointing at the actual bytes."""
    if entry + 8 > len(raw):
        return None
    data_rva, size = struct.unpack_from("<II", raw, entry)
    if not size or size > 1024 * 1024:
        return None
    offset = _rva_to_offset(sections, data_rva)
    if offset is None or offset + size > len(raw):
        return None
    return raw[offset:offset + size]


def _align4(value: int) -> int:
    return (value + 3) & ~3


def _read_wide_string(data: bytes, offset: int) -> tuple[str, int]:
    """Read a null-terminated UTF-16LE string, returning it and the new offset."""
    end = offset
    while end + 1 < len(data) and data[end:end + 2] != b"\0\0":
        end += 2
    text = data[offset:end].decode("utf-16-le", "replace")
    return text, end + 2


def _parse_version_info(data: bytes) -> dict[str, str]:
    """Parse VS_VERSIONINFO down to the StringFileInfo key/value pairs.

    The structure is a tree of length-prefixed, 4-byte-aligned nodes. Each node
    is: wLength, wValueLength, wType, szKey (wide, null-terminated), padding,
    value, then children. Only StringFileInfo is of interest here.
    """
    strings: dict[str, str] = {}
    if len(data) < 6:
        return strings

    def walk(offset: int, limit: int, depth: int) -> None:
        while offset + 6 <= limit and depth < 5:
            length, value_length, value_type = struct.unpack_from("<HHH", data, offset)
            if length == 0 or offset + length > limit:
                return
            node_end = offset + length
            key, after_key = _read_wide_string(data, offset + 6)
            value_offset = _align4(after_key)

            if key == "StringFileInfo":
                walk(value_offset, node_end, depth + 1)
            elif depth >= 1 and key not in ("VarFileInfo", "Translation"):
                # Inside StringFileInfo: first a language/codepage table, then
                # the actual String nodes whose value is text.
                if value_type == 1 and value_length:
                    text, _ = _read_wide_string(data, value_offset)
                    if key and text:
                        strings.setdefault(key, text)
                else:
                    walk(value_offset, node_end, depth + 1)
            offset = _align4(node_end)
            if offset <= node_end - length:  # defensive: no forward progress
                return

    # Skip the root VS_VERSION_INFO node header and its VS_FIXEDFILEINFO value.
    root_length, root_value_length, _ = struct.unpack_from("<HHH", data, 0)
    _, after_key = _read_wide_string(data, 6)
    children = _align4(_align4(after_key) + root_value_length)
    walk(children, min(root_length or len(data), len(data)), 0)
    return strings


_cache: dict[tuple[str, float, int], PEInfo] = {}


def inspect_cached(path: str | Path) -> PEInfo | None:
    """Cached :func:`inspect`, keyed by (path, mtime, size).

    Parsing is cheap but not free, and both the process monitor and the file
    watcher ask about the same images repeatedly.
    """
    try:
        stat = Path(path).stat()
        key = (str(path).lower(), stat.st_mtime, stat.st_size)
    except OSError:
        return None
    cached = _cache.get(key)
    if cached is not None:
        return cached
    info = inspect(path)
    if len(_cache) > 1024:
        _cache.clear()
    _cache[key] = info
    return info
