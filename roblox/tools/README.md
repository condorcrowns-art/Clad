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
```

## A trap worth knowing about

`GoobMath` falls back to `os.time()` when you don't pass an explicit `now`. A
synthetic goob with `bornAt = 0` therefore reads as **54 years old**, silently
multiplying its power by 12.

An earlier version of `snack.luau` mixed `now = 0` in one call with the default
in another, and reported that the snack economy was completely stalled —
purchases cost 4.4x what they should have. Nothing was wrong with the game.

**Always pass an explicit `now` in these scripts.**
