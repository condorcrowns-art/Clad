/* Listening, in a real browser at phone size.
 *
 * Reading a sentence and hearing one are different skills, and the second is
 * the one that fails you in a conversation: on the page the words arrive
 * already separated, in the air they arrive as one noise. What is checked here
 * is that the screen really withholds the text until you ask for it, that the
 * speed control changes this drill's voice without changing the speed the rest
 * of the app speaks at, and that answering the comprehension questions off the
 * audio is recorded as its own result rather than overwriting the reading one.
 */
const { chromium } = require('playwright');
const { goTo } = require('./nav');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, hasTouch: true };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await browser.newContext(PHONE)).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__said = [];
    PARLA.ui.say = function (t, cb, c, x) { window.__said.push([t, x && x.rate]); if (cb) setTimeout(cb, 5); };
    PARLA.speech.speak = function (t, o) { window.__said.push([t, o && o.rate]); if (o && o.onend) setTimeout(o.onend, 5); };
    PARLA.speech.cancel = function () {};
  });
  await page.evaluate(() => PARLA.dict.load());

  console.log('Getting there from the reader\n');
  await goTo(page, 'read');
  await page.locator('.read-card').first().click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Listen without the text' }).click();
  await page.waitForTimeout(500);
  check('the listening drill opens on the same text',
    /El perro del tercero/.test(await page.locator('h1').innerText()));

  console.log('\nNothing on the screen\n');
  check('the Spanish is not shown', !(await page.locator('.hear-es').isVisible()));
  check('nor the English', !(await page.locator('.hear-en').isVisible()));
  check('it says which line you are on',
    /LINE 1 OF 10/i.test(await page.locator('.q-count').innerText()));
  // The point of the screen is the audio; making someone press play to start
  // every line is friction for nothing.
  const opening = await page.evaluate(() => window.__said);
  check('and the line plays on arrival without being asked', opening.length === 1,
    JSON.stringify(opening));
  check('it says it has played once',
    /Played once/.test(await page.locator('.hear-played').innerText()));

  await page.locator('.hear-play').click();
  await page.waitForTimeout(200);
  check('playing it again is counted, not hidden',
    /Played 2 times/.test(await page.locator('.hear-played').innerText()),
    await page.locator('.hear-played').innerText());

  console.log('\nThe speed control\n');
  const base = await page.evaluate(() => PARLA.store.state.settings.rate);
  const heardAt = r => page.evaluate(() => window.__said.slice(-1)[0][1]);
  check('the default is slower than natural', (await heardAt()) < base,
    (await heardAt()) + ' vs ' + base);
  await page.locator('.seg button', { hasText: 'Slow' }).click();
  await page.locator('.hear-play').click();
  await page.waitForTimeout(200);
  const slow = await heardAt();
  await page.locator('.seg button', { hasText: 'Natural' }).click();
  await page.locator('.hear-play').click();
  await page.waitForTimeout(200);
  const natural = await heardAt();
  check('Slow is slower than Natural', slow < natural, slow + ' < ' + natural);
  // A multiplier, not an absolute: someone who likes a slow voice everywhere
  // should not end up at a crawl here.
  check('and Natural is the speed the rest of the app speaks at', natural === base,
    natural + ' vs ' + base);
  check('changing it here does not change the app-wide setting',
    (await page.evaluate(() => PARLA.store.state.settings.rate)) === base);

  console.log('\nLooking, when you want to\n');
  await page.locator('button', { hasText: 'Show me' }).click();
  await page.waitForTimeout(200);
  check('the Spanish appears', await page.locator('.hear-es').isVisible());
  check('but not the English with it', !(await page.locator('.hear-en').isVisible()));
  await page.locator('button', { hasText: '+ English' }).click();
  await page.waitForTimeout(200);
  check('which is a second tap away', await page.locator('.hear-en').isVisible());

  console.log('\nThrough the text\n');
  const lines = await page.evaluate(() => PARLA.data.es.readingById.perro.lines.length);
  await page.locator('button', { hasText: 'Caught it' }).click();
  await page.waitForTimeout(250);
  check('moving on hides the text again', !(await page.locator('.hear-es').isVisible()));
  check('and plays the next line',
    (await page.evaluate(() => window.__said.slice(-1)[0][0])) !==
    (await page.evaluate(() => PARLA.data.es.readingById.perro.lines[0][0])));

  for (let i = 1; i < lines; i++) {
    await page.locator('button', { hasText: i % 2 ? 'Missed it' : 'Caught it' }).click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  const tally = await page.locator('.banner').first().innerText();
  check('at the end it says how many you caught', /caught \d+ of 10 lines/.test(tally),
    tally.replace(/\n/g, ' '));

  console.log('\nThe same questions, off the audio\n');
  check('the questions follow', await page.locator('.q-text').isVisible());
  const nq = await page.evaluate(() => PARLA.data.es.readingById.perro.ask.length);
  for (let i = 0; i < nq; i++) {
    const right = await page.evaluate(i => PARLA.data.es.readingById.perro.ask[i][1], i);
    await page.locator('.q-opt', { hasText: right }).first().click();
    await page.waitForTimeout(200);
    await page.locator('.q-opt').locator('..').locator('..').locator('..')
      .locator('.btn-row button').last().click();
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);

  const rec = await page.evaluate(() => PARLA.store.state.reading.perro);
  check('the listening score is kept', rec && rec.heardRight === nq, JSON.stringify(rec));
  // Understanding a text you only heard is a different result from
  // understanding one you could look at, so it does not overwrite the other.
  check('separately from the reading score', rec && rec.right === undefined,
    JSON.stringify(rec));
  check('along with how much of it you caught by ear', rec && rec.caught === 5,
    String(rec && rec.caught));
  check('and it says the score came from the audio alone',
    /from the audio alone/.test(await page.locator('.banner').last().innerText()));

  console.log('\nOn the shelf\n');
  await goTo(page, 'read');
  await page.waitForTimeout(400);
  const card = await page.locator('.read-card').first().innerText();
  check('the card shows the listening score', /🎧 3\/3/.test(card), card.replace(/\n/g, ' | '));

  console.log('\nOn a phone\n');
  await page.evaluate(() => PARLA.app.go('listen', { id: 'taxi' }));
  await page.waitForTimeout(400);
  check('nothing runs off the side',
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check('no page errors throughout', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nAll listening checks passed.');
  process.exit(fail.length ? 1 : 0);
})();
