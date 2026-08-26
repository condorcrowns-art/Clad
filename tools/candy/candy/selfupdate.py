"""Self-update — and why it is off until you configure it.

Candy can update its threat database. It cannot update itself, which is a real
gap: a security tool that ships a bug has no way to fix it on the machines
that already have it.

This module is the mechanism. It is deliberately **not** wired to any URL,
because there is no release feed to point it at yet and inventing one would be
worse than leaving it unconfigured — a self-updater aimed at a domain nobody
owns is a self-updater aimed at whoever registers it first.

The rules it enforces when it *is* configured:

* **HTTPS only.** A plain-HTTP update channel is a remote-code-execution
  feature with extra steps.
* **Post-quantum signature required.** The manifest must carry a valid LMS
  signature (RFC 8554) from the key in ``pqsign.py``, or nothing is downloaded.
  An unsigned update is refused even if the transport was fine, because TLS
  authenticates the server and not the file.
* **Hash pinned.** The manifest names the SHA-256 of the payload; a mismatch
  aborts before anything is written anywhere executable.
* **Downgrades refused** unless explicitly allowed. Rolling a machine back to
  a version with a known hole is a classic way to re-open one.
* **Staged, never live.** The payload lands in a staging folder and is only
  swapped in by an explicit apply step. Nothing here overwrites a running
  binary behind the user's back.

An update that fails any check is not "applied with a warning". It is refused,
loudly, and the current version keeps running.
"""
from __future__ import annotations

import json
import ssl
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .config import Config
from .util import sha256_file, utc_stamp

USER_AGENT = "Candy-Updater/1"
MAX_MANIFEST_BYTES = 256 * 1024
MAX_PAYLOAD_BYTES = 200 * 1024 * 1024


@dataclass
class UpdateInfo:
    version: str = ""
    url: str = ""
    sha256: str = ""
    notes: str = ""
    released: str = ""
    minimum: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class UpdateResult:
    ok: bool
    status: str                      # up-to-date | available | staged | refused | error
    detail: str = ""
    info: UpdateInfo | None = None
    staged_path: str = ""
    checks: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "status": self.status, "detail": self.detail,
                "staged_path": self.staged_path, "checks": self.checks,
                "info": self.info.to_dict() if self.info else None}

    def __str__(self) -> str:
        return f"[{self.status}] {self.detail}"


