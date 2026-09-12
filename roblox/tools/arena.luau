local Config = require("Config")
local Blob = require("Blob")
local Format = require("Format")

local fails, passes = 0, 0
local function check(label, cond, detail)
    if cond then passes += 1; emit("  ok    " .. label)
    else fails += 1; emit("  FAIL  " .. label .. "   " .. tostring(detail)) end
end

emit("── The two curves ──")
emit("  mass     radius  speed   harvest/s  leak/s   net/s")
for _, m in ipairs({10, 60, 150, 300, 600, 900, 1200, 1600, 2500, 5000}) do
    emit(("  %-8s %5.1f  %5.1f   %8.2f  %7.2f  %6.2f"):format(
        Format.short(m), Blob.radius(m), Blob.speed(m),
        Blob.harvestPerSecond(m), Blob.leakPerSecond(m), Blob.netPerSecond(m)))
end

emit("")
emit("── Where the curves cross (the ceiling) ──")
for _, eff in ipairs({1.0, 0.8, 0.6, 0.4}) do
    emit(("  at %d%% harvest efficiency, ceiling = %s mass")
        :format(eff * 100, Format.short(Blob.ceiling(eff))))
end

-- Simulate an actual run: a player harvesting at `eff`, from spawn, second by
-- second, recording how long each milestone takes and what it banks for.
local function run(eff)
    local m, t = Config.STARTING_MASS, 0
    local marks, next_i = {}, 1
    local want = {100, 300, 600, 900, 1200, 1500}
    local dt = 0.25
    while t < 900 do
        local net = Blob.netPerSecond(m, eff)
        if net <= 0.02 and next_i <= #want then
            -- stalled below the next milestone; record the stall and stop
            marks[#marks + 1] = { mass = m, t = t, stalled = true }
            break
        end
        m += net * dt
        t += dt
        while next_i <= #want and m >= want[next_i] do
            marks[#marks + 1] = { mass = want[next_i], t = t }
            next_i += 1
        end
        if next_i > #want then break end
    end
    return marks
end

emit("")
emit("── How long is a run? ──")
for _, eff in ipairs({1.0, 0.8, 0.6}) do
    local parts = {}
    for _, mk in ipairs(run(eff)) do
        parts[#parts + 1] = ("%s@%.0fs%s"):format(
            Format.short(mk.mass), mk.t, mk.stalled and "(stall)" or "")
    end
    emit(("  %d%% eff:  %s"):format(eff * 100, table.concat(parts, "  ")))
end

emit("")
emit("── What a run is worth ──")
emit("  banked mass   glob      = crates")
for _, m in ipairs({100, 300, 600, 900, 1200, 1500}) do
    local g = Blob.bankValue(m)
    emit(("  %-13s %-9s %.1f goop / %.2f deep"):format(
        Format.short(m), Format.short(g), g / 1000, g / 8000))
end

emit("")
emit("── A big blob is a food supply ──")
emit("  mass     leaks/s   pellets/s fed to the world")
for _, m in ipairs({300, 900, 1500}) do
    emit(("  %-8s %6.2f    %.2f"):format(Format.short(m),
        Blob.leakPerSecond(m), Blob.leakPerSecond(m) / Config.LEAK_PELLET_MASS))
end

emit("")
emit("── The island actually holds the density the curves assume ──")
local flatsArea = math.pi * Config.SHALLOWS_INNER ^ 2
local realised = Config.PELLET_TARGET / flatsArea
emit(("  island %d studs · flats %s sq studs · %d pellets · density %.5f (model %.5f)")
    :format(Config.ISLAND_RADIUS, Format.short(flatsArea),
            Config.PELLET_TARGET, realised, Config.PELLET_DENSITY))
emit(("  respawn %d/s refills the whole island in %.0fs")
    :format(Config.PELLET_RESPAWN_PER_SEC,
            Config.PELLET_TARGET / Config.PELLET_RESPAWN_PER_SEC))

-- THE SILENT FAILURE THIS CATCHES: harvest, and therefore the ceiling and the
-- run length, are computed from PELLET_DENSITY. Resize the island without
-- resizing the food supply and the realised density stops matching the model
-- the curves were tuned against. The ceiling moves and nothing reports it.
check("the island's real pellet density matches the model",
    math.abs(realised - Config.PELLET_DENSITY) / Config.PELLET_DENSITY < 0.02,
    ("%.5f vs %.5f"):format(realised, Config.PELLET_DENSITY))

-- Room to play. Below about 24k square studs each a full server is a scrum
-- nobody can build a run in.
local perPlayer = flatsArea / 24
check("there is room for a full server", perPlayer > 18000,
    ("%.0f sq studs each at 24 players"):format(perPlayer))

-- And the island must not be so big that a leader is invisible. The whole
-- design rests on always being able to see somebody bigger and somebody
-- smaller; past roughly 560 studs you stop being able to.
check("but not so big that nobody can see anybody",
    Config.ISLAND_RADIUS <= 560, tostring(Config.ISLAND_RADIUS))

-- A server must be able to replace what a full lobby eats. Twenty-four
-- players harvesting at the top of the curve is the worst case.
local fullServerDrain = 24 * Blob.harvestPerSecond(Blob.ceiling(0.8)) / Config.PELLET_VALUE
check("respawn can feed a full server",
    Config.PELLET_RESPAWN_PER_SEC > fullServerDrain * 0.7,
    ("%d/s vs %.0f/s eaten"):format(Config.PELLET_RESPAWN_PER_SEC, fullServerDrain))

emit("")
emit("── Assertions ──")

-- The ceiling must exist and be finite. If harvest ever outran leak the game
-- would have a permanent king and every other property below would be moot.
local ceil = Blob.ceiling(1.0)
check("a perfect player still hits a ceiling", ceil < 1e6, ceil)
check("the ceiling is reachable, not theoretical", ceil > 600, ceil)
check("past the ceiling you shrink no matter how well you play",
    Blob.netPerSecond(ceil * 1.5, 1.0) < 0, Blob.netPerSecond(ceil * 1.5, 1.0))

-- A brand new blob must never melt. The first thirty seconds have to read as
-- clean growth or the game reads as broken rather than tense.
check("a fresh blob does not melt", Blob.leakPerSecond(Config.STARTING_MASS) == 0)
check("melting starts only above the grace mass",
    Blob.leakPerSecond(Config.LEAK_GRACE + 1) > 0
        and Blob.leakPerSecond(Config.LEAK_GRACE) == 0)

-- Standing still must be strictly negative once you are big, or someone will
-- park in a corner and win.
check("AFK at size is a net loss", Blob.netPerSecond(600, 0) < -2,
    Blob.netPerSecond(600, 0))

-- Chases have to be winnable by the prey.
check("small outruns large", Blob.speed(10) > Blob.speed(1200) * 1.5,
    Blob.speed(10) / Blob.speed(1200))
check("but not absurdly - a chase is still a chase",
    Blob.speed(10) < Blob.speed(1200) * 2.5, Blob.speed(10) / Blob.speed(1200))
check("speed has a floor so a whale is not a statue",
    Blob.speed(1e9) == Config.BLOB_MIN_SPEED)

-- Eating.
check("near-equals bounce", not Blob.canEat(100, 95))
check("clearly bigger swallows", Blob.canEat(200, 100))
check("eating is lossy, like every transfer in this game",
    Blob.eatGain(200, 100) < 100)

-- The sink.
local sp = Blob.popSplit(1000)
check("a pop burns mass out of the world", sp.burned > 0, sp.burned)
check("a pop feeds the floor more than it feeds the terrain",
    sp.scatter > sp.congeal)
check("the split is conservative", math.abs(
    (sp.kept + sp.scatter + sp.congeal + sp.burned) - 1000) < 1e-6)
local sk = Blob.popSplit(1000, 0.15)
check("Second Skin rescues mass from the burn, not from the floor",
    sk.kept > 0 and sk.scatter < sp.scatter and sk.burned < sp.burned)
check("no trinket can rescue more than the cap",
    Blob.popSplit(1000, 0.99).kept <= 1000 * Config.POP_KEEP_MAX + 1e-6)

-- Banking.
check("one more lap pays for itself", Blob.bankValue(1200) > Blob.bankValue(600) * 2,
    Blob.bankValue(1200) / Blob.bankValue(600))
check("a one-minute run buys something", Blob.bankValue(600) >= 1000,
    Blob.bankValue(600))
check("banking nothing is worth nothing", Blob.bankValue(0) == 0)
check("the very best run cannot buy the whole shop in one go",
    Blob.bankValue(ceil * 1.2) < 8000, Blob.bankValue(ceil * 1.2))

-- Run length. This is the number the whole design exists to produce.
--
-- Measured against the ceiling rather than a fixed mass, because the ceiling
-- moves when the curves are retuned and a hardcoded milestone would quietly
-- become unreachable — which is exactly the bug this block caught the first
-- time it ran.
local function timeTo(eff, target)
    local m, t, dt = Config.STARTING_MASS, 0, 0.25
    while t < 1200 do
        local net = Blob.netPerSecond(m, eff)
        if net <= 0.01 then return nil end
        m += net * dt
        t += dt
        if m >= target then return t end
    end
    return nil
end

local REAL = 0.8                      -- what a competent player actually sweeps
local realCeil = Blob.ceiling(REAL)
local tQuick = timeTo(REAL, 600)                 -- a fine, ordinary run
local tGreat = timeTo(REAL, realCeil * 0.90)     -- milking it

emit(("  (at %d%% eff: ceiling %s, 600 at %.0fs, 90%% of ceiling at %.0fs)")
    :format(REAL * 100, Format.short(realCeil), tQuick or -1, tGreat or -1))

check("a decent run lands inside a minute and a bit", tQuick ~= nil and tQuick < 80, tQuick)
check("milking it to the ceiling takes two to five minutes",
    tGreat ~= nil and tGreat > 110 and tGreat < 300, tGreat)
check("the last stretch is sharply diminishing, so players bank instead",
    tQuick ~= nil and tGreat ~= nil and (tGreat - tQuick) > tQuick * 1.2,
    tQuick and tGreat and (tGreat - tQuick) / tQuick)
local tSliver = timeTo(REAL, realCeil * 0.99)
emit(("  (99%% of ceiling at %s)"):format(tSliver and ("%.0fs"):format(tSliver) or "never"))
check("the final sliver costs more than everything before it",
    tSliver == nil or tSliver > (tGreat or 0) * 1.8, tSliver)

-- Efficiency has to matter: playing well must beat playing badly by a visible
-- margin, or skill is decorative.
check("playing well beats playing badly", Blob.ceiling(1.0) > Blob.ceiling(0.6) * 1.4,
    Blob.ceiling(1.0) / Blob.ceiling(0.6))

-- Lumps.
check("a big pop leaves a bigger lump",
    Blob.lumpRadius(1000) > Blob.lumpRadius(100))
check("no lump can wall off the island",
    Blob.lumpRadius(1e9) <= Config.LUMP_RADIUS_MAX)
check("lumps melt, so the island does not silt up",
    Blob.lumpDecay(100, 60) < 100)

emit("")
if fails > 0 then error(fails .. " arena assertion(s) failed") end
emit(("All %d arena assertions passed."):format(passes))
