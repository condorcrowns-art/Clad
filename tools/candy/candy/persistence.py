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

# Autostart and code-load locations beyond the Run keys. Every one of these is
# a documented persistence technique that survives a reboot and that a Run-key
# audit alone would miss.
EXTRA_LOCATIONS: list[tuple[str, str, str, str]] = [
    # (hive, key, value name or "*" for all values, description)
    ("HKLM", r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Windows", "AppInit_DLLs",
     "AppInit_DLLs — loaded into every process that links user32"),
    ("HKLM", r"SOFTWARE\Wow6432Node\Microsoft\Windows NT\CurrentVersion\Windows",
     "AppInit_DLLs", "AppInit_DLLs (32-bit)"),
    ("HKLM", r"SYSTEM\CurrentControlSet\Control\Session Manager", "AppCertDlls",
     "AppCertDlls — loaded on every process creation API call"),
    ("HKLM", r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon", "Notify",
     "Winlogon notification package"),
    ("HKLM", r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon", "Taskman",
     "Winlogon task manager replacement"),
    ("HKLM", r"SYSTEM\CurrentControlSet\Control\Lsa", "Notification Packages",
     "LSA notification package — runs inside lsass"),
    ("HKLM", r"SYSTEM\CurrentControlSet\Control\Lsa", "Security Packages",
     "LSA security package — runs inside lsass"),
    ("HKLM", r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Print\Monitors", "*",
     "print monitor DLL — loaded by the spooler as SYSTEM"),
    ("HKLM", r"SYSTEM\CurrentControlSet\Control\Print\Monitors", "*",
     "print monitor DLL"),
    ("HKLM", r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Time Providers", "*",
     "time provider DLL — loaded by w32time as SYSTEM"),
    ("HKLM", r"SOFTWARE\Microsoft\Netsh", "*",
     "netsh helper DLL — loaded whenever netsh runs"),
    ("HKCU", r"Environment", "UserInitMprLogonScript",
     "logon script — runs at every sign-in"),
    ("HKCU", r"Control Panel\Desktop", "SCRNSAVE.EXE",
     "screensaver executable"),
    ("HKLM", r"SOFTWARE\Microsoft\Active Setup\Installed Components", "*",
     "Active Setup — runs once per user at logon"),
    ("HKCU", r"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders", "Startup",
     "redirected Startup folder"),
]

# COM hijacking: a CLSID under HKCU shadows the HKLM one, so a hijacked
# InprocServer32 loads an attacker DLL into whatever host resolves that CLSID.
COM_HIJACK_ROOT = r"SOFTWARE\Classes\CLSID"

# Security tooling that malware likes to neuter with an IFEO "debugger" value.
IFEO_SENSITIVE = {
    "taskmgr.exe", "regedit.exe", "msconfig.exe", "procexp.exe", "procexp64.exe",
    "msmpeng.exe", "mpcmdrun.exe", "candy.exe", "cmd.exe", "powershell.exe",
}

# A full path may contain spaces ("C:\Program Files\..."). \S+? cannot cross
# one, so an unquoted Program Files path used to come back as
# "Files\Google\Chrome\chrome.exe" — a path that does not exist, so every
# lookup against it silently failed. This alternative is anchored at the start
# of the command and at a drive letter, UNC prefix or %VAR%, so it may contain
# spaces without swallowing arguments from an entry like "rundll32.exe x.dll".
_PATH_START = r'(?:[A-Za-z]:[\\/]|\\\\|%\w+%)'
_FULL_PATH_COMMAND = re.compile(
    r'^\s*(' + _PATH_START + r'[^"|<>]*?\.(?:exe|dll|scr|bat|cmd|ps1|vbs|js))(?:\s|$)',
    re.IGNORECASE)
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
    # Quoted first: the author told us exactly where the path ends.
    match = _EXE_IN_COMMAND.search(command)
    if match and match.group(1):
        return match.group(1).strip()
    # Then a whole-command path, which may contain spaces.
    full = _FULL_PATH_COMMAND.match(command)
    if full:
        return full.group(1).strip()
    if not match:
        return command.strip().strip('"').split(" ")[0]
    return (match.group(2) or "").strip()


