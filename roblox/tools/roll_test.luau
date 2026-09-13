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
-- The arena's own state, straight off the wire. The first version of the melt
-- test used the ball's RADIUS as a proxy, which is wrong twice over: radius is
-- logarithmic in mass, so a big change in mass is a small change in radius,
-- and setRadius only redraws past a 2% threshold. It reported "no melt" while
-- the blob was shedding ninety mass. Read the number, not a picture of it.
local function arenaOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "ArenaSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
    return nil
end

-- WAIT FOR A ROUND. The arena is not permanently live any more: it cycles
-- LOBBY -> PLAYING -> RESULTS, and nothing can be eaten, spawned or deflated
-- outside PLAYING. Every scenario that acts on the island has to arrive at the
-- right moment rather than assuming one.
local Config = _G.SHARED("Config")

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
-- One island now. The four zones survive as patches on it, so the thing to
-- check is that every ring and every patch is actually there, not that four
-- separate floors are.
for _, piece in ipairs({ "Island", "Flats", "Shallows", "VaultDish", "Sea" }) do
    check("island piece built: " .. piece, world:FindFirstChild(piece) ~= nil)
end
local patches = {}
for _, c in ipairs(world:GetChildren()) do
    local tag = c:FindFirstChild("BiomeId")
    if tag then patches[tag.Value] = c end
end
for _, id in ipairs({ "slick", "scrap", "basin" }) do
    check("biome patch built: " .. id, patches[id] ~= nil)
end
local signs, ramps = 0, 0
for _, c in ipairs(world:GetChildren()) do
    if c.Name:match("^Sign_") then signs += 1 end
    if c.Name == "Ramp" then ramps += 1 end
end
check("signposts exist so the map explains itself", signs >= 6, tostring(signs))
check("ramps exist so momentum has somewhere to go", ramps >= 8, tostring(ramps))
-- Ascension happens at the Vault: there is one landmark and everything
-- ceremonial belongs on it.
check("the vault is the altar", world:FindFirstChild("VaultDish") ~= nil)
local ice = patches.slick
check("the Slick is genuinely slippery",
    ice and ice.CustomPhysicalProperties and ice.CustomPhysicalProperties.Friction < 0.1,
    ice and ice.CustomPhysicalProperties and tostring(ice.CustomPhysicalProperties.Friction))
local basin = patches.basin
check("the Basin pays more for being harder to leave",
    basin ~= nil and basin.Position.Y < 0, basin and tostring(basin.Position.Y))

emit("")
emit("══ THE BODY IS THE ARENA'S MASS ══")
-- The body's size used to follow the stored Goob's mass. It follows the RUN's
-- mass now, and exactly one system is allowed to write it — otherwise the two
-- owners fight and RollService.refresh respawns the player's body out from
-- under them every few seconds. So the honest test is to eat real pellets off
-- the real island and watch the real body grow.
check("a round starts on its own", waitForRound(alice), tostring(phaseOf(alice)))
local smallReach = ball().Size.X / 2
local arena = svc.Workspace:FindFirstChild("GoobWorld"):FindFirstChild("Arena")
check("the island seeded itself with food", arena and #arena:GetChildren() > 100,
    arena and tostring(#arena:GetChildren()))

local eaten = 0
for _ = 1, 60 do
    local list = arena:GetChildren()
    if #list == 0 then break end
    local target = list[1]
    svc.movePlayer(alice, target.Position)
    ball().Position = target.Position
    tick(0.3)
    if not target.Parent then eaten += 1 end
end
check("pellets are actually eaten", eaten > 20, tostring(eaten))
check("the body grew with the run", ball().Size.X / 2 > smallReach,
    ("%f -> %f"):format(smallReach, ball().Size.X / 2))

local fed = arenaOf(alice)
check("the arena reports a run", fed ~= nil and fed.mass ~= nil, fed and tostring(fed.mass))
check("eating made it grow", fed and fed.mass > Config.STARTING_MASS * 2,
    fed and tostring(fed.mass))

-- GROWTH IS UNBOUNDED IN ROUND MODE. The melt curve is still in Blob and still
-- tested there, but Config.LEAK_IN_ROUND turns it off during play: the point
-- of a round is to get enormous, and a leak that caps growth fights that
-- directly. What stops a runaway leader now is other players deflating them.
local beforeMass = fed.mass
tick(20)
local afterMass = arenaOf(alice).mass
check("standing still does NOT shrink you any more",
    afterMass >= beforeMass * 0.98,
    ("%.0f -> %.0f"):format(beforeMass, afterMass))
check("and the server agrees there is no leak",
    arenaOf(alice).leak == 0, tostring(arenaOf(alice).leak))

emit("")
emit("══ ANTI-CHEAT: CLIENT OWNS THE PHYSICS ══")
local b = ball()
local honest = b.Position
-- Three consecutive impossible jumps is the threshold; one is network noise.
-- Nine jumps of 4,000 studs. The old version asserted the residual drift was
-- under 3,000 after five jumps, which is a single 4,000-stud jump away from
-- failing and did exactly that the moment another service changed the
-- scheduler's ordering. What actually matters is that the guard fires at all,
-- so assert against the TOTAL attempted rather than an exact residue.
local attempted = 0
for _ = 1, 9 do
    b.Position = b.Position + V3.new(4000, 0, 0)
    attempted += 4000
    tick(0.3)
end
local drifted = (ball().Position - honest).Magnitude
check("a teleporting body is snapped back", drifted < attempted * 0.4,
    ("kept %.0f of %.0f studs"):format(drifted, attempted))

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
local altarPos = V3.new(0, 7, 0)   -- the Vault
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
local altar = V3.new(0, 7, 0)      -- the Vault
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
emit("")
emit("══ SIGNS AND BOARDS FACE THE PEOPLE READING THEM ══")
-- THE BUG THIS EXISTS FOR. Both waiting-room boards were built with a yaw in
-- degrees, and both yaws pointed their text AWAY from the floor players stand
-- on — you walked up to two blank slate slabs and could only read the
-- leaderboard by standing off the edge of the world behind it.
--
-- Nothing caught it because "which way does this face" was not a thing the
-- harness could represent: the CFrame stub is translation-only and discarded
-- rotation entirely. It now keeps the direction handed to CFrame.lookAt, which
-- is the single property that mattered, and board() takes a point to look at
-- rather than an angle so the mistake is not expressible anymore.
do
    local world = svc.Workspace:FindFirstChild("GoobWorld")
    local centre = _G.SHARED("Config").LOBBY_CENTRE
    local checked, wrong = 0, {}
    for _, name in ipairs({ "Leaderboard", "Archive" }) do
        local slab = world and world:FindFirstChild(name)
        if slab then
            checked += 1
            local look = slab.CFrame.LookVector
            local toCentre = V3.new(centre.X - slab.Position.X, 0,
                centre.Z - slab.Position.Z)
            if toCentre.Magnitude > 0.01 then
                toCentre = toCentre.Unit
                -- Dot product: +1 is facing the middle of the room, -1 is
                -- facing directly away from it, which is what shipped.
                local dot = look.X * toCentre.X + look.Z * toCentre.Z
                if dot < 0.35 then
                    table.insert(wrong, ("%s (dot %.2f)"):format(name, dot))
                end
            end
        end
    end
    check("both boards were found", checked == 2, tostring(checked))
    check("every board faces the middle of the waiting room",
        #wrong == 0, table.concat(wrong, ", "))
end

emit(("══ %s ══"):format(fails == 0 and "ALL ROLL CHECKS PASSED" or (fails .. " FAILURE(S)")))

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
    error(fails .. " roll failure(s)")
end
