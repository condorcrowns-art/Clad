"""Kernel-sourced detection without shipping a kernel driver.

Candy cannot load its own driver — Windows requires an EV-signed, Microsoft-
attested binary for that, which cannot be obtained for free. It does not need
to. Microsoft already ships signed kernel drivers that publish exactly the
telemetry an anti-cheat wants, and any process with administrator rights can
read their event channels:

* **Sysmon** (free, Microsoft-signed, optional) reports remote-thread creation,
  cross-process memory access with the granted access mask, image loads with
  signature status, **driver loads** — the way to see a kernel-mode cheat —
  and process tampering (hollowing / herpaderping).
* **Microsoft Defender** reports its own detections and, critically, when its
  real-time protection is switched off.
* The **Security** channel reports process creation (event 4688) when process
  auditing is enabled.

Every event here originates in kernel mode. Candy reads it from user mode, so a
bug in Candy cannot bluescreen the machine — the liability stays with drivers
Microsoft wrote, signed and tests.

Reading is done with `wevtutil`, which is part of Windows. No extra dependency,
nothing to install, nothing to buy.
"""
from __future__ import annotations

import shutil
import subprocess
import threading
import time
import xml.etree.ElementTree as ET
from typing import Any, Callable, Iterable

from .config import Config
from .detect import ROBLOX_IMAGE_NAMES, Analyzer
from .events import Detection
from .util import IS_WINDOWS, basename, normalize_path

Sink = Callable[[Detection], None]

EVENT_NS = "{http://schemas.microsoft.com/win/2004/08/events/event}"

SYSMON_CHANNEL = "Microsoft-Windows-Sysmon/Operational"
DEFENDER_CHANNEL = "Microsoft-Windows-Windows Defender/Operational"
SECURITY_CHANNEL = "Security"

# Process access rights that make code injection possible. A handle opened with
# these against another process is the precondition for writing a payload into
# it; a reader-only handle (0x1000 QUERY_LIMITED_INFORMATION) is not.
PROCESS_CREATE_THREAD = 0x0002
PROCESS_VM_OPERATION = 0x0008
PROCESS_VM_READ = 0x0010
PROCESS_VM_WRITE = 0x0020
INJECTION_RIGHTS = PROCESS_CREATE_THREAD | PROCESS_VM_OPERATION | PROCESS_VM_WRITE

# Legitimate software that routinely opens handles into other processes.
# Without this, every debugger, overlay and backup tool trips event 10.
COMMON_INSPECTORS = {
    "csrss.exe", "services.exe", "lsass.exe", "wininit.exe", "svchost.exe",
    "msmpeng.exe", "mssense.exe", "sensendr.exe", "taskmgr.exe", "procexp.exe",
    "procexp64.exe", "procmon.exe", "procmon64.exe", "vsdebugconsole.exe",
    "devenv.exe", "windbg.exe", "wmiprvse.exe", "searchindexer.exe",
    "sysmon.exe", "sysmon64.exe", "explorer.exe", "dwm.exe",
}


# --------------------------------------------------------------------- parsing
def parse_events(raw_xml: str) -> list[dict[str, Any]]:
    """Parse `wevtutil ... /f:xml` output into flat dictionaries.

    wevtutil emits a sequence of <Event> elements with no shared root, so the
    output is wrapped before parsing. Malformed or partial events are skipped
    rather than aborting the batch — a single unreadable record must not blind
    the monitor to the rest.
    """
    if not raw_xml or "<Event" not in raw_xml:
        return []
    try:
        root = ET.fromstring(f"<Events>{raw_xml}</Events>")
    except ET.ParseError:
        # Truncated final record (the query hit its size limit): keep whole ones.
        cut = raw_xml.rfind("</Event>")
        if cut == -1:
            return []
        try:
            root = ET.fromstring(f"<Events>{raw_xml[:cut + len('</Event>')]}</Events>")
        except ET.ParseError:
            return []

    out: list[dict[str, Any]] = []
    for event in root:
        record: dict[str, Any] = {}
        system = event.find(f"{EVENT_NS}System")
        if system is None:
            continue
        event_id = system.find(f"{EVENT_NS}EventID")
        record["event_id"] = int((event_id.text or "0").strip()) if event_id is not None else 0
        record_id = system.find(f"{EVENT_NS}EventRecordID")
        record["record_id"] = int((record_id.text or "0").strip()) if record_id is not None else 0
        channel = system.find(f"{EVENT_NS}Channel")
        record["channel"] = (channel.text or "") if channel is not None else ""
        created = system.find(f"{EVENT_NS}TimeCreated")
        record["time"] = created.get("SystemTime") if created is not None else None

        data: dict[str, str] = {}
        for container in (f"{EVENT_NS}EventData", f"{EVENT_NS}UserData"):
            node = event.find(container)
            if node is None:
                continue
            for item in node.iter():
                name = item.get("Name")
                if name and item.text is not None:
                    data[name] = item.text.strip()
        record["data"] = data
        out.append(record)
    return out


