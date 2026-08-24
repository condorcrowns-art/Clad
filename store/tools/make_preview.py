#!/usr/bin/env python3
"""
Generate a safe web preview GLB from a master character file, using Blender.

The preview that goes on the website must NOT be a usable asset. This script
takes the master and deliberately degrades it:

  * decimates the mesh to a target triangle budget
  * strips the armature, all vertex groups, shape keys, and animation
  * downsizes textures and bakes a tiled watermark across the base colour
  * removes every image texture except base colour (no normal/roughness maps)
  * exports a single draco-compressed GLB

Blender is free — https://blender.org. Run it headless:

    blender -b -P store/tools/make_preview.py -- \
        --input masters/ronin.blend \
        --output store/assets/characters/ronin/preview.glb \
        --tris 8000 \
        --text "CONDOR CROWNS — PREVIEW"

--input accepts .blend, .fbx, .obj, or .glb/.gltf.
"""

import argparse
import os
import sys

try:
    import bpy
    import bmesh
except ImportError:
    sys.exit("This script must be run inside Blender:  blender -b -P make_preview.py -- ...")


def argv_after_dashes():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--tris", type=int, default=8000, help="target triangle budget")
    ap.add_argument("--texture-size", type=int, default=512)
    ap.add_argument("--text", default="CONDOR CROWNS — PREVIEW")
    return ap.parse_args(argv_after_dashes())


def load(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".blend":
        bpy.ops.wm.open_mainfile(filepath=path)
        return
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        # Blender 4.x renamed the OBJ importer; support both.
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        sys.exit(f"unsupported input format: {ext}")


def strip_rig_and_animation():
    """Remove everything that would make the preview animatable."""
    for obj in list(bpy.data.objects):
        if obj.type == "ARMATURE":
            bpy.data.objects.remove(obj, do_unlink=True)

    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        # Armature modifiers now point at nothing; drop them along with the
        # weights and shape keys so the mesh can't be re-bound trivially.
        for mod in list(obj.modifiers):
            if mod.type == "ARMATURE":
                obj.modifiers.remove(mod)
        obj.vertex_groups.clear()
        if obj.data.shape_keys:
            obj.shape_key_clear()
        obj.animation_data_clear()

    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def mesh_objects():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def triangle_count(objs):
    total = 0
    for obj in objs:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        total += len(bm.faces)
        bm.free()
    return total


def decimate(objs, target_tris):
    current = triangle_count(objs)
    if current <= target_tris:
        print(f"  mesh is already {current} tris — no decimation needed")
        return
    ratio = max(0.01, target_tris / current)
    print(f"  decimating {current} -> ~{target_tris} tris (ratio {ratio:.3f})")
    for obj in objs:
        mod = obj.modifiers.new("preview_decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)


def watermark_image(img, text, size):
    """Scale an image down and stamp repeated text across it via pixel writes."""
    img.scale(size, size)

    px = list(img.pixels)
    w, h = img.size
    channels = img.channels

    # Blender has no text rasteriser available to a background script, so the
    # watermark here is a diagonal stripe grid rather than glyphs. It is enough
    # to make the preview texture unusable as a production asset.
    stripe = max(2, size // 64)
    period = max(8, size // 8)
    for y in range(h):
        for x in range(w):
            if ((x + y) % period) < stripe:
                i = (y * w + x) * channels
                for c in range(min(3, channels)):
                    px[i + c] = px[i + c] * 0.35 + 0.65
    img.pixels = px


def degrade_materials(text, size):
    kept = 0
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        nodes = mat.node_tree.nodes
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)

        base_img = None
        if bsdf and bsdf.inputs["Base Color"].is_linked:
            src = bsdf.inputs["Base Color"].links[0].from_node
            if src.type == "TEX_IMAGE" and src.image:
                base_img = src.image

        # Drop every image node that isn't the base colour — no normal maps,
        # no roughness, no ORM in the preview.
        for node in list(nodes):
            if node.type == "TEX_IMAGE" and node.image is not base_img:
                nodes.remove(node)

        if base_img:
            watermark_image(base_img, text, size)
            kept += 1
    print(f"  degraded {kept} base-colour texture(s) to {size}px with watermark stripes")


def main():
    args = parse_args()
    print(f"\n[preview] {args.input} -> {args.output}")

    load(args.input)
    strip_rig_and_animation()

    objs = mesh_objects()
    if not objs:
        sys.exit("no mesh objects found in the input file")

    bpy.ops.object.select_all(action="DESELECT")
    decimate(objs, args.tris)
    degrade_materials(args.text, args.texture_size)

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    for obj in bpy.data.objects:
        obj.select_set(obj.type == "MESH")

    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format="GLB",
        use_selection=True,
        export_draco_mesh_compression_enable=True,
        export_skins=False,
        export_animations=False,
        export_morph=False,
    )

    final = triangle_count(mesh_objects())
    size_kb = os.path.getsize(args.output) / 1024
    print(f"[preview] done — {final} tris, {size_kb:.0f} KB\n")


if __name__ == "__main__":
    main()
