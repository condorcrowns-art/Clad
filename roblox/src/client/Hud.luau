--!strict
-- Hud.luau — toasts, the first-run coach, and the client's copy of the profile.
--
-- WHAT THIS FILE USED TO BE, AND WHY IT IS NOT ANYMORE.
--
-- This was a 900-line screen: a stat panel, a Snack Stand, an egg button, a
-- sliding "MY GOOBS" drawer, and a four-tab strip inside it. All of it was
-- built for the game that existed before the arena — one where you stood on a
-- plot, watched an income number, and spent it at a shop.
--
-- The arena replaced that game and ArenaHud replaced that screen. What did not
-- happen is the deletion. Both screens stayed, and the dock's SEASON tab still
-- reached back through `openLegacy` to open this drawer — which meant pressing
-- "BETA SEASON" rendered the season track INSIDE the old drawer, with the
-- Snack Stand reparented on top of it, because `applyLayout` moved the stand
-- into the drawer whenever arena mode was on. That is the overlapping panel in
-- the bug report: a season list with "Snack 💧113 / Feast 💧564 / Banquet
-- 💧2.26K" sitting across it. Not a layout bug. Two games sharing a screen.
--
-- So the drawer is gone, the shops are gone with the systems that fed them,
-- and ArenaHud's sheet is now the only panel in the game. What is left here is
-- the part that was never duplicated:
--
--   * TOASTS — the notification column, top-right.
--   * THE COACH — the first-run tutorial banner, which points at controls
--     other modules own through Hud.targets.
--   * THE STATE — one client-side copy of the last profile push, which
--     ArenaHud, TradeUi and the gulp confirmation all read.
--
-- There is deliberately no stat panel here. ArenaHud draws mass, worth and
-- Glob; a second HUD drawing the same numbers a tick out of step is how you
-- get two readouts disagreeing on screen.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")

local Shared = game.ReplicatedStorage.GoobShared
local Format = require(Shared.Format)

local Theme = require(script.Parent.Theme)
local Layout = require(script.Parent.Layout)

local player = Players.LocalPlayer
local Hud = {}

local gui: ScreenGui
local toastHolder: Frame
local coach: Frame
local coachText: TextLabel
local coachHint: TextLabel
local coachStep: TextLabel
local pulseTarget: GuiObject? = nil
local pulseClock = 0

local state: any = nil

-- ── Toasts ─────────────────────────────────────────────────────────────────

local TOAST_COLOR = {
    info = Theme.ACCENT, good = Theme.GOOD, warn = Theme.WARN, bad = Theme.WARN,
    trade = Theme.GOLD, secret = Color3.fromRGB(255, 255, 255),
}

-- How many toasts may be stacked at once.
--
-- The holder is a fixed-height column with a list layout, so nothing stopped
-- the stack growing past the bottom of the screen — and on a 568x320 phone
-- three toasts ran 200px off it. Nobody caught it because the geometry audit
-- had never generated a toast; it measured a HUD that happened to be quiet.
-- Oldest goes when a new one arrives, which is also the right behaviour: the
-- newest message is the one you need.
Hud.MAX_TOASTS = 3

function Hud.toast(message: string, kind: string?)
    local color = TOAST_COLOR[kind or "info"] or Theme.ACCENT

    if toastHolder then
        local live = {}
        for _, child in ipairs(toastHolder:GetChildren()) do
            if child:IsA("Frame") then table.insert(live, child) end
        end
        -- ONE on compact. The band above the power button is a single row
        -- tall; a second toast rendered straight over the button.
        local allowed = Layout.isCompact() and 1 or Hud.MAX_TOASTS
        while #live >= allowed do
            local oldest = table.remove(live, 1)
            if oldest then oldest:Destroy() end
        end
    end

    local frame = Instance.new("Frame")
    -- Shorter on compact. The band between the coach and the power button is
    -- about 70px on a landscape phone; two 46px cards do not fit in it and the
    -- second one landed on the power button.
    frame.Size = UDim2.new(1, 0, 0, Layout.isCompact() and 32 or 46)
    frame.BackgroundColor3 = Theme.PANEL
    frame.BackgroundTransparency = 0.06
    Theme.corner(frame)
    Theme.stroke(frame, color, 3)

    local text = Theme.label({
        Size = UDim2.new(1, -20, 1, 0),
        Position = UDim2.fromOffset(12, 0),
        Text = message,
        TextColor3 = color,
        TextSize = Layout.isCompact() and 14 or 19,
        TextWrapped = true,
        TextYAlignment = Enum.TextYAlignment.Center,
    })
    text.Parent = frame
    frame.Parent = toastHolder

    -- Slide in, hold, fade out. A Secret announcement holds longer because it
    -- is a call to action, not a receipt.
    frame.Position = UDim2.new(1, 40, 0, 0)
    TweenService:Create(frame, TweenInfo.new(0.28, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
        Position = UDim2.new(0, 0, 0, 0),
    }):Play()

    local hold = (kind == "secret") and 6 or 3.2
    task.delay(hold, function()
        if not frame.Parent then return end
        local out = TweenService:Create(frame, TweenInfo.new(0.3), {
            Position = UDim2.new(1, 60, 0, 0), BackgroundTransparency = 1,
        })
        out.Completed:Connect(function() frame:Destroy() end)
        out:Play()
    end)
