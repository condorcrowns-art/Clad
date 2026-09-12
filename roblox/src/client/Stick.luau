--!strict
-- Stick.luau — our own input, because borrowing Roblox's did not work.
--
-- THE BUG THIS EXISTS TO FIX: the first version set Humanoid.WalkSpeed = 0 to
-- stop the avatar walking, and read Humanoid.MoveDirection for input. Both
-- halves of that were wrong:
--
--   1. A Humanoid with WalkSpeed = 0 does not merely decline to move — it
--      actively brakes its assembly to zero velocity every physics step. The
--      ball was welded to that assembly, so the humanoid fought every frame of
--      movement the controller applied.
--   2. MoveDirection is zero when WalkSpeed is zero, so the input read was dead
--      as well. The keyboard fallback was carrying the whole thing.
--
-- So: the humanoid is put into PlatformStand (it stops controlling physics
-- entirely) and input comes from here — keyboard, gamepad, and a thumbstick we
-- draw ourselves. No dependency on the default control module at all.

local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local Players = game:GetService("Players")

local Theme = require(script.Parent.Theme)

local player = Players.LocalPlayer
local Stick = {}

local keys = { W = false, A = false, S = false, D = false }
local gamepad = Vector2.new(0, 0)
local touchVector = Vector2.new(0, 0)

Stick.onJump = function() end
Stick.onDash = function() end

-- ── Camera-relative movement vector, from whichever device is in use ───────

function Stick.moveVector(): Vector3
    local camera = Workspace.CurrentCamera
    if not camera then return Vector3.zero end

    local look = camera.CFrame.LookVector
    local right = camera.CFrame.RightVector
    local fwd = Vector3.new(look.X, 0, look.Z)
    local side = Vector3.new(right.X, 0, right.Z)
    if fwd.Magnitude < 0.001 then return Vector3.zero end
    fwd, side = fwd.Unit, side.Unit

    local x, z = 0, 0
    if keys.W then z += 1 end
    if keys.S then z -= 1 end
    if keys.D then x += 1 end
    if keys.A then x -= 1 end

    -- Analogue sources win over digital when they are actually deflected, so a
    -- thumb resting on a stick doesn't get overridden by a stuck key.
    if math.abs(gamepad.X) > 0.15 or math.abs(gamepad.Y) > 0.15 then
        x, z = gamepad.X, gamepad.Y
    end
    if touchVector.Magnitude > 0.12 then
        x, z = touchVector.X, touchVector.Y
    end

    local v = side * x + fwd * z
    if v.Magnitude < 0.05 then return Vector3.zero end
    return (v.Magnitude > 1 and v.Unit or v)
end

-- ── Keyboard and gamepad ───────────────────────────────────────────────────

local KEYMAP = {
    [Enum.KeyCode.W] = "W", [Enum.KeyCode.Up] = "W",
    [Enum.KeyCode.S] = "S", [Enum.KeyCode.Down] = "S",
    [Enum.KeyCode.A] = "A", [Enum.KeyCode.Left] = "A",
    [Enum.KeyCode.D] = "D", [Enum.KeyCode.Right] = "D",
}

local function bindHardware()
    UserInputService.InputBegan:Connect(function(input, processed)
        if processed then return end
        local k = KEYMAP[input.KeyCode]
        if k then keys[k] = true return end
        if input.KeyCode == Enum.KeyCode.Space or input.KeyCode == Enum.KeyCode.ButtonA then
            Stick.onJump()
        elseif input.KeyCode == Enum.KeyCode.LeftShift
            or input.KeyCode == Enum.KeyCode.Q
            or input.KeyCode == Enum.KeyCode.ButtonR2
            or input.KeyCode == Enum.KeyCode.ButtonB then
            Stick.onDash()
        end
    end)

    UserInputService.InputEnded:Connect(function(input)
        local k = KEYMAP[input.KeyCode]
        if k then keys[k] = false end
    end)

    UserInputService.InputChanged:Connect(function(input)
        if input.KeyCode == Enum.KeyCode.Thumbstick1 then
            local p = input.Position
            gamepad = Vector2.new(p.X, p.Y)
        end
    end)

    -- Keys can stick if focus is lost mid-press.
    UserInputService.WindowFocusReleased:Connect(function()
        for k in pairs(keys) do keys[k] = false end
        gamepad = Vector2.new(0, 0)
    end)
end

-- ── The touch thumbstick we draw ourselves ─────────────────────────────────

local base: Frame? = nil
local knob: Frame? = nil
local activeTouch: InputObject? = nil
local centre = Vector2.new(0, 0)
local RADIUS = 62

function Stick.build(gui: ScreenGui)
    local b = Instance.new("Frame")
    b.Name = "MoveStick"
    b.Size = UDim2.fromOffset(RADIUS * 2, RADIUS * 2)
    b.BackgroundColor3 = Theme.BG
    b.BackgroundTransparency = 0.55
    b.Visible = false
    b.Parent = gui
    Theme.corner(b, RADIUS)
    Theme.stroke(b, Theme.TEXT_DIM, 2)
    base = b

    local k = Instance.new("Frame")
    k.Name = "Knob"
    k.Size = UDim2.fromOffset(56, 56)
    k.Position = UDim2.new(0.5, -28, 0.5, -28)
    k.BackgroundColor3 = Theme.ACCENT
    k.BackgroundTransparency = 0.2
    k.Parent = b
    Theme.corner(k, 28)
    Theme.stroke(k, Theme.BG, 2)
    knob = k

    bindHardware()

    -- Drag anywhere in the lower-left quadrant, not just on the stick: a thumb
    -- rarely lands exactly on a circle, and re-centring the stick where the
    -- thumb actually touched is the difference between responsive and fiddly.
    UserInputService.InputBegan:Connect(function(input, processed)
        if processed or input.UserInputType ~= Enum.UserInputType.Touch then return end
        local cam = Workspace.CurrentCamera
        local vp = cam and cam.ViewportSize or Vector2.new(1280, 720)
        local p = input.Position
        if p.X > vp.X * 0.45 or p.Y < vp.Y * 0.35 then return end

        activeTouch = input
        centre = Vector2.new(p.X, p.Y)
        b.Position = UDim2.fromOffset(centre.X - RADIUS, centre.Y - RADIUS)
        b.Visible = true
    end)

    UserInputService.InputChanged:Connect(function(input)
        if input ~= activeTouch then return end
        local p = Vector2.new(input.Position.X, input.Position.Y)
        local delta = p - centre
        local mag = math.min(delta.Magnitude, RADIUS)
        local dir = delta.Magnitude > 0.001 and delta.Unit or Vector2.new(0, 0)
        local offset = dir * mag
        if knob then
            knob.Position = UDim2.new(0.5, offset.X - 28, 0.5, offset.Y - 28)
        end
        -- Screen Y grows downward; forward is negative Y.
        touchVector = Vector2.new(offset.X / RADIUS, -offset.Y / RADIUS)
    end)

    UserInputService.InputEnded:Connect(function(input)
        if input ~= activeTouch then return end
        activeTouch = nil
        touchVector = Vector2.new(0, 0)
        if knob then knob.Position = UDim2.new(0.5, -28, 0.5, -28) end
        if base then base.Visible = false end
    end)
end

function Stick.setTouchEnabled(on: boolean)
    if base and not on then
        base.Visible = false
        touchVector = Vector2.new(0, 0)
    end
end

return Stick
