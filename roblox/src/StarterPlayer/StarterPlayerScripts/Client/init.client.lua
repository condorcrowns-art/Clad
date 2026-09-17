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
	elseif payload.kind == "nuke" then
		Effects.nuke(payload.position)
	elseif payload.kind == "shatter" then
		Effects.shatter(payload.position, payload.radius)
	elseif payload.kind == "sell" then
		Effects.shake(0.25, 0.15)
	elseif payload.kind == "rebirth" then
		Effects.shake(1.0, 0.5)
	end
end)

Remotes.event("PromptPurchase").OnClientEvent:Connect(function(payload)
	Panels.open("robux")
end)

-- ------------------------------------------------------------------ input
local lastSwing = 0

local function nodeUnderMouse(): BasePart?
	local target = mouse.Target
	if target and target:IsA("BasePart") then
		-- The glowing core is a child of the node; resolve up one level.
		if target.Name == "Core" and target.Parent and target.Parent:IsA("BasePart") then
			target = target.Parent :: BasePart
		end
		if target:GetAttribute("NodeIndex") ~= nil and not target:GetAttribute("Broken") then
			return target
		end
	end
	return nil
end

local function nearestNode(maxDist: number): BasePart?
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return nil end

	local best, bestDist = nil, maxDist
	for _, model in ipairs(Workspace:GetChildren()) do
		if model:IsA("Model") and model.Name:sub(1, 5) == "Zone_" then
			local folder = model:FindFirstChild("Nodes")
			if folder then
				for _, node in ipairs(folder:GetChildren()) do
					if node:IsA("BasePart") and not node:GetAttribute("Broken") then
						local d = (node.Position - root.Position).Magnitude
						if d < bestDist then best, bestDist = node, d end
					end
				end
			end
		end
	end
	return best
end

local function swing(node: BasePart?)
	if not node then return end
	local now = os.clock()
	local cd = (state and state.cooldown or Config.SWING_COOLDOWN)
	if now - lastSwing < cd then return end
	lastSwing = now

	Remotes.event("Swing"):FireServer(node)

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
		swing(nodeUnderMouse() or nearestNode(Config.MAX_SWING_REACH))
		return
	end

	if input.KeyCode == Enum.KeyCode.E then
		Remotes.event("Sell"):FireServer()
	elseif input.KeyCode == Enum.KeyCode.N then
		Remotes.event("Nuke"):FireServer()
	elseif input.KeyCode == Enum.KeyCode.K then
		Remotes.event("ShatterAll"):FireServer()
	elseif input.KeyCode == Enum.KeyCode.M then
		Panels.toggle("shop")
	elseif input.KeyCode == Enum.KeyCode.P then
		Panels.toggle("pets")
	elseif input.KeyCode == Enum.KeyCode.R then
		Panels.toggle("rebirth")
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
	if holding and not Panels.isOpen() then
		swing(nodeUnderMouse() or nearestNode(Config.MAX_SWING_REACH))
	elseif state.passes and state.passes.AutoSwing then
		swing(nearestNode(Config.MAX_SWING_REACH))
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

print("[Overclock] client ready")
