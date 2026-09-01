/* Parla — Spanish verb conjugation engine
 *
 * Rather than storing 43,000 hand-typed forms, this generates them: regular
 * endings for every tense, plus explicit override tables for irregular verbs
 * and stem-changers. That means adding a verb is usually one line in VERBS,
 * and the drill engine immediately has every tense for it.
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

(function () {
  'use strict';

  var PRONOUNS = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

  var TENSES = {
    presente:     { label: 'Present',           en: 'I speak / I am speaking' },
    preterito:    { label: 'Preterite',         en: 'I spoke' },
    imperfecto:   { label: 'Imperfect',         en: 'I used to speak' },
    futuro:       { label: 'Future',            en: 'I will speak' },
    condicional:  { label: 'Conditional',       en: 'I would speak' },
    subjuntivo:   { label: 'Present subjunctive', en: '(that) I speak' }
  };

  /* Regular endings, indexed by person 0-5 */
  var ENDINGS = {
    ar: {
      presente:    ['o', 'as', 'a', 'amos', 'áis', 'an'],
      preterito:   ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'],
      imperfecto:  ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'],
      subjuntivo:  ['e', 'es', 'e', 'emos', 'éis', 'en']
    },
    er: {
      presente:    ['o', 'es', 'e', 'emos', 'éis', 'en'],
      preterito:   ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
      imperfecto:  ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
      subjuntivo:  ['a', 'as', 'a', 'amos', 'áis', 'an']
    },
    ir: {
      presente:    ['o', 'es', 'e', 'imos', 'ís', 'en'],
      preterito:   ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'],
      imperfecto:  ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'],
      subjuntivo:  ['a', 'as', 'a', 'amos', 'áis', 'an']
    }
  };

  /* Future and conditional attach to the whole infinitive (or an irregular stem) */
  var FUT_ENDINGS  = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
  var COND_ENDINGS = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];

  /* Irregular future/conditional stems */
  var FUT_STEMS = {
    tener: 'tendr', poner: 'pondr', venir: 'vendr', salir: 'saldr', poder: 'podr',
    saber: 'sabr', hacer: 'har', decir: 'dir', querer: 'querr', haber: 'habr',
    caber: 'cabr', valer: 'valdr'
  };

  /* Fully or partly irregular forms. Any tense listed here overrides the
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
    conocer: {
      presente:   ['conozco', 'conoces', 'conoce', 'conocemos', 'conocéis', 'conocen'],
      subjuntivo: ['conozca', 'conozcas', 'conozca', 'conozcamos', 'conozcáis', 'conozcan']
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
    pensar: {
      presente:   ['pienso', 'piensas', 'piensa', 'pensamos', 'pensáis', 'piensan'],
      subjuntivo: ['piense', 'pienses', 'piense', 'pensemos', 'penséis', 'piensen']
    },
    entender: {
      presente:   ['entiendo', 'entiendes', 'entiende', 'entendemos', 'entendéis', 'entienden'],
      subjuntivo: ['entienda', 'entiendas', 'entienda', 'entendamos', 'entendáis', 'entiendan']
    },
    empezar: {
      presente:   ['empiezo', 'empiezas', 'empieza', 'empezamos', 'empezáis', 'empiezan'],
      preterito:  ['empecé', 'empezaste', 'empezó', 'empezamos', 'empezasteis', 'empezaron'],
      subjuntivo: ['empiece', 'empieces', 'empiece', 'empecemos', 'empecéis', 'empiecen']
    },
    dormir: {
      presente:   ['duermo', 'duermes', 'duerme', 'dormimos', 'dormís', 'duermen'],
      preterito:  ['dormí', 'dormiste', 'durmió', 'dormimos', 'dormisteis', 'durmieron'],
      subjuntivo: ['duerma', 'duermas', 'duerma', 'durmamos', 'durmáis', 'duerman']
    },
    pedir: {
      presente:   ['pido', 'pides', 'pide', 'pedimos', 'pedís', 'piden'],
      preterito:  ['pedí', 'pediste', 'pidió', 'pedimos', 'pedisteis', 'pidieron'],
      subjuntivo: ['pida', 'pidas', 'pida', 'pidamos', 'pidáis', 'pidan']
    },
    seguir: {
      presente:   ['sigo', 'sigues', 'sigue', 'seguimos', 'seguís', 'siguen'],
      preterito:  ['seguí', 'seguiste', 'siguió', 'seguimos', 'seguisteis', 'siguieron'],
      subjuntivo: ['siga', 'sigas', 'siga', 'sigamos', 'sigáis', 'sigan']
    },
    encontrar: {
      presente:   ['encuentro', 'encuentras', 'encuentra', 'encontramos', 'encontráis', 'encuentran'],
      subjuntivo: ['encuentre', 'encuentres', 'encuentre', 'encontremos', 'encontréis', 'encuentren']
    },
    recordar: {
      presente:   ['recuerdo', 'recuerdas', 'recuerda', 'recordamos', 'recordáis', 'recuerdan'],
      subjuntivo: ['recuerde', 'recuerdes', 'recuerde', 'recordemos', 'recordéis', 'recuerden']
    },
    jugar: {
      presente:   ['juego', 'juegas', 'juega', 'jugamos', 'jugáis', 'juegan'],
      preterito:  ['jugué', 'jugaste', 'jugó', 'jugamos', 'jugasteis', 'jugaron'],
      subjuntivo: ['juegue', 'juegues', 'juegue', 'juguemos', 'juguéis', 'jueguen']
    },
    buscar: {
      preterito:  ['busqué', 'buscaste', 'buscó', 'buscamos', 'buscasteis', 'buscaron'],
      subjuntivo: ['busque', 'busques', 'busque', 'busquemos', 'busquéis', 'busquen']
    },
    llegar: {
      preterito:  ['llegué', 'llegaste', 'llegó', 'llegamos', 'llegasteis', 'llegaron'],
      subjuntivo: ['llegue', 'llegues', 'llegue', 'lleguemos', 'lleguéis', 'lleguen']
    },
    leer: {
      preterito:  ['leí', 'leíste', 'leyó', 'leímos', 'leísteis', 'leyeron']
    },
    haber: {
      presente:   ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
      preterito:  ['hube', 'hubiste', 'hubo', 'hubimos', 'hubisteis', 'hubieron'],
      subjuntivo: ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan']
    }
  };

  /* The verbs offered in the conjugation trainer: [infinitive, english, level] */
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
  ];

  function stemOf(inf) { return inf.slice(0, -2); }
  function groupOf(inf) { return inf.slice(-2); }

  /* Conjugate one verb in one tense → array of 6 forms. */
  function conjugate(inf, tense) {
    var irr = IRREGULAR[inf];
    if (irr && irr[tense]) return irr[tense].slice();

    if (tense === 'futuro' || tense === 'condicional') {
      var base = FUT_STEMS[inf] || inf;
      var ends = tense === 'futuro' ? FUT_ENDINGS : COND_ENDINGS;
      return ends.map(function (e) { return base + e; });
    }

    var g = groupOf(inf);
    var table = ENDINGS[g];
    if (!table || !table[tense]) return null;

    // The present subjunctive of most irregulars is built off the yo-form.
    if (tense === 'subjuntivo' && irr && irr.presente) {
      var yo = irr.presente[0];
      if (yo.slice(-1) === 'o') {
        var sStem = yo.slice(0, -1);
        return table.subjuntivo.map(function (e) { return sStem + e; });
      }
    }

    var s = stemOf(inf);
    return table[tense].map(function (e) { return s + e; });
  }

  /* Full table for display: { tense: [6 forms] } */
  function fullTable(inf) {
    var out = {};
    Object.keys(TENSES).forEach(function (t) {
      var forms = conjugate(inf, t);
      if (forms) out[t] = forms;
    });
    return out;
  }

  PARLA.data.es.verbs = {
    list: VERBS,
    pronouns: PRONOUNS,
    tenses: TENSES,
    conjugate: conjugate,
    fullTable: fullTable,
    isIrregular: function (inf) { return !!IRREGULAR[inf]; }
  };
})();
