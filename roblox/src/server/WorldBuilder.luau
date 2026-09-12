--!strict
-- WorldBuilder.luau — the entire map is generated at runtime from code.
--
-- WHY: a .rbxl place file is an opaque binary blob. If the map lives in the
-- place file, nothing about the world is reviewable in a diff, mergeable
-- between two people, or restorable after a bad save. Building it from code
-- means the whole game — world included — is plain text in git.

local Workspace = game:GetService("Workspace")
local Lighting = game:GetService("Lighting")

local Config = require(game.ReplicatedStorage.GoobShared.Config)

local WorldBuilder = {}

local function part(props: { [string]: any }): BasePart
    local p = Instance.new("Part")
    p.Anchored = true
    p.CanCollide = true
    p.Material = Enum.Material.SmoothPlastic
    p.TopSurface = Enum.SurfaceType.Smooth
    p.BottomSurface = Enum.SurfaceType.Smooth
    for k, v in pairs(props) do
        (p :: any)[k] = v
    end
    return p
end

local function label(text: string, size: number, parent: BasePart, offset: Vector3?)
    local gui = Instance.new("BillboardGui")
    gui.Size = UDim2.fromScale(14, 3)
    gui.StudsOffset = offset or Vector3.new(0, 5, 0)
    gui.AlwaysOnTop = true
    gui.MaxDistance = 260
    local tl = Instance.new("TextLabel")
    tl.Size = UDim2.fromScale(1, 1)
    tl.BackgroundTransparency = 1
    tl.Font = Enum.Font.FredokaOne
    tl.TextScaled = true
    tl.TextColor3 = Color3.new(1, 1, 1)
    tl.TextStrokeTransparency = 0.2
    tl.TextStrokeColor3 = Color3.new(0, 0, 0)
    tl.Text = text
    tl.Parent = gui
    gui.Parent = parent
    return gui
end

WorldBuilder.plots = {} :: { { index: number, center: Vector3, owner: Player? } }

