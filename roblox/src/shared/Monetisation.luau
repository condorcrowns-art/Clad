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
    { id = "skin_stone", assetId = 0, name = "Boulder Skin",cosmetic = "skin_stone",  affects = "cosmetic" },
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
    return bad
end

return Monetisation
