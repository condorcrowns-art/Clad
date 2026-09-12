--!strict
-- WorldBuilder.luau — one island, generated at runtime from code.
--
-- WHY FROM CODE: a .rbxl is an opaque binary. Built from code, the whole game —
-- world included — is plain text in git: reviewable in a diff, mergeable
-- between two people, restorable after a bad save.
--
-- WHY ONE ISLAND: the previous map was four zones and a hub, and it was four
-- times the surface area with a quarter of the players on each. An arena game
-- needs density — the whole design rests on you constantly being able to see
-- somebody bigger and somebody smaller — so everything is now on one 300-stud
-- island and the four zones are gone as PLACES.
--
-- They are not gone as IDEAS. Each one survives as a patch on the island:
--
--   THE SLICK      near-frictionless. Fast lines, no brakes. Pellets x1.15.
--   THE SCRAPYARD  ramps and cover. Broken sightlines, the place to hide.
--   THE BASIN      sunken, richest pellets, one way in and out. x1.55.
--
-- That keeps every bit of terrain character the zones had, costs one map
-- instead of four, and leaves the server undivided.
--
-- WHAT IS NOT BUILT HERE: most of the island's shape. Lumps — the congealed
-- shells of popped blobs — are terrain, and they accumulate for the life of a
-- server. Two hours in, the interesting geometry is all player-made. That is
-- the design working as intended, not a gap.


local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")

local Config = require(game.ReplicatedStorage.GoobShared.Config)
local Pit = require(game.ReplicatedStorage.GoobShared.Pit)

local WorldBuilder = {}

-- Three rings, concentric, on one disc. Everything else is a patch on top.
WorldBuilder.RINGS = {
    VAULT    = { name = "The Vault",    inner = 0,   outer = Config.VAULT_RADIUS },
    FLATS    = { name = "The Flats",    inner = Config.VAULT_RADIUS, outer = Config.SHALLOWS_INNER },
    SHALLOWS = { name = "The Shallows", inner = Config.SHALLOWS_INNER, outer = Config.ISLAND_RADIUS },
}

-- Kept so that anything still asking "where is the middle of the world" gets a
-- sensible answer. There is exactly one place now, so this is a constant.
WorldBuilder.ZONES = {
    ISLAND = { name = "The Island", centre = Vector3.new(0, 0, 0), radius = Config.ISLAND_RADIUS },
}

local function part(props: { [string]: any }): BasePart
    local p = Instance.new("Part")
    p.Anchored = true
    p.CanCollide = true
    p.Material = Enum.Material.SmoothPlastic
    p.TopSurface = Enum.SurfaceType.Smooth
    p.BottomSurface = Enum.SurfaceType.Smooth
    for k, v in pairs(props) do (p :: any)[k] = v end
    return p
end

local function wedge(props: { [string]: any }): BasePart
    local p = Instance.new("WedgePart")
    p.Anchored = true
    p.CanCollide = true
    p.Material = Enum.Material.SmoothPlastic
    for k, v in pairs(props) do (p :: any)[k] = v end
    return p
end

-- A big floating icon + label. The old map told you nothing about what anything
-- was; a nine-year-old should be able to read the whole world at a glance.
local function signpost(parent: Instance, position: Vector3, icon: string, title: string,
                        subtitle: string?, tint: Color3?)
    local post = part({
        Name = "Sign_" .. title,
        Size = Vector3.new(2, 14, 2),
        Position = position + Vector3.new(0, 7, 0),
        Color = Color3.fromRGB(70, 62, 58),
        Material = Enum.Material.Wood,
    })
    post.Parent = parent

    local board = part({
        Name = "Board",
        Size = Vector3.new(0.6, 0.6, 0.6),
        Position = position + Vector3.new(0, 16, 0),
        Transparency = 1,
        CanCollide = false,
    })
    board.Parent = post

    local gui = Instance.new("BillboardGui")
    gui.Size = UDim2.fromScale(22, 11)
    gui.AlwaysOnTop = false
    gui.MaxDistance = 700
    gui.Parent = board

    local frame = Instance.new("Frame")
    frame.Size = UDim2.fromScale(1, 1)
    frame.BackgroundColor3 = Color3.fromRGB(44, 46, 50)
    frame.BackgroundTransparency = 0.1
    frame.Parent = gui
    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 18)
    corner.Parent = frame
    local stroke = Instance.new("UIStroke")
    stroke.Thickness = 3
    stroke.Color = tint or Color3.fromRGB(198, 174, 118)
    stroke.Parent = frame

    local iconLabel = Instance.new("TextLabel")
    iconLabel.Size = UDim2.fromScale(1, 0.5)
    iconLabel.BackgroundTransparency = 1
    iconLabel.Font = Enum.Font.FredokaOne
    iconLabel.TextScaled = true
    iconLabel.Text = icon
    iconLabel.Parent = frame

    local titleLabel = Instance.new("TextLabel")
    titleLabel.Position = UDim2.fromScale(0, 0.48)
    titleLabel.Size = UDim2.fromScale(1, 0.3)
    titleLabel.BackgroundTransparency = 1
    titleLabel.Font = Enum.Font.FredokaOne
    titleLabel.TextScaled = true
    titleLabel.TextColor3 = tint or Color3.fromRGB(198, 174, 118)
    titleLabel.Text = title
    titleLabel.Parent = frame

    if subtitle then
        local sub = Instance.new("TextLabel")
        sub.Position = UDim2.fromScale(0.05, 0.76)
        sub.Size = UDim2.fromScale(0.9, 0.2)
        sub.BackgroundTransparency = 1
        sub.Font = Enum.Font.FredokaOne
        sub.TextScaled = true
        sub.TextColor3 = Color3.fromRGB(176, 178, 176)
        sub.Text = subtitle
        sub.Parent = frame
    end
    return post
