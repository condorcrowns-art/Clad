# Working on this repo

Read this first, whichever agent or person you are. It is short on purpose;
the long version is `roblox/HANDOFF.md`.

## What this repo is

Two unrelated things share it:

| path | what |
|---|---|
| `index.html`, `css/`, `js/` | GLITCHTOPIA, an older 2D browser game. Not under active work. |
| `roblox/` | **GOOP**, a Roblox arena game. This is the live project. |

## Start here, in this order

1. `roblox/HANDOFF.md` — the state of the project, the invariants, and the
   traps. Written specifically so a cold start loses nothing.
2. `roblox/GOOP.md` — the design, and why each piece exists.
3. `roblox/HOW_TO_TEST.md` — how to get it into Roblox Studio.

## Build and verify

```bash
cd roblox && python3 build_place.py     # -> build/GulpAGoob.rbxlx, open in Studio
cd roblox/tools && ./run_all.sh         # the whole verification suite
```

Requires `node` (>=18), `python3`, `bash`, and network access on the first run
(it fetches Roblox's API dump). `run_all.sh` exits non-zero when anything
fails — that was not always true, see below.

There is no Roblox runtime here, so the suite substitutes for one: it compiles
every module with the real Luau compiler, validates every Roblox API call
against the published API dump, boots the real server and client against a
stubbed engine and plays the game, and resolves true UI geometry against five
device viewports.

## The rules that are not negotiable

These were each learned by shipping the bug. Breaking one does not fail
loudly, which is exactly why they are written down.

1. **A suite must be able to fail.** Every test file with assertions calls
   `error()` when any fail. Nine of eleven once printed failures and exited
   zero, so the runner reported "ALL SUITES PASSED" over real failures for
   months. If you add a suite, make it fatal, and prove it by breaking an
   assertion and watching `run_all.sh` exit 1.

2. **Mutation-test anything you protect.** A test that has never failed is a
   test you have no reason to trust. Deliberately break the thing, confirm the
   suite catches it, restore. Several checks in here were caught passing for
   the wrong reason this way — including one that asked the very constant it
   was testing what the answer should be.

3. **Never let a test ask the code under test what the right answer is.**
   Assert against an independent number, or against a ratio, never against the
   constant you are validating.

4. **One owner per piece of state.** Two systems wrote the player's body size;
   two wrote the mastery counter. Both produced silent corruption, not errors.

5. **Every field the UI reads must be in the snapshot**, and the UI must
   actually be handed it. `client_test.luau` holds a required-field list.
   Missing either one renders a screen that draws perfectly and does nothing —
   invisible to any geometry test.

6. **Derived numbers stay derived.** `PELLET_TARGET` is computed from density
   and area. Hardcoding it silently moves the game's difficulty ceiling with
   nothing reporting it.

7. **`local function` only enters scope from its declaration downward.** A
   call above it resolves to a nil *global*: the server boots fine and dies
   later. This has taken down three builds.

8. **Nothing purchasable may touch a gameplay number.**
   `Monetisation.violations()` fails the build if it does.

## Conventions

- The map is generated from code, not stored in a `.rbxl`. Everything about
  this game is plain text in git, and it stays that way.
- Comments explain *why*, especially where a value was tuned or a trap was
  hit. Do not strip them; several are the only record of a bug that cost a day.
- `Config.luau` holds every tunable. No magic numbers elsewhere.
- Work happens on a branch, never on `main`.

## What the suite cannot tell you

It is not an emulator. There is no physics, no renderer, no audio. It proves
the code does not explode, the server rejects what it should, the balance
curves cross where they are supposed to, and every panel fits on screen.

**It cannot tell you the game is fun, that the sounds exist, or that anything
looks right.** Only Roblox Studio does that.