end

-- ── Layout ─────────────────────────────────────────────────────────────────
--
-- Two things to place. The toast column hangs off the top-right under the Glob
-- readout ArenaHud owns; the coach sits below ArenaHud's dock, never on it.

function Hud.applyLayout()
    if not gui then return end
    local u = Layout.usable()
    local compact = Layout.isCompact()

    -- ── THE ONE FREE COLUMN ON A PHONE ────────────────────────────────────
    --
    -- A 568x320 landscape phone has the dock and stat card across the top, the
    -- power button at the bottom, and Roblox's own thumbstick and jump button
    -- claiming the bottom-left and bottom-right corners outright. What is left
    -- is a single vertical column between those two touch zones — the same
    -- column the power button already lives in, and the only place a transient
    -- panel can go without landing somewhere a thumb is or cannot reach.
    --
    -- So on compact BOTH the coach and the toast column are constrained to it,
    -- stacked: coach directly under the dock, toasts directly above the power
    -- button. Off a phone there is room for the usual thing — coach centred,
    -- toasts down the right-hand side.
    local gapL, gapR = Layout.bottomGap()
    local colW = math.max(120, gapR - gapL - 8)
    local colX = gapL + 4
    local powerTop = u.Y - (compact and 76 or 92) - (compact and 14 or 26)

    -- ── The coach ──────────────────────────────────────────────────────────
    --
    -- ArenaHud hides its status strip while this is up on compact, so the two
    -- are never both trying to occupy the band under the dock.
    local coachTop = Layout.belowDock()
    local coachH = compact and 48 or 84
    if coach then
        local cw = compact and math.min(300, colW) or 460
        coach.Size = UDim2.fromOffset(cw, coachH)
        local x = compact and (colX + math.floor((colW - cw) / 2))
            or math.floor((u.X - cw) / 2)
        coach.Position = UDim2.fromOffset(Layout.fit(x, 8, math.max(8, u.X - cw - 8)), coachTop)

        -- On compact the step counter goes: three stacked lines do not fit in
        -- 48px, and "STEP 2 OF 5" is the least useful of the three.
        coachStep.Visible = not compact
        coachStep.Position = UDim2.fromOffset(14, 6)
        coachStep.Size = UDim2.new(1, -60, 0, 16)
        coachText.Position = UDim2.fromOffset(10, compact and 3 or 22)
        coachText.Size = UDim2.new(1, -(compact and 62 or 28), 0, compact and 22 or 30)
        coachText.TextSize = compact and 13 or 20
        coachHint.Position = UDim2.fromOffset(10, compact and 25 or 54)
        coachHint.Size = UDim2.new(1, -(compact and 62 or 28), 0, compact and 18 or 26)
        coachHint.TextSize = compact and 10 or 14

        local skip = coach:FindFirstChild("SkipCoach") :: TextButton?
        if skip then
            -- FULL SIZE, even though it is only a dismiss button. It was
            -- 28x28, under the 34px floor a thumb needs, and the audit flagged
            -- it: a control a player cannot press is not a smaller control, it
            -- is an absent one.
            local tap = Layout.MIN_TAP
            skip.Size = UDim2.fromOffset(tap, tap)
            skip.Position = UDim2.fromOffset(cw - tap - 6,
                math.max(2, math.floor((coachH - tap) / 2)))
        end
    end

    -- ── Toasts ─────────────────────────────────────────────────────────────
    --
    -- The old position was a fixed 76px from the top, which on a phone put the
    -- column straight through ArenaHud's status strip and, further down, across
    -- the power button. Bottom-anchored above the power button on compact, so
    -- the stack grows AWAY from the one control the player is holding.
    local toastW = compact and math.min(240, colW) or 340
    local toastH = compact and 32 or 200
    local toastTop = compact
        and math.max(Layout.belowDock() + coachH + 6, powerTop - toastH - 4)
        or math.max(Layout.belowStatus(), coachTop + coachH + 8)
    toastHolder.Size = UDim2.fromOffset(toastW, toastH)
    toastHolder.Position = UDim2.fromOffset(
        compact and (colX + math.floor((colW - toastW) / 2))
            or (u.X - toastW - 14),
        toastTop)
end

-- ── Build ──────────────────────────────────────────────────────────────────

