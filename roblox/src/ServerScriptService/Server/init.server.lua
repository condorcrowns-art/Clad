--!strict
-- OVERCLOCK SIMULATOR -- server bootstrap.
--
-- Boot order matters: Remotes must exist before any service binds to them,
-- and the world must exist before any player spawns into it.

local Players = game:GetService("Players")
local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")

local Remotes = require(Shared.Remotes)   -- creates the remote folder
local Config  = require(Shared.Config)

local DataService       = require(script.DataService)
local StateService      = require(script.StateService)
local WorldService       = require(script.WorldService)
local QuestService      = require(script.QuestService)
local EconomyService    = require(script.EconomyService)
local MiningService     = require(script.MiningService)
local PetService        = require(script.PetService)
local RebirthService    = require(script.RebirthService)
local RewardService     = require(script.RewardService)
local GamepassService   = require(script.GamepassService)
local CodeService       = require(script.CodeService)
local LeaderboardService= require(script.LeaderboardService)
local CharacterService  = require(script.CharacterService)

print(("[%s] booting..."):format(Config.GAME_NAME))

WorldService.start()
DataService.start()
EconomyService.start()
MiningService.start()
PetService.start()
RebirthService.start()
QuestService.start()
RewardService.start()
GamepassService.start()
CodeService.start()
LeaderboardService.start()

-- --------------------------------------------------------------- players
local function onPlayerAdded(player: Player)
	GamepassService.onJoin(player)   -- must run before rewards (VIP offline pay)

	DataService.onJoin(player, function(data)
		QuestService.onJoin(player, data)
		RewardService.onJoin(player, data)
		StateService.buildLeaderstats(player, data)
		StateService.push(player)

		-- Put them where they left off.
		local char = player.Character
		if char then
			local root = char:FindFirstChild("HumanoidRootPart") :: BasePart?
			if root then root.CFrame = WorldService.getSpawn(data.zone) end
		end

		StateService.notify(player, ("Welcome to %s! Click nodes to mine."):format(Config.GAME_NAME), "good")
	end)

	player.CharacterAdded:Connect(function(char)
		task.spawn(CharacterService.onCharacter, player, char)
		-- Respawn into your selected sector, not the world spawn.
		task.delay(0.5, function()
			local data = DataService.get(player)
			local root = char:FindFirstChild("HumanoidRootPart") :: BasePart?
			if data and root then root.CFrame = WorldService.getSpawn(data.zone) end
		end)
	end)

	if player.Character then
		task.spawn(CharacterService.onCharacter, player, player.Character)
	end
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(onPlayerAdded, p) end
Players.PlayerRemoving:Connect(function(player)
	DataService.onLeave(player)
end)

-- The client asks for a snapshot once it has built its UI, so it never renders
-- an empty HUD while waiting for the first push.
Remotes.fn("GetState").OnServerInvoke = function(player)
	local deadline = os.clock() + 15
	while not DataService.get(player) and os.clock() < deadline do
		task.wait(0.15)
	end
	return StateService.snapshot(player)
end

-- Chip model has to follow tool upgrades.
task.spawn(function()
	local lastTool: { [Player]: string } = {}
	Players.PlayerRemoving:Connect(function(p) lastTool[p] = nil end)
	while true do
		task.wait(1)
		for _, player in ipairs(Players:GetPlayers()) do
			local data = DataService.get(player)
			if data and lastTool[player] ~= data.tool then
				lastTool[player] = data.tool
				CharacterService.refreshChip(player)
			end
		end
	end
end)

print(("[%s] online."):format(Config.GAME_NAME))
