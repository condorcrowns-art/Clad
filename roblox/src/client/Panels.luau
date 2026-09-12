--!strict
-- Panels.luau — the wardrobe, season pass and crew screens.
--
-- All three live as TABS inside the drawer that already exists rather than
-- behind new buttons. A phone screen has room for roughly one persistent
-- control, and every extra floating button is one more thing competing with
-- the thumbstick for a thumb.

local Players = game:GetService("Players")

local Shared = game.ReplicatedStorage:WaitForChild("GoobShared")
local Cosmetics = require(Shared.Cosmetics)
local Season = require(Shared.Season)
local Format = require(Shared.Format)

local Theme = require(script.Parent.Theme)
local Layout = require(script.Parent.Layout)

local Panels = {}

Panels.onEquip = function(_kind: string, _id: string) end
Panels.onClaimSeason = function(_tier: number, _premium: boolean) end
Panels.onCrewCreate = function(_name: string, _tag: string) end
Panels.onCrewJoin = function(_tag: string) end
Panels.onCrewLeave = function() end
Panels.onCrewClaim = function() end
Panels.onBuy = function(_id: string) end

local function clear(frame: Instance)
    for _, c in ipairs(frame:GetChildren()) do
        if c:IsA("GuiObject") then c:Destroy() end
    end
end

local function scroller(parent: Frame): ScrollingFrame
    local sf = Instance.new("ScrollingFrame")
    sf.Size = UDim2.fromScale(1, 1)
    sf.BackgroundTransparency = 1
    sf.BorderSizePixel = 0
    sf.ScrollBarThickness = 6
    sf.ScrollBarImageColor3 = Theme.ACCENT
    sf.Parent = parent
    local layout = Instance.new("UIListLayout")
    layout.Padding = UDim.new(0, 6)
    layout.SortOrder = Enum.SortOrder.LayoutOrder
    layout.Parent = sf
    return sf
end

-- ── Wardrobe ───────────────────────────────────────────────────────────────

local function wardrobe(container: Frame, state: any)
    local touch = Layout.isTouch()
    local sf = scroller(container)
    local order = 0
    local rowH = touch and 52 or 42

    for _, kind in ipairs(Cosmetics.KINDS) do
        local header = Theme.label({
            Size = UDim2.new(1, -10, 0, 24),
            Text = ({ skin = "🎨 SKIN", trail = "💫 TRAIL",
                      eyes = "👀 EYES", crown = "👑 CROWN" })[kind] or kind,
            TextSize = 16, TextColor3 = Theme.GOLD,
        })
        order += 1; header.LayoutOrder = order; header.Parent = sf

        for _, item in ipairs(Cosmetics.ofKind(kind)) do
            local ownsIt = (state.cosmeticsOwned or {})[item.id] == true
            local worn = (state.loadout or {})[kind] == item.id

            local row = Instance.new("TextButton")
            row.Size = UDim2.new(1, -10, 0, rowH)
            row.BackgroundColor3 = worn and Theme.BG_SOFT or Theme.PANEL
            row.Text = ""
            row.AutoButtonColor = ownsIt
            Theme.corner(row, 10)
            Theme.stroke(row, worn and Theme.ACCENT
                or (Cosmetics.RARITY_COLOUR[item.rarity] or Theme.PANEL), worn and 3 or 2)
            order += 1; row.LayoutOrder = order; row.Parent = sf

            local swatch = Instance.new("Frame")
            swatch.Size = UDim2.fromOffset(rowH - 16, rowH - 16)
            swatch.Position = UDim2.fromOffset(8, 8)
            swatch.BackgroundColor3 = item.colour or Cosmetics.RARITY_COLOUR[item.rarity]
            swatch.Parent = row
            Theme.corner(swatch, (rowH - 16) / 2)

            if item.emoji and item.emoji ~= "" then
                local e = Theme.label({ Size = UDim2.fromScale(1, 1), Text = item.emoji,
                    TextSize = 18, TextXAlignment = Enum.TextXAlignment.Center })
                e.Parent = swatch
            end

            local name = Theme.label({
                Position = UDim2.fromOffset(rowH + 2, 4),
                Size = UDim2.new(1, -rowH - 90, 0, 20),
                Text = item.name, TextSize = 15,
                TextColor3 = ownsIt and Theme.TEXT or Theme.TEXT_DIM,
            })
            name.Parent = row

            local sub = Theme.label({
                Position = UDim2.fromOffset(rowH + 2, rowH - 26),
                Size = UDim2.new(1, -rowH - 90, 0, 18),
                Text = ownsIt and (worn and "equipped" or "tap to wear")
                    or ({ season = "season tier " .. tostring(item.tier or "?"),
                          shop = "in the shop", ascend = "ascension reward",
                          achievement = "achievement", starter = "" })[item.source] or "locked",
                TextSize = 12,
                TextColor3 = ownsIt and Theme.TEXT_DIM
                    or (Cosmetics.RARITY_COLOUR[item.rarity] or Theme.TEXT_DIM),
            })
            sub.Parent = row

            local badge = Theme.label({
                Position = UDim2.new(1, -84, 0, 4),
                Size = UDim2.fromOffset(78, rowH - 8),
                Text = ownsIt and (worn and "✓" or "") or "🔒",
                TextSize = 18, TextXAlignment = Enum.TextXAlignment.Right,
                TextColor3 = worn and Theme.GOOD or Theme.TEXT_DIM,
            })
            badge.Parent = row

            if ownsIt then
                row.Activated:Connect(function() Panels.onEquip(kind, item.id) end)
            end
        end
    end
    sf.CanvasSize = UDim2.new(0, 0, 0, order * (rowH + 6) + 20)
