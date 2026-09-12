--!strict
-- Crates.luau — the gacha, with the two things gacha usually gets wrong
-- deliberately fixed.
--
-- WRONG THING 1: paid crates holding what free crates do not.
-- Every crate in this game is bought with Glob, which is earned by banking.
-- Robux buys the Beta Pass and skins off the shop shelf directly; it does not
-- buy a roll, and it does not buy a better table. A kid with no money and an
-- hour has the same access as a kid with fifty dollars and ten minutes.
--
-- WRONG THING 2: the invisible cliff.
-- Every crate has hard pity. The counter is shown on the button. A player can
-- always answer "how far am I from the good one", which is the difference
-- between anticipation and being farmed.

local Cosmetics = require(script.Parent.Cosmetics)
local Trinkets = require(script.Parent.Trinkets)

local Crates = {}

export type Reward = {
    kind: string,      -- cosmetic | trinket | glob
    id: string,
    name: string,
    rarity: string,
    amount: number?,   -- for glob
}

export type Crate = {
    id: string,
    name: string,
    blurb: string,
    price: number,         -- in Glob. There is no other currency here.
    sources: { string },   -- Cosmetics.source values this crate draws from
    trinkets: boolean,     -- may it roll trinkets
    weights: { [string]: number },
    pity: number,          -- rolls until a guaranteed Rare-or-better
    pityFloor: string,
    dupeGlob: { [string]: number },
}

-- Weights are per-rarity, not per-item: adding a new Epic skin later must not
-- silently make Epics more common. The roll picks a rarity first, then picks
-- uniformly inside it.
Crates.LIST = {
    {
        id = "goop", name = "Goop Crate",
        blurb = "The everyday one. Mostly skins and trails.",
        price = 1000,
        sources = { "crate_goop" },
        trinkets = true,
        weights = { Common = 62, Uncommon = 26, Rare = 9, Epic = 2.6, Legendary = 0.4 },
        pity = 12, pityFloor = "Rare",
        dupeGlob = { Common = 120, Uncommon = 300, Rare = 900, Epic = 2600, Legendary = 7000, Mythic = 15000 },
    },
    {
        id = "deep", name = "Deep Crate",
        blurb = "Costs a real session. Holds the trinkets.",
        price = 9000,
        sources = { "crate_deep", "crate_goop" },
        trinkets = true,
        weights = { Common = 18, Uncommon = 34, Rare = 31, Epic = 13, Legendary = 3.4, Mythic = 0.6 },
        pity = 8, pityFloor = "Epic",
        dupeGlob = { Common = 400, Uncommon = 900, Rare = 2200, Epic = 5500, Legendary = 14000, Mythic = 30000 },
    },
    {
        id = "beta", name = "Beta Crate",
        blurb = "Season 0 only. Never printed again.",
        price = 0,   -- earned from Beta Season tiers, not sold
        sources = { "beta" },
        trinkets = false,
        weights = { Rare = 52, Epic = 33, Legendary = 12, Mythic = 3 },
        pity = 4, pityFloor = "Epic",
        dupeGlob = { Rare = 3000, Epic = 7000, Legendary = 18000, Mythic = 40000 },
    },
} :: { Crate }

local byId: { [string]: Crate } = {}
for _, c in ipairs(Crates.LIST) do
    byId[c.id] = c
end

function Crates.get(id: string): Crate?
    return byId[id]
end

-- Everything a crate can possibly produce, grouped by rarity. Built lazily and
-- cached, because it is read on every roll and the catalogue never changes at
-- runtime.
local poolCache: { [string]: { [string]: { Reward } } } = {}

local function pool(crate: Crate): { [string]: { Reward } }
    local cached = poolCache[crate.id]
    if cached then
        return cached
    end
    local byRarity: { [string]: { Reward } } = {}
    local function add(r: Reward)
        local bucket = byRarity[r.rarity]
        if not bucket then
            bucket = {}
            byRarity[r.rarity] = bucket
        end
        bucket[#bucket + 1] = r
    end
    for _, item in ipairs(Cosmetics.ITEMS) do
        for _, src in ipairs(crate.sources) do
            if item.source == src then
                add({ kind = "cosmetic", id = item.id, name = item.name, rarity = item.rarity })
                break
            end
        end
    end
    if crate.trinkets then
        for _, t in ipairs(Trinkets.LIST) do
            add({ kind = "trinket", id = t.id, name = t.name, rarity = t.rarity })
        end
    end
    poolCache[crate.id] = byRarity
    return byRarity
end

Crates.RARITY_ORDER = { "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic" }

local rank: { [string]: number } = {}
for i, r in ipairs(Crates.RARITY_ORDER) do
    rank[r] = i
end

function Crates.atLeast(rarity: string, floor: string): boolean
    return (rank[rarity] or 0) >= (rank[floor] or 99)
end

-- Roll one crate.
--
-- `sinceGood` is how many rolls the player has made on this crate without
-- hitting the pity floor. When it reaches the pity count the rarity roll is
-- restricted to the floor and above — which is why the counter can be shown
-- honestly on the button instead of hinted at.
--
-- Returns the reward and the new sinceGood.
function Crates.roll(crateId: string, rng: Random, sinceGood: number): (Reward?, number)
    local crate = byId[crateId]
    if not crate then
        return nil, sinceGood
    end
    local byRarity = pool(crate)
    local forced = sinceGood + 1 >= crate.pity

    local total, acc = 0, {}
    for rarity, weight in pairs(crate.weights) do
        local bucket = byRarity[rarity]
        if bucket and #bucket > 0 then
            if not forced or Crates.atLeast(rarity, crate.pityFloor) then
                total += weight
                acc[#acc + 1] = { rarity = rarity, acc = total }
            end
        end
    end
    if total <= 0 then
        return nil, sinceGood
    end
    -- Sort for determinism: pairs() order over a hash table is not stable, and
    -- a gacha whose outcome depends on table iteration order is a gacha that
    -- cannot be tested or audited.
    table.sort(acc, function(a, b)
        return (rank[a.rarity] or 0) < (rank[b.rarity] or 0)
    end)
    local running = 0
    for _, e in ipairs(acc) do
        running += crate.weights[e.rarity]
        e.acc = running
    end

    local pick = rng:NextNumber() * total
    local chosen = acc[#acc].rarity
    for _, e in ipairs(acc) do
        if pick <= e.acc then
            chosen = e.rarity
            break
        end
    end

    local bucket = byRarity[chosen]
    local reward = bucket[rng:NextInteger(1, #bucket)]

    local nextSince = if Crates.atLeast(chosen, crate.pityFloor) then 0 else sinceGood + 1
    return reward, nextSince
end

-- Duplicates convert to Glob rather than vanishing. A duplicate that gives
-- nothing is the single fastest way to teach a player that opening crates is
-- a waste of time.
function Crates.dupeValue(crateId: string, rarity: string): number
    local crate = byId[crateId]
    if not crate then
        return 0
    end
    return crate.dupeGlob[rarity] or 0
end

function Crates.rollsUntilPity(crateId: string, sinceGood: number): number
    local crate = byId[crateId]
    if not crate then
        return 0
    end
    return math.max(0, crate.pity - sinceGood)
end

return Crates