# Hosts that exist to deliver software updates over BITS. Chrome, Edge, the
# Store and Windows Update all queue dozens of these on an ordinary machine —
# flagging them produced eight high-severity findings on a clean install, which
# is how a real user learns to ignore the tool.
#
# Matched on the hostname only, as a suffix, so a lookalike like
# "dl.google.com.evil.tld" does not slip through.
UPDATE_HOSTS = (
    "windowsupdate.com",
    "delivery.mp.microsoft.com",
    "officecdn.microsoft.com",
    "update.microsoft.com",
    "dl.google.com",
    "gvt1.com",                 # edgedl.me.gvt1.com — Chrome/Edge components
    "update.googleapis.com",
    "mozilla.org",
    "mozilla.net",
)

# What a next-stage payload looks like when it lands. A .crx3 or a hash-named
# blob in a browser's own BITS temp folder is a component update; an .exe or a
# .dll is the thing worth waking someone up for.
BITS_EXECUTABLE_SUFFIXES = (".exe", ".dll", ".scr", ".com", ".ps1", ".bat",
                            ".cmd", ".vbs", ".js", ".hta", ".msi", ".sys")


def bits_host(url: str) -> str:
    """Hostname of a BITS source URL, lowercased. '' when unparseable."""
    text = str(url or "").strip()
    if "://" not in text:
        return ""
    rest = text.split("://", 1)[1]
    host = rest.split("/", 1)[0].split("@")[-1].split(":")[0]
    return host.strip().lower()


def is_update_host(url: str) -> bool:
    host = bits_host(url)
    if not host:
        return False
    return any(host == known or host.endswith("." + known) for known in UPDATE_HOSTS)


def bits_job_severity(url: str, local: str) -> tuple[str, str]:
    """How much a BITS job matters, and the sentence explaining why.

    Two axes rather than one. A known update CDN is routine whatever it
    fetches; an unknown host matters most when what lands is executable.
    """
    executable = str(local or "").strip().lower().endswith(BITS_EXECUTABLE_SUFFIXES)
    if is_update_host(url):
        return "info", (f"This is {bits_host(url)}, a software update service — routine "
                        f"background updating, not a download you started.")
    if not url:
        return "low", ("Its source could not be read, so there is nothing to judge it "
                       "by. Worth a look only if you did not expect it.")
    if executable:
        return "high", ("BITS downloads survive reboots and run outside the browser, "
                        "and this one fetches an executable from a host that is not a "
                        "known update service — which is exactly how malware stages "
                        "its next step.")
    return "low", ("BITS downloads survive reboots and run outside the browser. This "
                   "one is not from a known update service, but what it fetches is not "
                   "executable, so it is worth knowing about rather than acting on.")


# LSA packages that ship with Windows. Code registered here runs inside lsass
# where credentials live, so an *unexpected* one is genuinely critical — but
# scecli is on every Windows install ever made, and reporting it as a critical
# finding on every machine is how a real alert gets ignored.
DEFAULT_LSA_PACKAGES = {
    # Notification Packages
    "scecli", "rassfm",
    # Security / Authentication Packages
    "kerberos", "msv1_0", "schannel", "wdigest", "tspkg", "pku2u",
    "cloudap", "negoexts", "ntlm", "livessp", "lsasrv",
}


def registry_value_text(value: Any) -> str:
    """One readable string from a registry value of any type.

    REG_MULTI_SZ comes back from winreg as a *list*, and str() on a list gives
    "['scecli']" — brackets, quotes and all. That string then travelled into
    the message, the path and the image fields, so the finding read like
    nonsense and no file check could ever match it.
    """
    if isinstance(value, (list, tuple)):
        parts = [str(item).strip().strip('"') for item in value]
        return "; ".join(part for part in parts if part)
    return str(value if value is not None else "").strip().strip('"')


