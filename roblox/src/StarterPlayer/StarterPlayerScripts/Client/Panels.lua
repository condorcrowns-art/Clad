--!strict
-- Every menu in the game. One window, swapped contents.
--
-- Deliberately one module: a simulator's menus share 90% of their structure
-- (scrolling list of "thing + price + buy button"), and duplicating that six
-- times is how UI drifts out of sync with itself.


local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Tools    = require(Shared.Tools)
local Buffers  = require(Shared.Buffers)
local Zones    = require(Shared.Zones)
local Pets     = require(Shared.Pets)
local Quests   = require(Shared.Quests)
local Products = require(Shared.Products)
local Rebirths = require(Shared.Rebirths)
local Codes       = require(Shared.Codes)
local Progression = require(Shared.Progression)
local Trading     = require(Shared.Trading)
local Remotes  = require(Shared.Remotes)
local Format   = require(Shared.Util.Format)

local Theme    = require(script.Parent.Theme)
local Viewport = require(script.Parent.Viewport)

local Panels = {}

local window: Frame
local titleLabel: TextLabel
local subtitleLabel: TextLabel
local body: ScrollingFrame
local current: string? = nil
local state: any = nil

local TITLES = {
	shop    = { "CHIP SHOP",       "Higher chips break nodes for more Bits." },
	buffers = { "BUFFER SHOP",     "Bigger buffers mean fewer trips to the Uplink." },
	zones   = { "SECTORS",         "Deeper sectors pay far more per node." },
	eggs    = { "FAMILIAR EGGS",   "Familiars multiply everything you earn." },
	pets    = { "MY FAMILIARS",    "Equip your best to raise your multiplier." },
	quests  = { "QUESTS & REWARDS","Dailies reset at midnight UTC." },
	rebirth = { "OVERCLOCK",       "Reset your Bits, chip, buffer and sectors \u{2014} keep your familiars." },
	robux   = { "PREMIUM SHOP",    "Passes are permanent. Thank you for supporting the game!" },
	codes   = { "CODES",           "Follow the game's socials for new codes." },
	trade   = { "TRADE",           "Trade familiars with players nearby. Lock anything you never want to lose." },
}

-- ------------------------------------------------------------------ mount
function Panels.mount(parent: ScreenGui)
	local shade = Theme.frame({
		Name = "Shade",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		Visible = false,
		ZIndex = 5,
		Parent = parent,
	})
	local shadeBtn = Theme.button({
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Text = "",
		ZIndex = 5,
		Parent = shade,
	})
	shadeBtn.MouseButton1Click:Connect(function() Panels.close() end)
	Panels._shade = shade

	window = Theme.frame({
		Name = "Window",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0, 720, 0, 500),
		BackgroundColor3 = Theme.BG,
		Visible = false,
		ZIndex = 6,
		Parent = parent,
	})
	Theme.corner(window, 16)
	Theme.stroke(window, Theme.ACCENT, 2, 0.4)

	local header = Theme.frame({
		Size = UDim2.new(1, 0, 0, 72),
		BackgroundTransparency = 1,
		ZIndex = 6,
		Parent = window,
	})
	titleLabel = Theme.label({
		Position = UDim2.new(0, 22, 0, 12),
		Size = UDim2.new(1, -80, 0, 30),
		Font = Theme.FONT_BLACK, TextSize = 24,
		ZIndex = 6,
		Parent = header,
	})
	subtitleLabel = Theme.label({
		Position = UDim2.new(0, 22, 0, 40),
		Size = UDim2.new(1, -80, 0, 20),
		TextSize = 14, TextColor3 = Theme.TEXT_DIM,
		ZIndex = 6,
		Parent = header,
	})
	local close = Theme.button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -16, 0, 16),
		Size = UDim2.new(0, 36, 0, 36),
		BackgroundColor3 = Theme.BAD,
		Text = "\u{2715}", TextSize = 18,
		ZIndex = 7,
		Parent = window,
	})
	close.MouseButton1Click:Connect(function() Panels.close() end)

	body = Instance.new("ScrollingFrame")
	body.Name = "Body"
	body.Position = UDim2.new(0, 16, 0, 76)
	body.Size = UDim2.new(1, -32, 1, -92)
	body.BackgroundTransparency = 1
	body.BorderSizePixel = 0
	body.ScrollBarThickness = 6
	body.ScrollBarImageColor3 = Theme.ACCENT
	body.CanvasSize = UDim2.new()
	body.AutomaticCanvasSize = Enum.AutomaticSize.Y
	body.ZIndex = 6
	body.Parent = window

	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 8)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = body
