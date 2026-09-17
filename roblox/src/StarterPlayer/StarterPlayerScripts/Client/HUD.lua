--!strict
-- The always-on-screen layer: currency pills, buffer bar, sell button, the
-- side menu rail, and the boost timers.
--
-- Design rule followed throughout: the player should be able to answer
-- "am I getting stronger?" in under half a second, without opening anything.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Format   = require(Shared.Util.Format)
local Rebirths = require(Shared.Rebirths)
local Zones    = require(Shared.Zones)
local Quests   = require(Shared.Quests)

local Theme = require(script.Parent.Theme)

local HUD = {}

local refs = {}

local function pill(parent: Instance, order: number, icon: string, color: Color3)
	local f = Theme.frame({
		Size = UDim2.new(0, 190, 0, 38),
		BackgroundColor3 = Theme.BG,
		BackgroundTransparency = 0.08,
		LayoutOrder = order,
		Parent = parent,
	})
	Theme.corner(f, 19)
	Theme.stroke(f, color, 2, 0.4)

	Theme.label({
		Position = UDim2.new(0, 10, 0, 0),
		Size = UDim2.new(0, 28, 1, 0),
		Text = icon,
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Center,
		Parent = f,
	})
	local value = Theme.label({
		Position = UDim2.new(0, 42, 0, 0),
		Size = UDim2.new(1, -52, 1, 0),
		Text = "0",
		Font = Theme.FONT_BLACK,
		TextSize = 18,
		TextColor3 = color,
		Parent = f,
	})
	return value
end

