#!/usr/bin/env python3
"""
Take any reference sheet and produce the best generatable input from it.

Reference art is rarely built to the spec a multi-view 3D model wants. Panels
get drawn in different poses, at different crops, from three-quarter angles,
with no back view. Feeding that in unchanged produces a melted mesh, because the
model resolves the contradictions between views by inventing geometry.

This tool measures what you actually have and picks a strategy accordingly:

  * splits the sheet into panels
  * measures each one: symmetry, aspect, crop damage, limb separation, hair mass
  * classifies it as frontal / three-quarter / profile
  * decides between MULTI-VIEW and SINGLE-VIEW generation
  * writes a prepared set either way, plus a plain-language report

The decision is the point. When the views disagree, one clean view beats four
contradictory ones -- the model then invents the unseen sides *consistently*
instead of trying to satisfy inputs that cannot all be true at once.

    python pipeline/tools/fix_views.py sheet.png -o work/prepped/

Also accepts a folder of separate images instead of a sheet.

Panel auto-detection is best-effort. It reports how many panels it found -- if
that number is wrong, pass --panels N and it splits into N equal columns
instead, which is reliable for any evenly laid-out sheet. Always check the
count on the first run of a new sheet: every measurement below it depends on
the panels being cut correctly.
"""

import argparse
import pathlib
import sys

try:
    from PIL import Image, ImageChops, ImageOps
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")


# ---------------------------------------------------------------------------
# masking
# ---------------------------------------------------------------------------

def corner_colour(img):
    w, h = img.size
    patch = max(2, min(w, h) // 100)
    samples = []
    for (x0, y0) in [(0, 0), (w - patch, 0), (0, h - patch), (w - patch, h - patch)]:
        region = img.crop((x0, y0, x0 + patch, y0 + patch)).convert("RGB")
        samples.append(region.resize((1, 1), Image.LANCZOS).getpixel((0, 0)))
    return tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))


def silhouette(img, tolerance=30, use_rembg=True):
    """Binary mask of the subject. Prefers rembg; falls back to colour keying."""
    if img.mode == "RGBA" and img.getextrema()[3][0] < 250:
        return img.getchannel("A").point(lambda v: 255 if v > 40 else 0)

    if use_rembg:
        try:
            from rembg import remove
            cut = remove(img.convert("RGBA"))
            return cut.getchannel("A").point(lambda v: 255 if v > 40 else 0)
        except Exception:
            pass  # fall through to keying

    rgb = img.convert("RGB")
    bg = corner_colour(rgb)
    r, g, b = rgb.split()
    dist = ImageChops.add(
        ImageChops.add(
            ImageChops.difference(r, Image.new("L", rgb.size, bg[0])),
            ImageChops.difference(g, Image.new("L", rgb.size, bg[1])),
        ),
        ImageChops.difference(b, Image.new("L", rgb.size, bg[2])),
    )
    return dist.point(lambda v: 0 if v < tolerance * 3 else 255)


# ---------------------------------------------------------------------------
# measurements
# ---------------------------------------------------------------------------

def row_runs(mask, y, min_run):
    """Count distinct foreground runs across row y. Arms clear of the torso
    show up as three runs (arm, body, arm); arms pinned to the body show one."""
    w = mask.width
    runs, run = 0, 0
    for x in range(w):
        if mask.getpixel((x, y)):
            run += 1
        else:
            if run >= min_run:
                runs += 1
            run = 0
    if run >= min_run:
        runs += 1
    return runs


def symmetry_score(mask):
    """IoU between the mask and its mirror, centred on the subject.

    A straight-on front or back view scores high. A profile or three-quarter
    view scores low, because a body is not symmetric about its own centreline
    when seen from an angle.
    """
    box = mask.getbbox()
    if not box:
        return 0.0
    sub = mask.crop(box)
    flipped = ImageOps.mirror(sub)

    inter = ImageChops.multiply(sub, flipped)
    union = ImageChops.lighter(sub, flipped)
    i = sum(inter.histogram()[1:])
    u = sum(union.histogram()[1:])
    return (i / u) if u else 0.0