def parse_access_mask(value: str | None) -> int:
    """`GrantedAccess` arrives as a hex string like '0x1FFFFF'."""
    if not value:
        return 0
    try:
        return int(str(value).strip(), 16)
    except ValueError:
        return 0


def sha256_from_hashes(value: str | None) -> str | None:
    """Sysmon's Hashes field is 'SHA1=...,SHA256=...,IMPHASH=...'."""
    if not value:
        return None
    for part in str(value).split(","):
        key, _, digest = part.partition("=")
        if key.strip().upper() == "SHA256" and len(digest.strip()) == 64:
            return digest.strip().lower()
    return None


def is_roblox_image(path: str | None) -> bool:
    return basename(path).lower() in ROBLOX_IMAGE_NAMES


# ------------------------------------------------------------------- analysis
class WindowsEventAnalyzer:
    """Turns parsed Windows/Sysmon events into detections.

    Pure logic over dictionaries — no subprocess, no Windows calls — so the
    whole mapping is unit-tested on any platform.
    """

    def __init__(self, config: Config, analyzer: Analyzer, self_images: Iterable[str] = ()) -> None:
        self.config = config
        self.analyzer = analyzer
        self.self_images = {name.lower() for name in self_images} or {"candy.exe"}

    def analyze(self, record: dict[str, Any]) -> list[Detection]:
        channel = record.get("channel", "")
        if channel == SYSMON_CHANNEL:
            return self._sysmon(record)
        if channel == DEFENDER_CHANNEL:
            return self._defender(record)
        if channel == SECURITY_CHANNEL:
            return self._security(record)
        return []

    # ------------------------------------------------------------- sysmon
    def _sysmon(self, record: dict[str, Any]) -> list[Detection]:
        data = record.get("data", {})
        event_id = record.get("event_id")
        handler = {
            1: self._sysmon_process_create,
            6: self._sysmon_driver_load,
            7: self._sysmon_image_load,
            8: self._sysmon_remote_thread,
            10: self._sysmon_process_access,
            11: self._sysmon_file_create,
            22: self._sysmon_dns,
            25: self._sysmon_tampering,
        }.get(event_id)
        return handler(data) if handler else []

    def _sysmon_process_create(self, data: dict[str, str]) -> list[Detection]:
        """Kernel-reported process creation — no polling gap, and it includes
        the hash, so short-lived loaders cannot slip between poll cycles."""
        return self.analyzer.analyze_process({
            "pid": _int_or_none(data.get("ProcessId")),
            "name": basename(data.get("Image")),
            "exe": data.get("Image"),
            "cmdline": data.get("CommandLine"),
            "parent_name": basename(data.get("ParentImage")),
            "sha256": sha256_from_hashes(data.get("Hashes")),
            "source": "sysmon",
        })

    def _sysmon_driver_load(self, data: dict[str, str]) -> list[Detection]:
        """A driver loading is how a kernel-mode cheat arrives. An unsigned or
        untrusted one is the single strongest signal Candy can receive."""
        image = data.get("ImageLoaded") or ""
        signed = str(data.get("Signed", "")).lower() == "true"
        status = data.get("SignatureStatus", "")
        signature = data.get("Signature", "")
        if signed and status.lower() == "valid":
            return []
        return [Detection(
            source="kernel", kind="driver_load", subject=image,
            message=(f"A {'unsigned' if not signed else 'untrusted'} kernel driver was loaded: "
                     f"{image}. Kernel-mode cheats and rootkits arrive exactly this way."),
            severity="critical", path=image, signature_id="kernel.driver_load",
            evidence={"signed": signed, "status": status, "signer": signature},
        )]

    def _sysmon_image_load(self, data: dict[str, str]) -> list[Detection]:
        """A DLL loading into Roblox, reported by the kernel rather than
        inferred from a module-list snapshot."""
        host = data.get("Image") or ""
        module = data.get("ImageLoaded") or ""
        if not is_roblox_image(host):
            return []
        norm = normalize_path(module)
        if norm.startswith("c:/windows") or "/roblox/versions/" in norm:
            return []
        if self.config.is_whitelisted(name=basename(module), path=module):
            return []
        signed = str(data.get("Signed", "")).lower() == "true"
        return [Detection(
            source="kernel", kind="image_load", subject=module,
            message=(f"{'An unsigned' if not signed else 'A foreign'} module was loaded into "
                     f"{basename(host)}: {module}. This is executor DLL injection."),
            severity="critical" if not signed else "high",
            path=module, process_name=basename(host),
            pid=_int_or_none(data.get("ProcessId")),
            sha256=sha256_from_hashes(data.get("Hashes")),
            signature_id="kernel.image_load",
            evidence={"host": host, "signed": signed,
                      "status": data.get("SignatureStatus"), "signer": data.get("Signature")},
        )]

    def _sysmon_remote_thread(self, data: dict[str, str]) -> list[Detection]:
        """CreateRemoteThread — the textbook injection primitive. There is no
        benign reason for an unknown process to start a thread inside the
        Roblox client."""
        source = data.get("SourceImage") or ""
        target = data.get("TargetImage") or ""
        if not is_roblox_image(target):
            return []
        if self.config.is_whitelisted(name=basename(source), path=source):
            return []
        return [Detection(
            source="kernel", kind="remote_thread", subject=source,
            message=(f"{basename(source)} created a thread inside {basename(target)} — "
                     f"a direct code injection into the Roblox client."),
            severity="critical", path=source,
            process_name=basename(source),
            pid=_int_or_none(data.get("SourceProcessId")),
            signature_id="kernel.remote_thread",
            evidence={"source": source, "target": target,
                      "start_address": data.get("StartAddress"),
                      "start_module": data.get("StartModule")},
        )]

    def _sysmon_process_access(self, data: dict[str, str]) -> list[Detection]:
        """A handle opened into Roblox — or into Candy — with rights that allow
        writing memory or starting threads."""
        source = data.get("SourceImage") or ""
        target = data.get("TargetImage") or ""
        source_name = basename(source).lower()
        rights = parse_access_mask(data.get("GrantedAccess"))
        if not rights & INJECTION_RIGHTS:
            return []
        if source_name in COMMON_INSPECTORS:
            return []
        if self.config.is_whitelisted(name=source_name, path=source):
            return []

        target_name = basename(target).lower()
        if target_name in self.self_images:
            return [Detection(
                source="kernel", kind="self_tamper", subject=source,
                message=(f"{basename(source)} opened Candy with memory-write rights. "
                         f"Something is trying to tamper with the monitor itself."),
                severity="critical", path=source, process_name=basename(source),
                pid=_int_or_none(data.get("SourceProcessId")),
                signature_id="kernel.self_tamper",
                evidence={"granted_access": data.get("GrantedAccess"), "target": target},
            )]
        if not is_roblox_image(target):
            return []
        return [Detection(
            source="kernel", kind="process_access", subject=source,
            message=(f"{basename(source)} opened {basename(target)} with memory-write rights "
                     f"({data.get('GrantedAccess')}) — the handle an injector needs."),
            severity="high", path=source, process_name=basename(source),
            pid=_int_or_none(data.get("SourceProcessId")),
            signature_id="kernel.process_access",
            evidence={"granted_access": data.get("GrantedAccess"), "target": target,
                      "call_trace": data.get("CallTrace", "")[:400]},
        )]

    def _sysmon_file_create(self, data: dict[str, str]) -> list[Detection]:
        path = data.get("TargetFilename")
        if not path:
            return []
        return self.analyzer.analyze_file(path, event="sysmon_create")

    def _sysmon_dns(self, data: dict[str, str]) -> list[Detection]:
        """Event 22: a process asked for a name. This is where a download page
        or a C2 domain shows up before any traffic flows."""
        query = data.get("QueryName")
        if not query:
            return []
        return self.analyzer.analyze_domain(
            query,
            pid=_int_or_none(data.get("ProcessId")),
            process_name=basename(data.get("Image")),
            source="kernel",
        )

    def _sysmon_tampering(self, data: dict[str, str]) -> list[Detection]:
        """Event 25: the image on disk no longer matches the running process —
        process hollowing, herpaderping, or a replaced binary."""
        image = data.get("Image") or ""
        return [Detection(
            source="kernel", kind="process_tampering", subject=image,
            message=(f"Process tampering detected in {basename(image)} ({data.get('Type', 'unknown')}). "
                     f"The running code no longer matches the file it came from."),
            severity="critical", path=image, process_name=basename(image),
            pid=_int_or_none(data.get("ProcessId")),
            signature_id="kernel.process_tampering",
            evidence={"type": data.get("Type")},
        )]

    # ----------------------------------------------------------- defender
    def _defender(self, record: dict[str, Any]) -> list[Detection]:
        data = record.get("data", {})
        event_id = record.get("event_id")
        if event_id in (1006, 1015, 1116):
            name = data.get("Threat Name") or data.get("ThreatName") or "unnamed threat"
            path = data.get("Path") or data.get("Process Name") or ""
            return [Detection(
                source="kernel", kind="defender_detection", subject=path or name,
                message=f"Microsoft Defender detected malware: {name}. {path}".strip(),
                severity="critical", path=path or None,
                signature_id="defender.detection",
                evidence={"threat": name, "severity": data.get("Severity Name")},
            )]
        if event_id in (5001, 5010, 5012):
            return [Detection(
                source="kernel", kind="defender_disabled", subject="Microsoft Defender",
                message=("Microsoft Defender real-time protection was turned OFF. Executor "
                         "installers ask users to do this — it is the step that lets the "
                         "bundled stealer run."),
                severity="critical", signature_id="defender.disabled",
                evidence={"event_id": event_id},
            )]
        if event_id == 5007:
            old, new = data.get("Old Value", ""), data.get("New Value", "")
            if "exclusion" not in f"{old}{new}".lower():
                return []
            return [Detection(
                source="kernel", kind="defender_exclusion", subject="Microsoft Defender",
                message=f"A Microsoft Defender exclusion was added or changed: {new or old}",
                severity="high", signature_id="defender.exclusion",
                evidence={"old": old[:200], "new": new[:200]},
            )]
        return []

    # ----------------------------------------------------------- security
    def _security(self, record: dict[str, Any]) -> list[Detection]:
        if record.get("event_id") != 4688:
            return []
        data = record.get("data", {})
        image = data.get("NewProcessName")
        if not image:
            return []
        return self.analyzer.analyze_process({
            "pid": _int_or_none(data.get("NewProcessId")),
            "name": basename(image),
            "exe": image,
            "cmdline": data.get("CommandLine"),
            "parent_name": basename(data.get("ParentProcessName")),
            "source": "security-log",
        })


