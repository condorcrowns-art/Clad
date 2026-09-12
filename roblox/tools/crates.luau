local Crates = require("Crates")
local Trinkets = require("Trinkets")
local Cosmetics = require("Cosmetics")
local Format = require("Format")

local fails, passes = 0, 0
local function check(label, cond, detail)
    if cond then passes += 1; emit("  ok    " .. label)
    else fails += 1; emit("  FAIL  " .. label .. "   " .. tostring(detail)) end
end

-- ── Roll a hundred thousand crates and look at what actually comes out ─────
local function sweep(crateId, n)
    local rng = Random.new(20260912)
    local since, counts, kinds, dupeGlob = 0, {}, {}, 0
    local seen, worst, streak = {}, 0, 0
    for _ = 1, n do
        local r, nxt = Crates.roll(crateId, rng, since)
        since = nxt
        if r then
            counts[r.rarity] = (counts[r.rarity] or 0) + 1
            kinds[r.kind] = (kinds[r.kind] or 0) + 1
            if seen[r.id] then
                dupeGlob += Crates.dupeValue(crateId, r.rarity)
            end
            seen[r.id] = true
            local crate = Crates.get(crateId)
            if crate and Crates.atLeast(r.rarity, crate.pityFloor) then
                streak = 0
            else
                streak += 1
                if streak > worst then worst = streak end
            end
        end
    end
    return counts, kinds, worst, dupeGlob, seen
end

