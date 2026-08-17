"""Static triage — reading a payload without running it.

The gap this fills: detonating a sample in a hardware-virtualised sandbox
before its packets leave the machine. That needs a driver to hold the
connection and a hypervisor to run the sample; neither is free.

What *is* free is reading the file. A Windows binary has to declare the
functions it imports and carry its strings somewhere, and the combinations
give a payload away without executing a single instruction:

* ``VirtualAllocEx`` + ``WriteProcessMemory`` + ``CreateRemoteThread`` is the
  injection triad. Nothing but an injector needs all three.
* ``CryptUnprotectData`` next to browser paths is a credential stealer.
* An anti-analysis binary asks ``IsDebuggerPresent`` and calls ``NtSetInformationThread``.
* Embedded URLs, IPs and Discord/Telegram webhook endpoints are where the
  stolen data is going, and they are usually in plain text.

This is static analysis, so it is defeated by packing — which is itself
detected, by entropy, and reported as its own finding.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import pe
from .util import truncate

MAX_TRIAGE_BYTES = 32 * 1024 * 1024

# Grouped so a *combination* scores, not a single import. Any one of these
# appears in plenty of legitimate software; the sets do not.
API_GROUPS: dict[str, tuple[str, tuple[str, ...], str]] = {
    "injection": ("high", (
        "VirtualAllocEx", "WriteProcessMemory", "CreateRemoteThread",
        "NtCreateThreadEx", "QueueUserAPC", "SetWindowsHookEx", "RtlCreateUserThread",
    ), "allocates and writes memory in another process, then starts a thread there"),
    "process_access": ("medium", (
        "OpenProcess", "NtOpenProcess", "DebugActiveProcess", "Process32First",
    ), "opens and enumerates other processes"),
    "credentials": ("critical", (
        "CryptUnprotectData", "PK11_GetInternalKeySlot", "sqlite3_open",
        "\\Login Data", "logins.json", "cookies.sqlite", "Local State",
    ), "reads browser credential and cookie stores"),
    "anti_analysis": ("medium", (
        "IsDebuggerPresent", "CheckRemoteDebuggerPresent", "NtSetInformationThread",
        "NtQueryInformationProcess", "OutputDebugString", "GetTickCount64",
    ), "checks whether it is being debugged or analysed"),
    "persistence": ("high", (
        "RegSetValueEx", "CurrentVersion\\Run", "schtasks", "CreateService",
        "IFEO", "Image File Execution Options",
    ), "writes itself into an autostart location"),
    "defence_evasion": ("critical", (
        "Set-MpPreference", "DisableRealtimeMonitoring", "AddMpPreference",
        "bcdedit", "testsigning", "amsi.dll", "AmsiScanBuffer", "EtwEventWrite",
    ), "disables Defender, AMSI, ETW or driver signature enforcement"),
    "download": ("medium", (
        "URLDownloadToFile", "InternetOpenUrl", "WinHttpConnect", "socket",
        "certutil", "Invoke-WebRequest", "DownloadString",
    ), "downloads further payloads"),
    "roblox": ("high", (
        "RobloxPlayerBeta", "rbxcdn", ".ROBLOSECURITY", "roblox.com/v2/login",
    ), "references Roblox binaries, CDN or the session cookie"),
}

# Where stolen data usually goes.
EXFIL_PATTERNS = {
    "discord_webhook": re.compile(rb"https?://(?:ptb\.|canary\.)?discord(?:app)?\.com/api/webhooks/[\w/-]+", re.I),
    "telegram_bot": re.compile(rb"https?://api\.telegram\.org/bot[\w:-]+", re.I),
    "pastebin": re.compile(rb"https?://(?:www\.)?(?:pastebin\.com|hastebin\.com|paste\.ee)/\S+", re.I),
    "raw_gist": re.compile(rb"https?://(?:raw\.githubusercontent\.com|gist\.github)\S+", re.I),
}

URL_RE = re.compile(rb"https?://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{4,200}")
IPV4_RE = re.compile(rb"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b")

# Addresses that mean nothing: loopback, broadcast, version strings.
BORING_IPS = {"0.0.0.0", "127.0.0.1", "255.255.255.255", "1.0.0.0", "1.1.1.1", "8.8.8.8"}


@dataclass
class TriageReport:
    path: str
    is_pe: bool = False
    size: int = 0
    sha256: str | None = None
    entropy: float = 0.0
    packed: bool = False
    original_filename: str | None = None
    company: str | None = None
    signed: bool | None = None
    capabilities: dict[str, dict[str, Any]] = field(default_factory=dict)
    urls: list[str] = field(default_factory=list)
    ips: list[str] = field(default_factory=list)
    exfil: dict[str, list[str]] = field(default_factory=dict)
    score: int = 0
    verdict: str = "clean"
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path, "is_pe": self.is_pe, "size": self.size,
            "sha256": self.sha256, "entropy": round(self.entropy, 2), "packed": self.packed,
            "original_filename": self.original_filename, "company": self.company,
            "signed": self.signed, "capabilities": self.capabilities,
            "urls": self.urls[:20], "ips": self.ips[:20], "exfil": self.exfil,
            "score": self.score, "verdict": self.verdict, "notes": self.notes,
        }

    def summary(self) -> str:
        found = ", ".join(self.capabilities) or "nothing notable"
        return f"[{self.verdict.upper()} {self.score}] {Path(self.path).name}: {found}"


def _extract_strings(blob: bytes) -> bytes:
    """ASCII plus UTF-16LE flattened to one searchable buffer.

    Windows binaries store most interesting strings as UTF-16; dropping every
    other null byte makes both encodings searchable with one pass.
    """
    return blob + bytes(b for i, b in enumerate(blob) if i % 2 == 0)


def triage(path: str | Path, *, signature_checker=None, max_bytes: int = MAX_TRIAGE_BYTES) -> TriageReport:
    """Read a file and report what it is capable of, without running it."""
    target = Path(path)
    report = TriageReport(path=str(target))
    try:
        blob = target.read_bytes()[:max_bytes]
        report.size = target.stat().st_size
    except OSError as exc:
        report.notes.append(f"unreadable: {exc}")
        return report

    from .util import sha256_bytes

    report.sha256 = sha256_bytes(blob) if report.size <= max_bytes else None

    info = pe.inspect_bytes(blob, str(target))
    report.is_pe = info.is_pe
    if info.is_pe:
        report.entropy = info.max_code_entropy
        report.packed = info.looks_packed
        report.original_filename = info.original_filename
        report.company = info.company
    if signature_checker is not None:
        report.signed = signature_checker(str(target))

    haystack = _extract_strings(blob)
    lowered = haystack.lower()

    for group, (severity, needles, description) in API_GROUPS.items():
        hits = [needle for needle in needles if needle.lower().encode() in lowered]
        if not hits:
            continue
        # One hit from a group is weak evidence; several is a capability.
        if len(hits) < 2 and group not in ("credentials", "defence_evasion", "roblox"):
            continue
        report.capabilities[group] = {
            "severity": severity, "description": description,
            "indicators": hits[:8], "count": len(hits),
        }
        report.score += {"medium": 20, "high": 35, "critical": 50}.get(severity, 10) \
            + min(len(hits), 5) * 2

    report.urls = sorted({m.decode("ascii", "replace") for m in URL_RE.findall(haystack)})[:60]
    report.ips = sorted({m.decode("ascii") for m in IPV4_RE.findall(haystack)} - BORING_IPS)[:60]

    for label, pattern in EXFIL_PATTERNS.items():
        matches = sorted({m.decode("ascii", "replace") for m in pattern.findall(haystack)})
        if matches:
            report.exfil[label] = matches[:5]
            report.score += 45
            report.notes.append(f"contains a {label.replace('_', ' ')} — a common exfiltration sink")

    if report.packed:
        report.score += 15
        report.notes.append(
            f"code section entropy is {report.entropy:.2f}/8.00 — packed or encrypted, so "
            f"these string findings are only what the packer left visible")
    if report.signed is False:
        report.score += 10
        report.notes.append("unsigned binary")

    report.verdict = ("malicious" if report.score >= 100 else
                      "suspicious" if report.score >= 45 else
                      "questionable" if report.score >= 20 else "clean")
    return report


def format_report(report: TriageReport) -> str:
    """Human-readable triage output for the console."""
    lines = [
        f"File      : {report.path}",
        f"Size      : {report.size:,} bytes"
        + (f"   SHA-256: {report.sha256[:32]}…" if report.sha256 else ""),
        f"Type      : {'PE executable' if report.is_pe else 'not a PE file'}"
        + (f"   entropy {report.entropy:.2f}" if report.is_pe else ""),
    ]
    if report.original_filename:
        lines.append(f"Declares  : {report.original_filename}"
                     + (f"  ({report.company})" if report.company else ""))
    if report.signed is not None:
        lines.append(f"Signature : {'valid' if report.signed else 'UNSIGNED or untrusted'}")

    lines.append("")
    if report.capabilities:
        lines.append("Capabilities found in the binary:")
        for group, data in sorted(report.capabilities.items(),
                                  key=lambda kv: -{"critical": 3, "high": 2}.get(kv[1]["severity"], 1)):
            lines.append(f"  [{data['severity'].upper():8}] {group}: {data['description']}")
            lines.append(f"             {', '.join(str(i) for i in data['indicators'])}")
    else:
        lines.append("Capabilities: nothing notable found")

    if report.exfil:
        lines.append("")
        lines.append("Exfiltration endpoints:")
        for label, values in report.exfil.items():
            for value in values:
                lines.append(f"  {label}: {truncate(value, 100)}")
    if report.urls:
        lines.append("")
        lines.append(f"URLs ({len(report.urls)} found, first 10):")
        lines.extend(f"  {truncate(url, 100)}" for url in report.urls[:10])
    if report.ips:
        lines.append(f"IPs  : {', '.join(report.ips[:10])}")
    for note in report.notes:
        lines.append(f"Note      : {note}")

    lines.append("")
    lines.append(f"VERDICT   : {report.verdict.upper()} (score {report.score})")
    if not report.is_pe:
        lines.append("            Static triage is designed for Windows executables.")
    return "\n".join(lines)
