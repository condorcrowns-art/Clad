#!/usr/bin/env python3
"""
Prepare front/back/left/right reference images for multi-view 3D generation.

Multi-view models are far more sensitive to input framing than people expect.
If the character is a different height in the front and side views, the model
reconciles the mismatch by inventing geometry — that is where melted faces and
lopsided shoulders come from. This script removes that whole class of failure:

  1. cuts the background out (alpha matte)
  2. measures the subject in every view
  3. rescales all views so the character is exactly the same height in each
  4. aligns them vertically (feet on one line, head on another)
  5. pads to a square canvas with consistent margin
  6. warns about views that look inconsistent BEFORE you spend GPU time

    pip install Pillow rembg onnxruntime
    python3 pipeline/tools/prep_views.py refs/ -o prepped/

Views are matched by filename — any file containing "front", "back", "left",
"right", or "side" is picked up. Or name them explicitly:

    python3 pipeline/tools/prep_views.py \
        --front f.png --back b.png --left l.png --right r.png -o prepped/
"""

import argparse
import pathlib
import sys

try:
    from PIL import Image, ImageChops
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

VIEW_KEYS = ["front", "back", "left", "right"]
SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


# --------------------------------------------------------------------------- 
# background removal
# ---------------------------------------------------------------------------

def cut_background(img, use_rembg=True):
    """Return an RGBA image with the background transparent."""
    if img.mode == "RGBA" and img.getextrema()[3][0] < 250:
        # Already has a real alpha channel — trust it.
        return img

    if use_rembg:
        try:
            from rembg import remove
            return remove(img.convert("RGBA"))
        except ImportError:
            print("  ! rembg not installed — falling back to corner-colour keying",
                  file=sys.stderr)
        except Exception as exc:  # model download failure, etc.
            print(f"  ! rembg failed ({exc}) — falling back to corner-colour keying",
                  file=sys.stderr)

    return key_out_flat_background(img)


def key_out_flat_background(img, tolerance=28):
    """Fallback matte: key out the background colour sampled from the corners.

    Only works on flat, evenly lit backdrops. It is deliberately conservative —
    a poor matte damages the final mesh more than no matte at all, so this errs
    towards keeping pixels.
    """
    img = img.convert("RGBA")
    w, h = img.size

    # Sample a small patch at each corner rather than a single pixel, so one
    # stray compression artefact can't define the whole background colour.
    patch = max(2, min(w, h) // 100)
    samples = []
    for (x0, y0) in [(0, 0), (w - patch, 0), (0, h - patch), (w - patch, h - patch)]:
        region = img.crop((x0, y0, x0 + patch, y0 + patch)).convert("RGB")
        # Downsampling to a single pixel is the cheapest way to average a patch.
        samples.append(region.resize((1, 1), Image.LANCZOS).getpixel((0, 0)))
    bg = tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))

    # Vectorised through PIL's channel ops — a per-pixel Python loop takes
    # minutes on a 4K render, which is exactly the size of image this gets.
    rgb = img.convert("RGB")
    r, g, b = rgb.split()
    dist = ImageChops.add(
        ImageChops.add(
            ImageChops.difference(r, Image.new("L", img.size, bg[0])),
            ImageChops.difference(g, Image.new("L", img.size, bg[1])),
        ),
        ImageChops.difference(b, Image.new("L", img.size, bg[2])),
    )
    # dist < tolerance*3 means "close to the backdrop" -> transparent.
    mask = dist.point(lambda v: 0 if v < tolerance * 3 else 255)

    out = img.copy()
    out.putalpha(mask)
    return out


# ---------------------------------------------------------------------------
# measurement & normalisation
# ---------------------------------------------------------------------------

def subject_box(img):
    """Bounding box of the non-transparent pixels."""
    alpha = img.getchannel("A")
    box = alpha.getbbox()
    if box is None:
        raise ValueError("image is fully transparent after background removal")
    return box


