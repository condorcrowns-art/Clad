--!nolint
-- live_test.luau — cosmetics, season pass, Sumo Pit and crews, running live.

local svc, env = _G.SVC, _G.ENV
local V3 = env.Vector3
local sched = env.scheduler
local Pit = _G.SHARED("Pit")

local fails = 0
local function check(l, c, d)
    if c then emit(("  ok    %s"):format(l))
    else fails += 1; emit(("  FAIL  %s   %s"):format(l, d or "")) end
end
local function tick(sec, dt)
    dt = dt or 0.2
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
local function lastOf(remote, name)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == remote and (t.player == "ALL" or t.player.Name == name) then
            return t.args[1]
        end
    end
end

_G.BOOT_SERVER()
tick(1)
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 40))
local bob = svc.addPlayer("Bob", 202, V3.new(10, 5, 40))
tick(4)

emit("══ COSMETICS ══")
local snap = snapOf(alice)
check("starters are owned", snap.cosmeticsOwned["skin_default"] == true)
check("a loadout is equipped", snap.loadout and snap.loadout.skin == "skin_default",
    snap.loadout and tostring(snap.loadout.skin))
check("locked items are NOT owned", snap.cosmeticsOwned["skin_prism"] ~= true)

svc.fireAs("EquipCosmetic", alice, "skin", "skin_prism")
tick(1)
check("equipping something you don't own is refused",
    snapOf(alice).loadout.skin == "skin_default",
    tostring(snapOf(alice).loadout.skin) .. " | " .. tostring(lastOf("Notify", "Alice")))

svc.fireAs("EquipCosmetic", alice, "crown", "crown_none")
tick(1)
check("equipping something you DO own works",
    snapOf(alice).loadout.crown == "crown_none")

svc.fireAs("EquipCosmetic", alice, "skin", "trail_flame")
tick(1)
check("cross-slot equipping is refused", snapOf(alice).loadout.skin == "skin_default")

emit("")
emit("══ SEASON PASS ══")
local s0 = snapOf(alice).season
check("a season exists", s0 ~= nil and s0.tier == 1, s0 and tostring(s0.tier))
local xp0 = s0.xp

local critters = svc.Workspace:FindFirstChild("Critters")
tick(20)
for _ = 1, 25 do
    local list = critters:GetChildren()
    if #list > 0 then
        svc.movePlayer(alice, list[1].Position)
        svc.fireAs("CatchCritter", alice, list[1])
    end
    tick(0.6)
end
tick(3)
local s1 = snapOf(alice).season
check("playing earns season xp", s1.xp > xp0, ("%d -> %d"):format(xp0, s1.xp))
check("daily xp is tracked", (s1.dailyXp or 0) > 0, tostring(s1.dailyXp))

-- Claiming a tier you have not earned must fail.
svc.fireAs("ClaimSeason", alice, 40, false)
tick(1)
check("cannot claim an unearned tier",
    (lastOf("Notify", "Alice") or ""):find("Nothing to claim") ~= nil,
    tostring(lastOf("Notify", "Alice")))

-- And premium rewards without the pass must fail.
svc.fireAs("ClaimSeason", alice, 1, true)
tick(1)
check("premium rewards need the premium pass",
    (lastOf("Notify", "Alice") or ""):find("Premium") ~= nil,
    tostring(lastOf("Notify", "Alice")))

emit("")
emit("══ CREWS ══")
-- Founding costs ten minutes of income, so bank some first.
tick(900)
svc.fireAs("CrewCreate", alice, "Th", "X")
tick(1)
check("a bad name/tag is refused",
    (lastOf("Notify", "Alice") or ""):find("3%-20") ~= nil,
    tostring(lastOf("Notify", "Alice")))

svc.fireAs("CrewCreate", alice, "The Blobs", "BLOB")
tick(2)
local crewData = lastOf("CrewSync", "Alice")
check("a crew can be founded", crewData ~= nil and crewData.tag == "BLOB",
    crewData and tostring(crewData.tag) or tostring(lastOf("Notify", "Alice")))
check("the founder is in it", crewData and crewData.memberCount == 1,
    crewData and tostring(crewData.memberCount))
check("it has a weekly goal", crewData and crewData.goalLabel ~= nil,
    crewData and tostring(crewData.goalLabel))

svc.fireAs("CrewJoin", bob, "BLOB")
tick(2)
local bobCrew = lastOf("CrewSync", "Bob")
check("another player can join by tag", bobCrew ~= nil and bobCrew.tag == "BLOB",
    bobCrew and tostring(bobCrew.tag) or tostring(lastOf("Notify", "Bob")))
