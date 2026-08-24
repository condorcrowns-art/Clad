#!/usr/bin/env python3
"""
Move a character's arms away from the body so they don't fuse in the mesh.

Arms hanging against the torso are the single most common reason a generated
character comes back with its limbs welded to its sides. The generator sees one
continuous silhouette and produces one continuous volume.

This finds the arms, cuts them out, swings them outward about the shoulder, and
composites the result -- turning arms-down source art into something close
enough to an A-pose that the limbs read as separate.

    python pipeline/tools/repose_arms.py work/prepped/front.png -o work/posed/front.png

How it finds an arm without a pose model:

  1. builds the silhouette
  2. estimates the body core per row -- the central mass, measured from the
     robust median half-width of the torso band
  3. anything lateral to the core, between shoulder and hip, is an arm candidate
  4. splits candidates into left and right, keeps the largest run per side
  5. rotates each about its shoulder pivot, outward

Where the arm and torso are different colours -- skin against clothing, which is
usual -- colour separation sharpens the boundary. Where they are not, the
geometric estimate carries it alone.

Check the result with fix_views.py: the "limbs" column should go from 1 to 3.
That number is literally the count of separate masses across the chest, so it is
a direct measure of whether the arms now read as detached.
"""

import argparse
import math
import os
import sys

try:
    from PIL import Image, ImageChops, ImageFilter
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")


# ---------------------------------------------------------------------------
# silhouette
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
    if img.mode == "RGBA" and img.getextrema()[3][0] < 250:
        return img.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    if use_rembg:
        try:
            from rembg import remove
            return remove(img.convert("RGBA")).getchannel("A").point(
                lambda v: 255 if v > 40 else 0)
        except Exception:
            pass
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
# body analysis
# ---------------------------------------------------------------------------

def row_span(mask, y):
    """Leftmost and rightmost foreground pixel on row y."""
    w = mask.width
    xs = [x for x in range(w) if mask.getpixel((x, y))]
    return (xs[0], xs[-1]) if xs else None


