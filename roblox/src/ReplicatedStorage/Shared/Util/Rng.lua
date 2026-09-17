--!strict
-- Weighted rolling with luck. Luck biases the roll toward RARER entries by
-- shrinking the effective weight of common ones -- this is the honest version
-- of "luck" (it actually changes the distribution) rather than the fake version
-- (reroll on a bad result), which players datamine and get angry about.

local Rng = {}

local rand = Random.new(os.clock() * 1e6 % 2^31)

-- entries: array of { weight = number, ... }
-- luck: 1.0 = base. Higher luck raises the odds of low-weight entries.
function Rng.weighted(entries: { any }, luck: number): any
	luck = math.max(0.01, luck or 1)

	-- Rarity skew: an entry's effective weight is weight^(1/luck) normalised.
	-- luck = 1 -> unchanged. luck = 2 -> square-root weights, which pulls the
	-- long tail up dramatically without ever making mythic more likely than
	-- legendary (order is preserved, which matters for player trust).
	local total = 0
	local eff = table.create(#entries)
	for i, e in ipairs(entries) do
		local w = (e.weight :: number) ^ (1 / luck)
		eff[i] = w
		total += w
	end

	local roll = rand:NextNumber() * total
	local acc = 0
	for i, e in ipairs(entries) do
		acc += eff[i]
		if roll <= acc then return e end
	end
	return entries[#entries]
end

function Rng.chance(oneIn: number, luck: number): boolean
	luck = math.max(0.01, luck or 1)
	return rand:NextNumber() < (1 / oneIn) * luck
end

function Rng.range(a: number, b: number): number
	return rand:NextNumber(a, b)
end

function Rng.int(a: number, b: number): number
	return rand:NextInteger(a, b)
end

function Rng.pick<T>(t: { T }): T
	return t[rand:NextInteger(1, #t)]
end

-- Fisher-Yates
function Rng.shuffled<T>(t: { T }): { T }
	local c = table.clone(t)
	for i = #c, 2, -1 do
		local j = rand:NextInteger(1, i)
		c[i], c[j] = c[j], c[i]
	end
	return c
end

return Rng
