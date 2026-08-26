"""Thin ctypes wrappers over the Windows APIs Candy needs.

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
WTD_CHOICE_CATALOG = 2
WTD_STATEACTION_VERIFY = 1
WTD_STATEACTION_CLOSE = 2
WTD_SAFER_FLAG = 0x100
WTD_CACHE_ONLY_URL_RETRIEVAL = 0x1000
TRUST_E_NOSIGNATURE = 0x800B0100
# CreateFileW, for handing the catalog API an open handle to hash.
GENERIC_READ = 0x80000000
FILE_SHARE_READ = 0x00000001
FILE_SHARE_WRITE = 0x00000002
OPEN_EXISTING = 3
INVALID_HANDLE_VALUE = -1
BCRYPT_SHA256_ALGORITHM = "SHA256"
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

    class WINTRUST_CATALOG_INFO(ctypes.Structure):
        """The other half of Authenticode, and the half Candy could not see.

        Most of Windows is not signed in the file at all. The signature lives
        in a catalog — a .cat file in the system catalog store that lists a
        hash per member file — and a WinVerifyTrust call carrying only a
        WINTRUST_FILE_INFO never looks there. It answers TRUST_E_NOSIGNATURE,
        "no signature at all", which for notepad.exe is simply wrong.
        """
        _fields_ = [
            ("cbStruct", wintypes.DWORD),
            ("dwCatalogVersion", wintypes.DWORD),
            ("pcwszCatalogFilePath", wintypes.LPCWSTR),
            ("pcwszMemberTag", wintypes.LPCWSTR),
            ("pcwszMemberFilePath", wintypes.LPCWSTR),
            ("hMemberFile", wintypes.HANDLE),
            ("pbCalculatedFileHash", ctypes.POINTER(ctypes.c_ubyte)),
            ("cbCalculatedFileHash", wintypes.DWORD),
            ("pcCatalogContext", ctypes.c_void_p),
            ("hCatAdmin", wintypes.HANDLE),
        ]

    class CATALOG_INFO(ctypes.Structure):
        _fields_ = [("cbStruct", wintypes.DWORD),
                    ("wszCatalogFile", ctypes.c_wchar * 260)]

    # {00AAC56B-CD44-11d0-8CC2-00C04FC295EE}
    WINTRUST_ACTION_GENERIC_VERIFY_V2 = GUID(
        0x00AAC56B, 0xCD44, 0x11D0,
        (ctypes.c_ubyte * 8)(0x8C, 0xC2, 0x00, 0xC0, 0x4F, 0xC2, 0x95, 0xEE),
    )


class _Done(Exception):
    """Internal: the catalog path already settled the answer."""


_sig_cache: dict[tuple[str, float, int], bool | None] = {}
_sig_lock = threading.Lock()



# --------------------------------------------------------------- handle types
#
# ctypes assumes every function returns ``c_int``. On a 64-bit build that
# silently truncates the top half off every HANDLE, HWND and pointer that
# comes back from Win32, and the failure is quiet: a truncated HWND makes
# ``GetWindowTextLengthW`` return 0, so ``foreground_window_title()` reported
# "no window" on every 64-bit machine; a truncated mutex handle gets closed by
# number, which is somebody else's handle. The same bug killed the clipboard
# probe outright.
#
# Declaring the types is the fix, and it belongs in one place so a new call
# site cannot reintroduce it quietly.
_declared = False


def _declare() -> None:  # pragma: no cover - Windows only
    """Give every handle-returning function used here its real return type."""
    global _declared
    if _declared or not IS_WINDOWS:
        return
    from ctypes import wintypes

    kernel32 = ctypes.windll.kernel32
    user32 = ctypes.windll.user32

    kernel32.GetCurrentProcess.argtypes = []
    kernel32.GetCurrentProcess.restype = wintypes.HANDLE
    kernel32.CheckRemoteDebuggerPresent.argtypes = [wintypes.HANDLE,
                                                    ctypes.POINTER(wintypes.BOOL)]
    kernel32.CheckRemoteDebuggerPresent.restype = wintypes.BOOL
    kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL

    user32.GetForegroundWindow.argtypes = []
    user32.GetForegroundWindow.restype = wintypes.HWND
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextLengthW.restype = ctypes.c_int
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetWindowTextW.restype = ctypes.c_int
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.IsWindowVisible.restype = wintypes.BOOL
    user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND,
                                                ctypes.POINTER(wintypes.DWORD)]
    user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    _declared = True


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


# WinVerifyTrust status codes worth naming. Everything else is reported as a
# raw code rather than guessed at.
TRUST_STATUS: dict[int, str] = {
    0x00000000: "signed, and the chain is trusted",
    0x800B0100: "no signature at all (TRUST_E_NOSIGNATURE)",
    0x800B0101: "the certificate has expired (CERT_E_EXPIRED)",
    0x800B0109: "signed, but the root certificate is not trusted "
                "(CERT_E_UNTRUSTEDROOT)",
    0x800B010A: "signed, but no chain to a trusted root could be built "
                "(CERT_E_CHAINING)",
    0x800B0111: "the certificate is explicitly distrusted (CERT_E_UNTRUSTEDTESTROOT)",
    0x80092003: "an error occurred reading or writing the file "
                "(CRYPT_E_FILE_ERROR)",
    0x80096010: "the file's digest does not match its signature — the file was "
                "changed after signing (TRUST_E_BAD_DIGEST)",
    0x800B0004: "the subject is not trusted for the requested action "
                "(TRUST_E_SUBJECT_NOT_TRUSTED)",
    0x8009200E: "no signature was found in the subject (CRYPT_E_NO_MATCH)",
}

# The last status seen per path, so `candy signature <file>` can say *why*
# rather than only yes or no. A trust check that answers "unknown" is a fact
# about the check, not about the file, and the difference matters: reporting
# "this file is not signed" when the truth is "the check could not run" is
# Candy inventing evidence.
_status_cache: dict[str, tuple[int | None, str]] = {}


def _remember_status(path: Any, status: int | None, detail: str = "") -> None:
    key = str(path).lower()
    with _sig_lock:
        if len(_status_cache) > 4096:
            _status_cache.clear()
        _status_cache[key] = (status, detail)


def signature_status(path: str | os.PathLike) -> dict[str, Any]:
    """The full answer for one file: verdict, raw status code, and meaning.

    Split out because "is it signed" has three answers and the monitors only
    ever needed one of them. When a machine reports signed software as
    unsigned, the raw code is the only thing that says which of the dozen
    possible reasons applies.
    """
    verdict = verify_signature(path)
    with _sig_lock:
        status, detail = _status_cache.get(str(path).lower(), (None, ""))
    code = None if status is None else (status & 0xFFFFFFFF)
    return {
        "path": str(path),
        "signed": verdict,
        "status": code,
        "status_hex": None if code is None else f"0x{code:08X}",
        # `code or -1` turned a status of 0 — success, the one that matters
        # most — into -1, so "signed and trusted" printed as "an unlisted
        # WinVerifyTrust status". Zero is a value, not an absence.
        "meaning": (("the check could not run" + (f": {detail}" if detail else ""))
                    if code is None else
                    TRUST_STATUS.get(code, "an unlisted WinVerifyTrust status")
                    + (f" ({detail})" if detail else "")),
        "signer": signer_name(path),
    }


def _declare_catalog_api() -> Any | None:  # pragma: no cover - Windows only
    """wintrust's catalog functions, with every handle type declared.

    Undeclared ctypes calls have caused six bugs in this codebase; the catalog
    API is nothing but handles and pointers, so it gets declared up front.
    """
    from ctypes import wintypes

    wintrust = ctypes.windll.wintrust
    kernel32 = ctypes.windll.kernel32

    kernel32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                     ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD,
                                     wintypes.HANDLE]
    kernel32.CreateFileW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel32.CloseHandle.restype = wintypes.BOOL

    wintrust.CryptCATAdminAcquireContext2.argtypes = [
        ctypes.POINTER(wintypes.HANDLE), ctypes.c_void_p, wintypes.LPCWSTR,
        ctypes.c_void_p, wintypes.DWORD]
    wintrust.CryptCATAdminAcquireContext2.restype = wintypes.BOOL
    wintrust.CryptCATAdminCalcHashFromFileHandle2.argtypes = [
        wintypes.HANDLE, wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD),
        ctypes.POINTER(ctypes.c_ubyte), wintypes.DWORD]
    wintrust.CryptCATAdminCalcHashFromFileHandle2.restype = wintypes.BOOL
    wintrust.CryptCATAdminEnumCatalogFromHash.argtypes = [
        wintypes.HANDLE, ctypes.POINTER(ctypes.c_ubyte), wintypes.DWORD,
        wintypes.DWORD, ctypes.c_void_p]
    wintrust.CryptCATAdminEnumCatalogFromHash.restype = wintypes.HANDLE
    wintrust.CryptCATCatalogInfoFromContext.argtypes = [
        wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
    wintrust.CryptCATCatalogInfoFromContext.restype = wintypes.BOOL
    wintrust.CryptCATAdminReleaseCatalogContext.argtypes = [
        wintypes.HANDLE, wintypes.HANDLE, wintypes.DWORD]
    wintrust.CryptCATAdminReleaseCatalogContext.restype = wintypes.BOOL
    wintrust.CryptCATAdminReleaseContext.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    wintrust.CryptCATAdminReleaseContext.restype = wintypes.BOOL
    return wintrust


def _catalog_for(path: str) -> tuple[str, str] | None:  # pragma: no cover - Windows only
    """Find the catalog that vouches for this file.

    Returns ``(catalog file path, member tag)`` or None when no catalog lists
    it. The member tag is the file's hash as an uppercase hex string, which is
    how a catalog names its members.
    """
    from ctypes import wintypes

    wintrust = _declare_catalog_api()
    kernel32 = ctypes.windll.kernel32

    handle = kernel32.CreateFileW(str(path), GENERIC_READ,
                                  FILE_SHARE_READ | FILE_SHARE_WRITE, None,
                                  OPEN_EXISTING, 0, None)
    if not handle or handle == ctypes.c_void_p(INVALID_HANDLE_VALUE).value:
        return None

    admin = wintypes.HANDLE()
    catalog_context = None
    try:
        if not wintrust.CryptCATAdminAcquireContext2(
                ctypes.byref(admin), None, BCRYPT_SHA256_ALGORITHM, None, 0):
            return None
        try:
            size = wintypes.DWORD(0)
            # First call sizes the hash, second fills it — the usual Win32
            # two-call idiom.
            wintrust.CryptCATAdminCalcHashFromFileHandle2(
                admin, handle, ctypes.byref(size), None, 0)
            if not size.value:
                return None
            digest = (ctypes.c_ubyte * size.value)()
            if not wintrust.CryptCATAdminCalcHashFromFileHandle2(
                    admin, handle, ctypes.byref(size), digest, 0):
                return None

            catalog_context = wintrust.CryptCATAdminEnumCatalogFromHash(
                admin, digest, size.value, 0, None)
            if not catalog_context:
                return None

            info = CATALOG_INFO()
            info.cbStruct = ctypes.sizeof(CATALOG_INFO)
            if not wintrust.CryptCATCatalogInfoFromContext(
                    catalog_context, ctypes.byref(info), 0):
                return None
            tag = "".join(f"{byte:02X}" for byte in digest)
            return info.wszCatalogFile, tag
        finally:
            if catalog_context:
                wintrust.CryptCATAdminReleaseCatalogContext(admin, catalog_context, 0)
            wintrust.CryptCATAdminReleaseContext(admin, 0)
    finally:
        kernel32.CloseHandle(handle)


def _verify_catalog(path: str) -> int | None:  # pragma: no cover - Windows only
    """WinVerifyTrust against the catalog that lists this file.

    Returns the status, or None when no catalog vouches for it at all — which
    is the honest answer for a file that really is unsigned.
    """
    from ctypes import wintypes

    found = _catalog_for(path)
    if not found:
        return None
    catalog_file, tag = found

    catalog_info = WINTRUST_CATALOG_INFO()
    catalog_info.cbStruct = ctypes.sizeof(WINTRUST_CATALOG_INFO)
    catalog_info.pcwszCatalogFilePath = catalog_file
    catalog_info.pcwszMemberTag = tag
    catalog_info.pcwszMemberFilePath = str(path)

    data = WINTRUST_DATA()
    data.cbStruct = ctypes.sizeof(WINTRUST_DATA)
    data.dwUIChoice = WTD_UI_NONE
    data.fdwRevocationChecks = WTD_REVOKE_NONE
    data.dwUnionChoice = WTD_CHOICE_CATALOG
    data.pFile = ctypes.cast(ctypes.pointer(catalog_info),
                             ctypes.POINTER(WINTRUST_FILE_INFO))
    data.dwStateAction = WTD_STATEACTION_VERIFY
    data.dwProvFlags = WTD_SAFER_FLAG | WTD_CACHE_ONLY_URL_RETRIEVAL

    wintrust = ctypes.windll.wintrust
    wintrust.WinVerifyTrust.argtypes = [wintypes.HWND, ctypes.c_void_p, ctypes.c_void_p]
    wintrust.WinVerifyTrust.restype = wintypes.LONG
    status = wintrust.WinVerifyTrust(
        None, ctypes.byref(WINTRUST_ACTION_GENERIC_VERIFY_V2), ctypes.byref(data))
    data.dwStateAction = WTD_STATEACTION_CLOSE
    wintrust.WinVerifyTrust(
        None, ctypes.byref(WINTRUST_ACTION_GENERIC_VERIFY_V2), ctypes.byref(data))
    return status


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
        wintrust.WinVerifyTrust.argtypes = [wintypes.HWND, ctypes.c_void_p,
                                            ctypes.c_void_p]
        wintrust.WinVerifyTrust.restype = wintypes.LONG
        status = wintrust.WinVerifyTrust(None, ctypes.byref(WINTRUST_ACTION_GENERIC_VERIFY_V2),
                                         ctypes.byref(data))
        # Always release the state data, even on failure, or WinVerifyTrust leaks.
        data.dwStateAction = WTD_STATEACTION_CLOSE
        wintrust.WinVerifyTrust(None, ctypes.byref(WINTRUST_ACTION_GENERIC_VERIFY_V2),
                                ctypes.byref(data))
        if (status & 0xFFFFFFFF) == TRUST_E_NOSIGNATURE:
            # No signature *in the file* is not the same as no signature. Most
            # of Windows is catalog-signed, and asking only about the embedded
            # one reports notepad.exe as unsigned — which then feeds every
            # heuristic that rests on a file being unsigned.
            catalog_status = _verify_catalog(str(path))
            if catalog_status is not None:
                status = catalog_status
                _remember_status(path, status, "verified against a catalog")
                result = status == 0
                raise _Done
        _remember_status(path, status)
        result = status == 0
    except _Done:
        pass
    except Exception as exc:  # noqa: BLE001 - never let a trust check crash a monitor
        _remember_status(path, None, str(exc))
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
        from ctypes import wintypes

        _declare()
        present = wintypes.BOOL(0)
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
        _declare()
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
    """Named-mutex guard so two copies of Candy do not fight each other."""

    def __init__(self, name: str = "Global\\CandySingleInstance") -> None:
        self.name = name
        self._handle: Any = None
        self.already_running = False
        if IS_WINDOWS:
            try:
                _declare()
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
        _declare()
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

        _declare()
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


# --------------------------------------------------------------- signer name
# WinVerifyTrust answers "is this signature valid?" and nothing else. It cannot
# tell you a build signed by a different company with a perfectly valid
# certificate is not the one you trusted last week — which is exactly the
# question an exit scam raises. CryptQueryObject plus CertGetNameString answers
# "signed by whom", from user mode, for free.
_signer_cache: dict[tuple[str, float, int], str | None] = {}
_signer_lock = threading.Lock()

CERT_QUERY_OBJECT_FILE = 0x00000001
# Content types are an enum; each flag is 1 << that value. PKCS7_SIGNED is
# 8, PKCS7_UNSIGNED is 9 and PKCS7_SIGNED_EMBED is 10 — so 1 << 9 asked about
# unsigned messages, which is not what a .cat file is.
CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED = 1 << 8
CERT_QUERY_CONTENT_FLAG_CTL = 1 << 2
CERT_QUERY_FORMAT_FLAG_ALL = (1 << 1) | (1 << 2) | (1 << 3)
# The signer's certificate, ready-made. Asking for this instead of
# CMSG_SIGNER_INFO_PARAM means Windows builds the CERT_INFO rather than us.
CMSG_SIGNER_CERT_INFO_PARAM = 7
CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED_EMBED = 1 << 10
CERT_QUERY_FORMAT_FLAG_BINARY = 1 << 1
CMSG_SIGNER_INFO_PARAM = 6
CERT_NAME_SIMPLE_DISPLAY_TYPE = 4
X509_ASN_ENCODING = 0x00000001
PKCS_7_ASN_ENCODING = 0x00010000
ENCODING = X509_ASN_ENCODING | PKCS_7_ASN_ENCODING


def _declare_crypt32() -> Any:  # pragma: no cover - Windows only
    """crypt32 with its pointer-returning functions declared.

    CertFindCertificateInStore returns a PCCERT_CONTEXT. Left at ctypes'
    default c_int it came back truncated, and every CertGetNameStringW call
    that followed was reading a wild pointer — which is why the signer came
    back "none read" for files that are plainly signed. Sixth instance of
    this bug in this codebase.
    """
    from ctypes import wintypes

    crypt32 = ctypes.windll.crypt32
    crypt32.CryptQueryObject.restype = wintypes.BOOL
    crypt32.CryptMsgGetParam.argtypes = [ctypes.c_void_p, wintypes.DWORD,
                                         wintypes.DWORD, ctypes.c_void_p,
                                         ctypes.POINTER(wintypes.DWORD)]
    crypt32.CryptMsgGetParam.restype = wintypes.BOOL
    crypt32.CertFindCertificateInStore.argtypes = [
        ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD,
        ctypes.c_void_p, ctypes.c_void_p]
    crypt32.CertFindCertificateInStore.restype = ctypes.c_void_p
    crypt32.CertGetNameStringW.argtypes = [ctypes.c_void_p, wintypes.DWORD,
                                           wintypes.DWORD, ctypes.c_void_p,
                                           wintypes.LPWSTR, wintypes.DWORD]
    crypt32.CertGetNameStringW.restype = wintypes.DWORD
    crypt32.CertFreeCertificateContext.argtypes = [ctypes.c_void_p]
    crypt32.CertFreeCertificateContext.restype = wintypes.BOOL
    crypt32.CertCloseStore.argtypes = [ctypes.c_void_p, wintypes.DWORD]
    crypt32.CertCloseStore.restype = wintypes.BOOL
    crypt32.CryptMsgClose.argtypes = [ctypes.c_void_p]
    crypt32.CryptMsgClose.restype = wintypes.BOOL
    return crypt32


def signer_name(path: str | os.PathLike) -> str | None:
    """The subject name on an Authenticode signature, or None.

    None means "could not be determined" — not Windows, unsigned, or an API
    failure. Callers must never read None as "different signer"; an unknown
    signer is exactly as informative as no answer, which is not at all.

    Cached per (path, mtime, size) like ``verify_signature``, because the
    guard and the trust ledger both ask about the same files repeatedly.
    """
    if not IS_WINDOWS:
        return None
    try:
        stat = Path(path).stat()
        key = (str(path).lower(), stat.st_mtime, stat.st_size)
    except OSError:
        return None

    with _signer_lock:
        if key in _signer_cache:
            return _signer_cache[key]

    name = _read_signer_name(path)
    if name is None:
        # A catalog-signed file carries no signature of its own; the signer is
        # on the catalog that lists it. Without this, every Windows system
        # binary reports an unknown signer — and drift.py scores a *changed*
        # signer at 110, its highest single score, so a signer it can never
        # read is a defence that can never fire.
        try:
            found = _catalog_for(str(path))
        except Exception:  # noqa: BLE001
            found = None
        if found:
            name = _read_signer_name(found[0])
    with _signer_lock:
        if len(_signer_cache) > 4096:
            _signer_cache.clear()
        _signer_cache[key] = name
    return name


def _read_signer_name(path: str | os.PathLike) -> str | None:  # pragma: no cover - Windows only
    try:
        import ctypes
        from ctypes import wintypes

        crypt32 = _declare_crypt32()
        encoding = wintypes.DWORD()
        content_type = wintypes.DWORD()
        format_type = wintypes.DWORD()
        store = ctypes.c_void_p()
        message = ctypes.c_void_p()

        ok = crypt32.CryptQueryObject(
            CERT_QUERY_OBJECT_FILE, ctypes.c_wchar_p(str(path)),
            # A PE carries its signature embedded; a .cat file is a standalone
            # signed message wrapping a trust list. Ask about all three rather
            # than assuming which kind of file this is.
            CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED_EMBED
            | CERT_QUERY_CONTENT_FLAG_PKCS7_SIGNED
            | CERT_QUERY_CONTENT_FLAG_CTL,
            CERT_QUERY_FORMAT_FLAG_ALL,
            0, ctypes.byref(encoding), ctypes.byref(content_type),
            ctypes.byref(format_type), ctypes.byref(store), ctypes.byref(message), None)
        if not ok or not message:
            return None

        try:
            # CMSG_SIGNER_CERT_INFO_PARAM hands back a CERT_INFO that Windows
            # laid out itself. The previous code asked for CMSG_SIGNER_INFO
            # and rebuilt a CERT_INFO by hand from the issuer and serial — but
            # the real CERT_INFO has SignatureAlgorithm between SerialNumber
            # and Issuer, so Issuer was written at the wrong offset and the
            # certificate lookup could never match. Letting Windows produce
            # the struct removes the whole class of mistake.
            size = wintypes.DWORD()
            if not crypt32.CryptMsgGetParam(message, CMSG_SIGNER_CERT_INFO_PARAM, 0,
                                            None, ctypes.byref(size)) or not size.value:
                return None
            buffer = ctypes.create_string_buffer(size.value)
            if not crypt32.CryptMsgGetParam(message, CMSG_SIGNER_CERT_INFO_PARAM, 0,
                                            buffer, ctypes.byref(size)):
                return None

            CERT_FIND_SUBJECT_CERT = 0x000B0000
            context = crypt32.CertFindCertificateInStore(
                store, ENCODING, 0, CERT_FIND_SUBJECT_CERT, buffer, None)
            if not context:
                return None
            try:
                length = crypt32.CertGetNameStringW(
                    context, CERT_NAME_SIMPLE_DISPLAY_TYPE, 0, None, None, 0)
                if length <= 1:
                    return None
                out = ctypes.create_unicode_buffer(length)
                crypt32.CertGetNameStringW(context, CERT_NAME_SIMPLE_DISPLAY_TYPE,
                                           0, None, out, length)
                return (out.value or "").strip() or None
            finally:
                crypt32.CertFreeCertificateContext(context)
        finally:
            if message:
                crypt32.CryptMsgClose(message)
            if store:
                crypt32.CertCloseStore(store, 0)
    except Exception:  # noqa: BLE001 - an API failure is not a verdict
        return None


def signer_changed(before: str | None, after: str | None) -> bool:
    """Did the publisher actually change?

    False whenever either side is unknown. A tool that shouts "different
    signer!" because it could not read one of them is a tool that gets
    ignored, and the unknown case is common — unsigned files, older formats,
    and every non-Windows run.
    """
    if not before or not after:
        return False
    return before.strip().lower() != after.strip().lower()