end

-- --------------------------------------------------------------- helpers
local function clear()
	for _, c in ipairs(body:GetChildren()) do
		if not c:IsA("UIListLayout") then c:Destroy() end
	end
end

-- The universal row: icon block, title, subtitle, action button.
local function row(opts)
	local f = Theme.frame({
		Size = UDim2.new(1, -8, 0, opts.height or 68),
		BackgroundColor3 = Theme.BG_SOFT,
		LayoutOrder = opts.order or 1,
		ZIndex = 6,
		Parent = body,
	})
	Theme.corner(f, 12)
	Theme.stroke(f, opts.color or Theme.BG_LIFT, 2, 0.5)

	local chip = Theme.frame({
		Position = UDim2.new(0, 10, 0.5, -28),
		Size = UDim2.new(0, 56, 0, 56),
		BackgroundColor3 = (opts.color or Theme.ACCENT):Lerp(Theme.BG, 0.55),
		ZIndex = 6,
		Parent = f,
	})
	Theme.corner(chip, 10)

	-- A row can render a real 3D model instead of an emoji. Used for every
	-- familiar and every egg, which is most of what players look at.
	if opts.viewportPet then
		Viewport.pet(chip, opts.viewportPet.id, opts.viewportPet.variant, 7)
	elseif opts.viewportEgg then
		Viewport.egg(chip, opts.viewportEgg.id, opts.viewportEgg.color, opts.viewportEgg.accent, 7)
	else
		Theme.label({
			Size = UDim2.fromScale(1, 1),
			Text = opts.icon or "\u{25C6}",
			TextSize = 22, TextXAlignment = Enum.TextXAlignment.Center,
			TextColor3 = opts.color or Theme.ACCENT,
			ZIndex = 6,
			Parent = chip,
		})
	end

	Theme.label({
		Position = UDim2.new(0, 76, 0, 10),
		Size = UDim2.new(1, -250, 0, 22),
		Text = opts.title,
		Font = Theme.FONT_BLACK, TextSize = 17,
		TextColor3 = opts.color or Theme.TEXT,
		ZIndex = 6,
		Parent = f,
	})
	Theme.label({
		Position = UDim2.new(0, 76, 0, 32),
		Size = UDim2.new(1, -240, 0, opts.height and (opts.height - 40) or 26),
		Text = opts.subtitle or "",
		TextSize = 13.5, TextColor3 = Theme.TEXT_DIM,
		TextWrapped = true,
		ZIndex = 6,
		Parent = f,
	})

	if opts.button then
		local b = Theme.button({
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -12, 0.5, 0),
			Size = UDim2.new(0, 150, 0, 40),
			BackgroundColor3 = opts.buttonColor or Theme.ACCENT,
			TextColor3 = Theme.BG,
			Font = Theme.FONT_BLACK, TextSize = 15,
			Text = opts.button,
			ZIndex = 7,
			Parent = f,
		})
		if opts.disabled then
			b.BackgroundColor3 = Theme.BG_LIFT
			b.TextColor3 = Theme.TEXT_DIM
			b.AutoButtonColor = false
		elseif opts.onClick then
			b.MouseButton1Click:Connect(opts.onClick)
		end
	end
	return f
end

local function buy(kind: string, id: string)
	Remotes.event("Buy"):FireServer({ kind = kind, id = id })
end

-- ---------------------------------------------------------------- content
local builders = {}

