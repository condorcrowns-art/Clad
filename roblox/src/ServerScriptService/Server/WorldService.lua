--!strict
-- Procedural world builder.
--
-- The entire map is generated at runtime, so the .rbxl can be an empty
-- baseplate and everything still works. That matters for two reasons:
--   1. You can rebalance a sector by editing Zones.lua instead of dragging
--      parts around for an hour.
--   2. The repo is the game. No binary place file to merge-conflict on.
--
-- Replace the generated parts with real modelled sectors later -- keep the
-- attribute names (`ZoneId`, `NodeIndex`) and every other service keeps working.

local Workspace = game:GetService("Workspace")
local Players   = game:GetService("Players")
local Lighting  = game:GetService("Lighting")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Zones  = require(Shared.Zones)
local Config = require(Shared.Config)
local Rng    = require(Shared.Util.Rng)

local WorldService = {}

local ZONE_SIZE    = 260     -- studs per sector platform (square)
local ZONE_SPACING = 340     -- centre-to-centre distance along +X
local NODES_PER_ZONE = 60
local PAD_Y = 0

WorldService.zoneModels = {} :: { [string]: Model }
WorldService.nodes      = {} :: { [string]: { BasePart } }
WorldService.spawnCFrames = {} :: { [string]: CFrame }

local function newPart(props): BasePart
	local p = Instance.new("Part")
	for k, v in pairs(props) do
		(p :: any)[k] = v
	end
	return p
end

local function zoneOrigin(order: number): Vector3
	return Vector3.new((order - 1) * ZONE_SPACING, 0, 0)
end

-- --------------------------------------------------------------- a node
local function buildNode(zone, index: number, origin: Vector3): BasePart
	local size = Rng.range(5, 8)
	local x = origin.X + Rng.range(-ZONE_SIZE/2 + 20, ZONE_SIZE/2 - 20)
	local z = origin.Z + Rng.range(-ZONE_SIZE/2 + 20, ZONE_SIZE/2 - 45)

	local node = newPart({
		Name = zone.nodeName,
		Size = Vector3.new(size, size, size),
		CFrame = CFrame.new(x, PAD_Y + size/2 + 0.5, z) * CFrame.Angles(0, Rng.range(0, 6.28), 0),
		Color = zone.color,
		Material = Enum.Material.Neon,
		Anchored = true,
		CanCollide = true,
		TopSurface = Enum.SurfaceType.Smooth,
		BottomSurface = Enum.SurfaceType.Smooth,
	})
	node:SetAttribute("ZoneId", zone.id)
	node:SetAttribute("NodeIndex", index)
	node:SetAttribute("Broken", false)

	-- Inner core so the break effect has something to reveal.
	local core = newPart({
		Name = "Core",
		Size = Vector3.new(size * 0.45, size * 0.45, size * 0.45),
		CFrame = node.CFrame,
		Color = Color3.new(1,1,1),
		Material = Enum.Material.Neon,
		Anchored = true,
		CanCollide = false,
		Transparency = 0.35,
	})
	core.Parent = node

	local light = Instance.new("PointLight")
	light.Color = zone.color
	light.Range = 14
	light.Brightness = 1.4
	light.Parent = node

	return node
end

