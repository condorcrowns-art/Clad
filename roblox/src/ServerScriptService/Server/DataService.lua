--!strict
-- Session-locked DataStore layer.
--
-- Why not just :SetAsync on leave? Because that loses data on server crash,
-- duplicates currency across two servers during a teleport, and silently fails
-- under throttling. This layer gives you:
--   * a session lock (jobId + heartbeat) so the same player can't be live on
--     two servers and dupe
--   * UpdateAsync everywhere (atomic read-modify-write, no lost updates)
--   * exponential-backoff retries on every call
--   * autosave + BindToClose flush so a shutdown never eats progress
--   * schema migration hook for when you add fields in v2
--
-- This is the part of a simulator you cannot bolt on later. Lost-data posts
-- kill games faster than bad balance.

local DataStoreService = game:GetService("DataStoreService")
local RunService       = game:GetService("RunService")

local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config  = require(Shared.Config)
local Zones   = require(Shared.Zones)
local Tools   = require(Shared.Tools)
local Buffers = require(Shared.Buffers)

local store = DataStoreService:GetDataStore(Config.DATASTORE_NAME, Config.DATASTORE_SCOPE)

local DataService = {}
DataService.profiles = {} :: { [Player]: any }

local JOB_ID = if game.JobId ~= "" then game.JobId else "studio-" .. tostring(os.time())

-- ---------------------------------------------------------------- template
local function template()
	return {
		version   = Config.DATA_VERSION,
		bits      = 0,
		shards    = 0,
		rebirths  = 0,
		tool      = Tools.starter,
		buffer    = Buffers.starter,
		zone      = Zones.starter,
		zones     = { [Zones.starter] = true },
		pets      = {},              -- uid -> { id, variant, locked }
		equipped  = {},              -- array of uid
		nextPetUid= 1,
		stats     = { mined = 0, sold = 0, hatched = 0, playtime = 0, joins = 0, rebirths = 0 },
		quests    = { day = "", list = {}, allClaimed = false },
		login     = { lastDay = "", streak = 0 },
		playtimeClaimed = {},
		codes     = {},
		bestBits  = 0,
		totalBits = 0,
		boosts    = { bits = 0, luck = 0 },   -- os.time() expiries
		lastLeave = 0,
		-- session lock
		_lock     = nil,
		_lockTime = 0,
	}
end
DataService.template = template

-- ------------------------------------------------------------------ retry
local function retry<T>(fn: () -> T, label: string): (boolean, any)
	local delayFor = 0.5
	for attempt = 1, 5 do
		local ok, res = pcall(fn)
		if ok then return true, res end
		warn(("[DataService] %s failed (attempt %d/5): %s"):format(label, attempt, tostring(res)))
		if attempt < 5 then
			task.wait(delayFor)
			delayFor = math.min(delayFor * 2, 8)
		end
	end
	return false, nil
end

-- -------------------------------------------------------------- migration
-- Add a migration per schema bump. Never delete old branches -- a player who
-- last played two years ago still has to load cleanly.
local function migrate(data)
	data.version = data.version or 0
	if data.version < 1 then
		local base = template()
		for k, v in pairs(base) do
			if data[k] == nil then data[k] = v end
		end
		data.version = 1
	end
	-- Defensive top-up for any field added without a version bump.
	local base = template()
	for k, v in pairs(base) do
		if data[k] == nil then
			data[k] = if type(v) == "table" then table.clone(v) else v
		end
	end
	return data
end

local function key(player: Player): string
	return "u_" .. tostring(player.UserId)
end

-- ------------------------------------------------------------------- load
function DataService.load(player: Player): any?
	local acquired
	local ok = retry(function()
		return store:UpdateAsync(key(player), function(old)
			local data = old or template()
			local now = os.time()

			-- Session lock: refuse the load if another live server holds it and
			-- the heartbeat is fresh. Stale locks (crashed servers) are stolen
			-- after SESSION_LOCK_TTL.
			if data._lock and data._lock ~= JOB_ID and (now - (data._lockTime or 0)) < Config.SESSION_LOCK_TTL then
				acquired = false
				return nil   -- abort the write, leave the lock alone
			end

			data = migrate(data)
			data._lock = JOB_ID
			data._lockTime = now
			data.stats.joins = (data.stats.joins or 0) + 1
			acquired = true
			return data
		end)
	end, "load " .. player.Name)

	if not ok or acquired == false then
		return nil
	end

	local _, fetched = retry(function() return store:GetAsync(key(player)) end, "verify " .. player.Name)
	return migrate(fetched or template())
end

-- ------------------------------------------------------------------- save
function DataService.save(player: Player, releaseLock: boolean?): boolean
	local profile = DataService.profiles[player]
	if not profile then return false end
	local data = profile.data

	local ok = retry(function()
		return store:UpdateAsync(key(player), function(old)
			-- If another server stole the lock while we were live, do NOT write
			-- -- our copy is the stale one now.
			if old and old._lock and old._lock ~= JOB_ID then
				warn("[DataService] lock lost for " .. player.Name .. ", discarding write")
				return nil
			end
			local out = table.clone(data)
			out._lock     = if releaseLock then nil else JOB_ID
			out._lockTime = os.time()
			out.lastLeave = os.time()
			return out
		end)
	end, "save " .. player.Name)

	return ok
end

-- --------------------------------------------------------------- lifecycle
function DataService.get(player: Player)
	local p = DataService.profiles[player]
	return p and p.data or nil
end

function DataService.onJoin(player: Player, onLoaded: (any) -> ())
	local data = DataService.load(player)

	if not data then
		player:Kick("Your save is still active on another server. Please rejoin in a minute.\n(This protects your progress from being overwritten.)")
		return
	end
	if not player.Parent then return end  -- left during the yield

	DataService.profiles[player] = {
		data = data,
		joinedAt = os.clock(),
		runtime = {},          -- never saved: carried bits, cooldowns, etc.
	}
	onLoaded(data)
end

function DataService.onLeave(player: Player)
	local profile = DataService.profiles[player]
	if not profile then return end
	profile.data.stats.playtime += math.floor(os.clock() - profile.joinedAt)
	DataService.save(player, true)
	DataService.profiles[player] = nil
end

function DataService.start()
	-- Autosave loop, staggered so 40 players don't all write on the same tick.
	task.spawn(function()
		while true do
			task.wait(Config.AUTOSAVE_INTERVAL)
			for player in pairs(DataService.profiles) do
				task.spawn(function()
					DataService.save(player, false)
				end)
				task.wait(0.3)
			end
		end
	end)

	-- Lock heartbeat: refresh _lockTime more often than the TTL so a live
	-- server never has its lock stolen.
	task.spawn(function()
		while true do
			task.wait(Config.SESSION_LOCK_TTL / 3)
			for player in pairs(DataService.profiles) do
				task.spawn(function()
					pcall(function()
						store:UpdateAsync(key(player), function(old)
							if not old then return nil end
							if old._lock ~= JOB_ID then return nil end
							old._lockTime = os.time()
							return old
						end)
					end)
				end)
				task.wait(0.2)
			end
		end
	end)

	game:BindToClose(function()
		if RunService:IsStudio() then return end
		local pending = 0
		for player in pairs(DataService.profiles) do
			pending += 1
			task.spawn(function()
				DataService.onLeave(player)
				pending -= 1
			end)
		end
		local deadline = os.clock() + 25
		while pending > 0 and os.clock() < deadline do
			task.wait(0.1)
		end
	end)
end

return DataService
