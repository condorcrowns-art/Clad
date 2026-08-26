# Candy

Detects Roblox executors (Synapse-style injectors, KRNL, Fluxus, Potassium and friends),
the stealer malware that ships with them, and the injection they perform — and tells you
the moment it sees one.

**Proprietary software. All rights reserved.** Not open source; see [LICENSE](LICENSE).

Candy ships no kernel driver of its own, and instead reads kernel-sourced telemetry from
drivers Microsoft already signed and shipped (Sysmon, Defender) when they are present —
so it sees remote-thread injection, driver loads and process tampering at kernel level
without the liability of running third-party code in ring 0. Runs on Windows 10/11; the
detection core also runs (with reduced visibility) anywhere Python does, which is how it
is unit-tested.

```
python run.py            # graphical interface
python run.py run        # console monitor
python run.py scan       # one-off scan
python run.py selftest   # prove the detection pipeline works
```

---

## Read this before you install it

Candy is a **tripwire, not an anti-cheat**. Being honest about the boundary is more
useful than a longer feature list:

| It can | It cannot |
|---|---|
| Notice a known executor being downloaded, extracted, or launched | Stop a determined attacker who is already running as administrator |
| See remote-thread injection into `RobloxPlayerBeta.exe` — reported by the kernel, via Sysmon | Enforce anything inside Roblox. Roblox runs its own anti-cheat and accepts no third-party verdicts |
| **See an unsigned kernel driver load** — how kernel-mode cheats arrive | Block that driver. Seeing it is user-mode; stopping it needs a driver Candy cannot legally ship |
| Identify a renamed executor from the version resource inside the binary | Identify a *rebuilt* executor with all metadata stripped and no known behaviour |
| Catch Defender being switched off, and exclusions being added | Prevent an executor that starts *before* Candy does |
| Terminate a process, quarantine a file, block an IP or a whole website — on your say-so | Resist a process running with higher privileges than itself |
| Check a URL or domain against the threat database and VirusTotal | Filter web page *content* — there is no browser extension or proxy |
| Keep a tamper-evident forensic log | Detect *other players* cheating in a game you are playing |

### Why there is no Candy driver

Loading a kernel driver on Windows 10/11 x64 requires Microsoft attestation signing, which
requires an EV code-signing certificate. There is no free path to one. The alternatives —
test-signing mode (Secure Boot off, undistributable), BYOVD (abusing someone else's signed
driver, which is a malware technique Candy detects), or a leaked certificate (criminal) —
are not products.

So Candy takes the other road: **it reads the kernel telemetry that Microsoft's own signed
drivers already publish.** Install Sysmon (free, from Microsoft Sysinternals) and Candy sees
remote-thread creation, cross-process memory access, image loads with signature status,
driver loads and process tampering — all sourced from kernel mode, none of it requiring a
line of ring-0 code from us. A bug in Candy cannot bluescreen your machine, which is not
true of any homemade anti-cheat driver.

Two further things are **deliberately not implemented**, with reasons:

* **Protected Process Light (PPL) registration.** Windows only grants PPL to binaries
  signed with a Microsoft-issued anti-malware (ELAM) certificate. That requires an EV
  code-signing certificate, a paid Microsoft attestation process, and membership in the
  Microsoft Virus Initiative. There is no free path to it, and any tool claiming
  otherwise is not actually running as PPL. See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
* **Detours-style API hooking of other processes.** To hook another process's API calls
  you must inject a DLL into it — the exact technique Candy exists to detect. It
  would trip Roblox's own anti-cheat, trip third-party antivirus, and be bypassed by any
  executor that resolves syscalls directly. Instead Candy **audits the result**:
  it enumerates the modules loaded inside Roblox and flags the foreign ones. That check
  survives renaming the executor's exe, which name signatures do not.

What Candy *does* provide is fast, legible, local notification with a full audit
trail — enough time to close the game, change your password, and look at what happened —
plus a reactive kill switch: terminate, quarantine, firewall-block, site-block.

**For the precise capability matrix — every block, its mechanism, its timing and how it is
escaped — read [docs/CAPABILITIES.md](docs/CAPABILITIES.md).** Candy is a *reactive*
blocker, not a preventive one, and it is not itself a firewall: it writes rules into the
Windows Firewall.

