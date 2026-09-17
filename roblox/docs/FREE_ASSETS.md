# Using Creator Store free assets

The Creator Store (`create.roblox.com/store/models`) is Roblox's own asset
library. Everything marked FREE there is published under Roblox's terms for use
in your experiences — it is not scraping, not ripping, and carries no takedown
risk. Using it is the normal, intended workflow, and it is how you get a
polished-looking game without being an artist.

This project is built so free assets **drop in without touching code.**

## What's worth grabbing (and where it plugs in)

| Store category | What to search | Where it goes in this project |
|---|---|---|
| **3D Assets** | "crystal", "ore", "gem", "low poly rock" | Replace the generated node cubes — see below |
| **3D Assets** | "sci fi building", "futuristic platform", "cyber props" | Dress the sector floors; drop them anywhere in `Zone_<id>` |
| **3D Assets** | "pet", "creature", "low poly animal" | Real familiar models instead of the emoji cards |
| **Visual Effects** | "particle pack", "explosion", "magic aura" | `Effects.lua` — swap the `ParticleEmitter` config |
| **Audio** | "mining hit", "coin pickup", "level up", "ui click" | Add `SoundService` playback in `Effects.lua` |
| **Audio** | "chill loop", "background music" | One looping `Sound` in `SoundService` |
| **2D Assets** | "UI icon pack", "currency icon" | Replace the emoji in `Theme`/`HUD` with `ImageLabel`s |
| **3D Assets** | "egg", "chest" | Physical egg models at each sector's hatch spot |

## Swapping node models in (the one code touch)

`WorldService.buildNode` creates a neon cube. To use a Store model instead:

1. Put the model in `ReplicatedStorage/NodeModels/<zoneId>`.
2. In `buildNode`, clone that model instead of building the `Part`, then keep
   these three lines exactly as they are:

```lua
node:SetAttribute("ZoneId", zone.id)
node:SetAttribute("NodeIndex", index)
node:SetAttribute("Broken", false)
```

Everything else — mining, the nuke, shatter, respawn, the client's
`nodeUnderMouse` — keys off those attributes and keeps working. The model just
needs a `BasePart` (or a `Model` with a `PrimaryPart`) to carry them.

## Familiar models

`Effects.hatchReveal` and the pet list currently render emoji. To use models:
put them in `ReplicatedStorage/PetModels/<petId>`, then render a `ViewportFrame`
pointed at a clone in the hatch card and the pet row. The pet **data** never
changes — `Pets.lua` is the source of truth either way.

## Two rules before you use anything

1. **Check it's actually free and actually on the Creator Store.** A model
   re-uploaded from another game is still that game's asset even if someone
   marked it free. If a "Steal a [X] Map" model is literally another game's map,
   don't ship it — that's the one case that gets a game deleted.
2. **Scan free *scripts* before you run them.** Free models with embedded
   scripts are the oldest backdoor vector on the platform. Models are safe;
   scripts inside models need reading. This project needs zero free scripts —
   only meshes, sounds, particles and images.

Free **art** is a shortcut worth taking. Free **code** is how you lose a game.
