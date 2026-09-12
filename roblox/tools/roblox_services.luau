--!nolint
-- roblox_services.luau — the DataModel and the services GULP A GOOB uses.

local env = require("roblox_env")
local game_ = require("roblox_game")
local Signal = env.Signal
local scheduler = env.scheduler
local newInstance = game_.newInstance

local S = {}
local services = {}

local function service(className)
    if services[className] then return services[className] end
    local inst = newInstance(className)
    inst.Name = className
    services[className] = inst
    return inst
end

-- ── Workspace / Lighting / storage ─────────────────────────────────────────
local Workspace = service("Workspace")
local Lighting = service("Lighting")
local ReplicatedStorage = service("ReplicatedStorage")
local ServerScriptService = service("ServerScriptService")
local ServerStorage = service("ServerStorage")
local SoundService = service("SoundService")

-- ── RunService ─────────────────────────────────────────────────────────────
local RunService = service("RunService")
rawget(RunService, "_signals").Heartbeat = Signal.new("Heartbeat")
rawget(RunService, "_signals").Stepped = Signal.new("Stepped")
rawget(RunService, "_signals").RenderStepped = Signal.new("RenderStepped")
-- Flipped by S.enterClientMode() so the same DataModel can host both halves.
S.clientMode = false
rawget(RunService, "_props").IsServer = function() return not S.clientMode end
rawget(RunService, "_props").IsClient = function() return S.clientMode end
rawget(RunService, "_props").IsStudio = function() return S.studio end
rawget(RunService, "_props").IsRunning = function() return true end
S.studio = false

-- ── Players ────────────────────────────────────────────────────────────────
local Players = service("Players")
rawget(Players, "_signals").PlayerAdded = Signal.new("PlayerAdded")
rawget(Players, "_signals").PlayerRemoving = Signal.new("PlayerRemoving")
local roster = {}

rawget(Players, "_props").GetPlayers = function() return table.clone(roster) end
rawget(Players, "_props").GetPlayerByUserId = function(_, id)
    for _, p in ipairs(roster) do if p.UserId == id then return p end end
    return nil
end
rawget(Players, "_props").FindFirstChild = function(_, name)
    for _, p in ipairs(roster) do if p.Name == name then return p end end
    return nil
end

S.kicked = {}

-- Build a player with a character standing at `pos`.
function S.addPlayer(name, userId, pos)
    local p = newInstance("Player")
    p.Name = name
    rawget(p, "_props").DisplayName = name
    rawget(p, "_props").UserId = userId
    rawget(p, "_props").Kick = function(_, reason)
        table.insert(S.kicked, { player = name, reason = reason })
    end
    rawget(p, "_signals").CharacterAdded = Signal.new("CharacterAdded")

    local char = newInstance("Model")
    char.Name = name
    local root = newInstance("Part")
    root.Name = "HumanoidRootPart"
    root.Position = pos or env.Vector3.new(0, 5, 0)
    root.CFrame = env.CFrame.new(root.Position.X, root.Position.Y, root.Position.Z)
    root.Parent = char
    local hum = newInstance("Humanoid")
    hum.Parent = char
    char.Parent = Workspace
    rawget(p, "_props").Character = char

    local pg = newInstance("Folder")
    pg.Name = "PlayerGui"
    pg.Parent = p

    table.insert(roster, p)
    p.Parent = Players
    rawget(Players, "_signals").PlayerAdded:Fire(p)
    return p
end

function S.movePlayer(p, pos)
    local root = p.Character:FindFirstChild("HumanoidRootPart")
    root.Position = pos
    root.CFrame = env.CFrame.new(pos.X, pos.Y, pos.Z)
end

function S.removePlayer(p)
    for i, q in ipairs(roster) do if q == p then table.remove(roster, i) break end end
    rawget(Players, "_signals").PlayerRemoving:Fire(p)
end

-- ── Camera / viewport ──────────────────────────────────────────────────────
-- The whole mobile pass depends on being able to resize the screen and watch
-- the UI respond, so ViewportSize is a real property with a change signal.
local camera = newInstance("Camera")
camera.Name = "Camera"
camera.ViewportSize = env.Vector2.new(1280, 720)
camera.Parent = Workspace
rawget(Workspace, "_props").CurrentCamera = camera
S.camera = camera

function S.setViewport(w, h)
    camera.ViewportSize = env.Vector2.new(w, h)
    local sig = rawget(camera, "_signals")["PropChanged_ViewportSize"]
    if sig then sig:Fire() end
end

-- ── GuiService ─────────────────────────────────────────────────────────────
-- The Roblox top bar occupies the first ~36px of the screen. A ScreenGui with
-- IgnoreGuiInset = true draws underneath it.
local GuiService = service("GuiService")
S.topInset = 36
rawget(GuiService, "_props").GetGuiInset = function()
    return env.Vector2.new(0, S.topInset), env.Vector2.new(0, 0)
end

-- ── UserInputService ───────────────────────────────────────────────────────
local UserInputService = service("UserInputService")
for _, n in ipairs({ "InputBegan", "InputEnded", "InputChanged", "TouchTap" }) do
    rawget(UserInputService, "_signals")[n] = Signal.new(n)
