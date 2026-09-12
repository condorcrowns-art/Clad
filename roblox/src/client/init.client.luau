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
local Movement = require(Shared.Movement)
local Pit = require(Shared.Pit)

local Theme = require(script.Theme)
local Layout = require(script.Layout)
local Hud = require(script.Hud)
local TradeUi = require(script.TradeUi)
local Roll = require(script.Roll)
local Panels = require(script.Panels)
local ArenaHud = require(script.ArenaHud)
local Stick = require(script.Stick)
local Juice = require(script.Juice)

local player = Players.LocalPlayer
local gui = Hud.build()
TradeUi.build(gui)

-- ArenaHud takes over the persistent chrome. Hud keeps toasts, the drawer and
-- the coach; it stops drawing its own stat panel, age line and drawer button,
-- which is where most of the old overlap came from.
ArenaHud.build()
Hud.setArenaMode(true)

-- Sound and every other feel effect now live in Juice, which reads its ids
-- from Config and stays silent when they are unset. This file used to keep a
-- second copy of the same asset ids, which meant fixing a bad one in one place
-- left it broken in the other.

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
        Juice.play("rare")
    elseif kind == "good" then
        Juice.play("catch", 0.2)
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
    Juice.play("catch", 0.25)
end

Hud.onBuyEgg = function()
    Net.get("BuyEgg"):FireServer()
end

Hud.onDismissCoach = function()
    Net.get("DismissTutorial"):FireServer()
end

-- Gulping is irreversible, so it gets a real two-step confirmation with the
-- consequence spelled out in words a child will actually read.
local pendingGulp: string? = nil
local confirmFrame: Frame
local tradeStrip: Frame

local function buildGulpConfirm()
    confirmFrame = Instance.new("Frame")
    confirmFrame.Name = "GulpConfirm"
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
    yes.Name = "GulpYes"
    yes.Parent = confirmFrame
    yes.Activated:Connect(function()
        local state = Hud.getState()
        if pendingGulp and state then
            local activeId = state.activeGoobId
            Net.get("GulpGoob"):FireServer(activeId, pendingGulp)
            Juice.play("gulp")
        end
        pendingGulp = nil
        confirmFrame.Visible = false
    end)

    local no = Theme.button("✖ KEEP IT", Theme.ACCENT, UDim2.fromOffset(170, 44))
    no.Name = "GulpNo"
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
    renameFrame.Name = "RenameDialog"
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
    ok.Name = "RenameSave"
    ok.Parent = renameFrame
    ok.Activated:Connect(function()
        if renameTarget and #renameBox.Text >= 2 then
            Net.get("RenameGoob"):FireServer(renameTarget, renameBox.Text)
        end
        renameFrame.Visible = false
        renameTarget = nil
    end)

    local cancel = Theme.button("CANCEL", Theme.BAD, UDim2.fromOffset(160, 38))
    cancel.Name = "RenameCancel"
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
    tradePrompt.Name = "TradePrompt"
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
    strip.Name = "TradeRequestStrip"
    strip.BackgroundColor3 = Theme.BG
    strip.Visible = false
    strip.Parent = gui
    Theme.corner(strip, 14)
    Theme.stroke(strip, Theme.GOLD, 3)

    local accept = Theme.button("✅ ACCEPT", Theme.GOOD, UDim2.fromOffset(160, 42))
    accept.Name = "TradeAccept"
    accept.Parent = strip
    local decline = Theme.button("✖ NO", Theme.BAD, UDim2.fromOffset(160, 42))
    decline.Name = "TradeDecline"
    decline.Parent = strip
    tradeStrip = strip

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

-- ── Responsive pass for the dialogs ────────────────────────────────────────
-- Each of these was a hardcoded pixel box centred with a hardcoded half-offset,
-- which put all four of them partly off a phone screen.

