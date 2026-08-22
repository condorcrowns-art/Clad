# CLAUDE.md — repo guide & project handoff

Read this first. It carries context from a Claude Code **web** session into a **local**
session so nothing has to be re-explained.

---

## RULE 0 — BUDGET: DO NOT SPEND MONEY

The user's standing instruction, given at the top of the originating session:

> **"DO NOT SPEND ANY MONEY OK?"**

This is not scoped to one task. It applies to everything until the user personally lifts it.

- No paid API calls, no metered generations, no subscriptions, no purchases.
- If an action *might* incur cost, **stop and ask first**. Do not decide on their behalf.
- See [Higgsfield rules](#higgsfield-asset-pipeline) — some calls are free, some bill. The
  distinction matters and is easy to get wrong.

---

## What's in this repo

### GLITCHTOPIA (existing, at repo root)

A 2D sandbox MMO-style game — Growtopia / Pixel Worlds inspired, with boss battles.
**Pure HTML5 canvas + vanilla JS. Zero dependencies.** Runs by opening `index.html`.

```
index.html
css/style.css
js/  main.js  player.js  entities.js  world.js  items.js  bosses.js  ui.js
```

~10.5k lines total. Mature and actively developed — see `README.md` for the full design.
**This is a separate project from the 3D game below. Don't conflate them.**

### The new 3D game (not started)

A **brand-new** 3D game. Nothing has been committed for it yet.

---

## New 3D game — spec so far

### Confirmed requirements

- **3D**, not 2D. Completely new project, unrelated to GLITCHTOPIA.
- **WASD movement + mouse look.** Third-person (the player must see their character).
- A **custom character of the user's own design** — they will describe it and possibly
  provide a rough sketch.
- The character wields a **staff** with **visual effects and usable powers**.

### Not yet decided

- **Engine.** The user strongly prefers **Unity** ("so much better with graphics and
  optimization"). That preference is reasonable and should be respected.
  - Web-session Claude recommended three.js *only* because the cloud container has no
    Unity install and no Unity tooling — it could write C# but never compile, run, or
    test it. That constraint disappears locally. **If Unity is available on this machine,
    build in Unity.**
  - Verify before assuming: `Unity -version`, or check Unity Hub.
- **Character design.** The user has not described it yet. Ask for it.
- **Project name.** None chosen.

### Proposed staff ability set (starting point, not approved)

Offered as a conversation-starter — confirm with the user before building:

| Ability | Input | Feel |
|---|---|---|
| Arcane bolt | LMB | Fast, low-cost, chainable projectile |
| Channelled beam | Hold RMB | Sustained damage, drains mana, heavy VFX |
| Ground slam / nova | Space+LMB or Q | Radial shockwave, knockback |
| Blink | Shift | Short dash with trail + afterimage |
| Ultimate | R | Big set-piece — the payoff for the VFX pipeline |

Design the ability system **data-driven** (ScriptableObjects in Unity) so powers can be
added without touching the controller.

---

## Higgsfield asset pipeline

The user has their **own** Higgsfield account. **It is NOT connected to Claude.** They run
all generations themselves; Claude writes the prompts. Never assume tool access to it.

### Their unlimited models (confirmed from account screenshot)

| Model | Type | Note |
|---|---|---|
| Seedance 2.5 Unlimited | video | 720p, up to 10s. Expires ~Sep 9 2026 |
| FLUX.2 Pro | image | 1K, 365 Unlimited |
| GPT Image | image | 365 Unlimited |
| Seedream 4.5 | image | 365 Unlimited |
| Kling O1 Image | image | 365 Unlimited |
| Nano Banana | image | 365 Unlimited |
| Seedream 5.0 Lite | image | 365 Unlimited |
| Soul | image | mentioned by user |

### ⚠️ What the unlimited grant does NOT cover

Higgsfield's own workflow docs state the unlimited allowance applies **only** to
`generate_image`, `generate_video`, and `generate_audio`:

> "Anything that is not one of the three generate_* tools takes no `use_unlim` —
> assembly, upscales, transcription/subtitles and similar are billed as usual."

**Therefore `generate_3d` (image → GLB mesh) will almost certainly CHARGE.**
Under Rule 0, **do not run or recommend running it** until the user confirms the cost in
their account. This was flagged to them and is unresolved.

### Two hard-won technical rules

**1. NEVER build character animation from AI video.**
Generating a walk-cycle video and extracting frames does not work. AI video drifts
frame-to-frame — the face, weapon, and clothing details morph continuously. The result
shimmers and is unusable as a loop.

**2. DO use AI video for VFX flipbooks.**
The same drift is *invisible* in magic effects — swirling energy, fire, shockwaves,
portals, embers. Chaotic motion is what those effects are supposed to do. The user's
unlimited Seedance 2.5 is genuinely well-suited to the staff powers. Generate on a black
background for easy additive blending.

**3. For consistent character views, generate ONE image containing all views.**
A turnaround sheet produced in a single generation is internally consistent by
construction. Generating poses one at a time drifts between them.

### Free asset plan (zero paid calls)

| Asset | Source | Cost |
|---|---|---|
| Character mesh | Built in-engine / free base mesh | free |
| Character textures, face, concept art | Their unlimited image models | free |
| Staff VFX flipbooks | Seedance 2.5 video | free |
| Skybox, ground, props, UI art | Their unlimited image models | free |
| Rigging | Mixamo auto-rig (humanoid) | free |

### Higgsfield character-sheet prompt architecture

Higgsfield ships a `character-sheet` workflow. Load it with
`get_workflow_instructions({ workflow: "character-sheet" })` (docs read — free, no
generation). Key points:

**Slot order** (image models weight earlier tokens more):
```
[COMPOSITION CLAUSE], identical original [subject] on all views,
pure white seamless studio background, professional character sheet presentation,
[IDENTITY], [FACE], [EYES], [EYEBROWS], [HAIR], [REALISM/RENDER MODULE],
[BODY], [WARDROBE: top → layers → bottom → belt → shoes → jewelry → weapon],
[LIGHTING], [QUALITY TAIL], [NEGATIVE TAIL]
```

**For a game character, use:**
- Composition: `turnaround` —
  `Character turnaround model sheet, four consistent full-body views in a row — front
  view, 3/4 view, side profile, and back view, evenly spaced,`
- Style preset: `game-concept` (painterly, orthographic model sheet, clear silhouette) or
  `3d-stylized` if going for a Pixar-ish 3D look.
- Negative tail always: `no text, no watermark, no logos, no frame borders` plus
  `single subject only, exactly one person, no duplicate figures`.

**Non-negotiables from the workflow:** original characters only (no real-person likeness,
no existing IP); specificity beats adjectives; state the character is *identical* across
all views; carry every established detail forward unchanged when iterating.

---

## Working agreements

- The user is not deeply technical about tooling — explain tradeoffs plainly, give a clear
  recommendation, then let them decide. Don't bury them in options.
- They pushed back on three.js in favour of Unity and were **right to** — the limitation
  was the cloud sandbox, not Unity. Don't re-litigate a settled decision.
- Deliver verified work. Locally, that means actually compiling and running, not
  "this should work."

## Git

- Development branch: `claude/budget-constraint-o9j6ha`
- Push with `git push -u origin <branch>`; open PRs as drafts.
