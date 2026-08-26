"""Tests for the post-quantum signature layer and the firewall controller.

The LMS tests use tree height 5 (32 one-time signatures) so a full Merkle tree
builds in well under a second. The scheme is identical at h=10 and h=15; only
the capacity and the keygen cost change.
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import pqsign  # noqa: E402
from candy.config import Config  # noqa: E402
from candy.firewall import (AllowEntry, FirewallController, ESSENTIAL_PROGRAMS,  # noqa: E402
                            is_locked_down, parse_profiles, parse_rule_names, safe_rule_name)
from candy.pqsign import (LMS_SHA256_M32_H5, LmsPrivateKey, LmsPublicKey,  # noqa: E402
                          canonical_bytes, sign_document, verify, verify_document)
from candy.threatdb import ThreatDB  # noqa: E402

H5 = LMS_SHA256_M32_H5


class LmsCoreTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = LmsPrivateKey.generate(H5)
        cls.public = cls.key.public_key()

    def test_public_key_shape(self):
        raw = self.public.to_bytes()
        self.assertEqual(len(raw), 56)             # 4 + 4 + 16 + 32
        self.assertEqual(self.public.height, 5)
        self.assertEqual(self.public.capacity, 32)
        self.assertEqual(LmsPublicKey.from_bytes(raw).to_bytes(), raw)
        self.assertEqual(LmsPublicKey.from_hex(self.public.to_hex()).root, self.public.root)

    def test_signature_shape(self):
        signature = self.key.sign(b"hello")
        # q(4) + [otstype(4) + C(32) + 34*32] + lmstype(4) + h*32
        self.assertEqual(len(signature), 4 + (4 + 32 + 34 * 32) + 4 + 5 * 32)

    def test_sign_and_verify(self):
        message = b"the quick brown fox"
        signature = self.key.sign(message)
        self.assertTrue(verify(self.public, message, signature))
        self.assertTrue(verify(self.public.to_hex(), message, signature))
        self.assertTrue(verify(self.public.to_bytes(), message, signature))

    def test_every_leaf_verifies(self):
        key = LmsPrivateKey.generate(H5)
        public = key.public_key()
        for index in range(key.public_key().capacity):
            message = f"message {index}".encode()
            self.assertTrue(verify(public, message, key.sign(message)), index)
        self.assertEqual(key.remaining, 0)

    def test_modified_message_fails(self):
        signature = self.key.sign(b"pay alice 10")
        self.assertFalse(verify(self.public, b"pay alice 20", signature))

    def test_any_flipped_bit_in_the_signature_fails(self):
        message = b"integrity"
        signature = self.key.sign(message)
        for position in (0, 5, 40, 600, len(signature) - 1):
            broken = bytearray(signature)
            broken[position] ^= 0x01
            self.assertFalse(verify(self.public, message, bytes(broken)), position)

    def test_signature_from_another_key_fails(self):
        signature = self.key.sign(b"x")
        self.assertFalse(verify(LmsPrivateKey.generate(H5).public_key(), b"x", signature))

    def test_truncated_and_padded_signatures_fail(self):
        signature = self.key.sign(b"x")
        self.assertFalse(verify(self.public, b"x", signature[:-1]))
        self.assertFalse(verify(self.public, b"x", signature + b"\x00"))
        self.assertFalse(verify(self.public, b"x", b""))

    def test_signature_cannot_be_replayed_at_another_leaf(self):
        """Rewriting q must invalidate the signature: the auth path won't match."""
        key = LmsPrivateKey.generate(H5)
        public = key.public_key()
        message = b"leaf bound"
        signature = key.sign(message)
        self.assertEqual(int.from_bytes(signature[:4], "big"), 0)
        forged = (3).to_bytes(4, "big") + signature[4:]
        self.assertFalse(verify(public, message, forged))

    def test_garbage_input_does_not_raise(self):
        for bad in [b"", b"\x00" * 10, b"not a signature at all"]:
            self.assertFalse(verify(self.public, b"m", bad))
        self.assertFalse(verify("not hex", b"m", b"\x00" * 100))