end
rawget(UserInputService, "_props").GetMouseLocation = function() return env.Vector2.new(0, 0) end
rawget(UserInputService, "_props").TouchEnabled = false
rawget(UserInputService, "_props").KeyboardEnabled = true
rawget(UserInputService, "_props").MouseEnabled = true
S.UserInputService = UserInputService

function S.setTouch(on)
    rawget(UserInputService, "_props").TouchEnabled = on
    rawget(UserInputService, "_props").KeyboardEnabled = not on
    rawget(UserInputService, "_props").MouseEnabled = not on
end

service("ContextActionService")

-- ── TweenService ───────────────────────────────────────────────────────────
-- Tweens apply their target properties immediately. That is not animation, but
-- it DOES exercise every property name in the goal table — a typo there becomes
-- a visible wrong value instead of a silent no-op.
local TweenService = service("TweenService")
rawget(TweenService, "_props").Create = function(_, inst, info, goal)
    return {
        Completed = Signal.new("TweenCompleted"),
        Play = function(self)
            for k, v in pairs(goal) do inst[k] = v end
            self.Completed:Fire()
        end,
        Cancel = function() end,
        Pause = function() end,
    }
end

-- ── Debris ─────────────────────────────────────────────────────────────────
local Debris = service("Debris")
rawget(Debris, "_props").AddItem = function(_, inst, after)
    scheduler.delay(after or 0, function()
        if inst and inst.Destroy then inst:Destroy() end
    end)
end

-- ── HttpService ────────────────────────────────────────────────────────────
local HttpService = service("HttpService")
local guidCounter = 0
rawget(HttpService, "_props").GenerateGUID = function()
    guidCounter += 1
    return ("GUID-%08d"):format(guidCounter)
end
rawget(HttpService, "_props").JSONEncode = function(_, v) return tostring(v) end

-- ── TextService ────────────────────────────────────────────────────────────
-- Returns the text unchanged but through the real two-call shape, so a wrong
-- method name on the result still fails here.
local TextService = service("TextService")
S.filterShouldFail = false
rawget(TextService, "_props").FilterStringAsync = function(_, text)
    if S.filterShouldFail then error("filter unavailable", 0) end
    return {
        GetNonChatStringForBroadcastAsync = function() return text end,
        GetChatForUserAsync = function() return text end,
    }
end

-- ── DataStoreService ───────────────────────────────────────────────────────
local DataStoreService = service("DataStoreService")
S.stores = {}
S.datastoreShouldFail = false
S.datastoreCalls = { get = 0, update = 0 }

rawget(DataStoreService, "_props").GetDataStore = function(_, name)
    S.stores[name] = S.stores[name] or {}
    local data = S.stores[name]
    return {
        GetAsync = function(_, key)
            S.datastoreCalls.get += 1
            if S.datastoreShouldFail then error("DataStore request failed", 0) end
            return data[key]
        end,
        SetAsync = function(_, key, value)
            if S.datastoreShouldFail then error("DataStore request failed", 0) end
            data[key] = value
        end,
        UpdateAsync = function(_, key, fn)
            S.datastoreCalls.update += 1
            if S.datastoreShouldFail then error("DataStore request failed", 0) end
            data[key] = fn(data[key])
            return data[key]
        end,
    }
end

-- ── game ───────────────────────────────────────────────────────────────────
local gameInst = newInstance("DataModel")
gameInst.Name = "game"
for _, inst in pairs(services) do inst.Parent = gameInst end

rawget(gameInst, "_props").GetService = function(_, className)
    local svc = services[className]
    if not svc then
        error(("GetService(%q): this harness does not stub that service"):format(className), 0)
    end
    return svc
end
S.bindToCloseHandlers = {}
rawget(gameInst, "_props").BindToClose = function(_, fn)
    table.insert(S.bindToCloseHandlers, fn)
end

S.game = gameInst
S.services = services
S.Workspace = Workspace
S.Players = Players
S.ReplicatedStorage = ReplicatedStorage
S.ServerScriptService = ServerScriptService
S.RunService = RunService
S.Lighting = Lighting

-- Fire a named remote as a specific player. Scenario files use this instead of
-- :FireServer so they can drive multiple players from one process.
function S.fireAs(remoteName, player, ...)
    local net = ReplicatedStorage:FindFirstChild("GoobNet")
    local remote = net and net:FindFirstChild(remoteName)
    if not remote then error("no remote named " .. tostring(remoteName), 0) end
    game_.fireAs(remote, player, ...)
end

function S.heartbeat(dt)
    rawget(RunService, "_signals").Heartbeat:Fire(dt)
end

-- The client half runs on RenderStepped, so tests must pump both.
function S.renderStep(dt)
    rawget(RunService, "_signals").RenderStepped:Fire(dt)
end

-- Promote a player to LocalPlayer and switch RunService into client mode.
function S.enterClientMode(player)
    S.clientMode = true
    rawget(Players, "_props").LocalPlayer = player
    game_.getLocalPlayer = function() return player end
end

function S.exitClientMode()
    S.clientMode = false
end

return S