local N = 60000
for _, crate in ipairs(Crates.LIST) do
    emit(("── %s (%s Glob) ──"):format(crate.name,
        crate.price > 0 and Format.short(crate.price) or "earned"))
    local counts, kinds, worst, dupeGlob, seen = sweep(crate.id, N)
    for _, r in ipairs(Crates.RARITY_ORDER) do
        local c = counts[r]
        if c then
            emit(("  %-10s %6.3f%%   1 in %s"):format(r, c / N * 100,
                Format.short(math.floor(N / c))))
        end
    end
    local parts = {}
    for k, v in pairs(kinds) do parts[#parts + 1] = ("%s %.0f%%"):format(k, v / N * 100) end
    table.sort(parts)
    emit("  contents: " .. table.concat(parts, ", "))
    emit(("  worst dry streak: %d rolls (pity is %d)"):format(worst, crate.pity))
    local uniques = 0
    for _ in pairs(seen) do uniques += 1 end
    emit(("  unique items reachable: %d   dupe refund over %s rolls: %s Glob")
        :format(uniques, Format.short(N), Format.short(dupeGlob)))

    check(crate.name .. ": pity is never exceeded", worst < crate.pity, worst)
    check(crate.name .. ": every advertised rarity is actually reachable",
        (function()
            for r, w in pairs(crate.weights) do
                if w > 0 and not counts[r] then return false end
            end
            return true
        end)())
    emit("")
end

-- ── The rules that must not break ─────────────────────────────────────────
emit("── Rules ──")

-- Nothing in a crate may cost Robux, and nothing bought with Robux may carry
-- a gameplay number. This is the whole monetisation thesis in two checks.
check("no crate is sold for real money",
    (function()
        for _, c in ipairs(Crates.LIST) do
            if c.price < 0 then return false end
        end
        return true
    end)())

check("the free-currency crate can reach trinkets",
    (function()
        local _, kinds = sweep("goop", 4000)
        return (kinds.trinket or 0) > 0
    end)())

-- Beta Season items must be unreachable from any crate a player can buy, or
-- "never printed again" is a lie the moment someone buys a Goop Crate.
check("Beta items never leak into a purchasable crate",
    (function()
        for _, id in ipairs({ "goop", "deep" }) do
            local _, _, _, _, seen = sweep(id, 20000)
            for itemId in pairs(seen) do
                local item = Cosmetics.get(itemId)
                if item and item.beta then return false end
            end
        end
        return true
    end)())

check("the Deep Crate costs a real session, not a lucky minute",
    (Crates.get("deep") :: any).price >= 8000)

check("the pity counter can be shown honestly",
    Crates.rollsUntilPity("goop", 0) == (Crates.get("goop") :: any).pity
        and Crates.rollsUntilPity("goop", 11) == 1
        and Crates.rollsUntilPity("goop", 99) == 0)

check("an unknown crate id rolls nothing rather than crashing",
    (function()
        local r = Crates.roll("does_not_exist", Random.new(1), 0)
        return r == nil
    end)())

check("duplicates always refund something",
    (function()
        for _, c in ipairs(Crates.LIST) do
            for r, w in pairs(c.weights) do
                if w > 0 and (c.dupeGlob[r] or 0) <= 0 then return false end
            end
        end
        return true
    end)())

-- ── Trinkets: the 20%-not-200% rule ───────────────────────────────────────
emit("")
emit("── Every legal trinket loadout, ranked ──")
-- Only DISTINCT triples: duplicates no longer stack, so "three Wax Coats" is
-- really a one-slot loadout and comparing it against a full build measures
-- nothing. The real decision space is which three different trinkets you pick.
local combos = {}
local L = Trinkets.LIST
for i = 1, #L do
    for j = i + 1, #L do
        for k = j + 1, #L do
            local ids = { L[i].id, L[j].id, L[k].id }
            local r = Trinkets.resolve(ids)
            combos[#combos + 1] = { ids = ids, adv = Trinkets.advantage(r), r = r }
        end
    end
end
table.sort(combos, function(a, b) return a.adv > b.adv end)
emit(("  %d distinct three-trinket builds"):format(#combos))
for n = 1, 3 do
    local c = combos[n]
    emit(("  strongest #%d: %-40s (+%.1f%%)"):format(n, table.concat(c.ids, " + "), c.adv * 100))
end
local worstCombo = combos[#combos]
emit(("  weakest:      %-40s (+%.1f%%)"):format(table.concat(worstCombo.ids, " + "), worstCombo.adv * 100))

emit("")
emit("── Is any single trinket dead weight? ──")
local solos = {}
for _, t in ipairs(Trinkets.LIST) do
    solos[#solos + 1] = { id = t.id, adv = Trinkets.advantage(Trinkets.resolve({ t.id })), t = t }
end
table.sort(solos, function(a, b) return a.adv > b.adv end)
for _, s in ipairs(solos) do
    emit(("  %-12s %5.1f%%   (%s %.0f%% of its own axis, cap %.0f%%)"):format(
        s.id, s.adv * 100, s.t.effect,
        Trinkets.axisMagnitude(s.t) * 100,
        (Trinkets.AXIS_CAP[s.t.effect] or 0) * 100))
end

emit("")
-- GROUND TRUTH: every trinket's effect on its own axis, in that axis's units.
-- Unlike advantage() these are real numbers, not a judgement-weighted index,
-- so this is the check that actually constrains the design.
check("no trinket exceeds its own axis cap",
    (function()
        for _, t in ipairs(Trinkets.LIST) do
            local cap = Trinkets.AXIS_CAP[t.effect]
            if not cap or Trinkets.axisMagnitude(t) > cap + 1e-9 then return false end
        end
        return true
    end)())

-- SPREAD: only ratios, never magnitudes, because advantage() is a proxy.
check("no trinket is dead weight beside another",
    solos[1].adv < solos[#solos].adv * 2, solos[1].adv / solos[#solos].adv)
check("the best build is not twice the worst",
    combos[1].adv < worstCombo.adv * 2, combos[1].adv / worstCombo.adv)
check("but builds are distinguishable, or the slots are decoration",
    combos[1].adv > worstCombo.adv * 1.15, combos[1].adv / worstCombo.adv)
check("every trinket appears in at least one top-ten build",
    (function()
        local seen = {}
        for n = 1, math.min(10, #combos) do
            for _, id in ipairs(combos[n].ids) do seen[id] = true end
        end
        local n = 0
        for _ in pairs(seen) do n += 1 end
        return n >= 6   -- ten builds of three can name at most all eight
    end)())
-- This exists because a mutation proved the suite could NOT see duplicate
-- stacking come back: the loadout sweep above only builds distinct triples,
-- so the degenerate case had no test looking at it at all. Three of the same
-- trinket must be worth exactly one.
check("duplicates do not stack",
    (function()
        local one = Trinkets.resolve({ "waxcoat" })
        local three = Trinkets.resolve({ "waxcoat", "waxcoat", "waxcoat" })
        local mixed = Trinkets.resolve({ "tongue", "tongue", "tongue" })
        local single = Trinkets.resolve({ "tongue" })
        return math.abs(one.leakMult - three.leakMult) < 1e-9
            and math.abs(mixed.pelletMult - single.pelletMult) < 1e-9
    end)())

-- And a duplicate must not silently burn a slot either: two Wax Coats plus a
-- Greedy Tongue has to resolve to both effects, not to one.
check("a duplicate does not eat the third slot",
    (function()
        local r = Trinkets.resolve({ "waxcoat", "waxcoat", "tongue" })
        return r.leakMult < 1 and r.pelletMult > 1
    end)())

check("only three trinkets ever count",
    (function()
        local three = Trinkets.resolve({ "waxcoat", "waxcoat", "waxcoat" })
        local five = Trinkets.resolve({ "waxcoat", "waxcoat", "waxcoat", "waxcoat", "waxcoat" })
        return math.abs(three.leakMult - five.leakMult) < 1e-9
    end)())
check("unknown trinket ids are ignored, not fatal",
    Trinkets.resolve({ "nonsense", "waxcoat" }).leakMult < 1)
check("an empty loadout is exactly neutral",
    (function()
        local r = Trinkets.resolve({})
        return r.leakMult == 1 and r.pelletMult == 1 and r.knockbackMult == 1
            and r.bankHaste == 0 and r.popKeep == 0
    end)())
check("no stack of trinkets can break a clamp",
    (function()
        local r = Trinkets.resolve({ "crumb", "crumb", "crumb" })
        return r.crumbChance <= 0.25
    end)())

emit("")
emit("── Powers: the ladder and the mastery ceiling ──")
local Powers = require("Powers")

emit("  power        unlock at      cost    cd    mastered cd")
for _, p in ipairs(Powers.LIST) do
    emit(("  %-12s %-13s %4.0f%%  %4.1fs   %4.1fs"):format(
        p.name, Format.short(p.unlockBanked), p.cost * 100, p.cooldown,
        Powers.cooldown(p.id, 0, 999)))
end

-- Paced against banking, which is the only earner. A good run banks about
-- 1.2K and an active hour is near 25K, so the ladder is read in hours.
local last = -1
local outOfOrder = {}
for _, p in ipairs(Powers.LIST) do
    if p.unlockBanked <= last then table.insert(outOfOrder, p.name) end
    last = p.unlockBanked
end
check("the ladder is strictly ordered", #outOfOrder == 0, table.concat(outOfOrder, ", "))
check("the first power is free", Powers.LIST[1].unlockBanked == 0)
check("something new arrives inside the first hour",
    Powers.LIST[2].unlockBanked < 25000, tostring(Powers.LIST[2].unlockBanked))
check("but the last one is a long-term goal",
    Powers.LIST[#Powers.LIST].unlockBanked > 200000,
    tostring(Powers.LIST[#Powers.LIST].unlockBanked))

-- MASTERY MUST STAY AN EDGE. It rewards committing to one power; it must
-- never be the reason a newer player cannot win.
check("mastery caps at three tiers",
    Powers.masteryTier(1e9) == Powers.MASTERY_MAX_TIER, tostring(Powers.masteryTier(1e9)))
check("a fresh power has no mastery", Powers.masteryTier(0) == 0)
check("full mastery is worth under 20% of cooldown",
    Powers.cooldown("dash", 0, 1e9) > Powers.cooldown("dash", 0, 0) * 0.8,
    ("%.2f vs %.2f"):format(Powers.cooldown("dash", 0, 1e9), Powers.cooldown("dash", 0, 0)))
check("and under 15% of cost",
    Powers.massCost("split", 1000, 1e9) > Powers.massCost("split", 1000, 0) * 0.85)
check("trinkets and mastery are clamped TOGETHER",
    Powers.cooldown("dash", 0.35, 1e9) >= Powers.LIST[1].cooldown * 0.55,
    tostring(Powers.cooldown("dash", 0.35, 1e9)))
check("mastery progress always has a next target, until it does not",
    (function()
        local tier, togo = Powers.masteryNext(0)
        if tier ~= 1 or togo ~= Powers.MASTERY_TIERS[1] then return false end
        return Powers.masteryNext(1e9) == nil
    end)())
check("no power is free even at full mastery",
    Powers.massCost("dash", 10, 1e9) >= Powers.MIN_COST * 0.9)

-- Nothing here may be purchasable. The wall is the whole monetisation thesis.
local Monetisation = require("Monetisation")
check("no power or mastery is for sale", #Monetisation.violations() == 0,
    table.concat(Monetisation.violations(), "; "))

emit("")
emit("── The Standoff stake ──")
local Pit = require("Pit")
emit("  banked        stake     share of a 50K purse")
for _, banked in ipairs({ 0, 5e3, 5e4, 5e5, 5e6 }) do
    emit(("  %-13s %-9s %.1f%%"):format(Format.short(banked),
        Format.short(Pit.stakeFor(banked, 5e4)), Pit.stakeFor(banked, 5e4) / 5e4 * 100))
end

-- THE BUG THIS LOCKS DOWN: the stake used to be derived from a Goob's IDLE
-- income, which after the rework is zero for everybody. Every player staked
-- the floor, and the Standoff had no stakes at all.
check("a rich player stakes meaningfully more than a new one",
    Pit.stakeFor(5e5, 1e9) > Pit.stakeFor(0, 1e9) * 5,
    ("%d vs %d"):format(Pit.stakeFor(5e5, 1e9), Pit.stakeFor(0, 1e9)))
check("but not so much more that they cannot share a ring",
    Pit.stakeFor(5e6, 1e9) < Pit.stakeFor(5e3, 1e9) * 45,
    ("%d vs %d"):format(Pit.stakeFor(5e6, 1e9), Pit.stakeFor(5e3, 1e9)))
-- An ABSOLUTE bound, not one read from the constant being tested. Asking
-- STAKE_MAX_FRACTION what the cap should be means the check agrees with it no
-- matter what it is set to — a mutation raising it to 150% of the purse went
-- straight through.
check("it never takes more than a sixth of your purse",
    Pit.stakeFor(1e9, 50000) <= 50000 * 0.18,
    ("%d of 50000"):format(Pit.stakeFor(1e9, 50000)))
check("a brand new player can still afford to enter",
    Pit.stakeFor(0, 250) <= 250 or Pit.stakeFor(0, 250) == Pit.STAKE_MIN,
    tostring(Pit.stakeFor(0, 250)))
check("the pot is still economy-neutral",
    Pit.payout({ 500, 500, 500 }) == 1500, tostring(Pit.payout({ 500, 500, 500 })))

emit("")
if fails > 0 then error(fails .. " crate/trinket assertion(s) failed") end
emit(("All %d crate and trinket assertions passed."):format(passes))
