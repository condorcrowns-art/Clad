--!strict
-- Movement.luau — mass IS handling.
--
-- THE WHOLE POINT: in Grow a Garden your number is a label on a crop. Here your
-- number is how you move. A 10x bigger Goob doesn't just read bigger — it takes
-- longer to get going, can't stop, hits harder, and reaches places a small one
-- cannot. Every value below exists to make that legible through the controller
-- rather than through a HUD.
--
-- Curves are logarithmic in mass, matching GoobMath.size, so each ORDER OF
-- MAGNITUDE is a felt step rather than the first thousand mass being everything.

local Config = require(script.Parent.Config)

local Movement = {}

-- ── Tunables ───────────────────────────────────────────────────────────────
Movement.BASE_SPEED = 34        -- studs/sec at starting mass
Movement.SPEED_PER_TIER = 4.2   -- per order of magnitude of mass
Movement.MAX_SPEED = 82

Movement.BASE_ACCEL = 95        -- studs/sec^2 at starting mass
Movement.ACCEL_FALLOFF = 0.34   -- higher = heavier Goobs labour more

Movement.BASE_BRAKE = 70
Movement.BRAKE_FALLOFF = 0.42   -- stopping degrades faster than starting

Movement.JUMP_SPEED = 52
-- Near-constant on purpose. If jump height fell with mass, every gap tuned for
-- a small Goob would become impassable later — progression would lock you OUT
-- of content for getting stronger. Weight is expressed through acceleration,
-- braking and momentum instead, where it reads as power rather than punishment.
Movement.JUMP_FALLOFF = 0.03

-- Dash is the skill layer and the reason the map can have gaps at all.
Movement.DASH_SPEED = 96
Movement.DASH_TIME = 0.22
Movement.DASH_CHARGES = 3
Movement.DASH_REFILL = 2.6      -- seconds per charge
Movement.AIR_DASHES = 1         -- exactly one. A correction, not flight.

Movement.GRAVITY_BOOST = 1.35   -- falls faster than default; arcade, not floaty

-- ── Curves ─────────────────────────────────────────────────────────────────

-- 0 at starting mass, 1 per 10x. This is the only input every curve uses.
function Movement.tier(mass: number): number
    return math.max(0, math.log10(math.max(1, mass / Config.STARTING_MASS)))
end

function Movement.topSpeed(mass: number): number
    return math.min(Movement.MAX_SPEED,
        Movement.BASE_SPEED + Movement.SPEED_PER_TIER * Movement.tier(mass))
end

function Movement.acceleration(mass: number): number
    return Movement.BASE_ACCEL / (1 + Movement.ACCEL_FALLOFF * Movement.tier(mass))
end

function Movement.braking(mass: number): number
    return Movement.BASE_BRAKE / (1 + Movement.BRAKE_FALLOFF * Movement.tier(mass))
end

function Movement.jumpSpeed(mass: number): number
    return Movement.JUMP_SPEED / (1 + Movement.JUMP_FALLOFF * Movement.tier(mass))
end

-- How far you travel after releasing the stick at top speed. This is the number
-- that actually communicates weight to the player, so the suite asserts on it.
function Movement.stoppingDistance(mass: number): number
    local v = Movement.topSpeed(mass)
    return (v * v) / (2 * Movement.braking(mass))
end

function Movement.timeToTopSpeed(mass: number): number
    return Movement.topSpeed(mass) / Movement.acceleration(mass)
end

-- Shove strength in the Sumo Pit: momentum, so heavy wins the exchange but
-- pays for it by being unable to stop before the edge.
function Movement.momentum(mass: number, speed: number): number
    return math.sqrt(math.max(1, mass / Config.STARTING_MASS)) * speed
end

-- The server's cheat ceiling. Generous — network jitter and dash stacking are
-- legitimate — but a teleport is many times this.
function Movement.maxPlausibleSpeed(mass: number): number
    return math.max(Movement.topSpeed(mass), Movement.DASH_SPEED) * 1.9
end

return Movement
