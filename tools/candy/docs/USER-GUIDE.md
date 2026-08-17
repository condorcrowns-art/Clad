# Candy — plain-English user guide

This guide assumes no security background. If you can install a game, you can run this.

---

## 1. What this program actually does

It watches your PC for the kind of programs people use to cheat in Roblox — "executors",
"injectors", "exploits" — and pops up a warning the moment it sees one. Those programs
are the most common way Roblox accounts get stolen: many of them are bundled with
password stealers, and even the honest ones ask you to turn off your antivirus.

Candy tells you. It does not automatically nuke things unless you ask it to.

**Important:** it watches *your* computer. It cannot tell you whether another player in
a game is cheating.

---

## 2. Getting it running

1. Put `Candy.exe` in a folder you like — Desktop is fine. There is no installer and
   nothing is added to Windows.
2. **Right-click it → Run as administrator.** It works without this, but it can see less.
3. Windows may show a blue "Windows protected your PC" box. That appears for any program
   without a paid code-signing certificate, which this free project does not have. Click
   **More info → Run anyway** if you built or downloaded it from a source you trust.
4. The window opens showing "Protection stopped". Click **Start protection**.

That's it. The dot turns green and it starts watching. Candy also puts a shield icon in the
notification area (bottom-right, near the clock) and pops up a desktop notification when it
sees something serious — so you do not have to keep the window open.

### Strongly recommended: install Sysmon

Sysmon is a free tool from Microsoft. Candy works without it, but with it Candy can see
things no ordinary program can: code being injected into Roblox as it happens, and drivers
being loaded (which is how the most serious cheats and rootkits work).

1. Download Sysmon from Microsoft Sysinternals (search "Microsoft Sysmon download" — it is
   on microsoft.com, and it is free).
2. Unzip it, then in an administrator Command Prompt run: `sysmon64 -accepteula -i`
3. Restart Candy. Run `Candy.exe doctor` and you should see `sysmon : installed`.

Nothing is sent anywhere; Sysmon writes to a local Windows event log that Candy reads.

---

## 3. Reading a warning

Warnings appear in the **Threats** tab, newest at the top, colour-coded:

| Colour | Level | What to do |
|---|---|---|
| Grey | info | Nothing. It is noting something mildly unusual. |
| Blue | low | Glance at it. Common for installers and downloads. |
| Orange | medium | Look at the file name and path. Do you recognise it? |
| Red | high | Very likely an executor. Act. |
| Dark red | critical | Something is being injected into Roblox, or your antivirus was tampered with. Act now. |

Click any row to see the full detail underneath: which file, which process, which rule
matched, and why.

### If you see a red or dark-red warning

1. **Close Roblox.**
2. Select the warning and click **Kill process** (if it names one) and
   **Quarantine file** (if it names a file). Quarantine is reversible.
3. **Change your Roblox password** from a different device, and turn on 2-Step
   Verification in Roblox settings.
4. Run a full scan with Microsoft Defender (Windows Security → Virus & threat protection
   → Scan options → Full scan).

If the warning says an antivirus service *disappeared*, treat that as serious: something
turned off your protection. Reboot, check Windows Security is on, then run that full
scan.

---

## 4. "It flagged something I installed on purpose"

That happens — cheat tools and ordinary tools sometimes look alike from the outside.
Select the detection and click **Trust this (whitelist)**. Candy stops reporting it,
permanently, and records the choice in `config/config.json`.

Only do this for software **you** installed and recognise. "A YouTube video told me to
whitelist it" is exactly how the bad case starts.

---

## 5. Letting it act on its own

Out of the box Candy only watches and warns. To let it act:

1. Go to **Settings**.
2. Choose **Enforce**.
3. Tick what it may do: terminate the process, quarantine the file, block the IP.

Run in the default Observe mode for a few days first. If it is quiet, or only flags
things you understand, switch to Enforce with confidence. Critical Windows processes are
never terminated regardless of settings.

---

## 6. The other tabs

* **Status** — a live report of what is running. Useful when asking for help: copy the
  whole thing into your question.
* **Log** — everything that has happened, saved to `logs/candy.jsonl`. **Verify
  integrity** checks that nothing has quietly edited or deleted entries.
* **Quarantine** — everything Candy moved out of harm's way. **Restore** puts a file
  back exactly as it was; **Delete permanently** is final.
* **Whitelist / Blacklist** — everything you have trusted or banned, editable by hand.

---

## 7. Starting it automatically

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1 -AutoStart
```

That adds a shortcut to your Startup folder. To undo: press `Win+R`, type `shell:startup`,
delete the Candy shortcut.

---

## 8. Uninstalling

Delete the folder. That is the whole uninstall — no services, no registry keys, no
scheduled tasks. Remove the Startup shortcut too if you created one.

If Candy added Windows Firewall rules (only if you asked it to block an IP), remove
them with `Candy.exe list show` to find the IPs, then, as administrator:

```powershell
netsh advfirewall firewall delete rule name="Candy Block <ip> (out)"
netsh advfirewall firewall delete rule name="Candy Block <ip> (in)"
```

---

## 9. What it cannot do

Please read this part; it is short.

* It cannot **stop** a cheat that loads as a Windows driver. With Sysmon installed it will
  *tell you* the driver loaded, which is most of the value — but blocking it would need a
  driver of Candy's own, and those cost money to sign.
* It cannot beat something that is **already running with administrator rights** and
  actively hunting for it.
* It cannot catch an executor whose name it has never seen **and** which does nothing
  else suspicious. The module audit is the main defence against renamed tools.
* It is not a replacement for **Microsoft Defender** — run both.

Think of it as a doorbell camera, not a lock. It tells you something happened, quickly,
with a record you can go back to.

---

## 10. Getting help

Include this when you ask:

```powershell
Candy.exe status > status.txt
Candy.exe log --detections-only --limit 50 > detections.txt
```

Both files are plain text, contain no passwords, and are safe to share — check the file
paths in them first if any are private.
