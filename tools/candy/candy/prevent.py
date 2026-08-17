"""Execution prevention and network containment.

The gap this fills: real prevention needs a kernel driver, which needs a paid
certificate. Two mechanisms get part of the way there using only what Windows
already exposes to an administrator:

* **Execution blocking** via Image File Execution Options. Windows launches
  ``<Debugger> <original command line>`` whenever a program with that image
  *name* starts. Pointing the debugger at a stub that exits means the program
  never runs — genuine pre-execution blocking, enforced by the loader, not by
  Candy. It is name-based rather than hash-based, which is both its strength
  (a copy renamed back still gets blocked) and its weakness (a rename escapes).
* **Network containment** — a per-program firewall block rule. When a process
  cannot be terminated (elevated, protected, or Candy is unelevated), severing
  its network still stops the exfiltration, which is the part that actually
  costs the user their account.

IFEO is also a technique malware uses, which is why Candy *detects* it in
``persistence.py``. Entries Candy creates are tagged, listed, and removable in
one command, and a protected-name list prevents anyone from bricking the OS
with it.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Config
from .util import IS_WINDOWS, basename, ensure_dir, utc_stamp
from .winapi import is_admin

IFEO_KEY = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"

# The stub Windows runs instead of the blocked program. systray.exe is a
# Microsoft-signed no-op that exits immediately — it has been the standard
# choice for this for two decades.
DEFAULT_STUB = r"%SystemRoot%\System32\systray.exe"

# Image names that must never be blocked. Blocking any of these makes the
# machine unusable or unrecoverable without a rescue disk.
PROTECTED_IMAGE_NAMES = {
    "explorer.exe", "svchost.exe", "services.exe", "lsass.exe", "csrss.exe",
    "wininit.exe", "winlogon.exe", "smss.exe", "cmd.exe", "powershell.exe",
    "regedit.exe", "taskmgr.exe", "msmpeng.exe", "mpcmdrun.exe", "dwm.exe",
    "rundll32.exe", "conhost.exe", "sihost.exe", "userinit.exe", "candy.exe",
    "python.exe", "pythonw.exe", "msiexec.exe", "wuauclt.exe", "systray.exe",
}

NO_WINDOW = 0x08000000


@dataclass
class PreventResult:
    ok: bool
    detail: str

    def __str__(self) -> str:
        return f"{'OK' if self.ok else 'FAILED'}: {self.detail}"


def is_protected_image(name: str) -> bool:
    return basename(name).lower() in PROTECTED_IMAGE_NAMES


def valid_image_name(name: str) -> str | None:
    """An image *name* — never a path, never anything with separators."""
    candidate = (name or "").strip().strip('"')
    if not candidate or len(candidate) > 120:
        return None
    if any(ch in candidate for ch in '\\/:*?"<>|\r\n\t'):
        return None
    if not candidate.lower().endswith((".exe", ".scr", ".com")):
        return None
    return candidate


class ExecutionBlocker:
    """Blocks programs from starting, by image name, using IFEO."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.ledger_path = config.data_dir() / "execution-blocks.json"
        self.stub = str(config.get("prevent.stub_program", DEFAULT_STUB))

    # -------------------------------------------------------------- ledger
    def _ledger(self) -> dict[str, dict[str, Any]]:
        try:
            return json.loads(self.ledger_path.read_text(encoding="utf-8")).get("blocked", {})
        except (OSError, json.JSONDecodeError):
            return {}

    def _save_ledger(self, blocked: dict[str, dict[str, Any]]) -> None:
        ensure_dir(self.ledger_path.parent)
        self.ledger_path.write_text(
            json.dumps({"updated": utc_stamp(), "blocked": blocked}, indent=2), encoding="utf-8")

    def blocked_images(self) -> list[str]:
        return sorted(self._ledger())

    # --------------------------------------------------------------- block
    def block(self, image_name: str, *, reason: str = "") -> PreventResult:
        name = valid_image_name(image_name)
        if name is None:
            return PreventResult(False, f"{image_name!r} is not a plain image name like 'krnl.exe'")
        if is_protected_image(name):
            return PreventResult(False, f"refused: {name} is on the protected-image list")
        if not IS_WINDOWS:
            return PreventResult(False, "execution blocking is Windows-only")
        if not is_admin():
            return PreventResult(False, "administrator rights are required to block execution")

        try:
            import winreg

            with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, f"{IFEO_KEY}\\{name}", 0,
                                    winreg.KEY_SET_VALUE) as key:
                winreg.SetValueEx(key, "Debugger", 0, winreg.REG_SZ, self.stub)
        except OSError as exc:
            return PreventResult(False, f"could not write the IFEO key for {name}: {exc}")

        ledger = self._ledger()
        ledger[name.lower()] = {"image": name, "reason": reason, "blocked_at": utc_stamp(),
                                "stub": self.stub}
        self._save_ledger(ledger)
        return PreventResult(True, f"{name} is now blocked from running on this machine")

    def unblock(self, image_name: str) -> PreventResult:
        name = valid_image_name(image_name)
        if name is None:
            return PreventResult(False, f"{image_name!r} is not a valid image name")
        ledger = self._ledger()
        if name.lower() not in ledger:
            return PreventResult(False, f"{name} was not blocked by Candy")
        if IS_WINDOWS:
            try:
                import winreg

                # Delete only the Debugger value we added; the key itself may
                # hold unrelated settings such as mitigation options.
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, f"{IFEO_KEY}\\{name}", 0,
                                    winreg.KEY_SET_VALUE) as key:
                    winreg.DeleteValue(key, "Debugger")
            except FileNotFoundError:
                pass
            except OSError as exc:
                return PreventResult(False, f"could not remove the IFEO entry: {exc}")
        ledger.pop(name.lower(), None)
        self._save_ledger(ledger)
        return PreventResult(True, f"{name} may run again")

    def unblock_all(self) -> PreventResult:
        failures = [name for name in self.blocked_images() if not self.unblock(name).ok]
        if failures:
            return PreventResult(False, f"could not unblock: {', '.join(failures)}")
        return PreventResult(True, "all Candy execution blocks removed")


