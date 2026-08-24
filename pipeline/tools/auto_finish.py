#!/usr/bin/env python3
"""
Fully automatic: raw generated mesh -> clean, retopologised, baked, game-ready.

This is the step that normally requires knowing Blender. It doesn't here.

    python3 pipeline/tools/auto_finish.py --input generated.glb --output-dir out/

What it does, in order:

  1. imports and joins the chunks generators emit, welds doubles, drops loose
     and degenerate geometry, recalculates normals
  2. keeps the dense mesh aside as the detail source
  3. retopologises a copy with QuadriFlow -> clean, even quads with edge flow
  4. UV unwraps the retopologised mesh
  5. bakes NORMAL from the dense mesh onto it, so the high-frequency detail
     survives on a low triangle count -- this is what makes a model hold up
     when a buyer zooms in
  6. bakes BASE COLOUR with lighting passes disabled, which de-lights the
     texture: baked-in shadows are the classic reason a bought model fights
     the engine's lighting
  7. bakes AMBIENT OCCLUSION
  8. wires the three maps into a proper PBR material
  9. normalises scale to real-world metres, feet to Z=0, centred on origin
 10. exports GLB + FBX, plus LODs

Needs Blender. Either the module (`pip install bpy`) or a real install:
    blender -b -P pipeline/tools/auto_finish.py -- --input generated.glb
"""

import argparse
import math
import os
import sys

try:
    import bpy
    import bmesh
    from mathutils import Vector
except ImportError:
    sys.exit("Needs Blender:  pip install bpy   (or run through: blender -b -P ...)")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output-dir", default="finished")
    ap.add_argument("--name", default=None)
    ap.add_argument("--faces", type=int, default=6000,
                    help="retopology target in QUADS (roughly half this in tris)")
    ap.add_argument("--texture-size", type=int, default=2048)
    ap.add_argument("--height", type=float, default=1.8, help="metres")
    ap.add_argument("--lods", type=int, default=2)
    ap.add_argument("--bake-samples", type=int, default=8)
    ap.add_argument("--cage-extrusion", type=float, default=0.05)
    ap.add_argument("--no-retopo", action="store_true",
                    help="skip QuadriFlow and baking; exports the cleaned source as-is. "
                         "Note the weld pass can merge existing UV seams, so this suits "
                         "meshes you intend to unwrap yourself")
    ap.add_argument("--no-fbx", action="store_true")
    return ap.parse_args(argv)


# --------------------------------------------------------------------------
# scene helpers
# --------------------------------------------------------------------------

def activate(obj, also_select=()):
    bpy.ops.object.select_all(action="DESELECT")
    for extra in also_select:
        extra.select_set(True)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def triangle_count(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    n = len(bm.faces)
    bm.free()
    return n


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
    elif ext == ".ply":
        (bpy.ops.wm.ply_import if hasattr(bpy.ops.wm, "ply_import")
         else bpy.ops.import_mesh.ply)(filepath=path)
    else:
        sys.exit(f"unsupported input format: {ext}")


def join_and_clean(name):
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not objs:
        sys.exit("no mesh found in the input file")

    if len(objs) > 1:
        activate(objs[0], objs)
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active or objs[0]
    obj.name = name

    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    before = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0001)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0001, edges=bm.edges[:])
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    removed = before - len(bm.verts)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

    return obj, removed


# --------------------------------------------------------------------------
# retopology + UVs
# --------------------------------------------------------------------------

def retopologise(source, target_faces):
    """QuadriFlow the mesh into even quads. Returns the new low-poly object."""
    low = source.copy()
    low.data = source.data.copy()
    low.name = source.name + "_low"
    bpy.context.scene.collection.objects.link(low)

    # The bake reads from the original material; the low-poly gets a fresh one.
    low.data.materials.clear()

    activate(low)
    bpy.ops.object.quadriflow_remesh(target_faces=target_faces,
                                     use_preserve_sharp=False,
                                     use_preserve_boundary=True)
    return low


def unwrap(obj, margin=0.02):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    # Smart Project is not as good as a human doing seams by hand, but it is
    # non-overlapping and consistent, which is what baking requires.
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


# --------------------------------------------------------------------------
# baking
# --------------------------------------------------------------------------

def make_bake_target(obj, name, size, non_color=False):
    """Attach a fresh image to the object's material as the active bake node."""
    img = bpy.data.images.new(name, size, size, alpha=False,
                              float_buffer=False, is_data=non_color)
    if non_color:
        img.colorspace_settings.name = "Non-Color"

    mat = obj.data.materials[0]
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    node.label = name
    mat.node_tree.nodes.active = node
    return img, node


def bake_pass(high, low, bake_type, samples, cage, **bake_kw):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.render.bake.use_selected_to_active = True
    scene.render.bake.cage_extrusion = cage
    scene.render.bake.margin = 8

    activate(low, also_select=(high,))
    bpy.ops.object.bake(type=bake_type, use_selected_to_active=True,
                        cage_extrusion=cage, **bake_kw)


def build_pbr_material(obj, maps):
    """Wire baked maps into a Principled BSDF."""
    mat = obj.data.materials[0]
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if not bsdf:
        return

    def node_for(key):
        return next((n for n in nt.nodes
                     if n.type == "TEX_IMAGE" and n.image is maps.get(key)), None)

    base = node_for("base")
    if base:
        nt.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])

    normal = node_for("normal")
    if normal:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(normal.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])

    # AO is exported as its own map rather than multiplied into base colour —
    # engines want to apply it themselves.


