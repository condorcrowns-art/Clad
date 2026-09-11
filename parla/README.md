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
| **31,000-word dictionary** | Meaning, gender, register and where it is said — offline, built from open Wiktionary and subtitle-corpus data |
| **Any form of any word** | Type `pidiéndoselo` and get *pedir*, gerund, with *se* and *lo* on the end. Conjugations, plurals, feminines, `-mente`, `-ísimo`, diminutives, attached pronouns |
| **Frequency bands** | The words ordered by how often people actually say them, so "how much Spanish do I know" has a real answer |
| **A grammar checker that is not a model** | Agreement, conjugation, ser/estar, por/para, the personal a — decided from the dictionary and the morphology engine, offline, at 0 false positives across every sentence the app ships |
| **Your mistakes come back** | Every correction is scheduled. The sentence you got wrong returns until you can write it correctly from memory — the half of the loop most apps drop |
| **20 grammar lessons** | The places English pulls you the wrong way, each with the rule, why you get it wrong, minimal pairs and a drill. Sorted by what you keep getting wrong |
| **Pronunciation that diagnoses** | Say a word and be told *which sound* broke — "your rr came out as a single tap" — from real phonology, not a pass/fail from the recogniser |
| **521 curated words** | With native audio, gendered articles, and a real example sentence each |
| **Spaced repetition** | Full SM-2. Words you miss come back tomorrow; words you nail vanish for months |
| **Conjugation trainer** | Any verb × 11 tenses × 6 persons from rules — stem changes, spelling rules, compounds of the irregulars, imperatives, participles and gerunds. Vosotros is off by default; it is Spain-only |
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
| A dictionary | a subscription | Wiktionary and an open frequency list, built into a file at release time |
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
  dict.js             the dictionary at runtime: lazy load, index, search, bands
  morph.js            any Spanish form worked back to the word you look up
  grammar.js          the checker: agreement and conjugation decided, not guessed
  phon.js             Spanish phonology: sounds, syllables, stress, and what broke
  brain.js            four backends behind one interface, model auto-pick,
                      JSON retry, and the offline corrector
  ui.js               tiny DOM toolkit
  views-talk.js       scenario picker, conversation, session summary
  views-drill.js      flashcard review, conjugation trainer
  views-coach.js      the Ask screen: any word, meaning, conjugation, pitfalls
  views-games.js      Pairs, Word rush, El or la, Dictation
  views-words.js      the word bank: 31,000 words by frequency band
  views-grammar.js    the twenty lessons, and one lesson with its drill
  views-fix.js        the sentences you got wrong, to write out correctly
  views-say.js        the ten sounds, how to make them, and what went wrong
  views-progress.js   home, 60-day grid, stats, mistake journal, settings
  app.js              router + bootstrap
functions/
  api/chat.js         Cloudflare Pages Function: the partner on the public site,
                      running on Workers AI so a phone needs no PC
tools/
  build-dict.js       turns open Wiktionary + frequency data into dict-es.json
  make-icons.js       renders the PWA icons Android needs to offer "install"
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
  grammar.test.js         the checker: what it catches, and what it leaves alone
  phon.test.js            transcription, syllables, stress, and naming a mistake
  say-browser.test.js     a mispronunciation, diagnosed rather than failed
  fix-browser.test.js     one mistake followed all the way round the loop
  verbs.test.js           every conjugation rule, form by form
  dict.test.js            the dictionary, and working any form back to a lemma
  words-browser.test.js   the word bank and the dictionary-backed Ask screen
  hosted.test.js          the Workers AI backend, and its fallbacks
  games-browser.test.js   all four study games, played through, at phone size
  hosted-browser.test.js  the deployed site end to end against the real function
  chrome-browser.test.js  the nav, the More sheet, hover states, folded panels,
                          landscape, and whether anything runs off the side
  nav.js                  navigating the way a person does, tab or More sheet
  mock-tts-server.js      stands in for serve.ps1's /tts on non-Windows
  mock-pages-server.js    stands in for Cloudflare Pages, running the real
                          functions/api/chat.js against a faked AI binding
  piper-browser.test.js   the whole thing in a real browser
