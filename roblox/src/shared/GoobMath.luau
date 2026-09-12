--!strict
-- GoobMath.luau — the single source of truth for how a Goob's numbers work.
-- Shared between server (authority) and client (prediction/display) so the HUD
-- never disagrees with the server about how big your Goob is.

local Config = require(script.Parent.Config)

local GoobMath = {}

export type Goob = {
    id: string,
    nickname: string,
    hue: number,            -- 0-1, the body tint
    mass: number,
    stomach: { { id: string, mass: number } },
    bornAt: number,         -- os.time() at hatch; NEVER reset, travels via trade
    inheritedAge: number,   -- extra seconds absorbed from gulped Goobs
    lineage: { string },    -- nicknames of every Goob this one has eaten
    contents: { [string]: number }, -- itemId -> count, for the visible interior
}

-- Real age in seconds, including age inherited from gulped Goobs.
function GoobMath.ageSeconds(goob: Goob, now: number?): number
    return math.max(0, (now or os.time()) - goob.bornAt) + (goob.inheritedAge or 0)
end

function GoobMath.ageTier(goob: Goob, now: number?)
    local age = GoobMath.ageSeconds(goob, now)
    local best = Config.AGE_TIERS[1]
    for _, tier in ipairs(Config.AGE_TIERS) do
        if age >= tier.seconds then best = tier else break end
    end
    return best
end

function GoobMath.ageMultiplier(goob: Goob, now: number?): number
    return GoobMath.ageTier(goob, now).mult
end

-- POWER is the headline number. It is mass scaled by the age multiplier, so an
-- old Goob genuinely outclasses a freshly-farmed one of the same size. This is
-- the whole anti-inflation thesis expressed in one line.
function GoobMath.power(goob: Goob, now: number?): number
    return goob.mass * GoobMath.ageMultiplier(goob, now)
end

-- Physical radius in studs.
--
-- Logarithmic, so each ORDER OF MAGNITUDE of mass is a roughly equal visible
-- step. See the long note in Config about why a cube root is the wrong curve
-- here — it saturates inside the first few hours of play and then every Goob
-- in the server looks the same.
function GoobMath.size(goob: Goob): number
    local ratio = math.max(1, goob.mass / Config.STARTING_MASS)
    local s = Config.SIZE_BASE * (1 + Config.SIZE_LOG_K * math.log(ratio))
    return math.min(s, Config.SIZE_MAX)
end

function GoobMath.isColossal(goob: Goob): boolean
    return goob.mass >= Config.COLOSSAL_MASS
end

-- Glob per second. Sub-linear so newcomers are never hopelessly behind.
function GoobMath.incomePerSecond(goob: Goob, now: number?): number
    local p = GoobMath.power(goob, now)
    return (p ^ Config.INCOME_EXPONENT) * Config.INCOME_SCALE
end

-- How much stomach mass converts to body mass this frame.
function GoobMath.digestStep(goob: Goob, dt: number): number
    local pending = 0
    for _, entry in ipairs(goob.stomach) do pending += entry.mass end
    if pending <= 0 then return 0 end

    local rate = Config.DIGEST_RATE
    if #goob.stomach > Config.STOMACH_SOFT_CAP then
        rate *= Config.STOMACH_OVERFULL_PENALTY
    end
    return pending * math.min(1, rate * dt)
end

-- Can goob A swallow goob B? Guards against a level-1 Goob eating a whale's
-- Goob in a scam trade, and against eating something so tiny it's pointless.
function GoobMath.canGulp(a: Goob, b: Goob): (boolean, string?)
    if a.id == b.id then return false, "A Goob can't gulp itself." end
    if b.mass > a.mass / Config.GULP_MIN_MASS_RATIO then
        return false, "That Goob is far too big for yours to swallow."
    end
    return true
end

-- Perform the gulp. Returns a NEW mass/age for A. B is destroyed by the caller.
-- Note the transfer is lossy on purpose: mass is permanently burned out of the
-- world every time this runs. That is the deflation engine.
function GoobMath.applyGulp(a: Goob, b: Goob, now: number?): ()
    local n = now or os.time()
    a.mass += b.mass * Config.GULP_MASS_TRANSFER
    a.inheritedAge = (a.inheritedAge or 0) + GoobMath.ageSeconds(b, n) * Config.GULP_AGE_TRANSFER

    -- Absorb the visible contents so the interior tells the full story.
    for itemId, count in pairs(b.contents) do
        a.contents[itemId] = (a.contents[itemId] or 0) + count
    end

    -- Lineage: the eaten Goob's name, and everything IT ever ate, is recorded.
    table.insert(a.lineage, b.nickname)
    for _, ancestor in ipairs(b.lineage) do
        table.insert(a.lineage, ancestor)
    end
    -- Cap the stored lineage so a 10,000-generation Goob doesn't blow the
    -- DataStore 4MB limit. We keep the most recent 60 names.
    while #a.lineage > 60 do table.remove(a.lineage, 1) end
end

-- Price of a snack tier, in Glob, for this Goob right now.
--
-- Expressed as "N seconds of your own income", so the stand stays exactly as
-- affordable at 1e12 mass as it was at 100. Shared with the client so the
-- price on the button is always the price the server charges.
function GoobMath.snackPrice(goob: Goob, tier: any, now: number?): number
    return GoobMath.incomePerSecond(goob, now) * tier.seconds * Config.SNACK_MARKUP
end

function GoobMath.generation(goob: Goob): number
    return #goob.lineage + 1
end

return GoobMath
