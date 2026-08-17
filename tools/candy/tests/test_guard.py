"""Tests for the download guard, ad blocker and phishing analyser."""
from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy.adblock import AdBlocker, SEED_LISTS, parse_blocklist  # noqa: E402
from candy.config import Config  # noqa: E402
from candy.detect import Analyzer  # noqa: E402
from candy.guard import (DownloadGuard, Origin, double_extension,  # noqa: E402
                         inspect_archive, looks_executable, parse_zone_identifier)
from candy.netblock import parse_managed_block  # noqa: E402
from candy.phishing import analyze_host, analyze_url, levenshtein, registrable  # noqa: E402
from pebuilder import build_pe  # noqa: E402
from test_core import make_config, make_db  # noqa: E402

ORIGINAL_HOSTS = "127.0.0.1 localhost\n10.0.0.5 fileserver.local\n"


def guard_for(tmp: str, policy: str = "balanced", signed=None) -> DownloadGuard:
    root = Path(tmp)
    config = Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                               "quarantine": str(root / "q")},
                     "download_guard": {"policy": policy}}, root / "config.json")
    return DownloadGuard(config, Analyzer(config, make_db()),
                         signature_checker=(lambda _p: signed) if signed is not None else None)


class ZoneIdentifierTests(unittest.TestCase):
    def test_parses_mark_of_the_web(self):
        origin = parse_zone_identifier(
            "[ZoneTransfer]\r\nZoneId=3\r\n"
            "ReferrerUrl=https://free-robux.xyz/\r\n"
            "HostUrl=https://cdn.free-robux.xyz/krnl.exe\r\n")
        self.assertEqual(origin.zone_id, 3)
        self.assertTrue(origin.from_internet)
        self.assertEqual(origin.zone_name, "internet")
        self.assertEqual(origin.source, "https://cdn.free-robux.xyz/krnl.exe")

    def test_local_zone_is_not_internet(self):
        origin = parse_zone_identifier("[ZoneTransfer]\nZoneId=0\n")
        self.assertFalse(origin.from_internet)

    def test_absent_or_garbage_stream(self):
        for text in ("", "nonsense", "[ZoneTransfer]\nZoneId=abc\n"):
            origin = parse_zone_identifier(text)
            self.assertFalse(origin.from_internet)
            self.assertIsNone(origin.source)


