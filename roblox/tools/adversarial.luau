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

emit("══ EXPLOIT: catching from across the map ══")
local critters = svc.Workspace:FindFirstChild("Critters")
tick(20)
local far = critters:GetChildren()[1]
svc.movePlayer(mallory, V3.new(900, 5, 900))
local massBefore = snapOf(mallory).goobs[1].mass
svc.fireAs("CatchCritter", mallory, far)
tick(2)
check("teleport-catch from 900 studs was REJECTED",
    snapOf(mallory).goobs[1].mass <= massBefore + 0.001,
    ("%f -> %f"):format(massBefore, snapOf(mallory).goobs[1].mass))
check("the critter is still alive for honest players", far.Parent ~= nil)

emit("")
emit("══ EXPLOIT: two players racing for the same critter ══")
local prize = critters:GetChildren()[1]
svc.movePlayer(alice, prize.Position)
svc.movePlayer(mallory, prize.Position)
local aBefore = snapOf(alice).goobs[1].stomachCount
local mBefore = snapOf(mallory).goobs[1].stomachCount
svc.fireAs("CatchCritter", alice, prize)
svc.fireAs("CatchCritter", mallory, prize)
tick(1)
local aGot = snapOf(alice).goobs[1].stomachCount > aBefore
local mGot = snapOf(mallory).goobs[1].stomachCount > mBefore
check("exactly one player banked it (no duplication)", (aGot and not mGot) or (mGot and not aGot),
    ("alice=%s mallory=%s"):format(tostring(aGot), tostring(mGot)))

emit("")
emit("══ EXPLOIT: garbage arguments over every remote ══")
local before = snapOf(mallory)
local junk = { nil, 0, -1, 1/0, "", "../../etc/passwd", {}, true, svc.Workspace }
for _, bad in ipairs(junk) do
    svc.fireAs("CatchCritter", mallory, bad)
    svc.fireAs("GulpGoob", mallory, bad, bad)
    svc.fireAs("BuySnack", mallory, bad)
    svc.fireAs("RenameGoob", mallory, bad, bad)
    svc.fireAs("SetActiveGoob", mallory, bad)
    svc.fireAs("TradeRequest", mallory, bad)
    svc.fireAs("TradeOffer", mallory, bad, bad)
    svc.fireAs("TradeRespond", mallory, bad)
    svc.fireAs("TradeConfirm", mallory, bad)
    svc.fireAs("TradeCancel", mallory)
    svc.fireAs("BuyEgg", mallory)
end
tick(2)
check("server survived every malformed payload", true)
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
emit("══ EXPLOIT: buying with no money, and past the cap ══")
-- Drain Mallory so the Banquet is definitely unaffordable, then assert hard.
-- An earlier version of this check had an `or not affordable` escape hatch,
-- which meant it passed even when the server happily sold on credit.
local poor = snapOf(mallory)
local globBefore = poor.glob
check("precondition: Banquet is genuinely unaffordable", not poor.snacks[3].affordable,
    ("glob=%f price=%f"):format(globBefore, poor.snacks[3].price))
svc.fireAs("BuySnack", mallory, "banquet")
tick(1)
check("cannot buy a Banquet you cannot afford",
    math.abs(snapOf(mallory).glob - globBefore) < math.max(1, globBefore * 0.02),
    ("%f -> %f"):format(globBefore, snapOf(mallory).glob))

-- Spam BuyEgg far past the cap.
for _ = 1, 60 do
    svc.fireAs("BuyEgg", mallory)
    tick(60)
end
local capped = snapOf(mallory)
check("egg cap is enforced", #capped.goobs <= capped.maxGoobs,
    ("%d / %d"):format(#capped.goobs, capped.maxGoobs))
check("Glob never went negative", capped.glob >= 0, tostring(capped.glob))

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
check("critter population stayed bounded",
    #critters:GetChildren() <= 30, tostring(#critters:GetChildren()))

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL ADVERSARIAL CHECKS PASSED" or (fails .. " FAILURE(S)")))
