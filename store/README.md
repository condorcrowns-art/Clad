# Character store

A zero-dependency, zero-cost storefront for selling 3D character models.
Static HTML/CSS/JS — no backend, no database, no server to pay for or patch.

- **Hosting** — GitHub Pages (free)
- **Checkout** — a per-character link out to itch.io / Ko-fi / Payhip / Gumroad
- **Tooling** — Blender, Python + Pillow (both free)

The only running cost is the payment processor's per-sale cut when you actually
make a sale. There is no monthly fee anywhere in this stack.

---

## How the protection actually works

This is the part worth understanding before you list anything.

**A file on a static site is public.** It doesn't matter whether you link to it,
hide it behind a click, or disable right-click — if the browser can fetch it, so
can anyone. So the rule is absolute:

> The master mesh and the full-resolution textures never enter this repo.

`store/.gitignore` blocks the common master formats to make that hard to get
wrong by accident, but the discipline matters more than the file. Keep masters
in a folder outside the repo and upload them to your checkout platform, which
handles delivery to buyers after payment.

What the site *does* show is deliberately degraded:

| Layer | Protection |
|---|---|
| Render images | Watermark **burned into the pixels** by `tools/watermark.py`, downscaled to 1600px |
| 3D preview mesh | Decimated to ~8k tris, rig stripped, textures reduced to 512px with watermark stripes, no normal/roughness maps — by `tools/make_preview.py` |
| CSS overlay + drag guard | Visible deterrent only. Trivially bypassed. Never rely on it. |

The burned-in watermark and the degraded preview mesh are the real protection.
Everything else is a speed bump.

---

## Adding a character

1. **Prepare the master** in Blender — retopologised, UV'd, rigged, textured.
   Keep it outside this repo.

2. **Render your previews.** Turntables, beauty shots, wireframe views, and a
   T-pose/A-pose shot. Save them somewhere outside the repo, e.g. `raw_renders/`.

3. **Burn the watermark in:**

   ```bash
   pip install Pillow
   python3 store/tools/watermark.py raw_renders/ store/assets/characters/my-char/
   ```

4. **Build the safe 3D preview:**

   ```bash
   blender -b -P store/tools/make_preview.py -- \
     --input ~/masters/my-char.blend \
     --output store/assets/characters/my-char/preview.glb \
     --tris 8000
   ```

5. **Upload the real deliverable** (the zip with FBX/GLB/textures/licence) to
   itch.io, Ko-fi, or Payhip. Copy the product URL.

6. **Add the entry** to `store/js/data.js`:

   ```js
   {
     id: "my-char",
     name: "My Character",
     tagline: "One line that sells it.",
     category: "sci-fi",
     style: "stylized",
     price: 29,
     buyUrl: "https://yourname.itch.io/my-char",
     status: "available",
     thumb: "assets/characters/my-char/render-01.webp",
     gallery: [
       "assets/characters/my-char/render-01.webp",
       "assets/characters/my-char/render-02.webp"
     ],
     preview3d: "assets/characters/my-char/preview.glb",
     specs: { tris: 24800, rigged: true, textures: "4K PBR", pose: "A-pose" },
     formats: ["FBX", "GLB", "OBJ", "BLEND"],
     includes: ["Rigged mesh", "4K PBR textures", "Commercial licence"],
     tags: ["humanoid", "rigged"]
   }
   ```

7. **Commit and push.** GitHub Pages redeploys automatically.

Delete the `example-ronin` entry once you have a real one — it exists only so the
layout is visible on a fresh checkout.

---

## Fields reference

| Field | Notes |
|---|---|
| `id` | URL slug. Must be unique — it's what `character.html?id=` looks up. |
| `price` | Number renders as currency. `0` renders as **Free**. `null` renders as **Enquire**. |
| `buyUrl` | Empty string falls back to an email enquiry button. |
| `status` | `available` · `coming-soon` · `sold-exclusive` |
| `thumb` | Grid image. Falls back to a placeholder tile if empty. |
| `gallery` | Array of watermarked render paths shown in the detail stage. |
| `turntable` | Optional looping `.mp4`/`.webm`. |
| `preview3d` | Degraded GLB. Omit it and the stage just shows renders. |
| `specs` | Any of `tris`, `verts`, `rigged`, `skeleton`, `textures`, `uvs`, `scale`, `pose`, `lods`. Missing keys are skipped. |

Store-wide settings — name, tagline, contact email, watermark text, currency —
live in the `SITE` object at the top of the same file.

---

## Running it locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/store/
```

Any static server works. Opening `index.html` straight off disk mostly works too,
but the GLB viewer needs a real HTTP origin.

---

## Deploying free on GitHub Pages

1. Repo **Settings → Pages**
2. **Source**: Deploy from a branch
3. Pick your branch, folder `/ (root)`
4. Site goes live at `https://<user>.github.io/<repo>/store/`

To serve it at the domain root instead, move the contents of `store/` up a level
or point Pages at a `gh-pages` branch containing only these files. A custom
domain is free to attach (you only pay your registrar for the domain itself).

---

## Choosing a checkout platform

All free to start, no monthly fee:

| Platform | Cut | Notes |
|---|---|---|
| **itch.io** | You choose (0–100%) | Built for game assets; the audience is already there |
| **Ko-fi** | 0% platform fee | You still pay the payment processor |
| **Payhip** | 5% on the free plan | Handles EU VAT for you |
| **Gumroad** | ~10% | No monthly fee, very simple |

Rates and terms change — check the current numbers before committing. All of them
handle payment, delivery, and licence keys, which is exactly the part you don't
want to build or secure yourself.

---

## The external dependency

`<model-viewer>` loads from a CDN, and only on pages where a character actually
has a `preview3d` file. If it fails to load, the stage falls back to the render
gallery. Everything else on the site is dependency-free.

To go fully self-hosted, download `model-viewer.min.js`, drop it in `js/`, and
change `MODEL_VIEWER_SRC` at the top of `js/character.js`.
