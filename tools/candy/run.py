#!/usr/bin/env python3
"""Entry point for both ``python run.py`` and the PyInstaller build.

PyInstaller needs a real script file to freeze; this is it. Behaviour matches
``python -m candy``: no arguments opens the GUI, arguments go to the CLI.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from candy.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
