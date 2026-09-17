--!strict
-- Global serial numbers for familiars.
--
-- Every familiar minted anywhere in the game gets a permanent, global serial
-- for its species: "THE PRIME #7". Low serials are the only thing in the game
-- that cannot be grinded, bought or traded for at will -- which is exactly why
-- collectors chase them, and why they cost you nothing to produce.
--
-- THE ENGINEERING PROBLEM: a DataStore key takes ~12 writes/second globally.
-- At scale, hatching would throttle instantly if every hatch did its own
-- IncrementAsync. So each server RESERVES A BLOCK of serials per species with
-- one write, then hands them out from memory.
--
-- The tradeoff is honest and worth stating: a server that crashes mid-block
-- burns the rest of that block, so serials have gaps. Gaps are fine -- they are
-- invisible to players, who only care that their number is low and unique.
-- Duplicates would NOT be fine, and this design makes them impossible.

local DataStoreService = game:GetService("DataStoreService")

local SerialService = {}

local BLOCK_SIZE = 25

local store = DataStoreService:GetDataStore("OverclockSim_Serials_v1")

-- petId -> { nextSerial, blockEnd }
local blocks: { [string]: { next: number, last: number } } = {}
-- petId -> true while a reservation is in flight, so ten simultaneous hatches
-- of the same species queue behind one write instead of racing.
local reserving: { [string]: boolean } = {}

local function reserve(petId: string): boolean
	if reserving[petId] then
		-- Someone else is already extending this block; wait for them.
		local deadline = os.clock() + 10
		while reserving[petId] and os.clock() < deadline do
			task.wait(0.1)
		end
		return blocks[petId] ~= nil and blocks[petId].next <= blocks[petId].last
	end

	reserving[petId] = true
	local ok, result = pcall(function()
		return store:IncrementAsync(petId, BLOCK_SIZE)
	end)
	reserving[petId] = false

	if not ok or type(result) ~= "number" then
		warn("[SerialService] failed to reserve block for " .. petId .. ": " .. tostring(result))
		return false
	end

	-- IncrementAsync returns the value AFTER the increment, so the block we
	-- just claimed is (result - BLOCK_SIZE + 1) .. result.
	blocks[petId] = { next = result - BLOCK_SIZE + 1, last = result }
	return true
end

-- Returns a serial, or nil if the DataStore is unreachable. Callers must treat
-- nil as "unserialised" rather than failing the hatch -- losing a pet to a
-- DataStore hiccup is far worse than a pet with no serial.
function SerialService.mint(petId: string): number?
	local block = blocks[petId]
	if not block or block.next > block.last then
		if not reserve(petId) then return nil end
		block = blocks[petId]
		if not block then return nil end
	end

	local serial = block.next
	block.next += 1
	return serial
end

-- Mint several at once (bulk hatch) without re-checking per item.
function SerialService.mintMany(petId: string, count: number): { number? }
	local out = table.create(count)
	for i = 1, count do
		out[i] = SerialService.mint(petId)
	end
	return out
end

return SerialService
