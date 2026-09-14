# Putting Lunosia on lunosia.com

The app is static files plus one small function. Hosting it is free, it works on
the S11, and the AI partner comes with it — no PC involved, nothing running at
home, nothing to keep awake.

Follow the two sections below in order. The second one is the one people skip
and then wonder why the chatbot is quiet.

---

## 1. Deploy the site

Cloudflare Pages, from the repo, free, and it redeploys itself on every push.

1. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**
2. Pick the repository **`condorcrowns-art/Clad`**
3. Build settings:
   - Framework preset: **None**
   - **Production branch: `claude/victor-ai-familiarity-rf2730`**
   - Build command: *(leave empty — there is no build step)*
   - **Root directory: `parla`**
   - **Build output directory: *(leave empty)***
4. Deploy, then **Custom domains → Set up a domain → `lunosia.com`**

### The production branch is not `main`

`main` is empty. Everything — the app, the dictionary, the function — is on
`claude/victor-ai-familiarity-rf2730`, and Cloudflare defaults the production
branch to `main`, so accepting the default gets you a successful build of
nothing and a 404 on your own domain.

Setting the branch is also what makes it redeploy: every push to that branch
rebuilds the site by itself, which is where the work lands. If you later merge
it into `main`, change the production branch to `main` at the same time —
Pages watches one branch, and it will keep watching whichever you named.

Because your DNS is already at Cloudflare, the record is created for you and
HTTPS is issued automatically.

### Root directory, not build output directory

This one cost an hour, so it is worth being precise about.

Pages looks for `functions/` relative to the **root directory**, *not* the build
output directory. The app lives in `parla/` and so does the function, at
`parla/functions/api/chat.js`.

Set **root directory to `parla`** and leave **build output directory empty**.

The tempting wrong answer — root directory empty, build output `parla` — gets
you a site that loads perfectly and a chatbot that is silently dead. Assets
resolve from `parla/`, so every screen works; Pages looks for `/functions` at
the repository root, finds nothing, and skips Functions entirely. `/api/chat`
then falls through to the single-page app and returns `index.html`, so the
endpoint answers 200 with HTML instead of 404 — which defeats most ways you
would think to check it.

The build log says which happened. `No functions dir at /functions found.
Skipping.` is the broken case; `Compiled Worker successfully` is the working
one. Read it before changing anything else.

### About that 1.5 MB dictionary

`js/data/dict-es.json` is the biggest thing in the deploy. It is deliberately
*not* part of the initial page load: the app starts, and the file is fetched
once the page has settled, then cached by the service worker. Cloudflare serves
it compressed — about 500 KB on the wire — and after the first visit it is on
the phone for good, including offline.

So the first load on mobile data costs about half a megabyte more than it used
to, once, and buys the whole language. Nothing needs configuring for this.

### What you must not ship

`piper/` and `voices/` are in `.gitignore` and must stay there. They are ~150 MB
of binaries that are useless in a browser, and Pages has a 25 MB per-file limit.
`tools/cache/` is ignored too — it holds the raw source files the dictionary is
built from, and only the built output belongs in the repo.

---

## 2. Turn on the AI (two minutes, free, required)

The conversation partner on the phone runs on **Workers AI** — Cloudflare's own
models, on Cloudflare's hardware, included free on your account. The code is
already there. It just needs to be handed the model runner, which Cloudflare
calls a *binding*.

1. **Workers & Pages → your Pages project → Settings → Functions**
2. Scroll to **AI bindings** (some dashboards call it *Bindings* → *Add* → *AI*)
3. **Add binding**
   - Variable name: **`AI`** — exactly that, capitals, nothing else
   - Then **Save**
4. **Deployments → the latest one → Retry deployment**

That last step matters: a binding only reaches a deployment made *after* it was
added. Adding the binding and not redeploying is the single most likely way for
this to look broken.

### Checking it worked

Open `https://lunosia.com/api/chat` in a browser. You want:

```json
{"available":true,"models":["@cf/meta/llama-3.1-8b-instruct", ...]}
```

`"available":false` means the binding is missing or the deployment predates it —
go back to step 3.

If you get **the app's own HTML** instead of JSON — an unstyled page with the
nav at the bottom — the Function is not running at all and the root directory
is wrong. See *Root directory, not build output directory* above. In the app itself, **Settings → Conversation partner → This
site → Test connection** says the same thing in a sentence.

If Workers AI is ever down or rate-limited, the function walks through five
different models before giving up, and the app falls back to the built-in
scripted partner rather than showing you an error. You will notice the replies
get simpler; nothing breaks.

---

## What works where

