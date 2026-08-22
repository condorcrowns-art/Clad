"""Command line interface."""
from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from pathlib import Path

from .config import Config
from .drift import DRIFTABLE_FIELDS
from .levels import ORDER as LEVEL_NAMES
from .engine import VERSION, Engine
from .eventlog import iter_records, verify_chain
from .events import Detection
from .threatdb import ThreatDB, VALID_TARGETS, make_submission
from .util import IS_WINDOWS, app_dir, expand_path
from .winapi import is_admin
from .winevents import sysmon_installed, sysmon_status

BANNER = rf"""
  Candy {VERSION} — Roblox executor & malware tripwire
  kernel-sourced telemetry · no driver of its own · proprietary
"""

SEVERITY_TAGS = {
    "info": "  info  ", "low": "  LOW   ", "medium": " MEDIUM ",
    "high": "  HIGH  ", "critical": "CRITICAL",
}


def _print_detection(detection: Detection) -> None:
    tag = SEVERITY_TAGS.get(detection.severity, detection.severity)
    where = detection.path or detection.remote or detection.subject
    print(f"[{detection.timestamp}] [{tag}] {detection.message}")
    if where and where != detection.message:
        print(f"           -> {where}" + (f" (pid {detection.pid})" if detection.pid else ""))
    for action in detection.actions:
        print(f"           -> action: {action}")


