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

-- WAIT FOR A ROUND. The arena is not permanently live any more: it cycles
-- LOBBY -> PLAYING -> RESULTS, and nothing can be eaten, spawned or deflated
-- outside PLAYING. Every scenario that acts on the island has to arrive at the
-- right moment rather than assuming one.
local function phaseOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "ArenaSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1].phase, t.args[1].phaseLeft or 0
        end
    end
    return nil, 0
end

local function waitForRound(p, budget)
    for _ = 1, math.floor((budget or 90) / 0.5) do
        local ph = phaseOf(p)
        if ph == "PLAYING" then return true end
        tick(0.5)
    end
    return phaseOf(p) == "PLAYING"
end

-- Seconds of round left, so a long scenario can tell when it is about to be
-- reset out from under itself.
local function roundLeft(p)
    local ph, left = phaseOf(p)
    return ph == "PLAYING" and left or 0
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

check("a round starts on its own", waitForRound(alice), tostring(phaseOf(alice)))
local arena = svc.Workspace:FindFirstChild("GoobWorld"):FindFirstChild("Arena")
local function ball()
    return svc.Workspace:FindFirstChild("GoobBall_" .. alice.UserId)
end
local function feed(n)
    for _ = 1, n do
        local list = arena:GetChildren()
        local target
        for _, d in ipairs(list) do
            if d.Name == "Pellet" or d.Name == "Crumb" then target = d break end
        end
        if not target then break end
        svc.movePlayer(alice, target.Position)
        local b = ball()
        if b then b.Position = target.Position end
        tick(0.3)
    end
end

emit("")
emit("══ EAT, THEN GROW ══")
feed(90)
check("eating moved it past step 1", tut() and tut().id ~= "eat", tut() and tut().id)

-- The GROW step is counted on purpose. A single frame of "you got bigger"
-- teaches nothing; the lesson is that it keeps going, with no cap, which is
-- the entire promise of a round.
check("the grow step is reached", tut() and (tut().id == "grow" or tut().id == "power"),
    tut() and tut().id)
if tut() and tut().id == "grow" then
    check("it says there is no limit",
        tut().text:lower():find("no size limit") ~= nil, tut().text)
    feed(60)
end
check("growing advanced it", tut() and tut().id ~= "grow", tut() and tut().id)

emit("")
emit("══ THE POWER ══")
check("it asks for the power button", tut() and tut().id == "power", tut() and tut().id)
check("the power step points at a real control",
    tut() and tut().target == "power", tut() and tostring(tut().target))
check("and that control has been registered by the HUD that owns it",
    (function()
        local Hud = _G.CLIENT("Hud")
        return Hud ~= nil and Hud.targets ~= nil and Hud.targets.power ~= nil
    end)())
check("it warns the power costs you something",
    tut() and (tut().hint or ""):lower():find("cost") ~= nil, tut() and tut().hint)

feed(40)
svc.fireAs("UsePower", alice, V3.new(0, 0, 1))
tick(1)
check("using a power advanced the tutorial", tut() and tut().id ~= "power",
    tut() and tut().id)

emit("")
emit("══ DEFLATION IS TAUGHT ══")
-- The catch-up mechanism has to be explained or it is invisible: a player who
-- does not know powers knock size off other blobs has no idea why they would
-- ever attack somebody bigger than them.
check("the deflate step exists", tut() and (tut().id == "deflate" or tut().id == "done"),
    tut() and tut().id)
if tut() and tut().id == "deflate" then
    check("it explains that size comes OFF the target",
        tut().text:lower():find("off") ~= nil, tut().text)
    check("and that the bigger they are the more you get",
        (tut().hint or ""):lower():find("bigger") ~= nil, tut().hint)
end

emit("")
emit("══ COUNTED STEPS DO NOT SHARE A COUNTER ══")
-- Straight at the module, because the integration walk cannot see this: with a
-- shared counter a later counted step inherits an earlier one's total and
-- completes early rather than not at all, so every end-to-end assertion still
-- passes while the lesson is skipped.
local Tutorial = _G.SHARED("Tutorial")
local st = Tutorial.blank()
for _ = 1, 12 do Tutorial.advance(st, "eat") end
check("the counted first step completed", Tutorial.display(st).id == "grow",
    Tutorial.display(st).id)
check("its counter reset for the next counted step",
    (st.caught or 0) == 0, tostring(st.caught))
for _ = 1, 29 do Tutorial.advance(st, "grow") end
check("29 of 30 is not enough to clear the grow lesson",
    Tutorial.display(st).id == "grow", Tutorial.display(st).id)
Tutorial.advance(st, "grow")
check("the thirtieth clears it", Tutorial.display(st).id == "power",
    Tutorial.display(st).id)

emit("")
emit("══ IT CAN BE SKIPPED ══")
svc.fireAs("DismissTutorial", alice)
tick(1)
check("dismissing hides it for good", tut() == nil, tut() and tut().id)

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL TUTORIAL CHECKS PASSED" or (fails .. " FAILURE(S)")))

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
    error(fails .. " tutorial failure(s)")
end
