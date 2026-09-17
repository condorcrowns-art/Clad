--!strict
-- Lazy remote registry. Server creates on first access, client waits.
-- Keeping every remote name in one table means the anti-cheat rate limiter can
-- enumerate them and nobody can add an unguarded remote by accident.

local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local IS_SERVER = RunService:IsServer()

local Remotes = {}

Remotes.EVENTS = {
	"Swing",        -- client -> server: I hit a node
	"Sell",         -- client -> server: sell my buffer
	"Buy",          -- client -> server: { kind = "tool"|"buffer"|"zone", id }
	"Hatch",        -- client -> server: eggId
	"EquipPet",     -- client -> server: { uid, equip: bool }
	"DeletePet",    -- client -> server: { uid }
	"Rebirth",      -- client -> server
	"RedeemCode",   -- client -> server: string
	"ClaimQuest",   -- client -> server: questId
	"ClaimPlaytime",-- client -> server: index
	"PromptPurchase", -- client -> server: { kind = "pass"|"product", key }
	"FusePet",      -- client -> server: { uid } -- fuse duplicates into it
	"LockPet",      -- client -> server: { uid, locked }
	"TradeRequest", -- client -> server: { target = userId }
	"TradeRespond", -- client -> server: { accept = bool }
	"TradeOffer",   -- client -> server: { uid, add = bool }
	"TradeConfirm", -- client -> server: { confirmed = bool }
	"TradeCancel",  -- client -> server

	"StateUpdate",  -- server -> client: partial player state
	"Notify",       -- server -> client: { text, color, kind }
	"HatchResult",  -- server -> client: { pets = {...} }
	"Effect",       -- server -> client: { kind, ... } cosmetic only
	"Announce",     -- server -> client: server-wide banner
	"TradeUpdate",  -- server -> client: full trade window state (or nil to close)
	"TradeInvite",  -- server -> client: { from, fromName }
}

Remotes.FUNCTIONS = {
	"GetState",     -- client -> server: full state snapshot on join
}

local folder: Folder
if IS_SERVER then
	folder = ReplicatedStorage:FindFirstChild("Remotes") :: Folder
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	for _, name in ipairs(Remotes.EVENTS) do
		if not folder:FindFirstChild(name) then
			local r = Instance.new("RemoteEvent")
			r.Name = name
			r.Parent = folder
		end
	end
	for _, name in ipairs(Remotes.FUNCTIONS) do
		if not folder:FindFirstChild(name) then
			local r = Instance.new("RemoteFunction")
			r.Name = name
			r.Parent = folder
		end
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes") :: Folder
end

function Remotes.event(name: string): RemoteEvent
	return folder:WaitForChild(name) :: RemoteEvent
end

function Remotes.fn(name: string): RemoteFunction
	return folder:WaitForChild(name) :: RemoteFunction
end

return Remotes