function HUD.mount(parent: ScreenGui, openPanel: (string) -> ())
	-- ---------------------------------------------------- currency stack
	local stack = Theme.frame({
		Name = "Currencies",
		Position = UDim2.new(0, 16, 0, 16),
		Size = UDim2.new(0, 190, 0, 130),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 6)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = stack

	refs.bits   = pill(stack, 1, "\u{1F4A0}", Theme.ACCENT)
	refs.shards = pill(stack, 2, "\u{1F48E}", Theme.ACCENT_2)
	refs.rebirth= pill(stack, 3, "\u{267B}",  Theme.GOLD)

	-- ------------------------------------------------------- buffer bar
	local buffer = Theme.frame({
		Name = "Buffer",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -104),
		Size = UDim2.new(0, 420, 0, 46),
		BackgroundColor3 = Theme.BG,
		BackgroundTransparency = 0.08,
		Parent = parent,
	})
	Theme.corner(buffer, 12)
	Theme.stroke(buffer, Theme.BG_LIFT, 2, 0.3)

	local fill = Theme.frame({
		Name = "Fill",
		Position = UDim2.new(0, 4, 0, 4),
		Size = UDim2.new(0, 0, 1, -8),
		BackgroundColor3 = Theme.ACCENT,
		Parent = buffer,
	})
	Theme.corner(fill, 9)
	Theme.gradient(fill, Theme.ACCENT, Theme.ACCENT_2, 0)
	refs.bufferFill = fill

	refs.bufferText = Theme.label({
		Size = UDim2.fromScale(1, 1),
		Text = "0 / 0",
		Font = Theme.FONT_BLACK,
		TextSize = 17,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextStrokeTransparency = 0.4,
		Parent = buffer,
	})

	-- ------------------------------------------------------ power strip
	local strip = Theme.frame({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -56),
		Size = UDim2.new(0, 420, 0, 26),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	refs.power = Theme.label({
		Size = UDim2.fromScale(1, 1),
		Text = "",
		TextSize = 14,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextColor3 = Theme.TEXT_DIM,
		Parent = strip,
	})

	-- ------------------------------------------------------- menu rail
	local rail = Theme.frame({
		Name = "Rail",
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 16, 0.5, 0),
		Size = UDim2.new(0, 70, 0, 470),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	local rl = Instance.new("UIListLayout")
	rl.Padding = UDim.new(0, 8)
	rl.SortOrder = Enum.SortOrder.LayoutOrder
	rl.Parent = rail

	local MENU = {
		{ id="shop",    icon="\u{1F6E0}", label="CHIPS",   color=Theme.ACCENT },
		{ id="buffers", icon="\u{1F4E6}", label="BUFFER",  color=Theme.ACCENT },
		{ id="zones",   icon="\u{1F5FA}", label="SECTORS", color=Theme.GOOD },
		{ id="eggs",    icon="\u{1F95A}", label="EGGS",    color=Theme.ACCENT_2 },
		{ id="pets",    icon="\u{1F43E}", label="PETS",    color=Theme.ACCENT_2 },
		{ id="quests",  icon="\u{1F4CB}", label="QUESTS",  color=Theme.WARN },
		{ id="rebirth", icon="\u{267B}",  label="OVERCLOCK", color=Theme.GOLD },
		{ id="robux",   icon="\u{1F48E}", label="SHOP",    color=Theme.GOLD },
		{ id="trade",   icon="\u{1F91D}", label="TRADE",   color=Theme.GOOD },
		{ id="codes",   icon="\u{1F381}", label="CODES",   color=Theme.GOOD },
	}

	for i, item in ipairs(MENU) do
		local b = Theme.button({
			Size = UDim2.new(0, 64, 0, 40),
			BackgroundColor3 = Theme.BG,
			LayoutOrder = i,
			Text = "",
			Parent = rail,
		})
		Theme.stroke(b, item.color, 2, 0.45)
		Theme.label({
			Size = UDim2.new(1, 0, 0, 20),
			Position = UDim2.new(0, 0, 0, 2),
			Text = item.icon,
			TextSize = 17,
			TextXAlignment = Enum.TextXAlignment.Center,
			Parent = b,
		})
		Theme.label({
			Size = UDim2.new(1, 0, 0, 14),
			Position = UDim2.new(0, 0, 0, 22),
			Text = item.label,
			Font = Theme.FONT_BLACK,
			TextSize = 10,
			TextColor3 = item.color,
			TextXAlignment = Enum.TextXAlignment.Center,
			Parent = b,
		})
		b.MouseButton1Click:Connect(function() openPanel(item.id) end)

		if item.id == "quests" then refs.questBadge = b end
		if item.id == "rebirth" then refs.rebirthBadge = b end
	end

	-- ------------------------------------------------------ boost strip
	local boosts = Theme.frame({
		Name = "Boosts",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -16, 0, 16),
		Size = UDim2.new(0, 230, 0, 96),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	local bl = Instance.new("UIListLayout")
	bl.Padding = UDim.new(0, 6)
	bl.HorizontalAlignment = Enum.HorizontalAlignment.Right
	bl.Parent = boosts
	refs.boosts = boosts

	-- ---------------------------------------------- playtime chest button
	local chest = Theme.button({
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -16, 1, -340),
		Size = UDim2.new(0, 170, 0, 42),
		BackgroundColor3 = Theme.BG,
		Text = "",
		Visible = false,
		Parent = parent,
	})
	Theme.stroke(chest, Theme.GOOD, 2, 0.25)
	Theme.label({
		Size = UDim2.fromScale(1,1),
		Text = "\u{1F381} PLAYTIME REWARD",
		Font = Theme.FONT_BLACK, TextSize = 14,
		TextColor3 = Theme.GOOD,
		TextXAlignment = Enum.TextXAlignment.Center,
		Parent = chest,
	})
	chest.MouseButton1Click:Connect(function() openPanel("quests") end)
	refs.chest = chest

	-- --------------------------------------------------- hint (controls)
	Theme.label({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -16),
		Size = UDim2.new(0, 620, 0, 22),
		Text = "<b>CLICK</b> mine  \u{2022}  <b>E</b> sell  \u{2022}  <b>P</b> familiars  \u{2022}  <b>T</b> trade  \u{2022}  <b>R</b> overclock",
		TextSize = 13,
		TextColor3 = Theme.TEXT_DIM,
		TextXAlignment = Enum.TextXAlignment.Center,
		Parent = parent,
	})
end

-- ----------------------------------------------------------------- update
local boostRows = {}

local function setBoost(key: string, text: string?, color: Color3)
	local row = boostRows[key]
	if not text then
		if row then row:Destroy(); boostRows[key] = nil end
		return
	end
	if not row then
		row = Theme.frame({
			Size = UDim2.new(0, 230, 0, 28),
			BackgroundColor3 = Theme.BG,
			BackgroundTransparency = 0.05,
			Parent = refs.boosts,
		})
		Theme.corner(row, 8)
		Theme.stroke(row, color, 2, 0.35)
		Theme.label({
			Name = "L",
			Size = UDim2.fromScale(1, 1),
			Font = Theme.FONT_BLACK, TextSize = 13,
			TextColor3 = color,
			TextXAlignment = Enum.TextXAlignment.Center,
			Parent = row,
		})
		boostRows[key] = row
	end
	;(row:FindFirstChild("L") :: TextLabel).Text = text
end

function HUD.update(state)
	if not state or not refs.bits then return end

	refs.bits.Text   = Format.short(state.bits)
	refs.shards.Text = Format.short(state.shards)
	refs.rebirth.Text= tostring(state.rebirths) .. "  " .. Rebirths.titleFor(state.rebirths).title

	local pct = if state.capacity > 0 then math.clamp(state.carried / state.capacity, 0, 1) else 0
	Theme.tween(refs.bufferFill, 0.15, { Size = UDim2.new(pct, -8 * (1 - pct), 1, -8) })
	refs.bufferText.Text = ("%s / %s"):format(Format.short(state.carried), Format.short(state.capacity))
	refs.bufferFill.BackgroundColor3 = if pct >= 1 then Theme.WARN else Theme.ACCENT

	local zone = Zones.byId[state.zone]
	refs.power.Text = ("<b>%s</b> / swing  \u{2022}  pets <b>%s</b>  \u{2022}  total <b>%s</b>  \u{2022}  %s")
		:format(Format.short(state.power), Format.mult(state.petMult),
			Format.mult(state.multiplier), zone and zone.name or "?")

	-- boosts
	local now = os.time()
	setBoost("bits", (state.boosts.bits or 0) > now
		and ("\u{26A1} 2x BITS  " .. Format.time(state.boosts.bits - now)) or nil, Theme.WARN)
	setBoost("luck", (state.boosts.luck or 0) > now
		and ("\u{1F340} 3x LUCK  " .. Format.time(state.boosts.luck - now)) or nil, Theme.GOOD)
	setBoost("server", (state.serverBoost or 0) > now
		and ("\u{1F310} SERVER 2x  " .. Format.time(state.serverBoost - now)) or nil, Theme.ACCENT_2)

	-- badges
	local questReady = false
	for _, e in ipairs(state.quests.list or {}) do
		local def = Quests.byId[e.id]
		if def and not e.claimed and e.progress >= def.target then questReady = true; break end
	end
	if refs.questBadge then
		local s = refs.questBadge:FindFirstChildOfClass("UIStroke")
		if s then s.Color = if questReady then Theme.GOOD else Theme.WARN end
	end
	if refs.rebirthBadge then
		local s = refs.rebirthBadge:FindFirstChildOfClass("UIStroke")
		if s then s.Color = if state.bits >= state.rebirthCost then Theme.GOOD else Theme.GOLD end
	end

	local chestReady = false
	for i, entry in ipairs(Quests.PLAYTIME) do
		if (state.sessionTime or 0) >= entry.at and not state.playtimeClaimed[tostring(i)] then
			chestReady = true; break
		end
	end
	if refs.chest then refs.chest.Visible = chestReady end
end

return HUD
