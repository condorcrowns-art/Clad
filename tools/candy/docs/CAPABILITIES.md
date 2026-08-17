# Candy — exact capability specification

What Candy blocks, what it only detects, and what it cannot see at all. Written to be
argued with: every row says which mechanism does the work and how it is escaped.

**The one-line summary:** Candy is a **reactive blocker**, not a preventive one. It cannot
stop something from starting; it stops it from *continuing*, typically within 1–10 seconds
of the event. It is **not a firewall** — it writes rules into the Windows Firewall, which
is a different thing.

---

## 1. Blocking — what Candy can actually stop

"Enforce" mode plus the matching `auto_*` switch must be on for any of this to happen
automatically. All of it is available on demand from the GUI or CLI at any time.

| # | Capability | Mechanism | Timing | Reversible |
|---|---|---|---|---|
| 1 | **Terminate a process** | `TerminateProcess` via psutil, escalating from terminate to kill, children first | 1–10 s after the triggering event | No — the process is gone |
| 2 | **Quarantine a file** | Move to `quarantine/`, XOR-defang, write a metadata sidecar | Immediate once detected | Yes — `candy quarantine restore` |
| 3 | **Block an IP address** | `netsh advfirewall` inbound + outbound rules | Immediate | Yes — `candy` removes the rule |
| 4 | **Block a website** | Hosts-file sinkhole to `0.0.0.0` **plus** firewall rules for its resolved IPs | Immediate for new connections | Yes — `candy site unblock <domain>` |
| 5 | **Delete a quarantined file** | Permanent removal, user-initiated only | Immediate | No |

### What each block does *not* do

1. **Terminate** — cannot stop the process from having already run. If a stealer executed
   for two seconds before detection, it has already read what it wanted. Terminating an
   elevated process from an unelevated Candy fails with access denied.
2. **Quarantine** — cannot move a file that is currently running or otherwise locked; the
   kill has to land first. Files over 128 MB are not hashed by default (configurable), so a
   large sample may be detected by name or path only.
3. **Block an IP** — needs administrator. Blocks the address, not the service: a threat
   behind Cloudflare shares an address with a lot of legitimate traffic, which is exactly
   why the shipped endpoint list is empty and blocking is opt-in.
4. **Block a website** — three documented escapes:
   - a browser with **DNS-over-HTTPS** enabled (Chrome and Firefox default to it on many
     networks) never consults the hosts file. The firewall rules Candy adds alongside it
     are what hold in that case.
   - the site moves to a **new IP** after Candy resolved it. The hosts entry still holds;
     the firewall rule goes stale.
   - a **VPN or proxy** carries the traffic past both.

### What Candy refuses to block, always

- Processes on `response.protected_processes` — `explorer.exe`, `lsass.exe`, `csrss.exe`,
  `svchost.exe`, Defender's `MsMpEng.exe`, and the rest of the OS core.
- Domains on the protected list — `microsoft.com`, `windowsupdate.com`, **`roblox.com`**,
  `rbxcdn.com`, certificate authorities, and similar.
- Anything on your whitelist. Whitelist beats every blacklist, signature and heuristic.

---

## 2. Prevention — what Candy cannot do at all

These need a kernel driver, and a kernel driver needs an EV certificate plus Microsoft
attestation signing. There is no free path to one, so none of this exists in Candy:

| Not possible | Why |
|---|---|
| Stop a process from **starting** | Needs a kernel process-creation callback that can deny |
| Stop a file from **being written or read** | Needs a filesystem minifilter |
| Stop code from **being injected** mid-flight | Needs `ObRegisterCallbacks` to strip handle rights |
| Stop a **driver from loading** | Needs a kernel load-image callback |
| **Filter packets** | Needs a WFP callout driver |
| Make Candy **unkillable** | Needs Protected Process Light, which needs an ELAM certificate |

Candy *sees* every one of those events (see §4) and reacts afterwards. Seeing and reacting
in a second is worth a great deal; it is not the same as preventing, and this document will
never claim it is.

---

## 3. Is it a firewall?

**No.** Precisely:

| Question | Answer |
|---|---|
| Does Candy inspect packets? | No. It has no driver and no WFP callout. |
| Does Candy see traffic contents? | No. No TLS interception, no proxy, no content filtering. |
| Does Candy control connections? | Indirectly — it writes rules into the **Windows Firewall**, which does the enforcing. |
| Granularity of a block? | Whole IP address, both directions. Not per-port, per-process, or per-URL. |
| What does Candy see about traffic? | The connection table (which process, which remote address, which state) via psutil, and DNS queries via Sysmon event 22. |
| Does it work without administrator? | Firewall rules: no. Hosts-file blocks: no. Detection: yes, degraded. |

If you want real packet filtering, Windows Firewall is already on the machine and is free.
Candy's contribution is deciding *what* to tell it to block.

---

## 4. Detection — what Candy sees but cannot stop

This is the largest and most useful category. Everything here raises an alert, a toast and
a log entry, and can trigger the §1 actions afterwards.

### Kernel-sourced (needs Sysmon — free from Microsoft, and worth installing)

| Event | What it catches | Severity |
|---|---|---|
| Sysmon 8 — `CreateRemoteThread` into Roblox | Textbook DLL injection by an executor | critical |
| Sysmon 10 — handle with `PROCESS_VM_WRITE` / `VM_OPERATION` / `CREATE_THREAD` | The handle an injector needs, before it injects | high |
| Sysmon 10 — same, targeting **Candy** | Something attacking the monitor | critical |
| Sysmon 7 — unsigned module loaded into Roblox | The executor's DLL, after injection | critical |
| **Sysmon 6 — unsigned driver load** | **A kernel-mode cheat or rootkit arriving** | critical |
| Sysmon 25 — process tampering | Hollowing, herpaderping, replaced image | critical |
| Sysmon 1 / 11 / 22 | Process creation with hashes, file creation, DNS queries | varies |
| Defender 5001 | Real-time protection switched **off** | critical |
| Defender 1116 / 1006 | Defender's own malware detections | critical |
| Defender 5007 | An exclusion path was added | high |
| Security 4688 | Process creation (needs audit policy enabled) | varies |

### User-mode (always available)

| Check | What it catches |
|---|---|
| Name / path / command-line signatures | 48 shipped signatures: known executors, anti-cheat bypass tooling, Defender-disabling commands, encoded PowerShell, `bcdedit` driver-signature tampering |
| SHA-256 matching | Any hash you or your feed have verified |
| **PE version resource** | A renamed executor — `krnl.exe` renamed to `homework.exe` still declares its original name inside the binary |
| Section entropy | Packed or crypted payloads |
| Module audit | Foreign DLLs inside Roblox, with Authenticode status — the Sysmon-free fallback for injection |
| Roblox masquerade | A process named `RobloxPlayerBeta.exe` running from outside a Roblox install |
| Parent-child | Anything the Roblox client launches; executables in `%TEMP%` launched by a script host |
| Persistence audit | Run keys, Startup folder, scheduled tasks, services, Winlogon shell/userinit, IFEO debugger hijacks |
| Security-product watch | An antivirus service that *was* running has disappeared |
| Connection table | Blacklisted addresses, loader-style listening ports (6969, 13337, …) |
| DNS queries | Lookups of blacklisted or threat-listed domains, suffix-matched across subdomains |
| Anti-debug | A debugger attached to Candy itself |
| Resource abuse | Sustained CPU, excessive handle counts |

---

## 5. Website and file scanning

| Question | Answer |
|---|---|
| Can it scan a URL for malware? | **Yes** — `candy scan-url <url>` checks the local threat database, your blacklist, and (opt-in) VirusTotal's URL and domain reports. |
| Does that need money? | No. VirusTotal's free tier needs an email address, no card. Without a key, the local checks still run. |
| Can it scan the *contents* of a web page? | **No.** Candy has no browser extension, no proxy, no HTML or script analysis. It judges the destination, not the page. |
| Can it block a site it judges bad? | Yes — `candy scan-url <url> --block`, or automatically in enforce mode when a DNS query matches. |
| Can it remove a virus *from a website*? | **No, and nothing running on your PC can.** The files are on someone else's server. Candy can stop your machine reaching it and quarantine anything already downloaded. |
| Can it scan downloaded files? | Yes — automatically in the watched folders, or on demand with `candy scan <path>`. |
| Does it upload my files anywhere? | **No.** Only a hash or a URL string is sent, and only if you enable reputation lookups. Never file contents. |

---

## 6. Latency — how fast it reacts

