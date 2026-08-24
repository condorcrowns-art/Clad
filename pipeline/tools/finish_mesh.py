#!/usr/bin/env python3
"""
Turn a raw generated mesh into a game-ready asset.

Image-to-3D generators output a mesh with the right shape and almost nothing
else right: arbitrary scale, arbitrary origin, no smoothing, loose vertices,
degenerate faces, and inconsistent normals. Engines and buyers both care about
those. This script fixes the mechanical problems so your hand-finishing time
goes on the parts that actually need judgement.

What it does:
  * normalises scale to a real-world height (1 unit = 1 metre)
  * drops the character's feet to Z=0 and centres it on the origin
  * welds duplicate vertices and deletes loose/degenerate geometry
  * recalculates normals outward and applies angle-based smooth shading
  * optionally builds decimated LOD meshes
  * exports GLB and FBX

    blender -b -P pipeline/tools/finish_mesh.py -- \\
        --input raw/generated.glb \\
        --output-dir finished/ \\
        --height 1.8 --lods 3

Also runs against the `bpy` PyPI module without a Blender install:
    pip install bpy && python3 pipeline/tools/finish_mesh.py --input ... 
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
    sys.exit("Needs Blender:  blender -b -P finish_mesh.py -- ...   (or: pip install bpy)")


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="generated .glb/.obj/.fbx")
    ap.add_argument("--output-dir", default="finished", help="where to write exports")
    ap.add_argument("--name", default=None, help="base name for exports")
    ap.add_argument("--height", type=float, default=1.8,
                    help="target character height in metres")
    ap.add_argument("--lods", type=int, default=0,
                    help="number of decimated LODs to also export")
    ap.add_argument("--smooth-angle", type=float, default=35.0,
                    help="auto-smooth angle in degrees")
    ap.add_argument("--merge-distance", type=float, default=0.0001,
                    help="weld threshold in local units")
    ap.add_argument("--no-fbx", action="store_true", help="skip the FBX export")
    return ap.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_mesh(path):
    if not os.path.isfile(path):
        sys.exit(f"input file not found: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj":
        # Blender 4.x renamed the OBJ importer.
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=path)
        else:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext == ".ply":
        if hasattr(bpy.ops.wm, "ply_import"):
            bpy.ops.wm.ply_import(filepath=path)
        else:
            bpy.ops.import_mesh.ply(filepath=path)
    else:
        sys.exit(f"unsupported input format: {ext}")


def meshes():
    return [o for o in bpy.context.scene.objects if o.type == "MESH"]


def join_all(objs, name):
    """Generators often emit several disconnected chunks; treat them as one."""
    if len(objs) <= 1:
        if objs:
            objs[0].name = name
        return objs[0] if objs else None

    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def apply_transforms(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def clean_geometry(obj, merge_distance):
    """Weld doubles, drop loose and degenerate geometry, fix normals."""
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)

    before_v, before_f = len(bm.verts), len(bm.faces)

    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=merge_distance)
    # Faces and edges with no area/length confuse normal calculation and
    # tank the look of smooth shading.
    bmesh.ops.dissolve_degenerate(bm, dist=merge_distance, edges=bm.edges[:])
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    after_v, after_f = len(bm.verts), len(bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    return {
        "verts_removed": before_v - after_v,
        "faces_removed": before_f - after_f,
        "verts": after_v,
        "faces": after_f,
    }


def dimensions(obj):
    """World-space bounding box size, independent of object transform."""
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    xs = [c.x for c in corners]
    ys = [c.y for c in corners]
    zs = [c.z for c in corners]
    return (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)), (min(xs), min(ys), min(zs))


def normalise_transform(obj, target_height):
    """Scale to a real-world height, then sit the feet on the ground plane."""
    (dx, dy, dz), _ = dimensions(obj)
    if dz <= 0:
        sys.exit("mesh has zero height — cannot normalise scale")

    factor = target_height / dz
    obj.scale = (obj.scale.x * factor, obj.scale.y * factor, obj.scale.z * factor)
    bpy.context.view_layer.update()
    apply_transforms(obj)

    # Re-measure after scaling, then move so the lowest point is at Z=0 and
    # the character is centred on X/Y.
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    min_z = min(c.z for c in corners)
    mid_x = (max(c.x for c in corners) + min(c.x for c in corners)) / 2
    mid_y = (max(c.y for c in corners) + min(c.y for c in corners)) / 2

    obj.location.x -= mid_x
    obj.location.y -= mid_y
    obj.location.z -= min_z
    bpy.context.view_layer.update()
    apply_transforms(obj)

    return factor


def shade_smooth(obj, angle_degrees):
    """Angle-based smoothing: soft surfaces, hard edges where they belong."""
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True

    # Blender 4.1 removed mesh.use_auto_smooth in favour of a modifier.
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(angle_degrees)
    else:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_degrees))
        except (AttributeError, RuntimeError):
            pass  # smoothing is cosmetic; never fail the run over it


def triangle_count(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    n = len(bm.faces)
    bm.free()
    return n


def export(obj, out_dir, name, want_fbx):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    written = []

    glb = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True)
    written.append(glb)

    if want_fbx:
        fbx = os.path.join(out_dir, f"{name}.fbx")
        bpy.ops.export_scene.fbx(
            filepath=fbx,
            use_selection=True,
            apply_scale_options="FBX_SCALE_ALL",
            mesh_smooth_type="FACE",
            # Pack textures into the FBX so the buyer gets one self-contained
            # file rather than a mesh with broken texture paths.
            path_mode="COPY",
            embed_textures=True,
        )
        written.append(fbx)

    return written


def build_lods(obj, out_dir, name, count, want_fbx):
    """Export progressively decimated copies for engine LOD slots."""
    written = []
    for i in range(1, count + 1):
        ratio = 0.5 ** i
        copy = obj.copy()
        copy.data = obj.data.copy()
        copy.name = f"{name}_LOD{i}"
        bpy.context.scene.collection.objects.link(copy)

        mod = copy.modifiers.new("lod", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        bpy.context.view_layer.objects.active = copy
        bpy.ops.object.modifier_apply(modifier=mod.name)

        written += export(copy, out_dir, f"{name}_LOD{i}", want_fbx)
        print(f"  LOD{i}: {triangle_count(copy):,} tris (ratio {ratio})")

        bpy.data.objects.remove(copy, do_unlink=True)
    return written


def main():
    args = parse_args()
    name = args.name or os.path.splitext(os.path.basename(args.input))[0]
    out_dir = os.path.abspath(args.output_dir)
    os.makedirs(out_dir, exist_ok=True)

    print(f"\n[finish] {args.input}")

    reset_scene()
    import_mesh(args.input)

    objs = meshes()
    if not objs:
        sys.exit("no mesh found in the input file")
    print(f"  imported {len(objs)} object(s)")

    obj = join_all(objs, name)
    apply_transforms(obj)

    stats = clean_geometry(obj, args.merge_distance)
    print(f"  cleaned: -{stats['verts_removed']} verts, -{stats['faces_removed']} faces")

    (dx, dy, dz), _ = dimensions(obj)
    factor = normalise_transform(obj, args.height)
    print(f"  scaled x{factor:.4f} -> {args.height} m tall, feet on Z=0")

    shade_smooth(obj, args.smooth_angle)

    tris = triangle_count(obj)
    print(f"  final: {stats['verts']:,} verts / {tris:,} tris")

    written = export(obj, out_dir, name, not args.no_fbx)
    if args.lods:
        written += build_lods(obj, out_dir, name, args.lods, not args.no_fbx)

    print("\n  written:")
    for path in written:
        print(f"    {path}  ({os.path.getsize(path)/1024:.0f} KB)")
    print()


if __name__ == "__main__":
    main()
