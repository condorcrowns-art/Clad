"""Thin ctypes wrappers over the Windows APIs ExecGuard needs.

Only the standard Windows SDK surface is used — no third-party or paid
libraries. Every function is safe to call on non-Windows platforms, where it
returns ``None``/``False`` so the rest of the app keeps working (and stays
testable) off Windows.
"""
from __future__ import annotations

import ctypes
import os
import threading
from pathlib import Path
from typing import Any

from .util import IS_WINDOWS

# --------------------------------------------------------------------- consts
WTD_UI_NONE = 2
WTD_REVOKE_NONE = 0
WTD_CHOICE_FILE = 1
WTD_STATEACTION_VERIFY = 1
WTD_STATEACTION_CLOSE = 2
WTD_SAFER_FLAG = 0x100
WTD_CACHE_ONLY_URL_RETRIEVAL = 0x1000
TRUST_E_NOSIGNATURE = 0x800B0100
ERROR_ALREADY_EXISTS = 183

PROCESS_EXTENSION_POINT_DISABLE_POLICY = 8


if IS_WINDOWS:  # pragma: no cover - exercised only on Windows
    from ctypes import wintypes

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", ctypes.c_ulong),
            ("Data2", ctypes.c_ushort),
            ("Data3", ctypes.c_ushort),
            ("Data4", ctypes.c_ubyte * 8),
        ]

    class WINTRUST_FILE_INFO(ctypes.Structure):
        _fields_ = [
            ("cbStruct", wintypes.DWORD),
            ("pcwszFilePath", wintypes.LPCWSTR),
            ("hFile", wintypes.HANDLE),
            ("pgKnownSubject", ctypes.POINTER(GUID)),
        ]

    class WINTRUST_DATA(ctypes.Structure):
        _fields_ = [
            ("cbStruct", wintypes.DWORD),
            ("pPolicyCallbackData", ctypes.c_void_p),
            ("pSIPClientData", ctypes.c_void_p),
            ("dwUIChoice", wintypes.DWORD),
            ("fdwRevocationChecks", wintypes.DWORD),
            ("dwUnionChoice", wintypes.DWORD),
            ("pFile", ctypes.POINTER(WINTRUST_FILE_INFO)),
            ("dwStateAction", wintypes.DWORD),
            ("hWVTStateData", wintypes.HANDLE),
            ("pwszURLReference", wintypes.LPWSTR),
            ("dwProvFlags", wintypes.DWORD),
            ("dwUIContext", wintypes.DWORD),
            ("pSignatureSettings", ctypes.c_void_p),
        ]

    # {00AAC56B-CD44-11d0-8CC2-00C04FC295EE}
    WINTRUST_ACTION_GENERIC_VERIFY_V2 = GUID(
        0x00AAC56B, 0xCD44, 0x11D0,
        (ctypes.c_ubyte * 8)(0x8C, 0xC2, 0x00, 0xC0, 0x4F, 0xC2, 0x95, 0xEE),
    )


_sig_cache: dict[tuple[str, float, int], bool | None] = {}
_sig_lock = threading.Lock()


def is_windows() -> bool:
    return IS_WINDOWS


def is_admin() -> bool:
    """True if the process has an elevated (administrator) token."""
    if not IS_WINDOWS:
        return os.geteuid() == 0 if hasattr(os, "geteuid") else False
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:  # noqa: BLE001
        return False


def verify_signature(path: str | os.PathLike) -> bool | None:
    """Authenticode check via WinVerifyTrust.

    Returns True (signed and trusted), False (unsigned or untrusted), or None
    when the answer is unavailable (non-Windows, unreadable file, API error) —
    callers must treat None as "unknown", never as "bad".

    Results are cached per (path, mtime, size) because verification costs
    single-digit milliseconds and the behaviour engine re-checks the same
    module lists on every cycle.
    """
    if not IS_WINDOWS:
        return None
    try:
        stat = Path(path).stat()
        key = (str(path).lower(), stat.st_mtime, stat.st_size)
    except OSError:
        return None

    with _sig_lock:
        if key in _sig_cache:
            return _sig_cache[key]

    result: bool | None
    try:
        file_info = WINTRUST_FILE_INFO()
        file_info.cbStruct = ctypes.sizeof(WINTRUST_FILE_INFO)
        file_info.pcwszFilePath = str(path)
        file_info.hFile = None
        file_info.pgKnownSubject = None

        data = WINTRUST_DATA()
        data.cbStruct = ctypes.sizeof(WINTRUST_DATA)
        data.dwUIChoice = WTD_UI_NONE
        data.fdwRevocationChecks = WTD_REVOKE_NONE
        data.dwUnionChoice = WTD_CHOICE_FILE
        data.pFile = ctypes.pointer(file_info)
        data.dwStateAction = WTD_STATEACTION_VERIFY
        data.dwProvFlags = WTD_SAFER_FLAG | WTD_CACHE_ONLY_URL_RETRIEVAL

        wintrust = ctypes.windll.wintrust
        status = wintrust.WinVerifyTrust(None, ctypes.byref(WINTRUST_ACTION_GENERIC_VERIFY_V2),
                                         ctypes.byref(data))
        # Always release the state data, even on failure, or WinVerifyTrust leaks.
        data.dwStateAction = WTD_STATEACTION_CLOSE
        wintrust.WinVerifyTrust(None, ctypes.byref(WINTRUST_ACTION_GENERIC_VERIFY_V2),
                                ctypes.byref(data))
        result = status == 0
    except Exception:  # noqa: BLE001 - never let a trust check crash a monitor
        result = None

    with _sig_lock:
        if len(_sig_cache) > 4096:
            _sig_cache.clear()
        _sig_cache[key] = result
    return result


