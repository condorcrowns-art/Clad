#!/usr/bin/env python3
"""
Invent the views your reference art never had.

When a sheet has no back view and no straight-on front, the 3D generator has to
guess those surfaces anyway -- it just does it silently, inside the mesh, where
you cannot inspect or reject the guess. This tool moves that guess forward into
2D, where you can look at it.

It takes the best real view you have and runs a novel-view diffusion model to
synthesise the missing canonical angles, producing a complete, mutually
consistent front/back/left/right set. Then it writes a contact sheet so you can
see the invented back before spending GPU time turning it into geometry.

    python pipeline/tools/synth_views.py work/prepped/front.png -o work/synth/

Why this beats feeding one view straight to the 3D model:

  * you can look at the invented sides and re-roll a bad one cheaply
  * you can hand-correct a synthesised view before it becomes geometry
  * multi-view-conditioned 3D checkpoints get the complete set they want

WHAT IT CANNOT DO: change the pose. If the arms are down against the body in
your source art, they are down in every synthesised view too, and they will
still fuse to the torso in the mesh. Novel-view synthesis rotates the camera,
it does not re-pose the character. Only different source art fixes that.

--------------------------------------------------------------------------
NOT YET RUN ON REAL HARDWARE. Model entry points move between releases. If the
import or call signature is wrong for the version you install, the fix is local
to BACKENDS and `load_backend` below -- check the project's current README. The
rest of the pipeline does not depend on this file.
--------------------------------------------------------------------------
"""

import argparse
import os
import sys

# Novel-view models, smallest first. Zero123++ is the safe default on 8GB:
# roughly 1.5GB in fp16, and it emits a fixed, mutually consistent 6-view grid.
BACKENDS = {
    "zero123plus": {
        "repo": "sudo-ai/zero123plus-v1.2",
        "vram_gb": 6,
        "note": "6 fixed views in one grid, strong cross-view consistency",
    },
    "sv3d": {
        "repo": "stabilityai/sv3d",
        "vram_gb": 12,
        "note": "orbital sequence, higher fidelity, heavier",
    },
}

# Zero123++ v1.2 emits six views at these camera angles, in grid order.
# Azimuth is degrees clockwise from the input view; elevation is degrees up.
ZERO123PLUS_ANGLES = [
    (30, 20), (90, -10), (150, 20),
    (210, -10), (270, 20), (330, -10),
]

# Which synthesised angle stands in for each canonical view we want.
CANONICAL = {"front": 0, "right": 90, "back": 180, "left": 270}


def vram_gb():
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        return torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    except Exception:
        return None


def pick_backend(available_gb, override=None):
    if override:
        if override not in BACKENDS:
            sys.exit(f"unknown backend {override!r}; choose from {list(BACKENDS)}")
        return override
    if available_gb is None:
        sys.exit("No CUDA GPU visible. Novel-view synthesis needs one.\n"
                 "Run: python pipeline/tools/gpu_check.py")
    # Largest backend that fits, since bigger means better fidelity. If none
    # fits, take the smallest and let it try with offloading rather than
    # refusing outright.
    fits = [n for n, spec in BACKENDS.items() if available_gb >= spec["vram_gb"]]
    if fits:
        return max(fits, key=lambda n: BACKENDS[n]["vram_gb"])
    return min(BACKENDS, key=lambda n: BACKENDS[n]["vram_gb"])


def load_backend(name, low_vram):
    """Return a callable: image -> list of (azimuth, elevation, PIL image)."""
    spec = BACKENDS[name]

    if name == "zero123plus":
        try:
            import torch
            from diffusers import DiffusionPipeline
        except ImportError:
            sys.exit("diffusers and torch are required:\n"
                     "  pip install diffusers transformers accelerate")

        pipe = DiffusionPipeline.from_pretrained(
            spec["repo"], custom_pipeline="sudo-ai/zero123plus-pipeline",
            torch_dtype=torch.float16)

        if low_vram and hasattr(pipe, "enable_model_cpu_offload"):
            pipe.enable_model_cpu_offload()
            print("  enabled model cpu offload")
        else:
            pipe.to("cuda")
        if hasattr(pipe, "enable_attention_slicing"):
            pipe.enable_attention_slicing()

        def run(image, steps, seed):
            import torch
            gen = torch.Generator("cuda").manual_seed(seed) if seed is not None else None
            grid = pipe(image, num_inference_steps=steps, generator=gen).images[0]
            return split_grid(grid, ZERO123PLUS_ANGLES)

        return run

    sys.exit(f"backend {name!r} has no loader yet — add one in load_backend()")


def split_grid(grid, angles, cols=2):
    """Zero123++ returns one image containing a 3x2 grid of views."""
    rows = len(angles) // cols
    w, h = grid.width // cols, grid.height // rows
    out = []
    for i, (az, el) in enumerate(angles):
        r, c = divmod(i, cols)
        tile = grid.crop((c * w, r * h, (c + 1) * w, (r + 1) * h))
        out.append((az, el, tile))
    return out


