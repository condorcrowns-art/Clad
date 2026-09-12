// integration.mjs — boot the real GULP A GOOB server scripts headlessly.
//
// Builds the DataModel the same shape Rojo/build_place.py produce, registers
// each source file as a ModuleScript/Script with its own `script` upvalue, then
// runs a scenario file. This executes the real server code — no reimplementation.
import { Lua } from '@luau-rs/luau';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? '..';
const SCENARIO = process.argv[3] ?? 'integration.luau';
const HERE = path.dirname(new URL(import.meta.url).pathname);

const read = p => readFileSync(p, 'utf8');
const luaus = dir => readdirSync(path.join(ROOT, 'src', dir))
  .filter(f => f.endsWith('.luau'))
  .map(f => ({ file: f, name: f.replace(/\.(server|client)?\.?luau$/, ''), src: read(path.join(ROOT, 'src', dir, f)) }));

const shared = luaus('shared');
const server = luaus('server');
const client = luaus('client');

// Harness modules are required by plain string; game modules by Instance.
const harness = ['roblox_env', 'roblox_game', 'roblox_services', 'geometry']
  .map(n => ({ name: n, src: read(path.join(HERE, n + '.luau')) }));

let code = `
local _harness, _loaded = {}, {}
local _rawrequire = require
function _hreg(n, f) _harness[n] = f end
`;
for (const h of harness) {
  code += `\n_hreg("${h.name}", function()\n${h.src}\nend)\n`;
}

code += `
-- Bootstrap: harness modules require each other by string.
function require(target)
  if type(target) == "string" then
    if _loaded[target] then return _loaded[target] end
    local f = _harness[target]
    if not f then error("harness module not found: " .. target, 0) end
    local v = f()
    _loaded[target] = v
    return v
  end
  -- A ModuleScript Instance: run its loader once, cache on the instance.
  local cached = rawget(target, "_moduleResult")
  if cached ~= nil then return cached end
  local loader = rawget(target, "_moduleLoader")
  if not loader then
    error("require(): not a ModuleScript -> " .. tostring(target), 0)
  end
  local v = loader(target)
  rawset(target, "_moduleResult", v)
  return v
end

local env = require("roblox_env")
local rgame = require("roblox_game")
local svc = require("roblox_services")

-- Install Roblox globals.
Vector3, CFrame, Color3, UDim, UDim2 = env.Vector3, env.CFrame, env.Color3, env.UDim, env.UDim2
Vector2 = env.Vector2
time = function() return env.scheduler.now() end
elapsedTime = time
tick = function() return 1700000000 + env.scheduler.now() end
TweenInfo, BrickColor, Enum = env.TweenInfo, env.BrickColor, env.Enum
Random = env.Random
RaycastParams = env.RaycastParams
PhysicalProperties = env.PhysicalProperties
NumberSequence = env.NumberSequence
ColorSequence = env.ColorSequence
NumberSequenceKeypoint = env.NumberSequenceKeypoint
ColorSequenceKeypoint = env.ColorSequenceKeypoint
NumberRange = env.NumberRange
Instance = rgame.Instance
game = svc.game
workspace = svc.Workspace
task = {
  spawn = env.scheduler.spawn,
  wait  = env.scheduler.wait,
  delay = env.scheduler.delay,
  defer = function(fn, ...) return env.scheduler.delay(0, fn, ...) end,
}
wait = env.scheduler.wait
local _osclock = os.clock
os = setmetatable({
  time  = function() return math.floor(1700000000 + env.scheduler.now()) end,
  clock = function() return env.scheduler.now() end,
  date  = function() return "sim" end,
}, { __index = { clock = _osclock } })

_G.SVC = svc
_G.ENV = env
_G.TRAFFIC = rgame.clientTraffic
_G.PARTICLES = function() return rgame.particlesEmitted end

-- Build the instance tree.
local function moduleInstance(class, name, loader)
  local inst = rgame.newInstance(class)
  inst.Name = name
  rawset(inst, "_moduleLoader", loader)
  return inst
end
_G.moduleInstance = moduleInstance
`;

