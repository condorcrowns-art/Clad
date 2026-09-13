# GOOP — the agar.io rework

> One island. Everyone is a blob. You are always melting, and the island is
> made of everyone who lost.

This file supersedes the parts of `DESIGN.md` that describe five zones and a
collection-first loop. The scarcity engine, the age axis, the trade rails and
the monetisation wall all survive — they are moved underneath a real-time
arena instead of sitting on top of an idle game.

> ### READ THIS FIRST — two later reworks changed the spine below
>
> **Melting is OFF during a round** (`Config.LEAK_IN_ROUND = false`). Section 2
> describes the equilibrium-mass design the game shipped with; it is kept
> because the curve is kept and still tested, and turning it back on is one
> line. What replaced it is **rounds**: growth is unbounded, the clock ends it,
> and the job melting used to do — stopping a runaway leader — is done by other
> players, because every ability DEFLATES. A leader is brought down by being
> ganged up on rather than by arithmetic.
>
> **The collection game underneath is gone.** Roaming critters, the Snack Stand
> and the Egg Stand were the active, idle and expansion loops of the game the
> arena replaced. All three kept running after the rework — critters were still
> spawning labelled junk into live rounds, and the Snack Stand's panel was
> rendering across the season track. Feeding your Goob and hatching eggs both
> come out of finishing rounds now. There is exactly one source of mass in the
> world and it is playing.
>
> **Every round has a full field.** `Config.ROUND_FIELD_SIZE` contenders, bots
> making up whatever the humans do not. See section 9.

---

## 1. The two sentences

Everything below is downstream of these. If a change does not serve one of
them, it does not go in.

**"You're always melting."**
The bigger you are, the faster you leak mass. Nothing you are holding is
safe. You have to run to the Vault and bank it before it drips away or
somebody eats it.

**"The island is made of everyone who lost."**
When a blob pops, its shell congeals into the island as a permanent lump.
Two hours into a server the map is a landscape of other people's defeats —
ramps, walls, ledges, hiding spots. The players build the level.

A nine-year-old understands both in one read. Neither exists in agar.io,
in Grow a Garden, or in anything in the Roblox front page. That is the
answer to "something that has not been done before".

---

## 2. Why melting is the whole game

agar.io's real problem is that the top of the board is boring. Once you are
the biggest blob you are slow, safe, and nothing can threaten you, so the
interesting part of the match is over for everyone including you.

Melting deletes that state. The leak curve is super-linear against the eat
curve, so there is an **equilibrium mass** where what you can eat exactly
equals what you drip. Past it you shrink no matter how well you play.

That single fact produces every behaviour the game needs, for free:

| behaviour | why it happens |
|---|---|
| nobody camps at the top | the top is a net loss |
| big players are hunted | their leak is a visible trail of free food |
| short, repeatable runs | ~60–180s, with no round timer anywhere |
| a real skill ceiling | banking one second before equilibrium is the play |
| no AFK farming | standing still is negative income |
| new players are never locked out | the leader is always shedding mass into the world |

The leak is not a punishment. It is the food supply. Everything a big blob
drips is what a small blob eats — the economy is a closed loop where the
strong literally feed the weak, and they can see it happening.

---

## 3. The loop

1. **Spawn** small in the Shallows. No PvP there, low-value pellets.
2. **Eat** pellets and smaller blobs. `EAT_RATIO` = you must be 1.15x their
   mass to swallow them, so near-equals bounce and have to out-manoeuvre.
3. **Leak.** Above `LEAK_GRACE` mass you drip goop continuously. It becomes
   real pellets on the floor behind you. Your trail is your tax.
4. **Bank.** Roll into the Vault at the island's centre. Mass converts to
   Glob and you drop back to starting size. Banking takes `BANK_SECONDS` of
   standing still in the dish — the most dangerous three seconds in the game,
   because everyone can see you doing it.
5. **Pop** or repeat. If something bigger reaches you first you burst: your
   mass scatters as pellets, and your shell congeals into the terrain.

There is no match, no lobby, no countdown. You are always mid-run.

---

## 4. Powers — one button, big feeling

Every blob carries exactly **one** power. One button (Space / gamepad A /
a tap target). Every power costs a slice of your own mass, so using one is
always a real decision and never a free win.

| power | does | cost |
|---|---|---|
| **SPLIT** | fling half of yourself forward as a second blob you still steer; merges back after 8s | 50% mass |
| **DASH** | hard burst along your heading | 8% |
| **SLAM** | leap, then crash down: knocks nearby blobs away and shatters lumps into pellets | 12% |
| **HOOK** | grapple the nearest blob and reel — bigger reels smaller, smaller reels itself in | 10% |
| **SLICK** | leave an oil puddle; anyone crossing it loses steering for 2s | 6% |
| **MAGNET** | drag loose pellets from 40 studs for 4s | 5% |
| **BUBBLE** | 3s where nothing can eat you and you can eat nothing | 15% |
| **SPIKE** | 3s where anything that tries to eat you pops instead | 20% |

