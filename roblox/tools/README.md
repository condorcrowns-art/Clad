# Verification harness

There is no Roblox runtime in CI, so this project verifies itself three
different ways. Every number and claim in the main README was produced here.

```bash
./run_all.sh        # everything, in order
```

## 1. Does it compile?

`check.mjs` pulls a real **Luau v733 compiler** (via WebAssembly) and compiles
all 16 modules. Catches syntax errors. Nothing more.

## 2. Do the APIs exist?

Compiling proves the code *parses*. It says nothing about whether
`Enum.Material.SmoothPlasic` is real, or whether you are allowed to write
`Workspace.FilteringEnabled`.

```bash
curl -sSo apidump.json \
  https://raw.githubusercontent.com/MaximumADHD/Roblox-Client-Tracker/roblox/API-Dump.json

python3 apicheck.py ../src/**/*.luau   # enums, classes, services, property writes
python3 apicheck_tables.py             # helper property tables + the Rojo project
```

`apicheck.py` validates every `Enum.X.Y`, every `Instance.new("Class")`, every
`game:GetService(...)` and every property write on a variable it can type —
flagging members that do not exist, are read-only, are deprecated, or whose
write security means a script simply cannot set them.

**`apicheck_tables.py` is the one that earned its keep.** The first pass
returned zero findings and I nearly stopped there. Every real problem was in
the places it structurally could not see: the property *tables* passed to the
`part{}` and `Theme.label{}` helpers, the `$properties` in
`default.project.json`, and what `build_place.py` writes into the place file.
All three security-locked properties were hiding there.

## 3. Does it actually RUN?

The first two say nothing about nil dereferences, wrong argument order, signals
wired to nothing, or state machines that deadlock. Those need execution.

`roblox_env.luau`, `roblox_game.luau` and `roblox_services.luau` implement
Instances, parenting, signals, a virtual-clock scheduler, remotes, DataStores
and the datatypes the game uses — enough to boot **the real server scripts**,
join fake players and drive the whole loop.

```bash
node integration.mjs .. integration.luau   # play the game
node integration.mjs .. adversarial.luau   # attack the game
```

`integration.luau` walks a full session: boot → join → catch critters → buy a
snack → hatch an egg → gulp → complete a two-player trade → disconnect and
verify the save. `adversarial.luau` does what an exploiter does — teleport
catching, racing two players for one drop, garbage over every remote, gulping
Goobs you do not own, buying with no money, hostile rename input, trading from
across the map, walking out mid-trade after confirming, plus DataStore and
text-filter outages and a 20-minute soak.

### This is not an emulator

CFrame is translation-only, physics does not exist, and tweens apply instantly.
It cannot tell you the game *feels* right. It tells you the code does not
explode and the server rejects what it should — which is the part that was
otherwise completely unverified.

## Are the tests real?

A test that cannot fail is worth nothing, so the protections were deliberately
broken to confirm each test detects it:

| Mutation | Result |
|---|---|
| Remove the catch distance check | `FAIL teleport-catch from 900 studs was REJECTED` |
| Remove the mid-trade zone re-check | `FAIL trade did NOT complete after a player left` |
| Let a failed DataStore load hand out a blank profile | `FAIL a failed load KICKS` |

All three flipped to FAIL, then the source was restored. Worth repeating
whenever you add a check here.

## A trap worth knowing about

`GoobMath` falls back to `os.time()` when you do not pass an explicit `now`. A
synthetic goob with `bornAt = 0` therefore reads as **54 years old**, silently
multiplying its power by 12.

An earlier `snack.luau` mixed `now = 0` in one call with the default in
another, and reported the snack economy was completely stalled — purchases
appeared to cost 4.4x what they should. Nothing was wrong with the game.

**Always pass an explicit `now` in these scripts.**
