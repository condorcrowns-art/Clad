--!nolint
-- integration.luau — drive the real server through a full session.

local svc, env = _G.SVC, _G.ENV
local V3 = env.Vector3
local sched = env.scheduler

local fails = 0
local function check(label, cond, detail)
    if cond then
        emit(("  ok    %s"):format(label))
    else
        fails += 1
        emit(("  FAIL  %s   %s"):format(label, detail or ""))
    end
end

local function tick(seconds, dt)
    dt = dt or 0.25
    local n = math.floor(seconds / dt)
    for _ = 1, n do
        sched.step(dt)
        svc.heartbeat(dt)
    end
end

local function lastNotify(playerName)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "Notify" and (playerName == nil or (t.player ~= "ALL" and t.player.Name == playerName)) then
            return t.args[1]
        end
    end
    return nil
end

local function snapshotFor(player)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "StateSync" and t.player ~= "ALL" and t.player.Name == player.Name then
            return t.args[1]
        end
    end
    return nil
end

emit("══ BOOTING THE REAL SERVER ══")
_G.BOOT_SERVER()
tick(1)
-- `true` on purpose, and the ONLY place that is acceptable: _G.BOOT_SERVER()
-- throws on any error inside the real scripts, so reaching this line is
-- itself the assertion. Anywhere else, `check(name, true)` is a test that
-- cannot fail — see the payload sweep in adversarial.luau, which was one
-- of those and had been silently passing without running since it was
-- written.
check("server booted without error", true)

local RS = svc.ReplicatedStorage
local net = RS:FindFirstChild("GoobNet")
check("GoobNet folder created", net ~= nil)
check("world folder created", svc.Workspace:FindFirstChild("GoobWorld") ~= nil)
-- ══ THE LEGACY LAYER IS ACTUALLY GONE ══════════════════════════════════════
--
-- This is a REGRESSION test, not a tidiness one. Three systems from the game
-- that existed before the arena — roaming "critters", the Snack Stand and the
-- Egg Stand — kept surviving reworks because nothing ever asserted their
-- absence. The cost was visible in play: a labelled "RARE Anvil" bobbing past
-- two players mid-round, and a shop panel rendering across the season track.
--
-- A deletion that nothing checks comes back. So the check is: the folder must
-- not exist, and the remotes must not exist. If somebody re-adds either, this
-- suite fails before the build does.
do
    check("no Critters folder in the world",
        svc.Workspace:FindFirstChild("Critters") == nil)
    for _, dead in ipairs({ "CatchCritter", "BuySnack", "BuyEgg" }) do
        check("the " .. dead .. " remote is gone",
            net:FindFirstChild(dead) == nil)
    end
    local Config = _G.SHARED("Config")
    check("no snack tiers left in Config", Config.SNACK_TIERS == nil)
    check("no critter tuning left in Config", Config.CRITTER_MAX_ALIVE == nil)
    check("no egg price left in Config", Config.EGG_BASE_SECONDS == nil)
end

local world = svc.Workspace:FindFirstChild("GoobWorld")
local plotCount = 0
if world then
    for _, c in ipairs(world:GetChildren()) do
        if c.Name:match("^Plot%d+$") then plotCount += 1 end
    end
end
-- No plot pads and no Shack any more: the play-test note was "I want there to
-- be no buildings", and every service they held is a tap on the dock.
check("no plot pads remain", plotCount == 0, "got " .. tostring(plotCount))
check("leaderboard exists", world and world:FindFirstChild("Leaderboard") ~= nil)
check("archive exists", world and world:FindFirstChild("Archive") ~= nil)

-- The island. Every one of these is something another file looks up by name,
-- so a rename that is not matched everywhere shows up here rather than as a
-- WaitForChild that hangs forever on a live server.
check("the island exists", world and world:FindFirstChild("Island") ~= nil)
check("there is a sea under it, so nobody falls out of the world",
    world and world:FindFirstChild("Sea") ~= nil)
check("the vault dish exists", world and world:FindFirstChild("VaultDish") ~= nil)
check("the standoff ring is named what PitService looks up",
    world and world:FindFirstChild("PitRing") ~= nil)
check("the shack is gone", world and world:FindFirstChild("Shack") == nil)
check("there is a lobby to wait in", world and world:FindFirstChild("LobbyFloor") ~= nil)
check("the arena folder exists for runtime spawns",
    world and world:FindFirstChild("Arena") ~= nil)

-- Counted against the CONFIG, not against a hardcoded 3. The builder used to
-- index Config.BIOMES by hand at [1], [2] and [3], so adding a fourth to the
-- config built four signposts and three patches: a zone you could read about
-- and never stand on. This is the check that would have caught that.
local Config = _G.SHARED("Config")
local tagged = {}
for _, d in ipairs(world and world:GetDescendants() or {}) do
    if d.Name == "BiomeId" then tagged[d.Value] = true end
