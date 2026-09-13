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

-- ── OBSTACLES, AND WHY BOTS WALKED THROUGH THEM ───────────────────────────
--
-- Bot movement is kinematic: a position integrated by hand, not a physics
-- body. That is the right call — twelve unanchored balls network-owned by the
-- server is a real cost, and a bot does not need momentum to be convincing —
-- but it has one consequence nobody accounted for. A kinematic body is not in
-- the physics world, so `CanCollide` on a rock means nothing to it. Bots
-- walked through every boulder, ramp and signpost on the island, which is the
-- single most obvious way a thing announces that it is not a player.
--
-- The fix is a list. Every solid, standing prop registers its footprint here
-- as a circle, and BotService resolves against it. A circle rather than the
-- real shape because it is one distance test, the props are all roughly round
-- in plan, and being twenty percent too generous costs a bot a slightly wider
-- berth — where being wrong the other way costs the illusion.
WorldBuilder.OBSTACLES = {} :: { { pos: Vector3, radius: number } }

-- A PROP IS SMALL. Anything huge is ground.
--
-- The first version filtered only on height — "flat things are floors" — and
-- the island disc is SIX studs thick, which is not flat. So the island itself
-- registered as a 480-stud obstacle centred on the origin, and every bot was
-- shoved to the shoreline on the first tick of every round. Nothing errored;
-- the bots simply stopped being anywhere near the game, and four separate
-- assertions failed with symptoms that pointed at eating, at SLAM and at
-- tethers rather than at this.
--
-- Two gates now, and the upper one is the load-bearing one: a thing you walk
-- around is a rock or a ramp or a signpost, and none of those are sixty studs
-- wide. Anything bigger is terrain the bot is meant to be standing on.
local OBSTACLE_MIN_RADIUS = 2
local OBSTACLE_MAX_RADIUS = 60
local OBSTACLE_MIN_HEIGHT = 6

local function noteObstacle(p: BasePart)
    -- Flat things are floors, not walls. A bot standing ON something is fine;
    -- it is standing IN something that looks wrong.
    if p.Size.Y < OBSTACLE_MIN_HEIGHT then
        return
    end
    -- Radius from the wider footprint axis, so a long ramp is covered along
    -- its length rather than only at its centre.
    local r = math.max(p.Size.X, p.Size.Z) * 0.5
    if r < OBSTACLE_MIN_RADIUS or r > OBSTACLE_MAX_RADIUS then
        return
    end
    table.insert(WorldBuilder.OBSTACLES, { pos = p.Position, radius = r })
end

local function part(props: { [string]: any }): BasePart
    local p = Instance.new("Part")
    p.Anchored = true
    p.CanCollide = true
    p.Material = Enum.Material.SmoothPlastic
    p.TopSurface = Enum.SurfaceType.Smooth
    p.BottomSurface = Enum.SurfaceType.Smooth
    for k, v in pairs(props) do (p :: any)[k] = v end
    -- Registered from the ONE constructor every prop goes through, rather than
    -- from a list maintained by hand. A hand-maintained list is a list that is
    -- missing whatever was added last.
    if p.CanCollide then
        noteObstacle(p)
    end
    return p
end

local function wedge(props: { [string]: any }): BasePart
    local p = Instance.new("WedgePart")
    p.Anchored = true
    p.CanCollide = true
    p.Material = Enum.Material.SmoothPlastic
    for k, v in pairs(props) do (p :: any)[k] = v end
    if p.CanCollide then
        noteObstacle(p)
    end
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
    Lighting.OutdoorAmbient = Color3.fromRGB(138, 142, 150)
    Lighting.Brightness = 2.0
    Lighting.ClockTime = 16.4
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

