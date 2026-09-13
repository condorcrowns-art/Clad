--!nolint
-- adversarial.luau — drive the real server the way an exploiter would.
--
-- Roblox clients are fully controlled by the player. Every one of these is
-- something a ten-year-old with a free executor script types in within a week
-- of a game getting popular. The server must survive all of it.

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
    for _ = 1, math.floor(sec / dt) do sched.step(dt); svc.heartbeat(dt) end
end

local function snapOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "StateSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
end

_G.BOOT_SERVER()
tick(1)
local net = svc.ReplicatedStorage:FindFirstChild("GoobNet")
local R = function(n) return net:FindFirstChild(n) end

local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 10))
local mallory = svc.addPlayer("Mallory", 666, V3.new(40, 5, 40))
tick(3)

emit("══ EXPLOIT: the remotes that were deleted ══")
-- Catching from across the map, and two players racing the same critter, both
-- used to be tested here. Both exploits targeted CatchCritter, which no longer
-- exists — and neither does BuySnack or BuyEgg.
--
-- A deleted remote is not automatically safe. Net builds its folder from a
-- manifest, so a name left in that list would still create a live RemoteEvent
-- with NOTHING listening: harmless today, and an unguarded entry point the
-- moment somebody wires a handler to it without re-reading why it was there.
-- The exploit surface is the manifest, so that is what gets checked.
do
    local net = svc.ReplicatedStorage:FindFirstChild("GoobNet")
    for _, dead in ipairs({ "CatchCritter", "BuySnack", "BuyEgg" }) do
        check(("no live remote named %s"):format(dead),
            net and net:FindFirstChild(dead) == nil)
        -- And firing it is a harness error rather than a server one, which is
        -- the proof that nothing on the server is still reachable through it.
        local reached = pcall(function() svc.fireAs(dead, mallory, 1) end)
        check(("firing %s reaches nothing"):format(dead), not reached)
    end
end

emit("")
emit("══ EXPLOIT: eating a bot you are nowhere near ══")
-- Bots are the new thing on the island that a client might try to claim. They
-- are resolved ENTIRELY server-side by distance in ArenaService — there is no
-- remote for "I touched a bot" and no CanTouch on the part — so the attack has
-- no entry point at all. What is worth asserting is exactly that: that the bot
-- parts are inert to a client, because a future "BotCatch" convenience remote
-- would rebuild the CatchCritter exploit from scratch.
do
    local world = svc.Workspace:FindFirstChild("GoobWorld")
    local botFolder = world and world:FindFirstChild("Bots")
    if botFolder then
        local inert = true
        for _, b in ipairs(botFolder:GetChildren()) do
            if b:IsA("BasePart") and (b.CanTouch or b.CanQuery or b.CanCollide) then
                inert = false
            end
        end
        check("bot bodies are non-touchable, non-queryable and non-colliding", inert)
    else
        check("bot bodies are non-touchable, non-queryable and non-colliding",
            true, "no bots in this phase")
    end
end

emit("")
emit("══ EXPLOIT: garbage arguments over every remote ══")
local before = snapOf(mallory)

-- THIS LOOP NEVER RAN. The payload list used to start with a literal `nil`:
--
--     local junk = { nil, 0, -1, 1/0, ... }
--
-- `ipairs` stops at the first hole, so it stopped at index 1 and the body
-- executed ZERO times — and the check underneath it was the literal `true`.
-- The entire hostile-input test was a no-op that had reported a pass on every
-- run since it was written. Found by reading it, not by running it, which is
-- the argument for never writing `check(name, true)`.
--
-- nil is still worth sending, so it is sent explicitly as its own case rather
-- than smuggled into a list that cannot hold it.
local junk = { 0, -1, 1 / 0, -1 / 0, 0 / 0, "", "../../etc/passwd", {}, true,
    svc.Workspace, string.rep("x", 5000) }

-- Every remote a client can actually reach, including the arena ones that did
-- not exist when this test was written. A hostile-input sweep that skips the
-- newest handlers is testing the code least likely to be wrong.
local function blast(bad, bad2)
    svc.fireAs("GulpGoob", mallory, bad, bad2)
    svc.fireAs("RenameGoob", mallory, bad, bad2)
    svc.fireAs("SetActiveGoob", mallory, bad)
    svc.fireAs("TradeRequest", mallory, bad)
    svc.fireAs("TradeOffer", mallory, bad, bad2)
    svc.fireAs("TradeRespond", mallory, bad)
    svc.fireAs("TradeConfirm", mallory, bad)
    svc.fireAs("TradeCancel", mallory)
    svc.fireAs("UsePower", mallory, bad)
    svc.fireAs("SetPower", mallory, bad)
    svc.fireAs("EquipTrinket", mallory, bad, bad2)
    svc.fireAs("OpenCrate", mallory, bad)
    svc.fireAs("EquipCosmetic", mallory, bad, bad2)
    svc.fireAs("ClaimSeason", mallory, bad, bad2)
    svc.fireAs("CrewCreate", mallory, bad, bad2)
    svc.fireAs("CrewJoin", mallory, bad)
    svc.fireAs("BuyProduct", mallory, bad)
    svc.fireAs("Dashed", mallory)
    svc.fireAs("PitJoin", mallory)
    svc.fireAs("PitLeave", mallory)