class LmsStateTests(unittest.TestCase):
    def test_indices_are_consumed_in_order(self):
        key = LmsPrivateKey.generate(H5)
        used = [int.from_bytes(key.sign(b"m")[:4], "big") for _ in range(4)]
        self.assertEqual(used, [0, 1, 2, 3])

    def test_exhausted_key_refuses_to_sign(self):
        key = LmsPrivateKey.generate(H5)
        for _ in range(key.public_key().capacity):
            key.sign(b"m")
        with self.assertRaises(RuntimeError) as caught:
            key.sign(b"one too many")
        self.assertIn("exhausted", str(caught.exception))

    def test_counter_persists_so_a_reloaded_key_never_reuses_a_leaf(self):
        """The whole security of LM-OTS rests on this."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "key.json"
            key = LmsPrivateKey.generate(H5, path=path)
            key.save()
            first = key.sign(b"a")

            reloaded = LmsPrivateKey.load(path)
            second = reloaded.sign(b"b")

            self.assertEqual(int.from_bytes(first[:4], "big"), 0)
            self.assertEqual(int.from_bytes(second[:4], "big"), 1)
            self.assertEqual(reloaded.public_key().to_bytes(), key.public_key().to_bytes())

    def test_reloaded_key_produces_the_same_public_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "key.json"
            key = LmsPrivateKey.generate(H5, path=path)
            key.save()
            self.assertEqual(LmsPrivateKey.load(path).public_key().to_hex(),
                             key.public_key().to_hex())

    def test_rejects_a_foreign_key_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "key.json"
            path.write_text(json.dumps({"format": "something-else"}), encoding="utf-8")
            with self.assertRaises(ValueError):
                LmsPrivateKey.load(path)


class SignedDocumentTests(unittest.TestCase):
    def setUp(self):
        self.key = LmsPrivateKey.generate(H5)
        self.public = self.key.public_key().to_hex()

    def test_round_trip(self):
        document = sign_document(self.key, {"meta": {"schema": 1}, "signatures": []})
        ok, detail = verify_document(document, self.public)
        self.assertTrue(ok, detail)

    def test_tampered_payload_is_rejected(self):
        document = sign_document(self.key, {"rules": ["allow a"]})
        document["payload"]["rules"] = ["allow evil"]
        ok, detail = verify_document(document, self.public)
        self.assertFalse(ok)
        self.assertIn("SIGNATURE INVALID", detail)

    def test_key_substitution_is_rejected(self):
        """Re-signing with a new key must not verify against the pinned one."""
        attacker = LmsPrivateKey.generate(H5)
        document = sign_document(attacker, {"rules": ["allow evil"]})
        ok, detail = verify_document(document, self.public)
        self.assertFalse(ok)
        self.assertIn("different key", detail)

    def test_unsigned_document_is_rejected(self):
        ok, detail = verify_document({"payload": {"a": 1}}, self.public)
        self.assertFalse(ok)
        self.assertIn("not signed", detail)

    def test_no_pinned_key_means_no_trust(self):
        document = sign_document(self.key, {"a": 1})
        ok, detail = verify_document(document, "")
        self.assertFalse(ok)
        self.assertIn("no trusted public key", detail)

    def test_canonical_encoding_is_key_order_independent(self):
        self.assertEqual(canonical_bytes({"b": 1, "a": 2}), canonical_bytes({"a": 2, "b": 1}))


class SignedFeedTests(unittest.TestCase):
    """The feed is the attack surface: it can order Candy to quarantine files."""

    def setUp(self):
        self.key = LmsPrivateKey.generate(H5)
        self.public = self.key.public_key().to_hex()
        self.feed = {"meta": {"schema": 1},
                     "signatures": [{"id": "t", "name": "T", "target": "process_name",
                                     "pattern": "re:^evil\\.exe$", "severity": "high"}]}

    def test_a_hostile_rule_cannot_be_smuggled_in(self):
        document = sign_document(self.key, self.feed)
        document["payload"]["signatures"][0]["pattern"] = "re:^explorer\\.exe$"
        ok, _ = verify_document(document, self.public)
        self.assertFalse(ok)

    def test_valid_feed_ingests(self):
        document = sign_document(self.key, self.feed)
        ok, _ = verify_document(document, self.public)
        self.assertTrue(ok)
        db = ThreatDB()
        added = db.ingest(document["payload"])
        self.assertEqual(added["signatures"], 1)

    def test_plain_http_is_still_refused(self):
        with self.assertRaises(ValueError):
            ThreatDB().update_from_url("http://example.com/threats.json")


class FirewallParsingTests(unittest.TestCase):
    SAMPLE = """
