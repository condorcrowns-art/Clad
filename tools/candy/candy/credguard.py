"""Credential-store protection — guarding the thing that actually gets stolen.

Everything else in Candy watches for the *executor*. But nobody loses an
account because an executor ran. They lose it because something read
``.ROBLOSECURITY`` out of the browser cookie database and posted it to a
Discord webhook — after which the attacker is logged in as them, on their own
machine's session, with no password and no 2FA prompt.

That read is the payload. Until now Candy could see the extension that had
*permission* to do it (``browserscan.py``) but nothing at all when a native
process did it directly, which is what every stealer bundled with a "free
executor" actually does.

Windows can see it, for free, and will report it — object-access auditing:

1. ``auditpol`` enables the *File System* audit subcategory.
2. A **SACL** is placed on the specific files that matter (an audit ACE, not a
   permission change — nothing is blocked, nothing is denied).
3. Every process that opens one generates **Security event 4663**, naming the
   process image and the access it asked for.

That is the kernel reporting on itself, which is the same bargain the rest of
Candy makes with Sysmon and Defender: no driver of our own, but the drivers
Microsoft already shipped will answer questions if asked properly.

Two things make the signal clean rather than noisy:

* **The browser reading its own cookie jar is normal.** Chrome opens
  ``Cookies`` constantly. So the owning application is expected for its own
  store, and anything else touching it is the finding.
* **Decoys.** A canary is a file that looks exactly like a credential store,
  in a plausible place, that no legitimate program knows exists. Nothing has
  a reason to open it. One access is not a heuristic — it is a stealer
  enumerating credential paths, and it is scored accordingly.

Off Windows every parser and score here still runs; only the arming is inert.
"""
from __future__ import annotations

import json
import os
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import Config
from .events import Detection
from .util import IS_WINDOWS, basename, expand_path, normalize_path, utc_stamp

# Security event id for "an object was accessed" — the audit record a SACL
# produces. 4656 (handle requested) and 4660 (deleted) are close relatives.
OBJECT_ACCESS_EVENT = 4663
HANDLE_REQUEST_EVENT = 4656
OBJECT_DELETED_EVENT = 4660
AUDIT_EVENTS = (OBJECT_ACCESS_EVENT, HANDLE_REQUEST_EVENT, OBJECT_DELETED_EVENT)


@dataclass(frozen=True)
class Store:
    """A file worth auditing, and who is allowed to touch it."""

    label: str
    path: str
    owners: tuple[str, ...] = ()
    severity: str = "high"
    score: int = 90
    note: str = ""

    def owned_by(self, image: str) -> bool:
        return basename(image).lower() in self.owners


# The stores that matter to a Roblox player, in the order they get robbed.
# Owners are the processes with a legitimate reason to open each one; anything
# else is the finding.
CHROMIUM_OWNERS = ("chrome.exe", "msedge.exe", "brave.exe", "opera.exe",
                   "opera_gx.exe", "vivaldi.exe", "chromium.exe")
FIREFOX_OWNERS = ("firefox.exe", "librewolf.exe", "waterfox.exe")

