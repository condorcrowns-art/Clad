"""Ad, tracker, malvertising and phishing blocking.

Malvertising is one of the two ways an executor lands on a machine that nobody
went looking for one on: a bad ad on a game or streaming site redirects to a
"free robux" download page. Blocking the ad network blocks the delivery route,
which is cheaper and more reliable than catching the payload afterwards.

This is DNS-level blocking through the hosts file, in its own managed section
so a 50,000-entry list never disturbs the handful of domains the user blocked
by hand. It is exactly what Pi-hole and AdGuard Home do, running on the machine
itself instead of on the network.

**What it does not do:** it cannot remove ads from inside a page the way a
browser extension does, because it never sees the page. Blocking the ad
network's *domain* usually leaves a blank space where the ad was. Blocking is
also bypassed by a browser using DNS-over-HTTPS — the same caveat as every
hosts-based blocker, and the reason Candy adds firewall rules alongside it for
high-value blocks.

The shipped seed is small and every entry is a domain whose only purpose is
advertising, tracking or malvertising. Large public lists (StevenBlack,
AdGuard, OISD, Hagezi) are free and standard hosts format — ``import_list``
reads them, and none of them cost anything.
"""
from __future__ import annotations

import re
import ssl
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import Config
from .netblock import HostsBlocker, hosts_path_for_platform, is_protected, normalize_domain

ADBLOCK_LABEL = "ADBLOCK"

# Hosts files with hundreds of thousands of entries measurably slow the Windows
# DNS client. This cap is generous but finite.
DEFAULT_MAX_ENTRIES = 60_000
MAX_LIST_BYTES = 32 * 1024 * 1024

# Seed list. Deliberately small and high-confidence: every domain here exists
# only to serve ads, track users, or distribute malvertising. Users who want
# hundreds of thousands of entries should import a maintained public list.
SEED_LISTS: dict[str, list[str]] = {
    "ads": [
        "doubleclick.net", "googlesyndication.com", "googleadservices.com",
        "adservice.google.com", "pagead2.googlesyndication.com", "adnxs.com",
        "advertising.com", "adsrvr.org", "rubiconproject.com", "pubmatic.com",
        "openx.net", "criteo.com", "criteo.net", "taboola.com", "outbrain.com",
        "media.net", "adcolony.com", "applovin.com", "unityads.unity3d.com",
        "smartadserver.com", "adform.net", "casalemedia.com", "3lift.com",
        "sharethrough.com", "yieldmo.com", "bidswitch.net", "adroll.com",
    ],
    "trackers": [
        "google-analytics.com", "analytics.google.com", "scorecardresearch.com",
        "quantserve.com", "hotjar.com", "mouseflow.com", "fullstory.com",
        "mixpanel.com", "segment.io", "branch.io", "amplitude.com",
        "chartbeat.com", "newrelic.com", "bugsnag.com", "crazyegg.com",
        "clarity.ms", "matomo.cloud", "statcounter.com", "yandex.ru",
    ],
    "malvertising": [
        # Pop-under, forced-redirect and "download button" ad networks: the
        # delivery route for most drive-by executor installers.
        "popads.net", "popcash.net", "propellerads.com", "propellerads.net",
        "adcash.com", "clickadu.com", "hilltopads.net", "exoclick.com",
        "juicyads.com", "trafficjunky.net", "adsterra.com", "monetag.com",
        "onclickalgo.com", "onclckmn.com", "zeydoo.com", "poweradnetwork.com",
        "revenuehits.com", "adnium.com", "trafficstars.com", "mgid.com",
    ],
    "fake_download": [
        # Sites whose business model is wrapping software in ad-funded
        # installers, or serving "free robux / free executor" landing pages.
        "downloadmaster.pw", "getcrack.pw", "cracked-games.org",
        "freerobuxgenerator.club", "robux-generator.xyz", "free-robux.site",
        "robloxexecutor.download", "krnl-download.com", "synapse-x.download",
    ],
    "telemetry": [
        # Off by default: some people want it, and blocking it breaks nothing
        # but also protects nothing. Included for completeness.
        "vortex.data.microsoft.com", "telemetry.microsoft.com",
        "settings-win.data.microsoft.com", "watson.telemetry.microsoft.com",
    ],
}

DEFAULT_CATEGORIES = ["ads", "trackers", "malvertising", "fake_download"]

# hosts-format:  0.0.0.0 domain.com  |  127.0.0.1 domain.com
_HOSTS_LINE = re.compile(r"^\s*(?:0\.0\.0\.0|127\.0\.0\.1|::1?)\s+([^\s#]+)")
# AdBlock-Plus style:  ||domain.com^
_ABP_LINE = re.compile(r"^\|\|([a-z0-9.-]+)\^")
# plain domain list
_PLAIN_LINE = re.compile(r"^\s*([a-z0-9][a-z0-9.-]*\.[a-z]{2,})\s*$", re.I)


@dataclass
class ImportResult:
    ok: bool
    detail: str
    added: int = 0
    skipped: int = 0
    total: int = 0
    domains: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return f"{'OK' if self.ok else 'FAILED'}: {self.detail}"


