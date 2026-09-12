--!nolint
-- roblox_game.luau — Instances, the DataModel and the services the game uses.
-- Builds on roblox_env.luau. See that file for why this harness exists.

local env = require("roblox_env")
local Signal = env.Signal
local scheduler = env.scheduler

local M = {}

-- Minimal class hierarchy, enough for IsA() on the classes this game creates.
local SUPER = {
    Instance = nil,
    Folder = "Instance", Model = "Instance", Camera = "Instance",
    PVInstance = "Instance", BasePart = "PVInstance",
    Part = "BasePart", WedgePart = "BasePart", SpawnLocation = "Part",
    Script = "Instance", LocalScript = "Instance", ModuleScript = "Instance",
    GuiBase = "Instance", GuiBase2d = "GuiBase", GuiObject = "GuiBase2d",
    Frame = "GuiObject", TextLabel = "GuiObject", TextButton = "GuiObject",
    TextBox = "GuiObject", ScrollingFrame = "Frame", ImageLabel = "GuiObject",
    LayerCollector = "GuiBase2d", ScreenGui = "LayerCollector",
    SurfaceGui = "LayerCollector", BillboardGui = "LayerCollector",
    UIComponent = "Instance", UICorner = "UIComponent", UIStroke = "UIComponent",
    UIPadding = "UIComponent", UILayout = "UIComponent",
    UIListLayout = "UILayout", UIGridLayout = "UILayout",
    Light = "Instance", PointLight = "Light",
    Sound = "Instance", SoundService = "Instance",
    Constraint = "Instance", WeldConstraint = "Instance",
    PostEffect = "Instance", BloomEffect = "PostEffect",
    Atmosphere = "Instance", Sky = "Instance",
    RemoteEvent = "Instance", RemoteFunction = "Instance",
    BindableEvent = "Instance", BindableFunction = "Instance",
    Player = "Instance", Players = "Instance",
    Humanoid = "Instance", Workspace = "Model", Terrain = "BasePart",
}

local Instance_mt = {}

local function isA(self, className)
    local c = rawget(self, "_class")
    while c do
        if c == className then return true end
        c = SUPER[c]
    end
    return false
end

-- Roblox instances are born with real default property values, and code reads
-- them before ever writing them. TradeUi does `fillBar.ZIndex = btn.ZIndex + 1`
-- on a button it just created — with a nil default that is an arithmetic error
-- that never happens in the real engine. So the stub has to have defaults too.
local function defaultsFor(className)
    local d = { Name = className, Archivable = true }

    local c = className
    local isGui, isPart, isText = false, false, false
    while c do
        if c == "GuiObject" then isGui = true end
        if c == "BasePart" then isPart = true end
        c = SUPER[c]
    end
    isText = className == "TextLabel" or className == "TextButton" or className == "TextBox"

    if isGui then
        d.ZIndex = 1
        d.Visible = true
        d.Active = false
        d.BackgroundTransparency = 0
        d.BorderSizePixel = 1
        d.Size = env.UDim2.new(0, 0, 0, 0)
        d.Position = env.UDim2.new(0, 0, 0, 0)
        d.AnchorPoint = env.Vector2.new(0, 0)
        d.Rotation = 0
        d.LayoutOrder = 0
    end
    if isText then
        d.Text = ""
        d.TextTransparency = 0
        d.TextSize = 14
        d.TextScaled = false
        d.TextWrapped = false
    end
    if isPart then
        d.AssemblyLinearVelocity = env.Vector3.new(0, 0, 0)
        d.AssemblyAngularVelocity = env.Vector3.new(0, 0, 0)
        d.Transparency = 0
        d.Reflectance = 0
        d.Anchored = false
        d.CanCollide = true
        d.CanQuery = true
        d.CanTouch = true
        d.Massless = false
        d.Size = env.Vector3.new(4, 1, 2)
        d.Position = env.Vector3.new(0, 0, 0)
        d.CFrame = env.CFrame.new(0, 0, 0)
    end
    if className == "Camera" then
        d.CFrame = env.CFrame.new(0, 20, 30)
        d.CameraType = nil
        d.FieldOfView = 70
    end
    if className == "Sound" then
        d.Volume = 0.5
        d.PlaybackSpeed = 1
        d.Playing = false
        d.SoundId = ""
    end
    if className == "BillboardGui" or className == "SurfaceGui" or className == "ScreenGui" then
        d.Enabled = true
        d.ZIndex = 1
    end
    return d
