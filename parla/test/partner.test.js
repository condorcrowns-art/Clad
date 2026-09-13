/* The partner you get when there is no model.
 *
 * It runs whenever Ollama is not up, whenever the Workers AI binding is not
 * configured, and whenever the network is gone — which means it is the first
 * thing a new user is likely to meet. It was bad in ways that are worth
 * writing down, because each one is a rule:
 *
 *   Say "hola" and it answered the beat keyed on "llamo/soy/hola", spending
 *   the "you told me your name" reply on a greeting. One turn later the
 *   learner gave their name and was asked for their name. That is the exact
 *   complaint that started this work.
 *
 *   Each scenario had one fallback line. In a ten-turn conversation over a
 *   four-beat script that is the same sentence six times, which is worse than
 *   saying nothing at all.
 *
 *   "What does 'de dónde' mean?" counted the quoted Spanish and decided the
 *   whole question was Spanish, so the learner got a Spanish brush-off and the
 *   grammar checker told them to put a ¿ in front of "What".
 *
 *   And asked what "trabajas" means, it answered about the word "mean" —
 *   which is the ellos-form of "mear" — and defined urinating.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { makeSandbox, load } = require('./harness');

const ROOT = path.join(__dirname, '..');
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

const ctx = makeSandbox();
vm.runInContext(`
  globalThis.fetch = function(){ return Promise.reject(new Error('no network')); };
  var __ls = {};
  globalThis.localStorage = { getItem: k => __ls[k] == null ? null : __ls[k],
    setItem: (k, v) => { __ls[k] = String(v); }, removeItem: k => { delete __ls[k]; } };
  globalThis.console = console;
`, ctx);
load(ctx, 'js/srs.js', 'js/store.js',
  ...fs.readdirSync(ROOT + '/js/data').filter(f => f.endsWith('.js')).map(f => 'js/data/' + f),
  'js/dict.js', 'js/morph.js', 'js/grammar.js', 'js/brain.js');
const raw = JSON.parse(fs.readFileSync(ROOT + '/js/data/dict-es.json', 'utf8'));
ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(raw) });
vm.runInContext('globalThis.fetch = fetch; PARLA.store.load();', ctx);

const B = ctx.PARLA.brain;

function talk(scenarioId, turns) {
  const sc = ctx.PARLA.data.es.scenarios.filter(s => s.id === scenarioId)[0];
  const st = ctx.PARLA.store.state;
  st.settings.brain = 'scripted';
  const history = [];
  const scriptState = { used: [], fb: 0 };
  const out = [];
  return turns.reduce((chain, t) => chain.then(() =>
    B.reply({
      scenario: sc, history: history.slice(), text: t,
      settings: Object.assign({}, st.settings, { level: st.profile.level }),
      memory: st.memory, confidence: 0.9, alternatives: [],
      targetWords: [], pastMistakes: [], scriptState: scriptState
    }).then(res => {
      history.push({ role: 'user', text: t });
      history.push({ role: 'partner', text: res.es });
      out.push(res);
    })
  ), Promise.resolve()).then(() => out);
}

(async () => {
  await ctx.PARLA.dict.load();

  console.log('Saying hello\n');
  let r = await talk('presentarse', ['hola', 'me llamo Condo', 'soy de Irlanda']);
  // A greeting is not an answer, and must not spend the beat that replies to
  // one.
  check('a bare greeting is greeted back', /hola|buenas/i.test(r[0].es), r[0].es);
  check('and the scene asks its question again rather than reciting the opener',
    r[0].es.length < 40, r[0].es);
  check('so the name, when it comes, is acknowledged',
    /encantado|mucho gusto|de dónde/i.test(r[1].es), r[1].es);
  check('and the conversation moves on from there',
    /qué haces|trabajas|estudias/i.test(r[2].es), r[2].es);

  console.log('\nWhen the script runs out\n');
  r = await talk('presentarse', ['me llamo Ana', 'soy de Escocia', 'trabajo en una oficina',
    'conozco a Ana del trabajo', 'tengo veintiséis años', 'me gusta el fútbol',
    'vivo cerca de aquí', 'quiero aprender español', 'no tengo hermanos']);
  const tail = r.slice(4).map(x => x.es);
  check('it never says the same thing twice running',
    tail.every((line, i) => i === 0 || line !== tail[i - 1]), tail.join('  //  '));
  check('and every one of them asks something, so there is a turn to take',
    tail.every(line => /\?/.test(line)), tail.join('  //  '));
  // Not comprehension — but repeating a word they actually said is the
  // difference between a partner listening and a partner reading from a card.
  check('and it hands back a word they used',
    tail.some(line => /fútbol|hermano|español|oficina/i.test(line)),
    tail.join('  //  '));

  console.log('\nTen turns in every scenario\n');
  // Nearly every script is four beats and the sixty-day plan asks for up to
  // ten turns, so from turn five onwards the partner was reaching for
  // something generic in every scene. A waiter who asks "¿y de segundo?" is
  // still a waiter; one who says "cuéntame más" has left the café.
  const filler = ['hola', 'sí', 'no, gracias', 'claro', 'vale', 'no sé',
                  'creo que sí', 'perfecto', 'muy bien', 'hasta luego'];
  const offenders = [];
  const generic = [];
  for (const sc of ctx.PARLA.data.es.scenarios) {
    const lines = (await talk(sc.id, filler)).map(x => x.es);
    lines.forEach((line, i) => {
      if (i > 0 && line === lines[i - 1]) offenders.push(sc.id + ' repeated: ' + line);
    });
    // The scene's own words: its beats, its continuations, its repair lines,
    // and the question it re-asks when greeted. Everything else is the shared
    // pool, which is fine at the very end of a long conversation and wrong in
    // the middle of one.
    const own = (sc.script || []).map(b => b.say.es)
      .concat((sc.more || []).map(m => m.es))
      .concat((sc.fallback || []).map(m => m.es))
      .concat([(sc.opener && sc.opener.es) || '']).filter(Boolean);
    const mine = lines.filter(l => own.some(o => l.indexOf(o) !== -1 ||
      (o.length > 12 && l.indexOf(o.slice(-12)) !== -1)));
    if (mine.length < 7) generic.push(sc.id + ': only ' + mine.length + ' of 10 in scene');
  }
  check('no scenario ever repeats itself two turns running',
    offenders.length === 0, offenders.slice(0, 3).join(' | '));
  // Before this, every scenario had four beats and one fallback line, so six
  // of ten turns were the same generic sentence.
  check('and all twenty-three stay in scene for at least seven of ten turns',
    generic.length === 0, generic.slice(0, 4).join(' | '));

  console.log('\nWhat it hands back\n');
  // "¿La gracias?" is not a question a person asks, and "¿La pregunta? ¿Tiene
  // alguna pregunta para nosotros?" is the echo tripping over the line it is
  // introducing.
  r = await talk('cafe', ['un café', 'para aquí', 'y una tostada', 'con tomate',
                          'muchas gracias', 'perfecto']);
  const said = r.map(x => x.es).join(' // ');
  check('a courtesy is never echoed back as a subject', !/¿(La|El) gracias/i.test(said), said);
  check('nor a word the reply is about to use itself',
    !r.some(x => {
      const m = x.es.match(/^¿(?:El|La) ([a-zá-ú]+)\?\s+(.*)$/i);
      return m && m[2].toLowerCase().indexOf(m[1].toLowerCase()) !== -1;
    }), said);

  console.log('\nSpanish that only looks English\n');
  // "he" is the Spanish auxiliary and "no" is the Spanish negative. On the
  // strength of those two, "no he tomado nada" was answered with "in Spanish,
  // please".
  for (const line of ['no he tomado nada', 'no he comido', 'no entiendo',
                      'me llamo Ana', 'no soy de aquí']) {
    const one = await talk('presentarse', [line]);
    check('“' + line + '” is treated as Spanish',
      !/en español si puedes/.test(one[0].es), one[0].es);
  }
  for (const line of ['what does this mean', 'I do not understand', 'can you say that again']) {
    const one = await talk('presentarse', [line]);
    check('“' + line + '” is still treated as English',
      /en español si puedes/.test(one[0].es), one[0].es);
  }

  console.log('\nAsking a question in English\n');
  r = await talk('presentarse', ['What does "de dónde" mean?']);
  check('an English question is recognised as English even when it quotes Spanish',
    /en español|in Spanish/i.test(r[0].es + r[0].en), r[0].es);
  // The app ships thirty-one thousand words and a morphology engine. Sending
  // someone away with "in Spanish please" while holding the answer is the kind
  // of thing that makes a tool feel obstinate.
  check('and the question is answered from the dictionary',
    /dónde/i.test(r[0].note || ''), r[0].note);
  check('with no Spanish grammar correction applied to English',
    !r[0].correction, JSON.stringify(r[0].correction));

  r = await talk('presentarse', ['what does trabajas mean']);
  check('an unquoted Spanish word is found', /trabaj/i.test(r[0].note || ''), r[0].note);
  // "mean" is the ellos-form of "mear". The morphology was right; it was asked
  // the wrong question.
  check('and the English words around it are not looked up as Spanish',
    !/piss|urinat/i.test(r[0].note || ''), r[0].note);

  console.log('\nThe word it looks up\n');
  const M = ctx.PARLA.morph;
  // "trabajas" was read as the feminine plural of "trabajo" — a masculine noun
  // that has no feminine at all — and that reading beat the tú-form of
  // trabajar on frequency.
  [['trabajas', 'trabajar'], ['estudias', 'estudiar'], ['bailas', 'bailar'],
   ['hablas', 'hablar'], ['cantas', 'cantar']
  ].forEach(([form, want]) => {
    const a = M.analyse(form);
    check('“' + form + '” is the tú-form of ' + want,
      a.length > 0 && a[0].lemma === want && a[0].pos === 'v',
      a.slice(0, 2).map(x => x.lemma + '/' + x.pos).join(' | '));
  });
  // And the nouns that genuinely do have a feminine keep it.
  [['amigas', 'amigo'], ['niñas', 'niño'], ['hermanas', 'hermano'],
   ['profesoras', 'profesor'], ['trabajadoras', 'trabajador'], ['alemanas', 'alemán']
  ].forEach(([form, want]) => {
    const a = M.analyse(form);
    check('“' + form + '” is still the feminine plural of ' + want,
      a.some(x => x.lemma === want && /feminine/.test(x.why || '')),
      a.slice(0, 2).map(x => x.lemma + ' (' + (x.why || '') + ')').join(' | '));
  });
  check('and the fact comes from the dictionary, not from the ending',
    ctx.PARLA.dict.hasFeminine('amigo') && !ctx.PARLA.dict.hasFeminine('trabajo'));

  console.log('\nStill correcting real Spanish\n');
  r = await talk('presentarse', ['yo tiene hambre']);
  check('a Spanish mistake is still caught',
    r[0].correction && /tengo/.test(r[0].correction.fixed),
    r[0].correction && r[0].correction.fixed);

  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll partner checks passed\n');
  process.exit(fail.length ? 1 : 0);
})();
