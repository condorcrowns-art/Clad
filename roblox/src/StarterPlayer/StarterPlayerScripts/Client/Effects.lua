--!strict
-- Juice. This module is not optional polish -- in a clicker, the feedback IS
-- the game. Floating numbers, a screen shake on the nuke, and a slow reveal on
-- rare hatches are what make an identical loop feel good instead of hollow.

local TweenService = game:GetService("TweenService")
local Debris       = game:GetService("Debris")
local Workspace    = game:GetService("Workspace")
local RunService   = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Pets   = require(Shared.Pets)
local Format = require(Shared.Util.Format)

local Theme = require(script.Parent.Theme)

local Effects = {}
local gui: ScreenGui

function Effects.mount(parent: ScreenGui)
	gui = parent
end

-- --------------------------------------------------------- floating text
function Effects.floatText(position: Vector3, text: string, color: Color3)
	local part = Instance.new("Part")
	part.Size = Vector3.new(0.1, 0.1, 0.1)
	part.Transparency = 1
	part.Anchored = true
	part.CanCollide = false
	part.CFrame = CFrame.new(position + Vector3.new(0, 3, 0))
	part.Parent = Workspace

	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromScale(8, 3)
	bb.AlwaysOnTop = true
	bb.Parent = part

	local label = Theme.label({
		Size = UDim2.fromScale(1, 1),
		Text = text,
		Font = Theme.FONT_BLACK,
		TextSize = 26,
		TextColor3 = color,
		TextStrokeTransparency = 0.25,
		TextXAlignment = Enum.TextXAlignment.Center,
		Parent = bb,
	})

	TweenService:Create(part, TweenInfo.new(0.9, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		CFrame = part.CFrame * CFrame.new(math.random(-15, 15) / 10, 5, 0),
	}):Play()
	TweenService:Create(label, TweenInfo.new(0.9), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
	Debris:AddItem(part, 1)
end

-- ------------------------------------------------------------ node break
function Effects.nodeBreak(position: Vector3, color: Color3, amount: number, isMine: boolean)
	if isMine and amount > 0 then
		Effects.floatText(position, "+" .. Format.short(amount), color)
	end

	local part = Instance.new("Part")
	part.Size = Vector3.new(1, 1, 1)
	part.Anchored = true
	part.CanCollide = false
	part.CFrame = CFrame.new(position)
	part.Transparency = 1
	part.Parent = Workspace

	local emitter = Instance.new("ParticleEmitter")
	emitter.Color = ColorSequence.new(color)
	emitter.LightEmission = 1
	emitter.Lifetime = NumberRange.new(0.3, 0.6)
	emitter.Speed = NumberRange.new(14, 26)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1.1),
		NumberSequenceKeypoint.new(1, 0),
	})
	emitter.Rate = 0
	emitter.Parent = part
	emitter:Emit(22)

	Debris:AddItem(part, 1.2)
end

-- ------------------------------------------------------------ screenshake
function Effects.shake(intensity: number, duration: number)
	local camera = Workspace.CurrentCamera
	if not camera then return end
	local start = os.clock()
	local conn
	conn = RunService.RenderStepped:Connect(function()
		local elapsed = os.clock() - start
		if elapsed >= duration then
			conn:Disconnect()
			return
		end
		local falloff = 1 - (elapsed / duration)
		camera.CFrame = camera.CFrame * CFrame.new(
			(math.random() - 0.5) * intensity * falloff,
			(math.random() - 0.5) * intensity * falloff,
			0)
	end)
end

function Effects.nuke(position: Vector3)
	local part = Instance.new("Part")
	part.Shape = Enum.PartType.Ball
	part.Size = Vector3.new(4, 4, 4)
	part.Position = position
	part.Anchored = true
	part.CanCollide = false
	part.Material = Enum.Material.Neon
	part.Color = Color3.fromRGB(255, 180, 60)
	part.Transparency = 0.15
	part.Parent = Workspace

	TweenService:Create(part, TweenInfo.new(0.7, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
		Size = Vector3.new(220, 220, 220),
		Transparency = 1,
	}):Play()
	Debris:AddItem(part, 1)

	local dist = (position - (Workspace.CurrentCamera and Workspace.CurrentCamera.CFrame.Position or position)).Magnitude
	if dist < 300 then Effects.shake(1.6, 0.6) end
end

