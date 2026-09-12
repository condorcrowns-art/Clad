--!strict
-- Hud.luau — the heads-up display and the Goob drawer.
--
-- Layout philosophy: ONE always-visible number (your power), ONE always-visible
-- currency, and everything else behind a single big button. Kids bounce off
-- cluttered UI faster than they bounce off bad gameplay.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Shared = game.ReplicatedStorage.GoobShared
local Format = require(Shared.Format)
local Feedstock = require(Shared.Feedstock)
local Config = require(Shared.Config)
local Net = require(Shared.Net)

local Theme = require(script.Parent.Theme)

local player = Players.LocalPlayer
local Hud = {}

local gui: ScreenGui
local powerLabel: TextLabel
local globLabel: TextLabel
local incomeLabel: TextLabel
local ageLabel: TextLabel
local drawer: Frame
local drawerList: ScrollingFrame
local toastHolder: Frame
local drawerOpen = false
local snackButtons: { [string]: TextButton } = {}

local state: any = nil
local displayedGlob = 0

-- ── Toasts ─────────────────────────────────────────────────────────────────

local TOAST_COLOR = {
    info = Theme.ACCENT, good = Theme.GOOD, warn = Theme.WARN,
    trade = Theme.GOLD, secret = Color3.fromRGB(255, 255, 255),
}