STORES: tuple[Store, ...] = (
    Store("Roblox session storage",
          r"%LOCALAPPDATA%\Roblox\LocalStorage\appStorage.json",
          owners=("robloxplayerbeta.exe", "robloxstudiobeta.exe",
                  "robloxplayerinstaller.exe"),
          severity="critical", score=110,
          note="Holds the Roblox session. Reading it is account takeover with no "
               "password and no 2FA prompt."),
    Store("Chromium cookie database",
          r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies",
          owners=CHROMIUM_OWNERS, severity="critical", score=110,
          note="Contains .ROBLOSECURITY for every Roblox session in this browser."),
    Store("Chromium saved passwords",
          r"%LOCALAPPDATA%\Google\Chrome\User Data\Default\Login Data",
          owners=CHROMIUM_OWNERS, severity="critical", score=110),
    Store("Chromium encryption key",
          r"%LOCALAPPDATA%\Google\Chrome\User Data\Local State",
          owners=CHROMIUM_OWNERS, severity="high", score=90,
          note="The DPAPI-wrapped key that decrypts the cookie and password stores. "
               "Stealers take it together with the databases."),
    Store("Edge cookie database",
          r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Network\Cookies",
          owners=CHROMIUM_OWNERS, severity="critical", score=110),
    Store("Edge saved passwords",
          r"%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Login Data",
          owners=CHROMIUM_OWNERS, severity="critical", score=110),
    Store("Brave cookie database",
          r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Network\Cookies",
          owners=CHROMIUM_OWNERS, severity="critical", score=110),
    Store("Opera GX cookie database",
          r"%APPDATA%\Opera Software\Opera GX Stable\Network\Cookies",
          owners=CHROMIUM_OWNERS, severity="critical", score=110),
    Store("Firefox cookie database",
          r"%APPDATA%\Mozilla\Firefox\Profiles",
          owners=FIREFOX_OWNERS, severity="critical", score=110,
          note="cookies.sqlite, logins.json and key4.db all live under here."),
    Store("Discord session tokens",
          r"%APPDATA%\discord\Local Storage\leveldb",
          owners=("discord.exe", "discordptb.exe", "discordcanary.exe", "update.exe"),
          severity="high", score=90,
          note="A Discord token is the second thing taken, because it is how the "
               "attacker messages your friends with the same download."),
    Store("Exodus wallet",
          r"%APPDATA%\Exodus\exodus.wallet",
          owners=("exodus.exe",), severity="critical", score=110),
    Store("Electrum wallet",
          r"%APPDATA%\Electrum\wallets",
          owners=("electrum.exe",), severity="critical", score=110),
)

# Processes that legitimately touch everything: the OS itself, backup and
# indexing services, and Candy. Without this every machine reports its own
# antivirus reading the cookie jar.
SYSTEM_READERS = {
    "system", "svchost.exe", "searchindexer.exe", "searchprotocolhost.exe",
    "msmpeng.exe", "mssense.exe", "sensendr.exe", "backgroundtaskhost.exe",
    "explorer.exe", "taskhostw.exe", "compattelrunner.exe", "wmiprvse.exe",
    "onedrive.exe", "dllhost.exe", "csrss.exe", "lsass.exe", "smss.exe",
    "candy.exe", "python.exe", "pythonw.exe",
}

# Where a decoy is placed, and what it is named. The names are exactly what a
# stealer's path list contains, which is the whole point: it will find these
# before it finds the real ones, and nothing else has any reason to look.
CANARY_TARGETS: tuple[tuple[str, str], ...] = (
    (r"%LOCALAPPDATA%\Google\Chrome\User Data\Default", "Login Data.bak"),
    (r"%APPDATA%\discord\Local Storage", "leveldb.bak"),
    (r"%LOCALAPPDATA%\Roblox", "appStorage.backup.json"),
    (r"%USERPROFILE%\Documents", "wallet.dat"),
)

CANARY_MARKER = "CANDY-CANARY-DO-NOT-READ"

CANARY_BODY = (
    "{\n"
    '  "_comment": "' + CANARY_MARKER + '",\n'
    '  "_warning": "This file is a decoy placed by Candy. It contains no real\\n'
    'credentials. Nothing on this machine has any reason to open it, so any\\n'
    'program that does is enumerating credential stores.",\n'
    '  "roblosecurity": "_|WARNING:-DO-NOT-SHARE-THIS.--Candy-decoy|_0000000000",\n'
    '  "token": "candy.decoy.0000000000000000000000000",\n'
    '  "seed": "decoy decoy decoy decoy decoy decoy decoy decoy decoy decoy"\n'
    "}\n"
)


@dataclass
class AccessFinding:
    store: str
    object_name: str
    process_image: str
    process_id: int | None = None
    accesses: str = ""
    severity: str = "high"
    score: int = 0
    reasons: list[str] = field(default_factory=list)
    canary: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def summary(self) -> str:
        return (f"{basename(self.process_image) or 'an unknown process'} read "
                f"{self.store}")


@dataclass
class ArmResult:
    ok: bool
    armed: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    detail: str = ""

    def __str__(self) -> str:
        return (f"{'armed' if self.ok else 'NOT armed'}: {len(self.armed)} store(s)"
                + (f" — {self.detail}" if self.detail else ""))


