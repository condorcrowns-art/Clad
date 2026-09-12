--!strict
-- Feedstock.luau — the catalogue of everything a Goob can swallow.
--
-- DESIGN NOTE: the contents of a Goob are VISIBLE through its translucent
-- body. That means this list is not just loot-table data, it is the art of the
-- game. A Goob stuffed with 300 rubber ducks looks completely different from
-- one stuffed with 300 traffic cones, and that visual difference is the
-- player's entire flex. So every entry needs a distinct silhouette and colour.

export type Item = {
    id: string,
    name: string,
    mass: number,          -- how much mass it contributes once digested
    rarity: string,
    weight: number,        -- relative spawn chance among critters
    color: Color3,
    shape: string,         -- Ball | Block | Cylinder | Wedge  (visible inside the Goob)
    scale: Vector3,
}

local function rgb(r, g, b) return Color3.fromRGB(r, g, b) end

local Feedstock = {}

Feedstock.RARITY_ORDER = { "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Secret" }

Feedstock.RARITY_COLOR = {
    Common    = rgb(190, 195, 205),
    Uncommon  = rgb(120, 225, 140),
    Rare      = rgb(105, 175, 255),
    Epic      = rgb(190, 130, 255),
    Legendary = rgb(255, 190,  70),
    Mythic    = rgb(255, 105, 140),
    Secret    = rgb(255, 255, 255),
}

-- BALANCE NOTE (measured, not guessed — see roblox/tools/balance.luau)
--
-- The first pass had Secret items at 0.9M-4M mass. Simulating 300 players
-- showed that one Pocket Singularity accounted for 69-93% of a player's
-- ENTIRE progression to Colossal, and Secret items alone were 48% of all value
-- in the game. That makes the game a slot machine: twenty hours of play gets
-- erased by one drop, and there is nothing left worth trading because a single
-- Secret outweighs everything a player could offer for it.
--
-- So the top of the ladder is deliberately compressed. The rule now is:
-- NO SINGLE DROP MAY EXCEED ~5% OF THE COLOSSAL MILESTONE.
--
-- Secrets are still the rarest things in the game (1 in ~20,000), they still
-- sit visibly inside your Goob forever, and they are still what people will
-- trade for. They are COLLECTIBLES, not power spikes. That distinction is what
-- keeps the economy liquid: if the rarest item were also the most powerful,
-- nobody would ever part with one and the market would seize.
Feedstock.ITEMS = {
    -- Common ────────────────────────────────────────────────────────────────
    { id = "sock",     name = "Lost Sock",       mass = 1,     rarity = "Common",    weight = 100, color = rgb(235, 235, 240), shape = "Block",    scale = Vector3.new(0.5, 0.9, 0.3) },
    { id = "pebble",   name = "Pebble",          mass = 1,     rarity = "Common",    weight = 100, color = rgb(150, 148, 140), shape = "Ball",     scale = Vector3.new(0.5, 0.5, 0.5) },
    { id = "acorn",    name = "Acorn",           mass = 2,     rarity = "Common",    weight =  85, color = rgb(150, 105,  55), shape = "Ball",     scale = Vector3.new(0.45, 0.6, 0.45) },
    { id = "can",      name = "Dented Can",      mass = 3,     rarity = "Common",    weight =  70, color = rgb(195, 200, 210), shape = "Cylinder", scale = Vector3.new(0.7, 0.55, 0.55) },
    { id = "cone",     name = "Traffic Cone",    mass = 4,     rarity = "Common",    weight =  60, color = rgb(255, 110,  40), shape = "Wedge",    scale = Vector3.new(0.7, 0.9, 0.7) },

    -- Uncommon ──────────────────────────────────────────────────────────────
    { id = "duck",     name = "Rubber Duck",     mass = 12,    rarity = "Uncommon",  weight = 42, color = rgb(255, 215,  60), shape = "Ball",     scale = Vector3.new(0.8, 0.7, 1.0) },
    { id = "pizza",    name = "Cold Pizza",      mass = 15,    rarity = "Uncommon",  weight = 38, color = rgb(235, 165,  75), shape = "Wedge",    scale = Vector3.new(1.1, 0.2, 1.1) },
    { id = "boot",     name = "Big Boot",        mass = 18,    rarity = "Uncommon",  weight = 32, color = rgb(105,  70,  50), shape = "Block",    scale = Vector3.new(0.7, 0.8, 1.2) },
    { id = "toaster",  name = "Toaster",         mass = 24,    rarity = "Uncommon",  weight = 26, color = rgb(215, 220, 230), shape = "Block",    scale = Vector3.new(1.0, 0.8, 0.7) },

    -- Rare ──────────────────────────────────────────────────────────────────
    { id = "anvil",    name = "Anvil",           mass = 90,    rarity = "Rare",      weight = 17, color = rgb( 85,  88,  95), shape = "Block",    scale = Vector3.new(1.2, 0.8, 0.7) },
    { id = "piano",    name = "Tiny Piano",      mass = 120,   rarity = "Rare",      weight = 13, color = rgb( 40,  40,  46), shape = "Block",    scale = Vector3.new(1.4, 0.9, 1.0) },
    { id = "globe",    name = "Globe",           mass = 150,   rarity = "Rare",      weight = 11, color = rgb( 80, 150, 210), shape = "Ball",     scale = Vector3.new(1.1, 1.1, 1.1) },

    -- Epic ──────────────────────────────────────────────────────────────────
    { id = "meteor",   name = "Warm Meteor",     mass = 600,   rarity = "Epic",      weight = 6.0, color = rgb(120,  70,  55), shape = "Ball",     scale = Vector3.new(1.4, 1.4, 1.4) },
    { id = "statue",   name = "Marble Statue",   mass = 820,   rarity = "Epic",      weight = 4.5, color = rgb(240, 238, 230), shape = "Block",    scale = Vector3.new(0.9, 2.0, 0.9) },
    { id = "safe",     name = "Bank Safe",       mass = 1100,  rarity = "Epic",      weight = 3.2, color = rgb( 60,  75,  70), shape = "Block",    scale = Vector3.new(1.3, 1.5, 1.3) },

    -- Legendary ─────────────────────────────────────────────────────────────
    { id = "car",      name = "Rusty Car",       mass = 4500,  rarity = "Legendary", weight = 1.4, color = rgb(190,  65,  60), shape = "Block",    scale = Vector3.new(1.2, 0.9, 2.6) },
    { id = "bell",     name = "Cathedral Bell",  mass = 6200,  rarity = "Legendary", weight = 0.9, color = rgb(205, 165,  70), shape = "Cylinder", scale = Vector3.new(1.8, 1.8, 1.8) },

    -- Mythic ────────────────────────────────────────────────────────────────
    { id = "moon",     name = "Chunk of Moon",   mass = 20000, rarity = "Mythic",    weight = 0.22, color = rgb(225, 228, 240), shape = "Ball",    scale = Vector3.new(2.4, 2.4, 2.4) },
    { id = "blackbox", name = "The Black Box",   mass = 30000, rarity = "Mythic",    weight = 0.14, color = rgb( 25,  25,  32), shape = "Block",   scale = Vector3.new(1.6, 1.6, 1.6) },

    -- Secret ────────────────────────────────────────────────────────────────
    -- Deliberately absurd odds. These exist to be screenshotted and traded,
    -- not to be farmed. ~1 in 40,000 catches.
    { id = "goobfsl",  name = "Goob Fossil",     mass = 120000, rarity = "Secret", weight = 0.020, color = rgb(255, 250, 205), shape = "Ball",  scale = Vector3.new(2.0, 2.0, 2.0) },
    { id = "singular", name = "Pocket Singularity", mass = 250000, rarity = "Secret", weight = 0.006, color = rgb( 10,  10,  14), shape = "Ball", scale = Vector3.new(1.5, 1.5, 1.5) },
}

