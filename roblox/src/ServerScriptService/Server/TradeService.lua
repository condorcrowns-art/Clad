--!strict
-- Player-to-player familiar trading.
--
-- Trading is the best retention system you can add to a pet game: it turns
-- duplicates into currency, gives rare pulls social value beyond their
-- multiplier, and creates a player-run economy that generates its own content.
--
-- It is also the easiest system in the game to get robbed on, so the rules
-- below are strict by design:
--   * Both sides must confirm, and ANY change to EITHER offer clears BOTH
--     confirmations. This kills the swap-at-the-last-second scam outright.
--   * The swap is atomic and validated a second time at execution, against
--     live data -- not against the snapshot the offer was built from.
--   * Locked and equipped familiars can never be offered.
--   * Both players must stay within range; walking away cancels.
--   * Every completed trade is logged server-side for support.

local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Pets        = require(Shared.Pets)
local Progression = require(Shared.Progression)
local Trading     = require(Shared.Trading)
local Remotes     = require(Shared.Remotes)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local AntiCheat    = require(script.Parent.AntiCheat)

local TradeService = {}

-- player -> session (both participants map to the SAME table)
local sessions: { [Player]: any } = {}
-- target -> { from = Player, expires = number }
local invites: { [Player]: any } = {}

local function deny(player: Player, reason: string)
	StateService.notify(player, Trading.DECLINE_REASONS[reason] or reason, "warn")
end

local function distanceOk(a: Player, b: Player): boolean
	local ra = a.Character and a.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	local rb = b.Character and b.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not ra or not rb then return false end
	return (ra.Position - rb.Position).Magnitude <= Trading.MAX_DISTANCE
end

-- Build the view of one familiar that the OTHER player sees. Deliberately
-- complete: hiding stats in a trade window is how people get scammed.
local function describe(data, uid: string)
	local owned = data.pets[uid]
	if not owned then return nil end
	local def = Pets.byId[owned.id]
	local variant = Pets.variantById[owned.variant or "normal"]
	if not def or not variant then return nil end
	return {
		uid = uid,
		id = owned.id,
		variant = owned.variant,
		star = owned.star or 0,
		level = owned.level or 0,
		serial = owned.serial,
		name = Progression.displayName(def.name, variant.name, owned.star or 0, owned.level or 0),
		power = Progression.petPower(def.mult, variant.multScale, owned.star or 0, owned.level or 0),
	}
end

local function sideView(session, player: Player)
	local data = DataService.get(player)
	local side = session.sides[player]
	local items = {}
	if data and side then
		for _, uid in ipairs(side.offer) do
			local view = describe(data, uid)
			if view then table.insert(items, view) end
		end
	end
	return {
		name = player.Name,
		userId = player.UserId,
		items = items,
		confirmed = side and side.confirmed or false,
	}
end

local function push(session)
	for _, player in ipairs(session.players) do
		local other = session.players[1] == player and session.players[2] or session.players[1]
		Remotes.event("TradeUpdate"):FireClient(player, {
			active = true,
			me = sideView(session, player),
			them = sideView(session, other),
		})
	end
end

local function closeSession(session, message: string?)
	for _, player in ipairs(session.players) do
		sessions[player] = nil
		if player.Parent then
			Remotes.event("TradeUpdate"):FireClient(player, { active = false })
			if message then StateService.notify(player, message, "warn") end
		end
	end
	session.dead = true
end

-- Any change clears both confirms. This is the anti-scam rule; it is not
-- configurable and it is not "annoying", it is the entire point.
local function resetConfirms(session)
	for _, player in ipairs(session.players) do
		session.sides[player].confirmed = false
	end
end

-- ------------------------------------------------------------------ invite
local function request(player: Player, payload)
	if sessions[player] then return deny(player, "busy") end
	local targetId = AntiCheat.num(payload and payload.target, 1, 1e12)
	if not targetId then return end

	local target = Players:GetPlayerByUserId(math.floor(targetId))
	if not target then return deny(player, "expired") end
	if target == player then return deny(player, "self") end
	if sessions[target] then return deny(target == player and player or player, "busy") end
	if not distanceOk(player, target) then return deny(player, "distance") end

	invites[target] = { from = player, expires = os.clock() + Trading.REQUEST_TIMEOUT }
	Remotes.event("TradeInvite"):FireClient(target, { from = player.UserId, fromName = player.Name })
	StateService.notify(player, ("Trade request sent to %s."):format(target.Name), "info")
