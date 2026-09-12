--!strict
-- PitService.luau — runs Sumo Pit matches.
--
-- Server-authoritative on everything that decides money: who is in the ring,
-- who got shoved, who won, who pays. The client owns its ball's movement for
-- responsiveness, but it does not get a vote on the outcome of a staked match.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local TweenService = game:GetService("TweenService")

local Shared = game.ReplicatedStorage.GoobShared
local Pit = require(Shared.Pit)
local Movement = require(Shared.Movement)
local Format = require(Shared.Format)
local GoobMath = require(Shared.GoobMath)

local PitService = {}

PitService.onNotify = Instance.new("BindableEvent")
PitService.onSync = Instance.new("BindableEvent")
PitService.onResult = Instance.new("BindableEvent")   -- (winner, pot, entrants)

type Entrant = { player: Player, stake: number, alive: boolean }

local queue: { Entrant } = {}
local match: { entrants: { Entrant }, startedAt: number, pot: number }? = nil
local lobbyUntil = 0
local ringPart: BasePart? = nil

-- Injected by init.server so this module needs no knowledge of the others.
PitService.getProfile = function(_: Player): any return nil end
PitService.getGoob = function(_: Player): any return nil end
PitService.getBall = function(_: Player): BasePart? return nil end
-- Injected so the Pit can move fighters without the anti-cheat undoing it.
PitService.teleport = function(_: Player, _pos: Vector3) end
PitService.awardXp = function(_: Player, _source: string) end

local function notify(player: Player, msg: string, kind: string?)
    PitService.onNotify:Fire(player, msg, kind or "info")
end

local function broadcastState()
    local names = {}
    for _, e in ipairs(match and match.entrants or queue) do
        if not match or e.alive then table.insert(names, e.player.DisplayName) end
    end
    PitService.onSync:Fire({
        inMatch = match ~= nil,
        queued = #queue,
        minPlayers = Pit.MIN_PLAYERS,
        maxPlayers = Pit.MAX_PLAYERS,
        lobbySeconds = match and 0 or math.max(0, math.ceil(lobbyUntil - os.clock())),
        elapsed = match and (os.clock() - match.startedAt) or 0,
        matchSeconds = Pit.MATCH_SECONDS,
        radius = match and Pit.radiusAt(os.clock() - match.startedAt) or Pit.START_RADIUS,
        alive = names,
        pot = match and match.pot or 0,
        potText = Format.short(match and match.pot or 0),
    })
end

local function inQueue(player: Player): number?
    for i, e in ipairs(queue) do
        if e.player == player then return i end
    end
    return nil
end

function PitService.isFighting(player: Player): boolean
    if not match then return false end
    for _, e in ipairs(match.entrants) do
        if e.player == player and e.alive then return true end
    end
    return false
end

