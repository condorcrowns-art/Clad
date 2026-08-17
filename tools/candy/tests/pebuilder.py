"""Builds synthetic PE files so the PE parser can be tested without Windows.

This produces a real, structurally valid PE32+ image: DOS stub, COFF header,
optional header with a populated resource data directory, a section table, and
a resource tree containing a VS_VERSIONINFO block. It is not runnable code —
it does not need to be — but every field the parser reads is genuine.
"""
from __future__ import annotations

import struct

RT_VERSION = 16
FILE_ALIGNMENT = 0x200


def _pad(data: bytes, size: int) -> bytes:
    return data + b"\0" * max(0, size - len(data))


def _align(value: int, alignment: int = 4) -> int:
    return (value + alignment - 1) & ~(alignment - 1)


def _wide(text: str) -> bytes:
    return text.encode("utf-16-le") + b"\0\0"


def version_node(key: str, value: bytes = b"", value_length: int = 0,
                 value_type: int = 1, children: bytes = b"") -> bytes:
    """One VS_VERSIONINFO tree node: header, key, padded value, children."""
    head = _wide(key)
    body = b"\0\0\0\0\0\0" + head                      # length fields patched below
    body = _pad(body, _align(len(body)))
    body += value
    body = _pad(body, _align(len(body)))
    body += children
    return struct.pack("<HHH", len(body), value_length, value_type) + body[6:]


def build_version_resource(strings: dict[str, str]) -> bytes:
    """A VS_VERSIONINFO blob carrying the given StringFileInfo entries."""
    entries = b""
    for key, value in strings.items():
        wide_value = _wide(value)
        entries += version_node(key, wide_value, len(wide_value) // 2, 1)
        entries = _pad(entries, _align(len(entries)))

    table = version_node("040904b0", b"", 0, 1, entries)
    table = _pad(table, _align(len(table)))
    string_file_info = version_node("StringFileInfo", b"", 0, 1, table)

    fixed = struct.pack("<IIIIIIIIIIIII",
                        0xFEEF04BD, 0x00010000, 0, 0, 0, 0, 0x3F, 0x0, 4, 0, 0, 0, 0)
    return version_node("VS_VERSION_INFO", fixed, len(fixed), 0, string_file_info)


def build_resource_section(version_blob: bytes, section_rva: int) -> bytes:
    """A minimal resource tree: root -> RT_VERSION -> id 1 -> lang 1033 -> data."""
    header = struct.pack("<IIHHHH", 0, 0, 0, 0, 0, 1)   # one ID entry per level
    dir_size = len(header) + 8

    root_dir = 0
    type_dir = dir_size
    name_dir = dir_size * 2
    data_entry = dir_size * 3
    blob_offset = _align(data_entry + 16, 4)

    out = header + struct.pack("<II", RT_VERSION, 0x80000000 | type_dir)
    out += header + struct.pack("<II", 1, 0x80000000 | name_dir)
    out += header + struct.pack("<II", 1033, data_entry)
    out = _pad(out, data_entry)
    out += struct.pack("<IIII", section_rva + blob_offset, len(version_blob), 0, 0)
    out = _pad(out, blob_offset)
    out += version_blob
    assert root_dir == 0
    return out


def build_pe(*, strings: dict[str, str] | None = None, code: bytes = b"",
             is_dll: bool = False) -> bytes:
    """Assemble a PE32+ image with optional version info and code bytes."""
    # Repetitive x86-looking filler: low entropy, like real compiled code.
    code = code or (b"\x55\x8b\xec\x83\xec\x20\x8b\x45\x08" * 60)
    text_rva, rsrc_rva = 0x1000, 0x2000
    header_size = 0x400
    text_offset = header_size
    text_size = _align(len(code), FILE_ALIGNMENT)
    rsrc_offset = text_offset + text_size

    resource = build_resource_section(build_version_resource(strings), rsrc_rva) if strings else b""
    rsrc_size = _align(len(resource), FILE_ALIGNMENT) if resource else 0

    dos = _pad(b"MZ", 0x3C) + struct.pack("<I", 0x80)
    dos = _pad(dos, 0x80)

    section_count = 2 if resource else 1
    coff = struct.pack("<IHHIIIHH", 0x00004550, 0x8664, section_count, 0, 0, 0,
                       240, 0x2022 if is_dll else 0x0022)

    optional = bytearray(240)
    struct.pack_into("<H", optional, 0, 0x20B)          # PE32+
    struct.pack_into("<H", optional, 68, 3)             # subsystem: console
    struct.pack_into("<I", optional, 108, 16)           # NumberOfRvaAndSizes
    if resource:
        struct.pack_into("<II", optional, 112 + 2 * 8, rsrc_rva, len(resource))

    def section(name: bytes, rva: int, virtual_size: int, offset: int,
                size: int, characteristics: int) -> bytes:
        return (_pad(name, 8) + struct.pack("<IIII", virtual_size, rva, size, offset)
                + struct.pack("<IIHHI", 0, 0, 0, 0, characteristics))

    sections = section(b".text", text_rva, len(code), text_offset, text_size, 0x60000020)
    if resource:
        sections += section(b".rsrc", rsrc_rva, len(resource), rsrc_offset, rsrc_size, 0x40000040)

    headers = _pad(dos + coff + bytes(optional) + sections, header_size)
    body = _pad(code, text_size) + (_pad(resource, rsrc_size) if resource else b"")
    return headers + body
