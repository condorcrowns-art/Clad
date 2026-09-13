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

-- EVERYTHING UNLOCKED, BY BOTH ROUTES.
--
-- Banking alone is no longer enough: HOOK and SPIKE come off the BETA SEASON's
-- free track (Season.POWER_AT) and are deliberately not on the banking ladder
-- at all, so a test that only sets lifetimeBanked cannot select them and
-- Powers.hotbar quietly hands back the default instead.
local function unlockEverything(p)
    local prof = _G.SERVER("Data").get(p)
    if not prof then return end
    prof.lifetimeBanked = 1e9
    prof.powersGranted = prof.powersGranted or {}
    for _, power in ipairs(_G.SHARED("Powers").SEASON) do
        prof.powersGranted[power.id] = true
    end
end

local Blob0 = _G.SHARED("Blob")
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
-- PUT A BLOB SOMEWHERE, the way the server does it.
--
-- This used to inch the ball across the island 20 studs at a time, to avoid
-- looking like a client teleporting itself — the anti-cheat samples speed at
-- 4Hz and snaps a blob back to where it was after three implausible readings.
-- That worked until blob radius went from a logarithm to a cube root: a
-- well-fed test blob is now genuinely enormous and genuinely slow, 20 studs
-- per quarter-second is four times its plausible speed, and the walk got
-- snapped back partway every time. The symptom was four assertions failing
-- about rim meters and hooks, none of which had anything wrong with them.
--
-- RollService.teleport is the call the arena itself uses to place a player at
-- a spawn point. It moves the ball, zeroes its velocity and clears the
-- violation count — which is precisely "the server decided you are here", and
-- precisely what a test means when it puts a blob somewhere.
local Roll = _G.SERVER("RollService")
local function walkTo(p, dest)
    local b = ballOf(p)
    local lift = math.max(10, (b and b.Size.X or 10) / 2 + 4)
    Roll.teleport(p, V3.new(dest.X, lift, dest.Z))
    tick(0.3)
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
svc.fireAs("UsePower", alice, 3, V3.new(0, 0, 1))
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
-- BOB is the one pressing HOOK here, so Bob is the one who needs it unlocked.
-- The blanket substitution above targeted Alice because she is the subject of
-- every other block in this file.
unlockEverything(bob)
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
            and (V3.new(d.Position.X - at.X, 0, d.Position.Z - at.Z)).Magnitude < r then n += 1 end
    end
    return n
end
-- MEASURED IN AN ANNULUS AROUND THE VICTIM, not in a disc.
--
-- Two things broke the old "count pellets within 45 studs" version once bodies
-- became physically large. Deflation scatters in a ring proportional to the
-- victim's radius, so at 20K mass the crumbs land 90-odd studs out and a
-- 45-stud window caught none of them. Widening the window then made it worse:
-- a disc big enough to contain the ring also contains three hundred ambient
-- pellets AND sits inside the victim's own 60-stud pickup reach, so the count
-- was dominated by noise and eaten by the thing it was measuring.
--
-- The annulus fixes both. Its inner edge is outside the victim's reach — which
-- is exactly where deflation deliberately drops, so that the victim cannot
-- immediately re-eat what was knocked off them — and it is thin enough that
-- thirty new crumbs are a large fraction of what is in it.
local function foodInRing(at, rMin, rMax)
    local n = 0
    for _, d in ipairs(arena:GetChildren()) do
        if d.Name == "Pellet" or d.Name == "Crumb" then
            local r = V3.new(d.Position.X - at.X, 0, d.Position.Z - at.Z).Magnitude
            if r >= rMin and r <= rMax then n += 1 end
        end
    end
    return n
end
local victimR = Blob0.radius((arenaOf(alice) or {}).mass or 1000)
local ringLo, ringHi = victimR * 1.35, victimR * 2.6 + 24
local nearbyBefore = foodInRing(spot, ringLo, ringHi)

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
svc.fireAs("UsePower", bob, 3, V3.new(-1, 0, 0))
tick(0.6)

local victimAfter = (arenaOf(alice) or {}).mass or 0
check("hooking a bigger blob knocks size off it",
    victimAfter < victimBefore * 0.99,
    ("%.0f -> %.0f"):format(victimBefore, victimAfter))

local nearbyAfter = foodInRing(spot, ringLo, ringHi)
check("and what came off is on the floor for everyone else",
    nearbyAfter >= nearbyBefore + 5,
    ("%d -> %d pellets in the %.0f-%.0f ring"):format(
        nearbyBefore, nearbyAfter, ringLo, ringHi))

