"""Response actions: terminate, quarantine, firewall-block.

Every action is refusable, reversible where it can be, and logged. Nothing
here runs unless ``response.mode`` is ``enforce`` and the matching
``auto_*`` switch is on — with one exception: actions the user explicitly
triggers from the GUI or CLI always run.
"""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import os
import shutil
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import Config
from .events import Detection
from .procmon import children_of, terminate_process
from .util import (IS_WINDOWS, ensure_dir, looks_absolute, normalize_path,
                   sha256_file, utc_stamp)
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


# Directories a restore must never write into unaided. Restoring quarantined
# malware *into* System32 is not a recovery operation under any reading.
PROTECTED_RESTORE_ROOTS = (
    "c:/windows", "c:/program files", "c:/program files (x86)",
    "c:/programdata/microsoft/windows/start menu",
)


def unsafe_restore_target(target: Path) -> str | None:
    """Why this destination must be refused, or None if it is fine."""
    raw = str(target)
    if not raw.strip():
        return "the metadata names no original path"
    if "\x00" in raw:
        return "the path contains a null byte"
    if not looks_absolute(raw):
        return "the path is not absolute"
    normalised = normalize_path(raw)
    # Split on the normalised separator, not Path.parts: off Windows,
    # Path(r"C:\Users\..\Windows") has a single part and the traversal is
    # invisible, which is how this check first passed a path it should not have.
    if ".." in normalised.split("/"):
        return "the path contains a parent-directory segment"
    for root in PROTECTED_RESTORE_ROOTS:
        if normalised == root or normalised.startswith(root.rstrip("/") + "/"):
            return (f"it is inside {root} — Candy will not put a quarantined file back "
                    f"into a system directory")
    return None


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

        # Authenticated encryption where the size allows it, XOR defang where it
        # does not. Either way the file cannot be executed by a double-click;
        # only the encrypted form is also unreadable.
        protection = "xor"
        try:
            limit = int(self.config.get("quarantine.encrypt_max_bytes", 33554432))
            if self.config.get("quarantine.encrypt", True) and target.stat().st_size <= limit:
                from .vault import Vault

                vault = Vault(self.config.data_dir() / "vault.key")
                vault.encrypt_file(target, associated=digest.encode())
                protection = f"aes-256-gcm ({vault.protection})"
            else:
                _xor_file(target, QUARANTINE_XOR_KEY)
        except Exception as exc:  # noqa: BLE001 - isolation already succeeded
            try:
                _xor_file(target, QUARANTINE_XOR_KEY)
            except OSError:
                pass
            protection = f"xor (encryption unavailable: {exc})"

        meta = {
            "quarantined_at": utc_stamp(),
            "original_path": str(source),
            "sha256": digest,
            "size": target.stat().st_size,
            "xor_key": QUARANTINE_XOR_KEY,
            "protection": protection,
            "reason": detection.message if detection else "manual quarantine",
            "signature_id": detection.signature_id if detection else None,
        }
        # The restore path writes a file to whatever "original_path" says. That
        # makes this metadata a control file, so it is authenticated: a forged
        # or edited one is refused rather than obeyed. Matters most when Candy
        # runs as SYSTEM from the boot task and its folder is not locked down.
        meta["hmac"] = self._meta_hmac(meta)
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

    def restore(self, quarantine_file: str | Path, destination: str | Path | None = None,
                *, guard: Any = None, force: bool = False) -> ActionResult:
        """Undo a quarantine. Restores to the original path unless told otherwise.

        When a ``guard`` is supplied the restored file is re-assessed and put
        straight back if it still fails. A quarantine list is a list of things
        Candy already judged dangerous; restoring one months later, after the
        threat database has learned more about it, should not be a silent
        bypass of every check. ``force`` restores anyway, which is what the
        user is choosing when they confirm a false positive.
        """
        quarantined = Path(quarantine_file)
        meta_path = quarantined.with_suffix(quarantined.suffix + ".json")
        if not quarantined.exists() or not meta_path.exists():
            return self._record(ActionResult("restore", False,
                                             f"no quarantined file and metadata at {quarantined}"))
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except (ValueError, OSError) as exc:
            return self._record(ActionResult("restore", False,
                                             f"unreadable quarantine metadata: {exc}"))

        if not self._meta_authentic(meta):
            return self._record(ActionResult(
                "restore", False,
                "the quarantine metadata for this file is not one Candy wrote, or it "
                "has been edited. Refusing to restore it — this is exactly what an "
                "attempt to make Candy write a file somewhere privileged looks like. "
                "Use --to to choose a destination yourself if you know the file is "
                "safe."))

        target = Path(destination) if destination else Path(meta.get("original_path") or "")
        problem = unsafe_restore_target(target)
        if problem:
            return self._record(ActionResult("restore", False,
                                             f"refusing to restore to {target}: {problem}"))
        try:
            ensure_dir(target.parent)
            from .vault import Vault, is_encrypted

            if is_encrypted(quarantined):
                Vault(self.config.data_dir() / "vault.key").decrypt_file(
                    quarantined, associated=str(meta.get("sha256", "")).encode())
            else:
                _xor_file(quarantined, int(meta.get("xor_key", QUARANTINE_XOR_KEY)))
            shutil.move(str(quarantined), str(target))
            meta_path.unlink(missing_ok=True)
        except (OSError, shutil.Error) as exc:
            return self._record(ActionResult("restore", False, f"restore failed: {exc}"))

        if guard is not None and not force:
            verdict = guard.assess(target)
            if verdict.action == "quarantine":
                again = self.quarantine(target, forced=True)
                return self._record(ActionResult(
                    "restore", False,
                    f"restored and immediately re-quarantined: {verdict.summary()}. "
                    f"Candy still judges this file dangerous — restore it with "
                    f"force if you are certain. ({again.detail})"))
            if verdict.reasons:
                return self._record(ActionResult(
                    "restore", True,
                    f"restored to {target}, but it still scores {verdict.score}: "
                    f"{verdict.reasons[0]}"))
        return self._record(ActionResult("restore", True, f"restored to {target}"))

    def _meta_key(self) -> bytes:
        """A key only Candy can read, used to authenticate quarantine metadata.

        Derived from the vault key when there is one so there is nothing extra
        to protect; falls back to a dedicated 0600 file. Neither is a defence
        against an attacker who is already root — it is a defence against one
        who can write into the quarantine folder but cannot read Candy's keys,
        which is the realistic case when Candy runs elevated and its data
        folder does not.
        """
        key_path = self.config.data_dir() / "meta.key"
        try:
            vault_key = self.config.data_dir() / "vault.key"
            if vault_key.is_file():
                return hashlib.sha256(b"candy-quarantine-meta|"
                                      + vault_key.read_bytes()).digest()
        except OSError:
            pass
        try:
            if key_path.is_file():
                return key_path.read_bytes()
            material = os.urandom(32)
            key_path.write_bytes(material)
            try:
                os.chmod(key_path, 0o600)
            except OSError:
                pass
            return material
        except OSError:
            # No key store available: fail closed by returning a value that
            # will never match a stored HMAC, so restores require --to.
            return b"\x00" * 32

    def _meta_hmac(self, meta: dict[str, Any]) -> str:
        payload = json.dumps({k: v for k, v in sorted(meta.items()) if k != "hmac"},
                             separators=(",", ":"), sort_keys=True).encode("utf-8")
        return hmac.new(self._meta_key(), payload, hashlib.sha256).hexdigest()

    def _meta_authentic(self, meta: dict[str, Any]) -> bool:
        recorded = str(meta.get("hmac") or "")
        if not recorded:
            return False
        return hmac.compare_digest(recorded, self._meta_hmac(meta))

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

    # --------------------------------------------------------------- domain
    def block_domain(self, domain: str, *, forced: bool = False,
                     detection: Detection | None = None) -> ActionResult:
        """Sinkhole a domain in the hosts file, and firewall its addresses.

        Two mechanisms because either alone is escapable: the hosts entry is
        ignored by a browser resolving over DNS-over-HTTPS, and the firewall
        rule misses addresses the domain has not resolved to yet.
        """
        from .netblock import HostsBlocker, hosts_path_for_platform, is_protected, normalize_domain, resolve

        if not forced and not self.allowed("block_domains"):
            return self._record(ActionResult("block_domain", False,
                                             "skipped: auto domain blocking is off"), detection)
        clean = normalize_domain(domain)
        if clean is None:
            return self._record(ActionResult("block_domain", False,
                                             f"{domain!r} is not a valid domain"), detection)
        if is_protected(clean):
            return self._record(ActionResult("block_domain", False,
                                             f"refused: {clean} is on the protected-domain list"), detection)

        blocker = HostsBlocker(hosts_path_for_platform(self.config.get("web.hosts_file") or None))
        writable, reason = blocker.available()
        if not writable:
            return self._record(ActionResult("block_domain", False, reason), detection)

        result = blocker.block(clean)
        detail = result.detail
        if result.ok and self.config.get("web.resolve_and_block_ips", True):
            addresses = resolve(clean)
            blocked_ips = [ip for ip in addresses if self.block_ip(ip, forced=True).ok]
            if blocked_ips:
                detail += f"; firewall-blocked {', '.join(blocked_ips)}"
            elif addresses:
                detail += "; could not add firewall rules (administrator rights needed)"
        if result.ok:
            self.config.add_list_entry("blacklist", "domains", clean)
        return self._record(ActionResult("block_domain", result.ok, detail), detection)

    def unblock_domain(self, domain: str) -> ActionResult:
        from .netblock import HostsBlocker, hosts_path_for_platform, normalize_domain, resolve

        clean = normalize_domain(domain)
        if clean is None:
            return self._record(ActionResult("unblock_domain", False, f"{domain!r} is not a valid domain"))
        blocker = HostsBlocker(hosts_path_for_platform(self.config.get("web.hosts_file") or None))
        result = blocker.unblock(clean)
        for ip in resolve(clean):
            self.unblock_ip(ip)
        self.config.remove_list_entry("blacklist", "domains", clean)
        return self._record(ActionResult("unblock_domain", result.ok, result.detail))

    def blocked_domains(self) -> list[str]:
        from .netblock import HostsBlocker, hosts_path_for_platform

        return HostsBlocker(
            hosts_path_for_platform(self.config.get("web.hosts_file") or None)).blocked()

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
        if detection.remote:
            target = detection.remote.rsplit(":", 1)[0]
            # A remote that is a hostname gets sinkholed; an address gets a
            # firewall rule. Which one it is decides which action applies.
            from .netblock import normalize_domain

            if normalize_domain(target) and self.allowed("block_domains"):
                results.append(self.block_domain(target, detection=detection))
            elif self.allowed("firewall"):
                results.append(self.block_ip(target, detection=detection))

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
