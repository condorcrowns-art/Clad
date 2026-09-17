--!strict
-- The trade window: two panes, live offers, and a confirm that both sides can
-- see. Deliberately loud about state changes -- the UI's job here is to make a
-- scam attempt obvious before the player clicks.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Pets        = require(Shared.Pets)
local Progression = require(Shared.Progression)
local Trading     = require(Shared.Trading)
local Remotes     = require(Shared.Remotes)
local Format      = require(Shared.Util.Format)

local Theme = require(script.Parent.Theme)

local Trade = {}

local window: Frame
local myPane: ScrollingFrame
local theirPane: ScrollingFrame
local myHeader: TextLabel
local theirHeader: TextLabel
local confirmBtn: TextButton
local warnLabel: TextLabel
local state: any = nil
local pickerHost: Frame
local getPlayerState: (() -> any)? = nil

local function itemRow(parent: Instance, item, order: number, onClick: (() -> ())?)
	local tier = item.serial and Progression.serialTier(item.serial) or nil

	local f = Theme.frame({
		Size = UDim2.new(1, -6, 0, 46),
		BackgroundColor3 = Theme.BG_SOFT,
		LayoutOrder = order,
		ZIndex = 12,
		Parent = parent,
	})
	Theme.corner(f, 8)
	Theme.stroke(f, tier and tier.color or Theme.BG_LIFT, 2, 0.5)

	Theme.label({
		Position = UDim2.new(0, 8, 0, 4),
		Size = UDim2.new(1, -16, 0, 20),
		Text = item.name,
		Font = Theme.FONT_BOLD, TextSize = 14,
		TextColor3 = tier and tier.color or Theme.TEXT,
		ZIndex = 12, Parent = f,
	})
	Theme.label({
		Position = UDim2.new(0, 8, 0, 23),
		Size = UDim2.new(1, -16, 0, 18),
		Text = ("%s  \u{2022}  Lv.%d  \u{2022}  +%s"):format(
			item.serial and ("#" .. item.serial .. (tier and tier.label ~= "" and (" " .. tier.label) or "")) or "unserialised",
			item.level or 0,
			Format.short(item.power)),
		TextSize = 12, TextColor3 = Theme.TEXT_DIM,
		ZIndex = 12, Parent = f,
	})

	if onClick then
		local b = Theme.button({
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			Text = "", ZIndex = 13, Parent = f,
		})
		b.MouseButton1Click:Connect(onClick)
	end
	return f
end