function WorldBuilder.build()
    -- Sky & atmosphere: bright, saturated, high-contrast. Young players read
    -- shape and colour far faster than detail, so we lean cartoon.
    Lighting.Ambient = Color3.fromRGB(120, 120, 140)
    Lighting.OutdoorAmbient = Color3.fromRGB(140, 145, 170)
    Lighting.Brightness = 2.4
    Lighting.ClockTime = 14.5
    Lighting.GeographicLatitude = 12
    Lighting.FogEnd = 1400
    Lighting.FogColor = Color3.fromRGB(180, 215, 240)

    local atmo = Instance.new("Atmosphere")
    atmo.Density = 0.32
    atmo.Haze = 1.2
    atmo.Color = Color3.fromRGB(210, 230, 255)
    atmo.Decay = Color3.fromRGB(160, 190, 230)
    atmo.Parent = Lighting

    local bloom = Instance.new("BloomEffect")
    bloom.Intensity = 0.45
    bloom.Threshold = 0.9
    bloom.Size = 22
    bloom.Parent = Lighting

    local world = Instance.new("Folder")
    world.Name = "GoobWorld"
    world.Parent = Workspace

    -- Ground: a big soft-green field. Deliberately NOT a Roblox baseplate —
    -- the default grey grid instantly reads as "unfinished".
    local ground = part({
        Name = "Ground",
        Size = Vector3.new(1400, 8, 1400),
        Position = Vector3.new(0, -4, 0),
        Color = Color3.fromRGB(126, 196, 118),
        Material = Enum.Material.Grass,
    })
    ground.Parent = world

    -- Central hub disc where the shop / leaderboard / trade booth live.
    local hub = part({
        Name = "Hub",
        Shape = Enum.PartType.Cylinder,
        Size = Vector3.new(3, 130, 130),
        CFrame = CFrame.new(0, 0.5, 0) * CFrame.Angles(0, 0, math.rad(90)),
        Color = Color3.fromRGB(245, 238, 220),
        Material = Enum.Material.Sand,
    })
    hub.Parent = world

    -- Plots arranged in a ring around the hub. Each player claims one on join.
    local count = Config.PLOT_COUNT
    for i = 1, count do
        local angle = (i - 1) / count * math.pi * 2
        local radius = Config.PLOT_SPACING * 1.6
        local center = Vector3.new(math.cos(angle) * radius, 0, math.sin(angle) * radius)

        local pad = part({
            Name = "Plot" .. i,
            Size = Vector3.new(Config.PLOT_SIZE, 2, Config.PLOT_SIZE),
            Position = center + Vector3.new(0, 1, 0),
            Color = Color3.fromRGB(238, 224, 196),
            Material = Enum.Material.Sand,
        })
        pad.Parent = world

        -- A low rim so the plot reads as "yours" from the ground.
        for _, side in ipairs({ Vector3.new(1, 0, 0), Vector3.new(-1, 0, 0), Vector3.new(0, 0, 1), Vector3.new(0, 0, -1) }) do
            local rim = part({
                Name = "Rim",
                Size = if side.X ~= 0 then Vector3.new(2, 4, Config.PLOT_SIZE) else Vector3.new(Config.PLOT_SIZE, 4, 2),
                Position = center + side * (Config.PLOT_SIZE / 2) + Vector3.new(0, 2, 0),
                Color = Color3.fromRGB(120, 190, 235),
                Material = Enum.Material.Neon,
                Transparency = 0.45,
                CanCollide = false,
            })
            rim.Parent = pad
        end

        local sign = part({
            Name = "Sign",
            Size = Vector3.new(10, 1, 1),
            Position = center + Vector3.new(0, 8, -Config.PLOT_SIZE / 2),
            Transparency = 1,
            CanCollide = false,
        })
        sign.Parent = pad
        label("PLOT " .. i .. "\nOPEN", 3, sign).Name = "PlotLabel"

        table.insert(WorldBuilder.plots, { index = i, center = center, owner = nil })
    end

    -- Trade booth: a physical place you have to walk to. Making trading
    -- location-bound (rather than a menu you open anywhere) is what turns the
    -- hub into a crowded, noisy market — which is the social hook.
    local booth = part({
        Name = "TradeBooth",
        Size = Vector3.new(26, 2, 26),
        Position = Vector3.new(0, 2, 0),
        Color = Color3.fromRGB(255, 205, 90),
        Material = Enum.Material.Neon,
        Transparency = 0.25,
        CanCollide = false,
    })
    booth.Parent = world
    label("🤝 TRADE ZONE\nstand here with a friend", 4, booth, Vector3.new(0, 9, 0))

    -- Leaderboard pillar.
    local pillar = part({
        Name = "Leaderboard",
        Size = Vector3.new(14, 26, 3),
        Position = Vector3.new(0, 13, -52),
        Color = Color3.fromRGB(45, 50, 70),
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

    -- Spawn location on the hub.
    local spawn = Instance.new("SpawnLocation")
    spawn.Name = "HubSpawn"
    spawn.Size = Vector3.new(16, 1, 16)
    spawn.Position = Vector3.new(0, 2.5, 34)
    spawn.Anchored = true
    spawn.Color = Color3.fromRGB(255, 255, 255)
    spawn.Material = Enum.Material.Neon
    spawn.Transparency = 0.4
    spawn.Neutral = true
    spawn.Parent = world

    return world
end

function WorldBuilder.claimPlot(player: Player)
    for _, plot in ipairs(WorldBuilder.plots) do
        if plot.owner == nil then
            plot.owner = player
            local pad = Workspace.GoobWorld:FindFirstChild("Plot" .. plot.index)
            if pad then
                local sign = pad:FindFirstChild("Sign")
                local gui = sign and sign:FindFirstChild("PlotLabel")
                if gui then
                    (gui :: any).TextLabel.Text = player.DisplayName .. "'s\nGOOB"
                end
            end
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
            if pad then
                local sign = pad:FindFirstChild("Sign")
                local gui = sign and sign:FindFirstChild("PlotLabel")
                if gui then
                    (gui :: any).TextLabel.Text = "PLOT " .. plot.index .. "\nOPEN"
                end
            end
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

return WorldBuilder
