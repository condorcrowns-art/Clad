"""AES-256-GCM at rest, and machine-bound key protection.

Fills two gaps at once:

* **AES-256-GCM** — the requested maximum symmetric cipher (AES-256 *is* the
  ceiling; there is no AES-512). Implemented here in pure Python against
  FIPS-197 and SP 800-38D so quarantined files are authenticated-encrypted
  rather than XOR-defanged, with no dependency to install.
* **Key protection** — the honest stand-in for a TPM. On Windows the vault key
  is wrapped with **DPAPI** (`CryptProtectData`), which ties it to the machine
  (and optionally the user account): copying `vault.key` to another PC yields
  nothing. That is weaker than a key sealed inside a TPM — DPAPI keys are
  recoverable by anything running as that user — but it needs no certificate,
  no enrolment and no money, and it removes the "secret sitting in a readable
  file" problem entirely.

Pure Python AES is slow (roughly a megabyte per second). Quarantine files are
usually small; the size cap is configurable and oversized files fall back to
the defang path with a logged reason rather than blocking the pipeline.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import struct
from pathlib import Path
from typing import Any

from .util import IS_WINDOWS, ensure_dir, utc_stamp

# ------------------------------------------------------------------ AES core
_SBOX = bytes.fromhex(
    "637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0"
    "b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b275"
    "09832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cf"
    "d0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2"
    "cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdb"
    "e0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08"
    "ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9e"
    "e1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16")

_RCON = (0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1B, 0x36,
         0x6C, 0xD8, 0xAB, 0x4D)


def _xtime(value: int) -> int:
    value <<= 1
    return (value ^ 0x1B) & 0xFF if value & 0x100 else value


def _expand_key(key: bytes) -> list[list[int]]:
    """AES-256 key schedule: 15 round keys of 16 bytes (FIPS-197 5.2)."""
    if len(key) != 32:
        raise ValueError("AES-256 requires a 32-byte key")
    nk, rounds = 8, 14
    words = [list(key[i * 4:(i + 1) * 4]) for i in range(nk)]
    for i in range(nk, 4 * (rounds + 1)):
        temp = list(words[i - 1])
        if i % nk == 0:
            temp = temp[1:] + temp[:1]
            temp = [_SBOX[b] for b in temp]
            temp[0] ^= _RCON[i // nk - 1]
        elif i % nk == 4:
            temp = [_SBOX[b] for b in temp]
        words.append([words[i - nk][j] ^ temp[j] for j in range(4)])
    return [sum(words[4 * r:4 * r + 4], []) for r in range(rounds + 1)]


def _encrypt_block(block: bytes, round_keys: list[list[int]]) -> bytes:
    state = [b ^ k for b, k in zip(block, round_keys[0])]
    for rnd in range(1, len(round_keys)):
        state = [_SBOX[b] for b in state]
        # ShiftRows on the column-major state
        state = [state[(i + 4 * (i % 4)) % 16] for i in range(16)]
        if rnd != len(round_keys) - 1:
            mixed = []
            for column in range(4):
                a = state[4 * column:4 * column + 4]
                t = a[0] ^ a[1] ^ a[2] ^ a[3]
                mixed.extend([
                    a[0] ^ t ^ _xtime(a[0] ^ a[1]),
                    a[1] ^ t ^ _xtime(a[1] ^ a[2]),
                    a[2] ^ t ^ _xtime(a[2] ^ a[3]),
                    a[3] ^ t ^ _xtime(a[3] ^ a[0]),
                ])
            state = mixed
        state = [b ^ k for b, k in zip(state, round_keys[rnd])]
    return bytes(state)


# ------------------------------------------------------------------ GCM mode
_GCM_R = 0xE1 << 120


def _gf_mul(x: int, y: int) -> int:
    """Multiplication in GF(2^128) as defined by SP 800-38D."""
    product = 0
    value = y
    for bit in range(128):
        if (x >> (127 - bit)) & 1:
            product ^= value
        if value & 1:
            value = (value >> 1) ^ _GCM_R
        else:
            value >>= 1
    return product


def _ghash(h: int, data: bytes) -> int:
    digest = 0
    for offset in range(0, len(data), 16):
        chunk = data[offset:offset + 16].ljust(16, b"\0")
        digest = _gf_mul(digest ^ int.from_bytes(chunk, "big"), h)
    return digest


def _gctr(round_keys: list[list[int]], counter: int, data: bytes) -> bytes:
    out = bytearray()
    for offset in range(0, len(data), 16):
        block = data[offset:offset + 16]
        keystream = _encrypt_block(counter.to_bytes(16, "big"), round_keys)
        out.extend(bytes(a ^ b for a, b in zip(block, keystream)))
        counter = (counter & ~0xFFFFFFFF) | ((counter + 1) & 0xFFFFFFFF)
    return bytes(out)


def aes256_gcm_encrypt(key: bytes, plaintext: bytes, associated: bytes = b"",
                       nonce: bytes | None = None) -> tuple[bytes, bytes, bytes]:
    """Encrypt with AES-256-GCM. Returns ``(nonce, ciphertext, tag)``."""
    nonce = nonce if nonce is not None else secrets.token_bytes(12)
    if len(nonce) != 12:
        raise ValueError("this implementation uses 96-bit nonces, as recommended by SP 800-38D")
    round_keys = _expand_key(key)
    h = int.from_bytes(_encrypt_block(b"\0" * 16, round_keys), "big")
    j0 = int.from_bytes(nonce + b"\x00\x00\x00\x01", "big")

    ciphertext = _gctr(round_keys, (j0 & ~0xFFFFFFFF) | ((j0 + 1) & 0xFFFFFFFF), plaintext)
    lengths = struct.pack(">QQ", len(associated) * 8, len(ciphertext) * 8)
    padded = (associated + b"\0" * (-len(associated) % 16)
              + ciphertext + b"\0" * (-len(ciphertext) % 16) + lengths)
    s = _ghash(h, padded)
    tag = _gctr(round_keys, j0, s.to_bytes(16, "big"))
    return nonce, ciphertext, tag


def aes256_gcm_decrypt(key: bytes, nonce: bytes, ciphertext: bytes, tag: bytes,
                       associated: bytes = b"") -> bytes:
    """Decrypt and authenticate. Raises ValueError if the tag does not match."""
    round_keys = _expand_key(key)
    h = int.from_bytes(_encrypt_block(b"\0" * 16, round_keys), "big")
    j0 = int.from_bytes(nonce + b"\x00\x00\x00\x01", "big")

    lengths = struct.pack(">QQ", len(associated) * 8, len(ciphertext) * 8)
    padded = (associated + b"\0" * (-len(associated) % 16)
              + ciphertext + b"\0" * (-len(ciphertext) % 16) + lengths)
    expected = _gctr(round_keys, j0, _ghash(h, padded).to_bytes(16, "big"))
    # Constant-time compare: a byte-by-byte early exit would leak the tag.
    if not hmac.compare_digest(expected, tag):
        raise ValueError("authentication failed — the data or its tag was modified")
    return _gctr(round_keys, (j0 & ~0xFFFFFFFF) | ((j0 + 1) & 0xFFFFFFFF), ciphertext)


# ------------------------------------------------------- DPAPI key wrapping
def dpapi_protect(data: bytes, *, machine_scope: bool = True) -> bytes | None:
    """Wrap bytes with Windows DPAPI. Returns None off Windows or on failure."""
    if not IS_WINDOWS:
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD),
                        ("pbData", ctypes.POINTER(ctypes.c_char))]

        buffer = ctypes.create_string_buffer(data, len(data))
        blob_in = DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
        blob_out = DATA_BLOB()
        flags = 0x4 if machine_scope else 0x0      # CRYPTPROTECT_LOCAL_MACHINE
        ok = ctypes.windll.crypt32.CryptProtectData(
            ctypes.byref(blob_in), "Candy vault key", None, None, None, flags,
            ctypes.byref(blob_out))
        if not ok:
            return None
        try:
            return ctypes.string_at(blob_out.pbData, blob_out.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    except Exception:  # noqa: BLE001
        return None


def dpapi_unprotect(data: bytes) -> bytes | None:
    if not IS_WINDOWS:
        return None
    try:
        import ctypes
        from ctypes import wintypes

        class DATA_BLOB(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD),
                        ("pbData", ctypes.POINTER(ctypes.c_char))]

        buffer = ctypes.create_string_buffer(data, len(data))
        blob_in = DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
        blob_out = DATA_BLOB()
        ok = ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out))
        if not ok:
            return None
        try:
            return ctypes.string_at(blob_out.pbData, blob_out.cbData)
        finally:
            ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    except Exception:  # noqa: BLE001
        return None


class Vault:
    """A machine-bound AES-256-GCM key, and helpers to use it on files."""

    MAGIC = b"CANDYAES"
    VERSION = 1

    def __init__(self, key_path: Path) -> None:
        self.key_path = Path(key_path)
        self._key: bytes | None = None
        self.protection = "unknown"

    # ------------------------------------------------------------------ key
    def key(self) -> bytes:
        if self._key is not None:
            return self._key
        if self.key_path.exists():
            self._key = self._load_key()
        else:
            self._key = self._create_key()
        return self._key

    def _create_key(self) -> bytes:
        key = secrets.token_bytes(32)
        ensure_dir(self.key_path.parent)
        wrapped = dpapi_protect(key)
        payload = {
            "format": "candy-vault-key-v1",
            "created": utc_stamp(),
            "protection": "dpapi-machine" if wrapped else "plaintext-file",
            "key": (wrapped or key).hex(),
        }
        self.key_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        try:
            os.chmod(self.key_path, 0o600)
        except OSError:
            pass
        self.protection = payload["protection"]
        return key

    def _load_key(self) -> bytes:
        payload = json.loads(self.key_path.read_text(encoding="utf-8"))
        raw = bytes.fromhex(payload["key"])
        self.protection = payload.get("protection", "unknown")
        if self.protection == "dpapi-machine":
            unwrapped = dpapi_unprotect(raw)
            if unwrapped is None:
                raise ValueError(
                    "the vault key is DPAPI-wrapped and could not be unwrapped on this "
                    "machine. Quarantined files encrypted with it cannot be recovered here — "
                    "this is the protection working as intended.")
            return unwrapped
        return raw

    # ---------------------------------------------------------------- files
    def encrypt_file(self, path: Path, *, associated: bytes = b"") -> int:
        """Encrypt a file in place. Returns the ciphertext length."""
        plaintext = Path(path).read_bytes()
        nonce, ciphertext, tag = aes256_gcm_encrypt(self.key(), plaintext, associated)
        header = self.MAGIC + struct.pack("<B", self.VERSION) + nonce + tag
        Path(path).write_bytes(header + ciphertext)
        return len(ciphertext)

    def decrypt_file(self, path: Path, *, associated: bytes = b"") -> int:
        """Decrypt a file in place. Raises ValueError if it was tampered with."""
        blob = Path(path).read_bytes()
        header_len = len(self.MAGIC) + 1 + 12 + 16
        if len(blob) < header_len or blob[:len(self.MAGIC)] != self.MAGIC:
            raise ValueError("not a Candy AES-256-GCM container")
        nonce = blob[len(self.MAGIC) + 1:len(self.MAGIC) + 13]
        tag = blob[len(self.MAGIC) + 13:header_len]
        plaintext = aes256_gcm_decrypt(self.key(), nonce, blob[header_len:], tag, associated)
        Path(path).write_bytes(plaintext)
        return len(plaintext)

    def status(self) -> dict[str, Any]:
        exists = self.key_path.exists()
        return {
            "key_file": str(self.key_path),
            "exists": exists,
            "cipher": "AES-256-GCM (FIPS 197 / SP 800-38D)",
            "key_protection": self.protection if exists else "not created yet",
            "machine_bound": self.protection == "dpapi-machine",
        }


def is_encrypted(path: Path) -> bool:
    try:
        with Path(path).open("rb") as handle:
            return handle.read(len(Vault.MAGIC)) == Vault.MAGIC
    except OSError:
        return False


def derive_key(password: str, salt: bytes, iterations: int = 600_000) -> bytes:
    """PBKDF2-HMAC-SHA512 for a password-protected vault (OWASP 2023 count)."""
    return hashlib.pbkdf2_hmac("sha512", password.encode("utf-8"), salt, iterations, 32)
