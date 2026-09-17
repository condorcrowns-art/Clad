--!strict
-- THE ASSET SWAP LAYER
--
-- This is the one file you edit to replace every procedural model in the game
-- with a real one from the Creator Store (create.roblox.com/store/models) or
-- your own build. Nothing else in the codebase needs to change.
--
-- HOW TO USE:
--   1. Find a free model in the Creator Store / Toolbox.
--   2. Insert it in Studio, or copy its asset id from the URL
--      (create.roblox.com/store/asset/1234567890/Name -> 1234567890).
--   3. Put the id in the right slot below.
--
-- Any slot left at 0 or "" falls back to the procedural model in
-- ModelFactory, so a half-filled table is completely fine -- fill in the pets
-- you care about first and the rest keep working.
--
-- TWO KINDS OF SLOT:
--   `mesh`  -- a MeshPart mesh id. Cheapest to use, works everywhere.
--   `model` -- the NAME of a Model you placed under
--              ReplicatedStorage/GameAssets/<folder>/. Use this for anything
--              multi-part (a full pet with wings, an egg on a pedestal).
--              Placing the model in the tree beats InsertService at runtime:
--              it loads instantly and it can't fail mid-session.
--
-- WHAT TO SEARCH FOR (all free on the Creator Store):
--   nodes  -> "crystal", "ore", "gem cluster", "low poly rock"
--   pets   -> "low poly animal", "chibi creature", "pet model"
--   eggs   -> "egg", "dragon egg", "egg pedestal"
--   VFX    -> "particle pack", "magic aura", "sparkle"
--   audio  -> "mining hit", "coin pickup", "level up", "ui click"
--
-- SAFETY: meshes, images, sounds and particles are safe to drop in. A free
-- model containing a Script is not -- read it or delete the script first.
-- This project needs zero free code.

local Assets = {}

-- ------------------------------------------------------------------- NODES
-- Keyed by zone id. `mesh` is a MeshPart mesh id; `model` is a Model name
-- under ReplicatedStorage/GameAssets/Nodes/.
Assets.NODES = {
	boot     = { mesh = 0, model = "" },
	cache    = { mesh = 0, model = "" },
	registry = { mesh = 0, model = "" },
	heap     = { mesh = 0, model = "" },
	kernel   = { mesh = 0, model = "" },
	void     = { mesh = 0, model = "" },
	solar    = { mesh = 0, model = "" },
	quantum  = { mesh = 0, model = "" },
	singular = { mesh = 0, model = "" },
}

-- -------------------------------------------------------------------- PETS
-- Keyed by pet id (see Pets.lua). A model here is used in the world, in the
-- hatch reveal, and in the familiar list, so one id upgrades all three.
Assets.PETS = {} :: { [string]: { mesh: number, model: string } }

-- -------------------------------------------------------------------- EGGS
-- Keyed by egg id. The pedestal is separate so you can reuse one pedestal
-- model across every egg.
Assets.EGGS = {} :: { [string]: { mesh: number, model: string } }
Assets.EGG_PEDESTAL = { mesh = 0, model = "" }

-- ------------------------------------------------------------------- AUDIO
-- Sound asset ids. 0 = silent (no error, just no sound).
Assets.SOUNDS = {
	mine      = 0,   -- every swing
	nodeBreak = 0,   -- node destroyed
	sell      = 0,   -- Uplink sale
	hatch     = 0,   -- egg cracking
	reveal    = 0,   -- the reveal moment
	rare      = 0,   -- legendary/mythic pull
	levelUp   = 0,   -- familiar level
	evolve    = 0,   -- familiar evolution
	purchase  = 0,   -- shop buy
	click     = 0,   -- UI click
	rebirth   = 0,   -- overclock
	music     = 0,   -- looping background track
}

Assets.MUSIC_VOLUME = 0.25
Assets.SFX_VOLUME   = 0.5

-- --------------------------------------------------------------------- VFX
-- ParticleEmitter texture ids. 0 falls back to a plain sparkle.
Assets.PARTICLES = {
	nodeBreak = 0,
	hatch     = 0,
	rare      = 0,
	sell      = 0,
}

-- ------------------------------------------------------------------ LOOKUP
local GameAssets: Folder? = nil

local function assetFolder(): Folder?
	if GameAssets and GameAssets.Parent then return GameAssets end
	GameAssets = game:GetService("ReplicatedStorage"):FindFirstChild("GameAssets") :: Folder?
	return GameAssets
end

-- Returns a fresh clone of the configured model, or nil to use the fallback.
function Assets.findModel(category: string, name: string): Model?
	if name == "" then return nil end
	local root = assetFolder()
	if not root then return nil end
	local folder = root:FindFirstChild(category)
	if not folder then return nil end
	local model = folder:FindFirstChild(name)
	if model and model:IsA("Model") then
		return model:Clone()
	end
	return nil
end

function Assets.meshId(id: number): string?
	if not id or id <= 0 then return nil end
	return "rbxassetid://" .. tostring(id)
end

function Assets.soundId(key: string): string?
	local id = Assets.SOUNDS[key]
	if not id or id <= 0 then return nil end
	return "rbxassetid://" .. tostring(id)
end

function Assets.particleId(key: string): string?
	local id = Assets.PARTICLES[key]
	if not id or id <= 0 then return nil end
	return "rbxassetid://" .. tostring(id)
end

return Assets
