"""Tkinter GUI — status, live threats, log viewer, list management.

Tkinter ships with the official Windows Python installer and with PyInstaller
builds, so the GUI adds no dependency. The engine runs on background threads;
this module only ever reads from a queue on the Tk main thread, because Tk is
not thread-safe.
"""
from __future__ import annotations

import json
import queue
import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .config import Config
from .engine import VERSION, Engine
from .eventlog import iter_records, verify_chain
from .events import Detection
from .util import truncate

SEVERITY_COLORS = {
    "info": "#7a8290",
    "low": "#3b82f6",
    "medium": "#d97706",
    "high": "#dc2626",
    "critical": "#7f1d1d",
}


class App(ttk.Frame):
    def __init__(self, master: tk.Tk, config_path: str | None = None) -> None:
        super().__init__(master, padding=8)
        self.master = master
        self.pack(fill="both", expand=True)

        self.config_obj = Config.load(config_path)
        self.engine = Engine(self.config_obj)
        self.queue = self.engine.bus.subscribe_queue()
        self.detections: list[Detection] = []
        self.scan_findings: list = []
        self.scan_report = None
        self.scan_thread: threading.Thread | None = None
        self.scan_cancel_event: threading.Event | None = None
        self.extension_verdicts: list = []

        master.title(f"Candy {VERSION} — Roblox executor tripwire")
        master.geometry("1020x660")
        master.minsize(860, 560)
        master.protocol("WM_DELETE_WINDOW", self.on_close)

        self._build_header()
        self._build_tabs()
        self._build_statusbar()

        self.refresh_ms = int(self.config_obj.get("ui.refresh_ms", 800))
        self.after(300, self._pump)
        self.after(1000, self._refresh_status)
        self.after(1200, self.refresh_protection)

    # ---------------------------------------------------------------- build
    def _build_header(self) -> None:
        header = ttk.Frame(self)
        header.pack(fill="x", pady=(0, 8))

        self.status_dot = tk.Canvas(header, width=16, height=16, highlightthickness=0)
        self.status_dot.pack(side="left", padx=(0, 8))
        self._dot = self.status_dot.create_oval(2, 2, 14, 14, fill="#9aa0a6", outline="")

        self.status_label = ttk.Label(header, text="Protection stopped", font=("Segoe UI", 11, "bold"))
        self.status_label.pack(side="left")

        self.toggle_button = ttk.Button(header, text="Start protection", command=self.toggle)
        self.toggle_button.pack(side="right")
        ttk.Button(header, text="Scan now", command=self.scan_now).pack(side="right", padx=6)
        ttk.Button(header, text="Update threats", command=self.update_threats).pack(side="right")

    def _build_tabs(self) -> None:
        self.tabs = ttk.Notebook(self)
        self.tabs.pack(fill="both", expand=True)
        self._build_threats_tab()
        self._build_scan_tab()
        self._build_protection_tab()
        self._build_extensions_tab()
        self._build_tools_tab()
        self._tools_index = self.tabs.index("end") - 1
        self._build_status_tab()
        self._build_log_tab()
        self._build_lists_tab()
        self._build_quarantine_tab()
        self._build_settings_tab()

    def _build_threats_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(frame, text="Threats")

        table = ttk.Frame(frame)
        table.pack(side="top", fill="both", expand=True)
        columns = ("time", "severity", "source", "what", "where")
        self.tree = ttk.Treeview(table, columns=columns, show="headings", height=16)
        widths = {"time": 150, "severity": 80, "source": 80, "what": 380, "where": 300}
        for column in columns:
            self.tree.heading(column, text=column.title())
            self.tree.column(column, width=widths[column], anchor="w")
        scroll = ttk.Scrollbar(table, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.tree.pack(side="left", fill="both", expand=True)
        for severity, color in SEVERITY_COLORS.items():
            self.tree.tag_configure(severity, foreground=color)
        self.tree.bind("<<TreeviewSelect>>", self._on_select)

        detail_frame = ttk.LabelFrame(frame, text="Detail", padding=6)
        detail_frame.pack(fill="x", pady=(8, 4))
        self.detail = tk.Text(detail_frame, height=6, wrap="word")
        self.detail.pack(fill="both", expand=True)
        self.detail.configure(state="disabled")

        actions = ttk.Frame(frame)
        actions.pack(fill="x")
        ttk.Button(actions, text="Kill process", command=self.action_kill).pack(side="left")
        ttk.Button(actions, text="Quarantine file", command=self.action_quarantine).pack(side="left", padx=6)
        ttk.Button(actions, text="Block site / IP", command=self.action_block_ip).pack(side="left")
        ttk.Button(actions, text="Trust this (whitelist)", command=self.action_whitelist).pack(side="left", padx=6)
        ttk.Button(actions, text="Clear list", command=self.clear_threats).pack(side="right")

    def _build_status_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(frame, text="Status")
        self.status_text = tk.Text(frame, wrap="none", font=("Consolas", 9))
        self.status_text.pack(fill="both", expand=True)
        self.status_text.configure(state="disabled")

    def _build_log_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(frame, text="Log")
        bar = ttk.Frame(frame)
        bar.pack(fill="x", pady=(0, 6))
        ttk.Button(bar, text="Reload", command=self.reload_log).pack(side="left")
        ttk.Button(bar, text="Verify integrity", command=self.verify_log).pack(side="left", padx=6)
        ttk.Button(bar, text="Open log folder", command=self.open_log_folder).pack(side="left")
        self.log_only_detections = tk.BooleanVar(value=True)
        ttk.Checkbutton(bar, text="detections only", variable=self.log_only_detections,
                        command=self.reload_log).pack(side="left", padx=10)
        self.log_text = tk.Text(frame, wrap="none", font=("Consolas", 9))
        self.log_text.pack(fill="both", expand=True)

    def _build_lists_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(frame, text="Whitelist / Blacklist")

        controls = ttk.Frame(frame)
        controls.pack(fill="x", pady=(0, 6))
        self.list_kind = tk.StringVar(value="whitelist")
        self.list_field = tk.StringVar(value="names")
        ttk.Combobox(controls, textvariable=self.list_kind, values=["whitelist", "blacklist"],
                     width=12, state="readonly").pack(side="left")
        ttk.Combobox(controls, textvariable=self.list_field,
                     values=["names", "paths", "hashes", "ips", "patterns"],
                     width=12, state="readonly").pack(side="left", padx=6)
        self.list_value = tk.StringVar()
        ttk.Entry(controls, textvariable=self.list_value, width=60).pack(side="left", padx=6)
        ttk.Button(controls, text="Add", command=self.list_add).pack(side="left")
        ttk.Button(controls, text="Remove selected", command=self.list_remove).pack(side="left", padx=6)
        ttk.Button(controls, text="Browse…", command=self.list_browse).pack(side="left")

        self.list_tree = ttk.Treeview(frame, columns=("list", "field", "value"),
                                      show="headings", height=18)
        for column, width in (("list", 100), ("field", 100), ("value", 700)):
            self.list_tree.heading(column, text=column.title())
            self.list_tree.column(column, width=width, anchor="w")
        self.list_tree.pack(fill="both", expand=True)
        self.reload_lists()

    def _build_quarantine_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(frame, text="Quarantine")
        bar = ttk.Frame(frame)
        bar.pack(fill="x", pady=(0, 6))
        ttk.Button(bar, text="Reload", command=self.reload_quarantine).pack(side="left")
        ttk.Button(bar, text="Restore selected", command=self.quarantine_restore).pack(side="left", padx=6)
        ttk.Button(bar, text="Delete permanently", command=self.quarantine_delete).pack(side="left")
        self.quarantine_tree = ttk.Treeview(
            frame, columns=("when", "original", "sha256", "reason"), show="headings", height=18)
        for column, width in (("when", 160), ("original", 340), ("sha256", 160), ("reason", 320)):
            self.quarantine_tree.heading(column, text=column.title())
            self.quarantine_tree.column(column, width=width, anchor="w")
        self.quarantine_tree.pack(fill="both", expand=True)
        self.reload_quarantine()

    def _build_settings_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=10)
        self.tabs.add(frame, text="Settings")

        mode_box = ttk.LabelFrame(frame, text="Response policy", padding=8)
        mode_box.pack(fill="x")
        self.mode_var = tk.StringVar(value=self.config_obj.get("response.mode", "observe"))
        for value, label in (("observe", "Observe — detect and log only (recommended to start)"),
                             ("enforce", "Enforce — automatically act on high-scoring detections")):
            ttk.Radiobutton(mode_box, text=label, value=value, variable=self.mode_var,
                            command=self.save_settings).pack(anchor="w")

        auto_box = ttk.LabelFrame(frame, text="Automatic actions (only apply in Enforce mode)", padding=8)
        auto_box.pack(fill="x", pady=8)
        self.auto_kill = tk.BooleanVar(value=bool(self.config_obj.get("response.auto_kill")))
        self.auto_quarantine = tk.BooleanVar(value=bool(self.config_obj.get("response.auto_quarantine")))
        self.auto_firewall = tk.BooleanVar(value=bool(self.config_obj.get("response.auto_firewall")))
        self.auto_block_domains = tk.BooleanVar(
            value=bool(self.config_obj.get("response.auto_block_domains")))
        ttk.Checkbutton(auto_box, text="Terminate the process", variable=self.auto_kill,
                        command=self.save_settings).pack(anchor="w")
        ttk.Checkbutton(auto_box, text="Quarantine the file", variable=self.auto_quarantine,
                        command=self.save_settings).pack(anchor="w")
        ttk.Checkbutton(auto_box, text="Block the IP in Windows Firewall (needs administrator)",
                        variable=self.auto_firewall, command=self.save_settings).pack(anchor="w")
        ttk.Checkbutton(auto_box, text="Block the website in the hosts file (needs administrator)",
                        variable=self.auto_block_domains, command=self.save_settings).pack(anchor="w")

        threshold_row = ttk.Frame(auto_box)
        threshold_row.pack(anchor="w", pady=(6, 0))
        ttk.Label(threshold_row, text="Act at score ≥").pack(side="left")
        self.threshold = tk.IntVar(value=int(self.config_obj.get("response.action_threshold", 100)))
        ttk.Spinbox(threshold_row, from_=20, to=500, increment=5, width=6,
                    textvariable=self.threshold, command=self.save_settings).pack(side="left", padx=6)
        ttk.Label(threshold_row, text="(critical = 100, high = 75, medium = 45)").pack(side="left")

        monitors = ttk.LabelFrame(frame, text="Monitors (restart protection to apply)", padding=8)
        monitors.pack(fill="x")
        self.monitor_vars: dict[str, tk.BooleanVar] = {}
        for key, label in (("process_monitor", "Process monitor"),
                           ("file_watcher", "File system watcher"),
                           ("network_monitor", "Network connection monitor"),
                           ("behavior_engine", "Behavioural analysis (injected module audit)"),
                           ("kernel_events", "Kernel telemetry (Sysmon / Defender event channels)"),
                           ("persistence_auditor", "Startup & persistence auditing"),
                           ("self_protection", "Self-protection (anti-debug, anti-tamper)")):
            var = tk.BooleanVar(value=bool(self.config_obj.get(f"protection.{key}", True)))
            self.monitor_vars[key] = var
            ttk.Checkbutton(monitors, text=label, variable=var,
                            command=self.save_settings).pack(anchor="w")

        scan_box = ttk.LabelFrame(frame, text="Scheduled scanning", padding=8)
        scan_box.pack(fill="x", pady=8)
        self.scan_schedule = tk.BooleanVar(value=bool(self.config_obj.get("scan.on_schedule")))
        ttk.Checkbutton(scan_box, text="Scan on a schedule", variable=self.scan_schedule,
                        command=self.save_settings).pack(side="left")
        self.scan_interval = tk.IntVar(value=int(self.config_obj.get("scan.interval_minutes", 120)))
        ttk.Spinbox(scan_box, from_=5, to=1440, increment=5, width=6, textvariable=self.scan_interval,
                    command=self.save_settings).pack(side="left", padx=6)
        ttk.Label(scan_box, text="minutes").pack(side="left")

        footer = ttk.Frame(frame)
        footer.pack(fill="x", pady=(10, 0))
        ttk.Button(footer, text="Open config file", command=self.open_config).pack(side="left")
        ttk.Label(footer, text="Candy reads kernel-sourced telemetry from Sysmon and Defender "
                               "but ships no driver of its own. See the README for what it "
                               "cannot do.",
                  wraplength=700, foreground="#666").pack(side="left", padx=10)

    # ------------------------------------------------------------- scan tab
    def _build_scan_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(frame, text="Scan")

        controls = ttk.Frame(frame)
        controls.pack(fill="x", pady=(0, 6))
        ttk.Label(controls, text="Profile").pack(side="left")
        self.scan_profile = tk.StringVar(value="quick")
        ttk.Combobox(controls, textvariable=self.scan_profile, width=8, state="readonly",
                     values=["quick", "full", "deep"]).pack(side="left", padx=6)
        ttk.Label(controls, text="Time budget").pack(side="left")
        self.scan_minutes = tk.IntVar(value=10)
        ttk.Spinbox(controls, from_=0, to=720, increment=5, width=5,
                    textvariable=self.scan_minutes).pack(side="left", padx=4)
        ttk.Label(controls, text="minutes (0 = no limit)").pack(side="left")
        self.scan_button = ttk.Button(controls, text="Start scan", command=self.fullscan_start)
        self.scan_button.pack(side="right")
        self.scan_cancel_button = ttk.Button(controls, text="Cancel", state="disabled",
                                             command=self.fullscan_cancel)
        self.scan_cancel_button.pack(side="right", padx=6)

        progress_row = ttk.Frame(frame)
        progress_row.pack(fill="x", pady=(0, 6))
        self.scan_bar = ttk.Progressbar(progress_row, mode="indeterminate", length=180)
        self.scan_bar.pack(side="left")
        self.scan_progress = ttk.Label(progress_row, text="Idle. A quick scan takes a minute "
                                                          "or two; deep reads every fixed drive.")
        self.scan_progress.pack(side="left", padx=10)

        table = ttk.Frame(frame)
        table.pack(side="top", fill="both", expand=True)
        columns = ("severity", "score", "kind", "subject", "why")
        self.scan_tree = ttk.Treeview(table, columns=columns, show="headings", height=15)
        for column, width in (("severity", 80), ("score", 60), ("kind", 110),
                              ("subject", 430), ("why", 340)):
            self.scan_tree.heading(column, text=column.title())
            self.scan_tree.column(column, width=width, anchor="w")
        scroll = ttk.Scrollbar(table, orient="vertical", command=self.scan_tree.yview)
        self.scan_tree.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.scan_tree.pack(side="left", fill="both", expand=True)
        for severity, color in SEVERITY_COLORS.items():
            self.scan_tree.tag_configure(severity, foreground=color)
        self.scan_tree.bind("<<TreeviewSelect>>", self._on_scan_select)

        detail_frame = ttk.LabelFrame(frame, text="Why this was flagged", padding=6)
        detail_frame.pack(fill="x", pady=(8, 4))
        self.scan_detail = tk.Text(detail_frame, height=6, wrap="word", font=("Consolas", 9))
        self.scan_detail.pack(fill="both", expand=True)
        self.scan_detail.configure(state="disabled")

        actions = ttk.Frame(frame)
        actions.pack(fill="x")
        ttk.Button(actions, text="Explain this file", command=self.scan_explain).pack(side="left")
        ttk.Button(actions, text="Quarantine", command=self.scan_quarantine).pack(side="left", padx=6)
        ttk.Button(actions, text="Kill process", command=self.scan_kill).pack(side="left")
        ttk.Button(actions, text="Trust (whitelist)", command=self.scan_trust).pack(side="left", padx=6)
        ttk.Button(actions, text="Save report…", command=self.scan_save).pack(side="right")

    def fullscan_start(self) -> None:
        if self.scan_thread and self.scan_thread.is_alive():
            return
        profile = self.scan_profile.get()
        if profile == "deep" and not messagebox.askyesno(
                "Deep scan",
                "A deep scan reads every fixed drive and audits every process's modules.\n\n"
                "It can take hours on a large disk. Candy stays usable while it runs, and "
                "Cancel stops it cleanly.\n\nStart it?"):
            return

        self.scan_cancel_event = threading.Event()
        self.scan_findings = []
        for item in self.scan_tree.get_children():
            self.scan_tree.delete(item)
        self.scan_button.configure(state="disabled")
        self.scan_cancel_button.configure(state="normal")
        self.scan_bar.start(60)
        minutes = max(0, int(self.scan_minutes.get()))
        roots = None

        def worker() -> None:
            from .fullscan import FullScanner
            from .winapi import verify_signature

            scanner = FullScanner(self.config_obj, self.engine.analyzer,
                                  signature_checker=verify_signature)
            last = [0.0]

            def progress(message: str) -> None:
                now = time.monotonic()
                if now - last[0] < 0.25:
                    return
                last[0] = now
                self.after(0, lambda: self.scan_progress.configure(text=truncate(message, 96)))

            try:
                report = scanner.scan(profile, roots=roots, progress=progress,
                                      time_budget=minutes * 60 if minutes else None,
                                      cancel=self.scan_cancel_event.is_set)
            except Exception as exc:  # noqa: BLE001
                self.after(0, lambda: self._fullscan_failed(exc))
                return
            self.after(0, lambda: self._fullscan_done(report))

        self.scan_thread = threading.Thread(target=worker, daemon=True)
        self.scan_thread.start()
        self.set_status(f"Full scan started ({profile}).")

    def fullscan_cancel(self) -> None:
        if self.scan_cancel_event:
            self.scan_cancel_event.set()
            self.scan_progress.configure(text="Cancelling — finishing the current folder…")

    def _fullscan_finished_ui(self) -> None:
        self.scan_bar.stop()
        self.scan_button.configure(state="normal")
        self.scan_cancel_button.configure(state="disabled")

    def _fullscan_failed(self, exc: Exception) -> None:
        self._fullscan_finished_ui()
        self.scan_progress.configure(text="Scan failed.")
        messagebox.showerror("Scan failed", f"{type(exc).__name__}: {exc}")

    def _fullscan_done(self, report) -> None:
        self._fullscan_finished_ui()
        self.scan_report = report
        self.scan_findings = list(report.findings)
        for index, finding in enumerate(self.scan_findings):
            self.scan_tree.insert(
                "", "end", iid=str(index),
                values=(finding.severity.upper(), finding.score, finding.kind,
                        truncate(finding.subject, 110),
                        truncate("; ".join(finding.reasons), 90)),
                tags=(finding.severity,))
        counts = report.by_severity
        summary = (", ".join(f"{count} {level}" for level, count in sorted(counts.items()))
                   or "nothing flagged")
        self.scan_progress.configure(
            text=f"{report.files_scanned:,} files, {report.processes_scanned} processes, "
                 f"{report.persistence_entries} autostart entries in {report.seconds:.0f}s — "
                 f"{summary}" + (" (stopped early)" if report.truncated else ""))
        self.engine.log.write({"event": "fullscan",
                               "profile": report.profile, "seconds": round(report.seconds, 1),
                               "findings": len(report.findings), "worst": report.worst})
        self.set_status(f"Scan finished: {len(report.findings)} finding(s).")

    def _selected_finding(self):
        selection = self.scan_tree.selection()
        if not selection:
            return None
        try:
            return self.scan_findings[int(selection[0])]
        except (ValueError, IndexError):
            return None

    def _on_scan_select(self, _event=None) -> None:
        finding = self._selected_finding()
        if not finding:
            return
        lines = [finding.subject, f"kind: {finding.kind}   score: {finding.score} "
                                  f"({finding.severity})"]
        if finding.sha256:
            lines.append(f"sha256: {finding.sha256}")
        if finding.pid:
            lines.append(f"pid: {finding.pid}")
        lines.append("")
        lines.extend(f"  • {reason}" for reason in finding.reasons)
        if finding.evidence:
            lines.append("")
            lines.append(json.dumps(finding.evidence, indent=2)[:1500])
        self.scan_detail.configure(state="normal")
        self.scan_detail.delete("1.0", "end")
        self.scan_detail.insert("end", "\n".join(lines))
        self.scan_detail.configure(state="disabled")

    def scan_explain(self) -> None:
        finding = self._selected_finding()
        if not finding:
            messagebox.showinfo("Candy", "Select a finding first.")
            return
        self.explain_file(finding.subject)

    def scan_quarantine(self) -> None:
        finding = self._selected_finding()
        if not finding or not Path(finding.subject).is_file():
            messagebox.showinfo("Candy", "Select a finding that refers to a file that still exists.")
            return
        if not messagebox.askyesno("Quarantine", f"Move this file to quarantine?\n\n"
                                                 f"{finding.subject}\n\nIt can be restored from "
                                                 f"the Quarantine tab."):
            return
        self.set_status(str(self.engine.responder.quarantine(finding.subject, forced=True)))
        self.reload_quarantine()

    def scan_kill(self) -> None:
        finding = self._selected_finding()
        if not finding or not finding.pid:
            messagebox.showinfo("Candy", "Select a finding that has a process ID.")
            return
        if not messagebox.askyesno("Terminate", f"Terminate pid {finding.pid}?\n\n"
                                                f"{finding.subject}"):
            return
        self.set_status(str(self.engine.responder.kill(finding.pid, forced=True)))

    def scan_trust(self) -> None:
        finding = self._selected_finding()
        if not finding:
            return
        field, value = ("hashes", finding.sha256) if finding.sha256 else ("paths", finding.subject)
        if not messagebox.askyesno("Trust", f"Always trust this?\n\n{field}: {value}\n\n"
                                            f"Only do this for software you installed yourself."):
            return
        self.config_obj.add_list_entry("whitelist", field, str(value))
        self._pin_trust(field, str(value))
        self.reload_lists()
        self.set_status(f"Whitelisted {field}: {value}")

    def scan_save(self) -> None:
        if not self.scan_report:
            messagebox.showinfo("Candy", "Run a scan first.")
            return
        path = filedialog.asksaveasfilename(title="Save scan report", defaultextension=".json",
                                            initialfile="candy-scan.json",
                                            filetypes=[("JSON report", "*.json")])
        if not path:
            return
        Path(path).write_text(json.dumps(self.scan_report.to_dict(), indent=2), encoding="utf-8")
        self.set_status(f"Report written to {path}")

    # ------------------------------------------------------- protection tab
    def _build_protection_tab(self) -> None:
        outer = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(outer, text="Protection")

        canvas = tk.Canvas(outer, highlightthickness=0)
        scroll = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        frame = ttk.Frame(canvas, padding=(0, 0, 12, 0))
        frame.bind("<Configure>",
                   lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=frame, anchor="nw")
        canvas.configure(yscrollcommand=scroll.set)
        canvas.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

        ttk.Label(frame, text="Everything here changes Windows itself, so most of it needs "
                              "Candy to be running as administrator. Every change on this page "
                              "is undone by 'Undo every change' at the bottom.",
                  wraplength=880, foreground="#666").pack(anchor="w", pady=(0, 8))

        # --- protection level: the one dial most people should ever touch
        level_box = ttk.LabelFrame(frame, text="Protection level", padding=8)
        level_box.pack(fill="x", pady=4)
        from . import levels as _levels

        self.level_var = tk.StringVar(value=_levels.current(self.config_obj))
        for name in _levels.ORDER:
            level = _levels.LEVELS[name]
            row = ttk.Frame(level_box)
            row.pack(fill="x", anchor="w", pady=(2, 0))
            ttk.Radiobutton(row, text=f"{name.capitalize()} — {level.headline}",
                            value=name, variable=self.level_var,
                            command=self.apply_level).pack(anchor="w")
            ttk.Label(row, text=f"breaks: {level.breaks}", wraplength=800,
                      foreground="#888").pack(anchor="w", padx=(24, 0))
        self.level_status = ttk.Label(level_box, text="")
        self.level_status.pack(anchor="w", pady=(6, 0))
        ttk.Label(level_box,
                  text="A level is a starting point, not a cage. Change anything below and "
                       "Candy reports the result as 'custom' rather than quietly putting it "
                       "back.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        # --- download guard
        guard_box = ttk.LabelFrame(frame, text="Download guard — what is allowed to land on disk",
                                   padding=8)
        guard_box.pack(fill="x", pady=4)
        self.guard_policy = tk.StringVar(
            value=str(self.config_obj.get("download_guard.policy", "balanced")))
        for value, label in (
                ("off", "Off — watch downloads but never reject one"),
                ("balanced", "Balanced — reject known threats, renamed executors and "
                             "stealer capabilities (default)"),
                ("fortress", "Fortress — reject EVERY unsigned executable that came from the "
                             "internet, whatever it claims to be")):
            ttk.Radiobutton(guard_box, text=label, value=value, variable=self.guard_policy,
                            command=self.save_guard_policy).pack(anchor="w")

        # --- ad and tracker blocking
        ad_box = ttk.LabelFrame(frame, text="Ads, trackers and malvertising", padding=8)
        ad_box.pack(fill="x", pady=4)
        self.adblock_status = ttk.Label(ad_box, text="checking…")
        self.adblock_status.pack(anchor="w")
        ad_row = ttk.Frame(ad_box)
        ad_row.pack(anchor="w", pady=(6, 0))
        ttk.Button(ad_row, text="Turn on", command=lambda: self.adblock_set(True)).pack(side="left")
        ttk.Button(ad_row, text="Turn off", command=lambda: self.adblock_set(False)).pack(side="left", padx=6)
        ttk.Button(ad_row, text="Import a public list…", command=self.adblock_import).pack(side="left")
        ttk.Button(ad_row, text="Allow a site…", command=self.adblock_allow).pack(side="left", padx=6)

        # --- DNS resolver
        dns_box = ttk.LabelFrame(frame, text="Local DNS filtering resolver", padding=8)
        dns_box.pack(fill="x", pady=4)
        self.dns_enabled = tk.BooleanVar(value=bool(self.config_obj.get("dns.enabled")))
        ttk.Checkbutton(dns_box, text="Filter every DNS lookup on this machine "
                                      "(binds port 53; needs administrator; applies when "
                                      "protection restarts)",
                        variable=self.dns_enabled, command=self.save_dns).pack(anchor="w")
        self.dns_status = ttk.Label(dns_box, text="")
        self.dns_status.pack(anchor="w")
        dns_row = ttk.Frame(dns_box)
        dns_row.pack(anchor="w", pady=(6, 0))
        ttk.Label(dns_row, text="Test a domain").pack(side="left")
        self.dns_test_value = tk.StringVar()
        ttk.Entry(dns_row, textvariable=self.dns_test_value, width=34).pack(side="left", padx=6)
        ttk.Button(dns_row, text="Would this be blocked?", command=self.dns_test).pack(side="left")

        # --- network hardening
        net_box = ttk.LabelFrame(frame, text="Network hardening — encrypted DNS, browser policy, "
                                             "legacy protocols", padding=8)
        net_box.pack(fill="x", pady=4)
        net_row = ttk.Frame(net_box)
        net_row.pack(anchor="w")
        ttk.Label(net_row, text="Resolver").pack(side="left")
        self.netharden_resolver = tk.StringVar(value="quad9")
        ttk.Combobox(net_row, textvariable=self.netharden_resolver, width=18, state="readonly",
                     values=self._resolver_names()).pack(side="left", padx=6)
        ttk.Button(net_row, text="Apply all", command=self.netharden_apply).pack(side="left")
        ttk.Button(net_row, text="Revert", command=self.netharden_revert).pack(side="left", padx=6)
        ttk.Label(net_box, text="Forces filtering DNS-over-HTTPS in Chrome, Edge and Firefox so "
                                "malware cannot quietly resolve around the block, and turns off "
                                "LLMNR, NetBIOS and mDNS name poisoning.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        # --- kernel policy
        kernel_box = ttk.LabelFrame(frame, text="Kernel-enforced policy (Defender ASR and "
                                                "process mitigations)", padding=8)
        kernel_box.pack(fill="x", pady=4)
        self.kernel_status = ttk.Label(kernel_box, text="")
        self.kernel_status.pack(anchor="w")
        kernel_row = ttk.Frame(kernel_box)
        kernel_row.pack(anchor="w", pady=(6, 0))
        ttk.Button(kernel_row, text="Enable (block mode)",
                   command=lambda: self.kernel_asr("block")).pack(side="left")
        ttk.Button(kernel_row, text="Audit only",
                   command=lambda: self.kernel_asr("audit")).pack(side="left", padx=6)
        ttk.Button(kernel_row, text="Disable", command=self.kernel_asr_off).pack(side="left")
        kernel_row2 = ttk.Frame(kernel_box)
        kernel_row2.pack(anchor="w", pady=(6, 0))
        ttk.Label(kernel_row2, text="Harden a program").pack(side="left")
        self.kernel_image = tk.StringVar(value="RobloxPlayerBeta.exe")
        ttk.Entry(kernel_row2, textvariable=self.kernel_image, width=28).pack(side="left", padx=6)
        self.kernel_profile = tk.StringVar(value="game")
        ttk.Combobox(kernel_row2, textvariable=self.kernel_profile, width=10, state="readonly",
                     values=self._mitigation_profiles()).pack(side="left")
        ttk.Button(kernel_row2, text="Harden",
                   command=lambda: self.kernel_harden(True)).pack(side="left", padx=6)
        ttk.Button(kernel_row2, text="Undo",
                   command=lambda: self.kernel_harden(False)).pack(side="left")
        ttk.Label(kernel_box, text="Hardening Roblox makes Windows refuse to load unsigned "
                                   "DLLs into it — the kernel does the blocking, not Candy.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        # --- firewall
        fw_box = ttk.LabelFrame(frame, text="Default-deny outbound firewall", padding=8)
        fw_box.pack(fill="x", pady=4)
        self.firewall_status = ttk.Label(fw_box, text="")
        self.firewall_status.pack(anchor="w")
        fw_row = ttk.Frame(fw_box)
        fw_row.pack(anchor="w", pady=(6, 0))
        ttk.Button(fw_row, text="Learn what needs the internet (2 min)",
                   command=self.firewall_learn).pack(side="left")
        ttk.Button(fw_row, text="Lock down", command=self.firewall_lockdown).pack(side="left", padx=6)
        ttk.Button(fw_row, text="Keep it (confirm)", command=self.firewall_confirm).pack(side="left")
        ttk.Button(fw_row, text="Unlock", command=self.firewall_unlock).pack(side="left", padx=6)
        ttk.Button(fw_row, text="Allow a program…", command=self.firewall_allow).pack(side="left")
        ttk.Button(fw_row, text="Re-check allowed binaries",
                   command=self.firewall_verify).pack(side="left", padx=6)
        ttk.Label(fw_box, text="A lockdown reverts itself automatically after two minutes unless "
                               "you confirm it, so a mistake cannot leave you offline.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        # --- credential stores
        cred_box = ttk.LabelFrame(frame, text="Your Roblox session, passwords and cookies",
                                  padding=8)
        cred_box.pack(fill="x", pady=4)
        self.credguard_status = ttk.Label(cred_box, text="")
        self.credguard_status.pack(anchor="w")
        cred_row = ttk.Frame(cred_box)
        cred_row.pack(anchor="w", pady=(6, 0))
        ttk.Button(cred_row, text="Watch these files",
                   command=lambda: self.credguard_set(True)).pack(side="left")
        ttk.Button(cred_row, text="Stop watching",
                   command=lambda: self.credguard_set(False)).pack(side="left", padx=6)
        ttk.Button(cred_row, text="Show what is protected",
                   command=self.credguard_stores).pack(side="left")
        ttk.Label(cred_box,
                  text="Nobody loses an account because an executor ran — they lose it "
                       "because something read .ROBLOSECURITY out of the browser and "
                       "posted it to a Discord webhook. Candy asks Windows to log every "
                       "process that opens those files, and plants decoys that nothing "
                       "legitimate has any reason to touch. Nothing is blocked and no "
                       "permission is changed.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        # --- startup baseline and clipboard
        watch_box = ttk.LabelFrame(frame, text="Startup baseline and clipboard", padding=8)
        watch_box.pack(fill="x", pady=4)
        self.baseline_status = ttk.Label(watch_box, text="")
        self.baseline_status.pack(anchor="w")
        watch_row = ttk.Frame(watch_box)
        watch_row.pack(anchor="w", pady=(6, 0))
        ttk.Button(watch_row, text="Save a baseline",
                   command=self.baseline_save).pack(side="left")
        ttk.Button(watch_row, text="What changed since?",
                   command=self.baseline_diff).pack(side="left", padx=6)
        ttk.Button(watch_row, text="Test for a clipboard hijacker",
                   command=self.clipboard_probe).pack(side="left")
        ttk.Label(watch_box,
                  text="Take a baseline when the machine is clean. After that, anything "
                       "new that arranges to run at startup shows up as an addition "
                       "instead of one more line in a list of thirty. The clipboard test "
                       "puts a decoy payment address on your clipboard and reads it back "
                       "— your clipboard is restored afterwards.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        # --- trusted programs
        trust_box = ttk.LabelFrame(frame, text="Programs you have trusted", padding=8)
        trust_box.pack(fill="x", pady=4)
        self.trust_status = ttk.Label(trust_box, text="")
        self.trust_status.pack(anchor="w")
        trust_row = ttk.Frame(trust_box)
        trust_row.pack(anchor="w", pady=(6, 0))
        ttk.Button(trust_row, text="Re-check them now",
                   command=lambda: self.trust_check(False)).pack(side="left")
        ttk.Button(trust_row, text="Stop trusting anything that changed",
                   command=lambda: self.trust_check(True)).pack(side="left", padx=6)
        ttk.Button(trust_row, text="Pin current builds",
                   command=self.trust_pin).pack(side="left")
        ttk.Button(trust_row, text="Accept a new build…",
                   command=self.trust_accept).pack(side="left", padx=6)
        ttk.Label(trust_box, text="Trust is pinned to a build, not to a name. If a program "
                                  "you trusted is replaced by a different version — the way an "
                                  "exit scam works — Candy stops clearing it and tells you. It "
                                  "cannot judge whether the new version is honest; it can "
                                  "refuse to assume it.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        # --- break glass / revert
        panic_box = ttk.LabelFrame(frame, text="Break glass", padding=8)
        panic_box.pack(fill="x", pady=4)
        panic_row = ttk.Frame(panic_box)
        panic_row.pack(anchor="w")
        ttk.Button(panic_row, text="PANIC — maximum lockdown",
                   command=self.panic).pack(side="left")
        ttk.Button(panic_row, text="Undo every change Candy has made",
                   command=self.revert_all).pack(side="left", padx=8)
        ttk.Button(panic_row, text="Refresh this page",
                   command=self.refresh_protection).pack(side="left")

        out_box = ttk.LabelFrame(frame, text="Result of the last action", padding=6)
        out_box.pack(fill="both", expand=True, pady=(6, 0))
        self.protect_out = tk.Text(out_box, height=9, wrap="word", font=("Consolas", 9))
        self.protect_out.pack(fill="both", expand=True)

    def _resolver_names(self) -> list[str]:
        try:
            from .netharden import RESOLVERS

            return list(RESOLVERS)
        except Exception:  # noqa: BLE001
            return ["quad9"]

    def _mitigation_profiles(self) -> list[str]:
        try:
            from .kernelpolicy import MITIGATION_PROFILES

            return list(MITIGATION_PROFILES)
        except Exception:  # noqa: BLE001
            return ["game"]

    def emit(self, text: str) -> None:
        """Append a line to the Protection tab's output pane."""
        self.protect_out.insert("end", text.rstrip() + "\n")
        self.protect_out.see("end")

    def _run(self, work, *, busy: str = "Working…", then=None) -> None:
        """Run a blocking action off the Tk thread and report it when it lands."""
        self.set_status(busy)
        self.emit(f"$ {busy}")

        def worker() -> None:
            try:
                result = work()
            except Exception as exc:  # noqa: BLE001
                result = exc

            def finish() -> None:
                if isinstance(result, Exception):
                    self.emit(f"  FAILED: {type(result).__name__}: {result}")
                    self.set_status(f"Failed: {result}")
                    return
                for line in str(result).splitlines() or [""]:
                    self.emit(f"  {line}")
                self.set_status("Done.")
                if then:
                    then(result)

            self.after(0, finish)

        threading.Thread(target=worker, daemon=True).start()

    def save_guard_policy(self) -> None:
        policy = self.guard_policy.get()
        self.config_obj.set("download_guard.policy", policy)
        self.config_obj.save()
        self.set_status(f"Download guard policy: {policy}")
        if policy == "fortress":
            messagebox.showinfo("Fortress policy",
                                "Fortress mode rejects every unsigned executable downloaded "
                                "from the internet.\n\nA lot of legitimate small software is "
                                "unsigned — indie games, mods, open-source tools. Those will be "
                                "quarantined too. Restore anything you recognise from the "
                                "Quarantine tab.")

    def save_dns(self) -> None:
        self.config_obj.set("dns.enabled", bool(self.dns_enabled.get()))
        self.config_obj.save()
        self.set_status("DNS resolver setting saved — restart protection to apply.")

    def dns_test(self) -> None:
        domain = self.dns_test_value.get().strip()
        if not domain:
            return

        def work() -> str:
            from .adblock import AdBlocker
            from .dnsproxy import DnsFilter

            dns_filter = DnsFilter(self.config_obj, self.engine.db, self.engine.analyzer)
            dns_filter.load(AdBlocker(self.config_obj).seed_domains())
            verdict = dns_filter.decide(domain)
            return (f"{domain}: {'BLOCKED' if verdict.blocked else 'allowed'}"
                    + (f" — {verdict.reason}" if verdict.reason else ""))

        self._run(work, busy=f"Testing {domain}…")

    def adblock_set(self, enabled: bool) -> None:
        def work() -> str:
            from .adblock import AdBlocker

            self.config_obj.set("adblock.enabled", enabled)
            self.config_obj.save()
            blocker = AdBlocker(self.config_obj)
            return str(blocker.apply() if enabled else blocker.clear())

        self._run(work, busy=f"Turning ad blocking {'on' if enabled else 'off'}…",
                  then=lambda _r: self.refresh_protection())

    def adblock_import(self) -> None:
        from tkinter import simpledialog

        source = simpledialog.askstring(
            "Import a blocklist",
            "URL or file path of a hosts-format or Adblock-format list:",
            initialvalue="https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
            parent=self)
        if not source:
            return

        def work() -> str:
            from .adblock import AdBlocker

            return str(AdBlocker(self.config_obj).import_list(source))

        self._run(work, busy="Importing blocklist…", then=lambda _r: self.refresh_protection())

    def adblock_allow(self) -> None:
        from tkinter import simpledialog

        domain = simpledialog.askstring("Allow a site",
                                        "Domain to stop blocking (e.g. example.com):",
                                        parent=self)
        if not domain:
            return

        def work() -> str:
            from .adblock import AdBlocker

            return str(AdBlocker(self.config_obj).allow(domain))

        self._run(work, busy=f"Allowing {domain}…", then=lambda _r: self.refresh_protection())

    def netharden_apply(self) -> None:
        if not messagebox.askyesno(
                "Harden the network",
                "Candy will point this machine at a filtering resolver, force encrypted DNS in "
                "your browsers, and turn off LLMNR, NetBIOS and mDNS.\n\n"
                "This needs administrator rights and changes system settings. 'Revert' undoes "
                "all of it.\n\nContinue?"):
            return

        def work() -> str:
            from .netharden import NetworkHardener

            results = NetworkHardener(self.config_obj).apply_all(
                resolver=self.netharden_resolver.get())
            lines = []
            for result in results:
                lines.append(str(result))
                lines.extend(f"    + {item}" for item in result.changed)
                lines.extend(f"    ! {item}" for item in result.skipped)
            return "\n".join(lines)

        self._run(work, busy="Applying network hardening…")

    def netharden_revert(self) -> None:
        def work() -> str:
            from .netharden import NetworkHardener

            return "\n".join(str(r) for r in NetworkHardener(self.config_obj).revert_all())

        self._run(work, busy="Reverting network hardening…")

    def kernel_asr(self, mode: str) -> None:
        def work() -> str:
            from .kernelpolicy import ASR_RULES, KernelPolicy

            result = KernelPolicy(self.config_obj).apply_asr(mode=mode)
            lines = [str(result)]
            lines.extend(f"  ON   {ASR_RULES[rule][0]}" for rule in result.applied)
            lines.extend(f"  --   {ASR_RULES[rule][0]} (not accepted by this Defender build)"
                         for rule in result.failed)
            return "\n".join(lines)

        self._run(work, busy=f"Applying attack-surface reduction rules ({mode})…",
                  then=lambda _r: self.refresh_protection())

    def kernel_asr_off(self) -> None:
        def work() -> str:
            from .kernelpolicy import KernelPolicy

            return str(KernelPolicy(self.config_obj).disable_asr())

        self._run(work, busy="Disabling attack-surface reduction rules…",
                  then=lambda _r: self.refresh_protection())

    def kernel_harden(self, enable: bool) -> None:
        image = self.kernel_image.get().strip()
        if not image:
            return
        profile = self.kernel_profile.get()

        def work() -> str:
            from .kernelpolicy import KernelPolicy

            policy = KernelPolicy(self.config_obj)
            if enable:
                return str(policy.harden_process(image, profile))
            return str(policy.unharden_process(image))

        self._run(work, busy=f"{'Hardening' if enable else 'Unhardening'} {image}…")

    def firewall_learn(self) -> None:
        if not messagebox.askyesno(
                "Learn what needs the internet",
                "Candy will watch outbound connections for two minutes and add every program "
                "that makes one to the allowlist.\n\n"
                "Use the machine normally while it runs — open your browser, launch Roblox, "
                "start anything you rely on. Whatever you don't open now will be blocked "
                "when you lock down.\n\nStart?"):
            return

        def work() -> str:
            from .firewall import FirewallController

            controller = FirewallController(self.config_obj)
            programs = controller.learn(120.0)
            lines = [f"{len(programs)} program(s) made outbound connections."]
            for program in programs:
                ok, detail = controller.allow_program(program)
                lines.append(f"  {'OK  ' if ok else 'FAIL'} {detail}")
            return "\n".join(lines)

        self._run(work, busy="Watching outbound connections for 2 minutes…",
                  then=lambda _r: self.refresh_protection())

    def firewall_lockdown(self) -> None:
        if not messagebox.askyesno(
                "Lock down outbound traffic",
                "This blocks ALL outbound traffic except the programs on your allowlist.\n\n"
                "It reverts itself after two minutes unless you press 'Keep it (confirm)', so "
                "if it breaks something you can simply wait.\n\nLock down now?"):
            return

        def work() -> str:
            from .firewall import FirewallController

            ok, detail = FirewallController(self.config_obj).lockdown(confirm_seconds=120)
            return f"{'OK' if ok else 'FAILED'}: {detail}"

        self._run(work, busy="Locking down outbound traffic…",
                  then=lambda _r: self.refresh_protection())

    def firewall_confirm(self) -> None:
        def work() -> str:
            from .firewall import FirewallController

            ok, detail = FirewallController(self.config_obj).confirm()
            return f"{'OK' if ok else 'FAILED'}: {detail}"

        self._run(work, busy="Confirming the lockdown…", then=lambda _r: self.refresh_protection())

    def firewall_unlock(self) -> None:
        def work() -> str:
            from .firewall import FirewallController

            ok, detail = FirewallController(self.config_obj).unlock()
            return f"{'OK' if ok else 'FAILED'}: {detail}"

        self._run(work, busy="Unlocking outbound traffic…", then=lambda _r: self.refresh_protection())

    def firewall_allow(self) -> None:
        path = filedialog.askopenfilename(title="Allow this program through the firewall",
                                          filetypes=[("Programs", "*.exe"), ("All files", "*.*")])
        if not path:
            return

        def work() -> str:
            from .firewall import FirewallController

            ok, detail = FirewallController(self.config_obj).allow_program(path)
            return f"{'OK' if ok else 'FAILED'}: {detail}"

        self._run(work, busy=f"Allowing {path}…", then=lambda _r: self.refresh_protection())

    def firewall_verify(self) -> None:
        def work() -> str:
            from .firewall import FirewallController

            findings = FirewallController(self.config_obj).verify_allowlist()
            if not findings:
                return "Every allowed binary still matches the hash it was allowed with."
            return "\n".join(f"REVOKED {f['path']}: {f['problem']}" for f in findings)

        self._run(work, busy="Re-checking allowed binaries…")

    def panic(self) -> None:
        if not messagebox.askyesno(
                "Break glass",
                "PANIC puts everything into its strictest state at once:\n\n"
                "  • enforcement on, every automatic action enabled\n"
                "  • download guard set to fortress\n"
                "  • ad and tracker blocking on\n"
                "  • outbound firewall locked to your allowlist\n\n"
                "The firewall lockdown reverts itself in two minutes unless you confirm it.\n\n"
                "Do this now?"):
            return

        def work() -> str:
            from .adblock import AdBlocker
            from .firewall import FirewallController

            self.config_obj.set("response.mode", "enforce")
            for switch in ("auto_kill", "auto_quarantine", "auto_firewall", "auto_block_domains"):
                self.config_obj.set(f"response.{switch}", True)
            self.config_obj.set("download_guard.policy", "fortress")
            self.config_obj.set("adblock.enabled", True)
            self.config_obj.save()
            ok, detail = FirewallController(self.config_obj).lockdown(confirm_seconds=120)
            return ("enforcement : every automatic action enabled, guard set to fortress\n"
                    f"adblock     : {AdBlocker(self.config_obj).apply()}\n"
                    f"firewall    : {detail}\n\n"
                    "Press 'Keep it (confirm)' within two minutes to keep the lockdown.")

        self._run(work, busy="BREAK GLASS — maximum lockdown…", then=lambda _r: self._after_panic())
        self.tabs.select(2)

    def _after_panic(self) -> None:
        self.mode_var.set("enforce")
        self.auto_kill.set(True)
        self.auto_quarantine.set(True)
        self.auto_firewall.set(True)
        self.auto_block_domains.set(True)
        self.guard_policy.set("fortress")
        self.refresh_protection()

    def revert_all(self) -> None:
        from .uninstall import Reverter, format_plan

        plan = Reverter(self.config_obj).plan()
        preview = format_plan(plan)
        if not messagebox.askyesno("Undo every change",
                                   f"{preview}\n\nUndo all of this now?"):
            return

        def work() -> str:
            reverter = Reverter(self.config_obj, self.engine.log)
            result = reverter.revert_all()
            lines = [f"[{'OK  ' if ok else 'FAIL'}] {name:22} {detail[:90]}"
                     for name, ok, detail in result.steps]
            lines.append("")
            lines.append("Quarantined files and logs were left alone — they are evidence.")
            return "\n".join(lines)

        self._run(work, busy="Undoing every system change Candy has made…",
                  then=lambda _r: self.refresh_protection())

    def apply_level(self) -> None:
        from . import levels

        name = self.level_var.get()
        if name not in levels.LEVELS:
            return
        result = levels.plan(self.config_obj, name)
        if not messagebox.askyesno(
                f"Switch to {name}",
                f"{levels.describe(name)}\n\n"
                f"{len(result.changed)} setting(s) change.\n\nApply it?"):
            self.level_var.set(levels.current(self.config_obj))
            return

        def work() -> str:
            levels.apply(self.config_obj, name)
            lines = [f"{c.key}: {c.before} → {c.after}" for c in result.changed]
            for action in result.actions:
                lines.append(self._level_action(action))
            return "\n".join(lines) or "nothing changed"

        self._run(work, busy=f"Switching to {name}…", then=lambda _r: self._after_level())

    def _level_action(self, action: str) -> str:
        from .cli import _apply_level_action

        return _apply_level_action(self.config_obj, self.engine, action)

    def _after_level(self) -> None:
        """Pull the settings widgets back in line with what the level wrote."""
        self.mode_var.set(str(self.config_obj.get("response.mode", "observe")))
        self.auto_kill.set(bool(self.config_obj.get("response.auto_kill")))
        self.auto_quarantine.set(bool(self.config_obj.get("response.auto_quarantine")))
        self.auto_firewall.set(bool(self.config_obj.get("response.auto_firewall")))
        self.auto_block_domains.set(bool(self.config_obj.get("response.auto_block_domains")))
        self.threshold.set(int(self.config_obj.get("response.action_threshold", 75)))
        self.guard_policy.set(str(self.config_obj.get("download_guard.policy", "balanced")))
        self.dns_enabled.set(bool(self.config_obj.get("dns.enabled")))
        self.scan_schedule.set(bool(self.config_obj.get("scan.on_schedule")))
        self.scan_interval.set(int(self.config_obj.get("scan.interval_minutes", 120)))
        self.refresh_protection()

    def credguard_set(self, on: bool) -> None:
        if on and not messagebox.askyesno(
                "Watch your credential stores",
                "Candy will ask Windows to log every process that opens your browser "
                "cookie and password databases, your Roblox session file, and your "
                "Discord tokens — and will place decoy files that nothing legitimate "
                "has any reason to read.\n\n"
                "Nothing is blocked and no permission is changed: this only adds audit "
                "entries. Needs administrator.\n\nTurn it on?"):
            return

        def work() -> str:
            from .credguard import CredentialGuard

            guard = CredentialGuard(self.config_obj, self.engine.log)
            result = guard.arm() if on else guard.disarm()
            lines = [str(result)]
            lines.extend(f"  watching {label}" for label in result.armed)
            lines.extend(f"  could not watch {label}" for label in result.skipped)
            return "\n".join(lines)

        self._run(work, busy=f"{'Arming' if on else 'Disarming'} credential auditing…",
                  then=lambda _r: self.refresh_protection())

    def credguard_stores(self) -> None:
        def work() -> str:
            from .credguard import present_stores

            lines = []
            for store, path in present_stores(self.config_obj):
                lines.append(f"[{store.severity.upper()}] {store.label}")
                lines.append(f"    {path}")
                lines.append(f"    owned by: {', '.join(store.owners) or 'nothing'}")
                if store.note:
                    lines.append(f"    {store.note}")
            return "\n".join(lines) or "None of the known credential stores exist here."

        self._run(work, busy="Reading credential stores…")

    def baseline_save(self) -> None:
        from .baseline import BaselineStore

        existing = BaselineStore(self.config_obj).load()
        if existing and not messagebox.askyesno(
                "Replace the baseline",
                f"A baseline already exists, taken {existing.taken} with "
                f"{len(existing.entries)} entries.\n\n"
                f"Replacing it makes everything that has appeared since invisible. "
                f"Check 'What changed since?' first.\n\nReplace it anyway?"):
            return
        if not existing and not messagebox.askyesno(
                "Save a baseline",
                "Candy will record everything currently set to run at startup, and "
                "report anything new from now on.\n\n"
                "Only do this when you believe the machine is clean — if something is "
                "already there, it becomes part of the baseline.\n\nSave it?"):
            return

        def work() -> str:
            store = BaselineStore(self.config_obj, self.engine.log)
            snapshot = store.capture()
            store.save(snapshot)
            return (f"Baseline saved: {len(snapshot.entries)} autostart entries.\n"
                    f"This only proves what changes from now on.")

        self._run(work, busy="Recording what runs at startup…",
                  then=lambda _r: self.refresh_protection())

    def baseline_diff(self) -> None:
        def work() -> str:
            from .baseline import BaselineStore, format_diff

            store = BaselineStore(self.config_obj, self.engine.log)
            report = store.diff(analyzer=self.engine.analyzer)
            for change in report.changes:
                if change.severity in ("high", "critical"):
                    self.engine.handle_detection(Detection(
                        source="baseline", kind=f"autostart_{change.kind}",
                        subject=change.entry.name,
                        message=f"{change.kind}: {change.entry.name} — {change.reasons[0]}",
                        severity=change.severity, path=change.entry.image,
                        signature_id="baseline.change", evidence=change.to_dict()))
            return format_diff(report)

        self._run(work, busy="Comparing startup against the baseline…")

    def clipboard_probe(self) -> None:
        if not messagebox.askyesno(
                "Test for a clipboard hijacker",
                "Candy will put a decoy payment address on your clipboard and read it "
                "back a moment later. If something rewrites it, that is a clipboard "
                "hijacker caught in the act.\n\n"
                "Whatever you had copied is put back afterwards.\n\nRun the test?"):
            return

        def work() -> str:
            from .clipboard import ClipboardMonitor

            monitor = ClipboardMonitor(self.config_obj, self.engine.handle_detection)
            finding = monitor.probe()
            if finding is None:
                return ("The decoy came back unchanged — nothing is rewriting the "
                        "clipboard right now.\n"
                        "This is a spot check: it proves nothing about a clipper that "
                        "is not running yet, or one that only acts on real addresses.")
            return f"[{finding.severity.upper()}] " + "\n".join(finding.reasons)

        self._run(work, busy="Baiting a clipboard hijacker…")

    def trust_check(self, revoke: bool) -> None:
        if revoke and not messagebox.askyesno(
                "Stop trusting changed programs",
                "Candy will remove the whitelist entry for every program whose file has "
                "changed since you trusted it.\n\n"
                "Nothing is deleted or blocked — those programs simply get assessed "
                "normally again, and you can re-trust any of them.\n\nContinue?"):
            return

        def work() -> str:
            from .drift import TrustLedger, format_report
            from .winapi import verify_signature

            ledger = TrustLedger(self.config_obj, self.engine.log,
                                 signature_checker=verify_signature)
            report = ledger.check(revoke=revoke)
            return format_report(report, unverifiable=ledger.unverifiable())

        self._run(work, busy="Re-checking every program you have trusted…",
                  then=lambda _r: (self.reload_lists(), self.refresh_protection()))

    def trust_pin(self) -> None:
        def work() -> str:
            from .drift import TrustLedger
            from .winapi import verify_signature

            ledger = TrustLedger(self.config_obj, self.engine.log,
                                 signature_checker=verify_signature)
            count = ledger.pin_whitelist()
            unverifiable = ledger.unverifiable()
            lines = [f"Pinned {count} build(s) behind your whitelist."]
            if unverifiable:
                lines.append("")
                lines.append("Trusted by name only — these clear ANY file with that name:")
                lines.extend(f"  {name}" for name in unverifiable)
                lines.append("Re-trust them by full path so they can be pinned.")
            return "\n".join(lines)

        self._run(work, busy="Pinning the builds you trust…",
                  then=lambda _r: self.refresh_protection())

    def trust_accept(self) -> None:
        """Record a new version of something already trusted as known-good.

        This is the one-click answer to "this is a build of X you have never
        run before": the user looks at it, decides, and from then on that exact
        build clears — and the next new build is measured against it too.
        """
        path = filedialog.askopenfilename(title="Accept this build as known-good")
        if not path:
            return
        if not messagebox.askyesno(
                "Accept this build",
                f"Record this exact build as one you trust?\n\n{path}\n\n"
                f"Candy will clear it from now on, and will compare future versions of "
                f"this program against what this one can do.\n\n"
                f"Look at it first if you are not sure — Tools → Explain a file."):
            return

        def work() -> str:
            from .drift import TrustLedger
            from .winapi import verify_signature

            build = TrustLedger(self.config_obj, self.engine.log,
                                signature_checker=verify_signature).accept(path)
            if build is None:
                return f"{path} could not be read."
            lines = [f"Recorded build {build.sha256[:32]}…"]
            if build.capabilities:
                lines.append(f"  it can: {', '.join(build.capabilities)}")
            if build.exfil:
                lines.append(f"  drop channels: {', '.join(build.exfil)}")
            return "\n".join(lines)

        self._run(work, busy="Recording this build…", then=lambda _r: self.refresh_protection())

    def _pin_trust(self, field: str, value: str) -> None:
        """Record the build behind a trust decision made from this window."""
        if field not in ("paths", "names"):
            return

        def work() -> None:
            from .drift import TrustLedger
            from .winapi import verify_signature

            target = Path(value)
            if target.is_file():
                TrustLedger(self.config_obj, self.engine.log,
                            signature_checker=verify_signature).pin(
                    target, field=field, subject=value)

        threading.Thread(target=work, daemon=True).start()

    def refresh_protection(self) -> None:
        """Read the live state of every hardening subsystem, off the Tk thread."""
        def work() -> dict:
            state: dict = {}
            try:
                from .adblock import AdBlocker

                state["adblock"] = AdBlocker(self.config_obj).status()
            except Exception as exc:  # noqa: BLE001
                state["adblock_error"] = str(exc)
            try:
                from .firewall import FirewallController

                controller = FirewallController(self.config_obj)
                state["firewall"] = controller.status().to_dict()
                state["allowlist"] = len(controller.load_allowlist())
            except Exception as exc:  # noqa: BLE001
                state["firewall_error"] = str(exc)
            try:
                from .kernelpolicy import KernelPolicy

                state["kernel"] = KernelPolicy(self.config_obj).status()
            except Exception as exc:  # noqa: BLE001
                state["kernel_error"] = str(exc)
            try:
                from . import levels as _lv
                from .credguard import CredentialGuard

                state["level"] = _lv.current(self.config_obj)
                state["credguard"] = CredentialGuard(self.config_obj).status()
            except Exception as exc:  # noqa: BLE001
                state["credguard_error"] = str(exc)
            try:
                from .drift import TrustLedger

                ledger = TrustLedger(self.config_obj)
                state["pins"] = len(ledger.load())
                state["unpinned"] = len(ledger.unverifiable())
                state["builds"] = sum(len(b) for b in ledger.lineage().values())
                from .baseline import BaselineStore

                snapshot = BaselineStore(self.config_obj).load()
                state["baseline"] = (f"{len(snapshot.entries)} entries, taken "
                                     f"{snapshot.taken}") if snapshot else ""
                state["programs"] = len(ledger.lineage())
            except Exception as exc:  # noqa: BLE001
                state["trust_error"] = str(exc)
            try:
                state["dns"] = self.engine.dns_proxy.status()
            except Exception as exc:  # noqa: BLE001
                state["dns_error"] = str(exc)
            return state

        def apply(state: dict) -> None:
            adblock = state.get("adblock")
            self.adblock_status.configure(
                text=(f"{'ON' if adblock.get('enabled') else 'OFF'} — "
                      f"{adblock.get('blocked_domains', 0)} domain(s) sinkholed; categories: "
                      f"{', '.join(adblock.get('categories', [])) or 'none'}"
                      + ("" if adblock.get("writable") else
                         f"   [hosts file not writable: {adblock.get('detail', '')}]"))
                if adblock else f"unavailable ({state.get('adblock_error', 'unknown')})")

            firewall = state.get("firewall")
            self.firewall_status.configure(
                text=(f"{'LOCKED DOWN' if firewall.get('locked_down') else 'normal (allow by default)'}"
                      f" — allowlist: {state.get('allowlist', 0)} program(s)"
                      f"{'' if firewall.get('admin') else '   [not administrator — changes will fail]'}")
                if firewall else f"unavailable ({state.get('firewall_error', 'unknown')})")

            kernel = state.get("kernel")
            self.kernel_status.configure(
                text=(f"mode: {kernel.get('asr_mode', 'not configured')} — "
                      f"{kernel.get('asr_active_count', 0)} of "
                      f"{len(kernel.get('asr_rules', {}))} rule(s) active; "
                      f"{len(kernel.get('hardened_processes', {}))} program(s) hardened")
                if kernel else f"unavailable ({state.get('kernel_error', 'unknown')})")

            if "level" in state:
                self.level_status.configure(text=f"Currently: {state['level']}")
                self.level_var.set(state["level"] if state["level"] != "custom"
                                   else self.level_var.get())
            credguard = state.get("credguard")
            if credguard:
                self.credguard_status.configure(
                    text=f"{len(credguard.get('stores_present', []))} store(s) found here, "
                         f"{len(credguard.get('armed', []))} watched, "
                         f"{len(credguard.get('canaries_planted', []))} decoy(s) planted"
                         + ("   [not Windows — arming is inert]"
                            if "windows" not in str(credguard.get("platform", "")) else ""))
            elif "credguard_error" in state:
                self.credguard_status.configure(
                    text=f"unavailable ({state['credguard_error']})")

            if "baseline" in state:
                self.baseline_status.configure(
                    text=f"Startup baseline: {state['baseline']}" if state["baseline"]
                    else "No startup baseline saved yet.")

            if "pins" in state:
                self.trust_status.configure(
                    text=f"{state['pins']} pinned file(s); "
                         f"{state.get('builds', 0)} build(s) recorded across "
                         f"{state.get('programs', 0)} program(s)"
                         + (f"; {state['unpinned']} trusted by name with no build history"
                            if state.get("unpinned") else ""))
            else:
                self.trust_status.configure(
                    text=f"unavailable ({state.get('trust_error', 'unknown')})")

            dns = state.get("dns")
            if dns:
                mode = dns.get("mode", "idle")
                self.dns_status.configure(
                    text=f"resolver {mode} — {dns.get('blocklist_size', 0)} domain(s) on the "
                         f"blocklist, {dns.get('queries', 0)} lookup(s) seen, "
                         f"{dns.get('blocked', 0)} blocked"
                         + (f"   [{dns.get('last_error')}]" if dns.get("last_error") else ""))
            else:
                self.dns_status.configure(text=f"unavailable ({state.get('dns_error', 'unknown')})")

        def worker() -> None:
            state = work()
            self.after(0, lambda: apply(state))

        threading.Thread(target=worker, daemon=True).start()

    # ------------------------------------------------------- extensions tab
    def _build_extensions_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=6)
        self.tabs.add(frame, text="Extensions")

        ttk.Label(frame, text="A browser extension with permission to read cookies on roblox.com "
                              "can take your account without ever needing your password. Candy "
                              "reads what each installed extension asked for — it never touches "
                              "browser files.",
                  wraplength=880, foreground="#666").pack(anchor="w", pady=(0, 6))

        bar = ttk.Frame(frame)
        bar.pack(fill="x", pady=(0, 6))
        ttk.Button(bar, text="Scan installed extensions", command=self.extensions_scan).pack(side="left")
        self.extensions_all = tk.BooleanVar(value=False)
        ttk.Checkbutton(bar, text="show low-risk extensions too", variable=self.extensions_all,
                        command=self._render_extensions).pack(side="left", padx=10)
        self.extensions_summary = ttk.Label(bar, text="")
        self.extensions_summary.pack(side="left", padx=10)

        table = ttk.Frame(frame)
        table.pack(side="top", fill="both", expand=True)
        columns = ("score", "verdict", "browser", "name", "id")
        self.extensions_tree = ttk.Treeview(table, columns=columns, show="headings", height=13)
        for column, width in (("score", 60), ("verdict", 90), ("browser", 100),
                              ("name", 320), ("id", 300)):
            self.extensions_tree.heading(column, text=column.title())
            self.extensions_tree.column(column, width=width, anchor="w")
        ext_scroll = ttk.Scrollbar(table, orient="vertical", command=self.extensions_tree.yview)
        self.extensions_tree.configure(yscrollcommand=ext_scroll.set)
        ext_scroll.pack(side="right", fill="y")
        self.extensions_tree.pack(side="left", fill="both", expand=True)
        self.extensions_tree.bind("<<TreeviewSelect>>", self._on_extension_select)

        detail = ttk.LabelFrame(frame, text="What it asked for", padding=6)
        detail.pack(fill="x", pady=(8, 0))
        self.extensions_detail = tk.Text(detail, height=8, wrap="word", font=("Consolas", 9))
        self.extensions_detail.pack(fill="both", expand=True)
        self.extensions_detail.configure(state="disabled")

    def extensions_scan(self) -> None:
        self.set_status("Reading installed browser extensions…")

        def worker() -> None:
            from .browserscan import scan_all

            try:
                verdicts = scan_all()
            except Exception as exc:  # noqa: BLE001
                self.after(0, lambda: self.set_status(f"Extension scan failed: {exc}"))
                return
            self.after(0, lambda: self._extensions_done(verdicts))

        threading.Thread(target=worker, daemon=True).start()

    def _extensions_done(self, verdicts) -> None:
        self.extension_verdicts = list(verdicts)
        self._render_extensions()
        risky = sum(1 for v in self.extension_verdicts if v.score >= 65)
        self.set_status(f"{len(self.extension_verdicts)} extension(s) read, {risky} worth a look.")

    def _render_extensions(self) -> None:
        for item in self.extensions_tree.get_children():
            self.extensions_tree.delete(item)
        shown = [(index, verdict) for index, verdict in enumerate(self.extension_verdicts)
                 if self.extensions_all.get() or verdict.score >= 25]
        shown.sort(key=lambda pair: -pair[1].score)
        for index, verdict in shown:
            extension = verdict.extension
            self.extensions_tree.insert(
                "", "end", iid=str(index),
                values=(verdict.score, verdict.severity.upper(), extension.browser,
                        truncate(extension.name or "(unnamed)", 70),
                        truncate(extension.extension_id, 60)),
                tags=(self._extension_tag(verdict.score),))
        for severity, color in SEVERITY_COLORS.items():
            self.extensions_tree.tag_configure(severity, foreground=color)
        hidden = len(self.extension_verdicts) - len(shown)
        self.extensions_summary.configure(
            text=f"{len(shown)} shown" + (f", {hidden} low-risk hidden" if hidden else ""))

    @staticmethod
    def _extension_tag(score: int) -> str:
        if score >= 120:
            return "critical"
        if score >= 65:
            return "high"
        if score >= 40:
            return "medium"
        return "low"

    def _on_extension_select(self, _event=None) -> None:
        selection = self.extensions_tree.selection()
        if not selection:
            return
        try:
            verdict = self.extension_verdicts[int(selection[0])]
        except (ValueError, IndexError):
            return
        extension = verdict.extension
        lines = [f"{extension.name or '(unnamed)'}  [{extension.browser} / {extension.profile}]",
                 f"id      : {extension.extension_id}",
                 f"version : {extension.version}",
                 f"path    : {extension.path}",
                 f"source  : {'SIDELOADED — not from a store' if extension.sideloaded else 'store install'}",
                 "",
                 f"score {verdict.score} ({verdict.severity})", ""]
        lines.extend(f"  • {reason}" for reason in verdict.reasons)
        lines.append("")
        lines.append(f"permissions: {', '.join(extension.permissions) or 'none declared'}")
        lines.append(f"sites      : {', '.join(extension.all_hosts) or 'none declared'}")
        self.extensions_detail.configure(state="normal")
        self.extensions_detail.delete("1.0", "end")
        self.extensions_detail.insert("end", "\n".join(lines))
        self.extensions_detail.configure(state="disabled")

    # ------------------------------------------------------------ tools tab
    def _build_tools_tab(self) -> None:
        frame = ttk.Frame(self.tabs, padding=8)
        self.tabs.add(frame, text="Tools")

        file_box = ttk.LabelFrame(frame, text="Explain a file — everything Candy can say about "
                                              "it, and why", padding=8)
        file_box.pack(fill="x")
        row = ttk.Frame(file_box)
        row.pack(fill="x")
        self.explain_path = tk.StringVar()
        ttk.Entry(row, textvariable=self.explain_path, width=70).pack(side="left")
        ttk.Button(row, text="Browse…", command=self.explain_browse).pack(side="left", padx=6)
        ttk.Button(row, text="Explain", command=lambda: self.explain_file(None)).pack(side="left")
        ttk.Label(file_box, text="Use this on anything a scan flagged before you delete it — it "
                                 "shows the reasoning, so a false positive is recognisable as one.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        url_box = ttk.LabelFrame(frame, text="Check a link before you open it", padding=8)
        url_box.pack(fill="x", pady=8)
        url_row = ttk.Frame(url_box)
        url_row.pack(fill="x")
        self.check_url_value = tk.StringVar()
        entry = ttk.Entry(url_row, textvariable=self.check_url_value, width=70)
        entry.pack(side="left")
        entry.bind("<Return>", lambda _e: self.check_url())
        ttk.Button(url_row, text="Check", command=self.check_url).pack(side="left", padx=6)
        ttk.Button(url_row, text="Check and block", command=lambda: self.check_url(block=True)
                   ).pack(side="left")

        test_box = ttk.LabelFrame(frame, text="Prove it works", padding=8)
        test_box.pack(fill="x")
        test_row = ttk.Frame(test_box)
        test_row.pack(fill="x")
        ttk.Button(test_row, text="Run the detection self-test",
                   command=self.run_selftest).pack(side="left")
        ttk.Button(test_row, text="Show the technique matrix",
                   command=self.show_matrix).pack(side="left", padx=6)
        ttk.Button(test_row, text="Verify Candy's own files",
                   command=self.check_integrity).pack(side="left")
        ttk.Button(test_row, text="Check Candy's own security",
                   command=self.selfcheck).pack(side="left", padx=6)
        ttk.Label(test_box, text="The self-test replays real injection, persistence and download "
                                 "techniques through the detection pipeline and reports which "
                                 "ones were caught. Nothing malicious is executed.",
                  wraplength=840, foreground="#666").pack(anchor="w", pady=(4, 0))

        out_box = ttk.LabelFrame(frame, text="Output", padding=6)
        out_box.pack(fill="both", expand=True, pady=(8, 0))
        self.tools_out = tk.Text(out_box, wrap="none", font=("Consolas", 9))
        tools_scroll = ttk.Scrollbar(out_box, orient="vertical", command=self.tools_out.yview)
        self.tools_out.configure(yscrollcommand=tools_scroll.set)
        tools_scroll.pack(side="right", fill="y")
        self.tools_out.pack(side="left", fill="both", expand=True)

    def _tools_show(self, text: str) -> None:
        self.tools_out.delete("1.0", "end")
        self.tools_out.insert("end", text)
        self.tools_out.see("1.0")
        self.tabs.select(self._tools_index)

    def _capture(self, func, **fields) -> str:
        """Run a CLI command with its output captured, so the GUI and the CLI
        can never drift apart in what they report."""
        import argparse
        import contextlib
        import io

        buffer = io.StringIO()
        namespace = argparse.Namespace(
            config=str(self.config_obj.path) if self.config_obj.path else None, **fields)
        with contextlib.redirect_stdout(buffer), contextlib.redirect_stderr(buffer):
            try:
                func(namespace)
            except SystemExit:
                pass
            except Exception as exc:  # noqa: BLE001
                buffer.write(f"\n{type(exc).__name__}: {exc}\n")
        return buffer.getvalue()

    def explain_browse(self) -> None:
        path = filedialog.askopenfilename(title="Explain this file")
        if path:
            self.explain_path.set(path)
            self.explain_file(path)

    def explain_file(self, path: str | None) -> None:
        target = path or self.explain_path.get().strip()
        if not target:
            messagebox.showinfo("Candy", "Choose a file first.")
            return
        self.explain_path.set(target)
        self.set_status(f"Explaining {target}…")

        def worker() -> None:
            from .cli import cmd_explain

            text = self._capture(cmd_explain, file=target)
            self.after(0, lambda: (self._tools_show(text), self.set_status("Explanation ready.")))

        threading.Thread(target=worker, daemon=True).start()

    def check_url(self, block: bool = False) -> None:
        url = self.check_url_value.get().strip()
        if not url:
            return
        if block and not messagebox.askyesno(
                "Block this site",
                f"Sinkhole {url} in the Windows hosts file and add firewall rules for its "
                f"current addresses?\n\nBoth are reversible from the Protection tab."):
            return
        self.set_status(f"Checking {url}…")

        def worker() -> None:
            from .cli import cmd_check_url

            text = self._capture(cmd_check_url, url=url, block=block)
            self.after(0, lambda: (self._tools_show(text), self.set_status("Link checked.")))

        threading.Thread(target=worker, daemon=True).start()

    def run_selftest(self) -> None:
        self.set_status("Running the detection self-test…")

        def worker() -> None:
            from . import coverage as cov

            try:
                outcomes = cov.run_selftest(self.engine)
                text = cov.format_report(outcomes)
            except Exception as exc:  # noqa: BLE001
                text = f"{type(exc).__name__}: {exc}"
            self.after(0, lambda: (self._tools_show(text), self.set_status("Self-test finished.")))

        threading.Thread(target=worker, daemon=True).start()

    def show_matrix(self) -> None:
        def worker() -> None:
            from .cli import cmd_coverage

            text = self._capture(cmd_coverage, matrix=True, json=False, live=False, verbose=False)
            self.after(0, lambda: self._tools_show(text))

        threading.Thread(target=worker, daemon=True).start()

    def selfcheck(self) -> None:
        def worker() -> None:
            from .selfprotect import SelfProtect, format_report

            try:
                text = format_report(SelfProtect(self.config_obj, self.engine.log).check())
            except Exception as exc:  # noqa: BLE001
                text = f"{type(exc).__name__}: {exc}"
            self.after(0, lambda: self._tools_show(text))

        threading.Thread(target=worker, daemon=True).start()

    def check_integrity(self) -> None:
        def worker() -> None:
            from .cli import cmd_integrity

            text = self._capture(cmd_integrity, action="check", out=None)
            self.after(0, lambda: self._tools_show(text))

        threading.Thread(target=worker, daemon=True).start()

    def _build_statusbar(self) -> None:
        self.statusbar = ttk.Label(self, text="Ready.", anchor="w", relief="sunken", padding=(6, 2))
        self.statusbar.pack(fill="x", pady=(8, 0))

    # ------------------------------------------------------------- controls
    def toggle(self) -> None:
        if self.engine.started_at:
            self.engine.stop()
            self.toggle_button.configure(text="Start protection")
            self.status_label.configure(text="Protection stopped")
            self.status_dot.itemconfigure(self._dot, fill="#9aa0a6")
            self.set_status("Protection stopped.")
        else:
            report = self.engine.start()
            self.toggle_button.configure(text="Stop protection")
            mode = self.config_obj.get("response.mode")
            self.status_label.configure(
                text=f"Protecting — {'enforcing' if mode == 'enforce' else 'observing'}")
            self.status_dot.itemconfigure(self._dot, fill="#16a34a" if not report["errors"] else "#d97706")
            self.set_status(f"Started: {', '.join(report['started']) or 'nothing'}"
                            + (f" | errors: {'; '.join(report['errors'])}" if report["errors"] else ""))

    def scan_now(self) -> None:
        self.set_status("Scanning…")

        def worker() -> None:
            result = self.engine.scan_now()
            self.after(0, lambda: self.set_status(
                f"Scan finished: {result['processes']} processes, {result['files']} files, "
                f"{result['new_detections']} new detection(s) in {result['seconds']}s."))

        threading.Thread(target=worker, daemon=True).start()

    def update_threats(self) -> None:
        def worker() -> None:
            result = self.engine.update_threats()
            message = (f"Threat database updated: {result.get('added')}" if result.get("ok")
                       else f"Update failed: {result.get('detail')}")
            self.after(0, lambda: self.set_status(message))

        threading.Thread(target=worker, daemon=True).start()

    # --------------------------------------------------------------- events
    def _pump(self) -> None:
        """Drain the event queue onto the Tk thread."""
        drained = 0
        try:
            while drained < 100:
                detection = self.queue.get_nowait()
                self._add_row(detection)
                drained += 1
        except queue.Empty:
            pass
        self.after(self.refresh_ms, self._pump)

    def _add_row(self, detection: Detection) -> None:
        self.detections.append(detection)
        where = detection.path or detection.remote or detection.subject
        self.tree.insert("", 0, iid=str(len(self.detections) - 1),
                         values=(detection.timestamp, detection.severity.upper(), detection.source,
                                 truncate(detection.message, 90), truncate(where, 70)),
                         tags=(detection.severity,))
        limit = int(self.config_obj.get("ui.max_rows", 500))
        children = self.tree.get_children()
        if len(children) > limit:
            for item in children[limit:]:
                self.tree.delete(item)
        if detection.severity in ("high", "critical"):
            self.set_status(f"⚠ {detection.summary()}")

    def _selected(self) -> Detection | None:
        selection = self.tree.selection()
        if not selection:
            return None
        try:
            return self.detections[int(selection[0])]
        except (ValueError, IndexError):
            return None

    def _on_select(self, _event=None) -> None:
        detection = self._selected()
        if not detection:
            return
        self.detail.configure(state="normal")
        self.detail.delete("1.0", "end")
        self.detail.insert("end", json.dumps(detection.to_dict(), indent=2))
        self.detail.configure(state="disabled")

    # -------------------------------------------------------------- actions
    def action_kill(self) -> None:
        detection = self._selected()
        if not detection or not detection.pid:
            messagebox.showinfo("Candy", "Select a detection that has a process ID.")
            return
        if not messagebox.askyesno("Terminate process",
                                   f"Terminate {detection.process_name} (pid {detection.pid})?\n\n"
                                   f"Unsaved work in that process will be lost."):
            return
        result = self.engine.responder.kill(detection.pid, detection.process_name,
                                            forced=True, detection=detection)
        self.set_status(str(result))

    def action_quarantine(self) -> None:
        detection = self._selected()
        if not detection or not detection.path:
            messagebox.showinfo("Candy", "Select a detection that refers to a file.")
            return
        if not messagebox.askyesno("Quarantine file",
                                   f"Move this file to quarantine?\n\n{detection.path}\n\n"
                                   f"You can restore it later from the Quarantine tab."):
            return
        result = self.engine.responder.quarantine(detection.path, forced=True, detection=detection)
        self.set_status(str(result))
        self.reload_quarantine()

    def action_block_ip(self) -> None:
        detection = self._selected()
        if not detection or not detection.remote:
            messagebox.showinfo("Candy", "Select a network or DNS detection.")
            return
        from .netblock import normalize_domain

        target = detection.remote.rsplit(":", 1)[0]
        domain = normalize_domain(target)
        if domain:
            if not messagebox.askyesno(
                    "Block site",
                    f"Block {domain}?\n\nCandy will sinkhole it in the Windows hosts file "
                    f"and add firewall rules for its current addresses. Both are reversible "
                    f"from this window."):
                return
            result = self.engine.responder.block_domain(domain, forced=True, detection=detection)
        else:
            if not messagebox.askyesno("Block IP", f"Add Windows Firewall rules blocking {target}?"):
                return
            result = self.engine.responder.block_ip(target, forced=True, detection=detection)
        self.set_status(str(result))

    def action_whitelist(self) -> None:
        detection = self._selected()
        if not detection:
            return
        if detection.path:
            field, value = "paths", detection.path
        elif detection.process_name:
            field, value = "names", detection.process_name
        elif detection.remote:
            field, value = "ips", detection.remote.rsplit(":", 1)[0]
        else:
            return
        if not messagebox.askyesno(
                "Whitelist",
                f"Always trust this?\n\n{field}: {value}\n\n"
                f"Candy will stop reporting it. Only do this for software you installed "
                f"yourself and recognise."):
            return
        self.config_obj.add_list_entry("whitelist", field, value)
        self._pin_trust(field, value)
        self.reload_lists()
        self.set_status(f"Whitelisted {field}: {value}")

    def clear_threats(self) -> None:
        for item in self.tree.get_children():
            self.tree.delete(item)
        self.detections.clear()
        self.engine.aggregator.reset()
        self.set_status("Threat list cleared (the log on disk is untouched).")

    # ----------------------------------------------------------- list panel
    def reload_lists(self) -> None:
        for item in self.list_tree.get_children():
            self.list_tree.delete(item)
        for kind in ("whitelist", "blacklist"):
            for field, values in (self.config_obj.get(kind) or {}).items():
                for value in values:
                    self.list_tree.insert("", "end", values=(kind, field, value))

    def list_add(self) -> None:
        value = self.list_value.get().strip()
        if not value:
            return
        self.config_obj.add_list_entry(self.list_kind.get(), self.list_field.get(), value)
        if self.list_kind.get() == "whitelist":
            self._pin_trust(self.list_field.get(), value)
        self.list_value.set("")
        self.reload_lists()
        self.set_status(f"Added to {self.list_kind.get()}.{self.list_field.get()}: {value}")

    def list_remove(self) -> None:
        selection = self.list_tree.selection()
        if not selection:
            return
        for item in selection:
            kind, field, value = self.list_tree.item(item, "values")
            self.config_obj.remove_list_entry(kind, field, value)
        self.reload_lists()
        self.set_status("Removed selected entries.")

    def list_browse(self) -> None:
        path = filedialog.askopenfilename(title="Choose a file to add")
        if path:
            self.list_value.set(path)

    # ------------------------------------------------------ quarantine panel
    def reload_quarantine(self) -> None:
        for item in self.quarantine_tree.get_children():
            self.quarantine_tree.delete(item)
        for entry in self.engine.responder.list_quarantine():
            self.quarantine_tree.insert("", "end", values=(
                entry.get("quarantined_at"), entry.get("original_path"),
                (entry.get("sha256") or "")[:16], truncate(entry.get("reason", ""), 80),
            ), tags=(entry.get("quarantine_file"),))

    def _selected_quarantine(self) -> str | None:
        selection = self.quarantine_tree.selection()
        if not selection:
            return None
        tags = self.quarantine_tree.item(selection[0], "tags")
        return tags[0] if tags else None

    def quarantine_restore(self) -> None:
        target = self._selected_quarantine()
        if not target:
            return
        if not messagebox.askyesno("Restore", "Put this file back where it came from?\n\n"
                                              "Only restore files you are sure are safe."):
            return
        self.set_status(str(self.engine.responder.restore(target)))
        self.reload_quarantine()

    def quarantine_delete(self) -> None:
        target = self._selected_quarantine()
        if not target:
            return
        if not messagebox.askyesno("Delete", "Permanently delete this quarantined file?"):
            return
        self.set_status(str(self.engine.responder.delete_quarantined(target)))
        self.reload_quarantine()

    # ------------------------------------------------------------ log panel
    def reload_log(self) -> None:
        path = self.engine.log.path
        self.log_text.delete("1.0", "end")
        records = list(iter_records(path))
        if self.log_only_detections.get():
            records = [r for r in records if r.get("event") == "detection"]
        for record in records[-800:]:
            if record.get("event") == "detection":
                line = (f"[{record.get('ts')}] {str(record.get('severity', '')).upper():8} "
                        f"{record.get('message', '')}\n")
            else:
                line = f"[{record.get('ts')}] {record.get('event')}\n"
            self.log_text.insert("end", line)
        self.log_text.see("end")
        self.set_status(f"Loaded {len(records)} records from {path}")

    def verify_log(self) -> None:
        ok, count, message = verify_chain(self.engine.log.path)
        (messagebox.showinfo if ok else messagebox.showwarning)(
            "Log integrity", f"{'Intact' if ok else 'PROBLEM'}\n\n{message}")

    def open_log_folder(self) -> None:
        webbrowser.open(str(Path(self.engine.log.path).parent))

    def open_config(self) -> None:
        if self.config_obj.path:
            webbrowser.open(str(self.config_obj.path))

    # ---------------------------------------------------------- status panel
    def _refresh_status(self) -> None:
        status = self.engine.status()
        self.status_text.configure(state="normal")
        self.status_text.delete("1.0", "end")
        self.status_text.insert("end", json.dumps(status, indent=2))
        self.status_text.configure(state="disabled")
        self.after(3000, self._refresh_status)

    def save_settings(self) -> None:
        self.config_obj.set("response.mode", self.mode_var.get())
        self.config_obj.set("response.auto_kill", bool(self.auto_kill.get()))
        self.config_obj.set("response.auto_quarantine", bool(self.auto_quarantine.get()))
        self.config_obj.set("response.auto_firewall", bool(self.auto_firewall.get()))
        self.config_obj.set("response.auto_block_domains", bool(self.auto_block_domains.get()))
        self.config_obj.set("response.action_threshold", int(self.threshold.get()))
        for key, var in self.monitor_vars.items():
            self.config_obj.set(f"protection.{key}", bool(var.get()))
        self.config_obj.set("scan.on_schedule", bool(self.scan_schedule.get()))
        self.config_obj.set("scan.interval_minutes", int(self.scan_interval.get()))
        self.config_obj.save()
        self.engine.aggregator.action_threshold = int(self.threshold.get())
        self.set_status("Settings saved.")

    def set_status(self, text: str) -> None:
        self.statusbar.configure(text=text)

    def on_close(self) -> None:
        if self.engine.started_at and not messagebox.askyesno(
                "Quit Candy", "Protection is running. Stop it and quit?"):
            return
        try:
            self.engine.stop()
        except Exception:  # noqa: BLE001
            pass
        self.master.destroy()


def main(config_path: str | None = None) -> int:
    root = tk.Tk()
    try:
        ttk.Style().theme_use("vista")
    except tk.TclError:
        pass
    app = App(root, config_path)
    if not app.config_obj.get("ui.start_minimized", False):
        root.deiconify()
    root.mainloop()
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
