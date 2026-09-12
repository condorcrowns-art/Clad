# 🫧 GULP A GOOB

> You own a see-through blob. You shove stuff into it. It becomes **enormous**.

A Roblox experience built for the *Grow a Garden* / *Steal a Brainrot* audience —
instantly readable, huge power scale, deep trading — with one structural
difference that none of those games have: **a real economic sink**.

---

## Part 1 — How I can build this on *your* Studio

You asked me to research this first, so here is the honest answer, including the
part that rules out the option you leaned toward.

### The blocker, stated plainly

**I cannot reach your Roblox Studio from this session.** I'm running in an
ephemeral Linux container in Anthropic's cloud. Roblox Studio's MCP server runs
as a local process on *your* computer and is reachable only from *your*
computer. There is no tunnel from here to there, and there shouldn't be.

So "drive Studio directly" is real, and it's genuinely good — but it needs
Claude Code running **on your machine**, not this one. Setup for that is in
Part 3, and it's about five minutes of work.

### The four pipelines, ranked

| # | Pipeline | Works from here? | Good for |
|---|----------|------------------|----------|
| 1 | **Rojo live-sync** | ✅ yes | Authoring the game. The source of truth. |
| 2 | **Generated `.rbxlx` place file** | ✅ yes | Zero-install. Double-click and play. |
| 3 | **Studio MCP server** | ❌ needs local Claude Code | Live tweaks, "make that part red", playtesting |
| 4 | **Open Cloud publish API** | ✅ yes, with your API key | CI/CD — auto-publish on every push |

### You asked "unless Rojo is truly very good" — it is, and here's why

I'd have told you the same thing if it weren't. Rojo wins for this project for
reasons that have nothing to do with preference:

- **This game is 2,900 lines across 16 modules.** Every edit through MCP is a
  tool round-trip. Rojo pushes the whole tree on save, instantly.
- **A `.rbxl` is an opaque binary.** Nothing in it is diffable, mergeable, or
  reviewable. With Rojo the entire game — *including the map*, which this one
  generates from code — is plain text in git.
- **Studio crashes.** If your only copy of the work is inside a Studio session,
  a crash costs you the session. Git doesn't crash.
- **You can use both.** They're not exclusive. Rojo owns the code; MCP is great
  for the things Rojo is bad at — "nudge that spawn 10 studs left", "run this
  and screenshot it", "why is this part falling through the floor".

**My recommendation: Rojo for the code, MCP for the fiddly visual stuff.** And
because I don't want you blocked on installing anything, there's also a
generated `.rbxlx` you can open right now with zero tools.

---

## Part 2 — Get it running (pick one)

### Option A — zero install, 30 seconds

1. Download **`roblox/build/GulpAGoob.rbxlx`** from this repo.
2. Roblox Studio → **File → Open from File…** → pick it.
3. Press **Play**.

That's it. The whole game is in that file — the map builds itself on server
start, so there's nothing to place by hand.

To rebuild it after any source change:

```bash
cd roblox && python3 build_place.py
```

No dependencies. Just Python 3.

### Option B — Rojo live-sync (recommended for ongoing work)

```bash
# 1. Install Rojo (pick whichever you have)
cargo install rojo            # or: aftman add rojo-rbx/rojo
                              # or: download from https://github.com/rojo-rbx/rojo/releases

# 2. Install the Rojo plugin into Studio (one time)
rojo plugin install

# 3. Serve
cd roblox && rojo serve
```

Then in Studio: **Plugins → Rojo → Connect**. Every save streams straight in.

### Option C — auto-publish from CI

Once the game has a place ID:

```bash
curl -X POST \
  "https://apis.roblox.com/universes/v1/${UNIVERSE_ID}/places/${PLACE_ID}/versions?versionType=Published" \
  -H "x-api-key: ${ROBLOX_API_KEY}" \
  -H "Content-Type: application/xml" \
  --data-binary @build/GulpAGoob.rbxlx
```

API key from the Creator Dashboard, with `universe-places: write` on this game.
Give me the key as a repo secret and I'll wire up the GitHub Action.

---

## Part 3 — Letting Claude drive your Studio directly

Worth setting up regardless — it's the best way to do visual tweaks.

**The MCP server ships inside Roblox Studio now.** No repo to clone, no Rust.

1. Update Roblox Studio to the latest version.
2. In Studio: **Assistant → … → Manage MCP Servers → Enable Studio as MCP server**.
3. On your own computer, install Claude Code and point it at Studio:

   **macOS**
   ```bash
   claude mcp add --transport stdio Roblox_Studio -- \
     /Applications/RobloxStudio.app/Contents/MacOS/StudioMCP
   ```

   **Windows**
   ```bash
   claude mcp add --transport stdio Roblox_Studio -- \
     cmd.exe /c "%LOCALAPPDATA%\Roblox\mcp.bat"
   ```

4. Open this place in Studio, run `claude` in the repo folder, and ask away.

Studio's MCP server exposes ~40 tools — reading and editing scripts, generating
assets, exploring the data model, running Luau, playtesting, simulating input.

