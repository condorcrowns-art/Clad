--!nolint
-- roblox_env.luau — a headless stand-in for the parts of the Roblox engine that
-- GULP A GOOB actually touches.
--
-- WHY THIS EXISTS
-- ---------------
-- The Luau compiler proves the code parses. The API dump proves every property
-- and enum is real. Neither proves the game RUNS: nil dereferences, wrong
-- argument order, signals wired to nothing, services used before they exist,
-- state machines that deadlock. Those only show up when the code executes, and
-- there is no Roblox runtime in CI.
--
-- So this implements Instances, parenting, signals, a virtual-clock task
-- scheduler, remotes, DataStores and the handful of datatypes the game uses —
-- enough to boot the real server scripts, join fake players, and drive the loop.
--
-- WHAT IT IS NOT
-- --------------
-- Not an emulator. CFrame is translation-only, physics does not exist, and
-- tweens apply instantly. It cannot tell you the game FEELS right. It tells you
-- the code does not explode, which is the part that was unverified.

local env = {}

-- ── Virtual clock + scheduler ──────────────────────────────────────────────
-- Time only moves when env.step() says so, which makes a 30-day simulation run
-- in milliseconds and keeps every test deterministic.

local clock = 0
local sleepers = {}   -- { resumeAt, coroutine }
local pending = {}    -- coroutines ready to run now

local function schedule(co, delay)
    table.insert(sleepers, { at = clock + (delay or 0), co = co })
end

local scheduler = {}

function scheduler.now() return clock end

function scheduler.spawn(fn, ...)
    local co = coroutine.create(fn)
    local ok, err = coroutine.resume(co, ...)
    if not ok then error("task.spawn: " .. tostring(err), 0) end
    return co
end

function scheduler.wait(duration)
    local co = coroutine.running()
    schedule(co, duration or 0)
    coroutine.yield()
    return duration or 0
end

function scheduler.delay(duration, fn, ...)
    local args = table.pack(...)
    local co = coroutine.create(function() fn(table.unpack(args, 1, args.n)) end)
    schedule(co, duration)
    return co
end

-- Advance the clock by `dt`, waking anything due. Returns how many coroutines ran.
function scheduler.step(dt)
    clock += dt
    local woke = 0
    local i = 1
    while i <= #sleepers do
        local s = sleepers[i]
        if s.at <= clock then
            table.remove(sleepers, i)
            table.insert(pending, s.co)
        else
            i += 1
        end
    end
    local batch = pending
    pending = {}
    for _, co in ipairs(batch) do
        if coroutine.status(co) == "suspended" then
            local ok, err = coroutine.resume(co)
            if not ok then error("scheduled task: " .. tostring(err), 0) end
            woke += 1
        end
    end
    return woke
end

env.scheduler = scheduler

-- ── Signals ────────────────────────────────────────────────────────────────

local Signal = {}
Signal.__index = Signal

function Signal.new(name)
    return setmetatable({ _name = name, _handlers = {}, fireCount = 0 }, Signal)
end

function Signal:Connect(fn)
    local h = { fn = fn, connected = true }
    table.insert(self._handlers, h)
    return {
        Connected = true,
        Disconnect = function() h.connected = false end,
        disconnect = function() h.connected = false end,
    }
end

Signal.connect = Signal.Connect

function Signal:Once(fn)
    local conn
    conn = self:Connect(function(...)
        conn:Disconnect()
        fn(...)
    end)
    return conn
end

function Signal:Wait()
    local co = coroutine.running()
    local conn
    conn = self:Connect(function(...)
        conn:Disconnect()
        schedule(co, 0)
    end)
    coroutine.yield()
end

function Signal:Fire(...)
    self.fireCount += 1
    for _, h in ipairs(table.clone(self._handlers)) do
        if h.connected then
            local co = coroutine.create(h.fn)
            local ok, err = coroutine.resume(co, ...)
            if not ok then
                error(("signal %s handler: %s"):format(tostring(self._name), tostring(err)), 0)
            end
        end
    end