local function layoutDialogs()
    local compact = Layout.isCompact()
    local u = Layout.usable()
    local pad = compact and 12 or 20
    local btnH = compact and Layout.MIN_TAP or 44

    -- Gulp confirmation.
    local cSize = Layout.panel(420, compact and 250 or 210)
    confirmFrame.Size = cSize
    confirmFrame.Position = Layout.centre(cSize)
    local cw, ch = cSize.X.Offset, cSize.Y.Offset
    local body = confirmFrame:FindFirstChild("Body") :: TextLabel?
    if body then
        body.Position = UDim2.fromOffset(pad, compact and 44 or 52)
        body.Size = UDim2.new(1, -pad * 2, 0, ch - (compact and 44 or 52) - btnH - 20)
        body.TextSize = compact and 15 or 17
    end
    local yes = confirmFrame:FindFirstChild("GulpYes") :: TextButton?
    local no = confirmFrame:FindFirstChild("GulpNo") :: TextButton?
    local halfW = math.floor((cw - pad * 3) / 2)
    if yes then
        yes.Size = UDim2.fromOffset(halfW, btnH)
        yes.Position = UDim2.fromOffset(pad, ch - btnH - pad)
    end
    if no then
        no.Size = UDim2.fromOffset(halfW, btnH)
        no.Position = UDim2.fromOffset(pad * 2 + halfW, ch - btnH - pad)
    end

    -- Rename dialog.
    local rSize = Layout.panel(400, compact and 180 or 150)
    renameFrame.Size = rSize
    renameFrame.Position = Layout.centre(rSize)
    local rw, rh = rSize.X.Offset, rSize.Y.Offset
    renameBox.Position = UDim2.fromOffset(pad, compact and 44 or 52)
    renameBox.Size = UDim2.new(1, -pad * 2, 0, compact and btnH or 42)
    local rsave = renameFrame:FindFirstChild("RenameSave") :: TextButton?
    local rcancel = renameFrame:FindFirstChild("RenameCancel") :: TextButton?
    local rHalf = math.floor((rw - pad * 3) / 2)
    if rsave then
        rsave.Size = UDim2.fromOffset(rHalf, btnH)
        rsave.Position = UDim2.fromOffset(pad, rh - btnH - pad)
    end
    if rcancel then
        rcancel.Size = UDim2.fromOffset(rHalf, btnH)
        rcancel.Position = UDim2.fromOffset(pad * 2 + rHalf, rh - btnH - pad)
    end

    -- Incoming trade request strip, pinned under the top bar.
    if tradeStrip then
        local sSize = Layout.panel(360, compact and 56 or 60, compact and 40 or 24, 8)
        tradeStrip.Size = sSize
        tradeStrip.Position = UDim2.fromOffset(
            math.floor((u.X - sSize.X.Offset) / 2), compact and 74 or 90)
        local sw = sSize.X.Offset
        local sHalf = math.floor((sw - 36) / 2)
        local acc = tradeStrip:FindFirstChild("TradeAccept") :: TextButton?
        local dec = tradeStrip:FindFirstChild("TradeDecline") :: TextButton?
        local sh = sSize.Y.Offset
        if acc then
            acc.Size = UDim2.fromOffset(sHalf, sh - 16)
            acc.Position = UDim2.fromOffset(12, 8)
        end
        if dec then
            dec.Size = UDim2.fromOffset(sHalf, sh - 16)
            dec.Position = UDim2.fromOffset(sw - sHalf - 12, 8)
        end
    end

    -- The "trade with X" prompt has to clear the touch controls too, so it
    -- rides just above the drawer button rather than at a fixed offset.
    if tradePrompt then
        local pw = compact and math.min(230, u.X - 40) or 220
        local ph = compact and Layout.MIN_TAP or 54
        tradePrompt.Size = UDim2.fromOffset(pw, ph)
        local y = compact and (u.Y - ph - Layout.MIN_TAP - 26) or (u.Y - 140)
        tradePrompt.Position = UDim2.fromOffset(math.floor((u.X - pw) / 2), y)
        tradePrompt.TextSize = compact and 17 or 22
    end
end

layoutDialogs()
Layout.changed.Event:Connect(layoutDialogs)

-- ── Rolling ────────────────────────────────────────────────────────────────
-- Find our ball whenever the server (re)creates it, point the camera at it, and
-- drive the controller every frame.

local currentBall: BasePart? = nil

local function findBall(): BasePart?
    return Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
end

local function bindBall(ball: BasePart?)
    currentBall = ball
    local snap = Hud.getState()
    local mass = 10
    if snap then
        for _, g in ipairs(snap.goobs) do
            if g.isActive then mass = g.mass end
        end
    end
    Roll.setBall(ball, mass)
    local camera = Workspace.CurrentCamera
    if camera and ball then
        camera.CameraSubject = ball
        camera.CameraType = Enum.CameraType.Custom
    end
end

Workspace.ChildAdded:Connect(function(child)
    if child.Name == "GoobBall_" .. player.UserId then
        task.wait(0.1)
        bindBall(child :: BasePart)
    end
end)

