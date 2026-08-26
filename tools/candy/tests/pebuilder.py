"""Re-export of the package's PE sample builder, for the test suite.

The implementation lives in ``candy/pesample.py`` so the coverage self-test can
build the same benign samples at runtime without importing from tests/.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from candy.pesample import build_pe, build_test_pe, build_version_resource  # noqa: F401,E402
