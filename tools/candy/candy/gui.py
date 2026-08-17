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
        ttk.Button(actions, text="Block IP", command=self.action_block_ip).pack(side="left")
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
        ttk.Checkbutton(auto_box, text="Terminate the process", variable=self.auto_kill,
                        command=self.save_settings).pack(anchor="w")
        ttk.Checkbutton(auto_box, text="Quarantine the file", variable=self.auto_quarantine,
                        command=self.save_settings).pack(anchor="w")
        ttk.Checkbutton(auto_box, text="Block the IP in Windows Firewall (needs administrator)",
                        variable=self.auto_firewall, command=self.save_settings).pack(anchor="w")

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
            messagebox.showinfo("Candy", "Select a network detection.")
            return
        ip = detection.remote.rsplit(":", 1)[0]
        if not messagebox.askyesno("Block IP", f"Add Windows Firewall rules blocking {ip}?"):
            return
        result = self.engine.responder.block_ip(ip, forced=True, detection=detection)
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
