"""Trust drift — catching the day a program you trusted stops deserving it.

Every layer in Candy that works well works by *identity*: this name, this
hash, this publisher, this domain. An exit scam defeats all of them at once
and by construction. The executor that ships a stealer in v2.1 has the same
name it had in v2.0, the same site, often the same signing certificate, and
the user has already clicked "trust this" — so name matching passes,
reputation passes, and consent passes.

There is no way to detect the intent behind an update. There is a way to
detect the *update*, and to stop trust from surviving it.

That is all this module does. When you trust something by name or by path,
Candy records the hash of the file that was actually there at that moment.
Later — on demand, on download, or on a schedule — it re-hashes and reports
anything that changed. A trusted binary that changed is not proof of anything.
It is the one observable the exit-scam case always produces, and it is the
difference between "you trusted this program forever" and "you trusted this
build."

The firewall allowlist has always worked this way (``verify_allowlist``
revokes a program whose bytes changed). This applies the same discipline to
the whitelist, which previously matched on name alone — meaning *any* file
with a trusted name, anywhere on disk, was cleared.

Pinning a path is only half of it, and the weaker half. The way people
actually use an executor is to re-download it every week, because Roblox
updates break it; the new build lands in a different folder, or beside the old
one as ``krnl (1).exe``. Trust granted to the *name* then covers a file that
has never been seen before, at a path that has no pin — which is the exact
moment the exit scam pays off.

So a name carries a **lineage**: every build ever accepted under that name,
with what each one could do. A new build under a trusted name is not cleared
for sharing the name. It is compared against its own history, and what it has
*gained* is the finding — credential access, defence evasion, a Discord
webhook that no previous build contained. That comparison needs no signature,
no hash feed and no reputation, because it is the program's own past as the
baseline.

What this does not do: judge the new build. It surfaces the change and puts
the file back through normal assessment. If v2.1 is honest, it clears again in
one click and the new build joins the lineage.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import Config
from .util import basename, expand_path, normalize_path, sha256_file, utc_stamp

# Whitelist fields whose match is *not* the file's identity. A "hashes" entry
# names the exact bytes, so it cannot drift; a name or a path is a label that
# some other file can inherit later.
DRIFTABLE_FIELDS = ("names", "paths")

# Extra weight the guard adds when a whitelisted file no longer matches the
# build that was trusted. High enough to clear the default reject threshold
# (60) on its own, because "the thing you trusted was replaced" deserves a
# look regardless of what else the file looks like.
DRIFT_SCORE = 70

# A file wearing a trusted name that has never been seen under that name
# before. Not damning on its own — it is the normal shape of an update — but
# it must never be a free pass.
UNKNOWN_BUILD_SCORE = 45

# What a new build gained over every previous build of the same program. This
# is the exit-scam signal proper: the capability was not there before, and the
# program has no honest reason to have acquired it. Weighted by how little
# business each capability has appearing in an update.
CAPABILITY_GAIN_SCORE = {
    "credentials": 90,
    "defence_evasion": 80,
    "roblox": 60,
    "injection": 55,
    "persistence": 45,
    "process_access": 30,
    "anti_analysis": 30,
    "download": 20,
}

# A build that gained an exfiltration channel — a Discord webhook, a Telegram
# bot, a pastebin drop — that no previous build of the same program contained.
# There is no benign reading of this one.
EXFIL_GAIN_SCORE = 100


@dataclass
class Pin:
    """The build of a file that was trusted, at the moment it was trusted."""

    path: str
    sha256: str
    field: str = "paths"
    subject: str = ""
    signed: bool | None = None
    pinned_at: str = ""
    size: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DriftFinding:
    path: str
    problem: str
    expected: str = ""
    found: str = ""
    subject: str = ""
    field: str = ""
    action: str = "reported"
    signed_before: bool | None = None
    signed_now: bool | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def summary(self) -> str:
        detail = (f" (trusted {self.expected[:16]}…, now {self.found[:16]}…)"
                  if self.expected and self.found else "")
        return f"{self.path}: {self.problem}{detail}"


@dataclass
class Build:
    """One build of a program, and what that build could do.

    ``capabilities`` are the triage API groups the binary imports; ``exfil``
    the hard-coded drop channels found in its strings. Together they are a
    coarse but honest statement of what the code is equipped for — and, unlike
    a hash, they can be compared across versions.
    """

    sha256: str
    first_seen: str = ""
    signed: bool | None = None
    capabilities: list[str] = field(default_factory=list)
    exfil: list[str] = field(default_factory=list)
    path: str = ""
    size: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TrustVerdict:
    """Whether whitelist trust actually applies to the file in front of us."""

    cleared: bool = False
    basis: str = ""                     # hashes | paths | names | ""
    score: int = 0
    reasons: list[str] = field(default_factory=list)
    clearances: list[str] = field(default_factory=list)
    drift: DriftFinding | None = None
    gained_capabilities: list[str] = field(default_factory=list)
    gained_exfil: list[str] = field(default_factory=list)
    known_builds: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {"cleared": self.cleared, "basis": self.basis, "score": self.score,
                "reasons": self.reasons, "clearances": self.clearances,
                "drift": self.drift.to_dict() if self.drift else None,
                "gained_capabilities": self.gained_capabilities,
                "gained_exfil": self.gained_exfil, "known_builds": self.known_builds}


@dataclass
class DriftReport:
    checked: int = 0
    findings: list[DriftFinding] = field(default_factory=list)
    missing: int = 0
    revoked: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.findings

    def to_dict(self) -> dict[str, Any]:
        return {"checked": self.checked, "missing": self.missing,
                "revoked": self.revoked,
                "findings": [f.to_dict() for f in self.findings]}


class TrustLedger:
    """Pins, and re-checks, the builds behind every non-hash trust entry."""

    def __init__(self, config: Config, log: Any = None, *,
                 signature_checker: Any = None) -> None:
        self.config = config
        self.log = log
        self.signature_checker = signature_checker
        self._cache: dict[str, Pin] | None = None
        self._lineage: dict[str, list[Build]] | None = None

    # ----------------------------------------------------------------- store
    @property
    def path(self) -> Path:
        return self.config.data_dir() / "trust-pins.json"

    def _read(self) -> dict[str, Any]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raw = {}
        return raw if isinstance(raw, dict) else {}

    def load(self) -> dict[str, Pin]:
        if self._cache is not None:
            return self._cache
        pins: dict[str, Pin] = {}
        for key, value in (self._read().get("pins") or {}).items():
            try:
                pins[key] = Pin(**value)
            except TypeError:
                continue
        self._cache = pins
        return pins

    def lineage(self) -> dict[str, list[Build]]:
        """Every build ever accepted, keyed by the program name it wore."""
        if self._lineage is not None:
            return self._lineage
        out: dict[str, list[Build]] = {}
        for name, builds in (self._read().get("lineage") or {}).items():
            collected: list[Build] = []
            for value in builds or []:
                try:
                    collected.append(Build(**value))
                except TypeError:
                    continue
            if collected:
                out[str(name).lower()] = collected
        self._lineage = out
        return out

    def save(self, pins: dict[str, Pin] | None = None,
             lineage: dict[str, list[Build]] | None = None) -> None:
        pins = self.load() if pins is None else pins
        lineage = self.lineage() if lineage is None else lineage
        payload = {"updated": utc_stamp(),
                   "pins": {key: pin.to_dict() for key, pin in pins.items()},
                   "lineage": {name: [build.to_dict() for build in builds]
                               for name, builds in lineage.items()}}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        self._cache = pins
        self._lineage = lineage

    @staticmethod
    def key_for(path: str | Path) -> str:
        return normalize_path(path)

    # ------------------------------------------------------------------ pin
    def pin(self, path: str | Path, *, field: str = "paths",
            subject: str = "") -> Pin | None:
        """Record the build of one file. Returns None if it cannot be read."""
        target = Path(path)
        if not target.is_file():
            return None
        digest = sha256_file(target, max_bytes=None)
        if not digest:
            return None
        try:
            size = target.stat().st_size
        except OSError:
            size = 0
        signed = None
        if self.signature_checker is not None:
            try:
                signed = self.signature_checker(str(target))
            except Exception:  # noqa: BLE001 - a checker failure is not a verdict
                signed = None
        pin = Pin(path=str(target), sha256=digest, field=field,
                  subject=subject or str(target), signed=signed,
                  pinned_at=utc_stamp(), size=size)
        pins = self.load()
        pins[self.key_for(target)] = pin
        self.save(pins)
        # Trusting a file also enrols this build in the program's history, so a
        # later build of the same name can be compared against it.
        capabilities, exfil = profile_of(target)
        self.record_build(basename(str(target)), target, digest, capabilities=capabilities,
                          exfil=exfil, signed=signed, size=size)
        self._write_log("trust_pinned", path=str(target), sha256=digest, field=field)
        return pin

    def accept(self, path: str | Path) -> Build | None:
        """Record a build as one the user has decided is fine.

        This is the answer to a warning: "yes, I know this is a new version of
        something I trust, and I have looked at it." From then on that exact
        build clears, and the *next* new build is measured against it too.
        """
        target = Path(path)
        if not target.is_file():
            return None
        digest = sha256_file(target, max_bytes=None)
        if not digest:
            return None
        capabilities, exfil = profile_of(target)
        signed = None
        if self.signature_checker is not None:
            try:
                signed = self.signature_checker(str(target))
            except Exception:  # noqa: BLE001
                signed = None
        try:
            size = target.stat().st_size
        except OSError:
            size = 0
        return self.record_build(basename(str(target)), target, digest,
                                 capabilities=capabilities, exfil=exfil,
                                 signed=signed, size=size)

    def pin_whitelist(self, *, search_roots: Iterable[str] | None = None) -> int:
        """Pin every file the whitelist currently clears by path or by name.

        Path entries are resolved directly. Name entries have no path of their
        own, so they are only pinned if a file of that name is found under one
        of the roots — by default the paths already whitelisted. A name that
        matches nothing stays unpinned, and is reported by ``check`` as a trust
        entry that cannot be verified.
        """
        whitelist = self.config.get("whitelist") or {}
        pinned = 0

        for raw in whitelist.get("paths", []) or []:
            target = expand_path(str(raw))
            if target.is_file():
                if self.pin(target, field="paths", subject=str(raw)):
                    pinned += 1
            elif target.is_dir():
                for child in self._executables_under(target):
                    if self.pin(child, field="paths", subject=str(raw)):
                        pinned += 1

        names = {str(name).lower() for name in (whitelist.get("names") or [])}
        if names:
            roots = [expand_path(str(root)) for root in (search_roots or [])]
            roots += [expand_path(str(raw)) for raw in (whitelist.get("paths") or [])]
            seen: set[str] = set()
            for root in roots:
                base = root if root.is_dir() else root.parent
                for child in self._executables_under(base):
                    if basename(str(child)).lower() in names:
                        key = self.key_for(child)
                        if key in seen:
                            continue
                        seen.add(key)
                        if self.pin(child, field="names", subject=basename(str(child))):
                            pinned += 1
        return pinned

    @staticmethod
    def _executables_under(root: Path, *, limit: int = 4000) -> list[Path]:
        """Shallow, bounded walk. A trust ledger is not a scanner."""
        out: list[Path] = []
        try:
            for child in root.rglob("*"):
                if len(out) >= limit:
                    break
                if child.is_file() and child.suffix.lower() in (
                        ".exe", ".dll", ".sys", ".scr", ".com", ".ocx", ".msi"):
                    out.append(child)
        except (OSError, ValueError):
            pass
        return out

    # ---------------------------------------------------------------- check
    def pin_for(self, path: str | Path) -> Pin | None:
        return self.load().get(self.key_for(path))

    def drifted(self, path: str | Path, sha256: str | None = None) -> DriftFinding | None:
        """Has this specific file changed since it was trusted?

        Returns None when there is no pin (nothing was promised) or when the
        bytes still match. The download guard calls this on every whitelisted
        file, which is why it takes an already-computed digest.
        """
        pin = self.pin_for(path)
        if pin is None:
            return None
        current = sha256 or sha256_file(path, max_bytes=None)
        if not current or current == pin.sha256:
            return None
        signed_now = None
        if self.signature_checker is not None:
            try:
                signed_now = self.signature_checker(str(path))
            except Exception:  # noqa: BLE001
                signed_now = None
        return DriftFinding(
            path=str(path), problem="trusted binary changed since you trusted it",
            expected=pin.sha256, found=current, subject=pin.subject, field=pin.field,
            signed_before=pin.signed, signed_now=signed_now)

    # -------------------------------------------------------------- lineage
    @staticmethod
    def _program_key(name: str) -> str:
        return basename(str(name)).lower()

    def builds_for(self, name: str) -> list[Build]:
        return list(self.lineage().get(self._program_key(name), []))

    def record_build(self, name: str, path: str | Path, sha256: str, *,
                     capabilities: Iterable[str] = (), exfil: Iterable[str] = (),
                     signed: bool | None = None, size: int = 0) -> Build:
        """Add a build to a program's history, or return the one already there."""
        key = self._program_key(name)
        lineage = self.lineage()
        builds = lineage.setdefault(key, [])
        for build in builds:
            if build.sha256 == sha256:
                return build
        build = Build(sha256=sha256, first_seen=utc_stamp(), signed=signed,
                      capabilities=sorted(set(capabilities)), exfil=sorted(set(exfil)),
                      path=str(path), size=size)
        builds.append(build)
        self.save(lineage=lineage)
        self._write_log("build_recorded", program=key, sha256=sha256,
                        capabilities=build.capabilities, exfil=build.exfil)
        return build

    def capability_gain(self, name: str, capabilities: Iterable[str],
                        exfil: Iterable[str]) -> tuple[list[str], list[str]]:
        """What this build can do that no previous build of the program could.

        The baseline is the program's own history, which is why this works
        where signatures and reputation do not: it needs nobody else to have
        seen the malicious version first.
        """
        builds = self.builds_for(name)
        if not builds:
            return [], []
        known_caps: set[str] = set()
        known_exfil: set[str] = set()
        for build in builds:
            known_caps.update(build.capabilities)
            known_exfil.update(build.exfil)
        return (sorted(set(capabilities) - known_caps),
                sorted(set(exfil) - known_exfil))

    # ---------------------------------------------------------- trust ruling
    def evaluate(self, path: str | Path, sha256: str | None, *, basis: str,
                 capabilities: Iterable[str] = (), exfil: Iterable[str] = (),
                 signed: bool | None = None) -> TrustVerdict:
        """Decide whether a whitelist match actually covers *this* file.

        ``basis`` is what matched — hashes, paths or names — from
        ``Config.whitelist_match``. The three are not equally strong and this
        is where that difference is finally enforced.
        """
        target = Path(path)
        name = basename(str(target))
        verdict = TrustVerdict(basis=basis)

        # A hash entry names the bytes. Nothing to second-guess.
        if basis == "hashes":
            verdict.cleared = True
            verdict.clearances.append("on your whitelist by hash — these exact bytes")
            return verdict

        if basis == "paths":
            drift = self.drifted(target, sha256)
            if drift is None:
                verdict.cleared = True
                verdict.clearances.append("on your whitelist")
                return verdict
            verdict.drift = drift
            verdict.score += DRIFT_SCORE
            verdict.reasons.append(
                "this program is on your whitelist, but the file has changed since "
                "you trusted it"
                + (" and it is no longer validly signed"
                   if drift.signed_now is False and drift.signed_before is True else "")
                + f" (trusted {drift.expected[:12]}…, now {drift.found[:12]}…)")
            self._score_capability_gain(verdict, name, capabilities, exfil, target, sha256)
            return verdict

        # basis == "names": the weakest form, and the one people actually use
        # for anything they re-download. A name is not a program.
        builds = self.builds_for(name)
        verdict.known_builds = len(builds)
        if sha256 and any(build.sha256 == sha256 for build in builds):
            verdict.cleared = True
            verdict.clearances.append(
                f"on your whitelist by name, and this is a build of {name} you have "
                f"already accepted")
            return verdict

        if not builds:
            verdict.score += UNKNOWN_BUILD_SCORE
            verdict.reasons.append(
                f"'{name}' is trusted by name only, and no build of it has ever been "
                f"recorded — a name clears any file that takes it")
            return verdict

        verdict.score += UNKNOWN_BUILD_SCORE
        verdict.reasons.append(
            f"trusted by name, but this is a build of '{name}' you have never run "
            f"before ({len(builds)} previous build(s) recorded)")

        self._score_capability_gain(verdict, name, capabilities, exfil, target, sha256)
        return verdict

    def _score_capability_gain(self, verdict: "TrustVerdict", name: str,
                               capabilities: Iterable[str], exfil: Iterable[str],
                               target: Path, sha256: str | None) -> None:
        """Charge for what this build gained over every previous build.

        Kept separate because both the path case and the name case need it: a
        replaced binary and a re-downloaded one are the same event seen from
        two angles.
        """
        gained_caps, gained_exfil = self.capability_gain(name, capabilities, exfil)
        verdict.gained_capabilities = gained_caps
        verdict.gained_exfil = gained_exfil
        for capability in gained_caps:
            verdict.score += CAPABILITY_GAIN_SCORE.get(capability, 25)
            verdict.reasons.append(
                f"this build of '{name}' can {_capability_phrase(capability)} — no "
                f"previous build of it could")
        if gained_exfil:
            verdict.score += EXFIL_GAIN_SCORE
            verdict.reasons.append(
                f"this build of '{name}' contains an exfiltration channel no previous "
                f"build had: {', '.join(gained_exfil)}")
        if gained_caps or gained_exfil:
            self._write_log("capability_gain", program=name, path=str(target),
                            sha256=sha256, gained=gained_caps, exfil=gained_exfil)

    def check(self, *, revoke: bool = False) -> DriftReport:
        """Re-hash every pinned file and report what moved."""
        report = DriftReport()
        pins = self.load()
        survivors: dict[str, Pin] = {}

        for key, pin in pins.items():
            target = Path(pin.path)
            report.checked += 1
            if not target.is_file():
                report.missing += 1
                report.findings.append(DriftFinding(
                    path=pin.path, problem="trusted file is gone",
                    subject=pin.subject, field=pin.field, expected=pin.sha256,
                    action="pin kept"))
                survivors[key] = pin
                continue

            finding = self.drifted(target)
            if finding is None:
                survivors[key] = pin
                continue

            if pin.signed is True and finding.signed_now is False:
                finding.problem = ("trusted binary changed AND lost its valid "
                                   "signature — treat this as hostile until proven "
                                   "otherwise")
            if revoke:
                removed = self.config.remove_list_entry("whitelist", pin.field, pin.subject)
                finding.action = "trust revoked" if removed else "pin dropped"
                report.revoked.append(pin.subject)
                self._write_log("trust_revoked", path=pin.path, subject=pin.subject,
                                field=pin.field, expected=pin.sha256, found=finding.found)
            else:
                finding.action = "reported"
                survivors[key] = pin
                self._write_log("trust_drift", path=pin.path, expected=pin.sha256,
                                found=finding.found)
            report.findings.append(finding)

        if revoke:
            self.save(survivors)
        return report

    def forget(self, path: str | Path) -> bool:
        pins = self.load()
        if pins.pop(self.key_for(path), None) is None:
            return False
        self.save(pins)
        return True

    def unverifiable(self) -> list[str]:
        """Whitelist entries that no pin can ever cover.

        A ``names`` entry with no matching file on disk trusts a filename, not
        a program — anything that later takes that name inherits the trust.
        Worth saying out loud rather than leaving implied.
        """
        whitelist = self.config.get("whitelist") or {}
        pinned_names = {pin.subject.lower() for pin in self.load().values()
                        if pin.field == "names"}
        return [str(name) for name in (whitelist.get("names") or [])
                if str(name).lower() not in pinned_names]

    # ------------------------------------------------------------------ log
    def _write_log(self, event: str, **fields: Any) -> None:
        if self.log is not None:
            try:
                self.log.write({"event": event, "ts": time.time(), **fields})
            except Exception:  # noqa: BLE001 - logging must never break a check
                pass


