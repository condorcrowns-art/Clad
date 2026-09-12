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
        unlockBanked = 4000,
        color = Color3.fromRGB(170, 190, 215),
    },
    {
        id = "slick", name = "SLICK",
        blurb = "Drop a puddle. Whoever's chasing you loses the wheel.",
        cost = 0.06, cooldown = 10, duration = 2,
        unlockBanked = 12000,
        color = Color3.fromRGB(160, 175, 150),
    },
    {
        id = "slam", name = "SLAM",
        blurb = "Jump and crash. Everyone nearby gets thrown, lumps shatter.",
        cost = 0.12, cooldown = 14, duration = 0,
        unlockBanked = 30000,
        color = Color3.fromRGB(205, 170, 140),
    },
    {
        id = "hook", name = "HOOK",
        blurb = "Grab the nearest blob and reel. Bigger pulls, smaller gets pulled.",
        cost = 0.10, cooldown = 13, duration = 1.2,
        unlockBanked = 60000,
        color = Color3.fromRGB(190, 180, 145),
    },
    {
        id = "bubble", name = "BUBBLE",
        blurb = "Nothing can eat you. You can't eat either.",
        cost = 0.15, cooldown = 20, duration = 3,
        unlockBanked = 110000,
        color = Color3.fromRGB(175, 200, 200),
    },
    {
        id = "split", name = "SPLIT",
        blurb = "Throw half of yourself at them. It comes back.",
        cost = 0.50, cooldown = 18, duration = 8,
        unlockBanked = 190000,
        color = Color3.fromRGB(195, 165, 195),
    },
    {
        id = "spike", name = "SPIKE",
        blurb = "For three seconds, anything that eats you pops instead.",
        cost = 0.20, cooldown = 24, duration = 3,
        unlockBanked = 300000,
        color = Color3.fromRGB(205, 150, 155),
    },
} :: { Power }

-- SPIKE is last and dearest on purpose. It is the tool that lets the smallest
-- blob on the island delete the biggest, which is the single best story this
-- game can produce — and a story stops being a story if it happens every lap.

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
function Powers.massCost(id: string, mass: number): number
    local p = byId[id]
    if not p then
        return 0
    end
    return math.max(Powers.MIN_COST, mass * p.cost)
end

Powers.MIN_COST = 3

function Powers.cooldown(id: string, trinketHaste: number?): number
    local p = byId[id]
    if not p then
        return 0
    end
    return p.cooldown * (1 - math.clamp(trinketHaste or 0, 0, 0.5))
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
