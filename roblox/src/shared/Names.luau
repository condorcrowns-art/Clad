--!strict
-- Names.luau — every Goob is auto-named at hatch. Names are silly, readable,
-- and pronounceable by a seven-year-old, because the name is what gets shouted
-- across a trading server.

local Names = {}

local FIRST = {
    "Gob", "Blorp", "Squish", "Mun", "Pib", "Wobble", "Drool", "Chomp", "Glug",
    "Nub", "Splat", "Thonk", "Bimble", "Gurp", "Snorf", "Plop", "Yeet", "Crumb",
    "Zorp", "Mopp", "Bap", "Flub", "Gnash", "Slurm", "Quib", "Doof", "Hork",
}

local SECOND = {
    "kin", "ling", "ster", "bo", "zo", "ers", "us", "ito", "ington", "azoid",
    "omatic", "erson", "amus", "ini", "oid", "opolis", "whack", "nugget",
}

local TITLE = {
    "the Damp", "the Round", "Jr.", "Sr.", "the Third", "the Hungry",
    "Esq.", "the Wide", "the Unbothered", "the Enormous", "the Soggy",
    "the Loud", "the Brave", "the Confused", "of the Deep", "the Elder",
}

function Names.random(rng: Random): string
    local name = FIRST[rng:NextInteger(1, #FIRST)] .. SECOND[rng:NextInteger(1, #SECOND)]
    if rng:NextNumber() < 0.30 then
        name ..= " " .. TITLE[rng:NextInteger(1, #TITLE)]
    end
    return name
end

-- Players can rename their Goob. We allow letters, digits, spaces and a couple
-- of punctuation marks only — Roblox's own TextService filter runs on top of
-- this server-side, this is just the cheap structural pass.
function Names.sanitize(raw: string): string?
    if typeof(raw) ~= "string" then return nil end
    local trimmed = raw:match("^%s*(.-)%s*$") or ""
    if #trimmed < 2 or #trimmed > 22 then return nil end
    if trimmed:match("[^%w%s'%.%-!]") then return nil end
    return trimmed
end

return Names
