# Putting AdSense on lunosia.com

Nothing in the shipped app loads an ad script. Adding one is a deliberate act,
and this file is the whole of it: what has to be true first, then the exact
edits.

## Read this part before you apply

**Approval is the hard part, not the code.** AdSense reviews a site for
content a reader would want on its own. `lunosia.com` is an application, and
what a crawler saw before this change was a heading, the word "Loading…" and
thirty thousand words of JavaScript — which is the shape of site that gets
"Low value content" back. That is why this change exists: `about.html` is a
real page about the thing, the root page now says what the site is even with
scripting off, and `privacy.html` is linked from both.

It may still be refused. An app with two prose pages is a thin site by
AdSense's standards, and you can reapply after fixing whatever the rejection
names — there is no limit on attempts and no cost to a rejection.

**What it is worth if it does work.** Ads pay roughly $1–3 per thousand page
views for this sort of traffic, and Google does not pay out until the balance
reaches $100. A site with a handful of visitors a day earns pennies a month
and will not reach the threshold. Do it because you want the site to be
findable and explain itself, not because it is going to make money.

## What has to be true before you apply

- [x] The site is live on a domain you own, over HTTPS.
- [x] There is a page that explains what the site is (`about.html`).
- [x] There is a privacy policy, and it is linked from the site (`privacy.html`).
- [x] The privacy policy names a real contact address —
      `Canarybears@gmail.com`. Programmes that pay you money require a
      reachable contact, and a policy page without one is a common rejection
      on its own. Watch that inbox after you apply; AdSense writes there.
- [ ] You are 18 or over and have a Google account and a bank account that can
      receive the payment, in your own name.

## Applying

1. Go to <https://adsense.google.com> and sign in with your Google account.
2. Enter `lunosia.com` as the site and your country. The country **cannot be
   changed later** — it sets the payment currency and the tax forms.
3. AdSense gives you a verification snippet containing your publisher id, which
   looks like `ca-pub-1234567890123456`. Keep that tab open.
4. Paste the snippet into `index.html`, immediately after the `<link rel="stylesheet" href="css/fiesta.css">` line:

   ```html
   <script async
     src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-YOUR-ID-HERE"
     crossorigin="anonymous"></script>
   ```

   Put the same three lines in the same place in `about.html` and
   `privacy.html`, so the reviewer finds the site verified whichever page
   they land on.

5. Create `ads.txt` next to `index.html`, containing exactly one line with your
   own publisher id in it:

   ```
   google.com, pub-YOUR-ID-HERE, DIRECT, f08c47fec0942fa0
   ```

   Note it is `pub-`, not `ca-pub-`, in this file. Without `ads.txt` AdSense
   warns that your inventory is unauthorised and pays less for it.

6. Commit and push. Cloudflare Pages redeploys on its own; give it a minute,
   then confirm <https://lunosia.com/ads.txt> shows that line.
7. Back in AdSense, click **Verify**. Review takes anywhere from a day to a
   few weeks.

## Placing a unit, once you are approved

Create an ad unit in AdSense, which gives you a slot id, then put the block
where the unit belongs:

```html
<ins class="adsbygoogle"
     style="display:block"
     data-ad-client="ca-pub-YOUR-ID-HERE"
     data-ad-slot="YOUR-SLOT-ID"
     data-ad-format="auto"
     data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
```

`about.html` is the right place for the first one — it is the page a stranger
actually reads. **Keep ads out of the conversation view.** An ad next to
someone who is trying to speak Spanish out loud is the fastest way to make
them stop, and a user who leaves is worth less than the $0.002 the impression
paid.

## Two rules that are not optional

- **Never click your own ads**, and do not ask anyone else to. Google detects
  it and the usual outcome is a permanent ban on the account, with the balance
  forfeited.
- **For visitors in the EU or UK, a consent banner has to run and be answered
  before the ad script loads.** Loading it first is the violation, not
  loading it without a banner at all. AdSense ships a free consent management
  platform — turn it on in the AdSense console under Privacy & messaging
  rather than writing one.

## If you would rather not

The site costs nothing to run. Cloudflare Pages is free at this traffic,
Workers AI's free allowance covers the conversations, and the dictionary and
grammar engine run in the reader's own browser. Nothing here needs ad revenue
to stay up.
