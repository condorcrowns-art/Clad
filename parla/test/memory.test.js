/* The partner should know who it is talking to.
 *
 * Telling it your name on Monday and being asked again on Tuesday is the
 * fastest way to make a conversation partner feel like a machine, so what it
 * learns is kept between sessions and put back in front of it every turn.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext(`
  globalThis.fetch = function(){ return Promise.reject(new Error('no network')); };
  var __ls = {};
  globalThis.localStorage = {
    getItem: function (k) { return __ls[k] == null ? null : __ls[k]; },
    setItem: function (k, v) { __ls[k] = String(v); },
    removeItem: function (k) { delete __ls[k]; }
  };
  globalThis.console = console;
`, ctx);
load(ctx, 'js/store.js', 'js/data/vocab-es.js', 'js/data/verbs-es.js',
          'js/data/scenarios-es.js', 'js/brain.js');
vm.runInContext('PARLA.store.load();', ctx);

const S = ctx.PARLA.store;
const B = ctx.PARLA.brain;
const sc = ctx.PARLA.data.es.scenarios[0];

const fail = [];
function check(n, c, x) { console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:'')); if(!c) fail.push(n); }
const prompt = (over) => B._systemPrompt(Object.assign(
  { scenario: sc, settings: { correctionStyle: 'gentle', level: 'a1' }, history: [], text: '' }, over));
const notes = (over) => B._turnNotes(Object.assign(
  { scenario: sc, settings: {}, history: [], text: '', confidence: 0 }, over));

console.log('Memory and targeting\n');

/* — pulling a name out of speech — */
check('"me llamo Condo" yields a name', B.extractName('me llamo Condo') === 'Condo');
check('"mi nombre es Ana" yields a name', B.extractName('Hola, mi nombre es Ana') === 'Ana');
check('a capitalised "Soy Pablo" yields a name', B.extractName('Soy Pablo') === 'Pablo');
check('"soy cansado" does not', B.extractName('soy cansado') === '');
check('"soy de Chicago" does not', B.extractName('soy de Chicago') === '');
check('"me llamo" with nothing after it does not invent one', B.extractName('me llamo') === '');
check('a name is capitalised for use', B.extractName('me llamo condo') === 'Condo');

/* — keeping facts — */
S.remember(['Their name is Condo', 'They are from Chicago']);
check('facts are stored', S.state.memory.facts.length === 2);
S.remember(['Their name is Condo']);
check('an identical fact is not stored twice', S.state.memory.facts.length === 2);
S.remember(['Their name is Condor']);
check('a revised fact replaces the old one rather than stacking',
  S.state.memory.facts.length === 2 &&
  S.state.memory.facts.some(f => f.text === 'Their name is Condor'),
  S.state.memory.facts.map(f => f.text).join(' | '));
S.remember(['x'.repeat(400)]);
check('an absurdly long "fact" is rejected', S.state.memory.facts.length === 2);
S.remember([]);
check('an empty list is harmless', S.state.memory.facts.length === 2);

S.remember(['They like the beach', 'They like the mountains']);
check('two different likes both survive - they are not the same fact',
  S.state.memory.facts.filter(f => /They like the/.test(f.text)).length === 2,
  S.state.memory.facts.map(f => f.text).join(' | '));
S.remember(['Their job is a nurse']);
S.remember(['Their job is a teacher']);
check('but a changed attribute replaces the old value',
  S.state.memory.facts.filter(f => /Their job/.test(f.text)).length === 1);

for (let i = 0; i < 40; i++) S.remember(['They own a car number ' + i]);
check('the list is capped so it cannot crowd out the prompt',
  S.state.memory.facts.length === 14, String(S.state.memory.facts.length));

/* — reaching the model — */
const p = prompt({ memory: { name: 'Condo', facts: [{ text: 'They are from Chicago' }] } });
check('the name reaches the prompt', /Their name is Condo/.test(p));
check('so do the facts', /They are from Chicago/.test(p));
check('with an instruction not to ask again', /Do not ask for any of it again/.test(p));
check('an empty memory adds nothing', !/YOU ALREADY KNOW/.test(prompt({ memory: { name: '', facts: [] } })));
check('the model is asked to record new facts', /"remember"/.test(p));
check('and told not to guess them', /Only things THEY said/.test(p));

/* — reading them back — */
const out = B._parseLLM(JSON.stringify({
  reply_es: 'Hola Condo', reply_en: 'Hi Condo', asked_to_repeat: false,
  remember: ['They work nights', 42, '', { nope: 1 }], correction: null
}), 'hola');
check('well-formed facts survive parsing', out.remember.length === 1 && out.remember[0] === 'They work nights',
  JSON.stringify(out.remember));
check('a reply with no remember key is fine',
  B._parseLLM('{"reply_es":"Hola","reply_en":"Hi"}', 'hola').remember.length === 0);

/* — pointing the conversation at weak spots — */
const weak = notes({ targetWords: ['la cuenta', 'el aceite', 'probar'] });
check('weak words are handed to the partner', /la cuenta, el aceite, probar/.test(weak));
check('with an instruction to be subtle about it', /never in a list/.test(weak));
check('no weak words means no instruction', !/currently weak/.test(notes({ targetWords: [] })));

const past = notes({ pastMistakes: ['soy cansado  ->  estoy cansado'] });
check('past mistakes are handed over', /soy cansado  ->  estoy cansado/.test(past));
check('with an instruction to stop letting them slide', /even if you would normally let it go/.test(past));

/* — runner-up transcripts — */
const alt = notes({ text: 'quiero pan', confidence: 0.3, alternatives: ['quiero pan', 'quiero pagar'] });
check('a shaky transcript offers its alternatives', /quiero pagar/.test(alt));
const sure = notes({ text: 'quiero pan', confidence: 0.95, alternatives: ['quiero pan', 'quiero pagar'] });
check('a confident one does not clutter the prompt', !/also considered/.test(sure));

/* — forgetting — */
S.forgetAll();
check('forget clears everything', S.state.memory.facts.length === 0 && S.state.memory.name === '');

console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
process.exit(fail.length ? 1 : 0);
