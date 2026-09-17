--!strict
-- Redeemable codes. These are a retention *and* acquisition tool: every code
-- drop is a reason to post on the game's social page, and every code redeem is
-- a session. Add a new code on every update and announce it in-game.
--
-- `uses` = nil means unlimited. `expires` is a unix timestamp or nil.

export type Code = {
	code: string,
	rewards: { bits: number?, shards: number?, luck_boost: number?, bits_boost: number? },
	note: string,
	expires: number?,
}

local Codes: { Code } = {
	{ code="RELEASE",    rewards={ bits=5_000,  shards=3 },              note="Launch code" },
	{ code="OVERCLOCK",  rewards={ shards=5 },                           note="Name code" },
	{ code="1KLIKES",    rewards={ bits=25_000, shards=5 },              note="1k likes" },
	{ code="SHARDS",     rewards={ shards=10 },                          note="Socials code" },
	{ code="LUCKYDAY",   rewards={ luck_boost=600 },                     note="10 min triple luck" },
	{ code="FASTBITS",   rewards={ bits_boost=900 },                     note="15 min 2x bits" },
	{ code="SORRY4SHUTDOWN", rewards={ bits=50_000, shards=8 },          note="Shutdown apology" },
}

local byCode: { [string]: Code } = {}
for _, c in ipairs(Codes) do byCode[string.upper(c.code)] = c end

return { list = Codes, byCode = byCode }
