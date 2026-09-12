--!strict
-- GoobService.luau — spawns, renders and simulates the Goobs sitting on plots.
--
-- The visual gimmick of the whole game lives here: a Goob is a translucent
-- blob, and the things it has eaten are REAL PARTS suspended inside it. That
-- means two players with identical mass can look completely different, and you
-- can read someone's entire play history by walking up and looking at them.

local Workspace = game:GetService("Workspace")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Players = game:GetService("Players")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local GoobMath = require(Shared.GoobMath)
local Feedstock = require(Shared.Feedstock)
local Format = require(Shared.Format)

local Data = require(script.Parent.Data)
local WorldBuilder = require(script.Parent.WorldBuilder)

local GoobService = {}

local models: { [number]: Model } = {}      -- userId -> rendered Goob model
local INTERIOR_MAX = 45                      -- cap on visible interior parts

-- ── Rendering ──────────────────────────────────────────────────────────────

local function shapeFor(name: string): (Enum.PartType?, string)
    if name == "Ball" then return Enum.PartType.Ball, "Part" end
    if name == "Cylinder" then return Enum.PartType.Cylinder, "Part" end
    if name == "Wedge" then return nil, "WedgePart" end
    return Enum.PartType.Block, "Part"
end

-- Build the parts visible inside the blob. We sample the contents table so a
-- Goob with 50,000 socks shows a representative handful, not 50,000 parts.
local function buildInterior(goob, model: Model, radius: number)
    local existing = model:FindFirstChild("Interior")
    if existing then existing:Destroy() end

    local interior = Instance.new("Folder")
    interior.Name = "Interior"

    -- Flatten contents into a weighted pick list, biased toward rarer items so
    -- your one Pocket Singularity is always visible among the socks.
    local picks = {}
    local totalCount = 0
    for id, count in pairs(goob.contents) do totalCount += count end
    if totalCount == 0 then
        interior.Parent = model
        return
    end

    for id, count in pairs(goob.contents) do
        local item = Feedstock.get(id)
        if item then
            local share = count / totalCount
            local rarityBoost = (item.mass >= 600) and 6 or 1
            local slots = math.max(1, math.round(share * INTERIOR_MAX * rarityBoost))
            for _ = 1, math.min(slots, INTERIOR_MAX) do
                table.insert(picks, item)
                if #picks >= INTERIOR_MAX then break end
            end
        end
        if #picks >= INTERIOR_MAX then break end
    end

    local rng = Random.new(#goob.id + math.floor(goob.bornAt))
    local root = model.PrimaryPart
    if not root then interior.Parent = model return end

    for i, item in ipairs(picks) do
        local partType, className = shapeFor(item.shape)
        local p = Instance.new(className) :: BasePart
        p.Name = item.id
        p.Anchored = false
        p.CanCollide = false
        p.CanQuery = false
        p.CanTouch = false
        p.Massless = true
        p.Material = Enum.Material.SmoothPlastic
        p.Color = item.color
        p.Size = item.scale * math.max(1, radius * 0.13)
        if partType and p:IsA("Part") then p.Shape = partType end

        -- Distribute inside the sphere using a cube-root radial so items fill
        -- the volume evenly instead of clumping at the centre.
        local dir = Vector3.new(rng:NextNumber(-1, 1), rng:NextNumber(-1, 1), rng:NextNumber(-1, 1))
        if dir.Magnitude < 0.001 then dir = Vector3.new(0, 1, 0) end
        dir = dir.Unit
        local dist = radius * 0.72 * (rng:NextNumber() ^ (1 / 3))
        p.CFrame = root.CFrame * CFrame.new(dir * dist) * CFrame.Angles(
            rng:NextNumber() * 6.28, rng:NextNumber() * 6.28, rng:NextNumber() * 6.28
        )

        -- Weld each item to the blob so it drifts with it as one body.
        local weld = Instance.new("WeldConstraint")
        weld.Part0 = root
        weld.Part1 = p
        weld.Parent = p

        p.Parent = interior
    end

    interior.Parent = model
end

local function buildModel(player: Player, goob): Model
    local plot = WorldBuilder.plotFor(player)
    local center = plot and plot.center or Vector3.new(0, 0, 0)
    local radius = GoobMath.size(goob)

    local model = Instance.new("Model")
    model.Name = "Goob_" .. player.UserId

    local body = Instance.new("Part")
    body.Name = "Body"
    body.Shape = Enum.PartType.Ball
    body.Size = Vector3.new(radius, radius, radius) * 2
    body.Position = center + Vector3.new(0, radius + 2, 0)
    body.Anchored = true
    body.CanCollide = false
    body.Material = Enum.Material.Glass
    body.Transparency = 0.55
    body.Color = Color3.fromHSV(goob.hue, 0.55, 1)
    body.Reflectance = 0.08
    body.Parent = model
    model.PrimaryPart = body

    -- Eyes. Two spheres and a smile — this is 90% of why it reads as a
    -- character instead of a ball, and it costs almost nothing.
    for _, sx in ipairs({ -0.34, 0.34 }) do
        local eye = Instance.new("Part")
        eye.Name = "Eye"
        eye.Shape = Enum.PartType.Ball
        eye.Size = Vector3.new(radius * 0.34, radius * 0.34, radius * 0.34)
        eye.Anchored = true
        eye.CanCollide = false
        eye.Material = Enum.Material.SmoothPlastic
        eye.Color = Color3.new(1, 1, 1)
        eye.CFrame = body.CFrame * CFrame.new(sx * radius, radius * 0.28, -radius * 0.92)
        eye.Parent = model

        local pupil = Instance.new("Part")
        pupil.Name = "Pupil"
        pupil.Shape = Enum.PartType.Ball
        pupil.Size = eye.Size * 0.55
        pupil.Anchored = true
        pupil.CanCollide = false
        pupil.Material = Enum.Material.SmoothPlastic
        pupil.Color = Color3.fromRGB(25, 25, 35)
        pupil.CFrame = eye.CFrame * CFrame.new(0, 0, -eye.Size.X * 0.34)
        pupil.Parent = model
    end

    -- Nameplate: name, age tier, power. Everything a trader needs at a glance.
    local plate = Instance.new("BillboardGui")
    plate.Name = "Plate"
    plate.Size = UDim2.fromScale(16, 5)
    plate.StudsOffsetWorldSpace = Vector3.new(0, radius + 6, 0)
    plate.AlwaysOnTop = false
    plate.MaxDistance = 400
    plate.Parent = body

    local text = Instance.new("TextLabel")
    text.Name = "Info"
    text.Size = UDim2.fromScale(1, 1)
    text.BackgroundTransparency = 1
    text.Font = Enum.Font.FredokaOne
    text.TextScaled = true
    text.TextColor3 = Color3.new(1, 1, 1)
    text.TextStrokeTransparency = 0.25
    text.Parent = plate

    buildInterior(goob, model, radius)
    model.Parent = Workspace.GoobWorld
    return model
end

-- Update an existing model in place rather than rebuilding it. Rebuilding
-- every frame would destroy performance and make the Goob visibly flicker.
local function refreshModel(player: Player, goob)
    local model = models[player.UserId]
    if not model or not model.PrimaryPart then return end
    local body = model.PrimaryPart
    local radius = GoobMath.size(goob)
    local targetSize = Vector3.new(radius, radius, radius) * 2

    if (body.Size - targetSize).Magnitude > 0.05 then
        local plot = WorldBuilder.plotFor(player)
        local center = plot and plot.center or Vector3.new(0, 0, 0)
        TweenService:Create(body, TweenInfo.new(0.6, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
            Size = targetSize,
            Position = center + Vector3.new(0, radius + 2, 0),
        }):Play()

        local plate = body:FindFirstChild("Plate") :: BillboardGui?
        if plate then plate.StudsOffsetWorldSpace = Vector3.new(0, radius + 6, 0) end
    end

    local tier = GoobMath.ageTier(goob)
    local plate = body:FindFirstChild("Plate")
    local info = plate and plate:FindFirstChild("Info") :: TextLabel?
    if info then
        info.Text = string.format(
            "%s\n%s %s · Gen %d\n⚡ %s",
            goob.nickname,
            tier.emoji, tier.name,
            GoobMath.generation(goob),
            Format.short(GoobMath.power(goob))
        )
        info.TextColor3 = tier.color
    end

    -- Colossal Goobs get a glow so you can spot one from across the map.
    if GoobMath.isColossal(goob) and not body:FindFirstChild("Colossal") then
        local light = Instance.new("PointLight")
        light.Name = "Colossal"
        light.Brightness = 4
        light.Range = 80
        light.Color = Color3.fromRGB(255, 220, 120)
        light.Parent = body
    end
end

GoobService.refreshModel = refreshModel

function GoobService.activeGoob(profile)
    if not profile then return nil end
    for _, g in ipairs(profile.goobs) do
        if g.id == profile.activeGoobId then return g end
    end
    return profile.goobs[1]
end

function GoobService.spawnFor(player: Player)
    local profile = Data.get(player)
    if not profile then return end
    local goob = GoobService.activeGoob(profile)
    if not goob then return end
    if models[player.UserId] then models[player.UserId]:Destroy() end
    models[player.UserId] = buildModel(player, goob)
    refreshModel(player, goob)
end

function GoobService.despawnFor(player: Player)
    local m = models[player.UserId]
    if m then m:Destroy() end
    models[player.UserId] = nil
end

-- Add an item to the active Goob's stomach. Returns false if something's wrong
-- so the caller can stay silent rather than desyncing the client.
function GoobService.feed(player: Player, itemId: string): boolean
    local profile = Data.get(player)
    if not profile then return false end
    local goob = GoobService.activeGoob(profile)
    if not goob then return false end
    local item = Feedstock.get(itemId)
    if not item then return false end

    table.insert(goob.stomach, { id = itemId, mass = item.mass })
    goob.contents[itemId] = (goob.contents[itemId] or 0) + 1
    profile.discovered[itemId] = true
    profile.stats.caught += 1
    return true
end

-- Feed one of the player's own Goobs to another. This is THE sink: the eaten
-- Goob is gone from the world permanently, and only 75% of its mass survives.
function GoobService.gulp(player: Player, eaterId: string, eatenId: string): (boolean, string?)
    local profile = Data.get(player)
    if not profile then return false, "No profile." end

    local eater, eaten, eatenIndex
    for i, g in ipairs(profile.goobs) do
        if g.id == eaterId then eater = g end
        if g.id == eatenId then eaten = g; eatenIndex = i end
    end
    if not eater or not eaten then return false, "Goob not found." end
    if #profile.goobs <= 1 then return false, "You need to keep at least one Goob." end

    local ok, reason = GoobMath.canGulp(eater, eaten)
    if not ok then return false, reason end

    GoobMath.applyGulp(eater, eaten)
    table.remove(profile.goobs, eatenIndex)
    profile.stats.gulps += 1
    profile.stats.bestMass = math.max(profile.stats.bestMass, eater.mass)

    if profile.activeGoobId == eatenId then profile.activeGoobId = eater.id end
    if profile.activeGoobId == eater.id then
        GoobService.spawnFor(player) -- full rebuild: the interior changed a lot
    end
    return true
end

-- ── Simulation ─────────────────────────────────────────────────────────────
-- One heartbeat loop for every player. Digestion converts stomach -> mass,
-- and mass -> glob. Runs at 4Hz, not 60Hz: nothing here needs frame precision
-- and 4Hz keeps the server cheap with 30 players on it.

local accumulator = 0
local TICK = 0.25

function GoobService.start()
    RunService.Heartbeat:Connect(function(dt)
        accumulator += dt
        if accumulator < TICK then return end
        local step = accumulator
        accumulator = 0

        for _, player in ipairs(Players:GetPlayers()) do
            local profile = Data.get(player)
            if profile then
                local goob = GoobService.activeGoob(profile)
                if goob then
                    -- Digest
                    local converted = GoobMath.digestStep(goob, step)
                    if converted > 0 then
                        goob.mass += converted
                        local remaining = converted
                        while remaining > 0 and #goob.stomach > 0 do
                            local entry = goob.stomach[1]
                            if entry.mass <= remaining then
                                remaining -= entry.mass
                                table.remove(goob.stomach, 1)
                            else
                                entry.mass -= remaining
                                remaining = 0
                            end
                        end
                        profile.stats.bestMass = math.max(profile.stats.bestMass, goob.mass)
                        refreshModel(player, goob)
                    end

                    -- Earn
                    profile.glob += GoobMath.incomePerSecond(goob) * step
                end
            end
        end
    end)
end

-- Called once at login: pay out (capped, discounted) offline digestion.
function GoobService.applyOffline(player: Player)
    local profile = Data.get(player)
    if not profile then return 0 end
    local away = math.clamp(os.time() - (profile.lastSeen or os.time()), 0, Config.OFFLINE_CAP_SECONDS)
    if away < 30 then return 0 end

    local goob = GoobService.activeGoob(profile)
    if not goob then return 0 end

    -- Digest whatever was left in the stomach while away.
    local digested = 0
    local budget = away
    while budget > 0 and #goob.stomach > 0 do
        local converted = GoobMath.digestStep(goob, math.min(budget, 60))
        if converted <= 0 then break end
        goob.mass += converted
        digested += converted
        local remaining = converted
        while remaining > 0 and #goob.stomach > 0 do
            local entry = goob.stomach[1]
            if entry.mass <= remaining then
                remaining -= entry.mass
                table.remove(goob.stomach, 1)
            else
                entry.mass -= remaining
                remaining = 0
            end
        end
        budget -= 60
    end

    local earned = GoobMath.incomePerSecond(goob) * away * Config.OFFLINE_EFFICIENCY
    profile.glob += earned
    return earned
end

return GoobService