task.spawn(function()
    -- The ball may already exist before this script finishes loading.
    for _ = 1, 60 do
        local b = findBall()
        if b then bindBall(b) break end
        task.wait(0.25)
    end
end)

Juice.start()

Net.get("Effect").OnClientEvent:Connect(function(kind, a, b)
    if kind == "catch" then Juice.onCatch(a)
    elseif kind == "gulp" then Juice.onGulp()
    elseif kind == "ascend" then Juice.onAscend()
    elseif kind == "shove" then Juice.onShove(a, b or 0.5) end
end)

Roll.bindInput()
Roll.onDash = function()
    Net.get("Dashed"):FireServer()
    Juice.play("catch", 0.6)
end

RunService.RenderStepped:Connect(function(dt)
    if currentBall and not currentBall.Parent then
        bindBall(findBall())
    end
    Roll.step(dt)
end)

-- Jump is Roblox's OWN jump button and Space bar. The default controls are
-- deliberately left enabled: Humanoid.MoveDirection gives us keyboard, gamepad
-- and the mobile thumbstick for free, and Humanoid.Jumping gives us the jump
-- button for free. Disabling them to draw our own would have cost the
-- thumbstick, and adding a second jump button on top of Roblox's would have put
-- an unreachable control under a real one.
do
    local function bindJump(character)
        local hum = character:WaitForChild("Humanoid", 5)
        if not hum then return end
        hum.Jumping:Connect(function(active)
            if active then Roll.jump() end
        end)
    end
    if player.Character then bindJump(player.Character) end
    player.CharacterAdded:Connect(bindJump)
end

-- Dash is the one verb Roblox has no button for, so it gets ours — stacked in
-- the gap between the thumbstick and the jump button, the only reachable part
-- of a phone's bottom edge.
do
    local Layout = require(script.Layout)

    -- No on-screen dash button. ArenaHud's power button sits in the same
    -- thumb gap, and two round buttons fighting for the one reachable part of
    -- a phone's bottom edge is the overlap problem in miniature. Dash is still
    -- on the keyboard and the gamepad, and DASH is also a carryable power.
    local dashBtn = Instance.new("TextButton")
    dashBtn.Name = "DashButton"
    dashBtn.Visible = false
    dashBtn.Text = ""
    dashBtn.Parent = gui

    -- A charge meter, because a dash you cannot count is a dash you cannot plan.
    local meter = Instance.new("Frame")
    meter.Name = "DashMeter"
    meter.BackgroundTransparency = 1
    -- Hidden with the dash button it belonged to. The power button carries its
    -- own cooldown sweep, and a second charge meter in the same corner is the
    -- overlap complaint wearing a different hat.
    meter.Visible = false
    meter.Parent = gui
    local pips = {}
    for i = 1, Movement.DASH_CHARGES do
        local pip = Instance.new("Frame")
        pip.Name = "Pip" .. i
        pip.BackgroundColor3 = Theme.ACCENT
        pip.Parent = meter
        Theme.corner(pip, 6)
        Theme.stroke(pip, Color3.fromRGB(16, 18, 30), 2)
        table.insert(pips, pip)
    end

    local function layoutRoll()
        local compact = Layout.isCompact()
        local touch = Layout.isTouch()
        local u = Layout.usable()
        local size = touch and (Layout.MIN_TAP + 20) or 56

        dashBtn.Visible = false   -- superseded by ArenaHud's power button
        dashBtn.Size = UDim2.fromOffset(size, size)

        -- Sit directly above the drawer button, both inside the safe gap.
        local gapL, gapR = Layout.bottomGap()
        local cx = (gapL + gapR) / 2
        if gapR - gapL < size + 16 then cx = gapL + size / 2 + 8 end
        dashBtn.Position = UDim2.fromOffset(
            Layout.fit(cx - size / 2, 8, u.X - size - 8),
            u.Y - size * 2 - 26)

        local pw, ph, gap = compact and 24 or 34, compact and 8 or 10, 5
        meter.Size = UDim2.fromOffset(Movement.DASH_CHARGES * (pw + gap), ph)
        meter.Position = UDim2.fromOffset(
            touch and Layout.fit(cx - meter.Size.X.Offset / 2, 8, u.X - meter.Size.X.Offset - 8)
                  or math.floor((u.X - meter.Size.X.Offset) / 2),
            touch and (u.Y - size * 2 - 40) or (u.Y - 34))
        for i, pip in ipairs(pips) do
            pip.Size = UDim2.fromOffset(pw, ph)
            pip.Position = UDim2.fromOffset((i - 1) * (pw + gap), 0)
        end
    end
    layoutRoll()
    Layout.changed.Event:Connect(layoutRoll)

    RunService.RenderStepped:Connect(function()
        local have = Roll.charges()
        for i, pip in ipairs(pips) do
            if i <= have then
                pip.BackgroundColor3 = Theme.ACCENT
                pip.BackgroundTransparency = 0
            elseif i == have + 1 then
                pip.BackgroundColor3 = Theme.ACCENT
                pip.BackgroundTransparency = 1 - Roll.refillProgress() * 0.75
            else
                pip.BackgroundColor3 = Theme.BG_SOFT
                pip.BackgroundTransparency = 0.35
            end
        end
    end)