def known_stores(config: Config | None = None) -> list[Store]:
    """Every store Candy knows about, including any the user added."""
    stores = list(STORES)
    if config is not None:
        for entry in config.get("credguard.extra_stores") or []:
            if isinstance(entry, dict) and entry.get("path"):
                stores.append(Store(
                    label=str(entry.get("label") or entry["path"]),
                    path=str(entry["path"]),
                    owners=tuple(str(o).lower() for o in entry.get("owners") or ()),
                    severity=str(entry.get("severity") or "high"),
                    score=int(entry.get("score") or 90)))
    return stores


def present_stores(config: Config | None = None) -> list[tuple[Store, Path]]:
    """Stores that actually exist on this machine, resolved to real paths."""
    out: list[tuple[Store, Path]] = []
    for store in known_stores(config):
        path = expand_path(store.path)
        if path.exists():
            out.append((store, path))
    return out


def match_store(object_name: str, config: Config | None = None) -> Store | None:
    """Which protected store an audited path belongs to, if any."""
    target = normalize_path(object_name)
    best: Store | None = None
    best_len = -1
    for store in known_stores(config):
        prefix = normalize_path(expand_path(store.path))
        if prefix and (target == prefix or target.startswith(prefix.rstrip("/") + "/")):
            # Longest match wins so a specific file beats its parent folder.
            if len(prefix) > best_len:
                best, best_len = store, len(prefix)
    return best


def is_canary(object_name: str) -> bool:
    name = basename(object_name).lower()
    return any(name == canary.lower() for _root, canary in CANARY_TARGETS)


