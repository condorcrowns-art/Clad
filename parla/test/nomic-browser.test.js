/* The app in a browser with no speech recognition.
 *
 * SpeechRecognition is a Chromium and Safari API. Firefox has never shipped
 * it and shows no sign of doing so, and there is no polyfill that does not
 * involve paying someone for cloud transcription — so this is a limitation to
 * degrade around rather than a bug to fix.
 *
 * Everything else works there: the dictionary, the grammar checker, reading,
 * listening, writing, the games, the whole conversation by typing. The only
 * thing lost is speaking, and the app has to say so rather than presenting a
 * microphone button that silently does nothing.
 */
const { chromium } = require('playwright');
const { goTo } = require('./nav');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true });
  // Firefox, as far as the page can tell.
  await ctx.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    PARLA.speech.speak = function (t, o) { if (o && o.onend) o.onend(); };
  });
  await page.evaluate(() => PARLA.dict.load());

  console.log('It knows\n');
  check('speech is reported unsupported',
    (await page.evaluate(() => PARLA.speech.supported)) === false);

  console.log('\nThe conversation still works, by typing\n');
  await page.evaluate(() => PARLA.app.go('talk', { id: 'presentarse' }));
  await page.waitForTimeout(800);
  check('the typing box is there', await page.locator('.type-fallback input').isVisible());
  check('and the label says to use it',
    /type your reply/i.test(await page.locator('.mic-label').innerText()),
    await page.locator('.mic-label').innerText());
  // A full-strength microphone button that cannot work is a trap: you have to
  // press it to find out.
  check('the microphone is rendered off, not inviting',
    (await page.locator('.mic').getAttribute('data-state')) === 'off');
  check('and says why if you point at it',
    /no speech recognition/i.test(await page.locator('.mic').getAttribute('title')),
    await page.locator('.mic').getAttribute('title'));

  await page.fill('.type-fallback input', 'me llamo Condo');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  check('a typed turn gets a reply', (await page.locator('.bubble.them').count()) >= 2);
  await page.fill('.type-fallback input', 'yo tiene hambre');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  check('and is still corrected', (await page.locator('.correction').count()) >= 1);

  console.log('\nEverything that is not speaking\n');
  for (const [view, sel, what] of [
    ['read', '.read-card', 'reading'],
    ['write', '.read-card', 'writing'],
    ['grammar', '.gram-card', 'the grammar lessons'],
    ['words', '.band-card', 'the word bank'],
    ['games', '.game-card, .scenario', 'the games'],
    ['progress', '.skill', 'the stats']
  ]) {
    await page.evaluate(v => PARLA.app.go(v), view);
    await page.waitForTimeout(400);
    check(what + ' works', (await page.locator(sel).count()) > 0);
  }

  // Tapping a word is the dictionary and the morphology engine, neither of
  // which has anything to do with the microphone.
  await page.evaluate(() => PARLA.app.go('text', { id: 'perro' }));
  await page.waitForTimeout(500);
  await page.locator('.rd-es .word', { hasText: 'tiene' }).first().click();
  await page.waitForTimeout(400);
  check('and tapping a word still explains it',
    /tener/.test(await page.locator('.word-pop').innerText()),
    await page.locator('.word-pop').innerText().catch(() => 'none'));

  console.log('\nNothing throws\n');
  check('no page errors from the missing API', errs.length === 0, errs.slice(0, 2).join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nAll no-microphone checks passed.');
  process.exit(fail.length ? 1 : 0);
})();
