# Balance

## The four numbers that are the game

1. **Sell cadence.** A player should fill their buffer every ~25–40 seconds in
   the early game. Faster feels weightless; slower feels like a job. This is set
   by `Buffers.capacity ÷ (Tools.power × zone multiplier × pet multiplier)`.
2. **Upgrade distance.** The next chip or buffer should be ~3 sells away, always.
   Chips are ~2.2× power for ~7× cost; buffers are priced just under the matching
   chip so players alternate tabs instead of tunnelling one.
3. **Zone distance.** Each sector costs ~9× the previous and pays ~2.3×. That
   ratio means a sector is never an instant buy and never a week-long wall.
4. **Rebirth wall.** `BASE_COST = 1,000,000`, `GROWTH = 3.4`. Rebirth #1 should
   land around hour 1–2. Each subsequent one roughly doubles wall-clock time
   until pet multipliers take over and flatten it.

## Multiplier stack

Every multiplier funnels through `StateService.multiplier`:

```
total = zone.mult
      × (1 + Σ equipped pet mult × variant scale)
      × 1.15^rebirths
      × (2 if 2x Bits pass)
      × (1.5 if VIP)
      × (2 if personal boost active)
      × (2 if server boost active)
```

Rebirth is **multiplicative (1.15^n)**, not additive, so rebirth #40 still
matters. Pets are **additive among themselves** then multiplied in, so equipping
a second good pet is a real upgrade rather than a rounding error.

## Luck is honest

`Util/Rng.weighted` raises each entry's weight to the power `1/luck` and
renormalises. Luck 1.0 leaves the distribution untouched; luck 2.0 square-roots
the weights, pulling the long tail up hard — but **order is preserved**, so a
mythic is never more likely than a legendary. This matters because players
datamine odds, and the fake version of luck (reroll on a bad result) is
discoverable and makes them feel cheated.

## Rarity ladder

Per egg: `5500 / 2700 / 1200 / 500 / 90 / 10` → roughly 55 / 27 / 12 / 5 / 0.9 / 0.1 %.

Variants roll on top: Chrome 1/40 (×3), Corrupt 1/400 (×12), Golden 1/2000 (×45).
The 1/2000 is deliberately brutal — it's what makes someone post a clip, and
clips are free marketing.

## Diagnosing a retention drop

| Symptom | Almost always | Fix |
|---|---|---|
| Quit in first 3 minutes | First sell took too long | Raise starter chip power or lower starter buffer |
| Quit at sector 3 | Classic mid-game wall | Cut `Zones.list[3].cost` ~30% |
| Nobody rebirths | Rebirth cost too high vs sector-4 income | Lower `Rebirths.BASE_COST` |
| Hatches feel bad | Rarity gap too narrow | Widen `W.common` → `W.legend` spread, don't add pets |
| Players idle at the Uplink | Sell walk too long | Move the pad, or push Auto-Sell harder |

Change **one** number, ship it, watch a day of data. Changing three at once
teaches you nothing.
