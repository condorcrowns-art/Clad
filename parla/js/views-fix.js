/* Parla — fix it again
 *
 * The screen that makes a correction worth something. Every mistake the app has
 * caught — from the grammar checker, from the conversation partner, from a
 * grammar drill — comes back here as the sentence you actually wrote, for you
 * to fix. Get it right and it goes away for four days. Get it wrong and it is
 * back tomorrow.
 *
 * This is the half of the loop that was missing. Being corrected teaches
 * nothing on its own; being corrected and then made to produce the right
 * version, days later, from memory, is the whole mechanism.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function viewFix() {
    init();
    var st = PARLA.store.state;
    var main = el('main');
    var queue = PARLA.store.dueMistakes(20);

    main.appendChild(el('div.row', { style: { marginBottom: '6px' } },
      el('button.ghost', { onclick: function () { PARLA.app.go('review'); } }, '← Review'),
      el('div.spacer')));

    if (!queue.length) {
      var total = (st.mistakes || []).filter(function (m) { return m.fix; }).length;
      main.appendChild(el('h1', 'Nothing to fix'));
      main.appendChild(ui.empty('🎯',
        total ? 'All ' + total + ' caught up' : 'No mistakes on file yet',
        total
          ? 'Every correction you have been given has been fixed again since. They will ' +
            'come back on their own schedule.'
          : 'Have a conversation. Anything the checker or your partner corrects lands ' +
            'here, and comes back until you can produce it yourself.'));
      main.appendChild(el('div.btn-row', { style: { justifyContent: 'center' } },
        el('button.primary', { onclick: function () { PARLA.app.go('scenarios'); } }, 'Go talk')));
      return main;
    }

    var i = 0, right = 0, revealed = false, verdict = null;
    var head = el('div.row', { style: { marginBottom: '10px' } },
      el('span.chip'), el('div.spacer'),
      el('span.small.faint', 'type the corrected sentence'));
    main.appendChild(head);

    var box = el('div');
    main.appendChild(box);

    function done() {
      ui.clear(box);
      box.appendChild(el('div.card.center',
        el('div.game-final', right + ' / ' + queue.length),
        el('p.muted', right === queue.length
          ? 'Every one. These are not your mistakes any more.'
          : 'The ones you missed come back tomorrow.'),
        el('div.btn-row', { style: { justifyContent: 'center', marginTop: '14px' } },
          el('button.primary', { onclick: function () { PARLA.app.go('scenarios'); } }, 'Go talk'),
          el('button', { onclick: function () { PARLA.app.go('review'); } }, 'Review words'))));
      PARLA.store.creditDay(queue.length * 4);
      PARLA.store.save();
    }

    function draw() {
      if (i >= queue.length) return done();
      var m = queue[i];
      head.firstChild.textContent = (i + 1) + ' / ' + queue.length;
      ui.clear(box);
      revealed = false;

      var card = el('div.card');
      card.appendChild(el('div.ask-label', m.from === 'lesson' ? 'From a grammar drill'
        : 'You said'));
      card.appendChild(el('div.fix-wrong.es', m.es));
      if (m.times > 1) {
        card.appendChild(el('div.small.faint', 'You have made this one ' + m.times + ' times.'));
      }

      var input = el('input.answer-input', {
        type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
        placeholder: 'write it correctly'
      });
      var state = el('div.answer-state');

      function submit() {
        if (revealed) return;
        revealed = true;
        input.disabled = true;
        var ok = norm(input.value) === norm(m.fix);
        // Close enough counts: an accent or a comma is not the thing being
        // tested here, the grammar is.
        if (ok) right++;
        state.className = 'answer-state ' + (ok ? 'ok' : 'no');
        state.textContent = ok ? '✓ ' + m.fix : '✗ ' + m.fix;
        PARLA.store.gradeMistake(m, ok);

        if (m.note) card.appendChild(el('div.hint', { style: { marginTop: '8px' } }, m.note));
        if (m.topic && PARLA.data.es.grammarByTopic[m.topic]) {
          var lesson = PARLA.data.es.grammarByTopic[m.topic];
          card.appendChild(el('div.btn-row', { style: { marginTop: '8px' } },
            el('button.ghost', {
              onclick: function () { PARLA.app.go('lesson', { id: lesson.id }); }
            }, '📖 ' + lesson.title)));
        }
        card.appendChild(el('div.btn-row', { style: { marginTop: '10px' } },
          ui.speakBtn(m.fix, '🔊 Hear it'),
          el('button.primary', { onclick: function () { i++; draw(); } },
            i + 1 >= queue.length ? 'See how you did' : 'Next')));
        ui.say(m.fix);
      }

      input.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
      card.appendChild(el('div.answer-row', input,
        el('button.primary', { onclick: submit }, 'Check')));
      card.appendChild(state);
      card.appendChild(el('div.btn-row', { style: { marginTop: '10px' } },
        el('button', { onclick: function () {
          if (revealed) return;
          input.value = '';
          submit();
        } }, "Show me"),
        el('button', { onclick: function () {
          if (revealed) return;
          ui.say(m.fix);
        }, title: 'Hear the right version without seeing it' }, '🔊 Hint')));

      box.appendChild(card);
      setTimeout(function () { input.focus(); }, 60);
    }

    draw();
    return main;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.fix = viewFix;
})();
