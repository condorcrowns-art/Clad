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

### More systems, borrowed from both games
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

### The twist: nothing is cosmetic
**141 splice recipes** form a true network — results splice with other results, four tiers deep,
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
- **World Locks & MY WORLDS** (`[V]`) — buy a World Lock (◆1500, or find one in a Golden Cache /
  Spire wave 10) and **found your own named world**. Each rolls a random biome — verdant, desert
  (harvestable cacti!), tundra (snow + slippery ice + frozen ponds), or volcanic — and persists
  exactly like home.
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

### Presentation & building feel
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
| `V` | My Worlds (found new worlds with World Locks) |
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