// Register shared modules under ReplicatedStorage.GoobShared
code += `
local sharedFolder = Instance.new("Folder")
sharedFolder.Name = "GoobShared"
sharedFolder.Parent = game:GetService("ReplicatedStorage")
`;
for (const m of shared) {
  code += `\ndo local m = moduleInstance("ModuleScript", "${m.name}", function(script)\n${m.src}\nend) m.Parent = sharedFolder end\n`;
}

// Server: init.server.luau becomes the Script "GoobServer"; siblings are children.
const init = server.find(m => m.file === 'init.server.luau');
const others = server.filter(m => m.file !== 'init.server.luau');
code += `
local serverScript = rgame.newInstance("Script")
serverScript.Name = "GoobServer"
serverScript.Parent = game:GetService("ServerScriptService")
_G.SERVER_SCRIPT = serverScript
`;
for (const m of others) {
  code += `\ndo local m = moduleInstance("ModuleScript", "${m.name}", function(script)\n${m.src}\nend) m.Parent = serverScript end\n`;
}
code += `
-- Scenario files reach the game's shared modules through here. A bare
-- require("Pit") hits the harness module table instead, which only holds the
-- stub engine.
_G.SHARED = function(name)
  return require(sharedFolder:FindFirstChild(name))
end

-- And the SERVER modules, for scenarios that need to reach past the remotes.
-- Used sparingly and on purpose: a test that pokes a profile directly is not
-- testing the path a player takes. It is for reaching a state that would
-- otherwise take an hour of simulated play to earn honestly.
_G.SERVER = function(name)
  return require(serverScript:FindFirstChild(name))
end

_G.BOOT_SERVER = function()
  local script = serverScript
  ${init.src.split('\n').join('\n  ')}
end
`;

// Client: init.client.luau becomes the LocalScript "GoobClient" under
// StarterPlayerScripts, with Theme/Hud/TradeUi as its children — exactly the
// shape Rojo and build_place.py produce.
const cinit = client.find(m => m.file === 'init.client.luau');
const cothers = client.filter(m => m.file !== 'init.client.luau');
code += `
local starterPlayer = rgame.newInstance("StarterPlayer")
starterPlayer.Name = "StarterPlayer"
starterPlayer.Parent = game
local sps = rgame.newInstance("StarterPlayerScripts")
sps.Name = "StarterPlayerScripts"
sps.Parent = starterPlayer
local clientScript = rgame.newInstance("LocalScript")
clientScript.Name = "GoobClient"
clientScript.Parent = sps
`;
for (const m of cothers) {
  code += `\ndo local m = moduleInstance("ModuleScript", "${m.name}", function(script)\n${m.src}\nend) m.Parent = clientScript end\n`;
}
code += `
_G.BOOT_CLIENT = function()
  local script = clientScript
  ${cinit.src.split('\n').join('\n  ')}
end
`;

// Wrap the scenario so a runtime error carries a Luau traceback.
code += `
local _scenario = function()
${read(path.join(HERE, SCENARIO))}
end
local _ok, _err = xpcall(_scenario, function(e)
  return tostring(e) .. "\\n-- traceback --\\n" .. debug.traceback("", 2)
end)
if not _ok then emit("\\nLUA TRACEBACK:\\n" .. tostring(_err)) error(_err, 0) end
`;

const lua = await Lua.create({ sandbox: false });
const out = [];
lua.globals.set('emit', lua.createFunction(s => { out.push(String(s)); }, { args: [String] }));
lua.globals.set('print', lua.createFunction(s => { out.push('[print] ' + String(s)); }, { args: [String] }));
lua.globals.set('warn',  lua.createFunction(s => { out.push('[warn]  ' + String(s)); }, { args: [String] }));

let failed = false;
try {
  lua.execute(code);
} catch (e) {
  failed = true;
  out.push('');
  out.push('╳ RUNTIME ERROR: ' + String(e.message ?? e));
}
console.log(out.join('\n'));
process.exit(failed ? 1 : 0);
