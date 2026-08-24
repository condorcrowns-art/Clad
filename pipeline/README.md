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

So the working split is: **the model does the sculpting, you do the finishing.**
The scripts here automate every mechanical step so your hand-time goes only
where judgement is actually required. Expect roughly 30 minutes to a few hours
per character depending on your quality bar. Anyone selling character assets is
doing this — it isn't a limitation of the free tools specifically.

If you want the single highest-leverage manual step: **retopologise and bake a
normal map.** Crisp silhouette plus baked high-frequency detail is most of what
"holds up when you zoom in" actually means.

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
pip install Pillow rembg onnxruntime
python3 pipeline/tools/prep_views.py refs/ -o prepped/
```

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
Fastest and unlimited if you have ~12GB+ VRAM. Follow the model repo's own
install instructions; the notebook's cells show the shape of it.

> The notebook targets Hunyuan3D's multi-view checkpoint, which conditions on
> several views at once — the whole reason you shot four. A single-view model
> would discard three of your references.

## Step 3 — Finish the mesh

```bash
pip install bpy      # or use a normal Blender install
python3 pipeline/tools/finish_mesh.py \
    --input generated.glb \
    --output-dir finished/ \
    --height 1.8 \
    --lods 2
```

Fixes everything mechanical: joins the separate chunks generators emit, welds
duplicate vertices, deletes loose and degenerate geometry, recalculates normals
outward, scales to a real-world height, drops the feet to Z=0, centres on the
origin, applies angle-based smoothing, builds LODs, and exports GLB + FBX with
textures packed in.

With Blender installed instead of the `bpy` module:

```bash
blender -b -P pipeline/tools/finish_mesh.py -- --input generated.glb --output-dir finished/
```

## Step 4 — The hand-finishing

The part no script does for you, roughly in order of impact:

1. **Retopologise.** Blender's QuadriFlow (free, built in) gets you most of the
   way; Quad Remesher is better if you ever want to spend money.
2. **Bake a normal map** from the dense generated mesh onto the clean one. This
   is what makes close-up detail survive.
3. **Split fused geometry** — hair from head, weapon from hand, fingers apart.
4. **UV unwrap** the retopologised mesh properly.
5. **Fix the textures.** De-light the base colour, repaint the mushy areas.
   Faces and hands first — that's where buyers zoom.
6. **Rig.** Mixamo or AccuRig, both free, both humanoid.

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
| `tools/finish_mesh.py` | Yes — verified against a deliberately broken mesh; output re-imported and checked |
| `generate_colab.ipynb` | **No** — needs a GPU. Valid notebook JSON, but run it once before relying on it |
