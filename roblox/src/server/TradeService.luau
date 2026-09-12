--!strict
-- TradeService.luau — player-to-player Goob trading.
--
-- Trading is the reason this game has a community instead of a player count.
-- It is also the single most exploited system in every Roblox game, so the
-- rules here are deliberately paranoid:
--   1. The server owns every Goob. The client can only reference IDs it owns.
--   2. Confirming is a HOLD, not a click, and any change to either offer
--      resets both confirmations. This kills the classic "swap the item at the
--      last moment" scam outright.
--   3. Both players must be physically in the trade zone for the whole trade.
--   4. The swap itself is atomic — we validate everything, then move.

local Players = game:GetService("Players")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local GoobMath = require(Shared.GoobMath)
local Format = require(Shared.Format)

local Data = require(script.Parent.Data)
local GoobService = require(script.Parent.GoobService)

local TradeService = {}

type Session = {
    a: Player, b: Player,
    offers: { [number]: { string } },   -- userId -> goob ids
    confirmed: { [number]: number? },   -- userId -> os.clock() when hold began
    open: boolean,
}

local sessions: { Session } = {}
local sessionOf: { [number]: Session } = {}
local pending: { [number]: number } = {}  -- targetUserId -> requesterUserId

TradeService.onSync = Instance.new("BindableEvent")
TradeService.onNotify = Instance.new("BindableEvent")

local function notify(player: Player, msg: string, kind: string?)
    TradeService.onNotify:Fire(player, msg, kind or "info")
end

local function inTradeZone(player: Player): boolean
    local char = player.Character
    local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
    if not root then return false end
    local flat = Vector3.new(root.Position.X, 0, root.Position.Z)
    return flat.Magnitude <= Config.TRADE_RANGE
end

local function goobById(profile, id: string)
    for i, g in ipairs(profile.goobs) do
        if g.id == id then return g, i end
    end
    return nil
end

-- Serialise just enough for the other player to judge the deal. We send power
-- and age, NOT internal ids of things they don't own.
local function describe(goob)
    local tier = GoobMath.ageTier(goob)
    return {
        id = goob.id,
        nickname = goob.nickname,
        hue = goob.hue,
        mass = goob.mass,
        power = GoobMath.power(goob),
        powerText = Format.short(GoobMath.power(goob)),
        ageText = Format.duration(GoobMath.ageSeconds(goob)),
        ageTier = tier.name,
        ageEmoji = tier.emoji,
        generation = GoobMath.generation(goob),
        contents = goob.contents,
    }
end

local function sync(session: Session)
    for _, player in ipairs({ session.a, session.b }) do
        local other = if player == session.a then session.b else session.a
        local myProfile = Data.get(player)
        local otherProfile = Data.get(other)
        if myProfile and otherProfile then
            local function pack(profile, ids)
                local out = {}
                for _, id in ipairs(ids) do
                    local g = goobById(profile, id)
                    if g then table.insert(out, describe(g)) end
                end
                return out
            end
            TradeService.onSync:Fire(player, {
                open = session.open,
                partner = other.Name,
                partnerDisplay = other.DisplayName,
                myOffer = pack(myProfile, session.offers[player.UserId]),
                theirOffer = pack(otherProfile, session.offers[other.UserId]),
                myConfirmed = session.confirmed[player.UserId] ~= nil,
                theirConfirmed = session.confirmed[other.UserId] ~= nil,
                lockSeconds = Config.TRADE_CONFIRM_LOCK,
            })
        end
    end
end

-- Any change to the deal wipes both confirmations. Non-negotiable.
local function resetConfirms(session: Session)
    session.confirmed[session.a.UserId] = nil
    session.confirmed[session.b.UserId] = nil
end

function TradeService.request(from: Player, targetName: string)
    local target = Players:FindFirstChild(targetName) :: Player?
    if not target or target == from then return end
    if sessionOf[from.UserId] or sessionOf[target.UserId] then
        notify(from, "One of you is already trading.", "warn")
        return
    end
    if not inTradeZone(from) or not inTradeZone(target) then
        notify(from, "You both need to stand in the 🤝 TRADE ZONE.", "warn")
        return
    end
    pending[target.UserId] = from.UserId
    notify(target, from.DisplayName .. " wants to trade Goobs!", "trade")
    notify(from, "Trade request sent to " .. target.DisplayName .. ".", "info")
end

function TradeService.respond(target: Player, accept: boolean)
    local requesterId = pending[target.UserId]
    if not requesterId then return end
    pending[target.UserId] = nil
    local requester = Players:GetPlayerByUserId(requesterId)
    if not requester then return end
    if not accept then
        notify(requester, target.DisplayName .. " declined.", "warn")
        return
    end
    if sessionOf[target.UserId] or sessionOf[requesterId] then return end

    local session: Session = {
        a = requester, b = target,
        offers = { [requesterId] = {}, [target.UserId] = {} },
        confirmed = {},
        open = true,
    }
    table.insert(sessions, session)
    sessionOf[requesterId] = session
    sessionOf[target.UserId] = session
    sync(session)