class ArchiveInspectionTests(unittest.TestCase):
    def make_zip(self, tmp: str, names: list[str], password: bool = False) -> Path:
        path = Path(tmp) / "download.zip"
        with zipfile.ZipFile(path, "w") as archive:
            for name in names:
                archive.writestr(name, b"content")
        return path

    def test_executables_inside_are_listed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_zip(tmp, ["readme.txt", "tool/setup.exe", "lib/helper.dll"])
            finding = inspect_archive(path)
            self.assertEqual(finding.entries, 3)
            self.assertEqual(sorted(finding.executables), ["lib/helper.dll", "tool/setup.exe"])

    def test_known_executor_inside_an_archive_is_matched(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_zip(tmp, ["roblox_mod/readme.txt", "roblox_mod/krnl.exe"])
            finding = inspect_archive(path, make_db())
            self.assertTrue(finding.matched)
            self.assertIn("krnl.exe", finding.matched[0])

    def test_clean_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.make_zip(tmp, ["photo.jpg", "notes.txt"])
            finding = inspect_archive(path, make_db())
            self.assertEqual(finding.executables, [])
            self.assertEqual(finding.matched, [])

    def test_unreadable_archive_is_reported_not_raised(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "broken.zip"
            path.write_bytes(b"this is not a zip file")
            self.assertIsNotNone(inspect_archive(path).error)

    def test_other_archive_formats_are_reported_as_opaque(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "download.7z"
            path.write_bytes(b"7z\xbc\xaf\x27\x1c")
            self.assertIn("cannot be read", inspect_archive(path).error or "")


class DownloadGuardTests(unittest.TestCase):
    def write_pe(self, tmp: str, name: str, payload: bytes = b"", **kwargs) -> Path:
        path = Path(tmp) / name
        path.write_bytes(build_pe(code=(payload or b"harmless" * 40) * 2, **kwargs))
        return path

    def test_known_executor_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write_pe(tmp, "krnl.exe")
            verdict = guard_for(tmp).assess(path)
            self.assertEqual(verdict.action, "quarantine")
            self.assertIn(verdict.severity, ("high", "critical"))

    def test_renamed_executor_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write_pe(tmp, "homework.exe",
                                 strings={"OriginalFilename": "krnl.exe"})
            verdict = guard_for(tmp).assess(path)
            self.assertEqual(verdict.action, "quarantine")

    def test_stealer_capabilities_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write_pe(tmp, "setup.exe",
                                 payload=b"CryptUnprotectData\0\\Login Data\0cookies.sqlite\0"
                                         b"https://discord.com/api/webhooks/1/AAAA\0")
            verdict = guard_for(tmp).assess(path)
            self.assertEqual(verdict.action, "quarantine")

    def test_ordinary_document_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "essay.txt"
            path.write_text("homework", encoding="utf-8")
            self.assertEqual(guard_for(tmp).assess(path).action, "allow")

    def test_signed_executable_is_cleared(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.write_pe(tmp, "installer.exe",
                                 strings={"OriginalFilename": "installer.exe"})
            verdict = guard_for(tmp, signed=True).assess(path)
            self.assertEqual(verdict.action, "allow")
            self.assertIn("validly signed by a trusted publisher", verdict.clearances)

    def test_fortress_rejects_unsigned_internet_executables(self):
        """The whole point of fortress mode: unknown is not a pass."""
        with tempfile.TemporaryDirectory() as tmp:
            guard = guard_for(tmp, policy="fortress", signed=False)
            path = self.write_pe(tmp, "plain_tool.exe",
                                 strings={"OriginalFilename": "plain_tool.exe"})
            verdict = guard.assess(path)
            # Nothing about the file is known-bad...
            self.assertLess(verdict.score, 60)
            # ...but with no Mark-of-the-Web it is not treated as a download.
            self.assertEqual(verdict.action, "warn" if verdict.score >= 30 else "allow")

            verdict.origin = Origin(zone_id=3, host_url="https://example.com/plain_tool.exe")
            decision = guard._decide(verdict, is_executable=True, signed=False)
            self.assertEqual(decision, "quarantine")

    def test_fortress_still_allows_signed_downloads(self):
        with tempfile.TemporaryDirectory() as tmp:
            guard = guard_for(tmp, policy="fortress", signed=True)
            verdict = guard.assess(self.write_pe(tmp, "vendor.exe",
                                                 strings={"OriginalFilename": "vendor.exe"}))
            verdict.origin = Origin(zone_id=3, host_url="https://vendor.example/vendor.exe")
            self.assertEqual(guard._decide(verdict, is_executable=True, signed=True), "allow")

    def test_off_policy_never_rejects(self):
        with tempfile.TemporaryDirectory() as tmp:
            guard = guard_for(tmp, policy="off")
            verdict = guard.assess(self.write_pe(tmp, "krnl.exe"))
            self.assertEqual(verdict.action, "allow")

    def test_whitelisted_file_is_cleared_immediately(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                                       "quarantine": str(root / "q")},
                             "whitelist": {"names": ["krnl.exe"]}}, root / "c.json")
            guard = DownloadGuard(config, Analyzer(config, make_db()))
            verdict = guard.assess(self.write_pe(tmp, "krnl.exe"))
            self.assertEqual(verdict.action, "allow")
            self.assertIn("on your whitelist", verdict.clearances)

    def test_archive_with_a_known_executor_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "mods.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("mods/krnl.exe", b"payload")
            verdict = guard_for(tmp).assess(path)
            self.assertEqual(verdict.action, "quarantine")

    def test_handle_quarantines_and_counts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                                       "quarantine": str(root / "q")}}, root / "c.json")
            from candy.responder import Responder

            guard = DownloadGuard(config, Analyzer(config, make_db()), Responder(config))
            path = self.write_pe(tmp, "krnl.exe")
            verdict, actions = guard.handle(path)
            self.assertEqual(verdict.action, "quarantine")
            self.assertTrue(actions and "OK" in actions[0])
            self.assertFalse(path.exists())
            self.assertEqual(guard.rejected, 1)

    def test_helpers(self):
        self.assertTrue(looks_executable("a/b/thing.EXE"))
        self.assertFalse(looks_executable("photo.png"))
        self.assertEqual(double_extension("invoice.pdf.exe"), "pdf → exe")
        self.assertIsNone(double_extension("archive.tar.gz"))


class PhishingTests(unittest.TestCase):
    def test_real_brand_domains_are_clean(self):
        for host in ("roblox.com", "www.roblox.com", "web.roblox.com", "discord.com",
                     "github.com", "cdn.jsdelivr.net", "microsoft.com"):
            self.assertEqual(analyze_host(host).verdict, "clean", host)

    def test_brand_in_subdomain_of_another_domain(self):
        verdict = analyze_host("roblox.com.login-verify.xyz")
        self.assertEqual(verdict.verdict, "phishing")
        self.assertEqual(verdict.impersonates, "roblox")

    def test_homoglyph_substitution(self):
        verdict = analyze_host("rob1ox.com")
        self.assertIn(verdict.verdict, ("suspicious", "phishing"))
        self.assertEqual(verdict.impersonates, "roblox")

    def test_typosquat(self):
        self.assertEqual(analyze_host("robloxx.com").impersonates, "roblox")
        self.assertEqual(analyze_host("discrod.com").impersonates, "discord")

    def test_brand_on_a_different_tld(self):
        verdict = analyze_host("roblox.tk")
        self.assertEqual(verdict.impersonates, "roblox")

    def test_punycode_is_flagged(self):
        self.assertGreaterEqual(analyze_host("xn--roblx-8ta.com").score, 45)

    def test_raw_ip_link(self):
        self.assertGreaterEqual(analyze_host("203.0.113.9").score, 35)

    def test_full_url_scoring(self):
        verdict = analyze_url("http://roblox.com.claim-robux.xyz/login/verify.exe")
        self.assertEqual(verdict.verdict, "phishing")
        kinds = {f["kind"] for f in verdict.findings}
        self.assertIn("brand_in_subdomain", kinds)
        self.assertIn("direct_download", kinds)
        self.assertIn("no_tls", kinds)

    def test_userinfo_trick(self):
        verdict = analyze_url("https://roblox.com@evil-host.xyz/login")
        self.assertIn("userinfo_trick", {f["kind"] for f in verdict.findings})

    def test_ordinary_link_is_clean(self):
        self.assertEqual(analyze_url("https://github.com/user/repo/releases").verdict, "clean")

    def test_helpers(self):
        self.assertEqual(levenshtein("roblox", "roblox"), 0)
        self.assertEqual(levenshtein("roblox", "robloxx"), 1)
        self.assertGreater(levenshtein("roblox", "completely-different"), 4)
        self.assertEqual(registrable("a.b.example.com"), "example.com")


