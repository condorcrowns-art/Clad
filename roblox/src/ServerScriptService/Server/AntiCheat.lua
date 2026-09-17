--!strict
-- Token-bucket rate limiting per player per remote, plus a few sanity helpers.
--
-- Rule of thumb for this genre: never trust a number from the client, ever.
-- The client sends *intent* ("I swung at this node"), the server decides the
-- outcome. Everything below exists so a Synapse user can spam a remote 10k
-- times a second and gain nothing but a kick.

local Players = game:GetService("Players")
local Shared  = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config  = require(Shared.Config)

local AntiCheat = {}

local buckets: { [Player]: { [string]: { count: number, resetAt: number, strikes: number } } } = {}

Players.PlayerRemoving:Connect(function(p) buckets[p] = nil end)

function AntiCheat.allow(player: Player, action: string): boolean
	local limit = Config.RATE_LIMITS[action]
	if not limit then return true end

	local b = buckets[player]
	if not b then b = {}; buckets[player] = b end
	local entry = b[action]
	local now = os.clock()

	if not entry or now >= entry.resetAt then
		b[action] = { count = 1, resetAt = now + limit.window, strikes = entry and entry.strikes or 0 }
		return true
	end

	entry.count += 1
	if entry.count > limit.max then
		entry.strikes += 1
		-- 30 violations inside one session is not lag, it is an exploit script.
		if entry.strikes > 30 then
			warn(("[AntiCheat] %s exceeded %s limit %d times"):format(player.Name, action, entry.strikes))
			entry.strikes = 0
		end
		return false
	end
	return true
end

-- Distance check for any action that claims to touch a world object.
function AntiCheat.inReach(player: Player, position: Vector3, maxDistance: number): boolean
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then return false end
	return (root.Position - position).Magnitude <= maxDistance
end

function AntiCheat.isAlive(player: Player): boolean
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	return hum ~= nil and hum.Health > 0
end

-- Type guards for remote payloads. A malformed payload should never reach
-- game logic; it should die at the door.
function AntiCheat.str(v: any, maxLen: number?): string?
	if type(v) ~= "string" then return nil end
	if #v > (maxLen or 64) then return nil end
	return v
end

function AntiCheat.num(v: any, min: number?, max: number?): number?
	if type(v) ~= "number" or v ~= v or v == math.huge or v == -math.huge then return nil end
	if min and v < min then return nil end
	if max and v > max then return nil end
	return v
end

return AntiCheat
