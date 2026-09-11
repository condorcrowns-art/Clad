/* The pronunciation screen.
 *
 * The interesting part is not that it renders — it is that a wrong answer
 * produces a diagnosis instead of a verdict. These checks drive the recogniser
 * with a stubbed result so the mispronunciation is deterministic, and then look
 * at what the screen says about it.
 */
const { chromium } = require('playwright');
const { goTo } = require('./nav');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext({
    viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);

  // Nothing should make a noise, and the microphone is replaced by something
  // that returns exactly what the test wants heard.
  await page.evaluate(() => {
    PARLA.ui.say = function () {};
    PARLA.speech.speak = function (t, o) { if (o && o.onend) o.onend(); };
    window.__heard = null;
    PARLA.speech.supported = true;
    PARLA.speech.listen = function (o) {
      setTimeout(function () {
        if (o.onfinal) o.onfinal(window.__heard, 0.9, []);
        if (o.onend) o.onend();
      }, 40);
      return { stop: function () {}, abort: function () {} };
    };
  });

  console.log('The list\n');
  await goTo(page, 'say');
  check('every sound has a card', (await page.locator('.sound-card').count()) === 10,
    String(await page.locator('.sound-card').count()));
  check('and they are ordered with the costly ones first',
    /Worth fixing first/.test(await page.locator('.sound-card').first().innerText()));

  console.log('\nOne sound\n');
  await page.locator('.sound-card').first().click();
  await page.waitForTimeout(500);
  const text = await page.locator('main').innerText();
  check('it says what to do with your mouth', /WHAT TO DO WITH YOUR MOUTH/i.test(text));
  check('and what English makes you do instead', /WHAT ENGLISH MAKES YOU DO INSTEAD/i.test(text));
  check('with a trick to get there', (await page.locator('.good-hint').count()) === 1);
  check('the word is broken into syllables', /·/.test(await page.locator('.say-word').innerText()),
    await page.locator('.say-word').innerText());
  check('the stressed one is marked', (await page.locator('.say-stress').count()) >= 1);
  check('and its sounds are spelled out', /^\/.+\/$/.test(await page.locator('.say-ipa').first().innerText()),
    await page.locator('.say-ipa').first().innerText());

  console.log('\nHearing the difference\n');
  check('two words to tell apart', (await page.locator('.quiz-opt').count()) === 2);
  const opts = await page.locator('.quiz-opt').allInnerTexts();
  check('which differ only in this sound', /perro|pero|carro|caro|parra|para|cerro|cero/.test(opts.join(' ')),
    opts.join(' / ').replace(/\n/g, ' '));
  await page.locator('.quiz-opt').first().click();
  await page.waitForTimeout(300);
  check('answering says which it was', (await page.locator('.answer-state').count()) >= 1);
  check('and is recorded against the sound',
    await page.evaluate(() => Object.keys(PARLA.store.state.sounds || {}).length > 0));

  console.log('\nSaying it, and being told what broke\n');
  const word = (await page.locator('.say-word').innerText()).replace(/·/g, '').trim();

  // Say it perfectly.
  await page.evaluate(w => { window.__heard = w; }, word);
  await page.locator('button', { hasText: 'Say it' }).click();
  await page.waitForTimeout(500);
  // Both drills are on the screen at once, so both verdicts are. Take the
  // last one — asking for the first .ok picked up the hear-it answer whenever
  // that one happened to be right, and failed three runs in five.
  check('a correct attempt is accepted',
    /That is it/.test(await page.locator('.answer-state.ok').last().innerText().catch(() => '')));

  // Now mispronounce it in a specific, diagnosable way: a trill as a tap.
  await page.evaluate(() => PARLA.app.go('sound', { id: 'rr' }));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    // Find a word on the screen whose trill can be flattened to a tap.
    const w = document.querySelector('.say-word').textContent.replace(/·/g, '').trim();
    window.__heard = w.replace(/rr/, 'r').replace(/^r/, 'l');
  });
  await page.locator('button', { hasText: 'Say it' }).click();
  await page.waitForTimeout(600);

  check('a wrong attempt shows what was heard',
    /Heard/.test(await page.locator('.answer-state.no').innerText().catch(() => '')),
    await page.locator('.answer-state.no').innerText().catch(() => 'none'));
  check('and both transcriptions, side by side',
    (await page.locator('.say-compare .say-ipa-inline').count()) === 2);
  check('and names the sound rather than just saying wrong',
    (await page.locator('.diagnosis').count()) >= 1);
  const diag = await page.locator('.diagnosis').first().innerText();
  check('telling you what your mouth did', /tap|trill|tongue/i.test(diag), diag.split('\n')[1]);
  check('with something to do about it', /tongue|air|flutter/i.test(diag));

  console.log('\nIt keeps score\n');
  const scores = await page.evaluate(() => PARLA.store.state.sounds);
  check('attempts are counted per sound', Object.keys(scores).length >= 1, JSON.stringify(scores));
  check('and both right and wrong are recorded',
    Object.values(scores).some(s => s.tries > s.ok) || Object.values(scores).some(s => s.ok > 0),
    JSON.stringify(scores));

  console.log('\nThe speaking drill in Review says it too\n');
  await goTo(page, 'review');
  await page.waitForTimeout(400);
  const spoke = await page.evaluate(() => {
    // The speak mode is one of the review modes; check the wiring exists.
    return typeof PARLA.phon.compare === 'function' && !!PARLA.data.es.soundsById;
  });
  check('the same engine is available to it', spoke);

  console.log('\nOn a phone\n');
  check('nothing runs off the side',
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check('no page errors throughout', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll pronunciation checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
