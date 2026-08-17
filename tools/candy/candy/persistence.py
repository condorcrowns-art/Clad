"""Persistence auditing — what survives a reboot.

The executor itself is usually not the dangerous part. The stealer bundled with
it is, and a stealer that cannot survive a reboot is worth very little to
whoever wrote it. So it writes itself into one of a small number of places:
Run keys, the Startup folder, a scheduled task, a service, or one of the
Winlogon/IFEO hijacks.

That list is short and well known, which makes auditing it cheap and precise.
Enumeration is Windows-only; the scoring is pure and unit-tested everywhere.
"""
from __future__ import annotations

import re
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from .config import Config
from .detect import LOW_TRUST_DIR_HINTS, Analyzer
from .events import Detection
from .util import IS_WINDOWS, basename, normalize_path

Sink = Callable[[Detection], None]

# Registry locations that run something at logon or boot.
RUN_KEYS = [
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\RunOnce"),
    ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\Run"),
    ("HKLM", r"Software\Microsoft\Windows\CurrentVersion\RunOnce"),
    ("HKLM", r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Run"),
    ("HKCU", r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders"),
]

# Winlogon values with known-good defaults. Anything else is a hijack.
WINLOGON_KEY = r"Software\Microsoft\Windows NT\CurrentVersion\Winlogon"
WINLOGON_DEFAULTS = {
    "shell": {"explorer.exe"},
    "userinit": {"c:/windows/system32/userinit.exe", "c:/windows/system32/userinit.exe,"},
}

STARTUP_DIRS = [
    r"%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup",
    r"%ProgramData%\Microsoft\Windows\Start Menu\Programs\Startup",
]

# Security tooling that malware likes to neuter with an IFEO "debugger" value.
IFEO_SENSITIVE = {
    "taskmgr.exe", "regedit.exe", "msconfig.exe", "procexp.exe", "procexp64.exe",
    "msmpeng.exe", "mpcmdrun.exe", "candy.exe", "cmd.exe", "powershell.exe",
}

_EXE_IN_COMMAND = re.compile(r'"([^"]+?\.(?:exe|dll|scr|bat|cmd|ps1|vbs|js))"|(\S+?\.(?:exe|scr|bat|cmd|ps1|vbs|js))',
                             re.IGNORECASE)


@dataclass
class PersistenceEntry:
    """One thing configured to run automatically."""

    source: str                 # hkcu_run, startup_folder, scheduled_task, service, winlogon, ifeo
    name: str
    command: str
    location: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def image(self) -> str:
        """Best guess at the executable inside the command line."""
        return extract_image(self.command)

    def to_dict(self) -> dict[str, Any]:
        return {"source": self.source, "name": self.name, "command": self.command,
                "location": self.location, "image": self.image, **self.extra}


def extract_image(command: str) -> str:
    """Pull the executable path out of a command line.

    Handles the quoted and unquoted forms, and ignores arguments — an entry
    like `"C:\\x\\a.exe" -silent -install` must reduce to the exe.
    """
    if not command:
        return ""
    match = _EXE_IN_COMMAND.search(command)
    if not match:
        return command.strip().strip('"').split(" ")[0]
    return (match.group(1) or match.group(2) or "").strip()


def analyze_entry(entry: PersistenceEntry, analyzer: Analyzer) -> list[Detection]:
    """Score one persistence entry. Pure — no registry, no processes."""
    config, db = analyzer.config, analyzer.db
    image = entry.image
    name = basename(image) or entry.name
    if config.is_whitelisted(name=name, path=image):
        return []

    out: list[Detection] = []

    def emit(kind: str, message: str, severity: str, **extra: Any) -> None:
        evidence = {"entry": entry.to_dict(), **extra.pop("evidence", {})}
        out.append(Detection(
            source="persistence", kind=kind, subject=image or entry.name,
            message=message, severity=severity, path=image or None,
            process_name=name or None, evidence=evidence, **extra,
        ))

    reason = config.user_blacklist_hit(name=name, path=image)
    if reason:
        emit("user_blacklist", f"Autostart entry blocked by your own list — {reason}.", "critical")

    for sig in db.match_any({"process_name": name, "file_name": name,
                             "file_path": image, "process_path": image,
                             "cmdline": entry.command}):
        emit(
            f"signature:{sig.target}",
            (f"'{entry.name}' is set to run automatically ({entry.source}) and matches "
             f"known threat '{sig.name}'."),
            "critical" if sig.severity in ("high", "critical") else sig.severity,
            signature_id=f"persistence:{sig.id}",
        )

    if entry.source == "winlogon":
        emit(
            "winlogon_hijack",
            (f"Winlogon '{entry.name}' has been changed to '{entry.command}'. This runs "
             f"before anything else at logon and is a classic hijack."),
            "critical", signature_id="persistence.winlogon",
        )
    elif entry.source == "ifeo":
        target = entry.extra.get("target", "")
        emit(
            "ifeo_hijack",
            (f"An Image File Execution Options debugger is set for {target}: "
             f"'{entry.command}'. Launching {target} will run that instead."),
            "critical" if target.lower() in IFEO_SENSITIVE else "high",
            signature_id="persistence.ifeo",
        )

    normalized = normalize_path(image)
    if normalized and any(hint in normalized + "/" for hint in LOW_TRUST_DIR_HINTS):
        signed = analyzer.signature_checker(image) if analyzer.signature_checker else None
        emit(
            "autostart_from_temp",
            (f"'{entry.name}' runs at startup from a temporary or download folder "
             f"({image}). Installed software does not do this."),
            "high" if signed is False else "medium",
            signature_id="persistence.temp_path",
            evidence={"signed": signed},
        )

    if entry.command and re.search(r"-(e|ec|enc|encodedcommand)\s+[a-z0-9+/=]{40,}", entry.command, re.I):
        emit(
            "autostart_encoded",
            f"'{entry.name}' runs an encoded PowerShell command at startup.",
            "critical", signature_id="persistence.encoded",
        )
    return out


# ------------------------------------------------------------- enumeration
def enumerate_all(config: Config) -> list[PersistenceEntry]:
    """Every autostart entry we can read. Empty list off Windows."""
    if not IS_WINDOWS:
        return []
    entries: list[PersistenceEntry] = []
    entries.extend(_enumerate_run_keys())
    entries.extend(_enumerate_winlogon())
    entries.extend(_enumerate_ifeo())
    entries.extend(_enumerate_startup_folders())
    entries.extend(_enumerate_scheduled_tasks())
    entries.extend(_enumerate_services())
    return entries


def _enumerate_run_keys() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    import winreg

    roots = {"HKCU": winreg.HKEY_CURRENT_USER, "HKLM": winreg.HKEY_LOCAL_MACHINE}
    entries: list[PersistenceEntry] = []
    for root_name, subkey in RUN_KEYS:
        if "Shell Folders" in subkey:
            continue
        try:
            with winreg.OpenKey(roots[root_name], subkey) as key:
                index = 0
                while True:
                    try:
                        name, value, _ = winreg.EnumValue(key, index)
                    except OSError:
                        break
                    index += 1
                    entries.append(PersistenceEntry(
                        source=f"{root_name.lower()}_run", name=str(name),
                        command=str(value), location=f"{root_name}\\{subkey}"))
        except OSError:
            continue
    return entries


def _enumerate_winlogon() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    import winreg

    entries: list[PersistenceEntry] = []
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, WINLOGON_KEY) as key:
            for value_name, defaults in WINLOGON_DEFAULTS.items():
                try:
                    value, _ = winreg.QueryValueEx(key, value_name.capitalize())
                except OSError:
                    continue
                if normalize_path(str(value)) not in {normalize_path(d) for d in defaults}:
                    entries.append(PersistenceEntry(
                        source="winlogon", name=value_name.capitalize(),
                        command=str(value), location=f"HKLM\\{WINLOGON_KEY}"))
    except OSError:
        pass
    return entries


def _enumerate_ifeo() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    import winreg

    base = r"Software\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
    entries: list[PersistenceEntry] = []
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base) as key:
            index = 0
            while True:
                try:
                    target = winreg.EnumKey(key, index)
                except OSError:
                    break
                index += 1
                try:
                    with winreg.OpenKey(key, target) as subkey:
                        debugger, _ = winreg.QueryValueEx(subkey, "Debugger")
                except OSError:
                    continue
                entries.append(PersistenceEntry(
                    source="ifeo", name=f"IFEO:{target}", command=str(debugger),
                    location=f"HKLM\\{base}\\{target}", extra={"target": target}))
    except OSError:
        pass
    return entries


