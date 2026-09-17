--!strict
-- The core loop: swing -> node breaks -> Bits go into your buffer.
--
-- The client sends only "I swung at this instance". The server re-derives
-- everything else: is the node real, is it in my unlocked zone, is it in reach,
-- has my cooldown elapsed, is my buffer full, how much is it actually worth.

local Players = game:GetService("Players")

local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config   = require(Shared.Config)
local Zones    = require(Shared.Zones)
local Products = require(Shared.Products)
local Remotes  = require(Shared.Remotes)
local Format   = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local WorldService = require(script.Parent.WorldService)
local AntiCheat    = require(script.Parent.AntiCheat)
local QuestService = require(script.Parent.QuestService)

local MiningService = {}

local abilityCooldown: { [Player]: { [string]: number } } = {}

local function creditBuffer(player: Player, data, amount: number): number
	local rt = StateService.runtime(player)
	if not rt then return 0 end
	local cap = StateService.capacity(player, data)
	local space = cap - rt.carried
	if space <= 0 then return 0 end
	local gained = math.min(space, amount)
	rt.carried += gained
	return gained
end
MiningService.creditBuffer = creditBuffer

local function mine(player: Player, node: BasePart, freeSwing: boolean?): boolean
	local data = DataService.get(player)
	if not data then return false end
	if not AntiCheat.isAlive(player) then return false end

	if node:GetAttribute("Broken") then return false end
	local zoneId = node:GetAttribute("ZoneId")
	if type(zoneId) ~= "string" then return false end
	-- You may only mine in a zone you own, and only the zone you're standing in.
	if not data.zones[zoneId] then return false end

	if not freeSwing and not AntiCheat.inReach(player, node.Position, Config.MAX_SWING_REACH) then
		return false
	end

	local worth = StateService.swingPower(player, data)
	-- Node value scales with the zone the node lives in, not the zone the
	-- player has "selected" -- no standing in a cheap zone with an expensive
	-- multiplier selected.
	local zone = Zones.byId[zoneId]
	local zoneScale = zone and zone.mult or 1
	local selected = Zones.byId[data.zone]
	worth = worth / (selected and selected.mult or 1) * zoneScale

	local gained = creditBuffer(player, data, worth)

	WorldService.breakNode(node)
	data.stats.mined += 1
	QuestService.progress(player, "mine", 1)

	Remotes.event("Effect"):FireAllClients({
		kind = "nodeBreak",
		position = node.Position,
		color = node.Color,
		amount = gained,
		player = player.Name,
	})

	if gained <= 0 then
		StateService.notify(player, "Buffer full! Sell at the Uplink.", "warn")
	end

	StateService.push(player)
	return true
end
MiningService.mine = mine

-- --------------------------------------------------------------- abilities
local function onCooldown(player: Player, key: string, seconds: number): number?
	local t = abilityCooldown[player]
	if not t then t = {}; abilityCooldown[player] = t end
	local now = os.clock()
	if (t[key] or 0) > now then
		return (t[key] :: number) - now
	end
	t[key] = now + seconds
	return nil
end

local function nuke(player: Player)
	if not AntiCheat.allow(player, "Nuke") then return end
	if not StateService.owns(player, "Nuke") then
		StateService.notify(player, "DATA NUKE gamepass required.", "warn")
		Remotes.event("PromptPurchase"):FireClient(player, { kind = "pass", key = "Nuke" })
		return
	end
	local data = DataService.get(player)
	if not data then return end

	local left = onCooldown(player, "Nuke", Products.NUKE_COOLDOWN)
	if left then
		StateService.notify(player, ("Nuke recharging: %s"):format(Format.time(left)), "warn")
		return
	end

	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return end

	-- Which sector are you standing in? Nuke that one.
	local zoneId = data.zone
	for id, model in pairs(WorldService.zoneModels) do
		local floor = model:FindFirstChild("Floor") :: BasePart?
		if floor and math.abs(floor.Position.X - root.Position.X) < 130
			and math.abs(floor.Position.Z - root.Position.Z) < 130 then
			zoneId = id
			break
		end
	end
	if not data.zones[zoneId] then
		StateService.notify(player, "You don't own this sector.", "warn")
		return
	end

	local broken = 0
	for _, node in ipairs(WorldService.nodesInZone(zoneId)) do
		if not node:GetAttribute("Broken") then
			mine(player, node, true)
			broken += 1
		end
	end

	Remotes.event("Effect"):FireAllClients({
		kind = "nuke", position = root.Position, player = player.Name,
	})
	StateService.announce(("\u{2622} %s DETONATED %s \u{2014} %d nodes vaporised!")
		:format(player.Name, (Zones.byId[zoneId] and Zones.byId[zoneId].name or "a sector"), broken))
end

local function shatterAll(player: Player)
	if not AntiCheat.allow(player, "Nuke") then return end
	if not StateService.owns(player, "ShatterAll") then
		StateService.notify(player, "SHATTER ALL gamepass required.", "warn")
		Remotes.event("PromptPurchase"):FireClient(player, { kind = "pass", key = "ShatterAll" })
		return
	end
	local left = onCooldown(player, "ShatterAll", Products.SHATTER_COOLDOWN)
	if left then
		StateService.notify(player, ("Shatter recharging: %s"):format(Format.time(left)), "warn")
		return
	end
	local data = DataService.get(player)
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not data or not root then return end

	local broken = 0
	for zoneId in pairs(data.zones) do
		for _, node in ipairs(WorldService.nodesInZone(zoneId)) do
			if not node:GetAttribute("Broken")
				and (node.Position - root.Position).Magnitude <= Products.SHATTER_RADIUS then
				mine(player, node, true)
				broken += 1
			end
		end
	end
	Remotes.event("Effect"):FireAllClients({
		kind = "shatter", position = root.Position, radius = Products.SHATTER_RADIUS,
	})
	StateService.notify(player, ("\u{1F4A5} Shattered %d nodes!"):format(broken), "good")
end

-- -------------------------------------------------------------------- init
function MiningService.start()
	Remotes.event("Swing").OnServerEvent:Connect(function(player, node)
		if not AntiCheat.allow(player, "Swing") then return end
		if typeof(node) ~= "Instance" or not node:IsA("BasePart") then return end
		if node:GetAttribute("NodeIndex") == nil then return end

		local data = DataService.get(player)
		local rt = StateService.runtime(player)
		if not data or not rt then return end

		local now = os.clock()
		local cd = StateService.swingCooldown(player, data)
		if now - rt.lastSwing < cd - Config.SWING_GRACE then return end
		rt.lastSwing = now

		mine(player, node)
	end)

	Remotes.event("Nuke").OnServerEvent:Connect(nuke)
	Remotes.event("ShatterAll").OnServerEvent:Connect(shatterAll)

	Players.PlayerRemoving:Connect(function(p) abilityCooldown[p] = nil end)
end

return MiningService
