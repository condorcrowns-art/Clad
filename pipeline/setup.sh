#!/usr/bin/env bash
# One-time setup for the character pipeline. Everything installed here is free.
set -euo pipefail

echo "== character pipeline setup =="

PY=$(command -v python3 || true)
if [ -z "$PY" ]; then
    echo "python3 not found. Install Python 3.11 first: https://python.org" >&2
    exit 1
fi

VER=$("$PY" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "python $VER at $PY"

echo
echo "-- image tools (Pillow, rembg) --"
"$PY" -m pip install --quiet --upgrade Pillow rembg onnxruntime

echo "-- blender as a python module (bpy) --"
# bpy wheels are published per Python minor version. If this fails, the usual
# cause is a Python version with no matching wheel yet.
if ! "$PY" -m pip install --quiet bpy; then
    cat >&2 <<MSG

  Could not install bpy for Python $VER.

  Either install a Python version with a published bpy wheel (3.11 is the
  safest choice), or install Blender normally from https://blender.org and
  run the tools through it instead:

      blender -b -P pipeline/tools/auto_finish.py -- --input ... 

MSG
    exit 1
fi

echo
echo "-- verifying --"
"$PY" - <<'CHECK'
import sys
ok = True
try:
    import bpy
    print(f"  bpy       {bpy.app.version_string}")
except Exception as exc:
    print(f"  bpy       FAILED: {exc}"); ok = False
try:
    import PIL
    print(f"  Pillow    {PIL.__version__}")
except Exception as exc:
    print(f"  Pillow    FAILED: {exc}"); ok = False
try:
    import rembg
    print("  rembg     ok")
except Exception as exc:
    print(f"  rembg     FAILED: {exc}"); ok = False
sys.exit(0 if ok else 1)
CHECK

mkdir -p work/{refs,prepped,generated,finished,qa,renders}
echo
echo "ready. working folders created under work/ (gitignored)."
echo "next: put your reference images in work/refs/ and ask Claude to build the character."
