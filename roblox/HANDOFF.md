# GULP A GOOB — full project state

**Read this first if you have no memory of this project.** It is written to be
sufficient on its own: what the game is, what has been built, every bug found
and why it mattered, the conventions, the traps, and what comes next.

---

## 0. Operational facts

| | |
|---|---|
| Repo | `condorcrowns-art/Clad` |
| Branch | `claude/ecstatic-keller-i06fpz` — **all work goes here** |
| PR | [#8](https://github.com/condorcrowns-art/Clad/pull/8), open, **draft**, mergeable clean |
| `main` | still just the initial commit; the whole GLITCHTOPIA 2D game + this ride on the branch |
| CI | none configured — "all suites pass" means `roblox/tools/run_all.sh`, run locally |
| Check-ins | an hourly self-wake re-checks PR #8; re-arm silently if nothing changed, stop when merged/closed |
| Build | `cd roblox && python3 build_place.py` → `build/GulpAGoob.rbxlx` |
| Test | `cd roblox/tools && ./run_all.sh` (13 suites) |

**Deliver builds to the user with `SendUserFile`** — they open the `.rbxlx` in
Studio directly. They are a solo dev testing in Studio, not reading the repo.

**I cannot reach their Roblox Studio.** This is a cloud container; Studio's MCP
server is local to their machine. "Drive Studio directly" needs Claude Code
running on *their* computer — setup is in `README.md` Part 3.

---

## 1. What the game is

> You are a see-through blob. You roll around shoving things into yourself until
> you're enormous. Then you destroy yourself for a crown and do it again.

Target audience: the *Grow a Garden* / *Steal a Brainrot* crowd. Roughly nine
years old. Half of them on phones.

### The one structural idea

Every game in this genre has **infinite supply** — you can always grow another
crop, always buy another unit — and their trading economies crater as a result.

**Here, the only way to grow is to destroy.** Feeding one Goob to another
(a *gulp*) deletes it permanently and transfers only **75%** of its mass. The
other 25% is burned out of existence. With a fixed spawn rate, total mass in the
world is self-limiting rather than exponential.

Everything else defends that idea.

### Supporting pillars

1. **Your inventory is your body, visibly.** What a Goob ate is suspended inside
   its translucent shell and tumbles with you. Two players with identical power
   look completely different. A flex that needs zero UI.
2. **Age is the rarity axis and cannot be farmed.** Real seconds since hatch,
   travels with the Goob through trades, ×12 multiplier at a year. Un-bottable,
   un-dupeable, un-buyable. The only stat with a supply curve physics enforces.
3. **Rare items are collectibles, not power spikes**, and cannot be bought by
   anyone for anything.

### Mass is handling

You do not stand next to your Goob — **you are it**. Mass is physics, not a HUD
number:

| | Fresh | 1T |
|---|---|---|
| Top speed | 34 | 80 |
| 0→top | 0.36s | 4.0s |
| **Stopping distance** | **8 studs** | **258 studs** |

Jump is deliberately near-constant across the whole range so growing never locks
a player out of a gap they could previously clear.

**Dash**: 3 charges, ~8s refill, exactly one air dash per jump. Not flight — a
correction. It is the only way into The Deep, which is what keeps it meaningful
rather than a speed toy. Without a dash, every surface must be walkable, which
is exactly why the original map was a flat plane.

### The point of the game

At **Colossal** (5e6 mass), roll to the altar and **Ascend**: the Goob is
consumed — same rule as every other sink — for a **Crest** on your nameplate and
a compounding **+18% to all food value**, permanently. Numbers get a terminus,
the server sees who reached it, each run is shorter than the last.

---

## 2. Code map

```
roblox/
  README.md            research answer + Studio setup (Rojo / .rbxlx / MCP / Open Cloud)
  DESIGN.md            the design spine and the deliberate omissions
  HOW_TO_TEST.md       what the user reads before playing
  HANDOFF.md           this file
  default.project.json Rojo mapping
  build_place.py       dependency-free .rbxlx builder (pure Python 3)
  build/GulpAGoob.rbxlx the shippable place file

  src/shared/          → ReplicatedStorage.GoobShared
    Config.luau        EVERY tunable number. No magic numbers live anywhere else.
    GoobMath.luau      mass · size · age · power · income · the gulp
    Movement.luau      the curves that make mass equal handling
    Feedstock.luau     21 swallowable things, 7 rarities, + the balance note
    Format.luau        31-suffix number ladder (see bug #12/#13)
    Names.luau         silly name generator + sanitiser
    Net.luau           one manifest of every remote
    Tutorial.luau      the six-step first-run coach
    Ascension.luau     crests, the food multiplier, the altar check
    Cosmetics.luau     30 items across skin/trail/eyes/crown
    Season.luau        50-tier pass, XP table, daily cap, claim logic
    Pit.luau           Sumo Pit rules: ring curve, shove maths, stakes
    Crew.luau          crews, weekly goals, tag/name sanitising
    Monetisation.luau  what may be sold + the testable wall

  src/server/          → ServerScriptService.GoobServer
    init.server.luau   entry point, every remote handler, progression funnel
    Data.luau          DataStore w/ retry, migration, never-overwrite-on-failure
    CrewStore.luau     separate store, UpdateAsync only (shared across servers)
    WorldBuilder.luau  the entire map, from code
    RollService.luau   the rolling body, cosmetics, anti-cheat, teleport
    GoobService.luau   digestion, income, gulping (delegates spawn to RollService)
    CritterService.luau spawning + server-authoritative catching
    TradeService.luau  the paranoid trade state machine
    PitService.luau    lobby, match loop, shoves, eliminations, payout

  src/client/          → StarterPlayer.StarterPlayerScripts.GoobClient
    init.client.luau   input, proximity, feedback, dialogs, pit strip
    Roll.luau          the controller (velocity-driven, derived spin)
    Layout.luau        responsive: compact vs roomy, touch vs not
    Hud.luau           HUD + tabbed drawer
    Panels.luau        wardrobe / season / crew tab contents
    TradeUi.luau       the trade window
    Theme.luau         every colour and corner radius

  tools/               the verification harness — see §4
```

---

## 3. Design decisions and WHY

Do not undo these without understanding the reason.

| Decision | Why |
|---|---|
| Gulp transfers 75%, not 100% | The 25% burn IS the economy. Without it supply is conserved and values crater like every competitor. |
| Secrets cannot be bought, ever | Simulation showed the shop reaching them made money buy the collectible layer, killing trading. `Feedstock.roll(rng, luck, allowSecret)` — the shop passes `false`. |
| No single drop > ~5% of Colossal | One Pocket Singularity used to be 69–93% of a whole playthrough. |
| Eggs are terrible for mass (309× worse than snacks) | They buy a *slot*, not power. Otherwise egg-spam becomes the strategy. |
| Jump near-constant across mass | Falling jump height would lock strong players out of gaps they used to clear — progression punishing progression. |
| Pit is staked in **Glob, never Goobs** | A Goob that can be taken by force is a Goob nobody will trade. And a nine-year-old who loses a week-old Goob to a stranger does not come back. |
| Pit has **no rake** | Keeps it economy-neutral: moves Glob between players rather than printing or burning it. |
| Crews have no ranks/bank/war | Guilds solve coordination. Only the Pit gave anything to coordinate; the rest answers problems this game doesn't have. |
| Monetisation: cosmetics + convenience only | `Monetisation.violations()` fails the build if a purchasable item touches mass/age/luck/Secrets/trading. |
| Nothing unconfigured is offered for sale | `assetId = 0` everywhere. An unconfigured purchase prompt fails silently and reads as a scam. |
| World built from code, not the place file | A `.rbxl` is an opaque binary — not diffable, mergeable or reviewable. |
| Input via `Humanoid.MoveDirection` / `Humanoid.Jumping` | Gets keyboard, gamepad, thumbstick AND the jump button on every platform free. Drawing our own jump button put an unreachable control on top of a real one. |
| Client owns ball physics | Server ownership feels like mud at any ping. Cost is policed by the anti-cheat sampler. |
| Trade confirm is a 3s **hold**, any offer change resets both | Kills the swap-at-the-last-moment scam. Audience is nine. |
| No username entry anywhere | Username typing is where younger players get socially engineered. |

---

## 4. The verification harness (`roblox/tools/`)

There is no Roblox runtime in CI, so the game is verified four ways.
`./run_all.sh` runs **13 suites**.

1. **Compiles** — `check.mjs` uses a real **Luau v733 compiler** via
   `@luau-rs/luau` (WebAssembly, from npm).
2. **APIs exist** — `apicheck.py` + `apicheck_tables.py` validate every enum,
   class, service and property against **Roblox's published API dump**
   (`MaximumADHD/Roblox-Client-Tracker` → `API-Dump.json`).
3. **It runs** — `roblox_env/game/services/geometry.luau` implement ~900 lines of
   stub engine (Instances, parenting, signals, virtual-clock scheduler, remotes,
   DataStores, physics stand-ins) enough to boot the **real server and client**
   headlessly. `integration.mjs` assembles the tree exactly as Rojo/build_place do.
4. **Fits a phone** — `geometry.luau` resolves true AbsolutePosition/AbsoluteSize
   so layout is asserted against five real device viewports.

### Scenario files
`integration.luau` (play it) · `client_test.luau` (UI) · `roll_test.luau`
(rolling, world, ascension) · `tutorial_test.luau` · `mobile_test.luau` ·
`live_test.luau` (cosmetics/season/pit/crews) · `adversarial.luau` (attack it) ·
plus pure sims: `tests/move/fmt/season/pit/systems/snack/egg/balance.luau`.

### HARNESS TRAPS — these cost real time, do not rediscover them
- **`os.time()` fallback.** `GoobMath` falls back to `os.time()` when no `now`
  is passed. A synthetic goob with `bornAt = 0` then reads as **54 years old**
  (×12 power). Always pass an explicit `now` in sims.
- **`svc.fireAs(remote, player, ...)`**, not `:FireServer`. Roblox prepends the
  calling player to `OnServerEvent`; `FireServer` in the harness uses LocalPlayer.
- **`_G.SHARED("Name")`** to require a game shared module from a scenario. A bare
  `require("Pit")` hits the harness module table.
- **Don't tick between moving a ball and firing an action** if the test depends on
  the ball being far away — the anti-cheat sampler will snap it back.
- **Visibility is inherited** in `geometry.luau`; a child of a hidden panel is not
  on screen.

### Mutation testing is the standard here
A test that cannot fail is worth nothing. Every suite has had protections
deliberately broken to confirm detection, then source restored and grepped for
residue. **Do this for any new suite.**

---

## 5. Every bug found (20), and why each mattered

### Balance (simulation)
1. **Every Goob past 1M mass looked identical** — cube-root size hit its clamp
   within hours. Killed the "you can see power" pitch. → logarithmic size.
2. **Colossal was unreachable** — 400 days of play reached 0.1%. → repriced.
3. **The game was a slot machine** — Secrets were 47.6% of all value; one drop
   was 69–93% of a playthrough. Also broke trading. → no drop > ~5% of Colossal;
   luck spread 5.1× → 1.2×.
4. **Money could buy the collectibles** — a Banquet held 1-in-104 odds of a
   Secret. → Secrets are wild-catch only.

### Logic (audit)
5. **The core mechanic was unreachable dead code** — `newGoob` ran exactly once,
   at account creation, and trading is zero-sum, so nobody could ever hold two
   Goobs and `gulp()` could never execute. → the Egg Stand.

### Rendering / API (against the dump)
6. **The eyes drifted off the Goob** — positioned once at build time while the
   body tweened on every feed.
7. **The anti-scam bar was invisible** — hold-to-confirm fill at `ZIndex = 0`
   inside an opaque button renders *behind* it under Sibling ZIndexBehavior.
8. **Three security-locked properties** (`Workspace.FilteringEnabled`,
   `Lighting.Technology`) that scripts cannot write.

### Mobile (measured)
9. **`IgnoreGuiInset` was `true`** — the Roblox top bar covered the power
   readout. Broken on *every* platform.
10. **A closed drawer was parked off-screen but still `Visible`** — still rendering.
11. **Every panel was fixed-pixel** — the HUD covered **233%** of an iPhone SE
    screen, 25 elements overflowed, tap targets 28px, buttons under the thumbstick.

### Numbers
12. **`Format.short` ate significant digits** — `s:gsub("%.?0+$","")` runs even
    with no decimal point: `100000` → `"1K"`, `340000000` → `"34M"`. Always
    under-reporting, worst at round milestones. Every stat in the game.
13. **Sub-1000 path floored instead of rounding** — `11.98` → `"11"`.

### Systems
14. **Two Lua scoping traps** — `local function` only enters scope from its
    declaration down. The progression funnel and `syncCrew` sat above `notify`,
    `push` and the remotes, so every call resolved to a **nil global**. Server
    booted fine, died on first join.
15. **The anti-cheat was fighting the game** — it cannot distinguish a client
    teleporting itself from the server placing a fighter in the arena. Every Pit
    match started, dropped both in, snapped them out, ended instantly with the
    pot refunded. → `RollService.teleport()` tells the sampler.
16. **The layout crashed on a not-yet-ready camera.** `ViewportSize` is `(0,0)`
    for the first frames; every layout function subtracts button widths from it,
    producing `math.clamp(x, 8, -76)` → "invalid argument #3 to clamp". A hard
    error that aborted the whole layout pass and scattered the HUD. **It shipped
    and the user hit it.** → `Layout.usable()` is floored, `Layout.fit()` cannot
    throw, degenerate viewports are ignored and retried. Regression-tested at
    0×0, 1×1, 40×900 and 900×40.
17. **A giant "Label" floated in the sky.** `TextLabel.Text` defaults to the
    literal string `"Label"`. The Goob's nameplate is a TextScaled BillboardGui
    directly above the player's own camera subject, and its text was only set on
    a later refresh — so metre-high "Label" sat across the middle of the screen.
    `Theme.label()` had the same hole.
18. **The world had no ground.** The zone rewrite replaced the old 1400×1400
    plane with separate discs and never added a base, so the map was islands
    floating in open sky. → one continuous plane; the only hole is the dash gap
    to The Deep, which is deliberate.
19. **A sound asset id was invalid** (`Asset type does not match requested
    type`), spamming Output every play. Asset ids cannot be verified from this
    environment, so they now live in `Config.SOUNDS`, default to empty, and an
    unset id plays nothing rather than erroring.
20. **`FireClient` never delivered.** The harness RECORDED server→client traffic
    but never fired `OnClientEvent`, so every client-side handler had never run
    in a test — client suites were only exercising what the UI does on its own.
    Fixed; client tests are now genuinely end-to-end.
17. **The season completed in 8 days** — a 50-tier track finishing in a week
    leaves engaged players with nothing for five weeks. → ~40 days, asserted.

### Tests caught passing for the WRONG reason (my errors, worth remembering)
- "can't ascend away from the altar" — the anti-cheat snapped the cheater back
  *into* range. The protection was rescuing the cheater.
- "joining a missing crew is refused" — ran while the player was already in a
  crew, so it tested the "leave first" guard; passed with the real check deleted.
- An affordability check had an `or not affordable` escape hatch that passed even
  if the server sold on credit.
- The harness didn't move the welded ball when it moved a character, so every
  catch failed a distance check for a reason the engine cannot produce.
- `apicheck_tables.py` treated keys of **nested** lookup tables as properties of
  the outer constructor — nine false findings. A checker that cries wolf stops
  being read.

---

## 6. Where things stand

**Built and passing all 12 suites:**
✅ Economy (mass/age/power/income/offline digestion) ✅ rolling body with
visible interior ✅ dash + air dash ✅ four zones + ramps + signage ✅ Ascension
✅ 21 feedstock types, server-authoritative catching ✅ gulping ✅ full trade
system with anti-scam ✅ DataStore persistence ✅ first-run coach ✅ responsive
mobile ✅ 30 cosmetics ✅ 50-tier season pass ✅ Sumo Pit ✅ Crews ✅
monetisation scaffolding ✅ global scarcity census + the Archive ✅ juice.

**Never play-tested by a human beyond a first pass** — the user has played v3
(pre-rolling). v4 (rolling) and v5 (systems) are unverified by human hands.
The harness proves the code doesn't explode; it cannot prove the game is fun.

## 7. Next up (in order)

1. ✅ **Global scarcity census** — `CensusService` + the **Archive** monument at
   the hub. ALIVE = CAUGHT − DESTROYED, worldwide. Ascension is the sink: a Goob
   consumed at the altar takes its whole belly with it, so the prestige loop
   feeds the scarcity loop and both are readable on one wall.
2. ✅ **Juice** — `Juice.luau`: rarity-scaled particle bursts, camera shake,
   catch/gulp/ascend/shove sounds, and critters that visibly flee when you close
   on them.
3. **Daily login streak** — retention scaffolding. Not built.
4. **Real asset IDs** — user must supply them from the Creator Dashboard before
   anything is purchasable. Everything is `assetId = 0` today.
5. **Open Cloud auto-publish** — needs their API key as a repo secret.
6. **Second-client play-test of the Pit** — the only system whose value cannot
   be judged alone.

## 8. Conventions

- No magic numbers outside `Config.luau` (and the per-system shared modules).
- Comments explain **why**, especially where a naive implementation was wrong.
  Several comments record a specific bug so it cannot be reintroduced.
- Commit messages are prose explaining the reasoning and every bug found,
  including my own test errors. Attribution footer required.
- Never report "tests pass" without having mutation-tested the assertions.
- Tell the user plainly what is *not* proven.
- **Palette rule:** nothing above ~46% saturation / ~88% value in the item and
  cosmetic tables, and the UI palette stays low-chroma. A muted world was an
  explicit request; a script in the commit history can re-apply it if it drifts.
- **Never leave a `TextLabel` on its default `Text`** — it renders the literal
  word "Label".
- **Never `math.clamp` layout maths directly** — use `Layout.fit`.
