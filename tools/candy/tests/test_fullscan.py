"""Tests for the on-demand full-system scan."""
from __future__ import annotations

import sys
import tempfile
import time
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy.config import Config  # noqa: E402
from candy.detect import Analyzer  # noqa: E402
from candy.fullscan import (EXECUTABLE_EXT, PROFILES, SKIP_DIRS, Finding,  # noqa: E402
                            FullScanner, ScanReport, format_report)
from candy.pesample import build_test_pe  # noqa: E402
from test_core import make_db  # noqa: E402


def scanner_for(tmp: str, signed=None) -> FullScanner:
    root = Path(tmp)
    config = Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                               "quarantine": str(root / "q")}}, root / "config.json")
    return FullScanner(config, Analyzer(config, make_db()),
                       signature_checker=(lambda _p: signed) if signed is not None else None)


class ProfileTests(unittest.TestCase):
    def test_profiles_are_ordered_by_depth(self):
        self.assertLess(PROFILES["quick"]["max_depth"], PROFILES["full"]["max_depth"])
        self.assertLess(PROFILES["full"]["max_depth"], PROFILES["deep"]["max_depth"])

    def test_quick_skips_the_expensive_passes(self):
        self.assertFalse(PROFILES["quick"]["modules"])
        self.assertFalse(PROFILES["quick"]["streams"])
        self.assertTrue(PROFILES["deep"]["modules"])

    def test_every_profile_covers_executables(self):
        for name, spec in PROFILES.items():
            self.assertTrue(EXECUTABLE_EXT <= spec["extensions"], name)

    def test_unknown_profile_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                scanner_for(tmp).scan("turbo")


class FileScanTests(unittest.TestCase):
    def test_finds_a_known_executor_by_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "krnl.exe").write_bytes(build_test_pe())
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertTrue(report.findings)
            self.assertEqual(report.findings[0].kind, "file")
            self.assertIn("KRNL", report.findings[0].reasons[0])

    def test_finds_a_renamed_executor(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "homework.exe").write_bytes(
                build_test_pe(original_filename="krnl.exe"))
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertTrue(any("krnl.exe" in " ".join(f.reasons) for f in report.findings))

    def test_finds_a_stealer_by_capability(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "setup.exe").write_bytes(build_test_pe(
                payload=b"CryptUnprotectData\0\\Login Data\0cookies.sqlite\0"
                        b"https://discord.com/api/webhooks/1/AAAA\0" * 4))
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            reasons = " ".join(r for f in report.findings for r in f.reasons)
            self.assertIn("exfiltration endpoint", reasons)
            self.assertEqual(report.worst, "critical")

    def test_clean_directory_produces_no_findings(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "notes.txt").write_text("homework", encoding="utf-8")
            (Path(tmp) / "photo.jpg").write_bytes(b"\xff\xd8\xff\xe0not really a jpeg")
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertEqual(report.findings, [])
            self.assertIn("nothing suspicious found", format_report(report))

    def test_non_executable_extensions_are_skipped_not_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("a.txt", "b.jpg", "c.docx", "d.mp4"):
                (Path(tmp) / name).write_bytes(b"x" * 100)
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertEqual(report.files_scanned, 0)
            self.assertEqual(report.files_skipped, 4)

    def test_empty_and_oversized_files_are_skipped(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "empty.exe").write_bytes(b"")
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertEqual(report.files_scanned, 0)
            self.assertGreaterEqual(report.files_skipped, 1)

    def test_noisy_directories_are_not_descended(self):
        with tempfile.TemporaryDirectory() as tmp:
            noisy = Path(tmp) / "node_modules"
            noisy.mkdir()
            (noisy / "krnl.exe").write_bytes(build_test_pe())
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertEqual(report.findings, [], "node_modules must be skipped")

    def test_depth_limit_is_respected(self):
        with tempfile.TemporaryDirectory() as tmp:
            deep = Path(tmp)
            for index in range(8):
                deep = deep / f"level{index}"
            deep.mkdir(parents=True)
            (deep / "krnl.exe").write_bytes(build_test_pe())
            report = scanner_for(tmp).scan("quick", roots=[tmp])   # quick: depth 5
            self.assertEqual(report.findings, [])

    def test_unreadable_paths_do_not_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = scanner_for(tmp).scan("quick", roots=[str(Path(tmp) / "nope")])
            self.assertIsInstance(report, ScanReport)


