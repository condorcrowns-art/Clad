/* Nothing else about a voice matters as much as this. One mangled number
 * undoes a whole neural model's worth of realism, because a person would never
 * say it that way. */
const { makeSandbox, load } = require('./harness');
const T = load(makeSandbox(), 'js/saytext.js').PARLA.saytext;

const fail = [];
function eq(name, got, want) {
  const ok = got === want;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + '  →  ' + JSON.stringify(got) +
    (ok ? '' : '   want ' + JSON.stringify(want)));
  if (!ok) fail.push(name);
}
function has(name, got, want) {
  const ok = String(got).indexOf(want) !== -1;
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + '  →  ' + JSON.stringify(got));
  if (!ok) fail.push(name);
}

console.log('Numbers\n');
eq('zero', T.numberToWords(0), 'cero');
eq('the teens are single words', T.numberToWords(16), 'dieciséis');
eq('so are the twenties', T.numberToWords(22), 'veintidós');
eq('thirty-one takes "y"', T.numberToWords(31), 'treinta y uno');
eq('a bare hundred is "cien"', T.numberToWords(100), 'cien');
eq('but 101 is "ciento uno"', T.numberToWords(101), 'ciento uno');
eq('the irregular hundreds', T.numberToWords(500), 'quinientos');
eq('700 is not "sietecientos"', T.numberToWords(700), 'setecientos');
eq('900 is not "nuevecientos"', T.numberToWords(900), 'novecientos');
eq('the room number that started this', T.numberToWords(204), 'doscientos cuatro');
eq('a thousand is "mil", never "un mil"', T.numberToWords(1000), 'mil');
eq('two thousand', T.numberToWords(2000), 'dos mil');
eq('a full year', T.numberToWords(1999), 'mil novecientos noventa y nueve');
eq('a million is singular', T.numberToWords(1000000), 'un millón');
eq('and plural above that', T.numberToWords(3000000), 'tres millones');
eq('feminine agreement', T.numberToWords(1, 'f'), 'una');
eq('apocopated before a noun', T.numberToWords(1, 'apoc'), 'un');
eq('21 agrees too', T.numberToWords(21, 'f'), 'veintiuna');
eq('and hundreds agree', T.numberToWords(200, 'f'), 'doscientas');

console.log('\nThe clock\n');
eq('on the hour', T.timeToWords(9, 0), 'las nueve en punto de la mañana');
eq('one o\'clock is singular', T.timeToWords(13, 0), 'la una en punto de la tarde');
eq('quarter past', T.timeToWords(9, 15), 'las nueve y cuarto de la mañana');
eq('half past', T.timeToWords(21, 30), 'las nueve y media de la noche');
eq('quarter to counts forward', T.timeToWords(8, 45), 'las nueve menos cuarto de la mañana');
eq('and so does ten to', T.timeToWords(8, 50), 'las nueve menos diez de la mañana');
eq('past the hour', T.timeToWords(10, 20), 'las diez y veinte de la mañana');

console.log('\nIn a sentence\n');
eq('the room number', T.forSpeech('Habitación 204, segunda planta.'),
   'Habitación doscientos cuatro, segunda planta.');
eq('a price', T.forSpeech('Son 3,20 €.'), 'Son tres euros con veinte.');
eq('a price written the other way', T.forSpeech('Cuesta €12.'), 'Cuesta doce euros.');
eq('one euro is singular', T.forSpeech('Solo 1 €.'), 'Solo un euro.');
eq('the word form too', T.forSpeech('Son 5 euros.'), 'Son cinco euros.');
eq('and the three-letter code a model might write',
   T.forSpeech('Son 7,50 EUR.'), 'Son siete euros con cincuenta.');
eq('a time', T.forSpeech('La mesa es a las 21:00.'),
   'La mesa es a las nueve en punto de la noche.');
eq('a percentage', T.forSpeech('Hay un 25% de descuento.'),
   'Hay un veinticinco por ciento de descuento.');
eq('a decimal', T.forSpeech('Pesa 1,5 kg.'), 'Pesa uno coma cinco kilos.');
eq('an ordinal', T.forSpeech('En el 3er piso.'), 'En el tercer piso.');
eq('a feminine ordinal', T.forSpeech('La 2ª puerta.'), 'La segunda puerta.');
has('titles are spoken in full', T.forSpeech('Buenos días, Sr. García.'), 'señor García');
has('and the feminine one is not eaten by the masculine rule',
    T.forSpeech('Pregunte a la Dra. Ruiz.'), 'doctora Ruiz');
has('usted', T.forSpeech('¿Cómo está Ud.?'), 'usted');
eq('a phone number is read digit by digit, so none can go missing',
   T.forSpeech('Llama al 600123456.'),
   'Llama al seis cero cero uno dos tres cuatro cinco seis.');
eq('an article before a time is not doubled', T.forSpeech('Nos vemos a las 14:30.'),
   'Nos vemos a las dos y media de la tarde.');
eq('a time with no article still works', T.forSpeech('Sale 8:15.'),
   'Sale las ocho y cuarto de la mañana.');

console.log('\nLeft alone\n');
eq('ordinary Spanish is untouched', T.forSpeech('¿Qué le pongo esta mañana?'),
   '¿Qué le pongo esta mañana?');
eq('question marks survive, both of them', T.forSpeech('¿Cuánto es?'), '¿Cuánto es?');
eq('empty input', T.forSpeech(''), '');
eq('null input', T.forSpeech(null), '');
has('emoji are not read aloud', T.forSpeech('¡Vale! 👍 Hasta luego.'), 'Vale');
eq('and leave no double spaces', T.forSpeech('¡Vale! 👍 Hasta luego.'), '¡Vale! Hasta luego.');
eq('markdown is stripped', T.forSpeech('Es **muy** bueno.'), 'Es muy bueno.');

console.log('\nSentences\n');
const s1 = T.sentences('Marchando. ¿Para tomar aquí o para llevar?');
eq('split into two', s1.length, 2);
eq('the question keeps its opening mark', s1[1], '¿Para tomar aquí o para llevar?');
eq('a single sentence stays whole', T.sentences('Hola').length, 1);
eq('nothing in, nothing out', T.sentences('').length, 0);
eq('trailing space does not make a sentence', T.sentences('Hola. ').length, 1);

console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
process.exit(fail.length ? 1 : 0);