function Trade.mount(parent: ScreenGui, playerStateGetter: () -> any)
	getPlayerState = playerStateGetter

	window = Theme.frame({
		Name = "TradeWindow",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0, 780, 0, 520),
		BackgroundColor3 = Theme.BG,
		Visible = false,
		ZIndex = 11,
		Parent = parent,
	})
	Theme.corner(window, 16)
	Theme.stroke(window, Theme.GOOD, 2, 0.3)

	Theme.label({
		Position = UDim2.new(0, 20, 0, 12),
		Size = UDim2.new(1, -40, 0, 28),
		Text = "\u{1F91D} TRADE",
		Font = Theme.FONT_BLACK, TextSize = 22,
		ZIndex = 12, Parent = window,
	})
	warnLabel = Theme.label({
		Position = UDim2.new(0, 20, 0, 38),
		Size = UDim2.new(1, -40, 0, 18),
		Text = "Any change to either offer clears both confirmations. Check the other side before you confirm.",
		TextSize = 12, TextColor3 = Theme.WARN,
		ZIndex = 12, Parent = window,
	})

	local function pane(x: number, titleText: string)
		local holder = Theme.frame({
			Position = UDim2.new(0, x, 0, 64),
			Size = UDim2.new(0, 360, 0, 300),
			BackgroundColor3 = Theme.BG_SOFT,
			ZIndex = 11, Parent = window,
		})
		Theme.corner(holder, 12)
		local header = Theme.label({
			Position = UDim2.new(0, 10, 0, 6),
			Size = UDim2.new(1, -20, 0, 22),
			Text = titleText,
			Font = Theme.FONT_BLACK, TextSize = 16,
			ZIndex = 12, Parent = holder,
		})
		local scroll = Instance.new("ScrollingFrame")
		scroll.Position = UDim2.new(0, 8, 0, 32)
		scroll.Size = UDim2.new(1, -16, 1, -40)
		scroll.BackgroundTransparency = 1
		scroll.BorderSizePixel = 0
		scroll.ScrollBarThickness = 4
		scroll.ScrollBarImageColor3 = Theme.ACCENT
		scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
		scroll.CanvasSize = UDim2.new()
		scroll.ZIndex = 12
		scroll.Parent = holder
		local l = Instance.new("UIListLayout")
		l.Padding = UDim.new(0, 4)
		l.SortOrder = Enum.SortOrder.LayoutOrder
		l.Parent = scroll
		return scroll, header
	end

	myPane, myHeader = pane(20, "YOUR OFFER")
	theirPane, theirHeader = pane(400, "THEIR OFFER")

	-- Inventory picker along the bottom.
	pickerHost = Theme.frame({
		Position = UDim2.new(0, 20, 0, 372),
		Size = UDim2.new(1, -40, 0, 84),
		BackgroundColor3 = Theme.BG_SOFT,
		ZIndex = 11, Parent = window,
	})
	Theme.corner(pickerHost, 12)
	Theme.label({
		Position = UDim2.new(0, 10, 0, 4),
		Size = UDim2.new(1, -20, 0, 16),
		Text = "TAP A FAMILIAR TO ADD (locked and equipped familiars can't be traded)",
		Font = Theme.FONT_BOLD, TextSize = 11, TextColor3 = Theme.TEXT_DIM,
		ZIndex = 12, Parent = pickerHost,
	})
	local pickScroll = Instance.new("ScrollingFrame")
	pickScroll.Name = "Picker"
	pickScroll.Position = UDim2.new(0, 8, 0, 22)
	pickScroll.Size = UDim2.new(1, -16, 1, -30)
	pickScroll.BackgroundTransparency = 1
	pickScroll.BorderSizePixel = 0
	pickScroll.ScrollBarThickness = 4
	pickScroll.ScrollingDirection = Enum.ScrollingDirection.X
	pickScroll.AutomaticCanvasSize = Enum.AutomaticSize.X
	pickScroll.CanvasSize = UDim2.new()
	pickScroll.ZIndex = 12
	pickScroll.Parent = pickerHost
	local pl = Instance.new("UIListLayout")
	pl.FillDirection = Enum.FillDirection.Horizontal
	pl.Padding = UDim.new(0, 6)
	pl.Parent = pickScroll

	confirmBtn = Theme.button({
		Position = UDim2.new(0, 20, 1, -52),
		Size = UDim2.new(0, 480, 0, 40),
		BackgroundColor3 = Theme.GOOD,
		TextColor3 = Theme.BG,
		Font = Theme.FONT_BLACK, TextSize = 16,
		Text = "CONFIRM TRADE",
		ZIndex = 12, Parent = window,
	})
	confirmBtn.MouseButton1Click:Connect(function()
		local mine = state and state.me
		Remotes.event("TradeConfirm"):FireServer({ confirmed = not (mine and mine.confirmed) })
	end)

	local cancel = Theme.button({
		Position = UDim2.new(0, 516, 1, -52),
		Size = UDim2.new(0, 244, 0, 40),
		BackgroundColor3 = Theme.BAD,
		TextColor3 = Theme.TEXT,
		Font = Theme.FONT_BLACK, TextSize = 16,
		Text = "CANCEL",
		ZIndex = 12, Parent = window,
	})
	cancel.MouseButton1Click:Connect(function()
		Remotes.event("TradeCancel"):FireServer()
	end)
end

local function refreshPicker()
	local pickScroll = pickerHost:FindFirstChild("Picker") :: ScrollingFrame
	if not pickScroll then return end
	for _, c in ipairs(pickScroll:GetChildren()) do
		if not c:IsA("UIListLayout") then c:Destroy() end
	end

	local ps = getPlayerState and getPlayerState() or nil
	if not ps then return end

	local offered: { [string]: boolean } = {}
	for _, item in ipairs(state and state.me.items or {}) do offered[item.uid] = true end
	local equipped: { [string]: boolean } = {}
	for _, uid in ipairs(ps.equipped or {}) do equipped[uid] = true end

	local order = 0
	for uid, owned in pairs(ps.pets or {}) do
		local def = Pets.byId[owned.id]
		local variant = Pets.variantById[owned.variant or "normal"]
		if def and variant and not offered[uid] and not owned.locked and not equipped[uid] then
			order += 1
			local card = Theme.button({
				Size = UDim2.new(0, 120, 1, -4),
				BackgroundColor3 = Theme.BG,
				LayoutOrder = order,
				Text = "",
				ZIndex = 13, Parent = pickScroll,
			})
			Theme.stroke(card, variant.id ~= "normal" and variant.color or def.color, 2, 0.5)
			Theme.label({
				Position = UDim2.new(0, 4, 0, 2),
				Size = UDim2.new(1, -8, 0, 16),
				Text = Progression.displayName(def.name, variant.name, owned.star or 0, owned.level or 0),
				Font = Theme.FONT_BOLD, TextSize = 11,
				TextColor3 = variant.id ~= "normal" and variant.color or Theme.TEXT,
				TextTruncate = Enum.TextTruncate.AtEnd,
				ZIndex = 13, Parent = card,
			})
			Theme.label({
				Position = UDim2.new(0, 4, 0, 18),
				Size = UDim2.new(1, -8, 0, 14),
				Text = owned.serial and ("#" .. owned.serial) or "unserialised",
				TextSize = 10, TextColor3 = Theme.TEXT_DIM,
				ZIndex = 13, Parent = card,
			})
			card.MouseButton1Click:Connect(function()
				Remotes.event("TradeOffer"):FireServer({ uid = uid, add = true })
			end)
		end
	end
