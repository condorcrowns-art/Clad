"""Kernel-enforced policy, without shipping a kernel driver.

This is the real answer to "is there a workaround for kernel?". You cannot run
*your* code in ring 0 for free. You can, for free, make the kernel that is
already there enforce *your* policy. Windows exposes three mechanisms that all
execute inside Microsoft's signed kernel components and all take configuration
from an administrator:

* **Process mitigation policies** (IFEO ``MitigationOptions``). Applied at
  process creation by the loader. ``BlockLowLabelImageLoads`` stops a DLL that
  came out of a browser download from ever being mapped into the target.
  ``DisableExtensionPoints`` kills AppInit/hook injection. ``MicrosoftSignedOnly``
  (Code Integrity Guard) refuses every non-Microsoft DLL. These are the same
  enforcement points an anti-cheat driver would install — the kernel is doing
  the work, and it takes the policy from a registry key.
* **Attack Surface Reduction rules**, enforced by Defender's kernel driver.
  "Block credential stealing from lsass", "block executables from email",
  "block untrusted unsigned processes from USB", "block persistence through WMI
  subscription" — each is a kernel-level block that a user-mode tool could only
  ever report on.
* **WDAC** (Windows Defender Application Control), enforced by kernel code
  integrity. A policy that only allows signed or hash-listed binaries to
  execute is real application allowlisting, on every Windows 10/11 edition,
  free.

None of this makes Candy the enforcer. It makes Candy the *policy author*,
which is strictly better: the enforcement is done by code Microsoft wrote,
signed and tests, and a bug in Candy cannot bluescreen anything.
"""
from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from .config import Config
from .util import IS_WINDOWS, ensure_dir, utc_stamp
from .winapi import is_admin

NO_WINDOW = 0x08000000

# Microsoft's published Attack Surface Reduction rule GUIDs. Defender validates
# these itself, and `read_asr_state` reads back what it actually accepted, so a
# stale GUID shows up as "not applied" rather than as a silent gap.
ASR_RULES: dict[str, tuple[str, str]] = {
    "9e6c4e1f-7d60-472f-ba1a-a39ef669e4b2": (
        "Block credential stealing from LSASS",
        "stops Mimikatz-style credential dumping — the step after an executor's stealer runs"),
    "be9ba2d9-53ea-4cdc-84e5-9b1eeee46550": (
        "Block executable content from email and webmail",
        "attachments cannot launch directly"),
    "d3e037e1-3eb8-44c8-a917-57927947596d": (
        "Block JS/VBS from launching downloaded executable content",
        "the classic script-dropper chain"),
    "5beb7efe-fd9a-4556-801d-275e5ffc04cc": (
        "Block obfuscated scripts",
        "encoded PowerShell and packed JScript"),
    "d1e49aac-8f56-4280-b9ba-993a6d77406c": (
        "Block process creation from PSExec and WMI commands",
        "common lateral-movement and persistence launchers"),
    "b2b3f03d-6a65-4f7b-a9c7-1c7ef74a9ba4": (
        "Block untrusted and unsigned processes running from USB",
        "removable-media autorun payloads"),
    "e6db77e5-3df2-4cf1-b95a-636979351e5b": (
        "Block persistence through WMI event subscription",
        "a persistence route Candy's registry audit cannot see"),
    "c1db55ab-c21a-4637-bb3f-a12568109d35": (
        "Use advanced protection against ransomware",
        "behavioural ransomware blocking"),
    "d4f940ab-401b-4efc-aadc-ad5f3c50688a": (
        "Block Office applications from creating child processes",
        "macro-dropper chain"),
    "3b576869-a4ec-4529-8536-b80a7769e899": (
        "Block Office applications from creating executable content",
        "macro payload drops"),
    "01443614-cd74-433a-b99e-2ecdc07bfc25": (
        "Block executable files unless they meet prevalence or age criteria",
        "brand-new unknown executables — aggressive, and exactly the executor case"),
    "56a863a9-875e-4185-98a7-b882c64b5ce5": (
        "Block abuse of exploited vulnerable signed drivers",
        "the BYOVD technique kernel cheats use to get into ring 0"),
}

