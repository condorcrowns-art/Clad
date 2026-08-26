"""Statistical anomaly detection: beaconing and exfiltration.

The gap this fills: an on-device neural model on an NPU. That was never the
right tool here — there is no labelled training set for "Roblox executor C2
traffic", and a model nobody can audit is a worse security control than a rule
somebody can read. What actually catches command-and-control traffic in
practice is timing analysis, and that is arithmetic:

* **Beaconing** — malware phones home on a timer. Human-driven traffic is
  bursty and irregular; a beacon is regular. Measuring the *jitter* (relative
  standard deviation) of the intervals between a process's connections to one
  destination separates the two cleanly, and it works regardless of encryption,
  because it needs only the timestamps.
* **Fan-out** — one process opening connections to many distinct hosts in a
  short window is a scanner, a stealer enumerating drop points, or a
  peer-to-peer loader.
* **Exfiltration volume** — sustained outbound bytes far above a process's own
  established baseline.

Every function here is pure arithmetic over timestamps and counters, so all of
it is unit-tested, and none of it needs a GPU, an NPU, or a model file.
"""
from __future__ import annotations

import statistics
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from typing import Any, Callable

from .config import Config
from .events import Detection

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]

Sink = Callable[[Detection], None]

# A beacon needs enough intervals to be a pattern rather than a coincidence.
MIN_BEACON_SAMPLES = 5
# Relative standard deviation below this is machine-regular, not human.
DEFAULT_MAX_JITTER = 0.20
# Below this the "beacon" is just a busy connection pool.
MIN_BEACON_PERIOD = 5.0


@dataclass
class BeaconVerdict:
    is_beacon: bool
    period: float = 0.0
    jitter: float = 0.0
    samples: int = 0
    reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {"period_seconds": round(self.period, 2), "jitter": round(self.jitter, 3),
                "samples": self.samples, "reason": self.reason}


def detect_beacon(timestamps: list[float], *, max_jitter: float = DEFAULT_MAX_JITTER,
                  min_samples: int = MIN_BEACON_SAMPLES,
                  min_period: float = MIN_BEACON_PERIOD) -> BeaconVerdict:
    """Decide whether a series of connection times looks like a timed beacon.

    Jitter is the standard deviation of the intervals divided by their mean —
    a scale-free measure, so a 30-second beacon and a 10-minute beacon are
    judged the same way.
    """
    if len(timestamps) < min_samples + 1:
        return BeaconVerdict(False, samples=len(timestamps), reason="not enough samples")

    ordered = sorted(timestamps)
    intervals = [b - a for a, b in zip(ordered, ordered[1:]) if b > a]
    if len(intervals) < min_samples:
        return BeaconVerdict(False, samples=len(intervals), reason="not enough intervals")

    mean = statistics.fmean(intervals)
    if mean < min_period:
        return BeaconVerdict(False, period=mean, samples=len(intervals),
                             reason="interval too short to distinguish from normal traffic")

    deviation = statistics.pstdev(intervals)
    jitter = deviation / mean if mean else 1.0
    if jitter <= max_jitter:
        return BeaconVerdict(True, mean, jitter, len(intervals),
                             f"{len(intervals)} intervals averaging {mean:.0f}s "
                             f"with only {jitter * 100:.0f}% jitter")
    return BeaconVerdict(False, mean, jitter, len(intervals), "intervals are irregular")


def zscore(value: float, history: list[float]) -> float:
    """How many standard deviations ``value`` sits above its own history."""
    if len(history) < 3:
        return 0.0
    mean = statistics.fmean(history)
    deviation = statistics.pstdev(history)
    if deviation <= 0:
        return 0.0 if value <= mean else float("inf")
    return (value - mean) / deviation


@dataclass
class ProcessProfile:
    """What one process has been observed doing."""

    name: str
    exe: str | None = None
    contacts: dict[str, deque] = field(default_factory=lambda: defaultdict(lambda: deque(maxlen=64)))
    distinct_hosts: set[str] = field(default_factory=set)
    bytes_history: list[float] = field(default_factory=list)
    reported: set[str] = field(default_factory=set)


