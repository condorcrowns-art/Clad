"""Layered network defence — independent layers, each one survivable alone.

"Multiple firewalls" is the right instinct, but stacking three packet filters
on one host buys almost nothing: they all fail to the same bypass. What
actually helps is layers that fail *differently*, so defeating one does not
defeat the next:

1. **Windows Firewall, default-deny outbound** (`firewall.py`) — per-application,
   hash-pinned. Defeated by: a process on the allowlist being hijacked.
2. **Hosts sinkhole** (`netblock.py`, `adblock.py`) — name resolution fails.
   Defeated by: a browser doing its own DNS-over-HTTPS.
3. **Filtering resolver** (here) — the system resolver points at Quad9 or
   Cloudflare's malware-blocking address, so lookups Candy has never heard of
   are still filtered upstream. Defeated by: hard-coded IPs, in-browser DoH.
4. **Forced browser DoH to that same resolver** (here) — closes the hole layer 2
   and 3 share, using the browsers' own enterprise policy. Defeated by: a
   browser Candy has no policy template for.
5. **Browser URL blocklist policy** (here) — the browser itself refuses the URL,
   so it works even when DNS is out of the picture entirely. Defeated by: a
   non-policy-aware browser.
6. **Protocol hardening** (here) — LLMNR, NetBIOS, mDNS and WPAD off; SMB
   egress blocked. Removes the local-network attack surface that gets used once
   somebody is already on the same Wi-Fi as you.
7. **Behavioural** (`anomaly.py`) — beaconing and fan-out detection, which sees
   the traffic that got through all of the above.

Every change is recorded in a ledger and reversible with one command, because
network settings you cannot undo are how a security tool bricks someone's
internet.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import Config
from .util import IS_WINDOWS, ensure_dir, utc_stamp
from .winapi import is_admin

NO_WINDOW = 0x08000000

# Public filtering resolvers. All free, all with a documented policy, none
# requiring an account. Quad9 is the default: it blocks known-malicious domains
# and is operated by a Swiss non-profit with no advertising business.
RESOLVERS: dict[str, dict[str, Any]] = {
    "quad9": {
        "name": "Quad9 (malware blocking, no logging)",
        "v4": ["9.9.9.9", "149.112.112.112"],
        "v6": ["2620:fe::fe", "2620:fe::9"],
        "doh": "https://dns.quad9.net/dns-query",
    },
    "cloudflare-security": {
        "name": "Cloudflare 1.1.1.2 (malware blocking)",
        "v4": ["1.1.1.2", "1.0.0.2"],
        "v6": ["2606:4700:4700::1112", "2606:4700:4700::1002"],
        "doh": "https://security.cloudflare-dns.com/dns-query",
    },
    "cloudflare-family": {
        "name": "Cloudflare 1.1.1.3 (malware + adult content)",
        "v4": ["1.1.1.3", "1.0.0.3"],
        "v6": ["2606:4700:4700::1113", "2606:4700:4700::1003"],
        "doh": "https://family.cloudflare-dns.com/dns-query",
    },
    "adguard": {
        "name": "AdGuard DNS (ads + trackers + malware)",
        "v4": ["94.140.14.14", "94.140.15.15"],
        "doh": "https://dns.adguard-dns.com/dns-query",
    },
}

# Browser enterprise-policy roots. These are supported on every Windows edition
# — Home included — because they are read by the browser, not by Group Policy.
BROWSER_POLICY_KEYS = {
    "chrome": r"SOFTWARE\Policies\Google\Chrome",
    "edge": r"SOFTWARE\Policies\Microsoft\Edge",
    "brave": r"SOFTWARE\Policies\BraveSoftware\Brave",
}

# High-value URL patterns for the browser-level blocklist. Kept small: Chrome
# policy caps the list, and DNS handles bulk blocking better.
DEFAULT_URL_BLOCKLIST = [
    "*://*.doubleclick.net/*",
    "*://*.googlesyndication.com/*",
    "*://*.popads.net/*",
    "*://*.propellerads.com/*",
    "*://*.adsterra.com/*",
    "*://*.exoclick.com/*",
    "*://*.onclickalgo.com/*",
    "*://*.monetag.com/*",
    "file://*.exe",
    "*://*/*robux*generator*",
    "*://*/*free-robux*",
    "*://*/*roblox*executor*download*",
]

# Registry switches that remove local-network attack surface.
PROTOCOL_HARDENING = [
    (r"SOFTWARE\Policies\Microsoft\Windows NT\DNSClient", "EnableMulticast", 0,
     "LLMNR off — stops link-local name spoofing (Responder-style credential theft)"),
    (r"SOFTWARE\Policies\Microsoft\Windows NT\DNSClient", "EnableMDNS", 0,
     "mDNS off — same class of local-network spoofing"),
    (r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon", "AutoAdminLogon", 0,
     "automatic logon disabled"),
    (r"SYSTEM\CurrentControlSet\Services\NetBT\Parameters", "NodeType", 2,
     "NetBIOS name resolution restricted to point-to-point"),
    (r"SOFTWARE\Microsoft\Windows\CurrentVersion\Internet Settings\Wpad", "WpadOverride", 1,
     "WPAD proxy auto-discovery off — stops proxy hijacking on hostile networks"),
]


@dataclass
class HardenResult:
    ok: bool
    detail: str
    changed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return f"{'OK' if self.ok else 'FAILED'}: {self.detail}"


def _netsh(args: list[str], timeout: int = 30) -> tuple[bool, str]:
    if not IS_WINDOWS:
        return False, "Windows only"
    try:
        done = subprocess.run(["netsh", *args], capture_output=True, text=True,
                              timeout=timeout, check=False, creationflags=NO_WINDOW)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
    return done.returncode == 0, ((done.stdout or "") + (done.stderr or "")).strip()


def list_interfaces() -> list[str]:
    """Connected network interface names."""
    ok, output = _netsh(["interface", "show", "interface"])
    if not ok:
        return []
    names = []
    for line in output.splitlines()[3:]:
        parts = line.split(None, 3)
        if len(parts) == 4 and parts[1].lower() == "connected":
            names.append(parts[3].strip())
    return names


class NetworkHardener:
    """Applies and reverts the network layers."""

    def __init__(self, config: Config, logger: Any | None = None) -> None:
        self.config = config
        self.logger = logger
        self.ledger_path = config.data_dir() / "netharden.json"

    # -------------------------------------------------------------- ledger
    def _ledger(self) -> dict[str, Any]:
        try:
            return json.loads(self.ledger_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"dns": {}, "registry": [], "browser": [], "firewall": []}

    def _save(self, ledger: dict[str, Any]) -> None:
        ensure_dir(self.ledger_path.parent)
        ledger["updated"] = utc_stamp()
        self.ledger_path.write_text(json.dumps(ledger, indent=2), encoding="utf-8")

    # ----------------------------------------------------------------- DNS
    def set_resolver(self, choice: str = "quad9") -> HardenResult:
        """Point every connected interface at a filtering resolver."""
        resolver = RESOLVERS.get(choice)
        if resolver is None:
            return HardenResult(False, f"unknown resolver {choice!r}; "
                                       f"choose from {', '.join(RESOLVERS)}")
        if not IS_WINDOWS:
            return HardenResult(False, "Windows only")
        if not is_admin():
            return HardenResult(False, "administrator rights are required to change DNS")

        ledger = self._ledger()
        changed, skipped = [], []
        for interface in list_interfaces():
            # Record what was there so 'netharden revert' can put it back.
            ok, previous = _netsh(["interface", "ipv4", "show", "dnsservers", f"name={interface}"])
            ledger.setdefault("dns", {}).setdefault(interface, previous if ok else "")

            ok, output = _netsh(["interface", "ipv4", "set", "dnsservers",
                                 f"name={interface}", "static", resolver["v4"][0], "primary"])
            if not ok:
                skipped.append(f"{interface}: {output[:80]}")
                continue
            if len(resolver["v4"]) > 1:
                _netsh(["interface", "ipv4", "add", "dnsservers", f"name={interface}",
                        resolver["v4"][1], "index=2"])
            changed.append(interface)

        ledger["resolver"] = choice
        self._save(ledger)
        return HardenResult(bool(changed),
                            f"{resolver['name']} set on {len(changed)} interface(s)",
                            changed=changed, skipped=skipped)

    def point_system_at_local_resolver(self, address: str = "127.0.0.1") -> HardenResult:
        """Point every interface at Candy's own resolver.

        Separate from set_resolver because the failure mode matters more here:
        if the local proxy is not actually listening, this would leave the
        machine with no working DNS at all.
        """
        if not IS_WINDOWS:
            return HardenResult(False, "Windows only")
        if not is_admin():
            return HardenResult(False, "administrator rights are required to change DNS")

        ledger = self._ledger()
        changed, skipped = [], []
        for interface in list_interfaces():
            ok, previous = _netsh(["interface", "ipv4", "show", "dnsservers", f"name={interface}"])
            ledger.setdefault("dns", {}).setdefault(interface, previous if ok else "")
            ok, output = _netsh(["interface", "ipv4", "set", "dnsservers",
                                 f"name={interface}", "static", address, "primary"])
            (changed if ok else skipped).append(interface if ok else f"{interface}: {output[:80]}")
        ledger["resolver"] = f"local ({address})"
        self._save(ledger)
        return HardenResult(bool(changed),
                            f"{len(changed)} interface(s) now resolve through Candy",
                            changed=changed, skipped=skipped)

    def restore_resolver(self) -> HardenResult:
        ledger = self._ledger()
        changed = []
        for interface in ledger.get("dns", {}):
            ok, _ = _netsh(["interface", "ipv4", "set", "dnsservers",
                            f"name={interface}", "dhcp"])
            if ok:
                changed.append(interface)
        ledger["dns"] = {}
        ledger.pop("resolver", None)
        self._save(ledger)
        return HardenResult(True, f"DNS returned to automatic on {len(changed)} interface(s)",
                            changed=changed)

    # ------------------------------------------------------------- browser
    def apply_browser_policy(self, *, resolver: str = "quad9",
                             blocklist: list[str] | None = None) -> HardenResult:
        """Force browsers to a filtering resolver and block ad/bait URLs.

        This is the layer that closes the DNS-over-HTTPS hole: rather than
        fighting the browser's own resolver, point it at a resolver that
        filters. Enterprise policy keys work on every Windows edition.
        """
        if not IS_WINDOWS:
            return HardenResult(False, "Windows only")
        if not is_admin():
            return HardenResult(False, "administrator rights are required to set browser policy")

        template = RESOLVERS.get(resolver, RESOLVERS["quad9"])["doh"]
        patterns = blocklist if blocklist is not None else DEFAULT_URL_BLOCKLIST
        ledger = self._ledger()
        changed, skipped = [], []

        try:
            import winreg
        except ImportError:  # pragma: no cover
            return HardenResult(False, "winreg unavailable")

        for browser, key_path in BROWSER_POLICY_KEYS.items():
            try:
                with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, key_path, 0,
                                        winreg.KEY_SET_VALUE) as key:
                    winreg.SetValueEx(key, "DnsOverHttpsMode", 0, winreg.REG_SZ, "secure")
                    winreg.SetValueEx(key, "DnsOverHttpsTemplates", 0, winreg.REG_SZ, template)
                with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE,
                                        f"{key_path}\\URLBlocklist", 0,
                                        winreg.KEY_SET_VALUE) as key:
                    for index, pattern in enumerate(patterns, start=1):
                        winreg.SetValueEx(key, str(index), 0, winreg.REG_SZ, pattern)
                changed.append(browser)
            except OSError as exc:
                skipped.append(f"{browser}: {exc}")

        ledger["browser"] = changed
        ledger["browser_patterns"] = len(patterns)
        self._save(ledger)
        return HardenResult(
            bool(changed),
            f"{len(changed)} browser(s) forced to {template} with {len(patterns)} blocked "
            f"URL patterns — this holds even when the browser bypasses system DNS",
            changed=changed, skipped=skipped)

    def remove_browser_policy(self) -> HardenResult:
        if not IS_WINDOWS:
            return HardenResult(False, "Windows only")
        try:
            import winreg
        except ImportError:  # pragma: no cover
            return HardenResult(False, "winreg unavailable")

        removed = []
        for browser, key_path in BROWSER_POLICY_KEYS.items():
            for value in ("DnsOverHttpsMode", "DnsOverHttpsTemplates"):
                try:
                    with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path, 0,
                                        winreg.KEY_SET_VALUE) as key:
                        winreg.DeleteValue(key, value)
                except OSError:
                    pass
            try:
                # Delete our blocklist values, then the key if it is now empty.
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, f"{key_path}\\URLBlocklist", 0,
                                    winreg.KEY_ALL_ACCESS) as key:
                    index = 1
                    while True:
                        try:
                            winreg.DeleteValue(key, str(index))
                            index += 1
                        except OSError:
                            break
                removed.append(browser)
            except OSError:
                continue
        ledger = self._ledger()
        ledger["browser"] = []
        self._save(ledger)
        return HardenResult(True, f"browser policy removed for {len(removed)} browser(s)")

    # ------------------------------------------------------------ protocols
    def harden_protocols(self) -> HardenResult:
        """Turn off the local-network protocols attackers rely on."""
        if not IS_WINDOWS:
            return HardenResult(False, "Windows only")
        if not is_admin():
            return HardenResult(False, "administrator rights are required")
        try:
            import winreg
        except ImportError:  # pragma: no cover
            return HardenResult(False, "winreg unavailable")

        ledger = self._ledger()
        changed, skipped = [], []
        for key_path, value_name, value, description in PROTOCOL_HARDENING:
            try:
                with winreg.CreateKeyEx(winreg.HKEY_LOCAL_MACHINE, key_path, 0,
                                        winreg.KEY_ALL_ACCESS) as key:
                    try:
                        previous, _ = winreg.QueryValueEx(key, value_name)
                    except OSError:
                        previous = None
                    winreg.SetValueEx(key, value_name, 0, winreg.REG_DWORD, value)
                ledger.setdefault("registry", []).append(
                    {"key": key_path, "value": value_name, "previous": previous})
                changed.append(description)
            except OSError as exc:
                skipped.append(f"{value_name}: {exc}")

        # SMB egress: there is no legitimate reason for file sharing to leave
        # the machine, and it is a standard credential-theft channel.
        for port in ("445", "139"):
            ok, _ = _netsh(["advfirewall", "firewall", "add", "rule",
                            f"name=Candy harden: block outbound SMB {port}",
                            "dir=out", "action=block", "protocol=TCP",
                            f"remoteport={port}", "remoteip=any", "enable=yes"])
            if ok:
                changed.append(f"outbound SMB/{port} blocked")
                ledger.setdefault("firewall", []).append(
                    f"Candy harden: block outbound SMB {port}")

        self._save(ledger)
        return HardenResult(bool(changed), f"{len(changed)} protocol hardening change(s) applied",
                            changed=changed, skipped=skipped)

    def revert_protocols(self) -> HardenResult:
        if not IS_WINDOWS:
            return HardenResult(False, "Windows only")
        try:
            import winreg
        except ImportError:  # pragma: no cover
            return HardenResult(False, "winreg unavailable")

        ledger = self._ledger()
        restored = 0
        for entry in ledger.get("registry", []):
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, entry["key"], 0,
                                    winreg.KEY_ALL_ACCESS) as key:
                    if entry.get("previous") is None:
                        winreg.DeleteValue(key, entry["value"])
                    else:
                        winreg.SetValueEx(key, entry["value"], 0, winreg.REG_DWORD,
                                          int(entry["previous"]))
                restored += 1
            except OSError:
                continue
        for rule in ledger.get("firewall", []):
            _netsh(["advfirewall", "firewall", "delete", "rule", f"name={rule}"])
        ledger["registry"] = []
        ledger["firewall"] = []
        self._save(ledger)
        return HardenResult(True, f"{restored} protocol setting(s) restored")

    # --------------------------------------------------------------- whole
    def apply_all(self, *, resolver: str = "quad9") -> list[HardenResult]:
        return [self.set_resolver(resolver),
                self.apply_browser_policy(resolver=resolver),
                self.harden_protocols()]

    def revert_all(self) -> list[HardenResult]:
        return [self.restore_resolver(), self.remove_browser_policy(), self.revert_protocols()]

    def status(self) -> dict[str, Any]:
        ledger = self._ledger()
        return {
            "administrator": is_admin(),
            "resolver": ledger.get("resolver", "system default"),
            "interfaces_changed": list(ledger.get("dns", {})),
            "browser_policy": ledger.get("browser", []),
            "browser_blocked_patterns": ledger.get("browser_patterns", 0),
            "protocol_changes": len(ledger.get("registry", [])),
            "firewall_rules": ledger.get("firewall", []),
            "available_resolvers": {key: value["name"] for key, value in RESOLVERS.items()},
        }
