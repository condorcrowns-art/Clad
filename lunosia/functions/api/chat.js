/* Cloudflare Pages Function — the conversation partner, on the edge.
 *
 * The problem this solves: a page served from https://lunosia.com cannot reach
 * Ollama on a PC at http://localhost. That is mixed content plus private
 * network blocking, and no setting anywhere changes it. So on a phone there
 * was no AI partner at all.
 *
 * Cloudflare runs models on its own edge, included with the account that is
 * already serving the site. Same request shape as the Ollama path, so the app
 * does not care which one answered.
 *
 * Binding required: Settings -> Functions -> AI bindings -> variable name "AI".
 * Without it this returns 503 and the app falls back to the scripted partner,
 * exactly as it does when Ollama is not running.
 */

/* Tried in order. Model availability on Workers AI changes over time, so this
 * walks the list rather than betting the feature on one identifier. */
const MODELS = [
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fast',
  '@cf/mistral/mistral-7b-instruct-v0.2',
  '@cf/qwen/qwen1.5-14b-chat-awq',
  '@cf/meta/llama-3-8b-instruct'
];

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

export async function onRequestPost({ request, env }) {
  if (!env.AI) {
    return json({
      error: 'no-binding',
      detail: 'This site has no Workers AI binding. In the Cloudflare dashboard: ' +
              'Workers & Pages -> this project -> Settings -> Functions -> ' +
              'AI bindings -> add one named AI, then redeploy.'
    }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'bad-request', detail: 'Body must be JSON.' }, 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if (!messages || !messages.length) {
    return json({ error: 'bad-request', detail: 'messages[] is required.' }, 400);
  }

  // Keep the payload bounded: this is a public endpoint on someone's domain.
  const trimmed = messages.slice(-24).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
    content: String(m.content || '').slice(0, 6000)
  }));

  const tried = [];
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, {
        messages: trimmed,
        max_tokens: Math.min(Number(body.max_tokens) || 320, 700),
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.7
      });
      const text = (out && (out.response || out.result || out.text)) || '';
      if (text) return json({ reply: text, model: model });
      tried.push(model + ': empty');
    } catch (e) {
      // A model can be retired, renamed, or briefly unavailable. Try the next
      // one rather than turning a transient outage into a broken feature.
      tried.push(model + ': ' + (e && e.message ? e.message : 'failed'));
    }
  }

  return json({
    error: 'all-models-failed',
    detail: 'Workers AI did not answer. Tried: ' + tried.join(' | ')
  }, 502);
}

/* A cheap probe so the app can show a truthful status chip without paying for
 * a generation to find out. */
export async function onRequestGet({ env }) {
  return json({ available: !!env.AI, models: MODELS });
}