end
local missing = {}
for _, b in ipairs(Config.BIOMES) do
    if not tagged[b.id] then table.insert(missing, b.id) end
end
check("every configured biome is actually built", #missing == 0,
    table.concat(missing, ", "))

local built = 0
for _ in pairs(tagged) do built += 1 end
check("and nothing is built that is not configured", built == #Config.BIOMES,
    ("%d built, %d configured"):format(built, #Config.BIOMES))

local spawns = 0
for _, d in ipairs(world and world:GetChildren() or {}) do
    if d.ClassName == "SpawnLocation" then spawns += 1 end
end
check("spawns ring the island", spawns >= 8, "got " .. tostring(spawns))

-- THE PLAY-TEST BUG, AS A TEST. Scenery scattered from 407 to 466 studs while
-- spawn points sat at 438, so a player could materialise inside a boulder and
-- be stuck before they had touched a control.
--
-- Reads the ACTUAL SpawnLocation positions, not a recomputed ring. The first
-- version of this recalculated the nominal angles and so tested a ring the
-- builder no longer uses — it reported a collision that had already been
-- searched away, and would equally have missed a real one.
do
    local Config2 = _G.SHARED("Config")
    local solid, spawnParts = {}, {}
    for _, d in ipairs(world and world:GetChildren() or {}) do
        if d.ClassName == "SpawnLocation" then
            table.insert(spawnParts, d)
        elseif d:IsA("BasePart") and d.CanCollide and d.Name ~= "Island"
            and d.Name ~= "Sea" and d.Name ~= "Skirt" and d.Name ~= "Causeway"
            and d.Name ~= "PitFloor" and d.Name ~= "LobbyFloor" then
            table.insert(solid, d)
        end
    end
    check("the spawns were actually built", #spawnParts >= 8, tostring(#spawnParts))

    local blocked = {}
    for _, sp in ipairs(spawnParts) do
        for _, d in ipairs(solid) do
            local flat = V3.new(d.Position.X - sp.Position.X, 0, d.Position.Z - sp.Position.Z)
            -- An ABSOLUTE distance, not the constant the builder uses. Asking
            -- SPAWN_CLEARANCE what "too close" means makes the check agree
            -- with it no matter what it is set to: a mutation zeroing it made
            -- every position acceptable and the test cheerfully passed.
            if flat.Magnitude < 30 then
                table.insert(blocked, ("%s %.0f studs from %s"):format(d.Name, flat.Magnitude, sp.Name))
            end
        end
    end
    check("nothing solid sits on a spawn point", #blocked == 0,
        table.concat(blocked, ", "):sub(1, 150))
end

-- Every board must carry its text label at exactly Board -> Entries. Burying
-- it one level deeper is a silent hang, not an error, so it gets its own check.
for _, name in ipairs({ "Leaderboard", "Archive" }) do
    local slab = world and world:FindFirstChild(name)
    local b = slab and slab:FindFirstChild("Board")
    check(name .. " exposes Board -> Entries", b and b:FindFirstChild("Entries") ~= nil)
end

emit("")
emit("══ PLAYER JOINS ══")
local alice = svc.addPlayer("Alice", 101, V3.new(0, 5, 10))
tick(2)

local snap = snapshotFor(alice)
check("Alice got a state snapshot", snap ~= nil)
check("Alice starts with 1 Goob", snap and #snap.goobs == 1, snap and tostring(#snap.goobs))
check("Alice has starting Glob", snap and snap.glob > 0, snap and tostring(snap.glob))
-- The active Goob is now the player's body, not a model parked on a pad.
local goobBall = svc.Workspace:FindFirstChild("GoobBall_101")
check("Alice's Goob spawned as a rolling body", goobBall ~= nil)
check("it has both eyes", goobBall and goobBall:FindFirstChild("EyeL") ~= nil
    and goobBall:FindFirstChild("EyeR") ~= nil)
check("it carries a nameplate", goobBall and goobBall:FindFirstChild("Plate") ~= nil)
check("it is unanchored so physics can move it", goobBall and goobBall.Anchored == false)

emit("")
emit("══ FEEDING: THE ROUND IS THE ONLY SOURCE OF MASS ══")
--
-- WHAT THIS REPLACED. There used to be three tests here: catching critters,
-- buying a snack, and buying an egg. All three systems have been deleted —
-- they belonged to the collecting game the arena replaced, and they were still
-- running in live rounds. What has to be proven now is that the game did not
-- simply lose its economy with them: finishing a round must still feed your
-- Goob, and eggs must still arrive.
local Config = _G.SHARED("Config")

local function arenaOf(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "ArenaSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
end

--- Sit through whole rounds. Each is ROUND_SECONDS of play plus the results
--- hold plus the intermission, so one full cycle is a little over four minutes
--- of simulated time.
local function playRounds(n)
    local seen = 0
    local wasPlaying = (arenaOf(alice) or {}).phase == "PLAYING"
    for _ = 1, math.floor((Config.ROUND_SECONDS + Config.ROUND_END_HOLD
        + Config.INTERMISSION_SECONDS + 6) * n / 0.5) do
        tick(0.5)
        local nowPlaying = (arenaOf(alice) or {}).phase == "PLAYING"
        if wasPlaying and not nowPlaying then
            seen += 1
            if seen >= n then return seen end
        end
        wasPlaying = nowPlaying
    end
    return seen
end

local beforeRound = snapshotFor(alice)
local massBeforeRound = beforeRound and beforeRound.goobs[1].mass or 0
local goobsBefore = beforeRound and #beforeRound.goobs or 0
check("a fresh profile starts with one Goob and no rounds played",
    goobsBefore == 1 and (beforeRound.roundsPlayed or 0) == 0,
    ("goobs=%d rounds=%s"):format(goobsBefore, tostring(beforeRound and beforeRound.roundsPlayed)))

local played = playRounds(1)
check("a round actually finished", played == 1, tostring(played))

local afterRound = snapshotFor(alice)
check("finishing a round counted", afterRound and (afterRound.roundsPlayed or 0) >= 1,
    afterRound and tostring(afterRound.roundsPlayed))
-- The Goob is fed through the stomach, which digests over time — so the proof
-- is either mass already up OR food in transit. Asserting only on mass would
-- fail on timing rather than on behaviour, which is the classic way a true
-- test turns into a flaky one.
check("finishing a round fed the Goob",
    afterRound and (afterRound.goobs[1].mass > massBeforeRound
        or afterRound.goobs[1].stomachCount > 0),
    afterRound and ("mass %f -> %f, stomach %d"):format(massBeforeRound,
        afterRound.goobs[1].mass, afterRound.goobs[1].stomachCount))
check("the snapshot says when the next egg is due",
    afterRound and afterRound.roundsToEgg ~= nil
        and afterRound.roundsToEgg <= Config.EGG_EVERY_ROUNDS,
    afterRound and tostring(afterRound.roundsToEgg))

tick(40)
local digested = snapshotFor(alice)
check("the stomach digests into mass over time",
    digested and digested.goobs[1].mass > massBeforeRound,
    digested and ("%f -> %f"):format(massBeforeRound, digested.goobs[1].mass))
local grownBall = svc.Workspace:FindFirstChild("GoobBall_101")
check("Goob body grew", grownBall and grownBall.Size.X > 0)

emit("")
emit("══ EGGS ARE EARNED BY PLAYING, NOT BOUGHT ══")
-- Play out the remainder of the cycle. The egg lands on the EGG_EVERY_ROUNDS'th
-- finished round, so this is the exact number of rounds left.
local snapNow = snapshotFor(alice)
local remaining = snapNow.roundsToEgg
check("the countdown is a real number of rounds",
    remaining >= 1 and remaining <= Config.EGG_EVERY_ROUNDS, tostring(remaining))
local ran = playRounds(remaining)
check("played out the countdown", ran == remaining,
    ("%d of %d"):format(ran, remaining))

local postEgg = snapshotFor(alice)
check("an egg hatched on schedule", postEgg and #postEgg.goobs == 2,
    postEgg and (tostring(#postEgg.goobs) .. " | " .. tostring(lastNotify("Alice"))))
check("and the countdown reset rather than sticking at zero",
    postEgg and postEgg.roundsToEgg == Config.EGG_EVERY_ROUNDS,
    postEgg and tostring(postEgg.roundsToEgg))

emit("")
emit("══ GULPING — the only way a Goob leaves the world ══")
if postEgg and #postEgg.goobs == 2 then
    local activeId, otherId
    for _, g in ipairs(postEgg.goobs) do
        if g.isActive then activeId = g.id else otherId = g.id end
    end
    local massBefore, genBefore
    for _, g in ipairs(postEgg.goobs) do
        if g.id == activeId then massBefore, genBefore = g.mass, g.generation end
    end

    svc.fireAs("GulpGoob", alice, activeId, otherId)
    tick(2)
    local postGulp = snapshotFor(alice)
    check("gulp consumed the other Goob", postGulp and #postGulp.goobs == 1,
        postGulp and tostring(#postGulp.goobs) .. " | " .. tostring(lastNotify("Alice")))
    if postGulp and #postGulp.goobs == 1 then
        local g = postGulp.goobs[1]
        check("eater gained mass", g.mass > massBefore, ("%f -> %f"):format(massBefore, g.mass))
        check("generation advanced", g.generation == genBefore + 1,
            ("%d -> %d"):format(genBefore, g.generation))
    end
else
    fails += 1
    emit("  FAIL  cannot test gulping — Alice never got a second Goob")
end

emit("")
emit("══ TRADING ══")
local bob = svc.addPlayer("Bob", 202, V3.new(0, 5, 0))
tick(2)
check("Bob joined and got a body", svc.Workspace:FindFirstChild("GoobBall_202") ~= nil)

-- Both must be inside the trade zone; give Alice a second Goob to offer.
--
-- She gets it the only way anybody gets one now: by finishing rounds. There is
-- no BuyEgg to shortcut with, which is the point — if this loop ever stops
-- producing a second Goob, trading has quietly become unreachable for every
-- player in the game and this is where that shows up.
svc.movePlayer(alice, V3.new(2, 5, 2))
svc.movePlayer(bob, V3.new(-2, 5, -2))
do
    local s = snapshotFor(alice)
    local need = (s and s.roundsToEgg) or Config.EGG_EVERY_ROUNDS
    playRounds(need)
end
local pre = snapshotFor(alice)
check("Alice has 2 Goobs to trade with", pre and #pre.goobs >= 2,
    pre and tostring(#pre.goobs))

svc.fireAs("TradeRequest", alice, "Bob")
tick(1)
check("Bob received a trade request", (lastNotify("Bob") or ""):find("trade") ~= nil,
    tostring(lastNotify("Bob")))

svc.fireAs("TradeRespond", bob, true)
tick(1)

local function tradeState(p)
    for i = #_G.TRAFFIC, 1, -1 do
        local t = _G.TRAFFIC[i]
        if t.remote == "TradeSync" and t.player ~= "ALL" and t.player.Name == p.Name then
            return t.args[1]
        end
    end
    return nil
end
check("trade window opened for both", tradeState(alice) and tradeState(alice).open == true)

-- Alice offers her non-active Goob.
local offerId
for _, g in ipairs(pre.goobs) do if not g.isActive then offerId = g.id end end
svc.fireAs("TradeOffer", alice, offerId, true)
tick(1)
local ts = tradeState(alice)
check("offer appears in Alice's side", ts and #ts.myOffer == 1, ts and tostring(#ts.myOffer))
local tsB = tradeState(bob)
check("Bob sees Alice's offer", tsB and #tsB.theirOffer == 1, tsB and tostring(tsB and #tsB.theirOffer))

emit("")
emit("  -- ANTI-SCAM: confirming, then changing the offer --")
svc.fireAs("TradeConfirm", alice, true)
svc.fireAs("TradeConfirm", bob, true)
tick(1)
local mid = tradeState(alice)
check("both sides show confirmed", mid and mid.myConfirmed and mid.theirConfirmed)

svc.fireAs("TradeOffer", alice, offerId, false)
tick(0.5)
local reset = tradeState(alice)
check("changing the offer RESET both confirmations",
    reset and not reset.myConfirmed and not reset.theirConfirmed,
    reset and tostring(reset.myConfirmed) .. "/" .. tostring(reset.theirConfirmed))

emit("")
emit("  -- completing the trade --")
svc.fireAs("TradeOffer", alice, offerId, true)
tick(0.5)
local aliceBefore = #snapshotFor(alice).goobs
local bobBefore = #snapshotFor(bob).goobs
svc.fireAs("TradeConfirm", alice, true)
svc.fireAs("TradeConfirm", bob, true)
tick(8)
local aliceAfter = snapshotFor(alice)
local bobAfter = snapshotFor(bob)
check("Alice gave one away", aliceAfter and #aliceAfter.goobs == aliceBefore - 1,
    ("%d -> %d"):format(aliceBefore, aliceAfter and #aliceAfter.goobs or -1))
check("Bob received it", bobAfter and #bobAfter.goobs == bobBefore + 1,
    ("%d -> %d"):format(bobBefore, bobAfter and #bobAfter.goobs or -1))

emit("")
emit("══ PERSISTENCE ══")
svc.removePlayer(alice)
tick(2)
local saved = svc.stores["GoobProfile_v1"] and svc.stores["GoobProfile_v1"]["u_101"]
check("Alice's profile was written to the DataStore", saved ~= nil)
check("saved profile keeps her Goobs", saved and #saved.goobs >= 1,
    saved and tostring(#saved.goobs))

emit("")
emit(("══ %s ══"):format(fails == 0 and "ALL INTEGRATION CHECKS PASSED" or (fails .. " FAILURE(S)")))

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
    error(fails .. " integration failure(s)")
end
