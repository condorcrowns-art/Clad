--!strict
-- Powers.luau — one button, one big decision.
--
-- Every blob carries exactly ONE power. Not a bar of six, not a combo: one.
-- A nine-year-old on a phone has one thumb free, and the difference between
-- a good player and a bad one should be WHEN they press it, not whether they
-- memorised a rotation.
--
-- Every power costs a slice of your own mass. That is the whole balance model:
-- there is no cooldown-only power, because a cooldown-only power is free, and
-- a free power gets spammed until it is wallpaper. Paying in the same currency
-- you are trying to protect makes every press a real question.
--
-- NOTHING HERE IS FOR SALE. Powers are earned by playing. Monetisation.violations()
-- treats a paid item carrying a power id as a build failure.

local Powers = {}

export type Power = {
    id: string,
    name: string,
    blurb: string,       -- what a kid reads on the button
    cost: number,        -- fraction of current mass, spent on use
    cooldown: number,    -- seconds
    duration: number,    -- seconds of effect, 0 for instant
    unlockBanked: number,-- lifetime banked glob needed to own it
    color: Color3,
}

-- Ordered by unlock, which is also roughly ordered by how much thinking each
-- one asks for. DASH first because it is legible in a quarter of a second.
Powers.LIST = {
    {
        id = "dash", name = "DASH",
        blurb = "Shove yourself forward, fast.",
        cost = 0.08, cooldown = 3.5, duration = 0.22,
        unlockBanked = 0,
        color = Color3.fromRGB(150, 205, 225),
    },
    {
        id = "magnet", name = "MAGNET",
        blurb = "Yank every loose pellet nearby straight into you.",
        cost = 0.05, cooldown = 12, duration = 4,
        unlockBanked = 3000,
        color = Color3.fromRGB(170, 190, 215),
    },
    {
        id = "slick", name = "SLICK",
        blurb = "Drop a puddle. Whoever's chasing you loses the wheel.",
        cost = 0.06, cooldown = 10, duration = 2,
        unlockBanked = 9000,
        color = Color3.fromRGB(160, 175, 150),
    },
    {
        id = "decoy", name = "DECOY",
        blurb = "Leave a fake you. Whoever bites it gets nothing.",
        cost = 0.14, cooldown = 16, duration = 7,
        unlockBanked = 20000,
        color = Color3.fromRGB(180, 176, 190),
    },
    {
        id = "slam", name = "SLAM",
        blurb = "Jump and crash. Everyone nearby gets thrown, lumps shatter.",
        cost = 0.12, cooldown = 14, duration = 0,
        unlockBanked = 34000,
        color = Color3.fromRGB(205, 170, 140),
    },
    {
        id = "beacon", name = "BEACON",
        blurb = "Light yourself up. Food is worth 45% more — and everyone can see you.",
        cost = 0.06, cooldown = 22, duration = 8,
        unlockBanked = 52000,
        color = Color3.fromRGB(206, 186, 132),
    },
    {
        id = "hook", name = "HOOK",
        blurb = "Grab the nearest blob and reel. Bigger pulls, smaller gets pulled.",
        cost = 0.10, cooldown = 13, duration = 1.2,
        unlockBanked = 74000,
        color = Color3.fromRGB(190, 180, 145),
    },
    {
        id = "siphon", name = "SIPHON",
        blurb = "Drain the nearest blob bigger than you.",
        cost = 0.09, cooldown = 19, duration = 3,
        unlockBanked = 100000,
        color = Color3.fromRGB(160, 190, 172),
    },
    {
        id = "bubble", name = "BUBBLE",
        blurb = "Nothing can eat you. You can't eat either.",
        cost = 0.15, cooldown = 20, duration = 3,
        unlockBanked = 132000,
        color = Color3.fromRGB(175, 200, 200),
    },
    {
        id = "split", name = "SPLIT",
        blurb = "Throw half of yourself at them. It comes back.",
        cost = 0.50, cooldown = 18, duration = 8,
        unlockBanked = 170000,
        color = Color3.fromRGB(195, 165, 195),
    },
    {
        id = "blink", name = "BLINK",
        blurb = "Vanish and reappear ahead. Straight through anything.",
        cost = 0.18, cooldown = 17, duration = 0,
        unlockBanked = 215000,
        color = Color3.fromRGB(186, 170, 206),
    },
    {
        id = "spike", name = "SPIKE",
        blurb = "For three seconds, anything that eats you pops instead.",
        cost = 0.20, cooldown = 24, duration = 3,
        unlockBanked = 265000,
        color = Color3.fromRGB(205, 150, 155),
    },
} :: { Power }

