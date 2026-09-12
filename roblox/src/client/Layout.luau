--!strict
-- Layout.luau — one place that knows how big the screen is and what that means.
--
-- MEASURED, NOT GUESSED. Before this existed, at 568x320 (iPhone SE landscape)
-- the HUD covered 233% of the screen, 25 elements hung off the edges, tap
-- targets were 28px, and buttons sat underneath the thumbstick and jump button
-- where a thumb can never reach them.
--
-- Roblox reserves real estate for touch controls that no API will tell you
-- about: a movement thumbstick bottom-left and a jump button bottom-right.
-- Anything drawn there is simply unreachable on a phone, so the compact layout
-- puts its one action button in the gap between them.

local UserInputService = game:GetService("UserInputService")
local GuiService = game:GetService("GuiService")
local Workspace = game:GetService("Workspace")

local Layout = {}

-- Reserved by the Roblox touch controls. Generous on purpose: being 20px too
-- cautious costs nothing, being 20px too bold makes a button untappable.
Layout.THUMBSTICK = Vector2.new(230, 190)
Layout.JUMP_BUTTON = Vector2.new(160, 160)

-- Apple's guidance is 44pt; 34 is the floor we enforce and 44 is what we aim
-- for on anything a player presses repeatedly.
Layout.MIN_TAP = 44

Layout.changed = Instance.new("BindableEvent")

local current = {
    viewport = Vector2.new(1280, 720),
    compact = false,
    touch = false,
    inset = 0,
}

function Layout.get()
    return current
end

function Layout.isCompact(): boolean
    return current.compact
end

-- Deliberately separate from isCompact. An iPad is touch but not small: it
-- wants finger-sized tap targets and must keep the persistent HUD clear of the
-- thumbstick, while still having room for the roomy two-column layout.
-- Conflating the two left iPad with 28px buttons under the joystick.
function Layout.isTouch(): boolean
    return current.touch
end

function Layout.viewport(): Vector2
    return current.viewport
end

-- Usable height once the Roblox top bar is accounted for.
function Layout.usable(): Vector2
    -- Floored well above zero. ViewportSize is (0, 0) for the first frames
    -- before the camera initialises, and every layout function subtracts button
    -- widths from it — which produced math.clamp(x, 8, -76), a hard error that
    -- aborted the whole layout pass and left the HUD half-placed.
    return Vector2.new(
        math.max(320, current.viewport.X),
        math.max(240, current.viewport.Y - current.inset))
end

-- A clamp that cannot throw. Roblox's math.clamp errors when max < min, which
-- is correct for maths and useless for layout: a screen too narrow for a button
-- is something to survive, not something to crash on.
function Layout.fit(value: number, low: number, high: number): number
    if high < low then return low end
    return math.clamp(value, low, high)
end

-- Clamp a desired pixel size so it always fits with a margin. This is what
-- stops a 640x480 trade window from being drawn on a 568x320 screen.
function Layout.panel(wantW: number, wantH: number, marginX: number?, marginY: number?): UDim2
    local u = Layout.usable()
    local mx = marginX or (current.compact and 12 or 24)
    local my = marginY or (current.compact and 12 or 24)
    return UDim2.fromOffset(
        math.min(wantW, u.X - mx * 2),
        math.min(wantH, u.Y - my * 2)
    )
end

-- Centre a panel of a given resolved size.
function Layout.centre(size: UDim2): UDim2
    local u = Layout.usable()
    return UDim2.fromOffset(
        math.floor((u.X - size.X.Offset) / 2),
        math.floor((u.Y - size.Y.Offset) / 2)
    )
end

-- The horizontal band between the thumbstick and the jump button — the only
-- part of the bottom edge a phone player can actually press.
function Layout.bottomGap(): (number, number)
    local w = current.viewport.X
    local left = Layout.THUMBSTICK.X
    local right = w - Layout.JUMP_BUTTON.X
    return left, right
end

function Layout.recompute()
    local camera = Workspace.CurrentCamera
    local vp = camera and camera.ViewportSize or Vector2.new(1280, 720)
    local touch = UserInputService.TouchEnabled and not UserInputService.MouseEnabled

    local insetTop = 0
    local ok, top = pcall(function()
        return (GuiService:GetGuiInset())
    end)
    if ok and top then insetTop = top.Y end

    -- Compact is about available room, not about being a phone: a small window
    -- on a desktop has exactly the same problem.
    -- Ignore the degenerate viewport the camera reports before it is ready.
    if vp.X < 64 or vp.Y < 64 then return end

    local compact = vp.X < 900 or vp.Y < 500

    local changed = compact ~= current.compact
        or vp ~= current.viewport
        or touch ~= current.touch

    current.viewport = vp
    current.compact = compact
    current.touch = touch
    current.inset = insetTop

    if changed then
        Layout.changed:Fire(current)
    end
end

function Layout.start()
    Layout.recompute()
    -- The camera can take several frames to report a real size. Keep asking
    -- until it does, then stop.
    task.spawn(function()
        for _ = 1, 120 do
            local cam = Workspace.CurrentCamera
            if cam and cam.ViewportSize.X > 64 then
                Layout.recompute()
                break
            end
            task.wait(0.1)
        end
    end)
    local camera = Workspace.CurrentCamera
    if camera then
        camera:GetPropertyChangedSignal("ViewportSize"):Connect(Layout.recompute)
    end
    Workspace:GetPropertyChangedSignal("CurrentCamera"):Connect(function()
        Layout.recompute()
        local cam = Workspace.CurrentCamera
        if cam then
            cam:GetPropertyChangedSignal("ViewportSize"):Connect(Layout.recompute)
        end
    end)
end

return Layout