---

## Install

**New to this? Read [docs/WINDOWS-FIRST-RUN.md](docs/WINDOWS-FIRST-RUN.md).** It
walks the safe order: read-only commands first, machine-changing ones later, and
what each of the risky ones can break.

### Option A — portable exe (nothing to install)

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1     # produces dist\Candy.exe
```

Copy `dist\Candy.exe` anywhere. On first run it creates `config\`, `data\`, `logs\`
and `quarantine\` beside itself. Deleting the folder uninstalls it completely.

### Option B — from source

```powershell
python -m pip install -r requirements.txt
python run.py
```

Or use the guided installer, which also runs the self-test and can add a startup
shortcut:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -DesktopShortcut
powershell -ExecutionPolicy Bypass -File install.ps1 -InstallPath "D:\Tools\Candy" -AutoStart
```

**Requirements:** Python 3.10+ (only for source runs) and `psutil`. `watchdog`, `WMI` and
`pywin32` are optional — without them Candy polls instead of receiving instant
events, which is slower but fully functional.

**Run as administrator** for full visibility: without elevation Windows hides other
users' processes, the system-wide connection table, and firewall rule creation.
Candy runs unelevated too, and says so in its status when it is limited.

---

## Using it

### The GUI

Everything the CLI can do, the window can do. Nothing here requires a terminal.

| Tab | What it is for |
|---|---|
| **Threats** | Live detections, newest first. Select one to see the full evidence, then Kill / Quarantine / Block IP / Trust. |
| **Scan** | On-demand full-system scan (quick / full / deep) with a time budget and a working Cancel. Results are sortable by severity; each one can be explained, quarantined, killed or trusted. |
| **Protection** | Every system-level control in one page: download-guard policy, ad and tracker blocking, the local DNS resolver, network hardening, Defender ASR and process mitigations, default-deny firewall, PANIC, and **Undo every change**. Live status for each. |
| **Extensions** | Browser extension audit — what each installed extension asked for, and which combinations can take a Roblox account without a password. |
| **Tools** | Explain a file, check a link before opening it, run the detection self-test, show the technique matrix, verify Candy's own files. |
| **Status** | Live JSON: what is running, what is degraded, how many processes/files/connections have been checked. |
| **Log** | The forensic log, plus a one-click integrity check of its hash chain. |
| **Whitelist / Blacklist** | Add or remove names, paths, hashes, IPs and patterns. Saved to `config.json` immediately. |
| **Quarantine** | Everything quarantined, with restore and permanent-delete. |
| **Settings** | Response mode, automatic actions, which monitors run, scheduled scans. |

Every action that changes the machine — lockdown, panic, network hardening, quarantine,
revert — asks before it does anything, and says what it will do in plain language. Long
jobs run on a background thread, so the window stays usable while a deep scan runs.

### The command line

