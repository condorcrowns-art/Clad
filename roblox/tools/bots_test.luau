--!nolint
-- bots_test.luau — the rest of the field.
--
-- WHAT THIS SUITE IS FOR. An arena game with three people in it is a different
-- and much worse game than the one that was designed: nobody to run from,
-- nobody to gang up on, and a leader nothing brings down because deflation
-- needs a crowd. Bots exist so that the FIRST hour of this game's life — when
-- there are three players on the platform — is the game rather than an empty
-- island. That makes them load-bearing, not decoration, and the way a
-- decorative bot fails is silently: it stands still, it never eats, it never
-- appears on the board, and nobody notices for a month.
--
-- So every check below is about a bot doing something, never about a bot
-- existing.

local svc, env = _G.SVC, _G.ENV
local V3 = env.Vector3
local sched = env.scheduler

local fails = 0
local function check(l, c, d)
    if c then emit(("  ok    %s"):format(l))
    else fails += 1; emit(("  FAIL  %s   %s"):format(l, d or "")) end
end
local function tick(sec, dt)
    dt = dt or 0.25
    for _ = 1, math.floor(sec / dt) do
        sched.step(dt); svc.heartbeat(dt); svc.renderStep(dt)
    end
end

_G.BOOT_SERVER()
tick(1)

local Config = _G.SHARED("Config")
local Blob = _G.SHARED("Blob")
local Arena = _G.SERVER("ArenaService")
local Bots = _G.SERVER("BotService")

local function arenaOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "ArenaSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
end
local function phaseOf(p) return (arenaOf(p) or {}).phase end
local function waitFor(p, want, budget)
    for _ = 1, math.floor((budget or 300) / 0.5) do
        if phaseOf(p) == want then return true end
        tick(0.5)
    end
    return phaseOf(p) == want
end
local function ballOf(p) return svc.Workspace:FindFirstChild("GoobBall_" .. p.UserId) end

-- MOVE WITHOUT BEING TELEPORTED BACK.
--
-- Writing a distant position straight onto a ball looks exactly like a client
-- teleporting itself, and after a few of those the server snaps it back to a
-- spawn point — 435 studs out on the rim. Placing it at a height its own body
-- does not clear drops it through the floor, and the fall rescue does the same
-- thing. Either way the test ends up measuring a blob that is nowhere near
-- where it was put, which is how a SLAM that works perfectly reported zero
-- hits on three bots parked on top of it.
local function walkTo(p, dest)
    for _ = 1, 200 do
        local b = ballOf(p)
        if not b then return end
        local here = V3.new(b.Position.X, 0, b.Position.Z)
        local there = V3.new(dest.X, 0, dest.Z)
        local delta = there - here
        local lift = math.max(10, b.Size.X / 2 + 4)
        if delta.Magnitude <= 20 then
            svc.movePlayer(p, V3.new(dest.X, lift, dest.Z))
            b.Position = V3.new(dest.X, lift, dest.Z)
            b.AssemblyLinearVelocity = V3.new(0, 0, 0)
            tick(0.25)
            return
        end
        local step = here + delta.Unit * 20
        svc.movePlayer(p, V3.new(step.X, lift, step.Z))
        b.Position = V3.new(step.X, lift, step.Z)
        b.AssemblyLinearVelocity = V3.new(0, 0, 0)
        tick(0.25)
    end
end

--- Where a blob actually IS, which is not always where it was sent.
local function whereIs(p)
    local b = ballOf(p)
    return b and b.Position or V3.new(0, 0, 0)
end

emit("══ A ROUND WITH NOBODY IN IT STILL HAPPENS ══")
-- THE HARDEST CASE, AND THE ONE THAT MATTERS MOST ON LAUNCH DAY. An empty
-- server has to be running a real round with a real field, or the first player
-- through the door arrives into a lobby with a countdown and nothing else.
do
    -- Drive the phase machine without any player at all.
    for _ = 1, math.floor((Config.INTERMISSION_SECONDS + 8) / 0.5) do
        tick(0.5)
        if Arena.phase() == "PLAYING" then break end
    end
    check("the round machine reached PLAYING with zero players",
        Arena.phase() == "PLAYING", tostring(Arena.phase()))
    check("and the island filled itself with a full field of bots",
        Bots.count() == Config.ROUND_FIELD_SIZE,
        ("%d of %d"):format(Bots.count(), Config.ROUND_FIELD_SIZE))
