local Crew = require("Crew")
local Mon = require("Monetisation")
local Cosmetics = require("Cosmetics")
local Season = require("Season")
local fails = 0
local function check(l, c, d)
    if c then emit("  ok    " .. l) else fails += 1; emit("  FAIL  " .. l .. "   " .. tostring(d)) end
end

emit("── THE WALL: can money buy power? ──")
local v = Mon.violations()
check("no purchasable item touches gameplay", #v == 0, table.concat(v, " | "))
emit("  sellable:")
for _, g in ipairs(Mon.GAMEPASSES) do
    emit(("    gamepass  %-16s %s"):format(g.id, g.affects))
end
for _, p in ipairs(Mon.PRODUCTS) do
    emit(("    product   %-16s %s -> %s"):format(p.id, p.affects, p.cosmetic))
end
check("nothing unconfigured is offered for sale",
    #Mon.purchasable(Mon.GAMEPASSES) == 0 and #Mon.purchasable(Mon.PRODUCTS) == 0,
    "asset ids are placeholders until real ones are set")

-- Every purchasable cosmetic must actually exist in the catalogue.
local missing = {}
for _, p in ipairs(Mon.PRODUCTS) do
    if not Cosmetics.get(p.cosmetic) then table.insert(missing, p.cosmetic) end
end
check("every sold cosmetic exists in the catalogue", #missing == 0, table.concat(missing, ", "))

-- And nothing sold for money is ALSO on the free season track, which would
-- make buyers feel cheated and the track feel pointless.
local overlap = {}
for _, p in ipairs(Mon.PRODUCTS) do
    local item = Cosmetics.get(p.cosmetic)
    if item and item.source == "season" and not item.premium then
        table.insert(overlap, p.cosmetic)
    end
end
check("nothing sold is also a free season reward", #overlap == 0, table.concat(overlap, ", "))

emit("")
emit("── Cosmetics: every slot has an option, and starters are free ──")
for _, kind in ipairs(Cosmetics.KINDS) do
    local n = #Cosmetics.ofKind(kind)
    emit(("  %-6s %d options"):format(kind, n))
    check("slot has choices: " .. kind, n >= 4, tostring(n))
end
local owned = Cosmetics.starterOwned()
local load = Cosmetics.starterLoadout()
for _, kind in ipairs(Cosmetics.KINDS) do
    check("a new player can equip a " .. kind, owned[load[kind]] == true, tostring(load[kind]))
end

emit("")
emit("── Equipping something you do not own is refused ──")
local clean = Cosmetics.sanitise({ skin = "skin_prism", trail = "trail_rainbow" }, owned)
check("unowned cosmetics fall back to starters",
    clean.skin == "skin_default" and clean.trail == "trail_none",
    clean.skin .. " / " .. clean.trail)
local withPrism = { skin_prism = true }
for k in pairs(owned) do withPrism[k] = true end
check("owned cosmetics equip fine",
    Cosmetics.sanitise({ skin = "skin_prism" }, withPrism).skin == "skin_prism")
check("a cosmetic deleted in a later patch does not brick the profile",
    Cosmetics.sanitise({ skin = "skin_that_no_longer_exists" }, owned).skin == "skin_default")
check("equipping a trail into the skin slot is refused",
    Cosmetics.sanitise({ skin = "trail_flame" }, owned).skin == "skin_default")

emit("")
emit("── Crews: a weekly goal that rotates ──")
local week = Crew.currentWeek(0)
local seen = {}
for w = week, week + 6 do
    local g = Crew.goalForWeek(w)
    seen[g.id] = true
end
check("the goal rotates across weeks", (function()
    local n = 0
    for _ in pairs(seen) do n += 1 end
    return n >= 4
end)())

local crew = Crew.blank("c1", "The Blobs", "BLOB", 101, week)
check("the founder is a member", Crew.memberCount(crew) == 1)
check("a new crew is not full", Crew.isFull(crew) == false)
check("tags are normalised", Crew.sanitiseTag("  bl ob ") == "BLOB",
    tostring(Crew.sanitiseTag("  bl ob ")))
check("overlong tags are refused", Crew.sanitiseTag("TOOLONGTAG") == nil)
check("empty tags are refused", Crew.sanitiseTag("") == nil)
check("hostile names are refused", Crew.sanitiseName("<script>") == nil)
check("normal names pass", Crew.sanitiseName("  The Blobs  ") == "The Blobs")

local goal = Crew.goalForWeek(week)
local done = Crew.contribute(crew, 101, goal.metric, goal.target - 1, week)
check("progress accumulates", done == false and crew.progress == goal.target - 1)
done = Crew.contribute(crew, 101, goal.metric, 5, week)
check("hitting the target completes it", done and Crew.isComplete(crew, week))
check("progress cannot exceed the target", crew.progress == goal.target, tostring(crew.progress))
check("a different metric does not count",
    Crew.contribute(crew, 101, "not_the_metric", 99, week) == false)

check("claiming is per member", Crew.hasClaimed(crew, 101) == false)
Crew.markClaimed(crew, 101)
check("and is recorded", Crew.hasClaimed(crew, 101) == true)

local rolled = Crew.rollWeek(crew, week + 1)
check("a new week resets progress", rolled and crew.progress == 0)
check("but never wipes membership", Crew.memberCount(crew) == 1)
check("and clears last week's claims", Crew.hasClaimed(crew, 101) == false)

emit("")
emit("── Season rewards and shop items do not collide ──")
local seasonIds = {}
for _, item in ipairs(Cosmetics.ITEMS) do
    if item.source == "season" then seasonIds[item.id] = true end
end
local dupes = {}
for _, item in ipairs(Cosmetics.ITEMS) do
    if item.source == "shop" and seasonIds[item.id] then table.insert(dupes, item.id) end
end
check("no cosmetic has two sources", #dupes == 0, table.concat(dupes, ", "))

emit("")
-- A suite that PRINTS its failures and exits zero is invisible: run_all.sh
-- reported "ALL SUITES PASSED" over the top of this one for as long as it
-- has existed. Failing loudly is the entire job.
if fails > 0 then
    error(("%d FAILURE(S) in systems.luau"):format(fails), 0)
end
emit("ALL SYSTEM CHECKS PASSED")
