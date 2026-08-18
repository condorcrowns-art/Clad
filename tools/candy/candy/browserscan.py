"""Browser extension auditing.

This closes a blind spot the coverage matrix named: a malicious browser
extension is persistence, injection and credential theft in one, and none of
Candy's other passes could see it. It is also the single most direct route to
the thing this tool exists to protect — an extension with `cookies` permission
and a `roblox.com` host match can read the `.ROBLOSECURITY` session cookie and
hand somebody the account without ever touching a password.

Extensions are just files on disk. Every Chromium browser stores each one as a
directory containing `manifest.json`; Firefox stores an `extensions.json` index
and one XPI per add-on. Reading those tells you what an extension is *allowed*
to do, which is the part that matters — an extension cannot exceed its declared
permissions, so the manifest is a complete statement of its capability.

Two signals do most of the work:

* **Permission combinations.** `cookies` alone is ordinary. `cookies` plus
  broad host access plus no store listing is a credential harvester.
* **No update URL.** Extensions installed from a web store carry an
  `update_url`. One without it was sideloaded — dragged in, dropped by an
  installer, or loaded unpacked in developer mode.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .util import expand_path, utc_stamp

# Where each Chromium-family browser keeps its profiles.
CHROMIUM_ROOTS: dict[str, str] = {
    "Chrome": r"%LOCALAPPDATA%\Google\Chrome\User Data",
    "Chrome Beta": r"%LOCALAPPDATA%\Google\Chrome Beta\User Data",
    "Edge": r"%LOCALAPPDATA%\Microsoft\Edge\User Data",
    "Brave": r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data",
    "Opera": r"%APPDATA%\Opera Software\Opera Stable",
    "Opera GX": r"%APPDATA%\Opera Software\Opera GX Stable",
    "Vivaldi": r"%LOCALAPPDATA%\Vivaldi\User Data",
    "Chromium": r"%LOCALAPPDATA%\Chromium\User Data",
}

FIREFOX_ROOTS: dict[str, str] = {
    "Firefox": r"%APPDATA%\Mozilla\Firefox\Profiles",
    "Waterfox": r"%APPDATA%\Waterfox\Profiles",
    "LibreWolf": r"%APPDATA%\librewolf\Profiles",
}

# Permissions that grant real power, with what they actually allow.
RISKY_PERMISSIONS: dict[str, tuple[int, str]] = {
    "cookies": (30, "read and write cookies, including session cookies"),
    "webRequest": (20, "observe every network request the browser makes"),
    "webRequestBlocking": (25, "modify or cancel requests before they are sent"),
    "declarativeNetRequest": (15, "rewrite requests by rule"),
    "nativeMessaging": (35, "talk to a program installed on the machine"),
    "debugger": (40, "drive the browser's debugger — full control of any page"),
    "proxy": (30, "redirect all browsing through a server of its choosing"),
    "management": (25, "install, disable or remove other extensions"),
    "downloads": (15, "download files without asking"),
    "history": (15, "read the full browsing history"),
    "tabs": (10, "see the URL of every open tab"),
    "clipboardRead": (20, "read the clipboard"),
    "privacy": (15, "change privacy settings"),
    "scripting": (15, "inject scripts into pages"),
    "storage": (0, "store its own data"),
}

# Host patterns that mean "every site".
BROAD_HOSTS = {"<all_urls>", "*://*/*", "http://*/*", "https://*/*", "*://*/",
               "file://*/*", "*"}

# Sites where cookie access is account takeover.
SENSITIVE_HOSTS = {
    "roblox": ("roblox.com", "rbxcdn.com"),
    "discord": ("discord.com", "discordapp.com"),
    "google": ("google.com", "gmail.com", "youtube.com"),
    "microsoft": ("microsoft.com", "live.com", "outlook.com"),
    "steam": ("steampowered.com", "steamcommunity.com"),
    "banking": ("paypal.com", "coinbase.com", "binance.com"),
}


@dataclass
class Extension:
    browser: str
    profile: str
    extension_id: str
    name: str
    version: str = ""
    description: str = ""
    permissions: list[str] = field(default_factory=list)
    host_permissions: list[str] = field(default_factory=list)
    content_script_matches: list[str] = field(default_factory=list)
    update_url: str | None = None
    path: str = ""
    manifest_version: int = 0

    @property
    def sideloaded(self) -> bool:
        """No update URL means it did not come from a web store."""
        return not self.update_url

    @property
    def all_hosts(self) -> list[str]:
        return list(self.host_permissions) + list(self.content_script_matches)

    def to_dict(self) -> dict[str, Any]:
        return {"browser": self.browser, "profile": self.profile, "id": self.extension_id,
                "name": self.name, "version": self.version, "permissions": self.permissions,
                "host_permissions": self.host_permissions,
                "content_scripts": self.content_script_matches,
                "update_url": self.update_url, "sideloaded": self.sideloaded,
                "path": self.path, "manifest_version": self.manifest_version}


@dataclass
class ExtensionVerdict:
    extension: Extension
    score: int = 0
    severity: str = "info"
    reasons: list[str] = field(default_factory=list)
    targets: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"extension": self.extension.to_dict(), "score": self.score,
                "severity": self.severity, "reasons": self.reasons, "targets": self.targets}

    def summary(self) -> str:
        return (f"[{self.severity.upper()}] {self.extension.browser}: "
                f"{self.extension.name} ({self.extension.extension_id[:16]}) — "
                + "; ".join(self.reasons[:3]))


def parse_chromium_manifest(raw: str, *, browser: str = "", profile: str = "",
                            extension_id: str = "", path: str = "") -> Extension | None:
    """Parse a Chromium `manifest.json` into an Extension.

    Manifest V2 and V3 differ in where host access is declared — V2 folds hosts
    into `permissions`, V3 splits them into `host_permissions` — so both are
    normalised here rather than at every call site.
    """
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None

    version = int(data.get("manifest_version", 2) or 2)
    declared = [str(p) for p in (data.get("permissions") or []) if isinstance(p, str)]
    hosts = [str(h) for h in (data.get("host_permissions") or []) if isinstance(h, str)]
    optional = [str(p) for p in (data.get("optional_permissions") or []) if isinstance(p, str)]

    # In V2 the two are mixed together: anything with a scheme or a wildcard is
    # a host match, everything else is an API permission.
    permissions: list[str] = []
    for entry in declared + optional:
        if "://" in entry or entry in BROAD_HOSTS or entry.startswith("*."):
            hosts.append(entry)
        else:
            permissions.append(entry)

    matches: list[str] = []
    for script in (data.get("content_scripts") or []):
        if isinstance(script, dict):
            matches.extend(str(m) for m in (script.get("matches") or []))

    name = str(data.get("name", "") or "")
    # Store listings use __MSG_name__ placeholders; the real string is in
    # _locales, which is not worth walking for a risk score.
    if name.startswith("__MSG_"):
        name = f"{name} (localised name, see {path or 'the extension folder'})"

    return Extension(
        browser=browser, profile=profile, extension_id=extension_id,
        name=name or "(unnamed)", version=str(data.get("version", "") or ""),
        description=str(data.get("description", "") or "")[:200],
        permissions=sorted(set(permissions)), host_permissions=sorted(set(hosts)),
        content_script_matches=sorted(set(matches)),
        update_url=(str(data["update_url"]) if data.get("update_url") else None),
        path=path, manifest_version=version)


def assess(extension: Extension) -> ExtensionVerdict:
    """Score one extension on what it is permitted to do."""
    verdict = ExtensionVerdict(extension=extension)

    granted = [p for p in extension.permissions if p in RISKY_PERMISSIONS
               and RISKY_PERMISSIONS[p][0] > 0]
    for permission in granted:
        points, description = RISKY_PERMISSIONS[permission]
        verdict.score += points
        verdict.reasons.append(f"can {description} ({permission})")

    broad = [h for h in extension.all_hosts if h in BROAD_HOSTS]
    if broad:
        verdict.score += 25
        verdict.reasons.append("has access to every site you visit")

    # Which sensitive services it can reach.
    for label, domains in SENSITIVE_HOSTS.items():
        for host in extension.all_hosts:
            if any(domain in host for domain in domains):
                verdict.targets.append(label)
                break
    verdict.targets = sorted(set(verdict.targets))

    has_cookies = "cookies" in extension.permissions
    reaches_sensitive = bool(verdict.targets) or bool(broad)

    if has_cookies and reaches_sensitive:
        verdict.score += 40
        where = ", ".join(verdict.targets) if verdict.targets else "every site"
        verdict.reasons.insert(
            0, f"can read session cookies for {where} — that is enough to sign in as you "
               f"without needing your password")

    if extension.sideloaded:
        verdict.score += 20
        verdict.reasons.append("no update URL: not installed from a browser web store "
                               "(sideloaded, or loaded unpacked in developer mode)")

    if "roblox" in verdict.targets and has_cookies:
        verdict.score += 30
        verdict.reasons.insert(0, "specifically targets Roblox cookies (.ROBLOSECURITY)")

    verdict.severity = ("critical" if verdict.score >= 100 else
                        "high" if verdict.score >= 65 else
                        "medium" if verdict.score >= 35 else
                        "low" if verdict.score >= 15 else "info")
    return verdict


# ------------------------------------------------------------------ discovery
def find_chromium_extensions(roots: dict[str, str] | None = None) -> list[Extension]:
    """Walk every Chromium profile's Extensions directory."""
    found: list[Extension] = []
    for browser, raw_root in (roots or CHROMIUM_ROOTS).items():
        root = expand_path(raw_root)
        if not root.is_dir():
            continue
        for profile_dir in _profile_dirs(root):
            extensions_dir = profile_dir / "Extensions"
            if not extensions_dir.is_dir():
                continue
            for extension_dir in _safe_iter(extensions_dir):
                if not extension_dir.is_dir():
                    continue
                for version_dir in _safe_iter(extension_dir):
                    manifest = version_dir / "manifest.json"
                    if not manifest.is_file():
                        continue
                    try:
                        raw = manifest.read_text(encoding="utf-8", errors="replace")
                    except OSError:
                        continue
                    extension = parse_chromium_manifest(
                        raw, browser=browser, profile=profile_dir.name,
                        extension_id=extension_dir.name, path=str(version_dir))
                    if extension:
                        found.append(extension)
    return found


