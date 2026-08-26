"""Clipboard hijacking — the theft nobody notices until the money is gone.

A clipper is the simplest profitable malware there is. It watches the
clipboard, and when it sees something that looks like a payment destination it
silently replaces it with the attacker's. You copy your friend's wallet
address, you paste it, and it *looks* right — it is the right length, the
right shape, starts with the right characters — so you send. The same trick
works on Roblox trade links and on any "send to this user" field.

It needs no injection, no persistence, no privileges. It is often the entire
payload of a "free executor", because it monetises without ever touching the
account.

Detection here rests on one fact: **the clipboard does not change by itself.**
When a value that looks like a payment destination is replaced by a *different*
value of the same kind, and no application was asked to copy anything, the
substitution came from a program watching the clipboard.

Two modes:

* **Passive.** Poll the clipboard, remember the last value, and flag a swap
  where a destination of one type becomes a different destination of the same
  type. Genuine copies do this too — you copy one address, then another — so
  the window is short and the finding says plainly that it can be innocent.
* **Active.** ``probe()`` puts a known decoy address on the clipboard and reads
  it back a moment later. Nothing on the machine has any reason to alter it.
  If it comes back different, that is not a heuristic and not a coincidence:
  something rewrote the clipboard, and the report names what it became.

The address patterns are deliberately shape-based. Candy never checks a
balance, never contacts a chain, and never sends an address anywhere.
"""
from __future__ import annotations

import re
import threading
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable

from .config import Config
from .events import Detection
from .util import IS_WINDOWS, utc_stamp

# Shape-based patterns. Anchored, because a match inside a longer string is
# usually prose about an address rather than an address.
DESTINATION_PATTERNS: dict[str, re.Pattern[str]] = {
    "bitcoin": re.compile(r"^(?:[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{25,62})$"),
    "ethereum": re.compile(r"^0x[a-fA-F0-9]{40}$"),
    "litecoin": re.compile(r"^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$"),
    "monero": re.compile(r"^4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}$"),
    "solana": re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$"),
    "tron": re.compile(r"^T[1-9A-HJ-NP-Za-km-z]{33}$"),
    "roblox_trade": re.compile(r"^https?://(?:www\.)?roblox\.com/(?:trades|users)/\S+$",
                               re.I),
    "discord_invite": re.compile(r"^https?://(?:www\.)?discord(?:\.gg|app\.com/invite)/\S+$",
                                 re.I),
}

# The decoy used by the active probe. It must satisfy its own pattern above —
# a probe value that Candy's own classifier rejects makes the whole active
# check silently inert, which is exactly the bug the test below now catches.
# Note base58 excludes 0, O, I and l, so the text is spelled around them.
PROBE_VALUES: dict[str, str] = {
    "bitcoin": "1CandyDecoyAddressNotRea1DoNotUse11",
    "ethereum": "0xCADD000000000000000000000000000000000000",
}

SWAP_SCORE = 95
PROBE_SCORE = 130

# Win32 clipboard constants.
CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002


def classify(value: str) -> str | None:
    """Which kind of payment destination this text is, if any."""
    candidate = (value or "").strip()
    if not candidate or len(candidate) > 200:
        return None
    for kind, pattern in DESTINATION_PATTERNS.items():
        if pattern.match(candidate):
            return kind
    return None


def looks_like_destination(value: str) -> bool:
    return classify(value) is not None


@dataclass
class SwapFinding:
    kind: str
    before: str
    after: str
    seconds_apart: float = 0.0
    score: int = SWAP_SCORE
    severity: str = "high"
    probe: bool = False
    reasons: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def summary(self) -> str:
        return (f"clipboard {self.kind} destination changed from "
                f"{_short(self.before)} to {_short(self.after)}")


@dataclass
class ProbeResult:
    """What the active probe actually did, separate from what it found.

    ``ran`` is the question the old return value could not answer: did the
    check happen at all? A probe that could not touch the clipboard proves
    nothing, and must never be reported as "nothing is rewriting it".
    """
    ran: bool
    decoy: str = ""
    observed: str = ""
    finding: SwapFinding | None = None
    detail: str = ""

    @property
    def hijacked(self) -> bool:
        return self.finding is not None

    def to_dict(self) -> dict[str, Any]:
        return {"ran": self.ran, "decoy": self.decoy, "observed": self.observed,
                "detail": self.detail,
                "finding": self.finding.to_dict() if self.finding else None}


