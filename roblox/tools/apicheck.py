#!/usr/bin/env python3
"""Validate Luau source against the real Roblox API dump."""
import json, re, sys, pathlib, collections

dump = json.load(open("apidump.json"))
classes = {c["Name"]: c for c in dump["Classes"]}
enums = {e["Name"]: {i["Name"] for i in e["Items"]} for e in dump["Enums"]}

def members(cls):
    """All members of a class including inherited."""
    out = {}
    seen = set()
    while cls and cls in classes and cls not in seen:
        seen.add(cls)
        c = classes[cls]
        for m in c["Members"]:
            out.setdefault(m["Name"], (m, cls))
        cls = c.get("Superclass")
    return out

def creatable(cls):
    tags = classes.get(cls, {}).get("Tags", []) or []
    return "NotCreatable" not in tags

files = [pathlib.Path(p) for p in sys.argv[1:]]
problems = collections.defaultdict(list)

ENUM_RE  = re.compile(r"\bEnum\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)")
NEW_RE   = re.compile(r'Instance\.new\(\s*"([A-Za-z0-9_]+)"')
SVC_RE   = re.compile(r'game:GetService\(\s*"([A-Za-z0-9_]+)"\s*\)')
# local x = Instance.new("Class")   /   local x: T = Instance.new("Class")
DECL_RE  = re.compile(r'\blocal\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*Instance\.new\(\s*"([A-Za-z0-9_]+)"')
ASSIGN_RE= re.compile(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=', re.M)

for f in files:
    src = f.read_text()
    lines = src.split("\n")

    # ---- enums ----
    for m in ENUM_RE.finditer(src):
        e, item = m.group(1), m.group(2)
        ln = src[:m.start()].count("\n") + 1
        if e not in enums:
            problems[f].append((ln, "ENUM", f"Enum.{e} does not exist"))
        elif item not in enums[e]:
            near = [x for x in enums[e] if x.lower().startswith(item.lower()[:3])][:4]
            problems[f].append((ln, "ENUM", f"Enum.{e}.{item} does not exist" + (f" (did you mean {near}?)" if near else "")))

    # ---- Instance.new classes ----
    for m in NEW_RE.finditer(src):
        cls = m.group(1)
        ln = src[:m.start()].count("\n") + 1
        if cls not in classes:
            problems[f].append((ln, "CLASS", f'Instance.new("{cls}") — no such class'))
        elif not creatable(cls):
            problems[f].append((ln, "CLASS", f'Instance.new("{cls}") — class is NotCreatable'))

    # ---- services ----
    for m in SVC_RE.finditer(src):
        cls = m.group(1)
        ln = src[:m.start()].count("\n") + 1
        if cls not in classes:
            problems[f].append((ln, "SERVICE", f'GetService("{cls}") — no such class'))
        elif "Service" not in (classes[cls].get("Tags") or []):
            problems[f].append((ln, "SERVICE", f'GetService("{cls}") — not tagged as a Service'))

    # ---- property writes on locals we can type ----
    varcls = {}
    for m in DECL_RE.finditer(src):
        varcls[m.group(1)] = m.group(2)

    for m in ASSIGN_RE.finditer(src):
        var, prop = m.group(1), m.group(2)
        if var not in varcls:
            continue
        cls = varcls[var]
        if cls not in classes:
            continue
        mem = members(cls)
        ln = src[:m.start()].count("\n") + 1
        if prop not in mem:
            problems[f].append((ln, "PROP", f"{cls}.{prop} does not exist"))
            continue
        info, owner = mem[prop]
        if info["MemberType"] != "Property":
            problems[f].append((ln, "PROP", f"{cls}.{prop} is a {info['MemberType']}, not a property"))
            continue
        tags = info.get("Tags") or []
        sec = info.get("Security")
        wsec = sec.get("Write") if isinstance(sec, dict) else sec
        if "ReadOnly" in tags:
            problems[f].append((ln, "PROP", f"{cls}.{prop} is READ-ONLY"))
        elif wsec and wsec != "None":
            problems[f].append((ln, "PROP", f"{cls}.{prop} write security is '{wsec}' — scripts cannot set it"))
        elif "NotScriptable" in tags:
            problems[f].append((ln, "PROP", f"{cls}.{prop} is NotScriptable"))
        elif "Deprecated" in tags:
            problems[f].append((ln, "WARN", f"{cls}.{prop} is DEPRECATED"))

total = 0
for f in files:
    if problems[f]:
        print(f"\n{f}")
        for ln, kind, msg in sorted(problems[f]):
            print(f"  {ln:>4}  [{kind}] {msg}")
            total += 1
print(f"\n{total} finding(s) across {len(files)} files")
