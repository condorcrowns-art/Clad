# Running Candy on Windows for the first time

**Read this before running anything.** No part of Candy has ever executed on a
real Windows machine. Every Windows-only path — the audit policy, the ACL
lockdown, the clipboard hooks, the signature reader — is written and unit-tested
but unproven. The order below starts with things that cannot break anything and
works up to things that can.

---

## 1. Get the code

Candy lives in `tools/candy` on the branch `claude/roblox-executor-detection-6z2r6i`.

**With git:**

```powershell
git clone https://github.com/condorcrowns-art/Clad.git
cd Clad
git checkout claude/roblox-executor-detection-6z2r6i
cd tools\candy
```

**Without git:** open the branch on GitHub, use **Code → Download ZIP**, extract
it, and open `tools\candy` inside.

## 2. Install Python

Get Python 3.10 or newer from <https://python.org>. **Tick "Add python.exe to
PATH"** in the installer — most first-run problems are that box being unticked.

Check it:

```powershell
python --version
```

## 3. Install the dependencies

```powershell
python -m pip install -r requirements.txt
```

`psutil` is the only one that really matters. `watchdog`, `WMI` and `pywin32` are
optional and make monitoring event-driven rather than polled. Everything is free
and none of it needs an account.

## 4. Prove it works before trusting it

```powershell
python -m unittest discover -s tests
python run.py selftest
python run.py coverage
```

Expect 506 tests passing and 34/34 on the coverage self-test. If the unit tests
fail on Windows, **stop and send me the output** — they pass on Linux, so a
failure here is a real platform bug and not something you did.

---

## 5. Safe commands — these only read

Run these in a **normal** (non-administrator) prompt first. None of them change
anything on the machine.

```powershell
python run.py doctor                 # the big one: full diagnostic, includes selfcheck
python run.py selfcheck              # Candy's own file permissions
python run.py status                 # what is configured
python run.py level                  # the four protection levels, and which you are on
python run.py extensions             # audit installed browser extensions
python run.py credguard stores       # what credential stores exist here (reads only)
python run.py credguard status
python run.py clipboard status
python run.py fullscan --profile quick --minutes 5
python run.py explain "C:\path\to\some.exe"
```

**Please paste me the output of `doctor`, `selfcheck` and `coverage`.** Those
three tell me more about whether this actually works than anything I can do from
here.

## 6. The GUI

```powershell
python run.py
```

No arguments opens the window. Everything the CLI does is in there. It has never
been rendered — if the layout is broken, a screenshot is worth more than a
description.

---

## 7. Commands that change your machine

From here on, run PowerShell **as administrator** (right-click → Run as
administrator). Do these **one at a time**, and check the machine still works
between each.

### Start here — the recommended posture

```powershell
python run.py level standard --dry-run   # see exactly what would change
python run.py level standard             # apply it
```

### Then, if standard behaved itself

```powershell
python run.py baseline save              # snapshot startup while the machine is clean
python run.py credguard arm              # watch your Roblox/browser/Discord sessions
python run.py trust pin                  # pin the builds behind anything you whitelist
python run.py clipboard probe            # bait a clipboard hijacker (restores your clipboard)
```

### Riskier — understand these before running them

| Command | What can go wrong |
|---|---|
| `selfcheck --fix` | Runs `icacls /inheritance:r` on Candy's folders. **Never tested.** If it misbehaves you may need an admin prompt to regain access to the Candy folder. Back the folder up first. |
| `firewall lockdown` | Blocks all outbound traffic except your allowlist. Reverts itself after 2 minutes unless you run `firewall confirm` — so if it breaks your internet, just wait. Run `firewall learn` first. |
| `kernel harden RobloxPlayerBeta.exe` | Windows will refuse to load unsigned DLLs into Roblox. Breaks DLL-based mods and overlays. Undo: `kernel unharden RobloxPlayerBeta.exe`. |
| `netharden apply` | Changes system DNS and browser policy. Undo: `netharden revert`. |
| `level fortress` | Rejects **every** unsigned download. A lot of legitimate small software is unsigned. |
| `panic` | All of the above at once. |
| `autostart` | Installs the boot task **as SYSTEM**. Run `selfcheck` first — a writable Candy folder plus a SYSTEM boot task is a privilege-escalation setup. |

### Undo everything

```powershell
python run.py revert          # dry run — shows what would be undone
python run.py revert --yes    # actually undo it
```

That reverses hosts entries, firewall rules, IFEO blocks, DNS, browser policy,
ASR, mitigations and the boot task. Quarantined files and logs are kept
deliberately — they are evidence.

---

## 8. Optional: install Sysmon

Sysmon is free, from Microsoft, and it is the difference between guessing and
seeing. Without it Candy has **no injection telemetry at all** — it cannot see a
remote thread created inside Roblox.

Download Sysmon from Microsoft Sysinternals, then:

```powershell
sysmon -accepteula -i
```

Re-run `python run.py doctor` afterwards; it will report the Sysmon channel as
available.

## 9. Optional: build a single .exe

```powershell
python -m pip install pyinstaller
powershell -ExecutionPolicy Bypass -File build.ps1
```

Produces a portable `Candy.exe` with no Python needed on the target machine.

---

## If something goes wrong

1. `python run.py revert --yes` undoes system changes.
2. `python run.py doctor --out report.txt` collects everything I need.
3. Deleting the Candy folder removes the rest — it does not install into Program
   Files or register a service unless you ran `autostart`.

Send me the doctor report and the exact command you ran. "It broke" is much
harder to fix than a stack trace.