```powershell
Candy.exe doctor                  # full diagnostic report — paste this when asking for help
Candy.exe run                     # monitor in the console until Ctrl+C
Candy.exe run --enforce           # ...and act on detections this run
Candy.exe scan                    # scan processes + the watched folders
Candy.exe scan "C:\Users\me\Downloads"
Candy.exe status                  # JSON status
Candy.exe log --detections-only   # recent detections from the log
Candy.exe verify-log              # is the log intact?
Candy.exe quarantine list
Candy.exe quarantine restore "quarantine\<file>.quarantined"
Candy.exe list add whitelist names "MyGameLauncher.exe"
Candy.exe list add blacklist ips 203.0.113.5
Candy.exe site block bad-executor.gg     # hosts-file sinkhole + firewall rules
Candy.exe site unblock bad-executor.gg
Candy.exe site list
Candy.exe scan-url https://bad-executor.gg/download --block
Candy.exe firewall learn --seconds 300 --apply   # build an allowlist from real behaviour
Candy.exe firewall lockdown                      # default-deny outbound, auto-reverts in 120s
Candy.exe firewall confirm                       # keep it
Candy.exe firewall verify                        # revoke any binary that changed on disk
Candy.exe key generate                           # post-quantum (LMS) signing key
Candy.exe sign threats.json                      # sign a threat feed
Candy.exe verify-file threats.signed.json
Candy.exe triage suspicious.exe                  # read a payload without running it
Candy.exe prevent block krnl.exe                 # stop it launching at all (IFEO)
Candy.exe prevent contain "C:\path\thing.exe"    # cut it off the network, keep it running
Candy.exe integrity seal / verify                # measured start, signed baseline
Candy.exe integrity platform                     # Secure Boot / TPM / HVCI state
Candy.exe guard downloaded.exe --policy fortress  # would this download be rejected?
Candy.exe check-url https://roblox.com.claim-robux.xyz/login   # phishing analysis, no feed
Candy.exe adblock on                             # ad / tracker / malvertising blocking
Candy.exe adblock import https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
Candy.exe panic                                  # break glass: maximum lockdown
Candy.exe kernel asr --mode audit                # kernel-enforced ASR rules, report-only first
Candy.exe kernel harden RobloxPlayerBeta.exe     # kernel anti-injection mitigations
Candy.exe netharden apply --resolver quad9       # DNS + browser policy + protocol hardening
Candy.exe netharden revert                       # undo all of it
Candy.exe autostart install                      # run at boot as SYSTEM
Candy.exe dns on                                 # local filtering resolver (wildcards + live phishing)
Candy.exe dns run --port 5354                    # run it in the foreground to watch queries
Candy.exe dns test roblox.com.free-robux.tk      # would this be blocked?
Candy.exe coverage --matrix                      # all 54 techniques and Candy's coverage of each
Candy.exe coverage                               # prove it: run the self-test
Candy.exe fullscan --profile quick               # find malware already on the machine
Candy.exe fullscan --profile full --minutes 30 --out report.json
Candy.exe fullscan --profile deep --act          # every drive, and act on what it finds
Candy.exe extensions                             # audit browser extensions
Candy.exe explain suspicious.exe                 # why was this flagged? full reasoning
Candy.exe trust pin                              # pin the builds behind your whitelist
Candy.exe trust check                            # has anything you trusted been replaced?
Candy.exe trust check --revoke                   # stop trusting whatever changed
Candy.exe trust accept newbuild.exe              # record a new version as known-good
Candy.exe trust history                          # every build seen, and what each can do
Candy.exe level                                  # list the four protection levels
Candy.exe level strict                           # apply one
Candy.exe level fortress --only downloads        # apply one area of one level
Candy.exe credguard arm                          # watch your session and password files
Candy.exe credguard status                       # what is watched, and what decoys are planted
Candy.exe baseline save                          # snapshot what runs at startup
Candy.exe baseline diff                          # what has been added since
Candy.exe clipboard probe                        # bait a clipboard hijacker
Candy.exe posture                                # one answer: is this machine protected?
Candy.exe import                                 # bring settings over from an older Candy folder
Candy.exe import --yes                           # actually copy them
Candy.exe selfupdate check                       # is there a newer Candy?
Candy.exe selfcheck                              # Candy's own security posture
Candy.exe selfcheck --fix                        # lock its folders to SYSTEM + Administrators
Candy.exe revert                                 # dry run: what would be undone
Candy.exe revert --yes                           # undo every system change Candy made
Candy.exe update --url https://raw.githubusercontent.com/<you>/<repo>/main/threats.json
Candy.exe submit --name "Nova Executor" --target process_name --pattern "re:^nova\.exe$" --severity high
```

`scan` exits with status 1 when it finds something, so it drops straight into a
scheduled task or CI check.

### Response modes

Candy starts in **observe** mode: it detects, logs and alerts, and changes nothing.
That is the right default — a fresh signature set on an unfamiliar machine will produce
false positives, and you want to see them before anything gets killed.

Switch to **enforce** in Settings (or `--enforce`) once you trust the output. Enforce
mode only acts when a subject's *aggregated* score reaches `response.action_threshold`
(default 75 = one high-confidence signal such as a named executor or an injected module,
or two medium ones), and only for the actions you tick: terminate, quarantine,
firewall-block. Raise it to 100 if you want two signals before anything happens.

Critical OS processes on `response.protected_processes` are never terminated, whatever
the score. A bad signature should cost you a false alert, not a boot loop.

---

## How detection works

Five collectors feed one scoring engine:

