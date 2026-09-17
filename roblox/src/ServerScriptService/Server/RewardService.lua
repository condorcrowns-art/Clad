--!strict
-- Login streak + in-session playtime rewards + offline earnings (VIP).
-- Three separate "you gained something for existing" taps, each on a different
-- clock, so there is always one about to pay out.

local Players = game:GetService("Players")
local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")

local Quests  = require(Shared.Quests)
local Config  = require(Shared.Config)
local Remotes = require(Shared.Remotes)
local Format  = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local AntiCheat    = require(script.Parent.AntiCheat)

local RewardService = {}

local function today(): string
	return os.date("!%Y-%m-%d") :: string
end

local function yesterday(): string
	return os.date("!%Y-%m-%d", os.time() - 86400) :: string
end

function RewardService.onJoin(player: Player, data)
	local EconomyService = require(script.Parent.EconomyService)

	-- ---- login streak
	local day = today()
	if data.login.lastDay ~= day then
		if data.login.lastDay == yesterday() then
			data.login.streak += 1
		else
			data.login.streak = 1
		end
		data.login.lastDay = day

		local index = ((data.login.streak - 1) % #Quests.LOGIN_STREAK) + 1
		local entry = Quests.LOGIN_STREAK[index]
		local loops = math.floor((data.login.streak - 1) / #Quests.LOGIN_STREAK)

		local bits = entry.bits * (1 + loops * 0.5)
		local shards = (entry.shards or 0) + loops
		EconomyService.award(player, "Bits", bits)
		if shards > 0 then EconomyService.award(player, "Shards", shards) end

		task.delay(2.5, function()
			if not player.Parent then return end
			StateService.notify(player, ("\u{1F4C5} Day %d streak! +%s Bits%s")
				:format(data.login.streak, Format.short(bits),
					shards > 0 and (" +" .. shards .. " Shards") or ""), "good")
		end)
	end

	-- ---- offline earnings (VIP only: this is the single most compelling
	-- reason to buy the top pass, and giving it to everyone flattens the
	-- active-play loop the whole game is built around)
	if StateService.owns(player, "VIP") and data.lastLeave > 0 then
		local away = math.min(os.time() - data.lastLeave, Config.OFFLINE_CAP_HOURS * 3600)
		if away > 300 then
			-- Estimate income from the player's own power at 1 swing/sec.
			local perSecond = StateService.swingPower(player, data)
			local earned = math.floor(perSecond * away * Config.OFFLINE_RATE)
			if earned > 0 then
				EconomyService.award(player, "Bits", earned)
				task.delay(4, function()
					if not player.Parent then return end
					StateService.notify(player, ("\u{1F451} VIP offline earnings: +%s Bits (%s away)")
						:format(Format.short(earned), Format.time(away)), "good")
				end)
			end
		end
	end

	-- Reset this session's playtime claims.
	data.playtimeClaimed = {}
end

function RewardService.start()
	local EconomyService = require(script.Parent.EconomyService)

	Remotes.event("ClaimPlaytime").OnServerEvent:Connect(function(player, index)
		if not AntiCheat.allow(player, "Buy") then return end
		local i = AntiCheat.num(index, 1, #Quests.PLAYTIME)
		local data = DataService.get(player)
		local profile = DataService.profiles[player]
		if not i or not data or not profile then return end
		i = math.floor(i)

		local entry = Quests.PLAYTIME[i]
		if not entry then return end
		if data.playtimeClaimed[tostring(i)] then return end

		local session = os.clock() - profile.joinedAt
		if session < entry.at then
			StateService.notify(player, ("Not yet \u{2014} %s to go."):format(Format.time(entry.at - session)), "warn")
			return
		end

		data.playtimeClaimed[tostring(i)] = true
		EconomyService.award(player, "Bits", entry.bits)
		if entry.shards then EconomyService.award(player, "Shards", entry.shards) end
		StateService.notify(player, ("\u{23F1} %s reward: +%s Bits%s")
			:format(Format.time(entry.at), Format.short(entry.bits),
				entry.shards and (" +" .. entry.shards .. " Shards") or ""), "good")
		StateService.push(player)
	end)

	-- Nudge: tell players when a playtime chest is ready rather than making
	-- them open the menu to find out.
	task.spawn(function()
		local announced: { [Player]: { [number]: boolean } } = {}
		Players.PlayerRemoving:Connect(function(p) announced[p] = nil end)
		while true do
			task.wait(20)
			for _, player in ipairs(Players:GetPlayers()) do
				local profile = DataService.profiles[player]
				local data = DataService.get(player)
				if profile and data then
					local session = os.clock() - profile.joinedAt
					announced[player] = announced[player] or {}
					for i, entry in ipairs(Quests.PLAYTIME) do
						if session >= entry.at and not data.playtimeClaimed[tostring(i)]
							and not announced[player][i] then
							announced[player][i] = true
							StateService.notify(player, ("\u{1F381} %s playtime reward is ready!"):format(Format.time(entry.at)), "good")
						end
					end
				end
			end
		end
	end)
end

return RewardService
