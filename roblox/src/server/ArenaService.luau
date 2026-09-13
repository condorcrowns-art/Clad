--!strict
-- ArenaService.luau — the island, running.
--
-- Everything the player feels happens in one fixed-step loop: eat, melt, bank,
-- pop. The curves it drives are in Blob.luau and are separately simulated; this
-- file is the part that has to be FAST, because it runs over every player and
-- every pellet several times a second on a Roblox server that is also doing
-- physics for thirty rolling balls.
--
-- THE ONE PERFORMANCE DECISION THAT MATTERS: pellets live in a spatial hash,
-- not a list. The naive version checks every player against every pellet —
-- 30 x 430 = 12,900 distance tests per tick, 190,000 a second, which is enough
-- Luau to visibly cost frames. The grid turns that into "look in the nine
-- cells around me", which is a couple of dozen tests regardless of how many
-- pellets the island is holding.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local Blob = require(Shared.Blob)
local Powers = require(Shared.Powers)
local Trinkets = require(Shared.Trinkets)
local Format = require(Shared.Format)

local RollService = require(script.Parent.RollService)
local WorldBuilder = require(script.Parent.WorldBuilder)
local BotService = require(script.Parent.BotService)
local GoopService = require(script.Parent.GoopService)

local ArenaService = {}

-- ── Tuning that belongs to the loop, not the design ────────────────────────
local TICK = 1 / 12              -- the arena's own step, independent of render
local CELL = 40                  -- stud size of one spatial-hash cell
local PICKUP_SLACK = 1.6         -- studs of forgiveness on a pellet grab
local EAT_OVERLAP = 0.55         -- how far in you must be to swallow someone
local BANK_MAX_SPEED = 14        -- you must actually stop to bank
local POP_INVULN = 2.0           -- seconds of grace after respawning
local SLAM_AIRTIME = 0.85        -- how long a SLAM hangs before it lands
local SLAM_RADIUS = 46
local SLAM_IMPULSE = 120
local HOOK_RANGE = 90
local HOOK_PULL = 96
local SPLIT_RETURN = 0.55        -- of the thrown half, how much comes back
local BLINK_DISTANCE = 74
local SIPHON_RANGE = 82
local SIPHON_FRACTION = 0.10
local BEACON_BONUS = 0.45
local DECOY_LIFETIME = 7

export type Run = {
    mass: number,
    powerId: string,
    -- ONE COOLDOWN PER SLOT, not one for the blob. The hotbar is three
    -- buttons; a shared cooldown would make pressing DASH disable SPLIT, which
    -- is not a trade anybody would choose to make and reads as a bug.
    slotReadyAt: { number },
    globlets: { any },      -- live SPLIT pieces, each tethered back to the body
    snagUntil: number,      -- slowed by somebody's tether
    powerReadyAt: number,
    powerUntil: number,
    activeEffect: string?,
    slamUntil: number,      -- airborne on a SLAM; the shockwave lands when it ends
    splitOwed: number,      -- mass thrown by SPLIT, part of which returns
    banking: number,
    leakBuffer: number,
    safeUntil: number,
    rimGrace: number,       -- seconds of rim protection left in the meter
    committed: boolean,     -- has this blob ever left the rim for the Flats
    trinkets: Trinkets.Resolved,
    bestMass: number,
    peakThisRound: number,
    lastPos: Vector3,
    startedAt: number,      -- for the run summary
    ateThisRun: number,
}

-- ── The round ──────────────────────────────────────────────────────────────
-- LOBBY -> PLAYING -> RESULTS -> LOBBY, forever. The phase is the single piece
-- of state that decides whether anything in this file is allowed to happen:
-- no eating, no pellets and no deflation outside PLAYING.
local phase = "LOBBY"
local phaseEndsAt = 0
local roundNumber = 0
local lastResults: { any } = {}