-- Scatter props in a ring, skipping anything too near a landmark. Used for
-- every piece of set dressing, because "a bit of variety, but never in the
-- way" is the same problem every time.
local function scatter(world: Instance, count: number, inner: number, outer: number,
                       rng: Random, make: (Vector3, number) -> ())
    for i = 1, count do
        local a = rng:NextNumber(0, math.pi * 2)
        local r = math.sqrt(rng:NextNumber(inner * inner, outer * outer))
        local pos = Vector3.new(math.cos(a) * r, 0, math.sin(a) * r)
        -- Never inside the Vault approach, and NEVER within reach of a spawn
        -- point. A rock placed on a spawn is a player who materialises inside
        -- it and cannot move, which is exactly what happened in the first
        -- play-test: the scatter band ran 407-466 and the spawns sat at 438.
        local clear = pos.Magnitude > Config.VAULT_RADIUS + 60
        if clear then
            for k = 1, Config.SPAWN_POINTS do
                local a = math.rad(k * (360 / Config.SPAWN_POINTS))
                local spawnAt = Vector3.new(
                    math.cos(a) * Config.SPAWN_RING, 0, math.sin(a) * Config.SPAWN_RING)
                if (pos - spawnAt).Magnitude < Config.SPAWN_CLEARANCE then
                    clear = false
                    break
                end
            end
        end
        if clear then
            make(pos, i)
        end
    end
end


-- The lobby platform. Between rounds everyone stands here: nothing can eat
-- anybody, the shops are open, and the boards are somewhere people are
-- actually still enough to read them.
-- A readable standing board: a slab with a big text panel on the front. Every
-- board in the world is one of these, so "where does information live" has a
-- single answer instead of several bespoke props.
--
-- DECLARED ABOVE buildLobby, which uses it. This helper was accidentally
-- deleted along with the Shack when that block was cut out, and the result was
-- not a compile error — `board(...)` simply became a call to a nil GLOBAL and
-- the server died on boot. Same trap, fourth time.
-- IT TAKES A POINT TO LOOK AT, NOT AN ANGLE.
--
-- It used to take a yaw in degrees, and both boards in the waiting room were
-- given one that pointed their text AWAY from the floor players stand on — you
-- walked up to two blank slate slabs and read the leaderboard by walking off
-- the edge behind them. That is the bug reported as "the leaderboards are on
-- the wrong way", and it was not a typo so much as an interface that made the
-- mistake easy: nothing about the number 24 says which way a face ends up
-- pointing, so the only way to get it right was to build it and look.
--
-- `lookAt` makes it impossible to state wrongly. CFrame.lookAt aims a part's
-- -Z at the target, and SurfaceGui's Front face IS -Z, so a board built to
-- look at the middle of the room has its text facing the middle of the room,
-- by construction rather than by arithmetic.
local function board(parent: Instance, name: string, position: Vector3, lookAt: Vector3,
                    size: Vector2, tint: Color3)
    -- Levelled: lookAt with a target at a different height would tip the slab
    -- back, and a leaderboard leaning over the room reads as damaged.
    local target = Vector3.new(lookAt.X, position.Y, lookAt.Z)
    local slab = part({
        Name = name,
        Size = Vector3.new(size.X, size.Y, 3),
        CFrame = CFrame.lookAt(position, target),
        Color = Color3.fromRGB(24, 24, 27),
        Material = Enum.Material.Slate,
    })
    slab.Parent = parent

    local surface = Instance.new("SurfaceGui")
    surface.Name = "Board"
    surface.Face = Enum.NormalId.Front
    surface.CanvasSize = Vector2.new(size.X * 26, size.Y * 26)
    surface.LightInfluence = 0
    surface.Parent = slab

    local pad = Instance.new("Frame")
    pad.Size = UDim2.fromScale(1, 1)
    pad.BackgroundColor3 = Color3.fromRGB(14, 14, 16)
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
    entries.TextSize = 34
    entries.TextWrapped = true
    entries.TextXAlignment = Enum.TextXAlignment.Left
    entries.TextYAlignment = Enum.TextYAlignment.Top
    entries.TextColor3 = Color3.fromRGB(242, 242, 244)
    -- Set here, not at first refresh: a TextLabel's default Text is the
    -- literal string "Label", and an empty board reading "Label" in half-metre
    -- letters is how that bug shipped once already.
    entries.Text = name .. "\nloading…"
    -- Parented to the SurfaceGui, NOT the backing frame: every consumer looks
    -- it up as Board -> Entries, and burying it deeper is a WaitForChild that
    -- never returns.
    entries.ZIndex = 2
    entries.Parent = surface

    return slab
end

