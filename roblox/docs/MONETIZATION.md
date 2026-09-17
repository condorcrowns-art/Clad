# Monetisation

The goal you stated: **fund two other games**. That means predictable revenue
from a small player base, not a lottery ticket. Everything below is aimed at
revenue per player, not at squeezing whales you may never get.

## The three-tier ladder

### Tier 1 — Toys (9–19 R$)
`DATA NUKE (9)`, `BIG HEAD (12)`, `TRAIL (15)`, `SHATTER ALL (19)`

This tier exists because **most Roblox players are not "non-payers", they are
players with 8 leftover Robux**. Nothing in a typical sim is priced for them, so
they spend nothing. Price something at 9 and a meaningful slice of your player
base converts — and a converted player is dramatically more likely to buy again.

Design rules for this tier:
- It must be **visible to other players**. The Nuke announces your name
  server-wide. The Trail follows you. Big Head is obvious. Invisible toys don't sell.
- It must be **instant**. A button with a cooldown, not a passive stat.
- It must **not** break balance. The Nuke breaks nodes you could have broken
  anyway — it saves time, it doesn't print money.

Expect this tier to be ~55% of your *purchase count* and ~10% of revenue. That's
fine. Its real job is converting first-time spenders and generating spectacle.

### Tier 2 — Convenience (49–149 R$)
`TRIPLE HATCH (49)`, `AUTO-SWING (69)`, `AUTO-SELL (79)`, `2x BITS (99)`,
`+3 PET SLOTS (129)`, `LUCKY HATCH (149)`

These sell to players who are already invested. Every one removes a friction the
player has personally felt: the walk back to the Uplink, the clicking, the
3-pet cap they hit at hour two. **Never sell a convenience for a friction the
player hasn't experienced yet** — that's why the +3 Pet Slots prompt only fires
when they try to equip a fourth.

`+3 PET SLOTS` is the strongest single item in the game because it doubles the
pet lane, and the pet lane is where the multiplier actually lives.

### Tier 3 — Identity (399 R$)
`VIP`

1.5× Bits, 1.5× luck, +25% buffer, gold nametag, 22 walkspeed, and **offline
earnings** (8h cap at 25% rate). Offline earnings are VIP-exclusive on purpose:
give them to everyone and you undercut the active loop the entire game is built
on; give them to VIP and you have the single most compelling reason to buy the
top pass.

## Dev products (the repeatable lane)

| Product | Price | Note |
|---|---|---|
| Small / Large Bit Pack | 25 / 99 | **Scaled to the player's own best balance**, so it's never a game-ruining early buy or a worthless late one |
| 25 / 120 / 350 Shards | 99 / 399 / 999 | Bonus % rises with size |
| 2× Bits 15 min | 35 | Impulse boost |
| 3× Luck 10 min | 45 | Sold hardest right before a hatch |
| **SERVER 2× BITS 10 min** | 149 | **Announces the buyer's name to everyone** |

The server-wide boost is the highest-converting product type in the genre:
it's a status purchase and a gift at the same time, and other players thank the
buyer in chat, which is a conversion event for *them*.

## `ProcessReceipt` — read this before you ship

`GamepassService.processReceipt` is the highest-stakes function in the game.
The implementation here:
- Returns `NotProcessedYet` if the player left mid-purchase (Roblox re-fires it later)
- Records the `PurchaseId` in the player's **own save** before returning `Granted`
- Returns `PurchaseGranted` immediately if that `PurchaseId` was already recorded
- Force-saves right after granting, so a crash three seconds later can't eat it

Get this wrong and you either double-grant or fail to grant. Both cost you more
than the sale.

## Pricing checklist before launch

- [ ] Create every pass/product in the Creator Dashboard
- [ ] Paste real IDs into `Shared/Products.lua` (all `id = 0` right now)
- [ ] Verify each pass in a **published** place (gamepasses don't work in Studio solo test)
- [ ] Buy each product once on an alt and confirm exactly one grant
- [ ] Confirm the Nuke prompt fires for non-owners who press N
