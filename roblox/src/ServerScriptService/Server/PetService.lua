--!strict
-- Familiars: hatching, equipping, deleting.
--
-- Hatch odds are computed server-side and the *result* is sent to the client
-- for the reveal animation. Never let the client roll -- and never send the
-- full weight table down, or someone will build an odds-sniping autoclicker.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Pets        = require(Shared.Pets)
local Progression = require(Shared.Progression)
local Remotes = require(Shared.Remotes)
local Format  = require(Shared.Util.Format)
local Rng     = require(Shared.Util.Rng)

local DataService  = require(script.Parent.DataService)
local SerialService = require(script.Parent.SerialService)
local StateService = require(script.Parent.StateService)
local AntiCheat    = require(script.Parent.AntiCheat)

local PetService = {}

local function countPets(data): number
	local n = 0
	for _ in pairs(data.pets) do n += 1 end
	return n
end

local function rollVariant(luck: number)
	-- Roll rarest-first so the good outcome wins ties.
	for i = #Pets.variants, 2, -1 do
		local v = Pets.variants[i]
		if Rng.chance(v.chance, luck) then return v end
	end
	return Pets.variants[1]
end

local function hatchOne(player: Player, egg, data, luck: number)
	local pool = Pets.byEgg[egg.id]
	if not pool or #pool == 0 then return nil end

	local def = Rng.weighted(pool, luck)
	local variant = rollVariant(luck)

	local uid = tostring(data.nextPetUid)
	data.nextPetUid += 1

	-- Mint the global serial. nil is an acceptable outcome (DataStore
	-- unreachable) -- losing the hatch would be far worse than a missing number.
	local serial = SerialService.mint(def.id)

	data.pets[uid] = {
		id = def.id,
		variant = variant.id,
		locked = false,
		serial = serial,
		star = 0,
		xp = 0,
		level = 0,
	}
	data.stats.hatched += 1

	return {
		uid = uid, id = def.id, variant = variant.id,
		name = variant.name .. def.name,
		mult = def.mult * variant.multScale,
		weight = def.weight,
		serial = serial,
		serialTier = serial and Progression.serialTier(serial).label or nil,
	}
end

-- Grant hatches without charging. Used by the Robux egg products, which have
-- already been paid for through ProcessReceipt.
function PetService.grantHatches(player: Player, eggId: string, count: number)
	local data = DataService.get(player)
	local egg = Pets.eggById[eggId]
	if not data or not egg then return end

	local luck = StateService.luck(player, data)
	local results = {}
	for _ = 1, count do
		if countPets(data) >= Pets.MAX_INVENTORY then break end
		local r = hatchOne(player, egg, data, luck)
		if r then table.insert(results, r) end
	end
	if #results == 0 then
		StateService.notify(player, "Familiar storage is full \u{2014} delete some and rejoin to claim.", "warn")
		return
	end

	local slots = StateService.petSlots(player, data)
	for _, r in ipairs(results) do
		if #data.equipped < slots then table.insert(data.equipped, r.uid) end
	end

	Remotes.event("HatchResult"):FireClient(player, { egg = egg.id, pets = results })
	for _, r in ipairs(results) do
		local variant = Pets.variantById[r.variant]
		if r.weight <= 500 or (variant and variant.chance >= 40) or (r.serial and r.serial <= 100) then
			StateService.announce(("\u{1F48E} %s opened a %s and got %s%s!"):format(
				player.Name, egg.name, r.name, r.serial and (" #" .. r.serial) or ""))
		end
	end
	StateService.push(player)
end

