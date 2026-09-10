/* Writing, in a real browser at phone size.
 *
 * The loop this has to close: you write badly, the rules catch it, and the
 * mistake goes into the same spaced-repetition queue as everything else so it
 * comes back in a day or two and you have to produce the fix from memory.
 * Anything short of that is a spell-checker.
 *
 * The other thing checked here is honesty. "Nothing to fix" means no rule
 * fired, which is not the same as "this is good Spanish", and a tool that lets
 * you believe otherwise teaches you to trust it where it cannot help.
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
  await page.evaluate(() => PARLA.dict.load());

  console.log('The list\n');
  await goTo(page, 'write');
  await page.waitForTimeout(400);
  check('twenty-four tasks', (await page.locator('.read-card').count()) === 24,
    String(await page.locator('.read-card').count()));
  check('graded in three bands', (await page.locator('.level-tag').count()) >= 3);
  check('each shows the question, in Spanish',
    /[¿?]/.test(await page.locator('.read-title').first().innerText()));

  console.log('\nOne task\n');
  await page.locator('.read-card').first().click();
  await page.waitForTimeout(400);
  check('the prompt is there', await page.locator('.write-ask').isVisible());
  check('with words you will reach for', (await page.locator('.hint-chip').count()) >= 3);
  // Looking a word up and then typing it from memory is two chances to spell
  // it wrong for no learning.
  await page.locator('.hint-chip').first().click();
  await page.waitForTimeout(150);
  const afterChip = await page.locator('.write-box').inputValue();
  check('and tapping one drops it in the box', afterChip.trim().length > 2, afterChip);
  check('nothing is revealed before you write',
    !(await page.locator('.write-model').first().isVisible().catch(() => false)));

  console.log('\nWriting badly\n');
  await page.fill('.write-box',
    'Yo tiene dos hermano. Me gusta los libros. Mi casa es muy pequeño.');
  check('it counts the words', /13 words/.test(await page.locator('.write-count').innerText()),
    await page.locator('.write-count').innerText());
  await page.locator('button', { hasText: 'Check it' }).click();
  await page.waitForTimeout(900);

  const lines = await page.locator('.write-line.no').count();
  check('every wrong sentence is marked', lines === 3, String(lines));
  const first = await page.locator('.write-line.no').first().innerText();
  check('showing what you wrote and what it should be',
    /Yo tiene dos hermano/.test(first) && /Yo tengo dos hermanos/.test(first),
    first.replace(/\n/g, ' | '));
  check('and the rule that says so', /yo form/.test(first), first.replace(/\n/g, ' | '));
  check('with a way into the lesson behind it',
    (await page.locator('main .write-line button').count()) >= 1);

  const all = await page.locator('.write-line.no').allInnerTexts();
  check('gustar is caught, which is the whole point',
    all.some(t => /Me gustan los libros/.test(t)), all.join(' / ').replace(/\n/g, ' '));
  // The stem used to come from the folded lookup key, so this printed
  // "pequena" and taught a misspelling.
  check('and the correction keeps its ñ',
    all.some(t => /pequeña/.test(t)), all.join(' / ').replace(/\n/g, ' '));

  console.log('\nInto the queue, not a journal\n');
  const mistakes = await page.evaluate(() => PARLA.store.state.mistakes.map(m => ({
    es: m.es, fix: m.fix, topic: m.topic, from: m.from })));
  check('all three are on file', mistakes.length === 3, JSON.stringify(mistakes.map(m => m.topic)));
  check('each knows which grammar point it was', mistakes.every(m => m.topic));
  check('and that it came from writing', mistakes.every(m => m.from === 'writing'));
  check('each has a schedule of its own',
    await page.evaluate(() => PARLA.store.state.mistakes.every(m =>
      !!PARLA.store.state.srs[PARLA.store.mistakeKey(m)])));
  check('so they are due to come back',
    (await page.evaluate(() => PARLA.store.dueMistakes(50).length)) === 3);

  await goTo(page, 'review');
  await page.waitForTimeout(400);
  check('and Review says so',
    /3 of your own mistakes are due/.test(await page.locator('.fix-banner').innerText()),
    await page.locator('.fix-banner').innerText());

  console.log('\nWhat it will not claim\n');
  await page.evaluate(() => PARLA.app.go('task', { id: 'familia' }));
  await page.waitForTimeout(400);
  await page.fill('.write-box', 'Tengo dos hermanas y un hermano pequeño.');
  await page.locator('button', { hasText: 'Check it' }).click();
  await page.waitForTimeout(800);
  check('correct Spanish is left alone', (await page.locator('.write-line.no').count()) === 0);
  const verdict = await page.locator('main .banner').last().innerText();
  // Silence is not approval, and saying so is the difference between a tool
  // you can trust and one you learn to ignore.
  check('but it does not call it good Spanish',
    /not the same as/.test(verdict), verdict.replace(/\n/g, ' '));
  check('it says what the rules can and cannot see',
    /agreement, person, ser against estar/.test(verdict));
  check('and the model answers come after, never before',
    (await page.locator('.write-model').count()) === 2);
  check('along with the grammar the question was testing',
    /drags its article/.test(await page.locator('main').innerText()));

  const written = await page.evaluate(() => PARLA.store.state.writing);
  check('a clean run is recorded as clean',
    written.familia && written.familia.clean === true, JSON.stringify(written));

  await goTo(page, 'write');
  await page.waitForTimeout(400);
  check('and the list remembers which ones you have done',
    (await page.locator('.read-card.read-done').count()) === 2,
    String(await page.locator('.read-card.read-done').count()));

  console.log('\nOn a phone\n');
  check('nothing runs off the side',
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check('no page errors throughout', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nAll writing checks passed.');
  process.exit(fail.length ? 1 : 0);
})();
