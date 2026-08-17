"""Response actions: terminate, quarantine, firewall-block.

Every action is refusable, reversible where it can be, and logged. Nothing
here runs unless ``response.mode`` is ``enforce`` and the matching
``auto_*`` switch is on — with one exception: actions the user explicitly
triggers from the GUI or CLI always run.
"""
from __future__ import annotations

import ipaddress
import json
import shutil
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Config
from .events import Detection
from .procmon import children_of, terminate_process
from .util import IS_WINDOWS, ensure_dir, sha256_file, utc_stamp
from .winapi import is_admin

# Quarantined files are XOR'd with this byte so they cannot be executed by a
# double-click and are not re-detected by other scanners while parked. It is
# obfuscation, not encryption, and restore reverses it exactly.
QUARANTINE_XOR_KEY = 0x5A
_XOR_CHUNK = 1024 * 1024


@dataclass
class ActionResult:
    action: str
    ok: bool
    detail: str

    def __str__(self) -> str:
        return f"{'OK' if self.ok else 'FAILED'}: {self.action} — {self.detail}"


class Responder:
    def __init__(self, config: Config, logger: Any | None = None) -> None:
        self.config = config
        self.logger = logger
        self._lock = threading.Lock()
        self.history: list[ActionResult] = []

    # ---------------------------------------------------------------- policy
    def allowed(self, action: str) -> bool:
        """Is this action permitted by the current response policy?"""
        if not self.config.enforcing:
            return False
        return bool(self.config.get(f"response.auto_{action}", False))

    def _record(self, result: ActionResult, detection: Detection | None = None) -> ActionResult:
        with self._lock:
            self.history.append(result)
            if len(self.history) > 500:
                del self.history[:100]
        if self.logger:
            self.logger.write({
                "event": "action",
                "action": result.action,
                "ok": result.ok,
                "detail": result.detail,
                "subject": detection.subject if detection else None,
            })
        return result

    # ------------------------------------------------------------------ kill
    def kill(self, pid: int, name: str | None = None, *, forced: bool = False,
             detection: Detection | None = None, kill_children: bool = True) -> ActionResult:
        """Terminate a process (and its children by default).

        Refuses critical OS processes unconditionally — a bad signature must
        not be able to take the machine down.
        """
        if self.config.is_protected_process(name):
            return self._record(ActionResult("kill", False,
                                             f"refused: {name} is on the protected-process list"), detection)
        if not forced and not self.allowed("kill"):
            return self._record(ActionResult("kill", False,
                                             "skipped: auto-kill is off (response.mode/auto_kill)"), detection)

        killed_children = 0
        if kill_children:
            for child in children_of(pid):
                ok, _ = terminate_process(child)
                killed_children += 1 if ok else 0
        ok, detail = terminate_process(pid)
        if killed_children:
            detail += f" (+{killed_children} child process(es))"
        return self._record(ActionResult("kill", ok, detail), detection)

    # ------------------------------------------------------------ quarantine
    def quarantine(self, path: str | Path, *, forced: bool = False,
                   detection: Detection | None = None) -> ActionResult:
        """Move a file into the quarantine folder, defanged and documented."""
        source = Path(path)
        if not forced and not self.allowed("quarantine"):
            return self._record(ActionResult("quarantine", False,
                                             "skipped: auto-quarantine is off"), detection)
        if not source.is_file():
            return self._record(ActionResult("quarantine", False,
                                             f"{source} is not a file (already gone?)"), detection)

        quarantine_dir = self.config.quarantine_dir()
        digest = sha256_file(source, max_bytes=None) or "unhashed"
        target = quarantine_dir / f"{digest[:32]}_{source.name}.quarantined"
        counter = 1
        while target.exists():
            target = quarantine_dir / f"{digest[:32]}_{source.name}.{counter}.quarantined"
            counter += 1

        try:
            shutil.move(str(source), str(target))
        except (OSError, shutil.Error) as exc:
            return self._record(ActionResult(
                "quarantine", False,
                f"could not move {source}: {exc}. The file is probably still running or locked."
            ), detection)

        try:
            _xor_file(target, QUARANTINE_XOR_KEY)
        except OSError as exc:
            # The file is already isolated; failing to defang it is not fatal.
            pass

        meta = {
            "quarantined_at": utc_stamp(),
            "original_path": str(source),
            "sha256": digest,
            "size": target.stat().st_size,
            "xor_key": QUARANTINE_XOR_KEY,
            "reason": detection.message if detection else "manual quarantine",
            "signature_id": detection.signature_id if detection else None,
        }
        target.with_suffix(target.suffix + ".json").write_text(
            json.dumps(meta, indent=2), encoding="utf-8")
        return self._record(ActionResult("quarantine", True,
                                         f"moved {source.name} to {target}"), detection)

    def list_quarantine(self) -> list[dict[str, Any]]:
        entries = []
        for meta_file in sorted(self.config.quarantine_dir().glob("*.quarantined.json")):
            try:
                meta = json.loads(meta_file.read_text(encoding="utf-8"))
                meta["quarantine_file"] = str(meta_file.with_suffix(""))
                meta["exists"] = Path(meta["quarantine_file"]).exists()
                entries.append(meta)
            except Exception:  # noqa: BLE001
                continue
        return entries

    def restore(self, quarantine_file: str | Path, destination: str | Path | None = None) -> ActionResult:
        """Undo a quarantine. Restores to the original path unless told otherwise."""
        quarantined = Path(quarantine_file)
        meta_path = quarantined.with_suffix(quarantined.suffix + ".json")
        if not quarantined.exists() or not meta_path.exists():
            return self._record(ActionResult("restore", False,
                                             f"no quarantined file and metadata at {quarantined}"))
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        target = Path(destination) if destination else Path(meta["original_path"])
        try:
            ensure_dir(target.parent)
            _xor_file(quarantined, int(meta.get("xor_key", QUARANTINE_XOR_KEY)))
            shutil.move(str(quarantined), str(target))
            meta_path.unlink(missing_ok=True)
        except (OSError, shutil.Error) as exc:
            return self._record(ActionResult("restore", False, f"restore failed: {exc}"))
        return self._record(ActionResult("restore", True, f"restored to {target}"))

    def delete_quarantined(self, quarantine_file: str | Path) -> ActionResult:
        quarantined = Path(quarantine_file)
        try:
            quarantined.unlink(missing_ok=True)
            quarantined.with_suffix(quarantined.suffix + ".json").unlink(missing_ok=True)
        except OSError as exc:
            return self._record(ActionResult("delete", False, str(exc)))
        return self._record(ActionResult("delete", True, f"deleted {quarantined.name} permanently"))

    # -------------------------------------------------------------- firewall
    def block_ip(self, ip: str, *, forced: bool = False,
                 detection: Detection | None = None) -> ActionResult:
        """Add outbound+inbound Windows Firewall block rules for an IP."""
        if not forced and not self.allowed("firewall"):
            return self._record(ActionResult("firewall", False,
                                             "skipped: auto-firewall is off"), detection)
        try:
            ipaddress.ip_address(ip)
        except ValueError:
            return self._record(ActionResult("firewall", False, f"{ip!r} is not a valid IP address"), detection)
        if not IS_WINDOWS:
            return self._record(ActionResult("firewall", False,
                                             "firewall rules are only supported on Windows"), detection)
        if not is_admin():
            return self._record(ActionResult("firewall", False,
                                             "administrator rights are required to add firewall rules"), detection)

        rule_name = f"Candy Block {ip}"
        results = []
        for direction in ("out", "in"):
            command = [
                "netsh", "advfirewall", "firewall", "add", "rule",
                f"name={rule_name} ({direction})", f"dir={direction}",
                "action=block", f"remoteip={ip}", "enable=yes",
            ]
            try:
                completed = subprocess.run(command, capture_output=True, text=True,
                                           timeout=15, check=False,
                                           creationflags=_no_window())
                results.append(completed.returncode == 0)
            except Exception as exc:  # noqa: BLE001
                return self._record(ActionResult("firewall", False, f"netsh failed: {exc}"), detection)

        ok = all(results)
        if ok:
            self.config.add_list_entry("blacklist", "ips", ip)
        return self._record(ActionResult(
            "firewall", ok,
            f"blocked {ip} in both directions" if ok else f"netsh rejected one or more rules for {ip}",
        ), detection)

    def unblock_ip(self, ip: str) -> ActionResult:
        if not IS_WINDOWS:
            return self._record(ActionResult("firewall", False, "Windows only"))
        rule_name = f"Candy Block {ip}"
        ok = True
        for direction in ("out", "in"):
            try:
                completed = subprocess.run(
                    ["netsh", "advfirewall", "firewall", "delete", "rule",
                     f"name={rule_name} ({direction})"],
                    capture_output=True, text=True, timeout=15, check=False,
                    creationflags=_no_window())
                ok = ok and completed.returncode == 0
            except Exception:  # noqa: BLE001
                ok = False
        self.config.remove_list_entry("blacklist", "ips", ip)
        return self._record(ActionResult("firewall", ok, f"removed block rules for {ip}"))

    # ------------------------------------------------------------ dispatcher
    def respond(self, detection: Detection, *, verdict_score: int) -> list[ActionResult]:
        """Apply the configured automatic response to a detection."""
        results: list[ActionResult] = []
        if not self.config.enforcing:
            return results
        threshold = int(self.config.get("response.action_threshold", 100))
        if verdict_score < threshold:
            return results

        if detection.pid and self.allowed("kill"):
            results.append(self.kill(detection.pid, detection.process_name, detection=detection))
        if detection.path and self.allowed("quarantine"):
            # Quarantining an image only works once the process is gone.
            results.append(self.quarantine(detection.path, detection=detection))
        if detection.remote and self.allowed("firewall"):
            ip = detection.remote.rsplit(":", 1)[0]
            results.append(self.block_ip(ip, detection=detection))

        detection.actions.extend(str(r) for r in results)
        return results


def _xor_file(path: Path, key: int) -> None:
    """XOR a file in place, chunk by chunk (reversible)."""
    with open(path, "r+b") as handle:
        while True:
            position = handle.tell()
            chunk = handle.read(_XOR_CHUNK)
            if not chunk:
                break
            handle.seek(position)
            handle.write(bytes(byte ^ key for byte in chunk))
            handle.flush()


def _no_window() -> int:
    """CREATE_NO_WINDOW so netsh does not flash a console window."""
    return 0x08000000 if IS_WINDOWS else 0