class CredentialGuard:
    """Arms the audit, and turns audit records into findings."""

    def __init__(self, config: Config, log: Any = None) -> None:
        self.config = config
        self.log = log

    # ------------------------------------------------------------- assessment
    def assess(self, *, object_name: str, process_image: str,
               process_id: int | None = None, accesses: str = "") -> AccessFinding | None:
        """Judge one object-access record. Returns None when it is expected.

        Deliberately conservative about *who*: the owning application reading
        its own store is the overwhelming majority of these events, and a tool
        that cries wolf every time Chrome starts is a tool nobody keeps
        running.
        """
        canary = is_canary(object_name)
        store = match_store(object_name, self.config)
        if store is None and not canary:
            return None

        image = basename(process_image).lower()
        if image in SYSTEM_READERS:
            return None
        if self.config.is_whitelisted(name=image, path=process_image):
            return None
        for allowed in self.config.get("credguard.allow_processes") or []:
            if image == basename(str(allowed)).lower():
                return None

        if canary:
            finding = AccessFinding(
                store="decoy credential file", object_name=object_name,
                process_image=process_image, process_id=process_id,
                accesses=accesses, severity="critical", score=130, canary=True)
            finding.reasons.append(
                f"{basename(process_image) or 'a process'} opened a decoy credential "
                f"file. Nothing on this machine has any legitimate reason to know it "
                f"exists — this is a program enumerating credential stores.")
            return finding

        if store.owned_by(image):
            return None

        finding = AccessFinding(
            store=store.label, object_name=object_name, process_image=process_image,
            process_id=process_id, accesses=accesses,
            severity=store.severity, score=store.score)
        finding.reasons.append(
            f"{basename(process_image) or 'an unknown process'} opened the "
            f"{store.label}, which belongs to "
            + (", ".join(store.owners) if store.owners else "another application"))
        if store.note:
            finding.reasons.append(store.note)
        return finding

    def from_event(self, record: dict[str, Any]) -> AccessFinding | None:
        """Assess one parsed Security-channel record."""
        if record.get("event_id") not in AUDIT_EVENTS:
            return None
        data = record.get("data") or {}
        object_name = data.get("ObjectName") or ""
        if not object_name:
            return None
        pid_raw = data.get("ProcessId") or ""
        try:
            pid = int(str(pid_raw), 0) if pid_raw else None
        except ValueError:
            pid = None
        return self.assess(object_name=object_name,
                           process_image=data.get("ProcessName") or "",
                           process_id=pid,
                           accesses=data.get("AccessList") or data.get("AccessMask") or "")

    def to_detection(self, finding: AccessFinding) -> Detection:
        return Detection(
            source="credguard",
            kind="canary_access" if finding.canary else "credential_access",
            subject=finding.object_name,
            message=finding.summary() + " — " + finding.reasons[0],
            severity=finding.severity,
            path=finding.object_name,
            pid=finding.process_id,
            process_name=basename(finding.process_image),
            signature_id="credguard.canary" if finding.canary else "credguard.store",
            evidence=finding.to_dict(),
        )

    # ------------------------------------------------------------------ arming
    def status(self, *, verify: bool = True) -> dict[str, Any]:
        """What is actually being watched, checked against the machine.

        ``armed`` used to be read straight out of config.json. That is a note
        Candy wrote to itself, not a fact about the machine, and the two come
        apart in the ordinary case: copy Candy to a new folder for an upgrade
        and the note is gone while every audit rule is still sitting on the
        files. The report then said "0 store(s)" over a fully armed machine —
        and it would just as happily have said "11" over a machine whose
        rules had been stripped, which is the direction that gets someone
        robbed.

        So the SACLs are read back. ``verify=False`` skips that for callers
        that cannot afford a PowerShell round trip.
        """
        present = present_stores(self.config)
        canaries = [path for path in self._canary_paths() if path.is_file()]
        recorded = [str(label) for label in (self.config.get("credguard.armed") or [])]
        paths = [path for _store, path in present] + canaries
        verified = verified_audited_paths(paths) if (verify and IS_WINDOWS) else None
        return {
            "platform": "windows" if IS_WINDOWS else "not windows (arming is inert)",
            "stores_known": len(known_stores(self.config)),
            "stores_present": [store.label for store, _path in present],
            "canaries_planted": [str(path) for path in canaries],
            "audit_enabled": self._audit_enabled(),
            "armed": recorded,
            "verified_audited": (sorted(verified) if verified is not None else None),
            "paths_checked": [str(path) for path in paths],
        }

    def _audit_enabled(self) -> bool | None:
        if not IS_WINDOWS:
            return None
        out = _run(["auditpol", "/get", "/subcategory:File System"])
        if out is None:
            return None
        return "Success" in out

    def arm(self, *, canaries: bool = True) -> ArmResult:
        """Turn on file-system auditing and place audit ACEs on every store.

        Nothing is blocked and no permission is changed — a SACL only asks the
        kernel to write a log line. Reversible with ``disarm()``.
        """
        if not IS_WINDOWS:
            return ArmResult(False, detail="object-access auditing is Windows-only; "
                                           "the analysis still runs off Windows")

        result = ArmResult(True)
        policy = _run(["auditpol", "/set", "/subcategory:File System",
                       "/success:enable", "/failure:enable"])
        if policy is None:
            return ArmResult(False, detail="auditpol failed — run as administrator")

        errors: list[str] = []
        for store, path in present_stores(self.config):
            ok, detail = _set_audit_ace(path)
            if ok:
                result.armed.append(store.label)
            else:
                result.skipped.append(f"{store.label} ({path})")
                if detail:
                    errors.append(detail)

        if canaries:
            for path in self.plant_canaries():
                ok, detail = _set_audit_ace(path)
                if ok:
                    result.armed.append(f"decoy {path.name}")
                elif detail:
                    errors.append(detail)

        # Arming nothing is a failure, not a quiet success. Reporting "armed"
        # over zero audited stores is how a completely invalid command line
        # went unnoticed — say so, and say what Windows said.
        result.ok = bool(result.armed)
        self.config.set("credguard.armed", result.armed)
        self.config.set("credguard.enabled", bool(result.armed))
        self.config.save()
        self._write_log("credguard_armed", armed=result.armed, skipped=result.skipped,
                        errors=errors[:5])
        if result.armed:
            result.detail = (f"{len(result.armed)} audited"
                             + (f", {len(result.skipped)} could not be"
                                if result.skipped else ""))
        else:
            first = errors[0].splitlines()[0][:200] if errors else ""
            result.detail = (
                f"nothing could be audited ({len(result.skipped)} store(s) tried). "
                f"Setting an audit rule needs the 'Manage auditing and security log' "
                f"privilege, which an elevated prompt normally has."
                + (f" Windows said: {first}" if first else ""))
        return result

    def disarm(self, *, remove_canaries: bool = True) -> ArmResult:
        if not IS_WINDOWS:
            return ArmResult(True, detail="nothing to disarm off Windows")
        result = ArmResult(True)
        for store, path in present_stores(self.config):
            if _clear_audit_ace(path):
                result.armed.append(store.label)
        if remove_canaries:
            for path in self._canary_paths():
                _clear_audit_ace(path)
                try:
                    path.unlink()
                except OSError:
                    pass
        _run(["auditpol", "/set", "/subcategory:File System",
              "/success:disable", "/failure:disable"])
        self.config.set("credguard.armed", [])
        self.config.set("credguard.enabled", False)
        self.config.save()
        self._write_log("credguard_disarmed")
        result.detail = "audit ACEs removed"
        return result

    # ----------------------------------------------------------------- canaries
    def _canary_paths(self) -> list[Path]:
        out: list[Path] = []
        for root, name in CANARY_TARGETS:
            directory = expand_path(root)
            out.append(directory / name)
        return out

    def plant_canaries(self) -> list[Path]:
        """Write decoy credential files. Returns the ones now on disk."""
        planted: list[Path] = []
        for path in self._canary_paths():
            try:
                if not path.parent.is_dir():
                    continue
                if not path.is_file():
                    path.write_text(CANARY_BODY, encoding="utf-8")
                planted.append(path)
            except OSError:
                continue
        if planted:
            self._write_log("canaries_planted", paths=[str(p) for p in planted])
        return planted

    def _write_log(self, event: str, **fields: Any) -> None:
        if self.log is not None:
            try:
                self.log.write({"event": event, "ts": utc_stamp(), **fields})
            except Exception:  # noqa: BLE001
                pass


