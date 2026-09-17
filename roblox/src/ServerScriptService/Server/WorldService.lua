--!strict
-- Procedural world builder.
--
-- LAYOUT RULES (the first version broke all four of these, which is why it
-- looked like a mess):
--   1. Nothing is placed at a hardcoded world coordinate. Everything is
--      positioned relative to its own sector's origin, so sectors can be
--      reordered or resized without anything ending up inside a wall.
--   2. Nodes go on a JITTERED GRID, never pure random. Pure random scatter
--      overlaps itself, clumps, and leaves dead space -- which is exactly
--      what it did.
--   3. Every zone reserves keep-out areas: the spawn, the Uplink pad, and the
--      egg row. Nothing spawns inside them.
--   4. Signage faces the player's approach direction, and sits above head
--      height so it never clips the play space.
--
-- Everything is built at runtime, so the .rbxl can be an empty baseplate and
-- rebalancing a sector is a table edit rather than an hour of dragging parts.
-- Drop real models into ReplicatedStorage/GameAssets (see Shared/Assets.lua)
-- and they replace the procedural geometry with no code change.

local Workspace = game:GetService("Workspace")
local Lighting  = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Zones  = require(Shared.Zones)
local Pets   = require(Shared.Pets)
local Config = require(Shared.Config)
local Assets = require(Shared.Assets)
local ModelFactory = require(Shared.ModelFactory)
local Format = require(Shared.Util.Format)

local WorldService = {}

-- Layout constants. All sector content is derived from these.
local ZONE_SIZE    = 300
local ZONE_SPACING = 380
local WALL_HEIGHT  = 60

-- Node grid: 8x7 = 56 slots, minus keep-out = ~48 live nodes per sector.
local GRID_X, GRID_Z = 8, 7
local GRID_MARGIN = 46          -- studs of clear space at the sector edges
local NODE_JITTER = 0.30        -- fraction of a cell a node may wander

-- Keep-out zones, as fractions of the sector measured from its origin.
local SPAWN_Z     = 0.34        -- spawn/uplink sit in the near third
local EGG_ROW_Z   = 0.24

WorldService.zoneModels   = {} :: { [string]: Model }
WorldService.nodes        = {} :: { [string]: { BasePart } }
WorldService.spawnCFrames = {} :: { [string]: CFrame }
WorldService.eggPads      = {} :: { [string]: { BasePart } }

local function newPart(props): BasePart
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do (p :: any)[k] = v end
	return p
end

local function zoneOrigin(order: number): Vector3
	return Vector3.new((order - 1) * ZONE_SPACING, 0, 0)
end

-- Billboard signage helper. `face` is the direction players approach from, so
-- text always faces them.
local function sign(parent: Instance, position: Vector3, size: Vector2, text: string, color: Color3, textSize: number?)
	local anchor = newPart({
		Name = "SignAnchor",
		Size = Vector3.new(1, 1, 1),
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
		CFrame = CFrame.new(position),
	})
	anchor.Parent = parent

	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromScale(size.X, size.Y)
	gui.AlwaysOnTop = false
	gui.MaxDistance = 400
	gui.Parent = anchor

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.TextScaled = true
	label.RichText = true
	label.TextColor3 = color
	label.TextStrokeTransparency = 0.3
	label.TextStrokeColor3 = Color3.new(0, 0, 0)
	label.Text = text
	label.Parent = gui

	return anchor, label
end

-- --------------------------------------------------------------- one node
local function buildNode(zone, index: number, position: Vector3, scale: number): BasePart
	local model = ModelFactory.buildNode(zone.id, index, zone.color, scale)
	ModelFactory.applyMesh(model, Assets.meshId(Assets.NODES[zone.id] and Assets.NODES[zone.id].mesh or 0))
	model:PivotTo(CFrame.new(position) * CFrame.Angles(0, (index * 0.7) % 6.28, 0))

	local primary = model.PrimaryPart
	if not primary then
		primary = model:FindFirstChildWhichIsA("BasePart") :: BasePart
		model.PrimaryPart = primary
	end

	-- Attributes are the contract with every other system (mining, nuke,
	-- respawn, client targeting). Set them on the primary part AND let the
	-- model carry the name, so swapped-in Store models work unchanged.
	primary.Name = zone.nodeName
	primary:SetAttribute("ZoneId", zone.id)
	primary:SetAttribute("NodeIndex", index)
	primary:SetAttribute("Broken", false)

	-- Child parts forward clicks to the primary part.
	for _, child in ipairs(model:GetDescendants()) do
		if child:IsA("BasePart") and child ~= primary then
			child:SetAttribute("NodeRoot", true)
		end
	end

	return primary
