--!strict
-- Juice.luau — the feedback that makes a world feel inhabited.
--
-- The play-test note was "the area is so bland, needs to feel more alive".
-- Half of that was structural and got fixed by rolling and the zones. The other
-- half is this: things that pop, flash, rattle and react. None of it changes a
-- single number; all of it changes whether the game feels responsive.
--
-- Everything here is CLIENT-side and cosmetic. A dropped effect costs nothing,
-- so nothing here is ever allowed to error out of a gameplay path.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")
local Debris = game:GetService("Debris")
local SoundService = game:GetService("SoundService")

local Shared = game.ReplicatedStorage:WaitForChild("GoobShared")
local Feedstock = require(Shared.Feedstock)
local Config = require(Shared.Config)

local player = Players.LocalPlayer
local Juice = {}

local RARITY_BURST = {
    Common = 6, Uncommon = 10, Rare = 16, Epic = 26,
    Legendary = 40, Mythic = 60, Secret = 110,
}

-- ── Camera shake ───────────────────────────────────────────────────────────
-- Applied as an offset to the camera's own CFrame each frame and decayed, so it
-- never fights the default camera controller for ownership.

local shake = 0

function Juice.shakeCamera(amount: number)
    shake = math.min(3.5, shake + amount)
end

-- ── Particle bursts ────────────────────────────────────────────────────────

local function burst(position: Vector3, colour: Color3, count: number, size: number)
    local anchor = Instance.new("Part")
    anchor.Anchored = true
    anchor.CanCollide = false
    anchor.CanQuery = false
    anchor.Transparency = 1
    anchor.Size = Vector3.new(0.2, 0.2, 0.2)
    anchor.Position = position
    anchor.Parent = Workspace

    local attach = Instance.new("Attachment")
    attach.Parent = anchor

    local emitter = Instance.new("ParticleEmitter")
    emitter.Color = ColorSequence.new(colour)
    emitter.Size = NumberSequence.new({
        NumberSequenceKeypoint.new(0, size),
        NumberSequenceKeypoint.new(1, 0),
    })
    emitter.Transparency = NumberSequence.new({
        NumberSequenceKeypoint.new(0, 0.1),
        NumberSequenceKeypoint.new(1, 1),
    })
    emitter.Lifetime = NumberRange.new(0.35, 0.8)
    emitter.Speed = NumberRange.new(12, 30)
    emitter.SpreadAngle = Vector2.new(180, 180)
    emitter.Rate = 0
    emitter.LightEmission = 0.7
    emitter.Parent = attach
    emitter:Emit(count)

    Debris:AddItem(anchor, 2)
end

Juice.burst = burst

-- ── Sounds ─────────────────────────────────────────────────────────────────

-- Ids live in Config and default to empty. An unset id creates no Sound at
-- all, so a game with no audio configured is silent rather than noisy with
-- load failures.
local VOLUMES = {
    catch = 0.22, rare = 0.55, bank = 0.50, unlock = 0.45,
    gulp = 0.55, pop = 0.60, thud = 0.45,
    whoosh = 0.35, slam = 0.45, shield = 0.32, drip = 0.34, click = 0.25,
}

-- Driven off Config.SOUNDS, not off VOLUMES. Keying the loop on the volume
-- table meant a sound added to the config with no volume entry was created
-- nowhere and never played, silently — the config would look configured and
-- the game would stay quiet.
local DEFAULT_VOLUME = 0.35

local sfx: { [string]: Sound } = {}
local missingVolume: { string } = {}

for name, id in pairs(Config.SOUNDS or {}) do
    if type(id) == "string" and id ~= "" then
        local s = Instance.new("Sound")
        s.Name = "Goob_" .. name
        s.SoundId = id
        s.Volume = VOLUMES[name] or DEFAULT_VOLUME
        s.Parent = SoundService
        sfx[name] = s
        if not VOLUMES[name] then
            table.insert(missingVolume, name)
        end
    end
end
if #missingVolume > 0 then
    warn("[Goob/Juice] no volume set for: " .. table.concat(missingVolume, ", "))
end