def save_maps(maps, out_dir, name):
    written = []
    for key, img in maps.items():
        if img is None:
            continue
        path = os.path.join(out_dir, f"{name}_{key}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        written.append(path)
    return written


# --------------------------------------------------------------------------
# transform + export
# --------------------------------------------------------------------------

def normalise_transform(obj, target_height):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    dz = max(c.z for c in corners) - min(c.z for c in corners)
    if dz <= 0:
        sys.exit("mesh has zero height — cannot normalise scale")

    factor = target_height / dz
    obj.scale = tuple(s * factor for s in obj.scale)
    bpy.context.view_layer.update()
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    obj.location.x -= (max(c.x for c in corners) + min(c.x for c in corners)) / 2
    obj.location.y -= (max(c.y for c in corners) + min(c.y for c in corners)) / 2
    obj.location.z -= min(c.z for c in corners)
    bpy.context.view_layer.update()
    activate(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return factor


def export(obj, out_dir, name, want_fbx):
    activate(obj)
    written = []

    glb = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True)
    written.append(glb)

    if want_fbx:
        fbx = os.path.join(out_dir, f"{name}.fbx")
        bpy.ops.export_scene.fbx(filepath=fbx, use_selection=True,
                                 apply_scale_options="FBX_SCALE_ALL",
                                 mesh_smooth_type="FACE",
                                 path_mode="COPY", embed_textures=True)
        written.append(fbx)
    return written


def build_lods(obj, out_dir, name, count, want_fbx):
    written = []
    for i in range(1, count + 1):
        ratio = 0.5 ** i
        copy = obj.copy()
        copy.data = obj.data.copy()
        copy.name = f"{name}_LOD{i}"
        bpy.context.scene.collection.objects.link(copy)

        activate(copy)
        mod = copy.modifiers.new("lod", "DECIMATE")
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)

        written += export(copy, out_dir, f"{name}_LOD{i}", want_fbx)
        print(f"    LOD{i}: {triangle_count(copy):,} tris")
        bpy.data.objects.remove(copy, do_unlink=True)
    return written


# --------------------------------------------------------------------------

def main():
    args = parse_args()
    name = args.name or os.path.splitext(os.path.basename(args.input))[0]
    out_dir = os.path.abspath(args.output_dir)
    os.makedirs(out_dir, exist_ok=True)

    print(f"\n[auto-finish] {args.input}\n")

    import_mesh(args.input)
    high, removed = join_and_clean(name + "_high")
    hi_tris = triangle_count(high)
    # glTF stores attributes per-corner, so importing splits vertices at every
    # UV and normal seam. Welding them back is expected, not a sign of a bad mesh.
    print(f"  1. cleaned      {hi_tris:,} tris, welded {removed:,} split/duplicate verts")

    if args.no_retopo:
        low = high
        print("  2. retopology   skipped (--no-retopo)")
    else:
        low = retopologise(high, args.faces)
        print(f"  2. retopology   {hi_tris:,} -> {triangle_count(low):,} tris (quads)")

    unwrap(low)
    print(f"  3. uv unwrap    {len(low.data.uv_layers)} layer, non-overlapping")

    # A material must exist before bake targets can be attached.
    if not low.data.materials:
        mat = bpy.data.materials.new(name + "_mat")
        mat.use_nodes = True
        low.data.materials.append(mat)

    maps = {}
    if low is not high:
        size = args.texture_size

        img, _ = make_bake_target(low, "normal", size, non_color=True)
        bake_pass(high, low, "NORMAL", args.bake_samples, args.cage_extrusion)
        maps["normal"] = img
        print(f"  4. normal bake  {size}px — high-frequency detail preserved")

        img, _ = make_bake_target(low, "base", size)
        scene = bpy.context.scene
        # Colour only: disabling the light passes is what de-lights the texture.
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
        bake_pass(high, low, "DIFFUSE", args.bake_samples, args.cage_extrusion)
        maps["base"] = img
        print(f"  5. colour bake  {size}px — lighting passes off (de-lit)")

        try:
            img, _ = make_bake_target(low, "ao", size, non_color=True)
            bake_pass(high, low, "AO", max(16, args.bake_samples), args.cage_extrusion)
            maps["ao"] = img
            print(f"  6. ao bake      {size}px")
        except RuntimeError as exc:
            print(f"  6. ao bake      skipped ({exc})")

        build_pbr_material(low, maps)
    else:
        print("  4-6. baking     skipped (no high-poly source to bake from)")

    if high is not low:
        bpy.data.objects.remove(high, do_unlink=True)

    factor = normalise_transform(low, args.height)
    print(f"  7. transform    x{factor:.4f} -> {args.height} m, feet Z=0, centred")

    for poly in low.data.polygons:
        poly.use_smooth = True

    low.name = name
    written = save_maps(maps, out_dir, name)
    written += export(low, out_dir, name, not args.no_fbx)
    if args.lods:
        written += build_lods(low, out_dir, name, args.lods, not args.no_fbx)

    print(f"\n  final: {triangle_count(low):,} tris, {len(maps)} texture map(s)\n")
    for path in written:
        print(f"    {os.path.basename(path):<34} {os.path.getsize(path)/1024:>8.0f} KB")
    print()


if __name__ == "__main__":
    main()
