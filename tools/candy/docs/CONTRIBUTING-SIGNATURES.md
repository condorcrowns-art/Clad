# Contributing threat signatures

The threat database is `data/threats.json` — plain JSON, no build step, no binary blob.
Anyone can read it, diff it, and argue with it. That is the point.

---

## Signature format

```json
{
  "id": "exec.nova",
  "name": "Nova Executor",
  "target": "process_name",
  "pattern": "re:^nova(loader|ui)?\\.exe$",
  "severity": "high",
  "description": "Nova executor client. Injects nova.dll into RobloxPlayerBeta.",
  "category": "executor",
  "references": ["https://example.com/where-you-saw-it"]
}
```

| Field | Notes |
|---|---|
| `id` | Unique and stable. Prefix `exec.` for products, `generic.` for behaviour patterns, `tamper.` for security tampering, `inject.` for injected modules, `community.` for submissions. |
| `target` | `process_name`, `process_path`, `cmdline`, `file_name`, `file_path`, `module_name`, `window_title`, `remote_host`. Anything else is dropped on import. |
| `pattern` | A literal substring, or `re:` followed by a case-insensitive regex. |
| `severity` | `info` (5), `low` (20), `medium` (45), `high` (75), `critical` (100). |
| `description` | What it is, and how you know. This is what the user reads in the alert. |

Note that `process_name` signatures are also matched against file names, so one entry
catches an executor both when it is downloaded and when it runs.

---

## Writing a pattern that will not hurt anyone

A signature that fires on innocent software is worse than no signature, because
Candy can be configured to quarantine and kill on the strength of it.

**Anchor short or ambiguous names.** `wave` matches `WaveEditor.exe` and half the audio
software on Windows. `re:^wave[ _-]?(executor|exploit|launcher)\.exe$` does not.

**Prefer specificity over reach.** Catching one product precisely beats catching a family
approximately.

**Escape properly.** `.` in a literal pattern is escaped for you; inside `re:` it is not.
`re:krnl.exe` also matches `krnlXexe`.

**Match severity to evidence quality:**

| Evidence | Severity |
|---|---|
| Named product with no legitimate namesake | `high` |
| Unsigned DLL inside a Roblox process, verified Defender-disabling command line | `critical` |
| Name shared with legitimate software | `medium` |
| Generic behaviour (executable in `%TEMP%`, installer-style name) | `low` / `info` |

**Test it before you submit** — against the thing you want to catch, and against a
directory of software you know is fine:

```bash
python run.py scan "C:\Users\me\Downloads"
python run.py scan "C:\Program Files"      # should be silent
```

---

## Hashes

`hashes` maps a lowercase SHA-256 to `{"name": ..., "severity": ...}`.

Only submit a hash you computed yourself from a sample you actually have:

```powershell
Get-FileHash -Algorithm SHA256 .\suspicious.exe
```

Hashes copied from a forum post, a screenshot, or another tool's database are not
acceptable — they cannot be verified, and a wrong entry quarantines an innocent file.
This is why the shipped database has none.

Note that a hash matches exactly one build. Executors update weekly; hashes age out fast.
A good name or behaviour signature is worth more than fifty hashes.

---

## Submitting

Generate a well-formed entry:

```powershell
Candy.exe submit --name "Nova Executor" --target process_name \
  --pattern "re:^nova\.exe$" --severity high \
  --description "Confirmed sample; injects nova.dll into RobloxPlayerBeta" \
  --sha256 <hash, only if you verified it yourself> --out nova.json
```

Then open a pull request against the feed repository adding it to `threats.json`, or
paste it into an issue. Include:

* how you encountered it,
* what you observed it doing (injected module name, folders it used, connections),
* whether you tested the pattern against known-good software.

**Do not attach the malware sample itself.** Names, hashes and behaviour are what the
database needs.

---

## Running your own feed

There is no central server, and none is needed. A feed is one JSON file served over
HTTPS — a raw GitHub file works:

```powershell
Candy.exe update --url https://raw.githubusercontent.com/<you>/<repo>/main/threats.json
```

The URL is saved to `config.json`; set `updates.auto_update` to `true` and
`updates.interval_hours` to refresh on a schedule.

On import, Candy:

* refuses plain HTTP (a MITM could otherwise blacklist `explorer.exe`),
* refuses feeds over 8 MB,
* refuses a `meta.schema` newer than it understands,
* skips malformed entries — including invalid regexes and non-SHA-256 hash keys —
  instead of aborting the whole update,
* merges rather than replaces, so entries you added by hand survive.

Since a feed can direct Candy to kill processes and quarantine files, **subscribe
only to a feed you would trust with that power**, and read the diffs.