Domain Profile Settings:
----------------------------------------------------------------------
State                                 ON
Firewall Policy                       BlockInbound,AllowOutbound

Private Profile Settings:
----------------------------------------------------------------------
State                                 ON
Firewall Policy                       BlockInbound,AllowOutbound

Public Profile Settings:
----------------------------------------------------------------------
State                                 ON
Firewall Policy                       BlockInbound,BlockOutbound
"""

    LOCKED = SAMPLE.replace("BlockInbound,AllowOutbound", "BlockInbound,BlockOutbound")

    def test_profiles_parse(self):
        profiles = parse_profiles(self.SAMPLE)
        self.assertEqual(set(profiles), {"domain", "private", "public"})
        self.assertEqual(profiles["domain"]["outbound"], "allowoutbound")
        self.assertEqual(profiles["public"]["outbound"], "blockoutbound")
        self.assertEqual(profiles["domain"]["state"], "on")

    def test_locked_down_needs_every_profile(self):
        self.assertFalse(is_locked_down(parse_profiles(self.SAMPLE)))
        self.assertTrue(is_locked_down(parse_profiles(self.LOCKED)))
        self.assertFalse(is_locked_down({}))

    def test_rule_names_are_filtered_to_ours(self):
        output = ("Rule Name:  Candy allow: chrome.exe\n"
                  "----------\n"
                  "Rule Name:  Some Other App\n"
                  "Rule Name:  Candy Block 203.0.113.5 (out)\n")
        names = parse_rule_names(output, prefixes=("Candy allow", "Candy Block"))
        self.assertEqual(names, ["Candy allow: chrome.exe", "Candy Block 203.0.113.5 (out)"])

    def test_rule_names_that_could_inject_are_refused(self):
        self.assertIsNone(safe_rule_name('evil" dir=in action=allow name="x'))
        self.assertIsNone(safe_rule_name("two\nlines"))
        self.assertIsNone(safe_rule_name(""))
        self.assertIsNone(safe_rule_name("a" * 300))
        self.assertEqual(safe_rule_name("Candy allow: chrome.exe"), "Candy allow: chrome.exe")


class FirewallControllerTests(unittest.TestCase):
    def make(self, tmp: str) -> FirewallController:
        config = Config({"paths": {"data": tmp, "logs": tmp, "quarantine": tmp}},
                        Path(tmp) / "config.json")
        return FirewallController(config)

    def test_allowlist_round_trips(self):
        with tempfile.TemporaryDirectory() as tmp:
            controller = self.make(tmp)
            controller.save_allowlist({"c:/x/a.exe": AllowEntry(
                "C:\\x\\a.exe", "ab" * 32, True, "Candy allow: a.exe", "2026-01-01T00:00:00Z")})
            loaded = controller.load_allowlist()
            self.assertEqual(loaded["c:/x/a.exe"].sha256, "ab" * 32)
            self.assertTrue(loaded["c:/x/a.exe"].signed)

    def test_missing_allowlist_is_empty_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.make(tmp).load_allowlist(), {})

    def test_lockdown_refuses_off_windows(self):
        with tempfile.TemporaryDirectory() as tmp:
            ok, detail = self.make(tmp).lockdown()
            self.assertFalse(ok)
            self.assertIn("Windows", detail)

    def test_pending_lockdown_marker_expires_into_a_rollback(self):
        with tempfile.TemporaryDirectory() as tmp:
            controller = self.make(tmp)
            controller._write_marker(-1)          # already past its deadline
            message = controller.rollback_if_unconfirmed()
            self.assertIsNotNone(message)
            self.assertIn("restored", message)
            self.assertFalse(controller._marker_path().exists())

    def test_no_marker_means_nothing_to_roll_back(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(self.make(tmp).rollback_if_unconfirmed())

    def test_confirm_without_a_pending_lockdown(self):
        with tempfile.TemporaryDirectory() as tmp:
            ok, detail = self.make(tmp).confirm()
            self.assertFalse(ok)
            self.assertIn("no pending lockdown", detail)

    def test_essential_programs_are_windows_paths(self):
        for program in ESSENTIAL_PROGRAMS:
            self.assertTrue(program.lower().startswith("c:\\windows"), program)


if __name__ == "__main__":
    unittest.main(verbosity=2)