builders.shop = function()
	local ownedOrder = (Tools.byId[state.tool] or Tools.byId[Tools.starter]).order
	for _, t in ipairs(Tools.list) do
		local owned = t.order <= ownedOrder
		local have = if t.currency == "Shards" then state.shards else state.bits
		row({
			order = t.order, icon = "\u{26CF}", color = t.rarityColor,
			title = t.name,
			subtitle = ("%s Bits per swing (before multipliers)  \u{2022}  %d%% faster swings")
				:format(Format.short(t.power), math.floor((1 - t.speed) * 100)),
			button = owned and (t.order == ownedOrder and "EQUIPPED" or "OWNED")
				or ("%s %s"):format(Format.short(t.cost), t.currency),
			buttonColor = if owned then Theme.BG_LIFT elseif have >= t.cost then Theme.GOOD else Theme.BG_LIFT,
			disabled = owned or have < t.cost,
			onClick = function() buy("tool", t.id) end,
		})
	end
end

builders.buffers = function()
	local ownedOrder = (Buffers.byId[state.buffer] or Buffers.byId[Buffers.starter]).order
	for _, b in ipairs(Buffers.list) do
		local owned = b.order <= ownedOrder
		local have = if b.currency == "Shards" then state.shards else state.bits
		row({
			order = b.order, icon = "\u{1F4E6}", color = Theme.ACCENT,
			title = b.name,
			subtitle = ("Holds %s Bits before you must sell."):format(Format.short(b.capacity)),
			button = owned and (b.order == ownedOrder and "EQUIPPED" or "OWNED")
				or ("%s %s"):format(Format.short(b.cost), b.currency),
			buttonColor = if owned then Theme.BG_LIFT elseif have >= b.cost then Theme.GOOD else Theme.BG_LIFT,
			disabled = owned or have < b.cost,
			onClick = function() buy("buffer", b.id) end,
		})
	end
end

builders.zones = function()
	for _, z in ipairs(Zones.list) do
		local owned = state.zones[z.id] == true
		local locked = state.rebirths < z.requiresRebirth
		row({
			order = z.order, icon = tostring(z.order), color = z.color,
			title = z.name,
			subtitle = ("\u{00D7}%s Bits multiplier  \u{2022}  nodes: %s%s")
				:format(Format.short(z.mult), z.nodeName,
					z.requiresRebirth > 0 and ("  \u{2022}  needs %d Overclocks"):format(z.requiresRebirth) or ""),
			button = if owned then (state.zone == z.id and "HERE" or "WARP")
				elseif locked then "LOCKED"
				else Format.short(z.cost) .. " Bits",
			buttonColor = if owned then Theme.ACCENT elseif (not locked and state.bits >= z.cost) then Theme.GOOD else Theme.BG_LIFT,
			disabled = (state.zone == z.id) or locked or (not owned and state.bits < z.cost),
			onClick = function() buy("zone", z.id) end,
		})
	end
end

builders.eggs = function()
	row({
		order = 0, icon = "\u{1F340}", color = Theme.GOOD, height = 56,
		title = ("Your luck: %s"):format(Format.mult(state.luck)),
		subtitle = "Luck raises the odds of rare familiars and rare variants (Chrome / Corrupt / Golden).",
	})
	for _, egg in ipairs(Pets.eggs) do
		local isRobux = egg.currency == "Robux"
		local locked = (not isRobux) and (state.rebirths < egg.requiresRebirth or not state.zones[egg.zone])
		local have = if egg.currency == "Shards" then state.shards else state.bits
		local multi = state.passes and state.passes.FastHatch

		-- Show the actual pool so players can chase a specific familiar.
		local names = {}
		for _, p in ipairs(Pets.byEgg[egg.id] or {}) do table.insert(names, p.name) end

		local zoneColor = Zones.byId[egg.zone] and Zones.byId[egg.zone].color or Theme.ACCENT
		row({
			order = egg.order,
			viewportEgg = {
				id = egg.id,
				color = zoneColor:Lerp(Color3.new(1, 1, 1), 0.25),
				accent = isRobux and Theme.GOLD or zoneColor,
			},
			color = isRobux and Theme.GOLD or Theme.ACCENT_2,
			height = 84,
			title = egg.name .. (isRobux and "   \u{2B50} EXCLUSIVE" or ""),
			subtitle = ("%s\n%s"):format(
				table.concat(names, "  \u{2022}  "),
				isRobux and "Robux only \u{2014} these familiars are not obtainable any other way."
					or (locked and "LOCKED \u{2014} unlock the matching sector first" or "")),
			button = if isRobux then "BUY \u{2192}"
				elseif locked then "LOCKED"
				else ("%s %s%s"):format(Format.short(egg.cost * (multi and 3 or 1)), egg.currency, multi and "  (x3)" or ""),
			buttonColor = if isRobux then Theme.GOLD
				elseif (not locked and have >= egg.cost) then Theme.GOOD
				else Theme.BG_LIFT,
			disabled = (not isRobux) and (locked or have < egg.cost),
			onClick = function()
				if isRobux then
					Panels.open("robux")
				else
					Remotes.event("Hatch"):FireServer(egg.id)
				end
			end,
		})
	end
