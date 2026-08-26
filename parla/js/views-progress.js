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

    main.appendChild(el('h1', greet + ', ' + (st.profile.name || 'amigo') + '.'));
    main.appendChild(el('p.muted', doneToday
      ? 'You have already practised today — anything more is a bonus.'
      : 'You have not spoken Spanish yet today.'));

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
      quick('🧩', 'Drill verbs', 'Conjugation trainer', function () { PARLA.app.go('conjugate'); })
    ));

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

    main.appendChild(el('div.grid.three', { style: { marginBottom: '18px' } },
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

    main.appendChild(ui.sectionTitle('Practice'));
    main.appendChild(el('div.grid.three',
      ui.stat(t.reviews, 'card reviews'),
      ui.stat(t.conjugations, 'verbs drilled'),
      ui.stat(t.corrections, 'corrections')
    ));

    if (st.history.length) {
      main.appendChild(ui.sectionTitle('Recent sessions'));
      var stack = el('div.stack');
      st.history.slice(0, 12).forEach(function (h) {
        var sc = PARLA.data.es.scenarios.filter(function (x) { return x.id === h.scenarioId; })[0];
        stack.appendChild(el('div.card', { style: { padding: '10px 14px' } },
          el('div.row',
            el('span', sc ? sc.emoji + ' ' + sc.title : h.scenarioId),
            el('div.spacer'),
            el('span.small.faint', h.turns + ' turns · +' + h.xp + ' xp'),
            el('span.small.faint', { style: { marginLeft: '10px' } },
              new Date(h.when).toLocaleDateString())
          )));
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
      'All three are free. Built-in works offline with no setup; the other two give you a real AI partner.'));
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
    voiceCard.appendChild(ui.field('Spanish voice', voiceSel,
      'Voices come from your operating system. If the list is short, install more Spanish ' +
      'voices in your OS speech settings.'));

    PARLA.speech.onVoicesReady(function () {
      var list = PARLA.speech.voicesFor(st.profile.target || 'es');
      ui.clear(voiceSel);
      if (!list.length) {
        voiceSel.appendChild(el('option', { value: '' }, 'No Spanish voice found'));
      } else {
        list.forEach(function (v) {
          voiceSel.appendChild(el('option', {
            value: v.voiceURI,
            selected: v.voiceURI === s.voiceURI ? true : null
          }, v.name + ' (' + v.lang + ')' + (v.localService ? '' : ' — online')));
        });
      }
    });
    voiceSel.onchange = function () {
      s.voiceURI = voiceSel.value;
      PARLA.store.save();
      ui.say('Hola, así sueno yo.');
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

    voiceCard.appendChild(el('div.btn-row',
      el('button', { onclick: function () { ui.say('Buenos días. ¿Qué tal estás hoy?'); } }, '🔊 Test voice')));
    main.appendChild(voiceCard);

    /* — practice — */
    main.appendChild(ui.sectionTitle('Practice'));
    main.appendChild(el('div.card',
      toggle('Reopen the microphone automatically', s.autoListen, function (v) {
        s.autoListen = v; PARLA.store.save();
      }, 'Hands-free: the mic reopens as soon as your partner finishes speaking.'),
      toggle('Show English translations', s.showTranslations, function (v) {
        s.showTranslations = v; PARLA.store.save();
      }, 'Turn this off once you can cope — it is the fastest way to improve.'),
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
