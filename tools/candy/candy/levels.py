"""Protection levels — one dial, and the freedom to override any part of it.

Candy grew a setting per subsystem: response mode, guard policy, ASR, process
mitigations, firewall, DNS, ad blocking, credential auditing. Each is
defensible on its own and the combination is unusable, because knowing which
eight to turn on is exactly the expertise the person being robbed does not
have.

So there is one dial with four positions, and each position is a complete,
coherent posture rather than a marketing tier — every level states what it
costs as plainly as what it gives. Nothing here is hidden behind a paywall or
a "pro" edition; the levels differ only in how much they are willing to break.

**Levels are a starting point, not a cage.** A level sets a group of settings;
any of them can then be changed individually and Candy will report the result
honestly as "custom", never quietly snapping back. ``--only`` applies one area
of a level without touching the others, so a player who wants fortress-grade
download blocking but no firewall lockdown can have exactly that.

The areas — ``response``, ``downloads``, ``network``, ``kernel``, ``credentials``,
``scanning`` — are the seams people actually want to vary independently.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

from .config import Config

AREAS = ("response", "downloads", "network", "kernel", "credentials", "scanning")


@dataclass
class Level:
    name: str
    headline: str
    description: str
    breaks: str
    needs_admin: bool
    settings: dict[str, dict[str, Any]] = field(default_factory=dict)
    actions: dict[str, list[str]] = field(default_factory=dict)

    def flat_settings(self, areas: Iterable[str] | None = None) -> dict[str, Any]:
        chosen = set(areas) if areas else set(self.settings)
        out: dict[str, Any] = {}
        for area, values in self.settings.items():
            if area in chosen:
                out.update(values)
        return out


LEVELS: dict[str, Level] = {
    "relaxed": Level(
        name="relaxed",
        headline="Watch and tell me. Change nothing.",
        description=(
            "Every monitor runs and every detection is logged and shown, but Candy "
            "never kills, quarantines, blocks or edits a Windows setting on its own. "
            "For a first week on a machine you are not sure about, or for anyone who "
            "wants to see what it finds before letting it act."),
        breaks="Nothing. It cannot break anything, and it cannot stop anything either.",
        needs_admin=False,
        settings={
            "response": {"response.mode": "observe", "response.auto_kill": False,
                         "response.auto_quarantine": False, "response.auto_firewall": False,
                         "response.auto_block_domains": False,
                         "response.action_threshold": 75},
            "downloads": {"download_guard.policy": "off", "download_guard.triage": True},
            "network": {"adblock.enabled": False, "dns.enabled": False,
                        "phishing.enabled": True},
            "kernel": {},
            "credentials": {"credguard.enabled": False},
            "scanning": {"scan.on_schedule": False, "scan.profile": "light",
                         "scan.budget_minutes": 10},
        },
    ),
    "standard": Level(
        name="standard",
        headline="Block the obvious, ask about the rest. The default.",
        description=(
            "Known threats and renamed executors are quarantined as they land. "
            "Detections above the action threshold are acted on. Ads, trackers and "
            "malvertising are blocked, and the files that hold your Roblox and "
            "browser sessions are audited so you find out if something reads them. "
            "This is what most people should run."),
        breaks="Occasionally quarantines an unsigned tool you actually wanted. "
               "Restore it from the Quarantine tab and it stays restored.",
        needs_admin=True,
        settings={
            "response": {"response.mode": "enforce", "response.auto_kill": True,
                         "response.auto_quarantine": True, "response.auto_firewall": False,
                         "response.auto_block_domains": True,
                         "response.action_threshold": 75},
            "downloads": {"download_guard.policy": "balanced",
                          "download_guard.triage": True,
                          "download_guard.reject_score": 60},
            "network": {"adblock.enabled": True, "dns.enabled": False,
                        "phishing.enabled": True, "phishing.block_score": 70},
            "kernel": {},
            "credentials": {"credguard.enabled": True, "credguard.canaries": True},
            "scanning": {"scan.on_schedule": True, "scan.interval_minutes": 240,
                         "scan.profile": "quick", "scan.budget_minutes": 10},
        },
        actions={"network": ["adblock"], "kernel": ["asr"], "credentials": ["credguard"]},
    ),
    "strict": Level(
        name="strict",
        headline="Assume the machine is a target. Accept some friction.",
        description=(
            "Everything in standard, plus a filtering DNS resolver for every lookup "
            "on the machine, encrypted DNS forced in your browsers so malware cannot "
            "resolve around it, Defender's attack-surface reduction rules in block "
            "mode, and the Roblox client hardened so Windows itself refuses to load "
            "unsigned DLLs into it. The download threshold drops, so more marginal "
            "files get held."),
        breaks="Some DLL-based Roblox mods and overlays stop working — that is the "
               "hardening doing its job and it cannot tell yours from an executor's. "
               "A few older programs dislike the ASR rules.",
        needs_admin=True,
        settings={
            "response": {"response.mode": "enforce", "response.auto_kill": True,
                         "response.auto_quarantine": True, "response.auto_firewall": True,
                         "response.auto_block_domains": True,
                         "response.action_threshold": 60},
            "downloads": {"download_guard.policy": "balanced",
                          "download_guard.triage": True,
                          "download_guard.reject_score": 45},
            "network": {"adblock.enabled": True, "dns.enabled": True,
                        "phishing.enabled": True, "phishing.block_score": 60},
            "kernel": {"kernel.harden_roblox": True, "kernel.mitigation_profile": "game"},
            "credentials": {"credguard.enabled": True, "credguard.canaries": True},
            "scanning": {"scan.on_schedule": True, "scan.interval_minutes": 120,
                         "scan.profile": "quick", "scan.budget_minutes": 20},
        },
        actions={"network": ["adblock", "dns", "netharden"],
                 "kernel": ["asr", "harden_roblox"],
                 "credentials": ["credguard"]},
    ),
    "fortress": Level(
        name="fortress",
        headline="Nothing unsigned gets in. Expect to grant exceptions.",
        description=(
            "Every unsigned executable downloaded from the internet is rejected, "
            "whatever it claims to be — a valid signature is the only thing that "
            "clears it. Outbound traffic is default-deny against a learned "
            "allowlist. This is the posture for a machine that has already been "
            "compromised once, or one you cannot afford to lose."),
        breaks="A lot. Most indie software, mods and small tools are unsigned and "
               "will be quarantined. The firewall blocks anything you did not teach "
               "it about. You will be granting exceptions regularly — that is the "
               "trade, and it is a real one.",
        needs_admin=True,
        settings={
            "response": {"response.mode": "enforce", "response.auto_kill": True,
                         "response.auto_quarantine": True, "response.auto_firewall": True,
                         "response.auto_block_domains": True,
                         "response.action_threshold": 45},
            "downloads": {"download_guard.policy": "fortress",
                          "download_guard.triage": True,
                          "download_guard.reject_score": 40},
            "network": {"adblock.enabled": True, "dns.enabled": True,
                        "phishing.enabled": True, "phishing.block_score": 50},
            "kernel": {"kernel.harden_roblox": True, "kernel.mitigation_profile": "game"},
            "credentials": {"credguard.enabled": True, "credguard.canaries": True},
            "scanning": {"scan.on_schedule": True, "scan.interval_minutes": 60,
                         "scan.profile": "full", "scan.budget_minutes": 45},
        },
        actions={"network": ["adblock", "dns", "netharden"],
                 "kernel": ["asr", "harden_roblox"],
                 "credentials": ["credguard"],
                 "response": ["firewall_lockdown"]},
    ),
}

ORDER = ("relaxed", "standard", "strict", "fortress")


@dataclass
class LevelChange:
    key: str
    before: Any
    after: Any

    @property
    def changed(self) -> bool:
        return self.before != self.after


@dataclass
class LevelPlan:
    level: str
    areas: list[str]
    changes: list[LevelChange] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    needs_admin: bool = False

    @property
    def changed(self) -> list[LevelChange]:
        return [change for change in self.changes if change.changed]

    def to_dict(self) -> dict[str, Any]:
        return {"level": self.level, "areas": self.areas,
                "needs_admin": self.needs_admin, "actions": self.actions,
                "changes": [{"key": c.key, "before": c.before, "after": c.after}
                            for c in self.changed]}


def plan(config: Config, level_name: str,
         areas: Iterable[str] | None = None) -> LevelPlan:
    """What applying this level would change, without changing anything."""
    level = LEVELS.get(level_name)
    if level is None:
        raise ValueError(f"unknown level {level_name!r}; choose from {', '.join(ORDER)}")
    chosen = _validated_areas(areas) or list(level.settings)
    result = LevelPlan(level=level.name, areas=chosen, needs_admin=level.needs_admin)
    for key, value in level.flat_settings(chosen).items():
        result.changes.append(LevelChange(key, config.get(key), value))
    for area in chosen:
        result.actions.extend(level.actions.get(area, []))
    return result


def apply(config: Config, level_name: str, areas: Iterable[str] | None = None) -> LevelPlan:
    """Write the level's settings. System actions are the caller's job.

    Deliberately split: writing settings is safe and instant, while arming a
    firewall or an audit policy can fail, needs administrator, and has to be
    reported per step. ``plan.actions`` names what the caller should then run.
    """
    result = plan(config, level_name, areas)
    for change in result.changes:
        config.set(change.key, change.after)
    config.set("protection.level", level_name)
    config.set("protection.level_areas", result.areas)
    config.save()
    return result


def current(config: Config) -> str:
    """Which level the settings currently match, or 'custom'.

    Reads the settings rather than trusting the stored label, so changing one
    toggle by hand is reported as custom instead of the machine claiming a
    posture it no longer has.
    """
    for name in ORDER:
        level = LEVELS[name]
        if all(config.get(key) == value
               for key, value in level.flat_settings().items()):
            return name
    return "custom"


def describe(level_name: str) -> str:
    level = LEVELS[level_name]
    lines = [f"{level.name.upper()} — {level.headline}", "", level.description, "",
             f"What it breaks: {level.breaks}",
             f"Administrator : {'required' if level.needs_admin else 'not required'}"]
    return "\n".join(lines)


def format_plan(result: LevelPlan, *, current_level: str = "") -> str:
    lines = []
    if current_level:
        lines.append(f"Current level: {current_level}")
    lines.append(f"Applying '{result.level}'"
                 + (f" (areas: {', '.join(result.areas)})"
                    if len(result.areas) < len(AREAS) else ""))
    lines.append("")
    if not result.changed:
        lines.append("  Nothing would change — these settings are already in place.")
    for change in result.changed:
        lines.append(f"  {change.key:38} {_show(change.before)} → {_show(change.after)}")
    if result.actions:
        lines.append("")
        lines.append("System changes this level then applies:")
        for action in result.actions:
            lines.append(f"  {_ACTION_WORDS.get(action, action)}")
    if result.needs_admin:
        lines.append("")
        lines.append("Needs administrator. Without it the settings still save, but the "
                     "system changes above will fail.")
    return "\n".join(lines)


_ACTION_WORDS = {
    "adblock": "ad, tracker and malvertising blocking",
    "dns": "the local filtering DNS resolver",
    "netharden": "encrypted DNS forced in browsers, legacy name protocols off",
    "asr": "Defender attack-surface reduction rules in block mode",
    "harden_roblox": "Roblox hardened against unsigned DLL loads",
    "credguard": "auditing on the files that hold your sessions and passwords",
    "firewall_lockdown": "outbound firewall locked to your allowlist "
                         "(reverts itself in 2 minutes unless confirmed)",
}


def _validated_areas(areas: Iterable[str] | None) -> list[str]:
    if not areas:
        return []
    chosen = []
    for area in areas:
        if area not in AREAS:
            raise ValueError(f"unknown area {area!r}; choose from {', '.join(AREAS)}")
        chosen.append(area)
    return chosen


def _show(value: Any) -> str:
    if value is None:
        return "unset"
    if isinstance(value, bool):
        return "on" if value else "off"
    return str(value)