| | On the S11 at `https://lunosia.com` | On your PC at `localhost` |
|---|---|---|
| Chatbot | **Workers AI**, via `/api/chat` | Ollama (qwen2.5:7b) |
| Voice | Android's Spanish voices | **Piper** neural voice |
| Dictionary — 31,000 words | yes, offline after first load | yes |
| Grammar checker | yes, offline, no model needed | yes |
| Pronunciation coaching | yes | yes |
| Your mistakes, scheduled | yes | yes |
| 20 grammar lessons | yes | yes |
| Word bank and frequency bands | yes | yes |
| Flash cards, SRS, review | yes | yes |
| Games (Pairs, Word rush, El or la, Dictation) | yes | yes |
| Ask — any word, meaning, conjugation | yes | yes |
| Verbs, 60-day challenge, stats | yes | yes |
| Microphone | yes, Chrome on Android | yes |
| Works offline after first load | yes | yes |

Progress is stored per device, in the browser. The phone and the PC keep
separate decks — there is no account and no sync, which is also why there is
nothing to leak.

### Which browsers it works in

Everything works everywhere current: the dictionary, the grammar checker, the
reading and listening, the writing, the games, the whole conversation by
typing. Firefox 113, Safari 16.2 and Chrome 111 are the floors, set by
`color-mix()` in the stylesheet — all three shipped in 2023.

The one real exception is **speaking**. `SpeechRecognition` is a Chromium and
Safari API; Firefox has never shipped it and shows no sign of doing so, and
there is no polyfill that does not involve paying someone for cloud
transcription. So in Firefox the microphone is rendered visibly off, says why
when you point at it, and puts the cursor in the typing box if you press it
anyway — a full-strength microphone button that cannot work is a trap, because
you have to press it to find out.

`test/nomic-browser.test.js` runs the app with the API deleted and checks that
every other screen still works and nothing throws.

| | Speaking | Everything else |
|---|---|---|
| Chrome, Edge, Opera | yes | yes |
| Safari 16.2+ (macOS, iOS) | yes | yes |
| Samsung Internet | yes | yes |
| Firefox 113+ | no — type instead | yes |

### Why Piper does not come with it

A page served over **https** is forbidden by every browser from calling
**http://localhost**. That is mixed content, and Chrome additionally blocks
private-network requests from public sites. There is no header, no flag, no
setting on your site that changes it. So the phone uses Android's built-in
Spanish voices, which are genuinely decent, and Piper stays a desk luxury.

The same rule is why the phone cannot reach your Ollama, and why Workers AI
exists in this app at all.

---

## Optional: your own Ollama from the phone

If you would rather the conversations never leave your hardware, a Cloudflare
Tunnel gives your PC's Ollama an `https://` address, which satisfies the rule
above properly.

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create parla
```

Route a subdomain — `ollama.lunosia.com` → `http://localhost:11434` — then in
the app: Settings → Conversation partner → Ollama → URL →
`https://ollama.lunosia.com`.

**Put access control on it.** An open tunnel is an open door to a machine on
your desk. Cloudflare Access with a one-tap email login is free for up to 50
users and takes about five minutes.

Your PC has to be awake for this to work, which is the reason it is the option
and Workers AI is the default.

There is also **Gemini** in the same picker — Google's free tier, key stored
only in your browser, paste it and go. Same privacy trade as Workers AI, one
more account to hold.

---

## It installs as an app on the S11

The manifest now points at real PNG icons (`icon-192.png`, `icon-512.png`).
That matters: Chrome on Android will not offer to install a site whose only
icon is an inline SVG, which is what shipped before — so the one device this is
meant to live on was the one that would not install it.

Once it is on https, Chrome on Android will offer **Add to Home Screen**. It
then runs full-screen with no address bar, keeps working offline through the
service worker, and behaves like an installed app. That is the whole reason this
was built as a PWA rather than something needing the Play Store.

If a deploy does not seem to take on the phone, it is the service worker holding
the old files: pull down to refresh twice, or Chrome → ⋮ → Settings → Site
settings → lunosia.com → Clear & reset.

---

## Google AdSense

There is a full walkthrough in **[ADSENSE.md](ADSENSE.md)** — what has to be
true first, the exact snippets, where they go, and the two rules that get
accounts banned. The short version:

**Approval is the hard part, not the code.** AdSense reviews a site for content
a reader would want on its own, and an application whose home page says
"Loading…" until thirty thousand lines of JavaScript have run is the shape that
gets "Low value content" back. The site now ships `about.html`, a `<noscript>`
summary on the home page, `robots.txt` and `sitemap.xml` to give it something to
read. It may still be refused; you can reapply as often as you like.

**The privacy policy is already written for this app.** `privacy.html` says what
is stored (everything, in your browser), that your turns go to Cloudflare's
Workers AI on this site, what Google's ad cookies do, and where to write
(`Canarybears@gmail.com`). Nothing is left to fill in.

**Expect very little money.** Single-digit dollars a month at best, against a
$100 payout threshold. The site costs nothing to run, so nothing here depends on
the revenue.
