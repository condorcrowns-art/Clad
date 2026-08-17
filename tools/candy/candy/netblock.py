"""Domain blocking through the Windows hosts file.

Candy has no packet filter and no network driver — writing one would need the
same signed-driver budget everything else here avoids. What it *can* do for
free is the two things Windows already offers:

* **hosts file** — point a domain at 0.0.0.0 so name resolution fails.
* **Windows Firewall** — block an IP outright (see ``responder.block_ip``).

Neither is a content filter. Neither inspects traffic. Together they stop a
machine from reaching a *named* or *addressed* destination, which is what
matters for an executor's download page or its C2 endpoint.

Every write is bounded by markers, backed up first, and fully reversible.
Candy never rewrites lines it did not add.
"""
from __future__ import annotations

import re
import shutil
import socket
import threading
from dataclasses import dataclass
from pathlib import Path

from .util import IS_WINDOWS, utc_stamp

BLOCK_START = "# === CANDY BLOCK START — do not edit inside this block ==="
BLOCK_END = "# === CANDY BLOCK END ==="

# Null route. 0.0.0.0 fails faster than 127.0.0.1 because nothing is listening.
SINKHOLE = "0.0.0.0"

WINDOWS_HOSTS = r"C:\Windows\System32\drivers\etc\hosts"

# Domains Candy refuses to block at any severity. Blocking these breaks
# Windows Update, activation, or the game the user is trying to protect —
# a bad signature must not be able to do that.
PROTECTED_DOMAINS = {
    "microsoft.com", "windowsupdate.com", "windows.com", "live.com", "msftncsi.com",
    "msftconnecttest.com", "office.com", "office365.com", "digicert.com", "verisign.com",
    "roblox.com", "rbxcdn.com", "roblox.cn",
    "localhost", "google.com", "cloudflare.com", "akamai.net", "akamaized.net",
}

# RFC 1123 hostname, at least two labels. Deliberately strict: everything that
# reaches this function ends up as a line in a system file.
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$"
)


@dataclass
class BlockResult:
    ok: bool
    detail: str
    domains: list[str]

    def __str__(self) -> str:
        return f"{'OK' if self.ok else 'FAILED'}: {self.detail}"


def normalize_domain(value: str) -> str | None:
    """Reduce user input to a bare hostname, or None if it is not one.

    Accepts a URL, a hostname with a port, or a bare domain; rejects IPs,
    wildcards, anything with whitespace, and anything that would inject a
    second line into the hosts file.
    """
    if not value:
        return None
    text = str(value).strip().lower()
    if "\n" in text or "\r" in text or "\t" in text:
        return None
    text = re.sub(r"^[a-z][a-z0-9+.-]*://", "", text)   # strip scheme
    text = text.split("/", 1)[0]                        # strip path
    text = text.split("@")[-1]                          # strip credentials
    text = text.split(":", 1)[0]                        # strip port
    text = text.rstrip(".")
    text = text.removeprefix("www.") if text.startswith("www.") else text
    if not _DOMAIN_RE.match(text):
        return None
    return text


def is_protected(domain: str) -> bool:
    """True if the domain, or a parent of it, is on the protected list."""
    domain = (domain or "").lower()
    parts = domain.split(".")
    for index in range(len(parts) - 1):
        if ".".join(parts[index:]) in PROTECTED_DOMAINS:
            return True
    return False


def parse_managed_block(text: str) -> list[str]:
    """Domains currently inside Candy's managed section of a hosts file."""
    domains: list[str] = []
    inside = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == BLOCK_START:
            inside = True
            continue
        if stripped == BLOCK_END:
            inside = False
            continue
        if inside and stripped and not stripped.startswith("#"):
            parts = stripped.split()
            if len(parts) >= 2:
                domains.extend(part for part in parts[1:] if not part.startswith("#"))
    # Preserve order, drop duplicates and the www. mirrors we add ourselves.
    seen: set[str] = set()
    unique = []
    for domain in domains:
        bare = domain[4:] if domain.startswith("www.") else domain
        if bare not in seen:
            seen.add(bare)
            unique.append(bare)
    return unique


def render_hosts(text: str, domains: list[str]) -> str:
    """Return the hosts file with Candy's managed block set to ``domains``.

    Everything outside the markers is preserved byte-for-byte. An empty list
    removes the block entirely, leaving the file as Candy found it.
    """
    lines = text.splitlines()
    output: list[str] = []
    inside = False
    for line in lines:
        stripped = line.strip()
        if stripped == BLOCK_START:
            inside = True
            continue
        if stripped == BLOCK_END:
            inside = False
            continue
        if not inside:
            output.append(line)

    while output and not output[-1].strip():
        output.pop()

    if domains:
        output.append("")
        output.append(BLOCK_START)
        output.append(f"# Managed by Candy. Updated {utc_stamp()}.")
        output.append("# Remove entries with: candy unblock-site <domain>")
        for domain in sorted(set(domains)):
            output.append(f"{SINKHOLE} {domain} www.{domain}")
        output.append(BLOCK_END)
    return "\n".join(output) + "\n"