# ------------------------------------------------------------------- helpers
def _run_reporting(command: list[str], timeout: int = 60) -> tuple[bool, str]:
    """Like _run, but hands back *why* it failed.

    Discarding stderr is what let a completely invalid command line look like
    a quiet no-op for as long as it did.
    """
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=timeout,
                              check=False,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError) as exc:
        return False, str(exc)
    output = ((done.stdout or "") + (done.stderr or "")).strip()
    return done.returncode == 0, output


def _run(command: list[str], timeout: int = 30) -> str | None:
    try:
        completed = subprocess.run(command, capture_output=True, text=True,
                                   timeout=timeout, check=False,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    return completed.stdout


def ps_literal(value: str) -> str:
    """A PowerShell single-quoted literal. Interior quotes are doubled."""
    return "'" + str(value).replace("'", "''") + "'"


def audit_script(path: str | Path, *, directory: bool) -> str:
    """PowerShell that adds a read-audit ACE to a file or folder's SACL.

    icacls cannot do this. It has no /setaudit switch — that was invented,
    every call exited non-zero, and the failure was swallowed, so arming
    reported success having audited nothing. Set-Acl with an audit rule is
    the actual mechanism, and it needs the SeSecurityPrivilege that comes with
    an elevated token.

    A folder gets ContainerInherit+ObjectInherit so the databases inside it
    are covered; a file takes no inheritance flags at all, which Windows
    rejects if you pass them.
    """
    literal = ps_literal(str(path))
    rule = (f"New-Object System.Security.AccessControl.FileSystemAuditRule("
            f"'Everyone','Read',"
            + ("'ContainerInherit,ObjectInherit','None'," if directory else "")
            + f"'Success,Failure')")
    return (
        "$ErrorActionPreference='Stop'; "
        f"$acl = Get-Acl -LiteralPath {literal} -Audit; "
        f"$rule = {rule}; "
        "$acl.AddAuditRule($rule); "
        f"Set-Acl -LiteralPath {literal} -AclObject $acl"
    )


def unaudit_script(path: str | Path) -> str:
    literal = ps_literal(str(path))
    return (
        "$ErrorActionPreference='Stop'; "
        f"$acl = Get-Acl -LiteralPath {literal} -Audit; "
        "$acl.GetAuditRules($true,$false,[System.Security.Principal.NTAccount]) | "
        "ForEach-Object { [void]$acl.RemoveAuditRule($_) }; "
        f"Set-Acl -LiteralPath {literal} -AclObject $acl"
    )


def audit_command(path: str | Path, *, directory: bool = False) -> list[str]:
    """The full command line, split out so the shape stays testable."""
    return ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
            "-Command", audit_script(path, directory=directory)]


