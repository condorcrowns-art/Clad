/* Parla — reading
 *
 * The one activity a learner will do voluntarily for twenty minutes, and the
 * app had nothing for it. Drills build the pieces; reading is where the pieces
 * turn into a language, because it is the only place a word turns up in a
 * sentence somebody meant.
 *
 * The thing that makes reading possible before you are ready for it is that
 * every word is one tap from its meaning. Not a translation of the sentence —
 * that just means reading the English — but the word you are stuck on, its
 * dictionary form, and what it is doing here: "tiene — present, él/ella — from
 * tener, to have". That runs on the dictionary and the morphology engine, so
 * it works with the phone in aeroplane mode.
 *
 *   read   the shelf: twelve texts, A1 to B1
 *   text   one of them, with audio, tap-to-understand and questions
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  var LEVEL_NAME = { a1: 'Starting out', a2: 'Getting going', b1: 'Finding your feet' };

  function progressOf(id) {
    return (PARLA.store.state.reading || {})[id] || null;
  }

  /* ── The shelf ────────────────────────────────────────────*/
  function viewRead() {
    init();
    var main = el('main');
    var texts = PARLA.data.es.reading || [];

    main.appendChild(el('h1', 'Read'));
    main.appendChild(el('p.muted',
      'Twelve short stories. Tap any word to find out what it is — the meaning, ' +
      'the dictionary form, and what the ending is doing. Nothing here needs a ' +
      'connection.'));

    var done = texts.filter(function (t) { return progressOf(t.id); }).length;
    if (done) {
      main.appendChild(ui.banner('info',
        el('div', el('strong', done + ' of ' + texts.length + ' read'),
          el('div.small', done === texts.length
            ? 'All of them. Read the ones you found hard again — the second time is where it sticks.'
            : 'Keep going down the list; each one leans on the one before.'))));
    }

    ['a1', 'a2', 'b1'].forEach(function (lvl) {
      var group = texts.filter(function (t) { return t.level === lvl; });
      if (!group.length) return;
      main.appendChild(ui.sectionTitle(LEVEL_NAME[lvl], ui.levelTag(lvl)));
      var list = el('div.stack');
      group.forEach(function (t) { list.appendChild(card(t)); });
      main.appendChild(list);
    });

    function card(t) {
      var p = progressOf(t.id);
      return el('button.read-card' + (p ? '.read-done' : ''),
        { onclick: function () { PARLA.app.go('text', { id: t.id }); } },
        el('div.read-main',
          el('div.read-title', t.title),
          el('div.read-blurb', t.blurb),
          el('div.read-meta',
            el('span', t.minutes + ' min'),
            el('span', t.lines.length + ' lines'),
            p && p.asked ? el('span.chip.good', p.right + '/' + p.asked) : null)),
        el('span.read-go', p ? '↺' : '→'));
    }

    return main;
  }

  /* ── One text ─────────────────────────────────────────────*/
  function viewText(params) {
    init();
    var t = (PARLA.data.es.readingById || {})[(params || {}).id];
    var main = el('main');

    if (!t) {
      main.appendChild(ui.empty('📖', 'No such text',
        'It may have been renamed. Pick one from the list.'));
      main.appendChild(el('div.btn-row',
        el('button.primary', { onclick: function () { PARLA.app.go('read'); } }, 'Back to the list')));
      return main;
    }

    var showEn = false;      // every translation at once
    var playing = false;     // reading the whole thing aloud
    var stopPlay = null;

    main.appendChild(el('div.crumb',
      el('button.ghost.small-btn', { onclick: function () { PARLA.app.go('read'); } }, '← Read'),
      ui.levelTag(t.level)));
    main.appendChild(el('h1', t.title));
    main.appendChild(el('p.muted', t.blurb));

    /* — the controls — */
    var playBtn = el('button', { onclick: function () { playing ? stop() : playAll(); } },
      '▶ Read it to me');
    var enBtn = el('button', { onclick: function () {
      showEn = !showEn;
      enBtn.textContent = showEn ? '🙈 Hide English' : '👁 Show English';
      Array.prototype.forEach.call(body.querySelectorAll('.rd-en'), function (n) {
        n.hidden = !showEn;
      });
    } }, '👁 Show English');
    main.appendChild(el('div.btn-row.read-tools', playBtn, enBtn));
    main.appendChild(el('p.small.faint.read-hint',
      'Tap a word for its meaning. Tap the line for the translation.'));

    /* — the text — */
    var body = el('div.read-body');
    var rows = t.lines.map(function (pair, i) {
      var enLine = el('div.rd-en', { hidden: true }, pair[1]);
      var esLine = el('div.rd-es.es', tappable(pair[0]));
      var row = el('div.rd-line',
        el('button.rd-play', { title: 'Listen to this line',
          onclick: function () { stop(); ui.say(pair[0]); } }, '🔊'),
        // A word tap stops propagation, so tapping anywhere else on the line
        // is the translation. A row of eleven buttons all saying ENGLISH was
        // louder than the story.
        el('div.rd-text', { role: 'button', tabindex: '0',
          title: 'Tap for the translation',
          onclick: function () { enLine.hidden = !enLine.hidden; },
          onkeydown: function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault(); enLine.hidden = !enLine.hidden;
            }
          } },
          esLine, enLine));
      row._speak = pair[0];
      row._i = i;
      body.appendChild(row);
      return row;
    });
    main.appendChild(body);

    /* — reading it aloud, one line at a time, so you can follow — */
    function playAll() {
      var i = 0;
      playing = true;
      playBtn.textContent = '⏹ Stop';
      var cancelled = false;
      stopPlay = function () { cancelled = true; };
      (function next() {
        if (cancelled || i >= rows.length) { stop(); return; }
        rows.forEach(function (r) { r.classList.remove('now'); });
        var row = rows[i++];
        row.classList.add('now');
        // Only scroll when the line has left the screen — pulling the page
        // under a reader who is following along is worse than not scrolling.
        var box = row.getBoundingClientRect();
        if (box.top < 60 || box.bottom > window.innerHeight - 120) {
          row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        ui.say(row._speak, function () { setTimeout(next, 250); });
      })();
    }

    function stop() {
      if (stopPlay) { stopPlay(); stopPlay = null; }
      playing = false;
      playBtn.textContent = '▶ Read it to me';
      rows.forEach(function (r) { r.classList.remove('now'); });
      PARLA.speech.cancel();
    }

    /* — the questions — */
    var quiz = el('div');
    main.appendChild(quiz);
    var startBtn = el('button.primary', { onclick: function () { stop(); askQuestions(); } },
      'I have read it →');
    main.appendChild(el('div.btn-row', { style: { marginTop: '14px' } }, startBtn));

    function askQuestions() {
      startBtn.hidden = true;
      ui.clear(quiz);
      var right = 0, at = 0;
      quiz.appendChild(ui.sectionTitle('Did you follow it?'));
      var slot = el('div');
      quiz.appendChild(slot);
      draw();
      // The questions are below the whole text, so without this the button
      // just disappears and nothing seems to have happened.
      quiz.scrollIntoView({ block: 'start', behavior: 'smooth' });

      function draw() {
        ui.clear(slot);
        if (at >= t.ask.length) return finish();
        var q = t.ask[at];
        var opts = shuffle([q[1]].concat(q[2]));
        slot.appendChild(el('div.card',
          el('div.q-count', 'Question ' + (at + 1) + ' of ' + t.ask.length),
          el('div.q-text.es', q[0]),
          el('div.stack', opts.map(function (o) {
            return el('button.q-opt.es', { onclick: function () { answer(this, o === q[1]); } }, o);
          }))));

        function answer(btn, ok) {
          Array.prototype.forEach.call(slot.querySelectorAll('.q-opt'), function (b) {
            b.disabled = true;
            if (b.textContent === q[1]) b.classList.add('good');
          });
          if (ok) { right++; btn.classList.add('good'); }
          else btn.classList.add('bad');
          slot.appendChild(el('div.btn-row', { style: { marginTop: '10px' } },
            el('button.primary', { onclick: function () { at++; draw(); } },
              at + 1 >= t.ask.length ? 'See how you did' : 'Next question')));
          keepInView();
        }
      }

      function keepInView() {
        var box = slot.getBoundingClientRect();
        if (box.bottom > window.innerHeight - 90 || box.top < 0) {
          slot.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }

      function finish() {
        PARLA.store.markRead(t.id, right, t.ask.length);
        var pct = Math.round(right * 100 / t.ask.length);
        ui.clear(slot);
        slot.appendChild(ui.banner(pct >= 67 ? 'good' : 'warn',
          el('div',
            el('strong', right + ' of ' + t.ask.length + ' right'),
            el('div.small', pct === 100
              ? 'You read that, you did not decode it. Take the next one up.'
              : pct >= 67
                ? 'Understood. Read it once more with the English hidden and it will be easier.'
                : 'Read it again with the English showing, then come back to the questions.'))));
        slot.appendChild(wordBank());
        quiz.scrollIntoView({ block: 'start', behavior: 'smooth' });
        slot.appendChild(el('div.btn-row', { style: { marginTop: '14px' } },
          el('button.primary', { onclick: function () { PARLA.app.go('read'); } }, 'Another text'),
          el('button', { onclick: function () { PARLA.app.go('text', { id: t.id }); } },
            'Read it again')));
      }
    }

    /* — the words worth keeping — */
    function wordBank() {
      var wrap = el('div');
      wrap.appendChild(ui.sectionTitle('Worth keeping'));
      wrap.appendChild(el('p.small.muted',
        'These are the words this text was built around. Anything you add goes ' +
        'into the same deck as everything else and comes back when it is due.'));
      var list = el('div.stack');
      t.words.forEach(function (w) {
        var have = known(w[0]);
        var row = el('div.wb-row' + (have ? '.have' : ''),
          ui.speakBtn(w[0], '🔊'),
          el('div.wb-main', el('div.wb-term.es', w[0]), el('div.wb-en', w[1])),
          have ? el('span.chip.good', '✓')
               : el('button.primary.small-btn', { onclick: function () {
                   PARLA.store.addWord(w[0], w[1], sentenceWith(w[0]), '');
                   ui.toast('“' + w[0] + '” added', 'good');
                   PARLA.app.go('text', { id: t.id });
                 } }, '+'));
        list.appendChild(row);
      });
      // Add them all at once, for the reader who wants the deck and not the
      // decisions.
      var missing = t.words.filter(function (w) { return !known(w[0]); });
      wrap.appendChild(list);
      if (missing.length > 1) {
        wrap.appendChild(el('div.btn-row',
          el('button', { onclick: function () {
            missing.forEach(function (w) {
              PARLA.store.addWord(w[0], w[1], sentenceWith(w[0]), '');
            });
            ui.toast(missing.length + ' words added', 'good');
            PARLA.app.go('text', { id: t.id });
          } }, 'Add all ' + missing.length)));
      }
      return wrap;
    }

    /* The line the word appeared in, so the deck keeps its context. A word
     * remembered with the sentence it came from is a word you can use. */
    function sentenceWith(phrase) {
      var stem = String(phrase).replace(/^(el|la|los|las|un|una)\s+/, '').toLowerCase();
      var hit = t.lines.filter(function (p) {
        return p[0].toLowerCase().indexOf(stem) !== -1;
      })[0];
      return hit ? hit[0] : '';
    }

    function known(es) {
      var n = norm(String(es).replace(/^(el|la|los|las|un|una)\s+/, ''));
      return (PARLA.store.state.phrases || []).some(function (p) {
        return norm(String(p.es).replace(/^(el|la|los|las|un|una)\s+/, '')) === n;
      });
    }

    main._onLeave = stop;
    return main;
  }

  /* ── Tapping a word ───────────────────────────────────────*/

  /* Each Spanish word gets its own span; punctuation and spacing are left
   * exactly as they were, because the sentence still has to read as a
   * sentence. */
  function tappable(text) {
    init();
    var frag = document.createDocumentFragment();
    var parts = String(text || '').split(/([A-Za-zÀ-ÿñÑ'’-]+)/);
    parts.forEach(function (part, idx) {
      if (idx % 2 === 1 && part.length > 1) {
        frag.appendChild(el('span.word', {
          onclick: function (e) { e.stopPropagation(); showWord(part, text, e.currentTarget); }
        }, part));
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    });
    return frag;
  }

  var pop = null;
  function closeWord() { if (pop) { pop.remove(); pop = null; } }

  var POS_NAME = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb',
                   prep: 'preposition', pron: 'pronoun', conj: 'conjunction',
                   num: 'number', interj: 'exclamation', phrase: 'phrase' };

  function showWord(word, sentence, anchor) {
    init();
    closeWord();
    var box = el('div.word-pop');
    pop = box;

    box.appendChild(el('div.word-head',
      el('span.es', word),
      el('button.word-x', { title: 'Close', onclick: closeWord }, '✕')));
    var body = el('div.word-body');
    box.appendChild(body);
    anchor.appendChild(box);
    requestAnimationFrame(function () {
      var r = box.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) { box.style.left = 'auto'; box.style.right = '0'; }
    });

    // The dictionary and the morphology engine, not the model: this has to
    // work on a train.
    var reads = PARLA.morph.ready() ? PARLA.morph.analyse(word) : [];
    if (!reads.length) {
      body.appendChild(el('div.small.muted', PARLA.morph.ready()
        ? 'Not in the dictionary. It may be a name.'
        : 'The dictionary is still loading. Try again in a moment.'));
      return;
    }

    var top = reads[0];
    var art = top.pos === 'n' && top.entry
      ? (top.entry.gender === 'f' ? 'la ' : (top.entry.gender === 'm' ? 'el ' : ''))
      : '';
    var glosses = tidy((top.entry && top.entry.glosses) || (top.en ? [top.en] : []));

    body.appendChild(el('div.word-en', glosses.slice(0, 2).join(' · ')));
    // "tiene" is not a word you look up; "tener" is. Saying which, and what
    // the ending did, is the whole point of tapping.
    var from = [];
    if (top.lemma && top.lemma.toLowerCase() !== word.toLowerCase()) from.push(art + top.lemma);
    if (top.why) from.push(top.why);
    if (POS_NAME[top.pos] && !from.length) from.push(POS_NAME[top.pos]);
    if (from.length) body.appendChild(el('div.small.muted', from.join(' — ')));

    // A second reading only when it is a different word, not a different
    // shade of the same one.
    var other = reads.filter(function (r) { return r.lemma !== top.lemma; })[0];
    if (other) {
      body.appendChild(el('div.small.faint',
        'or ' + other.lemma + (other.en ? ' — ' + other.en : '')));
    }

    var lemma = top.lemma || word;
    var already = (PARLA.store.state.phrases || []).some(function (p) {
      return norm(p.es).replace(/^(el|la) /, '') === norm(lemma);
    });

    body.appendChild(el('div.btn-row', { style: { marginTop: '8px' } },
      el('button', { onclick: function () { ui.say(word); } }, '🔊'),
      already
        ? el('button', { disabled: 'disabled' }, '✓ In your deck')
        : el('button.primary', { onclick: function () {
            PARLA.store.addWord(art + lemma, glosses[0] || top.en || '', sentence, '');
            ui.toast('“' + lemma + '” added', 'good');
            closeWord();
          } }, '+ Add'),
      el('button.ghost', { title: 'Everything about this word',
        onclick: function () { closeWord(); PARLA.app.go('coach', { q: lemma }); } }, '›')));
  }

  /* "to have · to have, possess an object" is one meaning written twice, and
   * in a popover the size of a thumb the second copy costs a line of the
   * story. Drop a gloss that only elaborates one already shown. */
  function tidy(glosses) {
    var out = [];
    (glosses || []).forEach(function (g) {
      var head = String(g).split(/[,;(]/)[0].trim().toLowerCase();
      var dup = out.some(function (k) {
        var kh = k.split(/[,;(]/)[0].trim().toLowerCase();
        return kh === head ||
               k.toLowerCase().indexOf(head) === 0 ||
               String(g).toLowerCase().indexOf(kh) === 0;
      });
      if (!dup) out.push(g);
    });
    return out;
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function shuffle(a) {
    var out = a.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  document.addEventListener('click', function (e) {
    if (pop && !pop.contains(e.target) && !e.target.classList.contains('word')) closeWord();
  });

  PARLA.views = PARLA.views || {};
  PARLA.views.read = viewRead;
  PARLA.views.text = viewText;
})();