function Effects.shatter(position: Vector3, radius: number)
	local ring = Instance.new("Part")
	ring.Shape = Enum.PartType.Cylinder
	ring.Size = Vector3.new(1, 4, 4)
	ring.CFrame = CFrame.new(position) * CFrame.Angles(0, 0, math.rad(90))
	ring.Anchored = true
	ring.CanCollide = false
	ring.Material = Enum.Material.Neon
	ring.Color = Color3.fromRGB(140, 220, 255)
	ring.Transparency = 0.3
	ring.Parent = Workspace
	TweenService:Create(ring, TweenInfo.new(0.5, Enum.EasingStyle.Quint, Enum.EasingDirection.Out), {
		Size = Vector3.new(1, radius * 2, radius * 2),
		Transparency = 1,
	}):Play()
	Debris:AddItem(ring, 0.8)
	Effects.shake(0.8, 0.35)
end

-- ------------------------------------------------------------ hatch reveal
-- Held for 1.4s with a spinning placeholder before the reveal. That pause is
-- doing real work: anticipation is most of the perceived value of a hatch.
function Effects.hatchReveal(results)
	if not gui or #results == 0 then return end

	local shade = Theme.frame({
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 1,
		ZIndex = 20,
		Parent = gui,
	})
	Theme.tween(shade, 0.2, { BackgroundTransparency = 0.5 })

	local holder = Theme.frame({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0, 220 * #results + 20, 0, 240),
		BackgroundTransparency = 1,
		ZIndex = 21,
		Parent = shade,
	})
	local list = Instance.new("UIListLayout")
	list.FillDirection = Enum.FillDirection.Horizontal
	list.Padding = UDim.new(0, 12)
	list.HorizontalAlignment = Enum.HorizontalAlignment.Center
	list.VerticalAlignment = Enum.VerticalAlignment.Center
	list.Parent = holder

	local cards = {}
	for i, r in ipairs(results) do
		local def = Pets.byId[r.id]
		local variant = Pets.variantById[r.variant]
		local color = if variant and variant.id ~= "normal" then variant.color else (def and def.color or Theme.ACCENT)

		local card = Theme.frame({
			Size = UDim2.new(0, 200, 0, 220),
			BackgroundColor3 = Theme.BG,
			LayoutOrder = i,
			ZIndex = 21,
			Parent = holder,
		})
		Theme.corner(card, 16)
		Theme.stroke(card, color, 3, 0.1)

		local icon = Theme.label({
			Position = UDim2.new(0, 0, 0, 30),
			Size = UDim2.new(1, 0, 0, 90),
			Text = "\u{2753}",
			TextSize = 64,
			TextXAlignment = Enum.TextXAlignment.Center,
			ZIndex = 22,
			Parent = card,
		})
		local name = Theme.label({
			Position = UDim2.new(0, 8, 0, 128),
			Size = UDim2.new(1, -16, 0, 44),
			Text = "...",
			Font = Theme.FONT_BLACK,
			TextSize = 18,
			TextColor3 = color,
			TextWrapped = true,
			TextXAlignment = Enum.TextXAlignment.Center,
			ZIndex = 22,
			Parent = card,
		})
		local mult = Theme.label({
			Position = UDim2.new(0, 8, 0, 174),
			Size = UDim2.new(1, -16, 0, 26),
			Text = "",
			TextSize = 15,
			TextColor3 = Theme.TEXT_DIM,
			TextXAlignment = Enum.TextXAlignment.Center,
			ZIndex = 22,
			Parent = card,
		})
		cards[i] = { card = card, icon = icon, name = name, mult = mult, color = color, r = r, variant = variant }
		Theme.pop(card, UDim2.new(0, 200, 0, 220))
	end

	task.spawn(function()
		local spin = 0
		local spinning = true
		task.spawn(function()
			while spinning do
				spin += 1
				for _, c in ipairs(cards) do
					c.icon.Text = ({ "\u{25D0}", "\u{25D3}", "\u{25D1}", "\u{25D2}" })[(spin % 4) + 1]
				end
				task.wait(0.08)
			end
		end)

		task.wait(1.4)
		spinning = false

		for _, c in ipairs(cards) do
			c.icon.Text = "\u{1F43E}"
			c.icon.TextColor3 = c.color
			c.name.Text = c.r.name
			c.mult.Text = "+" .. Format.mult(c.r.mult):gsub("x", "") .. " multiplier"
			Theme.pop(c.card, UDim2.new(0, 200, 0, 220))

			if c.variant and c.variant.id ~= "normal" then
				Effects.shake(0.5, 0.3)
			end
		end

		task.wait(2.2)
		Theme.tween(shade, 0.25, { BackgroundTransparency = 1 })
		task.wait(0.3)
		shade:Destroy()
	end)
end

return Effects
