--!nolint
-- roll_test.luau — the rolling body, its anti-cheat, and ascension.

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
local function snapOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "StateSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
end
local function lastNotify(name)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "Notify" and t.player ~= "ALL" and t.player.Name == name then
            return t.args[1]
        end
    end
end

_G.BOOT_SERVER()
tick(1)
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 40))
tick(3)
local function ball() return svc.Workspace:FindFirstChild("GoobBall_101") end

emit("══ YOU ARE THE GOOB ══")
check("a rolling body exists", ball() ~= nil)
check("the avatar is hidden", (function()
    for _, d in ipairs(alice.Character:GetDescendants()) do
        if d:IsA("BasePart") and d.Transparency ~= 1 then return false end
    end
    return true
end)())
check("the avatar cannot collide", (function()
    for _, d in ipairs(alice.Character:GetDescendants()) do
        if d:IsA("BasePart") and d.CanCollide then return false end
    end
    return true
end)())
check("the body is welded to the character", (function()
    for _, d in ipairs(ball():GetChildren()) do
        if d:IsA("WeldConstraint") and d.Name == "GoobBallWeld" then return true end
    end
    return false
end)())

emit("")
emit("══ THE WORLD IS A PLACE NOW ══")
local world = svc.Workspace:FindFirstChild("GoobWorld")
local zones = { "HubFloor", "ScrapyardFloor", "SlickfieldFloor", "DeepFloor" }
for _, z in ipairs(zones) do
    check("zone built: " .. z, world:FindFirstChild(z) ~= nil)
end
local signs, ramps = 0, 0
for _, c in ipairs(world:GetChildren()) do
    if c.Name:match("^Sign_") then signs += 1 end
    if c.Name == "Ramp" then ramps += 1 end
end
check("signposts exist so the map explains itself", signs >= 6, tostring(signs))
check("ramps exist so momentum has somewhere to go", ramps >= 8, tostring(ramps))
check("the ascension altar is built", world:FindFirstChild("AscensionAltar") ~= nil)
local ice = world:FindFirstChild("SlickfieldFloor")
check("the Slickfield is genuinely slippery",
    ice and ice.CustomPhysicalProperties and ice.CustomPhysicalProperties.Friction < 0.1,
    ice and ice.CustomPhysicalProperties and tostring(ice.CustomPhysicalProperties.Friction))

emit("")
emit("══ REACH SCALES WITH SIZE ══")
local smallReach = ball().Size.X / 2
local before = snapOf(alice).goobs[1].mass
-- Grow the Goob a lot, then confirm the body grew with it.
for _ = 1, 40 do
    local critters = svc.Workspace:FindFirstChild("Critters")
    local list = critters:GetChildren()
    if #list > 0 then
        svc.movePlayer(alice, list[1].Position)
        ball().Position = list[1].Position
        svc.fireAs("CatchCritter", alice, list[1])
    end
    tick(1)
end
tick(30)
local after = snapOf(alice).goobs[1].mass
check("mass grew from catching", after > before, ("%f -> %f"):format(before, after))
check("the body grew with the mass", ball().Size.X / 2 > smallReach,
    ("%f -> %f"):format(smallReach, ball().Size.X / 2))

emit("")
emit("══ ANTI-CHEAT: CLIENT OWNS THE PHYSICS ══")
local b = ball()
local honest = b.Position
-- Three consecutive impossible jumps is the threshold; one is network noise.
for _ = 1, 5 do
    b.Position = b.Position + V3.new(4000, 0, 0)
    tick(0.3)
end
local drifted = (ball().Position - honest).Magnitude
check("a teleporting body is snapped back", drifted < 3000, ("moved %.0f studs"):format(drifted))

emit("")
emit("══ ASCENSION: the goal ══")
local snap = snapOf(alice)
check("cannot ascend below Colossal", snap.canAscend == false, tostring(snap.canAscend))
check("and it says why", (snap.ascendReason or ""):find("COLOSSAL") ~= nil,
    tostring(snap.ascendReason))

