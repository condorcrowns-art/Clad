# Putting Parla on lunosia.com

The app is static files plus one small function. Hosting it is free, it works on
the S11, and the AI partner comes with it — no PC involved, nothing running at
home, nothing to keep awake.

Follow the two sections below in order. The second one is the one people skip
and then wonder why the chatbot is quiet.

---

## 1. Deploy the site

Cloudflare Pages, from the repo, free, and it redeploys itself on every push.

1. **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**
2. Pick this repository and the branch
3. Build settings:
   - Framework preset: **None**
   - Build command: *(leave empty — there is no build step)*
   - **Build output directory: `parla`**
4. Deploy, then **Custom domains → Set up a domain → `lunosia.com`**

Because your DNS is already at Cloudflare, the record is created for you and
HTTPS is issued automatically.

### Do not change the output directory

`parla` has to be the output directory, and it is not cosmetic. The Pages
Function that answers the chatbot lives at `parla/functions/api/chat.js`, and
Pages only finds a `functions/` folder if it sits at the root of what you
published. Point Pages at the repository root instead and the site will still
load — and `/api/chat` will 404, which looks exactly like "the AI is broken".

### What you must not ship

`piper/` and `voices/` are in `.gitignore` and must stay there. They are ~150 MB
of binaries that are useless in a browser, and Pages has a 25 MB per-file limit.

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
go back to step 3. In the app itself, **Settings → Conversation partner → This
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
| Flash cards, SRS, review | yes | yes |
| Games (Pairs, Word rush, El or la, Dictation) | yes | yes |
| Ask — any word, meaning, conjugation | yes | yes |
| Verbs, 60-day challenge, stats | yes | yes |
| Microphone | yes, Chrome on Android | yes |
| Works offline after first load | yes | yes |

Progress is stored per device, in the browser. The phone and the PC keep
separate decks — there is no account and no sync, which is also why there is
nothing to leak.

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

Once it is on https, Chrome on Android will offer **Add to Home Screen**. It
then runs full-screen with no address bar, keeps working offline through the
service worker, and behaves like an installed app. That is the whole reason this
was built as a PWA rather than something needing the Play Store.

If a deploy does not seem to take on the phone, it is the service worker holding
the old files: pull down to refresh twice, or Chrome → ⋮ → Settings → Site
settings → lunosia.com → Clear & reset.

---

## Google AdSense

Two things to know before you spend time on it.

**It needs approval, and approval needs content.** AdSense reviews a site before
serving ads, and single-page apps with little indexable text are commonly
rejected. You will likely need a real landing page describing what Parla is,
plus a privacy policy and an about page. That is a content job, not a code job.

**The privacy policy is not optional and is not boilerplate for this app.** It
must say what Parla stores (everything, in your browser, via localStorage —
progress, mistakes, the notes your partner keeps about you), that your typed and
spoken turns are sent to Cloudflare's Workers AI when that partner is selected,
and what Google's ad cookies do. If anyone in the EU or UK uses it you also need
a consent banner before any ad script runs.

`ads.html` in this folder is the ad slot markup and `privacy.html` is a starting
privacy policy with the app-specific parts already written. Read the privacy
policy before publishing it — it describes this app, but only you can say
whether it describes what you intend to do with it.

**Expect very little money.** A personal-use language app makes single-digit
dollars a month at best. If the point is to cover a domain renewal, fine. If it
is a reason to add tracking to a private study tool, it is a bad trade, and you
already have the version with no ads in it.
