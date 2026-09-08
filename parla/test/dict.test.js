/* The dictionary and the morphology engine.
 *
 * The claim being tested is the one the whole upgrade rests on: any Spanish
 * word, in any form it appears in real writing, can be worked back to the word
 * you would look up — offline, with no model, in well under a millisecond.
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
load(ctx, 'js/dict.js', 'js/morph.js');

const raw = JSON.parse(fs.readFileSync(ROOT + '/js/data/dict-es.json', 'utf8'));
ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(raw) });
vm.runInContext('globalThis.fetch = fetch;', ctx);

const D = ctx.PARLA.dict;
const M = ctx.PARLA.morph;

(async () => {
  console.log('The file itself\n');
  check('it is a derivative and says whose', /CC BY-SA/.test(raw.licence) && raw.sources.length >= 2);
  check('every row has a word, a part of speech and a meaning',
    raw.rows.every(r => r[0] && r[1] && r[3]));
  check('nothing is a bare inflected form',
    !raw.rows.some(r => /^(feminine|masculine|plural) (plural )?(past participle|of)\b/i.test(r[3])));
  check('the ranked head is ordered commonest first, and it is most of the file',
    raw.ranked > 10000 && raw.ranked < raw.count, raw.ranked + ' of ' + raw.count);

  check('it is big enough to be called a dictionary', raw.count > 25000, String(raw.count));
  const bytes = fs.statSync(ROOT + '/js/data/dict-es.json').size;
  check('and small enough to send to a phone once', bytes < 3 * 1024 * 1024,
    (bytes / 1024 / 1024).toFixed(2) + ' MB uncompressed');

  console.log('\nBefore it is loaded, nothing pretends otherwise\n');
  check('the dictionary knows it is not ready', D.ready() === false);
  check('a lookup returns nothing rather than throwing', D.get('casa') === null);
  check('and the morphology engine stands down', M.ready() === false && M.analyse('hablo').length === 0);

  await D.load();
  console.log('\nLoaded\n');
  check('it reports how many words it has', D.size() === raw.count, String(D.size()));
  check('and the morphology engine comes up with it', M.ready() === true);

  console.log('\nLooking a word up\n');
  const casa = D.get('casa');
  check('a word', casa && /house/.test(casa.en), casa && casa.en);
  check('with its gender', casa.gender === 'f', casa.gender);
  check('with its place in the language', casa.band > 0 && casa.band < 400, String(casa.band));
  check('the article is forgiven', D.get('la casa').term === 'casa');
  check('so are the accents', D.get('cancion') && D.get('cancion').term === 'canción');
  check('gender is right where the ending lies about it',
    D.get('problema').gender === 'm' && D.get('mano').gender === 'f' && D.get('hambre').gender === 'f',
    [D.get('problema').gender, D.get('mano').gender, D.get('hambre').gender].join(''));
  check('a word nobody uses is still nothing', D.get('qwertzuiop') === null);

  console.log('\nThe words a beginner meets first are the ones written by hand\n');
  ['el', 'la', 'un', 'una', 'de', 'que', 'hay', 'del', 'muy', 'pero'].forEach(w => {
    const e = D.get(w);
    check('“' + w + '” has a meaning a person could use', !!e && e.en.length < 60, e && e.en);
  });

  console.log('\nWorking a form backwards\n');
  const cases = [
    ['hablo',         'hablar',   /present.*yo/i],
    ['hablé',         'hablar',   /preterite/i],
    ['hablaríamos',   'hablar',   /conditional/i],
    ['tuvieron',      'tener',    /preterite/i],
    ['fui',           'ser',      /preterite/i],
    ['durmiendo',     'dormir',   /gerund/i],
    ['encuentro',     'encontrar',/present/i],
    ['conozco',       'conocer',  /present/i],
    ['construyeron',  'construir',/preterite/i],
    ['sonríen',       'sonreír',  /present/i],
    ['madrugábamos',  'madrugar', /imperfect/i],
    ['pidiéndoselo',  'pedir',    /gerund/i],
    ['dímelo',        'decir',    /imperative/i],
    ['tráemelo',      'traer',    /imperative/i],
    ['vámonos',       'ir',       /imperative/i],
    ['irnos',         'ir',       /infinitive/i],
    ['casas',         'casa',     /plural/i],
    ['luces',         'luz',      /plural/i],
    ['canciones',     'canción',  /plural/i],
    ['españolas',     'español',  /feminine plural/i],
    ['trabajadora',   'trabajador', /feminine/i],
    ['rápidamente',   'rápidamente', null],
    ['buenísimo',     'bueno',    /very/i],
    ['perrito',       'perro',    /little/i]
  ];
  cases.forEach(([surface, lemma, why]) => {
    const a = M.analyse(surface);
    const hit = a.find(x => x.lemma === lemma);
    check(surface + ' → ' + lemma,
      // A null pattern means "it is simply that word, no unpicking needed".
      !!hit && (why === null ? !!hit.exact : (why.test(hit.why || '') || why.test(hit.tense || ''))),
      hit ? (hit.why || hit.tense || 'exact') : 'got: ' + a.map(x => x.lemma).join(', '));
  });

  console.log('\nIt does not invent readings\n');
  check('a word that is not Spanish gets nothing', M.analyse('xyzzy').length === 0);
  check('an empty string gets nothing', M.analyse('').length === 0);
  check('punctuation is stripped rather than confusing it',
    M.analyse('¿hablas?').some(a => a.lemma === 'hablar'));
  check('a proposed lemma always exists in the dictionary',
    M.analyse('comieron').every(a => !!D.get(a.lemma)));

  console.log('\nAmbiguity is shown, not hidden\n');
  const casas = M.analyse('casas');
  check('“casas” offers both readings', casas.length >= 2, casas.map(a => a.lemma).join(', '));
  check('and the commoner word leads', casas[0].lemma === 'casa', casas[0].lemma);
  const encuentro = M.analyse('encuentro');
  check('“encuentro” is both a noun and a verb form',
    encuentro.some(a => a.pos === 'n') && encuentro.some(a => a.pos === 'v'),
    encuentro.map(a => a.lemma + ':' + a.pos).join(', '));

  console.log('\nTwo words that name one tense\n');
  [['habíamos comido', 'comer', /past perfect/i],
   ['he hablado', 'hablar', /present perfect/i],
   ['estoy comiendo', 'comer', /progressive/i],
   ['voy a comer', 'comer', /going-to/i]].forEach(([text, lemma, why]) => {
    const a = M.analyse(text);
    check(text + ' → ' + lemma, a.length > 0 && a[0].lemma === lemma && why.test(a[0].tense || ''),
      a.length ? a[0].lemma + ' / ' + a[0].tense : 'nothing');
  });

  console.log('\nEnough of the language, fast enough to use on a keystroke\n');
  const freqPath = path.join(__dirname, '..', 'tools', 'cache', 'freq-es.txt');
  if (fs.existsSync(freqPath)) {
    const words = fs.readFileSync(freqPath, 'utf8').split('\n')
      .map(l => l.split(' ')[0]).filter(w => /^[a-záéíóúñü]+$/.test(w)).slice(0, 3000);
    const t0 = Date.now();
    const hits = words.filter(w => M.analyse(w).length).length;
    const per = (Date.now() - t0) / words.length;
    check('at least 88% of the 3,000 commonest spoken words are understood',
      hits / words.length >= 0.88, (hits * 100 / words.length).toFixed(1) + '%');
    check('and a lookup costs under a millisecond', per < 1, per.toFixed(3) + 'ms per word');
  } else {
    console.log('  SKIP  frequency list not cached — run tools/build-dict.js first');
  }

  console.log('\nCoverage, the number on the Stats screen\n');
  const known = (t) => ['casa', 'perro', 'de', 'que'].indexOf(t) >= 0;
  const cov = D.coverage(known, 1000);
  check('it counts against single words, not phrases', cov.total > 500 && cov.total < 1000, String(cov.total));
  check('and reports what is known', cov.have === 4, String(cov.have));
  check('as a percentage', cov.pct === Math.round(cov.have * 100 / cov.total));

  console.log('\nSearching\n');
  check('by Spanish', D.search({ q: 'sombra', limit: 5 })[0].term === 'sombra');
  check('by English', D.search({ q: 'shadow', limit: 20 }).some(e => e.term === 'sombra'));
  check('filtered to verbs', D.search({ pos: 'v', limit: 30 }).every(e => e.pos === 'v'));
  check('within a band', D.search({ band: [1, 100], limit: 200 }).every(e => e.band <= 100));
  check('a band is words, not phrases', D.band(1, 500, 500).every(e => !e.term.includes(' ')));

  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
  process.exit(fail.length ? 1 : 0);
})();