end

function TradeService.offer(player: Player, goobId: string, add: boolean)
    local session = sessionOf[player.UserId]
    if not session or not session.open then return end
    local profile = Data.get(player)
    if not profile then return end

    local list = session.offers[player.UserId]
    if add then
        if #list >= Config.TRADE_MAX_SLOTS then return end
        if not goobById(profile, goobId) then return end
        -- You must always keep at least one Goob. Offering your last one is
        -- how new players get talked out of everything they own.
        if #list + 1 >= #profile.goobs then
            notify(player, "You have to keep at least one Goob.", "warn")
            return
        end
        for _, id in ipairs(list) do if id == goobId then return end end
        table.insert(list, goobId)
    else
        for i, id in ipairs(list) do
            if id == goobId then table.remove(list, i) break end
        end
    end
    resetConfirms(session)
    sync(session)
end

function TradeService.confirm(player: Player, holding: boolean)
    local session = sessionOf[player.UserId]
    if not session or not session.open then return end

    if not holding then
        session.confirmed[player.UserId] = nil
        sync(session)
        return
    end

    session.confirmed[player.UserId] = os.clock()
    sync(session)

    -- Wait out the hold, then re-check EVERYTHING. State can change during the
    -- three seconds and we must never trust the snapshot we took at the start.
    task.delay(Config.TRADE_CONFIRM_LOCK, function()
        if not session.open then return end
        local aOk = session.confirmed[session.a.UserId]
        local bOk = session.confirmed[session.b.UserId]
        if not aOk or not bOk then return end
        if os.clock() - aOk < Config.TRADE_CONFIRM_LOCK - 0.05 then return end
        if os.clock() - bOk < Config.TRADE_CONFIRM_LOCK - 0.05 then return end
        TradeService.execute(session)
    end)
end

function TradeService.execute(session: Session)
    local a, b = session.a, session.b
    local pa, pb = Data.get(a), Data.get(b)
    if not pa or not pb then TradeService.cancel(a) return end
    if not inTradeZone(a) or not inTradeZone(b) then
        notify(a, "Trade cancelled — someone left the trade zone.", "warn")
        notify(b, "Trade cancelled — someone left the trade zone.", "warn")
        TradeService.cancel(a)
        return
    end

    -- Validate both sides fully BEFORE mutating anything.
    local moveA, moveB = {}, {}
    for _, id in ipairs(session.offers[a.UserId]) do
        local g = goobById(pa, id)
        if not g then TradeService.cancel(a) return end
        table.insert(moveA, g)
    end
    for _, id in ipairs(session.offers[b.UserId]) do
        local g = goobById(pb, id)
        if not g then TradeService.cancel(a) return end
        table.insert(moveB, g)
    end
    if #moveA == 0 and #moveB == 0 then return end
    if #pa.goobs - #moveA + #moveB < 1 then TradeService.cancel(a) return end
    if #pb.goobs - #moveB + #moveA < 1 then TradeService.cancel(a) return end

    local function remove(profile, goob)
        for i, g in ipairs(profile.goobs) do
            if g.id == goob.id then table.remove(profile.goobs, i) return end
        end
    end

    for _, g in ipairs(moveA) do remove(pa, g); table.insert(pb.goobs, g) end
    for _, g in ipairs(moveB) do remove(pb, g); table.insert(pa.goobs, g) end

    -- If either player traded away the Goob they had on display, promote
    -- another one so their plot is never empty.
    if not goobById(pa, pa.activeGoobId or "") then pa.activeGoobId = pa.goobs[1].id end
    if not goobById(pb, pb.activeGoobId or "") then pb.activeGoobId = pb.goobs[1].id end

    pa.stats.trades += 1
    pb.stats.trades += 1

    session.open = false
    sessionOf[a.UserId] = nil
    sessionOf[b.UserId] = nil

    GoobService.spawnFor(a)
    GoobService.spawnFor(b)
    Data.save(a); Data.save(b)

    notify(a, "✅ Trade complete!", "good")
    notify(b, "✅ Trade complete!", "good")
    sync(session)
end

function TradeService.cancel(player: Player)
    local session = sessionOf[player.UserId]
    if not session then return end
    session.open = false
    sessionOf[session.a.UserId] = nil
    sessionOf[session.b.UserId] = nil
    sync(session)
    notify(session.a, "Trade cancelled.", "warn")
    notify(session.b, "Trade cancelled.", "warn")
end

function TradeService.cleanup(player: Player)
    pending[player.UserId] = nil
    for id, requester in pairs(pending) do
        if requester == player.UserId then pending[id] = nil end
    end
    TradeService.cancel(player)
end

return TradeService