⚠️ **It can read and modify anything in your open place.** Only connect clients
you trust, and keep your work in git so there's always a way back.

---

## Part 4 — The design, and why it's shaped this way

### The loop, in one breath

**Chase the junk → it goes in your blob → your blob gets huge → trade blobs.**

That's the whole game. A seven-year-old gets it from the thumbnail.

### What the research turned up

I looked at what's actually winning right now before designing anything, and
deliberately threw away the first three ideas because you'd have gotten those
from anyone:

- **"Fuse two creatures into a portmanteau baby"** — that's *Animash*. Taken.
- **"Grow it while you're offline"** — that's *Grow a Garden*. Taken.
- **"Steal it off someone's base"** — that's *Steal a Brainrot*. Taken.
- **"Merge cubes"** — three separate games. Taken.

What every one of them *shares* is the actual opportunity: **infinite supply**.
You can always grow another crop. You can always buy another unit. The trading
guides and wikis for these games are full of players watching values crater,
because nothing ever leaves the economy.

### The one structural idea

**In this game, the only way to grow is to destroy.**

Feeding one Goob to another (a *gulp*) permanently deletes the eaten Goob and
transfers only **75%** of its mass. Every gulp burns 25% of the value involved
out of existence forever. Combined with a fixed server-wide spawn rate, the
total mass in the world is self-limiting instead of exponential.

That single rule produces, for free:
- Rare things stay rare, so trading actually means something
- Old Goobs become genuinely irreplaceable
- No currency death-spiral in month three

### Three more things nobody's doing

**1. Your inventory is your character, visibly.**
The things your Goob ate are *real parts suspended inside its translucent body*.
A Goob stuffed with 300 rubber ducks looks nothing like one stuffed with 300
traffic cones. Two players with identical power look completely different. You
can read someone's entire history by walking up and looking at them. No other
game in this genre has a flex that requires zero UI.

**2. Age is the rarity axis — and age cannot be farmed.**
A Goob's age is real-world seconds since it hatched, and it *travels with the
Goob through trades*. You can't bot it, dupe it, or buy it. A 60-day Goob had
to be raised by somebody. Age multiplies power up to **×12** at a year, so an
old Goob genuinely outclasses a freshly-ground one. This is the only stat in
the game with a supply curve physics won't let anyone cheat.

**3. Rare items are collectibles, not power spikes.**
Deliberate, and it came out of simulation — see below.

### The power scale

| Mass | Size | Income |
|------|------|--------|
| 10 | 4 studs | 1.4 💧/sec |
| 1K | 18 studs | 22 💧/sec |
| 1M | 40 studs | 1.39K 💧/sec |
| 5M *(Colossal)* | 45 studs | 3.66K 💧/sec |
| 1B | 61 studs | 87.9K 💧/sec |
| 1T | 83 studs | 5.55M 💧/sec |
| 1Qi (1e18) | 126 studs | 22.1B 💧/sec |
| 1No (1e30) | 180 studs | 35Qa 💧/sec |

Size is **logarithmic**, not a cube root — see the balance section. Numbers
ladder through 31 suffixes from K to Tg.

---

## Part 5 — What the simulation found

I couldn't open Studio from here, so I did something better than guessing: I
pulled a real Luau v733 compiler in and **ran the economy**. All 16 modules
compile, and the pure-logic modules run against stubbed Roblox globals.

It caught four bugs that would each have been discovered weeks later by
players instead:

### 🐛 1 — Every Goob past 1M mass looked identical

Size was a cube root with a 180-stud clamp. Players hit that clamp within hours,
and from then on a 1e6 Goob rendered exactly the same as a 1e20 one — killing
the entire "you can *see* how strong someone is" pitch.

**Fixed:** logarithmic size. Every tenfold gain is now a visible step, forever.
The clamp isn't reached until ~1e24, which nobody will see.

### 🐛 2 — "Colossal" was unreachable

The headline milestone sat at 1e12 mass. Simulated play reached 0.1% of it in
400 days. **Fixed:** repriced against measured catch rates.

### 🐛 3 — The game was a slot machine

This is the one I'd never have caught by eye. Simulating **300 players**:

```
Secret items = 47.6% of ALL value in the game
run 1: biggest single drop = 69% of that player's entire progression
run 2: 80%
run 3: 88%
run 4: 93%
```

One Pocket Singularity erased twenty hours of play. Worse, it broke *trading*:
if the rarest item is also the most powerful, nobody ever parts with one and
the market seizes.

**Fixed** with a hard rule now written into the code:

> **No single drop may exceed ~5% of the Colossal milestone.**

Secrets are still 1-in-20,000. They still sit visibly inside your Goob forever.
They're still what people will trade for. They're **collectibles, not power
spikes** — which is exactly what keeps the economy liquid.

### 🐛 4 — Money could buy the collectibles

Adding the Snack Stand (below) re-introduced the slot machine through the back
door. A 40-roll Banquet at luck ×4 put Secret odds at **1 in ~104 per
purchase**. Tracing an AFK player's very first purchase, on a brand-new Goob:

```
t=1200   BUY #1   price 2.26K   gained 292K mass   -> 19x the average
```

27 minutes of idle income on day one bought 6% of the entire Colossal
milestone. Worse, it meant **money could buy the collectibles the whole trading
economy is built on**.

**Fixed** with a rule rather than a number:

> ⭐ **Secrets cannot be bought. They only come from wild catches.**

Luck is now capped per rarity tier, so a high-luck roll reliably improves the
*middle* of the table — where steady progression lives — instead of buying
lottery tickets at the top. The active loop gets a reward the idle loop can
never provide, and the rarest items in the game stay earned.

### Measured after all four fixes

```
ACTIVE (catching, 1 per 4s):  17.6 mass/sec
IDLE   Snack:   2.6 mass/sec  (0.15x active)
IDLE   Feast:   5.9 mass/sec  (0.33x active)
IDLE   Banquet: 7.4 mass/sec  (0.42x active)

Time to Colossal, 300 players:  p10 2d21h · median 3d6h · p90 3d12h
Luck spread (p90/p10):          5.1x  ->  1.2x
Biggest single drop:            93%   ->  5%  of a run
Pure-AFK growth:                polynomial (mass ~ t^2.5), never exponential
Snack price at every scale:     exactly 81 seconds of your own income
```

### Run it yourself

```bash
cd roblox/tools
npm install @luau-rs/luau
node check.mjs ../src/**/*.luau          # compile every module
node sim.mjs ../src/shared tests.luau    # economy assertions
node sim.mjs ../src/shared balance.luau  # 300-player balance sweep
```

---

## Part 6 — Anti-scam, because the audience is nine

Trading is why this game gets a community instead of a player count. It's also
the most exploited system in every Roblox game, so the rules are paranoid:

- **The server owns every Goob.** The client can only reference IDs it owns.
- **Confirming is a hold, not a click** — a 3-second fill bar you can't hit by
  reflex.
- **Any change to either offer resets both confirmations**, visibly. This kills
  the classic swap-at-the-last-moment scam outright.
- **Both players must stay in the trade zone** for the whole trade.
- **You can never trade away your last Goob.**
- **The swap is atomic** — everything validates, *then* anything moves.
- **No typing usernames.** You walk up to someone and press one button. Username
  entry is where younger players get socially engineered.
- **The age of every Goob is displayed as loudly as its power**, because age is
  the stat new traders undervalue and get talked out of.

And on the exploit side: the client never says *"I caught a Mythic."* It says
*"I touched this part,"* and the server decides. Every exploit in this genre
comes from getting that backwards.

---

## Part 7 — Code layout

```
roblox/
  default.project.json      Rojo mapping
  build_place.py            zero-dependency .rbxlx builder
  build/GulpAGoob.rbxlx     ← open this in Studio
  tools/                    the Luau test + balance harness
  src/
    shared/                 → ReplicatedStorage.GoobShared
      Config.luau           every tunable number in the game
      GoobMath.luau         mass · size · age · power · the gulp
      Feedstock.luau        21 swallowable things + the balance note
      Format.luau           31-suffix number ladder
      Names.luau            silly name generator + sanitiser
      Net.luau              one manifest of every remote
    server/                 → ServerScriptService.GoobServer
      init.server.luau      entry point + every remote handler
      Data.luau             DataStore w/ retry, migration, no-blank-overwrite
      WorldBuilder.luau     the entire map, from code
      GoobService.luau      rendering, digestion, income, gulping
      CritterService.luau   spawning + server-authoritative catching
      TradeService.luau     the paranoid trade state machine
    client/                 → StarterPlayer.StarterPlayerScripts.GoobClient
      init.client.luau      input, proximity, feedback
      Hud.luau              HUD + Goob drawer
      TradeUi.luau          the trade window
      Theme.luau            every colour and corner radius
```

**One rule worth keeping:** no magic numbers outside `Config.luau`. To rebalance
the entire game you should only ever have to open one file.

---

## Part 8 — What's built vs. what's next

**Built and compiling:**
✅ Full economy (mass, age, power, income, offline digestion)
✅ Translucent Goobs with visible interiors
✅ Runtime world generation, 8 plots, hub, trade zone, leaderboard
✅ 21 feedstock types across 7 rarities, roaming + server-authoritative catching
✅ Server-wide Secret announcements
✅ Gulping with two-step confirmation
✅ Full trade system with the anti-scam rules above
✅ DataStore persistence with session handling
✅ **Snack Stand** — the Glob sink that connects idle income back to
   progression, priced at a constant number of seconds-of-income at every scale
✅ Test + balance harness

**Next, in the order I'd do it:**
1. **Global Goob census.** A live world-wide count of how many of each Secret
   still exist, on the leaderboard pillar. Makes scarcity *visible*, which is
   the whole thesis.
3. **Mobile pass.** Roughly half the audience. The UI is built for it but
   untested at phone sizes.
4. **Daily login + a quest strip.** Retention scaffolding.
5. **Sound and particles on catch.** The single cheapest feel upgrade.
