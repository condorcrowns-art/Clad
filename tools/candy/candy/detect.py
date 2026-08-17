"""The detection core: turn observations into scored detections.

Everything here is pure logic over plain dictionaries — no psutil, no Windows
APIs — so it can be unit-tested on any platform and reasoned about without a
VM. The monitors do the OS-specific collecting and hand dictionaries in.
"""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from .config import Config
from .events import Detection, score_for, severity_for
from .threatdb import ThreatDB
from .util import basename, is_within, normalize_path

# Names that only ever belong to real Roblox binaries. Anything using one of
# these names from outside a Roblox install directory is masquerading.
ROBLOX_IMAGE_NAMES = {
    "robloxplayerbeta.exe",
    "robloxstudiobeta.exe",
    "robloxplayerlauncher.exe",
    "robloxstudiolauncher.exe",
    "robloxcrashhandler.exe",
}

# Directories that are normal for user downloads but abnormal as a *runtime*
# location for a long-lived process.
LOW_TRUST_DIR_HINTS = ("/temp/", "/downloads/", "/appdata/local/temp/", "/tmp/", "/public/")

SCRIPT_HOSTS = {"powershell.exe", "pwsh.exe", "cmd.exe", "wscript.exe", "cscript.exe", "mshta.exe", "rundll32.exe"}


@dataclass
class Verdict:
    """Running total for one subject (a process image, a file, a remote host)."""

    subject: str
    score: int = 0
    severity: str = "info"
    detections: list[Detection] = field(default_factory=list)
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    acted: bool = False
    reasons: set[str] = field(default_factory=set)

    def add(self, detection: Detection) -> None:
        self.detections.append(detection)
        self.score = min(self.score + detection.score, 1000)
        self.severity = severity_for(self.score)
        self.last_seen = time.time()
        self.reasons.add(detection.signature_id or detection.kind)


class Aggregator:
    """Collects detections per subject and answers "should we act?".

    Repeat hits from the *same* signature on the same subject are counted once;
    three different weak signals are what should add up, not one signal firing
    every polling cycle.
    """

    def __init__(self, action_threshold: int = 100) -> None:
        self.action_threshold = action_threshold
        self._verdicts: dict[str, Verdict] = {}
        self._lock = threading.Lock()

    def add(self, detection: Detection) -> tuple[Verdict, bool]:
        """Record a detection. Returns ``(verdict, is_new_signal)``."""
        key = normalize_path(detection.subject) or detection.subject
        dedupe_key = f"{detection.kind}:{detection.signature_id or detection.message}"
        with self._lock:
            verdict = self._verdicts.setdefault(key, Verdict(subject=detection.subject))
            if dedupe_key in verdict.reasons:
                verdict.last_seen = time.time()
                return verdict, False
            verdict.reasons.add(dedupe_key)
            verdict.detections.append(detection)
            verdict.score = min(verdict.score + detection.score, 1000)
            verdict.severity = severity_for(verdict.score)
            verdict.last_seen = time.time()
            return verdict, True

    def should_act(self, subject: str) -> bool:
        key = normalize_path(subject) or subject
        with self._lock:
            verdict = self._verdicts.get(key)
            if verdict is None or verdict.acted:
                return False
            return verdict.score >= self.action_threshold

    def mark_acted(self, subject: str) -> None:
        key = normalize_path(subject) or subject
        with self._lock:
            if key in self._verdicts:
                self._verdicts[key].acted = True

    def get(self, subject: str) -> Verdict | None:
        with self._lock:
            return self._verdicts.get(normalize_path(subject) or subject)

    def all(self) -> list[Verdict]:
        with self._lock:
            return sorted(self._verdicts.values(), key=lambda v: (-v.score, -v.last_seen))

    def reset(self) -> None:
        with self._lock:
            self._verdicts.clear()