def assess_swap(before: str, after: str, *, seconds_apart: float = 0.0,
                probe: bool = False) -> SwapFinding | None:
    """Judge one clipboard transition. Returns None when it is unremarkable.

    Pure, so the whole decision is testable without a clipboard.
    """
    before, after = (before or "").strip(), (after or "").strip()
    if not before or not after or before == after:
        return None

    kind = classify(before)
    if kind is None:
        return None

    if probe:
        finding = SwapFinding(kind=kind, before=before, after=after,
                              seconds_apart=seconds_apart, score=PROBE_SCORE,
                              severity="critical", probe=True)
        finding.reasons.append(
            "Candy put a decoy payment address on the clipboard and something "
            "rewrote it. Nothing on this machine has any legitimate reason to do "
            "that — this is a clipboard hijacker, running right now.")
        finding.reasons.append(f"it was replaced with: {after}")
        return finding

    if classify(after) != kind:
        # Copying an address and then copying ordinary text is just using a
        # computer. Only a same-type substitution is worth raising.
        return None

    finding = SwapFinding(kind=kind, before=before, after=after,
                          seconds_apart=seconds_apart)
    finding.reasons.append(
        f"a {kind} destination on the clipboard was replaced by a different "
        f"{kind} destination")
    finding.reasons.append(
        "if you did not copy a second address yourself, something is watching your "
        "clipboard and swapping payment destinations. Check the address in the "
        "field before you send anything.")
    if seconds_apart and seconds_apart < 2.0:
        finding.score += 25
        finding.severity = "critical"
        finding.reasons.append(
            f"the replacement happened {seconds_apart:.1f}s after the copy, which is "
            f"faster than a person changing their mind")
    return finding


# --------------------------------------------------------------- Win32 glue
#
# Every one of these returns a HANDLE or a pointer. ctypes assumes a function
# returns ``c_int`` unless told otherwise, and on 64-bit Windows that silently
# truncates the top 32 bits off every one of them. A truncated HGLOBAL makes
# ``SetClipboardData`` fail; a truncated ``GlobalLock`` result is a wild
# pointer, and ``memmove`` writing through it kills the process outright — no
# exception, no traceback, just a missing exit code and the next prompt.
#
# That is exactly what ``clipboard probe`` did on 64-bit Windows: it printed
# its two opening lines and then the interpreter died mid-call, so neither the
# clean result nor a finding was ever reached. Declaring the types is the
# whole fix, and it is the same bug that was already fixed once in notify.py.
# The declared libraries are cached, not the fact that declaring happened.
# ctypes.WinDLL("user32") constructs a *new* library object every call, so a
# "have we declared yet" flag protects nothing: the first caller declares on
# its object, the flag goes true, and the second caller gets a fresh object
# with every restype back at the default c_int. That is precisely what
# happened — read_clipboard ran first and worked, write_clipboard got the
# undeclared copy, and `clipboard probe` reported that it could not write.
_LIBRARIES: tuple[Any, Any] | None = None


def _win32() -> tuple[Any, Any] | None:  # pragma: no cover - Windows only
    """user32 and kernel32 with every handle-returning function declared."""
    global _LIBRARIES
    if not IS_WINDOWS:
        return None
    if _LIBRARIES is not None:
        return _LIBRARIES
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = wintypes.BOOL
    user32.EmptyClipboard.argtypes = []
    user32.EmptyClipboard.restype = wintypes.BOOL
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.GetClipboardData.restype = wintypes.HANDLE
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    user32.IsClipboardFormatAvailable.argtypes = [wintypes.UINT]
    user32.IsClipboardFormatAvailable.restype = wintypes.BOOL

    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = wintypes.LPVOID
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalUnlock.restype = wintypes.BOOL
    kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalFree.restype = wintypes.HGLOBAL

    _LIBRARIES = (user32, kernel32)
    return _LIBRARIES


def _open_clipboard(user32: Any, *, attempts: int = 10) -> bool:  # pragma: no cover
    """Take the clipboard, retrying briefly.

    Only one process may hold the clipboard at a time, so a browser or a
    password manager sampling it makes ``OpenClipboard`` fail for a few
    milliseconds. Giving up on the first refusal reports "could not read the
    clipboard" on a perfectly healthy machine.
    """
    for attempt in range(attempts):
        if user32.OpenClipboard(None):
            return True
        time.sleep(0.02 * (attempt + 1))
    return False


def read_clipboard() -> str | None:  # pragma: no cover - Windows only
    """Read the clipboard as text, or None when it holds nothing readable."""
    handles = _win32()
    if handles is None:
        return None
    user32, kernel32 = handles
    try:
        import ctypes

        if not user32.IsClipboardFormatAvailable(CF_UNICODETEXT):
            return None
        if not _open_clipboard(user32):
            return None
        try:
            handle = user32.GetClipboardData(CF_UNICODETEXT)
            if not handle:
                return None
            pointer = kernel32.GlobalLock(handle)
            if not pointer:
                return None
            try:
                return ctypes.c_wchar_p(pointer).value
            finally:
                kernel32.GlobalUnlock(handle)
        finally:
            user32.CloseClipboard()
    except Exception:  # noqa: BLE001 - clipboard access is best-effort
        return None


def write_clipboard(text: str) -> bool:  # pragma: no cover - Windows only
    handles = _win32()
    if handles is None:
        return False
    user32, kernel32 = handles
    try:
        import ctypes

        data = ctypes.create_unicode_buffer(text)
        size = ctypes.sizeof(data)
        handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, size)
        if not handle:
            return False
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            kernel32.GlobalFree(handle)
            return False
        ctypes.memmove(pointer, data, size)
        kernel32.GlobalUnlock(handle)
        if not _open_clipboard(user32):
            kernel32.GlobalFree(handle)
            return False
        try:
            user32.EmptyClipboard()
            # On success the system owns the block and freeing it is a
            # use-after-free; on failure nobody does and it leaks.
            if not user32.SetClipboardData(CF_UNICODETEXT, handle):
                kernel32.GlobalFree(handle)
                return False
        finally:
            user32.CloseClipboard()
        return True
    except Exception:  # noqa: BLE001
        return False