local function hatch(player: Player, eggId: string)
	local data = DataService.get(player)
	local egg = Pets.eggById[eggId]
	if not data or not egg then return end

	-- Robux eggs are never purchasable with in-game currency.
	if egg.currency == "Robux" then
		Remotes.event("PromptPurchase"):FireClient(player, { kind = "product", key = "Egg_Prime_1" })
		return
	end

	if data.rebirths < egg.requiresRebirth then
		StateService.notify(player, ("Requires %d Overclocks."):format(egg.requiresRebirth), "warn")
		return
	end
	if not data.zones[egg.zone] then
		StateService.notify(player, "Unlock that sector first.", "warn")
		return
	end
	if countPets(data) >= Pets.MAX_INVENTORY then
		StateService.notify(player, "Familiar storage full \u{2014} delete some first.", "warn")
		return
	end

	local count = if StateService.owns(player, "FastHatch") then 3 else 1
	count = math.min(count, Pets.MAX_INVENTORY - countPets(data))
	if count <= 0 then return end

	local EconomyService = require(script.Parent.EconomyService)
	local total = egg.cost * count
	if not EconomyService.spend(player, egg.currency, total) then
		StateService.notify(player, ("Need %s %s."):format(Format.short(total), egg.currency), "warn")
		return
	end

	local luck = StateService.luck(player, data)
	local results = {}
	for _ = 1, count do
		local r = hatchOne(player, egg, data, luck)
		if r then table.insert(results, r) end
	end

	local QuestService = require(script.Parent.QuestService)
	QuestService.progress(player, "hatch", #results)

	-- Auto-equip if there's a free slot: new players should never have to
	-- discover the equip UI before their first pet does anything.
	local slots = StateService.petSlots(player, data)
	for _, r in ipairs(results) do
		if #data.equipped < slots then
			table.insert(data.equipped, r.uid)
		end
	end

	Remotes.event("HatchResult"):FireClient(player, { egg = egg.id, pets = results })

	-- Server-wide shout for genuinely rare pulls. This is free hype and the
	-- single cheapest way to make a server feel alive.
	for _, r in ipairs(results) do
		local variant = Pets.variantById[r.variant]
		local lowSerial = r.serial ~= nil and r.serial <= 100
		if r.weight <= 90 or (variant and variant.chance >= 400) or lowSerial then
			StateService.announce(("\u{1F389} %s hatched a %s%s from the %s!"):format(
				player.Name, r.name,
				r.serial and (" #" .. r.serial) or "",
				egg.name))
		end
	end

	StateService.push(player)
end

local function equip(player: Player, uid: string, wantEquip: boolean)
	local data = DataService.get(player)
	if not data or not data.pets[uid] then return end

	for i, e in ipairs(data.equipped) do
		if e == uid then
			if wantEquip then return end
			table.remove(data.equipped, i)
			StateService.push(player)
			return
		end
	end
	if not wantEquip then return end

	if #data.equipped >= StateService.petSlots(player, data) then
		StateService.notify(player, "All pet slots full. (+3 slots in the shop!)", "warn")
		Remotes.event("PromptPurchase"):FireClient(player, { kind = "pass", key = "PetSlots" })
		return
	end
	table.insert(data.equipped, uid)
	StateService.push(player)
end

local function deletePet(player: Player, uid: string)
	local data = DataService.get(player)
	if not data then return end
	local owned = data.pets[uid]
	if not owned or owned.locked then return end
	for i, e in ipairs(data.equipped) do
		if e == uid then table.remove(data.equipped, i); break end
	end
	data.pets[uid] = nil
	StateService.push(player)
end

function PetService.start()
	Remotes.event("Hatch").OnServerEvent:Connect(function(player, eggId)
		if not AntiCheat.allow(player, "Hatch") then return end
		local id = AntiCheat.str(eggId, 32)
		if id then hatch(player, id) end
	end)

	Remotes.event("EquipPet").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Equip") then return end
		if type(payload) ~= "table" then return end
		local uid = AntiCheat.str(payload.uid, 16)
		if uid then equip(player, uid, payload.equip == true) end
	end)

	Remotes.event("DeletePet").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Equip") then return end
		if type(payload) ~= "table" then return end
		local uid = AntiCheat.str(payload.uid, 16)
		if uid then deletePet(player, uid) end
	end)
end

return PetService