-- ── THE WAITING ROOM ──────────────────────────────────────────────────────
--
-- Thirty-five seconds between rounds, spent somewhere nothing can eat you.
-- It used to be a grey disc, a rail, and two boards facing the wrong way, and
-- it read as a holding pen — which is a waste of the one moment in the loop
-- where the player is standing still and willing to look at something.
--
-- MONOCHROME, BY RULE. Black, grey and white, the same palette as the
-- interface, and for the same reason: the blobs are the only saturated things
-- in this game, and everything else being greyscale is what makes a neon skin
-- land. A player walking in wearing Ultraviolet should be the brightest thing
-- in the room by a mile.
--
-- Built out of a few shapes repeated with rhythm rather than a lot of
-- different props: concentric rings, a ribbed colonnade, a stepped dais, and
-- floor bands that point at the middle. Repetition with variation is what
-- reads as designed; a scatter of unrelated objects reads as clutter, and I
-- am not going to out-detail a real artist so the answer is to out-order one.
local function buildLobby(world: Instance)
    local c = Config.LOBBY_CENTRE
    local R = Config.LOBBY_RADIUS

    local floor = disc(world, c, R, 6,
        Color3.fromRGB(26, 26, 29), Enum.Material.Concrete, "LobbyFloor")
    floor.Name = "LobbyFloor"

    -- Two inlaid rings, lighter toward the middle, so the eye is walked
    -- inward to the dais instead of out to the rail.
    local ring1 = disc(world, c + Vector3.new(0, 3.2, 0), R - 16, 1,
        Color3.fromRGB(38, 38, 42), Enum.Material.Marble, "LobbyRingOuter")
    ring1.CanCollide = false
    local ring2 = disc(world, c + Vector3.new(0, 3.4, 0), R - 52, 1,
        Color3.fromRGB(52, 52, 57), Enum.Material.Marble, "LobbyRingInner")
    ring2.CanCollide = false

    -- Floor bands radiating from the centre. Thin, white, and flush — the
    -- cheapest possible thing that makes a flat disc look composed.
    for i = 0, 23 do
        local a = math.rad(i * 15)
        local bandLen = R - 20
        local band = part({
            Name = "LobbyBand",
            Size = Vector3.new(1.6, 0.4, bandLen),
            CFrame = CFrame.new(c + Vector3.new(
                math.cos(a) * (bandLen / 2 + 14), 3.6, math.sin(a) * (bandLen / 2 + 14)))
                * CFrame.Angles(0, -a + math.pi / 2, 0),
            Color = Color3.fromRGB(86, 86, 92),
            Material = Enum.Material.Neon,
        })
        band.CanCollide = false
        band.Parent = world
    end

    -- A stepped dais in the middle. Somewhere to stand, something to orbit,
    -- and the thing the floor bands point at.
    for step = 1, 3 do
        local d = disc(world, c + Vector3.new(0, 3.6 + (step - 1) * 2.4, 0),
            34 - (step - 1) * 9, 2.4,
            Color3.fromRGB(30 + step * 10, 30 + step * 10, 34 + step * 10),
            Enum.Material.Concrete, "Dais" .. step)
        d.CanCollide = false
    end

    -- A colonnade: tall ribs around the inner ring, alternating heights so the
    -- silhouette has a rhythm instead of a fence's flat line.
    for i = 0, 17 do
        local a = math.rad(i * 20)
        local tall = (i % 2 == 0)
        local h = tall and 46 or 30
        local rib = part({
            Name = "LobbyRib",
            Size = Vector3.new(5, h, 5),
            CFrame = CFrame.new(c + Vector3.new(
                math.cos(a) * (R - 34), 4 + h / 2, math.sin(a) * (R - 34)))
                * CFrame.Angles(0, -a, 0),
            Color = tall and Color3.fromRGB(18, 18, 21) or Color3.fromRGB(46, 46, 51),
            Material = Enum.Material.Slate,
        })
        rib.CanCollide = false
        rib.Parent = world

        -- A white cap on the tall ones. One bright accent per rib, at the same
        -- height all the way round, is what turns a ring of posts into a room.
        if tall then
            local cap = part({
                Name = "LobbyRibCap",
                Size = Vector3.new(6.5, 1.2, 6.5),
                CFrame = CFrame.new(c + Vector3.new(
                    math.cos(a) * (R - 34), 4 + h + 0.6, math.sin(a) * (R - 34))),
                Color = Color3.fromRGB(236, 236, 240),
                Material = Enum.Material.Neon,
            })
            cap.CanCollide = false
            cap.Parent = world
        end
    end

    -- The rail. Falling off a lobby while waiting for a round is pure
    -- frustration: nothing is gained by making this floor dangerous.
    for i = 0, 47 do
        local a = math.rad(i * 7.5)
        local post = part({
            Name = "LobbyRail",
            Size = Vector3.new(7, 11, 4),
            CFrame = CFrame.new(c + Vector3.new(
                math.cos(a) * (R + 2), 6, math.sin(a) * (R + 2)))
                * CFrame.Angles(0, -a, 0),
            Color = Color3.fromRGB(16, 16, 19),
            Material = Enum.Material.Metal,
        })
        post.Parent = world
    end

    -- ── The boards ────────────────────────────────────────────────────────
    --
    -- Flanking the dais and FACING IT — which is to say, facing the middle of
    -- the floor, where players actually stand. They are given a point to look
    -- at rather than an angle, because the previous pair were given angles and
    -- both ended up pointing their text off the edge of the world.
    local eye = c + Vector3.new(0, 22, 0)
    board(world, "Leaderboard", c + Vector3.new(-64, 22, -46), eye,
        Vector2.new(52, 30), Color3.fromRGB(236, 236, 240))
    board(world, "Archive", c + Vector3.new(64, 22, -46), eye,
        Vector2.new(52, 30), Color3.fromRGB(236, 236, 240))

    signpost(world, c + Vector3.new(0, 12, 26), "\u{1F6CB}\u{FE0F}", "THE WAITING ROOM",
        "trade, dress up, pick your third power", Color3.fromRGB(236, 236, 240))
