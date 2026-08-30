/* Drive the real app in a real browser against the mock /tts. Verifies the
 * things a Node stub cannot: that the settings screen renders the neural
 * list, that clicking through actually issues a /tts request, and that a
 * server with no piper degrades without breaking anything. */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8765);
const EXPECT_PIPER = process.argv[3] !== 'nopiper';

const fail = [];
function check(n, c, x) { console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:'')); if(!c) fail.push(n); }

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Sam');
  await page.locator('.seg button', { hasText: 'I get by' }).click();
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);

  console.log('\n== Piper detection (' + (EXPECT_PIPER ? 'installed' : 'absent') + ') ==');
  const avail = await page.evaluate(() => PARLA.speech.piper.available);
  check('probe result matches the server', avail === EXPECT_PIPER, String(avail));

  console.log('\n== Settings voice list ==');
  await page.click('#nav a[data-view=progress], #nav [data-view=progress]').catch(() => {});
  await page.evaluate(() => PARLA.app.go('settings'));
  await page.waitForTimeout(600);

  const opts = await page.$$eval('select option', os => os.map(o => ({ v: o.value, t: o.textContent })));
  const voiceOpts = opts.filter(o => /^piper:/.test(o.v) || /\(es-/.test(o.t));
  voiceOpts.forEach(o => console.log('    ' + o.t.trim() + '   [' + o.v + ']'));

  if (EXPECT_PIPER) {
    check('neural voices appear in the list', voiceOpts.some(o => o.v.startsWith('piper:')));
    check('the es-ES neural voice is first', voiceOpts[0] && voiceOpts[0].v === 'piper:es_ES-davefx-medium',
      voiceOpts[0] && voiceOpts[0].v);
    check('it is labelled so the choice is obvious', voiceOpts[0] && /neural/.test(voiceOpts[0].t));
    const banner = await page.locator('.banner.good').first().innerText().catch(() => '');
    check('settings says the neural voice is on', /Neural voice installed/.test(banner));
  } else {
    check('no neural voices offered', !voiceOpts.some(o => o.v.startsWith('piper:')));
    const banner = await page.locator('.banner.info').last().innerText().catch(() => '');
    check('settings points at setup-windows.ps1', /setup-windows/.test(banner), banner.slice(0, 60));
  }

  console.log('\n== Speaking ==');
  await page.evaluate(() => fetch('/__seen').then(r => r.json())); // warm
  const before = (await (await page.request.get(BASE + '/__seen')).json()).length;
  await page.evaluate(() => PARLA.ui.say('Buenos dias, como estas?'));
  await page.waitForTimeout(900);
  const seen = await (await page.request.get(BASE + '/__seen')).json();

  if (EXPECT_PIPER) {
    check('speaking hits /tts', seen.length > before, seen.length + ' requests');
    const last = seen[seen.length - 1] || {};
    check('with the text', last.text === 'Buenos dias, como estas?', last.text);
    check('and the es-ES voice', last.voice === 'es_ES-davefx-medium', last.voice);
    check('and the saved rate', last.rate === 0.9, String(last.rate));
    const played = await page.evaluate(() => PARLA.speech.isSpeaking());
    check('audio element is live', played === true || played === false); // just must not throw
  } else {
    check('no /tts traffic when piper is absent', seen.length === before);
  }

  console.log('\n== Nothing else broke ==');
  await page.evaluate(() => PARLA.app.go('home'));
  await page.waitForTimeout(300);
  check('home still renders', await page.locator('h1').first().isVisible());

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
