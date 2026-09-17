# Putting AdSense on lunosia.com

Everything that can be done before you have a publisher id is done. This file
is the rest: what to expect, the exact steps, and the two rules that get
accounts banned permanently.

## The violation notice — "ads on screens without publisher content"

Approval came back with a Policy Center violation of exactly this shape:

> **Google-served ads on screens without publisher content.** We do not allow
> Google-served ads on screens without content or with low value content,
> that are under construction, or that are used for alerts, navigation, or
> other behavioural purposes.

That is a precise description of the app. Home, Talk, Review, Games, Write,
Say and Settings are interactive controls with almost no running text — the
"navigation, or other behavioural purposes" clause is not a stretch, it is
what those screens are. The mistake was loading the AdSense script in
`index.html`, so Google's crawler found ads verified for a page that is, by
design, mostly buttons.

**The fix is not a smaller ad or fewer ads. It is that the script never loads
inside the app at all.** It now loads only on the pages that are actually
prose someone would read on their own: `about.html` and the six grammar
guides under `guides/`. Nowhere else — not the app, not the guides hub page
(itself mostly a grid of links), not the privacy, terms or contact pages,
which are necessary but are not "content" in the sense the policy means.

This is enforced in `tools/build-pages.js` — the script is emitted only when
a page is built with `ads: true` — and checked by `test/pages.test.js`, which
fails if any page outside that list ever carries it, or if one of the seven
that should have it doesn't.

**After this deploys:** wait a few minutes for Cloudflare Pages to build,
confirm with `curl.exe -s https://lunosia.com/ | findstr adsbygoogle` (should
print nothing) and `curl.exe -s https://lunosia.com/about.html | findstr adsbygoogle`
(should print the script tag), then go back to the Policy Center screen, tick
**"I confirm that I have fixed the issues"**, and click **Request review**.
Google re-crawls rather than acting instantly, so the review can take from a
few hours to a couple of weeks.

## What to expect

**Approval is the hard part, not the code.** AdSense reviews a site for content
a reader would want on its own. An application whose home page says "Loading…"
until thirty thousand lines of JavaScript have run is the classic "Low value
content" rejection, and that is what this site was.

It is not that any more. There are now eleven written pages and about 8,700
words of original material — the grammar guides, the pronunciation guide, about,
contact, privacy, terms — all cross-linked, all in the sitemap, all reachable
from the app. That is a real site rather than an app with a privacy policy
bolted on.

It may still be refused. Reapplying costs nothing and there is no limit, and a
rejection tells you what it objected to. Fix that and go again.

**The money is negligible.** Roughly $1–3 per thousand page views for this kind
of traffic, and Google does not pay out below $100. A site with a handful of
visitors a day earns pennies a month and will not reach the threshold for
years. Do this because you want the site findable and explaining itself. The
site costs nothing to run either way.

## Before you apply

- [x] Live on your own domain over HTTPS.
- [x] A page explaining what the site is — `about.html`.
- [x] Substantial original content — `guides/`, six pages built from the app's
      own lessons.
- [x] A privacy policy, linked from every page — `privacy.html`.
- [x] Terms of use — `terms.html`.
- [x] A contact page with a real address — `contact.html`, `Canarybears@gmail.com`.
      Watch that inbox; it is where Google writes.
- [x] Navigation on every page, header and footer, so nothing is an orphan.
- [x] `robots.txt` and `sitemap.xml`, with `js/` and `css/` left crawlable so
      Google renders the app rather than the empty shell.
- [ ] **You are 18 or over**, with a Google account and a bank account in your
      own name that can receive the payment.

## Worth doing first, and free

Before applying, put the site in **Google Search Console**
(<https://search.google.com/search-console>) and submit `sitemap.xml`. It is
free, takes ten minutes, and it means that when the reviewer looks, Google has
already crawled and indexed the written pages rather than meeting them cold. It
also tells you if anything is blocked or erroring.

## Applying

1. <https://adsense.google.com>, sign in with your Google account.
2. Enter `lunosia.com` and your country. **The country cannot be changed
   later** — it fixes the payment currency and the tax forms.
3. AdSense gives you a snippet containing your publisher id, of the form
   `ca-pub-1234567890123456`. Keep that tab open.
4. The snippet goes in the `<head>` of every page. The written pages are
   generated, so add it once in `tools/build-pages.js` — in the `shell()`
   function, just before `</head>` — and once by hand in `index.html` after the
   stylesheet links:

   ```html
   <script async
     src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR-ID-HERE"
     crossorigin="anonymous"></script>
   ```

   Then `node tools/build-pages.js` to rebuild, and bump `CACHE` in `sw.js` so
   browsers pick the change up.

5. Create `ads.txt` next to `index.html` with one line:

   ```
   google.com, pub-YOUR-ID-HERE, DIRECT, f08c47fec0942fa0
   ```

   Note it is `pub-`, not `ca-pub-`, in this file. Without `ads.txt` AdSense
   flags your inventory as unauthorised and pays less for it.

6. Commit and push. Pages redeploys on its own; give it a minute, then check
   <https://lunosia.com/ads.txt> shows that line.
7. Back in AdSense, click **Verify**. Review takes a day to a few weeks.

## Placing a unit once approved

Create an ad unit, which gives you a slot id, then put the block where it
belongs:

```html
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-YOUR-ID-HERE"
     data-ad-slot="YOUR-SLOT-ID"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
```

**The guides are the right place** — they are the pages a stranger actually
reads, and the only ones anyone will arrive at from a search. One unit part-way
down a guide, one at the end.

**Keep ads out of the app**, and out of the conversation view above all. An ad
next to someone trying to speak Spanish out loud is the fastest way to make them
stop, and a user who leaves is worth less than the $0.002 the impression paid.

## Two rules that are not optional

- **Never click your own ads**, and never ask anyone else to. Google detects it
  and the usual outcome is a permanent ban with the balance forfeited.
- **For visitors in the EU or UK a consent banner must run and be answered
  before the ad script loads.** Loading it first is the violation. AdSense ships
  a free consent management platform — turn it on under Privacy & messaging
  rather than writing one yourself.

## What not to do

**Do not generate a page per dictionary word.** Thirty-one thousand thin pages
is precisely what Google's spam policy calls *scaled content abuse*, and since
March 2024 it is a fast route to a permanent rejection that is much harder to
come back from than "low value content". The six grouped guides exist for this
reason: fewer pages, each worth reading.

The same goes for adding filler pages to look bigger. If you want more content,
write another guide — the material is there in the reading texts and the writing
tasks, and `tools/build-pages.js` is where a new one would be added.