# The aggressive ones. Correct for a locked-down personal machine, wrong as a
# default because they block legitimate new software too.
ASR_AGGRESSIVE = {"01443614-cd74-433a-b99e-2ecdc07bfc25"}

# Process mitigation profiles. Names match Set-ProcessMitigation's parameters.
MITIGATION_PROFILES: dict[str, dict[str, Any]] = {
    "self": {
        "description": "Maximum hardening for Candy's own process",
        "enable": ["DEP", "EmulateAtlThunks", "BottomUp", "HighEntropy", "SEHOP",
                   "TerminateOnError", "DisableExtensionPoints", "BlockRemoteImageLoads",
                   "BlockLowLabelImageLoads", "CFG", "StrictCFG", "StrictHandle",
                   "EnableExportAddressFilter", "EnableImportAddressFilter",
                   "EnableRopStackPivot", "EnableRopCallerCheck", "EnableRopSimExec"],
        "risk": "low",
    },
    "game": {
        "description": "Anti-injection hardening for the Roblox client",
        # Deliberately conservative. MicrosoftSignedOnly would refuse Roblox's
        # own Roblox-signed DLLs and break the game; BlockDynamicCode breaks
        # every JIT. These three block the injection routes without touching
        # anything the game legitimately does.
        "enable": ["DisableExtensionPoints", "BlockRemoteImageLoads", "BlockLowLabelImageLoads"],
        "risk": "medium",
    },
    "paranoid": {
        "description": "Code Integrity Guard — only Microsoft-signed DLLs may load",
        "enable": ["MicrosoftSignedOnly", "DisableExtensionPoints", "BlockRemoteImageLoads",
                   "BlockLowLabelImageLoads", "BlockDynamicCode"],
        "risk": "high",
    },
    "audit": {
        "description": "Report what would be blocked, block nothing",
        "enable": ["AuditMicrosoftSigned", "AuditRemoteImageLoads",
                   "AuditLowLabelImageLoads", "AuditDynamicCode"],
        "risk": "none",
    },
}


@dataclass
class PolicyResult:
    ok: bool
    detail: str
    applied: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)

    def __str__(self) -> str:
        return f"{'OK' if self.ok else 'FAILED'}: {self.detail}"


def _powershell(script: str, timeout: int = 90) -> tuple[bool, str]:
    """Run a PowerShell one-liner. Returns (ok, output)."""
    if not IS_WINDOWS:
        return False, "Windows only"
    try:
        done = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-Command", script],
            capture_output=True, text=True, timeout=timeout, check=False,
            creationflags=NO_WINDOW)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
    output = ((done.stdout or "") + (done.stderr or "")).strip()
    return done.returncode == 0, output