function Hud.build(): ScreenGui
    gui = Instance.new("ScreenGui")
    gui.Name = "GoobHud"
    gui.ResetOnSpawn = false
    -- false, NOT true: with IgnoreGuiInset = true the ScreenGui draws from the
    -- true top of the screen and the Roblox top bar covers the first ~36px.
    gui.IgnoreGuiInset = false
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    -- Above Roblox's own touch-control ScreenGui, so a dialog button placed
    -- over the jump button receives the tap instead of the jump button.
    gui.DisplayOrder = 10
    gui.Parent = player:WaitForChild("PlayerGui")

    -- The first-run coach. One instruction at a time, and deliberately NOT a
    -- modal: the player should be doing the thing while reading it, not
    -- dismissing a wall of text before they can move.
    coach = Instance.new("Frame")
    coach.Name = "Coach"
    coach.BackgroundColor3 = Theme.BG
    coach.BackgroundTransparency = 0.05
    coach.Visible = false
    coach.ZIndex = 20
    coach.Parent = gui
    Theme.corner(coach, 16)
    Theme.stroke(coach, Theme.GOLD, 3)

    coachStep = Theme.label({
        Name = "Step", Text = "", TextSize = 13,
        TextColor3 = Theme.GOLD, ZIndex = 21,
    })
    coachStep.Parent = coach

    coachText = Theme.label({
        Name = "Line", Text = "", TextSize = 20, ZIndex = 21,
        TextWrapped = true,
    })
    coachText.Parent = coach

    coachHint = Theme.label({
        Name = "Hint", Text = "", TextSize = 14,
        TextColor3 = Theme.TEXT_DIM, TextWrapped = true, ZIndex = 21,
    })
    coachHint.Parent = coach

    local skip = Theme.button("✖", Theme.BG_SOFT, UDim2.fromOffset(28, 28))
    skip.Name = "SkipCoach"
    skip.TextColor3 = Theme.TEXT_DIM
    skip.TextSize = 14
    skip.ZIndex = 21
    skip.Parent = coach
    skip.Activated:Connect(function() Hud.onDismissCoach() end)

    -- Toast column, top-right.
    toastHolder = Instance.new("Frame")
    toastHolder.Name = "Toasts"
    toastHolder.BackgroundTransparency = 1
    toastHolder.Parent = gui

    local toastLayout = Instance.new("UIListLayout")
    toastLayout.Padding = UDim.new(0, 8)
    toastLayout.VerticalAlignment = Enum.VerticalAlignment.Top
    toastLayout.Parent = toastHolder

    RunService.RenderStepped:Connect(function(dt)
        -- Pulse the coached control, and restore the stroke on whatever was
        -- pulsing before so a button never stays stuck mid-glow. The registry
        -- is walked rather than a hardcoded list of this file's own buttons —
        -- which is what broke the last version: the only controls it knew how
        -- to point at were the Snack Stand and the drawer, and by then the
        -- steps that needed a pointer were all on ArenaHud.
        pulseClock += dt
        for _, control in pairs(Hud.targets) do
            if control ~= pulseTarget and control.Parent then
                local st = control:FindFirstChildOfClass("UIStroke")
                if st then st.Thickness = 3 end
            end
        end
        if pulseTarget then
            local st = pulseTarget:FindFirstChildOfClass("UIStroke")
            if st then
                st.Color = Theme.GOLD
                st.Thickness = 3 + math.abs(math.sin(pulseClock * 3)) * 4
            end
        end
    end)

    Layout.start()
    Hud.applyLayout()
    Layout.changed.Event:Connect(Hud.applyLayout)

    return gui
end

-- ── Live update ────────────────────────────────────────────────────────────

function Hud.update(snap: any)
    state = snap

    local tut = snap.tutorial
    if coach then
        if tut then
            coach.Visible = true
            coachStep.Text = ("STEP %d OF %d"):format(tut.index, tut.total)
                .. (tut.progress and ("   ·   " .. tut.progress) or "")
            coachText.Text = tut.text
            coachHint.Text = tut.hint or ""
            -- Resolved through the registry ONLY. There is no fallback chain
            -- anymore, because every control a step can name now belongs to
            -- ArenaHud and registers itself.
            pulseTarget = Hud.targets[tut.target or ""]
        else
            coach.Visible = false
            pulseTarget = nil
        end
    end
end

--- Formatted Glob, for anything that wants to print it without re-deriving the
--- format. Kept because two callers used to do this by hand and disagreed on
--- whether to round.
function Hud.globText(): string
    return state and Format.short(state.glob) or "0"
end

-- ── Wired up by init.client ────────────────────────────────────────────────

Hud.tradeOpen = false
Hud.onGulp = function(_: string) end
Hud.onOffer = function(_: string) end
Hud.onDismissCoach = function() end
Hud.onRename = function(_: string) end
Hud.onSetActive = function(_: string) end

-- Controls other modules own, which the tutorial coach may point at. ArenaHud
-- registers its power button here; anything else that a tutorial step names
-- must register too, or the step simply will not pulse anything.
Hud.targets = {} :: { [string]: GuiObject }

function Hud.registerTarget(name: string, control: GuiObject?)
    Hud.targets[name] = control
end

-- Kept as a no-op so the boot sequence reads the same and nothing has to know
-- that there is no longer a second screen to switch off. There is only one
-- HUD now; "arena mode" is the only mode.
Hud.arenaMode = true
function Hud.setArenaMode(_: boolean) end

function Hud.getState() return state end

function Hud.setTradeOpen(open: boolean)
    Hud.tradeOpen = open
end

return Hud
