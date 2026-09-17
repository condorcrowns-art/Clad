/* The hosted voice, end to end against the real functions/api/speak.js in a
 * real browser — the same idiom test/hosted-browser.test.js uses for the chat
 * partner, and for the same reason: this is the code path a visitor to
 * lunosia.com who has never touched Piper actually goes through.
 *
 * WHAT THIS PROVES: the probe correctly detects the real function, casting
 * picks the hosted engine when nothing else is installed, speaking it posts
 * to the real /api/speak with the right payload, a real WAV handed back by
 * the mock model actually plays in a real browser — even served under the
 * wrong Content-Type, audio/mpeg, exactly as functions/api/speak.js always
 * declares regardless of what the model returns — without ever falling back
 * to the browser's own voice, and that when the model instead returns bytes
 * that are not real audio, the browser voice picks it up and the whole chain
 * still finishes rather than hanging.
 *
 * WHAT THIS CANNOT PROVE: that real Cloudflare Workers AI's MeloTTS returns
 * one of the shapes functions/api/speak.js knows how to read, since this
 * sandbox cannot call Cloudflare to find out. The 'badaudio' mode below is
 * the rehearsal for that: if the real shape ever turns out to be one
 * audioFrom() does not handle, this is the failure path it takes, and this
 * test is what says that path is a graceful fallback rather than silence.
 *
 *   node test/mock-pages-server.js 8821            && node test/hosted-tts-browser.test.js 8821 ok
 *   node test/mock-pages-server.js 8822 nobinding  && node test/hosted-tts-browser.test.js 8822 nobinding
 *   node test/mock-pages-server.js 8823 badaudio   && node test/hosted-tts-browser.test.js 8823 badaudio
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8821);
const MODE = process.argv[3] || 'ok';
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const page = await (await browser.newContext()).newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);

  // Piper is never present here — there is no local server behind this test,
  // which is also the truth of the public site.
  await page.evaluate(() => LUNOSIA.speech._setPiper(false, []));

  // A spy, not a stub: the browser's own synthesiser stays real (headless
  // Chromium answers with a genuine 'no voices installed' error), so seeing
  // it get called at all is proof the hosted voice was abandoned in favour
  // of it, whichever way that happened.
  await page.evaluate(() => {
    const real = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.__browserTTSUsed = false;
    window.speechSynthesis.speak = function (u) { window.__browserTTSUsed = true; return real(u); };
  });

  console.log({ ok: 'With the real function behind a fake binding, returning real audio',
                 nobinding: 'With no AI binding',
                 badaudio: 'With the binding up, but returning bytes that are not real audio'
               }[MODE] + '\n');

  await page.waitForFunction(() => LUNOSIA.speech.hostedTTS.settled, null, { timeout: 5000 });
  const avail = await page.evaluate(() => LUNOSIA.speech.hostedTTS.available);
  check('the probe reflects the real function’s answer',
    avail === (MODE !== 'nobinding'), avail);

  const cast = await page.evaluate(() =>
    LUNOSIA.speech.castVoice('es', '', null, {}, 1));
  if (MODE === 'nobinding') {
    check('with nothing installed, casting falls through to the browser voice',
      cast.engine === null, JSON.stringify(cast));
  } else {
    // 'badaudio' is a binding that answers, just not usefully — casting has
    // no way to know that in advance, so it still picks the hosted engine.
    check('with no Piper but the hosted voice up, casting picks it automatically',
      cast.engine === 'hosted', JSON.stringify(cast));
  }

  console.log('\nSpeaking\n');

  const said = await page.evaluate(() => new Promise(resolve => {
    let ended = false;
    LUNOSIA.speech.speak('¿Cuánto es, por favor?', {
      lang: 'es',
      onend: () => { ended = true; resolve({ ended: true }); }
    });
    // The point of the whole fallback chain is that this always resolves.
    // If it does not within a few seconds, something in the chain hung.
    setTimeout(() => resolve({ ended: ended, timedOut: !ended }), 6000);
  }));
  check('the whole chain finishes rather than hanging', said.ended === true, JSON.stringify(said));

  const browserUsed = await page.evaluate(() => window.__browserTTSUsed);
  if (MODE === 'ok') {
    check('real audio plays end to end — the browser voice is never reached',
      browserUsed === false, browserUsed);
  } else {
    check('the browser voice picks up the turn',
      browserUsed === true, browserUsed);
  }

  const calls = await (await fetch(BASE + '/__calls')).json();
  const speakCalls = calls.filter(c => c.prompt != null);
  if (MODE === 'nobinding') {
    check('with no binding, the edge function is never called at all', speakCalls.length === 0,
      speakCalls.length);
  } else {
    check('the real function was actually called', speakCalls.length >= 1, speakCalls.length);
    check('carrying the text that was spoken',
      speakCalls.length > 0 && speakCalls[0].prompt.indexOf('Cuánto es') !== -1,
      speakCalls[0] && speakCalls[0].prompt);
    check('and the model this file is meant to call',
      speakCalls.length > 0 && speakCalls[0].model === '@cf/myshell-ai/melotts',
      speakCalls[0] && speakCalls[0].model);
  }

  console.log('\nNo page error, whichever path was taken\n');
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
  process.exit(fail.length ? 1 : 0);
})();
