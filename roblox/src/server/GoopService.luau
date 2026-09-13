--!strict
-- GoopService.luau — globlets, tethers and spore pods.
--
-- THE PART OF THIS GAME THAT IS NOT AGAR.IO.
--
-- Splitting is the genre's signature move, and copying it outright would make
-- this a worse agar with extra menus. So it is copied and then given one twist
-- that changes what the move is for.
--
-- A SPLIT throws three globlets forward. They are not a second body you steer
-- — that needs a second controller and a camera that can hold two things, and
-- it is most of why blob clones feel terrible on a phone. They fly out, hoover
-- pellets, and come home. You stay one blob, with one camera, on one thumb.
--
-- THE TETHER IS THE TWIST. Every globlet stays joined to you by a visible
-- strand of goo, and any blob that crosses a strand is deflated and slowed. A
-- split is therefore not only a lunge — it is three lines drawn across the
-- floor that everybody else has to go around. Split past someone and you have
-- fenced them in. Split while running and you have laid a wire behind you.
-- Split into a crowd and you hit all of it at once.
--
-- That turns "commit half of yourself to reach something" into "commit part of
-- yourself to CONTROL SPACE", which is a different decision, and one I cannot
-- find in any other blob game.
--
-- SPORE PODS are the hazard built on top of it. Touch one while you are big
-- and it bursts you into a whole web at once. You lose nothing to the pod
-- itself — the point is not a tax, it is that for a few seconds your tethers
-- are suddenly everywhere, which is dangerous for everyone nearby including
-- whoever herded you into it. Small blobs pass straight through, so a pod
-- field is somewhere the little ones can hide and the big ones cannot follow.
--
-- ── WHAT THIS MODULE OWNS ─────────────────────────────────────────────────
--
-- Positions and parts. It owns where a globlet is, where a pod is, and which
-- strands exist. It owns NO rule about mass: how much a tether takes, who it
-- may take from, and what happens to what it takes are all ArenaService's,
-- which resolves them for players and bots through the same code. The same
-- split that keeps BotService honest keeps this honest.

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local Blob = require(Shared.Blob)

local WorldBuilder = require(script.Parent.WorldBuilder)

local GoopService = {}

export type Globlet = {
    id: number,
    ownerId: number,       -- UserId, or a negative id for a bot
    mass: number,
    pos: Vector3,
    dir: Vector3,
    travelled: number,
    returning: boolean,
    bornAt: number,
    part: BasePart?,
    strand: BasePart?,
}

export type Pod = {
    id: number,
    pos: Vector3,
    readyAt: number,       -- 0 when standing; a timestamp while regrowing
    part: BasePart?,
}

