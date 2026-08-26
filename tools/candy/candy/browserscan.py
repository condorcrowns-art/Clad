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


# The update hosts of the real extension stores. An extension that updates
# from one of these was listed publicly, has an ID that is derived from its
# signing key and cannot be claimed by anything else, and can be looked up by
# anyone. That is not a clean bill of health — malicious extensions get listed
# — but it is a completely different thing from a folder somebody dropped in.
STORE_UPDATE_HOSTS = (
    "clients2.google.com", "clients2.googleusercontent.com",     # Chrome
    "edge.microsoft.com",                                        # Edge
    "extension-updates.opera.com", "api.opera.com",              # Opera
    "addons.mozilla.org", "versioncheck.addons.mozilla.org",     # Firefox
    "go-updater.brave.com", "updates.bravesoftware.com",         # Brave
    "update.vivaldi.com",                                        # Vivaldi
)

STORE = "store"
SIDELOADED = "sideloaded"
UNKNOWN_UPDATER = "unknown updater"

# A store-listed extension's declared power is discounted, because for most of
# them the power *is* the product: uBlock Origin cannot block a request it is
# not allowed to see, so scoring it 95 for holding webRequest is scoring it for
# working. Reporting that a capability exists rather than that it is
# unexpected is the same mistake that produced twenty-two false persistence
# findings on a clean machine, and it costs more here — five CRITICALs, four
# of them Opera's and Chrome's own bundled extensions, with the one extension
# on the machine that actually reads .ROBLOSECURITY listed fourth.
STORE_DISCOUNT = 0.5

# Being able to read a session cookie for a service you are signed in to is
# not a capability like the others. It is the whole attack, so it is never
# discounted and it sets a severity floor of its own.
ACCOUNT_THEFT_SCORE = 40
ROBLOX_TARGET_SCORE = 30
SIDELOAD_SCORE = 20
UNKNOWN_UPDATER_SCORE = 35


def update_origin(update_url: str | None) -> str:
    """Where this extension gets its updates from."""
    if not update_url:
        return SIDELOADED
    host = str(update_url).split("://", 1)[-1].split("/", 1)[0].split(":")[0].lower()
    if any(host == known or host.endswith("." + known) for known in STORE_UPDATE_HOSTS):
        return STORE
    return UNKNOWN_UPDATER


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
    def origin(self) -> str:
        """store, sideloaded, or updating from somewhere that is neither."""
        return update_origin(self.update_url)

    @property
    def all_hosts(self) -> list[str]:
        return list(self.host_permissions) + list(self.content_script_matches)

    def to_dict(self) -> dict[str, Any]:
        return {"browser": self.browser, "profile": self.profile, "id": self.extension_id,
                "name": self.name, "version": self.version, "permissions": self.permissions,
                "host_permissions": self.host_permissions,
                "content_scripts": self.content_script_matches,
                "update_url": self.update_url, "sideloaded": self.sideloaded,
                "origin": self.origin,
                "path": self.path, "manifest_version": self.manifest_version}


@dataclass
class ExtensionVerdict:
    extension: Extension
    score: int = 0
    severity: str = "info"
    reasons: list[str] = field(default_factory=list)
    targets: list[str] = field(default_factory=list)
    origin: str = ""
    can_take_account: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {"extension": self.extension.to_dict(), "score": self.score,
                "severity": self.severity, "reasons": self.reasons,
                "targets": self.targets, "origin": self.origin,
                "can_take_account": self.can_take_account}

    def summary(self) -> str:
        return (f"[{self.severity.upper()}] {self.extension.browser}: "
                f"{self.extension.name} ({self.extension.extension_id[:16]}) — "
                + "; ".join(self.reasons[:3]))


def resolve_localised(name: str, path: str, default_locale: str = "") -> str:
    """Turn a ``__MSG_name__`` placeholder into the string it stands for.

    This was skipped as "not worth walking for a risk score", which was true
    of the score and wrong about the report. On a real machine four of the
    listed extensions came out as ``__MSG_manifest_name__`` — including the
    one flagged for reading .ROBLOSECURITY, the single line in the whole
    report the reader most needed to act on. A finding you cannot match to
    anything in your browser's extensions page is not actionable.
    """
    if not name.startswith("__MSG_") or not name.endswith("__"):
        return name
    key = name[6:-2]
    for locale in _locale_candidates(default_locale):
        messages = _read_messages(Path(path) / "_locales" / locale / "messages.json")
        if not messages:
            continue
        # Keys are matched case-insensitively: Chrome does, and manifests in
        # the wild disagree with their own _locales about capitalisation.
        for candidate, entry in messages.items():
            if candidate.lower() != key.lower():
                continue
            if isinstance(entry, dict) and entry.get("message"):
                return str(entry["message"])
    return f"{name} (name not in _locales; see {path or 'the extension folder'})"


def _locale_candidates(default_locale: str) -> list[str]:
    ordered = [default_locale, "en_US", "en", "en_GB"]
    return [locale for i, locale in enumerate(ordered)
            if locale and locale not in ordered[:i]]


