"""Download guard — reject-by-default for anything that arrives from the internet.

Everything else in Candy is *detect then decide*. This is the opposite: a file
that arrives from the internet is treated as hostile until something positive
clears it. That inverts the usual failure mode. A brand-new executor with no
signature, no hash and no name Candy has ever seen still gets quarantined,
because "unknown" stops being a pass.

Three things make the decision possible without executing anything:

* **Mark-of-the-Web.** Windows tags every downloaded file with a
  ``Zone.Identifier`` alternate data stream recording that it came from the
  internet — and usually *which page it came from*. That gives origin
  attribution for free, and lets Candy run the source URL through the phishing
  analyser.
* **Authenticode.** A validly signed binary from a real publisher is the single
  strongest "this is not a random executor build" signal available.
* **Static triage.** What the binary is capable of, read out of it without
  running it.

The honest limit: this fires when the file *lands*, typically within a second,
not before the write completes. Blocking a write outright needs a filesystem
minifilter, which needs a signed driver. A file that runs itself in that first
second is not stopped — but a file sitting in Downloads waiting to be
double-clicked, which is every executor, is.
"""
from __future__ import annotations

import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import Config
from .drift import DriftFinding, TrustLedger, TrustVerdict
from .events import Detection
from .util import IS_WINDOWS, basename, sha256_file

# Extensions that can execute, directly or by association.
EXECUTABLE_SUFFIXES = {
    ".exe", ".dll", ".sys", ".scr", ".com", ".pif", ".msi", ".msp", ".cpl",
    ".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh",
    ".hta", ".jar", ".lnk", ".reg", ".inf", ".application", ".appref-ms",
}
ARCHIVE_SUFFIXES = {".zip", ".7z", ".rar", ".cab", ".iso", ".img"}

# URLSecurityZone values from the Zone.Identifier stream.
ZONE_NAMES = {0: "local machine", 1: "local intranet", 2: "trusted site",
              3: "internet", 4: "restricted site"}

MAX_ARCHIVE_ENTRIES = 500


@dataclass
class Origin:
    """Where a file says it came from."""

    zone_id: int | None = None
    referrer_url: str | None = None
    host_url: str | None = None

    @property
    def from_internet(self) -> bool:
        return self.zone_id is not None and self.zone_id >= 3

    @property
    def zone_name(self) -> str:
        return ZONE_NAMES.get(self.zone_id, "unknown") if self.zone_id is not None else "unknown"

    @property
    def source(self) -> str | None:
        return self.host_url or self.referrer_url

    def to_dict(self) -> dict[str, Any]:
        return {"zone": self.zone_id, "zone_name": self.zone_name,
                "host_url": self.host_url, "referrer_url": self.referrer_url}


def parse_zone_identifier(text: str) -> Origin:
    """Parse the contents of a ``Zone.Identifier`` stream.

    Split out from the file read so it is testable off Windows — the format is
    a plain INI section.
    """
    origin = Origin()
    for line in (text or "").splitlines():
        key, _, value = line.partition("=")
        key, value = key.strip().lower(), value.strip()
        if not value:
            continue
        if key == "zoneid":
            try:
                origin.zone_id = int(value)
            except ValueError:
                pass
        elif key == "referrerurl":
            origin.referrer_url = value
        elif key == "hosturl":
            origin.host_url = value
    return origin


def read_origin(path: str | Path) -> Origin:
    """Read Mark-of-the-Web for a file. Empty Origin if it has none."""
    if not IS_WINDOWS:
        return Origin()
    try:
        with open(f"{path}:Zone.Identifier", "r", encoding="utf-8", errors="replace") as handle:
            return parse_zone_identifier(handle.read(4096))
    except OSError:
        return Origin()


def strip_origin(path: str | Path) -> bool:
    """Remove Mark-of-the-Web (what "Unblock" in file properties does)."""
    if not IS_WINDOWS:
        return False
    try:
        import os

        os.remove(f"{path}:Zone.Identifier")
        return True
    except OSError:
        return False


@dataclass
class ArchiveFinding:
    entries: int = 0
    executables: list[str] = field(default_factory=list)
    matched: list[str] = field(default_factory=list)
    encrypted: bool = False
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"entries": self.entries, "executables": self.executables[:20],
                "matched": self.matched[:20], "encrypted": self.encrypted,
                "error": self.error}


def inspect_archive(path: str | Path, db: Any = None) -> ArchiveFinding:
    """List what is inside a zip without extracting it.

    An executor delivered as ``roblox_mod.zip`` containing ``krnl.exe`` is the
    common shape; the archive itself matches nothing, its contents match
    everything. Only zip is readable with the standard library — 7z and rar are
    reported as opaque rather than guessed at.
    """
    finding = ArchiveFinding()
    target = Path(path)
    if target.suffix.lower() != ".zip":
        finding.error = f"{target.suffix} archives cannot be read without a third-party library"
        return finding
    try:
        with zipfile.ZipFile(target) as archive:
            names = archive.namelist()[:MAX_ARCHIVE_ENTRIES]
            finding.entries = len(names)
            for info in archive.infolist()[:MAX_ARCHIVE_ENTRIES]:
                if info.flag_bits & 0x1:
                    finding.encrypted = True
                    break
            for name in names:
                leaf = basename(name)
                if Path(leaf).suffix.lower() in EXECUTABLE_SUFFIXES:
                    finding.executables.append(name)
                if db is not None:
                    for sig in db.match_any({"file_name": leaf, "process_name": leaf}):
                        finding.matched.append(f"{name} → {sig.name}")
    except (zipfile.BadZipFile, OSError, RuntimeError) as exc:
        finding.error = f"unreadable archive: {exc}"
    return finding


