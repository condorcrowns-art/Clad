/* Static server for parla/ that also stands in for the /tts endpoints
 * serve.ps1 exposes, so the browser half can be tested without Windows. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = require('path').join(__dirname, '..');
const PORT = Number(process.argv[2] || 8765);
const HAVE_PIPER = process.argv[3] !== 'nopiper';

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png' };

const VOICES = [
  { id:'es_MX-claude-high',   name:'claude', locale:'es_MX', lang:'es', quality:'high' },
  { id:'es_ES-davefx-medium', name:'davefx', locale:'es_ES', lang:'es', quality:'medium' }
];

/* A real, playable WAV so Audio.play() behaves like it will in production. */
function wav(seconds) {
  const rate = 22050, n = Math.floor(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(6000 * Math.sin(2*Math.PI*220*i/rate)), i*2);
  const h = Buffer.alloc(44);
  h.write('RIFF',0); h.writeUInt32LE(36+data.length,4); h.write('WAVE',8);
  h.write('fmt ',12); h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(1,22);
  h.writeUInt32LE(rate,24); h.writeUInt32LE(rate*2,28); h.writeUInt16LE(2,32); h.writeUInt16LE(16,34);
  h.write('data',36); h.writeUInt32LE(data.length,40);
  return Buffer.concat([h, data]);
}

const seen = [];

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  if (p === '/__seen') {
    res.writeHead(200, {'Content-Type':'application/json'});
    return res.end(JSON.stringify(seen));
  }

  if (p === '/tts/voices') {
    res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({ engine:'piper', available: HAVE_PIPER, voices: HAVE_PIPER ? VOICES : [] }));
  }

  if (p === '/tts') {
    if (req.method !== 'POST') { res.writeHead(405); return res.end('{}'); }
    let body = '';
    req.on('data', c => body += c);
    return req.on('end', () => {
      let j = {}; try { j = JSON.parse(body); } catch (e) {}
      seen.push(j);
      if (!HAVE_PIPER) { res.writeHead(503, {'Content-Type':'application/json'}); return res.end('{"error":"piper not installed"}'); }
      const b = wav(0.25);
      res.writeHead(200, {'Content-Type':'audio/wav','Content-Length':b.length,'X-Parla-Voice':j.voice||''});
      res.end(b);
    });
  }

  let rel = decodeURIComponent(p).replace(/^\/+/, '') || 'index.html';
  const full = path.join(ROOT, rel);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); return res.end('404');
  }
  res.writeHead(200, {'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
                      'Cache-Control':'no-store'});
  res.end(fs.readFileSync(full));
}).listen(PORT, () => console.log('mock tts server on ' + PORT + ' piper=' + HAVE_PIPER));
