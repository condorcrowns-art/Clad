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

/* One publisher id, asserted everywhere it appears. It is written two ways —
 * "ca-pub-..." in the script tag and "pub-..." in ads.txt — and mixing them up
 * is silent: the page loads, the file serves, and AdSense quietly treats the
 * inventory as unauthorised. */
const PUBLISHER = 'ca-pub-6431955508681504';

// The only pages substantial enough, by Google's own stated standard, to
// carry a Google-served ad: the app itself and every navigational or
// utility page (index, guides/index, contact, terms, privacy) are excluded
// on purpose. Keep this in sync with the `ads: true` flags in
// tools/build-pages.js — the generator is the source of truth and this list
// is what the test checks it against.
const AD_PAGES = ['about.html',
  'guides/ser-estar.html', 'guides/gender-and-agreement.html',
  'guides/verbs-that-differ.html', 'guides/past-and-subjunctive.html',
  'guides/small-words.html', 'guides/pronunciation.html'];

const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
  .concat(fs.readdirSync(path.join(ROOT, 'guides')).map(f => 'guides/' + f));
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
  // Relative to the page, not to the root: a guide two directories in links to
  // "../about.html", which does not exist at the root and does exist where the
  // browser will look for it.
  const dir = path.dirname(path.join(ROOT, page));
  links.filter(u => !/^(https?:|mailto:|data:|#)/.test(u)).forEach(u => {
    const target = u.split('#')[0].split('?')[0];
    if (!target) return;
    check(page + '  → ' + target + ' exists', fs.existsSync(path.resolve(dir, target)));
  });

  // Google's own review rejected an earlier version of this site for
  // "ads on screens without publisher content... used for alerts,
  // navigation, or other behavioural purposes" — which is what every page
  // here is except the seven listed below. The rule is now the opposite of
  // "every page must carry it": every page must NOT carry it, unless it is
  // one of the pages substantial enough to be "content" by that standard.
  const hasAds = /adsbygoogle\.js\?client=ca-pub-/.test(html);
  if (AD_PAGES.indexOf(page) !== -1) {
    check(page + ' carries the AdSense snippet', hasAds);
    const pub = /client=(ca-pub-[0-9]+)/.exec(html);
    check(page + '  with the right publisher id', pub && pub[1] === PUBLISHER,
      pub ? pub[1] : 'none');
  } else {
    check(page + ' does NOT carry an ad script — it is not a content page', !hasAds);
  }
  check(page + '  no placeholder id left in it', !/ca-pub-(X|YOUR)/i.test(html));
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
  let rel = u.slice(SITE.length) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  check('sitemap → ' + rel + ' exists', fs.existsSync(path.join(ROOT, rel)), u);
});
PAGES.forEach(p => {
  const url = p === 'index.html' ? SITE : SITE + p.replace(/(^|\/)index\.html$/, '$1');
  check(p + ' is in the sitemap', locs.indexOf(url) !== -1, url);
});

console.log('\n— Advertising —\n');

const adsTxt = read('ads.txt');
check('ads.txt names the publisher without the ca- prefix',
  adsTxt.indexOf(PUBLISHER.replace(/^ca-/, '') + ',') !== -1, adsTxt.trim());
check('  and does not carry the ca- form by mistake',
  adsTxt.indexOf('ca-pub-') === -1, adsTxt.trim());
check('  with the DIRECT relationship and Google\'s certification id',
  /,\s*DIRECT,\s*f08c47fec0942fa0/.test(adsTxt), adsTxt.trim());
check('robots.txt does not block ads.txt', !/Disallow:\s*\/ads\.txt/.test(robots));

// A privacy page that says nothing leaves the device, on a site that loads a
// Google script on every page, is not a small inaccuracy — it is the kind that
// gets an advertising account closed.
const priv0 = read('privacy.html');
check('the privacy page discloses the ad script', /AdSense/.test(priv0));
check('  and no longer claims the app makes no request of its own',
  !/no request the app makes on its own\.?<\/p>/.test(priv0));
check('  and links somewhere the reader can opt out',
  /myadcenter\.google\.com|policies\.google\.com\/technologies\/ads/.test(priv0));

console.log('\n— The site is navigable —\n');

/* AdSense, and any reader, judges a site partly on whether it hangs together:
 * whether every page can reach every other and whether anything is an orphan
 * only a sitemap knows about. It is also just how a site should work. */
const WRITTEN = PAGES.filter(p => p !== 'index.html');
WRITTEN.forEach(p => {
  const html = read(p);
  check(p + ' has the site header', /class="site-head"/.test(html));
  check(p + ' has the site footer', /class="site-foot"/.test(html));
  ['about.html', 'contact.html', 'privacy.html', 'terms.html', 'guides/index.html']
    .forEach(t => {
      const leaf = t.split('/').pop();
      check(p + '  can reach ' + t, html.indexOf(leaf) !== -1);
    });
});

// And the app links out, or a stranger who types the address gets a form
// asking their name and no way to find out what any of it is.
const appLinks = read('index.html') + read('js/views-progress.js');
['about.html', 'contact.html', 'privacy.html', 'guides/index.html'].forEach(t =>
  check('the app links to ' + t, appLinks.indexOf(t) !== -1));