end

-- ── Panels: wardrobe, season, crew ─────────────────────────────────────────


-- ── The arena ──────────────────────────────────────────────────────────────

-- Where the power is pointed. Where you are STEERING beats where the camera
-- happens to face: a player mid-turn is looking at where they want to go, and
-- firing a dash at the camera instead would feel like the game ignoring them.
local function aimVector(): Vector3?
    local move = Stick.moveVector()
    if move.Magnitude > 0.15 then
        return move.Unit
    end
    local camera = Workspace.CurrentCamera
    if not camera then return nil end
    local look = camera.CFrame.LookVector
    local flat = Vector3.new(look.X, 0, look.Z)
    return flat.Magnitude > 0.01 and flat.Unit or nil
end

local UsePower = Net.get("UsePower")
local lastPower = 0

local function firePower()
    -- Client-side rate limit. The server enforces the real cooldown; this only
    -- stops a held key from filling the remote queue with requests the server
    -- is going to refuse anyway.
    local now = os.clock()
    if now - lastPower < 0.15 then return end
    lastPower = now
    UsePower:FireServer(aimVector())
end

ArenaHud.on.usePower = function() firePower() end
ArenaHud.on.setPower = function(id) Net.get("SetPower"):FireServer(id) end
ArenaHud.on.equipTrinket = function(id, slot) Net.get("EquipTrinket"):FireServer(id, slot) end
ArenaHud.on.openCrate = function(id) Net.get("OpenCrate"):FireServer(id) end

-- The dock's three delegated tabs. They close the sheet before opening, and
-- "close" shuts everything — so there is still never more than one panel up.
ArenaHud.on.openLegacy = function(which)
    if which == "close" then
        Hud.setDrawerOpen(false)
    else
        Hud.openDrawerTab(which)
    end
end
ArenaHud.on.joinPit = function() Net.get("PitJoin"):FireServer() end
ArenaHud.on.leavePit = function() Net.get("PitLeave"):FireServer() end

Net.get("ArenaSync").OnClientEvent:Connect(function(state)
    ArenaHud.setArena(state)
end)

Net.get("CrateResult").OnClientEvent:Connect(function(result)
    ArenaHud.crateResult(result)
    Juice.play("unlock")
end)

UserInputService.InputBegan:Connect(function(input, processed)
    if processed then return end
    if input.KeyCode == Enum.KeyCode.Q
        or input.KeyCode == Enum.KeyCode.ButtonX then
        firePower()
    elseif input.KeyCode == Enum.KeyCode.Escape then
        ArenaHud.closeSheet()
    end
end)

Panels.onEquip = function(kind, id) Net.get("EquipCosmetic"):FireServer(kind, id) end
Panels.onClaimSeason = function(tier, premium) Net.get("ClaimSeason"):FireServer(tier, premium) end
Panels.onCrewCreate = function(name, tag) Net.get("CrewCreate"):FireServer(name, tag) end
Panels.onCrewJoin = function(tag) Net.get("CrewJoin"):FireServer(tag) end
Panels.onCrewLeave = function() Net.get("CrewLeave"):FireServer() end
Panels.onCrewClaim = function() Net.get("CrewClaim"):FireServer() end
Panels.onBuy = function(id)
    -- MarketplaceService prompts live client-side. The server is told so it can
    -- say plainly when something is not on sale yet, rather than the prompt
    -- failing silently and reading as a broken shop.
    Net.get("BuyProduct"):FireServer(id)
end