| Path | Typical delay from event to alert |
|---|---|
| Sysmon event (injection, driver load) | 0–8 s (channel poll interval, configurable) |
| Process start with WMI installed | under 1 s |
| Process start, polling fallback | 0–4 s |
| File created, with watchdog | under 1 s + settle time while the file finishes writing |
| File created, polling fallback | 0–4 s |
| Network connection | 0–5 s |
| Persistence change | 0–15 min (audit interval, configurable) |

A loader that runs for 200 ms and exits can finish before any user-mode monitor sees it.
Sysmon narrows that window to near zero for the *record* of what happened; it does not let
Candy intervene in time.

---

## 7. Requirements for each capability

| Capability | Needs administrator | Needs Sysmon | Windows only |
|---|---|---|---|
| Process/file/name detection | No (limited without) | No | Yes for most signatures |
| Injection detection via module audit | Helps | No | Yes |
| Injection detection via Sysmon 8/10 | **Yes** | **Yes** | Yes |
| Driver-load detection | **Yes** | **Yes** | Yes |
| Defender tamper detection | **Yes** | No | Yes |
| Terminate a process | Only for elevated targets | No | No |
| Quarantine a file | Depends on the file's location | No | No |
| Firewall IP block | **Yes** | No | **Yes** |
| Website block (hosts file) | **Yes** | No | **Yes** |
| URL reputation scan | No | No | No |

---

## 8. Honest bottom line

Candy is a **very good tripwire with a reactive kill switch**. On a machine where the user
voluntarily downloads an executor — which is the actual threat model here — it will:

- notice the download, often before it is run,
- identify it even if renamed,
- see it inject into Roblox,
- see the stealer's persistence go in,
- see Defender being switched off,
- kill it, quarantine it, and cut off the site it came from,

all within seconds, with a tamper-evident record of every step.

What it will not do is stop a competent attacker who already has administrator rights, or
one running in the kernel. For that you need a signed driver, and that needs money. This
document exists so nobody has to guess which side of that line a given feature falls on.

---

## 9. The "military / CNSA 2.0" specification, assessed line by line

This section answers a specific request: build to NSA CNSA 2.0 and post-quantum
requirements. Some of it is genuinely achievable with no budget, some of it is achievable
but pointless in a host firewall, and some of it is impossible without money. Each line
below says which, and what was built instead.

### 1. Post-quantum encryption stack

| Requirement | Verdict | What exists |
|---|---|---|
| **LMS / XMSS stateful hash signatures** | ✅ **BUILT** | `candy/pqsign.py` — full RFC 8554 LMS + LM-OTS in pure Python. Signs the threat feed and any JSON document. CNSA 2.0 approves exactly this family for software/firmware signing, and it needs nothing but `hashlib`. |
| ML-KEM-1024 (Kyber, FIPS 203) | ⚠️ Not applicable | KEM = key *encapsulation*. It secures a tunnel between two endpoints. Candy has no tunnel: it inspects the local machine and writes firewall rules. There is nothing for a KEM to key. Implementing lattice arithmetic to leave it unused would be theatre. |
| ML-DSA-87 (Dilithium, FIPS 204) | ⚠️ Deliberate substitution | Same job as LMS here — signing. Dilithium needs constant-time NTT arithmetic; a pure-Python version would be both slow and side-channel leaky, i.e. *worse* than the hash-based scheme actually chosen. LMS's security reduces to SHA-256 alone. |
| AES-256-GCM | 🔶 Partly | Quarantined files are XOR-defanged, not encrypted. AES-256-GCM for the quarantine store is a reasonable next step (Windows ships CNG/BCrypt, so it stays free). |
| "AES-256 with 512-bit ephemeral keys" | ❌ Not a real thing | AES is defined for 128/192/256-bit keys only. There is no AES-512. CNSA 2.0 itself specifies **AES-256**, which is the ceiling. |
| SHA-512 hashing | 🔶 SHA-256 used | LMS parameter sets are defined over SHA-256; using SHA-512 would put the implementation outside RFC 8554. SHA-256 gives 128-bit post-quantum collision resistance, which exceeds what the signed data needs. |
| Per-packet-bundle key rotation / PFS | ❌ Not applicable | Perfect forward secrecy is a property of a key exchange. Candy performs no key exchange and terminates no traffic. |

**The honest framing:** post-quantum cryptography protects *data in transit and at rest*.
A host firewall's job is *authorisation*, not confidentiality. The one place PQC genuinely
belongs here is authenticating the rules Candy obeys — and that is exactly where it now is.
A signed feed means an attacker who fully controls your network still cannot make Candy
quarantine `explorer.exe`.

