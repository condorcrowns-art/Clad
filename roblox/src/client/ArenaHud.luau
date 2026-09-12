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
--   top-left      the stat card: what you are holding and what it is worth
--   top-centre    the dock (six icons) and, under it, the status strip
--   top-right     Glob and your Beta Season tier
--   bottom-centre the power button, inside the only part of the bottom edge
--                 a phone player can actually reach
--
-- The dock lives at the TOP on every platform, desktop included. It is
-- tempting to put a dock along the bottom edge on a PC — but Roblox reserves
-- the bottom-left for a thumbstick and the bottom-right for a jump button on
-- touch, so a bottom dock needs two layouts, and two layouts is how elements
-- end up on top of each other. One position, everywhere.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local Shared = game.ReplicatedStorage.GoobShared
local Config = require(Shared.Config)
local Format = require(Shared.Format)
local Powers = require(Shared.Powers)
local Trinkets = require(Shared.Trinkets)
local Crates = require(Shared.Crates)
local Cosmetics = require(Shared.Cosmetics)
local GoobMath = require(Shared.GoobMath)

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

local player = Players.LocalPlayer

local ArenaHud = {}

-- Filled in by init.client. Declared up front so every handler below closes
-- over the table rather than over a local that may not exist yet — the
-- `local function` scoping trap that took down two earlier builds.
ArenaHud.on = {
    usePower = function(_aim: Vector3?) end,
    setPower = function(_id: string) end,
    equipTrinket = function(_id: string?, _slot: number) end,
    openCrate = function(_id: string) end,
    openLegacy = function(_which: string) end,   -- season / trade / close
    equipCosmetic = function(_kind: string, _id: string) end,
    setActiveGoob = function(_id: string) end,
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
local dock: Frame
local powerBtn: TextButton
local powerCost: TextLabel
local powerSweep: Frame
local sheet: Frame
local sheetTitle: TextLabel
local sheetBody: ScrollingFrame

local dockButtons: { [string]: TextButton } = {}
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
    { id = "standoff",  icon = "🥊", name = "THE STANDOFF" },
}

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

local function actionButton(parent: Instance, text: string, colour: Color3, width: number): TextButton
    local b = Theme.button(text, colour, UDim2.fromOffset(width, Layout.MIN_TAP))
    b.TextSize = 18
    b.AnchorPoint = Vector2.new(1, 0.5)
    b.Position = UDim2.new(1, -10, 0.5, 0)
    b.Parent = parent
    return b
end

-- ── The sheet ──────────────────────────────────────────────────────────────

local function clearSheet()
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

