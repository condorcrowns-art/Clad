"""Post-quantum signatures: LMS / LM-OTS, RFC 8554, in pure Python.

CNSA 2.0 lists exactly two things a project with no budget can actually
implement to the letter: **LMS and XMSS**, the stateful hash-based signature
schemes, approved for *software and firmware signing*. Their security rests on
nothing but the hash function — no lattices, no elliptic curves, no library to
buy or build. Shor's algorithm does not break them; Grover's only halves the
preimage margin, which SHA-256 has to spare.

That maps precisely onto what Candy needs signed:

* the **threat database** it downloads (a feed that can order Candy to
  quarantine files must not be forgeable),
* the **root hash of the audit log**, so a log can be proven intact later.

This module implements LMS with SHA-256, LM-OTS parameter set
``LMOTS_SHA256_N32_W8`` (RFC 8554 type 4) and LMS tree types H5/H10/H15.

**Stateful means stateful.** An LM-OTS key signs exactly once. Signing twice
with one leaf leaks the private key. The signer here refuses to reuse an index
and persists its counter before releasing a signature — the failure mode is a
lost signature slot, never a reused one.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import struct
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------- constants
# Domain separation values, RFC 8554 section 3.1.3.
D_PBLC = 0x8080
D_MESG = 0x8181
D_LEAF = 0x8282
D_INTR = 0x8383

# LM-OTS: SHA-256, n=32, w=8  ->  p=34, ls=0  (RFC 8554 section 4.1)
LMOTS_SHA256_N32_W8 = 0x00000004
OTS_N = 32
OTS_W = 8
OTS_P = 34
OTS_LS = 0
OTS_MAX_CHAIN = (1 << OTS_W) - 1          # 255 hash steps per chain

# LMS tree heights (RFC 8554 section 5.1)
LMS_TYPES = {
    0x00000005: 5,    # LMS_SHA256_M32_H5   — 32 signatures
    0x00000006: 10,   # LMS_SHA256_M32_H10  — 1024 signatures
    0x00000007: 15,   # LMS_SHA256_M32_H15  — 32768 signatures
}
LMS_SHA256_M32_H5 = 0x00000005
LMS_SHA256_M32_H10 = 0x00000006
LMS_SHA256_M32_H15 = 0x00000007

M = 32   # tree node / hash output length


def _u32(value: int) -> bytes:
    return struct.pack(">I", value)


def _u16(value: int) -> bytes:
    return struct.pack(">H", value)


def _u8(value: int) -> bytes:
    return struct.pack(">B", value)


def _H(*parts: bytes) -> bytes:
    digest = hashlib.sha256()
    for part in parts:
        digest.update(part)
    return digest.digest()


def _checksum(q_hash: bytes) -> int:
    """RFC 8554 section 4.4. With w=8 each coefficient is one byte."""
    total = 0
    for byte in q_hash:
        total += OTS_MAX_CHAIN - byte
    return (total << OTS_LS) & 0xFFFF


def _coefficients(data: bytes) -> list[int]:
    """The p coefficients signed by LM-OTS: the hash, then its checksum."""
    checksum = _checksum(data)
    return list(data) + list(_u16(checksum))


# ------------------------------------------------------------------- LM-OTS
def _ots_private_value(seed: bytes, identifier: bytes, q: int, index: int) -> bytes:
    """Pseudorandom key generation, RFC 8554 appendix A.

    Deriving every one-time value from one seed means the private key is 48
    bytes on disk instead of megabytes, and there is no per-leaf state to lose.
    """
    return _H(identifier, _u32(q), _u16(index), _u8(0xFF), seed)


def _ots_public_key(seed: bytes, identifier: bytes, q: int) -> bytes:
    """The LM-OTS public key: chain every private value to the end, then hash."""
    parts = [identifier, _u32(q), _u16(D_PBLC)]
    for index in range(OTS_P):
        value = _ots_private_value(seed, identifier, q, index)
        for step in range(OTS_MAX_CHAIN):
            value = _H(identifier, _u32(q), _u16(index), _u8(step), value)
        parts.append(value)
    return _H(*parts)


def _ots_sign(seed: bytes, identifier: bytes, q: int, message: bytes,
              randomizer: bytes | None = None) -> bytes:
    """LM-OTS signature: type || C || y[0..p-1]."""
    c = randomizer if randomizer is not None else secrets.token_bytes(OTS_N)
    q_hash = _H(identifier, _u32(q), _u16(D_MESG), c, message)
    coefficients = _coefficients(q_hash)

    parts = [_u32(LMOTS_SHA256_N32_W8), c]
    for index in range(OTS_P):
        value = _ots_private_value(seed, identifier, q, index)
        for step in range(coefficients[index]):
            value = _H(identifier, _u32(q), _u16(index), _u8(step), value)
        parts.append(value)
    return b"".join(parts)


def _ots_public_key_candidate(signature: bytes, identifier: bytes, q: int,
                              message: bytes) -> bytes | None:
    """Recompute the LM-OTS public key from a signature (RFC 8554 4.6)."""
    expected = 4 + OTS_N + OTS_P * OTS_N
    if len(signature) != expected:
        return None
    if struct.unpack(">I", signature[:4])[0] != LMOTS_SHA256_N32_W8:
        return None

    c = signature[4:4 + OTS_N]
    q_hash = _H(identifier, _u32(q), _u16(D_MESG), c, message)
    coefficients = _coefficients(q_hash)

    parts = [identifier, _u32(q), _u16(D_PBLC)]
    for index in range(OTS_P):
        start = 4 + OTS_N + index * OTS_N
        value = signature[start:start + OTS_N]
        for step in range(coefficients[index], OTS_MAX_CHAIN):
            value = _H(identifier, _u32(q), _u16(index), _u8(step), value)
        parts.append(value)
    return _H(*parts)


# ---------------------------------------------------------------------- LMS
@dataclass
class LmsPublicKey:
    lms_type: int
    ots_type: int
    identifier: bytes
    root: bytes

    def to_bytes(self) -> bytes:
        return _u32(self.lms_type) + _u32(self.ots_type) + self.identifier + self.root

    @classmethod
    def from_bytes(cls, raw: bytes) -> "LmsPublicKey":
        if len(raw) != 4 + 4 + 16 + M:
            raise ValueError(f"LMS public key must be {4 + 4 + 16 + M} bytes, got {len(raw)}")
        lms_type, ots_type = struct.unpack(">II", raw[:8])
        if lms_type not in LMS_TYPES:
            raise ValueError(f"unsupported LMS type 0x{lms_type:08x}")
        if ots_type != LMOTS_SHA256_N32_W8:
            raise ValueError(f"unsupported LM-OTS type 0x{ots_type:08x}")
        return cls(lms_type, ots_type, raw[8:24], raw[24:])

    def to_hex(self) -> str:
        return self.to_bytes().hex()

    @classmethod
    def from_hex(cls, text: str) -> "LmsPublicKey":
        return cls.from_bytes(bytes.fromhex(text.strip()))

    @property
    def height(self) -> int:
        return LMS_TYPES[self.lms_type]

    @property
    def capacity(self) -> int:
        return 1 << self.height


class LmsPrivateKey:
    """An LMS signing key. Stateful: each leaf signs at most once."""

    def __init__(self, seed: bytes, identifier: bytes, lms_type: int = LMS_SHA256_M32_H10,
                 q: int = 0, path: Path | None = None) -> None:
        if lms_type not in LMS_TYPES:
            raise ValueError(f"unsupported LMS type 0x{lms_type:08x}")
        if len(seed) != OTS_N or len(identifier) != 16:
            raise ValueError("seed must be 32 bytes and identifier 16 bytes")
        self.seed = seed
        self.identifier = identifier
        self.lms_type = lms_type
        self.height = LMS_TYPES[lms_type]
        self.q = q
        self.path = path
        self._tree: list[bytes] | None = None
        self._lock = threading.Lock()

    # ------------------------------------------------------------ creation
    @classmethod
    def generate(cls, lms_type: int = LMS_SHA256_M32_H10,
                 path: Path | None = None) -> "LmsPrivateKey":
        return cls(secrets.token_bytes(OTS_N), secrets.token_bytes(16), lms_type, 0, path)

    # ---------------------------------------------------------------- tree
    def _build_tree(self) -> list[bytes]:
        """The full Merkle tree as a 1-indexed array of 2^(h+1) nodes.

        Building it costs 2^h LM-OTS key generations — about nine million
        SHA-256 calls at h=10. It is done once and cached, because signing
        needs the authentication path.
        """
        if self._tree is not None:
            return self._tree
        leaves = 1 << self.height
        tree: list[bytes] = [b""] * (2 * leaves)
        for leaf in range(leaves):
            ots_public = _ots_public_key(self.seed, self.identifier, leaf)
            node = leaves + leaf
            tree[node] = _H(self.identifier, _u32(node), _u16(D_LEAF), ots_public)
        for node in range(leaves - 1, 0, -1):
            tree[node] = _H(self.identifier, _u32(node), _u16(D_INTR),
                            tree[2 * node], tree[2 * node + 1])
        self._tree = tree
        return tree

    def public_key(self) -> LmsPublicKey:
        return LmsPublicKey(self.lms_type, LMOTS_SHA256_N32_W8,
                            self.identifier, self._build_tree()[1])

    @property
    def remaining(self) -> int:
        return (1 << self.height) - self.q

    # --------------------------------------------------------------- sign
    def sign(self, message: bytes, *, randomizer: bytes | None = None) -> bytes:
        """Sign, consuming one leaf. Raises when the key is exhausted."""
        with self._lock:
            if self.q >= (1 << self.height):
                raise RuntimeError(
                    f"LMS key exhausted: all {1 << self.height} one-time keys are used. "
                    f"Generate a new key and publish the new public key.")
            q = self.q
            # Persist the *incremented* counter before the signature exists, so
            # a crash mid-sign burns a leaf rather than risking reuse.
            self.q = q + 1
            if self.path is not None:
                self._save_unlocked()

        tree = self._build_tree()
        ots_signature = _ots_sign(self.seed, self.identifier, q, message, randomizer)

        path_nodes: list[bytes] = []
        node = (1 << self.height) + q
        while node > 1:
            path_nodes.append(tree[node ^ 1])
            node //= 2
        return _u32(q) + ots_signature + _u32(self.lms_type) + b"".join(path_nodes)

    # ---------------------------------------------------------- persistence
    def to_dict(self) -> dict[str, Any]:
        return {
            "format": "candy-lms-private-v1",
            "lms_type": self.lms_type,
            "seed": self.seed.hex(),
            "identifier": self.identifier.hex(),
            "q": self.q,
            "warning": "SECRET. One leaf signs once. Never copy this file to two machines.",
        }

    def _save_unlocked(self) -> None:
        if self.path is None:
            return
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.to_dict(), indent=2), encoding="utf-8")
        os.replace(tmp, self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def save(self, path: Path | None = None) -> Path:
        with self._lock:
            if path is not None:
                self.path = path
            if self.path is None:
                raise ValueError("no path to save the private key to")
            self._save_unlocked()
            return self.path

    @classmethod
    def load(cls, path: str | Path) -> "LmsPrivateKey":
        path = Path(path)
        data = json.loads(path.read_text(encoding="utf-8"))
        if data.get("format") != "candy-lms-private-v1":
            raise ValueError("not a Candy LMS private key")
        return cls(bytes.fromhex(data["seed"]), bytes.fromhex(data["identifier"]),
                   int(data["lms_type"]), int(data["q"]), path)


def verify(public_key: LmsPublicKey | str | bytes, message: bytes, signature: bytes) -> bool:
    """Verify an LMS signature. Returns False on any malformation.

    Verification is cheap — no tree build — so clients only ever need this.
    """
    try:
        if isinstance(public_key, str):
            public_key = LmsPublicKey.from_hex(public_key)
        elif isinstance(public_key, (bytes, bytearray)):
            public_key = LmsPublicKey.from_bytes(bytes(public_key))

        height = public_key.height
        expected = 4 + (4 + OTS_N + OTS_P * OTS_N) + 4 + height * M
        if len(signature) != expected:
            return False

        q = struct.unpack(">I", signature[:4])[0]
        if q >= (1 << height):
            return False

        ots_end = 4 + 4 + OTS_N + OTS_P * OTS_N
        ots_signature = signature[4:ots_end]
        lms_type = struct.unpack(">I", signature[ots_end:ots_end + 4])[0]
        if lms_type != public_key.lms_type:
            return False

        candidate = _ots_public_key_candidate(ots_signature, public_key.identifier, q, message)
        if candidate is None:
            return False

        node = (1 << height) + q
        value = _H(public_key.identifier, _u32(node), _u16(D_LEAF), candidate)
        offset = ots_end + 4
        for level in range(height):
            sibling = signature[offset + level * M:offset + (level + 1) * M]
            parent = node // 2
            if node % 2:
                value = _H(public_key.identifier, _u32(parent), _u16(D_INTR), sibling, value)
            else:
                value = _H(public_key.identifier, _u32(parent), _u16(D_INTR), value, sibling)
            node = parent
        return secrets.compare_digest(value, public_key.root)
    except (ValueError, struct.error, IndexError):
        return False


# ------------------------------------------------------- signed containers
def sign_document(private_key: LmsPrivateKey, payload: dict[str, Any]) -> dict[str, Any]:
    """Wrap a JSON document with an LMS signature over its canonical form."""
    body = canonical_bytes(payload)
    signature = private_key.sign(body)
    return {
        "payload": payload,
        "signature": {
            "algorithm": "LMS_SHA256_M32 / LMOTS_SHA256_N32_W8 (RFC 8554)",
            "public_key": private_key.public_key().to_hex(),
            "value": signature.hex(),
        },
    }


def verify_document(document: dict[str, Any], trusted_public_key: str) -> tuple[bool, str]:
    """Check a signed document against a *pinned* public key.

    The key embedded in the document is never trusted on its own — anyone can
    sign anything with a key they just made. It is only used to report a
    mismatch clearly.
    """
    signature_block = document.get("signature")
    if not isinstance(signature_block, dict):
        return False, "document is not signed"
    embedded = str(signature_block.get("public_key", ""))
    if not trusted_public_key:
        return False, "no trusted public key is configured to verify against"
    if embedded.lower() != trusted_public_key.strip().lower():
        return False, ("signed by a different key than the one you trust "
                       f"(document: {embedded[:24]}…, trusted: {trusted_public_key[:24]}…)")
    try:
        signature = bytes.fromhex(str(signature_block.get("value", "")))
    except ValueError:
        return False, "signature is not valid hex"
    body = canonical_bytes(document.get("payload"))
    if verify(trusted_public_key, body, signature):
        return True, "signature verified against the pinned LMS public key"
    return False, "SIGNATURE INVALID — the payload does not match the signature"


def canonical_bytes(payload: Any) -> bytes:
    """Deterministic JSON encoding, so signer and verifier hash the same bytes."""
    return json.dumps(payload, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")
