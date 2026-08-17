#!/usr/bin/env python3
"""Entry point for both ``python run.py`` and the PyInstaller build.

PyInstaller needs a real script file to freeze; this is it. Behaviour matches
``python -m execguard``: no arguments opens the GUI, arguments go to the CLI.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from execguard.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
