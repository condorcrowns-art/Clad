--!strict
-- Cosmetics.luau — what you wear, and where it can come from.
--
-- THE HARD RULE, enforced by the `source` field on every entry:
-- cosmetics may be BOUGHT, but power, mass, age and Secrets may never be. The
-- moment Robux touches the economy, the trading market dies — the balance sim
-- already caught that failure once arriving through the shop, and a cash
-- register is the same failure wearing a different hat.
--
-- So everything here is visual. Nothing in this file changes a number.

local Cosmetics = {}

export type Item = {
    id: string,
    name: string,
    kind: string,        -- skin | trail | eyes | crown
    rarity: string,
    source: string,      -- starter | season | shop | ascend | achievement | event
    tier: number?,       -- season tier that grants it
    premium: boolean?,   -- season premium track only
    colour: Color3?,
    material: Enum.Material?,
    emoji: string?,
}

Cosmetics.KINDS = { "skin", "trail", "eyes", "crown" }

Cosmetics.RARITY_COLOUR = {
    Common    = Color3.fromRGB(190, 195, 205),
    Uncommon  = Color3.fromRGB(121, 224, 141),
    Rare      = Color3.fromRGB(121, 169, 224),
    Epic      = Color3.fromRGB(171, 121, 224),
    Legendary = Color3.fromRGB(224, 188, 121),
    Mythic    = Color3.fromRGB(224, 121, 145),
}

local function rgb(r, g, b) return Color3.fromRGB(r, g, b) end

Cosmetics.ITEMS = {
    -- ── Skins: the body itself ─────────────────────────────────────────────
    -- No colour: the default skin keeps the Goob's own hue, which is its
    -- identity. Transparency is set by RollService, not here.
    { id = "skin_default", name = "Classic Goo",   kind = "skin", rarity = "Common",
      source = "starter", material = Enum.Material.Glass },
    { id = "skin_jelly",   name = "Jelly",         kind = "skin", rarity = "Common",
      source = "season", tier = 3, material = Enum.Material.Glass, colour = rgb(224, 123, 158) },
    { id = "skin_bubble",  name = "Soap Bubble",   kind = "skin", rarity = "Uncommon",
      source = "season", tier = 8, material = Enum.Material.ForceField },
    { id = "skin_stone",   name = "Boulder",       kind = "skin", rarity = "Uncommon",
      source = "shop", material = Enum.Material.Slate, colour = rgb(130, 128, 122) },
    { id = "skin_chrome",  name = "Chrome",        kind = "skin", rarity = "Rare",
      source = "season", tier = 18, material = Enum.Material.Metal, colour = rgb(209, 215, 224) },
    { id = "skin_lava",    name = "Molten",        kind = "skin", rarity = "Epic",
      source = "season", tier = 28, premium = true, material = Enum.Material.Neon, colour = rgb(224, 155, 121) },
    { id = "skin_void",    name = "Void",          kind = "skin", rarity = "Epic",
      source = "shop", material = Enum.Material.Neon, colour = rgb( 27,  22,  41) },
    { id = "skin_prism",   name = "Prism",         kind = "skin", rarity = "Legendary",
      source = "season", tier = 45, premium = true, material = Enum.Material.Glass, colour = rgb(158, 194, 224) },
    { id = "skin_ancient", name = "Ancient Amber", kind = "skin", rarity = "Legendary",
      source = "ascend", material = Enum.Material.Glass, colour = rgb(224, 184, 121) },
    { id = "skin_goldleaf",name = "Gold Leaf",     kind = "skin", rarity = "Mythic",
      source = "achievement", material = Enum.Material.Foil, colour = rgb(224, 196, 121) },

    -- ── Trails ─────────────────────────────────────────────────────────────
    { id = "trail_none",   name = "No Trail",      kind = "trail", rarity = "Common", source = "starter" },
    { id = "trail_dust",   name = "Dust Puff",     kind = "trail", rarity = "Common",
      source = "season", tier = 2, colour = rgb(220, 210, 190) },
    { id = "trail_spark",  name = "Sparks",        kind = "trail", rarity = "Uncommon",
      source = "season", tier = 11, colour = rgb(224, 194, 121) },
    { id = "trail_frost",  name = "Frost",         kind = "trail", rarity = "Rare",
      source = "shop", colour = rgb(141, 202, 224) },
    { id = "trail_flame",  name = "Flame",         kind = "trail", rarity = "Epic",
      source = "season", tier = 33, premium = true, colour = rgb(224, 156, 121) },
    { id = "trail_rainbow",name = "Rainbow",       kind = "trail", rarity = "Legendary",
      source = "season", tier = 50, premium = true, colour = rgb(224, 224, 224) },
    { id = "trail_crest",  name = "Crest Wake",    kind = "trail", rarity = "Mythic",
      source = "ascend", colour = rgb(224, 211, 150) },

    -- ── Eyes ───────────────────────────────────────────────────────────────
    { id = "eyes_default", name = "Googly",        kind = "eyes", rarity = "Common", source = "starter", emoji = "👀" },
    { id = "eyes_sleepy",  name = "Sleepy",        kind = "eyes", rarity = "Common",
      source = "season", tier = 5, emoji = "😴" },
    { id = "eyes_angry",   name = "Cross",         kind = "eyes", rarity = "Uncommon",
      source = "season", tier = 14, emoji = "😠" },
    { id = "eyes_star",    name = "Starstruck",    kind = "eyes", rarity = "Rare",
      source = "shop", emoji = "🤩" },
    { id = "eyes_cyber",   name = "Visor",         kind = "eyes", rarity = "Epic",
      source = "season", tier = 24, premium = true, emoji = "🕶️" },
    { id = "eyes_ghost",   name = "Hollow",        kind = "eyes", rarity = "Legendary",
      source = "achievement", emoji = "👻" },

    -- ── Crowns: worn above the nameplate ──────────────────────────────────
    { id = "crown_none",   name = "Bare Head",     kind = "crown", rarity = "Common", source = "starter", emoji = "" },
    { id = "crown_party",  name = "Party Hat",     kind = "crown", rarity = "Common",
      source = "season", tier = 6, emoji = "🎉" },
    { id = "crown_cap",    name = "Cap",           kind = "crown", rarity = "Common",
      source = "shop", emoji = "🧢" },
    { id = "crown_horns",  name = "Horns",         kind = "crown", rarity = "Uncommon",
      source = "season", tier = 16, emoji = "😈" },
    { id = "crown_halo",   name = "Halo",          kind = "crown", rarity = "Rare",
      source = "season", tier = 22, emoji = "😇" },
    { id = "crown_pit",    name = "Pit Champion",  kind = "crown", rarity = "Epic",
      source = "achievement", emoji = "🥇" },
    { id = "crown_gold",   name = "Ascendant",     kind = "crown", rarity = "Legendary",
      source = "ascend", emoji = "👑" },
}

