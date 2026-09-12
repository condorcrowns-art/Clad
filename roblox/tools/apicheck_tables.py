#!/usr/bin/env python3
"""Check property TABLES passed to helper constructors, plus the Rojo project."""
import json, re, pathlib, collections

dump = json.load(open("apidump.json"))
classes = {c["Name"]: c for c in dump["Classes"]}

def members(cls):
    out, seen = {}, set()
    while cls and cls in classes and cls not in seen:
        seen.add(cls); c = classes[cls]
        for m in c["Members"]:
            out.setdefault(m["Name"], (m, cls))
        cls = c.get("Superclass")
    return out

def verdict(cls, prop):
    mem = members(cls)
    if prop not in mem:
        return f"{cls}.{prop} DOES NOT EXIST"
    info, _ = mem[prop]
    if info["MemberType"] != "Property":
        return f"{cls}.{prop} is a {info['MemberType']}"
    tags = info.get("Tags") or []
    sec = info.get("Security")
    wsec = sec.get("Write") if isinstance(sec, dict) else sec
    if "ReadOnly" in tags:      return f"{cls}.{prop} is READ-ONLY"
    if wsec and wsec != "None": return f"{cls}.{prop} write security '{wsec}' — scripts cannot set it"
    if "NotScriptable" in tags: return f"{cls}.{prop} is NotScriptable"
    if "Deprecated" in tags:    return f"{cls}.{prop} is DEPRECATED"
    return None

ROOT = pathlib.Path("/home/user/Clad/roblox")

# helper name -> the class its table configures
HELPERS = {
    "part":         "Part",
    "Theme.label":  "TextLabel",
}

findings = []

def keys_in_table(text):
    """Top-level `Key =` names inside one balanced {...} literal."""
    return re.findall(r"[{,]\s*([A-Za-z_][A-Za-z0-9_]*)\s*=", text)

def balanced(src, start):
    depth, i = 0, start
    while i < len(src):
        if src[i] == "{": depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0: return src[start:i+1]
        i += 1
    return ""

for f in sorted(ROOT.glob("src/**/*.luau")):
    src = f.read_text()
    for helper, cls in HELPERS.items():
        for m in re.finditer(re.escape(helper) + r"\(\s*\{", src):
            body = balanced(src, src.index("{", m.start()))
            ln = src[:m.start()].count("\n") + 1
            for k in keys_in_table(body):
                v = verdict(cls, k)
                if v: findings.append((str(f.relative_to(ROOT)), ln, v))

# Rojo project $properties
proj = json.load(open(ROOT / "default.project.json"))
def walk(node, cls=None):
    c = node.get("$className", cls)
    for k, v in node.items():
        if k == "$properties" and c:
            for prop in v:
                ver = verdict(c, prop)
                if ver: findings.append(("default.project.json", 0, ver))
        elif isinstance(v, dict) and not k.startswith("$"):
            walk(v, None)
walk(proj["tree"])

# The .rbxlx builder writes FilteringEnabled directly too
bp = (ROOT / "build_place.py").read_text()
for m in re.finditer(r'name="([A-Za-z_][A-Za-z0-9_]*)"', bp):
    prop = m.group(1)
    if prop in ("Name", "Source"): continue
    v = verdict("Workspace", prop)
    if v: findings.append(("build_place.py", bp[:m.start()].count("\n")+1, v))

for f, ln, msg in findings:
    print(f"  {f}:{ln}  {msg}")
print(f"\n{len(findings)} finding(s)")
