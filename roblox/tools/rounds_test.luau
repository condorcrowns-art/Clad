--!nolint
-- rounds_test.luau — the round machine and the deflation that replaced melt.

local svc, env = _G.SVC, _G.ENV
local V3 = env.Vector3
local sched = env.scheduler

local fails = 0
local function check(label, cond, detail)
    if cond then emit(("  ok    %s"):format(label))
    else fails += 1; emit(("  FAIL  %s   %s"):format(label, detail or "")) end
end
local function tick(sec, dt)
    dt = dt or 0.25
    for _ = 1, math.floor(sec / dt) do
        sched.step(dt); svc.heartbeat(dt); svc.renderStep(dt)
    end
end

_G.BOOT_SERVER()
tick(1)
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 60))
local bob   = svc.addPlayer("Bob", 202, V3.new(24, 5, 60))
tick(3)

local Config = _G.SHARED("Config")
local world = svc.Workspace:FindFirstChild("GoobWorld")
local arena = world:FindFirstChild("Arena")

local function ballOf(p) return svc.Workspace:FindFirstChild("GoobBall_" .. p.UserId) end
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
    for _ = 1, math.floor((budget or 260) / 0.5) do
        if phaseOf(p) == want then return true end
        tick(0.5)
    end
    return phaseOf(p) == want
end
-- Move without tripping the anti-cheat. Writing a distant position straight
-- onto a ball looks exactly like a client teleporting itself, and after three
-- of those the server snaps it back — so a test that slams two blobs together
-- ends up fighting the protection instead of testing the thing it came for.
-- Move without tripping the anti-cheat OR falling through the floor.
--
-- Two separate traps here, both of which made this test blame a working power.
-- Writing a distant position straight onto a ball reads as a client teleport
-- and gets snapped back; and interpolating in 3D dips the body below the
-- terrain, at which point the fall-rescue puts it back on a spawn point 400
-- studs away. So: steps of 20 studs, and strictly in the ground plane at a
-- height the blob's own radius clears.
local function walkTo(p, dest)
    local y = math.max(dest.Y, 10)
    for _ = 1, 200 do
        local b = ballOf(p)
        if not b then return end
        local here = V3.new(b.Position.X, 0, b.Position.Z)
        local there = V3.new(dest.X, 0, dest.Z)
        local delta = there - here
        local lift = math.max(y, b.Size.X / 2 + 4)
        if delta.Magnitude <= 20 then
            local final = V3.new(dest.X, lift, dest.Z)
            svc.movePlayer(p, final)
            b.Position = final
            b.AssemblyLinearVelocity = V3.new(0, 0, 0)
            tick(0.3)
            return
        end
        local nxt = here + delta.Unit * 20
        local step = V3.new(nxt.X, lift, nxt.Z)
        svc.movePlayer(p, step)
        b.Position = step
        b.AssemblyLinearVelocity = V3.new(0, 0, 0)
        tick(0.3)
    end
end

local function feed(p, n)
    for _ = 1, n do
        local target
        for _, d in ipairs(arena:GetChildren()) do
            if d.Name == "Pellet" or d.Name == "Crumb" then target = d break end
        end
        if not target then break end
        svc.movePlayer(p, target.Position)
        local b = ballOf(p)
        if b then b.Position = target.Position end
        tick(0.3)
    end
end

emit("══ THE CYCLE ══")
check("the game opens in a lobby", phaseOf(alice) == "LOBBY", tostring(phaseOf(alice)))

-- The lobby is a PLACE, not a flag. A player waiting for a round has to be
-- standing somewhere nothing can reach them.
local WorldBuilder = _G.SERVER("WorldBuilder")
local inLobby = 0
for _, p in ipairs({ alice, bob }) do
    local b = ballOf(p)
    if b and WorldBuilder.isInLobby(b.Position) then inLobby += 1 end
