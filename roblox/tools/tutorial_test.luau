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
local function tut()
    local s = snapOf(alice)
    return s and s.tutorial or nil
end
local arena = svc.Workspace:FindFirstChild("GoobWorld"):FindFirstChild("Arena")
local function ball()
    return svc.Workspace:FindFirstChild("GoobBall_" .. alice.UserId)
end

emit("══ A NEW PLAYER IS TOLD WHAT TO DO ══")
check("a new player gets a tutorial", tut() ~= nil)
check("it starts at step 1", tut() and tut().index == 1, tut() and tostring(tut().index))
check("step 1 asks them to eat",
    tut() and tut().text:lower():find("eat") ~= nil, tut() and tut().text)
check("it shows progress", tut() and tut().progress == "0 / 12",
    tut() and tostring(tut().progress))

emit("")
emit("══ STEP 1: EAT ══")
-- Eat off the real island. The tutorial must advance on the player DOING the
-- thing, never on a timer, so this drives it the only way a player can.
for _ = 1, 40 do
    local list = arena:GetChildren()
    if #list == 0 then break end
    svc.movePlayer(alice, list[1].Position)
    local b = ball()
    if b then b.Position = list[1].Position end
    tick(0.3)
    if tut() and tut().id ~= "eat" then break end
end
check("eating moved it past step 1", tut() and tut().id ~= "eat",
    tut() and tut().id)

emit("")
emit("══ STEP 2: MELT — the step that matters ══")
-- Melting is the one mechanic in this game a child cannot guess and has not
-- seen elsewhere. If they learn it by watching their number fall for no stated
-- reason they read it as the game being broken, not as the game being tense.
-- So it must be TAUGHT, and taught at the moment it starts.
check("the melt step exists and is reached", tut() and tut().id == "melt",
    tut() and tut().id)
check("it says the word, in plain language",
    tut() and tut().text:lower():find("melt") ~= nil, tut() and tut().text)
check("and it says where the melted goo goes",
    tut() and (tut().hint or ""):lower():find("food") ~= nil, tut() and tut().hint)

-- Keep eating so the melt event keeps firing and the step clears.
for _ = 1, 20 do
    local list = arena:GetChildren()
    if #list > 0 then
        svc.movePlayer(alice, list[1].Position)
        local b = ball()
        if b then b.Position = list[1].Position end
    end
    tick(0.5)
    if tut() and tut().id ~= "melt" then break end
end
check("melting advanced it", tut() and tut().id ~= "melt", tut() and tut().id)

emit("")
emit("══ STEP 3: BANK ══")
check("it now sends them to the Vault", tut() and tut().id == "bank", tut() and tut().id)
check("it says what banking is FOR",
    tut() and (tut().hint or ""):lower():find("keep") ~= nil, tut() and tut().hint)

local globBefore = (snapOf(alice) or {}).glob or 0
-- Roll into the Vault and hold still. Anti-cheat tolerates this because the
-- body is moved the same way the server moves it.
for _ = 1, 40 do
    svc.movePlayer(alice, V3.new(0, 9, 0))
    local b = ball()
    if b then
        b.Position = V3.new(0, 9, 0)
        b.AssemblyLinearVelocity = V3.new(0, 0, 0)
    end
    tick(0.4)
    if tut() and tut().id ~= "bank" then break end
end
check("banking advanced the tutorial", tut() and tut().id ~= "bank", tut() and tut().id)

-- A loop this short has to CLOSE. Without a summary a run simply stops, and
-- the player is left reconstructing what happened from a number that has
-- already been reset to 25.
local runEnd = nil
for i = #_G.TRAFFIC, 1, -1 do
    local t = _G.TRAFFIC[i]
    if t.remote == "Effect" and t.args[1] == "runEnd" then runEnd = t.args[2] break end
end
check("the run reports back when it ends", runEnd ~= nil)
check("and it says how it ended, what it peaked at and what it paid",
    runEnd and runEnd.ended == "banked" and runEnd.peak > 0 and runEnd.payout > 0,
    runEnd and ("%s peak=%s pay=%s"):format(tostring(runEnd.ended),
        tostring(runEnd.peak), tostring(runEnd.payout)))
check("and banking actually paid", ((snapOf(alice) or {}).glob or 0) > globBefore,
    ("%s -> %s"):format(tostring(globBefore), tostring((snapOf(alice) or {}).glob)))

emit("")
emit("══ STEP 4: THE POWER ══")
check("it asks for the power button", tut() and tut().id == "power", tut() and tut().id)
-- The coach must POINT at the button, not just describe it. The pointer was
-- resolved through a hardcoded list of two controls the arena rework deleted,
-- so this step had nothing to point at and the player was left hunting.
check("the power step points at a real control",
    tut() and tut().target == "power", tut() and tostring(tut().target))
-- Asserted against the live registry, not against a global that does not
-- exist. The first version of this read _G.CLIENT_HUD, which is nil, so the
-- whole check collapsed to "true" and would have passed with nothing wired
-- at all.
check("and that control has been registered by the HUD that owns it",
    (function()
        local Hud = _G.CLIENT("Hud")
        return Hud ~= nil and Hud.targets ~= nil and Hud.targets.power ~= nil
    end)())

check("it warns the power costs you something",
    tut() and (tut().hint or ""):lower():find("cost") ~= nil, tut() and tut().hint)

-- Feed up first: a power costs mass, and the server refuses the press if
-- paying for it would drop the player below the floor.
for _ = 1, 30 do
    local list = arena:GetChildren()
    if #list > 0 then
        svc.movePlayer(alice, list[1].Position)
        local b = ball()
        if b then b.Position = list[1].Position end
    end
    tick(0.3)
end
svc.fireAs("UsePower", alice, V3.new(0, 0, 1))
tick(1)
check("using a power finished the tutorial", tut() and tut().id == "done",
    tut() and tut().id)
check("the closing line states the loop",
    tut() and tut().text:lower():find("bank") ~= nil, tut() and tut().text)

emit("")
emit("══ COUNTED STEPS DO NOT SHARE A COUNTER ══")
-- Straight at the module, because the integration walk cannot see this: with a
-- shared counter a later counted step inherits an earlier one's total and
-- completes early rather than not at all, so every end-to-end assertion still
-- passes while the lesson is skipped.
local Tutorial = _G.SHARED("Tutorial")
local st = Tutorial.blank()
for _ = 1, 12 do Tutorial.advance(st, "eat") end
check("the counted first step completed", Tutorial.display(st).id == "melt",
    Tutorial.display(st).id)
check("its counter reset for the next counted step",
    (st.caught or 0) == 0, tostring(st.caught))
for _ = 1, 39 do Tutorial.advance(st, "melt") end
check("39 of 40 is not enough to clear the melt lesson",
    Tutorial.display(st).id == "melt", Tutorial.display(st).id)
Tutorial.advance(st, "melt")
check("the fortieth clears it", Tutorial.display(st).id == "bank",
    Tutorial.display(st).id)

emit("")
emit("══ IT CAN BE SKIPPED ══")
svc.fireAs("DismissTutorial", alice)
tick(1)
check("dismissing hides it for good", tut() == nil, tut() and tut().id)

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL TUTORIAL CHECKS PASSED" or (fails .. " FAILURE(S)")))
