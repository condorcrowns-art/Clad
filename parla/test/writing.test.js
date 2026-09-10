/* The writing prompts, and the Spanish in them.
 *
 * A prompt is a sentence the learner reads as correct Spanish and a model
 * answer is one they will copy, so both have to be right. The grammar checker
 * has a measured zero false positives across eight hundred sentences of
 * known-good Spanish, which makes it a fair judge of the app's own prose —
 * and running the reading texts through it last time found four bugs in the
 * checker, so this is worth doing in both directions.
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

(async () => {
  await ctx.PARLA.dict.load();
  const G = ctx.PARLA.grammar;
  const tasks = ctx.PARLA.data.es.writing;

  console.log('The tasks\n');
  check('twenty-four of them', tasks.length === 24, String(tasks.length));
  const byLevel = tasks.reduce((a, t) => { a[t.level] = (a[t.level] || 0) + 1; return a; }, {});
  check('graded across three levels, weighted to the start',
    byLevel.a1 >= 8 && byLevel.a2 >= 6 && byLevel.b1 >= 5, JSON.stringify(byLevel));
  check('every id is unique',
    new Set(tasks.map(t => t.id)).size === tasks.length);

  console.log('\nEvery task is a task, not a topic\n');
  // "Talk about your family" is a topic. "¿Cómo es tu familia?" is a question
  // with an answer, and the difference decides whether anyone writes anything.
  check('each one asks something', tasks.every(t => /[?.]$/.test(t.ask)),
    tasks.filter(t => !/[?.]$/.test(t.ask)).map(t => t.id).join(', '));
  check('each says in English what it wants', tasks.every(t => t.en.length > 25));
  check('each names the grammar you cannot avoid', tasks.every(t => t.forces.length > 50),
    tasks.filter(t => t.forces.length <= 50).map(t => t.id).join(', '));
  check('each offers words you will reach for', tasks.every(t => t.hint.length >= 3));
  check('with what they mean', tasks.every(t => t.hint.every(h => h[0] && h[1])));
  // A short one and a fuller one: a single model answer teaches that there is
  // one right answer, which is the opposite of what writing is for.
  check('and two answers, a short one and a longer one',
    tasks.every(t => t.model.length === 2 && t.model[1].length > t.model[0].length),
    tasks.filter(t => !(t.model.length === 2 && t.model[1].length > t.model[0].length))
      .map(t => t.id).join(', '));

  console.log('\nAll of its Spanish, through the checker\n');
  const flagged = [];
  let n = 0;
  tasks.forEach(t => {
    [t.ask].concat(t.model).forEach(s => {
      n++;
      const hits = G.check(s).filter(h => !h.soft);
      if (hits.length) flagged.push(t.id + ': ' + s + ' → ' + hits[0].fixed);
    });
  });
  check('no prompt or model answer is flagged, in ' + n + ' sentences',
    flagged.length === 0, flagged.slice(0, 3).join(' | '));

  console.log('\nThe grammar each one forces really is in the answer\n');
  // A prompt that claims to force gustar and has no gustar in either model
  // answer is a prompt that does not do what it says.
  const proof = {
    gustos: /gust/, rutina: /me (levanto|acuesto)/, comida: /(comí|cené|desayuné)/,
    finde: /(fui|hice|estuve|quedé|salí)/, infancia: /(era|jugaba|vivíamos|volvía)/,
    ojala: /si (pudiera|tuviera|hubiera)/, futuro: /(seré|viviré|seguiré)/,
    salud: /(duele|duelen)/, mananana: /voy a/, comparar: /(más|mejor|tan)/
  };
  Object.keys(proof).forEach(id => {
    const t = ctx.PARLA.data.es.writingById[id];
    check(id + ' really forces what it claims',
      !!t && t.model.some(m => proof[id].test(m.toLowerCase())),
      t && t.model.join(' / '));
  });

  console.log('\nWhat a learner will actually type\n');
  // The point of the screen: these are the mistakes an English speaker makes
  // writing these very answers, and each has to be caught and named.
  [['Yo tiene dos hermano.', /tengo/, 'person'],
   ['Me gusta los libros.', /gustan/, 'gustar'],
   ['Soy cansado hoy.', /[Ee]stoy/, 'serestar'],
   ['La problema es dificil.', /El problema/, 'gender'],
   ['Mi casa es muy pequeño.', /pequeña/, 'agreement'],
   ['Voy a el cine.', /al cine/, 'contractions'],
   ['Tengo tres hermano.', /hermanos/, 'agreement']
  ].forEach(([wrote, want, topic]) => {
    const fixed = G.correct(wrote);
    check('“' + wrote + '” is caught', !!fixed && want.test(fixed.fixed),
      fixed ? fixed.fixed : 'nothing');
    check('   and filed under ' + topic,
      !!fixed && fixed.topics.indexOf(topic) !== -1,
      fixed ? fixed.topics.join(', ') : '');
  });

  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll writing checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
