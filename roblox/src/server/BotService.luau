--!strict
-- BotService.luau — the rest of the field.
--
-- WHY THIS EXISTS. An arena game with three people in it is not a small
-- version of GOOP, it is a different and much worse one. Every system here
-- assumes a crowd: deflation is a catch-up tool that needs somebody to gang up
-- on a leader, the board needs places worth placing in, and the core loop —
-- always being able to see somebody bigger and somebody smaller — is simply
-- absent below about six contenders. A new game has three players in it for
-- weeks. Without bots, the first hour of this game's life is the version of it
-- that does not work, shown to exactly the people deciding whether to stay.
--
-- So a round always has Config.ROUND_FIELD_SIZE contenders and bots make up
-- the difference. Twelve humans, no bots. One human, eleven bots. Nobody at
-- all and the island still runs a real round with a real board, which is also
-- what makes the game demoable and testable end to end.
--
-- ── WHAT THIS MODULE OWNS AND WHAT IT DOES NOT ────────────────────────────
--
-- It owns bot BODIES and bot DECISIONS: where each one is, where it wants to
-- be, and the part you see. It does not own a single rule about mass. Eating,
-- deflation, popping and the board all stay in ArenaService, which resolves
-- bots and players through the same code paths. That split is deliberate and
-- load-bearing: the moment a bot gets its own eating rule, "can I beat that
-- thing" stops having one answer, and bots start being either free food or
-- unbeatable depending on which copy of the rule drifted.
--
-- Movement is KINEMATIC — a position integrated by hand, not a physics body.
-- Twelve unanchored balls being network-owned by the server is a genuine cost
-- on a Roblox server that is already simulating the players' bodies, and a bot
-- does not need momentum to be convincing. It needs to be in the right place
-- at the wrong time for you.

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local Blob = require(Shared.Blob)

local WorldBuilder = require(script.Parent.WorldBuilder)

local BotService = {}

export type Bot = {
    id: number,
    name: string,
    skill: any,
    mass: number,
    peak: number,
    pos: Vector3,
    heading: Vector3,
    goal: Vector3,
    mode: string,          -- feed | hunt | flee | wander
    nextThink: number,
    respawnAt: number,     -- 0 when alive
    rimGrace: number,
    committed: boolean,    -- has it ever left the rim; see Config.SHALLOWS_GRACE
    part: BasePart?,
    label: TextLabel?,
}

-- A contender as the brain sees it. Players and bots are handed in through the
-- same shape on purpose: a bot must not be able to tell which is which, or it
-- will play differently against humans and the difficulty stops being honest.
export type Contender = {
    key: string,
    mass: number,
    pos: Vector3,
    safe: boolean,         -- currently untouchable; not worth chasing
}