console.log('\n— The written pages are worth reading —\n');

// A page of three sentences is what "low value content" means. These are
// generated from real lessons; if one comes out thin, the grouping is wrong.
WRITTEN.forEach(p => {
  const words = read(p).replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ')
    .split(/\s+/).filter(Boolean).length;
  check(p + ' is a substantial page', words >= 280, words + ' words');
});

console.log('\n— The guides match the lessons they came from —\n');

/* The guides are generated from js/data/grammar-es.js. Edit a lesson, forget to
 * rebuild, and the site teaches one thing while the app drills another — with
 * nothing to notice it, because both halves work. */
{
  const os = require('os');
  const cp = require('child_process');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lunosia-pages-'));
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/build-pages.js')],
    { env: Object.assign({}, process.env, { LUNOSIA_OUT_DIR: tmp, LUNOSIA_QUIET: '1' }) });
  check('the generator runs', r.status === 0, String(r.stderr || '').slice(0, 300));

  const stale = [];
  WRITTEN.concat(['sitemap.xml']).forEach(f => {
    const built = path.join(tmp, f);
    if (!fs.existsSync(built)) return;      // hand-written pages are not generated
    if (fs.readFileSync(built, 'utf8') !== read(f)) stale.push(f);
  });
  check('every generated page is up to date with the data', stale.length === 0,
    stale.length ? stale.join(', ') + ' — run: node tools/build-pages.js' : '');
  fs.rmSync(tmp, { recursive: true, force: true });
}

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

console.log('\n— The name —\n');

// The app was called Parla. The only place that name may still appear is the
// save-key migration, which needs it by definition: an old save on someone's
// phone is stored under it, and forgetting that key strands their progress.
const MIGRATION = ['js/store.js', 'test/transfer.test.js'];
// ...plus this file, which has to name it in order to check for it.
const NAMED = MIGRATION.concat(['test/pages.test.js']);
function walk(dir, out) {
  fs.readdirSync(path.join(ROOT, dir) || ROOT, { withFileTypes: true }).forEach(e => {
    const rel = dir ? dir + '/' + e.name : e.name;
    // tools/cache is gitignored source data downloaded from Wiktionary and the
    // frequency lists, where "parla" is a real Spanish word, not a leftover.
    if (e.name === '.git' || e.name === 'node_modules' || rel === 'tools/cache') return;
    if (e.isDirectory()) return walk(rel, out);
    if (/\.(js|html|css|json|md|ps1|txt|xml|webmanifest)$/.test(e.name)) out.push(rel);
  });
  return out;
}
const strays = walk('', [])
  .filter(f => f !== 'js/data/dict-es.json')   // "parla" is a real Spanish word in it
  .filter(f => NAMED.indexOf(f) === -1)
  .filter(f => /parla/i.test(read(f)));
check('nothing still calls the app by its old name', strays.length === 0, strays.join(', '));
check('  except the save-key migration, which must keep it',
  MIGRATION.every(f => /parla\.save\.v1/.test(read(f))),
  MIGRATION.filter(f => !/parla\.save\.v1/.test(read(f))).join(', '));

console.log('\n— The icon and the colours —\n');

const mani = JSON.parse(read('manifest.json'));
check('the manifest is named for the app', mani.short_name === 'Lunosia', mani.short_name);

// Three places declare the app's colour and they used to disagree: an orange
// in the manifest, a pink in the markup, and a third cream for the splash.
// The phone paints its chrome from one and the splash screen from another.
const themeMeta = /<meta name="theme-color" content="([^"]+)"/.exec(index)[1];
check('the manifest theme colour matches the markup',
  mani.theme_color.toLowerCase() === themeMeta.toLowerCase(),
  mani.theme_color + ' vs ' + themeMeta);
const bg = /--bg:\s*(#[0-9a-f]{3,8})/i.exec(read('css/style.css'))[1];
check('the splash background matches the page it becomes',
  mani.background_color.toLowerCase() === bg.toLowerCase(),
  mani.background_color + ' vs ' + bg);

PAGES.forEach(p => check(p + ' declares the theme colour',
  new RegExp('content="' + themeMeta + '"', 'i').test(read(p))));

// Android crops a maskable icon to the centre circle. Pointing it at artwork
// drawn to the corners gets the corners sliced off.
mani.icons.forEach(i => check('icon exists: ' + i.src, fs.existsSync(path.join(ROOT, i.src))));
const maskable = mani.icons.filter(i => /maskable/.test(i.purpose || ''));
check('there is a maskable icon', maskable.length === 1);
check('  and it is not the same file as the square one',
  maskable.length === 1 && !mani.icons.some(i => i.purpose === 'any' && i.src === maskable[0].src),
  maskable.length ? maskable[0].src : '');

check('no page still uses the emoji placeholder favicon',
  !PAGES.some(p => /rel="icon"[^>]*data:image\/svg\+xml,<svg/.test(read(p))));

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
