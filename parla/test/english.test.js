/* Falling back to English is not a failure — it is the learner pointing at the
 * exact sentence they cannot say yet. The old rule ("answer in Spanish anyway
 * and pull them back gently") left them still not knowing how to say it.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext('globalThis.fetch = function(){ return Promise.reject(new Error("no network")); };', ctx);
load(ctx, 'js/data/vocab-es.js', 'js/data/verbs-es.js', 'js/data/scenarios-es.js', 'js/brain.js');

const B = ctx.PARLA.brain;
const sc = ctx.PARLA.data.es.scenarios[0];
const settings = { brain: 'scripted', correctionStyle: 'gentle', level: 'a1' };
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

(async function () {
  console.log('Answering in English\n');

  /* — telling the languages apart — */
  const L = B.detectLanguage;
  check('a plain English sentence', L('I would like a coffee please') === 'en');
  check('a plain Spanish sentence', L('Quiero un café con leche por favor') === 'es');
  check('Spanish letters settle it outright', L('¿Cuánto es?') === 'es');
  check('Spanish without accents still reads as Spanish', L('quiero un cafe') === 'es');
  check('a short English one', L('how much') === 'en');
  check('a short Spanish one', L('cuanto es') === 'es');
  check('"no" is not called either way', L('no') === '' || L('no') === 'es', L('no'));
  check('a proper noun alone is not guessed at', L('Madrid') === '');
  check('empty input is not guessed at', L('') === '');
  check('a name is not mistaken for English', L('Condo') === '');

  /* — what the model is told — */
  const p = B._systemPrompt({ scenario: sc, settings: settings, history: [], text: '' });
  check('the prompt has a rule for it', /WHEN THEY ANSWER IN ENGLISH/.test(p));
  check('it reframes English as useful, not a failure', /shown you the exact sentence/i.test(p));
  check('it must not scold or break character', /Never scold/.test(p) && /never switch to English yourself/i.test(p));
  check('say_this holds THEIR sentence, not the reply', /what THEY were\b[\s\S]{0,40}trying to say/i.test(p));
  check('the contract carries say_this', /"say_this"/.test(p));
  check('with a worked example', /I would like a coffee please/.test(p));

  const notes = B._turnNotes({ scenario: sc, settings: settings, history: [],
                               text: 'I want to order a coffee', confidence: 0.9 });
  check('the turn is flagged as English', /THEY ANSWERED IN ENGLISH/.test(notes));
  const esNotes = B._turnNotes({ scenario: sc, settings: settings, history: [],
                                 text: 'quiero un cafe con leche', confidence: 0.9 });
  check('a Spanish turn is not', !/ANSWERED IN ENGLISH/.test(esNotes));

  /* — reading say_this back — */
  const out = B._parseLLM(JSON.stringify({
    reply_es: 'Marchando.', reply_en: 'Coming up.', asked_to_repeat: false,
    say_this: { es: 'Quería un café, por favor.', en: 'I would like a coffee, please.' },
    correction: null
  }), 'I would like a coffee');
  check('say_this survives parsing', out.sayThis && out.sayThis.es === 'Quería un café, por favor.');
  check('and is null on an ordinary turn',
    B._parseLLM('{"reply_es":"Vale","reply_en":"Ok"}', 'vale').sayThis === null);

  /* — with no model at all — */
  const offline = await B.reply({ scenario: sc, settings: settings, history: [],
                                  text: 'I would like a coffee please' });
  check('offline: it does not pretend to have understood', offline.askedToRepeat === true);
  check('offline: it asks for Spanish', /espanol|español/i.test(offline.es), offline.es);
  check('offline: it hands over a phrase that actually fits the scene',
    offline.sayThis && (sc.phrases || []).indexOf(offline.sayThis.es) !== -1,
    offline.sayThis && offline.sayThis.es);
  const offlineEs = await B.reply({ scenario: sc, settings: settings, history: [],
                                    text: 'quiero un cafe con leche' });
  check('offline: Spanish is answered normally', !offlineEs.askedToRepeat, offlineEs.es);

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
