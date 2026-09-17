--!strict
-- Character cosmetics: the visible chip in hand, rebirth nametag, and the
-- three toy gamepasses (trail, big head, VIP gold). Cosmetics are server-built
-- so other players see them -- half the value of a cosmetic pass is other
-- people seeing it.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Tools = require(Shared.Tools)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)

local CharacterService = {}

local function buildChip(player: Player, char: Model, data)
	local existing = char:FindFirstChild("ChipTool")
	if existing then existing:Destroy() end

	local hand = char:FindFirstChild("RightHand") or char:FindFirstChild("Right Arm")
	if not hand or not hand:IsA("BasePart") then return end

	local def = Tools.byId[data.tool] or Tools.byId[Tools.starter]

	local model = Instance.new("Model")
	model.Name = "ChipTool"

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(0.35, 2.4, 0.35)
	handle.Color = Color3.fromRGB(40, 42, 55)
	handle.Material = Enum.Material.Metal
	handle.CanCollide = false
	handle.Massless = true
	handle.Parent = model

	local head = Instance.new("Part")
	head.Name = "Edge"
	head.Size = Vector3.new(2.2, 0.5, 0.4)
	head.Color = def.rarityColor
	head.Material = Enum.Material.Neon
	head.CanCollide = false
	head.Massless = true
	head.Parent = model

	model.PrimaryPart = handle
	handle.CFrame = hand.CFrame * CFrame.new(0, -1.1, 0)
	head.CFrame = handle.CFrame * CFrame.new(0, 1.2, 0)

	local w1 = Instance.new("WeldConstraint")
	w1.Part0, w1.Part1 = handle, hand
	w1.Parent = handle
	local w2 = Instance.new("WeldConstraint")
	w2.Part0, w2.Part1 = head, handle
	w2.Parent = head

	model.Parent = char
end

local function applyCosmetics(player: Player, char: Model)
	local data = DataService.get(player)
	if not data then return end

	buildChip(player, char, data)

	local RebirthService = require(script.Parent.RebirthService)
	RebirthService.applyTitle(player, data)

	local root = char:FindFirstChild("HumanoidRootPart") :: BasePart?

	if StateService.owns(player, "Trail") and root then
		local a0 = Instance.new("Attachment"); a0.Position = Vector3.new(0, 1.2, 0);  a0.Parent = root
		local a1 = Instance.new("Attachment"); a1.Position = Vector3.new(0, -1.2, 0); a1.Parent = root
		local trail = Instance.new("Trail")
		trail.Attachment0, trail.Attachment1 = a0, a1
		trail.Lifetime = 0.9
		trail.LightEmission = 1
		trail.Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(120, 220, 255)),
			ColorSequenceKeypoint.new(0.5, Color3.fromRGB(200, 140, 255)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(255, 120, 200)),
		})
		trail.Transparency = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.1),
			NumberSequenceKeypoint.new(1, 1),
		})
		trail.Parent = root
	end

	if StateService.owns(player, "BigHead") then
		local head = char:FindFirstChild("Head") :: BasePart?
		if head then
			head.Size = head.Size * 2.2
			local mesh = head:FindFirstChildOfClass("SpecialMesh")
			if mesh then mesh.Scale = mesh.Scale * 2.2 end
		end
	end

	-- VIP walkspeed: small, but it is felt on every single trip to the Uplink,
	-- which is exactly what makes it worth 399.
	local hum = char:FindFirstChildOfClass("Humanoid")
	if hum and StateService.owns(player, "VIP") then
		hum.WalkSpeed = 22
	end
end

function CharacterService.onCharacter(player: Player, char: Model)
	task.wait(0.4)   -- let R15 finish assembling
	if not char.Parent then return end
	applyCosmetics(player, char)
end

function CharacterService.refreshChip(player: Player)
	local char = player.Character
	local data = DataService.get(player)
	if char and data then buildChip(player, char, data) end
end

return CharacterService
