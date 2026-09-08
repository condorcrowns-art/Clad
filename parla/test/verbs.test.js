/* The verb engine.
 *
 * It used to know fifty verbs and generate regular endings for anything else,
 * which meant it confidently produced "encontro" and "buscé". These checks are
 * the specification for what it now does instead: stem changes, spelling
 * rules, the compounds of the irregular verbs, and eleven tenses.
 *
 * Every expected form here was checked against how the verb is actually
 * conjugated, not against what the engine happens to output.
 */
const { makeSandbox, load } = require('./harness');
const fs = require('fs');

const ctx = load(makeSandbox(),
  ...fs.readdirSync(__dirname + '/../js/data').filter(f => f.endsWith('.js')).map(f => 'js/data/' + f));
const V = ctx.PARLA.data.es.verbs;

const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };
function forms(inf, tense, expected) {
  const got = (V.conjugate(inf, tense) || []).join(' ');
  check(inf + ' · ' + tense, got === expected, got === expected ? '' : 'got: ' + got + '\n            want: ' + expected);
}

console.log('Regular\n');
forms('hablar', 'presente',  'hablo hablas habla hablamos habláis hablan');
forms('comer',  'presente',  'como comes come comemos coméis comen');
forms('vivir',  'presente',  'vivo vives vive vivimos vivís viven');
forms('hablar', 'preterito', 'hablé hablaste habló hablamos hablasteis hablaron');
forms('comer',  'imperfecto','comía comías comía comíamos comíais comían');
forms('vivir',  'futuro',    'viviré vivirás vivirá viviremos viviréis vivirán');

console.log('\nStem changes — the ones no rule can predict from the spelling\n');
forms('pensar',    'presente', 'pienso piensas piensa pensamos pensáis piensan');
forms('encontrar', 'presente', 'encuentro encuentras encuentra encontramos encontráis encuentran');
forms('volver',    'presente', 'vuelvo vuelves vuelve volvemos volvéis vuelven');
forms('pedir',     'presente', 'pido pides pide pedimos pedís piden');
forms('jugar',     'presente', 'juego juegas juega jugamos jugáis juegan');
forms('dormir',    'preterito','dormí dormiste durmió dormimos dormisteis durmieron');
forms('pedir',     'preterito','pedí pediste pidió pedimos pedisteis pidieron');
forms('pedir',     'subjuntivo','pida pidas pida pidamos pidáis pidan');
forms('dormir',    'subjuntivo','duerma duermas duerma durmamos durmáis duerman');
check('and a verb that only looks like one is left alone',
  V.conjugate('pasar', 'presente').join(' ') === 'paso pasas pasa pasamos pasáis pasan',
  V.conjugate('pasar', 'presente').join(' '));

console.log('\nSpelling rules — these follow from the shape, so they apply to any verb\n');
forms('buscar',    'preterito', 'busqué buscaste buscó buscamos buscasteis buscaron');
forms('llegar',    'preterito', 'llegué llegaste llegó llegamos llegasteis llegaron');
forms('empezar',   'preterito', 'empecé empezaste empezó empezamos empezasteis empezaron');
forms('coger',     'presente',  'cojo coges coge cogemos cogéis cogen');
forms('seguir',    'presente',  'sigo sigues sigue seguimos seguís siguen');
forms('conocer',   'presente',  'conozco conoces conoce conocemos conocéis conocen');
forms('construir', 'presente',  'construyo construyes construye construimos construís construyen');
forms('construir', 'preterito', 'construí construiste construyó construimos construisteis construyeron');
forms('leer',      'preterito', 'leí leíste leyó leímos leísteis leyeron');
forms('caer',      'preterito', 'caí caíste cayó caímos caísteis cayeron');
check('and the accent is not added where the vowels are a diphthong',
  V.conjugate('construir', 'preterito')[1] === 'construiste',
  V.conjugate('construir', 'preterito')[1]);

