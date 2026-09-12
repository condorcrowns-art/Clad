local Config    = require("Config")
local Format    = require("Format")
local Feedstock = require("Feedstock")

emit("── Expected mass per catch (analytic) ──")
local total, ev = 0, 0
for _, it in ipairs(Feedstock.ITEMS) do total += it.weight end
local contrib = {}
for _, it in ipairs(Feedstock.ITEMS) do
    local p = it.weight / total
    local c = p * it.mass
    ev += c
    contrib[it.rarity] = (contrib[it.rarity] or 0) + c
end
for _, r in ipairs(Feedstock.RARITY_ORDER) do
    local c = contrib[r] or 0
    emit(("  %-10s contributes %8.1f mass/catch  (%5.1f%% of all value)")
        :format(r, c, c / ev * 100))
end
emit(("  TOTAL expected: %.1f mass per catch"):format(ev))

emit("")
emit("── 300 simulated players, 4s per catch, time to COLOSSAL ──")
local times = {}
local CAP = 60*60*24*60  -- give up after 60 days of pure play time
for seed = 1, 300 do
    local rng = Random.new(seed * 7919)
    local mass, secs = Config.STARTING_MASS, 0
    while mass < Config.COLOSSAL_MASS and secs < CAP do
        mass += Feedstock.roll(rng, 1).mass
        secs += 4
    end
    table.insert(times, secs)
end
table.sort(times)
local function pct(p) return times[math.max(1, math.floor(#times * p))] end
emit(("  fastest  10%%: %s"):format(Format.duration(pct(0.10))))
emit(("  median      : %s"):format(Format.duration(pct(0.50))))
emit(("  slowest  10%%: %s"):format(Format.duration(pct(0.90))))
emit(("  spread (p90/p10): %.1fx"):format(pct(0.90) / math.max(1, pct(0.10))))

emit("")
emit("── How much of a run is decided by ONE lucky drop? ──")
for seed = 1, 5 do
    local rng = Random.new(seed * 104729)
    local mass, secs, biggest, biggestName = Config.STARTING_MASS, 0, 0, "-"
    while mass < Config.COLOSSAL_MASS and secs < CAP do
        local it = Feedstock.roll(rng, 1)
        mass += it.mass
        if it.mass > biggest then biggest, biggestName = it.mass, it.name end
        secs += 4
    end
    emit(("  run %d: %-8s to Colossal · biggest single drop %s (%s) = %.0f%% of final mass")
        :format(seed, Format.duration(secs), Format.short(biggest), biggestName, biggest / mass * 100))
end