-- The Standoff is reachable from the dock, from anywhere on the island. There
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

    local nextPower, gap = Powers.nextLocked(banked)
    local head = card(sheetBody, 0, 46)
    local hl = Theme.label({
        Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -24, 0, 30),
        Text = nextPower
            and ("Next: %s at 💧%s  —  %s to go"):format(nextPower.name,
                Format.short(nextPower.unlockBanked), Format.short(gap))
            or "Every power unlocked. Carry whichever suits the run.",
        TextSize = 15, TextColor3 = Theme.GOLD, TextWrapped = true,
    })
    hl.Parent = head

    for i, p in ipairs(Powers.LIST) do
        local unlocked = banked >= p.unlockBanked
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
                or ("Unlocks at 💧%s banked  (you have 💧%s)")
                    :format(Format.short(p.unlockBanked), Format.short(banked)),
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

    local header = card(sheetBody, 0, 54)
    local sum = Theme.label({
        Position = UDim2.fromOffset(14, 6), Size = UDim2.new(1, -24, 0, 42),
        Text = ("%d Goob%s  ·  age never resets and cannot be farmed, which is the only reason it is worth anything")
            :format(#goobs, #goobs == 1 and "" or "s"),
        TextSize = 14, TextColor3 = Theme.TEXT_DIM, TextWrapped = true,
    })
    sum.Parent = header

    for i, goob in ipairs(goobs) do
        local tier = GoobMath.ageTier(goob)
        local c = card(sheetBody, i, 74)
        Theme.stroke(c, tier.color, 2)

        local dot = Instance.new("Frame")
        dot.Size = UDim2.fromOffset(44, 44)
        dot.Position = UDim2.fromOffset(10, 14)
        dot.BackgroundColor3 = Color3.fromHSV(goob.hue or 0.5, 0.42, 0.8)
        dot.BorderSizePixel = 0
        dot.Parent = c
        Theme.corner(dot, 999)
        Theme.stroke(dot, tier.color, 2)

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
                tier.emoji, tier.name, Format.short(GoobMath.power(goob)), tier.mult),
            TextSize = 14, TextColor3 = tier.color,
        })
        stats.Parent = c

        local age = Theme.label({
            Position = UDim2.fromOffset(64, 52), Size = UDim2.new(1, -190, 0, 18),
            Text = ("%s old  ·  gen %d"):format(
                Format.duration(GoobMath.ageSeconds(goob)),
                #(goob.lineage or {}) + 1),
            TextSize = 12, TextColor3 = Theme.TEXT_DIM,
        })
        age.Parent = c

        if goob.id ~= activeId then
            local b = actionButton(c, "CARRY", Theme.ACCENT, 104)
            b.Activated:Connect(function() ArenaHud.on.setActiveGoob(goob.id) end)
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
        local tier = GoobMath.ageTier(goob)
        local c = card(sheetBody, i + 1, 56)
        Theme.stroke(c, tier.color, 2)
        local name = Theme.label({
            Position = UDim2.fromOffset(14, 8), Size = UDim2.new(1, -28, 0, 24),
            Text = tostring(goob.nickname), TextSize = 18, TextColor3 = Theme.TEXT,
        })
        name.Parent = c
        local sub = Theme.label({
            Position = UDim2.fromOffset(14, 30), Size = UDim2.new(1, -28, 0, 20),
            Text = ("%s %s  ·  ⚡%s"):format(tier.emoji, tier.name,
                Format.short(GoobMath.power(goob))),
            TextSize = 13, TextColor3 = tier.color,
        })
        sub.Parent = c
    end
end

function ArenaHud.closeSheet()
    openTab = nil
    sheet.Visible = false
    for _, b in pairs(dockButtons) do
        b.BackgroundColor3 = Theme.BG_SOFT
    end
end

function ArenaHud.openSheet(tab: string)
    -- Delegated tabs still go through here, so opening one closes whatever
    -- else was up. That is the whole contract: one thing at a time.
    if tab == "season" then
        ArenaHud.closeSheet()
        ArenaHud.on.openLegacy(tab)
        return
    end
    if openTab == tab then
        ArenaHud.closeSheet()
        return
    end

    openTab = tab
    ArenaHud.on.openLegacy("close")   -- shut any legacy panel first
    clearSheet()
    for id, b in pairs(dockButtons) do
        b.BackgroundColor3 = (id == tab) and Theme.ACCENT or Theme.BG_SOFT
    end

    for _, entry in ipairs(TABS) do
        if entry.id == tab then
            sheetTitle.Text = entry.icon .. "  " .. entry.name
        end
    end

    if tab == "crates" then renderCrates()
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

    -- Dock: top-centre, one row, on every platform.
    -- Eight tabs now. On a 568-wide phone that is 8 icons plus gaps plus the
    -- dock's own padding, and the stat card has to fit to the left of it — so
    -- the icons shrink on compact rather than the dock running into the card.
    -- 38 is still comfortably above the 34px minimum a thumb needs.
    local iconSize = compact and 38 or 52
    local gap = compact and 4 or 7
    local dockW = #TABS * iconSize + (#TABS - 1) * gap + pad * 2
    dock.Size = UDim2.fromOffset(dockW, iconSize + pad * 2)
    dock.Position = UDim2.fromOffset(math.floor((u.X - dockW) / 2), 6)
    for _, entry in ipairs(TABS) do
        local b = dockButtons[entry.id]
        if b then
            b.Size = UDim2.fromOffset(iconSize, iconSize)
            b.TextSize = compact and 22 or 26
        end
    end

    -- Stat card: top-left, and never wider than the space left of the dock.
    local cardW = Layout.fit(compact and 104 or 210, 88, math.floor((u.X - dockW) / 2) - pad)
    statCard.Size = UDim2.fromOffset(cardW, compact and 74 or 92)
    statCard.Position = UDim2.fromOffset(pad, 6)
    massLabel.TextSize = compact and 22 or 32
    worthLabel.TextSize = compact and 14 or 18
    meltLabel.TextSize = compact and 11 or 14

    -- Glob + season: top-right, mirrored.
    globLabel.Position = UDim2.fromOffset(u.X - cardW - pad, 10)
    globLabel.Size = UDim2.fromOffset(cardW, compact and 26 or 32)
    globLabel.TextSize = compact and 18 or 24
    seasonLabel.Position = UDim2.fromOffset(u.X - cardW - pad, (compact and 36 or 44))
    seasonLabel.Size = UDim2.fromOffset(cardW, compact and 20 or 24)
    seasonLabel.TextSize = compact and 12 or 15

    -- Status strip: directly under the dock, same width, so the two read as
    -- one block instead of two floating things.
    statusStrip.Size = UDim2.fromOffset(dockW, compact and 30 or 36)
    statusStrip.Position = UDim2.fromOffset(math.floor((u.X - dockW) / 2), iconSize + pad * 2 + 10)
    statusLabel.TextSize = compact and 13 or 16

    -- Power button: bottom-centre, inside the band between the thumbstick and
    -- the jump button. That band is the only part of the bottom edge a phone
    -- player's thumb can actually reach.
    local size = compact and 76 or 92
    local left, right = Layout.bottomGap()
    local x = math.floor((left + right) / 2 - size / 2)
    x = Layout.fit(x, 8, math.max(8, u.X - size - 8))
    powerBtn.Size = UDim2.fromOffset(size, size)
    powerBtn.Position = UDim2.fromOffset(x, u.Y - size - (compact and 14 or 26))
    powerBtn.TextSize = compact and 15 or 18
    powerSweep.Size = UDim2.fromScale(1, 0)

    -- The sheet: near-fullscreen on a phone, a centred panel on a desktop.
    -- Either way it is the ONLY thing on top of the world.
    local sheetSize = compact
        and UDim2.fromOffset(u.X - 16, u.Y - (iconSize + pad * 2 + 52))
        or Layout.panel(660, 460)
    sheet.Size = sheetSize
    if compact then
        sheet.Position = UDim2.fromOffset(8, iconSize + pad * 2 + 46)
    else
        sheet.Position = Layout.centre(sheetSize)
    end
end

-- ── Build ──────────────────────────────────────────────────────────────────

function ArenaHud.build(): ScreenGui
    gui = Instance.new("ScreenGui")
    gui.Name = "ArenaHud"
    gui.ResetOnSpawn = false
    -- false: with IgnoreGuiInset on, Roblox's top bar covers the first ~36px,
    -- which is exactly where the dock is.
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

    massLabel = Theme.label({
        Position = UDim2.fromOffset(12, 4), Size = UDim2.new(1, -18, 0, 34),
        Text = "0", TextSize = 32, TextColor3 = Theme.GOLD,
    })
    massLabel.Parent = statCard

    worthLabel = Theme.label({
        Position = UDim2.fromOffset(12, 38), Size = UDim2.new(1, -18, 0, 22),
        Text = "worth 💧0", TextSize = 18, TextColor3 = Theme.ACCENT,
    })
    worthLabel.Parent = statCard

    meltLabel = Theme.label({
        Position = UDim2.fromOffset(12, 60), Size = UDim2.new(1, -18, 0, 18),
        Text = "not melting yet", TextSize = 14, TextColor3 = Theme.TEXT_DIM,
    })
    meltLabel.Parent = statCard

    globLabel = Theme.label({
        Text = "💧0", TextSize = 24, TextColor3 = Theme.ACCENT,
        TextXAlignment = Enum.TextXAlignment.Right,
    })
    globLabel.Parent = gui

    seasonLabel = Theme.label({
        Text = "BETA SEASON", TextSize = 15, TextColor3 = Theme.GOLD,
        TextXAlignment = Enum.TextXAlignment.Right,
    })
    seasonLabel.Parent = gui

    -- Dock.
    dock = Instance.new("Frame")
    dock.Name = "Dock"
    dock.BackgroundColor3 = Theme.BG
    dock.BackgroundTransparency = 0.18
    dock.BorderSizePixel = 0
    dock.Parent = gui
    Theme.corner(dock, 16)
    Theme.stroke(dock, Color3.fromRGB(18, 20, 26), 2)

    local dockLayout = Instance.new("UIListLayout")
    dockLayout.FillDirection = Enum.FillDirection.Horizontal
    dockLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
    dockLayout.VerticalAlignment = Enum.VerticalAlignment.Center
    dockLayout.Padding = UDim.new(0, 6)
    dockLayout.Parent = dock

    for i, entry in ipairs(TABS) do
        local b = Instance.new("TextButton")
        b.Name = "Dock_" .. entry.id
        b.Text = entry.icon
        b.Font = Theme.FONT
        b.TextSize = 26
        b.TextColor3 = Theme.TEXT
        b.BackgroundColor3 = Theme.BG_SOFT
        b.AutoButtonColor = true
        b.BorderSizePixel = 0
        b.LayoutOrder = i
        b.Size = UDim2.fromOffset(Layout.MIN_TAP, Layout.MIN_TAP)
        b.Parent = dock
        Theme.corner(b, 12)
        dockButtons[entry.id] = b
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

    -- Power button.
    powerBtn = Instance.new("TextButton")
    powerBtn.Name = "PowerButton"
    powerBtn.Text = "DASH"
    powerBtn.Font = Theme.FONT
    powerBtn.TextSize = 18
    powerBtn.TextColor3 = Theme.TEXT
    powerBtn.BackgroundColor3 = Theme.BG
    powerBtn.BackgroundTransparency = 0.1
    powerBtn.AutoButtonColor = true
    powerBtn.BorderSizePixel = 0
    powerBtn.ClipsDescendants = true
    powerBtn.Parent = gui
    Theme.corner(powerBtn, 999)
    Theme.stroke(powerBtn, Theme.GOLD, 3)

    -- The cooldown sweep fills from the bottom. Behind the label, so the name
    -- of the power stays readable while it recharges — a button you cannot
    -- read is a button you stop looking at.
    powerSweep = Instance.new("Frame")
    powerSweep.AnchorPoint = Vector2.new(0, 1)
    powerSweep.Position = UDim2.new(0, 0, 1, 0)
    powerSweep.Size = UDim2.fromScale(1, 0)
    powerSweep.BackgroundColor3 = Theme.ACCENT
    powerSweep.BackgroundTransparency = 0.72
    powerSweep.BorderSizePixel = 0
    powerSweep.ZIndex = 0
    powerSweep.Parent = powerBtn

    powerCost = Theme.label({
        AnchorPoint = Vector2.new(0.5, 1),
        Position = UDim2.new(0.5, 0, 1, -8), Size = UDim2.fromScale(1, 0.3),
        Text = "", TextSize = 13, TextColor3 = Theme.TEXT_DIM,
        TextXAlignment = Enum.TextXAlignment.Center,
    })
    powerCost.ZIndex = 2
    powerCost.Parent = powerBtn

    powerBtn.Activated:Connect(function() ArenaHud.on.usePower(nil) end)

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

    ArenaHud.applyLayout()
    Layout.changed.Event:Connect(ArenaHud.applyLayout)
    return gui
end

-- ── Live update ────────────────────────────────────────────────────────────

function ArenaHud.setProfile(snap: any)
    profile = snap
    if not gui then return end
    globLabel.Text = "💧" .. Format.short(snap.glob or 0)
    local tier = snap.season and snap.season.tier or 0
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
        meltLabel.Text = "not melting yet"
        meltLabel.TextColor3 = Theme.TEXT_DIM
    elseif state.leak < state.harvest * 0.5 then
        meltLabel.Text = ("melting -%s/s"):format(Format.short(state.leak))
        meltLabel.TextColor3 = Theme.WARN
    else
        meltLabel.Text = ("MELTING FAST -%s/s"):format(Format.short(state.leak))
        meltLabel.TextColor3 = Theme.BAD
    end

    local where = state.biome or (state.ring == "VAULT" and "the Vault"
        or state.ring == "SHALLOWS" and "the Shallows" or "the Flats")
    if showingSummary then
        -- leave the summary up
    elseif state.banking > 0 then
        statusLabel.Text = "BANKING — hold still"
        statusLabel.TextColor3 = Theme.GOLD
    elseif state.safe then
        statusLabel.Text = "SAFE  ·  " .. where
        statusLabel.TextColor3 = Theme.GOOD
    else
        statusLabel.Text = "DANGER  ·  " .. where
        statusLabel.TextColor3 = Theme.BAD
    end

    bankBar.Visible = state.banking > 0
    bankFill.Size = UDim2.fromScale(
        math.clamp(state.banking / math.max(0.01, state.bankNeeds), 0, 1), 1)

    local power = Powers.get(state.powerId)
    powerBtn.Text = (power and power.name or "—")
        .. ((state.mastery or 0) > 0 and ("\n" .. string.rep("★", state.mastery)) or "")
    if state.powerCooldown > 0.05 then
        powerCost.Text = ("%.1fs"):format(state.powerCooldown)
        powerSweep.Size = UDim2.fromScale(1,
            math.clamp(state.powerCooldown / math.max(0.1, power and power.cooldown or 1), 0, 1))
        powerBtn.TextColor3 = Theme.TEXT_DIM
    else
        powerCost.Text = "-" .. Format.short(state.powerCost)
        powerSweep.Size = UDim2.fromScale(1, 0)
        powerBtn.TextColor3 = Theme.TEXT
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

function ArenaHud.isSheetOpen(): boolean
    return openTab ~= nil
end

return ArenaHud
