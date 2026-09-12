local Pit = require("Pit")
local Movement = require("Movement")
local fails = 0
local function check(l, c, d)
    if c then emit("  ok    " .. l) else fails += 1; emit("  FAIL  " .. l .. "   " .. tostring(d)) end
end

emit("── The ring closes, and it resolves ──")
for _, t in ipairs({0, 15, 40, 70, 100, 120}) do
    emit(("  t=%3ds  radius %.0f"):format(t, Pit.radiusAt(t)))
end
check("there is a grace period", Pit.radiusAt(Pit.SHRINK_START) == Pit.START_RADIUS)
check("it closes to the minimum by the end",
    math.abs(Pit.radiusAt(Pit.MATCH_SECONDS) - Pit.MIN_RADIUS) < 0.5,
    Pit.radiusAt(Pit.MATCH_SECONDS))
check("it only ever shrinks", (function()
    local last = math.huge
    for t = 0, Pit.MATCH_SECONDS do
        local r = Pit.radiusAt(t)
        if r > last + 0.001 then return false end
        last = r
    end
    return true
end)())
check("the late game is tighter than the early game",
    (Pit.radiusAt(60) - Pit.radiusAt(120)) > (Pit.radiusAt(0) - Pit.radiusAt(60)),
    ("early %.0f vs late %.0f"):format(Pit.radiusAt(0) - Pit.radiusAt(60),
                                       Pit.radiusAt(60) - Pit.radiusAt(120)))

emit("")
emit("── Falling out ──")
check("centre is inside", Pit.isInside(Pit.CENTRE, 0))
check("far outside is out", Pit.isInside(Pit.CENTRE + Vector3.new(500, 0, 0), 0) == false)
check("falling off the bottom is out",
    Pit.isInside(Pit.CENTRE - Vector3.new(0, 100, 0), 0) == false)
check("the edge at t=0 is inside but not at t=120",
    Pit.isInside(Pit.CENTRE + Vector3.new(90, 0, 0), 0)
    and not Pit.isInside(Pit.CENTRE + Vector3.new(90, 0, 0), 120))

emit("")
emit("── Mass is an advantage AND a liability ──")
local heavy, light = 1e6, 1e3
local fast = Vector3.new(Movement.topSpeed(light), 0, 0)
local still = Vector3.new(0, 0, 0)

local hShare, lShare = Pit.shove(heavy, fast, light, fast)
check("at equal speed the heavy one shoves harder", lShare > hShare,
    ("heavy takes %.2f, light takes %.2f"):format(hShare, lShare))

local hShare2, lShare2 = Pit.shove(heavy, still, light, fast)
check("a STATIONARY whale gets shoved by a moving minnow", hShare2 > 0.5,
    ("whale takes %.2f"):format(hShare2))

emit(("  a %s Goob needs %.0f studs to stop; the ring ends at r=%d")
    :format("1M", Movement.stoppingDistance(1e6), Pit.MIN_RADIUS))
check("a big Goob genuinely cannot stop inside the final ring",
    Movement.stoppingDistance(1e6) > Pit.MIN_RADIUS * 2,
    Movement.stoppingDistance(1e6))

emit("")
emit("── The pot is economy-neutral ──")
local stakes = { 100, 100, 250, 80 }
local pot = Pit.payout(stakes)
local staked = 0
for _, s in ipairs(stakes) do staked += s end
check("no rake: everything staked comes back out", math.abs(pot - staked) < 0.001,
    ("staked %d, paid %d"):format(staked, pot))
check("the Pit neither prints nor burns Glob", Pit.HOUSE_CUT == 0)

emit("")
emit("── Entry is affordable at every scale ──")
for _, income in ipairs({ 1.4, 100, 22000, 5.5e6 }) do
    emit(("  income %-10.1f/s -> stake %.0f (= %ds of income)")
        :format(income, Pit.stakeFor(income), Pit.STAKE_SECONDS))
end
check("a brand-new player can afford a match", Pit.stakeFor(1.4) <= 250,
    Pit.stakeFor(1.4))
check("the stake scales so it stays meaningful for whales",
    Pit.stakeFor(5.5e6) > Pit.stakeFor(1.4) * 1000)

emit("")
emit(fails == 0 and "ALL PIT CHECKS PASSED" or (fails .. " FAILURE(S)"))