end

local function newInstance(className)
    local self = {}
    rawset(self, "_class", className)
    rawset(self, "_props", defaultsFor(className))
    rawset(self, "_children", {})
    rawset(self, "_parent", nil)
    rawset(self, "_destroyed", false)
    rawset(self, "_signals", {})
    return setmetatable(self, Instance_mt)
end

local function getChildren(self)
    return table.clone(rawget(self, "_children"))
end

local function findFirstChild(self, name, recursive)
    for _, c in ipairs(rawget(self, "_children")) do
        if c.Name == name then return c end
    end
    if recursive then
        for _, c in ipairs(rawget(self, "_children")) do
            local hit = findFirstChild(c, name, true)
            if hit then return hit end
        end
    end
    return nil
end

-- WaitForChild yields on the virtual clock. If nothing ever arrives this raises
-- instead of hanging forever — a hang in CI tells you nothing, an error names
-- the missing child.
local function waitForChild(self, name, timeout)
    local deadline = scheduler.now() + (timeout or 10)
    while true do
        local hit = findFirstChild(self, name)
        if hit then return hit end
        if scheduler.now() >= deadline then
            error(("WaitForChild(%q) timed out under %s"):format(name, tostring(self.Name)), 0)
        end
        scheduler.wait(0.05)
    end
end

local function destroy(self)
    rawset(self, "_destroyed", true)
    for _, c in ipairs(getChildren(self)) do destroy(c) end
    local p = rawget(self, "_parent")
    if p then
        local kids = rawget(p, "_children")
        for i, c in ipairs(kids) do
            if c == self then table.remove(kids, i) break end
        end
    end
    rawset(self, "_parent", nil)
    rawset(self, "_children", {})
end

local function setParent(self, parent)
    local old = rawget(self, "_parent")
    if old then
        local kids = rawget(old, "_children")
        for i, c in ipairs(kids) do
            if c == self then table.remove(kids, i) break end
        end
    end
    rawset(self, "_parent", parent)
    if parent then
        table.insert(rawget(parent, "_children"), self)
        local sig = rawget(parent, "_signals").ChildAdded
        if sig then sig:Fire(self) end
    end
end

local METHODS = {
    GetChildren = getChildren,
    GetDescendants = function(self)
        local out = {}
        local function walk(n)
            for _, c in ipairs(rawget(n, "_children")) do
                table.insert(out, c); walk(c)
            end
        end
        walk(self)
        return out
    end,
    FindFirstChild = findFirstChild,
    FindFirstChildOfClass = function(self, cls)
        for _, c in ipairs(rawget(self, "_children")) do
            if rawget(c, "_class") == cls then return c end
        end
        return nil
    end,
    FindFirstAncestor = function(self, name)
        local p = rawget(self, "_parent")
        while p do
            if p.Name == name then return p end
            p = rawget(p, "_parent")
        end
        return nil
    end,
    WaitForChild = waitForChild,
    Destroy = destroy,
    Remove = destroy,
    IsA = isA,
    ClearAllChildren = function(self)
        for _, c in ipairs(getChildren(self)) do destroy(c) end
    end,
    Clone = function(self)
        local copy = newInstance(rawget(self, "_class"))
        for k, v in pairs(rawget(self, "_props")) do rawget(copy, "_props")[k] = v end
        for _, c in ipairs(rawget(self, "_children")) do
            local cc = METHODS.Clone(c)
            setParent(cc, copy)
        end
        return copy
    end,
    GetAttribute = function(self, k) return rawget(self, "_props")["@" .. k] end,
    SetAttribute = function(self, k, v) rawget(self, "_props")["@" .. k] = v end,
    GetPropertyChangedSignal = function(self, prop)
        local sigs = rawget(self, "_signals")
        local key = "PropChanged_" .. prop
        sigs[key] = sigs[key] or Signal.new(key)
        return sigs[key]
    end,
    SetPrimaryPartCFrame = function(self, c) rawget(self, "_props").PrimaryPartCFrame = c end,
    -- Network ownership is a no-op here, but the call must exist: RollService
    -- hands the ball to the client and warns if that fails.
    SetNetworkOwner = function() end,
    GetNetworkOwner = function() return nil end,
    SetNetworkOwnershipAuto = function() end,
    ApplyImpulse = function() end,
    GetMass = function(self) return 1 end,
    CaptureFocus = function(self) rawget(self, "_props").Focused = true end,
    ReleaseFocus = function(self) rawget(self, "_props").Focused = false end,
    TweenSize = function() end,
    TweenPosition = function() end,
    PivotTo = function(self, c) rawget(self, "_props").Pivot = c end,
}