end

function WorldBuilder.build()
    -- Rebuilt from scratch, not appended to. The harness boots the world more
    -- than once in a single process and a growing obstacle list would make
    -- bots progressively more claustrophobic across a test run.
    table.clear(WorldBuilder.OBSTACLES)
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
    -- CONCRETE, NOT GRASS. A field reads as somewhere nothing happens; a poured
    -- floor reads as somewhere built for the thing you are about to do. It
    -- also gives the painted markings below something to sit on, which is what
    -- actually makes a flat plane look designed rather than empty.
    local island = disc(world, Vector3.new(0, -3, 0), Config.ISLAND_RADIUS, 10,
        Color3.fromRGB(118, 120, 126), Enum.Material.Concrete, "Island")
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
        Color3.fromRGB(168, 166, 158), Enum.Material.Pavement, "Shallows")
    shallows.CanCollide = false

    -- A wet band where the sand meets the water. One extra disc, and it is the
    -- difference between an island and a cylinder.
    local surf = disc(world, Vector3.new(0, -2.0, 0), Config.ISLAND_RADIUS + 16, 1.0,
        Color3.fromRGB(126, 146, 150), Enum.Material.Slate, "Surf")
    surf.CanCollide = false
    surf.Transparency = 0.25

    -- The contested ground is a shade darker than the safe rim, so "am I in the
    -- danger zone" is answerable from the floor colour alone at any speed.
    local flats = disc(world, Vector3.new(0, -1.6, 0), Config.SHALLOWS_INNER, 1.4,
        Color3.fromRGB(96, 100, 108), Enum.Material.Asphalt, "Flats")
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

    -- ── MARKINGS ───────────────────────────────────────────────────────────
    -- Painted rings on the floor. They cost nothing, they collide with nothing,
    -- and they are most of the difference between "a flat plane" and "a place":
    -- they give the eye something to measure distance and speed against, which
    -- a featureless floor cannot do at any resolution.
    for _, ring in ipairs({
        { r = 120, w = 2.5, c = Color3.fromRGB(176, 168, 132) },
        { r = 200, w = 2.0, c = Color3.fromRGB(150, 154, 160) },
        { r = 290, w = 2.0, c = Color3.fromRGB(150, 154, 160) },
    }) do
        local outer = disc(world, Vector3.new(0, -1.0, 0), ring.r, 0.6,
            ring.c, Enum.Material.SmoothPlastic, "Marking")
        outer.CanCollide = false
        outer.Transparency = 0.25
        local inner = disc(world, Vector3.new(0, -0.9, 0), ring.r - ring.w, 0.7,
            Color3.fromRGB(96, 100, 108), Enum.Material.Asphalt, "MarkingCut")
        inner.CanCollide = false
    end

    -- Spokes out from the middle, so the plaza reads as a hub.
    for i = 0, 7 do
        local a = math.rad(i * 45)
        local lane = part({
            Name = "Marking",
            Size = Vector3.new(5, 0.6, 220),
            CFrame = CFrame.new(Vector3.new(math.cos(a) * 180, -1.0, math.sin(a) * 180))
                * CFrame.Angles(0, -a + math.pi / 2, 0),
            Color = Color3.fromRGB(142, 146, 152),
            Material = Enum.Material.SmoothPlastic,
            Transparency = 0.35,
        })
        lane.CanCollide = false
        lane.Parent = world
    end

    -- ── STRUCTURES ─────────────────────────────────────────────────────────
    -- Places, not decoration. Every one of these is something a blob can use:
    -- climb it, hide behind it, drop off it, or lose a pursuer around it. An
    -- arena with nothing in it is a running track.
    local function plinth(at: Vector3, w: number, h: number, tint: Color3)
        local base = part({
            Name = "Plinth",
            Size = Vector3.new(w, h, w),
            Position = at + Vector3.new(0, h / 2 - 1, 0),
            Color = tint,
            Material = Enum.Material.Concrete,
        })
        base.Parent = world
        local cap = part({
            Name = "PlinthCap",
            Size = Vector3.new(w + 4, 1.2, w + 4),
            Position = at + Vector3.new(0, h - 1, 0),
            Color = Color3.fromRGB(154, 150, 140),
            Material = Enum.Material.Marble,
        })
        cap.Parent = world
        -- A ramp on one side, or it is a wall rather than a place.
        ramp(world, at + Vector3.new(0, h / 2 - 1, w / 2 + h * 0.9),
            Vector3.new(w * 0.8, h, h * 1.8), 0, tint)
    end

    -- Four raised platforms on the inner ring, and four taller ones further
    -- out, so there is always something to break line of sight.
    for i = 0, 3 do
        local a = math.rad(i * 90 + 45)
        plinth(Vector3.new(math.cos(a) * 150, 0, math.sin(a) * 150), 46, 16,
            Color3.fromRGB(112, 114, 120))
    end
    for i = 0, 3 do
        local a = math.rad(i * 90)
        plinth(Vector3.new(math.cos(a) * 268, 0, math.sin(a) * 268), 58, 26,
            Color3.fromRGB(104, 106, 112))
    end

    -- Pipe arches you can roll under. Cover that does not become a dead end.
    for i = 0, 5 do
        local a = math.rad(i * 60 + 30)
        local at = Vector3.new(math.cos(a) * 215, 0, math.sin(a) * 215)
        for side = -1, 1, 2 do
            local leg = part({
                Name = "ArchLeg",
                Size = Vector3.new(8, 34, 8),
                CFrame = CFrame.new(at + Vector3.new(math.cos(a + math.pi / 2) * 26 * side,
                    16, math.sin(a + math.pi / 2) * 26 * side)) * CFrame.Angles(0, -a, 0),
                Color = Color3.fromRGB(126, 122, 114),
                Material = Enum.Material.Metal,
            })
            leg.Parent = world
        end
        local span = part({
            Name = "ArchSpan",
            Size = Vector3.new(62, 7, 12),
            CFrame = CFrame.new(at + Vector3.new(0, 36, 0)) * CFrame.Angles(0, -a, 0),
            Color = Color3.fromRGB(134, 130, 120),
            Material = Enum.Material.Metal,
        })
        span.Parent = world
    end

    -- Low walls in broken arcs: something to corner around at speed, which is
    -- where the momentum in this game actually gets used.
    for i = 0, 11 do
        local a = math.rad(i * 30 + 15)
        if i % 3 ~= 0 then
            local wall = part({
                Name = "Baffle",
                Size = Vector3.new(46, 13, 6),
                CFrame = CFrame.new(Vector3.new(math.cos(a) * 330, 4, math.sin(a) * 330))
                    * CFrame.Angles(0, -a + math.pi / 2, 0),
                Color = Color3.fromRGB(110, 112, 118),
                Material = Enum.Material.Concrete,
            })
            wall.Parent = world
        end
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
                Color = Color3.fromRGB(122, 120, 116),
                Material = Enum.Material.Slate,
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
                Color = Color3.fromRGB(114, 114, 118),
                Material = Enum.Material.Concrete,
            })
            boulder.Parent = world
        end)

    -- No plot pads either. They were the last remnant of the display-your-Goob
    -- layer, and on a round-based island they are eight concrete discs nobody
    -- has a reason to stand on. The list stays, empty, because GoobService
    -- still asks for a plot and expects nil to mean "no pad".
    WorldBuilder.plots = {}

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

    -- ── THE LOBBY ──────────────────────────────────────────────────────────
    -- A floor, a rail and two boards. Not a building: there is no roof, no
    -- door and no interior, because "I want there to be no buildings" was the
    -- note and a lobby you walk INTO would be the same mistake in a new place.
    buildLobby(world)

    -- ── SPAWNS ─────────────────────────────────────────────────────────────
    -- PLACED LAST, AND CHECKED. Every previous attempt at this picked a radius
    -- by hand and hoped: the first put spawns at 438 with rocks scattered
    -- across 407-466, and a play-tester materialised inside a boulder before
    -- touching a control. Moving them inboard traded rocks for basin walls,
    -- ramps and signposts.
    --
    -- So they are not picked, they are SEARCHED. Each spawn starts at its even
    -- angle on the ring and steps outward until it finds a spot with nothing
    -- solid within SPAWN_CLEARANCE. Add scenery later and the spawns move out
    -- of its way on the next build instead of swallowing a player.
    local solid = {}
    for _, d in ipairs(world:GetChildren()) do
        if d:IsA("BasePart") and d.CanCollide
            and d.Name ~= "Island" and d.Name ~= "Sea" and d.Name ~= "Skirt"
            and d.Name ~= "Causeway" and d.Name ~= "PitFloor"
            and d.Name ~= "LobbyFloor" then
            table.insert(solid, d)
        end
    end

    local function clearAt(pos: Vector3): boolean
        for _, d in ipairs(solid) do
            local flat = Vector3.new(d.Position.X - pos.X, 0, d.Position.Z - pos.Z)
            if flat.Magnitude < Config.SPAWN_CLEARANCE + math.max(d.Size.X, d.Size.Z) / 2 then
                return false
            end
        end
        return true
    end

    WorldBuilder.spawns = {}
    for i = 1, Config.SPAWN_POINTS do
        local a = math.rad(i * (360 / Config.SPAWN_POINTS))
        local chosen
        -- Walk the radius out to the shoreline, then back in, before giving up.
        for _, r in ipairs({ Config.SPAWN_RING, Config.SPAWN_RING + 14,
                             Config.SPAWN_RING + 28, Config.SPAWN_RING - 14,
                             Config.SPAWN_RING - 28, Config.SPAWN_RING + 40 }) do
            local candidate = Vector3.new(math.cos(a) * r, 8, math.sin(a) * r)
            if clearAt(candidate) then
                chosen = candidate
                break
            end
        end
        -- If every radius on this spoke is blocked, rotate off the spoke
        -- rather than dropping the spawn: fewer spawns means a full server
        -- stacks up on the ones that are left.
        if not chosen then
            for step = 1, 24 do
                local a2 = a + math.rad(step * 3)
                local candidate = Vector3.new(
                    math.cos(a2) * Config.SPAWN_RING, 8, math.sin(a2) * Config.SPAWN_RING)
                if clearAt(candidate) then
                    chosen = candidate
                    break
                end
            end
        end
        chosen = chosen or Vector3.new(math.cos(a) * Config.SPAWN_RING, 8, math.sin(a) * Config.SPAWN_RING)
        table.insert(WorldBuilder.spawns, chosen)

        local spawn = Instance.new("SpawnLocation")
        spawn.Name = "Spawn" .. i
        spawn.Anchored = true
        spawn.CanCollide = false
        spawn.Size = Vector3.new(16, 1, 16)
        spawn.Position = Vector3.new(chosen.X, 1.4, chosen.Z)
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

