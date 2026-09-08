/* Cloudflare Pages, faked well enough to be worth trusting.
 *
 * Serves parla/ as static files and routes /api/chat through the *real*
 * functions/api/chat.js, so the thing under test is the code that will run on
 * the edge rather than a stand-in for it. The Workers AI binding is faked; the
 * function's model-walking, trimming, and error shapes are not.
 *
 *   node test/mock-pages-server.js 8801            binding present, answers
 *   node test/mock-pages-server.js 8801 nobinding  no AI binding at all
 *   node test/mock-pages-server.js 8801 flaky      first models fail, a later one answers
 *   node test/mock-pages-server.js 8801 dead       every model fails
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

/* Load the real function. It is an ES module and this file is not, so strip the
 * export keywords and hand back the two handlers. Everything else runs as
 * written. */
function loadFunction() {
  const src = fs.readFileSync(path.join(ROOT, 'functions/api/chat.js'), 'utf8')
    .replace(/export\s+async\s+function/g, 'async function');
  return new Function(src + '\n; return { onRequestPost, onRequestGet };')();
}
const FN = loadFunction();

const REPLY = {
  reply_es: 'Claro que si. ¿Y para beber?',
  reply_en: 'Of course. And to drink?',
  asked_to_repeat: false,
  remember: [],
  say_this: { es: 'Un agua, por favor.', en: 'A water, please.' },
  correction: null
};

const calls = [];

/* A stand-in for env.AI. It records what it was asked and fails on cue. */
function fakeAI(mode) {
  return {
    async run(model, opts) {
      calls.push({ model, messages: opts.messages, max_tokens: opts.max_tokens });
      if (mode === 'dead') throw new Error('model unavailable');
      if (mode === 'flaky' && calls.length < 3) throw new Error('capacity');
      return { response: JSON.stringify(REPLY) };
    }
  };
}

const env = MODE === 'nobinding' ? {} : { AI: fakeAI(MODE) };

async function send(res, out) {
  const body = await out.text();
  const headers = {};
  out.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(out.status, headers);
  res.end(body);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/__calls') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(calls));
  }

  if (p === '/api/chat') {
    try {
      if (req.method === 'GET') return send(res, await FN.onRequestGet({ env }));
      let body = '';
      req.on('data', c => body += c);
      return req.on('end', async () => {
        const request = { json: async () => JSON.parse(body) };
        try {
          send(res, await FN.onRequestPost({ request, env }));
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
