--!strict
-- ArenaHud.luau — the screen, rebuilt.
--
-- THE COMPLAINT THIS FILE EXISTS TO FIX: "everything gets in the way of
-- everything". It was true. The old HUD had a stat panel, an age line, a
-- drawer button, a drawer, dash pips, toasts, a trade window and four panels,
-- any number of which could be on screen at once, several of them overlapping,
-- and none of them aware of the others.
--
-- The fix is structural, not cosmetic: THERE IS ONE SHEET, AND ONLY ONE.
-- Every service in the game is a tab on it. Opening any tab closes whatever
-- was open. Two things cannot overlap if only one thing can exist.
--
-- The screen is then divided into four regions that never intersect:
--
--   top-left      the stat column: mass, what it is worth, Glob, season tier
--   top-centre    the status strip — round clock, where you are, are you safe
--   top-right     the ☰ MENU button, and the tab list it drops
--   bottom-centre the three-slot hotbar, inside the only part of the bottom
--                 edge a phone player can actually reach
--
-- ── WHY THE MENU IS A NAMED VERTICAL LIST ON THE RIGHT ────────────────────
--
-- It was a horizontal strip of nine unlabelled icons across the top, and that
-- is two problems at once. A row of pictograms is a memory test — nobody knows
-- what 🔧 opens until they have opened it — and the top strip is the most
-- contested space on the screen, wanted by the clock, the stat card and the
-- Glob readout at the same time.
--
-- Down the right-hand edge every row carries its ICON AND ITS NAME, the list
-- reads top-to-bottom like a menu, and it grows downward instead of squeezing
-- everything else sideways. It is a DROPDOWN rather than a permanent rail
-- because a menu covering a third of a 568-wide phone the moment you spawn is
-- a menu the player closes before reading it: closed by default on touch, open
-- by default where there is room.
--
-- On touch the list opens to the LEFT of its button rather than under it.
-- Roblox reserves the bottom-right 160x160 for the jump button, which on a
-- landscape phone is the entire right-hand column below y=160 — a list that
-- dropped straight down would put most of its rows somewhere a thumb cannot
-- reach. See Layout.menuMetrics.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local Format = require(Shared.Format)
local Powers = require(Shared.Powers)
local Trinkets = require(Shared.Trinkets)
local Crates = require(Shared.Crates)
local Cosmetics = require(Shared.Cosmetics)

-- NOTE: no GoobMath here, deliberately.
--
-- The client never sees a raw Goob. What arrives over StateSync is a
-- SERIALISED one — nickname, mass, power, ageTier, ageText and so on, already
-- computed server-side — and it carries no bornAt, no inheritedAge and no
-- lineage table of the shape GoobMath expects. Calling GoobMath.ageSeconds()
-- on it subtracts nil and takes the whole panel down with it, which is exactly
-- what this file used to do. If a number is needed here, it is sent; if it is
-- not sent, it gets added to the snapshot rather than recomputed from parts
-- the client does not have.

-- Where a locked item comes from. A padlock with no explanation is the most
-- annoying thing a wardrobe can show you.
local SOURCE_TEXT = {
    starter     = "Starter",
    season      = "Beta Season reward",
    shop        = "Shop",
    ascend      = "Earned by ascending",
    achievement = "Achievement",
    crate_goop  = "Found in Goop Crates",
    crate_deep  = "Found in Deep Crates",
    beta        = "BETA SEASON ONLY — never printed again",
}

local Theme = require(script.Parent.Theme)
local Layout = require(script.Parent.Layout)
local Panels = require(script.Parent.Panels)

local player = Players.LocalPlayer

local ArenaHud = {}

-- Filled in by init.client. Declared up front so every handler below closes
-- over the table rather than over a local that may not exist yet — the
-- `local function` scoping trap that took down two earlier builds.
ArenaHud.on = {
    usePower = function(_slot: number, _aim: Vector3?) end,
    setPower = function(_id: string) end,
    equipTrinket = function(_id: string?, _slot: number) end,
    openCrate = function(_id: string) end,
    equipCosmetic = function(_kind: string, _id: string) end,
    setActiveGoob = function(_id: string) end,
    -- Irreversible, so it goes through init.client's two-step confirmation
    -- rather than firing the remote from a card.
    gulpGoob = function(_id: string) end,
    joinPit = function() end,
    leavePit = function() end,
}

local gui: ScreenGui
local statCard: Frame
local massLabel: TextLabel
local worthLabel: TextLabel
local meltLabel: TextLabel
local globLabel: TextLabel
local seasonLabel: TextLabel
local statusStrip: Frame
local statusLabel: TextLabel
local bankBar: Frame
local bankFill: Frame
local menu: Frame          -- the header button's frame
local menuHeader: TextButton
local menuList: ScrollingFrame
local menuOpen = false

-- THREE SLOTS, NOT ONE BUTTON.
--
-- The game used to carry exactly one power, on the argument that a nine-year-
-- old has one thumb free. That argument still holds for the CHOSEN power — but
-- two of the three are not choices. DASH and SPLIT are verbs the game is built
-- out of: you cannot play agar-shaped without a lunge and a way to throw part
-- of yourself at something. Making them compete for the one slot meant every
-- player picked the same two and the "choice" was a formality.
--
-- So: slot 1 is DASH, slot 2 is SPLIT, slot 3 is yours. Fixed order, fixed
-- position, every round — muscle memory is worth more than flexibility on a
-- control you press under pressure.
type Slot = { button: TextButton, sweep: Frame, cost: TextLabel, name: TextLabel }
local slots: { Slot } = {}
local sheet: Frame
local sheetTitle: TextLabel
local sheetBody: ScrollingFrame
-- A plain frame beside sheetBody, for the two tabs whose renderers live in
-- Panels and bring their own scroller. Nesting a ScrollingFrame inside another
-- one traps the drag on a phone: the inner list eats the gesture and the outer
-- panel never moves, which is a bug you only find on hardware.
local sheetHost: ScrollingFrame

local menuButtons: { [string]: TextButton } = {}
local openTab: string? = nil
local latest: any = nil
local profile: any = nil
local pit: any = nil

local TABS = {
    { id = "crates",    icon = "🎁", name = "CRATES" },
    { id = "wear",      icon = "👕", name = "WARDROBE" },
    { id = "trinkets",  icon = "🔧", name = "TRINKETS" },
    { id = "powers",    icon = "⚡", name = "POWERS" },
    { id = "inventory", icon = "🫧", name = "YOUR GOOBS" },
    { id = "trade",     icon = "🤝", name = "TRADE" },
    { id = "season",    icon = "⭐", name = "BETA SEASON" },
    { id = "crew",      icon = "🛡️", name = "YOUR CREW" },
    { id = "standoff",  icon = "🥊", name = "THE STANDOFF" },
}

-- Tabs whose body is drawn by Panels rather than by this file. They render
-- into sheetHost; everything else renders into sheetBody.
local DELEGATED = { season = true, crew = true }

-- One card shape for every ownable thing in the game — a skin, a trinket, a
-- power, a Goob. Rarity is a stroke colour and nothing else, so the eye learns
-- one rule instead of four. The previous UI drew Goobs, cosmetics and season
-- rewards three different ways, which is most of why the screen felt like
-- several games stapled together.
local function card(parent: Instance, order: number, height: number, rarity: string?): Frame
    local f = Instance.new("Frame")
    f.Name = "Card"
    f.Size = UDim2.new(1, 0, 0, height)
    f.BackgroundColor3 = Theme.BG_SOFT
    f.BackgroundTransparency = 0.2
    f.BorderSizePixel = 0
    f.LayoutOrder = order
    f.Parent = parent
    Theme.corner(f, 12)
    if rarity then
        Theme.stroke(f, Cosmetics.RARITY_COLOUR[rarity] or Theme.TEXT_DIM, 2)
    end
    return f
end

