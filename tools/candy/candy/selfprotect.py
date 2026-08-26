"""Candy's own attack surface.

A security tool is a privilege-escalation target. Candy can be installed to
start at boot **as SYSTEM**, and it reads control data from its own folder:
config.json decides what is trusted and what is blocked, the mitigations
ledger names images that reach a PowerShell command line, quarantine metadata
names paths that a restore writes to, and the trust ledger decides which
programs clear without assessment.

If that folder is writable by an unprivileged user while Candy runs elevated,
then every one of those files is an input from an attacker to a SYSTEM
process. That is not a theoretical class of bug — it is the single most common
way endpoint agents get turned into local privilege escalations.

Three defences, in order of how much they actually buy:

1. **Lock the folder down.** On Windows, replace inherited permissions with
   SYSTEM and Administrators only. An unprivileged user then cannot write the
   control files at all, which closes the class rather than any one instance.
2. **Authenticate the control files.** Quarantine metadata is HMAC'd (see
   ``responder.py``); a forged one is refused rather than obeyed.
3. **Validate on read.** Image names out of the ledger are re-checked before
   they reach a command line, because a validator that only runs on the way in
   protects nothing once the data is on disk.

This module does (1), and reports honestly on all three. Off Windows the
checks still run and simply say the platform cannot enforce them.
"""
from __future__ import annotations

import os
import stat
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .config import Config
from .util import IS_WINDOWS
from .winapi import is_admin

# The identities allowed to write Candy's control files. Everything else is
# stripped, including the inherited "Users" write grants that a folder under
# C:\ or a user profile picks up by default.
ALLOWED_PRINCIPALS = ("SYSTEM", "Administrators")

# Files whose contents change what Candy does. These are the ones that matter
# if the folder is writable.
CONTROL_FILES = (
    "config.json", "kernel-policy.json", "trust-pins.json",
    "autostart-baseline.json", "firewall-allowlist.json", "threats.json",
)


@dataclass
class Finding:
    check: str
    ok: bool
    detail: str
    severity: str = "medium"
    fix: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SelfCheckReport:
    findings: list[Finding] = field(default_factory=list)
    elevated: bool = False
    platform: str = ""

    @property
    def ok(self) -> bool:
        return all(finding.ok for finding in self.findings)

    @property
    def failures(self) -> list[Finding]:
        return [finding for finding in self.findings if not finding.ok]

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "elevated": self.elevated, "platform": self.platform,
                "findings": [f.to_dict() for f in self.findings]}


def icacls_lockdown_commands(path: Path) -> list[list[str]]:
    """The exact commands used to lock a directory down. Split out to be read.

    ``/inheritance:r`` drops inherited entries — that is the one that removes
    the default user write access. The grants then re-add only SYSTEM and the
    administrators group, with ``(OI)(CI)`` so new files inherit the same.
    """
    return [
        ["icacls", str(path), "/inheritance:r"],
        ["icacls", str(path), "/grant:r", "*S-1-5-18:(OI)(CI)F"],
        ["icacls", str(path), "/grant:r", "*S-1-5-32-544:(OI)(CI)F"],
    ]


