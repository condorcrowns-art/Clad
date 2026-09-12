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
check("eating got past the grace mass", fed and fed.mass > 60, fed and tostring(fed.mass))
check("the HUD is told what it is leaking", fed and fed.leak > 0, fed and tostring(fed.leak))

-- THE MELT. Past the grace mass, standing still must LOSE mass. This is the
-- assertion the entire design rests on, and it is the one that caught a bug
-- that had quietly deleted the game: leaked goop was spawning inside the
-- leaking blob's own pickup radius, so a big blob vacuumed its own drips back
-- up and its net melt was exactly zero.
local beforeMass = fed.mass
local beforePellets = #arena:GetChildren()
tick(30)
local afterMass = arenaOf(alice).mass
check("standing still while big melts you", afterMass < beforeMass * 0.85,
    ("%.0f -> %.0f"):format(beforeMass, afterMass))

-- And what melted did not vanish. It is on the floor, for everyone else.
check("what you melted became food for everyone else",
    #arena:GetChildren() > beforePellets * 0.9,
    ("%d -> %d"):format(beforePellets, #arena:GetChildren()))

-- A blob may never re-absorb its own trail. Without the lockout the melt is
-- cosmetic and the ceiling does not exist.
local ownTrail = 0
for _, pellet in ipairs(arena:GetChildren()) do
    if (pellet.Position - ball().Position).Magnitude < ball().Size.X / 2 then
        ownTrail += 1
    end
end
check("its own drips are not sitting inside it", ownTrail == 0, tostring(ownTrail))

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
emit(("══ %s ══"):format(fails == 0 and "ALL ROLL CHECKS PASSED" or (fails .. " FAILURE(S)")))
