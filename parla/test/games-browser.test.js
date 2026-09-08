/* The study games, in a real browser at phone size.
 *
 * These are the screens that have to work with no microphone, no model and no
 * network - on a train, on a phone, with the deck the user has actually built.
 * So the checks here are about the whole loop: the game plays, a right answer
 * scores, a wrong answer shows the right one, finishing banks a best, and every
 * tap lands back in the same spaced-repetition deck the review screen uses.
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 ' +
             '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' };

async function boot(browser) {
  const page = await (await browser.newContext(PHONE)).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);
  // The games never speak out loud in a test runner, but they do call through
  // to the speech layer - so record what they asked for instead of playing it.
  await page.evaluate(() => {
    window.__spoken = [];
    PARLA.ui.say = function (t) { window.__spoken.push(String(t)); };
    PARLA.speech.speak = function (t) { window.__spoken.push(String(t)); };
    PARLA.speech.cancel = function () {};
  });
  return { page, errs };
}

/* Spanish -> English, exactly as the games build their tiles. */
const MAP = `(() => { const m = {};
  (PARLA.data.es.vocab || []).forEach(v => { if (v[1]) m[v[0]] = v[1]; });
  (PARLA.store.state.phrases || []).forEach(p => { if (p.en) m[p.es] = p.en; });
  return m; })()`;

