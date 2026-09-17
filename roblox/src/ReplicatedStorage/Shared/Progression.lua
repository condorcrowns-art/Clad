--!strict
-- FAMILIAR PROGRESSION: three separate lanes, on purpose.
--
--   SERIAL     -- global, permanent, unearned-by-grinding. Pure collector flex.
--   FUSION (*) -- spend duplicates. Rewards volume hatching.
--   EVOLUTION  -- earn XP by mining with it equipped. Rewards time invested.
--
-- Keeping them separate means three different player types each have a lane
-- that respects what they actually do: the whale hatches, the grinder plays,
-- and the collector hunts low serials. One shared "power level" would collapse
-- all three into the same boring number.

local Progression = {}

-- ----------------------------------------------------------------- FUSION
-- Feed N identical familiars (same species AND same variant) into one to raise
-- its star. Cost climbs so the last star is a genuine achievement.
Progression.FUSION = {
	{ star = 1, cost = 3,  multScale = 2.0 },
	{ star = 2, cost = 4,  multScale = 3.5 },
	{ star = 3, cost = 6,  multScale = 6.0 },
	{ star = 4, cost = 10, multScale = 11.0 },
	{ star = 5, cost = 16, multScale = 22.0 },
}
Progression.MAX_STAR = 5

function Progression.fusionRule(currentStar: number)
	return Progression.FUSION[currentStar + 1]
end

function Progression.starScale(star: number): number
	if star <= 0 then return 1 end
	local rule = Progression.FUSION[math.min(star, Progression.MAX_STAR)]
	return rule and rule.multScale or 1
end

function Progression.stars(star: number): string
	if star <= 0 then return "" end
	return string.rep("\u{2605}", star) .. " "
end

-- -------------------------------------------------------------- EVOLUTION
-- XP is granted per node mined, split across equipped familiars. Three stages:
-- base -> Awakened -> Ascended. Each stage is a flat multiplier step plus a
-- name prefix, so the change is visible in the pet list without a stat screen.
Progression.EVO_STAGES = {
	{ stage = 0, name = "",          multScale = 1.0, levelReq = 0  },
	{ stage = 1, name = "Awakened ", multScale = 2.5, levelReq = 10 },
	{ stage = 2, name = "Ascended ", multScale = 7.0, levelReq = 25 },
}
Progression.MAX_LEVEL = 40

-- XP curve: quadratic. Level 10 (first evolution) lands in the first hour of
-- real play; level 25 is a multi-session goal; 40 is for the dedicated.
function Progression.xpForLevel(level: number): number
	return math.floor(60 * (level ^ 1.85))
end

function Progression.levelFromXp(xp: number): number
	local level = 0
	while level < Progression.MAX_LEVEL and xp >= Progression.xpForLevel(level + 1) do
		level += 1
	end
	return level
end

function Progression.evoFor(level: number)
	local best = Progression.EVO_STAGES[1]
	for _, s in ipairs(Progression.EVO_STAGES) do
		if level >= s.levelReq then best = s end
	end
	return best
end

-- Level itself is a small multiplier on top of the stage, so every level-up
-- pays something rather than only the two that cross a stage boundary.
function Progression.levelScale(level: number): number
	return 1 + (level * 0.04)
end

-- XP awarded per node broken, shared across equipped familiars.
Progression.XP_PER_NODE = 3
Progression.XP_VIP_BONUS = 2      -- VIP familiars train twice as fast

-- ----------------------------------------------------------------- SERIAL
-- Every familiar minted gets a global, permanent serial for its species.
-- Low serials are the rarest thing in the game and cost nothing to produce.
Progression.SERIAL_TIERS = {
	{ max = 1,      label = "FOUNDER",  color = Color3.fromRGB(255, 255, 255) },
	{ max = 10,     label = "TOP 10",   color = Color3.fromRGB(255, 215, 0)   },
	{ max = 100,    label = "TOP 100",  color = Color3.fromRGB(200, 140, 255) },
	{ max = 1000,   label = "TOP 1K",   color = Color3.fromRGB(120, 220, 255) },
	{ max = math.huge, label = "",      color = Color3.fromRGB(150, 160, 185) },
}

function Progression.serialTier(serial: number)
	for _, t in ipairs(Progression.SERIAL_TIERS) do
		if serial <= t.max then return t end
	end
	return Progression.SERIAL_TIERS[#Progression.SERIAL_TIERS]
end

-- ------------------------------------------------------------------ TOTAL
-- One function so the UI, the server and the trade preview can never disagree
-- about what a familiar is worth.
function Progression.petPower(baseMult: number, variantScale: number, star: number, level: number): number
	local evo = Progression.evoFor(level)
	return baseMult
		* variantScale
		* Progression.starScale(star)
		* evo.multScale
		* Progression.levelScale(level)
end

function Progression.displayName(baseName: string, variantName: string, star: number, level: number): string
	local evo = Progression.evoFor(level)
	return Progression.stars(star) .. evo.name .. variantName .. baseName
end

return Progression
