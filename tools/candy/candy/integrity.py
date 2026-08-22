"""Self-integrity and platform trust reporting.

The gap this fills: measured boot with TPM attestation. Acting on PCR values at
boot needs an ELAM driver, which needs the certificate nobody here can buy.
Two things are achievable instead:

* **Measured application start.** Candy hashes its own code, its config and its
  threat database into a manifest, signs that manifest with the post-quantum
  LMS key, and re-verifies it on every start. A modified signature file, a
  patched module, or an edited config is reported before monitoring begins.
  That is the same *idea* as measured boot, applied one layer up: the thing
  being measured is Candy rather than the OS.
* **Platform trust reporting.** Secure Boot state, TPM presence and version,
  virtualisation-based security and HVCI are all readable from user mode.
  Candy cannot enforce them, but a machine with Secure Boot off and no TPM is a
  machine where a kernel-mode cheat can load trivially, and the user deserves
  to be told that in plain language.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from .util import IS_WINDOWS, ensure_dir, sha256_file, utc_stamp

NO_WINDOW = 0x08000000

# Files whose contents define how Candy behaves. A change to any of them
# changes what gets detected, blocked or ignored.
MEASURED_GLOBS = ("candy/*.py", "config/config.json", "data/threats.json")


def build_manifest(root: Path) -> dict[str, Any]:
    """Hash every file that determines Candy's behaviour."""
    root = Path(root)
    files: dict[str, str] = {}
    for pattern in MEASURED_GLOBS:
        for path in sorted(root.glob(pattern)):
            if not path.is_file():
                continue
            digest = sha256_file(path, max_bytes=None)
            if digest:
                files[path.relative_to(root).as_posix()] = digest
    return {"created": utc_stamp(), "root": str(root), "files": files,
            "count": len(files)}


def compare_manifests(baseline: dict[str, Any], current: dict[str, Any]) -> list[dict[str, str]]:
    """Differences between a stored baseline and what is on disk now."""
    old = baseline.get("files", {}) or {}
    new = current.get("files", {}) or {}
    findings: list[dict[str, str]] = []
    for name, digest in old.items():
        if name not in new:
            findings.append({"file": name, "problem": "missing"})
        elif new[name] != digest:
            findings.append({"file": name, "problem": "modified",
                             "expected": digest[:16], "found": new[name][:16]})
    for name in new:
        if name not in old:
            findings.append({"file": name, "problem": "added since the baseline"})
    return findings


class IntegrityMonitor:
    """Creates, signs and verifies Candy's own integrity baseline."""

    def __init__(self, config: Any, root: Path, logger: Any | None = None) -> None:
        self.config = config
        self.root = Path(root)
        self.logger = logger
        self.manifest_path = config.data_dir() / "integrity.json"

    # ------------------------------------------------------------- baseline
    def seal(self, key_path: Path | None = None) -> dict[str, Any]:
        """Record — and if a signing key exists, sign — the current state."""
        manifest = build_manifest(self.root)
        document: dict[str, Any] = {"payload": manifest}

        key_file = Path(key_path) if key_path else self.config.data_dir() / "signing-key.json"
        if key_file.exists():
            try:
                from .pqsign import LmsPrivateKey, sign_document

                key = LmsPrivateKey.load(key_file)
                if key.remaining > 0:
                    document = sign_document(key, manifest)
                    key.save()
            except Exception as exc:  # noqa: BLE001 - signing is a bonus, not a gate
                document["signing_error"] = str(exc)

        ensure_dir(self.manifest_path.parent)
        self.manifest_path.write_text(json.dumps(document, indent=2), encoding="utf-8")
        return {"files": manifest["count"], "signed": "signature" in document,
                "path": str(self.manifest_path)}

    def verify(self) -> dict[str, Any]:
        """Check the current files against the sealed baseline."""
        if not self.manifest_path.exists():
            return {"status": "no baseline", "detail":
                    "run 'candy integrity seal' to record one"}
        try:
            document = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return {"status": "unreadable", "detail": str(exc)}

        signature_state = "unsigned baseline"
        if "signature" in document:
            from .pqsign import verify_document

            trusted = str(self.config.get("updates.trusted_public_key", "")) \
                or str(document.get("signature", {}).get("public_key", ""))
            ok, detail = verify_document(document, trusted)
            signature_state = detail
            if not ok:
                return {"status": "SIGNATURE INVALID", "detail": detail,
                        "findings": [{"file": self.manifest_path.name,
                                      "problem": "the baseline itself was tampered with"}]}

        baseline = document.get("payload", document)
        findings = compare_manifests(baseline, build_manifest(self.root))
        return {
            "status": "intact" if not findings else "CHANGED",
            "signature": signature_state,
            "baseline_created": baseline.get("created"),
            "files_measured": baseline.get("count", 0),
            "findings": findings,
        }


