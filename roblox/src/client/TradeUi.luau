--!strict
-- TradeUi.luau — the trade window.
--
-- The whole design goal is SCAM RESISTANCE made visible. A young player cannot
-- be expected to notice a swapped item, so the UI does the noticing for them:
-- both offers are shown at identical size, confirming is a hold-to-fill bar,
-- and any change to either side visibly snaps both bars back to empty.

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")

local Shared = game.ReplicatedStorage.GoobShared
local Net = require(Shared.Net)
local Format = require(Shared.Format)

local Theme = require(script.Parent.Theme)

local player = Players.LocalPlayer
local TradeUi = {}

local root: Frame
local myList: Frame
local theirList: Frame
local statusLabel: TextLabel
local confirmBtn: TextButton
local fillBar: Frame
local partnerLabel: TextLabel

local holding = false
local holdStart = 0
local lockSeconds = 3
local current: any = nil

local function clear(frame: Frame)
    for _, c in ipairs(frame:GetChildren()) do
        if c:IsA("Frame") then c:Destroy() end
    end
end

local function offerCard(goob: any, mine: boolean): Frame
    local card = Instance.new("Frame")
    card.Size = UDim2.new(1, 0, 0, 74)
    card.BackgroundColor3 = Theme.PANEL
    Theme.corner(card, 12)
    Theme.stroke(card, Color3.fromRGB(16, 18, 30), 2)

    local chip = Instance.new("Frame")
    chip.Size = UDim2.fromOffset(50, 50)
    chip.Position = UDim2.fromOffset(10, 12)
    chip.BackgroundColor3 = Color3.fromHSV(goob.hue, 0.55, 1)
    chip.Parent = card
    Theme.corner(chip, 25)
    Theme.stroke(chip, Color3.fromRGB(16, 18, 30), 2)

    local name = Theme.label({
        Position = UDim2.fromOffset(70, 8), Size = UDim2.new(1, -80, 0, 22),
        Text = goob.nickname, TextSize = 18, TextTruncate = Enum.TextTruncate.AtEnd,
    })
    name.Parent = card

    -- Age is shown as loudly as power. It is the stat new traders undervalue,
    -- and the one they get talked out of.
    local stat = Theme.label({
        Position = UDim2.fromOffset(70, 30), Size = UDim2.new(1, -80, 0, 20),
        Text = ("⚡ %s   Gen %d"):format(goob.powerText, goob.generation),
        TextSize = 15, TextColor3 = Theme.GOLD,
    })
    stat.Parent = card

    local age = Theme.label({
        Position = UDim2.fromOffset(70, 50), Size = UDim2.new(1, -80, 0, 18),
        Text = ("%s %s · %s old"):format(goob.ageEmoji, goob.ageTier, goob.ageText),
        TextSize = 14, TextColor3 = Theme.ACCENT,
    })
    age.Parent = card

    if mine then
        local remove = Theme.button("✖", Theme.BAD, UDim2.fromOffset(30, 30))
        remove.Position = UDim2.new(1, -38, 0, 8)
        remove.TextSize = 16
        remove.Parent = card
        remove.Activated:Connect(function()
            Net.get("TradeOffer"):FireServer(goob.id, false)
        end)
    end

    return card
end

local function column(parent: Frame, title: string, x: UDim2): Frame
    local holder = Instance.new("Frame")
    holder.Size = UDim2.new(0.5, -14, 1, -164)
    holder.Position = x
    holder.BackgroundTransparency = 1
    holder.Parent = parent

    local head = Theme.label({
        Size = UDim2.new(1, 0, 0, 26), Text = title, TextSize = 20,
        TextXAlignment = Enum.TextXAlignment.Center,
    })
    head.Name = "Head"
    head.Parent = holder

    local list = Instance.new("Frame")
    list.Name = "List"
    list.Position = UDim2.fromOffset(0, 32)
    list.Size = UDim2.new(1, 0, 1, -32)
    list.BackgroundColor3 = Theme.BG_SOFT
    list.BackgroundTransparency = 0.35
    list.Parent = holder
    Theme.corner(list, 12)
    Theme.pad(list, 8)

    local layout = Instance.new("UIListLayout")
    layout.Padding = UDim.new(0, 6)
    layout.Parent = list

    return list
end