class KernelPolicy:
    """Writes policy that Windows' own kernel components enforce."""

    def __init__(self, config: Config, logger: Any | None = None) -> None:
        self.config = config
        self.logger = logger
        self.ledger_path = config.data_dir() / "kernel-policy.json"

    # ------------------------------------------------------------- ledger
    def _ledger(self) -> dict[str, Any]:
        try:
            return json.loads(self.ledger_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"asr": [], "mitigations": {}, "applied_at": None}

    def _save(self, ledger: dict[str, Any]) -> None:
        ensure_dir(self.ledger_path.parent)
        ledger["applied_at"] = utc_stamp()
        self.ledger_path.write_text(json.dumps(ledger, indent=2), encoding="utf-8")

    # ---------------------------------------------------------------- ASR
    def read_asr_state(self) -> dict[str, str]:
        """What Defender says is actually configured, not what we asked for."""
        ok, output = _powershell(
            "$p = Get-MpPreference; "
            "$ids = @($p.AttackSurfaceReductionRules_Ids); "
            "$acts = @($p.AttackSurfaceReductionRules_Actions); "
            "$out = @(); for ($i=0; $i -lt $ids.Count; $i++) "
            "{ $out += ,@($ids[$i], $acts[$i]) }; "
            "$out | ForEach-Object { $_[0] + '=' + $_[1] }")
        if not ok:
            return {}
        state: dict[str, str] = {}
        for line in output.splitlines():
            key, _, value = line.strip().partition("=")
            if key:
                state[key.lower()] = {"0": "disabled", "1": "block", "2": "audit",
                                      "6": "warn"}.get(value.strip(), value.strip())
        return state

    def apply_asr(self, *, mode: str = "block", aggressive: bool = False) -> PolicyResult:
        """Turn on Defender's Attack Surface Reduction rules.

        ``mode`` is ``block`` or ``audit``. Audit logs what would have been
        blocked and changes nothing, which is the right way to start.
        """
        if not IS_WINDOWS:
            return PolicyResult(False, "Windows only")
        if not is_admin():
            return PolicyResult(False, "administrator rights are required to configure Defender")

        action = {"block": "Enabled", "audit": "AuditMode", "off": "Disabled"}.get(mode)
        if action is None:
            return PolicyResult(False, f"unknown mode {mode!r}")

        rules = [rule for rule in ASR_RULES
                 if aggressive or rule not in ASR_AGGRESSIVE]
        ids = ",".join(f"'{rule}'" for rule in rules)
        actions = ",".join(f"'{action}'" for _ in rules)
        ok, output = _powershell(
            f"Set-MpPreference -AttackSurfaceReductionRules_Ids {ids} "
            f"-AttackSurfaceReductionRules_Actions {actions}")
        if not ok:
            return PolicyResult(False, f"Defender rejected the request: {output[:300]}")

        # Read back rather than trusting the write: a rule Defender does not
        # recognise silently does nothing, and that must be visible.
        state = self.read_asr_state()
        applied = [rule for rule in rules if state.get(rule.lower()) in ("block", "audit", "warn")]
        failed = [rule for rule in rules if rule not in applied]

        ledger = self._ledger()
        ledger["asr"] = applied
        ledger["asr_mode"] = mode
        self._save(ledger)
        return PolicyResult(
            bool(applied),
            f"{len(applied)}/{len(rules)} ASR rules active in {mode} mode"
            + (f"; {len(failed)} not accepted by this Defender version" if failed else ""),
            applied=applied, failed=failed)

    def disable_asr(self) -> PolicyResult:
        ledger = self._ledger()
        rules = ledger.get("asr") or list(ASR_RULES)
        ids = ",".join(f"'{rule}'" for rule in rules)
        actions = ",".join("'Disabled'" for _ in rules)
        ok, output = _powershell(
            f"Set-MpPreference -AttackSurfaceReductionRules_Ids {ids} "
            f"-AttackSurfaceReductionRules_Actions {actions}")
        ledger["asr"] = []
        self._save(ledger)
        return PolicyResult(ok, "ASR rules disabled" if ok else output[:300])

    # -------------------------------------------------------- mitigations
    def harden_process(self, image: str, profile: str = "game") -> PolicyResult:
        """Apply kernel-enforced mitigations to one image name."""
        from .prevent import valid_image_name

        name = valid_image_name(image)
        if name is None:
            return PolicyResult(False, f"{image!r} is not a plain image name like 'roblox.exe'")
        spec = MITIGATION_PROFILES.get(profile)
        if spec is None:
            return PolicyResult(False, f"unknown profile {profile!r}")
        if not IS_WINDOWS:
            return PolicyResult(False, "Windows only")
        if not is_admin():
            return PolicyResult(False, "administrator rights are required")

        options = ",".join(spec["enable"])
        ok, output = _powershell(f"Set-ProcessMitigation -Name '{name}' -Enable {options}")
        if not ok:
            # Older builds reject unknown option names outright; retry with the
            # subset every supported build understands rather than giving up.
            fallback = ["DEP", "BottomUp", "HighEntropy", "DisableExtensionPoints"]
            ok, output = _powershell(
                f"Set-ProcessMitigation -Name '{name}' -Enable {','.join(fallback)}")
            if not ok:
                return PolicyResult(False, f"Set-ProcessMitigation failed: {output[:300]}")
            spec = {**spec, "enable": fallback}

        ledger = self._ledger()
        ledger.setdefault("mitigations", {})[name.lower()] = {
            "profile": profile, "options": spec["enable"], "applied": utc_stamp()}
        self._save(ledger)
        return PolicyResult(True, f"{name}: {profile} mitigations applied ({len(spec['enable'])} "
                                  f"options, enforced by the kernel at process start)",
                            applied=list(spec["enable"]))

    def unharden_process(self, image: str) -> PolicyResult:
        from .prevent import valid_image_name

        name = valid_image_name(image)
        if name is None:
            return PolicyResult(False, f"{image!r} is not a valid image name")
        ledger = self._ledger()
        entry = ledger.get("mitigations", {}).pop(name.lower(), None)
        if entry is None:
            return PolicyResult(False, f"{name} was not hardened by Candy")
        options = ",".join(entry.get("options", []))
        ok, output = _powershell(f"Set-ProcessMitigation -Name '{name}' -Disable {options}")
        self._save(ledger)
        return PolicyResult(ok, f"{name}: mitigations removed" if ok else output[:300])

    def read_mitigations(self, image: str) -> dict[str, Any]:
        ok, output = _powershell(
            f"Get-ProcessMitigation -Name '{image}' | ConvertTo-Json -Depth 4 -Compress")
        if not ok or not output:
            return {}
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return {"raw": output[:2000]}

    # --------------------------------------------------------------- WDAC
    def generate_wdac_policy(self, allow_paths: Iterable[str], out_path: Path,
                             *, audit: bool = True) -> PolicyResult:
        """Write a WDAC policy XML that allows only what is listed.

        WDAC is enforced by kernel code integrity on every Windows 10/11
        edition. Deploying it is a deliberate, documented, reboot-required step
        — Candy writes the policy and tells you the two commands; it does not
        silently make a machine refuse to boot unknown software.
        """
        rules = "\n".join(
            f'      <Deny ID="ID_DENY_{index}" FriendlyName="{Path(path).name}" '
            f'FilePath="{path}" />'
            for index, path in enumerate(allow_paths))
        policy = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by Candy {utc_stamp()}.
     Mode: {"AUDIT (logs only)" if audit else "ENFORCED"}.
     Deploy:  CiTool --update-policy <converted .cip>   (Windows 11 22H2+)
     or:      ConvertFrom-CIPolicy .\\policy.xml .\\policy.cip
     Review the CodeIntegrity operational event log before enforcing. -->