function Hud.toast(message: string, kind: string?)
    local color = TOAST_COLOR[kind or "info"] or Theme.ACCENT

    local frame = Instance.new("Frame")
    frame.Size = UDim2.new(1, 0, 0, 46)
    frame.BackgroundColor3 = Theme.PANEL
    frame.BackgroundTransparency = 0.06
    Theme.corner(frame)
    Theme.stroke(frame, color, 3)

    local text = Theme.label({
        Size = UDim2.new(1, -20, 1, 0),
        Position = UDim2.fromOffset(12, 0),
        Text = message,
        TextColor3 = color,
        TextSize = 19,
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
        TweenService:Create(text, TweenInfo.new(0.3), { TextTransparency = 1 }):Play()
        out:Play()
        out.Completed:Wait()
        frame:Destroy()
    end)
end

-- ── Goob drawer ────────────────────────────────────────────────────────────

local function contentsSummary(contents: { [string]: number }): string
    local rows = {}
    for id, count in pairs(contents) do
        local item = Feedstock.get(id)
        if item then table.insert(rows, { name = item.name, count = count, mass = item.mass }) end
    end
    table.sort(rows, function(a, b) return a.mass * a.count > b.mass * b.count end)
    local out = {}
    for i = 1, math.min(3, #rows) do
        table.insert(out, ("%s ×%s"):format(rows[i].name, Format.comma(rows[i].count)))
    end
    if #rows > 3 then table.insert(out, ("+%d more"):format(#rows - 3)) end
    return #out > 0 and table.concat(out, " · ") or "empty — go catch something!"
end

local function buildCard(goob: any, index: number): Frame
    local card = Instance.new("Frame")
    card.Name = "Goob" .. index
    card.Size = UDim2.new(1, 0, 0, 118)
    card.BackgroundColor3 = goob.isActive and Theme.BG_SOFT or Theme.PANEL
    Theme.corner(card)
    Theme.stroke(card, goob.isActive and Theme.ACCENT or Color3.fromRGB(16, 18, 30), goob.isActive and 3 or 2)

    -- Colour chip showing the Goob's actual body hue, so the list matches what
    -- you see standing on the plot.
    local chip = Instance.new("Frame")
    chip.Size = UDim2.fromOffset(66, 66)
    chip.Position = UDim2.fromOffset(12, 12)
    chip.BackgroundColor3 = Color3.fromHSV(goob.hue, 0.55, 1)
    chip.Parent = card
    Theme.corner(chip, 33)
    Theme.stroke(chip, Color3.fromRGB(16, 18, 30), 3)

    local gen = Theme.label({
        Size = UDim2.fromScale(1, 1), Text = "G" .. goob.generation,
        TextSize = 22, TextXAlignment = Enum.TextXAlignment.Center,
        TextColor3 = Color3.fromRGB(25, 27, 40),
    })
    gen.Parent = chip

    local name = Theme.label({
        Position = UDim2.fromOffset(90, 10), Size = UDim2.new(1, -100, 0, 24),
        Text = goob.nickname, TextSize = 21,
    })
    name.Parent = card

    local stats = Theme.label({
        Position = UDim2.fromOffset(90, 36), Size = UDim2.new(1, -100, 0, 22),
        Text = ("⚡ %s   %s %s (×%.2f)   ⏳ %s")
            :format(goob.powerText, goob.ageEmoji, goob.ageTier, goob.ageMult, goob.ageText),
        TextSize = 16, TextColor3 = goob.ageColor,
    })
    stats.Parent = card

    local belly = Theme.label({
        Position = UDim2.fromOffset(90, 58), Size = UDim2.new(1, -100, 0, 20),
        Text = "🫧 " .. contentsSummary(goob.contents),
        TextSize = 14, TextColor3 = Theme.TEXT_DIM, TextTruncate = Enum.TextTruncate.AtEnd,
    })
    belly.Parent = card

    local row = Instance.new("Frame")
    row.Position = UDim2.fromOffset(90, 82)
    row.Size = UDim2.new(1, -102, 0, 28)
    row.BackgroundTransparency = 1
    row.Parent = card

    local layout = Instance.new("UIListLayout")
    layout.FillDirection = Enum.FillDirection.Horizontal
    layout.Padding = UDim.new(0, 6)
    layout.Parent = row

    if not goob.isActive then
        local show = Theme.button("👁 Display", Theme.ACCENT, UDim2.fromOffset(104, 28))
        show.TextSize = 15
        show.Parent = row
        show.Activated:Connect(function()
            Hud.onSetActive(goob.id)
        end)

        local gulp = Theme.button("😋 Gulp", Theme.BAD, UDim2.fromOffset(88, 28))
        gulp.TextSize = 15
        gulp.Parent = row
        gulp.Activated:Connect(function()
            Hud.onGulp(goob.id)
        end)
    else
        local rename = Theme.button("✏️ Rename", Theme.GOLD, UDim2.fromOffset(104, 28))
        rename.TextSize = 15
        rename.Parent = row
        rename.Activated:Connect(function() Hud.onRename(goob.id) end)
    end

    -- While a trade window is open, every card grows an "offer" button. This
    -- keeps the trade UI itself read-only, which means the list you are
    -- agreeing to and the list you are editing can never drift apart.
    if Hud.tradeOpen then
        local offer = Theme.button("➕ Offer", Theme.GOOD, UDim2.fromOffset(90, 28))
        offer.TextSize = 15
        offer.Parent = row
        offer.Activated:Connect(function() Hud.onOffer(goob.id) end)
    end

    return card
end

local function rebuildDrawer()
    if not state then return end
    for _, child in ipairs(drawerList:GetChildren()) do
        if child:IsA("Frame") then child:Destroy() end
    end
    -- Active Goob first, then by power descending.
    local sorted = table.clone(state.goobs)
    table.sort(sorted, function(a, b)
        if a.isActive ~= b.isActive then return a.isActive end
        return a.power > b.power
    end)
    for i, goob in ipairs(sorted) do
        local card = buildCard(goob, i)
        card.LayoutOrder = i
        card.Parent = drawerList
    end
    drawerList.CanvasSize = UDim2.new(0, 0, 0, #sorted * 126 + 8)
end

-- ── Build ──────────────────────────────────────────────────────────────────

function Hud.build(): ScreenGui
    gui = Instance.new("ScreenGui")
    gui.Name = "GoobHud"
    gui.ResetOnSpawn = false
    gui.IgnoreGuiInset = true
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    gui.Parent = player:WaitForChild("PlayerGui")

    -- Top-left: the two numbers that matter.
    local top = Instance.new("Frame")
    top.Size = UDim2.fromOffset(300, 108)
    top.Position = UDim2.fromOffset(16, 16)
    top.BackgroundColor3 = Theme.BG
    top.BackgroundTransparency = 0.12
    top.Parent = gui
    Theme.corner(top, 18)
    Theme.stroke(top, Color3.fromRGB(14, 16, 26), 3)

    powerLabel = Theme.label({
        Position = UDim2.fromOffset(16, 8), Size = UDim2.new(1, -24, 0, 40),
        Text = "⚡ 0", TextSize = 34, TextColor3 = Theme.GOLD,
    })
    powerLabel.Parent = top

    globLabel = Theme.label({
        Position = UDim2.fromOffset(16, 48), Size = UDim2.new(1, -24, 0, 26),
        Text = "💧 0", TextSize = 22, TextColor3 = Theme.ACCENT,
    })
    globLabel.Parent = top

    incomeLabel = Theme.label({
        Position = UDim2.fromOffset(16, 74), Size = UDim2.new(1, -24, 0, 22),
        Text = "+0 /sec", TextSize = 15, TextColor3 = Theme.TEXT_DIM,
    })
    incomeLabel.Parent = top

    ageLabel = Theme.label({
        Position = UDim2.fromOffset(16, 130), Size = UDim2.fromOffset(300, 24),
        Text = "", TextSize = 17,
    })
    ageLabel.Parent = gui

    -- Bottom-left: the one big button.
    local openBtn = Theme.button("🫧 MY GOOBS", Theme.ACCENT, UDim2.fromOffset(190, 58))
    openBtn.Position = UDim2.new(0, 16, 1, -74)
    openBtn.TextSize = 24
    openBtn.Parent = gui

    -- Drawer.
    drawer = Instance.new("Frame")
    drawer.Size = UDim2.fromOffset(430, 460)
    drawer.Position = UDim2.new(0, -450, 1, -544)
    drawer.BackgroundColor3 = Theme.BG
    drawer.BackgroundTransparency = 0.06
    drawer.Parent = gui
    Theme.corner(drawer, 18)
    Theme.stroke(drawer, Color3.fromRGB(14, 16, 26), 3)

    local title = Theme.label({
        Position = UDim2.fromOffset(18, 12), Size = UDim2.new(1, -36, 0, 30),
        Text = "🫧 MY GOOBS", TextSize = 26,
    })
    title.Parent = drawer

    local hint = Theme.label({
        Position = UDim2.fromOffset(18, 42), Size = UDim2.new(1, -36, 0, 20),
        Text = "Gulping one Goob into another DESTROYS it forever.",
        TextSize = 14, TextColor3 = Theme.WARN, TextWrapped = true,
    })
    hint.Parent = drawer

    drawerList = Instance.new("ScrollingFrame")
    drawerList.Position = UDim2.fromOffset(14, 70)
    drawerList.Size = UDim2.new(1, -28, 1, -84)
    drawerList.BackgroundTransparency = 1
    drawerList.BorderSizePixel = 0
    drawerList.ScrollBarThickness = 6
    drawerList.ScrollBarImageColor3 = Theme.ACCENT
    drawerList.Parent = drawer

    local listLayout = Instance.new("UIListLayout")
    listLayout.Padding = UDim.new(0, 8)
    listLayout.SortOrder = Enum.SortOrder.LayoutOrder
    listLayout.Parent = drawerList

    openBtn.Activated:Connect(function()
        drawerOpen = not drawerOpen
        TweenService:Create(drawer, TweenInfo.new(0.32, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
            Position = drawerOpen and UDim2.new(0, 16, 1, -544) or UDim2.new(0, -450, 1, -544),
        }):Play()
        if drawerOpen then rebuildDrawer() end
    end)

    -- Snack Stand: three buttons under the HUD. This is where idle income
    -- turns back into progression, so it is always on screen, never in a menu.
    local stand = Instance.new("Frame")
    stand.Name = "SnackStand"
    stand.Size = UDim2.fromOffset(300, 132)
    stand.Position = UDim2.fromOffset(16, 158)
    stand.BackgroundColor3 = Theme.BG
    stand.BackgroundTransparency = 0.12
    stand.Parent = gui
    Theme.corner(stand, 16)
    Theme.stroke(stand, Color3.fromRGB(14, 16, 26), 3)

    local standTitle = Theme.label({
        Position = UDim2.fromOffset(14, 6), Size = UDim2.new(1, -28, 0, 22),
        Text = "🍪 SNACK STAND", TextSize = 17, TextColor3 = Theme.GOLD,
    })
    standTitle.Parent = stand

    snackButtons = {}
    for i, tier in ipairs(Config.SNACK_TIERS) do
        local btn = Theme.button("", Theme.BG_SOFT, UDim2.new(1, -28, 0, 30))
        btn.Position = UDim2.fromOffset(14, 30 + (i - 1) * 34)
        btn.TextColor3 = Theme.TEXT
        btn.TextSize = 15
        btn.Text = tier.emoji .. " " .. tier.name
        btn.Parent = stand
        btn.Activated:Connect(function() Hud.onBuySnack(tier.id) end)
        snackButtons[tier.id] = btn
    end

    -- Toast column, top-right.
    toastHolder = Instance.new("Frame")
    toastHolder.Size = UDim2.fromOffset(340, 400)
    toastHolder.Position = UDim2.new(1, -356, 0, 16)
    toastHolder.BackgroundTransparency = 1
    toastHolder.Parent = gui

    local toastLayout = Instance.new("UIListLayout")
    toastLayout.Padding = UDim.new(0, 8)
    toastLayout.VerticalAlignment = Enum.VerticalAlignment.Top
    toastLayout.Parent = toastHolder

    -- Smoothly count the glob counter up between server pushes, so the number
    -- visibly ticks instead of jumping twice a second. Pure juice, big payoff.
    RunService.RenderStepped:Connect(function(dt)
        if not state then return end
        displayedGlob += (state.glob - displayedGlob) * math.min(1, dt * 6)
        displayedGlob += state.income * dt
        globLabel.Text = "💧 " .. Format.short(displayedGlob)
    end)

    return gui
end

function Hud.update(snap: any)
    state = snap
    if math.abs(displayedGlob - snap.glob) > math.max(10, snap.glob * 0.25) then
        displayedGlob = snap.glob
    end
    incomeLabel.Text = "+" .. snap.incomeText .. " 💧/sec"

    local active
    for _, g in ipairs(snap.goobs) do if g.isActive then active = g end end
    if active then
        powerLabel.Text = "⚡ " .. active.powerText
        ageLabel.Text = ("%s %s · %s old · ×%.2f power")
            :format(active.ageEmoji, active.ageTier, active.ageText, active.ageMult)
        ageLabel.TextColor3 = active.ageColor
    end
    -- Snack prices come from the server every push, so the button always shows
    -- exactly what will be charged.
    for _, snack in ipairs(snap.snacks or {}) do
        local btn = snackButtons[snack.id]
        if btn then
            btn.Text = ("%s %s  ·  💧%s  ·  %d items")
                :format(snack.emoji, snack.name, snack.priceText, snack.rolls)
            btn.BackgroundColor3 = snack.affordable and Theme.GOOD or Theme.BG_SOFT
            btn.TextColor3 = snack.affordable and Color3.fromRGB(20, 22, 34) or Theme.TEXT_DIM
        end
    end

    if drawerOpen then rebuildDrawer() end
end

-- Wired up by init.client.
Hud.tradeOpen = false
Hud.onGulp = function(_: string) end
Hud.onOffer = function(_: string) end
Hud.onBuySnack = function(_: string) end
Hud.onRename = function(_: string) end
Hud.onSetActive = function(_: string) end

function Hud.getState() return state end

function Hud.setTradeOpen(open: boolean)
    if Hud.tradeOpen == open then return end
    Hud.tradeOpen = open
    if drawerOpen then rebuildDrawer() end
end

return Hud
