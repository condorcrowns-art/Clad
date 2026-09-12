--!nolint
-- mobile_test.luau — does the UI survive a phone?

local svc, env = _G.SVC, _G.ENV
local G = require("geometry")
local V3 = env.Vector3
local sched = env.scheduler

local fails = 0
local function check(label, cond, detail)
    if cond then emit(("    ok    %s"):format(label))
    else fails += 1; emit(("    FAIL  %s   %s"):format(label, detail or "")) end
end
local function tick(sec, dt)
    dt = dt or 0.25
    for _ = 1, math.floor(sec / dt) do
        sched.step(dt); svc.heartbeat(dt); svc.renderStep(dt)
    end
end

-- Real device viewports Roblox actually reports, landscape.
-- The first entries are DEGENERATE ON PURPOSE. Roblox reports ViewportSize as
-- (0, 0) for the first frames before the camera initialises, and every layout
-- function subtracts button widths from it. That produced
-- math.clamp(x, 8, -76) -> "invalid argument #3 to clamp", a hard error that
-- aborted the entire layout pass and left the HUD scattered. It shipped.
local DEGENERATE = {
    { name = "camera not ready", w = 0,  h = 0 },
    { name = "one pixel",        w = 1,  h = 1 },
    { name = "absurdly narrow",  w = 40, h = 900 },
    { name = "absurdly short",   w = 900, h = 40 },
}

local DEVICES = {
    { name = "iPhone SE",        w = 568,  h = 320, touch = true  },
    { name = "iPhone 14",        w = 736,  h = 380, touch = true  },
    { name = "Android midrange", w = 640,  h = 360, touch = true  },
    { name = "iPad",             w = 1024, h = 768, touch = true  },
    { name = "Desktop 1080p",    w = 1920, h = 1080, touch = false },
}

-- Roblox reserves screen space for touch controls: a thumbstick bottom-left and
-- a jump button bottom-right.
--
-- This rule applies to the PERSISTENT HUD only. A button inside a dialog may
-- sit over those zones quite legitimately: the HUD ScreenGui has DisplayOrder
-- 10, so it renders and receives input above Roblox's touch-control GUI, and
-- the player is not steering while a dialog is open. Enforcing the rule on
-- dialogs would have forced every modal into a 178px-wide strip between the
-- thumbstick and the jump button, which is not a real constraint.
local MODALS
local function touchZones(w, h)
    return {
        { name = "thumbstick", x = 0,       y = h - 190, w = 230, h = 190 },
        { name = "jump button", x = w - 160, y = h - 160, w = 160, h = 160 },
    }
end

_G.BOOT_SERVER()
tick(1)
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 10))
tick(2)
svc.enterClientMode(alice)
_G.BOOT_CLIENT()
tick(2)

-- EVERY ScreenGui, not one of them. This test audited only "GoobHud" and so
-- reported a clean bill of health for a phone screen while an entire second
-- HUD — the dock, the stat card, the power button, the sheet — was not being
-- looked at at all. A geometry audit that cannot see half the geometry is
-- worse than no audit, because it is believed.
local playerGui = alice:FindFirstChild("PlayerGui")
local huds = {}
for _, child in ipairs(playerGui:GetChildren()) do
    if child.ClassName == "ScreenGui" then
        table.insert(huds, child)
    end