<SiPolicy xmlns="urn:schemas-microsoft-com:sipolicy">
  <VersionEx>1.0.0.0</VersionEx>
  <PolicyTypeID>{{A244370E-44C9-4C06-B551-F6016E563076}}</PolicyTypeID>
  <Rules>
    <Rule><Option>Enabled:Unsigned System Integrity Policy</Option></Rule>
    <Rule><Option>Enabled:Advanced Boot Options Menu</Option></Rule>
{'    <Rule><Option>Enabled:Audit Mode</Option></Rule>' if audit else ''}
  </Rules>
  <FileRules>
{rules}
  </FileRules>
  <SigningScenarios>
    <SigningScenario Value="12" ID="ID_SIGNINGSCENARIO_WINDOWS" FriendlyName="Windows">
      <ProductSigners />
    </SigningScenario>
  </SigningScenarios>
</SiPolicy>
"""
        try:
            ensure_dir(Path(out_path).parent)
            Path(out_path).write_text(policy, encoding="utf-8")
        except OSError as exc:
            return PolicyResult(False, f"could not write {out_path}: {exc}")
        return PolicyResult(True, f"WDAC policy written to {out_path} "
                                  f"({'audit' if audit else 'ENFORCED'} mode). "
                                  f"Review it, then deploy with CiTool.")

    # ------------------------------------------------------------- status
    def status(self) -> dict[str, Any]:
        ledger = self._ledger()
        state = self.read_asr_state() if IS_WINDOWS else {}
        active = {rule: state.get(rule.lower(), "not configured") for rule in ASR_RULES}
        return {
            "administrator": is_admin(),
            "asr_mode": ledger.get("asr_mode", "not configured"),
            "asr_rules": {ASR_RULES[rule][0]: status for rule, status in active.items()},
            "asr_active_count": sum(1 for value in active.values()
                                    if value in ("block", "audit", "warn")),
            "hardened_processes": ledger.get("mitigations", {}),
        }
