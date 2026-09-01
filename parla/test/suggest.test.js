/* "I don't know what to say".
 *
 * The moment a beginner gives up is standing there with nothing to say and the
 * mic waiting. This has to work with no model and no network, because that is
 * exactly when someone is most likely to be stuck.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext('globalThis.fetch = function(){ return Promise.reject(new Error("no network")); };', ctx);
load(ctx, 'js/data/vocab-es.js', 'js/data/verbs-es.js', 'js/data/scenarios-es.js', 'js/brain.js');

const B = ctx.PARLA.brain;
const sc = ctx.PARLA.data.es.scenarios[0];
const fail = [];
function check(n, c, x) { console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:'')); if(!c) fail.push(n); }

(async function () {
  console.log('Suggestions\n');

  /* — offline — */
  const first = await B.suggest({ scenario: sc, history: [], settings: { brain: 'scripted' } });
  check('offers something with no model at all', first.options.length > 0, JSON.stringify(first.options.map(o=>o.es)));
  check('and says it came from the scripted path', first.source === 'scripted');
  check('the suggestions are real Spanish from this scenario',
    first.options.every(o => (sc.phrases || []).indexOf(o.es) !== -1));
  check('at most three, so it is a nudge and not a menu', first.options.length <= 3);

  const used = await B.suggest({
    scenario: sc,
    history: [{ role: 'user', text: 'un café con leche, por favor' }],
    settings: { brain: 'scripted' }
  });
  check('something already said is not suggested back',
    !used.options.some(o => /con leche/.test(o.es)), JSON.stringify(used.options.map(o=>o.es)));

  const exhausted = await B.suggest({
    scenario: sc,
    history: (sc.phrases || []).map(p => ({ role: 'user', text: p })),
    settings: { brain: 'scripted' }
  });
  check('with the phrasebook exhausted it falls back to the goals',
    exhausted.options.length > 0 && exhausted.options.every(o => o.goal),
    JSON.stringify(exhausted.options.map(o => o.en)));

  /* — a dead Ollama must not leave someone stranded — */
  const dead = await B.suggest({ scenario: sc, history: [], settings: { brain: 'ollama', ollamaModel: 'qwen2.5:7b' } });
  check('an unreachable model falls back rather than failing',
    dead.options.length > 0 && dead.source === 'scripted');

  /* — the prompt — */
  const p = B._suggestPrompt({
    scenario: sc, settings: { level: 'a2' },
    history: [{ role: 'partner', text: '¿Para tomar aquí o para llevar?' }]
  });
  check('the coach is told it is not the partner', /coach, not their partner/i.test(p));
  check('it gets the last thing said to the learner', /Para tomar aquí o para llevar/.test(p));
  check('it is told the learner\'s level', /CEFR A2/.test(p));
  check('it must give three different directions', /three DIFFERENT directions/i.test(p));

  /* — parsing — */
  const ok = B._parseSuggestions('```json\n{"options":[{"es":"¿Cuánto es?","en":"How much is it?"}]}\n```');
  check('a fenced reply still parses', ok.length === 1 && ok[0].es === '¿Cuánto es?');
  const junk = B._parseSuggestions('I think you could say a few things!');
  check('prose instead of JSON yields nothing rather than garbage', junk.length === 0);
  const partial = B._parseSuggestions('{"options":[{"es":"Hola"},{"en":"only english"},{"es":"  "}]}');
  check('entries with no Spanish are dropped', partial.length === 1 && partial[0].es === 'Hola');
  const many = B._parseSuggestions('{"options":[{"es":"a"},{"es":"b"},{"es":"c"},{"es":"d"},{"es":"e"}]}');
  check('a long list is trimmed to three', many.length === 3);

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
