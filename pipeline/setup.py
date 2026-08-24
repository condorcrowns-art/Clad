#!/usr/bin/env python3
"""
One-time setup for the character pipeline. Works on Windows, macOS and Linux.

    python pipeline/setup.py

Everything installed here is free. Blender does not need to be installed
separately — bpy is Blender as a Python library.
"""

import os
import subprocess
import sys
import textwrap

# bpy wheels are published per Python minor version, and lag new releases.
SUPPORTED_BPY_PYTHON = [(3, 11)]


def head(text):
    print(f"\n-- {text} --")


def pip_install(*packages):
    """Install into the interpreter running this script, not whatever `pip` resolves to."""
    cmd = [sys.executable, "-m", "pip", "install", "--quiet", "--upgrade", *packages]
    return subprocess.run(cmd).returncode == 0


def main():
    print("=" * 64)
    print("  character pipeline setup")
    print("=" * 64)

    version = sys.version_info
    print(f"\npython {version.major}.{version.minor}.{version.micro}")
    print(f"  {sys.executable}")

    head("image tools (Pillow, rembg)")
    if not pip_install("Pillow", "rembg", "onnxruntime"):
        sys.exit("failed to install the image tools — see the pip output above")

    head("blender as a python module (bpy)")
    if not pip_install("bpy"):
        supported = " or ".join(f"{a}.{b}" for a, b in SUPPORTED_BPY_PYTHON)
        print(textwrap.dedent(f"""
            Could not install bpy for Python {version.major}.{version.minor}.

            bpy ships wheels only for specific Python versions ({supported} is the
            safest choice) and lags new releases by a while. Two ways forward:

              1. Install Python {supported} and run this script with it, e.g.
                     py -{supported.split(' or ')[0]} pipeline/setup.py        (Windows)
                     python{supported.split(' or ')[0]} pipeline/setup.py      (macOS/Linux)

              2. Install Blender normally from https://blender.org and run the
                 tools through it instead of through the module:
                     blender -b -P pipeline/tools/auto_finish.py -- --input ...
            """).strip())
        sys.exit(1)

    head("verifying")
    ok = True
    for label, importer in (
        ("bpy", lambda: __import__("bpy").app.version_string),
        ("Pillow", lambda: __import__("PIL").__version__),
        ("rembg", lambda: (__import__("rembg"), "ok")[1]),
    ):
        try:
            print(f"  {label:<9} {importer()}")
        except Exception as exc:
            print(f"  {label:<9} FAILED: {exc}")
            ok = False
    if not ok:
        sys.exit("setup incomplete — see the failures above")

    for sub in ("refs", "prepped", "generated", "finished", "qa", "renders"):
        os.makedirs(os.path.join("work", sub), exist_ok=True)

    head("machine check")
    subprocess.run([sys.executable,
                    os.path.join("pipeline", "tools", "gpu_check.py")])

    print(textwrap.dedent(f"""
        ready. working folders created under work/ (gitignored).

        On this machine the interpreter to use is:
            {sys.executable}
        so if `python3` is not found, substitute `python` in the commands.

        next: put your reference images in work/refs/ and ask Claude to build
        the model.
        """))


if __name__ == "__main__":
    main()