def _set_audit_ace(path: Path) -> tuple[bool, str]:  # pragma: no cover - Windows only
    ok, output = _run_reporting(audit_command(path, directory=path.is_dir()))
    return ok, output


def _clear_audit_ace(path: Path) -> bool:  # pragma: no cover - Windows only
    ok, _output = _run_reporting(
        ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
         "-Command", unaudit_script(path)])
    return ok


def audit_query_script(paths: list[str]) -> str:
    """PowerShell that reports which of these paths carry a read-audit rule.

    One invocation for every path, because twelve PowerShell starts is most
    of a second each and this runs inside ``doctor``. Prints one line per
    audited path and stays silent about the rest; a path that cannot be read
    is simply not audited as far as anyone can tell from here.
    """
    literals = ", ".join(ps_literal(path) for path in paths)
    return (
        "$ErrorActionPreference='SilentlyContinue'; "
        f"foreach ($p in @({literals})) {{ "
        "  $acl = Get-Acl -LiteralPath $p -Audit; "
        "  if ($acl -eq $null) { continue } "
        "  $rules = $acl.GetAuditRules($true,$true,"
        "[System.Security.Principal.NTAccount]); "
        "  foreach ($r in $rules) { "
        "    if ($r.FileSystemRights.ToString() -match 'Read' -and "
        "        $r.AuditFlags.ToString() -match 'Success') { "
        "      Write-Output $p; break } } }"
    )


def parse_audit_query(output: str, paths: list[str]) -> set[str]:
    """Match the script's output back to the paths that were asked about.

    Compared case-insensitively: Windows hands paths back in whatever case
    the filesystem stored them, which is not always the case they were asked
    in, and a case mismatch here would report a fully armed machine as bare.
    """
    listed = {line.strip().strip('"').lower()
              for line in (output or "").splitlines() if line.strip()}
    return {path for path in paths if str(path).lower() in listed}


def verified_audited_paths(paths: list[Path] | list[str]) -> set[str]:  # pragma: no cover
    """The subset of these paths that really carry a read-audit rule."""
    wanted = [str(path) for path in paths]
    if not wanted:
        return set()
    output = _run(["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy",
                   "Bypass", "-Command", audit_query_script(wanted)], timeout=90)
    if output is None:
        return set()
    return parse_audit_query(output, wanted)


def format_status(status: dict[str, Any]) -> str:
    lines = [f"Platform        : {status['platform']}",
             f"Stores known    : {status['stores_known']}",
             f"Present here    : {len(status['stores_present'])}"]
    for label in status["stores_present"]:
        lines.append(f"                  {label}")
    audit = status["audit_enabled"]
    lines.append("File auditing   : "
                 + {True: "ON", False: "OFF", None: "unknown"}[audit])
    verified = status.get("verified_audited")
    if verified is None:
        lines.append(f"Audited now     : {len(status['armed'])} recorded "
                     f"(not verified against the machine)")
    else:
        lines.append(f"Audited now     : {len(verified)} path(s), read back from the "
                     f"files themselves")
        recorded = len(status.get("armed") or [])
        if not verified and status.get("paths_checked"):
            lines.append("                  nothing is being watched — run "
                         "'candy credguard arm' as administrator")
        elif recorded and len(verified) < recorded:
            lines.append(f"                  {recorded} were armed earlier; "
                         f"{recorded - len(verified)} no longer carry the rule")
        elif not recorded and verified:
            lines.append("                  armed by an earlier install — the rules "
                         "are on the files, this copy of Candy just had no record")
    lines.append(f"Decoys planted  : {len(status['canaries_planted'])}")
    for path in status["canaries_planted"]:
        lines.append(f"                  {path}")
    return "\n".join(lines)
