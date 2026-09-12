#!/usr/bin/env python3
"""
build_place.py — turn src/ into a double-clickable Roblox place file.

WHY THIS EXISTS
---------------
Rojo is the right long-term tool, but it needs Rust, a plugin install and a
running sync session. This script needs nothing but Python 3, and it produces a
.rbxlx that Roblox Studio opens directly. It follows the same folder-to-instance
rules Rojo uses, so the two pipelines produce the same tree and you can switch
between them at any time without touching a line of Luau.

FOLDER RULES (identical to Rojo)
--------------------------------
  foo.luau                -> ModuleScript "foo"
  foo.server.luau         -> Script "foo"
  foo.client.luau         -> LocalScript "foo"
  a_folder/               -> Folder "a_folder"
  a_folder/init.luau      -> the folder becomes a ModuleScript instead
  a_folder/init.server.luau -> the folder becomes a Script instead
  a_folder/init.client.luau -> the folder becomes a LocalScript instead

USAGE
-----
  python3 build_place.py                 # -> build/GulpAGoob.rbxlx
  python3 build_place.py --out mine.rbxlx
"""

from __future__ import annotations

import argparse
import pathlib
import sys
from xml.sax.saxutils import escape

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"

_ref = 0


def next_ref() -> str:
    """Referents only have to be unique within the file."""
    global _ref
    _ref += 1
    return f"RBX{_ref:06d}"


def cdata(text: str) -> str:
    """
    Wrap Luau source in CDATA. The one thing that can break a CDATA section is
    the literal terminator ']]>', which also happens to be legal Luau (a long
    string close followed by a comparison). We split the section rather than
    escaping, because ProtectedString demands the bytes survive exactly.
    """
    return "<![CDATA[" + text.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def script_instance(class_name: str, name: str, source: str, children: str = "") -> str:
    return (
        f'<Item class="{class_name}" referent="{next_ref()}">'
        f"<Properties>"
        f'<string name="Name">{escape(name)}</string>'
        f'<ProtectedString name="Source">{cdata(source)}</ProtectedString>'
        f"</Properties>"
        f"{children}"
        f"</Item>"
    )


def folder_instance(name: str, children: str = "") -> str:
    return (
        f'<Item class="Folder" referent="{next_ref()}">'
        f'<Properties><string name="Name">{escape(name)}</string></Properties>'
        f"{children}"
        f"</Item>"
    )


def classify(filename: str) -> tuple[str, str] | None:
    """Map a filename to (instance class, instance name), or None if not source."""
    for suffix, cls in (
        (".server.luau", "Script"),
        (".server.lua", "Script"),
        (".client.luau", "LocalScript"),
        (".client.lua", "LocalScript"),
        (".luau", "ModuleScript"),
        (".lua", "ModuleScript"),
    ):
        if filename.endswith(suffix):
            return cls, filename[: -len(suffix)]
    return None


def build_dir(path: pathlib.Path, name: str) -> str:
    """Render a directory as one Item, applying the init.* promotion rule."""
    init_class = None
    init_source = ""
    child_xml = []

    entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name))
    for entry in entries:
        if entry.is_dir():
            child_xml.append(build_dir(entry, entry.name))
            continue
        if not entry.is_file():
            continue

        info = classify(entry.name)
        if info is None:
            continue
        cls, base = info

        if base == "init":
            init_class = cls
            init_source = entry.read_text(encoding="utf-8")
        else:
            child_xml.append(
                script_instance(cls, base, entry.read_text(encoding="utf-8"))
            )

    children = "".join(child_xml)
    if init_class:
        return script_instance(init_class, name, init_source, children)
    return folder_instance(name, children)


def service(class_name: str, children: str = "", props: str = "") -> str:
    return (
        f'<Item class="{class_name}" referent="{next_ref()}">'
        f"<Properties>"
        f'<string name="Name">{class_name}</string>'
        f"{props}"
        f"</Properties>"
        f"{children}"
        f"</Item>"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the GULP A GOOB place file.")
    parser.add_argument("--out", default=str(ROOT / "build" / "GulpAGoob.rbxlx"))
    args = parser.parse_args()

    for required in ("shared", "server", "client"):
        if not (SRC / required).is_dir():
            print(f"error: missing src/{required}", file=sys.stderr)
            return 1

    shared = build_dir(SRC / "shared", "GoobShared")
    server = build_dir(SRC / "server", "GoobServer")
    client = build_dir(SRC / "client", "GoobClient")

    body = "".join(
        [
            service("Workspace", props='<bool name="FilteringEnabled">true</bool>'),
            service("Lighting"),
            service("ReplicatedStorage", shared),
            service("ServerScriptService", server),
            service(
                "StarterPlayer",
                f'<Item class="StarterPlayerScripts" referent="{next_ref()}">'
                f'<Properties><string name="Name">StarterPlayerScripts</string></Properties>'
                f"{client}"
                f"</Item>",
            ),
        ]
    )

    xml = (
        '<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" '
        'version="4">'
        f"{body}"
        "</roblox>"
    )

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(xml, encoding="utf-8")

    kb = out.stat().st_size / 1024
    print(f"built {out}  ({kb:.1f} KB, {_ref} instances)")
    print("open it in Roblox Studio:  File -> Open from File…")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
