--!strict
-- MONETISATION LADDER
--
-- Every id below is a placeholder -- create the passes/products in the Roblox
-- creator dashboard and paste the real ids in. Nothing else needs to change.
--
-- The ladder is deliberately bottom-heavy. The single biggest revenue mistake
-- small sims make is having nothing under 50 Robux: most players have 5-40 R$
-- of leftover balance and will spend it impulsively on a *toy*, not on a stat.
-- So the entry tier is toys (Nuke, Rainbow Trail, Big Head), the middle tier is
-- convenience (2x Bits, Auto-Sell, +3 Pets), and the top tier is identity
-- (VIP). Expected split at scale is roughly 55% of PURCHASES from the <25 R$
-- tier and 60% of REVENUE from the 199-799 R$ tier.

export type Pass = {
	key: string, id: number, name: string, price: number,
	desc: string, icon: string, tier: string,
}

local Passes: { Pass } = {
	-- ------------------------------------------------------------------ TOYS
	{ key="Nuke", id=0, price=9, name="DATA NUKE",
	  desc="Press [N] to detonate every node in your sector at once. 45s cooldown.",
	  icon="\u{2622}", tier="toy" },

	{ key="ShatterAll", id=0, price=19, name="SHATTER ALL",
	  desc="Press [K] to instantly break every node within 120 studs. 25s cooldown.",
	  icon="\u{1F4A5}", tier="toy" },

	{ key="Trail", id=0, price=15, name="OVERCLOCK TRAIL",
	  desc="A glowing data trail follows you everywhere. Pure drip.",
	  icon="\u{2728}", tier="toy" },

	{ key="BigHead", id=0, price=12, name="BIG HEAD",
	  desc="Comically oversized head. No stats. Worth it.",
	  icon="\u{1F464}", tier="toy" },

	-- ----------------------------------------------------------- CONVENIENCE
	{ key="Double", id=0, price=99, name="2x BITS",
	  desc="Permanently double all Bits earned. Stacks with everything.",
	  icon="\u{1F4A0}", tier="power" },

	{ key="AutoSell", id=0, price=79, name="AUTO-SELL",
	  desc="Bits sell themselves the moment your buffer fills. Never walk back again.",
	  icon="\u{1F501}", tier="power" },

	{ key="AutoSwing", id=0, price=69, name="AUTO-SWING",
	  desc="Your chip swings on its own while you're near a node.",
	  icon="\u{1F916}", tier="power" },

	{ key="PetSlots", id=0, price=129, name="+3 PET SLOTS",
	  desc="Equip 6 familiars instead of 3. The biggest single multiplier jump.",
	  icon="\u{1F43E}", tier="power" },

	{ key="Lucky", id=0, price=149, name="LUCKY HATCH",
	  desc="+100% luck on every hatch. Rare familiars, far more often.",
	  icon="\u{1F340}", tier="power" },

	{ key="FastHatch", id=0, price=49, name="TRIPLE HATCH",
	  desc="Open 3 eggs at a time instead of 1.",
	  icon="\u{1F95A}", tier="power" },

	-- -------------------------------------------------------------- IDENTITY
	{ key="VIP", id=0, price=399, name="VIP ACCESS",
	  desc="1.5x Bits, 1.5x Luck, VIP-only sector, gold nametag, +8h offline earnings, exclusive chat tag.",
	  icon="\u{1F451}", tier="vip" },
}

-- Repeatable purchases. These are where the top 1% of spend actually lands --
-- a whale will buy the Shard bundle twenty times but the VIP pass once.
export type Product = {
	key: string, id: number, name: string, price: number,
	kind: string, amount: number, desc: string, icon: string,
}

local Products: { Product } = {
	{ key="Bits_S",   id=0, price=25,  name="Small Bit Pack",  kind="bits_pct",  amount=0.50, icon="\u{1F4A0}",
	  desc="Instantly gain Bits equal to 50% of your best-ever balance." },
	{ key="Bits_M",   id=0, price=99,  name="Large Bit Pack",  kind="bits_pct",  amount=3.00, icon="\u{1F4A0}",
	  desc="Instantly gain Bits equal to 3x your best-ever balance." },
	{ key="Shards_S", id=0, price=99,  name="25 Shards",       kind="shards",    amount=25,   icon="\u{1F48E}", desc="25 Shards." },
	{ key="Shards_M", id=0, price=399, name="120 Shards",      kind="shards",    amount=120,  icon="\u{1F48E}", desc="120 Shards (+20% bonus)." },
	{ key="Shards_L", id=0, price=999, name="350 Shards",      kind="shards",    amount=350,  icon="\u{1F48E}", desc="350 Shards (+40% bonus)." },
	{ key="Boost2x",  id=0, price=35,  name="2x Bits (15 min)",kind="boost",     amount=900,  icon="\u{26A1}",  desc="Server-wide is off -- this one is yours: 2x Bits for 15 minutes." },
	{ key="ServerBoost", id=0, price=149, name="SERVER 2x BITS", kind="server_boost", amount=600, icon="\u{1F310}",
	  desc="Give EVERYONE in the server 2x Bits for 10 minutes. Your name is announced." },
	{ key="LuckBoost", id=0, price=45, name="3x Luck (10 min)", kind="luck_boost", amount=600, icon="\u{1F340}", desc="Triple hatch luck for 10 minutes." },
}

local passByKey, productByKey, productById = {}, {}, {}
for _, p in ipairs(Passes)   do passByKey[p.key] = p end
for _, p in ipairs(Products) do productByKey[p.key] = p; productById[p.id] = p end

return {
	passes = Passes, passByKey = passByKey,
	products = Products, productByKey = productByKey, productById = productById,
	-- Cooldowns for the toy passes (seconds).
	NUKE_COOLDOWN = 45,
	SHATTER_COOLDOWN = 25,
	SHATTER_RADIUS = 120,
}