-- THE UNLOCK LADDER is paced against banking, which is the only earner: a
-- good run banks roughly 1.2K, and an active hour is somewhere near 25K. So
-- the first four powers arrive inside an hour, the middle four over a week of
-- casual play, and SPIKE sits at about eleven hours of it. The old ladder was
-- written before banking existed and put half the list past any realistic
-- session.
--
-- SPIKE is last and dearest on purpose. It is the tool that lets the smallest
-- blob on the island delete the biggest, which is the single best story this
-- game can produce — and a story stops being a story if it happens every lap.

-- ── Mastery ────────────────────────────────────────────────────────────────
-- Using a power makes you better with THAT power. Not with all of them — the
-- point is to reward committing to one, which is the choice the single slot
-- was already asking you to make. The numbers are deliberately small: three
-- tiers, and a fully mastered power is about 15% quicker and 12% cheaper. It
-- is a reason to keep carrying your favourite, never a reason a newer player
-- cannot beat you.
-- ORDERED BY UNLOCK, and it must stay that way: nextLocked() walks the array
-- and returns the first thing the player cannot afford, so an out-of-order
-- entry points them at a target that is not actually next. Four powers were
-- appended to the end of this list when they were written and it did exactly
-- that until a test caught it.
Powers.MASTERY_TIERS = { 25, 100, 300 }
Powers.MASTERY_COOLDOWN_PER_TIER = 0.05
Powers.MASTERY_COST_PER_TIER = 0.04
Powers.MASTERY_MAX_TIER = 3

function Powers.masteryTier(uses: number?): number
    local n = uses or 0
    local tier = 0
    for _, need in ipairs(-- ORDERED BY UNLOCK, and it must stay that way: nextLocked() walks the array
-- and returns the first thing the player cannot afford, so an out-of-order
-- entry points them at a target that is not actually next. Four powers were
-- appended to the end of this list when they were written and it did exactly
-- that until a test caught it.
Powers.MASTERY_TIERS) do
        if n >= need then tier += 1 end
    end
    return tier
end

-- Uses still to go before the next tier, and what that tier is. nil when the
-- power is fully mastered — a progress bar that never fills is worse than no
-- progress bar.
function Powers.masteryNext(uses: number?): (number?, number?)
    local n = uses or 0
    for i, need in ipairs(-- ORDERED BY UNLOCK, and it must stay that way: nextLocked() walks the array
-- and returns the first thing the player cannot afford, so an out-of-order
-- entry points them at a target that is not actually next. Four powers were
-- appended to the end of this list when they were written and it did exactly
-- that until a test caught it.
Powers.MASTERY_TIERS) do
        if n < need then return i, need - n end
    end
    return nil, nil
end

local byId: { [string]: Power } = {}
for _, p in ipairs(Powers.LIST) do
    byId[p.id] = p
end

Powers.DEFAULT = "dash"

function Powers.get(id: string): Power?
    return byId[id]
end

function Powers.owned(lifetimeBanked: number): { Power }
    local out = {}
    for _, p in ipairs(Powers.LIST) do
        if lifetimeBanked >= p.unlockBanked then
            out[#out + 1] = p
        end
    end
    return out
end

function Powers.isOwned(id: string, lifetimeBanked: number): boolean
    local p = byId[id]
    return p ~= nil and lifetimeBanked >= p.unlockBanked
end

-- What using it actually costs right now, in mass. Floored at a flat minimum
-- so that a tiny blob cannot dash for free and kite the whole server.
function Powers.massCost(id: string, mass: number, uses: number?): number
    local p = byId[id]
    if not p then
        return 0
    end
    local relief = math.min(Powers.MASTERY_MAX_TIER, Powers.masteryTier(uses))
        * Powers.MASTERY_COST_PER_TIER
    return math.max(Powers.MIN_COST, mass * p.cost * (1 - relief))
end

Powers.MIN_COST = 3

function Powers.cooldown(id: string, trinketHaste: number?, uses: number?): number
    local p = byId[id]
    if not p then
        return 0
    end
    local mastery = math.min(Powers.MASTERY_MAX_TIER, Powers.masteryTier(uses))
        * Powers.MASTERY_COOLDOWN_PER_TIER
    -- Clamped TOGETHER, not separately. Trinket haste caps at 35% and mastery
    -- at 15%; without a joint clamp a stacked player could reach half, and a
    -- power on a half cooldown stops being a decision.
    local total = math.clamp((trinketHaste or 0) + mastery, 0, 0.45)
    return p.cooldown * (1 - total)
end

-- The next power a player is working towards, for the HUD's progress line.
-- Returning the goal AND the gap is what makes a locked item feel like a
-- target rather than a wall.
function Powers.nextLocked(lifetimeBanked: number): (Power?, number)
    for _, p in ipairs(Powers.LIST) do
        if lifetimeBanked < p.unlockBanked then
            return p, p.unlockBanked - lifetimeBanked
        end
    end
    return nil, 0
end

return Powers
