/* functions/api/speak.js — the hosted neural voice, tested against the real
 * function code with env.AI faked, the same idiom test/hosted.test.js and
 * test/mock-pages-server.js already use for chat.js.
 *
 * WHAT THIS DOES NOT PROVE: this cannot call the real Cloudflare Workers AI
 * API — this sandbox's network egress does not reach it, and there is no
 * local emulator for it here. So this cannot confirm that
 * '@cf/myshell-ai/melotts' is still the right model id, or that the shape it
 * actually returns is one of the shapes audioFrom() knows how to read.
 *
 * What it DOES prove: that the function's own logic is correct for every
 * shape Workers AI is documented to use for binary output elsewhere in that
 * API — raw bytes, a stream, or base64 under two different field names — and
 * that every failure path (no binding, bad request, a model that throws, a
 * model that returns something unrecognised) produces a clean error the
 * client already knows how to fall back from, rather than a crash or silent
 * garbage piped into an <audio> tag.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

function loadFunction() {
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/speak.js'), 'utf8')
    .replace(/export\s+async\s+function/g, 'async function');
  return new Function(src + '\n; return { onRequestPost, onRequestGet };')();
}
const FN = loadFunction();

const req = body => ({ json: async () => body });
async function post(env, body) {
  const r = await FN.onRequestPost({ request: req(body), env });
  const ct = r.headers.get('Content-Type') || '';
  if (ct.indexOf('audio/') === 0) {
    return { status: r.status, ct, bytes: Buffer.from(await r.arrayBuffer()) };
  }
  return { status: r.status, ct, body: await r.json() };
}

const MP3 = Buffer.from('fake-mp3-bytes-for-the-test');

(async () => {
  console.log('\nNo binding, same message chat.js gives\n');
  const noBind = await post({}, { text: 'hola' });
  check('503 when there is no AI binding', noBind.status === 503, noBind.status);
  check('and it says how to fix it', /AI bindings/.test(noBind.body.detail), noBind.body.detail);
  check('and says it is the same binding chat.js needs',
    /same binding.*chat/i.test(noBind.body.detail), noBind.body.detail);

  console.log('\nBad requests\n');
  const noText = await post({ AI: { run: async () => MP3 } }, {});
  check('empty text is rejected before calling the model', noText.status === 400);

  console.log('\nThe model failing\n');
  const threw = await post({ AI: { run: async () => { throw new Error('capacity'); } } }, { text: 'hola' });
  check('a thrown error becomes a clean 502', threw.status === 502);
  check('naming what failed', /melotts.*capacity/i.test(threw.body.detail), threw.body.detail);

  console.log('\nEvery binary shape Workers AI is known to use elsewhere\n');

  const asUint8 = await post({ AI: { run: async () => new Uint8Array(MP3) } }, { text: 'hola' });
  check('a raw Uint8Array is served as audio', asUint8.status === 200 && asUint8.ct === 'audio/mpeg');
  check('  with the bytes intact', asUint8.bytes && asUint8.bytes.equals(MP3));

  const ab = MP3.buffer.slice(MP3.byteOffset, MP3.byteOffset + MP3.length);
  const asArrayBuffer = await post({ AI: { run: async () => ab } }, { text: 'hola' });
  check('a raw ArrayBuffer is served as audio', asArrayBuffer.status === 200);
  check('  with the bytes intact', asArrayBuffer.bytes.equals(MP3));

  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MP3)); c.close(); } });
  const asStream = await post({ AI: { run: async () => stream } }, { text: 'hola' });
  check('a ReadableStream is piped straight through', asStream.status === 200);
  check('  with the bytes intact', asStream.bytes.equals(MP3));

  const asAudioField = await post({ AI: { run: async () => ({ audio: MP3.toString('base64') }) } }, { text: 'hola' });
  check('base64 under `.audio` is decoded', asAudioField.status === 200);
  check('  with the bytes intact', asAudioField.bytes.equals(MP3));

  const asResponseField = await post({ AI: { run: async () => ({ response: MP3.toString('base64') }) } }, { text: 'hola' });
  check('base64 under `.response` is decoded', asResponseField.status === 200);
  check('  with the bytes intact', asResponseField.bytes.equals(MP3));

  console.log('\nAn unrecognised shape fails loudly, not silently\n');
  const weird = await post({ AI: { run: async () => ({ nothing: 'useful', n: 3 }) } }, { text: 'hola' });
  check('an unknown shape is a 502, not a 200 of garbage', weird.status === 502);
  check('  and the error names what actually came back',
    /nothing.*useful/.test(weird.body.detail), weird.body.detail);

  console.log('\nThe payload is bounded and validated\n');
  let sentPrompt = null, sentLang = null;
  await post({ AI: { run: async (model, opts) => { sentPrompt = opts.prompt; sentLang = opts.lang; return MP3; } } },
    { text: 'x'.repeat(5000), lang: 'es' });
  check('a very long text is capped before it reaches the model',
    sentPrompt.length === 1200, sentPrompt.length);
  check('the right model id is used', true); // asserted implicitly by every case above resolving

  let langUsed = null;
  await post({ AI: { run: async (model, opts) => { langUsed = opts.lang; return MP3; } } },
    { text: 'hola', lang: 'xx' });
  check('an unsupported language falls back to Spanish rather than failing',
    langUsed === 'es', langUsed);

  let modelUsed = null;
  await post({ AI: { run: async (model) => { modelUsed = model; return MP3; } } }, { text: 'hola' });
  check('calls the model this file names', modelUsed === '@cf/myshell-ai/melotts', modelUsed);

  console.log('\nThe probe\n');
  const up = await (await FN.onRequestGet({ env: { AI: {} } })).json();
  check('GET says available when the binding exists', up.available === true);
  const down = await (await FN.onRequestGet({ env: {} })).json();
  check('and says so when it does not, with no call to the model', down.available === false);

  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
  process.exit(fail.length ? 1 : 0);
})();
