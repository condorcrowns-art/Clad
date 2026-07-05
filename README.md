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
- Portal into hostile sectors full of monsters (Growtopia-style risk/reward: **dying in a sector
  costs 20% of your gems**)
- Reach the far side of each sector to wake its boss
- Boss loot is the best gear in the game

### The twist: nothing is cosmetic
Every splice result is *functional*:

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

### The bosses

| Sector | Boss | Fight | First-kill drop |
|---|---|---|---|
| Firewall Sector | **FIREWALL DAEMON** | Fireball volleys + telegraphed fire pillars; enrages at 50% | Daemonfire Blade (burn damage) + Firewall Blocks (fire that only hurts *enemies*) |
| Data Mines | **NULL WURM** | A segmented worm that *eats the terrain* while chasing you | Wurmbore Drill (mines 3×3) |
| The Cloud | **STORM KERNEL** | Teleports, homing sparks, telegraphed lightning columns | Stormstep Boots (triple jump + SHIFT lightning-dash) |
| The Core | **A D M I N** | Ban-hammer slams, radial bursts, summons enforcers | ADMIN Crown (+50% dmg, armor, magnet, regen) + Network Core Trophy |

Beating a boss unlocks the next portal. Bosses are re-fightable for gems.

## Controls

| Key | Action |
|---|---|
| `A/D` or arrows | Move |
| `SPACE` / `W` | Jump (hold SPACE mid-air with jetpack to fly) |
| Left click | Punch / mine / place / plant / attack / use |
| `1–9` | Select hotbar slot |
| `E` | Inventory & equipment |
| `B` | Gem Exchange (shop) |
| `C` | Splice Codex |
| `S` | Use teleporter under your feet |
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