-- Seed a save that is already Colossal and join it through the REAL load path,
-- rather than pretending. Grinding to 5M inside the sim would take far longer
-- than the suite should run, and faking the number in memory would test nothing.
svc.stores["GoobProfile_v1"]["u_555"] = {
    version = 1, glob = 50000,
    goobs = { {
        id = "titanic", nickname = "Bigly", hue = 0.1,
        mass = 9000000, stomach = {},
        bornAt = 1, inheritedAge = 60 * 60 * 24 * 40,
        lineage = { "a", "b" }, contents = { duck = 40 },
    } },
    activeGoobId = "titanic", lastSeen = 1,
    stats = { caught = 5000, gulps = 20, trades = 3, bestMass = 9000000 },
    discovered = {}, crests = 0, totalAscensions = 0,
}
local titan = svc.addPlayer("Titan", 555, V3.new(0, 5, 40))
tick(4)
local ts = snapOf(titan)
check("a Colossal Goob may ascend", ts and ts.canAscend == true,
    ts and tostring(ts.ascendReason))
check("the preview states what is lost", ts and ts.ascendPreview
    and ts.ascendPreview.losing == "Bigly", ts and ts.ascendPreview and tostring(ts.ascendPreview.losing))
check("and what is gained", ts and ts.ascendPreview
    and ts.ascendPreview.multiplierAfter > ts.ascendPreview.multiplierBefore,
    ts and ts.ascendPreview and ("%f -> %f"):format(
        ts.ascendPreview.multiplierBefore, ts.ascendPreview.multiplierAfter))

-- Away from the altar it must refuse.
--
-- NOTE: do not advance the clock between moving and firing. The anti-cheat
-- sampler treats a 900-stud jump as a teleport and snaps the ball back to its
-- last good position — which is near spawn, only ~56 studs from the altar and
-- INSIDE the range check. An earlier version of this test ticked first and so
-- "ascended from 900 studs away", which was the cheat protection rescuing the
-- cheater rather than the range check failing.
local tball = svc.Workspace:FindFirstChild("GoobBall_555")
svc.movePlayer(titan, V3.new(1400, 5, 1400))
if tball then tball.Position = V3.new(1400, 5, 1400) end
local altarPos = V3.new(0, 3, 96)
local dist = ((tball and tball.Position or V3.new(0, 0, 0)) - altarPos).Magnitude
check("precondition: genuinely far from the altar", dist > 500, ("%.0f studs"):format(dist))
svc.fireAs("Ascend", titan)   -- fired in the same tick, before the sampler runs
tick(2)
check("refuses away from the altar", (lastNotify("Titan") or ""):find("altar") ~= nil,
    tostring(lastNotify("Titan")))
check("the Goob survived the refusal", #snapOf(titan).goobs == 1)
check("no crest was granted", (snapOf(titan).crests or 0) == 0,
    tostring(snapOf(titan).crests))

-- Roll to the altar and do it.
local altar = V3.new(0, 3, 96)
svc.movePlayer(titan, altar)
tball = svc.Workspace:FindFirstChild("GoobBall_555")
if tball then tball.Position = altar end
local beforeMult = snapOf(titan).foodMultiplier
svc.fireAs("Ascend", titan)
tick(3)
local after = snapOf(titan)
check("ASCENDED at the altar", after.crests == 1, "crests=" .. tostring(after.crests))
check("the Colossal Goob was destroyed", (function()
    for _, g in ipairs(after.goobs) do if g.nickname == "Bigly" then return false end end
    return true
end)())
check("they are not left with nothing", #after.goobs >= 1, tostring(#after.goobs))
check("the new Goob starts small", after.goobs[1].mass < 1000,
    tostring(after.goobs[1].mass))
check("food is permanently worth more", after.foodMultiplier > beforeMult,
    ("%f -> %f"):format(beforeMult, after.foodMultiplier))
check("the whole server was told", (function()
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "Notify" and t.player == "ALL"
            and tostring(t.args[1]):find("ASCENDED") then return true end
    end
    return false
end)())

-- The permanent bonus must survive a rejoin.
svc.removePlayer(titan)
tick(2)
local saved = svc.stores["GoobProfile_v1"]["u_555"]
check("crests persist to the DataStore", saved and saved.crests == 1,
    saved and tostring(saved.crests))

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL ROLL CHECKS PASSED" or (fails .. " FAILURE(S)")))
