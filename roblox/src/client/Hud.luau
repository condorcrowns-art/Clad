--!strict
-- Hud.luau — toasts, and the client's copy of the profile.
--
-- THIS FILE KEEPS SHRINKING, AND THAT IS THE POINT.
--
-- It was 912 lines: a stat panel, a Snack Stand, an egg button, a sliding "MY
-- GOOBS" drawer and a four-tab strip inside it — the entire screen of the
-- collection game the arena replaced. That went when the shops did. What was
-- left was toasts and a first-run tutorial coach; the coach has now gone too.
--
-- WHY THE COACH WENT. It was five steps in a banner across the top of the
-- screen, and on a landscape phone it competed for the one free horizontal
-- band with the round clock — the two took turns hiding each other, which is
-- what the player saw as "the tutorial is overlapping weirdly". The deeper
-- problem is that it was explaining a game that explains itself: eat the small
-- ones, run from the big ones, biggest at the buzzer wins. A player learns
-- that from one round. A banner that teaches what the first thirty seconds
-- teach anyway is pure cost.
--
-- What is left is the one thing that was never duplicated anywhere else:
--
--   * TOASTS — the notification column.
--   * THE STATE — one client-side copy of the last profile push, which
--     ArenaHud, TradeUi and the gulp confirmation all read.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Shared = game.ReplicatedStorage.GoobShared
local Format = require(Shared.Format)

local Theme = require(script.Parent.Theme)
local Layout = require(script.Parent.Layout)

local player = Players.LocalPlayer
local Hud = {}

local gui: ScreenGui
local toastHolder: Frame

local state: any = nil

-- ── Toasts ─────────────────────────────────────────────────────────────────

local TOAST_COLOR = {
    info = Theme.ACCENT, good = Theme.GOOD, warn = Theme.WARN, bad = Theme.BAD,
    trade = Theme.GOLD, secret = Theme.TEXT,
}

-- How many toasts may be stacked at once.
--
-- The holder is a fixed-height column with a list layout, so nothing stopped
-- the stack growing past the bottom of the screen — and on a 568x320 phone
-- three toasts ran 200px off it. Oldest goes when a new one arrives, which is
-- also the right behaviour: the newest message is the one you need.
Hud.MAX_TOASTS = 3

function Hud.toast(message: string, kind: string?)
    local color = TOAST_COLOR[kind or "info"] or Theme.ACCENT

    if toastHolder then
        local live = {}
        for _, child in ipairs(toastHolder:GetChildren()) do
            if child:IsA("Frame") then table.insert(live, child) end
        end
        local allowed = Layout.isCompact() and 2 or Hud.MAX_TOASTS
        while #live >= allowed do
            local oldest = table.remove(live, 1)
            if oldest then oldest:Destroy() end
        end
    end

    local compact = Layout.isCompact()
    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 0, compact and 34 or 46)
    frame.BackgroundColor3 = Theme.PANEL
    frame.BackgroundTransparency = 0.02
    Theme.corner(frame, 10)
    Theme.stroke(frame, color, 2)

    local text = Theme.label({
        Size = UDim2.new(1, -20, 1, 0),
        Position = UDim2.fromOffset(12, 0),
        Text = message,
        TextColor3 = color,
        TextSize = compact and 15 or 19,
        TextWrapped = true,
        TextYAlignment = Enum.TextYAlignment.Center,
    })
    text.Parent = frame
    frame.Parent = toastHolder

    frame.Position = UDim2.new(1, 40, 0, 0)
    TweenService:Create(frame, TweenInfo.new(0.24, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
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
-- One thing to place now. The toast column hangs under the top-left stat card,
-- on the OPPOSITE side of the screen from ArenaHud's menu — which lives down
-- the right-hand edge — so the two can never collide however many tabs the
-- menu grows or however long a notification is.

function Hud.applyLayout()
    if not gui then return end
    local u = Layout.usable()
    local compact = Layout.isCompact()
    local pad = compact and 8 or 14

    local toastW = compact and math.min(230, math.floor(u.X * 0.42)) or 330
    local toastH = compact and 80 or 200
    toastHolder.Size = UDim2.fromOffset(toastW, toastH)
    toastHolder.Position = UDim2.fromOffset(pad, Layout.belowStatCard())
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

    toastHolder = Instance.new("Frame")
    toastHolder.Name = "Toasts"
    toastHolder.BackgroundTransparency = 1
    toastHolder.Parent = gui

    local toastLayout = Instance.new("UIListLayout")
    toastLayout.Padding = UDim.new(0, 6)
    toastLayout.VerticalAlignment = Enum.VerticalAlignment.Top
    toastLayout.Parent = toastHolder

    Layout.start()
    Hud.applyLayout()
    Layout.changed.Event:Connect(Hud.applyLayout)

    return gui
end

-- ── Live update ────────────────────────────────────────────────────────────

function Hud.update(snap: any)
    state = snap
end

--- Formatted Glob, for anything that wants to print it without re-deriving the
--- format.
function Hud.globText(): string
    return state and Format.short(state.glob) or "0"
end

-- ── Wired up by init.client ────────────────────────────────────────────────

Hud.tradeOpen = false
Hud.onGulp = function(_: string) end
Hud.onOffer = function(_: string) end
Hud.onRename = function(_: string) end
Hud.onSetActive = function(_: string) end

function Hud.getState() return state end

function Hud.setTradeOpen(open: boolean)
    Hud.tradeOpen = open
end

return Hud
