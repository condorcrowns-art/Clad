/* Cloudflare Pages Function — the hosted neural voice, on the edge.
 *
 * The problem this solves: Piper (js/speech.js's neural TTS) runs on
 * whichever PC is running serve.ps1. A visitor's browser cannot reach that,
 * for the same reason it cannot reach a local Ollama — there is no "that PC"
 * from the outside. Without this, the public site had exactly one option
 * once Piper was unreachable: whatever robotic voice the visitor's own
 * operating system shipped. That gap — not a setting anyone got wrong — is
 * the actual answer to "why does the voice sound bad on the site".
 *
 * Cloudflare Workers AI ships a text-to-speech model on the same account
 * already serving the chat partner, so this needs no new binding and no new
 * signup: the "AI" binding configured for /api/chat covers this too.
 *
 * Binding required: the same one as chat.js — Settings -> Functions -> AI
 * bindings -> "AI". Without it this returns 503 and the app falls back to
 * the browser's own voice, exactly as it does when Piper is not running.
 *
 * UNVERIFIED AGAINST LIVE WORKERS AI: this was written without the ability to
 * call the real API from where it was built (the sandbox's network egress
 * does not reach Cloudflare). The model id and the input shape below match
 * Cloudflare's published MeloTTS example; the output-parsing in audioFrom()
 * is deliberately defensive and tries every shape Workers AI is known to use
 * for binary output elsewhere, because the exact shape MeloTTS hands back was
 * not something this code could confirm firsthand.
 *
 * If it comes back in some other shape, audioFrom() does not throw or
 * silently send garbage — it returns a 502 whose `detail` is a JSON-ish
 * description of the actual object env.AI.run() produced (see the fallback
 * branch at the end of the function). That response is the fix: whatever it
 * says the real shape is, add one more branch to audioFrom() for it. Check
 * with `curl -s -X POST https://lunosia.com/api/speak -d '{"text":"hola"}'`
 * after deploying — a working voice comes back as bytes an audio player can
 * open; a shape this code did not anticipate comes back as that JSON error,
 * legible in the terminal. (PowerShell: curl.exe -s -X POST
 * https://lunosia.com/api/speak -H "Content-Type: application/json" -d
 * '{\"text\":\"hola\"}' -o test.mp3 --  then open test.mp3.)
 */

const MODEL = '@cf/myshell-ai/melotts';

/* KNOWN LIVE BUG, CLOUDFLARE'S SIDE, CONFIRMED 2026-09-17:
 * env.AI.run(MODEL, { prompt, lang: 'es' }) fails outright on Cloudflare's own
 * infrastructure — reproduced against the real deployed function, not a guess.
 * The request shape here already matches Cloudflare's own documented example
 * exactly (`{ prompt, lang }`), so this is not something a change to what we
 * send can fix. Others have hit the same thing for non-English languages
 * since at least 2025:
 *   https://community.cloudflare.com/t/cf-myshell-ai-melotts-doesnt-work-in-spanish/811141
 *   https://community.cloudflare.com/t/melotts-3043-internal-server-error-since-july-9th/939369
 * Since this app only ever asks for 'es' (and occasionally 'fr'), the hosted
 * voice is currently non-functional for every real use this app has, even
 * though the AI binding itself is present and billing/quota is not the
 * issue. It is left wired up as-is (rather than hard-disabled) because
 * Cloudflare could fix this on their end at any time with no code change
 * needed here — the existing client-side fallback to the browser voice
 * already covers the failure gracefully. If this is still broken a while
 * from now, the honest fix is to stop advertising `available: true` from
 * onRequestGet below for these languages so Settings does not offer a
 * "neural" voice that silently never plays. */

// MeloTTS's published languages. Anything else falls back to Spanish rather
// than erroring, since every caller in this app already knows its own
// language and a typo here should degrade, not break the voice entirely.
const LANGS = ['en', 'es', 'fr', 'zh', 'ja', 'ko'];

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* Every shape Workers AI is documented to use for a binary result, tried in
 * turn. Returns { bytes } on success or { error } describing what actually
 * came back, so a wrong guess here is diagnosable from the response rather
 * than a silent wall of noise piped into an <audio> tag. */
async function audioFrom(out) {
  if (out instanceof ReadableStream) {
    return { stream: out };
  }
  if (out instanceof ArrayBuffer) return { bytes: new Uint8Array(out) };
  if (out instanceof Uint8Array) return { bytes: out };
  if (out && typeof out.arrayBuffer === 'function') {
    // A Response-shaped object, or something close enough to one.
    return { bytes: new Uint8Array(await out.arrayBuffer()) };
  }
  if (out && typeof out.audio === 'string' && out.audio) {
    try { return { bytes: base64ToBytes(out.audio) }; }
    catch (e) { return { error: 'could not base64-decode out.audio: ' + e.message }; }
  }
  if (out && typeof out.response === 'string' && out.response) {
    try { return { bytes: base64ToBytes(out.response) }; }
    catch (e) { return { error: 'could not base64-decode out.response: ' + e.message }; }
  }
  let described;
  try { described = JSON.stringify(out).slice(0, 300); } catch (e) { described = String(out).slice(0, 300); }
  return { error: 'unrecognised shape from ' + MODEL + ': ' + described };
}

export async function onRequestPost({ request, env }) {
  if (!env.AI) {
    return json({
      error: 'no-binding',
      detail: 'This site has no Workers AI binding. In the Cloudflare dashboard: ' +
              'Workers & Pages -> this project -> Settings -> Functions -> ' +
              'AI bindings -> add one named AI, then redeploy. (The same binding ' +
              'that /api/chat uses — if the chat partner already works, this is ' +
              'already set up.)'
    }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'bad-request', detail: 'Body must be JSON.' }, 400);
  }

  // Keep it bounded: this is a public endpoint on someone's domain, and the
  // longest thing anything in the app ever reads aloud is one paragraph of a
  // graded reading text.
  const text = String(body.text || '').trim().slice(0, 1200);
  if (!text) return json({ error: 'bad-request', detail: 'text is required.' }, 400);

  const wantLang = String(body.lang || 'es').slice(0, 2).toLowerCase();
  const lang = LANGS.indexOf(wantLang) !== -1 ? wantLang : 'es';

  let out;
  try {
    out = await env.AI.run(MODEL, { prompt: text, lang: lang });
  } catch (e) {
    return json({
      error: 'model-failed',
      detail: MODEL + ' did not answer: ' + (e && e.message ? e.message : String(e))
    }, 502);
  }

  const audio = await audioFrom(out);
  if (audio.error) return json({ error: 'bad-output', detail: audio.error }, 502);

  const headers = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' };
  return new Response(audio.stream || audio.bytes, { status: 200, headers });
}

/* A cheap probe so the app can show a truthful status without paying for a
 * generation to find out — same pattern as chat.js's GET. */
export async function onRequestGet({ env }) {
  return json({ available: !!env.AI, engine: MODEL, langs: LANGS });
}