-- Report a dead sound id ONCE, at boot, rather than on every play. The harness
-- has no audio engine and cannot tell whether a file exists, so this warning is
-- the only thing that will ever say so — it needs to be findable in the output
-- rather than buried under a thousand repeats.
task.defer(function()
    local dead = {}
    for name, sound in pairs(sfx) do
        if not sound.IsLoaded and sound.TimeLength == 0 then
            table.insert(dead, name .. " (" .. sound.SoundId .. ")")
        end
    end
    if #dead > 0 then
        warn("[Goob/Juice] sounds that did not load: " .. table.concat(dead, ", "))
    end
end)

Juice.sounds = sfx

function Juice.play(name: string, pitchJitter: number?)
    local s = sfx[name]
    if not s then return end   -- unconfigured: silent, never an error
    if pitchJitter then
        s.PlaybackSpeed = 1 + (math.random() - 0.5) * pitchJitter
    end
    pcall(function() s:Play() end)
end

-- ── Public effects ─────────────────────────────────────────────────────────

function Juice.onCatch(itemId: string, position: Vector3?)
    local item = Feedstock.get(itemId)
    if not item then return end
    local pos = position
    if not pos then
        local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
        pos = ball and ball.Position or nil
    end
    if not pos then return end

    burst(pos, item.color, RARITY_BURST[item.rarity] or 8,
        item.rarity == "Secret" and 3 or 1.4)

    if item.rarity == "Secret" or item.rarity == "Mythic" then
        Juice.play("rare")
        Juice.shakeCamera(item.rarity == "Secret" and 2.4 or 1.2)
    elseif item.rarity == "Legendary" or item.rarity == "Epic" then
        Juice.play("catch", 0.35)
        Juice.shakeCamera(0.4)
    else
        Juice.play("catch", 0.5)
    end
end

function Juice.onGulp(position: Vector3?)
    local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
    local pos = position or (ball and ball.Position)
    if pos then burst(pos, Color3.fromRGB(255, 120, 150), 70, 3) end
    Juice.play("gulp")
    Juice.shakeCamera(1.8)
end

function Juice.onAscend(position: Vector3?)
    local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
    local pos = position or (ball and ball.Position)
    if pos then
        burst(pos, Color3.fromRGB(255, 240, 170), 160, 5)
        burst(pos + Vector3.new(0, 14, 0), Color3.fromRGB(255, 255, 255), 90, 3)
    end
    Juice.play("rare")
    Juice.shakeCamera(3.5)
end

function Juice.onShove(position: Vector3, force: number)
    burst(position, Color3.fromRGB(255, 200, 120), math.clamp(force * 20, 10, 60), 2)
    Juice.play("thud", 0.3)
    Juice.shakeCamera(math.clamp(force * 2, 0.3, 2.2))
end

-- ── Powers ─────────────────────────────────────────────────────────────────
-- Every power gets a shape you can read in a quarter of a second, from across
-- an arena, on a phone. That constraint rules out anything detailed: what
-- survives is silhouette, colour and motion. A ring means area, a streak means
-- direction, a shell means protection.

local function ring(position: Vector3, colour: Color3, from: number, to: number, seconds: number)
    local r = Instance.new("Part")
    r.Name = "FX_Ring"
    r.Shape = Enum.PartType.Cylinder
    r.Anchored = true
    r.CanCollide = false
    r.CanQuery = false
    r.CanTouch = false
    r.Material = Enum.Material.Neon
    r.Color = colour
    r.Transparency = 0.25
    -- Rotated onto its side so the cylinder reads as a flat disc on the ground.
    r.CFrame = CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90))
    r.Size = Vector3.new(1, from, from)
    r.Parent = Workspace

    TweenService:Create(r, TweenInfo.new(seconds, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
        Size = Vector3.new(1, to, to),
        Transparency = 1,
    }):Play()
    Debris:AddItem(r, seconds + 0.2)
end

local function streak(from: Vector3, to: Vector3, colour: Color3, thickness: number)
    local delta = to - from
    local len = delta.Magnitude
    if len < 0.5 then return end
    local p = Instance.new("Part")
    p.Name = "FX_Streak"
    p.Anchored = true
    p.CanCollide = false
    p.CanQuery = false
    p.CanTouch = false
    p.Material = Enum.Material.Neon
    p.Color = colour
    p.Transparency = 0.3
    p.Size = Vector3.new(thickness, thickness, len)
    p.CFrame = CFrame.new(from + delta / 2, to)
    p.Parent = Workspace
    TweenService:Create(p, TweenInfo.new(0.35), { Transparency = 1, Size = Vector3.new(0.1, 0.1, len) }):Play()
    Debris:AddItem(p, 0.6)
