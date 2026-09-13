--!strict
-- Theme.luau — one place for every colour, corner radius and font in the UI.
-- Chunky, high-contrast, oversized text: the target player is nine and may be
-- on a phone, so nothing here is subtle.

local Theme = {}

Theme.FONT = Enum.Font.GothamBold
Theme.FONT_BODY = Enum.Font.Gotham

-- ── MONOCHROME. Black, grey, white, and nothing else. ─────────────────────
--
-- Two earlier passes over this palette: the first was neon (electric cyan on
-- near-black), which read as loud; the second pulled everything down to muted
-- slate-blues and sages, which read as muddy. Both were trying to make the UI
-- itself interesting, and the UI is not the interesting part — the blobs are.
--
-- So the interface is now greyscale by rule: every panel, every label, every
-- border is black, grey or white. The ONLY chroma anywhere on screen is
-- meaning: a rarity stroke on a card, a red warning, a green confirmation. A
-- neon skin has nothing to compete with, which is the point — this is a game
-- whose whole visual promise is a glowing blob, and a grey frame around it is
-- what makes it glow.
--
-- The greys are very slightly warm (R and G a shade above B). Perfectly
-- neutral greys read as blue-ish on most phone panels; two or three points of
-- warmth reads as black rather than as a colour.
Theme.BLACK     = Color3.fromRGB(10, 10, 11)
Theme.BG        = Color3.fromRGB(20, 20, 22)
Theme.PANEL     = Color3.fromRGB(28, 28, 31)
Theme.BG_SOFT   = Color3.fromRGB(42, 42, 46)
Theme.LINE      = Color3.fromRGB(62, 62, 68)
Theme.TEXT      = Color3.fromRGB(245, 245, 246)
Theme.TEXT_DIM  = Color3.fromRGB(158, 158, 164)

-- "Accent" is white. Where the old palette used a colour to mean "this is the
-- live one", the monochrome answer is brightness: selected rows are white on
-- black, everything else is grey on near-black. That is a stronger signal than
-- hue on a small screen and it survives being colourblind.
Theme.ACCENT    = Color3.fromRGB(245, 245, 246)
Theme.GOLD      = Color3.fromRGB(226, 226, 228)

-- The three exceptions, kept as desaturated as they can be while still
-- reading instantly. These are STATE, not decoration: something worked,
-- something is about to go wrong, something is dangerous.
Theme.GOOD      = Color3.fromRGB(126, 214, 150)
Theme.WARN      = Color3.fromRGB(226, 186, 104)
Theme.BAD       = Color3.fromRGB(226, 106, 106)

function Theme.corner(parent: Instance, radius: number?)
    local c = Instance.new("UICorner")
    c.CornerRadius = UDim.new(0, radius or 14)
    c.Parent = parent
    return c
end

function Theme.stroke(parent: Instance, color: Color3?, thickness: number?)
    local s = Instance.new("UIStroke")
    s.Color = color or Theme.LINE
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

-- A button reads as a SURFACE with a bright label, not as a slab of colour.
--
-- The old style filled the button with the accent colour and printed dark text
-- on it, which in a monochrome palette means a white rectangle — the loudest
-- thing on the screen, on every button at once. Inverting it puts the emphasis
-- on the text: dark surface, near-white label, and `color` becomes the BORDER,
-- which is where the one permitted piece of chroma (a rarity, a warning) can
-- live without shouting.
function Theme.button(text: string, color: Color3, size: UDim2): TextButton
    local b = Instance.new("TextButton")
    b.Text = text
    b.Size = size
    b.BackgroundColor3 = Theme.BG_SOFT
    b.Font = Theme.FONT
    b.TextColor3 = Theme.TEXT
    b.TextSize = 18
    b.AutoButtonColor = true
    Theme.corner(b, 10)
    Theme.stroke(b, color, 2)
    return b
end

--- A button that is currently ON. White surface, black label — the only place
--- in the interface that inverts, which is what makes "this one is live"
--- unmissable without using a colour to say it.
function Theme.setButtonActive(b: TextButton, on: boolean)
    b.BackgroundColor3 = on and Theme.TEXT or Theme.BG_SOFT
    b.TextColor3 = on and Theme.BLACK or Theme.TEXT
    local st = b:FindFirstChildOfClass("UIStroke")
    if st then
        st.Color = on and Theme.TEXT or Theme.LINE
    end
end

return Theme
