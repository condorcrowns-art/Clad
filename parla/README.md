# Parla 🗣️

**Learn Spanish by talking.** You speak out loud, an AI partner answers in Spanish, and you get
corrected as you go. Then the words you fumbled come back as flashcards until they stick.

Free, private, offline-capable, no account, no subscription, no server. Zero dependencies —
pure HTML, CSS and vanilla JS.

## Windows: one command

Open **PowerShell as Administrator** and paste this. It downloads Parla, installs
Ollama, configures it for the browser, pulls a model matched to your RAM, and opens the app.

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
$z="$env:TEMP\parla.zip"; $d="$HOME\Parla"
Invoke-WebRequest "https://github.com/condorcrowns-art/Clad/archive/refs/heads/claude/victor-ai-familiarity-rf2730.zip" -OutFile $z
Expand-Archive $z $d -Force
cd (Get-ChildItem "$d\*\parla" -Directory | Select-Object -First 1).FullName
Get-ChildItem -Recurse | Unblock-File
.\setup-windows.ps1
```

Re-running it is safe - every step skips itself if already done. Afterwards, to just
start the app again: `cd $HOME\Parla\*\parla; .\serve.ps1`

## macOS / Linux

```bash
# from this folder - any static server works
python3 -m http.server 8000
# then open http://localhost:8000
```

> **The microphone needs `http://localhost` or `https://`.** Opening `index.html` as a `file://`
> URL works for everything except speech recognition — browsers won't grant a mic there.

---

## What's in it

| | |
|---|---|
| **23 conversation scenarios** | Café, restaurant, doctor, job interview, emergency call, arguing about where to live… |
| **60-day speaking challenge** | One conversation a day, ordered so grammar arrives when you need it |
| **345-word vocabulary** | With native audio, gendered articles, and a real example sentence each |
| **Spaced repetition** | Full SM-2. Words you miss come back tomorrow; words you nail vanish for months |
| **Conjugation trainer** | 50 verbs × 6 tenses × 6 persons, generated from rules — irregulars and stem-changers included |
| **Pronunciation check** | Read a word aloud; speech recognition tells you whether it heard the right thing |
| **Mistake journal** | Every correction you've ever been given, in one place |
| **Offline** | Installs as a PWA and works with no network at all |

---

## Why this is free

Every part that normally costs money has a free native equivalent:

| Piece | Usually | Here |
|---|---|---|
| Speech → text | paid ASR API | `SpeechRecognition` — built into the browser |
| Text → speech | paid TTS | Piper — a neural voice running on your own machine |
| AI conversation | someone's servers | Ollama on your machine, or Gemini's free tier, or no AI at all |
| Progress storage | an account | `localStorage` — never leaves your device |
| Hosting | App Store | a static folder |

---

## The voice

The single biggest thing separating this from a paid app used to be how it sounded.
Windows' built-in Spanish voices are decade-old SAPI ones — Helena, Sabina — and they
sound like a satnav reading a receipt. So the app doesn't use them if it can help it.

`setup-windows.ps1` installs **Piper**, a neural text-to-speech engine, plus two Spanish
voices (Castilian and Mexican). It runs on your CPU, takes about 150 MB on disk, needs no
account and no internet, and costs nothing. `serve.ps1` fronts it at `POST /tts` on the
same origin as the page, so there is no CORS to configure and nothing to expose.

Repeated phrases are cached as WAVs under `voices/cache/`, so drilling the same fifty
words does not re-synthesise them fifty times.

If Piper is missing — you skipped it, the download failed, the server isn't running — the
app falls back to the browser's own voices silently and keeps working. Settings → **Voice**
tells you which one you're on:

| Label | What it is |
|---|---|
| `[neural — best]` | Piper, running locally. This is the one you want. |
| `[best]` | Chrome's `Google español`, or a Windows 11 *Natural* voice. Decent. |
| `[good]` / `[ok]` | Serviceable OS voices. |
| `[robotic]` | Legacy SAPI. Only shown because something has to be. |

The list prefers the accent the recogniser is listening in (`es-ES`), so both halves of the
conversation stay in one accent rather than drifting between Madrid and Mexico City.

---

## Listening

Speech recognition decides when you have stopped talking, and it is wrong about
that constantly. Browsers default to ending the turn at the **first pause** —
so a beginner saying *"Me llamo…"* and pausing to remember how the sentence goes
has `Me llamo` submitted as a finished thought.

