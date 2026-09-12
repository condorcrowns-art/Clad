--!strict
-- Trinkets.luau — three slots, small numbers, real choices.
--
-- The design rule, and the reason this file has a test that enforces it:
-- a fully-kitted player must be roughly 20% better than a bare one, never
-- 200%. Trinkets are meant to say something about HOW you play, not to
-- decide WHETHER you can play.
--
-- They also pull against each other. Wax Coat wants a long greedy run;
-- Featherweight only works while you are small and therefore wants short
-- aggressive ones. You cannot build for both, so a loadout is a statement.
--
-- Earned only. Deep Crates cost earned Glob, season tiers cost play. There is
-- no Robux path to any number in this file, and Monetisation.violations()
-- fails the build if one appears.

local Trinkets = {}

export type Effect =
    "leakMult"        -- multiplies leak per second
    | "bankHaste"     -- fraction faster to bank
    | "pelletMult"    -- multiplies pellet value
    | "knockbackMult" -- multiplies knockback taken
    | "powerHaste"    -- fraction off power cooldowns
    | "crumbChance"   -- chance a pellet becomes a Golden Crumb
    | "smallSpeed"    -- top speed bonus while under SMALL_THRESHOLD
    | "popKeep"       -- fraction of mass kept through a pop

export type Trinket = {
    id: string,
    name: string,
    blurb: string,
    effect: Effect,
    value: number,
    rarity: string,
}

Trinkets.SLOTS = 3
Trinkets.SMALL_THRESHOLD = 500

Trinkets.LIST = {
    { id = "waxcoat",   name = "Wax Coat",      blurb = "You melt 12% slower.",
      effect = "leakMult",      value = 0.88, rarity = "Common" },
    { id = "snorkel",   name = "Snorkel",       blurb = "Bank 30% faster.",
      effect = "bankHaste",     value = 0.30, rarity = "Common" },
    { id = "tongue",    name = "Greedy Tongue", blurb = "Pellets are worth 10% more.",
      effect = "pelletMult",    value = 1.10, rarity = "Common" },
    { id = "ballast",   name = "Ballast",       blurb = "Take 15% less knockback.",
      effect = "knockbackMult", value = 0.85, rarity = "Uncommon" },
    { id = "trigger",   name = "Hair Trigger",  blurb = "Powers recharge 18% sooner.",
      effect = "powerHaste",    value = 0.18, rarity = "Uncommon" },
    { id = "crumb",     name = "Lucky Crumb",   blurb = "1 pellet in 20 is golden.",
      effect = "crumbChance",   value = 0.05, rarity = "Rare" },
    { id = "feather",   name = "Featherweight", blurb = "+10% speed while you're small.",
      effect = "smallSpeed",    value = 0.10, rarity = "Rare" },
    { id = "secondskin",name = "Second Skin",   blurb = "Keep 15% of yourself when you pop.",
      effect = "popKeep",       value = 0.15, rarity = "Epic" },
} :: { Trinket }

local byId: { [string]: Trinket } = {}
for _, t in ipairs(Trinkets.LIST) do
    byId[t.id] = t
end

function Trinkets.get(id: string): Trinket?
    return byId[id]
end

-- Resolve an equipped loadout into a flat table of effects.
--
-- Multiplicative effects (leak, pellets, knockback) start at 1 and multiply;
-- additive ones (haste, chance, keep) start at 0 and add.
--
-- DUPLICATES DO NOT STACK, and this is load-bearing rather than tidy. When
-- they did, the strongest loadout in the game was three Wax Coats — a 47%
-- edge, and no decision at all, because the answer was always "three of
-- whichever is best". Requiring three DIFFERENT trinkets is what turns the
-- slots into a build. It also caps the damage any one trinket can do to the
-- balance at exactly its own number.
export type Resolved = {
    leakMult: number, bankHaste: number, pelletMult: number,
    knockbackMult: number, powerHaste: number, crumbChance: number,
    smallSpeed: number, popKeep: number,
}