end

function Trade.update(payload)
	if not window then return end
	if not payload or not payload.active then
		state = nil
		window.Visible = false
		return
	end

	state = payload
	window.Visible = true

	local function fill(pane: ScrollingFrame, header: TextLabel, side, mine: boolean)
		for _, c in ipairs(pane:GetChildren()) do
			if not c:IsA("UIListLayout") then c:Destroy() end
		end
		header.Text = ("%s  %s"):format(
			mine and "YOUR OFFER" or string.upper(side.name) .. "'S OFFER",
			side.confirmed and "\u{2705} CONFIRMED" or "\u{23F3} not confirmed")
		header.TextColor3 = side.confirmed and Theme.GOOD or Theme.WARN

		local total = 0
		for i, item in ipairs(side.items) do
			total += item.power
			itemRow(pane, item, i, mine and function()
				Remotes.event("TradeOffer"):FireServer({ uid = item.uid, add = false })
			end or nil)
		end
		if #side.items == 0 then
			Theme.label({
				Size = UDim2.new(1, -6, 0, 40),
				Text = "  (nothing offered)",
				TextColor3 = Theme.TEXT_DIM, TextSize = 13,
				LayoutOrder = 999, ZIndex = 12, Parent = pane,
			})
		else
			Theme.label({
				Size = UDim2.new(1, -6, 0, 24),
				Text = ("  Total power: +%s"):format(Format.short(total)),
				Font = Theme.FONT_BOLD, TextSize = 13,
				TextColor3 = Theme.ACCENT, LayoutOrder = 1000,
				ZIndex = 12, Parent = pane,
			})
		end
	end

	fill(myPane, myHeader, payload.me, true)
	fill(theirPane, theirHeader, payload.them, false)

	confirmBtn.Text = payload.me.confirmed and "\u{2705} CONFIRMED (click to undo)" or "CONFIRM TRADE"
	confirmBtn.BackgroundColor3 = payload.me.confirmed and Theme.BG_LIFT or Theme.GOOD

	warnLabel.Text = (payload.me.confirmed and payload.them.confirmed)
		and "Both sides confirmed \u{2014} completing trade..."
		or "Any change to either offer clears both confirmations. Check the other side before you confirm."

	refreshPicker()
end

-- An incoming request gets its own prompt with two explicit buttons. There is
-- deliberately no auto-accept and no "accept all" -- a trade is always a
-- deliberate act, and the prompt expires on its own if ignored.
function Trade.invite(payload, parent: ScreenGui)
	local existing = parent:FindFirstChild("TradeInvite")
	if existing then existing:Destroy() end

	local card = Theme.frame({
		Name = "TradeInvite",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 80),
		Size = UDim2.new(0, 380, 0, 96),
		BackgroundColor3 = Theme.BG,
		ZIndex = 15, Parent = parent,
	})
	Theme.corner(card, 12)
	Theme.stroke(card, Theme.GOOD, 2, 0.2)
	Theme.pop(card, UDim2.new(0, 380, 0, 96))

	Theme.label({
		Position = UDim2.new(0, 14, 0, 10),
		Size = UDim2.new(1, -28, 0, 36),
		Text = ("\u{1F91D} <b>%s</b> wants to trade with you."):format(payload.fromName),
		Font = Theme.FONT_BOLD, TextSize = 15,
		TextWrapped = true,
		ZIndex = 16, Parent = card,
	})

	local accept = Theme.button({
		Position = UDim2.new(0, 14, 0, 50),
		Size = UDim2.new(0, 170, 0, 34),
		BackgroundColor3 = Theme.GOOD, TextColor3 = Theme.BG,
		Font = Theme.FONT_BLACK, TextSize = 14, Text = "ACCEPT",
		ZIndex = 16, Parent = card,
	})
	local decline = Theme.button({
		Position = UDim2.new(0, 196, 0, 50),
		Size = UDim2.new(0, 170, 0, 34),
		BackgroundColor3 = Theme.BAD, TextColor3 = Theme.TEXT,
		Font = Theme.FONT_BLACK, TextSize = 14, Text = "DECLINE",
		ZIndex = 16, Parent = card,
	})

	local answered = false
	local function answer(accepted: boolean)
		if answered then return end
		answered = true
		Remotes.event("TradeRespond"):FireServer({ accept = accepted })
		card:Destroy()
	end
	accept.MouseButton1Click:Connect(function() answer(true) end)
	decline.MouseButton1Click:Connect(function() answer(false) end)

	-- Expires on its own, matching the server's request timeout.
	task.delay(Trading.REQUEST_TIMEOUT, function()
		if card.Parent and not answered then card:Destroy() end
	end)
end

function Trade.isOpen(): boolean
	return window ~= nil and window.Visible
end

return Trade
