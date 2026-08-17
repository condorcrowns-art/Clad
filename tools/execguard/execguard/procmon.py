"""Real-time process monitoring.

Two collection strategies, same output:

* **WMI** (``Win32_ProcessStartTrace``) gives event-driven notification the
  moment a process starts — no polling gap. Needs the optional ``wmi`` +
  ``pywin32`` packages (both free, both open source).
* **Polling** via psutil is the fallback. It works everywhere, including for
  testing on Linux, at the cost of a small detection delay.

Short-lived processes are the weak spot of any user-mode monitor: a loader
that runs for 200 ms can exit before a 2-second poll sees it. WMI narrows that
window; it does not close it. That limitation is documented rather than
papered over.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable, Iterable

from .config import Config
from .detect import Analyzer
from .events import Detection
from .util import IS_WINDOWS, sha256_file

try:  # psutil is required for real monitoring but not for importing the module
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]

Sink = Callable[[Detection], None]

_hash_cache: dict[tuple[str, float, int], str | None] = {}
_hash_lock = threading.Lock()


def hash_image(path: str | None, max_bytes: int) -> str | None:
    """SHA-256 an image file, cached by (path, mtime, size)."""
    if not path:
        return None
    try:
        import os

        stat = os.stat(path)
        key = (path.lower(), stat.st_mtime, stat.st_size)
    except OSError:
        return None
    with _hash_lock:
        if key in _hash_cache:
            return _hash_cache[key]
    digest = sha256_file(path, max_bytes=max_bytes)
    with _hash_lock:
        if len(_hash_cache) > 2048:
            _hash_cache.clear()
        _hash_cache[key] = digest
    return digest


def collect_process_info(proc: Any) -> dict[str, Any]:
    """Best-effort snapshot of one process.

    Access to another user's process is often denied; missing fields are left
    as None rather than dropping the process entirely, because the name alone
    is frequently enough for a signature hit.
    """
    info: dict[str, Any] = {"pid": None, "name": None, "exe": None, "cmdline": None,
                            "ppid": None, "parent_name": None, "username": None,
                            "create_time": None}
    try:
        info["pid"] = proc.pid
        with proc.oneshot():
            info["name"] = proc.name()
            try:
                info["exe"] = proc.exe()
            except (psutil.AccessDenied, psutil.ZombieProcess, OSError):
                pass
            try:
                info["cmdline"] = " ".join(proc.cmdline())
            except (psutil.AccessDenied, psutil.ZombieProcess, OSError):
                pass
            try:
                info["username"] = proc.username()
            except (psutil.AccessDenied, psutil.ZombieProcess, OSError):
                pass
            try:
                info["ppid"] = proc.ppid()
            except (psutil.AccessDenied, psutil.ZombieProcess, OSError):
                pass
            try:
                info["create_time"] = proc.create_time()
            except (psutil.AccessDenied, psutil.ZombieProcess, OSError):
                pass
    except Exception:  # noqa: BLE001 - process vanished mid-read
        return info
    if info["ppid"]:
        try:
            info["parent_name"] = psutil.Process(info["ppid"]).name()
        except Exception:  # noqa: BLE001
            pass
    return info


class ProcessMonitor:
    def __init__(self, config: Config, analyzer: Analyzer, sink: Sink) -> None:
        self.config = config
        self.analyzer = analyzer
        self.sink = sink
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []
        self._seen: dict[int, float] = {}   # pid -> create_time we already analysed
        self.mode = "idle"
        self.last_cycle: float = 0.0
        self.scanned = 0

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        if psutil is None:
            raise RuntimeError("psutil is required for process monitoring (pip install psutil)")
        self._stop.clear()
        started_wmi = False
        if IS_WINDOWS:
            started_wmi = self._try_start_wmi()
        thread = threading.Thread(target=self._poll_loop, name="procmon-poll", daemon=True)
        thread.start()
        self._threads.append(thread)
        self.mode = "wmi+poll" if started_wmi else "poll"

    def stop(self) -> None:
        self._stop.set()
        for thread in self._threads:
            thread.join(timeout=3)
        self._threads.clear()
        self.mode = "idle"

    # ----------------------------------------------------------------- wmi
    def _try_start_wmi(self) -> bool:
        try:  # pragma: no cover - Windows only
            import wmi  # noqa: F401
        except ImportError:
            return False
        thread = threading.Thread(target=self._wmi_loop, name="procmon-wmi", daemon=True)
        thread.start()
        self._threads.append(thread)
        return True

    def _wmi_loop(self) -> None:  # pragma: no cover - Windows only
        try:
            import pythoncom
            import wmi
        except ImportError:
            return
        pythoncom.CoInitialize()
        try:
            connection = wmi.WMI()
            watcher = connection.Win32_ProcessStartTrace.watch_for()
            while not self._stop.is_set():
                try:
                    event = watcher(timeout_ms=1000)
                except wmi.x_wmi_timed_out:
                    continue
                except Exception:  # noqa: BLE001 - WMI hiccup; fall back to polling
                    time.sleep(2)
                    continue
                try:
                    pid = int(event.ProcessID)
                except (TypeError, ValueError):
                    continue
                try:
                    proc = psutil.Process(pid)
                except Exception:  # noqa: BLE001
                    # Process already exited. Still report the name WMI gave us
                    # so the burst is not invisible.
                    self._analyze_info({"pid": pid, "name": str(event.ProcessName),
                                        "exe": None, "cmdline": None, "parent_name": None,
                                        "transient": True})
                    continue
                self._analyze_proc(proc)
        finally:
            try:
                pythoncom.CoUninitialize()
            except Exception:  # noqa: BLE001
                pass

    # ---------------------------------------------------------------- poll
    def _poll_loop(self) -> None:
        interval = max(1, int(self.config.get("filewatch.poll_interval_seconds", 4)))
        while not self._stop.is_set():
            try:
                self.scan_once()
            except Exception:  # noqa: BLE001 - a monitor must never die silently
                pass
            self._stop.wait(interval)

    def scan_once(self) -> int:
        """Analyse every process not seen before. Returns how many were new."""
        if psutil is None:
            return 0
        new = 0
        live: set[int] = set()
        for proc in psutil.process_iter(["pid", "create_time"]):
            try:
                pid = proc.pid
                created = proc.info.get("create_time") or 0.0
            except Exception:  # noqa: BLE001
                continue
            live.add(pid)
            # PIDs are recycled; the creation time distinguishes a new process
            # that inherited a PID we already cleared.
            if self._seen.get(pid) == created:
                continue
            self._seen[pid] = created
            self._analyze_proc(proc)
            new += 1
        for pid in list(self._seen):
            if pid not in live:
                self._seen.pop(pid, None)
        self.last_cycle = time.time()
        self.scanned += new
        return new

    def full_scan(self) -> int:
        """Re-analyse everything, ignoring the seen-cache (on-demand scan)."""
        self._seen.clear()
        return self.scan_once()

    # ------------------------------------------------------------- analysis
    def _analyze_proc(self, proc: Any) -> None:
        self._analyze_info(collect_process_info(proc))

    def _analyze_info(self, info: dict[str, Any]) -> None:
        name, exe = info.get("name"), info.get("exe")
        if not name and not exe:
            return
        if self.config.is_whitelisted(name=name, path=exe):
            return
        # Hash only what survived the whitelist — hashing every system binary
        # on startup would be the single most expensive thing we do.
        if exe:
            info["sha256"] = hash_image(exe, int(self.config.get("filewatch.max_hash_bytes", 134217728)))
        for detection in self.analyzer.analyze_process(info):
            self.sink(detection)

    # ---------------------------------------------------------------- misc
    def snapshot(self) -> list[dict[str, Any]]:
        """Current process table, for the GUI's process list."""
        if psutil is None:
            return []
        out = []
        for proc in psutil.process_iter():
            info = collect_process_info(proc)
            if info.get("name"):
                out.append(info)
        return out


def terminate_process(pid: int, timeout: float = 3.0) -> tuple[bool, str]:
    """Terminate a process, escalating to kill. Returns ``(ok, message)``."""
    if psutil is None:
        return False, "psutil is not installed"
    try:
        proc = psutil.Process(pid)
        name = proc.name()
        proc.terminate()
        try:
            proc.wait(timeout=timeout)
            return True, f"terminated {name} (pid {pid})"
        except psutil.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=timeout)
            return True, f"killed {name} (pid {pid}) after it ignored terminate"
    except psutil.NoSuchProcess:
        return True, f"process {pid} had already exited"
    except psutil.AccessDenied:
        return False, (f"access denied terminating pid {pid} — the process is elevated "
                       f"or protected; run ExecGuard as administrator")
    except Exception as exc:  # noqa: BLE001
        return False, f"failed to terminate pid {pid}: {exc}"


def children_of(pid: int) -> Iterable[int]:
    if psutil is None:
        return []
    try:
        return [child.pid for child in psutil.Process(pid).children(recursive=True)]
    except Exception:  # noqa: BLE001
        return []
