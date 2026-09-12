local Format = require("Format")
local fails = 0
local function check(l, got, want)
    if got == want then emit(("  ok    %-26s %s"):format(l, tostring(got)))
    else fails += 1; emit(("  FAIL  %-26s got %q want %q"):format(l, tostring(got), tostring(want))) end
end

emit("── The regression that shipped ──")
check("short(100000)",     Format.short(100000),     "100K")
check("short(340000000)",  Format.short(340000000),  "340M")
check("short(990000)",     Format.short(990000),     "990K")
check("short(120000)",     Format.short(120000),     "120K")
check("short(500000000)",  Format.short(500000000),  "500M")

emit("")
emit("── Still correct where it always was ──")
check("short(999)",   Format.short(999),   "999")
check("short(1000)",  Format.short(1000),  "1K")
check("short(1234)",  Format.short(1234),  "1.23K")
check("short(20000)", Format.short(20000), "20K")
check("short(1e6)",   Format.short(1e6),   "1M")
check("short(1.5e9)", Format.short(1.5e9), "1.5B")
check("short(1e15)",  Format.short(1e15),  "1Qa")
check("short(0)",     Format.short(0),     "0")
check("short(-4200)", Format.short(-4200), "-4.2K")

emit("")
emit("── Property sweep: parse the output back, compare to the input ──")
-- The honest guarantee, and the one the code can actually meet:
--   * at or above 1000, relative error under 1%
--   * below 1000 we print whole numbers, so the floor is +/- 0.5 absolute
-- An earlier version of this check demanded 1% everywhere and failed on 11.49
-- -> "11", which is not a bug, it is what integer display costs.
-- Parse the formatted string back and compare. This is the check that would
-- have caught the original bug without anyone thinking to test 100000.
local SUF = { [""]=1, K=1e3, M=1e6, B=1e9, T=1e12, Qa=1e15, Qi=1e18, Sx=1e21, Sp=1e24, Oc=1e27, No=1e30 }
local worst, worstN, worstS = 0, 0, ""
local rng = Random.new(4242)
local tested = 0
for exp = 0, 12 do
    for _ = 1, 400 do
        local n = rng:NextNumber(0.5, 999.9) * (10 ^ exp)
        local s = Format.short(n)
        local num, suf = s:match("^([%d%.]+)(%a*)$")
        if num and SUF[suf] then
            local back = tonumber(num) * SUF[suf]
            local abs = math.abs(back - n)
            local err = (n >= 1000) and (abs / n) or (abs <= 0.5 and 0 or abs / n)
            tested += 1
            if err > worst then worst, worstN, worstS = err, n, s end
        end
    end
end
emit(("  sampled %d values across 13 orders of magnitude"):format(tested))
emit(("  worst error %.3f%%  (%.1f rendered as %q)"):format(worst * 100, worstN, worstS))
check("meets the stated guarantee", worst < 0.01, true)

emit("")
emit(fails == 0 and "ALL FORMAT CHECKS PASSED" or (fails .. " FAILURE(S)"))
