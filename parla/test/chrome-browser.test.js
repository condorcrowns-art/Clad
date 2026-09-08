/* The app's own chrome: the nav, the More sheet, hover states, and whether
 * anything runs off the side of a phone.
 *
 * These exist because a suite of green tests coexisted with an app in which
 * every coloured button turned blank cream under the cursor, the microphone
 * included, and four of the nine screens were off the edge of the nav bar with
 * nothing to say so. Assertions about behaviour do not catch that; assertions
 * about pixels do.
 */
const { chromium } = require('playwright');
const { goTo } = require('./nav');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

const VIEWS = ['home','scenarios','coach','words','review','games','conjugate','challenge','progress'];

async function boot(browser, viewport) {
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    PARLA.ui.say = function () {};
    PARLA.speech.speak = function (t, o) { if (o && o.onend) o.onend(); };
  });
  await page.evaluate(() => PARLA.dict.load());
  return { page, errs };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  /* ── Hover ─────────────────────────────────────────────── */
  console.log('Hover states\n');
  let { page } = await boot(browser, { width: 1280, height: 900 });

  // The bug: `button:hover { background: var(--bg-sunken) }` scores 0,1,1 and
  // beat every `.something { background: ... }` rule in the app.
  const primary = page.locator('button.primary').first();
  const restBg = await primary.evaluate(e => getComputedStyle(e).backgroundColor);
  await primary.hover();
  await page.waitForTimeout(200);
  const hoverBg = await primary.evaluate(e => getComputedStyle(e).backgroundColor);
  check('a primary button keeps its colour when you point at it', restBg === hoverBg,
    restBg + ' -> ' + hoverBg);
  check('and it is not the plain-button background',
    hoverBg !== await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--bg-sunken').trim()),
    hoverBg);

  await goTo(page, 'scenarios');
  await page.locator('button.scenario').first().click();
  await page.waitForTimeout(700);
  const mic = page.locator('.mic');
  await mic.hover();
  await page.waitForTimeout(200);
  const micBg = await mic.evaluate(e => getComputedStyle(e).backgroundImage);
  check('the microphone stays a gradient rather than going blank under the cursor',
    /gradient/.test(micBg), micBg.slice(0, 60));
  const micColour = await mic.evaluate(e => getComputedStyle(e).color);
  check('so its icon is never white on near-white', micColour === 'rgb(255, 255, 255)' ? /gradient/.test(micBg) : true);
  await page.mouse.move(2, 2);

  /* ── The nav, wide ─────────────────────────────────────── */
  console.log('\nThe nav on a desktop\n');
  check('every screen has a tab', (await page.locator('#nav button[data-view]').count()) === VIEWS.length);
  check('and they are all on the bar',
    (await page.locator('#nav button[data-view]:visible').count()) === VIEWS.length);
  check('so More is not needed', !(await page.locator('#navMore').isVisible()));
  check('the bar does not scroll',
    await page.evaluate(() => { const n = document.getElementById('nav'); return n.scrollWidth <= n.clientWidth + 1; }));

  /* ── The nav, phone ────────────────────────────────────── */
  console.log('\nThe nav on a phone\n');
  const phone = await boot(browser, { width: 412, height: 915 });
  page = phone.page;

  check('five tabs are on the bar', (await page.locator('#nav button[data-view]:visible').count()) === 5,
    String(await page.locator('#nav button[data-view]:visible').count()));
  check('plus More', await page.locator('#navMore').isVisible());
  check('and the bar fits, so no label is sliced in half',
    await page.evaluate(() => {
      const n = document.getElementById('nav');
      const last = [...n.querySelectorAll('button')].filter(b => b.offsetParent !== null).pop();
      return n.scrollWidth <= n.clientWidth + 1 &&
             last.getBoundingClientRect().right <= window.innerWidth + 1;
    }));

  await page.locator('#navMore').click();
  await page.waitForTimeout(400);
  const items = await page.locator('.sheet-item').allInnerTexts();
  check('More holds the other four screens, and Settings',
    items.length === 5 && /Settings/.test(items.join(' ')), items.join(' / ').replace(/\n/g, ' '));
  check('the sheet is above the page, not behind it',
    await page.evaluate(() => {
      const s = document.getElementById('moreSheet'), sc = document.getElementById('sheetScrim');
      return !s.hidden && !sc.hidden &&
             Number(getComputedStyle(s).zIndex) > Number(getComputedStyle(document.getElementById('nav')).zIndex);
    }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes it', await page.evaluate(() => document.getElementById('moreSheet').hidden));

  await goTo(page, 'games');
  check('a screen behind More still marks the bar',
    await page.locator('#navMore').evaluate(b => b.getAttribute('aria-current') === 'page'));
  check('and going somewhere on the bar clears it',
    (await goTo(page, 'home'),
     await page.locator('#navMore').evaluate(b => b.getAttribute('aria-current') === null)));

  /* ── Nothing runs off the side ─────────────────────────── */
  console.log('\nEvery screen, on a phone\n');
  for (const v of VIEWS) {
    await goTo(page, v);
    await page.waitForTimeout(250);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    let worst = '';
    if (over > 0) {
      worst = await page.evaluate(() => {
        const W = window.innerWidth; let out = '';
        document.querySelectorAll('main *').forEach(e => {
          const r = e.getBoundingClientRect();
          if (r.right > W + 1 && !out) out = (e.className || e.tagName) + ' to ' + Math.round(r.right);
        });
        return out;
      });
    }
    check(v + ' fits the screen', over <= 0, over + 'px over — ' + worst);
  }

  /* ── Text that has to be readable ──────────────────────── */
  console.log('\nLegibility\n');
  await goTo(page, 'home');
  const clipped = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('main .scenario .txt span, main .game-desc, main .band-desc')
      .forEach(e => { if (e.scrollHeight > e.clientHeight + 2) bad.push(e.textContent.slice(0, 30)); });
    return bad;
  });
  check('no tile subtitle is cut off mid-word', clipped.length === 0, clipped.join(' | '));

  await goTo(page, 'words');
  const weights = await page.evaluate(() =>
    [...document.querySelectorAll('.band-card')].map(c => ({
      title: getComputedStyle(c.querySelector('strong')).fontWeight,
      desc: getComputedStyle(c.querySelector('.band-desc')).fontWeight
    })).slice(0, 1));
  check('a card description is lighter than its title, not the same weight',
    weights.length && Number(weights[0].desc) < Number(weights[0].title),
    JSON.stringify(weights[0]));

  check('no page errors throughout', phone.errs.length === 0, phone.errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll chrome checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