def nearest_view(views, target_azimuth):
    """Pick the synthesised view closest to a canonical angle."""
    def distance(v):
        d = abs((v[0] - target_azimuth) % 360)
        return min(d, 360 - d)
    return min(views, key=distance)


def contact_sheet(entries, path, size=384):
    from PIL import Image, ImageDraw
    if not entries:
        return None
    sheet = Image.new("RGB", (size * len(entries), size + 26), (18, 18, 22))
    draw = ImageDraw.Draw(sheet)
    for i, (label, img) in enumerate(entries):
        sheet.paste(img.convert("RGB").resize((size, size), Image.LANCZOS), (i * size, 26))
        draw.text((i * size + 8, 7), label, fill=(230, 230, 235))
    sheet.save(path)
    return path


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image", help="the best real view (from fix_views.py)")
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--backend", default=None, choices=list(BACKENDS))
    ap.add_argument("--steps", type=int, default=36)
    ap.add_argument("--seed", type=int, default=None,
                    help="fix the seed to make a result reproducible")
    ap.add_argument("--keep-all", action="store_true",
                    help="also write every raw synthesised view, not just the four")
    args = ap.parse_args()

    from PIL import Image

    if not os.path.isfile(args.image):
        sys.exit(f"input image not found: {args.image}")

    print("\n[synth-views]")
    gb = vram_gb()
    backend = pick_backend(gb, args.backend)
    spec = BACKENDS[backend]
    print(f"  gpu        {gb:.1f}GB" if gb else "  gpu        none")
    print(f"  backend    {backend} — {spec['note']}")
    if gb and gb < spec["vram_gb"]:
        print(f"  ! {backend} wants ~{spec['vram_gb']}GB and you have {gb:.1f}GB; "
              "offloading is on but it may still run out")

    source = Image.open(args.image).convert("RGBA")
    print(f"  source     {args.image} ({source.width}x{source.height})")

    run = load_backend(backend, low_vram=(gb is not None and gb < 12))

    try:
        views = run(source, args.steps, args.seed)
    except RuntimeError as exc:
        if "out of memory" not in str(exc).lower():
            raise
        sys.exit("\nOut of VRAM during synthesis.\n\n"
                 "Try, in order:\n"
                 "  1. close other GPU applications (browsers count)\n"
                 f"  2. --steps {max(12, args.steps - 12)}\n"
                 "  3. run the single best real view straight into "
                 "generate_local.py and skip synthesis\n")

    out = os.path.abspath(args.output)
    os.makedirs(out, exist_ok=True)

    # Keep the real pixels for the view we actually have. The model's fixed
    # angles rarely include a true 0 degrees, so a synthesised "front" would be
    # a three-quarter approximation of a view we already hold exactly.
    entries = []
    front_path = os.path.join(out, "front.png")
    source.save(front_path)
    entries.append(("front (real)", source))
    print(f"  front  <- your real source view (kept, not synthesised) "
          f"-> {front_path}")

    poor = []
    for name, azimuth in CANONICAL.items():
        if name == "front":
            continue
        az, el, img = nearest_view(views, azimuth)
        offset = min(abs(az - azimuth) % 360, 360 - abs(az - azimuth) % 360)
        path = os.path.join(out, f"{name}.png")
        img.save(path)
        entries.append((f"{name} ({az}deg)", img))
        flag = "  <-- approximate" if offset > 25 else ""
        print(f"  {name:<6} <- synthesised at azimuth {az}, elevation {el} "
              f"(off by {offset} deg){flag}  -> {path}")
        if offset > 25:
            poor.append((name, offset))

    if args.keep_all:
        raw = os.path.join(out, "raw")
        os.makedirs(raw, exist_ok=True)
        for az, el, img in views:
            img.save(os.path.join(raw, f"az{az:03d}_el{el:+03d}.png"))
        print(f"  all {len(views)} raw views -> {raw}")

    sheet = contact_sheet(entries, os.path.join(out, "synthesised.png"))
    if sheet:
        print(f"\n  contact sheet: {sheet}")
        print("  LOOK AT IT before generating. Everything except the front is")
        print("  invented — if a view contradicts the design, re-run with a")
        print("  different --seed, or hand-edit the offending image.")

    if poor:
        names = ", ".join(f"{n} (off by {o} deg)" for n, o in poor)
        print(f"\n  ! this backend has no view near {names}. The nearest was used,")
        print("    so those angles are approximate rather than exact.")

    print("\n  ! synthesis rotates the camera; it does not re-pose the character.")
    print("    Whatever the arms are doing in your source art, they do in every")
    print("    view here, and they will do in the mesh.")

    print(f"\n  next: python pipeline/tools/generate_local.py {out} "
          f"-o work/generated.glb\n")


if __name__ == "__main__":
    main()
