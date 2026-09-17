--!strict
-- OVERCLOCK SIMULATOR -- client bootstrap.
--
-- The client's whole job: draw the UI, read input, and send *intent* to the
-- server. It never computes a reward, never decides an outcome, and never
-- trusts its own copy of the numbers for anything but display.

local Players           = game:GetService("Players")
local UserInputService  = game:GetService("UserInputService")
local RunService        = game:GetService("RunService")
local Workspace         = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config  = require(Shared.Config)
local Remotes = require(Shared.Remotes)

local Theme   = require(script.Theme)
local Notify  = require(script.Notify)
local HUD     = require(script.HUD)
local Panels  = require(script.Panels)
local Effects = require(script.Effects)
local Trade   = require(script.Trade)
local Sound   = require(script.Sound)

local player = Players.LocalPlayer
local mouse  = player:GetMouse()

-- ------------------------------------------------------------------- gui
local gui = Instance.new("ScreenGui")
gui.Name = "OverclockUI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

Notify.mount(gui)
Effects.mount(gui)
Panels.mount(gui)
Trade.mount(gui, function() return state end)
HUD.mount(gui, function(id) Panels.toggle(id) end)

-- ----------------------------------------------------------------- state
local state: any = nil

local function setState(s)
	if not s then return end
	state = s
	HUD.update(s)
	Panels.setState(s)
end

Remotes.event("StateUpdate").OnClientEvent:Connect(setState)

task.spawn(function()
	local ok, snapshot = pcall(function()
		return Remotes.fn("GetState"):InvokeServer()
	end)
	if ok and snapshot then setState(snapshot) end
end)

-- Tick the HUD locally so boost timers and the session clock count down
-- smoothly instead of jumping on every server push.
task.spawn(function()
	while true do
		task.wait(1)
		if state then
			state.sessionTime = (state.sessionTime or 0) + 1
			HUD.update(state)
		end
	end
end)

-- --------------------------------------------------------------- effects
Remotes.event("Notify").OnClientEvent:Connect(function(payload)
	Notify.toast(payload.text, payload.kind)
end)

Remotes.event("Announce").OnClientEvent:Connect(function(payload)
	Notify.announce(payload.text)
end)

Remotes.event("HatchResult").OnClientEvent:Connect(function(payload)
	Effects.hatchReveal(payload.pets)
end)

Remotes.event("Effect").OnClientEvent:Connect(function(payload)
	if payload.kind == "nodeBreak" then
		Effects.nodeBreak(payload.position, payload.color, payload.amount or 0, payload.player == player.Name)
	elseif payload.kind == "sell" then
		Effects.shake(0.25, 0.15)
		Sound.play("sell")
	elseif payload.kind == "rebirth" then
		Effects.shake(1.0, 0.5)
		Sound.play("rebirth")
	elseif payload.kind == "evolve" then
		Effects.shake(0.6, 0.4)
		Sound.play("evolve")
	end
end)

Remotes.event("PromptPurchase").OnClientEvent:Connect(function(payload)
	Panels.open("robux")
end)

Remotes.event("TradeUpdate").OnClientEvent:Connect(function(payload)
	Trade.update(payload)
	if payload and payload.active then Panels.close() end
end)

Remotes.event("TradeInvite").OnClientEvent:Connect(function(payload)
	Trade.invite(payload, gui)
end)

-- ------------------------------------------------------------------ input
local lastSwing = 0

-- Nodes are Models now (a crystal cluster), so a click can land on any shard.
-- Resolve whatever was hit up to the part carrying the NodeIndex attribute.
local function resolveNode(target: Instance?): BasePart?
	if not target then return nil end
	local model = target:FindFirstAncestorOfClass("Model")
	if target:IsA("BasePart") and target:GetAttribute("NodeIndex") ~= nil then
		return if target:GetAttribute("Broken") then nil else target
	end
	if model then
		for _, child in ipairs(model:GetChildren()) do
			if child:IsA("BasePart") and child:GetAttribute("NodeIndex") ~= nil then
				return if child:GetAttribute("Broken") then nil else child
			end
		end
	end
	return nil
end

local function nodeUnderMouse(): BasePart?
	return resolveNode(mouse.Target)
end

-- Egg pedestals: walk up and click. A physical egg you can see other players
-- hatching at is worth far more than a row in a menu.
local function eggUnderMouse(): (string?, BasePart?)
	local target = mouse.Target
	if not target then return nil, nil end
	local candidates = { target }
	local model = target:FindFirstAncestorOfClass("Model")
	if model then
		for _, child in ipairs(model:GetChildren()) do table.insert(candidates, child) end
	end
	for _, c in ipairs(candidates) do
		if c:IsA("BasePart") then
			local eggId = c:GetAttribute("EggId")
			if type(eggId) == "string" then return eggId, c end
		end
	end
	return nil, nil
end

local EGG_REACH = 26

local function tryHatchAt(eggId: string, pad: BasePart): boolean
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return false end
	if (root.Position - pad.Position).Magnitude > EGG_REACH then
		Notify.toast("Walk closer to the egg to hatch it.", "warn")
		return false
	end
	Remotes.event("Hatch"):FireServer(eggId)
	return true
end

local function nearestNode(maxDist: number): BasePart?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return nil end

	local best, bestDist = nil, maxDist
	for _, zoneModel in ipairs(Workspace:GetChildren()) do
		if zoneModel:IsA("Model") and zoneModel.Name:sub(1, 5) == "Zone_" then
			local folder = zoneModel:FindFirstChild("Nodes")
			if folder then
				for _, nodeModel in ipairs(folder:GetChildren()) do
					for _, node in ipairs(nodeModel:GetChildren()) do
						if node:IsA("BasePart") and node:GetAttribute("NodeIndex") ~= nil
							and not node:GetAttribute("Broken") then
							local d = (node.Position - root.Position).Magnitude
							if d < bestDist then best, bestDist = node, d end
							break
						end
					end
				end
			end
		end
	end
	return best
