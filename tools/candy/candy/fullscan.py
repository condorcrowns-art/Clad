"""On-demand full-system scan — finding what is already on the machine.

Everything else in Candy watches for things *arriving*. This looks for what is
already there: an executor installed last month, a stealer that has been
running since a bad download in the spring, persistence somebody set up and
forgot about.

A scan is five passes, and none of them execute anything:

1. **Processes** — every running image, by name, path, hash and PE metadata.
2. **Loaded modules** — every DLL inside every process Candy can read, looking
   for foreign or unsigned code in places it does not belong.
3. **Persistence** — Run keys, tasks, services, Winlogon, IFEO, AppInit, LSA,
   COM hijacks: everything configured to survive a reboot.
4. **Files** — hashed, matched against the threat database, parsed as PE for a
   renamed executor, triaged for capability, checked for Mark-of-the-Web.
5. **Alternate data streams** — payloads hidden in NTFS streams, which no
   directory listing shows.

Three profiles trade time for depth. A quick scan is the high-value places in
a minute or two; a deep scan reads every fixed drive and audits every process's
modules. Every pass respects a time budget, because a scanner that has to be
killed is a scanner nobody runs twice.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from .config import Config
from .util import IS_WINDOWS, basename, expand_path, normalize_path, sha256_file, utc_stamp

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]

Progress = Callable[[str], None]

# Extensions worth opening. Everything else is skipped without being read.
EXECUTABLE_EXT = {".exe", ".dll", ".sys", ".scr", ".com", ".cpl", ".ocx", ".msi", ".jar"}
SCRIPT_EXT = {".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".hta", ".lnk"}
ARCHIVE_EXT = {".zip"}

# Directories that are large, noisy and low-yield. Skipping them is most of
# what makes a full scan finish.
SKIP_DIRS = {
    "$recycle.bin", "system volume information", "winsxs", "servicing", "assembly",
    "node_modules", ".git", ".svn", "windowsapps", "installer", "driverstore",
    "sxs", "catroot2", "softwaredistribution", "packages", "__pycache__",
    "proc", "sys", "dev", "run", "snap",
}

# Where a payload is abnormal, not merely present.
SUSPICIOUS_LOCATIONS = (
    "/appdata/local/temp/", "/appdata/roaming/", "/windows/temp/", "/temp/", "/tmp/",
    "/downloads/", "/public/", "/programdata/", "/recycle",
)

# System directories where an unsigned executable is a real anomaly.
SYSTEM_DIRS = ("c:/windows/system32/", "c:/windows/syswow64/", "c:/windows/")

PROFILES: dict[str, dict[str, Any]] = {
    "quick": {
        "description": "Processes, persistence, and the folders payloads land in",
        "extensions": EXECUTABLE_EXT | SCRIPT_EXT,
        "roots": [r"%USERPROFILE%\Downloads", r"%USERPROFILE%\Desktop",
                  r"%USERPROFILE%\AppData\Local\Temp", r"%APPDATA%",
                  r"%USERPROFILE%\AppData\Local", r"%ProgramData%",
                  r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"],
        "max_depth": 5, "modules": False, "streams": False, "triage": True,
        "max_file_bytes": 64 * 1024 * 1024,
    },
    "full": {
        "description": "Everything in quick, plus the whole user profile and Program Files",
        "extensions": EXECUTABLE_EXT | SCRIPT_EXT | ARCHIVE_EXT,
        "roots": [r"%USERPROFILE%", r"%ProgramFiles%", r"%ProgramFiles(x86)%",
                  r"%ProgramData%", r"%WINDIR%\Temp"],
        "max_depth": 10, "modules": True, "streams": True, "triage": True,
        "max_file_bytes": 128 * 1024 * 1024,
    },
    "deep": {
        "description": "Every fixed drive, every process's modules, NTFS streams",
        "extensions": EXECUTABLE_EXT | SCRIPT_EXT | ARCHIVE_EXT,
        "roots": [],                      # filled in from the drive list
        "max_depth": 24, "modules": True, "streams": True, "triage": True,
        "max_file_bytes": 256 * 1024 * 1024,
    },
}


@dataclass
class Finding:
    subject: str
    kind: str
    severity: str
    score: int
    reasons: list[str] = field(default_factory=list)
    sha256: str | None = None
    pid: int | None = None
    evidence: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"subject": self.subject, "kind": self.kind, "severity": self.severity,
                "score": self.score, "reasons": self.reasons, "sha256": self.sha256,
                "pid": self.pid, "evidence": self.evidence}


@dataclass
class ScanReport:
    profile: str
    started: str
    finished: str = ""
    seconds: float = 0.0
    findings: list[Finding] = field(default_factory=list)
    files_scanned: int = 0
    files_skipped: int = 0
    bytes_read: int = 0
    processes_scanned: int = 0
    modules_scanned: int = 0
    persistence_entries: int = 0
    streams_found: int = 0
    roots: list[str] = field(default_factory=list)
    truncated: bool = False
    errors: list[str] = field(default_factory=list)

    @property
    def by_severity(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for finding in self.findings:
            counts[finding.severity] = counts.get(finding.severity, 0) + 1
        return counts

    @property
    def worst(self) -> str:
        order = ["info", "low", "medium", "high", "critical"]
        worst = "info"
        for finding in self.findings:
            if order.index(finding.severity) > order.index(worst):
                worst = finding.severity
        return worst

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile": self.profile, "started": self.started, "finished": self.finished,
            "seconds": round(self.seconds, 1), "roots": self.roots,
            "counters": {"files_scanned": self.files_scanned,
                         "files_skipped": self.files_skipped,
                         "megabytes_read": round(self.bytes_read / 1048576, 1),
                         "processes": self.processes_scanned,
                         "modules": self.modules_scanned,
                         "persistence_entries": self.persistence_entries,
                         "alternate_streams": self.streams_found},
            "findings": [f.to_dict() for f in self.findings],
            "by_severity": self.by_severity, "worst": self.worst,
            "truncated": self.truncated, "errors": self.errors,
        }


class FullScanner:
    def __init__(self, config: Config, analyzer: Any, *, signature_checker: Any = None) -> None:
        self.config = config
        self.analyzer = analyzer
        self.signature_checker = signature_checker
        self._hash_cache: dict[tuple[str, float, int], str | None] = {}

    # ------------------------------------------------------------------ run
    def scan(self, profile: str = "quick", *, roots: Iterable[str] | None = None,
             progress: Progress | None = None, time_budget: float | None = None,
             cancel: Callable[[], bool] | None = None) -> ScanReport:
        spec = PROFILES.get(profile)
        if spec is None:
            raise ValueError(f"unknown profile {profile!r}; choose from {', '.join(PROFILES)}")

        report = ScanReport(profile=profile, started=utc_stamp())
        started = time.monotonic()
        deadline = started + time_budget if time_budget else None

        def say(message: str) -> None:
            if progress:
                progress(message)

        def expired() -> bool:
            if cancel is not None and cancel():
                return True
            return deadline is not None and time.monotonic() > deadline

        # The inner passes take a single "stop now" callable so a cancel from a
        # GUI button is honoured as promptly as a time budget running out.
        stop = expired

        say("scanning running processes…")
        self._scan_processes(report, spec)

        if spec["modules"] and not expired():
            say("auditing loaded modules…")
            self._scan_modules(report, stop)

        if not expired():
            say("auditing persistence…")
            self._scan_persistence(report)

        chosen = list(roots) if roots else self._roots_for(profile, spec)
        report.roots = [str(root) for root in chosen]
        for root in chosen:
            if expired():
                report.truncated = True
                break
            say(f"scanning {root}…")
            self._scan_tree(Path(root), report, spec, stop, progress)

        if spec["streams"] and IS_WINDOWS and not expired():
            say("checking alternate data streams…")
            self._scan_streams(report, chosen, stop)

        report.seconds = time.monotonic() - started
        report.finished = utc_stamp()
        report.findings.sort(key=lambda f: -f.score)
        return report

    def _roots_for(self, profile: str, spec: dict[str, Any]) -> list[Path]:
        if profile == "deep":
            return self._fixed_drives()
        out: list[Path] = []
        for raw in spec["roots"]:
            path = expand_path(raw)
            if path.is_dir() and not any(normalize_path(path) == normalize_path(seen)
                                         for seen in out):
                out.append(path)
        if not out:
            # Off Windows (or a stripped-down box) fall back to the home tree so
            # the scan still does something demonstrable.
            home = Path.home()
            if home.is_dir():
                out.append(home)
        return out

    def _fixed_drives(self) -> list[Path]:
        if psutil is None:
            return [Path("/")]
        drives = []
        for partition in psutil.disk_partitions(all=False):
            if IS_WINDOWS and "cdrom" in (partition.opts or ""):
                continue
            path = Path(partition.mountpoint)
            if path.is_dir():
                drives.append(path)
        return drives or [Path("/")]

    # ------------------------------------------------------------ processes
    def _scan_processes(self, report: ScanReport, spec: dict[str, Any]) -> None:
        if psutil is None:
            report.errors.append("psutil is not installed; processes were not scanned")
            return
        from .procmon import collect_process_info

        for proc in psutil.process_iter():
            info = collect_process_info(proc)
            if not info.get("name"):
                continue
            report.processes_scanned += 1
            exe = info.get("exe")
            if exe:
                info["sha256"] = self._hash(Path(exe), spec["max_file_bytes"])
            for detection in self.analyzer.analyze_process(info):
                report.findings.append(Finding(
                    subject=detection.subject, kind=f"process:{detection.kind}",
                    severity=detection.severity, score=detection.score,
                    reasons=[detection.message], sha256=detection.sha256,
                    pid=detection.pid, evidence=detection.evidence))

    def _scan_modules(self, report: ScanReport, stop: Callable[[], bool]) -> None:
        """Foreign or unsigned DLLs inside any process, not just Roblox."""
        if psutil is None:
            return
        trusted_roots = ("c:/windows", "c:/program files", "c:/program files (x86)", "/usr", "/lib")
        for proc in psutil.process_iter(["pid", "name"]):
            if stop():
                report.truncated = True
                return
            try:
                name = (proc.info.get("name") or "").lower()
                maps = proc.memory_maps()
            except Exception:  # noqa: BLE001 - access denied is the common case
                continue
            for entry in maps:
                path = str(getattr(entry, "path", "") or "")
                if not path.lower().endswith((".dll", ".so")):
                    continue
                report.modules_scanned += 1
                norm = normalize_path(path)
                if any(norm.startswith(root) for root in trusted_roots):
                    continue
                if self.config.is_whitelisted(name=basename(path), path=path):
                    continue
                signed = self.signature_checker(path) if self.signature_checker else None
                if signed is True:
                    continue
                reasons = [f"module loaded in {name} from outside the system directories: {path}"]
                if signed is False:
                    reasons.append("the module is unsigned")
                report.findings.append(Finding(
                    subject=path, kind="module:foreign",
                    severity="high" if signed is False else "medium",
                    score=75 if signed is False else 45,
                    reasons=reasons, pid=proc.info.get("pid"),
                    evidence={"host": name, "signed": signed}))

    # ---------------------------------------------------------- persistence
    def _scan_persistence(self, report: ScanReport) -> None:
        from .persistence import analyze_entry, enumerate_all

        try:
            entries = enumerate_all(self.config)
        except Exception as exc:  # noqa: BLE001
            report.errors.append(f"persistence enumeration failed: {exc}")
            return
        report.persistence_entries = len(entries)
        for entry in entries:
            for detection in analyze_entry(entry, self.analyzer):
                report.findings.append(Finding(
                    subject=detection.subject, kind=f"persistence:{detection.kind}",
                    severity=detection.severity, score=detection.score,
                    reasons=[detection.message], evidence=detection.evidence))

    # ---------------------------------------------------------------- files
    def _scan_tree(self, root: Path, report: ScanReport, spec: dict[str, Any],
                   stop: Callable[[], bool], progress: Progress | None, depth: int = 0) -> None:
        if depth > spec["max_depth"]:
            return
        if stop():
            report.truncated = True
            return
        try:
            entries = list(os.scandir(root))
        except (OSError, PermissionError):
            return

        for entry in entries:
            if stop():
                report.truncated = True
                return
            try:
                if entry.is_dir(follow_symlinks=False):
                    if entry.name.lower() not in SKIP_DIRS and not entry.name.startswith("."):
                        self._scan_tree(Path(entry.path), report, spec, stop,
                                        progress, depth + 1)
                    continue
                suffix = Path(entry.name).suffix.lower()
                if suffix not in spec["extensions"]:
                    report.files_skipped += 1
                    continue
                stat = entry.stat()
                if stat.st_size > spec["max_file_bytes"] or stat.st_size == 0:
                    report.files_skipped += 1
                    continue
                report.files_scanned += 1
                report.bytes_read += stat.st_size
                if progress and report.files_scanned % 250 == 0:
                    progress(f"  {report.files_scanned} files… {entry.path[:70]}")
                self._scan_file(Path(entry.path), report, spec)
            except (OSError, PermissionError):
                report.files_skipped += 1
                continue

    def _scan_file(self, path: Path, report: ScanReport, spec: dict[str, Any]) -> None:
        digest = self._hash(path, spec["max_file_bytes"])
        findings: list[str] = []
        score = 0
        severity = "info"

        for detection in self.analyzer.analyze_file(str(path), sha256=digest, event="fullscan"):
            findings.append(detection.message)
            score += detection.score
            severity = _worse(severity, detection.severity)

        location = normalize_path(path) + "/"
        suspicious_location = any(hint in location for hint in SUSPICIOUS_LOCATIONS)
        signed = self.signature_checker(str(path)) if self.signature_checker else None

        if path.suffix.lower() in EXECUTABLE_EXT:
            if signed is False and any(location.startswith(d) for d in SYSTEM_DIRS):
                findings.append("unsigned executable inside a Windows system directory")
                score += 60
                severity = _worse(severity, "high")
            elif signed is False and suspicious_location:
                findings.append("unsigned executable in a temporary or download location")
                score += 20
                severity = _worse(severity, "low")

            if spec["triage"] and (score or suspicious_location):
                from .triage import triage

                # The checker is passed now that catalog verification
                # works. Before that it would have added an "unsigned binary"
                # point to every catalog-signed Windows file, so withholding
                # it was masking the catalog bug rather than avoiding it.
                assessment = triage(
                    path, signature_checker=self.signature_checker)
                if assessment.score >= 45:
                    findings.append(f"static triage: {assessment.verdict} — "
                                    f"{', '.join(assessment.capabilities) or 'suspicious strings'}")
                    score += assessment.score
                    severity = _worse(severity, "high" if assessment.score >= 100 else "medium")
                if assessment.exfil:
                    findings.append(f"contains an exfiltration endpoint: "
                                    f"{list(assessment.exfil)[0]}")
                    score += 45
                    severity = _worse(severity, "critical")

        origin = None
        if IS_WINDOWS:
            from .guard import read_origin

            origin = read_origin(path)
            if origin.from_internet and origin.source:
                from .phishing import analyze_url

                site = analyze_url(origin.source)
                if site.score >= 40:
                    findings.append(f"downloaded from a {site.verdict} page: {origin.source[:80]}")
                    score += site.score
                    severity = _worse(severity, "high")

        if findings:
            report.findings.append(Finding(
                subject=str(path), kind="file", severity=severity, score=score,
                reasons=findings, sha256=digest,
                evidence={"signed": signed,
                          "origin": origin.to_dict() if origin else None,
                          "size": path.stat().st_size if path.exists() else 0}))

    def _hash(self, path: Path, limit: int) -> str | None:
        try:
            stat = path.stat()
            key = (str(path).lower(), stat.st_mtime, stat.st_size)
        except OSError:
            return None
        if key in self._hash_cache:
            return self._hash_cache[key]
        digest = sha256_file(path, max_bytes=limit)
        if len(self._hash_cache) > 20000:
            self._hash_cache.clear()
        self._hash_cache[key] = digest
        return digest

    # -------------------------------------------------------------- streams
    def _scan_streams(self, report: ScanReport, roots: Iterable[Path],
                      stop: Callable[[], bool]) -> None:  # pragma: no cover - Windows only
        """Alternate data streams: a payload hidden where no listing shows it."""
        import subprocess

        for root in roots:
            if stop():
                report.truncated = True
                return
            try:
                done = subprocess.run(
                    ["powershell", "-NoProfile", "-Command",
                     f"Get-ChildItem -Path '{root}' -Recurse -File -ErrorAction SilentlyContinue "
                     f"| ForEach-Object {{ Get-Item $_.FullName -Stream * -ErrorAction "
                     f"SilentlyContinue }} | Where-Object {{ $_.Stream -ne ':$DATA' -and "
                     f"$_.Stream -ne 'Zone.Identifier' }} | Select-Object -First 100 "
                     f"FileName,Stream,Length | ConvertTo-Csv -NoTypeInformation"],
                    capture_output=True, text=True, timeout=180, check=False,
                    creationflags=0x08000000)
            except Exception as exc:  # noqa: BLE001
                report.errors.append(f"stream scan failed for {root}: {exc}")
                continue
            for line in (done.stdout or "").splitlines()[1:]:
                parts = [p.strip('"') for p in line.split('","')]
                if len(parts) < 3:
                    continue
                filename, stream, length = parts[0].lstrip('"'), parts[1], parts[2].rstrip('"')
                report.streams_found += 1
                try:
                    size = int(length)
                except ValueError:
                    size = 0
                if size < 64:
                    continue
                report.findings.append(Finding(
                    subject=f"{filename}:{stream}", kind="alternate_data_stream",
                    severity="medium", score=45,
                    reasons=[f"hidden NTFS stream of {size} bytes — no directory listing "
                             f"shows this, and payloads are stored here to stay invisible"],
                    evidence={"file": filename, "stream": stream, "size": size}))


def _worse(current: str, candidate: str) -> str:
    order = ["info", "low", "medium", "high", "critical"]
    try:
        return candidate if order.index(candidate) > order.index(current) else current
    except ValueError:
        return current


def format_report(report: ScanReport, *, limit: int = 40) -> str:
    lines = ["", "=" * 78, f"FULL SYSTEM SCAN — {report.profile}", "=" * 78,
             f"Started   : {report.started}",
             f"Duration  : {report.seconds:.1f}s"
             + ("   (TIME BUDGET REACHED — scan incomplete)" if report.truncated else ""),
             f"Roots     : {', '.join(report.roots) or 'none'}",
             f"Scanned   : {report.files_scanned} files "
             f"({report.bytes_read / 1048576:.0f} MB), "
             f"{report.processes_scanned} processes, "
             f"{report.modules_scanned} modules, "
             f"{report.persistence_entries} autostart entries",
             f"Skipped   : {report.files_skipped} files (wrong type, empty, or too large)"]
    if report.errors:
        lines.append("Errors    : " + "; ".join(report.errors[:5]))

    lines.append("")
    if not report.findings:
        lines.append("RESULT    : nothing suspicious found.")
        lines.append("")
        lines.append("That is a clean result for what this scan covers — it is not a")
        lines.append("guarantee the machine is clean. Run Microsoft Defender's full scan")
        lines.append("as well: it has kernel visibility and a signature set this does not.")
        return "\n".join(lines)

    counts = report.by_severity
    lines.append(f"RESULT    : {len(report.findings)} finding(s) — "
                 + ", ".join(f"{count} {level}" for level, count in sorted(counts.items())))
    lines.append(f"Worst     : {report.worst.upper()}")
    lines.append("")
    lines.append("-" * 78)
    for finding in report.findings[:limit]:
        lines.append(f"[{finding.severity.upper():8}] {finding.kind:26} score {finding.score}")
        lines.append(f"  {finding.subject}")
        for reason in finding.reasons[:4]:
            lines.append(f"    - {reason}")
        if finding.sha256:
            lines.append(f"    sha256: {finding.sha256}")
        lines.append("")
    if len(report.findings) > limit:
        lines.append(f"… and {len(report.findings) - limit} more (use --json for all)")
    lines.append("-" * 78)
    lines.append("Nothing was quarantined or killed. Re-run with --act to apply the")
    lines.append("configured response to findings at or above the action threshold.")
    return "\n".join(lines)