-- A skin is a material and a hue on a ball seen across an arena, so the
-- preview is exactly that: a swatch in the item's own colour. Showing a name
-- alone asks the player to buy something they cannot picture.
local function swatch(parent: Instance, item: any, size: number)
    local sw = Instance.new("Frame")
    sw.Name = "Swatch"
    sw.Size = UDim2.fromOffset(size, size)
    sw.Position = UDim2.fromOffset(10, 10)
    sw.BackgroundColor3 = item.colour or Color3.fromRGB(150, 160, 170)
    sw.BorderSizePixel = 0
    sw.Parent = parent
    Theme.corner(sw, 999)
    Theme.stroke(sw, Cosmetics.RARITY_COLOUR[item.rarity] or Theme.TEXT_DIM, 2)
    if item.emoji and item.emoji ~= "" then
        local e = Theme.label({
            Size = UDim2.fromScale(1, 1), Text = item.emoji,
            TextSize = math.floor(size * 0.6),
            TextXAlignment = Enum.TextXAlignment.Center,
        })
        e.Parent = sw
    end
    return sw
end

-- ── Small builders ─────────────────────────────────────────────────────────

local function row(parent: Instance, height: number, order: number): Frame
    local f = Instance.new("Frame")
    f.Size = UDim2.new(1, 0, 0, height)
    f.BackgroundColor3 = Theme.BG_SOFT
    f.BackgroundTransparency = 0.25
    f.BorderSizePixel = 0
    f.LayoutOrder = order
    f.Parent = parent
    Theme.corner(f, 12)
    return f
end

local function actionButton(parent: Instance, text: string, colour: Color3,
    width: number, rightOffset: number?): TextButton
    local b = Theme.button(text, colour, UDim2.fromOffset(width, Layout.MIN_TAP))
    b.TextSize = 18
    b.AnchorPoint = Vector2.new(1, 0.5)
    b.Position = UDim2.new(1, -(rightOffset or 10), 0.5, 0)
    b.Parent = parent
    return b
end

-- ── The sheet ──────────────────────────────────────────────────────────────

local function clearSheet()
    for _, child in ipairs(sheetHost:GetChildren()) do
        if child:IsA("GuiObject") then child:Destroy() end
    end
    for _, child in ipairs(sheetBody:GetChildren()) do
        if not child:IsA("UIListLayout") and not child:IsA("UIPadding") then
            child:Destroy()
        end
    end
end

local function renderCrates()
    for i, crate in ipairs(Crates.LIST) do
        local r = row(sheetBody, 84, i)
        local name = Theme.label({
            Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -160, 0, 26),
            Text = crate.name, TextSize = 22, TextColor3 = Theme.GOLD,
        })
        name.Parent = r
        local blurb = Theme.label({
            Position = UDim2.fromOffset(14, 34), Size = UDim2.new(1, -160, 0, 20),
            Text = crate.blurb, TextSize = 14, TextColor3 = Theme.TEXT_DIM,
            TextWrapped = true,
        })
        blurb.Parent = r

        -- The pity counter is shown, always. A gacha whose cliff is invisible
        -- is a gacha that farms the player; one that says "three more and it
        -- is guaranteed" is a gacha the player is choosing to play.
        local pity = (profile and profile.cratePity and profile.cratePity[crate.id]) or 0
        local left = Crates.rollsUntilPity(crate.id, pity)
        local meter = Theme.label({
            Position = UDim2.fromOffset(14, 56), Size = UDim2.new(1, -160, 0, 18),
            Text = crate.price > 0
                and ("💧%s   ·   %d more until a guaranteed %s")
                    :format(Format.short(crate.price), left, crate.pityFloor)
                or "earned from Beta Season tiers",
            TextSize = 13, TextColor3 = Theme.ACCENT,
        })
        meter.Parent = r

        if crate.price > 0 then
            local afford = profile and (profile.glob or 0) >= crate.price
            local btn = actionButton(r, afford and "OPEN" or "NEED 💧",
                afford and Theme.GOOD or Theme.BG_SOFT, 116)
            btn.Active = afford == true
            btn.Activated:Connect(function()
                if afford then ArenaHud.on.openCrate(crate.id) end
            end)
        end
    end
end

