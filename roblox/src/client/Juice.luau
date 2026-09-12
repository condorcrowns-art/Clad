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
local VOLUMES = { catch = 0.30, rare = 0.55, gulp = 0.60, thud = 0.45 }

local sfx: { [string]: Sound } = {}
for name, volume in pairs(VOLUMES) do
    local id = (Config.SOUNDS or {})[name]
    if type(id) == "string" and id ~= "" then
        local s = Instance.new("Sound")
        s.Name = "Goob_" .. name
        s.SoundId = id
        s.Volume = volume
        s.Parent = SoundService
        sfx[name] = s
    end
end

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
