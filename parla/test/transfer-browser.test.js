/* Carrying a deck from one device to another, through the actual buttons.
 *
 * The store-level rules are checked in transfer.test.js. What this checks is
 * the part a person touches: that the export button really produces a file, and
 * that a *different* browser profile can pick that file up and end with both
 * decks rather than one — because the failure this replaces was an import that
 * silently replaced everything the second device had.
 */
const { chromium } = require('playwright');
const { goTo } = require('./nav');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true };

// ui.toast is a fixed-position .banner appended to the body, not a .toast.
const toastOn = page => page.evaluate(() => {
  const t = [...document.body.children].filter(
    e => e.classList.contains('banner') && getComputedStyle(e).position === 'fixed');
  return t.length ? t[t.length - 1].textContent : '';
});

async function boot(browser) {
  const page = await (await browser.newContext({ ...PHONE, acceptDownloads: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    PARLA.ui.say = function () {};
    PARLA.speech.speak = function (t, o) { if (o && o.onend) o.onend(); };
  });
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  console.log('The phone\n');
  const a = await boot(browser);
  await a.page.evaluate(() => {
    PARLA.store.addWord('la escalera', 'the stairs', 'Hay un perro en la escalera.', '');
    PARLA.store.addWord('el collar', 'the collar', '', '');
    PARLA.store.markRead('perro', 3, 3);
    PARLA.store.state.progress.streak = 6;
    PARLA.store.save();
  });

  await goTo(a.page, 'settings');
  await a.page.waitForTimeout(500);
  const line = await a.page.locator('.save-line').first().innerText();
  check('it says what is on this device before you save it', /2 words/.test(line),
    line.replace(/\n/g, ' '));

  const [download] = await Promise.all([
    a.page.waitForEvent('download'),
    a.page.locator('button', { hasText: 'Save a copy' }).click()
  ]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'parla-')), 'save.json');
  await download.saveAs(file);
  check('the save button produces a file', fs.existsSync(file));
  // Dated, because the point of a backup is having more than one of them.
  check('named with the day it was taken', /^parla-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()),
    download.suggestedFilename());

  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('with the deck in it', (saved.phrases || []).length === 2);
  check('and the streak', saved.progress.streak === 6);

  console.log('\nThe computer, which has its own work on it\n');
  const b = await boot(browser);
  await b.page.evaluate(() => {
    PARLA.store.addWord('la llave', 'the key', '', '');
    PARLA.store.state.progress.bestStreak = 9;
    PARLA.store.save();
  });
  check('starting from a different browser profile with a different deck',
    (await b.page.evaluate(() => PARLA.store.state.phrases.length)) === 1);

  await goTo(b.page, 'settings');
  await b.page.waitForTimeout(500);
  await b.page.locator('input[type=file]').setInputFiles(file);
  await b.page.waitForTimeout(700);

  const words = await b.page.evaluate(() => PARLA.store.state.phrases.map(p => p.es));
  check('the phone’s words arrive', words.includes('la escalera') && words.includes('el collar'),
    words.join(' / '));
  // The bug this replaces: import called merge(defaults(), incoming), so the
  // computer's own deck went out with the defaults.
  check('and the computer keeps its own', words.includes('la llave'), words.join(' / '));
  check('what the phone had read comes too',
    await b.page.evaluate(() => !!PARLA.store.state.reading.perro));
  check('the longer streak wins',
    (await b.page.evaluate(() => PARLA.store.state.progress.streak)) === 6);
  check('and the best streak this device set is not lost',
    (await b.page.evaluate(() => PARLA.store.state.progress.bestStreak)) === 9);

  const toast = await toastOn(b.page);
  check('it says what arrived rather than just "imported"', /2 new words/.test(toast), toast);

  console.log('\nDoing it twice\n');
  await goTo(b.page, 'settings');
  await b.page.waitForTimeout(400);
  await b.page.locator('input[type=file]').setInputFiles(file);
  await b.page.waitForTimeout(700);
  const again = await b.page.evaluate(() => PARLA.store.state.phrases.length);
  check('adds nothing the second time', again === 3, String(again));
  const toast2 = await toastOn(b.page);
  check('and says so', /already had all of it/.test(toast2), toast2);

  console.log('\nA file that is not a save\n');
  const junk = path.join(path.dirname(file), 'junk.json');
  fs.writeFileSync(junk, '{"tracks":[{"name":"not a parla save"}]}');
  await goTo(b.page, 'settings');
  await b.page.waitForTimeout(400);
  await b.page.locator('input[type=file]').setInputFiles(junk);
  await b.page.waitForTimeout(700);
  check('is refused', /not a Parla save/.test(await toastOn(b.page)));
  check('and the deck is untouched',
    (await b.page.evaluate(() => PARLA.store.state.phrases.length)) === 3);

  console.log('\nNothing broke\n');
  check('no page errors on either device', a.errs.length === 0 && b.errs.length === 0,
    a.errs.concat(b.errs).join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nAll transfer checks passed.');
  process.exit(fail.length ? 1 : 0);
})();