end

builders.pets = function()
	local equipped = {}
	for _, uid in ipairs(state.equipped) do equipped[uid] = true end

	local count = 0
	for _ in pairs(state.pets) do count += 1 end

	row({
		order = 0, icon = "\u{1F43E}", color = Theme.ACCENT_2, height = 56,
		title = ("Equipped %d / %d  \u{2022}  %s multiplier"):format(#state.equipped, state.slots, Format.mult(state.petMult)),
		subtitle = ("%d / %d familiars stored."):format(count, state.maxPets or Pets.MAX_INVENTORY),
		button = (state.passes and state.passes.PetSlots) and "MAX SLOTS" or "+3 SLOTS",
		buttonColor = Theme.GOLD,
		disabled = state.passes and state.passes.PetSlots,
		onClick = function()
			Remotes.event("PromptPurchase"):FireServer({ kind = "pass", key = "PetSlots" })
		end,
	})

	-- Sort best-first: players want their strongest at the top, always.
	local sorted = {}
	for uid, owned in pairs(state.pets) do
		local def = Pets.byId[owned.id]
		local variant = Pets.variantById[owned.variant or "normal"]
		if def and variant then
			table.insert(sorted, {
				uid = uid, def = def, variant = variant, owned = owned,
				mult = Progression.petPower(def.mult, variant.multScale, owned.star or 0, owned.level or 0),
			})
		end
	end
	table.sort(sorted, function(a, b) return a.mult > b.mult end)

	for i, entry in ipairs(sorted) do
		local isEquipped = equipped[entry.uid]
		local owned = entry.owned
		local star = owned.star or 0
		local level = owned.level or 0
		local evo = Progression.evoFor(level)
		local tier = owned.serial and Progression.serialTier(owned.serial) or nil

		-- XP progress toward the next level, shown as a fraction rather than a
		-- bar: the pet list is dense and a number reads faster here.
		local xpLine
		if level >= Progression.MAX_LEVEL then
			xpLine = "MAX LEVEL"
		else
			local need = Progression.xpForLevel(level + 1)
			local have = owned.xp or 0
			local prev = Progression.xpForLevel(level)
			xpLine = ("Lv.%d  %s/%s XP"):format(level, Format.short(have - prev), Format.short(need - prev))
		end

		local fusion = Progression.fusionRule(star)
		local dupes = 0
		if fusion then
			for uid2, o2 in pairs(state.pets) do
				if uid2 ~= entry.uid and o2.id == owned.id
					and (o2.variant or "normal") == (owned.variant or "normal")
					and not o2.locked and not equipped[uid2] then
					dupes += 1
				end
			end
		end

		local f = row({
			order = i,
			viewportPet = { id = owned.id, variant = owned.variant },
			height = 92,
			color = if tier and tier.label ~= "" then tier.color
				elseif entry.variant.id ~= "normal" then entry.variant.color
				else entry.def.color,
			title = ("%s%s"):format(
				Progression.displayName(entry.def.name, entry.variant.name, star, level),
				owned.serial and ("  #" .. owned.serial) or ""),
			subtitle = ("+%s multiplier  \u{2022}  %s  \u{2022}  +%.2f luck%s%s\n%s")
				:format(
					Format.short(entry.mult),
					xpLine,
					entry.def.luck,
					evo.stage > 0 and ("  \u{2022}  %s\u{00D7}%.1f"):format(evo.name, evo.multScale) or "",
					(tier and tier.label ~= "") and ("  \u{2022}  " .. tier.label) or "",
					fusion and ((dupes >= fusion.cost)
						and ("\u{2728} READY TO FUSE \u{2014} %d duplicates \u{2192} %d\u{2605} (\u{00D7}%.1f)"):format(fusion.cost, star + 1, fusion.multScale)
						or ("Fuse to %d\u{2605}: %d/%d duplicates"):format(star + 1, dupes, fusion.cost))
						or "\u{2605} Maximum stars"),
			button = if isEquipped then "UNEQUIP" else "EQUIP",
			buttonColor = if isEquipped then Theme.WARN else Theme.GOOD,
			onClick = function()
				Remotes.event("EquipPet"):FireServer({ uid = entry.uid, equip = not isEquipped })
			end,
		})

		-- Secondary actions sit under the main button so the row keeps one
		-- obvious primary action.
		local fuseBtn = Theme.button({
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -12, 1, -8),
			Size = UDim2.new(0, 72, 0, 26),
			BackgroundColor3 = (fusion and dupes >= fusion.cost) and Theme.ACCENT_2 or Theme.BG_LIFT,
			TextColor3 = (fusion and dupes >= fusion.cost) and Theme.BG or Theme.TEXT_DIM,
			Font = Theme.FONT_BLACK, TextSize = 12,
			Text = "FUSE",
			ZIndex = 7, Parent = f,
		})
		if fusion and dupes >= fusion.cost then
			fuseBtn.MouseButton1Click:Connect(function()
				Remotes.event("FusePet"):FireServer({ uid = entry.uid })
			end)
		end

		local lockBtn = Theme.button({
			AnchorPoint = Vector2.new(1, 1),
			Position = UDim2.new(1, -90, 1, -8),
			Size = UDim2.new(0, 72, 0, 26),
			BackgroundColor3 = owned.locked and Theme.GOLD or Theme.BG_LIFT,
			TextColor3 = owned.locked and Theme.BG or Theme.TEXT_DIM,
			Font = Theme.FONT_BLACK, TextSize = 12,
			Text = owned.locked and "LOCKED" or "LOCK",
			ZIndex = 7, Parent = f,
		})
		lockBtn.MouseButton1Click:Connect(function()
			Remotes.event("LockPet"):FireServer({ uid = entry.uid, locked = not owned.locked })
		end)
	end

	if #sorted == 0 then
		row({ order = 1, icon = "\u{1F95A}", title = "No familiars yet",
			subtitle = "Hatch your first egg in the EGGS menu \u{2014} they multiply everything." })
	end