class ClipboardMonitor:
    """Polls the clipboard and reports payment-destination substitutions."""

    def __init__(self, config: Config, sink: Callable[[Detection], None] | None = None,
                 *, reader: Callable[[], str | None] | None = None,
                 writer: Callable[[str], bool] | None = None) -> None:
        self.config = config
        self.sink = sink
        self.reader = reader or read_clipboard
        self.writer = writer or write_clipboard
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self.mode = "idle"
        self.samples = 0
        self.swaps = 0
        self._last: str = ""
        self._last_at: float = 0.0
        self._last_destination: str = ""
        self._last_destination_at: float = 0.0

    # ------------------------------------------------------------- lifecycle
    def start(self) -> None:
        if not bool(self.config.get("clipboard.enabled", False)):
            self.mode = "disabled"
            return
        if not IS_WINDOWS and self.reader is read_clipboard:
            self.mode = "unavailable (not Windows)"
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="clipboard", daemon=True)
        self._thread.start()
        self.mode = "polling"

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
            self._thread = None
        self.mode = "idle"

    def _loop(self) -> None:  # pragma: no cover - timing loop
        interval = max(0.2, float(self.config.get("clipboard.poll_seconds", 0.8)))
        while not self._stop.is_set():
            try:
                self.poll_once()
            except Exception:  # noqa: BLE001 - never let the monitor die
                pass
            self._stop.wait(interval)

    # ------------------------------------------------------------------ poll
    def poll_once(self) -> SwapFinding | None:
        """Read the clipboard once and judge any transition. Testable."""
        value = self.reader()
        if value is None:
            return None
        value = value.strip()
        self.samples += 1
        now = time.monotonic()

        if not value or value == self._last:
            return None

        previous, previous_at = self._last, self._last_at
        self._last, self._last_at = value, now
        if classify(value):
            self._last_destination, self._last_destination_at = value, now

        finding = assess_swap(previous, value,
                              seconds_apart=max(0.0, now - previous_at) if previous_at else 0.0)
        if finding is None:
            return None
        self.swaps += 1
        if self.sink:
            self.sink(self.to_detection(finding))
        return finding

    def probe(self, kind: str = "bitcoin", *, settle: float = 1.5) -> ProbeResult:
        """Actively bait a clipper: write a decoy address, read it back.

        Restores whatever was on the clipboard before, because silently eating
        someone's clipboard is not an acceptable cost of a security check.

        Returns a :class:`ProbeResult` rather than an optional finding. The
        earlier signature returned ``None`` both when the decoy came back
        untouched *and* when the clipboard could not be written at all, so a
        probe that never ran was indistinguishable from a clean one — the
        strongest possible result reported as the weakest.
        """
        decoy = PROBE_VALUES.get(kind) or PROBE_VALUES["bitcoin"]
        saved = self.reader()
        if not self.writer(decoy):
            return ProbeResult(
                ran=False, decoy=decoy,
                detail="the clipboard could not be written, so nothing was tested. "
                       "Another program may be holding it open, or this is a session "
                       "without a desktop (a service, or a remote shell).")
        try:
            time.sleep(max(0.2, settle))
            observed = self.reader()
        finally:
            if saved is not None:
                self.writer(saved)

        if observed is None:
            return ProbeResult(
                ran=False, decoy=decoy,
                detail="the decoy was written but could not be read back, so nothing "
                       "was tested. Another program may be holding the clipboard open.")

        observed = observed.strip()
        if not observed or observed == decoy:
            return ProbeResult(ran=True, decoy=decoy, observed=observed,
                               detail="the decoy came back unchanged")

        finding = assess_swap(decoy, observed, seconds_apart=settle, probe=True)
        if finding and self.sink:
            self.sink(self.to_detection(finding))
        return ProbeResult(ran=True, decoy=decoy, observed=observed, finding=finding,
                           detail="the decoy was rewritten")

    def to_detection(self, finding: SwapFinding) -> Detection:
        return Detection(
            source="clipboard",
            kind="clipboard_probe" if finding.probe else "clipboard_swap",
            subject=finding.kind,
            message=finding.summary() + " — " + finding.reasons[0],
            severity=finding.severity,
            signature_id="clipboard.probe" if finding.probe else "clipboard.swap",
            evidence=finding.to_dict(),
        )

    def status(self) -> dict[str, Any]:
        return {"mode": self.mode, "samples": self.samples, "swaps": self.swaps,
                "watching": sorted(DESTINATION_PATTERNS), "checked": utc_stamp()}


def _short(value: str, keep: int = 10) -> str:
    value = str(value or "")
    return value if len(value) <= keep * 2 + 1 else f"{value[:keep]}…{value[-keep:]}"
