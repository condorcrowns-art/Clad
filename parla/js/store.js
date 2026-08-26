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
        brain: 'scripted',    // scripted | ollama | gemini
        ollamaUrl: 'http://localhost:11434',
        ollamaModel: 'llama3.2',
        geminiKey: '',
        geminiModel: 'gemini-2.5-flash-lite',
        voiceURI: '',         // chosen TTS voice
        rate: 0.9,            // TTS speed
        autoListen: true,     // reopen the mic after the partner replies
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
      srs: {},                // word -> { ease, interval, due, reps, lapses }
      mistakes: [],           // { es, fix, note, when, scenario }
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
