# Putting Parla on lunosia.com

The app is static files. Hosting it is easy and free. **What is not free or easy
is the part that makes it good**, so read the catch first.

---

## The catch, up front

Two things currently run on your PC, reached over `http://localhost`:

| Piece | Where it runs now | On a phone at `https://lunosia.com` |
|---|---|---|
| **Ollama** — the conversation partner | your PC, port 11434 | **blocked** |
| **Piper** — the neural voice, via `/tts` | your PC, `serve.ps1` | **not there** |

That is not a configuration problem you can talk your way out of. A page served
over **https** is forbidden by every browser from calling **http://localhost** —
it is mixed content, and Chrome additionally blocks private-network requests
from public sites. There is no header, no flag, no setting on your site that
changes it.

So on your phone you get, by default: the whole app, all your progress, every
drill, the 60-day challenge, the word lookup from the built-in corpus and the
grammar engine — and **Android's own Spanish voices** instead of Piper, which
are genuinely decent.

To get the AI partner on your phone, pick one of these two.

### Option A — Gemini (5 minutes, free, works anywhere)

Already built in. Google's free tier, key stored only in your browser.

1. Get a key at `aistudio.google.com/apikey`
2. On your phone: Settings → Conversation partner → **gemini**, paste the key

Done. Works on any network, no PC involved. The trade is that your typed and
spoken turns go to Google — which is exactly what Ollama exists to avoid, so it
is your call, and it is why this is not the default.

### Option B — Cloudflare Tunnel to your own Ollama (30 minutes, free, private)

You already use Cloudflare, so this costs nothing extra. It gives your PC's
Ollama an `https://` address, which solves the mixed-content problem properly
and keeps every conversation on your own hardware.

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create parla
```

Route a subdomain to it — `ollama.lunosia.com` → `http://localhost:11434` — then
in the app: Settings → Ollama URL → `https://ollama.lunosia.com`.

**Put access control on it.** An open tunnel is an open door to a machine on
your desk. Cloudflare Access with a one-tap email login is free for up to 50
users and takes about five minutes.

Your PC has to be awake for this to work.

---

## Deploying the site

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

### What you must not ship

`piper/` and `voices/` are in `.gitignore` and must stay there. They are ~150 MB
of binaries that are useless in a browser, and Pages has a 25 MB per-file limit.

---

## It installs as an app on the S11

Once it is on https, Chrome on Android will offer **Add to Home Screen**. It
then runs full-screen with no address bar, keeps working offline through the
service worker, and behaves like an installed app. That is the whole reason this
was built as a PWA rather than something needing the Play Store.

---

## Google AdSense

Two things to know before you spend time on it.

**It needs approval, and approval needs content.** AdSense reviews a site before
serving ads, and single-page apps with little indexable text are commonly
rejected. You will likely need a real landing page describing what Parla is,
plus a privacy policy and an about page. That is a content job, not a code job.

**The privacy policy is not optional and is not boilerplate for this app.** It
must say what Parla stores (everything, in your browser, via localStorage —
progress, mistakes, the notes your partner keeps about you), that it never
leaves the device *unless* the Gemini backend is switched on, and what Google's
ad cookies do. If anyone in the EU or UK uses it you also need a consent banner
before any ad script runs.

`ads.html` in this folder is the ad slot markup and `privacy.html` is a starting
privacy policy with the app-specific parts already written. Read the privacy
policy before publishing it — it describes this app, but only you can say
whether it describes what you intend to do with it.

**Expect very little money.** A personal-use language app makes single-digit
dollars a month at best. If the point is to cover a domain renewal, fine. If it
is a reason to add tracking to a private study tool, it is a bad trade, and you
already have the version with no ads in it.
