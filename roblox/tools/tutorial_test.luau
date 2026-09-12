--!nolint
-- tutorial_test.luau — walk a brand-new player through the whole first run.

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
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 10))
tick(2)
svc.enterClientMode(alice)
_G.BOOT_CLIENT()
tick(2)

emit("══ A NEW PLAYER IS TOLD WHAT TO DO ══")
local snap = snapOf(alice)
check("a new player gets a tutorial", snap and snap.tutorial ~= nil)
check("it starts at step 1", snap and snap.tutorial and snap.tutorial.index == 1,
    snap and snap.tutorial and tostring(snap.tutorial.index))
check("step 1 asks them to catch", snap and snap.tutorial
    and snap.tutorial.text:lower():find("junk") ~= nil, snap and snap.tutorial and snap.tutorial.text)
check("it shows progress", snap and snap.tutorial and snap.tutorial.progress == "0 / 5",
    snap and snap.tutorial and tostring(snap.tutorial.progress))

local hud = alice:FindFirstChild("PlayerGui"):FindFirstChild("GoobHud")
local coach = hud and hud:FindFirstChild("Coach")
check("the coach banner is on screen", coach ~= nil and coach.Visible == true)
local line = coach and coach:FindFirstChild("Line")
check("the banner shows the instruction", line and line.Text ~= "",
    line and tostring(line.Text))

emit("")
emit("══ CATCHING ADVANCES IT ══")
local critters = svc.Workspace:FindFirstChild("Critters")
tick(25)
local caught = 0
while caught < 5 do
    local list = critters:GetChildren()
    if #list == 0 then tick(8) list = critters:GetChildren() end
    if #list == 0 then break end
    local target = list[1]
    svc.movePlayer(alice, target.Position)
    svc.fireAs("CatchCritter", alice, target)
    tick(0.5)
    caught += 1
end
tick(2)
local afterCatch = snapOf(alice)
check("catching 5 things moved it past step 1",
    afterCatch and afterCatch.tutorial and afterCatch.tutorial.index > 1,
    afterCatch and afterCatch.tutorial and
        ("index=%s %s"):format(tostring(afterCatch.tutorial.index), tostring(afterCatch.tutorial.text)))

emit("")
emit("══ THE SNACK STEP POINTS AT THE SNACK BUTTON ══")
-- Walk forward to whichever step is next until we reach the snack step.
local guard = 0
while guard < 8 do
    local s = snapOf(alice)
    if not s or not s.tutorial then break end
    if s.tutorial.id == "snack" then break end
    if s.tutorial.id == "catch" or s.tutorial.id == "digest" then
        local list = critters:GetChildren()
        if #list > 0 then
            svc.movePlayer(alice, list[1].Position)
            svc.fireAs("CatchCritter", alice, list[1])
        end
        tick(3)
    else
        break
    end
    guard += 1
end
local atSnack = snapOf(alice)
check("reached the snack step", atSnack and atSnack.tutorial and atSnack.tutorial.id == "snack",
    atSnack and atSnack.tutorial and tostring(atSnack.tutorial.id))
check("it targets the snack button", atSnack and atSnack.tutorial
    and atSnack.tutorial.target == "snack",
    atSnack and atSnack.tutorial and tostring(atSnack.tutorial.target))

tick(400)
svc.fireAs("BuySnack", alice, "snack")
tick(3)
local afterSnack = snapOf(alice)
check("buying a snack advanced it", afterSnack and afterSnack.tutorial
    and afterSnack.tutorial.id ~= "snack",
    afterSnack and afterSnack.tutorial and tostring(afterSnack.tutorial.id))

emit("")
emit("══ EGG, THEN GULP — the mechanic nothing else explains ══")
check("now asking for an egg", afterSnack and afterSnack.tutorial
    and afterSnack.tutorial.id == "egg",
    afterSnack and afterSnack.tutorial and tostring(afterSnack.tutorial.id))

local tries = 0
while tries < 40 do
    local s = snapOf(alice)
    if s and s.eggAffordable then break end
    tick(300); tries += 1
end
svc.fireAs("BuyEgg", alice)
tick(3)
local afterEgg = snapOf(alice)
check("hatching advanced it to the gulp step",
    afterEgg and afterEgg.tutorial and afterEgg.tutorial.id == "gulp",
    afterEgg and afterEgg.tutorial and tostring(afterEgg.tutorial.id))
check("the gulp step explains the consequence",
    afterEgg and afterEgg.tutorial and (afterEgg.tutorial.hint or ""):lower():find("gone forever") ~= nil,
    afterEgg and afterEgg.tutorial and tostring(afterEgg.tutorial.hint))

local activeId, otherId
for _, g in ipairs(afterEgg.goobs) do
    if g.isActive then activeId = g.id else otherId = g.id end
end
svc.fireAs("GulpGoob", alice, activeId, otherId)
tick(3)
local afterGulp = snapOf(alice)
check("gulping finished the tutorial",
    afterGulp and afterGulp.tutorial and afterGulp.tutorial.done == true,
    afterGulp and afterGulp.tutorial and tostring(afterGulp.tutorial.id))
check("the last step points at trading",
    afterGulp and afterGulp.tutorial and afterGulp.tutorial.text:lower():find("trade") ~= nil,
    afterGulp and afterGulp.tutorial and tostring(afterGulp.tutorial.text))

emit("")
emit("══ IT CAN BE SKIPPED, AND IT PERSISTS ══")
svc.fireAs("DismissTutorial", alice)
tick(2)
check("dismissing hides it", snapOf(alice).tutorial == nil,
    tostring(snapOf(alice).tutorial))

svc.removePlayer(alice)
tick(2)
local saved = svc.stores["GoobProfile_v1"]["u_101"]
check("tutorial state was saved", saved and saved.tutorial ~= nil)
check("it stays dismissed across sessions", saved and saved.tutorial.dismissed == true)

emit("")
emit("══ AN EXISTING PLAYER IS NOT RE-TAUGHT ══")
-- A save written before the tutorial existed has no `tutorial` field at all.
svc.stores["GoobProfile_v1"]["u_777"] = {
    version = 1, glob = 5000,
    goobs = { { id = "old", nickname = "Veteran", hue = 0.5, mass = 90000,
                stomach = {}, bornAt = 1, inheritedAge = 0, lineage = {}, contents = {} } },
    activeGoobId = "old", lastSeen = 1,
    stats = { caught = 900, gulps = 12, trades = 4, bestMass = 90000 },
    discovered = {},
}
local vet = svc.addPlayer("Veteran", 777, V3.new(0, 5, 0))
tick(3)
local vetSnap = snapOf(vet)
check("a pre-tutorial save is not walked through it",
    vetSnap and vetSnap.tutorial == nil,
    vetSnap and vetSnap.tutorial and tostring(vetSnap.tutorial.text))
check("their Goob survived the migration intact",
    vetSnap and #vetSnap.goobs == 1 and vetSnap.goobs[1].nickname == "Veteran",
    vetSnap and tostring(#vetSnap.goobs))

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL TUTORIAL CHECKS PASSED" or (fails .. " FAILURE(S)")))
