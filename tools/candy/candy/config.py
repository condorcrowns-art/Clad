"""Configuration loading, defaults, and the whitelist/blacklist model."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from .util import app_dir, compile_pattern, ensure_dir, expand_path, is_within, normalize_path

CONFIG_VERSION = 1

# Default watch roots. %VAR% is expanded at load time; missing directories are
# skipped silently so the same config works on every machine.
DEFAULT_WATCH_PATHS = [
    r"%USERPROFILE%\Downloads",
    r"%USERPROFILE%\Desktop",
    r"%USERPROFILE%\Documents",
    r"%USERPROFILE%\AppData\Local\Temp",
    r"%APPDATA%",
    r"%LOCALAPPDATA%\Roblox",
    r"%PUBLIC%\Downloads",
]

DEFAULTS: dict[str, Any] = {
    "version": CONFIG_VERSION,
    "protection": {
        "process_monitor": True,
        "file_watcher": True,
        "network_monitor": True,
        "behavior_engine": True,
        "self_protection": True,
        # Kernel-sourced telemetry read from Sysmon/Defender/Security channels.
        "kernel_events": True,
        "persistence_auditor": True,
        "anomaly_engine": True,
    },
    "response": {
        # observe  - detect and log only (safe default)
        # prompt   - detect, log, and ask before acting (GUI only)
        # enforce  - detect and act automatically
        "mode": "observe",
        "auto_kill": False,
        "auto_quarantine": False,
        "auto_firewall": False,
        "auto_block_domains": False,
        # Aggregated score at which enforcement acts on a subject. 75 means a
        # single high-confidence signal (a named executor, an injected module)
        # is enough, and so are two medium ones.
        "action_threshold": 75,
        # Never act on these even at max score. Guards against a bad signature
        # bricking the machine.
        "protected_processes": [
            "explorer.exe", "csrss.exe", "wininit.exe", "winlogon.exe", "services.exe",
            "lsass.exe", "smss.exe", "svchost.exe", "system", "registry", "dwm.exe",
            "fontdrvhost.exe", "sihost.exe", "ctfmon.exe", "msmpeng.exe", "securityhealthservice.exe",
        ],
    },
    "paths": {
        "watch": list(DEFAULT_WATCH_PATHS),
        "quarantine": "quarantine",
        "logs": "logs",
        "data": "data",
    },
    "filewatch": {
        "extensions": [".exe", ".dll", ".sys", ".tmp", ".scr", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jar", ".zip", ".rar", ".7z"],
        "max_hash_bytes": 134217728,
        "recursive": True,
        "poll_interval_seconds": 4,
    },
    "network": {
        "poll_interval_seconds": 5,
        # Ports that executors and their loaders commonly bind locally for the
        # browser/injector handshake. Presence alone is weak evidence.
        "suspicious_local_ports": [6969, 7777, 8080, 9090, 13337, 27015],
        "alert_on_private_ranges": False,
    },
    "behavior": {
        "poll_interval_seconds": 6,
        "cpu_threshold_percent": 80.0,
        "cpu_sustained_samples": 3,
        "handle_threshold": 4000,
        # Processes whose loaded modules we audit for injected DLLs.
        "protected_targets": ["robloxplayerbeta.exe", "robloxstudiobeta.exe"],
        "check_module_signatures": True,
    },
    "winevents": {
        # Which event channels to read. Sysmon is the valuable one: install it
        # from Microsoft (free) to get kernel-level injection and driver-load
        # detection. The others work with what Windows already logs.
        "channels": {"sysmon": True, "defender": True, "security": True},
        "poll_interval_seconds": 8,
        "max_events_per_poll": 200,
    },
    "persistence": {
        "interval_minutes": 15,
        "audit_on_start": True,
    },
    "quarantine": {
        # AES-256-GCM at rest. Pure-Python AES is ~1 MB/s, so larger files fall
        # back to XOR defanging rather than stalling the pipeline.
        "encrypt": True,
        "encrypt_max_bytes": 33554432,
    },
    "prevent": {
        "stub_program": r"%SystemRoot%\System32\systray.exe",
        "auto_block_execution": False,
        "auto_contain_network": False,
    },
    "anomaly": {
        "sample_interval_seconds": 15,
        "max_beacon_jitter": 0.20,
        "fanout_hosts": 25,
    },
    "download_guard": {
        # off       - no gating
        # balanced  - reject known-bad and high-risk downloads
        # fortress  - reject every unsigned internet-downloaded executable
        "policy": "balanced",
        "reject_score": 60,
        "triage": True,
    },
    "dns": {
        # A local filtering resolver: wildcard blocking, live phishing analysis
        # on every lookup, and a complete query log. Needs port 53, so admin.
        "enabled": False,
        "listen": "127.0.0.1",
        "port": 53,
        "upstream_resolver": "quad9",
        "upstream": [],
        "upstream_timeout_seconds": 3.0,
        "cache_seconds": 300,
        "phishing_analysis": True,
        "phishing_block_score": 70,
        "set_system_dns": True,
    },
    "adblock": {
        "enabled": False,
        "categories": ["ads", "trackers", "malvertising", "fake_download"],
        "allow": [],
        "max_entries": 60000,
        "lists": [],
    },
    "phishing": {
        "enabled": True,
        "block_score": 70,
    },
    "web": {
        # Domain blocking writes a marked, backed-up block into the hosts file.
        # Leave hosts_file empty to use the platform default.
        "hosts_file": "",
        # Also add firewall rules for the domain's IPs, because a browser doing
        # its own DNS-over-HTTPS ignores the hosts file.
        "resolve_and_block_ips": True,
    },
    "pe": {
        # Read version resources and section entropy from Windows binaries.
        "inspect": True,
    },
    "notifications": {
        "tray_icon": True,
        "toasts": True,
        "min_severity": "high",
        "min_interval_seconds": 20,
    },
    "intel": {
        "enable_lookups": False,
        "virustotal_api_key": "",
        "abuseipdb_api_key": "",
        "cache_ttl_hours": 24,
        "request_timeout_seconds": 10,
        "min_vt_detections": 3,
    },
    "updates": {
        "threat_feed_url": "",
        "auto_update": False,
        "interval_hours": 12,
        # Post-quantum (CNSA 2.0) feed authentication. Paste the LMS public key
        # printed by 'candy key generate'; the feed is then rejected unless it
        # carries a valid signature from that exact key.
        "trusted_public_key": "",
        "require_signature": False,
    },
    "scan": {
        "on_start": False,
        "on_schedule": False,
        "interval_minutes": 120,
        "paths": [],
    },
    "logging": {
        "max_log_bytes": 10485760,
        "keep_rotations": 5,
        "hash_chain": True,
    },
    "whitelist": {
        "names": [],
        "domains": [],
        "paths": [
            r"%SystemRoot%",
            r"%ProgramFiles%",
            r"%ProgramFiles(x86)%",
            r"%LOCALAPPDATA%\Roblox",
        ],
        "hashes": [],
        "ips": [],
    },
    "blacklist": {
        "names": [],
        "hashes": [],
        "ips": [],
        "domains": [],
        "patterns": [],
    },
    "ui": {
        "start_minimized": False,
        "refresh_ms": 800,
        "max_rows": 500,
    },
}


def deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge ``override`` into a copy of ``base``.

    Used so a user config that only sets two keys still gets every default,
    and so new defaults appear after an upgrade without editing config.json.
    """
    result = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


