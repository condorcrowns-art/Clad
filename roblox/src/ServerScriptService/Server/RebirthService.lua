--!strict
-- Overclock (rebirth). Resets Bits / chip / buffer / sectors.
-- KEEPS: pets, shards, codes, quests, stats. That asymmetry is the whole point
-- -- the player comes back stronger and re-runs the fun part of the curve.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Rebirths = require(Shared.Rebirths)
local Zones    = require(Shared.Zones)
local Tools    = require(Shared.Tools)
local Buffers  = require(Shared.Buffers)
local Remotes  = require(Shared.Remotes)
local Format   = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local WorldService = require(script.Parent.WorldService)
local AntiCheat    = require(script.Parent.AntiCheat)

local RebirthService = {}

local function doRebirth(player: Player)
	local data = DataService.get(player)
	if not data then return end

	local cost = Rebirths.costFor(data.rebirths)
	if data.bits < cost then
		StateService.notify(player, ("Need %s Bits to Overclock."):format(Format.short(cost)), "warn")
		return
	end

	local shards = Rebirths.shardsFor(data.rebirths)

	-- Reset the economy lane.
	data.bits   = 0
	data.tool   = Tools.starter
	data.buffer = Buffers.starter
	data.zone   = Zones.starter
	data.zones  = { [Zones.starter] = true }
	data.rebirths += 1
	data.shards += shards
	data.stats.rebirths = (data.stats.rebirths or 0) + 1

	local rt = StateService.runtime(player)
	if rt then rt.carried = 0 end

	local QuestService = require(script.Parent.QuestService)
	QuestService.progress(player, "rebirth", 1)

	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if root then root.CFrame = WorldService.getSpawn(Zones.starter) end

	local title = Rebirths.titleFor(data.rebirths)
	Remotes.event("Effect"):FireAllClients({
		kind = "rebirth", player = player.Name, count = data.rebirths,
	})
	StateService.announce(("\u{267B} %s OVERCLOCKED \u{2014} now %s [%d] (+%d Shards)")
		:format(player.Name, title.title, data.rebirths, shards))
	StateService.notify(player, ("Overclock #%d! +%d Shards, %s permanent Bits bonus.")
		:format(data.rebirths, shards, Format.mult(Rebirths.multiplierFor(data.rebirths))), "good")

	RebirthService.applyTitle(player, data)
	StateService.push(player)
end

-- Overhead nametag showing rebirth title. Cheap social flex = free retention.
function RebirthService.applyTitle(player: Player, data)
	local char = player.Character
	local head = char and char:FindFirstChild("Head") :: BasePart?
	if not head then return end

	local old = head:FindFirstChild("OverclockTag")
	if old then old:Destroy() end

	local title = Rebirths.titleFor(data.rebirths)
	local gui = Instance.new("BillboardGui")
	gui.Name = "OverclockTag"
	gui.Size = UDim2.fromScale(10, 2.2)
	gui.StudsOffset = Vector3.new(0, 2.6, 0)
	gui.AlwaysOnTop = true
	gui.MaxDistance = 140
	gui.Parent = head

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextStrokeTransparency = 0.35
	label.TextColor3 = if StateService.owns(player, "VIP") then Color3.fromRGB(255, 215, 0) else title.color
	label.Text = ("%s[%d] %s"):format(
		StateService.owns(player, "VIP") and "\u{1F451} " or "",
		data.rebirths, title.title)
	label.Parent = gui
end

function RebirthService.start()
	Remotes.event("Rebirth").OnServerEvent:Connect(function(player)
		if not AntiCheat.allow(player, "Rebirth") then return end
		doRebirth(player)
	end)
end

return RebirthService
