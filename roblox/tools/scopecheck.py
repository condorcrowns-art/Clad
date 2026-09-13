#!/usr/bin/env python3
"""scopecheck.py — catch the trap that has taken down five builds of this game.

In Lua, `local function f()` only enters scope from its declaration DOWNWARD.
A call to `f()` written above that line does not fail to compile and does not
warn: it silently resolves to a nil GLOBAL. The server boots perfectly and then
dies the moment that path is first taken — on a join, on a pop, on a bank.

Every occurrence of this in the project so far has been found by a play-test or
by a scenario crashing, never by reading the code. This finds it in a second.

The check: for each file, record the line where every `local function NAME` is
declared, then look for calls to NAME that appear ABOVE it at a point where no
earlier declaration of that name exists. Calls inside the body of a function
declared later are fine at runtime as long as the CALL executes after the
declaration line runs, so we only flag calls at a lower line number than the
declaration — which is exactly the failure mode.
"""
import re
import sys

DECL = re.compile(r'^\s*local function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(')
# A call: name immediately followed by "(" and not preceded by . : or alnum.
CALL = re.compile(r'(?<![\w.:])([A-Za-z_][A-Za-z0-9_]*)\s*\(')

def scan(path):
    lines = open(path, encoding='utf-8').read().split('\n')
    decl = {}
    for i, line in enumerate(lines):
        m = DECL.match(line)
        if m and m.group(1) not in decl:
            decl[m.group(1)] = i

    findings = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('--'):
            continue
        if DECL.match(line):
            continue
        for m in CALL.finditer(line):
            name = m.group(1)
            at = decl.get(name)
            if at is not None and i < at:
                findings.append((i + 1, name, at + 1, stripped[:90]))
    return findings

def main(paths):
    total = 0
    for path in paths:
        for lineno, name, declared, text in scan(path):
            total += 1
            print(f'{path}')
            print(f'  {lineno:>5}  calls `{name}` but `local function {name}` '
                  f'is not declared until line {declared}')
            print(f'         {text}')
    print()
    print(f'{total} forward-reference(s) to a local function'
          + ('' if total == 0 else '  <- these resolve to nil GLOBALS at runtime'))
    return 1 if total else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
