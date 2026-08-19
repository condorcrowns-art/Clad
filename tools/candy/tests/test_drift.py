"""Tests for trust drift — the exit-scam case.

The scenario every test here is about: a program was honest when the user
whitelisted it, and a later version is not. Nothing can judge the new build's
intent. The requirement is narrower and achievable — trust must not survive
the bytes it was granted to.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy.config import Config  # noqa: E402
from candy.detect import Analyzer  # noqa: E402
from candy.drift import (DRIFT_SCORE, DRIFTABLE_FIELDS, TrustLedger,  # noqa: E402
                         format_report)
from candy.guard import DownloadGuard  # noqa: E402
from candy.pesample import build_test_pe  # noqa: E402
from test_core import make_db  # noqa: E402


def config_for(tmp: str) -> Config:
    root = Path(tmp)
    return Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                             "quarantine": str(root / "q")}}, root / "config.json")


def guard_for(config: Config, signed: bool | None = False) -> DownloadGuard:
    checker = (lambda _p: signed)
    return DownloadGuard(config, Analyzer(config, make_db(), signature_checker=checker),
                         None, signature_checker=checker)


class PinTests(unittest.TestCase):
    def test_pin_records_the_build_that_was_there(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            ledger = TrustLedger(config, signature_checker=lambda _p: True)
            pin = ledger.pin(app, field="paths", subject=str(app))
            self.assertIsNotNone(pin)
            self.assertEqual(len(pin.sha256), 64)
            self.assertTrue(pin.signed)
            self.assertGreater(pin.size, 0)
            self.assertTrue(pin.pinned_at)

    def test_pin_of_a_missing_file_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger = TrustLedger(config_for(tmp))
            self.assertIsNone(ledger.pin(Path(tmp) / "nothing.exe"))

    def test_pins_survive_a_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            TrustLedger(config).pin(app)
            self.assertIsNotNone(TrustLedger(config).pin_for(app))

    def test_a_corrupt_ledger_does_not_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            ledger = TrustLedger(config)
            ledger.path.parent.mkdir(parents=True, exist_ok=True)
            ledger.path.write_text("{not json", encoding="utf-8")
            self.assertEqual(TrustLedger(config).load(), {})

    def test_pin_whitelist_covers_path_entries(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "trusted.exe"
            app.write_bytes(build_test_pe())
            config.add_list_entry("whitelist", "paths", str(app))
            self.assertEqual(TrustLedger(config).pin_whitelist(), 1)

    def test_hashes_are_not_a_driftable_field(self):
        """A hash entry names the bytes, so it cannot be inherited by a
        different build. Only labels drift."""
        self.assertNotIn("hashes", DRIFTABLE_FIELDS)
        self.assertEqual(set(DRIFTABLE_FIELDS), {"names", "paths"})


class DriftDetectionTests(unittest.TestCase):
    def test_unchanged_file_does_not_drift(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            ledger = TrustLedger(config)
            ledger.pin(app)
            self.assertIsNone(ledger.drifted(app))

    def test_changed_file_drifts(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            ledger = TrustLedger(config)
            pin = ledger.pin(app)
            app.write_bytes(build_test_pe() + b"\x00payload")
            finding = ledger.drifted(app)
            self.assertIsNotNone(finding)
            self.assertEqual(finding.expected, pin.sha256)
            self.assertNotEqual(finding.found, pin.sha256)

    def test_a_file_with_no_pin_never_drifts(self):
        with tempfile.TemporaryDirectory() as tmp:
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            self.assertIsNone(TrustLedger(config_for(tmp)).drifted(app))

    def test_check_reports_a_changed_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            config.add_list_entry("whitelist", "paths", str(app))
            TrustLedger(config).pin(app, field="paths", subject=str(app))
            app.write_bytes(build_test_pe() + b"\x00v2")
            report = TrustLedger(config).check()
            self.assertFalse(report.ok)
            self.assertEqual(report.checked, 1)
            self.assertEqual(report.findings[0].action, "reported")

    def test_check_with_revoke_removes_the_trust_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            config.add_list_entry("whitelist", "paths", str(app))
            TrustLedger(config).pin(app, field="paths", subject=str(app))
            app.write_bytes(build_test_pe() + b"\x00v2")

            ledger = TrustLedger(config)
            report = ledger.check(revoke=True)
            self.assertEqual(report.findings[0].action, "trust revoked")
            self.assertNotIn(str(app), config.get("whitelist.paths") or [])
            self.assertFalse(config.is_whitelisted(path=str(app)))
            self.assertEqual(TrustLedger(config).load(), {})

    def test_a_deleted_trusted_file_is_reported_but_the_pin_is_kept(self):
        """If the binary comes back, it must be re-checked against the build
        that was trusted — so losing the pin here would lose the defence."""
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            TrustLedger(config).pin(app)
            app.unlink()
            report = TrustLedger(config).check()
            self.assertEqual(report.missing, 1)
            self.assertIn("gone", report.findings[0].problem)
            self.assertEqual(len(TrustLedger(config).load()), 1)

    def test_losing_a_signature_is_called_out_specifically(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            TrustLedger(config, signature_checker=lambda _p: True).pin(app)
            app.write_bytes(build_test_pe() + b"\x00v2")
            report = TrustLedger(config, signature_checker=lambda _p: False).check()
            self.assertIn("lost its valid signature", report.findings[0].problem)

    def test_name_only_trust_is_reported_as_unverifiable(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            config.add_list_entry("whitelist", "names", "helper.exe")
            self.assertEqual(TrustLedger(config).unverifiable(), ["helper.exe"])

    def test_forget_drops_a_pin(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            ledger = TrustLedger(config)
            ledger.pin(app)
            self.assertTrue(ledger.forget(app))
            self.assertFalse(ledger.forget(app))

    def test_report_is_readable(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            TrustLedger(config).pin(app)
            app.write_bytes(build_test_pe() + b"\x00v2")
            text = format_report(TrustLedger(config).check(), unverifiable=["helper.exe"])
            self.assertIn("CHANGED", text.upper())
            self.assertIn("helper.exe", text)
            self.assertIn("ANY file with that name", text)


class GuardIntegrationTests(unittest.TestCase):
    """The exit scam, end to end: trusted yesterday, replaced today."""

    def _trusted_app(self, tmp: str, config: Config, signed: bool):
        app = Path(tmp) / "CoolUtility.exe"
        app.write_bytes(build_test_pe())
        config.add_list_entry("whitelist", "paths", str(app))
        TrustLedger(config, signature_checker=lambda _p: signed).pin(
            app, field="paths", subject=str(app))
        return app

    def test_an_unchanged_trusted_file_still_clears_instantly(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = self._trusted_app(tmp, config, signed=True)
            verdict = guard_for(config, signed=True).assess(app)
            self.assertEqual(verdict.action, "allow")
            self.assertIn("on your whitelist", verdict.clearances)
            self.assertEqual(verdict.score, 0)

    def test_an_unsigned_trusted_file_that_changed_is_quarantined(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = self._trusted_app(tmp, config, signed=False)
            app.write_bytes(build_test_pe() + b"\x00stealer")
            verdict = guard_for(config, signed=False).assess(app)
            self.assertEqual(verdict.action, "quarantine")
            self.assertGreaterEqual(verdict.score, DRIFT_SCORE)
            self.assertTrue(any("changed since you trusted it" in reason
                                for reason in verdict.reasons))

    def test_a_signed_trusted_file_that_changed_is_still_surfaced(self):
        """A signed update is the normal case for honest software, so this
        warns rather than quarantining — but it is never silent."""
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = self._trusted_app(tmp, config, signed=True)
            app.write_bytes(build_test_pe() + b"\x00v2")
            verdict = guard_for(config, signed=True).assess(app)
            self.assertNotEqual(verdict.action, "allow")
            self.assertNotIn("on your whitelist", verdict.clearances)
            self.assertIsNotNone(verdict.drift)

    def test_the_drift_is_carried_into_the_verdict_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = self._trusted_app(tmp, config, signed=False)
            app.write_bytes(build_test_pe() + b"\x00v2")
            payload = guard_for(config, signed=False).assess(app).to_dict()
            self.assertIsNotNone(payload["drift"])
            self.assertEqual(payload["drift"]["field"], "paths")
            self.assertTrue(json.dumps(payload))

    def test_trust_by_hash_is_unaffected(self):
        """Trusting the exact bytes cannot be inherited by a later build, so it
        needs no pin and must not be second-guessed."""
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            app = Path(tmp) / "app.exe"
            app.write_bytes(build_test_pe())
            from candy.util import sha256_file

            config.add_list_entry("whitelist", "hashes", sha256_file(app, max_bytes=None))
            verdict = guard_for(config, signed=False).assess(app)
            self.assertEqual(verdict.action, "allow")
            self.assertIn("on your whitelist", verdict.clearances)


if __name__ == "__main__":
    unittest.main()