console.log('\nIrregulars, and the compounds that come free with them\n');
forms('ser',      'presente',  'soy eres es somos sois son');
forms('ir',       'presente',  'voy vas va vamos vais van');
forms('tener',    'preterito', 'tuve tuviste tuvo tuvimos tuvisteis tuvieron');
forms('obtener',  'preterito', 'obtuve obtuviste obtuvo obtuvimos obtuvisteis obtuvieron');
forms('mantener', 'presente',  'mantengo mantienes mantiene mantenemos mantenéis mantienen');
forms('componer', 'subjuntivo','componga compongas componga compongamos compongáis compongan');
forms('convenir', 'futuro',    'convendré convendrás convendrá convendremos convendréis convendrán');
forms('producir', 'preterito', 'produje produjiste produjo produjimos produjisteis produjeron');
forms('traducir', 'preterito', 'traduje tradujiste tradujo tradujimos tradujisteis tradujeron');
forms('oír',      'presente',  'oigo oyes oye oímos oís oyen');
forms('sonreír',  'presente',  'sonrío sonríes sonríe sonreímos sonreís sonríen');
forms('prever',   'presente',  'preveo prevés prevé prevemos preveis prevén');

console.log('\nTenses beyond the six a beginner starts with\n');
forms('hablar', 'imperfectoSubj', 'hablara hablaras hablara habláramos hablarais hablaran');
forms('tener',  'imperfectoSubj', 'tuviera tuvieras tuviera tuviéramos tuvierais tuvieran');
forms('hablar', 'perfecto', 'he hablado has hablado ha hablado hemos hablado habéis hablado han hablado');
forms('ver',    'pluscuamperfecto',
  'había visto habías visto había visto habíamos visto habíais visto habían visto');
check('the past subjunctive is always built off the third-person preterite',
  V.conjugate('producir', 'imperfectoSubj')[0] === 'produjera',
  V.conjugate('producir', 'imperfectoSubj')[0]);

console.log('\nCommands\n');
forms('hablar',   'imperativo', '— habla hable hablemos hablad hablen');
forms('tener',    'imperativo', '— ten tenga tengamos tened tengan');
forms('mantener', 'imperativo', '— mantén mantenga mantengamos mantened mantengan');
forms('ir',       'imperativo', '— ve vaya vamos id vayan');
check('you cannot order yourself about', V.conjugate('comer', 'imperativo')[0] === '—');

console.log('\nParticiples and gerunds\n');
const pg = (inf, p, g) => {
  check(inf + ' → ' + p + ' / ' + g,
    V.participle(inf) === p && V.gerund(inf) === g,
    V.participle(inf) + ' / ' + V.gerund(inf));
};
pg('hablar', 'hablado', 'hablando');
pg('comer',  'comido',  'comiendo');
pg('volver', 'vuelto',  'volviendo');
pg('escribir', 'escrito', 'escribiendo');
pg('decir',  'dicho',   'diciendo');
pg('morir',  'muerto',  'muriendo');
pg('leer',   'leído',   'leyendo');
pg('pedir',  'pedido',  'pidiendo');
pg('ir',     'ido',     'yendo');
check('a compound inherits its irregular participle', V.participle('deshacer') === 'deshecho',
  V.participle('deshacer'));

console.log('\nReflexives\n');
check('the pronoun moves to the front',
  V.conjugate('levantarse', 'presente').join(' ') ===
  'me levanto te levantas se levanta nos levantamos os levantáis se levantan',
  V.conjugate('levantarse', 'presente').join(' '));
check('and the verb underneath still stem-changes',
  V.conjugate('acostarse', 'presente')[0] === 'me acuesto',
  V.conjugate('acostarse', 'presente')[0]);

console.log('\nSaying why\n');
const note = (inf, re) => check(inf + ': ' + re, re.test(V.irregularNote(inf) || ''), V.irregularNote(inf));
note('encontrar', /o→ue/);
note('pedir', /e→i/);
note('buscar', /c→qu/);
note('llegar', /g→gu/);
note('conocer', /z before a and o/);
note('obtener', /Follows tener/);
check('a plain regular verb has nothing to explain', V.irregularNote('hablar') === null);

console.log('\nIt does not fall over\n');
check('a two-letter infinitive is still a verb', !!V.conjugate('ir', 'presente'));
check('nonsense in, nothing out', V.conjugate('', 'presente') === null);
check('an unknown tense is null, not a crash', V.conjugate('hablar', 'nope') === null);
check('a made-up but well-formed verb is conjugated regularly',
  V.conjugate('zurbar', 'presente').join(' ') === 'zurbo zurbas zurba zurbamos zurbáis zurban');

console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
process.exit(fail.length ? 1 : 0);
