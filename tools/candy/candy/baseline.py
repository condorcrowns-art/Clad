"""Autostart baseline — what is new since the machine was known good.

Persistence auditing answers "what runs at startup?" and scores each entry on
its own merits. That is the right question the first time and the wrong one
every time after, because the answer is thirty entries long on a normal
machine and twenty-nine of them are the same thirty entries as last week.

The useful question is **what changed**. A new scheduled task that appeared
between Tuesday and Wednesday is interesting at a severity no static rule can
assign to it, because the thing that makes it interesting is not what it looks
like — it is that it was not there before, and the user did not install
anything.

So: take a snapshot when the machine is believed clean, and diff against it.

* **Added** entries are the finding. Something arranged to survive a reboot.
* **Changed** entries matter as much: same Run key, different command line, is
  a hijack of an existing autostart rather than a new one.
* **Removed** entries are reported quietly. Uninstalling software removes
  autostarts constantly, but malware removing a competitor's — or its own,
  after a successful run — is real.

A baseline is only as good as the moment it was taken. If the machine was
already compromised, the compromise is in the baseline, which is why the
snapshot records when it was taken and every report says so out loud rather
than implying a clean bill of health.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import Config
from .persistence import PersistenceEntry, enumerate_all
from .util import normalize_path, utc_stamp

# Entries whose command line changes on every boot or every update, and would
# otherwise report a change on every single diff.
NOISY_SOURCES = {"bits_job"}


@dataclass
class BaselineEntry:
    source: str
    name: str
    command: str
    location: str = ""
    image: str = ""

    @property
    def key(self) -> str:
        """Identity of the autostart slot, independent of what it points at.

        Deliberately excludes the command, so replacing the target of an
        existing Run key reads as *changed* rather than as one removal plus one
        addition — the difference matters, because a hijack of something the
        user already trusts is worse than a new entry beside it.
        """
        return f"{self.source}::{self.location.lower()}::{self.name.lower()}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_entry(cls, entry: PersistenceEntry) -> "BaselineEntry":
        return cls(source=entry.source, name=entry.name, command=entry.command,
                   location=entry.location, image=entry.image)


@dataclass
class Snapshot:
    taken: str = ""
    entries: dict[str, BaselineEntry] = field(default_factory=dict)
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"taken": self.taken, "note": self.note,
                "entries": {key: entry.to_dict() for key, entry in self.entries.items()}}

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Snapshot":
        entries: dict[str, BaselineEntry] = {}
        for key, value in (raw.get("entries") or {}).items():
            try:
                entries[key] = BaselineEntry(**value)
            except TypeError:
                continue
        return cls(taken=str(raw.get("taken") or ""), entries=entries,
                   note=str(raw.get("note") or ""))


@dataclass
class Change:
    kind: str                       # added | removed | changed
    entry: BaselineEntry
    was: str = ""
    score: int = 0
    severity: str = "info"
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "entry": self.entry.to_dict(), "was": self.was,
                "score": self.score, "severity": self.severity, "reasons": self.reasons}


@dataclass
class DiffReport:
    baseline_taken: str = ""
    compared: str = ""
    changes: list[Change] = field(default_factory=list)
    unchanged: int = 0
    has_baseline: bool = True

    @property
    def added(self) -> list[Change]:
        return [c for c in self.changes if c.kind == "added"]

    @property
    def changed(self) -> list[Change]:
        return [c for c in self.changes if c.kind == "changed"]

    @property
    def removed(self) -> list[Change]:
        return [c for c in self.changes if c.kind == "removed"]

    @property
    def worst(self) -> str:
        order = ["info", "low", "medium", "high", "critical"]
        worst = "info"
        for change in self.changes:
            if order.index(change.severity) > order.index(worst):
                worst = change.severity
        return worst

    def to_dict(self) -> dict[str, Any]:
        return {"baseline_taken": self.baseline_taken, "compared": self.compared,
                "has_baseline": self.has_baseline, "unchanged": self.unchanged,
                "worst": self.worst,
                "changes": [c.to_dict() for c in self.changes]}


class BaselineStore:
    """Takes, keeps and compares autostart snapshots."""

    def __init__(self, config: Config, log: Any = None) -> None:
        self.config = config
        self.log = log

    @property
    def path(self) -> Path:
        return self.config.data_dir() / "autostart-baseline.json"

    def exists(self) -> bool:
        return self.path.is_file()

    def load(self) -> Snapshot | None:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return Snapshot.from_dict(raw) if isinstance(raw, dict) else None

    def capture(self, entries: Iterable[PersistenceEntry] | None = None,
                *, note: str = "") -> Snapshot:
        """Snapshot what runs at startup right now."""
        source = list(entries) if entries is not None else enumerate_all(self.config)
        snapshot = Snapshot(taken=utc_stamp(), note=note)
        for entry in source:
            item = BaselineEntry.from_entry(entry)
            snapshot.entries[item.key] = item
        return snapshot

    def save(self, snapshot: Snapshot) -> Path:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(snapshot.to_dict(), indent=2), encoding="utf-8")
        self._log("baseline_saved", entries=len(snapshot.entries), taken=snapshot.taken)
        return self.path

    def diff(self, entries: Iterable[PersistenceEntry] | None = None,
             analyzer: Any = None) -> DiffReport:
        """Compare the machine now against the saved baseline."""
        baseline = self.load()
        current = self.capture(entries)
        report = DiffReport(compared=current.taken)

        if baseline is None:
            report.has_baseline = False
            return report

        report.baseline_taken = baseline.taken
        for key, entry in current.entries.items():
            previous = baseline.entries.get(key)
            if previous is None:
                report.changes.append(self._score(Change("added", entry), analyzer))
            elif _normalise(previous.command) != _normalise(entry.command):
                if entry.source in NOISY_SOURCES:
                    report.unchanged += 1
                    continue
                report.changes.append(
                    self._score(Change("changed", entry, was=previous.command), analyzer))
            else:
                report.unchanged += 1

        for key, entry in baseline.entries.items():
            if key not in current.entries:
                report.changes.append(self._score(Change("removed", entry), analyzer))

        report.changes.sort(key=lambda change: -change.score)
        return report

    # ---------------------------------------------------------------- scoring
    def _score(self, change: Change, analyzer: Any) -> Change:
        """Weigh a change. Being new is the finding; what it is sharpens it."""
        if change.kind == "removed":
            change.score = 10
            change.severity = "info"
            change.reasons.append(
                "this autostart entry is gone. Usually an uninstall — occasionally "
                "malware tidying up after itself, or removing a competitor.")
            return change

        change.score = 45 if change.kind == "added" else 60
        change.reasons.append(
            "a new autostart entry appeared since the baseline was taken"
            if change.kind == "added" else
            f"an existing autostart entry now runs something different "
            f"(was: {change.was[:90]})")

        # What it points at is secondary, but it decides how loud to be.
        if analyzer is not None and change.entry.image:
            try:
                detections = analyzer.analyze_file(change.entry.image, event="baseline")
            except Exception:  # noqa: BLE001
                detections = []
            for detection in detections:
                change.score += detection.score
                change.reasons.append(detection.message)

        lowered = normalize_path(change.entry.image or change.entry.command)
        for marker, points, why in (
                ("/appdata/local/temp/", 40, "it runs from a temporary folder"),
                ("/downloads/", 35, "it runs from your Downloads folder"),
                ("/appdata/roaming/", 20, "it runs from AppData\\Roaming"),
                ("/programdata/", 20, "it runs from ProgramData"),
                ("powershell", 30, "it launches PowerShell"),
                ("mshta", 40, "it launches mshta, which runs remote script"),
                ("rundll32", 25, "it launches rundll32"),
                ("cmd.exe /c", 20, "it launches a shell command")):
            if marker in lowered:
                change.score += points
                change.reasons.append(why)

        change.severity = ("critical" if change.score >= 100 else
                           "high" if change.score >= 70 else
                           "medium" if change.score >= 40 else "low")
        return change

    def _log(self, event: str, **fields: Any) -> None:
        if self.log is not None:
            try:
                self.log.write({"event": event, "ts": utc_stamp(), **fields})
            except Exception:  # noqa: BLE001
                pass


def _normalise(command: str) -> str:
    return " ".join(str(command or "").split()).lower()


def format_diff(report: DiffReport) -> str:
    if not report.has_baseline:
        return ("No baseline has been taken on this machine.\n\n"
                "  candy baseline save\n\n"
                "Take one when you believe the machine is clean. Everything that "
                "appears afterwards is then visible as an addition rather than as one "
                "more line in a list of thirty.")

    lines = [f"Baseline taken : {report.baseline_taken}",
             f"Compared       : {report.compared}",
             f"Unchanged      : {report.unchanged} entry/entries", ""]

    if not report.changes:
        lines.append("Nothing has changed since the baseline.")
    else:
        lines.append(f"{len(report.added)} added, {len(report.changed)} changed, "
                     f"{len(report.removed)} removed.")

    for change in report.changes:
        lines.append("")
        lines.append(f"  [{change.severity.upper():8}] {change.kind.upper()} "
                     f"{change.entry.source}: {change.entry.name}")
        lines.append(f"             {change.entry.command[:100]}")
        if change.entry.location:
            lines.append(f"             in {change.entry.location}")
        for reason in change.reasons:
            lines.append(f"             — {reason}")

    lines.append("")
    lines.append("A baseline only proves what changed since it was taken. If the machine "
                 "was already compromised then, the compromise is in the baseline too.")
    return "\n".join(lines)