end

env.Signal = Signal

-- ── Datatypes ──────────────────────────────────────────────────────────────

local Vector3 = {}
Vector3.__index = Vector3
local function v3(x, y, z)
    return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0 }, Vector3)
end
Vector3.__add = function(a, b) return v3(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
Vector3.__sub = function(a, b) return v3(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
Vector3.__unm = function(a) return v3(-a.X, -a.Y, -a.Z) end
Vector3.__mul = function(a, b)
    if type(b) == "number" then return v3(a.X * b, a.Y * b, a.Z * b) end
    if type(a) == "number" then return v3(b.X * a, b.Y * a, b.Z * a) end
    return v3(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
Vector3.__div = function(a, b) return v3(a.X / b, a.Y / b, a.Z / b) end
Vector3.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
Vector3.__tostring = function(a) return ("(%0.2f, %0.2f, %0.2f)"):format(a.X, a.Y, a.Z) end
Vector3.__index = function(t, k)
    if k == "Magnitude" then
        return math.sqrt(rawget(t, "X")^2 + rawget(t, "Y")^2 + rawget(t, "Z")^2)
    elseif k == "Unit" then
        local m = math.sqrt(rawget(t, "X")^2 + rawget(t, "Y")^2 + rawget(t, "Z")^2)
        if m == 0 then return v3(0, 0, 0) end
        return v3(rawget(t, "X") / m, rawget(t, "Y") / m, rawget(t, "Z") / m)
    end
    return rawget(Vector3, k)
end
env.Vector3 = { new = v3, zero = v3(0, 0, 0), one = v3(1, 1, 1) }

local Vector2 = {}
Vector2.__index = Vector2
local function v2(x, y) return setmetatable({ X = x or 0, Y = y or 0 }, Vector2) end
Vector2.__add = function(a, b) return v2(a.X + b.X, a.Y + b.Y) end
Vector2.__sub = function(a, b) return v2(a.X - b.X, a.Y - b.Y) end
Vector2.__mul = function(a, b)
    if type(b) == "number" then return v2(a.X * b, a.Y * b) end
    return v2(a.X * b.X, a.Y * b.Y)
end
Vector2.__index = function(t, k)
    if k == "Magnitude" then return math.sqrt(rawget(t, "X")^2 + rawget(t, "Y")^2) end
    return rawget(Vector2, k)
end
env.Vector2 = { new = v2, zero = v2(0, 0), one = v2(1, 1) }

-- CFrame: translation only. Enough to exercise the code paths; not a transform
-- library. Rotation is accepted and discarded.
local CFrame = {}
CFrame.__index = function(t, k)
    if k == "Position" or k == "p" then return v3(rawget(t, "_x"), rawget(t, "_y"), rawget(t, "_z")) end
    -- Fixed basis vectors: this stub carries no rotation, but controller code
    -- legitimately reads them to build camera-relative movement.
    if k == "LookVector" then return v3(0, 0, -1) end
    if k == "RightVector" then return v3(1, 0, 0) end
    if k == "UpVector" then return v3(0, 1, 0) end
    if k == "X" then return rawget(t, "_x") end
    if k == "Y" then return rawget(t, "_y") end
    if k == "Z" then return rawget(t, "_z") end
    return rawget(CFrame, k)
end
local function cf(x, y, z)
    return setmetatable({ _x = x or 0, _y = y or 0, _z = z or 0 }, CFrame)
end
CFrame.__mul = function(a, b)
    if getmetatable(b) == Vector3 then return v3(a._x + b.X, a._y + b.Y, a._z + b.Z) end
    return cf(a._x + (b._x or 0), a._y + (b._y or 0), a._z + (b._z or 0))
end
CFrame.__tostring = function(a) return ("CF(%0.1f,%0.1f,%0.1f)"):format(a._x, a._y, a._z) end
env.CFrame = {
    -- Also accepts CFrame.new(position, lookAt); the look target is discarded
    -- since this stub is translation-only.
    new = function(a, b, c)
        if type(a) == "table" then return cf(a.X, a.Y, a.Z) end
        return cf(a, b, c)
    end,
    Angles = function() return cf(0, 0, 0) end,
    fromEulerAnglesXYZ = function() return cf(0, 0, 0) end,
    identity = cf(0, 0, 0),
}

local function c3(r, g, b) return { R = r or 0, G = g or 0, B = b or 0 } end
env.Color3 = {
    new = c3,
    fromRGB = function(r, g, b) return c3((r or 0)/255, (g or 0)/255, (b or 0)/255) end,
    fromHSV = function(h, s, v) return c3(h, s, v) end,
}

env.UDim = { new = function(s, o) return { Scale = s or 0, Offset = o or 0 } end }
env.UDim2 = {
    new = function(xs, xo, ys, yo)
        return { X = { Scale = xs or 0, Offset = xo or 0 }, Y = { Scale = ys or 0, Offset = yo or 0 } }
    end,
    fromScale = function(x, y) return env.UDim2.new(x, 0, y, 0) end,
    fromOffset = function(x, y) return env.UDim2.new(0, x, 0, y) end,
}
env.TweenInfo = { new = function(...) return { args = { ... } } end }
-- Sequence datatypes used by trails and particle emitters.
env.NumberSequenceKeypoint = {
    new = function(t, v, env_) return { Time = t, Value = v, Envelope = env_ or 0 } end,
}
env.ColorSequenceKeypoint = {
    new = function(t, v) return { Time = t, Value = v } end,
}
env.NumberSequence = {
    new = function(a, b)
        if type(a) == "table" then return { Keypoints = a } end
        return { Keypoints = { { Time = 0, Value = a }, { Time = 1, Value = b or a } } }
    end,
}
env.ColorSequence = {
    new = function(a, b)
        if type(a) == "table" and a[1] then return { Keypoints = a } end
        return { Keypoints = { { Time = 0, Value = a }, { Time = 1, Value = b or a } } }
    end,
}
env.NumberRange = { new = function(a, b) return { Min = a, Max = b or a } end }

env.RaycastParams = {
    new = function()
        return { FilterType = nil, FilterDescendantsInstances = {}, IgnoreWater = false }
    end,
}
env.PhysicalProperties = {
    new = function(d, f, e, fw, ew)
        return { Density = d, Friction = f, Elasticity = e,
                 FrictionWeight = fw, ElasticityWeight = ew }
    end,
}
env.BrickColor = { new = function(n) return { Name = n } end }

-- Random is a Roblox global, not a Luau one. Deterministic LCG so every run of
-- the suite produces identical results.
local RandomObj = {}
RandomObj.__index = RandomObj
function RandomObj:NextNumber(a, b)
    self._s = (self._s * 16807) % 2147483647
    local r = self._s / 2147483647
    if a and b then return a + r * (b - a) end
    return r
end
function RandomObj:NextInteger(a, b)
    self._s = (self._s * 16807) % 2147483647
    return a + (self._s % (b - a + 1))
end
function RandomObj:Clone()
    return setmetatable({ _s = self._s }, RandomObj)
end
env.Random = {
    new = function(seed)
        local s = math.floor(math.abs(seed or 1)) % 2147483647
        if s <= 0 then s = 1 end
        return setmetatable({ _s = s }, RandomObj)
    end,
}

-- Enums are permissive here on purpose: tools/apicheck.py already validates
-- every Enum.X.Y against Roblox's real API dump, so re-checking is wasted work.
local enumCache = {}
env.Enum = setmetatable({}, {
    __index = function(_, enumName)
        if not enumCache[enumName] then
            enumCache[enumName] = setmetatable({}, {
                __index = function(_, item)
                    return { EnumType = enumName, Name = item, Value = 0 }
                end,
            })
        end
        return enumCache[enumName]
    end,
})

return env
