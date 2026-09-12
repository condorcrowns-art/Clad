--!strict
-- Blob.luau — the arena core. Eat, melt, bank, pop.
--
-- Two curves decide whether this game is fun, and they are the only two that
-- matter:
--
--   harvest(mass)  how much mass a blob can pick up per second
--   leak(mass)     how much mass a blob drips per second
--
-- harvest is LOGARITHMIC in mass. leak is SUPER-LINEAR in mass. They therefore
-- cross, exactly once, at a mass no amount of skill can pass. That crossing is
-- called the ceiling, and it is the entire design:
--
--   * nobody camps at the top, because the top is a net loss
--   * runs end themselves in 1-3 minutes with no round timer anywhere
--   * standing still is negative income, so AFK farming is impossible
--   * a leader's drip is a real food supply for everyone smaller
--
-- harvest is logarithmic because it is derived physically rather than picked:
-- a blob sweeps a corridor 2*radius wide at its own top speed, through pellets
-- at a fixed density. radius is logarithmic in mass and speed FALLS with mass,
-- so the corridor widens far slower than the body grows. That is agar.io's
-- actual geometry, written down honestly instead of curve-fitted.

local Config = require(script.Parent.Config)

local Blob = {}

-- ── Body ───────────────────────────────────────────────────────────────────

-- Logarithmic, matching GoobMath.size's reasoning: constant visual growth per
-- order of magnitude, so a 10x gain is always a visible step. Arena numbers
-- are small (tens to low thousands) so the constant is tuned for that band.
function Blob.radius(mass: number): number
    local m = math.max(1, mass)
    return Config.BLOB_RADIUS_BASE
        + Config.BLOB_RADIUS_K * math.log(m / Config.STARTING_MASS + 1)
end

-- Bigger is SLOWER. This is the one place the arena deliberately contradicts
-- Movement.luau, which keeps top speed near-flat so that progression never
-- locks you out of terrain. In here there is no terrain to lock you out of —
-- there is a predator — and a chase is only a chase if the fat one can be
-- outrun. Movement's acceleration and braking curves still layer on top, so a
-- heavy blob is slow AND clumsy, not merely slow.
function Blob.speed(mass: number): number
    local ratio = Config.STARTING_MASS / math.max(Config.STARTING_MASS, mass)
    local v = Config.BLOB_BASE_SPEED * ratio ^ Config.BLOB_SPEED_DECAY
    return math.max(Config.BLOB_MIN_SPEED, v)
end

-- ── The two curves ─────────────────────────────────────────────────────────

function Blob.harvestPerSecond(mass: number): number
    local corridor = 2 * Blob.radius(mass)
    return Config.PELLET_DENSITY
        * corridor
        * Blob.speed(mass)
        * Config.PELLET_VALUE
end

function Blob.leakPerSecond(mass: number): number
    local over = mass - Config.LEAK_GRACE
    if over <= 0 then
        return 0
    end
    return Config.LEAK_SCALE * over ^ Config.LEAK_EXPONENT
end

-- Net growth for a player harvesting at `efficiency` of the theoretical rate.
-- efficiency 1.0 is a player sweeping perfectly through dense pellets and
-- never backtracking; real play sits nearer 0.6-0.8.
function Blob.netPerSecond(mass: number, efficiency: number?): number
    local eff = efficiency or 1
    return Blob.harvestPerSecond(mass) * eff - Blob.leakPerSecond(mass)
end

-- The mass at which net growth hits zero. Found by bisection rather than
-- algebra because the curves are allowed to be retuned independently, and a
-- closed form would quietly become a lie the moment someone changed one.
function Blob.ceiling(efficiency: number?): number
    local lo, hi = Config.LEAK_GRACE, Config.LEAK_GRACE
    -- expand until we bracket the crossing
    for _ = 1, 60 do
        hi *= 1.5
        if Blob.netPerSecond(hi, efficiency) <= 0 then
            break
        end
        lo = hi
    end
    for _ = 1, 80 do
        local mid = (lo + hi) / 2
        if Blob.netPerSecond(mid, efficiency) > 0 then
            lo = mid
        else
            hi = mid
        end
    end
    return (lo + hi) / 2
end

-- ── Eating ─────────────────────────────────────────────────────────────────

-- You must be meaningfully bigger, not a rounding error bigger. Near-equal
-- blobs bounce off each other, which is what turns a crowd into a standoff
-- instead of a coin flip.
function Blob.canEat(mine: number, theirs: number): boolean
    return mine >= theirs * Config.EAT_RATIO
end

function Blob.eatGain(mine: number, theirs: number): number
    return theirs * Config.EAT_TRANSFER
end

-- ── Popping ────────────────────────────────────────────────────────────────
-- A pop splits the dead blob three ways:
--   scatter  -> pellets on the floor, immediately edible by anyone
--   congeal  -> a permanent lump of terrain, the island's memory
--   burned   -> deleted from the world forever
--
-- The burn is not an accident. It is the same sink that has kept total mass in
-- this game convergent since the first design pass: every transfer of value
-- destroys some of it, so the world cannot inflate no matter how long a server
-- runs or how many players farm it.
export type PopSplit = { kept: number, scatter: number, congeal: number, burned: number }

function Blob.popSplit(mass: number, keepFraction: number?): PopSplit
    local kept = mass * math.clamp(keepFraction or 0, 0, Config.POP_KEEP_MAX)
    local rest = mass - kept
    local scatter = rest * Config.POP_SCATTER
    local congeal = rest * Config.POP_CONGEAL
    return {
        kept = kept,
        scatter = scatter,
        congeal = congeal,
        burned = rest - scatter - congeal,
    }
end

-- ── Banking ────────────────────────────────────────────────────────────────
-- Slightly super-linear, so a player who holds on for one more dangerous lap
-- is paid for the risk. It is safe to be super-linear here precisely because
-- mass itself is capped by the ceiling: the exponent cannot run away, because
-- its input cannot.
function Blob.bankValue(mass: number): number
    if mass <= 0 then
        return 0
    end
    return math.floor(mass ^ Config.BANK_EXPONENT * Config.BANK_SCALE)
end

function Blob.bankSeconds(trinketSpeed: number?): number
    return Config.BANK_SECONDS / (1 + (trinketSpeed or 0))
end

-- ── Lumps ──────────────────────────────────────────────────────────────────
-- Congealed shells are terrain, but not forever-terrain: they melt slowly, so
-- an eight-hour server ends up interesting rather than solid.
function Blob.lumpRadius(mass: number): number
    return math.clamp(
        Config.LUMP_RADIUS_K * mass ^ 0.4,
        Config.LUMP_RADIUS_MIN,
        Config.LUMP_RADIUS_MAX
    )
end

function Blob.lumpDecay(mass: number, dt: number): number
    return math.max(0, mass - mass * Config.LUMP_DECAY_PER_SEC * dt)
end

return Blob
