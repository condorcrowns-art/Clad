"""Is the machine actually protected, and does an upgrade keep it that way?

Candy v9 was unpacked into a new folder beside v8 — the only way there is to
upgrade a portable tool. It came up in observe mode, with no baseline, no
record of the credential stores it had armed, and a 200-line report that said
so nowhere near the top. The person running it read the whole thing and
concluded it was fine.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import posture  # noqa: E402
from candy.config import Config  # noqa: E402


def config_for(tmp: str, **response) -> Config:
    root = Path(tmp)
    data = {"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                      "quarantine": str(root / "q")},
            "response": {"mode": "enforce", "auto_kill": True,
                         "auto_quarantine": True, **response}}
    return Config(data, root / "config" / "config.json")


class PostureTests(unittest.TestCase):
    def test_observe_mode_is_reported_as_unprotected(self):
        """The whole point. Observe records and stops nothing, and the report
        used to mention it once, in passing, beside the threat-db counts."""
        with tempfile.TemporaryDirectory() as tmp:
            verdict = posture.assess(config_for(tmp, mode="observe"))
            self.assertEqual(verdict.state, posture.UNPROTECTED)
            self.assertIn("NOT PROTECTED", posture.format_banner(verdict))

    def test_enforce_with_everything_on_is_protected(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            (config.data_dir() / "autostart-baseline.json").write_text("{}")
            verdict = posture.assess(
                config, adblock_domains=73,
                credguard_status={"stores_present": ["a"], "verified_audited": ["p"]})
            self.assertEqual(verdict.state, posture.PROTECTED)
            self.assertIn("PROTECTED", posture.format_banner(verdict))

    def test_unarmed_credential_stores_are_a_critical_failure(self):
        """The account is lost when the cookie database is read. An install
        that watches nothing is not a partial install."""
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            (config.data_dir() / "autostart-baseline.json").write_text("{}")
            verdict = posture.assess(
                config, adblock_domains=73,
                credguard_status={"stores_present": ["a", "b"], "verified_audited": []})
            self.assertEqual(verdict.state, posture.UNPROTECTED)

    def test_a_machine_with_no_credential_stores_is_not_penalised(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = config_for(tmp)
            (config.data_dir() / "autostart-baseline.json").write_text("{}")
            verdict = posture.assess(
                config, adblock_domains=73,
                credguard_status={"stores_present": [], "verified_audited": []})
            self.assertEqual(verdict.state, posture.PROTECTED)

    def test_a_missing_baseline_is_partial_not_fatal(self):
        with tempfile.TemporaryDirectory() as tmp:
            verdict = posture.assess(config_for(tmp), adblock_domains=73)
            self.assertEqual(verdict.state, posture.PARTIAL)

    def test_the_banner_names_the_command_that_fixes_each_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            text = posture.format_banner(posture.assess(config_for(tmp, mode="observe")))
            self.assertIn("candy level standard", text)
            self.assertIn("candy baseline save", text)

    def test_a_verified_count_beats_the_recorded_one(self):
        """config.json's note said 11 armed while the rules were gone. The
        note must never be what the verdict is built on."""
        with tempfile.TemporaryDirectory() as tmp:
            verdict = posture.assess(
                config_for(tmp),
                credguard_status={"stores_present": ["a"], "armed": ["a"] * 11,
                                  "verified_audited": []})
            names = [c.name for c in verdict.critical_failures]
            self.assertIn("credential stores", names)


class FindingAnOlderInstallTests(unittest.TestCase):
    def test_a_folder_with_a_config_looks_like_an_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Candy"
            (root / "config").mkdir(parents=True)
            self.assertFalse(posture.looks_like_install(root))
            (root / "config" / "config.json").write_text("{}")
            self.assertTrue(posture.looks_like_install(root))

    def test_the_current_install_is_never_offered_to_itself(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "Candyv9"
            (root / "config").mkdir(parents=True)
            (root / "config" / "config.json").write_text("{}")
            found = posture.find_previous_installs(root, hints=[tmp])
            self.assertNotIn(root.resolve(), [p.resolve() for p in found])

    def test_an_older_sibling_folder_is_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("Candyv8", "Candyv9"):
                (Path(tmp) / name / "config").mkdir(parents=True)
                (Path(tmp) / name / "config" / "config.json").write_text("{}")
            found = posture.find_previous_installs(Path(tmp) / "Candyv9", hints=[tmp])
            self.assertEqual([p.name for p in found], ["Candyv8"])

    def test_folders_that_are_not_candy_are_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "Photos" / "config").mkdir(parents=True)
            self.assertEqual(
                posture.find_previous_installs(Path(tmp) / "x", hints=[tmp]), [])

    def test_a_missing_hint_directory_does_not_raise(self):
        self.assertEqual(
            posture.find_previous_installs(Path("/nope"), hints=["/definitely/not/here"]),
            [])


class ImportTests(unittest.TestCase):
    def make_install(self, root: Path, *, mode: str = "enforce") -> Path:
        (root / "config").mkdir(parents=True, exist_ok=True)
        (root / "data").mkdir(parents=True, exist_ok=True)
        (root / "config" / "config.json").write_text(
            json.dumps({"response": {"mode": mode}}))
        (root / "data" / "autostart-baseline.json").write_text('{"entries": 427}')
        (root / "data" / "trust-pins.json").write_text("{}")
        return root

    def test_the_plan_changes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = self.make_install(Path(tmp) / "old")
            new = Path(tmp) / "new"
            new.mkdir()
            plan = posture.plan_import(old, new)
            self.assertEqual(len(plan.available), 3)
            self.assertFalse((new / "config" / "config.json").exists())
            self.assertIn("would copy", posture.format_import_plan(plan))

    def test_applying_it_carries_settings_and_baseline_across(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = self.make_install(Path(tmp) / "old")
            new = Path(tmp) / "new"
            new.mkdir()
            written = posture.apply_import(posture.plan_import(old, new))
            self.assertIn("config/config.json", written)
            self.assertIn("data/autostart-baseline.json", written)
            self.assertEqual(
                json.loads((new / "config" / "config.json").read_text())["response"]["mode"],
                "enforce")

    def test_existing_files_are_not_silently_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = self.make_install(Path(tmp) / "old")
            new = Path(tmp) / "new"
            (new / "config").mkdir(parents=True)
            (new / "config" / "config.json").write_text('{"mine": true}')
            written = posture.apply_import(posture.plan_import(old, new))
            self.assertNotIn("config/config.json", written)
            self.assertIn("mine", (new / "config" / "config.json").read_text())

    def test_an_untouched_default_config_is_not_treated_as_the_users_work(self):
        """Config.load writes a default config.json before any command runs,
        so by the time import executes the destination always has one — and
        the single file that carries the response mode was the one file that
        never imported."""
        from candy.config import DEFAULTS

        with tempfile.TemporaryDirectory() as tmp:
            old = self.make_install(Path(tmp) / "old")
            new = Path(tmp) / "new"
            (new / "config").mkdir(parents=True)
            (new / "config" / "config.json").write_text(json.dumps(DEFAULTS, indent=2))
            written = posture.apply_import(posture.plan_import(old, new))
            self.assertIn("config/config.json", written)
            self.assertEqual(
                json.loads((new / "config" / "config.json").read_text())["response"]["mode"],
                "enforce")

    def test_an_edited_config_is_still_left_alone(self):
        from candy.config import DEFAULTS

        with tempfile.TemporaryDirectory() as tmp:
            old = self.make_install(Path(tmp) / "old")
            new = Path(tmp) / "new"
            (new / "config").mkdir(parents=True)
            edited = json.loads(json.dumps(DEFAULTS))
            edited["response"]["mode"] = "observe"
            edited["whitelist"]["names"] = ["something the user added"]
            (new / "config" / "config.json").write_text(json.dumps(edited))
            self.assertNotIn("config/config.json",
                             posture.apply_import(posture.plan_import(old, new)))

    def test_overwrite_replaces_them_when_asked(self):
        with tempfile.TemporaryDirectory() as tmp:
            old = self.make_install(Path(tmp) / "old")
            new = Path(tmp) / "new"
            (new / "config").mkdir(parents=True)
            (new / "config" / "config.json").write_text('{"mine": true}')
            written = posture.apply_import(posture.plan_import(old, new),
                                           overwrite=True)
            self.assertIn("config/config.json", written)

    def test_quarantine_and_logs_are_never_imported(self):
        """Quarantined files are evidence and belong with the install that
        took them; a merged hash-chained log is not a chain."""
        names = [relative for relative, _what in posture.IMPORT_FILES]
        self.assertFalse([n for n in names if "quarantine" in n or n.startswith("logs")])

    def test_an_empty_source_says_so_rather_than_claiming_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            empty = Path(tmp) / "empty"
            empty.mkdir()
            plan = posture.plan_import(empty, Path(tmp))
            self.assertIn("no Candy settings", posture.format_import_plan(plan))


if __name__ == "__main__":
    unittest.main()
