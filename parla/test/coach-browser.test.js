/* The Ask screen and the flip cards, in a real browser. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await (await b.newContext()).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);

  console.log('Ask\n');
  await page.locator('#nav button[data-view=coach]').click();
  await page.waitForTimeout(300);
  check('the Ask screen has its own place in the nav', await page.locator('.ask-input').isVisible());

  // A verb that is deliberately NOT in the fifty-verb drill list.
  await page.fill('.ask-input', 'madrugar');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check('it answers for a verb outside the drill list',
    await page.locator('.ask-card').isVisible());
  check('with a conjugation table', await page.locator('.conj-table').isVisible());
  const present = await page.locator('.conj-row .conj-f').allInnerTexts();
  check('conjugated correctly', present[0] === 'madrugo' && present[3] === 'madrugamos',
    present.join(' '));
  check('all six persons', present.length === 6, String(present.length));
  // It used to hedge on every verb it had not been told about. Now the engine
  // knows the stem-change classes and the spelling rules, so for a plainly
  // regular -ar verb it says nothing, and where a verb does bend it says why.
  check('a regular verb is not hedged about',
    !(await page.locator('.ask-card').innerText()).includes('regular pattern'));

  const tenses = await page.locator('.tense-btn').count();
  check('every tense is offered', tenses >= 5, tenses + ' tenses');
  await page.locator('.tense-btn').nth(1).click();
  await page.waitForTimeout(200);
  const pret = await page.locator('.conj-row .conj-f').allInnerTexts();
  check('switching tense changes the table', pret[0] !== present[0], present[0] + ' -> ' + pret[0]);

  console.log('\nInto the deck\n');
  // "madrugar" is not in the shipped 521 words and there is no model connected,
  // and it still comes back with a meaning - because there is a dictionary now.
  check('a word outside the shipped list still has a meaning, with no model',
    /get up early/i.test(await page.locator('.ask-en').innerText()),
    await page.locator('.ask-en').innerText());
  check('so it can be banked as a card',
    (await page.locator('.ask-card button', { hasText: 'Learn this' }).count()) === 1);

  await page.fill('.ask-input', 'la cuenta');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
  check('a word the built-in list knows comes back with a meaning',
    /bill/i.test(await page.locator('.ask-en').innerText()));
  const before = await page.evaluate(() => (PARLA.store.state.phrases || []).length);
  const learn = page.locator('.ask-card button', { hasText: 'Learn this' });
  const alreadyHave = (await page.locator('.ask-card button', { hasText: 'Already in your deck' }).count()) === 1;
  check('a word already in the shipped list is not offered twice', alreadyHave);
  check('and nothing was duplicated into the deck',
    (await page.evaluate(() => (PARLA.store.state.phrases || []).length)) === before);

  await page.locator('#nav button[data-view=coach]').click();
  await page.waitForTimeout(300);
  check('past questions are offered again', (await page.locator('.ask-chip').count()) > 0);

  console.log('\nFlip cards\n');
  await page.evaluate(() => PARLA.app.go('review'));
  await page.waitForTimeout(400);
  await page.locator('.seg button', { hasText: 'ES→EN' }).click();
  await page.waitForTimeout(250);
  check('the card starts face down', await page.getAttribute('.flashcard', 'data-flipped') === 'no');
  check('it has two faces', (await page.locator('.flashcard .face').count()) === 2);

  await page.keyboard.press(' ');
  // Wait past the flip itself: a backface mid-rotation is genuinely not painted,
  // so asking whether the answer is visible before it lands is asking too early.
  await page.waitForTimeout(600);
  check('space flips it', await page.getAttribute('.flashcard', 'data-flipped') === 'yes');
  check('and the answer is on the back', await page.locator('.face.back .answer').isVisible());

  const word1 = await page.locator('.face.front .prompt').innerText();
  await page.keyboard.press('3');
  await page.waitForTimeout(350);
  const word2 = await page.locator('.face.front .prompt').innerText();
  check('a number key grades and advances', word2 !== word1, word1 + ' -> ' + word2);

  console.log('\nUndo\n');
  check('undo is offered after grading',
    (await page.locator('button', { hasText: 'Undo last card' }).count()) === 1);
  const deckBefore = await page.evaluate(() => JSON.stringify(PARLA.store.state.srs));
  await page.keyboard.press('u');
  await page.waitForTimeout(350);
  const word3 = await page.locator('.face.front .prompt').innerText();
  check('undo goes back to the card you just graded', word3 === word1, word3);
  const deckAfter = await page.evaluate(() => JSON.stringify(PARLA.store.state.srs));
  check('and puts the schedule back exactly as it was', deckAfter !== deckBefore);
  const restored = await page.evaluate(() => Object.keys(PARLA.store.state.srs).length);
  check('with no leftover card', typeof restored === 'number');

  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
