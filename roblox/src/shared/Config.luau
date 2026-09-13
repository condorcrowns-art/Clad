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

-- ── How your Goob is fed now ───────────────────────────────────────────────
--
-- WHAT THIS REPLACED, AND WHY. There used to be three separate ways to put
-- mass into a Goob: a Snack Stand that spent idle income on feedstock rolls,
-- an Egg Stand that sold you empty vessels, and physical critters that roamed
-- the island to be chased down. All three predate the arena. They were built
-- for a game where you stood on a plot and watched a number rise, and they
-- survived the rework only because nothing ever forced them to justify
-- themselves.
--
-- Keeping them was not free. Critters spawned junk into the ROUND — a "RARE
-- Anvil" bobbing past two players mid-chase, belonging to a loop that no
-- longer exists. The Snack Stand needed a shop panel, and that panel was the
-- thing overlapping the season track on screen. Two visible bugs, one root
-- cause: dead systems still running.
--
-- So feeding now hangs off the only loop there is. A round pays out Glob AND
-- feeds your Goob, scaled by what you actually did out there, and eggs hatch
-- on a count of rounds finished rather than being bought. There is exactly one
-- source of mass in the world again, and it is playing.
Config.ROUND_FEED_PER_GLOB = 1 / 420   -- payout -> number of feedstock rolls
Config.ROUND_FEED_MIN = 1
Config.ROUND_FEED_MAX = 26
-- Luck by finishing place. Winning buys a better table, not just more of the
-- same one, because "more rolls" stops reading as a prize very quickly.
Config.ROUND_FEED_LUCK = { 4, 2.5, 1.8 }
Config.ROUND_FEED_LUCK_DEFAULT = 1

-- ── How you ever get a SECOND Goob ─────────────────────────────────────────
--
-- An egg is a SLOT — somewhere to keep something you traded for. Gating it on
-- rounds finished means a stable is evidence that you played, which is the one
-- thing in the game that cannot be bought, botted or transferred.
Config.EGG_EVERY_ROUNDS = 5
Config.MAX_GOOBS = 8            -- hard cap; also bounds the DataStore payload

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
-- WHY rbxasset:// AND NOT rbxassetid://
--
-- These are files that ship INSIDE the Roblox client. They are not catalog
-- uploads, so there is no owner, no moderation queue, no licence question and
-- no chance of one being taken down and silently breaking the game — which is
-- exactly what happened the first time this table held a catalog id and the
-- client threw "Asset type does not match requested type" on every pickup.
--
-- A path that does not exist in some future client version fails to load
-- SILENTLY rather than erroring, which is the failure mode you want for audio.
-- Juice checks them at boot and warns once per bad id rather than per play.
--
-- Every one of these has shipped with Roblox for years as a default Humanoid
-- or Studio sound. They should be verified once in Studio all the same: the
-- harness has no audio engine and cannot confirm a file exists.
local BUILTIN = "rbxasset://sounds/"

Config.SOUNDS = {
    -- Pickups and progress
    catch  = BUILTIN .. "electronicpingshort.wav",  -- a pellet
    rare   = BUILTIN .. "bass.wav",                 -- Legendary and above
    bank   = BUILTIN .. "bass.wav",                 -- mass becomes Glob
    unlock = BUILTIN .. "electronicpingshort.wav",  -- a crate, a power

    -- Bodies meeting bodies
    gulp   = BUILTIN .. "uuhhh.mp3",                -- you ate somebody
    pop    = BUILTIN .. "uuhhh.mp3",                -- somebody ate you
    thud   = BUILTIN .. "hit.wav",                  -- a shove in the Standoff

    -- Powers. One per feel, not one per power: twelve distinct stings is noise
    -- on a phone speaker, and players read the SHAPE of a sound long before
    -- they learn which of twelve it was.
    whoosh = BUILTIN .. "action_falling.mp3",       -- dash, blink, split
    slam   = BUILTIN .. "metal.ogg",                -- slam, hook
    shield = BUILTIN .. "action_get_up.mp3",        -- bubble, spike, beacon
    drip   = BUILTIN .. "impact_water.mp3",         -- slick, decoy, siphon
    click  = BUILTIN .. "clickfast.wav",            -- UI
}

