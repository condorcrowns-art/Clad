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

-- ── The Egg Stand: how you ever get a SECOND Goob ─────────────────────────
--
-- Without this the game has no core loop at all. `newGoob` was only ever
-- called once, at account creation, and trading is zero-sum — so no player
-- could ever hold two Goobs, the `#goobs <= 1` guard in GoobService.gulp was
-- permanently true, and gulping (the sink the entire design rests on) was
-- unreachable dead code.
--
-- Eggs hatch a Goob at STARTING_MASS with age zero, so they are NOT a way to
-- buy power: gulping a fresh egg returns 7.5 mass for a price worth hundreds.
-- What an egg buys is a SLOT — somewhere to hold a Goob you traded for, and
-- stock a new player can actually bring to the trade zone on day one.
--
-- Price is a steeply rising function of how many Goobs you already hold, so a
-- stable is a genuine investment and nobody floods the world with vessels.
Config.EGG_BASE_SECONDS = 900   -- first extra egg = 15 minutes of your income
Config.EGG_PRICE_GROWTH = 2.5   -- each additional Goob multiplies the price
Config.MAX_GOOBS = 8            -- hard cap; also bounds the DataStore payload

-- ── Critters (the active loop) ─────────────────────────────────────────────
Config.CRITTER_MAX_ALIVE = 26
Config.CRITTER_SPAWN_INTERVAL = 3.5
Config.CRITTER_LIFETIME = 90
Config.CRITTER_CATCH_RADIUS = 9

-- ── Trading ────────────────────────────────────────────────────────────────
Config.TRADE_RANGE = 24
Config.TRADE_CONFIRM_LOCK = 3   -- seconds both sides must hold confirm (anti scam)
Config.TRADE_MAX_SLOTS = 4

-- ── Sound ─────────────────────────────────────────────────────────────────
--
-- EMPTY BY DEFAULT, ON PURPOSE. These were shipped as marketplace asset ids
-- picked without being able to verify them, and at least one was wrong:
--
--   Failed to load sound rbxassetid://9125600534:
--   Asset type does not match requested type
--
-- An id that cannot be verified from here should not be baked into the game —
-- a broken one spams the Output window on every play and looks like the game
-- is falling apart. An empty id plays nothing and says nothing.
--
-- TO ADD SOUND: find ids on the Creator Store (Audio), paste them below, and
-- make sure each is actually an Audio asset rather than a model containing one.
Config.SOUNDS = {
    catch = "",   -- a short blip on picking something up
    rare  = "",   -- a fanfare for Legendary and above
    gulp  = "",   -- a heavy swallow
    thud  = "",   -- a Sumo Pit collision
}

-- ── Misc ───────────────────────────────────────────────────────────────────
Config.AUTOSAVE_INTERVAL = 90
Config.PLOT_COUNT = 8
Config.PLOT_SIZE = 90
Config.PLOT_SPACING = 130

-- ═══════════════════════════════════════════════════════════════════════════
-- ARENA — the agar.io layer. See GOOP.md.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Body ───────────────────────────────────────────────────────────────────
-- Arena masses live in the tens-to-low-thousands band, not the billions, so
-- these constants are tuned for readability at that scale. A fresh blob is 5
-- studs across and a blob at the ceiling is about 15 — a 3x visual difference,
-- which is the largest range that still lets both fit on one screen during a
-- chase. Any wider and the camera has to choose who to show.
Config.BLOB_RADIUS_BASE = 5
Config.BLOB_RADIUS_K = 2.2

-- Bigger is slower, agar-style. A fresh blob (42) outruns a ceiling blob (~24)
-- by 1.75x, which is enough for a chase to be losable but not hopeless.
Config.BLOB_BASE_SPEED = 42
Config.BLOB_SPEED_DECAY = 0.11
Config.BLOB_MIN_SPEED = 20

-- ── Pellets ────────────────────────────────────────────────────────────────
-- Density is pellets per square stud on the Flats. With a 250-stud-radius ring
-- that is about 430 live pellets, which Roblox streams comfortably as a single
-- pooled folder of unanchored-but-sleeping parts.
Config.PELLET_DENSITY = 0.0022
Config.PELLET_VALUE = 9
Config.PELLET_TARGET = 430
Config.PELLET_RESPAWN_PER_SEC = 14
Config.GOLDEN_CRUMB_MULT = 5

-- ── Melting ────────────────────────────────────────────────────────────────
-- leak = LEAK_SCALE * (mass - GRACE) ^ EXPONENT
--
-- The exponent is the single most important number in the game. Below 1.0 the
-- curves never cross and the biggest blob wins forever. At 1.15 the crossing
-- lands around 1.2K mass, which a good player reaches in roughly three
-- minutes and a great one milks for about twenty percent more.
--
-- GRACE exists so that a newly-spawned blob never melts. A player's first
-- thirty seconds must be pure, uncomplicated growth or the game reads as
-- broken rather than tense.
Config.LEAK_GRACE = 60
Config.LEAK_SCALE = 0.00433
Config.LEAK_EXPONENT = 1.15
Config.LEAK_PELLET_MASS = 6   -- leaked goop lands in chunks of this size

-- ── Eating ─────────────────────────────────────────────────────────────────
Config.EAT_RATIO = 1.15       -- must be 15% bigger to swallow
Config.EAT_TRANSFER = 0.80    -- and you only keep 80% of them

-- ── Popping ────────────────────────────────────────────────────────────────
-- Splits the dead blob: scatter as food, congeal as terrain, burn the rest.
-- The burn is the same sink that keeps total world mass convergent.
Config.POP_SCATTER = 0.55
Config.POP_CONGEAL = 0.25
Config.POP_KEEP_MAX = 0.25    -- ceiling on what any trinket can rescue

-- ── Lumps (the island's memory) ────────────────────────────────────────────
Config.LUMP_RADIUS_K = 1.15
Config.LUMP_RADIUS_MIN = 4
Config.LUMP_RADIUS_MAX = 26
Config.LUMP_DECAY_PER_SEC = 1 / (60 * 45)  -- a lump half-lives in ~30 minutes
Config.LUMP_MAX_COUNT = 140

-- ── Banking ────────────────────────────────────────────────────────────────
-- Super-linear on purpose: one more dangerous lap should pay for itself. Safe
-- to be super-linear only because the ceiling caps its input.
Config.BANK_EXPONENT = 1.12
Config.BANK_SCALE = 0.9
Config.BANK_SECONDS = 3.0     -- the most dangerous three seconds in the game
Config.BANK_RESET_MASS = 25   -- you come out of the Vault slightly fed

-- ── The island ─────────────────────────────────────────────────────────────
Config.ISLAND_RADIUS = 300
Config.SHALLOWS_INNER = 235   -- outside this radius is no-PvP
Config.VAULT_RADIUS = 34
Config.SHACK_POSITION = Vector3.new(-170, 0, 150)


return Config
