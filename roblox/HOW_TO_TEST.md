# 🫧 How to test GOOP

## Open it (30 seconds, nothing to install)

1. Download **`build/GulpAGoob.rbxlx`**
2. Roblox Studio → **File → Open from File…** → pick it
3. Press **▶ Play**

The world builds itself when the server starts — there is nothing to place by
hand. You land in the **waiting room**, a platform above the island, and a
round starts within about 35 seconds.

---

## The loop, in four sentences

You are a blob. Eat the goo on the floor to get bigger, eat anybody smaller
than you, and run from anybody bigger. **There is no size limit** — whoever is
biggest when the clock runs out wins the round. Between rounds you are in the
waiting room, where nothing can eat you and everything is open: crates, skins,
trinkets, powers, trading.

---

## What you should see immediately

| Where | What |
|---|---|
| Top-centre | The **dock** — nine icons. Everything in the game is behind one of them. |
| Under the dock | The **status strip** — the round clock, where you are standing, and whether you are safe |
| Top-left | Your **mass**, what it is worth, and your best this round |
| Top-right | 💧 **Glob**, and your Beta Season tier |
| Bottom-centre | Your **power button**, between the thumbstick and the jump button |
| Top of the screen, during your first run | The **coach** — one instruction at a time |

There is exactly **one panel at a time**. Tapping a dock icon opens its sheet
and closes whatever was up. If you ever see two panels overlapping, that is a
bug — screenshot it.

---

## Controls

| | Desktop | Mobile |
|---|---|---|
| Move | WASD or arrows | thumbstick |
| Jump | Space | the jump button |
| Power | E, or the ⚡ button | the ⚡ button |

**Mass is handling.** A fresh blob is quick and twitchy; a huge one has a lower
top speed and takes much longer to stop. That gap is what makes a chase
losable rather than hopeless.

---

## The five things worth testing

### 1. The round

A round is **3½ minutes**, then results, then a 35-second waiting room. Growth
is unbounded — the fantasy is getting *enormous*, and nothing caps it. Your
final size is your score; placing in the top three multiplies the payout.

**What to check:** does the round actually end? Does the board show everybody?
Does the waiting room put you somewhere safe?

### 2. The field is always full

Every round is played by **twelve contenders**. However many humans are on the
server, bots make up the rest — one human means eleven bots, and an empty
server still runs a real round.

Bots are **tagged with 🤖** above their heads and marked on the results board.
They are not props: they eat the floor, they eat each other, they will eat you,
and your powers deflate them exactly like they deflate a player.

**What to check:** can you beat them? Can they beat you? Does the board list
them with distinct names? Does anything about them feel like it is cheating —
if a bot ever reacts instantly or catches you when it should not have, say so.

### 3. Powers deflate — that is the catch-up mechanic

Every power costs a slice of your own mass, and that slice **lands on the floor
as food**. Most of them also knock size *off* whoever you hit, in proportion to
how big they are — so the leader is always the most rewarding thing on the
island to hit, and hitting them feeds everyone standing nearby.

Pick one in the ⚡ **POWERS** tab. More unlock as your lifetime banked Glob
grows, and each one gets quicker and cheaper the more you use it.

**What to check:** SLAM into a crowd. Does everybody near you visibly shrink?
Does food appear where they were?

### 4. The edge is food, not a hiding place

The outer rim of the island used to be a permanent no-PvP ring, which is why
nothing grew out there. It is not permanent anymore. Standing on the rim spends
a **safety meter** — about twelve seconds, shown on the status strip as
`SAFE 9s` — which refills only while you are back inside. Run out and the strip
says **EXPOSED**, and the rim is the most open ground on the map.

The meter does not start until you have gone inland once, so spawning out there
still gives you a proper look at the island first.

**What to check:** is there food all the way to the shoreline? Does the meter
count down where you can see it? Does anything eat you *while the strip still
says SAFE*? (That last one would be a real bug.)

### 5. The waiting room

Between rounds. Nothing can touch you. Every dock tab works here:

| Tab | What |
|---|---|
| 🎁 CRATES | The gacha. Glob only — Robux never buys a roll. Hard pity, counter on the button. |
| 👕 WARDROBE | Skins, trails, crowns |
| 🔧 TRINKETS | Passive modifiers, two slots |
| ⚡ POWERS | Pick the one button you carry |
| 🫧 YOUR GOOBS | Your collection. CARRY one, or GULP one into another. |
| 🤝 TRADE | The rules, and what you can offer |
| ⭐ BETA SEASON | The pass. Claim earned tiers. |
| 🛡️ YOUR CREW | Found or join one; shared weekly goal |
| 🥊 THE STANDOFF | Queue for a 1v1 |

**Trading** happens by rolling up to another player — a request appears for
both of you. Confirming is a **3-second hold**, and if either side changes the
offer after confirming, *both* confirmations reset.

---

## Where Goobs and their food come from now

There is no shop for this. Finishing a round feeds the Goob you are carrying —
more food for a bigger finish, a luckier table for a better placing — and every
**five rounds finished** hatches a new Goob, up to eight.

That is deliberate: a stable is evidence that you played, which is the one
thing in the game that cannot be bought, botted or handed over.

---

## Things that are gone (and should stay gone)

If you see any of these, it is a regression:

- **Roaming "critters"** — labelled junk like `RARE Anvil` bobbing around the
  island. They belonged to the collecting game the arena replaced.
- **The Snack Stand** — a `🍪 SNACK / 🍗 FEAST / 👑 BANQUET` panel.
- **The Egg Stand** — a `🥚 HATCH A GOOB` button with a price.
- **A "MY GOOBS" drawer** sliding in from the left, especially with a shop
  rendered on top of a season list.

---

## What to send back

Screenshots beat descriptions, and "it felt bad" is genuinely useful — say it
even if you cannot say why.

Worth flagging specifically:

1. Anything you got **stuck** in or on.
2. Anywhere the UI **overlapped itself** or ran off the screen.
3. A moment a bot felt **unfair** or **stupid**.
4. Whether the island feels **full** — of food, of players, of places.
5. Whether three and a half minutes feels **too long or too short**.

---

## If something is broken

Open the **Output** window in Studio (View → Output) and copy anything red.
The server prints one line at boot that tells you the build is healthy:

```
[GULP A GOOB] ready. one island, 1424 pellets, 12 powers, 8 trinkets, 3 crates.
```

No line, or a different pellet count, means the world did not finish building.
