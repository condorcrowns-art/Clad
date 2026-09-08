/* Parla — the dictionary
 *
 * 31,000 Spanish headwords with meanings, gender, register and a frequency
 * band, built from open Wiktionary and subtitle-corpus data by
 * tools/build-dict.js. It is a megabyte and a half of JSON, so it is not part
 * of the page: it is fetched the first time something actually needs it and
 * then cached by the service worker, which means the second visit — and every
 * offline one — has it instantly.
 *
 * Nothing here talks to a model. A word's meaning, its gender, whether it is
 * vulgar and where it is said are all facts, and facts should not cost a round
 * trip to someone's GPU.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var URL_ = 'js/data/dict-es.json';

  var state = {
    loading: null,
    loaded: false,
    failed: null,
    rows: [],
    ranked: 0,
    byTerm: null,       // exact, lower-cased
    byFold: null,       // accent- and case-insensitive; may hold several
    verbs: null,        // Set of infinitives, for the morphology engine
    verbFold: null      // the same, accent-blind
  };

  function fold(w) {
    return String(w || '').toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* A row is [term, pos, gender, glosses, register, region]. Turned into an
   * object only when someone asks for one - 31,000 objects up front would cost
   * more memory than the whole file. */
  function entry(row, i) {
    if (!row) return null;
    return {
      term: row[0],
      pos: row[1],
      gender: row[2] || null,
      glosses: row[3].split(' | '),
      en: row[3].split(' | ')[0],
      register: row[4] || null,
      region: row[5] || null,
      band: i < state.ranked ? i + 1 : 0,
      source: 'dict'
    };
  }

  function index() {
    state.byTerm = new Map();
    state.byFold = new Map();
    state.verbs = new Set();
    state.verbFold = new Map();
    for (var i = 0; i < state.rows.length; i++) {
      var row = state.rows[i];
      var key = row[0].toLowerCase();
      if (!state.byTerm.has(key)) state.byTerm.set(key, i);
      var f = fold(row[0]);
      if (f) {
        var bucket = state.byFold.get(f);
        if (!bucket) state.byFold.set(f, [i]);
        else if (bucket.length < 4) bucket.push(i);
      }
      if (row[1] === 'v') {
        state.verbs.add(row[0].toLowerCase());
        // Accent-blind too: a stripped ending leaves "sonrei", and the verb is
        // spelt "sonreír".
        if (!state.verbFold.has(f)) state.verbFold.set(f, row[0].toLowerCase());
      }
    }
  }

  /* Fetch once. Concurrent callers share the same promise; a failure is
   * remembered so a page with no network does not retry on every keystroke. */
  function load() {
    if (state.loaded) return Promise.resolve(true);
    if (state.loading) return state.loading;
    state.loading = fetch(URL_, { cache: 'force-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        state.rows = d.rows || [];
        state.ranked = d.ranked || state.rows.length;
        index();
        state.loaded = true;
        state.loading = null;
        return true;
      })
      .catch(function (e) {
        state.failed = e.message || String(e);
        state.loading = null;
        return false;
      });
    return state.loading;
  }

  function ready() { return state.loaded; }
  function size() { return state.rows.length; }
  function rankedCount() { return state.ranked; }
  function failure() { return state.failed; }

  /* Exact first, then accent-blind. "el agua" also finds "agua", because that
   * is what someone types when they copy a word out of a sentence. */
  function get(term) {
    if (!state.loaded || !term) return null;
    var t = String(term).trim().toLowerCase();
    if (state.byTerm.has(t)) return entry(state.rows[state.byTerm.get(t)], state.byTerm.get(t));
    var bare = t.replace(/^(el|la|los|las|un|una|unos|unas)\s+/, '');
    if (bare !== t && state.byTerm.has(bare)) {
      return entry(state.rows[state.byTerm.get(bare)], state.byTerm.get(bare));
    }
    var bucket = state.byFold.get(fold(bare));
    if (bucket && bucket.length) return entry(state.rows[bucket[0]], bucket[0]);
    return null;
  }

  function all(term) {
    if (!state.loaded || !term) return [];
    var bucket = state.byFold.get(fold(String(term).replace(/^(el|la|los|las)\s+/, ''))) || [];
    return bucket.map(function (i) { return entry(state.rows[i], i); });
  }

  function isVerb(inf) {
    return !!(state.loaded && state.verbs.has(String(inf || '').toLowerCase()));
  }

  /* The verb this spelling means, accents forgiven: "sonreir" -> "sonreír". */
  function verbFor(inf) {
    if (!state.loaded || !inf) return null;
    var t = String(inf).toLowerCase();
    if (state.verbs.has(t)) return t;
    return state.verbFold.get(fold(t)) || null;
  }

  /* Browsing and searching.
   *   q       matches the Spanish word, or the English meaning
   *   pos     'n' | 'v' | 'adj' | ...
   *   band    [from, to] over the frequency ranking, 1-based
   *   limit   how many to return
   * Results come back commonest-first, which is also most-useful-first. */
  function search(opts) {
    if (!state.loaded) return [];
    opts = opts || {};
    var q = fold(opts.q || '');
    var limit = opts.limit || 60;
    var from = opts.band ? opts.band[0] : 0;
    var to = opts.band ? opts.band[1] : 0;
    var out = [], exact = [], starts = [], inside = [], english = [];

    for (var i = 0; i < state.rows.length && exact.length + starts.length < limit; i++) {
      var row = state.rows[i];
      if (opts.pos && row[1] !== opts.pos) continue;
      if (from && (i + 1 < from || i + 1 > to)) continue;
      if (!q) { out.push(i); if (out.length >= limit) break; continue; }
      var f = fold(row[0]);
      if (f === q) exact.push(i);
      else if (f.indexOf(q) === 0) starts.push(i);
      else if (inside.length < limit && f.indexOf(q) > 0) inside.push(i);
      else if (english.length < limit && fold(row[3]).indexOf(q) >= 0) english.push(i);
    }
    var order = q ? exact.concat(starts, inside, english) : out;
    return order.slice(0, limit).map(function (i) { return entry(state.rows[i], i); });
  }

  /* n words from a frequency band, for study lists. */
  function band(from, to, limit) {
    if (!state.loaded) return [];
    var out = [];
    var hi = Math.min(to, state.ranked);
    for (var i = from - 1; i < hi && out.length < (limit || 50); i++) {
      // Phrases and proper nouns are not what someone means by "the top 500
      // words", so a band is single words only.
      if (state.rows[i] && !state.rows[i][0].includes(' ') && state.rows[i][1] !== 'prop') {
        out.push(entry(state.rows[i], i));
      }
    }
    return out;
  }

  /* How much of the commonest N words does this deck cover? The one progress
   * number that means something in a language. */
  function coverage(known, upTo) {
    if (!state.loaded) return null;
    var hi = Math.min(upTo || 1000, state.ranked);
    var total = 0, have = 0;
    for (var i = 0; i < hi; i++) {
      var row = state.rows[i];
      if (!row || row[0].includes(' ') || row[1] === 'prop') continue;
      total++;
      if (known(row[0])) have++;
    }
    return { have: have, total: total, pct: total ? Math.round(have * 100 / total) : 0 };
  }

  PARLA.dict = {
    load: load, ready: ready, size: size, ranked: rankedCount, failure: failure,
    get: get, all: all, isVerb: isVerb, verbFor: verbFor, search: search, band: band,
    coverage: coverage, fold: fold,
    url: URL_
  };
})();