-- ── AND THE ATTACKER CANNOT SIMPLY EAT IT BACK ────────────────────────────
--
-- Deflation exists to feed whoever is standing nearby. The blob standing
-- nearest is always the one that just landed the hit — and once bodies became
-- physically large (radius went from a logarithm to a cube root) the
-- attacker's pickup reach covered the entire scatter ring, so it hoovered up
-- its own deflation before anybody else could move. A comeback mechanic that
-- feeds the attacker is a feeding mechanic for whoever is already winning.
--
-- Drops are therefore locked against BOTH blobs that produced them for a few
-- seconds: the victim, so it cannot re-absorb what was knocked off, and the
-- attacker, so it has to earn it like everybody else.
do
    local Arena2 = _G.SERVER("ArenaService")

    -- WHAT IS ASSERTED HERE, AND WHY IT IS THIS AND NOT THE OBVIOUS THING.
    --
    -- The obvious test is behavioural: drop a crumb, stand the attacker on it,
    -- watch it survive. Three attempts at that were all confounded, and it is
    -- worth writing down why rather than leaving a flaky check behind. The
    -- island carries fourteen hundred ambient pellets so a crumb picked at
    -- random is usually not a drop; respawn adds forty-eight a second so
    -- "new since the hook" does not identify one either; twelve contenders are
    -- wandering across it so anyone may legitimately eat it; and by this point
    -- in the file a round boundary is close enough that the reset destroys
    -- every pellet mid-watch. Each of those produces the identical symptom —
    -- "it was eaten" — with nothing wrong.
    --
    -- So the check is on ATTRIBUTION, which is deterministic and is exactly
    -- what the behaviour rests on: a deflation drop must name the blob that
    -- caused it, because the single eat predicate refuses any crumb naming the
    -- eater. Attribution is also precisely what goes missing if somebody stops
    -- threading the attacker through `deflate` — the regression this exists to
    -- catch.
    local before = {}
    for _, d in ipairs(arena:GetChildren()) do
        if d.Name == "Pellet" or d.Name == "Crumb" then before[d] = true end
    end

    tick(16)   -- hook cooldown
    if phaseOf(bob) ~= "PLAYING" then waitFor(bob, "PLAYING") end
    Roll.teleport(alice, V3.new(spot.X,
        math.max(10, ballOf(alice).Size.X / 2 + 4), spot.Z))
    Roll.teleport(bob, V3.new(spot.X + 60,
        math.max(10, ballOf(bob).Size.X / 2 + 4), spot.Z))
    svc.fireAs("UsePower", bob, 3, V3.new(-1, 0, 0))
    tick(0.3)

    local locked, namesBob, forever = 0, 0, 0
    for _, d in ipairs(arena:GetChildren()) do
        if (d.Name == "Pellet" or d.Name == "Crumb") and not before[d] then
            local owner, owner2, until_ = Arena2.pelletLock(d)
            if owner ~= nil or owner2 ~= nil then
                locked += 1
                if owner2 == bob.UserId then namesBob += 1 end
                -- A lock with no deadline would litter the island with food
                -- its owner can never touch: a different bug, same fix.
                if until_ <= 0 then forever += 1 end
            end
        end
    end

    check("the hook dropped food that belongs to somebody", locked > 0,
        tostring(locked))
    check("and it names the ATTACKER, not only the victim",
        namesBob > 0, ("%d of %d locked crumbs name Bob"):format(namesBob, locked))
    check("and every lock has a deadline", forever == 0, tostring(forever))
end

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
-- The flag is INTERNAL — it decides payout, nothing else. Nothing the player
-- reads may carry it: a board showing "Gloop (bot)" eleven times makes a full
-- island look like an empty one, which is the exact feeling bots exist to
-- prevent. The next check is the one that holds that line.
check("every row carries the internal bot flag correctly",
    (function()
        if not board then return false end
        local tagged, human = 0, 0
        for _, row in ipairs(board.board) do
            if row.bot then tagged += 1 else human += 1 end
        end
        return tagged == Config.ROUND_FIELD_SIZE - 2 and human == 2
    end)(), board and tostring(#board.board))
check("and no bot's NAME gives it away",
    (function()
        if not board then return false end
        for _, row in ipairs(board.board) do
            local n = tostring(row.name)
            if n:find("bot") or n:find("BOT") or n:find("\u{1F916}")
                or n:find("NPC") or n:find("CPU") then
                return false
            end
        end
        return true
    end)())
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