def unexpected_lsa_packages(command: str) -> list[str]:
    """The packages in this value that Windows did not put there."""
    out: list[str] = []
    for part in str(command or "").replace(";", " ").split():
        name = part.strip().strip('"').lower()
        # Registered by name, sometimes with a .dll suffix.
        if name.endswith(".dll"):
            name = name[:-4]
        if name and name not in DEFAULT_LSA_PACKAGES:
            out.append(part.strip().strip('"'))
    return out


# Where Windows' own logon binaries live, in every form the registry stores
# them in. The variable forms are listed explicitly rather than expanded, so
# the comparison never depends on expansion succeeding.
SYSTEM_ROOT_PREFIXES = ("c:/windows/", "%systemroot%/", "%windir%/", "/systemroot/")


def under_system_root(path: str) -> bool:
    normalised = normalize_path(path).lstrip("/")
    return any(normalised.startswith(prefix.lstrip("/")) for prefix in SYSTEM_ROOT_PREFIXES)


def winlogon_is_default(value: str, defaults: set[str]) -> bool:
    """Is this Winlogon value one Windows itself set?

    Deliberately forgiving about shape, because the *stored* form varies and a
    false "your logon has been hijacked" is about the most alarming thing this
    tool could say. Userinit is conventionally written with a trailing comma;
    it is often stored as REG_EXPAND_SZ with %systemroot% rather than an
    absolute path; and either form may carry stray whitespace.
    """
    candidate = registry_value_text(value).rstrip(",").strip()
    if not candidate:
        return True
    forms = {normalize_path(candidate), candidate.lower()}
    try:
        forms.add(normalize_path(expand_path(candidate)))
    except Exception:  # noqa: BLE001 - expansion is best-effort
        pass
    for default in defaults:
        cleaned = str(default).rstrip(",").strip()
        if normalize_path(cleaned) in forms or cleaned.lower() in forms:
            return True
        # %systemroot%\system32\userinit.exe and the absolute form name the
        # same file. Matching on the tail plus a system root catches that even
        # where the variable cannot be expanded — relying on expansion alone
        # means a machine that fails to expand it gets told its logon has been
        # hijacked. A same-named file somewhere else (C:\Users\p\userinit.exe)
        # is still reported, which is the case that matters.
        if basename(cleaned) and basename(cleaned) == basename(candidate) \
                and under_system_root(candidate):
            return True
    return False


# netsh helper DLLs that ship with Windows. A third-party one is a genuine
# persistence technique — it loads into netsh every time it runs — but the
# stock set is large, present on every machine, and reporting all of it
# produced nine medium findings on a clean install. Matched on the DLL name,
# because the value name beside it varies ("rpc" holds rpcnsh.dll).
DEFAULT_NETSH_HELPERS = {
    "authfwcfg.dll", "dhcpcmonitor.dll", "dot3cfg.dll", "fwcfg.dll", "hnetmon.dll",
    "ifmon.dll", "netiohlp.dll", "netprofm.dll", "nettrace.dll", "nshhttp.dll",
    "nshipsec.dll", "nshwfp.dll", "p2pnetsh.dll", "peerdistsh.dll", "rasmontr.dll",
    "rpcnsh.dll", "wcnnetsh.dll", "whhelper.dll", "wlancfg.dll", "wshelper.dll",
    "wwancfg.dll", "wcncsvc.dll", "mprapi.dll", "wevtapi.dll",
}

# Where the Startup folder normally points. The entry is only interesting when
# it has been *redirected* somewhere else — reporting it while it sits at its
# own default is the report describing stock Windows as a finding.
DEFAULT_STARTUP_TAILS = (
    "/microsoft/windows/start menu/programs/startup",
)


