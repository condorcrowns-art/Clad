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
| **Ask anything** | Type any Spanish word: meaning, gender, every tense, the mistake learners make with it, two examples — then bank it as a card |
| **Four study games** | Pairs, Word rush, El or la, Dictation — no mic, no model, no network, all feeding the same deck |
| **Mistake journal** | Every correction you've ever been given, in one place |
| **Offline** | Installs as a PWA and works with no network at all |
| **Works on your phone** | The AI partner runs on Cloudflare's edge, so the S11 needs no PC awake at home |

---

## Why this is free

Every part that normally costs money has a free native equivalent:

| Piece | Usually | Here |
|---|---|---|
| Speech → text | paid ASR API | `SpeechRecognition` — built into the browser |
| Text → speech | paid TTS | Piper — a neural voice running on your own machine |
| AI conversation | someone's servers | Ollama on your machine, Cloudflare Workers AI on the deployed site, Gemini's free tier, or no AI at all |
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

## When the microphone does not work

"It doesn't work" has half a dozen causes and the browser reports almost none of
them — `not-allowed` covers a denied permission, a blocked page, an unplugged
microphone and one another app is holding. So Parla asks for the microphone
through `getUserMedia` *before* recognition does, which turns that into a real
error name, and then says the remedy in plain words on screen next to the mic
rather than in a console nobody opens.

**Settings → Microphone → Test microphone** checks everything at once: secure
context, whether recognition exists, the permission state, how many input
devices the browser can see, whether one actually opens — then listens for five
seconds and shows you exactly what it heard, with the confidence.

One thing worth knowing: **Chrome does speech recognition on Google's servers**,
not on your machine. With no internet connection the microphone fails with
`network` however healthy the hardware is. The app says so rather than looking
broken. Typing always works.

---

## Hosting it

See **[DEPLOY.md](DEPLOY.md)**. Short version: the app goes on Cloudflare Pages
in about five minutes, and installs to an Android home screen as a real app.

The AI partner comes with it. `functions/api/chat.js` is a Pages Function that
calls **Workers AI** — Cloudflare's own models on Cloudflare's hardware, free on
a normal account — so the phone talks to the site it is already on and nothing
has to be running at home. It needs one thing done in the dashboard: an **AI
binding named `AI`**, then a redeploy. DEPLOY.md is exact about it, because
skipping the redeploy is the one way to make this look broken.

What the phone still cannot have is Piper: a page served over **https cannot
call http://localhost**, that is mixed content, and no setting changes it. So
the phone uses Android's own Spanish voices, which are decent, and the same rule
is why the phone cannot reach your Ollama either. If you would rather your
conversations never left your hardware, DEPLOY.md also covers a Cloudflare
Tunnel to your own Ollama, and what AdSense actually requires.

---

## How it looks

Mexican folk colour: papel picado pink, Talavera turquoise, marigold, jacaranda
purple, nopal green, on warm adobe cream rather than white — those hues go muddy
against a cold ground. Night is the same fiesta on a jacaranda-dark wall.

Every ornament is **drawn from geometry at runtime**, not downloaded. The papel
picado is cut from circles and triangles, the tiled background is an eight-fold
Talavera rosette rendered once to a data URI, and the home screen mural is
composed from flat shapes that recolour with the theme. No images, no web fonts,
nothing to fetch — the same constraint that keeps the rest of it free and
offline. The designs are original compositions in a folk idiom, not
reproductions of anyone's artwork.

Things move, but only `transform` and `opacity`, so nothing here causes layout:
bunting sways, the sun turns, birds cross, cards arrive in sequence, the mic
sends rings out while it listens, and confetti marks a level-up. All of it stops
dead under `prefers-reduced-motion`, and the colour stays.

`js/decor.js` and `css/fiesta.css` can both be deleted and the app still works —
there's a test that loads it with `decor.js` blanked out to prove it.

---

## When you're stuck

Tap **I don't know what to say** and you get three things you could actually say
next — different directions, not three wordings of one idea, at your level, each
one answering what was just said to you. **Use** puts a phrase in the box rather
than sending it, because reading it aloud is the point.

With a model running these are written for the exact moment. Without one you get
the scenario's own phrasebook minus anything you have already said, which is
less tailored but instant and always correct — and being stuck is exactly when
you are least able to wait.

---

## Making it sound like a person

Three things separate a synthesiser from someone talking, and none of them is
the model.

