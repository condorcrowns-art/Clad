--!strict
-- Selling and shopping. All currency mutations in the game go through
-- `award` / `spend` so there is a single audit point.

local Players = game:GetService("Players")

local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config   = require(Shared.Config)
local Zones    = require(Shared.Zones)
local Tools    = require(Shared.Tools)
local Buffers  = require(Shared.Buffers)
local Remotes  = require(Shared.Remotes)
local Format   = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local WorldService = require(script.Parent.WorldService)
local AntiCheat    = require(script.Parent.AntiCheat)
local QuestService = require(script.Parent.QuestService)

local EconomyService = {}

function EconomyService.award(player: Player, currency: string, amount: number)
	local data = DataService.get(player)
	if not data or amount <= 0 then return end
	amount = math.floor(amount)
	if currency == "Bits" then
		data.bits += amount
		data.totalBits += amount
		if data.bits > data.bestBits then data.bestBits = data.bits end
	elseif currency == "Shards" then
		data.shards += amount
	end
	StateService.push(player)
end

function EconomyService.spend(player: Player, currency: string, amount: number): boolean
	local data = DataService.get(player)
	if not data then return false end
	local have = if currency == "Shards" then data.shards else data.bits
	if have < amount then return false end
	if currency == "Shards" then data.shards -= amount else data.bits -= amount end
	StateService.push(player)
	return true
end

-- ------------------------------------------------------------------- sell
local function nearUplink(player: Player): boolean
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return false end
	for _, model in pairs(WorldService.zoneModels) do
		local pad = model:FindFirstChild("UplinkPad") :: BasePart?
		if pad and (pad.Position - root.Position).Magnitude <= Config.SELL_RADIUS then
			return true
		end
	end
	return false
end

function EconomyService.sell(player: Player, silent: boolean?): number
	local data = DataService.get(player)
	local rt = StateService.runtime(player)
	if not data or not rt then return 0 end
	if rt.carried <= 0 then return 0 end

	local amount = math.floor(rt.carried)
	rt.carried = 0
	EconomyService.award(player, "Bits", amount)
	data.stats.sold += 1
	QuestService.progress(player, "sell", 1)

	if not silent then
		StateService.notify(player, ("\u{1F4A0} Sold for %s Bits"):format(Format.short(amount)), "good")
		Remotes.event("Effect"):FireClient(player, { kind = "sell", amount = amount })
	end
	StateService.push(player)
	return amount
end

-- -------------------------------------------------------------------- buy
local function buyTool(player: Player, id: string): (boolean, string)
	local data = DataService.get(player)
	local tool = Tools.byId[id]
	if not data or not tool then return false, "Unknown chip." end
	local current = Tools.byId[data.tool]
	if current and tool.order <= current.order then return false, "You already have a better chip." end
	if not EconomyService.spend(player, tool.currency, tool.cost) then
		return false, ("Need %s %s."):format(Format.short(tool.cost), tool.currency)
	end
	data.tool = id
	return true, ("Equipped %s!"):format(tool.name)
end

local function buyBuffer(player: Player, id: string): (boolean, string)
	local data = DataService.get(player)
	local buf = Buffers.byId[id]
	if not data or not buf then return false, "Unknown buffer." end
	local current = Buffers.byId[data.buffer]
	if current and buf.order <= current.order then return false, "You already have a bigger buffer." end
	if not EconomyService.spend(player, buf.currency, buf.cost) then
		return false, ("Need %s %s."):format(Format.short(buf.cost), buf.currency)
	end
	data.buffer = id
	return true, ("Installed %s!"):format(buf.name)
end

local function buyZone(player: Player, id: string): (boolean, string)
	local data = DataService.get(player)
	local zone = Zones.byId[id]
	if not data or not zone then return false, "Unknown sector." end
	if data.zones[id] then
		-- Already owned: this is a fast-travel request instead.
		data.zone = id
		local char = player.Character
		local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
		if root then root.CFrame = WorldService.getSpawn(id) end
		return true, ("Warped to %s."):format(zone.name)
	end
	if data.rebirths < zone.requiresRebirth then
		return false, ("Requires %d Overclocks."):format(zone.requiresRebirth)
	end
	if not EconomyService.spend(player, "Bits", zone.cost) then
		return false, ("Need %s Bits."):format(Format.short(zone.cost))
	end
	data.zones[id] = true
	data.zone = id
	QuestService.progress(player, "zone", 1)

	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if root then root.CFrame = WorldService.getSpawn(id) end

	StateService.announce(("\u{1F513} %s unlocked %s!"):format(player.Name, zone.name))
	return true, ("Unlocked %s!"):format(zone.name)
end

-- -------------------------------------------------------------------- init
function EconomyService.start()
	Remotes.event("Sell").OnServerEvent:Connect(function(player)
		if not AntiCheat.allow(player, "Sell") then return end
		if not nearUplink(player) then
			StateService.notify(player, "Stand on an Uplink pad to sell.", "warn")
			return
		end
		EconomyService.sell(player)
	end)

	Remotes.event("Buy").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Buy") then return end
		if type(payload) ~= "table" then return end
		local kind = AntiCheat.str(payload.kind, 12)
		local id   = AntiCheat.str(payload.id, 32)
		if not kind or not id then return end

		local ok, msg
		if kind == "tool"   then ok, msg = buyTool(player, id)
		elseif kind == "buffer" then ok, msg = buyBuffer(player, id)
		elseif kind == "zone"   then ok, msg = buyZone(player, id)
		else return end

		StateService.notify(player, msg, ok and "good" or "warn")
		StateService.push(player)
	end)

	-- Auto-sell (gamepass) + proximity sell. Both run on one slow loop rather
	-- than a per-player Heartbeat connection -- 40 players * 60fps of distance
	-- checks is a real server cost for zero gameplay benefit.
	task.spawn(function()
		while true do
			task.wait(Config.AUTO_SELL_TICK)
			for _, player in ipairs(Players:GetPlayers()) do
				local data = DataService.get(player)
				local rt = StateService.runtime(player)
				if data and rt and rt.carried > 0 then
					if StateService.owns(player, "AutoSell") then
						EconomyService.sell(player, true)
					elseif nearUplink(player) then
						EconomyService.sell(player)
					end
				end
			end
		end
	end)
end

return EconomyService