def parse_blocklist(text: str, *, limit: int = DEFAULT_MAX_ENTRIES) -> tuple[list[str], int]:
    """Parse hosts, AdBlock-Plus or plain-domain format into domains.

    Returns ``(domains, skipped)``. Three formats because that is what the free
    public lists actually ship, and requiring conversion would be a papercut
    that stops people using them.
    """
    domains: list[str] = []
    seen: set[str] = set()
    skipped = 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", "!", "[")):
            continue
        candidate = None
        for pattern in (_HOSTS_LINE, _ABP_LINE, _PLAIN_LINE):
            match = pattern.match(line)
            if match:
                candidate = match.group(1)
                break
        if candidate is None:
            skipped += 1
            continue
        domain = normalize_domain(candidate)
        if domain is None or is_protected(domain):
            skipped += 1
            continue
        if domain in seen:
            continue
        seen.add(domain)
        domains.append(domain)
        if len(domains) >= limit:
            break
    return domains, skipped


class AdBlocker:
    """Manages the ad/tracker section of the hosts file."""

    def __init__(self, config: Config) -> None:
        self.config = config
        # No www. mirrors: on a list this size they would double the file for
        # very little extra coverage.
        self.hosts = HostsBlocker(
            hosts_path_for_platform(config.get("web.hosts_file") or None),
            ADBLOCK_LABEL, with_www=False)
        self.cache_path = config.data_dir() / "adblock-domains.json"

    # ---------------------------------------------------------------- state
    def blocked(self) -> list[str]:
        return self.hosts.blocked()

    def available(self) -> tuple[bool, str]:
        return self.hosts.available()

    def status(self) -> dict[str, Any]:
        writable, reason = self.available()
        return {
            "enabled": bool(self.config.get("adblock.enabled", False)),
            "categories": list(self.config.get("adblock.categories", DEFAULT_CATEGORIES)),
            "blocked_domains": len(self.blocked()),
            "hosts_file": str(self.hosts.path),
            "writable": writable,
            "detail": reason,
            "max_entries": int(self.config.get("adblock.max_entries", DEFAULT_MAX_ENTRIES)),
        }

    # --------------------------------------------------------------- apply
    def seed_domains(self, categories: Iterable[str] | None = None) -> list[str]:
        chosen = list(categories or self.config.get("adblock.categories", DEFAULT_CATEGORIES))
        domains: list[str] = []
        for category in chosen:
            domains.extend(SEED_LISTS.get(category, []))
        allowed = {str(d).lower() for d in self.config.get("adblock.allow", [])}
        return sorted({d for d in domains if d not in allowed and not is_protected(d)})

    def apply(self, extra: Iterable[str] = ()) -> ImportResult:
        """Write the current category selection (plus extras) into the hosts file."""
        limit = int(self.config.get("adblock.max_entries", DEFAULT_MAX_ENTRIES))
        allowed = {str(d).lower() for d in self.config.get("adblock.allow", [])}
        domains = set(self.seed_domains())
        for value in extra:
            domain = normalize_domain(value)
            if domain and not is_protected(domain) and domain not in allowed:
                domains.add(domain)
        final = sorted(domains)[:limit]

        writable, reason = self.available()
        if not writable:
            return ImportResult(False, reason, total=len(final))
        result = self.hosts.block(final) if final else self.hosts.clear()
        return ImportResult(result.ok, result.detail, added=len(final), total=len(final),
                            domains=final)

    def clear(self) -> ImportResult:
        result = self.hosts.clear()
        return ImportResult(result.ok, "ad and tracker blocking removed from the hosts file")

    def allow(self, domain: str) -> ImportResult:
        """Un-block one domain permanently (a site broke without it)."""
        clean = normalize_domain(domain)
        if clean is None:
            return ImportResult(False, f"{domain!r} is not a valid domain")
        self.config.add_list_entry("adblock", "allow", clean)
        remaining = [d for d in self.blocked() if d != clean]
        self.hosts.clear()
        if remaining:
            self.hosts.block(remaining)
        return ImportResult(True, f"{clean} is allowed again and will not be re-blocked",
                            total=len(remaining))

    # -------------------------------------------------------------- import
    def import_list(self, source: str, *, timeout: int = 30) -> ImportResult:
        """Load a public blocklist from an HTTPS URL or a local file."""
        limit = int(self.config.get("adblock.max_entries", DEFAULT_MAX_ENTRIES))
        try:
            if source.lower().startswith("https://"):
                request = urllib.request.Request(source, headers={"User-Agent": "Candy/1.0"})
                with urllib.request.urlopen(request, timeout=timeout,
                                            context=ssl.create_default_context()) as response:
                    raw = response.read(MAX_LIST_BYTES + 1)
                if len(raw) > MAX_LIST_BYTES:
                    return ImportResult(False, "blocklist is larger than the 32 MB limit")
                text = raw.decode("utf-8", "replace")
            elif source.lower().startswith("http://"):
                return ImportResult(False, "blocklist URLs must use https://")
            else:
                text = Path(source).read_text(encoding="utf-8", errors="replace")
        except Exception as exc:  # noqa: BLE001
            return ImportResult(False, f"could not read {source}: {exc}")

        domains, skipped = parse_blocklist(text, limit=limit)
        if not domains:
            return ImportResult(False, "no usable domains found in that list", skipped=skipped)
        result = self.apply(extra=domains)
        result.skipped = skipped
        result.detail = (f"imported {len(domains)} domain(s) from {source} "
                         f"({skipped} lines skipped); {result.total} now blocked")
        return result