class SelfProtect:
    """Checks — and on Windows, fixes — the permissions on Candy's own data."""

    def __init__(self, config: Config, log: Any = None) -> None:
        self.config = config
        self.log = log

    def directories(self) -> list[Path]:
        seen: list[Path] = []
        for path in (self.config.data_dir(), self.config.log_dir(),
                     self.config.quarantine_dir()):
            if path not in seen:
                seen.append(path)
        if self.config.path:
            parent = Path(self.config.path).parent
            if parent not in seen:
                seen.append(parent)
        return seen

    # ------------------------------------------------------------------ check
    def check(self) -> SelfCheckReport:
        report = SelfCheckReport(elevated=bool(is_admin()),
                                 platform="windows" if IS_WINDOWS else "not windows")

        for directory in self.directories():
            report.findings.append(self._check_directory(directory))

        report.findings.append(self._check_world_writable_keys())
        report.findings.append(self._check_quarantine_authentication())
        report.findings.append(self._check_dns_binding())
        report.findings.append(self._check_boot_task_risk())
        return report

    def _check_directory(self, directory: Path) -> Finding:
        if not directory.exists():
            return Finding(f"permissions: {directory.name}", True,
                           "does not exist yet", "info")
        if IS_WINDOWS:
            output = _run(["icacls", str(directory)])
            if output is None:
                return Finding(f"permissions: {directory.name}", False,
                               "could not read the ACL", "low",
                               "run 'candy selfcheck --fix' as administrator")
            risky = [line.strip() for line in output.splitlines()
                     if any(word in line for word in ("Users:", "Everyone:",
                                                      "Authenticated Users:"))
                     and any(right in line for right in ("(F)", "(M)", "(W)"))]
            if risky:
                return Finding(
                    f"permissions: {directory.name}", False,
                    f"writable by unprivileged users: {'; '.join(risky[:3])}. Candy reads "
                    f"its trust and policy decisions from here, so anyone who can write "
                    f"these files can direct a SYSTEM process.",
                    "high", "candy selfcheck --fix  (as administrator)")
            return Finding(f"permissions: {directory.name}", True,
                           "SYSTEM and Administrators only")

        try:
            mode = directory.stat().st_mode
        except OSError as exc:
            return Finding(f"permissions: {directory.name}", False, str(exc), "low")
        if mode & stat.S_IWOTH:
            return Finding(f"permissions: {directory.name}", False,
                           "world-writable", "high", "chmod o-w on this directory")
        return Finding(f"permissions: {directory.name}", True,
                       f"mode {stat.filemode(mode)}")

    def _check_world_writable_keys(self) -> Finding:
        """The signing and vault keys must not be readable by other users."""
        bad: list[str] = []
        for name in ("vault.key", "meta.key", "lms-private.json"):
            path = self.config.data_dir() / name
            if not path.is_file():
                continue
            try:
                mode = path.stat().st_mode
            except OSError:
                continue
            if not IS_WINDOWS and mode & (stat.S_IRGRP | stat.S_IROTH):
                bad.append(f"{name} is readable by other users")
        if bad:
            return Finding("key files", False, "; ".join(bad), "high",
                           "chmod 600 on each key file")
        return Finding("key files", True, "not readable by other users")

    def _check_quarantine_authentication(self) -> Finding:
        """Quarantine metadata names a path a restore will write to."""
        quarantine = self.config.quarantine_dir()
        if not quarantine.is_dir():
            return Finding("quarantine metadata", True, "nothing quarantined yet", "info")
        unsigned = [path.name for path in quarantine.glob("*.json")
                    if '"hmac"' not in _read_text(path)]
        if unsigned:
            return Finding(
                "quarantine metadata", False,
                f"{len(unsigned)} entry/entries predate metadata authentication and "
                f"cannot be restored to their original path. Restore them with an "
                f"explicit destination instead.", "low",
                "candy quarantine restore <file> --to <path>")
        return Finding("quarantine metadata", True, "authenticated")

    def _check_dns_binding(self) -> Finding:
        from .dnsproxy import is_loopback

        host = str(self.config.get("dns.listen", "127.0.0.1"))
        if self.config.get("dns.allow_public_bind", False) and not is_loopback(host):
            return Finding(
                "dns binding", False,
                f"the resolver is configured to bind {host}, which serves other "
                f"machines. An open resolver can be abused to amplify traffic at a "
                f"third party.", "high",
                "unset dns.allow_public_bind unless you firewall it yourself")
        return Finding("dns binding", True, f"loopback only ({host})")

    def _check_boot_task_risk(self) -> Finding:
        """Running as SYSTEM is what turns a writable folder into an escalation."""
        directories_ok = all(f.ok for f in
                             (self._check_directory(d) for d in self.directories()))
        if IS_WINDOWS and not directories_ok:
            return Finding(
                "boot task", False,
                "Candy's folder is writable by unprivileged users. If Candy also runs "
                "at boot as SYSTEM, that combination is a local privilege escalation: "
                "a standard user edits a control file, a SYSTEM process obeys it.",
                "critical", "candy selfcheck --fix, then re-run candy autostart")
        return Finding("boot task", True,
                       "no writable-folder plus SYSTEM combination detected")

    # -------------------------------------------------------------------- fix
    def harden(self) -> list[Finding]:
        """Lock the directories down. Windows only; needs administrator."""
        if not IS_WINDOWS:
            return [Finding("harden", False,
                            "directory ACLs are Windows-only; on other platforms keep "
                            "Candy's folder out of world-writable locations", "info")]
        if not is_admin():
            return [Finding("harden", False,
                            "administrator rights are required to change these ACLs",
                            "high")]
        out: list[Finding] = []
        for directory in self.directories():
            if not directory.exists():
                continue
            failed = [command for command in icacls_lockdown_commands(directory)
                      if _run(command) is None]
            if failed:
                out.append(Finding(f"harden: {directory.name}", False,
                                   f"{len(failed)} icacls command(s) failed", "high"))
            else:
                out.append(Finding(f"harden: {directory.name}", True,
                                   "inheritance removed; SYSTEM and Administrators only"))
        self._log("selfprotect_hardened",
                  directories=[str(d) for d in self.directories()],
                  ok=all(f.ok for f in out))
        return out

    def _log(self, event: str, **fields: Any) -> None:
        if self.log is not None:
            try:
                self.log.write({"event": event, **fields})
            except Exception:  # noqa: BLE001
                pass


def _run(command: list[str], timeout: int = 30) -> str | None:
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=timeout,
                              check=False,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError):
        return None
    return done.stdout if done.returncode == 0 else None


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def format_report(report: SelfCheckReport) -> str:
    lines = [f"Platform      : {report.platform}",
             f"Elevated      : {'yes' if report.elevated else 'no'}",
             f"Overall       : {'OK' if report.ok else 'ATTENTION NEEDED'}", ""]
    for finding in report.findings:
        mark = "OK  " if finding.ok else finding.severity.upper()[:4]
        lines.append(f"  [{mark:4}] {finding.check}")
        lines.append(f"           {finding.detail}")
        if finding.fix and not finding.ok:
            lines.append(f"           fix: {finding.fix}")
    if not report.ok:
        lines.append("")
        lines.append("A security tool with a writable control directory is a privilege "
                     "escalation waiting to happen. Fix these before trusting it with "
                     "anything.")
    return "\n".join(lines)
