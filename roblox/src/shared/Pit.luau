--!strict
-- Pit.luau — rules for the Sumo Pit.
--
-- TWO RULES THAT ARE NOT NEGOTIABLE, and the reason PvP exists at all here:
--
--   1. It is OPT-IN. You roll in. Nothing drags you there, and nothing outside
--      the ring can be taken from you. Grow a Garden became a comfort game for
--      millions precisely because no one can touch your things.
--   2. You stake GLOB, never Goobs. A nine-year-old who loses a week-old Goob
--      to a stranger does not come back — and a Goob that can be taken by force
--      is a Goob nobody will ever trade.
--
-- Mass is an advantage AND a liability: heavy wins the exchange but cannot stop
-- before the edge, so a small Goob wins by baiting an overcommit.

local Movement = require(script.Parent.Movement)

local Pit = {}

Pit.CENTRE = Vector3.new(-40, 6, 430)
Pit.START_RADIUS = 96
Pit.MIN_RADIUS = 18
Pit.FLOOR_Y = 6

Pit.MIN_PLAYERS = 2
Pit.MAX_PLAYERS = 8
Pit.LOBBY_SECONDS = 20
Pit.MATCH_SECONDS = 120
Pit.SHRINK_START = 15          -- grace before the ring closes
Pit.ELIMINATION_DROP = 24      -- studs below the floor before you're out

-- Entry is a flat, small stake rather than a percentage, so a whale cannot buy
-- a lopsided pot and a newcomer is never priced out of trying it.
Pit.STAKE_SECONDS = 45         -- expressed as seconds of your own income
Pit.HOUSE_CUT = 0              -- no rake: this is a player-vs-player pot

function Pit.radiusAt(elapsed: number): number
    if elapsed <= Pit.SHRINK_START then return Pit.START_RADIUS end
    local span = math.max(1, Pit.MATCH_SECONDS - Pit.SHRINK_START)
    local t = math.clamp((elapsed - Pit.SHRINK_START) / span, 0, 1)
    -- Ease in: the ring barely moves early and closes hard at the end, so
    -- matches resolve instead of stalemating.
    local eased = t * t
    return Pit.START_RADIUS + (Pit.MIN_RADIUS - Pit.START_RADIUS) * eased
end

function Pit.isInside(position: Vector3, elapsed: number): boolean
    if position.Y < Pit.FLOOR_Y - Pit.ELIMINATION_DROP then return false end
    local flat = Vector3.new(position.X - Pit.CENTRE.X, 0, position.Z - Pit.CENTRE.Z)
    return flat.Magnitude <= Pit.radiusAt(elapsed)
end

-- Collision response. The shove each side receives is proportional to the
-- OTHER's momentum, so being heavy is only an advantage while you are moving.
function Pit.shove(massA: number, velA: Vector3, massB: number, velB: Vector3)
    local pA = Movement.momentum(massA, velA.Magnitude)
    local pB = Movement.momentum(massB, velB.Magnitude)
    local total = math.max(1, pA + pB)
    -- Each side keeps a share of the exchange inversely to its own contribution.
    return (pB / total), (pA / total)
end

Pit.SHOVE_IMPULSE = 140        -- studs/sec at a full-share exchange

function Pit.stakeFor(incomePerSecond: number): number
    return math.max(10, incomePerSecond * Pit.STAKE_SECONDS)
end

-- Winner takes the pot. With no rake, everything staked comes back out, which
-- keeps the Pit economy-neutral: it moves Glob between players rather than
-- printing or burning it.
function Pit.payout(stakes: { number }): number
    local total = 0
    for _, s in ipairs(stakes) do total += s end
    return total * (1 - Pit.HOUSE_CUT)
end

return Pit
