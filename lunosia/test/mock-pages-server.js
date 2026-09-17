/* Cloudflare Pages, faked well enough to be worth trusting.
 *
 * Serves the app as static files and routes /api/chat and /api/speak through
 * the *real* functions/api/chat.js and functions/api/speak.js, so the thing
 * under test is the code that will run on the edge rather than a stand-in
 * for it. The Workers AI binding is faked; the functions' model-walking,
 * trimming, and error shapes are not.
 *
 * One fake AI binding serves both endpoints, exactly as the real deployment
 * has one — it tells a TTS call from a chat call by which of `messages` or
 * `prompt` the request carries, the same way the two real functions differ.
 * That means `dead`/`flaky` degrade both endpoints together, which is the
 * accurate failure mode: Workers AI going down does not go down for one
 * model and not the other.
 *
 *   node test/mock-pages-server.js 8801            binding present, answers
 *   node test/mock-pages-server.js 8801 nobinding  no AI binding at all
 *   node test/mock-pages-server.js 8801 flaky      first models fail, a later one answers
 *   node test/mock-pages-server.js 8801 dead       every model fails
 *   node test/mock-pages-server.js 8801 badaudio   /api/speak answers, but not with real audio
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8801);
const MODE = process.argv[3] || 'ok';

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
               '.webmanifest':'application/manifest+json' };

/* Load a real function file. It is an ES module and this file is not, so
 * strip the export keywords and hand back the two handlers. Everything else
 * runs as written. */
function loadFunction(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/export\s+async\s+function/g, 'async function');
  return new Function(src + '\n; return { onRequestPost, onRequestGet };')();
}
const CHAT = loadFunction('functions/api/chat.js');
const SPEAK = loadFunction('functions/api/speak.js');

const REPLY = {
  reply_es: 'Claro que si. ¿Y para beber?',
  reply_en: 'Of course. And to drink?',
  asked_to_repeat: false,
  remember: [],
  say_this: { es: 'Un agua, por favor.', en: 'A water, please.' },
  correction: null
};

const calls = [];

/* A real, playable WAV — same trick test/mock-tts-server.js uses for Piper,
 * duplicated rather than shared because that file is untouched and working.
 * Chromium plays this correctly even served under the wrong Content-Type
 * (checked directly: a WAV labelled audio/mpeg still fires 'ended', not
 * 'error'), which is what functions/api/speak.js always declares regardless
 * of what the model actually returns. That means a real browser test against
 * this server can prove the full chain plays real audio, not just that it
 * fails gracefully when the bytes are garbage. */
function wav(seconds) {
  const rate = 22050, n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(6000 * Math.sin(2 * Math.PI * 220 * i / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const FAKE_MP3 = wav(0.3);

/* A stand-in for env.AI, shared by both endpoints exactly as the real binding
 * is. It tells a TTS call from a chat call by shape — `opts.prompt` is
 * speak.js's request, `opts.messages` is chat.js's — the same distinction
 * the two real functions make when they build their own requests. */
function fakeAI(mode) {
  return {
    async run(model, opts) {
      calls.push({ model, messages: opts.messages, max_tokens: opts.max_tokens, prompt: opts.prompt });
      if (mode === 'dead') throw new Error('model unavailable');
      if (mode === 'flaky' && calls.length < 3) throw new Error('capacity');
      if (opts && opts.prompt != null) {
        // 'badaudio' answers with bytes that are not real audio, to prove the
        // client falls back to the browser voice rather than failing outright
        // — a stand-in for real MeloTTS ever returning a shape audioFrom()
        // does not recognise. Every other mode returns genuinely playable
        // audio, so the happy path is tested as a happy path, not assumed.
        return mode === 'badaudio' ? new Uint8Array(Buffer.from('not-real-audio'))
                                    : new Uint8Array(FAKE_MP3);
      }
      return { response: JSON.stringify(REPLY) };
    }
  };
}

const env = MODE === 'nobinding' ? {} : { AI: fakeAI(MODE) };

// Binary-safe: .text() would corrupt audio bytes by decoding them as UTF-8
// and re-encoding on the way out, which is exactly the kind of bug this
// server exists to catch rather than commit.
async function sendBinary(res, out) {
  const buf = Buffer.from(await out.arrayBuffer());
  const headers = {};
  out.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(out.status, headers);
  res.end(buf);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/__calls') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(calls));
  }

  if (p === '/api/chat' || p === '/api/speak') {
    const FN = p === '/api/chat' ? CHAT : SPEAK;
    // sendBinary handles both cases correctly: a JSON error response's bytes
    // round-trip through arrayBuffer() exactly, and it is the only one of
    // the two that does not corrupt an audio/mpeg body — so it is simplest
    // to use it everywhere here rather than pick per response.
    try {
      if (req.method === 'GET') return sendBinary(res, await FN.onRequestGet({ env }));
      let body = '';
      req.on('data', c => body += c);
      return req.on('end', async () => {
        const request = { json: async () => JSON.parse(body) };
        try {
          sendBinary(res, await FN.onRequestPost({ request, env }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'threw', detail: String(e) }));
        }
      });
    } catch (e) {
      res.writeHead(500); return res.end(String(e));
    }
  }

  const rel = decodeURIComponent(p).replace(/^\/+/, '') || 'index.html';
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
                       'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(full));
}).listen(PORT, () => console.log('mock pages server on ' + PORT + ' mode=' + MODE));