SPIKE is deliberately the most expensive: it is the tool that lets a small
blob delete a huge one, and it has to be a gamble, not a habit.

Powers are **earned by playing**. They are never sold. See §8.

---

## 5. Trinkets — three slots, small numbers

Passive modifiers, three equipped at a time, numbers kept small on purpose
so that a stacked player is maybe 20% better and never unbeatable.

| trinket | effect |
|---|---|
| Wax Coat | leak 12% slower |
| Snorkel | bank 25% faster |
| Greedy Tongue | pellets worth 10% more |
| Ballast | 15% less knockback |
| Hair Trigger | power cooldown −10% |
| Lucky Crumb | 5% of pellets become Golden Crumbs (5x) |
| Featherweight | +6% top speed while under 500 mass |
| Second Skin | keep 15% of your mass when popped |

They pull in different directions — Wax Coat wants long runs, Featherweight
wants short aggressive ones — so a loadout says something about how you play.

---

## 6. Crates — the gacha

Rolled with the existing Feedstock rarity machinery, which already has an
audited drop-weight model and a "no single drop is worth more than ~5% of the
whole progression" rule baked into its tests.

| crate | price | pool |
|---|---|---|
| **Goop Crate** | 1,000 Glob | common skins, trails |
| **Deep Crate** | 8,000 Glob | trinkets, rare skins |
| **Beta Crate** | Beta Pass tiers / Robux | cosmetic only, Beta-exclusive skins |

Deep Crates are the only paid-adjacent route to trinkets and they are bought
with **earned currency**. Nothing with a gameplay number on it is ever sold
for Robux.

---

## 7. Beta Season

Fifty tiers, free track and premium track, on the existing `Season.luau`
pacing (5,600 XP a tier, 7,000 daily cap → about forty days, so a committed
player finishes with room to spare and a casual one does not feel robbed).

Branding is the point: **"BETA SEASON — you were here first."** Season 0
never comes back, every skin in it is retired when it ends, and the game
says so on the pass screen. That is the only scarcity claim in the game that
costs nothing to honour.

---

## 8. The wall

Unchanged, and now load-bearing:

- **Robux buys**: skins, trails, the Beta Pass premium track, a Glob booster.
- **Robux never buys**: mass, powers, trinkets, bank rate, leak rate, or any
  number that touches a fight.

`Monetisation.violations()` fails the build if a paid item carries a gameplay
stat. That check stays, and now covers powers and trinkets too.

---

## 9. The island

One island. About 600 studs across. Three rings:

- **The Vault** (centre, raised dish) — bank here. Visible from everywhere.
- **The Flats** (the ring) — open feeding grounds, best pellets, full PvP.
- **The Shallows** (the rim) — no PvP, weak pellets, where you spawn and
  where the tutorial runs.

And **one** building, the Goop Shack, holding crates, the trinket bench, the
shop and the Standoff sign-up.

Crucially: **the Shack is a landmark, not a chore.** Every one of its
functions also lives on the bottom UI dock, one tap away, from anywhere on
the island. Nobody is ever made to walk across a map to press a button. That
is the direct answer to "why are the trade areas a pole".

The terrain is not hand-built past that. It is built by the players, one
congealed lump at a time, which is both the best idea in the design and an
honest accommodation of the fact that I am a much better systems programmer
than I am a set dresser.

## 10. Standoffs — the 1v1

Two blobs step into the ring. Both are normalised to identical mass, so the
fight is pure steering and power timing with none of the size advantage
either of them arrived with. Best of three, sudden death, optional Glob
wager. Winner takes the pot and a visible streak counter.

This is the existing Sumo Pit, re-shaped: equal mass is what makes it a
*test* rather than a formality.

---

## 11. What carries over

| kept | why |
|---|---|
| the tutorial | the user liked it; it now teaches eat → melt → bank |
| age tiers | the only unfarmable, un-dupeable rarity axis in the game |
| trading | still the social spine; now trades skins, trinkets and aged blobs |
| the census | global scarcity numbers are still what make rarity feel real |
| the burn on every transfer | still the reason total mass in the world converges |
| Glob | still the currency, now earned by banking instead of idling |

| cut | why |
|---|---|
| four zones + hub | one island, per the brief |
| idle income as the main earner | melting makes idling negative by design |
| signpost poles | replaced by UI dock navigation |

---

## 9. The field, and the edge