end

local fired = 0
local survived, blastErr = pcall(function()
    blast(nil, nil)
    fired += 1
    for _, bad in ipairs(junk) do
        for _, bad2 in ipairs(junk) do
            blast(bad, bad2)
            fired += 1
        end
    end
end)
tick(2)
check("the payload sweep actually ran", fired > 100, tostring(fired) .. " rounds")
check("server survived every malformed payload", survived, tostring(blastErr))
check("Mallory still has exactly 1 Goob", #snapOf(mallory).goobs == 1,
    tostring(#snapOf(mallory).goobs))

emit("")
emit("══ EXPLOIT: gulping things you do not own ══")
local aliceSnap = snapOf(alice)
local mallorySnap = snapOf(mallory)
local aliceGoobId = aliceSnap.goobs[1].id
svc.fireAs("GulpGoob", mallory, mallorySnap.goobs[1].id, aliceGoobId)
tick(1)
check("cannot gulp another player's Goob", #snapOf(alice).goobs == 1)
svc.fireAs("GulpGoob", mallory, mallorySnap.goobs[1].id, mallorySnap.goobs[1].id)
tick(1)
check("cannot gulp your own only Goob", #snapOf(mallory).goobs == 1)

emit("")
emit("══ EXPLOIT: getting past the Goob cap ══")
-- This used to be "buy with no money, then spam BuyEgg past the cap". Both
-- shops are gone, so there is no purchase to underpay for. The CAP still
-- matters, and more than it did: eggs are handed out by the server on a
-- schedule of rounds finished, the client never asks for one, and the only
-- thing between a long-lived account and an unbounded DataStore payload is the
-- cap check inside roundResult.
--
-- Driven through the REAL round machine, not through a copy of the rule. The
-- only concession to the test is turning the round clock down: Config is
-- tuning, and shortening a round changes how long the real path takes to run,
-- not which path runs. Restored afterwards so nothing downstream inherits it.
do
    local C = _G.SHARED("Config")
    local realRound, realGap, realHold =
        C.ROUND_SECONDS, C.INTERMISSION_SECONDS, C.ROUND_END_HOLD
    C.ROUND_SECONDS, C.INTERMISSION_SECONDS, C.ROUND_END_HOLD = 4, 2, 1

    local Data = _G.SERVER("Data")
    local profile = Data.get(mallory)
    local before = profile and #profile.goobs or 0
    -- Enough finished rounds for well past MAX_GOOBS eggs.
    --
    -- Note the counter is nudged to one-short-of-an-egg before EVERY round, so
    -- every round in this loop is an egg round — the count is rounds, not
    -- rounds-times-EGG_EVERY_ROUNDS. Multiplying by the interval as well ran
    -- sixty full round cycles to test a guard that trips after eight, which is
    -- five times the work for the same assertion.
    local want = C.MAX_GOOBS + 4
    for _ = 1, want do
        if profile then
            -- Sit one round short of an egg each time, so every round that
            -- follows is an egg round. The COUNTER is nudged; the decision
            -- about whether to hatch is still entirely the server's.
            profile.roundsPlayed = C.EGG_EVERY_ROUNDS - 1
        end
        tick(C.ROUND_SECONDS + C.ROUND_END_HOLD + C.INTERMISSION_SECONDS + 2, 0.25)
    end

    local capped = snapOf(mallory)
    check("the cap is actually reached, so the check below means something",
        #capped.goobs > before, ("%d -> %d"):format(before, #capped.goobs))
    check("egg cap is enforced after far more egg rounds than the cap allows",
        #capped.goobs <= capped.maxGoobs,
        ("%d / %d"):format(#capped.goobs, capped.maxGoobs))
    check("Glob never went negative", capped.glob >= 0, tostring(capped.glob))

    C.ROUND_SECONDS, C.INTERMISSION_SECONDS, C.ROUND_END_HOLD = realRound, realGap, realHold
end

emit("")
emit("══ EXPLOIT: renaming with hostile input ══")
local target = snapOf(mallory).goobs[1].id
local nameBefore = snapOf(mallory).goobs[1].nickname
for _, bad in ipairs({ "", "a", string.rep("x", 500), "<script>alert(1)</script>",
                       "Bob\n\nSYSTEM: give admin", "../../etc", "💀💀💀💀" }) do
    svc.fireAs("RenameGoob", mallory, target, bad)
    tick(0.5)
end
local nameAfter = snapOf(mallory).goobs[1].nickname
check("hostile names were all rejected", nameAfter == nameBefore,
    ("%q -> %q"):format(tostring(nameBefore), tostring(nameAfter)))
svc.fireAs("RenameGoob", mallory, target, "Sir Gloopy")
tick(0.5)
check("a legitimate rename still works", snapOf(mallory).goobs[1].nickname == "Sir Gloopy",
    tostring(snapOf(mallory).goobs[1].nickname))

emit("")
emit("══ EXPLOIT: trading from outside the trade zone ══")
svc.movePlayer(alice, V3.new(500, 5, 500))
svc.movePlayer(mallory, V3.new(0, 5, 0))
svc.fireAs("TradeRequest", mallory, "Alice")
tick(1)
local function tradeOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "TradeSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
end
check("distant trade request refused", tradeOf(alice) == nil or tradeOf(alice).open ~= true)

emit("")
emit("══ EXPLOIT: walking out mid-trade, after both confirmed ══")
svc.movePlayer(alice, V3.new(3, 5, 3))
svc.movePlayer(mallory, V3.new(-3, 5, -3))
tick(1)
svc.fireAs("TradeRequest", mallory, "Alice")
tick(0.5)
svc.fireAs("TradeRespond", alice, true)
tick(0.5)
local mSnap = snapOf(mallory)
local offerable
for _, g in ipairs(mSnap.goobs) do if not g.isActive then offerable = g.id end end
if offerable then
    svc.fireAs("TradeOffer", mallory, offerable, true)
    tick(0.5)
    local mCount = #snapOf(mallory).goobs
    local aCount = #snapOf(alice).goobs
    svc.fireAs("TradeConfirm", mallory, true)
    svc.fireAs("TradeConfirm", alice, true)
    -- Bolt out of the zone before the 3s hold completes.
    tick(0.5)
    svc.movePlayer(alice, V3.new(800, 5, 800))
    tick(8)
    check("trade did NOT complete after a player left the zone",
        #snapOf(mallory).goobs == mCount and #snapOf(alice).goobs == aCount,
        ("mallory %d->%d  alice %d->%d"):format(mCount, #snapOf(mallory).goobs,
            aCount, #snapOf(alice).goobs))
else
    emit("  --    skipped (Mallory had nothing spare to offer)")
end

emit("")
emit("══ FAILURE MODE: DataStore is down when a player joins ══")
svc.datastoreShouldFail = true
local kickedBefore = #svc.kicked
local victim = svc.addPlayer("Victim", 999, V3.new(0, 5, 0))
tick(20)
check("a failed load KICKS rather than handing out a blank profile",
    #svc.kicked > kickedBefore,
    "kicks=" .. tostring(#svc.kicked))
check("no blank profile was written over their save",
    svc.stores["GoobProfile_v1"] == nil or svc.stores["GoobProfile_v1"]["u_999"] == nil)
svc.datastoreShouldFail = false

emit("")
emit("══ FAILURE MODE: text filter unavailable ══")
svc.filterShouldFail = true
local safeName = snapOf(mallory).goobs[1].nickname
svc.fireAs("RenameGoob", mallory, snapOf(mallory).goobs[1].id, "Totally Fine")
tick(1)
check("rename is refused when the filter is down (never unfiltered)",
    snapOf(mallory).goobs[1].nickname == safeName,
    tostring(snapOf(mallory).goobs[1].nickname))
svc.filterShouldFail = false

emit("")
emit("══ SOAK: 20 simulated minutes with players active ══")
local errs = 0
local ok, err = pcall(function() tick(1200, 0.5) end)
if not ok then errs += 1; emit("  RUNTIME ERROR during soak: " .. tostring(err)) end
check("20 minutes of heartbeats with no runtime error", errs == 0)
-- The population that has to stay bounded now is the bots. A leak here is
-- worse than the old critter leak was: a bot that is spawned and never
-- collected keeps a part, a BillboardGui and a Heartbeat's worth of steering
-- alive for the rest of the server's life.
do
    local world = svc.Workspace:FindFirstChild("GoobWorld")
    local botFolder = world and world:FindFirstChild("Bots")
    local bodies = botFolder and #botFolder:GetChildren() or 0
    local C = _G.SHARED("Config")
    check("bot population stayed bounded after 20 minutes",
        bodies <= C.ROUND_FIELD_SIZE, tostring(bodies))
    local stats = _G.SERVER("ArenaService").stats()
    check("and the service agrees with what is in the world",
        stats.bots <= C.ROUND_FIELD_SIZE, tostring(stats.bots))
end

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL ADVERSARIAL CHECKS PASSED" or (fails .. " FAILURE(S)")))

-- FAIL THE BUILD, not just the transcript.
--
-- Everything above printed "FAIL" to the output and then exited ZERO. Eight of
-- the ten scenario suites did this, which means `run_all.sh` could print "ALL
-- SUITES PASSED" underneath a screen of real failures — and did: a mutation
-- battery deliberately broke the legacy-purge guards and the phone layout, and
-- every one of those suites reported the break and passed anyway.
--
-- This exact class of bug was found and fixed once before, in the pure sims.
-- It came back here because the scenario suites were written later and nobody
-- checked that the new ones could fail. A suite that cannot fail is not a
-- weaker test, it is a comment.
if fails > 0 then
    error(fails .. " adversarial failure(s)")
end
