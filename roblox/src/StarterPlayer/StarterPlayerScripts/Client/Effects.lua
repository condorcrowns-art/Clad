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

local Theme    = require(script.Parent.Theme)
local Viewport = require(script.Parent.Viewport)
local Sound    = require(script.Parent.Sound)
local Assets   = require(Shared.Assets)

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
	local texture = Assets.particleId("nodeBreak")
	if texture then emitter.Texture = texture end
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

		-- Placeholder shown while the reveal spins; swapped for the real 3D
		-- familiar at the reveal moment.
		local iconHost = Theme.frame({
			Position = UDim2.new(0, 10, 0, 22),
			Size = UDim2.new(1, -20, 0, 100),
			BackgroundTransparency = 1,
			ZIndex = 22,
			Parent = card,
		})
		local icon = Theme.label({
			Size = UDim2.fromScale(1, 1),
			Text = "\u{2753}",
			TextSize = 64,
			TextXAlignment = Enum.TextXAlignment.Center,
			ZIndex = 23,
			Parent = iconHost,
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
		cards[i] = { card = card, icon = icon, iconHost = iconHost, name = name, mult = mult, color = color, r = r, variant = variant }
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

		Sound.play("hatch")
		task.wait(1.4)
		spinning = false
		Sound.play("reveal")

		for _, c in ipairs(cards) do
			-- Reveal: drop the placeholder, render the actual familiar in 3D.
			c.icon:Destroy()
			Viewport.pet(c.iconHost, c.r.id, c.r.variant, 23)
			c.name.Text = c.r.name .. (c.r.serial and ("  #" .. c.r.serial) or "")
			c.mult.Text = "+" .. Format.mult(c.r.mult):gsub("x", "") .. " multiplier"
			Theme.pop(c.card, UDim2.new(0, 200, 0, 220))

			if c.variant and c.variant.id ~= "normal" then
				Effects.shake(0.5, 0.3)
				Sound.play("rare")
			end
		end

		task.wait(2.2)
		Theme.tween(shade, 0.25, { BackgroundTransparency = 1 })
		task.wait(0.3)
		shade:Destroy()
	end)
end

return Effects
