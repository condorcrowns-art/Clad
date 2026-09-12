--!strict
-- Season.luau — the retention track.
--
-- XP comes from PLAYING, never from paying. The premium track unlocks a second
-- reward column on tiers you have already earned; it does not sell tiers, and
-- it does not sell anything that touches mass, age, luck or Secrets.
--
-- Seasons also rotate which Secrets can spawn. That is not a cosmetic detail —
-- it is the scarcity thesis expressed as a calendar. Last season's Secrets can
-- never be produced again, so a two-season-old Secret is genuinely finite in a
-- way no drop rate can fake.

local Cosmetics = require(script.Parent.Cosmetics)

local Season = {}

Season.CURRENT = 1
Season.NAME = "Season 1 · First Roll"
Season.TIERS = 50
-- Paced so that a dedicated player hitting the daily cap finishes in ~40 days,
-- i.e. a season takes a season. An earlier pass had the whole 50-tier track
-- completing in EIGHT days, which would have left the most engaged players with
-- nothing to chase for five weeks out of six. The suite now asserts the
-- completion window rather than trusting the constants to stay sane.
Season.XP_PER_TIER = 5600

-- What each action is worth. Deliberately weighted so the track rewards the
-- whole game rather than whichever loop is most afk-able.
Season.XP = {
    catch      = 4,
    secret     = 800,
    snack      = 12,
    egg        = 150,
    gulp       = 110,
    trade      = 90,
    ascend     = 3200,
    pitEnter   = 30,
    pitWin     = 300,
    crewGoal   = 1100,
    -- Banking is the arena's core loop, so it is the arena's core XP source.
    -- 55 a bank and a ~90-second bank puts the daily cap about three hours
    -- out, which is the same shape the rest of the track was paced to.
    bank       = 55,
    bigBank    = 260,   -- a run taken past 60% of the ceiling before cashing
    pop        = 15,    -- you get something for dying; it is still play
}

-- Daily cap on grindable XP, so the track takes a season rather than a weekend
-- and nobody feels obliged to play eight hours a day. Big one-off events
-- (ascend, pit wins) are exempt — those are achievements, not grinding.
-- ~1750 catches, or about two hours of engaged play, to cap out for the day.
Season.DAILY_CAP = 7000
Season.UNCAPPED = { ascend = true, pitWin = true, secret = true, crewGoal = true }

function Season.blank()
    return {
        id = Season.CURRENT,
        xp = 0,
        premium = false,
        claimedFree = {} :: { [string]: boolean },
        claimedPremium = {} :: { [string]: boolean },
        dailyXp = 0,
        dailyStamp = 0,
    }
end

function Season.tierOf(xp: number): number
    return math.clamp(math.floor(xp / Season.XP_PER_TIER) + 1, 1, Season.TIERS)
end

function Season.progressInTier(xp: number): number
    return (xp % Season.XP_PER_TIER) / Season.XP_PER_TIER
end

-- The reward table, derived from the cosmetics catalogue rather than duplicated
-- so the two can never disagree about which tier grants what.
local rewardCache: { [number]: { free: string?, premium: string? } }? = nil

function Season.rewards(): { [number]: { free: string?, premium: string? } }
    if rewardCache then return rewardCache end
    local out = {}
    for i = 1, Season.TIERS do out[i] = {} end
    for _, item in ipairs(Cosmetics.ITEMS) do
        if item.source == "season" and item.tier then
            local slot = out[item.tier]
            if slot then
                if item.premium then slot.premium = item.id else slot.free = item.id end
            end
        end
    end
    rewardCache = out
    return out
end

function Season.rewardAt(tier: number, premium: boolean): string?
    local row = Season.rewards()[tier]
    if not row then return nil end
    return premium and row.premium or row.free
end

-- Award XP, honouring the daily cap and the new-day reset.
function Season.award(state: any, source: string, now: number?): (number, boolean)
    if not state then return 0, false end
    local amount = Season.XP[source]
    if not amount then return 0, false end

    local day = math.floor((now or os.time()) / 86400)
    if state.dailyStamp ~= day then
        state.dailyStamp = day
        state.dailyXp = 0
    end

    if not Season.UNCAPPED[source] then
        local room = math.max(0, Season.DAILY_CAP - (state.dailyXp or 0))
        amount = math.min(amount, room)
        if amount <= 0 then return 0, false end
        state.dailyXp = (state.dailyXp or 0) + amount
    end

    local before = Season.tierOf(state.xp)
    state.xp += amount
    local after = Season.tierOf(state.xp)
    return amount, after > before
end

-- Which tiers are earned but unclaimed, per track.
function Season.claimable(state: any): { { tier: number, premium: boolean, cosmetic: string } }
    local out = {}
    if not state then return out end
    local tier = Season.tierOf(state.xp)
    for t = 1, tier do
        local key = tostring(t)
        local free = Season.rewardAt(t, false)
        if free and not (state.claimedFree or {})[key] then
            table.insert(out, { tier = t, premium = false, cosmetic = free })
        end
        if state.premium then
            local prem = Season.rewardAt(t, true)
            if prem and not (state.claimedPremium or {})[key] then
                table.insert(out, { tier = t, premium = true, cosmetic = prem })
            end
        end
    end
    return out
end

function Season.markClaimed(state: any, tier: number, premium: boolean)
    local key = tostring(tier)
    if premium then
        state.claimedPremium = state.claimedPremium or {}
        state.claimedPremium[key] = true
    else
        state.claimedFree = state.claimedFree or {}
        state.claimedFree[key] = true
    end
end

-- Rolling a season wipes progress but NOT owned cosmetics. Losing what you
-- earned would be the one thing that makes a battle pass feel like a scam.
function Season.rollIfNeeded(state: any): boolean
    if not state or state.id == Season.CURRENT then return false end
    local fresh = Season.blank()
    fresh.premium = false
    for k, v in pairs(fresh) do state[k] = v end
    return true
end

return Season
