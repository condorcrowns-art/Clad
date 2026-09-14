/* Lunosia — pronunciation
 *
 * The speaking drill used to say "Heard: pero — expected perro", which tells
 * you what you already knew. What you need is the next sentence: *your rr came
 * out as a single tap, here is what to do with your tongue*. That needs
 * phonology, which js/phon.js now has.
 *
 * Two drills, because hearing a distinction has to come before making it:
 *   Hear it   two words that differ in one sound; pick the one you heard
 *   Say it    say a word, and be told which sound broke, not just that one did
 */
window.LUNOSIA = window.LUNOSIA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = LUNOSIA.ui; el = ui.el; }

  var COST = { high: 'Worth fixing first', medium: 'Worth fixing', low: 'Polish' };

  function scoreOf(id) {
    var s = (LUNOSIA.store.state.sounds || {})[id];
    if (!s || !s.tries) return null;
    return Math.round(s.ok * 100 / s.tries);
  }

  function record(id, ok) {
    var st = LUNOSIA.store.state;
    var all = st.sounds || (st.sounds = {});
    var s = all[id] || (all[id] = { tries: 0, ok: 0 });
    s.tries++;
    if (ok) s.ok++;
    LUNOSIA.store.save();
  }

  /* Sounds the app has actually caught you missing, most missed first. */
  function troubled() {
    var all = LUNOSIA.store.state.sounds || {};
    return Object.keys(all)
      .filter(function (id) { return all[id].tries >= 3 && all[id].ok / all[id].tries < 0.7; })
      .sort(function (a, b) {
        return (all[a].ok / all[a].tries) - (all[b].ok / all[b].tries);
      });
  }

  /* ── The list ─────────────────────────────────────────────*/
  function viewSay() {
    init();
    var main = el('main');
    var sounds = LUNOSIA.data.es.sounds;
    var weak = troubled();

    main.appendChild(el('h1', 'Sounds'));
    main.appendChild(el('p.muted',
      'Ten places an English mouth does something else by reflex. Hear the ' +
      'difference first, then make it — and the drill tells you which sound broke, ' +
      'not just that one did.'));

    if (weak.length) {
      main.appendChild(ui.sectionTitle('Yours to fix'));
      var mine = el('div.stack');
      weak.slice(0, 3).forEach(function (id) {
        var s = LUNOSIA.data.es.soundsById[id];
        if (s) mine.appendChild(card(s));
      });
      main.appendChild(mine);
    }

    main.appendChild(ui.sectionTitle(weak.length ? 'All of them' : 'Start here'));
    var list = el('div.stack');
    sounds.forEach(function (s) { list.appendChild(card(s)); });
    main.appendChild(list);

    function card(s) {
      var pct = scoreOf(s.id);
      return el('button.sound-card', { onclick: function () { LUNOSIA.app.go('sound', { id: s.id }); } },
        el('div.sound-symbol.es', s.symbol),
        el('div.sound-main',
          el('div.sound-title', s.title),
          el('div.sound-sub', s.letters)),
        pct != null
          ? el('span.chip' + (pct >= 80 ? '.good' : (pct < 60 ? '.bad-chip' : '')), pct + '%')
          : el('span.chip', COST[s.cost]));
    }
    return main;
  }

  /* ── One sound ────────────────────────────────────────────*/
  function viewSound(params) {
    init();
    var st = LUNOSIA.store.state;
    var s = LUNOSIA.data.es.soundsById[(params && params.id)] || LUNOSIA.data.es.sounds[0];
    var P = LUNOSIA.phon;
    var main = el('main');

    main.appendChild(el('div.row', { style: { marginBottom: '6px' } },
      el('button.ghost', { onclick: function () { LUNOSIA.app.go('say'); } }, '← Sounds'),
      el('div.spacer'),
      (function () { var p = scoreOf(s.id); return p != null ? el('span.chip', p + '%') : null; })()));

    main.appendChild(el('div.row',
      el('span.sound-symbol.big.es', s.symbol),
      el('div', el('h1', { style: { margin: '0' } }, s.title),
        el('div.small.muted', s.letters))));

    main.appendChild(el('div.card.rule-card',
      el('div.ask-label', 'What to do with your mouth'),
      el('p', s.mouth)));

    main.appendChild(el('div.card',
      el('div.ask-label', 'What English makes you do instead'),
      el('p', s.instead),
      s.trick ? el('div.hint.good-hint', { style: { marginTop: '8px' } }, s.trick) : null));

    /* — hear it — */
    main.appendChild(ui.sectionTitle('Hear the difference'));
    main.appendChild(el('p.small.muted',
      'Two words that differ only in this sound. Play one at random and pick which it was.'));
    main.appendChild(hearDrill(s));

    /* — say it — */
    main.appendChild(ui.sectionTitle('Say it'));
    main.appendChild(sayDrill(s));

    return main;

    /* ── Minimal pairs, as a listening test ── */
    function hearDrill(s) {
      var box = el('div');
      var pairs = s.pairs.filter(function (p) { return p[4] !== 'same'; });

      if (!pairs.length) {
        // Some "pairs" exist to prove two spellings sound identical, which is
        // the whole lesson for h and for b/v. There is nothing to tell apart.
        var same = el('div.stack');
        s.pairs.forEach(function (p) {
          same.appendChild(el('div.pair',
            el('div.pair-side', el('div.row', ui.speakBtn(p[0], '🔊'), el('span.es.pair-es', p[0])),
              el('div.small.muted', p[1])),
            el('div.pair-side', el('div.row', ui.speakBtn(p[2], '🔊'), el('span.es.pair-es', p[2])),
              el('div.small.muted', p[3]))));
        });
        box.appendChild(same);
        box.appendChild(el('div.hint', { style: { marginTop: '8px' } },
          'These are not a test — they sound the same. That is the point.'));
        return box;
      }

      var round = 0, right = 0, answer = null, locked = false;
      var card = el('div.card');
      box.appendChild(card);

      function next() {
        locked = false;
        ui.clear(card);
        var p = pairs[round % pairs.length];
        var which = Math.random() < 0.5 ? 0 : 1;
        answer = which;
        var say = which === 0 ? p[0] : p[2];

        card.appendChild(el('div.center',
          el('button.primary.big', { onclick: function () { ui.say(say); } }, '🔊 Play it'),
          el('div.small.faint', { style: { marginTop: '6px' } },
            'Round ' + (round + 1) + ' · ' + right + ' right')));

        var row = el('div.quiz-options', { style: { marginTop: '14px' } });
        [[p[0], p[1], 0], [p[2], p[3], 1]].forEach(function (opt) {
          var b = el('button.quiz-opt.es',
            el('div', opt[0]), el('div.small.faint', opt[1]));
          b.onclick = function () {
            if (locked) return;
            locked = true;
            var ok = opt[2] === answer;
            if (ok) right++;
            b.classList.add(ok ? 'right' : 'wrong');
            record(s.id, ok);
            card.appendChild(el('div.answer-state.' + (ok ? 'ok' : 'no'),
              { style: { marginTop: '10px' } },
              ok ? '✓ ' + say : '✗ It was “' + say + '”'));
            card.appendChild(el('div.btn-row', { style: { marginTop: '8px', justifyContent: 'center' } },
              ui.speakBtn(p[0], '🔊 ' + p[0]),
              ui.speakBtn(p[2], '🔊 ' + p[2]),
              el('button.primary', { onclick: function () { round++; next(); } }, 'Next')));
          };
          row.appendChild(b);
        });
        card.appendChild(row);
        setTimeout(function () { ui.say(say); }, 250);
      }
      next();
      return box;
    }

    /* ── Say it, and be told what broke ── */
    function sayDrill(s) {
      var box = el('div.card');
      var i = 0, listening = null;

      function draw() {
        ui.clear(box);
        var word = s.words[i % s.words.length];
        var syl = P.stressed(word);

        box.appendChild(el('div.center',
          el('div.say-word.es', syl.map(function (x, k) {
            return el('span' + (x.stressed ? '.say-stress' : ''), x.text +
              (k < syl.length - 1 ? '·' : ''));
          })),
          el('div.say-ipa', '/' + P.ipa(word) + '/'),
          el('div.small.faint', syl.length > 1
            ? 'Push on the ' + (syl.filter(function (x) { return x.stressed; })[0] || {}).text
            : '')));

        var verdict = el('div', { style: { marginTop: '12px' } });
        var micBtn = el('button.primary.wide.big', { style: { marginTop: '10px' } }, '🎙 Say it');

        micBtn.onclick = function () {
          if (listening) { listening.stop(); return; }
          if (!LUNOSIA.speech.supported) {
            ui.clear(verdict);
            verdict.appendChild(ui.banner('warn',
              'This browser has no speech recognition. Chrome, Edge or Safari, over ' +
              '<code>https</code> or <code>localhost</code>.'));
            return;
          }
          micBtn.textContent = '⏹ Listening…';
          ui.clear(verdict);
          listening = LUNOSIA.speech.listen({
            lang: 'es', silenceMs: 900,
            onpartial: function (t) { verdict.textContent = t; },
            onfinal: function (heard, conf, alts) { judge(word, heard, alts, verdict); },
            onerror: function (k) {
              ui.clear(verdict);
              verdict.appendChild(el('div.answer-state.no', LUNOSIA.speech.micError
                ? LUNOSIA.speech.micError(k) : ('Microphone: ' + k)));
            },
            onend: function () { listening = null; micBtn.textContent = '🎙 Say it'; }
          });
        };

        box.appendChild(el('div.btn-row', { style: { justifyContent: 'center', marginTop: '10px' } },
          ui.speakBtn(word, '🔊 Hear it'),
          el('button', { onclick: function () {
            LUNOSIA.speech.speak(word, { lang: 'es', rate: 0.55,
              voiceRoles: LUNOSIA.store.state.settings.voiceRoles,
              pitchScale: LUNOSIA.store.state.settings.voicePitch });
          } }, '🐢 Slower'),
          el('button', { onclick: function () { i++; draw(); } }, 'Skip →')));
        box.appendChild(micBtn);
        box.appendChild(verdict);

        function judge(want, heard, alts, out) {
          ui.clear(out);
          var candidates = [heard].concat(alts || []);
          // If any of the recogniser's guesses is the word, you said it.
          var exact = candidates.some(function (c) {
            return P.ipa(String(c).trim().toLowerCase()) === P.ipa(want);
          });

          var best = null;
          candidates.forEach(function (c) {
            var cmp = P.compare(want, String(c).trim().toLowerCase());
            if (!best || cmp.score > best.score) { best = cmp; best.heard = c; }
          });

          record(s.id, exact);

          if (exact) {
            out.appendChild(el('div.answer-state.ok', '✓ That is it.'));
            out.appendChild(el('div.btn-row', { style: { marginTop: '8px', justifyContent: 'center' } },
              el('button.primary', { onclick: function () { i++; draw(); } }, 'Next word')));
            return;
          }

          out.appendChild(el('div.answer-state.no', 'Heard “' + best.heard + '”'));
          out.appendChild(el('div.say-compare',
            el('div', el('span.small.faint', 'you want '), el('span.say-ipa-inline', '/' + best.wantIpa + '/')),
            el('div', el('span.small.faint', 'came out '), el('span.say-ipa-inline.no', '/' + best.gotIpa + '/'))));

          /* The diagnosis. This is the whole point of the screen. */
          var named = best.problems.filter(function (pr) { return LUNOSIA.data.es.soundsById[pr.sound]; });
          if (named.length) {
            named.slice(0, 2).forEach(function (pr) {
              var sd = LUNOSIA.data.es.soundsById[pr.sound];
              out.appendChild(el('div.diagnosis',
                el('div.row',
                  el('span.sound-symbol.es', sd.symbol),
                  el('div',
                    el('div.diag-title', sd.tell),
                    el('div.small.muted', sd.mouth))),
                sd.id !== s.id
                  ? el('button.ghost.small-btn', { style: { marginTop: '6px' },
                      onclick: function () { LUNOSIA.app.go('sound', { id: sd.id }); } },
                      'Work on ' + sd.title.toLowerCase() + ' →')
                  : null));
            });
          } else {
            out.appendChild(el('div.hint', { style: { marginTop: '8px' } },
              best.score > 0.7
                ? 'Close. Listen again and copy the rhythm as much as the sounds.'
                : 'That came out as a different word. Play it slowly and try once more.'));
          }

          out.appendChild(el('div.btn-row', { style: { marginTop: '10px', justifyContent: 'center' } },
            ui.speakBtn(want, '🔊 Again'),
            el('button.primary', { onclick: function () { draw(); } }, 'Try again'),
            el('button', { onclick: function () { i++; draw(); } }, 'Next word')));
        }
      }

      draw();
      var wrap = el('div');
      wrap.appendChild(box);
      wrap._onLeave = function () { if (listening) listening.abort(); };
      return wrap;
    }
  }

  LUNOSIA.views = LUNOSIA.views || {};
  LUNOSIA.views.say = viewSay;
  LUNOSIA.views.sound = viewSound;
})();