function Trinkets.resolve(equipped: { string }): Resolved
    local r: Resolved = {
        leakMult = 1, bankHaste = 0, pelletMult = 1, knockbackMult = 1,
        powerHaste = 0, crumbChance = 0, smallSpeed = 0, popKeep = 0,
    }
    local used = 0
    local already: { [string]: boolean } = {}
    for _, id in ipairs(equipped) do
        if used >= Trinkets.SLOTS then
            break
        end
        local t = byId[id]
        if t and not already[id] then
            already[id] = true
            used += 1
            if t.effect == "leakMult" then r.leakMult *= t.value
            elseif t.effect == "pelletMult" then r.pelletMult *= t.value
            elseif t.effect == "knockbackMult" then r.knockbackMult *= t.value
            elseif t.effect == "bankHaste" then r.bankHaste += t.value
            elseif t.effect == "powerHaste" then r.powerHaste += t.value
            elseif t.effect == "crumbChance" then r.crumbChance += t.value
            elseif t.effect == "smallSpeed" then r.smallSpeed += t.value
            elseif t.effect == "popKeep" then r.popKeep += t.value
            end
        end
    end
    -- Hard clamps. These are not expected to bind with three slots; they are
    -- here so that a future trinket, or a future slot, cannot quietly turn
    -- this file into a pay-to-win surface by arithmetic.
    r.leakMult = math.max(0.6, r.leakMult)
    r.pelletMult = math.min(1.5, r.pelletMult)
    r.knockbackMult = math.max(0.5, r.knockbackMult)
    r.bankHaste = math.min(0.75, r.bankHaste)
    r.powerHaste = math.min(0.35, r.powerHaste)
    r.crumbChance = math.min(0.25, r.crumbChance)
    r.smallSpeed = math.min(0.20, r.smallSpeed)
    r.popKeep = math.min(0.25, r.popKeep)
    return r
end

-- A rough relative-power index, used by the balance test to prove no trinket
-- is dead weight and no loadout runs away from the field.
--
-- READ THIS BEFORE TRUSTING THE NUMBER. The absolute value it returns means
-- nothing — the weights below are judgement calls, not measurements, and the
-- first version of this function happily reported that the strongest build in
-- the game was "three Wax Coats" because duplicates stacked. Only the SPREAD
-- between loadouts is meaningful, which is why the test asserts on ratios and
-- never on a magnitude.
--
-- The weights say what each axis is worth in a fight:
--   bankHaste  0.40  the bank window is where runs actually die
--   powerHaste 0.45  the power is the skill layer; more presses is more skill
--   crumbChance 2.0  a Golden Crumb is 5x, so a 5% chance is a 20% food swing
--   popKeep    0.80  surviving a pop with a quarter of yourself is most of a
--                    free restart, which is worth far more than it looks
Trinkets.WEIGHTS = {
    bankHaste = 0.40, powerHaste = 0.45, crumbChance = 2.0, popKeep = 0.80,
}

function Trinkets.advantage(r: Resolved): number
    local w = Trinkets.WEIGHTS
    return (1 / r.leakMult - 1)
        + (r.pelletMult - 1)
        + (1 / r.knockbackMult - 1) * 0.5
        + r.smallSpeed
        + r.bankHaste * w.bankHaste
        + r.powerHaste * w.powerHaste
        + r.crumbChance * w.crumbChance
        + r.popKeep * w.popKeep
end

-- The ground truth the proxy above cannot give: how far any single trinket
-- moves its OWN axis, in that axis's own units. These are the numbers a
-- reviewer should argue about, and the test holds each to its own cap.
Trinkets.AXIS_CAP = {
    leakMult = 0.15, pelletMult = 0.15, knockbackMult = 0.15, smallSpeed = 0.12,
    bankHaste = 0.35, powerHaste = 0.20, crumbChance = 0.06, popKeep = 0.15,
}

function Trinkets.axisMagnitude(t: Trinket): number
    if t.effect == "leakMult" or t.effect == "knockbackMult" then
        return 1 - t.value
    elseif t.effect == "pelletMult" then
        return t.value - 1
    end
    return t.value
end

return Trinkets