local function renderTrinkets()
    local owned = (profile and profile.trinketsOwned) or {}
    local slots = (profile and profile.trinketSlots) or {}
    local equipped: { [string]: number } = {}
    for i, id in ipairs(slots) do equipped[id] = i end

    local header = row(sheetBody, 56, 0)
    local resolved = Trinkets.resolve(slots)
    local summary = Theme.label({
        Position = UDim2.fromOffset(14, 6), Size = UDim2.new(1, -24, 0, 44),
        Text = ("%d / %d slots  ·  melt x%.2f  ·  pellets x%.2f  ·  bank %+.0f%%")
            :format(#slots, Trinkets.SLOTS, resolved.leakMult, resolved.pelletMult,
                    resolved.bankHaste * 100),
        TextSize = 15, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
    })
    summary.Parent = header

    for i, t in ipairs(Trinkets.LIST) do
        local have = owned[t.id] == true
        local slot = equipped[t.id]
        local r = row(sheetBody, 66, i)
        local name = Theme.label({
            Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -150, 0, 24),
            Text = have and t.name or ("🔒 " .. t.name),
            TextSize = 19,
            TextColor3 = slot and Theme.GOOD or (have and Theme.TEXT or Theme.TEXT_DIM),
        })
        name.Parent = r
        local blurb = Theme.label({
            Position = UDim2.fromOffset(14, 32), Size = UDim2.new(1, -150, 0, 22),
            Text = have and t.blurb or ("Found in Deep Crates  ·  " .. t.rarity),
            TextSize = 13, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
        })
        blurb.Parent = r

        if have then
            local full = #slots >= Trinkets.SLOTS and not slot
            local btn = actionButton(r,
                slot and "REMOVE" or (full and "FULL" or "EQUIP"),
                slot and Theme.BAD or (full and Theme.BG_SOFT or Theme.ACCENT), 108)
            btn.Active = not full
            btn.Activated:Connect(function()
                if slot then
                    ArenaHud.on.equipTrinket(nil, slot)
                elseif not full then
                    ArenaHud.on.equipTrinket(t.id, #slots + 1)
                end
            end)
        end
    end
end

-- The Standoff is reachable from the menu, from anywhere on the island. There
-- is a sign and a join pad out by the ring as well, because a physical thing
-- you can roll onto is how a seven-year-old finds out a mode exists — but
-- nobody should have to cross the map to press a button they can see.
local function renderStandoff()
    local intro = row(sheetBody, 92, 0)
    local text = Theme.label({
        Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -24, 0, 76),
        Text = "Two blobs, the same mass, one ring.\n\n"
            .. "Whatever you arrived with is taken away — both fighters are set "
            .. "to the same size, so it is steering and power timing and nothing "
            .. "else. Last one in the ring takes the pot.",
        TextSize = 15, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
    })
    text.Parent = intro

    local status = row(sheetBody, 68, 1)
    local queued = false
    for _, n in ipairs((pit and pit.alive) or {}) do
        if n == player.DisplayName then queued = true end
    end
    local inMatch = pit and pit.inMatch

    local line = Theme.label({
        Position = UDim2.fromOffset(14, 10), Size = UDim2.new(1, -150, 0, 24),
        Text = inMatch and ("FIGHT IN PROGRESS · %d left"):format(#((pit and pit.alive) or {}))
            or ("%d / %d waiting"):format((pit and pit.queued) or 0, (pit and pit.minPlayers) or 2),
        TextSize = 19, TextColor3 = inMatch and Theme.BAD or Theme.TEXT,
    })
    line.Parent = status
    local sub = Theme.label({
        Position = UDim2.fromOffset(14, 34), Size = UDim2.new(1, -150, 0, 20),
        Text = (pit and (pit.lobbySeconds or 0) > 0)
            and ("starting in %ds"):format(pit.lobbySeconds)
            or "your stake is a slice of your income, never a Goob",
        TextSize = 13, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
    })
    sub.Parent = status

    if not inMatch then
        local btn = actionButton(status, queued and "LEAVE" or "ENTER",
            queued and Theme.BG_SOFT or Theme.BAD, 116)
        btn.Activated:Connect(function()
            if queued then ArenaHud.on.leavePit() else ArenaHud.on.joinPit() end
        end)
    end
end

local function renderPowers()
    local banked = (profile and profile.lifetimeBanked) or 0
    local current = (profile and profile.powerId) or Powers.DEFAULT
    local uses = (profile and profile.powerUses) or {}
    local granted = (profile and profile.powersGranted) or {}

    -- ── THE TWO YOU ALWAYS HAVE ───────────────────────────────────────────
    --
    -- Listed first and marked as fixed, because a player who cannot see DASH
    -- and SPLIT anywhere in this panel reasonably concludes they are not
    -- powers — and then wonders why two of their three buttons are missing
    -- from the list of powers.
    local head = card(sheetBody, 0, 62)
    local hl = Theme.label({
        Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -24, 0, 46),
        Text = "Slot 1 is DASH and slot 2 is SPLIT — always, for everyone."
            .. "\nThis list is slot 3.",
        TextSize = 14, TextColor3 = Theme.TEXT, TextWrapped = true,
    })
    hl.Parent = head

    local nextPower, gap = Powers.nextLocked(banked)
    local head2 = card(sheetBody, 1, 44)
    local hl2 = Theme.label({
        Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -24, 0, 28),
        Text = nextPower
            and ("Next: %s at 💧%s  —  %s to go"):format(nextPower.name,
                Format.short(nextPower.unlockBanked), Format.short(gap))
            or "Every power on the banking ladder is unlocked.",
        TextSize = 14, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
    })
    hl2.Parent = head2

    -- The season powers are in here too, locked, on purpose: a prize nobody
    -- knows exists is not a prize. Powers.catalogue is the one list that holds
    -- both pools so this panel cannot drift out of step with the server.
    for idx, p in ipairs(Powers.catalogue()) do
        local i = idx + 1
        local unlocked = granted[p.id] == true or banked >= p.unlockBanked
        local mine = uses[p.id] or 0
        local tier = Powers.masteryTier(mine)
        local r = card(sheetBody, i, 86, unlocked and "Common" or nil)
        local name = Theme.label({
            Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -150, 0, 24),
            Text = unlocked and p.name or ("🔒 " .. p.name),
            TextSize = 20,
            TextColor3 = (p.id == current) and Theme.GOOD or (unlocked and p.color or Theme.TEXT_DIM),
        })
        name.Parent = r
        local blurb = Theme.label({
            Position = UDim2.fromOffset(14, 32), Size = UDim2.new(1, -150, 0, 30),
            Text = unlocked
                and ("%s   ·   costs %d%% of you   ·   %ds"):format(p.blurb, p.cost * 100, p.cooldown)
                -- A season power says so rather than quoting an unreachable
                -- price. It is not on the banking ladder at any number, and
                -- printing "unlocks at 💧inf" would be both wrong and cruel.
                or (p.season
                    and "⭐ BETA SEASON reward — earned on the free track. Cannot be bought."
                    or ("Unlocks at 💧%s banked  (you have 💧%s)")
                        :format(Format.short(p.unlockBanked), Format.short(banked))),
            TextSize = 13, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
        })
        blurb.Parent = r

        if unlocked then
            local nextTier, toGo = Powers.masteryNext(mine)
            local stars = string.rep("★", tier) .. string.rep("☆", Powers.MASTERY_MAX_TIER - tier)
            local mastery = Theme.label({
                Position = UDim2.fromOffset(14, 62), Size = UDim2.new(1, -150, 0, 20),
                Text = nextTier
                    and ("%s  %d uses  ·  %d more for mastery %d"):format(stars, mine, toGo, nextTier)
                    or ("%s  mastered — %d%% quicker, %d%% cheaper"):format(stars,
                        Powers.MASTERY_MAX_TIER * Powers.MASTERY_COOLDOWN_PER_TIER * 100,
                        Powers.MASTERY_MAX_TIER * Powers.MASTERY_COST_PER_TIER * 100),
                TextSize = 12,
                TextColor3 = tier > 0 and Theme.GOLD or Theme.TEXT_DIM,
            })
            mastery.Parent = r
        end

        if unlocked and p.id ~= current then
            local btn = actionButton(r, "CARRY", Theme.ACCENT, 108)
            btn.Activated:Connect(function() ArenaHud.on.setPower(p.id) end)
        end
    end
end

local KINDS = {
    { id = "skin",  label = "BODY" },
    { id = "trail", label = "TRAIL" },
    { id = "eyes",  label = "EYES" },
    { id = "crown", label = "HAT" },
}
local wearKind = "skin"

