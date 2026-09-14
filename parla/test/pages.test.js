/* The pages a stranger and a crawler see.
 *
 * The app itself is one HTML file that says "Loading…" until thirty thousand
 * lines of JavaScript have run. Everything a person who has never heard of
 * this site reads — what it is, what it does with their data — lives in a
 * handful of static pages that no other test touches, and that nothing in the
 * app links to if a link rots.
 *
 * So: every relative link resolves, every page declares itself, the sitemap
 * matches what is actually served, and the offline cache lists every script
 * index.html loads. The last one is the bug that bites: adding a view and
 * forgetting sw.js leaves the app working online and broken on a plane, which
 * nothing else here would notice.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const SITE = 'https://lunosia.com/';

console.log('\n— The static pages —\n');

check('there is a page explaining the site', PAGES.indexOf('about.html') !== -1, PAGES.join(' '));
check('there is a privacy policy', PAGES.indexOf('privacy.html') !== -1);

PAGES.forEach(page => {
  const html = read(page);

  check(page + ' has a title', /<title>[^<]{10,}<\/title>/.test(html));
  check(page + ' has a description',
    /<meta name="description" content="[^"]{40,}"/.test(html));

  // A canonical pointing at the wrong page is worse than none: it tells the
  // crawler to index the other one instead.
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(html);
  check(page + ' has a canonical URL', !!canon);
  if (canon) {
    const want = page === 'index.html' ? SITE : SITE + page;
    check(page + '  canonical points at itself', canon[1] === want, canon[1]);
  }

  // Every relative href and src has to resolve, or a reader lands on a 404 and
  // a crawler counts it against the site.
  const links = [];
  html.replace(/(?:href|src)="([^"]+)"/g, (_, u) => { links.push(u); return _; });
  links.filter(u => !/^(https?:|mailto:|data:|#)/.test(u)).forEach(u => {
    const target = u.split('#')[0].split('?')[0];
    if (!target) return;
    check(page + '  → ' + target + ' exists', fs.existsSync(path.join(ROOT, target)));
  });

  // Placeholder publisher ids are how you get an AdSense application refused,
  // and a half-wired ad script is worse than no ad script.
  check(page + ' ships no ad script', html.indexOf('adsbygoogle') === -1);
  check(page + ' has no XXXX placeholder left in it', !/ca-pub-X/.test(html));
});

console.log('\n— What a crawler is told —\n');

const robots = read('robots.txt');
check('robots.txt names the sitemap', robots.indexOf(SITE + 'sitemap.xml') !== -1);
// Google renders the page before judging it. Blocking the scripts shows it the
// same empty shell a reader with scripting off gets.
check('robots.txt does not block the scripts', !/Disallow:\s*\/js\//.test(robots));
check('robots.txt does not block the stylesheets', !/Disallow:\s*\/css\//.test(robots));

const sitemap = read('sitemap.xml');
const locs = [];
sitemap.replace(/<loc>([^<]+)<\/loc>/g, (_, u) => { locs.push(u); return _; });
check('the sitemap lists the home page', locs.indexOf(SITE) !== -1);
locs.forEach(u => {
  const rel = u.slice(SITE.length) || 'index.html';
  check('sitemap → ' + rel + ' exists', fs.existsSync(path.join(ROOT, rel)), u);
});
PAGES.forEach(p => {
  const url = p === 'index.html' ? SITE : SITE + p;
  check(p + ' is in the sitemap', locs.indexOf(url) !== -1);
});

console.log('\n— The page with scripting off —\n');

const index = read('index.html');
// There is more than one <noscript> — the first hides the dead app chrome —
// so take the substantial one rather than whichever comes first.
const blocks = [];
index.replace(/<noscript>([\s\S]*?)<\/noscript>/g, (_, b) => { blocks.push(b); return _; });
const nos = blocks.slice().sort((a, b) => b.length - a.length)[0];
check('index.html says something without scripting', !!nos);

// Otherwise the reader gets a streak of zero, a nav whose every button is
// dead, and the word "Loading…" sitting above the explanation forever.
check('  and hides the chrome that will never come alive',
  blocks.some(b => /#app/.test(b) && /display:\s*none/.test(b)));

if (nos) {
  const words = nos.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).length;
  check('  and it is prose, not a one-line apology', words > 80, words + ' words');
  check('  and it sends the reader to the full explanation',
    /href="about\.html"/.test(nos));
}

console.log('\n— The offline cache —\n');

const sw = read('sw.js');
const assets = [];
sw.replace(/'\.\/([^']*)'/g, (_, a) => { assets.push(a); return _; });

PAGES.forEach(p => check(p + ' is cached for offline', assets.indexOf(p) !== -1));

// Every script index.html loads must be in the cache, or the app half-loads
// with no network and the failure is a blank screen with no clue in it.
const scripts = [];
index.replace(/<script src="([^"]+)"/g, (_, s) => { scripts.push(s); return _; });
check('index.html loads a plausible number of scripts', scripts.length > 20, String(scripts.length));
scripts.forEach(s => check('cached: ' + s, assets.indexOf(s) !== -1));

const styles = [];
index.replace(/<link rel="stylesheet" href="([^"]+)"/g, (_, s) => { styles.push(s); return _; });
styles.forEach(s => check('cached: ' + s, assets.indexOf(s) !== -1));

assets.forEach(a => {
  if (!a) return;
  check('cached file exists: ' + a, fs.existsSync(path.join(ROOT, a)));
});

// Browsers keep serving the old cache until the name changes, so a shipped
// change with a stale CACHE name reaches nobody who has visited before.
check('the cache name is versioned', /var CACHE = 'lunosia-v(\d+)'/.test(sw),
  (/var CACHE = '([^']+)'/.exec(sw) || [])[1]);

console.log('\n— The privacy policy matches the app —\n');

const priv = read('privacy.html');
// The hosted partner is on by default here. The policy said the opposite in
// its summary while saying the right thing further down, which is the kind of
// contradiction that makes the whole page untrustworthy.
check('it says the hosted partner is the default', /default on (this|the public) site/i.test(priv));
check('it does not claim you must switch it on yourself',
  !/which you have to switch on yourself/i.test(priv));

['reading', 'listening', 'writing'].forEach(k =>
  check('it mentions what is stored for ' + k, new RegExp(k, 'i').test(priv)));

check('it points at a contact address', /mailto:/.test(priv));
check('the app links to it', /privacy\.html/.test(read('js/views-progress.js')));
check('the app links to the about page', /about\.html/.test(read('js/views-progress.js')));

console.log('\n— Entry animations —\n');

// An animation with fill `both` stays applied after it ends. Every entry
// animation here moves `transform`, and an element with a transform applied is
// a stacking context — which traps any z-index inside it. That is how the word
// panel (z-index 40, inside a bubble) ended up painting behind the microphone
// dock (z-index 20, outside it): visible, readable and unclickable.
//
// `backwards` still hides the element before it starts, which is all the fill
// was for. Every `to` is the element's resting state, so there is nothing the
// fill needs to hold on to at the end.
['css/fiesta.css', 'css/style.css'].forEach(f => {
  const css = read(f);
  const both = [];
  css.replace(/animation:([^;]*\bboth\b[^;]*);/g, (_, a) => { both.push(a.trim()); return _; });
  check(f + ' holds no animation open with fill "both"', both.length === 0, both.join(' / '));
});

console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll page checks passed\n');
process.exit(fail.length ? 1 : 0);
