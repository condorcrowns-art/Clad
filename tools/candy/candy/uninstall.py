"""Reverting every system change Candy has made.

Candy touches a lot: the hosts file, DNS settings, firewall rules and policy,
IFEO keys, browser enterprise policy, Defender ASR rules, process mitigations,
a scheduled task, registry protocol switches. Any tool that makes that many
changes owes the user one command that puts them all back — and it has to work
even if some of them were made by a previous install that no longer has its
ledger.

Two rules here:

* **Dry run first.** ``plan()`` lists exactly what would be undone and changes
  nothing. That is the default for the CLI, because "undo everything" is a
  command people run in a hurry.
* **Never fail closed.** Each step is independent and a failure in one does not
  stop the rest. Leaving the machine half-reverted — DNS pointed at a resolver
  that is no longer running, say — would be worse than any of the changes.

Quarantined files and logs are deliberately *not* removed. They are evidence,
and this command is about system state, not about erasing what happened.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from .config import Config
from .util import IS_WINDOWS
from .winapi import is_admin


@dataclass
class RevertStep:
    name: str
    description: str
    applies: bool
    detail: str = ""
    needs_admin: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description,
                "applies": self.applies, "detail": self.detail}


@dataclass
class RevertResult:
    steps: list[tuple[str, bool, str]] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(success for _name, success, _detail in self.steps)

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok,
                "steps": [{"name": n, "ok": s, "detail": d} for n, s, d in self.steps]}


class Reverter:
    """Undoes Candy's system changes, one independent step at a time."""

    def __init__(self, config: Config, logger: Any | None = None) -> None:
        self.config = config
        self.logger = logger

    # ------------------------------------------------------------------ plan
    def plan(self) -> list[RevertStep]:
        """What would be undone, without undoing anything."""
        steps: list[RevertStep] = []

        from .netblock import HostsBlocker, hosts_path_for_platform

        hosts_path = hosts_path_for_platform(self.config.get("web.hosts_file") or None)
        manual = HostsBlocker(hosts_path).blocked()
        steps.append(RevertStep(
            "hosts_blocks", "Domains you blocked by hand, in the hosts file",
            bool(manual), f"{len(manual)} domain(s): {', '.join(manual[:5])}"
            + ("…" if len(manual) > 5 else "")))

        from .adblock import AdBlocker

        ads = AdBlocker(self.config).blocked()
        steps.append(RevertStep(
            "adblock", "Ad, tracker and malvertising domains in the hosts file",
            bool(ads), f"{len(ads)} domain(s)"))

        from .firewall import FirewallController

        firewall = FirewallController(self.config)
        allowlist = firewall.load_allowlist()
        status = firewall.status()
        steps.append(RevertStep(
            "firewall_lockdown", "Default-deny outbound firewall policy",
            bool(status.locked_down),
            "every profile is currently blocking outbound by default"
            if status.locked_down else "not locked down"))
        steps.append(RevertStep(
            "firewall_rules", "Firewall rules Candy created (allow, block, contain)",
            bool(allowlist), f"{len(allowlist)} allowlisted program(s) plus any block rules"))

        from .prevent import ExecutionBlocker, NetworkContainer

        blocked = ExecutionBlocker(self.config).blocked_images()
        contained = NetworkContainer(self.config).contained()
        steps.append(RevertStep(
            "execution_blocks", "Programs blocked from running (IFEO)",
            bool(blocked), ", ".join(blocked) or "none"))
        steps.append(RevertStep(
            "network_containment", "Programs cut off from the network",
            bool(contained), f"{len(contained)} program(s)"))

        from .netharden import NetworkHardener

        network = NetworkHardener(self.config).status()
        steps.append(RevertStep(
            "dns", "System DNS settings",
            network.get("resolver", "system default") != "system default",
            f"currently {network.get('resolver')}"))
        steps.append(RevertStep(
            "browser_policy", "Browser DoH and URL blocklist policy",
            bool(network.get("browser_policy")),
            ", ".join(network.get("browser_policy") or []) or "none"))
        steps.append(RevertStep(
            "protocol_hardening", "LLMNR/mDNS/NetBIOS/WPAD and SMB egress settings",
            bool(network.get("protocol_changes")),
            f"{network.get('protocol_changes', 0)} registry change(s)"))

        from .kernelpolicy import KernelPolicy

        kernel = KernelPolicy(self.config).status()
        steps.append(RevertStep(
            "asr", "Defender Attack Surface Reduction rules",
            bool(kernel.get("asr_active_count")),
            f"{kernel.get('asr_active_count', 0)} rule(s) active"))
        steps.append(RevertStep(
            "mitigations", "Process mitigation policies applied to specific programs",
            bool(kernel.get("hardened_processes")),
            ", ".join(kernel.get("hardened_processes", {})) or "none"))

        steps.append(RevertStep(
            "autostart", "The scheduled task that starts Candy at boot",
            IS_WINDOWS, "checked at revert time"))

        return steps

    # ---------------------------------------------------------------- revert
    def revert_all(self, *, progress: Callable[[str], None] | None = None) -> RevertResult:
        """Undo everything. Each step is independent; one failure does not stop the rest."""
        result = RevertResult()

        def run(name: str, action: Callable[[], tuple[bool, str]]) -> None:
            if progress:
                progress(f"reverting {name}…")
            try:
                ok, detail = action()
            except Exception as exc:  # noqa: BLE001 - a failed step must not strand the rest
                ok, detail = False, f"{exc.__class__.__name__}: {exc}"
            result.steps.append((name, ok, detail))
            if self.logger:
                self.logger.write({"event": "revert", "step": name, "ok": ok, "detail": detail})

        run("hosts_blocks", self._revert_hosts)
        run("adblock", self._revert_adblock)
        run("firewall", self._revert_firewall)
        run("execution_blocks", self._revert_execution_blocks)
        run("network_containment", self._revert_containment)
        run("network_hardening", self._revert_network)
        run("kernel_policy", self._revert_kernel)
        run("autostart", self._revert_autostart)
        return result

    # ------------------------------------------------------------ the steps
    def _revert_hosts(self) -> tuple[bool, str]:
        from .netblock import HostsBlocker, hosts_path_for_platform

        blocker = HostsBlocker(hosts_path_for_platform(self.config.get("web.hosts_file") or None))
        if not blocker.blocked():
            return True, "nothing to remove"
        outcome = blocker.clear()
        return outcome.ok, outcome.detail

    def _revert_adblock(self) -> tuple[bool, str]:
        from .adblock import AdBlocker

        blocker = AdBlocker(self.config)
        if not blocker.blocked():
            return True, "nothing to remove"
        outcome = blocker.clear()
        self.config.set("adblock.enabled", False)
        self.config.save()
        return outcome.ok, outcome.detail

    def _revert_firewall(self) -> tuple[bool, str]:
        from .firewall import FirewallController

        controller = FirewallController(self.config)
        removed, failed = controller.remove_all_rules()
        unlocked, detail = controller.unlock()
        return (failed == 0 and unlocked,
                f"removed {removed} rule(s), {failed} failed; {detail}")

    def _revert_execution_blocks(self) -> tuple[bool, str]:
        from .prevent import ExecutionBlocker

        blocker = ExecutionBlocker(self.config)
        if not blocker.blocked_images():
            return True, "nothing was blocked"
        outcome = blocker.unblock_all()
        return outcome.ok, outcome.detail

    def _revert_containment(self) -> tuple[bool, str]:
        from .prevent import NetworkContainer

        container = NetworkContainer(self.config)
        contained = container.contained()
        if not contained:
            return True, "nothing was contained"
        failures = [program for program in contained if not container.release(program).ok]
        return not failures, (f"released {len(contained) - len(failures)} program(s)"
                              + (f", {len(failures)} failed" if failures else ""))

    def _revert_network(self) -> tuple[bool, str]:
        from .netharden import NetworkHardener

        outcomes = NetworkHardener(self.config, self.logger).revert_all()
        return all(o.ok for o in outcomes), "; ".join(o.detail for o in outcomes)

    def _revert_kernel(self) -> tuple[bool, str]:
        from .kernelpolicy import KernelPolicy

        policy = KernelPolicy(self.config)
        details = []
        asr = policy.disable_asr()
        details.append(asr.detail)
        for image in list(policy.status().get("hardened_processes", {})):
            details.append(policy.unharden_process(image).detail)
        return True, "; ".join(details[:4])

    def _revert_autostart(self) -> tuple[bool, str]:
        import subprocess

        if not IS_WINDOWS:
            return True, "no scheduled task off Windows"
        try:
            done = subprocess.run(["schtasks", "/delete", "/tn", "CandyProtection", "/f"],
                                  capture_output=True, text=True, timeout=30, check=False)
        except Exception as exc:  # noqa: BLE001
            return False, str(exc)
        if done.returncode == 0:
            return True, "boot task removed"
        return True, "no boot task was registered"


def format_plan(steps: list[RevertStep], *, admin: bool | None = None) -> str:
    lines = ["", "WHAT WOULD BE REVERTED", "=" * 78]
    applicable = [step for step in steps if step.applies]
    for step in steps:
        mark = "x" if step.applies else " "
        lines.append(f"  [{mark}] {step.name:22} {step.description}")
        if step.detail:
            lines.append(f"      {step.detail}")
    lines.append("")
    if not applicable:
        lines.append("Nothing to revert — Candy has not changed any system settings.")
    else:
        lines.append(f"{len(applicable)} change set(s) would be undone.")
        if admin is False:
            lines.append("")
            lines.append("NOTE: most of these need administrator rights. Re-run from an")
            lines.append("elevated prompt or the revert will report failures.")
    lines.append("")
    lines.append("Quarantined files and logs are NOT removed — they are evidence.")
    lines.append("Run with --yes to actually revert.")
    return "\n".join(lines)
