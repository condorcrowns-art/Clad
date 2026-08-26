"""One honest answer to "am I actually protected?".

Candy grew a lot of separately-configured pieces: a response mode, automatic
kill and quarantine, credential-store auditing, a download policy, ad and site
blocking, a startup baseline, kernel telemetry. Each of them reports its own
state, in its own section, and the ``doctor`` report ran to two hundred lines
before it got to any of them.

That is fine while everything is on. It failed the first time it mattered.
Candy v9 was unpacked into a new folder next to the old one, which is exactly
how anybody upgrades a portable tool. A new folder has a new ``config/``, so
it came up in **observe** mode with automatic response off, no startup
baseline, and no record of the credential stores it had armed — while the
person running it had every reason to think it was still set up, because
nothing said otherwise. They read the whole report and it never said the one
thing that mattered: *right now, this machine is not being defended.*

A security tool that is off must say so before it says anything else. This
module works out whether it is on, in one place, and states it in one line.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .config import Config

# Ordered worst-first: the first one that applies is the headline.
PROTECTED = "protected"
PARTIAL = "partial"
UNPROTECTED = "unprotected"


@dataclass
class Check:
    name: str
    ok: bool
    detail: str
    fix: str = ""
    weight: int = 1

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Posture:
    checks: list[Check] = field(default_factory=list)
    upgrade_from: str | None = None

    @property
    def failures(self) -> list[Check]:
        return [check for check in self.checks if not check.ok]

    @property
    def critical_failures(self) -> list[Check]:
        return [check for check in self.failures if check.weight >= 3]

    @property
    def state(self) -> str:
        if self.critical_failures:
            return UNPROTECTED
        return PARTIAL if self.failures else PROTECTED

    def to_dict(self) -> dict[str, Any]:
        return {"state": self.state, "upgrade_from": self.upgrade_from,
                "checks": [check.to_dict() for check in self.checks]}


def assess(config: Config, *, credguard_status: dict[str, Any] | None = None,
           adblock_domains: int | None = None,
           previous_install: Path | None = None) -> Posture:
    """Judge the whole posture from configuration and verified state.

    The inputs that cost a subprocess are passed in rather than fetched, so
    this stays a pure function and every branch is testable.
    """
    posture = Posture(upgrade_from=str(previous_install) if previous_install else None)

    mode = str(config.get("response.mode", "observe") or "observe")
    posture.checks.append(Check(
        "response mode", mode != "observe",
        f"{mode} — findings are recorded and nothing is stopped" if mode == "observe"
        else f"{mode} — Candy acts on what it finds",
        "candy level standard   (as administrator)", weight=3))

    auto_kill = bool(config.get("response.auto_kill", False))
    auto_quarantine = bool(config.get("response.auto_quarantine", False))
    posture.checks.append(Check(
        "automatic response", auto_kill or auto_quarantine,
        f"kill {'on' if auto_kill else 'off'}, "
        f"quarantine {'on' if auto_quarantine else 'off'}",
        "candy level standard   (as administrator)", weight=2))

    if credguard_status is not None:
        verified = credguard_status.get("verified_audited")
        present = len(credguard_status.get("stores_present") or [])
        count = len(verified) if verified is not None else len(
            credguard_status.get("armed") or [])
        posture.checks.append(Check(
            "credential stores", bool(count) or not present,
            f"{count} of {present} watched" if present
            else "no credential stores found on this machine",
            "candy credguard arm   (as administrator)", weight=3))

    if adblock_domains is not None:
        posture.checks.append(Check(
            "site blocking", adblock_domains > 0,
            f"{adblock_domains} domain(s) blocked",
            "candy adblock on   (as administrator)", weight=1))

    baseline = config.data_dir() / "autostart-baseline.json"
    posture.checks.append(Check(
        "startup baseline", baseline.is_file(),
        "saved — new startup entries stand out" if baseline.is_file()
        else "not taken, so a new startup entry looks like one more of hundreds",
        "candy baseline save", weight=2))

    policy = str(config.get("download.policy", "balanced") or "balanced")
    posture.checks.append(Check(
        "download policy", policy != "off",
        f"{policy}", "candy level standard", weight=2))

    return posture


# ------------------------------------------------------- finding an old install
# The folders people actually unpack a portable tool into. A previous install
# is recognised by a config file plus a data directory beside it.
SEARCH_HINTS = ("%USERPROFILE%\\Downloads", "%USERPROFILE%\\Desktop",
                "%USERPROFILE%\\Documents", "%USERPROFILE%")


def looks_like_install(root: Path) -> bool:
    """A Candy folder is one with a config file Candy wrote."""
    return (root / "config" / "config.json").is_file()


def find_previous_installs(current: Path, hints: list[str] | None = None,
                           *, limit: int = 40) -> list[Path]:
    """Other Candy folders on this machine, newest configuration first.

    Deliberately shallow — two levels below each hint. Walking a whole user
    profile to find an old copy of yourself is not worth the seconds or the
    disk churn, and anyone who put it somewhere unusual can pass the path.
    """
    from .util import expand_path

    current = current.resolve()
    roots: list[Path] = []
    for hint in (hints if hints is not None else list(SEARCH_HINTS)):
        base = expand_path(hint)
        if not base.is_dir():
            continue
        roots.append(base)

    found: list[Path] = []
    seen: set[Path] = set()
    for base in roots:
        for candidate in _shallow_dirs(base, depth=2, limit=limit):
            try:
                resolved = candidate.resolve()
            except OSError:
                continue
            if resolved == current or resolved in seen:
                continue
            if looks_like_install(resolved):
                seen.add(resolved)
                found.append(resolved)
    found.sort(key=_config_mtime, reverse=True)
    return found


def _config_mtime(root: Path) -> float:
    try:
        return (root / "config" / "config.json").stat().st_mtime
    except OSError:
        return 0.0


def _shallow_dirs(base: Path, *, depth: int, limit: int) -> list[Path]:
    out: list[Path] = []
    level = [base]
    for _ in range(depth):
        following: list[Path] = []
        for directory in level:
            try:
                children = [c for c in directory.iterdir() if c.is_dir()]
            except (OSError, PermissionError):
                continue
            for child in children[:limit]:
                out.append(child)
                following.append(child)
        level = following
        if len(out) > limit * depth:
            break
    return out


def format_banner(posture: Posture) -> str:
    """The headline, meant to be the first thing on screen."""
    if posture.state == PROTECTED:
        head = "PROTECTED — Candy is configured to act on what it finds."
    elif posture.state == PARTIAL:
        head = "PARTIALLY PROTECTED — the core is on, some layers are not."
    else:
        head = "NOT PROTECTED — Candy is watching and will not stop anything."

    lines = ["=" * 66, head, "=" * 66]
    for check in posture.checks:
        lines.append(f"  [{'ok ' if check.ok else 'OFF'}] {check.name:<20} {check.detail}")
    if posture.failures:
        lines.append("")
        lines.append("To turn the missing pieces on:")
        for fix in dict.fromkeys(check.fix for check in posture.failures if check.fix):
            lines.append(f"  {fix}")
    if posture.upgrade_from:
        lines.append("")
        lines.append(f"An earlier Candy folder is on this machine:")
        lines.append(f"  {posture.upgrade_from}")
        lines.append("Its settings, baseline and trusted programs did not come with "
                     "this copy.")
        lines.append("  candy import   — bring them across")
    return "\n".join(lines)


# ------------------------------------------------------------------- importing
# The files that carry a machine's configuration forward. Logs and quarantine are
# deliberately not in the list: quarantined files are evidence and belong with
# the install that took them, and a merged hash-chained log is not a chain.
IMPORT_FILES = (
    ("config/config.json", "settings, whitelist and response mode"),
    ("data/autostart-baseline.json", "the startup baseline"),
    ("data/trust-pins.json", "pinned builds of trusted programs"),
    ("data/firewall-allowlist.json", "the firewall allowlist"),
    ("data/kernel-policy.json", "kernel policy"),
    ("data/threats.json", "downloaded threat signatures"),
)


@dataclass
class ImportPlan:
    source: Path
    destination: Path
    items: list[tuple[str, str, bool]] = field(default_factory=list)

    @property
    def available(self) -> list[tuple[str, str, bool]]:
        return [item for item in self.items if item[2]]

    def to_dict(self) -> dict[str, Any]:
        return {"source": str(self.source), "destination": str(self.destination),
                "items": [{"file": f, "what": w, "present": p} for f, w, p in self.items]}


def plan_import(source: Path, destination: Path) -> ImportPlan:
    """What would be carried across, without touching anything."""
    plan = ImportPlan(source=source, destination=destination)
    for relative, description in IMPORT_FILES:
        plan.items.append((relative, description, (source / relative).is_file()))
    return plan


def is_untouched_default(path: Path) -> bool:
    """True when this config file is the one Candy writes on first run.

    ``Config.load`` creates a default config.json before any command runs, so
    by the time ``import`` executes, the destination config always exists —
    which meant the single most important file, the one holding the response
    mode and the whitelist, was the one file that never imported. Refusing to
    overwrite settings somebody chose is right; refusing to overwrite the
    defaults Candy wrote thirty milliseconds ago is not.
    """
    from .config import DEFAULTS

    try:
        import json

        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return data == DEFAULTS


def apply_import(plan: ImportPlan, *, overwrite: bool = False) -> list[str]:
    """Copy the planned files across. Returns what was written.

    Existing files are kept unless ``overwrite``: importing over settings
    somebody has already adjusted in the new install would undo their work
    silently, and this runs as a suggestion rather than as a repair. The one
    exception is a config file that is still exactly Candy's defaults, which
    is not somebody's work — see ``is_untouched_default``.
    """
    import shutil

    written: list[str] = []
    for relative, _description, present in plan.items:
        if not present:
            continue
        target = plan.destination / relative
        if target.is_file() and not overwrite:
            if not (relative.endswith("config.json") and is_untouched_default(target)):
                continue
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(plan.source / relative, target)
        except OSError:
            continue
        written.append(relative)
    return written


def format_import_plan(plan: ImportPlan, *, applied: list[str] | None = None) -> str:
    lines = [f"From : {plan.source}", f"To   : {plan.destination}", ""]
    if not plan.available:
        lines.append("That folder has no Candy settings to bring across.")
        return "\n".join(lines)
    for relative, description, present in plan.items:
        if not present:
            continue
        mark = "copied " if applied is not None and relative in applied else (
            "kept   " if applied is not None else "would copy")
        lines.append(f"  [{mark}] {relative:<34} {description}")
    skipped = [f for f, _w, p in plan.items
               if p and applied is not None and f not in applied]
    if skipped:
        lines.append("")
        lines.append("Files already present here were left alone. Use --overwrite to "
                     "replace them.")
    if applied is None:
        lines.append("")
        lines.append("Nothing has been changed. Run it again with --yes to copy.")
    return "\n".join(lines)