-- GUI input signals are created on first access. Accessing one is how the
-- client wires its buttons, so they must exist for every GuiObject.
local LAZY_SIGNALS = {
    ChildAdded = true, ChildRemoved = true, Destroying = true,
    AncestryChanged = true, Touched = true, Changed = true,
    Activated = true, MouseButton1Click = true, MouseButton1Down = true,
    MouseButton1Up = true, MouseEnter = true, MouseLeave = true,
    InputBegan = true, InputEnded = true, FocusLost = true, Focused = true,
    TouchTap = true, Ended = true,
    -- Humanoid events. Jumping is how the rolling controller receives the
    -- player's jump on every platform, so it must exist before it is connected.
    Jumping = true, Died = true, Seated = true, StateChanged = true,
    Running = true, FreeFalling = true, Climbing = true,
}

Instance_mt.__index = function(self, key)
    if key == "Parent" then return rawget(self, "_parent") end
    if key == "ClassName" then return rawget(self, "_class") end
    if METHODS[key] then return METHODS[key] end
    -- Signals created up front by the service stubs (Heartbeat, PlayerAdded,
    -- OnServerEvent, CharacterAdded...) live here and must be found before we
    -- fall through to properties or children.
    local existing = rawget(self, "_signals")[key]
    if existing then return existing end
    if LAZY_SIGNALS[key] then
        local sigs = rawget(self, "_signals")
        sigs[key] = sigs[key] or Signal.new(key)
        return sigs[key]
    end
    local props = rawget(self, "_props")
    if props[key] ~= nil then return props[key] end
    -- Fall back to a child by name, exactly like Roblox does.
    local child = findFirstChild(self, key)
    if child then return child end
    return nil
end

-- Roblox keeps Position and CFrame in lockstep: writing either updates the
-- other. Code that sets Position and then reads CFrame (which GoobService does
-- when placing the eyes) depends on that, so the stub has to do it too.
local function linkPositionCFrame(self, key, value, props, env)
    if key == "Position" and value then
        props.CFrame = env.CFrame.new(value.X, value.Y, value.Z)
    elseif key == "CFrame" and value then
        props.Position = value.Position
    end
end

Instance_mt.__newindex = function(self, key, value)
    if key == "Parent" then setParent(self, value) return end
    local props = rawget(self, "_props")
    props[key] = value
    if key == "Position" or key == "CFrame" then
        linkPositionCFrame(self, key, value, props, env)
    end
    local sigs = rawget(self, "_signals")
    local ps = sigs["PropChanged_" .. key]
    if ps then ps:Fire() end
end

Instance_mt.__tostring = function(self)
    return rawget(self, "_props").Name or rawget(self, "_class")
end

M.newInstance = newInstance

-- ── Remotes ────────────────────────────────────────────────────────────────
-- Every FireClient is recorded so tests can assert on what the server told the
-- client, which is the only way to check the notify/HUD paths headlessly.

M.clientTraffic = {}
M.soundsPlayed = 0