end
if #huds == 0 then emit("  no HUD; aborting") return end
local hud = huds[1]
emit(("  auditing %d ScreenGui(s):"):format(#huds))
for _, h in ipairs(huds) do emit("    " .. h.Name) end

local function openEverything()
    for _, h in ipairs(huds) do
        for _, d in ipairs(h:GetDescendants()) do
            if d:IsA("TextButton") then
                local name = tostring(d.Name)
                -- The drawer toggle, and every tab on the dock. Opening one
                -- closes the last, so this ends with a sheet up rather than
                -- six of them, which is exactly the contract being tested.
                if tostring(d.Text):find("GOOBS") or name:find("^Dock_") then
                    d.Activated:Fire()
                end
            end
        end
    end
    tick(1)
end

-- The audit above deliberately leaves a panel OPEN, which means the state
-- players actually spend the game in — nothing open — was never measured. A
-- mutation that stopped the sheet hiding on close went undetected because of
-- it. Close everything and look again.
local function closeEverything()
    for _, h in ipairs(huds) do
        for _, d in ipairs(h:GetDescendants()) do
            if d:IsA("TextButton") and (d.Text == "✕" or tostring(d.Name) == "SkipCoach") then
                d.Activated:Fire()
            end
        end
    end
    tick(1)
end

emit("")
emit("══ DEGENERATE VIEWPORTS MUST NOT CRASH THE LAYOUT ══")
for _, dev in ipairs(DEGENERATE) do
    for _, touch in ipairs({ true, false }) do
        svc.setTouch(touch)
        local ok, err = pcall(function()
            svc.setViewport(dev.w, dev.h)
            tick(1)
            openEverything()
        end)
        check(("%s %dx%d (%s) survives"):format(dev.name, dev.w, dev.h,
            touch and "touch" or "mouse"), ok, tostring(err))
    end
end
-- Return to something sane before the real device sweep.
svc.setViewport(1280, 720)
tick(1)

for _, dev in ipairs(DEVICES) do
    emit("")
    emit(("══ %s  (%dx%d%s) ══"):format(dev.name, dev.w, dev.h, dev.touch and ", touch" or ""))
    svc.setTouch(dev.touch)
    svc.setViewport(dev.w, dev.h)
    tick(2)

    -- Fill the toast stack ON PURPOSE. The audit used to measure whatever the
    -- HUD happened to be showing, which was a quiet one — so it never saw that
    -- the stack had no limit and ran two hundred pixels off the bottom of a
    -- 568x320 phone. A HUD has to survive its own noisiest moment, and this is
    -- the only way to measure that moment.
    local notify = svc.ReplicatedStorage:FindFirstChild("GoobNet")
    notify = notify and notify:FindFirstChild("Notify")
    if notify then
        for i = 1, 8 do
            notify:FireClient(alice,
                ("Notice %d — a long one, because the worst case is a long one."):format(i),
                "info")
        end
    end
    tick(1)
    openEverything()

    local boxes = {}
    for _, h in ipairs(huds) do
        for _, b in ipairs(G.resolve(h, dev.w, dev.h, svc.topInset)) do
            table.insert(boxes, b)
        end
    end

    -- A parked-off-screen panel must not be left visible.
    for _, b in ipairs(boxes) do
        if b.name == "GoobDrawer" then
            check("drawer visibility matches whether it is on screen",
                (not b.visible) or (b.x > -5),
                ("visible=%s x=%d"):format(tostring(b.visible), math.floor(b.x)))
        end
    end

    -- Content inside a ScrollingFrame is SUPPOSED to extend past its parent —
    -- that is what scrolling is. Counting it as overflow reported four
    -- phantom failures for a list that was working exactly as designed.
    local function inScroller(inst)
        local n = inst and inst.Parent
        while n and n.ClassName ~= "ScreenGui" do
            if n.ClassName == "ScrollingFrame" then return true end
            n = n.Parent
        end
        return false
    end
    local onScreenBoxes = {}
    for _, b in ipairs(boxes) do
        if not inScroller(b.inst) then table.insert(onScreenBoxes, b) end
    end

    -- 1. Nothing visible may hang off the screen.
    local bad = G.offscreen(onScreenBoxes, dev.w, dev.h, true)
    local worst = bad[1]
    check("all visible UI fits on screen",
        #bad == 0,
        worst and ("%d element(s) overflow; worst: %s %s (in %s) by %dpx")
            :format(#bad, worst.box.class, worst.box.name,
                    worst.box.inst.Parent and worst.box.inst.Parent.Name or "?",
                    math.floor(worst.over)) or "")

    -- 2. Persistent HUD controls must not sit under the touch controls.
    MODALS = {
        GulpConfirm = true, RenameDialog = true, TradeWindow = true,
        TradeRequestStrip = true, GoobDrawer = true,
    }
    -- "Sheet" is modal by construction: it is the only thing on screen when
    -- it is up, and it deliberately covers the touch zones on a phone.
    MODALS.Sheet = true
    local function insideModal(inst)
        local n = inst
        while n and n.ClassName ~= "ScreenGui" and n ~= nil do
            if MODALS[n.Name] then return true end
            n = n.Parent
        end
        return false
    end

    if dev.touch then
        local zones = touchZones(dev.w, dev.h)
        local blocked = {}
        for _, b in ipairs(boxes) do
            if b.visible and b.class == "TextButton" and b.w > 0 and not insideModal(b.inst) then
                for _, z in ipairs(zones) do
                    if G.overlaps(b, z.x, z.y, z.w, z.h) then
                        table.insert(blocked, b.name .. " under " .. z.name)
                    end
                end
            end
        end
        check("no persistent HUD button under the thumbstick or jump button",
            #blocked == 0, table.concat(blocked, ", "))
        local lowest = {}
        for _, h in ipairs(huds) do
            if (h.DisplayOrder or 0) <= 0 then table.insert(lowest, h.Name) end
        end
        check("every HUD renders above the touch controls (DisplayOrder)",
            #lowest == 0, table.concat(lowest, ", "))
    end

    -- 3. Tap targets need to be physically hittable with a thumb.
    if dev.touch then
        local tiny = {}
        for _, b in ipairs(boxes) do
            if b.visible and b.class == "TextButton" and b.w > 0 and b.h > 0 then
                if b.h < 34 or b.w < 34 then
                    table.insert(tiny, ("%s %dx%d"):format(b.name, math.floor(b.w), math.floor(b.h)))
                end
            end
        end
        check("every tap target is at least 34px", #tiny == 0,
            table.concat(tiny, ", "):sub(1, 120))
    end

    -- A fully transparent frame with no text of its own paints nothing: it is
    -- a positioning container, like the full-screen holder the toasts stack
    -- inside. Counting those as "UI" put screen coverage at 128% and reported
    -- every single element as overlapping the toast holder. What matters is
    -- what a player can actually SEE on top of something else.
    local function paints(b)
        local inst = b.inst
        local bg = inst.BackgroundTransparency
        if bg ~= nil and bg < 0.95 then return true end
        local text = inst.Text
        if text ~= nil and text ~= "" then return true end
        return false
    end

    -- 4. The HUD must not swallow the whole screen.
    local uiArea, screenArea = 0, dev.w * dev.h
    for _, b in ipairs(boxes) do
        -- Modals excluded, for the same reason they are excluded from the
        -- touch-zone rule: an open dialog is ALLOWED to cover the screen.
        -- What must not swallow the screen is the persistent chrome.
        if b.visible and b.depth == 0 and b.w > 0 and paints(b)
            and not insideModal(b.inst) then
            uiArea += b.w * b.h
        end
    end
    check("top-level UI covers under 70% of the screen",
        uiArea / screenArea < 0.70,
        ("%.0f%%"):format(uiArea / screenArea * 100))

    -- 5. THE COMPLAINT, AS AN ASSERTION.
    --
    -- "everything gets in the way of everything." Nothing above catches that:
    -- two panels can each fit the screen perfectly, clear every touch zone and
    -- still be drawn on top of one another. So check it directly — no two
    -- persistent, non-modal, top-level elements may overlap, across every HUD
    -- at once.
    -- "Top level" has to mean VISUALLY top level, not depth == 0. A toast sits
    -- inside a fully transparent holder, so by depth it is a child and by eye
    -- it is floating on the screen — which is how a mutation that put the
    -- toast stack back on top of the Glob balance went undetected. An element
    -- counts if it paints and every ancestor up to the ScreenGui does not.
    local function visuallyTop(b)
        if not paints(b) then return false end
        local n = b.inst.Parent
        while n and n.ClassName ~= "ScreenGui" do
            local bg = n.BackgroundTransparency
            if bg ~= nil and bg < 0.95 then return false end
            n = n.Parent
        end
        return true
    end

    local persistent = {}
    for _, b in ipairs(boxes) do
        if b.visible and b.w > 4 and b.h > 4
            and visuallyTop(b) and not insideModal(b.inst) then
            table.insert(persistent, b)
        end
    end
    local collisions = {}
    for i = 1, #persistent do
        for j = i + 1, #persistent do
            local a, c = persistent[i], persistent[j]
            if G.overlaps(a, c.x, c.y, c.w, c.h) then
                table.insert(collisions, a.name .. " over " .. c.name)
            end
        end
    end
    check("no two persistent HUD elements overlap each other",
        #collisions == 0, table.concat(collisions, ", "):sub(1, 160))

    -- 6. THE RESTING STATE. Everything above ran with a panel open. This is
    -- the screen a player looks at for the other ninety-nine percent of the
    -- session, and a panel that forgets to hide itself is invisible to every
    -- check that only ever measures the open state.
    closeEverything()
    tick(1)
    local closedBoxes = {}
    for _, h in ipairs(huds) do
        for _, b in ipairs(G.resolve(h, dev.w, dev.h, svc.topInset)) do
            table.insert(closedBoxes, b)
        end
    end
    local stillUp = {}
    for _, b in ipairs(closedBoxes) do
        if b.visible and (b.name == "Sheet" or b.name == "GoobDrawer") then
            table.insert(stillUp, b.name)
        end
    end
    check("every panel is actually hidden when closed",
        #stillUp == 0, table.concat(stillUp, ", "))

    local badClosed = {}
    for _, b in ipairs(G.offscreen(closedBoxes, dev.w, dev.h, true)) do
        if not inScroller(b.box.inst) then table.insert(badClosed, b) end
    end
    check("the resting screen fits too", #badClosed == 0,
        badClosed[1] and ("%d overflow; worst: %s by %dpx")
            :format(#badClosed, badClosed[1].box.name, math.floor(badClosed[1].over)) or "")

    -- Re-open for the next device, so the loop keeps testing the open state.
    openEverything()
end

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL MOBILE CHECKS PASSED" or (fails .. " FAILURE(S)")))
