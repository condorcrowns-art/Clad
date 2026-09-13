local Config    = require("Config")
local Format    = require("Format")
local GoobMath  = require("GoobMath")
local Feedstock = require("Feedstock")
local Names     = require("Names")

local fails = 0
local function check(label, got, want)
    if got ~= want then
        fails += 1
        emit(("  FAIL  %-42s got %s  want %s"):format(label, tostring(got), tostring(want)))
    else
        emit(("  ok    %-42s %s"):format(label, tostring(got)))
    end
end

emit("── Number formatting (the power-scale ladder) ──")
check("short(999)",        Format.short(999), "999")
check("short(1000)",       Format.short(1000), "1K")
check("short(1234)",       Format.short(1234), "1.23K")
check("short(1e6)",        Format.short(1e6), "1M")
check("short(1.5e9)",      Format.short(1.5e9), "1.5B")
check("short(1e15)",       Format.short(1e15), "1Qa")
check("short(1e30)",       Format.short(1e30), "1No")
check("short(0)",          Format.short(0), "0")
check("comma(4821903)",    Format.comma(4821903), "4,821,903")
check("duration(93784)",   Format.duration(93784), "1d 2h")
check("duration(45)",      Format.duration(45), "45s")

emit("")
emit("── Age tiers (the unfarmable rarity axis) ──")
local DAY = 86400
local function goobAged(days)
    return { id="x", nickname="T", hue=0, mass=1000, stomach={},
             bornAt = 0, inheritedAge = days*DAY, lineage={}, contents={} }
end
for _, d in ipairs({0, 1, 3, 7, 30, 90, 365}) do
    local g = goobAged(d)
    local tier = GoobMath.ageTier(g, 0)
    emit(("  %4d days -> %-9s x%.2f"):format(d, tier.name, tier.mult))
end
check("fresh is x1",   GoobMath.ageMultiplier(goobAged(0), 0), 1.00)
check("365d is x12",   GoobMath.ageMultiplier(goobAged(365), 0), 12.0)

emit("")
emit("── Size curve: mass must stay on-screen at absurd scale ──")
for _, m in ipairs({10, 1e3, 1e6, 2.5e6, 1e9, 1e12, 1e20, 1e30}) do
    local g = goobAged(0); g.mass = m
    emit(("  mass %-8s -> radius %6.2f studs   income %s/sec")
        :format(Format.short(m), GoobMath.size(g), Format.short(GoobMath.incomePerSecond(g, 0))))
end
local huge = goobAged(0); huge.mass = 1e30
check("size still clamps at the extreme", GoobMath.size(huge), Config.SIZE_MAX)
local mid = goobAged(0); mid.mass = 1e6
local big = goobAged(0); big.mass = 1e9
emit(("  1e6 -> %.1f studs vs 1e9 -> %.1f studs : %s")
    :format(GoobMath.size(mid), GoobMath.size(big),
            GoobMath.size(big) > GoobMath.size(mid) + 5 and "VISIBLY DIFFERENT (good)" or "TOO SIMILAR (bad)"))

emit("")
emit("── The sink: does gulping actually DESTROY value? ──")
local a = goobAged(0); a.mass = 1000; a.nickname = "Eater"
local b = goobAged(0); b.mass = 1000; b.nickname = "Eaten"
local before = a.mass + b.mass
GoobMath.applyGulp(a, b, 0)
emit(("  before: two Goobs totalling %s mass"):format(Format.short(before)))
emit(("  after:  one Goob with %s mass"):format(Format.short(a.mass)))
emit(("  BURNED: %s mass permanently removed from the economy (%.0f%%)")
    :format(Format.short(before - a.mass), (before - a.mass) / before * 100))
check("gulp burns 25% of total", a.mass, 1750)
check("lineage recorded", #a.lineage, 1)
check("generation increments", GoobMath.generation(a), 2)

emit("")
emit("── Can a small Goob eat a whale's Goob? (scam guard) ──")
local small = goobAged(0); small.mass = 10;    small.id = "small"
local whale = goobAged(0); whale.mass = 10000; whale.id = "whale"
local near  = goobAged(0); near.mass  = 400;   near.id  = "near"
local ok, reason = GoobMath.canGulp(small, whale)
check("small cannot gulp whale (1000x)", ok, false)
emit("  reason: " .. tostring(reason))
local ok2 = GoobMath.canGulp(small, near)
check("small CAN gulp 40x (under the 50x cap)", ok2, true)
local ok3 = GoobMath.canGulp(small, small)
check("nothing can gulp itself", ok3, false)

emit("")
emit("── Feedstock catalogue ──")
local byRarity = {}
for _, item in ipairs(Feedstock.ITEMS) do
    byRarity[item.rarity] = (byRarity[item.rarity] or 0) + 1
end
for _, r in ipairs(Feedstock.RARITY_ORDER) do
    emit(("  %-10s %d types"):format(r, byRarity[r] or 0))
end

emit("")
emit("── 100,000 rolls: is Secret actually rare? ──")
local rng = Random.new(99)
local counts = {}
local N = 100000
for _ = 1, N do
    local item = Feedstock.roll(rng, 1)
    counts[item.rarity] = (counts[item.rarity] or 0) + 1
end
for _, r in ipairs(Feedstock.RARITY_ORDER) do
    local c = counts[r] or 0
    local odds = c > 0 and ("1 in " .. Format.comma(math.floor(N / c))) or "none in 100k"
    emit(("  %-10s %7s  (%.4f%%)  %s"):format(r, Format.comma(c), c / N * 100, odds))
end

emit("")
emit("── Time-to-Colossal (1e12 mass) at a realistic catch rate ──")
-- Assume a decent player catches ~1 item every 4 seconds while playing.
local mass = Config.STARTING_MASS
local seconds = 0
local rng2 = Random.new(7)
while mass < Config.COLOSSAL_MASS and seconds < 60*60*24*4000 do
    local item = Feedstock.roll(rng2, 1)
    mass += item.mass
    seconds += 4
end
emit(("  reached %s mass after %s of ACTIVE play")
    :format(Format.short(mass), Format.duration(seconds)))
emit("  (gulping other Goobs is the real path — this is the floor, not the ceiling)")

emit("")
emit("── Name generator sample ──")
local rng3 = Random.new(2024)
local sample = {}
for _ = 1, 8 do table.insert(sample, Names.random(rng3)) end
emit("  " .. table.concat(sample, ", "))
check("sanitize rejects symbols", Names.sanitize("Bob<script>"), nil)
check("sanitize accepts normal", Names.sanitize("  Sir Gloop  "), "Sir Gloop")

emit("")
-- Fatal, not decorative. A suite that prints its failures and exits zero is
-- invisible to run_all.sh, which happily reported "ALL SUITES PASSED" over
-- the top of printed failures for as long as this harness has existed.
if fails > 0 then
    error(("%d CHECK(S) FAILED in tests.luau"):format(fails), 0)
end
emit("ALL CHECKS PASSED")
