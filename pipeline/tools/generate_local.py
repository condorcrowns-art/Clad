#!/usr/bin/env python3
"""
Generate a 3D mesh from prepped multi-view images, on your own GPU.

Tuned for mid-range cards. On 8GB (RTX 4060, 3070, 2080) the full-size
checkpoints will not fit, so this defaults to a mini/turbo shape model with
fp16, CPU offload and attention slicing, and picks the checkpoint from the VRAM
it actually finds.

    python3 pipeline/tools/generate_local.py work/prepped/ -o work/generated.glb

If it runs out of memory the error message tells you exactly which knob to turn
rather than just failing.

--------------------------------------------------------------------------
NOT YET RUN ON REAL HARDWARE. The image-to-3D projects move quickly and their
entry points change between releases. If the import or the call signature below
is wrong for the version you install, the fix is local to CHECKPOINTS and
`load_pipeline` — check the project's current README and adjust. Everything
downstream (auto_finish, render_check) is independent of this file.
--------------------------------------------------------------------------
"""

import argparse
import glob
import os
import sys

VIEW_KEYS = ["front", "back", "left", "right"]

# Checkpoint choice is driven by VRAM. Keeping them in one place so there is a
# single spot to edit when a project renames or supersedes a checkpoint.
CHECKPOINTS = {
    "mini": "tencent/Hunyuan3D-2mini",     # smallest, for <10GB
    "multiview": "tencent/Hunyuan3D-2mv",  # multi-view conditioned
    "standard": "tencent/Hunyuan3D-2",     # full size, wants 12GB+
}


def vram_gb():
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        return torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    except Exception:
        return None


def pick_checkpoint(available_gb, override=None):
    if override:
        return override
    if available_gb is None:
        sys.exit("No CUDA GPU visible. Use pipeline/generate_colab.ipynb instead,\n"
                 "or check that you have the CUDA build of torch installed:\n"
                 "  python3 pipeline/tools/gpu_check.py")
    if available_gb < 10:
        print(f"  {available_gb:.1f}GB VRAM — using the mini multi-view checkpoint")
        return CHECKPOINTS["multiview"]
    print(f"  {available_gb:.1f}GB VRAM — using the multi-view checkpoint")
    return CHECKPOINTS["multiview"]


def load_views(folder):
    from PIL import Image

    views = {}
    for key in VIEW_KEYS:
        matches = glob.glob(os.path.join(folder, f"{key}.*"))
        if matches:
            views[key] = Image.open(matches[0]).convert("RGBA")
    if not views:
        sys.exit(f"no view images found in {folder} — run prep_views.py first")

    missing = [k for k in VIEW_KEYS if k not in views]
    if missing:
        print(f"  ! missing {'/'.join(missing)} — those surfaces will be invented")
    return views


def load_pipeline(checkpoint, low_vram):
    """Load the generator with memory-saving options for small cards."""
    try:
        from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
    except ImportError:
        sys.exit(
            "hy3dgen not installed.\n\n"
            "Install the generator first — see pipeline/README.md, section\n"
            "'Local generation'. In short: clone the project, pip install its\n"
            "requirements, then pip install -e it.")

    import torch

    pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        checkpoint, torch_dtype=torch.float16)

    if low_vram:
        # Offloading keeps only the active submodule resident, which is what
        # makes an 8GB card viable. It costs speed, not quality.
        for method in ("enable_model_cpu_offload", "enable_sequential_cpu_offload"):
            if hasattr(pipeline, method):
                getattr(pipeline, method)()
                print(f"  enabled {method}")
                break
        else:
            pipeline.to("cuda")
        if hasattr(pipeline, "enable_attention_slicing"):
            pipeline.enable_attention_slicing()
            print("  enabled attention slicing")
    else:
        pipeline.to("cuda")

    return pipeline


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("views", help="folder of prepped views from prep_views.py")
    ap.add_argument("-o", "--output", default="work/generated.glb")
    ap.add_argument("--checkpoint", default=None, help="override the auto choice")
    ap.add_argument("--steps", type=int, default=50, help="inference steps")
    ap.add_argument("--octree", type=int, default=None,
                    help="geometry detail; auto-scaled to VRAM if unset")
    ap.add_argument("--guidance", type=float, default=5.0)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    print("\n[generate]")
    gb = vram_gb()
    checkpoint = pick_checkpoint(gb, args.checkpoint)
    low_vram = gb is not None and gb < 12

    # Octree resolution is the main VRAM lever after the checkpoint itself.
    octree = args.octree or (256 if low_vram else 380)
    print(f"  checkpoint {checkpoint}")
    print(f"  octree     {octree}, steps {args.steps}")

    views = load_views(args.views)
    print(f"  views      {', '.join(sorted(views))}")

    pipeline = load_pipeline(checkpoint, low_vram)

    kwargs = dict(image=views, num_inference_steps=args.steps,
                  octree_resolution=octree, guidance_scale=args.guidance)
    if args.seed is not None:
        import torch
        kwargs["generator"] = torch.Generator("cuda").manual_seed(args.seed)

    try:
        mesh = pipeline(**kwargs)[0]
    except RuntimeError as exc:
        if "out of memory" not in str(exc).lower():
            raise
        sys.exit(
            f"\nOut of VRAM at octree={octree}.\n\n"
            "Try, in order:\n"
            f"  1. --octree {max(128, octree - 64)}\n"
            "  2. --checkpoint tencent/Hunyuan3D-2mini\n"
            "  3. close other GPU applications (browsers count)\n"
            "  4. fall back to pipeline/generate_colab.ipynb on Colab's free T4\n")

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    mesh.export(args.output)
    size_mb = os.path.getsize(args.output) / (1024 ** 2)
    print(f"\n  wrote {args.output}  ({size_mb:.1f} MB)")
    print("\n  next:  python3 pipeline/tools/auto_finish.py "
          f"--input {args.output} --output-dir work/finished/\n")


if __name__ == "__main__":
    main()