local byId: { [string]: Item } = {}
local totalWeight = 0
for _, item in ipairs(Feedstock.ITEMS) do
    byId[item.id] = item
    totalWeight += item.weight
end

Feedstock.TOTAL_WEIGHT = totalWeight

function Feedstock.get(id: string): Item?
    return byId[id]
end

-- Weighted roll.
--
-- `luck` > 1 shifts the roll toward better items. `allowSecret` defaults to
-- true; the Snack Stand passes FALSE, and that is a deliberate design rule:
--
--   ⭐ SECRETS CANNOT BE BOUGHT. THEY ONLY COME FROM WILD CATCHES. ⭐
--
-- Why it exists: simulation showed a 40-roll Banquet at luck x4 put Secret
-- odds at 1 in ~104 per purchase. On a brand-new Goob one such purchase
-- yielded 292,000 mass — 19x the average and 6% of the entire Colossal
-- milestone, bought with 27 minutes of AFK income on day one. That is the
-- slot-machine failure mode all over again, and worse, it lets money buy the
-- collectibles the whole trading economy is built on.
--
-- Locking Secrets to the wild loop fixes both at once: the active loop gets a
-- reward the idle loop can NEVER provide, and the rarest items in the game
-- stay earned rather than purchased.
--
-- Luck is also capped per tier rather than applied flat, so a high-luck roll
-- reliably improves the MIDDLE of the table (where steady progression lives)
-- instead of buying lottery tickets at the top.
local LUCK_CAP = {
    Common    = 0,    -- luck only ever reduces these
    Uncommon  = 0,
    Rare      = 3.0,
    Epic      = 3.0,
    Legendary = 2.0,
    Mythic    = 1.5,  -- deliberately weak; Mythics should still feel like luck
    Secret    = 1.0,  -- never boosted, even on a wild catch
}

function Feedstock.roll(rng: Random, luck: number?, allowSecret: boolean?): Item
    local l = math.max(1, luck or 1)
    local permitSecret = allowSecret ~= false

    local sum = 0
    local acc = {}
    for _, item in ipairs(Feedstock.ITEMS) do
        if item.rarity == "Secret" and not permitSecret then
            continue
        end
        local w = item.weight
        if l > 1 then
            local cap = LUCK_CAP[item.rarity] or 1
            if cap <= 0 then
                w /= l              -- commons get rarer as luck rises
            else
                w *= math.min(l, cap)
            end
        end
        sum += w
        table.insert(acc, { item = item, acc = sum })
    end

    local pick = rng:NextNumber() * sum
    for _, entry in ipairs(acc) do
        if pick <= entry.acc then return entry.item end
    end
    return acc[#acc] and acc[#acc].item or Feedstock.ITEMS[1]
end

return Feedstock
