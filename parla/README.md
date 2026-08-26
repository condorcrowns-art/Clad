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
| Text → speech | paid TTS | `speechSynthesis` — your OS's own Spanish voices |
| AI conversation | someone's servers | Ollama on your machine, or Gemini's free tier, or no AI at all |
| Progress storage | an account | `localStorage` — never leaves your device |
| Hosting | App Store | a static folder |

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

| Your RAM | Model | Roughly |
|---|---|---|
| 32 GB+ | `qwen2.5:14b` | best quality |
| 16 GB | `qwen2.5:7b` | the sweet spot |
| 8 GB | `qwen2.5:3b` | usable |
| under 8 GB | `qwen2.5:1.5b` | rough, but talks |

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
  speech.js           Web Speech wrappers (ASR + TTS), voice selection
  srs.js              SM-2 spaced repetition
  brain.js            three backends behind one interface, model auto-pick,
                      JSON retry, and the offline corrector
  ui.js               tiny DOM toolkit
  views-talk.js       scenario picker, conversation, session summary
  views-drill.js      flashcard review, conjugation trainer
  views-progress.js   home, 60-day grid, stats, mistake journal, settings
  app.js              router + bootstrap
test/harness.js       loads the plain scripts into Node for testing
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

```bash
node -e "const{makeSandbox,load}=require('./test/harness');
  const d=load(makeSandbox(),'js/data/vocab-es.js','js/data/verbs-es.js').PARLA.data.es;
  console.log(d.vocab.length, d.verbs.conjugate('tener','presente'));"
```

## Privacy

Nothing you say or save leaves your device — except your typed/spoken turns when you
deliberately choose the Gemini backend, which sends them to Google. Built-in and Ollama send
nothing anywhere. There is no analytics, no account, and no network call the app makes on its
own. Clearing site data wipes your progress, so use Settings → Export if you care about it.
