--!strict
-- Procedural 3D models: familiars, eggs and node crystals.
--
-- Every builder here checks Assets.lua FIRST and only falls back to building
-- geometry if no asset is configured. So this file is the floor, not the
-- ceiling -- the game looks like this out of the box, and looks like whatever
-- you drop into Assets.lua the moment you fill a slot in.
--
-- The geometry is deliberately simple-but-shaped rather than detailed: a
-- silhouette with a head, eyes and a body reads as "a creature" at gameplay
-- distance, and that is most of what a pet model has to do. Detail is what
-- real assets are for.

local Assets = require(script.Parent.Assets)

local ModelFactory = {}

local function part(props): BasePart
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in pairs(props) do (p :: any)[k] = v end
	return p
end

local function ball(props): BasePart
	local p = part(props)
	p.Shape = Enum.PartType.Ball
	return p
end

-- ------------------------------------------------------------------- PETS
-- A familiar: rounded body, head, two eyes, ears/fins, and a floating aura
-- ring whose colour carries the variant. Roughly 2 studs tall.
function ModelFactory.buildPet(petId: string, color: Color3, variantColor: Color3?, glow: boolean?): Model
	local configured = Assets.PETS[petId]
	if configured then
		local fromFolder = Assets.findModel("Pets", configured.model)
		if fromFolder then return fromFolder end
	end

	local model = Instance.new("Model")
	model.Name = petId

	local accent = variantColor or color
	local mat = if glow then Enum.Material.Neon else Enum.Material.SmoothPlastic

	local body = ball({
		Name = "Body",
		Size = Vector3.new(1.5, 1.35, 1.6),
		Color = color,
		Material = mat,
		CFrame = CFrame.new(0, 0.75, 0),
	})
	body.Parent = model
	model.PrimaryPart = body

	local head = ball({
		Name = "Head",
		Size = Vector3.new(1.15, 1.1, 1.1),
		Color = color:Lerp(Color3.new(1, 1, 1), 0.15),
		Material = mat,
		CFrame = CFrame.new(0, 1.45, -0.55),
	})
	head.Parent = model

	for _, side in ipairs({ -1, 1 }) do
		local eye = ball({
			Name = "Eye",
			Size = Vector3.new(0.3, 0.32, 0.18),
			Color = Color3.fromRGB(20, 22, 32),
			Material = Enum.Material.Neon,
			CFrame = CFrame.new(side * 0.26, 1.52, -1.02),
		})
		eye.Parent = model

		local glint = ball({
			Name = "Glint",
			Size = Vector3.new(0.12, 0.12, 0.1),
			Color = Color3.new(1, 1, 1),
			Material = Enum.Material.Neon,
			CFrame = CFrame.new(side * 0.30, 1.58, -1.08),
		})
		glint.Parent = model

		-- Ear / fin: a wedge reads as a feature at distance, a box does not.
		local ear = Instance.new("WedgePart")
		ear.Name = "Fin"
		ear.Anchored = true
		ear.CanCollide = false
		ear.CanQuery = false
		ear.Massless = true
		ear.Size = Vector3.new(0.18, 0.7, 0.55)
		ear.Color = accent
		ear.Material = Enum.Material.Neon
		ear.CFrame = CFrame.new(side * 0.5, 2.0, -0.4)
			* CFrame.Angles(0, 0, math.rad(side * 18))
		ear.Parent = model

		local foot = ball({
			Name = "Foot",
			Size = Vector3.new(0.45, 0.35, 0.6),
			Color = accent,
			Material = mat,
			CFrame = CFrame.new(side * 0.45, 0.2, -0.2),
		})
		foot.Parent = model
	end

	local tail = part({
		Name = "Tail",
		Size = Vector3.new(0.3, 0.3, 0.9),
		Color = accent,
		Material = Enum.Material.Neon,
		CFrame = CFrame.new(0, 0.85, 0.9) * CFrame.Angles(math.rad(-25), 0, 0),
	})
	tail.Parent = model

	-- Aura ring: the variant tell. Chrome/Corrupt/Golden read instantly.
	local ring = part({
		Name = "Aura",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.08, 2.1, 2.1),
		Color = accent,
		Material = Enum.Material.Neon,
		Transparency = 0.55,
		CFrame = CFrame.new(0, 0.12, 0) * CFrame.Angles(0, 0, math.rad(90)),
	})
	ring.Parent = model

	local light = Instance.new("PointLight")
	light.Color = accent
	light.Range = 8
	light.Brightness = 0.8
	light.Parent = body

	return model
