/* The ElevenLabs premium voice, end to end in a real browser — same idiom as
 * test/hosted-tts-browser.test.js, but for a request that leaves the site
 * entirely: it goes straight from this browser to https://api.elevenlabs.io,
 * exactly like Gemini chat replies go straight to generativelanguage.googleapis.com.
 * There is no server of ours behind it to fake with mock-pages-server.js, so
 * this uses Playwright's own request interception on the real ElevenLabs URL
 * instead — proving the request shape and the fallback chain without needing
 * real network egress to ElevenLabs (which this sandbox cannot reach anyway;
 * confirmed separately with curl, blocked by the outbound proxy).
 *
 * WHAT THIS PROVES: with a key configured, casting picks ElevenLabs over an
 * installed hosted voice; speaking sends a real POST to the real
 * api.elevenlabs.io/v1/text-to-speech/<voice id> URL with the key in the
 * xi-api-key header and the text in the body; genuinely playable audio
 * handed back plays in a real browser without ever falling back to the
 * hosted voice or the browser's own; and a failing ElevenLabs call (bad key,
 * quota, network) falls through to the hosted voice rather than going silent.
 *
 * WHAT THIS CANNOT PROVE: that the real ElevenLabs API still accepts exactly
 * this request shape, since this sandbox cannot call it to find out. The
 * shape here (POST .../text-to-speech/{voice_id}, xi-api-key header,
 * {text, model_id} body, raw audio/mpeg back) has been stable and widely used
 * directly from browser JS for years, but it is still genuinely unverified
 * from here — the same caveat test/hosted-tts-browser.test.js states for
 * MeloTTS's response shape.
 *
 *   node test/mock-pages-server.js 8831            && node test/eleven-tts-browser.test.js 8831 ok
 *   node test/mock-pages-server.js 8832            && node test/eleven-tts-browser.test.js 8832 fail
 */
const { chromium } = require('playwright');
const BASE = 'http://localhost:' + (process.argv[2] || 8831);
const MODE = process.argv[3] || 'ok';
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));

  const elevenCalls = [];
  await context.route('https://api.elevenlabs.io/**', async (route) => {
    const req = route.request();
    elevenCalls.push({
      url: req.url(),
      headers: req.headers(),
      body: req.postData()
    });
    if (MODE === 'fail') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"bad key"}' });
    }
    // A real, short, genuinely playable WAV — served as audio/mpeg, exactly
    // the mismatch a real MP3 response would not have, but proving Chromium
    // plays the bytes it is actually given rather than trusting the label.
    const rate = 22050, seconds = 0.3, n = Math.floor(rate * seconds);
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * 220 * i / rate)), i * 2);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.concat([h, data]) });
  });

  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.fill('.onboard input[type=text]', 'Condo');
  await page.locator('button', { hasText: 'Start talking' }).click();
  await page.waitForTimeout(400);

  // Piper is never present on the public site, which this is standing in for.
  await page.evaluate(() => LUNOSIA.speech._setPiper(false, []));
  await page.waitForFunction(() => LUNOSIA.speech.hostedTTS.settled, null, { timeout: 5000 });

  await page.evaluate(() => {
    const real = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.__browserTTSUsed = false;
    window.speechSynthesis.speak = function (u) { window.__browserTTSUsed = true; return real(u); };
  });

  console.log({ ok: 'A real key, ElevenLabs answering with real audio',
                 fail: 'A key that ElevenLabs rejects' }[MODE] + '\n');

  const cast = await page.evaluate(() =>
    LUNOSIA.speech.castVoice('es', '', null, {}, 1, { key: 'sk_test_key', voiceId: '' }));
  const defaultVoiceId = await page.evaluate(() => LUNOSIA.speech.defaultElevenVoice);
  check('with a key configured, casting picks ElevenLabs over the hosted voice',
    cast.engine === 'eleven', JSON.stringify(cast));
  check('using the default voice id when none is chosen',
    cast.id === defaultVoiceId, cast.id);

  console.log('\nSpeaking\n');

  const said = await page.evaluate(() => new Promise(resolve => {
    let ended = false;
    LUNOSIA.speech.speak('¿Cuánto es, por favor?', {
      lang: 'es',
      elevenlabsKey: 'sk_test_key',
      onend: () => { ended = true; resolve({ ended: true }); }
    });
    setTimeout(() => resolve({ ended: ended, timedOut: !ended }), 6000);
  }));
  check('the whole chain finishes rather than hanging', said.ended === true, JSON.stringify(said));

  check('a real request reached the ElevenLabs route handler', elevenCalls.length >= 1, elevenCalls.length);
  check('at the real text-to-speech endpoint, with a voice id in the path',
    elevenCalls.length > 0 && /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/[^/]+$/.test(elevenCalls[0].url),
    elevenCalls[0] && elevenCalls[0].url);
  check('carrying the key in the xi-api-key header',
    elevenCalls.length > 0 && elevenCalls[0].headers['xi-api-key'] === 'sk_test_key');
  check('and the spoken text in the body',
    elevenCalls.length > 0 && elevenCalls[0].body && elevenCalls[0].body.indexOf('Cuánto es') !== -1,
    elevenCalls[0] && elevenCalls[0].body);

  const browserUsed = await page.evaluate(() => window.__browserTTSUsed);
  const hostedCalls = await (await fetch(BASE + '/__calls')).json();
  const speakCalls = hostedCalls.filter(c => c.prompt != null);

  if (MODE === 'ok') {
    check('real audio played end to end — the browser voice was never reached',
      browserUsed === false, browserUsed);
    check('and the hosted MeloTTS voice was never called either', speakCalls.length === 0, speakCalls.length);
  } else {
    check('a rejected key falls through to the hosted voice rather than the browser',
      speakCalls.length >= 1 && browserUsed === false,
      JSON.stringify({ speakCalls: speakCalls.length, browserUsed }));
  }

  console.log('\nNo page error, whichever path was taken\n');
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close();
  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
  process.exit(fail.length ? 1 : 0);
})();
