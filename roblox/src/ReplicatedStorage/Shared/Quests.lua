--!strict
-- Daily quests + login streak. This is the "come back tomorrow" machine.
-- Three quests roll per day from the pool; completing all three pays a bonus.

export type Quest = {
	id: string, name: string, kind: string, target: number,
	reward: { bits: number?, shards: number? },
}

local Pool: { Quest } = {
	{ id="mine_150",   name="Break 150 nodes",        kind="mine",    target=150,  reward={ bits=12_000 } },
	{ id="mine_500",   name="Break 500 nodes",        kind="mine",    target=500,  reward={ bits=60_000, shards=1 } },
	{ id="sell_10",    name="Sell 10 times",          kind="sell",    target=10,   reward={ bits=15_000 } },
	{ id="sell_40",    name="Sell 40 times",          kind="sell",    target=40,   reward={ bits=80_000, shards=1 } },
	{ id="hatch_10",   name="Hatch 10 familiars",     kind="hatch",   target=10,   reward={ bits=25_000 } },
	{ id="hatch_35",   name="Hatch 35 familiars",     kind="hatch",   target=35,   reward={ bits=90_000, shards=2 } },
	{ id="play_15",    name="Play for 15 minutes",    kind="playtime",target=900,  reward={ bits=20_000 } },
	{ id="play_45",    name="Play for 45 minutes",    kind="playtime",target=2700, reward={ bits=75_000, shards=2 } },
	{ id="rebirth_1",  name="Overclock once",         kind="rebirth", target=1,    reward={ shards=3 } },
	{ id="zone_new",   name="Unlock a new sector",    kind="zone",    target=1,    reward={ bits=40_000 } },
}

local DAILY_COUNT = 3
local ALL_COMPLETE_BONUS = { bits = 100_000, shards = 3 }

-- Login streak: day 7 is deliberately a big spike so week-one retention has a
-- visible finish line, then it loops with a permanent +1 Shard per extra day.
local LOGIN_STREAK = {
	{ day=1, bits=5_000 },
	{ day=2, bits=12_000 },
	{ day=3, bits=25_000, shards=1 },
	{ day=4, bits=45_000 },
	{ day=5, bits=90_000, shards=2 },
	{ day=6, bits=160_000 },
	{ day=7, bits=400_000, shards=8 },
}

-- Playtime rewards within a single session -- keeps the session itself long.
local PLAYTIME = {
	{ at=300,   bits=8_000 },
	{ at=900,   bits=25_000 },
	{ at=1800,  bits=70_000,  shards=1 },
	{ at=3600,  bits=200_000, shards=2 },
	{ at=7200,  bits=600_000, shards=5 },
	{ at=14400, bits=2_000_000, shards=12 },
}

local byId: { [string]: Quest } = {}
for _, q in ipairs(Pool) do byId[q.id] = q end

return {
	pool = Pool, byId = byId,
	DAILY_COUNT = DAILY_COUNT,
	ALL_COMPLETE_BONUS = ALL_COMPLETE_BONUS,
	LOGIN_STREAK = LOGIN_STREAK,
	PLAYTIME = PLAYTIME,
}
