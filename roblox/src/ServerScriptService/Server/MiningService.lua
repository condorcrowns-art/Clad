--!strict
-- The core loop: swing -> node breaks -> Bits go into your buffer.
--
-- The client sends only "I swung at this instance". The server re-derives
-- everything else: is the node real, is it in my unlocked zone, is it in reach,
-- has my cooldown elapsed, is my buffer full, how much is it actually worth.

local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config   = require(Shared.Config)
local Zones    = require(Shared.Zones)
local Remotes  = require(Shared.Remotes)
local Progression = require(Shared.Progression)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local WorldService = require(script.Parent.WorldService)
local AntiCheat    = require(script.Parent.AntiCheat)
local QuestService = require(script.Parent.QuestService)
local FusionService = require(script.Parent.FusionService)

local MiningService = {}

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

	FusionService.awardXp(player, data, Progression.XP_PER_NODE)

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

end

return MiningService
