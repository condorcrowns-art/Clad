/* Parla — scenario picker and the conversation itself */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;

  function init() { ui = PARLA.ui; el = ui.el; }

  /* ── Scenario picker ────────────────────────────────────── */

  function viewScenarios(params) {
    init();
    var main = el('main');
    var scenarios = PARLA.data.es.scenarios;

    main.appendChild(el('h1', 'Choose something to talk about'));
    main.appendChild(el('p.muted',
      'Pick a situation. You speak, your partner answers in Spanish, and you get corrected as you go.'));

    var bb = ui.brainBanner();
    if (bb) main.appendChild(bb);

    if (!PARLA.speech.supported) {
      main.appendChild(ui.banner('warn',
        '<strong>Speech recognition is not available in this browser.</strong> ' +
        'You can still do everything by typing. For the microphone, use Chrome, Edge or Safari ' +
        'and open the app over <code>http://localhost</code> or <code>https://</code>.'));
    } else if (!PARLA.speech.secure) {
      main.appendChild(ui.banner('warn',
        'The microphone needs a secure context. Open this page via <code>http://localhost:8000</code> ' +
        'rather than <code>file://</code>.'));
    }

    // Group by category, preserving first-seen order.
    var cats = [];
    var byCat = {};
    scenarios.forEach(function (s) {
      if (!byCat[s.cat]) { byCat[s.cat] = []; cats.push(s.cat); }
      byCat[s.cat].push(s);
    });

    cats.forEach(function (c) {
      main.appendChild(ui.sectionTitle(c));
      var grid = el('div.grid.two');
      byCat[c].forEach(function (s) {
        grid.appendChild(el('button.scenario', {
          onclick: function () { PARLA.app.go('talk', { id: s.id, day: params && params.day }); }
        },
          el('span.emoji', s.emoji),
          el('span.txt', el('strong', s.title), el('span', s.setting)),
          ui.levelTag(s.level)
        ));
      });
      main.appendChild(grid);
    });

    return main;
  }

  /* ── Conversation ───────────────────────────────────────── */

  function viewTalk(params) {
    init();
    var st = PARLA.store.state;
    var scenarios = PARLA.data.es.scenarios;
    var sc = scenarios.filter(function (s) { return s.id === (params && params.id); })[0] || scenarios[0];
    var challengeDay = params && params.day != null ? params.day : null;
    var minTurns = challengeDay != null
      ? (PARLA.data.es.challenge[challengeDay] || [])[4] || 4
      : 4;

    var session = {
      history: [],            // { role:'user'|'partner', text }
      scriptState: { used: [], fb: 0 },
      turns: 0,
      words: 0,
      corrections: [],
      started: Date.now(),
      ended: false
    };

    var main = el('main');
    var thread = el('div#thread');
    var micBtn, micCancel, micLabel, typeInput, listenHandle = null;

    /* — header — */
    main.appendChild(el('div.convo-head',
      el('span.emoji', sc.emoji),
      el('div.meta',
        el('h2', sc.title),
        el('p', sc.setting)
      ),
      el('div.spacer'),
      el('button.ghost', { onclick: finish, title: 'End and save this session' }, 'Finish')
    ));

    /* — goals — */
    if (sc.goals && sc.goals.length) {
      var goalCard = el('div.card', { style: { padding: '12px 15px', marginBottom: '4px' } },
        el('div.small.faint', { style: { textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: '700' } },
          challengeDay != null ? 'Day ' + (challengeDay + 1) + ' — your goal' : 'Try to'),
        el('div.small', sc.goals.join(' · '))
      );
      main.appendChild(goalCard);
    }

    main.appendChild(thread);

    /* — mic dock — */
    var dock = el('div.mic-dock');

    if (st.settings.showTranslations && sc.phrases && sc.phrases.length) {
      var pb = el('div.phrasebook');
      sc.phrases.forEach(function (p) {
        pb.appendChild(el('button', {
          title: 'Use this phrase',
          onclick: function () { submit(p); }
        }, p));
      });
      dock.appendChild(pb);
    }

    micBtn = el('button.mic', { 'data-state': 'idle', title: 'Hold a conversation', onclick: toggleMic }, '🎙');
    // Speech recognition mishears. Without a way out, a garbled sentence had to
    // be sent and then argued with; this throws it away instead.
    micCancel = el('button.mic-cancel', {
      title: 'Discard what you just said', hidden: true, onclick: cancelListening
    }, '✕');
    micLabel = el('div.mic-label', PARLA.speech.supported
      ? 'Tap and speak in Spanish — pause when you are done'
      : 'Type your reply below');
    dock.appendChild(el('div.mic-row', micBtn, micCancel));
    dock.appendChild(micLabel);

    typeInput = el('input', {
      type: 'text', placeholder: '…or type in Spanish and press Enter',
      autocomplete: 'off', autocapitalize: 'sentences',
      onkeydown: function (e) {
        if (e.key === 'Enter' && typeInput.value.trim()) {
          var v = typeInput.value.trim();
          typeInput.value = '';
          submit(v);
        }
      }
    });
    // The moment a beginner gives up is standing there with nothing to say and
    // the mic waiting. Three things they could actually say next is the
    // difference between carrying on and closing the tab.
    var helpBtn = el('button.help-me', { type: 'button', onclick: askForHelp },
      '💡 I don\u2019t know what to say');
    var helpBox = el('div.help-box', { hidden: true });
    dock.appendChild(helpBtn);
    dock.appendChild(helpBox);

    dock.appendChild(el('div.type-fallback', typeInput,
      el('button', { onclick: function () {
        if (typeInput.value.trim()) { var v = typeInput.value.trim(); typeInput.value = ''; submit(v); }
      } }, 'Send')));

    main.appendChild(dock);

    /* — opening line — */
    addPartner(sc.opener.es, sc.opener.en, null, true);

    /* ── bubbles ── */

    function addPartner(es, en, correction, autoSpeak) {
      if (correction) addCorrection(correction);

      var b = el('div.bubble.them',
        el('div.body.es', es),
        st.settings.showTranslations && en ? el('div.trans', en) : null,
        el('div.tools',
          el('button', { onclick: function () { ui.say(es); } }, '🔊 Again'),
          el('button', { onclick: function () { ui.say(es); } , title: 'Repeat slowly'}, '🐢')
        )
      );
      // The slow button re-speaks at a reduced rate.
      b.querySelector('.tools').lastChild.onclick = function () {
        PARLA.speech.speak(es, {
          lang: 'es', voiceURI: st.settings.voiceURI,
          rate: Math.max(0.5, (st.settings.rate || 0.9) - 0.3)
        });
      };
      thread.appendChild(b);
      scrollDown();

      session.history.push({ role: 'partner', text: es });
      if (autoSpeak !== false) ui.say(es, maybeAutoListen);
    }

    function addUser(text) {
      // The recogniser will sometimes hear something else entirely. Rather than
      // leaving that in the transcript to confuse the next few turns, let it be
      // retyped - the wrong line is dropped from history, not argued with.
      var bubble = el('div.bubble.you',
        el('div.body.es', text),
        el('div.tools',
          el('button', { title: 'That is not what I said', onclick: function () {
            if (session.ended) return;
            var i = session.history.lastIndexOf(
              session.history.filter(function (m) { return m.role === 'user' && m.text === text; }).slice(-1)[0]);
            if (i !== -1) session.history.splice(i, 1);
            session.turns = Math.max(0, session.turns - 1);
            session.words = Math.max(0, session.words - PARLA.brain.words(text).length);
            bubble.remove();
            typeInput.value = text;
            typeInput.focus();
            typeInput.setSelectionRange(text.length, text.length);
          } }, '✎ Misheard')
        )
      );
      thread.appendChild(bubble);
      scrollDown();
      session.history.push({ role: 'user', text: text });
      session.turns++;
      session.words += PARLA.brain.words(text).length;
    }

    function addCorrection(c) {
      session.corrections.push(c);
      thread.appendChild(el('div.correction',
        el('div.lead', c.fixed ? 'Try it like this' : 'Heads up'),
        c.fixed ? el('div', el('span.was', c.original), ' ') : null,
        c.fixed ? el('div.now.es', c.fixed) : null,
        c.note ? el('div.note', c.note) : null,
        c.fixed ? el('div', { style: { marginTop: '5px' } },
          el('button', { style: { padding: '3px 9px', fontSize: '.75rem' },
            onclick: function () { ui.say(c.fixed); } }, '🔊 Hear it')) : null
      ));
      scrollDown();
    }

    function addThinking() {
      // A local model can take several seconds on the first turn while it loads.
      // Counting up makes that read as "working" rather than "frozen".
      var body = el('div.body', 'pensando…');
      var t = el('div.bubble.them.thinking', body);
      thread.appendChild(t);
      scrollDown();

      var started = Date.now();
      var tick = setInterval(function () {
        var secs = Math.floor((Date.now() - started) / 1000);
        if (secs >= 2) body.textContent = 'pensando… ' + secs + 's';
        if (secs === 12) {
          body.textContent += '  (first reply is slow while the model loads)';
        }
      }, 500);

      var remove = t.remove.bind(t);
      t.remove = function () { clearInterval(tick); remove(); };
      return t;
    }

    function scrollDown() {
      requestAnimationFrame(function () {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      });
    }

    /* ── mic ── */

    function setMic(state, label) {
      micBtn.setAttribute('data-state', state);
      micBtn.textContent = state === 'listening' ? '⏹' : (state === 'thinking' ? '…' : '🎙');
      micBtn.title = state === 'listening' ? 'Send what you have said' : 'Hold a conversation';
      micCancel.hidden = state !== 'listening';
      if (label != null) micLabel.textContent = label;
    }

    function toggleMic() {
      if (session.ended) return;
      // While listening, the button means "I have finished, send it" - which is
      // the escape hatch for anyone the silence timer is too patient for.
      if (listenHandle) { listenHandle.stop(); return; }
      startListening();
    }

    function cancelListening() {
      if (!listenHandle) return;
      listenHandle.abort();
      listenHandle = null;
      setMic('idle', 'Discarded. Tap and try again.');
    }

    function startListening() {
      if (!PARLA.speech.supported) {
        typeInput.focus();
        micLabel.textContent = 'No microphone here — type instead.';
        return;
      }
      var partial = '';
      var errored = false;

      listenHandle = PARLA.speech.listen({
        lang: st.profile.target || 'es',
        // How long a pause means "finished" rather than "thinking". Beginners
        // hesitate mid-sentence, and cutting them off there is what made the
        // partner answer half-sentences as though they were whole ones.
        silenceMs: st.settings.micPauseMs || PARLA.speech.defaultPauseMs || 1600,

        onstart: function () {
          errored = false;
          setMic('listening', 'Listening… pause when you are done');
        },
        onpartial: function (t) {
          partial = t;
          if (!errored) micLabel.textContent = t || 'Listening…';
        },
        onfinal: function (t, conf, alts) { submit(t, conf, alts); },
        onerror: function (kind) {
          errored = true;
          if (kind === 'not-allowed' || kind === 'service-not-allowed') {
            micLabel.textContent = 'Microphone blocked — allow it in your browser, or type below.';
          } else if (kind === 'unsupported') {
            micLabel.textContent = 'Speech recognition unavailable — type instead.';
          } else {
            micLabel.textContent = 'Mic error (' + kind + '). You can type instead.';
          }
        },
        onend: function () {
          listenHandle = null;
          if (micBtn.getAttribute('data-state') !== 'listening') return;
          // Do not stamp over an error message with a cheerful idle prompt.
          if (errored) { setMic('idle', null); return; }
          setMic('idle', partial ? 'Thinking…' : 'Did not catch that. Tap and try again.');
        }
      });
    }

    function maybeAutoListen() {
      if (session.ended) return;
      if (!st.settings.autoListen || !PARLA.speech.supported) return;
      // Long enough that the tail of the spoken reply - and its echo off the
      // desk - is not picked up as the first word of the answer.
      setTimeout(function () {
        if (!session.ended && !listenHandle && !PARLA.speech.isSpeaking()) startListening();
      }, 500);
    }

    /* The words this person is currently failing to retain, so the partner can
     * put them in front of them in a real sentence. Conversation is a better
     * drill than a flashcard, and the deck already knows what is not sticking. */
    function weakWords() {
      var deck = st.srs || {};
      var vocab = (PARLA.data[st.profile.target || 'es'] || {}).vocab || [];
      var now = Date.now();
      var scored = [];

      vocab.forEach(function (row) {
        var card = deck[row[0]];
        if (!card) return;                       // never seen it: not weak, just new
        var lapses = card.lapses || 0;
        var overdue = card.due ? (now - card.due) / 86400000 : 0;
        if (lapses === 0 && overdue < 1) return; // sticking fine, leave it alone
        scored.push({ es: row[0], score: lapses * 3 + Math.min(overdue, 10) });
      });

      scored.sort(function (a, b) { return b.score - a.score; });
      return scored.slice(0, 6).map(function (x) { return x.es; });
    }

    /* Their own recurring errors. Corrections they were given and evidently did
     * not absorb are worth catching again rather than letting slide. */
    function recentMistakes() {
      return (st.mistakes || []).slice(0, 4).map(function (m) {
        return m.fix ? (m.es + '  ->  ' + m.fix) : m.es;
      }).filter(Boolean);
    }

    /* ── stuck ── */

    function askForHelp() {
      if (session.ended) return;
      if (!helpBox.hidden) { helpBox.hidden = true; return; }   // tap again to dismiss

      ui.clear(helpBox);
      helpBox.hidden = false;
      helpBox.appendChild(el('div.small.muted', 'Thinking of a few…'));

      PARLA.brain.suggest({
        scenario: sc,
        history: session.history,
        settings: Object.assign({}, st.settings, { level: st.profile.level })
      }).then(function (res) {
        ui.clear(helpBox);
        var opts = res.options || [];
        if (!opts.length) {
          helpBox.appendChild(el('div.small.muted', 'Nothing to suggest — say anything and see what happens.'));
          return;
        }

        helpBox.appendChild(el('div.small.muted',
          res.source === 'ollama' ? 'You could say:' : 'Useful here:'));

        opts.forEach(function (o) {
          // A goal has no Spanish to offer, only a nudge about what is left to do.
          if (o.goal) {
            helpBox.appendChild(el('div.help-goal', '· ' + o.en));
            return;
          }
          var row = el('div.help-opt',
            el('button.help-say', { title: 'Hear it', onclick: function (e) {
              e.stopPropagation();
              ui.say(o.es);
            } }, '🔊'),
            el('div.help-text',
              el('div.es', o.es),
              o.en ? el('div.small.muted', o.en) : null),
            el('button.help-use', { onclick: function () {
              // Put it in the box rather than sending it: reading it out loud
              // is the point, and sending it for them is not practice.
              typeInput.value = o.es;
              typeInput.focus();
              helpBox.hidden = true;
            } }, 'Use')
          );
          helpBox.appendChild(row);
        });
      });
    }

    /* ── the turn ── */

    function submit(text, confidence, alternatives) {
      text = (text || '').trim();
      if (!text || session.ended) return;
      if (listenHandle) { listenHandle.abort(); listenHandle = null; }

      PARLA.speech.cancel();
      helpBox.hidden = true;
      addUser(text);
      setMic('thinking', 'Thinking…');
      var thinking = addThinking();

      // A name is worth catching ourselves rather than trusting the model to,
      // since it is the one fact whose absence makes the partner feel broken.
      var spokenName = PARLA.brain.extractName(text);
      if (spokenName && st.memory.name !== spokenName) {
        st.memory.name = spokenName;
        PARLA.store.save();
      }

      PARLA.brain.reply({
        scenario: sc,
        history: session.history.slice(0, -1),
        text: text,
        // How much the recogniser trusted its own transcript, so the partner
        // can ask instead of confidently answering something never said.
        confidence: confidence || 0,
        alternatives: alternatives || [],
        // Carried between sessions: who this person is, what they keep getting
        // wrong, and which words they are currently failing to retain.
        memory: st.memory,
        targetWords: weakWords(),
        pastMistakes: recentMistakes(),
        settings: Object.assign({}, st.settings, { level: st.profile.level }),
        scriptState: session.scriptState
      }).then(function (out) {
        thinking.remove();
        setMic('idle', 'Tap and speak in Spanish');

        if (out.degraded && !session.warned) {
          session.warned = true;
          // The backend died after boot said it was fine — refresh the health
          // state so the status chip stops claiming everything is well.
          if (PARLA.app.checkBrainHealth) PARLA.app.checkBrainHealth();
          thread.appendChild(ui.banner('warn',
            'Could not reach the ' + st.settings.brain + ' backend, so this is the built-in ' +
            'scripted partner. Practice continues either way. <br><span class="small">' +
            (out.error || '') + '</span>'));
        }

        addPartner(out.es, out.en, out.correction);

        // Being asked to repeat yourself is not a turn of conversation, so it
        // must not earn XP or tick off a challenge day.
        if (out.askedToRepeat) session.turns = Math.max(0, session.turns - 1);

        // Anything it learned about this person outlives the session.
        if (out.remember && out.remember.length) PARLA.store.remember(out.remember);

        if (session.turns >= minTurns && !session.hinted) {
          session.hinted = true;
          ui.toast('Goal reached — keep going, or tap Finish to bank it.', 'good');
        }
      });
    }

    /* ── ending ── */

    function finish() {
      if (session.ended) return;
      session.ended = true;
      if (listenHandle) listenHandle.abort();
      PARLA.speech.cancel();

      var mins = Math.max(0.5, (Date.now() - session.started) / 60000);
      var xp = session.turns * 8 + (session.turns >= minTurns ? 25 : 0);

      var p = st.progress;
      p.totals.sessions++;
      p.totals.turns += session.turns;
      p.totals.words += session.words;
      p.totals.minutes += mins;
      p.totals.corrections += session.corrections.length;

      session.corrections.forEach(function (c) {
        if (!c.fixed) return;
        st.mistakes.unshift({
          es: c.original, fix: c.fixed, note: c.note,
          when: Date.now(), scenario: sc.id
        });
      });
      st.mistakes = st.mistakes.slice(0, 200);

      st.history.unshift({
        when: Date.now(), scenarioId: sc.id, turns: session.turns, xp: xp
      });
      st.history = st.history.slice(0, 100);

      var completedDay = false;
      if (challengeDay != null && session.turns >= minTurns) {
        if (p.challengeDone.indexOf(challengeDay) === -1) {
          p.challengeDone.push(challengeDay);
          completedDay = true;
        }
        if (challengeDay === p.challengeDay) p.challengeDay = Math.min(59, p.challengeDay + 1);
      }

      var levelBefore = PARLA.store.level();   // reads live state, so take it first
      PARLA.store.creditDay(xp);

      // Mark the moments actually worth marking: banking a session that met
      // its goal, and crossing a level. Not every turn - constant celebration
      // is the same as none.
      if (PARLA.decor) {
        var levelled = PARLA.store.level() > levelBefore;
        if (levelled) PARLA.decor.confetti(140);
        else if (session.turns >= minTurns) PARLA.decor.confetti(60);
      }
      PARLA.store.save();

      PARLA.app.go('summary', {
        turns: session.turns, xp: xp, mins: mins,
        corrections: session.corrections, scenario: sc.title,
        completedDay: completedDay, day: challengeDay,
        shortOf: session.turns < minTurns ? minTurns : 0
      });
    }

    main._onLeave = function () {
      if (listenHandle) listenHandle.abort();
      PARLA.speech.cancel();
      session.ended = true;
    };

    return main;
  }

  /* ── Session summary ────────────────────────────────────── */

  function viewSummary(p) {
    init();
    p = p || {};
    var main = el('main');

    main.appendChild(el('h1', p.completedDay ? '🎉 Day complete' : '✅ Session saved'));
    main.appendChild(el('p.muted', p.scenario || ''));

    if (p.shortOf) {
      main.appendChild(ui.banner('info',
        'You did ' + p.turns + ' turn' + (p.turns === 1 ? '' : 's') + '. ' +
        'The goal was ' + p.shortOf + ' — it still counts, but go a little longer next time.'));
    }

    main.appendChild(el('div.grid.four',
      ui.stat(p.turns || 0, 'turns'),
      ui.stat('+' + (p.xp || 0), 'xp'),
      ui.stat(ui.dur(p.mins), 'spoken'),
      ui.stat((p.corrections || []).length, 'fixes')
    ));

    if (p.corrections && p.corrections.length) {
      main.appendChild(ui.sectionTitle('What to remember'));
      var stack = el('div.stack');
      p.corrections.forEach(function (c) {
        stack.appendChild(el('div.mistake',
          c.fixed ? el('div.was', c.original) : null,
          c.fixed ? el('div.now.es', c.fixed) : el('div.now', c.original),
          c.note ? el('div.note', c.note) : null
        ));
      });
      main.appendChild(stack);
    } else {
      main.appendChild(ui.empty('✨', 'No corrections this time', 'Either you were sharp, or push yourself harder next round.'));
    }

    main.appendChild(el('div.btn-row', { style: { marginTop: '20px' } },
      el('button.primary', { onclick: function () { PARLA.app.go('scenarios'); } }, 'Talk again'),
      el('button', { onclick: function () { PARLA.app.go('home'); } }, 'Home'),
      el('button', { onclick: function () { PARLA.app.go('challenge'); } }, '60-day plan')
    ));

    return main;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.scenarios = viewScenarios;
  PARLA.views.talk = viewTalk;
  PARLA.views.summary = viewSummary;
})();
