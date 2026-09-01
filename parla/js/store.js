/* Parla — persistence
 *
 * Everything lives in localStorage under one key. No account, no server, no
 * telemetry: your progress never leaves your machine. Export/import exists so
 * you can move it between browsers yourself.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var KEY = 'parla.save.v1';
  var SCHEMA = 1;

  function defaults() {
    return {
      schema: SCHEMA,
      profile: {
        name: '',
        created: 0,
        avatar: '#e8734a',
        target: 'es',         // target language
        level: 'a1',          // self-declared starting level
        dailyGoal: 1          // sessions per day
      },
      settings: {
        // Default to a real AI partner. If Ollama is not there, the app detects
        // that at boot, says so, and falls back to the scripted engine.
        brain: 'ollama',      // scripted | ollama | gemini
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: '',      // empty = auto-pick the best model installed
        geminiKey: '',
        geminiModel: 'gemini-2.5-flash-lite',
        voiceURI: '',         // chosen TTS voice
        // Which installed neural voice plays female and male characters. A
        // barista called Marta speaking in a baritone is the kind of detail
        // that quietly tells you nobody was paying attention.
        voiceRoles: { f: '', m: '' },
        // Global voice-age dial: everything shifts with it, and each character
        // still sits younger or older than everyone else within that.
        voicePitch: 1.0,
        rate: 0.9,            // TTS speed
        autoListen: true,     // reopen the mic after the partner replies
        // How long a silence ends your turn. Beginners hesitate mid-sentence,
        // and cutting them off there is what made the partner answer
        // half-sentences as if they were finished ones.
        micPauseMs: 1600,
        showTranslations: true,
        correctionStyle: 'gentle', // gentle | strict | off
        theme: 'auto'
      },
      progress: {
        xp: 0,
        streak: 0,
        bestStreak: 0,
        lastDay: '',          // YYYY-MM-DD of last completed session
        challengeDay: 0,      // index into the 60-day plan
        challengeDone: [],    // completed day indices
        totals: {
          sessions: 0, turns: 0, words: 0, minutes: 0,
          corrections: 0, reviews: 0, conjugations: 0
        }
      },
      // What the partner knows about you, carried between sessions. Telling it
      // your name on Monday and being asked again on Tuesday is the fastest way
      // to make a conversation partner feel like a machine.
      memory: {
        name: '',             // extracted deterministically, so it survives model failures
        facts: []             // short English statements: "They are from Chicago"
      },
      srs: {},                // word -> { ease, interval, due, reps, lapses }
      mistakes: [],           // { es, fix, note, when, scenario }
      phrases: [],            // { es, en, when } - phrases you reached for and could not say
      history: []             // { when, scenarioId, turns, xp }
    };
  }

  var state = null;

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* Deep-merge saved data over defaults so new fields appear for old saves. */
  function merge(base, saved) {
    if (!saved || typeof saved !== 'object') return base;
    Object.keys(saved).forEach(function (k) {
      var b = base[k], s = saved[k];
      if (b && typeof b === 'object' && !Array.isArray(b) &&
          s && typeof s === 'object' && !Array.isArray(s)) {
        merge(b, s);
      } else if (s !== undefined) {
        base[k] = s;
      }
    });
    return base;
  }

  function load() {
    var base = defaults();
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) merge(base, JSON.parse(raw));
    } catch (e) {
      // Corrupt or unavailable storage (private mode, cleared data) — start fresh
      // rather than leaving the app in a broken state.
      console.warn('Parla: could not read save, starting fresh.', e);
    }
    state = base;
    return state;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Parla: could not write save.', e);
      return false;
    }
  }

  /* Facts are short English sentences the partner wrote about you. Kept few and
   * recent: a long list crowds the prompt and small models start ignoring all
   * of it. Newest wins on a near-duplicate, so "They live in Chicago" replaces
   * an older "They are from Chicago" instead of stacking beside it. */
  var MAX_FACTS = 14;

  /* The thing a fact is ABOUT, when it is about one thing: "their name",
   * "their job". Used to recognise a revision rather than a new fact.
   *
   * A first attempt compared the first three words, which quietly merged
   * "They like the beach" into "They like the mountains" and lost one of them.
   * So the subject has to be a named attribute - a bare pronoun ("they are...")
   * is far too broad to treat two statements as the same one.
   */
  function factSubject(normalised) {
    var m = String(normalised || '').match(/^(.+?)\s+(?:is|are|was|were|lives|live|works|work)\b/);
    if (!m) return '';
    var subject = m[1].trim();
    return subject.split(' ').length >= 2 ? subject : '';
  }


  function remember(facts) {
    if (!facts || !facts.length) return false;
    var mem = state.memory || (state.memory = { name: '', facts: [] });
    var changed = false;

    facts.forEach(function (f) {
      var text = String(f || '').trim().replace(/\s+/g, ' ');
      if (!text || text.length > 120) return;
      var key = text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      var subject = factSubject(key);
      var dup = mem.facts.filter(function (existing) {
        var k = String(existing.text || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
        if (k === key) return true;
        // Same subject, new value: "their name is x" becomes "their name is y".
        return subject && factSubject(k) === subject;
      })[0];
      if (dup) {
        if (dup.text === text) return;
        dup.text = text;
        dup.when = Date.now();
      } else {
        mem.facts.push({ text: text, when: Date.now() });
      }
      changed = true;
    });

    if (mem.facts.length > MAX_FACTS) {
      mem.facts.sort(function (a, b) { return (b.when || 0) - (a.when || 0); });
      mem.facts = mem.facts.slice(0, MAX_FACTS);
    }
    if (changed) save();
    return changed;
  }

  /* A phrase the learner reached for and could not produce is the single best
   * candidate for review there is - better than any word chosen for them by a
   * frequency list, because they have already demonstrated they wanted it. */
  function rememberPhrase(es, en) {
    es = String(es || '').trim();
    if (!es) return false;
    state.phrases = state.phrases || [];
    var key = es.toLowerCase();
    if (state.phrases.some(function (p) { return String(p.es).toLowerCase() === key; })) return false;
    state.phrases.unshift({ es: es, en: String(en || '').trim(), when: Date.now() });
    if (state.phrases.length > 200) state.phrases.length = 200;
    save();
    return true;
  }

  function forgetAll() {
    state.memory = { name: '', facts: [] };
    save();
  }

  /* Record that a practice session happened today: streak + XP bookkeeping. */
  function creditDay(xp) {
    var p = state.progress;
    var t = today();
    if (p.lastDay !== t) {
      var y = new Date();
      y.setDate(y.getDate() - 1);
      var yesterday = y.getFullYear() + '-' +
        String(y.getMonth() + 1).padStart(2, '0') + '-' +
        String(y.getDate()).padStart(2, '0');
      p.streak = (p.lastDay === yesterday) ? p.streak + 1 : 1;
      if (p.streak > p.bestStreak) p.bestStreak = p.streak;
      p.lastDay = t;
    }
    p.xp += xp || 0;
    save();
  }

  function level() {
    // 100 XP for level 2, growing gently: level n needs 50*n*(n-1) total.
    var xp = state.progress.xp, n = 1;
    while (50 * (n + 1) * n <= xp) n++;
    return n;
  }

  function levelProgress() {
    var xp = state.progress.xp, n = level();
    var floor = 50 * n * (n - 1), ceil = 50 * (n + 1) * n;
    return { level: n, into: xp - floor, need: ceil - floor };
  }

  PARLA.store = {
    load: load,
    save: save,
    get state() { return state; },
    today: today,
    creditDay: creditDay,
    remember: remember,
    rememberPhrase: rememberPhrase,
    forgetAll: forgetAll,
    level: level,
    levelProgress: levelProgress,
    reset: function () { state = defaults(); save(); },
    exportJSON: function () { return JSON.stringify(state, null, 2); },
    importJSON: function (text) {
      var parsed = JSON.parse(text);
      state = merge(defaults(), parsed);
      save();
      return state;
    },
    _defaults: defaults
  };
})();