def is_default_extra_location(description: str, name: str, value: str) -> bool:
    """Is this entry just Windows in its out-of-the-box state?

    Every false positive found on real machines has had this shape: a rule
    reporting that a Windows feature exists, rather than that its
    configuration has been changed. The question worth asking is always
    "is this different from default", never "is this present".
    """
    lowered = description.lower()

    if "netsh helper" in lowered:
        return basename(value).lower() in DEFAULT_NETSH_HELPERS

    if "startup folder" in lowered:
        normalised = normalize_path(value).rstrip("/")
        return any(normalised.endswith(tail) for tail in DEFAULT_STARTUP_TAILS)

    return False


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

    if entry.source == "bits_job":
        url = entry.extra.get("url", "")
        local = entry.extra.get("local") or ""
        severity, why = bits_job_severity(url, local)
        emit("bits_job",
             (f"A BITS background transfer job '{entry.name}' is queued"
              + (f" from {url[:80]}" if url else "")
              + f" to {local or 'an unknown path'}. {why}"),
             severity, signature_id="persistence.bits_job")

    if entry.source == "com_hijack":
        emit("com_hijack",
             (f"A per-user COM server is registered for {entry.extra.get('clsid', '?')} "
              f"pointing at {image or entry.command}. This shadows the system-wide "
              f"registration and loads that file into whatever process resolves the CLSID."),
             "high", signature_id="persistence.com_hijack")
    elif entry.source == "registry_autostart" and "AppInit" in entry.name:
        emit("appinit_dll",
             (f"AppInit_DLLs is set to '{entry.command}'. Every process that loads user32 "
              f"will load that DLL — this is machine-wide injection by configuration."),
             "critical", signature_id="persistence.appinit")
    elif entry.source == "registry_autostart" and "lsass" in entry.name.lower():
        unexpected = unexpected_lsa_packages(entry.command)
        if unexpected:
            emit("lsa_package",
                 (f"An LSA package Windows did not install is registered: "
                  f"{', '.join(unexpected)}. Code registered here runs inside lsass, "
                  f"where every credential on this machine passes through."),
                 "critical", signature_id="persistence.lsa",
                 evidence={"unexpected": unexpected, "value": entry.command})
    elif entry.source == "registry_autostart":
        emit("registry_autostart",
             f"{entry.name} is set to run '{entry.command}'.",
             "medium", signature_id="persistence.registry_autostart")

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

    # Only executables count here. A BITS job downloading a .cab into
    # %WINDIR%\Temp is Windows Update doing its job, not persistence.
    executable = image.lower().endswith(
        (".exe", ".dll", ".scr", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".hta"))
    normalized = normalize_path(image)
    if executable and normalized and any(hint in normalized + "/" for hint in LOW_TRUST_DIR_HINTS):
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
    entries.extend(_enumerate_extra_locations())
    entries.extend(_enumerate_com_hijacks())
    entries.extend(_enumerate_bits_jobs())
    return entries


def parse_bits_jobs(text: str) -> list[PersistenceEntry]:
    """Parse `Get-BitsTransfer` CSV output.

    BITS is a background download service that survives reboots and logoffs,
    which is exactly why malware uses it to fetch the next stage. A job that
    has been sitting there for days pointing at a URL is not a Windows update.
    """
    import csv
    import io

    entries: list[PersistenceEntry] = []
    try:
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    except (csv.Error, TypeError):
        return entries

    for row in rows:
        name = (row.get("DisplayName") or row.get("JobId") or "").strip()
        url = (row.get("RemoteName") or row.get("RemoteURL") or "").strip()
        local = (row.get("LocalName") or "").strip()
        if not name and not url:
            continue
        entries.append(PersistenceEntry(
            source="bits_job", name=name or "(unnamed BITS job)",
            command=local or url, location="BITS",
            extra={"url": url, "local": local,
                   "state": (row.get("JobState") or "").strip(),
                   "owner": (row.get("OwnerAccount") or "").strip()}))
    return entries


def _enumerate_bits_jobs() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    output = _run(["powershell", "-NoProfile", "-NonInteractive", "-Command",
                   "Get-BitsTransfer -AllUsers -ErrorAction SilentlyContinue | "
                   "Select-Object DisplayName,JobState,OwnerAccount,"
                   "@{n='RemoteName';e={$_.FileList.RemoteName -join ';'}},"
                   "@{n='LocalName';e={$_.FileList.LocalName -join ';'}} | "
                   "ConvertTo-Csv -NoTypeInformation"], timeout=60)
    return parse_bits_jobs(output) if output else []