function WorldBuilder.lobbyPoint(index: number): Vector3
    -- Spread around the rail rather than stacked on the middle, so a full
    -- server in the lobby is a crowd and not a single pile of blobs.
    local a = math.rad((index % 24) * 15)
    local r = Config.LOBBY_RADIUS - 34
    return Config.LOBBY_CENTRE
        + Vector3.new(math.cos(a) * r, 8, math.sin(a) * r)
end

function WorldBuilder.isInLobby(position: Vector3): boolean
    local d = position - Config.LOBBY_CENTRE
    return math.abs(d.Y) < 60
        and Vector3.new(d.X, 0, d.Z).Magnitude < Config.LOBBY_RADIUS + 20
end

-- The searched positions, not the ideal ring. Teleporting a player to the
-- nominal angle would undo the whole clearance search and drop them back into
-- whatever the build step moved them away from.
WorldBuilder.spawns = {} :: { Vector3 }

function WorldBuilder.spawnPoint(index: number): Vector3
    local n = #WorldBuilder.spawns
    if n == 0 then
        return Vector3.new(0, 8, Config.SPAWN_RING)
    end
    return WorldBuilder.spawns[(index % n) + 1]
end

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
    -- OUT TO THE SHORELINE. This used to stop at SHALLOWS_INNER - 8 so that
    -- nothing grew in the no-PvP rim, which left a 93-stud bare band around the
    -- whole island — a third of its area with no reason to be there.
    --
    -- The rim no longer protects you indefinitely (Config.SHALLOWS_GRACE is a
    -- spendable meter, not a property of the ground), so there is nothing left
    -- to exploit by farming out here: you get about twelve seconds before the
    -- edge is the most dangerous place on the map. Food therefore goes all the
    -- way out, and the sampling stays uniform BY AREA — sqrt of a uniform draw
    -- between the squared radii — so the outer ring is not thinner per square
    -- stud than the middle. A naive uniform draw on r would have piled food in
    -- the centre and looked exactly like the bug this replaces.
    local hi = outerR or Config.PELLET_OUTER
    local r = math.sqrt(rng:NextNumber(lo * lo, hi * hi))
    local a = rng:NextNumber(0, math.pi * 2)
    local pos = Vector3.new(math.cos(a) * r, 2, math.sin(a) * r)
    local b = WorldBuilder.biomeAt(pos)
    if b then
        pos = Vector3.new(pos.X, b.centre.Y + 2, pos.Z)
    end
    return pos