end

-- ── Season pass ────────────────────────────────────────────────────────────

local function season(container: Frame, state: any)
    local s = state.season
    if not s then return end
    local touch = Layout.isTouch()

    local head = Instance.new("Frame")
    head.Size = UDim2.new(1, -10, 0, 66)
    head.BackgroundColor3 = Theme.PANEL
    head.Parent = container
    Theme.corner(head, 12)

    local title = Theme.label({
        Position = UDim2.fromOffset(12, 6), Size = UDim2.new(1, -24, 0, 22),
        Text = ("⭐ %s"):format(s.name or "Season"), TextSize = 17, TextColor3 = Theme.GOLD,
    })
    title.Parent = head

    local tierLabel = Theme.label({
        Position = UDim2.fromOffset(12, 28), Size = UDim2.new(1, -24, 0, 18),
        Text = ("Tier %d / %d   ·   %s / %s xp today")
            :format(s.tier, s.tiers, Format.comma(s.dailyXp or 0), Format.comma(s.dailyCap or 0)),
        TextSize = 13, TextColor3 = Theme.TEXT_DIM,
    })
    tierLabel.Parent = head

    local barBg = Instance.new("Frame")
    barBg.Position = UDim2.fromOffset(12, 48)
    barBg.Size = UDim2.new(1, -24, 0, 10)
    barBg.BackgroundColor3 = Theme.BG
    barBg.Parent = head
    Theme.corner(barBg, 5)
    local bar = Instance.new("Frame")
    bar.Size = UDim2.fromScale(math.clamp(s.progress or 0, 0, 1), 1)
    bar.BackgroundColor3 = Theme.GOLD
    bar.Parent = barBg
    Theme.corner(bar, 5)

    local body = Instance.new("Frame")
    body.Position = UDim2.fromOffset(0, 72)
    body.Size = UDim2.new(1, 0, 1, -72)
    body.BackgroundTransparency = 1
    body.Parent = container
    local sf = scroller(body)

    local order = 0
    if not s.premium then
        local buy = Theme.button("💎 GET PREMIUM — unlock the second column",
            Theme.GOLD, UDim2.new(1, -10, 0, touch and 48 or 38))
        buy.TextSize = 14
        order += 1; buy.LayoutOrder = order; buy.Parent = sf
        buy.Activated:Connect(function() Panels.onBuy("premium_pass") end)
    end

    local claimable = s.claimable or {}
    if #claimable == 0 then
        local none = Theme.label({
            Size = UDim2.new(1, -10, 0, 30),
            Text = "Nothing to claim — keep playing to earn tiers.",
            TextSize = 13, TextColor3 = Theme.TEXT_DIM,
        })
        order += 1; none.LayoutOrder = order; none.Parent = sf
    end

    for _, entry in ipairs(claimable) do
        local item = Cosmetics.get(entry.cosmetic)
        local row = Theme.button(
            ("🎁 Tier %d%s — %s"):format(entry.tier, entry.premium and " 💎" or "",
                item and item.name or entry.cosmetic),
            entry.premium and Theme.GOLD or Theme.GOOD,
            UDim2.new(1, -10, 0, touch and 48 or 38))
        row.TextSize = 14
        order += 1; row.LayoutOrder = order; row.Parent = sf
        row.Activated:Connect(function() Panels.onClaimSeason(entry.tier, entry.premium) end)
    end

    -- The rest of the track, so the reason to keep playing is visible.
    local rewards = Season.rewards()
    for t = 1, Season.TIERS do
        local row = rewards[t]
        if row.free or row.premium then
            local names = {}
            if row.free then
                local i = Cosmetics.get(row.free); table.insert(names, i and i.name or row.free)
            end
            if row.premium then
                local i = Cosmetics.get(row.premium)
                table.insert(names, "💎 " .. (i and i.name or row.premium))
            end
            local done = t <= s.tier
            local line = Theme.label({
                Size = UDim2.new(1, -10, 0, 22),
                Text = ("%s Tier %-2d  %s"):format(done and "✓" or "·", t, table.concat(names, "  ·  ")),
                TextSize = 13,
                TextColor3 = done and Theme.TEXT or Theme.TEXT_DIM,
            })
            order += 1; line.LayoutOrder = order; line.Parent = sf
        end
    end
    sf.CanvasSize = UDim2.new(0, 0, 0, order * 34 + 20)
