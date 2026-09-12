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

local hud = alice:FindFirstChild("PlayerGui"):FindFirstChild("GoobHud")
if not hud then emit("  no HUD; aborting") return end

local function openEverything()
    for _, d in ipairs(hud:GetDescendants()) do
        if d:IsA("TextButton") and tostring(d.Text):find("GOOBS") then
            d.Activated:Fire()
        end
    end
    tick(1)
end

for _, dev in ipairs(DEVICES) do
    emit("")
    emit(("══ %s  (%dx%d%s) ══"):format(dev.name, dev.w, dev.h, dev.touch and ", touch" or ""))
    svc.setTouch(dev.touch)
    svc.setViewport(dev.w, dev.h)
    tick(2)
    openEverything()

    local boxes = G.resolve(hud, dev.w, dev.h, svc.topInset)

    -- A parked-off-screen panel must not be left visible.
    for _, b in ipairs(boxes) do
        if b.name == "GoobDrawer" then
            check("drawer visibility matches whether it is on screen",
                (not b.visible) or (b.x > -5),
                ("visible=%s x=%d"):format(tostring(b.visible), math.floor(b.x)))
        end
    end

    -- 1. Nothing visible may hang off the screen.
    local bad = G.offscreen(boxes, dev.w, dev.h, true)
    local worst = bad[1]
    check("all visible UI fits on screen",
        #bad == 0,
        worst and ("%d element(s) overflow; worst: %s %s by %dpx")
            :format(#bad, worst.box.class, worst.box.name, math.floor(worst.over)) or "")

    -- 2. Persistent HUD controls must not sit under the touch controls.
    local MODALS = {
        GulpConfirm = true, RenameDialog = true, TradeWindow = true,
        TradeRequestStrip = true, GoobDrawer = true,
    }
    local function insideModal(inst)
        local n = inst
        while n and n ~= hud do
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
        check("HUD renders above the touch controls (DisplayOrder)",
            (hud.DisplayOrder or 0) > 0, tostring(hud.DisplayOrder))
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

    -- 4. The HUD must not swallow the whole screen.
    local uiArea, screenArea = 0, dev.w * dev.h
    for _, b in ipairs(boxes) do
        if b.visible and b.depth == 0 and b.w > 0 then uiArea += b.w * b.h end
    end
    check("top-level UI covers under 70% of the screen",
        uiArea / screenArea < 0.70,
        ("%.0f%%"):format(uiArea / screenArea * 100))
end

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL MOBILE CHECKS PASSED" or (fails .. " FAILURE(S)")))
