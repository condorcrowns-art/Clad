--!strict
-- Rebirth ("Overclock") is the long-tail retention system. Resetting Bits,
-- chip and buffer while KEEPING pets means the reset is a power spike, not a
-- punishment -- players come back specifically to re-run the early game fast.
--
-- Cost curve: base * growth^n. Tuned so rebirth #1 lands around hour 1-2 of
-- play and each subsequent one roughly doubles the previous wall-clock time,
-- flattening out once pet multipliers dominate.

local Rebirths = {}

Rebirths.BASE_COST   = 1_000_000
Rebirths.GROWTH      = 3.4
Rebirths.SHARD_BASE  = 3          -- Shards granted at rebirth #1
Rebirths.SHARD_GROWTH= 1.28

function Rebirths.costFor(n: number): number
	return math.floor(Rebirths.BASE_COST * (Rebirths.GROWTH ^ n))
end

function Rebirths.shardsFor(n: number): number
	return math.max(1, math.floor(Rebirths.SHARD_BASE * (Rebirths.SHARD_GROWTH ^ n)))
end

-- Multiplicative, not additive: 15% compounding keeps late rebirths meaningful.
function Rebirths.multiplierFor(n: number): number
	return 1.15 ^ n
end

-- Named tiers purely for the flex (nametag title + leaderboard colour).
Rebirths.TITLES = {
	{ at=0,   title="User",        color=Color3.fromRGB(200,200,200) },
	{ at=1,   title="Operator",    color=Color3.fromRGB(120,220,255) },
	{ at=5,   title="Sysadmin",    color=Color3.fromRGB(120,255,180) },
	{ at=10,  title="Architect",   color=Color3.fromRGB(255,220,120) },
	{ at=20,  title="Kernel Lord", color=Color3.fromRGB(255,150,120) },
	{ at=35,  title="Singularity", color=Color3.fromRGB(200,140,255) },
	{ at=60,  title="OVERCLOCKED", color=Color3.fromRGB(255,80,180)  },
}

function Rebirths.titleFor(n: number)
	local best = Rebirths.TITLES[1]
	for _, t in ipairs(Rebirths.TITLES) do
		if n >= t.at then best = t end
	end
	return best
end

return Rebirths