def find_firefox_extensions(roots: dict[str, str] | None = None) -> list[Extension]:
    """Read each Firefox profile's extensions.json index."""
    found: list[Extension] = []
    for browser, raw_root in (roots or FIREFOX_ROOTS).items():
        root = expand_path(raw_root)
        if not root.is_dir():
            continue
        for profile_dir in _safe_iter(root):
            index = profile_dir / "extensions.json"
            if not index.is_file():
                continue
            try:
                data = json.loads(index.read_text(encoding="utf-8", errors="replace"))
            except (OSError, json.JSONDecodeError):
                continue
            for addon in (data.get("addons") or []):
                if not isinstance(addon, dict) or addon.get("type") != "extension":
                    continue
                manifest = addon.get("defaultLocale") or {}
                found.append(Extension(
                    browser=browser, profile=profile_dir.name,
                    extension_id=str(addon.get("id", "")),
                    name=str(manifest.get("name") or addon.get("id") or "(unnamed)"),
                    version=str(addon.get("version", "")),
                    description=str(manifest.get("description") or "")[:200],
                    permissions=[str(p) for p in (addon.get("userPermissions") or {})
                                 .get("permissions", [])],
                    host_permissions=[str(h) for h in (addon.get("userPermissions") or {})
                                      .get("origins", [])],
                    update_url=str(addon.get("updateURL")) if addon.get("updateURL") else
                    ("store" if addon.get("foreignInstall") is False else None),
                    path=str(addon.get("path", "")),
                    manifest_version=int(addon.get("manifestVersion", 2) or 2)))
    return found


