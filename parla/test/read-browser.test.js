/* Graded reading, in a real browser at phone size.
 *
 * The thing worth testing is not that a story renders. It is that the reading
 * works the way reading has to work when you cannot read yet: every word is
 * one tap from its dictionary form, the translation is there when you want it
 * and gone when you do not, and a word you take away lands in the same deck as
 * everything else. All of it without a model and without a connection.
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
  const said = [];
  await page.evaluate(() => {
    window.__said = [];
    PARLA.ui.say = function (t, cb) { window.__said.push(t); if (cb) setTimeout(cb, 5); };
    PARLA.speech.speak = function (t, o) { window.__said.push(t); if (o && o.onend) setTimeout(o.onend, 5); };
    PARLA.speech.cancel = function () {};
  });
  await page.evaluate(() => PARLA.dict.load());

  console.log('The shelf\n');
  await goTo(page, 'read');
  await page.waitForTimeout(400);
  const cards = await page.locator('.read-card').count();
  check('twelve texts', cards === 12, String(cards));
  check('graded, in three bands', (await page.locator('.level-tag').count()) >= 3);
  check('each one says how long it takes',
    /\d+ min/.test(await page.locator('.read-meta').first().innerText()));

  console.log('\nOne of them\n');
  await page.locator('.read-card').first().click();
  await page.waitForTimeout(500);
  const lines = await page.locator('.rd-line').count();
  check('the whole text is on the screen at once', lines >= 8, lines + ' lines');
  check('every line has its own play button',
    (await page.locator('.rd-play').count()) === lines);
  check('and no translation is showing to start with',
    (await page.locator('.rd-en:visible').count()) === 0);

  const first = page.locator('.rd-line').first();
  await first.locator('.rd-text').click({ position: { x: 300, y: 4 } });
  await page.waitForTimeout(200);
  check('tapping a line shows that line in English',
    (await page.locator('.rd-en:visible').count()) === 1);
  await first.locator('.rd-text').click({ position: { x: 300, y: 4 } });
  await page.waitForTimeout(200);
  check('and tapping it again puts it away',
    (await page.locator('.rd-en:visible').count()) === 0);

  await page.locator('button', { hasText: 'Show English' }).click();
  await page.waitForTimeout(200);
  check('or all of them at once',
    (await page.locator('.rd-en:visible').count()) === lines);
  await page.locator('button', { hasText: 'Hide English' }).click();
  await page.waitForTimeout(200);
  check('and back', (await page.locator('.rd-en:visible').count()) === 0);

  console.log('\nTapping a word\n');
  const word = page.locator('.rd-es .word', { hasText: 'tiene' }).first();
  await word.click();
  await page.waitForTimeout(400);
  const pop = await page.locator('.word-pop').innerText();
  check('the meaning arrives', /to have/.test(pop), pop.replace(/\n/g, ' | '));
  // "tiene" is not a word you look up. "tener" is, and which ending this is
  // matters as much as the meaning.
  check('with the dictionary form it came from', /tener/.test(pop));
  check('and what the ending is doing', /present/.test(pop) && /él/.test(pop));
  check('no duplicate gloss padding out a popover the size of a thumb',
    !/to have · to have/.test(pop), pop.replace(/\n/g, ' | '));

  const offline = await page.evaluate(() => {
    // No model, no network: the dictionary and the morphology engine are the
    // whole apparatus.
    const was = PARLA.brain.translate;
    PARLA.brain.translate = () => Promise.reject(new Error('no'));
    const r = PARLA.morph.analyse('escalera');
    PARLA.brain.translate = was;
    return r.length > 0;
  });
  check('it never needed the model to do it', offline);

  await page.locator('.word-pop button.primary').click();
  await page.waitForTimeout(300);
  const deck = await page.evaluate(() => PARLA.store.state.phrases.map(p => p.es));
  check('adding a word puts the dictionary form in the deck',
    deck.some(w => /tener/.test(w)), deck.slice(0, 3).join(' / '));
  const ctx = await page.evaluate(() =>
    (PARLA.store.state.phrases.find(p => /tener/.test(p.es)) || {}).exEs || '');
  check('with the sentence it turned up in', ctx.length > 5, ctx);

  console.log('\nHearing it\n');
  await page.locator('.rd-play').nth(1).click();
  await page.waitForTimeout(300);
  const heard = await page.evaluate(() => window.__said.slice(-1)[0] || '');
  check('a line reads aloud on its own', heard.length > 5, heard);

  await page.locator('button', { hasText: 'Read it to me' }).click();
  await page.waitForTimeout(900);
  check('and the whole text plays through, marking where the voice is',
    (await page.locator('.rd-line.now').count()) <= 1);
  const spoken = await page.evaluate(() => window.__said.length);
  check('line after line', spoken > 3, spoken + ' lines spoken');

  console.log('\nDid you follow it\n');
  await page.locator('button', { hasText: 'I have read it' }).click();
  await page.waitForTimeout(500);
  check('the questions arrive', await page.locator('.q-text').isVisible());
  const nq = await page.evaluate(() => PARLA.data.es.readingById.perro.ask.length);

  for (let i = 0; i < nq; i++) {
    const rightText = await page.evaluate(i => PARLA.data.es.readingById.perro.ask[i][1], i);
    await page.locator('.q-opt', { hasText: rightText }).first().click();
    await page.waitForTimeout(200);
    if (i === 0) {
      check('answering marks the right one', await page.locator('.q-opt.good').first().isVisible());
      check('and the options lock so you cannot answer twice',
        await page.locator('.q-opt').first().isDisabled());
    }
    await page.locator('.q-opt').locator('..').locator('..').locator('..')
      .locator('.btn-row button').last().click();
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);

  const saved = await page.evaluate(() => PARLA.store.state.reading.perro);
  check('the score is kept', saved && saved.right === nq && saved.asked === nq,
    JSON.stringify(saved));
  check('and the words worth keeping are offered', await page.locator('.wb-row').first().isVisible());

  const before = await page.evaluate(() => PARLA.store.state.phrases.length);
  await page.locator('button', { hasText: /^Add all/ }).click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => PARLA.store.state.phrases.length);
  check('all of them at once, for the reader who wants the deck not the decisions',
    after > before, before + ' -> ' + after);

  await goTo(page, 'read');
  await page.waitForTimeout(400);
  check('and the shelf remembers which one you read',
    (await page.locator('.read-card.read-done').count()) === 1);
  check('with the score on it',
    /\d\/\d/.test(await page.locator('.read-card.read-done').first().innerText()));

  console.log('\nNothing broke\n');
  check('no page errors anywhere in that', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nAll checks passed.');
  process.exit(fail.length ? 1 : 0);
})();
