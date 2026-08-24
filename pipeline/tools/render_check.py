#!/usr/bin/env python3
"""
Render a character from several angles so its quality can actually be looked at.

The point of this tool is a feedback loop. Numbers ("6,210 tris") say nothing
about whether a model looks right; a render does. Run this after auto_finish and
open the contact sheet — or let Claude Code read it directly and judge.

    python3 pipeline/tools/render_check.py --input finished/char.glb -o qa/

Produces numbered turntable frames, a head close-up, and a single contact sheet
combining them.
"""

import argparse
import math
import os
import sys

try:
    import bpy
    from mathutils import Vector
except ImportError:
    sys.exit("Needs Blender:  pip install bpy   (or: blender -b -P ...)")

# Import the shared helper whether this is run as a plain script or through
# `blender -b -P`, where the script's directory is not on sys.path.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from blender_util import configure_cycles_device



def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("-o", "--output-dir", default="qa")
    ap.add_argument("--angles", type=int, default=4, help="turntable frames")
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--samples", type=int, default=24)
    ap.add_argument("--closeup", action="store_true", default=True,
                    help="also render a head close-up")
    ap.add_argument("--no-closeup", dest="closeup", action="store_false")
    return ap.parse_args(argv)


def import_mesh(path):
    if not os.path.isfile(path):
        sys.exit(f"input file not found: {path}")
    ext = os.path.splitext(path)[1].lower()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        (bpy.ops.wm.obj_import if hasattr(bpy.ops.wm, "obj_import")
         else bpy.ops.import_scene.obj)(filepath=path)
    else:
        sys.exit(f"unsupported input format: {ext}")


def bounds():
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not objs:
        sys.exit("no mesh in the file")
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def build_studio():
    """Three-point-ish lighting on a neutral world — flatters nothing, hides nothing."""
    world = bpy.data.worlds.new("QA")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.05, 0.06, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.0

    lo, hi = bounds()
    size = max((hi - lo).length, 0.001)
    centre = (lo + hi) / 2

    # Irradiance falls off with the square of distance, and the lights are placed
    # proportionally to subject size, so energy scales with size squared to keep
    # exposure constant across characters of any scale.
    for name, offset, energy in (
        ("key",  Vector(( 1.4, -1.6,  1.5)), 1.0),
        ("fill", Vector((-1.6, -1.0,  0.5)), 0.35),
        ("rim",  Vector(( 0.0,  1.8,  1.2)), 0.7),
    ):
        bpy.ops.object.light_add(type="AREA", location=centre + offset * size)
        light = bpy.context.active_object
        light.name = name
        light.data.energy = energy * size * size * 24
        light.data.size = size * 0.9
        direction = (centre - light.location).normalized()
        light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def place_camera(angle_deg, framing=1.0, target_z_fraction=0.5):
    """Orbit the camera, framing from the actual field of view.

    Deriving distance from the bounding-box diagonal leaves the subject small and
    inconsistent between characters. Solving against the lens angle instead makes
    the subject fill the frame the same way every time.
    """
    lo, hi = bounds()
    centre = (lo + hi) / 2
    height = hi.z - lo.z

    cam = bpy.context.scene.camera
    if cam is None:
        bpy.ops.object.camera_add()
        cam = bpy.context.active_object
        bpy.context.scene.camera = cam

    theta = math.radians(angle_deg)
    # Horizontal extent varies as the camera orbits; use the larger of the two
    # ground-plane dimensions so no angle crops the subject.
    span = max(hi.x - lo.x, hi.y - lo.y)
    subject = max(height, span)

    half_fov = cam.data.angle / 2
    # 1.12 leaves a small margin so the silhouette never touches the frame edge.
    distance = (subject * 0.5 * 1.12 * framing) / math.tan(half_fov)

    target = Vector((centre.x, centre.y, lo.z + height * target_z_fraction))
    loc = target + Vector((math.sin(theta) * distance,
                           -math.cos(theta) * distance,
                           distance * 0.10))

    cam.location = loc
    cam.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    return cam


def render_to(path, size, samples):
    scene = bpy.context.scene
    configure_cycles_device(scene, verbose=False)
    scene.cycles.samples = samples
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def contact_sheet(paths, out_path, size):
    try:
        from PIL import Image
    except ImportError:
        print("  (install Pillow for a combined contact sheet)")
        return None
    images = [Image.open(p) for p in paths if os.path.exists(p)]
    if not images:
        return None
    sheet = Image.new("RGB", (size * len(images), size), (18, 18, 22))
    for i, im in enumerate(images):
        sheet.paste(im.convert("RGB").resize((size, size), Image.LANCZOS), (i * size, 0))
    sheet.save(out_path)
    return out_path


def main():
    args = parse_args()
    out_dir = os.path.abspath(args.output_dir)
    os.makedirs(out_dir, exist_ok=True)

    name = os.path.splitext(os.path.basename(args.input))[0]
    print(f"\n[render-check] {args.input}")

    import_mesh(args.input)
    build_studio()

    written = []
    for i in range(args.angles):
        angle = (360 / args.angles) * i
        place_camera(angle)
        path = os.path.join(out_dir, f"{name}_{int(angle):03d}.png")
        render_to(path, args.size, args.samples)
        written.append(path)
        print(f"  {int(angle):>3}deg -> {os.path.basename(path)}")

    if args.closeup:
        # Tight on the upper body: the region buyers zoom into first, and the
        # region weakest in generated output.
        place_camera(20, framing=0.42, target_z_fraction=0.86)
        path = os.path.join(out_dir, f"{name}_closeup.png")
        render_to(path, args.size, args.samples)
        written.append(path)
        print(f"  closeup -> {os.path.basename(path)}")

    sheet = contact_sheet(written, os.path.join(out_dir, f"{name}_contact.png"), args.size)
    if sheet:
        print(f"\n  contact sheet: {sheet}")
    print()


if __name__ == "__main__":
    main()
