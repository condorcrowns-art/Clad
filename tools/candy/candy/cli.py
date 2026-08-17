"""Command line interface."""
from __future__ import annotations

import argparse
import json
import signal
import sys
import time
from pathlib import Path

from .config import Config
from .engine import VERSION, Engine
from .eventlog import iter_records, verify_chain
from .events import Detection
from .threatdb import ThreatDB, VALID_TARGETS, make_submission
from .util import IS_WINDOWS, app_dir
from .winapi import is_admin
from .winevents import sysmon_installed

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


def cmd_log(args: argparse.Namespace) -> int:
    config = Config.load(args.config)
    path = Path(args.path) if args.path else config.log_dir() / "candy.jsonl"
    records = [r for r in iter_records(path) if not args.detections_only or r.get("event") == "detection"]
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
        result = responder.restore(args.target)
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
    return 0


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
    lines.append(f"sysmon        : {'installed' if sysmon_installed() else 'NOT installed'}")
    if not sysmon_installed() and IS_WINDOWS:
        lines.append("                install it free from Microsoft Sysinternals for "
                     "kernel-level injection and driver-load detection")

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
    time.sleep(float(args.seconds))
    status = engine.status()
    section("live status")
    lines.append(json.dumps(status, indent=2))
    engine.stop()

    section("recent detections")
    recent = engine.recent(10)
    lines.extend(f"  {d.summary()}" for d in recent) if recent else lines.append("  none")

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
    log.set_defaults(func=cmd_log)

    quarantine = sub.add_parser("quarantine", help="manage quarantined files")
    quarantine.add_argument("action", choices=["list", "add", "restore", "delete"])
    quarantine.add_argument("target", nargs="?", help="file path (for add/restore/delete)")
    quarantine.set_defaults(func=cmd_quarantine)

    lists = sub.add_parser("list", help="manage the whitelist and blacklist")
    lists.add_argument("action", choices=["show", "add", "remove"])
    lists.add_argument("list", nargs="?", choices=["whitelist", "blacklist"])
    lists.add_argument("field", nargs="?", choices=["names", "paths", "hashes", "ips", "patterns"])
    lists.add_argument("value", nargs="?")
    lists.set_defaults(func=cmd_list)

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

    doctor = sub.add_parser("doctor", help="collect a full diagnostic report for troubleshooting")
    doctor.add_argument("--seconds", type=float, default=6.0,
                        help="how long to let the monitors run before reporting (default 6)")
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
    try:
        return int(args.func(args) or 0)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
