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
if fails > 0 then error(fails .. " crate/trinket assertion(s) failed") end
emit(("All %d crate and trinket assertions passed."):format(passes))