local byId: { [string]: Item } = {}
for _, item in ipairs(Cosmetics.ITEMS) do byId[item.id] = item end

function Cosmetics.get(id: string): Item?
    return byId[id]
end

function Cosmetics.ofKind(kind: string): { Item }
    local out = {}
    for _, item in ipairs(Cosmetics.ITEMS) do
        if item.kind == kind then table.insert(out, item) end
    end
    return out
end

-- Everything a brand-new player starts with. There is always at least one
-- option per slot so the wardrobe is never an empty room.
function Cosmetics.starterLoadout(): { [string]: string }
    return { skin = "skin_default", trail = "trail_none", eyes = "eyes_default", crown = "crown_none" }
end

function Cosmetics.starterOwned(): { [string]: boolean }
    local owned = {}
    for _, item in ipairs(Cosmetics.ITEMS) do
        if item.source == "starter" then owned[item.id] = true end
    end
    return owned
end

-- Equip validation. Returns the corrected loadout rather than erroring, so a
-- profile that references a cosmetic removed in a later patch still loads.
function Cosmetics.sanitise(loadout: { [string]: string }?, owned: { [string]: boolean }?)
    local starter = Cosmetics.starterLoadout()
    local out = {}
    for _, kind in ipairs(Cosmetics.KINDS) do
        local wanted = loadout and loadout[kind]
        local item = wanted and byId[wanted]
        if item and item.kind == kind and owned and owned[wanted] then
            out[kind] = wanted
        else
            out[kind] = starter[kind]
        end
    end
    return out
end

function Cosmetics.owns(owned: { [string]: boolean }?, id: string): boolean
    return owned ~= nil and owned[id] == true
end

-- Rewards granted by reaching an ascension count / achievement, so the flexiest
-- items in the game are earned rather than bought.
Cosmetics.ASCEND_REWARDS = {
    [1]  = "crown_gold",
    [3]  = "trail_crest",
    [6]  = "skin_ancient",
}

Cosmetics.ACHIEVEMENTS = {
    { id = "pitwins5",   cosmetic = "crown_pit",     label = "Win 5 Sumo Pit matches" },
    { id = "secret1",    cosmetic = "eyes_ghost",    label = "Catch a Secret" },
    { id = "colossal3",  cosmetic = "skin_goldleaf", label = "Reach Colossal 3 times" },
}

return Cosmetics