class HostsBlocker:
    """Reads and writes the managed section of the hosts file."""

    def __init__(self, path: str | Path | None = None) -> None:
        self.path = Path(path) if path else Path(WINDOWS_HOSTS)
        self._lock = threading.Lock()

    # ----------------------------------------------------------------- read
    def available(self) -> tuple[bool, str]:
        """Can Candy write this file? Returns (ok, reason)."""
        if not self.path.exists():
            return False, f"hosts file not found at {self.path}"
        try:
            with self.path.open("a", encoding="utf-8"):
                pass
        except PermissionError:
            return False, "administrator rights are required to edit the hosts file"
        except OSError as exc:
            return False, f"hosts file is not writable: {exc}"
        return True, "writable"

    def blocked(self) -> list[str]:
        try:
            return parse_managed_block(self.path.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            return []

    # ---------------------------------------------------------------- write
    def _write(self, domains: list[str]) -> BlockResult:
        try:
            original = self.path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            return BlockResult(False, f"could not read {self.path}: {exc}", [])

        backup = self.path.with_suffix(self.path.suffix + ".candy-backup")
        if not backup.exists():
            # One pristine backup from before Candy ever touched the file.
            try:
                shutil.copy2(self.path, backup)
            except OSError:
                pass

        updated = render_hosts(original, domains)
        try:
            # Written in place rather than replaced: the hosts file has ACLs and
            # an ownership that a temp-file swap would silently discard.
            self.path.write_text(updated, encoding="utf-8")
        except PermissionError:
            return BlockResult(False, "permission denied — run Candy as administrator", [])
        except OSError as exc:
            return BlockResult(False, f"could not write {self.path}: {exc}", [])
        return BlockResult(True, f"{len(domains)} domain(s) in the managed block", domains)

    def block(self, domains: str | list[str]) -> BlockResult:
        """Add one or more domains to the managed block."""
        requested = [domains] if isinstance(domains, str) else list(domains)
        cleaned: list[str] = []
        rejected: list[str] = []
        for raw in requested:
            domain = normalize_domain(raw)
            if domain is None:
                rejected.append(f"{raw!r} is not a valid domain")
            elif is_protected(domain):
                rejected.append(f"{domain} is protected and will not be blocked")
            else:
                cleaned.append(domain)
        if not cleaned:
            return BlockResult(False, "; ".join(rejected) or "nothing to block", [])

        with self._lock:
            current = self.blocked()
            merged = sorted(set(current) | set(cleaned))
            result = self._write(merged)
        if result.ok:
            added = sorted(set(cleaned) - set(current))
            detail = f"blocked {', '.join(added)}" if added else "already blocked"
            if rejected:
                detail += f" (skipped: {'; '.join(rejected)})"
            return BlockResult(True, detail, merged)
        return result

    def unblock(self, domains: str | list[str]) -> BlockResult:
        requested = [domains] if isinstance(domains, str) else list(domains)
        targets = {normalize_domain(raw) for raw in requested} - {None}
        with self._lock:
            current = self.blocked()
            remaining = [domain for domain in current if domain not in targets]
            if len(remaining) == len(current):
                return BlockResult(False, "none of those domains were blocked by Candy", current)
            result = self._write(remaining)
        if result.ok:
            return BlockResult(True, f"unblocked {', '.join(sorted(targets))}", remaining)
        return result

    def clear(self) -> BlockResult:
        """Remove Candy's managed block entirely."""
        with self._lock:
            return self._write([])


def resolve(domain: str, *, timeout: float = 3.0) -> list[str]:
    """IP addresses for a domain, for firewall rules.

    Needed because a hosts-file block is bypassed by a browser doing its own
    DNS-over-HTTPS; a firewall rule on the address is not.
    """
    domain = normalize_domain(domain) or ""
    if not domain:
        return []
    previous = socket.getdefaulttimeout()
    try:
        socket.setdefaulttimeout(timeout)
        infos = socket.getaddrinfo(domain, None)
    except (OSError, UnicodeError):
        return []
    finally:
        socket.setdefaulttimeout(previous)
    addresses = {info[4][0] for info in infos}
    return sorted(addresses)


def hosts_path_for_platform(configured: str | None = None) -> Path:
    """The hosts file to use: configured value, or the platform default."""
    if configured:
        return Path(configured)
    if IS_WINDOWS:
        return Path(WINDOWS_HOSTS)
    return Path("/etc/hosts")
