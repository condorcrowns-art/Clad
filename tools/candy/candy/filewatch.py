"""File system watcher for the folders executors land in.

Uses ``watchdog`` (free, Apache-2.0) for real-time events when it is
installed, and falls back to a directory-diff poller when it is not, so the
tool still works from a bare Python install.
"""
from __future__ import annotations

import os
import threading
import time
from pathlib import Path
from typing import Any, Callable, Iterable

from .config import Config
from .detect import Analyzer
from .events import Detection
from .util import sha256_file, wait_until_stable

Sink = Callable[[Detection], None]

# Directories that generate constant churn and no useful signal. Skipping them
# is what keeps the poller under the CPU budget.
SKIP_DIR_NAMES = {
    "node_modules", ".git", "$recycle.bin", "system volume information",
    "windowsapps", "winsxs", "assembly", "installer", "servicing",
}

MAX_SCAN_DEPTH = 6


class FileWatcher:
    def __init__(self, config: Config, analyzer: Analyzer, sink: Sink) -> None:
        self.config = config
        self.analyzer = analyzer
        self.sink = sink
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._observer: Any = None
        self._index: dict[str, tuple[float, int]] = {}
        self.mode = "idle"
        self.files_seen = 0
        self.last_cycle: float = 0.0

    # ------------------------------------------------------------ lifecycle
    def start(self) -> None:
        self._stop.clear()
        roots = self.config.watch_paths()
        if not roots:
            self.mode = "no-watch-paths"
            return
        # Seed the index so the first pass does not report every pre-existing
        # file as "newly created".
        for root in roots:
            self._walk(root, index_only=True)
        if not self._try_start_watchdog(roots):
            self._thread = threading.Thread(target=self._poll_loop, name="filewatch-poll", daemon=True)
            self._thread.start()
            self.mode = "poll"

    def stop(self) -> None:
        self._stop.set()
        if self._observer is not None:  # pragma: no cover - needs watchdog
            try:
                self._observer.stop()
                self._observer.join(timeout=3)
            except Exception:  # noqa: BLE001
                pass
            self._observer = None
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        self.mode = "idle"

    def _try_start_watchdog(self, roots: Iterable[Path]) -> bool:
        try:  # pragma: no cover - optional dependency
            from watchdog.events import FileSystemEventHandler
            from watchdog.observers import Observer
        except ImportError:
            return False

        watcher = self

        class _Handler(FileSystemEventHandler):  # pragma: no cover
            def on_created(self, event):
                if not event.is_directory:
                    watcher.handle_path(event.src_path, "created")

            def on_moved(self, event):
                if not event.is_directory:
                    watcher.handle_path(event.dest_path, "moved")

            def on_modified(self, event):
                if not event.is_directory:
                    watcher.handle_path(event.src_path, "modified")

        try:  # pragma: no cover
            observer = Observer()
            recursive = bool(self.config.get("filewatch.recursive", True))
            for root in roots:
                observer.schedule(_Handler(), str(root), recursive=recursive)
            observer.daemon = True
            observer.start()
            self._observer = observer
            self.mode = "watchdog"
            return True
        except Exception:  # noqa: BLE001
            return False

    # ---------------------------------------------------------------- poll
    def _poll_loop(self) -> None:
        interval = max(2, int(self.config.get("filewatch.poll_interval_seconds", 4)))
        while not self._stop.is_set():
            try:
                for root in self.config.watch_paths():
                    self._walk(root)
                self.last_cycle = time.time()
            except Exception:  # noqa: BLE001
                pass
            self._stop.wait(interval)

    def _walk(self, root: Path, *, index_only: bool = False, depth: int = 0) -> None:
        if depth > MAX_SCAN_DEPTH or self._stop.is_set():
            return
        try:
            entries = list(os.scandir(root))
        except (OSError, PermissionError):
            return
        recursive = bool(self.config.get("filewatch.recursive", True))
        for entry in entries:
            try:
                if entry.is_dir(follow_symlinks=False):
                    if recursive and entry.name.lower() not in SKIP_DIR_NAMES:
                        self._walk(Path(entry.path), index_only=index_only, depth=depth + 1)
                    continue
                if not self._extension_of_interest(entry.name):
                    continue
                stat = entry.stat()
                key = entry.path.lower()
                fingerprint = (stat.st_mtime, stat.st_size)
                if self._index.get(key) == fingerprint:
                    continue
                self._index[key] = fingerprint
                if not index_only:
                    self.handle_path(entry.path, "created")
            except (OSError, PermissionError):
                continue

    def _extension_of_interest(self, name: str) -> bool:
        extensions = [str(e).lower() for e in self.config.get("filewatch.extensions", [])]
        lowered = name.lower()
        return any(lowered.endswith(ext) for ext in extensions)

    # ------------------------------------------------------------- analysis
    def handle_path(self, path: str, event: str) -> list[Detection]:
        """Analyse one file. Safe to call directly (used by on-demand scans)."""
        if not self._extension_of_interest(Path(path).name):
            return []
        target = Path(path)
        if not target.is_file():
            return []
        if self.config.is_whitelisted(name=target.name, path=str(target)):
            return []
        # A file that is still downloading would hash to something meaningless.
        wait_until_stable(target, timeout=8.0)
        digest = sha256_file(target, max_bytes=int(self.config.get("filewatch.max_hash_bytes", 134217728)))
        self.files_seen += 1
        detections = self.analyzer.analyze_file(str(target), sha256=digest, event=event)
        for detection in detections:
            self.sink(detection)
        return detections

    # ------------------------------------------------------------ on-demand
    def scan_paths(self, paths: Iterable[str | Path], *, progress: Callable[[str], None] | None = None) -> dict[str, int]:
        """Recursively scan the given paths right now."""
        stats = {"files": 0, "detections": 0}
        for raw in paths:
            root = Path(raw)
            if root.is_file():
                targets = [root]
            elif root.is_dir():
                targets = self._iter_files(root)
            else:
                continue
            for target in targets:
                if self._stop.is_set():
                    return stats
                if progress:
                    progress(str(target))
                stats["files"] += 1
                stats["detections"] += len(self.handle_path(str(target), "scan"))
        return stats

    def _iter_files(self, root: Path, depth: int = 0) -> Iterable[Path]:
        if depth > MAX_SCAN_DEPTH:
            return
        try:
            entries = list(os.scandir(root))
        except (OSError, PermissionError):
            return
        for entry in entries:
            try:
                if entry.is_dir(follow_symlinks=False):
                    if entry.name.lower() not in SKIP_DIR_NAMES:
                        yield from self._iter_files(Path(entry.path), depth + 1)
                elif self._extension_of_interest(entry.name):
                    yield Path(entry.path)
            except (OSError, PermissionError):
                continue
