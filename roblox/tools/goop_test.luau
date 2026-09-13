--!nolint
-- goop_test.luau — SPLIT, tethers, spore pods, and the three-slot hotbar.
--
-- WHAT THIS SUITE IS FOR. Splitting is the genre's signature move and copying
-- it outright would make this a worse agar with extra menus, so it is copied
-- and then given one twist: every thrown piece stays joined to you by a strand
-- that deflates and slows anything crossing it. A split is therefore not only
-- a lunge, it is three lines drawn across the floor.
--
-- That twist is the thing most likely to be quietly broken, because it can
-- fail in a way that still LOOKS right: pieces fly out, strands render, and
-- nothing happens when somebody walks through one. So most of what is below
-- is about a tether actually biting, and about it biting the right blob.

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
local Powers = _G.SHARED("Powers")
local Blob = _G.SHARED("Blob")
local Arena = _G.SERVER("ArenaService")
local Goop = _G.SERVER("GoopService")
local Roll = _G.SERVER("RollService")

local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 60))
local bob   = svc.addPlayer("Bob", 202, V3.new(40, 5, 60))
tick(3)

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
local function placeAt(p, dest)
    local b = ballOf(p)
    local lift = math.max(10, (b and b.Size.X or 10) / 2 + 4)
    Roll.teleport(p, V3.new(dest.X, lift, dest.Z))
    tick(0.3)
end

check("the round starts", waitFor(alice, "PLAYING", 320), tostring(phaseOf(alice)))

