/* The shipped list is 521 words. The model knows the language. Whatever gets
 * thrown at this, it should come back with the meaning, the dictionary form,
 * the gender, the conjugation if it is a verb, how the sentence is built, and
 * the mistake English speakers make with it.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext('globalThis.fetch = function(){ return Promise.reject(new Error("no network")); };', ctx);
load(ctx, 'js/data/vocab-es.js', 'js/data/verbs-es.js', 'js/data/scenarios-es.js', 'js/brain.js');
const B = ctx.PARLA.brain;
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

(async function () {
  console.log('Asking about a word\n');

  /* — the conjugation engine is not limited to the drill list — */
  const drillVerbs = new Set(ctx.PARLA.data.es.verbs.list.map(r => r[0]));
  ['madrugar', 'charlar', 'compartir', 'aprender'].forEach(v => {
    const r = B._explainLocal(v, 'es');
    check('"' + v + '" conjugates' + (drillVerbs.has(v) ? '' : ' even though it is not in the drill list'),
      r && r.conjugation && r.conjugation.presente.length === 6,
      r && r.conjugation && r.conjugation.presente.join(' '));
  });
  const madrugar = B._explainLocal('madrugar', 'es');
  check('a regular -ar verb conjugates correctly',
    madrugar.conjugation.presente[0] === 'madrugo' &&
    madrugar.conjugation.presente[4] === 'madrugáis', madrugar.conjugation.presente.join(' '));
  check('and every tense is offered, not just the present',
    Object.keys(madrugar.conjugation).length >= 5,
    Object.keys(madrugar.conjugation).join(', '));
  check('a verb it has no irregular data for is flagged as a guess',
    madrugar.conjugationExact === false);
  check('a verb it does know is not', B._explainLocal('tener', 'es').conjugationExact === true);
  check('an irregular it knows is actually irregular',
    B._explainLocal('tener', 'es').conjugation.presente[0] === 'tengo');

  /* — nouns — */
  const cuenta = B._explainLocal('cuenta', 'es');
  check('a noun gets its gender', cuenta.gender === 'f', JSON.stringify(cuenta.gender));
  check('and its meaning', /bill/i.test(cuenta.en), cuenta.en);
  check('and an example', cuenta.examples.length > 0);
  check('a noun is not handed a conjugation table', cuenta.conjugation === null);

  /* — nothing known — */
  const unknown = B._explainLocal('paralelepípedo', 'es');
  check('an unknown word still returns a shape rather than null', !!unknown);
  check('with no invented meaning', unknown.en === '', JSON.stringify(unknown.en));

  /* — the async wrapper with no model — */
  const offline = await B.explain({ query: 'tener', settings: { brain: 'scripted' } });
  check('explain() works with no model at all', offline && offline.conjugation);
  check('and says the answer is partial', offline.partial === true);
  const dead = await B.explain({ query: 'cantar', settings: { brain: 'ollama', ollamaModel: 'x' } });
  check('an unreachable model falls back rather than failing',
    dead && dead.conjugation && dead.conjugation.presente[0] === 'canto');
  check('an empty question asks nothing', (await B.explain({ query: '  ' })) === null);

  /* — what the model is told — */
  console.log('');
  const p = B._explainPrompt({ settings: { level: 'a2' } });
  check('the teacher is pinned to the learner\'s level', /CEFR A2/.test(p));
  check('it must handle English input too', /If they wrote English/.test(p));
  check('and correct a mistaken sentence', /CORRECTED sentence/.test(p));
  check('it asks for sentence structure', /"structure"/.test(p));
  check('and the English-speaker pitfall', /"pitfall"/.test(p));
  check('and a gender for nouns', /"gender"/.test(p));
  check('it is forbidden from inventing a word', /Never invent a word/.test(p));

  /* — parsing what comes back — */
  console.log('');
  const good = B._parseExplain(JSON.stringify({
    term: 'madrugar', en: 'to get up early', lemma: 'madrugar', pos: 'VERB', gender: 'x',
    note: '', structure: 'Used on its own.', pitfall: 'There is no single English verb.',
    examples: [{ es: 'Hay que madrugar.', en: 'You have to get up early.' }, { es: 'a', en: 'b' }, { es: 'c', en: 'd' }, { es: 'e', en: 'f' }]
  }));
  check('a good answer parses', good && good.term === 'madrugar');
  check('the part of speech is normalised', good.pos === 'verb', good.pos);
  check('a nonsense gender is dropped rather than shown', good.gender === '', JSON.stringify(good.gender));
  check('examples are capped', good.examples.length === 3, String(good.examples.length));
  check('prose instead of JSON yields nothing', B._parseExplain('Sure! Here you go.') === null);
  check('an empty answer yields nothing', B._parseExplain('{}') === null);

  /* — the model gives the words, the engine gives the table — */
  const merged = B._explainLocal('vivir', 'es');
  check('the table comes from the rules, not from the model reciting one',
    merged.conjugation.presente.join(' ') === 'vivo vives vive vivimos vivís viven',
    merged.conjugation.presente.join(' '));

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
