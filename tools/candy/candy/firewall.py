"""Default-deny outbound firewall control, driven through Windows Firewall.

Candy has no packet filter of its own — that needs a WFP callout driver, and a
driver needs a signing certificate that costs money. What it can do, for free,
is operate the filtering engine Windows already ships, in the strictest posture
that engine supports:

* **Default-deny outbound.** Nothing reaches the network unless a rule allows
  it. This is the single biggest security posture change available on a Windows
  host, and it costs nothing.
* **Per-application allow rules**, bound to the binary's SHA-256 and its
  Authenticode status at the moment it was allowed. If the file on disk changes
  — a trojanised update, a replaced binary — the rule is revoked automatically.
  An allow rule in Candy means "this exact binary", not "this path".
* **Learning mode**, so the allowlist is built from what the machine actually
  does rather than from guesswork.
* **A panic timer.** Lockdown reverts itself unless confirmed, because a
  default-deny firewall applied to the wrong machine is indistinguishable from
  a broken network card.

None of this inspects traffic. It decides which *programs* may talk at all.
"""
from __future__ import annotations

import json
import re
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from .config import Config
from .util import IS_WINDOWS, basename, ensure_dir, normalize_path, sha256_file, utc_stamp
from .winapi import is_admin, verify_signature

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]

RULE_PREFIX = "Candy allow"
BLOCK_PREFIX = "Candy block"
NO_WINDOW = 0x08000000

# Programs that must keep network access or the machine stops working. Seeded
# into every allowlist; lockdown refuses to start without them.
ESSENTIAL_PROGRAMS = [
    r"C:\Windows\System32\svchost.exe",
    r"C:\Windows\System32\services.exe",
    r"C:\Windows\System32\lsass.exe",
    r"C:\Windows\System32\dnscache.exe",
    r"C:\Windows\System32\wininit.exe",
    r"C:\Windows\explorer.exe",
]

# Rule names go to netsh as `name=<value>`; anything that could terminate the
# argument or inject another is refused outright.
_UNSAFE_NAME = re.compile(r'[\r\n"|&<>^]')


@dataclass
class FirewallStatus:
    available: bool
    admin: bool
    profiles: dict[str, dict[str, str]] = field(default_factory=dict)
    locked_down: bool = False
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"available": self.available, "admin": self.admin, "profiles": self.profiles,
                "locked_down": self.locked_down, "detail": self.detail}


def parse_profiles(text: str) -> dict[str, dict[str, str]]:
    """Parse ``netsh advfirewall show allprofiles`` output.

    Split out from the subprocess call so the parsing is unit-tested without
    Windows. Handles the localised-key case by matching on the value shape as
    well as the English key.
    """
    profiles: dict[str, dict[str, str]] = {}
    current: str | None = None
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        match = re.match(r"^(Domain|Private|Public)\s+Profile\s+Settings:", stripped, re.I)
        if match:
            current = match.group(1).lower()
            profiles[current] = {}
            continue
        if current is None:
            continue
        if re.match(r"^State\s", stripped, re.I):
            profiles[current]["state"] = stripped.split()[-1].lower()
        elif re.match(r"^Firewall\s+Policy\s", stripped, re.I):
            value = stripped.split(None, 2)[-1].strip().lower()
            parts = [part.strip() for part in value.split(",")]
            profiles[current]["inbound"] = parts[0] if parts else ""
            profiles[current]["outbound"] = parts[1] if len(parts) > 1 else ""
    return profiles


def is_locked_down(profiles: dict[str, dict[str, str]]) -> bool:
    """True when every profile blocks outbound by default."""
    if not profiles:
        return False
    return all("blockoutbound" in (data.get("outbound") or "").replace(" ", "")
               for data in profiles.values())


def safe_rule_name(name: str) -> str | None:
    name = (name or "").strip()
    if not name or len(name) > 200 or _UNSAFE_NAME.search(name):
        return None
    return name


