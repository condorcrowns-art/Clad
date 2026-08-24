"""Shared Blender helpers for the character pipeline.

Kept in one module so the GPU-selection logic has a single source of truth —
baking and QA rendering both want it and they must agree.
"""

import sys


def configure_cycles_device(scene, prefer_gpu=True, verbose=True):
    """Point Cycles at the fastest available device.

    Order is OptiX, then CUDA, then HIP, then oneAPI, then CPU. On an Nvidia RTX
    card OptiX uses the RT cores and is substantially faster than CUDA for both
    baking and rendering, so it is tried first and CUDA is the fallback for older
    cards where OptiX is unavailable.

    Returns a short human-readable description of what was selected.
    """
    import bpy

    scene.render.engine = "CYCLES"

    if not prefer_gpu:
        scene.cycles.device = "CPU"
        return "CPU (forced)"

    addon = bpy.context.preferences.addons.get("cycles")
    if not addon:
        scene.cycles.device = "CPU"
        return "CPU (cycles preferences unavailable)"

    prefs = addon.preferences

    # Not every build exposes every backend; ask rather than assume.
    try:
        supported = {i.identifier for i in
                     prefs.bl_rna.properties["compute_device_type"].enum_items}
    except (KeyError, AttributeError):
        supported = set()

    for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        if backend not in supported:
            continue
        try:
            prefs.compute_device_type = backend
            prefs.refresh_devices()
        except (TypeError, AttributeError):
            continue

        devices = [d for d in prefs.devices if d.type == backend]
        if not devices:
            continue

        # Enable the accelerators; leave the CPU device off. Mixing CPU and GPU
        # in Cycles can be slower than GPU alone once tile sync is accounted for.
        for device in prefs.devices:
            device.use = device.type == backend

        scene.cycles.device = "GPU"
        names = ", ".join(d.name for d in devices)
        if verbose:
            print(f"  [gpu] using {backend}: {names}")
        return f"{backend} ({names})"

    scene.cycles.device = "CPU"
    if verbose:
        print("  [gpu] no GPU backend found — falling back to CPU")
    return "CPU (no GPU detected)"


def report_devices():
    """Print every compute device Blender can see. Used by gpu_check.py."""
    import bpy

    addon = bpy.context.preferences.addons.get("cycles")
    if not addon:
        print("  cycles preferences unavailable")
        return []

    prefs = addon.preferences
    try:
        supported = [i.identifier for i in
                     prefs.bl_rna.properties["compute_device_type"].enum_items]
    except (KeyError, AttributeError):
        supported = []

    found = []
    for backend in supported:
        try:
            prefs.compute_device_type = backend
            prefs.refresh_devices()
        except (TypeError, AttributeError):
            continue
        for device in prefs.devices:
            if device.type == backend:
                found.append((backend, device.name))
    return found