Net.get("CrewSync").OnClientEvent:Connect(function(data)
    Panels.setCrew(data)
    local snap = Hud.getState()
    if snap then Hud.update(snap) end
end)

-- ── The Sumo Pit ───────────────────────────────────────────────────────────
-- A small always-on strip rather than a menu: the Pit is a place you roll to,
-- and what matters is knowing whether a match is forming while you are moving.
do
    local Layout = require(script.Layout)

    local strip = Instance.new("Frame")
    strip.Name = "PitStrip"
    strip.BackgroundColor3 = Theme.BG
    strip.BackgroundTransparency = 0.1
    strip.Visible = false
    strip.Parent = gui
    Theme.corner(strip, 14)
    Theme.stroke(strip, Color3.fromRGB(184, 128, 122), 3)

    local line = Theme.label({ Name = "Line", Text = "", TextSize = 15 })
    line.Parent = strip
    local sub = Theme.label({ Name = "Sub", Text = "", TextSize = 12,
        TextColor3 = Theme.TEXT_DIM })
    sub.Parent = strip

    local joinBtn = Theme.button("🥊 ENTER", Theme.BAD, UDim2.fromOffset(110, 36))
    joinBtn.Name = "PitJoin"
    joinBtn.TextSize = 15
    joinBtn.Parent = strip
    local queued = false
    joinBtn.Activated:Connect(function()
        if queued then Net.get("PitLeave"):FireServer()
        else Net.get("PitJoin"):FireServer() end
    end)

    local function layoutPit()
        local compact = Layout.isCompact()
        local touch = Layout.isTouch()
        local u = Layout.usable()
        local w = compact and math.min(300, u.X - 24) or 340
        local h = compact and 60 or 66
        strip.Size = UDim2.fromOffset(w, h)
        -- Below the dock AND below the status strip. At y=90 it sat directly
        -- on top of both, which is the overlap this whole pass exists to end.
        strip.Position = UDim2.fromOffset(math.floor((u.X - w) / 2), compact and 176 or 206)
        line.Position = UDim2.fromOffset(12, 6)
        line.Size = UDim2.new(1, -140, 0, 20)
        sub.Position = UDim2.fromOffset(12, 28)
        sub.Size = UDim2.new(1, -140, 0, 18)
        local bh = touch and Layout.MIN_TAP or 36
        joinBtn.Size = UDim2.fromOffset(110, bh)
        joinBtn.Position = UDim2.fromOffset(w - 122, math.floor((h - bh) / 2))
    end
    layoutPit()
    Layout.changed.Event:Connect(layoutPit)

    local nearPit = false
    RunService.Heartbeat:Connect(function()
        local ball = Workspace:FindFirstChild("GoobBall_" .. player.UserId) :: BasePart?
        if not ball then strip.Visible = false return end
        local d = (ball.Position - Pit.CENTRE).Magnitude
        nearPit = d < Pit.START_RADIUS + 140
        -- Compact screens get the dock's Standoff tab instead. On a 320px-tall
        -- phone there is no row left for a third banner that does not land on
        -- the coach or the power button, and a duplicate entry point is not
        -- worth an overlap.
        strip.Visible = nearPit and not Layout.isCompact()
    end)

    Net.get("PitSync").OnClientEvent:Connect(function(state)
        if not state then return end
        ArenaHud.setPit(state)
        local mine = false
        for _, n in ipairs(state.alive or {}) do
            if n == player.DisplayName then mine = true end
        end
        queued = mine and not state.inMatch

        if state.inMatch then
            line.Text = ("🥊 FIGHT  ·  %d left"):format(#(state.alive or {}))
            sub.Text = ("ring %.0f  ·  pot 💧%s  ·  %ds")
                :format(state.radius or 0, state.potText or "0",
                        math.max(0, math.ceil((state.matchSeconds or 0) - (state.elapsed or 0))))
            joinBtn.Text = mine and "FIGHTING" or "WATCHING"
            joinBtn.BackgroundColor3 = Theme.BG_SOFT
        else
            line.Text = ("🥊 SUMO PIT  ·  %d/%d waiting"):format(state.queued or 0, state.minPlayers or 2)
            sub.Text = (state.lobbySeconds or 0) > 0
                and ("starting in %ds"):format(state.lobbySeconds)
                or "stake 💧 · last one in the ring wins the pot"
            joinBtn.Text = queued and "✖ LEAVE" or "🥊 ENTER"
            joinBtn.BackgroundColor3 = queued and Theme.WARN or Theme.BAD
        end
    end)
end

-- ── Ascension prompt ───────────────────────────────────────────────────────
do
    local Layout = require(script.Layout)
    local prompt = Theme.button("👑 ASCEND", Theme.GOLD, UDim2.fromOffset(240, 60))
    prompt.Name = "AscendPrompt"
    prompt.TextSize = 24
    prompt.Visible = false
    prompt.Parent = gui

    local confirm = Instance.new("Frame")
    confirm.Name = "AscendConfirm"
    confirm.BackgroundColor3 = Theme.BG
    confirm.Visible = false
    confirm.ZIndex = 30
    confirm.Parent = gui
    Theme.corner(confirm, 18)
    Theme.stroke(confirm, Theme.GOLD, 4)

    local title = Theme.label({ Text = "👑 ASCEND?", TextSize = 28,
        TextColor3 = Theme.GOLD, ZIndex = 31 })
    title.Parent = confirm
    local body = Theme.label({ Name = "Body", Text = "", TextSize = 16,
        TextWrapped = true, TextColor3 = Theme.TEXT_DIM, ZIndex = 31,
        TextYAlignment = Enum.TextYAlignment.Top })
    body.Parent = confirm

    local yes = Theme.button("👑 DO IT", Theme.GOLD, UDim2.fromOffset(160, 44))
    yes.Name = "AscendYes"; yes.ZIndex = 31; yes.Parent = confirm
    local no = Theme.button("✖ NOT YET", Theme.ACCENT, UDim2.fromOffset(160, 44))
    no.Name = "AscendNo"; no.ZIndex = 31; no.Parent = confirm

    local function layoutAscend()
        local compact = Layout.isCompact()
        local u = Layout.usable()
        local pw = compact and math.min(220, u.X - 40) or 240
        local ph = compact and Layout.MIN_TAP or 60
        prompt.Size = UDim2.fromOffset(pw, ph)
        prompt.Position = UDim2.fromOffset(math.floor((u.X - pw) / 2), math.floor(u.Y * 0.62))
        prompt.TextSize = compact and 18 or 24

        local size = Layout.panel(440, compact and 270 or 240)
        confirm.Size = size
        confirm.Position = Layout.centre(size)
        local cw, ch = size.X.Offset, size.Y.Offset
        local pad = compact and 12 or 20
        title.Position = UDim2.fromOffset(pad, 14)
        title.Size = UDim2.new(1, -pad * 2, 0, 30)
        body.Position = UDim2.fromOffset(pad, 50)
        body.Size = UDim2.new(1, -pad * 2, 0, ch - 50 - (compact and 52 or 60) - pad)
        local bh = compact and Layout.MIN_TAP or 44
        local half = math.floor((cw - pad * 3) / 2)
        yes.Size = UDim2.fromOffset(half, bh)
        yes.Position = UDim2.fromOffset(pad, ch - bh - pad)
        no.Size = UDim2.fromOffset(half, bh)
        no.Position = UDim2.fromOffset(pad * 2 + half, ch - bh - pad)
    end
    layoutAscend()
    Layout.changed.Event:Connect(layoutAscend)

    prompt.Activated:Connect(function()
        local snap = Hud.getState()
        local p = snap and snap.ascendPreview
        if not p then return end
        body.Text = ("%s will be DESTROYED forever.\n\n⚡ %s of mass and %s of age, gone.\n\nYou keep Crest %d — every bite of food becomes worth %.0f%% instead of %.0f%%, permanently, for every Goob you ever raise.")
            :format(p.losing, Format.short(p.losingMass), Format.duration(p.losingAge),
                    p.crestsAfter, p.multiplierAfter * 100, p.multiplierBefore * 100)
        confirm.Visible = true
    end)
    yes.Activated:Connect(function()
        Net.get("Ascend"):FireServer()
        confirm.Visible = false
    end)
    no.Activated:Connect(function() confirm.Visible = false end)

    Net.get("StateSync").OnClientEvent:Connect(function(snap)
        prompt.Visible = snap.canAscend == true and not confirm.Visible
    end)
end

-- ── Boot ───────────────────────────────────────────────────────────────────

task.spawn(function()
    local snap = Net.get("RequestProfile"):InvokeServer()
    if snap then Hud.update(snap) end
end)

print("[GULP A GOOB] client ready")