class Analyzer:
    """Applies the threat database and heuristics to observations."""

    def __init__(self, config: Config, db: ThreatDB, *,
                 signature_checker: Callable[[str], bool | None] | None = None) -> None:
        self.config = config
        self.db = db
        # Injected so the Authenticode check stays a Windows detail; returns
        # True (signed & trusted), False (unsigned/untrusted) or None (unknown).
        self.signature_checker = signature_checker

    # ------------------------------------------------------------- process
    def analyze_process(self, info: dict[str, Any]) -> list[Detection]:
        name = (info.get("name") or "").strip()
        exe = info.get("exe") or ""
        cmdline = info.get("cmdline") or ""
        pid = info.get("pid")
        sha256 = info.get("sha256")
        subject = exe or name or f"pid:{pid}"

        if self.config.is_whitelisted(name=name, path=exe, sha256=sha256):
            return []

        out: list[Detection] = []

        def emit(kind: str, message: str, severity: str, **extra: Any) -> None:
            out.append(Detection(
                source="process", kind=kind, subject=subject, message=message,
                severity=severity, pid=pid, process_name=name, path=exe or None,
                sha256=sha256, **extra,
            ))

        reason = self.config.user_blacklist_hit(name=name, path=exe, sha256=sha256)
        if reason:
            emit("user_blacklist", f"Blocked by your own list — {reason}.", "critical")

        for sig in self.db.match_any({
            "process_name": name,
            "process_path": exe,
            "cmdline": cmdline,
        }):
            emit(
                f"signature:{sig.target}",
                f"Matches known threat '{sig.name}' ({sig.description or sig.category}).",
                sig.severity,
                signature_id=sig.id,
                evidence={"pattern": sig.pattern, "target": sig.target},
            )

        info_hash = self.db.hash_info(sha256)
        if info_hash:
            emit(
                "known_hash",
                f"File hash is a known threat: {info_hash.get('name', 'unnamed entry')}.",
                str(info_hash.get("severity", "high")),
                signature_id=f"hash:{(sha256 or '')[:16]}",
            )

        out.extend(self._masquerade_checks(info, emit))
        out.extend(self._context_checks(info, emit))
        if exe and name:
            # Same look-inside-the-binary check as for files: catches an
            # executor that was renamed before being launched.
            self.inspect_pe(exe, name, emit)
        return out

    def _masquerade_checks(self, info: dict[str, Any], emit) -> list[Detection]:
        """Real Roblox binaries live in the Roblox install tree. Nothing else
        may use their names — that is a deliberate deception, not a heuristic
        guess, so it scores high."""
        name = (info.get("name") or "").lower()
        exe = info.get("exe") or ""
        if name in ROBLOX_IMAGE_NAMES and exe:
            trusted = any(
                is_within(exe, root)
                for root in ("c:/program files/roblox", "c:/program files (x86)/roblox")
            ) or "/roblox/versions/" in normalize_path(exe)
            if not trusted:
                emit(
                    "masquerade",
                    f"Process is named '{name}' but runs from {exe}, not a Roblox install directory.",
                    "high",
                    signature_id="heuristic.masquerade",
                )
        return []

    def _context_checks(self, info: dict[str, Any], emit) -> list[Detection]:
        exe = info.get("exe") or ""
        parent = (info.get("parent_name") or "").lower()
        name = (info.get("name") or "").lower()
        norm = normalize_path(exe)

        if exe and any(hint in norm + "/" for hint in LOW_TRUST_DIR_HINTS):
            signed = self.signature_checker(exe) if self.signature_checker else None
            if signed is False:
                emit(
                    "unsigned_low_trust",
                    "Unsigned executable running from a temporary/download folder.",
                    "medium",
                    signature_id="heuristic.unsigned_low_trust",
                )
            elif signed is None:
                emit(
                    "low_trust_dir",
                    "Executable is running from a temporary/download folder.",
                    "low",
                    signature_id="heuristic.low_trust_dir",
                )

        if parent in ROBLOX_IMAGE_NAMES and name not in ROBLOX_IMAGE_NAMES:
            # Roblox does spawn its own crash handler; anything else being
            # launched *by* the game client is worth a look.
            emit(
                "roblox_child",
                f"Process was launched by the Roblox client ({parent}).",
                "medium",
                signature_id="heuristic.roblox_child",
            )

        if parent in SCRIPT_HOSTS and name not in SCRIPT_HOSTS and norm and any(
            hint in norm + "/" for hint in LOW_TRUST_DIR_HINTS
        ):
            emit(
                "script_spawned",
                f"Executable in a temporary folder was launched by {parent}.",
                "medium",
                signature_id="heuristic.script_spawned",
            )
        return []

    # ---------------------------------------------------------------- file
    def analyze_file(self, path: str, *, sha256: str | None = None,
                     event: str = "created") -> list[Detection]:
        name = basename(path)
        if self.config.is_whitelisted(name=name, path=path, sha256=sha256):
            return []

        out: list[Detection] = []

        def emit(kind: str, message: str, severity: str, **extra: Any) -> None:
            evidence = {"event": event, **extra.pop("evidence", {})}
            out.append(Detection(
                source="file", kind=kind, subject=path, message=message, severity=severity,
                path=path, sha256=sha256, evidence=evidence, **extra,
            ))

        reason = self.config.user_blacklist_hit(name=name, path=path, sha256=sha256)
        if reason:
            emit("user_blacklist", f"Blocked by your own list — {reason}.", "critical")

        # process_name signatures are matched against the file name too: an
        # executor's exe has the same name sitting on disk as it does running,
        # and catching it at download time is the whole point of the watcher.
        for sig in self.db.match_any({"file_name": name, "file_path": path,
                                      "process_name": name}):
            emit(
                f"signature:{sig.target}",
                f"File matches known threat '{sig.name}' ({sig.description or sig.category}).",
                sig.severity,
                signature_id=sig.id,
                evidence={"pattern": sig.pattern, "event": event},
            )

        info_hash = self.db.hash_info(sha256)
        if info_hash:
            emit(
                "known_hash",
                f"File hash is a known threat: {info_hash.get('name', 'unnamed entry')}.",
                str(info_hash.get("severity", "high")),
                signature_id=f"hash:{(sha256 or '')[:16]}",
            )
        self.inspect_pe(path, name, emit)
        return out

    # ------------------------------------------------------------------ PE
    def inspect_pe(self, path: str, name: str, emit) -> None:
        """Look inside a Windows binary for what its file name hides.

        The high-value case: a file renamed to something innocent whose own
        version resource still declares it is an executor.
        """
        if not self.config.get("pe.inspect", True):
            return
        if not name.lower().endswith((".exe", ".dll", ".sys", ".scr")):
            return
        try:
            if not Path(path).is_file():
                return
        except OSError:
            return

        from . import pe as pe_module

        info = pe_module.inspect_cached(path)
        if info is None or not info.is_pe:
            return

        declared = info.renamed_from(name)
        if declared:
            # Does the *declared* name match a known executor? That is a rename
            # to hide a specific product, not a build-system artefact.
            hits = self.db.match_any({"process_name": declared, "file_name": declared})
            if hits:
                emit(
                    "renamed_threat",
                    (f"File is named '{name}' but its own version resource says it is "
                     f"'{declared}' — a renamed '{hits[0].name}'."),
                    "critical",
                    signature_id=f"pe.renamed:{hits[0].id}",
                    evidence={"original_filename": declared, "matched": hits[0].id,
                              "company": info.company, "product": info.product},
                )
            else:
                emit(
                    "renamed_binary",
                    (f"File is named '{name}' but declares its original name as "
                     f"'{declared}'. Renaming is how signature checks get dodged."),
                    "medium",
                    signature_id="pe.renamed",
                    evidence={"original_filename": declared, "company": info.company},
                )

        for field_name, value in (("company", info.company), ("product", info.product)):
            for sig in self.db.match_any({"file_name": value or ""}):
                emit(
                    "pe_metadata",
                    f"Embedded {field_name} '{value}' matches known threat '{sig.name}'.",
                    sig.severity,
                    signature_id=f"pe.{field_name}:{sig.id}",
                    evidence={field_name: value},
                )

        if info.looks_packed:
            emit(
                "packed_binary",
                (f"Executable code is packed or encrypted (entropy "
                 f"{info.max_code_entropy:.2f}/8.00). Common for crypted loaders — and "
                 f"for legitimate installers and protected commercial software."),
                "low",
                signature_id="pe.packed",
                evidence={"entropy": round(info.max_code_entropy, 2)},
            )
        elif not info.has_version_info and name.lower().endswith(".exe"):
            emit(
                "no_version_info",
                "Executable carries no version information — unusual for released software.",
                "info",
                signature_id="pe.no_version_info",
            )

    # ------------------------------------------------------------- network
    def analyze_connection(self, conn: dict[str, Any]) -> list[Detection]:
        remote_ip = conn.get("remote_ip") or ""
        remote_port = conn.get("remote_port")
        local_port = conn.get("local_port")
        name = conn.get("process_name") or ""
        pid = conn.get("pid")
        exe = conn.get("exe") or ""

        if not remote_ip or self.config.is_ip_whitelisted(remote_ip):
            return []
        if self.config.is_whitelisted(name=name, path=exe):
            return []

        out: list[Detection] = []
        subject = remote_ip

        def emit(kind: str, message: str, severity: str, **extra: Any) -> None:
            out.append(Detection(
                source="network", kind=kind, subject=subject, message=message, severity=severity,
                pid=pid, process_name=name or None, path=exe or None,
                remote=f"{remote_ip}:{remote_port}", **extra,
            ))

        if self.config.ip_blacklisted(remote_ip):
            emit("user_blacklist", f"Connection to {remote_ip} — blocked by your own list.", "critical")

        endpoint = self.db.endpoint_info(remote_ip)
        if endpoint:
            emit(
                "known_endpoint",
                f"Connection to known malicious endpoint {remote_ip}: {endpoint.get('note', 'listed in threat database')}.",
                str(endpoint.get("severity", "high")),
                signature_id=f"endpoint:{remote_ip}",
            )

        for sig in self.db.match_any({"remote_host": conn.get("remote_host") or remote_ip}):
            emit(
                "signature:remote_host",
                f"Connection matches known threat infrastructure '{sig.name}'.",
                sig.severity,
                signature_id=sig.id,
            )

        suspicious_ports = set(self.config.get("network.suspicious_local_ports", []))
        if local_port in suspicious_ports and conn.get("status") == "LISTEN":
            emit(
                "listening_port",
                f"{name or 'A process'} is listening on port {local_port}, commonly used by executor loaders.",
                "low",
                signature_id="heuristic.listen_port",
            )
        return out


def flatten(detections: Iterable[Iterable[Detection]]) -> list[Detection]:
    return [item for group in detections for item in group]


def total_score(detections: Iterable[Detection]) -> int:
    return sum(d.score or score_for(d.severity) for d in detections)