### 2. Deep OS integration and execution isolation

| Requirement | Verdict | Reality |
|---|---|---|
| Ring-0 / WFP callout driver | ❌ Impossible for free | A WFP callout is a kernel driver. Kernel drivers need Microsoft attestation signing, which needs a paid EV certificate. No exceptions, no workaround. |
| eBPF hooks | ❌ Wrong platform | eBPF is Linux. Windows eBPF exists as a preview and still loads a signed driver. |
| **Default-deny outbound** | ✅ **BUILT** | `candy/firewall.py` drives Windows Firewall — which *is* a WFP client, in the kernel, already signed by Microsoft — into `blockinbound,blockoutbound` with a per-application allowlist. This is the same enforcement point a callout driver would use, reached from user mode. |
| **Process-to-network binding by hash** | ✅ **BUILT** | An allow rule records the binary's SHA-256 and Authenticode status. `candy firewall verify` re-checks them and revokes access the moment the file changes. An allow rule means "this exact binary", not "this path". |
| Binding by memory signature / parent PID | 🔶 Partial | Parent-process and injected-module checks exist as *detections* (`heuristic.roblox_child`, Sysmon 7/8/10). They cannot gate a connection without a driver. |
| Rust / Ada-SPARK core, formal proofs | ❌ Not done | Candy is Python. Python is memory-safe by construction — no manual allocation, so the buffer-overflow class is absent — but it is not formally verified, and it is not Rust. Worth noting the attack surface is small: Candy parses no untrusted network packets, which is where memory bugs in firewalls actually live. |

### 3. Multi-layered threat defence

| Requirement | Verdict | Reality |
|---|---|---|
| Hardware-virtualised detonation sandbox | ❌ Not feasible | Intercepting a connection to detonate its payload *before packets leave* requires the driver again. Windows Sandbox exists and is free, but only on Pro/Enterprise, and it cannot be inserted into the packet path. |
| Behavioural heuristics | ✅ Built (not neural) | Sustained-CPU, handle-count, injected-module, masquerade, persistence and DNS heuristics with a scoring aggregator. A neural model on an NPU would need training data nobody has for this threat class; the statistical rules are honest about what they are. |
| **Air-gapped telemetry** | ✅ **BUILT, and default** | Candy has no cloud, no account, no server. The only outbound traffic it can ever make is the optional threat-feed fetch and the optional VirusTotal/AbuseIPDB lookups, both off by default. |

### 4. Hardware-rooted trust

| Requirement | Verdict | Reality |
|---|---|---|
| TPM 2.0 key sealing | 🔶 Achievable, not yet built | Windows exposes TPM-backed keys through CNG's Platform Crypto Provider from user mode, so a non-extractable signing key is reachable for free via `ctypes`. Worth doing; the LMS key currently lives in a `0600` file on disk. |
| Measured boot / PCR attestation | ⚠️ Reading only | PCR values can be read (`tpmtool`, TBS API), but *acting* on them at boot means an ELAM driver — the same paid-certificate wall as PPL. |
| **Self-integrity checking** | ✅ Built | Hash-chained audit log with `candy verify-log`, anti-debug detection, config and binary hashing. Tamper-evident, not tamper-proof, and documented as such. |

### Summary

Of the four pillars requested, **two are now real** (post-quantum signing of the rules
Candy obeys; default-deny outbound with hash-bound per-application allow rules), one is
partially real (behavioural defence, air-gapped by design), and one is mostly out of reach
without a signing certificate (hardware-rooted boot trust, ring-0 interception,
detonation sandboxing).

Nothing above was skipped for effort. Every ❌ is a wall made of money or of physics, and
every ✅ was built to the standard actually specified.

### Implementation caveat on LMS

The LMS implementation follows RFC 8554 and is self-consistent — sign, verify, tamper
detection, leaf exhaustion and cross-key rejection are all covered by tests. It has **not**
been checked against the RFC's published test vectors, so interoperability with other LMS
implementations (OpenSSL, Bouncy Castle, `hash-sigs`) should be treated as unverified until
that check is done. For Candy signing its own feed and verifying it, this does not matter;
for exchanging signatures with other software, it would.

---

## 10. Gap-fills: the free equivalent of each impossible requirement

