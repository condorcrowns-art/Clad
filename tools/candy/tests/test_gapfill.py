"""Tests for the gap-filling layers: AES vault, prevention, anomaly, triage,
integrity — and a fuzzing pass over every parser.

The fuzz tests are the honest stand-in for "formal proof of no memory errors".
Python cannot buffer-overflow, but a parser that raises on malformed input
still takes a monitor thread down. These feed thousands of mutated and random
inputs through every parser Candy points at untrusted data and assert that not
one of them raises.
"""
from __future__ import annotations

import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy import pe, triage  # noqa: E402
from candy.anomaly import BeaconVerdict, detect_beacon, zscore  # noqa: E402
from candy.config import Config  # noqa: E402
from candy.integrity import build_manifest, compare_manifests  # noqa: E402
from candy.netblock import normalize_domain, parse_managed_block, render_hosts  # noqa: E402
from candy.persistence import extract_image, parse_schtasks_csv  # noqa: E402
from candy.prevent import (ExecutionBlocker, NetworkContainer, is_protected_image,  # noqa: E402
                           valid_image_name)
from candy.vault import (Vault, aes256_gcm_decrypt, aes256_gcm_encrypt,  # noqa: E402
                         _encrypt_block, _expand_key, is_encrypted)
from candy.winevents import parse_access_mask, parse_events, sha256_from_hashes  # noqa: E402
from pebuilder import build_pe  # noqa: E402


def temp_config(tmp: str) -> Config:
    root = Path(tmp)
    return Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                             "quarantine": str(root / "q")}}, root / "config.json")


class AesKnownAnswerTests(unittest.TestCase):
    """Validated against published vectors, not just self-consistency."""

    def test_fips197_aes256_known_answer(self):
        key = bytes.fromhex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f")
        plaintext = bytes.fromhex("00112233445566778899aabbccddeeff")
        self.assertEqual(_encrypt_block(plaintext, _expand_key(key)).hex(),
                         "8ea2b7ca516745bfeafc49904b496089")

    def test_sp800_38d_gcm_case_13(self):
        _, ciphertext, tag = aes256_gcm_encrypt(bytes(32), b"", b"", bytes(12))
        self.assertEqual(ciphertext, b"")
        self.assertEqual(tag.hex(), "530f8afbc74536b9a963b4f1c4cb738b")

    def test_key_must_be_256_bits(self):
        with self.assertRaises(ValueError):
            _expand_key(bytes(16))

    def test_nonce_must_be_96_bits(self):
        with self.assertRaises(ValueError):
            aes256_gcm_encrypt(bytes(32), b"x", b"", bytes(16))


class AesGcmTests(unittest.TestCase):
    KEY = bytes(range(32))

    def test_round_trip_across_sizes(self):
        for size in (0, 1, 15, 16, 17, 4096, 10_000):
            message = bytes(random.getrandbits(8) for _ in range(size))
            nonce, ciphertext, tag = aes256_gcm_encrypt(self.KEY, message)
            self.assertEqual(aes256_gcm_decrypt(self.KEY, nonce, ciphertext, tag), message)

    def test_modified_ciphertext_is_rejected(self):
        message = b"quarantined payload" * 8
        nonce, ciphertext, tag = aes256_gcm_encrypt(self.KEY, message)
        broken = bytearray(ciphertext)
        broken[3] ^= 0x80
        with self.assertRaises(ValueError):
            aes256_gcm_decrypt(self.KEY, nonce, bytes(broken), tag)

    def test_modified_tag_is_rejected(self):
        nonce, ciphertext, tag = aes256_gcm_encrypt(self.KEY, b"data")
        with self.assertRaises(ValueError):
            aes256_gcm_decrypt(self.KEY, nonce, ciphertext, bytes(16))

    def test_associated_data_is_bound(self):
        nonce, ciphertext, tag = aes256_gcm_encrypt(self.KEY, b"data", b"hash-a")
        self.assertEqual(aes256_gcm_decrypt(self.KEY, nonce, ciphertext, tag, b"hash-a"), b"data")
        with self.assertRaises(ValueError):
            aes256_gcm_decrypt(self.KEY, nonce, ciphertext, tag, b"hash-b")

    def test_wrong_key_is_rejected(self):
        nonce, ciphertext, tag = aes256_gcm_encrypt(self.KEY, b"data")
        with self.assertRaises(ValueError):
            aes256_gcm_decrypt(bytes(32), nonce, ciphertext, tag)