```

## Being corrected, and it mattering

The loop the whole app is built on is: say something, be corrected, produce the
fix again later from memory. The third part is the one that teaches, and it is
the one language apps quietly skip.

**The correction** comes from `js/grammar.js` before it comes from a model.
Agreement is a decidable question once you know a word's gender, number and
person — and after the dictionary and the morphology engine, the app knows
both. So it does not guess: `la problema` is wrong because *problema* is
masculine, `yo tiene` is wrong because *tiene* is third person, and the
correction says which rule it applied rather than paraphrasing a hunch. It runs
in under a millisecond, offline, with no model at all.

Its bar is zero false positives. A learner told their correct Spanish was wrong
learns something false and stops trusting the tool, so every rule needs positive
evidence and stands down without it — and `test/grammar.test.js` runs the whole
checker over every Spanish sentence the app ships, about eight hundred of them,
and fails if a single one is flagged. Where the model proposes a fix the rules
disagree with, the rules win: a small model "correcting" good Spanish is the
most damaging thing this app could do.

**The schedule** is the same SM-2 deck as vocabulary. Every correction becomes a
card keyed on the sentence you actually wrote. Get it right and it goes away for
four days; get it wrong and it is back tomorrow. Making the same mistake twice
moves it up the queue rather than filing it twice.

**The lesson** behind it is one tap away. `js/data/grammar-es.js` is twenty
points where English pulls you the wrong way — ser/estar, gustar running
backwards, the two past tenses, por/para, the personal a, the subjunctive — each
with the rule in one sentence, why your English causes the mistake, minimal
pairs, and a drill whose wrong answers are the ones a learner would actually
give. The grammar screen sorts them by what the checker has caught you doing.

## Pronunciation, without a phonetics degree

Speech recognition gives you a verdict: it heard "pero" when you meant "perro".
You already knew you got it wrong. What you need is the next sentence — *your
rr came out as a single tap, here is what to do with your tongue* — and that
takes phonology rather than a comparison of two strings.

Spanish makes it possible in a way English never would: the spelling is close to
phonemic, so the pronunciation of any word follows from rules. `js/phon.js`
derives it — 20 transcription cases and 20 syllabifications are checked against
how the words are actually said, including the awkward ones (`día` is dí-a
because an accented weak vowel breaks the diphthong; `psicología` starts with a
cluster Spanish does not otherwise allow). From that it gets syllables, stress
from the two spelling rules, and an alignment between what you meant and what
was heard.

The alignment is the diagnosis. A substitution of /ɾ/ for /r/ is not "wrong", it
is a tap where a trill belongs, and that has a fix you can practise. Ten sounds
carry the coaching: what to physically do, what English makes you do instead,
minimal pairs to prove you can *hear* the difference before you try to make it,
and a trick — the rr is already in "pot of tea" said fast in an American accent.

It works offline, it keeps score per sound, and the speaking drill in Review
uses the same engine, so a fluffed word there ends with a way into the sound
that fluffed it.

Two dialect choices are settings rather than facts: seseo and yeísmo. The
defaults are Latin American, because that is who the learner is most likely to
be talking to.

## Something to read

Drills build the pieces. Reading is where the pieces turn into a language,
because it is the only place a word turns up in a sentence somebody meant — and
it is the one activity a learner will do voluntarily for twenty minutes.

Twelve short stories, A1 to B1, in `js/data/reading-es.js`. Stories rather than
textbook paragraphs: a dog nobody claims, a missed bus stop, a false friend in a
pharmacy, forty minutes in a silent taxi. Wanting to know what happens next is
the only reliable engine for reading in a language you do not speak.

What makes reading possible before you are ready for it is that every word is
one tap from its meaning — not a translation of the sentence, which just means
reading the English, but the word you are stuck on:

    tiene
    to have · to hold, grasp
    tener — present, él/ella/usted

That runs on the dictionary and the morphology engine, so it works with the
phone in aeroplane mode. Tap the line rather than a word and you get that line
in English; there is a button for all of them at once, and one for reading the
whole thing aloud, which marks the line the voice is on so you can follow.

Then three comprehension questions about what happened, not which word means
what, and the handful of words the text was built around, ready to go into the
same deck as everything else with the sentence they turned up in attached.

Every Spanish sentence in the file — 204 of them, counting the questions — is
run through the grammar checker. That found four bugs, all in the checker: it
read `está` as the demonstrative `esta`, it wanted a `no` in front of `nadie
hizo nada`, it read the object pronoun in `nadie la toque` as an article, and it
tried to make the adverb in `¿quién le ayuda primero?` agree with a noun. All
four are now regression tests.

It also found one in the dictionary. Wiktionary files `mojado` as both the
adjective *wet* and an ethnic slur, and the builder let the slur cast a full
vote for the word's part of speech — so *wet* disappeared, and tapping `mojado`
in a story about a wet dog returned a paragraph about crossing borders. A sense
labelled pejorative, derogatory, offensive or vulgar now stays in the file but
does not get to decide what a word is or to be the first thing a learner reads.

## The same texts, with nothing on the screen

Reading a sentence and hearing one are different skills, and the second is the
one that fails you in a conversation. On the page the words arrive already
separated; in the air *¿de dónde eres?* is a single word until your ear has
learned where the joins are.

So the twelve texts have a listening mode with the text withheld. Play a line,
decide whether you caught it, then look — the Spanish first, the English on a
second tap. Playing a line four times is the drill, not a failure at it, and the
screen counts the plays rather than hiding them.

The speed control is the part that makes this work rather than merely
frustrate. Natural speed is the wall, and the way over it is to meet the same
sentence slow, then slower-than-natural, then at speed: three passes over one
line beats one pass over three. Slow and Easier are multipliers on whatever
speed you already chose, so someone who likes a slow voice everywhere does not
end up at a crawl here, and Natural is exactly the speed the rest of the app
speaks at.

At the end come the same comprehension questions as the reader. Answering them
off the audio alone is a genuinely different result from answering them off the
page, so it is kept as its own score — the shelf shows 📖 and 🎧 separately, and
getting them both is the thing to aim at.

## Where the words come from

`js/data/dict-es.json` is built, not written. `tools/build-dict.js` takes four
freely-licensed sources and turns them into 31,000 headwords:

- **en.wiktionary Spanish↔English glosses**, exported by Matthias Buchmeier
  (CC BY-SA 3.0 / GFDL) — the meanings, parts of speech, gender tags and
  register labels. Both directions, because a gloss that translates *back* to
  the word you started from is its core sense, and the other five are the long
  tail. That is how "tener" gets "to have" on the card rather than "to be of a
  measure or age".
- **hermitdave/FrequencyWords** over OpenSubtitles 2018, Spanish and English
  (CC BY-SA 4.0) — the ordering. Spanish decides which words ship first;
  English breaks ties between glosses.

The output file carries its own attribution and licence, and it is committed,
so the app never touches any of this at runtime. Rebuild with:

```bash
node tools/build-dict.js            # downloads to tools/cache/ if empty
node tools/build-dict.js --offline  # fails rather than reaching the network
```

The commonest few hundred words are the ones a Wiktionary dump handles worst —
it will tell you "una" is "an indefinite plural pronoun using a singular
feminine item" — so those are written by hand in the builder and win where they
exist, as do the 521 curated corpus words.

## Adding content

- **A word** — append one row to `js/data/vocab-es.js`. SRS, audio and drills pick it up
  automatically. (The 31,000-word dictionary is separate and is rebuilt, not edited.)
- **A verb** — add `['infinitive', 'english', 'a1']` to `VERBS` in `verbs-es.js` to put it in
  the drill. Conjugation needs nothing: stem changes come from the `STEM_IE`/`STEM_UE`/`STEM_I`
  lists, spelling rules apply by shape, compounds of the irregulars are derived, and only a
  genuinely suppletive verb needs a row in `IRREGULAR`.
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
node test/grammar.test.js          # the checker, and its zero-false-positive bar
node test/phon.test.js             # sounds, syllables and stress, against real Spanish
node test/verbs.test.js            # conjugation, form by form, against real Spanish
node test/dict.test.js             # the dictionary, and unpicking any word form
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
node test/words-browser.test.js 8765        # the word bank, and Ask with a dictionary behind it
node test/chrome-browser.test.js 8765       # the nav, hover states, and nothing off the side
node test/fix-browser.test.js 8765          # corrected, scheduled, surfaced, fixed
node test/say-browser.test.js 8765          # a wrong sound, named and coached
node test/read-browser.test.js 8765        # a story, tapped, heard and answered
node test/hear-browser.test.js 8765        # the same story with the text withheld
node test/write-browser.test.js 8765       # write badly, be caught, be re-drilled
node test/contrast-browser.test.js 8765    # every screen, both themes, AA measured
node test/skills-browser.test.js 8765      # six skills, and naming the neglected one
node test/transfer-browser.test.js 8765    # two devices, one deck, nothing lost
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

## How long the lines get

Past about seventy characters the eye loses the start of the next line. `main`
is 880px wide on a desktop, which put the intro paragraphs at 96 characters and
the reading lines at 104 — on the one screen whose entire purpose is sustained
reading, on the machine the app is mostly used on.

Running prose is capped at 60ch now (`ch` is the width of a zero, wider than
the average lowercase letter, so that lands at roughly 68 real characters).
Cards, grids and rows keep the full width: a grid of tiles is not something
anybody reads left to right. On a phone nothing changes, because nothing was
ever that wide.

## Six things, and the one you are avoiding

The app teaches six skills and the stats screen counted two. That is not merely
incomplete — it is misleading, because someone reading it would conclude they
were doing well while having never once written a sentence.

All six are there now, each with how far in you are. The useful part is not the
six counters, though; it is the line underneath. People practise what they are
already good at, so the screen finds the skill you have been skipping and says
so: *you have not started writing yet*, with a way into it. When you have done
six writing tasks it stops saying that and names whatever is furthest behind
instead.

Speaking is the one with no ceiling, so it gets an empty track rather than a
progress bar. A full bar next to "12 conversations" would say you are finished
with speaking Spanish, which is not a thing that happens.

Nobody is told off before they have started: on day one there is nothing to be
behind on, and telling someone who has done nothing that they are neglecting
writing is noise.

## Can you read it?

The most basic quality bar there is, and the app was failing it in a lot of
places at once — invisibly, because I have good eyes and a bright screen and
was looking at screenshots.

Two systemic faults, both found by measuring rather than looking:

* **In dark mode every accent is a bright pastel**, and white text on one runs
  1.58 to 2.83:1 against a 4.5 minimum. Every chip, every completed challenge
  day, the selected tense button. The theme already had `--accent-ink` for
  exactly this — white in light, near-black in dark — and nothing used it; the
  rules said `color: #fff`.