@dataclass
class DownloadVerdict:
    path: str
    action: str = "allow"              # allow | quarantine | warn
    score: int = 0
    severity: str = "info"
    reasons: list[str] = field(default_factory=list)
    clearances: list[str] = field(default_factory=list)
    origin: Origin = field(default_factory=Origin)
    archive: ArchiveFinding | None = None
    sha256: str | None = None
    drift: DriftFinding | None = None
    trust: TrustVerdict | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"path": self.path, "action": self.action, "score": self.score,
                "severity": self.severity, "reasons": self.reasons,
                "clearances": self.clearances, "origin": self.origin.to_dict(),
                "archive": self.archive.to_dict() if self.archive else None,
                "sha256": self.sha256,
                "drift": self.drift.to_dict() if self.drift else None,
                "trust": self.trust.to_dict() if self.trust else None}

    def summary(self) -> str:
        verb = {"quarantine": "REJECTED", "warn": "FLAGGED", "allow": "allowed"}[self.action]
        why = "; ".join(self.reasons) or "; ".join(self.clearances) or "no findings"
        return f"{verb}: {basename(self.path)} — {why}"


class DownloadGuard:
    """Applies the reject-by-default policy to files as they arrive.

    Policies:

    * ``off`` — no gating; the rest of Candy still detects normally.
    * ``balanced`` — reject known-bad, unsigned internet executables that also
      show risky capability, and archives containing known executors.
    * ``fortress`` — reject *every* unsigned executable that came from the
      internet, regardless of what it appears to do. Unknown is not a pass.
    """

    def __init__(self, config: Config, analyzer: Any, responder: Any = None,
                 signature_checker: Any = None) -> None:
        self.config = config
        self.analyzer = analyzer
        self.responder = responder
        self.signature_checker = signature_checker
        # Trust is pinned to a build, not to a name. See candy/drift.py.
        self.ledger = TrustLedger(config, signature_checker=signature_checker)
        self.assessed = 0
        self.rejected = 0

    @property
    def policy(self) -> str:
        return str(self.config.get("download_guard.policy", "balanced")).lower()

    def _triage(self, target: Path, *, is_executable: bool):
        """Static triage, once per assessment, or None when it does not apply."""
        if not is_executable or not self.config.get("download_guard.triage", True):
            return None
        from .triage import triage as run_triage

        try:
            return run_triage(target,
                              signature_checker=self.signature_checker)
        except Exception:  # noqa: BLE001 - a triage failure is not a verdict
            return None

    # ------------------------------------------------------------- assess
    def assess(self, path: str | Path) -> DownloadVerdict:
        """Judge one file. Pure decision — takes no action."""
        target = Path(path)
        verdict = DownloadVerdict(path=str(target))
        suffix = target.suffix.lower()
        verdict.origin = read_origin(target)

        if not target.is_file():
            verdict.reasons.append("file no longer exists")
            return verdict

        name = target.name
        verdict.sha256 = sha256_file(target, max_bytes=None)
        is_executable = suffix in EXECUTABLE_SUFFIXES
        is_archive = suffix in ARCHIVE_SUFFIXES

        # Static triage is computed once and reused: the trust ruling needs the
        # capability profile, and so does the scoring below.
        triage_report = self._triage(target, is_executable=is_executable)
        capabilities = list((triage_report.capabilities or {}).keys()) if triage_report else []
        exfil_channels = list((triage_report.exfil or {}).keys()) if triage_report else []

        # --- trust -----------------------------------------------------
        # A whitelist entry that names the exact bytes cannot be inherited. A
        # path can be reoccupied by a later build. A *name* is only a label —
        # the file that takes it next week has never been seen before, which is
        # exactly the shape of an exit-scam update. Each is judged differently.
        basis = self.config.whitelist_match(name=name, path=str(target),
                                            sha256=verdict.sha256)
        if basis:
            trust = self.ledger.evaluate(
                target, verdict.sha256, basis=basis, capabilities=capabilities,
                exfil=exfil_channels,
                signed=self.signature_checker(str(target)) if self.signature_checker else None)
            verdict.trust = trust
            verdict.drift = trust.drift
            if trust.cleared:
                verdict.clearances.extend(trust.clearances)
                return verdict
            verdict.score += trust.score
            verdict.reasons.extend(trust.reasons)

        # --- origin ---------------------------------------------------
        if verdict.origin.from_internet:
            verdict.score += 15
            source = verdict.origin.source
            verdict.reasons.append(
                f"downloaded from the {verdict.origin.zone_name}"
                + (f" ({source[:80]})" if source else ""))
            if source:
                from .phishing import analyze_url

                site = analyze_url(source)
                if site.score >= 40:
                    verdict.score += site.score
                    verdict.reasons.append(f"the page it came from looks like {site.verdict}: "
                                           f"{site.findings[0]['detail'] if site.findings else ''}")

        # --- known threats --------------------------------------------
        for detection in self.analyzer.analyze_file(str(target), sha256=verdict.sha256,
                                                    event="download"):
            verdict.score += detection.score
            verdict.reasons.append(detection.message)

        # --- signature ------------------------------------------------
        signed = self.signature_checker(str(target)) if self.signature_checker else None
        if is_executable:
            if signed is True:
                verdict.clearances.append("validly signed by a trusted publisher")
                verdict.score -= 40
            elif signed is False:
                verdict.score += 25
                verdict.reasons.append("unsigned executable")
            else:
                verdict.score += 10
                verdict.reasons.append("signature could not be verified")

        # --- capability -----------------------------------------------
        if triage_report is not None:
            report = triage_report
            if report.score >= 45:
                verdict.score += report.score
                verdict.reasons.append(
                    f"static triage says {report.verdict}: "
                    f"{', '.join(report.capabilities) or 'suspicious strings'}")
            elif report.packed:
                verdict.score += 15
                verdict.reasons.append("packed or encrypted code section")

        # --- archives -------------------------------------------------
        if is_archive:
            verdict.archive = inspect_archive(target, self.analyzer.db)
            if verdict.archive.matched:
                verdict.score += 80
                verdict.reasons.append(
                    f"archive contains a known threat: {verdict.archive.matched[0]}")
            elif verdict.archive.executables and verdict.origin.from_internet:
                verdict.score += 30
                verdict.reasons.append(
                    f"downloaded archive contains {len(verdict.archive.executables)} "
                    f"executable file(s): {', '.join(verdict.archive.executables[:3])}")
            if verdict.archive.encrypted:
                verdict.score += 25
                verdict.reasons.append(
                    "password-protected archive — the standard way to hide a payload "
                    "from every scanner including this one")

        verdict.score = max(verdict.score, 0)
        verdict.severity = ("critical" if verdict.score >= 100 else
                            "high" if verdict.score >= 60 else
                            "medium" if verdict.score >= 30 else
                            "low" if verdict.score else "info")
        verdict.action = self._decide(verdict, is_executable=is_executable, signed=signed)
        return verdict

    def _decide(self, verdict: DownloadVerdict, *, is_executable: bool,
                signed: bool | None) -> str:
        policy = self.policy
        if policy == "off":
            return "allow"

        threshold = int(self.config.get("download_guard.reject_score", 60))
        if verdict.score >= threshold:
            return "quarantine"

        if policy == "fortress" and is_executable and verdict.origin.from_internet:
            if signed is True:
                return "allow"
            # This is the whole point of fortress mode: unknown is not a pass.
            verdict.reasons.append(
                "fortress policy: internet-downloaded executables must be validly "
                "signed to be allowed to stay")
            verdict.severity = max(verdict.severity, "high", key=_severity_rank)
            return "quarantine"

        return "warn" if verdict.score >= 30 else "allow"

    # -------------------------------------------------------------- enforce
    def handle(self, path: str | Path) -> tuple[DownloadVerdict, list[str]]:
        """Assess and, if the policy says so, quarantine. Returns actions taken."""
        verdict = self.assess(path)
        self.assessed += 1
        actions: list[str] = []
        if verdict.action == "quarantine" and self.responder is not None:
            result = self.responder.quarantine(verdict.path, forced=True,
                                               detection=self.to_detection(verdict))
            actions.append(str(result))
            if result.ok:
                self.rejected += 1
        return verdict, actions

    def to_detection(self, verdict: DownloadVerdict) -> Detection:
        return Detection(
            source="download", kind=f"download_{verdict.action}",
            subject=verdict.path,
            message=verdict.summary(),
            severity=verdict.severity if verdict.action != "allow" else "info",
            path=verdict.path, sha256=verdict.sha256,
            remote=verdict.origin.source,
            signature_id=f"guard.{verdict.action}",
            evidence=verdict.to_dict(),
        )


_SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]


def _severity_rank(value: str) -> int:
    return _SEVERITY_ORDER.index(value) if value in _SEVERITY_ORDER else 0


def looks_executable(name: str) -> bool:
    return Path(basename(name)).suffix.lower() in EXECUTABLE_SUFFIXES


def double_extension(name: str) -> str | None:
    """``invoice.pdf.exe`` → the disguise it is using."""
    match = re.search(r"\.(txt|jpe?g|png|gif|pdf|docx?|xlsx?|mp[34]|lua|json|csv)"
                      r"\.(exe|scr|bat|cmd|pif|com|vbs|js|jar)$", basename(name), re.I)
    return f"{match.group(1)} → {match.group(2)}" if match else None
