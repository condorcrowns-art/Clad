"""Append-only, hash-chained forensic log.

Every record embeds the SHA-256 of the previous record, so deleting or editing
a line anywhere in the file breaks the chain from that point on and
``verify_chain`` reports exactly where. This does not *prevent* tampering — a
local attacker can rewrite the whole file — but it makes silent, partial
tampering (the interesting case: malware snipping the lines about itself)
detectable.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Iterator

from .util import ensure_dir, sha256_bytes, utc_stamp

GENESIS = "0" * 64


class EventLog:
    def __init__(self, directory: Path, name: str = "candy.jsonl", *,
                 max_bytes: int = 10 * 1024 * 1024, keep: int = 5, hash_chain: bool = True) -> None:
        self.dir = ensure_dir(Path(directory))
        self.path = self.dir / name
        self.max_bytes = max_bytes
        self.keep = keep
        self.hash_chain = hash_chain
        self._lock = threading.Lock()
        self._prev = self._load_tail_hash()

    def _load_tail_hash(self) -> str:
        """Resume the chain from the last record so restarts stay verifiable."""
        if not self.path.exists():
            return GENESIS
        last = None
        try:
            with self.path.open("rb") as handle:
                for raw in handle:
                    stripped = raw.strip()
                    if stripped:
                        last = stripped
        except OSError:
            return GENESIS
        if not last:
            return GENESIS
        return sha256_bytes(last)

    def write(self, record: dict[str, Any]) -> dict[str, Any]:
        """Append one record. Returns the stored record (with chain fields)."""
        entry = dict(record)
        entry.setdefault("ts", utc_stamp())
        with self._lock:
            # Rotate *before* stamping the chain field: rotation starts a fresh
            # chain, and a record written with the old file's hash would fail
            # verification as the first line of the new file.
            draft = json.dumps(entry, sort_keys=True, separators=(",", ":"), default=str)
            self._rotate_if_needed(len(draft.encode("utf-8")) + 80)
            if self.hash_chain:
                entry["prev"] = self._prev
            line = json.dumps(entry, sort_keys=True, separators=(",", ":"), default=str)
            payload = line.encode("utf-8")
            with self.path.open("ab") as handle:
                handle.write(payload + b"\n")
            if self.hash_chain:
                self._prev = sha256_bytes(payload)
        return entry

    def _rotate_if_needed(self, incoming: int) -> None:
        try:
            size = self.path.stat().st_size
        except OSError:
            return
        if size + incoming <= self.max_bytes:
            return
        # Shift candy.jsonl.N -> N+1, dropping the oldest.
        for index in range(self.keep - 1, 0, -1):
            src = self.path.with_suffix(self.path.suffix + f".{index}")
            dst = self.path.with_suffix(self.path.suffix + f".{index + 1}")
            if src.exists():
                src.replace(dst)
        self.path.replace(self.path.with_suffix(self.path.suffix + ".1"))
        # Each rotated file starts a fresh chain; the rotation itself is logged
        # so a reader knows the break is legitimate.
        self._prev = GENESIS

    def read(self, limit: int | None = None) -> list[dict[str, Any]]:
        records = list(iter_records(self.path))
        return records[-limit:] if limit else records


def iter_records(path: Path) -> Iterator[dict[str, Any]]:
    if not Path(path).exists():
        return
    with Path(path).open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                yield {"ts": "?", "event": "corrupt_record", "raw": line[:200]}


def verify_chain(path: Path) -> tuple[bool, int, str]:
    """Verify a log's hash chain.

    Returns ``(ok, line_number, message)``. ``line_number`` is 1-based and
    points at the first record that does not match its predecessor.
    """
    p = Path(path)
    if not p.exists():
        return False, 0, "log file does not exist"
    prev = GENESIS
    count = 0
    with p.open("rb") as handle:
        for index, raw in enumerate(handle, start=1):
            stripped = raw.strip()
            if not stripped:
                continue
            count += 1
            try:
                record = json.loads(stripped)
            except json.JSONDecodeError:
                return False, index, "record is not valid JSON"
            if "prev" not in record:
                return False, index, "record is missing the chain field"
            if record["prev"] != prev:
                return False, index, (
                    f"chain broken: record claims prev={record['prev'][:12]}… "
                    f"but previous record hashes to {prev[:12]}…"
                )
            prev = sha256_bytes(stripped)
    return True, count, f"chain intact across {count} records"
