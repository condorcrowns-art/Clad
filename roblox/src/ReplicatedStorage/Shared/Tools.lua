--!strict
-- "Chips" -- the pickaxe equivalent. `power` is how many Bits a single swing
-- knocks off a node. Each tier is ~2.2x the previous for ~7x the price, which
-- keeps the next chip about 3 sell-trips away at all times.

export type Tool = {
	id: string, name: string, order: number,
	cost: number, power: number, currency: string,
	speed: number,       -- swing cooldown multiplier (<1 = faster)
	rarityColor: Color3,
}

local Tools: { Tool } = {
	{ id="starter",  name="Stock Chip",      order=1,  cost=0,        power=1,        speed=1.00, currency="Bits",   rarityColor=Color3.fromRGB(180,180,180) },
	{ id="copper",   name="Copper Trace",    order=2,  cost=400,      power=3,        speed=0.98, currency="Bits",   rarityColor=Color3.fromRGB(205,127,50)  },
	{ id="silicon",  name="Silicon Edge",    order=3,  cost=3_200,    power=8,        speed=0.95, currency="Bits",   rarityColor=Color3.fromRGB(190,200,210) },
	{ id="graphene", name="Graphene Bit",    order=4,  cost=22_000,   power=22,       speed=0.92, currency="Bits",   rarityColor=Color3.fromRGB(90,90,110)   },
	{ id="plasma",   name="Plasma Cutter",   order=5,  cost=160_000,  power=60,       speed=0.88, currency="Bits",   rarityColor=Color3.fromRGB(255,120,60)  },
	{ id="fusion",   name="Fusion Driver",   order=6,  cost=1_300_000,power=175,      speed=0.84, currency="Bits",   rarityColor=Color3.fromRGB(255,215,90)  },
	{ id="antimat",  name="Antimatter Pick", order=7,  cost=11_000_000,power=520,     speed=0.80, currency="Bits",   rarityColor=Color3.fromRGB(180,120,255) },
	{ id="tachyon",  name="Tachyon Lance",   order=8,  cost=95_000_000,power=1_600,   speed=0.74, currency="Bits",   rarityColor=Color3.fromRGB(120,255,255) },
	{ id="collapse", name="Collapse Core",   order=9,  cost=900_000_000,power=5_200,  speed=0.68, currency="Bits",   rarityColor=Color3.fromRGB(255,60,140)  },
	-- Shard chips: the rebirth-currency lane. Huge jump, gates the late game.
	{ id="prism",    name="Prism Reactor",   order=10, cost=250,      power=18_000,   speed=0.62, currency="Shards", rarityColor=Color3.fromRGB(150,255,200) },
	{ id="omega",    name="OMEGA Overclock", order=11, cost=2_000,    power=90_000,   speed=0.55, currency="Shards", rarityColor=Color3.fromRGB(255,255,255) },
}

local byId: { [string]: Tool } = {}
for _, t in ipairs(Tools) do byId[t.id] = t end

return { list = Tools, byId = byId, starter = "starter" }
