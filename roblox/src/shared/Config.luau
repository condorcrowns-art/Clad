--!strict
-- Config.luau — every tunable number in GULP A GOOB lives here.
-- Design rule: no magic numbers anywhere else in the codebase. If you want to
-- rebalance the game, you should only ever have to open this file.

local Config = {}

Config.GAME_NAME = "GULP A GOOB"
Config.DATASTORE_KEY = "GoobProfile_v1"
Config.CENSUS_STORE = "GoobCensus_v1"

-- ── Core economy ───────────────────────────────────────────────────────────
-- Currency is "Glob" 💧. It is produced passively by digestion, NOT by selling
-- Goobs. Selling is deliberately impossible: the only way a Goob leaves the
-- world is by being fed to another Goob. That is the entire scarcity engine.
Config.STARTING_GLOB = 250
Config.STARTING_MASS = 10

-- Passive income: glob/sec = MASS ^ INCOME_EXPONENT * INCOME_SCALE
-- Sub-linear on purpose, so a 1000x bigger Goob earns ~63x more, not 1000x.
-- This keeps day-1 players inside the same order of magnitude as whales.
Config.INCOME_EXPONENT = 0.60
Config.INCOME_SCALE = 0.35

-- Offline earnings are capped so logging in daily beats hoarding a week.
Config.OFFLINE_CAP_SECONDS = 8 * 60 * 60
Config.OFFLINE_EFFICIENCY = 0.55 -- you earn 55% rate while away

-- ── Size / power scale ─────────────────────────────────────────────────────
-- Physical size is LOGARITHMIC in mass, not a cube root.
--
-- A cube root sounds right and is wrong: it saturates. With a cube root and a
-- 180-stud clamp, every Goob past ~1e6 mass renders at exactly the same size,
-- which is reached within a few hours of play. From then on the entire
-- "you can see how strong someone is" promise is dead, and a 1e6 Goob is
-- visually indistinguishable from a 1e20 one.
--
-- A log curve instead gives roughly constant visual growth per ORDER OF
-- MAGNITUDE, so every tenfold gain is a visible step forever. The clamp is
-- still there, but it is not reached until ~1e24, which no player will see.
Config.SIZE_BASE = 4          -- studs, at STARTING_MASS
Config.SIZE_LOG_K = 0.78      -- studs of growth per natural-log unit of mass
Config.SIZE_MAX = 180         -- hard clamp, for sanity only
Config.COLOSSAL_MASS = 5e6    -- mass at which the Colossal crown unlocks

-- Why 5e6: it is 20x the largest single drop in the game, which is what keeps
-- one lucky catch from skipping the whole progression. At the measured ~73
-- mass per catch and a catch every ~4 seconds that is roughly 75 hours of pure
-- active play — but gulping and trading shortcut it enormously, which is the
-- point. Colossal should be a TRADING milestone, not a grinding one.

-- Feeding: the Goob does not gain mass instantly. Food enters the STOMACH and
-- digests over time — this is the offline hook, and it is also the anti-bot
-- measure (you cannot burst-feed 10,000 items into a number).
Config.DIGEST_RATE = 0.08     -- fraction of stomach converted to mass per second
Config.STOMACH_SOFT_CAP = 40  -- items; beyond this digestion slows
Config.STOMACH_OVERFULL_PENALTY = 0.45

-- ── Age: the unfarmable rarity axis ────────────────────────────────────────
-- Age is measured in REAL seconds since the Goob was first hatched, and it
-- travels with the Goob through trades. You cannot bot it, dupe it, or buy it.
-- It is the only stat in the game with a genuinely fixed supply curve.
Config.AGE_TIERS = {
    { name = "Fresh",    seconds = 0,                 mult = 1.00, color = Color3.fromRGB(180, 255, 190), emoji = "🌱" },
    { name = "Ripe",     seconds = 60 * 60 * 24,      mult = 1.25, color = Color3.fromRGB(160, 235, 255), emoji = "💧" },
    { name = "Seasoned", seconds = 60 * 60 * 24 * 3,  mult = 1.60, color = Color3.fromRGB(170, 190, 255), emoji = "🔷" },
    { name = "Ancient",  seconds = 60 * 60 * 24 * 7,  mult = 2.20, color = Color3.fromRGB(215, 165, 255), emoji = "🔮" },
    { name = "Fossil",   seconds = 60 * 60 * 24 * 30, mult = 3.50, color = Color3.fromRGB(255, 195, 120), emoji = "🦴" },
    { name = "Mythic",   seconds = 60 * 60 * 24 * 90, mult = 6.00, color = Color3.fromRGB(255, 140, 150), emoji = "👑" },
    { name = "Eternal",  seconds = 60 * 60 * 24 * 365,mult = 12.0, color = Color3.fromRGB(255, 240, 140), emoji = "⭐" },
}

-- ── Gulping (the sink) ─────────────────────────────────────────────────────
-- Feeding Goob B to Goob A destroys B forever and transfers a fraction of its
-- mass. The transfer is < 100% on purpose: every gulp BURNS mass out of the
-- world economy. Combined with fixed spawn rates this makes the total mass in
-- existence self-limiting instead of exponential.
Config.GULP_MASS_TRANSFER = 0.75
Config.GULP_AGE_TRANSFER = 0.35   -- you inherit 35% of the eaten Goob's age
Config.GULP_MIN_MASS_RATIO = 0.02 -- can't gulp something >50x your size

-- ── The Snack Stand: what Glob is actually FOR ─────────────────────────────
--
-- Without this, idle income is decorative. You earn Glob, and there is nothing
-- to do with it — which severs the offline pillar from progression entirely.
-- That is the exact pillar that made Grow a Garden the biggest new game on the
-- platform, so it cannot be an afterthought.
--
-- The stand closes the loop:  idle → Glob → snack rolls → stomach → mass.
--
-- Prices scale with your CURRENT income rather than being flat, so a snack
-- always costs roughly the same number of SECONDS of income no matter how big
-- you are. A flat price would be unaffordable on day one and free by day ten.
Config.SNACK_TIERS = {
    { id = "snack",    name = "Snack",    emoji = "🍪", seconds =   60, rolls = 3,  luck = 1 },
    { id = "feast",    name = "Feast",    emoji = "🍗", seconds =  300, rolls = 12, luck = 2 },
    { id = "banquet",  name = "Banquet",  emoji = "👑", seconds = 1200, rolls = 40, luck = 4 },
}
-- A small markup so buying is never strictly better than playing actively.
-- Catching is the intended primary loop; the stand is what your AFK time buys.
Config.SNACK_MARKUP = 1.35

-- ── Critters (the active loop) ─────────────────────────────────────────────
Config.CRITTER_MAX_ALIVE = 26
Config.CRITTER_SPAWN_INTERVAL = 3.5
Config.CRITTER_LIFETIME = 90
Config.CRITTER_CATCH_RADIUS = 9

-- ── Trading ────────────────────────────────────────────────────────────────
Config.TRADE_RANGE = 24
Config.TRADE_CONFIRM_LOCK = 3   -- seconds both sides must hold confirm (anti scam)
Config.TRADE_MAX_SLOTS = 4

-- ── Misc ───────────────────────────────────────────────────────────────────
Config.AUTOSAVE_INTERVAL = 90
Config.PLOT_COUNT = 8
Config.PLOT_SIZE = 90
Config.PLOT_SPACING = 130

return Config