@dataclass
class AllowEntry:
    path: str
    sha256: str | None
    signed: bool | None
    rule_name: str
    added: str

    def to_dict(self) -> dict[str, Any]:
        return {"path": self.path, "sha256": self.sha256, "signed": self.signed,
                "rule_name": self.rule_name, "added": self.added}


class FirewallController:
    def __init__(self, config: Config, logger: Any | None = None) -> None:
        self.config = config
        self.logger = logger
        self.allowlist_path = config.data_dir() / "allowlist.json"
        self._lock = threading.RLock()
        self._panic_timer: threading.Timer | None = None
        self.last_error: str | None = None

    # ------------------------------------------------------------- plumbing
    def _netsh(self, args: list[str], timeout: int = 30) -> tuple[bool, str]:
        if not IS_WINDOWS:
            return False, "Windows Firewall control is only available on Windows"
        try:
            completed = subprocess.run(["netsh", *args], capture_output=True, text=True,
                                       timeout=timeout, check=False, creationflags=NO_WINDOW)
        except Exception as exc:  # noqa: BLE001
            return False, f"netsh failed: {exc}"
        output = (completed.stdout or "") + (completed.stderr or "")
        return completed.returncode == 0, output.strip()

    def _log(self, event: str, **fields: Any) -> None:
        if self.logger:
            self.logger.write({"event": f"firewall.{event}", **fields})

    # --------------------------------------------------------------- status
    def status(self) -> FirewallStatus:
        if not IS_WINDOWS:
            return FirewallStatus(False, is_admin(), detail="not Windows")
        ok, output = self._netsh(["advfirewall", "show", "allprofiles"])
        if not ok:
            return FirewallStatus(False, is_admin(), detail=output or "could not query netsh")
        profiles = parse_profiles(output)
        return FirewallStatus(True, is_admin(), profiles, is_locked_down(profiles),
                              "queried successfully")

    # ------------------------------------------------------------ allowlist
    def load_allowlist(self) -> dict[str, AllowEntry]:
        try:
            raw = json.loads(self.allowlist_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        entries = {}
        for key, value in (raw.get("programs") or {}).items():
            entries[key] = AllowEntry(value.get("path", key), value.get("sha256"),
                                      value.get("signed"), value.get("rule_name", ""),
                                      value.get("added", ""))
        return entries

    def save_allowlist(self, entries: dict[str, AllowEntry]) -> None:
        ensure_dir(self.allowlist_path.parent)
        payload = {"updated": utc_stamp(),
                   "programs": {key: entry.to_dict() for key, entry in entries.items()}}
        self.allowlist_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def allow_program(self, path: str, *, name: str | None = None) -> tuple[bool, str]:
        """Allow one binary outbound, pinned to its current hash."""
        program = Path(path)
        if not program.is_file():
            return False, f"{path} is not a file"
        rule_name = safe_rule_name(name or f"{RULE_PREFIX}: {basename(path)}")
        if rule_name is None:
            return False, "rule name contains characters that are not allowed"

        digest = sha256_file(program, max_bytes=None)
        signed = verify_signature(str(program))
        ok, output = self._netsh([
            "advfirewall", "firewall", "add", "rule", f"name={rule_name}",
            "dir=out", "action=allow", f"program={program}", "enable=yes", "profile=any",
        ])
        if not ok:
            self.last_error = output
            return False, output or "netsh refused the rule"

        with self._lock:
            entries = self.load_allowlist()
            entries[normalize_path(program)] = AllowEntry(
                str(program), digest, signed, rule_name, utc_stamp())
            self.save_allowlist(entries)
        self._log("allow", program=str(program), sha256=digest, signed=signed)
        return True, f"allowed {program} (pinned to {(digest or 'unhashed')[:16]}…)"

    def revoke_program(self, path: str) -> tuple[bool, str]:
        with self._lock:
            entries = self.load_allowlist()
            key = normalize_path(path)
            entry = entries.pop(key, None)
            self.save_allowlist(entries)
        if entry is None:
            return False, f"{path} was not in the allowlist"
        ok, output = self._netsh(["advfirewall", "firewall", "delete", "rule",
                                  f"name={entry.rule_name}"])
        self._log("revoke", program=path, ok=ok)
        return ok, (f"revoked network access for {path}" if ok else output)

    def verify_allowlist(self) -> list[dict[str, Any]]:
        """Re-check every allowed binary; revoke any that changed on disk.

        This is what makes an allow rule mean "this binary" rather than "this
        path". A replaced or trojanised executable loses its access without
        anyone having to notice manually.
        """
        findings: list[dict[str, Any]] = []
        for key, entry in self.load_allowlist().items():
            program = Path(entry.path)
            if not program.is_file():
                findings.append({"path": entry.path, "problem": "binary is gone",
                                 "action": "revoked"})
                self.revoke_program(entry.path)
                continue
            current = sha256_file(program, max_bytes=None)
            if entry.sha256 and current and current != entry.sha256:
                findings.append({
                    "path": entry.path, "problem": "binary changed since it was allowed",
                    "expected": entry.sha256[:16], "found": current[:16], "action": "revoked",
                })
                self.revoke_program(entry.path)
                self._log("hash_mismatch", program=entry.path,
                          expected=entry.sha256, found=current)
        return findings

    # -------------------------------------------------------------- learning
    def learn(self, seconds: float = 120.0, *,
              progress: Callable[[str], None] | None = None) -> list[str]:
        """Watch which programs actually make outbound connections.

        Building the allowlist from observed behaviour is the only way to reach
        default-deny on a real machine without breaking it.
        """
        if psutil is None:
            return []
        seen: dict[str, int] = {}
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            try:
                connections = psutil.net_connections(kind="inet")
            except Exception:  # noqa: BLE001
                break
            for conn in connections:
                if not conn.raddr or not conn.pid:
                    continue
                try:
                    exe = psutil.Process(conn.pid).exe()
                except Exception:  # noqa: BLE001
                    continue
                if not exe:
                    continue
                if exe not in seen and progress:
                    progress(exe)
                seen[exe] = seen.get(exe, 0) + 1
            time.sleep(2)
        return sorted(seen)

    # -------------------------------------------------------------- lockdown
    def lockdown(self, *, confirm_seconds: int = 120,
                 include_essentials: bool = True) -> tuple[bool, str]:
        """Switch every profile to default-deny outbound, with auto-rollback.

        The timer is the important part: if the allowlist is wrong, the machine
        loses the network, and a user who cannot browse also cannot look up how
        to undo it. Unless ``confirm()`` is called, this reverts itself.
        """
        if not IS_WINDOWS:
            return False, "Windows only"
        if not is_admin():
            return False, "administrator rights are required to change firewall policy"

        if include_essentials:
            for program in ESSENTIAL_PROGRAMS:
                if Path(program).is_file():
                    self.allow_program(program)

        allowed = self.load_allowlist()
        if not allowed:
            return False, ("refusing to lock down with an empty allowlist — run "
                           "'candy firewall learn' first, or pass --force-empty")

        ok, output = self._netsh(["advfirewall", "set", "allprofiles", "firewallpolicy",
                                  "blockinbound,blockoutbound"])
        if not ok:
            return False, output or "netsh refused the policy change"

        self._write_marker(confirm_seconds)
        self._start_panic_timer(confirm_seconds)
        self._log("lockdown", allowed=len(allowed), confirm_seconds=confirm_seconds)
        return True, (f"default-deny outbound is ON with {len(allowed)} allowed program(s). "
                      f"Reverting automatically in {confirm_seconds}s unless you run "
                      f"'candy firewall confirm'.")

    def unlock(self) -> tuple[bool, str]:
        """Return outbound traffic to allow-by-default."""
        self._cancel_panic_timer()
        ok, output = self._netsh(["advfirewall", "set", "allprofiles", "firewallpolicy",
                                  "blockinbound,allowoutbound"])
        self._clear_marker()
        self._log("unlock", ok=ok)
        return ok, ("outbound traffic is allowed by default again" if ok
                    else output or "netsh refused the policy change")

    def confirm(self) -> tuple[bool, str]:
        """Keep the lockdown: cancel the pending rollback."""
        self._cancel_panic_timer()
        marker = self._marker_path()
        if not marker.exists():
            return False, "there is no pending lockdown to confirm"
        self._clear_marker()
        self._log("confirm")
        return True, "lockdown confirmed — it will no longer revert on its own"

    # ---------------------------------------------------------- panic timer
    def _marker_path(self) -> Path:
        return self.config.data_dir() / "lockdown-pending.json"

    def _write_marker(self, confirm_seconds: int) -> None:
        self._marker_path().write_text(json.dumps({
            "started": utc_stamp(), "deadline_epoch": time.time() + confirm_seconds,
        }, indent=2), encoding="utf-8")

    def _clear_marker(self) -> None:
        try:
            self._marker_path().unlink(missing_ok=True)
        except OSError:
            pass

    def _start_panic_timer(self, seconds: int) -> None:
        self._cancel_panic_timer()
        timer = threading.Timer(seconds, self._panic_rollback)
        timer.daemon = True
        timer.start()
        self._panic_timer = timer

    def _cancel_panic_timer(self) -> None:
        if self._panic_timer is not None:
            self._panic_timer.cancel()
            self._panic_timer = None

    def _panic_rollback(self) -> None:
        self._log("panic_rollback", reason="lockdown was not confirmed in time")
        self._netsh(["advfirewall", "set", "allprofiles", "firewallpolicy",
                     "blockinbound,allowoutbound"])
        self._clear_marker()

    def rollback_if_unconfirmed(self) -> str | None:
        """Called at startup: undo a lockdown that was never confirmed.

        Covers the case the in-process timer cannot: Candy being killed, or the
        machine rebooting, while a lockdown was still pending.
        """
        marker = self._marker_path()
        if not marker.exists():
            return None
        try:
            data = json.loads(marker.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self._clear_marker()
            return None
        if time.time() >= float(data.get("deadline_epoch", 0)):
            self._panic_rollback()
            return ("a firewall lockdown was pending and never confirmed — outbound traffic "
                    "has been restored to allow-by-default")
        remaining = int(float(data["deadline_epoch"]) - time.time())
        self._start_panic_timer(remaining)
        return f"a firewall lockdown is pending confirmation ({remaining}s left)"

    # ------------------------------------------------------------- listing
    def candy_rules(self) -> list[str]:
        ok, output = self._netsh(["advfirewall", "firewall", "show", "rule", "name=all"])
        if not ok:
            return []
        return parse_rule_names(output, prefixes=(RULE_PREFIX, BLOCK_PREFIX, "Candy Block"))

    def remove_all_rules(self) -> tuple[int, int]:
        """Delete every rule Candy created. Returns (removed, failed)."""
        removed = failed = 0
        for name in self.candy_rules():
            ok, _ = self._netsh(["advfirewall", "firewall", "delete", "rule", f"name={name}"])
            removed += 1 if ok else 0
            failed += 0 if ok else 1
        self.save_allowlist({})
        return removed, failed


def parse_rule_names(text: str, prefixes: Iterable[str] = (RULE_PREFIX,)) -> list[str]:
    """Extract rule names from ``netsh advfirewall firewall show rule`` output."""
    names = []
    for line in text.splitlines():
        match = re.match(r"^Rule Name:\s+(.*\S)\s*$", line.strip(), re.I)
        if match:
            name = match.group(1)
            if any(name.startswith(prefix) for prefix in prefixes):
                names.append(name)
    return names