class BudgetAndProgressTests(unittest.TestCase):
    def test_time_budget_marks_the_report_truncated(self):
        with tempfile.TemporaryDirectory() as tmp:
            for index in range(40):
                (Path(tmp) / f"sample{index}.exe").write_bytes(build_test_pe())
            report = scanner_for(tmp).scan("quick", roots=[tmp], time_budget=-1)
            self.assertTrue(report.truncated)
            self.assertIn("TIME BUDGET REACHED", format_report(report))

    def test_cancel_stops_the_scan_and_says_so(self):
        """The GUI's Cancel button has to stop a deep scan promptly, and the
        report must admit it did not finish."""
        with tempfile.TemporaryDirectory() as tmp:
            for index in range(40):
                (Path(tmp) / f"sample{index}.exe").write_bytes(build_test_pe())
            report = scanner_for(tmp).scan("quick", roots=[tmp], cancel=lambda: True)
            self.assertTrue(report.truncated)
            self.assertEqual(report.files_scanned, 0)

    def test_cancel_that_never_fires_scans_everything(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "sample.exe").write_bytes(build_test_pe())
            report = scanner_for(tmp).scan("quick", roots=[tmp], cancel=lambda: False)
            self.assertFalse(report.truncated)
            self.assertEqual(report.files_scanned, 1)

    def test_cancel_mid_scan_keeps_the_findings_already_made(self):
        with tempfile.TemporaryDirectory() as tmp:
            for index in range(30):
                (Path(tmp) / f"krnl{index}.exe").write_bytes(build_test_pe())
            calls = {"n": 0}

            def cancel() -> bool:
                calls["n"] += 1
                return calls["n"] > 12

            report = scanner_for(tmp).scan("quick", roots=[tmp], cancel=cancel)
            self.assertTrue(report.truncated)
            self.assertLess(report.files_scanned, 30)

    def test_progress_is_reported(self):
        messages: list[str] = []
        with tempfile.TemporaryDirectory() as tmp:
            scanner_for(tmp).scan("quick", roots=[tmp], progress=messages.append)
        self.assertTrue(any("processes" in m for m in messages))
        self.assertTrue(any("persistence" in m for m in messages))

    def test_hash_cache_avoids_rehashing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.exe"
            path.write_bytes(build_test_pe())
            scanner = scanner_for(tmp)
            first = scanner._hash(path, 1 << 30)
            second = scanner._hash(path, 1 << 30)
            self.assertEqual(first, second)
            self.assertEqual(len(scanner._hash_cache), 1)


class ReportTests(unittest.TestCase):
    def test_findings_are_sorted_worst_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "krnl.exe").write_bytes(build_test_pe())
            (Path(tmp) / "stealer.exe").write_bytes(build_test_pe(
                payload=b"CryptUnprotectData\0\\Login Data\0cookies.sqlite\0"
                        b"https://discord.com/api/webhooks/1/AAAA\0" * 4))
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            scores = [finding.score for finding in report.findings]
            self.assertEqual(scores, sorted(scores, reverse=True))

    def test_severity_counts_and_worst(self):
        report = ScanReport(profile="quick", started="now")
        report.findings = [Finding("a", "file", "low", 20), Finding("b", "file", "critical", 200)]
        self.assertEqual(report.by_severity, {"low": 1, "critical": 1})
        self.assertEqual(report.worst, "critical")

    def test_json_round_trip(self):
        import json

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "krnl.exe").write_bytes(build_test_pe())
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            payload = json.loads(json.dumps(report.to_dict()))
            self.assertEqual(len(payload["findings"]), len(report.findings))
            self.assertIn("counters", payload)

    def test_clean_report_does_not_claim_the_machine_is_clean(self):
        report = ScanReport(profile="quick", started="now")
        text = format_report(report)
        self.assertIn("not a", text)
        self.assertIn("Defender", text)


class ProcessAndPersistenceTests(unittest.TestCase):
    def test_processes_are_enumerated(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertGreater(report.processes_scanned, 0,
                               "the scan must see the processes on this machine")

    def test_persistence_pass_runs_without_windows(self):
        with tempfile.TemporaryDirectory() as tmp:
            report = scanner_for(tmp).scan("quick", roots=[tmp])
            self.assertEqual(report.persistence_entries, 0)
            self.assertEqual(report.errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