-- ------------------------------------------------------------- a sector
local function buildZone(zone)
	local origin = zoneOrigin(zone.order)
	local model = Instance.new("Model")
	model.Name = "Zone_" .. zone.id
	model:SetAttribute("ZoneId", zone.id)

	-- Floor
	local floor = newPart({
		Name = "Floor",
		Size = Vector3.new(ZONE_SIZE, 2, ZONE_SIZE),
		CFrame = CFrame.new(origin + Vector3.new(0, PAD_Y - 1, 0)),
		Color = zone.color:Lerp(Color3.new(0,0,0), 0.78),
		Material = Enum.Material.SmoothPlastic,
		Anchored = true,
	})
	floor.Parent = model

	-- Grid lines, purely to sell the "inside a machine" look.
	for i = -4, 4 do
		local line = newPart({
			Name = "Grid",
			Size = Vector3.new(ZONE_SIZE, 0.1, 0.6),
			CFrame = CFrame.new(origin + Vector3.new(0, PAD_Y + 0.06, i * (ZONE_SIZE/9))),
			Color = zone.color,
			Material = Enum.Material.Neon,
			Transparency = 0.72,
			Anchored = true, CanCollide = false,
		})
		line.Parent = model
		local line2 = line:Clone()
		line2.CFrame = CFrame.new(origin + Vector3.new(i * (ZONE_SIZE/9), PAD_Y + 0.06, 0)) * CFrame.Angles(0, math.pi/2, 0)
		line2.Parent = model
	end

	-- Walls so nobody walks into the void.
	for _, dir in ipairs({ Vector3.new(1,0,0), Vector3.new(-1,0,0), Vector3.new(0,0,1), Vector3.new(0,0,-1) }) do
		local wall = newPart({
			Name = "Wall",
			Size = if dir.X ~= 0 then Vector3.new(2, 40, ZONE_SIZE) else Vector3.new(ZONE_SIZE, 40, 2),
			CFrame = CFrame.new(origin + dir * (ZONE_SIZE/2) + Vector3.new(0, 20, 0)),
			Color = zone.color,
			Material = Enum.Material.ForceField,
			Transparency = 0.82,
			Anchored = true,
		})
		wall.Parent = model
	end

	-- Uplink (sell) pad -- deliberately at the near edge so the walk back is
	-- short enough to feel good and long enough to make Auto-Sell tempting.
	local pad = newPart({
		Name = "UplinkPad",
		Size = Vector3.new(24, 1, 24),
		CFrame = CFrame.new(origin + Vector3.new(0, PAD_Y + 0.5, ZONE_SIZE/2 - 26)),
		Color = Color3.fromRGB(80, 255, 140),
		Material = Enum.Material.Neon,
		Anchored = true,
	})
	pad:SetAttribute("ZoneId", zone.id)
	pad.Parent = model

	local sign = Instance.new("BillboardGui")
	sign.Size = UDim2.fromScale(12, 4)
	sign.StudsOffset = Vector3.new(0, 7, 0)
	sign.AlwaysOnTop = true
	sign.Parent = pad
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1,1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.TextColor3 = Color3.fromRGB(120,255,180)
	label.TextStrokeTransparency = 0.3
	label.Text = "\u{2B06} UPLINK \u{2B06}\nstand here to sell"
	label.Parent = sign

	-- Spawn point for this zone (used on unlock/teleport).
	WorldService.spawnCFrames[zone.id] =
		CFrame.new(origin + Vector3.new(0, PAD_Y + 4, ZONE_SIZE/2 - 40))

	-- Nodes
	local nodeFolder = Instance.new("Folder")
	nodeFolder.Name = "Nodes"
	nodeFolder.Parent = model

	local nodes = {}
	for i = 1, NODES_PER_ZONE do
		local n = buildNode(zone, i, origin)
		n.Parent = nodeFolder
		nodes[i] = n
	end
	WorldService.nodes[zone.id] = nodes

	-- Sector nameplate
	local marker = newPart({
		Name = "ZoneSign",
		Size = Vector3.new(6, 1, 6),
		CFrame = CFrame.new(origin + Vector3.new(0, PAD_Y + 14, ZONE_SIZE/2 - 10)),
		Transparency = 1, Anchored = true, CanCollide = false,
	})
	marker.Parent = model
	local g = Instance.new("BillboardGui")
	g.Size = UDim2.fromScale(26, 6)
	g.AlwaysOnTop = true
	g.Parent = marker
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1,1)
	t.BackgroundTransparency = 1
	t.Font = Enum.Font.GothamBlack
	t.TextScaled = true
	t.TextColor3 = zone.color
	t.TextStrokeTransparency = 0.25
	t.Text = ("[ %d ] %s  \u{00D7}%d"):format(zone.order, string.upper(zone.name), zone.mult)
	t.Parent = g

	model.Parent = Workspace
	WorldService.zoneModels[zone.id] = model
	return model
end

-- --------------------------------------------------------- node breaking
function WorldService.breakNode(node: BasePart)
	if node:GetAttribute("Broken") then return end
	node:SetAttribute("Broken", true)
	node.CanCollide = false
	node.Transparency = 1
	local core = node:FindFirstChild("Core") :: BasePart?
	if core then core.Transparency = 1 end
	local light = node:FindFirstChildOfClass("PointLight")
	if light then light.Enabled = false end

	task.delay(Config.NODE_RESPAWN, function()
		if not node.Parent then return end
		node:SetAttribute("Broken", false)
		node.CanCollide = true
		node.Transparency = 0
		if core then core.Transparency = 0.35 end
		if light then light.Enabled = true end
	end)
end

function WorldService.nodesInZone(zoneId: string)
	return WorldService.nodes[zoneId] or {}
end

function WorldService.getSpawn(zoneId: string): CFrame
	return WorldService.spawnCFrames[zoneId] or CFrame.new(0, 8, 0)
end

-- ------------------------------------------------------------------ init
function WorldService.start()
	-- Kill the default baseplate/spawn if present; we build our own.
	local base = Workspace:FindFirstChild("Baseplate")
	if base then base:Destroy() end
	for _, v in ipairs(Workspace:GetChildren()) do
		if v:IsA("SpawnLocation") then v:Destroy() end
	end

	for _, zone in ipairs(Zones.list) do
		buildZone(zone)
	end

	-- A real SpawnLocation in the starter zone so respawns land somewhere sane.
	local sp = Instance.new("SpawnLocation")
	sp.Name = "StarterSpawn"
	sp.Size = Vector3.new(12, 1, 12)
	sp.CFrame = WorldService.getSpawn(Zones.starter) * CFrame.new(0, -3, 0)
	sp.Anchored = true
	sp.Neutral = true
	sp.Color = Color3.fromRGB(120, 200, 255)
	sp.Material = Enum.Material.Neon
	sp.Parent = Workspace

	-- Atmosphere. Cheap, and it is most of why a sim "looks" polished.
	Lighting.Ambient = Color3.fromRGB(40, 45, 60)
	Lighting.OutdoorAmbient = Color3.fromRGB(60, 70, 90)
	Lighting.Brightness = 2
	Lighting.ClockTime = 0
	Lighting.GlobalShadows = true
	Lighting.FogEnd = 900
	Lighting.FogColor = Color3.fromRGB(12, 14, 24)
	if not Lighting:FindFirstChildOfClass("Bloom") then
		local bloom = Instance.new("BloomEffect")
		bloom.Intensity = 0.55
		bloom.Size = 22
		bloom.Threshold = 0.85
		bloom.Parent = Lighting
	end
	if not Lighting:FindFirstChildOfClass("Atmosphere") then
		local atmo = Instance.new("Atmosphere")
		atmo.Density = 0.32
		atmo.Haze = 1.4
		atmo.Color = Color3.fromRGB(150, 170, 220)
		atmo.Decay = Color3.fromRGB(30, 35, 60)
		atmo.Parent = Lighting
	end
end

return WorldService