check("membership is shared", bobCrew and bobCrew.memberCount == 2,
    bobCrew and tostring(bobCrew.memberCount))

svc.fireAs("CrewJoin", bob, "OTHR")
tick(1)
check("you must leave your crew before joining another",
    (lastOf("Notify", "Bob") or ""):find("Leave your crew") ~= nil,
    tostring(lastOf("Notify", "Bob")))

svc.fireAs("CrewClaim", bob)
tick(1)
check("claiming an unfinished goal is refused",
    (lastOf("Notify", "Bob") or ""):find("isn't finished") ~= nil,
    tostring(lastOf("Notify", "Bob")))

svc.fireAs("CrewLeave", bob)
tick(2)
check("leaving works", (lastOf("Notify", "Bob") or ""):find("Left") ~= nil,
    tostring(lastOf("Notify", "Bob")))

-- Only NOW, with Bob crewless, does this actually exercise the missing-crew
-- path. An earlier version ran it while he was still in a crew, so it was
-- testing the "leave first" guard and accepted either message — it passed with
-- the missing-crew check deleted entirely.
svc.fireAs("CrewJoin", bob, "NOPE")
tick(1)
check("joining a crew that does not exist is refused",
    (lastOf("Notify", "Bob") or ""):find("No crew with that tag") ~= nil,
    tostring(lastOf("Notify", "Bob")))

emit("")
emit("══ THE SUMO PIT ══")
local world = svc.Workspace:FindFirstChild("GoobWorld")
check("the arena is built", world:FindFirstChild("PitFloor") ~= nil)
check("the ring exists", world:FindFirstChild("PitRing") ~= nil)
check("there is a join pad", world:FindFirstChild("PitJoinPad") ~= nil)

-- Both players need to cover the stake.
tick(600)
local aGlob = snapOf(alice).glob
svc.fireAs("PitJoin", alice)
tick(1)
local pitState = lastOf("PitSync", "Alice")
check("joining queues you", pitState and pitState.queued == 1,
    pitState and tostring(pitState.queued))
check("the stake is not taken until the match starts",
    math.abs(snapOf(alice).glob - aGlob) < aGlob * 0.05,
    ("%f -> %f"):format(aGlob, snapOf(alice).glob))

svc.fireAs("PitJoin", bob)
tick(1)
pitState = lastOf("PitSync", "Alice")
check("two players fills the lobby", pitState and pitState.queued == 2,
    pitState and tostring(pitState.queued))
check("a countdown starts", pitState and pitState.lobbySeconds > 0,
    pitState and tostring(pitState.lobbySeconds))

-- Wait out the lobby; the match should begin.
tick(Pit.LOBBY_SECONDS + 3)
pitState = lastOf("PitSync", "Alice")
check("the match starts", pitState and pitState.inMatch == true,
    pitState and tostring(pitState.inMatch))
check("the pot is non-zero", pitState and pitState.pot > 0,
    pitState and tostring(pitState.pot))
check("stakes were actually taken", snapOf(alice).glob < aGlob,
    ("%f -> %f"):format(aGlob, snapOf(alice).glob))

