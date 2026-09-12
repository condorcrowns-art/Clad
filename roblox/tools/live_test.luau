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
