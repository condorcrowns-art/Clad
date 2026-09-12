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
    powerReadyAt: number,
    powerUntil: number,
    activeEffect: string?,
    slamUntil: number,      -- airborne on a SLAM; the shockwave lands when it ends
    splitOwed: number,      -- mass thrown by SPLIT, part of which returns
    banking: number,
    leakBuffer: number,
    safeUntil: number,
    trinkets: Trinkets.Resolved,
    bestMass: number,
    lastPos: Vector3,
    startedAt: number,      -- for the run summary
    ateThisRun: number,
    uses: { [string]: number },   -- mastery counter, mirrored from the profile
}

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
type Pellet = { part: BasePart, value: number, key: string, owner: number?, ownerUntil: number }
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
    powerUses: (player: Player) -> { [string]: number },
    notePowerUse: (player: Player, id: string) -> (),
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

local function spawnPellet(at: Vector3?, value: number?, golden: boolean?, owner: number?)
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
        ownerUntil = owner and (os.clock() + OWNER_LOCKOUT) or 0,
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

-- ── Run state ──────────────────────────────────────────────────────────────

local function newRun(player: Player): Run
    local ids, powerId = deps.loadout(player)
    return {
        mass = Config.STARTING_MASS,
        powerId = Powers.get(powerId) and powerId or Powers.DEFAULT,
        powerReadyAt = 0,
        powerUntil = 0,
        activeEffect = nil,
        slamUntil = 0,
        splitOwed = 0,
        banking = 0,
        leakBuffer = 0,
        safeUntil = os.clock() + POP_INVULN,
        trinkets = Trinkets.resolve(ids),
        bestMass = Config.STARTING_MASS,
        lastPos = Vector3.zero,
        startedAt = os.clock(),
        ateThisRun = 0,
        uses = deps.powerUses(player),
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
    run.startedAt = os.clock()
    run.ateThisRun = 0
    run.bestMass = Config.BANK_RESET_MASS
    run.mass = Config.BANK_RESET_MASS
    run.banking = 0
    run.leakBuffer = 0
end

-- ── Powers ─────────────────────────────────────────────────────────────────

function ArenaService.usePower(player: Player, aim: Vector3?): (boolean, string?)
    local run = runs[player.UserId]
    if not run then
        return false, "You're not in the arena."
    end
    local now = os.clock()
    if now < run.powerReadyAt then
        return false, ("%.1fs"):format(run.powerReadyAt - now)
    end
    local power = Powers.get(run.powerId)
    if not power then
        return false, "No power equipped."
    end
    local uses = run.uses[run.powerId] or 0
    local cost = Powers.massCost(run.powerId, run.mass, uses)
    if run.mass - cost < Config.STARTING_MASS * 0.5 then
        return false, "Too small to pay for that."
    end
    local ball = RollService.ballFor(player)
    if not ball then
        return false, "No body."
    end

    run.mass -= cost
    run.powerReadyAt = now + Powers.cooldown(run.powerId, run.trinkets.powerHaste, uses)
    run.uses[run.powerId] = uses + 1
    deps.notePowerUse(player, run.powerId)
    run.powerUntil = now + math.max(0.05, power.duration)
    run.activeEffect = run.powerId

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

    if run.powerId == "dash" then
        ball.AssemblyLinearVelocity = dir * 110 + Vector3.new(0, 8, 0)
    elseif run.powerId == "slam" then
        ball.AssemblyLinearVelocity = Vector3.new(0, 74, 0) + dir * 24
        -- The impact is not instant: it lands when you do. tickPlayer watches
        -- slamUntil and fires the shockwave at the bottom of the arc, which is
        -- the only timing that reads as a slam rather than a shrug.
        run.slamUntil = now + SLAM_AIRTIME
    elseif run.powerId == "split" then
        ball.AssemblyLinearVelocity = dir * 128
        run.splitOwed = cost
    elseif run.powerId == "hook" then
        -- Reel. Bigger drags smaller toward it; smaller drags ITSELF toward
        -- bigger, which is what makes HOOK a chase tool for the hunter and an
        -- escape-the-open-ground tool for the hunted with the same button.
        local target, best = nil, HOOK_RANGE
        for _, other in ipairs(Players:GetPlayers()) do
            if other ~= player and runs[other.UserId] then
                local ob = RollService.ballFor(other)
                if ob and ob.Parent then
                    local d = (ob.Position - ball.Position).Magnitude
                    if d < best then target, best = other, d end
                end
            end
        end
        if target then
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
                    deps.effect(player, "hook", { to = target.DisplayName })
                end
            end
        end
    elseif run.powerId == "blink" then
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

    elseif run.powerId == "decoy" then
        spawnDecoy(player, run, ball.Position - dir * (radius * 2.2))

    elseif run.powerId == "siphon" then
        -- Drains the nearest blob BIGGER than you. The only power in the game
        -- that works exclusively upward: it is the comeback tool, so it has to
        -- be useless to whoever is already winning.
        local target, best = nil, SIPHON_RANGE
        for _, other in ipairs(Players:GetPlayers()) do
            local orun = other ~= player and runs[other.UserId]
            local ob = orun and RollService.ballFor(other)
            if ob and ob.Parent and orun.mass > run.mass then
                local d = (ob.Position - ball.Position).Magnitude
                if d < best then target, best = other, d end
            end
        end
        if target then
            local trun = runs[target.UserId]
            local drained = math.min(trun.mass * SIPHON_FRACTION, run.mass * 0.6)
            trun.mass = math.max(Config.STARTING_MASS, trun.mass - drained)
            run.mass += drained
            deps.notify(target, ("🩸 %s siphoned %s off you.")
                :format(player.DisplayName, Format.short(drained)), "bad")
            deps.effect(player, "siphon", { from = target.DisplayName, amount = drained })
        end

    elseif run.powerId == "magnet" or run.powerId == "beacon" then
        -- handled in tick while powerUntil holds
    end

    deps.effect(player, "power", { id = run.powerId, cost = cost })
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

    -- MELT. The one mechanic the whole game is built on: everything above the
    -- grace mass drips, and what drips becomes real food on the floor rather
    -- than a number going down. A big blob is a moving buffet, and everyone
    -- can see the trail.
    local leak = Blob.leakPerSecond(run.mass) * run.trinkets.leakMult * dt
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
                        local mine = pellet.owner == player.UserId and now < pellet.ownerUntil
                        local d = (part.Position - pos)
                        if not mine and d.Magnitude <= reach then
                            local worth = pellet.value * run.trinkets.pelletMult
                            if run.activeEffect == "beacon" and now < run.powerUntil then
                                worth *= 1 + BEACON_BONUS
                            end
                            run.mass += worth
                            run.ateThisRun += 1
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

    -- BANK. You have to actually stop, inside the dish, for the full count.
    -- Standing still in the most visible place on the island for three seconds
    -- while holding everything you own is the best moment the game has.
    local inVault = WorldBuilder.ringAt(pos) == "VAULT"
        and math.abs(pos.Y - Config.VAULT_HEIGHT) < 26
    local slow = ball.AssemblyLinearVelocity.Magnitude < BANK_MAX_SPEED
    if inVault and slow and run.mass > Config.BANK_RESET_MASS then
        run.banking += dt
        if run.banking >= Blob.bankSeconds(run.trinkets.bankHaste) then
            bank(player, run)
        end
    elseif run.banking > 0 then
        run.banking = math.max(0, run.banking - dt * 2)
    end

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
            if ob and ob.Parent then
                local away = ob.Position - pos
                local flat = Vector3.new(away.X, 0, away.Z)
                if flat.Magnitude < SLAM_RADIUS and flat.Magnitude > 0.01 then
                    local falloff = 1 - (flat.Magnitude / SLAM_RADIUS)
                    ob.AssemblyLinearVelocity = flat.Unit
                            * (SLAM_IMPULSE * falloff * orun.trinkets.knockbackMult)
                        + Vector3.new(0, 26 * falloff, 0)
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
                local sa = WorldBuilder.isSafe(ba.Position) or now < ra.safeUntil
                local sb = WorldBuilder.isSafe(bb.Position) or now < rb.safeUntil
                if not sa and not sb then
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
                                    eater, prey = prey, eater
                                end
                                local re = runs[eater.UserId]
                                local rp = runs[prey.UserId]
                                local bp = RollService.ballFor(prey)
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

function ArenaService.start(injected: Deps)
    deps = injected
    -- From here on the arena is the only thing that resizes a body.
    RollService.sizeOwnedByArena = true

    -- Seed the island so the first player does not arrive to an empty floor.
    for _ = 1, Config.PELLET_TARGET do
        spawnPellet(nil, nil, rng:NextNumber() < 0.012)
    end

    task.spawn(function()
        local last = os.clock()
        while true do
            task.wait(TICK)
            local now = os.clock()
            local dt = math.min(0.5, now - last)
            last = now

            local active: { Player } = {}
            for _, player in ipairs(Players:GetPlayers()) do
                local run = runs[player.UserId]
                if run then
                    tickPlayer(player, run, dt, now)
                    table.insert(active, player)
                    deps.sync(player, ArenaService.snapshot(player, run, now))
                end
            end

            tickCombat(active, now)
            topUpPellets(dt)
            decayLumps(dt)
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
        leak = Blob.leakPerSecond(run.mass) * run.trinkets.leakMult,
        harvest = Blob.harvestPerSecond(run.mass) * run.trinkets.pelletMult,
        worth = Blob.bankValue(run.mass),
        banking = run.banking,
        bankNeeds = Blob.bankSeconds(run.trinkets.bankHaste),
        powerId = run.powerId,
        powerCooldown = math.max(0, run.powerReadyAt - now),
        powerCost = Powers.massCost(run.powerId, run.mass, run.uses[run.powerId]),
        mastery = Powers.masteryTier(run.uses[run.powerId]),
        lit = run.activeEffect == "beacon" and now < run.powerUntil,
        safe = WorldBuilder.isSafe(pos) or now < run.safeUntil,
        ring = WorldBuilder.ringAt(pos),
        biome = (WorldBuilder.biomeAt(pos) or {}).name,
        best = run.bestMass,
        ceiling = Blob.ceiling(0.8),
    }
end

-- Exposed for tests: the island's live contents.
function ArenaService.stats()
    return { pellets = pelletCount, lumps = #lumps }
end

return ArenaService
