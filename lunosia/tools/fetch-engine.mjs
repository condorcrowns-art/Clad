/* Fetches the vendored inference engine from npm at pinned versions.
 *
 * These two files are third-party build output totalling ~26 MB, so they are
 * not committed. Keeping them out of git also avoids a false positive from
 * GitHub's secret scanner, which reads the string "Mistral3ForConditional-
 * Generation" in transformers.js's model registry as a Mistral API key.
 *
 * Run: node tools/fetch-engine.mjs   (or npm run setup)
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TRANSFORMERS = '@huggingface/transformers@4.2.0';
const ORT = 'onnxruntime-web@1.26.0-dev.20260416-b7804b056c';

const WANT = [
  { pkg: TRANSFORMERS, from: 'dist/transformers.web.js',            to: 'lib/transformers.js' },
  { pkg: TRANSFORMERS, from: 'dist/ort-wasm-simd-threaded.jsep.mjs', to: 'lib/ort/ort-wasm-simd-threaded.jsep.mjs' },
  { pkg: ORT,          from: 'dist/ort-wasm-simd-threaded.jsep.wasm', to: 'lib/ort/ort-wasm-simd-threaded.jsep.wasm' }
];

if (WANT.every((w) => existsSync(w.to)) && !process.argv.includes('--force')) {
  console.log('Engine already present. Re-run with --force to refresh.');
  process.exit(0);
}

const work = join(tmpdir(), 'lunosia-engine-' + Date.now());
mkdirSync(work, { recursive: true });
mkdirSync('lib/ort', { recursive: true });

const fetched = new Set();
try {
  for (const w of WANT) {
    if (!fetched.has(w.pkg)) {
      console.log('fetching ' + w.pkg + ' …');
      const tgz = execFileSync('npm', ['pack', w.pkg, '--silent'], { cwd: work, encoding: 'utf8' }).trim();
      execFileSync('tar', ['xzf', tgz], { cwd: work });
      // npm pack always unpacks to package/; move it aside so the next one is clean.
      execFileSync('mv', ['package', 'pkg_' + fetched.size], { cwd: work });
      fetched.add(w.pkg);
    }
    const slot = 'pkg_' + [...fetched].indexOf(w.pkg);
    copyFileSync(join(work, slot, w.from), w.to);
    console.log(`  ${w.to}  (${(statSync(w.to).size / 1048576).toFixed(1)} MB)`);
  }
  console.log('\nEngine ready. Load the folder at chrome://extensions → Load unpacked.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
