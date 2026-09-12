--!strict
-- init.client.luau — client entry point.
--
-- Everything the client does falls into one of three jobs:
--   1. Draw the UI from server snapshots (it never computes authoritative state)
--   2. Detect what the player is standing near and ASK the server about it
--   3. Play feedback (toasts, sounds, camera pops)
--
-- Note job 2: the client never says "I caught a Mythic". It says "I touched
-- this part", and the server decides. Every exploit in this genre comes from
-- getting that backwards.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local UserInputService = game:GetService("UserInputService")
local SoundService = game:GetService("SoundService")

local Shared = game.ReplicatedStorage:WaitForChild("GoobShared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local Format = require(Shared.Format)

local Theme = require(script.Theme)
local Hud = require(script.Hud)
local TradeUi = require(script.TradeUi)

local player = Players.LocalPlayer
local gui = Hud.build()
TradeUi.build(gui)

-- ── Sound ──────────────────────────────────────────────────────────────────
-- Three sounds carry the entire game feel: a catch blip, a rare fanfare and a
-- gulp. They are generated from Roblox's built-in library so the place has no
-- external asset dependencies and works the moment you open it.

local function sound(id: string, volume: number, pitch: number?): Sound
    local s = Instance.new("Sound")
    s.SoundId = id
    s.Volume = volume
    s.PlaybackSpeed = pitch or 1
    s.Parent = SoundService
    return s
end

local sfxCatch = sound("rbxassetid://6026984224", 0.35)
local sfxRare  = sound("rbxassetid://9125402735", 0.5)
local sfxGulp  = sound("rbxassetid://5852470908", 0.6)

local function play(s: Sound, pitchJitter: number?)
    if pitchJitter then
        s.PlaybackSpeed = 1 + (math.random() - 0.5) * pitchJitter
    end
    s:Play()
end

-- ── Catching ───────────────────────────────────────────────────────────────
-- Auto-collect on proximity. Requiring a click would be miserable on mobile,
-- and "run through the thing to get the thing" is the most legible verb there
-- is. We throttle per-part so we never spam the server.

local critterFolder = Workspace:WaitForChild("Critters")
local lastAsked: { [Instance]: number } = {}
local CatchRemote = Net.get("CatchCritter")

RunService.Heartbeat:Connect(function()
    local char = player.Character
    local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
    if not root then return end

    local now = os.clock()
    for _, part in ipairs(critterFolder:GetChildren()) do
        if part:IsA("BasePart") then
            local d = (part.Position - root.Position).Magnitude
            if d <= Config.CRITTER_CATCH_RADIUS - 1 then
                if (now - (lastAsked[part] or 0)) > 0.4 then
                    lastAsked[part] = now
                    CatchRemote:FireServer(part)
                end
            end
        end
    end

    -- Reap the throttle table so it doesn't grow forever over a long session.
    if #critterFolder:GetChildren() == 0 then
        lastAsked = {}
    end
end)

-- ── Server -> client ───────────────────────────────────────────────────────

Net.get("StateSync").OnClientEvent:Connect(function(snap)
    Hud.update(snap)
end)

Net.get("Notify").OnClientEvent:Connect(function(message: string, kind: string?)
    Hud.toast(message, kind)
    if kind == "secret" then
        play(sfxRare)
    elseif kind == "good" then
        play(sfxCatch, 0.2)
    end
end)

Net.get("TradeSync").OnClientEvent:Connect(function(state)
    TradeUi.sync(state)
    Hud.setTradeOpen(state ~= nil and state.open == true)
end)

-- ── Client -> server actions ───────────────────────────────────────────────

Hud.onSetActive = function(goobId: string)
    Net.get("SetActiveGoob"):FireServer(goobId)
end

Hud.onOffer = function(goobId: string)
    Net.get("TradeOffer"):FireServer(goobId, true)
end

Hud.onBuySnack = function(tierId: string)
    Net.get("BuySnack"):FireServer(tierId)
    play(sfxCatch, 0.25)
end

Hud.onBuyEgg = function()
    Net.get("BuyEgg"):FireServer()
end

-- Gulping is irreversible, so it gets a real two-step confirmation with the
-- consequence spelled out in words a child will actually read.
local pendingGulp: string? = nil
local confirmFrame: Frame

local function buildGulpConfirm()
    confirmFrame = Instance.new("Frame")
    confirmFrame.Size = UDim2.fromOffset(420, 210)
    confirmFrame.Position = UDim2.new(0.5, -210, 0.5, -105)
    confirmFrame.BackgroundColor3 = Theme.BG
    confirmFrame.Visible = false
    confirmFrame.Parent = gui
    Theme.corner(confirmFrame, 18)
    Theme.stroke(confirmFrame, Theme.BAD, 4)

    local title = Theme.label({
        Position = UDim2.fromOffset(20, 16), Size = UDim2.new(1, -40, 0, 30),
        Text = "😋 GULP THIS GOOB?", TextSize = 26, TextColor3 = Theme.BAD,
    })
    title.Parent = confirmFrame

    local body = Theme.label({
        Name = "Body",
        Position = UDim2.fromOffset(20, 52), Size = UDim2.new(1, -40, 0, 92),
        Text = "", TextSize = 17, TextWrapped = true,
        TextYAlignment = Enum.TextYAlignment.Top, TextColor3 = Theme.TEXT_DIM,
    })
    body.Parent = confirmFrame

    local yes = Theme.button("😋 GULP IT", Theme.BAD, UDim2.fromOffset(170, 44))
    yes.Position = UDim2.fromOffset(20, 150)
    yes.Parent = confirmFrame
    yes.Activated:Connect(function()
        local state = Hud.getState()
        if pendingGulp and state then
            local activeId = state.activeGoobId
            Net.get("GulpGoob"):FireServer(activeId, pendingGulp)
            play(sfxGulp)
        end
        pendingGulp = nil
        confirmFrame.Visible = false
    end)

    local no = Theme.button("✖ KEEP IT", Theme.ACCENT, UDim2.fromOffset(170, 44))
    no.Position = UDim2.new(1, -190, 0, 150)
    no.Parent = confirmFrame
    no.Activated:Connect(function()
        pendingGulp = nil
        confirmFrame.Visible = false
    end)
end
buildGulpConfirm()

Hud.onGulp = function(goobId: string)
    local state = Hud.getState()
    if not state then return end
    local target, active
    for _, g in ipairs(state.goobs) do
        if g.id == goobId then target = g end
        if g.isActive then active = g end
    end
    if not target or not active then return end

    pendingGulp = goobId
    local body = confirmFrame:FindFirstChild("Body") :: TextLabel
    body.Text = string.format(
        "%s (⚡%s, %s old) will be GONE FOREVER.\n\n%s will gain about ⚡%s and %s of its age.\n\nThis cannot be undone.",
        target.nickname, target.powerText, target.ageText,
        active.nickname,
        Format.short(target.mass * Config.GULP_MASS_TRANSFER * active.ageMult),
        Format.duration(target.ageSeconds * Config.GULP_AGE_TRANSFER)
    )
    confirmFrame.Visible = true
end

-- Rename: a tiny inline prompt rather than a modal, because renaming is a
-- low-stakes action and a modal for it would be annoying.
local renameFrame: Frame
local renameBox: TextBox
local renameTarget: string? = nil

do
    renameFrame = Instance.new("Frame")
    renameFrame.Size = UDim2.fromOffset(400, 150)
    renameFrame.Position = UDim2.new(0.5, -200, 0.5, -75)
    renameFrame.BackgroundColor3 = Theme.BG
    renameFrame.Visible = false
    renameFrame.Parent = gui
    Theme.corner(renameFrame, 18)
    Theme.stroke(renameFrame, Theme.GOLD, 4)

    local title = Theme.label({
        Position = UDim2.fromOffset(20, 14), Size = UDim2.new(1, -40, 0, 28),
        Text = "✏️ NAME YOUR GOOB", TextSize = 24, TextColor3 = Theme.GOLD,
    })
    title.Parent = renameFrame

    renameBox = Instance.new("TextBox")
    renameBox.Position = UDim2.fromOffset(20, 52)
    renameBox.Size = UDim2.new(1, -40, 0, 42)
    renameBox.BackgroundColor3 = Theme.BG_SOFT
    renameBox.Font = Theme.FONT
    renameBox.TextSize = 20
    renameBox.TextColor3 = Theme.TEXT
    renameBox.PlaceholderText = "2–22 letters…"
    renameBox.ClearTextOnFocus = false
    renameBox.Text = ""
    renameBox.Parent = renameFrame
    Theme.corner(renameBox, 10)

    local ok = Theme.button("SAVE", Theme.GOOD, UDim2.fromOffset(160, 38))
    ok.Position = UDim2.fromOffset(20, 102)
    ok.Parent = renameFrame
    ok.Activated:Connect(function()
        if renameTarget and #renameBox.Text >= 2 then
            Net.get("RenameGoob"):FireServer(renameTarget, renameBox.Text)
        end
        renameFrame.Visible = false
        renameTarget = nil
    end)

    local cancel = Theme.button("CANCEL", Theme.BAD, UDim2.fromOffset(160, 38))
    cancel.Position = UDim2.new(1, -180, 0, 102)
    cancel.Parent = renameFrame
    cancel.Activated:Connect(function()
        renameFrame.Visible = false
        renameTarget = nil
    end)
end

Hud.onRename = function(goobId: string)
    renameTarget = goobId
    renameBox.Text = ""
    renameFrame.Visible = true
    renameBox:CaptureFocus()
end

-- ── Trade initiation ───────────────────────────────────────────────────────
-- Walking into the trade zone next to someone shows a single button. No chat
-- commands, no typing a username — both of which are where younger players get
-- socially engineered.

local tradePrompt: TextButton
do
    tradePrompt = Theme.button("🤝 TRADE", Theme.GOLD, UDim2.fromOffset(220, 54))
    tradePrompt.Position = UDim2.new(0.5, -110, 1, -140)
    tradePrompt.TextSize = 22
    tradePrompt.Visible = false
    tradePrompt.Parent = gui
end

local nearestPartner: Player? = nil

RunService.Heartbeat:Connect(function()
    if TradeUi.isOpen() then
        tradePrompt.Visible = false
        return
    end
    local char = player.Character
    local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
    if not root then tradePrompt.Visible = false return end

    local flat = Vector3.new(root.Position.X, 0, root.Position.Z)
    if flat.Magnitude > Config.TRADE_RANGE then
        tradePrompt.Visible = false
        nearestPartner = nil
        return
    end

    local best, bestDist = nil, math.huge
    for _, other in ipairs(Players:GetPlayers()) do
        if other ~= player then
            local oc = other.Character
            local orr = oc and oc:FindFirstChild("HumanoidRootPart") :: BasePart?
            if orr then
                local oflat = Vector3.new(orr.Position.X, 0, orr.Position.Z)
                if oflat.Magnitude <= Config.TRADE_RANGE then
                    local d = (orr.Position - root.Position).Magnitude
                    if d < bestDist then best, bestDist = other, d end
                end
            end
        end
    end

    nearestPartner = best
    tradePrompt.Visible = best ~= nil
    if best then tradePrompt.Text = "🤝 TRADE WITH " .. string.upper(best.DisplayName) end
end)

tradePrompt.Activated:Connect(function()
    if nearestPartner then
        Net.get("TradeRequest"):FireServer(nearestPartner.Name)
    end
end)

-- Incoming trade request: accept/decline strip.
do
    local strip = Instance.new("Frame")
    strip.Size = UDim2.fromOffset(360, 60)
    strip.Position = UDim2.new(0.5, -180, 0, 90)
    strip.BackgroundColor3 = Theme.BG
    strip.Visible = false
    strip.Parent = gui
    Theme.corner(strip, 14)
    Theme.stroke(strip, Theme.GOLD, 3)

    local accept = Theme.button("✅ ACCEPT", Theme.GOOD, UDim2.fromOffset(160, 42))
    accept.Position = UDim2.fromOffset(12, 9)
    accept.Parent = strip
    local decline = Theme.button("✖ NO", Theme.BAD, UDim2.fromOffset(160, 42))
    decline.Position = UDim2.new(1, -172, 0, 9)
    decline.Parent = strip

    accept.Activated:Connect(function()
        Net.get("TradeRespond"):FireServer(true)
        strip.Visible = false
    end)
    decline.Activated:Connect(function()
        Net.get("TradeRespond"):FireServer(false)
        strip.Visible = false
    end)

    Net.get("Notify").OnClientEvent:Connect(function(_: string, kind: string?)
        if kind == "trade" then
            strip.Visible = true
            task.delay(12, function() strip.Visible = false end)
        end
    end)
end

-- ── Boot ───────────────────────────────────────────────────────────────────

task.spawn(function()
    local snap = Net.get("RequestProfile"):InvokeServer()
    if snap then Hud.update(snap) end
end)

print("[GULP A GOOB] client ready")