def _read_messages(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig", errors="replace"))
    except (OSError, json.JSONDecodeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


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

    name = resolve_localised(str(data.get("name", "") or ""), path,
                             str(data.get("default_locale", "") or ""))

    return Extension(
        browser=browser, profile=profile, extension_id=extension_id,
        name=name or "(unnamed)", version=str(data.get("version", "") or ""),
        description=str(data.get("description", "") or "")[:200],
        permissions=sorted(set(permissions)), host_permissions=sorted(set(hosts)),
        content_script_matches=sorted(set(matches)),
        update_url=(str(data["update_url"]) if data.get("update_url") else None),
        path=path, manifest_version=version)


def assess(extension: Extension) -> ExtensionVerdict:
    """Score one extension on whether it could take an account off you.

    The earlier version added up declared permissions and stopped there. On a
    real machine that produced five CRITICALs out of twenty-four extensions:
    uBlock Origin (which needs webRequest to block anything), Opera's own
    bundled assistant and wallet, and Chrome's — while the single extension
    that declared a `.ROBLOSECURITY` interest sat fourth in the list. A report
    where four of the top five are wrong is a report nobody reads twice.

    So the capability sum is only half of it. The other half is where the
    extension came from, and whether it asked for the one thing that ends with
    somebody else signed into your account.
    """
    verdict = ExtensionVerdict(extension=extension)

    capability = 0
    granted = [p for p in extension.permissions if p in RISKY_PERMISSIONS
               and RISKY_PERMISSIONS[p][0] > 0]
    for permission in granted:
        points, description = RISKY_PERMISSIONS[permission]
        capability += points
        verdict.reasons.append(f"can {description} ({permission})")

    broad = [h for h in extension.all_hosts if h in BROAD_HOSTS]
    if broad:
        capability += 25
        verdict.reasons.append("has access to every site you visit")

    for label, domains in SENSITIVE_HOSTS.items():
        for host in extension.all_hosts:
            if any(domain in host for domain in domains):
                verdict.targets.append(label)
                break
    verdict.targets = sorted(set(verdict.targets))

    origin = extension.origin
    verdict.origin = origin
    if origin == STORE:
        # Discounted, not dismissed: a listed extension is still capable of
        # everything it declared, it just is not remarkable for declaring it.
        verdict.score = int(capability * STORE_DISCOUNT)
        verdict.reasons.append("installed from a browser web store")
    elif origin == UNKNOWN_UPDATER:
        verdict.score = capability + UNKNOWN_UPDATER_SCORE
        verdict.reasons.append(
            f"updates itself from {extension.update_url} — not a browser web store, "
            f"so whoever controls that address can change what this extension does "
            f"at any time, silently")
    else:
        verdict.score = capability + SIDELOAD_SCORE
        verdict.reasons.append("no update URL: not installed from a browser web store "
                               "(sideloaded, or loaded unpacked in developer mode)")

    has_cookies = "cookies" in extension.permissions
    reaches_sensitive = bool(verdict.targets) or bool(broad)
    verdict.can_take_account = has_cookies and reaches_sensitive

    if verdict.can_take_account:
        # Never discounted by origin. This is the attack, not a capability.
        verdict.score += ACCOUNT_THEFT_SCORE
        where = ", ".join(verdict.targets) if verdict.targets else "every site"
        verdict.reasons.insert(
            0, f"can read session cookies for {where} — that is enough to sign in as you "
               f"without needing your password")

    if "roblox" in verdict.targets and has_cookies:
        verdict.score += ROBLOX_TARGET_SCORE
        verdict.reasons.insert(0, "specifically targets Roblox cookies (.ROBLOSECURITY)")

    verdict.severity = _severity(verdict)
    return verdict


def _severity(verdict: ExtensionVerdict) -> str:
    """Critical is reserved for "this can take your account".

    Everything else tops out at high however many permissions it holds,
    because a powerful extension you installed on purpose is not an incident.
    """
    if verdict.can_take_account:
        if verdict.extension.origin != STORE or "roblox" in verdict.targets:
            return "critical"
        return "high"
    if verdict.score >= 100:
        return "high"
    return ("medium" if verdict.score >= 35 else
            "low" if verdict.score >= 15 else "info")


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
    """Every extension on the machine, scored, worst first.

    Sorted on account risk before raw score, so the extension that can read
    your session cookies is never listed below a powerful one that cannot.
    """
    extensions = find_chromium_extensions() + find_firefox_extensions()
    verdicts = [assess(extension) for extension in extensions]
    return sorted(verdicts, key=lambda v: (not v.can_take_account, -v.score))


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

    # Two groups, because they call for different things. The first is "check
    # you meant to install this"; the second is "this is powerful, which is
    # usually why you installed it". Running them together as one ranked list
    # is what buried the Roblox cookie reader below Opera's own assistant.
    theft = [v for v in interesting if v.can_take_account]
    powerful = [v for v in interesting if not v.can_take_account]

    def block(group: list[ExtensionVerdict], heading: str, note: str) -> None:
        if not group:
            return
        lines.append("")
        lines.append(heading)
        lines.append("-" * len(heading))
        lines.append(note)
        lines.append("")
        for verdict in group:
            extension = verdict.extension
            lines.append(f"[{verdict.severity.upper():8}] score {verdict.score:3}  "
                         f"{extension.browser} / {extension.profile}  "
                         f"({verdict.origin})")
            lines.append(f"  {extension.name}  v{extension.version}")
            lines.append(f"  id: {extension.extension_id}")
            for reason in verdict.reasons:
                lines.append(f"    - {reason}")
            if extension.path:
                lines.append(f"    path: {extension.path}")
            lines.append("")

    block(theft, "CAN SIGN IN AS YOU",
          "These asked for cookie access to sites you have accounts on. Check you\n"
          "installed every one of them on purpose.")
    block(powerful, "POWERFUL, BUT DID NOT ASK FOR YOUR SESSIONS",
          "Broad permissions are normal for ad blockers, password managers and\n"
          "assistants — the permission is how they work. Listed so nothing is\n"
          "hidden, not because any of them is a finding.")

    if not interesting:
        lines.append("")
        lines.append("Nothing scored above the reporting threshold — every extension")
        lines.append("installed here asks only for ordinary permissions.")
    lines.append("-" * 78)
    lines.append("Remove an extension from the browser's own extensions page. Candy does")
    lines.append("not delete browser files: a half-removed extension breaks the profile.")
    return "\n".join(lines)
