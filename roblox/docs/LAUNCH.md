# Launch checklist

## Before you publish

- [ ] Studio → Game Settings → Security → **Enable Studio Access to API Services**
- [ ] Studio → Game Settings → Security → **Allow HTTP Requests** (not required
      today, but you'll want it for a Discord webhook later)
- [ ] Set max players to **12–20**. A sim feels dead at 40-player caps with 8
      players in it, and alive at 12 with 8. This is a real retention lever.
- [ ] Paste real gamepass/product IDs into `Shared/Products.lua`
- [ ] Test on a **published** place — gamepasses do not work in solo Studio test
- [ ] Rejoin test: earn, leave, rejoin, confirm your Bits/pets survived
- [ ] Two-device test: same account on two servers should be refused by the
      session lock, not duped

## Icon and thumbnails (this is most of your CTR)

The game's page does more for CCU than any in-game system. Budget real effort:
- **Icon**: one readable subject, high contrast, no small text. It renders at
  ~150px in the sort.
- **Thumbnails**: 3–5. First one should show the biggest number in the game and
  a rare familiar. Add your latest code as text on one of them — it converts
  browsers into redeemers into sessions.
- **Title**: include the word players search. Update it with `[UPDATE]` or
  `[NEW EGG]` tags on every push; the algorithm and players both respond to it.

## Update cadence

Ship something every **3–5 days** for the first month. It does not have to be
big:
- A new egg (one table entry in `Pets.lua` + one in the egg list)
- A new sector (one table entry in `Zones.lua`)
- A new code (one entry in `Codes.lua`) — announce it, that's a session
- A new toy pass at 9–19 R$

Each of those is a ~10 minute change in this codebase, which is exactly why it's
built as tables instead of hand-placed parts.

## Free acquisition that actually works

1. **Codes on the thumbnail.** Costs nothing, converts.
2. **Rare-pull announcements.** Already built — every 1/2000 pull shouts
   server-wide. Players clip those.
3. **A Discord/social with a code per update.** The code *is* the ad.
4. **Update tags in the title.** Free, and the sort notices.

## What to watch in Analytics

- **D1 retention** — if under 12%, your first 3 minutes are wrong, not your endgame
- **Average session length** — if under 8 minutes, the sell cadence is off
- **Revenue per paying user** vs **paying user %** — if the % is low, your cheap
  tier isn't cheap or visible enough; if RPPU is low, the top of the ladder is thin

## Funding the other two games

Realistic framing: a sim with a solid loop and a bottom-heavy ladder tends to
land somewhere around **0.5–2 R$ per player-visit** once the store is tuned.
The lever you control is visits, and the lever on visits is the icon plus
update cadence. Treat the first month as buying data: ship, watch D1, change one
number, ship again.