**It has to say numbers the way people say them.** Every engine reads
"Habitación 204" as digits and "Son 3,20 €" as noise. One mangled number undoes
a whole neural model's worth of realism, because nobody would ever say it that
way. So `js/saytext.js` rewrites the lot before synthesis — numbers with proper
Spanish agreement (*cien* vs *ciento*, *quinientos*, *setecientos*, *una* vs
*un*), the clock in halves and quarters (*las nueve menos cuarto*, not *veinte
cuarenta y cinco*), money, percentages, decimals, ordinals, and the
abbreviations that are always written short and always said long — *Sr.*,
*Dra.*, *Ud.*, *Avda.*. Phone numbers go digit by digit, because grouping them
in pairs turns "00" into a single *cero* and loses one. The text on screen is
untouched; this is purely the speech layer.

**It has to breathe.** A reply used to be one synthesis run at one unbroken
pace. Now `serve.ps1` splits it into sentences, synthesises each on its own, and
joins them with a real silence — longer after a question than a statement — with
questions delivered a touch slower, the way people actually ask them.

**Every character is a different person.** See below.

---

## Casting

Your partner is a different person in every scenario — Marta the barista, Javi
at the party, Dr. Ramos the GP. One voice reading every part is the detail that
quietly tells you nobody was paying attention, so every character carries a
gender and an age and gets cast accordingly.

Piper exposes **no pitch control**, and its model cards do not record a
speaker's gender. So two things:

- Setup installs **four** Spanish voices, and **Settings → Voice** asks which
  sound like women and which like men, with a play button on each. The app
  cannot hear itself; you can. Two taps, once.
- Pitch is done by resampling. A WAV is just samples plus a declared playback
  rate, so declaring a higher rate plays it higher *and* faster — and asking
  Piper for a proportionally longer clip (`length_scale = pitch / rate`) puts
  the duration back exactly where the speed setting wanted it. Being a resample,
  it shifts formants too, which is what actually makes a voice read as twenty
  rather than fifty. Falsetto alone just sounds like the same person straining.

A **Voice age** slider moves the whole cast, and each character still sits
younger or older than the others within it. If only one voice fits a gender,
the other is pitch-shifted towards it — not perfect, but better than everyone
sounding like the same person.

---

## When you answer in English

You have not failed. You have pointed at the exact sentence you cannot say yet,
which is the most useful thing that happens in a lesson. The old rule was
"answer in Spanish anyway and pull them back gently", which left you still not
knowing how to say it.

Now the partner stays in character, keeps replying in Spanish, and hands you
**Say it like this** — the Spanish *you* were reaching for, at your level, with
a play button and a **Try saying it** button that drops it in the box. Then it
answers as though you had said it, so the scene keeps moving. It never scolds,
never switches to English itself, never breaks the scene to teach.

Phrases you needed and could not produce go into your review deck automatically.
They are the best flashcards you will ever have: you already demonstrated you
wanted them.

Detection is by function-word counting, so it works with no model at all — the
offline partner catches it too and hands you the phrase this scene needs.

---

## Ask it anything

The shipped list is 521 words. **The model knows the language** — capping a
lookup at a list somebody typed by hand was the wrong instinct, so the **Ask**
screen takes any word, phrase or whole sentence, in Spanish or English, spelled
right or not, and comes back with:

- what it means
- the dictionary form, with its article and gender if it's a noun
- what form you were looking at (*third-person preterite of tener*)
- **the full conjugation, every tense**, if it's a verb
- how a sentence is built around it — what it takes after it, which verb it needs
- **the mistake English speakers make with that exact word**
- two examples at your level, each with a play button

Write a sentence with a mistake in it and you get the corrected sentence back
plus what was wrong.

**Where each part comes from matters.** The conjugation table is generated from
the same rules that drive the verb drill, not recited by an 8B model from
memory — so it is right for any regular verb in the language, including ones
nobody put in a list. `madrugar` is not in the fifty-verb drill pool and
conjugates correctly across all six tenses. For a verb it has no irregular data
on, it says so rather than pretending.

Everything you ask about can go straight into your deck. A word it has no
meaning for is refused rather than banked — a card with a blank back is not a
flashcard.

Without a model it still answers from the corpus and the grammar engine, and
tells you that is what happened.

---

## Tap any word

