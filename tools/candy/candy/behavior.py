"""Behavioural analysis: what a process *does*, not what it is called.

The most valuable check here is the module audit. An executor works by getting
its DLL loaded into RobloxPlayerBeta.exe; from user mode we cannot see the
injection happen, but we can see the result — a foreign module sitting in the
game's address space. Renaming the executor's exe defeats a name signature; it
does not defeat this.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from typing import Any, Callable

from .config import Config
from .events import Detection
from .util import IS_WINDOWS, basename, is_within, normalize_path
from .winapi import debugger_signals, verify_signature

try:
    import psutil
except ImportError:  # pragma: no cover
    psutil = None  # type: ignore[assignment]

Sink = Callable[[Detection], None]

# Module roots that are expected inside a Roblox process.
TRUSTED_MODULE_ROOTS = (
    "c:/windows",
    "c:/program files/roblox",
    "c:/program files (x86)/roblox",
)

# Security products we watch for disappearance.
SECURITY_PROCESSES = {
    "msmpeng.exe": "Microsoft Defender Antimalware Service",
    "securityhealthservice.exe": "Windows Security Health Service",
    "mssense.exe": "Microsoft Defender for Endpoint",
    "avastsvc.exe": "Avast Antivirus Service",
    "avgsvc.exe": "AVG Antivirus Service",
    "mbamservice.exe": "Malwarebytes Service",
    "ekrn.exe": "ESET Service",
    "bdservicehost.exe": "Bitdefender Service",
}


class BehaviorEngine:
    def __init__(self, config: Config, sink: Sink) -> None:
        self.config = config
        self.sink = sink
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._cpu_history: dict[int, deque] = defaultdict(lambda: deque(maxlen=10))
        self._reported: set[str] = set()
        self._security_baseline: set[str] = set()
        self.last_cycle: float = 0.0
        self.cycles = 0

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        if psutil is None:
            raise RuntimeError("psutil is required for behavioural analysis (pip install psutil)")
        self._stop.clear()
        self._security_baseline = self._running_security_products()
        self._thread = threading.Thread(target=self._loop, name="behavior", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=4)
            self._thread = None

    def _loop(self) -> None:
        interval = max(3, int(self.config.get("behavior.poll_interval_seconds", 6)))
        while not self._stop.is_set():
            try:
                self.run_cycle()
            except Exception:  # noqa: BLE001
                pass
            self._stop.wait(interval)

    def run_cycle(self) -> None:
        self.audit_protected_targets()
        self.check_resource_abuse()
        self.check_security_products()
        self.check_self_integrity()
        self.cycles += 1
        self.last_cycle = time.time()

    def _emit_once(self, key: str, detection: Detection) -> None:
        """Emit a detection at most once per (key) for the life of the run."""
        if key in self._reported:
            return
        self._reported.add(key)
        self.sink(detection)

    # ------------------------------------------------------- module audit
    def audit_protected_targets(self) -> list[Detection]:
        """Look for foreign DLLs inside Roblox processes."""
        if psutil is None:
            return []
        targets = {str(t).lower() for t in self.config.get("behavior.protected_targets", [])}
        if not targets:
            return []
        check_signatures = bool(self.config.get("behavior.check_module_signatures", True))
        found: list[Detection] = []

        for proc in psutil.process_iter(["pid", "name"]):
            try:
                name = (proc.info.get("name") or "").lower()
            except Exception:  # noqa: BLE001
                continue
            if name not in targets:
                continue
            for module in self._modules_of(proc):
                norm = normalize_path(module)
                if not norm or any(is_within(norm, root) for root in TRUSTED_MODULE_ROOTS):
                    continue
                if "/roblox/versions/" in norm:
                    continue
                if self.config.is_whitelisted(name=basename(module), path=module):
                    continue

                signed = verify_signature(module) if check_signatures else None
                if signed is True:
                    severity, note = "medium", "signed, but not part of Windows or Roblox"
                elif signed is False:
                    severity, note = "critical", "unsigned"
                else:
                    severity, note = "high", "signature could not be verified"

                detection = Detection(
                    source="behavior",
                    kind="foreign_module",
                    subject=module,
                    message=(f"Foreign module loaded inside {name} ({note}): {module}. "
                             f"This is what DLL injection by an executor looks like."),
                    severity=severity,
                    pid=proc.info.get("pid"),
                    process_name=name,
                    path=module,
                    signature_id="heuristic.foreign_module",
                    evidence={"module": module, "host": name, "signed": signed},
                )
                found.append(detection)
                self._emit_once(f"module:{norm}:{name}", detection)
        return found

    def _modules_of(self, proc: Any) -> list[str]:
        """Loaded module paths for a process, or [] if we cannot read them."""
        try:
            return [m.path for m in proc.memory_maps() if str(m.path).lower().endswith(".dll")]
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            return []
        except Exception:  # noqa: BLE001 - memory_maps is unsupported on some platforms
            return []

    # ---------------------------------------------------- resource abuse
    def check_resource_abuse(self) -> None:
        if psutil is None:
            return
        cpu_limit = float(self.config.get("behavior.cpu_threshold_percent", 80.0))
        needed = int(self.config.get("behavior.cpu_sustained_samples", 3))
        handle_limit = int(self.config.get("behavior.handle_threshold", 4000))
        core_count = psutil.cpu_count() or 1

        for proc in psutil.process_iter(["pid", "name", "cpu_percent"]):
            try:
                pid = proc.pid
                name = proc.info.get("name") or ""
                if self.config.is_protected_process(name):
                    continue
                # psutil reports CPU relative to one core; normalise to the machine.
                cpu = (proc.info.get("cpu_percent") or 0.0) / core_count
            except Exception:  # noqa: BLE001
                continue

            history = self._cpu_history[pid]
            history.append(cpu)
            if len(history) >= needed and all(sample >= cpu_limit for sample in list(history)[-needed:]):
                try:
                    exe = proc.exe()
                except Exception:  # noqa: BLE001
                    exe = None
                if self.config.is_whitelisted(name=name, path=exe):
                    continue
                self._emit_once(f"cpu:{pid}:{name}", Detection(
                    source="behavior", kind="cpu_abuse", subject=exe or name,
                    message=f"{name} has held above {cpu_limit:.0f}% CPU across {needed} samples.",
                    severity="low", pid=pid, process_name=name, path=exe,
                    signature_id="heuristic.cpu_abuse",
                    evidence={"samples": list(history)},
                ))

            if IS_WINDOWS:
                try:
                    handles = proc.num_handles()  # type: ignore[attr-defined]
                except Exception:  # noqa: BLE001
                    handles = 0
                if handles and handles > handle_limit:
                    self._emit_once(f"handles:{pid}:{name}", Detection(
                        source="behavior", kind="handle_abuse", subject=name,
                        message=f"{name} holds {handles} handles (threshold {handle_limit}) — "
                                f"possible mass file or process enumeration.",
                        severity="low", pid=pid, process_name=name,
                        signature_id="heuristic.handle_abuse",
                        evidence={"handles": handles},
                    ))

        # Forget history for processes that have exited.
        live = {p.pid for p in psutil.process_iter()}
        for pid in [pid for pid in self._cpu_history if pid not in live]:
            self._cpu_history.pop(pid, None)

    # ------------------------------------------------- security tampering
    def _running_security_products(self) -> set[str]:
        if psutil is None:
            return set()
        running = set()
        for proc in psutil.process_iter(["name"]):
            try:
                name = (proc.info.get("name") or "").lower()
            except Exception:  # noqa: BLE001
                continue
            if name in SECURITY_PROCESSES:
                running.add(name)
        return running

    def check_security_products(self) -> None:
        """Alert if a security product that *was* running has disappeared."""
        if not self._security_baseline:
            self._security_baseline = self._running_security_products()
            return
        current = self._running_security_products()
        for missing in self._security_baseline - current:
            self._emit_once(f"av_gone:{missing}", Detection(
                source="behavior", kind="security_disabled", subject=missing,
                message=(f"{SECURITY_PROCESSES.get(missing, missing)} was running when Candy "
                         f"started and is no longer running. Something may have disabled it."),
                severity="critical", process_name=missing,
                signature_id="heuristic.security_disabled",
            ))
        # Re-baseline so a service that comes back can be flagged again later.
        self._security_baseline = current or self._security_baseline

    # ---------------------------------------------------- self-protection
    def check_self_integrity(self) -> None:
        """Anti-debug / anti-tamper checks on Candy itself."""
        if not self.config.get("protection.self_protection", True):
            return
        signals = debugger_signals()
        if signals:
            self._emit_once("self:debugger", Detection(
                source="behavior", kind="self_tamper", subject="Candy",
                message=f"A debugger is attached to Candy ({', '.join(signals)}). "
                        f"Something is trying to inspect or patch the monitor.",
                severity="critical", signature_id="selfprotect.debugger",
                evidence={"signals": signals},
            ))
