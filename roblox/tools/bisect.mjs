// Find the first line at which the file stops parsing, by compiling prefixes.
import { Lua } from '@luau-rs/luau';
import { readFileSync } from 'node:fs';
const lua = await Lua.create({ sandbox: true });
const lines = readFileSync(process.argv[2], 'utf8').split('\n');
let lastGood = 0;
for (let i = 1; i <= lines.length; i++) {
  const chunk = lines.slice(0, i).join('\n');
  let ok = true;
  try { await lua.compile(chunk, { chunkName: 'f' }); } catch { ok = false; }
  // An incomplete block legitimately fails, so we only report the LAST line
  // that ever parsed cleanly — everything after it never recovers.
  if (ok) lastGood = i;
}
console.log('last line that parsed cleanly:', lastGood);
console.log('--- context ---');
for (let i = Math.max(0, lastGood - 3); i < Math.min(lines.length, lastGood + 14); i++) {
  console.log(String(i + 1).padStart(4), lines[i]);
}
