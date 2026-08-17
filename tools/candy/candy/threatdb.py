"""The local threat database: signatures, hashes, and known-bad endpoints.

The database is a single JSON file so anyone can read, diff, and contribute to
it with a text editor. Updates are pulled from a plain HTTPS URL (a raw GitHub
file works), validated, and merged — there is no server to run and nothing to
pay for.
"""
from __future__ import annotations

import json
import re
import ssl
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .util import compile_pattern, ensure_dir, utc_stamp

SCHEMA_VERSION = 1

# Fields a signature may match against. Keep this list closed: an unknown
# target in a downloaded feed is dropped rather than silently ignored.
VALID_TARGETS = {
    "process_name",   # image file name, e.g. "krnl.exe"
    "process_path",   # full image path
    "cmdline",        # full command line
    "file_name",      # a file seen by the watcher
    "file_path",
    "module_name",    # DLL loaded into a protected process
    "window_title",
    "remote_host",    # hostname/IP a process connected to
}

MAX_FEED_BYTES = 8 * 1024 * 1024
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


@dataclass
class Signature:
    id: str
    name: str
    target: str
    pattern: str
    severity: str = "medium"
    description: str = ""
    category: str = "executor"
    references: list[str] = field(default_factory=list)
    _regex: Any = field(default=None, repr=False, compare=False)

    def __post_init__(self) -> None:
        self._regex = compile_pattern(self.pattern)

    def matches(self, value: str | None) -> bool:
        return bool(value) and bool(self._regex.search(str(value)))

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "target": self.target,
            "pattern": self.pattern,
            "severity": self.severity,
            "description": self.description,
            "category": self.category,
            "references": list(self.references),
        }


