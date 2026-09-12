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
local Layout = require(script.Parent.Layout)
local Panels = require(script.Parent.Panels)

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
local eggButton: TextButton
local coach: Frame
local coachText: TextLabel
local coachHint: TextLabel
local coachStep: TextLabel
local pulseTarget: GuiObject? = nil
local pulseClock = 0
local topFrame: Frame
local standFrame: Frame
local openButton: TextButton
local standTitle: TextLabel
local drawerTitle: TextLabel
local drawerHint: TextLabel
local tabBar: Frame
local tabButtons: { [string]: TextButton } = {}
local tabContent: Frame
local currentTab = "goobs"

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
    card.Size = UDim2.new(1, 0, 0, Layout.isTouch() and 136 or 118)
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

    local rowH = Layout.isTouch() and Layout.MIN_TAP or 28
    local row = Instance.new("Frame")
    row.Position = UDim2.fromOffset(90, 82)
    row.Size = UDim2.new(1, -102, 0, rowH)
    row.BackgroundTransparency = 1
    row.Parent = card

    local layout = Instance.new("UIListLayout")
    layout.FillDirection = Enum.FillDirection.Horizontal
    layout.Padding = UDim.new(0, 6)
    layout.Parent = row

    if not goob.isActive then
        local show = Theme.button("👁 Display", Theme.ACCENT, UDim2.fromOffset(104, rowH))
        show.TextSize = 15
        show.Parent = row
        show.Activated:Connect(function()
            Hud.onSetActive(goob.id)
        end)

        local gulp = Theme.button("😋 Gulp", Theme.BAD, UDim2.fromOffset(88, rowH))
        gulp.TextSize = 15
        gulp.Parent = row
        gulp.Activated:Connect(function()
            Hud.onGulp(goob.id)
        end)
    else
        local rename = Theme.button("✏️ Rename", Theme.GOLD, UDim2.fromOffset(104, rowH))
        rename.TextSize = 15
        rename.Parent = row
        rename.Activated:Connect(function() Hud.onRename(goob.id) end)
    end

    -- While a trade window is open, every card grows an "offer" button. This
    -- keeps the trade UI itself read-only, which means the list you are
    -- agreeing to and the list you are editing can never drift apart.
    if Hud.tradeOpen then
        local offer = Theme.button("➕ Offer", Theme.GOOD, UDim2.fromOffset(90, rowH))
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
    drawerList.CanvasSize = UDim2.new(0, 0, 0, #sorted * (Layout.isTouch() and 144 or 126) + 8)
end


-- ── Responsive layout ──────────────────────────────────────────────────────
-- Every size and position in the HUD is decided here rather than at creation,
-- so a viewport change is just a second call to this function.
--
-- Two distinct layouts, not one layout that shrinks:
--
--   ROOMY   — stat panel and snack stand stacked down the left, drawer button
--             bottom-left, drawer slides in above it.
--   COMPACT — the left column would eat a phone screen whole, and both bottom
--             corners belong to the Roblox touch controls. So: one round
--             button in the gap between thumbstick and jump button, and the
--             snack stand moves INSIDE the drawer. One button, one panel.

function Hud.drawerPosition(open: boolean): UDim2
    local u = Layout.usable()
    local size = drawer.Size
    if not open then
        return UDim2.fromOffset(-size.X.Offset - 30, drawer.Position.Y.Offset)
    end
    if Layout.isCompact() then
        return UDim2.fromOffset(10, 8)
    end
    return UDim2.fromOffset(16, u.Y - size.Y.Offset - 84)
end

function Hud.applyLayout()
    if not topFrame then return end
    local compact = Layout.isCompact()
    local touch = Layout.isTouch()
    local u = Layout.usable()

    -- Stat panel, top-left.
    local statW = compact and math.min(210, u.X * 0.42) or 300
    local statH = compact and 74 or 108
    topFrame.Size = UDim2.fromOffset(statW, statH)
    topFrame.Position = UDim2.fromOffset(compact and 10 or 16, compact and 8 or 16)

    powerLabel.TextSize = compact and 26 or 34
    powerLabel.Size = UDim2.new(1, -20, 0, compact and 30 or 40)
    powerLabel.Position = UDim2.fromOffset(12, compact and 4 or 8)
    globLabel.TextSize = compact and 18 or 22
    globLabel.Size = UDim2.new(1, -20, 0, compact and 22 or 26)
    globLabel.Position = UDim2.fromOffset(12, compact and 34 or 48)
    incomeLabel.TextSize = compact and 13 or 15
    incomeLabel.Size = UDim2.new(1, -20, 0, 20)
    incomeLabel.Position = UDim2.fromOffset(12, compact and 54 or 74)

    ageLabel.Position = UDim2.fromOffset(compact and 10 or 16, statH + (compact and 12 or 30))
    ageLabel.Size = UDim2.fromOffset(statW + (compact and 40 or 0), compact and 20 or 24)
    ageLabel.TextSize = compact and 14 or 17

    -- Toasts, top-right. Narrower on a phone so they never meet the stat panel.
    local toastW = compact and math.min(250, u.X * 0.40) or 340
    toastHolder.Size = UDim2.fromOffset(toastW, math.min(400, u.Y - 20))
    toastHolder.Position = UDim2.fromOffset(u.X - toastW - (compact and 10 or 16), compact and 8 or 16)

    -- The drawer. Near-fullscreen on a phone, a side panel otherwise.
    local drawerW = compact and math.min(400, u.X - 20) or 430
    local drawerH = compact and (u.Y - 16) or math.min(460, u.Y - 100)
    drawer.Size = UDim2.fromOffset(drawerW, drawerH)

    drawerTitle.TextSize = compact and 22 or 26
    drawerHint.Visible = not compact  -- the warning also lives on the confirm dialog

    local headerH = compact and 42 or 64

    -- Snack stand: its own panel when there is room, inside the drawer when
    -- there is not. A phone screen cannot host both.
    local standH = (compact and 3 * 48 + 34 or 132)
    if compact then
        standFrame.Parent = drawer
        standFrame.Size = UDim2.fromOffset(drawerW - 20, standH)
        standFrame.Position = UDim2.fromOffset(10, headerH)
        standFrame.BackgroundTransparency = 1
        standTitle.Visible = false
    else
        standFrame.Parent = gui
        standFrame.Size = UDim2.fromOffset(300, standH)
        standFrame.Position = UDim2.fromOffset(16, 158)
        standFrame.BackgroundTransparency = 0.12
        standTitle.Visible = true
    end

    local btnH = touch and Layout.MIN_TAP or 30
    local btnGap = compact and 4 or 4
    local standTop = compact and 4 or 30
    local i = 0
    for _, tier in ipairs(Config.SNACK_TIERS) do
        local btn = snackButtons[tier.id]
        if btn then
            btn.Size = UDim2.new(1, -20, 0, btnH)
            btn.Position = UDim2.fromOffset(10, standTop + i * (btnH + btnGap))
            btn.TextSize = compact and 16 or 15
            i += 1
        end
    end

    -- Egg button sits under the snack stack inside the drawer on compact.
    local eggY = compact and (headerH + standH + 6) or 64
    if eggButton then
        eggButton.Size = UDim2.new(1, -20, 0, touch and Layout.MIN_TAP or 34)
        eggButton.Position = UDim2.fromOffset(10, eggY)
        eggButton.TextSize = compact and 16 or 16
    end

    -- Tab strip sits under the title; everything below it belongs to the tab.
    local tabH = touch and 42 or 34
    local tabTop = compact and 36 or 44
    tabBar.Position = UDim2.fromOffset(10, tabTop)
    tabBar.Size = UDim2.new(1, -20, 0, tabH)
    local tabW = math.floor((drawerW - 20 - 18) / 4)
    local ti = 0
    for _, id in ipairs({ "goobs", "wear", "season", "crew" }) do
        local btn = tabButtons[id]
        if btn then
            btn.Size = UDim2.fromOffset(tabW, tabH)
            btn.Position = UDim2.fromOffset(ti * (tabW + 6), 0)
            btn.BackgroundColor3 = (currentTab == id) and Theme.ACCENT or Theme.BG_SOFT
            btn.TextColor3 = (currentTab == id) and Color3.fromRGB(28, 30, 34) or Theme.TEXT
            ti += 1
        end
    end

    local contentTop = tabTop + tabH + 8
    local isGoobs = currentTab == "goobs"

    standFrame.Visible = compact and isGoobs or not compact
    if eggButton then eggButton.Visible = isGoobs end
    drawerHint.Visible = (not compact) and isGoobs
    drawerList.Visible = isGoobs
    tabContent.Visible = not isGoobs

    tabContent.Position = UDim2.fromOffset(10, contentTop)
    tabContent.Size = UDim2.new(1, -20, 0, math.max(60, drawerH - contentTop - 10))

    local listTop = isGoobs and (compact and (eggY + 52) or (eggY + 42)) or contentTop
    if compact and isGoobs then
        standFrame.Position = UDim2.fromOffset(10, contentTop)
        if eggButton then
            eggButton.Position = UDim2.fromOffset(10, contentTop + standH + 6)
        end
        listTop = contentTop + standH + 6 + 52
    elseif isGoobs then
        if eggButton then eggButton.Position = UDim2.fromOffset(10, contentTop) end
        listTop = contentTop + 42
    end
    drawerList.Position = UDim2.fromOffset(10, listTop)
    drawerList.Size = UDim2.new(1, -20, 0, math.max(60, drawerH - listTop - 10))

    if not isGoobs and state then
        Panels.render(currentTab, tabContent, state)
    end

    -- The one action button. On touch it goes in the gap between the
    -- thumbstick and the jump button, which is the only reachable part of the
    -- bottom edge; otherwise bottom-left as usual.
    if touch then
        local gapL, gapR = Layout.bottomGap()
        local size = Layout.MIN_TAP + 16
        local cx = (gapL + gapR) / 2
        -- If the gap is too narrow to centre in, sit just right of the stick.
        if gapR - gapL < size + 16 then cx = gapL + size / 2 + 8 end
        openButton.Size = UDim2.fromOffset(size, size)
        openButton.Position = UDim2.fromOffset(
            Layout.fit(cx - size / 2, 8, u.X - size - 8),
            u.Y - size - 10
        )
        openButton.Text = compact and "🫧" or "🫧 MY GOOBS"
        if not compact then
            openButton.Size = UDim2.fromOffset(190, math.max(size, 58))
            openButton.Position = UDim2.fromOffset(
                Layout.fit(cx - 95, 8, u.X - 198), u.Y - math.max(size, 58) - 10)
        end
        openButton.TextSize = compact and 28 or 22
    else
        openButton.Size = UDim2.fromOffset(190, 58)
        openButton.Position = UDim2.fromOffset(16, u.Y - 74)
        openButton.Text = "🫧 MY GOOBS"
        openButton.TextSize = 24
    end

    -- Coach banner, centred under the top bar. Narrow enough on a phone that
    -- it never collides with the stat panel or the toasts.
    if coach then
        local cw = compact and math.min(330, u.X - 24) or 460
        local ch = compact and 76 or 84
        coach.Size = UDim2.fromOffset(cw, ch)
        coach.Position = UDim2.fromOffset(math.floor((u.X - cw) / 2), compact and 6 or 14)
        coachStep.Position = UDim2.fromOffset(14, 6)
        coachStep.Size = UDim2.new(1, -50, 0, 16)
        coachText.Position = UDim2.fromOffset(14, 22)
        coachText.Size = UDim2.new(1, -28, 0, compact and 26 or 30)
        coachText.TextSize = compact and 17 or 20
        coachHint.Position = UDim2.fromOffset(14, compact and 48 or 54)
        coachHint.Size = UDim2.new(1, -28, 0, compact and 24 or 26)
        coachHint.TextSize = compact and 12 or 14
        local skip = coach:FindFirstChild("SkipCoach") :: TextButton?
        if skip then
            local sz = touch and 34 or 28
            skip.Size = UDim2.fromOffset(sz, sz)
            skip.Position = UDim2.fromOffset(cw - sz - 8, 6)
        end
    end

    drawer.Position = Hud.drawerPosition(drawerOpen)
    drawer.Visible = drawerOpen
    if drawerOpen then rebuildDrawer() end
end

-- ── Build ──────────────────────────────────────────────────────────────────

function Hud.build(): ScreenGui
    gui = Instance.new("ScreenGui")
    gui.Name = "GoobHud"
    gui.ResetOnSpawn = false
    -- false, NOT true: with IgnoreGuiInset = true the ScreenGui draws from the
    -- true top of the screen and the Roblox top bar covers the first ~36px —
    -- which is exactly where the power readout was.
    gui.IgnoreGuiInset = false
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    -- Above Roblox's own touch-control ScreenGui, so a dialog button placed
    -- over the jump button receives the tap instead of the jump button.
    gui.DisplayOrder = 10
    gui.Parent = player:WaitForChild("PlayerGui")

    -- Top-left: the two numbers that matter.
    local top = Instance.new("Frame")
    topFrame = top
    top.Name = "StatPanel"
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
    openBtn.Name = "OpenDrawer"
    openBtn.TextSize = 24
    openBtn.Parent = gui
    openButton = openBtn

    -- Drawer.
    drawer = Instance.new("Frame")
    drawer.Name = "GoobDrawer"
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
    drawerTitle = title

    local hint = Theme.label({
        Position = UDim2.fromOffset(18, 42), Size = UDim2.new(1, -36, 0, 20),
        Text = "Gulping one Goob into another DESTROYS it forever.",
        TextSize = 14, TextColor3 = Theme.WARN, TextWrapped = true,
    })
    hint.Parent = drawer
    drawerHint = hint

    -- Eggs are the ONLY source of new Goobs in the game, so the button lives
    -- at the top of the drawer rather than behind another menu.
    eggButton = Theme.button("🥚 HATCH A NEW GOOB", Theme.GOLD, UDim2.new(1, -28, 0, 34))
    eggButton.Position = UDim2.fromOffset(14, 64)
    eggButton.TextSize = 16
    eggButton.Parent = drawer
    eggButton.Activated:Connect(function() Hud.onBuyEgg() end)

    -- Tabs. Everything that used to want its own floating button lives here
    -- instead: a phone has room for about one persistent control.
    tabBar = Instance.new("Frame")
    tabBar.Name = "Tabs"
    tabBar.BackgroundTransparency = 1
    tabBar.Parent = drawer

    local TABS = {
        { id = "goobs",  label = "🫧" },
        { id = "wear",   label = "👕" },
        { id = "season", label = "⭐" },
        { id = "crew",   label = "🛡️" },
    }
    for i, t in ipairs(TABS) do
        local btn = Theme.button(t.label, Theme.BG_SOFT, UDim2.fromOffset(50, 34))
        btn.Name = "Tab_" .. t.id
        btn.TextSize = 18
        btn.TextColor3 = Theme.TEXT
        btn.LayoutOrder = i
        btn.Parent = tabBar
        tabButtons[t.id] = btn
        btn.Activated:Connect(function()
            currentTab = t.id
            Hud.applyLayout()
        end)
    end

    tabContent = Instance.new("Frame")
    tabContent.Name = "TabContent"
    tabContent.BackgroundTransparency = 1
    tabContent.Visible = false
    tabContent.Parent = drawer

    drawerList = Instance.new("ScrollingFrame")
    drawerList.Position = UDim2.fromOffset(14, 106)
    drawerList.Size = UDim2.new(1, -28, 1, -120)
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
        if drawerOpen then
            drawer.Visible = true
            rebuildDrawer()
        end
        local tween = TweenService:Create(
            drawer, TweenInfo.new(0.32, Enum.EasingStyle.Quint, Enum.EasingDirection.Out),
            { Position = Hud.drawerPosition(drawerOpen) })
        -- Hide it once it has slid away. A panel parked off-screen still
        -- renders and still costs layout, and it makes "is anything hanging
        -- off the edge of the screen?" impossible to answer honestly.
        if not drawerOpen then
            tween.Completed:Connect(function()
                if not drawerOpen then drawer.Visible = false end
            end)
        end
        tween:Play()
    end)

    -- Snack Stand: three buttons under the HUD. This is where idle income
    -- turns back into progression, so it is always on screen, never in a menu.
    local stand = Instance.new("Frame")
    stand.Name = "SnackStand"
    standFrame = stand
    stand.BackgroundColor3 = Theme.BG
    stand.BackgroundTransparency = 0.12
    stand.Parent = gui
    Theme.corner(stand, 16)
    Theme.stroke(stand, Color3.fromRGB(14, 16, 26), 3)

    standTitle = Theme.label({
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

    -- The first-run coach. Top-centre, above everything, one instruction at a
    -- time. Deliberately NOT a modal: the player should be doing the thing
    -- while reading it, not dismissing a wall of text before they can move.
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

    -- Smoothly count the glob counter up between server pushes, so the number
    -- visibly ticks instead of jumping twice a second. Pure juice, big payoff.
    RunService.RenderStepped:Connect(function(dt)
        -- Pulse the coached control. Restores the stroke when the target
        -- changes so a button never stays stuck mid-glow.
        pulseClock += dt
        for _, btn in pairs(snackButtons) do
            local st = btn:FindFirstChildOfClass("UIStroke")
            if st and btn ~= pulseTarget then st.Thickness = 3 end
        end
        if openButton then
            local st = openButton:FindFirstChildOfClass("UIStroke")
            if st and openButton ~= pulseTarget then st.Thickness = 3 end
        end
        if eggButton then
            local st = eggButton:FindFirstChildOfClass("UIStroke")
            if st and eggButton ~= pulseTarget then st.Thickness = 3 end
        end
        if pulseTarget then
            local st = pulseTarget:FindFirstChildOfClass("UIStroke")
            if st then
                st.Color = Theme.GOLD
                st.Thickness = 3 + math.abs(math.sin(pulseClock * 3)) * 4
            end
        end

        if not state then return end
        displayedGlob += (state.glob - displayedGlob) * math.min(1, dt * 6)
        displayedGlob += state.income * dt
        globLabel.Text = "💧 " .. Format.short(displayedGlob)
    end)

    Layout.start()
    Hud.applyLayout()
    Layout.changed.Event:Connect(Hud.applyLayout)

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
            btn.TextColor3 = snack.affordable and Color3.fromRGB(28, 30, 34) or Theme.TEXT_DIM
        end
    end

    if eggButton then
        if snap.eggCapped then
            eggButton.Text = ("🥚 FULL — %d / %d Goobs"):format(#snap.goobs, snap.maxGoobs)
            eggButton.BackgroundColor3 = Theme.BG_SOFT
            eggButton.TextColor3 = Theme.TEXT_DIM
        else
            eggButton.Text = ("🥚 HATCH A GOOB  ·  💧%s  (%d/%d)")
                :format(snap.eggPriceText or "?", #snap.goobs, snap.maxGoobs or 8)
            eggButton.BackgroundColor3 = snap.eggAffordable and Theme.GOLD or Theme.BG_SOFT
            eggButton.TextColor3 = snap.eggAffordable and Color3.fromRGB(28, 30, 34) or Theme.TEXT_DIM
        end
    end

    -- First-run coach.
    local tut = snap.tutorial
    if coach then
        if tut then
            coach.Visible = true
            coachStep.Text = ("STEP %d OF %d"):format(tut.index, tut.total)
                .. (tut.progress and ("   ·   " .. tut.progress) or "")
            coachText.Text = tut.text
            coachHint.Text = tut.hint or ""

            -- Pulse whichever control the step is asking for. Pointing at the
            -- button beats describing where it is, especially for a player who
            -- cannot read quickly yet.
            if tut.target == "snack" then
                pulseTarget = snackButtons["snack"]
            elseif tut.target == "drawer" then
                pulseTarget = drawerOpen and eggButton or openButton
            else
                pulseTarget = nil
            end
        else
            coach.Visible = false
            pulseTarget = nil
        end
    end

    if drawerOpen then
        if currentTab == "goobs" then
            rebuildDrawer()
        else
            Panels.render(currentTab, tabContent, snap)
        end
    end
end

-- Wired up by init.client.
Hud.tradeOpen = false
Hud.onGulp = function(_: string) end
Hud.onOffer = function(_: string) end
Hud.onBuySnack = function(_: string) end
Hud.onBuyEgg = function() end
Hud.onDismissCoach = function() end
Hud.onRename = function(_: string) end
Hud.onSetActive = function(_: string) end

function Hud.getState() return state end

function Hud.setTradeOpen(open: boolean)
    if Hud.tradeOpen == open then return end
    Hud.tradeOpen = open
    if drawerOpen then rebuildDrawer() end
end

return Hud
