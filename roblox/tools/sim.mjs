import { Lua } from '@luau-rs/luau';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = process.argv[2];
const read = n => readFileSync(`${SRC}/${n}.luau`, 'utf8');

// Minimal Roblox stubs — just enough for the pure-logic modules.
const prelude = `
local function _c3(r,g,b) return {R=r/255,G=g/255,B=b/255} end
Color3 = { fromRGB=_c3, fromHSV=function(h,s,v) return {H=h,S=s,V=v} end, new=function(r,g,b) return {R=r,G=g,B=b} end }
Vector3 = { new=function(x,y,z) return {X=x,Y=y,Z=z} end }
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
