-- NOTE: this file is a REPORT, not a test. It sweeps how a round's payout
-- turns into food for your Goob, and prints what it finds; it asserts nothing
-- and cannot fail. Read its output, do not trust its exit code. The assertions
-- that hold these numbers in place live in tests.luau and arena.luau, and the
-- live path is exercised end to end by integration.luau.
--
-- WHAT THIS REPLACED. There were two reports here, snack.luau and egg.luau,
-- sweeping the price curves of two shops that no longer exist. Feeding is not
-- bought anymore; it falls out of playing, which means the only question worth
-- sweeping is whether a round pays enough food to be worth finishing, and
-- whether first place is worth chasing over fourth.
local Config    = require("Config")
local Format    = require("Format")
local Feedstock = require("Feedstock")

local rng = Random.new(20260913)

local function rollsFor(payout)
    return math.clamp(math.floor(payout * Config.ROUND_FEED_PER_GLOB),
        Config.ROUND_FEED_MIN, Config.ROUND_FEED_MAX)
end

emit("── What a round's payout buys, by finishing mass ──")
emit(("  %-12s %-12s %-8s %-8s %s"):format(
    "final mass", "payout", "rolls", "luck", "expected food"))
for _, mass in ipairs({ 50, 200, 800, 2500, 8000, 25000, 120000 }) do
    for place = 1, 2 do
        local base = mass ^ Config.ROUND_PAYOUT_EXPONENT * Config.ROUND_PAYOUT_SCALE
        local payout = math.floor(base * (Config.ROUND_PLACE_BONUS[place] or 1))
        local rolls = rollsFor(payout)
        local luck = Config.ROUND_FEED_LUCK[place] or Config.ROUND_FEED_LUCK_DEFAULT
        -- Sampled rather than derived: Feedstock.roll's luck weighting is not
        -- a closed form, and a report that guesses at it is worse than one that
        -- measures it.
        local total = 0
        local SAMPLES = 400
        for _ = 1, SAMPLES do
            local m = 0
            for _ = 1, rolls do m += Feedstock.roll(rng, luck, false).mass end
            total += m
        end
        emit(("  %-12s %-12s %-8d %-8.1f %s   (#%d)"):format(
            Format.short(mass), Format.short(payout), rolls, luck,
            Format.short(total / SAMPLES), place))
    end
end

emit("")
emit("── Is winning worth chasing? (same finishing mass, 1st vs 4th) ──")
-- If first place is not meaningfully better than mid-table at the SAME size,
-- then placement is decoration and the only thing anybody optimises is
-- farming quietly in a corner — which is the failure mode rounds exist to
-- prevent.
for _, mass in ipairs({ 500, 5000, 50000 }) do
    local base = mass ^ Config.ROUND_PAYOUT_EXPONENT * Config.ROUND_PAYOUT_SCALE
    local function haul(place)
        local payout = math.floor(base * (Config.ROUND_PLACE_BONUS[place] or 1))
        local rolls = rollsFor(payout)
        local luck = Config.ROUND_FEED_LUCK[place] or Config.ROUND_FEED_LUCK_DEFAULT
        local total = 0
        for _ = 1, 600 do
            local m = 0
            for _ = 1, rolls do m += Feedstock.roll(rng, luck, false).mass end
            total += m
        end
        return math.floor(base * (Config.ROUND_PLACE_BONUS[place] or 1)), total / 600
    end
    local g1, f1 = haul(1)
    local g4, f4 = haul(4)
    emit(("  at %-8s  1st: 💧%-10s food %-10s   4th: 💧%-10s food %-10s   %.2fx glob, %.2fx food")
        :format(Format.short(mass), Format.short(g1), Format.short(f1),
            Format.short(g4), Format.short(f4), g1 / math.max(1, g4), f1 / math.max(1, f4)))
end

emit("")
emit("── How long until a second Goob? ──")
emit(("  an egg every %d rounds finished"):format(Config.EGG_EVERY_ROUNDS))
local cycle = Config.ROUND_SECONDS + Config.ROUND_END_HOLD + Config.INTERMISSION_SECONDS
emit(("  one round cycle is %s, so that is about %s of play per egg"):format(
    Format.duration(cycle), Format.duration(cycle * Config.EGG_EVERY_ROUNDS)))
emit(("  a full stable of %d is about %s"):format(Config.MAX_GOOBS,
    Format.duration(cycle * Config.EGG_EVERY_ROUNDS * (Config.MAX_GOOBS - 1))))
emit("  (and none of it is purchasable, which is the point: a stable is")
emit("   evidence of play, and that is the one thing that cannot be traded)")

emit("")
emit("── Rarity reachable from a round payout (10k rolls at each place's luck) ──")
for place = 1, 4 do
    local luck = Config.ROUND_FEED_LUCK[place] or Config.ROUND_FEED_LUCK_DEFAULT
    local counts = {}
    for _ = 1, 10000 do
        local item = Feedstock.roll(rng, luck, false)
        counts[item.rarity] = (counts[item.rarity] or 0) + 1
    end
    local parts = {}
    for _, r in ipairs(Feedstock.RARITY_ORDER) do
        if counts[r] then
            table.insert(parts, ("%s %.2f%%"):format(r, counts[r] / 100))
        end
    end
    emit(("  #%d (luck %.1f): %s"):format(place, luck, table.concat(parts, "  ")))
end
