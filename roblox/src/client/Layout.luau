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

-- ── The menu rail, and everything that has to stay clear of it ────────────
--
-- ONE OWNER FOR NUMBERS TWO FILES BOTH NEED.
--
-- ArenaHud draws the menu. Hud draws the toast column and has to stay out of
-- its way. Duplicating the arithmetic leaves two copies to drift the moment a
-- tab is added; having Hud require ArenaHud points the small module at the big
-- one for a couple of integers. So it lives here, where both already look.
--
-- WHY THE MENU IS A VERTICAL RAIL ON THE RIGHT.
--
-- It was a horizontal strip of nine unlabelled icons across the top, and two
-- things were wrong with that. A row of pictograms is a memory test — 🔧 and
-- 🎁 and 🛡️ mean nothing until you have opened each one — and across the top
-- it was competing with the round clock, the stat card and the Glob readout
-- for the most valuable strip of screen there is. Down the right-hand edge
-- there is room for the ICON AND ITS NAME on every row, the list reads
-- top-to-bottom like a menu should, and it grows downward without pushing
-- anything sideways.
local menuTabs = 8

function Layout.setMenuTabs(n: number)
    if n == menuTabs then return end
    menuTabs = n
    Layout.changed:Fire(current)
end

--- Geometry of the right-hand menu: a header button, and the list it drops.
---
--- ── WHY THE LIST DOES NOT SIT UNDER THE BUTTON ON A PHONE ────────────────
---
--- Roblox reserves the bottom-right 160x160 of a touch screen for the jump
--- button. On a 568x320 landscape phone that is the entire right-hand column
--- below y=160 — which is exactly where a right-anchored dropdown wants to go.
--- Eight labelled rows need about 400px of height and there are only ~120
--- above the jump zone, so a list that dropped straight down would put six of
--- its eight rows somewhere a thumb physically cannot reach.
---
--- So on touch the list opens to the LEFT of its button, into the middle of
--- the screen, which is the one large region nothing else claims. The button
--- stays top-right where the request put it, the list is still a vertical
--- column of names, and every row is reachable. On a desktop there are no
--- reserved zones and it simply drops underneath.
function Layout.menuMetrics(tabCount: number?)
    local count = tabCount or menuTabs
    local compact = current.compact
    local touch = current.touch
    local u = Layout.usable()

    local rowH = compact and 34 or 42
    local gap = compact and 3 or 5
    local pad = compact and 6 or 9
    local width = math.min(compact and 158 or 210, math.floor(u.X * 0.36))
    local headerH = Layout.MIN_TAP
    local top = compact and 6 or 12
    local right = compact and 6 or 12

    -- Where the list may start, and how much room it has.
    local listTop = top + headerH + (compact and 4 or 6)
    local listRight = right
    if touch then
        -- Clear of the jump column entirely.
        listRight = math.max(right, Layout.JUMP_BUTTON.X + 10)
    end
    -- STOPS ABOVE THE HOTBAR. The three power buttons live on the bottom edge
    -- and are the controls a player is actually holding; a dropdown that ran
    -- over them would cover the game to show a menu.
    local hotbarBand = (compact and 62 or 84) + (compact and 12 or 24) + 10
    local avail = u.Y - listTop - hotbarBand
    if touch and not compact then
        -- An iPad: the thumbstick and jump button are still reserved, but
        -- there is height to spare, so the list drops normally and simply
        -- stops above the jump zone.
        avail = math.min(avail, u.Y - Layout.JUMP_BUTTON.Y - listTop - 10)
    end
    local wanted = count * rowH + (count - 1) * gap + pad * 2
    local listH = math.max(rowH * 2, math.min(wanted, avail))

    return {
        rowH = rowH,
        gap = gap,
        pad = pad,
        width = width,
        headerH = headerH,
        top = top,
        right = right,
        listTop = listTop,
        listRight = listRight,
        listH = listH,
        -- True when the list had to be shortened, so it needs to scroll.
        scrolls = wanted > listH + 1,
    }
end

--- X of the first pixel the menu HEADER occupies. Nothing persistent may be
--- drawn at or past it.
function Layout.menuLeft(tabCount: number?): number
    local m = Layout.menuMetrics(tabCount)
    return Layout.usable().X - m.width - m.right
end

--- Y of the first free pixel under the top-left stat column — the stat card,
--- the Glob readout and the season line, which stack there.
function Layout.belowStatCard(): number
    return current.compact and 118 or 162
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
