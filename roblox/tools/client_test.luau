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

svc.enterClientMode(alice)
_G.BOOT_CLIENT()
tick(2)
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
check("power readout present", joined:find("⚡") ~= nil, joined:sub(1, 90))
check("glob readout present", joined:find("💧") ~= nil)

local btnText = {}
for _, b in ipairs(buttons) do table.insert(btnText, tostring(b.Text)) end
local btnJoined = table.concat(btnText, " | ")
check("snack stand buttons exist", btnJoined:find("Snack") ~= nil, btnJoined:sub(1, 140))
check("MY GOOBS button exists", btnJoined:find("GOOBS") ~= nil)

emit("")
emit("══ DOES THE HUD UPDATE FROM SERVER STATE? ══")
tick(3)
local powerLabel
for _, d in ipairs(hud:GetDescendants()) do
    if d:IsA("TextLabel") and type(d.Text) == "string" and d.Text:find("^⚡") then
        powerLabel = d
    end
end
check("power label bound to a real number", powerLabel and powerLabel.Text ~= "⚡ 0",
    powerLabel and powerLabel.Text)

local snackBtn
for _, b in ipairs(buttons) do
    if tostring(b.Text):find("Snack") then snackBtn = b end
end
check("snack button shows a live price", snackBtn and tostring(snackBtn.Text):find("💧") ~= nil,
    snackBtn and tostring(snackBtn.Text))

emit("")
emit("══ CLICKING THINGS (the whole point) ══")
local drawerBtn
for _, b in ipairs(buttons) do
    if tostring(b.Text):find("GOOBS") then drawerBtn = b end
end
if drawerBtn then
    drawerBtn.Activated:Fire()
    tick(1)
    local eggBtn
    for _, b in ipairs(buttonsUnder(hud)) do
        if tostring(b.Text):find("HATCH") then eggBtn = b end
    end
    check("opening the drawer reveals the egg button", eggBtn ~= nil,
        table.concat((function()
            local t = {}
            for _, b in ipairs(buttonsUnder(hud)) do table.insert(t, tostring(b.Text)) end
            return t
        end)(), " | "):sub(1, 160))
else
    check("drawer button found", false)
end

-- Clicking the snack button must reach the server and change state.
if snackBtn then
    tick(900)
    local globBefore
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "StateSync" and t.player ~= "ALL" then globBefore = t.args[1].glob break end
    end
    snackBtn.Activated:Fire()
    tick(3)
    local globAfter
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "StateSync" and t.player ~= "ALL" then globAfter = t.args[1].glob break end
    end
    check("clicking the snack button actually spent Glob",
        globBefore and globAfter and globAfter < globBefore,
        ("%s -> %s"):format(tostring(globBefore), tostring(globAfter)))
end

emit("")
emit("══ TOASTS ══")
local toastsBefore = #hud:GetDescendants()
svc.ReplicatedStorage:FindFirstChild("GoobNet"):FindFirstChild("Notify")
    .OnClientEvent:Fire("Test message!", "good")
tick(0.5)
check("a notification renders something on screen", #hud:GetDescendants() > toastsBefore,
    ("%d -> %d"):format(toastsBefore, #hud:GetDescendants()))

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

emit(("══ %s ══"):format(fails == 0 and "ALL CLIENT CHECKS PASSED" or (fails .. " FAILURE(S)")))