Parla runs recognition continuously and decides for itself. Your turn ends after
a real silence — 1.6 seconds by default, adjustable in Settings → Practice, up
to 4 seconds if you like to think mid-sentence. Chrome also stops recognition on
its own every few seconds no matter what the flag says; that gets restarted
underneath and the transcript stitched across the seam, so you never see it.

While the mic is open you can tap it to send early, or **✕** to throw the
sentence away. If something lands in the transcript that you did not say, the
**✎ Misheard** button on your own bubble removes it from the conversation and
puts the text back in the box — a mis-heard line never gets to poison the next
few turns.

---

## The partner

It role-plays one character and reacts to what you actually said. The rule that
matters most: **it never fills in what it did not hear.** If your sentence
arrives cut off, it asks for the missing piece the way a person would — *"¿Cómo
te llamas?"*, not *"I did not understand your input"* — and asking you to repeat
yourself does not count as a turn or earn XP.

It knows three things the model cannot work out alone: whether your sentence
ends on a dangling word that recognition almost certainly truncated, how much
the recogniser trusted its own transcript, and what it has already said in the
last few turns so it stops asking the same question. The offline partner applies
the same rule without a model at all.

---

## Choosing a conversation partner

Settings → **Conversation partner**. All three are free; they trade off differently.

### Ollama - the default
Unlimited, private, genuinely free forever. A real open-ended conversation partner.

On Windows the setup script above does all of this. Manually:

```bash
# install from https://ollama.com, then:
ollama pull qwen2.5:7b        # or qwen2.5:3b on 8GB machines
OLLAMA_ORIGINS="*" ollama serve
```

`OLLAMA_ORIGINS` is the part everyone misses. Ollama refuses cross-origin browser
requests by default, so without it Parla cannot reach a perfectly healthy Ollama and
falls back to the scripted partner. The app detects this at startup and says so
rather than degrading silently.

**Model choice matters a lot.** `qwen2.5` holds a Spanish conversation noticeably
better than `llama3.2` at the same size - llama3.2:3b tends to drift into English and
repeat stock phrases. Parla ranks whatever you have installed and picks the best one
automatically; you never have to type a model name.

**VRAM decides speed, not system RAM.** A 14B model on a GPU answers in ~2 seconds;
the same model on CPU takes 15-20 seconds per reply, which is unusable when you are
standing there waiting to speak. The setup script detects your GPU, picks accordingly,
then actually times a generation and tells you if it is too slow.

Thresholds are on **usable** VRAM. Windows holds ~1.5 GB for the desktop, and a model
needs its weights plus context and compute buffers. If the whole thing does not fit,
Ollama silently spills layers to the CPU and the CPU half sets the pace — measured on a
12 GB RTX 4070, the 9 GB `qwen2.5:14b` ran at **4.1 tok/s**, i.e. CPU speed, while the
4.7 GB `7b` fits entirely and is roughly ten times faster despite being the smaller model.

| Your GPU VRAM | Model | Weights |
|---|---|---|
| 16 GB+ | `qwen2.5:14b` | 9.0 GB |
| 8-16 GB | `qwen2.5:7b` | 4.7 GB |
| 5-8 GB | `qwen2.5:3b` | 1.9 GB |
| no GPU, 16 GB+ RAM | `qwen2.5:7b` (slow but workable) | |
| no GPU, less RAM | `qwen2.5:3b` | |

The speed check reports what fraction of the model actually landed in VRAM, so a spill is
named rather than guessed at.

Override at any time: `.\setup-windows.ps1 -Model qwen2.5:7b`

### Built-in scripted
Keyword matching over each scenario's own script, plus a rule-based corrector that
catches the classic English-speaker mistakes (`soy cansado` -> `estoy cansado`,
`yo soy 25 anos` -> `tengo 25 anos`, `buenos noches` -> `buenas noches`, ~25 more).

No setup, no network, no cost, ever. Conversations follow the scenario rather than
going anywhere you like - but pronunciation, vocabulary and verb practice are
identical. This is the automatic fallback whenever an AI backend is unreachable, so
practice never stops.

### Gemini free tier
No install and no credit card — get a key at
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) and paste it into Settings.

