--!strict
-- Theme.luau — one place for every colour, corner radius and font in the UI.
-- Chunky, high-contrast, oversized text: the target player is nine and may be
-- on a phone, so nothing here is subtle.

local Theme = {}

Theme.FONT = Enum.Font.FredokaOne
-- PALETTE: muted and low-chroma on purpose.
--
-- The first pass was neon — electric cyan on near-black navy, saturated gold,
-- pure-white text — and on screen it read as loud rather than lively. These are
-- the same hues pulled well down in saturation and up in lightness, so panels
-- sit back and only the numbers that matter carry colour.
--
-- Rule of thumb kept here: nothing above ~55% saturation, text is warm
-- off-white rather than #FFFFFF, and "accent" is a desaturated slate-blue that
-- can sit next to the sky without fighting it.
Theme.BG        = Color3.fromRGB(38, 40, 46)   -- warm charcoal, not navy
Theme.BG_SOFT   = Color3.fromRGB(54, 57, 65)
Theme.PANEL     = Color3.fromRGB(46, 49, 56)
Theme.ACCENT    = Color3.fromRGB(138, 172, 190) -- dusty slate blue
Theme.GOOD      = Color3.fromRGB(142, 178, 134) -- sage
Theme.WARN      = Color3.fromRGB(206, 168, 108) -- muted ochre
Theme.BAD       = Color3.fromRGB(190, 124, 112) -- clay
Theme.GOLD      = Color3.fromRGB(198, 174, 118) -- brass, not yellow
Theme.TEXT      = Color3.fromRGB(232, 229, 222) -- warm off-white
Theme.TEXT_DIM  = Color3.fromRGB(150, 154, 160)

function Theme.corner(parent: Instance, radius: number?)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, radius or 14)
    c.Parent = parent
    return c
end

function Theme.stroke(parent: Instance, color: Color3?, thickness: number?)
    local s = Instance.new("UIStroke")
    s.Color = color or Color3.fromRGB(24, 26, 30)
    s.Thickness = thickness or 2
    s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    s.Parent = parent
    return s
end

function Theme.pad(parent: Instance, px: number)
    local p = Instance.new("UIPadding")
    p.PaddingTop = UDim.new(0, px)
    p.PaddingBottom = UDim.new(0, px)
    p.PaddingLeft = UDim.new(0, px)
    p.PaddingRight = UDim.new(0, px)
    p.Parent = parent
    return p
end

function Theme.label(props: { [string]: any }): TextLabel
    local t = Instance.new("TextLabel")
    t.BackgroundTransparency = 1
    t.Font = Theme.FONT
    t.TextColor3 = Theme.TEXT
    t.TextScaled = false
    t.TextSize = 18
    t.TextXAlignment = Enum.TextXAlignment.Left
    t.Text = ""   -- a TextLabel defaults to the literal string "Label"
    for k, v in pairs(props) do (t :: any)[k] = v end
    return t
end

function Theme.button(text: string, color: Color3, size: UDim2): TextButton
    local b = Instance.new("TextButton")
    b.Text = text
    b.Size = size
    b.BackgroundColor3 = color
    b.Font = Theme.FONT
    b.TextColor3 = Color3.fromRGB(28, 30, 34)
    b.TextSize = 20
    b.AutoButtonColor = true
    Theme.corner(b, 12)
    Theme.stroke(b)
    return b
end

return Theme