def cmd_run(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    if args.enforce:
        config.set("response.mode", "enforce")
    engine = Engine(config)
    print(BANNER)
    report = engine.start()
    status = engine.status()
    print(f"  mode            : {status['mode']}"
          f"{'  (WILL take action)' if status['mode'] == 'enforce' else '  (detect and log only)'}")
    print(f"  administrator   : {'yes' if status['admin'] else 'no — some checks are limited'}")
    print(f"  monitors        : {', '.join(report['started']) or 'none'}")
    if report["skipped"]:
        print(f"  skipped         : {', '.join(report['skipped'])}")
    for error in report["errors"]:
        print(f"  ERROR           : {error}")
    print(f"  signatures      : {status['threatdb']['signatures']}, "
          f"hashes: {status['threatdb']['hashes']}")
    print(f"  log             : {status['log']}")
    print("\n  Watching. Press Ctrl+C to stop.\n")

    engine.alert_hooks.append(_print_detection)
    stopping = {"flag": False}

    def handle_signal(_sig, _frame):
        stopping["flag"] = True

    signal.signal(signal.SIGINT, handle_signal)
    try:
        while not stopping["flag"]:
            time.sleep(0.5)
    finally:
        print("\n  Stopping…")
        engine.stop()
        final = engine.status()
        print(f"  detections: {final['counters']['detections']} "
              f"({final['counters']['by_severity']})")
    return 0


def cmd_gui(args: argparse.Namespace) -> int:
    try:
        from .gui import main as gui_main
    except ImportError as exc:
        print(f"Could not start the GUI: {exc}", file=sys.stderr)
        print("Tkinter is part of the standard Windows Python installer; on Linux install "
              "python3-tk. Use 'candy run' for the console version.", file=sys.stderr)
        return 2
    return gui_main(args.config)


def cmd_scan(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    engine = Engine(config)
    engine.alert_hooks.append(_print_detection)
    targets = args.paths or None
    print(f"Scanning {'the configured watch paths' if not targets else ', '.join(targets)}…")

    last = [0.0]

    def progress(path: str) -> None:
        now = time.time()
        if now - last[0] > 0.5:
            last[0] = now
            print(f"  … {path[:100]}", end="\r", flush=True)

    result = engine.scan_now(targets, progress=progress if not args.quiet else None)
    print(" " * 110, end="\r")
    print(f"\nScanned {result['processes']} processes and {result['files']} files "
          f"in {result['seconds']}s — {result['new_detections']} new detection(s).")
    return 1 if result["new_detections"] else 0


def cmd_status(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    engine = Engine(config)
    print(json.dumps(engine.status(), indent=2))
    return 0


def cmd_update(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    if args.url:
        config.set("updates.threat_feed_url", args.url)
        config.save()
    engine = Engine(config)
    result = engine.update_threats()
    print(json.dumps(result, indent=2))
    return 0 if result.get("ok") else 1


def cmd_verify_log(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    path = Path(args.path) if args.path else config.log_dir() / "candy.jsonl"
    ok, line, message = verify_chain(path)
    print(f"{'OK  ' if ok else 'FAIL'} {path}")
    print(f"     {message}" + ("" if ok else f" (record #{line})"))
    return 0 if ok else 1


SEVERITY_ORDER = ("info", "low", "medium", "high", "critical")


def cmd_log(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    path = Path(args.path) if args.path else config.log_dir() / "candy.jsonl"
    records = [r for r in iter_records(path)
               if not args.detections_only or r.get("event") == "detection"]

    if getattr(args, "severity", None):
        floor = SEVERITY_ORDER.index(args.severity)
        records = [r for r in records
                   if r.get("severity") in SEVERITY_ORDER
                   and SEVERITY_ORDER.index(r["severity"]) >= floor]
        if not records:
            print(f"Nothing at {args.severity} or above in {path}.")
            return 0

    for record in records[-args.limit:]:
        if args.json:
            print(json.dumps(record))
        else:
            event = record.get("event", "?")
            if event == "detection":
                print(f"[{record.get('ts')}] {record.get('severity', '?').upper():8} "
                      f"{record.get('message', '')}")
            else:
                print(f"[{record.get('ts')}] {event}: "
                      f"{json.dumps({k: v for k, v in record.items() if k not in ('ts', 'event', 'prev')})[:160]}")
    return 0


def cmd_quarantine(args: argparse.Namespace) -> int:
    from .responder import Responder

    config = Config.load(args.config)
    responder = Responder(config)
    if args.action == "list":
        entries = responder.list_quarantine()
        if not entries:
            print("Quarantine is empty.")
            return 0
        for entry in entries:
            print(f"{entry['quarantined_at']}  {entry['sha256'][:16]}…  "
                  f"{entry['original_path']}\n    file: {entry['quarantine_file']}\n"
                  f"    reason: {entry.get('reason', '')}")
        return 0
    if args.action == "add":
        result = responder.quarantine(args.target, forced=True)
    elif args.action == "restore":
        result = responder.restore(args.target, getattr(args, "to", None))
    else:
        result = responder.delete_quarantined(args.target)
    print(result)
    return 0 if result.ok else 1


def cmd_list(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    if args.action == "show":
        print(json.dumps({"whitelist": config.get("whitelist"),
                          "blacklist": config.get("blacklist")}, indent=2))
        return 0
    changed = (config.add_list_entry(args.list, args.field, args.value) if args.action == "add"
               else config.remove_list_entry(args.list, args.field, args.value))
    print(f"{'Updated' if changed else 'No change to'} {args.list}.{args.field}: {args.value}")

    # Trusting something by name or path is trusting a label. Pin the build
    # that is actually there, so a later replacement is visible.
    if changed and args.action == "add" and args.list == "whitelist" \
            and args.field in DRIFTABLE_FIELDS:
        from .drift import TrustLedger
        from .winapi import verify_signature

        ledger = TrustLedger(config, signature_checker=verify_signature)
        target = Path(expand_path(args.value))
        pin = ledger.pin(target, field=args.field, subject=args.value) \
            if target.is_file() else None
        if pin:
            print(f"Pinned to this build: {pin.sha256[:32]}…")
            print("If this file changes, Candy will stop trusting it and say so.")
        elif args.field == "names":
            print(f"Note: '{args.value}' trusts ANY file with that name, anywhere on "
                  f"disk. Trusting the full path instead is safer — Candy can then "
                  f"pin the exact build.")
    return 0


def cmd_selfcheck(args: argparse.Namespace) -> int:
    """Candy's own security posture — it is a privilege-escalation target too."""
    from .selfprotect import SelfProtect, format_report

    config = Config.load(args.config)
    engine = Engine(config)
    guard = SelfProtect(config, engine.log)

    if args.fix:
        print("Locking down Candy's own directories…\n")
        for finding in guard.harden():
            print(f"  [{'OK  ' if finding.ok else 'FAIL'}] {finding.check}: {finding.detail}")
        print()

    report = guard.check()
    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(format_report(report))
    return 0 if report.ok else 1


def cmd_baseline(args: argparse.Namespace) -> int:
    """Snapshot what runs at startup, and diff against it later."""
    from .baseline import BaselineStore, format_diff

    config = Config.load(args.config)
    engine = Engine(config)
    store = BaselineStore(config, engine.log)

    if args.action == "save":
        existing = store.load()
        if existing and not args.force:
            print(f"A baseline already exists, taken {existing.taken} "
                  f"({len(existing.entries)} entries).")
            print("Re-taking it makes everything that has appeared since invisible.")
            print("Run 'candy baseline diff' first, or pass --force.")
            return 1
        snapshot = store.capture(note=args.note or "")
        store.save(snapshot)
        print(f"Baseline saved: {len(snapshot.entries)} autostart entries at "
              f"{snapshot.taken}")
        print(f"  {store.path}")
        print("\nThis only proves what changes from now on. If the machine is already "
              "compromised, the compromise is in the baseline too — run "
              "'candy fullscan' first if you are not sure.")
        return 0

    if args.action == "show":
        snapshot = store.load()
        if snapshot is None:
            print("No baseline saved.")
            return 1
        print(f"Taken {snapshot.taken} — {len(snapshot.entries)} entries")
        for entry in sorted(snapshot.entries.values(), key=lambda e: (e.source, e.name)):
            print(f"  {entry.source:18} {entry.name}")
            print(f"  {'':18} {entry.command[:100]}")
        return 0

    report = store.diff(analyzer=engine.analyzer)
    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(format_diff(report))
    for change in report.changes:
        if change.severity in ("high", "critical"):
            engine.handle_detection(Detection(
                source="baseline", kind=f"autostart_{change.kind}",
                subject=change.entry.name,
                message=f"{change.kind}: {change.entry.name} — {change.reasons[0]}",
                severity=change.severity, path=change.entry.image,
                signature_id="baseline.change", evidence=change.to_dict()))
    return 1 if report.changes else 0


def cmd_clipboard(args: argparse.Namespace) -> int:
    """Clipboard hijack detection — the theft nobody notices."""
    from .clipboard import ClipboardMonitor, classify

    config = Config.load(args.config)
    engine = Engine(config)
    monitor = ClipboardMonitor(config, engine.handle_detection)

    if args.action == "status":
        print(json.dumps(monitor.status(), indent=2))
        return 0
    if args.action in ("on", "off"):
        config.set("clipboard.enabled", args.action == "on")
        config.save()
        print(f"Clipboard monitoring {'enabled' if args.action == 'on' else 'disabled'}. "
              f"Restart protection to apply.")
        return 0
    if args.action == "classify":
        kind = classify(args.value or "")
        print(f"{args.value}: {kind or 'not a payment destination'}")
        return 0
    if args.action == "probe":
        print("Putting a decoy payment address on the clipboard and reading it back…")
        print("Your clipboard contents are restored afterwards.\n")
        finding = monitor.probe()
        if finding is None:
            print("The decoy came back unchanged. Nothing is rewriting the clipboard "
                  "right now.")
            print("\nThis proves nothing about a clipper that only acts on real "
                  "addresses, or one that is not running yet. It is a spot check.")
            return 0
        print(f"[{finding.severity.upper()}] {finding.summary()}")
        for reason in finding.reasons:
            print(f"  {reason}")
        return 1
    return 0


def cmd_selfupdate(args: argparse.Namespace) -> int:
    """Check for, verify and stage a new version of Candy."""
    from .selfupdate import Updater

    config = Config.load(args.config)
    engine = Engine(config)
    updater = Updater(config, VERSION, engine.log)

    if args.action == "status":
        print(json.dumps(updater.status(), indent=2))
        return 0

    result = updater.check()
    print(result)
    for check in result.checks:
        print(f"  {check}")
    if result.status != "available":
        return 0 if result.ok else 1
    if result.info and result.info.notes:
        print(f"\nRelease notes: {result.info.notes}")
    if args.action == "check":
        print("\nRun 'candy selfupdate stage' to download and verify it.")
        return 0

    staged = updater.stage(result.info)
    print(f"\n{staged}")
    for check in staged.checks:
        print(f"  {check}")
    return 0 if staged.ok else 1


def cmd_level(args: argparse.Namespace) -> int:
    """One dial for how hard Candy pushes, with per-area override."""
    from . import levels

    config = Config.load(args.config)

    if not args.level:
        here = levels.current(config)
        print(f"Current level: {here}\n")
        for name in levels.ORDER:
            level = levels.LEVELS[name]
            mark = "→" if name == here else " "
            print(f"{mark} {name:9} {level.headline}")
            print(f"            breaks: {level.breaks}")
            print()
        print("candy level <name>              apply a level")
        print("candy level <name> --only downloads,network   apply only those areas")
        print("candy level <name> --dry-run    show what would change")
        print(f"\nAreas: {', '.join(levels.AREAS)}")
        return 0

    if args.explain:
        print(levels.describe(args.level))
        return 0

    areas = args.only.split(",") if args.only else None
    try:
        result = levels.plan(config, args.level, areas)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    print(levels.format_plan(result, current_level=levels.current(config)))
    if args.dry_run:
        print("\nDry run — nothing was changed.")
        return 0

    levels.apply(config, args.level, areas)
    print("\nSettings saved.")

    if not result.actions:
        return 0
    if not is_admin():
        print("\nNot running as administrator — the system changes above were not "
              "applied. Re-run from an admin prompt to finish.")
        return 1

    print("\nApplying system changes…")
    engine = Engine(config)
    for action in result.actions:
        print(f"  {_apply_level_action(config, engine, action)}")
    return 0


def _apply_level_action(config: Config, engine: Engine, action: str) -> str:
    """Run one system-level action named by a protection level."""
    try:
        if action == "adblock":
            from .adblock import AdBlocker

            return f"adblock: {AdBlocker(config).apply()}"
        if action == "dns":
            return "dns: enabled in settings — starts with protection"
        if action == "netharden":
            from .netharden import NetworkHardener

            results = NetworkHardener(config).apply_all()
            return "netharden: " + "; ".join(str(r) for r in results)
        if action == "asr":
            from .kernelpolicy import KernelPolicy

            return f"asr: {KernelPolicy(config).apply_asr(mode='block')}"
        if action == "harden_roblox":
            from .kernelpolicy import KernelPolicy

            policy = KernelPolicy(config)
            profile = str(config.get("kernel.mitigation_profile", "game"))
            done = [str(policy.harden_process(image, profile))
                    for image in config.get("protection.protected_targets") or
                    ["RobloxPlayerBeta.exe"]]
            return "harden: " + "; ".join(done)
        if action == "credguard":
            from .credguard import CredentialGuard

            return f"credguard: {CredentialGuard(config, engine.log).arm()}"
        if action == "firewall_lockdown":
            from .firewall import FirewallController

            ok, detail = FirewallController(config).lockdown(confirm_seconds=120)
            return f"firewall: {detail}"
    except Exception as exc:  # noqa: BLE001 - one failed action must not abort the rest
        return f"{action}: FAILED — {type(exc).__name__}: {exc}"
    return f"{action}: nothing to do"


def cmd_credguard(args: argparse.Namespace) -> int:
    """Protect and watch the files that hold your sessions and passwords."""
    from .credguard import CredentialGuard, format_status, present_stores

    config = Config.load(args.config)
    engine = Engine(config)
    guard = CredentialGuard(config, engine.log)

    if args.action == "status":
        print(format_status(guard.status()))
        return 0

    if args.action == "stores":
        for store, path in present_stores(config):
            print(f"[{store.severity.upper():8}] {store.label}")
            print(f"           {path}")
            print(f"           owned by: {', '.join(store.owners) or 'nothing in particular'}")
            if store.note:
                print(f"           {store.note}")
        return 0

    if args.action == "arm":
        result = guard.arm(canaries=not args.no_canaries)
        print(result)
        for label in result.armed:
            print(f"  auditing {label}")
        for label in result.skipped:
            print(f"  could not audit {label}")
        if result.ok:
            print("\nWindows will now log every process that opens these files, and "
                  "Candy will tell you when it is not the program that owns them.")
        return 0 if result.ok else 1

    if args.action == "disarm":
        print(guard.disarm())
        return 0

    if args.action == "test":
        finding = guard.assess(object_name=args.path or "", process_image=args.process or "")
        if finding is None:
            print("Not a finding: either not a protected store, or the process that "
                  "owns it.")
            return 0
        print(f"[{finding.severity.upper()}] score {finding.score}")
        for reason in finding.reasons:
            print(f"  {reason}")
        return 1
    return 0


def cmd_trust(args: argparse.Namespace) -> int:
    """Pin, re-check and revoke the builds behind your trust decisions.

    This is the answer to the exit-scam case: the executor or utility that was
    honest when you whitelisted it and ships a stealer three versions later.
    Candy cannot judge the new build's intent, but it will not let the old
    build's trust cover it silently.
    """
    from .drift import TrustLedger, format_report
    from .winapi import verify_signature

    config = Config.load(args.config)
    engine = Engine(config) if args.revoke or args.action == "accept" else None
    ledger = TrustLedger(config, engine.log if engine else None,
                         signature_checker=verify_signature)

    if args.action == "pin":
        count = ledger.pin_whitelist()
        print(f"Pinned {count} build(s) behind your whitelist.")
        unverifiable = ledger.unverifiable()
        if unverifiable:
            print("\nTrusted by name only — these clear ANY file with that name:")
            for name in unverifiable:
                print(f"  {name}")
            print("Re-trust them by full path, or by hash, so they can be pinned.")
        return 0

    if args.action == "accept":
        if not args.file:
            print("'trust accept' needs a file", file=sys.stderr)
            return 2
        build = ledger.accept(args.file)
        if build is None:
            print(f"{args.file} could not be read", file=sys.stderr)
            return 2
        print(f"Recorded this build of {Path(args.file).name}: {build.sha256[:32]}…")
        if build.capabilities:
            print(f"  it can: {', '.join(build.capabilities)}")
        if build.exfil:
            print(f"  drop channels: {', '.join(build.exfil)}")
        print("Future builds of this program will be compared against it.")
        return 0

    if args.action == "history":
        lineage = ledger.lineage()
        if not lineage:
            print("No build history recorded yet.")
            return 0
        for name, builds in sorted(lineage.items()):
            print(f"\n{name} — {len(builds)} build(s)")
            for build in builds:
                signed = {True: "signed", False: "unsigned", None: "unknown"}[build.signed]
                print(f"  {build.sha256[:16]}…  [{signed:8}] first seen {build.first_seen}")
                if build.capabilities:
                    print(f"                     can: {', '.join(build.capabilities)}")
                if build.exfil:
                    print(f"                     drops to: {', '.join(build.exfil)}")
        return 0

    if args.action == "list":
        pins = ledger.load()
        print(f"{len(pins)} pinned build(s):")
        for pin in pins.values():
            signed = {True: "signed", False: "unsigned", None: "unknown"}[pin.signed]
            print(f"  {pin.sha256[:16]}…  [{signed:8}] {pin.path}")
            print(f"                     trusted as {pin.field} = {pin.subject}"
                  f"  ({pin.pinned_at})")
        return 0

    report = ledger.check(revoke=args.revoke)
    print(format_report(report, unverifiable=ledger.unverifiable()))
    if report.findings and not args.revoke:
        print("\nTo stop trusting everything that changed:  candy trust check --revoke")
    return 1 if report.findings else 0


def cmd_submit(args: argparse.Namespace) -> int:
    payload = make_submission(
        name=args.name, target=args.target, pattern=args.pattern,
        severity=args.severity, description=args.description or "", sha256=args.sha256,
    )
    text = json.dumps(payload, indent=2)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"Wrote {args.out}")
    else:
        print(text)
    print("\nTo contribute this: open a pull request (or an issue) on the threat-feed "
          "repository adding the entry above to threats.json.\n"
          "To use it locally right now, merge it into your own data/threats.json.")
    return 0


def cmd_site(args: argparse.Namespace) -> int:
    """Block, unblock or list sinkholed domains."""
    from .responder import Responder

    config = Config.load(args.config)
    responder = Responder(config)
    if args.action == "list":
        blocked = responder.blocked_domains()
        if not blocked:
            print("No domains are blocked by Candy.")
            return 0
        print(f"{len(blocked)} domain(s) blocked in the hosts file:")
        for domain in blocked:
            print(f"  {domain}")
        return 0
    if not args.domain:
        print(f"'site {args.action}' needs a domain", file=sys.stderr)
        return 2
    result = (responder.block_domain(args.domain, forced=True) if args.action == "block"
              else responder.unblock_domain(args.domain))
    print(result)
    if args.action == "block" and result.ok:
        print("\nNote: a browser using DNS-over-HTTPS ignores the hosts file. The firewall "
              "rules added alongside it are what hold in that case.")
    return 0 if result.ok else 1


def cmd_scan_url(args: argparse.Namespace) -> int:
    """Check a URL or domain against the local database and, if enabled, VirusTotal."""
    config = Config.load(args.config)
    engine = Engine(config)
    from .netblock import normalize_domain

    domain = normalize_domain(args.url)
    if domain is None:
        print(f"Could not read a domain out of {args.url!r}", file=sys.stderr)
        return 2

    print(f"Domain    : {domain}")
    local = engine.analyzer.analyze_domain(domain, source="scan")
    if local:
        for detection in local:
            _print_detection(detection)
    else:
        print("Local     : no match in the threat database or your blacklist")

    verdicts = []
    if engine.intel.enabled:
        for label, verdict in (("URL", engine.intel.check_url(args.url)),
                               ("domain", engine.intel.check_domain(domain))):
            if verdict is None:
                print(f"VirusTotal: no {label} result (no key, rate limited, or offline)")
                continue
            verdicts.append(verdict)
            print(f"VirusTotal: {label} — {verdict.get('summary')}"
                  f"{'  ** MALICIOUS **' if verdict.get('malicious') else ''}")
    else:
        print("VirusTotal: disabled. Set intel.enable_lookups and intel.virustotal_api_key "
              "in config.json to use it (free key, no card).")

    dangerous = bool(local) or any(v.get("malicious") for v in verdicts)
    if dangerous and args.block:
        from .responder import Responder

        print(Responder(config).block_domain(domain, forced=True))
    elif dangerous:
        print(f"\nTo block it:  candy site block {domain}")
    return 1 if dangerous else 0


def cmd_key(args: argparse.Namespace) -> int:
    """Generate or inspect the post-quantum signing key."""
    from .pqsign import LMS_TYPES, LmsPrivateKey

    config = Config.load(args.config)
    key_path = Path(args.path) if args.path else config.data_dir() / "signing-key.json"

    if args.action == "generate":
        if key_path.exists() and not args.force:
            print(f"{key_path} already exists. Pass --force to replace it — but note that "
                  f"every feed signed with the old key stops verifying.", file=sys.stderr)
            return 1
        lms_type = {5: 0x00000005, 10: 0x00000006, 15: 0x00000007}[args.height]
        print(f"Generating an LMS key with 2^{args.height} = {2 ** args.height} one-time "
              f"signatures. This builds the whole Merkle tree and is slow — "
              f"{'a few seconds' if args.height <= 5 else 'up to a minute or two'}…")
        key = LmsPrivateKey.generate(lms_type)
        public = key.public_key().to_hex()
        key.save(key_path)
        print(f"\nPrivate key : {key_path}   ** SECRET — never copy this to two machines **")
        print(f"Public key  : {public}")
        print(f"Signatures  : {key.remaining} remaining\n")
        print("Put the public key in every client's config.json:")
        print('  "updates": { "trusted_public_key": "' + public[:32] + '…", '
              '"require_signature": true }')
        return 0

    if not key_path.exists():
        print(f"No signing key at {key_path}. Run: candy key generate", file=sys.stderr)
        return 1
    key = LmsPrivateKey.load(key_path)
    print(json.dumps({
        "path": str(key_path),
        "algorithm": "LMS_SHA256_M32 / LMOTS_SHA256_N32_W8 (RFC 8554, CNSA 2.0 approved)",
        "tree_height": key.height,
        "capacity": 1 << key.height,
        "used": key.q,
        "remaining": key.remaining,
        "public_key": key.public_key().to_hex(),
    }, indent=2))
    return 0


def cmd_sign(args: argparse.Namespace) -> int:
    """Sign a JSON file (a threat feed) with the post-quantum key."""
    from .pqsign import LmsPrivateKey, sign_document

    config = Config.load(args.config)
    key_path = Path(args.key) if args.key else config.data_dir() / "signing-key.json"
    if not key_path.exists():
        print(f"No signing key at {key_path}. Run: candy key generate", file=sys.stderr)
        return 1

    try:
        payload = json.loads(Path(args.file).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read {args.file}: {exc}", file=sys.stderr)
        return 1
    if isinstance(payload, dict) and "signature" in payload and "payload" in payload:
        payload = payload["payload"]      # re-signing an already signed file

    key = LmsPrivateKey.load(key_path)
    if key.remaining <= 0:
        print("This key is exhausted — every one-time signature has been used. "
              "Generate a new key and redistribute its public key.", file=sys.stderr)
        return 1

    document = sign_document(key, payload)
    key.save()
    out = Path(args.out) if args.out else Path(args.file).with_suffix(".signed.json")
    out.write_text(json.dumps(document, indent=2), encoding="utf-8")
    print(f"Signed {args.file} -> {out}")
    print(f"Public key : {key.public_key().to_hex()}")
    print(f"Remaining  : {key.remaining} signature(s) on this key")
    return 0


def cmd_verify_file(args: argparse.Namespace) -> int:
    """Verify a signed file against the pinned public key."""
    from .pqsign import verify_document

    config = Config.load(args.config)
    trusted = args.public_key or str(config.get("updates.trusted_public_key", ""))
    try:
        document = json.loads(Path(args.file).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not read {args.file}: {exc}", file=sys.stderr)
        return 1
    ok, detail = verify_document(document, trusted)
    print(f"{'OK  ' if ok else 'FAIL'} {args.file}")
    print(f"     {detail}")
    return 0 if ok else 1


def cmd_firewall(args: argparse.Namespace) -> int:
    """Drive Windows Firewall into (and out of) default-deny outbound."""
    from .firewall import FirewallController

    config = Config.load(args.config)
    controller = FirewallController(config)

    if args.action == "status":
        status = controller.status()
        print(json.dumps(status.to_dict(), indent=2))
        allowed = controller.load_allowlist()
        print(f"\nAllowlist: {len(allowed)} program(s)")
        for entry in allowed.values():
            signed = {True: "signed", False: "UNSIGNED", None: "unknown"}[entry.signed]
            print(f"  {entry.path}  [{signed}, pinned to {(entry.sha256 or '?')[:16]}…]")
        return 0

    if args.action == "learn":
        print(f"Watching outbound connections for {args.seconds:.0f}s. "
              f"Use the machine normally — open your browser, launch Roblox…\n")
        programs = controller.learn(args.seconds, progress=lambda exe: print(f"  seen: {exe}"))
        print(f"\n{len(programs)} program(s) made outbound connections.")
        if args.apply:
            for program in programs:
                ok, detail = controller.allow_program(program)
                print(f"  {'OK  ' if ok else 'FAIL'} {detail}")
        else:
            print("\nRe-run with --apply to add these to the allowlist.")
        return 0

    if args.action == "allow":
        ok, detail = controller.allow_program(args.program)
        print(f"{'OK' if ok else 'FAILED'}: {detail}")
        return 0 if ok else 1

    if args.action == "revoke":
        ok, detail = controller.revoke_program(args.program)
        print(f"{'OK' if ok else 'FAILED'}: {detail}")
        return 0 if ok else 1

    if args.action == "verify":
        findings = controller.verify_allowlist()
        if not findings:
            print("Every allowed binary still matches the hash it was allowed with.")
            return 0
        for finding in findings:
            print(f"REVOKED {finding['path']}: {finding['problem']}")
        return 1

    if args.action == "lockdown":
        print("This blocks ALL outbound traffic except your allowlist.\n"
              f"It reverts automatically in {args.confirm_seconds}s unless you run "
              f"'candy firewall confirm'.\n")
        ok, detail = controller.lockdown(confirm_seconds=args.confirm_seconds)
        print(f"{'OK' if ok else 'FAILED'}: {detail}")
        return 0 if ok else 1

    if args.action == "confirm":
        ok, detail = controller.confirm()
        print(f"{'OK' if ok else 'FAILED'}: {detail}")
        return 0 if ok else 1

    if args.action == "unlock":
        ok, detail = controller.unlock()
        print(f"{'OK' if ok else 'FAILED'}: {detail}")
        return 0 if ok else 1

    if args.action == "reset":
        removed, failed = controller.remove_all_rules()
        controller.unlock()
        print(f"Removed {removed} Candy firewall rule(s), {failed} failed. "
              f"Outbound is allow-by-default again.")
        return 0
    return 0


def cmd_triage(args: argparse.Namespace) -> int:
    """Static triage: read what a payload can do without running it."""
    from .triage import format_report, triage
    from .winapi import verify_signature

    report = triage(args.file, signature_checker=verify_signature)
    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(format_report(report))
    return 1 if report.verdict in ("malicious", "suspicious") else 0


def cmd_prevent(args: argparse.Namespace) -> int:
    """Execution blocking and network containment."""
    from .prevent import ExecutionBlocker, NetworkContainer

    config = Config.load(args.config)
    blocker = ExecutionBlocker(config)
    container = NetworkContainer(config)

    if args.action == "list":
        blocked = blocker.blocked_images()
        contained = container.contained()
        print(f"Execution-blocked images ({len(blocked)}):")
        for name in blocked:
            print(f"  {name}")
        print(f"\nNetwork-contained programs ({len(contained)}):")
        for name in contained:
            print(f"  {name}")
        return 0
    if not args.target:
        print(f"'prevent {args.action}' needs a target", file=sys.stderr)
        return 2

    result = {
        "block": lambda: blocker.block(args.target, reason=args.reason or "manual"),
        "unblock": lambda: blocker.unblock(args.target),
        "contain": lambda: container.contain(args.target, reason=args.reason or "manual"),
        "release": lambda: container.release(args.target),
    }[args.action]()
    print(result)
    if args.action == "block" and result.ok:
        print("\nNote: this blocks by image NAME, so any file called that is stopped — "
              "and renaming the file escapes it. Quarantine the file as well.")
    return 0 if result.ok else 1


def cmd_integrity(args: argparse.Namespace) -> int:
    """Measured application start and platform trust reporting."""
    from .integrity import IntegrityMonitor, platform_trust
    from .util import app_dir

    config = Config.load(args.config)
    monitor = IntegrityMonitor(config, app_dir())

    if args.action == "seal":
        result = monitor.seal()
        print(f"Sealed {result['files']} file(s) into {result['path']}")
        print(f"Signed with the post-quantum key: {'yes' if result['signed'] else 'no key found'}")
        return 0
    if args.action == "platform":
        print(json.dumps(platform_trust(), indent=2))
        return 0

    result = monitor.verify()
    print(f"Status    : {result['status']}")
    if "signature" in result:
        print(f"Baseline  : {result['signature']}")
    for finding in result.get("findings", []):
        print(f"  {finding['problem'].upper()}: {finding['file']}"
              + (f" (expected {finding['expected']}…, found {finding['found']}…)"
                 if "expected" in finding else ""))
    if result.get("status") == "no baseline":
        print(f"  {result['detail']}")
    return 0 if result.get("status") == "intact" else 1


def cmd_adblock(args: argparse.Namespace) -> int:
    """Ad, tracker and malvertising blocking."""
    from .adblock import SEED_LISTS, AdBlocker

    config = Config.load(args.config)
    blocker = AdBlocker(config)

    if args.action == "status":
        print(json.dumps(blocker.status(), indent=2))
        print("\nAvailable categories:")
        for name, domains in SEED_LISTS.items():
            active = name in config.get("adblock.categories", [])
            print(f"  [{'x' if active else ' '}] {name:14} {len(domains)} seed domain(s)")
        return 0
    if args.action == "on":
        config.set("adblock.enabled", True)
        if args.categories:
            config.set("adblock.categories", args.categories.split(","))
        config.save()
        result = blocker.apply()
        print(result)
        print(f"{result.total} domain(s) blocked. Import a public list for full coverage:\n"
              f"  candy adblock import https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts")
        return 0 if result.ok else 1
    if args.action == "off":
        config.set("adblock.enabled", False)
        config.save()
        print(blocker.clear())
        return 0
    if args.action == "import":
        if not args.source:
            print("'adblock import' needs a URL or file path", file=sys.stderr)
            return 2
        result = blocker.import_list(args.source)
        print(result)
        return 0 if result.ok else 1
    if args.action == "allow":
        if not args.source:
            print("'adblock allow' needs a domain", file=sys.stderr)
            return 2
        print(blocker.allow(args.source))
        return 0
    if args.action == "list":
        blocked = blocker.blocked()
        print(f"{len(blocked)} domain(s) blocked:")
        for domain in blocked[:200]:
            print(f"  {domain}")
        if len(blocked) > 200:
            print(f"  … and {len(blocked) - 200} more")
        return 0
    return 0


def cmd_check_url(args: argparse.Namespace) -> int:
    """Phishing analysis of a link, with no feed and no network needed."""
    from .phishing import analyze_url

    verdict = analyze_url(args.url)
    print(f"Host      : {verdict.host}")
    print(f"Verdict   : {verdict.verdict.upper()} (score {verdict.score})")
    if verdict.impersonates:
        print(f"Impersonat: {verdict.impersonates}")
    if verdict.findings:
        print("\nWhy:")
        for finding in verdict.findings:
            print(f"  +{finding['points']:<3} {finding['detail']}")
    else:
        print("\nNothing unusual about the shape of this link.")
    if verdict.score >= int(Config.load(args.config).get("phishing.block_score", 70)) and args.block:
        from .responder import Responder

        print()
        print(Responder(Config.load(args.config)).block_domain(verdict.host, forced=True))
    return 1 if verdict.verdict in ("phishing", "suspicious") else 0


def cmd_guard(args: argparse.Namespace) -> int:
    """Assess a downloaded file the way the guard would."""
    from .engine import Engine

    config = Config.load(args.config)
    if args.policy:
        config.set("download_guard.policy", args.policy)
    engine = Engine(config)

    verdict = engine.guard.assess(args.file)
    print(f"File      : {verdict.path}")
    print(f"Origin    : {verdict.origin.zone_name}"
          + (f"  from {verdict.origin.source}" if verdict.origin.source else ""))
    print(f"SHA-256   : {verdict.sha256}")
    print(f"Score     : {verdict.score}   Severity: {verdict.severity}")
    for clearance in verdict.clearances:
        print(f"  CLEAR   {clearance}")
    for reason in verdict.reasons:
        print(f"  FLAG    {reason}")
    if verdict.archive:
        print(f"Archive   : {verdict.archive.entries} entries, "
              f"{len(verdict.archive.executables)} executable(s)"
              + (", ENCRYPTED" if verdict.archive.encrypted else ""))
    print(f"\nDECISION  : {verdict.action.upper()}  (policy: {engine.guard.policy})")
    if args.apply and verdict.action == "quarantine":
        print(engine.responder.quarantine(verdict.path, forced=True,
                                          detection=engine.guard.to_detection(verdict)))
    return 1 if verdict.action != "allow" else 0


def cmd_panic(args: argparse.Namespace) -> int:
    """Break glass: lock the machine down as hard as Candy can from user mode."""
    from .adblock import AdBlocker
    from .firewall import FirewallController

    config = Config.load(args.config)
    print("BREAK GLASS — maximum lockdown\n")

    steps: list[tuple[str, str]] = []

    config.set("response.mode", "enforce")
    for switch in ("auto_kill", "auto_quarantine", "auto_firewall", "auto_block_domains"):
        config.set(f"response.{switch}", True)
    config.set("download_guard.policy", "fortress")
    config.save()
    steps.append(("enforcement", "every automatic action enabled, download guard set to fortress"))

    controller = FirewallController(config)
    ok, detail = controller.lockdown(confirm_seconds=args.confirm_seconds)
    steps.append(("firewall", detail))

    if args.adblock:
        config.set("adblock.enabled", True)
        config.save()
        steps.append(("adblock", str(AdBlocker(config).apply())))

    for name, detail in steps:
        print(f"  {name:12}: {detail}")
    print(f"\nRun 'candy firewall confirm' within {args.confirm_seconds}s to keep the "
          f"lockdown, or 'candy firewall unlock' to undo it now.")
    return 0 if ok else 1


def cmd_kernel(args: argparse.Namespace) -> int:
    """Policy that Windows' own kernel enforces."""
    from .kernelpolicy import ASR_RULES, MITIGATION_PROFILES, KernelPolicy

    config = Config.load(args.config)
    policy = KernelPolicy(config)

    if args.action == "status":
        print(json.dumps(policy.status(), indent=2))
        return 0
    if args.action == "profiles":
        for name, spec in MITIGATION_PROFILES.items():
            print(f"{name:10} risk={spec['risk']:6} {spec['description']}")
            print(f"           {', '.join(spec['enable'])}\n")
        return 0
    if args.action == "asr":
        result = policy.apply_asr(mode=args.mode, aggressive=args.aggressive)
        print(result)
        for rule in result.applied:
            print(f"  ON   {ASR_RULES[rule][0]}")
        for rule in result.failed:
            print(f"  --   {ASR_RULES[rule][0]} (not accepted by this Defender build)")
        return 0 if result.ok else 1
    if args.action == "asr-off":
        print(policy.disable_asr())
        return 0
    if args.action == "harden":
        if not args.target:
            print("'kernel harden' needs an image name", file=sys.stderr)
            return 2
        result = policy.harden_process(args.target, args.profile)
        print(result)
        if args.profile in ("game", "paranoid") and result.ok:
            print("\nIf the game misbehaves, undo with: "
                  f"candy kernel unharden {args.target}")
        return 0 if result.ok else 1
    if args.action == "unharden":
        if not args.target:
            print("'kernel unharden' needs an image name", file=sys.stderr)
            return 2
        print(policy.unharden_process(args.target))
        return 0
    if args.action == "wdac":
        out = Path(args.out or (config.data_dir() / "wdac-policy.xml"))
        result = policy.generate_wdac_policy([], out, audit=not args.enforce)
        print(result)
        return 0 if result.ok else 1
    return 0


def cmd_netharden(args: argparse.Namespace) -> int:
    """Layered network hardening."""
    from .netharden import RESOLVERS, NetworkHardener

    config = Config.load(args.config)
    hardener = NetworkHardener(config)

    if args.action == "status":
        print(json.dumps(hardener.status(), indent=2))
        return 0
    if args.action == "resolvers":
        for key, value in RESOLVERS.items():
            print(f"{key:22} {value['name']}")
            print(f"{'':22} {', '.join(value['v4'])}   DoH: {value['doh']}")
        return 0
    if args.action == "apply":
        for result in hardener.apply_all(resolver=args.resolver):
            print(result)
            for item in result.changed:
                print(f"    + {item}")
            for item in result.skipped:
                print(f"    ! {item}")
        return 0
    if args.action == "revert":
        for result in hardener.revert_all():
            print(result)
        return 0
    if args.action == "dns":
        print(hardener.set_resolver(args.resolver))
        return 0
    if args.action == "browser":
        print(hardener.apply_browser_policy(resolver=args.resolver))
        return 0
    if args.action == "protocols":
        result = hardener.harden_protocols()
        print(result)
        for item in result.changed:
            print(f"    + {item}")
        return 0
    return 0


def cmd_autostart(args: argparse.Namespace) -> int:
    """Run Candy at boot as SYSTEM, so admin is needed once rather than always."""
    import subprocess as sp

    from .util import app_dir

    task = "CandyProtection"
    if args.action == "status":
        done = sp.run(["schtasks", "/query", "/tn", task, "/fo", "list"],
                      capture_output=True, text=True, check=False)
        print(done.stdout.strip() or "Candy is not registered to start at boot.")
        return 0
    if args.action == "remove":
        done = sp.run(["schtasks", "/delete", "/tn", task, "/f"],
                      capture_output=True, text=True, check=False)
        print("Removed." if done.returncode == 0 else done.stderr.strip())
        return 0

    if not IS_WINDOWS:
        print("Boot autostart is Windows-only.", file=sys.stderr)
        return 2
    if not is_admin():
        print("Run this from an administrator prompt.", file=sys.stderr)
        return 2

    frozen = getattr(sys, "frozen", False)
    command = (f'"{sys.executable}" run' if frozen
               else f'"{sys.executable}" "{app_dir() / "run.py"}" run')
    done = sp.run(["schtasks", "/create", "/tn", task, "/tr", command,
                   "/sc", "onstart", "/ru", "SYSTEM", "/rl", "HIGHEST", "/f"],
                  capture_output=True, text=True, check=False)
    if done.returncode != 0:
        print(done.stderr.strip() or "schtasks refused the task", file=sys.stderr)
        return 1
    print(f"Candy will start at boot as SYSTEM.\n  command: {command}\n"
          f"Remove with: candy autostart remove")
    print("\nRunning as SYSTEM means a standard user cannot stop it, and admin is "
          "only needed for this one command rather than every launch.")
    return 0


def cmd_coverage(args: argparse.Namespace) -> int:
    """Show the technique coverage matrix, and prove it with a self-test."""
    from . import coverage as cov

    if args.matrix:
        if args.json:
            print(cov.matrix_json())
            return 0
        current = ""
        for technique in cov.TECHNIQUES:
            if technique.category != current:
                current = technique.category
                print(f"\n=== {current.upper()} " + "=" * (60 - len(current)))
            needs = f" [needs {technique.requires}]" if technique.requires else ""
            print(f"  {technique.coverage.upper():8} {technique.id:28} {technique.name}{needs}")
            print(f"           {technique.mechanism}")
            if technique.note:
                print(f"           note: {technique.note}")
        stats = cov.summary()
        print(f"\n{stats['total']} techniques: "
              + ", ".join(f"{count} {level}" for level, count in sorted(stats['by_coverage'].items())))
        return 0

    config = Config.load(args.config)
    engine = Engine(config)
    outcomes = cov.run_selftest(engine, live=args.live,
                                progress=(lambda line: print(f"  {line}")) if args.verbose else None)
    print(cov.format_report(outcomes))
    missed = [o for o in outcomes if not o.detected]
    return 1 if missed else 0


def cmd_dns(args: argparse.Namespace) -> int:
    """The local DNS filtering resolver."""
    from .adblock import AdBlocker
    from .dnsproxy import DnsFilter, DnsProxy

    config = Config.load(args.config)

    if args.action == "test":
        engine = Engine(config)
        dns_filter = DnsFilter(config, engine.db, engine.analyzer)
        dns_filter.load(AdBlocker(config).seed_domains())
        verdict = dns_filter.decide(args.domain or "example.com")
        print(f"{args.domain}: {'BLOCKED' if verdict.blocked else 'allowed'}"
              + (f" — {verdict.reason}" if verdict.reason else ""))
        return 1 if verdict.blocked else 0

    if args.action == "status":
        engine = Engine(config)
        print(json.dumps(engine.dns_proxy.status(), indent=2))
        return 0

    if args.action in ("on", "off"):
        config.set("dns.enabled", args.action == "on")
        config.save()
        print(f"DNS filtering resolver {'enabled' if args.action == 'on' else 'disabled'}. "
              f"Restart protection to apply.")
        if args.action == "on":
            print("It binds port 53 and points the system at itself, so run Candy as "
                  "administrator. Stopping Candy restores your previous DNS settings.")
        return 0

    if args.action == "run":
        engine = Engine(config)
        dns_filter = DnsFilter(config, engine.db, engine.analyzer)
        count = dns_filter.load(AdBlocker(config).seed_domains()
                                + [str(d) for d in config.get("blacklist.domains", [])])
        proxy = DnsProxy(config, dns_filter, _print_detection)
        ok, detail = proxy.start(args.listen, args.port)
        print(detail)
        if not ok:
            return 1
        print(f"{count} domains blocked, upstream {proxy._upstream_servers()}. Ctrl+C to stop.\n")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        finally:
            proxy.stop()
            print(f"\n{json.dumps(proxy.status(), indent=2)}")
        return 0
    return 0


def cmd_fullscan(args: argparse.Namespace) -> int:
    """Scan the machine for malware that is already on it."""
    from .fullscan import PROFILES, FullScanner, format_report
    from .winapi import verify_signature

    config = Config.load(args.config)
    engine = Engine(config)

    if args.profiles:
        for name, spec in PROFILES.items():
            print(f"{name:8} {spec['description']}")
            print(f"         extensions: {len(spec['extensions'])}, depth {spec['max_depth']}, "
                  f"modules={spec['modules']}, streams={spec['streams']}")
        return 0

    scanner = FullScanner(config, engine.analyzer, signature_checker=verify_signature)
    last = [0.0]

    def progress(message: str) -> None:
        if args.quiet:
            return
        now = time.time()
        if message.startswith("  ") and now - last[0] < 0.4:
            return
        last[0] = now
        print(f"  {message}"[:110], flush=True)

    print(f"Scanning ({args.profile} profile)"
          + (f", time budget {args.minutes:.0f} min" if args.minutes else "") + "…\n")
    report = scanner.scan(args.profile, roots=args.paths or None, progress=progress,
                          time_budget=args.minutes * 60 if args.minutes else None)

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(format_report(report))

    if args.out:
        Path(args.out).write_text(json.dumps(report.to_dict(), indent=2), encoding="utf-8")
        print(f"\nFull report written to {args.out}")

    engine.log.write({"event": "fullscan", **{k: v for k, v in report.to_dict().items()
                                              if k != "findings"},
                      "findings": len(report.findings)})

    if args.act and report.findings:
        threshold = int(config.get("response.action_threshold", 75))
        print(f"\nApplying the configured response to findings scoring >= {threshold}…")
        for finding in report.findings:
            if finding.score < threshold or finding.kind == "file" and not Path(finding.subject).is_file():
                continue
            if finding.kind.startswith("process") and finding.pid:
                print(f"  {engine.responder.kill(finding.pid, forced=True)}")
            elif finding.kind == "file":
                print(f"  {engine.responder.quarantine(finding.subject, forced=True)}")

    return 1 if report.findings else 0


def cmd_extensions(args: argparse.Namespace) -> int:
    """Audit installed browser extensions."""
    from .browserscan import format_report, scan_all

    verdicts = scan_all()
    if args.json:
        print(json.dumps([v.to_dict() for v in verdicts], indent=2))
    else:
        print(format_report(verdicts, show_all=args.all))
    return 1 if any(v.score >= 65 for v in verdicts) else 0


def cmd_explain(args: argparse.Namespace) -> int:
    """Everything Candy can say about one file, and why.

    Written for triaging a scan finding: it shows the reasoning rather than a
    verdict, so a false positive is recognisable as one.
    """
    from . import pe
    from .guard import read_origin
    from .triage import format_report as format_triage, triage
    from .util import sha256_file
    from .winapi import verify_signature

    path = Path(args.file)
    if not path.is_file():
        print(f"{path} is not a file", file=sys.stderr)
        return 2

    config = Config.load(args.config)
    engine = Engine(config)

    print("=" * 78)
    print(f"EXPLAIN: {path}")
    print("=" * 78)

    stat = path.stat()
    digest = sha256_file(path, max_bytes=None)
    print(f"Size      : {stat.st_size:,} bytes")
    print(f"Modified  : {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(stat.st_mtime))}")
    print(f"SHA-256   : {digest}")

    signed = verify_signature(str(path))
    print(f"Signature : " + {True: "valid and trusted", False: "UNSIGNED or untrusted",
                             None: "could not be checked (non-Windows, or unreadable)"}[signed])

    origin = read_origin(path)
    if origin.zone_id is not None:
        print(f"Origin    : {origin.zone_name}"
              + (f" — {origin.source}" if origin.source else ""))
        if origin.source:
            from .phishing import analyze_url

            site = analyze_url(origin.source)
            print(f"            source page scores {site.score} ({site.verdict})")
    else:
        print("Origin    : no Mark-of-the-Web (not downloaded, or the tag was stripped)")

    print("\n--- threat database ---")
    detections = engine.analyzer.analyze_file(str(path), sha256=digest, event="explain")
    if detections:
        for detection in detections:
            print(f"  [{detection.severity.upper():8}] {detection.message}")
            if detection.signature_id:
                print(f"             rule: {detection.signature_id}")
    else:
        print("  no signature, hash or name match")

    print("\n--- PE structure ---")
    info = pe.inspect(path)
    if info.is_pe:
        print(f"  type            : {'DLL' if info.is_dll else 'executable'}, "
              f"machine 0x{info.machine:04x}")
        print(f"  declared name   : {info.original_filename or '(none)'}")
        print(f"  company         : {info.company or '(none)'}")
        print(f"  product         : {info.product or '(none)'}")
        print(f"  code entropy    : {info.max_code_entropy:.2f}/8.00"
              f"{'  ← packed or encrypted' if info.looks_packed else ''}")
        print(f"  sections        : {', '.join(s.name for s in info.sections)}")
        renamed = info.renamed_from(path.name)
        if renamed:
            print(f"  RENAMED         : this file calls itself '{renamed}'")
    else:
        print(f"  not a PE file ({info.error})")

    print("\n--- static triage ---")
    print(format_triage(triage(path, signature_checker=verify_signature)))

    print("\n--- download guard verdict ---")
    verdict = engine.guard.assess(path)
    print(f"  policy    : {engine.guard.policy}")
    print(f"  score     : {verdict.score}  ({verdict.severity})")
    for clearance in verdict.clearances:
        print(f"  CLEAR     {clearance}")
    for reason in verdict.reasons:
        print(f"  FLAG      {reason}")
    print(f"  DECISION  : {verdict.action.upper()}")

    print("\n" + "=" * 78)
    if verdict.action == "allow" and not detections:
        print("Nothing here looks wrong. If a scan flagged this file, the finding was")
        print("probably location-based (an executable somewhere unusual) rather than")
        print("about the file itself.")
    else:
        print("To act:  candy quarantine add \"" + str(path) + "\"")
        print("To trust: candy list add whitelist hashes " + (digest or ""))
    return 0


def cmd_revert(args: argparse.Namespace) -> int:
    """Undo every system change Candy has made."""
    from .uninstall import Reverter, format_plan

    config = Config.load(args.config)
    engine = Engine(config) if args.yes else None
    reverter = Reverter(config, engine.log if engine else None)

    if not args.yes:
        print(format_plan(reverter.plan(), admin=is_admin()))
        return 0

    print("Reverting every system change Candy has made…\n")
    result = reverter.revert_all(progress=lambda message: print(f"  {message}"))
    print()
    for name, ok, detail in result.steps:
        print(f"  [{'OK  ' if ok else 'FAIL'}] {name:22} {detail[:90]}")
    print()
    print("Quarantined files and logs were left alone — they are evidence.")
    print("Delete the Candy folder to finish removing it." if result.ok else
          "Some steps failed; re-run from an administrator prompt.")
    return 0 if result.ok else 1


def cmd_selftest(args: argparse.Namespace) -> int:
    """Prove the pipeline works end to end without touching a real threat."""
    config = Config.load(args.config)
    engine = Engine(config)
    print(BANNER)
    print("Running self-test (no files are modified, no processes are killed)…\n")

    checks: list[tuple[str, bool, str]] = []
    checks.append(("threat database loaded", bool(engine.db.signatures),
                   f"{len(engine.db.signatures)} signatures"))

    fake = {"pid": 999999, "name": "krnl.exe", "exe": r"C:\Users\test\Downloads\krnl.exe",
            "cmdline": r"C:\Users\test\Downloads\krnl.exe", "parent_name": "explorer.exe"}
    hits = engine.analyzer.analyze_process(fake)
    checks.append(("known executor name is detected", bool(hits),
                   hits[0].message if hits else "no detection"))

    tamper = {"pid": 999998, "name": "powershell.exe",
              "exe": r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe",
              "cmdline": "powershell -Command Set-MpPreference -DisableRealtimeMonitoring $true"}
    # The image path is whitelisted, so temporarily test the raw signature match.
    tamper_hits = engine.db.match("cmdline", tamper["cmdline"])
    checks.append(("Defender-tampering command is detected", bool(tamper_hits),
                   tamper_hits[0].name if tamper_hits else "no detection"))

    benign = {"pid": 999997, "name": "notepad.exe", "exe": r"C:\Windows\System32\notepad.exe",
              "cmdline": "notepad.exe"}
    benign_hits = engine.analyzer.analyze_process(benign)
    checks.append(("benign system process is NOT flagged", not benign_hits,
                   "clean" if not benign_hits else benign_hits[0].message))

    engine.log.write({"event": "selftest", "note": "self-test record"})
    ok, count, message = verify_chain(engine.log.path)
    checks.append(("forensic log chain verifies", ok, message))

    checks.append(("running on Windows", IS_WINDOWS,
                   "yes" if IS_WINDOWS else "no — process/file monitoring will be limited"))

    width = max(len(name) for name, _, _ in checks)
    failures = 0
    for name, ok, detail in checks:
        failures += 0 if ok else 1
        print(f"  [{'PASS' if ok else 'WARN'}] {name.ljust(width)}  {detail}")
    print(f"\n{len(checks) - failures}/{len(checks)} checks passed.")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    """One command that collects everything needed to diagnose an install.

    Written to be pasted into a bug report: it starts every monitor for a few
    seconds, records what actually came up, and stops again.
    """
    import platform
    import sys as _sys

    config = Config.load(args.config)
    engine = Engine(config)
    lines: list[str] = []

    def section(title: str) -> None:
        lines.append("")
        lines.append(f"--- {title} " + "-" * max(0, 60 - len(title)))

    lines.append(f"Candy {VERSION} doctor report")
    section("system")
    lines.append(f"platform      : {platform.platform()}")
    lines.append(f"python        : {platform.python_version()} ({_sys.executable})")
    lines.append(f"frozen build  : {getattr(_sys, 'frozen', False)}")
    lines.append(f"administrator : {is_admin()}")

    section("dependencies")
    for module, why in (("psutil", "required for process/network monitoring"),
                        ("watchdog", "real-time file events (optional)"),
                        ("wmi", "instant process-start notifications (optional)"),
                        ("win32api", "required by wmi (optional)"),
                        ("tkinter", "graphical interface")):
        try:
            imported = __import__(module)
            version = getattr(imported, "__version__", "present")
            lines.append(f"{module:<12}: {version}")
        except Exception as exc:  # noqa: BLE001
            lines.append(f"{module:<12}: MISSING ({exc.__class__.__name__}) — {why}")

    section("kernel telemetry")
    # Asked once — it shells out twice — and reported with the reason, because
    # "NOT installed" is the wrong answer when the truth is "installed, but the
    # channel needs administrator".
    sysmon = sysmon_status()
    lines.append(f"sysmon        : {'installed' if sysmon['installed'] else 'NOT readable'}")
    lines.append(f"                {sysmon['detail']}")
    if sysmon.get("service"):
        lines.append(f"                service: {sysmon['service']}"
                     + (" (running)" if sysmon.get("running") else " (NOT running)"))
    if not sysmon["installed"] and IS_WINDOWS and not sysmon.get("service"):
        lines.append("                get it free from Microsoft Sysinternals — it is "
                     "the difference between seeing injection and guessing")

    section("blocking")
    from .netblock import HostsBlocker, hosts_path_for_platform
    from .responder import Responder

    hosts = HostsBlocker(hosts_path_for_platform(config.get("web.hosts_file") or None))
    writable, reason = hosts.available()
    lines.append(f"hosts file    : {hosts.path} ({reason})")
    lines.append(f"blocked sites : {hosts.blocked() or 'none'}")

    # Ad blocking keeps its own marked section of the hosts file, so the line
    # above never counted it. Turning on 73 domains and then reading
    # "blocked sites : none" is the report contradicting what just happened.
    from .adblock import AdBlocker

    ad_status = AdBlocker(config).status()
    lines.append(f"ad blocking   : {'ON' if ad_status.get('enabled') else 'off'} — "
                 f"{ad_status.get('blocked_domains', 0)} domain(s), categories: "
                 f"{', '.join(ad_status.get('categories', [])) or 'none'}")

    lines.append(f"firewall      : {'available' if IS_WINDOWS else 'Windows only'}"
                 f"{'' if is_admin() else ' — needs administrator to add rules'}")

    # Credential-store auditing had no line here at all, which is a large part
    # of how it went eight versions doing nothing while reporting success.
    section("credential stores")
    from .credguard import CredentialGuard, format_status

    lines.append(format_status(CredentialGuard(config).status()))

    section("platform trust")
    from .integrity import platform_trust

    trust = platform_trust()
    lines.append(f"secure boot   : {trust['secure_boot']}")
    lines.append(f"tpm           : {trust['tpm'].get('present')} {trust['tpm'].get('version', '')}")
    lines.append(f"vbs / hvci    : {trust['virtualisation_based_security']}")
    for note in trust["advice"]:
        lines.append(f"                {note}")

    section("configuration")
    lines.append(f"config file   : {config.path}")
    lines.append(f"mode          : {config.get('response.mode')}  "
                 f"threshold {config.get('response.action_threshold')}")
    lines.append(f"watch paths   : {[str(p) for p in config.watch_paths()] or 'none found'}")
    lines.append(f"threat db     : {engine.db.stats()}")

    section("starting monitors")
    report = engine.start()
    for key, values in report.items():
        for value in values:
            lines.append(f"{key:<12}: {value}")
    print(f"  (letting the monitors run for {args.seconds:.0f}s — a first pass over "
          f"every process and autostart entry is not instant)", flush=True)
    time.sleep(float(args.seconds))
    status = engine.status()
    section(f"live status after {args.seconds:.0f}s")
    lines.append(json.dumps(status, indent=2))
    engine.stop()

    section("recent detections")
    recent = engine.recent(10)
    lines.extend(f"  {d.summary()}" for d in recent) if recent else lines.append("  none")

    # Candy's own posture belongs in the diagnostic, not in a command nobody
    # runs: a writable control directory on a machine where Candy starts as
    # SYSTEM matters more than anything else in this report.
    section("candy's own security")
    from .selfprotect import SelfProtect, format_report as format_self

    lines.append(format_self(SelfProtect(config).check()))

    text = "\n".join(lines)
    print(text)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"\nWritten to {args.out} — paste that file when asking for help.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="candy",
        description="Candy — a user-mode tripwire that detects Roblox executors and "
                    "other injection tooling, and tells you the moment it sees one.",
    )
    parser.add_argument("--config", help="path to config.json (default: ./config/config.json)")
    parser.add_argument("--version", action="version", version=f"Candy {VERSION}")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="start monitoring in the console")
    run.add_argument("--enforce", action="store_true",
                     help="override response.mode and act on detections this run")
    run.set_defaults(func=cmd_run)

    gui = sub.add_parser("gui", help="start the graphical interface")
    gui.set_defaults(func=cmd_gui)

    scan = sub.add_parser("scan", help="run a one-off scan and exit")
    scan.add_argument("paths", nargs="*", help="files or folders to scan (default: watch paths)")
    scan.add_argument("--quiet", action="store_true", help="do not print per-file progress")
    scan.set_defaults(func=cmd_scan)

    status = sub.add_parser("status", help="print configuration and component status as JSON")
    status.set_defaults(func=cmd_status)

    update = sub.add_parser("update", help="update the threat database from the configured feed")
    update.add_argument("--url", help="feed URL to use (and save to the config)")
    update.set_defaults(func=cmd_update)

    verify = sub.add_parser("verify-log", help="check the forensic log's hash chain")
    verify.add_argument("path", nargs="?", help="log file (default: logs/candy.jsonl)")
    verify.set_defaults(func=cmd_verify_log)

    log = sub.add_parser("log", help="show recent log records")
    log.add_argument("path", nargs="?")
    log.add_argument("--limit", type=int, default=40)
    log.add_argument("--json", action="store_true")
    log.add_argument("--detections-only", action="store_true")
    log.add_argument("--severity", choices=list(SEVERITY_ORDER),
                     help="show only records at this severity or above — the usual "
                          "reason for opening a log at all")
    log.set_defaults(func=cmd_log)

    quarantine = sub.add_parser("quarantine", help="manage quarantined files")
    quarantine.add_argument("--to", dest="to", help="restore to this path instead")
    quarantine.add_argument("action", choices=["list", "add", "restore", "delete"])
    quarantine.add_argument("target", nargs="?", help="file path (for add/restore/delete)")
    quarantine.set_defaults(func=cmd_quarantine)

    lists = sub.add_parser("list", help="manage the whitelist and blacklist")
    lists.add_argument("action", choices=["show", "add", "remove"])
    lists.add_argument("list", nargs="?", choices=["whitelist", "blacklist"])
    lists.add_argument("field", nargs="?", choices=["names", "paths", "hashes", "ips", "patterns"])
    lists.add_argument("value", nargs="?")
    lists.set_defaults(func=cmd_list)

    selfcheck = sub.add_parser("selfcheck",
                               help="check (and fix) the permissions on Candy's own files")
    selfcheck.add_argument("--fix", action="store_true",
                           help="lock the directories to SYSTEM and Administrators")
    selfcheck.add_argument("--json", action="store_true")
    selfcheck.set_defaults(func=cmd_selfcheck)

    baseline = sub.add_parser("baseline",
                              help="snapshot what runs at startup, and see what changes")
    baseline.add_argument("action", choices=["save", "diff", "show"])
    baseline.add_argument("--note", help="why this baseline was taken")
    baseline.add_argument("--force", action="store_true",
                          help="overwrite an existing baseline")
    baseline.add_argument("--json", action="store_true")
    baseline.set_defaults(func=cmd_baseline)

    clipboard = sub.add_parser("clipboard", help="clipboard hijack (clipper) detection")
    clipboard.add_argument("action", choices=["status", "on", "off", "probe", "classify"])
    clipboard.add_argument("value", nargs="?", help="text to classify")
    clipboard.set_defaults(func=cmd_clipboard)

    selfupdate = sub.add_parser("selfupdate", help="check for a new version of Candy")
    selfupdate.add_argument("action", choices=["check", "stage", "status"])
    selfupdate.set_defaults(func=cmd_selfupdate)

    level = sub.add_parser("level", help="how hard Candy pushes: one dial, four positions")
    level.add_argument("level", nargs="?", choices=list(LEVEL_NAMES),
                       help="omit to list the levels and show the current one")
    level.add_argument("--only", help="apply only these areas, comma separated")
    level.add_argument("--dry-run", action="store_true", help="show changes, apply nothing")
    level.add_argument("--explain", action="store_true", help="describe the level in full")
    level.set_defaults(func=cmd_level)

    credguard = sub.add_parser("credguard",
                               help="audit the files that hold your Roblox and browser sessions")
    credguard.add_argument("action", choices=["status", "arm", "disarm", "stores", "test"])
    credguard.add_argument("--path", help="object path, for 'test'")
    credguard.add_argument("--process", help="accessing process image, for 'test'")
    credguard.add_argument("--no-canaries", action="store_true",
                           help="do not plant decoy credential files")
    credguard.set_defaults(func=cmd_credguard)

    trust = sub.add_parser("trust",
                           help="pin and re-check the builds behind your trust decisions")
    trust.add_argument("action", choices=["pin", "check", "list", "accept", "history"])
    trust.add_argument("file", nargs="?", help="file to accept as a known-good build")
    trust.add_argument("--revoke", action="store_true",
                       help="stop trusting anything whose binary changed")
    trust.set_defaults(func=cmd_trust)

    submit = sub.add_parser("submit", help="build a threat-database submission for a new executor")
    submit.add_argument("--name", required=True, help='product name, e.g. "Nova Executor"')
    submit.add_argument("--target", required=True, choices=sorted(VALID_TARGETS))
    submit.add_argument("--pattern", required=True,
                        help="literal substring, or 're:<regex>' for a regular expression")
    submit.add_argument("--severity", default="high",
                        choices=["info", "low", "medium", "high", "critical"])
    submit.add_argument("--description", help="what it is and how you confirmed it")
    submit.add_argument("--sha256", help="verified SHA-256 of a real sample, if you have one")
    submit.add_argument("--out", help="write the JSON to this file")
    submit.set_defaults(func=cmd_submit)

    selftest = sub.add_parser("selftest", help="verify the detection pipeline works")
    selftest.set_defaults(func=cmd_selftest)

    site = sub.add_parser("site", help="block or unblock a website (hosts file + firewall)")
    site.add_argument("action", choices=["block", "unblock", "list"])
    site.add_argument("domain", nargs="?", help="domain or URL")
    site.set_defaults(func=cmd_site)

    scan_url = sub.add_parser("scan-url", help="check a URL or domain for known threats")
    scan_url.add_argument("url", help="URL or domain to check")
    scan_url.add_argument("--block", action="store_true",
                          help="block it immediately if the verdict is malicious")
    scan_url.set_defaults(func=cmd_scan_url)

    key = sub.add_parser("key", help="manage the post-quantum (LMS) signing key")
    key.add_argument("action", choices=["generate", "show"])
    key.add_argument("--height", type=int, default=10, choices=[5, 10, 15],
                     help="tree height: 2^h signatures (default 10 = 1024)")
    key.add_argument("--path", help="key file (default: data/signing-key.json)")
    key.add_argument("--force", action="store_true", help="overwrite an existing key")
    key.set_defaults(func=cmd_key)

    sign = sub.add_parser("sign", help="post-quantum sign a threat feed or JSON file")
    sign.add_argument("file")
    sign.add_argument("--key", help="signing key file")
    sign.add_argument("--out", help="output file (default: <file>.signed.json)")
    sign.set_defaults(func=cmd_sign)

    verify_file = sub.add_parser("verify-file", help="verify a post-quantum signed file")
    verify_file.add_argument("file")
    verify_file.add_argument("--public-key", help="override the pinned key from config.json")
    verify_file.set_defaults(func=cmd_verify_file)

    firewall = sub.add_parser("firewall", help="default-deny outbound firewall control")
    firewall.add_argument("action", choices=["status", "learn", "allow", "revoke", "verify",
                                             "lockdown", "confirm", "unlock", "reset"])
    firewall.add_argument("program", nargs="?", help="program path for allow/revoke")
    firewall.add_argument("--seconds", type=float, default=120.0, help="learning duration")
    firewall.add_argument("--apply", action="store_true", help="apply what learning found")
    firewall.add_argument("--confirm-seconds", type=int, default=120,
                          help="how long before an unconfirmed lockdown reverts itself")
    firewall.set_defaults(func=cmd_firewall)

    triage_cmd = sub.add_parser("triage", help="static analysis of a file without running it")
    triage_cmd.add_argument("file")
    triage_cmd.add_argument("--json", action="store_true")
    triage_cmd.set_defaults(func=cmd_triage)

    prevent = sub.add_parser("prevent", help="block execution or cut a program off the network")
    prevent.add_argument("action", choices=["block", "unblock", "contain", "release", "list"])
    prevent.add_argument("target", nargs="?", help="image name (block) or program path (contain)")
    prevent.add_argument("--reason", help="why, for the ledger")
    prevent.set_defaults(func=cmd_prevent)

    integrity = sub.add_parser("integrity", help="Candy's own integrity and platform trust state")
    integrity.add_argument("action", choices=["seal", "verify", "platform"])
    integrity.set_defaults(func=cmd_integrity)

    adblock = sub.add_parser("adblock", help="ad, tracker and malvertising blocking")
    adblock.add_argument("action", choices=["status", "on", "off", "import", "allow", "list"])
    adblock.add_argument("source", nargs="?", help="list URL/path (import) or domain (allow)")
    adblock.add_argument("--categories", help="comma-separated category list")
    adblock.set_defaults(func=cmd_adblock)

    check_url = sub.add_parser("check-url", help="phishing analysis of a link (no feed needed)")
    check_url.add_argument("url")
    check_url.add_argument("--block", action="store_true", help="block it if it looks like phishing")
    check_url.set_defaults(func=cmd_check_url)

    guard = sub.add_parser("guard", help="assess a downloaded file the way the guard would")
    guard.add_argument("file")
    guard.add_argument("--policy", choices=["off", "balanced", "fortress"])
    guard.add_argument("--apply", action="store_true", help="quarantine it if the verdict says so")
    guard.set_defaults(func=cmd_guard)

    panic = sub.add_parser("panic", help="break glass — maximum lockdown in one command")
    panic.add_argument("--confirm-seconds", type=int, default=180)
    panic.add_argument("--adblock", action="store_true", help="also enable ad/tracker blocking")
    panic.set_defaults(func=cmd_panic)

    kernel = sub.add_parser("kernel", help="policy enforced by Windows' own kernel")
    kernel.add_argument("action", choices=["status", "asr", "asr-off", "harden",
                                           "unharden", "profiles", "wdac"])
    kernel.add_argument("target", nargs="?", help="image name for harden/unharden")
    kernel.add_argument("--profile", default="game",
                        choices=["self", "game", "paranoid", "audit"])
    kernel.add_argument("--mode", default="block", choices=["block", "audit", "off"])
    kernel.add_argument("--aggressive", action="store_true",
                        help="include rules that block unknown/new executables outright")
    kernel.add_argument("--enforce", action="store_true", help="WDAC: enforced, not audit")
    kernel.add_argument("--out", help="WDAC policy output path")
    kernel.set_defaults(func=cmd_kernel)

    netharden = sub.add_parser("netharden", help="layered network hardening")
    netharden.add_argument("action", choices=["status", "apply", "revert", "dns",
                                              "browser", "protocols", "resolvers"])
    netharden.add_argument("--resolver", default="quad9",
                           choices=["quad9", "cloudflare-security", "cloudflare-family", "adguard"])
    netharden.set_defaults(func=cmd_netharden)

    autostart = sub.add_parser("autostart", help="start Candy at boot as SYSTEM")
    autostart.add_argument("action", choices=["install", "remove", "status"])
    autostart.set_defaults(func=cmd_autostart)

    coverage_cmd = sub.add_parser("coverage",
                                  help="technique coverage matrix and self-test")
    coverage_cmd.add_argument("--matrix", action="store_true", help="print the matrix, run nothing")
    coverage_cmd.add_argument("--live", action="store_true",
                              help="also create and remove real benign autostart entries")
    coverage_cmd.add_argument("--json", action="store_true")
    coverage_cmd.add_argument("--verbose", action="store_true")
    coverage_cmd.set_defaults(func=cmd_coverage)

    dns = sub.add_parser("dns", help="local DNS filtering resolver")
    dns.add_argument("action", choices=["on", "off", "status", "run", "test"])
    dns.add_argument("domain", nargs="?", help="domain to test")
    dns.add_argument("--listen", default="127.0.0.1")
    dns.add_argument("--port", type=int, default=53)
    dns.set_defaults(func=cmd_dns)

    fullscan = sub.add_parser("fullscan",
                              help="scan the machine for malware that is already on it")
    fullscan.add_argument("paths", nargs="*", help="override the profile's scan roots")
    fullscan.add_argument("--profile", default="quick", choices=["quick", "full", "deep"])
    fullscan.add_argument("--minutes", type=float, default=0,
                          help="time budget; the scan stops cleanly and says it was truncated")
    fullscan.add_argument("--json", action="store_true")
    fullscan.add_argument("--out", help="write the full JSON report to this file")
    fullscan.add_argument("--act", action="store_true",
                          help="quarantine/kill findings at or above the action threshold")
    fullscan.add_argument("--quiet", action="store_true")
    fullscan.add_argument("--profiles", action="store_true", help="list the profiles and exit")
    fullscan.set_defaults(func=cmd_fullscan)

    extensions = sub.add_parser("extensions", help="audit installed browser extensions")
    extensions.add_argument("--all", action="store_true", help="include low-risk extensions")
    extensions.add_argument("--json", action="store_true")
    extensions.set_defaults(func=cmd_extensions)

    explain = sub.add_parser("explain", help="everything Candy can say about one file, and why")
    explain.add_argument("file")
    explain.set_defaults(func=cmd_explain)

    revert = sub.add_parser("revert", help="undo every system change Candy has made")
    revert.add_argument("--yes", action="store_true",
                        help="actually revert (without this it is a dry run)")
    revert.set_defaults(func=cmd_revert)

    doctor = sub.add_parser("doctor", help="collect a full diagnostic report for troubleshooting")
    doctor.add_argument("--seconds", type=float, default=20.0,
                        help="how long to let the monitors run before reporting (default 20). "
                             "A first full pass over processes and autostart entries takes "
                             "longer than it sounds, and a short window reports zeros that "
                             "look like breakage")
    doctor.add_argument("--out", help="also write the report to this file")
    doctor.set_defaults(func=cmd_doctor)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "list" and args.action in ("add", "remove") and not all(
            [args.list, args.field, args.value]):
        parser.error("add/remove need: <whitelist|blacklist> <field> <value>")
    if args.command == "quarantine" and args.action != "list" and not args.target:
        parser.error(f"'quarantine {args.action}' needs a target path")
    if args.command == "firewall" and args.action in ("allow", "revoke") and not args.program:
        parser.error(f"'firewall {args.action}' needs a program path")
    try:
        return int(args.func(args) or 0)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
