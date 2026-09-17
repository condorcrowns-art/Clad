--!strict
-- Number abbreviation. Simulators live and die on this function -- players read
-- it thousands of times per session, so it has to be short, unambiguous and
-- never show "1000K".

local Format = {}

local SUFFIXES = {
	"", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No",
	"Dc", "Ud", "Dd", "Td", "Qad", "Qid", "Sxd", "Spd", "Ocd", "Nod", "Vg",
}

function Format.short(n: number): string
	if n ~= n then return "0" end          -- NaN guard
	local neg = n < 0
	n = math.abs(n)
	if n < 1000 then
		local s = (n % 1 == 0) and tostring(math.floor(n)) or string.format("%.1f", n)
		return (neg and "-" or "") .. s
	end
	local tier = math.floor(math.log(n, 1000))
	tier = math.clamp(tier, 1, #SUFFIXES - 1)
	local scaled = n / (1000 ^ tier)
	local s
	if scaled >= 100 then       s = string.format("%.0f", scaled)
	elseif scaled >= 10 then    s = string.format("%.1f", scaled)
	else                        s = string.format("%.2f", scaled) end
	-- trim trailing zeros: 1.00K -> 1K, 1.50K -> 1.5K
	s = s:gsub("%.?0+$", "")
	return (neg and "-" or "") .. s .. SUFFIXES[tier + 1]
end

function Format.comma(n: number): string
	local s = tostring(math.floor(n))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	return (out:gsub("^,", ""))
end

function Format.time(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	local h = math.floor(seconds / 3600)
	local m = math.floor((seconds % 3600) / 60)
	local s = seconds % 60
	if h > 0 then return string.format("%dh %dm", h, m) end
	if m > 0 then return string.format("%dm %ds", m, s) end
	return string.format("%ds", s)
end

function Format.mult(m: number): string
	if m >= 100 then return Format.short(m) .. "x" end
	return (string.format("%.2f", m):gsub("%.?0+$", "")) .. "x"
end

return Format
