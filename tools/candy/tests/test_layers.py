"""Tests for the kernel-policy and network-hardening layers.

Both modules are almost entirely Windows-side effects, so what is tested here
is the part that decides *what* to do: policy selection, ledger handling,
input validation and safe refusal off Windows. The netsh, PowerShell and
registry calls need a real Windows host.
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy.config import Config  # noqa: E402
from candy.kernelpolicy import (ASR_AGGRESSIVE, ASR_RULES, MITIGATION_PROFILES,  # noqa: E402
                                KernelPolicy)
from candy.netharden import (DEFAULT_URL_BLOCKLIST, PROTOCOL_HARDENING,  # noqa: E402
                             RESOLVERS, NetworkHardener, list_interfaces)


def temp_config(tmp: str) -> Config:
    root = Path(tmp)
    return Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                             "quarantine": str(root / "q")}}, root / "config.json")


class AsrCatalogueTests(unittest.TestCase):
    def test_every_rule_is_a_guid_with_a_description(self):
        for rule, (name, why) in ASR_RULES.items():
            self.assertRegex(rule, r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
                                   r"[0-9a-f]{4}-[0-9a-f]{12}$", rule)
            self.assertTrue(name and why, rule)

    def test_aggressive_rules_are_a_subset(self):
        self.assertTrue(ASR_AGGRESSIVE <= set(ASR_RULES))

    def test_byovd_and_lsass_rules_are_present(self):
        """The two that matter most for this threat model."""
        names = {name for name, _ in ASR_RULES.values()}
        self.assertIn("Block credential stealing from LSASS", names)
        self.assertIn("Block abuse of exploited vulnerable signed drivers", names)


class MitigationProfileTests(unittest.TestCase):
    def test_profiles_are_ordered_by_risk(self):
        self.assertEqual(MITIGATION_PROFILES["audit"]["risk"], "none")
        self.assertEqual(MITIGATION_PROFILES["self"]["risk"], "low")
        self.assertEqual(MITIGATION_PROFILES["paranoid"]["risk"], "high")

    def test_game_profile_avoids_options_that_break_roblox(self):
        """CIG refuses Roblox's own signed DLLs; BlockDynamicCode kills the JIT."""
        options = MITIGATION_PROFILES["game"]["enable"]
        self.assertNotIn("MicrosoftSignedOnly", options)
        self.assertNotIn("BlockDynamicCode", options)
        self.assertIn("DisableExtensionPoints", options)
        self.assertIn("BlockLowLabelImageLoads", options)

    def test_audit_profile_only_audits(self):
        self.assertTrue(all(option.startswith("Audit")
                            for option in MITIGATION_PROFILES["audit"]["enable"]))


class KernelPolicyTests(unittest.TestCase):
    def test_refuses_off_windows(self):
        with tempfile.TemporaryDirectory() as tmp:
            policy = KernelPolicy(temp_config(tmp))
            self.assertFalse(policy.apply_asr().ok)
            self.assertFalse(policy.harden_process("roblox.exe").ok)

    def test_rejects_paths_and_bad_names(self):
        with tempfile.TemporaryDirectory() as tmp:
            policy = KernelPolicy(temp_config(tmp))
            for bad in (r"C:\games\roblox.exe", "roblox", "", "a b\nc.exe"):
                result = policy.harden_process(bad)
                self.assertFalse(result.ok)
                self.assertIn("image name", result.detail)

    def test_rejects_unknown_profile(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = KernelPolicy(temp_config(tmp)).harden_process("roblox.exe", "nonsense")
            self.assertFalse(result.ok)
            self.assertIn("unknown profile", result.detail)

    def test_unharden_something_never_hardened(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = KernelPolicy(temp_config(tmp)).unharden_process("roblox.exe")
            self.assertFalse(result.ok)
            self.assertIn("not hardened", result.detail)

    def test_wdac_policy_is_written_in_audit_mode_by_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "policy.xml"
            result = KernelPolicy(temp_config(tmp)).generate_wdac_policy([], out)
            self.assertTrue(result.ok, result.detail)
            text = out.read_text(encoding="utf-8")
            self.assertIn("Enabled:Audit Mode", text)
            self.assertIn("SiPolicy", text)

    def test_wdac_enforced_mode_omits_the_audit_rule(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "policy.xml"
            KernelPolicy(temp_config(tmp)).generate_wdac_policy([], out, audit=False)
            self.assertNotIn("Enabled:Audit Mode", out.read_text(encoding="utf-8"))

    def test_status_reports_every_rule(self):
        with tempfile.TemporaryDirectory() as tmp:
            status = KernelPolicy(temp_config(tmp)).status()
            self.assertEqual(len(status["asr_rules"]), len(ASR_RULES))
            self.assertEqual(status["asr_active_count"], 0)


class NetworkHardenerTests(unittest.TestCase):
    def test_resolvers_are_well_formed(self):
        for key, resolver in RESOLVERS.items():
            self.assertTrue(resolver["name"])
            self.assertTrue(resolver["v4"], key)
            self.assertTrue(resolver["doh"].startswith("https://"), key)

    def test_unknown_resolver_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = NetworkHardener(temp_config(tmp)).set_resolver("my-isp")
            self.assertFalse(result.ok)
            self.assertIn("unknown resolver", result.detail)

    def test_refuses_off_windows(self):
        with tempfile.TemporaryDirectory() as tmp:
            hardener = NetworkHardener(temp_config(tmp))
            for result in hardener.apply_all():
                self.assertFalse(result.ok)
                self.assertIn("Windows", result.detail)

    def test_interfaces_empty_off_windows(self):
        self.assertEqual(list_interfaces(), [])

    def test_status_is_readable_before_anything_is_applied(self):
        with tempfile.TemporaryDirectory() as tmp:
            status = NetworkHardener(temp_config(tmp)).status()
            self.assertEqual(status["resolver"], "system default")
            self.assertEqual(status["protocol_changes"], 0)
            self.assertIn("quad9", status["available_resolvers"])

    def test_ledger_round_trips(self):
        with tempfile.TemporaryDirectory() as tmp:
            hardener = NetworkHardener(temp_config(tmp))
            ledger = hardener._ledger()
            ledger["resolver"] = "quad9"
            ledger["registry"] = [{"key": "K", "value": "V", "previous": 1}]
            hardener._save(ledger)
            self.assertEqual(NetworkHardener(temp_config(tmp))._ledger()["resolver"], "quad9")

    def test_url_blocklist_patterns_are_browser_policy_shaped(self):
        for pattern in DEFAULT_URL_BLOCKLIST:
            self.assertTrue(pattern.startswith(("*://", "file://")), pattern)

    def test_protocol_hardening_records_a_reason_for_each_change(self):
        for key, value_name, value, description in PROTOCOL_HARDENING:
            self.assertTrue(key and value_name and description)
            self.assertIsInstance(value, int)


if __name__ == "__main__":
    unittest.main(verbosity=2)