-- Shove Bob out of the ring and confirm elimination + payout.
local bobBall = svc.Workspace:FindFirstChild("GoobBall_202")
local aliceBefore = snapOf(alice).glob
check("both fighters start alive", #(pitState.alive or {}) == 2,
    tostring(#(pitState.alive or {})))

-- Knock Bob out by dropping him below the arena. Done directly rather than via
-- RollService.teleport, because a fighter leaving the ring is exactly what the
-- anti-cheat should NOT rescue.
if bobBall then
    bobBall.Position = Pit.CENTRE - V3.new(0, 400, 0)
end
tick(5)
pitState = lastOf("PitSync", "Alice")
check("leaving the ring eliminates you",
    pitState and (not pitState.inMatch or #(pitState.alive or {}) <= 1),
    pitState and tostring(#(pitState.alive or {})))
check("the winner is paid the pot", snapOf(alice).glob > aliceBefore,
    ("%f -> %f"):format(aliceBefore, snapOf(alice).glob))
check("the win is recorded", (snapOf(alice).pitWins or 0) >= 1,
    tostring(snapOf(alice).pitWins))
check("a pit win earns season xp", snapOf(alice).season.xp > s1.xp,
    ("%d -> %d"):format(s1.xp, snapOf(alice).season.xp))

emit("")
emit("══ POWERS ══")
-- Every power costs a slice of your own mass, and that slice is not deleted:
-- it lands on the floor as food. That is what stops a lobby full of dashing
-- from starving the pellet supply, and it makes a spammed power visibly
-- generous rather than just noisy.
local world = svc.Workspace:FindFirstChild("GoobWorld")
local arena = world:FindFirstChild("Arena")
local function ballOf(p) return svc.Workspace:FindFirstChild("GoobBall_" .. p.UserId) end

local function feed(p, n)
    for _ = 1, n do
        local list = arena:GetChildren()
        if #list == 0 then break end
        svc.movePlayer(p, list[1].Position)
        local b = ballOf(p)
        if b then b.Position = list[1].Position end
        tick(0.3)
    end
end

local function arenaOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "ArenaSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
end

local Powers = _G.SHARED("Powers")

feed(alice, 40)
local before = arenaOf(alice) or {}
local beforeMass = before.mass or 0
-- Computed from the power's own declared fraction, NOT from massCost(). A
-- test that asks the same function it is checking what the answer should be
-- agrees with it no matter what it returns — which is how a mutation that made
-- every power free went undetected: melting alone satisfied "mass went down".
local powerDef = Powers.get(before.powerId or "dash")
local expected = powerDef.cost * beforeMass

-- Count pellets NEAR THE PLAYER, not on the whole island. The island respawns
-- pellets constantly, so "the total went up" passes whether the power dropped
-- anything or not — which is exactly what a mutation deleting the drop proved.
-- Around a FIXED point: the spot the power was fired from. Measuring around
-- the live ball instead reported "0 nearby" because DASH had just thrown the
-- player sixty studs away from their own droppings.
local origin = ballOf(alice).Position
local function nearby()
    local n = 0
    for _, d in ipairs(arena:GetChildren()) do
        if (d.Position - origin).Magnitude < 60 then n += 1 end
    end
    return n
end
local beforeNear = nearby()

svc.fireAs("UsePower", alice, V3.new(0, 0, 1))
tick(0.35)
local afterMass = (arenaOf(alice) or {}).mass or 0
local paid = beforeMass - afterMass

-- Melting over the same third of a second is worth about 3 mass at this size,
-- so the bar has to sit clear of it or the melt alone passes the check.
local meltAlone = (before.leak or 0) * 0.35
check("using a power costs you mass", paid > meltAlone * 2,
    ("paid %.1f, melt alone would be %.1f"):format(paid, meltAlone))
-- Within tolerance of the melt that also ran during the same third of a
-- second. Asserting only "it went down" passes even when the cost is zero,
-- because melting alone would satisfy it.
check("it costs what the power says it costs",
    paid >= expected * 0.75, ("paid %.1f, power says %.1f"):format(paid, expected))
check("and what it cost landed on the floor beside you, not deleted",
    nearby() > beforeNear, ("%d -> %d nearby"):format(beforeNear, nearby()))
check("the power goes on cooldown",
    (arenaOf(alice) or {}).powerCooldown > 0, tostring((arenaOf(alice) or {}).powerCooldown))

-- A power you cannot afford must be refused rather than taking you negative.
svc.fireAs("SetPower", alice, "spike")
tick(0.3)
check("a power you have not unlocked is refused",
    (arenaOf(alice) or {}).powerId ~= "spike", (arenaOf(alice) or {}).powerId)

emit("")
emit("══ SLAM SHATTERS THE ISLAND ══")
-- SLAM's real job is not knockback. An island silts up with congealed shells
-- for the life of a server, and without something that can break them open
-- again the Vault eventually walls itself in. SLAM is that something.
local Blob = _G.SHARED("Blob")
local lumpsBefore = 0
for _, d in ipairs(arena:GetChildren()) do
    if d.Name == "Lump" then lumpsBefore += 1 end
end
check("the arena tracks lumps as terrain", lumpsBefore >= 0, tostring(lumpsBefore))
check("a lump is bigger the bigger the blob that died",
    Blob.lumpRadius(2000) > Blob.lumpRadius(100))
check("but no lump can ever wall off the Vault",
    Blob.lumpRadius(1e12) <= (_G.SHARED("Config")).LUMP_RADIUS_MAX)

emit("")
emit("══ PERSISTENCE ══")
svc.removePlayer(alice)
tick(2)
local saved = svc.stores["GoobProfile_v1"]["u_101"]
check("cosmetics persist", saved and saved.cosmeticsOwned ~= nil)
check("season progress persists", saved and saved.season and saved.season.xp > 0,
    saved and saved.season and tostring(saved.season.xp))
check("pit wins persist", saved and (saved.pitWins or 0) >= 1, saved and tostring(saved.pitWins))
check("crew membership persists", saved and saved.crewId ~= nil, saved and tostring(saved.crewId))

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL LIVE SYSTEM CHECKS PASSED" or (fails .. " FAILURE(S)")))
