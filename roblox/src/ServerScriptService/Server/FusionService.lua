--!strict
-- Fusion (spend duplicates) and Evolution (earn XP), plus pet locking.
--
-- These are the two systems that give a hatched familiar a future. Without
-- them, the moment a player pulls a Legendary their pet lane is finished and
-- the only thing left is more Bits. With them, every duplicate is fuel and
-- every mining session is progress on something visible.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Pets        = require(Shared.Pets)
local Progression = require(Shared.Progression)
local Remotes     = require(Shared.Remotes)
local Format      = require(Shared.Util.Format)

local DataService  = require(script.Parent.DataService)
local StateService = require(script.Parent.StateService)
local AntiCheat    = require(script.Parent.AntiCheat)

local FusionService = {}

-- ------------------------------------------------------------------ fusion
-- Fodder must match species AND variant, and is chosen worst-first so a player
-- can never accidentally burn their best copy. Locked and equipped familiars
-- are never eligible as fodder -- this is the rule that prevents the single
-- most common "the game ate my pet" support ticket.
local function findFodder(data, target, targetUid: string, needed: number): { string }
	local equipped: { [string]: boolean } = {}
	for _, uid in ipairs(data.equipped) do equipped[uid] = true end

	local candidates = {}
	for uid, owned in pairs(data.pets) do
		if uid ~= targetUid
			and owned.id == target.id
			and (owned.variant or "normal") == (target.variant or "normal")
			and not owned.locked
			and not equipped[uid] then
			table.insert(candidates, {
				uid = uid,
				star = owned.star or 0,
				level = owned.level or 0,
				serial = owned.serial or math.huge,
			})
		end
	end

	-- Worst-first: lowest star, then lowest level, then HIGHEST serial (a low
	-- serial is a collector item and should be the last thing consumed).
	table.sort(candidates, function(a, b)
		if a.star ~= b.star then return a.star < b.star end
		if a.level ~= b.level then return a.level < b.level end
		return a.serial > b.serial
	end)

	local out = {}
	for i = 1, math.min(needed, #candidates) do
		table.insert(out, candidates[i].uid)
	end
	return out
end

function FusionService.previewFusion(data, uid: string)
	local target = data.pets[uid]
	if not target then return nil end
	local star = target.star or 0
	local rule = Progression.fusionRule(star)
	if not rule then return nil end
	local fodder = findFodder(data, target, uid, rule.cost)
	return {
		star = star,
		needed = rule.cost,
		have = #fodder,
		nextScale = rule.multScale,
	}
end

local function fuse(player: Player, uid: string)
	local data = DataService.get(player)
	if not data then return end
	local target = data.pets[uid]
	if not target then return end

	local star = target.star or 0
	local rule = Progression.fusionRule(star)
	if not rule then
		StateService.notify(player, "Already at maximum stars.", "warn")
		return
	end

	local fodder = findFodder(data, target, uid, rule.cost)
	if #fodder < rule.cost then
		StateService.notify(player, ("Need %d more duplicates to fuse (unlocked and unequipped)."):format(rule.cost - #fodder), "warn")
		return
	end

	for _, foddderUid in ipairs(fodder) do
		data.pets[foddderUid] = nil
	end
	target.star = star + 1

	local def = Pets.byId[target.id]
	local variant = Pets.variantById[target.variant or "normal"]
	local name = Progression.displayName(
		def and def.name or "?",
		variant and variant.name or "",
		target.star, target.level or 0)

	StateService.notify(player, ("\u{2728} Fused! %s is now %d-star (\u{00D7}%s)."):format(
		name, target.star, Format.short(rule.multScale)), "good")

	if target.star >= Progression.MAX_STAR then
		StateService.announce(("\u{2B50} %s fused a %d-STAR %s \u{2014} maximum stars!")
			:format(player.Name, target.star, name))
	end

	StateService.push(player)
end

-- --------------------------------------------------------------- evolution
-- XP is split across equipped familiars rather than given to each in full, so
-- running a full six-pet loadout trains everything slowly and running one pet
-- trains it fast. That is a real, readable choice instead of a no-brainer.
function FusionService.awardXp(player: Player, data, amount: number)
	if #data.equipped == 0 then return end
	if StateService.owns(player, "VIP") then
		amount *= Progression.XP_VIP_BONUS
	end
	local each = math.max(1, math.floor(amount / #data.equipped))

	local levelledUp = nil
	for _, uid in ipairs(data.equipped) do
		local owned = data.pets[uid]
		if owned then
			local before = owned.level or 0
			if before < Progression.MAX_LEVEL then
				owned.xp = (owned.xp or 0) + each
				local after = Progression.levelFromXp(owned.xp)
				if after > before then
					owned.level = after
					local beforeEvo = Progression.evoFor(before).stage
					local afterEvo = Progression.evoFor(after).stage
					if afterEvo > beforeEvo then
						levelledUp = { uid = uid, owned = owned, evolved = true, level = after }
					elseif not levelledUp then
						levelledUp = { uid = uid, owned = owned, evolved = false, level = after }
					end
				end
			end
		end
	end

	if levelledUp then
		local owned = levelledUp.owned
		local def = Pets.byId[owned.id]
		local variant = Pets.variantById[owned.variant or "normal"]
		local name = Progression.displayName(
			def and def.name or "?",
			variant and variant.name or "",
			owned.star or 0, owned.level or 0)

		if levelledUp.evolved then
			StateService.notify(player, ("\u{1F31F} EVOLVED! %s"):format(name), "good")
			Remotes.event("Effect"):FireClient(player, { kind = "evolve", name = name })
			StateService.announce(("\u{1F31F} %s evolved a %s!"):format(player.Name, name))
		else
			StateService.notify(player, ("%s reached level %d."):format(name, levelledUp.level), "info")
		end
		StateService.push(player)
	end
end

-- ------------------------------------------------------------------- lock
local function setLocked(player: Player, uid: string, locked: boolean)
	local data = DataService.get(player)
	if not data then return end
	local owned = data.pets[uid]
	if not owned then return end
	owned.locked = locked
	StateService.notify(player,
		locked and "\u{1F512} Locked \u{2014} it can't be traded, fused away or deleted."
		or "\u{1F513} Unlocked.", "info")
	StateService.push(player)
end

-- ------------------------------------------------------------------- init
function FusionService.start()
	Remotes.event("FusePet").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Equip") then return end
		if type(payload) ~= "table" then return end
		local uid = AntiCheat.str(payload.uid, 16)
		if uid then fuse(player, uid) end
	end)

	Remotes.event("LockPet").OnServerEvent:Connect(function(player, payload)
		if not AntiCheat.allow(player, "Equip") then return end
		if type(payload) ~= "table" then return end
		local uid = AntiCheat.str(payload.uid, 16)
		if uid then setLocked(player, uid, payload.locked == true) end
	end)
end

return FusionService