function PitService.join(player: Player)
    if match then
        notify(player, "A match is already running — wait for the next one.", "warn")
        return
    end
    if inQueue(player) then return end
    if #queue >= Pit.MAX_PLAYERS then
        notify(player, "The Pit is full this round.", "warn")
        return
    end

    local profile = PitService.getProfile(player)
    local goob = PitService.getGoob(player)
    if not profile or not goob then return end

    local stake = Pit.stakeFor(GoobMath.incomePerSecond(goob))
    if profile.glob < stake then
        notify(player, ("You need 💧%s to enter."):format(Format.short(stake)), "warn")
        return
    end

    table.insert(queue, { player = player, stake = stake, alive = true })
    notify(player, ("🥊 Entered the Pit. Stake 💧%s. %d/%d waiting.")
        :format(Format.short(stake), #queue, Pit.MIN_PLAYERS), "good")

    if #queue >= Pit.MIN_PLAYERS and lobbyUntil <= os.clock() then
        lobbyUntil = os.clock() + Pit.LOBBY_SECONDS
    end
    broadcastState()
end

function PitService.leave(player: Player)
    local i = inQueue(player)
    if i then
        table.remove(queue, i)
        notify(player, "Left the Pit queue.", "info")
        if #queue < Pit.MIN_PLAYERS then lobbyUntil = 0 end
        broadcastState()
    end
end

local function eliminate(entrant: Entrant, reason: string)
    if not entrant.alive then return end
    entrant.alive = false
    notify(entrant.player, "💀 Knocked out! " .. reason, "warn")
    PitService.teleport(entrant.player,
        Pit.CENTRE + Vector3.new(0, 8, Pit.START_RADIUS + 70))
end

local function startMatch()
    local entrants = {}
    local pot = 0
    for _, e in ipairs(queue) do
        local profile = PitService.getProfile(e.player)
        -- Re-check affordability: Glob may have been spent while queueing.
        if profile and profile.glob >= e.stake then
            profile.glob -= e.stake
            pot += e.stake
            e.alive = true
            table.insert(entrants, e)
            PitService.awardXp(e.player, "pitEnter")
        else
            notify(e.player, "You couldn't cover the stake — sat out.", "warn")
        end
    end
    queue = {}
    lobbyUntil = 0

    if #entrants < Pit.MIN_PLAYERS then
        -- Refund and abort rather than running a one-player match.
        for _, e in ipairs(entrants) do
            local profile = PitService.getProfile(e.player)
            if profile then profile.glob += e.stake end
            notify(e.player, "Not enough fighters — stake refunded.", "info")
        end
        broadcastState()
        return
    end

    match = { entrants = entrants, startedAt = os.clock(), pot = pot }

    for i, e in ipairs(entrants) do
        local a = (i - 1) / #entrants * math.pi * 2
        PitService.teleport(e.player, Pit.CENTRE
            + Vector3.new(math.cos(a) * (Pit.START_RADIUS * 0.6), 10,
                          math.sin(a) * (Pit.START_RADIUS * 0.6)))
        notify(e.player, ("🥊 FIGHT! Pot: 💧%s"):format(Format.short(pot)), "good")
    end
    broadcastState()
end

local function endMatch()
    if not match then return end
    local alive = {}
    for _, e in ipairs(match.entrants) do
        if e.alive then table.insert(alive, e) end
    end

    local winner = alive[1]
    if #alive > 1 then
        -- Timer ran out with several standing: biggest Goob takes it, which is
        -- the only tiebreak that cannot be gamed by hiding at the edge.
        table.sort(alive, function(a, b)
            local ga, gb = PitService.getGoob(a.player), PitService.getGoob(b.player)
            return (ga and ga.mass or 0) > (gb and gb.mass or 0)
        end)
        winner = alive[1]
    end

    local pot = Pit.payout({ match.pot })
    if winner then
        local profile = PitService.getProfile(winner.player)
        if profile then
            profile.glob += pot
            profile.pitWins = (profile.pitWins or 0) + 1
        end
        PitService.awardXp(winner.player, "pitWin")
        notify(winner.player, ("🥇 YOU WON THE PIT! +💧%s"):format(Format.short(pot)), "good")
        PitService.onResult:Fire(winner.player, pot, match.entrants)
    else
        -- Everyone fell out at once: split it back rather than eating it.
        local share = pot / math.max(1, #match.entrants)
        for _, e in ipairs(match.entrants) do
            local profile = PitService.getProfile(e.player)
            if profile then profile.glob += share end
            notify(e.player, "Everyone fell out — the pot was split back.", "info")
        end
    end

    match = nil
    broadcastState()
end

function PitService.start()
    -- The visible ring.
    task.spawn(function()
        local world = Workspace:WaitForChild("GoobWorld")
        ringPart = world:WaitForChild("PitRing") :: BasePart
    end)

    task.spawn(function()
        while true do
            task.wait(0.1)

            if not match then
                if #queue >= Pit.MIN_PLAYERS and lobbyUntil > 0 and os.clock() >= lobbyUntil then
                    startMatch()
                end
            else
                local elapsed = os.clock() - match.startedAt
                local radius = Pit.radiusAt(elapsed)

                if ringPart then
                    ringPart.Size = Vector3.new(1.5, radius * 2, radius * 2)
                end

                -- Eliminations.
                local aliveCount = 0
                for _, e in ipairs(match.entrants) do
                    if e.alive then
                        local ball = PitService.getBall(e.player)
                        if not ball or not ball.Parent or not e.player.Parent then
                            eliminate(e, "left the arena")
                        elseif not Pit.isInside(ball.Position, elapsed) then
                            eliminate(e, "out of the ring!")
                        else
                            aliveCount += 1
                        end
                    end
                end

                -- Shoves. O(n^2) over at most 8 entrants, ten times a second.
                for i = 1, #match.entrants do
                    for j = i + 1, #match.entrants do
                        local a, b = match.entrants[i], match.entrants[j]
                        if a.alive and b.alive then
                            local ba, bb = PitService.getBall(a.player), PitService.getBall(b.player)
                            local ga, gb = PitService.getGoob(a.player), PitService.getGoob(b.player)
                            if ba and bb and ga and gb then
                                local delta = bb.Position - ba.Position
                                local touching = (ba.Size.X + bb.Size.X) / 2 + 2
                                if delta.Magnitude < touching and delta.Magnitude > 0.01 then
                                    local dir = delta.Unit
                                    local shareA, shareB = Pit.shove(
                                        ga.mass, ba.AssemblyLinearVelocity,
                                        gb.mass, bb.AssemblyLinearVelocity)
                                    ba.AssemblyLinearVelocity = ba.AssemblyLinearVelocity
                                        - dir * (Pit.SHOVE_IMPULSE * shareA)
                                    bb.AssemblyLinearVelocity = bb.AssemblyLinearVelocity
                                        + dir * (Pit.SHOVE_IMPULSE * shareB)
                                end
                            end
                        end
                    end
                end

                if aliveCount <= 1 or elapsed >= Pit.MATCH_SECONDS then
                    endMatch()
                end
            end
            broadcastState()
        end
    end)
end

function PitService.cleanup(player: Player)
    PitService.leave(player)
    if match then
        for _, e in ipairs(match.entrants) do
            if e.player == player then e.alive = false end
        end
    end
end

function PitService.state()
    return { inMatch = match ~= nil, queued = #queue }
end

return PitService