class VaultTests(unittest.TestCase):
    def test_file_encrypt_decrypt_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Vault(Path(tmp) / "vault.key")
            sample = Path(tmp) / "payload.bin"
            original = b"MZ\x90\x00" + bytes(range(256)) * 4
            sample.write_bytes(original)

            vault.encrypt_file(sample, associated=b"abc")
            self.assertTrue(is_encrypted(sample))
            self.assertNotIn(b"MZ\x90\x00", sample.read_bytes()[16:])

            vault.decrypt_file(sample, associated=b"abc")
            self.assertEqual(sample.read_bytes(), original)

    def test_tampered_container_will_not_decrypt(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault = Vault(Path(tmp) / "vault.key")
            sample = Path(tmp) / "payload.bin"
            sample.write_bytes(b"secret" * 20)
            vault.encrypt_file(sample)
            blob = bytearray(sample.read_bytes())
            blob[-1] ^= 0xFF
            sample.write_bytes(bytes(blob))
            with self.assertRaises(ValueError):
                vault.decrypt_file(sample)

    def test_key_persists_across_instances(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "vault.key"
            first = Vault(path)
            key = first.key()
            self.assertEqual(len(key), 32)
            self.assertEqual(Vault(path).key(), key)

    def test_non_container_is_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            sample = Path(tmp) / "plain.bin"
            sample.write_bytes(b"not encrypted")
            self.assertFalse(is_encrypted(sample))
            with self.assertRaises(ValueError):
                Vault(Path(tmp) / "vault.key").decrypt_file(sample)


class PreventionTests(unittest.TestCase):
    def test_image_name_validation(self):
        self.assertEqual(valid_image_name("krnl.exe"), "krnl.exe")
        self.assertEqual(valid_image_name('"solara.exe"'), "solara.exe")
        for bad in [r"C:\path\krnl.exe", "krnl", "krnl.dll", "", "a" * 200 + ".exe",
                    "krnl.exe\nother.exe", "a/b.exe"]:
            self.assertIsNone(valid_image_name(bad), bad)

    def test_critical_images_are_protected(self):
        for name in ("explorer.exe", "LSASS.EXE", "cmd.exe", "candy.exe", "MsMpEng.exe"):
            self.assertTrue(is_protected_image(name), name)
        self.assertFalse(is_protected_image("krnl.exe"))

    def test_blocking_a_protected_image_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = ExecutionBlocker(temp_config(tmp)).block("explorer.exe")
            self.assertFalse(result.ok)
            self.assertIn("protected-image list", result.detail)

    def test_blocking_a_path_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = ExecutionBlocker(temp_config(tmp)).block(r"C:\Users\bob\krnl.exe")
            self.assertFalse(result.ok)
            self.assertIn("plain image name", result.detail)

    def test_ledger_starts_empty_and_survives_reload(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = temp_config(tmp)
            blocker = ExecutionBlocker(config)
            self.assertEqual(blocker.blocked_images(), [])
            blocker._save_ledger({"krnl.exe": {"image": "krnl.exe"}})
            self.assertEqual(ExecutionBlocker(config).blocked_images(), ["krnl.exe"])

    def test_containment_requires_a_real_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = NetworkContainer(temp_config(tmp)).contain(str(Path(tmp) / "nope.exe"))
            self.assertFalse(result.ok)

    def test_releasing_something_never_contained(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(NetworkContainer(temp_config(tmp)).release("C:/x/a.exe").ok)


class BeaconDetectionTests(unittest.TestCase):
    def test_perfectly_regular_traffic_is_a_beacon(self):
        verdict = detect_beacon([float(i * 60) for i in range(12)])
        self.assertTrue(verdict.is_beacon)
        self.assertAlmostEqual(verdict.period, 60.0, places=1)
        self.assertLess(verdict.jitter, 0.01)

    def test_slightly_jittered_beacon_is_still_caught(self):
        random.seed(7)
        times, clock = [], 0.0
        for _ in range(12):
            clock += 60 + random.uniform(-4, 4)      # under 10% jitter
            times.append(clock)
        self.assertTrue(detect_beacon(times).is_beacon)

    def test_human_traffic_is_not_a_beacon(self):
        random.seed(11)
        times, clock = [], 0.0
        for _ in range(12):
            clock += random.uniform(1, 400)
            times.append(clock)
        self.assertFalse(detect_beacon(times).is_beacon)

    def test_too_few_samples_is_not_a_beacon(self):
        verdict = detect_beacon([0.0, 60.0, 120.0])
        self.assertFalse(verdict.is_beacon)
        self.assertIn("not enough", verdict.reason)

    def test_rapid_connections_are_not_reported_as_beacons(self):
        """A busy connection pool is regular but harmless."""
        verdict = detect_beacon([float(i) * 0.5 for i in range(30)])
        self.assertFalse(verdict.is_beacon)
        self.assertIn("too short", verdict.reason)

    def test_unordered_timestamps_are_handled(self):
        times = [float(i * 60) for i in range(12)]
        random.shuffle(times)
        self.assertTrue(detect_beacon(times).is_beacon)

    def test_identical_timestamps_do_not_divide_by_zero(self):
        self.assertFalse(detect_beacon([5.0] * 20).is_beacon)

    def test_zscore(self):
        self.assertEqual(zscore(10, []), 0.0, "too little history to judge")
        self.assertEqual(zscore(10, [10, 10, 10]), 0.0,
                         "matching a flat baseline is not an anomaly")
        self.assertEqual(zscore(20, [10, 10, 10, 10]), float("inf"),
                         "exceeding a baseline with zero variance is maximally anomalous")
        self.assertGreater(zscore(50, [10, 12, 11, 9, 10]), 3)


class TriageTests(unittest.TestCase):
    def build(self, tmp: str, payload: bytes, name: str = "sample.exe", **kwargs) -> Path:
        path = Path(tmp) / name
        path.write_bytes(build_pe(code=payload * 3, **kwargs))
        return path

    def test_injection_triad_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.build(tmp, b"VirtualAllocEx\0WriteProcessMemory\0CreateRemoteThread\0")
            report = triage.triage(path)
            self.assertIn("injection", report.capabilities)
            self.assertGreaterEqual(report.score, 35)

    def test_credential_theft_is_critical(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.build(tmp, b"CryptUnprotectData\0\\Login Data\0cookies.sqlite\0")
            report = triage.triage(path)
            self.assertEqual(report.capabilities["credentials"]["severity"], "critical")

    def test_discord_webhook_exfil_is_found(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.build(
                tmp, b"https://discord.com/api/webhooks/1234567890/AbCdEfGhIjKlMnOp\0")
            report = triage.triage(path)
            self.assertIn("discord_webhook", report.exfil)
            self.assertGreaterEqual(report.score, 45)

    def test_clean_binary_scores_low(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = self.build(tmp, b"Hello world\0This is an ordinary program\0",
                              strings={"OriginalFilename": "sample.exe"})
            report = triage.triage(path)
            self.assertEqual(report.verdict, "clean")
            self.assertEqual(report.capabilities, {})

    def test_a_single_common_api_is_not_enough(self):
        """OpenProcess alone appears in plenty of legitimate software."""
        with tempfile.TemporaryDirectory() as tmp:
            path = self.build(tmp, b"OpenProcess\0")
            self.assertNotIn("process_access", triage.triage(path).capabilities)

    def test_non_pe_file_is_handled(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "notes.txt"
            path.write_text("just some text", encoding="utf-8")
            report = triage.triage(path)
            self.assertFalse(report.is_pe)
            self.assertEqual(report.verdict, "clean")

    def test_missing_file_does_not_raise(self):
        report = triage.triage("/definitely/not/here.exe")
        self.assertIn("unreadable", " ".join(report.notes))


class IntegrityTests(unittest.TestCase):
    def test_manifest_detects_modification_and_deletion(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "candy").mkdir()
            (root / "candy" / "a.py").write_text("print(1)", encoding="utf-8")
            (root / "candy" / "b.py").write_text("print(2)", encoding="utf-8")
            baseline = build_manifest(root)
            self.assertEqual(baseline["count"], 2)

            (root / "candy" / "a.py").write_text("print('evil')", encoding="utf-8")
            (root / "candy" / "b.py").unlink()
            (root / "candy" / "c.py").write_text("print(3)", encoding="utf-8")

            findings = compare_manifests(baseline, build_manifest(root))
            problems = {f["file"]: f["problem"] for f in findings}
            self.assertEqual(problems["candy/a.py"], "modified")
            self.assertEqual(problems["candy/b.py"], "missing")
            self.assertIn("added", problems["candy/c.py"])

    def test_unchanged_tree_reports_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "candy").mkdir()
            (root / "candy" / "a.py").write_text("x = 1", encoding="utf-8")
            baseline = build_manifest(root)
            self.assertEqual(compare_manifests(baseline, build_manifest(root)), [])


class ParserFuzzTests(unittest.TestCase):
    """No parser may raise on hostile input — the memory-safety stand-in.

    Every one of these parsers is pointed at data an attacker controls: files
    on disk, event XML, hosts files, command lines. A raise inside a monitor
    thread is a silent loss of protection.
    """

    ITERATIONS = 400

    def setUp(self):
        random.seed(1337)

    def test_pe_parser_survives_random_bytes(self):
        for _ in range(self.ITERATIONS):
            size = random.randint(0, 2048)
            blob = bytes(random.getrandbits(8) for _ in range(size))
            pe.inspect_bytes(blob, "fuzz")

    def test_pe_parser_survives_mutated_valid_files(self):
        base = bytearray(build_pe(strings={"OriginalFilename": "a.exe"}))
        for _ in range(self.ITERATIONS):
            mutated = bytearray(base)
            for _ in range(random.randint(1, 12)):
                mutated[random.randrange(len(mutated))] = random.getrandbits(8)
            info = pe.inspect_bytes(bytes(mutated), "fuzz")
            self.assertIsInstance(info.version_strings, dict)

    def test_pe_parser_survives_truncation(self):
        base = build_pe(strings={"OriginalFilename": "a.exe"})
        for cut in range(0, len(base), 37):
            pe.inspect_bytes(base[:cut], "fuzz")

    def test_event_xml_parser_survives_garbage(self):
        fragments = [b"<Event>", b"</Event>", b"<System>", b"<EventID>abc</EventID>",
                     b"<Data Name=", b'"x"', b"\x00\xff", b"&amp;", b"<!--", b"]]>"]
        for _ in range(self.ITERATIONS):
            blob = b"".join(random.choice(fragments) for _ in range(random.randint(1, 20)))
            records = parse_events(blob.decode("latin-1"))
            self.assertIsInstance(records, list)

    def test_access_mask_and_hash_parsers_survive_garbage(self):
        for _ in range(self.ITERATIONS):
            junk = "".join(chr(random.randrange(32, 127)) for _ in range(random.randint(0, 40)))
            self.assertIsInstance(parse_access_mask(junk), int)
            self.assertIn(type(sha256_from_hashes(junk)), (str, type(None)))

    def test_hosts_parser_survives_garbage(self):
        for _ in range(self.ITERATIONS):
            lines = []
            for _ in range(random.randint(0, 20)):
                lines.append("".join(chr(random.randrange(9, 127))
                                     for _ in range(random.randint(0, 60))))
            text = "\n".join(lines)
            self.assertIsInstance(parse_managed_block(text), list)
            self.assertIsInstance(render_hosts(text, ["bad.gg"]), str)

    def test_domain_normaliser_survives_garbage(self):
        for _ in range(self.ITERATIONS):
            junk = "".join(chr(random.randrange(1, 300)) for _ in range(random.randint(0, 80)))
            result = normalize_domain(junk)
            if result is not None:
                # Whatever comes back must be a single safe hosts-file token.
                self.assertNotIn(" ", result)
                self.assertNotIn("\n", result)

    def test_command_line_and_csv_parsers_survive_garbage(self):
        for _ in range(self.ITERATIONS):
            junk = "".join(random.choice('abc "\',\\/.exe\n\t')
                           for _ in range(random.randint(0, 80)))
            self.assertIsInstance(extract_image(junk), str)
            self.assertIsInstance(parse_schtasks_csv(junk), list)

    def test_triage_survives_random_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fuzz.bin"
            for _ in range(60):
                path.write_bytes(bytes(random.getrandbits(8)
                                       for _ in range(random.randint(0, 4096))))
                report = triage.triage(path)
                self.assertIsInstance(report.score, int)


if __name__ == "__main__":
    unittest.main(verbosity=2)
