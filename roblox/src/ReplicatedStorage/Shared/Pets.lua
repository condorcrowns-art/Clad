--!strict
-- "Familiars" -- the multiplier lane and the single biggest retention hook in
-- the genre. Two axes of chase:
--   1. Rarity (weighted roll, luck-scaled)  -> the slot-machine dopamine
--   2. Variant (Normal / Chrome / Corrupt)  -> the "I'll hatch 500 more" hook
-- Equipped pets stack additively into one multiplier so the UI stays honest.

export type Pet = {
	id: string, name: string, egg: string,
	weight: number,        -- relative roll weight inside its egg
	mult: number,          -- Bits multiplier contribution
	luck: number,          -- added luck for future hatches
	color: Color3,
}

export type Egg = {
	id: string, name: string, order: number,
	cost: number, currency: string, zone: string,
	requiresRebirth: number,
}

-- Variants roll on top of the pet itself. Odds are intentionally brutal on the
-- top end -- a 1/2000 is what makes a player post a clip, and clips are free
-- marketing.
local Variants = {
	{ id="normal",  name="",         chance=1,     multScale=1,   color=Color3.fromRGB(255,255,255) },
	{ id="chrome",  name="Chrome ",  chance=40,    multScale=3,   color=Color3.fromRGB(220,240,255) },
	{ id="corrupt", name="Corrupt ", chance=400,   multScale=12,  color=Color3.fromRGB(255,80,80)   },
	{ id="golden",  name="Golden ",  chance=2_000, multScale=45,  color=Color3.fromRGB(255,215,0)   },
}

local Eggs: { Egg } = {
	{ id="egg_boot",    name="Boot Egg",       order=1, cost=500,        currency="Bits",   zone="boot",     requiresRebirth=0 },
	{ id="egg_cache",   name="Cache Egg",      order=2, cost=8_000,      currency="Bits",   zone="cache",    requiresRebirth=0 },
	{ id="egg_registry",name="Registry Egg",   order=3, cost=95_000,     currency="Bits",   zone="registry", requiresRebirth=0 },
	{ id="egg_heap",    name="Heap Egg",       order=4, cost=1_200_000,  currency="Bits",   zone="heap",     requiresRebirth=0 },
	{ id="egg_kernel",  name="Kernel Egg",     order=5, cost=14_000_000, currency="Bits",   zone="kernel",   requiresRebirth=1 },
	{ id="egg_void",    name="Void Egg",       order=6, cost=170_000_000,currency="Bits",   zone="void",     requiresRebirth=2 },
	{ id="egg_solar",   name="Solar Egg",      order=7, cost=2e9,        currency="Bits",   zone="solar",    requiresRebirth=4 },
	{ id="egg_omega",   name="OMEGA Egg",      order=8, cost=120,        currency="Shards", zone="quantum",  requiresRebirth=7 },
	-- Robux-only egg. No Bits price, no sector gate, no rebirth gate -- it is
	-- bought directly with a developer product. Its pool is strictly stronger
	-- than anything grindable at the same point in the game, which is what
	-- makes it worth buying, but it is NOT stronger than the late Bits eggs, so
	-- it accelerates rather than replaces the grind.
	{ id="egg_prime",   name="PRIME Egg",      order=9, cost=0,          currency="Robux",  zone="boot",     requiresRebirth=0 },
}

-- Rarity ladder per egg: ~55 / 27 / 12 / 5 / 0.9 / 0.1
local W = { common=5500, uncommon=2700, rare=1200, epic=500, legend=90, mythic=10 }