end

builders.quests = function()
	row({
		order = 0, icon = "\u{1F4C5}", color = Theme.GOLD, height = 56,
		title = ("Login streak: day %d"):format(state.login.streak or 0),
		subtitle = "Log in tomorrow to continue the streak. Day 7 pays 400K Bits + 8 Shards.",
	})

	for i, entry in ipairs(state.quests.list or {}) do
		local def = Quests.byId[entry.id]
		if def then
			local done = entry.progress >= def.target
			row({
				order = i, icon = "\u{1F4CB}",
				color = if entry.claimed then Theme.TEXT_DIM elseif done then Theme.GOOD else Theme.WARN,
				title = def.name,
				subtitle = ("%d / %d  \u{2022}  reward: %s Bits%s"):format(
					math.floor(entry.progress), def.target,
					Format.short(def.reward.bits or 0),
					def.reward.shards and (" + " .. def.reward.shards .. " Shards") or ""),
				button = if entry.claimed then "CLAIMED" elseif done then "CLAIM" else "IN PROGRESS",
				buttonColor = if done and not entry.claimed then Theme.GOOD else Theme.BG_LIFT,
				disabled = entry.claimed or not done,
				onClick = function() Remotes.event("ClaimQuest"):FireServer(entry.id) end,
			})
		end
	end

	row({ order = 50, icon = "\u{23F1}", color = Theme.ACCENT, height = 44,
		title = ("Session time: %s"):format(Format.time(state.sessionTime or 0)), subtitle = "" })

	for i, entry in ipairs(Quests.PLAYTIME) do
		local claimed = state.playtimeClaimed[tostring(i)]
		local ready = (state.sessionTime or 0) >= entry.at
		row({
			order = 50 + i, icon = "\u{1F381}",
			color = if claimed then Theme.TEXT_DIM elseif ready then Theme.GOOD else Theme.BG_LIFT,
			title = ("Play %s"):format(Format.time(entry.at)),
			subtitle = ("%s Bits%s"):format(Format.short(entry.bits),
				entry.shards and (" + " .. entry.shards .. " Shards") or ""),
			button = if claimed then "CLAIMED" elseif ready then "CLAIM" else Format.time(entry.at - (state.sessionTime or 0)),
			buttonColor = if ready and not claimed then Theme.GOOD else Theme.BG_LIFT,
			disabled = claimed or not ready,
			onClick = function() Remotes.event("ClaimPlaytime"):FireServer(i) end,
		})
	end
