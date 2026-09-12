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
4. **Is the first 60 seconds clear?** You get one welcome toast and no tutorial.
   That is almost certainly not enough — I want to know where you got stuck.

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
