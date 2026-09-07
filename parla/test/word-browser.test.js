/* Tapping a word in the conversation, end to end in a real browser. */
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
  await page.evaluate(() => PARLA.app.go('talk', { id: 'cafe' }));
  await page.waitForTimeout(500);

  console.log('Tap a word\n');
  const words = await page.locator('.bubble.them .body .word').count();
  check('the partner\'s words are tappable', words > 2, words + ' words');
  check('punctuation is left alone, so the sentence still reads',
    (await page.locator('.bubble.them .body').first().innerText()).includes('¿'));

  // Pick a word that is genuinely not in the deck yet - most of the opener is,
  // which is the app behaving correctly and makes for a useless test.
  const target = await page.evaluate(() => {
    const norm = s => PARLA.brain.normalise(s);
    const known = new Set(PARLA.data.es.vocab.map(v => norm(v[0])));
    const words = [...document.querySelectorAll('.bubble.them .body .word')].map(w => w.textContent);
    for (const w of words) {
      const hit = PARLA.brain.lookupLocal(w, 'es');
      const lemma = hit ? hit.lemma : w;
      if (!known.has(norm(lemma)) && !known.has(norm(w))) return w;
    }
    return null;
  });
  check('there is a word here that is not already in the deck', !!target, String(target));

  await page.locator('.bubble.them .body .word', { hasText: target }).first().click();
  await page.waitForTimeout(600);
  check('a panel opens', await page.locator('.word-pop').isVisible());
  const popText = await page.locator('.word-pop').innerText();
  check('it offers to teach the word', /Learn this/.test(popText), popText.replace(/\n/g, ' | '));

  const before = await page.evaluate(() => (PARLA.store.state.phrases || []).length);
  await page.locator('.word-pop button', { hasText: 'Learn this' }).click();
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => (PARLA.store.state.phrases || []).length);
  check('learning it adds one word to the deck', after === before + 1, before + ' -> ' + after);
  const added = await page.evaluate(() => PARLA.store.state.phrases[0]);
  check('with the sentence it was actually said in',
    added.exEs && added.exEs.length > 10, added.exEs);
  check('the panel closes afterwards', await page.locator('.word-pop').count() === 0);

  console.log('\nIt reaches the deck\n');
  await page.evaluate(() => PARLA.app.go('review'));
  await page.waitForTimeout(400);
  const inDeck = await page.evaluate(() => {
    const mined = PARLA.store.state.phrases[0].es;
    const items = {};
    PARLA.data.es.vocab.forEach(v => items[v[0]] = 1);
    (PARLA.store.state.phrases || []).forEach(p => items[p.es] = 1);
    return Object.keys(items).indexOf(mined) !== -1;
  });
  check('the mined word is in the review pool', inDeck);

  console.log('\nAlready known\n');
  await page.evaluate(() => PARLA.app.go('talk', { id: 'cafe' }));
  await page.waitForTimeout(500);
  // A word already in the shipped deck must not be offered as new.
  const known = await page.evaluate(() => {
    const norm = s => PARLA.brain.normalise(s);
    const have = new Set(PARLA.data.es.vocab.map(v => norm(v[0])));
    const words = [...document.querySelectorAll('.bubble.them .body .word')].map(w => w.textContent);
    for (const w of words) {
      const hit = PARLA.brain.lookupLocal(w, 'es');
      if (hit && have.has(norm(hit.lemma))) return w;
    }
    return null;
  });
  check('there is a word here that is already known', !!known, String(known));
  await page.locator('.bubble.them .body .word', { hasText: known }).first().click();
  await page.waitForTimeout(600);
  check('a word you already have is not offered twice',
    (await page.locator('.word-pop button', { hasText: 'In your deck' }).count()) === 1);

  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