end

builders.rebirth = function()
	local cost = state.rebirthCost
	local can = state.bits >= cost
	local nextMult = Rebirths.multiplierFor(state.rebirths + 1)

	row({
		order = 0, icon = "\u{267B}", color = Theme.GOLD, height = 110,
		title = ("OVERCLOCK #%d"):format(state.rebirths + 1),
		subtitle = ("Cost: %s Bits  (you have %s)\nYou KEEP: familiars, Shards, codes, stats.\nYou LOSE: Bits, chip, buffer, unlocked sectors.\nYou GAIN: +%d Shards and a permanent %s Bits multiplier (now %s).")
			:format(Format.short(cost), Format.short(state.bits), state.rebirthShards,
				Format.mult(nextMult), Format.mult(Rebirths.multiplierFor(state.rebirths))),
		button = if can then "OVERCLOCK" else ("Need %s"):format(Format.short(cost - state.bits)),
		buttonColor = if can then Theme.GOLD else Theme.BG_LIFT,
		disabled = not can,
		onClick = function() Remotes.event("Rebirth"):FireServer() end,
	})

	for _, t in ipairs(Rebirths.TITLES) do
		row({
			order = t.at + 1, icon = "\u{2605}", color = t.color, height = 46,
			title = ("[%d] %s"):format(t.at, t.title),
			subtitle = if state.rebirths >= t.at then "Unlocked" else ("%d more Overclocks"):format(t.at - state.rebirths),
		})
	end
end

builders.robux = function()
	for i, pass in ipairs(Products.passes) do
		local owned = state.passes and state.passes[pass.key]
		row({
			order = i,
			icon = pass.icon,
			viewportPet = pass.grantsPet and {
				id = pass.grantsPet,
				variant = pass.key == "ChromePet" and "chrome" or "normal",
			} or nil,
			color = if pass.tier == "vip" then Theme.GOLD elseif pass.tier == "toy" then Theme.ACCENT_2 else Theme.ACCENT,
			height = 76,
			title = pass.name,
			subtitle = pass.desc,
			button = if owned then "OWNED" else ("R$ %d"):format(pass.price),
			buttonColor = if owned then Theme.BG_LIFT else Theme.GOOD,
			disabled = owned,
			onClick = function()
				Remotes.event("PromptPurchase"):FireServer({ kind = "pass", key = pass.key })
			end,
		})
	end
	for i, product in ipairs(Products.products) do
		row({
			order = 100 + i, icon = product.icon, color = Theme.GOLD, height = 70,
			title = product.name,
			subtitle = product.desc,
			button = ("R$ %d"):format(product.price),
			buttonColor = Theme.GOLD,
			onClick = function()
				Remotes.event("PromptPurchase"):FireServer({ kind = "product", key = product.key })
			end,
		})
	end
end

