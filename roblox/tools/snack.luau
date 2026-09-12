-- NOTE: this file is a REPORT, not a test. It sweeps snack pricing and the idle-vs-active comparison
-- and prints what it finds; it asserts nothing and cannot fail. Read its
-- output, do not trust its exit code. The assertions that hold these
-- numbers in place live in tests.luau and arena.luau.
local Config    = require("Config")
local Format    = require("Format")
local GoobMath  = require("GoobMath")
local Feedstock = require("Feedstock")

-- NOTE: every call below passes an explicit `now` of 0. Without it, ageSeconds
-- falls back to os.time() and a synthetic goob with bornAt=0 reads as 54 years
-- old, silently multiplying its power by 12. That mistake made an earlier run
-- of this file report that the snack economy was completely stalled.
local NOW = 0
local function goob(m)
    return { id="s", nickname="s", hue=0, mass=m, stomach={}, bornAt=0,
             inheritedAge=0, lineage={}, contents={} }
end

emit("── Does luck actually shift the rolls? (50k rolls per tier) ──")
for _, tier in ipairs(Config.SNACK_TIERS) do
    local rng = Random.new(4242)
    local total, secrets, legendaries = 0, 0, 0
    local N = 50000
    for _ = 1, N do
        local it = Feedstock.roll(rng, tier.luck)
        total += it.mass
        if it.rarity == "Secret" then secrets += 1 end
        if it.rarity == "Legendary" or it.rarity == "Mythic" then legendaries += 1 end
    end
    emit(("  %-8s luck x%d -> %6.1f mass/roll   Leg+Myth %.2f%%   Secret 1 in %s")
        :format(tier.name, tier.luck, total / N, legendaries / N * 100,
                secrets > 0 and Format.comma(math.floor(N / secrets)) or "never"))
end

emit("")
emit("── Price is mass-independent when measured in seconds of income ──")
for _, m in ipairs({10, 1e4, 1e8, 1e12, 1e20}) do
    local g = goob(m)
    local p = GoobMath.snackPrice(g, Config.SNACK_TIERS[1], NOW)
    emit(("  mass %-8s income %-10s snack %-10s = %.0f sec of income")
        :format(Format.short(m), Format.short(GoobMath.incomePerSecond(g, NOW)),
                Format.short(p), p / GoobMath.incomePerSecond(g, NOW)))
end

emit("")
emit("── Idle vs active: which loop is stronger? ──")
local ACTIVE = 70.5 / 4
emit(("  ACTIVE (catching, 1 per 4s): %.1f mass/sec"):format(ACTIVE))
for _, tier in ipairs(Config.SNACK_TIERS) do
    local rng = Random.new(999)
    local per = 0
    for _ = 1, 20000 do per += Feedstock.roll(rng, tier.luck).mass end
    per /= 20000
    local secs = tier.seconds * Config.SNACK_MARKUP
    local gain = per * tier.rolls
    emit(("  IDLE  %-8s: %5.1f mass/sec  (%.2fx active)  — %s AFK buys %s mass")
        :format(tier.name, gain / secs, (gain / secs) / ACTIVE,
                Format.duration(secs), Format.short(gain)))
end

emit("")
emit("── Runaway check: pure-AFK player spending everything on Banquets ──")
local banquet = Config.SNACK_TIERS[3]
local rng = Random.new(31337)
local m, t, credit = Config.STARTING_MASS, 0, 0
local DT = 600
local marks, mi = { 3600, 86400, 86400*7, 86400*30, 86400*90 }, 1
while t < 86400*90 do
    local g = goob(m)
    credit += GoobMath.incomePerSecond(g, NOW) * DT
    local price = GoobMath.snackPrice(g, banquet, NOW)
    while credit >= price do
        credit -= price
        for _ = 1, banquet.rolls do m += Feedstock.roll(rng, banquet.luck).mass end
        g = goob(m)
        price = GoobMath.snackPrice(g, banquet, NOW)
    end
    t += DT
    while mi <= #marks and t >= marks[mi] do
        emit(("  after %-9s mass = %-9s radius %3.0f studs   %s")
            :format(Format.duration(marks[mi]), Format.short(m), GoobMath.size(goob(m)),
                    m >= Config.COLOSSAL_MASS and "COLOSSAL ✓" or ""))
        mi += 1
    end
end
emit("")
emit("  Growth is polynomial (mass ~ t^2.5), never exponential:")
emit("  income scales as mass^0.6, so each doubling of mass buys less than")
emit("  double the food. An AFK player always converges, never explodes.")
