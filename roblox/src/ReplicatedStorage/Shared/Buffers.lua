--!strict
-- "Buffers" -- the backpack. Capacity is the second half of the sell clock:
-- power decides how fast you fill, capacity decides how long you carry.
-- Deliberately priced just under the matching chip so players alternate
-- between the two shop tabs instead of tunnelling one.

export type Buffer = {
	id: string, name: string, order: number,
	cost: number, capacity: number, currency: string,
}

local Buffers: { Buffer } = {
	{ id="b1",  name="4KB Buffer",      order=1,  cost=0,           capacity=25,          currency="Bits"   },
	{ id="b2",  name="32KB Buffer",     order=2,  cost=250,         capacity=90,          currency="Bits"   },
	{ id="b3",  name="1MB Buffer",      order=3,  cost=2_000,       capacity=340,         currency="Bits"   },
	{ id="b4",  name="16MB Buffer",     order=4,  cost=15_000,      capacity=1_400,       currency="Bits"   },
	{ id="b5",  name="256MB Buffer",    order=5,  cost=110_000,     capacity=6_000,       currency="Bits"   },
	{ id="b6",  name="4GB Buffer",      order=6,  cost=900_000,     capacity=26_000,      currency="Bits"   },
	{ id="b7",  name="64GB Buffer",     order=7,  cost=7_500_000,   capacity=120_000,     currency="Bits"   },
	{ id="b8",  name="1TB Buffer",      order=8,  cost=65_000_000,  capacity=600_000,     currency="Bits"   },
	{ id="b9",  name="Petabyte Array",  order=9,  cost=600_000_000, capacity=3_200_000,   currency="Bits"   },
	{ id="b10", name="Exabyte Vault",   order=10, cost=180,         capacity=20_000_000,  currency="Shards" },
	{ id="b11", name="Infinite Loop",   order=11, cost=1_500,       capacity=150_000_000, currency="Shards" },
}

local byId: { [string]: Buffer } = {}
for _, b in ipairs(Buffers) do byId[b.id] = b end

return { list = Buffers, byId = byId, starter = "b1" }
