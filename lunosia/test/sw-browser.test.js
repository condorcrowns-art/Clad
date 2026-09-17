/* The service worker, driven through a real install, a real deploy and a real
 * disconnection.
 *
 * This is the only part of the app whose failures are invisible while you are
 * building it: everything works on a fast connection whether or not the cache
 * is right. What it costs is paid later, by the person on a train, or on a
 * phone plan, after a release they did not ask for.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml',
  '.txt': 'text/plain' };

/* A server that counts what it is actually asked for, so "was it re-downloaded"
 * is a measurement rather than an opinion. Serves the app, and answers
 * /api/chat the way the deployed Pages Function does. */
function serve(port) {
  const hits = {};
  const srv = http.createServer((req, res) => {
    const p = req.url.split('?')[0];
    hits[p] = (hits[p] || 0) + 1;
    if (p === '/api/chat') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ available: true, models: ['x'] }));
    }
    if (p === '/api/speak') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ available: true, engine: 'x' }));
    }
    const file = path.join(ROOT, p === '/' ? 'index.html' : p.slice(1));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end('no');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise(r => srv.listen(port, () => r({ srv, hits })));
}

const BASE = 'http://localhost:8791';

(async () => {
  const { srv, hits } = await serve(8791);
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await b.newContext();
  const page = await ctx.newPage();

  const settle = async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForTimeout(2500);
  };

  console.log('\nFirst visit\n');
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await settle();

  // The dictionary used to need a second visit before it was cached at all,
  // because on the first one the worker is not yet controlling the page.
  const cached = () => page.evaluate(async () => {
    const out = [];
    for (const n of await caches.keys())
      out.push(...(await (await caches.open(n)).keys()).map(r => n + ' ' + new URL(r.url).pathname));
    return out;
  });
  let c = await cached();
  // The app shell specifically — guides/index.html is cached too and matches a
  // looser pattern.
  check('the shell is cached', c.some(x => /\s\/index\.html$/.test(x)),
    c.filter(x => /index\.html/.test(x)).join(', '));
  check('the dictionary is cached on the FIRST visit',
    c.some(x => /dict-es\.json/.test(x)), c.filter(x => /dict/.test(x)).join(', ') || 'not cached');
  check('it is kept apart from the shell',
    c.some(x => /^lunosia-data.*dict-es/.test(x)), c.filter(x => /dict/.test(x)).join(', '));

  // A cached probe would let the app insist an AI partner — or the hosted
  // voice — exists long after the binding was removed, or deny one long
  // after it was added.
  await page.evaluate(() => Promise.all([
    fetch('/api/chat').then(r => r.json()).catch(() => null),
    fetch('/api/speak').then(r => r.json()).catch(() => null)
  ]));
  await page.waitForTimeout(400);
  check('neither API probe is ever cached', !(await cached()).some(x => /\/api\//.test(x)),
    (await cached()).filter(x => /api/.test(x)).join(', '));

  console.log('\nA deploy lands\n');
  const dictBefore = hits['/js/data/dict-es.json'] || 0;
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'sw.js'), sw.replace(/lunosia-v(\d+)/, 'lunosia-v999'));
  try {
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update()));
    await page.waitForTimeout(2500);
    await page.reload({ waitUntil: 'networkidle' });
    await settle();

    const names = await page.evaluate(() => caches.keys());
    check('the new shell cache replaces the old one',
      names.indexOf('lunosia-v999') !== -1 && names.indexOf('lunosia-v3') === -1, names.join(', '));
    check('the dictionary cache survives the deploy',
      names.some(n => /^lunosia-data/.test(n)), names.join(', '));

    // The measurement that matters: a release must not cost 1.5 MB of someone's
    // mobile data for a file that did not change.
    const dictAfter = hits['/js/data/dict-es.json'] || 0;
    check('the 1.5 MB dictionary is not re-downloaded by the release',
      dictAfter - dictBefore <= 1, 'fetched ' + (dictAfter - dictBefore) + ' more time(s)');
  } finally {
    fs.writeFileSync(path.join(ROOT, 'sw.js'), sw);
  }

  console.log('\nOffline\n');
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  check('the app still loads with no network',
    await page.locator('#nav').count() > 0 || await page.locator('.onboard').count() > 0);
  const dictWorks = await page.evaluate(async () => {
    try { const r = await fetch('js/data/dict-es.json'); const j = await r.json();
      return !!(j && Object.keys(j).length); } catch (e) { return false; }
  });
  check('and the dictionary is there', dictWorks);
  await ctx.setOffline(false);

  await b.close();
  srv.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll service worker checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
