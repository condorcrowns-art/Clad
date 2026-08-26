"""Tests for the kernel-telemetry, PE, persistence and notification layers.

Run with:  python -m unittest discover -s tests

Everything here is exercised without Windows: the event XML is real Sysmon /
Defender / Security schema, the PE files are built byte-by-byte by
``tests.pebuilder``, and the persistence entries are the same dictionaries the
Windows enumerators produce.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import pe  # noqa: E402
from candy.detect import Analyzer  # noqa: E402
from candy.notify import Notifier  # noqa: E402
from candy.persistence import (PersistenceEntry, analyze_entry, extract_image,  # noqa: E402
                               parse_schtasks_csv, parse_services_csv)
from candy.winevents import (DEFENDER_CHANNEL, SECURITY_CHANNEL, SYSMON_CHANNEL,  # noqa: E402
                             WindowsEventAnalyzer, parse_access_mask, parse_events,
                             sha256_from_hashes)
from pebuilder import build_pe  # noqa: E402
from test_core import make_config, make_db  # noqa: E402

ROBLOX = r"C:\Program Files\Roblox\Versions\version-abc\RobloxPlayerBeta.exe"


def event_xml(channel: str, event_id: int, record_id: int, data: dict[str, str],
              provider: str = "Microsoft-Windows-Sysmon") -> str:
    """Build a Windows event in the real schema wevtutil emits."""
    fields = "".join(f'<Data Name="{k}">{v}</Data>' for k, v in data.items())
    return (
        '<Event xmlns="http://schemas.microsoft.com/win/2004/08/events/event">'
        f'<System><Provider Name="{provider}"/><EventID>{event_id}</EventID>'
        '<Version>5</Version><Level>4</Level><Task>1</Task>'
        '<TimeCreated SystemTime="2026-08-17T18:00:00.000000000Z"/>'
        f'<EventRecordID>{record_id}</EventRecordID>'
        '<Execution ProcessID="100" ThreadID="200"/>'
        f'<Channel>{channel}</Channel><Computer>PC</Computer></System>'
        f'<EventData>{fields}</EventData></Event>'
    )


class EventParsingTests(unittest.TestCase):
    def test_parses_concatenated_events(self):
        raw = (event_xml(SYSMON_CHANNEL, 1, 10, {"Image": "a.exe"})
               + event_xml(SYSMON_CHANNEL, 8, 11, {"SourceImage": "b.exe"}))
        records = parse_events(raw)
        self.assertEqual([r["event_id"] for r in records], [1, 8])
        self.assertEqual([r["record_id"] for r in records], [10, 11])
        self.assertEqual(records[0]["channel"], SYSMON_CHANNEL)
        self.assertEqual(records[0]["data"]["Image"], "a.exe")

    def test_truncated_trailing_event_does_not_lose_earlier_ones(self):
        raw = event_xml(SYSMON_CHANNEL, 1, 10, {"Image": "a.exe"}) + "<Event><System><Even"
        records = parse_events(raw)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["record_id"], 10)

    def test_garbage_is_not_fatal(self):
        self.assertEqual(parse_events(""), [])
        self.assertEqual(parse_events("not xml at all"), [])

    def test_access_mask_parsing(self):
        self.assertEqual(parse_access_mask("0x1FFFFF"), 0x1FFFFF)
        self.assertEqual(parse_access_mask("0x1000"), 0x1000)
        self.assertEqual(parse_access_mask(None), 0)
        self.assertEqual(parse_access_mask("nonsense"), 0)

    def test_sha256_extraction_from_sysmon_hashes(self):
        digest = "ab" * 32
        value = f"SHA1=DEAD,SHA256={digest.upper()},IMPHASH=BEEF"
        self.assertEqual(sha256_from_hashes(value), digest)
        self.assertIsNone(sha256_from_hashes("SHA1=DEAD"))
        self.assertIsNone(sha256_from_hashes(None))


class SysmonAnalysisTests(unittest.TestCase):
    def setUp(self):
        self.config = make_config()
        self.analyzer = WindowsEventAnalyzer(self.config, Analyzer(self.config, make_db()))

    def analyze(self, event_id: int, data: dict[str, str], channel: str = SYSMON_CHANNEL):
        record = parse_events(event_xml(channel, event_id, 1, data))[0]
        return self.analyzer.analyze(record)

    # ---------------------------------------------------------- injection
    def test_remote_thread_into_roblox_is_critical(self):
        hits = self.analyze(8, {"SourceImage": r"C:\Users\bob\Downloads\loader.exe",
                                "TargetImage": ROBLOX, "SourceProcessId": "4321"})
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].severity, "critical")
        self.assertEqual(hits[0].kind, "remote_thread")
        self.assertEqual(hits[0].pid, 4321)

    def test_remote_thread_into_unrelated_process_is_ignored(self):
        self.assertEqual(self.analyze(8, {"SourceImage": r"C:\tools\debugger.exe",
                                          "TargetImage": r"C:\app\notepad.exe"}), [])

    def test_whitelisted_source_does_not_alert(self):
        config = make_config(whitelist={"names": ["overlay.exe"]})
        analyzer = WindowsEventAnalyzer(config, Analyzer(config, make_db()))
        record = parse_events(event_xml(SYSMON_CHANNEL, 8, 1, {
            "SourceImage": r"C:\Games\overlay.exe", "TargetImage": ROBLOX}))[0]
        self.assertEqual(analyzer.analyze(record), [])

    def test_process_access_with_write_rights_is_flagged(self):
        hits = self.analyze(10, {"SourceImage": r"C:\Users\bob\Downloads\inject.exe",
                                 "TargetImage": ROBLOX, "GrantedAccess": "0x1F0FFF"})
        self.assertTrue(hits)
        self.assertEqual(hits[0].kind, "process_access")
        self.assertEqual(hits[0].severity, "high")

    def test_read_only_handle_is_not_flagged(self):
        self.assertEqual(self.analyze(10, {"SourceImage": r"C:\x\reader.exe",
                                           "TargetImage": ROBLOX,
                                           "GrantedAccess": "0x1000"}), [])

    def test_known_inspectors_are_not_flagged(self):
        self.assertEqual(self.analyze(10, {"SourceImage": r"C:\Windows\System32\taskmgr.exe",
                                           "TargetImage": ROBLOX,
                                           "GrantedAccess": "0x1FFFFF"}), [])

    def test_handle_opened_into_candy_is_self_tamper(self):
        hits = self.analyze(10, {"SourceImage": r"C:\Users\bob\Downloads\killer.exe",
                                 "TargetImage": r"C:\Tools\Candy.exe",
                                 "GrantedAccess": "0x1FFFFF"})
        self.assertTrue(hits)
        self.assertEqual(hits[0].kind, "self_tamper")
        self.assertEqual(hits[0].severity, "critical")

    # ------------------------------------------------------------ drivers
    def test_unsigned_driver_load_is_critical(self):
        hits = self.analyze(6, {"ImageLoaded": r"C:\Windows\Temp\cheat.sys",
                                "Signed": "false", "SignatureStatus": "Unavailable"})
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].severity, "critical")
        self.assertEqual(hits[0].kind, "driver_load")

    def test_valid_signed_driver_is_ignored(self):
        self.assertEqual(self.analyze(6, {"ImageLoaded": r"C:\Windows\System32\drivers\nvme.sys",
                                          "Signed": "true", "SignatureStatus": "Valid"}), [])

    # ------------------------------------------------------- image loads
    def test_unsigned_module_in_roblox_is_critical(self):
        hits = self.analyze(7, {"Image": ROBLOX,
                                "ImageLoaded": r"C:\Users\bob\AppData\Local\Temp\hook.dll",
                                "Signed": "false"})
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0].severity, "critical")

    def test_windows_module_in_roblox_is_ignored(self):
        self.assertEqual(self.analyze(7, {"Image": ROBLOX,
                                          "ImageLoaded": r"C:\Windows\System32\kernel32.dll",
                                          "Signed": "true"}), [])

    def test_module_in_unrelated_process_is_ignored(self):
        self.assertEqual(self.analyze(7, {"Image": r"C:\app\game.exe",
                                          "ImageLoaded": r"C:\Temp\weird.dll",
                                          "Signed": "false"}), [])

    def test_process_tampering_is_critical(self):
        hits = self.analyze(25, {"Image": r"C:\Users\bob\thing.exe", "Type": "Image is replaced"})
        self.assertEqual(hits[0].severity, "critical")
        self.assertEqual(hits[0].kind, "process_tampering")

    # ---------------------------------------------------- process create
    def test_process_create_routes_through_the_analyzer(self):
        digest = "cd" * 32
        hits = self.analyze(1, {"Image": r"C:\Users\bob\Downloads\krnl.exe",
                                "CommandLine": r"krnl.exe", "ParentImage": r"C:\Windows\explorer.exe",
                                "ProcessId": "777", "Hashes": f"SHA256={digest}"})
        self.assertTrue(any("KRNL" in h.message for h in hits))
        self.assertTrue(all(h.sha256 == digest for h in hits))

    def test_file_create_routes_through_the_analyzer(self):
        hits = self.analyze(11, {"TargetFilename": r"C:\Users\bob\Downloads\synapsex.exe"})
        self.assertTrue(hits)


class DefenderAnalysisTests(unittest.TestCase):
    def setUp(self):
        config = make_config()
        self.analyzer = WindowsEventAnalyzer(config, Analyzer(config, make_db()))

    def analyze(self, event_id: int, data: dict[str, str]):
        record = parse_events(event_xml(DEFENDER_CHANNEL, event_id, 1, data,
                                        provider="Microsoft-Windows-Windows Defender"))[0]
        return self.analyzer.analyze(record)

    def test_realtime_protection_disabled_is_critical(self):
        hits = self.analyze(5001, {})
        self.assertEqual(hits[0].severity, "critical")
        self.assertEqual(hits[0].kind, "defender_disabled")

    def test_malware_detection_is_reported(self):
        hits = self.analyze(1116, {"Threat Name": "Trojan:Win32/Wacatac",
                                   "Path": r"C:\Users\bob\Downloads\loader.exe"})
        self.assertEqual(hits[0].severity, "critical")
        self.assertIn("Wacatac", hits[0].message)

    def test_exclusion_change_is_reported(self):
        hits = self.analyze(5007, {"Old Value": "", "New Value": r"Exclusions\Paths\C:\Temp"})
        self.assertEqual(hits[0].kind, "defender_exclusion")

    def test_unrelated_config_change_is_ignored(self):
        self.assertEqual(self.analyze(5007, {"Old Value": "SpyNet", "New Value": "SpyNet2"}), [])


class SecurityChannelTests(unittest.TestCase):
    def test_4688_process_creation_is_analyzed(self):
        config = make_config()
        analyzer = WindowsEventAnalyzer(config, Analyzer(config, make_db()))
        record = parse_events(event_xml(SECURITY_CHANNEL, 4688, 1, {
            "NewProcessName": r"C:\Users\bob\Downloads\fluxus.exe",
            "NewProcessId": "0x1a4",
            "ParentProcessName": r"C:\Windows\explorer.exe"}, provider="Microsoft-Windows-Security-Auditing"))[0]
        hits = analyzer.analyze(record)
        self.assertTrue(any("Fluxus" in h.message for h in hits))

    def test_other_security_events_are_ignored(self):
        config = make_config()
        analyzer = WindowsEventAnalyzer(config, Analyzer(config, make_db()))
        record = parse_events(event_xml(SECURITY_CHANNEL, 4624, 1, {"LogonType": "2"}))[0]
        self.assertEqual(analyzer.analyze(record), [])


class PEInspectionTests(unittest.TestCase):
    def test_version_resource_is_read(self):
        raw = build_pe(strings={"CompanyName": "Acme Ltd", "OriginalFilename": "krnl.exe",
                                "ProductName": "KRNL"})
        info = pe.inspect_bytes(raw, "homework.exe")
        self.assertTrue(info.is_pe)
        self.assertEqual(info.original_filename, "krnl.exe")
        self.assertEqual(info.company, "Acme Ltd")
        self.assertEqual(info.product, "KRNL")

    def test_rename_detection(self):
        info = pe.inspect_bytes(build_pe(strings={"OriginalFilename": "krnl.exe"}))
        self.assertEqual(info.renamed_from("homework.exe"), "krnl.exe")
        self.assertIsNone(info.renamed_from("krnl.exe"))
        self.assertIsNone(info.renamed_from("KRNL.EXE"))
        # A .exe/.dll extension difference alone is not a rename.
        self.assertIsNone(info.renamed_from("krnl.dll"))

    def test_entropy_separates_packed_from_compiled(self):
        import os

        normal = pe.inspect_bytes(build_pe(strings={"OriginalFilename": "a.exe"}))
        self.assertFalse(normal.looks_packed)
        packed = pe.inspect_bytes(build_pe(code=os.urandom(4096)))
        self.assertTrue(packed.looks_packed)
        self.assertGreater(packed.max_code_entropy, normal.max_code_entropy)

    def test_non_pe_input_is_handled(self):
        info = pe.inspect_bytes(b"this is a text file")
        self.assertFalse(info.is_pe)
        self.assertIn("not a PE", info.error or "")

    def test_missing_version_info(self):
        info = pe.inspect_bytes(build_pe())
        self.assertTrue(info.is_pe)
        self.assertFalse(info.has_version_info)


class RenamedExecutorDetectionTests(unittest.TestCase):
    """The end-to-end payoff: a renamed executor on disk is still identified."""

    def test_renamed_executor_file_is_caught(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "homework_notes.exe"
            path.write_bytes(build_pe(strings={"OriginalFilename": "krnl.exe",
                                               "ProductName": "KRNL"}))
            analyzer = Analyzer(make_config(), make_db())
            hits = analyzer.analyze_file(str(path))
            renamed = [h for h in hits if h.kind == "renamed_threat"]
            self.assertTrue(renamed, [h.message for h in hits])
            self.assertEqual(renamed[0].severity, "critical")
            self.assertIn("krnl.exe", renamed[0].message)

    def test_renamed_but_unknown_binary_is_only_medium(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "setup2.exe"
            path.write_bytes(build_pe(strings={"OriginalFilename": "installer_x64.exe"}))
            hits = Analyzer(make_config(), make_db()).analyze_file(str(path))
            renamed = [h for h in hits if h.kind == "renamed_binary"]
            self.assertTrue(renamed)
            self.assertEqual(renamed[0].severity, "medium")

    def test_matching_name_produces_no_rename_finding(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tool.exe"
            path.write_bytes(build_pe(strings={"OriginalFilename": "tool.exe",
                                               "CompanyName": "Some Vendor"}))
            hits = Analyzer(make_config(), make_db()).analyze_file(str(path))
            self.assertFalse([h for h in hits if "renamed" in h.kind])


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = Analyzer(make_config(), make_db())

    def test_extract_image_from_command_lines(self):
        self.assertEqual(extract_image(r'"C:\Program Files\App\app.exe" -silent'),
                         r"C:\Program Files\App\app.exe")
        self.assertEqual(extract_image(r"C:\tools\thing.exe /start"), r"C:\tools\thing.exe")
        self.assertEqual(extract_image(""), "")

    def test_known_executor_in_run_key_is_critical(self):
        entry = PersistenceEntry(source="hkcu_run", name="Updater",
                                 command=r"C:\Users\bob\AppData\krnl.exe")
        hits = analyze_entry(entry, self.analyzer)
        self.assertTrue(any(h.severity == "critical" for h in hits))

    def test_autostart_from_temp_is_flagged(self):
        entry = PersistenceEntry(source="hkcu_run", name="SysHelper",
                                 command=r"C:\Users\bob\AppData\Local\Temp\svc32.exe")
        hits = analyze_entry(entry, self.analyzer)
        self.assertTrue(any(h.kind == "autostart_from_temp" for h in hits))

    def test_unsigned_autostart_from_temp_scores_higher(self):
        unsigned = Analyzer(make_config(), make_db(), signature_checker=lambda _p: False)
        entry = PersistenceEntry(source="hkcu_run", name="SysHelper",
                                 command=r"C:\Users\bob\AppData\Local\Temp\svc32.exe")
        hits = [h for h in analyze_entry(entry, unsigned) if h.kind == "autostart_from_temp"]
        self.assertEqual(hits[0].severity, "high")

    def test_winlogon_hijack_is_critical(self):
        entry = PersistenceEntry(source="winlogon", name="Shell",
                                 command=r"explorer.exe, C:\Users\bob\evil.exe")
        hits = analyze_entry(entry, self.analyzer)
        self.assertTrue(any(h.kind == "winlogon_hijack" and h.severity == "critical" for h in hits))

    def test_ifeo_hijack_on_security_tool_is_critical(self):
        entry = PersistenceEntry(source="ifeo", name="IFEO:taskmgr.exe",
                                 command=r"C:\Users\bob\block.exe", extra={"target": "taskmgr.exe"})
        hits = analyze_entry(entry, self.analyzer)
        self.assertTrue(any(h.kind == "ifeo_hijack" and h.severity == "critical" for h in hits))

    def test_encoded_powershell_at_startup_is_critical(self):
        entry = PersistenceEntry(
            source="scheduled_task", name="\\Updater",
            command="powershell.exe -enc " + "QQBiAGMAZABlAGYA" * 4)
        hits = analyze_entry(entry, self.analyzer)
        self.assertTrue(any(h.kind == "autostart_encoded" for h in hits))

    def test_normal_autostart_entry_is_clean(self):
        entry = PersistenceEntry(source="hklm_run", name="SecurityHealth",
                                 command=r"C:\Windows\System32\SecurityHealthSystray.exe")
        self.assertEqual(analyze_entry(entry, self.analyzer), [])

    def test_whitelisted_autostart_is_clean(self):
        config = make_config(whitelist={"names": ["krnl.exe"]})
        analyzer = Analyzer(config, make_db())
        entry = PersistenceEntry(source="hkcu_run", name="X", command=r"D:\krnl.exe")
        self.assertEqual(analyze_entry(entry, analyzer), [])

    def test_schtasks_csv_parsing(self):
        csv_text = (
            '"HostName","TaskName","Next Run Time","Status","Task To Run","Scheduled Task State"\n'
            '"PC","\\MyTask","N/A","Ready","C:\\Users\\bob\\thing.exe","Enabled"\n'
            '"PC","\\Disabled","N/A","Ready","C:\\x\\y.exe","Disabled"\n'
        )
        entries = parse_schtasks_csv(csv_text)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0].name, "\\MyTask")
        self.assertEqual(entries[0].image, r"C:\Users\bob\thing.exe")

    def test_services_csv_parsing(self):
        text = ("Node,Name,PathName,StartMode\n"
                "PC,BadSvc,C:\\Temp\\svc.exe,Auto\n"
                "PC,OffSvc,C:\\Temp\\off.exe,Disabled\n")
        entries = parse_services_csv(text)
        self.assertEqual([e.name for e in entries], ["BadSvc"])


class NotifierTests(unittest.TestCase):
    def test_low_severity_does_not_notify(self):
        notifier = Notifier(None, min_severity="high", min_interval=10)
        self.assertEqual(notifier.should_notify("low", 1000.0), (False, 0))
        self.assertEqual(notifier.should_notify("medium", 1000.0), (False, 0))

    def test_rate_limit_counts_suppressed_alerts(self):
        notifier = Notifier(None, min_severity="high", min_interval=10)
        self.assertEqual(notifier.should_notify("critical", 1000.0), (True, 0))
        self.assertEqual(notifier.should_notify("critical", 1001.0), (False, 1))
        self.assertEqual(notifier.should_notify("high", 1002.0), (False, 2))
        # After the interval, the next alert reports how many were held back.
        self.assertEqual(notifier.should_notify("critical", 1011.0), (True, 2))

    def test_unknown_severity_is_ignored(self):
        self.assertEqual(Notifier(None).should_notify("bogus", 1.0), (False, 0))


if __name__ == "__main__":
    unittest.main(verbosity=2)