end
WorldBuilder.signpost = signpost

-- A ramp you can hit at speed. Angle is gentle on purpose: steep ramps stop a
-- heavy Goob dead, which punishes exactly the players who earned their mass.
local function ramp(parent: Instance, position: Vector3, size: Vector3, yaw: number, color: Color3)
    local w = wedge({
        Name = "Ramp",
        Size = size,
        CFrame = CFrame.new(position) * CFrame.Angles(0, math.rad(yaw), 0),
        Color = color,
        Material = Enum.Material.Metal,
    })
    w.Parent = parent
    return w
end

local function disc(parent: Instance, centre: Vector3, radius: number, thickness: number,
                    color: Color3, material: Enum.Material, name: string): BasePart
    local d = part({
        Name = name,
        Shape = Enum.PartType.Cylinder,
        Size = Vector3.new(thickness, radius * 2, radius * 2),
        CFrame = CFrame.new(centre) * CFrame.Angles(0, 0, math.rad(90)),
        Color = color,
        Material = material,
    })
    d.Parent = parent
    return d
end

WorldBuilder.plots = {} :: { { index: number, center: Vector3, owner: Player? } }

local function buildAmbience()
    Lighting.Ambient = Color3.fromRGB(126, 126, 128)
    Lighting.OutdoorAmbient = Color3.fromRGB(152, 152, 150)
    Lighting.Brightness = 2.0
    Lighting.ClockTime = 15.2
    Lighting.GeographicLatitude = 14
    Lighting.FogEnd = 2200
    Lighting.FogColor = Color3.fromRGB(196, 202, 200)
    Lighting.EnvironmentDiffuseScale = 0.45

    local atmo = Instance.new("Atmosphere")
    atmo.Density = 0.28
    atmo.Haze = 1.1
    atmo.Glare = 0.05
    atmo.Color = Color3.fromRGB(212, 214, 210)
    atmo.Decay = Color3.fromRGB(158, 166, 168)
    atmo.Parent = Lighting

    local bloom = Instance.new("BloomEffect")
    bloom.Intensity = 0.22
    bloom.Threshold = 0.95
    bloom.Size = 16
    bloom.Parent = Lighting

    local sky = Instance.new("Sky")
    sky.Name = "GoobSky"
    sky.Parent = Lighting

    local clouds = Instance.new("Clouds")
    clouds.Cover = 0.36
    clouds.Density = 0.42
    clouds.Color = Color3.fromRGB(238, 238, 236)
    clouds.Parent = Workspace.Terrain
end


-- ── Construction ───────────────────────────────────────────────────────────

