--!strict
-- Derived stats + replication.
--
-- Single source of truth for "how much is a swing worth right now". Every
-- multiplier in the game funnels through `multiplier()` so there is exactly one
-- place to look when a player reports wrong numbers -- and exactly one place to
-- add the next boost.

local Players = game:GetService("Players")
local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")

local Config   = require(Shared.Config)
local Tools    = require(Shared.Tools)
local Buffers  = require(Shared.Buffers)
local Zones    = require(Shared.Zones)
local Pets     = require(Shared.Pets)
local Rebirths = require(Shared.Rebirths)
local Remotes  = require(Shared.Remotes)

local DataService = require(script.Parent.DataService)

local StateService = {}

-- Set by GamepassService once ownership is known.
StateService.passes = {} :: { [Player]: { [string]: boolean } }
-- Server-wide boost (from the SERVER 2x product): os.time() expiry.
StateService.serverBoostUntil = 0

local function owns(player: Player, key: string): boolean
	local p = StateService.passes[player]
	return p ~= nil and p[key] == true
end
StateService.owns = owns

function StateService.runtime(player: Player)
	local profile = DataService.profiles[player]
	if not profile then return nil end
	local rt = profile.runtime
	rt.carried = rt.carried or 0
	rt.lastSwing = rt.lastSwing or 0
	return rt
end

-- ------------------------------------------------------------- multipliers
function StateService.petMultiplier(data): number
	local total = 0
	for _, uid in ipairs(data.equipped) do
		local owned = data.pets[uid]
		if owned then
			local def = Pets.byId[owned.id]
			local variant = Pets.variantById[owned.variant or "normal"]
			if def and variant then
				total += def.mult * variant.multScale
			end
		end
	end
	return 1 + total
end

function StateService.luck(player: Player, data): number
	local luck = Config.BASE_LUCK
	for _, uid in ipairs(data.equipped) do
		local owned = data.pets[uid]
		local def = owned and Pets.byId[owned.id]
		if def then luck += def.luck end
	end
	if owns(player, "Lucky") then luck *= 2 end
	if owns(player, "VIP")   then luck *= 1.5 end
	if (data.boosts.luck or 0) > os.time() then luck *= 3 end
	return luck
end

function StateService.multiplier(player: Player, data): number
	local m = 1
	m *= Zones.byId[data.zone] and Zones.byId[data.zone].mult or 1
	m *= StateService.petMultiplier(data)
	m *= Rebirths.multiplierFor(data.rebirths)
	if owns(player, "Double") then m *= 2 end
	if owns(player, "VIP")    then m *= 1.5 end
	if (data.boosts.bits or 0) > os.time() then m *= 2 end
	if StateService.serverBoostUntil > os.time() then m *= 2 end
	return m
end

function StateService.swingPower(player: Player, data): number
	local tool = Tools.byId[data.tool] or Tools.byId[Tools.starter]
	return tool.power * StateService.multiplier(player, data)
end

function StateService.capacity(player: Player, data): number
	local buf = Buffers.byId[data.buffer] or Buffers.byId[Buffers.starter]
	local cap = buf.capacity
	if owns(player, "VIP") then cap = math.floor(cap * 1.25) end
	return cap
end

function StateService.petSlots(player: Player, data): number
	local slots = Pets.EQUIP_BASE
	if owns(player, "PetSlots") then slots += Pets.EQUIP_GAMEPASS_BONUS end
	return slots
end

function StateService.swingCooldown(player: Player, data): number
	local tool = Tools.byId[data.tool] or Tools.byId[Tools.starter]
	return Config.SWING_COOLDOWN * tool.speed
end

-- ------------------------------------------------------------ leaderstats
function StateService.buildLeaderstats(player: Player, data)
	local ls = player:FindFirstChild("leaderstats") :: Folder?
	if not ls then
		ls = Instance.new("Folder")
		ls.Name = "leaderstats"
		ls.Parent = player
	end
	local function stat(name: string)
		local v = ls:FindFirstChild(name) :: StringValue?
		if not v then
			v = Instance.new("StringValue")
			v.Name = name
			v.Parent = ls
		end
		return v
	end
	-- StringValues so we can show abbreviated numbers (1.2Qa) on the
	-- default leaderboard instead of scientific notation.
	local Format = require(Shared.Util.Format)
	stat("Bits").Value     = Format.short(data.bits)
	stat("Shards").Value   = Format.short(data.shards)
	stat("Rebirths").Value = tostring(data.rebirths)
end

-- ------------------------------------------------------------ replication
function StateService.snapshot(player: Player)
	local data = DataService.get(player)
	if not data then return nil end
	local rt = StateService.runtime(player)

	return {
		bits      = data.bits,
		shards    = data.shards,
		rebirths  = data.rebirths,
		tool      = data.tool,
		buffer    = data.buffer,
		zone      = data.zone,
		zones     = data.zones,
		pets      = data.pets,
		equipped  = data.equipped,
		quests    = data.quests,
		login     = data.login,
		playtimeClaimed = data.playtimeClaimed,
		stats     = data.stats,
		boosts    = data.boosts,
		codes     = data.codes,

		carried   = rt and rt.carried or 0,
		capacity  = StateService.capacity(player, data),
		power     = StateService.swingPower(player, data),
		multiplier= StateService.multiplier(player, data),
		petMult   = StateService.petMultiplier(data),
		luck      = StateService.luck(player, data),
		slots     = StateService.petSlots(player, data),
		cooldown  = StateService.swingCooldown(player, data),
		passes    = StateService.passes[player] or {},
		serverBoost = StateService.serverBoostUntil,
		rebirthCost = Rebirths.costFor(data.rebirths),
		rebirthShards = Rebirths.shardsFor(data.rebirths),
		sessionTime = math.floor(os.clock() - (DataService.profiles[player] and DataService.profiles[player].joinedAt or os.clock())),
	}
end

local pushQueued: { [Player]: boolean } = {}

-- Coalesced replication: many systems call push() in the same frame (mine ->
-- quest progress -> currency), and we only want one packet.
function StateService.push(player: Player)
	if pushQueued[player] then return end
	pushQueued[player] = true
	task.defer(function()
		pushQueued[player] = nil
		if not player.Parent then return end
		local snap = StateService.snapshot(player)
		if not snap then return end
		local data = DataService.get(player)
		if data then StateService.buildLeaderstats(player, data) end
		Remotes.event("StateUpdate"):FireClient(player, snap)
	end)
end

function StateService.notify(player: Player, text: string, kind: string?)
	Remotes.event("Notify"):FireClient(player, { text = text, kind = kind or "info" })
end

function StateService.announce(text: string)
	Remotes.event("Announce"):FireAllClients({ text = text })
end

Players.PlayerRemoving:Connect(function(p)
	StateService.passes[p] = nil
	pushQueued[p] = nil
end)

return StateService
