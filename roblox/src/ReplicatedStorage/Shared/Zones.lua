--!strict
-- Sectors the player unlocks in order. `mult` is the Bits-per-node multiplier,
-- `cost` is the Bits price to unlock. The ratio between them is deliberate:
-- each zone pays ~2.3x more but costs ~9x more, so a zone is never an instant
-- buy -- it is always "two or three more sell trips away", which is the single
-- most load-bearing retention number in the genre.

export type Zone = {
	id: string,
	name: string,
	order: number,
	cost: number,          -- Bits to unlock (0 = starter)
	mult: number,          -- Bits value multiplier for nodes here
	color: Color3,
	nodeName: string,
	requiresRebirth: number,
}

local Zones: { Zone } = {
	{ id="boot",     name="Boot Sector",      order=1,  cost=0,          mult=1,        color=Color3.fromRGB(120,200,255), nodeName="Cache Fragment",  requiresRebirth=0 },
	{ id="cache",    name="Cache Fields",     order=2,  cost=2_500,      mult=4,        color=Color3.fromRGB(120,255,180), nodeName="Warm Block",      requiresRebirth=0 },
	{ id="registry", name="The Registry",     order=3,  cost=30_000,     mult=16,       color=Color3.fromRGB(255,220,120), nodeName="Registry Key",    requiresRebirth=0 },
	{ id="heap",     name="Fractured Heap",   order=4,  cost=350_000,    mult=70,       color=Color3.fromRGB(255,150,120), nodeName="Heap Shard",      requiresRebirth=0 },
	{ id="kernel",   name="Kernel Ring",      order=5,  cost=4_000_000,  mult=320,      color=Color3.fromRGB(200,140,255), nodeName="Kernel Ingot",    requiresRebirth=1 },
	{ id="void",     name="Null Void",        order=6,  cost=45_000_000, mult=1_500,    color=Color3.fromRGB(90,90,140),   nodeName="Null Mass",       requiresRebirth=2 },
	{ id="solar",    name="Solar Bus",        order=7,  cost=500_000_000,mult=7_000,    color=Color3.fromRGB(255,190,60),  nodeName="Photon Core",     requiresRebirth=4 },
	{ id="quantum",  name="Quantum Lattice",  order=8,  cost=6e9,        mult=34_000,   color=Color3.fromRGB(120,255,255), nodeName="Qubit Cluster",   requiresRebirth=7 },
	{ id="singular", name="The Singularity",  order=9,  cost=8e10,       mult=180_000,  color=Color3.fromRGB(255,80,180),  nodeName="Event Horizon",   requiresRebirth=12 },
}

local byId: { [string]: Zone } = {}
for _, z in ipairs(Zones) do byId[z.id] = z end

return { list = Zones, byId = byId, starter = "boot" }
