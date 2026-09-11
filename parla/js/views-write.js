/* Parla — writing
 *
 * The app could talk, listen, read, drill and correct, and had nowhere to
 * *produce* Spanish in your own time. Speaking is production too, but it is
 * production under time pressure: you say the sentence you can reach rather
 * than the one you mean, and the partner fills the silence before you have
 * found it. Writing is where you find out what you can actually build.
 *
 * The engine behind it already existed. brain.correctOffline runs the grammar
 * checker — eighteen thousand nouns' genders, the person of any verb form,
 * twenty rules that name themselves — over anything you type, offline, with a
 * measured zero false positives on eight hundred sentences of known-good
 * Spanish. What was missing was somewhere to point it.
 *
 * Two things this screen must be honest about, because a tool that oversells
 * itself teaches you to distrust it:
 *
 *   it checks the mechanics, not the meaning. Agreement, person, ser against
 *   estar, gustar being backwards. It cannot tell you that your sentence does
 *   not answer the question or that nobody would phrase it that way.
 *
 *   silence is not approval. "Nothing to fix" means no rule fired, which is
 *   not the same as "this is good Spanish". So the model answers are always
 *   there afterwards, and they are the part that covers what rules cannot.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  var LEVEL_NAME = { a1: 'Starting out', a2: 'Getting going', b1: 'Finding your feet' };

  function doneOf(id) { return (PARLA.store.state.writing || {})[id] || null; }

  /* ── The list ─────────────────────────────────────────────*/
  function viewWrite() {
    init();
    var main = el('main');
    var tasks = PARLA.data.es.writing || [];

    main.appendChild(el('h1', 'Write'));
    main.appendChild(el('p.muted',
      'Twenty-four things to write, each built around one piece of grammar you ' +
      'cannot answer the question without. Every sentence you write is checked ' +
      'against the rules, and anything it catches comes back in Review until you ' +
      'can produce it.'));

    var done = tasks.filter(function (t) { return doneOf(t.id); }).length;
    if (done) {
      main.appendChild(ui.banner('info',
        el('div', el('strong', done + ' of ' + tasks.length + ' written'),
          el('div.small', 'Coming back to one you have already done is worth more ' +
            'than a new one — the second attempt is where you find out what stuck.'))));
    }

    ['a1', 'a2', 'b1'].forEach(function (lvl) {
      var group = tasks.filter(function (t) { return t.level === lvl; });
      if (!group.length) return;
      main.appendChild(ui.sectionTitle(LEVEL_NAME[lvl], ui.levelTag(lvl)));
      var list = el('div.stack');
      group.forEach(function (t) {
        var p = doneOf(t.id);
        list.appendChild(el('button.read-card' + (p ? '.read-done' : ''),
          { onclick: function () { PARLA.app.go('task', { id: t.id }); } },
          el('div.read-main',
            el('div.read-title.es', t.ask),
            el('div.read-blurb', t.en),
            el('div.read-meta',
              el('span', t.minutes + ' min'),
              p ? el('span.chip.good', p.clean ? '✓ nothing to fix'
                    : p.caught + ' caught') : null))));
      });
      main.appendChild(list);
    });

    return main;
  }

  /* ── One task ─────────────────────────────────────────────*/
  function viewTask(params) {
    init();
    var t = (PARLA.data.es.writingById || {})[(params || {}).id];
    var main = el('main');

    if (!t) {
      main.appendChild(ui.empty('✍️', 'No such task',
        'It may have been renamed. Pick one from the list.'));
      main.appendChild(el('div.btn-row',
        el('button.primary', { onclick: function () { PARLA.app.go('write'); } }, 'Back to the list')));
      return main;
    }

    main.appendChild(el('div.crumb',
      el('button.ghost.small-btn', { onclick: function () { PARLA.app.go('write'); } }, '← Write'),
      ui.levelTag(t.level)));
    main.appendChild(el('div.card.write-ask',
      el('div.row',
        el('div.q-text.es', t.ask),
        el('div.spacer'),
        ui.speakBtn(t.ask, '🔊')),
      el('div.small.muted', t.en)));

    /* — the words you are likely to reach for — */
    var hints = el('div.write-hints');
    t.hint.forEach(function (h) {
      hints.appendChild(el('button.hint-chip', {
        title: 'Put it in the box',
        onclick: function () {
          box.value = (box.value + (box.value && !/\s$/.test(box.value) ? ' ' : '') + h[0]).trim() + ' ';
          box.focus();
        }
      }, el('span.es', h[0]), el('span.hint-en', h[1])));
    });
    main.appendChild(ui.sectionTitle('Words you may want'));
    main.appendChild(hints);

    /* — the box — */
    var box = el('textarea.write-box', {
      placeholder: 'Write two or three sentences in Spanish…',
      rows: '6', spellcheck: 'false', lang: 'es'
    });
    var count = el('div.small.faint.write-count', '');
    box.addEventListener('input', function () {
      var w = box.value.trim().split(/\s+/).filter(Boolean).length;
      count.textContent = w ? w + ' word' + (w === 1 ? '' : 's') : '';
      out.hidden = true;
    });
    main.appendChild(box);
    main.appendChild(count);

    var checkBtn = el('button.primary', { onclick: check }, 'Check it');
    main.appendChild(el('div.btn-row', checkBtn,
      el('button', { onclick: function () { reveal(true); } }, 'Show me an answer')));

    var out = el('div', { hidden: true });
    main.appendChild(out);

    /* — checking it — */
    function sentences(text) {
      // Split on sentence enders, keeping enough of each piece to check. A
      // rule that needs to see the end of a clause needs the punctuation.
      return String(text).split(/(?<=[.!?])\s+/)
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.split(/\s+/).filter(Boolean).length >= 2; });
    }

    function check() {
      var text = box.value.trim();
      if (!text) { ui.toast('Write something first.', 'bad'); return; }
      if (!PARLA.grammar || !PARLA.grammar.ready()) {
        ui.toast('The dictionary is still loading — try again in a moment.', 'bad');
        PARLA.dict.load();
        return;
      }

      ui.clear(out);
      out.hidden = false;
      var lines = sentences(text);
      var caught = 0;

      out.appendChild(ui.sectionTitle('What the rules found'));
      var list = el('div.stack');

      lines.forEach(function (line) {
        var fix = PARLA.brain.correctOffline(line);
        if (!fix || PARLA.brain.normalise(fix.fixed) === PARLA.brain.normalise(line)) {
          list.appendChild(el('div.write-line.ok',
            el('div.es', line),
            el('div.small.faint', 'No rule fired on this one.')));
          return;
        }
        caught++;
        // Straight into the fix queue: a mistake you made writing is worth
        // exactly as much as one you made speaking, and this is the machinery
        // that brings it back.
        PARLA.store.rememberMistake({
          es: line, fix: fix.fixed, note: fix.note || '',
          topic: (fix.topics && fix.topics[0]) || fix.topic || null,
          from: 'writing', scenario: t.id
        });
        list.appendChild(el('div.write-line.no',
          el('div.es.write-was', line),
          el('div.es.write-now', fix.fixed),
          el('div.small.muted', fix.note || ''),
          fix.topics && fix.topics.length && PARLA.data.es.grammarByTopic
            ? lessonLink(fix.topics[0])
            : null));
      });
      out.appendChild(list);

      // Silence is not approval, and saying so is the difference between a
      // tool you can trust and one you learn to ignore.
      out.appendChild(ui.banner(caught ? 'warn' : 'info',
        el('div',
          el('strong', caught
            ? caught + ' sentence' + (caught === 1 ? '' : 's') + ' to fix — they are in Review now'
            : 'Nothing the rules could catch'),
          el('div.small', caught
            ? 'They will come back in a day or two, and you will have to produce the ' +
              'fix from memory.'
            : 'That means no rule fired, which is not the same as “this is good ' +
              'Spanish”. The rules check agreement, person, ser against estar — not ' +
              'whether anyone would say it this way. The answer below is for that part.'))));

      PARLA.store.markWritten(t.id, caught);
      reveal(false);
      out.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function lessonLink(topic) {
      var lesson = PARLA.data.es.grammarByTopic[topic];
      if (!lesson) return null;
      return el('div.btn-row', { style: { marginTop: '6px' } },
        el('button.tiny-btn', {
          onclick: function () { PARLA.app.go('lesson', { id: lesson.id }); }
        }, '📐 ' + lesson.title));
    }

    /* — the answer, and what the question was really testing — */
    function reveal(alone) {
      if (alone) { ui.clear(out); out.hidden = false; }
      out.appendChild(ui.sectionTitle('What this one was testing'));
      out.appendChild(el('div.card', el('p', t.forces)));
      out.appendChild(ui.sectionTitle('Two ways to answer it'));
      var models = el('div.stack');
      t.model.forEach(function (m) {
        models.appendChild(el('div.write-model',
          ui.speakBtn(m, '🔊'),
          el('div.es', m)));
      });
      out.appendChild(models);
      out.appendChild(el('div.btn-row', { style: { marginTop: '14px' } },
        el('button.primary', { onclick: function () { PARLA.app.go('write'); } }, 'Another one'),
        el('button', { onclick: function () { PARLA.app.go('review'); } }, 'Review')));
      if (alone) out.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    // The dictionary is what the checker runs on, so start it arriving now
    // rather than when the reader presses the button.
    if (PARLA.dict && !PARLA.dict.ready()) PARLA.dict.load();

    return main;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.write = viewWrite;
  PARLA.views.task = viewTask;
})();