end

-- ── Crew ───────────────────────────────────────────────────────────────────

local crewState: any = nil
function Panels.setCrew(data: any) crewState = data end
function Panels.crew() return crewState end

local function crew(container: Frame, _state: any)
    local touch = Layout.isTouch()
    local btnH = touch and 48 or 38

    if not crewState then
        local blurb = Theme.label({
            Position = UDim2.fromOffset(6, 0), Size = UDim2.new(1, -12, 0, 54),
            Text = "Crews share a weekly goal. Nobody hits it alone — and everyone who helps gets paid.",
            TextSize = 14, TextWrapped = true, TextColor3 = Theme.TEXT_DIM,
        })
        blurb.Parent = container

        local nameBox = Instance.new("TextBox")
        nameBox.Position = UDim2.fromOffset(6, 60)
        nameBox.Size = UDim2.new(1, -12, 0, btnH)
        nameBox.BackgroundColor3 = Theme.BG_SOFT
        nameBox.Font = Theme.FONT
        nameBox.TextSize = 15
        nameBox.TextColor3 = Theme.TEXT
        nameBox.PlaceholderText = "Crew name (3–20 letters)"
        nameBox.Text = ""
        nameBox.ClearTextOnFocus = false
        nameBox.Parent = container
        Theme.corner(nameBox, 10)

        local tagBox = Instance.new("TextBox")
        tagBox.Position = UDim2.fromOffset(6, 60 + btnH + 8)
        tagBox.Size = UDim2.new(0.45, -12, 0, btnH)
        tagBox.BackgroundColor3 = Theme.BG_SOFT
        tagBox.Font = Theme.FONT
        tagBox.TextSize = 15
        tagBox.TextColor3 = Theme.TEXT
        tagBox.PlaceholderText = "TAG"
        tagBox.Text = ""
        tagBox.ClearTextOnFocus = false
        tagBox.Parent = container
        Theme.corner(tagBox, 10)

        local create = Theme.button("🛡️ FOUND CREW", Theme.GOOD,
            UDim2.new(0.55, -12, 0, btnH))
        create.Position = UDim2.new(0.45, 6, 0, 60 + btnH + 8)
        create.TextSize = 14
        create.Parent = container
        create.Activated:Connect(function()
            Panels.onCrewCreate(nameBox.Text, tagBox.Text)
        end)

        local joinBox = Instance.new("TextBox")
        joinBox.Position = UDim2.fromOffset(6, 60 + (btnH + 8) * 2 + 8)
        joinBox.Size = UDim2.new(0.45, -12, 0, btnH)
        joinBox.BackgroundColor3 = Theme.BG_SOFT
        joinBox.Font = Theme.FONT
        joinBox.TextSize = 15
        joinBox.TextColor3 = Theme.TEXT
        joinBox.PlaceholderText = "Join by TAG"
        joinBox.Text = ""
        joinBox.ClearTextOnFocus = false
        joinBox.Parent = container
        Theme.corner(joinBox, 10)

        local join = Theme.button("JOIN", Theme.ACCENT, UDim2.new(0.55, -12, 0, btnH))
        join.Position = UDim2.new(0.45, 6, 0, 60 + (btnH + 8) * 2 + 8)
        join.TextSize = 14
        join.Parent = container
        join.Activated:Connect(function() Panels.onCrewJoin(joinBox.Text) end)
        return
    end

    local head = Theme.label({
        Position = UDim2.fromOffset(6, 0), Size = UDim2.new(1, -12, 0, 26),
        Text = ("🛡️ [%s] %s"):format(crewState.tag, crewState.name),
        TextSize = 19, TextColor3 = Theme.GOLD,
    })
    head.Parent = container

    local goal = Theme.label({
        Position = UDim2.fromOffset(6, 28), Size = UDim2.new(1, -12, 0, 20),
        Text = ("%s  —  %s / %s"):format(crewState.goalLabel,
            Format.comma(crewState.progress), Format.comma(crewState.target)),
        TextSize = 14,
    })
    goal.Parent = container

    local barBg = Instance.new("Frame")
    barBg.Position = UDim2.fromOffset(6, 50)
    barBg.Size = UDim2.new(1, -12, 0, 12)
    barBg.BackgroundColor3 = Theme.BG
    barBg.Parent = container
    Theme.corner(barBg, 6)
    local bar = Instance.new("Frame")
    bar.Size = UDim2.fromScale(math.clamp(crewState.progress / math.max(1, crewState.target), 0, 1), 1)
    bar.BackgroundColor3 = crewState.complete and Theme.GOOD or Theme.ACCENT
    bar.Parent = barBg
    Theme.corner(bar, 6)

    local y = 68
    if crewState.complete and not crewState.claimed then
        local claim = Theme.button("🎁 CLAIM WEEKLY REWARD", Theme.GOOD,
            UDim2.new(1, -12, 0, btnH))
        claim.Position = UDim2.fromOffset(6, y)
        claim.TextSize = 14
        claim.Parent = container
        claim.Activated:Connect(function() Panels.onCrewClaim() end)
        y += btnH + 8
    end

    local listHolder = Instance.new("Frame")
    listHolder.Position = UDim2.fromOffset(6, y)
    listHolder.Size = UDim2.new(1, -12, 1, -y - btnH - 14)
    listHolder.BackgroundTransparency = 1
    listHolder.Parent = container
    local sf = scroller(listHolder)

    for i, m in ipairs(crewState.members or {}) do
        local row = Theme.label({
            Size = UDim2.new(1, -8, 0, 22),
            Text = ("%d. %s%s  —  %s"):format(i, m.name,
                m.owner and " 👑" or "", Format.comma(m.contributed)),
            TextSize = 13,
        })
        row.LayoutOrder = i
        row.Parent = sf
    end
    sf.CanvasSize = UDim2.new(0, 0, 0, #(crewState.members or {}) * 28 + 10)

    local leave = Theme.button("LEAVE CREW", Theme.BAD, UDim2.new(1, -12, 0, btnH))
    leave.Position = UDim2.new(0, 6, 1, -btnH - 6)
    leave.TextSize = 14
    leave.Parent = container
    leave.Activated:Connect(function() Panels.onCrewLeave() end)
end

-- ── Entry point ────────────────────────────────────────────────────────────

function Panels.render(tab: string, container: Frame, state: any)
    clear(container)
    if not state then return end
    if tab == "wear" then wardrobe(container, state)
    elseif tab == "season" then season(container, state)
    elseif tab == "crew" then crew(container, state) end
end

return Panels
