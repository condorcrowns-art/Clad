# 2D references → sellable 3D character

Turning your front/back/side images into a mesh a buyer can zoom into and inspect.
Everything here is free.

---

## The honest version first

**Automatic 2D→3D will not, on its own, produce a mesh that survives being zoomed into.**

What the free models genuinely do well now is *geometry* — feed them four clean
orthographic views and the silhouette, proportions, and volumes come back
broadly right. That used to be the hard part and it mostly isn't any more.

What they do badly is everything a buyer notices at close range:

| Problem | Why it kills a listing |
|---|---|
| Mushy textures | Generated texture is soft and low-frequency. Zoomed to the face it reads as smeared, not detailed. |
| Triangle-soup topology | No edge loops. Looks fine static, deforms horribly when animated. |
| Fused geometry | Hair welded to the skull, fingers merged, weapon merged into the hand. |
| Baked-in lighting | Shading painted into the base colour, so it fights the engine's lighting. |
| Invented surfaces | Anything your four views didn't show is guesswork, and it's always the first thing to fall apart. |

The single highest-leverage fix is to **retopologise and bake a normal map** —
crisp silhouette plus baked high-frequency detail is most of what "holds up when
you zoom in" actually means. That step, plus de-lighting the texture and
generating clean UVs, is exactly what `auto_finish.py` does for you. It is fully
automatic and needs no Blender knowledge.

What stays manual is genuine art direction: splitting fused geometry, and
repainting a face the generator got wrong. Those need judgement, not a script.
So the realistic picture is: the pipeline gets you a clean, properly baked,
correctly scaled asset in minutes, and your remaining time goes on the handful
of things only a person can decide.

---

## Before anything else: the licence

You are selling the output. That makes the model's licence the first thing to
check, not the last.

- **Free tiers of commercial services** (Meshy, Tripo, Rodin) frequently grant
  commercial rights only on *paid* plans. Generating on a free tier and selling
  the result can breach their terms.
- **Open-source models** are usually the safer route for commercial work, but
  "open source" is not automatically "sell whatever you like". Some carry
  field-of-use restrictions, territory restrictions, or user-count thresholds.

Read the `LICENSE` file in whichever repo you use, and look specifically for:
commercial use, redistribution of outputs, territory limits, and monthly-active-user
caps. Terms change between releases — check the version you actually run.

Separately: because you own the rights to your source images, the input side is
clean. That genuinely matters and it's the part most people get wrong.

---

## Step 1 — Prepare your views

The single biggest quality lever, and the one people skip.

Multi-view models are far more sensitive to framing than you'd expect. If your
character is a different height in the front shot than the side shot, the model
reconciles the difference by *inventing* geometry — that is where melted faces
and lopsided shoulders come from.

```bash
python pipeline/setup.py                       # once — installs everything
python3 pipeline/tools/prep_views.py refs/ -o prepped/
```

> **Windows:** use `python` rather than `python3` throughout. `setup.py` prints
> the exact interpreter to use — stick to it, since `bpy` installs into that
> specific interpreter. `setup.sh` is the bash equivalent and needs Git Bash or
> WSL; `setup.py` needs neither.

This cuts the backgrounds out, rescales every view so the character is exactly
the same height in each, aligns them vertically, pads to a square canvas, and
**warns you about inconsistent inputs before you spend GPU time**.

Files are matched by name — anything containing `front`, `back`, `left`,
`right`, or `side` gets picked up. Or name them explicitly with `--front` etc.

**What makes a good source image:**

- Orthographic-*style* framing — stand back and zoom in rather than getting close.
  A wide-angle lens close to the subject distorts proportions and the model
  faithfully reproduces the distortion.
- Same camera distance and height for every view.
- A-pose or T-pose. Arms away from the torso so they don't fuse.
- Flat, even lighting. Hard shadows get baked into the texture permanently.
- Identical pose across all four views. Rescaling fixes framing mismatches;
  nothing fixes a pose that changed between shots.

You said your references have no close-ups. That's fine for geometry. It does
mean facial and hand detail will be weak — those are exactly the areas to plan
on hand-finishing.

## Step 1a — Separate the arms

If `fix_views.py` reports `limbs` below 3, the arms touch the torso and will fuse
into a single mass in the mesh.

```bash
python pipeline/tools/repose_arms.py work/prepped/front.png -o work/posed/front.png
```

Finds each arm's boundary — by colour where arm and clothing differ, geometrically
where they don't — cuts it out, swings it outward about the shoulder, and expands
the canvas so nothing clips.

Re-run `fix_views.py` on the output to confirm: `limbs` should read 3. Raise
`--angle` if it doesn't.

## Step 1b — Synthesise what the art never had

When the sheet has no back view, the 3D generator invents one anyway — silently,
inside the mesh, where you cannot inspect or reject it. This moves that guess
into 2D first:

```bash
python pipeline/tools/synth_views.py work/prepped/front.png -o work/synth/
```

A novel-view diffusion model takes your one good view and produces a complete,
mutually consistent front/back/left/right set, plus a contact sheet. Your real
view is kept as the front; only the missing angles are invented.

The value is inspectability: you can look at the invented back, re-roll it with
a different `--seed`, or hand-edit it — all before any geometry exists.

**Run step 1a first if the arms need separating.** Synthesis reproduces whatever
pose it is given from every new angle — it rotates the camera, not the character.

## Step 2 — Generate the mesh

Three free routes, easiest first:

### A. Browser, no install
Run a hosted demo on Hugging Face Spaces. Search for the model (Hunyuan3D and
TRELLIS both have public Spaces), upload your prepped views, download the mesh.
Zero setup. Free Spaces are queued and rate-limited, so it's best for trying a
few characters rather than batch work.