local globlets: { Globlet } = {}
local pods: { Pod } = {}
local nextId = 1
local rng = Random.new(os.clock() * 1e6 // 1 + 31)
local folder: Folder?

-- Per (globlet, victim) so one strand cannot chain-hit the same blob every
-- tick. Keyed by globlet id and victim key; swept when a globlet dies.
local tetherHits: { [string]: number } = {}

-- ── Parts ──────────────────────────────────────────────────────────────────

local function ensureFolder(): Folder?
    if folder and folder.Parent then
        return folder
    end
    local arena = WorldBuilder.arenaFolder()
    local world = arena and arena.Parent
    if not world then
        return nil
    end
    local f = Instance.new("Folder")
    f.Name = "Goop"
    f.Parent = world
    folder = f
    return f
end

local function makeGlobletParts(g: Globlet, tint: Color3)
    local parent = ensureFolder()
    if not parent then
        return
    end
    local r = math.max(2, Blob.radius(g.mass) * 0.55)

    local p = Instance.new("Part")
    p.Name = "Globlet"
    p.Shape = Enum.PartType.Ball
    p.Size = Vector3.new(1, 1, 1) * (r * 2)
    p.Anchored = true
    -- Resolved by distance in ArenaService, never by a touch event. A globlet
    -- that could be physically shoved would be a second, contradictory answer
    -- to "what happens when we meet".
    p.CanCollide = false
    p.CanTouch = false
    p.CanQuery = false
    p.Material = Enum.Material.Neon
    p.Color = tint
    p.Position = g.pos
    p.Parent = parent
    g.part = p

    -- THE STRAND. One thin neon box stretched between the body and the
    -- globlet, re-aimed every tick. A Beam would look better and cannot be
    -- used: the hit test has to agree with what the player sees, and a Beam's
    -- curve has no server-side geometry to test against. A straight box is
    -- exactly the segment the maths uses, so what looks like a wire IS the
    -- wire.
    local strand = Instance.new("Part")
    strand.Name = "Strand"
    strand.Anchored = true
    strand.CanCollide = false
    strand.CanTouch = false
    strand.CanQuery = false
    strand.Material = Enum.Material.Neon
    strand.Color = tint
    strand.Transparency = 0.25
    strand.Size = Vector3.new(1, 1, 1)
    strand.Parent = parent
    g.strand = strand
end

local function destroyGloblet(g: Globlet)
    if g.part then g.part:Destroy() end
    if g.strand then g.strand:Destroy() end
    g.part = nil
    g.strand = nil
    for key in pairs(tetherHits) do
        if key:sub(1, #tostring(g.id) + 1) == tostring(g.id) .. ":" then
            tetherHits[key] = nil
        end
    end
end

-- ── Globlets ───────────────────────────────────────────────────────────────

--- Throw `count` globlets out of a body. Returns the total mass committed, so
--- the caller — which owns mass — can take it off the thrower.
---
--- `spreadScale` widens the fan for a pod burst, which throws in every
--- direction rather than in a cone.
function GoopService.split(ownerId: number, from: Vector3, facing: Vector3,
    massEach: number, count: number, tint: Color3, fullCircle: boolean?): number

    if massEach <= 0 or count <= 0 then
        return 0
    end
    local flat = Vector3.new(facing.X, 0, facing.Z)
    flat = flat.Magnitude > 0.01 and flat.Unit or Vector3.new(0, 0, 1)

    local committed = 0
    for i = 1, count do
        local angle
        if fullCircle then
            angle = (math.pi * 2 / count) * (i - 1) + rng:NextNumber(-0.12, 0.12)
        else
            -- Centred fan. With three pieces that is one straight ahead and
            -- one to each side, which is the shape that both reaches furthest
            -- and draws the widest fence.
            local mid = (count + 1) / 2
            angle = (i - mid) * Config.SPLIT_SPREAD
        end
        local dir = Vector3.new(
            flat.X * math.cos(angle) - flat.Z * math.sin(angle), 0,
            flat.X * math.sin(angle) + flat.Z * math.cos(angle)).Unit

        local g: Globlet = {
            id = nextId,
            ownerId = ownerId,
            mass = massEach,
            pos = from + dir * 4,
            dir = dir,
            travelled = 0,
            returning = false,
            bornAt = os.clock(),
            part = nil,
            strand = nil,
        }
        nextId += 1
        makeGlobletParts(g, tint)
        table.insert(globlets, g)
        committed += massEach
    end
    return committed
end

function GoopService.list(): { Globlet }
    return globlets
end

function GoopService.countFor(ownerId: number): number
    local n = 0
    for _, g in ipairs(globlets) do
        if g.ownerId == ownerId then n += 1 end
    end
    return n
end

--- Drop every globlet belonging to one owner without paying anything back.
--- Used when its body dies: a tether with nothing on the end of it is a wire
--- to nowhere, and leaving them alive would let a dead player keep fencing.
function GoopService.clearOwner(ownerId: number)
    for i = #globlets, 1, -1 do
        if globlets[i].ownerId == ownerId then
            destroyGloblet(globlets[i])
            table.remove(globlets, i)
        end
    end
end

function GoopService.clear()
    for _, g in ipairs(globlets) do
        destroyGloblet(g)
    end
    table.clear(globlets)
    table.clear(tetherHits)
end

--- Has this strand already hit this victim recently?
function GoopService.canHit(g: Globlet, victimKey: string, now: number): boolean
    local key = g.id .. ":" .. victimKey
    if (tetherHits[key] or 0) > now then
        return false
    end
    tetherHits[key] = now + Config.TETHER_COOLDOWN
    return true
end

--- Distance from a point to the strand segment (body -> globlet), in the
--- ground plane. Height is ignored on purpose: a tether is a fence, and a
--- fence you could hop by being briefly airborne would be a fence nobody
--- respects.
function GoopService.distanceToStrand(g: Globlet, bodyPos: Vector3, at: Vector3): number
    local a = Vector2.new(bodyPos.X, bodyPos.Z)
    local b = Vector2.new(g.pos.X, g.pos.Z)
    local p = Vector2.new(at.X, at.Z)
    local ab = b - a
    local len2 = ab.X * ab.X + ab.Y * ab.Y
    if len2 < 1e-4 then
        return (p - a).Magnitude
    end
    local t = math.clamp(((p.X - a.X) * ab.X + (p.Y - a.Y) * ab.Y) / len2, 0, 1)
    local closest = a + ab * t
    return (p - closest).Magnitude
end

--- Advance every globlet. `bodyOf` hands back where a given owner's body is,
--- or nil if it no longer has one. Returns a list of globlets that came home,
--- so the caller can pay their mass back.
function GoopService.step(dt: number, now: number,
    bodyOf: (number) -> Vector3?): { Globlet }

    local returned = {}
    for i = #globlets, 1, -1 do
        local g = globlets[i]
        local home = bodyOf(g.ownerId)
        if not home then
            -- Its body is gone. The mass goes with it; ArenaService has
            -- already scattered whatever a death owes the floor.
            destroyGloblet(g)
            table.remove(globlets, i)
        else
            local speed = Config.SPLIT_SPEED
            if g.returning then
                local toHome = Vector3.new(home.X - g.pos.X, 0, home.Z - g.pos.Z)
                if toHome.Magnitude <= speed * dt + 4 then
                    table.insert(returned, g)
                    destroyGloblet(g)
                    table.remove(globlets, i)
                    continue
                end
                g.dir = toHome.Unit
            else
                g.travelled += speed * dt
                if g.travelled >= Config.SPLIT_RANGE then
                    g.returning = true
                end
            end

            local nextPos = g.pos + g.dir * speed * dt
            local flat = Vector3.new(nextPos.X, 0, nextPos.Z)
            -- Never off the island, and never through the Vault plinth.
            if flat.Magnitude > Config.PELLET_OUTER then
                flat = flat.Unit * Config.PELLET_OUTER
                g.returning = true
            end
            local r = math.max(2, Blob.radius(g.mass) * 0.55)
            g.pos = Vector3.new(flat.X, 2 + r, flat.Z)

            local part = g.part
            local strand = g.strand
            if part then
                part.Size = Vector3.new(1, 1, 1) * (r * 2)
                part.Position = g.pos
            end
            if strand then
                local mid = (home + g.pos) / 2
                local span = g.pos - home
                local len = span.Magnitude
                if len > 0.5 then
                    strand.Size = Vector3.new(Config.TETHER_WIDTH * 0.8, 1.2, len)
                    strand.CFrame = CFrame.lookAt(mid, g.pos)
                else
                    strand.Size = Vector3.new(0.1, 0.1, 0.1)
                end
            end
        end
    end
    return returned
end

-- ── Spore pods ─────────────────────────────────────────────────────────────

local function makePodPart(pod: Pod)
    local parent = ensureFolder()
    if not parent then
        return
    end
    local p = Instance.new("Part")
    p.Name = "SporePod"
    p.Shape = Enum.PartType.Ball
    p.Size = Vector3.new(1, 1, 1) * (Config.POD_RADIUS * 2)
    p.Anchored = true
    p.CanCollide = false
    p.CanTouch = false
    p.CanQuery = false
    p.Material = Enum.Material.Neon
    -- WHITE, like everything else that is not a player. The island's palette
    -- is greyscale so that the blobs — which are the only saturated things in
    -- the world — read instantly against it.
    p.Color = Color3.fromRGB(238, 238, 240)
    p.Transparency = 0.15
    p.Position = pod.pos
    p.Parent = parent

    -- Spikes, so it reads as "do not touch" from across the island rather than
    -- as a big friendly pellet.
    for i = 1, 10 do
        local a = (math.pi * 2 / 10) * i
        local spike = Instance.new("Part")
        spike.Name = "Spike"
        spike.Size = Vector3.new(1.6, 1.6, Config.POD_RADIUS * 0.9)
        spike.Anchored = true
        spike.CanCollide = false
        spike.CanTouch = false
        spike.CanQuery = false
        spike.Material = Enum.Material.Neon
        spike.Color = Color3.fromRGB(238, 238, 240)
        spike.CFrame = CFrame.new(pod.pos)
            * CFrame.Angles(0, a, 0)
            * CFrame.new(0, 0, -Config.POD_RADIUS)
        spike.Parent = p
    end
    pod.part = p
end

function GoopService.seedPods()
    for _, pod in ipairs(pods) do
        if pod.part then pod.part:Destroy() end
    end
    table.clear(pods)
    for i = 1, Config.POD_COUNT do
        -- Well inside the Flats: a pod on the rim would be unreachable for the
        -- big blobs it exists to threaten, since their rim meter runs out.
        local pos = WorldBuilder.randomSurfacePoint(rng,
            Config.VAULT_RADIUS + 60, Config.SHALLOWS_INNER - 40)
        local pod: Pod = {
            id = i,
            pos = Vector3.new(pos.X, 2 + Config.POD_RADIUS, pos.Z),
            readyAt = 0,
            part = nil,
        }
        makePodPart(pod)
        table.insert(pods, pod)
    end
end

function GoopService.pods(): { Pod }
    return pods
end

--- Mark a pod as spent. It regrows in POD_RESPAWN seconds, in the same place:
--- a hazard that moved would be impossible to play around, and playing around
--- them is the whole point of putting them there.
function GoopService.spendPod(pod: Pod, now: number)
    pod.readyAt = now + Config.POD_RESPAWN
    if pod.part then
        pod.part:Destroy()
        pod.part = nil
    end
end

function GoopService.regrowPods(now: number)
    for _, pod in ipairs(pods) do
        if pod.readyAt > 0 and now >= pod.readyAt then
            pod.readyAt = 0
            makePodPart(pod)
        end
    end
end

function GoopService.clearPods()
    for _, pod in ipairs(pods) do
        if pod.part then pod.part:Destroy() end
        pod.part = nil
    end
    table.clear(pods)
end

return GoopService
