--!strict
-- Tiny UI kit. Everything in the game's interface is built from these six
-- helpers, which is why the whole thing looks like one product instead of six
-- different tutorials stitched together.

local TweenService = game:GetService("TweenService")

local Theme = {}

Theme.BG        = Color3.fromRGB(16, 18, 28)
Theme.BG_SOFT   = Color3.fromRGB(24, 27, 40)
Theme.BG_LIFT   = Color3.fromRGB(34, 38, 55)
Theme.ACCENT    = Color3.fromRGB(110, 200, 255)
Theme.ACCENT_2  = Color3.fromRGB(190, 130, 255)
Theme.GOOD      = Color3.fromRGB(110, 240, 170)
Theme.WARN      = Color3.fromRGB(255, 180, 90)
Theme.BAD       = Color3.fromRGB(255, 100, 120)
Theme.GOLD      = Color3.fromRGB(255, 205, 70)
Theme.TEXT      = Color3.fromRGB(236, 240, 250)
Theme.TEXT_DIM  = Color3.fromRGB(150, 160, 185)

Theme.FONT      = Enum.Font.GothamMedium
Theme.FONT_BOLD = Enum.Font.GothamBold
Theme.FONT_BLACK= Enum.Font.GothamBlack

function Theme.corner(parent: Instance, radius: number?)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius or 10)
	c.Parent = parent
	return c
end

function Theme.stroke(parent: Instance, color: Color3?, thickness: number?, transparency: number?)
	local s = Instance.new("UIStroke")
	s.Color = color or Theme.BG_LIFT
	s.Thickness = thickness or 1.5
	s.Transparency = transparency or 0.35
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
	return s
end

function Theme.gradient(parent: Instance, a: Color3, b: Color3, rotation: number?)
	local g = Instance.new("UIGradient")
	g.Color = ColorSequence.new(a, b)
	g.Rotation = rotation or 90
	g.Parent = parent
	return g
end

function Theme.padding(parent: Instance, px: number)
	local p = Instance.new("UIPadding")
	p.PaddingTop = UDim.new(0, px)
	p.PaddingBottom = UDim.new(0, px)
	p.PaddingLeft = UDim.new(0, px)
	p.PaddingRight = UDim.new(0, px)
	p.Parent = parent
	return p
end

function Theme.frame(props): Frame
	local f = Instance.new("Frame")
	f.BackgroundColor3 = Theme.BG_SOFT
	f.BorderSizePixel = 0
	for k, v in pairs(props or {}) do (f :: any)[k] = v end
	return f
end

function Theme.label(props): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Font = Theme.FONT
	l.TextColor3 = Theme.TEXT
	l.TextSize = 16
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.RichText = true
	for k, v in pairs(props or {}) do (l :: any)[k] = v end
	return l
end

function Theme.button(props): TextButton
	local b = Instance.new("TextButton")
	b.BackgroundColor3 = Theme.BG_LIFT
	b.BorderSizePixel = 0
	b.AutoButtonColor = false
	b.Font = Theme.FONT_BOLD
	b.TextColor3 = Theme.TEXT
	b.TextSize = 16
	for k, v in pairs(props or {}) do (b :: any)[k] = v end
	Theme.corner(b, 8)

	local base = b.BackgroundColor3
	b.MouseEnter:Connect(function()
		TweenService:Create(b, TweenInfo.new(0.12), { BackgroundColor3 = base:Lerp(Color3.new(1,1,1), 0.18) }):Play()
	end)
	b.MouseLeave:Connect(function()
		TweenService:Create(b, TweenInfo.new(0.12), { BackgroundColor3 = base }):Play()
	end)
	b.MouseButton1Down:Connect(function()
		TweenService:Create(b, TweenInfo.new(0.08), { BackgroundColor3 = base:Lerp(Color3.new(0,0,0), 0.25) }):Play()
	end)
	b.MouseButton1Up:Connect(function()
		TweenService:Create(b, TweenInfo.new(0.12), { BackgroundColor3 = base }):Play()
	end)
	return b
end

function Theme.tween(inst: Instance, time: number, props, style: Enum.EasingStyle?)
	local t = TweenService:Create(inst, TweenInfo.new(time, style or Enum.EasingStyle.Quart, Enum.EasingDirection.Out), props)
	t:Play()
	return t
end

-- Pop-in used by every panel and every reward. One consistent motion language
-- makes cheap UI feel expensive.
function Theme.pop(inst: GuiObject, targetSize: UDim2)
	inst.Size = UDim2.new(targetSize.X.Scale * 0.85, targetSize.X.Offset * 0.85, targetSize.Y.Scale * 0.85, targetSize.Y.Offset * 0.85)
	Theme.tween(inst, 0.26, { Size = targetSize }, Enum.EasingStyle.Back)
end

return Theme
