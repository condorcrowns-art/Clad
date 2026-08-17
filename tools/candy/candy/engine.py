"""The engine: wires every component together and owns the run loop."""
from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Callable

from .anomaly import AnomalyEngine
from .behavior import BehaviorEngine
from .config import Config
from .detect import Aggregator, Analyzer
from .eventlog import EventLog
from .events import Detection, EventBus
from .filewatch import FileWatcher
from .intel import IntelClient
from .netmon import NetworkMonitor
from .notify import Notifier, TrayIcon
from .persistence import PersistenceAuditor
from .procmon import ProcessMonitor
from .responder import Responder
from .winevents import WindowsEventMonitor
from .threatdb import ThreatDB
from .util import IS_WINDOWS, resource_dir, utc_stamp
from .winapi import SingleInstance, disable_extension_points, is_admin, set_critical_error_mode

VERSION = "1.0.0"


class Engine:
    def __init__(self, config: Config | None = None, *, db_path: Path | None = None) -> None:
        self.config = config or Config.load()
        self.bus = EventBus()
        self.log = EventLog(
            self.config.log_dir(),
            max_bytes=int(self.config.get("logging.max_log_bytes", 10485760)),
            keep=int(self.config.get("logging.keep_rotations", 5)),
            hash_chain=bool(self.config.get("logging.hash_chain", True)),
        )
        self.db = ThreatDB.load(db_path or (self.config.data_dir() / "threats.json"))
        if not self.db.signatures:
            # First run (or a frozen build, where the seed lives inside the
            # bundle): copy the shipped database into the writable data dir.
            seed = resource_dir() / "data" / "threats.json"
            if seed.exists() and seed != self.db.path:
                import json

                self.db.ingest(json.loads(seed.read_text(encoding="utf-8")), replace=True)
                self.db.save()

        self.intel = IntelClient(self.config)
        self.aggregator = Aggregator(int(self.config.get("response.action_threshold", 100)))
        self.responder = Responder(self.config, self.log)

        from .winapi import verify_signature

        self.analyzer = Analyzer(self.config, self.db, signature_checker=verify_signature)
        self.proc_monitor = ProcessMonitor(self.config, self.analyzer, self.handle_detection)
        self.file_watcher = FileWatcher(self.config, self.analyzer, self.handle_detection)
        self.net_monitor = NetworkMonitor(self.config, self.analyzer, self.handle_detection,
                                          intel=self.intel if self.intel.enabled else None)
        self.behavior = BehaviorEngine(self.config, self.handle_detection)
        self.kernel_events = WindowsEventMonitor(self.config, self.analyzer, self.handle_detection)
        self.persistence = PersistenceAuditor(self.config, self.analyzer, self.handle_detection)
        self.anomaly = AnomalyEngine(self.config, self.handle_detection)

        self.tray: TrayIcon | None = None
        self.notifier: Notifier | None = None

        self._instance = SingleInstance()
        self._stop = threading.Event()
        self._scheduler: threading.Thread | None = None
        self.started_at: float | None = None
        self.detections: list[Detection] = []
        self._detection_lock = threading.Lock()
        self.alert_hooks: list[Callable[[Detection], None]] = []

    # ------------------------------------------------------------ lifecycle
    def start(self) -> dict[str, Any]:
        """Start every enabled component. Returns a report of what came up."""
        if self.started_at:
            return self.status()
        self._stop.clear()
        set_critical_error_mode()
        report: dict[str, Any] = {"started": [], "skipped": [], "errors": []}

        if self.config.get("protection.self_protection", True) and IS_WINDOWS:
            if disable_extension_points():
                report["started"].append("self-protection (extension points disabled)")
            else:
                report["skipped"].append("self-protection (mitigation policy unavailable)")

        components = [
            ("process_monitor", self.proc_monitor),
            ("file_watcher", self.file_watcher),
            ("network_monitor", self.net_monitor),
            ("behavior_engine", self.behavior),
            ("kernel_events", self.kernel_events),
            ("persistence_auditor", self.persistence),
            ("anomaly_engine", self.anomaly),
        ]
        for key, component in components:
            if not self.config.get(f"protection.{key}", True):
                report["skipped"].append(key)
                continue
            try:
                component.start()
                report["started"].append(key)
            except Exception as exc:  # noqa: BLE001
                report["errors"].append(f"{key}: {exc}")

        from .firewall import FirewallController

        pending = FirewallController(self.config, self.log).rollback_if_unconfirmed()
        if pending:
            report["skipped"].append(pending)

        if self.kernel_events.degraded_reason:
            report["skipped"].append(f"kernel_events: {self.kernel_events.degraded_reason}")
        self._start_notifications(report)

        self.started_at = time.time()
        self._scheduler = threading.Thread(target=self._scheduler_loop, name="scheduler", daemon=True)
        self._scheduler.start()

        self.log.write({
            "event": "start",
            "version": VERSION,
            "admin": is_admin(),
            "mode": self.config.get("response.mode"),
            "components": report,
            "threatdb": self.db.stats(),
            "second_instance": self._instance.already_running,
        })
        if self.config.get("scan.on_start", False):
            threading.Thread(target=self.scan_now, name="startup-scan", daemon=True).start()
        return report

    def _start_notifications(self, report: dict[str, Any]) -> None:
        """Tray icon and toasts. Never fatal: a missing tray costs alerts, not
        detection."""
        if not self.config.get("notifications.tray_icon", True):
            return
        tray = TrayIcon("Candy")
        if tray.start():
            self.tray = tray
            report["started"].append("tray icon")
        else:
            report["skipped"].append(f"tray icon ({tray.last_error})")
        if self.config.get("notifications.toasts", True):
            self.notifier = Notifier(
                self.tray,
                min_severity=str(self.config.get("notifications.min_severity", "high")),
                min_interval=float(self.config.get("notifications.min_interval_seconds", 20)),
            )
            self.alert_hooks.append(self.notifier.handle)

    def stop(self) -> None:
        self._stop.set()
        if self.tray is not None:
            self.tray.stop()
            self.tray = None
        for component in (self.proc_monitor, self.file_watcher, self.net_monitor,
                          self.behavior, self.kernel_events, self.persistence, self.anomaly):
            try:
                component.stop()
            except Exception:  # noqa: BLE001
                pass
        if self._scheduler:
            self._scheduler.join(timeout=3)
            self._scheduler = None
        self.log.write({"event": "stop", "uptime_seconds": self.uptime})
        self._instance.release()
        self.started_at = None

    # ---------------------------------------------------------- detections
    def handle_detection(self, detection: Detection) -> None:
        """Single funnel for every monitor: aggregate, log, alert, respond."""
        verdict, is_new = self.aggregator.add(detection)
        if not is_new:
            return

        with self._detection_lock:
            self.detections.append(detection)
            if len(self.detections) > 2000:
                del self.detections[:500]

        record = detection.to_dict()
        record.update({"event": "detection", "verdict_score": verdict.score,
                       "verdict_severity": verdict.severity})
        self.log.write(record)

        if self.config.enforcing and not verdict.acted:
            results = self.responder.respond(detection, verdict_score=verdict.score)
            if results:
                self.aggregator.mark_acted(detection.subject)

        self.bus.publish(detection)
        for hook in list(self.alert_hooks):
            try:
                hook(detection)
            except Exception:  # noqa: BLE001
                pass

    # ------------------------------------------------------------ scheduler
    def _scheduler_loop(self) -> None:
        last_scan = time.time()
        last_update = 0.0
        while not self._stop.is_set():
            now = time.time()
            if self.config.get("scan.on_schedule", False):
                interval = max(5, int(self.config.get("scan.interval_minutes", 120))) * 60
                if now - last_scan >= interval:
                    last_scan = now
                    try:
                        self.scan_now()
                    except Exception:  # noqa: BLE001
                        pass
            if self.config.get("updates.auto_update", False):
                interval = max(1, int(self.config.get("updates.interval_hours", 12))) * 3600
                if now - last_update >= interval:
                    last_update = now
                    try:
                        self.update_threats()
                    except Exception:  # noqa: BLE001
                        pass
            self._stop.wait(30)

    # ---------------------------------------------------------------- tasks
    def scan_now(self, paths: list[str] | None = None,
                 progress: Callable[[str], None] | None = None) -> dict[str, Any]:
        """On-demand scan: every running process plus the watched folders."""
        started = time.time()
        before = len(self.detections)
        processes = self.proc_monitor.full_scan()
        persistence_hits = len(self.persistence.audit())
        targets = paths or self.config.get("scan.paths") or [str(p) for p in self.config.watch_paths()]
        file_stats = self.file_watcher.scan_paths(targets, progress=progress)
        self.behavior.run_cycle()
        self.net_monitor.scan_once()
        self.kernel_events.poll_once()
        result = {
            "processes": processes,
            "persistence_findings": persistence_hits,
            "files": file_stats.get("files", 0),
            "new_detections": len(self.detections) - before,
            "seconds": round(time.time() - started, 1),
            "finished": utc_stamp(),
        }
        self.log.write({"event": "scan", **result})
        return result

    def update_threats(self) -> dict[str, Any]:
        url = self.config.get("updates.threat_feed_url", "")
        if not url:
            return {"ok": False, "detail": "no updates.threat_feed_url is configured"}
        try:
            added = self.db.update_from_url(
                url,
                trusted_public_key=str(self.config.get("updates.trusted_public_key", "")),
                require_signature=bool(self.config.get("updates.require_signature", False)),
            )
        except Exception as exc:  # noqa: BLE001
            self.log.write({"event": "update", "ok": False, "error": str(exc)})
            return {"ok": False, "detail": str(exc)}
        self.log.write({"event": "update", "ok": True, "added": added, "url": url})
        return {"ok": True, "added": added, "stats": self.db.stats()}

    # --------------------------------------------------------------- status
    @property
    def uptime(self) -> float:
        return round(time.time() - self.started_at, 1) if self.started_at else 0.0

    def status(self) -> dict[str, Any]:
        counts: dict[str, int] = {}
        with self._detection_lock:
            for detection in self.detections:
                counts[detection.severity] = counts.get(detection.severity, 0) + 1
            total = len(self.detections)
        return {
            "version": VERSION,
            "running": bool(self.started_at),
            "uptime_seconds": self.uptime,
            "admin": is_admin(),
            "platform": "windows" if IS_WINDOWS else "non-windows (limited)",
            "mode": self.config.get("response.mode"),
            "auto": {
                "kill": self.config.get("response.auto_kill"),
                "quarantine": self.config.get("response.auto_quarantine"),
                "firewall": self.config.get("response.auto_firewall"),
            },
            "monitors": {
                "process": self.proc_monitor.mode,
                "file": self.file_watcher.mode,
                "network": self.net_monitor.mode,
                "behavior_cycles": self.behavior.cycles,
                "kernel_events": self.kernel_events.status(),
                "persistence": self.persistence.mode,
                "anomaly": self.anomaly.snapshot(),
                "tray": bool(self.tray and self.tray.available),
            },
            "counters": {
                "processes_analyzed": self.proc_monitor.scanned,
                "files_analyzed": self.file_watcher.files_seen,
                "connections_seen": self.net_monitor.connections_seen,
                "kernel_events_seen": self.kernel_events.events_seen,
                "autostart_entries": self.persistence.entries_seen,
                "detections": total,
                "by_severity": counts,
                "events_dropped": self.bus.dropped,
            },
            "threatdb": self.db.stats(),
            "intel": self.intel.status(),
            "log": str(self.log.path),
            "quarantine": str(self.config.quarantine_dir()),
            "blocked_domains": self.responder.blocked_domains(),
            "degraded": [msg for msg in [self.net_monitor.degraded_reason,
                                        self.kernel_events.degraded_reason] if msg],
        }

    def recent(self, limit: int = 50) -> list[Detection]:
        with self._detection_lock:
            return list(self.detections[-limit:])
