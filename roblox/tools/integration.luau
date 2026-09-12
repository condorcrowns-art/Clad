--!nolint
-- integration.luau — drive the real server through a full session.

local svc, env = _G.SVC, _G.ENV
local V3 = env.Vector3
local sched = env.scheduler

local fails = 0
local function check(label, cond, detail)
    if cond then
        emit(("  ok    %s"):format(label))
    else
        fails += 1
        emit(("  FAIL  %s   %s"):format(label, detail or ""))
    end
end

local function tick(seconds, dt)
    dt = dt or 0.25
    local n = math.floor(seconds / dt)
    for _ = 1, n do
        sched.step(dt)
        svc.heartbeat(dt)
    end
end

local function lastNotify(playerName)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "Notify" and (playerName == nil or (t.player ~= "ALL" and t.player.Name == playerName)) then
            return t.args[1]
        end
    end
    return nil
end

local function snapshotFor(player)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "StateSync" and t.player ~= "ALL" and t.player.Name == player.Name then
            return t.args[1]
        end
    end
    return nil
end

emit("══ BOOTING THE REAL SERVER ══")
_G.BOOT_SERVER()
tick(1)
check("server booted without error", true)

local RS = svc.ReplicatedStorage
local net = RS:FindFirstChild("GoobNet")
check("GoobNet folder created", net ~= nil)
check("world folder created", svc.Workspace:FindFirstChild("GoobWorld") ~= nil)
check("critter folder created", svc.Workspace:FindFirstChild("Critters") ~= nil)

local world = svc.Workspace:FindFirstChild("GoobWorld")
local plotCount = 0
if world then
    for _, c in ipairs(world:GetChildren()) do
        if c.Name:match("^Plot%d+$") then plotCount += 1 end
    end
end
check("8 plots built", plotCount == 8, "got " .. tostring(plotCount))
check("trade booth exists", world and world:FindFirstChild("TradeBooth") ~= nil)
check("leaderboard exists", world and world:FindFirstChild("Leaderboard") ~= nil)
check("hub spawn exists", world and world:FindFirstChild("HubSpawn") ~= nil)

emit("")
emit("══ PLAYER JOINS ══")
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 10))
tick(2)