### B. Colab, free GPU
`pipeline/generate_colab.ipynb` — open in Colab, set **Runtime → T4 GPU**, upload
your prepped views, run the cells. Best free option if you don't have an Nvidia card.

### C. Local, your own GPU
Fastest and unlimited. Check what you have first:

```bash
python3 pipeline/tools/gpu_check.py          # reports GPU, VRAM, torch, Blender
python3 pipeline/tools/generate_local.py work/prepped/ -o work/generated.glb
```

`generate_local.py` picks the checkpoint from your actual VRAM and enables fp16,
CPU offload and attention slicing on cards under 12GB — which is what makes an
8GB card (RTX 4060, 3070, 2080) viable. On out-of-memory it tells you which knob
to turn instead of just failing.

Note this script has not been run on real hardware yet; the generator projects
move fast, so expect the first run to need a fix in `CHECKPOINTS` or
`load_pipeline`. Nothing downstream depends on it.

> The notebook targets Hunyuan3D's multi-view checkpoint, which conditions on
> several views at once — the whole reason you shot four. A single-view model
> would discard three of your references.

> **GPU acceleration is automatic.** `auto_finish.py` and `render_check.py` pick
> OptiX on an Nvidia RTX card, then CUDA, then fall back to CPU. Baking and QA
> renders are substantially faster on a GPU; nothing needs configuring.

## Works for props too, not just characters

Nothing here is character-specific except the defaults. For a weapon, a crate,
a piece of furniture — same commands, two changes:

- set `--height` to the object's **real size in metres** (a sword `1.1`, a crate
  `0.8`, a mug `0.12`). Everything exports at 1 unit = 1 metre, so getting this
  wrong is what produces a sword taller than the character holding it.
- ignore the A-pose advice; just shoot the object clearly from four sides.

`--faces 2000` to `4000` is usually plenty for a prop.

## Step 3 — Finish the mesh (fully automatic)

**If you don't know Blender, this is the step that used to stop you. It doesn't
any more.** Everything below runs headless — you never open the application.

```bash
python3 pipeline/tools/auto_finish.py \
    --input generated.glb --output-dir finished/ \
    --faces 6000 --texture-size 2048 --lods 2
```

Retopologises to clean quads with QuadriFlow, UV unwraps, bakes the dense mesh's
detail down as a **normal map** (this is what makes a low-poly model hold up when
someone zooms in), bakes a **de-lit base colour** with the lighting passes
disabled, bakes AO, wires them into a PBR material, normalises scale and origin,
and exports GLB + FBX + LODs.

The two dials that matter:

| Flag | Raise it when |
|---|---|
| `--faces` | silhouette looks faceted or blocky |
| `--texture-size` | surface detail looks soft up close |

## Step 4 — Look at it

```bash
python3 pipeline/tools/render_check.py --input finished/char.glb -o qa/
```

Renders a turntable plus a close-up and combines them into one contact sheet.
Triangle counts tell you nothing about whether a model *looks* right — this does.
Claude Code can read the contact sheet directly and judge it.

## Manual finishing (only if you want to)

Everything above is automatic. If you do know Blender and want to push quality
further, this is where hand-work pays off, in order of impact:

1. **Split fused geometry** — hair from head, weapon from hand, fingers apart.
   Needs judgement; no script does this reliably.
2. **Hand-place UV seams** instead of Smart Project, for a tighter texel budget.
3. **Repaint weak texture areas.** Faces and hands first — that's where buyers zoom.
4. **Rig.** Mixamo or AccuRig, both free, both humanoid.

`finish_mesh.py` is also still there. It does the mechanical cleanup *without*
retopology or baking — useful when your source mesh is already clean and you only
need scale, origin, smoothing and export sorted.

## Step 5 — List it

Renders through `store/tools/watermark.py`, preview mesh through
`store/tools/make_preview.py`, entry into `store/js/data.js`. See `store/README.md`.

---

## Targets for a sellable character

Rough numbers buyers expect. Not rules, but you'll get refund requests outside them.

| | Stylised | Realistic |
|---|---|---|
| Triangles (LOD0) | 8k–25k | 30k–80k |
| Texture resolution | 2K | 4K |
| Texture maps | BaseColor, Normal, ORM | + AO, sometimes height |
| Scale | 1 unit = 1 metre | same |
| Pose | A-pose or T-pose | same |
| Formats | FBX + GLB minimum | + source file |

---

## Tool status

| Tool | Tested |
|---|---|
| `tools/prep_views.py` | Yes — both matte paths, normalisation verified exact, warnings confirmed firing |
| `tools/auto_finish.py` | Yes — full run on a 63k-tri textured mesh: retopo to 6.2k quads, UVs, normal/colour/AO bakes all verified as carrying real data |
| `tools/render_check.py` | Yes — renders inspected visually; exposure and framing corrected as a result |
| `tools/finish_mesh.py` | Yes — verified against a deliberately broken mesh; output re-imported and checked |
| `../store/tools/watermark.py` | Yes — tiling, rotation and coverage checked on a 2200×2750 source |
| `../store/tools/make_preview.py` | Yes — verified rig, weights, shape keys, animation and extra texture maps are all stripped |
| `tools/gpu_check.py` | Yes — correct detection and recommendation on a machine with no GPU |
| `tools/blender_util.py` | Yes — backend probing and CPU fallback verified |
| `generate_colab.ipynb` | **No** — needs a GPU. Valid notebook JSON, but run it once before relying on it |
| `tools/generate_local.py` | **No** — needs a GPU. Handles the no-GPU path correctly; the generation call itself is unverified |

Blender scripts were tested against the `bpy` module (Blender 5.x) and include
compatibility branches for the Blender 4.x API where it differs.
