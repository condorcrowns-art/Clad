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
        // Ollama on the desktop, where localhost is reachable. A phone loading
        // this over https cannot reach any localhost - that is mixed content,
        // and no setting changes it - so there it uses the site's own AI,
        // which runs on Cloudflare's edge. See DEPLOY.md.
        brain: (typeof location !== 'undefined' &&
                location.protocol === 'https:' &&
                location.hostname !== 'localhost' &&
                location.hostname !== '127.0.0.1')
                 ? 'hosted' : 'ollama',   // scripted | ollama | gemini | hosted
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
      // Vosotros is Spain-only. The conjugation drill skips it unless this is
      // on; the tables on the Ask and Verbs screens always show all six.
      drillVosotros: false,
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
      // What has been read, and how the comprehension questions went.
      // id -> { read: ms, right: n, asked: n }
      reading: {},
      srs: {},                // word -> { ease, interval, due, reps, lapses }
      mistakes: [],           // { es, fix, note, topic, when, times, scenario }
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
  function addWord(es, en, exEs, exEn) {
    es = String(es || '').trim();
    if (!es) return false;
    state.phrases = state.phrases || [];
    var key = es.toLowerCase();
    if (state.phrases.some(function (p) { return String(p.es).toLowerCase() === key; })) return false;
    state.phrases.unshift({
      es: es,
      en: String(en || '').trim(),
      // The sentence it actually appeared in. Authentic context beats anything
      // a corpus author invents, and it is what the fill-in-the-gap drill uses.
      exEs: String(exEs || '').trim(),
      exEn: String(exEn || '').trim(),
      when: Date.now()
    });
    if (state.phrases.length > 2000) state.phrases.length = 2000;
    save();
    return true;
  }

  function rememberPhrase(es, en) { return addWord(es, en, '', ''); }

  /* Finishing a text. The score is kept so the list can show which ones were
   * understood and which were only got through. */
  function markRead(id, right, asked) {
    var r = state.reading || (state.reading = {});
    var was = r[id] || {};
    r[id] = {
      read: Date.now(),
      right: Math.max(was.right || 0, right || 0),
      asked: asked || was.asked || 0
    };
    save();
    return r[id];
  }

  /* ── Mistakes ─────────────────────────────────────────────
   * A correction used to be written to a journal that nothing ever read again,
   * which made the most valuable thing the app collects the one thing it threw
   * away. Every mistake now goes into the same spaced-repetition schedule as
   * vocabulary: the sentence you got wrong comes back tomorrow, and again in
   * four days if you fix it, and again tomorrow if you do not.
   */
  function mistakeKey(m) {
    return 'fix:' + String(m.es || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function rememberMistake(m) {
    if (!m || !m.es) return false;
    state.mistakes = state.mistakes || [];
    var key = mistakeKey(m);

    var existing = state.mistakes.filter(function (x) { return mistakeKey(x) === key; })[0];
    if (existing) {
      // Making the same mistake twice is worth knowing about: it moves up the
      // queue rather than being filed a second time.
      existing.times = (existing.times || 1) + 1;
      existing.when = Date.now();
      if (m.topic) existing.topic = m.topic;
      state.mistakes = [existing].concat(state.mistakes.filter(function (x) {
        return mistakeKey(x) !== key;
      }));
    } else {
      state.mistakes.unshift({
        es: m.es, fix: m.fix || '', note: m.note || '', topic: m.topic || null,
        scenario: m.scenario || null, from: m.from || 'conversation',
        when: Date.now(), times: 1
      });
    }
    state.mistakes = state.mistakes.slice(0, 300);

    // Schedule it. A fresh card is due immediately, which is the point.
    state.srs = state.srs || {};
    if (!state.srs[key]) state.srs[key] = PARLA.srs.fresh ? PARLA.srs.fresh() : null;
    if (!state.srs[key]) {
      state.srs[key] = { reps: 0, interval: 0, ease: 2.3, due: Date.now(), lapses: 0 };
    } else {
      // Seen again in the wild: it is due now regardless of what it was.
      state.srs[key].due = Date.now();
      state.srs[key].lapses = (state.srs[key].lapses || 0) + 1;
    }
    save();
    return true;
  }

  /* The mistakes that are due to be looked at again. */
  function dueMistakes(limit) {
    var now = Date.now();
    return (state.mistakes || [])
      .filter(function (m) {
        var c = state.srs[mistakeKey(m)];
        return m.fix && (!c || !c.due || c.due <= now);
      })
      .slice(0, limit || 20);
  }

  function gradeMistake(m, ok) {
    var key = mistakeKey(m);
    state.srs[key] = PARLA.srs.grade(state.srs[key], ok ? 4 : 1);
    state.progress.totals.reviews++;
    save();
  }

  /* Finishing a text by ear. Kept apart from the reading score because
   * understanding a text you only heard is a different result from
   * understanding one you could look at. */
  function markHeard(id, right, asked, caught) {
    var r = state.reading || (state.reading = {});
    var was = r[id] || {};
    was.heard = Date.now();
    was.heardRight = Math.max(was.heardRight || 0, right || 0);
    was.heardAsked = asked || was.heardAsked || 0;
    was.caught = Math.max(was.caught || 0, caught || 0);
    r[id] = was;
    save();
    return was;
  }

  /* ── Bringing another device's progress in ────────────────
   *
   * Everything lives in this browser's localStorage, which means two things
   * that both cost a learner real work: clear the site data and a sixty-day
   * streak is gone, and the phone and the computer keep separate decks that
   * never meet. Export already existed; import replaced everything it
   * touched, so bringing the phone's save to the computer destroyed the
   * computer's.
   *
   * This merges instead. The rule throughout is that neither side loses:
   * take the union of the things you have collected, and where the same
   * thing exists on both, keep whichever record represents more work. It is
   * deliberately conservative about the counters — a session practised on one
   * device and synced to the other is one session, and adding the two totals
   * together would invent XP nobody earned.
   */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  }

  /* Which of two spaced-repetition cards is further along. Reps first,
   * because that is the count of times it was actually recalled. */
  function betterCard(a, b) {
    if (!a) return b;
    if (!b) return a;
    if ((a.reps || 0) !== (b.reps || 0)) return (a.reps || 0) > (b.reps || 0) ? a : b;
    if ((a.interval || 0) !== (b.interval || 0)) return (a.interval || 0) > (b.interval || 0) ? a : b;
    // Same ladder on both: take the earlier due date, so nothing is skipped
    // by the merge.
    return (a.due || 0) <= (b.due || 0) ? a : b;
  }

  function mergeJSON(text) {
    var incoming = typeof text === 'string' ? JSON.parse(text) : text;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
      throw new Error('not a Parla save');
    }
    // A file with none of these is not a save, and importing it would quietly
    // do nothing while reporting success.
    if (!incoming.progress && !incoming.srs && !incoming.phrases) {
      throw new Error('not a Parla save');
    }
    var got = { words: 0, mistakes: 0, cards: 0, texts: 0, days: 0, sessions: 0 };

    /* — words you reached for — */
    var have = {};
    (state.phrases || []).forEach(function (p) { have[norm(p.es)] = 1; });
    (incoming.phrases || []).forEach(function (p) {
      if (!p || !p.es || have[norm(p.es)]) return;
      have[norm(p.es)] = 1;
      state.phrases.push(p);
      got.words++;
    });
    state.phrases.sort(function (a, b) { return (b.when || 0) - (a.when || 0); });
    if (state.phrases.length > 2000) state.phrases.length = 2000;

    /* — mistakes, and the schedules behind them — */
    var seen = {};
    (state.mistakes || []).forEach(function (m) { seen[mistakeKey(m)] = m; });
    (incoming.mistakes || []).forEach(function (m) {
      if (!m || !m.es) return;
      var k = mistakeKey(m);
      if (seen[k]) {
        seen[k].times = Math.max(seen[k].times || 1, m.times || 1);
        return;
      }
      seen[k] = m;
      state.mistakes.push(m);
      got.mistakes++;
    });

    Object.keys(incoming.srs || {}).forEach(function (k) {
      var mine = state.srs[k], theirs = incoming.srs[k];
      if (!theirs || typeof theirs !== 'object') return;
      if (!mine) got.cards++;
      state.srs[k] = betterCard(mine, theirs);
    });

    /* — what has been read — */
    state.reading = state.reading || {};
    Object.keys(incoming.reading || {}).forEach(function (id) {
      var t = incoming.reading[id], mine = state.reading[id];
      if (!t) return;
      if (!mine) got.texts++;
      var out = {};
      ['read', 'right', 'asked', 'heard', 'heardRight', 'heardAsked', 'caught']
        .forEach(function (k) {
          var v = Math.max((mine && mine[k]) || 0, t[k] || 0);
          if (v) out[k] = v;
        });
      state.reading[id] = out;
    });

    /* — per-sound and per-lesson scores: keep whichever was practised more — */
    ['sounds', 'grammar'].forEach(function (bucket) {
      state[bucket] = state[bucket] || {};
      Object.keys(incoming[bucket] || {}).forEach(function (id) {
        var t = incoming[bucket][id], mine = state[bucket][id];
        if (!t) return;
        if (!mine || (t.tries || 0) > (mine.tries || 0)) state[bucket][id] = t;
      });
    });

    /* — the counters — */
    var p = state.progress, q = incoming.progress || {};
    ['xp', 'streak', 'bestStreak', 'challengeDay'].forEach(function (k) {
      p[k] = Math.max(p[k] || 0, q[k] || 0);
    });
    if ((q.lastDay || '') > (p.lastDay || '')) p.lastDay = q.lastDay;
    var doneWas = (p.challengeDone || []).length;
    var days = {};
    (p.challengeDone || []).concat(q.challengeDone || []).forEach(function (d) { days[d] = 1; });
    p.challengeDone = Object.keys(days).map(Number).sort(function (a, b) { return a - b; });
    got.days = p.challengeDone.length - doneWas;
    Object.keys(p.totals).forEach(function (k) {
      // Max, not sum: the same session synced both ways is one session.
      p.totals[k] = Math.max(p.totals[k] || 0, (q.totals || {})[k] || 0);
    });

    /* — sessions — */
    var when = {};
    (state.history || []).forEach(function (h) { when[h.when] = 1; });
    (incoming.history || []).forEach(function (h) {
      if (!h || when[h.when]) return;
      when[h.when] = 1;
      state.history.push(h);
      got.sessions++;
    });
    state.history.sort(function (a, b) { return (b.when || 0) - (a.when || 0); });
    if (state.history.length > 500) state.history.length = 500;

    /* — what the partner knows about you — */
    if (!state.memory.name && incoming.memory && incoming.memory.name) {
      state.memory.name = incoming.memory.name;
    }
    var facts = {};
    state.memory.facts.forEach(function (f) { facts[norm(f)] = 1; });
    ((incoming.memory || {}).facts || []).forEach(function (f) {
      if (!f || facts[norm(f)]) return;
      facts[norm(f)] = 1;
      state.memory.facts.push(f);
    });
    if (state.memory.facts.length > 40) state.memory.facts.length = 40;

    // Settings stay this device's own. The microphone pause and the voice that
    // sound right on a laptop are not the ones that sound right on a phone.
    if (!state.profile.name && incoming.profile && incoming.profile.name) {
      state.profile.name = incoming.profile.name;
    }

    save();
    return got;
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
    rememberMistake: rememberMistake,
    dueMistakes: dueMistakes,
    gradeMistake: gradeMistake,
    mistakeKey: mistakeKey,
    rememberPhrase: rememberPhrase,
    addWord: addWord,
    markRead: markRead,
    markHeard: markHeard,
    mergeJSON: mergeJSON,
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