* **The "faint" text tier was 3.09:1 on white**, under what small text needs,
  and it is the tier carrying the stat labels, the card meta lines and half the
  hints in the app.

Two shades of each semantic colour now, because *a colour that reads well as a
fill behind white* and *a colour that reads well as text on its own pale tint*
are not the same colour: `--good` fills, `--good-text` writes. In dark mode the
two collapse, since there the bright accent already reads at 5.5:1 and up on
its own dark tint. And where the faint tier sits on a tinted row rather than a
white card it steps up to `--ink-soft` instead of the whole tier being darkened
into `--ink-soft` everywhere.

`test/contrast-browser.test.js` walks all thirteen screens in both themes and
measures what a person would actually see: the colour composited through every
alpha layer down to the opaque ground, against the AA threshold for that text's
size and weight. It is not a proxy for looking at the screen — it is the thing
looking cannot do, which is arithmetic. The first version of it read alpha
colours raw and reported the word bank at 1.27:1, which was the audit's bug and
not the app's; compositing fixed it. Both classes of regression were confirmed
by putting the old value back and watching it fail.

## The plan is now as wide as the app

The sixty-day challenge is the spine: it is on the home screen, it has its own
tab, and it is what someone who wants to be told what to do will follow. It had
quietly become narrower than everything around it — sixty days of nothing but
conversation meant a learner following it literally never opened the reading,
the listening, the writing or the sounds. Four of the six things Parla can
teach, invisible to the person most likely to do as they are told.

