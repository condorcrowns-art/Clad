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

local function newInstance(className)
    local self = {}
    rawset(self, "_class", className)
    rawset(self, "_props", { Name = className, Archivable = true })
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
    PivotTo = function(self, c) rawget(self, "_props").Pivot = c end,
}

local LAZY_SIGNALS = {
    ChildAdded = true, ChildRemoved = true, Destroying = true,
    AncestryChanged = true, Touched = true, Changed = true,
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
    rawget(r, "_props").FireServer = function(_, ...)
        rawget(r, "_signals").OnServerEvent:Fire(...)
    end
    return r
end

local function makeRemoteFunction(name)
    local r = newInstance("RemoteFunction")
    r.Name = name
    rawget(r, "_props").InvokeServer = function(_, ...)
        local fn = rawget(r, "_props").OnServerInvoke
        if not fn then error("no OnServerInvoke on " .. name, 0) end
        return fn(...)
    end
    return r
end

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
        elseif className == "BindableFunction" then inst = makeBindableFunction()
        else inst = newInstance(className) end
        if parent then setParent(inst, parent) end
        return inst
    end,
}

return M
