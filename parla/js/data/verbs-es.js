/* Parla — Spanish verb engine
 *
 * Not a table of forms: a model of how Spanish builds them. That distinction
 * is the difference between conjugating fifty verbs and conjugating any verb
 * someone types, which is what "it should know any word I throw at it" means.
 *
 * Four layers, applied in order, each one narrower than the last:
 *
 *   1. Regular endings for -ar / -er / -ir across eleven tenses.
 *   2. Stem changes (e->ie, o->ue, e->i, u->ue), which are lexical — you
 *      cannot tell from "pensar" that it is one and "pasar" is not — so the
 *      verbs that do it are listed. Roughly 300 of them, which covers nearly
 *      everything a learner meets.
 *   3. Spelling rules that are *not* lexical and so are applied to every verb
 *      by shape: buscar -> busqué, llegar -> llegué, empezar -> empecé,
 *      coger -> cojo, seguir -> sigo, construir -> construyo, conocer ->
 *      conozco, leer -> leyó.
 *   4. Genuinely irregular verbs, listed form by form — plus their compounds,
 *      derived automatically, so obtener, mantener, contener and detener come
 *      free from tener.
 *
 * Everything runs backwards too: see identify().
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

(function () {
  'use strict';

  var PRONOUNS = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

  var TENSES = {
    presente:      { label: 'Present',             en: 'I speak / I am speaking' },
    preterito:     { label: 'Preterite',           en: 'I spoke' },
    imperfecto:    { label: 'Imperfect',           en: 'I used to speak' },
    futuro:        { label: 'Future',              en: 'I will speak' },
    condicional:   { label: 'Conditional',         en: 'I would speak' },
    subjuntivo:    { label: 'Present subjunctive', en: '(that) I speak' },
    imperfectoSubj:{ label: 'Past subjunctive',    en: '(if) I spoke' },
    imperativo:    { label: 'Imperative',          en: 'Speak!' },
    perfecto:      { label: 'Present perfect',     en: 'I have spoken' },
    pluscuamperfecto: { label: 'Past perfect',     en: 'I had spoken' },
    futuroPerfecto:{ label: 'Future perfect',      en: 'I will have spoken' }
  };

  /* The six a beginner needs, in the order they are usually taught. The drill
   * screen offers these; the rest are there when someone asks for them. */
  var CORE_TENSES = ['presente', 'preterito', 'imperfecto', 'futuro', 'condicional', 'subjuntivo'];

  /* Regular endings, indexed by person 0-5 */
  var ENDINGS = {
    ar: {
      presente:    ['o', 'as', 'a', 'amos', 'áis', 'an'],
      preterito:   ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
      imperfecto:  ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
      subjuntivo:  ['e', 'es', 'e', 'emos', 'éis', 'en'],
      imperfectoSubj: ['ara', 'aras', 'ara', 'áramos', 'arais', 'aran']
    },
    er: {
      presente:    ['o', 'es', 'e', 'emos', 'éis', 'en'],
      preterito:   ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
      imperfecto:  ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
      subjuntivo:  ['a', 'as', 'a', 'amos', 'áis', 'an'],
      imperfectoSubj: ['iera', 'ieras', 'iera', 'iéramos', 'ierais', 'ieran']
    },
    ir: {
      presente:    ['o', 'es', 'e', 'imos', 'ís', 'en'],
      preterito:   ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
      imperfecto:  ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
      subjuntivo:  ['a', 'as', 'a', 'amos', 'áis', 'an'],
      imperfectoSubj: ['iera', 'ieras', 'iera', 'iéramos', 'ierais', 'ieran']
    }
  };

  /* Future and conditional attach to the whole infinitive (or an irregular stem) */
  var FUT_ENDINGS  = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
  var COND_ENDINGS = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];

  var FUT_STEMS = {
    tener: 'tendr', poner: 'pondr', venir: 'vendr', salir: 'saldr', poder: 'podr',
    saber: 'sabr', hacer: 'har', decir: 'dir', querer: 'querr', haber: 'habr',
    caber: 'cabr', valer: 'valdr'
  };

  var HABER = {
    presente:   ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
    imperfecto: ['había', 'habías', 'había', 'habíamos', 'habíais', 'habían'],
    futuro:     ['habré', 'habrás', 'habrá', 'habremos', 'habréis', 'habrán']
  };
  var VERBS = [
    ['ser', 'to be (permanent)', 'a1'],       ['estar', 'to be (state)', 'a1'],
    ['tener', 'to have', 'a1'],               ['hacer', 'to do / make', 'a1'],
    ['ir', 'to go', 'a1'],                    ['poder', 'to be able to', 'a1'],
    ['querer', 'to want', 'a1'],              ['decir', 'to say', 'a1'],
    ['ver', 'to see', 'a1'],                  ['saber', 'to know (facts)', 'a1'],
    ['conocer', 'to know (people)', 'a1'],    ['hablar', 'to speak', 'a1'],
    ['comer', 'to eat', 'a1'],                ['beber', 'to drink', 'a1'],
    ['vivir', 'to live', 'a1'],               ['venir', 'to come', 'a1'],
    ['dar', 'to give', 'a1'],                 ['poner', 'to put', 'a1'],
    ['salir', 'to leave', 'a1'],              ['llegar', 'to arrive', 'a1'],
    ['pensar', 'to think', 'a1'],             ['entender', 'to understand', 'a1'],
    ['necesitar', 'to need', 'a1'],           ['trabajar', 'to work', 'a1'],
    ['estudiar', 'to study', 'a1'],           ['aprender', 'to learn', 'a1'],
    ['escribir', 'to write', 'a1'],           ['leer', 'to read', 'a1'],
    ['empezar', 'to begin', 'a2'],            ['terminar', 'to finish', 'a2'],
    ['buscar', 'to look for', 'a1'],          ['encontrar', 'to find', 'a2'],
    ['esperar', 'to wait / hope', 'a2'],      ['ayudar', 'to help', 'a1'],
    ['pedir', 'to ask for', 'a2'],            ['preguntar', 'to ask', 'a2'],
    ['recordar', 'to remember', 'a2'],        ['olvidar', 'to forget', 'a2'],
    ['cambiar', 'to change', 'a2'],           ['seguir', 'to continue', 'a2'],
    ['dormir', 'to sleep', 'a1'],             ['jugar', 'to play', 'a1'],
    ['comprar', 'to buy', 'a1'],              ['vender', 'to sell', 'a2'],
    ['abrir', 'to open', 'a1'],               ['cerrar', 'to close', 'a1'],
    ['caminar', 'to walk', 'a1'],             ['correr', 'to run', 'a1'],
    ['cocinar', 'to cook', 'a1'],             ['viajar', 'to travel', 'a1']
  ];/* Fully or partly irregular forms. Any tense listed here overrides the
   * generated one; a null entry inside an array falls back to the regular form. */
  var IRREGULAR = {
    ser: {
      presente:   ['soy', 'eres', 'es', 'somos', 'sois', 'son'],
      preterito:  ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
      imperfecto: ['era', 'eras', 'era', 'éramos', 'erais', 'eran'],
      subjuntivo: ['sea', 'seas', 'sea', 'seamos', 'seáis', 'sean']
    },
    estar: {
      presente:   ['estoy', 'estás', 'está', 'estamos', 'estáis', 'están'],
      preterito:  ['estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron'],
      subjuntivo: ['esté', 'estés', 'esté', 'estemos', 'estéis', 'estén']
    },
    tener: {
      presente:   ['tengo', 'tienes', 'tiene', 'tenemos', 'tenéis', 'tienen'],
      preterito:  ['tuve', 'tuviste', 'tuvo', 'tuvimos', 'tuvisteis', 'tuvieron'],
      subjuntivo: ['tenga', 'tengas', 'tenga', 'tengamos', 'tengáis', 'tengan']
    },
    hacer: {
      presente:   ['hago', 'haces', 'hace', 'hacemos', 'hacéis', 'hacen'],
      preterito:  ['hice', 'hiciste', 'hizo', 'hicimos', 'hicisteis', 'hicieron'],
      subjuntivo: ['haga', 'hagas', 'haga', 'hagamos', 'hagáis', 'hagan']
    },
    ir: {
      presente:   ['voy', 'vas', 'va', 'vamos', 'vais', 'van'],
      preterito:  ['fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron'],
      imperfecto: ['iba', 'ibas', 'iba', 'íbamos', 'ibais', 'iban'],
      subjuntivo: ['vaya', 'vayas', 'vaya', 'vayamos', 'vayáis', 'vayan']
    },
    poder: {
      presente:   ['puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden'],
      preterito:  ['pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron'],
      subjuntivo: ['pueda', 'puedas', 'pueda', 'podamos', 'podáis', 'puedan']
    },
    querer: {
      presente:   ['quiero', 'quieres', 'quiere', 'queremos', 'queréis', 'quieren'],
      preterito:  ['quise', 'quisiste', 'quiso', 'quisimos', 'quisisteis', 'quisieron'],
      subjuntivo: ['quiera', 'quieras', 'quiera', 'queramos', 'queráis', 'quieran']
    },
    decir: {
      presente:   ['digo', 'dices', 'dice', 'decimos', 'decís', 'dicen'],
      preterito:  ['dije', 'dijiste', 'dijo', 'dijimos', 'dijisteis', 'dijeron'],
      subjuntivo: ['diga', 'digas', 'diga', 'digamos', 'digáis', 'digan']
    },
    ver: {
      presente:   ['veo', 'ves', 've', 'vemos', 'veis', 'ven'],
      preterito:  ['vi', 'viste', 'vio', 'vimos', 'visteis', 'vieron'],
      imperfecto: ['veía', 'veías', 'veía', 'veíamos', 'veíais', 'veían'],
      subjuntivo: ['vea', 'veas', 'vea', 'veamos', 'veáis', 'vean']
    },
    saber: {
      presente:   ['sé', 'sabes', 'sabe', 'sabemos', 'sabéis', 'saben'],
      preterito:  ['supe', 'supiste', 'supo', 'supimos', 'supisteis', 'supieron'],
      subjuntivo: ['sepa', 'sepas', 'sepa', 'sepamos', 'sepáis', 'sepan']
    },
    venir: {
      presente:   ['vengo', 'vienes', 'viene', 'venimos', 'venís', 'vienen'],
      preterito:  ['vine', 'viniste', 'vino', 'vinimos', 'vinisteis', 'vinieron'],
      subjuntivo: ['venga', 'vengas', 'venga', 'vengamos', 'vengáis', 'vengan']
    },
    dar: {
      presente:   ['doy', 'das', 'da', 'damos', 'dais', 'dan'],
      preterito:  ['di', 'diste', 'dio', 'dimos', 'disteis', 'dieron'],
      subjuntivo: ['dé', 'des', 'dé', 'demos', 'deis', 'den']
    },
    poner: {
      presente:   ['pongo', 'pones', 'pone', 'ponemos', 'ponéis', 'ponen'],
      preterito:  ['puse', 'pusiste', 'puso', 'pusimos', 'pusisteis', 'pusieron'],
      subjuntivo: ['ponga', 'pongas', 'ponga', 'pongamos', 'pongáis', 'pongan']
    },
    salir: {
      presente:   ['salgo', 'sales', 'sale', 'salimos', 'salís', 'salen'],
      subjuntivo: ['salga', 'salgas', 'salga', 'salgamos', 'salgáis', 'salgan']
    },
    oír: {
      presente:   ['oigo', 'oyes', 'oye', 'oímos', 'oís', 'oyen'],
      preterito:  ['oí', 'oíste', 'oyó', 'oímos', 'oísteis', 'oyeron'],
      subjuntivo: ['oiga', 'oigas', 'oiga', 'oigamos', 'oigáis', 'oigan']
    },
    reír: {
      presente:   ['río', 'ríes', 'ríe', 'reímos', 'reís', 'ríen'],
      preterito:  ['reí', 'reíste', 'rio', 'reímos', 'reísteis', 'rieron'],
      subjuntivo: ['ría', 'rías', 'ría', 'riamos', 'riáis', 'rían']
    },
    traer: {
      presente:   ['traigo', 'traes', 'trae', 'traemos', 'traéis', 'traen'],
      preterito:  ['traje', 'trajiste', 'trajo', 'trajimos', 'trajisteis', 'trajeron'],
      subjuntivo: ['traiga', 'traigas', 'traiga', 'traigamos', 'traigáis', 'traigan']
    },
    caer: {
      presente:   ['caigo', 'caes', 'cae', 'caemos', 'caéis', 'caen'],
      subjuntivo: ['caiga', 'caigas', 'caiga', 'caigamos', 'caigáis', 'caigan']
    },
    andar: {
      preterito:  ['anduve', 'anduviste', 'anduvo', 'anduvimos', 'anduvisteis', 'anduvieron']
    },
    caber: {
      presente:   ['quepo', 'cabes', 'cabe', 'cabemos', 'cabéis', 'caben'],
      preterito:  ['cupe', 'cupiste', 'cupo', 'cupimos', 'cupisteis', 'cupieron'],
      subjuntivo: ['quepa', 'quepas', 'quepa', 'quepamos', 'quepáis', 'quepan']
    },
    valer: {
      presente:   ['valgo', 'vales', 'vale', 'valemos', 'valéis', 'valen'],
      subjuntivo: ['valga', 'valgas', 'valga', 'valgamos', 'valgáis', 'valgan']
    },
    conducir: {
      presente:   ['conduzco', 'conduces', 'conduce', 'conducimos', 'conducís', 'conducen'],
      preterito:  ['conduje', 'condujiste', 'condujo', 'condujimos', 'condujisteis', 'condujeron'],
      subjuntivo: ['conduzca', 'conduzcas', 'conduzca', 'conduzcamos', 'conduzcáis', 'conduzcan']
    },
    haber: {
      presente:   ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
      preterito:  ['hube', 'hubiste', 'hubo', 'hubimos', 'hubisteis', 'hubieron'],
      subjuntivo: ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan']
    }
  };
  /* ── Stem changes ─────────────────────────────────────────
   * Lexical: nothing in the spelling of "pensar" says it becomes "pienso"
   * while "pasar" stays "paso". So they are listed. These are the ones a
   * learner meets; a verb not on the list is conjugated regularly, and the
   * screens that show a table say so rather than pretending to be sure. */
  var STEM_IE = ('pensar empezar comenzar cerrar despertar sentar calentar helar negar '
    + 'apretar atravesar confesar gobernar merendar nevar quebrar recomendar sembrar '
    + 'temblar tropezar acertar alentar arrendar encerrar enterrar fregar manifestar '
    + 'querer entender perder defender encender extender tender ascender descender '
    + 'atender verter querer sentir mentir preferir referir sugerir herir advertir '
    + 'convertir divertir hervir invertir arrepentir consentir presentir digerir '
    + 'discernir concernir').split(' ');

  var STEM_UE = ('poder contar encontrar recordar volar mostrar costar probar soñar '
    + 'almorzar acostar acordar aprobar colgar comprobar consolar demostrar descontar '
    + 'esforzar forzar rogar sonar tostar volcar apostar renovar reprobar '
    + 'volver mover morder devolver envolver revolver soler doler llover moler '
    + 'oler resolver torcer cocer promover remover conmover '
    + 'dormir morir').split(' ');

  var STEM_I = ('pedir seguir servir repetir vestir medir competir conseguir corregir '
    + 'despedir elegir freír gemir impedir perseguir reír rendir reñir seguir sonreír '
    + 'teñir derretir concebir').split(' ');

  var STEM_U = ['jugar'];

  /* -ir stem-changers also change in the third persons of the preterite, in
   * the gerund, and throughout the past subjunctive: pedir -> pidió, durmiendo. */
  function stemClass(inf) {
    if (indexOf(STEM_IE, inf) >= 0) return 'ie';
    if (indexOf(STEM_UE, inf) >= 0) return 'ue';
    if (indexOf(STEM_I, inf) >= 0) return 'i';
    if (indexOf(STEM_U, inf) >= 0) return 'ue';   // jugar: u -> ue, same shape
    return null;
  }

  function indexOf(arr, x) { for (var i = 0; i < arr.length; i++) if (arr[i] === x) return i; return -1; }

  /* Change the last vowel of the stem. "encontrar" -> "encuentr", not
   * "uencontr": it is the *stressed* syllable that breaks, which is the last
   * one before the ending. */
  function breakStem(stem, kind) {
    var pairs = kind === 'ie' ? [['e', 'ie']] :
                kind === 'ue' ? [['o', 'ue'], ['u', 'ue']] :
                kind === 'i'  ? [['e', 'i']] : [];
    for (var p = 0; p < pairs.length; p++) {
      var from = pairs[p][0], to = pairs[p][1];
      var at = stem.lastIndexOf(from);
      if (at >= 0) return stem.slice(0, at) + to + stem.slice(at + 1);
    }
    return stem;
  }

  /* The weakened stem used by -ir verbs in the preterite, gerund and past
   * subjunctive: e -> i, o -> u. */
  function weakenStem(stem) {
    var at = stem.lastIndexOf('e');
    var atO = stem.lastIndexOf('o');
    if (at > atO) return stem.slice(0, at) + 'i' + stem.slice(at + 1);
    if (atO >= 0) return stem.slice(0, atO) + 'u' + stem.slice(atO + 1);
    return stem;
  }

  /* ── Spelling rules ───────────────────────────────────────
   * Unlike stem changes these follow from the shape of the verb, so they are
   * applied to every verb rather than listed. They keep the *sound* of the
   * stem when the ending changes the vowel that follows it. */
  function respell(stem, ending, group) {
    var front = /^[eéií]/.test(ending);        // ending starts with e or i
    var back  = /^[aáoó]/.test(ending);        // ending starts with a or o

    if (front) {
      if (/c$/.test(stem) && group === 'ar') return stem.slice(0, -1) + 'qu';   // buscar -> busqué
      if (/g$/.test(stem) && group === 'ar') return stem + 'u';                  // llegar -> llegué
      if (/z$/.test(stem) && group === 'ar') return stem.slice(0, -1) + 'c';     // empezar -> empecé
      if (/gu$/.test(stem) && group === 'ar') return stem.slice(0, -1) + 'ü';    // averiguar -> averigüé
    }
    if (back && group !== 'ar') {
      if (/g$/.test(stem)) return stem.slice(0, -1) + 'j';                       // coger -> cojo
      if (/gu$/.test(stem)) return stem.slice(0, -2) + 'g';                      // seguir -> sigo
      if (/qu$/.test(stem)) return stem.slice(0, -2) + 'c';                      // delinquir -> delinco
      if (/[aeiou]c$/.test(stem)) return stem.slice(0, -1) + 'zc';               // conocer -> conozco
    }
    return stem;
  }

  /* Endings beginning with an unstressed i turn into y between vowels, and
   * disappear after ñ or ll: leyó, construyeron, gruñó, bulló. */
  function reshapeEnding(stem, ending, inf) {
    // leer -> leíste, caer -> caído: an unstressed i after a, e or o is a
    // separate syllable and takes the accent that says so. Not after u or i,
    // where it is a diphthong: construir -> construiste, with no accent.
    if (/[aeo]$/.test(stem) && /^i[^aeoáéíóú]/.test(ending)) {
      return 'í' + ending.slice(1);
    }

    if (/^i[aeoáéó]/.test(ending) || ending === 'ió' || /^ie/.test(ending) || /^ió/.test(ending)) {
      if (/[aeouáéíóú]$/.test(stem) && !/qu$|gu$/.test(stem) && !/^ar$/.test(inf.slice(-2))) {
        // leer -> leyó, oír -> oyó, construir -> construyó
        if (/(uir|eer|oír|oer|aer)$/.test(inf) || /[aeo]$/.test(stem)) return 'y' + ending.slice(1);
      }
      if (/(ñ|ll)$/.test(stem)) return ending.slice(1);
    }
    return ending;
  }

  /* Verbs in -uir take a y in the present too: construyo, construyes. */
  function uirStem(inf, stem, ending) {
    if (/[^g]uir$/.test(inf) && /^[aeoáéó]/.test(ending)) return stem + 'y';
    return stem;
  }

  /* ── Irregular compounds ──────────────────────────────────
   * obtener conjugates exactly like tener with a prefix on the front, and
   * there are dozens of these. Deriving them means one entry buys twenty. */
  var COMPOUND_BASES = ['tener', 'poner', 'venir', 'decir', 'hacer', 'traer', 'salir',
    'ver', 'poder', 'querer', 'saber', 'dar', 'ir', 'ser', 'estar', 'haber', 'caer', 'oír', 'reír'];

  function compoundOf(inf) {
    for (var i = 0; i < COMPOUND_BASES.length; i++) {
      var base = COMPOUND_BASES[i];
      if (inf.length > base.length && inf.slice(-base.length) === base) {
        var prefix = inf.slice(0, inf.length - base.length);
        // "atender" is not a compound of "tender"; require a plausible prefix.
        if (/^(ab|ad|ante|anti|auto|bene|com|con|contra|de|des|dis|en|entre|ex|extra|im|in|inter|intro|mal|man|ob|obs|per|pos|pre|pro|re|retro|satis|so|sobre|son|sos|su|sub|super|tras|trans)$/.test(prefix)) {
          return { base: base, prefix: prefix };
        }
      }
    }
    return null;
  }

  /* A one-syllable form carries no written accent because there is nothing to
   * distinguish it from. Put a prefix in front and there is: "ve" becomes
   * "prevé", "vi" becomes "preví". These are the forms that need it. */
  var NEEDS_ACCENT = {
    ve: 'vé', ves: 'vés', ven: 'vén', vi: 'ví', vio: 'vio',
    da: 'dá', das: 'dás', dan: 'dán', di: 'dí', dio: 'dio',
    ri: 'rí', rio: 'rio',
    ten: 'tén', pon: 'pón', sal: 'sal', haz: 'haz'
  };

  function accentFix(prefix, base, form) {
    if (!prefix) return form;
    var fixed = NEEDS_ACCENT[base];
    return fixed ? prefix + fixed : prefix + base;
  }

  /* ── Participles and gerunds ──────────────────────────────*/
  var IRREG_PART = {
    hacer: 'hecho', decir: 'dicho', ver: 'visto', poner: 'puesto', volver: 'vuelto',
    escribir: 'escrito', abrir: 'abierto', romper: 'roto', morir: 'muerto',
    cubrir: 'cubierto', resolver: 'resuelto', freír: 'frito', imprimir: 'impreso',
    ir: 'ido', ser: 'sido', satisfacer: 'satisfecho'
  };

  function participle(inf) {
    if (!inf) return '';
    var c = compoundOf(inf);
    if (IRREG_PART[inf]) return IRREG_PART[inf];
    if (c && IRREG_PART[c.base]) return c.prefix + IRREG_PART[c.base];
    var g = groupOf(inf), s = stemOf(inf);
    if (g === 'ar') return s + 'ado';
    // caer -> caído, leer -> leído: the i takes an accent after a vowel.
    if (/[aeoáéó]$/.test(s)) return s + 'ído';
    return s + 'ido';
  }

  function gerund(inf) {
    if (!inf) return '';
    if (inf === 'ir') return 'yendo';
    if (inf === 'poder') return 'pudiendo';
    if (inf === 'venir') return 'viniendo';
    if (inf === 'decir') return 'diciendo';
    var g = groupOf(inf), s = stemOf(inf);
    if (g === 'ar') return s + 'ando';
    if (g === 'ir' && stemClass(inf)) s = weakenStem(s);
    if (/[aeouáéó]$/.test(s)) return s + 'yendo';
    if (/(ñ|ll)$/.test(s)) return s + 'endo';
    return s + 'iendo';
  }

  /* ── The generator ────────────────────────────────────────*/
  function stemOf(inf) { return inf.slice(0, -2); }
  /* -ír carries an accent that the endings replace: oír and reír belong to the
   * -ir group, not to a group of their own. */
  function groupOf(inf) { return inf.slice(-2).replace('í', 'i'); }

  function join(inf, stem, ending, group) {
    var e = reshapeEnding(stem, ending, inf);
    var s = uirStem(inf, stem, e);
    s = respell(s, e, group);
    return s + e;
  }

  function regular(inf, tense) {
    var g = groupOf(inf);
    var table = ENDINGS[g];
    if (!table || !table[tense]) return null;
    var base = stemOf(inf);
    var cls = stemClass(inf);
    var out = [];

    for (var i = 0; i < 6; i++) {
      var stem = base;
      var ending = table[tense][i];

      if (cls) {
        // The stem breaks where the stress falls on it: everywhere except
        // nosotros and vosotros in the present and the subjunctive.
        var stressed = (i !== 3 && i !== 4);
        if (tense === 'presente' && stressed) stem = breakStem(base, cls);
        else if (tense === 'subjuntivo') {
          if (stressed) stem = breakStem(base, cls);
          else if (g === 'ir') stem = weakenStem(base);   // pidamos, durmamos
        } else if (g === 'ir' && (tense === 'preterito' ? (i === 2 || i === 5) : tense === 'imperfectoSubj')) {
          stem = weakenStem(base);
        }
      }
      out.push(join(inf, stem, ending, g));
    }
    return out;
  }

  /* Conjugate one verb in one tense -> array of 6 forms. */
  function conjugate(inf, tense) {
    // "ir" is two letters long and is the verb a beginner meets first.
    if (!inf || inf.length < 2) return null;
    inf = String(inf).toLowerCase().trim();

    // Reflexives conjugate as the bare verb; the pronoun moves to the front.
    var reflexive = /se$/.test(inf) && inf.length > 4 && ENDINGS[inf.slice(-4, -2)];
    if (reflexive) {
      var inner = conjugate(inf.slice(0, -2), tense);
      if (!inner) return null;
      var pron = ['me', 'te', 'se', 'nos', 'os', 'se'];
      return inner.map(function (f, i) {
        return tense === 'imperativo' ? (f === '—' ? f : f) : pron[i] + ' ' + f;
      });
    }

    var irr = IRREGULAR[inf];
    if (irr && irr[tense]) return irr[tense].slice();

    var c = compoundOf(inf);
    if (c && IRREGULAR[c.base] && IRREGULAR[c.base][tense]) {
      return IRREGULAR[c.base][tense].map(function (f) { return accentFix(c.prefix, f, c.prefix + f); });
    }

    if (tense === 'futuro' || tense === 'condicional') {
      var fs = FUT_STEMS[inf] || (c && FUT_STEMS[c.base] ? c.prefix + FUT_STEMS[c.base] : inf);
      var ends = tense === 'futuro' ? FUT_ENDINGS : COND_ENDINGS;
      return ends.map(function (e) { return fs + e; });
    }

    if (tense === 'perfecto' || tense === 'pluscuamperfecto' || tense === 'futuroPerfecto') {
      var aux = tense === 'perfecto' ? HABER.presente
              : tense === 'pluscuamperfecto' ? HABER.imperfecto : HABER.futuro;
      var pp = participle(inf);
      return aux.map(function (h) { return h + ' ' + pp; });
    }

    if (tense === 'imperativo') return imperative(inf);

    // Every verb in -ducir takes the same strong preterite: produje, conduje,
    // traduje, reduje, introduje. It is a family, not a list.
    if (/ducir$/.test(inf) && (tense === 'preterito')) {
      var d = inf.slice(0, -5) + 'duj';
      return [d + 'e', d + 'iste', d + 'o', d + 'imos', d + 'isteis', d + 'eron'];
    }

    // The present subjunctive of an irregular is built off its yo-form, which
    // is where "tengo" becomes "tenga" without anyone listing it.
    if (tense === 'subjuntivo') {
      var src = (irr && irr.presente) || (c && IRREGULAR[c.base] && IRREGULAR[c.base].presente
        && IRREGULAR[c.base].presente.map(function (f) { return c.prefix + f; }));
      if (src && /o$/.test(src[0])) {
        var sStem = src[0].slice(0, -1);
        var tbl = ENDINGS[groupOf(inf)];
        if (tbl) return tbl.subjuntivo.map(function (e) { return sStem + e; });
      }
    }

    if (tense === 'imperfectoSubj') {
      // Built off the third person plural preterite, always, with no exceptions
      // — the one place Spanish is completely regular about being irregular.
      var pret = conjugate(inf, 'preterito');
      if (pret) {
        var st = pret[5].replace(/ron$/, '');
        return [st + 'ra', st + 'ras', st + 'ra',
                st.replace(/([aeiou])$/, function (m) {
                  return { a: 'á', e: 'é', i: 'i', o: 'ó', u: 'u' }[m] || m;
                }) + 'ramos',
                st + 'rais', st + 'ran'];
      }
    }

    return regular(inf, tense);
  }

  /* The imperative: tú and vosotros affirmative are their own forms, everything
   * else borrows the subjunctive. Six slots so the table lines up with the
   * pronouns, with yo left blank because you cannot order yourself about. */
  /* The nosotros imperative of ir is "vamos", not the subjunctive "vayamos" —
   * the one place Spanish declines to be systematic about it. */
  var IRREG_IMP = { ir: ['—', 've', 'vaya', 'vamos', 'id', 'vayan'] };

  var IRREG_TU = {
    tener: 'ten', poner: 'pon', venir: 'ven', salir: 'sal', hacer: 'haz',
    decir: 'di', ir: 've', ser: 'sé'
  };

  function imperative(inf) {
    if (IRREG_IMP[inf]) return IRREG_IMP[inf].slice();
    var subj = conjugate(inf, 'subjuntivo');
    if (!subj) return null;
    var pres = conjugate(inf, 'presente');
    var c = compoundOf(inf);
    var tu = IRREG_TU[inf] || (c && IRREG_TU[c.base] ? accentFix(c.prefix, IRREG_TU[c.base], c.prefix + IRREG_TU[c.base]) : null)
             || (pres ? pres[2] : null);
    var vos = stemOf(inf) + (groupOf(inf) === 'ar' ? 'ad' : groupOf(inf) === 'er' ? 'ed' : 'id');
    return ['—', tu, subj[2], subj[3], vos, subj[5]];
  }

  /* Full table for display: { tense: [6 forms] } */
  function fullTable(inf, tenses) {
    var out = {};
    (tenses || Object.keys(TENSES)).forEach(function (t) {
      var forms = conjugate(inf, t);
      if (forms) out[t] = forms;
    });
    return out;
  }

  /* ── Backwards ────────────────────────────────────────────
   * The engine generates every form, so it can also recognise one. Tapping
   * "tuvo" should say "third person preterite of tener" without anyone having
   * written a reverse table.
   *
   * The index over the drill verbs is built on demand and is small. Everything
   * else is handled by morph.js, which inverts the endings against the whole
   * dictionary rather than pre-computing 200,000 forms on a phone. */
  var reverse = null;

  function buildReverse() {
    reverse = {};
    var tenseKeys = Object.keys(TENSES);
    VERBS.forEach(function (v) {
      var inf = v[0];
      reverse[strip(inf)] = reverse[strip(inf)] || { verb: inf, tense: 'infinitivo', person: '' };
      tenseKeys.forEach(function (t) {
        var forms = conjugate(inf, t);
        if (!forms) return;
        forms.forEach(function (f, i) {
          if (!f || f === '—') return;
          var key = strip(f);
          // First writing wins, so the commonest tense keeps an ambiguous form
          // rather than the last one generated claiming it.
          if (!reverse[key]) {
            reverse[key] = { verb: inf, tense: TENSES[t].label, person: PRONOUNS[i] };
          }
        });
      });
      [participle(inf), gerund(inf)].forEach(function (f, k) {
        var key = strip(f);
        if (f && !reverse[key]) {
          reverse[key] = { verb: inf, tense: k ? 'Gerund' : 'Past participle', person: '' };
        }
      });
    });
  }

  function strip(w) {
    return String(w || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zñ]/g, '');
  }

  /* Which verb, tense and person is this word? null if it is not one. */
  function identify(word) {
    if (!reverse) buildReverse();
    var hit = reverse[strip(word)];
    if (hit) return { verb: hit.verb, tense: hit.tense, person: hit.person };
    // Not one of the fifty: ask the general engine, if it has been loaded.
    if (PARLA.morph && PARLA.morph.ready()) {
      var a = PARLA.morph.analyse(word);
      for (var i = 0; i < a.length; i++) {
        if (a[i].pos === 'v' && a[i].tense) {
          return { verb: a[i].lemma, tense: a[i].tense, person: a[i].person || '' };
        }
      }
    }
    return null;
  }

  function isIrregular(inf) {
    return !!IRREGULAR[inf] || !!stemClass(inf) ||
           !!(compoundOf(inf) && IRREGULAR[compoundOf(inf).base]);
  }

  /* Why is this verb irregular? A sentence, or null if it is not. */
  function irregularNote(inf) {
    if (IRREGULAR[inf]) return 'Irregular — its forms are listed, not generated.';
    var c = compoundOf(inf);
    if (c && IRREGULAR[c.base]) return 'Follows ' + c.base + ', with ' + c.prefix + '- on the front.';
    var cls = stemClass(inf);
    if (cls === 'ie') return 'Stem-changing e→ie: the e breaks when the stress lands on it.';
    if (cls === 'ue') return 'Stem-changing o→ue: the o breaks when the stress lands on it.';
    if (cls === 'i')  return 'Stem-changing e→i, in the present, preterite and gerund.';
    if (/car$/.test(inf)) return 'Spelling change c→qu before e, to keep the hard c.';
    if (/gar$/.test(inf)) return 'Spelling change g→gu before e, to keep the hard g.';
    if (/zar$/.test(inf)) return 'Spelling change z→c before e — Spanish does not write ze.';
    if (/[aeiou]cer$|[aeiou]cir$/.test(inf)) return 'Adds a z before a and o: conozco, conozca.';
    if (/[^g]uir$/.test(inf)) return 'Adds a y before a, e and o: construyo, construyeron.';
    return null;
  }

  PARLA.data.es.verbs = {
    list: VERBS,
    pronouns: PRONOUNS,
    tenses: TENSES,
    coreTenses: CORE_TENSES,
    conjugate: conjugate,
    fullTable: fullTable,
    identify: identify,
    participle: participle,
    gerund: gerund,
    stemClass: stemClass,
    isIrregular: isIrregular,
    irregularNote: irregularNote,
    /* The verbs whose forms are listed rather than generated. The morphology
     * engine indexes these forwards so it can recognise "fui" and "tuvieron",
     * which no amount of stripping endings off will ever lead back to ir and
     * tener. */
    irregularList: function () { return Object.keys(IRREGULAR); },
    compoundBase: function (inf) { var c = compoundOf(inf); return c ? c.base : null; },
    irregularTu: function (inf) { return IRREG_TU[inf] || null; }
  };
})();
