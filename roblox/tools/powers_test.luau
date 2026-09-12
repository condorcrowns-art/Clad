--!nolint
-- powers_test.luau — press every power, with a second player in the world.
--
-- WHY THIS EXISTS: eleven of the twelve powers had never been executed once.
-- They compiled, they were in the catalogue, the UI listed them — and the code
-- inside each `elseif` branch had never run. A branch nobody has run is not
-- code, it is a plan.

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

_G.BOOT_SERVER()
tick(1)
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 60))
local bob   = svc.addPlayer("Bob", 202, V3.new(24, 5, 60))
tick(4)

local Powers = _G.SHARED("Powers")
local Config = _G.SHARED("Config")
local world = svc.Workspace:FindFirstChild("GoobWorld")
local arena = world:FindFirstChild("Arena")

local function ballOf(p) return svc.Workspace:FindFirstChild("GoobBall_" .. p.UserId) end
local function arenaOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "ArenaSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
end
local function lastNotify(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "Notify" and t.player ~= "ALL" and t.player.Name == p.Name then
            return tostring(t.args[1])
        end
    end
    return ""
end
local function effectsSince(mark)
    local out = {}
    for i = mark + 1, #_G.TRAFFIC do
        local t = _G.TRAFFIC[i]
        if t.remote == "Effect" then table.insert(out, t.args[1]) end
    end
    return out
end
local function feed(p, n)
    for _ = 1, n do
        local list = arena:GetChildren()
        if #list == 0 then break end
        local target
        for _, d in ipairs(list) do
            if d.Name == "Pellet" or d.Name == "Crumb" then target = d break end
        end
        if not target then break end
        svc.movePlayer(p, target.Position)
        local b = ballOf(p)
        if b then b.Position = target.Position end
        tick(0.3)
    end
end

-- Every power is gated on lifetime banked, so the test has to actually earn
-- them. Banking is the only earner, which is the point of the whole design.
local function bankRun(p, feedAmount)
    feed(p, feedAmount)
    for _ = 1, 30 do
        svc.movePlayer(p, V3.new(0, 9, 0))
        local b = ballOf(p)
        if b then
            b.Position = V3.new(0, 9, 0)
            b.AssemblyLinearVelocity = V3.new(0, 0, 0)
        end
        tick(0.4)
    end
end

emit("══ EARNING THE LADDER ══")
for _ = 1, 14 do bankRun(alice, 26) end
local banked = 0
for i = #_G.TRAFFIC, 1, -1 do
    local t = _G.TRAFFIC[i]
    if t.remote == "StateSync" and t.player ~= "ALL" and t.player.Name == "Alice" then
        banked = t.args[1].lifetimeBanked or 0
        break
    end
end
emit(("  Alice has banked 💧%d"):format(math.floor(banked)))
check("banking actually accrues toward the ladder", banked > 0, tostring(banked))

emit("")
emit("══ EVERY POWER FIRES ══")
-- Grant the whole ladder by fiat so that all twelve branches execute. The
-- UNLOCK rules are tested separately; what is under test here is the code
-- inside each branch, which is the part that had never run.
local Data = _G.SERVER("Data")
local profile = Data and Data.get(alice)
check("the test can reach a profile", profile ~= nil)
if profile then profile.lifetimeBanked = 1e9 end

local pressed, refused = {}, {}
for _, power in ipairs(Powers.LIST) do
    -- Fatten up so the cost is always affordable.
    feed(alice, 30)
    svc.fireAs("SetPower", alice, power.id)
    tick(0.5)
    local got = arenaOf(alice)
    if not got or got.powerId ~= power.id then
        table.insert(refused, power.id .. " (not equipped: " .. tostring(got and got.powerId) .. ")")
    else
        local before = arenaOf(alice).mass
        local mark = #_G.TRAFFIC
        svc.fireAs("UsePower", alice, V3.new(0, 0, 1))
        tick(0.6)
        local after = arenaOf(alice)
        -- MAGNET drags in far more than it costs, so "did mass go down" is
        -- the wrong probe: it reports a working power as broken. Read the cost
        -- the server puts on its own effect instead, which is true for all
        -- twelve regardless of what the power then does for you.
        local charged = 0
        for i = mark + 1, #_G.TRAFFIC do
            local t = _G.TRAFFIC[i]
            if t.remote == "Effect" and t.args[1] == "power" then
                charged = (t.args[2] and t.args[2].cost) or 0
            end
        end
        local sawPower = charged > 0
        if sawPower then
            table.insert(pressed, power.id)
        else
            table.insert(refused, ("%s (mass %.0f->%.0f, charged=%.1f, note=%q)")
                :format(power.id, before, after.mass, charged, lastNotify(alice)))
        end
    end
    -- Clear the cooldown before the next one.
    tick(26)
end

emit(("  fired: %s"):format(table.concat(pressed, ", ")))
check("all twelve powers execute and charge you",
    #pressed == #Powers.LIST, table.concat(refused, " | "))

emit("")
emit("══ NOTHING BREAKS THE WORLD ══")
check("the server is still running", arenaOf(alice) ~= nil)
check("the island still has food", #arena:GetChildren() > 50, tostring(#arena:GetChildren()))
check("the player still has a body", ballOf(alice) ~= nil)
-- Stand ON THE RIM and blink straight out to sea. Blinking from the middle of
-- a 480-stud island can never reach the edge, so testing it from there proves
-- nothing: a mutation removing the clamp went completely undetected until this
-- was moved to the one place the clamp actually matters.
svc.fireAs("SetPower", alice, "blink")
tick(0.5)
feed(alice, 26)
local rim = V3.new(0, 6, Config.ISLAND_RADIUS - 8)
svc.movePlayer(alice, rim)
if ballOf(alice) then ballOf(alice).Position = rim end
tick(0.5)
svc.fireAs("UsePower", alice, V3.new(0, 0, 1))   -- aimed straight off the edge
tick(1)
local pos = ballOf(alice).Position
local outFromCentre = V3.new(pos.X, 0, pos.Z).Magnitude
check("BLINK off the rim cannot strand you in the sea",
    outFromCentre <= Config.ISLAND_RADIUS,
    ("%.0f studs from centre, island is %d"):format(outFromCentre, Config.ISLAND_RADIUS))

emit("")
emit("══ MASTERY COUNTS ONCE PER PRESS ══")
-- It used to count twice: the run cached the SAME TABLE as profile.powerUses,
-- so incrementing it locally and calling notePowerUse both wrote to the
-- profile. Mastery accrued at double rate.
if profile then
    profile.powerUses = {}
    svc.fireAs("SetPower", alice, "dash")
    tick(0.5)
    feed(alice, 20)
    local mark2 = #_G.TRAFFIC
    for _ = 1, 5 do
        svc.fireAs("UsePower", alice, V3.new(0, 0, 1))
        tick(5)
        feed(alice, 6)
    end
    -- Counted against the presses that ACTUALLY CHARGED, not against the
    -- number of times the test pressed the button. A press the server refuses
    -- — too small to pay, still on cooldown — must record no use, and how many
    -- get refused depends on where the blob happens to be standing. The
    -- invariant is one use per charge, and that is what is asserted.
    local charges = 0
    for i = mark2 + 1, #_G.TRAFFIC do
        local t = _G.TRAFFIC[i]
        if t.remote == "Effect" and t.args[1] == "power" then charges += 1 end
    end
    local n = profile.powerUses.dash or 0
    check("mastery records exactly one use per charged press, never two",
        n == charges and charges > 0, ("%d uses for %d charges"):format(n, charges))
end

emit("")
emit("══ SOUNDS ══")
-- Engine-bundled paths, not catalog ids: no owner, no moderation queue, no
-- licence question, and nothing that can be taken down and silently break the
-- game — which is what happened the first time this table held a catalog id.
local bad, count = {}, 0
for name, id in pairs(Config.SOUNDS or {}) do
    count += 1
    if type(id) ~= "string" or id == "" then
        table.insert(bad, name .. " (empty)")
    elseif id:sub(1, 11) ~= "rbxasset://" then
        table.insert(bad, name .. " = " .. tostring(id))
    end
end
emit(("  %d sounds configured"):format(count))
check("every sound is an engine-bundled rbxasset path", #bad == 0, table.concat(bad, ", "))
check("there are sounds at all", count >= 8, tostring(count))

local missing = {}
for _, power in ipairs(Powers.LIST) do
    local key = (Config.POWER_SOUND or {})[power.id]
    if not key or not (Config.SOUNDS or {})[key] then
        table.insert(missing, power.id)
    end
end
check("every power maps to a sound that exists", #missing == 0, table.concat(missing, ", "))

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL POWER CHECKS PASSED" or (fails .. " FAILURE(S)")))
if fails > 0 then error(fails .. " power failure(s)", 0) end
