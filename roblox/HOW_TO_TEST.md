# 🫧 How to test GULP A GOOB

## Open it (30 seconds, nothing to install)

1. Download **`GulpAGoob.rbxlx`**
2. Roblox Studio → **File → Open from File…** → pick it
3. Press **▶ Play**

The world builds itself when the server starts, so there is nothing to place by
hand. You should land on a sand hub ringed by eight plots, with your Goob
sitting on one of them.

---

## What you should see immediately

| Where | What |
|---|---|
| Top-left | ⚡ power, 💧 Glob ticking up, income per second |
| Under that | Your Goob's age tier and its power multiplier |
| Left | 🍪 **SNACK STAND** — three buttons with live prices |
| Bottom-left | 🫧 **MY GOOBS** — opens the drawer |
| Top-right | Toast notifications |
| Ahead of you | A dark pillar showing 🏆 BIGGEST GOOBS |

If the HUD is missing entirely, something went wrong loading — check the Output
window and send me what it says.

---

## v4: you ARE the Goob now

The biggest change. You no longer stand next to your Goob — **you roll as it.**

| Control | Desktop | Mobile |
|---|---|---|
| Move | WASD | thumbstick |
| Jump | Space | Roblox's jump button |
| **Dash** | Shift or Q | the ⚡ button |

**Mass is now handling.** A big Goob has a higher top speed but takes far
longer to get going and much longer to stop. A 1T Goob needs 258 studs to
come to rest; a fresh one needs 8.

**Dash** has 3 charges that refill over ~8 seconds, with exactly **one air
dash** per jump. It's not flight — it's a correction, and it's the only way
into The Deep.

### Four zones, not one flat plane

- **The Hub** — trade ring, snack stand, hatchery, leaderboard, ascension
  altar. Every one signposted with a big icon.
- **The Scrapyard** — ramps and a half-pipe. Learn to dash here.
- **The Slickfield** — near-zero friction. You will overshoot.
- **The Deep** — rarest spawns, across a gap you must dash to clear.

### The goal: ASCEND

At **Colossal**, roll to the 👑 altar at the hub. Your Goob is **destroyed
forever** and you keep a **Crest** — worn on your nameplate, and every Crest
makes all food permanently worth +18% more, compounding. That's the point of
the game: ascend as many times as you can, holding the oldest Goobs when you do.

**Read `DESIGN.md`** for the full reasoning, including why there's no PvP yet,
why guilds would be premature, and what can and can't be sold for Robux.

## v5: everything else

**Tabs in the drawer** (🫧 MY GOOBS): 🫧 Goobs · 👕 Wear · ⭐ Season · 🛡️ Crew.

- **👕 Wardrobe** — 30 cosmetics across skins, trails, eyes and crowns. Skins
  change your body material and colour; trails follow you; crowns and crew tags
  show on your nameplate. Locked items say exactly how to get them.
- **⭐ Season pass** — 50 tiers, XP from *playing*. Daily cap of 7,000 (~2h),
  so the track takes ~40 days. Premium adds a second reward column on tiers you
  already earned; it never sells tiers.
- **🛡️ Crews** — found one for 10 minutes of income, or join by 4-letter tag.
  A rotating weekly goal nobody hits alone; everyone who helped gets paid.

**🥊 The Sumo Pit** — roll south of the hub. Stake Glob, last one in the ring
takes the pot. The ring shrinks and closes hard at the end.

**You can never lose a Goob in the Pit.** Glob only. That is deliberate and
permanent — a Goob that can be taken by force is a Goob nobody will trade.

**Monetisation is scaffolded, not live.** Every gamepass and product has
`assetId = 0`, so nothing is offered for sale until you put real IDs in
`src/shared/Monetisation.luau`. A test fails the build if anything purchasable
would touch mass, age, luck or Secrets.

## There's a coach now

