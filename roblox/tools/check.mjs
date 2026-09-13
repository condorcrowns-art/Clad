import { Lua } from '@luau-rs/luau';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

const files = process.argv.slice(2);
const lua = await Lua.create({ sandbox: true });

let failed = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  try {
    // compile() surfaces syntax errors; it does not run the code.
    await lua.compile(src, { chunkName: path.basename(f) });
    console.log(`  OK    ${f}  (${src.split('\n').length} lines)`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  ${f}`);
    console.log(`        ${String(e.message ?? e).split('\n').join('\n        ')}`);
  }
}
console.log(failed === 0 ? `\nAll ${files.length} files compile cleanly.` : `\n${failed}/${files.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