-- The Shack. One building, holding every service in the game — and every one
-- of them is ALSO a tap on the dock, from anywhere on the island. Walking here
-- is a thing you may do, never a thing you must do. The previous map made you
-- roll across a zone to press a button, which is how a signpost on a pole
-- ended up being the interface.
local function buildShack(world: Instance)
    local base = Config.SHACK_POSITION
    local shell = part({
        Name = "Shack",
        Size = Vector3.new(54, 26, 40),
        Position = base + Vector3.new(0, 13, 0),
        Color = Color3.fromRGB(122, 114, 104),
        Material = Enum.Material.WoodPlanks,
    })
    shell.Parent = world

    local roof = part({
        Name = "ShackRoof",
        Size = Vector3.new(60, 3, 46),
        Position = base + Vector3.new(0, 27, 0),
        Color = Color3.fromRGB(96, 88, 82),
        Material = Enum.Material.Slate,
    })
    roof.Parent = world

    -- An open front, so it reads as a shop rather than a crate.
    local counter = part({
        Name = "ShackCounter",
        Size = Vector3.new(44, 5, 4),
        Position = base + Vector3.new(0, 4, 22),
        Color = Color3.fromRGB(146, 134, 118),
        Material = Enum.Material.Wood,
    })
    counter.Parent = world

    for i, entry in ipairs({
        { icon = "🎁", label = "CRATES",   x = -17 },
        { icon = "🔧", label = "TRINKETS", x =  -0 },
        { icon = "🤝", label = "TRADE",    x =  17 },
    }) do
        local post = part({
            Name = "ShackStall" .. i,
            Size = Vector3.new(12, 12, 2),
            Position = base + Vector3.new(entry.x, 12, 19),
            Color = Color3.fromRGB(70, 72, 78),
            Material = Enum.Material.SmoothPlastic,
        })
        post.Parent = world

        local gui = Instance.new("BillboardGui")
        gui.Size = UDim2.fromScale(9, 6)
        gui.MaxDistance = 420
        gui.StudsOffset = Vector3.new(0, 2, 2)
        gui.Parent = post

        local icon = Instance.new("TextLabel")
        icon.Size = UDim2.fromScale(1, 0.62)
        icon.BackgroundTransparency = 1
        icon.Font = Enum.Font.FredokaOne
        icon.TextScaled = true
        icon.Text = entry.icon
        icon.Parent = gui

        local label = Instance.new("TextLabel")
        label.Position = UDim2.fromScale(0, 0.62)
        label.Size = UDim2.fromScale(1, 0.34)
        label.BackgroundTransparency = 1
        label.Font = Enum.Font.FredokaOne
        label.TextScaled = true
        label.TextColor3 = Color3.fromRGB(206, 190, 156)
        label.Text = entry.label
        label.Parent = gui
    end

    signpost(world, base + Vector3.new(0, 0, 30), "🏚️", "THE GOOP SHACK",
        "or just tap the dock", Color3.fromRGB(198, 174, 118))
end


-- A readable standing board: a slab with a big text panel on the front. Every
-- board in the world is one of these, so "where does information live" has a
-- single answer instead of four bespoke props.
local function board(parent: Instance, name: string, position: Vector3, facing: number,
                    size: Vector2, tint: Color3)
    local slab = part({
        Name = name,
        Size = Vector3.new(size.X, size.Y, 3),
        CFrame = CFrame.new(position) * CFrame.Angles(0, math.rad(facing), 0),
        Color = Color3.fromRGB(58, 58, 62),
        Material = Enum.Material.Slate,
    })
    slab.Parent = parent

    -- Named `surface`, not `gui`: apicheck tracks instance classes by variable
    -- name across the whole file, and a SurfaceGui called `gui` here made it
    -- read every BillboardGui called `gui` elsewhere as a SurfaceGui too.
    local surface = Instance.new("SurfaceGui")
    surface.Name = "Board"
    surface.Face = Enum.NormalId.Front
    surface.CanvasSize = Vector2.new(size.X * 26, size.Y * 26)
    surface.LightInfluence = 0
    surface.Parent = slab

    local pad = Instance.new("Frame")
    pad.Size = UDim2.fromScale(1, 1)
    pad.BackgroundColor3 = Color3.fromRGB(34, 35, 39)
    pad.BorderSizePixel = 0
    pad.ZIndex = 1
    pad.Parent = surface
    local stroke = Instance.new("UIStroke")
    stroke.Thickness = 6
    stroke.Color = tint
    stroke.Parent = pad

    local entries = Instance.new("TextLabel")
    entries.Name = "Entries"
    entries.Position = UDim2.fromScale(0.05, 0.05)
    entries.Size = UDim2.fromScale(0.9, 0.9)
    entries.BackgroundTransparency = 1
    entries.Font = Enum.Font.FredokaOne
    entries.TextScaled = false
    entries.TextSize = 34
    entries.TextWrapped = true
    entries.TextXAlignment = Enum.TextXAlignment.Left
    entries.TextYAlignment = Enum.TextYAlignment.Top
    entries.TextColor3 = Color3.fromRGB(226, 224, 216)
    -- Set here, not at first refresh: a TextLabel's default Text is the
    -- literal string "Label", and an empty board reading "Label" in
    -- half-metre letters is how that bug shipped last time.
    entries.Text = name .. "\nloading…"
    -- Parented to the SurfaceGui, NOT to the backing frame: every consumer
    -- looks it up as Board -> Entries, and burying it one level deeper turns
    -- that into a WaitForChild that never returns and a board that silently
    -- says "loading…" forever.
    entries.ZIndex = 2
    entries.Parent = surface

    return slab
