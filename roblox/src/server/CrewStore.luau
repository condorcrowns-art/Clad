--!strict
-- CrewStore.luau — crews live in their own DataStore because they are shared
-- between players and between servers. A crew read here may have been written
-- by a different server thirty seconds ago, so every mutation goes through
-- UpdateAsync rather than get-modify-set, which would silently drop the other
-- server\'s changes.

local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")

local Crew = require(game.ReplicatedStorage.GoobShared.Crew)

local CrewStore = {}

local store = DataStoreService:GetDataStore("GoobCrews_v1")
local memory: { [string]: any } = {}
local tagIndex: { [string]: string } = {}
local enabled = true

local function key(id: string): string
    return "crew_" .. id
end

local function fallback(): boolean
    return (not enabled) or RunService:IsStudio()
end

function CrewStore.get(id: string?): any
    if not id then return nil end
    if memory[id] then return memory[id] end
    if fallback() then return nil end
    local ok, res = pcall(function() return store:GetAsync(key(id)) end)
    if not ok then
        enabled = false
        warn("[Goob/Crew] store unavailable; running in memory")
        return nil
    end
    if res then memory[id] = res end
    return res
end

function CrewStore.findByTag(tag: string): any
    local id = tagIndex[tag]
    if id then return CrewStore.get(id) end
    for _, crew in pairs(memory) do
        if crew.tag == tag then return crew end
    end
    if fallback() then return nil end
    local ok, res = pcall(function() return store:GetAsync("tag_" .. tag) end)
    if ok and res then
        tagIndex[tag] = res
        return CrewStore.get(res)
    end
    return nil
end

function CrewStore.create(name: string, tag: string, ownerId: number, ownerName: string): any?
    if CrewStore.findByTag(tag) then return nil end
    local id = HttpService:GenerateGUID(false)
    local crew = Crew.blank(id, name, tag, ownerId, Crew.currentWeek())
    crew.members[tostring(ownerId)].name = ownerName
    memory[id] = crew
    tagIndex[tag] = id
    if not fallback() then
        pcall(function()
            store:SetAsync(key(id), crew)
            store:SetAsync("tag_" .. tag, id)
        end)
    end
    return crew
end

-- Mutate under UpdateAsync so two servers changing the same crew cannot clobber
-- each other. `mutator` receives the authoritative copy and returns it changed.
function CrewStore.update(id: string, mutator: (any) -> any?): any?
    local current = CrewStore.get(id)
    if not current then return nil end

    if fallback() then
        local changed = mutator(current)
        if changed then memory[id] = changed end
        return changed or current
    end

    local ok, res = pcall(function()
        return store:UpdateAsync(key(id), function(stored)
            local base = stored or current
            return mutator(base) or base
        end)
    end)
    if not ok then
        warn("[Goob/Crew] update failed for " .. id)
        return current
    end
    memory[id] = res
    return res
end

function CrewStore.isEnabled(): boolean
    return enabled
end

return CrewStore
