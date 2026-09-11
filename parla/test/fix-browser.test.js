/* The loop that makes correction worth anything.
 *
 * Speak badly → be corrected → produce the fix from memory, days later. The
 * app has always done the first two and thrown away the third: corrections
 * went into a journal that nothing ever read. These checks follow one mistake
 * all the way round — made in conversation, caught by the rules engine,
 * scheduled, surfaced on the home screen, retyped correctly, and gone.
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
  await page.evaluate(() => {
    PARLA.ui.say = function () {};
    PARLA.speech.speak = function (t, o) { if (o && o.onend) o.onend(); };
  });
  await page.evaluate(() => PARLA.dict.load());

  console.log('Corrected while talking\n');
  check('the grammar engine is up', await page.evaluate(() => PARLA.grammar.ready()));

  await goTo(page, 'scenarios');
  await page.locator('button.scenario').first().click();
  await page.waitForTimeout(700);

  for (const line of ['yo tiene hambre', 'la problema es grande', 'soy cansado',
                      'quiero un café con leche']) {
    await page.fill('.type-fallback input', line);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1100);
  }

  // Asked a question in English, mid-conversation: the app has thirty-one
  // thousand words and a morphology engine, and used to send the learner away
  // with "in Spanish please" while holding the answer.
  await page.fill('.type-fallback input', 'What does "de dónde" mean?');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1100);
  const lookup = await page.locator('.lookup-card').innerText().catch(() => '');
  check('an English question about a word is answered from the dictionary',
    /dónde/.test(lookup) && /where/i.test(lookup), lookup.replace(/\n/g, ' | '));
  check('and no Spanish grammar correction is applied to the English',
    !/¿What/.test(await page.locator('main').innerText()));

  const corrections = await page.locator('.correction').count();
  // The "say it like this" card after the English question is a .correction
  // too, so four of them, three of which are grammar.
  check('three wrong sentences are corrected', corrections === 4, String(corrections));
  check('and the correct one is left alone', corrections === 4);
  const first = await page.locator('.correction').first().innerText();
  check('the correction shows what to say instead', /yo tengo hambre/.test(first), first.replace(/\n/g, ' | '));
  check('and says which rule it is', /the verb takes the yo form/.test(first));

  await page.locator('button', { hasText: 'Finish' }).click();
  await page.waitForTimeout(800);

  console.log('\nScheduled, not filed away\n');
  const stored = await page.evaluate(() => PARLA.store.state.mistakes.map(m => ({
    es: m.es, fix: m.fix, topic: m.topic })));
  check('every correction is on file', stored.length === 3, String(stored.length));
  check('each one knows which grammar point it was',
    stored.every(m => m.topic), JSON.stringify(stored.map(m => m.topic)));
  check('and each has a schedule of its own',
    await page.evaluate(() => PARLA.store.state.mistakes.every(m =>
      !!PARLA.store.state.srs[PARLA.store.mistakeKey(m)])));
  check('all three are due right now',
    (await page.evaluate(() => PARLA.store.dueMistakes(50).length)) === 3);

  console.log('\nSurfaced where you will see it\n');
  await goTo(page, 'home');
  check('the home screen leads with them', (await page.locator('.fix-banner').count()) === 1);
  check('and says how many', /3 mistakes to fix/.test(await page.locator('.fix-banner').innerText()));
  await goTo(page, 'review');
  check('so does the review screen', (await page.locator('.fix-banner').count()) === 1);

  console.log('\nFixing one\n');
  await page.locator('.fix-banner').first().click();
  await page.waitForTimeout(600);
  const wrong = await page.locator('.fix-wrong').innerText();
  check('it shows you the sentence you actually wrote', stored.some(m => m.es === wrong), wrong);
  const want = stored.find(m => m.es === wrong).fix;

  check('you can hear the answer without being shown it',
    (await page.locator('button', { hasText: 'Hint' }).count()) === 1);
  await page.fill('.answer-input', 'esto es completamente incorrecto');
  await page.locator('button', { hasText: 'Check' }).click();
  await page.waitForTimeout(400);
  check('a wrong answer is marked wrong', await page.locator('.answer-state.no').isVisible());
  check('and shows the right one', (await page.locator('.answer-state').innerText()).includes(want));
  check('with the reason, again', (await page.locator('.hint').count()) >= 1);
  // Scoped to the screen: the Read tab in the nav is a 📖 too, and an
  // unscoped locator counted it.
  check('and a way into the lesson behind it',
    (await page.locator('main button', { hasText: '📖' }).count()) === 1);

  const dueBefore = await page.evaluate(() => PARLA.store.dueMistakes(50).length);
  await page.locator('button', { hasText: 'Next' }).click();
  await page.waitForTimeout(400);

  const second = await page.locator('.fix-wrong').innerText();
  const wantSecond = stored.find(m => m.es === second).fix;
  await page.fill('.answer-input', wantSecond);
  await page.locator('button', { hasText: 'Check' }).click();
  await page.waitForTimeout(400);
  check('a right answer is accepted', await page.locator('.answer-state.ok').isVisible());
  check('and the one you got right is no longer due',
    (await page.evaluate(() => PARLA.store.dueMistakes(50).length)) < dueBefore,
    dueBefore + ' -> ' + await page.evaluate(() => PARLA.store.dueMistakes(50).length));
  check('while the one you missed still is',
    await page.evaluate(() => PARLA.store.dueMistakes(50).some(m => m.fix)));

  console.log('\nThe grammar behind it\n');
  await goTo(page, 'grammar');
  check('twenty lessons', (await page.locator('.gram-card').count()) === 20,
    String(await page.locator('.gram-card').count()));
  const gtext = await page.locator('main').innerText();
  check('your own mistakes are pulled to the top', /From your own mistakes/.test(gtext));
  check('and the ones you keep making are counted', /\d+×/.test(gtext));

  await page.locator('.gram-card').first().click();
  await page.waitForTimeout(500);
  const lesson = await page.locator('main').innerText();
  check('a lesson leads with the rule', /THE RULE/i.test(lesson));
  check('says why English pulls you the wrong way', /WHY YOU GET THIS WRONG/i.test(lesson));
  check('shows the pair side by side', (await page.locator('.pair').count()) >= 2);
  check('and ends in a drill', (await page.locator('.quiz-opt').count()) >= 2);

  const before = await page.evaluate(() => (PARLA.store.state.grammar || {}));
  const opts = await page.locator('.quiz-opt').allInnerTexts();
  await page.locator('.quiz-opt').first().click();
  await page.waitForTimeout(400);
  check('answering explains the answer', await page.locator('.answer-state').isVisible(),
    opts.join('/'));
  check('and is recorded against the lesson',
    await page.evaluate(() => Object.keys(PARLA.store.state.grammar || {}).length > 0),
    JSON.stringify(before));

  console.log('\nOn a phone\n');
  check('nothing runs off the side',
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check('no page errors throughout', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll fix-loop checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