end

-- ------------------------------------------------------------------- EGGS
-- An egg: tapered ellipsoid shell with speckles, sitting in a pedestal ring.
function ModelFactory.buildEgg(eggId: string, color: Color3, accent: Color3): Model
	local configured = Assets.EGGS[eggId]
	if configured then
		local fromFolder = Assets.findModel("Eggs", configured.model)
		if fromFolder then return fromFolder end
	end

	local model = Instance.new("Model")
	model.Name = eggId

	-- Shell built from three stacked spheres: narrow top, wide middle, round
	-- base. Reads as an egg silhouette far more than one squashed ball does.
	local base = ball({
		Name = "Shell",
		Size = Vector3.new(3.0, 2.8, 3.0),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
		CFrame = CFrame.new(0, 1.6, 0),
	})
	base.Parent = model
	model.PrimaryPart = base

	local mid = ball({
		Name = "ShellMid",
		Size = Vector3.new(2.6, 2.4, 2.6),
		Color = color,
		Material = Enum.Material.SmoothPlastic,
		CFrame = CFrame.new(0, 2.7, 0),
	})
	mid.Parent = model

	local top = ball({
		Name = "ShellTop",
		Size = Vector3.new(1.7, 1.8, 1.7),
		Color = color:Lerp(Color3.new(1, 1, 1), 0.12),
		Material = Enum.Material.SmoothPlastic,
		CFrame = CFrame.new(0, 3.6, 0),
	})
	top.Parent = model

	-- Speckles: the cheapest possible detail pass, and it works.
	local rng = Random.new(#eggId * 7717)
	for i = 1, 7 do
		local angle = rng:NextNumber(0, math.pi * 2)
		local height = rng:NextNumber(1.2, 3.4)
		local radius = 1.32
		local spot = ball({
			Name = "Speckle",
			Size = Vector3.new(0.5, 0.5, 0.22),
			Color = accent,
			Material = Enum.Material.Neon,
			CFrame = CFrame.new(
				math.cos(angle) * radius,
				height,
				math.sin(angle) * radius
			) * CFrame.Angles(0, -angle + math.pi / 2, 0),
		})
		spot.Parent = model
	end

	-- Pedestal
	local pedestalModel = Assets.findModel("Eggs", Assets.EGG_PEDESTAL.model)
	if pedestalModel then
		pedestalModel.Parent = model
	else
		local plinth = part({
			Name = "Pedestal",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.7, 4.4, 4.4),
			Color = Color3.fromRGB(28, 32, 46),
			Material = Enum.Material.Metal,
			CanCollide = true,
			CFrame = CFrame.new(0, 0.35, 0) * CFrame.Angles(0, 0, math.rad(90)),
		})
		plinth.Parent = model

		local ring = part({
			Name = "PedestalRing",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(0.18, 4.9, 4.9),
			Color = accent,
			Material = Enum.Material.Neon,
			CFrame = CFrame.new(0, 0.75, 0) * CFrame.Angles(0, 0, math.rad(90)),
		})
		ring.Parent = model
	end

	local light = Instance.new("PointLight")
	light.Color = accent
	light.Range = 16
	light.Brightness = 1.6
	light.Parent = base

	return model
end

