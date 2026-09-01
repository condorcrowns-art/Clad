/* The partner must not answer a question that was never finished.
 *
 * Reported: saying "Me llamo" with no name got a confident reply and the
 * conversation moved on, as though a name had been given. A person would have
 * asked. These checks cover both halves of that: what the model is told, and
 * what the offline partner does without a model at all.
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
function check(n, c, x) { console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:'')); if(!c) fail.push(n); }

function prompt(over) {
  return B._systemPrompt(Object.assign({ scenario: sc, settings: settings, history: [], text: '' }, over));
}
function notes(over) {
  return B._turnNotes(Object.assign({ scenario: sc, settings: settings, history: [], text: '', confidence: 0 }, over));
}

(async function () {
  console.log('Comprehension\n');

  /* — what the model is told — */
  const p = prompt();
  check('the prompt forbids inventing what was not said', /NEVER invent, assume/i.test(p));
  check('and names the exact reported failure', /Me llamo.*you do NOT know their name/is.test(p));
  check('it demands a specific question, not a blank "what?"', /not in general|specific missing piece/i.test(p));
  check('it forbids correcting what was not understood', /Do not correct grammar in a sentence you did not understand/i.test(p));
  check('but also forbids stalling on clear input', /Asking about everything is as bad as/i.test(p));
  check('it tells the partner to remember what it was told', /REMEMBER WHAT THEY TOLD YOU/.test(p));
  check('the JSON contract carries the repeat flag', /asked_to_repeat/.test(p));
  check('with a worked example of the "Me llamo" case',
    /They said "Me llamo" and nothing more/.test(p));

  /* — per-turn warnings — */
  check('a sentence ending on a dangling word is flagged',
    /almost certainly cut off/i.test(notes({ text: 'Me llamo' })));
  check('so is "Quiero un"', /cut off/i.test(notes({ text: 'Quiero un' })));
  check('a complete sentence is not flagged',
    !/cut off/i.test(notes({ text: 'Me llamo Condo y soy de Chicago' })));
  check('a shaky transcript is flagged even when it parses',
    /recogniser was unsure/i.test(notes({ text: 'quiero pan', confidence: 0.3 })));
  check('a confident transcript is not', !/unsure/i.test(notes({ text: 'quiero pan', confidence: 0.95 })));
  check('the partner is told what it already said, so it stops looping',
    /Do not repeat them/.test(notes({ history: [{ role: 'partner', text: '¿Qué desea?' }] })));

  /* — the offline partner, which is also the fallback when Ollama dies — */
  const cut = await B.reply({ scenario: sc, settings: settings, history: [], text: 'Me llamo' });
  check('offline: "Me llamo" is answered with a question, not an assumption',
    /c[oó]mo te llamas/i.test(cut.es), cut.es);
  check('offline: it is marked as a request to repeat', cut.askedToRepeat === true);
  check('offline: nothing is corrected in a sentence it did not hear', cut.correction === null);

  const cut2 = await B.reply({ scenario: sc, settings: settings, history: [], text: 'Quiero un' });
  check('offline: "Quiero un" asks which one', /qu[eé] quieres/i.test(cut2.es), cut2.es);

  const whole = await B.reply({ scenario: sc, settings: settings, history: [], text: 'Hola, quiero un café con leche por favor' });
  check('offline: a complete sentence is answered normally, not interrogated',
    !whole.askedToRepeat && whole.es.length > 0, whole.es);

  const longish = await B.reply({ scenario: sc, settings: settings, history: [],
    text: 'Pues mira, no sé muy bien lo que quiero pero creo que un café estaría muy' });
  check('offline: a long sentence trailing off is not treated as a fragment',
    !longish.askedToRepeat, longish.es);

  /* — parsing — */
  const asked = B._parseLLM(JSON.stringify({
    reply_es: '¿Cómo te llamas?', reply_en: "What's your name?", asked_to_repeat: true,
    correction: { original: 'Me llamo', fixed: 'Me llamo Ana', note: 'incomplete' }
  }), 'Me llamo');
  check('a model that both asks and corrects has the correction dropped',
    asked.askedToRepeat === true && asked.correction === null);

  const normal = B._parseLLM(JSON.stringify({
    reply_es: 'Vale.', reply_en: 'Okay.', asked_to_repeat: false, correction: null
  }), 'quiero cafe');
  check('an ordinary reply is untouched', normal.askedToRepeat === false && normal.es === 'Vale.');

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