class AdBlockTests(unittest.TestCase):
    def make(self, tmp: str, **overrides) -> AdBlocker:
        root = Path(tmp)
        hosts = root / "hosts"
        hosts.write_text(ORIGINAL_HOSTS, encoding="utf-8")
        data = {"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                          "quarantine": str(root / "q")},
                "web": {"hosts_file": str(hosts)}}
        data.update(overrides)
        return AdBlocker(Config(data, root / "config.json"))

    def test_parses_hosts_format(self):
        text = ("# comment\n0.0.0.0 ads.example\n127.0.0.1 tracker.example\n"
                "0.0.0.0 localhost\n\ngarbage line here\n")
        domains, skipped = parse_blocklist(text)
        self.assertEqual(domains, ["ads.example", "tracker.example"])
        self.assertGreaterEqual(skipped, 1)

    def test_parses_adblock_plus_format(self):
        domains, _ = parse_blocklist("||ads.example^\n||tracker.example^\n! comment\n")
        self.assertEqual(domains, ["ads.example", "tracker.example"])

    def test_parses_plain_domain_list(self):
        domains, _ = parse_blocklist("ads.example\ntracker.example\n")
        self.assertEqual(domains, ["ads.example", "tracker.example"])

    def test_protected_domains_are_never_imported(self):
        domains, skipped = parse_blocklist("0.0.0.0 roblox.com\n0.0.0.0 windowsupdate.com\n"
                                           "0.0.0.0 ads.example\n")
        self.assertEqual(domains, ["ads.example"])
        self.assertEqual(skipped, 2)

    def test_limit_is_respected(self):
        text = "\n".join(f"0.0.0.0 site{i}.example" for i in range(100))
        domains, _ = parse_blocklist(text, limit=10)
        self.assertEqual(len(domains), 10)

    def test_apply_writes_its_own_section(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = self.make(tmp)
            result = blocker.apply()
            self.assertTrue(result.ok, result.detail)
            self.assertGreater(len(blocker.blocked()), 20)
            text = blocker.hosts.path.read_text(encoding="utf-8")
            self.assertIn("CANDY ADBLOCK START", text)
            self.assertIn("127.0.0.1 localhost", text)

    def test_adblock_and_manual_blocks_coexist(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = self.make(tmp)
            blocker.apply()

            from candy.netblock import HostsBlocker

            manual = HostsBlocker(blocker.hosts.path)
            manual.block("bad-executor.gg")

            text = blocker.hosts.path.read_text(encoding="utf-8")
            self.assertEqual(parse_managed_block(text, "BLOCK"), ["bad-executor.gg"])
            self.assertGreater(len(parse_managed_block(text, "ADBLOCK")), 20)

            manual.clear()
            self.assertGreater(len(blocker.blocked()), 20,
                               "clearing manual blocks must not touch the ad list")

    def test_allow_removes_a_domain_permanently(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = self.make(tmp)
            blocker.apply()
            target = SEED_LISTS["ads"][0]
            self.assertIn(target, blocker.blocked())
            blocker.allow(target)
            self.assertNotIn(target, blocker.blocked())
            blocker.apply()
            self.assertNotIn(target, blocker.blocked(), "an allowed domain must stay allowed")

    def test_clear_removes_everything(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = self.make(tmp)
            blocker.apply()
            blocker.clear()
            self.assertEqual(blocker.blocked(), [])
            self.assertEqual(blocker.hosts.path.read_text(encoding="utf-8").strip(),
                             ORIGINAL_HOSTS.strip())

    def test_import_refuses_plain_http(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.make(tmp).import_list("http://example.com/hosts")
            self.assertFalse(result.ok)
            self.assertIn("https", result.detail)

    def test_import_from_a_local_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = self.make(tmp)
            listing = Path(tmp) / "list.txt"
            listing.write_text("0.0.0.0 extra-ads.example\n||more-ads.example^\n",
                               encoding="utf-8")
            result = blocker.import_list(str(listing))
            self.assertTrue(result.ok, result.detail)
            self.assertIn("extra-ads.example", blocker.blocked())
            self.assertIn("more-ads.example", blocker.blocked())


if __name__ == "__main__":
    unittest.main(verbosity=2)
