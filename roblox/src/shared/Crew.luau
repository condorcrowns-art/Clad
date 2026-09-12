--!strict
-- Crew.luau — lightweight crews.
--
-- I argued against this in DESIGN.md and the argument was: guilds solve
-- COORDINATION, and the game had nothing to coordinate. A crew system then
-- would have been a roster, a chat tab and a name tag — surface area with no
-- payoff.
--
-- The Sumo Pit changes that. There is now a shared, repeatable objective worth
-- pursuing together, so a crew gets a weekly target that no one person can hit
-- alone and everybody's contribution is visible.
--
-- It stays deliberately small: no ranks, no permissions tree, no bank, no crew
-- vs crew war. Those are answers to problems this game does not have yet.

local Crew = {}

Crew.MAX_MEMBERS = 20
Crew.TAG_LENGTH = 4
Crew.CREATE_COST_SECONDS = 600   -- ten minutes of your income

-- One weekly target that rotates, so a crew always has a current answer to
-- "what are we doing". Each is reachable by a handful of active members.
Crew.GOALS = {
    { id = "catches", label = "Catch %s things",       target = 4000,  metric = "catches" },
    { id = "gulps",   label = "Gulp %s Goobs",          target = 120,   metric = "gulps" },
    { id = "pit",     label = "Win %s Pit matches",     target = 45,    metric = "pitWins" },
    { id = "trades",  label = "Complete %s trades",     target = 150,   metric = "trades" },
    { id = "ascend",  label = "Ascend %s times",        target = 12,    metric = "ascensions" },
}

Crew.REWARD_GLOB_SECONDS = 1800  -- half an hour of income, each

function Crew.goalForWeek(week: number)
    return Crew.GOALS[(week % #Crew.GOALS) + 1]
end

function Crew.currentWeek(now: number?): number
    return math.floor((now or os.time()) / (7 * 86400))
end

-- Tags are what appear on a nameplate, so they must be short, loud and free of
-- anything that reads as impersonation or an insult once filtered.
function Crew.sanitiseTag(raw: string): string?
    if typeof(raw) ~= "string" then return nil end
    local t = raw:upper():gsub("[^A-Z0-9]", "")
    if #t < 2 or #t > Crew.TAG_LENGTH then return nil end
    return t
end

function Crew.sanitiseName(raw: string): string?
    if typeof(raw) ~= "string" then return nil end
    local n = raw:match("^%s*(.-)%s*$") or ""
    if #n < 3 or #n > 20 then return nil end
    if n:match("[^%w%s'%-!]") then return nil end
    return n
end

function Crew.blank(id: string, name: string, tag: string, ownerId: number, week: number)
    return {
        id = id,
        name = name,
        tag = tag,
        ownerId = ownerId,
        members = { [tostring(ownerId)] = { name = "", joined = os.time(), contributed = 0 } },
        week = week,
        progress = 0,
        claimed = {} :: { [string]: boolean },
    }
end

function Crew.memberCount(crew: any): number
    local n = 0
    for _ in pairs(crew.members or {}) do n += 1 end
    return n
end

function Crew.isFull(crew: any): boolean
    return Crew.memberCount(crew) >= Crew.MAX_MEMBERS
end

-- Reset progress when the week rolls, but never wipe membership.
function Crew.rollWeek(crew: any, week: number): boolean
    if crew.week == week then return false end
    crew.week = week
    crew.progress = 0
    crew.claimed = {}
    for _, m in pairs(crew.members or {}) do m.contributed = 0 end
    return true
end

function Crew.contribute(crew: any, userId: number, metric: string, amount: number, week: number): boolean
    Crew.rollWeek(crew, week)
    local goal = Crew.goalForWeek(week)
    if goal.metric ~= metric then return false end
    crew.progress = math.min(goal.target, (crew.progress or 0) + amount)
    local m = crew.members and crew.members[tostring(userId)]
    if m then m.contributed = (m.contributed or 0) + amount end
    return crew.progress >= goal.target
end

function Crew.isComplete(crew: any, week: number): boolean
    return (crew.progress or 0) >= Crew.goalForWeek(week).target
end

function Crew.hasClaimed(crew: any, userId: number): boolean
    return (crew.claimed or {})[tostring(userId)] == true
end

function Crew.markClaimed(crew: any, userId: number)
    crew.claimed = crew.claimed or {}
    crew.claimed[tostring(userId)] = true
end

return Crew