Every day now carries a second task, sitting quietly under the day's
conversation as *and then*. Speaking is still the spine; this is the "and
then". Where it can, it matches the day: day 9 is *me gusta* and its second
task is the lesson on gustar running backwards, day 23 is the preterite of *ir*
and its second task is writing about last weekend, day 41 is imperatives and
its second task is writing three pieces of advice for a friend visiting your
country.

Two rules the plan keeps:

* **A text is read before it is heard.** *El perro del tercero* on day 7, and
  again on day 19 with the text hidden. Listening to something you have never
  seen is the hardest version of the exercise and a plan that starts there is a
  plan people give up on.
* **The sounds do not pretend.** A sound does not map onto a conversation
  topic, so they are simply spread evenly and all ten get a turn, rather than
  being given a fake justification.

Done-ness is read off the target's own progress rather than stored twice: a
text you have already read is read, whether the challenge sent you there or you
found it yourself.

`test/challenge.test.js` checks the pairing holds — every kind is used, every
one of the ten sounds appears, the subjunctive is in the second half and after
the preterite, no day repeats another — and above all that **every one of the
sixty ids resolves**. A second task pointing at a renamed text is a dead card
on the home screen that does not throw; it just quietly renders nothing. The
check found one on its first run.

## Somewhere to write

Speaking is production, but it is production under time pressure: you say the
sentence you can reach rather than the one you mean, and the partner fills the
silence before you have found it. Writing is where you find out what you can
actually build.