local function makeRemoteEvent(name)
    local r = newInstance("RemoteEvent")
    r.Name = name
    rawget(r, "_signals").OnServerEvent = Signal.new(name .. ".OnServerEvent")
    rawget(r, "_signals").OnClientEvent = Signal.new(name .. ".OnClientEvent")
    -- Record the remote's CURRENT name, not the one it had at construction.
    -- Net.init creates every remote as Instance.new("RemoteEvent") and renames
    -- it afterwards, so capturing the constructor argument logged all twelve
    -- remotes as "RemoteEvent" and made every assertion unfindable.
    local function label() return rawget(r, "_props").Name end
    rawget(r, "_props").FireClient = function(_, player, ...)
        table.insert(M.clientTraffic, { remote = label(), player = player, args = table.pack(...) })
    end
    rawget(r, "_props").FireAllClients = function(_, ...)
        table.insert(M.clientTraffic, { remote = label(), player = "ALL", args = table.pack(...) })
    end
    -- Roblox prepends the calling player to every OnServerEvent handler. The
    -- harness originally did not, and the server-side tests compensated by
    -- passing a player manually — which hid the discrepancy until the REAL
    -- client code ran and its handlers started receiving a tier id where they
    -- expected a Player. Tests that need to act as a specific player use
    -- fireAs() below instead.
    rawget(r, "_props").FireServer = function(_, ...)
        rawget(r, "_signals").OnServerEvent:Fire(M.getLocalPlayer(), ...)
    end
    return r
end

-- Set by roblox_services once a LocalPlayer exists.
M.getLocalPlayer = function() return nil end

-- Test helper: fire a remote AS a given player, bypassing LocalPlayer. This is
-- what scenario files use to drive several players from one process.
function M.fireAs(remote, player, ...)
    rawget(remote, "_signals").OnServerEvent:Fire(player, ...)
end

local function makeRemoteFunction(name)
    local r = newInstance("RemoteFunction")
    r.Name = name
    rawget(r, "_props").InvokeServer = function(_, ...)
        local fn = rawget(r, "_props").OnServerInvoke
        if not fn then error("no OnServerInvoke on " .. rawget(r, "_props").Name, 0) end
        -- Roblox ALWAYS passes the calling player as the first argument to
        -- OnServerInvoke. Omitting it made every handler receive nil where it
        -- expected a Player, which is not a bug the real engine can produce.
        return fn(M.getLocalPlayer(), ...)
    end
    return r
end

-- Sounds need Play/Stop; the client creates three at startup and plays them on
-- catches, rare drops and gulps.
local function makeSound()
    local snd = newInstance("Sound")
    rawget(snd, "_props").Play = function(self) M.soundsPlayed += 1 end
    rawget(snd, "_props").Stop = function() end
    rawget(snd, "_props").Destroy = METHODS.Destroy
    rawget(snd, "_signals").Ended = Signal.new("Ended")
    return snd
end

local function makeSound2() return makeSound() end

local function makeBindableEvent()
    local b = newInstance("BindableEvent")
    local sig = Signal.new("BindableEvent.Event")
    rawget(b, "_signals").Event = sig
    rawget(b, "_props").Fire = function(_, ...) sig:Fire(...) end
    return b
end

local function makeBindableFunction()
    local b = newInstance("BindableFunction")
    rawget(b, "_props").Invoke = function(_, ...)
        local fn = rawget(b, "_props").OnInvoke
        if not fn then error("no OnInvoke", 0) end
        return fn(...)
    end
    return b
end

-- Instance.new must produce remotes and bindables with their signals wired.
M.Instance = {
    new = function(className, parent)
        local inst
        if className == "RemoteEvent" then inst = makeRemoteEvent("RemoteEvent")
        elseif className == "RemoteFunction" then inst = makeRemoteFunction("RemoteFunction")
        elseif className == "BindableEvent" then inst = makeBindableEvent()
        elseif className == "Sound" then inst = makeSound()
        elseif className == "BindableFunction" then inst = makeBindableFunction()
        else inst = newInstance(className) end
        if parent then setParent(inst, parent) end
        return inst
    end,
}

return M
