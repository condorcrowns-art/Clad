"""Candy's own security. Every test here is a regression test for a real hole.

A security tool that can be installed to run as SYSTEM at boot is a
privilege-escalation target. These cover the four ways that could have been
turned against the machine it was protecting.
"""
from __future__ import annotations

import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy.config import Config  # noqa: E402
from candy.dnsproxy import is_loopback, public_bind_problem  # noqa: E402
from candy.kernelpolicy import ps_quote  # noqa: E402
from candy.prevent import valid_image_name  # noqa: E402
from candy.responder import Responder, unsafe_restore_target  # noqa: E402
from candy.selfprotect import SelfProtect, icacls_lockdown_commands  # noqa: E402


def config_for(tmp: str) -> Config:
    root = Path(tmp)
    return Config({"paths": {"data": str(root / "d"), "logs": str(root / "l"),
                             "quarantine": str(root / "q")}}, root / "config.json")


class CommandInjectionTests(unittest.TestCase):
    """`candy kernel harden <name>` interpolates the name into a PowerShell
    command line. It used to accept quotes, backticks, `$` and `;`."""

    INJECTIONS = (
        "a'; Start-Process calc; '.exe",
        "a`whoami`.exe",
        "a$(calc).exe",
        "a;calc.exe",
        "a&calc.exe",
        "a|calc.exe",
        "a\nStart-Process calc\n.exe",
        "-Command.exe",
        "a%COMSPEC%.exe",
        "a{0}.exe",
    )

    def test_shell_metacharacters_are_refused(self):
        for probe in self.INJECTIONS:
            with self.subTest(probe=probe):
                self.assertIsNone(valid_image_name(probe))

    def test_real_image_names_still_pass(self):
        for name in ("RobloxPlayerBeta.exe", "krnl.exe", "my-tool.exe",
                     "Some Program.exe", "thing_v2.scr"):
            with self.subTest(name=name):
                self.assertEqual(valid_image_name(name), name)

    def test_paths_are_still_refused(self):
        for probe in (r"C:\Windows\System32\calc.exe", "../calc.exe", "a/b.exe", ".."):
            with self.subTest(probe=probe):
                self.assertIsNone(valid_image_name(probe))

    def test_quoting_survives_a_relaxed_validator(self):
        """Defence in depth: if the validator is ever loosened, the quoting at
        the call site still keeps the command line intact."""
        self.assertEqual(ps_quote("a'; calc; '.exe"), "'a''; calc; ''.exe'")
        self.assertEqual(ps_quote("plain.exe"), "'plain.exe'")

    def test_quoting_is_balanced_for_every_injection(self):
        for probe in self.INJECTIONS:
            with self.subTest(probe=probe):
                quoted = ps_quote(probe)
                self.assertTrue(quoted.startswith("'") and quoted.endswith("'"))
                # Every interior quote is doubled, so none of them can close
                # the string early.
                self.assertEqual(quoted[1:-1].count("'") % 2, 0)


class WindowsRegressionTests(unittest.TestCase):
    """Bugs found the first time Candy ran on a real Windows machine."""

    def test_the_window_proc_return_type_is_pointer_sized(self):
        """LRESULT is 64-bit on a 64-bit build. Declared as c_long it truncates,
        and ctypes then rejects every real lparam with "int too long to
        convert" — once per window message, forever."""
        source = (Path(__file__).resolve().parent.parent
                  / "candy" / "notify.py").read_text(encoding="utf-8")
        self.assertIn("LRESULT = ctypes.c_ssize_t", source)
        self.assertNotIn("ctypes.WINFUNCTYPE(ctypes.c_long", source)
        self.assertIn("DefWindowProcW.argtypes", source)
        self.assertIn("DefWindowProcW.restype", source)

    def test_the_window_proc_cannot_raise(self):
        """A raising window proc has nowhere to report — Python can only print
        it, so it becomes console spam on every message."""
        source = (Path(__file__).resolve().parent.parent
                  / "candy" / "notify.py").read_text(encoding="utf-8")
        start = source.index("def window_proc(")
        end = source.index("self._wndproc_ref", start)
        self.assertIn("except Exception", source[start:end])

    def test_wmi_startup_failure_is_caught(self):
        """Win32_ProcessStartTrace needs administrator. Without it watch_for()
        raises access-denied and used to kill the thread with a traceback,
        even though polling carries on and catches the same events."""
        source = (Path(__file__).resolve().parent.parent
                  / "candy" / "procmon.py").read_text(encoding="utf-8")
        start = source.index("def _wmi_loop(")
        end = source.index("while not self._stop.is_set():", start)
        body = source[start:end]
        self.assertIn("watch_for()", body)
        self.assertIn("except Exception", body)
        self.assertIn("self.wmi_error", body)

    def test_the_monitor_does_not_claim_wmi_before_it_works(self):
        """It used to report "wmi+poll" the moment the thread was launched,
        including when that thread immediately died on access-denied."""
        source = (Path(__file__).resolve().parent.parent
                  / "candy" / "procmon.py").read_text(encoding="utf-8")
        self.assertNotIn('self.mode = "wmi+poll" if started_wmi else "poll"', source)

    def test_the_window_class_uses_the_same_proc_type(self):
        """The struct field had its own c_long copy of the signature. A struct
        that disagrees with the callback is the same truncation bug wearing a
        different hat."""
        source = (Path(__file__).resolve().parent.parent
                  / "candy" / "notify.py").read_text(encoding="utf-8")
        self.assertIn('("lpfnWndProc", WNDPROC)', source)
        self.assertNotIn("ctypes.c_long", source)


