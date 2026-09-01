/* Parla — vocabulary review and the conjugation trainer */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  /* ── Vocabulary review (SRS) ────────────────────────────── */

  /* Strip a word down to what actually matters for a typed answer: no case, no
   * accents, no punctuation, no leading article. Someone who types "cuenta"
   * for "la cuenta" knows the word; failing them teaches nothing except that
   * the app is fussy. Accents are flagged separately rather than failed,
   * because they DO matter and a near miss is worth naming. */
  function bare(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ ]/g, ' ')
      .replace(/^(el|la|los|las|un|una|unos|unas)\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Same, but accents kept — so "cafe" and "café" can be told apart. */
  function bareAccented(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-záéíóúüñ0-9 ]/g, ' ')
      .replace(/^(el|la|los|las|un|una|unos|unas)\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function judge(typed, want) {
    var a = bare(typed), b = bare(want);
    if (!a) return 'empty';
    if (a === b) {
      return bareAccented(typed) === bareAccented(want) ? 'right' : 'accents';
    }
    // One transposition, insertion or deletion away: a slip, not a gap.
    if (Math.abs(a.length - b.length) <= 1 && editDistance(a, b) <= 1) return 'close';
    return 'wrong';
  }

  function editDistance(a, b) {
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }

  /* ── Vocabulary review (SRS) ────────────────────────────── */

  function viewReview() {
    init();
    var st = PARLA.store.state;
    var vocab = PARLA.data.es.vocab;

    /* The deck is the word list PLUS the phrases you reached for in
     * conversation and could not produce. Those are the best review candidates
     * there are: you have already demonstrated you wanted them. */
    var items = {};
    vocab.forEach(function (v) {
      items[v[0]] = { es: v[0], en: v[1], pos: v[2], exEs: v[3], exEn: v[4] };
    });
    (st.phrases || []).forEach(function (p) {
      if (!items[p.es]) {
        items[p.es] = { es: p.es, en: p.en, pos: 'your phrase', exEs: '', exEn: '', mine: true };
      }
    });

    var keys = Object.keys(items);
    // Phrases you personally got stuck on go to the front of the new-card pile.
    keys.sort(function (a, b) { return (items[b].mine ? 1 : 0) - (items[a].mine ? 1 : 0); });
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

    var i = 0, revealed = false, correctCount = 0, streak = 0, bestStreak = 0;
    var pref = 'auto';          // auto | recall | produce | cloze | listen | speak
    var listenHandle = null;
    var typedState = null;      // null | 'right' | 'accents' | 'close' | 'wrong'
    var typedText = '';         // what they actually wrote, for the verdict

    /* Which drill suits this card right now.
     *
     * Recognising a word is the easy half and stops teaching you anything once
     * you can do it. So the drill escalates as a card matures: see it, then
     * hear it, then produce it, then produce it inside a sentence. A word you
     * have lapsed on drops back to the easy end rather than being hammered. */
    function modeFor(key) {
      if (pref !== 'auto') return pref;
      var c = st.srs[key];
      var it = items[key];
      if (!c || (c.reps || 0) === 0) return 'recall';
      if (PARLA.srs.isLeech(c)) return 'recall';
      if ((c.reps || 0) <= 2) return 'listen';
      if (it.exEs && clozeOf(it) && (c.reps % 2 === 0)) return 'cloze';
      if ((c.reps || 0) >= 5 && c.reps % 3 === 0 && PARLA.speech.supported) return 'speak';
      return 'produce';
    }

    /* The example sentence with the target word punched out of it. Returns null
     * when the word does not literally appear — plenty of examples use a
     * conjugated or plural form, and a blank you cannot fill is just cruel. */
    function clozeOf(it) {
      if (!it.exEs) return null;
      var target = bare(it.es);
      if (!target) return null;
      var words = target.split(' ');
      var head = words[words.length - 1];      // "la cuenta" -> "cuenta"
      var re = new RegExp('(^|[^a-zA-Zá-úñ])(' + head + ')([^a-zA-Zá-úñ]|$)', 'i');
      var m = it.exEs.normalize('NFC').match(re);
      if (!m) return null;
      return {
        before: it.exEs.slice(0, m.index + m[1].length),
        answer: m[2],
        after: it.exEs.slice(m.index + m[1].length + m[2].length)
      };
    }

    var head = el('div.row', { style: { marginBottom: '10px' } });
    var counter = el('span.chip');
    var streakChip = el('span.chip.good', { hidden: true });
    head.appendChild(counter);
    head.appendChild(streakChip);
    head.appendChild(el('div.spacer'));
    head.appendChild(ui.segmented([
      ['auto', '✨ Mixed'],
      ['recall', 'ES→EN'],
      ['produce', 'EN→ES'],
      ['cloze', 'Fill in'],
      ['listen', '👂'],
      ['speak', '🎙']
    ], pref, function (m) {
      pref = m; revealed = false; typedState = null; typedText = ''; render();
    }));
    main.appendChild(head);

    var bar = el('div.progress-bar', el('div.fill'));
    main.appendChild(bar);

    var cardWrap = el('div');
    main.appendChild(cardWrap);

    function grade(q) {
      var key = queue[i];
      st.srs[key] = PARLA.srs.grade(st.srs[key], q);
      st.progress.totals.reviews++;
      if (q >= 3) { correctCount++; streak++; if (streak > bestStreak) bestStreak = streak; }
      else streak = 0;
      PARLA.store.save();
      i++; revealed = false; typedState = null; typedText = '';
      if (listenHandle) { listenHandle.abort(); listenHandle = null; }
      if (i >= queue.length) return done();
      render();
    }

    function done() {
      PARLA.store.creditDay(queue.length * 3);
      if (PARLA.decor && correctCount === queue.length) PARLA.decor.confetti(90);
      ui.clear(cardWrap);
      ui.clear(head);
      bar.remove();
      cardWrap.appendChild(el('h1', 'Review done'));
      cardWrap.appendChild(el('div.grid.four',
        ui.stat(queue.length, 'cards'),
        ui.stat(correctCount, 'right'),
        ui.stat(bestStreak, 'best run'),
        ui.stat('+' + queue.length * 3, 'xp')
      ));
      cardWrap.appendChild(el('div.btn-row', { style: { marginTop: '18px' } },
        el('button.primary', { onclick: function () { PARLA.app.go('scenarios'); } }, 'Now go talk'),
        el('button', { onclick: function () { PARLA.app.go('home'); } }, 'Home')
      ));
    }

    /* Shared by every typed mode.
     *
     * The verdict is rebuilt from state on each render rather than written
     * once into the DOM: answering triggers a re-render, and a verdict that
     * only existed as a mutated node was thrown away by it - it flashed on
     * screen for one frame and vanished. */
    function verdictNode(want) {
      if (!typedState) return null;
      if (typedState === 'right') {
        return el('div.answer-state.ok', '✓ ' + want);
      }
      if (typedState === 'accents') {
        return el('div.answer-state.near', '≈ ' + want + ' — right word, watch the accents');
      }
      if (typedState === 'close') {
        return el('div.answer-state.near', '≈ ' + want + ' — one letter out');
      }
      return el('div.answer-state.no',
        '✗ ' + want + (typedText ? ' — you wrote “' + typedText + '”' : ''));
    }

    function typedAnswer(card, want, onDone) {
      var input = el('input.answer-input', {
        type: 'text', autocomplete: 'off', autocorrect: 'off',
        autocapitalize: 'none', spellcheck: 'false',
        placeholder: 'type it in Spanish'
      });

      function submit() {
        if (typedState) return;                 // already answered
        var verdict = judge(input.value, want);
        if (verdict === 'empty') { input.focus(); return; }
        typedState = verdict;
        typedText = input.value.trim();
        revealed = true;
        ui.say(want);
        onDone();
      }

      input.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
      card.appendChild(el('div.answer-row', input,
        el('button.primary', { onclick: submit }, 'Check')));
      setTimeout(function () { input.focus(); }, 30);
    }

    /* What the SRS should hear about a typed answer, before the person
     * overrides it. Near misses are "hard", not "wrong": they knew it. */
    var TYPED_GRADE = { right: 4, accents: 3, close: 3, wrong: 0 };

    function render() {
      ui.clear(cardWrap);
      var key = queue[i];
      var it = items[key];
      if (!it) { grade(4); return; }

      var mode = modeFor(key);
      counter.textContent = (i + 1) + ' / ' + queue.length;
      streakChip.hidden = streak < 3;
      streakChip.textContent = '🔥 ' + streak + ' in a row';
      bar.firstChild.style.width = Math.round((i / queue.length) * 100) + '%';

      var card = el('div.flashcard', { 'data-mode': mode });
      var showGrades = true;

      if (mode === 'recall') {
        card.appendChild(el('div.pos', it.mine ? 'your phrase' : it.pos));
        card.appendChild(el('div.prompt.es', it.es));
        card.appendChild(el('div', ui.speakBtn(it.es, '🔊 Listen')));
        if (revealed) {
          card.appendChild(el('div.answer', it.en));
          if (it.exEs) card.appendChild(el('div.example.es', it.exEs));
          if (it.exEn) card.appendChild(el('div.example-en', it.exEn));
        }

      } else if (mode === 'listen') {
        // No text at all until they commit — otherwise they read rather than hear.
        card.appendChild(el('div.pos', 'listen and say what it means'));
        card.appendChild(el('div.prompt.listen-prompt', revealed ? it.es : '👂'));
        card.appendChild(el('div',
          el('button.primary', { onclick: function () { ui.say(it.es); } }, '🔊 Play again')));
        if (revealed) {
          card.appendChild(el('div.answer', it.en));
          if (it.exEs) card.appendChild(el('div.example.es', it.exEs));
        }
        if (!revealed) setTimeout(function () { ui.say(it.es); }, 250);

      } else if (mode === 'cloze') {
        var cl = clozeOf(it);
        if (!cl) { pref = pref === 'cloze' ? 'produce' : pref; render(); return; }
        card.appendChild(el('div.pos', 'fill in the gap'));
        card.appendChild(el('div.prompt.es.cloze',
          cl.before, el('span.blank', typedState ? cl.answer : '_____'), cl.after));
        if (it.exEn) card.appendChild(el('div.example-en', it.exEn));
        if (!typedState) {
          showGrades = false;
          typedAnswer(card, cl.answer, function () { render(); });
        } else {
          card.appendChild(verdictNode(cl.answer));
          card.appendChild(el('div.answer', it.es + ' — ' + it.en));
        }

      } else if (mode === 'produce') {
        card.appendChild(el('div.pos', 'write it in Spanish'));
        card.appendChild(el('div.prompt', it.en));
        if (!typedState) {
          showGrades = false;
          typedAnswer(card, it.es, function () { render(); });
        } else {
          card.appendChild(verdictNode(it.es));
          card.appendChild(el('div.answer.es', { style: { fontSize: '1.5rem' } }, it.es));
          if (it.exEs) card.appendChild(el('div.example.es', it.exEs));
          if (it.exEn) card.appendChild(el('div.example-en', it.exEn));
        }

      } else {
        // Pronunciation: read it aloud and let recognition judge.
        showGrades = false;
        card.appendChild(el('div.pos', 'read this aloud'));
        card.appendChild(el('div.prompt.es', it.es));
        card.appendChild(el('div.example-en', it.en));
        card.appendChild(el('div', ui.speakBtn(it.es, '🔊 Hear it first')));
        var verdict = el('div.mic-label');
        card.appendChild(verdict);

        var micB = el('button.primary', { style: { marginTop: '6px' } }, '🎙 Speak');
        micB.onclick = function () {
          if (!PARLA.speech.supported) {
            verdict.textContent = 'No microphone in this browser — use another mode.';
            return;
          }
          if (listenHandle) { listenHandle.stop(); return; }
          micB.textContent = '⏹ Stop';
          listenHandle = PARLA.speech.listen({
            lang: 'es',
            silenceMs: 1200,
            onpartial: function (t) { verdict.textContent = t; },
            onfinal: function (t) {
              var v = judge(t, it.es);
              var hit = v === 'right' || v === 'accents' || v === 'close';
              verdict.innerHTML = '';
              verdict.appendChild(el('div.answer-state.' + (hit ? 'ok' : 'no'),
                hit ? '✓ Heard: “' + t + '”'
                    : '✗ Heard: “' + t + '” — expected “' + it.es + '”'));
              revealed = true;
              setTimeout(function () { grade(hit ? 4 : 0); }, hit ? 900 : 2200);
            },
            onerror: function (k) { verdict.textContent = 'Mic: ' + k; },
            onend: function () { listenHandle = null; micB.textContent = '🎙 Speak'; }
          });
        };
        card.appendChild(micB);
      }

      cardWrap.appendChild(card);

      if (showGrades) {
        if (!revealed) {
          cardWrap.appendChild(el('button.primary.wide.big', {
            style: { marginTop: '12px' },
            onclick: function () { revealed = true; render(); }
          }, 'Show answer'));
        } else {
          var row = el('div.grade-row');
          // A typed answer already knows how it went, so the button matching
          // that verdict is highlighted rather than leaving a blank choice.
          var suggested = typedState ? TYPED_GRADE[typedState] : null;
          [['g0', 0, 'Again', 'today'], ['g3', 3, 'Hard', 'soon'],
           ['g4', 4, 'Good', 'later'], ['g5', 5, 'Easy', 'much later']].forEach(function (g) {
            row.appendChild(el('button.' + g[0], {
              'data-suggested': suggested === g[1] ? 'yes' : null,
              onclick: function () { grade(g[1]); }
            }, g[2], el('small', g[3])));
          });
          cardWrap.appendChild(row);
        }
      }

      var c = st.srs[key];
      cardWrap.appendChild(el('div.small.faint.center', { style: { marginTop: '10px' } },
        (it.mine ? 'from your conversation · ' : '') +
        (c ? 'seen ' + (c.reps || 0) + '× · interval ' + (c.interval || 0) + 'd' +
             (PARLA.srs.isLeech(c) ? ' · ⚠ trouble word' : '')
           : 'new word')));
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
