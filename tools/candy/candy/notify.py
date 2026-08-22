"""System tray icon and desktop notifications, in pure ctypes.

A tripwire the user has to keep a window open to read is not a tripwire. This
puts Candy in the notification area and raises a balloon/toast when something
serious happens.

Implemented directly against Shell_NotifyIconW so it needs no packages at all —
not win10toast, not plyer, not winrt. Windows renders NIIF_INFO balloons as
modern toasts on Windows 10/11.

Every call is safe on non-Windows and safe on failure: if the tray cannot be
created, Candy carries on without it.
"""
from __future__ import annotations

import ctypes
import threading
from typing import Any, Callable

from .util import IS_WINDOWS

# Shell_NotifyIcon messages and flags.
NIM_ADD, NIM_MODIFY, NIM_DELETE = 0x0, 0x1, 0x2
NIF_MESSAGE, NIF_ICON, NIF_TIP, NIF_INFO = 0x1, 0x2, 0x4, 0x10
NIIF_INFO, NIIF_WARNING, NIIF_ERROR = 0x1, 0x2, 0x3

WM_DESTROY = 0x0002
WM_APP_TRAY = 0x8000 + 1
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONUP = 0x0205

IDI_APPLICATION, IDI_WARNING, IDI_ERROR, IDI_SHIELD = 32512, 32515, 32513, 32518

SEVERITY_ICONS = {
    "info": (IDI_APPLICATION, NIIF_INFO),
    "low": (IDI_APPLICATION, NIIF_INFO),
    "medium": (IDI_WARNING, NIIF_WARNING),
    "high": (IDI_WARNING, NIIF_WARNING),
    "critical": (IDI_ERROR, NIIF_ERROR),
}


if IS_WINDOWS:  # pragma: no cover - Windows only
    from ctypes import wintypes

    class NOTIFYICONDATA(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("hWnd", wintypes.HWND),
            ("uID", wintypes.UINT),
            ("uFlags", wintypes.UINT),
            ("uCallbackMessage", wintypes.UINT),
            ("hIcon", wintypes.HICON),
            ("szTip", wintypes.WCHAR * 128),
            ("dwState", wintypes.DWORD),
            ("dwStateMask", wintypes.DWORD),
            ("szInfo", wintypes.WCHAR * 256),
            ("uTimeoutOrVersion", wintypes.UINT),
            ("szInfoTitle", wintypes.WCHAR * 64),
            ("dwInfoFlags", wintypes.DWORD),
        ]

    # A window procedure returns LRESULT, which is pointer-sized — 64 bits on a
    # 64-bit build. Declaring it as c_long truncates to 32 bits, and ctypes then
    # refuses the real lparam with "int too long to convert" on every single
    # message the window receives. c_ssize_t is LRESULT on both architectures.
    LRESULT = ctypes.c_ssize_t
    WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT,
                                 wintypes.WPARAM, wintypes.LPARAM)

    class WNDCLASS(ctypes.Structure):
        _fields_ = [
            ("style", wintypes.UINT),
            ("lpfnWndProc", WNDPROC),
            ("cbClsExtra", ctypes.c_int),
            ("cbWndExtra", ctypes.c_int),
            ("hInstance", wintypes.HINSTANCE),
            ("hIcon", wintypes.HICON),
            ("hCursor", wintypes.HANDLE),
            ("hbrBackground", wintypes.HBRUSH),
            ("lpszMenuName", wintypes.LPCWSTR),
            ("lpszClassName", wintypes.LPCWSTR),
        ]



