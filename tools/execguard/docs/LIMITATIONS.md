# Threat model and limitations

The most valuable thing a security tool can publish is an accurate statement of what it
does not do. This is that statement.

---

## 1. Attacker model

ExecGuard is designed against **one specific adversary**: a Roblox executor and its
loader, running as the logged-in user, distributed to people who install it voluntarily
and often ship it bundled with an infostealer.

It assumes the attacker:

* runs at the same integrity level as ExecGuard (medium, or high if you elevate both),
* is not specifically targeting ExecGuard by name,
* is packaged and named recognisably, or behaves recognisably (DLL injection into
  Roblox, disabling Defender, running from `%TEMP%`).

It explicitly does **not** defend against:

* a kernel-mode driver — including the "manual mapper" drivers some paid cheats use,
* an attacker with SYSTEM or administrator rights hunting for security tools,
* a supply-chain compromise of ExecGuard itself or its threat feed,
* anything that runs before ExecGuard starts and cleans up after itself.

Any user-mode tool that claims otherwise is overstating its reach.

---

## 2. Requested features that cannot be delivered for free, and why

### Protected Process Light (PPL)

**Requested:** register ExecGuard as a Protected Process Light so it cannot be
terminated.

**Reality:** Windows grants the `PsProtectedSignerAntimalware` level only to binaries
signed with a Microsoft-issued **ELAM (Early Launch Anti-Malware)** certificate. Getting
one requires:

1. an EV code-signing certificate (a few hundred dollars a year, hardware token, company
   identity verification), then
2. an ELAM certificate issued by Microsoft, which requires membership in the **Microsoft
   Virus Initiative** — an application process with technical and business requirements
   an individual cannot meet.

There is no free or unofficial route. `RtlSetProcessIsCritical` is not a substitute: it
does not protect the process, it bluescreens the machine when the process dies. Attempts
to "self-protect" by opening a handle to yourself and stripping permissions are trivially
defeated by any caller with `SeDebugPrivilege`.

**What ExecGuard does instead:**

* `SetProcessMitigationPolicy(ProcessExtensionPointDisablePolicy)` — blocks legacy
  AppInit_DLLs and `SetWindowsHookEx` injection into ExecGuard itself. This is the one
  mitigation policy that is safe for a Python-hosted process; `MicrosoftSignedOnly`
  binary-signature policy and dynamic-code prohibition would terminate the interpreter.
* Anti-debug checks (`IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, and
  `NtQueryInformationProcess(ProcessDebugPort)`, which catches a patched PEB flag), which
  raise a **critical** detection rather than trying to evade the debugger.
* A hash-chained log, so being killed leaves evidence: the log simply stops, and any
  attempt to edit it out fails verification.
* A named mutex to keep two instances from fighting.

That is genuinely all that is available without money. The honest summary: **ExecGuard
can be killed by anything running at your privilege level. It is built so that killing it
is noisy, not impossible.**

### Detours / API hooking of other processes

**Requested:** use Microsoft Detours or similar for API hooking.

**Reality:** hooking another process's API calls requires injecting a DLL into it. That
means ExecGuard would perform the exact operation it exists to detect — and:

* Roblox's Hyperion anti-cheat would treat it as an attack on the client,
* third-party antivirus would flag ExecGuard as an injector (correctly),
* any executor resolving syscalls directly, or unhooking `ntdll` from a fresh mapping,
  walks straight past the hook,
* a crash in an injected hook crashes the host process, i.e. the user's game.

The cost is high, the benefit is low, and the technique is a liability. ExecGuard audits
the *outcome* instead: it enumerates modules loaded inside Roblox processes and reports
foreign ones, with Authenticode status. That check does not care what the executor is
called or how it injected.

---

## 3. Detection gaps you should know about

| Gap | Consequence | Mitigation in the design |
|---|---|---|
| Very short-lived processes | A loader that runs for 200 ms can exit between poll cycles | WMI `Win32_ProcessStartTrace` narrows the window to near-zero when `wmi`/`pywin32` are installed; it does not close it |
| Renamed executables | Name signatures miss `notavirus.exe` | Module audit, masquerade check, unsigned-in-`%TEMP%` heuristic, hash matching |
| Packed or freshly compiled samples | No hash match, no name match | Behavioural signals only — this is the real limit of signature-based detection |
| Access-denied processes | Elevated processes are opaque to an unelevated ExecGuard | Status reports the degradation; run as administrator |
| Memory-only payloads | Nothing lands on disk for the file watcher | Module audit may still see the loaded DLL; reflectively loaded modules that unlink themselves from the PEB will not appear |
| Encrypted C2 over CDNs | IP blocking hits shared infrastructure | Endpoint list ships empty; blocking is opt-in and reversible |

---

## 4. Deliberate design decisions

* **The shipped hash and endpoint lists are empty.** Unverified hashes cause false
  positives, and false positives in a tool that can quarantine files are worse than a
  missed detection. Everything shipped is a name or behaviour signature you can read and
  judge for yourself in `data/threats.json`.
* **Observe mode is the default.** A tool that starts killing processes on first run,
  based on signatures it has never been tested against on *your* machine, is a hazard.
* **Whitelist beats everything.** Including the user blacklist and every heuristic. The
  user is the authority on their own machine.
* **Critical OS processes are never terminated.** A bad regex should cost a false alert,
  not an unbootable system.
* **Threat feeds must be HTTPS.** An attacker who can MITM a plain-HTTP feed could
  whitelist themselves or blacklist `explorer.exe`.
* **Reputation lookups are off by default.** They send a hash or an IP to a third party.
  That is a privacy decision the user should make deliberately, not discover later.

---

## 5. Known false-positive sources

* Game launchers and mod managers that inject their own overlays (Discord, Steam,
  MSI Afterburner, RivaTuner) will appear as foreign modules inside other processes.
  Whitelist them by path.
* Installers legitimately drop randomly named executables into `%TEMP%` — the
  `generic.temp-exe` and `generic.rat-names` signatures are rated `low` and `info`
  precisely because of this.
* `sentinel.exe`, `wave*.exe`, `codex*.exe` and similar names are shared with legitimate
  software; those signatures are anchored or downgraded accordingly. If a legitimate tool
  still trips one, whitelist it and please report it so the signature can be tightened.

---

## 6. If you need stronger guarantees

For an actual security boundary rather than a tripwire, the options are:

* **Microsoft Defender** with tamper protection and cloud-delivered protection on — it
  has the kernel visibility this tool deliberately forgoes, and it is free.
* **Windows Defender Application Control (WDAC)** or **AppLocker** — allow-listing stops
  unknown executables from running at all, which no detection tool can match.
* **A separate user account** for gaming, without administrator rights.
* **Roblox 2-Step Verification**, so a stolen session or password is not enough on its
  own.

ExecGuard is complementary to all four. It is not a substitute for any of them.
