--!strict
-- CritterService.luau — the ACTIVE half of the loop.
--
-- Grow a Garden's weakness is that there is almost nothing to do while you
-- wait. Here, junk physically wanders the map and you chase it down. Catching
-- is the only source of new mass in the world, and the spawn rate is a hard
-- server-wide constant — that is what makes the economy finite rather than
-- "everyone can farm infinite value".

local Workspace = game:GetService("Workspace")
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")
local Debris = game:GetService("Debris")
local TweenService = game:GetService("TweenService")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local Feedstock = require(Shared.Feedstock)

local CritterService = {}

local alive: { [BasePart]: { item: Feedstock.Item, born: number, vel: Vector3 } } = {}
local aliveCount = 0
local rng = Random.new(os.clock() * 1e6)
local folder: Folder

local ROAM_RADIUS = 520

local function spawnCritter()
    if aliveCount >= Config.CRITTER_MAX_ALIVE then return end

    local item = Feedstock.roll(rng, 1)

    local p = Instance.new("Part")
    p.Name = "Critter_" .. item.id
    p.Size = item.scale * 3.4
    p.Color = item.color
    p.Material = if item.rarity == "Secret" or item.rarity == "Mythic"
        then Enum.Material.Neon else Enum.Material.SmoothPlastic
    p.Anchored = true
    p.CanCollide = false
    p.CanQuery = false
    if item.shape == "Ball" then p.Shape = Enum.PartType.Ball
    elseif item.shape == "Cylinder" then p.Shape = Enum.PartType.Cylinder end

    local angle = rng:NextNumber() * math.pi * 2
    local dist = 120 + rng:NextNumber() * ROAM_RADIUS
    p.Position = Vector3.new(math.cos(angle) * dist, 4 + rng:NextNumber() * 3, math.sin(angle) * dist)

    -- Rarer things are visibly special from a distance: a coloured glow and a
    -- floating label. A kid should be able to see a Mythic across the map and
    -- sprint for it.
    if item.rarity ~= "Common" and item.rarity ~= "Uncommon" then
        local light = Instance.new("PointLight")
        light.Color = Feedstock.RARITY_COLOR[item.rarity]
        light.Brightness = 3
        light.Range = 26
        light.Parent = p

        local gui = Instance.new("BillboardGui")
        gui.Size = UDim2.fromScale(10, 2.4)
        gui.StudsOffset = Vector3.new(0, 3.4, 0)
        gui.AlwaysOnTop = true
        gui.MaxDistance = 500
        local tl = Instance.new("TextLabel")
        tl.Size = UDim2.fromScale(1, 1)
        tl.BackgroundTransparency = 1
        tl.Font = Enum.Font.FredokaOne
        tl.TextScaled = true
        tl.TextStrokeTransparency = 0.2
        tl.TextColor3 = Feedstock.RARITY_COLOR[item.rarity]
        tl.Text = string.upper(item.rarity) .. "\n" .. item.name
        tl.Parent = gui
        gui.Parent = p
    end

    p.Parent = folder

    alive[p] = {
        item = item,
        born = os.clock(),
        vel = Vector3.new(rng:NextNumber(-1, 1), 0, rng:NextNumber(-1, 1)).Unit * rng:NextNumber(6, 16),
    }
    aliveCount += 1

    -- A Secret spawning is a server-wide event. Announcing it turns a solo
    -- farm into a race, which is free multiplayer drama.
    if item.rarity == "Secret" then
        CritterService.onSecret:Fire(item)
    end
end

local function despawn(p: BasePart)
    if not alive[p] then return end
    alive[p] = nil
    aliveCount -= 1
    p:Destroy()
end

CritterService.onSecret = Instance.new("BindableEvent")
CritterService.onCatch = Instance.new("BindableEvent")

-- Server-authoritative catching. The client NEVER tells us what it caught —
-- it tells us which part it touched, and we verify distance ourselves. This is
-- the single most important anti-exploit line in the game.
function CritterService.tryCatch(player: Player, target: Instance): (boolean, any)
    local char = player.Character
    local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
    if not root then return false end
    if not target or not target:IsA("BasePart") then return false end

    local entry = alive[target]
    if not entry then return false end   -- already taken; first to touch wins

    if (root.Position - target.Position).Magnitude > Config.CRITTER_CATCH_RADIUS then
        return false
    end

    -- Claim it immediately so two players can't both bank the same critter.
    alive[target] = nil
    aliveCount -= 1

    -- Fly the critter into the player, then vanish. Feedback matters more than
    -- almost anything else in a game aimed at nine-year-olds.
    target.CanCollide = false
    target.Anchored = true
    local tween = TweenService:Create(target, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
        CFrame = root.CFrame,
        Size = Vector3.new(0.2, 0.2, 0.2),
        Transparency = 1,
    })
    tween:Play()
    Debris:AddItem(target, 0.45)

    CritterService.onCatch:Fire(player, entry.item)
    return true, entry.item
end

function CritterService.start()
    folder = Instance.new("Folder")
    folder.Name = "Critters"
    folder.Parent = Workspace

    task.spawn(function()
        while true do
            spawnCritter()
            task.wait(Config.CRITTER_SPAWN_INTERVAL)
        end
    end)

    -- Roaming. Critters bob and wander so the world feels alive; they bounce
    -- off an invisible boundary so nothing escapes to infinity.
    RunService.Heartbeat:Connect(function(dt)
        local now = os.clock()
        for p, entry in pairs(alive) do
            if now - entry.born > Config.CRITTER_LIFETIME then
                despawn(p)
            else
                local pos = p.Position + entry.vel * dt
                if math.sqrt(pos.X ^ 2 + pos.Z ^ 2) > ROAM_RADIUS + 140 then
                    entry.vel = -entry.vel
                    pos = p.Position + entry.vel * dt
                end
                local bob = math.sin(now * 2.2 + p.Position.X) * 0.6
                p.CFrame = CFrame.new(pos.X, 4 + bob, pos.Z)
                    * CFrame.Angles(0, now * 0.9, math.sin(now) * 0.25)
            end
        end
    end)
end

return CritterService