```
 process monitor ─┐                            ┌─ log (hash-chained JSONL)
 file watcher  ───┤                            ├─ GUI / console alert
 network monitor ─┼─→ Analyzer ─→ Aggregator ──┤
 behaviour engine ┤   (signatures  (score per  └─ Responder (kill / quarantine
 on-demand scan ──┘    + heuristics) subject)                 / firewall block)
```

* **Kernel event monitor** — reads `Microsoft-Windows-Sysmon/Operational`,
  `Microsoft-Windows-Windows Defender/Operational` and the Security channel through
  `wevtutil` (part of Windows). Maps `CreateRemoteThread` into Roblox, handles opened with
  memory-write rights, unsigned image loads, **unsigned driver loads**, process tampering,
  Defender being disabled, and Defender exclusions. This is the kernel-level layer.
* **Process monitor** — WMI `Win32_ProcessStartTrace` when available (instant), psutil
  polling otherwise. Checks names, image paths, command lines and SHA-256 hashes.
* **PE inspector** — reads the version resource inside Windows binaries. A file renamed
  from `krnl.exe` to `homework.exe` still declares its original name internally, and that
  gets matched against the threat database. Also measures section entropy to spot packed
  payloads.
* **Persistence auditor** — Run keys, Startup folders, scheduled tasks, services, Winlogon
  and Image File Execution Options. The stealer bundled with an executor has to survive a
  reboot, and there are only so many places to hide.
* **File watcher** — watchdog events or a directory diff over Downloads, Desktop,
  Documents, `%TEMP%`, `%APPDATA%` and the Roblox folder. Hashes new executables and
  matches them against the database.
* **Network monitor** — diffs the connection table, flags blacklisted endpoints and
  loader-style listening ports. Optional AbuseIPDB/VirusTotal lookups (your own free
  key, off by default).
* **Behaviour engine** — audits modules loaded inside Roblox processes (the injection
  check), watches sustained CPU and handle counts, notices when an antivirus service
  that *was* running disappears, and runs anti-debug checks on Candy itself.
* **Aggregator** — scores per subject: info 5, low 20, medium 45, high 75, critical 100.
  Repeat hits from the same signature count once, so three *different* weak signals are
  what escalate, not one signal firing every poll.

Severity is assigned by evidence quality. "The process is named `krnl.exe`" is high.
"An unsigned DLL is loaded inside RobloxPlayerBeta.exe" is critical. "An executable is
running from `%TEMP%`" is low, because installers do that all day.

---

## The threat database

`data/threats.json` — plain JSON, readable and diffable, no binary blob:

```json
{
  "id": "exec.krnl",
  "name": "KRNL",
  "target": "process_name",
  "pattern": "re:^krnl(bootstrapper|loader|ui)?\\.exe$",
  "severity": "high",
  "description": "KRNL executor client or bootstrapper."
}
```

`target` is one of `process_name`, `process_path`, `cmdline`, `file_name`, `file_path`,
`module_name`, `window_title`, `remote_host`. `pattern` is a literal substring unless it
starts with `re:`, in which case it is a case-insensitive regular expression.

**The shipped `hashes` and `endpoints` maps are empty on purpose.** A hash list is only
worth anything if every entry was verified against a real sample; shipping invented or
second-hand hashes produces false positives that quarantine innocent files. Add your own
verified entries, or point `updates.threat_feed_url` at a community feed you trust
(HTTPS only — an attacker who can MITM your feed could otherwise blacklist
`explorer.exe`).

Contribute a new executor:

```powershell
Candy.exe submit --name "Nova Executor" --target process_name \
  --pattern "re:^nova\.exe$" --severity high \
  --description "Confirmed sample, injects nova.dll into RobloxPlayerBeta" --out nova.json
```

Then open a pull request adding it to the feed repository. See
[docs/CONTRIBUTING-SIGNATURES.md](docs/CONTRIBUTING-SIGNATURES.md).

---

## Configuration

Everything lives in `config/config.json`, and every key has a working default — the file
is created for you on first run. The blocks you are most likely to touch:

| Key | Default | Meaning |
|---|---|---|
| `response.mode` | `observe` | `observe` = log only, `enforce` = act |
| `response.auto_kill` / `auto_quarantine` / `auto_firewall` | `false` | Which actions enforce mode may take |
| `response.action_threshold` | `75` | Aggregated score required to act (high = 75, medium = 45) |
| `response.protected_processes` | OS list | Never terminated, whatever happens |
| `paths.watch` | Downloads, Desktop, Documents, `%TEMP%`, `%APPDATA%`, Roblox, Public | Folders the file watcher covers |
| `whitelist.names` / `paths` / `hashes` / `ips` | mostly empty | Always trusted — beats every blacklist and heuristic |
| `blacklist.names` / `hashes` / `ips` / `patterns` | empty | Your own additions, scored critical |
| `behavior.protected_targets` | Roblox client + studio | Processes whose loaded modules are audited |
| `winevents.channels` | all on | Which kernel event channels to read (sysmon / defender / security) |
| `persistence.interval_minutes` | `15` | How often autostart locations are re-audited |
| `pe.inspect` | `true` | Read version resources and entropy from binaries |
| `notifications.min_severity` | `high` | Severity that raises a desktop toast |
| `response.auto_block_domains` | `false` | Let enforce mode sinkhole malicious domains |
| `web.resolve_and_block_ips` | `true` | Also firewall a blocked domain's addresses (DoH ignores the hosts file) |
| `whitelist.domains` / `blacklist.domains` | empty | Domain lists, suffix-matched across subdomains |
| `updates.trusted_public_key` | empty | LMS public key the threat feed must be signed with |
| `updates.require_signature` | `false` | Refuse any feed that is not post-quantum signed |
| `download_guard.policy` | `balanced` | `off` / `balanced` / `fortress` — fortress rejects every unsigned internet executable |
| `adblock.enabled` / `categories` | `false` | Ad, tracker and malvertising blocking |
| `phishing.block_score` | `70` | Score at which a link is treated as phishing |
| `intel.enable_lookups` | `false` | Turn on VirusTotal/AbuseIPDB (needs your own free key) |
| `updates.threat_feed_url` | empty | HTTPS URL of a community threat feed |
| `scan.on_schedule` / `interval_minutes` | `false` / `120` | Periodic background scans |

Whitelisting always wins. If Candy flags a tool you installed on purpose, select the
detection and click **Trust this** — or run
`Candy.exe list add whitelist paths "C:\Program Files\MyTool"`.

Environment variables (`%USERPROFILE%`, `%APPDATA%`, …) are expanded at load time, and
relative paths resolve next to the executable, so a portable copy works on any machine
without editing anything.

---

## The forensic log

`logs/candy.jsonl` is append-only JSON Lines. Every record embeds the SHA-256 of the
record before it, so deleting or editing any line breaks the chain from that point on:

```
> Candy.exe verify-log
FAIL logs\candy.jsonl
     chain broken: record claims prev=3f9a1c… but previous record hashes to 88b0e2… (record #147)
```

This does not *prevent* tampering — anything running as you can rewrite the whole file —
but it makes the interesting case, malware quietly snipping out the records about
itself, immediately visible.

Quarantined files are moved into `quarantine/`, XOR-defanged so a double-click cannot
run them, and paired with a `.json` sidecar recording the original path, hash, time and
reason. Restore reverses it byte-for-byte.

---

## Resource use

Measured targets: **under 5% CPU** and **under 100 MB RAM** on an idle desktop. What
keeps it there:

* Whitelisted paths are checked *before* hashing, so system binaries are never hashed.
* Image hashes are cached by `(path, mtime, size)`; Authenticode results likewise.
* The file watcher skips `node_modules`, `WinSxS`, `$Recycle.Bin` and friends, caps
  recursion at 6 levels, and only hashes files under 128 MB.
* Repeat signals are deduplicated at the aggregator rather than re-alerting every cycle.

If it is still too heavy on a low-end machine, raise the poll intervals in
`filewatch.poll_interval_seconds`, `network.poll_interval_seconds` and
`behavior.poll_interval_seconds`, or turn a monitor off in Settings.

---

## Development

```bash
python -m unittest discover -s tests -v     # 506 tests, no pytest required
python run.py coverage                     # technique self-test: 34/34 detected
python run.py selftest                      # end-to-end pipeline check
```

