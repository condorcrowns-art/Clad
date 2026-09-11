/* Parla — Spanish phonology
 *
 * Speech recognition tells you it heard "pero" when you meant "perro". That is
 * a pass/fail verdict and it teaches nothing: the learner already knew they got
 * it wrong. What they need is the next sentence — *your rr came out as a single
 * tap* — and that requires knowing what the word should sound like, what it
 * apparently sounded like, and which sound the difference sits on.
 *
 * Spanish makes this possible in a way English never would. Its spelling is
 * close to phonemic: given the letters, the sounds follow from rules with a
 * handful of exceptions, so the pronunciation of any word can be derived rather
 * than looked up. That gives us:
 *
 *   ipa(word)        what it should sound like
 *   syllables(word)  where it breaks
 *   stress(word)     which syllable is loud, from the spelling alone
 *   compare(a, b)    align two words' sounds and name what changed
 *
 * All of it offline, and none of it a guess.
 *
 * Two dialect choices are settings, not facts: seseo (whether "z" and soft "c"
 * are /s/ as in Latin America or /θ/ as in most of Spain) and yeísmo (whether
 * "ll" and "y" have merged, which they have for the overwhelming majority of
 * speakers). Defaults are Latin American, because that is who the learner in
 * front of this is most likely to be talking to.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var VOWELS = 'aeiouáéíóúü';
  var STRONG = 'aeoáéó';
  var WEAK = 'iuíúü';

  /* The length check is not decoration: indexOf('') returns 0, so without it
   * "before a vowel" is true at the very start of a word and "vaca" comes out
   * with the soft b that only belongs between vowels. */
  function isVowel(c) { return !!c && c.length === 1 && VOWELS.indexOf(c) !== -1; }
  function isStrong(c) { return STRONG.indexOf(c) !== -1; }

  var opts = { seseo: true, yeismo: true };
  function dialect(o) { if (o) { for (var k in o) if (o.hasOwnProperty(k)) opts[k] = o[k]; } return opts; }

  /* ── Letters to sounds ────────────────────────────────────
   * Walked left to right, longest digraph first. The output is a broad
   * phonemic transcription — enough to tell two words apart and to name a
   * mistake, not a narrow phonetic one. */
  function phonemes(word) {
    var w = String(word || '').toLowerCase().trim();
    if (!w) return [];
    var out = [];
    var i = 0;

    function prev() { return out.length ? out[out.length - 1] : null; }
    function atStart() { return out.length === 0; }

    while (i < w.length) {
      var c = w[i], n = w[i + 1];

      /* digraphs first */
      if (c === 'c' && n === 'h') { out.push('tʃ'); i += 2; continue; }
      if (c === 'l' && n === 'l') { out.push(opts.yeismo ? 'ʝ' : 'ʎ'); i += 2; continue; }
      if (c === 'r' && n === 'r') { out.push('r'); i += 2; continue; }
      if (c === 'q' && n === 'u') { out.push('k'); i += 2; continue; }   // que, qui
      if (c === 'g' && n === 'u' && 'eéií'.indexOf(w[i + 2]) !== -1) { out.push('g'); i += 2; continue; }
      if (c === 'g' && n === 'ü') { out.push('g'); out.push('w'); i += 2; continue; }

      switch (c) {
        case 'b': case 'v':
          // Between vowels these soften to a fricative — the single most
          // audible thing an English speaker gets wrong about "v".
          out.push(isVowel(w[i - 1] || '') && isVowel(n || '') ? 'β' : 'b');
          break;
        case 'c':
          if ('eéií'.indexOf(n) !== -1) out.push(opts.seseo ? 's' : 'θ');
          else out.push('k');
          break;
        case 'd':
          // Soft between vowels, and soft at the end of a word — "ciudad" and
          // "usted" end in the th of "this", which is exactly the ending an
          // English speaker hardens.
          out.push((isVowel(w[i - 1]) && isVowel(n)) || (isVowel(w[i - 1]) && !n) ? 'ð' : 'd');
          break;
        case 'g':
          if ('eéií'.indexOf(n) !== -1) out.push('x');
          else out.push(isVowel(w[i - 1] || '') ? 'ɣ' : 'g');
          break;
        case 'h': break;                                   // silent, always
        case 'j': out.push('x'); break;
        case 'ñ': out.push('ɲ'); break;
        case 'r':
          // A trill at the start of a word, and after n, l or s. A tap
          // everywhere else. English has neither and substitutes its own r for
          // both, which is why this matters twice.
          out.push(atStart() || 'nls'.indexOf(w[i - 1] || '') !== -1 ? 'r' : 'ɾ');
          break;
        case 'x': out.push('k'); out.push('s'); break;
        case 'y':
          out.push(isVowel(n || '') ? 'ʝ' : 'i');          // yo vs hay
          break;
        case 'z': out.push(opts.seseo ? 's' : 'θ'); break;
        case 'w': out.push('w'); break;
        case 'ü': out.push('u'); break;
        case 'á': out.push('a'); break;
        case 'é': out.push('e'); break;
        case 'í': out.push('i'); break;
        case 'ó': out.push('o'); break;
        case 'ú': out.push('u'); break;
        default:
          if (/[a-zñ]/.test(c)) out.push(c);
          break;
      }
      i++;
    }
    return out;
  }

  function ipa(word) { return phonemes(word).join(''); }

  /* ── Syllables ────────────────────────────────────────────
   * Spanish prefers an onset: a single consonant between vowels goes with the
   * following vowel, and the clusters below are never split. */
  var CLUSTERS = ['pr', 'br', 'tr', 'dr', 'cr', 'gr', 'fr',
                  'pl', 'bl', 'cl', 'gl', 'fl',
                  'ch', 'll', 'rr'];

  function syllables(word) {
    var w = String(word || '').toLowerCase().trim();
    if (!w) return [];

    /* Group the letters into vowel nuclei and consonant runs first, treating a
     * diphthong (two vowels where at least one is weak and unaccented) as one
     * nucleus. */
    var units = [];
    var i = 0;
    while (i < w.length) {
      if (isVowel(w[i])) {
        var v = w[i++];
        while (i < w.length && isVowel(w[i])) {
          var a = v[v.length - 1], b = w[i];
          // Two strong vowels are two syllables; an accented weak vowel breaks
          // the diphthong too: "día" is di-a, "hacia" is ha-cia.
          if (isStrong(a) && isStrong(b)) break;
          if ('íúÍÚ'.indexOf(a) !== -1 || 'íúÍÚ'.indexOf(b) !== -1) break;
          v += w[i++];
        }
        units.push({ v: true, s: v });
      } else {
        var c = w[i++];
        while (i < w.length && !isVowel(w[i])) c += w[i++];
        units.push({ v: false, s: c });
      }
    }

    var out = [];
    var cur = '';
    var curHasVowel = false;

    for (var u = 0; u < units.length; u++) {
      var unit = units[u];

      if (unit.v) {
        // Two nuclei in a row means a hiatus — the vowel grouper already
        // decided they do not belong together, so "día" is dí-a and not one
        // syllable pretending to be a diphthong.
        if (curHasVowel) { out.push(cur); cur = ''; }
        cur += unit.s;
        curHasVowel = true;
        continue;
      }

      var cons = unit.s;
      if (u === units.length - 1) { cur += cons; continue; }   // trailing consonants stay put

      var onset;
      if (cons.length === 1) onset = cons;
      else {
        var two = cons.slice(-2);
        onset = CLUSTERS.indexOf(two) !== -1 ? two : cons.slice(-1);
      }
      var coda = cons.slice(0, cons.length - onset.length);
      cur += coda;
      if (curHasVowel) { out.push(cur); cur = onset; curHasVowel = false; }
      else cur += onset;   // still no vowel: keep gathering, as in "ps-icología"
    }
    if (cur) out.push(cur);

    /* A piece with no vowel in it is not a syllable. "psicología" starts with
     * a consonant cluster Spanish does not otherwise allow, and it belongs to
     * the syllable that follows it, not to one of its own. */
    var fixed = [];
    for (var k = 0; k < out.length; k++) {
      var piece = out[k];
      var hasV = /[aeiouáéíóúü]/.test(piece);
      if (!hasV && k + 1 < out.length) { out[k + 1] = piece + out[k + 1]; continue; }
      if (!hasV && fixed.length) { fixed[fixed.length - 1] += piece; continue; }
      fixed.push(piece);
    }
    return fixed.filter(Boolean);
  }

  /* ── Stress ───────────────────────────────────────────────
   * An accent mark settles it. Otherwise: a word ending in a vowel, n or s is
   * stressed on the second-last syllable; anything else on the last. Two rules
   * and one exception marker cover the entire language. */
  function stress(word) {
    var syl = syllables(word);
    if (!syl.length) return { index: -1, syllables: syl, marked: false };

    for (var i = 0; i < syl.length; i++) {
      if (/[áéíóú]/.test(syl[i])) return { index: i, syllables: syl, marked: true };
    }
    var w = String(word || '').toLowerCase().trim();
    var lastCh = w[w.length - 1];
    var idx = (isVowel(lastCh) || lastCh === 'n' || lastCh === 's')
      ? Math.max(0, syl.length - 2)
      : syl.length - 1;
    return { index: idx, syllables: syl, marked: false };
  }

  /* Syllables with the stressed one marked, for showing someone where to push. */
  function stressed(word) {
    var s = stress(word);
    return s.syllables.map(function (x, i) {
      return { text: x, stressed: i === s.index };
    });
  }

  /* ── Comparing what you said with what you meant ──────────
   * Levenshtein over phonemes, with the edits kept. The edits are the
   * diagnosis: a substitution of ɾ for r is not "wrong", it is a tap where a
   * trill belongs, and that has a fix you can practise. */
  function align(a, b) {
    var n = a.length, m = b.length;
    var d = [], bt = [];
    for (var i = 0; i <= n; i++) {
      d[i] = [i]; bt[i] = ['up'];
    }
    for (var j = 0; j <= m; j++) { d[0][j] = j; bt[0][j] = 'left'; }
    bt[0][0] = null;

    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        var sub = d[i - 1][j - 1] + cost;
        var del = d[i - 1][j] + 1;
        var ins = d[i][j - 1] + 1;
        var best = Math.min(sub, del, ins);
        d[i][j] = best;
        bt[i][j] = best === sub ? 'diag' : (best === del ? 'up' : 'left');
      }
    }

    var edits = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      var mv = bt[i][j];
      if (mv === 'diag') {
        if (a[i - 1] !== b[j - 1]) edits.unshift({ kind: 'sub', want: a[i - 1], got: b[j - 1], at: i - 1 });
        i--; j--;
      } else if (mv === 'up') {
        edits.unshift({ kind: 'drop', want: a[i - 1], got: null, at: i - 1 });
        i--;
      } else {
        edits.unshift({ kind: 'add', want: null, got: b[j - 1], at: i });
        j--;
      }
    }
    return { distance: d[n][m], edits: edits };
  }

  /* Which named sound problem does this edit correspond to? The table is what
   * turns an alignment into advice. */
  var SUB_TO_SOUND = {
    'r>ɾ': 'rr', 'r>ɽ': 'rr', 'r>l': 'rr', 'r>d': 'rr',
    'ɾ>r': 'r', 'ɾ>d': 'r', 'ɾ>l': 'r', 'ɾ>ɹ': 'r',
    'x>h': 'j', 'x>k': 'j', 'x>g': 'j',
    'ɲ>n': 'n-tilde', 'ɲ>nj': 'n-tilde',
    'β>v': 'b-v', 'b>v': 'b-v', 'β>b': 'b-v',
    'ð>d': 'd', 'd>ð': 'd',
    'ʝ>j': 'll', 'ʝ>dʒ': 'll', 'ʝ>l': 'll',
    's>z': 's', 'θ>s': 's', 's>θ': 's',
    'ɣ>g': 'g',
    'tʃ>ʃ': 'ch', 'x>tʃ': 'j', 'ð>t': 'd', 'd>t': 'd', 'ɾ>t': 'r',
    'β>p': 'b-v', 'b>p': 'b-v', 'ɣ>k': 'g', 'g>k': 'g'
  };

  var VOWEL_SET = { a: 1, e: 1, i: 1, o: 1, u: 1 };

  function soundFor(edit) {
    if (edit.kind === 'sub') {
      var key = edit.want + '>' + edit.got;
      if (SUB_TO_SOUND[key]) return SUB_TO_SOUND[key];
      if (VOWEL_SET[edit.want] && VOWEL_SET[edit.got]) return 'vowels';
      return null;
    }
    if (edit.kind === 'drop' && edit.want === 'ɾ') return 'r';
    if (edit.kind === 'drop' && edit.want === 'r') return 'rr';
    // The h is silent in Spanish, so a dropped /x/ is almost always someone
    // giving "jamón" an English h.
    if (edit.kind === 'drop' && edit.want === 'x') return 'j';
    if (edit.kind === 'drop' && edit.want === 'ɲ') return 'n-tilde';
    if (edit.kind === 'drop' && (edit.want === 'ð' || edit.want === 'β')) return edit.want === 'ð' ? 'd' : 'b-v';
    if (edit.kind === 'drop' && VOWEL_SET[edit.want]) return 'vowels';
    return null;
  }

  /* The whole comparison, in the shape a screen wants to render. */
  function compare(said, heard) {
    var want = phonemes(said);
    var got = phonemes(heard);
    var a = align(want, got);
    var problems = [];
    var seen = {};

    a.edits.forEach(function (e) {
      var id = soundFor(e);
      if (!id || seen[id]) return;
      seen[id] = 1;
      problems.push({ sound: id, want: e.want, got: e.got, kind: e.kind });
    });

    // How close, as a fraction of the longer word — a single tap wrong in a
    // long word is not the same as half the word being wrong.
    var score = want.length || got.length
      ? 1 - a.distance / Math.max(want.length, got.length)
      : 0;

    return {
      wantIpa: want.join(''), gotIpa: got.join(''),
      distance: a.distance, score: Math.max(0, score),
      exact: a.distance === 0,
      edits: a.edits, problems: problems
    };
  }

  /* Which of the tricky sounds does this word contain? Used to pick practice
   * words for a sound, and to know what a word is a test of. */
  var SOUND_TEST = {
    rr:         function (w, p) { return /rr/.test(w) || /^r/.test(w); },
    r:          function (w, p) { return p.indexOf('ɾ') !== -1; },
    j:          function (w, p) { return p.indexOf('x') !== -1; },
    'n-tilde':  function (w) { return /ñ/.test(w); },
    // Any b or v: the hard and soft versions are the same lesson, and "bueno"
    // is a b word even though its b is the hard one.
    'b-v':      function (w) { return /[bv]/.test(w); },
    d:          function (w, p) { return p.indexOf('ð') !== -1; },
    ll:         function (w, p) { return p.indexOf('ʝ') !== -1; },
    ch:         function (w, p) { return p.indexOf('tʃ') !== -1; },
    g:          function (w, p) { return p.indexOf('ɣ') !== -1; },
    vowels:     function () { return true; },
    h:          function (w) { return /h/.test(w); },
    stress:     function (w) { return syllables(w).length > 1; }
  };

  function soundsIn(word) {
    var w = String(word || '').toLowerCase();
    var p = phonemes(w);
    var out = [];
    Object.keys(SOUND_TEST).forEach(function (id) {
      if (id === 'vowels' || id === 'stress') return;
      if (SOUND_TEST[id](w, p)) out.push(id);
    });
    return out;
  }

  function hasSound(word, id) {
    var w = String(word || '').toLowerCase();
    return SOUND_TEST[id] ? !!SOUND_TEST[id](w, phonemes(w)) : false;
  }

  PARLA.phon = {
    dialect: dialect,
    phonemes: phonemes,
    ipa: ipa,
    syllables: syllables,
    stress: stress,
    stressed: stressed,
    align: align,
    compare: compare,
    soundsIn: soundsIn,
    hasSound: hasSound
  };
})();