builders.codes = function()
	local box = Theme.frame({
		Size = UDim2.new(1, -8, 0, 56),
		BackgroundColor3 = Theme.BG_SOFT,
		LayoutOrder = 0, ZIndex = 6, Parent = body,
	})
	Theme.corner(box, 12)
	Theme.stroke(box, Theme.GOOD, 2, 0.4)

	local input = Instance.new("TextBox")
	input.Position = UDim2.new(0, 12, 0, 10)
	input.Size = UDim2.new(1, -170, 0, 36)
	input.BackgroundColor3 = Theme.BG
	input.BorderSizePixel = 0
	input.Font = Theme.FONT_BOLD
	input.TextSize = 16
	input.TextColor3 = Theme.TEXT
	input.PlaceholderText = "Enter code..."
	input.Text = ""
	input.ClearTextOnFocus = false
	input.ZIndex = 7
	input.Parent = box
	Theme.corner(input, 8)

	local submit = Theme.button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 10),
		Size = UDim2.new(0, 140, 0, 36),
		BackgroundColor3 = Theme.GOOD,
		TextColor3 = Theme.BG,
		Font = Theme.FONT_BLACK,
		Text = "REDEEM",
		ZIndex = 7, Parent = box,
	})
	local function send()
		if input.Text ~= "" then
			Remotes.event("RedeemCode"):FireServer(input.Text)
			input.Text = ""
		end
	end
	submit.MouseButton1Click:Connect(send)
	input.FocusLost:Connect(function(enter) if enter then send() end end)

	for i, c in ipairs(Codes.list) do
		local used = state.codes and state.codes[string.upper(c.code)]
		row({
			order = i, icon = "\u{1F381}",
			color = if used then Theme.TEXT_DIM else Theme.GOOD,
			height = 52,
			title = c.code,
			subtitle = c.note,
			button = if used then "REDEEMED" else "AVAILABLE",
			buttonColor = Theme.BG_LIFT,
			disabled = true,
		})
	end
end

builders.trade = function()
	row({
		order = 0, icon = "\u{1F6E1}", color = Theme.WARN, height = 76,
		title = "Trade safety",
		subtitle = "Both sides must confirm, and ANY change to either offer clears both confirmations. "
			.. "Lock a familiar (\u{1F512} in MY FAMILIARS) and it can never be traded, fused away or deleted. "
			.. "Nobody from this game will ever ask you to trade first.",
	})

	local me = Players.LocalPlayer
	local myRoot = me.Character and me.Character:FindFirstChild("HumanoidRootPart")
	local found = 0

	for i, other in ipairs(Players:GetPlayers()) do
		if other ~= me then
			local theirRoot = other.Character and other.Character:FindFirstChild("HumanoidRootPart")
			local dist = (myRoot and theirRoot)
				and ((myRoot :: BasePart).Position - (theirRoot :: BasePart).Position).Magnitude
				or math.huge
			local close = dist <= Trading.MAX_DISTANCE
			found += 1
			row({
				order = i, icon = "\u{1F464}",
				color = close and Theme.GOOD or Theme.BG_LIFT,
				title = other.DisplayName ~= other.Name
					and ("%s (@%s)"):format(other.DisplayName, other.Name) or other.Name,
				subtitle = close and ("%d studs away \u{2014} in range"):format(math.floor(dist))
					or "Too far away \u{2014} walk closer to trade",
				button = close and "REQUEST" or "TOO FAR",
				buttonColor = close and Theme.GOOD or Theme.BG_LIFT,
				disabled = not close,
				onClick = function()
					Remotes.event("TradeRequest"):FireServer({ target = other.UserId })
				end,
			})
		end
	end

	if found == 0 then
		row({ order = 1, icon = "\u{1F465}", title = "Nobody else here yet",
			subtitle = "Trading needs another player in the server. Invite a friend!" })
	end
end

-- ------------------------------------------------------------------- open
function Panels.setState(s)
	state = s
	if current and window and window.Visible then
		Panels.open(current, true)   -- live refresh while open
	end
end

function Panels.open(id: string, silent: boolean?)
	if not window or not state then return end
	local meta = TITLES[id]
	if not meta then return end

	local scroll = body.CanvasPosition
	current = id
	titleLabel.Text = meta[1]
	subtitleLabel.Text = meta[2]

	clear()
	local ok, err = pcall(builders[id])
	if not ok then warn("[Panels] " .. id .. ": " .. tostring(err)) end

	Panels._shade.Visible = true
	window.Visible = true
	if silent then
		body.CanvasPosition = scroll
	else
		Theme.pop(window, UDim2.new(0, 720, 0, 500))
	end
end

function Panels.close()
	if not window then return end
	window.Visible = false
	Panels._shade.Visible = false
	current = nil
end

function Panels.toggle(id: string)
	if current == id then Panels.close() else Panels.open(id) end
end

function Panels.isOpen(): boolean
	return current ~= nil
end

return Panels
