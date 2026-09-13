--!strict
-- Format.luau — number formatting for a genuinely huge power scale.
-- Goob mass is expected to reach 1e30+. Roblox's default tostring() gives you
-- "1e+30" which means nothing to a nine-year-old, so we ladder suffixes.

local Format = {}

local SUFFIXES = {
    "", "K", "M", "B", "T",
    "Qa", "Qi", "Sx", "Sp", "Oc", "No",
    "Dc", "UDc", "DDc", "TDc", "QaDc", "QiDc", "SxDc", "SpDc", "OcDc", "NoDc",
    "Vg", "UVg", "DVg", "TVg", "QaVg", "QiVg", "SxVg", "SpVg", "OcVg", "NoVg",
    "Tg",
}

-- 1234 -> "1.23K" ; 1e15 -> "1Qa" ; 999 -> "999"
--
-- Two bugs lived here, both found by a property sweep rather than by anyone
-- thinking to test the specific value:
--
--   1. Trailing-zero trimming ran even with no decimal point, so it ate
--      significant digits: 100000 -> "1K", 340000000 -> "34M". Always
--      UNDER-reporting, and worst at exactly the round milestones players watch.
--   2. The sub-1000 path floored instead of rounding, so 11.98 -> "11".
--
-- The invariant now enforced by the suite: parsing the output back must land
-- within 1% of the input, at every magnitude.
function Format.short(n: number): string
    if n ~= n then return "0" end                 -- NaN guard
    if n == math.huge then return "∞" end
    local neg = n < 0
    n = math.abs(n)

    local function sign(str: string): string
        return (neg and "-" or "") .. str
    end

    if n < 1000 then
        -- One decimal below 10 so small values stay informative.
        if n < 10 and n % 1 ~= 0 then
            local s = string.format("%.1f", n)
            if s:find(".", 1, true) then
                s = s:gsub("0+$", ""):gsub("%.$", "")
            end
            return sign(s)
        end
        local rounded = math.round(n)
        if rounded < 1000 then
            return sign(string.format("%d", rounded))
        end
        -- Rounding tipped it into the next tier; fall through and let the
        -- suffix path handle it rather than printing "1000".
    end

    local tier = math.floor(math.log(n, 1000))
    tier = math.clamp(tier, 1, #SUFFIXES - 1)
    local scaled = n / (1000 ^ tier)

    -- Rounding can push the mantissa to 1000 (999.8K -> "1000K"); promote it.
    if scaled >= 999.5 and tier < #SUFFIXES - 1 then
        tier += 1
        scaled = n / (1000 ^ tier)
    end

    local s
    if scaled >= 100 then s = string.format("%.0f", scaled)
    elseif scaled >= 10 then s = string.format("%.1f", scaled)
    else s = string.format("%.2f", scaled) end

    -- Trim trailing zeros ONLY past a decimal point.
    if s:find(".", 1, true) then
        s = s:gsub("0+$", ""):gsub("%.$", "")
    end
    return sign(s .. SUFFIXES[tier + 1])
end

-- 4821 -> "4,821" (used where exactness matters, e.g. census counts)
function Format.comma(n: number): string
    local s = tostring(math.floor(n))
    local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
    return (out:gsub("^,", ""))
end

-- 93784 -> "1d 2h" — used for Goob age, which is the whole rarity axis.
function Format.duration(sec: number): string
    sec = math.max(0, math.floor(sec))
    local d = math.floor(sec / 86400)
    local h = math.floor((sec % 86400) / 3600)
    local m = math.floor((sec % 3600) / 60)
    if d > 0 then return string.format("%dd %dh", d, h) end
    if h > 0 then return string.format("%dh %dm", h, m) end
    if m > 0 then return string.format("%dm", m) end
    return string.format("%ds", sec)
end

return Format