local bots: { Bot } = {}
local nextId = 1
local rng = Random.new(os.clock() * 1e6 // 1 + 7)
local folder: Folder?

local RESPAWN_DELAY = 3.5

-- ── Bodies ─────────────────────────────────────────────────────────────────

-- SIBLING OF THE ARENA FOLDER, NOT A CHILD OF IT.
--
-- The Arena folder is the pellet pool and several things treat it as exactly
-- that — "how much food is on the island" is `#arena:GetChildren()`, and the
-- harness walks it taking `child.Position` off every entry. Parenting bots
-- inside it put a Folder in that list, which has no Position, and turned an
-- honest pellet sweep into a crash. A pool should hold one kind of thing.
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
    f.Name = "Bots"
    f.Parent = world
    folder = f
    return f
end

local function makeBody(bot: Bot)
    local parent = ensureFolder()
    if not parent then
        return
    end
    local p = Instance.new("Part")
    p.Name = "Bot_" .. bot.name
    p.Shape = Enum.PartType.Ball
    p.Anchored = true
    -- CanCollide false and CanQuery false: a bot is resolved by distance in
    -- ArenaService, never by a touch event. A bot you could physically shove
    -- would be a second, contradictory answer to "what happens when we meet".
    p.CanCollide = false
    p.CanTouch = false
    p.CanQuery = false
    p.Material = Enum.Material.SmoothPlastic
    p.Color = Color3.fromHSV(rng:NextNumber(), 0.52, 0.92)
    local r = Blob.radius(bot.mass)
    p.Size = Vector3.new(1, 1, 1) * (r * 2)
    p.Position = bot.pos
    p.Parent = parent

    -- Named, and openly tagged as a bot. Pretending otherwise is a lie the
    -- player catches the first time one walks into a wall, and being caught
    -- lying costs more trust than the illusion was ever worth.
    local gui = Instance.new("BillboardGui")
    gui.Name = "Tag"
    gui.Size = UDim2.fromScale(9, 2)
    gui.StudsOffset = Vector3.new(0, r + 3, 0)
    gui.AlwaysOnTop = false
    gui.MaxDistance = 320
    local tl = Instance.new("TextLabel")
    tl.Size = UDim2.fromScale(1, 1)
    tl.BackgroundTransparency = 1
    tl.Font = Enum.Font.FredokaOne
    tl.TextScaled = true
    tl.TextStrokeTransparency = 0.35
    tl.TextColor3 = Color3.fromRGB(226, 232, 240)
    tl.Text = bot.name .. " 🤖"
    tl.Parent = gui
    gui.Parent = p

    bot.part = p
    bot.label = tl
end

local function destroyBody(bot: Bot)
    if bot.part then
        bot.part:Destroy()
        bot.part = nil
        bot.label = nil
    end
end

-- ── Spawning ───────────────────────────────────────────────────────────────

local function pickSkill()
    local total = 0
    for _, s in ipairs(Config.BOT_SKILLS) do
        total += s.weight
    end
    local roll = rng:NextNumber() * total
    for _, s in ipairs(Config.BOT_SKILLS) do
        roll -= s.weight
        if roll <= 0 then
            return s
        end
    end
    return Config.BOT_SKILLS[1]
end

-- Names must be unique within a round. A board with two "Gloop" rows on it
-- looks like a bug even when it is not, and the player cannot tell which one
-- just ate them.
local function pickName(): string
    local taken: { [string]: boolean } = {}
    for _, b in ipairs(bots) do
        taken[b.name] = true
    end
    local pool = {}
    for _, n in ipairs(Config.BOT_NAMES) do
        if not taken[n] then
            table.insert(pool, n)
        end
    end
    if #pool == 0 then
        return "Blob " .. nextId
    end
    return pool[rng:NextInteger(1, #pool)]
end

local function spawnPos(): Vector3
    local i = rng:NextInteger(1, Config.SPAWN_POINTS)
    return WorldBuilder.spawnPoint(i)
end

local function newBot(): Bot
    local skill = pickSkill()
    local pos = spawnPos()
    local bot: Bot = {
        id = nextId,
        name = pickName(),
        skill = skill,
        mass = Config.STARTING_MASS,
        peak = Config.STARTING_MASS,
        pos = pos,
        heading = Vector3.new(rng:NextNumber(-1, 1), 0, rng:NextNumber(-1, 1)).Unit,
        goal = pos,
        mode = "wander",
        nextThink = 0,
        respawnAt = 0,
        rimGrace = Config.SHALLOWS_GRACE,
        committed = false,
        part = nil,
        label = nil,
    }
    nextId += 1
    makeBody(bot)
    return bot
end

--- Bring the field up to `count` bots, or down to it. Called at the top of
--- every round with (field size - humans), so a player who joins mid-round
--- never evicts a bot that is already in play — the count is only corrected
--- when the slate is clean anyway.
function BotService.fill(count: number)
    count = math.max(0, math.floor(count))
    if not Config.BOTS_ENABLED then
        count = 0
    end
    while #bots > count do
        local b = table.remove(bots)
        if b then
            destroyBody(b)
        end
    end
    while #bots < count do
        table.insert(bots, newBot())
    end
end

function BotService.clear()
    for _, b in ipairs(bots) do
        destroyBody(b)
    end
    table.clear(bots)
end

function BotService.list(): { Bot }
    return bots
end

function BotService.count(): number
    return #bots
end

--- Alive bots only, which is what every caller outside this file actually
--- wants: a dead bot has no body, no position worth testing and no business
--- appearing on a leaderboard mid-respawn.
function BotService.living(): { Bot }
    local out = {}
    for _, b in ipairs(bots) do
        if b.respawnAt == 0 then
            table.insert(out, b)
        end
    end
    return out
end

--- Somebody ate this bot. It goes down and comes back, because a round that
--- empties out by minute two is the problem this module exists to solve.
function BotService.kill(bot: Bot, now: number)
    if bot.respawnAt ~= 0 then
        return
    end
    bot.respawnAt = now + RESPAWN_DELAY
    destroyBody(bot)
end

-- ── The brain ──────────────────────────────────────────────────────────────

local function clampToIsland(p: Vector3): Vector3
    local flat = Vector3.new(p.X, 0, p.Z)
    local r = flat.Magnitude
    local limit = Config.PELLET_OUTER
    if r > limit and r > 0 then
        flat = flat.Unit * limit
    end
    return Vector3.new(flat.X, p.Y, flat.Z)
end

-- Decide what this bot is doing for the next few hundred milliseconds.
--
-- Deliberately coarse. A bot that re-evaluates every frame with perfect
-- information is unloseable and reads as cheating rather than as skill; the
-- think interval is the gap a human plays through, and it is the main dial
-- between "dozy" and "feral".
local function think(bot: Bot, now: number, field: { Contender }, pelletAt: (Vector3, number) -> Vector3?)
    bot.nextThink = now + Config.BOT_THINK * bot.skill.think
    local sight = Config.BOT_SIGHT * bot.skill.sight

    local threat: Contender? = nil
    local threatDist = math.huge
    local prey: Contender? = nil
    local preyScore = -math.huge

    for _, c in ipairs(field) do
        local d = (Vector3.new(c.pos.X, 0, c.pos.Z) - Vector3.new(bot.pos.X, 0, bot.pos.Z)).Magnitude
        if d <= sight then
            -- Anything that can eat me, whether or not it has noticed me.
            if Blob.canEat(c.mass * Config.BOT_FEAR, bot.mass) then
                if d < threatDist then
                    threat, threatDist = c, d
                end
            elseif not c.safe and Blob.canEat(bot.mass * bot.skill.greed, c.mass) then
                -- Prefer the biggest meal that is also close. Mass over
                -- distance is the cheapest expression of "worth the walk".
                local score = c.mass / math.max(12, d)
                if score > preyScore then
                    prey, preyScore = c, score
                end
            end
        end
    end

    -- Fleeing wins over everything. A bot that trades a chase for its own life
    -- is a bot that is fun to bully, which is most of what a small player does.
    if threat then
        local away = Vector3.new(bot.pos.X - threat.pos.X, 0, bot.pos.Z - threat.pos.Z)
        if away.Magnitude < 1 then
            away = Vector3.new(rng:NextNumber(-1, 1), 0, rng:NextNumber(-1, 1))
        end
        bot.mode = "flee"
        bot.goal = clampToIsland(bot.pos + away.Unit * 120)
        return
    end

    if prey then
        bot.mode = "hunt"
        bot.goal = Vector3.new(prey.pos.X, bot.pos.Y, prey.pos.Z)
        return
    end

    -- Nothing to chase and nothing to run from: eat. A bot that only ever
    -- wandered would finish every round at starting mass and the board would
    -- read as a joke.
    if rng:NextNumber() > Config.BOT_WANDER then
        local food = pelletAt(bot.pos, Config.BOT_PELLET_SIGHT * bot.skill.sight)
        if food then
            bot.mode = "feed"
            bot.goal = Vector3.new(food.X, bot.pos.Y, food.Z)
            return
        end
    end

    bot.mode = "wander"
    local a = rng:NextNumber(0, math.pi * 2)
    local d = rng:NextNumber(70, 220)
    bot.goal = clampToIsland(bot.pos + Vector3.new(math.cos(a) * d, 0, math.sin(a) * d))
end

--- One step of every bot. `field` is every contender on the island INCLUDING
--- the bots themselves — a bot filters itself out by key, so callers never have
--- to build a different list per bot.
function BotService.step(dt: number, now: number, field: { Contender },
    pelletAt: (Vector3, number) -> Vector3?)

    for _, bot in ipairs(bots) do
        if bot.respawnAt ~= 0 then
            if now >= bot.respawnAt then
                bot.respawnAt = 0
                bot.mass = Config.STARTING_MASS
                bot.pos = spawnPos()
                bot.goal = bot.pos
                bot.mode = "wander"
                bot.nextThink = 0
                bot.rimGrace = Config.SHALLOWS_GRACE
                bot.committed = false
                makeBody(bot)
            end
        else
            if not bot.part or not bot.part.Parent then
                makeBody(bot)
            end

            -- The same rim meter players carry, because a bot that could camp
            -- the shoreline forever would be the exploit this round's design
            -- just removed, played back at the player by the game itself.
            if not WorldBuilder.isSafe(bot.pos) then
                bot.committed = true
                if bot.rimGrace < Config.SHALLOWS_GRACE then
                    bot.rimGrace = math.min(Config.SHALLOWS_GRACE,
                        bot.rimGrace + dt / Config.SHALLOWS_RECHARGE)
                end
            elseif bot.committed then
                bot.rimGrace = math.max(0, bot.rimGrace - dt)
            end

            local mine = "bot:" .. bot.id
            if now >= bot.nextThink then
                local others = {}
                for _, c in ipairs(field) do
                    if c.key ~= mine then
                        table.insert(others, c)
                    end
                end
                think(bot, now, others, pelletAt)
            end

            local to = Vector3.new(bot.goal.X - bot.pos.X, 0, bot.goal.Z - bot.pos.Z)
            if to.Magnitude > 1 then
                -- Turn towards the goal rather than snapping to it. The lerp is
                -- what stops a bot pivoting 180 degrees in one frame, which is
                -- the single most obvious tell that a thing is not a player.
                bot.heading = (bot.heading:Lerp(to.Unit, math.clamp(dt * 4, 0, 1))).Unit
            end
            local speed = Blob.speed(bot.mass) * Config.BOT_SPEED_MULT
            bot.pos = clampToIsland(bot.pos + bot.heading * speed * dt)

            local r = Blob.radius(bot.mass)
            bot.pos = Vector3.new(bot.pos.X, 2 + r, bot.pos.Z)
            if bot.mass > bot.peak then
                bot.peak = bot.mass
            end
            local part = bot.part
            if part then
                part.Size = Vector3.new(1, 1, 1) * (r * 2)
                part.Position = bot.pos
                local tag = part:FindFirstChild("Tag")
                if tag and tag:IsA("BillboardGui") then
                    tag.StudsOffset = Vector3.new(0, r + 3, 0)
                end
            end
        end
    end
end

return BotService
