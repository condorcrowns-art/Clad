# GULP A GOOB — the design spine

## The problem with v3

The economy works. The game does not exist yet.

A player spawns, sees a blob parked on a pad like a houseplant, and runs into
junk. The Goob — the thing the entire game is named after, the thing you grow,
trade and destroy — is **furniture**. It sits somewhere else while you play.

Every symptom follows from that:

| Symptom | Root cause |
|---|---|
| "The area is so bland" | Nothing to *do* in space, so space is decoration |
| "Needs to feel more alive" | No physics, no consequence, no other players mattering |
| "Needs unique movement" | You're a default Roblox avatar in a game about a ball |
| "What's the goal?" | Numbers rise forever with no terminus |
| "Is there PvP?" | No reason for another player to exist except trading |
| "Needs a way to make money" | Nothing to spend on, nothing to chase |

One decision fixes most of it.

---

## The spine: **your Goob is your body**

You don't stand next to your Goob. **You get in it and roll.**

Mass stops being an abstract score and becomes **physics you feel**:

| Mass | What it feels like |
|---|---|
| Tiny | Twitchy, fast to turn, bounces off everything, can't cross the big gaps |
| Mid | The sweet spot — quick and heavy enough to matter |
| Colossal | Slow to start, impossible to stop, smashes through barriers nothing else can |

This is the part no other game in the genre has. In *Grow a Garden* your number
is a label on a crop. Here **your number is how you move.** A 10x bigger Goob
doesn't just say a bigger number — it handles differently, takes different
lines, reaches places a small one can't, and loses fights it used to win.

### Movement identity: roll, dash, launch

- **Roll** — momentum-based. Acceleration and braking scale with mass.
- **Dash** — a short burst on a 3-charge meter that refills over ~8s. This is
  the skill expression: dash to cross a gap, to catch a fleeing critter, to
  shove another player in the arena, to save a bad line off a ramp.
- **Air dash** — exactly one per airtime. Not flight. It's a *correction*, which
  is what makes ramps readable instead of frustrating.
- **No flying up.** You asked for this and you're right: free vertical movement
  deletes level design. Height is earned off ramps and launch pads.

The dash meter is the whole reason the world can have gaps, ledges and shortcuts
at all. Without it every surface has to be walkable and the map stays flat —
which is precisely why it currently *is* flat.

---

## The goal: **Ascension**

Numbers that only ever rise have no terminus, so nothing is ever an achievement.

At **Colossal**, you can **Ascend**: your Goob is consumed — permanently, on the
same rule as everything else in this game — and you receive:

- A **Crest** worn on your nameplate, numbered by how many times you've ascended
- A small permanent multiplier that carries into every future Goob
- The next run is faster, so the loop tightens rather than lengthening

This gives the game the three things it lacked at once: a **terminus**, a
**visible flex** other players can read across a server, and a **third sink**
consistent with the thesis. Ascension isn't a reset — it's the scoreboard.

**The point of the game, in one line:** *get big enough to ascend, as many times
as you can, and be the one holding the oldest Goobs when you do.*

---

## PvP: the Sumo Pit, and why it's opt-in only

Momentum plus a ledge is a complete game. Two rolling balls, a shrinking ring,
last one in takes the pot.

But **nobody can touch your stuff outside the Pit.** *Grow a Garden* became a
comfort game for millions precisely because there is no raiding, and the
audience here is nine years old. A nine-year-old who loses an hour of progress
to a stranger does not come back.

So the Pit is:
- **Opt-in.** You walk in. Nothing drags you there.
- **Staked in Glob, never in Goobs.** You cannot lose a Goob to another player.
  Ever. That's what keeps the trading economy liquid and the game kind.
- **Mass is an advantage and a liability.** Heavy shoves harder but can't stop.
  A small Goob wins by dodging and letting a whale overcommit off the edge.

---

## Making money — the honest version

**Cosmetics and convenience only. Never power, and above all never the economy.**

The moment Robux buys Secrets, mass, or age, the trading economy dies —
the same failure the balance sim already caught once, arriving through the
cash register instead.

| Safe to sell | Why |
|---|---|
| Goob skins, trails, eye styles, plot décor | Pure expression; this game is *built* for visible flex |
| Extra Goob slots (beyond the 8 cap) | Convenience, not power — slots hold, they don't generate |
| 2× Glob | Glob only buys snacks and eggs, both of which are already deliberately weak |
| Season pass (cosmetic track) | Retention, no economy contact |
| Ascension crest variants | Flex on an achievement you still had to earn |

| Never sell | Why |
|---|---|
| Secrets, or any luck boost that reaches them | They are the collectible layer; buying them kills trading |
| Mass, power, or age | Age's entire value is that it cannot be bought |
| Auction/market fee skips | Pay-to-win on the one system that needs to stay fair |

### Season pass

A seasonal track earning XP from *playing* — catches, ascensions, Pit wins,
trades. Free track plus premium. Cosmetics only. Seasons also rotate which
Secrets can spawn, which makes last season's Secrets genuinely finite — the
scarcity thesis, expressed as a live-service calendar.

---

## Guilds and clans — **not yet, and here's why**

You said don't add it if it doesn't make sense. It doesn't, yet.

Guilds solve *coordination*. This game currently has nothing to coordinate:
no raids, no shared objectives, no group content. A guild system now would be a
roster, a chat tab and a name tag — surface area with no payoff, in a game whose
core loop still hasn't been validated by real players.

**When it would make sense:** if Pit team modes or a server-wide "feed the
Colossal Goob" event ship and land. Then a Crew with a shared stash and a weekly
target has something to actually do. Build the reason first, the roster second.

---

## The world: from flat plane to somewhere worth rolling

Zones with distinct physics, not just distinct colours — because with momentum
movement, *surface* is gameplay:

- **The Hub** — market, trade ring, leaderboard, ascension altar. Signposted
  with big readable icons, because the current map tells you nothing.
- **The Scrapyard** — common junk, ramps and half-pipes. The learning zone.
- **The Slickfield** — low friction. You slide. Fast lines, hard stops.
- **The Deep** — rarest spawns, sheer drops, only reachable with a dash chain.
  Risk you opt into.

Plus what makes a place feel inhabited: ambient particles, drifting clouds,
zone-tinted light, critters that visibly flee, and **signage with icons** at
every interactive point.

---

## Sequenced, not shotgunned

Shipping all of this at once would produce a broad, shallow game. Order by
"what changes the felt experience most per unit of risk":

1. **Roll + dash + the rebuilt world** — the feel and the blandness, together.
   Nothing else matters if moving isn't fun.
2. **Ascension** — gives the numbers a terminus.
3. **Sumo Pit** — gives other players a reason to exist beyond trading.
4. **Season pass + cosmetics** — retention and revenue, once there's a game worth
   retaining people in.
5. **Crews** — only if 3 lands.

Everything above 3 is speculative until real players touch 1 and 2.
