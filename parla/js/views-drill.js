/* Parla — vocabulary review and the conjugation trainer */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  /* ── Vocabulary review (SRS) ────────────────────────────── */

  function viewReview() {
    init();
    var st = PARLA.store.state;
    var vocab = PARLA.data.es.vocab;
    var byKey = {};
    vocab.forEach(function (v) { byKey[v[0]] = v; });

    var keys = vocab.map(function (v) { return v[0]; });
    var queue = PARLA.srs.buildQueue(keys, st.srs, { maxNew: 12, maxTotal: 40 });

    var main = el('main');
    var stats = PARLA.srs.stats(keys, st.srs);

    if (!queue.length) {
      main.appendChild(el('h1', 'Nothing due'));
      main.appendChild(ui.empty('🌱', 'You are all caught up',
        'Come back tomorrow — or go talk to someone, which is where the words actually stick.'));
      main.appendChild(el('div.grid.four', { style: { marginTop: '18px' } },
        ui.stat(stats.seen, 'learned'),
        ui.stat(stats.mature, 'mature'),
        ui.stat(stats.fresh, 'unseen'),
        ui.stat(stats.leeches, 'trouble')
      ));
      main.appendChild(el('div.btn-row', { style: { marginTop: '16px' } },
        el('button.primary', { onclick: function () { PARLA.app.go('scenarios'); } }, 'Go talk instead')));
      return main;
    }

    var i = 0, revealed = false, correctCount = 0;
    var mode = 'recall';   // recall | produce | speak
    var listenHandle = null;

    var head = el('div.row', { style: { marginBottom: '12px' } });
    var counter = el('span.chip');
    head.appendChild(counter);
    head.appendChild(el('div.spacer'));
    head.appendChild(ui.segmented([
      ['recall', 'ES → EN'],
      ['produce', 'EN → ES'],
      ['speak', '🎙 Say it']
    ], mode, function (m) {
      mode = m; revealed = false; render();
    }));
    main.appendChild(head);

    var cardWrap = el('div');
    main.appendChild(cardWrap);

    function grade(q) {
      var key = queue[i];
      st.srs[key] = PARLA.srs.grade(st.srs[key], q);
      st.progress.totals.reviews++;
      if (q >= 3) correctCount++;
      PARLA.store.save();
      i++; revealed = false;
      if (listenHandle) { listenHandle.abort(); listenHandle = null; }
      if (i >= queue.length) return done();
      render();
    }

    function done() {
      PARLA.store.creditDay(queue.length * 3);
      ui.clear(cardWrap);
      ui.clear(head);
      cardWrap.appendChild(el('h1', 'Review done'));
      cardWrap.appendChild(el('div.grid.three',
        ui.stat(queue.length, 'cards'),
        ui.stat(correctCount, 'right'),
        ui.stat('+' + queue.length * 3, 'xp')
      ));
      cardWrap.appendChild(el('div.btn-row', { style: { marginTop: '18px' } },
        el('button.primary', { onclick: function () { PARLA.app.go('scenarios'); } }, 'Now go talk'),
        el('button', { onclick: function () { PARLA.app.go('home'); } }, 'Home')
      ));
    }

    function render() {
      ui.clear(cardWrap);
      var key = queue[i];
      var v = byKey[key];
      if (!v) { grade(4); return; }

      var es = v[0], en = v[1], pos = v[2], exEs = v[3], exEn = v[4];
      var card = el('div.flashcard');
      counter.textContent = (i + 1) + ' / ' + queue.length;

      if (mode === 'recall') {
        card.appendChild(el('div.pos', pos));
        card.appendChild(el('div.prompt.es', es));
        card.appendChild(el('div', ui.speakBtn(es, '🔊 Listen')));
        if (revealed) {
          card.appendChild(el('div.answer', en));
          card.appendChild(el('div.example.es', exEs));
          card.appendChild(el('div.example-en', exEn));
        }
      } else if (mode === 'produce') {
        card.appendChild(el('div.pos', 'say it in Spanish'));
        card.appendChild(el('div.prompt', en));
        if (revealed) {
          card.appendChild(el('div.answer.es', { style: { fontSize: '1.6rem' } }, es));
          card.appendChild(el('div', ui.speakBtn(es, '🔊 Listen')));
          card.appendChild(el('div.example.es', exEs));
          card.appendChild(el('div.example-en', exEn));
        }
      } else {
        // Pronunciation check: read the Spanish aloud and let recognition judge it.
        card.appendChild(el('div.pos', 'read this aloud'));
        card.appendChild(el('div.prompt.es', es));
        card.appendChild(el('div.example-en', en));
        card.appendChild(el('div', ui.speakBtn(es, '🔊 Hear it first')));
        var verdict = el('div.mic-label');
        card.appendChild(verdict);

        var micB = el('button.primary', { style: { marginTop: '6px' } }, '🎙 Speak');
        micB.onclick = function () {
          if (!PARLA.speech.supported) {
            verdict.textContent = 'No microphone in this browser — use the ES → EN mode instead.';
            return;
          }
          if (listenHandle) { listenHandle.stop(); return; }
          micB.textContent = '⏹ Stop';
          listenHandle = PARLA.speech.listen({
            lang: 'es',
            onpartial: function (t) { verdict.textContent = t; },
            onfinal: function (t) {
              var heard = PARLA.brain.normalise(t);
              var want = PARLA.brain.normalise(es);
              var hit = heard === want || heard.indexOf(want) !== -1 || want.indexOf(heard) !== -1;
              verdict.innerHTML = '';
              verdict.appendChild(el('div.answer-state.' + (hit ? 'ok' : 'no'),
                hit ? '✓ Heard: “' + t + '”' : '✗ Heard: “' + t + '” — expected “' + es + '”'));
              revealed = true;
              // Nudge the grade toward what the microphone actually heard.
              setTimeout(function () { grade(hit ? 4 : 0); }, hit ? 900 : 2200);
            },
            onerror: function (k) { verdict.textContent = 'Mic: ' + k; },
            onend: function () { listenHandle = null; micB.textContent = '🎙 Speak'; }
          });
        };
        card.appendChild(micB);
      }

      cardWrap.appendChild(card);

      if (mode !== 'speak') {
        if (!revealed) {
          cardWrap.appendChild(el('button.primary.wide.big', {
            style: { marginTop: '12px' },
            onclick: function () { revealed = true; render(); }
          }, 'Show answer'));
        } else {
          var row = el('div.grade-row');
          [['g0', 0, 'Again', 'today'], ['g3', 3, 'Hard', 'soon'],
           ['g4', 4, 'Good', 'later'], ['g5', 5, 'Easy', 'much later']].forEach(function (g) {
            row.appendChild(el('button.' + g[0], { onclick: function () { grade(g[1]); } },
              g[2], el('small', g[3])));
          });
          cardWrap.appendChild(row);
        }
      }

      var card2 = st.srs[key];
      cardWrap.appendChild(el('div.small.faint.center', { style: { marginTop: '10px' } },
        card2
          ? 'seen ' + (card2.reps || 0) + '× · interval ' + (card2.interval || 0) + 'd' +
            (PARLA.srs.isLeech(card2) ? ' · ⚠ trouble word' : '')
          : 'new word'));
    }

    render();

    main._onLeave = function () {
      if (listenHandle) listenHandle.abort();
      PARLA.speech.cancel();
    };
    return main;
  }

  /* ── Conjugation trainer ────────────────────────────────── */

  function viewConjugate() {
    init();
    var st = PARLA.store.state;
    var V = PARLA.data.es.verbs;
    var main = el('main');

    var tenseKeys = Object.keys(V.tenses);
    var chosenTenses = ['presente'];
    var streak = 0, best = 0, asked = 0, right = 0;
    var current = null, checked = false;
    var listenHandle = null;

    main.appendChild(el('h1', 'Conjugation trainer'));
    main.appendChild(el('p.muted',
      'Every form is generated from the rules, so irregulars and stem-changers are all here.'));

    /* tense selector */
    var tenseRow = el('div.row.wrap', { style: { marginBottom: '14px' } });
    tenseKeys.forEach(function (t) {
      var b = el('button', { 'aria-pressed': String(chosenTenses.indexOf(t) !== -1) },
        V.tenses[t].label);
      b.style.fontSize = '.82rem';
      function paint() {
        var on = chosenTenses.indexOf(t) !== -1;
        b.setAttribute('aria-pressed', String(on));
        b.style.background = on ? 'var(--accent)' : '';
        b.style.color = on ? 'var(--accent-ink)' : '';
        b.style.borderColor = on ? 'transparent' : '';
      }
      b.onclick = function () {
        var idx = chosenTenses.indexOf(t);
        if (idx === -1) chosenTenses.push(t);
        else if (chosenTenses.length > 1) chosenTenses.splice(idx, 1);
        paint();
        next();
      };
      paint();
      tenseRow.appendChild(b);
    });
    main.appendChild(tenseRow);

    var scoreChip = el('div.row', { style: { marginBottom: '10px' } },
      el('span.chip.hot', '🔥 streak 0'),
      el('span.chip', '0 / 0'));
    main.appendChild(scoreChip);

    var wrap = el('div');
    main.appendChild(wrap);

    function pick() {
      var verbs = V.list.filter(function (v) {
        // Respect the learner's declared level: A1 learners are not drilled on B1 verbs.
        var order = { a1: 0, a2: 1, b1: 2, b2: 3 };
        return order[v[2]] <= (order[st.profile.level] == null ? 0 : order[st.profile.level]) + 1;
      });
      if (!verbs.length) verbs = V.list;

      var verb = verbs[Math.floor(Math.random() * verbs.length)];
      var tense = chosenTenses[Math.floor(Math.random() * chosenTenses.length)];
      var forms = V.conjugate(verb[0], tense);
      if (!forms) return pick();
      var person = Math.floor(Math.random() * 6);
      return { verb: verb, tense: tense, person: person, answer: forms[person], forms: forms };
    }

    function next() {
      current = pick();
      checked = false;
      render();
    }

    function score(ok) {
      asked++;
      if (ok) { right++; streak++; if (streak > best) best = streak; }
      else streak = 0;
      st.progress.totals.conjugations++;
      if (asked % 5 === 0) PARLA.store.creditDay(10);
      PARLA.store.save();
      scoreChip.firstChild.textContent = '🔥 streak ' + streak;
      scoreChip.lastChild.textContent = right + ' / ' + asked;
    }

    function render() {
      ui.clear(wrap);
      var c = current;
      var card = el('div.flashcard');

      card.appendChild(el('div.pos', V.tenses[c.tense].label +
        (V.isIrregular(c.verb[0]) ? ' · irregular' : '')));
      card.appendChild(el('div.prompt.es', c.verb[0]));
      card.appendChild(el('div.small.faint', c.verb[1]));
      card.appendChild(el('div.answer', V.pronouns[c.person]));

      var input = el('input', {
        type: 'text', placeholder: 'type the form…', autocomplete: 'off',
        autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
        style: { maxWidth: '260px', margin: '8px auto 0', textAlign: 'center',
                 fontFamily: 'var(--serif)', fontSize: '1.15rem' }
      });
      input.onkeydown = function (e) { if (e.key === 'Enter') check(input.value); };
      card.appendChild(input);

      var verdict = el('div');
      card.appendChild(verdict);
      wrap.appendChild(card);

      function check(val) {
        if (checked) return;
        var ok = PARLA.brain.normalise(val) === PARLA.brain.normalise(c.answer);
        checked = true;
        score(ok);
        ui.clear(verdict);
        verdict.appendChild(el('div.answer-state.' + (ok ? 'ok' : 'no'),
          ok ? '✓ ' + c.answer : '✗ ' + (val || '—') + '  →  ' + c.answer));
        ui.say(c.answer);
        showTable();
      }

      function showTable() {
        var t = el('table.conj-table');
        c.forms.forEach(function (f, idx) {
          var tr = el('tr',
            el('td', V.pronouns[idx]),
            el('td', f));
          if (idx === c.person) {
            tr.style.background = 'var(--accent-soft)';
            tr.style.fontWeight = '700';
          }
          t.appendChild(tr);
        });
        wrap.appendChild(el('div.card', { style: { marginTop: '12px' } },
          el('div.small.faint', { style: { marginBottom: '6px' } },
            c.verb[0] + ' — ' + V.tenses[c.tense].label),
          t));
        wrap.appendChild(el('button.primary.wide.big', {
          style: { marginTop: '12px' }, onclick: next
        }, 'Next verb →'));
      }

      var btns = el('div.btn-row', { style: { marginTop: '12px', justifyContent: 'center' } },
        el('button.primary', { onclick: function () { check(input.value); } }, 'Check'),
        el('button', { onclick: function () { check(''); } }, "Don't know"));

      if (PARLA.speech.supported) {
        var micB = el('button', '🎙 Say it');
        micB.onclick = function () {
          if (listenHandle) { listenHandle.stop(); return; }
          micB.textContent = '⏹';
          listenHandle = PARLA.speech.listen({
            lang: 'es',
            onpartial: function (t) { input.value = t; },
            onfinal: function (t) { input.value = t; check(t); },
            onend: function () { listenHandle = null; micB.textContent = '🎙 Say it'; }
          });
        };
        btns.appendChild(micB);
      }
      wrap.appendChild(btns);

      setTimeout(function () { input.focus(); }, 30);
    }

    next();

    main._onLeave = function () {
      if (listenHandle) listenHandle.abort();
      PARLA.speech.cancel();
    };
    return main;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.review = viewReview;
  PARLA.views.conjugate = viewConjugate;
})();