function TradeUi.build(gui: ScreenGui)
    root = Instance.new("Frame")
    root.Name = "TradeWindow"
    root.Size = UDim2.fromOffset(640, 480)
    root.Position = UDim2.new(0.5, -320, 0.5, -240)
    root.BackgroundColor3 = Theme.BG
    root.Visible = false
    root.Parent = gui
    Theme.corner(root, 18)
    Theme.stroke(root, Theme.GOLD, 4)

    local title = Theme.label({
        Position = UDim2.fromOffset(20, 12), Size = UDim2.new(1, -40, 0, 30),
        Text = "🤝 TRADE", TextSize = 28, TextColor3 = Theme.GOLD,
    })
    title.Parent = root

    partnerLabel = Theme.label({
        Position = UDim2.fromOffset(20, 44), Size = UDim2.new(1, -40, 0, 22),
        Text = "", TextSize = 17, TextColor3 = Theme.TEXT_DIM,
    })
    partnerLabel.Parent = root

    myList = column(root, "YOU GIVE", UDim2.fromOffset(14, 76))
    theirList = column(root, "YOU GET", UDim2.new(0.5, 0, 0, 76))

    statusLabel = Theme.label({
        Position = UDim2.new(0, 20, 1, -84), Size = UDim2.new(1, -40, 0, 22),
        Text = "Add Goobs from your drawer, then hold CONFIRM.",
        TextSize = 15, TextColor3 = Theme.TEXT_DIM,
        TextXAlignment = Enum.TextXAlignment.Center,
    })
    statusLabel.Parent = root

    confirmBtn = Theme.button("HOLD TO CONFIRM", Theme.GOOD, UDim2.fromOffset(300, 46))
    confirmBtn.Position = UDim2.new(0.5, -160, 1, -58)
    confirmBtn.TextSize = 20
    confirmBtn.Parent = root

    -- The fill bar lives *inside* the button and grows left to right. It is
    -- the entire anti-scam affordance: you physically cannot confirm by
    -- reflex, and the bar emptying is impossible to miss.
    --
    -- ZIndex MUST be above the button, not below it. The ScreenGui runs in
    -- Sibling ZIndexBehavior, so a child at ZIndex 0 renders behind its
    -- parent's opaque background — which made the one piece of UI protecting
    -- nine-year-olds from trade scams completely invisible.
    fillBar = Instance.new("Frame")
    fillBar.Name = "HoldFill"
    fillBar.Size = UDim2.fromScale(0, 1)
    fillBar.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
    fillBar.BackgroundTransparency = 0.62
    fillBar.BorderSizePixel = 0
    fillBar.ZIndex = confirmBtn.ZIndex + 1
    fillBar.Parent = confirmBtn
    Theme.corner(fillBar, 12)

    -- Keep the label readable on top of the fill.
    confirmBtn.ZIndex = 2
    fillBar.ZIndex = 3

    local cancel = Theme.button("✖ CANCEL", Theme.BAD, UDim2.fromOffset(120, 46))
    cancel.Position = UDim2.new(0.5, 152, 1, -58)
    cancel.TextSize = 17
    cancel.Parent = root
    cancel.Activated:Connect(function()
        Net.get("TradeCancel"):FireServer()
    end)

    local function beginHold()
        if not current or not current.open then return end
        holding = true
        holdStart = os.clock()
        Net.get("TradeConfirm"):FireServer(true)
    end
    local function endHold()
        if not holding then return end
        holding = false
        fillBar.Size = UDim2.fromScale(0, 1)
        Net.get("TradeConfirm"):FireServer(false)
    end

    confirmBtn.MouseButton1Down:Connect(beginHold)
    confirmBtn.MouseButton1Up:Connect(endHold)
    confirmBtn.MouseLeave:Connect(endHold)
    UserInputService.InputEnded:Connect(function(input)
        if input.UserInputType == Enum.UserInputType.MouseButton1
            or input.UserInputType == Enum.UserInputType.Touch then
            endHold()
        end
    end)

    RunService.RenderStepped:Connect(function()
        if holding then
            local pct = math.clamp((os.clock() - holdStart) / lockSeconds, 0, 1)
            fillBar.Size = UDim2.fromScale(pct, 1)
        end
    end)
end

function TradeUi.sync(stateIn: any)
    current = stateIn
    if not stateIn or not stateIn.open then
        root.Visible = false
        holding = false
        fillBar.Size = UDim2.fromScale(0, 1)
        return
    end
    root.Visible = true
    lockSeconds = stateIn.lockSeconds or 3
    partnerLabel.Text = "Trading with " .. (stateIn.partnerDisplay or stateIn.partner)

    clear(myList)
    clear(theirList)
    for _, goob in ipairs(stateIn.myOffer) do offerCard(goob, true).Parent = myList end
    for _, goob in ipairs(stateIn.theirOffer) do offerCard(goob, false).Parent = theirList end

    -- If either offer changed, the server already reset both confirmations.
    -- Reflecting that instantly is the point.
    if not stateIn.myConfirmed and holding then
        holding = false
        fillBar.Size = UDim2.fromScale(0, 1)
    end

    if stateIn.theirConfirmed and stateIn.myConfirmed then
        statusLabel.Text = "Both confirmed — finishing…"
        statusLabel.TextColor3 = Theme.GOOD
    elseif stateIn.theirConfirmed then
        statusLabel.Text = "⚠️ They confirmed. Check the deal, then hold CONFIRM."
        statusLabel.TextColor3 = Theme.WARN
    else
        statusLabel.Text = "Add Goobs from your drawer, then hold CONFIRM."
        statusLabel.TextColor3 = Theme.TEXT_DIM
    end
end

function TradeUi.isOpen(): boolean
    return current ~= nil and current.open == true
end

return TradeUi