class TrayIcon:
    """A notification-area icon that can raise toasts.

    Runs its own message loop on a daemon thread — Windows requires the thread
    that creates a window to pump its messages, and Candy's main thread is
    either the Tk loop or the console wait.
    """

    def __init__(self, title: str = "Candy", *,
                 on_open: Callable[[], None] | None = None) -> None:
        self.title = title
        self.on_open = on_open
        self.available = False
        self._hwnd: Any = None
        self._data: Any = None
        self._thread: threading.Thread | None = None
        self._ready = threading.Event()
        self._stop = threading.Event()
        self._wndproc_ref: Any = None   # keep the callback alive
        self.last_error: str | None = None

    # ------------------------------------------------------------ lifecycle
    def start(self) -> bool:
        if not IS_WINDOWS:
            self.last_error = "tray icons are Windows-only"
            return False
        self._thread = threading.Thread(target=self._run, name="tray", daemon=True)
        self._thread.start()
        self._ready.wait(timeout=5)
        return self.available

    def stop(self) -> None:
        self._stop.set()
        if not IS_WINDOWS or not self._hwnd:
            return
        try:  # pragma: no cover - Windows only
            ctypes.windll.shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(self._data))
            ctypes.windll.user32.PostMessageW(self._hwnd, WM_DESTROY, 0, 0)
        except Exception:  # noqa: BLE001
            pass

    def _run(self) -> None:  # pragma: no cover - Windows only
        try:
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            # Without explicit types ctypes assumes 32-bit ints for every
            # argument, and the very first message carrying a real pointer in
            # lparam raises OverflowError inside the callback — which Python
            # can only print, so it repeats for every message forever.
            user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT,
                                              wintypes.WPARAM, wintypes.LPARAM]
            user32.DefWindowProcW.restype = LRESULT

            def window_proc(hwnd, message, wparam, lparam):
                try:
                    if (message == WM_APP_TRAY and lparam == WM_LBUTTONDBLCLK
                            and self.on_open):
                        try:
                            self.on_open()
                        except Exception:  # noqa: BLE001
                            pass
                        return 0
                    if message == WM_DESTROY:
                        user32.PostQuitMessage(0)
                        return 0
                    return user32.DefWindowProcW(hwnd, message, wparam, lparam)
                except Exception:  # noqa: BLE001
                    # A raising window proc cannot report anything useful — the
                    # message loop is not ours. Swallow it so a tray-icon
                    # problem never becomes a wall of console noise.
                    return 0

            self._wndproc_ref = WNDPROC(window_proc)
            window_class = WNDCLASS()
            window_class.lpfnWndProc = self._wndproc_ref
            window_class.hInstance = kernel32.GetModuleHandleW(None)
            window_class.lpszClassName = "CandyTrayWindow"
            if not user32.RegisterClassW(ctypes.byref(window_class)):
                # Class already registered from a previous run in this process.
                pass

            self._hwnd = user32.CreateWindowExW(
                0, "CandyTrayWindow", "Candy", 0, 0, 0, 0, 0, None, None,
                window_class.hInstance, None)
            if not self._hwnd:
                raise OSError("CreateWindowExW failed")

            data = NOTIFYICONDATA()
            data.cbSize = ctypes.sizeof(NOTIFYICONDATA)
            data.hWnd = self._hwnd
            data.uID = 1
            data.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP
            data.uCallbackMessage = WM_APP_TRAY
            data.hIcon = user32.LoadIconW(None, IDI_SHIELD)
            data.szTip = f"{self.title} — protection running"
            if not ctypes.windll.shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(data)):
                raise OSError("Shell_NotifyIconW(NIM_ADD) failed")
            self._data = data
            self.available = True
            self._ready.set()

            message = wintypes.MSG()
            while not self._stop.is_set():
                result = user32.GetMessageW(ctypes.byref(message), None, 0, 0)
                if result in (0, -1):
                    break
                user32.TranslateMessage(ctypes.byref(message))
                user32.DispatchMessageW(ctypes.byref(message))
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            self.available = False
            self._ready.set()

    # ------------------------------------------------------------- output
    def notify(self, title: str, message: str, severity: str = "info") -> bool:
        """Raise a toast. Returns False if the tray is unavailable."""
        if not self.available or not IS_WINDOWS or self._data is None:
            return False
        try:  # pragma: no cover - Windows only
            icon_id, info_flag = SEVERITY_ICONS.get(severity, SEVERITY_ICONS["info"])
            self._data.uFlags = NIF_INFO | NIF_ICON | NIF_MESSAGE | NIF_TIP
            self._data.hIcon = ctypes.windll.user32.LoadIconW(None, icon_id)
            # Windows silently truncates over-long strings; do it ourselves so
            # the message stays readable rather than cut mid-word.
            self._data.szInfoTitle = title[:63]
            self._data.szInfo = message[:255]
            self._data.dwInfoFlags = info_flag
            return bool(ctypes.windll.shell32.Shell_NotifyIconW(
                NIM_MODIFY, ctypes.byref(self._data)))
        except Exception as exc:  # noqa: BLE001
            self.last_error = str(exc)
            return False

    def set_tooltip(self, text: str) -> None:
        if not self.available or self._data is None:
            return
        try:  # pragma: no cover - Windows only
            self._data.uFlags = NIF_TIP | NIF_ICON | NIF_MESSAGE
            self._data.szTip = text[:127]
            ctypes.windll.shell32.Shell_NotifyIconW(NIM_MODIFY, ctypes.byref(self._data))
        except Exception:  # noqa: BLE001
            pass


class Notifier:
    """Routes detections to the tray, with rate limiting.

    A burst of twenty detections must not produce twenty toasts — the user
    stops reading after the second one. Only detections at or above the
    configured severity notify, and only one toast per interval; the rest are
    summarised.
    """

    def __init__(self, tray: TrayIcon | None, *, min_severity: str = "high",
                 min_interval: float = 20.0) -> None:
        self.tray = tray
        self.min_severity = min_severity
        self.min_interval = min_interval
        self._last = 0.0
        self._suppressed = 0
        self._lock = threading.Lock()

    def should_notify(self, severity: str, now: float) -> tuple[bool, int]:
        """Rate-limit decision. Pure, so the policy is unit-tested."""
        from .events import SEVERITY_ORDER

        try:
            if SEVERITY_ORDER.index(severity) < SEVERITY_ORDER.index(self.min_severity):
                return False, 0
        except ValueError:
            return False, 0
        with self._lock:
            if now - self._last < self.min_interval:
                self._suppressed += 1
                return False, self._suppressed
            suppressed = self._suppressed
            self._suppressed = 0
            self._last = now
            return True, suppressed

    def handle(self, detection: Any) -> None:
        import time

        allowed, suppressed = self.should_notify(detection.severity, time.time())
        if not allowed or self.tray is None:
            return
        title = f"Candy — {detection.severity.upper()} threat detected"
        body = detection.message
        if suppressed:
            body += f"\n(+{suppressed} more detection(s) while you were away)"
        self.tray.notify(title, body, detection.severity)
