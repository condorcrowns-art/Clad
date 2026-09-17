# OVERCLOCK SIMULATOR

A complete, original Roblox simulator — built from scratch, owned outright, and
shaped like the games that actually hold 5,000+ concurrent players.

Nothing here is copied from another game. Every system, curve and asset
reference is original, which matters for three reasons: copied scripts get
games (and accounts) taken down, copied balance curves are tuned for someone
else's monetisation, and a codebase you understand is one you can patch at 2am
when CCU spikes. This one you can read end to end in an hour.

---

## The loop

> **Swing** a chip at a data node → Bits fill your **buffer** → walk to the
> **Uplink** and sell → buy a better **chip** or a bigger **buffer** → unlock a
> deeper **sector** → hatch **familiars** that multiply everything → **Overclock**
> (rebirth) for permanent multipliers and Shards → repeat, faster.

That's the whole game, and it's deliberately the whole game. Simulators that hold
players don't do it with more mechanics, they do it with a tighter loop and more
reasons to run it again.

### Why it retains

| System | What it does | The retention job it's doing |
|---|---|---|
| Buffer / sell cadence | Forces a sell every ~25–40s | The dopamine clock. Everything else hangs off it. |
| Chips & Buffers alternating prices | Next upgrade is always ~3 sells away | "One more sell" never stops being true |
| 9 sectors, ×1 → ×180,000 | Each is ~9× the cost, ~2.3× the pay | A visible, always-close next goal |
| Familiars (pets) + variants | Weighted rolls, 1/40 → 1/2000 variants | The slot machine. Drives hatch spam and clips |
| Overclock (rebirth) | Resets economy, **keeps pets** | A reset that feels like a power spike, not a loss |
| Daily quests (3/day, rolled per UTC day) | + completion bonus | "Come back tomorrow" |
| 7-day login streak | Day 7 = 400K + 8 Shards | Week-one retention has a finish line |
| Playtime chests (5m → 4h) | Escalating in-session payouts | Makes the *session* long |
| Global leaderboards | Physical boards, top 15 | Long-tail grind for players past the curve |
| **Trading** | Player-to-player, anti-scam confirm flow | Duplicates become currency; creates a player-run economy |
| **Fusion (★)** | Burn duplicates to raise a familiar's star | Gives volume hatching a destination |
| **Evolution** | Familiars earn XP while equipped and evolve at Lv.10 / Lv.25 | Rewards time played, not just luck |
| **Serial numbers** | Every familiar minted gets a permanent global serial | "THE PRIME #7" — a chase that costs nothing to produce |
| Codes | One per update | Every code drop = a social post = a session |
| Server-wide announcements | Rare hatches, rebirths, unlocks | Makes a server feel alive and busy |

---

## Monetisation

Full reasoning in [`docs/MONETIZATION.md`](docs/MONETIZATION.md). Short version:
the ladder is **bottom-heavy on purpose**.

Most players have 5–40 leftover Robux and will spend it impulsively on a *toy*,
never on a stat. So the entry rung is toys:

| Pass | Price | Why it sells |
|---|---|---|
| 🐾 **STARTER FAMILIAR** | **25 R$** | Hands over a real, permanent, equipped familiar — not an abstract stat |
| 📦 +150 Storage | 35 R$ | Room to hoard duplicates for fusion |
| ✨ Chrome Companion | 79 R$ | A guaranteed Chrome variant most players never pull |

Then convenience (49–169 R$: Triple Hatch, Auto-Mine, Auto-Sell, 2× Bits,
2× Training, Auto-Hatch, +3 Familiar Slots, Lucky Hatch), an exclusive-egg
pass (199 R$ Void Egg access), then identity (399 R$ VIP).

Every item is simulator-native — more familiars, better familiars, faster
familiars, more Bits, more storage. No destruction toys or novelty gimmicks:
those teach players the shop sells jokes instead of progression.

Repeatable dev products carry the top of the curve — Shard bundles, personal
boosts, and a **Server 2× Bits** product that announces the buyer's name to
everyone, which is the single highest-converting product type in the genre.

### Art: bring your own

Every model in the game is procedural by default — real crystal clusters,
egg pedestals and 3D familiars, not coloured cubes — and **every one is
swappable from a single table**. Drop a free Creator Store model into
`ReplicatedStorage/GameAssets/Pets/<petId>` (or `/Nodes/<zoneId>`,
`/Eggs/<eggId>`) and it replaces the procedural version in the world, the
hatch reveal and the inventory at once. Sound and particle ids go in the same
file. See [`docs/FREE_ASSETS.md`](docs/FREE_ASSETS.md) and
`Shared/Assets.lua`.

> **Every `id = 0` in `Products.lua` is a placeholder.** Create the passes and
> products in the Creator Dashboard, paste the real IDs in, and nothing else
> needs to change. Until then the game tells players the item "isn't live yet"
> instead of erroring.

---

## Setup (15 minutes)

1. **Install [Rojo](https://rojo.space)** (`cargo install rojo` or the VS Code
   extension / Foreman).