# ------------------------------------------------------------ platform state
def _run(command: list[str], timeout: int = 20) -> str:
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=timeout,
                              check=False, creationflags=NO_WINDOW if IS_WINDOWS else 0)
    except Exception:  # noqa: BLE001
        return ""
    return (done.stdout or "").strip()


def secure_boot_state() -> bool | None:
    """True/False if known, None if it cannot be determined."""
    if not IS_WINDOWS:
        return None
    try:
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                            r"SYSTEM\CurrentControlSet\Control\SecureBoot\State") as key:
            value, _ = winreg.QueryValueEx(key, "UEFISecureBootEnabled")
            return bool(value)
    except OSError:
        return None


def tpm_state() -> dict[str, Any]:
    """TPM presence, readiness and spec version, from tpmtool."""
    if not IS_WINDOWS:
        return {"present": None, "detail": "Windows only"}
    output = _run(["tpmtool", "getdeviceinformation"])
    if not output:
        return {"present": None, "detail": "tpmtool returned nothing"}
    lowered = output.lower()
    present = "true" in lowered.split("tpm present:")[-1][:20] if "tpm present:" in lowered else None
    version = ""
    for line in output.splitlines():
        if "spec version" in line.lower() or "tpm version" in line.lower():
            version = line.split(":", 1)[-1].strip()
            break
    return {"present": present, "version": version, "raw": output[:400]}


def virtualisation_security() -> dict[str, Any]:
    """VBS / HVCI state — kernel protections that blunt driver-based cheats."""
    if not IS_WINDOWS:
        return {"vbs": None, "hvci": None}
    try:
        import winreg

        state: dict[str, Any] = {}
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                            r"SYSTEM\CurrentControlSet\Control\DeviceGuard") as key:
            for name, label in (("EnableVirtualizationBasedSecurity", "vbs"),
                                ("HypervisorEnforcedCodeIntegrity", "hvci")):
                try:
                    value, _ = winreg.QueryValueEx(key, name)
                    state[label] = bool(value)
                except OSError:
                    state[label] = None
        return state
    except OSError:
        return {"vbs": None, "hvci": None}


def platform_trust() -> dict[str, Any]:
    """Everything Candy can tell the user about the machine's own defences."""
    secure_boot = secure_boot_state()
    tpm = tpm_state()
    vbs = virtualisation_security()

    advice: list[str] = []
    if secure_boot is False:
        advice.append("Secure Boot is OFF. Unsigned and test-signed drivers can load, which is "
                      "exactly how kernel-mode cheats and rootkits get in. Turn it on in UEFI.")
    if tpm.get("present") is False:
        advice.append("No TPM detected. Windows 11 security features and measured boot are "
                      "unavailable on this machine.")
    if vbs.get("hvci") is False:
        advice.append("Memory integrity (HVCI) is off. Turning it on in Windows Security > "
                      "Device security blocks a large class of vulnerable-driver attacks — "
                      "free, and stronger than anything Candy can enforce from user mode.")
    return {
        "secure_boot": secure_boot,
        "tpm": tpm,
        "virtualisation_based_security": vbs,
        # "No advice" is not the same as "all good". When VBS/HVCI could not be
        # read at all — the registry key is absent, or the query needs rights we
        # do not have — saying the platform looks correctly configured is a
        # claim about something that was never checked.
        "advice": advice or ([
            "Secure Boot and TPM look correct. Virtualisation-based security "
            "could not be read (it usually needs administrator), so that part "
            "is unknown rather than confirmed."]
            if vbs.get("vbs") is None and vbs.get("hvci") is None
            else ["platform protections look correctly configured"]),
    }
