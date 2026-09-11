/* "The microphone doesn't work" has half a dozen causes and the browser reports
 * almost none of them. These checks are about turning that into a sentence
 * someone can act on. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

async function boot(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);
  return page;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

  /* — microphone allowed — */
  console.log('With a microphone\n');
  let ctx = await browser.newContext({ permissions: ['microphone'] });
  let page = await boot(ctx);
  const errs = []; page.on('pageerror', e => errs.push(String(e)));

  await page.evaluate(() => PARLA.app.go('settings'));
  await page.waitForTimeout(500);
  check('there is a microphone check to run',
    (await page.locator('button', { hasText: 'Test microphone' }).count()) === 1);

  await page.locator('button', { hasText: 'Test microphone' }).click();
  await page.waitForTimeout(1200);
  const report = await page.locator('.card').filter({ hasText: 'Secure context' }).innerText();
  check('it reports the secure context', /Secure context/.test(report));
  check('it reports whether recognition exists', /Speech recognition available/.test(report));
  check('it reports the permission state', /Permission:/.test(report), (report.match(/Permission:.*/)||[''])[0]);
  check('it counts the microphones it can see', /microphone(s)? found/.test(report));
  check('and says whether one actually opened',
    /Microphone opened|Could not open/.test(report),
    (report.match(/(Microphone opened|Could not open).*/)||[''])[0]);
  check('granted permission is reported as granted', /Permission: granted/.test(report));
  await ctx.close();

  /* — microphone refused — */
  console.log('\nWith the microphone blocked\n');
  ctx = await browser.newContext();
  await ctx.grantPermissions([]);                     // explicitly nothing
  page = await boot(ctx);
  await page.evaluate(() => {
    // Stand in for a browser that refuses: the real refusal path is a
    // permission prompt, which headless cannot show.
    navigator.mediaDevices.getUserMedia = function () {
      var e = new Error('denied'); e.name = 'NotAllowedError';
      return Promise.reject(e);
    };
  });
  await page.evaluate(() => PARLA.app.go('settings'));
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Test microphone' }).click();
  await page.waitForTimeout(1200);
  const blocked = await page.locator('.card').filter({ hasText: 'Secure context' }).innerText();
  check('a refusal is reported as a refusal', /Could not open the microphone/.test(blocked));
  check('with the actual remedy, not an error code',
    /padlock/i.test(blocked), (blocked.match(/.*padlock.*/i)||[''])[0].slice(0, 80));

  console.log('\nIn the conversation\n');
  await page.evaluate(() => PARLA.app.go('talk', { id: 'cafe' }));
  await page.waitForTimeout(400);
  await page.locator('.mic').click();
  await page.waitForTimeout(700);
  check('tapping the mic says what is wrong',
    /blocked/i.test(await page.locator('.mic-label').innerText()),
    await page.locator('.mic-label').innerText());
  check('and shows how to fix it right there',
    await page.locator('.mic-help').isVisible());
  check('typing still works when the mic does not',
    await page.locator('.mic-dock input[type=text]').isVisible());
  await ctx.close();

  /* — the sun stays on the sun — */
  console.log('\nThe mural\n');
  ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  page = await boot(ctx);
  const geom = await page.evaluate(() => {
    const rays = document.querySelector('.mural .rays');
    const disc = document.querySelector('.mural svg g circle');
    const s = getComputedStyle(rays);
    const r = rays.getBoundingClientRect(), d = disc.getBoundingClientRect();
    return {
      box: s.transformBox, origin: s.transformOrigin,
      raysCentre: [r.left + r.width / 2, r.top + r.height / 2],
      discCentre: [d.left + d.width / 2, d.top + d.height / 2]
    };
  });
  check('the rays rotate about their own box, not the whole mural',
    geom.box === 'fill-box', geom.box);
  const dx = Math.abs(geom.raysCentre[0] - geom.discCentre[0]);
  const dy = Math.abs(geom.raysCentre[1] - geom.discCentre[1]);
  check('so the rays are centred on the sun', dx < 6 && dy < 6,
    'off by ' + Math.round(dx) + ',' + Math.round(dy) + 'px');

  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await browser.close();
  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
