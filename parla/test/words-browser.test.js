/* The word bank and the dictionary-backed Ask screen, in a real browser at
 * phone size. What is being checked is that thirty-one thousand words arrive
 * without blocking the page, that the frequency bands are honest about what is
 * in the deck, and that a word taken from the bank ends up in the same
 * spaced-repetition deck as everything else.
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
  await page.evaluate(() => { PARLA.ui.say = function () {}; PARLA.speech.speak = function () {}; });

  console.log('Arriving\n');
  check('the app starts without waiting for a megabyte of dictionary',
    await page.locator('#nav').isVisible());
  const loaded = await page.evaluate(() => PARLA.dict.load());
  check('the dictionary loads on demand', loaded === true);
  const size = await page.evaluate(() => PARLA.dict.size());
  check('with the whole language in it', size > 25000, size.toLocaleString() + ' words');
  check('and the morphology engine comes up with it',
    await page.evaluate(() => PARLA.morph.ready()));

  console.log('\nThe word bank\n');
  await goTo(page, 'words');
  await page.waitForTimeout(700);
  check('it has its own place in the nav', await page.locator('.wb-list').isVisible());
  check('the frequency bands are all there', (await page.locator('.band-card').count()) === 7);
  check('it opens on the commonest words first',
    (await page.locator('.wb-term').first().innerText()).length < 12);

  const bars = await page.evaluate(() =>
    [...document.querySelectorAll('.band-card .bar i')].map(i => parseFloat(i.style.width)));
  check('the band bars show a real fraction, not a full bar every time',
    bars.length === 7 && bars.every(b => b >= 0 && b <= 100) && bars.some(b => b < 90),
    bars.map(b => b.toFixed(0) + '%').join(' '));

  const cov = await page.locator('.wb-big').first().innerText();
  check('coverage is counted against the top thousand', /^\d+ \/ \d+$/.test(cov), cov);

  console.log('\nSearching\n');
  await page.fill('.wb-controls input', 'sombra');
  await page.waitForTimeout(350);
  check('a Spanish word is found', /sombra/.test(await page.locator('.wb-term').first().innerText()));
  await page.fill('.wb-controls input', 'to melt');
  await page.waitForTimeout(350);
  check('so is an English meaning', (await page.locator('.wb-row').count()) > 0,
    await page.locator('.wb-en').first().innerText().catch(() => 'none'));
  await page.fill('.wb-controls input', '');
  await page.waitForTimeout(300);
  await page.locator('.tense-row button').filter({ hasText: /^Verbs$/ }).click();
  await page.waitForTimeout(350);
  check('and the list can be narrowed to one part of speech',
    (await page.locator('.wb-meta').first().innerText()).includes('verb'),
    await page.locator('.wb-meta').first().innerText());

  console.log('\nInto the deck\n');
  const before = await page.evaluate(() => (PARLA.store.state.phrases || []).length);
  const term = await page.locator('.wb-row:not(.have) .wb-term').first().innerText();
  await page.locator('.wb-row:not(.have) button.primary').first().click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => (PARLA.store.state.phrases || []).length);
  check('a word taken from the bank lands in the deck', after === before + 1,
    before + ' -> ' + after + '  (' + term + ')');
  check('and it is saved, not just shown',
    await page.evaluate(() => JSON.parse(localStorage.getItem('parla.save.v1')).phrases.length > 0));
  check('the row now says you have it', (await page.locator('.wb-row.have').count()) > 0);

  console.log('\nAsk, with a dictionary behind it\n');
  await goTo(page, 'coach');
  await page.waitForTimeout(300);

  await page.fill('.ask-input', 'pidiéndoselo');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  let card = await page.locator('.ask-card').innerText();
  check('a form nobody would find in a dictionary is worked back to its verb',
    /pedir/.test(card), card.split('\n')[0]);
  check('and it says what was done to it', /gerund/i.test(card) && /on the end/.test(card));
  check('with the whole conjugation of the verb it came from',
    await page.locator('.conj-table').isVisible());

  await page.fill('.ask-input', 'encontrar');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  card = await page.locator('.ask-card').innerText();
  check('a stem-changing verb is conjugated correctly',
    (await page.locator('.conj-row .conj-f').first().innerText()) === 'encuentro',
    await page.locator('.conj-row .conj-f').first().innerText());
  check('and the card explains why it bends rather than just saying "irregular"',
    /breaks when the stress/.test(card));
  check('the participle and gerund are given too',
    (await page.locator('.conj-extra').count()) === 1);

  await page.fill('.ask-input', 'güey');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  card = await page.locator('.ask-card').innerText();
  check('register is flagged, so nobody uses street slang in an interview',
    /informal|slang|vulgar/.test(card), card.split('\n').slice(0, 6).join(' | '));

  await page.fill('.ask-input', 'casas');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  check('an ambiguous form shows the other readings too',
    (await page.locator('.ask-reading').count()) >= 1);

  await page.fill('.ask-input', 'madrugar');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  card = await page.locator('.ask-card').innerText();
  check('and how common a word is, which is how you decide whether to learn it',
    /commonest|uncommon|everyday/.test(card), (card.match(/.*commonest.*|.*uncommon.*/) || [''])[0]);

  console.log('\nOn a phone\n');
  check('nothing overflows sideways',
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  await goTo(page, 'progress');
  await page.waitForTimeout(900);
  const stats = await page.locator('main').innerText();
  check('Stats says how much of the language you have',
    /How much of the language/.test(stats) && /of the top 3,000/i.test(stats));

  check('no page errors throughout', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll word-bank checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
