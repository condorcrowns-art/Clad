--!strict
-- Daily quests. Rolled per UTC day, per player, deterministically from
-- (userId, day) so a player can't reroll by rejoining until they get the easy
-- set -- and so two players comparing quests see a plausible spread.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Quests  = require(Shared.Quests)
local Remotes = require(Shared.Remotes)
local Format  = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local AntiCheat    = require(script.Parent.AntiCheat)

local QuestService = {}

local function today(): string
	return os.date("!%Y-%m-%d") :: string
end

local function rollDaily(player: Player, data)
	local day = today()
	if data.quests.day == day and #data.quests.list > 0 then return end

	-- Deterministic per (user, day).
	local seed = 0
	for c in day:gmatch("%d") do seed = seed * 10 + tonumber(c) :: number end
	local rng = Random.new(seed + player.UserId)

	local pool = table.clone(Quests.pool)
	for i = #pool, 2, -1 do
		local j = rng:NextInteger(1, i)
		pool[i], pool[j] = pool[j], pool[i]
	end

	local list = {}
	for i = 1, math.min(Quests.DAILY_COUNT, #pool) do
		table.insert(list, { id = pool[i].id, progress = 0, claimed = false })
	end
	data.quests = { day = day, list = list, allClaimed = false }
end
QuestService.rollDaily = rollDaily

function QuestService.onJoin(player: Player, data)
	rollDaily(player, data)
end

-- Called from everywhere. Cheap no-op when no active quest matches the kind.
function QuestService.progress(player: Player, kind: string, amount: number)
	local data = DataService.get(player)
	if not data or not data.quests or not data.quests.list then return end
	local changed = false
	for _, entry in ipairs(data.quests.list) do
		local def = Quests.byId[entry.id]
		if def and def.kind == kind and not entry.claimed and entry.progress < def.target then
			entry.progress = math.min(def.target, entry.progress + amount)
			changed = true
			if entry.progress >= def.target then
				StateService.notify(player, ("\u{2705} Quest ready: %s"):format(def.name), "good")
			end
		end
	end
	if changed then StateService.push(player) end
end

function QuestService.start()
	local EconomyService = require(script.Parent.EconomyService)

	Remotes.event("ClaimQuest").OnServerEvent:Connect(function(player, questId)
		if not AntiCheat.allow(player, "Buy") then return end
		local id = AntiCheat.str(questId, 32)
		local data = DataService.get(player)
		if not id or not data then return end

		for _, entry in ipairs(data.quests.list) do
			if entry.id == id then
				local def = Quests.byId[id]
				if not def or entry.claimed or entry.progress < def.target then return end
				entry.claimed = true
				if def.reward.bits   then EconomyService.award(player, "Bits", def.reward.bits) end
				if def.reward.shards then EconomyService.award(player, "Shards", def.reward.shards) end
				StateService.notify(player, ("Claimed: %s Bits%s"):format(
					Format.short(def.reward.bits or 0),
					def.reward.shards and (" + " .. def.reward.shards .. " Shards") or ""), "good")

				-- All three done? Pay the completion bonus once.
				local all = true
				for _, e in ipairs(data.quests.list) do
					if not e.claimed then all = false break end
				end
				if all and not data.quests.allClaimed then
					data.quests.allClaimed = true
					EconomyService.award(player, "Bits", Quests.ALL_COMPLETE_BONUS.bits)
					EconomyService.award(player, "Shards", Quests.ALL_COMPLETE_BONUS.shards)
					StateService.notify(player, "\u{1F3C6} ALL DAILIES COMPLETE \u{2014} bonus paid!", "good")
				end
				StateService.push(player)
				return
			end
		end
	end)

	-- Playtime quests tick on a slow loop.
	task.spawn(function()
		while true do
			task.wait(15)
			for _, player in ipairs(game:GetService("Players"):GetPlayers()) do
				QuestService.progress(player, "playtime", 15)
			end
		end
	end)

	-- Midnight UTC reroll for players who stay online across the boundary.
	task.spawn(function()
		while true do
			task.wait(60)
			for _, player in ipairs(game:GetService("Players"):GetPlayers()) do
				local data = DataService.get(player)
				if data and data.quests.day ~= today() then
					rollDaily(player, data)
					StateService.notify(player, "\u{1F504} New daily quests available!", "good")
					StateService.push(player)
				end
			end
		end
	end)
end

return QuestService
