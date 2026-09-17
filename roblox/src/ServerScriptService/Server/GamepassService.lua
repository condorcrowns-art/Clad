--!strict
-- Gamepasses + developer products.
--
-- ProcessReceipt is the highest-stakes function in any Roblox game: return the
-- wrong value and you either double-grant (lost revenue integrity) or fail to
-- grant (refund requests and one-star reviews). The pattern below is the safe
-- one: record the PurchaseId in the player's own save BEFORE returning
-- Granted, and return NotProcessedYet on any failure so Roblox retries.

local MarketplaceService = game:GetService("MarketplaceService")
local Players            = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Products = require(Shared.Products)
local Remotes  = require(Shared.Remotes)
local Format   = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local AntiCheat    = require(script.Parent.AntiCheat)

local GamepassService = {}

-- ------------------------------------------------------------- ownership
local function refreshPasses(player: Player)
	local owned = {}
	for _, pass in ipairs(Products.passes) do
		if pass.id and pass.id > 0 then
			local ok, has = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, pass.id)
			end)
			owned[pass.key] = ok and has or false
		else
			owned[pass.key] = false   -- id not configured yet
		end
	end
	StateService.passes[player] = owned
end
GamepassService.refreshPasses = refreshPasses

function GamepassService.onJoin(player: Player)
	refreshPasses(player)
end

-- ---------------------------------------------------------------- grants
local function grantProduct(player: Player, product): boolean
	local data = DataService.get(player)
	if not data then return false end
	local EconomyService = require(script.Parent.EconomyService)

	if product.kind == "bits_pct" then
		-- Scaled to the player's own progression so the pack is never a
		-- "ruins the game" purchase early or a worthless one late.
		local amount = math.max(10_000, math.floor(data.bestBits * product.amount))
		EconomyService.award(player, "Bits", amount)
		StateService.notify(player, ("+%s Bits!"):format(Format.short(amount)), "good")

	elseif product.kind == "shards" then
		EconomyService.award(player, "Shards", product.amount)
		StateService.notify(player, ("+%d Shards!"):format(product.amount), "good")

	elseif product.kind == "boost" then
		data.boosts.bits = math.max(data.boosts.bits or 0, os.time()) + product.amount
		StateService.notify(player, ("\u{26A1} 2x Bits for %s!"):format(Format.time(product.amount)), "good")

	elseif product.kind == "luck_boost" then
		data.boosts.luck = math.max(data.boosts.luck or 0, os.time()) + product.amount
		StateService.notify(player, ("\u{1F340} 3x Luck for %s!"):format(Format.time(product.amount)), "good")

	elseif product.kind == "server_boost" then
		StateService.serverBoostUntil = math.max(StateService.serverBoostUntil, os.time()) + product.amount
		StateService.announce(("\u{1F310} %s activated SERVER-WIDE 2x BITS for %s! Thank them!")
			:format(player.Name, Format.time(product.amount)))
		for _, p in ipairs(Players:GetPlayers()) do StateService.push(p) end

	else
		return false
	end

	StateService.push(player)
	return true
end

-- ---------------------------------------------------------- ProcessReceipt
local function processReceipt(info: any)
	local player = Players:GetPlayerByUserId(info.PlayerId)
	if not player then
		-- They left mid-purchase. Do NOT grant, do NOT consume -- Roblox will
		-- re-fire this when they come back.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local data = DataService.get(player)
	if not data then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	data.receipts = data.receipts or {}
	local receiptKey = tostring(info.PurchaseId)
	if data.receipts[receiptKey] then
		-- Already granted in a previous attempt.
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	local product = Products.productById[info.ProductId]
	if not product then
		warn("[Gamepass] unknown product id " .. tostring(info.ProductId))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local ok, granted = pcall(grantProduct, player, product)
	if not ok or not granted then
		warn("[Gamepass] grant failed: " .. tostring(granted))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	data.receipts[receiptKey] = os.time()
	-- Keep the receipt table from growing forever.
	local count = 0
	for _ in pairs(data.receipts) do count += 1 end
	if count > 200 then
		local oldestKey, oldestTime = nil, math.huge
		for k, v in pairs(data.receipts) do
			if v < oldestTime then oldestKey, oldestTime = k, v end
		end
		if oldestKey then data.receipts[oldestKey] = nil end
	end

	-- Flush immediately: a purchase must survive a crash three seconds later.
	DataService.save(player, false)
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

-- -------------------------------------------------------------------- init
function GamepassService.start()
	MarketplaceService.ProcessReceipt = processReceipt

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased then return end
		refreshPasses(player)
		local data = DataService.get(player)
		if data then
			local RebirthService = require(script.Parent.RebirthService)
			RebirthService.applyTitle(player, data)
		end
		for _, pass in ipairs(Products.passes) do
			if pass.id == passId then
				StateService.announce(("\u{1F48E} %s bought %s!"):format(player.Name, pass.name))
				StateService.notify(player, ("%s unlocked!"):format(pass.name), "good")
			end
		end
		StateService.push(player)
	end)

	Remotes.event("PromptPurchase").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Buy") then return end
		if type(payload) ~= "table" then return end
		local kind = AntiCheat.str(payload.kind, 12)
		local key  = AntiCheat.str(payload.key, 32)
		if not kind or not key then return end

		if kind == "pass" then
			local pass = Products.passByKey[key]
			if not pass then return end
			if pass.id <= 0 then
				StateService.notify(player, "This pass isn't live yet \u{2014} check back soon!", "warn")
				return
			end
			MarketplaceService:PromptGamePassPurchase(player, pass.id)
		elseif kind == "product" then
			local product = Products.productByKey[key]
			if not product then return end
			if product.id <= 0 then
				StateService.notify(player, "This item isn't live yet \u{2014} check back soon!", "warn")
				return
			end
			MarketplaceService:PromptProductPurchase(player, product.id)
		end
	end)

	-- Re-check ownership periodically: a player can buy a pass from the web
	-- while in game, and PromptGamePassPurchaseFinished won't fire for that.
	task.spawn(function()
		while true do
			task.wait(120)
			for _, player in ipairs(Players:GetPlayers()) do
				task.spawn(function()
					local before = StateService.passes[player]
					refreshPasses(player)
					local after = StateService.passes[player]
					if before and after then
						for k, v in pairs(after) do
							if v and not before[k] then StateService.push(player) break end
						end
					end
				end)
				task.wait(0.5)
			end
		end
	end)
end

return GamepassService
