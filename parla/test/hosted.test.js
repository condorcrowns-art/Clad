/* The backend that works on a phone.
 *
 * A page on https cannot reach Ollama on a PC at http://localhost - mixed
 * content plus private-network blocking, and no setting changes it. So on the
 * hosted site the partner runs on Cloudflare's own edge, through a Pages
 * Function on the same origin.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext(`
  globalThis.__calls = [];
  globalThis.__reply = null;     // what /api/chat returns for a POST
  globalThis.__available = true; // what it returns for the GET probe
  globalThis.__status = 200;
  globalThis.fetch = function (url, init) {
    globalThis.__calls.push({ url: url, init: init || {} });
    if (!init || !init.method) {
      return Promise.resolve({ ok: true, json: function () {
        return Promise.resolve({ available: globalThis.__available, models: ['@cf/x'] }); } });
    }
    return Promise.resolve({
      ok: globalThis.__status === 200,
      status: globalThis.__status,
      json: function () {
        return Promise.resolve(globalThis.__status === 200
          ? { reply: globalThis.__reply, model: '@cf/x' }
          : { error: 'no-binding', detail: 'no AI binding on this site' });
      }
    });
  };
`, ctx);
load(ctx, 'js/data/vocab-es.js', 'js/data/verbs-es.js', 'js/data/scenarios-es.js', 'js/brain.js');

const B = ctx.PARLA.brain;
const sc = ctx.PARLA.data.es.scenarios[0];
const run = c => vm.runInContext(c, ctx);
const set = (k, v) => run(k + ' = ' + JSON.stringify(v) + ';');
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};
const S = { brain: 'hosted', correctionStyle: 'gentle', level: 'a1' };

(async function () {
  console.log('The site\'s own AI\n');

  /* — the probe — */
  const up = await B.hostedAvailable();
  check('it can tell whether the site has an AI binding', up.ok === true);
  set('__available', false);
  const down = await B.hostedAvailable();
  check('and says so when it does not', down.ok === false);
  check('with the fix, not just a failure', /DEPLOY|binding/i.test(down.detail), down.detail);
  set('__available', true);

  /* — a normal turn — */
  run('__calls = [];');
  set('__reply', JSON.stringify({
    reply_es: 'Marchando. ¿Algo más?', reply_en: 'Coming up. Anything else?',
    asked_to_repeat: false, remember: [], correction: null
  }));
  const out = await B.reply({ scenario: sc, settings: S, history: [], text: 'un café' });
  check('a turn is answered', out.es === 'Marchando. ¿Algo más?', out.es);
  check('and is marked as coming from the site', out.source === 'hosted', out.source);

  const call = JSON.parse(run('JSON.stringify(__calls[__calls.length-1])'));
  check('it posts to the same origin, so there is no CORS to configure',
    call.url === '/api/chat', call.url);
  const body = JSON.parse(call.init.body);
  check('the system prompt goes with it', /YOU ARE:/.test(body.messages[0].content));
  check('and the learner\'s turn', body.messages[body.messages.length - 1].content === 'un café');

  /* — the same rules apply — */
  run('__calls = [];');
  set('__reply', JSON.stringify({
    reply_es: '¿Cómo te llamas?', reply_en: "What's your name?",
    asked_to_repeat: true, remember: [], correction: null
  }));
  const cut = await B.reply({ scenario: sc, settings: S, history: [], text: 'Me llamo' });
  check('a cut-off sentence still gets asked about, not assumed',
    cut.askedToRepeat === true);
  const notes = JSON.parse(run('JSON.stringify(__calls[0])'));
  check('the per-turn warnings reach the edge model too',
    /cut off/i.test(JSON.parse(notes.init.body).messages[0].content));

  /* — a bad answer gets one retry — */
  run('__calls = [];');
  set('__reply', 'Sure! Here is your reply.');
  const junk = await B.reply({ scenario: sc, settings: S, history: [], text: 'hola' });
  check('unparseable JSON triggers exactly one retry',
    run('__calls.length') === 2, run('__calls.length') + ' calls');
  check('and the retry is blunter',
    /REJECTED/.test(JSON.parse(JSON.parse(run('JSON.stringify(__calls[1])')).init.body).messages[0].content));
  check('something is still said either way', !!junk.es, junk.es);

  /* — the site not being set up must not stop practice — */
  set('__status', 503);
  const dead = await B.reply({ scenario: sc, settings: S, history: [], text: 'hola' });
  check('a site with no AI binding falls back to the scripted partner',
    dead.degraded === true && !!dead.es, dead.es);
  check('and the reason is carried to the UI', /binding/i.test(dead.error || ''), dead.error);
  const t = await B.testBackend(S);
  set('__status', 200);

  /* — the small asks go the same way — */
  run('__calls = [];');
  set('__reply', JSON.stringify({ en: 'to get up early', lemma: 'madrugar', note: '' }));
  const word = await B.translate({ word: 'madrugo', sentence: 'Madrugo cada día.', settings: S });
  check('word lookup uses the site\'s AI as well', word && word.lemma === 'madrugar',
    JSON.stringify(word));

  run('__calls = [];');
  set('__reply', JSON.stringify({ options: [{ es: '¿Cuánto es?', en: 'How much is it?' }] }));
  const sug = await B.suggest({ scenario: sc, history: [], settings: S });
  check('so do the suggestions', sug.source === 'hosted' && sug.options.length === 1,
    JSON.stringify(sug.options));

  run('__calls = [];');
  set('__reply', JSON.stringify({ term: 'madrugar', en: 'to get up early', lemma: 'madrugar',
                                  pos: 'verb', gender: '', note: '', structure: '', pitfall: '',
                                  examples: [] }));
  const ex = await B.explain({ query: 'madrugar', settings: S });
  check('and the Ask screen', ex && ex.en === 'to get up early', ex && ex.en);
  check('with the conjugation still coming from the rules, not the edge model',
    ex.conjugation && ex.conjugation.presente[0] === 'madrugo');

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