def width_profile(mask, bands=12):
    """Subject width per horizontal band, normalised to the widest band."""
    box = mask.getbbox()
    if not box:
        return []
    x0, y0, x1, y1 = box
    h = y1 - y0
    widths = []
    for i in range(bands):
        ya = y0 + int(h * i / bands)
        yb = y0 + int(h * (i + 1) / bands)
        widest = 0
        for y in range(ya, max(ya + 1, yb), max(1, (yb - ya) // 6)):
            xs = [x for x in range(x0, x1) if mask.getpixel((x, y))]
            if xs:
                widest = max(widest, xs[-1] - xs[0])
        widths.append(widest)
    peak = max(widths) or 1
    return [w / peak for w in widths]


def measure(img, name, use_rembg=True):
    mask = silhouette(img, use_rembg=use_rembg)
    box = mask.getbbox()
    if not box:
        return {"name": name, "empty": True}

    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    area = sum(mask.histogram()[1:])

    # Cropping: subject pixels touching an edge means the figure runs off it.
    def edge_fill(coords):
        hits = sum(1 for c in coords if mask.getpixel(c))
        return hits / max(1, len(coords))

    step = max(1, mask.width // 200)
    bottom = edge_fill([(x, mask.height - 1) for x in range(0, mask.width, step)])
    top = edge_fill([(x, 0) for x in range(0, mask.width, step)])

    # Limb separation, sampled across the upper body where arms hang.
    min_run = max(2, bw // 40)
    runs = 0
    for frac in (0.34, 0.40, 0.46, 0.52):
        runs = max(runs, row_runs(mask, min(mask.height - 1, y0 + int(bh * frac)), min_run))

    prof = width_profile(mask)
    # Hair mass: how wide the top third is relative to the middle of the body.
    upper = max(prof[:4]) if len(prof) >= 4 else 0
    mid = max(prof[4:8]) if len(prof) >= 8 else 1
    hair_ratio = (upper / mid) if mid else 0

    return {
        "name": name,
        "empty": False,
        "mask": mask,
        "box": box,
        "aspect": bw / bh if bh else 0,
        "symmetry": symmetry_score(mask),
        "fill": area / (bw * bh) if bw and bh else 0,
        "cropped_bottom": bottom > 0.02,
        "cropped_top": top > 0.02,
        "limb_runs": runs,
        "hair_ratio": hair_ratio,
        "height_px": bh,
    }


def classify(m):
    """Frontal / three-quarter / profile, from symmetry and proportions."""
    if m["empty"]:
        return "empty"
    if m["symmetry"] >= 0.82:
        return "frontal"
    if m["symmetry"] >= 0.62:
        return "three-quarter"
    return "profile"


def score(m):
    """How usable this panel is as generation input. Higher is better."""
    if m["empty"]:
        return 0.0
    s = 0.0
    s += m["symmetry"] * 40                    # straight-on views are worth most
    s += 25 if not m["cropped_bottom"] else 0  # a cut-off figure is near-useless
    s += 10 if not m["cropped_top"] else 0
    s += min(m["limb_runs"], 3) * 8            # separated limbs won't fuse
    s -= max(0, m["hair_ratio"] - 1.6) * 12    # runaway hair mass hurts
    return round(s, 1)


# ---------------------------------------------------------------------------
# output
# ---------------------------------------------------------------------------

def prepare(img, mask, canvas, margin):
    """Cut out, scale to a fixed subject height, centre on a square canvas."""
    box = mask.getbbox()
    rgba = img.convert("RGBA")
    rgba.putalpha(mask)
    sub = rgba.crop(box)

    target_h = int(canvas * (1 - 2 * margin))
    scale = target_h / sub.height
    new_w = max(1, int(round(sub.width * scale)))
    sub = sub.resize((new_w, target_h), Image.LANCZOS)

    sheet = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    sheet.paste(sub, ((canvas - new_w) // 2, int(canvas * margin)), sub)
    return sheet


def load_panels(source, panels, use_rembg):
    """Accept either a composite sheet or a folder of separate images."""
    path = pathlib.Path(source)

    if path.is_dir():
        suffixes = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
        files = sorted(p for p in path.iterdir() if p.suffix.lower() in suffixes)
        if not files:
            sys.exit(f"no images found in {path}")
        return [(p.stem, Image.open(p)) for p in files]

    sheet = Image.open(path)
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
    from split_sheet import (find_gaps, panels_from_gaps, equal_panels,
                             consolidate)

    if panels:
        ranges = equal_panels(sheet.width, panels)
    else:
        from split_sheet import find_valleys
        gaps = find_gaps(sheet)
        if len(gaps) < 1:
            # Panels that nearly touch hide the gap. Density valleys still find it.
            gaps = find_valleys(sheet)
            if gaps:
                print(f"  panels touch — found {len(gaps)} boundary/ies by density")
        ranges = consolidate(panels_from_gaps(sheet.width, gaps))

    return [(f"panel{i+1}", sheet.crop((x0, 0, x1, sheet.height)))
            for i, (x0, x1) in enumerate(ranges)]


def decide(measures):
    """Choose MULTI-VIEW or SINGLE-VIEW, and which panels to use."""
    usable = [m for m in measures if not m["empty"] and not m["cropped_bottom"]]
    frontal = [m for m in usable if classify(m) == "frontal"]
    profile = [m for m in usable if classify(m) == "profile"]

    reasons = []

    # Multi-view only pays off when the views genuinely agree. The test is
    # whether we have distinct angles at consistent subject proportions.
    if len(frontal) >= 2 and profile:
        heights = [m["height_px"] for m in frontal + profile]
        spread = (max(heights) - min(heights)) / max(heights)
        if spread <= 0.25:
            chosen = sorted(frontal, key=score, reverse=True)[:2] + \
                     sorted(profile, key=score, reverse=True)[:2]
            return "multi-view", chosen, ["views are distinct and consistently proportioned"]
        reasons.append(f"subject height varies {spread*100:.0f}% across panels")

    if len(frontal) < 2:
        reasons.append(f"only {len(frontal)} straight-on view(s) — "
                       "multi-view needs front and back at minimum")
    if not profile:
        reasons.append("no profile view")
    if len(usable) < len(measures):
        cut = len(measures) - len(usable)
        reasons.append(f"{cut} panel(s) unusable (cropped or empty)")

    best = max(usable or measures, key=score)
    return "single-view", [best], reasons


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="a reference sheet image, or a folder of views")
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--panels", type=int, default=None,
                    help="force N equal panels instead of auto-detecting")
    ap.add_argument("--canvas", type=int, default=1024)
    ap.add_argument("--margin", type=float, default=0.08)
    ap.add_argument("--force", choices=["multi-view", "single-view"],
                    help="override the automatic strategy")
    ap.add_argument("--no-rembg", action="store_true")
    args = ap.parse_args()

    print()
    panels = load_panels(args.source, args.panels, not args.no_rembg)
    print(f"found {len(panels)} panel(s)\n")

    measures = []
    for name, img in panels:
        m = measure(img, name, use_rembg=not args.no_rembg)
        m["image"] = img
        measures.append(m)

    print(f"  {'panel':<9} {'type':<14} {'sym':>5} {'limbs':>6} {'hair':>6} "
          f"{'cropped':<9} {'score':>6}")
    print("  " + "-" * 62)
    for m in measures:
        if m["empty"]:
            print(f"  {m['name']:<9} {'empty':<14}")
            continue
        crop = "bottom" if m["cropped_bottom"] else ("top" if m["cropped_top"] else "no")
        print(f"  {m['name']:<9} {classify(m):<14} {m['symmetry']:>5.2f} "
              f"{m['limb_runs']:>6} {m['hair_ratio']:>6.2f} {crop:<9} {score(m):>6}")

    strategy, chosen, reasons = decide(measures)
    if args.force:
        strategy = args.force
        if strategy == "single-view":
            chosen = [max((m for m in measures if not m["empty"]), key=score)]
        reasons = ["forced by --force"]

    print(f"\n  strategy: {strategy.upper()}")
    for r in reasons:
        print(f"    - {r}")

    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    if strategy == "multi-view":
        # Name by angle so prep_views and the generators pick them up correctly.
        order = ["front", "back", "left", "right"]
        names = order[:len(chosen)]
    else:
        names = ["front"]

    print()
    for m, name in zip(chosen, names):
        prepared = prepare(m["image"], m["mask"], args.canvas, args.margin)
        path = out / f"{name}.png"
        prepared.save(path)
        print(f"  {m['name']} -> {path}")

    # Warnings that survive whatever strategy was picked.
    notes = []
    worst_hair = max((m["hair_ratio"] for m in chosen if not m["empty"]), default=0)
    if worst_hair > 1.6:
        notes.append("large hair mass — expect it to come back fused to the head "
                     "and shoulders as one solid volume; loose flowing hair is "
                     "separate alpha-carded geometry in real game assets")
    arms_pinned = any(m["limb_runs"] < 3 for m in chosen if not m["empty"])
    if arms_pinned:
        notes.append("arms are against the body — they will fuse to the torso "
                     "unless moved. repose_arms.py can swing them outward "
                     "automatically (see the command below)")
    if strategy == "single-view":
        notes.append("the unseen sides will be invented by the model. That is "
                     "the correct trade here: it invents them consistently, "
                     "rather than trying to satisfy views that disagree")

    if notes:
        print("\n  expect:")
        for n in notes:
            print(f"    ! {n}")

    if arms_pinned:
        first = out / ("front.png" if (out / "front.png").exists() else "front.png")
        print("\n  FIRST — separate the arms from the body, or they fuse in the mesh:")
        print(f"    python pipeline/tools/repose_arms.py {first} "
              f"-o work/posed/front.png")
        print("    then re-run this tool on work/posed/ to confirm limbs reads 3.")

    if strategy == "single-view":
        print("\n  RECOMMENDED — synthesise the missing views instead of letting")
        print("  the 3D model invent them silently inside the mesh:")
        print(f"    python pipeline/tools/synth_views.py {out / 'front.png'} "
              f"-o work/synth/")
        print("  That produces a full front/back/left/right set you can actually")
        print("  look at and re-roll before any geometry exists. Then:")
        print("    python pipeline/tools/generate_local.py work/synth/ "
              "-o work/generated.glb")
        print(f"\n  or skip it and go straight from the one view:")
        print(f"    python pipeline/tools/generate_local.py {out} "
              f"-o work/generated.glb\n")
    else:
        print(f"\n  next: python pipeline/tools/generate_local.py {out} "
              f"-o work/generated.glb\n")


if __name__ == "__main__":
    main()
