"""Tests for domain blocking, site scanning and domain detection.

The hosts-file logic is exercised against real temporary hosts files, so the
round trip — block, list, unblock, clear — is verified byte-for-byte rather
than mocked.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy.config import Config  # noqa: E402
from candy.detect import Analyzer  # noqa: E402
from candy.intel import IntelClient  # noqa: E402
from candy.netblock import (BLOCK_END, BLOCK_START, HostsBlocker, is_protected,  # noqa: E402
                            normalize_domain, parse_managed_block, render_hosts)
from candy.responder import Responder  # noqa: E402
from test_core import make_config, make_db  # noqa: E402

ORIGINAL_HOSTS = """# Copyright (c) 1993-2009 Microsoft Corp.
127.0.0.1       localhost
::1             localhost
10.0.0.5        fileserver.local
"""


def temp_hosts(tmp: str, content: str = ORIGINAL_HOSTS) -> Path:
    path = Path(tmp) / "hosts"
    path.write_text(content, encoding="utf-8")
    return path


class DomainNormalisationTests(unittest.TestCase):
    def test_accepts_the_forms_users_actually_paste(self):
        for value, expected in [
            ("bad.gg", "bad.gg"),
            ("BAD.GG", "bad.gg"),
            ("www.bad.gg", "bad.gg"),
            ("https://bad.gg/download/krnl.exe", "bad.gg"),
            ("http://user:pw@dl.bad.gg:8080/x", "dl.bad.gg"),
            ("bad.gg.", "bad.gg"),
            ("  bad.gg  ", "bad.gg"),
        ]:
            self.assertEqual(normalize_domain(value), expected, value)

    def test_rejects_anything_that_is_not_a_hostname(self):
        for value in ["", "  ", "not a domain", "localhost", "192.168.1.1", "*.bad.gg",
                      "bad", "bad..gg", "-bad.gg", "bad.gg\n0.0.0.0 microsoft.com",
                      "bad.gg\tmore", "a" * 300 + ".com"]:
            self.assertIsNone(normalize_domain(value), value)

    def test_newline_injection_cannot_reach_the_hosts_file(self):
        """A domain that smuggles a newline could add arbitrary host entries."""
        self.assertIsNone(normalize_domain("evil.gg\n0.0.0.0 windowsupdate.com"))

    def test_protected_domains_cover_subdomains(self):
        self.assertTrue(is_protected("roblox.com"))
        self.assertTrue(is_protected("setup.rbxcdn.com"))
        self.assertTrue(is_protected("update.microsoft.com"))
        self.assertFalse(is_protected("roblox.com.evil.gg"))
        self.assertFalse(is_protected("bad.gg"))


class HostsRenderingTests(unittest.TestCase):
    def test_managed_block_round_trips(self):
        rendered = render_hosts(ORIGINAL_HOSTS, ["bad.gg", "evil.example"])
        self.assertIn(BLOCK_START, rendered)
        self.assertIn(BLOCK_END, rendered)
        self.assertEqual(parse_managed_block(rendered), ["bad.gg", "evil.example"])

    def test_existing_entries_are_preserved(self):
        rendered = render_hosts(ORIGINAL_HOSTS, ["bad.gg"])
        for line in ("127.0.0.1       localhost", "10.0.0.5        fileserver.local"):
            self.assertIn(line, rendered)

    def test_empty_list_removes_the_block_completely(self):
        blocked = render_hosts(ORIGINAL_HOSTS, ["bad.gg"])
        cleared = render_hosts(blocked, [])
        self.assertNotIn("CANDY", cleared)
        self.assertEqual(cleared.strip(), ORIGINAL_HOSTS.strip())

    def test_rewriting_does_not_duplicate_the_block(self):
        once = render_hosts(ORIGINAL_HOSTS, ["bad.gg"])
        twice = render_hosts(once, ["bad.gg", "worse.gg"])
        self.assertEqual(twice.count(BLOCK_START), 1)
        self.assertEqual(parse_managed_block(twice), ["bad.gg", "worse.gg"])

    def test_www_mirror_is_not_reported_as_a_separate_domain(self):
        rendered = render_hosts(ORIGINAL_HOSTS, ["bad.gg"])
        self.assertIn("0.0.0.0 bad.gg www.bad.gg", rendered)
        self.assertEqual(parse_managed_block(rendered), ["bad.gg"])


class HostsBlockerTests(unittest.TestCase):
    def test_block_unblock_clear_leaves_the_file_as_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = temp_hosts(tmp)
            blocker = HostsBlocker(path)

            self.assertTrue(blocker.block(["bad.gg", "https://evil.example/x"]).ok)
            self.assertEqual(blocker.blocked(), ["bad.gg", "evil.example"])

            self.assertTrue(blocker.unblock("bad.gg").ok)
            self.assertEqual(blocker.blocked(), ["evil.example"])

            self.assertTrue(blocker.clear().ok)
            self.assertEqual(blocker.blocked(), [])
            self.assertEqual(path.read_text(encoding="utf-8").strip(), ORIGINAL_HOSTS.strip())

    def test_a_backup_is_taken_before_the_first_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = temp_hosts(tmp)
            HostsBlocker(path).block("bad.gg")
            backup = path.with_suffix(path.suffix + ".candy-backup")
            self.assertTrue(backup.exists())
            self.assertEqual(backup.read_text(encoding="utf-8"), ORIGINAL_HOSTS)

    def test_protected_domain_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = HostsBlocker(temp_hosts(tmp))
            result = blocker.block("update.microsoft.com")
            self.assertFalse(result.ok)
            self.assertIn("protected", result.detail)
            self.assertEqual(blocker.blocked(), [])

    def test_invalid_domain_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = HostsBlocker(temp_hosts(tmp))
            self.assertFalse(blocker.block("0.0.0.0 microsoft.com").ok)
            self.assertEqual(blocker.blocked(), [])

    def test_blocking_a_mix_keeps_the_valid_ones(self):
        with tempfile.TemporaryDirectory() as tmp:
            blocker = HostsBlocker(temp_hosts(tmp))
            result = blocker.block(["bad.gg", "roblox.com", "!!!"])
            self.assertTrue(result.ok)
            self.assertEqual(blocker.blocked(), ["bad.gg"])
            self.assertIn("skipped", result.detail)

    def test_unblocking_something_we_never_blocked_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(HostsBlocker(temp_hosts(tmp)).unblock("nothing.gg").ok)

    def test_hand_written_entries_outside_the_block_are_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            custom = ORIGINAL_HOSTS + "0.0.0.0 my-own-block.example\n"
            path = temp_hosts(tmp, custom)
            blocker = HostsBlocker(path)
            blocker.block("bad.gg")
            blocker.clear()
            self.assertIn("0.0.0.0 my-own-block.example", path.read_text(encoding="utf-8"))


class DomainDetectionTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = Analyzer(make_config(blacklist={"domains": ["bad.gg"]}), make_db())

    def test_blacklisted_domain_and_subdomains(self):
        for domain in ("bad.gg", "dl.cdn.bad.gg"):
            hits = self.analyzer.analyze_domain(domain)
            self.assertTrue(hits, domain)
            self.assertEqual(hits[0].severity, "critical")

    def test_unrelated_domain_is_clean(self):
        self.assertEqual(self.analyzer.analyze_domain("example.com"), [])

    def test_lookalike_domain_is_not_matched(self):
        self.assertEqual(self.analyzer.analyze_domain("bad.gg.evil.com"), [])

    def test_whitelist_overrides_the_blacklist(self):
        analyzer = Analyzer(make_config(blacklist={"domains": ["bad.gg"]},
                                        whitelist={"domains": ["bad.gg"]}), make_db())
        self.assertEqual(analyzer.analyze_domain("bad.gg"), [])

    def test_threat_database_endpoint_matches_parent_domain(self):
        db = make_db()
        db.ingest({"endpoints": {"malware-host.example": {"note": "executor download page",
                                                          "severity": "high"}}})
        analyzer = Analyzer(make_config(), db)
        hits = analyzer.analyze_domain("cdn.malware-host.example")
        self.assertTrue(hits)
        self.assertEqual(hits[0].severity, "high")
        self.assertIn("executor download page", hits[0].message)


class ResponderDomainTests(unittest.TestCase):
    def make(self, tmp: str, **overrides):
        root = Path(tmp)
        data = {"paths": {"quarantine": str(root / "q"), "logs": str(root / "l"),
                          "data": str(root / "d")},
                "web": {"hosts_file": str(temp_hosts(tmp)), "resolve_and_block_ips": False}}
        data.update(overrides)
        return Config(data, root / "config.json")

    def test_forced_block_writes_the_hosts_file_and_the_blacklist(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self.make(tmp)
            responder = Responder(config)
            result = responder.block_domain("https://bad.gg/krnl", forced=True)
            self.assertTrue(result.ok, result.detail)
            self.assertEqual(responder.blocked_domains(), ["bad.gg"])
            self.assertIn("bad.gg", config.get("blacklist.domains"))

    def test_unblock_reverses_it(self):
        with tempfile.TemporaryDirectory() as tmp:
            responder = Responder(self.make(tmp))
            responder.block_domain("bad.gg", forced=True)
            self.assertTrue(responder.unblock_domain("bad.gg").ok)
            self.assertEqual(responder.blocked_domains(), [])

    def test_observe_mode_refuses_automatic_blocking(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = Responder(self.make(tmp)).block_domain("bad.gg")
            self.assertFalse(result.ok)
            self.assertIn("off", result.detail)

    def test_protected_domain_is_refused_even_when_forced(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = Responder(self.make(tmp)).block_domain("roblox.com", forced=True)
            self.assertFalse(result.ok)
            self.assertIn("protected-domain list", result.detail)

    def test_enforce_mode_blocks_a_hostname_detection(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = self.make(tmp, response={"mode": "enforce", "auto_block_domains": True})
            responder = Responder(config)
            db = make_db()
            db.ingest({"endpoints": {"bad.gg": {"note": "test", "severity": "critical"}}})
            detection = Analyzer(config, db).analyze_domain("bad.gg")[0]
            results = responder.respond(detection, verdict_score=detection.score)
            self.assertTrue(results and results[0].ok, [str(r) for r in results])
            self.assertEqual(responder.blocked_domains(), ["bad.gg"])


class IntelGatingTests(unittest.TestCase):
    def test_lookups_are_silent_when_disabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = IntelClient(Config({"paths": {"data": tmp}}, Path(tmp) / "c.json"))
            self.assertIsNone(client.check_url("https://example.com"))
            self.assertIsNone(client.check_domain("example.com"))
            self.assertIsNone(client.check_hash("ab" * 32))
            self.assertFalse(client.status()["enabled"])

    def test_lookups_still_need_a_key_when_enabled(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Config({"paths": {"data": tmp},
                             "intel": {"enable_lookups": True}}, Path(tmp) / "c.json")
            client = IntelClient(config)
            self.assertIsNone(client.check_url("https://example.com"))
            self.assertTrue(client.status()["enabled"])
            self.assertFalse(client.status()["virustotal"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