Every ❌ in section 9 got the strongest free approximation that exists. None of these
*equal* what was asked for; each is stated with what it does and does not achieve.

| Gap | Was requested | What was built instead | How much of the gap it closes |
|---|---|---|---|
| **AES-256-GCM** | "AES-256 with 512-bit keys" | `candy/vault.py` — AES-256-GCM in pure Python, verified against the **FIPS-197 C.3** known-answer vector and **NIST SP 800-38D GCM test case 13**. Quarantined files are now authenticated-encrypted, not XOR-defanged. | **Fully closed** (512-bit AES keys do not exist; 256 is the ceiling CNSA 2.0 itself specifies) |
| **TPM 2.0 key sealing** | Keys sealed in hardware | **DPAPI machine-scope wrapping** of the vault key via `CryptProtectData`. Copying `vault.key` to another machine yields nothing. | **Partial.** A local process running as you can still unwrap it; a TPM-sealed key could not be extracted at all. But it removes the "secret in a readable file" problem, and it costs nothing. |
| **Ring-0 interception** | Deny execution / injection in the kernel | **IFEO execution blocking** (`candy/prevent.py`) — Windows' loader runs a no-op stub instead of the blocked program, so it never executes. Plus **network containment**: a per-program firewall block that severs a process's traffic even when it cannot be killed. | **Partial.** IFEO is genuine pre-execution blocking, but matches on image *name*, so a rename escapes it. Containment stops exfiltration without stopping the process. |
| **VT-x detonation sandbox** | Run the payload in a VM before packets leave | **Static triage** (`candy/triage.py`) — reads imports, strings, URLs, IPs and webhook endpoints out of the binary and scores capability *groups*. The injection triad, credential-store access, Defender-disabling strings, Discord/Telegram exfil sinks, Roblox session-cookie references. | **Partial.** Reads intent without executing, so it is safe and instant — but it is defeated by packing, which is itself detected and reported by entropy. |
| **On-NPU neural anomaly model** | Neural detection of covert traffic | **Statistical timing analysis** (`candy/anomaly.py`) — beacon detection by interval jitter, fan-out detection by distinct-host count, z-score volume baselines. | **Arguably better here.** Beacon jitter catches C2 through encryption because it uses only timestamps, and every rule is auditable. There is no labelled training set for this threat class anyway. |
| **Measured boot / PCR attestation** | Verify integrity against TPM at boot | **Measured application start** (`candy/integrity.py`) — Candy hashes its own modules, config and threat database into a manifest, signs it with the LMS post-quantum key, and re-verifies on every run. Plus **platform trust reporting**: Secure Boot state, TPM presence, VBS/HVCI, with plain-language advice. | **Partial.** Measures Candy rather than the OS, and reports platform state rather than enforcing it — but a patched module or edited config is caught before monitoring starts. |
| **Rust / formal proofs of memory safety** | Provably no buffer overflows | **Fuzz testing.** Every parser pointed at attacker-controlled data — PE files, event XML, hosts files, command lines, CSV, domains — takes thousands of random, mutated and truncated inputs per run and must not raise. | **Partial.** Python has no buffer-overflow class to begin with (no manual memory management), and fuzzing demonstrates robustness rather than proving it. Not a formal proof, and not Rust. |
| **ML-KEM-1024 key encapsulation** | Post-quantum key exchange | Nothing — deliberately. There is no tunnel to key. | **Not applicable**, and building it unused would be theatre. |

### What "impenetrable" honestly means here

After all of this, the posture on a properly configured machine is:

1. Nothing reaches the network unless it is on a **hash-pinned allowlist** (default-deny).
2. Known-bad programs **cannot start at all** (IFEO), and anything detected can be **cut off
   from the network in under a second** even if it survives termination.
3. Payloads are **read before they run** and scored on capability, not just name.
4. C2 traffic is caught by **timing**, so encryption does not hide it.
5. The rules Candy obeys are **post-quantum signed**; a hostile feed cannot forge them.
6. Quarantined samples are **AES-256-GCM encrypted** under a **machine-bound key**.
7. Candy's own code is **measured and signed**; tampering is reported before it starts.
8. Every action is **logged into a hash chain** that cannot be silently edited.

And the ceiling remains exactly where it was: **an attacker already running as
administrator, or running in the kernel, wins.** No amount of user-mode engineering changes
that — only a signed driver would, and that costs money. Everything above is the strongest
posture reachable for zero.