def format_report(report: DriftReport, *, unverifiable: list[str] | None = None) -> str:
    lines = [f"Checked {report.checked} pinned build(s)."]
    if report.ok and not report.missing:
        lines.append("Every program you trusted is still the build you trusted.")
    for finding in report.findings:
        lines.append("")
        lines.append(f"  {finding.problem.upper()}")
        lines.append(f"    file     : {finding.path}")
        if finding.expected:
            lines.append(f"    trusted  : {finding.expected[:32]}…")
        if finding.found:
            lines.append(f"    now      : {finding.found[:32]}…")
        if finding.signed_before is not None or finding.signed_now is not None:
            lines.append(f"    signature: {_signed_word(finding.signed_before)} → "
                         f"{_signed_word(finding.signed_now)}")
        lines.append(f"    trust    : {finding.field} = {finding.subject}")
        lines.append(f"    action   : {finding.action}")
    if report.revoked:
        lines.append("")
        lines.append(f"Revoked trust for {len(report.revoked)} entry/entries. They will be "
                     f"assessed normally from now on.")
    if unverifiable:
        lines.append("")
        lines.append("Trusted by name only — these clear ANY file with that name, anywhere:")
        for name in unverifiable:
            lines.append(f"    {name}")
        lines.append("  Re-trust them by path or by hash instead.")
    return "\n".join(lines)


_CAPABILITY_PHRASES = {
    "credentials": "read saved passwords, cookies and browser credential stores",
    "defence_evasion": "disable or hide from security software",
    "roblox": "read or manipulate the Roblox client",
    "injection": "inject code into other running programs",
    "persistence": "install itself to survive a reboot",
    "process_access": "open and read the memory of other processes",
    "anti_analysis": "detect and evade debugging or analysis",
    "download": "download and run further payloads",
}


def profile_of(path: str | Path) -> tuple[list[str], list[str]]:
    """What a binary is equipped to do: API groups, and hard-coded drop channels.

    Returns empty lists for anything that is not a readable PE, which makes a
    non-executable simply carry no capability history rather than a misleading
    empty one.
    """
    try:
        from .triage import triage as run_triage

        report = run_triage(Path(path), signature_checker=None)
    except Exception:  # noqa: BLE001
        return [], []
    return sorted((report.capabilities or {}).keys()), sorted((report.exfil or {}).keys())


def _capability_phrase(capability: str) -> str:
    return _CAPABILITY_PHRASES.get(capability, f"use {capability} APIs")


def _signed_word(value: bool | None) -> str:
    return {True: "signed", False: "unsigned", None: "unknown"}[value]
