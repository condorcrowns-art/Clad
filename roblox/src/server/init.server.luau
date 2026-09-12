--!strict
-- init.server.luau — the single entry point. Wires every service together and
-- owns all the RemoteEvent handlers, so there is exactly one file to read to
-- understand what the client is allowed to ask the server to do.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")
local TextService = game:GetService("TextService")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local GoobMath = require(Shared.GoobMath)
local Format = require(Shared.Format)
local Names = require(Shared.Names)
local Feedstock = require(Shared.Feedstock)
local Tutorial = require(Shared.Tutorial)
local Ascension = require(Shared.Ascension)
local Movement = require(Shared.Movement)
local Cosmetics = require(Shared.Cosmetics)
local Season = require(Shared.Season)
local Pit = require(Shared.Pit)
local Crew = require(Shared.Crew)
local Blob = require(Shared.Blob)
local Powers = require(Shared.Powers)
local Trinkets = require(Shared.Trinkets)
local Crates = require(Shared.Crates)
local Monetisation = require(Shared.Monetisation)

local Data = require(script.Data)
local WorldBuilder = require(script.WorldBuilder)
local GoobService = require(script.GoobService)
local CritterService = require(script.CritterService)
local TradeService = require(script.TradeService)
local RollService = require(script.RollService)
local PitService = require(script.PitService)
local CrewStore = require(script.CrewStore)
local CensusService = require(script.CensusService)
local ArenaService = require(script.ArenaService)

print(("[%s] booting…"):format(Config.GAME_NAME))

Net.init()
WorldBuilder.build()
CritterService.start()
GoobService.start()

local function activeGoobOf(player: Player)
    local profile = Data.get(player)
    return profile and GoobService.activeGoob(profile) or nil
end

-- Reach and catch validation both key off the rolling body.
CritterService.originFor = function(player: Player): BasePart?
    local ball = RollService.ballFor(player)
    if ball then return ball end
    local char = player.Character
    return char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
end

RollService.start(activeGoobOf)
CensusService.start()

local Notify = Net.get("Notify")
local StateSync = Net.get("StateSync")
local TradeSync = Net.get("TradeSync")
local LeaderboardSync = Net.get("LeaderboardSync")
local Effect = Net.get("Effect")

local function notify(player: Player, msg: string, kind: string?)
    Notify:FireClient(player, msg, kind or "info")
end

-- ── State push ─────────────────────────────────────────────────────────────
-- We send a compact, display-ready snapshot rather than the raw profile. The
-- client never needs the stomach contents or DataStore metadata, and not
-- sending them keeps bandwidth low with 30 players on a server.

