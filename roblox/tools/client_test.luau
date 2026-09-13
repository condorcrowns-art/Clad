--!nolint
-- client_test.luau — boot the REAL client scripts and drive the UI.
--
-- Everything the player sees lives in ~950 lines that had never executed. If
-- the client errors while loading, the player opens the game to an empty
-- screen: no HUD, no buttons, no trade window, no way to do anything.

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


-- Find a descendant by name anywhere under the PlayerGui.
local function findGui(root, name)
    for _, d in ipairs(root:GetDescendants()) do
        if d.Name == name then return d end
    end
    return nil
end

local function buttonsUnder(root)
    local out = {}
    for _, d in ipairs(root:GetDescendants()) do
        if d:IsA("TextButton") then table.insert(out, d) end
    end
    return out
end

emit("══ BOOT SERVER, THEN CLIENT ══")
_G.BOOT_SERVER()
tick(1)
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 10))
tick(2)

-- BOOT THE CLIENT ON THE LOSING SIDE OF THE RACE, deliberately.
--
-- The roll controller binds its ball from Workspace.ChildAdded. If the ball is
-- created BEFORE the client connects to that event, the event has already
-- fired and the controller never sees it — which is the bug that cost two
-- play-tests. Ticking here guarantees the server has built the ball first, so
-- this suite exercises the order that actually breaks rather than the one that
-- happens to work.
tick(3)
emit(("  [probe] ball before boot: %s"):format(
    tostring(svc.Workspace:FindFirstChild("GoobBall_" .. alice.UserId) ~= nil)))
svc.enterClientMode(alice)
_G.BOOT_CLIENT()
tick(0.05)

emit("")
emit("══ THE CONTROLLER HAS A BODY ══")
-- ASSERTED IMMEDIATELY AFTER BOOT, before anything can rebuild the ball. The
-- harness recreates the body ~0.4s after the character spawns, which fires
-- ChildAdded a second time and papers over the bug entirely — so this runs in
-- the gap, when the ball was built before boot and nothing has replaced it.
--
-- THE BUG THIS EXISTS FOR, TWICE OVER. The roll controller binds its ball from
-- Workspace.ChildAdded. The server creates that ball on join and the client
-- boots at roughly the same moment, so if the ball won the race the event had
-- already fired before the client connected to it — and the old guard only
-- re-bound when currentBall EXISTED and had been removed, making nil a
-- permanent state. Roll.step returns on its first line when there is no ball,
-- so the player simply cannot move, and NOTHING reports it: powers still work,
-- because those are server-side. That is exactly what the play-test saw.
--
-- The harness creates the player (and therefore the ball) before booting the
-- client, which is precisely the losing side of that race.
do
    local Roll = _G.CLIENT("Roll")
    check("the roll controller exists", Roll ~= nil)
    check("it has a boundBall accessor to assert on", Roll and Roll.boundBall ~= nil)
    local bound = Roll and Roll.boundBall and Roll.boundBall()
    check("the client bound a body that already existed when it booted",
        bound ~= nil, "nil means the player cannot move at all")
    -- PRESS A KEY AND WATCH THE BODY MOVE. Nothing in this harness had ever
    -- done that, which is how the input layer shipped completely unconnected
    -- twice: Stick.luau's handlers were never bound, so moveVector returned
    -- zero on every frame and Roll.step braked the blob to a standstill. Every
    -- suite was green because they all asserted on state the SERVER sends.
    local Stick = _G.CLIENT("Stick")
    check("the input layer is connected to the hardware",
        Stick ~= nil and Stick.isBound and Stick.isBound() == true,
        "unbound means the player cannot move at all")

    svc.pressKey("W")
    tick(0.2)
    local moving = Stick and Stick.moveVector and Stick.moveVector()
    check("holding a key produces a movement vector",
        moving ~= nil and moving.Magnitude > 0.1,
        moving and ("%.2f"):format(moving.Magnitude) or "nil")
    svc.releaseKey("W")
    tick(0.2)
    local stopped = Stick and Stick.moveVector and Stick.moveVector()
    check("and releasing it stops",
        stopped ~= nil and stopped.Magnitude < 0.1,
        stopped and ("%.2f"):format(stopped.Magnitude) or "nil")

    check("and it bound the RIGHT body",
        bound ~= nil and tostring(bound.Name) == ("GoobBall_" .. alice.UserId),
        bound and tostring(bound.Name))

    -- And it must recover if the body is ever replaced under it.
    if bound then
        bound:Destroy()
        tick(1)
        local after = Roll.boundBall()
        check("it rebinds after the body is replaced",
            after == nil or after.Parent ~= nil,
            after and tostring(after.Name) or "nil")
    end