def _profile_dirs(root: Path) -> list[Path]:
    """Chromium profiles: Default, Profile 1, Profile 2… plus the root itself."""
    profiles = [root]
    for child in _safe_iter(root):
        if child.is_dir() and (child.name == "Default" or child.name.startswith("Profile ")):
            profiles.append(child)
    return profiles


def _safe_iter(path: Path) -> Iterable[Path]:
    try:
        return sorted(path.iterdir())
    except (OSError, PermissionError):
        return []


def scan_all() -> list[ExtensionVerdict]:
    """Every extension on the machine, scored, worst first."""
    extensions = find_chromium_extensions() + find_firefox_extensions()
    verdicts = [assess(extension) for extension in extensions]
    return sorted(verdicts, key=lambda v: -v.score)


def format_report(verdicts: list[ExtensionVerdict], *, show_all: bool = False) -> str:
    lines = ["", "BROWSER EXTENSION AUDIT", "=" * 78, f"Scanned at {utc_stamp()}"]
    if not verdicts:
        lines.append("")
        lines.append("No browser extensions found.")
        lines.append("On Windows this means none are installed, or the browser profile")
        lines.append("directories are somewhere Candy could not read.")
        return "\n".join(lines)

    interesting = [v for v in verdicts if show_all or v.score >= 15]
    lines.append(f"{len(verdicts)} extension(s) installed, {len(interesting)} worth a look")
    lines.append("")
    for verdict in interesting:
        extension = verdict.extension
        lines.append(f"[{verdict.severity.upper():8}] score {verdict.score:3}  "
                     f"{extension.browser} / {extension.profile}")
        lines.append(f"  {extension.name}  v{extension.version}")
        lines.append(f"  id: {extension.extension_id}")
        for reason in verdict.reasons:
            lines.append(f"    - {reason}")
        if extension.path:
            lines.append(f"    path: {extension.path}")
        lines.append("")
    if not interesting:
        lines.append("Nothing scored above the reporting threshold — every extension")
        lines.append("installed here asks only for ordinary permissions.")
    lines.append("-" * 78)
    lines.append("Remove an extension from the browser's own extensions page. Candy does")
    lines.append("not delete browser files: a half-removed extension breaks the profile.")
    return "\n".join(lines)
