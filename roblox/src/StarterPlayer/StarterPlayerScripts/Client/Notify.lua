--!strict
-- Toast notifications + the server-wide announcement banner.

local Players = game:GetService("Players")
local Theme = require(script.Parent.Theme)

local Notify = {}

local container: Frame
local bannerLabel: TextLabel
local bannerFrame: Frame

function Notify.mount(parent: ScreenGui)
	container = Theme.frame({
		Name = "Toasts",
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -16, 1, -16),
		Size = UDim2.new(0, 320, 0, 300),
		BackgroundTransparency = 1,
		Parent = parent,
	})
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 6)
	layout.VerticalAlignment = Enum.VerticalAlignment.Bottom
	layout.HorizontalAlignment = Enum.HorizontalAlignment.Right
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = container

	bannerFrame = Theme.frame({
		Name = "Banner",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, -70),
		Size = UDim2.new(0, 640, 0, 46),
		BackgroundColor3 = Theme.BG,
		Parent = parent,
	})
	Theme.corner(bannerFrame, 12)
	Theme.stroke(bannerFrame, Theme.ACCENT_2, 2, 0.2)
	bannerLabel = Theme.label({
		Size = UDim2.fromScale(1, 1),
		Font = Theme.FONT_BLACK,
		TextSize = 18,
		TextXAlignment = Enum.TextXAlignment.Center,
		TextColor3 = Theme.TEXT,
		Parent = bannerFrame,
	})
end

local order = 0

function Notify.toast(text: string, kind: string?)
	if not container then return end
	order += 1

	local color = if kind == "good" then Theme.GOOD
		elseif kind == "warn" then Theme.WARN
		elseif kind == "bad" then Theme.BAD
		else Theme.ACCENT

	local frame = Theme.frame({
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundColor3 = Theme.BG,
		LayoutOrder = order,
		BackgroundTransparency = 0.05,
		Parent = container,
	})
	Theme.corner(frame, 10)
	Theme.stroke(frame, color, 2, 0.25)

	local bar = Theme.frame({
		Size = UDim2.new(0, 4, 1, -12),
		Position = UDim2.new(0, 6, 0, 6),
		BackgroundColor3 = color,
		Parent = frame,
	})
	Theme.corner(bar, 2)

	local label = Theme.label({
		Position = UDim2.new(0, 18, 0, 0),
		Size = UDim2.new(1, -26, 1, 0),
		Text = text,
		TextSize = 15,
		Font = Theme.FONT_BOLD,
		TextWrapped = true,
		Parent = frame,
	})

	frame.Position = UDim2.new(0, 60, 0, 0)
	Theme.tween(frame, 0.22, { Position = UDim2.new(0, 0, 0, 0) })

	task.delay(4, function()
		if not frame.Parent then return end
		Theme.tween(frame, 0.25, { BackgroundTransparency = 1 })
		Theme.tween(label, 0.25, { TextTransparency = 1 })
		task.wait(0.3)
		frame:Destroy()
	end)
end

function Notify.announce(text: string)
	if not bannerFrame then return end
	bannerLabel.Text = text
	Theme.tween(bannerFrame, 0.3, { Position = UDim2.new(0.5, 0, 0, 16) }, Enum.EasingStyle.Back)
	task.delay(5, function()
		Theme.tween(bannerFrame, 0.35, { Position = UDim2.new(0.5, 0, 0, -70) })
	end)
end

return Notify