def normalise(views, canvas=1024, margin=0.08):
    """Scale every view so the subject is the same height, then centre it.

    Height is the anchor rather than width because a character's height is the
    one dimension that genuinely should match across front, back and side.
    Width legitimately differs (a body is deeper than it is wide, or not).
    """
    boxes = {k: subject_box(v) for k, v in views.items()}
    heights = {k: b[3] - b[1] for k, b in boxes.items()}

    target_h = int(canvas * (1 - 2 * margin))
    out = {}

    for key, img in views.items():
        box = boxes[key]
        sub = img.crop(box)
        scale = target_h / heights[key]
        new_w = max(1, int(round(sub.width * scale)))
        sub = sub.resize((new_w, target_h), Image.LANCZOS)

        sheet = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        # Horizontally centred, vertically pinned to the same top margin in
        # every view so feet and head land on identical lines.
        sheet.paste(sub, ((canvas - new_w) // 2, int(canvas * margin)), sub)
        out[key] = sheet

    return out, boxes, heights


def diagnose(views, boxes, heights):
    """Flag input problems that will show up as artefacts in the mesh."""
    warnings = []

    if "front" in heights and "back" in heights:
        ratio = heights["front"] / heights["back"]
        if not 0.93 < ratio < 1.07:
            warnings.append(
                f"front and back differ in subject height by {abs(1-ratio)*100:.0f}% "
                "before normalisation — if the poses differ (not just the framing), "
                "rescaling cannot fix it and the mesh will be asymmetric")

    if "left" in heights and "right" in heights:
        ratio = heights["left"] / heights["right"]
        if not 0.93 < ratio < 1.07:
            warnings.append(
                f"left and right differ in subject height by {abs(1-ratio)*100:.0f}% "
                "before normalisation — check both side shots were taken at the "
                "same distance and camera height")

    # A side view much wider than the front view usually means perspective
    # distortion or a non-orthographic camera.
    widths = {k: boxes[k][2] - boxes[k][0] for k in boxes}
    if "front" in widths and "left" in widths:
        fw = widths["front"] / heights["front"]
        lw = widths["left"] / heights["left"]
        if lw > fw * 1.5:
            warnings.append(
                "the side view is proportionally much wider than the front view — "
                "this usually means a wide-angle lens or a close camera; "
                "orthographic-style framing produces noticeably better geometry")

    missing = [k for k in VIEW_KEYS if k not in views]
    if missing:
        warnings.append(
            f"no {'/'.join(missing)} view supplied — the model will invent those "
            "surfaces, and invented surfaces are the first thing to fall apart "
            "when a buyer zooms in")

    return warnings


# ---------------------------------------------------------------------------
# input discovery
# ---------------------------------------------------------------------------

def discover(folder):
    """Match files to views by filename keyword."""
    found = {}
    for path in sorted(pathlib.Path(folder).iterdir()):
        if path.suffix.lower() not in SUFFIXES:
            continue
        name = path.stem.lower()
        for key in VIEW_KEYS:
            if key in name and key not in found:
                found[key] = path
                break
        else:
            # "side" is ambiguous; use it for whichever side is still empty.
            if "side" in name:
                for key in ("left", "right"):
                    if key not in found:
                        found[key] = path
                        break
    return found


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", nargs="?", help="folder of reference images")
    for key in VIEW_KEYS:
        ap.add_argument(f"--{key}", help=f"explicit {key} view image")
    ap.add_argument("-o", "--output", required=True, help="output folder")
    ap.add_argument("--canvas", type=int, default=1024, help="output square size")
    ap.add_argument("--margin", type=float, default=0.08, help="border as a fraction")
    ap.add_argument("--no-rembg", action="store_true", help="skip AI matting")
    args = ap.parse_args()

    paths = {}
    if args.folder:
        paths = discover(args.folder)
    for key in VIEW_KEYS:
        explicit = getattr(args, key)
        if explicit:
            paths[key] = pathlib.Path(explicit)

    if not paths:
        sys.exit("no view images found — pass a folder or use --front/--back/--left/--right")

    print(f"\nFound {len(paths)} view(s): {', '.join(sorted(paths))}\n")

    views = {}
    for key, path in sorted(paths.items()):
        print(f"  {key:<6} {path.name}")
        img = Image.open(path)
        views[key] = cut_background(img, use_rembg=not args.no_rembg)

    prepped, boxes, heights = normalise(views, args.canvas, args.margin)

    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    for key, img in prepped.items():
        target = out / f"{key}.png"
        img.save(target)
        print(f"  -> {target}")

    warnings = diagnose(views, boxes, heights)
    if warnings:
        print("\n  Check these before generating:")
        for w in warnings:
            print(f"   ! {w}")
    else:
        print("\n  Views look consistent — good to generate.")

    print(f"\n{len(prepped)} view(s) written to {out}\n")


if __name__ == "__main__":
    main()