end

--- Push a point out of any obstacle it is standing inside. Returns the
--- corrected point and whether anything moved.
---
--- Used by the kinematic movers — bots — which are not in the physics world
--- and so get nothing from CanCollide. Only props ON THE ISLAND count: the
--- lobby is 420 studs up with its own floor and rail, and nothing kinematic
--- moves around up there.
function WorldBuilder.pushOut(at: Vector3, bodyRadius: number): (Vector3, boolean)
    local moved = false
    local x, z = at.X, at.Z
    for _, o in ipairs(WorldBuilder.OBSTACLES) do
        if math.abs(o.pos.Y - Config.LOBBY_CENTRE.Y) > 120 then
            local dx, dz = x - o.pos.X, z - o.pos.Z
            local d = math.sqrt(dx * dx + dz * dz)
            local need = o.radius + bodyRadius
            if d < need then
                if d < 0.01 then
                    -- Dead centre. Any direction will do; a fixed one would
                    -- make every bot that clipped this prop leave it the same
                    -- way, which looks like a conveyor belt.
                    dx, dz, d = 1, 0, 1
                end
                x = o.pos.X + (dx / d) * need
                z = o.pos.Z + (dz / d) * need
                moved = true
            end
        end
    end
    return Vector3.new(x, at.Y, z), moved
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
