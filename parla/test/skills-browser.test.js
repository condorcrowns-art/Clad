/* The stats screen, and whether it tells you the truth.
 *
 * The app teaches six skills and this screen counted two. That is not merely
 * incomplete — it is misleading, because a learner reading it would conclude
 * they were doing well while having never once written a sentence.
 *
 * The part worth testing is not that six cards render. It is that the screen
 * finds the skill you have been avoiding and says so. People practise what
 * they are already good at, and a line that reads "you have spoken twelve
 * times and written nothing" is worth more than four more counters nobody
 * looks at.
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

  console.log('Before you have done anything\n');
  await goTo(page, 'progress');
  await page.waitForTimeout(500);
  check('all six skills are shown', (await page.locator('.skill').count()) === 6,
    String(await page.locator('.skill').count()));
  const names = (await page.locator('.skill-name').allInnerTexts()).join(' ');
  check('named, so you can see what the app even teaches',
    /Speaking/.test(names) && /Listening/.test(names) && /Reading/.test(names) &&
    /Writing/.test(names) && /Sounds/.test(names) && /Grammar/.test(names), names);
  // On day one there is nothing to be behind on, and telling someone who has
  // done nothing that they are neglecting writing is noise.
  check('but nobody is told off before they have started',
    (await page.locator('main .fix-banner').count()) === 0);

  console.log('\nOnce there is a pattern\n');
  await page.evaluate(() => {
    const s = PARLA.store;
    s.state.progress.totals.sessions = 12;
    s.state.progress.totals.minutes = 84;
    s.markRead('perro', 3, 3); s.markRead('autobus', 2, 3); s.markRead('cocina', 3, 3);
    s.markHeard('perro', 3, 3, 8);
    s.state.sounds = { rr: { tries: 9, ok: 7 }, j: { tries: 6, ok: 5 } };
    s.state.grammar = { gustar: { tries: 5, ok: 4 } };
    s.save();
  });
  await goTo(page, 'progress');
  await page.waitForTimeout(500);

  const cards = await page.locator('.skill').allInnerTexts();
  check('speaking counts conversations', /12/.test(cards[0]) && /1h 24m/.test(cards[0]),
    cards[0].replace(/\n/g, ' '));
  // A full bar next to "12 conversations" would say you are finished with
  // speaking Spanish, which is not a thing that happens.
  check('and does not claim a full bar, having no ceiling to fill',
    await page.evaluate(() => {
      const b = document.querySelectorAll('.skill')[0].querySelector('.bar');
      return b.classList.contains('no-ceiling') && !b.querySelector('i');
    }));
  check('reading is 3 of 12', /3 \/ 12/.test(cards[2]), cards[2].replace(/\n/g, ' '));
  check('listening is counted apart from reading', /1 \/ 12/.test(cards[1]),
    cards[1].replace(/\n/g, ' '));
  check('writing is 0 of 24', /0 \/ 24/.test(cards[3]), cards[3].replace(/\n/g, ' '));

  const nudge = await page.locator('main .fix-banner').innerText();
  check('the one being skipped is named', /not started writing/.test(nudge),
    nudge.replace(/\n/g, ' '));
  await page.locator('main .fix-banner').click();
  await page.waitForTimeout(400);
  check('and it goes there', /#write/.test(await page.evaluate(() => location.hash)),
    await page.evaluate(() => location.hash));

  console.log('\nAnd it moves when you do the thing\n');
  await page.evaluate(() => {
    // Six written tasks: writing is no longer the neglected one.
    ['presentarse','familia','gustos','rutina','casa','comida']
      .forEach(id => PARLA.store.markWritten(id, 0));
    PARLA.store.save();
  });
  await goTo(page, 'progress');
  await page.waitForTimeout(500);
  const nudge2 = await page.locator('main .fix-banner').innerText().catch(() => '');
  check('it stops nagging about writing', !/writing/.test(nudge2), nudge2.replace(/\n/g, ' '));
  check('and points at whatever is furthest behind now',
    /Grammar|Listening|Sounds/i.test(nudge2), nudge2.replace(/\n/g, ' '));

  console.log('\nThe practice counters\n');
  const practice = await page.locator('main').innerText();
  check('writing and listening are counted there too',
    /caught in writing/i.test(practice) && /lines caught by ear/i.test(practice),
    practice.split('\n').filter(l => /caught/i.test(l)).join(' | '));

  console.log('\nOn a phone\n');
  check('nothing runs off the side',
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  check('no page errors', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nAll stats checks passed.');
  process.exit(fail.length ? 1 : 0);
})();
