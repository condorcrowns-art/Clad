--!strict
-- WorldBuilder.luau — the entire map, generated at runtime from code.
--
-- WHY FROM CODE: a .rbxl is an opaque binary. If the map lives in the place
-- file, nothing about the world is reviewable in a diff, mergeable between two
-- people, or restorable after a bad save. Built from code, the whole game —
-- world included — is plain text in git.
--
-- WHY THIS SHAPE: the first version was a flat green plane with eight glowing
-- pads, and it read as unfinished because it WAS unfinished — there was nothing
-- to do in space, so space was decoration. With momentum movement, surface and
-- elevation become gameplay, so the map is now built around them:
--
--   HUB        flat, signposted, safe. Every service has a big readable icon.
--   SCRAPYARD  ramps and a half-pipe. The learning zone for dashing.
--   SLICKFIELD low friction. You slide. Fast lines, hard stops.
--   THE DEEP   sunken, rare spawns, only entered across a gap that needs a dash.
--
-- Every zone is reachable by rolling; only The Deep demands a dash, which is
-- what makes the dash meter mean something instead of being a speed toy.

local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")

local Config = require(game.ReplicatedStorage.GoobShared.Config)
local Pit = require(game.ReplicatedStorage.GoobShared.Pit)

local WorldBuilder = {}