class NetworkContainer:
    """Cuts one program off the network without touching the process."""

    def __init__(self, config: Config) -> None:
        self.config = config
        self.ledger_path = config.data_dir() / "contained.json"

    def _ledger(self) -> dict[str, dict[str, Any]]:
        try:
            return json.loads(self.ledger_path.read_text(encoding="utf-8")).get("contained", {})
        except (OSError, json.JSONDecodeError):
            return {}

    def _save(self, contained: dict[str, dict[str, Any]]) -> None:
        ensure_dir(self.ledger_path.parent)
        self.ledger_path.write_text(
            json.dumps({"updated": utc_stamp(), "contained": contained}, indent=2),
            encoding="utf-8")

    def contained(self) -> list[str]:
        return sorted(self._ledger())

    def _netsh(self, args: list[str]) -> tuple[bool, str]:
        if not IS_WINDOWS:
            return False, "Windows only"
        try:
            done = subprocess.run(["netsh", *args], capture_output=True, text=True,
                                  timeout=30, check=False, creationflags=NO_WINDOW)
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)
        return done.returncode == 0, ((done.stdout or "") + (done.stderr or "")).strip()

    def contain(self, program: str, *, reason: str = "") -> PreventResult:
        """Block a program's traffic in both directions, immediately."""
        path = Path(program)
        if not path.is_file():
            return PreventResult(False, f"{program} is not a file")
        if not is_admin():
            return PreventResult(False, "administrator rights are required to add firewall rules")

        rule = f"Candy contain: {path.name}"
        results = []
        for direction in ("out", "in"):
            ok, output = self._netsh([
                "advfirewall", "firewall", "add", "rule", f"name={rule} ({direction})",
                f"dir={direction}", "action=block", f"program={path}", "enable=yes",
                "profile=any",
            ])
            results.append(ok)
            if not ok:
                return PreventResult(False, f"netsh refused the {direction}bound rule: {output}")

        ledger = self._ledger()
        ledger[str(path).lower()] = {"program": str(path), "rule": rule,
                                     "reason": reason, "contained_at": utc_stamp()}
        self._save(ledger)
        return PreventResult(all(results),
                             f"{path.name} is cut off from the network in both directions")

    def release(self, program: str) -> PreventResult:
        ledger = self._ledger()
        entry = ledger.pop(str(Path(program)).lower(), None)
        if entry is None:
            return PreventResult(False, f"{program} was not contained by Candy")
        rule = entry.get("rule", f"Candy contain: {Path(program).name}")
        ok = True
        for direction in ("out", "in"):
            done, _ = self._netsh(["advfirewall", "firewall", "delete", "rule",
                                   f"name={rule} ({direction})"])
            ok = ok and done
        self._save(ledger)
        return PreventResult(ok, f"network access restored for {program}")
