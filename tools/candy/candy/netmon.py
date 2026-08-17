"""Outbound connection monitoring.

psutil gives us the connection table with owning PIDs; we diff it each cycle
so a given (process, remote endpoint) pair is only judged once. Reputation
lookups are optional and off by default — see ``intel.py``.
"""
from __future__ import annotations

import ipaddress
import threading
import time
from typing import Any, Callable

from .config import Config
from .detect import Analyzer
from .events import Detection

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]

Sink = Callable[[Detection], None]


def is_private(ip: str) -> bool:
    """True for loopback/private/link-local/multicast addresses."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return bool(addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_multicast or addr.is_reserved or addr.is_unspecified)


class NetworkMonitor:
    def __init__(self, config: Config, analyzer: Analyzer, sink: Sink,
                 intel: Any | None = None) -> None:
        self.config = config
        self.analyzer = analyzer
        self.sink = sink
        self.intel = intel
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._seen: set[tuple[int, str, int]] = set()
        self.mode = "idle"
        self.connections_seen = 0
        self.last_cycle: float = 0.0
        self.degraded_reason: str | None = None

    def start(self) -> None:
        if psutil is None:
            raise RuntimeError("psutil is required for network monitoring (pip install psutil)")
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="netmon", daemon=True)
        self._thread.start()
        self.mode = "poll"

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        self.mode = "idle"

    def _loop(self) -> None:
        interval = max(2, int(self.config.get("network.poll_interval_seconds", 5)))
        while not self._stop.is_set():
            try:
                self.scan_once()
            except Exception:  # noqa: BLE001
                pass
            self._stop.wait(interval)

    def scan_once(self) -> list[dict[str, Any]]:
        """One pass over the connection table. Returns the new connections."""
        if psutil is None:
            return []
        try:
            connections = psutil.net_connections(kind="inet")
        except psutil.AccessDenied:
            # Without elevation Windows only reports our own connections.
            self.degraded_reason = ("access denied reading the system connection table — "
                                    "run as administrator to see other processes' connections")
            try:
                connections = psutil.Process().connections(kind="inet")
            except Exception:  # noqa: BLE001
                return []
        except Exception:  # noqa: BLE001
            return []

        alert_private = bool(self.config.get("network.alert_on_private_ranges", False))
        new: list[dict[str, Any]] = []
        for conn in connections:
            remote_ip, remote_port = ("", None)
            if conn.raddr:
                remote_ip, remote_port = conn.raddr[0], conn.raddr[1]
            local_port = conn.laddr[1] if conn.laddr else None
            pid = conn.pid or 0
            key = (pid, remote_ip, remote_port or 0)
            if key in self._seen:
                continue
            self._seen.add(key)
            if remote_ip and is_private(remote_ip) and not alert_private:
                continue

            name, exe = None, None
            if conn.pid:
                try:
                    proc = psutil.Process(conn.pid)
                    name = proc.name()
                    try:
                        exe = proc.exe()
                    except Exception:  # noqa: BLE001
                        pass
                except Exception:  # noqa: BLE001
                    pass

            record = {
                "pid": conn.pid, "process_name": name, "exe": exe,
                "remote_ip": remote_ip, "remote_port": remote_port,
                "local_port": local_port, "status": conn.status,
                "remote_host": None,
            }
            new.append(record)
            self.connections_seen += 1
            for detection in self.analyzer.analyze_connection(record):
                self.sink(detection)
            if self.intel is not None and remote_ip:
                self._reputation_check(record)

        # Keep the dedupe set from growing without bound on a long run.
        if len(self._seen) > 20000:
            self._seen.clear()
        self.last_cycle = time.time()
        return new

    def _reputation_check(self, record: dict[str, Any]) -> None:
        verdict = self.intel.check_ip(record["remote_ip"])
        if not verdict or not verdict.get("malicious"):
            return
        self.sink(Detection(
            source="network",
            kind="intel_ip",
            subject=record["remote_ip"],
            message=(f"{record.get('process_name') or 'A process'} connected to "
                     f"{record['remote_ip']}, flagged by {verdict.get('provider')}: "
                     f"{verdict.get('summary')}"),
            severity=str(verdict.get("severity", "medium")),
            pid=record.get("pid"),
            process_name=record.get("process_name"),
            path=record.get("exe"),
            remote=f"{record['remote_ip']}:{record.get('remote_port')}",
            signature_id=f"intel:{verdict.get('provider')}",
            evidence=verdict,
        ))

    def active_connections(self) -> list[dict[str, Any]]:
        """Current outbound connections, for the GUI."""
        if psutil is None:
            return []
        out = []
        try:
            for conn in psutil.net_connections(kind="inet"):
                if not conn.raddr:
                    continue
                name = None
                if conn.pid:
                    try:
                        name = psutil.Process(conn.pid).name()
                    except Exception:  # noqa: BLE001
                        pass
                out.append({
                    "pid": conn.pid, "process_name": name,
                    "remote": f"{conn.raddr[0]}:{conn.raddr[1]}",
                    "status": conn.status,
                })
        except Exception:  # noqa: BLE001
            return out
        return out