class Config:
    """Mutable, thread-safe view over config.json."""

    def __init__(self, data: dict[str, Any], path: Path | None = None) -> None:
        self.data = deep_merge(DEFAULTS, data or {})
        self.path = path
        self._lock = threading.RLock()
        self._rebuild_caches()

    # ------------------------------------------------------------------ load
    @classmethod
    def load(cls, path: str | os.PathLike | None = None) -> "Config":
        """Load config.json, falling back to defaults if it is missing.

        A corrupt config is *not* silently replaced — we raise, because
        silently running with default (weaker) settings is worse than failing
        loudly.
        """
        config_path = Path(path) if path else app_dir() / "config" / "config.json"
        if not config_path.exists():
            cfg = cls({}, config_path)
            cfg.save()
            return cfg
        with config_path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        return cls(data, config_path)

    def save(self, path: str | os.PathLike | None = None) -> Path:
        """Atomically write the config (temp file + replace)."""
        target = Path(path) if path else self.path
        if target is None:
            raise ValueError("no config path to save to")
        ensure_dir(target.parent)
        tmp = target.with_suffix(target.suffix + ".tmp")
        with self._lock:
            payload = json.dumps(self.data, indent=2, sort_keys=False)
        tmp.write_text(payload, encoding="utf-8")
        os.replace(tmp, target)
        self.path = target
        return target

    # ------------------------------------------------------------------ get
    def get(self, dotted: str, default: Any = None) -> Any:
        node: Any = self.data
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                return default
            node = node[part]
        return node

    def set(self, dotted: str, value: Any) -> None:
        parts = dotted.split(".")
        with self._lock:
            node = self.data
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = value
            self._rebuild_caches()

    # ------------------------------------------------------------- computed
    def _rebuild_caches(self) -> None:
        self._whitelist_paths = [
            normalize_path(expand_path(p)) for p in self.get("whitelist.paths", []) if p
        ]
        self._whitelist_names = {str(n).lower() for n in self.get("whitelist.names", [])}
        self._whitelist_hashes = {str(h).lower() for h in self.get("whitelist.hashes", [])}
        self._whitelist_ips = {str(i) for i in self.get("whitelist.ips", [])}
        self._whitelist_domains = {str(d).lower().lstrip("*.") for d in self.get("whitelist.domains", [])}
        self._blacklist_domains = {str(d).lower().lstrip("*.") for d in self.get("blacklist.domains", [])}
        self._protected = {str(n).lower() for n in self.get("response.protected_processes", [])}
        self._blacklist_names = {str(n).lower() for n in self.get("blacklist.names", [])}
        self._blacklist_hashes = {str(h).lower() for h in self.get("blacklist.hashes", [])}
        self._blacklist_ips = {str(i) for i in self.get("blacklist.ips", [])}
        self._blacklist_patterns = [compile_pattern(p) for p in self.get("blacklist.patterns", []) if p]

    def watch_paths(self) -> list[Path]:
        """Existing directories from ``paths.watch``. Missing ones are dropped."""
        out: list[Path] = []
        for raw in self.get("paths.watch", []):
            path = expand_path(raw)
            if path.is_dir():
                out.append(path)
        return out

    def quarantine_dir(self) -> Path:
        return ensure_dir(expand_path(self.get("paths.quarantine", "quarantine")))

    def log_dir(self) -> Path:
        return ensure_dir(expand_path(self.get("paths.logs", "logs")))

    def data_dir(self) -> Path:
        return ensure_dir(expand_path(self.get("paths.data", "data")))

    # ------------------------------------------------------------- verdicts
    def is_whitelisted(self, *, name: str | None = None, path: str | None = None,
                       sha256: str | None = None) -> bool:
        """Whitelist wins over every blacklist and heuristic, by design."""
        if name and name.lower() in self._whitelist_names:
            return True
        if sha256 and sha256.lower() in self._whitelist_hashes:
            return True
        if path:
            for allowed in self._whitelist_paths:
                if is_within(path, allowed):
                    return True
        return False

    def is_ip_whitelisted(self, ip: str) -> bool:
        return ip in self._whitelist_ips

    def is_domain_whitelisted(self, domain: str) -> bool:
        """A whitelisted domain covers its subdomains too."""
        return self._domain_matches(domain, self._whitelist_domains)

    def domain_blacklisted(self, domain: str) -> bool:
        return self._domain_matches(domain, self._blacklist_domains)

    @staticmethod
    def _domain_matches(domain: str, listed: set[str]) -> bool:
        domain = (domain or "").lower().rstrip(".")
        if not domain or not listed:
            return False
        parts = domain.split(".")
        return any(".".join(parts[i:]) in listed for i in range(len(parts)))

    def is_protected_process(self, name: str | None) -> bool:
        """Critical OS processes we refuse to terminate, whatever the score."""
        return bool(name) and name.lower() in self._protected

    def user_blacklist_hit(self, *, name: str | None = None, path: str | None = None,
                           sha256: str | None = None) -> str | None:
        """Return a human-readable reason if the user's own lists match."""
        if name and name.lower() in self._blacklist_names:
            return f"process name '{name}' is on the user blacklist"
        if sha256 and sha256.lower() in self._blacklist_hashes:
            return f"SHA-256 {sha256[:16]}… is on the user blacklist"
        haystack = f"{name or ''} {path or ''}"
        for pattern in self._blacklist_patterns:
            if pattern.search(haystack):
                return f"matches user blacklist pattern /{pattern.pattern}/"
        return None

    def ip_blacklisted(self, ip: str) -> bool:
        return ip in self._blacklist_ips

    # --------------------------------------------------------------- lists
    def add_list_entry(self, list_name: str, field: str, value: str) -> bool:
        """Add to whitelist/blacklist and persist. Returns False on duplicate."""
        if list_name not in ("whitelist", "blacklist", "adblock"):
            raise ValueError(f"unknown list: {list_name}")
        with self._lock:
            bucket = self.data.setdefault(list_name, {}).setdefault(field, [])
            if value in bucket:
                return False
            bucket.append(value)
            self._rebuild_caches()
        if self.path:
            self.save()
        return True

    def remove_list_entry(self, list_name: str, field: str, value: str) -> bool:
        with self._lock:
            bucket = self.data.get(list_name, {}).get(field, [])
            if value not in bucket:
                return False
            bucket.remove(value)
            self._rebuild_caches()
        if self.path:
            self.save()
        return True

    @property
    def enforcing(self) -> bool:
        return self.get("response.mode") == "enforce"
