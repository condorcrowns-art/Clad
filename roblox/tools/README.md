# Verification harness

There is no Roblox runtime in CI, so these scripts pull a real **Luau v733
compiler** (via WebAssembly) and run the game's pure-logic modules against
stubbed Roblox globals. Every balance number quoted in the main README was
produced here, not estimated.

```bash
npm install @luau-rs/luau

node check.mjs ../src/**/*.luau          # compile all 16 modules
node sim.mjs ../src/shared tests.luau    # correctness assertions
node sim.mjs ../src/shared balance.luau  # 300-player time-to-Colossal sweep
node sim.mjs ../src/shared snack.luau    # idle-vs-active + runaway check
node sim.mjs ../src/shared egg.luau      # egg curve + buy-and-gulp exploit check
```

## Roblox API validation

The Luau compiler proves the code *parses*. It says nothing about whether
`Enum.Material.SmoothPlasic` is real or whether you are allowed to write
`Workspace.FilteringEnabled`. These two scripts check that against Roblox's own
published API dump:

```bash
curl -sSo apidump.json \
  https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/API-Dump.json

python3 apicheck.py ../src/**/*.luau   # enums, classes, services, property writes
python3 apicheck_tables.py             # helper property tables + the Rojo project
```

`apicheck.py` validates every `Enum.X.Y`, every `Instance.new("Class")`, every
`game:GetService(...)`, and every property write on a variable it can type —
flagging non-existent members, read-only members, deprecated ones, and anything
whose write security means a script cannot set it at all.

`apicheck_tables.py` covers what the first one structurally cannot see: the
property *tables* passed to the `part{}` and `Theme.label{}` helpers, the
`$properties` in `default.project.json`, and the properties `build_place.py`
writes into the place file. That second pass is the one that found all three
security-locked properties in this project.

## A trap worth knowing about

`GoobMath` falls back to `os.time()` when you don't pass an explicit `now`. A
synthetic goob with `bornAt = 0` therefore reads as **54 years old**, silently
multiplying its power by 12.

An earlier version of `snack.luau` mixed `now = 0` in one call with the default
in another, and reported that the snack economy was completely stalled —
purchases cost 4.4x what they should have. Nothing was wrong with the game.

**Always pass an explicit `now` in these scripts.**
