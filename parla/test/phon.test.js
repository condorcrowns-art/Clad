/* Spanish phonology.
 *
 * Every expected value here was written from how the word is actually
 * pronounced and syllabified, not from what the engine happens to output. That
 * distinction matters more than usual: an engine that produces a plausible-
 * looking transcription for every word can still be wrong about all of them,
 * and the whole point of it is to tell a learner something true about a sound
 * they cannot hear yet.
 */
const { makeSandbox, load } = require('./harness');
const ctx = load(makeSandbox(), 'js/phon.js', 'js/data/sounds-es.js');
const P = ctx.PARLA.phon;
const SOUNDS = ctx.PARLA.data.es.sounds;

const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

console.log('Letters to sounds\n');
[
  ['perro', 'pero'],        // rr is a trill, written /r/
  ['pero', 'peɾo'],         // single r between vowels is a tap
  ['rojo', 'roxo'],         // r- at the start is a trill; j is /x/
  ['carro', 'karo'],
  ['caro', 'kaɾo'],
  ['gato', 'gato'],         // g at the start is hard
  ['lago', 'laɣo'],         // between vowels it softens
  ['gente', 'xente'],       // g before e is /x/
  ['guitarra', 'gitara'],   // gu before i is just /g/
  ['queso', 'keso'],        // qu is /k/
  ['año', 'aɲo'],
  ['llave', 'ʝaβe'],        // yeísmo, and b between vowels softens
  ['hola', 'ola'],          // h is silent
  ['vaca', 'baka'],         // v is b
  ['nada', 'naða'],         // d between vowels softens
  ['cabeza', 'kaβesa'],     // seseo
  ['chico', 'tʃiko'],
  ['mujer', 'muxeɾ'],
  ['examen', 'eksamen'],
  ['agua', 'aɣua'],
  ['ciudad', 'siuðað']
].forEach(([w, want]) => {
  const got = P.ipa(w);
  check(w + ' → /' + want + '/', got === want, got === want ? '' : 'got /' + got + '/');
});

console.log('\nb and v really are the same, and h really is nothing\n');
check('vaca and baca are homophones', P.ipa('vaca') === P.ipa('baca'));
check('hola and ola are homophones', P.ipa('hola') === P.ipa('ola'));
check('tubo and tuvo are homophones', P.ipa('tubo') === P.ipa('tuvo'));
check('but perro and pero are not', P.ipa('perro') !== P.ipa('pero'));

console.log('\nSyllables, and where the stress lands\n');
[
  ['perro', 'pe-rro', 0],
  ['teléfono', 'te-lé-fo-no', 1],
  ['español', 'es-pa-ñol', 2],
  ['árbol', 'ár-bol', 0],
  ['hablar', 'ha-blar', 1],
  ['ciudad', 'ciu-dad', 1],      // iu is a diphthong
  ['día', 'dí-a', 0],            // an accented weak vowel breaks it
  ['hacia', 'ha-cia', 0],
  ['construcción', 'cons-truc-ción', 2],
  ['psicología', 'psi-co-lo-gí-a', 3],
  ['agua', 'a-gua', 0],
  ['aire', 'ai-re', 0],
  ['reunión', 'reu-nión', 1],
  ['baúl', 'ba-úl', 1],
  ['país', 'pa-ís', 1],
  ['mesa', 'me-sa', 0],
  ['cantar', 'can-tar', 1],
  ['fácil', 'fá-cil', 0],
  ['examen', 'e-xa-men', 1],
  ['abrir', 'a-brir', 1]         // br is never split
].forEach(([w, want, at]) => {
  const s = P.stress(w);
  const got = s.syllables.join('-');
  check(w + ' → ' + want + ', stress on ' + (at + 1),
    got === want && s.index === at, got + ' @' + s.index);
});

console.log('\nThe stress rule, stated and applied\n');
check('a vowel ending is stressed second to last', P.stress('casa').index === 0);
check('an -n ending too', P.stress('hablan').index === 0);
check('an -s ending too', P.stress('casas').index === 0);
check('anything else is stressed on the last', P.stress('hablar').index === 1);
check('and an accent overrules both', P.stress('habló').index === 1 && P.stress('habló').marked);