end

emit("")
emit("══ THE FIELD IS EXACTLY ROUND_FIELD_SIZE, HOWEVER MANY HUMANS SHOW UP ══")
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 60))
tick(3)
check("one human means one fewer bot next round",
    waitFor(alice, "LOBBY", 320) and waitFor(alice, "PLAYING", 320)
        and Bots.count() == Config.ROUND_FIELD_SIZE - 1,
    ("%d bots, %d humans"):format(Bots.count(), #svc.Players:GetPlayers()))

local bob = svc.addPlayer("Bob", 202, V3.new(30, 5, 60))
tick(3)
check("two humans means two fewer",
    waitFor(alice, "LOBBY", 320) and waitFor(alice, "PLAYING", 320)
        and Bots.count() == Config.ROUND_FIELD_SIZE - 2,
    ("%d bots, %d humans"):format(Bots.count(), #svc.Players:GetPlayers()))
check("so the field is always the same size",
    Bots.count() + #svc.Players:GetPlayers() == Config.ROUND_FIELD_SIZE,
    ("%d + %d"):format(Bots.count(), #svc.Players:GetPlayers()))

emit("")
emit("══ BOTS PLAY: THEY MOVE, THEY EAT, THEY GROW ══")
-- A bot that stands at its spawn point and finishes the round at starting mass
-- is worse than no bot: it puts a name on the board that makes the field look
-- padded rather than populated.
do
    local before = {}
    for _, b in ipairs(Bots.living()) do
        before[b.id] = { pos = b.pos, mass = b.mass }
    end
    check("there are bots to watch", next(before) ~= nil)

    tick(30)

    local moved, grew, total = 0, 0, 0
    for _, b in ipairs(Bots.living()) do
        local was = before[b.id]
        if was then
            total += 1
            if (b.pos - was.pos).Magnitude > 20 then moved += 1 end
            if b.mass > was.mass + 1 then grew += 1 end
        end
    end
    check("most bots actually moved", moved >= math.max(1, math.floor(total * 0.6)),
        ("%d of %d moved"):format(moved, total))
    check("most bots actually ate", grew >= math.max(1, math.floor(total * 0.5)),
        ("%d of %d grew"):format(grew, total))

    -- AND THE FOOD THEY ATE LEFT THE ISLAND. A bot that gains mass without
    -- removing pellets is printing food out of nothing, which would quietly
    -- inflate the whole economy and make the pellet respawn rate meaningless.
    local pellets = Arena.stats().pellets
    check("the island's pellet count is finite and bounded",
        pellets > 0 and pellets <= Config.PELLET_TARGET + 260, tostring(pellets))
end

emit("")
emit("══ BOTS ARE BEATABLE AND DANGEROUS ON THE SAME TERMS AS A PLAYER ══")
-- The rule that must NOT have a second copy: Blob.canEat. If a bot ate on
-- different terms from a player, the game would be teaching a rule against
-- bots that then fails the player against a human.
do
    local run = Arena.runFor(alice)
    check("Alice is in a run", run ~= nil)
    if run then
        -- A BIG Alice next to a small bot: she should swallow it.
        local victim = Bots.living()[1]
        check("there is a bot to eat", victim ~= nil)
        if victim then
            victim.mass = Config.STARTING_MASS
            victim.rimGrace = 0
            victim.committed = true
            run.mass = Config.STARTING_MASS * 40
            run.safeUntil = 0
            run.rimGrace = 0
            run.committed = true
            walkTo(alice, V3.new(0, 10, 150))
            local here = whereIs(alice)
            check("precondition: Alice is where she was sent",
                V3.new(here.X - 0, 0, here.Z - 150).Magnitude < 30,
                tostring(here))
            -- Placed at HER position, not at the one she was asked to go to.
            victim.pos = V3.new(here.X, here.Y, here.Z)
            local id, massBefore = victim.id, run.mass
            local mark = #_G.TRAFFIC
            tick(1)

            local stillAlive = false
            for _, b in ipairs(Bots.living()) do
                if b.id == id then stillAlive = true end
            end
            -- ASSERTED ON THE EVENT SENT TO ALICE. "The bot is gone" is also
            -- true when another bot ate it, and on a field of eleven that
            -- happens constantly — the check would pass with Alice on the
            -- other side of the island.
            local ateIt = false
            for i = mark + 1, #_G.TRAFFIC do
                local t = _G.TRAFFIC[i]
                if t.remote == "Effect" and t.args[1] == "ate"
                    and t.player ~= "ALL" and t.player.Name == "Alice" then
                    ateIt = true
                end
            end
            check("a much bigger player swallows a bot", ateIt and not stillAlive,
                ("effect=%s alive=%s"):format(tostring(ateIt), tostring(stillAlive)))
            check("and gains mass for it", (Arena.runFor(alice) or {}).mass > massBefore,
                ("%.0f -> %.0f"):format(massBefore, (Arena.runFor(alice) or {}).mass))
        end
    end
end

do
    -- And the other way round: a big bot eats a small player.
    local run = Arena.runFor(bob)
    local hunter = Bots.living()[1]
    check("there is a bot to be eaten by", hunter ~= nil and run ~= nil)
    if hunter and run then
        hunter.mass = Config.STARTING_MASS * 60
        hunter.rimGrace = 0
        hunter.committed = true
        run.mass = Config.STARTING_MASS
        run.safeUntil = 0
        run.rimGrace = 0
        run.committed = true
        run.activeEffect = nil
        walkTo(bob, V3.new(0, 10, -150))
        local here = whereIs(bob)
        check("precondition: Bob is where he was sent",
            V3.new(here.X - 0, 0, here.Z + 150).Magnitude < 30, tostring(here))
        hunter.pos = V3.new(here.X, here.Y, here.Z)
        local mark = #_G.TRAFFIC
        tick(1)
        -- ASSERTED ON THE POP, NOT ON THE MASS. Checking "is Bob small now"
        -- passes just as happily when nothing happened at all — he was set to
        -- starting mass a line above — and fails when he respawns and eats two
        -- pellets before the check runs. The pop effect is the event itself.
        local popped = false
        for i = mark + 1, #_G.TRAFFIC do
            local t = _G.TRAFFIC[i]
            if t.remote == "Effect" and t.args[1] == "pop"
                and t.player ~= "ALL" and t.player.Name == "Bob" then
                popped = true
            end
        end
        check("a much bigger bot swallows a player", popped,
            ("mass now %s"):format(tostring((Arena.runFor(bob) or {}).mass)))
        check("and the bot grew by eating him", hunter.mass > Config.STARTING_MASS * 60,
            tostring(hunter.mass))
    end
end

emit("")
emit("══ A BOT THAT DIES COMES BACK ══")
-- A round that empties out by minute two is the problem this whole module
-- exists to solve, so death has to be temporary.
do
    local victim = Bots.living()[1]
    check("there is a bot to kill", victim ~= nil)
    if victim then
        local id = victim.id
        -- Fattened first, so "came back small" is a real statement. A bot that
        -- was already at starting mass proves nothing by being at starting mass
        -- afterwards.
        victim.mass = Config.STARTING_MASS * 200
        local fat = victim.mass
        Bots.kill(victim, os.clock())
        local downNow = true
        for _, b in ipairs(Bots.living()) do
            if b.id == id then downNow = false end
        end
        check("killing it takes it off the island immediately", downNow)
        -- Sampled in small steps and read AT THE MOMENT it reappears. Ticking
        -- eight seconds and then measuring gives a bot that has been feeding
        -- for four of them, and "is it at starting size" fails for a reason
        -- that has nothing to do with respawning.
        local back, massOnReturn = false, nil
        for _ = 1, 40 do
            tick(0.25)
            for _, b in ipairs(Bots.living()) do
                if b.id == id and not back then
                    back, massOnReturn = true, b.mass
                end
            end
            if back then break end
        end
        check("and it is back a few seconds later", back)
        -- Allowed a couple of pellets of slack. A bot is fed by the same
        -- sweep a player is, on the first tick it exists, so demanding exactly
        -- STARTING_MASS tests the scheduler rather than the respawn.
        check("at starting size, like everybody else",
            massOnReturn ~= nil
                and massOnReturn <= Config.STARTING_MASS + Config.PELLET_VALUE * 3
                and massOnReturn < fat * 0.1,
            ("%s, was %s"):format(tostring(massOnReturn), tostring(fat)))
    end
end

emit("")
emit("══ ABILITIES DEFLATE BOTS ══")
-- The catch-up loop is the reason deflation exists. On a field that is mostly
-- bots, a SLAM that passed straight through eleven of the twelve things on the
-- island would make the game's comeback mechanic look broken in exactly the
-- servers where it matters most.
do
    local profile = _G.SERVER("Data").get(alice)
    if profile then profile.lifetimeBanked = 1e9 end
    svc.fireAs("SetPower", alice, "slam")
    tick(0.5)
    local run = Arena.runFor(alice)
    if run then
        run.mass = 4000
        run.powerReadyAt = 0
        run.safeUntil = 0
        run.committed = true
        run.rimGrace = 0
    end
    walkTo(alice, V3.new(0, 10, 100))
    local spot = whereIs(alice)
    check("precondition: Alice is on contested ground where she was sent",
        V3.new(spot.X, 0, spot.Z).Magnitude < Config.SHALLOWS_INNER, tostring(spot))

    -- BOTS HELD STILL FOR THE DURATION. A SLAM hangs in the air for most of a
    -- second before it lands, and the shockwave is resolved against wherever
    -- everything is AT THAT MOMENT — so bots parked next to Alice have long
    -- since wandered off by the time it arrives, and the test measures a power
    -- that missed rather than a power that does not work. Speed is tuning, so
    -- it is turned down for this block and restored after.
    local realSpeed = Config.BOT_SPEED_MULT
    Config.BOT_SPEED_MULT = 0

    -- Park three bots right on top of her, fat, and outside the rim.
    -- CLOSE IN SIZE TO ALICE, DELIBERATELY. At 3,000 against her 4,000 she
    -- simply ATE all three on the first tick — Blob.canEat needs a 1.15 ratio
    -- and 1.33 clears it — so the slam landed on an empty patch of ground and
    -- the test reported a working power as broken. Within 15% of her, nobody
    -- can swallow anybody and the only thing that can change a mass here is
    -- the shockwave.
    local targets = {}
    for i, b in ipairs(Bots.living()) do
        if i <= 3 then
            b.mass = 3700
            b.pos = spot + V3.new(i * 8, 0, 0)
            b.rimGrace = 0
            b.committed = true
            table.insert(targets, { bot = b, mass = b.mass })
        end
    end
    check("three bots are in the blast radius", #targets == 3)
    check("and none of them can be eaten instead, which would hide the result",
        (function()
            for _, t in ipairs(targets) do
                if Blob.canEat(4000, t.mass) or Blob.canEat(t.mass, 4000) then
                    return false
                end
            end
            return true
        end)())

    local world = svc.Workspace:FindFirstChild("GoobWorld")
    local arena = world and world:FindFirstChild("Arena")
    local function foodNear(at, r)
        local n = 0
        for _, d in ipairs(arena:GetChildren()) do
            if (d.Name == "Pellet" or d.Name == "Crumb")
                and (d.Position - at).Magnitude < r then
                n += 1
            end
        end
        return n
    end
    -- COUNTED BEFORE AND AFTER, in a TIGHT radius. "Are there pellets near
    -- here" is true on any square foot of this island — the floor is carpeted
    -- with 1,400 of them — so an absolute count would pass whether or not the
    -- slam dropped a single crumb.
    local foodBefore = foodNear(spot, 40)

    svc.fireAs("UsePower", alice, V3.new(0, 0, 1))
    tick(2.5)   -- SLAM hangs in the air before it lands

    local hit = 0
    for _, t in ipairs(targets) do
        if t.bot.mass < t.mass - 1 then hit += 1 end
    end
    check("SLAM deflated every bot it landed on", hit == 3, ("%d of 3"):format(hit))

    -- ...AND THE MASS IT TOOK BECAME FOOD. Deflation is a catch-up mechanic
    -- precisely because what comes off the leader lands on the floor for
    -- everyone else. If it simply vanished, hitting the leader would be pure
    -- denial rather than a comeback.
    -- More than a couple. The island respawns 36 pellets a second across a
    -- 454-stud disc, so one or two landing inside a 40-stud circle over two and
    -- a half seconds is ordinary drift, not evidence. Three deflations of 10%
    -- of 3,700 return several hundred mass in chunks, which is many crumbs.
    check("and what came off them landed on the floor as food",
        foodNear(spot, 40) >= foodBefore + 5,
        ("%d -> %d"):format(foodBefore, foodNear(spot, 40)))

    Config.BOT_SPEED_MULT = realSpeed
end

emit("")
emit("══ BOTS ARE ON THE BOARD, AND PAID NOTHING ══")
do
    check("the round ends", waitFor(alice, "RESULTS", 320), tostring(phaseOf(alice)))
    local results = Arena.results()
    check("the board holds the whole field", #results == Config.ROUND_FIELD_SIZE,
        ("%d of %d"):format(#results, Config.ROUND_FIELD_SIZE))
    local bots, humans, paidBots = 0, 0, 0
    local names = {}
    local duplicateName = false
    for _, row in ipairs(results) do
        if row.bot then
            bots += 1
            if (row.payout or 0) ~= 0 then paidBots += 1 end
            if names[row.name] then duplicateName = true end
            names[row.name] = true
        else
            humans += 1
        end
    end
    check("both humans placed", humans == 2, tostring(humans))
    check("and every bot placed", bots == Config.ROUND_FIELD_SIZE - 2, tostring(bots))
    check("no bot was paid", paidBots == 0, tostring(paidBots))
    -- Two rows reading "Gloop" looks like a bug even when it is not, and the
    -- player cannot tell which one just ate them.
    check("every bot on the board has a distinct name", not duplicateName)
    check("the board is sorted biggest first",
        (function()
            for i = 2, #results do
                if results[i].mass > results[i - 1].mass + 0.001 then return false end
            end
            return true
        end)())
end

emit("")
emit("══ THE ISLAND EMPTIES BETWEEN ROUNDS ══")
check("the lobby comes round", waitFor(alice, "LOBBY", 320), tostring(phaseOf(alice)))
check("and every bot is gone with the round", Bots.count() == 0, tostring(Bots.count()))
do
    local world = svc.Workspace:FindFirstChild("GoobWorld")
    local folder = world and world:FindFirstChild("Bots")
    local bodies = folder and #folder:GetChildren() or 0
    check("no bot bodies are left in the world either", bodies == 0, tostring(bodies))
    -- The Arena folder is the PELLET pool. A Folder in it has no Position, and
    -- putting one there turned every pellet sweep in the harness into a crash.
    local arena = world and world:FindFirstChild("Arena")
    local strays = 0
    for _, d in ipairs(arena and arena:GetChildren() or {}) do
        if not d:IsA("BasePart") then strays += 1 end
    end
    check("the pellet pool holds nothing but parts", strays == 0, tostring(strays))
end

emit("")
emit("══ BOTS CAN BE TURNED OFF ══")
-- One switch, and the game is the multiplayer-only version it was before. If
-- this does not work, there is no way to run a real-players-only server.
do
    Config.BOTS_ENABLED = false
    check("the next round has no bots at all",
        waitFor(alice, "PLAYING", 320) and Bots.count() == 0, tostring(Bots.count()))
    Config.BOTS_ENABLED = true
end

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL BOT CHECKS PASSED" or (fails .. " FAILURE(S)")))
if fails > 0 then error(fails .. " bot failure(s)") end
