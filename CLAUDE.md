# Working in this repo

Two unrelated projects share this repo:

- **`/` (root)** — GLITCHTOPIA, a 2D canvas game. See `README.md`.
- **`pipeline/` + `store/`** — a 3D character business: turn reference images into
  sellable game-ready character models, and a storefront to sell them from.

Most requests here are about the character business. What follows is for that.

---

# Making a character (read this before starting)

## The one thing that matters most

**The user does not know Blender and does not want to learn it.** They have said
so explicitly. This is not a soft preference to work around.

That means:

- **Never** tell them to open Blender, click something, or "just adjust the mesh".
- **Never** hand back a step that requires modelling knowledge to complete.
- Every Blender operation goes through the scripts in `pipeline/tools/`, run by
  you, headless. They never see the application.
- If something needs artistic judgement, **you** make the call, render it, look
  at the result, and iterate. Describe outcomes in plain terms ("the face came
  out soft, I re-ran it at higher detail"), not Blender vocabulary.

If a step genuinely cannot be automated, say so plainly and offer the nearest
automated alternative. Do not push the work back onto them.

## Characters or props — same pipeline

The tools work on anything, not just characters. The only difference is scale
and posing:

| | Characters | Props / items / weapons |
|---|---|---|
| `--height` | `1.8` (metres, humanoid) | real size of the object — a sword `1.1`, a crate `0.8`, a mug `0.12` |
| Pose | A-pose or T-pose, limbs away from the body | irrelevant, just show it clearly |
| `--faces` | `6000`+ | `2000`–`4000` is usually plenty |

Getting `--height` right matters more than it sounds. Everything exports at
1 unit = 1 metre, so a sword built at 1.8m arrives in the engine taller than the
player holding it. Ask the user roughly how big the real object is; do not guess.

## The workflow

### 0. Setup, once

```bash
python pipeline/setup.py
```

Cross-platform — works in PowerShell, Terminal, anything. It installs the
dependencies, creates the `work/` folders, and finishes by running `gpu_check.py`.

**On Windows the interpreter is usually `python`, not `python3`.** Commands in
this file are written as `python3`; substitute `python` if that is what the
machine has. `setup.py` prints the exact interpreter path to use at the end —
use that one consistently, because `bpy` is installed into that specific
interpreter and will not be visible from another.

(`pipeline/setup.sh` is the bash equivalent, for anyone who prefers it. It does
the same thing but will not run in PowerShell without Git Bash or WSL.)

Installs Pillow, rembg, and the `bpy` Blender module. Blender does not need to
be installed separately — `bpy` is Blender as a Python library. Verify with
`python3 -c "import bpy; print(bpy.app.version_string)"`.

### 1. Prepare the reference views

Reference art usually arrives as one composite sheet, and rarely matches the
spec a multi-view model wants. Start here:

```bash
python3 pipeline/tools/fix_views.py <their-sheet>.png -o work/prepped/
```

This splits the sheet, measures every panel (symmetry, crop damage, limb
separation, hair mass), and **chooses between multi-view and single-view
generation**. That choice is the important part: when the panels disagree —
different poses, missing back view, three-quarter angles — one clean view beats
four contradictory ones, because the model then invents the unseen sides
consistently instead of trying to satisfy inputs that cannot all be true.

**Check the panel count it reports on the first run.** Auto-detection is
best-effort; if the count is wrong, pass `--panels N`. Every measurement depends
on the panels being cut correctly.

Report its findings to the user in plain terms — "three of your four panels are
the same front angle and there's no back view, so I'm generating from the single
best one" — not as a table of numbers.

If the views are already clean and consistent, the older narrower tool still
works:

```bash
python3 pipeline/tools/prep_views.py <their-images-folder>/ -o work/prepped/
```

Cuts backgrounds, normalises every view to identical subject height, aligns them
vertically, squares the canvas.

**Read the warnings it prints and act on them.** They predict how the mesh will
fail. If it reports a large height mismatch or an over-wide side view, tell the
user what will suffer and ask whether they have a better shot — this is the one
point where their input genuinely helps, because only they can reshoot.

### 1b. Synthesise the missing views (when the sheet is incomplete)

If `fix_views.py` chose SINGLE-VIEW, the reference art was missing a real back
or front. The 3D model will invent those surfaces regardless — the only question
is whether it does so silently inside the mesh, or visibly in 2D where you can
check it first.

```bash
python3 pipeline/tools/synth_views.py work/prepped/front.png -o work/synth/
```

This runs a novel-view diffusion model to produce a complete front/back/left/
right set from the one good view, and writes a contact sheet.

**Look at the contact sheet and judge it.** That is the entire point of this
step. If the invented back contradicts the design, re-run with a different
`--seed`, or hand-edit that one image. It is far cheaper to reject a bad
invented view here than after it has become geometry.

Then generate from `work/synth/` instead of `work/prepped/`.

Two things to be honest with the user about:

- **It cannot re-pose the character.** Arms down against the body stay down in
  every synthesised view and will still fuse to the torso in the mesh. Only
  different source art fixes that. Do not imply otherwise.
- **The front stays real.** The tool keeps the user's actual view for the front
  and only invents the rest, so real pixels are never replaced by guesses.

If synthesis fails or runs out of VRAM, generating straight from the single view
still works — the 3D model then does the same invention internally.

### 2. Generate the mesh

The user has an **RTX 4060**, so this runs locally. Confirm the machine first:

```bash
python3 pipeline/tools/gpu_check.py
```

That reports GPU, VRAM, torch/CUDA and Blender, and prints the settings to use.
A 4060 is 8GB (16GB on the Ti), which is below what the full-size checkpoints
need — so use the mini/multi-view checkpoint with offloading, which is what
`generate_local.py` selects automatically.

```bash
python3 pipeline/tools/generate_local.py work/prepped/ -o work/generated.glb
```

**This script has never been run on real hardware.** The image-to-3D projects
change their entry points between releases, so expect the first run to need
fixing. When it breaks, the fault is almost certainly in `CHECKPOINTS` or
`load_pipeline` — check the project's current README and correct it. Everything
downstream is independent of that file, so a failure there blocks nothing else.

If it runs out of VRAM the error names the knob to turn. Escalate in that order,
and fall back to `pipeline/generate_colab.ipynb` on Colab's free T4 only if the
local route genuinely cannot be made to work.

Always prefer a **multi-view** checkpoint. They shot four views; a single-view
model throws three of them away.

### 3. Finish it — fully automatic

```bash
python3 pipeline/tools/auto_finish.py \
    --input work/generated.glb \
    --output-dir work/finished/ \
    --faces 6000 --texture-size 2048 --height 1.8 --lods 2
```

Retopologises to clean quads, UV unwraps, bakes normal/colour/AO from the dense
mesh onto the clean one, de-lights the colour, normalises scale and origin,
exports GLB + FBX + LODs.

This replaces every manual Blender step. Do not substitute manual instructions
for it.

### 4. Look at the result — do not skip this

```bash
python3 pipeline/tools/render_check.py --input work/finished/<name>.glb -o work/qa/
```

Then **actually read the contact sheet image**. Numbers do not tell you whether a
model looks right. Judge it:

| What you see | What to do |
|---|---|
| Melted or fused face | Input views were inconsistent — back to step 1 |
| Soft, detail-free surface | Re-run `auto_finish` with higher `--faces` and `--texture-size` |
| Faceted, blocky silhouette | Raise `--faces` |
| Colour looks flat or washed out | Check the base map baked correctly; inspect `<name>_base.png` |
| Limbs fused to the body | Source pose problem — the character needs arms away from the torso |
| Looks good | Move to step 5 |

Iterate here. Re-running is cheap; a refunded sale is not.

### 5. List it

```bash
python3 store/tools/watermark.py work/renders/ store/assets/characters/<id>/
python3 store/tools/make_preview.py -- --input work/finished/<name>.glb \
    --output store/assets/characters/<id>/preview.glb --tris 8000
```

Then add the entry to `store/js/data.js`. See `store/README.md`.

---

## Hard rules

**Master files never enter this repo.** A static site serves every file it
contains, linked or not. Keep masters in `work/` (gitignored) and upload them to
the checkout platform. Only watermarked renders and the degraded preview GLB are
committed.

**Never commit anything from `work/`.** It is gitignored; keep it that way.

**Watermark before committing renders.** `store/tools/watermark.py` burns it into
the pixels. The CSS overlay on the site is decoration and protects nothing.

**Be honest about quality.** Automatic 2D→3D produces good geometry and soft
textures. If a result is not good enough to sell, say so directly rather than
shipping it with a caveat. The user is putting their name on these.

**The GPU is used automatically.** `auto_finish.py` and `render_check.py` select
OptiX on an RTX card and fall back to CPU on their own. Nothing to configure.

**Check the model licence before anything gets sold.** Free tiers of commercial
generators often grant commercial rights only on paid plans. `pipeline/README.md`
covers what to look for.

## Costs

Everything here is free and must stay that way — the user has been explicit.
Blender, Python, Colab's free tier, GitHub Pages: no subscriptions. Do not
propose a paid tool without flagging the cost and asking first.
