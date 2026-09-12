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
-- Move a body somewhere WITHOUT tripping the anti-cheat.
--
-- Writing a ball's position straight to a distant point looks exactly like a
-- client teleporting itself, and after three of them the server snaps the body
-- back — so a test that repeatedly slams a blob onto the Vault ends up fighting
-- the very protection it is not trying to test, and the scenario it set up
-- never happens. Walk instead, in steps a real blob could cover.
local function walkTo(p, dest, stepStuds)
    stepStuds = stepStuds or 36
    for _ = 1, 60 do
        local b = ballOf(p)
        if not b then return end
        local delta = dest - b.Position
        if delta.Magnitude <= stepStuds then
            svc.movePlayer(p, dest)
            b.Position = dest
            b.AssemblyLinearVelocity = V3.new(0, 0, 0)
            tick(0.3)
            return
        end
        local next = b.Position + delta.Unit * stepStuds
        svc.movePlayer(p, next)
        b.Position = next
        tick(0.3)
    end
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
emit("══ THE SHALLOWS ARE ACTUALLY SAFE ══")
-- The no-PvP promise used to be enforced in exactly ONE place: the eating
-- check. SIPHON, HOOK and SLAM all reached straight through it, so a player
-- could be drained, yanked and blasted while standing in the one part of the
-- island the game tells them is safe — which is also where everybody spawns
-- and where the tutorial runs.
-- Tested with HOOK, not SIPHON. SIPHON only considers targets BIGGER than the
-- caster, so unless the test controls who is bigger it finds no target at all
-- and passes whether the zone is respected or not — which is exactly what the
-- first version of this did. HOOK works on anyone, and what it does is
-- directly observable: it writes a velocity.
--
-- ORDER MATTERS HERE. feed() walks the blob across the island chasing pellets,
-- and ticking to clear a cooldown lets the arena move things too — so both
-- bodies are planted in their final positions LAST, immediately before the
-- button is pressed, never before a tick that could move them.
local function placeAndHook(bobSpot, aliceOffset)
    local bb = ballOf(bob)
    svc.movePlayer(bob, bobSpot)
    if bb then
        bb.Position = bobSpot
        bb.AssemblyLinearVelocity = V3.new(0, 0, 0)
    end
    local aliceSpot = bobSpot + aliceOffset
    svc.movePlayer(alice, aliceSpot)
    if ballOf(alice) then ballOf(alice).Position = aliceSpot end

    local mark = #_G.TRAFFIC
    svc.fireAs("UsePower", alice, V3.new(0, 0, -1))
    tick(0.4)

    local fired = false
    for i = mark + 1, #_G.TRAFFIC do
        local t = _G.TRAFFIC[i]
        if t.remote == "Effect" and t.args[1] == "hook" then fired = true end
    end
    return fired, (bb and bb.AssemblyLinearVelocity.Magnitude or 0)
end

if profile then
    profile.lifetimeBanked = 1e9
    svc.fireAs("SetPower", alice, "hook")
    tick(0.5)
    feed(alice, 24)      -- afford the cost
    tick(4)              -- let the post-respawn grace lapse for both

    local shallows = V3.new(0, 6, Config.SHALLOWS_INNER + 30)
    check("precondition: the test spot is in the Shallows",
        V3.new(shallows.X, 0, shallows.Z).Magnitude > Config.SHALLOWS_INNER,
        ("%.0f vs %d"):format(V3.new(shallows.X, 0, shallows.Z).Magnitude, Config.SHALLOWS_INNER))

    local firedSafe, velSafe = placeAndHook(shallows, V3.new(20, 0, 0))
    check("HOOK cannot yank a player standing in the Shallows",
        not firedSafe and velSafe < 1,
        ("velocity %.1f, hook effect=%s"):format(velSafe, tostring(firedSafe)))

    -- And the same power MUST still work outside it, from the same distance.
    -- Without this the check above would pass just as happily on a power that
    -- is simply broken, or on two blobs that were never near each other.
    tick(16)             -- clear the cooldown
    feed(alice, 16)
    local open = V3.new(0, 6, Config.SHALLOWS_INNER - 90)
    local firedOpen, velOpen = placeAndHook(open, V3.new(20, 0, 0))
    check("but HOOK still reaches, at the same range, on open ground",
        firedOpen, ("velocity %.1f, effect=%s"):format(velOpen, tostring(firedOpen)))
end

emit("")
emit("══ A LUMP MUST NEVER BLOCK THE VAULT ══")
-- Lumps are solid terrain that lasts most of an hour. One congealed on the
-- dish would physically wall off the only place in the game where mass can be
-- made safe, and the island keeps up to 300 of them.
-- The first version of this counted lumps at the end and checked none were
-- near the centre. It passed vacuously: the only lump on the island had come
-- from an earlier section, and no pop ever happened at the Vault at all. So
-- the pop is now PROVEN to have happened here, by counting before and after.
if profile then
    local function lumpsNow()
        local n, worst = 0, nil
        for _, d in ipairs(arena:GetChildren()) do
            if d.Name == "Lump" then
                n += 1
                local flat = V3.new(d.Position.X, 0, d.Position.Z).Magnitude
                if not worst or flat < worst then worst = flat end
            end
        end
        return n, worst
    end

    local before = lumpsNow()

    -- TWO THINGS THIS SECTION GOT WRONG THE FIRST TIME, both of which made it
    -- measure nothing while looking like it worked:
    --
    -- 1. It fought ON the dish. Standing still in the Vault is BANKING, so
    --    Alice cashed out and reset to 25 mass mid-setup and was never big
    --    enough to eat anybody. The fight now happens just outside the dish —
    --    still well inside the keep-out radius, which is what is under test,
    --    but outside the banking ring.
    -- 2. Both blobs were tiny, and a tiny blob congeals a lump BELOW the decay
    --    floor, so it is swept up before the next line of the test can count
    --    it. The prey has to be big enough to leave something behind.
    feed(bob, 80)
    feed(alice, 170)
    tick(3)   -- grace lapses for both

    local spot = V3.new(0, 6, Config.VAULT_RADIUS + 14)
    walkTo(bob, spot + V3.new(2, 0, 0))
    walkTo(alice, spot)

    local popped = false
    for _ = 1, 20 do
        -- Nudges only, now that both are already there.
        local ab, bb = ballOf(alice), ballOf(bob)
        if ab then ab.Position = spot end
        if bb then bb.Position = spot + V3.new(2, 0, 0) end
        tick(0.4)
        if lumpsNow() > before then popped = true break end
    end
    local after, nearest = lumpsNow()
    check("a pop at the Vault actually happened", popped and after > before,
        ("%d -> %d lumps"):format(before, after))
    -- Clear of the KEEP-OUT, not merely clear of the dish. The fight happens a
    -- few studs outside the dish edge, so "further out than the dish" is true
    -- whether the clamp runs or not — and a mutation deleting the clamp sailed
    -- straight past that version of this check. A lump has to be far enough
    -- out that it cannot block the ramps either.
    local MIN_CLEAR = Config.VAULT_RADIUS + 30
    check("and its lump was pushed clear of the whole Vault approach",
        nearest ~= nil and nearest >= MIN_CLEAR,
        nearest and ("nearest lump %.0f studs out, needs %d"):format(nearest, MIN_CLEAR)
            or "no lumps at all")
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