local function snapshot(player: Player)
    local profile = Data.get(player)
    if not profile then return nil end
    local active = GoobService.activeGoob(profile)

    local goobs = {}
    for _, g in ipairs(profile.goobs) do
        local tier = GoobMath.ageTier(g)
        table.insert(goobs, {
            id = g.id,
            nickname = g.nickname,
            hue = g.hue,
            mass = g.mass,
            massText = Format.short(g.mass),
            power = GoobMath.power(g),
            powerText = Format.short(GoobMath.power(g)),
            ageSeconds = GoobMath.ageSeconds(g),
            ageText = Format.duration(GoobMath.ageSeconds(g)),
            ageTier = tier.name,
            ageEmoji = tier.emoji,
            ageColor = tier.color,
            ageMult = tier.mult,
            generation = GoobMath.generation(g),
            stomachCount = #g.stomach,
            lineage = g.lineage,
            contents = g.contents,
            isActive = active ~= nil and g.id == active.id,
        })
    end

    local snacks = {}
    if active then
        for _, tier in ipairs(Config.SNACK_TIERS) do
            local price = GoobMath.snackPrice(active, tier)
            table.insert(snacks, {
                id = tier.id, name = tier.name, emoji = tier.emoji,
                rolls = tier.rolls, luck = tier.luck,
                price = price, priceText = Format.short(price),
                affordable = profile.glob >= price,
            })
        end
    end

    local eggPrice = active and GoobMath.eggPrice(active, #profile.goobs) or 0
    local tutorial = Tutorial.display(profile.tutorial)
    local crests = profile.crests or 0
    local canAsc, ascReason = false, nil
    if active then canAsc, ascReason = Ascension.canAscend(active, crests) end

    return {
        glob = profile.glob,
        globText = Format.short(profile.glob),
        snacks = snacks,
        eggPrice = eggPrice,
        eggPriceText = Format.short(eggPrice),
        eggAffordable = profile.glob >= eggPrice and #profile.goobs < Config.MAX_GOOBS,
        eggCapped = #profile.goobs >= Config.MAX_GOOBS,
        maxGoobs = Config.MAX_GOOBS,
        income = active and GoobMath.incomePerSecond(active) or 0,
        incomeText = active and Format.short(GoobMath.incomePerSecond(active)) or "0",
        goobs = goobs,
        activeGoobId = profile.activeGoobId,
        stats = profile.stats,
        discovered = profile.discovered,
        tutorial = tutorial,
        crests = crests,
        foodMultiplier = Ascension.foodMultiplier(crests),
        canAscend = canAsc,
        ascendReason = ascReason,
        ascendPreview = (active and canAsc) and Ascension.preview(active, crests) or nil,
        colossalMass = Config.COLOSSAL_MASS,
        pitWins = profile.pitWins or 0,
        cosmeticsOwned = profile.cosmeticsOwned,
        loadout = profile.loadout,
        season = {
            id = profile.season.id,
            name = Season.NAME,
            xp = profile.season.xp,
            tier = Season.tierOf(profile.season.xp),
            tiers = Season.TIERS,
            progress = Season.progressInTier(profile.season.xp),
            premium = profile.season.premium == true,
            claimable = Season.claimable(profile.season),
            dailyXp = profile.season.dailyXp or 0,
            dailyCap = Season.DAILY_CAP,
        },
        achievements = profile.achievements,
        crewId = profile.crewId,
        moveTopSpeed = active and Movement.topSpeed(active.mass) or 0,
        moveStopDistance = active and Movement.stoppingDistance(active.mass) or 0,
        datastore = Data.isEnabled(),

        -- ── Arena ──────────────────────────────────────────────────────────
        -- These were missing, and their absence made THREE dock tabs dead.
        -- The Powers tab reads lifetimeBanked to decide what is unlocked, the
        -- Trinkets tab reads trinketsOwned, the Wardrobe reads loadout against
        -- cosmeticsOwned — so with these unsent every power and every trinket
        -- rendered permanently locked, the CARRY and EQUIP buttons never
        -- appeared, and the crate pity counter always read full.
        --
        -- Nothing errored. The UI drew perfectly and was simply always wrong,
        -- which is why the geometry audit could not see it and why the client
        -- test, which only checks that panels build, did not either.
        lifetimeBanked = profile.lifetimeBanked or 0,
        bestBank = profile.bestBank or 0,
        powerId = profile.powerId or Powers.DEFAULT,
        powerUses = profile.powerUses or {},
        trinketsOwned = profile.trinketsOwned or {},
        trinketSlots = profile.trinketSlots or {},
        cratePity = profile.cratePity or {},
        streak = profile.streak or 0,
    }
end

-- Nudge the tutorial forward when the player does the thing it asked for.
local function teach(player: Player, event: string)
    local profile = Data.get(player)
    if not profile or not profile.tutorial then return end
    local _, moved = Tutorial.advance(profile.tutorial, event)
    if moved then
        local shown = Tutorial.display(profile.tutorial)
        if shown then
            notify(player, "✅ " .. shown.text, "good")
        end
    end
end

local function push(player: Player)
    local snap = snapshot(player)
    if snap then StateSync:FireClient(player, snap) end
end

-- NOTE ON PLACEMENT: everything below must come AFTER notify, push and the
-- remote handles. `local function` only enters scope from its declaration
-- onward, so an earlier draft had this block sitting above them and every call
-- to notify/push/Net resolved to a nil GLOBAL — the server booted fine and then
-- errored the moment a player joined or ascended.

-- ── Season XP, achievements and crew contributions ─────────────────────────
-- One funnel, so every gameplay event feeds the progression systems without
-- each handler having to remember four different calls.

local function grantCosmetic(player: Player, id: string, why: string)
    local profile = Data.get(player)
    if not profile or not id then return end
    if profile.cosmeticsOwned[id] then return end
    local item = Cosmetics.get(id)
    if not item then return end
    profile.cosmeticsOwned[id] = true
    notify(player, ("🎁 Unlocked %s (%s) — %s"):format(item.name, item.rarity, why), "good")
end

local function checkAchievements(player: Player)
    local profile = Data.get(player)
    if not profile then return end
    local function earn(id: string, cosmetic: string, label: string)
        if profile.achievements[id] then return end
        profile.achievements[id] = true
        grantCosmetic(player, cosmetic, label)
    end
    if (profile.pitWins or 0) >= 5 then earn("pitwins5", "crown_pit", "5 Pit wins") end
    if (profile.totalAscensions or 0) >= 3 then earn("colossal3", "skin_goldleaf", "3 ascensions") end
    for id in pairs(profile.discovered or {}) do
        local item = Feedstock.get(id)
        if item and item.rarity == "Secret" then
            earn("secret1", "eyes_ghost", "caught a Secret")
            break
        end
    end
    -- Ascension crowns.
    for count, cosmetic in pairs(Cosmetics.ASCEND_REWARDS) do
        if (profile.totalAscensions or 0) >= count then
            grantCosmetic(player, cosmetic, ("Crest %d"):format(count))
        end
    end
end

local CREW_METRIC_FOR = {
    catch = "catches", gulp = "gulps", pitWin = "pitWins",
    trade = "trades", ascend = "ascensions",
}

local function progress(player: Player, source: string, amount: number?)
    local profile = Data.get(player)
    if not profile then return end

    local gained, tierUp = Season.award(profile.season, source)
    if tierUp then
        local tier = Season.tierOf(profile.season.xp)
        notify(player, ("⭐ Season tier %d!"):format(tier), "good")
    end

    local metric = CREW_METRIC_FOR[source]
    if metric and profile.crewId then
        local week = Crew.currentWeek()
        CrewStore.update(profile.crewId, function(crew)
            Crew.contribute(crew, player.UserId, metric, amount or 1, week)
            return crew
        end)
    end
    checkAchievements(player)
end

-- Defined here rather than beside the crew remotes: `local function` only
-- enters scope from its declaration onward, so defining it further down left
-- onJoin resolving `syncCrew` to a nil GLOBAL and every player join erroring.
local function syncCrew(player: Player)
    local profile = Data.get(player)
    if not profile then return end
    local crew = profile.crewId and CrewStore.get(profile.crewId) or nil
    if not crew then
        Net.get("CrewSync"):FireClient(player, nil)
        return
    end
    local week = Crew.currentWeek()
    Crew.rollWeek(crew, week)
    local goal = Crew.goalForWeek(week)
    local members = {}
    for idStr, m in pairs(crew.members or {}) do
        table.insert(members, { name = m.name, contributed = m.contributed or 0,
                                owner = tostring(crew.ownerId) == idStr })
    end
    table.sort(members, function(a, b) return a.contributed > b.contributed end)
    Net.get("CrewSync"):FireClient(player, {
        id = crew.id, name = crew.name, tag = crew.tag,
        members = members, memberCount = Crew.memberCount(crew),
        maxMembers = Crew.MAX_MEMBERS,
        goalLabel = goal.label:format(Format.comma(goal.target)),
        progress = crew.progress or 0,
        target = goal.target,
        complete = Crew.isComplete(crew, week),
        claimed = Crew.hasClaimed(crew, player.UserId),
    })
end

-- ── Sumo Pit wiring ────────────────────────────────────────────────────────
PitService.getProfile = function(p) return Data.get(p) end
PitService.getGoob = activeGoobOf
PitService.getBall = function(p) return RollService.ballFor(p) end
PitService.teleport = function(p, pos) RollService.teleport(p, pos) end
PitService.onEffect = function(p, kind, a, b) Effect:FireClient(p, kind, a, b) end
PitService.awardXp = function(p, source) progress(p, source) end
PitService.start()

PitService.onNotify.Event:Connect(function(player, msg, kind)
    notify(player, msg, kind)
end)
PitService.onSync.Event:Connect(function(state)
    Net.get("PitSync"):FireAllClients(state)
end)
PitService.onResult.Event:Connect(function(winner)
    local profile = Data.get(winner)
    if profile then checkAchievements(winner) end
    push(winner)
end)


-- Steady HUD refresh. 2Hz is plenty — glob ticks up smoothly on the client via
-- local interpolation, so we only need to correct it twice a second.
task.spawn(function()
    while true do
        task.wait(0.5)
        for _, player in ipairs(Players:GetPlayers()) do
            push(player)
        end
    end
end)

-- ── Leaderboard ────────────────────────────────────────────────────────────

-- The Archive board.
task.spawn(function()
    local world = Workspace:WaitForChild("GoobWorld")
    local archive = world:WaitForChild("Archive")
    local entries = archive:WaitForChild("Board"):WaitForChild("Entries") :: TextLabel
    local function render(rows)
        local text = "📜 THE ARCHIVE\nhow many still exist, worldwide\n\n"
        for _, row in ipairs(rows) do
            local odds = row.weight > 0
                and ("1 in " .. Format.comma(math.floor(Feedstock.TOTAL_WEIGHT / row.weight)))
                or "?"
            text ..= ("%s\n   %s alive   ·   %s found   ·   %s eaten\n   %s\n\n")
                :format(row.name, Format.comma(row.alive), Format.comma(row.caught),
                        Format.comma(row.destroyed), odds)
        end
        if #rows == 0 then text ..= "nothing rare has been found yet." end
        text ..= "\nAscending destroys everything in a Goob's belly."
        entries.Text = text
    end
    render(CensusService.snapshot())
    CensusService.onUpdate.Event:Connect(render)
    while true do
        task.wait(20)
        render(CensusService.snapshot())
    end
end)

task.spawn(function()
    local pillar = Workspace:WaitForChild("GoobWorld"):WaitForChild("Leaderboard")
    local entries = pillar:WaitForChild("Board"):WaitForChild("Entries") :: TextLabel
    while true do
        -- Ranked on LIFETIME BANKED, which is the answer to "what is the
        -- point of this game". Ranking on current mass would reward whoever
        -- happened to be mid-run when the board refreshed, and would tell a
        -- new player that the goal is to hold mass — the exact instinct the
        -- melt is designed to punish.
        local rows = {}
        for _, player in ipairs(Players:GetPlayers()) do
            local profile = Data.get(player)
            if profile then
                table.insert(rows, {
                    name = player.DisplayName,
                    banked = profile.lifetimeBanked or 0,
                    best = profile.bestBank or 0,
                    holding = ArenaService.massOf(player),
                })
            end
        end
        table.sort(rows, function(x, y) return x.banked > y.banked end)

        local text = "🏦 TOP BANKERS\n\n"
        for i = 1, math.min(10, #rows) do
            local r = rows[i]
            text ..= string.format("%d. %s\n    💧%s banked · best run 💧%s · holding %s\n",
                i, r.name, Format.short(r.banked), Format.short(r.best), Format.short(r.holding))
        end
        if #rows == 0 then text ..= "nobody yet — be the first!" end
        entries.Text = text
        LeaderboardSync:FireAllClients(rows)
        task.wait(4)
    end
end)


-- ═══════════════════════════════════════════════════════════════════════════
-- THE ARENA
-- ═══════════════════════════════════════════════════════════════════════════
-- ArenaService owns the run; this file owns the profile. The two are wired
-- through an injected table rather than by requiring each other, so the arena
-- never touches the datastore and there stays exactly one place where Glob is
-- created.

local ArenaSync = Net.get("ArenaSync")
local CrateResult = Net.get("CrateResult")

ArenaService.start({
    award = function(player, glob, _xp, reason)
        local profile = Data.get(player)
        if not profile then return end
        profile.glob += glob
        if reason == "bank" then
            profile.lifetimeBanked += glob
            if glob > (profile.bestBank or 0) then
                profile.bestBank = glob
            end
            progress(player, "bank")
            -- A run taken past 60% of the ceiling is a real decision to stay
            -- out while melting, and it gets paid for separately.
            local run = ArenaService.runFor(player)
            if run and run.bestMass > Blob.ceiling(0.8) * 0.6 then
                progress(player, "bigBank")
            end
            -- Powers unlock on lifetime banked, so a bank can hand one over.
            for _, power in ipairs(Powers.LIST) do
                if power.unlockBanked > 0
                    and profile.lifetimeBanked >= power.unlockBanked
                    and profile.lifetimeBanked - glob < power.unlockBanked then
                    notify(player, ("🔓 New power: %s — %s"):format(power.name, power.blurb), "good")
                end
            end
        end
        push(player)
    end,

    notify = notify,
    effect = function(player, kind, data) Effect:FireClient(player, kind, data) end,

    loadout = function(player)
        local profile = Data.get(player)
        if not profile then return {}, Powers.DEFAULT end
        return profile.trinketSlots or {}, profile.powerId or Powers.DEFAULT
    end,

    sync = function(player, state) ArenaSync:FireClient(player, state) end,
    teach = teach,

    powerUses = function(player)
        local profile = Data.get(player)
        return (profile and profile.powerUses) or {}
    end,

    notePowerUse = function(player, id)
        local profile = Data.get(player)
        if not profile then return end
        profile.powerUses = profile.powerUses or {}
        local before = profile.powerUses[id] or 0
        profile.powerUses[id] = before + 1
        -- Announce a mastery tier the moment it lands. A stat that improves
        -- silently is a stat the player never learns they have.
        local was, now = Powers.masteryTier(before), Powers.masteryTier(before + 1)
        if now > was then
            local power = Powers.get(id)
            notify(player, ("✨ %s mastery %d — quicker and cheaper.")
                :format(power and power.name or id, now), "good")
            push(player)
        end
    end,
})

-- One button. The client sends where it is aiming; the server decides
-- everything else, including whether the player can afford the press.
Net.get("UsePower").OnServerEvent:Connect(function(player, aim)
    local dir = typeof(aim) == "Vector3" and aim or nil
    -- Never trust a client vector's magnitude: a 10,000-stud "aim" is a
    -- launch exploit, and normalising here costs nothing.
    if dir and dir.Magnitude > 0.01 then
        dir = dir.Unit
    else
        dir = nil
    end
    local ok, why = ArenaService.usePower(player, dir)
    if not ok and why then
        notify(player, "⏳ " .. why, "warn")
    end
end)

Net.get("SetPower").OnServerEvent:Connect(function(player, id)
    local profile = Data.get(player)
    if not profile or typeof(id) ~= "string" then return end
    if not Powers.isOwned(id, profile.lifetimeBanked or 0) then
        local power = Powers.get(id)
        notify(player, power
            and ("🔒 %s unlocks at 💧%s banked."):format(power.name, Format.short(power.unlockBanked))
            or "That power doesn't exist.", "warn")
        return
    end
    profile.powerId = id
    ArenaService.refreshLoadout(player)
    local power = Powers.get(id)
    notify(player, ("Carrying %s."):format(power and power.name or id), "good")
    push(player)
end)

Net.get("EquipTrinket").OnServerEvent:Connect(function(player, id, slot)
    local profile = Data.get(player)
    if not profile or typeof(slot) ~= "number" then return end
    slot = math.clamp(math.floor(slot), 1, Trinkets.SLOTS)
    profile.trinketSlots = profile.trinketSlots or {}

    if id == nil or id == "" then
        table.remove(profile.trinketSlots, slot)
    else
        if typeof(id) ~= "string" or not Trinkets.get(id) then return end
        if not (profile.trinketsOwned or {})[id] then
            notify(player, "You don't own that trinket.", "warn")
            return
        end
        -- Duplicates do nothing, so silently equipping one would read as a
        -- bug. Refuse it and say why.
        for i, existing in ipairs(profile.trinketSlots) do
            if existing == id and i ~= slot then
                notify(player, "That one's already equipped — duplicates do nothing.", "warn")
                return
            end
        end
        profile.trinketSlots[slot] = id
    end

    ArenaService.refreshLoadout(player)
    push(player)
end)

Net.get("OpenCrate").OnServerEvent:Connect(function(player, crateId)
    local profile = Data.get(player)
    if not profile or typeof(crateId) ~= "string" then return end
    local crate = Crates.get(crateId)
    if not crate then return end

    if crate.price <= 0 then
        notify(player, "That crate isn't for sale — it comes from Beta Season.", "warn")
        return
    end
    if profile.glob < crate.price then
        notify(player, ("Need 💧%s for a %s."):format(Format.short(crate.price), crate.name), "warn")
        return
    end

    profile.glob -= crate.price
    profile.cratePity = profile.cratePity or {}
    local pity = profile.cratePity[crateId] or 0
    local reward, nextPity = Crates.roll(crateId, Random.new(os.clock() * 1e6 // 1 + player.UserId), pity)
    profile.cratePity[crateId] = nextPity
    if not reward then
        profile.glob += crate.price   -- refund rather than eat the payment
        notify(player, "That crate is empty right now. Refunded.", "warn")
        push(player)
        return
    end

    local duplicate = false
    if reward.kind == "cosmetic" then
        duplicate = Cosmetics.owns(profile.cosmeticsOwned, reward.id)
        profile.cosmeticsOwned[reward.id] = true
    else
        profile.trinketsOwned = profile.trinketsOwned or {}
        duplicate = profile.trinketsOwned[reward.id] == true
        profile.trinketsOwned[reward.id] = true
    end

    local refund = 0
    if duplicate then
        refund = Crates.dupeValue(crateId, reward.rarity)
        profile.glob += refund
    end

    CrateResult:FireClient(player, {
        crate = crateId,
        reward = reward,
        duplicate = duplicate,
        refund = refund,
        pity = Crates.rollsUntilPity(crateId, nextPity),
    })
    push(player)
end)

-- ── The daily streak ───────────────────────────────────────────────────────
-- The smallest honest retention hook there is: come back tomorrow, get a
-- little more than you got today. It pays GLOB, never mass and never a power,
-- so missing a week costs you some spending money and nothing you can be
-- beaten with. A streak that gates power is a streak that punishes having a
-- life.
local STREAK_BASE = 900
local STREAK_STEP = 450
local STREAK_CAP = 7

local function claimDaily(player: Player)
    local profile = Data.get(player)
    if not profile then return end
    local today = math.floor(os.time() / 86400)
    if profile.streakDay == today then
        return                      -- already collected
    end
    -- Consecutive if yesterday; otherwise the streak restarts at one. Nothing
    -- in between, and no grace period: a "you nearly kept it" message is worse
    -- than a clean reset.
    profile.streak = (profile.streakDay == today - 1) and (profile.streak + 1) or 1
    profile.streakDay = today

    local day = math.min(profile.streak, STREAK_CAP)
    local reward = STREAK_BASE + STREAK_STEP * (day - 1)
    profile.glob += reward

    notify(player, ("📅 Day %d streak — 💧%s%s"):format(
        profile.streak, Format.short(reward),
        profile.streak >= STREAK_CAP and "  (max)" or ""), "good")
    push(player)
end

-- ── Player lifecycle ───────────────────────────────────────────────────────

local function onJoin(player: Player)
    local profile = Data.load(player)
    if not profile then return end   -- Data.load kicks on a real load failure

    WorldBuilder.claimPlot(player)

    local earned = GoobService.applyOffline(player)
    if earned > 1 then
        notify(player, ("💤 While you were gone your Goob digested and earned 💧%s")
            :format(Format.short(earned)), "good")
    end

    player.CharacterAdded:Connect(function()
        task.wait(0.4)
        GoobService.spawnFor(player)
    end)

    GoobService.spawnFor(player)
    ArenaService.enter(player)
    claimDaily(player)
    RollService.applyCosmetics(player, profile.loadout)
    syncCrew(player)
    checkAchievements(player)
    push(player)

    notify(player, "Welcome! Eat. You melt as you grow — bank it at the Vault before you lose it. 🫧", "good")
end

local function onLeave(player: Player)
    ArenaService.leave(player)
    PitService.cleanup(player)
    TradeService.cleanup(player)
    GoobService.despawnFor(player)
    WorldBuilder.releasePlot(player)
    Data.save(player, true)
end

Players.PlayerAdded:Connect(onJoin)
Players.PlayerRemoving:Connect(onLeave)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(onJoin, p) end

task.spawn(function()
    while true do
        task.wait(Config.AUTOSAVE_INTERVAL)
        Data.saveAll()
    end
end)

game:BindToClose(function()
    for _, player in ipairs(Players:GetPlayers()) do
        Data.save(player, false)
    end
    task.wait(1.5)
end)

-- ── Remote handlers ────────────────────────────────────────────────────────

Net.get("RequestProfile").OnServerInvoke = function(player: Player)
    -- Wait briefly in case the player fired this before Data.load finished.
    local deadline = os.clock() + 8
    while not Data.get(player) and os.clock() < deadline do task.wait(0.1) end
    return snapshot(player)
end

Net.get("CatchCritter").OnServerEvent:Connect(function(player: Player, target: Instance)
    local ok, item = CritterService.tryCatch(player, target)
    if not ok then return end
    GoobService.feed(player, item.id)
    progress(player, "catch")
    CensusService.recordCaught(item.id)
    Effect:FireClient(player, "catch", item.id)
    if item.rarity == "Secret" then progress(player, "secret") end
    teach(player, "catch")
    -- The digest step has no action of its own; catching enough to see the
    -- number move is the lesson, so it clears alongside.
    teach(player, "digest")
    push(player)
    local isBig = item.rarity ~= "Common" and item.rarity ~= "Uncommon"
    notify(player, ("+%s  (%s)"):format(item.name, item.rarity), isBig and "good" or "info")
end)

Net.get("RenameGoob").OnServerEvent:Connect(function(player: Player, goobId: string, raw: string)
    local profile = Data.get(player)
    if not profile then return end
    local clean = Names.sanitize(raw)
    if not clean then
        notify(player, "That name won't work — 2 to 22 letters, no symbols.", "warn")
        return
    end
    -- Roblox requires a real filter pass on anything a player typed that other
    -- players will see. This is a policy requirement, not an optional nicety.
    local ok, filtered = pcall(function()
        local res = TextService:FilterStringAsync(clean, player.UserId, Enum.TextFilterContext.PublicChat)
        return res:GetNonChatStringForBroadcastAsync()
    end)
    if not ok then
        notify(player, "Couldn't check that name right now, try again.", "warn")
        return
    end

    for _, g in ipairs(profile.goobs) do
        if g.id == goobId then
            g.nickname = filtered
            if g.id == profile.activeGoobId then GoobService.refreshModel(player, g) end
            push(player)
            return
        end
    end
end)

Net.get("Ascend").OnServerEvent:Connect(function(player: Player)
    local profile = Data.get(player)
    if not profile then return end
    local goob = GoobService.activeGoob(profile)
    local crests = profile.crests or 0

    local ok, reason = Ascension.canAscend(goob, crests)
    if not ok then
        notify(player, reason or "Not yet.", "warn")
        return
    end

    -- Must physically be at the altar. Ascension is the biggest moment in the
    -- game; making it a place you travel to is most of what makes it feel like
    -- one, and it keeps the action off a menu the client could spam.
    local ball = RollService.ballFor(player)
    local pos = ball and ball.Position
        or (player.Character and (player.Character:FindFirstChild("HumanoidRootPart") :: BasePart?)
            and (player.Character.HumanoidRootPart :: BasePart).Position)
    if not pos then return end
    if (pos - WorldBuilder.altarPosition()).Magnitude > Ascension.ALTAR_RANGE + (ball and ball.Size.X / 2 or 0) then
        notify(player, "Roll to the 👑 ASCEND altar at the hub first.", "warn")
        return
    end

    local name = goob.nickname
    local wasMass = goob.mass
    -- Everything in its belly goes with it. This is what makes old Secrets
    -- genuinely rarer over time rather than just slower to find.
    CensusService.recordDestroyed(goob.contents)

    -- Consume it. Same rule as every other sink in this game.
    for i, g in ipairs(profile.goobs) do
        if g.id == goob.id then table.remove(profile.goobs, i) break end
    end
    profile.crests = crests + 1
    profile.totalAscensions = (profile.totalAscensions or 0) + 1

    -- Always leave them with something to play.
    if #profile.goobs == 0 then
        table.insert(profile.goobs, Data.newGoob(Random.new(os.clock() * 1e6 + player.UserId)))
    end
    profile.activeGoobId = profile.goobs[1].id

    Effect:FireClient(player, "ascend")
    GoobService.spawnFor(player)
    progress(player, "ascend")
    checkAchievements(player)
    Data.save(player)
    push(player)

    notify(player, ("👑 ASCENDED! %s (⚡%s) is gone. Crest %d earned — all food is now worth %.0f%% more.")
        :format(name, Format.short(wasMass), profile.crests,
                Ascension.foodMultiplier(profile.crests) * 100), "good")
    Notify:FireAllClients(("👑 %s just ASCENDED for Crest %d!")
        :format(player.DisplayName, profile.crests), "secret")
end)

-- Purely cosmetic: lets other clients see a dash trail.
Net.get("EquipCosmetic").OnServerEvent:Connect(function(player: Player, kind: string, id: string)
    local profile = Data.get(player)
    if not profile or typeof(kind) ~= "string" or typeof(id) ~= "string" then return end
    local item = Cosmetics.get(id)
    if not item or item.kind ~= kind then return end
    if not Cosmetics.owns(profile.cosmeticsOwned, id) then
        notify(player, "You don't own that yet.", "warn")
        return
    end
    profile.loadout[kind] = id
    profile.loadout = Cosmetics.sanitise(profile.loadout, profile.cosmeticsOwned)
    RollService.applyCosmetics(player, profile.loadout)
    push(player)
end)

Net.get("ClaimSeason").OnServerEvent:Connect(function(player: Player, tier: number, premium: boolean)
    local profile = Data.get(player)
    if not profile or typeof(tier) ~= "number" then return end
    premium = premium == true
    if premium and not profile.season.premium then
        notify(player, "That reward needs the Premium pass.", "warn")
        return
    end
    -- Re-derive what is claimable server-side; the client sends only which row
    -- it pressed, never whether it has earned it.
    for _, entry in ipairs(Season.claimable(profile.season)) do
        if entry.tier == tier and entry.premium == premium then
            Season.markClaimed(profile.season, tier, premium)
            grantCosmetic(player, entry.cosmetic, ("Season tier %d"):format(tier))
            push(player)
            return
        end
    end
    notify(player, "Nothing to claim there.", "warn")
end)

Net.get("PitJoin").OnServerEvent:Connect(function(player: Player)
    PitService.join(player)
    push(player)
end)
Net.get("PitLeave").OnServerEvent:Connect(function(player: Player)
    PitService.leave(player)
    push(player)
end)

-- ── Crews ──────────────────────────────────────────────────────────────────


Net.get("CrewCreate").OnServerEvent:Connect(function(player: Player, name: string, tag: string)
    local profile = Data.get(player)
    if not profile then return end
    if profile.crewId then notify(player, "You're already in a crew.", "warn") return end

    local cleanName = Crew.sanitiseName(name)
    local cleanTag = Crew.sanitiseTag(tag)
    if not cleanName or not cleanTag then
        notify(player, "Name 3-20 letters, tag 2-4 letters.", "warn")
        return
    end

    local goob = GoobService.activeGoob(profile)
    local cost = goob and GoobMath.incomePerSecond(goob) * Crew.CREATE_COST_SECONDS or 1000
    if profile.glob < cost then
        notify(player, ("Founding a crew costs 💧%s."):format(Format.short(cost)), "warn")
        return
    end

    -- Filter anything other players will read, exactly as for Goob names.
    local ok, filteredName = pcall(function()
        local res = TextService:FilterStringAsync(cleanName, player.UserId,
            Enum.TextFilterContext.PublicChat)
        return res:GetNonChatStringForBroadcastAsync()
    end)
    if not ok then notify(player, "Couldn't check that name, try again.", "warn") return end

    local crew = CrewStore.create(filteredName, cleanTag, player.UserId, player.DisplayName)
    if not crew then
        notify(player, "That tag is taken — pick another.", "warn")
        return
    end
    profile.glob -= cost
    profile.crewId = crew.id
    notify(player, ("🛡️ Founded [%s] %s!"):format(crew.tag, crew.name), "good")
    syncCrew(player); push(player)
end)

Net.get("CrewJoin").OnServerEvent:Connect(function(player: Player, tag: string)
    local profile = Data.get(player)
    if not profile then return end
    if profile.crewId then notify(player, "Leave your crew first.", "warn") return end
    local cleanTag = Crew.sanitiseTag(tag)
    if not cleanTag then notify(player, "That's not a valid tag.", "warn") return end

    local crew = CrewStore.findByTag(cleanTag)
    if not crew then notify(player, "No crew with that tag.", "warn") return end
    if Crew.isFull(crew) then notify(player, "That crew is full.", "warn") return end

    CrewStore.update(crew.id, function(c)
        c.members = c.members or {}
        c.members[tostring(player.UserId)] = {
            name = player.DisplayName, joined = os.time(), contributed = 0,
        }
        return c
    end)
    profile.crewId = crew.id
    notify(player, ("🛡️ Joined [%s] %s!"):format(crew.tag, crew.name), "good")
    syncCrew(player); push(player)
end)

Net.get("CrewLeave").OnServerEvent:Connect(function(player: Player)
    local profile = Data.get(player)
    if not profile or not profile.crewId then return end
    local id = profile.crewId
    CrewStore.update(id, function(c)
        if c.members then c.members[tostring(player.UserId)] = nil end
        return c
    end)
    profile.crewId = nil
    notify(player, "Left your crew.", "info")
    syncCrew(player); push(player)
end)

Net.get("CrewClaim").OnServerEvent:Connect(function(player: Player)
    local profile = Data.get(player)
    if not profile or not profile.crewId then return end
    local week = Crew.currentWeek()
    local crew = CrewStore.get(profile.crewId)
    if not crew or not Crew.isComplete(crew, week) then
        notify(player, "The weekly goal isn't finished yet.", "warn")
        return
    end
    if Crew.hasClaimed(crew, player.UserId) then
        notify(player, "You've already claimed this week.", "warn")
        return
    end
    local goob = GoobService.activeGoob(profile)
    local reward = goob and GoobMath.incomePerSecond(goob) * Crew.REWARD_GLOB_SECONDS or 500
    profile.glob += reward
    CrewStore.update(crew.id, function(c) Crew.markClaimed(c, player.UserId) return c end)
    progress(player, "crewGoal")
    notify(player, ("🛡️ Crew goal reward: +💧%s"):format(Format.short(reward)), "good")
    syncCrew(player); push(player)
end)

Net.get("BuyProduct").OnServerEvent:Connect(function(player: Player, id: string)
    -- Purchases are prompted client-side via MarketplaceService; this handler
    -- exists so the client can ask what is actually for sale, and so an
    -- unconfigured product says so plainly instead of failing silently.
    if typeof(id) ~= "string" then return end
    for _, list in ipairs({ Monetisation.GAMEPASSES, Monetisation.PRODUCTS }) do
        for _, entry in ipairs(list) do
            if entry.id == id then
                if not Monetisation.isConfigured(entry) then
                    notify(player, "That isn't on sale yet.", "warn")
                end
                return
            end
        end
    end
end)

Net.get("Dashed").OnServerEvent:Connect(function(player: Player)
    local ball = RollService.ballFor(player)
    if not ball then return end
    ball:SetAttribute("DashAt", os.clock())
end)

Net.get("DismissTutorial").OnServerEvent:Connect(function(player: Player)
    local profile = Data.get(player)
    if not profile or not profile.tutorial then return end
    profile.tutorial.dismissed = true
    push(player)
end)

Net.get("SetActiveGoob").OnServerEvent:Connect(function(player: Player, goobId: string)
    local profile = Data.get(player)
    if not profile or typeof(goobId) ~= "string" then return end
    for _, g in ipairs(profile.goobs) do
        if g.id == goobId then
            profile.activeGoobId = goobId
            GoobService.spawnFor(player)
            push(player)
            notify(player, "Now displaying " .. g.nickname .. ".", "info")
            return
        end
    end
end)

Net.get("BuyEgg").OnServerEvent:Connect(function(player: Player)
    local profile = Data.get(player)
    if not profile then return end
    local active = GoobService.activeGoob(profile)
    if not active then return end

    if #profile.goobs >= Config.MAX_GOOBS then
        notify(player, ("You can only keep %d Goobs at once."):format(Config.MAX_GOOBS), "warn")
        return
    end

    -- Price is recomputed server-side from the current Goob and the current
    -- count. The client sends no price, only the button press.
    local price = GoobMath.eggPrice(active, #profile.goobs)
    if profile.glob < price then
        notify(player, "Not enough 💧 for an egg.", "warn")
        return
    end

    profile.glob -= price
    local egg = Data.newGoob(Random.new(os.clock() * 1e6 + player.UserId))
    table.insert(profile.goobs, egg)
    teach(player, "egg")
    progress(player, "egg")
    push(player)
    notify(player, ("🥚 A new Goob hatched: %s! Gulp it, raise it, or trade it.")
        :format(egg.nickname), "good")
end)

Net.get("BuySnack").OnServerEvent:Connect(function(player: Player, tierId: string)
    local profile = Data.get(player)
    if not profile or typeof(tierId) ~= "string" then return end
    local goob = GoobService.activeGoob(profile)
    if not goob then return end

    local tier
    for _, t in ipairs(Config.SNACK_TIERS) do
        if t.id == tierId then tier = t break end
    end
    if not tier then return end

    -- Price is recomputed server-side from the CURRENT Goob. The client sends
    -- only which button was pressed, never a price.
    local price = GoobMath.snackPrice(goob, tier)
    if profile.glob < price then
        notify(player, "Not enough 💧 for a " .. tier.name .. ".", "warn")
        return
    end

    profile.glob -= price
    local rng = Random.new(os.clock() * 1e6 + player.UserId)
    local best, bestRarity = nil, 0
    local rarityRank = {}
    for i, r in ipairs(Feedstock.RARITY_ORDER) do rarityRank[r] = i end

    for _ = 1, tier.rolls do
        -- `false` = no Secrets from the shop. See Feedstock.roll.
        local item = Feedstock.roll(rng, tier.luck, false)
        GoobService.feed(player, item.id)
        CensusService.recordCaught(item.id)
        local rank = rarityRank[item.rarity] or 0
        if rank > bestRarity then best, bestRarity = item, rank end
    end

    teach(player, "snack")
    progress(player, "snack")
    push(player)
    if best then
        notify(player, ("%s %s — %d items, best was %s (%s)")
            :format(tier.emoji, tier.name, tier.rolls, best.name, best.rarity),
            bestRarity >= 5 and "good" or "info")
    end
end)

Net.get("GulpGoob").OnServerEvent:Connect(function(player: Player, eaterId: string, eatenId: string)
    local ok, reason = GoobService.gulp(player, eaterId, eatenId)
    if ok then
        notify(player, "😋 GULP! Your Goob swallowed another one.", "good")
        Effect:FireClient(player, "gulp")
        teach(player, "gulp")
        progress(player, "gulp")
        push(player)
    elseif reason then
        notify(player, reason, "warn")
    end
end)

Net.get("TradeRequest").OnServerEvent:Connect(function(player, targetName)
    if typeof(targetName) == "string" then TradeService.request(player, targetName) end
end)
Net.get("TradeRespond").OnServerEvent:Connect(function(player, accept)
    TradeService.respond(player, accept == true)
end)
Net.get("TradeOffer").OnServerEvent:Connect(function(player, goobId, add)
    if typeof(goobId) == "string" then TradeService.offer(player, goobId, add == true) end
end)
Net.get("TradeConfirm").OnServerEvent:Connect(function(player, holding)
    TradeService.confirm(player, holding == true)
end)
Net.get("TradeCancel").OnServerEvent:Connect(function(player)
    TradeService.cancel(player)
end)

TradeService.onSync.Event:Connect(function(player, state)
    TradeSync:FireClient(player, state)
    push(player)
end)
TradeService.onNotify.Event:Connect(function(player, msg, kind)
    notify(player, msg, kind)
end)

CritterService.onSecret.Event:Connect(function(item)
    Notify:FireAllClients(("🌟 A %s just appeared somewhere in the world — GO!")
        :format(item.name), "secret")
end)

print(("[%s] ready. one island, %d pellets, %d powers, %d trinkets, %d crates.")
    :format(Config.GAME_NAME, Config.PELLET_TARGET, #Powers.LIST, #Trinkets.LIST, #Crates.LIST))