def parse_version(value: str) -> tuple[int, ...]:
    """'1.12.3' -> (1, 12, 3). Unparseable parts become 0 rather than raising."""
    parts: list[int] = []
    for chunk in str(value or "").strip().lstrip("vV").split("."):
        digits = "".join(ch for ch in chunk if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    return tuple(parts) or (0,)


def is_newer(candidate: str, current: str) -> bool:
    return parse_version(candidate) > parse_version(current)


def parse_manifest(raw: str | bytes) -> UpdateInfo | None:
    """Read a release manifest. Returns None if it is not one."""
    try:
        data = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    payload = data.get("update") if isinstance(data.get("update"), dict) else data
    version = str(payload.get("version") or "").strip()
    url = str(payload.get("url") or "").strip()
    if not version or not url:
        return None
    return UpdateInfo(
        version=version, url=url,
        sha256=str(payload.get("sha256") or "").strip().lower(),
        notes=str(payload.get("notes") or ""),
        released=str(payload.get("released") or ""),
        minimum=str(payload.get("minimum") or ""))


class Updater:
    """Checks for, verifies and stages a new Candy build."""

    def __init__(self, config: Config, current_version: str, log: Any = None) -> None:
        self.config = config
        self.current_version = current_version
        self.log = log

    @property
    def feed_url(self) -> str:
        return str(self.config.get("updates.self_update_url") or "").strip()

    @property
    def staging_dir(self) -> Path:
        return self.config.data_dir() / "staged-update"

    def status(self) -> dict[str, Any]:
        staged = sorted(str(p) for p in self.staging_dir.glob("*")) \
            if self.staging_dir.is_dir() else []
        return {
            "current_version": self.current_version,
            "configured": bool(self.feed_url),
            "feed_url": self.feed_url or "(not configured)",
            "require_signature": bool(self.config.get("updates.require_self_signature", True)),
            "allow_downgrade": bool(self.config.get("updates.allow_downgrade", False)),
            "staged": staged,
        }

    # ----------------------------------------------------------------- check
    def check(self) -> UpdateResult:
        """Fetch and verify the manifest. Downloads no payload."""
        url = self.feed_url
        if not url:
            return UpdateResult(
                False, "error",
                "No self-update feed is configured. Set updates.self_update_url to an "
                "HTTPS manifest you control, and updates.signing_key to the public LMS "
                "key that signs it. Candy ships with neither, on purpose — a "
                "self-updater pointed at a domain nobody owns belongs to whoever "
                "registers it.")
        if not url.lower().startswith("https://"):
            return UpdateResult(False, "refused",
                                "the update feed must be HTTPS; refusing to check it")

        try:
            raw = _fetch(url, MAX_MANIFEST_BYTES)
        except Exception as exc:  # noqa: BLE001
            return UpdateResult(False, "error", f"could not reach the update feed: {exc}")

        checks: list[str] = ["transport: HTTPS"]
        if self.config.get("updates.require_self_signature", True):
            ok, detail = self._verify_signature(raw)
            checks.append(f"signature: {detail}")
            if not ok:
                return UpdateResult(False, "refused",
                                    f"the release manifest is not validly signed ({detail}). "
                                    f"Refusing it — TLS authenticates the server, not the file.",
                                    checks=checks)

        info = parse_manifest(raw)
        if info is None:
            return UpdateResult(False, "error", "the update feed is not a release manifest",
                                checks=checks)
        checks.append(f"manifest: version {info.version}")

        if not info.url.lower().startswith("https://"):
            return UpdateResult(False, "refused",
                                "the payload URL is not HTTPS; refusing it",
                                info=info, checks=checks)
        if not info.sha256 or len(info.sha256) != 64:
            return UpdateResult(False, "refused",
                                "the manifest does not pin a SHA-256 for the payload",
                                info=info, checks=checks)

        if not is_newer(info.version, self.current_version):
            if not self.config.get("updates.allow_downgrade", False):
                return UpdateResult(
                    True, "up-to-date",
                    f"running {self.current_version}; the feed offers {info.version}",
                    info=info, checks=checks)
        if info.minimum and not is_newer(self.current_version, info.minimum) \
                and parse_version(self.current_version) < parse_version(info.minimum):
            checks.append(f"minimum: this build predates {info.minimum}")

        return UpdateResult(True, "available",
                            f"{info.version} is available (running {self.current_version})",
                            info=info, checks=checks)

    # ----------------------------------------------------------------- stage
    def stage(self, info: UpdateInfo | None = None) -> UpdateResult:
        """Download the payload, verify its hash, and leave it staged.

        Nothing running is touched. Applying a staged update is a separate,
        explicit step, because replacing a live security tool's own files is
        not something that should happen as a side effect of a check.
        """
        if info is None:
            result = self.check()
            if result.status != "available" or result.info is None:
                return result
            info = result.info

        self.staging_dir.mkdir(parents=True, exist_ok=True)
        target = self.staging_dir / f"candy-{info.version}.payload"
        try:
            blob = _fetch(info.url, MAX_PAYLOAD_BYTES, binary=True)
            target.write_bytes(blob)
        except Exception as exc:  # noqa: BLE001
            return UpdateResult(False, "error", f"download failed: {exc}", info=info)

        digest = sha256_file(target, max_bytes=None)
        if digest != info.sha256:
            target.unlink(missing_ok=True)
            return UpdateResult(
                False, "refused",
                f"the download does not match the hash the manifest pinned "
                f"(expected {info.sha256[:16]}…, got {(digest or '')[:16]}…). Deleted it.",
                info=info)

        (self.staging_dir / "manifest.json").write_text(
            json.dumps({"staged": utc_stamp(), **info.to_dict()}, indent=2),
            encoding="utf-8")
        self._log("update_staged", version=info.version, sha256=digest)
        return UpdateResult(
            True, "staged",
            f"{info.version} downloaded and verified into {self.staging_dir}. "
            f"Nothing has been replaced — close Candy and run the installer to apply it.",
            info=info, staged_path=str(target),
            checks=["hash: matches the signed manifest"])

    def _verify_signature(self, raw: bytes) -> tuple[bool, str]:
        try:
            from .pqsign import verify_document

            key = (self.config.get("updates.signing_key")
                   or self.config.get("updates.trusted_public_key"))
            if not key:
                return False, "no public signing key is configured"
            document = json.loads(raw.decode("utf-8"))
            return verify_document(document, str(key))
        except (ValueError, UnicodeDecodeError):
            return False, "the manifest is not readable JSON"
        except ImportError:
            return False, "the post-quantum verifier is unavailable"
        except Exception as exc:  # noqa: BLE001
            return False, f"verification error: {exc}"

    def _log(self, event: str, **fields: Any) -> None:
        if self.log is not None:
            try:
                self.log.write({"event": event, "ts": utc_stamp(), **fields})
            except Exception:  # noqa: BLE001
                pass


def _fetch(url: str, limit: int, *, binary: bool = False) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=30, context=context) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError(f"response exceeds {limit} bytes")
    return data
