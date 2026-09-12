local Config = require("Config")
local Movement = require("Movement")
local Format = require("Format")
emit("── Does mass actually change how it feels? ──")
emit("  mass      top spd   0-top    stop dist   jump")
for _, m in ipairs({10, 1e3, 1e5, 1e6, 5e6, 1e9, 1e12}) do
    emit(("  %-9s %5.1f     %4.2fs    %6.1f      %4.1f")
        :format(Format.short(m), Movement.topSpeed(m), Movement.timeToTopSpeed(m),
                Movement.stoppingDistance(m), Movement.jumpSpeed(m)))
end
local fails = 0
local function check(l, c, d)
    if c then emit("  ok    " .. l) else fails += 1; emit("  FAIL  " .. l .. "  " .. tostring(d)) end
end
emit("")
check("bigger is faster at top speed", Movement.topSpeed(1e9) > Movement.topSpeed(10))
check("bigger accelerates slower", Movement.timeToTopSpeed(1e9) > Movement.timeToTopSpeed(10) * 2,
    Movement.timeToTopSpeed(1e9) / Movement.timeToTopSpeed(10))
check("bigger takes much longer to stop",
    Movement.stoppingDistance(1e9) > Movement.stoppingDistance(10) * 3,
    Movement.stoppingDistance(1e9) / Movement.stoppingDistance(10))
check("jump stays learnable across the whole range",
    Movement.jumpSpeed(1e12) > Movement.jumpSpeed(10) * 0.55,
    Movement.jumpSpeed(1e12) / Movement.jumpSpeed(10))
check("speed is capped so the map stays designable",
    Movement.topSpeed(1e30) <= Movement.MAX_SPEED)
check("heavy wins a head-on shove", Movement.momentum(1e6, 40) > Movement.momentum(1e3, 40))
check("a small Goob at full tilt still beats a stationary whale",
    Movement.momentum(1e3, Movement.topSpeed(1e3)) > Movement.momentum(1e6, 0))
check("cheat ceiling clears a legitimate dash",
    Movement.maxPlausibleSpeed(10) > Movement.DASH_SPEED)
emit("")
emit(fails == 0 and "ALL MOVEMENT CHECKS PASSED" or (fails .. " FAILURE(S)"))
