#!/usr/bin/env python3
"""
Burn a tiled watermark into preview renders.

This is the real protection on the image side. The CSS overlay on the site is a
deterrent only — anyone can pull the raw file out of the network tab. Run every
render through this before it goes anywhere near the repo.

    pip install Pillow
    python3 store/tools/watermark.py raw_renders/ store/assets/characters/my-char/

Options:
    --text      watermark text (default: matches SITE.watermarkText in data.js)
    --opacity   0-255, default 46
    --angle     degrees, default -28
    --scale     text size as a fraction of image width, default 0.055
    --max-width downscale output to this width, default 1600 (0 = keep original)
    --format    webp | png | jpg   (default webp — smallest, well supported)
"""

import argparse
import pathlib
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def load_font(size):
    """Pillow's bundled default font ignores size, so try real fonts first."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
    ]
    for path in candidates:
        if pathlib.Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    print("  ! no TrueType font found; falling back to a small bitmap font", file=sys.stderr)
    return ImageFont.load_default()


def text_size(draw, text, font):
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def watermark(img, text, opacity, angle, scale):
    img = img.convert("RGBA")
    w, h = img.size

    font = load_font(max(12, int(w * scale)))

    # Draw the tiled text on an oversized canvas so that rotating it still
    # covers every corner of the image.
    diag = int((w**2 + h**2) ** 0.5) + 40
    layer = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    tw, th = text_size(draw, text, font)
    step_x, step_y = tw + int(tw * 0.6), th * 4

    for y in range(0, diag, max(step_y, 1)):
        # Offset every other row so the tiling doesn't form hard vertical seams.
        offset = (y // max(step_y, 1) % 2) * (step_x // 2)
        for x in range(-step_x, diag, max(step_x, 1)):
            draw.text((x + offset, y), text, font=font, fill=(255, 255, 255, opacity))

    layer = layer.rotate(angle, resample=Image.BICUBIC)
    left, top = (diag - w) // 2, (diag - h) // 2
    layer = layer.crop((left, top, left + w, top + h))

    return Image.alpha_composite(img, layer)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", help="input file or directory of renders")
    ap.add_argument("dst", help="output directory")
    ap.add_argument("--text", default="CONDOR CROWNS — PREVIEW")
    ap.add_argument("--opacity", type=int, default=46)
    ap.add_argument("--angle", type=float, default=-28)
    ap.add_argument("--scale", type=float, default=0.055)
    ap.add_argument("--max-width", type=int, default=1600)
    ap.add_argument("--format", choices=["webp", "png", "jpg"], default="webp")
    args = ap.parse_args()

    src = pathlib.Path(args.src)
    dst = pathlib.Path(args.dst)
    dst.mkdir(parents=True, exist_ok=True)

    files = [src] if src.is_file() else sorted(
        p for p in src.rglob("*") if p.suffix.lower() in SUFFIXES
    )
    if not files:
        sys.exit(f"no images found in {src}")

    for path in files:
        img = Image.open(path)

        if args.max_width and img.width > args.max_width:
            ratio = args.max_width / img.width
            img = img.resize((args.max_width, int(img.height * ratio)), Image.LANCZOS)

        out = watermark(img, args.text, args.opacity, args.angle, args.scale)
        target = dst / f"{path.stem}.{args.format}"

        if args.format == "jpg":
            out.convert("RGB").save(target, quality=88, optimize=True)
        elif args.format == "webp":
            out.save(target, quality=86, method=6)
        else:
            out.save(target, optimize=True)

        print(f"  {path.name} -> {target}")

    print(f"\n{len(files)} image(s) watermarked into {dst}")


if __name__ == "__main__":
    main()