-- Which sound each power plays. A power with no entry falls back to "whoosh".
Config.POWER_SOUND = {
    dash = "whoosh", blink = "whoosh", split = "whoosh",
    slam = "slam", hook = "slam",
    bubble = "shield", spike = "shield", beacon = "shield",
    slick = "drip", decoy = "drip", siphon = "drip",
    magnet = "click",
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
-- ── HOW BIG EATING SOMEBODY MAKES YOU ─────────────────────────────────────
--
-- This was a LOG curve: radius = BASE + K * ln(mass / STARTING). It was chosen
-- when a run could reach 1e24 and every tenfold gain had to stay a visible
-- step forever, and at that job it was correct.
--
-- It is wrong for a round. A round lasts three and a half minutes and tops out
-- in the low thousands, and across that band a log curve barely moves:
-- swallowing a blob your own size DOUBLES your mass and adds one and a half
-- studs to your radius. The number on the HUD leaps and the thing on screen
-- does not, which is exactly the complaint — you eat somebody and nothing
-- happens.
--
-- A power law fixes it, and it is also the physically honest one: a blob is a
-- volume, volume is proportional to mass, so radius goes as the CUBE ROOT.
-- Doubling your mass now makes you 26% wider, which reads instantly, and the
-- old saturation problem does not come back because nothing in a round gets
-- near the clamp.
--
--   mass    10 ->  5.0 studs
--          100 -> 10.8
--        1,000 -> 23.2
--       10,000 -> 50.0
--      100,000 -> 107.7
Config.BLOB_RADIUS_BASE = 5
Config.BLOB_RADIUS_EXP = 1 / 3
-- Kept because the harvest curve and its tests are written against it and the
-- log form is the thing to reach for if the power law turns out to make the
-- late round unreadable. Unused while BLOB_RADIUS_EXP is set.
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
-- PELLET_TARGET IS DERIVED, NOT CHOSEN, and this is load-bearing.
--
-- Blob.harvestPerSecond models a blob sweeping a corridor through pellets at
-- PELLET_DENSITY. That density is an input to the curve that decides the
-- ceiling, the run length, and therefore the whole game. If the island is
-- resized and the pellet COUNT stays put, the realised density silently stops
-- matching the model the curves were tuned against — the ceiling moves, runs
-- get longer or shorter, and nothing anywhere reports a problem.
--
-- So the count is computed from the area it has to cover. Resize the island
-- and the food supply follows automatically. tools/arena.luau asserts the two
-- agree to within a couple of percent.
-- RAISED WITH THE BODIES. Blobs are physically bigger than they were — radius
-- went from a logarithm to a cube root so that eating somebody is visible —
-- and a wider body sweeps a wider corridor, so the same twelve contenders now
-- clear the floor noticeably faster. Holding the old 36/s would have meant the
-- change quietly starved the mid-round.
--
-- 48/s keeps the floor ahead of a full field up to about 2.5K mass each, which
-- is past where a round's middle sits. Beyond that it deliberately falls
-- behind: the back half of a round is supposed to turn from farming into
-- hunting, and a floor that never thins is what stops that happening.
Config.PELLET_RESPAWN_PER_SEC = 48
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
-- Scaled with the island: the cap exists so terrain cannot wall the Vault off,
-- and a cap tuned for a 300-stud island leaves a 480-stud one looking empty.
Config.LUMP_MAX_COUNT = 300

-- ── Banking ────────────────────────────────────────────────────────────────
-- Super-linear on purpose: one more dangerous lap should pay for itself. Safe
-- to be super-linear only because the ceiling caps its input.
Config.BANK_EXPONENT = 1.12
Config.BANK_SCALE = 0.9
Config.BANK_SECONDS = 3.0     -- the most dangerous three seconds in the game
Config.BANK_RESET_MASS = 25   -- you come out of the Vault slightly fed

-- ── The island ─────────────────────────────────────────────────────────────
-- ── Scale ──────────────────────────────────────────────────────────────────
-- Sized for 16-24 players, not for 4.
--
-- At 480 studs the Flats hold about 490,000 square studs, which is roughly
-- 24,000 each with a full server — a 155-stud square per player. Below about
-- 400 a full lobby is a scrum where nobody can build a run; much above 560 and
-- you stop being able to see anybody, which kills the thing the whole design
-- rests on: always being able to see somebody bigger and somebody smaller.
Config.ISLAND_RADIUS = 480
Config.SHALLOWS_INNER = 395   -- outside this radius is the rim
Config.VAULT_RADIUS = 48

-- ── WHY THERE IS NOW FOOD OUT AT THE EDGE ──────────────────────────────────
--
-- There was not, and it was deliberate, and it was wrong.
--
-- Pellets used to stop at SHALLOWS_INNER - 8, because the rim outside it is a
-- no-PvP ring and food in a place nothing can touch you is not a strategy, it
-- is an exploit that beats the whole game: stand still, eat forever, win. So
-- the rim was left bare. What that actually produced was a 93-stud dead band
-- around the entire island — over a THIRD of its area — with nothing in it and
-- no reason to walk there. The island read as smaller than it is, and the
-- outer third of a map built for 16+ players was decoration.
--
-- The fix is not "spawn food there anyway". It is to stop the rim being a
-- place you can live. Safety out there is now a BUDGET, not a property of the
-- ground: see SHALLOWS_GRACE below. Once you have spent it you are edible on
-- the rim like anywhere else, so food can be scattered right out to the
-- shoreline and the edge becomes the most exposed ground on the map instead of
-- the safest. Which is what an edge should be.
Config.PELLET_OUTER = Config.ISLAND_RADIUS - 26   -- 454: out to the shoreline

-- ── Safety is a budget ─────────────────────────────────────────────────────
--
-- Standing on the rim buys you SHALLOWS_GRACE seconds of being untouchable.
-- The meter drains while you are out there and refills at RECHARGE seconds of
-- real time per second of grace, only while you are inside the Flats. So the
-- rim is a fire escape — duck out, breathe, get back in — and never a home.
--
-- A fresh spawn is handed a full meter, which is what makes spawning out here
-- still the right answer for a new player: you get a real look at the island
-- before anything is allowed to touch you.
Config.SHALLOWS_GRACE = 12        -- seconds of protection per full meter
Config.SHALLOWS_RECHARGE = 3.0    -- seconds in the Flats per second refunded
-- ═══════════════════════════════════════════════════════════════════════════
-- ROUNDS
-- ═══════════════════════════════════════════════════════════════════════════
-- The game is round-based now. A round is a clean slate: everybody starts the
-- same size, grows without limit, and the round ends. Between rounds everyone
-- sits in a lobby where nothing can eat them and the shops are open.
--
-- WHY THIS REPLACED THE MELT CEILING. The old design capped growth with a leak
-- curve, so nobody could run away with it. Rounds make that unnecessary — a
-- runaway leader only owns the board until the clock runs out — and it makes
-- the cap actively unwanted, because the fantasy is getting ENORMOUS. The job
-- the melt used to do is now done by other players: abilities DEFLATE, so a
-- leader is brought down by people ganging up rather than by arithmetic.
Config.ROUND_SECONDS = 210
Config.INTERMISSION_SECONDS = 35
Config.ROUND_END_HOLD = 8       -- results on screen before the lobby teleport

-- Leak is off during a round. The curve itself is kept and still tested,
-- because it is the thing to reach for if deflation turns out to be too weak
-- a brake in playtesting — flipping this back on is a one-line change.
Config.LEAK_IN_ROUND = false

-- Round-end payout. Your final mass is the score; placement is a bonus on top
-- so that second place is still worth playing for.
Config.ROUND_PAYOUT_EXPONENT = 1.05
Config.ROUND_PAYOUT_SCALE = 0.55
Config.ROUND_PLACE_BONUS = { 3.0, 1.8, 1.3 }   -- 1st, 2nd, 3rd multipliers

-- ── The lobby ──────────────────────────────────────────────────────────────
-- A separate platform, well clear of the island, with a rim so nobody falls
-- off it. Deliberately NOT a building: it is a floor, a rail and some signs.
Config.LOBBY_CENTRE = Vector3.new(0, 420, 0)
Config.LOBBY_RADIUS = 120

-- ── SPLIT, TETHERS AND PODS — the part that is not agar.io ────────────────
--
-- SPLIT alone is the genre's signature move and copying it outright would make
-- this a worse agar with extra menus. So it is copied and then given one twist
-- that changes what the move is FOR.
--
-- WHAT SPLIT DOES. You throw three globlets forward. They are not a second
-- body you steer — that needs a second controller and a camera that can hold
-- two things, and it is the reason most agar clones feel awful on a phone.
-- They fly out, hoover up pellets, and come home. You stay one blob.
--
-- WHAT MAKES IT OURS: THE TETHER. Every globlet stays joined to you by a
-- visible strand of goo, and ANY blob that crosses a strand is deflated and
-- slowed. So a split is not just a lunge — it is three lines drawn across the
-- floor that other players have to go around. Splitting past somebody fences
-- them in. Splitting while running lays a wire behind you. Splitting into a
-- crowd hits everyone in it at once.
--
-- That turns the genre's "commit half of yourself to reach something" into
-- "commit part of yourself to CONTROL SPACE", which is a different decision
-- and, as far as I can find, not a thing any blob game does.
Config.SPLIT_PIECES = 3
Config.SPLIT_SPREAD = 0.42        -- radians between the outer pieces
Config.SPLIT_SPEED = 96           -- studs/sec outward
Config.SPLIT_RANGE = 88           -- how far a globlet gets before it turns back
Config.SPLIT_RETURN_FRACTION = 0.85  -- of what you threw, how much comes home
Config.GLOBLET_PICKUP = 9         -- pellet reach of one globlet

-- The tether. Deliberately weak per touch and generous on cooldown: it is
-- area denial, not a damage engine. A blob that walks the length of one strand
-- loses a noticeable slice; a blob that clips the end of one barely notices.
Config.TETHER_WIDTH = 4.5         -- studs either side of the line
Config.TETHER_DEFLATE = 0.045     -- fraction of the victim's own mass, per touch
Config.TETHER_SLOW = 0.55         -- speed multiplier while snagged
Config.TETHER_SLOW_TIME = 1.1     -- seconds the snag lasts
Config.TETHER_COOLDOWN = 0.8      -- per victim, so a strand cannot chain-hit

-- ── SPORE PODS ────────────────────────────────────────────────────────────
--
-- Standing hazards on the island. Touch one while you are big and it bursts
-- you into a whole web of tethered globlets at once — you lose no mass to the
-- pod itself, but for a few seconds you are a spread-out, obvious, tangled
-- mess with your pieces scattered.
--
-- Agar's viruses punish the big by splitting them into edible chunks. Ours
-- does not make you edible, it makes you COMMITTED: your tethers are suddenly
-- everywhere, which is dangerous for everyone near you including the person
-- who herded you into it. Being popped by a pod is as often an opportunity as
-- a punishment, which is the difference between a hazard and a tax.
--
-- Only blobs over POD_MIN_MASS trigger them, so a small player can hide inside
-- a pod field where the big ones dare not follow. That is the whole reason the
-- things are on the map.
Config.POD_COUNT = 14
Config.POD_MIN_MASS = 140         -- below this you pass straight through
Config.POD_RADIUS = 11
Config.POD_PIECES = 7             -- how many globlets a burst throws
Config.POD_RESPAWN = 25           -- seconds before a spent pod regrows

-- ── Deflation ──────────────────────────────────────────────────────────────
-- The catch-up mechanism, and the reason a leader cannot simply sit on the
-- lead. Every deflating ability takes a FRACTION OF THE TARGET'S OWN MASS, so
-- the bigger somebody is the more there is to take — the leader is always the
-- most rewarding thing on the island to hit.
--
-- What comes off does not vanish: it hits the floor as pellets, so deflating
-- the leader literally feeds everyone standing nearby. That is the whole
-- catch-up loop in one sentence.
Config.DEFLATE_RETURN_AS_FOOD = 0.8
Config.DEFLATE = {
    slam   = 0.10,   -- everyone caught in the shockwave
    hook   = 0.06,   -- the blob you reel
    siphon = 0.14,   -- stolen rather than scattered: the thief keeps it
    spike  = 0.35,   -- whoever tries to eat you, and it is meant to hurt
    blink  = 0.0,
}

-- ── Biomes ─────────────────────────────────────────────────────────────────
-- The four old zones are gone as places, but not as ideas. Their characters
-- survive as patches ON the one island, which is the version of "keep it to
-- one island" that loses nothing: you still get slick lines, ramp play and a
-- rich dangerous basin, without four separate maps to build, populate, and
-- split a server across.
--
-- Each patch trades safety for yield, so where you feed is a decision:
--   SLICK   fast lines, no brakes           pellets x1.15
--   SCRAP   ramps, cover, broken sightlines pellets x1.00, best for hiding
--   BASIN   sunken, richest, one way out    pellets x1.55
-- Five patches on the bigger island, spread so that no two are visible from
-- the same standing spot. Each trades safety for yield, so where you feed is a
-- decision rather than a detail.
Config.BIOMES = {
    { id = "slick",  name = "The Slick",     centre = Vector3.new(232, 0, -186),
      radius = 118, pelletMult = 1.15, friction = 0.03 },
    { id = "scrap",  name = "The Scrapyard", centre = Vector3.new(-196, 0, -238),
      radius = 126, pelletMult = 1.00, friction = 0.45 },
    { id = "basin",  name = "The Basin",     centre = Vector3.new(168, -11, 232),
      radius = 110, pelletMult = 1.55, friction = 0.35 },
    -- New with the bigger island. The Bloom is the safest good ground and the
    -- Ashfield is the most dangerous: open, no cover, and the best pellets
    -- outside the Basin.
    { id = "bloom",  name = "The Bloom",     centre = Vector3.new(-268, 0, 96),
      radius = 104, pelletMult = 1.08, friction = 0.55 },
    { id = "ash",    name = "The Ashfield",  centre = Vector3.new(24, 0, -318),
      radius = 122, pelletMult = 1.34, friction = 0.30 },
}

Config.VAULT_HEIGHT = 7
-- WHERE A FRESH BLOB APPEARS.
--
-- This was 438, and the scenery scatter ran from 407 to 466 — so spawn points
-- sat in the dead centre of the rock band and a player could, and did,
-- materialise inside a boulder. Scenery is now kept out of a ring around the
-- spawns entirely, and the spawns themselves moved inboard. Two independent
-- guarantees, because spawning stuck is the single worst first impression a
-- game can make.
-- Back out in the SHALLOWS, which is where a new player belongs anyway: it is
-- the no-PvP ring. Moving spawns inboard to dodge the rocks put them inside
-- the biome furniture instead — basin walls, ramps, scrap and signposts — so
-- the fix was trading one obstacle for five. Out here the only thing that gets
-- placed is scattered rock, and that now respects SPAWN_CLEARANCE.
Config.SPAWN_RING = 435
Config.SPAWN_CLEARANCE = 46    -- no scenery may be placed within this of a spawn
Config.SPAWN_POINTS = 20       -- enough that a full server does not stack up

-- ═══════════════════════════════════════════════════════════════════════════
-- BOTS
-- ═══════════════════════════════════════════════════════════════════════════
-- An arena game with three people in it is not a small version of the game.
-- It is a different, worse game: nobody to run from, nobody to gang up on, and
-- a leader who is never brought down because deflation needs a crowd. Every
-- system in GOOP — the catch-up loop, the board, the 1v1s — assumes a FIELD.
--
-- So the field is guaranteed. Every round is played by ROUND_FIELD_SIZE
-- contenders and bots make up whatever the humans do not: twelve humans means
-- no bots, one human means eleven, and nobody at all still runs a real round
-- with a real board. A player joining mid-round does not push anyone out —
-- the bot count is recomputed at the top of each round, so the field size is
-- exact at the start and only ever grows during play.
--
-- Bots are NOT a scoreboard prop. They eat pellets, they eat each other, they
-- eat you, you eat them, and they are deflated by your abilities on exactly
-- the same terms as a player, because a bot that cannot be beaten the normal
-- way teaches the wrong thing about the game.
Config.ROUND_FIELD_SIZE = 12
Config.BOTS_ENABLED = true

-- Bots are deliberately beatable. A bot re-decides what it is doing every
-- THINK seconds rather than every frame, which is what gives a human the
-- opening to cut one off — a perfect-information chaser reacting at 60Hz is
-- unloseable and reads as cheating.
Config.BOT_THINK = 0.45
Config.BOT_SIGHT = 170          -- studs; it cannot act on what it cannot see
Config.BOT_PELLET_SIGHT = 90
-- Fear and greed. A bot runs from anything EAT_RATIO * FEAR times its size and
-- chases anything under GREED of it. Below 1.0 greed means it only commits to
-- prey it can comfortably swallow, which leaves room for a human to bait one.
Config.BOT_FEAR = 1.0
Config.BOT_GREED = 0.86
Config.BOT_SPEED_MULT = 0.94    -- a shade slower than a player of equal size
Config.BOT_WANDER = 0.35        -- share of decisions that are just wandering

-- Bots do not all play the same. Skill scales the three things that actually
-- decide a chase: how far they see, how often they think, and how willing they
-- are to commit. A field of identical bots is legible within one round.
Config.BOT_SKILLS = {
    { id = "dozy",   name = "dozy",   sight = 0.62, think = 1.9,  greed = 0.70, weight = 26 },
    { id = "plain",  name = "plain",  sight = 1.00, think = 1.0,  greed = 0.86, weight = 46 },
    { id = "sharp",  name = "sharp",  sight = 1.28, think = 0.65, greed = 0.95, weight = 22 },
    { id = "feral",  name = "feral",  sight = 1.45, think = 0.45, greed = 1.05, weight = 6 },
}

-- ── BOT NAMES ─────────────────────────────────────────────────────────────
--
-- Generated to look like Roblox usernames, because that is what they are
-- standing in for.
--
-- The first version used cute blob words — Gloop, Mochi, Squelch — and tagged
-- every one with a robot emoji on the assumption that pretending otherwise was
-- a lie the player would catch and resent. That was the wrong call twice over.
-- A board reading "Gloop 🤖, Pudge 🤖, Custard 🤖" does not read as honesty, it
-- reads as an EMPTY SERVER, which is precisely the feeling bots exist to
-- prevent — and no blob game in the genre labels its fill, so the tag was
-- announcing a weakness nobody else admits to.
--
-- A name like Kai8842 is not a lie about a person; it is the same shape as
-- every other name on a Roblox leaderboard, and the player's honest reaction
-- to it is "there are eleven other blobs here", which is true.
Config.BOT_FIRST = {
    "Kai", "Milo", "Zane", "Finn", "Rhys", "Theo", "Jax", "Cole", "Ash", "Reid",
    "John", "Leo", "Max", "Nico", "Owen", "Ravi", "Sam", "Toby", "Vic", "Wren",
    "Blaze", "Cypher", "Drift", "Echo", "Frost", "Ghost", "Hex", "Iris", "Jet",
    "Koda", "Luna", "Mika", "Nova", "Onyx", "Pixel", "Quill", "Rune", "Sky",
}
Config.BOT_SUFFIX_MIN = 11
Config.BOT_SUFFIX_MAX = 9987


-- Derived last, because it depends on the radius above.
-- The food field is the disc out to PELLET_OUTER, not to SHALLOWS_INNER. That
-- is a 35% larger area than it used to be, so the count rises with it: if the
-- count had stayed put, opening the rim up would have made the WHOLE island
-- thinner rather than making the edge worth walking to.
Config.PELLET_TARGET = math.floor(
    Config.PELLET_DENSITY * math.pi * Config.PELLET_OUTER ^ 2)


return Config
