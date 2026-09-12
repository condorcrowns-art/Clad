--!strict
-- RollService.luau — you don't stand next to your Goob, you ARE your Goob.
--
-- This is the change the whole redesign hangs off. Previously the active Goob
-- sat on a plot like furniture while a default Roblox avatar ran around next to
-- it; the thing the game is named after was scenery. Now the active Goob is the
-- player's body, and mass becomes physics you feel rather than a number in a
-- corner.
--
-- OWNERSHIP AND CHEATING
-- The ball must be client-owned or it will feel like mud at any ping above
-- nothing. That means the client can teleport it. So the server samples the
-- ball's position and rejects moves faster than Movement.maxPlausibleSpeed,
-- snapping the offender back. Catching is ALSO still validated by distance
-- server-side, so a successful teleport still buys nothing.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local GoobMath = require(Shared.GoobMath)
local Movement = require(Shared.Movement)
local Feedstock = require(Shared.Feedstock)
local Cosmetics = require(Shared.Cosmetics)

local RollService = {}

local balls: { [number]: BasePart } = {}
local lastSeen: { [number]: { pos: Vector3, t: number } } = {}
local violations: { [number]: number } = {}

RollService.onShove = Instance.new("BindableEvent")

local INTERIOR_MAX = 30

local function buildBall(player: Player, goob): BasePart
    local radius = GoobMath.size(goob)

    local ball = Instance.new("Part")
    ball.Name = "GoobBall_" .. player.UserId
    ball.Shape = Enum.PartType.Ball
    ball.Size = Vector3.new(radius, radius, radius) * 2
    ball.Material = Enum.Material.Glass
    -- A fresh Goob is only 4 studs across. At 0.45 on Glass it was very nearly
    -- invisible against the sky, which is a bad first impression when it is
    -- also the thing you are supposed to be. Solid enough to read as a body,
    -- transparent enough to show what is inside it.
    ball.Transparency = 0.24
    ball.Color = Color3.fromHSV(goob.hue, 0.55, 1)
    ball.Reflectance = 0.06
    ball.CanCollide = true
    ball.Anchored = false
    ball.CustomPhysicalProperties = PhysicalProperties.new(0.7, 0.35, 0.25, 1, 1)
    ball.Parent = Workspace

    -- Face. Two eyes welded on, so it reads as a creature rather than a marble.
    for _, side in ipairs({ { "L", -0.34 }, { "R", 0.34 } }) do
        local tag, sx = side[1], side[2]
        local eye = Instance.new("Part")
        eye.Name = "Eye" .. tag
        eye.Shape = Enum.PartType.Ball
        eye.Size = Vector3.new(radius * 0.36, radius * 0.36, radius * 0.36)
        eye.Color = Color3.new(1, 1, 1)
        eye.Material = Enum.Material.SmoothPlastic
        eye.CanCollide = false
        eye.CanQuery = false
        eye.Massless = true
        eye.CFrame = ball.CFrame * CFrame.new(sx * radius, radius * 0.3, -radius * 0.9)
        eye.Parent = ball
        local w = Instance.new("WeldConstraint")
        w.Part0, w.Part1 = ball, eye
        w.Parent = eye

        local pupil = Instance.new("Part")
        pupil.Name = "Pupil" .. tag
        pupil.Shape = Enum.PartType.Ball
        pupil.Size = eye.Size * 0.55
        pupil.Color = Color3.fromRGB(25, 25, 35)
        pupil.Material = Enum.Material.SmoothPlastic
        pupil.CanCollide = false
        pupil.CanQuery = false
        pupil.Massless = true
        pupil.CFrame = eye.CFrame * CFrame.new(0, 0, -eye.Size.X * 0.35)
        pupil.Parent = ball
        local w2 = Instance.new("WeldConstraint")
        w2.Part0, w2.Part1 = ball, pupil
        w2.Parent = pupil
    end

    -- The contents, visible through the shell. Same idea as before, but now it
    -- tumbles with you, so what you have eaten is on display everywhere you go.
    local rng = Random.new(#goob.id + math.floor(goob.bornAt))
    local picks = {}
    local total = 0
    for _, count in pairs(goob.contents) do total += count end
    if total > 0 then
        for id, count in pairs(goob.contents) do
            local item = Feedstock.get(id)
            if item then
                local boost = (item.mass >= 600) and 6 or 1
                local slots = math.max(1, math.round((count / total) * INTERIOR_MAX * boost))
                for _ = 1, math.min(slots, INTERIOR_MAX) do
                    table.insert(picks, item)
                    if #picks >= INTERIOR_MAX then break end
                end
            end
            if #picks >= INTERIOR_MAX then break end
        end
    end

    for _, item in ipairs(picks) do
        local p = Instance.new("Part")
        p.Name = item.id
        p.Size = item.scale * math.max(0.5, radius * 0.14)
        p.Color = item.color
        p.Material = Enum.Material.SmoothPlastic
        p.CanCollide = false
        p.CanQuery = false
        p.CanTouch = false
        p.Massless = true
        if item.shape == "Ball" then p.Shape = Enum.PartType.Ball
        elseif item.shape == "Cylinder" then p.Shape = Enum.PartType.Cylinder end

        local dir = Vector3.new(rng:NextNumber(-1, 1), rng:NextNumber(-1, 1), rng:NextNumber(-1, 1))
        if dir.Magnitude < 0.001 then dir = Vector3.new(0, 1, 0) end
        p.CFrame = ball.CFrame * CFrame.new(dir.Unit * (radius * 0.7 * rng:NextNumber() ^ (1 / 3)))
        p.Parent = ball
        local w = Instance.new("WeldConstraint")
        w.Part0, w.Part1 = ball, p
        w.Parent = p
    end

    -- Nameplate travels with you: name, age tier, power, ascension crest.
    local plate = Instance.new("BillboardGui")
    plate.Name = "Plate"
    plate.Size = UDim2.fromScale(16, 5)
    plate.StudsOffsetWorldSpace = Vector3.new(0, radius + 5, 0)
    plate.MaxDistance = 500
    plate.Parent = ball

    local text = Instance.new("TextLabel")
    text.Name = "Info"
    text.Size = UDim2.fromScale(1, 1)
    text.BackgroundTransparency = 1
    text.Font = Enum.Font.FredokaOne
    text.TextScaled = true
    text.TextColor3 = Color3.new(1, 1, 1)
    text.TextStrokeTransparency = 0.35
    -- MUST be set here. A TextLabel's default Text is the literal string
    -- "Label", and this plate is a TextScaled BillboardGui floating directly
    -- above the player's own camera subject — so leaving it for a later refresh
    -- put the word "Label" across the middle of the screen in metre-high
    -- letters until something happened to trigger one.
    text.Text = goob.nickname
    text.Parent = plate

    return ball
end

-- Cosmetics are applied to the live ball rather than baked in at build time,
-- so equipping something is instant instead of respawning the player's body
-- out from under them mid-roll.
function RollService.applyCosmetics(player: Player, loadout: { [string]: string }?)
    local ball = balls[player.UserId]
    if not ball or not loadout then return end

    local skin = Cosmetics.get(loadout.skin or "")
    if skin then
        if skin.material then ball.Material = skin.material end
        if skin.colour then ball.Color = skin.colour end
        -- The default skin keeps the Goob's own hue, which is its identity.
        ball:SetAttribute("Skin", skin.id)
    end

    -- Trail. Rebuilt rather than tweaked because Trail needs two attachments
    -- and changing colour alone would leave a stale one behind.
    local old = ball:FindFirstChild("GoobTrail")
    if old then old:Destroy() end
    local trail = Cosmetics.get(loadout.trail or "")
    if trail and trail.id ~= "trail_none" and trail.colour then
        local r = ball.Size.X / 2
        local a0 = Instance.new("Attachment")
        a0.Name = "TrailA0"
        a0.Position = Vector3.new(-r * 0.5, 0, 0)
        a0.Parent = ball
        local a1 = Instance.new("Attachment")
        a1.Name = "TrailA1"
        a1.Position = Vector3.new(r * 0.5, 0, 0)
        a1.Parent = ball

        local t = Instance.new("Trail")
        t.Name = "GoobTrail"
        t.Attachment0 = a0
        t.Attachment1 = a1
        t.Lifetime = 0.8
        t.MinLength = 0.2
        t.LightEmission = 0.6
        t.Transparency = NumberSequence.new(0.25, 1)
        t.Color = ColorSequence.new(trail.colour)
        t.Parent = ball
    end

    -- Eyes and crown ride on the nameplate, which every other player can read
    -- from across the map. That is the entire point of a cosmetic.
    ball:SetAttribute("Eyes", loadout.eyes or "")
    ball:SetAttribute("Crown", loadout.crown or "")
    RollService.refreshPlate(player)
end

function RollService.ballFor(player: Player): BasePart?
    return balls[player.UserId]
end

function RollService.spawn(player: Player, goob, atPosition: Vector3?)
    RollService.despawn(player)
    if not goob then return end

    local ball = buildBall(player, goob)
    local radius = GoobMath.size(goob)
    local start = atPosition or Vector3.new(0, radius + 6, 40)
    ball.CFrame = CFrame.new(start)
    balls[player.UserId] = ball

    -- Hide the avatar and bind it to the ball. Keeping the character alive is
    -- deliberate: Humanoid.MoveDirection is how we read input, and it already
    -- handles keyboard, gamepad AND the mobile thumbstick for free. Writing a
    -- bespoke touch stick would have been the alternative.
    local char = player.Character
    if char then
        for _, d in ipairs(char:GetDescendants()) do
            if d:IsA("BasePart") then
                d.Transparency = 1
                d.CanCollide = false
                d.Massless = true
            elseif d:IsA("Decal") then
                d.Transparency = 1
            end
        end
        local hrp = char:FindFirstChild("HumanoidRootPart") :: BasePart?
        local hum = char:FindFirstChildOfClass("Humanoid")
        if hum then
            -- PlatformStand, NOT WalkSpeed = 0.
            --
            -- A Humanoid with WalkSpeed = 0 does not simply decline to move: it
            -- actively brakes its assembly to zero velocity every physics step.
            -- The ball is welded to that assembly, so the humanoid fought every
            -- frame of movement the controller applied and the player could not
            -- move at all. PlatformStand makes the humanoid stop controlling
            -- physics entirely, which is what we actually wanted.
            hum.PlatformStand = true
            hum.AutoRotate = false
        end
        if hrp then
            hrp.CFrame = ball.CFrame
            local weld = Instance.new("WeldConstraint")
            weld.Name = "GoobBallWeld"
            weld.Part0 = ball
            weld.Part1 = hrp
            weld.Parent = ball
        end
    end

    -- Client owns it or it feels like mud. The cost is policed below.
    local ok = pcall(function() ball:SetNetworkOwner(player) end)
    if not ok then warn("[Goob/Roll] could not hand ownership to " .. player.Name) end

    lastSeen[player.UserId] = { pos = ball.Position, t = os.clock() }
    violations[player.UserId] = 0

    -- Paint the real nameplate immediately rather than waiting for the first
    -- mass change to trigger a refresh.
    RollService.refresh(player, goob)
end

-- Move a ball somewhere the SERVER decided it should be.
--
-- This exists because the anti-cheat cannot tell the difference between a
-- client teleporting itself and the server placing a player in the arena. The
-- first version of the Sumo Pit started a match, dropped both fighters into the
-- ring, and then the sampler snapped them straight back out again and
-- eliminated them — every match ended instantly with the pot refunded. Any
-- legitimate reposition MUST go through here so the sampler is told about it.
function RollService.teleport(player: Player, position: Vector3)
    local ball = balls[player.UserId]
    if not ball then return end
    ball.CFrame = CFrame.new(position)
    ball.AssemblyLinearVelocity = Vector3.zero
    ball.AssemblyAngularVelocity = Vector3.zero
    local seen = lastSeen[player.UserId]
    if seen then
        seen.pos = position
        seen.t = os.clock()
    end
    violations[player.UserId] = 0
end

function RollService.despawn(player: Player)
    local ball = balls[player.UserId]
    if ball then ball:Destroy() end
    balls[player.UserId] = nil
    lastSeen[player.UserId] = nil
end

-- Rebuild only when the size has drifted enough to matter. Rebuilding on every
-- feed would yank the ball out from under the player mid-roll.
-- Split out so cosmetics can redraw the plate without needing the Goob record.
function RollService.refreshPlate(player: Player)
    local ball = balls[player.UserId]
    if not ball then return end
    local plate = ball:FindFirstChild("Plate")
    local info = plate and plate:FindFirstChild("Info") :: TextLabel?
    if info then
        local crown = Cosmetics.get(ball:GetAttribute("Crown") or "")
        local prefix = (crown and crown.emoji ~= "" and crown.emoji) and (crown.emoji .. " ") or ""
        info.Text = prefix .. info.Text:gsub("^[^%a%d👑]*", "")
    end
end

function RollService.refresh(player: Player, goob)
    local ball = balls[player.UserId]
    if not ball or not goob then return end
    local radius = GoobMath.size(goob)
    local want = Vector3.new(radius, radius, radius) * 2
    if (ball.Size - want).Magnitude > radius * 0.25 then
        RollService.spawn(player, goob, ball.Position + Vector3.new(0, 2, 0))
        return
    end

    local plate = ball:FindFirstChild("Plate")
    local info = plate and plate:FindFirstChild("Info") :: TextLabel?
    if info then
        local tier = GoobMath.ageTier(goob)
        local crown = Cosmetics.get(ball:GetAttribute("Crown") or "")
        local hat = (crown and crown.emoji and crown.emoji ~= "") and (crown.emoji .. " ") or ""
        local crest = (goob.crests and goob.crests > 0)
            and ("👑" .. tostring(goob.crests) .. " ") or ""
        local tag = ball:GetAttribute("CrewTag")
        local crew = (tag and tag ~= "") and ("[" .. tag .. "] ") or ""
        info.Text = ("%s%s%s%s\n%s %s · Gen %d\n⚡ %s")
            :format(hat, crest, crew, goob.nickname, tier.emoji, tier.name,
                    #goob.lineage + 1, require(Shared.Format).short(GoobMath.power(goob)))
        info.TextColor3 = tier.color
    end
end

-- ── Anti-cheat ─────────────────────────────────────────────────────────────
-- Sampled, not per-frame: a 4Hz check is plenty to catch a teleport and costs
-- nothing with thirty players on a server.

function RollService.start(getGoob: (Player) -> any)
    task.spawn(function()
        while true do
            task.wait(0.25)
            local now = os.clock()
            for userId, ball in pairs(balls) do
                local player = Players:GetPlayerByUserId(userId)
                local prev = lastSeen[userId]
                if player and prev and ball.Parent then
                    local dt = math.max(0.05, now - prev.t)
                    local dist = (ball.Position - prev.pos).Magnitude
                    local speed = dist / dt
                    local goob = getGoob(player)
                    local ceiling = goob and Movement.maxPlausibleSpeed(goob.mass) or 200

                    if speed > ceiling then
                        violations[userId] = (violations[userId] or 0) + 1
                        -- One strike is network noise; three is a script.
                        if violations[userId] >= 3 then
                            ball.CFrame = CFrame.new(prev.pos)
                            ball.AssemblyLinearVelocity = Vector3.zero
                            violations[userId] = 0
                        end
                    else
                        violations[userId] = math.max(0, (violations[userId] or 0) - 1)
                        prev.pos = ball.Position
                    end
                    prev.t = now

                    -- Fell off the world. Recorded as a legitimate move, or the
                    -- next sample would read the rescue itself as a teleport.
                    if ball.Position.Y < -80 then
                        RollService.teleport(player, Vector3.new(0, 30, 40))
                    end
                end
            end
        end
    end)
end

return RollService