Twenty-four tasks in `js/data/writing-es.js`, each built around one thing an
English speaker has to get right and would rather avoid, with the prompt chosen
so you cannot answer it without meeting that thing. *¿Qué te gusta hacer los
fines de semana?* cannot be answered without gustar running backwards. *Cuenta
un viaje que hiciste* cannot be answered without the preterite against the
imperfect in the same paragraph. *¿Qué cambiarías de tu vida si pudieras?*
cannot be answered without si + imperfect subjunctive and a conditional.

Everything you write goes through `brain.correctOffline` — the grammar checker,
offline, instant — and every sentence it catches is written straight into the
same spaced-repetition queue as a mistake made out loud, so it comes back in a
day or two and you have to produce the fix from memory. Anything short of that
is a spell-checker.

Two things the screen is careful to be honest about, because a tool that
oversells itself teaches you to distrust it where it could have helped:

* **It checks the mechanics, not the meaning.** Agreement, person, ser against
  estar, gustar being backwards. It cannot tell you your sentence does not
  answer the question, or that nobody would phrase it that way.
* **Silence is not approval.** "Nothing to fix" means no rule fired, which the
  screen says in those words. The two model answers are always shown
  afterwards, and they are the part that covers what rules cannot.

Writing the prompts found four more bugs, three in the checker and one in the
dictionary:

