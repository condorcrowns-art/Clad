"""Tests for browser extension auditing, BITS jobs and the revert path."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import coverage  # noqa: E402
from candy.browserscan import (BROAD_HOSTS, RISKY_PERMISSIONS, SIDELOADED,  # noqa: E402
                               STORE, UNKNOWN_UPDATER, assess,
                               find_chromium_extensions, format_report,
                               parse_chromium_manifest, resolve_localised,
                               update_origin)
from candy.config import Config  # noqa: E402
from candy.detect import Analyzer  # noqa: E402
from candy.persistence import analyze_entry, parse_bits_jobs  # noqa: E402
from candy.uninstall import Reverter, format_plan  # noqa: E402
from test_core import make_config, make_db  # noqa: E402


def manifest(**overrides) -> str:
    base = {"manifest_version": 3, "name": "Test Extension", "version": "1.0",
            "permissions": ["storage"]}
    base.update(overrides)
    return json.dumps(base)


def parsed(**overrides):
    return parse_chromium_manifest(manifest(**overrides), browser="Chrome",
                                   profile="Default", extension_id="abcdefghijklmnop")


class ManifestParsingTests(unittest.TestCase):
    def test_manifest_v3_fields(self):
        extension = parsed(permissions=["cookies", "tabs"],
                           host_permissions=["*://*.example.com/*"])
        self.assertEqual(extension.name, "Test Extension")
        self.assertEqual(extension.permissions, ["cookies", "tabs"])
        self.assertEqual(extension.host_permissions, ["*://*.example.com/*"])
        self.assertEqual(extension.manifest_version, 3)

    def test_manifest_v2_splits_hosts_out_of_permissions(self):
        """V2 mixes host matches into permissions; they must be separated."""
        extension = parse_chromium_manifest(json.dumps({
            "manifest_version": 2, "name": "Old", "version": "1",
            "permissions": ["cookies", "https://*/*", "<all_urls>", "tabs"]}))
        self.assertEqual(sorted(extension.permissions), ["cookies", "tabs"])
        self.assertIn("<all_urls>", extension.host_permissions)

    def test_content_script_matches_count_as_host_access(self):
        extension = parsed(content_scripts=[{"matches": ["*://*.roblox.com/*"], "js": ["a.js"]}])
        self.assertIn("*://*.roblox.com/*", extension.all_hosts)

    def test_update_url_marks_it_as_store_installed(self):
        self.assertTrue(parsed().sideloaded)
        self.assertFalse(parsed(update_url="https://clients2.google.com/x").sideloaded)

    def test_garbage_manifests_do_not_raise(self):
        for raw in ("", "not json", "[]", "null", '{"name": 5}'):
            parse_chromium_manifest(raw)

    def test_localised_name_is_flagged_not_dropped(self):
        extension = parsed(name="__MSG_appName__")
        self.assertIn("__MSG_appName__", extension.name)


class LocalisedNameTests(unittest.TestCase):
    """Four of the extensions on a real machine reported as
    __MSG_manifest_name__ — including the one flagged for reading
    .ROBLOSECURITY. A finding you cannot match to a row in your browser's
    extensions page is not actionable."""

    def write(self, root: Path, locale: str, messages: dict) -> None:
        directory = root / "_locales" / locale
        directory.mkdir(parents=True)
        (directory / "messages.json").write_text(json.dumps(messages))

    def test_the_real_name_is_read_out_of_locales(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write(root, "en", {"manifest_name": {"message": "Roblox Helper"}})
            self.assertEqual(
                resolve_localised("__MSG_manifest_name__", str(root)), "Roblox Helper")

    def test_the_declared_default_locale_is_tried_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write(root, "de", {"n": {"message": "Deutsch"}})
            self.write(root, "en", {"n": {"message": "English"}})
            self.assertEqual(resolve_localised("__MSG_n__", str(root), "de"), "Deutsch")

    def test_keys_are_matched_case_insensitively(self):
        """Chrome does, and manifests in the wild disagree with their own
        _locales about capitalisation."""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.write(root, "en", {"appName": {"message": "Real Name"}})
            self.assertEqual(resolve_localised("__MSG_appname__", str(root)), "Real Name")

    def test_an_ordinary_name_is_left_alone(self):
        self.assertEqual(resolve_localised("uBlock Origin", "/nope"), "uBlock Origin")

    def test_a_missing_locales_folder_still_says_something_useful(self):
        resolved = resolve_localised("__MSG_x__", "/definitely/not/here")
        self.assertIn("__MSG_x__", resolved)
        self.assertIn("not in _locales", resolved)

    def test_broken_locale_files_do_not_raise(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            directory = root / "_locales" / "en"
            directory.mkdir(parents=True)
            (directory / "messages.json").write_text("not json at all")
            self.assertIn("__MSG_x__", resolve_localised("__MSG_x__", str(root)))


class OriginTests(unittest.TestCase):
    def test_the_real_stores_are_recognised(self):
        for url in ("https://clients2.google.com/service/update2/crx",
                    "https://edge.microsoft.com/extensionwebstorebase/v1/crx",
                    "https://api.opera.com/updater/x",
                    "https://addons.mozilla.org/x"):
            self.assertEqual(update_origin(url), STORE, url)

    def test_no_update_url_is_sideloaded(self):
        self.assertEqual(update_origin(None), SIDELOADED)
        self.assertEqual(update_origin(""), SIDELOADED)

    def test_a_third_party_update_host_is_neither(self):
        """Self-updating from an address the attacker owns is how a benign
        extension becomes a malicious one after you have already trusted it."""
        self.assertEqual(update_origin("https://cdn.example.ru/u.xml"), UNKNOWN_UPDATER)

    def test_a_lookalike_host_is_not_treated_as_a_store(self):
        self.assertEqual(update_origin("https://clients2.google.com.evil.tld/x"),
                         UNKNOWN_UPDATER)

    def test_a_third_party_updater_outscores_the_same_store_extension(self):
        store = assess(parsed(permissions=["tabs"],
                              update_url="https://clients2.google.com/x"))
        rogue = assess(parsed(permissions=["tabs"],
                              update_url="https://cdn.example.ru/u.xml"))
        self.assertGreater(rogue.score, store.score)
        self.assertIn("silently", " ".join(rogue.reasons))


class ExtensionScoringTests(unittest.TestCase):
    def test_roblox_cookie_stealer_is_critical(self):
        verdict = assess(parsed(permissions=["cookies", "tabs", "webRequest"],
                                host_permissions=["*://*.roblox.com/*", "<all_urls>"]))
        self.assertEqual(verdict.severity, "critical")
        self.assertIn("roblox", verdict.targets)
        self.assertIn("ROBLOSECURITY", " ".join(verdict.reasons))

    def test_ordinary_store_extension_is_not_critical(self):
        verdict = assess(parsed(permissions=["storage", "scripting"],
                                host_permissions=["<all_urls>"],
                                update_url="https://clients2.google.com/x"))
        self.assertLess(verdict.score, 65)
        self.assertNotIn("critical", verdict.severity)

    def test_harmless_extension_scores_nothing(self):
        verdict = assess(parsed(permissions=["storage"],
                                update_url="https://clients2.google.com/x"))
        self.assertEqual(verdict.score, 0)
        self.assertEqual(verdict.severity, "info")

    def test_sideloading_adds_risk_on_its_own(self):
        store = assess(parsed(permissions=["cookies"],
                              update_url="https://clients2.google.com/x"))
        sideloaded = assess(parsed(permissions=["cookies"]))
        self.assertGreater(sideloaded.score, store.score)
        self.assertIn("sideloaded", " ".join(sideloaded.reasons))

    def test_debugger_permission_is_weighted_heavily(self):
        self.assertGreaterEqual(RISKY_PERMISSIONS["debugger"][0], 35)
        verdict = assess(parsed(permissions=["debugger"]))
        self.assertGreaterEqual(verdict.score, 35)

    def test_cookies_without_reach_is_not_treated_as_theft(self):
        verdict = assess(parsed(permissions=["cookies"],
                                host_permissions=["*://internal.example.test/*"],
                                update_url="https://clients2.google.com/x"))
        self.assertNotIn("sign in as you", " ".join(verdict.reasons))

    def test_every_broad_host_pattern_is_recognised(self):
        for pattern in BROAD_HOSTS:
            verdict = assess(parsed(host_permissions=[pattern]))
            self.assertIn("every site", " ".join(verdict.reasons), pattern)

    def test_report_hides_boring_extensions_by_default(self):
        verdicts = [assess(parsed(permissions=["storage"],
                                  update_url="https://clients2.google.com/x"))]
        self.assertIn("Nothing scored above", format_report(verdicts))
        self.assertNotIn("Nothing scored above", format_report(verdicts, show_all=True))

    def test_a_store_ad_blocker_is_not_a_critical_finding(self):
        """uBlock Origin scored 95 and reported HIGH on a real machine. It
        cannot block a request it is not allowed to see — the permission is
        the product, and scoring it for working is the same mistake that
        produced twenty-two false persistence findings."""
        verdict = assess(parsed(
            permissions=["privacy", "tabs", "webRequest", "webRequestBlocking"],
            host_permissions=["<all_urls>"],
            update_url="https://api.opera.com/updater/x"))
        self.assertNotIn(verdict.severity, ("critical", "high"))
        self.assertFalse(verdict.can_take_account)

    def test_a_powerful_store_assistant_never_reaches_critical(self):
        """Bundled assistants hold debugger and nativeMessaging. Powerful is
        not the same as stealing, and critical has to mean something."""
        verdict = assess(parsed(
            permissions=["debugger", "downloads", "nativeMessaging", "scripting", "tabs"],
            host_permissions=["<all_urls>"],
            update_url="https://clients2.google.com/x"))
        self.assertNotEqual(verdict.severity, "critical")

    def test_a_store_extension_reading_roblox_cookies_is_still_critical(self):
        """Being listed on a store is not a clean bill of health — malicious
        extensions get listed. Cookie access to Roblox is the attack itself."""
        verdict = assess(parsed(permissions=["cookies", "webRequest"],
                                host_permissions=["*://*.roblox.com/*"],
                                update_url="https://clients2.google.com/x"))
        self.assertEqual(verdict.severity, "critical")
        self.assertTrue(verdict.can_take_account)

    def test_account_theft_outranks_a_bigger_permission_pile(self):
        """The whole reason for the rewrite: the Roblox cookie reader was
        listed fourth, below three extensions that could not touch a session."""
        stealer = assess(parsed(permissions=["cookies"],
                                host_permissions=["*://*.roblox.com/*"],
                                update_url="https://clients2.google.com/x"))
        powerful = assess(parsed(
            permissions=["debugger", "nativeMessaging", "management", "history",
                         "downloads", "scripting", "tabs"],
            host_permissions=["<all_urls>"],
            update_url="https://clients2.google.com/x"))
        ordered = sorted([powerful, stealer],
                         key=lambda v: (not v.can_take_account, -v.score))
        self.assertIs(ordered[0], stealer)

    def test_the_report_puts_account_risk_in_its_own_section(self):
        stealer = assess(parsed(permissions=["cookies"],
                                host_permissions=["*://*.roblox.com/*"]))
        blocker = assess(parsed(permissions=["webRequest", "webRequestBlocking"],
                                host_permissions=["<all_urls>"],
                                update_url="https://clients2.google.com/x"))
        text = format_report([stealer, blocker])
        self.assertIn("CAN SIGN IN AS YOU", text)
        self.assertIn("DID NOT ASK FOR YOUR SESSIONS", text)
        self.assertLess(text.index("CAN SIGN IN AS YOU"),
                        text.index("DID NOT ASK FOR YOUR SESSIONS"))

    def test_discovery_is_safe_when_no_browser_is_installed(self):
        self.assertEqual(find_chromium_extensions({"Nope": "/definitely/not/here"}), [])


class BitsJobTests(unittest.TestCase):
    CSV = ('"DisplayName","JobState","OwnerAccount","RemoteName","LocalName"\n'
           '"Updater","Suspended","PC\\bob","http://203.0.113.9/stage2.exe",'
           '"C:\\Users\\bob\\AppData\\Local\\Temp\\s2.exe"\n'
           '"","Transferred","NT AUTHORITY\\SYSTEM",'
           '"https://download.windowsupdate.com/x.cab","C:\\Windows\\Temp\\x.cab"\n')

    def test_parses_jobs(self):
        jobs = parse_bits_jobs(self.CSV)
        self.assertEqual(len(jobs), 2)
        self.assertEqual(jobs[0].name, "Updater")
        self.assertEqual(jobs[0].extra["state"], "Suspended")

    def test_unknown_host_scores_high(self):
        analyzer = Analyzer(make_config(), make_db())
        hits = analyze_entry(parse_bits_jobs(self.CSV)[0], analyzer)
        self.assertTrue(any(h.severity == "high" for h in hits))

    def test_windows_update_job_is_not_alarming(self):
        analyzer = Analyzer(make_config(), make_db())
        hits = analyze_entry(parse_bits_jobs(self.CSV)[1], analyzer)
        self.assertTrue(all(h.severity == "info" for h in hits), [h.severity for h in hits])

    def test_garbage_does_not_raise(self):
        for text in ("", "not,csv\nat,all", '"unterminated'):
            self.assertIsInstance(parse_bits_jobs(text), list)


class RevertTests(unittest.TestCase):
    def make(self, tmp: str) -> Reverter:
        root = Path(tmp)
        hosts = root / "hosts"
        hosts.write_text("127.0.0.1 localhost\n", encoding="utf-8")
        config = Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                                   "quarantine": str(root / "q")},
                         "web": {"hosts_file": str(hosts)}}, root / "config.json")
        return Reverter(config)

    def test_plan_on_a_clean_machine_reverts_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            steps = self.make(tmp).plan()
            applicable = [step for step in steps if step.applies and step.name != "autostart"]
            self.assertEqual(applicable, [])
            self.assertIn("Nothing to revert", format_plan(
                [s for s in steps if s.name != "autostart"]))

    def test_plan_notices_hosts_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            reverter = self.make(tmp)
            from candy.netblock import HostsBlocker, hosts_path_for_platform

            HostsBlocker(hosts_path_for_platform(
                reverter.config.get("web.hosts_file"))).block("bad-executor.gg")
            step = next(s for s in reverter.plan() if s.name == "hosts_blocks")
            self.assertTrue(step.applies)
            self.assertIn("bad-executor.gg", step.detail)

    def test_revert_removes_hosts_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            reverter = self.make(tmp)
            from candy.netblock import HostsBlocker, hosts_path_for_platform

            path = hosts_path_for_platform(reverter.config.get("web.hosts_file"))
            HostsBlocker(path).block("bad-executor.gg")
            result = reverter.revert_all()
            self.assertEqual(HostsBlocker(path).blocked(), [])
            self.assertIn("hosts_blocks", [name for name, _ok, _detail in result.steps])

    def test_a_failing_step_does_not_stop_the_others(self):
        with tempfile.TemporaryDirectory() as tmp:
            reverter = self.make(tmp)
            reverter._revert_adblock = lambda: (_ for _ in ()).throw(RuntimeError("boom"))
            result = reverter.revert_all()
            names = [name for name, _ok, _detail in result.steps]
            self.assertIn("autostart", names, "later steps must still run")
            self.assertFalse(result.ok)
            self.assertIn("boom", " ".join(d for _n, _o, d in result.steps))

    def test_every_step_is_covered_by_the_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            reverter = self.make(tmp)
            planned = {step.name for step in reverter.plan()}
            executed = {name for name, _ok, _detail in reverter.revert_all().steps}
            # The plan is more granular than the run (firewall covers two plan
            # entries); every executed step must map to something planned.
            for name in executed:
                self.assertTrue(any(name.startswith(p.split("_")[0]) for p in planned)
                                or name in ("firewall", "network_hardening", "kernel_policy"),
                                f"{name} is executed but not described in the plan")


class CoverageMatrixUpdateTests(unittest.TestCase):
    def test_the_two_closable_blind_spots_are_closed(self):
        by_id = {t.id: t for t in coverage.TECHNIQUES}
        self.assertEqual(by_id["per.bits_job"].coverage, coverage.DETECT)
        self.assertEqual(by_id["per.browser_extension"].coverage, coverage.DETECT)

    def test_only_the_genuinely_impossible_one_remains(self):
        blind = coverage.summary()["blind_spots"]
        self.assertEqual(blind, ["inj.atom_bombing"])

    def test_cookie_theft_technique_was_added(self):
        self.assertIn("cred.extension_cookie_theft", {t.id for t in coverage.TECHNIQUES})


if __name__ == "__main__":
    unittest.main(verbosity=2)