end

-- Scatter props in a ring, skipping anything too near a landmark. Used for
-- every piece of set dressing, because "a bit of variety, but never in the
-- way" is the same problem every time.
local function scatter(world: Instance, count: number, inner: number, outer: number,
                       rng: Random, make: (Vector3, number) -> ())
    for i = 1, count do
        local a = rng:NextNumber(0, math.pi * 2)
        local r = math.sqrt(rng:NextNumber(inner * inner, outer * outer))
        local pos = Vector3.new(math.cos(a) * r, 0, math.sin(a) * r)
        -- Never inside the Vault approach, and never on top of the Shack.
        if pos.Magnitude > Config.VAULT_RADIUS + 60
            and (pos - Config.SHACK_POSITION).Magnitude > 110 then
            make(pos, i)
        end
    end
end

function WorldBuilder.build()
    buildAmbience()

    local rng = Random.new(20260913)

    local world = Instance.new("Folder")
    world.Name = "GoobWorld"
    world.Parent = Workspace

    -- ── THE SEA ────────────────────────────────────────────────────────────
    -- Not decoration: it is the floor under everything, so that no bug, no
    -- knockback and no Slam can ever drop a player out of the world. An arena
    -- game with a hole in it loses players to the hole.
    local sea = part({
        Name = "Sea",
        Size = Vector3.new(6000, 8, 6000),
        Position = Vector3.new(0, -34, 0),
        Color = Color3.fromRGB(96, 122, 128),
        Material = Enum.Material.Glass,
        Transparency = 0.42,
        Reflectance = 0.25,
    })
    sea.Parent = world

    -- ── THE ISLAND ─────────────────────────────────────────────────────────
    local island = disc(world, Vector3.new(0, -3, 0), Config.ISLAND_RADIUS, 10,
        Color3.fromRGB(132, 146, 120), Enum.Material.Grass, "Island")
    island.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.4, 0.35, 1, 1)

    -- A skirt below the island so it reads as land sitting IN water rather
    -- than a coin floating above it. Purely visual; no collision.
    local skirt = disc(world, Vector3.new(0, -18, 0), Config.ISLAND_RADIUS - 22, 26,
        Color3.fromRGB(104, 96, 84), Enum.Material.Rock, "Skirt")
    skirt.CanCollide = false

    -- The Shallows read as a distinct rim rather than a line on a map, because
    -- "am I safe right now" has to be answerable at a glance while being
    -- chased. Sand, a shade lighter, very slightly lower.
    local shallows = disc(world, Vector3.new(0, -2.2, 0), Config.ISLAND_RADIUS, 1.4,
        Color3.fromRGB(198, 188, 160), Enum.Material.Sand, "Shallows")
    shallows.CanCollide = false

    -- A wet band where the sand meets the water. One extra disc, and it is the
    -- difference between an island and a cylinder.
    local surf = disc(world, Vector3.new(0, -2.0, 0), Config.ISLAND_RADIUS + 16, 1.0,
        Color3.fromRGB(150, 172, 172), Enum.Material.Sand, "Surf")
    surf.CanCollide = false
    surf.Transparency = 0.25

    local flats = disc(world, Vector3.new(0, -1.6, 0), Config.SHALLOWS_INNER, 1.4,
        Color3.fromRGB(126, 144, 112), Enum.Material.Grass, "Flats")
    flats.CanCollide = false

    -- The boundary between safe and not safe is a LINE YOU CAN SEE. It was a
    -- colour change before, which is invisible at speed while something is
    -- chasing you — and "am I safe" is the most urgent question in the game.
    local edge = disc(world, Vector3.new(0, -1.2, 0), Config.SHALLOWS_INNER + 3, 1.2,
        Color3.fromRGB(206, 186, 132), Enum.Material.Neon, "SafeLine")
    edge.CanCollide = false
    edge.Transparency = 0.45

    -- ── THE VAULT ──────────────────────────────────────────────────────────
    -- Raised, central, and visible from the whole island on purpose: a player
    -- must always be able to see where their mass is safe, and everyone else
    -- must always be able to see who is running for it. On a 480-stud island
    -- that means it has to be tall enough to read from the rim, so it is a
    -- structure now rather than a step.
    local vaultBase = disc(world, Vector3.new(0, Config.VAULT_HEIGHT / 2 - 1, 0),
        Config.VAULT_RADIUS + 14, Config.VAULT_HEIGHT + 2,
        Color3.fromRGB(116, 110, 102), Enum.Material.Concrete, "VaultBase")
    vaultBase.Name = "VaultBase"

    local dish = disc(world, Vector3.new(0, Config.VAULT_HEIGHT, 0), Config.VAULT_RADIUS, 1.6,
        Color3.fromRGB(180, 160, 116), Enum.Material.Foil, "VaultDish")
    local vaultTag = Instance.new("StringValue")
    vaultTag.Name = "VaultMarker"
    vaultTag.Parent = dish

    -- Eight pillars and a floating cap. This is the landmark the entire map
    -- orients on, so it is the one thing allowed to be tall.
    for i = 0, 7 do
        local a = math.rad(i * 45)
        local pillar = part({
            Name = "VaultPillar",
            Size = Vector3.new(7, 58, 7),
            Position = Vector3.new(math.cos(a) * (Config.VAULT_RADIUS - 5), 30,
                                   math.sin(a) * (Config.VAULT_RADIUS - 5)),
            Color = Color3.fromRGB(138, 130, 118),
            Material = Enum.Material.Marble,
        })
        pillar.CanCollide = false   -- never a wall between a player and banking
        pillar.Parent = world
    end

    local cap = disc(world, Vector3.new(0, 62, 0), Config.VAULT_RADIUS + 6, 5,
        Color3.fromRGB(152, 142, 128), Enum.Material.Marble, "VaultCap")
    cap.CanCollide = false

    -- A beacon, so the Vault is findable from the rim and from inside the
    -- Basin, which is the one place on the island you cannot see out of.
    local beacon = part({
        Name = "VaultBeacon",
        Shape = Enum.PartType.Ball,
        Size = Vector3.new(16, 16, 16),
        Position = Vector3.new(0, 76, 0),
        Color = Color3.fromRGB(206, 184, 126),
        Material = Enum.Material.Neon,
        Transparency = 0.25,
        CanCollide = false,
    })
    beacon.Parent = world
    local glow = Instance.new("PointLight")
    glow.Brightness = 2.4
    glow.Range = 160
    glow.Color = Color3.fromRGB(224, 200, 140)
    glow.Parent = beacon

    -- Four ramps, one per approach. A heavy blob cannot climb a step, and the
    -- Vault has to be reachable at exactly the moment you are heaviest.
    for i = 0, 3 do
        local a = math.rad(i * 90 + 45)
        local dir = Vector3.new(math.cos(a), 0, math.sin(a))
        ramp(world, dir * (Config.VAULT_RADIUS + 30) + Vector3.new(0, Config.VAULT_HEIGHT / 2 - 1, 0),
            Vector3.new(44, Config.VAULT_HEIGHT + 2, 44), math.deg(a) + 90,
            Color3.fromRGB(126, 120, 110))
    end

    signpost(world, Vector3.new(0, Config.VAULT_HEIGHT, -(Config.VAULT_RADIUS + 26)),
        "🏦", "THE VAULT", "roll in and hold still", Color3.fromRGB(198, 174, 118))

    -- ── THE PATCHES ────────────────────────────────────────────────────────
    -- Data-driven over Config.BIOMES. The previous version indexed [1], [2]
    -- and [3] by hand, so adding a fourth biome to the config built four
    -- signposts and three patches — a zone you could read about and never
    -- stand on.
    local LOOK = {
        slick = { tint = Color3.fromRGB(150, 168, 178), mat = Enum.Material.Ice,          icon = "🧊" },
        scrap = { tint = Color3.fromRGB(134, 124, 112), mat = Enum.Material.CorrodedMetal,icon = "🔩" },
        basin = { tint = Color3.fromRGB(100, 116, 108), mat = Enum.Material.Mud,          icon = "🕳️" },
        bloom = { tint = Color3.fromRGB(146, 162, 126), mat = Enum.Material.LeafyGrass,   icon = "🌾" },
        ash   = { tint = Color3.fromRGB(122, 116, 116), mat = Enum.Material.Basalt,       icon = "🌋" },
    }

    for _, biome in ipairs(Config.BIOMES) do
        local look = LOOK[biome.id] or { tint = Color3.fromRGB(140, 140, 140),
            mat = Enum.Material.Sand, icon = "•" }
        local sunken = biome.centre.Y < 0
        -- `ground`, not `surface`: apicheck tracks instance classes by variable
        -- name across the file, and board() already binds `surface` to a
        -- SurfaceGui.
        local ground = disc(world, biome.centre + Vector3.new(0, sunken and 0 or 0.35, 0),
            biome.radius, sunken and 1.6 or 1.2, look.tint, look.mat, "Biome_" .. biome.id)
        ground.CustomPhysicalProperties =
            PhysicalProperties.new(0.7, biome.friction, 0.35, 1, 1)
        local tag = Instance.new("StringValue")
        tag.Name = "BiomeId"
        tag.Value = biome.id
        tag.Parent = ground

        signpost(world, biome.centre + Vector3.new(0, sunken and 8 or 0, biome.radius + 16),
            look.icon, biome.name, ("pellets x%.2f"):format(biome.pelletMult),
            Color3.fromRGB(158, 166, 172))
    end

    -- The Basin is the only patch with real elevation. From inside it you
    -- cannot see who is coming, and leaving while heavy is genuinely slow.
    -- That is what the x1.55 pellets are paying for.
    local basin = Config.BIOMES[3]
    for i = 0, 15 do
        local a = math.rad(i * 22.5)
        -- One gap in the wall, north. A basin you cannot leave is a trap, and
        -- a trap is not a risk-reward decision.
        if i ~= 0 and i ~= 15 then
            local w = part({
                Name = "BasinWall",
                Size = Vector3.new(28, 15, 10),
                CFrame = CFrame.new(basin.centre + Vector3.new(
                    math.cos(a) * (basin.radius + 3), 6, math.sin(a) * (basin.radius + 3)))
                    * CFrame.Angles(0, -a, 0),
                Color = Color3.fromRGB(112, 106, 94),
                Material = Enum.Material.Rock,
            })
            w.Parent = world
        end
    end
    ramp(world, basin.centre + Vector3.new(0, 0, -(basin.radius + 20)),
        Vector3.new(44, 14, 42), 180, Color3.fromRGB(120, 114, 102))

    -- Scrapyard furniture: cover, ramps, broken sightlines. Hiding has to be
    -- possible or the smallest blob on the island has no play except running
    -- in a straight line.
    local scrap = Config.BIOMES[2]
    for i = 0, 13 do
        local a = math.rad(i * 26 + 12)
        local r = scrap.radius * (0.3 + (i % 4) * 0.18)
        local pos = scrap.centre + Vector3.new(math.cos(a) * r, 0, math.sin(a) * r)
        if i % 3 == 0 then
            ramp(world, pos + Vector3.new(0, 4, 0), Vector3.new(26, 9, 32),
                math.deg(a), Color3.fromRGB(130, 122, 110))
        else
            local block = part({
                Name = "Scrap",
                Size = Vector3.new(14 + (i % 5) * 5, 12 + (i % 3) * 8, 11 + (i % 4) * 5),
                CFrame = CFrame.new(pos + Vector3.new(0, 6, 0)) * CFrame.Angles(0, a, 0),
                Color = Color3.fromRGB(118, 110, 102),
                Material = Enum.Material.CorrodedMetal,
            })
            block.Parent = world
        end
    end

    -- Ashfield: open ground with tall thin spires. They break a sniper's line
    -- without giving anyone a place to sit, which is why the Ashfield is the
    -- most dangerous good ground on the island.
    local ash = Config.BIOMES[5]
    for i = 0, 8 do
        local a = math.rad(i * 40 + 7)
        local r = ash.radius * (0.25 + (i % 3) * 0.25)
        local spire = part({
            Name = "Spire",
            Size = Vector3.new(6 + (i % 3) * 3, 34 + (i % 4) * 14, 6 + (i % 3) * 3),
            CFrame = CFrame.new(ash.centre
                + Vector3.new(math.cos(a) * r, 18, math.sin(a) * r))
                * CFrame.Angles(0, a, math.rad((i % 3) * 4 - 4)),
            Color = Color3.fromRGB(104, 100, 100),
            Material = Enum.Material.Basalt,
        })
        spire.Parent = world
    end

    -- Bloom: soft cover you can roll straight through. Visual variety that
    -- never becomes a wall, which is the whole brief for decoration in a game
    -- about momentum.
    local bloom = Config.BIOMES[4]
    for i = 1, 26 do
        local a = rng:NextNumber(0, math.pi * 2)
        local r = math.sqrt(rng:NextNumber(0, bloom.radius * bloom.radius))
        local tuft = part({
            Name = "Bloom",
            Shape = Enum.PartType.Ball,
            Size = Vector3.new(1, 1, 1) * rng:NextNumber(7, 16),
            Position = bloom.centre + Vector3.new(math.cos(a) * r, 3, math.sin(a) * r),
            Color = Color3.fromRGB(158, 172, 132),
            Material = Enum.Material.LeafyGrass,
            Transparency = 0.15,
        })
        tuft.CanCollide = false
        tuft.Parent = world
    end

    -- ── SCENERY ────────────────────────────────────────────────────────────
    -- Rocks on the rim and a few boulders inland. Anchored, collidable, and
    -- deliberately sparse: this is an arena, and every prop is somewhere a
    -- player cannot be.
    scatter(world, 34, Config.SHALLOWS_INNER + 12, Config.ISLAND_RADIUS - 14, rng,
        function(pos, i)
            local rock = part({
                Name = "Rock",
                Size = Vector3.new(rng:NextNumber(10, 26), rng:NextNumber(8, 22),
                                   rng:NextNumber(10, 26)),
                CFrame = CFrame.new(pos + Vector3.new(0, 2, 0))
                    * CFrame.Angles(rng:NextNumber(-0.2, 0.2), rng:NextNumber(0, 6),
                                    rng:NextNumber(-0.2, 0.2)),
                Color = Color3.fromRGB(118, 112, 104),
                Material = Enum.Material.Rock,
            })
            rock.Parent = world
        end)

    scatter(world, 18, Config.VAULT_RADIUS + 90, Config.SHALLOWS_INNER - 40, rng,
        function(pos)
            local boulder = part({
                Name = "Boulder",
                Shape = Enum.PartType.Ball,
                Size = Vector3.new(1, 1, 1) * rng:NextNumber(14, 30),
                Position = pos + Vector3.new(0, 3, 0),
                Color = Color3.fromRGB(124, 120, 110),
                Material = Enum.Material.Slate,
            })
            boulder.Parent = world
        end)

    -- ── THE SHACK ──────────────────────────────────────────────────────────
    buildShack(world)

    WorldBuilder.plots = {}
    for i = 1, Config.PLOT_COUNT do
        local a = math.rad(-90 + (i - 1) * (180 / math.max(1, Config.PLOT_COUNT - 1)))
        local centre = Config.SHACK_POSITION + Vector3.new(math.cos(a) * 70, 1, math.sin(a) * 70)
        local pad = disc(world, centre, 12, 2,
            Color3.fromRGB(140, 134, 122), Enum.Material.Concrete, "Plot" .. i)
        pad.Name = "Plot" .. i
        table.insert(WorldBuilder.plots, { index = i, center = centre + Vector3.new(0, 1, 0), owner = nil })
    end

    -- ── THE STANDOFF RING ──────────────────────────────────────────────────
    -- Off the island, across a causeway, and raised. A 1v1 anyone can roll
    -- into is not a 1v1.
    local ringFloor = disc(world, Pit.CENTRE - Vector3.new(0, 4, 0), Pit.START_RADIUS + 14, 10,
        Color3.fromRGB(124, 116, 106), Enum.Material.Concrete, "PitFloor")
    ringFloor.Name = "PitFloor"

    local span = Pit.CENTRE.Z - Config.ISLAND_RADIUS
    local causeway = part({
        Name = "Causeway",
        Size = Vector3.new(40, 5, span + 40),
        Position = Vector3.new(0, Pit.CENTRE.Y - 6,
            (Pit.CENTRE.Z + Config.ISLAND_RADIUS) / 2),
        Color = Color3.fromRGB(138, 132, 120),
        Material = Enum.Material.Concrete,
    })
    causeway.Parent = world

    local ring = disc(world, Pit.CENTRE, Pit.START_RADIUS, 1.5,
        Color3.fromRGB(178, 150, 150), Enum.Material.SmoothPlastic, "PitRing")
    ring.Name = "PitRing"
    ring.CanCollide = false

    for i = 0, 11 do
        local a = math.rad(i * 30)
        local torch = part({
            Name = "RingTorch",
            Size = Vector3.new(4, 22, 4),
            Position = Pit.CENTRE + Vector3.new(
                math.cos(a) * (Pit.START_RADIUS + 20), 7, math.sin(a) * (Pit.START_RADIUS + 20)),
            Color = Color3.fromRGB(96, 90, 84),
            Material = Enum.Material.Slate,
        })
        torch.Parent = world
    end

    signpost(world, Pit.CENTRE + Vector3.new(0, -4, Pit.START_RADIUS + 40), "🥊",
        "THE STANDOFF", "equal mass. pure steering.", Color3.fromRGB(190, 150, 150))

    local joinPad = disc(world, Vector3.new(0, 1.4, Config.ISLAND_RADIUS - 30), 22, 2,
        Color3.fromRGB(178, 150, 150), Enum.Material.Neon, "PitJoinPad")
    joinPad.Name = "PitJoinPad"
    joinPad.CanCollide = false

    -- ── THE BOARDS ─────────────────────────────────────────────────────────
    board(world, "Leaderboard",
        Vector3.new(-96, 20, -(Config.VAULT_RADIUS + 46)), 14,
        Vector2.new(56, 34), Color3.fromRGB(198, 174, 118))
    board(world, "Archive",
        Vector3.new(96, 20, -(Config.VAULT_RADIUS + 46)), -14,
        Vector2.new(56, 34), Color3.fromRGB(150, 170, 186))

    -- ── SPAWNS ─────────────────────────────────────────────────────────────
    -- Spread around the Shallows so a full server does not appear inside
    -- itself, and so nobody spawns in reach of a predator.
    for i = 1, Config.SPAWN_POINTS do
        local a = math.rad(i * (360 / Config.SPAWN_POINTS))
        local spawn = Instance.new("SpawnLocation")
        spawn.Name = "Spawn" .. i
        spawn.Anchored = true
        spawn.CanCollide = false
        spawn.Size = Vector3.new(16, 1, 16)
        spawn.Position = Vector3.new(math.cos(a) * Config.SPAWN_RING, 1.4, math.sin(a) * Config.SPAWN_RING)
        spawn.Color = Color3.fromRGB(186, 190, 176)
        spawn.Material = Enum.Material.SmoothPlastic
        spawn.Transparency = 0.75
        spawn.Neutral = true
        spawn.Parent = world
    end

    local live = Instance.new("Folder")
    live.Name = "Arena"
    live.Parent = world

    return world