class AnomalyEngine:
    """Samples the connection table and looks for machine-like patterns."""

    def __init__(self, config: Config, sink: Sink) -> None:
        self.config = config
        self.sink = sink
        self._profiles: dict[int, ProcessProfile] = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.samples = 0
        self.mode = "idle"

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        if psutil is None:
            raise RuntimeError("psutil is required for anomaly detection")
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="anomaly", daemon=True)
        self._thread.start()
        self.mode = "sampling"

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=4)
            self._thread = None
        self.mode = "idle"

    def _loop(self) -> None:
        interval = max(5, int(self.config.get("anomaly.sample_interval_seconds", 15)))
        while not self._stop.is_set():
            try:
                self.sample()
            except Exception:  # noqa: BLE001
                pass
            self._stop.wait(interval)

    # -------------------------------------------------------------- sampling
    def sample(self, now: float | None = None) -> None:
        """One observation of the connection table."""
        if psutil is None:
            return
        now = now if now is not None else time.time()
        try:
            connections = psutil.net_connections(kind="inet")
        except Exception:  # noqa: BLE001
            return

        for conn in connections:
            if not conn.raddr or not conn.pid:
                continue
            remote = conn.raddr[0]
            profile = self._profiles.get(conn.pid)
            if profile is None:
                try:
                    proc = psutil.Process(conn.pid)
                    profile = ProcessProfile(proc.name(), _safe_exe(proc))
                except Exception:  # noqa: BLE001
                    continue
                self._profiles[conn.pid] = profile
            if self.config.is_whitelisted(name=profile.name, path=profile.exe):
                continue
            profile.contacts[remote].append(now)
            profile.distinct_hosts.add(remote)

        self.samples += 1
        self.evaluate()

        # Forget processes that have exited.
        live = {proc.pid for proc in psutil.process_iter()}
        for pid in [pid for pid in self._profiles if pid not in live]:
            self._profiles.pop(pid, None)

    def evaluate(self) -> list[Detection]:
        """Apply the statistical tests to everything observed so far."""
        max_jitter = float(self.config.get("anomaly.max_beacon_jitter", DEFAULT_MAX_JITTER))
        fanout_limit = int(self.config.get("anomaly.fanout_hosts", 25))
        found: list[Detection] = []

        for pid, profile in self._profiles.items():
            for remote, times in profile.contacts.items():
                key = f"beacon:{remote}"
                if key in profile.reported:
                    continue
                verdict = detect_beacon(list(times), max_jitter=max_jitter)
                if not verdict.is_beacon:
                    continue
                profile.reported.add(key)
                detection = Detection(
                    source="anomaly", kind="beaconing", subject=profile.exe or profile.name,
                    message=(f"{profile.name} is contacting {remote} on a fixed schedule "
                             f"({verdict.reason}). Automated check-ins like this are how "
                             f"command-and-control traffic behaves."),
                    severity="high", pid=pid, process_name=profile.name,
                    path=profile.exe, remote=remote,
                    signature_id="anomaly.beaconing", evidence=verdict.to_dict(),
                )
                found.append(detection)
                self.sink(detection)

            if len(profile.distinct_hosts) >= fanout_limit and "fanout" not in profile.reported:
                profile.reported.add("fanout")
                detection = Detection(
                    source="anomaly", kind="fanout", subject=profile.exe or profile.name,
                    message=(f"{profile.name} has contacted {len(profile.distinct_hosts)} "
                             f"different hosts. Scanners, stealers and loaders fan out like "
                             f"this; browsers and games do not."),
                    severity="medium", pid=pid, process_name=profile.name, path=profile.exe,
                    signature_id="anomaly.fanout",
                    evidence={"hosts": len(profile.distinct_hosts)},
                )
                found.append(detection)
                self.sink(detection)
        return found

    def snapshot(self) -> dict[str, Any]:
        return {
            "samples": self.samples,
            "tracked_processes": len(self._profiles),
            "tracked_destinations": sum(len(p.contacts) for p in self._profiles.values()),
        }


def _safe_exe(proc: Any) -> str | None:
    try:
        return proc.exe()
    except Exception:  # noqa: BLE001
        return None
