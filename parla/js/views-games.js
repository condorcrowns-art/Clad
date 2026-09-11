/* Parla — study games
 *
 * Drills you will actually open when you have four minutes on a bus. They run
 * entirely in the page: no model, no microphone, no network, so they work
 * identically on a phone with the screen dimmed on a train as they do at a
 * desk. Every one of them feeds the same spaced-repetition deck as the review
 * screen, so playing is studying and not a detour from it.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  /* The pool every game draws from: the shipped corpus plus everything you
   * have picked up yourself, weighted towards what you are weakest on. */
  function pool(st, want) {
    var items = [];
    (PARLA.data.es.vocab || []).forEach(function (v) {
      if (v[1]) items.push({ es: v[0], en: v[1], ex: v[3] });
    });
    (st.phrases || []).forEach(function (p) {
      if (p.en) items.push({ es: p.es, en: p.en, ex: p.exEs || '', mine: true });
    });

    var deck = st.srs || {};
    var now = Date.now();
    items.forEach(function (it) {
      var c = deck[it.es];
      // Weakest first: never seen scores middling, lapsed scores high, and a
      // card you have nailed three times running scores near zero.
      it.weight = !c ? 5
        : (c.lapses || 0) * 6 + (c.due && c.due < now ? 4 : 0) + Math.max(0, 6 - (c.reps || 0));
      if (it.mine) it.weight += 4;
    });
    items.sort(function (a, b) { return (b.weight - a.weight) || (Math.random() - 0.5); });

    // Take from the weak end, then shuffle so the order is not predictable.
    var top = items.slice(0, Math.max(want * 4, 60));
    for (var i = top.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = top[i]; top[i] = top[j]; top[j] = t;
    }
    return top.slice(0, want);
  }

  function credit(st, key, right) {
    // Games grade gently: getting it right in a game is weaker evidence than
    // producing it cold in review, and getting it wrong under time pressure is
    // not the same as not knowing it.
    st.srs[key] = PARLA.srs.grade(st.srs[key], right ? 4 : 2);
    st.progress.totals.reviews++;
  }

  /* ── The menu ─────────────────────────────────────────────*/
  function viewGames() {
    init();
    var st = PARLA.store.state;
    var main = el('main');

    main.appendChild(el('h1', 'Games'));
    main.appendChild(el('p.muted',
      'Four minutes each, no microphone, no internet. Everything you play here ' +
      'feeds the same deck as Review — the words you keep missing come round more often.'));

    var games = [
      ['match',   '🃏', 'Pairs',        'Match Spanish to English against the clock.'],
      ['rush',    '⚡', 'Word rush',     'Sixty seconds. Pick the right meaning, keep the streak.'],
      ['gender',  '⚖️', 'El or la',     'Rapid fire. Only the article. Harder than it sounds.'],
      ['dictate', '👂', 'Dictation',    'Hear it, type it. The one that actually sticks.']
    ];

    var grid = el('div.grid.two', { style: { marginTop: '18px' } });
    games.forEach(function (g) {
      grid.appendChild(el('button.game-card', { onclick: function () { PARLA.app.go('game', { id: g[0] }); } },
        el('div.game-emoji', g[1]),
        el('div',
          el('div.game-name', g[2]),
          el('div.game-desc', g[3]))));
    });
    main.appendChild(grid);

    var best = st.gameBest || {};
    if (Object.keys(best).length) {
      main.appendChild(ui.sectionTitle('Best so far'));
      var row = el('div.grid.four');
      games.forEach(function (g) {
        if (best[g[0]] != null) row.appendChild(ui.stat(best[g[0]], g[2].toLowerCase()));
      });
      main.appendChild(row);
    }
    return main;
  }

  /* ── Shared scaffolding ───────────────────────────────────*/
  function shell(title, sub) {
    var main = el('main');
    var head = el('div.row', { style: { marginBottom: '10px' } },
      el('button.ghost', { onclick: function () { PARLA.app.go('games'); } }, '← Games'),
      el('div.spacer'));
    var score = el('span.chip.hot', '0');
    var timer = el('span.chip', '—');
    head.appendChild(timer);
    head.appendChild(score);
    main.appendChild(head);
    main.appendChild(el('h2', title));
    if (sub) main.appendChild(el('p.small.muted', sub));
    var body = el('div', { style: { marginTop: '14px' } });
    main.appendChild(body);
    return { main: main, body: body, score: score, timer: timer };
  }

  function finish(s, gameId, points, lines) {
    var st = PARLA.store.state;
    var best = st.gameBest || (st.gameBest = {});
    var record = points > (best[gameId] || 0);
    if (record) best[gameId] = points;
    PARLA.store.creditDay(Math.round(points / 4));
    PARLA.store.save();
    if (record && PARLA.decor) PARLA.decor.confetti(110);

    ui.clear(s.body);
    s.body.appendChild(el('div.card.center',
      el('div.game-final', String(points)),
      el('div.muted', record ? 'A new best.' : 'Best so far: ' + (best[gameId] || 0)),
      lines ? el('div.small.muted', { style: { marginTop: '8px' } }, lines) : null,
      el('div.btn-row', { style: { marginTop: '16px', justifyContent: 'center' } },
        el('button.primary', { onclick: function () { PARLA.app.go('game', { id: gameId }); } }, 'Again'),
        el('button', { onclick: function () { PARLA.app.go('games'); } }, 'Other games'))));
  }

  function countdown(s, seconds, onTick, onDone) {
    var left = seconds;
    s.timer.textContent = left + 's';
    var h = setInterval(function () {
      left--;
      s.timer.textContent = left + 's';
      s.timer.className = 'chip' + (left <= 10 ? ' bad-chip' : '');
      if (onTick) onTick(left);
      if (left <= 0) { clearInterval(h); onDone(); }
    }, 1000);
    return function () { clearInterval(h); };
  }

  /* ── Pairs ────────────────────────────────────────────────*/
  function gameMatch(s) {
    var st = PARLA.store.state;
    var words = pool(st, 8);
    var picked = null, matched = 0, moves = 0, stop = null;

    var tiles = [];
    words.forEach(function (w) {
      tiles.push({ key: w.es, face: w.es, side: 'es' });
      tiles.push({ key: w.es, face: w.en, side: 'en' });
    });
    for (var i = tiles.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = tiles[i]; tiles[i] = tiles[j]; tiles[j] = t;
    }

    var board = el('div.tile-grid');
    s.body.appendChild(board);

    tiles.forEach(function (t) {
      var b = el('button.tile' + (t.side === 'es' ? '.es' : ''), t.face);
      b.onclick = function () {
        if (b.classList.contains('gone') || b === picked) return;
        b.classList.add('picked');

        if (!picked) { picked = b; picked._t = t; return; }

        moves++;
        var ok = picked._t.key === t.key && picked._t.side !== t.side;
        credit(st, t.key, ok);

        if (ok) {
          picked.classList.add('gone'); b.classList.add('gone');
          picked.classList.remove('picked'); b.classList.remove('picked');
          picked = null;
          matched++;
          s.score.textContent = matched + '/' + words.length;
          if (matched === words.length) {
            if (stop) stop();
            // Fewer moves is better; a perfect run is one move per pair.
            finish(s, 'match', Math.max(10, 400 - (moves - words.length) * 15),
                   moves + ' moves for ' + words.length + ' pairs');
          }
        } else {
          var a = picked; picked = null;
          a.classList.add('wrong'); b.classList.add('wrong');
          setTimeout(function () {
            [a, b].forEach(function (x) { x.classList.remove('picked', 'wrong'); });
          }, 620);
        }
      };
      board.appendChild(b);
    });

    stop = countdown(s, 90, null, function () {
      finish(s, 'match', matched * 30, matched + ' of ' + words.length + ' pairs before time');
    });
    return stop;
  }

  /* ── Word rush and El-or-la share a question loop ─────────*/
  function quizLoop(s, opts) {
    var st = PARLA.store.state;
    var items = pool(st, 60);
    var i = 0, score = 0, streak = 0, best = 0, stop = null, locked = false;

    var qBox = el('div.quiz');
    s.body.appendChild(qBox);

    function next(skips) {
      locked = false;
      ui.clear(qBox);
      if (i >= items.length) i = 0;
      var it = items[i++];
      var q = opts.build(it, items);
      if (!q) {
        // Not every word can be asked every way - only nouns that carry their
        // article can be an el-or-la question. Walk on, but if a whole lap of
        // the pool yields nothing, say so rather than spinning forever.
        skips = (skips || 0) + 1;
        if (skips > items.length) {
          qBox.appendChild(el('div.card.center',
            el('p', 'Not enough words for this one yet.'),
            el('p.small.muted', 'Learn a few more nouns and come back.'),
            el('div.btn-row', { style: { justifyContent: 'center', marginTop: '12px' } },
              el('button.primary', { onclick: function () { PARLA.app.go('games'); } }, 'Other games'))));
          if (stop) stop();
          return;
        }
        next(skips);
        return;
      }

      qBox.appendChild(el('div.quiz-prompt' + (q.spanish ? '.es' : ''), q.prompt));
      if (q.hint) qBox.appendChild(el('div.small.muted', q.hint));

      var row = el('div.quiz-options');
      q.options.forEach(function (o) {
        var b = el('button.quiz-opt' + (q.optionsSpanish ? '.es' : ''), o);
        b.onclick = function () {
          if (locked) return;
          locked = true;
          var right = o === q.answer;
          credit(st, it.es, right);
          b.classList.add(right ? 'right' : 'wrong');
          if (!right) {
            [].forEach.call(row.children, function (x) {
              if (x.textContent === q.answer) x.classList.add('right');
            });
          }
          if (right) { streak++; if (streak > best) best = streak; score += 10 + Math.min(streak, 10) * 2; }
          else { streak = 0; score = Math.max(0, score - 5); }
          s.score.textContent = String(score);
          setTimeout(function () { next(); }, right ? 260 : 950);
        };
        row.appendChild(b);
      });
      qBox.appendChild(row);
      qBox.appendChild(el('div.small.faint.center', { style: { marginTop: '10px' } },
        streak >= 3 ? '🔥 ' + streak + ' in a row' : ''));
    }

    next();
    stop = countdown(s, opts.seconds || 60, null, function () {
      finish(s, opts.id, score, 'Best run: ' + best + ' in a row');
    });
    return stop;
  }

  function buildRush(it, all) {
    var wrong = [];
    var guard = 0;
    while (wrong.length < 3 && guard++ < 60) {
      var c = all[Math.floor(Math.random() * all.length)];
      if (c && c.en && c.en !== it.en && wrong.indexOf(c.en) === -1) wrong.push(c.en);
    }
    if (wrong.length < 3) return null;
    var options = wrong.concat([it.en]);
    for (var i = options.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = options[i]; options[i] = options[j]; options[j] = t;
    }
    return { prompt: it.es, spanish: true, options: options, answer: it.en };
  }

  function buildGender(it) {
    // Only nouns that carry their article in the corpus can be asked about.
    var m = /^(el|la|los|las)\s+(.+)$/i.exec(it.es);
    if (!m) return null;
    var art = m[1].toLowerCase();
    if (art !== 'el' && art !== 'la') return null;
    return {
      prompt: m[2], spanish: true, hint: it.en,
      options: ['el', 'la'], optionsSpanish: true, answer: art
    };
  }

  /* ── Dictation ────────────────────────────────────────────*/
  function gameDictate(s) {
    var st = PARLA.store.state;
    var items = pool(st, 20);
    var i = 0, score = 0, done = 0;

    var box = el('div.card.center');
    s.body.appendChild(box);

    function next() {
      ui.clear(box);
      if (i >= items.length) { finish(s, 'dictate', score, done + ' words'); return; }
      var it = items[i++];

      box.appendChild(el('div.game-emoji', '👂'));
      box.appendChild(el('div.small.muted', 'Type what you hear'));
      box.appendChild(el('div.btn-row', { style: { justifyContent: 'center', marginTop: '10px' } },
        el('button', { onclick: function () { ui.say(it.es); } }, '🔊 Again'),
        el('button', { onclick: function () {
          PARLA.speech.speak(it.es, { lang: 'es', rate: 0.6,
            voiceRoles: st.settings.voiceRoles, pitchScale: st.settings.voicePitch });
        } }, '🐢 Slower')));

      var input = el('input.answer-input', { type: 'text', autocomplete: 'off',
                                             autocapitalize: 'none', spellcheck: 'false' });
      var verdict = el('div.answer-state');
      function submit() {
        if (input.disabled) return;
        input.disabled = true;
        var norm = function (x) {
          return String(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                 .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
        };
        var right = norm(input.value) === norm(it.es);
        credit(st, it.es, right);
        done++;
        if (right) { score += 25; verdict.className = 'answer-state ok'; verdict.textContent = '✓ ' + it.es; }
        else { verdict.className = 'answer-state no'; verdict.textContent = '✗ ' + it.es + ' — ' + it.en; }
        setTimeout(next, right ? 700 : 1800);
      }
      input.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
      box.appendChild(el('div.answer-row', input, el('button.primary', { onclick: submit }, 'Check')));
      box.appendChild(verdict);
      box.appendChild(el('div.small.faint', { style: { marginTop: '8px' } },
        (i) + ' / ' + items.length));

      setTimeout(function () { input.focus(); ui.say(it.es); }, 120);
    }
    next();
    s.timer.textContent = '∞';
    return null;
  }

  /* ── Router ───────────────────────────────────────────────*/
  function viewGame(params) {
    init();
    var id = (params && params.id) || 'rush';
    var stop = null;
    var s;

    if (id === 'match') {
      s = shell('Pairs', 'Tap a Spanish word, then its meaning. Ninety seconds.');
      stop = gameMatch(s);
    } else if (id === 'gender') {
      s = shell('El or la', 'Only the article. Sixty seconds.');
      stop = quizLoop(s, { id: 'gender', seconds: 60, build: buildGender });
    } else if (id === 'dictate') {
      s = shell('Dictation', 'Hear it, type it. No clock.');
      stop = gameDictate(s);
    } else {
      s = shell('Word rush', 'Pick the meaning. Sixty seconds. Streaks are worth more.');
      stop = quizLoop(s, { id: 'rush', seconds: 60, build: buildRush });
    }

    s.main._onLeave = function () {
      if (stop) stop();
      PARLA.speech.cancel();
    };
    return s.main;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.games = viewGames;
  PARLA.views.game = viewGame;
})();
