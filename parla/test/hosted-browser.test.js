/* The phone path, end to end.
 *
 * On lunosia.com there is no Ollama and no Piper — the conversation partner is
 * a Cloudflare Pages Function calling Workers AI. These checks drive the real
 * app in a real browser against the real functions/api/chat.js, so what is
 * being tested is the code that will be deployed, not a description of it.
 *
 *   node test/mock-pages-server.js 8801            && node test/hosted-browser.test.js 8801
 *   node test/mock-pages-server.js 8802 nobinding  && node test/hosted-browser.test.js 8802 nobinding
 *   node test/mock-pages-server.js 8803 flaky      && node test/hosted-browser.test.js 8803 flaky
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8801);
const MODE = process.argv[3] || 'ok';
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 ' +
             '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext(PHONE)).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);
  // Nothing here should try to make a sound.
  await page.evaluate(() => {
    PARLA.ui.say = function () {}; PARLA.speech.speak = function (t, o) { if (o && o.onend) o.onend(); };
  });

  // The default only flips to the hosted partner on a public https origin; a
  // test server is http://localhost, so ask for it the way a phone would get it.
  await page.evaluate(() => {
    PARLA.store.state.settings.brain = 'hosted';
    PARLA.brain.health.checked = false;
    PARLA.store.save();
  });

  console.log(MODE === 'nobinding' ? 'With no AI binding\n' : 'On the deployed site\n');

  const probe = await page.evaluate(() => PARLA.brain.hostedAvailable());
  if (MODE === 'nobinding') {
    check('the app can tell the binding is missing', probe.ok === false, JSON.stringify(probe));
    check('and says what to do about it', /binding/i.test(probe.detail || ''), probe.detail);
  } else {
    check('the app can see the function', probe.ok === true, JSON.stringify(probe));
    check('and names the models it would use',
      (probe.models || []).some(m => /^@cf\//.test(m)), (probe.models || []).join(', '));
  }

  await page.evaluate(() => PARLA.app.go('scenarios'));
  await page.waitForTimeout(300);
  await page.locator('button.scenario').first().click();
  await page.waitForTimeout(500);
  check('a conversation opens', await page.locator('.bubble.them').first().isVisible());

  await page.fill('.type-fallback input', 'quiero un cafe');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(MODE === 'flaky' ? 2500 : 1800);

  const bubbles = await page.locator('.bubble.them').allInnerTexts();
  const last = bubbles[bubbles.length - 1] || '';

  if (MODE === 'nobinding') {
    check('the conversation still works without the binding', bubbles.length >= 2, last);
    check('and it does not show a raw error to the user',
      !/no-binding|HTTP \d|undefined|\[object/.test(last), last);
    const src = await page.evaluate(() => PARLA.store.state.settings.brain);
    check('the setting is left alone so it works again once the binding is added',
      src === 'hosted', src);
  } else {
    check('the edge model answers', /para beber/i.test(last), last);
    check('the English is carried alongside it',
      /to drink/i.test(await page.locator('.bubble.them').last().innerText()), last);
    check('and it suggests something to say next',
      (await page.locator('.say-this').count()) >= 1);

    const calls = await (await fetch(BASE + '/__calls')).json();
    check('the function was actually called', calls.length >= 1, calls.length + ' calls');
    const first = calls[0];
    check('the scenario went with it as a system message',
      first.messages[0].role === 'system' && first.messages[0].content.length > 100);
    check('and the turn itself as the last message',
      first.messages[first.messages.length - 1].content === 'quiero un cafe',
      first.messages[first.messages.length - 1].content);
    check('the token budget is capped', first.max_tokens <= 700, String(first.max_tokens));
    if (MODE === 'flaky') {
      check('a failing model is stepped over rather than surfaced',
        calls.length >= 3 && new Set(calls.map(c => c.model)).size >= 3,
        calls.map(c => c.model).join(', '));
    }
  }

  console.log('\nThe rest of the app, unchanged\n');
  const nav = await page.locator('#nav button').count();
  check('every screen is still reachable', nav === 8, nav + ' nav items');
  for (const v of ['review', 'games', 'conjugate', 'challenge', 'progress']) {
    await page.locator('#nav button[data-view=' + v + ']').click();
    await page.waitForTimeout(350);
    check(v + ' opens with no model involved', (await page.locator('main').count()) === 1);
  }
  await page.locator('#nav button[data-view=coach]').click();
  await page.waitForTimeout(250);
  await page.fill('.ask-input', 'madrugar');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  check('Ask still conjugates from the rules, with or without an edge model',
    (await page.locator('.conj-row .conj-f').first().innerText()) === 'madrugo');

  check('no page errors throughout', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll hosted checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