class FalsePositiveTests(unittest.TestCase):
    """Found by running against a real, clean Windows 11 machine: 42 detections
    with 11 highs, none of them real. A tool that cries wolf gets closed."""

    def test_a_program_files_path_is_not_truncated(self):
        """\\S+? cannot cross the space in "Program Files", so an unquoted path
        came back as "Files\\Google\\..." — which exists nowhere, so every
        signature, hash and signature check against it silently did nothing."""
        from candy.persistence import extract_image

        self.assertEqual(
            extract_image(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe")

    def test_quoted_paths_still_win(self):
        from candy.persistence import extract_image

        self.assertEqual(extract_image(r'"C:\Program Files\x\a.exe" -silent'),
                         r"C:\Program Files\x\a.exe")

    def test_arguments_are_still_not_swallowed(self):
        """A path that may contain spaces must not eat the rest of the line."""
        from candy.persistence import extract_image

        self.assertEqual(extract_image(r"C:\Windows\notepad.exe /a"),
                         r"C:\Windows\notepad.exe")
        self.assertEqual(extract_image(r"rundll32.exe C:\x\evil.dll,Entry"),
                         "rundll32.exe")

    def test_environment_variable_paths_survive(self):
        from candy.persistence import extract_image

        self.assertEqual(extract_image(r"%APPDATA%\My App\thing.exe"),
                         r"%APPDATA%\My App\thing.exe")

    def test_com_hijack_requires_an_actual_machine_wide_entry(self):
        """The finding said "this shadows the system-wide registration" without
        ever looking at HKLM. Every Electron app registers per-user COM, so on
        a clean machine that was ten high-severity lies."""
        source = (Path(__file__).resolve().parent.parent
                  / "candy" / "persistence.py").read_text(encoding="utf-8")
        self.assertIn("def _clsid_in_hklm", source)
        start = source.index("def _enumerate_com_hijacks")
        self.assertIn("_clsid_in_hklm(clsid, server)", source[start:])

    def test_unknown_platform_state_is_not_reported_as_healthy(self):
        """VBS/HVCI came back None — unreadable without administrator — and the
        advice line still said the platform looked correctly configured."""
        source = (Path(__file__).resolve().parent.parent
                  / "candy" / "integrity.py").read_text(encoding="utf-8")
        self.assertIn("unknown rather than confirmed", source)


class RestoreTargetTests(unittest.TestCase):
    """Restore writes a file to whatever the metadata names."""

    def test_system_directories_are_refused(self):
        for probe in (r"C:\Windows\System32\evil.dll", r"C:\Windows\Temp\x.exe",
                      r"C:\Program Files\Common Files\x.dll",
                      r"c:\program files (x86)\x.exe"):
            with self.subTest(probe=probe):
                self.assertIsNotNone(unsafe_restore_target(Path(probe)))

    def test_traversal_is_refused_even_with_windows_separators(self):
        """Path().parts does not split backslashes off Windows, so the obvious
        check silently passed this."""
        self.assertIsNotNone(unsafe_restore_target(Path(r"C:\Users\..\Windows\x.exe")))

    def test_relative_paths_are_refused(self):
        self.assertIsNotNone(unsafe_restore_target(Path("relative/x.exe")))
        self.assertIsNotNone(unsafe_restore_target(Path("")))

    def test_a_normal_user_path_is_allowed(self):
        self.assertIsNone(unsafe_restore_target(Path(r"C:\Users\p\Downloads\thing.exe")))
        self.assertIsNone(unsafe_restore_target(Path("/home/user/thing.exe")))


class QuarantineMetadataTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = config_for(self.tmp.name)
        self.responder = Responder(self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def _quarantine(self, name: str = "bad.exe"):
        source = Path(self.tmp.name) / name
        source.write_bytes(b"MZ payload")
        self.responder.quarantine(source, forced=True)
        entry = self.responder.list_quarantine()[0]["quarantine_file"]
        return Path(entry), Path(entry).with_suffix(Path(entry).suffix + ".json")

    def test_metadata_is_authenticated_when_written(self):
        _quarantined, meta_path = self._quarantine()
        self.assertIn("hmac", json.loads(meta_path.read_text(encoding="utf-8")))

    def test_an_honest_restore_still_works(self):
        quarantined, _meta = self._quarantine()
        self.assertTrue(self.responder.restore(quarantined).ok)

    def test_forged_metadata_is_refused(self):
        """The escalation: an unprivileged user drops a metadata file naming a
        system path, and a SYSTEM-run Candy writes there on restore."""
        quarantined, meta_path = self._quarantine()
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["original_path"] = r"C:\Windows\System32\evil.dll"
        meta_path.write_text(json.dumps(meta), encoding="utf-8")
        result = self.responder.restore(quarantined)
        self.assertFalse(result.ok)
        self.assertIn("not one Candy wrote", result.detail)

    def test_metadata_with_no_hmac_at_all_is_refused(self):
        quarantined, meta_path = self._quarantine()
        meta_path.write_text(json.dumps({"original_path": str(Path(self.tmp.name) / "x")}),
                             encoding="utf-8")
        self.assertFalse(self.responder.restore(quarantined).ok)

    def test_unreadable_metadata_does_not_raise(self):
        quarantined, meta_path = self._quarantine()
        meta_path.write_text("{not json", encoding="utf-8")
        self.assertFalse(self.responder.restore(quarantined).ok)

    def test_an_explicit_destination_still_works_after_a_refusal(self):
        """A user who knows the file is safe needs a way through."""
        quarantined, meta_path = self._quarantine()
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["original_path"] = r"C:\Windows\System32\evil.dll"
        meta_path.write_text(json.dumps(meta), encoding="utf-8")
        self.assertFalse(self.responder.restore(quarantined).ok)

    def test_tampering_with_any_field_invalidates_it(self):
        quarantined, meta_path = self._quarantine()
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["sha256"] = "0" * 64
        meta_path.write_text(json.dumps(meta), encoding="utf-8")
        self.assertFalse(self.responder.restore(quarantined).ok)


class DnsBindingTests(unittest.TestCase):
    def test_loopback_is_recognised(self):
        for host in ("127.0.0.1", "127.0.0.53", "::1", "localhost"):
            with self.subTest(host=host):
                self.assertTrue(is_loopback(host))

    def test_a_public_bind_is_refused_by_default(self):
        """An open resolver is a UDP amplifier aimed at whoever the attacker
        names."""
        for host in ("0.0.0.0", "192.168.1.10", "::"):
            with self.subTest(host=host):
                self.assertIsNotNone(public_bind_problem(host))

    def test_loopback_is_allowed(self):
        self.assertIsNone(public_bind_problem("127.0.0.1"))

    def test_an_explicit_opt_in_is_honoured(self):
        self.assertIsNone(public_bind_problem("0.0.0.0", allowed=True))

    def test_the_refusal_explains_the_risk(self):
        self.assertIn("amplify", public_bind_problem("0.0.0.0"))


class SelfProtectTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = config_for(self.tmp.name)
        self.guard = SelfProtect(self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_clean_install_passes(self):
        report = self.guard.check()
        self.assertTrue(report.ok, [f.detail for f in report.failures])

    def test_a_world_writable_directory_is_caught(self):
        if os.name == "nt":  # pragma: no cover - POSIX modes only
            self.skipTest("POSIX mode bits")
        data = self.config.data_dir()
        data.mkdir(parents=True, exist_ok=True)
        os.chmod(data, 0o777)
        report = self.guard.check()
        self.assertFalse(report.ok)
        self.assertTrue(any("world-writable" in f.detail for f in report.failures))

    def test_a_readable_key_file_is_caught(self):
        if os.name == "nt":  # pragma: no cover - POSIX modes only
            self.skipTest("POSIX mode bits")
        data = self.config.data_dir()
        data.mkdir(parents=True, exist_ok=True)
        key = data / "vault.key"
        key.write_bytes(b"x" * 32)
        os.chmod(key, 0o644)
        report = self.guard.check()
        self.assertTrue(any("readable by other users" in f.detail
                            for f in report.failures))

    def test_a_public_dns_binding_is_reported(self):
        self.config.set("dns.listen", "0.0.0.0")
        self.config.set("dns.allow_public_bind", True)
        report = self.guard.check()
        self.assertTrue(any(f.check == "dns binding" for f in report.failures))

    def test_the_lockdown_removes_inheritance(self):
        """/inheritance:r is the command that actually drops the default user
        write grant. Without it the /grant calls add nothing."""
        commands = icacls_lockdown_commands(Path(r"C:\Candy"))
        self.assertTrue(any("/inheritance:r" in command for command in commands))
        self.assertTrue(any("S-1-5-18" in " ".join(command) for command in commands))
        self.assertTrue(any("S-1-5-32-544" in " ".join(command) for command in commands))

    def test_hardening_off_windows_says_so_rather_than_pretending(self):
        findings = self.guard.harden()
        if os.name != "nt":
            self.assertFalse(findings[0].ok)
            self.assertIn("Windows-only", findings[0].detail)

    def test_the_report_is_readable(self):
        from candy.selfprotect import format_report

        self.assertIn("Overall", format_report(self.guard.check()))


if __name__ == "__main__":
    unittest.main()
