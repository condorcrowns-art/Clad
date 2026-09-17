--!strict
-- MONETISATION LADDER -- simulator-native only.
--
-- Every item here is something a simulator player already wants: more
-- familiars, better familiars, faster familiars, more Bits, more storage.
-- No generic toys, no destruction gimmicks -- those belong to a different
-- genre and they teach players that this shop sells novelty instead of
-- progression.
--
-- The ladder is still deliberately bottom-heavy. Most players have 5-40
-- leftover Robux and nothing in a typical sim is priced for them, so they
-- spend nothing. Price the entry rung at 15-49 and a real slice converts --
-- and a converted player buys again.
--
-- Every id below is a placeholder. Create the passes/products in the Creator
-- Dashboard and paste the real ids in; nothing else needs to change.

export type Pass = {
	key: string, id: number, name: string, price: number,
	desc: string, icon: string, tier: string,
	grantsPet: string?,   -- petId granted once on purchase
	grantsEgg: string?,   -- eggId permanently unlocked
}

local Passes: { Pass } = {
	-- ----------------------------------------------------- ENTRY: FAMILIARS
	-- A pass that hands over an actual familiar is the best cheap purchase in
	-- a pet sim: the player gets a permanent, visible, equipped thing rather
	-- than an abstract stat.
	{ key="StarterPet", id=0, price=25, name="STARTER FAMILIAR",
	  desc="Instantly receive Cursor Wisp, a familiar you'd otherwise have to get lucky to hatch. Yours permanently.",
	  icon="\u{1F43E}", tier="pet", grantsPet="cursor" },

	{ key="ChromePet", id=0, price=79, name="CHROME COMPANION",
	  desc="Receive a guaranteed Chrome Kernel Cat (x3 variant). A pull most players never see.",
	  icon="\u{2728}", tier="pet", grantsPet="kernel_cat" },

	-- ------------------------------------------------------- ENTRY: STORAGE
	{ key="PetStorage", id=0, price=35, name="+150 FAMILIAR STORAGE",
	  desc="Store 400 familiars instead of 250. Room to hoard duplicates for fusion.",
	  icon="\u{1F4E6}", tier="power" },

	-- ------------------------------------------------------ CORE: MULTIPLIER
	{ key="Double", id=0, price=99, name="2x BITS",
	  desc="Permanently double all Bits earned. Stacks with everything.",
	  icon="\u{1F4A0}", tier="power" },

	{ key="PetSlots", id=0, price=129, name="+3 FAMILIAR SLOTS",
	  desc="Equip 6 familiars instead of 3. The single biggest multiplier jump in the game.",
	  icon="\u{1F43E}", tier="power" },

	{ key="Lucky", id=0, price=149, name="LUCKY HATCH",
	  desc="+100% luck on every hatch. Rare familiars and rare variants, far more often.",
	  icon="\u{1F340}", tier="power" },

	-- ---------------------------------------------------- CORE: CONVENIENCE
	{ key="AutoSell", id=0, price=79, name="AUTO-SELL",
	  desc="Bits sell themselves the moment your buffer fills. Never walk back to the Uplink again.",
	  icon="\u{1F501}", tier="power" },

	{ key="AutoSwing", id=0, price=69, name="AUTO-MINE",
	  desc="Your chip mines on its own while you're near a node.",
	  icon="\u{1F916}", tier="power" },

	{ key="FastHatch", id=0, price=49, name="TRIPLE HATCH",
	  desc="Open 3 eggs at a time instead of 1.",
	  icon="\u{1F95A}", tier="power" },

	{ key="AutoHatch", id=0, price=169, name="AUTO-HATCH",
	  desc="Stand at an egg and it hatches continuously while you can afford it. Hands-free familiar farming.",
	  icon="\u{267B}", tier="power" },

	{ key="FastTrain", id=0, price=89, name="2x TRAINING",
	  desc="Equipped familiars earn double XP, so they evolve to Awakened and Ascended in half the time.",
	  icon="\u{1F31F}", tier="power" },

	-- ------------------------------------------------------ EXCLUSIVE EGGS
	{ key="VoidEgg", id=0, price=199, name="VOID EGG ACCESS",
	  desc="Permanently unlock the Void Egg without reaching Null Void. Hatch it with Bits from day one.",
	  icon="\u{1F95A}", tier="egg", grantsEgg="egg_void" },

	-- -------------------------------------------------------------- IDENTITY
	{ key="VIP", id=0, price=399, name="VIP ACCESS",
	  desc="1.5x Bits, 1.5x Luck, +25% buffer, 2x familiar training, offline earnings, faster walk, gold nametag.",
	  icon="\u{1F451}", tier="vip" },
}

