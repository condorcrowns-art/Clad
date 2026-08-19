"""Tests for credential-store auditing and protection levels.

The account is not lost when the executor runs. It is lost when something
reads `.ROBLOSECURITY` out of the cookie database. These tests are about
seeing that read, and about not drowning the user in the thousand legitimate
reads that happen every day.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import levels  # noqa: E402
from candy.config import Config  # noqa: E402
from candy.credguard import (AUDIT_EVENTS, CANARY_MARKER, OBJECT_ACCESS_EVENT,  # noqa: E402
                             STORES, CredentialGuard, audit_command, is_canary,
                             known_stores, match_store)
from candy.winevents import SECURITY_CHANNEL, WindowsEventAnalyzer  # noqa: E402


def config_for(tmp: str, **overrides) -> Config:
    root = Path(tmp)
    data = {"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                      "quarantine": str(root / "q")}}
    data.update(overrides)
    return Config(data, root / "config.json")


def access_event(object_name: str, process: str, event_id: int = OBJECT_ACCESS_EVENT) -> dict:
    return {"event_id": event_id, "channel": SECURITY_CHANNEL,
            "data": {"ObjectName": object_name, "ProcessName": process,
                     "ProcessId": "0x1a4", "AccessList": "%%4416"}}


class StoreTests(unittest.TestCase):
    def test_the_roblox_session_store_is_covered(self):
        labels = " ".join(store.label for store in STORES).lower()
        self.assertIn("roblox", labels)

    def test_every_store_names_who_owns_it(self):
        """Without an owner list, the browser reading its own cookies is an
        alert, and the tool gets uninstalled on day one."""
        for store in STORES:
            with self.subTest(store=store.label):
                self.assertTrue(store.owners, f"{store.label} has no owning process")

    def test_matching_is_by_longest_prefix(self):
        store = match_store(r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Login Data"
                            .replace("%LOCALAPPDATA%", str(Path.home())))
        self.assertTrue(store is None or "Chromium" in store.label)

    def test_an_unrelated_path_matches_nothing(self):
        self.assertIsNone(match_store(r"C:\Windows\System32\notepad.exe"))

    def test_extra_stores_can_be_added_by_the_user(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp, credguard={"extra_stores": [
                {"label": "My wallet", "path": str(Path(tmp) / "wallet"),
                 "owners": ["wallet.exe"]}]})
            self.assertTrue(any(s.label == "My wallet" for s in known_stores(config)))

    def test_the_audit_command_is_an_audit_not_a_permission_change(self):
        """/setaudit adds a SACL entry. /grant would change who can read the
        file, which is not something a monitoring tool should ever do."""
        command = audit_command(r"C:\x\Cookies")
        self.assertIn("/setaudit", command)
        self.assertNotIn("/grant", command)
        self.assertNotIn("/deny", command)


class AssessmentTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = config_for(self.tmp.name)
        self.guard = CredentialGuard(self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def _chrome_cookies(self) -> str:
        from candy.util import expand_path

        return str(expand_path(
            r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies"))

    def test_a_stealer_reading_the_cookie_database_is_a_finding(self):
        finding = self.guard.assess(object_name=self._chrome_cookies(),
                                    process_image=r"C:\Users\p\Downloads\krnl.exe")
        self.assertIsNotNone(finding)
        self.assertEqual(finding.severity, "critical")
        self.assertGreaterEqual(finding.score, 100)

    def test_the_browser_reading_its_own_cookies_is_not(self):
        self.assertIsNone(self.guard.assess(
            object_name=self._chrome_cookies(),
            process_image=r"C:\Program Files\Google\Chrome\Application\chrome.exe"))

    def test_windows_components_are_not_findings(self):
        for image in (r"C:\Windows\System32\svchost.exe",
                      r"C:\Windows\System32\SearchIndexer.exe",
                      r"C:\ProgramData\Microsoft\Windows Defender\MsMpEng.exe"):
            with self.subTest(image=image):
                self.assertIsNone(self.guard.assess(
                    object_name=self._chrome_cookies(), process_image=image))

    def test_a_whitelisted_process_is_not_a_finding(self):
        self.config.add_list_entry("whitelist", "names", "mytool.exe")
        self.assertIsNone(self.guard.assess(object_name=self._chrome_cookies(),
                                            process_image=r"C:\x\mytool.exe"))

    def test_an_explicitly_allowed_process_is_not_a_finding(self):
        self.config.set("credguard.allow_processes", ["backup.exe"])
        self.assertIsNone(self.guard.assess(object_name=self._chrome_cookies(),
                                            process_image=r"C:\x\backup.exe"))

    def test_a_path_that_is_not_a_store_is_ignored(self):
        self.assertIsNone(self.guard.assess(object_name=r"C:\Windows\win.ini",
                                            process_image=r"C:\x\thing.exe"))

    def test_the_reason_says_what_was_taken_and_why_it_matters(self):
        finding = self.guard.assess(object_name=self._chrome_cookies(),
                                    process_image=r"C:\x\stealer.exe")
        text = " ".join(finding.reasons).lower()
        self.assertIn("roblosecurity", text)


class CanaryTests(unittest.TestCase):
    """A decoy is the cleanest signal available: nothing legitimate knows it
    exists, so one access is not a heuristic."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.guard = CredentialGuard(config_for(self.tmp.name))

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_decoy_filename_is_recognised(self):
        self.assertTrue(is_canary(r"C:\Users\p\Documents\wallet.dat"))
        self.assertFalse(is_canary(r"C:\Users\p\Documents\homework.docx"))

    def test_touching_a_decoy_scores_higher_than_a_real_store(self):
        canary = self.guard.assess(object_name=r"C:\Users\p\Documents\wallet.dat",
                                   process_image=r"C:\x\thing.exe")
        self.assertTrue(canary.canary)
        self.assertEqual(canary.severity, "critical")
        self.assertGreater(canary.score, 110)

    def test_even_a_plausible_process_touching_a_decoy_is_a_finding(self):
        """There is no owner list for a decoy — nothing owns a file that is not
        supposed to exist."""
        finding = self.guard.assess(object_name=r"C:\Users\p\Documents\wallet.dat",
                                    process_image=r"C:\x\chrome.exe")
        self.assertIsNotNone(finding)

    def test_the_decoy_body_says_what_it_is(self):
        from candy.credguard import CANARY_BODY

        self.assertIn(CANARY_MARKER, CANARY_BODY)
        self.assertIn("decoy", CANARY_BODY.lower())


class EventPlumbingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = config_for(self.tmp.name)
        self.guard = CredentialGuard(self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def test_an_object_access_record_becomes_a_finding(self):
        from candy.util import expand_path

        record = access_event(
            str(expand_path(r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Login Data")),
            r"C:\Users\p\Downloads\loader.exe")
        finding = self.guard.from_event(record)
        self.assertIsNotNone(finding)
        self.assertEqual(finding.process_id, 0x1a4)

    def test_records_that_are_not_object_access_are_ignored(self):
        record = access_event("x", "y")
        record["event_id"] = 4688
        self.assertIsNone(self.guard.from_event(record))

    def test_all_three_audit_event_ids_are_handled(self):
        for event_id in AUDIT_EVENTS:
            with self.subTest(event_id=event_id):
                record = access_event(r"C:\Users\p\Documents\wallet.dat",
                                      r"C:\x\thing.exe", event_id=event_id)
                self.assertIsNotNone(self.guard.from_event(record))

    def test_the_security_channel_analyzer_routes_object_access(self):
        """End to end through the same path the live monitor uses."""
        from candy.detect import Analyzer
        from test_core import make_db

        analyzer = WindowsEventAnalyzer(self.config, Analyzer(self.config, make_db()))
        detections = analyzer.analyze(access_event(
            r"C:\Users\p\Documents\wallet.dat", r"C:\Users\p\Downloads\krnl.exe"))
        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0].source, "credguard")
        self.assertEqual(detections[0].severity, "critical")

    def test_a_detection_carries_the_evidence(self):
        finding = self.guard.assess(object_name=r"C:\Users\p\Documents\wallet.dat",
                                    process_image=r"C:\x\thing.exe")
        detection = self.guard.to_detection(finding)
        self.assertEqual(detection.process_name, "thing.exe")
        self.assertIn("canary", detection.signature_id)
        self.assertTrue(detection.evidence)

    def test_status_works_off_windows(self):
        status = self.guard.status()
        self.assertIn("platform", status)
        self.assertIsInstance(status["stores_known"], int)

    def test_arming_off_windows_is_honest_about_it(self):
        result = self.guard.arm()
        self.assertFalse(result.ok)
        self.assertIn("Windows-only", result.detail)


class LevelTests(unittest.TestCase):
    def test_every_level_states_what_it_breaks(self):
        """A level that only lists benefits is marketing, not a security
        control."""
        for name in levels.ORDER:
            with self.subTest(level=name):
                level = levels.LEVELS[name]
                self.assertTrue(level.breaks.strip())
                self.assertTrue(level.headline.strip())

    def test_levels_get_stricter_in_order(self):
        thresholds = [levels.LEVELS[name].settings["response"]["response.action_threshold"]
                      for name in levels.ORDER]
        self.assertEqual(thresholds, sorted(thresholds, reverse=True))

    def test_relaxed_changes_nothing_about_the_system(self):
        self.assertEqual(levels.LEVELS["relaxed"].actions, {})
        self.assertFalse(levels.LEVELS["relaxed"].needs_admin)

    def test_only_fortress_rejects_every_unsigned_download(self):
        for name in levels.ORDER:
            policy = levels.LEVELS[name].settings["downloads"].get("download_guard.policy")
            if name == "fortress":
                self.assertEqual(policy, "fortress")
            else:
                self.assertNotEqual(policy, "fortress")

    def test_applying_a_level_writes_its_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            levels.apply(config, "strict")
            self.assertEqual(config.get("response.mode"), "enforce")
            self.assertTrue(config.get("dns.enabled"))
            self.assertEqual(config.get("response.action_threshold"), 60)

    def test_a_plan_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            before = config.get("response.mode")
            result = levels.plan(config, "fortress")
            self.assertEqual(config.get("response.mode"), before)
            self.assertTrue(result.changed)

    def test_one_area_can_be_applied_without_the_others(self):
        """The whole point of the areas: fortress-grade downloads without the
        firewall lockdown."""
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            levels.apply(config, "fortress", ["downloads"])
            self.assertEqual(config.get("download_guard.policy"), "fortress")
            self.assertEqual(config.get("response.mode"), "observe")
            self.assertFalse(config.get("dns.enabled"))

    def test_an_unknown_level_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                levels.plan(config_for(tmp), "maximum")

    def test_an_unknown_area_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                levels.plan(config_for(tmp), "strict", ["everything"])

    def test_current_reads_the_settings_not_the_label(self):
        """Changing one toggle by hand must report 'custom' rather than the
        machine claiming a posture it no longer has."""
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            levels.apply(config, "strict")
            self.assertEqual(levels.current(config), "strict")
            config.set("download_guard.policy", "off")
            self.assertEqual(levels.current(config), "custom")

    def test_the_stored_label_does_not_override_reality(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            config.set("protection.level", "fortress")
            self.assertNotEqual(levels.current(config), "fortress")

    def test_every_level_covers_every_area(self):
        for name in levels.ORDER:
            with self.subTest(level=name):
                self.assertEqual(set(levels.LEVELS[name].settings), set(levels.AREAS))

    def test_actions_are_all_recognised(self):
        from candy.levels import _ACTION_WORDS

        for level in levels.LEVELS.values():
            for actions in level.actions.values():
                for action in actions:
                    self.assertIn(action, _ACTION_WORDS)

    def test_scan_depth_varies_with_the_level(self):
        """'Variability with virus scanning' — a scheduled sweep should be a
        light pass at relaxed and a real one at fortress."""
        profiles = [levels.LEVELS[name].settings["scanning"].get("scan.profile")
                    for name in levels.ORDER]
        self.assertEqual(profiles[0], "light")
        self.assertEqual(profiles[-1], "full")

    def test_every_level_bounds_its_scheduled_scan(self):
        """A scheduled scan with no time budget can run away with the machine,
        which is how a security tool ends up disabled."""
        for name in levels.ORDER:
            with self.subTest(level=name):
                budget = levels.LEVELS[name].settings["scanning"].get("scan.budget_minutes")
                self.assertTrue(budget and budget > 0)

    def test_credential_watching_is_off_at_relaxed_and_on_above_it(self):
        self.assertFalse(
            levels.LEVELS["relaxed"].settings["credentials"]["credguard.enabled"])
        for name in ("standard", "strict", "fortress"):
            self.assertTrue(
                levels.LEVELS[name].settings["credentials"]["credguard.enabled"])

    def test_the_plan_is_readable(self):
        with tempfile.TemporaryDirectory() as tmp:
            text = levels.format_plan(levels.plan(config_for(tmp), "fortress"))
            self.assertIn("fortress", text)
            self.assertIn("administrator", text.lower())


if __name__ == "__main__":
    unittest.main()
