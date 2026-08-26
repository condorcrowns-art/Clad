"""Tests for the DNS filtering resolver and the coverage matrix.

The resolver is exercised end to end over a real UDP socket on a high port,
because a DNS proxy that parses correctly but answers wrongly is worse than
none at all.
"""
from __future__ import annotations

import socket
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import coverage  # noqa: E402
from candy.config import Config  # noqa: E402
from candy.dnsproxy import (DnsFilter, DnsProxy, QTYPE_A, QTYPE_AAAA,  # noqa: E402
                            RCODE_NXDOMAIN, build_response, parse_question)
from test_core import make_db  # noqa: E402


def query_packet(name: str, qtype: int = QTYPE_A, transaction_id: int = 0x1234) -> bytes:
    labels = b"".join(bytes([len(part)]) + part.encode() for part in name.split(".")) + b"\x00"
    return (struct.pack(">HHHHHH", transaction_id, 0x0100, 1, 0, 0, 0)
            + labels + struct.pack(">HH", qtype, 1))


def temp_config(tmp: str, **overrides) -> Config:
    root = Path(tmp)
    data = {"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                      "quarantine": str(root / "q")}}
    data.update(overrides)
    return Config(data, root / "config.json")


class QuestionParsingTests(unittest.TestCase):
    def test_parses_a_normal_query(self):
        question = parse_question(query_packet("ads.example.com"))
        self.assertIsNotNone(question)
        self.assertEqual(question.name, "ads.example.com")
        self.assertEqual(question.qtype, QTYPE_A)
        self.assertEqual(question.transaction_id, 0x1234)

    def test_rejects_truncated_and_empty_packets(self):
        packet = query_packet("example.com")
        for cut in (0, 5, 11, 14, len(packet) - 2):
            self.assertIsNone(parse_question(packet[:cut]), cut)

    def test_rejects_compression_pointer_in_a_question(self):
        packet = struct.pack(">HHHHHH", 1, 0x0100, 1, 0, 0, 0) + b"\xc0\x0c" + struct.pack(">HH", 1, 1)
        self.assertIsNone(parse_question(packet))

    def test_rejects_oversized_labels(self):
        packet = struct.pack(">HHHHHH", 1, 0x0100, 1, 0, 0, 0) + bytes([64]) + b"a" * 64 + b"\x00"
        self.assertIsNone(parse_question(packet))

    def test_rejects_zero_question_count(self):
        self.assertIsNone(parse_question(struct.pack(">HHHHHH", 1, 0x0100, 0, 0, 0, 0)))

    def test_survives_random_bytes(self):
        import random

        random.seed(99)
        for _ in range(500):
            blob = bytes(random.getrandbits(8) for _ in range(random.randint(0, 120)))
            parse_question(blob)          # must not raise


class ResponseBuildingTests(unittest.TestCase):
    def test_a_record_sinkhole(self):
        packet = query_packet("bad.example")
        question = parse_question(packet)
        response = build_response(packet, question)
        transaction_id, flags, qd, an, _ns, _ar = struct.unpack_from(">HHHHHH", response, 0)
        self.assertEqual(transaction_id, question.transaction_id)
        self.assertTrue(flags & 0x8000, "QR bit must be set on a response")
        self.assertEqual((qd, an), (1, 1))
        self.assertEqual(response[-4:], b"\x00\x00\x00\x00")

    def test_aaaa_record_sinkhole_is_all_zeroes(self):
        packet = query_packet("bad.example", QTYPE_AAAA)
        response = build_response(packet, parse_question(packet))
        self.assertEqual(response[-16:], bytes(16))

    def test_other_record_types_get_nxdomain(self):
        packet = query_packet("bad.example", 15)      # MX
        response = build_response(packet, parse_question(packet))
        _tid, flags, _qd, an, _ns, _ar = struct.unpack_from(">HHHHHH", response, 0)
        self.assertEqual(flags & 0xF, RCODE_NXDOMAIN)
        self.assertEqual(an, 0)


class FilterDecisionTests(unittest.TestCase):
    def make(self, tmp: str, **overrides) -> DnsFilter:
        dns_filter = DnsFilter(temp_config(tmp, **overrides), make_db())
        dns_filter.load(["doubleclick.net", "popads.net"])
        return dns_filter

    def test_exact_and_suffix_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            dns_filter = self.make(tmp)
            for name in ("doubleclick.net", "ads.doubleclick.net", "a.b.c.popads.net"):
                self.assertTrue(dns_filter.decide(name).blocked, name)

    def test_lookalike_of_a_blocked_domain_is_not_matched(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(self.make(tmp).decide("notdoubleclick.net").blocked)
            self.assertFalse(self.make(tmp).decide("doubleclick.net.example.com").blocked)

    def test_protected_domains_are_never_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            dns_filter = self.make(tmp)
            dns_filter.add("roblox.com")
            dns_filter.add("windowsupdate.com")
            for name in ("roblox.com", "setup.rbxcdn.com", "windowsupdate.com"):
                self.assertFalse(dns_filter.decide(name).blocked, name)

    def test_personal_blacklist(self):
        with tempfile.TemporaryDirectory() as tmp:
            dns_filter = self.make(tmp, blacklist={"domains": ["bad-executor.gg"]})
            verdict = dns_filter.decide("cdn.bad-executor.gg")
            self.assertTrue(verdict.blocked)
            self.assertEqual(verdict.severity, "high")

    def test_phishing_heuristics_block_names_on_no_list(self):
        """The point of the resolver: judging names nobody has reported."""
        with tempfile.TemporaryDirectory() as tmp:
            verdict = self.make(tmp).decide("roblox.com.claim-robux.xyz")
            self.assertTrue(verdict.blocked)
            self.assertEqual(verdict.severity, "critical")
            self.assertIn("phishing", verdict.reason)

    def test_ordinary_domains_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            dns_filter = self.make(tmp)
            for name in ("example.com", "github.com", "cdn.jsdelivr.net", "roblox.com"):
                self.assertFalse(dns_filter.decide(name).blocked, name)

    def test_whitelist_overrides_everything(self):
        with tempfile.TemporaryDirectory() as tmp:
            dns_filter = self.make(tmp, whitelist={"domains": ["doubleclick.net"]})
            self.assertFalse(dns_filter.decide("ads.doubleclick.net").blocked)


class LiveProxyTests(unittest.TestCase):
    """End to end over a real socket: query in, sinkholed answer out."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        config = temp_config(self.tmp.name, blacklist={"domains": ["bad-executor.gg"]})
        self.detections = []
        dns_filter = DnsFilter(config, make_db())
        dns_filter.load(["doubleclick.net"])
        self.proxy = DnsProxy(config, dns_filter, self.detections.append)
        ok, detail = self.proxy.start("127.0.0.1", 0)     # port 0: let the OS choose
        self.assertTrue(ok, detail)
        self.port = self.proxy.address[1]

    def tearDown(self):
        self.proxy.stop()
        self.tmp.cleanup()

    def ask(self, name: str, qtype: int = QTYPE_A, timeout: float = 5.0) -> bytes:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(timeout)
        try:
            sock.sendto(query_packet(name, qtype), ("127.0.0.1", self.port))
            data, _ = sock.recvfrom(4096)
            return data
        finally:
            sock.close()

    def test_blocked_domain_is_sinkholed(self):
        response = self.ask("ads.doubleclick.net")
        _tid, _flags, _qd, an, _ns, _ar = struct.unpack_from(">HHHHHH", response, 0)
        self.assertEqual(an, 1)
        self.assertEqual(response[-4:], b"\x00\x00\x00\x00")
        self.assertEqual(self.proxy.blocked, 1)

    def test_phishing_domain_is_sinkholed_and_reported(self):
        self.ask("roblox.com.claim-robux.xyz")
        self.assertTrue(self.detections)
        self.assertEqual(self.detections[0].severity, "critical")
        self.assertIn("claim-robux", self.detections[0].message)

    def test_a_domain_is_only_reported_once(self):
        for _ in range(3):
            self.ask("bad-executor.gg")
        self.assertEqual(len(self.detections), 1)
        self.assertEqual(self.proxy.blocked, 3)

    def test_malformed_packet_does_not_crash_the_listener(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(b"\x00\x01\x02", ("127.0.0.1", self.port))
        sock.close()
        response = self.ask("ads.doubleclick.net")
        self.assertTrue(response, "the proxy must still answer after bad input")
        self.assertEqual(self.proxy.errors, 1)

    def test_status_counts(self):
        self.ask("ads.doubleclick.net")
        status = self.proxy.status()
        self.assertEqual(status["blocked"], 1)
        self.assertEqual(status["blocklist_size"], 1)
        self.assertIn("listening", status["mode"])


class CoverageMatrixTests(unittest.TestCase):
    def test_every_technique_is_well_formed(self):
        seen = set()
        for technique in coverage.TECHNIQUES:
            self.assertNotIn(technique.id, seen, f"duplicate id {technique.id}")
            seen.add(technique.id)
            self.assertIn(technique.coverage,
                          (coverage.PREVENT, coverage.DETECT, coverage.PARTIAL, coverage.NONE))
            self.assertIn(technique.category,
                          ("injection", "persistence", "evasion", "delivery"))
            self.assertTrue(technique.mechanism or technique.coverage == coverage.NONE,
                            f"{technique.id} claims coverage with no mechanism")

    def test_blind_spots_are_documented_not_hidden(self):
        for technique in coverage.TECHNIQUES:
            if technique.coverage == coverage.NONE:
                self.assertTrue(technique.note,
                                f"{technique.id} is a blind spot with no explanation")

    def test_summary_adds_up(self):
        stats = coverage.summary()
        self.assertEqual(sum(stats["by_coverage"].values()), stats["total"])
        self.assertEqual(len(stats["blind_spots"]),
                         stats["by_coverage"].get(coverage.NONE, 0))

    def test_matrix_covers_the_techniques_that_matter_here(self):
        ids = {technique.id for technique in coverage.TECHNIQUES}
        for required in ("inj.createremotethread", "inj.reflective", "inj.kernel_driver",
                         "per.run_key", "per.wmi_subscription", "eva.rename",
                         "del.download_exe", "del.phishing_page"):
            self.assertIn(required, ids)

    def test_matrix_json_is_valid(self):
        import json

        payload = json.loads(coverage.matrix_json())
        self.assertEqual(len(payload["techniques"]), len(coverage.TECHNIQUES))


if __name__ == "__main__":
    unittest.main(verbosity=2)
