"""Entry point: ``python -m execguard`` and the frozen ExecGuard.exe.

With no arguments the GUI starts (what a double-click should do); with
arguments the CLI takes over.
"""
from __future__ import annotations

import sys


def main() -> int:
    if len(sys.argv) == 1:
        try:
            from .gui import main as gui_main

            return gui_main(None)
        except Exception as exc:  # noqa: BLE001 - fall back to the console UI
            print(f"GUI unavailable ({exc}); starting the console monitor instead.\n")
            from .cli import main as cli_main

            return cli_main(["run"])
    from .cli import main as cli_main

    return cli_main()


if __name__ == "__main__":
    sys.exit(main())