# ------------------------------------------------------------------ anti-debug
def is_debugger_present() -> bool:
    if not IS_WINDOWS:
        return False
    try:
        return bool(ctypes.windll.kernel32.IsDebuggerPresent())
    except Exception:  # noqa: BLE001
        return False


def is_remote_debugger_present() -> bool:
    if not IS_WINDOWS:
        return False
    try:
        present = ctypes.c_int(0)
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        ok = ctypes.windll.kernel32.CheckRemoteDebuggerPresent(handle, ctypes.byref(present))
        return bool(ok and present.value)
    except Exception:  # noqa: BLE001
        return False


def has_debug_port() -> bool:
    """NtQueryInformationProcess(ProcessDebugPort) — catches debuggers that
    patch the PEB flag IsDebuggerPresent reads."""
    if not IS_WINDOWS:
        return False
    try:
        port = ctypes.c_void_p(0)
        status = ctypes.windll.ntdll.NtQueryInformationProcess(
            ctypes.windll.kernel32.GetCurrentProcess(), 7,
            ctypes.byref(port), ctypes.sizeof(port), None,
        )
        return status == 0 and bool(port.value)
    except Exception:  # noqa: BLE001
        return False


def debugger_signals() -> list[str]:
    """All anti-debug checks that currently trip, for logging."""
    signals = []
    if is_debugger_present():
        signals.append("IsDebuggerPresent")
    if is_remote_debugger_present():
        signals.append("CheckRemoteDebuggerPresent")
    if has_debug_port():
        signals.append("ProcessDebugPort")
    return signals


# ------------------------------------------------------------- self-hardening
def disable_extension_points() -> bool:
    """Block legacy AppInit_DLLs / SetWindowsHookEx injection into ourselves.

    This is the one mitigation policy that is safe to switch on for a Python
    process: it does not restrict our own DLL loads. Stronger policies
    (MicrosoftSignedOnly binary signature policy, dynamic code prohibition)
    would terminate the interpreter, which is why they are not applied here.
    """
    if not IS_WINDOWS:
        return False
    try:
        policy = ctypes.c_uint32(1)  # DisableExtensionPoints
        ok = ctypes.windll.kernel32.SetProcessMitigationPolicy(
            PROCESS_EXTENSION_POINT_DISABLE_POLICY,
            ctypes.byref(policy), ctypes.sizeof(policy),
        )
        return bool(ok)
    except Exception:  # noqa: BLE001
        return False


def set_critical_error_mode() -> None:
    """Suppress Windows error dialogs so a crash never blocks unattended runs."""
    if not IS_WINDOWS:
        return
    try:
        ctypes.windll.kernel32.SetErrorMode(0x0001 | 0x0002 | 0x8000)
    except Exception:  # noqa: BLE001
        pass


class SingleInstance:
    """Named-mutex guard so two copies of ExecGuard do not fight each other."""

    def __init__(self, name: str = "Global\\ExecGuardSingleInstance") -> None:
        self.name = name
        self._handle: Any = None
        self.already_running = False
        if IS_WINDOWS:
            try:
                self._handle = ctypes.windll.kernel32.CreateMutexW(None, False, name)
                self.already_running = ctypes.windll.kernel32.GetLastError() == ERROR_ALREADY_EXISTS
            except Exception:  # noqa: BLE001
                self._handle = None

    def release(self) -> None:
        if IS_WINDOWS and self._handle:
            try:
                ctypes.windll.kernel32.CloseHandle(self._handle)
            except Exception:  # noqa: BLE001
                pass
            self._handle = None


def foreground_window_title() -> str | None:
    """Title of the focused window — used to spot executor GUIs whose process
    name has been randomised."""
    if not IS_WINDOWS:
        return None
    try:
        user32 = ctypes.windll.user32
        handle = user32.GetForegroundWindow()
        if not handle:
            return None
        length = user32.GetWindowTextLengthW(handle)
        if length <= 0:
            return None
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(handle, buffer, length + 1)
        return buffer.value
    except Exception:  # noqa: BLE001
        return None


def window_titles() -> list[tuple[int, str]]:
    """Enumerate visible top-level windows as ``(pid, title)`` pairs."""
    if not IS_WINDOWS:
        return []
    try:
        from ctypes import wintypes

        user32 = ctypes.windll.user32
        results: list[tuple[int, str]] = []
        callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)

        def callback(hwnd, _lparam):
            if not user32.IsWindowVisible(hwnd):
                return True
            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return True
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buffer, length + 1)
            pid = wintypes.DWORD()
            user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            results.append((int(pid.value), buffer.value))
            return True

        user32.EnumWindows(callback_type(callback), 0)
        return results
    except Exception:  # noqa: BLE001
        return []
