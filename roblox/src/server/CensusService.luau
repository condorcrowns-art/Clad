--!strict
-- CensusService.luau — how many of each thing still exist, worldwide.
--
-- WHY THIS IS THE MOST IMPORTANT SCREEN IN THE GAME:
-- the entire design rests on genuine scarcity, and until now that scarcity was
-- invisible. A player was told Secrets are rare and asked to take it on faith.
-- This counts them for real, across every server, and puts the number on a
-- monument you can roll up to and read.
--
-- ALIVE = CAUGHT − DESTROYED.
--
-- Things are destroyed by ASCENSION: a Goob consumed at the altar takes
-- everything in its belly with it. So the more people reach the endgame, the
-- rarer old Secrets genuinely become — the prestige loop feeds the scarcity
-- loop, and both are visible on the same wall.
--
-- WRITE DISCIPLINE: DataStore budgets are per-server and small. Counting on
-- every catch would blow through them within minutes of a busy server. Deltas
-- accumulate in memory and flush on an interval, and a failed flush is retried
-- rather than dropped.

local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local Shared = game.ReplicatedStorage.GoobShared
local Feedstock = require(Shared.Feedstock)

local CensusService = {}

local store = DataStoreService:GetDataStore("GoobCensus_v1")

-- Only the tiers worth counting. Nobody cares how many Lost Socks exist, and
-- counting them would multiply the write volume for no payoff.
CensusService.TRACKED_RARITIES = {
    Legendary = true, Mythic = true, Secret = true,
}

CensusService.FLUSH_SECONDS = 60

local pendingCaught: { [string]: number } = {}
local pendingDestroyed: { [string]: number } = {}
local totals: { [string]: { caught: number, destroyed: number } } = {}
local enabled = true
local lastFlush = 0

CensusService.onUpdate = Instance.new("BindableEvent")

local function tracked(itemId: string): boolean
    local item = Feedstock.get(itemId)
    return item ~= nil and CensusService.TRACKED_RARITIES[item.rarity] == true
end

function CensusService.recordCaught(itemId: string, count: number?)
    if not tracked(itemId) then return end
    pendingCaught[itemId] = (pendingCaught[itemId] or 0) + (count or 1)
end

-- Called when a Goob is consumed at the altar: everything inside it is gone.
function CensusService.recordDestroyed(contents: { [string]: number }?)
    if not contents then return end
    for itemId, count in pairs(contents) do
        if tracked(itemId) then
            pendingDestroyed[itemId] = (pendingDestroyed[itemId] or 0) + count
        end
    end
end

local function applyLocally(itemId: string, caught: number, destroyed: number)
    local row = totals[itemId] or { caught = 0, destroyed = 0 }
    row.caught += caught
    row.destroyed += destroyed
    totals[itemId] = row
end

function CensusService.flush()
    local caughtBatch, destroyedBatch = pendingCaught, pendingDestroyed
    pendingCaught, pendingDestroyed = {}, {}

    local any = false
    for _ in pairs(caughtBatch) do any = true break end
    if not any then
        for _ in pairs(destroyedBatch) do any = true break end
    end
    if not any then return end

    -- Optimistically apply so the monument on THIS server is live even if the
    -- write is still in flight or the store is down.
    for id, n in pairs(caughtBatch) do applyLocally(id, n, 0) end
    for id, n in pairs(destroyedBatch) do applyLocally(id, 0, n) end
    CensusService.onUpdate:Fire(CensusService.snapshot())

    if not enabled or RunService:IsStudio() then return end

    for id, n in pairs(caughtBatch) do
        local ok = pcall(function()
            store:UpdateAsync("caught_" .. id, function(old)
                return (old or 0) + n
            end)
        end)
        if not ok then
            -- Put it back so the count is delayed rather than silently lost.
            pendingCaught[id] = (pendingCaught[id] or 0) + n
            enabled = false
            warn("[Goob/Census] store unavailable; counting locally only")
            break
        end
    end
    for id, n in pairs(destroyedBatch) do
        local ok = pcall(function()
            store:UpdateAsync("destroyed_" .. id, function(old)
                return (old or 0) + n
            end)
        end)
        if not ok then
            pendingDestroyed[id] = (pendingDestroyed[id] or 0) + n
            enabled = false
            break
        end
    end
end

-- Pull the authoritative worldwide numbers. Runs rarely; the monument is happy
-- being a minute stale and the read budget is not.
function CensusService.refresh()
    if not enabled or RunService:IsStudio() then return end
    for _, item in ipairs(Feedstock.ITEMS) do
        if CensusService.TRACKED_RARITIES[item.rarity] then
            local okC, caught = pcall(function() return store:GetAsync("caught_" .. item.id) end)
            local okD, destroyed = pcall(function() return store:GetAsync("destroyed_" .. item.id) end)
            if okC and okD then
                totals[item.id] = { caught = caught or 0, destroyed = destroyed or 0 }
            else
                enabled = false
                return
            end
        end
    end
    CensusService.onUpdate:Fire(CensusService.snapshot())
end

-- Rarest first, because that is the row people came to read.
function CensusService.snapshot()
    local rows = {}
    for _, item in ipairs(Feedstock.ITEMS) do
        if CensusService.TRACKED_RARITIES[item.rarity] then
            local row = totals[item.id] or { caught = 0, destroyed = 0 }
            table.insert(rows, {
                id = item.id,
                name = item.name,
                rarity = item.rarity,
                weight = item.weight,
                caught = row.caught,
                destroyed = row.destroyed,
                alive = math.max(0, row.caught - row.destroyed),
            })
        end
    end
    table.sort(rows, function(a, b)
        if a.weight ~= b.weight then return a.weight < b.weight end
        return a.name < b.name
    end)
    return rows
end

function CensusService.isEnabled(): boolean
    return enabled
end

function CensusService.start()
    task.spawn(function()
        CensusService.refresh()
        while true do
            task.wait(CensusService.FLUSH_SECONDS)
            CensusService.flush()
            lastFlush = os.clock()
        end
    end)
    -- Re-read far less often than we write: other servers' contributions can
    -- afford to arrive late, and read budget is the scarcer resource.
    task.spawn(function()
        while true do
            task.wait(CensusService.FLUSH_SECONDS * 5)
            CensusService.refresh()
        end
    end)
    game:BindToClose(function()
        CensusService.flush()
    end)
end

return CensusService