console.log('\nNaming what went wrong\n');
[
  ['perro', 'pero', 'rr'],        // trill came out as a tap
  ['caro', 'carro', 'r'],         // tap came out as a trill
  ['jamón', 'hamón', 'j'],        // the j got an English h
  ['año', 'ano', 'n-tilde'],
  ['nada', 'nata', 'd'],
  ['rojo', 'rocho', 'j'],
  ['gente', 'guente', 'j'],
  ['calle', 'cale', 'll'],
  ['peso', 'piso', 'vowels']
].forEach(([said, heard, want]) => {
  const c = P.compare(said, heard);
  check('“' + said + '” heard as “' + heard + '” → ' + want,
    c.problems.some(p => p.sound === want),
    JSON.stringify(c.problems.map(p => p.sound)));
});

console.log('\nIt does not invent problems\n');
[['perro', 'perro'], ['hola', 'ola'], ['vaca', 'baca'], ['nada', 'nada']].forEach(([a, b]) => {
  const c = P.compare(a, b);
  check('“' + a + '” heard as “' + b + '” is not a mistake',
    c.exact && c.problems.length === 0, JSON.stringify(c.problems));
});
check('a score of 1 means identical', P.compare('gato', 'gato').score === 1);
check('and a wholly different word scores low', P.compare('gato', 'silla').score < 0.4,
  String(P.compare('gato', 'silla').score));

console.log('\nWhich sounds a word tests\n');
check('perro is an rr word', P.hasSound('perro', 'rr'));
check('pero is a tap word', P.hasSound('pero', 'r') && !P.hasSound('pero', 'rr'));
check('mujer has both a j and a tap', P.hasSound('mujer', 'j') && P.hasSound('mujer', 'r'));
check('nada has a soft d', P.hasSound('nada', 'd'));
check('and dedo does too', P.hasSound('dedo', 'd'));
check('casa has none of them', P.soundsIn('casa').length === 0, P.soundsIn('casa').join(','));

console.log('\nDialects are a setting, not a fact\n');
P.dialect({ seseo: false });
check('without seseo, zapato has a θ', P.ipa('zapato') === 'θapato', P.ipa('zapato'));
P.dialect({ seseo: true });
check('and with it, an s', P.ipa('zapato') === 'sapato');

console.log('\nThe coaching that hangs off it\n');
check('ten sounds', SOUNDS.length === 10, String(SOUNDS.length));
check('each says what to do with your mouth', SOUNDS.every(s => (s.mouth || '').length > 55));
check('each says what English makes you do instead', SOUNDS.every(s => (s.instead || '').length > 50));
check('each has minimal pairs', SOUNDS.every(s => s.pairs.length >= 3));
check('each has words to practise', SOUNDS.every(s => s.words.length >= 6));
check('each has a sentence for when you get it wrong', SOUNDS.every(s => (s.tell || '').length > 15));
check('every practice word actually contains its sound',
  SOUNDS.filter(s => ['vowels', 'stress', 'h'].indexOf(s.id) === -1)
    .every(s => s.words.every(w => P.hasSound(w, s.id))),
  SOUNDS.filter(s => ['vowels', 'stress', 'h'].indexOf(s.id) === -1)
    .flatMap(s => s.words.filter(w => !P.hasSound(w, s.id)).map(w => s.id + ':' + w)).join(' '));
// A pair is one of three things: two different sounds, two spellings of the
// same sound, or the same sounds with the stress in a different place.
const pairOk = (p) =>
  p[4] === 'same' ? P.ipa(p[0]) === P.ipa(p[2])
  : p[4] === 'stress' ? (P.ipa(p[0]) === P.ipa(p[2]) &&
                         P.stress(p[0]).index !== P.stress(p[2]).index)
  : P.ipa(p[0]) !== P.ipa(p[2]);
check('every minimal pair really is one',
  SOUNDS.every(s => s.pairs.every(pairOk)),
  SOUNDS.flatMap(s => s.pairs.filter(p => !pairOk(p))
    .map(p => s.id + ' ' + p[0] + '/' + p[2])).join(' '));
check('and the stress pairs differ only in stress',
  SOUNDS.find(s => s.id === 'stress').pairs.every(p =>
    P.ipa(p[0]) === P.ipa(p[2]) && P.stress(p[0]).index !== P.stress(p[2]).index));

check('every sound the engine can name has coaching behind it',
  ['rr','r','j','n-tilde','b-v','d','ll','vowels','h','stress']
    .every(id => !!ctx.PARLA.data.es.soundsById[id]));

console.log('\nIt does not fall over\n');
check('an empty word is empty', P.ipa('') === '' && P.syllables('').length === 0);
check('a single letter is one syllable', P.syllables('a').join('') === 'a');
check('punctuation does not crash it', typeof P.ipa('¿qué?') === 'string');

console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
process.exit(fail.length ? 1 : 0);
