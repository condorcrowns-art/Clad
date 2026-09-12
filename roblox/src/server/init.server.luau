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

local Data = require(script.Data)
local WorldBuilder = require(script.WorldBuilder)
local GoobService = require(script.GoobService)
local CritterService = require(script.CritterService)
local TradeService = require(script.TradeService)
local RollService = require(script.RollService)

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

local Notify = Net.get("Notify")
local StateSync = Net.get("StateSync")
local TradeSync = Net.get("TradeSync")
local LeaderboardSync = Net.get("LeaderboardSync")

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
        moveTopSpeed = active and Movement.topSpeed(active.mass) or 0,
        moveStopDistance = active and Movement.stoppingDistance(active.mass) or 0,
        datastore = Data.isEnabled(),
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

task.spawn(function()
    local pillar = Workspace:WaitForChild("GoobWorld"):WaitForChild("Leaderboard")
    local entries = pillar:WaitForChild("Board"):WaitForChild("Entries") :: TextLabel
    while true do
        local rows = {}
        for _, player in ipairs(Players:GetPlayers()) do
            local profile = Data.get(player)
            local goob = profile and GoobService.activeGoob(profile)
            if goob then
                table.insert(rows, {
                    name = player.DisplayName,
                    power = GoobMath.power(goob),
                    tier = GoobMath.ageTier(goob),
                    goobName = goob.nickname,
                })
            end
        end
        table.sort(rows, function(x, y) return x.power > y.power end)

        local text = "🏆 BIGGEST GOOBS\n\n"
        for i = 1, math.min(10, #rows) do
            local r = rows[i]
            text ..= string.format("%d. %s\n    %s %s · ⚡%s\n",
                i, r.name, r.tier.emoji, r.goobName, Format.short(r.power))
        end
        if #rows == 0 then text ..= "nobody yet — be the first!" end
        entries.Text = text
        LeaderboardSync:FireAllClients(rows)
        task.wait(4)
    end
end)

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
    push(player)

    notify(player, "Welcome to " .. Config.GAME_NAME .. "! Chase the junk, feed your Goob. 🫧", "good")
end

local function onLeave(player: Player)
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

    GoobService.spawnFor(player)
    Data.save(player)
    push(player)

    notify(player, ("👑 ASCENDED! %s (⚡%s) is gone. Crest %d earned — all food is now worth %.0f%% more.")
        :format(name, Format.short(wasMass), profile.crests,
                Ascension.foodMultiplier(profile.crests) * 100), "good")
    Notify:FireAllClients(("👑 %s just ASCENDED for Crest %d!")
        :format(player.DisplayName, profile.crests), "secret")
end)

-- Purely cosmetic: lets other clients see a dash trail.
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
        local rank = rarityRank[item.rarity] or 0
        if rank > bestRarity then best, bestRarity = item, rank end
    end

    teach(player, "snack")
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
        teach(player, "gulp")
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

print(("[%s] ready. %d plots, %d feedstock types.")
    :format(Config.GAME_NAME, Config.PLOT_COUNT, #Feedstock.ITEMS))
