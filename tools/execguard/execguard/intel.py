"""Optional threat-intelligence lookups (VirusTotal, AbuseIPDB).

Both services have a free tier, and both require *your own* API key. Nothing
here costs money, and nothing here runs unless you set
``intel.enable_lookups`` and paste a key into config.json.

Privacy note, stated plainly because it matters: a lookup sends the file hash
or the remote IP address to a third party. Hashes are not file contents, but
they do reveal that a specific file exists on your machine. This is why the
feature ships disabled.
"""
from __future__ import annotations

import json
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from .config import Config
from .util import ensure_dir, utc_stamp

VT_FILE_URL = "https://www.virustotal.com/api/v3/files/{}"
ABUSEIPDB_URL = "https://api.abuseipdb.com/api/v2/check"

# VirusTotal's free tier allows 4 requests/minute. We self-throttle so a busy
# machine cannot burn the daily quota (or get the key rate-limited) in a
# minute of file activity.
VT_MIN_INTERVAL = 16.0
ABUSE_MIN_INTERVAL = 2.0


class IntelClient:
    def __init__(self, config: Config, cache_path: Path | None = None) -> None:
        self.config = config
        self.cache_path = cache_path or (config.data_dir() / "intel_cache.json")
        self._lock = threading.Lock()
        self._cache: dict[str, dict[str, Any]] = {}
        self._last_call: dict[str, float] = {}
        self._load_cache()

    # --------------------------------------------------------------- cache
    def _load_cache(self) -> None:
        try:
            if self.cache_path.exists():
                self._cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001 - a bad cache is not fatal
            self._cache = {}

    def _save_cache(self) -> None:
        try:
            ensure_dir(self.cache_path.parent)
            self.cache_path.write_text(json.dumps(self._cache, indent=1), encoding="utf-8")
        except OSError:
            pass

    def _cached(self, key: str) -> dict[str, Any] | None:
        entry = self._cache.get(key)
        if not entry:
            return None
        ttl = float(self.config.get("intel.cache_ttl_hours", 24)) * 3600
        if time.time() - entry.get("_fetched", 0) > ttl:
            return None
        return entry

    def _store(self, key: str, value: dict[str, Any]) -> dict[str, Any]:
        value["_fetched"] = time.time()
        value["_checked_at"] = utc_stamp()
        with self._lock:
            self._cache[key] = value
            if len(self._cache) > 5000:
                # Drop the oldest half rather than clearing everything.
                ordered = sorted(self._cache.items(), key=lambda kv: kv[1].get("_fetched", 0))
                self._cache = dict(ordered[len(ordered) // 2:])
            self._save_cache()
        return value

    def _throttle(self, provider: str, min_interval: float) -> bool:
        """Returns False if we must skip this call to respect the rate limit."""
        with self._lock:
            last = self._last_call.get(provider, 0.0)
            if time.time() - last < min_interval:
                return False
            self._last_call[provider] = time.time()
        return True

    # -------------------------------------------------------------- status
    @property
    def enabled(self) -> bool:
        return bool(self.config.get("intel.enable_lookups", False))

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "virustotal": bool(self.config.get("intel.virustotal_api_key")),
            "abuseipdb": bool(self.config.get("intel.abuseipdb_api_key")),
            "cached_entries": len(self._cache),
        }

    # ------------------------------------------------------------- lookups
    def check_hash(self, sha256: str) -> dict[str, Any] | None:
        """VirusTotal file report. Returns None when disabled/unavailable."""
        key_material = self.config.get("intel.virustotal_api_key", "")
        if not self.enabled or not key_material or not sha256:
            return None
        cache_key = f"vt:{sha256.lower()}"
        cached = self._cached(cache_key)
        if cached is not None:
            return cached
        if not self._throttle("virustotal", VT_MIN_INTERVAL):
            return None

        request = urllib.request.Request(
            VT_FILE_URL.format(sha256),
            headers={"x-apikey": key_material, "Accept": "application/json",
                     "User-Agent": "ExecGuard/1.0"},
        )
        try:
            timeout = int(self.config.get("intel.request_timeout_seconds", 10))
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return self._store(cache_key, {"provider": "virustotal", "known": False,
                                               "malicious": False, "summary": "not seen by VirusTotal"})
            return None
        except Exception:  # noqa: BLE001 - offline, DNS, quota: all non-fatal
            return None

        stats = (payload.get("data", {}).get("attributes", {}).get("last_analysis_stats", {}) or {})
        malicious_count = int(stats.get("malicious", 0)) + int(stats.get("suspicious", 0))
        threshold = int(self.config.get("intel.min_vt_detections", 3))
        return self._store(cache_key, {
            "provider": "virustotal",
            "known": True,
            "malicious": malicious_count >= threshold,
            "detections": malicious_count,
            "total": sum(int(v) for v in stats.values() if isinstance(v, (int, float))),
            "severity": "critical" if malicious_count >= 10 else "high" if malicious_count >= threshold else "info",
            "summary": f"{malicious_count} engines flag this file",
        })

    def check_ip(self, ip: str) -> dict[str, Any] | None:
        """AbuseIPDB reputation for an IP address."""
        key_material = self.config.get("intel.abuseipdb_api_key", "")
        if not self.enabled or not key_material or not ip:
            return None
        cache_key = f"abuse:{ip}"
        cached = self._cached(cache_key)
        if cached is not None:
            return cached
        if not self._throttle("abuseipdb", ABUSE_MIN_INTERVAL):
            return None

        query = urllib.parse.urlencode({"ipAddress": ip, "maxAgeInDays": 90})
        request = urllib.request.Request(
            f"{ABUSEIPDB_URL}?{query}",
            headers={"Key": key_material, "Accept": "application/json",
                     "User-Agent": "ExecGuard/1.0"},
        )
        try:
            timeout = int(self.config.get("intel.request_timeout_seconds", 10))
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception:  # noqa: BLE001
            return None

        data = payload.get("data", {}) or {}
        score = int(data.get("abuseConfidenceScore", 0))
        return self._store(cache_key, {
            "provider": "abuseipdb",
            "malicious": score >= 50,
            "score": score,
            "country": data.get("countryCode"),
            "domain": data.get("domain"),
            "reports": data.get("totalReports"),
            "severity": "high" if score >= 80 else "medium" if score >= 50 else "info",
            "summary": f"abuse confidence {score}% from {data.get('totalReports', 0)} reports",
        })
