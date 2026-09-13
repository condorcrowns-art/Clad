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
    fixed: boolean?,     -- always in the hotbar; not a choice
    season: boolean?,    -- granted by the season's free track, never by banking
    color: Color3,
}

-- ── THE TWO YOU ALWAYS HAVE ───────────────────────────────────────────────
--
-- DASH and SPLIT are not choices, they are verbs the game is built out of. A
-- game in this shape needs a lunge and a way to throw part of yourself at
-- something out of reach; without both, half the situations on the island have
-- no answer at all.
--
-- They used to sit in the same pool as everything else, competing for the one
-- carried slot — and SPLIT was pinned near the top of the unlock ladder, which
-- meant the mechanic the whole genre is named for was invisible for the first
-- ten hours. Now they are slots 1 and 2, owned from the first second, and the
-- chosen power is slot 3.
--
-- They still cost mass like everything else. That is the balance model and it
-- does not get an exception: a free button is a button that gets held down.
Powers.FIXED = {
    {
        id = "dash", name = "DASH",
        blurb = "Shove yourself forward, fast.",
        cost = 0.05, cooldown = 3.0, duration = 0.22,
        unlockBanked = 0, fixed = true,
        color = Color3.fromRGB(210, 210, 214),
    },
    {
        id = "split", name = "SPLIT",
        blurb = "Throw three pieces of yourself forward, tethered to you.",
        -- Cheaper and far quicker than the old one-shot 50% lunge. SPLIT is
        -- meant to be a move you make several times a round — to reach food,
        -- to fence somebody off, to commit to a kill — not a once-a-minute
        -- gamble with half your body.
        cost = 0.22, cooldown = 9, duration = 6,
        unlockBanked = 0, fixed = true,
        color = Color3.fromRGB(180, 180, 186),
    },
} :: { Power }

-- ── THE ONE YOU CHOOSE ────────────────────────────────────────────────────
--
-- ORDERED BY UNLOCK, and it must stay that way: nextLocked() walks this array
-- and returns the first thing the player cannot afford, so an out-of-order
-- entry points them at a target that is not actually next. Four powers were
-- appended to the end of this list when they were written and it did exactly
-- that until a test caught it.
--
-- Roughly ordered by how much thinking each one asks for, too.
Powers.LIST = {
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
        id = "blink", name = "BLINK",
        blurb = "Vanish and reappear ahead. Straight through anything.",
        cost = 0.18, cooldown = 17, duration = 0,
        unlockBanked = 215000,
        color = Color3.fromRGB(186, 170, 206),
    },
    } :: { Power }

-- ── EARNED FROM THE BETA SEASON, NOT FROM BANKING ─────────────────────────
--
-- These are not on the ladder and no amount of Glob reaches them. The only way
-- in is playing far enough into the season's FREE track (Season.POWER_AT), and
-- that is deliberate on two counts.
--
-- It makes the season pass worth finishing with something a skin cannot be:
-- a button nobody who skipped the season has. And it keeps the monetisation
-- wall intact, because the free track is the one thing in this game that
-- cannot be bought at any price — `Monetisation.violations()` fails the build
-- if a purchasable item carries a gameplay number, and a power is the most
-- gameplay-carrying thing there is.
--
-- They are kept OUT of Powers.LIST so that `nextLocked` never points a player
-- at a target no amount of play on the banking ladder will reach.
Powers.SEASON = {
    {
        id = "hook", name = "HOOK",
        blurb = "Grab the nearest blob and reel. Bigger pulls, smaller gets pulled.",
        cost = 0.10, cooldown = 13, duration = 1.2,
        unlockBanked = math.huge, season = true,
        color = Color3.fromRGB(214, 214, 218),
    },
    {
        id = "spike", name = "SPIKE",
        blurb = "For three seconds, anything that eats you pops instead.",
        cost = 0.20, cooldown = 24, duration = 3,
        unlockBanked = math.huge, season = true,
        color = Color3.fromRGB(226, 106, 106),
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
    for i, need in ipairs(Powers.MASTERY_TIERS) do
        if n < need then return i, need - n end
    end
    return nil, nil
end

-- Both pools, by id. FIXED first so that if a power ever appeared in both by
-- mistake the fixed definition is the one that loses — a duplicate should show
-- up as the CHOSEN version being unreachable, which is visible, rather than as
-- the hotbar quietly using different numbers from the wardrobe.
local byId: { [string]: Power } = {}
for _, p in ipairs(Powers.FIXED) do
    byId[p.id] = p
end
for _, p in ipairs(Powers.SEASON) do
    byId[p.id] = p
end
for _, p in ipairs(Powers.LIST) do
    byId[p.id] = p
end

-- The default CHOSEN power — slot 3. Not dash: dash is slot 1 and always has
-- been since the hotbar existed, so defaulting the choice to it would hand a
-- new player a duplicate and an empty-feeling third button.
Powers.DEFAULT = "magnet"

--- What is in each hotbar slot, given what the player owns and what they chose.
--- ONE function, server and client both read it, so "what is in slot 3" cannot
--- have two answers.
function Powers.hotbar(chosenId: string?, lifetimeBanked: number,
    granted: { [string]: boolean }?): { Power }
    local out = { Powers.FIXED[1], Powers.FIXED[2] }
    local chosen = byId[chosenId or ""]
    -- A chosen power that is fixed, unknown, or not yet unlocked falls back to
    -- the default rather than leaving a hole: an empty slot reads as a bug,
    -- and this happens legitimately every time the ladder is rebalanced under
    -- a saved profile.
    local haveIt = chosen ~= nil
        and (lifetimeBanked >= chosen.unlockBanked
            or (granted ~= nil and granted[chosen.id] == true))
    if not chosen or chosen.fixed or not haveIt then
        chosen = byId[Powers.DEFAULT]
    end
    if chosen then
        out[3] = chosen
    end
    return out
end

function Powers.get(id: string): Power?
    return byId[id]
end

-- TWO WAYS TO OWN A POWER, and `granted` is the second one.
--
-- Most are earned on the banking ladder. Two are not on that ladder at all and
-- arrive from the BETA SEASON's free track instead — see Season.POWER_AT. They
-- live in `profile.powersGranted`, and the important property is that there is
-- no third way in: the season's paid track cannot reach them, because
-- Season.powerAt takes no premium argument.
function Powers.owned(lifetimeBanked: number, granted: { [string]: boolean }?): { Power }
    local out = {}
    for _, p in ipairs(Powers.LIST) do
        if lifetimeBanked >= p.unlockBanked or (granted and granted[p.id]) then
            out[#out + 1] = p
        end
    end
    for _, p in ipairs(Powers.SEASON) do
        if granted and granted[p.id] then
            out[#out + 1] = p
        end
    end
    return out
end

--- Every power a player could ever choose from, owned or not — the wardrobe
--- needs to show the locked ones or nobody learns they exist.
function Powers.catalogue(): { Power }
    local out = {}
    for _, p in ipairs(Powers.LIST) do out[#out + 1] = p end
    for _, p in ipairs(Powers.SEASON) do out[#out + 1] = p end
    return out
end

function Powers.isOwned(id: string, lifetimeBanked: number,
    granted: { [string]: boolean }?): boolean
    local p = byId[id]
    if not p then return false end
    if granted and granted[id] then return true end
    return lifetimeBanked >= p.unlockBanked
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
