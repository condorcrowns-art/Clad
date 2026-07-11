# GLITCHTOPIA

A 2D sandbox MMO-style game in the spirit of **Growtopia** and **Pixel Worlds** — rebuilt with a
digital twist: **every item does something**, and the endgame is **boss battles** against four
corrupted processes that hold the network hostage.

Zero dependencies. Pure HTML5 canvas + vanilla JS. Runs in any modern browser.

## Play it

```bash
# from the repo root — any static server works
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` directly in a browser.

## The pitch

You own a **HOME SERVER** — a fully destructible, fully buildable 100×60 tile world that
persists (localStorage, trees even grow while you're offline). Around it, four **corrupted
sectors** wait behind portals, each ending in a boss fight.

### The Growtopia loop, kept
- **Punch blocks** → harvest materials and **data seeds**
- **Plant seeds** on solid ground → trees grow in real time → harvest for blocks, more seeds, gems
- **Splice**: plant a *different* seed onto a sapling to compile brand-new tech (17 recipes,
  discoverable in-game via the Splice Codex `[C]`)
- **Gems** are the economy — mine them, loot them from enemies, spend them in the Gem Exchange `[B]`

### The Pixel Worlds loop, kept
- Portal into hostile sectors full of monsters (risk/reward: **dying in a sector costs 20% of
  your gems**)
- **Cipher keys**: each sector hides 3 keys (marked by beacons + on the minimap) — collect them
  all to unseal the **Cipher Gate** in front of the boss arena, straight out of the Netherworld
- **The WARDEN**: a hulking miniboss has a chance to patrol any sector; kill it for treasure
  (the Nether miniboss homage)
- **Data Caches**: loot chests scattered through every sector
- Boss loot is the best gear in the game

### Front end: profile, menu & settings
- **Character creation** — first boot opens a "Create Your Avatar" screen: name your character
  and pick an avatar colour from a palette (live preview). Your name floats over your avatar
  in-world (Growtopia-style nameplate) and the chosen colour tints your body.
- **Main menu** — **Continue** (greets you by name) vs **New Game**, plus **new character**,
  **settings**, **credits**, and **wipe save**. Everything persists in your save.
- **Menu & pause settings** — sound volume + mute and difficulty are reachable from the title
  screen and mid-game via the pause menu `[P]`.

### Quality-of-life
- **Character sheet `[J]`** — a full read-out of your run: level, XP, HP, gems, shards,
  difficulty, guild, avatar, skill points, and a record page (bosses purged, recipes found,
  enemies slain, blocks broken, splices, fish, dungeons, trades) plus your active skill bonuses.
- **Wardrobe `[U]`** — a Growtopia-style **head-to-toe dress-up panel** with **53 hand-drawn,
  layered pixel cosmetics** that stack on your avatar across **seven slots**:
  - **Hats** — ball cap, top hat, safari, wizard, royal crown, angel halo, knit beanie, party hat,
    headphones, flower crown, demon horns, pirate tricorn, cyber visor
  - **Hair** — spiky, long, mohawk, afro, ponytail, flame hair
  - **Face** — round glasses, cool shades, eye patch, monocle, moustache, ninja mask
  - **Shirts** — hoodie, sharp suit, star tee, hazmat, overalls, plate armor
  - **Back** — angel wings, bat wings, hero cape, flowing scarf, explorer pack, butterfly wings,
    chrome jetpack, dragon wings
  - **Held** — torch, balloon, bouquet, arcane staff, round shield, umbrella, lantern, spirit katana
  - **Auras** — sparkle, frost, shadow, hearts, inferno, prism (rainbow)

  A **live animated avatar preview** shows your look with everything moving — wings flap, the halo
  glows, the cape billows, torches flicker, auras orbit and cycle. **Held items are gripped in the
  hand** and follow the swing. Every piece has a **rarity tier** (common → legendary) that colours
  its cell border, plus **🎲 Randomize**, **✖ Clear all**, and a collection counter.
- **Dye studio** — recolour any worn piece with a **per-slot hue dye** (a row of swatches per
  equipped slot, applied live to the avatar and preview and saved with your character) — so the same
  cosmetic can be tinted a dozen different ways, including a **🌈 rainbow dye** that cycles hue in
  real time.
- **Outfit loadouts** — save your whole look (every slot **plus** its dyes) as a named preset and
  swap between up to 8 with one click — e.g. a "Mage" and a "Pirate" outfit ready to switch instantly.
- **Event calendar** — the wardrobe shows the full rotating event schedule (Bloomfall · Solstice ·
  Hallow's End · Winterburn) with the currently-live event highlighted, so you always know which
  limited set is dropping.
- **Emotes `[O]`** — a Growtopia/Pixel-Worlds-style gesture wheel: **Wave, Dance, Cheer, Laugh,
  Love, Cry, Angry, Sit**. Your avatar animates (hops, sways, sits, shakes) with an emoji speech
  bubble floating above your head.
- **Player titles** — earn titles by playing (**Boss Slayer, Master Splicer, Fashionista, the
  Tycoon, Guild Master, the Purifier, World-Ender, Founder**) and wear one on your **nameplate**;
  pick your active title in the Character sheet `[J]`.
- **Outfit mannequins** — a decorative block (Shard Store) that **wears your current outfit** (with
  its dyes) so you can show off your drip in your home world — just like Growtopia mannequins.
- **Mystery Cosmetic Chest** — a wardrobe gacha: spend **◈10** to roll a random cosmetic you don't
  own yet, weighted so commons are likelier and rarer pieces are a lucky pull, with a reveal pulse on
  the new item (and a gem payout once you've collected them all).
- **Daily quests** — a rotating trio of daily objectives (Demolition, Purge, Splicer, Builder,
  Angler, Gardener, Harvester) that reset each real day, each paying shards, with a bonus for
  clearing all three — shown above the story quests in the Quests panel `[Q]`.
- **Active-buff HUD badge** — when a consumable food/drink buff is running (Overclock Cola, Lucky
  Soda, Adrenaline Shot…), a small badge under the HP bar shows the buff and its remaining seconds.
- **Login reward calendar** — a **7-day streak track** that pops on your first login each day:
  claim escalating rewards (gems → shards → medkits → a big day-7 payout), with a streak counter
  that resets if you skip a day — the classic live-service login calendar.
- **Cosmetics that fight** — cosmetics aren't just for looks: each has a **combat power** (shown as
  a ⚔ badge) that grants **bonus damage vs bosses** and **damage resistance**. Crucially, **the
  harder a piece is to obtain, the stronger it is** — easy-to-buy store clothes give ~1 power, boss
  drops ~6, all-boss milestones ~8, **world-boss loot ~12**, and **limited seasonal / one-time event
  gear is the strongest (15–20)**. Wear a full themed **set** (Overseer, Frostfire) for a big extra
  bonus. The wardrobe shows your live totals (e.g. *+109% boss damage · 29% resist*).
- **Where cosmetics come from** — **starters** (free), the **◈ Shard Store**, **sector-boss drops**
  (Royal Crown → Spirit Katana as you purge more), **milestones** (Angel Halo, Prism Aura, …), the
  **World Boss** (the Overseer set), and **limited events** (the Frostfire set — only while an event
  is live) plus a permanent **one-time Founder's Aureole**. Everything saves with your character.

### World Bosses & live events
- **Three world bosses** `[V]` — travel by name to fight escalating endgame bosses, each far tougher
  than a sector boss and each with a signature bullet-hell moveset, enrage phase, polished
  rounded/glowing render, and its own powerful cosmetic set:
  - **THE OVERSEER** (unlock: 3 bosses, 4,200 HP) — radial rings, aimed volleys, pillars → **Overseer set**
  - **THE ARCHIVIST** (5 bosses, 5,200 HP) — spiralling pages + homing ink → **Archivist set**
  - **NULL SOVEREIGN** (7 bosses, 6,400 HP) — counter-rotating void rings + gravity wells → **Sovereign set**
  - **OMEGA.EXE** (all 3 world bosses, 9,000 HP) — the final boss: **three escalating phases** with
    denser bullet rings, **minion swarms**, and phase-3 pillars → the **mythic Omega set** (the
    strongest cosmetics in the game, +50% boss damage / +20% resist as a set)
- **Seasonal / limited events** — real-calendar windows that rotate all year: **Bloomfall** (spring),
  **Solstice Surge** (summer), **Hallow's End** (autumn), **New Year Bash** (late Dec–early Jan),
  **Winterburn** (winter). While an event is
  live, defeating **any** world boss also drops that event's **limited set** (Bloomfall petals,
  Frostfire ice-and-fire, Hallow's End pumpkins) — unobtainable once the window closes, so event loot
  is genuinely rare and among the strongest in the game. Plus a permanent **one-time Founder's Aureole**.
- **Inventory search & sort** — a search box and a sort selector (type / name / rarity / count)
  in the inventory panel.
- **Rebindable keys** — every panel/action key can be remapped in the pause menu (movement stays
  fixed); reserved keys are protected and your layout is saved.

### RPG staples
- **Skill tree `[T]`** — earn a skill point every level and spend it across five stats:
  **Vitality** (+max HP), **Power** (+weapon damage), **Mining** (+dig speed), **Agility**
  (+move speed), and **Fortune** (+gem drops), up to 10 ranks each. Persisted with your save.
- **Difficulty modes** — **Chill / Normal / Hardcore** (set in the pause menu) scale how hard
  enemies hit and, on Hardcore, hand back +25% XP for the extra risk.
- **Pause & settings menu `[P]`** — freezes the game and opens sound controls (SFX volume slider
  + mute) and the difficulty selector. Everything's remembered between sessions.

### More systems, borrowed from both games
- **Trading `[Y]`** — the classic Growtopia/Pixel Worlds **trade window**, against a **Data
  Broker**. Drag your items and gems into YOUR OFFER, request items or gems from the broker,
  and the window live-balances both sides by value — the broker only accepts when your offer is
  worth at least as much as theirs. Sell surplus for gems, buy stock, or barter item-for-item.
  *(This game is offline/single-player, so the counterparty is an in-game broker rather than a
  live player.)*
- **Fishing** — buy a Data Rod, cast into your home ponds, reel on the `[!]` for gems, healing
  fish, seeds, and the rare Golden Fish
- **Pets/familiars** — splice a Pocket Drone (Sentry + Blaster) that hovers beside you and fights;
  clear the Boss Rush for the Core Sprite, which also heals you
- **Weather machines** — splice a Weather Core, stand on it, press `[S]`: Daylight, Sunset,
  Midnight, Matrix Rain, Vaporwave skies (saved with your world)
- **Home Doors** — walk-through doors that set your respawn/arrival point
- **Data Signs** — writable signs that display text when someone stands near
- **Quests** — 12-quest log (`[Q]`) with gem/item rewards
- **Recycler** — sell surplus items back into gems in the shop (`[B]`)
- **Daily login bonus** with streaks
- **Minimap** for navigating sectors and finding keys
- **BOSS RUSH** — beat ADMIN to unlock a fifth portal: all four bosses back-to-back. First clear
  awards the Overclock Chip and the Core Sprite pet.

### The twist: nothing is cosmetic (unless you want it to be)
**~215 splice recipes** form a true network — results splice with other results, four tiers deep,
and every recipe is validated reachable starting from the six natural blocks (dirt, stone, wood,
sand, snow, ice). You can even **farm consumables**: grow trees of Medkits, Elixirs (full heal),
Logic/Cluster Bombs, Fireworks, Warp Whistles (teleport home from anywhere), Nano Shields (4s
invulnerability), Stasis Grenades (slow every enemy on screen), Lucky Soda (+50% gem drops),
Brain Juice (+150 XP) and Overclock Cola.

**The fire branch:** Tar + Wood compiles the **Torch**, and torchfire spreads through the whole
tree — Ember Saber, Blaze Katana, Magma Maul, Ember Blaster, Dragon Breath (burning shotgun),
Flame Sentry, Hearth (healing fireplace), Eruption Pad, Lantern Ledge. The **frost branch**
mirrors it from ice/snow: Frost Saber/Fang, Glacier Maul, Cryo Blaster, Frost Lamp, Icicle Trap,
Glacier Ledge, Snowball Turret (knockback), Powder Drift (enemy-slowing snow), Skate Blades.
Plus Void/Aurora lamps, Snare Traps, Spiked Walls, Cluster Mines, Bunker Turrets, Guard Posts,
Venom/Pitch turrets, Escalator Vines (auto-climb), Sky Geysers (16-tile wind), Launch Rails,
Feather Ledges, Jingle Springs (musical bounce), Aquariums, Prism Clusters, Groove Boots,
Bramble Shells, Freerun/Greed chips, and Mortar Mite / Spark Sprite pets.

Highlights of the deeper web:

| Chain | What you get |
|---|---|
| Wood + Spring → **Cloud Plank** | One-way platforms (jump up through, land on top) |
| Wood + Conveyor → **Rung Rail** | Climbable ladders |
| Brick + Conveyor → **Dash Pad** | Sideways launcher |
| Conveyor + Teleporter → **Updraft Turbine** | Rideable wind-column elevators |
| Spring + Teleporter → **Grav Well** | Low-gravity aura zone |
| LED + Repair Node → **Grow Lamp** | Trees near it grow 2× faster |
| Ice + Sentry → **Frost Coil** | Chills all nearby enemies to half speed |
| Sentry + Drill → **Sentry MkII** · Sentry + Spike → **Flak Turret** | Turret tech tree |
| Spike + Blaster → **Proximity Mine** | Enemy-triggered explosive |
| Magnet Chip + Stone → **Magnet Pylon** | Collects all drops to one spot |
| Dirt + Repair Node → **Compost Bin** | Feed any item, get a random seed |
| Brick + Pickaxe → **Breaker Maul** · Conveyor + Sword → **Pulse Katana** · Spike + Sword → **Venom Edge** | Melee weapon tree |
| Blaster + Conveyor → **Scatter Cannon** · Blaster + Ice → **Cryo Blaster** | Gun tree |
| Drill + Laser → **Railgun** · Laser + Scatter → **Star Cannon** | Tier-4 gun capstones |
| Jackhammer + Breaker Maul → **Omni-Tool** | Tier-4 tool capstone |
| Glider + Jetpack → **Hover Pack** | Hold SPACE to hover in place |
| Glass + Ladder → **Gecko Chip** | Wall-slide + wall-jump |
| Crystal Cluster + Repair Node → **Crystal Heart** | +30 max HP |
| Glass + Note Block → **Lure Buoy** | Fish bite 2× faster + luckier catches nearby |
| Brick + Sign → **XP Shrine** · Crystal + LED → **Fortune Totem** | +50% XP / +50% gem drops while near |
| LED + Spike → **Scare Totem** | Enemies refuse to approach |
| Brick + Teleporter → **Ghost Brick** | Looks solid, walks through — secret doors |
| Glider + Spring → **Boost Ring** | Mid-air boost + refreshed double-jump; chain sky roads |
| Conveyor + Note → **Jukebox** | Generative melody while you're near |
| Platform + Repair → **Life Ledge** · Platform + Spike → **Trap Ledge** | Healing / enemy-shredding platforms |
| Ladder + LED → **Glow Vine** · Crystal + Spring → **Mega Spring** · Conveyor + Ice → **Frost Rail** | Traversal upgrades |
| Brick + Spike → **Thorn Chip** · Crystal + Conveyor → **Battery Chip** · Brick + Shield → **Turtle Pack** | Reflect 35% / efficient fuel / tank armor |
| Drone + Ice → **Chill Wisp** · Drone + Magnet Chip → **Loot Weevil** | Pet variants: slowing shots / 9-tile loot vacuum |
| …plus Moon/Rocket Boots, Scholar/Leech/Miner/Garden chips, Beacon, Disco Core, Fountain, Sprinkler, Tar, Obsidian, Alarm, Fortress Core | |

**THE HIVE & the SWARM QUEEN** — a golden 7th sector guarded by four new enemy types: **hornets**
(fast swarming flyers), **sappers** (tunnel straight through your walls), **shielders** (deflect
projectiles from their front), and **menders** (heal the rest of the swarm). At the far end, the
crowned **SWARM QUEEN** dive-bombs, spits stinger volleys, and births endless hornets — drop her
for the **Hive Staff** (homing stingers) and **Queen's Wings** (fuel-free glide + air jump).

**Achievements** — a 20-milestone trophy panel (`[G]`) that auto-rewards gems the instant you
hit each goal, from First Blood to Compiler of All (discover 120 recipes).

### Building for looks, not just function
Not everything has to *do* something. A **decorative branch** of the splice network compiles
**24 purely-cosmetic blocks** — Marble, Fabric, Pillars, Statues, Paintings, Banners, Rugs,
Chandeliers, Potted Plants, Neon Signs, Bookshelves, Stained Glass, a Grand Clock, a Trophy,
plus a second wave: a **Royal Throne, Ornate Fountain, Wall Sconce, Standing Mirror, Flower
Vase, Silk Curtains, Arcade Cabinet, Fishbowl, Disco Ball, and Stone Gargoyle** — each with
bespoke (often animated) tile art and zero gameplay effect, straight out of the Growtopia
"just make it pretty" school of world-building. Splice them, place them, decorate your server.

### Guilds `[H]`
Found a guild for ◆500, name it, and **contribute gems** to level it up. Every guild level
grants stacking, account-wide perks that follow you into every world: **+3% gem drops, +3% XP,
and +4 max HP per level** (capped at +50% / +50% / +60). Hit **level 5, 10, 15, 20** and each
milestone unlocks a **free permanent ally slot** for your roster (below). It's a long-term gem
sink that makes your whole account permanently stronger.

### Dungeons + a co-op roster
Portal into **THE DUNGEON** from your home server — a procedurally generated multi-room crawl
that reshuffles every run. It rolls one of **four themes** (CATACOMB, FOUNDRY, CRYOVAULT,
SANDTOMB), each with its own palette, floor tile, and enemy roster. Rooms come in flavors too:
ordinary **combat**, loot-stuffed **treasure vaults**, trap-lined **gauntlets**, and **elite
chambers** that spawn a buffed, crowned, aura-glowing elite worth extra loot. Each room is
gate-sealed until you **clear it**; push through 4–6 rooms to the **themed guardian** (elite at
higher progress), then loot the reward.

Bring a squad. Buy **Hire a Comrade** from the Shard Store and each purchase permanently adds an
**AI ally** to your **roster** (up to four) — distinct kits (**ALLY / GUNNER / WARDEN / HEXER**,
each its own color, fire-rate, range and HP) that follow you across every world, spread out
behind you, shoot your enemies, take hits, and **revive after being downed**. Guild milestones
grant free roster slots on top of hired ones.

### ◈ Shard Store `[K]` — an honest monetization model
Games like this sell premium currency for real money. Glitchtopia keeps the *shape* of that
system but not the wallet-draining: **◈ Shards are a premium currency you earn by playing** —
+2 per new boss kill, +1 per achievement, +3 from the daily login. Spend them in the Shard
Store on gem pouches, a World Lock bundle, an XP surge, a Starter Pack, extra roster allies, and
**seven purely-cosmetic avatar skins** — **Golden, Shadow, color-cycling Prism, Crimson, Tidal,
Toxic**, and the starfield **Void** — each with its own glowing aura. Owned skins can be
re-equipped or swapped for free. The store carries a permanent disclaimer: *no real money,
nothing to buy.*

The first-tier basics:

| Splice | Result | What it does |
|---|---|---|
| Dirt + Stone | Brick | Tanky building block |
| Sand + Stone | Glass | See-through walls |
| Dirt + Wood | Spring Pad | Launches you skyward |
| Stone + Wood | Conveyor Belt | Drags you sideways (directional) |
| Sand + Wood | LED Block | Light source |
| Dirt + Sand | Spike Trap | Hurts anything that touches it |
| Glass + Stone | Teleporter | Stand + `[S]` to warp between them |
| Glass + LED | Repair Node | Heal aura |
| Brick + LED | Sentry Node | Auto-turret that fights for you |
| Brick + Wood | Data Pickaxe | 2× mining power |
| Brick + Glass | Shard Blade | Melee weapon |
| Glass + Wood | Photon Blaster | Rapid-fire ranged weapon |
| Spring + Conveyor | Velocity Boots | +35% speed, double jump |
| LED + Conveyor | Magnet Chip | Loot flies to you |
| Brick + Spring | Aegis Chip | 30% damage reduction |
| Pickaxe + Glass | Plasma Drill | 8 hits/sec mining |
| Blaster + Spring | Ion Jetpack | Hold SPACE to fly |
| Sentry + Glass | Tesla Coil | Chain lightning hits 3 enemies |
| Repair Node + Brick | Shield Generator | −25% damage taken near it |
| Spike Trap + Conveyor | Grinder | Shreds enemies, harmless to you |
| LED + Spring | Weather Core | Reprograms your sky (5 weathers) |
| Dirt + Glass | Home Door | Walk-through door, sets respawn |
| Wood + LED | Data Sign | Writable sign |
| Blaster + Glass | Lance Beam | Piercing shot, skewers a whole line |
| Sentry + Blaster | Pocket Drone | Pet familiar that fights for you |
| Brick + Stone | Crystal Cluster | Farmable gem deposit (6–12 gems) |
| Glass + Spring | Glider Wings | Hold SPACE to glide, no fuel |
| Sand + Glass | Chime Block | Musical note when stepped on, tunable with `[S]` |
| Conveyor + Glass | Recall Disc | Boomerang blade — hits on the way out AND back |

### The bosses

| Sector | Boss | Fight | First-kill drop |
|---|---|---|---|
| Firewall Sector | **FIREWALL DAEMON** | Fireball volleys + telegraphed fire pillars; enrages at 50% | Daemonfire Blade (burn damage) + Firewall Blocks (fire that only hurts *enemies*); rare Ember Kit pet on repeat kills |
| Data Mines | **NULL WURM** | A segmented worm that *eats the terrain* while chasing you | Wurmbore Drill (mines 3×3) |
| Flooded Archive | **KRAKEN.SYS** | Bobs in a half-drowned sector — arcing ink volleys, tentacle columns erupting from below, phase-2 whirlpool pull | Torrent Lance (piercing knockback cannon) + Buoy Chip (float & torpedo-swim) |
| The Cloud | **STORM KERNEL** | Teleports, homing sparks, telegraphed lightning columns | Stormstep Boots (triple jump + SHIFT lightning-dash) |
| Shadow Partition | **ROOTKIT** | A pitch-black sector; the boss *turns invisible*, circles you, and dash-slashes along telegraphed lines while spawning wraiths | Wraith Chip (15% dodge, +10% speed) |
| The Core | **A D M I N** | Ban-hammer slams, radial bursts, summons enforcers | ADMIN Crown (+50% dmg, armor, magnet, regen) + Network Core Trophy |

Beating bosses unlocks further portals. Bosses are re-fightable for gems.

### Beyond the sectors
- **THE MINESHAFT** — a 140-tile-deep vertical mining world. Copper → Silver → Aurum → Core
  Crystal veins get richer (and enemies meaner) the deeper you dig, by torchlight.
- **THE STACK** — a vertical parkour gauntlet of spikes, springs, conveyors and magma.
  Three Golden Caches at the summit, repeatable.
- **XP & levels** — everything you do earns XP; each level grants +3 max HP.
- **The Merchant** — a hooded trader who docks at your home server with a rotating
  black-market stock (rare seeds, pets, jetpacks) for 90 seconds at a time.
- **Gem Rain** — occasionally the network leaks currency over your home world. Catch it.
- **Overclock Cola** — +40% speed & damage for 30s.
- **OVERDRIVE MODE** — post-Boss-Rush toggle: enemies +3 levels everywhere, all gems doubled.
- **BOSS RUSH** now chains all **six** bosses back-to-back.

### Even more Growtopia / Pixel Worlds DNA
- **Type a name, travel anywhere** (`[V]`) — the signature Growtopia/Pixel Worlds move. Every
  name is a world: the terrain is generated *deterministically from the name*, so the same name is
  always the same world (a shared single-player namespace). Public worlds reset when you leave —
  unless you **claim** one with a World Lock, after which it saves like home. A 🎲 button warps you
  to a random world, and "magic" names map to themed biomes (`hell`→volcanic, `heaven`→verdant,
  `winter`→tundra, `sahara`→desert…).
- **World Locks & founding** — buy a World Lock (◆1500, Golden Cache, or Spire wave 10) to found
  or claim a persistent world. Biomes: verdant, desert (harvestable cacti!), tundra (snow +
  slippery ice + frozen ponds), volcanic.
- **BLACK SPIRE** — wave-defense arena (the Black Tower homage): escalating waves, elite WARDEN
  waves every 5th, gems + drives every clear, a World Lock at wave 10. Leave between waves.
- **DEFRAG minigame** — the Surg-E homage: Corrupted Drives drop from enemies/chests; jack in and
  hit the right op (SCAN/PATCH/PURGE/COOL) before the timer empties, 5 operations, 3 faults and
  the drive is lost. Flawless runs pay out big.
- **Paint buckets** — 6 colors + stripper; click any placed block to recolor it. Paint persists.
- **Display Shelves** — exhibit any item on a shelf (`[S]`). Build museums.
- **Vendor Bots** — stock up to 10 of an item; the bot sells one every 25 s and pops the gems out.
- **Fireworks** — celebration rockets that also nuke anything near the burst.
- **Secret vaults** — every sector hides a sealed treasure room. Dig.
- **Emotes `[O]`** — the gesture wheel (Wave/Dance/Cheer/Laugh/Love/Cry/Angry/Sit) with animated
  poses and an emoji speech bubble, straight out of both games.
- **Titles** — earnable nameplate titles (Boss Slayer, Fashionista, the Tycoon, World-Ender…),
  chosen in the Character sheet.
- **Outfit mannequins** — display blocks that wear your current dyed outfit, for showing off builds.

**Honestly out of scope (single-player, no server):** live global/world chat, real player-to-player
trading (there's a value-matched **Data Broker** stand-in), friends lists, and server-side
moderation — these need a live multiplayer backend, which this zero-dependency offline game doesn't
have. Everything that *can* work single-player from the Growtopia/Pixel Worlds feature set is in.

### Presentation & building feel
- **On-screen nav dock**: a right-side column of labelled icon buttons opens every panel — Bag,
  Wear, Emote, Splice, Quests, Shop, Store, Trade, Guild, Skills, Hero, Worlds, Awards, Menu — so
  nothing needs a memorized hotkey. The button for the open panel highlights, and you can jump
  straight between panels without closing first (keys still work too).
- **Polished modal UI**: every panel is a chunky Growtopia-style modal — a gradient **header band**
  with an accent underline and a **✕ close button**, a **pop-in animation**, a full-screen **focus
  dim** behind it, glossy item slots with a top sheen, and a satisfying press on every button.
- **Bloom post-processing**: a real screen-space glow pipeline — the frame is bright-passed at
  half-res, blurred, and additively composited back, so every light source, lava tile, crystal,
  projectile, sun/moon and boss effect blooms cinematically. Toggle it in the pause menu.
- **Day/night cycle**: outdoor worlds (home + your founded/visited worlds) run a live ~2.5-minute
  day — a sun and cratered moon arc across the sky, the light warms at sunrise/sunset, the scene
  dims at night and a starfield fades in overhead
- **Layered parallax backdrops**: every world renders a deterministic multi-depth sky — hazy
  ridgelines, floating "server tower" monoliths with blinking windows, drifting clouds on bright
  worlds and a twinkling starfield on dark ones — all scrolling at their own depth for real
  atmosphere behind the play space
- **Animated tiles**: flowing water, banners and curtains that billow in the breeze, and a gentle
  breathing pulse on every light source (LEDs, lamps, crystals, teleporters)
- **Procedural block textures with directional lighting**: a detailed texture is baked once per
  material (cached) — dense value-noise grain plus material-specific **cracks (rock), grain lines
  (wood), or scratches (metal)** — with a **light-from-top-left gradient baked in**, so every block
  reads as a chiseled, directionally-lit 3D surface instead of a flat colour. A generate-graphics-
  in-code system, no image assets.
- **Smooth, shaded characters**: the player avatar, AI allies, and **enemies** are drawn with
  **rounded silhouettes**, **body/head gradients**, a **rim light** and a soft dark outline, capsule
  limbs with rounded hands, a glossy visor, and a **soft ground contact shadow** — volume and polish
  instead of flat rectangles. Enemies get radial shading + glossy eyes; every **boss** gets a soft
  menacing glow and ground shadow. The wardrobe preview and cosmetic swatches use the same rounded,
  shaded rendering so the look is consistent everywhere.
- **Volumetric tile shading**: a cached soft form-light + corner ambient-occlusion pass gives
  every block rounded volume instead of a flat fill, with extra contact shadows in concave corners
- **Sticker-finish icons**: each item icon is 3×-supersampled for smooth source art, rendered at
  56² and pixelated at 46² (well over 2× the pixels of the original pass), dark-outlined,
  gloss-beveled, rim-lit from the top-left and lifted off a soft drop shadow — the polished
  Growtopia "inventory sticker" look, shown in enlarged hotbar/inventory slots
- **Auto-tiled terrain**: neighbor-aware edges, grass-capped dirt with waving blades, real brick
  courses, wood planks with knots, glass shine, flickering corrupted blocks
- **Background wall layer**: right-click places any block as wallpaper behind the world
  (LED walls glow!), right-click with a tool breaks walls — full Growtopia-style two-layer building
- **Ghost placement preview** (green = valid, red = blocked) and a **middle-click pipette**
  that picks the hovered block into your hotbar
- **Player animation**: real walk cycle, squash-and-stretch landings, jump/fall poses, idle
  breathing, melee slash arcs, dash afterimages, swim kick
- **Particles everywhere**: footstep dust, landing puffs, swim bubbles, projectile trails,
  hit sparks, chip auras (wraith wisps, overclock sparks, admin gold) — plus per-world ambience:
  rising embers, drifting data motes, mine dust, wind streaks, deep-sea bubbles, shadow wisps,
  and actual falling glyphs in Matrix Rain weather
- **Living trees** that sway in the wind and visibly ripen their fruit

## Controls

| Key | Action |
|---|---|
| `A/D` or arrows | Move |
| `SPACE` / `W` | Jump (hold SPACE mid-air with jetpack to fly) |
| Left click | Punch / mine / place / plant / attack / use |
| Right click | Place / break **background walls** |
| Middle click | Pipette: pick hovered block into hotbar |
| `1–9` | Select hotbar slot |
| `E` | Inventory & equipment (back / feet / chip / pet) |
| `B` | Gem Exchange (shop) + Recycler |
| `C` | Splice Codex |
| `Q` | Quest log |
| `V` | My Worlds — found or claim worlds, travel to any name |
| `G` | Achievements |
| `H` | Guild — found, contribute, view perks |
| `K` | ◈ Shard Store |
| `T` | Skill tree — spend level-up points |
| `J` | Character sheet — stats & records |
| `U` | Wardrobe — dress-up your avatar (hats / face / wings) |
| `Y` | Trade — the Data Broker trade window |
| `P` | Pause / settings — sound, difficulty & keybinds |
| `S` | Use teleporter / cycle Weather Core under your feet |
| `W` | Enter portal |
| `SHIFT` | Dash (Stormstep Boots) |
| Right-click hotbar | Clear slot |

## Code layout

```
index.html      shell + UI markup
css/style.css   HUD, panels, menus
js/items.js     item registry, splice recipes, shop, icon renderer
js/world.js     tile engine, world gen (home + 4 sectors), trees, tile FX
js/entities.js  physics, enemies, projectiles, drops, particles, synth SFX
js/bosses.js    the four boss fights
js/player.js    movement, gear powers, inventory, mining/combat
js/ui.js        DOM UI: hotbar, inventory, shop, codex, tooltips
js/main.js      game loop, input, camera, world switching, save/load
```

Design research: Growtopia's punch→seed→splice loop ([splicing guide](https://growtopia.fandom.com/wiki/Guide:Splicing),
[Wikipedia](https://en.wikipedia.org/wiki/Growtopia)) and Pixel Worlds' Netherworld boss/risk
structure ([wiki](https://pixelworlds.fandom.com/wiki/Netherworld)).