end

-- ── Queries ────────────────────────────────────────────────────────────────

function WorldBuilder.vaultPosition(): Vector3
    return Vector3.new(0, Config.VAULT_HEIGHT, 0)
end

-- Which ring a point is in. Used by the arena to decide whether PvP applies,
-- which is the single most important question on the island.
function WorldBuilder.ringAt(position: Vector3): string
    local r = Vector3.new(position.X, 0, position.Z).Magnitude
    if r <= Config.VAULT_RADIUS then
        return "VAULT"
    elseif r <= Config.SHALLOWS_INNER then
        return "FLATS"
    end
    return "SHALLOWS"
end

function WorldBuilder.isSafe(position: Vector3): boolean
    return WorldBuilder.ringAt(position) == "SHALLOWS"
end

-- Which biome a point is over, or nil for open Flats. Returns the whole entry
-- so callers read `.pelletMult` instead of re-deriving it from an id.
function WorldBuilder.biomeAt(position: Vector3)
    for _, b in ipairs(Config.BIOMES) do
        local flat = Vector3.new(position.X - b.centre.X, 0, position.Z - b.centre.Z)
        if flat.Magnitude <= b.radius then
            return b
        end
    end
    return nil
end

-- A point on the island suitable for dropping something loose. Uniform by
-- AREA, not by radius: sampling radius uniformly piles everything into the
-- middle, which would put most of the island's food inside the Vault.
function WorldBuilder.randomSurfacePoint(rng: Random, innerR: number?, outerR: number?): Vector3
    local lo = innerR or (Config.VAULT_RADIUS + 14)
    local hi = outerR or (Config.ISLAND_RADIUS - 10)
    local r = math.sqrt(rng:NextNumber(lo * lo, hi * hi))
    local a = rng:NextNumber(0, math.pi * 2)
    local pos = Vector3.new(math.cos(a) * r, 2, math.sin(a) * r)
    local b = WorldBuilder.biomeAt(pos)
    if b then
        pos = Vector3.new(pos.X, b.centre.Y + 2, pos.Z)
    end
    return pos
end

function WorldBuilder.arenaFolder(): Folder
    local world = Workspace:FindFirstChild("GoobWorld")
    return (world and world:FindFirstChild("Arena")) :: Folder
end

function WorldBuilder.claimPlot(player: Player)
    for _, plot in ipairs(WorldBuilder.plots) do
        if plot.owner == nil then
            plot.owner = player
            return plot
        end
    end
    return nil
end

function WorldBuilder.releasePlot(player: Player)
    for _, plot in ipairs(WorldBuilder.plots) do
        if plot.owner == player then
            plot.owner = nil
            return
        end
    end
end

function WorldBuilder.plotFor(player: Player)
    for _, plot in ipairs(WorldBuilder.plots) do
        if plot.owner == player then return plot end
    end
    return nil
end

-- Ascension happens at the Vault now. There is one landmark in this game and
-- everything ceremonial belongs on it.
function WorldBuilder.altarPosition(): Vector3
    return WorldBuilder.vaultPosition()
end

return WorldBuilder
