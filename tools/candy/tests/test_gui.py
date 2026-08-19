"""Structural tests for the GUI, run without tkinter.

The GUI cannot be imported on a machine with no Tk, and Tk cannot be driven
headlessly on the build box, so these tests read ``candy/gui.py`` as source
instead. That is enough to catch the two mistakes that actually happen:

1. The GUI falls behind the CLI — a subsystem gets built, shipped, and never
   surfaced in the only interface most buyers will ever open.
2. The GUI calls a CLI command with a namespace that is missing an argument
   the command reads, which raises ``AttributeError`` at the moment the user
   clicks the button, on Windows, where nothing here would have caught it.
"""
from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from candy import cli  # noqa: E402

GUI_SOURCE = Path(__file__).resolve().parent.parent / "candy" / "gui.py"


def gui_class() -> ast.ClassDef:
    tree = ast.parse(GUI_SOURCE.read_text(encoding="utf-8"))
    return next(node for node in tree.body
                if isinstance(node, ast.ClassDef) and node.name == "App")


def gui_methods() -> set[str]:
    return {node.name for node in gui_class().body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}


def gui_source() -> str:
    return GUI_SOURCE.read_text(encoding="utf-8")


def capture_calls() -> list[tuple[str, set[str]]]:
    """Every ``self._capture(cmd_x, field=…)`` call in the GUI."""
    calls: list[tuple[str, set[str]]] = []
    for node in ast.walk(gui_class()):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (isinstance(func, ast.Attribute) and func.attr == "_capture"):
            continue
        if not node.args or not isinstance(node.args[0], ast.Name):
            continue
        calls.append((node.args[0].id, {kw.arg for kw in node.keywords if kw.arg}))
    return calls


def parser_dests(command: str) -> set[str]:
    """Attribute names the CLI parser sets for one subcommand."""
    parser = cli.build_parser()
    subparsers = next(action for action in parser._actions  # noqa: SLF001
                      if hasattr(action, "choices") and action.choices
                      and command in action.choices)
    chosen = subparsers.choices[command]
    return {action.dest for action in chosen._actions  # noqa: SLF001
            if action.dest not in ("help", "func")}


class TabCoverageTests(unittest.TestCase):
    def test_every_major_subsystem_has_a_tab(self):
        methods = gui_methods()
        for builder in ("_build_threats_tab", "_build_scan_tab", "_build_protection_tab",
                        "_build_extensions_tab", "_build_tools_tab", "_build_status_tab",
                        "_build_log_tab", "_build_lists_tab", "_build_quarantine_tab",
                        "_build_settings_tab"):
            self.assertIn(builder, methods, f"the GUI has no {builder}")

    def test_every_tab_builder_is_actually_called(self):
        source = gui_source()
        for builder in (name for name in gui_methods() if name.endswith("_tab")):
            self.assertIn(f"self.{builder}()", source,
                          f"{builder} is defined but never called, so its tab never appears")

    def test_the_hardening_subsystems_are_reachable(self):
        """Each of these is a system-level change the CLI can make. A buyer who
        never opens a terminal has to be able to reach all of them."""
        methods = gui_methods()
        for handler in ("fullscan_start", "fullscan_cancel", "adblock_set", "adblock_import",
                        "dns_test", "netharden_apply", "netharden_revert", "kernel_asr",
                        "kernel_harden", "firewall_learn", "firewall_lockdown",
                        "firewall_confirm", "firewall_unlock", "panic", "revert_all",
                        "extensions_scan", "explain_file", "check_url", "run_selftest",
                        "trust_check", "trust_pin", "trust_accept"):
            self.assertIn(handler, methods, f"nothing in the GUI can do {handler}")

    def test_destructive_actions_ask_first(self):
        """Lockdown, panic, revert and quarantine change the machine. Every one
        of them must go through a confirmation dialog."""
        source = gui_source()
        for handler in ("def firewall_lockdown", "def panic", "def revert_all",
                        "def netharden_apply", "def scan_quarantine",
                        "def trust_accept"):
            start = source.index(handler)
            end = source.index("\n    def ", start + 1)
            self.assertIn("askyesno", source[start:end],
                          f"{handler.split()[1]} acts without asking the user")


    def test_every_whitelist_add_pins_the_build(self):
        """Trusting from the GUI has to record what was trusted, or the
        exit-scam defence has a hole exactly where users actually grant
        trust."""
        source = gui_source()
        for handler in ("def action_whitelist", "def scan_trust", "def list_add"):
            start = source.index(handler)
            end = source.index("\n    def ", start + 1)
            body = source[start:end]
            if "add_list_entry" not in body:
                continue
            self.assertIn("_pin_trust", body,
                          f"{handler.split()[1]} grants trust without pinning the build")


class CliBridgeTests(unittest.TestCase):
    def test_gui_passes_every_argument_the_cli_command_reads(self):
        for command_function, passed in capture_calls():
            with self.subTest(command=command_function):
                self.assertTrue(command_function.startswith("cmd_"))
                command = command_function[len("cmd_"):].replace("_", "-")
                expected = parser_dests(command)
                passed_with_config = passed | {"config"}
                missing = expected - passed_with_config
                self.assertFalse(
                    missing,
                    f"{command_function} reads {sorted(missing)} but the GUI never sets it")

    def test_the_capture_helper_always_supplies_config(self):
        source = gui_source()
        start = source.index("    def _capture(")
        end = source.index("\n    def ", start + 1)
        self.assertIn("config=", source[start:end])

    def test_capture_calls_name_real_commands(self):
        for command_function, _passed in capture_calls():
            self.assertTrue(hasattr(cli, command_function),
                            f"the GUI calls {command_function}, which the CLI does not define")


class ThreadingTests(unittest.TestCase):
    """Tk is not thread-safe. Anything slow has to run on a worker thread and
    come back through ``after``; a blocking call on the Tk thread freezes the
    window, which reads as a crash."""

    def test_slow_actions_run_off_the_tk_thread(self):
        source = gui_source()
        for handler in ("def fullscan_start", "def extensions_scan", "def explain_file",
                        "def run_selftest", "def refresh_protection"):
            start = source.index(handler)
            end = source.index("\n    def ", start + 1)
            body = source[start:end]
            self.assertIn("threading.Thread", body,
                          f"{handler.split()[1]} blocks the Tk thread")
            self.assertIn("self.after(", body,
                          f"{handler.split()[1]} touches widgets off the Tk thread")

    def test_the_shared_worker_helper_marshals_results_back(self):
        source = gui_source()
        start = source.index("    def _run(")
        end = source.index("\n    def ", start + 1)
        body = source[start:end]
        self.assertIn("threading.Thread", body)
        self.assertIn("self.after(0, finish)", body)


if __name__ == "__main__":
    unittest.main()
