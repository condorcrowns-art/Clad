"""Unit tests for the platform-independent core.

Run with:  python -m unittest discover -s tests -v   (no pytest needed)

These cover the detection logic, the scoring aggregator, the threat database,
the config/whitelist model, quarantine round-tripping and log-chain integrity.
The Windows-only paths (WMI, WinVerifyTrust, netsh, mitigation policies) are
not exercised here — they need a real Windows host.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from execguard.config import Config, deep_merge  # noqa: E402
from execguard.detect import Aggregator, Analyzer  # noqa: E402
from execguard.eventlog import EventLog, verify_chain  # noqa: E402
from execguard.events import Detection, severity_for  # noqa: E402
from execguard.netmon import is_private  # noqa: E402
from execguard.responder import Responder  # noqa: E402
from execguard.threatdb import ThreatDB, make_submission  # noqa: E402
from execguard.util import compile_pattern, is_within, normalize_path  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
SEED_DB = REPO / "data" / "threats.json"


def make_db() -> ThreatDB:
    db = ThreatDB()
    db.ingest(json.loads(SEED_DB.read_text(encoding="utf-8")), replace=True)
    return db


def make_config(**overrides) -> Config:
    config = Config(overrides)
    config.path = None  # never write to disk during tests
    return config


class UtilTests(unittest.TestCase):
    def test_normalize_path_is_case_and_separator_insensitive(self):
        self.assertEqual(normalize_path(r"C:\Users\Bob\App\\"), "c:/users/bob/app")

    def test_is_within(self):
        self.assertTrue(is_within(r"C:\Windows\System32\cmd.exe", "c:/windows"))
        self.assertFalse(is_within(r"C:\WindowsApps\evil.exe", "c:/windows"))
        self.assertTrue(is_within("c:/windows", "C:\\Windows"))

    def test_literal_patterns_are_escaped(self):
        pattern = compile_pattern("a.b")
        self.assertTrue(pattern.search("A.B"))
        self.assertFalse(pattern.search("axb"))

    def test_regex_patterns_use_the_re_prefix(self):
        self.assertTrue(compile_pattern(r"re:^krnl\.exe$").search("KRNL.EXE"))


class ConfigTests(unittest.TestCase):
    def test_deep_merge_keeps_untouched_defaults(self):
        merged = deep_merge({"a": {"x": 1, "y": 2}}, {"a": {"y": 3}})
        self.assertEqual(merged, {"a": {"x": 1, "y": 3}})

    def test_defaults_are_conservative(self):
        config = make_config()
        self.assertEqual(config.get("response.mode"), "observe")
        self.assertFalse(config.get("response.auto_kill"))
        self.assertFalse(config.get("intel.enable_lookups"))
        self.assertFalse(config.enforcing)

    def test_whitelist_matches_by_name_path_and_hash(self):
        config = make_config(whitelist={"names": ["mytool.exe"], "paths": ["C:/Apps/Safe"],
                                        "hashes": ["ab" * 32]})
        self.assertTrue(config.is_whitelisted(name="MyTool.exe"))
        self.assertTrue(config.is_whitelisted(path=r"C:\Apps\Safe\sub\thing.exe"))
        self.assertTrue(config.is_whitelisted(sha256=("AB" * 32).lower()))
        self.assertFalse(config.is_whitelisted(name="other.exe", path=r"C:\Temp\x.exe"))

    def test_user_blacklist_reports_a_reason(self):
        config = make_config(blacklist={"names": ["bad.exe"], "patterns": ["re:evil"]})
        self.assertIn("user blacklist", config.user_blacklist_hit(name="BAD.EXE") or "")
        self.assertIn("pattern", config.user_blacklist_hit(path=r"C:\x\EVILthing.exe") or "")
        self.assertIsNone(config.user_blacklist_hit(name="fine.exe"))

    def test_protected_processes_cannot_be_actioned(self):
        self.assertTrue(make_config().is_protected_process("Explorer.exe"))

    def test_list_entries_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            config = Config({}, path)
            self.assertTrue(config.add_list_entry("whitelist", "names", "thing.exe"))
            self.assertFalse(config.add_list_entry("whitelist", "names", "thing.exe"))
            reloaded = Config.load(path)
            self.assertIn("thing.exe", reloaded.get("whitelist.names"))
            self.assertTrue(reloaded.is_whitelisted(name="THING.EXE"))


class ThreatDBTests(unittest.TestCase):
    def test_seed_database_loads(self):
        db = make_db()
        self.assertGreater(len(db.signatures), 30)
        self.assertEqual(db.hashes, {}, "seed DB must not ship unverified hashes")

    def test_matching_targets(self):
        db = make_db()
        self.assertTrue(db.match("process_name", "krnl.exe"))
        self.assertTrue(db.match("process_name", "KRNLBootstrapper.exe"))
        self.assertFalse(db.match("process_name", "kernel32dump.exe"))

    def test_invalid_entries_are_skipped_not_fatal(self):
        db = ThreatDB()
        added = db.ingest({
            "signatures": [
                {"id": "ok", "name": "ok", "target": "process_name", "pattern": "x.exe"},
                {"id": "bad-target", "name": "n", "target": "not_a_target", "pattern": "y"},
                {"id": "no-pattern", "name": "n", "target": "process_name"},
                "not-a-dict",
            ],
            "hashes": {"nothex": {"name": "x"}, "cd" * 32: {"name": "real"}},
        })
        self.assertEqual(added["signatures"], 1)
        self.assertEqual(added["hashes"], 1)
        self.assertEqual(len(db.signatures), 1)

    def test_http_feeds_are_refused(self):
        with self.assertRaises(ValueError):
            ThreatDB().update_from_url("http://example.com/threats.json")

    def test_submission_shape(self):
        payload = make_submission(name="Nova Executor", target="process_name",
                                  pattern="re:^nova\\.exe$", severity="high",
                                  description="seen in the wild", sha256="ef" * 32)
        self.assertEqual(payload["signatures"][0]["id"], "community.nova-executor")
        self.assertIn("ef" * 32, payload["hashes"])

    def test_submission_drops_invalid_hash(self):
        payload = make_submission(name="X", target="file_name", pattern="x", severity="low",
                                  description="", sha256="nope")
        self.assertNotIn("hashes", payload)


class AnalyzerProcessTests(unittest.TestCase):
    def setUp(self):
        self.config = make_config()
        self.analyzer = Analyzer(self.config, make_db())

    def test_known_executor_is_detected(self):
        hits = self.analyzer.analyze_process({
            "pid": 1234, "name": "krnl.exe", "exe": r"C:\Users\bob\Downloads\krnl.exe",
            "cmdline": r"C:\Users\bob\Downloads\krnl.exe", "parent_name": "explorer.exe",
        })
        self.assertTrue(hits)
        self.assertTrue(any(h.severity == "high" for h in hits))
        self.assertTrue(any("KRNL" in h.message for h in hits))

    def test_whitelisted_system_binary_is_clean(self):
        self.assertEqual(self.analyzer.analyze_process({
            "pid": 4, "name": "notepad.exe", "exe": r"C:\Windows\System32\notepad.exe",
            "cmdline": "notepad.exe", "parent_name": "explorer.exe",
        }), [])

    def test_roblox_masquerade_is_flagged(self):
        hits = self.analyzer.analyze_process({
            "pid": 22, "name": "RobloxPlayerBeta.exe",
            "exe": r"C:\Users\bob\AppData\Local\Temp\RobloxPlayerBeta.exe",
            "cmdline": "", "parent_name": "explorer.exe",
        })
        self.assertTrue(any(h.kind == "masquerade" for h in hits))

    def test_real_roblox_path_is_not_flagged_as_masquerade(self):
        hits = self.analyzer.analyze_process({
            "pid": 22, "name": "RobloxPlayerBeta.exe",
            "exe": r"C:\Users\bob\AppData\Local\Roblox\Versions\version-abc\RobloxPlayerBeta.exe",
            "cmdline": "", "parent_name": "explorer.exe",
        })
        self.assertFalse([h for h in hits if h.kind == "masquerade"])

    def test_unsigned_binary_in_temp_scores_higher_than_unknown(self):
        unsigned = Analyzer(self.config, make_db(), signature_checker=lambda _p: False)
        hits = unsigned.analyze_process({
            "pid": 7, "name": "setup_installer.exe",
            "exe": r"C:\Users\bob\AppData\Local\Temp\setup_installer.exe",
            "cmdline": "", "parent_name": "explorer.exe",
        })
        self.assertTrue(any(h.kind == "unsigned_low_trust" for h in hits))

        unknown = Analyzer(self.config, make_db(), signature_checker=lambda _p: None)
        hits2 = unknown.analyze_process({
            "pid": 7, "name": "setup_installer.exe",
            "exe": r"C:\Users\bob\AppData\Local\Temp\setup_installer.exe",
            "cmdline": "", "parent_name": "explorer.exe",
        })
        self.assertTrue(any(h.kind == "low_trust_dir" for h in hits2))
        self.assertGreater(sum(h.score for h in hits), sum(h.score for h in hits2))

    def test_child_of_roblox_is_suspicious(self):
        hits = self.analyzer.analyze_process({
            "pid": 9, "name": "helper.exe", "exe": r"C:\Users\bob\Documents\helper.exe",
            "cmdline": "", "parent_name": "RobloxPlayerBeta.exe",
        })
        self.assertTrue(any(h.kind == "roblox_child" for h in hits))

    def test_defender_tampering_command_is_critical(self):
        hits = self.analyzer.analyze_process({
            "pid": 11, "name": "cmd.exe", "exe": r"C:\Users\bob\Downloads\loader.exe",
            "cmdline": "powershell Set-MpPreference -DisableRealtimeMonitoring $true",
            "parent_name": "explorer.exe",
        })
        self.assertTrue(any(h.severity == "critical" for h in hits))

    def test_user_blacklist_beats_everything(self):
        config = make_config(blacklist={"names": ["custom.exe"]})
        analyzer = Analyzer(config, make_db())
        hits = analyzer.analyze_process({"pid": 3, "name": "custom.exe",
                                         "exe": r"D:\stuff\custom.exe", "cmdline": ""})
        self.assertTrue(any(h.kind == "user_blacklist" for h in hits))

    def test_whitelist_beats_the_blacklist(self):
        config = make_config(whitelist={"names": ["krnl.exe"]})
        analyzer = Analyzer(config, make_db())
        self.assertEqual(analyzer.analyze_process(
            {"pid": 3, "name": "krnl.exe", "exe": r"D:\krnl.exe", "cmdline": ""}), [])


class AnalyzerFileTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = Analyzer(make_config(), make_db())

    def test_double_extension_is_detected(self):
        hits = self.analyzer.analyze_file(r"C:\Users\bob\Downloads\script.lua.exe")
        self.assertTrue(any(h.signature_id == "generic.double-ext" for h in hits))

    def test_bypass_naming_is_detected(self):
        hits = self.analyzer.analyze_file(r"C:\Users\bob\Downloads\byfron-bypass-2024.exe")
        self.assertTrue(hits)

    def test_downloaded_executor_exe_is_detected_by_name(self):
        hits = self.analyzer.analyze_file(r"C:\Users\bob\Downloads\krnl.exe")
        self.assertTrue(any("KRNL" in h.message for h in hits))

    def test_ordinary_download_is_clean(self):
        self.assertEqual(self.analyzer.analyze_file(r"C:\Users\bob\Downloads\holiday-photo.zip"), [])

    def test_known_hash_is_detected(self):
        db = make_db()
        digest = "aa" * 32
        db.ingest({"hashes": {digest: {"name": "Test Sample", "severity": "critical"}}})
        analyzer = Analyzer(make_config(), db)
        hits = analyzer.analyze_file(r"D:\downloads\anything.exe", sha256=digest)
        self.assertTrue(any(h.kind == "known_hash" and h.severity == "critical" for h in hits))


class AnalyzerNetworkTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = Analyzer(make_config(blacklist={"ips": ["203.0.113.5"]}), make_db())

    def test_blacklisted_ip(self):
        hits = self.analyzer.analyze_connection({
            "pid": 5, "process_name": "thing.exe", "exe": r"D:\thing.exe",
            "remote_ip": "203.0.113.5", "remote_port": 443, "local_port": 51000, "status": "ESTABLISHED",
        })
        self.assertTrue(any(h.severity == "critical" for h in hits))

    def test_suspicious_listen_port(self):
        hits = self.analyzer.analyze_connection({
            "pid": 5, "process_name": "thing.exe", "exe": r"D:\thing.exe",
            "remote_ip": "198.51.100.7", "remote_port": 80, "local_port": 6969, "status": "LISTEN",
        })
        self.assertTrue(any(h.kind == "listening_port" for h in hits))

    def test_private_ip_helper(self):
        for ip in ("127.0.0.1", "192.168.1.10", "10.0.0.5", "::1"):
            self.assertTrue(is_private(ip), ip)
        self.assertFalse(is_private("8.8.8.8"))


class AggregatorTests(unittest.TestCase):
    def test_scores_accumulate_across_distinct_signals(self):
        aggregator = Aggregator(action_threshold=100)
        aggregator.add(Detection(source="process", kind="a", subject="C:/x/y.exe",
                                 message="m", severity="medium", signature_id="s1"))
        self.assertFalse(aggregator.should_act("C:/x/y.exe"))
        aggregator.add(Detection(source="process", kind="b", subject="C:/x/y.exe",
                                 message="m", severity="high", signature_id="s2"))
        self.assertTrue(aggregator.should_act("C:/x/y.exe"))

    def test_repeat_of_the_same_signal_does_not_stack(self):
        aggregator = Aggregator(action_threshold=100)
        for _ in range(5):
            _, is_new = aggregator.add(Detection(source="process", kind="a", subject="C:/x/y.exe",
                                                 message="m", severity="high", signature_id="s1"))
        self.assertFalse(is_new)
        self.assertFalse(aggregator.should_act("C:/x/y.exe"))

    def test_subject_matching_ignores_case_and_separators(self):
        aggregator = Aggregator(action_threshold=50)
        aggregator.add(Detection(source="process", kind="a", subject=r"C:\X\Y.exe",
                                 message="m", severity="high", signature_id="s1"))
        self.assertTrue(aggregator.should_act("c:/x/y.exe"))

    def test_acted_subjects_are_not_actioned_twice(self):
        aggregator = Aggregator(action_threshold=10)
        aggregator.add(Detection(source="process", kind="a", subject="s",
                                 message="m", severity="high", signature_id="s1"))
        aggregator.mark_acted("s")
        self.assertFalse(aggregator.should_act("s"))

    def test_severity_for_score(self):
        self.assertEqual(severity_for(5), "info")
        self.assertEqual(severity_for(45), "medium")
        self.assertEqual(severity_for(120), "critical")


class EventLogTests(unittest.TestCase):
    def test_chain_verifies_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = EventLog(Path(tmp))
            for index in range(5):
                log.write({"event": "detection", "n": index})
            reopened = EventLog(Path(tmp))
            reopened.write({"event": "detection", "n": 5})
            ok, count, message = verify_chain(reopened.path)
            self.assertTrue(ok, message)
            self.assertEqual(count, 6)

    def test_tampering_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = EventLog(Path(tmp))
            for index in range(4):
                log.write({"event": "detection", "n": index})
            lines = log.path.read_text(encoding="utf-8").splitlines()
            del lines[1]  # malware snips the record about itself
            log.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            ok, line, message = verify_chain(log.path)
            self.assertFalse(ok)
            self.assertEqual(line, 2)
            self.assertIn("chain broken", message)

    def test_rotation_keeps_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = EventLog(Path(tmp), max_bytes=512, keep=3)
            for index in range(100):
                log.write({"event": "detection", "n": index, "pad": "x" * 40})
            self.assertTrue((Path(tmp) / "execguard.jsonl.1").exists())
            self.assertTrue(verify_chain(log.path)[0])


class ResponderTests(unittest.TestCase):
    def test_quarantine_defangs_and_restores_exactly(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = Config({"paths": {"quarantine": str(root / "q"), "logs": str(root / "logs"),
                                       "data": str(root / "data")}}, root / "config.json")
            responder = Responder(config)
            sample = root / "evil.exe"
            payload = b"MZ\x90\x00 not really a program"
            sample.write_bytes(payload)

            result = responder.quarantine(sample, forced=True)
            self.assertTrue(result.ok, result.detail)
            self.assertFalse(sample.exists())

            entries = responder.list_quarantine()
            self.assertEqual(len(entries), 1)
            stored = Path(entries[0]["quarantine_file"])
            self.assertNotEqual(stored.read_bytes(), payload, "quarantined file must be defanged")

            restore = responder.restore(stored)
            self.assertTrue(restore.ok, restore.detail)
            self.assertEqual(sample.read_bytes(), payload)

    def test_enforce_acts_on_a_single_high_confidence_detection(self):
        """A named executor scores 75; the default threshold must not sit above it."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = Config({"response": {"mode": "enforce", "auto_quarantine": True},
                             "paths": {"quarantine": str(root / "q"), "logs": str(root / "logs"),
                                       "data": str(root / "data")}}, root / "config.json")
            sample = root / "krnl.exe"
            sample.write_bytes(b"MZ")
            detection = Analyzer(config, make_db()).analyze_file(str(sample))[0]
            self.assertEqual(detection.score, 75)
            results = Responder(config).respond(detection, verdict_score=detection.score)
            self.assertTrue(results and results[0].ok, [str(r) for r in results])
            self.assertFalse(sample.exists())

    def test_actions_are_refused_in_observe_mode(self):
        config = make_config()
        responder = Responder(config)
        self.assertFalse(responder.allowed("kill"))
        result = responder.kill(999999, "whatever.exe")
        self.assertFalse(result.ok)
        self.assertIn("auto-kill is off", result.detail)

    def test_protected_processes_are_never_killed(self):
        config = make_config(response={"mode": "enforce", "auto_kill": True})
        responder = Responder(config)
        result = responder.kill(4, "explorer.exe", forced=True)
        self.assertFalse(result.ok)
        self.assertIn("protected-process list", result.detail)

    def test_block_ip_rejects_garbage(self):
        config = make_config(response={"mode": "enforce", "auto_firewall": True})
        result = Responder(config).block_ip("not-an-ip; del /f /s /q C:\\", forced=True)
        self.assertFalse(result.ok)
        self.assertIn("not a valid IP", result.detail)


if __name__ == "__main__":
    unittest.main(verbosity=2)