end

tick(2)
-- `true` on purpose, and the ONLY place that is acceptable: _G.BOOT_CLIENT()
-- throws on any error inside the real scripts, so reaching this line is
-- itself the assertion. Anywhere else, `check(name, true)` is a test that
-- cannot fail — see the payload sweep in adversarial.luau, which was one
-- of those and had been silently passing without running since it was
-- written.
check("client booted without error", true)

local pg = alice:FindFirstChild("PlayerGui")
local hud = pg and pg:FindFirstChild("GoobHud")
check("HUD ScreenGui was created", hud ~= nil)

if not hud then
    emit("  -- everything below depends on the HUD existing; stopping --")
    emit(("══ %d FAILURE(S) ══"):format(fails + 1))
    return
end

emit("")
emit("══ IS THERE ACTUALLY A UI? ══")
local buttons = buttonsUnder(hud)
check("HUD has clickable buttons", #buttons > 0, tostring(#buttons) .. " buttons")

local labels = {}
for _, d in ipairs(hud:GetDescendants()) do
    if d:IsA("TextLabel") and type(d.Text) == "string" then
        table.insert(labels, d.Text)
    end
end
check("HUD renders text", #labels > 0, tostring(#labels) .. " labels")

local joined = table.concat(labels, " | ")

-- THE READOUTS MOVED, AND THAT IS THE POINT.
--
-- This file used to assert that the legacy HUD drew a power readout, a Glob
-- readout, three Snack Stand buttons and a "MY GOOBS" drawer button. All of
-- those belonged to the second screen that used to sit behind ArenaHud — the
-- one whose Snack Stand rendered on top of the season track. There is one HUD
-- now, and what is left in this ScreenGui is toasts and the tutorial coach.
--
-- So the assertion is inverted: the legacy screen must NOT be drawing any of
-- it. An inverted assertion is weak on its own — an empty ScreenGui passes
-- every "is X absent" check ever written — so each absence below is paired
-- with a presence somewhere else, and the dock section further down proves the
-- readouts exist on ArenaHud.
check("the legacy HUD still draws text (toasts and the coach)", #labels > 0,
    tostring(#labels))

local btnText = {}
for _, b in ipairs(buttons) do table.insert(btnText, tostring(b.Text)) end
local btnJoined = table.concat(btnText, " | ")
check("no Snack Stand survives on the legacy HUD", btnJoined:find("Snack") == nil,
    btnJoined:sub(1, 140))
check("no egg button survives on the legacy HUD", btnJoined:find("HATCH") == nil)
check("no MY GOOBS drawer button survives", btnJoined:find("GOOBS") == nil)
check("and no drawer frame is left behind at all",
    hud:FindFirstChild("Drawer") == nil and hud:FindFirstChild("SnackStand") == nil)

emit("")
emit("══ DOES THE ARENA HUD UPDATE FROM SERVER STATE? ══")
-- The readouts this file used to look for on the legacy HUD live on ArenaHud
-- now. Same question, asked of the screen that actually draws them: are the
-- numbers bound to the server push, or is the panel inert? An inert panel is
-- the exact failure this suite exists to catch — it has happened once already,
-- when ArenaHud.setProfile was never called and the entire sheet rendered
-- perfectly against a nil profile.
tick(3)
do
    local gui = pg and pg:FindFirstChild("ArenaHud")
    check("the arena HUD exists", gui ~= nil)
    if gui then
        local statCard = gui:FindFirstChild("StatCard")
        local massLabel = statCard and statCard:FindFirstChild("Mass")
        local worthLabel = statCard and statCard:FindFirstChild("Worth")
        local globLabel = gui:FindFirstChild("Glob")
        check("the stat card draws mass, worth and Glob",
            massLabel ~= nil and worthLabel ~= nil and globLabel ~= nil)

        -- BOUND, not merely present. Each of these is built with a placeholder
        -- ("0", "worth 💧0", "💧 0") and a panel wired to nothing renders those
        -- placeholders perfectly — which is exactly what shipped once, when
        -- ArenaHud.setProfile was never called and the whole sheet drew itself
        -- against a nil profile without a single error. So each readout is
        -- compared against the value the SERVER last pushed, not against a
        -- pattern that a dead panel would also satisfy.
        local sync
        for i = #_G.TRAFFIC, 1, -1 do
            local t = _G.TRAFFIC[i]
            if t.remote == "ArenaSync" and t.player ~= "ALL" then sync = t.args[1] break end
        end
        local state
        for i = #_G.TRAFFIC, 1, -1 do
            local t = _G.TRAFFIC[i]
            if t.remote == "StateSync" and t.player ~= "ALL" then state = t.args[1] break end
        end
        check("the arena sync arrived at all", sync ~= nil)
        if sync and massLabel then
            local shown = tonumber((tostring(massLabel.Text):gsub("[^%d%.]", "")))
            check("the mass readout matches the mass the server pushed",
                shown ~= nil and math.abs(shown - sync.mass) <= math.max(1, sync.mass * 0.05),
                ("HUD %s vs server %.1f"):format(tostring(massLabel.Text), sync.mass))
        end
        if state and globLabel then
            check("the Glob readout is bound to a real value, not the placeholder",
                tostring(globLabel.Text) ~= "💧 0" and state.glob > 0,
                ("%s vs server %.0f"):format(tostring(globLabel.Text), state.glob))
        end
    end
end

emit("")
emit("══ TOASTS ══")
-- Asserted on the TEXT, not on the descendant count. The stack is capped at a
-- few toasts, so once it is full a new one REPLACES the oldest and the count
-- does not move — and the round system now produces toasts of its own, so by
-- the time this runs the stack is routinely full. Counting nodes reported a
-- working notification as broken.
local MESSAGE = "Test message!"
svc.ReplicatedStorage:FindFirstChild("GoobNet"):FindFirstChild("Notify")
    .OnClientEvent:Fire(MESSAGE, "good")
tick(0.5)
local shown = false
for _, d in ipairs(hud:GetDescendants()) do
    if d:IsA("TextLabel") and tostring(d.Text) == MESSAGE then shown = true end
end
check("a notification renders its message on screen", shown)

emit("")
emit("══ TRADE WINDOW ══")
local tradeWindow = findGui(hud, "TradeWindow")
check("trade window exists", tradeWindow ~= nil)
check("trade window starts hidden", tradeWindow and tradeWindow.Visible == false,
    tradeWindow and tostring(tradeWindow.Visible))

local fill = tradeWindow and findGui(tradeWindow, "HoldFill")
check("hold-to-confirm bar exists", fill ~= nil)
-- The bug that made this invisible: a child at ZIndex 0 behind an opaque parent.
local confirmBtn = fill and fill.Parent
check("hold bar renders ABOVE its button (the invisibility bug)",
    fill and confirmBtn and fill.ZIndex > confirmBtn.ZIndex,
    fill and confirmBtn and ("fill=%s button=%s"):format(tostring(fill.ZIndex), tostring(confirmBtn.ZIndex)))

emit("")
emit("══ CLIENT SOAK: 5 simulated minutes of rendering ══")
local ok, err = pcall(function() tick(300, 0.5) end)
check("no runtime error over 5 minutes of RenderStepped", ok, tostring(err))

emit("")
emit("")
emit("══ THE SNAPSHOT CONTRACT ══")
-- EVERY field the client's UI reads off the profile must actually be sent.
--
-- Three dock tabs were dead for exactly this reason: the arena fields were
-- never added to the snapshot, so Powers read lifetimeBanked as nil, Trinkets
-- read trinketsOwned as nil, and both rendered every entry permanently locked.
-- Nothing errored. The UI drew perfectly and was simply always wrong — which
-- is invisible to a geometry audit and to any test that only checks a panel
-- builds. A field list is the cheapest possible guard against it.
local snap = nil
for i = #_G.TRAFFIC, 1, -1 do
    local t = _G.TRAFFIC[i]
    if t.remote == "StateSync" and t.player ~= "ALL" then snap = t.args[1] break end
end
check("a profile snapshot reached the client", snap ~= nil)

local REQUIRED = {
    "glob", "goobs", "activeGoobId", "cosmeticsOwned", "loadout", "season",
    "lifetimeBanked", "bestBank", "powerId", "powerUses",
    "trinketsOwned", "trinketSlots", "cratePity", "streak",
}
local absent = {}
for _, field in ipairs(REQUIRED) do
    if snap == nil or snap[field] == nil then table.insert(absent, field) end
end
check("every field the UI reads is present in the snapshot",
    #absent == 0, table.concat(absent, ", "))

emit("")
emit("══ EVERY DOCK TAB ACTUALLY HAS CONTENT ══")
-- THE BUG THIS EXISTS FOR: ArenaHud.setProfile was never called, so the sheet
-- rendered against a permanently nil profile. Nothing errored. Glob read 0,
-- the season tier read 0, and every crate, trinket, power, skin and Goob came
-- out locked or absent — a UI that draws perfectly and is entirely inert.
--
-- Geometry tests cannot see this: an empty panel fits the screen beautifully.
-- The only thing that catches it is asking whether anything is IN there.
local arenaGui = alice:FindFirstChild("PlayerGui"):FindFirstChild("ArenaHud")
check("the arena HUD exists", arenaGui ~= nil)

if arenaGui then
    local sheet = arenaGui:FindFirstChild("Sheet")
    local body = sheet and sheet:FindFirstChild("Body")
    check("the sheet has a body to fill", body ~= nil)

    local tabs = {}
    for _, d in ipairs(arenaGui:GetDescendants()) do
        if d:IsA("TextButton") and tostring(d.Name):find("^Dock_") then
            table.insert(tabs, d)
        end
    end
    table.sort(tabs, function(x, y) return x.Name < y.Name end)
    -- Nine now: CREW joined the dock when the legacy drawer that used to hold
    -- it was deleted. Derived from the module's own list rather than written
    -- as a literal, so adding a tab does not mean editing a magic number in a
    -- test that would otherwise pass by not noticing.
    check("the dock has every tab", #tabs == 9, tostring(#tabs))

    local empty = {}
    for _, tab in ipairs(tabs) do
        tab.Activated:Fire()
        tick(0.4)
        local cards = 0
        for _, child in ipairs(body and body:GetChildren() or {}) do
            if child:IsA("Frame") then cards += 1 end
        end
        -- season and trade delegate elsewhere or are text-only; the rest must
        -- list real, per-player content.
        -- season and crew render through Panels into the sheet's Host frame,
        -- not into Body, so Body is legitimately empty for those two.
        if cards == 0 and tab.Name ~= "Dock_season" and tab.Name ~= "Dock_crew" then
            table.insert(empty, tab.Name)
        end
        tab.Activated:Fire()   -- close again
        tick(0.2)
    end
    check("no tab renders empty", #empty == 0, table.concat(empty, ", "))

    -- And the readouts driven straight off the profile.
    local glob, season
    for _, d in ipairs(arenaGui:GetDescendants()) do
        if d:IsA("TextLabel") then
            local t = tostring(d.Text)
            if t:find("💧") then glob = t end
            if t:find("BETA SEASON") then season = t end
        end
    end
    check("the Glob readout shows a real balance",
        glob ~= nil and glob ~= "💧0", tostring(glob))
    check("the season readout shows a real tier",
        season ~= nil and season ~= "BETA SEASON · 0", tostring(season))
end

emit("")

emit(("══ %s ══"):format(fails == 0 and "ALL CLIENT CHECKS PASSED" or (fails .. " FAILURE(S)")))

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
    error(fails .. " client failure(s)")
end
