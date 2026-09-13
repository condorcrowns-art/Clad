import { Lua } from '@luau-rs/luau';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = process.argv[2];
const read = n => readFileSync(`${SRC}/${n}.luau`, 'utf8');

// Minimal Roblox stubs — just enough for the pure-logic modules.
const prelude = `
local function _c3(r,g,b) return {R=r/255,G=g/255,B=b/255} end
Color3 = { fromRGB=_c3, fromHSV=function(h,s,v) return {H=h,S=s,V=v} end, new=function(r,g,b) return {R=r,G=g,B=b} end }
-- Full Vector3: arithmetic, Magnitude and Unit. The previous stub returned a
-- bare table, so any module doing vector maths got nil back from .Magnitude.
local _V3 = {}
_V3.__add = function(a, b) return Vector3.new(a.X + b.X, a.Y + b.Y, a.Z + b.Z) end
_V3.__sub = function(a, b) return Vector3.new(a.X - b.X, a.Y - b.Y, a.Z - b.Z) end
_V3.__unm = function(a) return Vector3.new(-a.X, -a.Y, -a.Z) end
_V3.__mul = function(a, b)
  if type(b) == "number" then return Vector3.new(a.X * b, a.Y * b, a.Z * b) end
  if type(a) == "number" then return Vector3.new(b.X * a, b.Y * a, b.Z * a) end
  return Vector3.new(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
_V3.__div = function(a, b) return Vector3.new(a.X / b, a.Y / b, a.Z / b) end
_V3.__eq = function(a, b) return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
_V3.__index = function(t, k)
  local x, y, z = rawget(t, "X"), rawget(t, "Y"), rawget(t, "Z")
  if k == "Magnitude" then return math.sqrt(x*x + y*y + z*z) end
  if k == "Unit" then
    local m = math.sqrt(x*x + y*y + z*z)
    if m == 0 then return Vector3.new(0, 0, 0) end
    return Vector3.new(x/m, y/m, z/m)
  end
  return rawget(_V3, k)
end
Vector3 = { new = function(x, y, z)
  return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0 }, _V3)
end }
Vector3.zero = Vector3.new(0, 0, 0)
Vector3.one = Vector3.new(1, 1, 1)
local _seed = 12345
Random = { new = function(s)
  local st = (s or 1) % 2147483647
  if st <= 0 then st = st + 2147483646 end
  return {
    NextNumber = function(self, a, b)
      st = (st * 16807) % 2147483647
      local r = st / 2147483647
      if a and b then return a + r*(b-a) end
      return r
    end,
    NextInteger = function(self, a, b)
      st = (st * 16807) % 2147483647
      return a + (st % (b - a + 1))
    end,
  }
end }
-- Permissive Enum stub. tools/apicheck.py already validates every Enum.X.Y
-- against Roblox's real API dump, so re-checking here would be wasted work.
local _enumCache = {}
Enum = setmetatable({}, {
  __index = function(_, enumName)
    if not _enumCache[enumName] then
      _enumCache[enumName] = setmetatable({}, {
        __index = function(_, item) return { EnumType = enumName, Name = item } end,
      })
    end
    return _enumCache[enumName]
  end,
})
UDim = { new = function(s, o) return { Scale = s or 0, Offset = o or 0 } end }
UDim2 = {
  new = function(a, b, c, d) return { X = { Scale = a or 0, Offset = b or 0 },
                                      Y = { Scale = c or 0, Offset = d or 0 } } end,
  fromScale = function(x, y) return UDim2.new(x, 0, y, 0) end,
  fromOffset = function(x, y) return UDim2.new(0, x, 0, y) end,
}
Vector2 = { new = function(x, y) return { X = x or 0, Y = y or 0 } end }

local _modules = {}
local _sources = {}
function _register(name, fn) _sources[name] = fn end
function require(m)
  if type(m) == "table" and m.__name then m = m.__name end
  if _modules[m] then return _modules[m] end
  local fn = _sources[m]
  if not fn then error("no module "..tostring(m)) end
  local v = fn()
  _modules[m] = v
  return v
end
local function _stub(name) return setmetatable({__name=name}, {__index=function(t,k) return setmetatable({__name=k},getmetatable(t)) end}) end
script = { Parent = _stub("Parent") }
`;

// Auto-discover every shared module rather than listing them. A hardcoded
// list silently breaks the moment a new module is added.
const mods = readdirSync(SRC)
  .filter(f => f.endsWith('.luau'))
  .map(f => f.replace(/\.luau$/, ''));
let code = prelude;
for (const m of mods) {
  code += `\n_register("${m}", function()\n local script = {Parent = setmetatable({},{__index=function(_,k) return k end})}\n${read(m)}\nend)\n`;
}
code += `\n${readFileSync(process.argv[3] ?? 'tests.luau','utf8')}\n`;

const lua = await Lua.create({ sandbox: false });
let out = [];
lua.globals.set('emit', lua.createFunction((s) => { out.push(String(s)); }, { args: [String] }));
try {
  lua.execute(code);
} catch (e) {
  console.error('LUA ERROR:', e.message ?? e);
  console.log(out.join('\n'));
  process.exit(1);
}
console.log(out.join('\n'));
