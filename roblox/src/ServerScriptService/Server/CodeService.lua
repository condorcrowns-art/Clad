--!strict
-- Redeemable codes. One redeem per code per player, tracked in their save.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Codes   = require(Shared.Codes)
local Remotes = require(Shared.Remotes)
local Format  = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local AntiCheat    = require(script.Parent.AntiCheat)

local CodeService = {}

function CodeService.start()
	local EconomyService = require(script.Parent.EconomyService)

	Remotes.event("RedeemCode").OnServerEvent:Connect(function(player, raw)
		if not AntiCheat.allow(player, "Code") then return end
		local text = AntiCheat.str(raw, 40)
		local data = DataService.get(player)
		if not text or not data then return end

		local code = string.upper((text:gsub("%s", "")))
		local def = Codes.byCode[code]
		if not def then
			StateService.notify(player, "Invalid code.", "warn")
			return
		end
		if def.expires and os.time() > def.expires then
			StateService.notify(player, "That code has expired.", "warn")
			return
		end
		if data.codes[code] then
			StateService.notify(player, "You already redeemed that code.", "warn")
			return
		end

		data.codes[code] = os.time()
		local parts = {}
		if def.rewards.bits then
			EconomyService.award(player, "Bits", def.rewards.bits)
			table.insert(parts, Format.short(def.rewards.bits) .. " Bits")
		end
		if def.rewards.shards then
			EconomyService.award(player, "Shards", def.rewards.shards)
			table.insert(parts, def.rewards.shards .. " Shards")
		end
		if def.rewards.bits_boost then
			data.boosts.bits = math.max(data.boosts.bits or 0, os.time()) + def.rewards.bits_boost
			table.insert(parts, "2x Bits for " .. Format.time(def.rewards.bits_boost))
		end
		if def.rewards.luck_boost then
			data.boosts.luck = math.max(data.boosts.luck or 0, os.time()) + def.rewards.luck_boost
			table.insert(parts, "3x Luck for " .. Format.time(def.rewards.luck_boost))
		end

		StateService.notify(player, ("\u{1F381} Code redeemed: %s"):format(table.concat(parts, ", ")), "good")
		StateService.push(player)
	end)
end

return CodeService