WorldBuilder.ZONES = {
    HUB        = { name = "The Hub",     centre = Vector3.new(0, 0, 0),      radius = 170 },
    SCRAPYARD  = { name = "Scrapyard",   centre = Vector3.new(520, 0, 0),    radius = 260 },
    SLICKFIELD = { name = "Slickfield",  centre = Vector3.new(-520, 0, 120), radius = 260 },
    -- Sits below and beyond the southern lip of the ground plane. The gap
    -- between the lip (z = -452) and the landing (z = -496) is ~44 studs: far
    -- enough that walking off is a fall, close enough that a ramp plus one dash
    -- clears it. This is the only place in the world you can fall out of.
    DEEP       = { name = "The Deep",    centre = Vector3.new(40, -34, -710), radius = 240 },
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

function WorldBuilder.build()
    buildAmbience()

    local world = Instance.new("Folder")
    world.Name = "GoobWorld"
    world.Parent = Workspace

    -- Roads connect the zones, so travelling somewhere is a route rather than a
    -- void. Declared early because the Pit uses it too.
    local function road(from: Vector3, to: Vector3, width: number)
        local mid = (from + to) / 2
        local delta = to - from
        local len = delta.Magnitude
        local r = part({
            Name = "Road",
            Size = Vector3.new(width, 4, len),
            CFrame = CFrame.new(mid, to) * CFrame.new(0, 0, 0),
            Color = Color3.fromRGB(178, 172, 158),
            Material = Enum.Material.Concrete,
        })
        r.Parent = world
        return r
    end

    -- ── THE GROUND ─────────────────────────────────────────────────────────
    -- One continuous plane under everything reachable. The zone rewrite
    -- replaced the old world plane with separate discs, which left the map as
    -- islands floating in open sky — you could roll three steps off a pad and
    -- fall out of the world.
    --
    -- The Deep is deliberately NOT on this plane: it sits lower and beyond the
    -- southern edge, across a gap that must be dashed. That gap is the only
    -- hole in the world, and it is there on purpose.
    local ground = part({
        Name = "Ground",
        Size = Vector3.new(2400, 14, 1150),
        Position = Vector3.new(0, -7, 120),
        Color = Color3.fromRGB(138, 152, 124),
        Material = Enum.Material.Grass,
    })
    ground.Parent = world

    -- A soft lip so the southern edge reads as an edge before you go over it.
    local lip = part({
        Name = "SouthLip",
        Size = Vector3.new(2400, 3, 6),
        Position = Vector3.new(0, 1, -452),
        Color = Color3.fromRGB(166, 154, 128),
        Material = Enum.Material.Slate,
    })
    lip.Parent = world

    -- ── HUB ────────────────────────────────────────────────────────────────
    local hub = WorldBuilder.ZONES.HUB
    disc(world, hub.centre + Vector3.new(0, -1, 0), hub.radius, 6,
        Color3.fromRGB(206, 198, 180), Enum.Material.Sand, "HubFloor")

    -- Rim so the hub reads as a raised island rather than a paint patch.
    for i = 1, 40 do
        local a = (i / 40) * math.pi * 2
        local post = part({
            Name = "HubRim",
            Size = Vector3.new(3, 7, 3),
            Position = hub.centre + Vector3.new(math.cos(a) * hub.radius, 3, math.sin(a) * hub.radius),
            Color = Color3.fromRGB(150, 162, 168),
            Material = Enum.Material.SmoothPlastic,
            Transparency = 0.25,
            CanCollide = false,
        })
        post.Parent = world
    end

    local booth = part({
        Name = "TradeBooth",
        Shape = Enum.PartType.Cylinder,
        Size = Vector3.new(1.6, Config.TRADE_RANGE * 2, Config.TRADE_RANGE * 2),
        CFrame = CFrame.new(hub.centre + Vector3.new(0, 2.4, 0)) * CFrame.Angles(0, 0, math.rad(90)),
        Color = Color3.fromRGB(198, 174, 118),
        Material = Enum.Material.SmoothPlastic,
        Transparency = 0.55,
        CanCollide = false,
    })
    booth.Parent = world
    signpost(world, hub.centre + Vector3.new(0, 3, -34), "🤝", "TRADE RING",
        "roll in here with a friend", Color3.fromRGB(198, 174, 118))

    signpost(world, hub.centre + Vector3.new(-64, 3, 20), "🍪", "SNACK STAND",
        "spend 💧 on food", Color3.fromRGB(190, 158, 120))
    signpost(world, hub.centre + Vector3.new(64, 3, 20), "🥚", "HATCHERY",
        "new Goobs", Color3.fromRGB(150, 176, 190))

    -- Leaderboard pillar.
    local pillar = part({
        Name = "Leaderboard",
        Size = Vector3.new(18, 34, 4),
        Position = hub.centre + Vector3.new(0, 17, -96),
        Color = Color3.fromRGB(58, 60, 64),
        Material = Enum.Material.Metal,
    })
    pillar.Parent = world

    local surface = Instance.new("SurfaceGui")
    surface.Name = "Board"
    surface.Face = Enum.NormalId.Front
    surface.CanvasSize = Vector2.new(560, 1000)
    surface.Parent = pillar

    local list = Instance.new("TextLabel")
    list.Name = "Entries"
    list.Size = UDim2.fromScale(1, 1)
    list.BackgroundTransparency = 1
    list.Font = Enum.Font.FredokaOne
    list.TextColor3 = Color3.new(1, 1, 1)
    list.TextXAlignment = Enum.TextXAlignment.Left
    list.TextYAlignment = Enum.TextYAlignment.Top
    list.TextSize = 34
    list.Text = "🏆 BIGGEST GOOBS\n\nloading…"
    list.Parent = surface

    -- Ascension altar: the terminus. Deliberately the tallest thing on the hub.
    local altar = part({
        Name = "AscensionAltar",
        Shape = Enum.PartType.Cylinder,
        Size = Vector3.new(4, 40, 40),
        CFrame = CFrame.new(hub.centre + Vector3.new(0, 3, 96)) * CFrame.Angles(0, 0, math.rad(90)),
        Color = Color3.fromRGB(226, 216, 186),
        Material = Enum.Material.SmoothPlastic,
        Transparency = 0.45,
        CanCollide = false,
    })
    altar.Parent = world
    local altarLight = Instance.new("PointLight")
    altarLight.Brightness = 2
    altarLight.Range = 70
    altarLight.Color = Color3.fromRGB(224, 214, 184)
    altarLight.Parent = altar
    signpost(world, hub.centre + Vector3.new(0, 3, 124), "👑", "ASCEND",
        "Colossal Goobs only", Color3.fromRGB(202, 190, 150))

    -- Home pads: where your OTHER Goobs sit on display now that the active one
    -- is your body.
    local count = Config.PLOT_COUNT
    for i = 1, count do
        local angle = (i - 1) / count * math.pi * 2
        local centre = hub.centre + Vector3.new(math.cos(angle) * 132, 1, math.sin(angle) * 132)
        local pad = part({
            Name = "Plot" .. i,
            Shape = Enum.PartType.Cylinder,
            Size = Vector3.new(2, 40, 40),
            CFrame = CFrame.new(centre) * CFrame.Angles(0, 0, math.rad(90)),
            Color = Color3.fromRGB(190, 182, 168),
            Material = Enum.Material.Slate,
        })
        pad.Parent = world

        local sign = part({
            Name = "Sign", Size = Vector3.new(1, 1, 1),
            Position = centre + Vector3.new(0, 9, 0), Transparency = 1, CanCollide = false,
        })
        sign.Parent = pad
        local gui = Instance.new("BillboardGui")
        gui.Name = "PlotLabel"
        gui.Size = UDim2.fromScale(14, 3.4)
        gui.MaxDistance = 300
        gui.Parent = sign
        local tl = Instance.new("TextLabel")
        tl.Size = UDim2.fromScale(1, 1)
        tl.BackgroundTransparency = 1
        tl.Font = Enum.Font.FredokaOne
        tl.TextScaled = true
        tl.TextColor3 = Color3.new(1, 1, 1)
        tl.TextStrokeTransparency = 0.3
        tl.Text = "OPEN PAD"
        tl.Parent = gui

        table.insert(WorldBuilder.plots, { index = i, center = centre, owner = nil })
    end

    -- ── SCRAPYARD: ramps, the learning zone ────────────────────────────────
    local sy = WorldBuilder.ZONES.SCRAPYARD
    disc(world, sy.centre + Vector3.new(0, -1, 0), sy.radius, 6,
        Color3.fromRGB(146, 138, 124), Enum.Material.Ground, "ScrapyardFloor")
    signpost(world, sy.centre + Vector3.new(-210, 3, 0), "🔧", "SCRAPYARD",
        "ramps · common junk", Color3.fromRGB(180, 148, 116))

    for i = 1, 7 do
        local a = (i / 7) * math.pi * 2
        ramp(world, sy.centre + Vector3.new(math.cos(a) * 120, 7, math.sin(a) * 120),
            Vector3.new(30, 14, 58), math.deg(a) + 90, Color3.fromRGB(148, 116, 100))
    end
    -- A half-pipe to bounce between.
    for _, sx in ipairs({ -1, 1 }) do
        ramp(world, sy.centre + Vector3.new(sx * 56, 11, -40),
            Vector3.new(70, 22, 40), sx > 0 and 90 or 270, Color3.fromRGB(128, 128, 128))
    end

    -- ── SLICKFIELD: low friction ───────────────────────────────────────────
    local sf = WorldBuilder.ZONES.SLICKFIELD
    local ice = disc(world, sf.centre + Vector3.new(0, -1, 0), sf.radius, 6,
        Color3.fromRGB(188, 202, 206), Enum.Material.Ice, "SlickfieldFloor")
    -- Almost no friction: this is the zone's entire identity.
    ice.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.02, 0.3, 1, 1)
    signpost(world, sf.centre + Vector3.new(210, 3, 0), "🧊", "SLICKFIELD",
        "no grip · go fast", Color3.fromRGB(160, 180, 190))

    for i = 1, 5 do
        local a = (i / 5) * math.pi * 2
        local pillar2 = part({
            Name = "IcePillar",
            Size = Vector3.new(16, 46, 16),
            Position = sf.centre + Vector3.new(math.cos(a) * 130, 22, math.sin(a) * 130),
            Color = Color3.fromRGB(198, 208, 210),
            Material = Enum.Material.Ice,
            Transparency = 0.25,
        })
        pillar2.Parent = world
    end

    -- ── THE DEEP: gated by a dash ──────────────────────────────────────────
    local dp = WorldBuilder.ZONES.DEEP
    disc(world, dp.centre + Vector3.new(0, -1, 0), dp.radius, 6,
        Color3.fromRGB(74, 70, 82), Enum.Material.Slate, "DeepFloor")
    signpost(world, dp.centre + Vector3.new(0, 3, 190), "🌑", "THE DEEP",
        "rarest spawns · dash to cross", Color3.fromRGB(166, 154, 180))

    -- The launch ramp, then a gap. Crossing it needs a dash off the lip; that
    -- is the moment the dash meter stops being a toy and becomes a key.
    ramp(world, Vector3.new(20, 7, -410), Vector3.new(70, 16, 76), 0, Color3.fromRGB(126, 116, 140))
    local landing = part({
        Name = "DeepLanding",
        Size = Vector3.new(110, 6, 80),
        Position = dp.centre + Vector3.new(0, 2, 214),
        Color = Color3.fromRGB(92, 74, 124),
        Material = Enum.Material.Slate,
    })
    landing.Parent = world

    for i = 1, 6 do
        local a = (i / 6) * math.pi * 2
        local glow = part({
            Name = "DeepGlow",
            Shape = Enum.PartType.Ball,
            Size = Vector3.new(9, 9, 9),
            Position = dp.centre + Vector3.new(math.cos(a) * 150, 14, math.sin(a) * 150),
            Color = Color3.fromRGB(168, 152, 186),
            Material = Enum.Material.Neon,
            CanCollide = false,
        })
        glow.Parent = world
        local l = Instance.new("PointLight")
        l.Brightness = 2
        l.Range = 46
        l.Color = Color3.fromRGB(168, 152, 186)
        l.Parent = glow
    end

    road(hub.centre + Vector3.new(150, -1, 0), sy.centre + Vector3.new(-220, -1, 0), 60)
    road(hub.centre + Vector3.new(-150, -1, 40), sf.centre + Vector3.new(220, -1, 90), 60)
    road(hub.centre + Vector3.new(0, -1, -150), Vector3.new(20, -1, -400), 60)

    -- ── THE ARCHIVE ────────────────────────────────────────────────────────
    -- A monument you roll up to and read. The whole design rests on genuine
    -- scarcity, and until this existed a player was simply asked to take that
    -- on faith. This is the number, worldwide, updated live.
    local archive = part({
        Name = "Archive",
        Size = Vector3.new(22, 30, 4),
        Position = hub.centre + Vector3.new(-86, 15, -70),
        Color = Color3.fromRGB(62, 60, 66),
        Material = Enum.Material.Marble,
    })
    archive.Parent = world

    local archiveGui = Instance.new("SurfaceGui")
    archiveGui.Name = "Board"
    archiveGui.Face = Enum.NormalId.Front
    archiveGui.CanvasSize = Vector2.new(660, 900)
    archiveGui.Parent = archive

    local archiveText = Instance.new("TextLabel")
    archiveText.Name = "Entries"
    archiveText.Size = UDim2.fromScale(1, 1)
    archiveText.BackgroundTransparency = 1
    archiveText.Font = Enum.Font.FredokaOne
    archiveText.TextColor3 = Color3.fromRGB(226, 224, 218)
    archiveText.TextXAlignment = Enum.TextXAlignment.Left
    archiveText.TextYAlignment = Enum.TextYAlignment.Top
    archiveText.TextSize = 26
    archiveText.Text = "📜 THE ARCHIVE\n\ncounting…"
    archiveText.Parent = archiveGui

    local archiveLight = Instance.new("PointLight")
    archiveLight.Brightness = 1.5
    archiveLight.Range = 50
    archiveLight.Color = Color3.fromRGB(180, 172, 190)
    archiveLight.Parent = archive

    signpost(world, hub.centre + Vector3.new(-86, 3, -44), "📜", "THE ARCHIVE",
        "how many still exist", Color3.fromRGB(168, 158, 182))

    -- ── THE SUMO PIT ───────────────────────────────────────────────────────
    -- Raised and open-sided on purpose: the danger has to be legible from
    -- outside, and you have to be able to SEE someone get knocked off.
    local pitFloor = disc(world, Pit.CENTRE - Vector3.new(0, 4, 0), Pit.START_RADIUS + 8, 8,
        Color3.fromRGB(74, 58, 58), Enum.Material.Slate, "PitFloor")
    pitFloor.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.4, 0.4, 1, 1)

    -- The ring itself is resized live by PitService as the arena closes.
    local ring = part({
        Name = "PitRing",
        Shape = Enum.PartType.Cylinder,
        Size = Vector3.new(1.5, Pit.START_RADIUS * 2, Pit.START_RADIUS * 2),
        CFrame = CFrame.new(Pit.CENTRE + Vector3.new(0, 0.6, 0)) * CFrame.Angles(0, 0, math.rad(90)),
        Color = Color3.fromRGB(184, 118, 112),
        Material = Enum.Material.Neon,
        Transparency = 0.6,
        CanCollide = false,
    })
    ring.Parent = world

    -- Stands, so a crowd has somewhere to watch from.
    for i = 1, 24 do
        local a = (i / 24) * math.pi * 2
        local r = Pit.START_RADIUS + 34
        local seat = part({
            Name = "PitStand",
            Size = Vector3.new(14, 10, 14),
            Position = Pit.CENTRE + Vector3.new(math.cos(a) * r, -2, math.sin(a) * r),
            Color = Color3.fromRGB(96, 74, 74),
            Material = Enum.Material.WoodPlanks,
        })
        seat.Parent = world
    end

    signpost(world, Pit.CENTRE + Vector3.new(0, -4, Pit.START_RADIUS + 60), "🥊", "SUMO PIT",
        "stake 💧 · last one in wins", Color3.fromRGB(184, 128, 122))

    -- The join pad. Rolling onto it enters the queue; nothing drags you here.
    local joinPad = part({
        Name = "PitJoinPad",
        Shape = Enum.PartType.Cylinder,
        Size = Vector3.new(2, 34, 34),
        CFrame = CFrame.new(Pit.CENTRE + Vector3.new(0, -3, Pit.START_RADIUS + 40))
            * CFrame.Angles(0, 0, math.rad(90)),
        Color = Color3.fromRGB(146, 178, 140),
        Material = Enum.Material.SmoothPlastic,
        Transparency = 0.5,
        CanCollide = false,
    })
    joinPad.Parent = world

    road(hub.centre + Vector3.new(0, -1, 150), Pit.CENTRE + Vector3.new(0, -4, -Pit.START_RADIUS - 50), 60)

    local spawn = Instance.new("SpawnLocation")
    spawn.Name = "HubSpawn"
    spawn.Size = Vector3.new(20, 1, 20)
    spawn.Position = hub.centre + Vector3.new(0, 4, 40)
    spawn.Anchored = true
    spawn.CanCollide = false
    spawn.Color = Color3.fromRGB(255, 255, 255)
    spawn.Material = Enum.Material.SmoothPlastic
    spawn.Transparency = 0.7
    spawn.Neutral = true
    spawn.Parent = world

    return world
end

function WorldBuilder.claimPlot(player: Player)
    for _, plot in ipairs(WorldBuilder.plots) do
        if plot.owner == nil then
            plot.owner = player
            local pad = Workspace.GoobWorld:FindFirstChild("Plot" .. plot.index)
            local sign = pad and pad:FindFirstChild("Sign")
            local gui = sign and sign:FindFirstChild("PlotLabel")
            if gui then (gui :: any).TextLabel.Text = player.DisplayName .. "'s PAD" end
            return plot
        end
    end
    return nil
end

function WorldBuilder.releasePlot(player: Player)
    for _, plot in ipairs(WorldBuilder.plots) do
        if plot.owner == player then
            plot.owner = nil
            local pad = Workspace.GoobWorld:FindFirstChild("Plot" .. plot.index)
            local sign = pad and pad:FindFirstChild("Sign")
            local gui = sign and sign:FindFirstChild("PlotLabel")
            if gui then (gui :: any).TextLabel.Text = "OPEN PAD" end
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

-- Where the ascension altar is, for the proximity check.
function WorldBuilder.altarPosition(): Vector3
    return WorldBuilder.ZONES.HUB.centre + Vector3.new(0, 3, 96)
end

return WorldBuilder