A fixed word list is always the wrong list: it holds words you already know and
lacks the one your partner just used. So **every Spanish word in the
conversation is tappable**. Tap it and you get what it means *in that sentence*,
the dictionary form, and what grammatical form it is — then **+ Learn this**
puts it in your deck **with the sentence it was actually said in as its example**.

That sentence is the point. It is real context you were present for, which beats
anything a corpus author invents, and it is what the fill-in-the-gap drill uses.

Three sources, tried in order, and the first two are instant and free:

1. **The corpus** — 521 words, matched with or without the article.
2. **The conjugation engine** — it generates every form of every verb, so it can
   recognise one too. Tap *tuvo* and it tells you: third-person preterite of
   *tener*. No reverse table was written; the index is built from the same rules
   that produce the drill.
3. **The model**, which has the whole sentence in front of it and can tell which
   sense was meant.

Words already in your deck are marked, not offered twice.

---

## Review that escalates

Recognising a word is the easy half, and it stops teaching you anything the
moment you can do it. So **Mixed** — the default — picks the drill per card
based on how well you actually know that card:

| Card | Drill |
|---|---|
| New, or one you keep lapsing on | See the Spanish, recall the meaning |
| Seen once or twice | **Hear it** with no text at all, then reveal |
| Getting solid | **Type it** in Spanish from the English |
| Solid, with an example | **Fill the gap** — the word punched out of its own sentence |
| Strong | **Say it** aloud, checked by the recogniser |

Cards **flip** — front and back stacked on the same spot, the whole thing
rotating, so the answer arrives from behind the question rather than replacing
it. **Space** flips, **1–4** grade, **U** undoes the last card and puts its
scheduling back exactly as it was. Mis-tapping a grade is the commonest mistake
in any flashcard app and without undo it silently costs you a week.

Typed answers are judged properly: articles optional, one-letter slips and
missing accents scored as *near misses* rather than failures — with the accent
named, because accents do matter. The grade button matching the verdict is
highlighted, and you can still override it.

---

## What it remembers

Tell your partner your name on Monday and it still knows on Thursday. Where you
live, what you do, what you can't stand — anything you actually say gets kept as
a short note and put back in front of the partner every turn, so you are not
introducing yourself twice a week.

Your name is extracted deterministically from *"me llamo…"*, *"mi nombre es…"*
and a capitalised *"Soy Pablo"*, so it survives even when there's no model
running. Everything else the partner writes down itself, and only from things
you said — it is explicitly forbidden from guessing.

The list is capped at 14 and shown in full under **Settings → What your partner
remembers**, with a **Forget everything** button. It lives in this browser next
to your progress and goes nowhere else.

---

## Conversation as the drill

The vocabulary deck already knows which words aren't sticking — the ones you've
lapsed on and the ones now overdue. Those get handed to the partner each turn
with an instruction to work one or two in naturally, never as a list. Your
mistake journal goes the same way: errors you've already been corrected on get
caught again rather than waved through as close enough.

So the conversation isn't generic practice. It's aimed at your weak spots
without ever announcing that it is.

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

