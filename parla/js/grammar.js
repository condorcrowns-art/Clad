/* Parla — the grammar checker
 *
 * Correcting a learner's Spanish was, until now, a 7B model's opinion plus
 * twenty-nine regular expressions that matched exact strings. Both are the
 * wrong tool for the errors English speakers actually make, which are almost
 * all agreement errors — and agreement is a *decidable* question once you know
 * a word's gender, number and person. The dictionary knows the gender of
 * eighteen thousand nouns. The morphology engine knows the person of any verb
 * form. So this does not guess: it checks.
 *
 * What that buys, compared to asking a small model:
 *   - it is right, rather than usually right
 *   - it is instant, and works with no network and no model at all
 *   - it can say *why*, and point at the lesson, because it knows which rule
 *     it applied rather than having produced a fix from a hunch
 *
 * It also refuses to guess. Every rule needs positive evidence — a dictionary
 * entry with a known gender, an unambiguous morphological analysis — and where
 * the evidence is missing the rule stands down. A false correction teaches a
 * learner something wrong and costs more than ten misses.
 *
 * The model still has a job: word choice, register, whether the sentence
 * answers the question. Those are not decidable and this does not touch them.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  function dict() { return PARLA.dict; }
  function morph() { return PARLA.morph; }
  function ready() { return !!(dict() && dict().ready() && morph() && morph().ready()); }

  function fold(w) {
    return String(w || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
  }

  /* Split into tokens that remember where they came from, so a fix can be
   * spliced back into the original text without rebuilding punctuation.
   *
   * Each token also records whether punctuation stands between it and the one
   * before. Agreement is a relationship between neighbours, and a comma or a
   * full stop means they are not neighbours: in "Buenas tardes, bienvenido"
   * the adjective belongs to nobody, and a checker that pairs it with "tardes"
   * will confidently correct a perfectly good greeting. */
  function tokenise(text) {
    var out = [];
    var re = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g;
    var m, last = 0;
    while ((m = re.exec(text)) !== null) {
      var gap = text.slice(last, m.index);
      out.push({
        raw: m[0], low: m[0].toLowerCase(), fold: fold(m[0]),
        at: m.index, end: re.lastIndex,
        // A comma breaks a phrase; a full stop, question or exclamation mark
        // breaks a sentence.
        broken: /[,;:()"“”«»—–]/.test(gap),
        newSentence: out.length === 0 || /[.!?¿¡]|\n/.test(gap)
      });
      last = re.lastIndex;
    }
    return out;
  }

  /* Are these two words actually next to each other? */
  function adjacent(a, b) { return !!(a && b && !b.broken && !b.newSentence); }

  function splice(text, tok, replacement) {
    return text.slice(0, tok.at) + replacement + text.slice(tok.end);
  }

  function matchCase(sample, word) {
    if (sample && sample[0] === sample[0].toUpperCase() && sample[0] !== sample[0].toLowerCase()) {
      return word[0].toUpperCase() + word.slice(1);
    }
    return word;
  }

  /* ── What the words are ───────────────────────────────────*/

  var DETS = {
    el:   { g: 'm', n: 's', kind: 'def' },  la:  { g: 'f', n: 's', kind: 'def' },
    los:  { g: 'm', n: 'p', kind: 'def' },  las: { g: 'f', n: 'p', kind: 'def' },
    un:   { g: 'm', n: 's', kind: 'ind' },  una: { g: 'f', n: 's', kind: 'ind' },
    unos: { g: 'm', n: 'p', kind: 'ind' },  unas:{ g: 'f', n: 'p', kind: 'ind' },
    este: { g: 'm', n: 's', kind: 'dem' },  esta:{ g: 'f', n: 's', kind: 'dem' },
    estos:{ g: 'm', n: 'p', kind: 'dem' },  estas:{ g: 'f', n: 'p', kind: 'dem' },
    ese:  { g: 'm', n: 's', kind: 'dem' },  esa: { g: 'f', n: 's', kind: 'dem' },
    esos: { g: 'm', n: 'p', kind: 'dem' },  esas:{ g: 'f', n: 'p', kind: 'dem' },
    mucho:{ g: 'm', n: 's', kind: 'q' },    mucha:{ g: 'f', n: 's', kind: 'q' },
    muchos:{ g: 'm', n: 'p', kind: 'q' },   muchas:{ g: 'f', n: 'p', kind: 'q' },
    poco: { g: 'm', n: 's', kind: 'q' },    poca:{ g: 'f', n: 's', kind: 'q' },
    pocos:{ g: 'm', n: 'p', kind: 'q' },    pocas:{ g: 'f', n: 'p', kind: 'q' },
    otro: { g: 'm', n: 's', kind: 'q' },    otra:{ g: 'f', n: 's', kind: 'q' },
    otros:{ g: 'm', n: 'p', kind: 'q' },    otras:{ g: 'f', n: 'p', kind: 'q' },
    todo: { g: 'm', n: 's', kind: 'q' },    toda:{ g: 'f', n: 's', kind: 'q' },
    todos:{ g: 'm', n: 'p', kind: 'q' },    todas:{ g: 'f', n: 'p', kind: 'q' }
  };

  /* Every determiner above is spelled without an accent, so a word that
   * carries one is a different word that happens to fold onto the same
   * letters: "está" is the verb, not the demonstrative "esta", and reading it
   * as a determiner turned "Es pequeño y está mojado" into "y este mojado". */
  function detOf(tok) {
    return tok.low === tok.fold ? DETS[tok.fold] : null;
  }

  /* A pronoun leaning on a verb — "nadie la toque", "quién le ayuda". These
   * never introduce a noun, so the word after one is the verb, and "la" in
   * front of one is the object, not an article. */
  var PROCLITIC = {};
  ('me te se le les lo la los las nos os').split(' ').forEach(function (w) { PROCLITIC[w] = 1; });

  /* A bare pronoun is never followed by an article: "nadie la toque" is the
   * object pronoun, and no Spanish sentence puts "la casa" straight after
   * "nadie". */
  var BARE_PRONOUN = {};
  ('yo tu el ella nosotros nosotras vosotros vosotras ellos ellas usted ustedes ' +
   'nadie alguien quien uno'
  ).split(' ').forEach(function (w) { BARE_PRONOUN[w] = 1; });

  var DET_FORMS = {
    def: { ms: 'el', fs: 'la', mp: 'los', fp: 'las' },
    ind: { ms: 'un', fs: 'una', mp: 'unos', fp: 'unas' },
    dem: { ms: 'este', fs: 'esta', mp: 'estos', fp: 'estas' },
    q:   null   // quantifiers keep their own stem; handled by ending swap
  };

  /* The article in front of a feminine noun beginning with a stressed a- is
   * "el", and this is the single most common place a checker gets it wrong:
   * "el agua" is right and "la agua" is not, but agua is still feminine and
   * takes feminine adjectives. */
  var STRESSED_A = /^(a|ha)/;
  function takesElDespiteFeminine(nounFold) {
    return STRESSED_A.test(nounFold) && [
      'agua', 'aguila', 'alma', 'ala', 'aula', 'hacha', 'hambre', 'area',
      'arma', 'arpa', 'ancla', 'alba', 'aria', 'aya', 'habla', 'hada', 'haya'
    ].indexOf(nounFold) !== -1;
  }

  function entry(word) { return dict().get(word); }

  /* Words the dictionary will happily call a noun — "mi" the musical note,
   * "do" the note C, "sí" the note B — and which are never the noun in a
   * learner's sentence. Left in, they produce corrections like
   * "Mi primo" -> "Mi prima" and "a las dos" -> "a los dos". */
  var NOT_A_NOUN = {};
  ('mi mis tu tus su sus me te se le les lo la los las nos os un una unos unas ' +
   'el ella ellos ellas yo nosotros vosotros usted ustedes si sí no ni y o u e ' +
   'de del a al en con por para sin sobre entre hasta desde hacia segun tras ' +
   'que qué quien quién cual cuál como cómo cuando cuándo donde dónde ' +
   'do re fa sol si la mi ' +
   'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece ' +
   'catorce quince veinte treinta cuarenta cincuenta cien mil ' +
   'muy mas más menos ya aun aún bien mal ' +
   'buenas buenos bueno buena ' +
   // Auxiliaries. "He dejado" is a tense, not a noun and an adjective.
   'he has ha hemos habeis han habia habias habiamos habiais habian ' +
   'habre habras habra habremos habreis habran hay haya hayas ' +
   'soy eres es somos sois son era eras eramos erais eran fui fue ' +
   'estoy estas esta estamos estais estan ' +
   'voy vas va vamos vais van'
  ).split(' ').forEach(function (w) { NOT_A_NOUN[fold(w)] = 1; });

  /* A participle after one of these belongs to the verb, not to whatever noun
   * happens to sit before it — and after ser or estar it agrees with the
   * subject, which is not in this window. */
  var AUX = {};
  ('he has ha hemos habeis han habia habias habia habiamos habiais habian ' +
   'habre habras habra habremos habreis habran hubiera hubiese ' +
   'soy eres es somos sois son estoy estas esta estamos estais estan ' +
   'fue fueron era eran sera seran estaba estaban estuvo estuvieron ' +
   'sido estado'
  ).split(' ').forEach(function (w) { AUX[fold(w)] = 1; });

  /* Nouns whose singular and plural are spelt the same, so nothing about the
   * word says which one it is: "los martes" and "el martes" are both right. */
  var INVARIABLE = {};
  ('lunes martes miercoles jueves viernes crisis analisis virus paraguas ' +
   'cumpleanos abrelatas paraguas tesis dosis caries oasis atlas lavaplatos ' +
   'sacacorchos ciempies rascacielos'
  ).split(' ').forEach(function (w) { INVARIABLE[w] = 1; });

  /* Nouns that have no singular. The dictionary lists them as headwords, so
   * nothing else would work out that they are plural. */
  var ALWAYS_PLURAL = {};
  ('gracias vacaciones gafas tijeras deberes celos ganas afueras matematicas ' +
   'noticias modales alrededores viveres cosquillas'
  ).split(' ').forEach(function (w) { ALWAYS_PLURAL[w] = 1; });

  /* Noun with a gender we are confident about, or null. Plural first: "casas"
   * is not in the dictionary, "casa" is, and the number matters as much as the
   * gender for everything that has to agree with it. */
  function nounOf(tok) {
    if (NOT_A_NOUN[tok.fold]) return null;
    // "Ella enseña matemáticas": enseña is a verb here. But "casa" is also the
    // él-form of casar, and refusing every spelling that could be a verb would
    // give up on half the nouns in Spanish. The morphology engine ranks its
    // readings by how common the word is, so the question is which one wins —
    // not whether a verb reading exists at all.
    var vb = morph().analyse(tok.low);
    if (vb.length && vb[0].pos === 'v' && vb[0].personIndex != null && vb[0].personIndex >= 0) {
      return null;
    }
    if (INVARIABLE[tok.fold]) {
      var inv = entry(tok.low);
      if (inv && inv.pos === 'n' && inv.gender && inv.gender !== 'mf') {
        return { gender: inv.gender, number: null, entry: inv, lemma: inv.term, invariable: true };
      }
      return null;
    }
    var a = morph().analyse(tok.low);
    for (var i = 0; i < a.length; i++) {
      var r = a[i];
      if (r.pos === 'n' && r.number === 'plural' && r.entry &&
          r.entry.gender && r.entry.gender !== 'mf') {
        return { gender: r.entry.gender, number: 'p', entry: r.entry, lemma: r.lemma };
      }
    }
    var e = entry(tok.low);
    if (e && e.pos === 'n' && e.gender && e.gender !== 'mf') {
      return {
        gender: e.gender,
        number: ALWAYS_PLURAL[tok.fold] ? 'p' : 's',
        entry: e, lemma: e.term
      };
    }
    return null;
  }

  /* Words that look like a masculine adjective but are doing an adverb's job
   * after the noun: "¿quién le ayuda primero?" is "who helps first", not a
   * describing word that ought to have come out "primera". Spanish leaves an
   * adverbial ordinal in the masculine, so agreement has nothing to say. */
  var ADVERBIAL = {};
  ('primero segundo tercero ultimo tarde temprano'
  ).split(' ').forEach(function (w) { ADVERBIAL[w] = 1; });

  function adjOf(tok) {
    if (NOT_A_NOUN[tok.fold] || ADVERBIAL[tok.fold]) return null;
    // "el número otra vez": otra is a determiner looking forward, not an
    // adjective looking back.
    if (detOf(tok)) return null;
    var e = entry(tok.low);
    if (e && e.pos === 'adj') return { lemma: e.term, entry: e };
    var a = morph().analyse(tok.low);
    for (var i = 0; i < a.length; i++) {
      if (a[i].pos === 'adj' && a[i].entry) return { lemma: a[i].lemma, entry: a[i].entry };
    }
    // Wiktionary files most colours as nouns — "blanco" is the colour white
    // before it is the word white — so a colour after a noun would never be
    // checked for agreement. These are the ones a beginner uses.
    var sh = adjShape(tok.fold);
    if (sh && DESCRIPTIVE[fold(sh.stem + 'o')]) {
      return { lemma: sh.stem + 'o', entry: null, known: true };
    }
    if (sh && (STATE_ADJ[tok.fold] || ESSENCE_ADJ[tok.fold])) {
      return { lemma: sh.stem + 'o', entry: null, known: true };
    }
    return null;
  }

  /* The -o/-a/-os/-as family an adjective belongs to, or null if it does not
   * inflect for gender (grande, feliz, azul). */
  function adjShape(w) {
    if (/os$/.test(w)) return { g: 'm', n: 'p', stem: w.slice(0, -2) };
    if (/as$/.test(w)) return { g: 'f', n: 'p', stem: w.slice(0, -2) };
    if (/o$/.test(w))  return { g: 'm', n: 's', stem: w.slice(0, -1) };
    if (/a$/.test(w))  return { g: 'f', n: 's', stem: w.slice(0, -1) };
    return null;
  }

  function adjForm(stem, g, n) {
    return stem + (g === 'f' ? 'a' : 'o') + (n === 'p' ? 's' : '');
  }

  /* Folded keys, so "tú" and "tu" are the same string here. They are not the
   * same word — one is "you", the other is "your" — and "tu punto" is not a
   * subject and a verb. The rule below asks the dictionary before it acts. */
  var SUBJECTS = {
    yo: 0, tu: 1, usted: 2, el: 2, ella: 2,
    nosotros: 3, nosotras: 3, vosotros: 4, vosotras: 4,
    ustedes: 5, ellos: 5, ellas: 5
  };

  /* "hable con ella" — a pronoun after a preposition is an object, not the
   * subject of whatever verb comes next. */
  var PREPS = {};
  ('a con de en para por sin sobre entre hasta desde hacia tras contra según ' +
   'segun ante bajo durante mediante salvo excepto'
  ).split(' ').forEach(function (w) { PREPS[fold(w)] = 1; });
  function PREP_BEFORE(p) { return !!(p && PREPS[p.fold]); }
  var PERSON_NAME = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

  /* ── Findings ─────────────────────────────────────────────*/

  function finding(text, tok, replacement, note, topic, weight) {
    return {
      original: text,
      fixed: splice(text, tok, matchCase(tok.raw, replacement)),
      wrong: tok.raw,
      right: replacement,
      note: note,
      topic: topic || null,
      weight: weight == null ? 5 : weight
    };
  }

  /* ── The checks ───────────────────────────────────────────*/

  function check(text) {
    if (!ready() || !text) return [];
    var toks = tokenise(text);
    if (!toks.length) return [];
    var out = [];

    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], next = toks[i + 1], after = toks[i + 2];

      /* 1. Determiner and noun must agree in gender and number.
       *    "la problema" -> "el problema", "los casa" -> "la casa". */
      var prev = toks[i - 1];
      var det = detOf(t);
      // "un poco sosa": poco here means "a bit", not "few", and agrees with
      // nothing. Same for "un poco de".
      if (/^poc[oa]s?$/.test(t.fold) && prev && /^un$/.test(prev.fold)) det = null;
      // "muy mucho gracias": the muy/mucho rule owns this, not agreement.
      if (det && prev && prev.fold === 'muy') det = null;
      // "sin que nadie la toque": "la" is the object of the verb, not the
      // article of a noun that happens to share its spelling.
      if (det && prev && BARE_PRONOUN[prev.fold] && /^(el|la|los|las)$/.test(t.fold)) det = null;
      if (det && adjacent(t, next)) {
        var n = nounOf(next);
        if (n && !(det.g !== n.gender && takesElDespiteFeminine(next.fold) && det.fold === 'el')) {
          var wantG = n.gender, wantN = n.number;
          // "el agua": the article is masculine in form, the noun is feminine.
          // Only the articles el and un change. "esta agua", "mucha agua" and
          // "toda el agua" keep the feminine — getting this wrong turns the
          // perfectly correct "mucha hambre" into a correction.
          var elException = wantG === 'f' && wantN === 's' &&
            (det.kind === 'def' || det.kind === 'ind') && takesElDespiteFeminine(next.fold);
          var detG = elException ? 'm' : wantG;
          if (wantN && (det.g !== detG || det.n !== wantN)) {
            var form = DET_FORMS[det.kind]
              ? DET_FORMS[det.kind][detG + wantN]
              : (function () {
                  var sh = adjShape(t.fold);
                  return sh ? adjForm(sh.stem, detG, wantN) : null;
                })();
            if (form && form !== t.fold) {
              out.push(finding(text, t, form,
                elException
                  ? '“' + n.lemma + '” is feminine, but a feminine noun starting with a stressed ' +
                    'a- takes “el” — el agua, el hambre. The adjectives stay feminine.'
                  : '“' + n.lemma + '” is ' + (wantG === 'f' ? 'feminine' : 'masculine') +
                    (wantN === 'p' ? ' plural' : '') + ', so it takes “' + form + '”.',
                'gender', 9));
            }
          }
        }
      }

      /* 2. Noun then adjective must agree.
       *    "la casa blanco" -> "blanca", "los libros rojo" -> "rojos". */
      if (next) {
        var participle = /[ai]d[oa]s?$/.test(next.fold) &&
          (AUX[t.fold] || (prev && AUX[prev.fold]));
        // "Ella enseña ..." — a word straight after a subject pronoun is the
        // verb of that pronoun, whatever else the spelling could be.
        var afterSubject = prev && SUBJECTS[prev.fold] != null && !PREP_BEFORE(toks[i - 2]);
        // "¿Quién le ayuda primero?" — "ayuda" is the verb the pronoun leans
        // on, even though "la ayuda" is also a perfectly good noun.
        if (prev && PROCLITIC[prev.fold] && !DETS[prev.fold]) afterSubject = true;
        var noun = (adjacent(t, next) && !participle && !afterSubject) ? nounOf(t) : null;
        var adj = noun ? adjOf(next) : null;
        if (noun && adj) {
          var shape = adjShape(next.fold);
          if (shape && noun.number && (shape.g !== noun.gender || shape.n !== noun.number)) {
            var want = adjForm(shape.stem, noun.gender, noun.number);
            if (want !== next.fold) {
              out.push(finding(text, next, want,
                'Adjectives copy the noun. “' + noun.lemma + '” is ' +
                (noun.gender === 'f' ? 'feminine' : 'masculine') +
                (noun.number === 'p' ? ' plural' : ' singular') + ', so it is “' + want + '”.',
                'agreement', 8));
            }
          }
        }
      }

      /* 3. An adjective in front of its noun is English word order.
       *    "roja casa" -> "casa roja". Only for colours and the plainly
       *    descriptive, since Spanish does front some adjectives for effect. */
      if (adjacent(t, next) && FRONTED_IS_WRONG[t.fold]) {
        var n3 = nounOf(next);
        if (n3 && !detOf(t)) {
          out.push({
            original: text,
            fixed: text.slice(0, t.at) + next.raw + ' ' + t.raw + text.slice(next.end),
            wrong: t.raw + ' ' + next.raw,
            right: next.raw + ' ' + t.raw,
            note: 'Spanish puts the describing word after the noun: “' + next.low + ' ' + t.low + '”.',
            topic: 'wordorder', weight: 7
          });
        }
      }

      /* 4. A stated subject and its verb must be the same person.
       *    "yo tiene" -> "yo tengo". */
      if (adjacent(t, next) && SUBJECTS[t.fold] != null && !PREP_BEFORE(prev)) {
        var wantP = SUBJECTS[t.fold];
        var an = morph().analyse(next.low);
        var verbReadings = an.filter(function (r) {
          return r.pos === 'v' && r.personIndex != null && r.personIndex >= 0 && r.tenseKey;
        });
        // "tu ayuda", "tu punto": if the word is also a perfectly good noun,
        // then the pronoun in front of it is the possessive and there is no
        // verb here to disagree with.
        if (an.some(function (r) { return r.pos === 'n' || r.pos === 'adj'; })) verbReadings = [];
        // "el" is the article far more often than "él" is the subject, and the
        // accent is the only thing that tells them apart.
        if (t.fold === 'el' && t.low !== 'él') verbReadings = [];
        if (t.fold === 'tu' && t.low !== 'tú') verbReadings = [];
        // Only act if EVERY reading disagrees — "toma" is both él-present and
        // tú-imperative, and a word with two jobs is not a mistake.
        if (verbReadings.length && !verbReadings.some(function (r) { return r.personIndex === wantP; })) {
          var r0 = verbReadings[0];
          var forms = PARLA.data.es.verbs.conjugate(r0.lemma, r0.tenseKey);
          if (forms && forms[wantP] && forms[wantP] !== '—' && forms[wantP] !== next.low) {
            out.push(finding(text, next, forms[wantP],
              'With “' + t.low + '” the verb takes the ' + PERSON_NAME[wantP] + ' form: “' +
              forms[wantP] + '”.', 'person', 9));
          }
        }
      }

      /* 5. Ser where the meaning is a passing state, or estar where it is not.
       *    Generalised: any adjective the dictionary calls a state. */
      if (adjacent(t, next) && (t.fold === 'soy' || t.fold === 'eres' || t.fold === 'es' ||
                   t.fold === 'somos' || t.fold === 'son')) {
        if (STATE_ADJ[next.fold]) {
          var estar = { soy: 'estoy', eres: 'estás', es: 'está', somos: 'estamos', son: 'están' };
          out.push(finding(text, t, estar[t.fold],
            '“' + next.low + '” is how you are right now, not what you are — that is estar. ' +
            'Ser would mean it is part of your character.', 'serestar', 8));
        }
      }
      if (adjacent(t, next) && (t.fold === 'estoy' || t.fold === 'estas' || t.fold === 'esta' ||
                   t.fold === 'estamos' || t.fold === 'estan')) {
        if (ESSENCE_ADJ[next.fold]) {
          var ser = { estoy: 'soy', estas: 'eres', esta: 'es', estamos: 'somos', estan: 'son' };
          out.push(finding(text, t, ser[t.fold],
            '“' + next.low + '” is what someone is, not how they are today — that is ser.',
            'serestar', 8));
        }
      }

      /* 6. Feelings and age are things you *have* in Spanish.
       *    "soy hambre" / "estoy 25 años" -> tener. */
      if (adjacent(t, next) && /^(soy|eres|es|estoy|estas|esta)$/.test(t.fold) && TENER_NOUN[next.fold]) {
        var tener = { soy: 'tengo', estoy: 'tengo', eres: 'tienes', estas: 'tienes',
                      es: 'tiene', esta: 'tiene' };
        out.push(finding(text, t, tener[t.fold],
          next.fold === 'anos'
            ? 'Age is something you have in Spanish: tengo 25 años, not soy 25.'
            : 'Spanish *has* these rather than *is* them: tengo ' + next.low + '.',
          'tener', 9));
      }

      /* 7. muy and mucho are not interchangeable.
       *    "muy mucho", "mucho grande", "muy hambre". */
      if (adjacent(t, next) && t.fold === 'muy' && /^much/.test(next.fold)) {
        // "muy mucho gracias" wants "muchas gracias", not "muchísimo gracias":
        // with a noun after it, mucho is the quantifier and simply agrees.
        var qn = after ? nounOf(after) : null;
        var repl = qn
          ? adjForm('much', qn.gender, qn.number)
          : 'muchísimo';
        out.push({
          original: text,
          fixed: text.slice(0, t.at) + repl + text.slice(next.end),
          wrong: t.raw + ' ' + next.raw, right: repl,
          note: qn
            ? 'Muy and mucho never stack. With a noun it is just mucho, agreeing: ' +
              repl + ' ' + after.low + '.'
            : 'Muy and mucho never stack. For "very much", one word: muchísimo.',
          topic: 'muymucho', weight: 10
        });
      }
      if (adjacent(t, next) && /^mucho$/.test(t.fold)) {
        var ad = adjOf(next);
        if (ad && !nounOf(next)) {
          out.push(finding(text, t, 'muy',
            'Before a describing word it is muy: muy grande. Mucho goes with nouns: mucho tiempo.',
            'muymucho', 7));
        }
      }

      /* 8. de + el and a + el contract. */
      if (adjacent(t, next) && (t.fold === 'de' || t.fold === 'a') && next.fold === 'el' && adjacent(next, after)) {
        // Not before a name: "de El Salvador" stands.
        if (after.raw[0] === after.raw[0].toLowerCase()) {
          out.push({
            original: text,
            fixed: text.slice(0, t.at) + (t.fold === 'de' ? 'del' : 'al') + text.slice(next.end),
            wrong: t.raw + ' ' + next.raw, right: t.fold === 'de' ? 'del' : 'al',
            note: 'de + el is always del, a + el is always al. Spanish will not let you say them apart.',
            topic: 'contractions', weight: 6
          });
        }
      }

      /* 9. Gustar runs backwards: the thing liked is the subject. */
      if (adjacent(t, next) && (t.fold === 'yo' || t.fold === 'tú' || t.fold === 'tu') && /^gust/.test(next.fold)) {
        out.push({
          original: text,
          fixed: text.slice(0, t.at) + (t.fold === 'yo' ? 'me gusta' : 'te gusta') + text.slice(next.end),
          wrong: t.raw + ' ' + next.raw, right: t.fold === 'yo' ? 'me gusta' : 'te gusta',
          note: 'Gustar means "to be pleasing". The thing does the liking: me gusta el café — ' +
                'the coffee pleases me.',
          topic: 'gustar', weight: 9
        });
      }

      /* 10. False friends. The word exists, so nothing else will flag it. */
      if (FALSE_FRIENDS[t.fold]) {
        var ff = FALSE_FRIENDS[t.fold];
        out.push({
          original: text, fixed: splice(text, t, matchCase(t.raw, ff[0])),
          wrong: t.raw, right: ff[0], note: ff[1], topic: 'falsefriends', weight: 4, soft: true
        });
      }
    }

    /* 10b. The adjective after ser or estar agrees with the subject.
     *      "La comida es delicioso" -> deliciosa. Only fired when the clause
     *      has exactly one noun with a known gender before the copula, so
     *      there is no question which word the adjective belongs to. */
    var COPULA = { es: 1, esta: 1, son: 1, estan: 1, era: 1, eran: 1, fue: 1, fueron: 1,
                   soy: 1, estoy: 1, eres: 1, estas: 1, somos: 1, estamos: 1 };
    var COP_NUM = { es: 's', esta: 's', era: 's', fue: 's', soy: 's', estoy: 's',
                    eres: 's', estas: 's', son: 'p', estan: 'p', eran: 'p', fueron: 'p',
                    somos: 'p', estamos: 'p' };
    for (var c = 1; c < toks.length - 1; c++) {
      if (!COPULA[toks[c].fold]) continue;
      if (!adjacent(toks[c], toks[c + 1])) continue;


      // Everything back to the start of the clause.
      var start = c;
      while (start > 0 && !toks[start].newSentence && !toks[start].broken) start--;
      var subjects = [];
      for (var q = start; q < c; q++) {
        var nq = nounOf(toks[q]);
        if (nq && nq.number) subjects.push(nq);
      }
      if (subjects.length !== 1) continue;

      var subj = subjects[0];
      // A first- or second-person copula has a speaker for a subject, not the
      // noun sitting in front of it: "soy" in "la casa soy" is not this rule.
      if (/^(soy|estoy|eres|estas|somos|estamos)$/.test(toks[c].fold)) continue;
      if (COP_NUM[toks[c].fold] !== subj.number) continue;

      // "es muy bonito": step over an intensifier to reach the adjective.
      var INTENS = { muy: 1, bastante: 1, tan: 1, demasiado: 1, mas: 1, menos: 1,
                     realmente: 1, verdaderamente: 1, algo: 1, poco: 1, tanto: 1 };
      var pi = c + 1;
      while (INTENS[toks[pi] && toks[pi].fold] && adjacent(toks[pi], toks[pi + 1])) pi++;
      var pred = toks[pi];
      if (!pred) continue;
      var padj = adjOf(pred);
      if (!padj) continue;
      var pshape = adjShape(pred.fold);
      if (!pshape) continue;
      if (pshape.g === subj.gender && pshape.n === subj.number) continue;
      var pwant = adjForm(pshape.stem, subj.gender, subj.number);
      if (pwant === pred.fold) continue;
      out.push(finding(text, pred, pwant,
        'The describing word after ser or estar agrees with what it describes. “' +
        subj.lemma + '” is ' + (subj.gender === 'f' ? 'feminine' : 'masculine') +
        (subj.number === 'p' ? ' plural' : ' singular') + ', so it is “' + pwant + '”.',
        'agreement', 8));
    }

    /* 11. A negative word needs "no" in front of the verb as well.
     *     "Veo nada" -> "No veo nada". Spanish doubles up on purpose.
     *
     *     Only when the negative word comes *after* its verb, though. Put it
     *     in front and it does the negating by itself: "nadie hizo nada" and
     *     "nunca voy a olvidar" are both right and neither wants a "no". So
     *     this walks clause by clause, and asks two questions inside each
     *     clause: has a verb gone past yet, and has something already negated
     *     it. Either answer of no means the sentence is fine.
     */
    var NEG_WORD = /^(nada|nadie|nunca|ninguno|ninguna|ningun|tampoco|jamas)$/;
    var NEGATOR  = /^(no|ni|sin|nada|nadie|nunca|ninguno|ninguna|ningun|tampoco|jamas)$/;
    // Each of these opens a clause of its own, and a "sin" or "ni" opens one
    // that is already negative — "sin leer nada", "sin que nadie la toque".
    var CLAUSE_OPENER = /^(que|y|e|o|u|pero|porque|cuando|si|aunque|mientras|donde|quien|como|sin|ni|ya)$/;
    /* "Al principio nadie hizo nada" has no verb before "nadie" — but
     * "principio" is also the yo-form of principiar, and any reading will do
     * was enough to invent one. The top reading is the one the sentence
     * means. */
    var isVerbHere = function (tk) {
      var a = morph().analyse(tk.low);
      return !!(a.length && a[0].pos === 'v' && a[0].personIndex != null && a[0].personIndex >= 0);
    };
    var clauseVerb = null, clauseNeg = false;
    for (var k = 0; k < toks.length; k++) {
      var tk = toks[k];
      if (tk.broken || tk.newSentence || CLAUSE_OPENER.test(tk.fold)) {
        clauseVerb = null;
        clauseNeg = false;
      }
      if (NEGATOR.test(tk.fold)) {
        if (NEG_WORD.test(tk.fold) && clauseVerb && !clauseNeg) {
          out.push({
            original: text,
            fixed: text.slice(0, clauseVerb.at) + 'no ' + text.slice(clauseVerb.at),
            wrong: text.trim(), right: 'no ' + text.trim(),
            note: 'Spanish uses two negatives on purpose: no veo nada. Dropping the “no” is the ' +
                  'English habit.',
            topic: 'negation', weight: 7
          });
        }
        clauseNeg = true;
        continue;
      }
      if (!clauseVerb && isVerbHere(tk)) clauseVerb = tk;
    }

    /* 12. A question written without its opening mark. */
    if (/\?\s*$/.test(text) && !/¿/.test(text)) {
      out.push({
        original: text, fixed: '¿' + text.trim(),
        wrong: text.trim(), right: '¿' + text.trim(),
        note: 'Spanish opens a question too: ¿…? It tells the reader to raise their voice from ' +
              'the start.', topic: 'punctuation', weight: 2, soft: true
      });
    }

    // Strongest first; a fix that changes nothing is not a fix.
    return out
      .filter(function (f) { return f.fixed && f.fixed.trim() !== text.trim(); })
      .sort(function (a, b) { return b.weight - a.weight; })
      .slice(0, 4);
  }

  /* ── The tables the checks lean on ────────────────────────*/

  /* Adjectives that describe a passing state. With ser they are a claim about
   * someone's character, which is usually not what a learner meant. */
  var STATE_ADJ = {};
  ('cansado cansada cansados cansadas enfermo enferma enfermos enfermas ' +
   'contento contenta contentos contentas triste tristes feliz felices ' +
   'ocupado ocupada ocupados ocupadas listo lista preocupado preocupada ' +
   'nervioso nerviosa enfadado enfadada enojado enojada borracho borracha ' +
   'sentado sentada de-pie perdido perdida abierto abierta cerrado cerrada ' +
   'roto rota sucio sucia limpio limpia caliente frio fria muerto muerta ' +
   'vivo viva despierto despierta dormido dormida solo sola llenoa lleno llena vacio vacia'
  ).split(' ').forEach(function (w) { STATE_ADJ[fold(w)] = 1; });

  /* Adjectives that describe what someone *is*. With estar they sound like a
   * mood that will pass. */
  var ESSENCE_ADJ = {};
  ('alto alta bajo baja joven jovenes viejo vieja inteligente inteligentes ' +
   'amable amables simpatico simpatica antipatico antipatica rubio rubia ' +
   'moreno morena espanol espanola mexicano mexicana americano americana ' +
   'ingles inglesa frances francesa aleman alemana profesor profesora ' +
   'medico medica estudiante ingeniero ingeniera abogado abogada'
  ).split(' ').forEach(function (w) { ESSENCE_ADJ[fold(w)] = 1; });

  /* Nouns that go with tener, where English uses "to be". */
  var TENER_NOUN = {};
  ('hambre sed sueno frio calor prisa miedo razon suerte cuidado ganas ' +
   'anos vergüenza verguenza celos exito'
  ).split(' ').forEach(function (w) { TENER_NOUN[fold(w)] = 1; });

  /* Adjectives that are plainly descriptive, so putting them in front is the
   * English habit rather than a deliberate flourish. */
  var DESCRIPTIVE = {};
  ('rojo roja rojos rojas azul azules verde verdes amarillo amarilla negro negra ' +
   'blanco blanca gris grises marron naranja morado morada rosa ' +
   'grande grandes pequeno pequena alto alta bajo baja largo larga corto corta ' +
   'nuevo nueva viejo vieja limpio limpia sucio sucia caro cara barato barata ' +
   'delicioso deliciosa bonito bonita feo fea'
  ).split(' ').forEach(function (w) { DESCRIPTIVE[fold(w)] = 1; });

  /* Adjectives that are simply wrong in front of the noun. Colours, and
   * nothing else: "un viejo amigo", "un gran hombre", "una pobre mujer" and
   * "mi propio coche" are all correct and all mean something different from
   * the same words the other way round, so flagging them would be teaching a
   * learner to flatten the language. */
  var FRONTED_IS_WRONG = {};
  ('rojo roja rojos rojas azul azules verde verdes amarillo amarilla ' +
   'negro negra negros negras blanco blanca blancos blancas gris grises ' +
   'marron morado morada naranja rosado rosada violeta'
  ).split(' ').forEach(function (w) { FRONTED_IS_WRONG[fold(w)] = 1; });

  /* Words that look like an English word and are not. Flagged softly: they are
   * real Spanish, so the learner may have meant them. */
  var FALSE_FRIENDS = {
    embarazada: ['avergonzada', '“Embarazada” means pregnant. Embarrassed is avergonzado/a.'],
    exito: ['salida', '“Éxito” means success. The way out is la salida.'],
    actualmente: ['en realidad', '“Actualmente” means currently. Actually is en realidad.'],
    realizar: ['darse cuenta de', '“Realizar” means to carry out. To realise something is darse cuenta de.'],
    asistir: ['ayudar', '“Asistir” means to attend. To assist is ayudar.'],
    sensible: ['sensato', '“Sensible” means sensitive. Sensible is sensato.'],
    ropa: ['cuerda', '“Ropa” means clothes. A rope is una cuerda.'],
    sopa: ['jabon', '“Sopa” means soup. Soap is jabón.'],
    libreria: ['biblioteca', '“Librería” is a bookshop. A library is la biblioteca.'],
    carpeta: ['alfombra', '“Carpeta” is a folder. A carpet is una alfombra.'],
    molestar: ['abusar', '“Molestar” means to bother. The English sense is abusar.'],
    constipado: ['estrenido', '“Constipado” means having a cold. Constipated is estreñido.'],
    pretender: ['fingir', '“Pretender” means to intend. To pretend is fingir.'],
    introducir: ['presentar', '“Introducir” means to insert. To introduce a person is presentar.'],
    largo: ['grande', '“Largo” means long, not large. Large is grande.'],
    'once': ['una vez', '“Once” is the number eleven. The English once is una vez.']
  };

  /* ── What the rest of the app asks for ────────────────────*/

  /* One correction, in the shape the conversation screen already renders —
   * but with every error fixed, not just the first.
   *
   * "La problema es que soy cansado" has two mistakes in it. Showing the
   * learner "el problema es que soy cansado" as the corrected version teaches
   * them that the second half was fine, which is worse than saying nothing.
   * So the strongest fix is applied and the sentence is checked again, up to
   * four times: composing by re-running is exact, where splicing several
   * fixes into one string by offset is a source of bugs.
   */
  function correct(text) {
    var current = text;
    var notes = [];
    var topics = [];
    var first = null;

    for (var round = 0; round < 4; round++) {
      var hits = check(current);
      var hit = null;
      for (var i = 0; i < hits.length; i++) { if (!hits[i].soft) { hit = hits[i]; break; } }
      if (!hit && round === 0 && hits.length) hit = hits[0];   // soft-only: still worth saying
      if (!hit) break;
      if (hit.fixed === current) break;
      if (!first) first = hit;
      current = hit.fixed;
      if (notes.indexOf(hit.note) === -1) notes.push(hit.note);
      if (hit.topic && topics.indexOf(hit.topic) === -1) topics.push(hit.topic);
    }

    if (!first || current === text) return null;
    return {
      original: text,
      fixed: current,
      // Two reasons is a lesson; five is a wall, and a learner who made five
      // mistakes in one sentence needs the first two more than the rest.
      note: notes.slice(0, 2).join(' '),
      topic: topics[0] || null,
      topics: topics,
      source: 'rules'
    };
  }

  /* Does the checker agree with a correction the model proposed? A model that
   * "fixes" correct Spanish is worse than no model, and this can veto it. */
  function agrees(original, fixed) {
    if (!ready()) return null;
    var before = check(original).length;
    var after = check(fixed).length;
    if (after > before) return false;      // the model made it worse
    return true;
  }

  PARLA.grammar = {
    ready: ready,
    check: check,
    correct: correct,
    agrees: agrees,
    topics: function () { return Object.keys(TOPIC_COUNT); }
  };

  var TOPIC_COUNT = {
    gender: 1, agreement: 1, wordorder: 1, person: 1, serestar: 1, tener: 1,
    muymucho: 1, contractions: 1, gustar: 1, falsefriends: 1, negation: 1, punctuation: 1
  };
})();