local runs: { [number]: Run } = {}
local rng = Random.new(os.clock() * 1e6 // 1)

-- `owner` and `ownerUntil` exist because of a bug that silently deleted the
-- entire game. Leaked goop was spawned inside the leaking blob's own pickup
-- radius, so a big blob vacuumed its own drips straight back up and its net
-- melt was ZERO — the ceiling vanished, AFK became viable again, and the food
-- a big player is supposed to be feeding the island never reached the floor.
-- A dropped pellet is now untouchable BY ITS DROPPER for a few seconds, and
-- lands outside their body as well. Belt and braces, because this one is not
-- allowed to come back.
-- TWO owners, not one. The second is the blob that CAUSED the drop.
--
-- Deflation scatters what it knocks off, and the whole point of that is to
-- feed whoever is standing nearby — but the blob standing nearest is always
-- the one that just landed the hit, and once bodies got physically bigger
-- (radius went from a logarithm to a cube root) its pickup reach covered the
-- entire scatter ring. The attacker vacuumed up its own deflation before
-- anybody else could move, which turns a comeback mechanic into a feeding
-- mechanic for whoever is already winning.
--
-- Same shape as the original fix for a blob eating its own drips: the food is
-- real, it is on the floor, and for a few seconds it belongs to everybody
-- except the two blobs that produced it.
type Pellet = { part: BasePart, value: number, key: string,
    owner: number?, owner2: number?, ownerUntil: number }
local pellets: { [BasePart]: Pellet } = {}
local grid: { [string]: { [BasePart]: Pellet } } = {}
local pelletCount = 0

type Lump = { part: BasePart, mass: number }
local lumps: { Lump } = {}

-- Injected by init.server so this file never reaches into the profile store.
-- It keeps the arena testable in isolation and keeps one owner for Glob.
type Deps = {
    award: (player: Player, glob: number, xp: number, reason: string) -> (),
    notify: (player: Player, text: string, kind: string?) -> (),
    effect: (player: Player, kind: string, data: any?) -> (),
    loadout: (player: Player) -> ({ string }, string),   -- trinket ids, power id
    sync: (player: Player, state: any) -> (),
    teach: (player: Player, event: string) -> (),
    -- Lifetime banked Glob, which is what decides whether the power in slot 3
    -- is actually unlocked. Read through deps rather than cached on the run:
    -- it can cross an unlock threshold mid-round, and a hotbar that only
    -- refreshed on respawn would show a power the server then refuses.
    banked: (player: Player) -> number,
    -- Powers handed over by the BETA SEASON's free track rather than earned on
    -- the banking ladder. A second way to own a power, and the only way into
    -- the two that are not on the ladder at all.
    granted: (player: Player) -> { [string]: boolean },
    powerUses: (player: Player) -> { [string]: number },
    notePowerUse: (player: Player, id: string) -> (),
    -- Everything a finished round owes the PROFILE rather than the wallet:
    -- feeding your Goob, counting rounds towards an egg. Separate from
    -- `award` because award has exactly one job — creating Glob — and this
    -- needs the finishing place, which Glob does not care about.
    roundResult: (player: Player, place: number, mass: number, payout: number) -> (),
}
local deps: Deps

-- ── Spatial hash ───────────────────────────────────────────────────────────

local function cellKey(x: number, z: number): string
    return (math.floor(x / CELL)) .. ":" .. (math.floor(z / CELL))
end

local function gridAdd(p: Pellet)
    local bucket = grid[p.key]
    if not bucket then
        bucket = {}
        grid[p.key] = bucket
    end
    bucket[p.part] = p
end

local function gridRemove(p: Pellet)
    local bucket = grid[p.key]
    if bucket then
        bucket[p.part] = nil
    end
end

-- ── Pellets ────────────────────────────────────────────────────────────────

-- Seconds a dropper cannot re-eat what it just shed.
local OWNER_LOCKOUT = 4

local function spawnPellet(at: Vector3?, value: number?, golden: boolean?,
    owner: number?, owner2: number?)
    if pelletCount >= Config.PELLET_TARGET + 260 then
        return -- the floor is already carpeted; dropping more helps nobody
    end
    local folder = WorldBuilder.arenaFolder()
    if not folder then
        return
    end
    local pos = at or WorldBuilder.randomSurfacePoint(rng)
    local biome = WorldBuilder.biomeAt(pos)
    local worth = (value or Config.PELLET_VALUE) * (biome and biome.pelletMult or 1)
    if golden then
        worth *= Config.GOLDEN_CRUMB_MULT
    end

    local part = Instance.new("Part")
    part.Name = golden and "Crumb" or "Pellet"
    part.Shape = Enum.PartType.Ball
    part.Size = Vector3.new(1, 1, 1) * (golden and 3.4 or 2.2)
    part.Anchored = true
    part.CanCollide = false
    part.CanTouch = false
    part.CanQuery = false
    part.Material = golden and Enum.Material.Foil or Enum.Material.SmoothPlastic
    part.Color = golden and Color3.fromRGB(206, 180, 118)
        or Color3.fromHSV(rng:NextNumber(0.18, 0.55), 0.34, 0.86)
    part.Position = pos + Vector3.new(0, 1.6, 0)
    part.Parent = folder

    local p: Pellet = {
        part = part,
        value = worth,
        key = cellKey(pos.X, pos.Z),
        owner = owner,
        owner2 = owner2,
        ownerUntil = (owner or owner2) and (os.clock() + OWNER_LOCKOUT) or 0,
    }
    pellets[part] = p
    gridAdd(p)
    pelletCount += 1
end

local function removePellet(p: Pellet)
    gridRemove(p)
    pellets[p.part] = nil
    pelletCount -= 1
    p.part:Destroy()
end

-- ── What the bots are allowed to ask the island ────────────────────────────
--
-- Bots do not own pellets, do not own mass, and do not get their own copy of
-- either rule. They get these two questions and nothing else, which is what
-- keeps "how does eating work" a single answer for every contender on the map.

--- Where is the nearest pellet, if any, within `radius`? Walks the same
--- spatial hash the players use rather than the whole pellet list: at 1,400
--- pellets and twelve bots re-asking every think, the naive version is 17,000
--- distance tests a second for nothing.
local function nearestPelletPos(from: Vector3, radius: number): Vector3?
    local best, bestD = nil, radius
    local span = math.max(1, math.ceil(radius / CELL))
    local cx, cz = math.floor(from.X / CELL), math.floor(from.Z / CELL)
    for gx = cx - span, cx + span do
        for gz = cz - span, cz + span do
            local bucket = grid[gx .. ":" .. gz]
            if bucket then
                for part, _ in pairs(bucket) do
                    if part.Parent then
                        local d = (part.Position - from).Magnitude
                        if d < bestD then
                            best, bestD = part.Position, d
                        end
                    end
                end
            end
        end
    end
    return best
end

--- Eat every pellet within `reach` of a point, returning the mass taken. The
--- same nine-cell sweep tickPlayer does, minus the trinkets and teaching a
--- bot has no use for.
local function harvestAt(from: Vector3, reach: number): number
    local gained = 0
    local cx, cz = math.floor(from.X / CELL), math.floor(from.Z / CELL)
    for gx = cx - 1, cx + 1 do
        for gz = cz - 1, cz + 1 do
            local bucket = grid[gx .. ":" .. gz]
            if bucket then
                for part, pellet in pairs(bucket) do
                    if part.Parent then
                        if (part.Position - from).Magnitude <= reach then
                            gained += pellet.value
                            removePellet(pellet)
                        end
                    else
                        removePellet(pellet)
                    end
                end
            end
        end
    end
    return gained
end

-- CAN THIS PLAYER BE TOUCHED BY SOMEONE ELSE'S POWER?
--
-- This existed only inside the eating check, which meant SIPHON, HOOK and SLAM
-- all reached straight into the no-PvP Shallows and into the two seconds of
-- grace a player gets after respawning. A player could be drained, yanked and
-- blasted while standing in the one place the game promises is safe — and the
-- promise is load-bearing, because the Shallows is where new players spawn and
-- where the tutorial runs.
--
-- Every power that affects another player goes through here. BUBBLE is not
-- included: it is a self-buff against being EATEN specifically, and a shield
-- that also blocked a shove would make it strictly better than everything.
local function protected(player: Player, run: Run?, now: number): boolean
    if not run then
        return true
    end
    local ball = RollService.ballFor(player)
    if not ball or not ball.Parent then
        return true
    end
    -- THE RIM IS A FIRE ESCAPE, NOT A HOUSE.
    --
    -- Standing in the Shallows used to be unconditional immunity, which is why
    -- no food could be spawned out there: a player could stand in the one
    -- place nothing could reach them, and if there had been anything to eat,
    -- standing still would have been the winning strategy.
    --
    -- Now the ground does not protect you; a METER does, and being on the rim
    -- is what spends it (tickPlayer drains it). Duck out to shake a chaser and
    -- you are fine. Try to live out there and you run dry in about twelve
    -- seconds, at which point the edge is simply the most exposed ground on the
    -- island — which is exactly what it should be, and what finally lets food
    -- grow all the way to the shoreline.
    if now < run.safeUntil then
        return true
    end
    return WorldBuilder.isSafe(ball.Position) and run.rimGrace > 0
end

-- How many times this player has used a power.
--
-- Read through deps every time rather than cached on the run. The cached copy
-- was the SAME TABLE as profile.powerUses, so incrementing it here and calling
-- notePowerUse counted every press TWICE: mastery accrued at double rate and
-- the tier-up announcement compared a number that had already moved. One
-- owner — the profile — and no alias to fall out of sync with it.
local function usesOf(player: Player, id: string): number
    return (deps.powerUses(player) or {})[id] or 0
end

-- DEFLATE A BLOB.
--
-- Takes a fraction of the TARGET'S OWN mass, which is what makes this a
-- catch-up mechanism rather than a flat nerf: the bigger somebody is, the more
-- there is to take, so the leader is always the most rewarding thing on the
-- island to hit. What comes off does not vanish — most of it lands as pellets
-- right where it happened, so deflating the leader literally feeds whoever is
-- standing nearby. That is the entire comeback loop in one function.
--
-- Returns how much was removed, so a thief (SIPHON) can keep it instead.
local function deflate(target: Player, targetRun: Run, fraction: number,
    scatterIt: boolean, byUserId: number?): number
    if fraction <= 0 then
        return 0
    end
    local before = targetRun.mass
    local taken = math.max(0, before - Config.STARTING_MASS) * fraction
    if taken <= 0 then
        return 0
    end
    targetRun.mass = math.max(Config.STARTING_MASS, before - taken)

    if scatterIt then
        local ball = RollService.ballFor(target)
        local at = ball and ball.Position or Vector3.zero
        local food = taken * Config.DEFLATE_RETURN_AS_FOOD
        local n = math.clamp(math.floor(food / Config.LEAK_PELLET_MASS), 1, 30)
        local radius = Blob.radius(before)
        for i = 1, n do
            local a = math.rad((360 / n) * i + rng:NextNumber(-12, 12))
            local d = radius * 1.6 + rng:NextNumber(3, 18)
            spawnPellet(Vector3.new(at.X + math.cos(a) * d, at.Y, at.Z + math.sin(a) * d),
                food / n, false, target.UserId, byUserId)
        end
    end

    deps.effect(target, "deflated", { amount = taken })
    return taken
end

--- The same deflation, applied to a bot.
---
--- Separate function, identical rule. A bot has no Player, no trinkets and no
--- notifications, so sharing the body of `deflate` would mean threading nil
--- through four call sites for the privilege of one shared line of arithmetic.
--- What must NOT diverge is the fraction and the fact that what comes off
--- lands as food — both come straight from Config here, same as for a player,
--- so deflating the leader feeds the island whether the leader is human or not.
local function deflateBot(bot: any, fraction: number, scatterIt: boolean,
    byUserId: number?): number
    local taken = bot.mass * math.clamp(fraction, 0, 0.9)
    if taken <= 0 then
        return 0
    end
    bot.mass = math.max(Config.STARTING_MASS, bot.mass - taken)
    if scatterIt then
        local back = taken * Config.DEFLATE_RETURN_AS_FOOD
        local drops = math.clamp(math.floor(back / Config.LEAK_PELLET_MASS), 1, 14)
        local r = Blob.radius(bot.mass)
        for i = 1, drops do
            local a = math.rad((360 / drops) * i) + rng:NextNumber(-0.3, 0.3)
            local d = r * 1.8 + rng:NextNumber(3, 14)
            spawnPellet(Vector3.new(bot.pos.X + math.cos(a) * d, 2,
                bot.pos.Z + math.sin(a) * d), back / drops, false, nil, byUserId)
        end
    end
    return taken
end

--- Is this bot currently untouchable? Same two reasons a player is: it is on
--- the rim with meter left, or it is mid-respawn.
local function botProtected(bot: any): boolean
    return bot.respawnAt ~= 0 or (WorldBuilder.isSafe(bot.pos) and bot.rimGrace > 0)
end

-- ── Decoys ─────────────────────────────────────────────────────────────────
-- A fake body at your current size, in your colour, that anyone may try to
-- eat and that gives nothing when they do. It is the only power in the game
-- that costs the VICTIM something — the seconds they spend committing to a
-- meal that was never there — which is a completely different kind of threat
-- from every other power, all of which are about speed or mass.
local function spawnDecoy(player: Player, run: Run, at: Vector3)
    local folder = WorldBuilder.arenaFolder()
    local real = RollService.ballFor(player)
    if not folder or not real then
        return
    end
    local fake = Instance.new("Part")
    fake.Name = "Decoy"
    fake.Shape = Enum.PartType.Ball
    fake.Size = real.Size
    fake.Anchored = true
    fake.CanCollide = false
    fake.CanTouch = false
    fake.CanQuery = false
    fake.Material = real.Material
    fake.Color = real.Color
    fake.Transparency = real.Transparency
    fake.Position = at + Vector3.new(0, real.Size.X * 0.1, 0)
    fake.Parent = folder
    -- task.delay rather than Debris: one fewer service to reach for, and the
    -- decoy has to disappear on the same clock everything else in the arena
    -- runs on.
    task.delay(DECOY_LIFETIME, function()
        if fake.Parent then fake:Destroy() end
    end)
end

-- DECLARED ABOVE ArenaService.enter, which calls them. A `local function` only
-- enters scope from its declaration downward, so with these left next to the
-- rest of the round machine — which sits near the bottom of the file — the
-- call inside enter() resolved to a nil GLOBAL and the server died on the
-- first join. Fifth time in this project. tools/scopecheck.py now fails the
-- build on it rather than waiting for a play-test to find it.
local function sendToLobby(player: Player, index: number)
    local run = runs[player.UserId]
    if run then
        run.mass = Config.STARTING_MASS
        run.banking = 0
        run.leakBuffer = 0
        run.slamUntil = 0
        run.splitOwed = 0
        run.activeEffect = nil
        run.powerUntil = 0
        run.safeUntil = os.clock() + 3600   -- untouchable for the whole lobby
        RollService.setRadius(player, Blob.radius(run.mass))
    end
    RollService.teleport(player, WorldBuilder.lobbyPoint(index))
end

local function sendToArena(player: Player, index: number)
    local run = runs[player.UserId]
    if run then
        run.mass = Config.STARTING_MASS
        run.bestMass = Config.STARTING_MASS
        run.peakThisRound = Config.STARTING_MASS
        run.banking = 0
        run.leakBuffer = 0
        run.slamUntil = 0
        run.splitOwed = 0
        run.activeEffect = nil
        run.powerUntil = 0
        run.ateThisRun = 0
        run.snagUntil = 0
        run.slotReadyAt = { 0, 0, 0 }
        run.startedAt = os.clock()
        run.safeUntil = os.clock() + POP_INVULN
        RollService.setRadius(player, Blob.radius(run.mass))
    end
    RollService.teleport(player, WorldBuilder.spawnPoint(index))
end


-- ── Run state ──────────────────────────────────────────────────────────────

local function newRun(player: Player): Run
    local ids, powerId = deps.loadout(player)
    return {
        mass = Config.STARTING_MASS,
        powerId = Powers.get(powerId) and powerId or Powers.DEFAULT,
        slotReadyAt = { 0, 0, 0 },
        globlets = {},
        snagUntil = 0,
        powerReadyAt = 0,
        powerUntil = 0,
        activeEffect = nil,
        slamUntil = 0,
        splitOwed = 0,
        banking = 0,
        leakBuffer = 0,
        safeUntil = os.clock() + POP_INVULN,
        -- Full meter on arrival. A fresh blob gets a real look at the island
        -- before anything is allowed to touch it, which is what makes spawning
        -- out on the rim the right answer for a new player rather than a trap.
        rimGrace = Config.SHALLOWS_GRACE,
        -- The meter does not start running until you have actually gone in.
        -- Spawns sit ON the rim (SPAWN_RING is outside SHALLOWS_INNER), so a
        -- meter that drained from the first tick would leave every player in
        -- the round with twelve seconds gone before they had done anything —
        -- and a brand-new player, who stands still and reads the tutorial,
        -- would spend the entire meter learning the controls. The rim is meant
        -- to stop you LIVING out there, not to punish you for arriving.
        committed = false,
        trinkets = Trinkets.resolve(ids),
        bestMass = Config.STARTING_MASS,
        peakThisRound = Config.STARTING_MASS,
        lastPos = Vector3.zero,
        startedAt = os.clock(),
        ateThisRun = 0,
    }
end

function ArenaService.runFor(player: Player): Run?
    return runs[player.UserId]
end

function ArenaService.massOf(player: Player): number
    local r = runs[player.UserId]
    return r and r.mass or 0
end

-- Re-read a player's equipped trinkets and power without disturbing their run.
function ArenaService.refreshLoadout(player: Player)
    local r = runs[player.UserId]
    if not r then
        return
    end
    local ids, powerId = deps.loadout(player)
    r.trinkets = Trinkets.resolve(ids)
    if Powers.get(powerId) then
        r.powerId = powerId
    end
end

function ArenaService.enter(player: Player)
    runs[player.UserId] = newRun(player)
    -- Arrive into whatever is happening. Joining mid-round puts you on the
    -- island small and late, which is the honest version of walking in halfway
    -- through — and joining during a lobby puts you where everyone else is.
    local n = #Players:GetPlayers()
    if phase == "PLAYING" then
        sendToArena(player, n)
    else
        sendToLobby(player, n)
    end
end

function ArenaService.leave(player: Player)
    runs[player.UserId] = nil
end

-- ── Lumps: the island's memory ─────────────────────────────────────────────

local function congeal(at: Vector3, mass: number)
    local folder = WorldBuilder.arenaFolder()
    if not folder or mass <= 0 then
        return
    end
    -- Oldest lump goes first when the island is full. A cap exists because
    -- terrain that only ever grows eventually walls the Vault off, and the
    -- Vault being reachable is not negotiable.
    if #lumps >= Config.LUMP_MAX_COUNT then
        local oldest = table.remove(lumps, 1)
        if oldest then
            oldest.part:Destroy()
        end
    end

    local radius = Blob.lumpRadius(mass)

    -- NEVER ON THE VAULT. Lumps are solid terrain that lasts most of an hour,
    -- and one congealed on the dish would physically wall off the only place
    -- in the game where mass can be made safe. Pops near the centre are pushed
    -- out past the ramps instead of being dropped where they happened.
    local flat = Vector3.new(at.X, 0, at.Z)
    local keepOut = Config.VAULT_RADIUS + 34 + radius
    if flat.Magnitude < keepOut then
        local dir = flat.Magnitude > 0.01 and flat.Unit or Vector3.new(0, 0, 1)
        at = Vector3.new(dir.X * keepOut, at.Y, dir.Z * keepOut)
    end

    local part = Instance.new("Part")
    part.Name = "Lump"
    part.Shape = Enum.PartType.Ball
    part.Size = Vector3.new(radius, radius * 0.7, radius) * 2
    part.Anchored = true
    part.CanCollide = true
    part.Material = Enum.Material.Sand
    part.Color = Color3.fromRGB(128, 122, 108)
    part.Position = Vector3.new(at.X, at.Y - radius * 0.45, at.Z)
    part.Parent = folder

    table.insert(lumps, { part = part, mass = mass })
end

local function decayLumps(dt: number)
    for i = #lumps, 1, -1 do
        local lump = lumps[i]
        lump.mass = Blob.lumpDecay(lump.mass, dt)
        if lump.mass < 12 then
            lump.part:Destroy()
            table.remove(lumps, i)
        else
            local radius = Blob.lumpRadius(lump.mass)
            lump.part.Size = Vector3.new(radius, radius * 0.7, radius) * 2
        end
    end
end

-- What a run was. Sent on every bank and every pop, because a loop this short
-- needs to close.
--
-- DECLARED HERE, ABOVE pop(), and that is not tidiness. A `local function`
-- only enters scope from its declaration downward: with this defined next to
-- bank() — which sits below pop() — the call inside pop() resolved to a nil
-- GLOBAL, the server booted perfectly, and the whole arena loop died the first
-- time anybody was eaten. The same trap has now taken down three builds of
-- this game.
--
-- The original note said the loop needs to close: without it a run just stops, and the player is left to
-- reconstruct what happened from a number that already changed.
local function summary(run: Run, ended: string, payout: number?)
    return {
        ended = ended,
        seconds = os.clock() - run.startedAt,
        peak = run.bestMass,
        ate = run.ateThisRun,
        payout = payout or 0,
    }
end

-- ── Popping ────────────────────────────────────────────────────────────────

local function pop(player: Player, at: Vector3, killer: Player?)
    -- Your tethers die with you. A fence still standing after its builder has
    -- been eaten is a wire to nowhere, and it would let a dead player keep
    -- shaping the fight from the respawn queue.
    GoopService.clearOwner(player.UserId)
    local run = runs[player.UserId]
    if not run then
        return
    end
    local split = Blob.popSplit(run.mass, run.trinkets.popKeep)

    -- Scatter. One pellet per LEAK_PELLET_MASS of scattered goop, thrown in a
    -- ring so the kill site is visibly a meal rather than a puff of dust.
    local n = math.clamp(math.floor(split.scatter / Config.LEAK_PELLET_MASS), 1, 40)
    for i = 1, n do
        local a = math.rad((360 / n) * i + rng:NextNumber(-14, 14))
        local d = rng:NextNumber(4, 16)
        spawnPellet(at + Vector3.new(math.cos(a) * d, 0, math.sin(a) * d),
            split.scatter / n, false)
    end

    congeal(at, split.congeal)

    if deps then
        deps.effect(player, "runEnd", summary(run, "popped", 0))
        deps.effect(player, "pop", { mass = run.mass })
        if killer then
            deps.notify(killer, ("🫧 Popped %s. +%s mass.")
                :format(player.DisplayName, Format.short(Blob.eatGain(0, run.mass))), "good")
        end
        deps.notify(player, split.kept > 0
            and ("💥 Popped — but you kept %s."):format(Format.short(split.kept))
            or "💥 Popped. Start again.", "bad")
    end

    -- Clear anything mid-flight. A SLAM launched a moment before being eaten
    -- would otherwise land its shockwave wherever the player respawned, and a
    -- SPLIT owed to the old run would pay into the new one.
    run.slamUntil = 0
    run.splitOwed = 0
    run.activeEffect = nil
    run.powerUntil = 0

    run.mass = math.max(Config.STARTING_MASS, split.kept)
    run.startedAt = os.clock()
    run.ateThisRun = 0
    run.bestMass = run.mass
    run.banking = 0
    run.leakBuffer = 0
    run.safeUntil = os.clock() + POP_INVULN

    local a = rng:NextNumber(0, math.pi * 2)
    RollService.teleport(player, Vector3.new(
        math.cos(a) * Config.SPAWN_RING, 8, math.sin(a) * Config.SPAWN_RING))
end

-- ── Banking ────────────────────────────────────────────────────────────────

local function bank(player: Player, run: Run)
    local glob = Blob.bankValue(run.mass)
    local xp = math.floor(run.mass * 0.9)
    deps.award(player, glob, xp, "bank")
    deps.effect(player, "bank", { glob = glob, mass = run.mass })
    deps.notify(player, ("🏦 Banked %s mass → 💧%s"):format(
        Format.short(run.mass), Format.short(glob)), "good")
    deps.effect(player, "runEnd", summary(run, "banked", glob))
    deps.teach(player, "bank")
    run.slamUntil = 0
    run.splitOwed = 0
    run.activeEffect = nil
    run.powerUntil = 0
    run.startedAt = os.clock()
    run.ateThisRun = 0
    run.bestMass = Config.BANK_RESET_MASS
    run.mass = Config.BANK_RESET_MASS
    run.banking = 0
    run.leakBuffer = 0
end

-- ── Powers ─────────────────────────────────────────────────────────────────

--- THE HOTBAR, resolved. Slot 1 is DASH, slot 2 is SPLIT, slot 3 is the power
--- the player chose. One function, so "what is in slot 3" has a single answer
--- on the server and the client reads the same one off the snapshot.
function ArenaService.hotbarFor(player: Player): { any }
    local run = runs[player.UserId]
    return Powers.hotbar(run and run.powerId, deps.banked(player), deps.granted(player))
end

function ArenaService.usePower(player: Player, slot: number?, aim: Vector3?): (boolean, string?)
    local run = runs[player.UserId]
    if not run then
        return false, "You're not in the arena."
    end
    if phase ~= "PLAYING" then
        return false, "Wait for the round to start."
    end
    -- Defaulting to slot 1 rather than rejecting a missing slot: an old client
    -- that has not been reloaded still sends the one-button shape, and having
    -- its DASH silently stop working would be a much worse failure than having
    -- it press the first slot.
    local index = math.clamp(math.floor(tonumber(slot) or 1), 1, 3)
    local bar = Powers.hotbar(run.powerId, deps.banked(player), deps.granted(player))
    local power = bar[index]
    if not power then
        return false, "Nothing in that slot."
    end

    local now = os.clock()
    run.slotReadyAt = run.slotReadyAt or { 0, 0, 0 }
    if now < (run.slotReadyAt[index] or 0) then
        return false, ("%.1fs"):format(run.slotReadyAt[index] - now)
    end

    local uses = usesOf(player, power.id)
    local cost = Powers.massCost(power.id, run.mass, uses)
    if run.mass - cost < Config.STARTING_MASS * 0.5 then
        return false, "Too small to pay for that."
    end
    local ball = RollService.ballFor(player)
    if not ball then
        return false, "No body."
    end

    run.mass -= cost
    run.slotReadyAt[index] = now + Powers.cooldown(power.id, run.trinkets.powerHaste, uses)
    deps.notePowerUse(player, power.id)
    -- `activePower` is what the rest of this function branches on. It used to
    -- read run.powerId directly, which was correct when the blob carried one
    -- power and is wrong now: pressing DASH would have run the chosen power's
    -- effect while charging DASH's cooldown.
    local activePower = power.id
    -- Settle any outstanding SPLIT first. activeEffect is overwritten below,
    -- so without this the thrown half is orphaned the moment you press any
    -- other power and its mass is silently deleted — you pay half of yourself
    -- and get nothing back.
    if run.splitOwed > 0 then
        run.mass += run.splitOwed * SPLIT_RETURN
        run.splitOwed = 0
    end

    run.powerUntil = now + math.max(0.05, power.duration)
    run.activeEffect = activePower

    -- The mass you spend is not deleted: it lands on the floor as food. Powers
    -- feeding the island is what stops a lobby full of dashing from starving
    -- the pellet supply, and it makes a spammed power visibly generous.
    local radius = Blob.radius(run.mass)
    local away = (aim or ball.CFrame.LookVector)
    away = Vector3.new(away.X, 0, away.Z)
    away = away.Magnitude > 0.01 and away.Unit or Vector3.new(0, 0, 1)
    local behind = ball.Position - away * (radius * 1.9 + 4)
    local drops = math.clamp(math.floor(cost / Config.LEAK_PELLET_MASS), 1, 8)
    for i = 1, drops do
        spawnPellet(behind + Vector3.new(rng:NextNumber(-6, 6), 0, rng:NextNumber(-6, 6)),
            cost / drops, false, player.UserId)
    end

    local dir = (aim or ball.CFrame.LookVector)
    dir = Vector3.new(dir.X, 0, dir.Z)
    dir = dir.Magnitude > 0.01 and dir.Unit or Vector3.new(0, 0, 1)

    if activePower == "dash" then
        ball.AssemblyLinearVelocity = dir * 110 + Vector3.new(0, 8, 0)
    elseif activePower == "slam" then
        ball.AssemblyLinearVelocity = Vector3.new(0, 74, 0) + dir * 24
        -- The impact is not instant: it lands when you do. tickPlayer watches
        -- slamUntil and fires the shockwave at the bottom of the arc, which is
        -- the only timing that reads as a slam rather than a shrug.
        run.slamUntil = now + SLAM_AIRTIME
    elseif activePower == "split" then
        -- THROW, don't lunge. The old SPLIT shoved your whole body forward at
        -- 128 studs/sec and booked half your mass to be refunded later, which
        -- is a dash with a bill attached — it looked like nothing had split.
        -- Now it actually splits: pieces leave the body, fly out on their own,
        -- eat, and come back, each one trailing a tether that other blobs have
        -- to respect.
        local each = math.max(Config.LEAK_PELLET_MASS, run.mass * 0.06)
        local thrown = GoopService.split(player.UserId, ball.Position, dir,
            each, Config.SPLIT_PIECES, ball.Color, false)
        run.mass = math.max(Config.STARTING_MASS, run.mass - thrown)
        ball.AssemblyLinearVelocity = dir * 42 + Vector3.new(0, 6, 0)
        deps.effect(player, "split", { pieces = Config.SPLIT_PIECES })
    elseif activePower == "hook" then
        -- Reel. Bigger drags smaller toward it; smaller drags ITSELF toward
        -- bigger, which is what makes HOOK a chase tool for the hunter and an
        -- escape-the-open-ground tool for the hunted with the same button.
        local target, best = nil, HOOK_RANGE
        for _, other in ipairs(Players:GetPlayers()) do
            local orun = runs[other.UserId]
            if other ~= player and orun and not protected(other, orun, now) then
                local ob = RollService.ballFor(other)
                if ob and ob.Parent then
                    local d = (ob.Position - ball.Position).Magnitude
                    if d < best then target, best = other, d end
                end
            end
        end
        local hookBot = nil
        for _, bot in ipairs(BotService.living()) do
            if not botProtected(bot) then
                local d = (bot.pos - ball.Position).Magnitude
                if d < best then hookBot, best = bot, d end
            end
        end
        if hookBot then
            -- Same rule as against a player: bigger drags smaller, smaller
            -- drags itself. A bot cannot be shoved by physics here because it
            -- is kinematic, so the reel is applied to its position directly.
            local toward = Vector3.new(ball.Position.X - hookBot.pos.X, 0,
                ball.Position.Z - hookBot.pos.Z)
            if toward.Magnitude > 0.01 then
                toward = toward.Unit
                if run.mass >= hookBot.mass then
                    hookBot.pos += toward * math.min(HOOK_PULL * 0.5, best - 4)
                    hookBot.goal = hookBot.pos
                else
                    ball.AssemblyLinearVelocity = -toward * HOOK_PULL + Vector3.new(0, 12, 0)
                end
                deflateBot(hookBot, Config.DEFLATE.hook, true, player.UserId)
                deps.teach(player, "deflate")
                deps.effect(player, "hook", { to = hookBot.name })
            end
        elseif target then
            local tb = RollService.ballFor(target)
            local tr = runs[target.UserId]
            if tb and tr then
                local toward = (ball.Position - tb.Position)
                toward = Vector3.new(toward.X, 0, toward.Z)
                if toward.Magnitude > 0.01 then
                    toward = toward.Unit
                    if run.mass >= tr.mass then
                        tb.AssemblyLinearVelocity = toward * HOOK_PULL * tr.trinkets.knockbackMult
                            + Vector3.new(0, 12, 0)
                    else
                        ball.AssemblyLinearVelocity = -toward * HOOK_PULL + Vector3.new(0, 12, 0)
                    end
                    deflate(target, tr, Config.DEFLATE.hook, true, player.UserId)
                    deps.teach(player, "deflate")
                    deps.effect(player, "hook", { to = target.DisplayName })
                end
            end
        end
    elseif activePower == "blink" then
        -- A teleport, not a shove. It goes THROUGH blobs and lumps, which is
        -- the only thing DASH cannot do, and is why it costs more than twice
        -- as much. Routed through RollService.teleport so the anti-cheat is
        -- told this one was the server's idea.
        local to = ball.Position + dir * BLINK_DISTANCE
        local flat = Vector3.new(to.X, 0, to.Z)
        -- Never off the island. A power that can drop you in the sea is a
        -- power nobody presses twice.
        if flat.Magnitude > Config.ISLAND_RADIUS - 20 then
            to = flat.Unit * (Config.ISLAND_RADIUS - 20) + Vector3.new(0, ball.Position.Y, 0)
        end
        RollService.teleport(player, to + Vector3.new(0, 4, 0))

    elseif activePower == "decoy" then
        spawnDecoy(player, run, ball.Position - dir * (radius * 2.2))

    elseif activePower == "siphon" then
        -- Drains the nearest blob BIGGER than you. The only power in the game
        -- that works exclusively upward: it is the comeback tool, so it has to
        -- be useless to whoever is already winning.
        local target, best = nil, SIPHON_RANGE
        for _, other in ipairs(Players:GetPlayers()) do
            local orun = other ~= player and runs[other.UserId]
            local ob = orun and RollService.ballFor(other)
            if ob and ob.Parent and orun.mass > run.mass
                and not protected(other, orun, now) then
                local d = (ob.Position - ball.Position).Magnitude
                if d < best then target, best = other, d end
            end
        end
        -- A bigger BOT is a legitimate siphon target and has to be: SIPHON is
        -- the comeback tool, and on a field of eleven bots the thing that is
        -- running away with the round is usually one of them.
        local botTarget = nil
        for _, bot in ipairs(BotService.living()) do
            if bot.mass > run.mass and not botProtected(bot) then
                local d = (bot.pos - ball.Position).Magnitude
                if d < best then botTarget, best = bot, d end
            end
        end
        if botTarget then
            local drained = deflateBot(botTarget, Config.DEFLATE.siphon, false)
            run.mass += drained
            deps.teach(player, "deflate")
            deps.effect(player, "siphon", { from = botTarget.name, amount = drained })
        elseif target then
            local trun = runs[target.UserId]
            -- Stolen, not scattered: SIPHON is the one deflating power whose
            -- take goes straight into the caster. It is also the only power
            -- that works exclusively upward, so the trade is fair.
            local drained = deflate(target, trun, Config.DEFLATE.siphon, false)
            run.mass += drained
            deps.teach(player, "deflate")
            deps.notify(target, ("🩸 %s siphoned %s off you.")
                :format(player.DisplayName, Format.short(drained)), "bad")
            deps.effect(player, "siphon", { from = target.DisplayName, amount = drained })
            -- The victim needs to see it too. Watching your number fall with
            -- no visible cause reads as a bug, not as an attack.
            deps.effect(target, "siphoned", { by = player.DisplayName, amount = drained })
        end

    elseif activePower == "magnet" or activePower == "beacon" then
        -- handled in tick while powerUntil holds
    end

    deps.effect(player, "power", { id = activePower, cost = cost, slot = index })
    deps.teach(player, "power")
    return true, nil
end

-- ── The loop ───────────────────────────────────────────────────────────────

local function tickPlayer(player: Player, run: Run, dt: number, now: number)
    local ball = RollService.ballFor(player)
    if not ball or not ball.Parent then
        return
    end
    local pos = ball.Position
    local radius = Blob.radius(run.mass)

    -- THE RIM METER. Drains in real time while you are out on the Shallows and
    -- refills only while you are back inside the Flats, at SHALLOWS_RECHARGE
    -- seconds spent per second refunded. Clamped at both ends so a long round
    -- in the middle cannot bank an unlimited escape.
    if not WorldBuilder.isSafe(pos) then
        run.committed = true
        if run.rimGrace < Config.SHALLOWS_GRACE then
            run.rimGrace = math.min(Config.SHALLOWS_GRACE,
                run.rimGrace + dt / Config.SHALLOWS_RECHARGE)
        end
    elseif run.committed then
        run.rimGrace = math.max(0, run.rimGrace - dt)
    end

    -- MELT. The one mechanic the whole game is built on: everything above the
    -- grace mass drips, and what drips becomes real food on the floor rather
    -- than a number going down. A big blob is a moving buffet, and everyone
    -- can see the trail.
    -- MELT IS OFF IN ROUND MODE. The whole fantasy is getting enormous, and a
    -- leak curve that caps growth is directly at odds with it. The job melt
    -- used to do — stopping a runaway leader — belongs to other players now:
    -- abilities deflate, so a leader is brought down by being ganged up on.
    -- The curve is kept and still tested; Config.LEAK_IN_ROUND turns it back
    -- on in one line if deflation proves too weak a brake.
    local leak = 0
    if Config.LEAK_IN_ROUND then
        leak = Blob.leakPerSecond(run.mass) * run.trinkets.leakMult * dt
    end
    if leak > 0 then
        deps.teach(player, "melt")
        run.mass = math.max(Config.STARTING_MASS, run.mass - leak)
        run.leakBuffer += leak
        while run.leakBuffer >= Config.LEAK_PELLET_MASS do
            run.leakBuffer -= Config.LEAK_PELLET_MASS
            -- Outside the body, in a ring, so it reads as a trail rather than
            -- a puddle you are standing in.
            local a = rng:NextNumber(0, math.pi * 2)
            local d = radius * 1.9 + rng:NextNumber(2, 9)
            spawnPellet(
                Vector3.new(pos.X + math.cos(a) * d, pos.Y - radius * 0.5, pos.Z + math.sin(a) * d),
                Config.LEAK_PELLET_MASS, false, player.UserId)
        end
    end

    -- EAT. Only the nine cells around the blob are considered.
    local magnetising = run.activeEffect == "magnet" and now < run.powerUntil
    local reach = radius + PICKUP_SLACK + (magnetising and 40 or 0)
    local cx, cz = math.floor(pos.X / CELL), math.floor(pos.Z / CELL)
    local span = magnetising and 2 or 1
    for gx = cx - span, cx + span do
        for gz = cz - span, cz + span do
            local bucket = grid[gx .. ":" .. gz]
            if bucket then
                for part, pellet in pairs(bucket) do
                    if part.Parent then
                        local mine = now < pellet.ownerUntil
                            and (pellet.owner == player.UserId
                                or pellet.owner2 == player.UserId)
                        local d = (part.Position - pos)
                        if not mine and d.Magnitude <= reach then
                            local worth = pellet.value * run.trinkets.pelletMult
                            if run.activeEffect == "beacon" and now < run.powerUntil then
                                worth *= 1 + BEACON_BONUS
                            end
                            run.mass += worth
                            run.ateThisRun += 1
                            if run.mass > Config.STARTING_MASS * 4 then
                                deps.teach(player, "grow")
                            end
                            removePellet(pellet)
                            deps.teach(player, "eat")
                        end
                    else
                        removePellet(pellet)
                    end
                end
            end
        end
    end

    -- NO MID-ROUND BANKING. It used to convert your mass to Glob and reset you
    -- to 25, which is in direct conflict with the point of a round: get as
    -- enormous as you can before the clock runs out. The round end is the
    -- bank now, and it pays on the size you finish with. The Vault survives as
    -- the island's landmark — it is what the whole map orients on — and the
    -- code below is kept for the same reason Config.LEAK_IN_ROUND is: turning
    -- a cash-out back on is a small change, not an archaeology project.

    if run.mass > run.bestMass then
        run.bestMass = run.mass
    end

    -- SLAM lands. Everything nearby is thrown outward, and every lump inside
    -- the blast shatters into pellets — which is the real job: an island that
    -- has silted up with an hour of congealed shells needs something that can
    -- break it open again, or the Vault eventually walls itself in.
    if run.slamUntil > 0 and now >= run.slamUntil then
        run.slamUntil = 0
        local hits = 0
        for _, other in ipairs(Players:GetPlayers()) do
            local orun = runs[other.UserId]
            local ob = other ~= player and orun and RollService.ballFor(other)
            if ob and ob.Parent and not protected(other, orun, now) then
                local away = ob.Position - pos
                local flat = Vector3.new(away.X, 0, away.Z)
                if flat.Magnitude < SLAM_RADIUS and flat.Magnitude > 0.01 then
                    local falloff = 1 - (flat.Magnitude / SLAM_RADIUS)
                    ob.AssemblyLinearVelocity = flat.Unit
                            * (SLAM_IMPULSE * falloff * orun.trinkets.knockbackMult)
                        + Vector3.new(0, 26 * falloff, 0)
                    -- Scaled by how central the hit was, so a clean slam on
                    -- the leader is worth lining up.
                    deflate(other, orun, Config.DEFLATE.slam * falloff, true, player.UserId)
                    deps.teach(player, "deflate")
                    hits += 1
                end
            end
        end
        -- Bots are in the blast. A shockwave that passed through eleven of
        -- the twelve things on the island would make SLAM feel broken in
        -- exactly the games where the field is mostly bots — which is every
        -- game on day one.
        for _, bot in ipairs(BotService.living()) do
            if not botProtected(bot) then
                local flat = Vector3.new(bot.pos.X - pos.X, 0, bot.pos.Z - pos.Z)
                if flat.Magnitude < SLAM_RADIUS and flat.Magnitude > 0.01 then
                    local falloff = 1 - (flat.Magnitude / SLAM_RADIUS)
                    bot.pos += flat.Unit * (SLAM_RADIUS * 0.5 * falloff)
                    bot.goal = bot.pos
                    deflateBot(bot, Config.DEFLATE.slam * falloff, true, player.UserId)
                    hits += 1
                end
            end
        end
        for i = #lumps, 1, -1 do
            local lump = lumps[i]
            if (lump.part.Position - pos).Magnitude < SLAM_RADIUS then
                local n = math.clamp(math.floor(lump.mass / Config.LEAK_PELLET_MASS), 1, 12)
                for k = 1, n do
                    local a = math.rad((360 / n) * k)
                    spawnPellet(lump.part.Position
                        + Vector3.new(math.cos(a) * 8, 2, math.sin(a) * 8),
                        lump.mass / n, false)
                end
                lump.part:Destroy()
                table.remove(lumps, i)
            end
        end
        deps.effect(player, "slam", { hits = hits })
    end

    -- SPLIT comes back. The thrown half is not a second body you steer — that
    -- needs a whole second controller and a camera that can hold two things —
    -- it is a committed lunge that returns less than it cost. Which is the
    -- honest version of the same decision: gamble half of yourself on reaching
    -- something, and eat well or come back smaller.
    if run.activeEffect == "split" and now >= run.powerUntil and run.splitOwed > 0 then
        run.mass += run.splitOwed * SPLIT_RETURN
        run.splitOwed = 0
        run.activeEffect = nil
        deps.notify(player, "🫧 Your other half came back.", "info")
    end

    RollService.setRadius(player, radius)
    run.lastPos = pos
end

-- Blob versus blob. N^2 over players only, which is at most ~1,600 tests for a
-- full Roblox server and costs nothing next to the pellet pass.
local function tickCombat(list: { Player }, now: number)
    for i = 1, #list do
        for j = i + 1, #list do
            local a, b = list[i], list[j]
            local ra, rb = runs[a.UserId], runs[b.UserId]
            local ba, bb = RollService.ballFor(a), RollService.ballFor(b)
            if ra and rb and ba and bb and ba.Parent and bb.Parent then
                -- Same helper every power uses, so there is one answer to
                -- "can this player be touched" rather than two that drift.
                if not protected(a, ra, now) and not protected(b, rb, now) then
                    local radA, radB = Blob.radius(ra.mass), Blob.radius(rb.mass)
                    local dist = (ba.Position - bb.Position).Magnitude
                    if dist < (radA + radB) - math.min(radA, radB) * EAT_OVERLAP then
                        -- BUBBLE refuses the exchange in both directions: you
                        -- cannot be eaten and you cannot eat. A shield that let
                        -- you keep hunting would just be a better SPIKE.
                        local aBubbled = ra.activeEffect == "bubble" and now < ra.powerUntil
                        local bBubbled = rb.activeEffect == "bubble" and now < rb.powerUntil
                        if not aBubbled and not bBubbled then
                            local aSpiked = ra.activeEffect == "spike" and now < ra.powerUntil
                            local bSpiked = rb.activeEffect == "spike" and now < rb.powerUntil
                            local eater, prey
                            if Blob.canEat(ra.mass, rb.mass) then
                                eater, prey = a, b
                            elseif Blob.canEat(rb.mass, ra.mass) then
                                eater, prey = b, a
                            end
                            -- SPIKE inverts it. This is the only way the
                            -- smallest blob on the island deletes the biggest,
                            -- and it costs a fifth of yourself to try.
                            if eater and prey then
                                local preySpiked = (prey == a and aSpiked) or (prey == b and bSpiked)
                                if preySpiked then
                                    -- Biting a spiked blob does not swap the
                                    -- meal round, it COSTS you. Deflating the
                                    -- biter by a third of themselves is how
                                    -- the smallest blob on the island punishes
                                    -- the biggest without having to swallow it.
                                    local biter = eater
                                    local biterRun = runs[biter.UserId]
                                    if biterRun then
                                        deflate(biter, biterRun, Config.DEFLATE.spike, true)
                                        deps.notify(biter, "🌵 Spiked. That cost you.", "bad")
                                    end
                                    eater, prey = nil, nil
                                end
                                local re = eater and runs[eater.UserId]
                                local rp = prey and runs[prey.UserId]
                                local bp = prey and RollService.ballFor(prey)
                                if re and rp and bp then
                                    re.mass += Blob.eatGain(re.mass, rp.mass)
                                    pop(prey, bp.Position, eater)
                                end
                            end
                        end
                    end
                end
            end
        end
    end
end

-- ── Goop: globlets, tethers and pods ──────────────────────────────────────

--- Where a given owner's body is, for GoopService to reel its pieces home.
--- Negative ids are bots; positive are players. One function so the tether
--- system never has to know which it is dealing with.
local function bodyPosFor(ownerId: number): Vector3?
    if ownerId < 0 then
        for _, bot in ipairs(BotService.living()) do
            if -bot.id == ownerId then
                return bot.pos
            end
        end
        return nil
    end
    local player = Players:GetPlayerByUserId(ownerId)
    local run = player and runs[player.UserId]
    local ball = run and RollService.ballFor(player)
    return (ball and ball.Parent) and ball.Position or nil
end

--- Pay a returning globlet's mass back to whoever threw it.
local function payBack(ownerId: number, mass: number)
    local back = mass * Config.SPLIT_RETURN_FRACTION
    if ownerId < 0 then
        for _, bot in ipairs(BotService.living()) do
            if -bot.id == ownerId then
                bot.mass += back
                return
            end
        end
        return
    end
    local player = Players:GetPlayerByUserId(ownerId)
    local run = player and runs[player.UserId]
    if run then
        run.mass += back
    end
end

--- Everything the goop layer does in one tick: move the pieces, let them eat,
--- bite anybody crossing a strand, and burst anybody big who walked into a pod.
---
--- ALL the mass rules live here rather than in GoopService, for the same
--- reason they live here rather than in BotService: "how much does this take
--- off you" must have exactly one answer for players and bots alike.
local function tickGoop(dt: number, now: number, list: { Player })
    -- Pieces move, then eat off the floor at their own small reach.
    local returned = GoopService.step(dt, now, bodyPosFor)
    for _, g in ipairs(returned) do
        payBack(g.ownerId, g.mass)
    end
    for _, g in ipairs(GoopService.list()) do
        g.mass += harvestAt(g.pos, Config.GLOBLET_PICKUP + Blob.radius(g.mass) * 0.5)
    end

    -- ── Tethers ───────────────────────────────────────────────────────────
    --
    -- Deliberately weak per touch and on a per-victim cooldown: this is area
    -- denial, not a damage engine. Walking the length of a strand costs you a
    -- noticeable slice; clipping the end of one barely registers.
    local live = GoopService.list()
    if #live > 0 then
        for _, g in ipairs(live) do
            local home = bodyPosFor(g.ownerId)
            if home then
                for _, player in ipairs(list) do
                    local run = runs[player.UserId]
                    local ball = run and RollService.ballFor(player)
                    -- NEVER YOUR OWN. A fence that cut its own builder would
                    -- make splitting strictly self-harming, which is the one
                    -- way to guarantee nobody ever presses the button.
                    if run and ball and ball.Parent and g.ownerId ~= player.UserId
                        and not protected(player, run, now) then
                        local d = GoopService.distanceToStrand(g, home, ball.Position)
                        if d <= Config.TETHER_WIDTH + Blob.radius(run.mass)
                            and GoopService.canHit(g, "p" .. player.UserId, now) then
                            deflate(player, run, Config.TETHER_DEFLATE, true,
                                g.ownerId > 0 and g.ownerId or nil)
                            run.snagUntil = now + Config.TETHER_SLOW_TIME
                            deps.effect(player, "snagged", {})
                        end
                    end
                end
                for _, bot in ipairs(BotService.living()) do
                    if g.ownerId ~= -bot.id and not botProtected(bot) then
                        local d = GoopService.distanceToStrand(g, home, bot.pos)
                        if d <= Config.TETHER_WIDTH + Blob.radius(bot.mass)
                            and GoopService.canHit(g, "b" .. bot.id, now) then
                            deflateBot(bot, Config.TETHER_DEFLATE, true,
                                g.ownerId > 0 and g.ownerId or nil)
                            bot.snagUntil = now + Config.TETHER_SLOW_TIME
                        end
                    end
                end
            end
        end
    end

    -- ── Spore pods ────────────────────────────────────────────────────────
    --
    -- Only blobs over POD_MIN_MASS set one off, which is the whole reason the
    -- things are on the map: a pod field is ground a small player can hide in
    -- and a big one cannot follow into.
    GoopService.regrowPods(now)
    for _, pod in ipairs(GoopService.pods()) do
        if pod.readyAt == 0 then
            for _, player in ipairs(list) do
                local run = runs[player.UserId]
                local ball = run and RollService.ballFor(player)
                if run and ball and ball.Parent and run.mass >= Config.POD_MIN_MASS then
                    local flat = Vector3.new(ball.Position.X - pod.pos.X, 0,
                        ball.Position.Z - pod.pos.Z)
                    if flat.Magnitude <= Config.POD_RADIUS + Blob.radius(run.mass) then
                        -- A BURST, NOT A TAX. The mass is not destroyed and it
                        -- is not handed to anybody — it leaves as globlets and
                        -- comes back. What the pod costs you is CONTROL: for a
                        -- few seconds your tethers are everywhere at once,
                        -- which is dangerous for everyone nearby, including
                        -- whoever herded you into it.
                        local each = math.max(Config.LEAK_PELLET_MASS,
                            run.mass * 0.05)
                        local thrown = GoopService.split(player.UserId, ball.Position,
                            ball.CFrame.LookVector, each, Config.POD_PIECES,
                            ball.Color, true)
                        run.mass = math.max(Config.STARTING_MASS, run.mass - thrown)
                        -- SHOVED CLEAR. Without this a blob that stops on a
                        -- pod re-bursts the instant it regrows, forever: the
                        -- pod is permanently useless to everybody else and the
                        -- blob is permanently scattered. The shove is outward
                        -- from the pod along the approach, which also reads
                        -- correctly — the thing exploded underneath you.
                        local away = flat.Magnitude > 0.01 and flat.Unit
                            or Vector3.new(0, 0, 1)
                        ball.AssemblyLinearVelocity = away * 70 + Vector3.new(0, 26, 0)
                        GoopService.spendPod(pod, now)
                        deps.effect(player, "podBurst", { pieces = Config.POD_PIECES })
                        deps.notify(player, "\u{1F4A5} A spore pod burst you open!", "warn")
                        break
                    end
                end
            end
        end
    end
end

-- ── Bots ───────────────────────────────────────────────────────────────────

--- Everybody on the island, players and bots alike, in one shape.
---
--- The brain is handed this and cannot tell which rows are human. That is the
--- point: the moment a bot knows, it starts playing two different games and
--- the difficulty you feel stops being the difficulty that was tuned.
local function contenders(list: { Player }, now: number): { any }
    local field = {}
    for _, player in ipairs(list) do
        local run = runs[player.UserId]
        local ball = run and RollService.ballFor(player)
        if run and ball and ball.Parent then
            table.insert(field, {
                key = "player:" .. player.UserId,
                mass = run.mass,
                pos = ball.Position,
                safe = protected(player, run, now),
            })
        end
    end
    for _, bot in ipairs(BotService.list()) do
        if bot.respawnAt == 0 then
            table.insert(field, {
                key = "bot:" .. bot.id,
                mass = bot.mass,
                pos = bot.pos,
                safe = botProtected(bot),
            })
        end
    end
    return field
end

--- Move the bots, then let them eat off the floor.
---
--- Feeding is done HERE rather than inside BotService because the pellets are
--- this file's state. A bot sweeps the same corridor a player does at the same
--- radius, so a bot and a player standing in the same field grow at the same
--- rate — which is the only version of this that can be called fair.
local function tickBots(dt: number, now: number, list: { Player })
    if BotService.count() == 0 then
        return
    end
    BotService.step(dt, now, contenders(list, now), nearestPelletPos)
    for _, bot in ipairs(BotService.list()) do
        if bot.respawnAt == 0 then
            bot.mass += harvestAt(bot.pos, Blob.radius(bot.mass) + PICKUP_SLACK)
        end
    end
end

--- Blob versus blob, across the species line.
---
--- Deliberately the same test tickCombat uses — overlap, then Blob.canEat —
--- because "can I eat that" must have exactly one answer no matter what is
--- standing in front of you. A bot that ate on different terms would teach the
--- player a rule that then fails them against a human, which is worse than
--- having no bots at all.
local function tickBotCombat(list: { Player }, now: number)
    local live = BotService.living()
    if #live == 0 then
        return
    end

    -- Bot vs player.
    for _, player in ipairs(list) do
        local run = runs[player.UserId]
        local ball = run and RollService.ballFor(player)
        if run and ball and ball.Parent and not protected(player, run, now) then
            local bubbled = run.activeEffect == "bubble" and now < run.powerUntil
            local spiked = run.activeEffect == "spike" and now < run.powerUntil
            for _, bot in ipairs(live) do
                if bot.respawnAt == 0 and not botProtected(bot) and not bubbled then
                    local rp, rb = Blob.radius(run.mass), Blob.radius(bot.mass)
                    local dist = (ball.Position - bot.pos).Magnitude
                    if dist < (rp + rb) - math.min(rp, rb) * EAT_OVERLAP then
                        if Blob.canEat(run.mass, bot.mass) then
                            run.mass += Blob.eatGain(run.mass, bot.mass)
                            deps.effect(player, "ate", { name = bot.name, bot = true })
                            deps.teach(player, "eatBlob")
                            BotService.kill(bot, now)
                        elseif Blob.canEat(bot.mass, run.mass) then
                            if spiked then
                                -- SPIKE works on bots too, and it has to: it
                                -- is the smallest blob's only answer to the
                                -- biggest, and a field of bots is exactly
                                -- where a new player meets that problem.
                                deflateBot(bot, Config.DEFLATE.spike, true)
                                deps.notify(player, ("🌵 %s bit a spike."):format(bot.name), "good")
                            else
                                bot.mass += Blob.eatGain(bot.mass, run.mass)
                                pop(player, ball.Position, nil)
                                deps.notify(player, ("😵 %s swallowed you."):format(bot.name), "bad")
                            end
                            break
                        end
                    end
                end
            end
        end
    end

    -- Bot vs bot. The island has to look busy from across the map even when
    -- the player is nowhere near it, and a field where only the player ever
    -- causes anything to happen reads as a stage set.
    for i = 1, #live do
        for j = i + 1, #live do
            local a, b = live[i], live[j]
            if a.respawnAt == 0 and b.respawnAt == 0
                and not botProtected(a) and not botProtected(b) then
                local ra, rb = Blob.radius(a.mass), Blob.radius(b.mass)
                local dist = (a.pos - b.pos).Magnitude
                if dist < (ra + rb) - math.min(ra, rb) * EAT_OVERLAP then
                    if Blob.canEat(a.mass, b.mass) then
                        a.mass += Blob.eatGain(a.mass, b.mass)
                        BotService.kill(b, now)
                    elseif Blob.canEat(b.mass, a.mass) then
                        b.mass += Blob.eatGain(b.mass, a.mass)
                        BotService.kill(a, now)
                    end
                end
            end
        end
    end
end

local function topUpPellets(dt: number)
    local deficit = Config.PELLET_TARGET - pelletCount
    if deficit <= 0 then
        return
    end
    local budget = Config.PELLET_RESPAWN_PER_SEC * dt
    -- Fractional budget accumulates rather than rounding to zero every tick,
    -- which at 12Hz would otherwise spawn nothing at all below 12/sec.
    ArenaService._pelletDebt = (ArenaService._pelletDebt or 0) + budget
    while ArenaService._pelletDebt >= 1 and pelletCount < Config.PELLET_TARGET do
        ArenaService._pelletDebt -= 1
        spawnPellet(nil, nil, rng:NextNumber() < 0.012)
    end
end

-- Hand mass to a player directly. Used by the tutorial to make the first
-- growth step instant, and by the tests to reach a size without simulating
-- four minutes of eating.
function ArenaService.grant(player: Player, mass: number)
    local run = runs[player.UserId]
    if not run then
        return
    end
    run.mass = math.max(Config.STARTING_MASS, run.mass + mass)
    if run.mass > run.bestMass then
        run.bestMass = run.mass
    end
    RollService.setRadius(player, Blob.radius(run.mass))
end

-- ── The round machine ──────────────────────────────────────────────────────

function ArenaService.phase(): (string, number, number)
    return phase, math.max(0, phaseEndsAt - os.clock()), roundNumber
end

function ArenaService.inRound(): boolean
    return phase == "PLAYING"
end

local function beginLobby()
    -- The island empties between rounds. Leaving bots wandering an arena
    -- nobody is in costs a Heartbeat's worth of work per bot for an empty
    -- stage, and it makes the lobby's "round starts in" clock read as a lie.
    BotService.clear()
    -- Strands with nothing on either end of them, and a hazard field nobody is
    -- standing in. Both go with the round.
    GoopService.clear()
    GoopService.clearPods()
    phase = "LOBBY"
    phaseEndsAt = os.clock() + Config.INTERMISSION_SECONDS
    local i = 0
    for _, player in ipairs(Players:GetPlayers()) do
        sendToLobby(player, i)
        i += 1
    end
    -- Clear the floor. Pellets left lying around the island during a lobby are
    -- just instance count nobody can reach.
    for _, pellet in pairs(pellets) do
        removePellet(pellet)
    end
end

local function beginRound()
    phase = "PLAYING"
    roundNumber += 1
    phaseEndsAt = os.clock() + Config.ROUND_SECONDS

    for i = #lumps, 1, -1 do
        lumps[i].part:Destroy()
        table.remove(lumps, i)
    end
    for _, pellet in pairs(pellets) do
        removePellet(pellet)
    end
    for _ = 1, Config.PELLET_TARGET do
        spawnPellet(nil, nil, rng:NextNumber() < 0.012)
    end
    -- Pods are re-scattered every round rather than placed once at boot: their
    -- positions are most of a round's terrain knowledge, and a map whose
    -- hazards never move is one where the regulars always know where the small
    -- players are hiding.
    GoopService.clear()
    GoopService.seedPods()

    local humans = #Players:GetPlayers()

    -- FILL THE FIELD. Recomputed at the top of every round and only here: a
    -- player joining mid-round is an extra contender rather than a reason to
    -- delete a bot that is already out there being chased by somebody.
    BotService.fill(Config.ROUND_FIELD_SIZE - humans)

    local i = 0
    for _, player in ipairs(Players:GetPlayers()) do
        sendToArena(player, i)
        local filled = BotService.count()
        deps.notify(player, filled > 0
            and ("🫧 ROUND %d — %d players, %d bots. Grow as big as you can.")
                :format(roundNumber, humans, filled)
            or ("🫧 ROUND %d — grow as big as you can."):format(roundNumber), "good")
        i += 1
    end
end

local function endRound()
    phase = "RESULTS"
    phaseEndsAt = os.clock() + Config.ROUND_END_HOLD

    -- ONE BOARD, both species. A bot that grew all round and then vanished
    -- from the results would make second place a lie — the player would have
    -- spent three minutes losing to something the scoreboard says was never
    -- there. Bots place, bots are named, bots are tagged, and they take no
    -- payout because there is nobody to pay.
    local board = {}
    for _, player in ipairs(Players:GetPlayers()) do
        local run = runs[player.UserId]
        if run then
            table.insert(board, {
                player = player, name = player.DisplayName,
                mass = run.mass, peak = run.peakThisRound,
            })
        end
    end
    for _, bot in ipairs(BotService.list()) do
        table.insert(board, {
            player = nil, name = bot.name, bot = true,
            mass = bot.mass, peak = bot.peak,
        })
    end
    table.sort(board, function(x, y) return x.mass > y.mass end)

    lastResults = {}
    for place, row in ipairs(board) do
        -- Your final size is the score. Placement is a bonus on top, so second
        -- is still worth playing for rather than being worth nothing.
        local base = row.mass ^ Config.ROUND_PAYOUT_EXPONENT * Config.ROUND_PAYOUT_SCALE
        local bonus = Config.ROUND_PLACE_BONUS[place] or 1
        local payout = math.floor(base * bonus)
        if row.player then
            deps.award(row.player, payout, 0, "round")
            deps.roundResult(row.player, place, row.mass, payout)
            deps.notify(row.player, ("🏁 #%d of %d with %s — 💧%s"):format(
                place, #board, Format.short(row.mass), Format.short(payout)),
                place == 1 and "good" or "info")
        else
            payout = 0
        end
        table.insert(lastResults, {
            name = row.name, place = place, bot = row.bot == true,
            mass = row.mass, peak = row.peak, payout = payout,
        })
    end
    for _, player in ipairs(Players:GetPlayers()) do
        deps.effect(player, "roundEnd", { round = roundNumber, board = lastResults })
    end
end

function ArenaService.results()
    return lastResults
end

function ArenaService.start(injected: Deps)
    deps = injected
    -- From here on the arena is the only thing that resizes a body.
    RollService.sizeOwnedByArena = true

    RollService.rescuePoint = function(player)
        if phase == "PLAYING" then
            return WorldBuilder.spawnPoint(player.UserId)
        end
        return WorldBuilder.lobbyPoint(player.UserId)
    end

    phase = "LOBBY"
    phaseEndsAt = os.clock() + Config.INTERMISSION_SECONDS

    task.spawn(function()
        local last = os.clock()
        while true do
            task.wait(TICK)
            local now = os.clock()
            local dt = math.min(0.5, now - last)
            last = now

            -- Advance the machine first, so a phase change takes effect on
            -- the same tick rather than leaving one frame of the old rules.
            if now >= phaseEndsAt then
                if phase == "LOBBY" then beginRound()
                elseif phase == "PLAYING" then endRound()
                else beginLobby() end
            end

            local playing = phase == "PLAYING"
            local active: { Player } = {}
            for _, player in ipairs(Players:GetPlayers()) do
                local run = runs[player.UserId]
                if run then
                    if playing then
                        tickPlayer(player, run, dt, now)
                        if run.mass > run.peakThisRound then
                            run.peakThisRound = run.mass
                        end
                    end
                    table.insert(active, player)
                    deps.sync(player, ArenaService.snapshot(player, run, now))
                end
            end

            -- Nothing eats anybody outside a round, and the floor is only
            -- stocked while there is somebody to eat off it.
            if playing then
                -- Bots move BEFORE combat is resolved, so a bot that just
                -- walked into you is eaten on the tick it arrives rather than
                -- appearing to phase through and get you on the next one.
                tickBots(dt, now, active)
                -- Goop before combat: a globlet that just arrived should bite
                -- on the tick it lands, not the one after.
                tickGoop(dt, now, active)
                tickCombat(active, now)
                tickBotCombat(active, now)
                topUpPellets(dt)
                decayLumps(dt)
            end
        end
    end)
end

-- What the HUD needs, and nothing else. Sent every tick, so it stays small.
function ArenaService.snapshot(player: Player, run: Run, now: number)
    local ball = RollService.ballFor(player)
    local pos = ball and ball.Position or Vector3.zero
    return {
        mass = run.mass,
        radius = Blob.radius(run.mass),
        -- The leak ACTUALLY APPLIED, not the curve's value. Reporting the
        -- curve while Config.LEAK_IN_ROUND is off would put a melt rate on the
        -- HUD that nothing is subtracting — a readout describing a different
        -- game to the one being played.
        leak = Config.LEAK_IN_ROUND
            and (Blob.leakPerSecond(run.mass) * run.trinkets.leakMult) or 0,
        harvest = Blob.harvestPerSecond(run.mass) * run.trinkets.pelletMult,
        worth = Blob.bankValue(run.mass),
        banking = run.banking,
        bankNeeds = Blob.bankSeconds(run.trinkets.bankHaste),
        powerId = run.powerId,
        -- ── THE HOTBAR ────────────────────────────────────────────────────
        -- Three slots, resolved server-side. The client draws exactly what is
        -- in here and decides nothing: the third slot depends on what the
        -- player owns, and a button that offers something the server will
        -- refuse is the worst kind of control.
        slots = (function()
            local bar = Powers.hotbar(run.powerId, deps.banked(player), deps.granted(player))
            local out = {}
            for i, power in ipairs(bar) do
                local uses = usesOf(player, power.id)
                table.insert(out, {
                    id = power.id,
                    name = power.name,
                    cost = Powers.massCost(power.id, run.mass, uses),
                    cooldown = math.max(0, (run.slotReadyAt[i] or 0) - now),
                    cooldownMax = Powers.cooldown(power.id, run.trinkets.powerHaste, uses),
                    mastery = Powers.masteryTier(uses),
                    locked = false,
                })
            end
            return out
        end)(),
        globlets = GoopService.countFor(player.UserId),
        snagged = now < run.snagUntil,
        -- KEPT, and now derived from slot 3 rather than from a field nothing
        -- writes. `run.powerReadyAt` stopped being set when cooldowns moved
        -- per-slot, so this quietly reported "always ready" for the chosen
        -- power to anything still reading it.
        powerCooldown = math.max(0, (run.slotReadyAt[3] or 0) - now),
        powerCost = Powers.massCost(run.powerId, run.mass, usesOf(player, run.powerId)),
        mastery = Powers.masteryTier(usesOf(player, run.powerId)),
        lit = run.activeEffect == "beacon" and now < run.powerUntil,
        -- `safe` is what the HUD colours the ring readout with, so it has to
        -- agree with `protected` exactly. It used to be "am I on the rim",
        -- which is now only half the answer: the rim protects you while the
        -- meter lasts and not one second longer, and a HUD still saying SAFE
        -- while somebody eats you is worse than no HUD at all.
        safe = (now < run.safeUntil) or (WorldBuilder.isSafe(pos) and run.rimGrace > 0),
        -- The meter itself, so the player can watch it run out instead of
        -- discovering it did.
        rimGrace = run.rimGrace,
        rimGraceMax = Config.SHALLOWS_GRACE,
        onRim = WorldBuilder.isSafe(pos),
        ring = WorldBuilder.ringAt(pos),
        biome = (WorldBuilder.biomeAt(pos) or {}).name,
        best = run.bestMass,
        peak = run.peakThisRound,
        phase = phase,
        phaseLeft = math.max(0, phaseEndsAt - now),
        round = roundNumber,
        ceiling = Blob.ceiling(0.8),
        -- How big the field actually is, and how much of it is bots. Shown on
        -- the HUD rather than hidden: a player who works out for themselves
        -- that half the island is bots feels tricked, and a player who was
        -- told feels like the game is full.
        field = #Players:GetPlayers() + BotService.count(),
        bots = BotService.count(),
    }
end

--- Who a crumb is locked against, and until when.
---
--- Exposed because the lock is invisible from outside and therefore untestable
--- from outside: deflation drops belong to nobody for a few seconds except the
--- two blobs that made them, and the only way to tell one of those crumbs from
--- the fourteen hundred ambient pellets on the floor is to ask. A test that
--- guessed — "the newest part near the victim is probably a drop" — would be
--- wrong roughly as often as the respawn rate, which is forty-eight a second.
---
--- Read-only, and it returns nothing for a part that is not a live pellet.
function ArenaService.pelletLock(part: BasePart): (number?, number?, number)
    local p = pellets[part]
    if not p then
        return nil, nil, 0
    end
    return p.owner, p.owner2, p.ownerUntil
end

-- Exposed for tests: the island's live contents.
function ArenaService.stats()
    return {
        pellets = pelletCount,
        lumps = #lumps,
        bots = BotService.count(),
        botsAlive = #BotService.living(),
    }
end

return ArenaService
