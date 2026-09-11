/* A fixed word list is always the wrong list: it holds words you already know
 * and lacks the one your partner just used. So tapping a word has to work for
 * ANY word, and the first two answers cost nothing.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext('globalThis.fetch = function(){ return Promise.reject(new Error("no network")); };', ctx);
load(ctx, 'js/data/vocab-es.js', 'js/data/verbs-es.js', 'js/data/scenarios-es.js', 'js/brain.js');

const B = ctx.PARLA.brain;
const V = ctx.PARLA.data.es.verbs;
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

(async function () {
  console.log('Looking a word up\n');

  /* — the corpus knows it — */
  const cuenta = B.lookupLocal('cuenta', 'es');
  check('a word from the deck resolves instantly', cuenta && cuenta.source === 'corpus',
    JSON.stringify(cuenta));
  check('even without its article', cuenta && /bill/i.test(cuenta.en), cuenta && cuenta.en);
  check('and gives back the dictionary form with the article',
    cuenta && /^la /.test(cuenta.lemma), cuenta && cuenta.lemma);

  /* — the verb engine knows the rest — */
  const tuvo = B.lookupLocal('tuvo', 'es');
  check('a conjugated verb resolves to its infinitive', tuvo && tuvo.lemma === 'tener',
    JSON.stringify(tuvo));
  check('and is told which form it is', tuvo && /Preterite/i.test(tuvo.note), tuvo && tuvo.note);
  check('an accented form too', (B.lookupLocal('hablé', 'es') || {}).lemma === 'hablar');
  check('a subjunctive', (B.lookupLocal('tengan', 'es') || {}).lemma === 'tener');
  check('an irregular future', (B.lookupLocal('iré', 'es') || {}).lemma === 'ir');
  check('the infinitive itself', (B.lookupLocal('tener', 'es') || {}).lemma === 'tener');

  /* — reverse lookup does not hallucinate — */
  check('a word that is no verb form returns nothing', V.identify('perro') === null);
  check('nor does nonsense', V.identify('xyzzyq') === null);
  check('nor does an empty string', V.identify('') === null);

  /* — a word nobody knows — */
  check('an unknown word yields null rather than a guess',
    B.lookupLocal('paralelepípedo', 'es') === null);

  /* — the async wrapper — */
  const viaTranslate = await B.translate({ word: 'cuenta', sentence: 'La cuenta, por favor.',
                                           settings: { brain: 'scripted' } });
  check('translate() returns the local answer with no model',
    viaTranslate && viaTranslate.source === 'corpus');

  const dead = await B.translate({ word: 'tuvo', sentence: 'Tuvo que irse.',
                                   settings: { brain: 'ollama', ollamaModel: 'qwen2.5:7b' } });
  check('an unreachable model falls back to the local answer rather than failing',
    dead && dead.lemma === 'tener', JSON.stringify(dead));

  const nothing = await B.translate({ word: '', settings: { brain: 'scripted' } });
  check('an empty word asks nothing of anyone', nothing === null);

  /* — the model ranking — */
  console.log('\nPicking a model\n');
  check('a multilingual model beats a general one of the same size',
    B.bestModel(['qwen2.5:7b', 'aya-expanse:8b']) === 'aya-expanse:8b');
  check('but a much bigger general model still wins',
    B.bestModel(['aya-expanse:8b', 'qwen2.5:14b']) === 'qwen2.5:14b');
  check('mistral-nemo is preferred to a general 7B',
    B.bestModel(['qwen2.5:7b', 'mistral-nemo:latest']) === 'mistral-nemo:latest');
  check('something is always chosen', B.bestModel(['weird-model:1b']) === 'weird-model:1b');
  check('nothing installed yields nothing', B.bestModel([]) === '');

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
