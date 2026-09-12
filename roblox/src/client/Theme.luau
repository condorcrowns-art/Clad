--!strict
-- Theme.luau — one place for every colour, corner radius and font in the UI.
-- Chunky, high-contrast, oversized text: the target player is nine and may be
-- on a phone, so nothing here is subtle.

local Theme = {}

Theme.FONT = Enum.Font.FredokaOne
Theme.BG        = Color3.fromRGB(28, 30, 48)
Theme.BG_SOFT   = Color3.fromRGB(42, 46, 72)
Theme.PANEL     = Color3.fromRGB(36, 39, 62)
Theme.ACCENT    = Color3.fromRGB(120, 220, 255)
Theme.GOOD      = Color3.fromRGB(110, 235, 150)
Theme.WARN      = Color3.fromRGB(255, 185, 80)
Theme.BAD       = Color3.fromRGB(255, 105, 120)
Theme.GOLD      = Color3.fromRGB(255, 210, 90)
Theme.TEXT      = Color3.fromRGB(255, 255, 255)
Theme.TEXT_DIM  = Color3.fromRGB(178, 186, 215)

function Theme.corner(parent: Instance, radius: number?)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, radius or 14)
    c.Parent = parent
    return c
end

function Theme.stroke(parent: Instance, color: Color3?, thickness: number?)
    local s = Instance.new("UIStroke")
    s.Color = color or Color3.fromRGB(16, 18, 30)
    s.Thickness = thickness or 3
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
    for k, v in pairs(props) do (t :: any)[k] = v end
    return t
end

function Theme.button(text: string, color: Color3, size: UDim2): TextButton
    local b = Instance.new("TextButton")
    b.Text = text
    b.Size = size
    b.BackgroundColor3 = color
    b.Font = Theme.FONT
    b.TextColor3 = Color3.fromRGB(20, 22, 34)
    b.TextSize = 20
    b.AutoButtonColor = true
    Theme.corner(b, 12)
    Theme.stroke(b)
    return b
end

return Theme
