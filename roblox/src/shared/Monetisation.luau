--!strict
-- Monetisation.luau — what may be sold, and the wall around the economy.
--
-- THE WALL: Robux may buy expression and convenience. It may never buy mass,
-- age, luck, Secrets, or a trading advantage. The balance simulation already
-- caught the failure where money reached the collectibles through the snack
-- shop; a cash register is the same failure in a different coat.
--
-- Every product below is checked against that rule by the test suite, so
-- adding a pay-to-win item is a build failure rather than a judgement call.

local Monetisation = {}

-- Replace the zeros with real IDs from the Creator Dashboard. They are kept
-- here rather than inline so there is exactly one place to edit, and so the
-- suite can assert that nothing unconfigured is ever shown for sale.
Monetisation.GAMEPASSES = {
    {
        id = "premium_pass",
        assetId = 0,
        name = "Season Pass — Premium",
        blurb = "Unlocks the second reward column on tiers you have already earned.",
        grants = "season_premium",
        affects = "cosmetic",
    },
    {
        id = "extra_slots",
        assetId = 0,
        name = "+4 Goob Slots",
        blurb = "Room for twelve Goobs instead of eight. Slots hold; they do not generate.",
        grants = "goob_slots_4",
        affects = "convenience",
    },
    {
        id = "double_glob",
        assetId = 0,
        name = "2× Glob",
        blurb = "Doubles passive income. Glob only buys snacks and eggs, both deliberately weak.",
        grants = "glob_2x",
        affects = "convenience",
    },
}

Monetisation.PRODUCTS = {
    { id = "skin_void",  assetId = 0, name = "Void Skin",   cosmetic = "skin_void",   affects = "cosmetic" },
    -- Was "skin_stone", a grey Boulder, which no longer exists: the skin
    -- catalogue went neon so that the greyscale interface has something to
    -- frame. Magma replaces it on the shelf. The check in systems.luau caught
    -- this the moment the catalogue changed, which is exactly what a shelf
    -- pointing at a missing item should do — an unconfigured purchase prompt
    -- fails silently in Studio and reads to the player as a scam.
    { id = "skin_magma", assetId = 0, name = "Magma Skin",  cosmetic = "skin_magma",  affects = "cosmetic" },
    { id = "trail_frost",assetId = 0, name = "Frost Trail", cosmetic = "trail_frost", affects = "cosmetic" },
    { id = "eyes_star",  assetId = 0, name = "Starstruck",  cosmetic = "eyes_star",   affects = "cosmetic" },
    { id = "crown_cap",  assetId = 0, name = "Cap",         cosmetic = "crown_cap",   affects = "cosmetic" },
}

-- The allowed categories. Anything else is pay-to-win by definition.
Monetisation.ALLOWED_EFFECTS = { cosmetic = true, convenience = true }

-- Things that must NEVER appear as a purchasable grant, named explicitly so the
-- rule is testable rather than aspirational.
Monetisation.FORBIDDEN_GRANTS = {
    "mass", "power", "age", "crest", "secret", "luck", "drop_rate",
    "trade_fee", "market", "goob", "ascend",
}

function Monetisation.isConfigured(entry: any): boolean
    return (entry.assetId or 0) > 0
end

-- Only offer what has a real asset id behind it. Showing an unconfigured
-- product is a purchase prompt that silently fails, which reads as a scam.
function Monetisation.purchasable(list: { any }): { any }
    local out = {}
    for _, e in ipairs(list) do
        if Monetisation.isConfigured(e) then table.insert(out, e) end
    end
    return out
end

function Monetisation.violations(): { string }
    local bad = {}
    local function scan(list, label)
        for _, e in ipairs(list) do
            if not Monetisation.ALLOWED_EFFECTS[e.affects or ""] then
                table.insert(bad, ("%s/%s has affects=%q"):format(label, e.id, tostring(e.affects)))
            end
            local grant = tostring(e.grants or e.cosmetic or "")
            for _, forbidden in ipairs(Monetisation.FORBIDDEN_GRANTS) do
                -- "goob_slots_4" is a slot, not a Goob; match whole words only.
                if grant == forbidden or grant:match("^" .. forbidden .. "$") then
                    table.insert(bad, ("%s/%s grants %q"):format(label, e.id, grant))
                end
            end
        end
    end
    scan(Monetisation.GAMEPASSES, "gamepass")
    scan(Monetisation.PRODUCTS, "product")

    -- ── THE PREMIUM SEASON TRACK IS PURCHASABLE, SO IT IS INSIDE THE WALL ──
    --
    -- This was a hole. The wall scanned gamepasses and products and stopped,
    -- but the premium season track is bought with Robux too — so a power
    -- placed on it would have been money buying a button nobody else has, and
    -- nothing here would have said a word.
    --
    -- It is now structurally hard to do (Season.powerAt takes no premium
    -- argument, so there is nowhere to put one) and checked anyway. Structure
    -- stops the accident; this stops somebody deciding to add the argument.
    local okSeason, Season = pcall(function()
        return require(script.Parent.Season)
    end)
    local okPowers, Powers = pcall(function()
        return require(script.Parent.Powers)
    end)
    if okSeason and okPowers and Season and Powers then
        local isPower = {}
        for _, pool in ipairs({ Powers.FIXED, Powers.LIST, Powers.SEASON }) do
            for _, power in ipairs(pool or {}) do isPower[power.id] = true end
        end
        for tier = 1, (Season.TIERS or 0) do
            local paid = Season.rewardAt(tier, true)
            if paid and isPower[paid] then
                table.insert(bad,
                    ("season/premium tier %d grants the power %q"):format(tier, paid))
            end
        end
    end

    return bad
end

return Monetisation
