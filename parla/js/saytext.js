/* Parla — turning written Spanish into speakable Spanish
 *
 * Text-to-speech reads what it is given. "Habitación 204" becomes "habitación
 * two oh four" or a flat digit-by-digit recital; "Son 3,20 €" becomes noise.
 * Nothing else about a voice matters as much as this: one mangled number in a
 * sentence undoes a whole neural model's worth of realism, because a person
 * would never say it that way.
 *
 * So everything that is written as a symbol gets rewritten as the words a
 * Spanish speaker would actually say, before it ever reaches the synthesiser.
 * Purely a speech layer — the text on screen is left exactly as written.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  /* ── Numbers ──────────────────────────────────────────────
   * Spanish is not a simple lookup: "1" is uno, un or una depending on what
   * follows; 16-29 are single words; the hundreds are irregular in four
   * places; and "ciento" drops to "cien" only when nothing follows it.
   */
  var ONES = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete',
              'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince',
              'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte',
              'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
              'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];

  var TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta',
              'sesenta', 'setenta', 'ochenta', 'noventa'];

  var HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
                  'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  /* gender: 'm' (default), 'f' for "una", or 'apoc' for the "un" before a noun. */
  function under1000(n, gender) {
    if (n === 0) return '';
    if (n === 100) return 'cien';

    var out = [];
    var h = Math.floor(n / 100), rest = n % 100;
    if (h) out.push(HUNDREDS[h]);

    if (rest) {
      if (rest < 30) {
        out.push(ONES[rest]);
      } else {
        var t = Math.floor(rest / 10), u = rest % 10;
        out.push(u ? TENS[t] + ' y ' + ONES[u] : TENS[t]);
      }
    }

    var text = out.join(' ');
    // Agreement only ever touches the final "uno".
    if (gender === 'f') text = text.replace(/uno$/, 'una').replace(/veintiuno$/, 'veintiuna');
    else if (gender === 'apoc') text = text.replace(/uno$/, 'un').replace(/veintiuno$/, 'veintiún');
    // Hundreds agree too: "doscientas personas".
    if (gender === 'f') text = text.replace(/cientos\b/, 'cientas');
    return text;
  }

  function numberToWords(n, gender) {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'cero';
    if (n < 1000) return under1000(n, gender);

    if (n < 1000000) {
      var thousands = Math.floor(n / 1000), rest = n % 1000;
      // "mil", never "un mil".
      var head = thousands === 1 ? 'mil' : under1000(thousands, 'f') + ' mil';
      return rest ? head + ' ' + under1000(rest, gender) : head;
    }

    var millions = Math.floor(n / 1000000), r = n % 1000000;
    var mHead = millions === 1 ? 'un millón' : numberToWords(millions, 'm') + ' millones';
    return r ? mHead + ' ' + numberToWords(r, gender) : mHead;
  }

  /* ── The clock ────────────────────────────────────────────
   * Spanish tells the time in halves and quarters, and says "la una" for one
   * o'clock and "las" for everything else. A digital recital ("veintiuno
   * treinta") is technically possible and nobody speaks that way.
   */
  function timeToWords(h, m) {
    h = h % 24;
    var period = h < 6 ? ' de la madrugada'
               : h < 12 ? ' de la mañana'
               : h < 21 ? ' de la tarde'
               : ' de la noche';

    var h12 = h % 12; if (h12 === 0) h12 = 12;
    var lead = h12 === 1 ? 'la una' : 'las ' + under1000(h12, 'f');

    if (m === 0)  return lead + ' en punto' + period;
    if (m === 15) return lead + ' y cuarto' + period;
    if (m === 30) return lead + ' y media' + period;
    if (m === 45) {
      var next = (h12 % 12) + 1;
      var nlead = next === 1 ? 'la una' : 'las ' + under1000(next, 'f');
      return nlead + ' menos cuarto' + period;
    }
    if (m > 30) {
      var nx = (h12 % 12) + 1;
      var nl = nx === 1 ? 'la una' : 'las ' + under1000(nx, 'f');
      return nl + ' menos ' + under1000(60 - m, 'm') + period;
    }
    return lead + ' y ' + under1000(m, 'm') + period;
  }

  /* ── Abbreviations ────────────────────────────────────────
   * Written short, always said long. Ordered longest-first so "Dra." is not
   * eaten by the rule for "Dr.".
   */
  var ABBREV = [
    [/\bSrta\./gi, 'señorita'], [/\bSra\./gi, 'señora'], [/\bSr\./gi, 'señor'],
    [/\bDra\./gi, 'doctora'],   [/\bDr\./gi, 'doctor'],
    [/\bUds\./gi, 'ustedes'],   [/\bUd\./gi, 'usted'],  [/\bVd\./gi, 'usted'],
    [/\bAvda\./gi, 'avenida'],  [/\bAv\./gi, 'avenida'],
    [/\bpza\./gi, 'plaza'],     [/\bC\//g, 'calle '],
    [/\betc\./gi, 'etcétera'],  [/\bp\.\s?ej\./gi, 'por ejemplo'],
    [/\bnúm\./gi, 'número'],    [/\bn[ºo°]\.?/g, 'número '],
    [/\bIzq\./gi, 'izquierda'], [/\bDcha\./gi, 'derecha'],
    [/\bdcho\./gi, 'derecho'],  [/\bapdo\./gi, 'apartado'],
    [/\bEE\.?\s?UU\.?/g, 'Estados Unidos'],
    [/\bkm\b/g, 'kilómetros'],  [/\bkg\b/g, 'kilos'],
    [/\bcm\b/g, 'centímetros'], [/\bml\b/g, 'mililitros'],
    [/\bmin\b/g, 'minutos'],    [/\bh\b(?=\s|$)/g, 'horas']
  ];

  var ORDINALS = {
    1: ['primero', 'primera', 'primer'], 2: ['segundo', 'segunda', 'segundo'],
    3: ['tercero', 'tercera', 'tercer'], 4: ['cuarto', 'cuarta', 'cuarto'],
    5: ['quinto', 'quinta', 'quinto'],   6: ['sexto', 'sexta', 'sexto'],
    7: ['séptimo', 'séptima', 'séptimo'], 8: ['octavo', 'octava', 'octavo'],
    9: ['noveno', 'novena', 'noveno'],   10: ['décimo', 'décima', 'décimo']
  };

  /* ── The whole pass ───────────────────────────────────────*/
  function forSpeech(text) {
    var s = String(text == null ? '' : text);
    if (!s.trim()) return '';

    // Emoji and symbols a synthesiser either names aloud or chokes on.
    s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, ' ');
    // Markdown emphasis, which would otherwise be read as asterisks.
    s = s.replace(/[*_`~]{1,3}/g, '');

    ABBREV.forEach(function (rule) { s = s.replace(rule[0], rule[1]); });

    // Times: 21:00, 9:45. Before plain numbers, or the parts get read alone.
    //
    // The article is consumed along with the digits. Spanish writes "a las
    // 21:00" and the spoken form already begins "las nueve...", so replacing
    // only the digits produced "a las las nueve" - the kind of stumble that
    // makes a voice sound broken rather than merely synthetic.
    s = s.replace(/((?:\ba\s+)?(?:las|la)\s+)?\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g,
      function (m, lead, h, mm) {
        var spoken = timeToWords(parseInt(h, 10), parseInt(mm, 10));
        return (lead && /^\s*a\s/i.test(lead) ? 'a ' : '') + spoken;
      });

    // Money, written either way round and with either decimal mark.
    s = s.replace(/(?:(?:€|\bEUR\b)\s?)(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[.,](\d{1,2}))?|(\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[.,](\d{1,2}))?\s?(?:€|\bEUR\b|\beuros?\b)/gi,
      function (m, a1, a2, b1, b2) {
        var whole = (a1 !== undefined ? a1 : b1);
        var cents = (a1 !== undefined ? a2 : b2);
        if (whole === undefined) return m;
        var n = parseInt(String(whole).replace(/[.\s]/g, ''), 10);
        var out = numberToWords(n, 'apoc') + (n === 1 ? ' euro' : ' euros');
        if (cents) {
          var c = parseInt(cents.length === 1 ? cents + '0' : cents, 10);
          if (c) out += ' con ' + numberToWords(c, 'm');
        }
        return out;
      });

    s = s.replace(/(\d+(?:[.,]\d+)?)\s?%/g, function (m, n) {
      return decimalToWords(n) + ' por ciento';
    });

    // Ordinals: 1º, 2ª, 3er.
    s = s.replace(/\b(\d{1,2})\s?(º|ª|er|o\.|a\.)/g, function (m, n, suf) {
      var i = parseInt(n, 10);
      var forms = ORDINALS[i];
      if (!forms) return numberToWords(i, 'm');
      if (suf === 'ª' || suf === 'a.') return forms[1];
      if (suf === 'er') return forms[2];
      return forms[0];
    });

    // A long run of digits is a phone number or a code, and it is read out
    // digit by digit.
    //
    // Grouping in pairs is how Spaniards actually say a mobile number, but it
    // is ambiguous when read back: "00" becomes a single "cero" and a digit
    // silently disappears. For someone learning to write down a number they
    // are hearing for the first time, unambiguous beats idiomatic.
    s = s.replace(/\b(\d{7,})\b/g, function (m, digits) {
      return digits.split('').map(function (d) { return ONES[+d]; }).join(' ');
    });

    // Decimals, then everything left over.
    s = s.replace(/\b\d+[.,]\d+\b/g, function (m) { return decimalToWords(m); });
    s = s.replace(/\b\d+\b/g, function (m) { return numberToWords(parseInt(m, 10), 'm'); });

    // Tidy up what the substitutions left behind.
    s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    return s;
  }

  function decimalToWords(str) {
    var parts = String(str).split(/[.,]/);
    var whole = numberToWords(parseInt(parts[0], 10), 'm');
    if (!parts[1]) return whole;
    // "coma" is how a decimal point is read in Spanish.
    return whole + ' coma ' + parts[1].split('').map(function (d) {
      return ONES[+d];
    }).join(' ');
  }

  /* ── Sentences ────────────────────────────────────────────
   * Splitting on real sentence ends lets the server put a genuine pause
   * between them instead of running everything into one breathless take.
   * Spanish opens questions with ¿, so a split must not orphan it.
   */
  function sentences(text) {
    var s = String(text || '').trim();
    if (!s) return [];
    var out = s.match(/[^.!?…]+[.!?…]+["'»)\]]*|[^.!?…]+$/g) || [s];
    return out.map(function (x) { return x.trim(); }).filter(Boolean);
  }

  PARLA.saytext = {
    forSpeech: forSpeech,
    numberToWords: numberToWords,
    timeToWords: timeToWords,
    sentences: sentences
  };
})();