local function renderWear()
    local owned = (profile and profile.cosmeticsOwned) or {}
    local worn = (profile and profile.loadout) or {}

    -- Kind switcher. Four slots is too many to scroll past every time you want
    -- a hat, and a tab strip is cheaper to read than four headings.
    local strip = card(sheetBody, 0, 50)
    local layout = Instance.new("UIListLayout")
    layout.FillDirection = Enum.FillDirection.Horizontal
    layout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    layout.VerticalAlignment = Enum.VerticalAlignment.Center
    layout.Padding = UDim.new(0, 6)
    layout.Parent = strip
    for i, k in ipairs(KINDS) do
        local b = Theme.button(k.label,
            wearKind == k.id and Theme.ACCENT or Theme.BG,
            UDim2.fromOffset(Layout.isCompact() and 66 or 92, Layout.MIN_TAP - 6))
        b.Name = "Kind_" .. k.id
        b.TextSize = Layout.isCompact() and 13 or 15
        b.LayoutOrder = i
        b.Parent = strip
        b.Activated:Connect(function()
            wearKind = k.id
            ArenaHud.refreshSheet()
        end)
    end

    local items = Cosmetics.ofKind(wearKind)
    local ownedCount, order = 0, 1
    for _, item in ipairs(items) do
        local have = owned[item.id] == true
        if have then ownedCount += 1 end
        order += 1
        local isWorn = worn[wearKind] == item.id
        local c = card(sheetBody, order, 62, have and item.rarity or nil)
        swatch(c, item, 42)

        local name = Theme.label({
            Position = UDim2.fromOffset(62, 8), Size = UDim2.new(1, -190, 0, 24),
            Text = have and item.name or ("🔒 " .. item.name),
            TextSize = 18,
            TextColor3 = isWorn and Theme.GOOD
                or (have and (Cosmetics.RARITY_COLOUR[item.rarity] or Theme.TEXT) or Theme.TEXT_DIM),
        })
        name.Parent = c

        local sub = Theme.label({
            Position = UDim2.fromOffset(62, 32), Size = UDim2.new(1, -190, 0, 20),
            Text = have and (isWorn and ("WORN  ·  " .. item.rarity) or item.rarity)
                or SOURCE_TEXT[item.source] or item.rarity,
            TextSize = 13, TextColor3 = Theme.TEXT_DIM,
        })
        sub.Parent = c

        if have and not isWorn then
            local b = actionButton(c, "WEAR", Theme.ACCENT, 104)
            b.Activated:Connect(function()
                ArenaHud.on.equipCosmetic(wearKind, item.id)
            end)
        end
    end

    sheetTitle.Text = ("👕  WARDROBE   %d / %d"):format(ownedCount, #items)
end

local function renderInventory()
    local goobs = (profile and profile.goobs) or {}
    local activeId = profile and profile.activeGoobId

    local header = card(sheetBody, 0, 74)
    local sum = Theme.label({
        Position = UDim2.fromOffset(14, 6), Size = UDim2.new(1, -24, 0, 40),
        Text = ("%d Goob%s  ·  age never resets and cannot be farmed, which is the only reason it is worth anything")
            :format(#goobs, #goobs == 1 and "" or "s"),
        TextSize = 14, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
    })
    sum.Parent = header

    -- WHERE GOOBS AND THEIR FOOD COME FROM NOW. There used to be a Snack Stand
    -- and an Egg Stand for this, both of which sold progress for idle income
    -- and neither of which had anything to do with the game being played. Both
    -- are gone; finishing a round feeds your Goob and every fifth round hatches
    -- one. This line is the whole explanation, and it has to be here, because a
    -- player who cannot see where the next egg comes from assumes there is not
    -- one.
    local toEgg = profile and profile.roundsToEgg or 0
    local eggLine = Theme.label({
        Position = UDim2.fromOffset(14, 46), Size = UDim2.new(1, -24, 0, 22),
        Text = (profile and profile.eggCapped)
            and ("🥚 Stable full — %d / %d"):format(#goobs, (profile and profile.maxGoobs) or 8)
            or ("🥚 Next egg in %d round%s  ·  finishing a round also feeds your Goob")
                :format(toEgg, toEgg == 1 and "" or "s"),
        TextSize = 13, TextColor3 = Theme.GOLD,
    })
    eggLine.Parent = header

    for i, goob in ipairs(goobs) do
        local tint = goob.ageColor or Theme.TEXT_DIM
        local c = card(sheetBody, i, 74)
        Theme.stroke(c, tint, 2)

        local dot = Instance.new("Frame")
        dot.Name = "GoobDot"
        dot.Size = UDim2.fromOffset(44, 44)
        dot.Position = UDim2.fromOffset(10, 14)
        dot.BackgroundColor3 = Color3.fromHSV(goob.hue or 0.5, 0.42, 0.8)
        dot.BorderSizePixel = 0
        dot.Parent = c
        Theme.corner(dot, 999)
        Theme.stroke(dot, tint, 2)

        local name = Theme.label({
            Position = UDim2.fromOffset(64, 8), Size = UDim2.new(1, -190, 0, 24),
            Text = (goob.id == activeId and "★ " or "") .. tostring(goob.nickname),
            TextSize = 19,
            TextColor3 = goob.id == activeId and Theme.GOOD or Theme.TEXT,
        })
        name.Parent = c

        local stats = Theme.label({
            Position = UDim2.fromOffset(64, 32), Size = UDim2.new(1, -190, 0, 20),
            Text = ("%s %s  ·  ⚡%s  ·  x%.2f power"):format(
                goob.ageEmoji or "", goob.ageTier or "?",
                goob.powerText or "0", goob.ageMult or 1),
            TextSize = 14, TextColor3 = tint,
        })
        stats.Parent = c

        local age = Theme.label({
            Position = UDim2.fromOffset(64, 52), Size = UDim2.new(1, -190, 0, 18),
            Text = ("%s old  ·  gen %d"):format(goob.ageText or "new", goob.generation or 1),
            TextSize = 12, TextColor3 = Theme.TEXT_DIM,
        })
        age.Parent = c

        if goob.id ~= activeId then
            local b = actionButton(c, "CARRY", Theme.ACCENT, 96)
            b.Activated:Connect(function() ArenaHud.on.setActiveGoob(goob.id) end)

            -- GULP: feed this one to the Goob you are carrying. It is the mass
            -- sink the entire economy rests on — the ONLY way a Goob ever
            -- leaves the world — and until now the only button for it lived in
            -- the drawer that has just been deleted. Removing that screen
            -- without putting this somewhere would have left the world's total
            -- mass with no exit at all, which is the quiet kind of breakage
            -- that takes a month of live data to notice.
            --
            -- Irreversible, so it does not fire the remote: it calls through
            -- to init.client's two-step confirmation, which spells out exactly
            -- what is destroyed and what is gained before anything happens.
            local g = actionButton(c, "GULP", Theme.WARN, 88, 114)
            g.Activated:Connect(function() ArenaHud.on.gulpGoob(goob.id) end)
        end
    end

    sheetTitle.Text = ("🫧  YOUR GOOBS   %d"):format(#goobs)
end

local function renderTrade()
    local intro = card(sheetBody, 0, 118)
    local text = Theme.label({
        Position = UDim2.fromOffset(14, 10), Size = UDim2.new(1, -24, 0, 98),
        Text = "Roll up to another player and a trade request appears for both of you.\n\n"
            .. "Goobs are the only thing that can be traded, and the only way one ever "
            .. "leaves the world is by being eaten. Nothing here is ever destroyed by "
            .. "accident: if either side changes an offer after confirming, BOTH "
            .. "confirmations reset.",
        TextSize = 14, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
    })
    text.Parent = intro

    local goobs = (profile and profile.goobs) or {}
    local head = card(sheetBody, 1, 44)
    local h = Theme.label({
        Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -24, 0, 28),
        Text = ("You have %d Goob%s to offer"):format(#goobs, #goobs == 1 and "" or "s"),
        TextSize = 17, TextColor3 = Theme.GOLD,
    })
    h.Parent = head

    for i, goob in ipairs(goobs) do
        local tint = goob.ageColor or Theme.TEXT_DIM
        local c = card(sheetBody, i + 1, 56)
        Theme.stroke(c, tint, 2)
        local name = Theme.label({
            Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -28, 0, 24),
            Text = tostring(goob.nickname), TextSize = 18, TextColor3 = Theme.TEXT,
        })
        name.Parent = c
        local sub = Theme.label({
            Position = UDim2.fromOffset(14, 30), Size = UDim2.new(1, -28, 0, 20),
            Text = ("%s %s  ·  ⚡%s"):format(goob.ageEmoji or "",
                goob.ageTier or "?", goob.powerText or "0"),
            TextSize = 13, TextColor3 = tint,
        })
        sub.Parent = c
    end
end

--- Open or close the tab list. Closed by default on a phone, where the screen
--- is the scarce thing; open by default anywhere with room for it.
function ArenaHud.setMenuOpen(open: boolean)
    menuOpen = open
    if menuHeader then
        menuHeader.Text = open and "\u{2715}  MENU" or "\u{2630}  MENU"
    end
    ArenaHud.applyLayout()
end

function ArenaHud.closeSheet()
    openTab = nil
    sheet.Visible = false
    for _, b in pairs(menuButtons) do
        Theme.setButtonActive(b, false)
    end
end

function ArenaHud.openSheet(tab: string)
    -- THE SHEET IS THE ONLY PANEL. The season tab used to hand off to a second
    -- screen entirely (`on.openLegacy`), which opened the old Goob drawer and
    -- drew the season track inside it — with the Snack Stand reparented on top
    -- of the track, because that drawer moved the stand into itself whenever
    -- arena mode was on. Two panels, one screen, and the season list unreadable
    -- underneath a shop for a system that no longer existed.
    --
    -- Now there is nowhere to hand off TO. Every tab renders here, and the two
    -- whose renderers still live in Panels render into sheetHost, inside this
    -- same sheet, under this same title bar and close button.
    if openTab == tab then
        ArenaHud.closeSheet()
        return
    end

    openTab = tab
    clearSheet()
    -- The selected row INVERTS: white surface, black label. Setting only the
    -- background left near-white text on a near-white fill — unreadable, and
    -- the one row the player most needs to read. In a greyscale palette
    -- brightness is the only emphasis axis there is, so it has to be used
    -- properly rather than half-applied.
    for id, b in pairs(menuButtons) do
        Theme.setButtonActive(b, id == tab)
    end

    for _, entry in ipairs(TABS) do
        if entry.id == tab then
            sheetTitle.Text = entry.icon .. "  " .. entry.name
        end
    end

    sheetBody.Visible = not DELEGATED[tab]
    sheetHost.Visible = DELEGATED[tab] == true

    if DELEGATED[tab] then
        Panels.render(tab, sheetHost, profile)
    elseif tab == "crates" then renderCrates()
    elseif tab == "trinkets" then renderTrinkets()
    elseif tab == "powers" then renderPowers()
    elseif tab == "wear" then renderWear()
    elseif tab == "inventory" then renderInventory()
    elseif tab == "standoff" then renderStandoff()
    elseif tab == "trade" then renderTrade() end

    sheet.Visible = true
    ArenaHud.applyLayout()
end

-- Re-render whatever is open, after the profile changes underneath it.
function ArenaHud.refreshSheet()
    if openTab then
        local tab = openTab
        openTab = nil
        ArenaHud.openSheet(tab)
    end
end

-- ── Layout ─────────────────────────────────────────────────────────────────

function ArenaHud.applyLayout()
    if not gui then return end
    local u = Layout.usable()
    local compact = Layout.isCompact()
    local pad = compact and 8 or 14

    -- ── The menu ──────────────────────────────────────────────────────────
    Layout.setMenuTabs(#TABS)
    local m = Layout.menuMetrics(#TABS)
    local menuX = Layout.menuLeft(#TABS)

    menu.Size = UDim2.fromOffset(m.width, m.headerH)
    menu.Position = UDim2.fromOffset(menuX, m.top)
    menuHeader.Size = UDim2.fromOffset(m.width, m.headerH)
    menuHeader.Position = UDim2.fromOffset(menuX, m.top)
    menuHeader.TextSize = compact and 14 or 16

    menuList.Size = UDim2.fromOffset(m.width, m.listH)
    menuList.Position = UDim2.fromOffset(u.X - m.width - m.listRight, m.listTop)
    menuList.Visible = menuOpen
    menuList.ScrollingEnabled = m.scrolls
    for _, entry in ipairs(TABS) do
        local b = menuButtons[entry.id]
        if b then
            b.Size = UDim2.new(1, 0, 0, m.rowH)
            b.TextSize = compact and 13 or 15
        end
    end

    -- Stat card: top-left, and never allowed to reach the rail.
    local cardW = Layout.fit(compact and 116 or 220, 96, menuX - pad * 2)
    statCard.Size = UDim2.fromOffset(cardW, compact and 64 or 88)
    statCard.Position = UDim2.fromOffset(pad, m.top)
    massLabel.TextSize = compact and 24 or 34
    worthLabel.TextSize = compact and 13 or 17
    meltLabel.TextSize = compact and 11 or 14

    -- Glob + season: under the stat card, same column. They used to sit
    -- top-right, which is exactly where the rail now lives.
    -- Stacked with real gaps between them. The first pass put Glob at +66 with
    -- a height of 20 and the season line at +84, which overlap by two pixels —
    -- invisible to the eye and caught immediately by the geometry audit, which
    -- is exactly the kind of thing that audit is for.
    local cardH = statCard.Size.Y.Offset
    local globY = m.top + cardH + (compact and 6 or 8)
    local globH = compact and 20 or 26
    globLabel.Position = UDim2.fromOffset(pad + 4, globY)
    globLabel.Size = UDim2.fromOffset(cardW, globH)
    globLabel.TextSize = compact and 15 or 20
    seasonLabel.Position = UDim2.fromOffset(pad + 4, globY + globH + (compact and 2 or 4))
    seasonLabel.Size = UDim2.fromOffset(cardW, compact and 16 or 20)
    seasonLabel.TextSize = compact and 11 or 14

    -- Status strip: top-centre, in the gap between the stat column and the
    -- rail. Centred on that gap rather than on the screen, so it cannot drift
    -- under either of them as the rail changes width.
    local gapL = pad + cardW + pad
    local gapR = menuX - pad
    local stripW = math.max(140, math.min(compact and 260 or 420, gapR - gapL))
    statusStrip.Visible = true
    statusStrip.Size = UDim2.fromOffset(stripW, compact and 28 or 34)
    statusStrip.Position = UDim2.fromOffset(
        Layout.fit(math.floor((gapL + gapR) / 2 - stripW / 2), gapL, math.max(gapL, gapR - stripW)),
        m.top)
    statusLabel.TextSize = compact and 13 or 17

    -- ── The hotbar: three slots, bottom-centre ────────────────────────────
    --
    -- In the band between the thumbstick and the jump button, which is the
    -- only part of the bottom edge a phone player's thumb can reach. Three
    -- buttons share it: DASH, SPLIT and whatever you chose to bring.
    -- SIZED TO THE BAND, not to a nice round number. Three 62px buttons plus
    -- gaps is 198px and the gap between the thumbstick and the jump button on
    -- a 568-wide phone is 178 — so the outer two slots landed under the touch
    -- controls, where a thumb cannot reach them. The width is derived from the
    -- band so it cannot be wrong again.
    local left, right = Layout.bottomGap()
    local slotGap = compact and 5 or 10
    local band = math.max(120, right - left - 12)
    local slotW = math.min(compact and 62 or 84,
        math.floor((band - slotGap * (#slots - 1)) / #slots))
    local barW = #slots * slotW + (#slots - 1) * slotGap
    local barX = math.floor((left + right) / 2 - barW / 2)
    barX = Layout.fit(barX, 8, math.max(8, u.X - barW - 8))
    for i, slot in ipairs(slots) do
        slot.button.Size = UDim2.fromOffset(slotW, slotW)
        slot.button.Position = UDim2.fromOffset(
            barX + (i - 1) * (slotW + slotGap), u.Y - slotW - (compact and 12 or 24))
        slot.button.TextSize = compact and 12 or 15
        slot.sweep.Size = UDim2.fromScale(1, 0)
    end

    -- ── The sheet ─────────────────────────────────────────────────────────
    --
    -- Anchored to the LEFT of the rail rather than centred, so opening a panel
    -- never covers the menu you opened it from — you can see what is selected
    -- and switch straight to the next tab without closing anything.
    local sheetTop = m.top + (compact and 34 or 42)
    local sheetW = math.max(200, (u.X - m.width - m.listRight) - pad * 2)
    local sheetH = math.max(140, u.Y - sheetTop - (compact and 88 or 118))
    if not compact then
        sheetW = math.min(sheetW, 660)
        sheetH = math.min(sheetH, 520)
    end
    sheet.Size = UDim2.fromOffset(sheetW, sheetH)
    sheet.Position = UDim2.fromOffset(math.max(pad, menuX - pad - sheetW), sheetTop)
    if sheetHost then
        sheetHost.Position = sheetBody.Position
        sheetHost.Size = sheetBody.Size
    end
end

-- ── Build ──────────────────────────────────────────────────────────────────

function ArenaHud.build(): ScreenGui
    gui = Instance.new("ScreenGui")
    gui.Name = "ArenaHud"
    gui.ResetOnSpawn = false
    -- false: with IgnoreGuiInset on, Roblox's top bar covers the first ~36px,
    -- which is exactly where the stat card and the menu button are.
    gui.IgnoreGuiInset = false
    gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
    gui.DisplayOrder = 12
    gui.Parent = player:WaitForChild("PlayerGui")

    -- Stat card.
    statCard = Instance.new("Frame")
    statCard.Name = "StatCard"
    statCard.BackgroundColor3 = Theme.BG
    statCard.BackgroundTransparency = 0.12
    statCard.BorderSizePixel = 0
    statCard.Parent = gui
    Theme.corner(statCard, 14)
    Theme.stroke(statCard, Color3.fromRGB(18, 20, 26), 2)

    -- NAMED, all three. An unnamed label is findable only by its own text,
    -- which means the only test anybody can write for it is "does some label
    -- somewhere contain this string" — and that passes just as happily on a
    -- panel wired to nothing as on a working one. These three are the stat
    -- card's entire contract with the server push, so they get to be findable.
    massLabel = Theme.label({
        Position = UDim2.fromOffset(12, 4), Size = UDim2.new(1, -18, 0, 34),
        Text = "0", TextSize = 32, TextColor3 = Theme.GOLD,
    })
    massLabel.Name = "Mass"
    massLabel.Parent = statCard

    worthLabel = Theme.label({
        Position = UDim2.fromOffset(12, 38), Size = UDim2.new(1, -18, 0, 22),
        Text = "worth 💧0", TextSize = 18, TextColor3 = Theme.ACCENT,
    })
    worthLabel.Name = "Worth"
    worthLabel.Parent = statCard

    meltLabel = Theme.label({
        Position = UDim2.fromOffset(12, 60), Size = UDim2.new(1, -18, 0, 18),
        Text = "not melting yet", TextSize = 14, TextColor3 = Theme.TEXT_DIM,
    })
    meltLabel.Name = "Melt"
    meltLabel.Parent = statCard

    globLabel = Theme.label({
        Text = "💧0", TextSize = 24, TextColor3 = Theme.ACCENT,
        TextXAlignment = Enum.TextXAlignment.Right,
    })
    globLabel.Name = "Glob"
    globLabel.Parent = gui

    seasonLabel = Theme.label({
        Text = "BETA SEASON", TextSize = 15, TextColor3 = Theme.GOLD,
        TextXAlignment = Enum.TextXAlignment.Right,
    })
    seasonLabel.Name = "Season"
    seasonLabel.Parent = gui

    -- ── The menu ──────────────────────────────────────────────────────────
    --
    -- A header button top-right, and a vertical list of named tabs that drops
    -- out of it. Closed by default on a phone so the world keeps the screen;
    -- open by default on a desktop, where there is room for it to just live
    -- there.
    menu = Instance.new("Frame")
    menu.Name = "Menu"
    menu.BackgroundTransparency = 1
    menu.BorderSizePixel = 0
    menu.Parent = gui

    menuHeader = Instance.new("TextButton")
    menuHeader.Name = "MenuButton"
    menuHeader.Text = "\u{2630}  MENU"
    menuHeader.Font = Theme.FONT
    menuHeader.TextSize = 16
    menuHeader.TextColor3 = Theme.TEXT
    menuHeader.BackgroundColor3 = Theme.BG
    menuHeader.BackgroundTransparency = 0.05
    menuHeader.AutoButtonColor = true
    menuHeader.BorderSizePixel = 0
    menuHeader.Parent = gui
    Theme.corner(menuHeader, 10)
    Theme.stroke(menuHeader, Theme.LINE, 1)
    menuHeader.Activated:Connect(function() ArenaHud.setMenuOpen(not menuOpen) end)

    -- SCROLLING, because eight rows do not always fit above the jump button.
    -- A list that silently clipped its last three tabs would make CREW and THE
    -- STANDOFF unreachable on a phone with no error anywhere.
    menuList = Instance.new("ScrollingFrame")
    menuList.Name = "MenuList"
    menuList.BackgroundColor3 = Theme.BG
    menuList.BackgroundTransparency = 0.05
    menuList.BorderSizePixel = 0
    menuList.ScrollBarThickness = 3
    menuList.ScrollBarImageColor3 = Theme.LINE
    menuList.AutomaticCanvasSize = Enum.AutomaticSize.Y
    menuList.CanvasSize = UDim2.new()
    menuList.Visible = false
    menuList.Parent = gui
    Theme.corner(menuList, 10)
    Theme.stroke(menuList, Theme.LINE, 1)

    local listLayout = Instance.new("UIListLayout")
    listLayout.FillDirection = Enum.FillDirection.Vertical
    listLayout.Padding = UDim.new(0, 3)
    listLayout.SortOrder = Enum.SortOrder.LayoutOrder
    listLayout.Parent = menuList

    local listPad = Instance.new("UIPadding")
    listPad.PaddingTop = UDim.new(0, 6)
    listPad.PaddingBottom = UDim.new(0, 6)
    listPad.PaddingLeft = UDim.new(0, 6)
    listPad.PaddingRight = UDim.new(0, 6)
    listPad.Parent = menuList

    for i, entry in ipairs(TABS) do
        local b = Instance.new("TextButton")
        -- Name kept as Dock_<id>: the mobile geometry audit walks the screen
        -- for this prefix to open every panel in turn, and renaming it would
        -- silently stop it auditing any of them.
        b.Name = "Dock_" .. entry.id
        b.Text = "  " .. entry.icon .. "   " .. entry.name
        b.Font = Theme.FONT
        b.TextSize = 15
        b.TextXAlignment = Enum.TextXAlignment.Left
        b.TextColor3 = Theme.TEXT
        b.BackgroundColor3 = Theme.BG_SOFT
        b.AutoButtonColor = true
        b.BorderSizePixel = 0
        b.LayoutOrder = i
        b.Size = UDim2.new(1, 0, 0, Layout.MIN_TAP)
        b.Parent = menuList
        Theme.corner(b, 8)
        Theme.stroke(b, Theme.LINE, 1)
        menuButtons[entry.id] = b
        b.Activated:Connect(function() ArenaHud.openSheet(entry.id) end)
    end

    -- Status strip + bank bar.
    statusStrip = Instance.new("Frame")
    statusStrip.Name = "Status"
    statusStrip.BackgroundColor3 = Theme.BG
    statusStrip.BackgroundTransparency = 0.25
    statusStrip.BorderSizePixel = 0
    statusStrip.Parent = gui
    Theme.corner(statusStrip, 10)

    statusLabel = Theme.label({
        Size = UDim2.fromScale(1, 1), Text = "SAFE  ·  the Shallows",
        TextSize = 16, TextColor3 = Theme.GOOD,
        TextXAlignment = Enum.TextXAlignment.Center,
    })
    statusLabel.Parent = statusStrip

    bankBar = Instance.new("Frame")
    bankBar.Name = "BankBar"
    bankBar.AnchorPoint = Vector2.new(0, 1)
    bankBar.Position = UDim2.new(0, 0, 1, 0)
    bankBar.Size = UDim2.new(1, 0, 0, 4)
    bankBar.BackgroundColor3 = Color3.fromRGB(24, 26, 30)
    bankBar.BorderSizePixel = 0
    bankBar.Visible = false
    bankBar.Parent = statusStrip

    bankFill = Instance.new("Frame")
    bankFill.Size = UDim2.fromScale(0, 1)
    bankFill.BackgroundColor3 = Theme.GOLD
    bankFill.BorderSizePixel = 0
    bankFill.Parent = bankBar

    -- ── The hotbar ────────────────────────────────────────────────────────
    --
    -- One button per slot, built from the same shape so the three read as a
    -- set. The cooldown sweep fills from the bottom BEHIND the label, so the
    -- name stays readable while it recharges — a button you cannot read is a
    -- button you stop looking at.
    for i = 1, 3 do
        local b = Instance.new("TextButton")
        b.Name = "Slot" .. i
        b.Text = ""
        b.Font = Theme.FONT
        b.TextSize = 14
        b.TextColor3 = Theme.TEXT
        b.BackgroundColor3 = Theme.BG
        b.BackgroundTransparency = 0.08
        b.AutoButtonColor = true
        b.BorderSizePixel = 0
        b.ClipsDescendants = true
        b.Parent = gui
        Theme.corner(b, 14)
        Theme.stroke(b, Theme.LINE, 2)

        local sweep = Instance.new("Frame")
        sweep.Name = "Sweep"
        sweep.AnchorPoint = Vector2.new(0, 1)
        sweep.Position = UDim2.new(0, 0, 1, 0)
        sweep.Size = UDim2.fromScale(1, 0)
        sweep.BackgroundColor3 = Theme.TEXT
        sweep.BackgroundTransparency = 0.82
        sweep.BorderSizePixel = 0
        sweep.ZIndex = 0
        sweep.Parent = b

        local nameLabel = Theme.label({
            Name = "Label",
            AnchorPoint = Vector2.new(0.5, 0),
            Position = UDim2.new(0.5, 0, 0, 8), Size = UDim2.new(1, -8, 0, 34),
            Text = "", TextSize = 14, TextWrapped = true,
            TextXAlignment = Enum.TextXAlignment.Center,
        })
        nameLabel.ZIndex = 2
        nameLabel.Parent = b

        local cost = Theme.label({
            Name = "Cost",
            AnchorPoint = Vector2.new(0.5, 1),
            Position = UDim2.new(0.5, 0, 1, -6), Size = UDim2.new(1, -8, 0, 16),
            Text = "", TextSize = 12, TextColor3 = Theme.TEXT_DIM,
            TextXAlignment = Enum.TextXAlignment.Center,
        })
        cost.ZIndex = 2
        cost.Parent = b

        local index = i
        b.Activated:Connect(function() ArenaHud.on.usePower(index, nil) end)
        table.insert(slots, { button = b, sweep = sweep, cost = cost, name = nameLabel })
    end

    -- The sheet.
    sheet = Instance.new("Frame")
    sheet.Name = "Sheet"
    sheet.BackgroundColor3 = Theme.BG
    sheet.BackgroundTransparency = 0.04
    sheet.BorderSizePixel = 0
    -- Parked AND invisible. Parking a closed panel off-screen without also
    -- clearing Visible is how a "hidden" drawer kept showing up in the
    -- geometry audit as 300 visible pixels of overflow.
    sheet.Visible = false
    sheet.Parent = gui
    Theme.corner(sheet, 18)
    Theme.stroke(sheet, Color3.fromRGB(18, 20, 26), 3)

    sheetTitle = Theme.label({
        Position = UDim2.fromOffset(18, 12), Size = UDim2.new(1, -84, 0, 30),
        Text = "CRATES", TextSize = 24, TextColor3 = Theme.GOLD,
    })
    sheetTitle.Parent = sheet

    local close = Theme.button("✕", Theme.BG_SOFT, UDim2.fromOffset(Layout.MIN_TAP, Layout.MIN_TAP))
    close.AnchorPoint = Vector2.new(1, 0)
    close.Position = UDim2.new(1, -12, 0, 10)
    close.TextSize = 20
    close.Parent = sheet
    close.Activated:Connect(function() ArenaHud.closeSheet() end)

    sheetBody = Instance.new("ScrollingFrame")
    sheetBody.Name = "Body"
    sheetBody.Position = UDim2.fromOffset(12, 56)
    sheetBody.Size = UDim2.new(1, -24, 1, -68)
    sheetBody.BackgroundTransparency = 1
    sheetBody.BorderSizePixel = 0
    sheetBody.ScrollBarThickness = 5
    sheetBody.AutomaticCanvasSize = Enum.AutomaticSize.Y
    sheetBody.CanvasSize = UDim2.new()
    sheetBody.Parent = sheet

    local bodyLayout = Instance.new("UIListLayout")
    bodyLayout.Padding = UDim.new(0, 8)
    bodyLayout.SortOrder = Enum.SortOrder.LayoutOrder
    bodyLayout.Parent = sheetBody

    -- A SCROLLING host, not a plain frame.
    --
    -- Panels' crew screen lays its rows out at absolute offsets and runs about
    -- 230px tall. On a landscape phone the sheet's body is barely 60px, so
    -- every control below the first ran off the bottom — the audit reported
    -- five elements "off by 144". A fixed-height host cannot hold a panel it
    -- does not control the height of, and Panels is shared with the season
    -- track, which brings its own scroller and fills this exactly.
    sheetHost = Instance.new("ScrollingFrame")
    sheetHost.Name = "Host"
    sheetHost.Position = sheetBody.Position
    sheetHost.Size = sheetBody.Size
    sheetHost.BackgroundTransparency = 1
    sheetHost.BorderSizePixel = 0
    sheetHost.ScrollBarThickness = 5
    sheetHost.ScrollBarImageColor3 = Theme.ACCENT
    sheetHost.AutomaticCanvasSize = Enum.AutomaticSize.Y
    sheetHost.CanvasSize = UDim2.new()
    sheetHost.Visible = false
    sheetHost.Parent = sheet

    -- Open on a desktop, closed on a phone. A menu that covers a third of a
    -- 568-wide screen the moment you spawn is a menu the player closes before
    -- they have read it.
    menuOpen = not Layout.isCompact()
    ArenaHud.setMenuOpen(menuOpen)
    Layout.changed.Event:Connect(ArenaHud.applyLayout)
    return gui
end

-- ── Live update ────────────────────────────────────────────────────────────

function ArenaHud.setProfile(snap: any)
    profile = snap
    if not gui then return end
    globLabel.Text = "💧" .. Format.short(snap.glob or 0)
    local tier = (snap.season and snap.season.tier) or 0
    seasonLabel.Text = ("BETA SEASON · %d"):format(tier)
    ArenaHud.refreshSheet()
end

function ArenaHud.setArena(state: any)
    latest = state
    if not gui or not state then return end
    -- The arena syncs twelve times a second, so without this guard the run
    -- summary is overwritten roughly 83 milliseconds after it appears.
    local showingSummary = (ArenaHud._summaryUntil or 0) > os.clock()

    massLabel.Text = Format.short(state.mass)
    worthLabel.Text = "worth 💧" .. Format.short(state.worth)

    -- The melt readout is the game's one piece of teaching, and it has to say
    -- what is HAPPENING rather than what the number is. "-8/s" means nothing
    -- to a nine-year-old; "melting fast — bank it" is an instruction.
    -- BEACON is the one power whose whole point is that everybody can see it,
    -- so the HUD says so out loud rather than letting the player forget they
    -- are lit up and wonder why three people are converging on them.
    if state.lit then
        meltLabel.Text = "LIT UP — food +45%, everyone sees you"
        meltLabel.TextColor3 = Theme.GOLD
    elseif state.leak <= 0 then
        -- Leak is off in round mode, so "not melting yet" would be a permanent
        -- and meaningless line. Peak size is what a player actually wants back
        -- from this row: it is the number the round is scored on.
        meltLabel.Text = "best this round " .. Format.short(state.peak or state.mass)
        meltLabel.TextColor3 = Theme.TEXT_DIM
    elseif state.leak < state.harvest * 0.5 then
        meltLabel.Text = ("melting -%s/s"):format(Format.short(state.leak))
        meltLabel.TextColor3 = Theme.WARN
    else
        meltLabel.Text = ("MELTING FAST -%s/s"):format(Format.short(state.leak))
        meltLabel.TextColor3 = Theme.BAD
    end

    -- The phase clock owns the status strip whenever the round is not running.
    -- A player in the lobby needs to know how long they have to shop far more
    -- than they need to know which patch of ground they are standing on.
    local phase = state.phase or "PLAYING"
    local left = math.max(0, math.floor(state.phaseLeft or 0))
    local clock = ("%d:%02d"):format(math.floor(left / 60), left % 60)

    local where = state.biome or (state.ring == "VAULT" and "the Vault"
        or state.ring == "SHALLOWS" and "the Shallows" or "the Flats")
    if phase == "LOBBY" then
        -- The field size is announced, and the bot count with it. A player who
        -- works out for themselves that most of the island is bots feels
        -- tricked; a player who was told feels like the game is full. The
        -- honest version is also the one that reads better.
        local who = (state.bots or 0) > 0
            and ("  ·  %d in, %d bots"):format(state.field or 0, state.bots)
            or ""
        statusLabel.Text = ("WAITING ROOM  ·  round %d in %s%s")
            :format((state.round or 0) + 1, clock, who)
        statusLabel.TextColor3 = Theme.ACCENT
    elseif phase == "RESULTS" then
        statusLabel.Text = "ROUND OVER"
        statusLabel.TextColor3 = Theme.GOLD
    elseif showingSummary then
        -- leave the summary up
    elseif state.banking > 0 then
        statusLabel.Text = "BANKING — hold still"
        statusLabel.TextColor3 = Theme.GOLD
    elseif state.safe and state.onRim then
        -- THE METER, COUNTING DOWN, IN SECONDS. Safety on the rim is spendable
        -- now, and a meter the player cannot see is not a mechanic — it is an
        -- ambush. Showing the number is what turns "I got eaten in the safe
        -- zone" into "I stayed out there too long", which is a lesson rather
        -- than a bug report.
        local left2 = math.max(0, math.floor((state.rimGrace or 0) + 0.5))
        statusLabel.Text = ("%s  ·  SAFE %ds  ·  %s"):format(clock, left2, where)
        statusLabel.TextColor3 = left2 <= 4 and Theme.WARN or Theme.GOOD
    elseif state.safe then
        statusLabel.Text = ("%s  ·  SAFE  ·  %s"):format(clock, where)
        statusLabel.TextColor3 = Theme.GOOD
    elseif state.onRim then
        -- Out on the rim with the meter spent. Worth saying explicitly: the
        -- ground looks identical to the ground that was protecting you a
        -- moment ago.
        statusLabel.Text = ("%s  ·  EXPOSED  ·  %s"):format(clock, where)
        statusLabel.TextColor3 = Theme.BAD
    else
        statusLabel.Text = ("%s  ·  DANGER  ·  %s"):format(clock, where)
        statusLabel.TextColor3 = Theme.BAD
    end

    bankBar.Visible = state.banking > 0
    bankFill.Size = UDim2.fromScale(
        math.clamp(state.banking / math.max(0.01, state.bankNeeds), 0, 1), 1)

    -- ── The hotbar, live ──────────────────────────────────────────────────
    --
    -- Driven entirely off `state.slots`, which the server sends. The client
    -- never decides what is in a slot, what it costs, or whether it is ready —
    -- the third slot depends on what the player owns, and "the button said I
    -- could and the server said I could not" is the worst failure a control
    -- can have.
    for i, slot in ipairs(slots) do
        local info = (state.slots or {})[i]
        if info then
            slot.button.Visible = true
            slot.name.Text = (info.name or "—")
                .. ((info.mastery or 0) > 0 and ("\n" .. string.rep("*", info.mastery)) or "")
            if (info.cooldown or 0) > 0.05 then
                slot.cost.Text = ("%.1fs"):format(info.cooldown)
                slot.sweep.Size = UDim2.fromScale(1,
                    math.clamp(info.cooldown / math.max(0.1, info.cooldownMax or 1), 0, 1))
                slot.name.TextColor3 = Theme.TEXT_DIM
            elseif info.locked then
                slot.cost.Text = "LOCKED"
                slot.sweep.Size = UDim2.fromScale(1, 1)
                slot.name.TextColor3 = Theme.TEXT_DIM
            else
                slot.cost.Text = "-" .. Format.short(info.cost or 0)
                slot.sweep.Size = UDim2.fromScale(1, 0)
                slot.name.TextColor3 = Theme.TEXT
            end
            local st = slot.button:FindFirstChildOfClass("UIStroke")
            if st then
                -- Mastery tints a slot WHITE, not a colour: brightness is the
                -- palette's one emphasis axis.
                st.Color = (info.mastery or 0) > 0 and Theme.TEXT or Theme.LINE
            end
        else
            slot.button.Visible = false
        end
    end
end

function ArenaHud.crateResult(result: any)
    if not gui then return end
    -- The reveal reuses the sheet rather than opening a window over it, which
    -- is the same rule as everything else here: one thing at a time.
    ArenaHud.openSheet("crates")
    local banner = Instance.new("Frame")
    banner.Size = UDim2.new(1, 0, 0, 76)
    banner.LayoutOrder = -1
    banner.BackgroundColor3 = Theme.BG_SOFT
    banner.BorderSizePixel = 0
    banner.Parent = sheetBody
    Theme.corner(banner, 12)
    Theme.stroke(banner, Cosmetics.RARITY_COLOUR[result.reward.rarity] or Theme.GOLD, 3)

    local text = Theme.label({
        Position = UDim2.fromOffset(14, 10), Size = UDim2.new(1, -24, 0, 30),
        Text = ("%s  (%s)"):format(result.reward.name, result.reward.rarity),
        TextSize = 22, TextColor3 = Cosmetics.RARITY_COLOUR[result.reward.rarity] or Theme.GOLD,
    })
    text.Parent = banner

    local sub = Theme.label({
        Position = UDim2.fromOffset(14, 40), Size = UDim2.new(1, -24, 0, 26),
        Text = result.duplicate
            and ("already owned — refunded 💧%s"):format(Format.short(result.refund))
            or "NEW!",
        TextSize = 15, TextColor3 = result.duplicate and Theme.TEXT_DIM or Theme.GOOD,
    })
    sub.Parent = banner

    TweenService:Create(banner, TweenInfo.new(0.25, Enum.EasingStyle.Back,
        Enum.EasingDirection.Out), { Size = UDim2.new(1, 0, 0, 76) }):Play()
end

function ArenaHud.setPit(state: any)
    pit = state
    if openTab == "standoff" then
        ArenaHud.refreshSheet()
    end
end

-- A run ended. A loop this short has to CLOSE, or a run simply stops and the
-- player is left reconstructing what happened from a number that has already
-- changed. Deliberately a banner on the status strip rather than a panel: it
-- must not interrupt the next run, which starts the same second.
-- The round results board, shown on the sheet so it cannot cover the game.
function ArenaHud.roundEnded(data: any)
    if not gui or not data or not data.board then return end
    openTab = "results"
    clearSheet()
    sheetTitle.Text = ("🏁  ROUND %d RESULTS"):format(data.round or 0)
    for i, row in ipairs(data.board) do
        local c = card(sheetBody, i, 52, i == 1 and "Legendary" or nil)
        local name = Theme.label({
            Position = UDim2.fromOffset(14, 6), Size = UDim2.new(1, -28, 0, 24),
            Text = ("#%d  %s"):format(row.place, row.name),
            TextSize = 18,
            TextColor3 = i == 1 and Theme.GOLD or Theme.TEXT,
        })
        name.Parent = c
        local sub = Theme.label({
            Position = UDim2.fromOffset(14, 28), Size = UDim2.new(1, -28, 0, 20),
            Text = ("%s mass  ·  peak %s  ·  💧%s"):format(
                Format.short(row.mass), Format.short(row.peak), Format.short(row.payout)),
            TextSize = 13, TextColor3 = Theme.TEXT_DIM,
        })
        sub.Parent = c
    end
    sheet.Visible = true
    ArenaHud.applyLayout()
end

function ArenaHud.runEnded(s: any)
    if not gui or not s then return end
    local banked = s.ended == "banked"
    statusLabel.Text = banked
        and ("BANKED 💧%s  ·  peak %s  ·  %ds"):format(
            Format.short(s.payout), Format.short(s.peak), math.floor(s.seconds))
        or ("POPPED  ·  peak %s  ·  %ds  ·  %d eaten"):format(
            Format.short(s.peak), math.floor(s.seconds), s.ate or 0)
    statusLabel.TextColor3 = banked and Theme.GOLD or Theme.BAD
    ArenaHud._summaryUntil = os.clock() + 3.5

    -- Hand the strip back to the live readout after a beat. Without this the
    -- summary sticks and the player loses the safe/danger indicator, which is
    -- the most urgent thing on the screen.
    local token = (ArenaHud._summaryToken or 0) + 1
    ArenaHud._summaryToken = token
    task.delay(3.5, function()
        if ArenaHud._summaryToken == token and latest then
            ArenaHud.setArena(latest)
        end
    end)
end

--- The hotbar buttons, for anything that needs to point at them.
function ArenaHud.slotButtons(): { TextButton }
    local out = {}
    for _, slot in ipairs(slots) do
        table.insert(out, slot.button)
    end
    return out
end

function ArenaHud.isSheetOpen(): boolean
    return openTab ~= nil
end

return ArenaHud
