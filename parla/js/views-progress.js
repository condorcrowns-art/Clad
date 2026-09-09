/* Parla — home, the 60-day challenge, stats, mistakes and settings */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  /* ── Onboarding ─────────────────────────────────────────── */

  var COLOURS = ['#c8542a', '#2f7d54', '#3a6ea5', '#8b4d9e', '#b1740c', '#b03636', '#2b8a8a', '#5a5a6e'];

  function viewOnboard() {
    init();
    var st = PARLA.store.state;
    var draft = { name: '', level: 'a1', avatar: COLOURS[0] };

    var wrap = el('div.onboard');
    wrap.appendChild(el('div.logo', '🗣️'));
    wrap.appendChild(el('h1.center', 'Parla'));
    wrap.appendChild(el('p.center.muted',
      'Learn Spanish the only way that actually works: by opening your mouth. ' +
      'Free, private, and yours forever.'));

    var card = el('div.card', { style: { marginTop: '20px' } });

    var nameInput = el('input', { type: 'text', placeholder: 'What should we call you?', autocomplete: 'off' });
    card.appendChild(ui.field('Your name', nameInput));

    card.appendChild(ui.field('How much Spanish do you have?',
      ui.segmented([
        ['a1', 'None / a little'],
        ['a2', 'I get by'],
        ['b1', 'Conversational'],
        ['b2', 'Pretty fluent']
      ], draft.level, function (v) { draft.level = v; }),
      'This sets how hard your conversation partner pushes you. You can change it any time.'));

    var swatches = el('div.swatches');
    COLOURS.forEach(function (c) {
      var b = el('button.swatch', {
        style: { background: c },
        'aria-pressed': String(c === draft.avatar),
        title: c
      });
      b.onclick = function () {
        draft.avatar = c;
        Array.prototype.forEach.call(swatches.children, function (x) {
          x.setAttribute('aria-pressed', 'false');
        });
        b.setAttribute('aria-pressed', 'true');
      };
      swatches.appendChild(b);
    });
    card.appendChild(ui.field('Pick a colour', swatches));

    card.appendChild(el('button.primary.wide.big', {
      onclick: function () {
        st.profile.name = (nameInput.value || 'amigo').trim().slice(0, 30);
        st.profile.level = draft.level;
        st.profile.avatar = draft.avatar;
        st.profile.created = Date.now();
        PARLA.store.save();
        PARLA.app.go('home');
      }
    }, 'Start talking'));

    wrap.appendChild(card);
    wrap.appendChild(el('p.center.small.faint', { style: { marginTop: '16px' } },
      'Nothing you say or save ever leaves this device.'));

    var main = el('main');
    main.appendChild(wrap);
    return main;
  }

  /* ── Home ───────────────────────────────────────────────── */

  function viewHome() {
    init();
    var st = PARLA.store.state;
    var main = el('main');
    var challenge = PARLA.data.es.challenge;
    var day = Math.min(st.progress.challengeDay, challenge.length - 1);
    var d = challenge[day];
    var doneToday = st.progress.lastDay === PARLA.store.today();

    var hour = new Date().getHours();
    var greet = hour < 12 ? 'Buenos días' : (hour < 20 ? 'Buenas tardes' : 'Buenas noches');

    // A painted wall to open on. Decorative and optional - without decor.js the
    // greeting simply stands on its own, which is what it did before.
    if (PARLA.decor) {
      var streak = st.progress.streak;
      main.appendChild(PARLA.decor.mural(
        greet + ', ' + (st.profile.name || 'amigo'),
        doneToday
          ? 'You have already practised today — anything more is a bonus.'
          : 'You have not spoken Spanish yet today.',
        streak > 0 ? streak + ' day streak' : 'Day one'
      ));
    }

    main.appendChild(el('h1', { class: PARLA.decor ? 'sr-head' : '' },
      greet + ', ' + (st.profile.name || 'amigo') + '.'));
    if (!PARLA.decor) {
      main.appendChild(el('p.muted', doneToday
        ? 'You have already practised today — anything more is a bonus.'
        : 'You have not spoken Spanish yet today.'));
    }

    var bb = ui.brainBanner();
    if (bb) main.appendChild(bb);

    /* today's challenge */
    var card = el('div.card', { style: { borderColor: 'var(--accent)', borderWidth: '1px' } },
      el('div.row',
        el('span.chip.hot', 'Day ' + (day + 1) + ' of 60'),
        el('div.spacer'),
        el('span.chip', d[2])
      ),
      el('h2', { style: { marginTop: '10px' } }, d[0]),
      el('p.muted', d[1]),
      el('button.primary.big.wide', {
        onclick: function () { PARLA.app.go('talk', { id: d[3], day: day }); }
      }, doneToday ? 'Practise again' : 'Start day ' + (day + 1))
    );
    main.appendChild(card);

    /* quick actions */
    var keys = PARLA.data.es.vocab.map(function (v) { return v[0]; });
    var s = PARLA.srs.stats(keys, st.srs);
    var due = s.due + Math.min(12, s.fresh);

    main.appendChild(ui.sectionTitle('Quick practice'));
    main.appendChild(el('div.grid.three',
      quick('💬', 'Free talk', 'Any scenario', function () { PARLA.app.go('scenarios'); }),
      quick('🔁', 'Review words', due + ' card' + (due === 1 ? '' : 's') + ' waiting',
        function () { PARLA.app.go('review'); }),
      quick('🧩', 'Drill verbs', 'Conjugation trainer', function () { PARLA.app.go('conjugate'); }),
      quick('🎮', 'Play a game', 'Four minutes', function () { PARLA.app.go('games'); }),
      quick('📚', 'Word bank', dictBlurb(), function () { PARLA.app.go('words'); }),
      quick('📐', 'Grammar', grammarBlurb(), function () { PARLA.app.go('grammar'); }),
      quick('🔎', 'Look something up', 'Any word, any form', function () { PARLA.app.go('coach'); })
    ));

    /* The mistakes that are due. This is the highest-value thing on the screen
     * when it is here, so it goes above everything except the day's task. */
    var dueFix = PARLA.store.dueMistakes(50);
    if (dueFix.length) {
      main.appendChild(el('button.fix-banner', {
        onclick: function () { PARLA.app.go('fix'); }
      },
        el('div.row',
          el('span.fix-emoji', '🎯'),
          el('div',
            el('div.fix-title', dueFix.length + ' mistake' + (dueFix.length === 1 ? '' : 's') +
              ' to fix again'),
            el('div.small.muted', 'The sentences you got wrong, back for another go — ' +
              'this is the part that makes being corrected worth anything.')),
          el('div.spacer'),
          el('span.chip.hot', 'Go →'))));
    }

    /* at a glance */
    var lp = PARLA.store.levelProgress();
    main.appendChild(ui.sectionTitle('Where you are'));
    main.appendChild(el('div.card',
      el('div.row',
        el('div', el('div.small.faint', 'LEVEL ' + lp.level),
          el('div.small.muted', lp.into + ' / ' + lp.need + ' xp')),
        el('div.spacer'),
        el('span.chip.hot', '🔥 ' + st.progress.streak + ' day streak')
      ),
      el('div', { style: { marginTop: '8px' } }, ui.bar(lp.into / lp.need))
    ));

    main.appendChild(el('div.grid.four', { style: { marginTop: '12px' } },
      ui.stat(st.progress.totals.sessions, 'sessions'),
      ui.stat(st.progress.totals.turns, 'turns spoken'),
      ui.stat(ui.dur(st.progress.totals.minutes), 'talking'),
      ui.stat(s.seen, 'words seen')
    ));

    if (st.mistakes.length) {
      main.appendChild(ui.sectionTitle('Last thing you got wrong',
        el('button.ghost', { onclick: function () { PARLA.app.go('mistakes'); } }, 'All →')));
      var m = st.mistakes[0];
      main.appendChild(el('div.mistake',
        el('div.was', m.es), el('div.now.es', m.fix),
        m.note ? el('div.note', m.note) : null));
    }

    return main;
  }

  function quick(emoji, title, sub, onclick) {
    return el('button.scenario', { onclick: onclick },
      el('span.emoji', emoji),
      el('span.txt', el('strong', title), el('span', sub)));
  }

  /* ── 60-day challenge ───────────────────────────────────── */

  function viewChallenge() {
    init();
    var st = PARLA.store.state;
    var challenge = PARLA.data.es.challenge;
    var done = st.progress.challengeDone;
    var cur = st.progress.challengeDay;
    var main = el('main');

    main.appendChild(el('h1', 'The 60-day speaking challenge'));
    main.appendChild(el('p.muted',
      'One conversation a day, getting harder. Days unlock as you finish them, ' +
      'so a missed day costs you nothing but time.'));

    main.appendChild(el('div.grid.three.tight', { style: { marginBottom: '18px' } },
      ui.stat(done.length, 'days done'),
      ui.stat(st.progress.streak, 'day streak'),
      ui.stat(st.progress.bestStreak, 'best streak')
    ));

    main.appendChild(ui.bar(done.length / 60));

    var grid = el('div.day-grid', { style: { marginTop: '16px' } });
    for (var i = 0; i < challenge.length; i++) {
      (function (idx) {
        var isDone = done.indexOf(idx) !== -1;
        var locked = idx > cur;
        var cls = 'button.day' + (isDone ? '.done' : '') + (idx === cur ? '.today' : '') + (locked ? '.locked' : '');
        grid.appendChild(el(cls, {
          title: challenge[idx][0] + (locked ? ' (locked)' : ''),
          onclick: function () {
            if (locked) { ui.toast('Finish day ' + (cur + 1) + ' first.', 'warn'); return; }
            PARLA.app.go('talk', { id: challenge[idx][3], day: idx });
          }
        }, String(idx + 1)));
      })(i);
    }
    main.appendChild(grid);

    /* upcoming list */
    main.appendChild(ui.sectionTitle('Coming up'));
    var list = el('div.stack');
    for (var j = cur; j < Math.min(cur + 6, challenge.length); j++) {
      (function (idx) {
        var d = challenge[idx];
        var sc = PARLA.data.es.scenarios.filter(function (s) { return s.id === d[3]; })[0];
        list.appendChild(el('button.scenario', {
          onclick: function () { PARLA.app.go('talk', { id: d[3], day: idx }); }
        },
          el('span.emoji', sc ? sc.emoji : '💬'),
          el('span.txt',
            el('strong', 'Day ' + (idx + 1) + ' — ' + d[0]),
            el('span', d[1])),
          el('span.chip', d[2])
        ));
      })(j);
    }
    main.appendChild(list);

    return main;
  }

  /* ── Stats ──────────────────────────────────────────────── */

  /* One line for the word-bank tile, honest about whether it is there yet. */
  function dictBlurb() {
    var D = PARLA.dict;
    if (!D) return 'Browse and search';
    if (D.ready()) return D.size().toLocaleString() + ' words';
    if (D.failure()) return 'not loaded';
    return 'loading…';
  }

  /* A heading you can tap, and the explanation underneath only if you want it.
   * Settings had five paragraphs of Windows advice open by default on a phone
   * that will never run any of it. */
  function fold(title, html) {
    var body = el('div.small', { hidden: true });
    body.innerHTML = html;
    var head = el('button.fold-head', { 'aria-expanded': 'false' },
      el('span', title), el('span.spacer'), el('span.small.faint', 'why ▾'));
    head.onclick = function () {
      body.hidden = !body.hidden;
      head.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
      head.lastChild.textContent = body.hidden ? 'why ▾' : 'hide ▴';
    };
    return el('div.fold', head, body);
  }

  function grammarBlurb() {
    var st = PARLA.store.state;
    var hits = {};
    (st.mistakes || []).forEach(function (m) { if (m.topic) hits[m.topic] = 1; });
    var n = Object.keys(hits).length;
    return n ? n + ' to look at' : '20 things that trip you up';
  }

  function viewProgress() {
    init();
    var st = PARLA.store.state;
    var main = el('main');
    var keys = PARLA.data.es.vocab.map(function (v) { return v[0]; });
    var s = PARLA.srs.stats(keys, st.srs);
    var lp = PARLA.store.levelProgress();
    var t = st.progress.totals;

    main.appendChild(el('h1', 'Your progress'));

    main.appendChild(el('div.card',
      el('div.row',
        el('h2', { style: { margin: 0 } }, 'Level ' + lp.level),
        el('div.spacer'),
        el('span.muted.small', st.progress.xp + ' xp total')),
      el('div', { style: { marginTop: '8px' } }, ui.bar(lp.into / lp.need)),
      el('div.small.faint', { style: { marginTop: '4px' } },
        (lp.need - lp.into) + ' xp to level ' + (lp.level + 1))
    ));

    main.appendChild(ui.sectionTitle('Speaking'));
    main.appendChild(el('div.grid.four',
      ui.stat(t.sessions, 'sessions'),
      ui.stat(t.turns, 'turns'),
      ui.stat(t.words, 'words said'),
      ui.stat(ui.dur(t.minutes), 'time talking')
    ));

    main.appendChild(ui.sectionTitle('Vocabulary'));
    main.appendChild(el('div.grid.four',
      ui.stat(s.seen + ' / ' + s.total, 'started'),
      ui.stat(s.mature, 'mature'),
      ui.stat(s.due, 'due now'),
      ui.stat(s.leeches, 'trouble')
    ));
    main.appendChild(el('div', { style: { marginTop: '10px' } }, ui.bar(s.seen / Math.max(1, s.total))));

    /* How much of the language, rather than how much of the shipped list. This
     * is the number that actually tracks whether Spanish is getting easier:
     * the thousand commonest words are most of what anyone says. */
    var D = PARLA.dict;
    if (D && D.ready()) {
      var norm = PARLA.brain.normalise;
      var have = Object.create(null);
      (PARLA.data.es.vocab || []).forEach(function (v) {
        have[norm(v[0])] = 1;
        have[norm(String(v[0]).replace(/^(el|la|los|las)\s+/, ''))] = 1;
      });
      (st.phrases || []).forEach(function (p) { have[norm(p.es)] = 1; });
      var isKnown = function (t) { return !!have[norm(t)]; };

      var c1 = D.coverage(isKnown, 1000);
      var c3 = D.coverage(isKnown, 3000);
      var c10 = D.coverage(isKnown, 10000);

      main.appendChild(ui.sectionTitle('How much of the language', 
        el('button.ghost', { onclick: function () { PARLA.app.go('words'); } }, 'Word bank →')));
      main.appendChild(el('div.grid.three.tight',
        ui.stat(c1.pct + '%', 'of the top 1,000'),
        ui.stat(c3.pct + '%', 'of the top 3,000'),
        ui.stat(c10.pct + '%', 'of the top 10,000')));
      main.appendChild(el('div', { style: { marginTop: '10px' } }, ui.bar(c1.pct / 100)));
      main.appendChild(el('p.small.muted',
        'Measured against ' + D.size().toLocaleString() + ' words ordered by how often ' +
        'Spanish speakers actually say them. The first thousand do most of the work; ' +
        'after that each one buys a little less, which is why the number slows down ' +
        'and that is not you failing.'));
    }

    main.appendChild(ui.sectionTitle('Practice'));
    main.appendChild(el('div.grid.three.tight',
      ui.stat(t.reviews, 'card reviews'),
      ui.stat(t.conjugations, 'verbs drilled'),
      ui.stat(t.corrections, 'corrections')
    ));

    if (st.history.length) {
      main.appendChild(ui.sectionTitle('Recent sessions'));
      var stack = el('div.stack');
      st.history.slice(0, 12).forEach(function (h) {
        var sc = PARLA.data.es.scenarios.filter(function (x) { return x.id === h.scenarioId; })[0];
        // Title on its own line, the numbers under it: on a phone this row used
        // to wrap in the middle of "+16 xp".
        stack.appendChild(el('div.card.session-row', { style: { padding: '10px 14px' } },
          el('div.session-title', sc ? sc.emoji + ' ' + sc.title : h.scenarioId),
          el('div.small.faint',
            h.turns + (h.turns === 1 ? ' turn' : ' turns') + ' · +' + h.xp + ' xp · ' +
            new Date(h.when).toLocaleDateString())));
      });
      main.appendChild(stack);
    }

    main.appendChild(el('div.btn-row', { style: { marginTop: '22px' } },
      el('button', { onclick: function () { PARLA.app.go('mistakes'); } }, 'Mistake journal'),
      el('button', { onclick: function () { PARLA.app.go('settings'); } }, 'Settings')
    ));

    return main;
  }

  /* ── Mistake journal ────────────────────────────────────── */

  function viewMistakes() {
    init();
    var st = PARLA.store.state;
    var main = el('main');

    main.appendChild(el('h1', 'Mistake journal'));
    main.appendChild(el('p.muted',
      'Every correction you have been given, newest first. This is the most useful page in the app.'));

    if (!st.mistakes.length) {
      main.appendChild(ui.empty('📝', 'Nothing here yet',
        'Have a conversation and your corrections will collect here.'));
      return main;
    }

    main.appendChild(el('div.row', { style: { marginBottom: '12px' } },
      el('span.chip', st.mistakes.length + ' logged'),
      el('div.spacer'),
      el('button.ghost.danger', {
        onclick: function () {
          if (!confirm('Clear the whole mistake journal? This cannot be undone.')) return;
          st.mistakes = [];
          PARLA.store.save();
          PARLA.app.go('mistakes');
        }
      }, 'Clear')));

    var stack = el('div.stack');
    st.mistakes.forEach(function (m) {
      var sc = PARLA.data.es.scenarios.filter(function (x) { return x.id === m.scenario; })[0];
      stack.appendChild(el('div.mistake',
        el('div.was', m.es),
        el('div.now.es', m.fix),
        m.note ? el('div.note', m.note) : null,
        el('div.row', { style: { marginTop: '5px' } },
          el('button', { style: { padding: '2px 8px', fontSize: '.72rem' },
            onclick: function () { ui.say(m.fix); } }, '🔊'),
          el('span.small.faint', { style: { marginLeft: '8px' } },
            (sc ? sc.title + ' · ' : '') + new Date(m.when).toLocaleDateString()))
      ));
    });
    main.appendChild(stack);
    return main;
  }

  /* ── Settings ───────────────────────────────────────────── */

  function viewSettings() {
    init();
    var st = PARLA.store.state;
    var s = st.settings;
    var main = el('main');

    main.appendChild(el('h1', 'Settings'));

    /* — conversation engine — */
    main.appendChild(ui.sectionTitle('Conversation partner'));
    var brainCard = el('div.card');
    var brainBody = el('div');

    brainCard.appendChild(ui.field('Engine',
      ui.segmented([
        ['scripted', 'Built-in'],
        ['hosted', 'This site'],
        ['ollama', 'Ollama'],
        ['gemini', 'Gemini']
      ], s.brain, function (v) {
        s.brain = v;
        PARLA.brain.health.checked = false;
        PARLA.store.save();
        renderBrain();
        PARLA.app.paintChips();
        PARLA.app.checkBrainHealth();
      }),
      'All four are free. Built-in works offline with no setup; the rest give you a real AI partner. ' +
      'On a phone, use “This site”.'));
    brainCard.appendChild(brainBody);

    var testOut = el('div');
    brainCard.appendChild(el('div.btn-row', { style: { marginTop: '8px' } },
      el('button', {
        onclick: function () {
          testOut.innerHTML = '';
          testOut.appendChild(ui.banner('info', 'Testing…'));
          PARLA.brain.testBackend(s).then(function (r) {
            testOut.innerHTML = '';
            testOut.appendChild(ui.banner(r.ok ? 'good' : 'bad', r.detail));
          });
        }
      }, 'Test connection')));
    brainCard.appendChild(testOut);
    main.appendChild(brainCard);

    function renderBrain() {
      ui.clear(brainBody);

      if (s.brain === 'hosted') {
        brainBody.appendChild(ui.banner('good',
          '<strong>Nothing to install, works on any device.</strong> The model runs on ' +
          'Cloudflare\'s edge, on the same site you are already using — so this is the one ' +
          'that works on your phone, where a page on <code>https</code> cannot reach ' +
          'Ollama on a PC at <code>http://localhost</code>. Your turns go to Cloudflare ' +
          'rather than staying on your own machine; if that matters to you, use Ollama at ' +
          'your desk and this one when you are out.'));
        brainBody.appendChild(el('div.hint',
          'Only available on the deployed site. Running from your PC, this will not answer — ' +
          'there is no Pages Function behind a local folder.'));
        return;
      }

      if (s.brain === 'ollama') {
        var url = el('input', { type: 'url', value: s.ollamaUrl });
        url.onchange = function () {
          s.ollamaUrl = url.value.trim(); PARLA.store.save(); loadModels();
        };

        brainBody.appendChild(ui.banner('info',
          '<strong>Unlimited, private, and free forever.</strong> Because this page runs in a ' +
          'browser, Ollama must be told to accept it — it needs <code>OLLAMA_ORIGINS</code> set to ' +
          '<code>*</code>. Without that the browser is blocked by CORS and Parla silently falls ' +
          'back to the scripted partner.'));
        brainBody.appendChild(ui.field('Ollama URL', url));

        var modelSel = el('select');
        var modelNote = el('div.hint', 'Looking for installed models…');
        brainBody.appendChild(ui.field('Model', modelSel));
        brainBody.appendChild(modelNote);

        modelSel.onchange = function () {
          s.ollamaModel = modelSel.value;
          PARLA.store.save();
          PARLA.app.paintChips();
        };

        function loadModels() {
          ui.clear(modelSel);
          modelNote.textContent = 'Looking for installed models…';
          PARLA.brain.detectOllama(s).then(function (d) {
            ui.clear(modelSel);
            if (!d.ok) {
              modelSel.appendChild(el('option', { value: '' }, 'Ollama not reachable'));
              modelNote.textContent = 'Could not reach Ollama at ' + s.ollamaUrl +
                '. Start it, and make sure OLLAMA_ORIGINS is "*".';
              return;
            }
            if (!d.models.length) {
              modelSel.appendChild(el('option', { value: '' }, 'No models installed'));
              modelNote.textContent = 'Ollama is running but empty. Run: ollama pull qwen2.5:7b';
              return;
            }
            d.models.forEach(function (m) {
              modelSel.appendChild(el('option', {
                value: m, selected: m === s.ollamaModel ? true : null
              }, m + (m === d.best ? '  ★ best for Spanish' : '')));
            });
            if (!s.ollamaModel || d.models.indexOf(s.ollamaModel) === -1) {
              s.ollamaModel = d.best;
              modelSel.value = d.best;
              PARLA.store.save();
            }
            modelNote.textContent = 'Bigger models speak better Spanish but reply more slowly. ' +
              'qwen2.5 handles Spanish notably better than llama3.2 at the same size.';
          });
        }
        loadModels();
      } else if (s.brain === 'gemini') {
        var key = el('input', { type: 'password', value: s.geminiKey, placeholder: 'AIza…' });
        key.onchange = function () { s.geminiKey = key.value.trim(); PARLA.store.save(); };
        var gm = el('input', { type: 'text', value: s.geminiModel });
        gm.onchange = function () { s.geminiModel = gm.value.trim(); PARLA.store.save(); };

        brainBody.appendChild(ui.banner('info',
          '<strong>Free, no credit card.</strong> Get a key at ' +
          '<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. ' +
          'The free tier is permanent but quota-limited, and Google may use free-tier text to improve its models — ' +
          'so do not say anything here you would not want read.'));
        brainBody.appendChild(ui.field('API key', key, 'Stored only in this browser.'));
        brainBody.appendChild(ui.field('Model', gm,
          'gemini-2.5-flash-lite has the largest free daily quota.'));
      } else {
        brainBody.appendChild(ui.banner('good',
          'No setup, no network, no cost — ever. Your partner follows the scenario script and ' +
          'the built-in corrector catches the classic mistakes. Switch to Ollama or Gemini ' +
          'when you want genuinely open-ended conversation.'));
      }
    }
    renderBrain();

    /* — corrections — */
    main.appendChild(ui.sectionTitle('Corrections'));
    main.appendChild(el('div.card',
      ui.field('How much to correct',
        ui.segmented([
          ['gentle', 'Gentle'],
          ['strict', 'Everything'],
          ['off', 'Leave me alone']
        ], s.correctionStyle, function (v) { s.correctionStyle = v; PARLA.store.save(); }),
        'Gentle only flags what would actually confuse a native speaker.')
    ));

    /* — voice — */
    main.appendChild(ui.sectionTitle('Voice'));
    var voiceCard = el('div.card');
    var voiceSel = el('select');
    var voiceNote = el('div.hint');
    voiceCard.appendChild(ui.field('Spanish voice', voiceSel));
    voiceCard.appendChild(voiceNote);

    /* Neural voices from Piper come first: they are the reason the app stopped
     * sounding like a 2009 satnav, so they should be the obvious pick. The
     * browser's own voices stay listed underneath as the fallback. */
    PARLA.speech.onVoicesReady(function () {
      var list = PARLA.speech.allVoicesFor(st.profile.target || 'es');
      ui.clear(voiceSel);
      if (!list.length) {
        voiceSel.appendChild(el('option', { value: '' }, 'No Spanish voice found'));
        voiceNote.textContent = 'Your system has no Spanish voice installed. See the note below.';
        return;
      }
      // Labelled, because the names alone ("Microsoft Helena Desktop") say
      // nothing at all about how they sound.
      var LABEL = { neural: 'neural — best', best: 'best', good: 'good', ok: '', basic: 'robotic' };
      list.forEach(function (v) {
        var tag = LABEL[v.quality] ? '  [' + LABEL[v.quality] + ']' : '';
        voiceSel.appendChild(el('option', {
          value: v.id,
          selected: v.id === s.voiceURI ? true : null
        }, v.label + tag));
      });
      if (!s.voiceURI) voiceSel.value = list[0].id;
      voiceNote.textContent =
        list[0].quality === 'neural'
          ? 'Neural voice running on this machine. No internet needed, nothing to pay.'
          : list[0].quality === 'basic'
            ? 'Everything installed here is an old robotic voice. See the note below.'
            : 'Sorted best-sounding first. Picking one plays a sample.';
    });
    voiceSel.onchange = function () {
      s.voiceURI = voiceSel.value;
      PARLA.store.save();
      ui.say('Hola, así sueno yo. ¿Te gusta esta voz?');
    };

    var rate = el('input', { type: 'range', min: '0.5', max: '1.3', step: '0.05', value: String(s.rate) });
    var rateOut = el('span.small.muted', s.rate + '×');
    rate.oninput = function () {
      s.rate = parseFloat(rate.value);
      rateOut.textContent = s.rate.toFixed(2) + '×';
    };
    rate.onchange = function () { PARLA.store.save(); ui.say('Hablo a esta velocidad.'); };
    voiceCard.appendChild(ui.field('Speaking speed', el('div', rate, rateOut),
      'Slower is easier to follow. 0.9 is a good place to start.'));

    /* — casting —
     * Which installed voice plays women and which plays men. The app cannot
     * hear its own voices, and Piper's model cards do not record a speaker's
     * gender, so this is asked rather than guessed. Two taps, once. */
    var castCard = el('div.card');
    function drawCast() {
      ui.clear(castCard);
      var voices = PARLA.speech.piper.available
        ? PARLA.speech.piperVoicesFor(st.profile.target || 'es') : [];

      if (!voices.length) {
        castCard.appendChild(el('div.hint',
          'Casting needs the neural voices. Run setup again to install them.'));
        return;
      }

      castCard.appendChild(el('div.hint',
        'Your partner is a different person in every scenario — Marta the barista, ' +
        'Javi at the party. Tell Parla which of your installed voices sounds like ' +
        'a woman and which sounds like a man, and it will cast them accordingly. ' +
        'Press play to hear each one.'));

      [['f', 'Women'], ['m', 'Men']].forEach(function (pair) {
        var key = pair[0];
        var sel = el('select');
        sel.appendChild(el('option', { value: '' }, 'No preference'));
        voices.forEach(function (v) {
          sel.appendChild(el('option', {
            value: v.id,
            selected: st.settings.voiceRoles[key] === v.id ? true : null
          }, v.name.charAt(0).toUpperCase() + v.name.slice(1) +
             ' (' + String(v.locale || '').replace('_', '-') + ')'));
        });
        sel.onchange = function () {
          st.settings.voiceRoles[key] = sel.value;
          PARLA.store.save();
          PARLA.speech.speak(
            key === 'f' ? 'Hola, soy yo. ¿Te suena bien mi voz?'
                        : 'Hola, ¿qué tal? Soy yo el que habla.',
            { lang: 'es', voiceRoles: st.settings.voiceRoles,
              pitchScale: st.settings.voicePitch, rate: st.settings.rate,
              character: { gender: key, age: 'adult' } });
        };
        castCard.appendChild(ui.field(pair[1] + ' sound like', sel));
      });

      castCard.appendChild(el('div.hint',
        'If only one voice fits, leave the other on “No preference” — Parla will ' +
        'shift the pitch instead. Not perfect, but better than everyone sounding ' +
        'like the same person.'));
    }
    drawCast();

    var pitch = el('input', { type: 'range', min: '0.85', max: '1.2', step: '0.01',
                              value: String(st.settings.voicePitch || 1) });
    var pitchOut = el('span.small.muted', pitchLabel(st.settings.voicePitch || 1));
    function pitchLabel(v) {
      if (v >= 1.09) return 'younger';
      if (v >= 1.03) return 'a bit younger';
      if (v <= 0.91) return 'older';
      if (v <= 0.97) return 'a bit older';
      return 'as recorded';
    }
    pitch.oninput = function () {
      st.settings.voicePitch = parseFloat(pitch.value);
      pitchOut.textContent = pitchLabel(st.settings.voicePitch);
    };
    pitch.onchange = function () {
      PARLA.store.save();
      ui.say('Así sueno con esta edad de voz.', null, { gender: '', age: 'adult' });
    };
    castCard.appendChild(ui.field('Voice age', el('div', pitch, pitchOut),
      'Shifts every voice up or down. Each character still sits younger or older ' +
      'than the others within that — a student sounds younger than a doctor either way.'));

    voiceCard.appendChild(el('div.hint', { style: { marginTop: '10px' } }, ''));

    voiceCard.appendChild(el('div.btn-row',
      el('button', { onclick: function () { ui.say('Buenos días. ¿Qué tal estás hoy?'); } }, '🔊 Test voice'),
      el('button', {
        onclick: function () {
          var list = PARLA.speech.allVoicesFor(st.profile.target || 'es');
          if (!list.length) return;
          s.voiceURI = list[0].id;
          voiceSel.value = s.voiceURI;
          PARLA.store.save();
          ui.say('Hola, así sueno yo.');
        }
      }, 'Use the best available')));

    // Two different problems wear the same symptom, so say which one it is.
    // The install advice is for the machine Parla is served from; on a phone
    // there is no Piper to install and never will be, so it is not offered.
    var local = typeof location !== 'undefined' &&
      (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ||
       location.protocol === 'file:');

    if (PARLA.speech.piper.available) {
      voiceCard.appendChild(ui.banner('good',
        '<strong>Neural voice installed.</strong> Speech is generated on this machine, ' +
        'so nothing you say or hear leaves the computer.'));
    } else if (local) {
      voiceCard.appendChild(fold('Voice sounding robotic?',
        'The neural voice is not installed. Run <code>.\\setup-windows.ps1</code> again and ' +
        'it will fetch Piper — local, free, and much better than what is in this list. ' +
        'Until then, on Windows the least bad are <code>Google español</code> (from Chrome) ' +
        'or any voice whose name contains <em>Natural</em>, added under ' +
        '<code>Settings → Time &amp; language → Speech</code>.'));
    } else {
      voiceCard.appendChild(el('div.hint',
        'These are your device\'s own Spanish voices. Android\'s are decent; the neural ' +
        'voice only exists on the computer Parla is installed on.'));
    }
    main.appendChild(voiceCard);
    main.appendChild(castCard);

    /* — what it remembers — */
    main.appendChild(ui.sectionTitle('What your partner remembers'));
    var memCard = el('div.card');

    function drawMemory() {
      ui.clear(memCard);
      var mem = st.memory || { name: '', facts: [] };
      var lines = [];
      if (mem.name) lines.push('Your name is ' + mem.name + '.');
      (mem.facts || []).forEach(function (f) { if (f && f.text) lines.push(f.text); });

      if (!lines.length) {
        memCard.appendChild(el('div.hint',
          'Nothing yet. Tell your partner about yourself while you talk — your name, ' +
          'where you live, what you do — and it will still know next time you open the app.'));
      } else {
        memCard.appendChild(el('div.hint',
          'Carried into every conversation, so you are not introducing yourself twice a week.'));
        var list = el('ul', { style: { margin: '8px 0 0', paddingLeft: '18px' } });
        lines.forEach(function (t) {
          list.appendChild(el('li', { style: { fontSize: '.86rem', marginBottom: '3px' } }, t));
        });
        memCard.appendChild(list);
        memCard.appendChild(el('div.btn-row', { style: { marginTop: '10px' } },
          el('button', { onclick: function () {
            PARLA.store.forgetAll();
            drawMemory();
            ui.toast('Forgotten. Your partner starts fresh.', 'good');
          } }, 'Forget everything')));
      }
      memCard.appendChild(el('div.hint', { style: { marginTop: '8px' } },
        'This never leaves your machine — it lives in this browser alongside your progress.'));
    }
    drawMemory();
    main.appendChild(memCard);

    /* — the microphone —
     * A microphone that does not work has half a dozen possible causes and the
     * browser reports almost none of them. This checks every one at once and
     * then actually listens, so "it doesn't work" becomes a specific sentence. */
    main.appendChild(ui.sectionTitle('Microphone'));
    var micCard = el('div.card');
    var micOut = el('div');
    var micLive = el('div.mic-live', { hidden: true });

    micCard.appendChild(el('div.hint',
      'If speaking is not working, run this. It checks everything the browser ' +
      'will tell us, then listens for five seconds and shows exactly what it heard.'));
    micCard.appendChild(el('div.btn-row', { style: { marginTop: '10px' } },
      el('button.primary', { onclick: runMicTest }, '🎙 Test microphone')));
    micCard.appendChild(micOut);
    micCard.appendChild(micLive);
    main.appendChild(micCard);

    function line(ok, label, detail) {
      return el('div.check-line',
        el('span.check-mark.' + (ok === true ? 'ok' : ok === false ? 'no' : 'meh'),
           ok === true ? '✓' : ok === false ? '✗' : '•'),
        el('div',
          el('div', label),
          detail ? el('div.small.muted', detail) : null));
    }

    function runMicTest() {
      ui.clear(micOut);
      micLive.hidden = true;
      micOut.appendChild(el('div.small.muted', { style: { marginTop: '10px' } }, 'Checking…'));

      PARLA.speech.recheckMic();
      PARLA.speech.micReport().then(function (r) {
        return PARLA.speech.ensureMic(true).then(function (m) { return [r, m]; });
      }).then(function (pair) {
        var r = pair[0], m = pair[1];
        ui.clear(micOut);

        micOut.appendChild(line(r.secure, 'Secure context',
          r.secure ? r.origin : 'Browsers only give a microphone to https:// or localhost. ' +
                                'You are on ' + r.origin));
        micOut.appendChild(line(r.recognition, 'Speech recognition available',
          r.recognition ? '' : 'This browser has no SpeechRecognition. Use Chrome or Edge.'));
        micOut.appendChild(line(
          r.permission === 'granted' ? true : r.permission === 'denied' ? false : null,
          'Permission: ' + r.permission,
          r.permission === 'denied'
            ? 'Click the padlock in the address bar, set Microphone to Allow, then reload.'
            : ''));
        micOut.appendChild(line(r.devices.length > 0,
          r.devices.length + ' microphone' + (r.devices.length === 1 ? '' : 's') + ' found',
          r.devices.join(', ')));
        micOut.appendChild(line(m.ok, m.ok ? 'Microphone opened' : 'Could not open the microphone',
          m.detail));

        if (m.ok && r.recognition) listenTest();
      });
    }

    function listenTest() {
      ui.clear(micLive);
      micLive.hidden = false;
      var heard = el('div.mic-live-text', 'Say something in Spanish…');
      micLive.appendChild(heard);

      var handle = PARLA.speech.listen({
        lang: st.profile.target || 'es',
        silenceMs: 5000, noSpeechMs: 6000, maxMs: 9000,
        onpartial: function (t) { heard.textContent = t; heard.className = 'mic-live-text live'; },
        onfinal: function (t, conf) {
          heard.className = 'mic-live-text ok';
          heard.textContent = '✓ Heard: “' + t + '”' +
            (conf ? '  (confidence ' + Math.round(conf * 100) + '%)' : '');
        },
        onerror: function (kind, detail) {
          heard.className = 'mic-live-text no';
          heard.textContent = '✗ ' + kind + (detail ? ' — ' + detail : '');
        },
        onend: function () {
          if (heard.className === 'mic-live-text') {
            heard.className = 'mic-live-text no';
            heard.textContent = '✗ Nothing was heard. Check Windows has the right ' +
                                'microphone selected as the default input device.';
          }
        }
      });
      main._micTest = handle;
    }

    /* — practice — */
    main.appendChild(ui.sectionTitle('Practice'));
    var pause = el('input', { type: 'range', min: '800', max: '4000', step: '200',
                              value: String(s.micPauseMs || 1600) });
    var pauseOut = el('span.small.muted', ((s.micPauseMs || 1600) / 1000).toFixed(1) + 's');
    pause.oninput = function () {
      s.micPauseMs = parseInt(pause.value, 10);
      pauseOut.textContent = (s.micPauseMs / 1000).toFixed(1) + 's';
    };
    pause.onchange = function () { PARLA.store.save(); };

    main.appendChild(el('div.card',
      ui.field('Pause before your turn ends', el('div', pause, pauseOut),
        'How long a silence means you have finished speaking. Raise this if you get ' +
        'cut off while thinking mid-sentence — the partner would rather wait than ' +
        'answer half a question.'),
      toggle('Reopen the microphone automatically', s.autoListen, function (v) {
        s.autoListen = v; PARLA.store.save();
      }, 'Hands-free: the mic reopens as soon as your partner finishes speaking.'),
      toggle('Show English translations', s.showTranslations, function (v) {
        s.showTranslations = v; PARLA.store.save();
      }, 'Turn this off once you can cope — it is the fastest way to improve.'),
      toggle('Drill vosotros', s.drillVosotros === true, function (v) {
        s.drillVosotros = v; PARLA.store.save();
      }, 'Vosotros is used in Spain and almost nowhere else. Off, the conjugation ' +
         'trainer spends its time on the five forms you will actually say — the ' +
         'tables on Ask and Verbs still show all six either way.'),
      ui.field('Your level',
        ui.segmented([['a1', 'A1'], ['a2', 'A2'], ['b1', 'B1'], ['b2', 'B2']],
          st.profile.level, function (v) { st.profile.level = v; PARLA.store.save(); }),
        'Controls how hard your partner pushes and which verbs you get drilled on.')
    ));

    /* — appearance — */
    main.appendChild(ui.sectionTitle('Appearance'));
    main.appendChild(el('div.card',
      ui.field('Theme',
        ui.segmented([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], s.theme, function (v) {
          s.theme = v; PARLA.store.save(); PARLA.app.applyTheme();
        }))
    ));

    /* — data — */
    main.appendChild(ui.sectionTitle('Your data'));
    var importArea = el('textarea', { placeholder: 'Paste an exported save here…' });
    main.appendChild(el('div.card',
      el('p.small.muted',
        'Everything is stored in this browser only. Export it to move to another machine, ' +
        'or to keep a backup — clearing site data will otherwise wipe your progress.'),
      el('div.btn-row',
        el('button', {
          onclick: function () {
            var blob = new Blob([PARLA.store.exportJSON()], { type: 'application/json' });
            var a = el('a', { href: URL.createObjectURL(blob), download: 'parla-save.json' });
            document.body.appendChild(a); a.click(); a.remove();
          }
        }, '⬇ Export save'),
        el('button', {
          onclick: function () {
            navigator.clipboard && navigator.clipboard.writeText(PARLA.store.exportJSON())
              .then(function () { ui.toast('Save copied to clipboard.'); })
              .catch(function () { ui.toast('Could not copy.', 'bad'); });
          }
        }, '📋 Copy save')
      ),
      el('div', { style: { marginTop: '12px' } },
        ui.field('Import', importArea),
        el('button', {
          onclick: function () {
            try {
              PARLA.store.importJSON(importArea.value);
              ui.toast('Save imported.');
              PARLA.app.go('home');
            } catch (e) {
              ui.toast('That did not parse as a Parla save.', 'bad');
            }
          }
        }, 'Import')),
      el('div', { style: { marginTop: '18px' } },
        el('button.danger', {
          onclick: function () {
            if (!confirm('Erase all progress, words, and settings? This cannot be undone.')) return;
            PARLA.store.reset();
            location.reload();
          }
        }, 'Erase everything'))
    ));

    // A live microphone test must not keep listening after you navigate away.
    main._onLeave = function () {
      if (main._micTest) { main._micTest.abort(); main._micTest = null; }
      PARLA.speech.cancel();
    };

    return main;
  }

  function toggle(label, value, onChange, hint) {
    var input = el('input', { type: 'checkbox', checked: value ? true : null,
      style: { width: 'auto', marginRight: '8px' } });
    input.onchange = function () { onChange(input.checked); };
    return el('div', { style: { marginBottom: '14px' } },
      el('label', { style: { display: 'flex', alignItems: 'center', cursor: 'pointer', fontWeight: '600', fontSize: '.92rem' } },
        input, label),
      hint ? el('div.hint', { style: { marginLeft: '24px' } }, hint) : null);
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.onboard = viewOnboard;
  PARLA.views.home = viewHome;
  PARLA.views.challenge = viewChallenge;
  PARLA.views.progress = viewProgress;
  PARLA.views.mistakes = viewMistakes;
  PARLA.views.settings = viewSettings;
})();
