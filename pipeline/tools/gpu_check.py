#!/usr/bin/env python3
"""
Report what this machine can actually do, and recommend settings to match.

Run this before anything else. It checks the GPU, VRAM, CUDA and Blender, then
tells you which image-to-3D checkpoint will fit and what flags to use.

    python3 pipeline/tools/gpu_check.py
"""

import os
import shutil
import subprocess
import sys


def line(char="-", width=64):
    print(char * width)


def query_nvidia():
    """Ask nvidia-smi directly — it works whether or not torch is installed."""
    if not shutil.which("nvidia-smi"):
        return None
    try:
        out = subprocess.run(
            ["nvidia-smi",
             "--query-gpu=name,memory.total,driver_version",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=20, check=True).stdout
    except (subprocess.SubprocessError, OSError):
        return None

    gpus = []
    for row in out.strip().splitlines():
        parts = [p.strip() for p in row.split(",")]
        if len(parts) >= 2:
            try:
                gpus.append({"name": parts[0], "vram_mb": int(parts[1]),
                             "driver": parts[2] if len(parts) > 2 else "?"})
            except ValueError:
                continue
    return gpus or None


def check_torch():
    try:
        import torch
    except ImportError:
        return None
    return {
        "version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "cuda_version": getattr(torch.version, "cuda", None),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }


def check_blender():
    try:
        import bpy
    except ImportError:
        return None, []
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from blender_util import report_devices
    return bpy.app.version_string, report_devices()


def recommend(vram_gb):
    """Map available VRAM onto a concrete plan."""
    if vram_gb is None:
        return [
            "No Nvidia GPU detected.",
            "",
            "Generation: use Colab's free T4 (pipeline/generate_colab.ipynb) or a",
            "Hugging Face Space in the browser. Both free.",
            "Finishing and QA still run locally on CPU — slower, but they work.",
        ]
    if vram_gb < 6:
        return [
            f"{vram_gb:.0f}GB VRAM — below what image-to-3D models need.",
            "",
            "Generation: use Colab's free T4 instead.",
            "Finishing/QA: your GPU will still accelerate Blender baking.",
        ]
    if vram_gb < 10:
        return [
            f"{vram_gb:.0f}GB VRAM — enough for the smaller checkpoints, not the full ones.",
            "",
            "Generation: use a mini/turbo shape checkpoint, fp16, with CPU offload",
            "and attention slicing enabled. Full-size checkpoints will run out of",
            "memory. Texture generation is heavier than shape generation — if it",
            "OOMs, generate shape locally and do texture work in Colab.",
            "",
            "Finishing/QA: OptiX acceleration, comfortably fast.",
            "",
            "Suggested flags:",
            "  auto_finish.py  --faces 6000 --texture-size 2048",
        ]
    if vram_gb < 16:
        return [
            f"{vram_gb:.0f}GB VRAM — comfortable for most checkpoints.",
            "",
            "Generation: standard checkpoints in fp16 should fit. Drop to a mini",
            "variant only if you hit out-of-memory errors.",
            "",
            "Suggested flags:",
            "  auto_finish.py  --faces 8000 --texture-size 4096",
        ]
    return [
        f"{vram_gb:.0f}GB VRAM — plenty for anything in this pipeline.",
        "",
        "Generation: full-size checkpoints at high octree resolution.",
        "",
        "Suggested flags:",
        "  auto_finish.py  --faces 12000 --texture-size 4096",
    ]


def main():
    print()
    line("=")
    print("  character pipeline — machine check")
    line("=")

    gpus = query_nvidia()
    print("\nGPU")
    vram_gb = None
    if gpus:
        for g in gpus:
            gb = g["vram_mb"] / 1024
            print(f"  {g['name']}  —  {gb:.1f} GB VRAM  (driver {g['driver']})")
        vram_gb = max(g["vram_mb"] for g in gpus) / 1024
    else:
        print("  no Nvidia GPU detected (nvidia-smi absent or returned nothing)")

    print("\nPyTorch")
    torch_info = check_torch()
    if not torch_info:
        print("  not installed — needed only for local generation, not for")
        print("  finishing or QA")
    else:
        print(f"  torch {torch_info['version']}, CUDA {torch_info['cuda_version']}")
        print(f"  cuda available: {torch_info['cuda_available']}"
              + (f"  ({torch_info['device']})" if torch_info["device"] else ""))
        if gpus and not torch_info["cuda_available"]:
            print("  ! a GPU is present but torch cannot see it — you likely have")
            print("    the CPU-only torch build. Reinstall the CUDA build.")

    print("\nBlender")
    version, devices = check_blender()
    if not version:
        print("  bpy not installed — run: bash pipeline/setup.sh")
    else:
        print(f"  bpy {version}")
        if devices:
            for backend, name in devices:
                print(f"  compute: {backend} — {name}")
        else:
            print("  compute: CPU only (baking and QA renders will be slower)")

    print()
    line()
    print("  recommendation")
    line()
    for row in recommend(vram_gb):
        print(f"  {row}" if row else "")
    print()


if __name__ == "__main__":
    main()
