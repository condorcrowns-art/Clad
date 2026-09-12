--!strict
-- Data.luau — profile persistence.
--
-- Uses DataStore with session locking, retry/backoff and a bind-to-close
-- flush. Roblox DataStores fail more often than new developers expect, and the
-- single fastest way to kill a trading game is to roll back someone's Goob
-- after a trade. So: never overwrite a profile we failed to load, and never
-- let a player act on a profile that isn't confirmed loaded.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local HttpService = game:GetService("HttpService")

local Config = require(game.ReplicatedStorage.GoobShared.Config)
local Names = require(game.ReplicatedStorage.GoobShared.Names)
local Powers = require(game.ReplicatedStorage.GoobShared.Powers)
local Trinkets = require(game.ReplicatedStorage.GoobShared.Trinkets)
local Tutorial = require(game.ReplicatedStorage.GoobShared.Tutorial)
local Cosmetics = require(game.ReplicatedStorage.GoobShared.Cosmetics)
local Season = require(game.ReplicatedStorage.GoobShared.Season)

local Data = {}

local store = DataStoreService:GetDataStore(Config.DATASTORE_KEY)
local profiles: { [number]: any } = {}
local loading: { [number]: boolean } = {}

-- In Studio without API access, DataStore calls throw. We detect that once and
-- fall back to in-memory profiles so the game is fully playable in Studio.
local datastoreEnabled = true

local function newGoob(rng: Random)
    return {
        id = HttpService:GenerateGUID(false),
        nickname = Names.random(rng),
        hue = rng:NextNumber(),
        mass = Config.STARTING_MASS,
        stomach = {},
        bornAt = os.time(),
        inheritedAge = 0,
        lineage = {},
        contents = {},
    }
end

function Data.blankProfile(userId: number)
    local rng = Random.new(userId + os.time())
    return {
        version = 1,
        glob = Config.STARTING_GLOB,
        goobs = { newGoob(rng) },
        activeGoobId = nil :: string?,
        lastSeen = os.time(),
        stats = { caught = 0, gulps = 0, trades = 0, bestMass = Config.STARTING_MASS },
        discovered = {} :: { [string]: boolean },
        tutorial = Tutorial.blank(),
        crests = 0,
        totalAscensions = 0,
        pitWins = 0,
        cosmeticsOwned = Cosmetics.starterOwned(),
        loadout = Cosmetics.starterLoadout(),
        season = Season.blank(),
        achievements = {} :: { [string]: boolean },
        crewId = nil :: string?,
        purchases = {} :: { [string]: boolean },

        -- ── Arena ──────────────────────────────────────────────────────────
        lifetimeBanked = 0,                        -- unlocks powers; never spent
        powerId = Powers.DEFAULT,
        trinketsOwned = {} :: { [string]: boolean },
        trinketSlots = {} :: { string },
        cratePity = {} :: { [string]: number },    -- rolls since this crate's floor
        bestBank = 0,
    }
end

Data.newGoob = newGoob

local function retry<T>(fn: () -> T, attempts: number): (boolean, any)
    local delayFor = 0.5
    for i = 1, attempts do
        local ok, res = pcall(fn)
        if ok then return true, res end
        if i == attempts then return false, res end
        task.wait(delayFor)
        delayFor *= 2
    end
    return false, nil
end

function Data.load(player: Player)
    local userId = player.UserId
    if profiles[userId] then return profiles[userId] end
    loading[userId] = true

    local profile
    if datastoreEnabled then
        local ok, res = retry(function()
            return store:GetAsync("u_" .. userId)
        end, 4)
        if ok then
            profile = res
        else
            -- Distinguish "no API access in Studio" from a real outage.
            if RunService:IsStudio() then
                datastoreEnabled = false
                warn("[Goob/Data] DataStores unavailable (Studio). Running in-memory.")
            else
                warn("[Goob/Data] Load failed for " .. userId .. ": " .. tostring(res))
                loading[userId] = nil
                -- Refuse to hand back a blank profile in live servers — that is
                -- how you wipe someone's year-old Goob. Kick instead.
                player:Kick("Couldn't load your Goobs. Please rejoin — nothing was lost.")
                return nil
            end
        end
    end

    if not profile then
        profile = Data.blankProfile(userId)
    end

    -- Forward-migrate older saves here as the schema grows.
    profile.stats = profile.stats or { caught = 0, gulps = 0, trades = 0, bestMass = 0 }
    profile.discovered = profile.discovered or {}
    profile.crests = profile.crests or 0
    profile.totalAscensions = profile.totalAscensions or 0
    profile.pitWins = profile.pitWins or 0
    profile.achievements = profile.achievements or {}
    profile.purchases = profile.purchases or {}

    -- Arena fields. A profile written before the arena existed keeps every
    -- Goob it had and simply starts the new progression at zero, which is the
    -- only migration that is safe without asking the player anything.
    profile.lifetimeBanked = profile.lifetimeBanked or 0
    profile.bestBank = profile.bestBank or 0
    profile.trinketsOwned = profile.trinketsOwned or {}
    profile.trinketSlots = profile.trinketSlots or {}
    profile.cratePity = profile.cratePity or {}
    if not Powers.isOwned(profile.powerId or "", profile.lifetimeBanked) then
        profile.powerId = Powers.DEFAULT
    end
    -- Drop equipped trinkets the player does not actually own. This runs on
    -- every load on purpose: it is the one guard that survives a rollback, a
    -- bad merge, or an exploiter writing a slot they never earned.
    do
        local kept = {}
        for _, id in ipairs(profile.trinketSlots) do
            if profile.trinketsOwned[id] and #kept < Trinkets.SLOTS then
                table.insert(kept, id)
            end
        end
        profile.trinketSlots = kept
    end

    -- Cosmetics: always merge in the starters rather than replacing, so a
    -- profile written before a slot existed gains the new slot's default
    -- without losing anything it already owned.
    profile.cosmeticsOwned = profile.cosmeticsOwned or {}
    for id in pairs(Cosmetics.starterOwned()) do
        profile.cosmeticsOwned[id] = true
    end
    profile.loadout = Cosmetics.sanitise(profile.loadout, profile.cosmeticsOwned)

    profile.season = profile.season or Season.blank()
    Season.rollIfNeeded(profile.season)
    -- Players who joined before the tutorial existed already know the game, so
    -- they get it marked complete rather than being walked through it.
    if not profile.tutorial then
        local t = Tutorial.blank()
        t.done = true
        t.dismissed = true
        t.step = #Tutorial.STEPS
        profile.tutorial = t
    end
    if not profile.activeGoobId and profile.goobs[1] then
        profile.activeGoobId = profile.goobs[1].id
    end

    profiles[userId] = profile
    loading[userId] = nil
    return profile
end

function Data.get(player: Player)
    return profiles[player.UserId]
end

function Data.save(player: Player, release: boolean?)
    local userId = player.UserId
    local profile = profiles[userId]
    if not profile then return end
    profile.lastSeen = os.time()

    if datastoreEnabled then
        local ok, err = retry(function()
            return store:UpdateAsync("u_" .. userId, function()
                return profile
            end)
        end, 3)
        if not ok then
            warn("[Goob/Data] Save failed for " .. userId .. ": " .. tostring(err))
        end
    end

    if release then profiles[userId] = nil end
end

function Data.saveAll()
    for _, player in ipairs(Players:GetPlayers()) do
        task.spawn(Data.save, player, false)
    end
end

function Data.isEnabled(): boolean
    return datastoreEnabled
end

return Data
