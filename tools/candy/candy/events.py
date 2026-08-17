"""Event types and the in-process bus every monitor publishes to."""
from __future__ import annotations

import queue
import threading
from dataclasses import dataclass, field, asdict
from typing import Any, Callable, Iterable

from .util import utc_stamp

# Severity buckets. The number is the score a single hit contributes; the
# engine sums hits per subject and compares against the action threshold.
SEVERITY_SCORES = {
    "info": 5,
    "low": 20,
    "medium": 45,
    "high": 75,
    "critical": 100,
}

SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"]


def score_for(severity: str) -> int:
    return SEVERITY_SCORES.get(severity, SEVERITY_SCORES["low"])


def severity_for(score: int) -> str:
    """Inverse of :func:`score_for` — the highest bucket the score reaches."""
    result = "info"
    for name in SEVERITY_ORDER:
        if score >= SEVERITY_SCORES[name]:
            result = name
    return result


@dataclass
class Detection:
    """One thing a monitor noticed.

    ``subject`` is what the detection is *about* (a process image path, a file
    path, a remote IP). Detections that share a subject are aggregated by the
    engine so three weak signals on one process can add up to an action.
    """

    source: str                       # process | file | network | behavior | scan
    kind: str                         # blacklist_name, unsigned_module, ...
    subject: str
    message: str
    severity: str = "low"
    score: int = 0
    pid: int | None = None
    process_name: str | None = None
    path: str | None = None
    remote: str | None = None
    signature_id: str | None = None
    sha256: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=utc_stamp)
    actions: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.score:
            self.score = score_for(self.severity)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def summary(self) -> str:
        who = self.process_name or self.path or self.subject
        return f"[{self.severity.upper()}] {who}: {self.message}"


class EventBus:
    """Fan-out publish/subscribe with a bounded queue per subscriber.

    Monitors run on their own threads and must never block on a slow consumer
    (the GUI, mainly), so each subscriber gets its own queue and overflow drops
    the oldest event rather than stalling detection.
    """

    def __init__(self, maxsize: int = 2000) -> None:
        self._maxsize = maxsize
        self._lock = threading.Lock()
        self._queues: list[queue.Queue] = []
        self._callbacks: list[Callable[[Detection], None]] = []
        self.dropped = 0

    def subscribe_queue(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=self._maxsize)
        with self._lock:
            self._queues.append(q)
        return q

    def subscribe(self, callback: Callable[[Detection], None]) -> None:
        """Register a synchronous callback. Exceptions are swallowed on purpose:
        a broken consumer must not take down the monitor thread."""
        with self._lock:
            self._callbacks.append(callback)

    def publish(self, detection: Detection) -> None:
        with self._lock:
            queues = list(self._queues)
            callbacks = list(self._callbacks)
        for q in queues:
            try:
                q.put_nowait(detection)
            except queue.Full:
                self.dropped += 1
                try:
                    q.get_nowait()
                    q.put_nowait(detection)
                except (queue.Empty, queue.Full):
                    pass
        for callback in callbacks:
            try:
                callback(detection)
            except Exception:  # noqa: BLE001 - consumer isolation
                pass

    def publish_many(self, detections: Iterable[Detection]) -> None:
        for detection in detections:
            self.publish(detection)