def _enumerate_startup_folders() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    from .util import expand_path

    entries: list[PersistenceEntry] = []
    for raw in STARTUP_DIRS:
        directory = expand_path(raw)
        if not directory.is_dir():
            continue
        for item in directory.iterdir():
            if item.name.lower() == "desktop.ini" or item.is_dir():
                continue
            entries.append(PersistenceEntry(
                source="startup_folder", name=item.name, command=str(item),
                location=str(directory)))
    return entries


def _run(command: list[str], timeout: int = 30) -> str | None:
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout,
                                   check=False, creationflags=0x08000000 if IS_WINDOWS else 0)
    except Exception:  # noqa: BLE001
        return None
    return completed.stdout if completed.returncode == 0 else None


def parse_schtasks_csv(text: str) -> list[PersistenceEntry]:
    """Parse `schtasks /query /fo csv /v` output.

    Split out so the parsing is testable without Windows; schtasks repeats its
    header row between sections and quotes every field.
    """
    import csv
    import io

    entries: list[PersistenceEntry] = []
    reader = csv.reader(io.StringIO(text))
    header: list[str] = []
    for row in reader:
        if not row or len(row) < 3:
            continue
        if row[0].strip().lower() in ("hostname", '"hostname"'):
            header = [column.strip().lower() for column in row]
            continue
        if not header:
            continue
        record = dict(zip(header, row))
        name = record.get("taskname", "").strip()
        action = record.get("task to run", "").strip()
        status = record.get("scheduled task state", "").strip().lower()
        if not name or not action or action.lower() in ("com handler", "n/a"):
            continue
        if status == "disabled":
            continue
        entries.append(PersistenceEntry(
            source="scheduled_task", name=name, command=action, location="Task Scheduler",
            extra={"run_as": record.get("run as user", ""), "trigger": record.get("schedule type", "")}))
    return entries