local Pets: { Pet } = {
	-- Boot Egg
	{ id="bit_mite",   name="Bit Mite",     egg="egg_boot", weight=W.common,   mult=0.10, luck=0.00, color=Color3.fromRGB(150,200,255) },
	{ id="byte_bug",   name="Byte Bug",     egg="egg_boot", weight=W.uncommon, mult=0.25, luck=0.00, color=Color3.fromRGB(140,255,180) },
	{ id="pixel_pup",  name="Pixel Pup",    egg="egg_boot", weight=W.rare,     mult=0.55, luck=0.01, color=Color3.fromRGB(255,230,140) },
	{ id="cursor",     name="Cursor Wisp",  egg="egg_boot", weight=W.epic,     mult=1.10, luck=0.02, color=Color3.fromRGB(255,160,120) },
	{ id="boot_imp",   name="Bootloader Imp",egg="egg_boot",weight=W.legend,   mult=2.60, luck=0.05, color=Color3.fromRGB(200,140,255) },
	{ id="kernel_cat", name="Kernel Cat",   egg="egg_boot", weight=W.mythic,   mult=6.00, luck=0.10, color=Color3.fromRGB(255,120,200) },

	-- Cache Egg
	{ id="cache_rat",  name="Cache Rat",    egg="egg_cache", weight=W.common,   mult=0.60, luck=0.00, color=Color3.fromRGB(170,210,255) },
	{ id="lru_owl",    name="LRU Owl",      egg="egg_cache", weight=W.uncommon, mult=1.30, luck=0.01, color=Color3.fromRGB(150,255,200) },
	{ id="hit_hound",  name="Cache Hound",  egg="egg_cache", weight=W.rare,     mult=2.90, luck=0.02, color=Color3.fromRGB(255,235,150) },
	{ id="miss_moth",  name="Miss Moth",    egg="egg_cache", weight=W.epic,     mult=6.00, luck=0.04, color=Color3.fromRGB(255,170,130) },
	{ id="prefetch",   name="Prefetch Drake",egg="egg_cache",weight=W.legend,   mult=14.0, luck=0.08, color=Color3.fromRGB(210,150,255) },
	{ id="coherence",  name="Coherence Phoenix",egg="egg_cache",weight=W.mythic,mult=32.0, luck=0.16, color=Color3.fromRGB(255,140,210) },

	-- Registry Egg
	{ id="reg_key",    name="Keyling",      egg="egg_registry", weight=W.common,   mult=3.5,  luck=0.00, color=Color3.fromRGB(180,215,255) },
	{ id="hive_wasp",  name="Hive Wasp",    egg="egg_registry", weight=W.uncommon, mult=7.5,  luck=0.01, color=Color3.fromRGB(160,255,210) },
	{ id="root_stag",  name="Root Stag",    egg="egg_registry", weight=W.rare,     mult=17.0, luck=0.03, color=Color3.fromRGB(255,240,160) },
	{ id="dword",      name="DWORD Golem",  egg="egg_registry", weight=W.epic,     mult=36.0, luck=0.05, color=Color3.fromRGB(255,180,140) },
	{ id="sys_serpent",name="SYS Serpent",  egg="egg_registry", weight=W.legend,   mult=82.0, luck=0.10, color=Color3.fromRGB(215,160,255) },
	{ id="regedit",    name="REGEDIT Wyrm", egg="egg_registry", weight=W.mythic,   mult=190,  luck=0.22, color=Color3.fromRGB(255,150,215) },

	-- Heap Egg
	{ id="frag",       name="Fragment",     egg="egg_heap", weight=W.common,   mult=20,   luck=0.00, color=Color3.fromRGB(190,220,255) },
	{ id="leak_slug",  name="Leak Slug",    egg="egg_heap", weight=W.uncommon, mult=44,   luck=0.02, color=Color3.fromRGB(170,255,215) },
	{ id="gc_reaper",  name="GC Reaper",    egg="egg_heap", weight=W.rare,     mult=100,  luck=0.04, color=Color3.fromRGB(255,245,170) },
	{ id="malloc",     name="Malloc Maw",   egg="egg_heap", weight=W.epic,     mult=215,  luck=0.07, color=Color3.fromRGB(255,190,150) },
	{ id="dangling",   name="Dangling Pointer",egg="egg_heap",weight=W.legend,  mult=500,  luck=0.14, color=Color3.fromRGB(220,170,255) },
	{ id="segfault",   name="SEGFAULT",     egg="egg_heap", weight=W.mythic,   mult=1150, luck=0.30, color=Color3.fromRGB(255,160,220) },

	-- Kernel Egg
	{ id="ring0",      name="Ring-0 Sprite",egg="egg_kernel", weight=W.common,   mult=120,   luck=0.01, color=Color3.fromRGB(200,225,255) },
	{ id="syscall",    name="Syscall Crab", egg="egg_kernel", weight=W.uncommon, mult=265,   luck=0.03, color=Color3.fromRGB(180,255,220) },
	{ id="driver",     name="Driver Drake", egg="egg_kernel", weight=W.rare,     mult=600,   luck=0.06, color=Color3.fromRGB(255,250,180) },
	{ id="panic",      name="Panic Beast",  egg="egg_kernel", weight=W.epic,     mult=1300,  luck=0.10, color=Color3.fromRGB(255,200,160) },
	{ id="bsod",       name="BSOD Titan",   egg="egg_kernel", weight=W.legend,   mult=3000,  luck=0.20, color=Color3.fromRGB(225,180,255) },
	{ id="root_kit",   name="ROOTKIT",      egg="egg_kernel", weight=W.mythic,   mult=7000,  luck=0.45, color=Color3.fromRGB(255,170,225) },

	-- Void Egg
	{ id="null_pup",   name="Null Pup",     egg="egg_void", weight=W.common,   mult=800,    luck=0.02, color=Color3.fromRGB(150,150,190) },
	{ id="void_moth",  name="Void Moth",    egg="egg_void", weight=W.uncommon, mult=1750,   luck=0.05, color=Color3.fromRGB(160,160,220) },
	{ id="entropy",    name="Entropy Elk",  egg="egg_void", weight=W.rare,     mult=4000,   luck=0.09, color=Color3.fromRGB(180,170,255) },
	{ id="abyss",      name="Abyss Walker", egg="egg_void", weight=W.epic,     mult=8600,   luck=0.15, color=Color3.fromRGB(200,160,255) },
	{ id="nil_dragon", name="NIL Dragon",   egg="egg_void", weight=W.legend,   mult=20000,  luck=0.30, color=Color3.fromRGB(225,150,255) },
	{ id="the_void",   name="THE VOID",     egg="egg_void", weight=W.mythic,   mult=46000,  luck=0.65, color=Color3.fromRGB(255,140,255) },

	-- Solar Egg
	{ id="photon",     name="Photon Finch", egg="egg_solar", weight=W.common,   mult=5200,   luck=0.03, color=Color3.fromRGB(255,230,150) },
	{ id="flare",      name="Flare Fox",    egg="egg_solar", weight=W.uncommon, mult=11500,  luck=0.07, color=Color3.fromRGB(255,210,120) },
	{ id="corona",     name="Corona Lion",  egg="egg_solar", weight=W.rare,     mult=26000,  luck=0.12, color=Color3.fromRGB(255,190,90)  },
	{ id="fusion_bird",name="Fusion Roc",   egg="egg_solar", weight=W.epic,     mult=56000,  luck=0.20, color=Color3.fromRGB(255,165,70)  },
	{ id="helios",     name="HELIOS",       egg="egg_solar", weight=W.legend,   mult=130000, luck=0.40, color=Color3.fromRGB(255,140,50)  },
	{ id="supernova",  name="SUPERNOVA",    egg="egg_solar", weight=W.mythic,   mult=300000, luck=0.85, color=Color3.fromRGB(255,255,220) },

	-- OMEGA Egg (Shards only -- the prestige flex)
	{ id="qubit",      name="Qubit Sprite", egg="egg_omega", weight=W.common,   mult=42000,   luck=0.05, color=Color3.fromRGB(150,255,255) },
	{ id="entangle",   name="Entangled Twin",egg="egg_omega",weight=W.uncommon, mult=95000,   luck=0.10, color=Color3.fromRGB(130,245,255) },
	{ id="decoher",    name="Decoherence",  egg="egg_omega", weight=W.rare,     mult=210000,  luck=0.18, color=Color3.fromRGB(120,225,255) },
	{ id="superpos",   name="Superposition",egg="egg_omega", weight=W.epic,     mult=460000,  luck=0.30, color=Color3.fromRGB(160,200,255) },
	{ id="observer",   name="THE OBSERVER", egg="egg_omega", weight=W.legend,   mult=1_050_000,luck=0.60,color=Color3.fromRGB(210,190,255) },
	{ id="overclock",  name="OVERCLOCK",    egg="egg_omega", weight=W.mythic,   mult=2_500_000,luck=1.25,color=Color3.fromRGB(255,255,255) },

	-- PRIME Egg (Robux) -- exclusive species, never obtainable any other way.
	-- Exclusivity is most of the value: a player who owns one is visibly
	-- someone who supported the game.
	{ id="prime_spark", name="Prime Spark",  egg="egg_prime", weight=W.common,   mult=900,      luck=0.04, color=Color3.fromRGB(255,240,180) },
	{ id="prime_core",  name="Prime Core",   egg="egg_prime", weight=W.uncommon, mult=2_400,    luck=0.08, color=Color3.fromRGB(255,225,150) },
	{ id="prime_wyrm",  name="Prime Wyrm",   egg="egg_prime", weight=W.rare,     mult=6_500,    luck=0.14, color=Color3.fromRGB(255,205,110) },
	{ id="prime_titan", name="Prime Titan",  egg="egg_prime", weight=W.epic,     mult=17_000,   luck=0.22, color=Color3.fromRGB(255,180,90)  },
	{ id="prime_king",  name="PRIME SOVEREIGN",egg="egg_prime",weight=W.legend,  mult=48_000,   luck=0.45, color=Color3.fromRGB(255,140,60)  },
	{ id="prime_god",   name="THE PRIME",    egg="egg_prime", weight=W.mythic,   mult=150_000,  luck=0.95, color=Color3.fromRGB(255,255,240) },
}

local byId: { [string]: Pet } = {}
local byEgg: { [string]: { Pet } } = {}
for _, p in ipairs(Pets) do
	byId[p.id] = p
	byEgg[p.egg] = byEgg[p.egg] or {}
	table.insert(byEgg[p.egg], p)
end

local eggById: { [string]: Egg } = {}
for _, e in ipairs(Eggs) do eggById[e.id] = e end

-- How many pets can be equipped at once.
local EQUIP_BASE = 3
local EQUIP_PER_REBIRTH = 0   -- rebirths do not grant slots; gamepass does
local EQUIP_GAMEPASS_BONUS = 3

local variantById = {}
for _, v in ipairs(Variants) do variantById[v.id] = v end

return {
	list = Pets, byId = byId, byEgg = byEgg,
	eggs = Eggs, eggById = eggById,
	variants = Variants, variantById = variantById,
	EQUIP_BASE = EQUIP_BASE,
	EQUIP_PER_REBIRTH = EQUIP_PER_REBIRTH,
	EQUIP_GAMEPASS_BONUS = EQUIP_GAMEPASS_BONUS,
	MAX_INVENTORY = 250,
}