end

local function respond(player: Player, payload)
	local invite = invites[player]
	invites[player] = nil
	if not invite or os.clock() > invite.expires then return deny(player, "expired") end

	local from = invite.from
	if not from or not from.Parent then return deny(player, "expired") end
	if payload and payload.accept ~= true then
		StateService.notify(from, ("%s declined the trade."):format(player.Name), "warn")
		return
	end
	if sessions[player] or sessions[from] then return deny(player, "busy") end
	if not distanceOk(player, from) then return deny(player, "distance") end

	local session = {
		players = { from, player },
		sides = {
			[from]   = { offer = {}, confirmed = false },
			[player] = { offer = {}, confirmed = false },
		},
		startedAt = os.clock(),
		dead = false,
	}
	sessions[from] = session
	sessions[player] = session
	push(session)
end

-- ------------------------------------------------------------------- offer
local function offer(player: Player, payload)
	local session = sessions[player]
	if not session or session.dead then return end
	if type(payload) ~= "table" then return end
	local uid = AntiCheat.str(payload.uid, 16)
	if not uid then return end

	local data = DataService.get(player)
	if not data then return end
	local side = session.sides[player]

	if payload.add == true then
		local owned = data.pets[uid]
		if not owned then return deny(player, "notOwned") end
		if owned.locked then return deny(player, "locked") end
		for _, equippedUid in ipairs(data.equipped) do
			if equippedUid == uid then return deny(player, "equipped") end
		end
		if #side.offer >= Trading.MAX_OFFER then return deny(player, "offerFull") end
		for _, existing in ipairs(side.offer) do
			if existing == uid then return end
		end
		table.insert(side.offer, uid)
	else
		for i, existing in ipairs(side.offer) do
			if existing == uid then
				table.remove(side.offer, i)
				break
			end
		end
	end

	resetConfirms(session)
	push(session)
end

-- ----------------------------------------------------------------- confirm
local function countPets(data): number
	local n = 0
	for _ in pairs(data.pets) do n += 1 end
	return n
end