Models are ranked by how well they hold a *Spanish* conversation, which is not
the same as how they score on English benchmarks. Ones trained explicitly for
multilingual use — `aya-expanse`, `mistral-nemo` — sit above general models of
the same size, because holding register and idiom is the whole job here. Setup
tries the best fit for your VRAM and falls back down the list if a pull fails,
so a tag that no longer exists costs you a retry rather than a broken install.

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
css/fiesta.css        the decorative layer — deletable
js/decor.js           papel picado, Talavera tiles, the mural, confetti
js/saytext.js         written Spanish -> spoken Spanish, before synthesis
js/views-coach.js     the Ask screen
js/
  data/
    vocab-es.js       521 words: [es, en, pos, example_es, example_en, tags]
                      — plus everything you tap in conversation, unbounded
    verbs-es.js       conjugation ENGINE — regular endings + irregular overrides
    scenarios-es.js   23 scenarios: LLM briefing + offline script beats
    challenge-es.js   the 60-day plan
  store.js            localStorage, profile, XP, streaks, export/import
  speech.js           speech in (Web Speech ASR) and out (Piper, falling back
                      to the browser's voices), plus voice ranking
  srs.js              SM-2 spaced repetition
  brain.js            four backends behind one interface, model auto-pick,
                      JSON retry, and the offline corrector
  ui.js               tiny DOM toolkit
  views-talk.js       scenario picker, conversation, session summary
  views-drill.js      flashcard review, conjugation trainer
  views-coach.js      the Ask screen: any word, meaning, conjugation, pitfalls
  views-games.js      Pairs, Word rush, El or la, Dictation
  views-progress.js   home, 60-day grid, stats, mistake journal, settings
  app.js              router + bootstrap
functions/
  api/chat.js         Cloudflare Pages Function: the partner on the public site,
                      running on Workers AI so a phone needs no PC
serve.ps1             dependency-free static server + the /tts endpoint
setup-windows.ps1     one-shot installer: Ollama, a model, Piper, a voice
piper/  voices/       downloaded by setup, git-ignored
test/
  harness.js          loads the plain scripts into Node for testing
  voice-ranking.test.js   voice ordering against a real Windows voice list
  piper-tts.test.js       neural routing, fallback, cancellation
  listen.test.js          microphone endpointing against a fake recogniser
  comprehension.test.js   the partner must not answer what it did not hear
  english.test.js         answering in English as a teaching moment
  casting.test.js         who plays whom, and at what pitch
  memory.test.js          what it remembers, and what it must not invent
  saytext.test.js         numbers, times and money as a person says them
  corpus.test.js          the content itself: no duplicates, no broken rows
  lookup.test.js          tapping a word, and which model gets picked
  coach.test.js           asking about any word, and conjugating any verb
  mic-browser.test.js     every way a microphone fails, and the mural geometry
  suggest.test.js         being stuck, with and without a model
  fiesta.test.js          the ornament must not break the app
  hosted.test.js          the Workers AI backend, and its fallbacks
  games-browser.test.js   all four study games, played through, at phone size
  hosted-browser.test.js  the deployed site end to end against the real function
  mock-tts-server.js      stands in for serve.ps1's /tts on non-Windows
  mock-pages-server.js    stands in for Cloudflare Pages, running the real
                          functions/api/chat.js against a faked AI binding
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
node test/memory.test.js            # remembering you between sessions
node test/saytext.test.js          # "Habitación 204" -> "doscientos cuatro"
node test/corpus.test.js           # the word list and scenarios themselves
node test/lookup.test.js           # word lookup and model ranking
node test/coach.test.js            # the Ask screen's answers
node test/suggest.test.js          # what to say when you are stuck
node test/english.test.js          # English as a teaching moment
node test/casting.test.js          # voices matched to characters
node test/hosted.test.js           # the Workers AI partner, and what happens without it

node -e "const{makeSandbox,load}=require('./test/harness');
  const d=load(makeSandbox(),'js/data/vocab-es.js','js/data/verbs-es.js').PARLA.data.es;
  console.log(d.vocab.length, d.verbs.conjugate('tener','presente'));"
```

The end-to-end test needs Playwright, and stands the `/tts` contract up without Windows:

```bash
npm i playwright
node test/mock-tts-server.js 8765            # or: 8765 nopiper
node test/piper-browser.test.js 8765         # or: 8765 nopiper
node test/fiesta.test.js 8765                # layout, reduced motion, decor removed
node test/drill-browser.test.js 8765        # every flashcard drill, end to end
node test/word-browser.test.js 8765         # tapping a word out of a conversation
node test/coach-browser.test.js 8765        # the Ask screen and the flip cards
node test/games-browser.test.js 8765        # all four games, played through, on a phone
```

The hosted partner has its own server, because the thing worth testing is the
Pages Function itself — `mock-pages-server.js` loads `functions/api/chat.js` and
runs it, so what these checks exercise is the code that gets deployed:

```bash
node test/mock-pages-server.js 8801            # binding present, models answer
node test/hosted-browser.test.js 8801

node test/mock-pages-server.js 8802 nobinding  # the binding was never added
node test/hosted-browser.test.js 8802 nobinding

node test/mock-pages-server.js 8803 flaky      # the first models are down
node test/hosted-browser.test.js 8803 flaky
```

`serve.ps1` and `piper.exe` themselves are only exercised on Windows — `setup-windows.ps1`
synthesises a test phrase at the end and tells you if it failed.

## Privacy

Nothing you say or save leaves your device — except your typed/spoken turns when you
deliberately choose the Gemini backend, which sends them to Google. Speech synthesis is
local too: the text is never sent anywhere to be spoken. Built-in and Ollama send
nothing anywhere. There is no analytics, no account, and no network call the app makes on its
own. Clearing site data wipes your progress, so use Settings → Export if you care about it.
