--!strict
-- Roll.luau — the controller.
--
-- Direct velocity control rather than forces. Forces are more "physical" and
-- much worse to play: with friction and mass in the loop the response changes
-- with every surface, and a nine-year-old reads that as the game being broken.
-- We set velocity toward a target and derive the visual spin ourselves, so the
-- ball always LOOKS like it is rolling even though we are driving it directly.
--
-- Input comes from Humanoid.MoveDirection, which already fuses keyboard,
-- gamepad and the mobile thumbstick. Writing a bespoke touch stick would have
-- been days of work and worse on every device.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = game.ReplicatedStorage:WaitForChild("GoobShared")
local Movement = require(Shared.Movement)
local Stick = require(script.Parent.Stick)

local player = Players.LocalPlayer
local Roll = {}

local ball: BasePart? = nil
local mass = 10

local dashCharges = Movement.DASH_CHARGES
local dashRefillClock = 0
local dashUntil = 0
local dashDir = Vector3.zero
local airDashesLeft = Movement.AIR_DASHES
local grounded = false
local jumpQueued = false

Roll.onDash = nil :: ((charges: number) -> ())?

local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude

function Roll.setBall(newBall: BasePart?, newMass: number)
    ball = newBall
    mass = math.max(1, newMass)
    if newBall then
        rayParams.FilterDescendantsInstances = { newBall, player.Character }
    end
end

function Roll.charges(): number
    return dashCharges
end

function Roll.maxCharges(): number
    return Movement.DASH_CHARGES
end

-- Fraction of the way to the next charge, for the HUD meter.
function Roll.refillProgress(): number
    if dashCharges >= Movement.DASH_CHARGES then return 1 end
    return math.clamp(dashRefillClock / Movement.DASH_REFILL, 0, 1)
end

-- Input comes entirely from Stick: keyboard, gamepad and our own thumbstick.
-- Reading Humanoid.MoveDirection was the original approach and it did not work
-- (see the note at the top of Stick.luau).
local function moveInput(): Vector3
    return Stick.moveVector()
end

local function checkGrounded(b: BasePart): boolean
    local radius = b.Size.X / 2
    local hit = Workspace:Raycast(b.Position, Vector3.new(0, -(radius + 3), 0), rayParams)
    return hit ~= nil
end

function Roll.dash()
    if not ball then return end
    if dashCharges <= 0 then return end
    if not grounded and airDashesLeft <= 0 then return end

    local dir = moveInput()
    if dir.Magnitude < 0.05 then
        local v = ball.AssemblyLinearVelocity
        dir = Vector3.new(v.X, 0, v.Z)
        if dir.Magnitude < 0.05 then
            local cam = Workspace.CurrentCamera
            dir = cam and Vector3.new(cam.CFrame.LookVector.X, 0, cam.CFrame.LookVector.Z) or Vector3.new(0, 0, -1)
        end
        dir = dir.Unit
    end

    dashCharges -= 1
    dashDir = dir
    dashUntil = os.clock() + Movement.DASH_TIME
    if not grounded then airDashesLeft -= 1 end
    if Roll.onDash then Roll.onDash(dashCharges) end
end

function Roll.jump()
    jumpQueued = true
end

function Roll.step(dt: number)
    local b = ball
    if not b or not b.Parent then return end

    local wasGrounded = grounded
    grounded = checkGrounded(b)
    if grounded and not wasGrounded then
        airDashesLeft = Movement.AIR_DASHES
    end

    -- Dash charges refill on a timer, one at a time.
    if dashCharges < Movement.DASH_CHARGES then
        dashRefillClock += dt
        if dashRefillClock >= Movement.DASH_REFILL then
            dashRefillClock = 0
            dashCharges += 1
        end
    else
        dashRefillClock = 0
    end

    local vel = b.AssemblyLinearVelocity
    local flat = Vector3.new(vel.X, 0, vel.Z)
    local dashing = os.clock() < dashUntil

    local target: Vector3
    if dashing then
        target = dashDir * Movement.DASH_SPEED
    else
        local input = moveInput()
        local top = Movement.topSpeed(mass)
        if input.Magnitude > 0.05 then
            local accel = Movement.acceleration(mass)
            target = flat + input * accel * dt
            if target.Magnitude > top then target = target.Unit * top end
        else
            -- Coasting. Braking scales down with mass, which is what makes a
            -- big Goob feel like a truck.
            local brake = Movement.braking(mass) * dt
            if flat.Magnitude <= brake then
                target = Vector3.zero
            else
                target = flat - flat.Unit * brake
            end
        end
    end

    local newY = vel.Y
    if jumpQueued then
        jumpQueued = false
        if grounded then newY = Movement.jumpSpeed(mass) end
    end
    if not grounded then
        newY -= (Workspace.Gravity * (Movement.GRAVITY_BOOST - 1)) * dt
    end

    b.AssemblyLinearVelocity = Vector3.new(target.X, newY, target.Z)

    -- Derive the spin from the motion so it always looks like rolling, whatever
    -- the friction under it happens to be.
    local radius = math.max(0.5, b.Size.X / 2)
    local speed = Vector3.new(target.X, 0, target.Z).Magnitude
    if speed > 0.1 then
        local axis = Vector3.new(0, 1, 0):Cross(Vector3.new(target.X, 0, target.Z).Unit)
        b.AssemblyAngularVelocity = axis * (speed / radius)
    else
        b.AssemblyAngularVelocity = b.AssemblyAngularVelocity * 0.85
    end
end

function Roll.bindInput()
    Stick.onJump = Roll.jump
    Stick.onDash = Roll.dash
end

return Roll
