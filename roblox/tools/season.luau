local Season = require("Season")
local Cosmetics = require("Cosmetics")
local fails = 0
local function check(l, c, d)
    if c then emit("  ok    " .. l) else fails += 1; emit("  FAIL  " .. l .. "   " .. tostring(d)) end
end

emit("── Track shape ──")
local r = Season.rewards()
local free, prem = 0, 0
for t = 1, Season.TIERS do
    if r[t].free then free += 1 end
    if r[t].premium then prem += 1 end
end
emit(("  %d tiers · %d free rewards · %d premium rewards"):format(Season.TIERS, free, prem))
check("the free track actually gives things", free >= 6, tostring(free))
check("premium adds without replacing", prem >= 4, tostring(prem))
check("tier 1 starts at 0 xp", Season.tierOf(0) == 1)
check("last tier is reachable", Season.tierOf(Season.XP_PER_TIER * Season.TIERS) == Season.TIERS)
check("tier never exceeds the cap", Season.tierOf(1e9) == Season.TIERS)

emit("")
emit("── Every season reward is purely cosmetic ──")
local bad = {}
for _, item in ipairs(Cosmetics.ITEMS) do
    if item.source == "season" then
        if item.kind ~= "skin" and item.kind ~= "trail" and item.kind ~= "eyes" and item.kind ~= "crown" then
            table.insert(bad, item.id)
        end
    end
end
check("nothing on the track touches gameplay", #bad == 0, table.concat(bad, ", "))

emit("")
emit("── Daily cap: a season, not a weekend ──")
local s = Season.blank()
local total = 0
for _ = 1, 100000 do
    local got = Season.award(s, "catch", 1000 * 86400)
    total += got
end
check("grindable xp is capped per day", total <= Season.DAILY_CAP, tostring(total))
emit(("  capped at %d xp/day = %.1f tiers/day"):format(total, total / Season.XP_PER_TIER))
local days = (Season.XP_PER_TIER * Season.TIERS) / Season.DAILY_CAP
emit(("  full track takes ~%.0f days of hitting the cap"):format(days))
-- A season that finishes in a week leaves the most engaged players with nothing
-- to chase; one that cannot be finished at all makes the premium track feel
-- like a con. Both failure modes are cheap to introduce by nudging a constant,
-- so the window is asserted rather than assumed.
check("a season takes between 30 and 60 days at the cap", days >= 30 and days <= 60,
    ("%.0f days"):format(days))
local catchesToCap = Season.DAILY_CAP / Season.XP["catch"]
emit(("  capping out = %.0f catches, about %.1f hours at one every 4s")
    :format(catchesToCap, catchesToCap * 4 / 3600))
check("capping out is about two hours, not eight",
    catchesToCap * 4 / 3600 <= 2.5, ("%.1f h"):format(catchesToCap * 4 / 3600))

local s2 = Season.blank()
for _ = 1, 50 do Season.award(s2, "catch", 1000 * 86400) end
local capped = s2.dailyXp
Season.award(s2, "ascend", 1000 * 86400)
check("big achievements bypass the cap", s2.xp > capped, ("%d -> %d"):format(capped, s2.xp))

local s3 = Season.blank()
for _ = 1, 100000 do Season.award(s3, "catch", 1000 * 86400) end
local dayOne = s3.xp
Season.award(s3, "catch", 1001 * 86400)   -- next day
check("the cap resets on a new day", s3.xp > dayOne, ("%d -> %d"):format(dayOne, s3.xp))

emit("")
emit("── Claiming ──")
local s4 = Season.blank()
s4.xp = Season.XP_PER_TIER * 12
local c = Season.claimable(s4)
check("free rewards become claimable", #c > 0, tostring(#c))
local anyPremium = false
for _, e in ipairs(c) do if e.premium then anyPremium = true end end
check("premium rewards are withheld without premium", not anyPremium)
s4.premium = true
local c2 = Season.claimable(s4)
check("buying premium unlocks the second column", #c2 > #c, ("%d -> %d"):format(#c, #c2))
for _, e in ipairs(c2) do Season.markClaimed(s4, e.tier, e.premium) end
check("claiming clears the list", #Season.claimable(s4) == 0)

emit("")
emit("── Season rollover ──")
local s5 = Season.blank()
s5.xp = 9999
s5.premium = true
s5.id = Season.CURRENT - 1
local rolled = Season.rollIfNeeded(s5)
check("an old season rolls over", rolled)
check("progress resets", s5.xp == 0, tostring(s5.xp))
check("premium does NOT carry to the next season", s5.premium == false)
check("a current season does not roll", Season.rollIfNeeded(Season.blank()) == false)

emit("")
-- A suite that PRINTS its failures and exits zero is invisible: run_all.sh
-- reported "ALL SUITES PASSED" over the top of this one for as long as it
-- has existed. Failing loudly is the entire job.
if fails > 0 then
    error(("%d FAILURE(S) in season.luau"):format(fails), 0)
end
emit("ALL SEASON CHECKS PASSED")
