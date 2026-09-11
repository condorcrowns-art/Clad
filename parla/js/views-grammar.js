/* Parla — the grammar screen
 *
 * Twenty things that trip English speakers up, each one earning its place by
 * being a mistake the checker has actually seen someone make. The list is
 * ordered by how much a learner is currently getting wrong: if your last three
 * conversations kept coming back with ser/estar, that lesson is at the top and
 * says so.
 *
 * Every lesson ends in a drill, and every drill item offers the wrong answer a
 * learner would have given, because recognising your own error is most of
 * learning not to make it.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  var LEVELS = { a1: 'A1', a2: 'A2', b1: 'B1', b2: 'B2' };

  /* How many times the checker has caught this topic in your conversations. */
  function tally() {
    var st = PARLA.store.state;
    var out = {};
    (st.mistakes || []).forEach(function (m) {
      if (m.topic) out[m.topic] = (out[m.topic] || 0) + 1;
    });
    return out;
  }

  function mastery(id) {
    var g = PARLA.store.state.grammar || {};
    return g[id] || { seen: 0, right: 0, wrong: 0 };
  }

  function viewGrammar() {
    init();
    var st = PARLA.store.state;
    var main = el('main');
    var lessons = PARLA.data.es.grammar;
    var hits = tally();

    main.appendChild(el('h1', 'Grammar that trips you up'));
    main.appendChild(el('p.muted',
      'Not all of Spanish — the twenty places English pulls you the wrong way. ' +
      'The ones you keep getting wrong in conversation rise to the top.'));

    var yours = lessons.filter(function (l) { return hits[l.topic]; })
      .sort(function (a, b) { return hits[b.topic] - hits[a.topic]; });

    if (yours.length) {
      main.appendChild(ui.sectionTitle('From your own mistakes'));
      var mine = el('div.stack');
      yours.slice(0, 4).forEach(function (l) {
        mine.appendChild(card(l, hits[l.topic]));
      });
      main.appendChild(mine);
    }

    main.appendChild(ui.sectionTitle(yours.length ? 'Everything else' : 'All of them'));
    var rest = el('div.stack');
    lessons.forEach(function (l) {
      if (yours.slice(0, 4).indexOf(l) !== -1) return;
      rest.appendChild(card(l, hits[l.topic]));
    });
    main.appendChild(rest);

    function card(l, caught) {
      var m = mastery(l.id);
      var pct = m.seen ? Math.round(m.right * 100 / m.seen) : 0;
      return el('button.gram-card', { onclick: function () { PARLA.app.go('lesson', { id: l.id }); } },
        el('div.row',
          el('div.gram-title', l.title),
          el('div.spacer'),
          caught ? el('span.chip.bad-chip', caught + '×') : null,
          m.seen >= 4 ? el('span.chip' + (pct >= 80 ? '.good' : ''), pct + '%') : null,
          el('span.level-tag.' + l.level, LEVELS[l.level])),
        el('div.gram-sub', l.sub));
    }
    return main;
  }

  /* ── One lesson ───────────────────────────────────────────*/
  function viewLesson(params) {
    init();
    var st = PARLA.store.state;
    var l = (PARLA.data.es.grammar || []).filter(function (x) {
      return x.id === (params && params.id);
    })[0];
    var main = el('main');
    if (!l) { main.appendChild(el('p', 'No such lesson.')); return main; }

    main.appendChild(el('div.row', { style: { marginBottom: '6px' } },
      el('button.ghost', { onclick: function () { PARLA.app.go('grammar'); } }, '← Grammar'),
      el('div.spacer'),
      el('span.level-tag.' + l.level, LEVELS[l.level])));

    main.appendChild(el('h1', l.title));
    main.appendChild(el('p.muted', l.sub));

    main.appendChild(el('div.card.rule-card',
      el('div.ask-label', 'The rule'),
      el('div.rule-line', l.rule)));

    main.appendChild(el('div.card',
      el('div.ask-label', 'Why you get this wrong'),
      el('p', l.why),
      l.more ? el('p.small.muted', l.more) : null));

    /* Minimal pairs: the same words, the distinction visible. */
    main.appendChild(ui.sectionTitle('Side by side'));
    var pairs = el('div.stack');
    l.pairs.forEach(function (p) {
      if (!p[0]) return;
      pairs.appendChild(el('div.pair',
        el('div.pair-side',
          el('div.row', ui.speakBtn(p[0], '🔊'), el('span.es.pair-es', p[0])),
          p[1] ? el('div.small.muted', p[1]) : null),
        p[2] ? el('div.pair-side' + (/✗/.test(p[3] || '') ? '.wrong' : ''),
          el('div.row',
            /✗/.test(p[3] || '') ? el('span.pair-x', '✗') : ui.speakBtn(p[2], '🔊'),
            el('span.es.pair-es', p[2])),
          // The ✗ is already drawn as a mark; repeating it in the note reads
          // as two crosses on one line.
          p[3] ? el('div.small.muted', p[3].replace(/^✗\s*—?\s*/, '')) : null) : null));
    });
    main.appendChild(pairs);

    /* ── The drill ── */
    main.appendChild(ui.sectionTitle('Try it'));
    var drillBox = el('div');
    main.appendChild(drillBox);

    var order = l.drill.map(function (d, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    var at = 0, right = 0, answered = false;

    function record(ok) {
      var g = st.grammar || (st.grammar = {});
      var m = g[l.id] || (g[l.id] = { seen: 0, right: 0, wrong: 0 });
      m.seen++;
      if (ok) m.right++; else m.wrong++;
      // A rule you have just got wrong is a rule to revisit, so it goes into
      // the same deck as everything else rather than being forgotten.
      if (!ok) PARLA.store.rememberMistake({
        es: l.drill[order[at]][0].replace('___', l.drill[order[at]][1]),
        fix: '', note: l.drill[order[at]][3], topic: l.topic, from: 'lesson'
      });
      PARLA.store.save();
    }

    function draw() {
      ui.clear(drillBox);
      if (at >= order.length) {
        drillBox.appendChild(el('div.card.center',
          el('div.game-final', right + ' / ' + order.length),
          el('p.muted', right === order.length
            ? 'All of them. This one is not your problem any more.'
            : right >= order.length - 1 ? 'Close. One more pass and it is yours.'
            : 'Worth coming back to — the ones you missed are in your review deck now.'),
          el('div.btn-row', { style: { justifyContent: 'center', marginTop: '14px' } },
            el('button.primary', { onclick: function () {
              at = 0; right = 0; PARLA.app.go('lesson', { id: l.id });
            } }, 'Again'),
            el('button', { onclick: function () { PARLA.app.go('grammar'); } }, 'Other lessons'))));
        PARLA.store.creditDay(order.length * 3);
        PARLA.store.save();
        return;
      }

      var d = l.drill[order[at]];
      var options = [d[1]].concat(d[2]);
      for (var k = options.length - 1; k > 0; k--) {
        var j2 = Math.floor(Math.random() * (k + 1));
        var tmp = options[k]; options[k] = options[j2]; options[j2] = tmp;
      }

      var q = el('div.card');
      q.appendChild(el('div.small.faint', (at + 1) + ' of ' + order.length));
      q.appendChild(el('div.quiz-prompt.es.gram-q', d[0]));

      var row = el('div.quiz-options');
      answered = false;
      options.forEach(function (o) {
        var b = el('button.quiz-opt.es', o);
        b.onclick = function () {
          if (answered) return;
          answered = true;
          var ok = o === d[1];
          if (ok) right++;
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) {
            [].forEach.call(row.children, function (x) {
              if (x.textContent === d[1]) x.classList.add('right');
            });
          }
          record(ok);
          q.appendChild(el('div.answer-state.' + (ok ? 'ok' : 'no'),
            { style: { marginTop: '12px' } },
            (ok ? '✓ ' : '✗ ') + d[3]));
          q.appendChild(el('div.btn-row', { style: { marginTop: '10px' } },
            el('button.primary', { onclick: function () { at++; draw(); } },
              at + 1 >= order.length ? 'See how you did' : 'Next')));
          ui.say(d[0].replace('___', d[1]));
        };
        row.appendChild(b);
      });
      q.appendChild(row);
      drillBox.appendChild(q);
    }
    draw();
    return main;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.grammar = viewGrammar;
  PARLA.views.lesson = viewLesson;
})();