class ThreatDB:
    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path) if path else None
        self._lock = threading.RLock()
        self.signatures: list[Signature] = []
        self.hashes: dict[str, dict[str, Any]] = {}
        self.endpoints: dict[str, dict[str, Any]] = {}
        self.meta: dict[str, Any] = {"schema": SCHEMA_VERSION, "updated": None, "source": "builtin"}

    # ------------------------------------------------------------------ io
    @classmethod
    def load(cls, path: str | Path) -> "ThreatDB":
        db = cls(Path(path))
        if db.path and db.path.exists():
            with db.path.open("r", encoding="utf-8") as handle:
                db.ingest(json.load(handle), replace=True)
        return db

    def ingest(self, payload: dict[str, Any], *, replace: bool = False) -> dict[str, int]:
        """Merge a database payload. Returns counts of what was added.

        Invalid entries are skipped rather than aborting the whole import: a
        single malformed community signature should not block the rest of a
        feed update.
        """
        added = {"signatures": 0, "hashes": 0, "endpoints": 0, "skipped": 0}
        with self._lock:
            if replace:
                self.signatures = []
                self.hashes = {}
                self.endpoints = {}
            known_ids = {sig.id for sig in self.signatures}

            for raw in payload.get("signatures", []) or []:
                sig = _parse_signature(raw)
                if sig is None or sig.id in known_ids:
                    added["skipped"] += 1 if sig is None else 0
                    continue
                self.signatures.append(sig)
                known_ids.add(sig.id)
                added["signatures"] += 1

            for digest, info in (payload.get("hashes") or {}).items():
                key = str(digest).lower().strip()
                if not _SHA256_RE.match(key):
                    added["skipped"] += 1
                    continue
                if key not in self.hashes:
                    added["hashes"] += 1
                self.hashes[key] = info if isinstance(info, dict) else {"name": str(info)}

            for host, info in (payload.get("endpoints") or {}).items():
                key = str(host).strip().lower()
                if not key:
                    continue
                if key not in self.endpoints:
                    added["endpoints"] += 1
                self.endpoints[key] = info if isinstance(info, dict) else {"note": str(info)}

            meta = payload.get("meta")
            if isinstance(meta, dict):
                self.meta.update(meta)
        return added

    def save(self, path: str | Path | None = None) -> Path:
        target = Path(path) if path else self.path
        if target is None:
            raise ValueError("no threat database path")
        ensure_dir(target.parent)
        with self._lock:
            payload = {
                "meta": {**self.meta, "schema": SCHEMA_VERSION, "saved": utc_stamp()},
                "signatures": [sig.to_dict() for sig in self.signatures],
                "hashes": self.hashes,
                "endpoints": self.endpoints,
            }
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(target)
        self.path = target
        return target

    # -------------------------------------------------------------- queries
    def match(self, target: str, value: str | None) -> list[Signature]:
        """All signatures for ``target`` that match ``value``."""
        if not value:
            return []
        with self._lock:
            sigs = [s for s in self.signatures if s.target == target]
        return [sig for sig in sigs if sig.matches(value)]

    def match_any(self, values: dict[str, str | None]) -> list[Signature]:
        """Match a bundle of ``{target: value}`` in one pass."""
        hits: list[Signature] = []
        with self._lock:
            sigs = list(self.signatures)
        for sig in sigs:
            value = values.get(sig.target)
            if value and sig.matches(value):
                hits.append(sig)
        return hits

    def hash_info(self, sha256: str | None) -> dict[str, Any] | None:
        if not sha256:
            return None
        return self.hashes.get(sha256.lower())

    def endpoint_info(self, host: str | None) -> dict[str, Any] | None:
        if not host:
            return None
        return self.endpoints.get(host.lower())

    def stats(self) -> dict[str, Any]:
        with self._lock:
            return {
                "signatures": len(self.signatures),
                "hashes": len(self.hashes),
                "endpoints": len(self.endpoints),
                "updated": self.meta.get("updated"),
                "source": self.meta.get("source"),
            }

    # -------------------------------------------------------------- updates
    def update_from_url(self, url: str, *, timeout: int = 20,
                        trusted_public_key: str = "", require_signature: bool = False) -> dict[str, int]:
        """Fetch a feed over HTTPS and merge it.

        HTTP is refused outright — an attacker who can MITM the feed could
        otherwise whitelist themselves or blacklist ``explorer.exe``. When a
        trusted LMS public key is configured, the feed must additionally carry
        a valid post-quantum signature over its exact payload bytes, which
        makes TLS a transport detail rather than the only thing standing
        between the user and a hostile rule set.
        """
        if not url.lower().startswith("https://"):
            raise ValueError("threat feed URL must use https://")
        context = ssl.create_default_context()
        request = urllib.request.Request(url, headers={"User-Agent": "Candy/1.0"})
        with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
            raw = response.read(MAX_FEED_BYTES + 1)
        if len(raw) > MAX_FEED_BYTES:
            raise ValueError("threat feed is larger than the 8 MB limit")
        document = json.loads(raw.decode("utf-8"))

        # A signed feed is an envelope: {"payload": {...}, "signature": {...}}.
        if isinstance(document, dict) and "signature" in document and "payload" in document:
            from .pqsign import verify_document

            ok, detail = verify_document(document, trusted_public_key)
            if not ok:
                raise ValueError(f"threat feed signature rejected: {detail}")
            self.meta["signature"] = detail
            payload = document["payload"]
        elif require_signature:
            raise ValueError(
                "threat feed is unsigned and updates.require_signature is on. "
                "Sign it with: candy sign <file> --out <signed file>")
        else:
            self.meta["signature"] = "unsigned feed (no signature required)"
            payload = document

        if int(payload.get("meta", {}).get("schema", SCHEMA_VERSION)) > SCHEMA_VERSION:
            raise ValueError("threat feed uses a newer schema; update Candy first")
        result = self.ingest(payload)
        self.meta["updated"] = utc_stamp()
        self.meta["source"] = url
        if self.path:
            self.save()
        return result


def _parse_signature(raw: Any) -> Signature | None:
    if not isinstance(raw, dict):
        return None
    sig_id = str(raw.get("id") or "").strip()
    pattern = str(raw.get("pattern") or "").strip()
    target = str(raw.get("target") or "").strip()
    if not sig_id or not pattern or target not in VALID_TARGETS:
        return None
    try:
        return Signature(
            id=sig_id,
            name=str(raw.get("name") or sig_id),
            target=target,
            pattern=pattern,
            severity=str(raw.get("severity") or "medium").lower(),
            description=str(raw.get("description") or ""),
            category=str(raw.get("category") or "executor"),
            references=[str(r) for r in (raw.get("references") or [])],
        )
    except re.error:
        # A malformed regex in a community feed must not crash the update.
        return None


def make_submission(*, name: str, target: str, pattern: str, severity: str,
                    description: str, sha256: str | None = None) -> dict[str, Any]:
    """Build a signature stub a user can paste into a GitHub issue or PR."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "user-submission"
    payload: dict[str, Any] = {
        "meta": {"schema": SCHEMA_VERSION, "submitted": utc_stamp()},
        "signatures": [{
            "id": f"community.{slug}",
            "name": name,
            "target": target,
            "pattern": pattern,
            "severity": severity,
            "description": description,
            "category": "executor",
            "references": [],
        }],
    }
    if sha256 and _SHA256_RE.match(sha256.lower()):
        payload["hashes"] = {sha256.lower(): {"name": name, "severity": severity}}
    return payload


def builtin_targets() -> Iterable[str]:
    return sorted(VALID_TARGETS)