end
check("everyone waiting is actually in the lobby", inLobby == 2, tostring(inLobby))
check("nothing is on the island to eat during a lobby",
    #arena:GetChildren() == 0, tostring(#arena:GetChildren()))

-- Powers are refused outside a round, or the lobby becomes a fight.
svc.fireAs("UsePower", alice, V3.new(0, 0, 1))
tick(0.5)
local usedInLobby = false
for i = #_G.TRAFFIC, 1, -1 do
    local t = _G.TRAFFIC[i]
    if t.remote == "Effect" and t.args[1] == "power" then usedInLobby = true break end
end
check("powers do not work in the lobby", not usedInLobby)

check("a round starts on its own", waitFor(alice, "PLAYING"), tostring(phaseOf(alice)))
check("the island stocks itself for the round", #arena:GetChildren() > 100,
    tostring(#arena:GetChildren()))
-- A window, not equality: the snapshot is read a moment after the round opens
-- and a blob that happened to spawn next to a pellet has already eaten one.
-- What matters is that nobody carries a lead INTO a round.
check("nobody starts a round with a lead",
    ((arenaOf(alice) or {}).mass or 0) < Config.STARTING_MASS * 6
        and ((arenaOf(bob) or {}).mass or 0) < Config.STARTING_MASS * 6,
    ("%s vs %s"):format(tostring((arenaOf(alice) or {}).mass), tostring((arenaOf(bob) or {}).mass)))
check("and everyone starts on the island, not in the lobby",
    not WorldBuilder.isInLobby(ballOf(alice).Position))

emit("")
emit("══ GROWTH IS UNBOUNDED ══")
-- The melt curve is still in Blob and still tested there. It is OFF during a
-- round, because the point of a round is to get enormous and a cap fights that
-- directly. What restrains a leader now is other players, not arithmetic.
feed(alice, 200)
local grown = (arenaOf(alice) or {}).mass or 0
-- Past the OLD ceiling of ~1.06K, which is the number the melt curve used to
-- make unreachable. Clearing it is the proof that the cap is gone.
check("eating grows you well past the old ceiling",
    grown > 1500, ("%.0f"):format(grown))
check("the HUD reports no leak at all", (arenaOf(alice) or {}).leak == 0,
    tostring((arenaOf(alice) or {}).leak))
local held = grown
tick(25)
check("and standing still does not shrink you",
    ((arenaOf(alice) or {}).mass or 0) >= held * 0.98,
    ("%.0f -> %.0f"):format(held, (arenaOf(alice) or {}).mass or 0))

-- FOOD REACHES THE EDGE, AND THE EDGE IS NOT A REFUGE.
--
-- This assertion used to be the exact opposite: "no pellet may be outside
-- SHALLOWS_INNER". The reasoning was sound and the result was not — food in an
-- unconditionally safe ring means standing still is the winning strategy, so
-- the ring was left bare, and that left a 93-stud band around the whole island
-- — over a third of its area — with nothing in it. The player's words: "why is
-- there no food spawning near the edge".
--
-- The fix was to stop the rim being safe FOREVER rather than to stop it being
-- worth walking to. So there are now two things to prove, and both have to
-- hold or the change is a regression rather than a fix:
--
--   1. food actually reaches the outer third, and
--   2. the outer third is not thinner per square stud than the middle, because
--      "technically some pellets are out there" is how this bug comes back
--      wearing a passing test.
do
    local inRim, outerThird, innerTwo, total = 0, 0, 0, 0
    -- Split the food disc into two EQUAL-AREA halves. Comparing counts either
    -- side of an equal-area boundary is the only comparison that means
    -- anything: split by radius instead and a perfectly uniform field looks
    -- lopsided, which would make this test pass or fail for reasons that have
    -- nothing to do with the code.
    local half = Config.PELLET_OUTER / math.sqrt(2)
    for _, d in ipairs(arena:GetChildren()) do
        if d.Name == "Pellet" or d.Name == "Crumb" then
            total += 1
            local r = V3.new(d.Position.X, 0, d.Position.Z).Magnitude
            if r > Config.SHALLOWS_INNER then inRim += 1 end
            if r > half then outerThird += 1 else innerTwo += 1 end
        end
    end
    check("there is food to check", total > 100, tostring(total))
    check("food reaches past the old hard stop into the rim", inRim > 20,
        ("%d of %d pellets outside %d studs"):format(inRim, total, Config.SHALLOWS_INNER))
    check("food is spread evenly by AREA, not piled in the middle",
        outerThird > innerTwo * 0.75 and innerTwo > outerThird * 0.75,
        ("outer half %d vs inner half %d"):format(outerThird, innerTwo))
    check("nothing landed in the sea",
        (function()
            for _, d in ipairs(arena:GetChildren()) do
                if d.Name == "Pellet" or d.Name == "Crumb" then
                    if V3.new(d.Position.X, 0, d.Position.Z).Magnitude > Config.ISLAND_RADIUS then
                        return false
                    end
                end
            end
            return true
        end)())
end

emit("")
emit("══ THE RIM IS A FIRE ESCAPE, NOT A HOUSE ══")
-- The other half of the same change. Opening the rim up to food is only safe
-- because safety out there is a spendable METER rather than a property of the
-- ground. If the meter ever stops draining, the farm-forever exploit is back
-- and this suite is the only thing that would notice.
do
    local Arena = _G.SERVER("ArenaService")
    local run = Arena.runFor(alice)
    check("the meter exists", run and run.rimGrace ~= nil, run and tostring(run.rimGrace))

    -- Establish a known state rather than assuming one. Alice has been walked
    -- all over the island by the checks above, so her meter is at whatever
    -- those left it — asserting "starts full" here would be asserting the
    -- history of this file rather than the behaviour of the code.
    walkTo(alice, V3.new(0, 8, 150))
    tick(Config.SHALLOWS_GRACE * Config.SHALLOWS_RECHARGE + 6)
    run = Arena.runFor(alice)
    check("time inside the Flats fills the meter",
        run and run.rimGrace >= Config.SHALLOWS_GRACE - 0.01, run and tostring(run.rimGrace))

    -- Out to the rim, and it runs.
    walkTo(alice, V3.new(0, 8, Config.SPAWN_RING))
    local beforeDrain = (Arena.runFor(alice) or {}).rimGrace
    tick(5)
    run = Arena.runFor(alice)
    check("camping the rim drains it",
        run and run.rimGrace < beforeDrain - 2,
        ("%.1f -> %.1f"):format(beforeDrain or -1, (run or {}).rimGrace or -1))

    -- And it runs OUT, which is the whole point.
    tick(Config.SHALLOWS_GRACE + 4)
    run = Arena.runFor(alice)
    check("and it runs out, so the rim stops protecting you",
        run and run.rimGrace == 0, run and tostring(run.rimGrace))
    local snap = arenaOf(alice)
    check("the HUD stops claiming SAFE at the same moment",
        snap and snap.safe == false and snap.onRim == true,
        snap and ("safe=%s onRim=%s"):format(tostring(snap.safe), tostring(snap.onRim)))

    -- Back inside, and it refills.
    walkTo(alice, V3.new(0, 8, 150))
    tick(Config.SHALLOWS_GRACE * Config.SHALLOWS_RECHARGE + 4)
    run = Arena.runFor(alice)
    check("coming back inside refills it", run and run.rimGrace > Config.SHALLOWS_GRACE * 0.8,
        run and tostring(run.rimGrace))
end

emit("")
emit("══ DEFLATION IS THE CATCH-UP ══")
-- The whole comeback loop: hitting somebody bigger knocks size OFF them in
-- proportion to how big they are, and most of it lands as food for whoever is
-- standing nearby. Without this a leader simply wins.
local profile = _G.SERVER("Data").get(bob)
if profile then profile.lifetimeBanked = 1e9 end
svc.fireAs("SetPower", bob, "hook")
tick(0.5)
feed(bob, 20)

-- Walk the victim into the FLATS first. Feeding leaves a blob wherever the
-- last pellet was, and a blob sitting in the Shallows is protected — so the
-- hook correctly refused and the test looked like a broken power. The safe
-- zone working is the reason this failed, not a bug.
walkTo(alice, V3.new(0, 8, 200))
local spot = ballOf(alice).Position
check("precondition: the victim is on contested ground",
    V3.new(spot.X, 0, spot.Z).Magnitude < Config.SHALLOWS_INNER,
    ("%.0f studs out, shallows start at %d")
        :format(V3.new(spot.X, 0, spot.Z).Magnitude, Config.SHALLOWS_INNER))
-- A TIGHT radius, because the island respawns 36 pellets a second island-wide
-- and an 80-stud window catches enough of that drift to pass whether the
-- deflation dropped anything or not.
local function foodNear(at, r)
    local n = 0
    for _, d in ipairs(arena:GetChildren()) do
        if (d.Name == "Pellet" or d.Name == "Crumb")
            and (d.Position - at).Magnitude < r then n += 1 end
    end
    return n
end
local nearbyBefore = foodNear(spot, 45)

-- Walk, do not teleport. And re-establish the round: feeding Alice to 4K takes
-- a minute of simulated time and can cross the clock.
if phaseOf(bob) ~= "PLAYING" then waitFor(bob, "PLAYING") end
-- 60 studs, not 22. HOOK reaches 90, but EATING reaches the sum of the two
-- radii — and the victim here is deliberately twelve times Bob's size, so
-- walking him to 22 studs walked him straight into her mouth. He was being
-- swallowed on approach and respawning at a spawn point 400 studs away, which
-- looked exactly like a broken power.
walkTo(bob, spot + V3.new(60, 0, 0))
check("precondition: Bob is in reach and it is still the round",
    phaseOf(bob) == "PLAYING"
        and (ballOf(bob).Position - ballOf(alice).Position).Magnitude < 90,
    ("phase=%s dist=%.0f"):format(tostring(phaseOf(bob)),
        (ballOf(bob).Position - ballOf(alice).Position).Magnitude))

local victimBefore = (arenaOf(alice) or {}).mass or 0
svc.fireAs("UsePower", bob, V3.new(-1, 0, 0))
tick(0.6)

local victimAfter = (arenaOf(alice) or {}).mass or 0
check("hooking a bigger blob knocks size off it",
    victimAfter < victimBefore * 0.99,
    ("%.0f -> %.0f"):format(victimBefore, victimAfter))

local nearbyAfter = foodNear(spot, 45)
check("and what came off is on the floor for everyone else",
    nearbyAfter >= nearbyBefore + 5,
    ("%d -> %d pellets within 45 studs"):format(nearbyBefore, nearbyAfter))

-- Proportional, not flat. This is the property that makes it a catch-up tool:
-- the leader is always the most rewarding target on the island.
local Blob = _G.SHARED("Blob")
local small = Config.STARTING_MASS * 4
local big = Config.STARTING_MASS * 400
local takeSmall = (small - Config.STARTING_MASS) * Config.DEFLATE.hook
local takeBig = (big - Config.STARTING_MASS) * Config.DEFLATE.hook
check("deflation scales with the target's size, so the leader is the best target",
    takeBig > takeSmall * 50, ("%.0f vs %.0f"):format(takeBig, takeSmall))
check("every deflating power takes a real bite",
    Config.DEFLATE.slam > 0 and Config.DEFLATE.hook > 0
        and Config.DEFLATE.siphon > 0 and Config.DEFLATE.spike > 0)
check("SPIKE bites hardest, because it is the small blob's only answer",
    Config.DEFLATE.spike > Config.DEFLATE.slam * 2)

emit("")
emit("══ THE ROUND ENDS AND PAYS ══")
local function globOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "StateSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1].glob
        end
    end
end
local globBefore = globOf(alice) or 0
local peakBefore = (arenaOf(alice) or {}).mass or 0

check("the round ends by itself", waitFor(alice, "RESULTS"), tostring(phaseOf(alice)))
-- Read the PAYOUT off the results board, not the wallet. The legacy idle layer
-- still trickles Glob every second, so "the balance went up" is true whether
-- the round paid anything or not — a mutation zeroing the payout sailed
-- straight past that version of this check.

local board
for i = #_G.TRAFFIC, 1, -1 do
    local t = _G.TRAFFIC[i]
    if t.remote == "Effect" and t.args[1] == "roundEnd" then board = t.args[2] break end
end
check("a results board is sent", board ~= nil and board.board ~= nil)
check("finishing a round actually pays",
    board and board.board[1] and board.board[1].payout > 0,
    board and board.board[1] and tostring(board.board[1].payout))
-- The placement bonus checked as DATA, not as an outcome. In the simulated
-- round the winner is ten times the size of second place, so "first is paid
-- more" is true on mass alone and stays true with the bonus flattened — the
-- mutation removing it went straight through. The ladder itself is the thing
-- to assert.
check("placement is worth something on top of size",
    (Config.ROUND_PLACE_BONUS[1] or 0) > (Config.ROUND_PLACE_BONUS[2] or 0)
        and (Config.ROUND_PLACE_BONUS[2] or 0) > (Config.ROUND_PLACE_BONUS[3] or 0)
        and (Config.ROUND_PLACE_BONUS[3] or 0) > 1,
    table.concat({ tostring(Config.ROUND_PLACE_BONUS[1]),
        tostring(Config.ROUND_PLACE_BONUS[2]), tostring(Config.ROUND_PLACE_BONUS[3]) }, ", "))

check("and first place is paid more than last",
    board and #board.board > 1 and board.board[1].payout > board.board[2].payout,
    board and #board.board > 1
        and ("%s vs %s"):format(tostring(board.board[1].payout), tostring(board.board[2].payout)))
check("the wallet moved too", (globOf(alice) or 0) > globBefore,
    ("%s -> %s"):format(tostring(globBefore), tostring(globOf(alice))))
-- The board holds the whole FIELD, not just the humans. It used to be exactly
-- two rows because there were exactly two players; now there are two players
-- and ten bots, and a bot that grew all round then vanished from the results
-- would make second place a lie.
check("it ranks the whole field, bots included",
    board and #board.board == Config.ROUND_FIELD_SIZE,
    board and ("%d rows, field is %d"):format(#board.board, Config.ROUND_FIELD_SIZE))
check("bot rows are labelled as bots",
    (function()
        if not board then return false end
        local tagged, human = 0, 0
        for _, row in ipairs(board.board) do
            if row.bot then tagged += 1 else human += 1 end
        end
        return tagged == Config.ROUND_FIELD_SIZE - 2 and human == 2
    end)(), board and tostring(#board.board))
check("and bots are paid nothing, because there is nobody to pay",
    (function()
        if not board then return false end
        for _, row in ipairs(board.board) do
            if row.bot and row.payout ~= 0 then return false end
        end
        return true
    end)())
check("the biggest blob is first",
    board and board.board[1] and board.board[1].mass >= board.board[2].mass,
    board and board.board[1] and ("%.0f vs %.0f"):format(board.board[1].mass, board.board[2].mass))
check("and it reports the peak, which is what the round was about",
    board and board.board[1] and board.board[1].peak >= board.board[1].mass * 0.5)

check("and it goes back to the lobby", waitFor(alice, "LOBBY"), tostring(phaseOf(alice)))
check("the next round resets everyone to starting size",
    ((arenaOf(alice) or {}).mass or 0) <= Config.STARTING_MASS + 1,
    tostring((arenaOf(alice) or {}).mass))
check("and the peak is not carried into it",
    peakBefore > Config.STARTING_MASS * 10)

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL ROUND CHECKS PASSED" or (fails .. " FAILURE(S)")))
if fails > 0 then error(fails .. " round failure(s)", 0) end