emit("")
emit("══ THE HOTBAR IS THREE SLOTS, AND TWO OF THEM ARE NOT CHOICES ══")
do
    local function ladderTopId() return Powers.LIST[#Powers.LIST].id end
    local bar = Powers.hotbar(nil, 0)
    check("three slots", #bar == 3, tostring(#bar))
    check("slot 1 is DASH", bar[1] and bar[1].id == "dash", bar[1] and bar[1].id)
    check("slot 2 is SPLIT", bar[2] and bar[2].id == "split", bar[2] and bar[2].id)
    check("both are owned from the first second",
        bar[1].unlockBanked == 0 and bar[2].unlockBanked == 0)
    -- A brand new account has banked nothing, so slot 3 must still hold
    -- SOMETHING. An empty slot reads as a bug, and it is the state every
    -- player is in for their first round.
    check("slot 3 is never empty, even at zero banked", bar[3] ~= nil,
        bar[3] and bar[3].id)

    -- A chosen power that is not unlocked falls back rather than leaving a
    -- hole. This happens legitimately every time the unlock ladder is
    -- rebalanced under a saved profile.
    local locked = Powers.hotbar(ladderTopId(), 0)
    check("an unaffordable choice falls back instead of leaving a hole",
        locked[3] ~= nil and locked[3].id ~= ladderTopId(), locked[3] and locked[3].id)
    -- SPIKE moved to the season track, so no amount of banking selects it any
    -- more; the affordable case has to use something that is still ON the
    -- ladder. Taken from the ladder itself rather than named, so this cannot
    -- go stale again the next time the ladder is rebalanced.
    local ladderTop = Powers.LIST[#Powers.LIST]
    local owned = Powers.hotbar(ladderTop.id, 1e9)
    check("and an affordable one is honoured", owned[3].id == ladderTop.id,
        ("%s vs %s"):format(owned[3].id, ladderTop.id))

    -- Naming a fixed power as your choice must not produce a duplicate.
    local dup = Powers.hotbar("dash", 1e9)
    check("choosing a fixed power does not duplicate it in slot 3",
        dup[3].id ~= "dash", dup[3].id)
end

do
    -- And the server refuses it out loud rather than silently substituting.
    svc.fireAs("SetPower", alice, "split")
    tick(0.5)
    local profile = _G.SERVER("Data").get(alice)
    check("SetPower refuses a fixed power", (profile.powerId or "") ~= "split",
        tostring(profile.powerId))
end

emit("")
emit("══ A RARE SKILL FROM THE BETA PASS, AND THE WALL AROUND IT ══")
do
    local Season = _G.SHARED("Season")
    local seasonIds = {}
    for _, p in ipairs(Powers.SEASON) do seasonIds[p.id] = true end

    check("the season grants at least one power", next(Season.POWER_AT) ~= nil)
    check("and every one of them is a real power",
        (function()
            for _, id in pairs(Season.POWER_AT) do
                if not Powers.get(id) then return false end
            end
            return true
        end)())

    -- NOT ON THE BANKING LADDER AT ALL. If a season power were also reachable
    -- by banking, the season prize would be a slightly-early version of
    -- something everyone gets anyway, which is not a prize.
    check("a season power cannot be reached by banking",
        Powers.isOwned("hook", 1e12) == false and Powers.isOwned("spike", 1e12) == false)
    check("but a granted one is owned outright",
        Powers.isOwned("hook", 0, { hook = true }) == true)
    check("and it is selectable once granted",
        Powers.hotbar("hook", 0, { hook = true })[3].id == "hook")
    check("while an ungranted one falls back rather than leaving a hole",
        Powers.hotbar("hook", 1e12, {})[3].id ~= "hook")

    -- THE MONETISATION WALL. The premium track is bought with Robux and may
    -- never carry a gameplay number. Season.powerAt takes no premium argument,
    -- so there is nowhere to put a paid power even by accident — this asserts
    -- that shape, not just the current data.
    check("the season's power table is free-track only, by construction",
        (function()
            -- One argument, and it is the tier. A premium parameter would be
            -- the thing that makes a paid power expressible.
            local ok = pcall(function() return Season.powerAt(22, true) end)
            -- It must ignore any extra argument rather than honour it.
            return ok and Season.powerAt(22, true) == Season.powerAt(22)
        end)())
    for tier = 1, Season.TIERS do
        if Season.POWER_AT[tier] then
            check(("tier %d's power is on the free track"):format(tier),
                Season.rewardAt(tier, true) == nil
                    or not seasonIds[Season.rewardAt(tier, true)])
        end
    end
end

emit("")
emit("══ SPLIT ACTUALLY SPLITS ══")
-- The old SPLIT shoved your whole body forward and booked half your mass for a
-- refund, which is a dash with a bill attached: nothing ever left the body.
do
    local run = Arena.runFor(alice)
    check("Alice has a run", run ~= nil)
    run.mass = 3000
    run.slotReadyAt = { 0, 0, 0 }
    placeAt(alice, V3.new(0, 10, 120))
    local massBefore = run.mass
    local piecesBefore = Goop.countFor(alice.UserId)

    svc.fireAs("UsePower", alice, 2, V3.new(0, 0, 1))
    tick(0.4)

    check("pieces actually left the body",
        Goop.countFor(alice.UserId) == piecesBefore + Config.SPLIT_PIECES,
        ("%d -> %d"):format(piecesBefore, Goop.countFor(alice.UserId)))
    -- MORE THAN THE POWER'S OWN COST. "Mass went down" is satisfied by the
    -- cost SPLIT charges like every other power, so it stays true even if the
    -- pieces are free — a mutation that threw globlets out of thin air passed
    -- this check happily. The pieces have to be paid for on top of the button
    -- press, or mass is being created out of nothing every time somebody
    -- splits.
    local buttonCost = Powers.massCost("split", massBefore,
        (_G.SERVER("Data").get(alice).powerUses or {}).split or 0)
    local dropped = massBefore - (Arena.runFor(alice) or {}).mass
    check("and the pieces were paid for on top of the button's own cost",
        dropped > buttonCost * 1.2,
        ("dropped %.0f, button alone costs %.0f"):format(dropped, buttonCost))

    -- And what left the body is what is now flying around, give or take the
    -- pellets a piece has already eaten in the tick since.
    local inFlight = 0
    for _, g in ipairs(Goop.list()) do
        if g.ownerId == alice.UserId then inFlight += g.mass end
    end
    check("and the mass that left is the mass now in flight",
        inFlight > (dropped - buttonCost) * 0.8,
        ("%.0f in flight vs %.0f thrown"):format(inFlight, dropped - buttonCost))

    -- Every piece carries a visible strand. The hit test is done against the
    -- same segment the strand is drawn along, so a missing strand would mean a
    -- fence the player cannot see.
    local withStrand = 0
    for _, g in ipairs(Goop.list()) do
        if g.ownerId == alice.UserId and g.strand and g.strand.Parent then
            withStrand += 1
        end
    end
    check("every piece is drawn joined to its body",
        withStrand == Config.SPLIT_PIECES, tostring(withStrand))
end

emit("")
emit("══ THE TETHER BITES — THE PART THAT IS NOT AGAR.IO ══")
do
    local aliceRun = Arena.runFor(alice)
    local bobRun = Arena.runFor(bob)
    check("both are in the arena", aliceRun ~= nil and bobRun ~= nil)

    -- Clear the field, then place one strand by hand so the geometry is known
    -- rather than wherever a live split happened to fly.
    Goop.clear()
    local origin = V3.new(0, 10, 120)
    placeAt(alice, origin)
    aliceRun.mass = 3000
    aliceRun.safeUntil = 0
    aliceRun.committed = true
    aliceRun.rimGrace = 0

    Goop.split(alice.UserId, ballOf(alice).Position, V3.new(0, 0, 1),
        60, 1, env.Color3.fromRGB(255, 255, 255), false)
    tick(0.5)
    local strand = Goop.list()[1]
    check("there is a strand to cross", strand ~= nil)

    if strand then
        -- Straight across the middle of it, which is the case the maths has to
        -- get right: a segment test that only checked the endpoints would let
        -- a blob walk through the middle of every fence in the game.
        local mid = V3.new(
            (ballOf(alice).Position.X + strand.pos.X) / 2, 10,
            (ballOf(alice).Position.Z + strand.pos.Z) / 2)
        -- WITHIN 15% OF ALICE, so neither can swallow the other.
        --
        -- At 2,000 against her 3,000 she simply ATE him — Blob.canEat needs a
        -- 1.15 ratio and 1.5 clears it — and since the strand's midpoint is
        -- only about forty studs from her body and bodies are now tens of
        -- studs across, standing on her own tether put him inside her mouth.
        -- He popped, respawned four hundred studs away, and the hit count read
        -- zero for a reason that had nothing to do with tethers.
        bobRun.mass = 2800
        bobRun.safeUntil = 0
        bobRun.committed = true
        bobRun.rimGrace = 0
        local bobBefore = bobRun.mass
        placeAt(bob, mid)
        tick(0.6)

        check("crossing a strand takes a bite out of you",
            (Arena.runFor(bob) or {}).mass < bobBefore,
            ("%.0f -> %.0f"):format(bobBefore, (Arena.runFor(bob) or {}).mass))
        -- THE FLAG, AND THE THING THAT READS IT.
        --
        -- Asserting only that the server set `snagUntil` proved nothing: the
        -- server sets the flag but the CLIENT owns this ball's physics, and
        -- for a while nothing on the client read it — so tethers slowed bots
        -- (which the server moves itself) and did absolutely nothing to the
        -- people they are aimed at. The flag has to reach the snapshot and the
        -- controller has to act on it, so both are checked.
        check("and slows you down",
            (Arena.runFor(bob) or {}).snagUntil > os.clock(),
            tostring((Arena.runFor(bob) or {}).snagUntil - os.clock()))
        local snap
        for i = #_G.TRAFFIC, 1, -1 do
            local t = _G.TRAFFIC[i]
            if t.remote == "ArenaSync" and t.player ~= "ALL"
                and t.player.Name == "Bob" then
                snap = t.args[1]
                break
            end
        end
        check("and the snapshot tells the client about it",
            snap ~= nil and snap.snagged == true,
            snap and tostring(snap.snagged))
        check("and the slow is a real reduction, not a token one",
            Config.TETHER_SLOW < 0.85 and Config.TETHER_SLOW > 0.2,
            tostring(Config.TETHER_SLOW))

        -- ONE BITE, NOT ONE PER TICK. Without a per-victim cooldown a blob
        -- standing on a strand is shredded at twelve hits a second, which is
        -- not area denial, it is a death ray.
        --
        -- COUNTED, NOT WEIGHED. The first version of this watched Bob's mass
        -- over 0.4 seconds and passed whenever it did not fall — which it
        -- often did not, because the globlet keeps flying and drags the strand
        -- out from under him, and because he is eating pellets the whole time.
        -- A mutation that deleted the cooldown entirely sailed through it.
        -- Hits are events; count the events, and hold Bob on the line so the
        -- geometry cannot quietly stop being true.
        do
            local mark = #_G.TRAFFIC
            local window = 2.0
            local steps = 8
            for _ = 1, steps do
                local g = Goop.list()[1]
                if not g then break end
                local home = ballOf(alice).Position
                local onLine = V3.new((home.X + g.pos.X) / 2, 10, (home.Z + g.pos.Z) / 2)
                Roll.teleport(bob, V3.new(onLine.X,
                    math.max(10, ballOf(bob).Size.X / 2 + 4), onLine.Z))
                tick(window / steps)
            end
            local hits = 0
            for i = mark + 1, #_G.TRAFFIC do
                local t = _G.TRAFFIC[i]
                if t.remote == "Effect" and t.args[1] == "snagged"
                    and t.player ~= "ALL" and t.player.Name == "Bob" then
                    hits += 1
                end
            end
            -- TETHER_COOLDOWN apart, so two seconds of standing on a live wire
            -- is at most three bites. Twelve a second would be roughly
            -- twenty-four.
            local ceiling = math.ceil(window / Config.TETHER_COOLDOWN) + 1
            check("a strand cannot chain-hit the same blob every tick",
                hits <= ceiling, ("%d hits in %.1fs, ceiling %d"):format(hits, window, ceiling))
            check("but it does keep biting somebody who stays on it",
                hits >= 1, tostring(hits))
        end

        -- AND NEVER ITS OWN BUILDER. A fence that cut the player who made it
        -- would make splitting strictly self-harming, which is the one
        -- guaranteed way to make sure nobody ever presses the button.
        Goop.clear()
        Goop.split(alice.UserId, ballOf(alice).Position, V3.new(0, 0, 1),
            60, 1, env.Color3.fromRGB(255, 255, 255), false)
        aliceRun.mass = 3000
        local ownBefore = aliceRun.mass
        tick(1.2)
        check("your own strand never bites you",
            (Arena.runFor(alice) or {}).mass >= ownBefore - 0.001,
            ("%.1f -> %.1f"):format(ownBefore, (Arena.runFor(alice) or {}).mass))
    end
end

emit("")
emit("══ PIECES COME HOME ══")
do
    Goop.clear()
    local run = Arena.runFor(alice)
    run.mass = 3000
    placeAt(alice, V3.new(0, 10, 120))
    Goop.split(alice.UserId, ballOf(alice).Position, V3.new(0, 0, 1),
        120, 1, env.Color3.fromRGB(255, 255, 255), false)
    local before = run.mass
    -- Out to SPLIT_RANGE and back at SPLIT_SPEED, plus slack.
    tick((Config.SPLIT_RANGE * 2 / Config.SPLIT_SPEED) + 4)
    check("the piece is gone from the field", Goop.countFor(alice.UserId) == 0,
        tostring(Goop.countFor(alice.UserId)))
    check("and its mass came back to the body",
        (Arena.runFor(alice) or {}).mass > before,
        ("%.0f -> %.0f"):format(before, (Arena.runFor(alice) or {}).mass))
end

emit("")
emit("══ SPORE PODS ══")
do
    local podList = Goop.pods()
    check("pods were seeded for the round", #podList == Config.POD_COUNT,
        ("%d of %d"):format(#podList, Config.POD_COUNT))

    local onIsland = true
    for _, pod in ipairs(podList) do
        local r = V3.new(pod.pos.X, 0, pod.pos.Z).Magnitude
        -- Inside the Flats: a pod out on the rim would be unreachable by the
        -- big blobs it exists to threaten, because their rim meter runs out.
        if r > Config.SHALLOWS_INNER or r < Config.VAULT_RADIUS then
            onIsland = false
        end
    end
    check("every pod is on contested ground", onIsland)

    -- A SMALL blob walks straight through. This is the whole reason pods are
    -- on the map: ground the little ones can hide in and the big ones cannot
    -- follow into.
    Goop.clear()
    local run = Arena.runFor(alice)
    local pod = podList[1]
    run.mass = Config.POD_MIN_MASS * 0.4
    placeAt(alice, pod.pos)
    tick(0.6)
    check("a small blob passes through a pod untouched",
        Goop.countFor(alice.UserId) == 0 and pod.readyAt == 0,
        ("pieces=%d spent=%s"):format(Goop.countFor(alice.UserId), tostring(pod.readyAt ~= 0)))

    -- A BIG one bursts into a web.
    run.mass = Config.POD_MIN_MASS * 8
    placeAt(alice, pod.pos)
    tick(0.6)
    check("a big blob sets it off", pod.readyAt ~= 0, tostring(pod.readyAt))
    check("and is scattered into a whole web of pieces",
        Goop.countFor(alice.UserId) == Config.POD_PIECES,
        ("%d of %d"):format(Goop.countFor(alice.UserId), Config.POD_PIECES))
    check("the pod is gone from the world while it regrows",
        pod.part == nil)

    -- IT IS NOT A TAX. The mass left as globlets; it is not destroyed and not
    -- handed to anybody. What the pod costs you is control, not size — which
    -- is the difference between a hazard worth playing around and a toll.
    local afterBurst = (Arena.runFor(alice) or {}).mass
    local where = pod.pos

    -- ONE WAIT, COVERING BOTH. The pieces come home in about seven seconds and
    -- the pod regrows in twenty-five, so waiting for each separately spent
    -- thirty-five seconds of round clock — and the round is 210 long with a
    -- great deal already spent above it, so the second wait crossed the
    -- boundary. `clearPods` then emptied the list, the local `pod` became an
    -- orphan nothing would ever touch again, and the regrow check failed for a
    -- reason that had nothing to do with regrowing.
    -- OFF THE POD BEFORE WAITING FOR IT. The server shoves a burst blob clear
    -- so it cannot chain-burst, but the test writes positions directly and
    -- would otherwise be standing on the thing it is waiting to regrow.
    placeAt(alice, V3.new(0, 10, 120))
    tick(Config.POD_RESPAWN + 4)
    check("precondition: the round is still running",
        phaseOf(alice) == "PLAYING", tostring(phaseOf(alice)))

    check("and the mass comes back once the pieces do",
        (Arena.runFor(alice) or {}).mass > afterBurst,
        ("%.0f -> %.0f"):format(afterBurst, (Arena.runFor(alice) or {}).mass))

    -- It grows back, in the same place. A hazard that moved would be
    -- impossible to play around, and playing around them is the point.
    check("the pod regrows", pod.readyAt == 0 and pod.part ~= nil,
        ("readyAt=%s part=%s"):format(tostring(pod.readyAt), tostring(pod.part ~= nil)))
    check("in exactly the same place",
        pod.pos.X == where.X and pod.pos.Z == where.Z)
end

emit("")
emit("══ NOTHING SURVIVES THE ROUND ══")
do
    check("the lobby comes round", waitFor(alice, "LOBBY", 320), tostring(phaseOf(alice)))
    check("no pieces are left in flight", #Goop.list() == 0, tostring(#Goop.list()))
    check("no pods are left standing", #Goop.pods() == 0, tostring(#Goop.pods()))
    local world = svc.Workspace:FindFirstChild("GoobWorld")
    local folder = world and world:FindFirstChild("Goop")
    local left = folder and #folder:GetChildren() or 0
    check("and nothing is left in the world either", left == 0, tostring(left))
end

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL GOOP CHECKS PASSED" or (fails .. " FAILURE(S)")))
if fails > 0 then
    error(fails .. " goop failure(s)")
end