def analyse_body(mask, box):
    """Estimate the centre line, core half-width, and the arm band."""
    x0, y0, x1, y1 = box
    h = y1 - y0

    # Sample spans down the figure.
    spans = {}
    for y in range(y0, y1, max(1, h // 200)):
        s = row_span(mask, y)
        if s:
            spans[y] = s

    if not spans:
        return None

    centre = sum((a + b) / 2 for a, b in spans.values()) / len(spans)

    # The hip band is the most reliable read of core width: below the arms,
    # above the leg split, and unaffected by hair.
    hip_lo, hip_hi = y0 + int(h * 0.52), y0 + int(h * 0.62)
    hip_widths = [b - a for y, (a, b) in spans.items() if hip_lo <= y <= hip_hi]
    if not hip_widths:
        hip_widths = [b - a for a, b in spans.values()]
    hip_widths.sort()
    core_half = hip_widths[len(hip_widths) // 2] / 2

    # Arms occupy roughly shoulder to hip.
    band = (y0 + int(h * 0.17), y0 + int(h * 0.60))
    return {"centre": centre, "core_half": core_half, "band": band,
            "spans": spans, "box": box}


def torso_colour(rgb, mask, body):
    """Sample the colour running down the centre of the torso.

    Where an arm touches the torso, geometry cannot see the seam but colour
    usually can -- skin against a bodysuit is a sharp change. This gives the
    reference colour to compare against.
    """
    band_lo, band_hi = body["band"]
    cx = int(body["centre"])
    samples = []
    for y in range(band_lo, band_hi, max(1, (band_hi - band_lo) // 24)):
        if 0 <= cx < rgb.width and 0 <= y < rgb.height and mask.getpixel((cx, y)):
            samples.append(rgb.getpixel((cx, y)))
    if not samples:
        return None
    return tuple(sum(s[i] for s in samples) // len(samples) for i in range(3))


def colour_distance(a, b):
    return sum(abs(a[i] - b[i]) for i in range(3))


def arm_masks(mask, body, colour_img=None, margin=1.08, colour_threshold=70):
    """Split the foreground lateral to the torso into left and right arm masks.

    Two passes. Colour first: walk outward from the centre line until the pixel
    stops matching the torso, and treat the remaining foreground as arm. That
    finds the true seam even when arm and torso touch. If colour cannot separate
    them -- a character dressed in one flat tone -- fall back to a geometric
    core width measured *below* the arms, since a band that still contains arms
    measures torso-plus-arm and under-cuts them.
    """
    w, h = mask.size
    centre = body["centre"]
    band_lo, band_hi = body["band"]

    left = Image.new("L", (w, h), 0)
    right = Image.new("L", (w, h), 0)
    lp, rp = left.load(), right.load()
    mp = mask.load()

    rgb = colour_img.convert("RGB") if colour_img else None
    ref = torso_colour(rgb, mask, body) if rgb else None
    rp_px = rgb.load() if rgb else None

    # Geometric fallback width, measured below the arm band where only the
    # torso/hips remain.
    below_lo, below_hi = band_hi, min(h, band_hi + int((band_hi - band_lo) * 0.25))
    below = [b - a for y in range(below_lo, below_hi)
             for (a, b) in [row_span(mask, y) or (0, 0)] if b > a]
    below.sort()
    fallback_half = (below[len(below) // 2] / 2 * margin) if below \
        else body["core_half"] * margin

    left_count = right_count = 0
    colour_rows = 0

    for y in range(max(0, band_lo), min(h, band_hi)):
        span = row_span(mask, y)
        if not span:
            continue
        cx = int(centre)

        boundaries = {}
        if ref and rp_px:
            for side, step in (("left", -1), ("right", 1)):
                x = cx
                seen_torso = False
                edge = None
                while span[0] <= x <= span[1]:
                    if mp[x, y]:
                        if colour_distance(rp_px[x, y], ref) <= colour_threshold:
                            seen_torso = True
                        elif seen_torso:
                            edge = x
                            break
                    x += step
                boundaries[side] = edge
            if boundaries.get("left") is not None or boundaries.get("right") is not None:
                colour_rows += 1

        for x in range(span[0], span[1] + 1):
            if not mp[x, y]:
                continue
            offset = x - centre

            lb, rb = boundaries.get("left"), boundaries.get("right")
            if offset < 0:
                is_arm = (x <= lb) if lb is not None else (offset < -fallback_half)
            else:
                is_arm = (x >= rb) if rb is not None else (offset > fallback_half)

            if not is_arm:
                continue
            if offset < 0:
                lp[x, y] = 255
                left_count += 1
            else:
                rp[x, y] = 255
                right_count += 1

    method = "colour seam" if colour_rows > (band_hi - band_lo) * 0.35 else "geometric width"
    return left, right, left_count, right_count, method


def largest_blob_bounds(mask):
    """Bounding box of the mask, used as a cheap stand-in for a blob search."""
    return mask.getbbox()


def shoulder_pivot(arm_mask, body, side):
    """Pivot at the top inner corner of the arm — roughly the shoulder joint."""
    box = arm_mask.getbbox()
    if not box:
        return None
    ax0, ay0, ax1, ay1 = box
    x = ax1 if side == "left" else ax0   # inner edge, nearest the torso
    return (x, ay0)


# ---------------------------------------------------------------------------
# reposing
# ---------------------------------------------------------------------------

def rotate_layer(layer, pivot, degrees):
    """Rotate a full-canvas layer about an arbitrary point."""
    # PIL rotates counter-clockwise about `center`.
    return layer.rotate(degrees, resample=Image.BICUBIC, center=pivot)


def expand(img, pad):
    """Pad transparently so a swung arm cannot run off the canvas."""
    out = Image.new("RGBA", (img.width + pad * 2, img.height + pad * 2), (0, 0, 0, 0))
    out.paste(img.convert("RGBA"), (pad, pad))
    return out


def repose(img, angle=32, use_rembg=True, feather=1):
    rgba_in = img.convert("RGBA")
    mask_in = silhouette(img, use_rembg=use_rembg)
    box_in = mask_in.getbbox()

    # An arm swung outward reaches further than the original frame allows. Pad by
    # enough to hold the rotated limb, or it gets clipped at the edge -- which
    # also makes the result read as a cropped figure downstream.
    if box_in:
        reach = int((box_in[3] - box_in[1]) * 0.45 * abs(math.sin(math.radians(angle))))
        pad = max(8, reach + 12)
    else:
        pad = 8

    rgba = expand(rgba_in, pad)
    mask = expand(mask_in.convert("RGBA"), pad).getchannel("A").point(
        lambda v: 255 if v > 40 else 0)
    box = mask.getbbox()
    if not box:
        return None, "image is empty after background removal"

    body = analyse_body(mask, box)
    if not body:
        return None, "could not measure the body"

    left, right, lc, rc, method = arm_masks(mask, body, colour_img=rgba)
    if lc < 50 and rc < 50:
        return None, ("no arm regions found lateral to the torso — the arms may "
                      "already be clear of the body, or hidden behind it")

    # Base image with the arms removed.
    both = ImageChops.lighter(left, right)
    base_alpha = ImageChops.subtract(rgba.getchannel("A"), both)
    base = rgba.copy()
    base.putalpha(base_alpha)

    result = base
    moved = []
    for side, arm_mask, count in (("left", left, lc), ("right", right, rc)):
        if count < 50:
            continue
        pivot = shoulder_pivot(arm_mask, body, side)
        if not pivot:
            continue

        layer = rgba.copy()
        soft = arm_mask.filter(ImageFilter.GaussianBlur(feather)) if feather else arm_mask
        layer.putalpha(ImageChops.multiply(rgba.getchannel("A"), soft))

        # Left arm swings clockwise (negative), right arm counter-clockwise.
        degrees = -angle if side == "left" else angle
        rotated = rotate_layer(layer, pivot, degrees)
        result = Image.alpha_composite(result, rotated)
        moved.append(f"{side} arm {abs(degrees)} deg about {pivot}")

    if not moved:
        return None, "arm regions found but no pivot could be established"

    # Trim the padding back to whatever the result actually needs.
    final_box = result.getchannel("A").getbbox()
    if final_box:
        m = 8
        result = result.crop((max(0, final_box[0] - m), max(0, final_box[1] - m),
                              min(result.width, final_box[2] + m),
                              min(result.height, final_box[3] + m)))
    return result, f"{'; '.join(moved)} (boundary via {method})"


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("image")
    ap.add_argument("-o", "--output", required=True)
    ap.add_argument("--angle", type=float, default=32,
                    help="degrees to swing each arm outward (default 32)")
    ap.add_argument("--feather", type=float, default=1.0,
                    help="soften the cut edge, in pixels")
    ap.add_argument("--no-rembg", action="store_true")
    args = ap.parse_args()

    if not os.path.isfile(args.image):
        sys.exit(f"input image not found: {args.image}")

    img = Image.open(args.image)
    print(f"\n[repose-arms] {args.image} ({img.width}x{img.height})")

    result, note = repose(img, angle=args.angle, use_rembg=not args.no_rembg,
                          feather=args.feather)
    if result is None:
        sys.exit(f"  could not repose: {note}")

    os.makedirs(os.path.dirname(os.path.abspath(args.output)) or ".", exist_ok=True)
    result.save(args.output)
    print(f"  {note}")
    print(f"  -> {args.output}")
    print("\n  verify with:")
    print(f"    python pipeline/tools/fix_views.py {args.output} -o /tmp/check --panels 1")
    print("  the 'limbs' column should now read 3 rather than 1.\n")


if __name__ == "__main__":
    main()