def _int_or_none(value: Any) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


# -------------------------------------------------------------------- monitor
class WindowsEventMonitor:
    """Polls the event channels and feeds new records to the analyzer."""

    def __init__(self, config: Config, analyzer: Analyzer, sink: Sink) -> None:
        self.config = config
        self.sink = sink
        self.event_analyzer = WindowsEventAnalyzer(config, analyzer)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._bookmarks: dict[str, int] = {}
        self.mode = "idle"
        self.events_seen = 0
        self.available: dict[str, bool] = {}
        self.degraded_reason: str | None = None

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        if not IS_WINDOWS:
            self.mode = "unavailable (not Windows)"
            self.degraded_reason = "kernel event channels are Windows-only"
            return
        if not shutil.which("wevtutil"):
            self.mode = "unavailable (wevtutil missing)"
            self.degraded_reason = "wevtutil was not found on PATH"
            return
        self.available = {name: self._channel_available(channel)
                          for name, channel in self._configured_channels()}
        if not any(self.available.values()):
            self.mode = "no channels"
            self.degraded_reason = (
                "no readable event channels. Install Sysmon (free, from Microsoft) for "
                "kernel-level injection and driver-load detection, and run Candy as "
                "administrator to read the Security and Defender channels."
            )
            return
        # Start from the current end of each channel so the first poll does not
        # replay weeks of history as fresh alerts.
        for name, channel in self._configured_channels():
            if self.available.get(name):
                self._bookmarks[channel] = self._latest_record_id(channel)
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="winevents", daemon=True)
        self._thread.start()
        live = [name for name, ok in self.available.items() if ok]
        self.mode = "wevtutil:" + ",".join(live)

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        self.mode = "idle"

    def _configured_channels(self) -> list[tuple[str, str]]:
        configured = self.config.get("winevents.channels", {}) or {}
        pairs = []
        for name, channel in (("sysmon", SYSMON_CHANNEL),
                              ("defender", DEFENDER_CHANNEL),
                              ("security", SECURITY_CHANNEL)):
            if configured.get(name, True):
                pairs.append((name, channel))
        return pairs

    # --------------------------------------------------------------- query
    def _run_wevtutil(self, args: list[str], timeout: int = 30) -> str | None:
        try:
            completed = subprocess.run(
                ["wevtutil", *args], capture_output=True, text=True,
                timeout=timeout, check=False,
                creationflags=0x08000000 if IS_WINDOWS else 0,
            )
        except Exception:  # noqa: BLE001 - missing channel, denied access, timeout
            return None
        if completed.returncode != 0:
            return None
        return completed.stdout

    def _channel_available(self, channel: str) -> bool:
        return self._run_wevtutil(["qe", channel, "/c:1", "/f:xml", "/rd:true"]) is not None

    def _latest_record_id(self, channel: str) -> int:
        raw = self._run_wevtutil(["qe", channel, "/c:1", "/f:xml", "/rd:true"])
        events = parse_events(raw or "")
        return events[0]["record_id"] if events else 0

    def _loop(self) -> None:
        interval = max(3, int(self.config.get("winevents.poll_interval_seconds", 8)))
        while not self._stop.is_set():
            try:
                self.poll_once()
            except Exception:  # noqa: BLE001 - a monitor must never die silently
                pass
            self._stop.wait(interval)

    def poll_once(self) -> int:
        """Read everything new on each channel. Returns the number of events."""
        count = 0
        limit = int(self.config.get("winevents.max_events_per_poll", 200))
        for name, channel in self._configured_channels():
            if not self.available.get(name):
                continue
            since = self._bookmarks.get(channel, 0)
            # Newest-first with a cap: on a busy machine this bounds the work per
            # cycle, and the bookmark makes sure nothing is analysed twice.
            raw = self._run_wevtutil(["qe", channel, f"/c:{limit}", "/f:xml", "/rd:true"])
            if raw is None:
                continue
            records = [r for r in parse_events(raw) if r["record_id"] > since]
            if not records:
                continue
            self._bookmarks[channel] = max(r["record_id"] for r in records)
            # Oldest first, so the alert order matches what actually happened.
            for record in sorted(records, key=lambda r: r["record_id"]):
                count += 1
                self.events_seen += 1
                for detection in self.event_analyzer.analyze(record):
                    self.sink(detection)
        return count

    # -------------------------------------------------------------- status
    def status(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "channels": self.available,
            "events_seen": self.events_seen,
            "degraded": self.degraded_reason,
        }


def sysmon_installed() -> bool:
    """True if the Sysmon channel can be read (i.e. Sysmon is installed)."""
    if not IS_WINDOWS or not shutil.which("wevtutil"):
        return False
    try:
        completed = subprocess.run(
            ["wevtutil", "gl", SYSMON_CHANNEL], capture_output=True, text=True,
            timeout=15, check=False, creationflags=0x08000000,
        )
        return completed.returncode == 0
    except Exception:  # noqa: BLE001
        return False