end

-- Nearest egg pedestal, for the AUTO-HATCH pass.
local function nearestEgg(maxDist: number): (string?, BasePart?)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return nil, nil end
	local bestId, bestPad, bestDist = nil, nil, maxDist
	for _, zoneModel in ipairs(Workspace:GetChildren()) do
		if zoneModel:IsA("Model") and zoneModel.Name:sub(1, 5) == "Zone_" then
			for _, child in ipairs(zoneModel:GetChildren()) do
				if child:IsA("Model") and child.Name:sub(1, 4) == "Egg_" then
					for _, p in ipairs(child:GetChildren()) do
						if p:IsA("BasePart") and type(p:GetAttribute("EggId")) == "string" then
							local d = (p.Position - root.Position).Magnitude
							if d < bestDist then
								bestId, bestPad, bestDist = p:GetAttribute("EggId") :: string, p, d
							end
							break
						end
					end
				end
			end
		end
	end
	return bestId, bestPad
end

local function swing(node: BasePart?)
	if not node then return end
	local now = os.clock()
	local cd = (state and state.cooldown or Config.SWING_COOLDOWN)
	if now - lastSwing < cd then return end
	lastSwing = now

	Remotes.event("Swing"):FireServer(node)
	Sound.play("mine", 0.12)

	-- Local swing animation so the feedback is instant rather than one
	-- round-trip late.
	local char = player.Character
	local tool = char and char:FindFirstChild("ChipTool")
	local handle = tool and tool:FindFirstChild("Handle") :: BasePart?
	if handle then
		-- Purely visual nudge; the weld keeps it attached.
		Theme.tween(handle, 0.08, { Transparency = 0.25 })
		task.delay(0.1, function()
			if handle.Parent then Theme.tween(handle, 0.12, { Transparency = 0 }) end
		end)
	end
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end

	if input.UserInputType == Enum.UserInputType.MouseButton1
		or input.UserInputType == Enum.UserInputType.Touch then
		local eggId, pad = eggUnderMouse()
		if eggId and pad then
			tryHatchAt(eggId, pad)
			return
		end
		swing(nodeUnderMouse() or nearestNode(Config.MAX_SWING_REACH))
		return
	end

	if input.KeyCode == Enum.KeyCode.E then
		Remotes.event("Sell"):FireServer()
	elseif input.KeyCode == Enum.KeyCode.M then
		Panels.toggle("shop")
	elseif input.KeyCode == Enum.KeyCode.P then
		Panels.toggle("pets")
	elseif input.KeyCode == Enum.KeyCode.R then
		Panels.toggle("rebirth")
	elseif input.KeyCode == Enum.KeyCode.T then
		Panels.toggle("trade")
	elseif input.KeyCode == Enum.KeyCode.Escape then
		Panels.close()
	end
end)

-- Hold-to-mine: holding the button keeps swinging at whatever is under the
-- cursor. Every successful sim has this; without it, players' hands hurt and
-- they leave.
RunService.Heartbeat:Connect(function()
	if not state then return end
	local holding = UserInputService:IsMouseButtonPressed(Enum.UserInputType.MouseButton1)
	if holding and not Panels.isOpen() and not Trade.isOpen() then
		swing(nodeUnderMouse() or nearestNode(Config.MAX_SWING_REACH))
	elseif state.passes and state.passes.AutoSwing then
		swing(nearestNode(Config.MAX_SWING_REACH))
	end
end)

-- AUTO-HATCH: stand at a pedestal and it hatches while you can afford it.
task.spawn(function()
	while true do
		task.wait(1.2)
		if state and state.passes and state.passes.AutoHatch and not Trade.isOpen() then
			local eggId, pad = nearestEgg(EGG_REACH)
			if eggId and pad then
				Remotes.event("Hatch"):FireServer(eggId)
			end
		end
	end
end)

-- Mobile: a big thumb-friendly mine button, since IsMouseButtonPressed does
-- nothing on touch devices.
if UserInputService.TouchEnabled then
	local mineBtn = Theme.button({
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -20, 1, -150),
		Size = UDim2.new(0, 120, 0, 120),
		BackgroundColor3 = Theme.ACCENT,
		TextColor3 = Theme.BG,
		Font = Theme.FONT_BLACK,
		TextSize = 18,
		Text = "MINE",
		Parent = gui,
	})
	Theme.corner(mineBtn, 60)

	local held = false
	mineBtn.MouseButton1Down:Connect(function() held = true end)
	mineBtn.MouseButton1Up:Connect(function() held = false end)
	mineBtn.MouseLeave:Connect(function() held = false end)
	RunService.Heartbeat:Connect(function()
		if held then swing(nearestNode(Config.MAX_SWING_REACH)) end
	end)

	local sellBtn = Theme.button({
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -150, 1, -150),
		Size = UDim2.new(0, 90, 0, 90),
		BackgroundColor3 = Theme.GOOD,
		TextColor3 = Theme.BG,
		Font = Theme.FONT_BLACK,
		TextSize = 16,
		Text = "SELL",
		Parent = gui,
	})
	Theme.corner(sellBtn, 45)
	sellBtn.MouseButton1Click:Connect(function()
		Remotes.event("Sell"):FireServer()
	end)
end

Sound.startMusic()

print("[Overclock] client ready")
