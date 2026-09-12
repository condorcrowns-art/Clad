local Config   = require("Config")
local Format   = require("Format")
local GoobMath = require("GoobMath")
local NOW = 0
local function goob(m)
    return { id="e"..tostring(m), nickname="e", hue=0, mass=m, stomach={},
             bornAt=0, inheritedAge=0, lineage={}, contents={} }
end

emit("── Egg price curve (at 1M mass, income 22.1K/sec) ──")
local g = goob(1e6)
local inc = GoobMath.incomePerSecond(g, NOW)
for owned = 1, Config.MAX_GOOBS do
    local price = GoobMath.eggPrice(g, owned, NOW)
    emit(("  own %d -> next egg %-10s = %s of income")
        :format(owned, Format.short(price), Format.duration(price / inc)))
end

emit("")
emit("── EXPLOIT CHECK: is buy-egg-then-gulp a cheap way to farm mass? ──")
for _, m in ipairs({1e3, 1e6, 1e9}) do
    local gg = goob(m)
    local i = GoobMath.incomePerSecond(gg, NOW)
    local eggCost  = GoobMath.eggPrice(gg, 1, NOW)
    local eggMass  = Config.STARTING_MASS * Config.GULP_MASS_TRANSFER
    local snackCost = GoobMath.snackPrice(gg, Config.SNACK_TIERS[1], NOW)
    local snackMass = 69.5 * Config.SNACK_TIERS[1].rolls
    local eggRate   = eggMass / eggCost
    local snackRate = snackMass / snackCost
    emit(("  mass %-6s  egg: %s mass per 💧   snack: %s mass per 💧   snack is %.0fx better")
        :format(Format.short(m), Format.short(eggRate), Format.short(snackRate), snackRate / eggRate))
end
emit("  -> eggs are never a mass strategy. They buy a SLOT, which is the intent.")

emit("")
emit("── Can gulping now actually happen? ──")
local big   = goob(1e6); big.id = "big"
local fresh = goob(Config.STARTING_MASS); fresh.id = "fresh"
local ok1 = GoobMath.canGulp(big, fresh)
local ok2, why = GoobMath.canGulp(fresh, big)
emit(("  big Goob gulps a fresh egg: %s"):format(tostring(ok1)))
emit(("  fresh egg gulps a big Goob: %s (%s)"):format(tostring(ok2), tostring(why)))

emit("")
emit("── The sink still burns value ──")
local a = goob(1000); a.id = "a"
local b = goob(1000); b.id = "b"
local before = a.mass + b.mass
GoobMath.applyGulp(a, b, NOW)
emit(("  %s + %s  ->  %s   (%s burned, %.0f%%)")
    :format(Format.short(before/2), Format.short(before/2), Format.short(a.mass),
            Format.short(before - a.mass), (before - a.mass)/before*100))