end

local function shell(host: BasePart, colour: Color3, seconds: number)
    local sh = Instance.new("Part")
    sh.Name = "FX_Shell"
    sh.Shape = Enum.PartType.Ball
    sh.Anchored = false
    sh.CanCollide = false
    sh.CanQuery = false
    sh.CanTouch = false
    sh.Massless = true
    sh.Material = Enum.Material.ForceField
    sh.Color = colour
    sh.Transparency = 0.35
    sh.Size = host.Size * 1.25
    sh.CFrame = host.CFrame
    sh.Parent = Workspace
    local weld = Instance.new("WeldConstraint")
    weld.Part0, weld.Part1 = host, sh
    weld.Parent = sh
    TweenService:Create(sh, TweenInfo.new(seconds), { Transparency = 1 }):Play()
    Debris:AddItem(sh, seconds + 0.2)
end

-- A quick squash-and-stretch on the body itself. It is the cheapest possible
-- "that did something" signal and it works even when everything else is off
-- screen, because the thing it animates is the thing the camera is following.
local function pulse(ball: BasePart, scale: number, seconds: number)
    local base = ball.Size
    local t = TweenService:Create(ball, TweenInfo.new(seconds * 0.4, Enum.EasingStyle.Back,
        Enum.EasingDirection.Out), { Size = base * scale })
    t:Play()
    task.delay(seconds * 0.4, function()
        if ball.Parent then
            -- Tween back to whatever the size is NOW, not to the size we
            -- captured: the arena resizes the body constantly, and snapping
            -- back to a stale value would undo real growth.
            TweenService:Create(ball, TweenInfo.new(seconds * 0.6), { Size = ball.Size / scale }):Play()
        end
    end)
end

local POWER_COLOUR = {
    dash   = Color3.fromRGB(150, 205, 225), blink  = Color3.fromRGB(186, 170, 206),
    split  = Color3.fromRGB(195, 165, 195), slam   = Color3.fromRGB(205, 170, 140),
    hook   = Color3.fromRGB(190, 180, 145), bubble = Color3.fromRGB(175, 200, 200),
    spike  = Color3.fromRGB(205, 150, 155), slick  = Color3.fromRGB(160, 175, 150),
    decoy  = Color3.fromRGB(180, 176, 190), siphon = Color3.fromRGB(160, 190, 172),
    magnet = Color3.fromRGB(170, 190, 215), beacon = Color3.fromRGB(206, 186, 132),
}

function Juice.onPower(id: string, data: any)
    local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
    if not ball then return end
    local pos = ball.Position
    local colour = POWER_COLOUR[id] or Color3.fromRGB(190, 190, 190)
    local r = ball.Size.X / 2

    Juice.play((Config.POWER_SOUND or {})[id] or "whoosh", 0.25)

    if id == "dash" then
        pulse(ball, 0.82, 0.3)
        burst(pos, colour, 14, 2)
        Juice.shakeCamera(0.3)

    elseif id == "blink" then
        -- Both ends, joined. A teleport with no visible origin reads as a
        -- rubber-band desync rather than as something you did on purpose.
        burst(pos, colour, 30, 2.4)
        task.delay(0.05, function()
            local now = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
            if now then
                streak(pos, now.Position, colour, math.max(2, r * 0.7))
                burst(now.Position, colour, 30, 2.4)
            end
        end)
        Juice.shakeCamera(0.5)

    elseif id == "split" then
        pulse(ball, 0.7, 0.45)
        streak(pos, pos + ball.AssemblyLinearVelocity.Unit * (r * 6), colour, r * 0.8)
        burst(pos, colour, 26, 3)
        Juice.shakeCamera(0.6)

    elseif id == "slam" then
        pulse(ball, 1.18, 0.5)
        -- The ring is fired on the WAY UP as a telegraph. Everyone nearby gets
        -- most of a second to move, which is what makes dodging a slam a skill
        -- rather than a coin flip.
        ring(pos - Vector3.new(0, r, 0), colour, r * 2, 92, 0.85)
        Juice.shakeCamera(0.8)

    elseif id == "hook" then
        burst(pos, colour, 16, 2)
        Juice.shakeCamera(0.4)

    elseif id == "bubble" then
        shell(ball, colour, 3)
        ring(pos - Vector3.new(0, r, 0), colour, r * 2, r * 5, 0.5)

    elseif id == "spike" then
        shell(ball, colour, 3)
        burst(pos, colour, 34, 2.6)
        Juice.shakeCamera(0.5)

    elseif id == "beacon" then
        shell(ball, colour, 8)
        ring(pos - Vector3.new(0, r, 0), colour, r * 2, 120, 1.2)
        -- A pillar, because BEACON's entire bargain is that the whole island
        -- can see you. If it were subtle it would be a free damage buff.
        local beam = Instance.new("Part")
        beam.Name = "FX_Beacon"
        beam.Anchored = false
        beam.CanCollide = false
        beam.CanQuery = false
        beam.CanTouch = false
        beam.Massless = true
        beam.Material = Enum.Material.Neon
        beam.Color = colour
        beam.Transparency = 0.55
        beam.Size = Vector3.new(r * 0.8, 200, r * 0.8)
        beam.CFrame = ball.CFrame * CFrame.new(0, 100, 0)
        beam.Parent = Workspace
        local w = Instance.new("WeldConstraint")
        w.Part0, w.Part1 = ball, beam
        w.Parent = beam
        TweenService:Create(beam, TweenInfo.new(8), { Transparency = 1 }):Play()
        Debris:AddItem(beam, 8.2)

    elseif id == "slick" then
        ring(pos - Vector3.new(0, r, 0), colour, r, r * 4, 0.6)
        burst(pos, colour, 12, 2)

    elseif id == "decoy" then
        pulse(ball, 1.1, 0.3)
        burst(pos, colour, 18, 2.2)

    elseif id == "siphon" then
        burst(pos, colour, 22, 2)
        Juice.shakeCamera(0.35)

    elseif id == "magnet" then
        ring(pos - Vector3.new(0, r, 0), colour, 80, r * 2, 0.7)
    end
