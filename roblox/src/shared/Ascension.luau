--!strict
-- Ascension.luau — the terminus.
--
-- Numbers that only ever rise have no end, so nothing is ever an achievement.
-- At Colossal you may Ascend: the Goob is consumed — permanently, on the same
-- rule as every other sink in this game — and you keep a Crest.
--
-- This is not a reset, it is the scoreboard. Crests are worn on the nameplate
-- where the whole server can read them, and each one permanently multiplies how
-- much mass you get from food, so every run after the first is shorter.

local Config = require(script.Parent.Config)

local Ascension = {}

Ascension.BONUS_PER_CREST = 0.18   -- +18% food value per crest, compounding
Ascension.MAX_CRESTS = 25          -- bounds the compounding; ~55x at the cap
Ascension.ALTAR_RANGE = 34

-- Compounding, not additive: additive stops mattering by crest 10, and the
-- whole point of a prestige loop is that each run is meaningfully faster.
function Ascension.foodMultiplier(crests: number): number
    local n = math.clamp(crests or 0, 0, Ascension.MAX_CRESTS)
    return (1 + Ascension.BONUS_PER_CREST) ^ n
end

function Ascension.canAscend(goob: any, crests: number): (boolean, string?)
    if not goob then return false, "No Goob." end
    if (crests or 0) >= Ascension.MAX_CRESTS then
        return false, "You've earned every Crest there is."
    end
    if goob.mass < Config.COLOSSAL_MASS then
        return false, "Your Goob must reach COLOSSAL first."
    end
    return true
end

-- What the player is about to trade away, spelled out. Ascension is
-- irreversible and destroys the thing they spent days on, so the confirmation
-- has to state the loss in plain words, not just the gain.
function Ascension.preview(goob: any, crests: number)
    local next_ = math.min((crests or 0) + 1, Ascension.MAX_CRESTS)
    return {
        losing = goob and goob.nickname or "?",
        losingMass = goob and goob.mass or 0,
        losingAge = goob and ((goob.bornAt and (os.time() - goob.bornAt)) or 0) + (goob and goob.inheritedAge or 0),
        crestsAfter = next_,
        multiplierBefore = Ascension.foodMultiplier(crests or 0),
        multiplierAfter = Ascension.foodMultiplier(next_),
    }
end

return Ascension