def _enumerate_extra_locations() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    """AppInit, LSA, print monitors, netsh helpers, logon scripts and friends."""
    import winreg

    roots = {"HKCU": winreg.HKEY_CURRENT_USER, "HKLM": winreg.HKEY_LOCAL_MACHINE}
    entries: list[PersistenceEntry] = []
    for hive, subkey, value_name, description in EXTRA_LOCATIONS:
        try:
            with winreg.OpenKey(roots[hive], subkey) as key:
                if value_name == "*":
                    index = 0
                    while True:
                        try:
                            name, value, _ = winreg.EnumValue(key, index)
                        except OSError:
                            break
                        index += 1
                        text = registry_value_text(value)
                        if text and not is_default_extra_location(description, name, text):
                            entries.append(PersistenceEntry(
                                source="registry_autostart", name=f"{description}: {name}",
                                command=text, location=f"{hive}\\{subkey}",
                                extra={"technique": description}))
                else:
                    try:
                        value, _ = winreg.QueryValueEx(key, value_name)
                    except OSError:
                        continue
                    text = registry_value_text(value)
                    if text and not is_default_extra_location(description, value_name, text):
                        entries.append(PersistenceEntry(
                            source="registry_autostart", name=description,
                            command=text, location=f"{hive}\\{subkey}\\{value_name}",
                            extra={"technique": description}))
        except OSError:
            continue
    return entries


def _clsid_in_hklm(clsid: str, server: str) -> bool:  # pragma: no cover - Windows only
    """Is this CLSID also registered machine-wide? That is what shadowing means."""
    import winreg

    for root in (winreg.HKEY_LOCAL_MACHINE,):
        for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            try:
                with winreg.OpenKey(root, f"{COM_HIJACK_ROOT}\\{clsid}\\{server}", 0,
                                    winreg.KEY_READ | view):
                    return True
            except OSError:
                continue
    return False


def _enumerate_com_hijacks() -> list[PersistenceEntry]:  # pragma: no cover - Windows only
    """Per-user CLSID entries that shadow a machine-wide COM server.

    A CLSID registered under HKCU takes precedence over HKLM, so this is how a
    DLL gets loaded into a trusted host process without touching any autostart
    key at all.
    """
    import winreg

    entries: list[PersistenceEntry] = []
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, COM_HIJACK_ROOT) as root:
            index = 0
            while index < 2000:
                try:
                    clsid = winreg.EnumKey(root, index)
                except OSError:
                    break
                index += 1
                for server in ("InprocServer32", "LocalServer32"):
                    try:
                        with winreg.OpenKey(root, f"{clsid}\\{server}") as key:
                            value, _ = winreg.QueryValueEx(key, "")
                    except OSError:
                        continue
                    if not value:
                        continue
                    # Only a per-user CLSID that *also* exists machine-wide is
                    # actually shadowing anything. Modern applications —
                    # OneDrive, Discord, Chrome, every Electron app — register
                    # their own per-user COM servers as a matter of course, and
                    # flagging those produced dozens of high-severity findings
                    # on a clean machine while stating something untrue about
                    # each one.
                    if not _clsid_in_hklm(clsid, server):
                        continue
                    entries.append(PersistenceEntry(
                        source="com_hijack", name=f"COM {clsid} ({server})",
                        command=registry_value_text(value),
                        location=f"HKCU\\{COM_HIJACK_ROOT}\\{clsid}\\{server}",
                        extra={"technique": "per-user COM server shadows the machine-wide one",
                               "clsid": clsid, "shadows_hklm": True}))
    except OSError:
        pass
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
                        command=registry_value_text(value), location=f"{root_name}\\{subkey}"))
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
                text = registry_value_text(value)
                if winlogon_is_default(text, defaults):
                    continue
                entries.append(PersistenceEntry(
                    source="winlogon", name=value_name.capitalize(),
                    command=text, location=f"HKLM\\{WINLOGON_KEY}"))
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
                    source="ifeo", name=f"IFEO:{target}", command=registry_value_text(debugger),
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
