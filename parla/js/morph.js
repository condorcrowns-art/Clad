/* Parla — Spanish morphology
 *
 * A dictionary knows "pedir". A learner hears "pidiéndoselo". Between those
 * two facts sits every reason a beginner gives up on looking words up, and
 * this file is that gap closed.
 *
 * Given any surface form it returns the word it comes from and what was done
 * to it — conjugation, plural, feminine, adverb, superlative, diminutive, or
 * a stack of pronouns glued onto the end. It works by undoing each of those
 * operations and checking the result against the dictionary, which means it
 * never guesses: an analysis is only returned if the lemma it proposes is a
 * real word of the right part of speech.
 *
 * Nothing here needs a model, a network or a microphone.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  function dict() { return PARLA.dict; }
  function verbs() { return PARLA.data && PARLA.data.es && PARLA.data.es.verbs; }
  function ready() { return !!(dict() && dict().ready() && verbs()); }

  function fold(w) {
    return String(w || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-zñ]/g, '');
  }

  function deaccent(w) {
    return String(w || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* ── Verbs ────────────────────────────────────────────────
   * Rather than pre-computing 200,000 forms — which is a second of work and
   * fifteen megabytes on a phone — this works backwards. Strip an ending that
   * some tense uses, put an infinitive ending on what is left, and see whether
   * that is a verb the dictionary has heard of. Then conjugate it forwards and
   * demand an exact match, so a coincidence cannot survive.
   */

  /* Every ending the engine can produce, longest first so "ábamos" is tried
   * before "amos" and the analysis lands on the imperfect. */
  var ENDINGS = ('ábamos áramos iéramos aríamos eríamos iríamos abamos aramos ieramos '
    + 'asteis isteis abais arais ierais aríais eríais iríais íamos amos emos imos '
    + 'ábais ieron aron aban ían ías ían aste iste ando iendo yendo ados idas ados '
    + 'aba abas ara aras iera ieras ase ases iese ieses ría rías ríamos ríais rían '
    + 'eron eran era eras endo eses ese '
    + 'aré arás ará aremos aréis arán eré erás erá eremos eréis erán iré irás irá '
    + 'iremos iréis irán ado ido ida idos idas ada adas ase iese áis éis ís an en '
    + 'as es an ió ó é í ían ía ia amos imos a e i o ад').split(' ')
    .filter(function (x) { return /^[a-záéíóúñ]+$/.test(x); })
    .sort(function (a, b) { return b.length - a.length; });

  /* Undo a stem change so "encuentr" is recognised as "encontr". Forward you
   * cannot tell that pensar breaks and pasar does not; backwards you can just
   * try both and let the dictionary decide. */
  function unbreak(stem) {
    var out = [stem];
    var ue = stem.lastIndexOf('ue');
    if (ue >= 0) {
      out.push(stem.slice(0, ue) + 'o' + stem.slice(ue + 2));
      out.push(stem.slice(0, ue) + 'u' + stem.slice(ue + 2));   // jugar
    }
    var ie = stem.lastIndexOf('ie');
    if (ie >= 0) out.push(stem.slice(0, ie) + 'e' + stem.slice(ie + 2));
    var i = stem.lastIndexOf('i');
    if (i >= 0) out.push(stem.slice(0, i) + 'e' + stem.slice(i + 1));
    var u = stem.lastIndexOf('u');
    if (u >= 0) out.push(stem.slice(0, u) + 'o' + stem.slice(u + 1));
    return out;
  }

  /* Undo the spelling rules: busqu -> busc, llegu -> lleg, empec -> empez,
   * coj -> cog, sig -> segu, conozc -> conoc, construy -> constru. */
  function unspell(stem) {
    var out = [stem];
    if (/qu$/.test(stem)) out.push(stem.slice(0, -2) + 'c');
    if (/gu$/.test(stem)) out.push(stem.slice(0, -1));
    if (/c$/.test(stem))  out.push(stem.slice(0, -1) + 'z');
    if (/j$/.test(stem))  out.push(stem.slice(0, -1) + 'g');
    if (/g$/.test(stem))  out.push(stem + 'u');
    if (/zc$/.test(stem)) out.push(stem.slice(0, -2) + 'c');
    if (/y$/.test(stem))  out.push(stem.slice(0, -1));
    if (/ü/.test(stem))   out.push(stem.replace(/ü/g, 'u'));
    return out;
  }

  var TENSE_LABEL = null;
  function tenseLabels() {
    if (!TENSE_LABEL) {
      TENSE_LABEL = verbs().tenses;
    }
    return TENSE_LABEL;
  }

  /* Candidate infinitives for a surface form, cheapest guesses first. */
  function candidates(word) {
    var seen = Object.create(null);
    var out = [];
    function add(inf) {
      // "ir" is two letters and is a verb; "irme" must reach it.
      if (!inf || inf.length < 2 || seen[inf]) return;
      seen[inf] = 1;
      out.push(inf);
    }

    // It may already be one.
    add(word);
    if (/[aei]r$/.test(word)) add(word);

    for (var e = 0; e < ENDINGS.length; e++) {
      var end = ENDINGS[e];
      if (word.length <= end.length) continue;
      if (word.slice(-end.length) !== end) continue;
      var stem = word.slice(0, -end.length);
      // Future and conditional keep the whole infinitive in front of the
      // ending, so the stem may already be one.
      add(stem);
      if (/[aei]r$/.test(stem)) add(stem);
      var bases = [];
      unspell(stem).forEach(function (s) {
        unbreak(s).forEach(function (b) { if (bases.indexOf(b) < 0) bases.push(b); });
      });
      // Irregular future stems: tendr- -> tener, podr- -> poder.
      bases.slice().forEach(function (b) {
        if (/dr$/.test(b)) { bases.push(b.slice(0, -2) + 'ner'); bases.push(b.slice(0, -2) + 'nir'); }
        if (/rr$/.test(b)) bases.push(b.slice(0, -1) + 'er');
      });
      for (var i = 0; i < bases.length; i++) {
        add(bases[i] + 'ar'); add(bases[i] + 'er'); add(bases[i] + 'ir');
        add(deaccent(bases[i]) + 'ar'); add(deaccent(bases[i]) + 'er'); add(deaccent(bases[i]) + 'ir');
      }
    }
    return out;
  }

  var TENSE_KEYS = ['presente', 'preterito', 'imperfecto', 'futuro', 'condicional',
    'subjuntivo', 'imperfectoSubj', 'imperativo'];

  /* Is `word` a form of `inf`? Returns the analysis, or null. */
  function matchVerb(word, inf) {
    var V = verbs();
    if (word === inf) {
      // Only if it looks like one: "vamos" is a dictionary headword but it is
      // not an infinitive, and saying so is worse than saying nothing.
      if (!/([aei]r|ír)$/.test(word)) return null;
      return { tenseKey: 'infinitivo', tense: 'Infinitive', person: '', personIndex: -1 };
    }
    if (V.participle(inf) === word) return { tenseKey: 'participio', tense: 'Past participle', person: '', personIndex: -1 };
    if (V.gerund(inf) === word) return { tenseKey: 'gerundio', tense: 'Gerund', person: '', personIndex: -1 };
    for (var t = 0; t < TENSE_KEYS.length; t++) {
      var forms = V.conjugate(inf, TENSE_KEYS[t]);
      if (!forms) continue;
      for (var i = 0; i < 6; i++) {
        if (forms[i] === word) {
          return {
            tenseKey: TENSE_KEYS[t],
            tense: tenseLabels()[TENSE_KEYS[t]].label,
            person: V.pronouns[i],
            personIndex: i
          };
        }
      }
    }
    return null;
  }

  /* Strong preterites and suppletive stems - fui, tuvieron, supimos, dijo - do
   * not lead back to an infinitive by stripping endings, because the stem was
   * replaced rather than modified. There are not many such verbs, so they are
   * indexed forwards once, the first time anyone asks. */
  var irregIndex = null;

  function buildIrregIndex() {
    irregIndex = new Map();
    var V = verbs(), D = dict();
    var bases = V.irregularList();
    var all = bases.slice();
    // Their compounds too: obtener, propuso, deshizo.
    if (D.ready()) {
      D.search({ pos: 'v', limit: 20000 }).forEach(function (e) {
        var b = V.compoundBase(e.term);
        if (b && bases.indexOf(b) >= 0 && all.indexOf(e.term) < 0) all.push(e.term);
      });
    }
    all.forEach(function (inf) {
      TENSE_KEYS.concat(['participio', 'gerundio']).forEach(function (t) {
        var forms = t === 'participio' ? [V.participle(inf)]
                  : t === 'gerundio' ? [V.gerund(inf)]
                  : V.conjugate(inf, t);
        if (!forms) return;
        forms.forEach(function (f, i) {
          if (!f || f === '—') return;
          var list = irregIndex.get(f);
          if (!list) irregIndex.set(f, [{ inf: inf, tenseKey: t, person: i }]);
          // "fui" is both ser and ir, and a learner needs to be told that
          // rather than shown whichever the loop reached first.
          else if (list.length < 3 && !list.some(function (x) { return x.inf === inf; })) {
            list.push({ inf: inf, tenseKey: t, person: i });
          }
        });
      });
    });
  }

  function fromIrregular(word) {
    if (!irregIndex) buildIrregIndex();
    var hits = irregIndex.get(word);
    if (!hits) return [];
    var V = verbs();
    return hits.map(function (hit) {
      var bare = hit.tenseKey === 'participio' || hit.tenseKey === 'gerundio';
      return {
        tenseKey: hit.tenseKey,
        tense: hit.tenseKey === 'participio' ? 'Past participle'
             : hit.tenseKey === 'gerundio' ? 'Gerund'
             : tenseLabels()[hit.tenseKey].label,
        person: bare ? '' : V.pronouns[hit.person],
        personIndex: hit.person,
        inf: hit.inf
      };
    });
  }

  function verbAnalyses(word, out) {
    var D = dict();
    var found = 0;

    fromIrregular(word).forEach(function (strong) {
      var se = D.get(strong.inf);
      out.push({
        lemma: strong.inf, pos: 'v', surface: word,
        tense: strong.tense, tenseKey: strong.tenseKey, person: strong.person,
        personIndex: strong.personIndex,
        en: se ? se.en : '', entry: se,
        why: strong.tenseKey === 'infinitivo' ? 'the infinitive'
           : strong.person ? strong.tense.toLowerCase() + ', ' + strong.person
           : strong.tense.toLowerCase()
      });
      found++;
    });

    var cands = candidates(word);
    for (var i = 0; i < cands.length && found < 3; i++) {
      var inf = D.verbFor(cands[i]);
      if (!inf) continue;
      var m = matchVerb(word, inf);
      if (!m) continue;
      var e = D.get(inf);
      out.push({
        lemma: inf, pos: 'v', surface: word,
        tense: m.tense, tenseKey: m.tenseKey, person: m.person, personIndex: m.personIndex,
        en: e ? e.en : '', entry: e,
        why: m.tenseKey === 'infinitivo' ? 'the infinitive'
           : m.person ? m.tense.toLowerCase() + ', ' + m.person
           : m.tense.toLowerCase()
      });
      found++;
    }
    return out;
  }

  /* ── Clitics ──────────────────────────────────────────────
   * "dímelo", "hablándonos", "sentarse". Pronouns stack on the end of an
   * infinitive, a gerund or an imperative, and the accent that appears is a
   * consequence of the stress moving, so it comes off again on the way back. */
  var CLITICS = ['melo', 'mela', 'melos', 'melas', 'telo', 'tela', 'telos', 'telas',
    'selo', 'sela', 'selos', 'selas', 'noslo', 'nosla', 'noslos', 'noslas',
    'oslo', 'osla', 'me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'le', 'los', 'las', 'les']
    .sort(function (a, b) { return b.length - a.length; });

  var CLITIC_EN = {
    me: 'me', te: 'you', se: 'himself/herself/themselves', nos: 'us', os: 'you all',
    lo: 'it/him', la: 'it/her', le: 'to him/her', los: 'them', las: 'them', les: 'to them'
  };

  function splitClitics(word) {
    var tail = [];
    var stem = word;
    for (var round = 0; round < 2; round++) {
      var hit = null;
      for (var i = 0; i < CLITICS.length; i++) {
        var c = CLITICS[i];
        if (stem.length > c.length + 1 && stem.slice(-c.length) === c) { hit = c; break; }
      }
      if (!hit) break;
      // "melo" is two pronouns written as one.
      if (hit.length > 3 && /^(me|te|se|nos|os)/.test(hit)) {
        var first = /^nos/.test(hit) ? 'nos' : /^os/.test(hit) ? 'os' : hit.slice(0, 2);
        tail.unshift(hit.slice(first.length));
        tail.unshift(first);
      } else {
        tail.unshift(hit);
      }
      stem = stem.slice(0, -hit.length);
      // "vámonos" is "vamos" + "nos" with the s of the verb swallowed, and
      // "sentémonos" the same. Restore it - and stop, or the "os" now at the
      // end gets taken for a second pronoun.
      // "vámonos" lost the s of "vamos"; "irnos" never had one. Offer both.
      if (hit === 'nos') { return { stem: stem, altStem: stem + 's', clitics: [hit] }; }
      if (hit.length > 3) break;
    }
    if (!tail.length) return null;
    return { stem: stem, clitics: tail };
  }

  /* Which parts of speech can take a plural or a feminine. Wiktionary files a
   * few adjectives as interjections ("maldito"), so this is deliberately
   * broader than "adjectives and nouns". */
  var INFLECTABLE = { n: 1, adj: 1, interj: 1, prop: 1, other: 1, num: 1 };

  /* ── Nouns and adjectives ─────────────────────────────────*/
  /* The plural of a Spanish singular, so a proposed singular can be checked by
   * going forwards again. "mesas" strips to "mes" as readily as to "mesa", but
   * the plural of "mes" is "meses" — so only one of the two survives the test,
   * and without it "las mesas" reads as masculine. */
  function pluralOf(sg) {
    if (/[aeiouáéíóú]$/.test(sg)) return sg + 's';
    if (/z$/.test(sg)) return sg.slice(0, -1) + 'ces';
    if (/[íú]$/.test(sg)) return sg + 'es';
    return sg + 'es';
  }

  function singulars(word) {
    var out = [];
    if (/ces$/.test(word)) out.push(word.slice(0, -3) + 'z');       // luces -> luz
    if (/es$/.test(word)) {
      out.push(word.slice(0, -2));                                   // flores -> flor
      // A plural puts the stress back where an accent used to mark it:
      // "canciones" -> "canción", "ingleses" -> "inglés".
      var base = word.slice(0, -2);
      if (/[oa]n$/.test(base)) out.push(base.replace(/([oa])n$/, function (m, v) {
        return (v === 'o' ? 'ó' : 'á') + 'n';
      }));
      if (/es$/.test(base)) out.push(base.replace(/es$/, 'és'));
    }
    if (/s$/.test(word)) out.push(word.slice(0, -1));                // casas -> casa
    // Keep only the ones that pluralise back to what was actually written.
    var kept = out.filter(function (sg) {
      return sg.length > 1 && deaccent(pluralOf(sg)) === deaccent(word);
    });
    return kept.length ? kept : out;
  }

  function masculines(word) {
    var out = [];
    if (/a$/.test(word)) {
      out.push(word.slice(0, -1) + 'o');                             // bonita -> bonito
      out.push(word.slice(0, -1));                                   // española -> español
    }
    if (/ora$/.test(word)) out.push(word.slice(0, -1));              // trabajadora -> trabajador
    if (/(ana|ona|esa|ina)$/.test(word)) out.push(word.slice(0, -1)); // española -> español
    return out;
  }

  /* ── The engine ───────────────────────────────────────────*/
  function analyse(surface) {
    if (!ready()) return [];
    var word = String(surface || '').toLowerCase()
      .replace(/^[¡¿"'“”«»(\[]+|[.,;:!?"'“”«»)\]]+$/g, '').trim();
    if (!word || /\s/.test(word)) {
      // A phrase: the dictionary may have it whole, and if not it may be a
      // compound tense, which is two words doing one job.
      var whole = dict().get(word);
      if (whole) {
        return [{ lemma: whole.term, pos: whole.pos, en: whole.en, entry: whole,
                  why: 'a set phrase', surface: word }];
      }
      return compound(word);
    }

    var out = [];
    var D = dict();

    /* 1. It is simply a word. */
    var direct = D.get(word);
    if (direct && D.fold(direct.term) === D.fold(word)) {
      out.push({ lemma: direct.term, pos: direct.pos, en: direct.en, entry: direct,
                 why: null, surface: word, exact: true });
    }

    /* 2. It is a verb form. */
    verbAnalyses(word, out);

    /* 3. It is a verb form with pronouns stuck on the end. */
    var split = splitClitics(word);
    if (split) {
      var stems = [split.stem, deaccent(split.stem)];
      if (split.altStem) { stems.push(split.altStem); stems.push(deaccent(split.altStem)); }
      // "dime" is "di" + "me"; the accent in "dímelo" is the stress moving.
      if (/[aeiou]$/.test(split.stem)) stems.push(deaccent(split.stem));
      var inner = [];
      for (var s = 0; s < stems.length && !inner.length; s++) verbAnalyses(stems[s], inner);
      inner.forEach(function (a) {
        // Pronouns only ever attach to an infinitive, a gerund or a command.
        // "vamos" is indexed as a present tense because that is what it usually
        // is, so ask the engine whether this spelling is also an imperative
        // rather than turning "vámonos" down on a technicality.
        if (a.tenseKey !== 'infinitivo' && a.tenseKey !== 'gerundio' && a.tenseKey !== 'imperativo') {
          var imp = verbs().conjugate(a.lemma, 'imperativo') || [];
          for (var k = 0; k < imp.length; k++) {
            if (stems.indexOf(imp[k]) >= 0) {
              a = { lemma: a.lemma, pos: 'v', en: a.en, entry: a.entry,
                    tenseKey: 'imperativo', tense: 'Imperative',
                    person: verbs().pronouns[k],
                    why: 'imperative, ' + verbs().pronouns[k] };
              break;
            }
          }
        }
        if (a.tenseKey === 'infinitivo' || a.tenseKey === 'gerundio' || a.tenseKey === 'imperativo') {
          out.push({
            lemma: a.lemma, pos: 'v', surface: word, en: a.en, entry: a.entry,
            tense: a.tense, tenseKey: a.tenseKey, person: a.person,
            clitics: split.clitics,
            why: a.why + ', with ' + split.clitics.map(function (c) {
              return '“' + c + '” (' + (CLITIC_EN[c] || c) + ')';
            }).join(' and ') + ' on the end'
          });
        }
      });
    }

    /* 4. Plural. */
    if (/s$/.test(word)) {
      singulars(word).forEach(function (sg) {
        var e = D.get(sg);
        if (e && INFLECTABLE[e.pos] && D.fold(e.term) === D.fold(sg)) {
          out.push({ lemma: e.term, pos: e.pos, en: e.en, entry: e, surface: word,
                     number: 'plural', why: 'plural of ' + e.term });
        }
      });
    }

    /* 5. Feminine, and feminine plural. */
    var femBases = masculines(word);
    if (/as$/.test(word)) masculines(word.slice(0, -1)).forEach(function (m) { femBases.push(m); });
    femBases.forEach(function (m) {
      var e = D.get(m);
      if (!e || !INFLECTABLE[e.pos] || D.fold(e.term) !== D.fold(m)) return;
      /* Which masculines actually have a feminine in -a?
       *  - anything in -o: niño -> niña, blanco -> blanca
       *  - agent and nationality endings: profesor -> profesora,
       *    alemán -> alemana, inglés -> inglesa, bailarín -> bailarina
       *  - adjectives, which the dictionary can vouch for
       * Nothing else. Without this, "mesas" is read as the feminine plural of
       * "mes", the month, and every table in Spanish becomes masculine. */
      // Tested on the dictionary's own spelling, accents included: the
      // nationality and agent endings are -ón, -án, -és, -ín and -or. Folding
      // the accents away first would let "mes" pass as if it were "inglés".
      var term = e.term.toLowerCase();
      var plausible = /o$/.test(term) || /(ón|án|és|ín|or)$/.test(term) || e.pos === 'adj';
      if (!plausible) return;
      out.push({ lemma: e.term, pos: e.pos, en: e.en, entry: e, surface: word,
                 gender: 'f', number: /as$/.test(word) ? 'plural' : 'singular',
                 why: 'feminine' + (/as$/.test(word) ? ' plural' : '') + ' of ' + e.term });
    });

    /* 6. -mente adverbs are built on the feminine of an adjective. */
    if (/mente$/.test(word) && word.length > 7) {
      var adjF = word.slice(0, -5);
      [adjF, adjF.replace(/a$/, 'o'), adjF].forEach(function (cand) {
        var e = D.get(cand);
        if (e && e.pos === 'adj') {
          out.push({ lemma: e.term, pos: 'adv', en: e.en + 'ly', entry: e, surface: word,
                     why: 'adverb from “' + e.term + '” — Spanish adds -mente to the feminine, like English -ly' });
        }
      });
    }

    /* 7. -ísimo: the emphatic superlative. */
    if (/[íi]simo?s?$|[íi]sima s?$|[íi]simas$/.test(word)) {
      var base = word.replace(/[íi]sim[oa]s?$/, '');
      [base + 'o', base, base + 'e',
       base.replace(/qu$/, 'c') + 'o', base.replace(/gu$/, 'g') + 'o'].forEach(function (cand) {
        var e = D.get(cand);
        if (e && e.pos === 'adj') {
          out.push({ lemma: e.term, pos: 'adj', en: 'very ' + e.en, entry: e, surface: word,
                     why: '“very ' + e.en + '” — the -ísimo ending is stronger than muy' });
        }
      });
    }

    /* 8. Diminutives and augmentatives. */
    var DIM = [
      [/cit[oa]s?$/, 4, 'a little '], [/it[oa]s?$/, 3, 'a little '],
      [/ill[oa]s?$/, 4, 'a little '], [/[oa]zos?$/, 3, 'a big '], [/[oa]n(es)?$/, 2, 'a big ']
    ];
    DIM.forEach(function (rule) {
      if (!rule[0].test(word)) return;
      var stem = word.replace(rule[0], '');
      [stem + 'o', stem + 'a', stem, stem + 'e',
       stem.replace(/qu$/, 'c') + 'o', stem.replace(/qu$/, 'c') + 'a'].forEach(function (cand) {
        var e = D.get(cand);
        if (e && e.pos === 'n' && cand.length > 2 && D.fold(e.term) === D.fold(cand)) {
          out.push({ lemma: e.term, pos: 'n', en: rule[2] + e.en, entry: e, surface: word,
                     why: rule[2] + e.en + ' — Spanish shrinks and grows nouns with endings' });
        }
      });
    });

    /* 9. A participle doing an adjective's job: "cansado", "abiertas". */
    if (/[ao]s?$/.test(word) && !out.some(function (a) { return a.pos === 'v'; })) {
      var masc = word.replace(/a(s?)$/, 'o$1').replace(/s$/, '');
      var partOf = null;
      ['ado', 'ido'].forEach(function (suffix) {
        if (masc.slice(-3) !== suffix) return;
        verbAnalyses(masc, []).forEach(function () {});
      });
      var v2 = [];
      verbAnalyses(masc, v2);
      v2.forEach(function (a) {
        if (a.tenseKey === 'participio') {
          out.push({ lemma: a.lemma, pos: 'v', en: a.en, entry: a.entry, surface: word,
                     tenseKey: 'participio', tense: 'Past participle',
                     why: 'past participle of ' + a.lemma + ', used here as an adjective' });
        }
      });
      if (partOf) out.push(partOf);
    }

    /* Dedupe, then order by how likely each reading is. "casas" is the plural
     * of a word in the top hundred far more often than it is the tú-form of
     * "casar", and a list that opens with "to wed someone in wedlock" is worse
     * than no list. Commonness of the lemma decides it. */
    var seen = Object.create(null);
    var final = [];
    for (var i = 0; i < out.length; i++) {
      var a = out[i];
      // A word typed on its own that is already a dictionary headword does not
      // also need "...and it is the infinitive" underneath it.
      if (a.tenseKey === 'infinitivo' && !a.clitics && a.lemma === word) continue;
      var k = a.lemma + '|' + (a.why || '') + '|' + (a.tenseKey || '');
      if (seen[k]) continue;
      seen[k] = 1;
      a.likelihood = (a.entry && a.entry.band ? a.entry.band : 40000)
        // A word that is simply in the dictionary as typed beats every reading
        // that had to take it apart: "rápidamente" is an adverb, not a clue
        // pointing at "rápido".
        + (a.exact ? -100000 : 0)
        + (a.clitics ? 300 : 0)
        + (/shrinks and grows/.test(a.why || '') ? 4000 : 0);
      final.push(a);
    }
    final.sort(function (x, y) { return x.likelihood - y.likelihood; });
    return final.slice(0, 6);
  }

  /* "he comido", "habíamos hablado", "estoy comiendo", "va a llover" — two
   * words that name one tense. Spanish builds half its tenses this way and a
   * learner meets them on day one. */
  var AUX = {
    haber: { presente: 'present perfect', imperfecto: 'past perfect',
             futuro: 'future perfect', condicional: 'conditional perfect',
             subjuntivo: 'perfect subjunctive' },
    estar: { any: 'progressive — happening right now' },
    ir:    { any: 'the going-to future' }
  };

  function compound(text) {
    var parts = text.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || parts.length > 3) return [];
    // "voy a comer" - the a is part of the construction, not a third verb.
    if (parts.length === 3 && parts[1].toLowerCase() !== 'a') return [];
    var head = analyse(parts[0]);
    var tailWord = parts[parts.length - 1];
    var tail = analyse(tailWord);
    if (!head.length || !tail.length) return [];

    for (var h = 0; h < head.length; h++) {
      var a = head[h];
      if (a.pos !== 'v' || !AUX[a.lemma]) continue;
      for (var t = 0; t < tail.length; t++) {
        var b = tail[t];
        if (b.pos !== 'v') continue;
        var wantPart = a.lemma === 'haber';
        var wantGer = a.lemma === 'estar';
        if (wantPart && b.tenseKey !== 'participio') continue;
        if (wantGer && b.tenseKey !== 'gerundio') continue;
        // "comer" on its own comes back as a plain dictionary entry rather
        // than as "the infinitive", because saying so on its own would be
        // noise. Here it is exactly what we need it to be.
        var isInf = b.tenseKey === 'infinitivo' || (b.exact && /([aei]r|ír)$/.test(b.lemma));
        if (a.lemma === 'ir' && !isInf) continue;
        var name = AUX[a.lemma].any || AUX[a.lemma][a.tenseKey] || 'a compound tense';
        return [{
          lemma: b.lemma, pos: 'v', surface: text, en: b.en, entry: b.entry,
          tenseKey: 'compuesto', tense: name, person: a.person, auxiliary: a.lemma,
          why: name + ' of ' + b.lemma + ' — ' + a.lemma + ' carries the person and tense, ' +
               b.lemma + ' carries the meaning'
        }];
      }
    }
    return [];
  }

  /* The single best reading, which is what most callers want. */
  function best(surface) {
    var all = analyse(surface);
    return all.length ? all[0] : null;
  }

  /* A sentence, word by word — what powers tapping a word in a conversation. */
  function analyseSentence(text) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    return words.map(function (w) {
      return { word: w, analyses: analyse(w) };
    });
  }

  PARLA.morph = {
    ready: ready,
    analyse: analyse,
    best: best,
    analyseSentence: analyseSentence,
    candidates: candidates,
    splitClitics: splitClitics
  };
})();