async function open(page, id) {
  await page.evaluate(g => PARLA.app.go('game', { id: g }), id);
  await page.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const { page, errs } = await boot(browser);

  console.log('The menu\n');
  await page.locator('#nav button[data-view=games]').click();
  await page.waitForTimeout(300);
  check('games have their own place in the nav', await page.locator('.game-card').first().isVisible());
  check('all four are offered', (await page.locator('.game-card').count()) === 4,
    (await page.locator('.game-card').count()) + ' cards');
  check('nothing overflows the phone',
    (await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);

  const reviewsBefore = await page.evaluate(() => PARLA.store.state.progress.totals.reviews);

  /* ── Pairs ─────────────────────────────────────────────── */
  console.log('\nPairs\n');
  await open(page, 'match');
  const tiles = await page.locator('.tile').count();
  check('the board is dealt in pairs', tiles === 16, tiles + ' tiles');
  check('half of them are Spanish', (await page.locator('.tile.es').count()) === tiles / 2);
  check('and there is a clock', /\d+s/.test(await page.locator('main .chip').first().innerText()));

  const solved = await page.evaluate(async (mapSrc) => {
    const map = eval(mapSrc);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let wrongSeen = false;
    for (let guard = 0; guard < 60; guard++) {
      const live = [...document.querySelectorAll('.tile:not(.gone)')];
      if (!live.length) break;
      const es = live.find(t => t.classList.contains('es'));
      if (!es) return { error: 'a Spanish tile was left with no partner' };
      const want = map[es.textContent];
      const cands = live.filter(t => !t.classList.contains('es') && t.textContent === want);
      if (!cands.length) return { error: 'no English tile for ' + es.textContent };
      for (const c of cands) {
        es.click(); c.click();
        await sleep(80);
        if (es.classList.contains('gone')) break;
        wrongSeen = wrongSeen || c.classList.contains('wrong');
        await sleep(700);
      }
      if (!es.classList.contains('gone')) return { error: 'stuck on ' + es.textContent };
    }
    return { left: document.querySelectorAll('.tile:not(.gone)').length, wrongSeen };
  }, MAP);
  check('every pair can be matched', solved.left === 0, solved.error || (solved.left + ' left'));

  await page.waitForTimeout(400);
  check('clearing the board ends the game', await page.locator('.game-final').isVisible());
  const banked = await page.evaluate(() => PARLA.store.state.gameBest.match);
  check('and banks a score', banked > 0, String(banked));
  check('which survives a reload', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('parla.save.v1')).gameBest.match > 0));
  check('it offers another round', (await page.locator('button', { hasText: 'Again' }).count()) === 1);

  /* ── Word rush ─────────────────────────────────────────── */
  console.log('\nWord rush\n');
  await open(page, 'rush');
  check('a Spanish word is put up', (await page.locator('.quiz-prompt.es').innerText()).length > 0);
  check('with four ways to go', (await page.locator('.quiz-opt').count()) === 4);

  const rush = await page.evaluate(async (mapSrc) => {
    const map = eval(mapSrc);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const scoreOf = () => Number(document.querySelector('main .chip.hot').textContent);
    let rightRun = 0;
    for (let i = 0; i < 4; i++) {
      const want = map[document.querySelector('.quiz-prompt').textContent];
      const opt = [...document.querySelectorAll('.quiz-opt')].find(o => o.textContent === want);
      if (!opt) return { error: 'the right answer was not among the options' };
      opt.click();
      await sleep(60);
      if (!opt.classList.contains('right')) return { error: 'a right answer was not marked right' };
      rightRun++;
      await sleep(340);
    }
    const afterRight = scoreOf();
    const streakShown = /in a row/.test(document.querySelector('.quiz').textContent);

    // Now get one wrong on purpose.
    const want = map[document.querySelector('.quiz-prompt').textContent];
    const bad = [...document.querySelectorAll('.quiz-opt')].find(o => o.textContent !== want);
    bad.click();
    await sleep(80);
    const marked = bad.classList.contains('wrong');
    const revealed = [...document.querySelectorAll('.quiz-opt.right')].some(o => o.textContent === want);
    const ignoresSecondTap = (() => {
      const other = [...document.querySelectorAll('.quiz-opt')].find(o => o !== bad);
      const before = scoreOf(); other.click(); return scoreOf() === before;
    })();
    await sleep(1000);
    return { rightRun, afterRight, streakShown, marked, revealed, ignoresSecondTap,
             afterWrong: scoreOf(), moved: document.querySelectorAll('.quiz-prompt').length === 1 };
  }, MAP);
  check('a right answer scores', rush.afterRight > 0, rush.error || String(rush.afterRight));
  check('a streak is worth more than a single', rush.afterRight > 40, String(rush.afterRight));
  check('and the streak is shown', rush.streakShown === true);
  check('a wrong answer is marked wrong', rush.marked === true);
  check('and the right one is revealed', rush.revealed === true);
  check('a second tap on the same question is ignored', rush.ignoresSecondTap === true);
  check('a wrong answer costs points', rush.afterWrong < rush.afterRight,
    rush.afterRight + ' -> ' + rush.afterWrong);
  check('but never below zero', rush.afterWrong >= 0);
  check('and the game moves on', rush.moved === true);

  /* ── El or la ──────────────────────────────────────────── */
  console.log('\nEl or la\n');
  await open(page, 'gender');
  const opts = await page.locator('.quiz-opt').allInnerTexts();
  check('only the two articles are offered', opts.length === 2 && opts.includes('el') && opts.includes('la'),
    opts.join('/'));
  check('the article is stripped from the prompt',
    !/^(el|la)\s/i.test(await page.locator('.quiz-prompt').innerText()),
    await page.locator('.quiz-prompt').innerText());
  check('and the meaning is given as a hint',
    (await page.locator('.quiz .small.muted').innerText()).length > 0);

  const gender = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const article = {};
    (PARLA.data.es.vocab || []).forEach(v => {
      const m = /^(el|la)\s+(.+)$/i.exec(v[0]);
      if (m) article[m[2]] = m[1].toLowerCase();
    });
    let asked = 0, wrongPrompts = 0;
    for (let i = 0; i < 3; i++) {
      const noun = document.querySelector('.quiz-prompt').textContent;
      const want = article[noun];
      if (!want) { wrongPrompts++; break; }
      asked++;
      [...document.querySelectorAll('.quiz-opt')].find(o => o.textContent === want).click();
      await sleep(340);
    }
    return { asked, wrongPrompts, score: Number(document.querySelector('main .chip.hot').textContent) };
  });
  check('only nouns that carry an article are asked about', gender.wrongPrompts === 0);
  check('three in a row are answered', gender.asked === 3, String(gender.asked));
  check('and they score', gender.score > 0, String(gender.score));

  /* ── Dictation ─────────────────────────────────────────── */
  console.log('\nDictation\n');
  await page.evaluate(() => { window.__spoken = []; });
  await open(page, 'dictate');
  await page.waitForTimeout(300);
  check('the word is read out before you type', (await page.evaluate(() => window.__spoken.length)) > 0);
  check('there is somewhere to type it', await page.locator('.answer-input').isVisible());
  check('you can hear it again', (await page.locator('button', { hasText: 'Again' }).count()) === 1);
  check('and slower', (await page.locator('button', { hasText: 'Slower' }).count()) === 1);
  check('with no clock on this one', (await page.locator('main .chip').first().innerText()).trim() === '∞');

  const heard = await page.evaluate(() => window.__spoken[0]);
  await page.fill('.answer-input', heard.toUpperCase().replace(/[áéíóúÁÉÍÓÚ]/g,
    c => 'aeiouAEIOU'['áéíóúÁÉÍÓÚ'.indexOf(c)]));
  await page.locator('button', { hasText: 'Check' }).click();
  await page.waitForTimeout(120);
  check('accents and capitals are forgiven', await page.locator('.answer-state.ok').isVisible(), heard);

  await page.waitForTimeout(800);
  const heard2 = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
  await page.fill('.answer-input', 'zzzz');
  await page.locator('button', { hasText: 'Check' }).click();
  await page.waitForTimeout(120);
  const verdict = await page.locator('.answer-state.no').innerText();
  check('a wrong answer shows what it was', verdict.includes(heard2), verdict);
  check('and its meaning too', verdict.includes('—'), verdict);
  check('a second Check does not double-count', await page.evaluate(async () => {
    const before = PARLA.store.state.progress.totals.reviews;
    [...document.querySelectorAll('button')].find(b => b.textContent === 'Check').click();
    return PARLA.store.state.progress.totals.reviews === before;
  }));

  /* ── It is all one deck ────────────────────────────────── */
  console.log('\nOne deck\n');
  const after = await page.evaluate(() => ({
    reviews: PARLA.store.state.progress.totals.reviews,
    cards: Object.keys(PARLA.store.state.srs).length,
    due: Object.values(PARLA.store.state.srs).filter(c => c.due).length
  }));
  check('playing counts as reviewing', after.reviews > reviewsBefore,
    reviewsBefore + ' -> ' + after.reviews);
  check('games put cards into the same deck as Review', after.cards > 0, after.cards + ' cards');
  check('and every card comes back with a due date', after.due === after.cards);

  /* ── Leaving mid-game ──────────────────────────────────── */
  console.log('\nLeaving\n');
  await open(page, 'rush');
  await page.locator('#nav button[data-view=home]').click();
  await page.waitForTimeout(1600);
  check('leaving a game stops its clock',
    (await page.locator('.quiz').count()) === 0 && (await page.locator('.game-final').count()) === 0);
  check('and the app is still on the screen you asked for',
    await page.locator('#nav button[data-view=home]').evaluate(b => b.getAttribute('aria-current') === 'page'));

  check('no page errors throughout', errs.length === 0, errs.join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll games checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
