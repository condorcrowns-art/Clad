/* The decoration must be decoration: it can be deleted and the app still
 * works, it must not break the layout, and it must stop moving when the
 * viewer's operating system asks it to. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);

const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

async function onboard(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  /* — normal — */
  let page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await onboard(page);

  console.log('Ornament\n');
  check('papel picado is strung', await page.locator('.papel').isVisible());
  const flags = await page.locator('.papel svg').count();
  check('enough flags to cross the screen', flags >= 900 / (58 * 74 / 92), flags + ' flags');
  const strip = await page.locator('.papel').boundingBox();
  check('the string spans the full width', strip.width >= 890, Math.round(strip.width) + 'px');

  check('the mural is painted', await page.locator('.mural').isVisible());
  check('the greeting is still a real heading for screen readers',
    (await page.locator('h1').innerText()).includes('Condo'));
  check('the tile background is generated', 
    (await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tile-art'))).includes('svg'));

  console.log('\nLayout');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('nothing overflows sideways', overflow <= 1, overflow + 'px');

  await page.evaluate(() => PARLA.app.go('talk', { id: PARLA.data.es.scenarios[0].id }));
  await page.waitForTimeout(400);
  const dockBg = await page.evaluate(() => getComputedStyle(document.querySelector('.mic-dock')).backgroundColor);
  check('the dock is opaque, so the thread cannot show through it',
    !/rgba\(.*,\s*0\)/.test(dockBg) && dockBg !== 'transparent', dockBg);

  await page.locator('.help-me').click();
  await page.waitForTimeout(600);
  check('the help panel opens', await page.locator('.help-box').isVisible());
  check('with suggestions in it', (await page.locator('.help-opt').count()) > 0);
  await page.locator('.help-use').first().click();
  await page.waitForTimeout(200);
  check('"Use" puts the phrase in the box rather than sending it for you',
    (await page.inputValue('.mic-dock input[type=text]')).length > 0);
  check('and closes the panel', await page.locator('.help-box').isHidden());

  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await page.context().close();

  /* — reduced motion — */
  console.log('\nReduced motion');
  const rm = await browser.newContext({ viewport: { width: 900, height: 900 }, reducedMotion: 'reduce' });
  page = await rm.newPage();
  await onboard(page);
  const swaying = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.papel svg')).animationName);
  check('the bunting stops swaying', swaying === 'none', swaying);
  const confettiPieces = await page.evaluate(() => { PARLA.decor.confetti(50); return document.querySelectorAll('.confetti').length; });
  check('confetti is not fired at all', confettiPieces === 0, String(confettiPieces));
  check('but the colour stays', await page.locator('.mural').isVisible());
  await rm.close();

  /* — without the decoration at all — */
  console.log('\nWithout decor.js');
  const bare = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await bare.route('**/js/decor.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  page = await bare.newPage();
  const bareErrs = []; page.on('pageerror', e => bareErrs.push(String(e)));
  await onboard(page);
  check('the app still boots', await page.locator('#nav').isVisible());
  check('the greeting falls back to plain text',
    (await page.locator('h1').innerText()).includes('Condo'));
  check('and the day card is still there', (await page.locator('.chip.hot').first().innerText()).includes('Day 1'));
  check('no errors from the missing ornaments', bareErrs.length === 0, bareErrs.slice(0, 2).join(' | '));
  await bare.close();

  await browser.close();
  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