end

-- Somebody drained you. Fired on the victim, who otherwise just watches their
-- number fall with no idea why.
function Juice.onSiphoned(from: string?, amount: number?)
    local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
    if ball then
        burst(ball.Position, Color3.fromRGB(190, 120, 120), 26, 2.4)
    end
    Juice.play("drip", 0.3)
    Juice.shakeCamera(0.8)
end

function Juice.onBank(glob: number?)
    local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
    if ball then
        local r = ball.Size.X / 2
        ring(ball.Position - Vector3.new(0, r, 0), Color3.fromRGB(206, 184, 126), r * 2, 70, 0.9)
        burst(ball.Position, Color3.fromRGB(206, 184, 126), 44, 3)
    end
    Juice.play("bank")
    Juice.shakeCamera(0.6)
end

function Juice.onPop(mass: number?)
    local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
    if ball then
        burst(ball.Position, Color3.fromRGB(190, 124, 112), 80, 3.4)
        ring(ball.Position, Color3.fromRGB(190, 124, 112), 4, 80, 0.7)
    end
    Juice.play("pop")
    Juice.shakeCamera(2.2)
end

-- ── Living world ───────────────────────────────────────────────────────────
-- Critters visibly flinch away when you get close. It costs one distance check
-- per critter per frame and it is the single cheapest thing that makes a field
-- of floating junk read as a field of creatures.

local FLEE_RADIUS = 26

function Juice.start()
    local critters = Workspace:WaitForChild("Critters")

    RunService.RenderStepped:Connect(function(dt)
        -- Camera shake, decayed.
        local camera = Workspace.CurrentCamera
        if camera and shake > 0.01 then
            local o = shake
            camera.CFrame = camera.CFrame * CFrame.new(
                (math.random() - 0.5) * o,
                (math.random() - 0.5) * o,
                0)
            shake = shake * math.max(0, 1 - dt * 7)
        else
            shake = 0
        end

        local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
        if not ball then return end

        for _, c in ipairs(critters:GetChildren()) do
            if c:IsA("BasePart") then
                local away = c.Position - ball.Position
                local d = away.Magnitude
                if d < FLEE_RADIUS and d > 0.1 then
                    -- Lean away and bob harder the closer you are. Purely
                    -- visual: the server owns where critters actually are.
                    local urgency = 1 - (d / FLEE_RADIUS)
                    c.CFrame = c.CFrame * CFrame.new(away.Unit * urgency * dt * 14)
                        * CFrame.Angles(0, dt * urgency * 6, 0)
                end
            end
        end
    end)
end

return Juice