A brand-new save gets a gold banner at the top walking you through the whole
loop in about two minutes — **catch → digest → snack → hatch → gulp → trade** —
one sentence at a time. It advances when you actually *do* the thing, not on a
timer, and it pulses whichever button it's asking for.

`✖` skips it permanently. Existing saves are never shown it.

**To see it again:** Studio → View → Explorer, or just test in a fresh place —
the state lives in your DataStore profile, so wiping the save resets it.

## A 5-minute test run

**1. Catch things.** Junk wanders the field. Just run into it — no clicking.
Rarer items glow and float a label; you can spot a Legendary from across the
map. Your Goob's stomach fills, then digests, then it visibly grows.

**2. Watch the blob.** The stuff it ate is *inside* it. Feed it ten traffic
cones and it looks different from one fed ten rubber ducks. This is the whole
visual hook — tell me if it reads or not.

**3. Spend Glob.** Click 🍪 Snack. You get 3 random items instantly. Feast and
Banquet cost more and roll better — but **none of them can ever give you a
Secret.** Those only come from the field.

**4. Hatch a second Goob.** Open 🫧 MY GOOBS → 🥚 HATCH A GOOB. It costs about
15 minutes of income the first time and climbs steeply after.

**5. Gulp it.** In the drawer, hit 😋 Gulp on the new one. Confirm. It is
**destroyed permanently** and your main Goob absorbs 75% of its mass, 35% of
its age, and everything it had eaten. Generation goes up.

**6. Trade** (needs a second player — a second Studio client, or `Test → Players
→ 2`). Both stand in the gold 🤝 TRADE ZONE at the hub. A TRADE WITH… button
appears. Try this specifically: **both confirm, then change your offer.** Both
confirmation bars must snap back to empty. That is the anti-scam rule.

---

## Things I especially want your read on

1. **Does the size curve feel right?** A Goob should look visibly bigger every
   time it gains 10x mass. It is logarithmic — an earlier cube-root version
   made every Goob past 1M mass identical.
2. **Is the interior readable?** Can you tell what someone fed their blob by
   looking at it, or is it just colourful mush?
3. **Is catching fun or tedious?** Auto-collect on touch, ~1 item per 4 seconds
   for an engaged player.
4. **Does the coach actually teach it?** Follow it as if you'd never seen the
   game. The step that matters most is the gulp one — it's the only place the
   core idea ("destroying a Goob is how you grow") is ever explained. If that
   lands, the design works. If it doesn't, the design has a problem no amount
   of UI will fix.

---

## Known, and deliberately so

- **No Secrets from the shop.** Money must never buy the collectibles the
  trading economy is built on.
- **Colossal takes ~3 days of active play.** It is meant to be a trading
  milestone, not a grind.
- **Eggs are a terrible way to gain mass** (~309x worse per Glob than snacks).
  They buy a *slot*, not power.
- **DataStores need API access.** In Studio without it, the game runs fully but
  in memory — progress resets on stop. Studio → Game Settings → Security →
  *Enable Studio Access to API Services* to persist.

## On a phone

The UI now has two distinct layouts, not one that shrinks:

- **Roomy** (desktop, iPad) — stat panel and snack stand down the left, wide
  drawer button bottom-left.
- **Compact** (phone, or any window under 900x500) — the left column would eat
  the screen whole, so the snack stand moves *inside* the drawer and the whole
  HUD collapses to one round 🫧 button.

That button sits in the gap **between** the thumbstick and the jump button,
because both bottom corners belong to Roblox's touch controls and anything
drawn there is unreachable with a thumb.

Verified at 568x320, 736x380, 640x360, 1024x768 and 1920x1080: nothing
overflows the screen, no persistent button hides under the touch controls, and
every tap target is at least 44px.

**Worth testing anyway:** resize the Studio window while playing — the layout
recomputes live. And check that text is actually *legible* at phone size, which
no automated check can tell me.

## Not yet built

No tutorial, no daily login, no global scarcity census — those are the roadmap
in `roblox/README.md`.