Two problems with the same shape: the island was bigger than the game being
played on it.

### Bots

An arena game with three people in it is not a small version of GOOP. It is a
different and much worse one — nobody to run from, nobody to gang up on, and a
leader that nothing brings down, because deflation is a catch-up mechanic that
needs a crowd. A new game has three players in it for weeks, so without bots
the first hour of this game's life is the version that does not work, shown to
exactly the people deciding whether to stay.

So the field is guaranteed. Twelve contenders, always: twelve humans means no
bots, one human means eleven, and an empty server still runs a real round with
a real board. Recomputed at the top of each round only, so somebody joining
mid-round is an extra contender rather than a reason to delete a bot that is
already out there being chased.

Bots are not scoreboard props. They eat pellets, they eat each other, they eat
you, you eat them, and your abilities deflate them — all of it resolved by
`ArenaService`, through the same `Blob.canEat` every player goes through.
`BotService` owns bodies and decisions and not one rule about mass. That split
is the load-bearing part: a bot with its own eating rule would teach the player
something that then fails them against a human.

They are also openly tagged as bots in the world and on the board. The
alternative is a lie the player catches the first time one walks into a wall,
and being caught lying costs more trust than the illusion was ever worth.

### Why there is now food at the edge

There was not, and it was deliberate, and it was wrong.

Pellets stopped short of the no-PvP rim, because food in a place nothing can
touch you is not a strategy — it is an exploit that beats the whole game. What
that produced was a 93-stud bare band around the entire island, over a third of
its area, with nothing in it and no reason to walk there. The island read as
smaller than it is.

The fix is not "spawn food there anyway". It is to **stop the rim being a place
you can live**. Safety out there is now a spendable meter: about twelve seconds,
draining while you are on the rim, refilling only while you are back inside, and
not starting at all until you have committed to the Flats once — so a new player
gets a real look at the island before anything can touch them. The rim is a fire
escape. Duck out, breathe, get back in.

With nothing left to exploit, food goes all the way to the shoreline, and the
edge becomes the most exposed ground on the map instead of the safest. Which is
what an edge should be.

---

## 10. Split, tethers and pods — the part that is not agar.io

Splitting is the genre's signature move. Copying it outright would make this a
worse agar with extra menus, so it is copied and then given one twist that
changes what the move is *for*.

### SPLIT

Three globlets leave your body and fly forward. They are **not** a second body
you steer — that needs a second controller and a camera that can hold two
things, and it is most of why blob clones feel terrible on a phone. They fly
out, hoover pellets, and come home. You stay one blob, one camera, one thumb.

The previous SPLIT shoved your whole body forward and booked half your mass for
a refund. That is a dash with a bill attached: nothing ever actually split.

### The tether — the twist

Every globlet stays joined to you by a visible strand of goo, and **any blob
that crosses a strand is deflated and slowed**.

So a split is not only a lunge. It is three lines drawn across the floor that
everybody else has to go around:

- Split **past** someone and you have fenced them in.
- Split **while running** and you have laid a wire behind you.
- Split **into a crowd** and you hit all of it at once.

That turns *"commit half of yourself to reach something"* into *"commit part of
yourself to **control space**"*, which is a different decision, and one I
cannot find in any other blob game.

The strand is deliberately weak per touch and on a per-victim cooldown. It is
area denial, not a damage engine: walking the length of one costs you a
noticeable slice, clipping the end of one barely registers. And it never cuts
its own builder — a fence that hurt the person who made it is a button nobody
would ever press.

### Spore pods

Standing hazards. Touch one while you are **big** and it bursts you into a
whole web of tethered globlets at once.

You lose nothing to the pod itself. That is the point: agar's viruses punish
the big by splitting them into edible chunks, and ours does not make you
edible, it makes you **committed**. For a few seconds your tethers are
everywhere, which is dangerous for everyone nearby — including whoever herded
you into it. Being popped by a pod is as often an opportunity as a punishment,
which is the difference between a hazard and a tax.

Below `POD_MIN_MASS` you pass straight through, so a pod field is ground a
small player can hide in and a big one cannot follow into. That is the whole
reason they are on the map.

### The hotbar

Three slots, fixed order, every round:

| Slot | What | Why it is not a choice |
|---|---|---|
| 1 | **DASH** | A game in this shape needs a lunge. Without one, half the situations on the island have no answer. |
| 2 | **SPLIT** | The mechanic the genre is named for. It used to sit near the top of the unlock ladder, which made it invisible for the first ten hours of play. |
| 3 | **Yours** | Earned by banking, or handed out by the Beta Season. This is the choice. |

Both fixed powers still cost mass, like everything else. A free button is a
button that gets held down.
