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
function Format.short(n: number): string
    if n ~= n then return "0" end                 -- NaN guard
    if n == math.huge then return "∞" end
    local neg = n < 0
    n = math.abs(n)
    if n < 1000 then
        local s = (n < 10 and n % 1 ~= 0) and string.format("%.1f", n) or string.format("%d", math.floor(n))
        return (neg and "-" or "") .. s
    end
    local tier = math.floor(math.log(n, 1000))
    tier = math.clamp(tier, 1, #SUFFIXES - 1)
    local scaled = n / (1000 ^ tier)
    local s
    if scaled >= 100 then s = string.format("%.0f", scaled)
    elseif scaled >= 10 then s = string.format("%.1f", scaled)
    else s = string.format("%.2f", scaled) end
    -- trim trailing zeros: "1.00K" -> "1K"
    s = s:gsub("%.?0+$", "")
    return (neg and "-" or "") .. s .. SUFFIXES[tier + 1]
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