local function execute(session): boolean
	local a, b = session.players[1], session.players[2]
	local dataA, dataB = DataService.get(a), DataService.get(b)
	if not dataA or not dataB then return false end

	local offerA = session.sides[a].offer
	local offerB = session.sides[b].offer

	-- Re-validate against LIVE data, not the snapshot the offer was built from.
	-- Between confirm and execute a player can have equipped, locked, fused
	-- away or deleted something.
	local function validate(data, list, other): boolean
		local equipped: { [string]: boolean } = {}
		for _, uid in ipairs(data.equipped) do equipped[uid] = true end
		for _, uid in ipairs(list) do
			local owned = data.pets[uid]
			if not owned or owned.locked or equipped[uid] then return false end
		end
		-- Receiving side must have room.
		if countPets(other) - #list + #list > Pets.MAX_INVENTORY then return false end
		return true
	end

	if not validate(dataA, offerA, dataB) then return false end
	if not validate(dataB, offerB, dataA) then return false end

	if countPets(dataA) - #offerA + #offerB > Pets.MAX_INVENTORY then return false end
	if countPets(dataB) - #offerB + #offerA > Pets.MAX_INVENTORY then return false end

	-- Detach first, attach second. Both players' pets are held in locals in
	-- between, so a failure at any point above leaves both saves untouched.
	local movedAtoB, movedBtoA = {}, {}
	for _, uid in ipairs(offerA) do
		movedAtoB[uid] = dataA.pets[uid]
		dataA.pets[uid] = nil
	end
	for _, uid in ipairs(offerB) do
		movedBtoA[uid] = dataB.pets[uid]
		dataB.pets[uid] = nil
	end

	-- Re-key into the receiver's own uid space so two players can never end up
	-- with colliding uids.
	local function give(data, moved)
		local names = {}
		for _, owned in pairs(moved) do
			local uid = tostring(data.nextPetUid)
			data.nextPetUid += 1
			data.pets[uid] = owned
			local def = Pets.byId[owned.id]
			local variant = Pets.variantById[owned.variant or "normal"]
			if def and variant then
				table.insert(names, Progression.displayName(def.name, variant.name, owned.star or 0, owned.level or 0))
			end
		end
		return names
	end

	local gotB = give(dataB, movedAtoB)
	local gotA = give(dataA, movedBtoA)

	-- Force a save on both sides immediately. A trade that survives in one
	-- player's save and not the other's is a duplication bug.
	task.spawn(function() DataService.save(a, false) end)
	task.spawn(function() DataService.save(b, false) end)

	print(("[Trade] %s <-> %s | %s gave %d, %s gave %d")
		:format(a.Name, b.Name, a.Name, #offerA, b.Name, #offerB))

	StateService.notify(a, #gotA > 0 and ("\u{1F91D} Trade complete! Received: %s"):format(table.concat(gotA, ", ")) or "\u{1F91D} Trade complete!", "good")
	StateService.notify(b, #gotB > 0 and ("\u{1F91D} Trade complete! Received: %s"):format(table.concat(gotB, ", ")) or "\u{1F91D} Trade complete!", "good")

	StateService.push(a)
	StateService.push(b)
	return true
end

local function confirm(player: Player, payload)
	local session = sessions[player]
	if not session or session.dead then return end
	local side = session.sides[player]
	side.confirmed = (payload == nil) or (payload.confirmed ~= false)

	local both = true
	for _, p in ipairs(session.players) do
		if not session.sides[p].confirmed then both = false end
	end

	if not both then
		push(session)
		return
	end

	if not distanceOk(session.players[1], session.players[2]) then
		closeSession(session, Trading.DECLINE_REASONS.distance)
		return
	end

	if execute(session) then
		for _, p in ipairs(session.players) do
			sessions[p] = nil
			Remotes.event("TradeUpdate"):FireClient(p, { active = false })
		end
		session.dead = true
	else
		closeSession(session, "Trade failed \u{2014} something changed. Nothing was exchanged.")
	end
end

-- ------------------------------------------------------------------- init
function TradeService.start()
	Remotes.event("TradeRequest").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Buy") then return end
		request(player, payload)
	end)
	Remotes.event("TradeRespond").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Buy") then return end
		respond(player, payload)
	end)
	Remotes.event("TradeOffer").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Equip") then return end
		offer(player, payload)
	end)
	Remotes.event("TradeConfirm").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Buy") then return end
		confirm(player, payload)
	end)
	Remotes.event("TradeCancel").OnServerEvent:Connect(function(player)
		local session = sessions[player]
		if session then closeSession(session, ("%s cancelled the trade."):format(player.Name)) end
	end)

	Players.PlayerRemoving:Connect(function(player)
		invites[player] = nil
		local session = sessions[player]
		if session then closeSession(session, "The other player left.") end
	end)

	-- Walking away cancels. Checked on a slow loop rather than per-frame: a
	-- second of latency on a cancel is invisible, and 40 players of Heartbeat
	-- distance checks is not.
	task.spawn(function()
		while true do
			task.wait(1)
			local seen: { [any]: boolean } = {}
			for _, session in pairs(sessions) do
				if not seen[session] and not session.dead then
					seen[session] = true
					local a, b = session.players[1], session.players[2]
					if not a.Parent or not b.Parent then
						closeSession(session, "The other player left.")
					elseif not distanceOk(a, b) then
						closeSession(session, Trading.DECLINE_REASONS.distance)
					end
				end
			end
			for target, invite in pairs(invites) do
				if os.clock() > invite.expires then invites[target] = nil end
			end
		end
	end)
end

function TradeService.isTrading(player: Player): boolean
	return sessions[player] ~= nil
end

return TradeService