* **The dictionary gendered common-gender people.** *Cliente* was filed
  feminine and *paciente* masculine — the source picks one at random — so the
  app taught an article that is wrong half the time and the checker "corrected"
  *los clientes* to *las clientes*. A hundred-odd nouns for people whose form
  does not change are marked `mf` now, which makes the checker stand down on
  them. It is a list and not a rule, because the endings do not separate them:
  *puente*, *diente*, *ambiente* and *fuente* have real genders worth keeping,
  and *revista* and *pista* are not people at all.
* **`es solo una herramienta` was corrected to `está solo`.** Before a noun
  phrase, *solo* is the adverb *only*; the adjective *alone* comes at the end
  of its clause, which is the *estoy solo* the rule was for.
* **Corrections were printed from the folded lookup key**, so fixing *pequeño*
  produced *pequena*. Folding is fine for finding a word in a table and wrong
  for printing it back.
* **`me gusta los libros` was not caught at all** — the commonest mistake an
  English speaker makes in Spanish, and it survives years, because in English
  *you* are the subject so the verb never moves. Six backwards verbs are
  checked now (gustar, encantar, doler, interesar, faltar, importar…), with the
  exception that keeps the rule teachable: an infinitive after them stays
  singular, however many activities are listed.

And one rule that was simply missing: *dos hermano*. English marks the plural
too, so this is not a concept anyone has to learn — it is what people drop while
concentrating on the verb, which makes it exactly the slip worth catching and
re-drilling.

## Two design tokens that were never there

`--card` and `--r-md` were used by eleven rules in `css/fiesta.css` and defined
by nothing. An undefined custom property does not fall back — the whole
declaration is thrown out — so every card built on them rendered square and
transparent: the reading shelf, the sound cards, the grammar cards, the
frequency bands. They still had their borders, which is why four screens looked
plausible enough to survive a visual audit.

`test/fiesta.test.js` now reads the stylesheets off disk and checks that every
`var(--x)` has a definition, then checks in the browser that a card on each of
those four screens really does have a radius and a filled background. Both
checks were verified by deleting the token and watching them fail.

Reading the files rather than walking the CSSOM is deliberate: a shorthand
holding an unresolved `var()` — `background: var(--card)`, `border-radius:
var(--r-md)`, exactly the pair that broke — is not enumerable on a rule's style
declaration, so a CSSOM scan cannot see the thing it is for. The first version
of this check walked the CSSOM, passed, and was worthless.

## Keeping what you have built

Everything the app knows about you is in one browser's localStorage. That is
two problems wearing one coat: clear the site data and a sixty-day streak goes
with it, and the phone and the computer keep two decks that never meet.

Settings → Your progress saves a dated JSON file, and takes one back. The
important word is *takes* — import used to call `merge(defaults(), incoming)`,
so bringing the phone's save to the computer replaced the computer's deck with
the phone's. It merges now, and the rule throughout is that neither side loses:

* words, mistakes, sessions and challenge days are the **union**
* where the same card exists on both, the one **further along** is kept — six
  recalls beats one, and taking the phone's card would have thrown away three
  weeks of the computer's spacing
* XP, streak and the session counters are the **maximum, never the sum**,
  because a session practised on one device and synced to the other is one
  session and adding them would invent progress nobody earned
* the voice, the microphone pause and the theme stay the device's own — what
  sounds right on a laptop is not what sounds right on a phone

Merging the same file twice does nothing the second time and says so. A file
that is not a Parla save is refused whole rather than half-applied. Pick the
file with the file picker on either device; the paste box is still there for
when moving a file between them is the hard part.

## Privacy

Nothing you say or save leaves your device — except your typed/spoken turns when you
deliberately choose the Gemini backend, which sends them to Google. Speech synthesis is
local too: the text is never sent anywhere to be spoken. Built-in and Ollama send
nothing anywhere. There is no analytics, no account, and no network call the app makes on its
own. Clearing site data wipes your progress, so use Settings → Your progress → Save a
copy if you care about it. That file never goes anywhere either: it is written by
your browser and read back by your browser.
