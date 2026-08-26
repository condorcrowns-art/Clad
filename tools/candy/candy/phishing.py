"""Phishing URL analysis that needs no feed and no network.

Blocklists only know about phishing sites somebody already reported. The sites
that actually take Roblox accounts are registered hours before they are used
and are dead by the time a list catches up. What does not change is their
*shape*:

* ``rob1ox.com`` — a character swapped for a lookalike.
* ``roblox.com.login-verify.xyz`` — the real brand as a subdomain of a
  throwaway domain.
* ``xn--roblx-8ta.com`` — punycode hiding a Cyrillic character.
* ``free-robux-generator-2026.tk`` — brand plus bait plus a free TLD.

All of that is measurable from the string alone. This module scores a hostname
against those patterns, so a brand-new phishing domain is judged on how it
looks rather than on whether anyone has reported it yet.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# Brands worth impersonating on a machine that plays Roblox.
PROTECTED_BRANDS = {
    "roblox": ("roblox.com", "rbxcdn.com"),
    "discord": ("discord.com", "discord.gg", "discordapp.com"),
    "microsoft": ("microsoft.com", "live.com", "outlook.com"),
    "google": ("google.com", "gmail.com", "youtube.com"),
    "steam": ("steampowered.com", "steamcommunity.com"),
    "paypal": ("paypal.com",),
    "epicgames": ("epicgames.com",),
}

# Characters commonly swapped to make a lookalike domain.
HOMOGLYPHS = str.maketrans({
    "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
    "$": "s", "@": "a", "|": "l",
})

# TLDs that are free or near-free to register, so disposable phishing lives there.
CHEAP_TLDS = {
    "tk", "ml", "ga", "cf", "gq", "xyz", "top", "buzz", "click", "link", "work",
    "surf", "rest", "cyou", "icu", "sbs", "cfd", "lol", "quest", "monster",
}

# Words that only appear on a page that wants a password or a payment.
CREDENTIAL_BAIT = (
    "login", "signin", "sign-in", "verify", "verification", "account", "secure",
    "update", "confirm", "unlock", "recover", "password", "wallet", "billing",
    "support", "gift", "giveaway", "generator", "freerobux", "free-robux",
    "robux", "claim", "reward", "promo", "redeem",
)

URL_SHORTENERS = {
    "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
    "rebrand.ly", "cutt.ly", "shorturl.at", "rb.gy", "tiny.cc", "shorte.st",
}

_IPV4_HOST = re.compile(r"^\d{1,3}(?:\.\d{1,3}){3}$")


@dataclass
class PhishingVerdict:
    host: str
    score: int = 0
    findings: list[dict[str, Any]] = field(default_factory=list)
    impersonates: str | None = None

    @property
    def verdict(self) -> str:
        if self.score >= 70:
            return "phishing"
        if self.score >= 40:
            return "suspicious"
        if self.score >= 20:
            return "questionable"
        return "clean"

    @property
    def severity(self) -> str:
        return {"phishing": "critical", "suspicious": "high",
                "questionable": "low", "clean": "info"}[self.verdict]

    def add(self, kind: str, points: int, detail: str) -> None:
        self.score += points
        self.findings.append({"kind": kind, "points": points, "detail": detail})

    def to_dict(self) -> dict[str, Any]:
        return {"host": self.host, "score": self.score, "verdict": self.verdict,
                "impersonates": self.impersonates, "findings": self.findings}

    def summary(self) -> str:
        reasons = "; ".join(f["detail"] for f in self.findings) or "nothing unusual"
        return f"{self.host}: {self.verdict.upper()} ({self.score}) — {reasons}"


def levenshtein(a: str, b: str, *, cap: int = 4) -> int:
    """Edit distance, abandoned once it exceeds ``cap``.

    Only small distances matter here — a typosquat is one or two characters
    away from the real thing — so the early exit keeps this cheap on long
    random hostnames.
    """
    if a == b:
        return 0
    if abs(len(a) - len(b)) > cap:
        return cap + 1
    previous = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        current = [i]
        for j, cb in enumerate(b, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1,
                               previous[j - 1] + (ca != cb)))
        if min(current) > cap:
            return cap + 1
        previous = current
    return previous[-1]


def registrable(host: str) -> str:
    """The last two labels — a rough public-suffix stand-in.

    Getting this exactly right needs the Public Suffix List; two labels is
    wrong for ``co.uk`` and friends, which is why a mismatch here only ever
    *adds* signal rather than clearing a domain.
    """
    parts = [p for p in (host or "").lower().split(".") if p]
    return ".".join(parts[-2:]) if len(parts) >= 2 else host or ""


def analyze_host(host: str) -> PhishingVerdict:
    """Score a hostname for phishing characteristics."""
    host = (host or "").strip().lower().rstrip(".")
    verdict = PhishingVerdict(host=host)
    if not host:
        return verdict

    labels = host.split(".")
    base = registrable(host)
    tld = labels[-1] if len(labels) > 1 else ""

    # A legitimate brand domain is never phishing for itself.
    for brand, domains in PROTECTED_BRANDS.items():
        if base in domains:
            return verdict

    if _IPV4_HOST.match(host):
        verdict.add("ip_literal", 35, "the link points at a raw IP address, not a domain name")
        return verdict

    if host.startswith("xn--") or any(label.startswith("xn--") for label in labels):
        verdict.add("punycode", 45,
                    "punycode in the hostname — non-Latin characters can be drawn to look "
                    "identical to ordinary letters")

    # Brand appearing anywhere but the registrable domain: the classic
    # roblox.com.evil.xyz shape.
    subdomain_part = ".".join(labels[:-2]) if len(labels) > 2 else ""
    for brand, domains in PROTECTED_BRANDS.items():
        if brand in subdomain_part and base not in domains:
            verdict.impersonates = brand
            verdict.add("brand_in_subdomain", 50,
                        f"'{brand}' appears in the subdomain of {base}, which is not a "
                        f"{brand} domain")
            break

    # Typosquat / homoglyph on the registrable domain itself.
    if not verdict.impersonates:
        stem = base.split(".")[0]
        deglyphed = stem.translate(HOMOGLYPHS)
        for brand, domains in PROTECTED_BRANDS.items():
            real_stems = {d.split(".")[0] for d in domains}
            for real in real_stems:
                if stem == real and base not in domains:
                    verdict.impersonates = brand
                    verdict.add("brand_other_tld", 45,
                                f"uses the {brand} name on {base}, which {brand} does not own")
                    break
                if deglyphed == real and stem != real:
                    verdict.impersonates = brand
                    verdict.add("homoglyph", 55,
                                f"'{stem}' is '{real}' with lookalike characters substituted")
                    break
                distance = levenshtein(stem, real, cap=2)
                if 0 < distance <= 2 and len(real) >= 5:
                    verdict.impersonates = brand
                    verdict.add("typosquat", 45,
                                f"'{stem}' is {distance} character(s) away from '{real}'")
                    break
            if verdict.impersonates:
                break

    if tld in CHEAP_TLDS:
        verdict.add("cheap_tld", 15,
                    f".{tld} is a free or near-free TLD, heavily used for disposable sites")

    bait = [word for word in CREDENTIAL_BAIT if word in host.replace(".", "")]
    if bait:
        points = 25 if verdict.impersonates else 15
        verdict.add("credential_bait", points,
                    f"hostname contains {', '.join(bait[:4])} — wording used to make people "
                    f"enter credentials or chase a reward")

    if base in URL_SHORTENERS:
        verdict.add("shortener", 20, "a URL shortener hides the real destination")

    if len(labels) >= 5:
        verdict.add("deep_subdomains", 15,
                    f"{len(labels)} subdomain levels — used to push the real domain out of "
                    f"sight in a phone browser's address bar")

    if len(host) > 60:
        verdict.add("long_host", 10, "unusually long hostname")

    stem = base.split(".")[0]
    if stem.count("-") >= 3:
        verdict.add("many_hyphens", 15, f"'{stem}' uses {stem.count('-')} hyphens")
    if len(stem) >= 12 and sum(c.isdigit() for c in stem) >= 4:
        verdict.add("random_looking", 10, "domain looks machine-generated")

    return verdict


def analyze_url(url: str) -> PhishingVerdict:
    """Score a full URL: the hostname plus what the path gives away."""
    from .netblock import normalize_domain

    text = (url or "").strip()
    host = normalize_domain(text)
    verdict = analyze_host(host or "")
    if not host:
        verdict.host = text[:100]
        verdict.add("unparseable", 10, "could not read a hostname out of that link")
        return verdict

    lowered = text.lower()
    if lowered.startswith("http://"):
        verdict.add("no_tls", 10, "plain HTTP — anything typed into the page is sent unencrypted")

    path = lowered.split("://", 1)[-1]
    path = path[path.find("/"):] if "/" in path else ""
    if path:
        bait = [word for word in CREDENTIAL_BAIT if word in path]
        if bait and verdict.impersonates:
            verdict.add("path_bait", 20,
                        f"the link path contains {', '.join(bait[:3])} on a domain "
                        f"impersonating {verdict.impersonates}")
        if re.search(r"\.(exe|scr|bat|cmd|ps1|vbs|jar|msi)(\?|$)", path):
            verdict.add("direct_download", 30,
                        "the link points straight at an executable file")
        if "@" in text.split("://", 1)[-1].split("/", 1)[0]:
            verdict.add("userinfo_trick", 35,
                        "the link uses an @ so the part before it is not the real destination")
    return verdict
