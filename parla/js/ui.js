/* Parla — shared UI helpers
 *
 * A tiny DOM toolkit rather than a framework. Views are plain functions that
 * return an element; the router swaps them into #app.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  /* Create an element: el('div.card', {onclick: fn}, 'text', childEl, ...) */
  function el(spec) {
    var parts = String(spec).split(/(?=[.#])/);
    var node = document.createElement(parts[0] || 'div');
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (p[0] === '.') node.classList.add(p.slice(1));
      else if (p[0] === '#') node.id = p.slice(1);
    }
    for (var a = 1; a < arguments.length; a++) {
      var arg = arguments[a];
      if (arg == null || arg === false) continue;
      if (typeof arg === 'string' || typeof arg === 'number') {
        node.appendChild(document.createTextNode(String(arg)));
      } else if (arg instanceof Node) {
        node.appendChild(arg);
      } else if (Array.isArray(arg)) {
        arg.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof arg === 'object') {
        Object.keys(arg).forEach(function (k) {
          var v = arg[k];
          if (v == null || v === false) return;
          if (k.indexOf('on') === 0 && typeof v === 'function') {
            node.addEventListener(k.slice(2), v);
          } else if (k === 'html') {
            node.innerHTML = v;
          } else if (k === 'text') {
            node.textContent = v;
          } else if (k === 'style' && typeof v === 'object') {
            Object.assign(node.style, v);
          } else {
            node.setAttribute(k, v === true ? '' : v);
          }
        });
      }
    }
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* Speak a Spanish string using the user's saved voice + rate. */
  function say(text, onend, character) {
    var s = PARLA.store.state.settings;
    PARLA.speech.speak(text, {
      lang: PARLA.store.state.profile.target || 'es',
      voiceURI: s.voiceURI,
      voiceRoles: s.voiceRoles,
      pitchScale: s.voicePitch,
      character: character,
      rate: s.rate,
      onend: onend
    });
  }

  /* A small ▶ button that reads a Spanish string aloud. */
  function speakBtn(text, label, character) {
    return el('button', { type: 'button', title: 'Listen', onclick: function (e) {
      e.stopPropagation();
      say(text, null, character);
    } }, label || '🔊');
  }

  function levelTag(lvl) {
    return el('span.level-tag.' + (lvl || 'a1'), (lvl || 'a1').toUpperCase());
  }

  function stat(n, k) {
    return el('div.stat', el('div.n', String(n)), el('div.k', k));
  }

  function bar(frac) {
    var pct = Math.max(0, Math.min(1, frac || 0)) * 100;
    return el('div.bar', el('i', { style: { width: pct.toFixed(1) + '%' } }));
  }

  function banner(kind, content) {
    var b = el('div.banner.' + kind);
    if (typeof content === 'string') b.innerHTML = content;
    else b.appendChild(content);
    return b;
  }

  function empty(emoji, title, sub) {
    return el('div.empty',
      el('span.big-emoji', emoji),
      el('div', { style: { fontWeight: '600', color: 'var(--ink-soft)' } }, title),
      sub ? el('div.small', sub) : null
    );
  }

  function sectionTitle(title, right) {
    return el('div.section-title', el('h2', title), el('div.spacer'), right || null);
  }

  /* A segmented control. options: [[value, label], ...] */
  function segmented(options, current, onPick) {
    var wrap = el('div.seg');
    options.forEach(function (o) {
      var b = el('button', { type: 'button', 'aria-pressed': String(o[0] === current) }, o[1]);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(wrap.children, function (c) {
          c.setAttribute('aria-pressed', 'false');
        });
        b.setAttribute('aria-pressed', 'true');
        onPick(o[0]);
      });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function field(labelText, control, hint) {
    return el('label.field',
      el('span', labelText),
      control,
      hint ? el('div.hint', hint) : null
    );
  }

  /* Format a count of minutes as "1h 20m" / "45m". */
  function dur(mins) {
    mins = Math.round(mins || 0);
    if (mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
  }

  function toast(msg, kind) {
    var t = el('div.banner.' + (kind || 'good'), msg);
    // Anchored to the top: the bottom of the screen belongs to the mic dock,
    // the phrasebook and the nav.
    Object.assign(t.style, {
      position: 'fixed', left: '50%', top: '62px', transform: 'translateX(-50%)',
      zIndex: '90', boxShadow: 'var(--shadow-lg)', margin: '0', maxWidth: '90vw',
      background: 'var(--bg-raised)', border: '1px solid var(--line)'
    });
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .4s';
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 420);
    }, 2400);
  }

  /* Explains, before a conversation starts, that the chosen AI partner is not
   * reachable and the scripted engine will answer instead. Returns null when
   * everything is fine. */
  function brainBanner() {
    var s = PARLA.store.state.settings;
    var h = PARLA.brain.health;
    if (s.brain === 'scripted' || !h.checked || h.ok) return null;

    var b = banner('warn', '');
    b.appendChild(el('div', el('strong', 'Your AI partner is not connected.'),
      ' ' + h.detail + ' Conversations will use the built-in scripted partner until it is fixed.'));

    if (s.brain === 'ollama') {
      b.appendChild(el('div.small', { style: { marginTop: '6px' } },
        'Fix: make sure Ollama is running, and that OLLAMA_ORIGINS is set to * so the browser is allowed to reach it.'));
    }
    b.appendChild(el('div', { style: { marginTop: '8px' } },
      el('button', { style: { padding: '4px 10px', fontSize: '.78rem' },
        onclick: function () {
          PARLA.app.checkBrainHealth().then(function () { PARLA.app.go('scenarios'); });
        } }, 'Retry'),
      el('button', { style: { padding: '4px 10px', fontSize: '.78rem', marginLeft: '6px' },
        onclick: function () { PARLA.app.go('settings'); } }, 'Settings')));
    return b;
  }

  PARLA.ui = {
    brainBanner: brainBanner,
    el: el, clear: clear, say: say, speakBtn: speakBtn, levelTag: levelTag,
    stat: stat, bar: bar, banner: banner, empty: empty, sectionTitle: sectionTitle,
    segmented: segmented, field: field, dur: dur, toast: toast
  };
})();