end

-- ------------------------------------------------------------- egg pedestals
-- Physical eggs you walk up to and hatch. This is how simulators actually do
-- it -- an egg you can see, stand at, and watch other players hatch at is
-- worth far more than a row in a menu.
local function buildEggRow(zone, model: Model, origin: Vector3)
	local eggsHere = {}
	for _, egg in ipairs(Pets.eggs) do
		if egg.zone == zone.id then table.insert(eggsHere, egg) end
	end
	if #eggsHere == 0 then return end

	local pads = {}
	local spacing = 26
	local startX = -((#eggsHere - 1) * spacing) / 2

	for i, egg in ipairs(eggsHere) do
		local pos = origin + Vector3.new(
			startX + (i - 1) * spacing,
			0,
			ZONE_SIZE * (0.5 - EGG_ROW_Z)
		)

		local accent = if egg.currency == "Robux" then Color3.fromRGB(255, 205, 70)
			elseif egg.currency == "Shards" then Color3.fromRGB(190, 130, 255)
			else zone.color

		local eggModel = ModelFactory.buildEgg(egg.id, zone.color:Lerp(Color3.new(1,1,1), 0.25), accent)
		ModelFactory.applyMesh(eggModel, Assets.meshId(Assets.EGGS[egg.id] and Assets.EGGS[egg.id].mesh or 0))
		eggModel.Name = "Egg_" .. egg.id
		eggModel:PivotTo(CFrame.new(pos))
		eggModel.Parent = model

		local primary = eggModel.PrimaryPart or eggModel:FindFirstChildWhichIsA("BasePart")
		if primary then
			primary:SetAttribute("EggId", egg.id)
			table.insert(pads, primary)
		end

		local priceText = if egg.currency == "Robux" then "R$ ONLY"
			else ("%s %s"):format(Format.short(egg.cost), egg.currency)

		sign(eggModel,
			pos + Vector3.new(0, 7.6, 0),
			Vector2.new(16, 5),
			("<b>%s</b>\n%s\n<font size=\"12\">walk up + click to hatch</font>"):format(
				string.upper(egg.name), priceText),
			accent)
	end

	WorldService.eggPads[zone.id] = pads
end

-- ------------------------------------------------------------ one sector
local function buildZone(zone)
	local origin = zoneOrigin(zone.order)
	local model = Instance.new("Model")
	model.Name = "Zone_" .. zone.id
	model:SetAttribute("ZoneId", zone.id)

	-- Floor
	local floor = newPart({
		Name = "Floor",
		Size = Vector3.new(ZONE_SIZE, 4, ZONE_SIZE),
		CFrame = CFrame.new(origin + Vector3.new(0, -2, 0)),
		Color = zone.color:Lerp(Color3.fromRGB(8, 9, 14), 0.86),
		Material = Enum.Material.SmoothPlastic,
	})
	floor.Parent = model

	-- Grid lines. Fewer and dimmer than before -- the first version's grid was
	-- bright enough to compete with the nodes for attention.
	for i = -3, 3 do
		local offset = i * (ZONE_SIZE / 7)
		for _, rotated in ipairs({ false, true }) do
			local line = newPart({
				Name = "Grid",
				Size = if rotated then Vector3.new(0.5, 0.1, ZONE_SIZE) else Vector3.new(ZONE_SIZE, 0.1, 0.5),
				CFrame = CFrame.new(origin + (if rotated
					then Vector3.new(offset, 0.06, 0)
					else Vector3.new(0, 0.06, offset))),
				Color = zone.color,
				Material = Enum.Material.Neon,
				Transparency = 0.86,
				CanCollide = false,
				CanQuery = false,
			})
			line.Parent = model
		end
	end

	-- Walls
	for _, dir in ipairs({ Vector3.new(1,0,0), Vector3.new(-1,0,0), Vector3.new(0,0,1), Vector3.new(0,0,-1) }) do
		local wall = newPart({
			Name = "Wall",
			Size = if dir.X ~= 0 then Vector3.new(3, WALL_HEIGHT, ZONE_SIZE) else Vector3.new(ZONE_SIZE, WALL_HEIGHT, 3),
			CFrame = CFrame.new(origin + dir * (ZONE_SIZE / 2) + Vector3.new(0, WALL_HEIGHT / 2, 0)),
			Color = zone.color,
			Material = Enum.Material.ForceField,
			Transparency = 0.88,
		})
		wall.Parent = model
	end

	-- Uplink (sell) pad -- near edge, centred, so the sell walk is short enough
	-- to feel good and long enough to make Auto-Sell worth buying.
	local uplinkPos = origin + Vector3.new(0, 0, ZONE_SIZE * SPAWN_Z)
	local pad = newPart({
		Name = "UplinkPad",
		Size = Vector3.new(30, 1.2, 30),
		CFrame = CFrame.new(uplinkPos + Vector3.new(0, 0.6, 0)),
		Color = Color3.fromRGB(70, 255, 150),
		Material = Enum.Material.Neon,
	})
	pad:SetAttribute("ZoneId", zone.id)
	pad.Parent = model

	local padRing = newPart({
		Name = "UplinkRing",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.4, 40, 40),
		CFrame = CFrame.new(uplinkPos + Vector3.new(0, 0.3, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color = Color3.fromRGB(70, 255, 150),
		Material = Enum.Material.Neon,
		Transparency = 0.45,
		CanCollide = false,
		CanQuery = false,
	})
	padRing.Parent = model

	-- Uplink sign: big, above head height, facing back into the sector.
	sign(model, uplinkPos + Vector3.new(0, 13, 0), Vector2.new(26, 7),
		"<b>\u{2B06} UPLINK \u{2B06}</b>\n<font size=\"14\">stand here to sell your Bits</font>",
		Color3.fromRGB(120, 255, 180))

	-- Sector nameplate: high up on the far wall so it frames the sector
	-- instead of sitting in the middle of it.
	sign(model,
		origin + Vector3.new(0, 34, -ZONE_SIZE / 2 + 8),
		Vector2.new(46, 10),
		("<b>[%d]  %s</b>\n<font size=\"18\">\u{00D7}%s Bits per node</font>")
			:format(zone.order, string.upper(zone.name), Format.short(zone.mult)),
		zone.color)

	-- Spawn point, just behind the Uplink.
	WorldService.spawnCFrames[zone.id] =
		CFrame.new(origin + Vector3.new(0, 5, ZONE_SIZE * SPAWN_Z + 22))
		* CFrame.Angles(0, math.pi, 0)

	-- Egg pedestals
	buildEggRow(zone, model, origin)

	-- ---- Nodes on a jittered grid, skipping keep-out areas.
	local nodeFolder = Instance.new("Folder")
	nodeFolder.Name = "Nodes"
	nodeFolder.Parent = model

	local usable = ZONE_SIZE - GRID_MARGIN * 2
	local cellX = usable / GRID_X
	local cellZ = usable / GRID_Z
	local rng = Random.new(zone.order * 4463)

	local nodes = {}
	local index = 0
	for gx = 1, GRID_X do
		for gz = 1, GRID_Z do
			local x = -usable / 2 + (gx - 0.5) * cellX
			local z = -usable / 2 + (gz - 0.5) * cellZ

			-- Keep-out: the near strip holding spawn, Uplink and the egg row.
			local nearEdge = ZONE_SIZE * (0.5 - EGG_ROW_Z) - 30
			if z < nearEdge then
				x += rng:NextNumber(-NODE_JITTER, NODE_JITTER) * cellX
				z += rng:NextNumber(-NODE_JITTER, NODE_JITTER) * cellZ

				index += 1
				local scale = rng:NextNumber(0.85, 1.25)
				local node = buildNode(zone, index, origin + Vector3.new(x, 0, z), scale)
				node.Parent.Parent = nodeFolder
				nodes[index] = node
			end
		end
	end
	WorldService.nodes[zone.id] = nodes

	model.Parent = Workspace
	WorldService.zoneModels[zone.id] = model
	return model
end

-- ------------------------------------------------------------ leaderboards
-- Placed relative to the STARTER sector's spawn, behind the player, in a neat
-- row, all facing the same way. The previous version put them at absolute
-- world coordinates that happened to land inside the play space at random
-- angles -- which is exactly what it looked like.
function WorldService.buildLeaderboardWall(boards)
	local zone = Zones.byId[Zones.starter]
	local origin = zoneOrigin(zone.order)
	local baseZ = ZONE_SIZE * SPAWN_Z + 62      -- behind the spawn point
	local spacing = 52
	local startX = -((#boards - 1) * spacing) / 2

	local created = {}
	for i, board in ipairs(boards) do
		local pos = origin + Vector3.new(startX + (i - 1) * spacing, 17, baseZ)

		local backing = newPart({
			Name = "Leaderboard_" .. board.key,
			Size = Vector3.new(46, 30, 2),
			-- Rotated 180 so the face points back toward the spawn.
			CFrame = CFrame.new(pos) * CFrame.Angles(0, math.pi, 0),
			Color = Color3.fromRGB(12, 14, 22),
			Material = Enum.Material.SmoothPlastic,
		})
		backing.Parent = Workspace

		local post = newPart({
			Name = "LeaderboardPost",
			Size = Vector3.new(3, 17, 3),
			CFrame = CFrame.new(pos - Vector3.new(0, 15.5, 0)),
			Color = Color3.fromRGB(24, 28, 40),
			Material = Enum.Material.Metal,
		})
		post.Parent = Workspace

		created[board.key] = backing
	end
	return created
end

-- --------------------------------------------------------- node breaking
function WorldService.breakNode(node: BasePart)
	if node:GetAttribute("Broken") then return end
	node:SetAttribute("Broken", true)

	local model = node.Parent
	local parts = {}
	if model then
		for _, d in ipairs(model:GetDescendants()) do
			if d:IsA("BasePart") then table.insert(parts, d) end
		end
	else
		parts = { node }
	end

	for _, p in ipairs(parts) do
		p.CanCollide = false
		p.Transparency = 1
	end
	for _, p in ipairs(parts) do
		local light = p:FindFirstChildOfClass("PointLight")
		if light then light.Enabled = false end
	end

	task.delay(Config.NODE_RESPAWN, function()
		if not node.Parent then return end
		node:SetAttribute("Broken", false)
		for _, p in ipairs(parts) do
			if p.Parent then
				p.CanCollide = (p == node)
				p.Transparency = if p.Name == "Shard" or p.Name == "ShardTip" then 0.08 else 0
				local light = p:FindFirstChildOfClass("PointLight")
				if light then light.Enabled = true end
			end
		end
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
	local base = Workspace:FindFirstChild("Baseplate")
	if base then base:Destroy() end
	for _, v in ipairs(Workspace:GetChildren()) do
		if v:IsA("SpawnLocation") then v:Destroy() end
	end

	-- Make sure the asset folder exists so a builder can drop models straight
	-- in without creating the tree by hand.
	if not ReplicatedStorage:FindFirstChild("GameAssets") then
		local root = Instance.new("Folder")
		root.Name = "GameAssets"
		for _, name in ipairs({ "Nodes", "Pets", "Eggs", "Props" }) do
			local sub = Instance.new("Folder")
			sub.Name = name
			sub.Parent = root
		end
		root.Parent = ReplicatedStorage
	end

	for _, zone in ipairs(Zones.list) do
		buildZone(zone)
	end

	local sp = Instance.new("SpawnLocation")
	sp.Name = "StarterSpawn"
	sp.Size = Vector3.new(16, 1, 16)
	sp.CFrame = WorldService.getSpawn(Zones.starter) * CFrame.new(0, -4, 0)
	sp.Anchored = true
	sp.Neutral = true
	sp.Color = Color3.fromRGB(120, 200, 255)
	sp.Material = Enum.Material.Neon
	sp.Parent = Workspace

	-- Atmosphere. Cheap, and it is most of why a sim reads as "polished".
	Lighting.Ambient = Color3.fromRGB(34, 38, 52)
	Lighting.OutdoorAmbient = Color3.fromRGB(48, 56, 74)
	Lighting.Brightness = 2
	Lighting.ClockTime = 0
	Lighting.GlobalShadows = true
	Lighting.FogEnd = 1400
	Lighting.FogColor = Color3.fromRGB(8, 10, 18)
	if not Lighting:FindFirstChildOfClass("BloomEffect") then
		local bloom = Instance.new("BloomEffect")
		bloom.Intensity = 0.5
		bloom.Size = 20
		bloom.Threshold = 0.9
		bloom.Parent = Lighting
	end
	if not Lighting:FindFirstChildOfClass("Atmosphere") then
		local atmo = Instance.new("Atmosphere")
		atmo.Density = 0.28
		atmo.Haze = 1.2
		atmo.Color = Color3.fromRGB(140, 160, 210)
		atmo.Decay = Color3.fromRGB(24, 28, 48)
		atmo.Parent = Lighting
	end
end

return WorldService