-- Repeatable purchases. This is where the top of the spend curve actually
-- lands: a whale buys VIP once and PRIME eggs twenty times.
export type Product = {
	key: string, id: number, name: string, price: number,
	kind: string, amount: number, desc: string, icon: string,
	eggId: string?,
}

local Products: { Product } = {
	-- Bulk hatch packs are the highest-revenue item in every pet sim that
	-- ships them, because the chase is per-hatch, not per-purchase.
	{ key="Egg_Prime_1",  id=0, price=49,  name="PRIME Egg x1",  kind="egg", amount=1,  eggId="egg_prime", icon="\u{1F95A}",
	  desc="One PRIME Egg. Six exclusive familiars you cannot get any other way." },
	{ key="Egg_Prime_5",  id=0, price=199, name="PRIME Egg x5",  kind="egg", amount=5,  eggId="egg_prime", icon="\u{1F95A}",
	  desc="Five PRIME Eggs (save 20%)." },
	{ key="Egg_Prime_20", id=0, price=699, name="PRIME Egg x20", kind="egg", amount=20, eggId="egg_prime", icon="\u{1F95A}",
	  desc="Twenty PRIME Eggs (save 30%) \u{2014} best value, and 20 rolls at THE PRIME." },
	{ key="Egg_Omega_R",  id=0, price=99,  name="OMEGA Egg x3",  kind="egg", amount=3,  eggId="egg_omega", icon="\u{1F48E}",
	  desc="Three OMEGA Eggs without spending Shards." },

	{ key="Bits_S",   id=0, price=25,  name="Small Bit Pack",  kind="bits_pct",  amount=0.50, icon="\u{1F4A0}",
	  desc="Instantly gain Bits equal to 50% of your best-ever balance." },
	{ key="Bits_M",   id=0, price=99,  name="Large Bit Pack",  kind="bits_pct",  amount=3.00, icon="\u{1F4A0}",
	  desc="Instantly gain Bits equal to 3x your best-ever balance." },

	{ key="Shards_S", id=0, price=99,  name="25 Shards",  kind="shards", amount=25,  icon="\u{1F48E}", desc="25 Shards." },
	{ key="Shards_M", id=0, price=399, name="120 Shards", kind="shards", amount=120, icon="\u{1F48E}", desc="120 Shards (+20% bonus)." },
	{ key="Shards_L", id=0, price=999, name="350 Shards", kind="shards", amount=350, icon="\u{1F48E}", desc="350 Shards (+40% bonus)." },

	{ key="Boost2x",   id=0, price=35, name="2x Bits (15 min)",  kind="boost",      amount=900, icon="\u{26A1}",  desc="Double your Bits for 15 minutes." },
	{ key="LuckBoost", id=0, price=45, name="3x Luck (10 min)",  kind="luck_boost", amount=600, icon="\u{1F340}", desc="Triple hatch luck for 10 minutes." },

	-- A status purchase and a gift at once: other players thank the buyer in
	-- chat, which converts THEM. Highest-converting product type in the genre.
	{ key="ServerBoost", id=0, price=149, name="SERVER 2x BITS", kind="server_boost", amount=600, icon="\u{1F310}",
	  desc="Give EVERYONE in the server 2x Bits for 10 minutes. Your name is announced to all." },
}

local passByKey, productByKey, productById = {}, {}, {}
for _, p in ipairs(Passes)   do passByKey[p.key] = p end
for _, p in ipairs(Products) do productByKey[p.key] = p; productById[p.id] = p end

return {
	passes = Passes, passByKey = passByKey,
	products = Products, productByKey = productByKey, productById = productById,
	STORAGE_BONUS = 150,
}
