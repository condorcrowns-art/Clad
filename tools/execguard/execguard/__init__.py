"""ExecGuard — a free, open-source, user-mode tripwire for Roblox executors.

No kernel driver. No paid dependencies. It watches processes, files, network
connections and in-process modules, and tells you the moment something that
looks like an executor shows up.
"""
from __future__ import annotations

__all__ = ["VERSION"]

VERSION = "1.0.0"