2. From this directory: `rojo serve` — then connect from Roblox Studio via the
   Rojo plugin. Or build a place file directly: `rojo build -o Overclock.rbxlx`.
3. Open it in Studio and press Play. **There is nothing to build by hand** —
   the entire world (9 sectors, nodes, Uplink pads, leaderboards, lighting) is
   generated at runtime by `WorldService`.
4. In Studio: **Game Settings → Security → enable Studio Access to API
   Services** (required for DataStores).
5. Publish. Create your passes/products, paste the IDs into
   `src/ReplicatedStorage/Shared/Products.lua`.
6. Ship.

Replacing the generated blocks with real modelled sectors later is safe — keep
the `ZoneId` and `NodeIndex` attributes and every service keeps working.

---

## Architecture

```
src/
  ReplicatedStorage/Shared/     -- data tables + pure helpers, safe on both sides
    Config.lua      tuning knobs, rate limits, datastore names
    Zones.lua       9 sectors: cost, multiplier, colour, rebirth gate
    Tools.lua       11 chips (swing power + swing speed)
    Buffers.lua     11 backpacks (capacity)
    Pets.lua        54 familiars across 9 eggs + 4 variants
    Progression.lua fusion stars, evolution XP curve, serial tiers
    Trading.lua     trade rules, shared so the client can pre-validate
    Rebirths.lua    cost/shard/multiplier curves + titles
    Products.lua    the whole monetisation ladder
    Quests.lua      daily pool, login streak, playtime chests
    Codes.lua       redeemable codes
    Remotes.lua     the single remote registry
    Assets.lua      THE ASSET SWAP LAYER -- paste Toolbox ids here
    ModelFactory.lua procedural familiars, eggs and crystal nodes
    Util/Format.lua number abbreviation (1.2Qa)
    Util/Rng.lua    weighted rolls with honest luck

  ServerScriptService/Server/   -- authoritative. The client decides nothing.
    DataService         session-locked DataStore, retries, autosave, migrations
    StateService        every multiplier in the game, one function
    WorldService        procedural map + node respawn
    MiningService       swing validation, nuke, shatter
    EconomyService      sell, buy, auto-sell
    PetService          hatching, equipping, rare-pull announcements
    RebirthService      overclock + nametags
    QuestService        dailies, deterministic per (user, day)
    RewardService       login streak, playtime chests, VIP offline earnings
    GamepassService     ownership + a correct ProcessReceipt
    LeaderboardService  OrderedDataStore → physical boards
    CodeService         code redemption
    AntiCheat           token-bucket rate limits + payload guards
    CharacterService    chip model, trail, big head, VIP perks
    SerialService       global serial minting (block-reserved, throttle-safe)
    FusionService       fusion, evolution XP, pet locking
    TradeService        two-party trading with atomic, re-validated swaps

  StarterPlayer/.../Client/
    init.client.lua  input, hold-to-mine, mobile buttons
    Theme.lua        the 6-function UI kit everything is built from
    HUD.lua          currencies, buffer bar, menu rail, boost timers
    Panels.lua       every menu (one window, swapped contents)
    Effects.lua      floating numbers, screen shake, hatch reveal
    Trade.lua        the two-pane trade window
    Viewport.lua     renders real 3D familiars/eggs inside the UI
    Sound.lua        audio, all ids from Assets.lua (silent until filled)
    Notify.lua       toasts + server-wide banner
```

### The two rules the server code never breaks

1. **The client sends intent, never outcomes.** It says "I swung at this part".
   The server decides whether the part is real, in an unlocked sector, in
   reach, off cooldown, and what it's worth.
2. **Every currency change goes through `EconomyService.award/spend`**, and
   every multiplier through `StateService.multiplier`. One place to audit, one
   place to add the next boost.

`DataService` is the part you cannot bolt on later: session locking (no
dupes across servers), `UpdateAsync` everywhere (no lost writes), exponential
backoff, autosave, `BindToClose` flush, and a migration hook for v2. Lost-data
posts kill simulators faster than bad balance ever will.

---

## Tuning it

Everything a designer touches is a table in `Shared/`. Some starting points:

- **Game feels slow?** Lower `Buffers` capacities or raise `Tools` power — do
  *not* lower node respawn; the walk-and-sell rhythm is the game.
- **Players quit at sector 3?** That's the classic wall. Drop `Zones.list[3].cost`
  by ~30% and check again.
- **Nobody rebirths?** `Rebirths.BASE_COST` is too high relative to zone 4 income.
- **Hatches feel bad?** Widen the gap between `W.common` and `W.legend` in
  `Pets.lua` rather than adding more pets.

Free art from the Creator Store drops in without code changes — see
[`docs/FREE_ASSETS.md`](docs/FREE_ASSETS.md).

See [`docs/BALANCE.md`](docs/BALANCE.md) for the full curve reasoning and
[`docs/LAUNCH.md`](docs/LAUNCH.md) for the ship checklist.
