/* Parla — listening
 *
 * Reading a sentence and hearing one are different skills, and the second is
 * the one that fails you in a real conversation. On the page, Spanish arrives
 * with the words already separated; in the air it arrives as one continuous
 * noise, and *¿de dónde eres?* comes out as a single word until your ear has
 * learned where the joins are.
 *
 * So: the same twelve texts, nothing on the screen. Play a line, decide
 * whether you caught it, then look. What makes this work rather than merely
 * frustrating is the speed control — natural speed is the wall, and the only
 * way over it is to meet the same sentence slow, then slower-than-natural,
 * then at speed, which is three passes over one line rather than one pass over
 * three.
 *
 * At the end come the same comprehension questions as the reader, and
 * answering them off the audio alone is a genuinely different result from
 * answering them off the page. It is kept separately for that reason.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  /* Multipliers on whatever speed the user has already chosen, so someone who
   * likes a slow voice everywhere does not end up at a crawl here. */
  var SPEEDS = [[0.7, 'Slow'], [0.85, 'Easier'], [1, 'Natural']];

  function viewListen(params) {
    init();
    var t = (PARLA.data.es.readingById || {})[(params || {}).id];
    var main = el('main');

    if (!t) {
      main.appendChild(ui.empty('🎧', 'No such text',
        'It may have been renamed. Pick one from the list.'));
      main.appendChild(el('div.btn-row',
        el('button.primary', { onclick: function () { PARLA.app.go('read'); } }, 'Back to the list')));
      return main;
    }

    var at = 0;                 // which line
    var shown = false;          // Spanish revealed for this line
    var speed = 0.85;
    var played = 0;             // times this line has been played
    var caught = 0;             // lines you said you caught

    main.appendChild(el('div.crumb',
      el('button.ghost.small-btn', { onclick: function () { PARLA.app.go('read'); } }, '← Read'),
      ui.levelTag(t.level),
      el('button.ghost.small-btn', { onclick: function () { PARLA.app.go('text', { id: t.id }); } },
        '📖 Read it instead')));
    main.appendChild(el('h1', 'Listen: ' + t.title));
    main.appendChild(el('p.muted',
      'Nothing on the screen. Play the line, decide whether you caught it, then ' +
      'look. Play it more than once — that is the drill, not a failure at it.'));

    main.appendChild(el('div.hear-speed',
      el('span.small.muted', 'Speed'),
      ui.segmented(SPEEDS.map(function (s) { return [s[0], s[1]]; }), speed, function (v) {
        speed = v;
      })));

    var stage = el('div');
    main.appendChild(stage);

    // Declared before draw() runs, not after: `var playedNote = null` sitting
    // below the first draw() reset the reference draw() had just set, and the
    // play counter froze at "Played once" for the rest of the text.
    var playedNote = null;

    function paintPlayed() {
      if (!playedNote) return;
      playedNote.textContent = played === 0 ? ''
        : played === 1 ? 'Played once'
        : 'Played ' + played + ' times';
    }

    function speakLine(then) {
      played++;
      var base = PARLA.store.state.settings.rate || 0.9;
      ui.say(t.lines[at][0], then, null, { rate: base * speed });
      paintPlayed();
    }

    function draw() {
      ui.clear(stage);
      if (at >= t.lines.length) return finish();

      shown = false;
      played = 0;
      var line = t.lines[at];

      var es = el('div.hear-es.es', { hidden: true }, line[0]);
      var en = el('div.hear-en', { hidden: true }, line[1]);
      playedNote = el('div.small.faint.hear-played', '');

      var card = el('div.card.hear-card',
        el('div.q-count', 'Line ' + (at + 1) + ' of ' + t.lines.length),
        el('button.hear-play', { onclick: function () { speakLine(); } }, '▶'),
        playedNote,
        es, en);
      stage.appendChild(card);

      var reveal = el('button', { onclick: function () {
        if (!shown) {
          shown = true;
          es.hidden = false;
          reveal.textContent = '+ English';
        } else {
          en.hidden = !en.hidden;
        }
      } }, '👁 Show me');

      // Both answers advance. The judgement is yours and the app does not
      // argue with it; what it does with the answer is decide what to say at
      // the end.
      stage.appendChild(el('div.btn-row.hear-tools',
        reveal,
        el('button', { onclick: function () { next(false); } }, 'Missed it'),
        el('button.primary', { onclick: function () { next(true); } }, 'Caught it →')));

      // Autoplay on arrival: the point of the screen is the audio, and making
      // someone press play to start every single line is friction for nothing.
      speakLine();
    }

    function next(ok) {
      if (ok) caught++;
      at++;
      draw();
      stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /* — the same questions, answered off the audio — */
    function finish() {
      var pct = Math.round(caught * 100 / t.lines.length);
      stage.appendChild(ui.banner(pct >= 60 ? 'good' : 'info',
        el('div',
          el('strong', 'You caught ' + caught + ' of ' + t.lines.length + ' lines'),
          el('div.small', pct >= 80
            ? 'At that rate, move the speed up a notch and go round again.'
            : pct >= 40
              ? 'Normal. Play it again at the same speed before you move up — the ' +
                'second pass over a line you have already seen is where the ear learns.'
              : 'Drop the speed a notch and read it on the Read screen first. ' +
                'Listening to a text you have never seen is the hardest version of this.'))));

      stage.appendChild(ui.sectionTitle('Did you follow it?'));
      var slot = el('div');
      stage.appendChild(slot);
      var right = 0, q = 0;
      ask();

      function ask() {
        ui.clear(slot);
        if (q >= t.ask.length) return report();
        var item = t.ask[q];
        var opts = shuffle([item[1]].concat(item[2]));
        slot.appendChild(el('div.card',
          el('div.q-count', 'Question ' + (q + 1) + ' of ' + t.ask.length),
          el('div.q-text.es', item[0]),
          el('div.stack', opts.map(function (o) {
            return el('button.q-opt.es', { onclick: function () { answer(this, o === item[1]); } }, o);
          }))));

        function answer(btn, ok) {
          Array.prototype.forEach.call(slot.querySelectorAll('.q-opt'), function (b) {
            b.disabled = true;
            if (b.textContent === item[1]) b.classList.add('good');
          });
          if (ok) { right++; btn.classList.add('good'); } else btn.classList.add('bad');
          slot.appendChild(el('div.btn-row', { style: { marginTop: '10px' } },
            el('button.primary', { onclick: function () { q++; ask(); } },
              q + 1 >= t.ask.length ? 'See how you did' : 'Next question')));
        }
      }

      function report() {
        PARLA.store.markHeard(t.id, right, t.ask.length, caught);
        ui.clear(slot);
        // Understanding a text you only heard is a different result from
        // understanding one you read, and worth more.
        var readScore = (PARLA.store.state.reading[t.id] || {}).right;
        slot.appendChild(ui.banner(right >= t.ask.length - 1 ? 'good' : 'warn',
          el('div',
            el('strong', right + ' of ' + t.ask.length + ' right, from the audio alone'),
            el('div.small', right === t.ask.length
              ? (readScore === t.ask.length
                  ? 'You understood it by ear as well as you did on the page. That is the point.'
                  : 'Off the audio alone. Read it now and it will feel easy.')
              : 'Listen once more with the text in front of you on the Read screen, ' +
                'then come back and do it blind.'))));
        slot.appendChild(el('div.btn-row', { style: { marginTop: '14px' } },
          el('button.primary', { onclick: function () { PARLA.app.go('read'); } }, 'Another text'),
          el('button', { onclick: function () { PARLA.app.go('listen', { id: t.id }); } },
            'Listen again'),
          el('button', { onclick: function () { PARLA.app.go('text', { id: t.id }); } },
            'Read it')));
      }
    }

    draw();

    main._onLeave = function () { PARLA.speech.cancel(); };
    return main;
  }

  function shuffle(a) {
    var out = a.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.listen = viewListen;
})();