The free tier is permanent but quota-limited (roughly 1,000 requests/day on
`gemini-2.5-flash-lite` at the time of writing; Google cut quotas substantially in Dec 2025).
Your key is stored only in your browser — but note Google may use free-tier text to improve its
models, so don't say anything here you'd mind being read.

**If any backend fails**, the turn falls back to the built-in partner automatically and tells you
why. Practice never stops because a server is down.

---

## Layout

```
index.html            shell + script tags
setup-windows.ps1     one-shot Windows setup (Ollama + config + model + run)
serve.ps1             dependency-free static server (.NET HttpListener)
manifest.json         PWA metadata
sw.js                 offline cache
css/style.css         design system (light + dark)
js/
  data/
    vocab-es.js       345 words: [es, en, pos, example_es, example_en, tags]
    verbs-es.js       conjugation ENGINE — regular endings + irregular overrides
    scenarios-es.js   23 scenarios: LLM briefing + offline script beats
    challenge-es.js   the 60-day plan
  store.js            localStorage, profile, XP, streaks, export/import
  speech.js           speech in (Web Speech ASR) and out (Piper, falling back
                      to the browser's voices), plus voice ranking
  srs.js              SM-2 spaced repetition
  brain.js            three backends behind one interface, model auto-pick,
                      JSON retry, and the offline corrector
  ui.js               tiny DOM toolkit
  views-talk.js       scenario picker, conversation, session summary
  views-drill.js      flashcard review, conjugation trainer
  views-progress.js   home, 60-day grid, stats, mistake journal, settings
  app.js              router + bootstrap
serve.ps1             dependency-free static server + the /tts endpoint
setup-windows.ps1     one-shot installer: Ollama, a model, Piper, a voice
piper/  voices/       downloaded by setup, git-ignored
test/
  harness.js          loads the plain scripts into Node for testing
  voice-ranking.test.js   voice ordering against a real Windows voice list
  piper-tts.test.js       neural routing, fallback, cancellation
  listen.test.js          microphone endpointing against a fake recogniser
  comprehension.test.js   the partner must not answer what it did not hear
  mock-tts-server.js      stands in for serve.ps1's /tts on non-Windows
  piper-browser.test.js   the whole thing in a real browser
```

## Adding content

- **A word** — append one row to `js/data/vocab-es.js`. SRS, audio and drills pick it up
  automatically.
- **A verb** — add `['infinitive', 'english', 'a1']` to `VERBS` in `verbs-es.js`. If it's
  irregular, add its odd tenses to `IRREGULAR`; everything else is generated.
- **A scenario** — append an object to `scenarios-es.js`. `role`/`setting`/`goals` brief the LLM;
  `script` beats make it work offline. Give it a `fallback` or two.
- **French** — the engines are already language-parameterised (`PARLA.speech.langs` has `fr`).
  Add `js/data/*-fr.js` files in the same shapes and a language switch in settings.

Bump `CACHE` in `sw.js` whenever you change a shipped file, or browsers will serve the old one.

## Testing

No dependencies for the unit tests:

```bash
node test/voice-ranking.test.js     # which voice wins, and why
node test/piper-tts.test.js         # neural routing, fallback, cancel semantics
node test/listen.test.js            # when your turn ends, and when it does not
node test/comprehension.test.js     # the partner asks instead of assuming

node -e "const{makeSandbox,load}=require('./test/harness');
  const d=load(makeSandbox(),'js/data/vocab-es.js','js/data/verbs-es.js').PARLA.data.es;
  console.log(d.vocab.length, d.verbs.conjugate('tener','presente'));"
```

The end-to-end test needs Playwright, and stands the `/tts` contract up without Windows:

```bash
npm i playwright
node test/mock-tts-server.js 8765            # or: 8765 nopiper
node test/piper-browser.test.js 8765         # or: 8765 nopiper
```

`serve.ps1` and `piper.exe` themselves are only exercised on Windows — `setup-windows.ps1`
synthesises a test phrase at the end and tells you if it failed.

## Privacy

Nothing you say or save leaves your device — except your typed/spoken turns when you
deliberately choose the Gemini backend, which sends them to Google. Speech synthesis is
local too: the text is never sent anywhere to be spoken. Built-in and Ollama send
nothing anywhere. There is no analytics, no account, and no network call the app makes on its
own. Clearing site data wipes your progress, so use Settings → Export if you care about it.
