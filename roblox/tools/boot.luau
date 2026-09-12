emit("booting server…")
_G.BOOT_SERVER()
local env, svc = _G.ENV, _G.SVC
for _ = 1, 8 do env.scheduler.step(0.25); svc.heartbeat(0.25) end
emit("server ok")
local alice = svc.addPlayer("Alice", 101, env.Vector3.new(0, 5, 40))
for _ = 1, 12 do env.scheduler.step(0.25); svc.heartbeat(0.25) end
emit("player joined")
local ball = svc.Workspace:FindFirstChild("GoobBall_101")
emit("ball exists: " .. tostring(ball ~= nil))
svc.enterClientMode(alice)
_G.BOOT_CLIENT()
for _ = 1, 20 do env.scheduler.step(0.25); svc.heartbeat(0.25); svc.renderStep(0.25) end
emit("client ok")
