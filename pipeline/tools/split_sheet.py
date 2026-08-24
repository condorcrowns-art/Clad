#!/usr/bin/env python3
"""
Split a character reference sheet into separate view images.

Reference sheets usually arrive as one wide image with several panels side by
side. prep_views.py wants one file per view, so this cuts them apart first.

    python pipeline/tools/split_sheet.py sheet.png -o work/refs/ --names front,back,left,right

By default it finds the panel gaps automatically by looking for columns that are
almost entirely background. If the panels touch, or the background is busy, pass
--panels N to split into N equal columns instead.
"""

import argparse
import pathlib
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")


def background_colour(img):
    """Average the four corners — reference sheets are near-always flat-backed."""
    w, h = img.size
    patch = max(2, min(w, h) // 100)
    samples = []
    for (x0, y0) in [(0, 0), (w - patch, 0), (0, h - patch), (w - patch, h - patch)]:
        region = img.crop((x0, y0, x0 + patch, y0 + patch)).convert("RGB")
        samples.append(region.resize((1, 1), Image.LANCZOS).getpixel((0, 0)))
    return tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))


def column_is_empty(img, x, bg, tolerance, sample_rows):
    """True if column x is background all the way down (sampled, not exhaustive)."""
    h = img.height
    step = max(1, h // sample_rows)
    for y in range(0, h, step):
        px = img.getpixel((x, y))[:3]
        if sum(abs(px[i] - bg[i]) for i in range(3)) > tolerance * 3:
            return False
    return True


def find_gaps(img, tolerance=30, sample_rows=120, min_panel_fraction=0.05):
    """Return x-ranges of background-only columns wide enough to be real gaps."""
    img = img.convert("RGB")
    bg = background_colour(img)
    w = img.width

    empty = [column_is_empty(img, x, bg, tolerance, sample_rows) for x in range(w)]

    gaps, start = [], None
    for x, is_empty in enumerate(empty):
        if is_empty and start is None:
            start = x
        elif not is_empty and start is not None:
            gaps.append((start, x))
            start = None
    if start is not None:
        gaps.append((start, w))

    # Drop the outer margins — they are not gaps between panels.
    gaps = [g for g in gaps if g[0] > 0 and g[1] < w]
    # A real gap is a meaningful slice of the image, not a few stray columns.
    min_width = max(2, int(w * 0.004))
    return [g for g in gaps if g[1] - g[0] >= min_width]


def panels_from_gaps(width, gaps):
    """Convert gap ranges into panel x-ranges, cutting at each gap's midpoint."""
    cuts = [0] + [(a + b) // 2 for a, b in gaps] + [width]
    return [(cuts[i], cuts[i + 1]) for i in range(len(cuts) - 1)]


def equal_panels(width, count):
    step = width / count
    return [(int(round(i * step)), int(round((i + 1) * step))) for i in range(count)]


def trim(img, tolerance=30):
    """Crop a panel down to its subject, so later height-normalisation is accurate."""
    rgb = img.convert("RGB")
    bg = background_colour(rgb)
    mask = rgb.point(lambda v: v)  # copy
    # Build an alpha-ish mask by distance from the background colour.
    from PIL import ImageChops
    r, g, b = rgb.split()
    dist = ImageChops.add(
        ImageChops.add(
            ImageChops.difference(r, Image.new("L", rgb.size, bg[0])),
            ImageChops.difference(g, Image.new("L", rgb.size, bg[1])),
        ),
        ImageChops.difference(b, Image.new("L", rgb.size, bg[2])),
    )
    mask = dist.point(lambda v: 0 if v < tolerance * 3 else 255)
    box = mask.getbbox()
    return img.crop(box) if box else img


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sheet", help="the composite reference sheet image")
    ap.add_argument("-o", "--output", required=True, help="output folder")
    ap.add_argument("--panels", type=int, default=None,
                    help="split into N equal columns instead of auto-detecting")
    ap.add_argument("--names", default="front,back,left,right",
                    help="comma-separated names, left to right")
    ap.add_argument("--no-trim", action="store_true",
                    help="keep each panel's original framing")
    args = ap.parse_args()

    img = Image.open(args.sheet)
    print(f"\nsheet: {img.width}x{img.height}")

    if args.panels:
        ranges = equal_panels(img.width, args.panels)
        print(f"  splitting into {args.panels} equal columns")
    else:
        gaps = find_gaps(img)
        ranges = panels_from_gaps(img.width, gaps)
        print(f"  detected {len(ranges)} panel(s) from {len(gaps)} gap(s)")
        if len(ranges) == 1:
            print("  ! no gaps found — panels probably touch. "
                  "Re-run with --panels N to split evenly.")

    names = [n.strip() for n in args.names.split(",") if n.strip()]
    out = pathlib.Path(args.output)
    out.mkdir(parents=True, exist_ok=True)

    written = []
    for i, (x0, x1) in enumerate(ranges):
        panel = img.crop((x0, 0, x1, img.height))
        if not args.no_trim:
            panel = trim(panel)
        name = names[i] if i < len(names) else f"view{i + 1}"
        path = out / f"{name}.png"
        panel.save(path)
        written.append((name, panel.size, path))
        print(f"  {name:<8} {panel.width}x{panel.height}  -> {path}")

    if len(ranges) != len(names):
        print(f"\n  ! {len(ranges)} panels but {len(names)} names given — "
              "check the --names order matches the sheet left to right")

    print(f"\n{len(written)} view(s) written. Next:\n"
          f"  python pipeline/tools/prep_views.py {out} -o work/prepped/\n")


if __name__ == "__main__":
    main()