The detection core (`config`, `detect`, `threatdb`, `events`, `eventlog`, `responder`)
is pure Python over plain dictionaries and is tested on any OS. The platform-specific
collectors (`procmon`, `filewatch`, `netmon`, `behavior`, `winapi`) do the OS-specific
work behind that boundary — which is why the tests above run on Linux in CI and still
mean something.

```
candy/
  config.py      configuration, whitelist/blacklist model
  winevents.py   Sysmon/Defender/Security channel consumer  ← kernel-sourced detection
  netblock.py    hosts-file site blocking, reversible and backed up
  firewall.py    default-deny outbound, hash-bound allowlist, panic rollback
  pqsign.py      RFC 8554 LMS post-quantum signatures, pure stdlib
  vault.py       AES-256-GCM (FIPS 197 / SP 800-38D) + DPAPI machine binding
  prevent.py     IFEO execution blocking, per-program network containment
  anomaly.py     beacon / fan-out timing analysis
  triage.py      static payload analysis: imports, strings, exfil sinks
  integrity.py   signed self-measurement, platform trust reporting
  guard.py       download rejection: Mark-of-the-Web, archives, fortress policy
  drift.py       trust pinned to a build + per-program capability lineage
  credguard.py   SACL auditing + decoys on the files that hold your sessions
  levels.py      one protection dial, six independently applicable areas
  baseline.py    autostart snapshot and diff — what is new since known-good
  clipboard.py   clipper detection, passive and by active decoy
  selfupdate.py  signed, hash-pinned, staged self-update (unconfigured by design)
  selfprotect.py Candy's own attack surface: directory ACLs and posture checks
  adblock.py     ad / tracker / malvertising hosts blocking, importable lists
  phishing.py    homograph, typosquat and bait analysis with no feed
  kernelpolicy.py  ASR rules, process mitigations, WDAC — enforced by Windows' kernel
  netharden.py   filtering DNS, forced browser DoH, URL policy, protocol hardening
  dnsproxy.py    local DNS filtering resolver with live phishing analysis
  coverage.py    54-technique coverage matrix and the self-test harness
  fullscan.py    on-demand system scan: processes, modules, persistence, files, streams
  browserscan.py browser extension auditing by declared permissions
  uninstall.py   reverts every system change, dry run by default
  pe.py          PE version-resource + entropy inspection
  persistence.py Run keys, tasks, services, Winlogon, IFEO
  notify.py      tray icon and toasts, pure ctypes
  detect.py      analyzer + scoring aggregator      ← the core, fully unit-tested
  threatdb.py    signature database, feed updates
  events.py      Detection type + event bus
  eventlog.py    hash-chained forensic log
  procmon.py     WMI / psutil process monitor
  filewatch.py   watchdog / polling file watcher
  netmon.py      connection table monitor
  behavior.py    module audit, resource abuse, AV tampering, anti-debug
  intel.py       optional VirusTotal / AbuseIPDB
  responder.py   kill, quarantine, firewall
  winapi.py      ctypes: WinVerifyTrust, anti-debug, mitigation policy
  engine.py      wiring, scheduler, status
  gui.py         tkinter interface — scan, protection, extensions, tools
  cli.py         command line
```

Windows-only paths (WMI, `WinVerifyTrust`, `netsh`, mitigation policies) are not covered
by the unit tests — they need a real Windows host. `selftest` is the quick check that
the pipeline is alive on the machine you are actually on.

---

## Getting the most out of it

**Install Sysmon.** It is free, it is Microsoft-signed, and it is the difference between
inferring injection from a module snapshot and being told about it by the kernel the
instant it happens. Candy detects whether it is present and says so in `doctor`.

**Run as administrator.** Without it the Security and Defender channels are unreadable and
other users' processes are invisible.

**Leave it in observe mode for a few days.** Then switch to enforce once you have seen what
it reports on your machine.

## Legal and ethical use

Candy is a defensive tool for **your own machine**, or one you administer with
permission. It reports what it sees locally and takes only the actions you enable. It
does not phone home, upload files, or send anything anywhere unless you explicitly
enable the optional reputation lookups — and those send a hash or an IP, nothing else.

Candy is proprietary software. See [LICENSE](LICENSE) — no license to use, copy,
modify or redistribute it is granted by having access to the source. Third-party
open-source components used by Candy remain under their own licenses, listed there.
