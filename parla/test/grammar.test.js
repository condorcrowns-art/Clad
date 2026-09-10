/* The grammar checker.
 *
 * Two things decide whether a checker is worth having, and they pull against
 * each other: does it catch the mistakes, and does it leave correct Spanish
 * alone. The second matters more. A learner who is told their correct sentence
 * was wrong learns something false and stops trusting the tool, so the bar here
 * is zero false positives on every Spanish sentence the app itself ships —
 * about eight hundred of them, written to be correct.
 */
const { makeSandbox, load } = require('./harness');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

const ctx = load(makeSandbox(),
  ...fs.readdirSync(ROOT + '/js/data').filter(f => f.endsWith('.js')).map(f => 'js/data/' + f));
load(ctx, 'js/dict.js', 'js/morph.js', 'js/grammar.js');
const raw = JSON.parse(fs.readFileSync(ROOT + '/js/data/dict-es.json', 'utf8'));
ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(raw) });
vm.runInContext('globalThis.fetch = fetch;', ctx);

const G = ctx.PARLA.grammar;

(async () => {
  console.log('Before the dictionary is loaded\n');
  check('it stands down rather than guessing', G.ready() === false && G.check('la problema').length === 0);

  await ctx.PARLA.dict.load();
  console.log('\nCatching what English speakers get wrong\n');

  const shouldCatch = [
    ['la problema es grande', 'el problema', 'gender'],
    ['los casa es bonita', 'la casa', 'gender'],
    ['la agua fría', 'el agua', 'gender'],
    ['la casa blanco', 'blanca', 'agreement'],
    ['los libros rojo', 'rojos', 'agreement'],
    ['yo tiene hambre', 'yo tengo', 'person'],
    ['tú tengo un perro', 'tienes', 'person'],
    ['nosotros va al cine', 'vamos', 'person'],
    ['soy cansado', 'estoy cansado', 'serestar'],
    ['estoy profesor', 'soy profesor', 'serestar'],
    ['soy hambre', 'tengo hambre', 'tener'],
    ['estoy 25 años', 'tengo 25', 'tener'],
    ['la casa es mucho grande', 'muy grande', 'muymucho'],
    ['muy mucho gracias', 'muchas gracias', 'muymucho'],
    ['voy a el cine', 'al cine', 'contractions'],
    ['el libro de el profesor', 'del profesor', 'contractions'],
    ['yo gusto el café', 'me gusta', 'gustar'],
    ['roja casa', 'casa roja', 'wordorder'],
    ['veo nada', 'no veo nada', 'negation'],
    ['estoy embarazada', 'avergonzada', 'falsefriends'],
    ['la comida es delicioso', 'deliciosa', 'agreement'],
    ['los libros son caro', 'caros', 'agreement'],
    ['la comida es muy delicioso', 'deliciosa', 'agreement']
  ];
  shouldCatch.forEach(([wrong, wantIn, topic]) => {
    const hits = G.check(wrong);
    const hit = hits.find(h => h.fixed.toLowerCase().includes(wantIn.toLowerCase()));
    check('“' + wrong + '” → ' + wantIn, !!hit,
      hits.length ? 'got: ' + hits.map(h => h.fixed).join(' / ') : 'nothing');
    if (hit) {
      check('  …and it names the rule', hit.topic === topic, hit.topic + ' (wanted ' + topic + ')');
      check('  …and explains why', (hit.note || '').length > 25);
    }
  });

  console.log('\nLeaving correct Spanish alone\n');
  const correct = [
    'tengo mucha hambre', 'me gusta el café', 'la casa blanca es bonita',
    'yo tengo hambre', 'el problema es difícil', 'el agua está fría',
    'quiero un café con leche por favor', 'no veo nada', 'de todas formas gracias',
    'la sopa está un poco sosa', 'he dejado de fumar', 'marque el número otra vez',
    'ella enseña matemáticas', 'cuido a mi sobrino los martes', 'me voy a la cama',
    'entiendo tu punto', 'muchas gracias por tu ayuda', 'buenas tardes, bienvenido',
    'el almuerzo es a las dos', 'mi primo vive en México'
  ];
  correct.forEach(s => {
    const hits = G.check(s).filter(h => !h.soft);
    check('“' + s + '”', hits.length === 0, hits.map(h => h.fixed + ' — ' + h.note).join(' | '));
  });

  console.log('\nThe four ways a correct sentence used to be flagged\n');
  // Each of these came out of running the graded reading texts through the
  // checker. Every one was the checker's fault, not the sentence's.
  const wasFlagged = [
    ['Es pequeño y está mojado.', 'está is the verb, not the demonstrative esta'],
    ['Al principio nadie hizo nada.', 'a negative word in front of its verb negates by itself'],
    ['Cuando volvió la luz, nadie quería entrar en casa.', 'same, in the second clause'],
    ['Salí con una palabra nueva que nunca voy a olvidar.', 'nunca before its verb'],
    ['Yo miraba el móvil sin leer nada.', 'sin has already done the negating'],
    ['Va del salón al siguiente sin que nadie la toque.', 'la is the object, not an article'],
    ['¿Quién le ayuda primero?', 'ayuda is the verb the pronoun leans on'],
    ['¿Qué contestó la otra persona primero?', 'primero is an adverb here']
  ];
  wasFlagged.forEach(([s, why]) => {
    const hits = G.check(s).filter(h => !h.soft);
    check(why, hits.length === 0, hits.map(h => h.topic + ': ' + h.fixed).join(' | '));
  });

  console.log('\nAnd the mistakes those fixes must not have hidden\n');
  [['veo nada', 'negation'], ['este casa es bonita', 'gender'],
   ['la casa blanco', 'agreement'], ['nunca digo nada malo', null]
  ].forEach(([s, topic]) => {
    const hits = G.check(s).filter(h => !h.soft);
    check('“' + s + '”' + (topic ? ' is still caught' : ' is still left alone'),
      topic ? hits.some(h => h.topic === topic) : hits.length === 0,
      hits.map(h => h.topic + ': ' + h.fixed).join(' | '));
  });

  console.log('\nEverything the app itself says\n');
  const lines = [];
  const walk = (o) => {
    if (!o) return;
    if (typeof o === 'string') { lines.push(o); return; }
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o === 'object') {
      if (typeof o.es === 'string') lines.push(o.es);
      Object.keys(o).forEach(k => { if (k !== 'en') walk(o[k]); });
    }
  };
  (ctx.PARLA.data.es.scenarios || []).forEach(sc => { walk(sc.opener); walk(sc.script); walk(sc.fallback); });
  (ctx.PARLA.data.es.vocab || []).forEach(v => { if (v[3]) lines.push(v[3]); });
  (ctx.PARLA.data.es.grammar || []).forEach(g => {
    g.pairs.forEach(pr => { if (pr[0] && !/✗/.test(pr[1] || '')) lines.push(pr[0]); });
  });
  const corpus = lines.filter(x => typeof x === 'string' && x.split(/\s+/).length >= 3);
  const flagged = corpus.filter(l => G.check(l).some(h => !h.soft));
  check('no false positive in ' + corpus.length + ' sentences of known-good Spanish',
    flagged.length === 0,
    flagged.slice(0, 4).map(l => l + ' → ' + G.check(l)[0].fixed).join(' | '));

  console.log('\nIt is fast enough to run on every turn\n');
  const t0 = Date.now();
  corpus.forEach(l => G.check(l));
  const per = (Date.now() - t0) / corpus.length;
  check('under a millisecond a sentence', per < 1, per.toFixed(3) + 'ms');

  console.log('\nA sentence with more than one mistake in it\n');
  // Showing "el problema es que soy cansado" as the correction teaches the
  // learner that the second half was fine.
  const multi = G.correct('la problema es que soy cansado');
  check('every error is fixed, not just the first',
    multi && multi.fixed === 'el problema es que estoy cansado', multi && multi.fixed);
  check('and each rule is named', multi && multi.topics.length === 2,
    multi && multi.topics.join(', '));
  const three = G.correct('yo tiene mucho hambre y soy cansado');
  check('three at once', three && three.fixed === 'yo tengo mucha hambre y estoy cansado',
    three && three.fixed);
  check('correct Spanish still comes back with nothing',
    G.correct('quiero un café con leche') === null);

  console.log('\nVetoing a model that "fixes" correct Spanish\n');
  check('it agrees with a real fix', G.agrees('la problema es grande', 'el problema es grande') === true);
  check('and vetoes a fix that makes it worse',
    G.agrees('el problema es difícil', 'la problema es difícil') === false);

  console.log('\nThe curriculum\n');
  const gram = ctx.PARLA.data.es.grammar;
  check('twenty lessons', gram.length === 20, String(gram.length));
  check('every one says why an English speaker gets it wrong', gram.every(g => (g.why || '').length > 40));
  check('every one has a rule in one sentence', gram.every(g => g.rule && g.rule.length < 160));
  check('every one has minimal pairs', gram.every(g => g.pairs.length >= 2));
  check('every one has a drill', gram.every(g => g.drill.length >= 3));
  check('every drill item offers the wrong answer a learner would give',
    gram.every(g => g.drill.every(d => d[2] && d[2].length >= 1)));
  check('every drill item explains the answer',
    gram.every(g => g.drill.every(d => (d[3] || '').length > 8)));
  const topics = gram.map(g => g.topic);
  check('and every topic the checker can tag has a lesson behind it',
    G.topics().every(t => topics.indexOf(t) !== -1 || t === 'punctuation'),
    G.topics().filter(t => topics.indexOf(t) === -1).join(', '));

  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
  process.exit(fail.length ? 1 : 0);
})();