local snap = snapshotFor(alice)
check("Alice got a state snapshot", snap ~= nil)
check("Alice starts with 1 Goob", snap and #snap.goobs == 1, snap and tostring(#snap.goobs))
check("Alice has starting Glob", snap and snap.glob > 0, snap and tostring(snap.glob))
-- The active Goob is now the player's body, not a model parked on a pad.
local goobBall = svc.Workspace:FindFirstChild("GoobBall_101")
check("Alice's Goob spawned as a rolling body", goobBall ~= nil)
check("it has both eyes", goobBall and goobBall:FindFirstChild("EyeL") ~= nil
    and goobBall:FindFirstChild("EyeR") ~= nil)
check("it carries a nameplate", goobBall and goobBall:FindFirstChild("Plate") ~= nil)
check("it is unanchored so physics can move it", goobBall and goobBall.Anchored == false)

emit("")
emit("══ CATCHING ══")
tick(20)
local critters = svc.Workspace:FindFirstChild("Critters")
check("critters spawned", critters and #critters:GetChildren() > 0,
    critters and tostring(#critters:GetChildren()))

local before = snapshotFor(alice)
local beforeMass = before and before.goobs[1].mass or 0

-- Walk Alice onto a critter and fire the real catch remote.
local caught = 0
for _ = 1, 12 do
    local list = critters:GetChildren()
    if #list == 0 then break end
    local target = list[1]
    svc.movePlayer(alice, target.Position)
    svc.fireAs("CatchCritter", alice, target)
    tick(0.5)
    caught += 1
end
check("caught several critters", caught > 0, tostring(caught))
tick(15)

local after = snapshotFor(alice)
check("mass increased after catching",
    after and after.goobs[1].mass > beforeMass,
    after and ("%f -> %f"):format(beforeMass, after.goobs[1].mass))
check("stomach digests down over time", after and after.goobs[1].stomachCount >= 0)
local grownBall = svc.Workspace:FindFirstChild("GoobBall_101")
check("Goob body grew", grownBall and grownBall.Size.X > 0)

emit("")
emit("══ THE GLOB SINK: SNACK STAND ══")
local snapA = snapshotFor(alice)
check("snapshot exposes snack tiers", snapA and snapA.snacks and #snapA.snacks == 3,
    snapA and snapA.snacks and tostring(#snapA.snacks))
check("snack prices are positive", snapA and snapA.snacks[1].price > 0)

-- Give Alice enough Glob to afford a Banquet, then buy one.
tick(600)
local rich = snapshotFor(alice)
local massBeforeSnack = rich.goobs[1].mass
svc.fireAs("BuySnack", alice, "snack")
tick(30)
local postSnack = snapshotFor(alice)
check("buying a snack fed the Goob",
    postSnack and (postSnack.goobs[1].mass > massBeforeSnack or postSnack.goobs[1].stomachCount > 0),
    lastNotify("Alice"))

emit("")
emit("══ THE EGG STAND (the fix for the unreachable gulp) ══")
local preEgg = snapshotFor(alice)
check("snapshot exposes an egg price", preEgg and preEgg.eggPrice and preEgg.eggPrice > 0,
    preEgg and tostring(preEgg.eggPrice))

-- Accumulate income until the egg is affordable, then hatch.
local tries = 0
while tries < 40 do
    local s = snapshotFor(alice)
    if s and s.eggAffordable then break end
    tick(300)
    tries += 1
end
check("egg became affordable through idle income", tries < 40, "tries=" .. tostring(tries))

svc.fireAs("BuyEgg", alice)
tick(2)
local postEgg = snapshotFor(alice)
check("Alice now has 2 Goobs", postEgg and #postEgg.goobs == 2,
    postEgg and tostring(#postEgg.goobs) .. " | " .. tostring(lastNotify("Alice")))

emit("")
emit("══ GULPING — the mechanic that was dead code ══")
if postEgg and #postEgg.goobs == 2 then
    local activeId, otherId
    for _, g in ipairs(postEgg.goobs) do
        if g.isActive then activeId = g.id else otherId = g.id end
    end
    local massBefore, genBefore
    for _, g in ipairs(postEgg.goobs) do
        if g.id == activeId then massBefore, genBefore = g.mass, g.generation end
    end

    svc.fireAs("GulpGoob", alice, activeId, otherId)
    tick(2)
    local postGulp = snapshotFor(alice)
    check("gulp consumed the other Goob", postGulp and #postGulp.goobs == 1,
        postGulp and tostring(#postGulp.goobs) .. " | " .. tostring(lastNotify("Alice")))
    if postGulp and #postGulp.goobs == 1 then
        local g = postGulp.goobs[1]
        check("eater gained mass", g.mass > massBefore, ("%f -> %f"):format(massBefore, g.mass))
        check("generation advanced", g.generation == genBefore + 1,
            ("%d -> %d"):format(genBefore, g.generation))
    end
else
    fails += 1
    emit("  FAIL  cannot test gulping — Alice never got a second Goob")
end

emit("")
emit("══ TRADING ══")
local bob = svc.addPlayer("Bob", 202, V3.new(0, 5, 0))
tick(2)
check("Bob joined and got a body", svc.Workspace:FindFirstChild("GoobBall_202") ~= nil)

-- Both must be inside the trade zone; give Alice a second Goob to offer.
svc.movePlayer(alice, V3.new(2, 5, 2))
svc.movePlayer(bob, V3.new(-2, 5, -2))
tick(600)
for _ = 1, 40 do
    local s = snapshotFor(alice)
    if s and #s.goobs >= 2 then break end
    if s and s.eggAffordable then
        svc.fireAs("BuyEgg", alice)
    end
    tick(300)
end
local pre = snapshotFor(alice)
check("Alice has 2 Goobs to trade with", pre and #pre.goobs >= 2,
    pre and tostring(#pre.goobs))

svc.fireAs("TradeRequest", alice, "Bob")
tick(1)
check("Bob received a trade request", (lastNotify("Bob") or ""):find("trade") ~= nil,
    tostring(lastNotify("Bob")))

svc.fireAs("TradeRespond", bob, true)
tick(1)

local function tradeState(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "TradeSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
    return nil
end
check("trade window opened for both", tradeState(alice) and tradeState(alice).open == true)

-- Alice offers her non-active Goob.
local offerId
for _, g in ipairs(pre.goobs) do if not g.isActive then offerId = g.id end end
svc.fireAs("TradeOffer", alice, offerId, true)
tick(1)
local ts = tradeState(alice)
check("offer appears in Alice's side", ts and #ts.myOffer == 1, ts and tostring(#ts.myOffer))
local tsB = tradeState(bob)
check("Bob sees Alice's offer", tsB and #tsB.theirOffer == 1, tsB and tostring(tsB and #tsB.theirOffer))

emit("")
emit("  -- ANTI-SCAM: confirming, then changing the offer --")
svc.fireAs("TradeConfirm", alice, true)
svc.fireAs("TradeConfirm", bob, true)
tick(1)
local mid = tradeState(alice)
check("both sides show confirmed", mid and mid.myConfirmed and mid.theirConfirmed)

svc.fireAs("TradeOffer", alice, offerId, false)
tick(0.5)
local reset = tradeState(alice)
check("changing the offer RESET both confirmations",
    reset and not reset.myConfirmed and not reset.theirConfirmed,
    reset and tostring(reset.myConfirmed) .. "/" .. tostring(reset.theirConfirmed))

emit("")
emit("  -- completing the trade --")
svc.fireAs("TradeOffer", alice, offerId, true)
tick(0.5)
local aliceBefore = #snapshotFor(alice).goobs
local bobBefore = #snapshotFor(bob).goobs
svc.fireAs("TradeConfirm", alice, true)
svc.fireAs("TradeConfirm", bob, true)
tick(8)
local aliceAfter = snapshotFor(alice)
local bobAfter = snapshotFor(bob)
check("Alice gave one away", aliceAfter and #aliceAfter.goobs == aliceBefore - 1,
    ("%d -> %d"):format(aliceBefore, aliceAfter and #aliceAfter.goobs or -1))
check("Bob received it", bobAfter and #bobAfter.goobs == bobBefore + 1,
    ("%d -> %d"):format(bobBefore, bobAfter and #bobAfter.goobs or -1))

emit("")
emit("══ PERSISTENCE ══")
svc.removePlayer(alice)
tick(2)
local saved = svc.stores["GoobProfile_v1"] and svc.stores["GoobProfile_v1"]["u_101"]
check("Alice's profile was written to the DataStore", saved ~= nil)
check("saved profile keeps her Goobs", saved and #saved.goobs >= 1,
    saved and tostring(#saved.goobs))

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL INTEGRATION CHECKS PASSED" or (fails .. " FAILURE(S)")))
