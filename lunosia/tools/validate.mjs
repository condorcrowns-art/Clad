/* Pre-load sanity check.
 *
 * Chrome reports extension problems as a single unhelpful red box, and only
 * after you have already clicked Load Unpacked. This catches the usual causes
 * first: a manifest pointing at a file that does not exist, an import path that
 * does not resolve, or a stray remote <script> that MV3's CSP will silently
 * refuse to run. Run: node tools/validate.mjs
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

let errors = 0, warns = 0;
const bad = (m) => { console.error('  FAIL  ' + m); errors++; };
const warn = (m) => { console.warn('  warn  ' + m); warns++; };
const ok = (m) => console.log('  ok    ' + m);

const must = (p, why) => existsSync(p) ? ok(`${why}: ${p}`) : bad(`${why} missing: ${p}`);

/* ---- manifest ---- */
console.log('manifest');
const mf = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (mf.manifest_version !== 3) bad('manifest_version must be 3');
else ok('manifest v3');

must(mf.background.service_worker, 'service worker');
must(mf.side_panel.default_path, 'side panel');
for (const [size, p] of Object.entries(mf.icons)) must(p, `icon ${size}`);
for (const p of Object.values(mf.action.default_icon)) must(p, 'action icon');

const csp = mf.content_security_policy?.extension_pages || '';
if (!csp.includes("'wasm-unsafe-eval'")) bad("CSP needs 'wasm-unsafe-eval' or onnxruntime cannot start");
else ok("CSP allows wasm");
if (/https?:\/\//.test(csp.replace(/'[^']*'/g, ''))) warn('CSP references a remote origin');

for (const need of ['offscreen', 'tabCapture', 'sidePanel', 'storage', 'downloads']) {
  if (!mf.permissions.includes(need)) bad('missing permission: ' + need);
}
ok('permissions: ' + mf.permissions.join(', '));

/* ---- html references ---- */
console.log('\nhtml references');
for (const html of ['sidepanel.html', 'offscreen.html']) {
  const src = readFileSync(html, 'utf8');
  const base = dirname(resolve(html));

  for (const m of src.matchAll(/<script[^>]*src=["']([^"']+)["']/g)) {
    if (/^https?:/i.test(m[1])) bad(`${html} loads a remote script (${m[1]}) — MV3 forbids this`);
    else must(join(base, m[1]).replace(process.cwd() + '/', ''), `${html} script`);
  }
  for (const m of src.matchAll(/<link[^>]*href=["']([^"']+)["']/g)) {
    if (/^https?:/i.test(m[1])) bad(`${html} loads a remote stylesheet (${m[1]})`);
    else must(join(base, m[1]).replace(process.cwd() + '/', ''), `${html} stylesheet`);
  }
  if (/on(click|load|change)\s*=/.test(src)) bad(`${html} has an inline event handler — CSP blocks these`);
}

/* ---- element ids referenced by panel.js must exist in the html ---- */
console.log('\npanel ids');
const html = readFileSync('sidepanel.html', 'utf8');
const declared = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
const panel = readFileSync('src/panel.js', 'utf8');
const used = new Set([...panel.matchAll(/\$\(['"]([A-Za-z0-9_]+)['"]\)/g)].map((m) => m[1]));
const missing = [...used].filter((id) => !declared.has(id));
if (missing.length) bad('panel.js references ids not in the html: ' + missing.join(', '));
else ok(`${used.size} element ids all resolve`);

/* ---- es module graph ---- */
/* Whether the fetched-not-committed engine is on disk. The module walker needs
 * this so an un-fetched engine is reported once, by the section that can
 * actually tell you what to do about it, rather than twice. */
const ENGINE = ['lib/transformers.js', 'lib/ort/ort-wasm-simd-threaded.jsep.wasm'];
const engineHere = ENGINE.every(existsSync);

console.log('\nmodule imports');
const roots = ['src/panel.js', 'worker/asr-worker.js', 'src/export.js', 'src/store.js', 'src/format.js'];
const seen = new Set();
function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  if (!existsSync(file)) {
    // A missing engine file is the setup step, not a broken import.
    if (ENGINE.includes(file)) return;
    return bad('import target missing: ' + file);
  }
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    walk(join(dirname(file), m[1]));
  }
}
roots.forEach(walk);
ok(`${seen.size} modules resolve cleanly`);

/* ---- vendored engine ---- */
/* The engine is fetched, not committed, so a fresh clone legitimately does not
 * have it yet. That is a "run npm run setup" situation, not broken code — say
 * so instead of dying on an unhandled ENOENT, and keep checking everything
 * that does not depend on the files being present. */
console.log('\nvendored engine');
if (!engineHere) {
  warn('inference engine not fetched yet — run: npm run setup');
  for (const f of ENGINE) if (!existsSync(f)) console.warn('          missing ' + f);
} else {
  for (const f of ENGINE) ok('present: ' + f);
  const wasmMb = statSync('lib/ort/ort-wasm-simd-threaded.jsep.wasm').size / 1048576;
  ok(`wasm binary is ${wasmMb.toFixed(1)} MB (ships offline, no CDN at runtime)`);
}

/* This one is about the source, not the download, so it always runs. */
if (!readFileSync('worker/asr-worker.js', 'utf8').includes('wasmPaths')) {
  bad('asr-worker must point env.backends.onnx.wasm.wasmPaths at the vendored wasm');
} else ok('wasmPaths pinned to the extension bundle');

/* ---- the privacy promise ---- */
console.log('\nprivacy invariants');
/* Strip comments first. The worker deliberately *names* the cloud API in a
 * comment explaining why it is not used, and a naive scan reads that as a
 * violation of the very rule the comment is documenting. */
const decomment = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const all = ['sw.js','offscreen.js','src/panel.js','src/store.js','src/export.js','worker/asr-worker.js']
  .map((f) => [f, decomment(readFileSync(f, 'utf8'))]);
for (const [f, src] of all) {
  if (/webkitSpeechRecognition|SpeechRecognition\b/.test(src)) {
    bad(`${f} uses the browser SpeechRecognition API, which uploads audio to Google`);
  }
  for (const m of src.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) {
    const host = m[0];
    const allowed = /huggingface\.co|xethub\.hf\.co|127\.0\.0\.1|localhost|amara\.org/.test(host);
    if (!allowed) warn(`${f} mentions ${host}`);
  }
}
ok('no cloud speech API in the codebase');

console.log(`\n${errors} errors, ${warns} warnings`);
process.exit(errors ? 1 : 0);