def _enumerate_scheduled_tasks() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    output = _run(["schtasks", "/query", "/fo", "csv", "/v"], timeout=60)
    return parse_schtasks_csv(output) if output else []


def parse_services_csv(text: str) -> list[PersistenceEntry]:
    """Parse `wmic service get Name,PathName,StartMode /format:csv`-style output."""
    entries: list[PersistenceEntry] = []
    for line in text.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) < 4 or parts[1].lower() in ("name", ""):
            continue
        _node, name, path, start_mode = parts[0], parts[1], parts[2], parts[3]
        if not path or start_mode.lower() == "disabled":
            continue
        entries.append(PersistenceEntry(source="service", name=name, command=path,
                                        location="Services", extra={"start_mode": start_mode}))
    return entries


def _enumerate_services() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    output = _run(["wmic", "service", "get", "Name,PathName,StartMode", "/format:csv"], timeout=60)
    return parse_services_csv(output) if output else []


# ---------------------------------------------------------------- monitor
class PersistenceAuditor:
    """Periodically re-audits autostart locations and reports what is new."""

    def __init__(self, config: Config, analyzer: Analyzer, sink: Sink) -> None:
        self.config = config
        self.analyzer = analyzer
        self.sink = sink
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._seen: set[str] = set()
        self.entries_seen = 0
        self.last_cycle: float = 0.0
        self.mode = "idle"

    def start(self) -> None:
        if not IS_WINDOWS:
            self.mode = "unavailable (not Windows)"
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="persistence", daemon=True)
        self._thread.start()
        self.mode = "polling"

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        self.mode = "idle"

    def _loop(self) -> None:
        interval = max(60, int(self.config.get("persistence.interval_minutes", 15)) * 60)
        while not self._stop.is_set():
            try:
                self.audit()
            except Exception:  # noqa: BLE001
                pass
            self._stop.wait(interval)

    def audit(self, entries: Iterable[PersistenceEntry] | None = None) -> list[Detection]:
        """Audit now. Each entry is reported once per run, not every cycle."""
        found: list[Detection] = []
        for entry in (entries if entries is not None else enumerate_all(self.config)):
            key = f"{entry.source}:{entry.name}:{normalize_path(entry.image)}"
            if key in self._seen:
                continue
            self._seen.add(key)
            self.entries_seen += 1
            for detection in analyze_entry(entry, self.analyzer):
                found.append(detection)
                self.sink(detection)
        self.last_cycle = time.time()
        return found

    def snapshot(self) -> list[dict[str, Any]]:
        return [entry.to_dict() for entry in enumerate_all(self.config)]
