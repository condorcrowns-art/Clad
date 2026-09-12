import { Lua } from '@luau-rs/luau';
import { readFileSync } from 'node:fs';
const lua = await Lua.create({ sandbox: true });
try { await lua.compile(readFileSync(process.argv[2],'utf8'), { chunkName: 'f' }); console.log('ok'); }
catch (e) { console.log(String(e.message ?? e).split('\n').slice(0,12).join('\n')); }