-- ------------------------------------------------------------------ NODES
-- A node: a cluster of angled crystal shards on a rock base, not a cube.
-- Shard count and angles are seeded per node index so no two look identical
-- but the same node always rebuilds the same way.
function ModelFactory.buildNode(zoneId: string, index: number, color: Color3, scale: number): Model
	local configured = Assets.NODES[zoneId]
	if configured then
		local fromFolder = Assets.findModel("Nodes", configured.model)
		if fromFolder then return fromFolder end
	end

	local model = Instance.new("Model")
	model.Name = "Node"

	local rng = Random.new(index * 9176 + #zoneId)

	-- Rock base: the anchor the shards grow out of, and the collision body.
	local base = part({
		Name = "Base",
		Size = Vector3.new(3.4 * scale, 1.5 * scale, 3.4 * scale),
		Color = color:Lerp(Color3.new(0, 0, 0), 0.72),
		Material = Enum.Material.Slate,
		CanCollide = true,
		CanQuery = true,
		CFrame = CFrame.new(0, 0.75 * scale, 0)
			* CFrame.Angles(0, rng:NextNumber(0, math.pi * 2), 0),
	})
	base.Parent = model
	model.PrimaryPart = base

	-- Crystal shards. A tall centre shard plus 3-5 smaller angled ones gives a
	-- readable cluster silhouette from any angle.
	local shardCount = rng:NextInteger(4, 6)
	for i = 1, shardCount do
		local isCentre = (i == 1)
		local height = isCentre and rng:NextNumber(3.4, 4.4) or rng:NextNumber(1.6, 2.9)
		local width = isCentre and rng:NextNumber(0.9, 1.2) or rng:NextNumber(0.5, 0.85)
		local angle = (i / shardCount) * math.pi * 2 + rng:NextNumber(-0.4, 0.4)
		local dist = isCentre and 0 or rng:NextNumber(0.7, 1.2)
		local tilt = isCentre and rng:NextNumber(-0.08, 0.08) or rng:NextNumber(0.18, 0.42)

		local shard = part({
			Name = "Shard",
			Size = Vector3.new(width * scale, height * scale, width * scale),
			Color = if isCentre then color else color:Lerp(Color3.new(1, 1, 1), 0.2),
			Material = Enum.Material.Neon,
			Transparency = 0.08,
			CanQuery = true,
			CFrame = CFrame.new(
				math.cos(angle) * dist * scale,
				(1.2 + height / 2) * scale,
				math.sin(angle) * dist * scale
			)
				* CFrame.Angles(math.cos(angle) * tilt, rng:NextNumber(0, 3), math.sin(angle) * tilt)
				* CFrame.Angles(0, 0, 0),
		})
		-- Wedge-capped: a block body with a tapered top reads as a crystal
		-- point instead of a pillar, and costs one extra part.
		local cap = Instance.new("WedgePart")
		cap.Name = "ShardTip"
		cap.Anchored = true
		cap.CanCollide = false
		cap.CanQuery = false
		cap.Massless = true
		cap.Size = Vector3.new(width * scale, width * 1.4 * scale, width * scale)
		cap.Color = shard.Color
		cap.Material = Enum.Material.Neon
		cap.Transparency = 0.08
		cap.CFrame = shard.CFrame * CFrame.new(0, (height / 2 + width * 0.7) * scale, 0)
		cap.Parent = model

		shard.Parent = model
	end

	local light = Instance.new("PointLight")
	light.Color = color
	light.Range = 15 * scale
	light.Brightness = 1.6
	light.Parent = base

	return model
end

-- Apply a mesh id to every part of a model that wants one. Used when someone
-- fills in a `mesh` slot but not a `model` slot.
function ModelFactory.applyMesh(model: Model, meshId: string?)
	if not meshId then return end
	local primary = model.PrimaryPart
	if not primary then return end
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.FileMesh
	mesh.MeshId = meshId
	mesh.Scale = Vector3.new(1, 1, 1)
	mesh.Parent = primary
end

-- Pivot a whole model to a CFrame without caring how it was built.
function ModelFactory.place(model: Model, cf: CFrame)
	model:PivotTo(cf)
end

return ModelFactory
