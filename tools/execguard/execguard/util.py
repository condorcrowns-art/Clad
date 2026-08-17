"""Small helpers shared by every ExecGuard component.

Everything in here must import and run on non-Windows platforms so the core
logic stays unit-testable off Windows.
"""
from __future__ import annotations

import hashlib
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

IS_WINDOWS = sys.platform.startswith("win")

# 1 MiB read chunks: big enough to be fast, small enough not to spike RAM.
_HASH_CHUNK = 1024 * 1024

# Files larger than this are not hashed by the watcher (installers/ISOs would
# otherwise stall the pipeline). On-demand scans can override.
DEFAULT_MAX_HASH_BYTES = 128 * 1024 * 1024


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_stamp() -> str:
    """ISO-8601 UTC timestamp, second resolution, always suffixed with Z."""
    return utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def app_dir() -> Path:
    """Directory the app lives in.

    Under PyInstaller ``sys.frozen`` is set and ``sys.executable`` is the
    single-file exe, which is what "portable app" means for us: config, logs
    and quarantine sit next to the exe.
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def resource_dir() -> Path:
    """Directory holding files bundled *with* the program.

    Under PyInstaller one-file builds this is the temporary extraction
    directory (``sys._MEIPASS``), which is where ``--add-data`` payloads such
    as the seed threat database live. It is read-only in spirit: writable
    state always goes to :func:`app_dir` instead.
    """
    bundled = getattr(sys, "_MEIPASS", None)
    return Path(bundled) if bundled else app_dir()


def looks_absolute(value: str) -> bool:
    """Absolute on *either* platform.

    ``Path("C:/x").is_absolute()`` is False on Linux, which would otherwise
    turn a Windows config path into a nonsense relative path during testing.
    Drive letters and UNC prefixes are recognised on every host.
    """
    text = str(value)
    if Path(text).is_absolute():
        return True
    if len(text) >= 3 and text[1] == ":" and text[2] in "\\/" and text[0].isalpha():
        return True
    return text.startswith("\\\\") or text.startswith("//")


def expand_path(value: str) -> Path:
    """Expand ``%VAR%``, ``$VAR`` and ``~`` and make the result absolute.

    Relative paths resolve against :func:`app_dir` so a portable install can be
    moved around without editing the config.
    """
    expanded = os.path.expandvars(os.path.expanduser(str(value)))
    path = Path(expanded)
    if not looks_absolute(expanded):
        path = app_dir() / path
    return path


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def sha256_file(path: os.PathLike | str, max_bytes: int | None = DEFAULT_MAX_HASH_BYTES) -> str | None:
    """SHA-256 of a file, or ``None`` if it cannot be read / is too large.

    Returning ``None`` instead of raising keeps callers simple: a file that is
    locked, deleted mid-write, or oversized is simply "not hashable yet".
    """
    try:
        p = Path(path)
        if max_bytes is not None and p.stat().st_size > max_bytes:
            return None
        digest = hashlib.sha256()
        with p.open("rb") as handle:
            for chunk in iter(lambda: handle.read(_HASH_CHUNK), b""):
                digest.update(chunk)
        return digest.hexdigest()
    except (OSError, ValueError):
        return None


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def wait_until_stable(path: os.PathLike | str, timeout: float = 10.0, settle: float = 0.4) -> bool:
    """Block until a file stops growing, so we do not hash a partial download.

    Returns True if the size held steady twice in a row before ``timeout``.
    """
    p = Path(path)
    deadline = time.monotonic() + timeout
    last = -1
    while time.monotonic() < deadline:
        try:
            size = p.stat().st_size
        except OSError:
            return False
        if size == last:
            return True
        last = size
        time.sleep(settle)
    return False


def compile_pattern(pattern: str) -> re.Pattern:
    """Compile a signature pattern.

    Patterns are case-insensitive. A leading ``re:`` marks a raw regex;
    anything else is treated as a literal substring so non-technical users can
    contribute signatures without knowing regex.
    """
    if pattern.startswith("re:"):
        return re.compile(pattern[3:], re.IGNORECASE)
    return re.compile(re.escape(pattern), re.IGNORECASE)


def normalize_path(value: str | os.PathLike | None) -> str:
    """Lower-cased, forward-slashed path for comparisons.

    Windows paths are case-insensitive and users mix separators; comparing raw
    strings produces false negatives in the whitelist.
    """
    if not value:
        return ""
    return str(value).replace("\\", "/").rstrip("/").lower()


def basename(value: str | os.PathLike | None) -> str:
    """File name from a path, treating ``\\`` and ``/`` as separators.

    ``Path(...).name`` only understands the *host's* separator, so a Windows
    path handed to a Linux-hosted test (or to a log parser) would come back
    whole. Signature matching depends on getting the bare name right.
    """
    text = str(value or "").replace("\\", "/").rstrip("/")
    return text.rsplit("/", 1)[-1]


def is_within(child: str | os.PathLike | None, parent: str | os.PathLike | None) -> bool:
    """True if ``child`` is ``parent`` or lives underneath it."""
    c, p = normalize_path(child), normalize_path(parent)
    if not c or not p:
        return False
    return c == p or c.startswith(p + "/")


def human_bytes(count: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(count) < 1024.0:
            return f"{count:.0f} {unit}" if unit == "B" else f"{count:.1f} {unit}"
        count /= 1024.0
    return f"{count:.1f} TB"


def truncate(text: str, limit: int = 300) -> str:
    text = str(text)
    return text if len(text) <= limit else text[: limit - 1] + "…"
