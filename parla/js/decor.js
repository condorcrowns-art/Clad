/* Parla — the fiesta, drawn rather than downloaded
 *
 * Every ornament here is generated from geometry: papel picado cut from
 * circles and triangles, a Talavera lattice built from eight-fold rosettes, a
 * mural composed of flat shapes. No image files, no fonts, nothing to fetch —
 * which keeps the app installable, offline, and free, the same constraints
 * that shape the rest of it.
 *
 * The designs are original compositions in a folk idiom, not reproductions of
 * anyone's artwork.
 *
 * If this file fails to load, the app is plain and entirely functional.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var PALETTE = ['--rosa', '--amarillo', '--turquesa', '--verde', '--morado', '--naranja'];

  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#e01a76';
  }

  function svg(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Papel picado ─────────────────────────────────────────
   * Each flag is a rectangle with a scalloped hem, punched through with a
   * ring of holes and a rosette — the way the real thing is cut, folded and
   * chiselled. Every flag gets its own hole pattern so the string does not
   * read as one shape repeated.
   */
  function flag(colour, seed) {
    var W = 74, H = 92;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });

    // Body with a scalloped bottom edge.
    var scallops = 4, r = W / (scallops * 2);
    var d = 'M0 0 H' + W + ' V' + (H - r);
    for (var i = 0; i < scallops; i++) {
      d += ' a' + r + ' ' + r + ' 0 0 1 ' + (-2 * r) + ' 0';
    }
    d += ' Z';
    s.appendChild(svg('path', { d: d, fill: colour }));

    // Punched holes. A ring of them, plus a central rosette.
    var cx = W / 2, cy = H / 2 - 6;
    var petals = 6 + (seed % 3);
    for (var p = 0; p < petals; p++) {
      var a = (p / petals) * Math.PI * 2 + seed;
      s.appendChild(svg('circle', {
        cx: (cx + Math.cos(a) * 17).toFixed(1),
        cy: (cy + Math.sin(a) * 17).toFixed(1),
        r: 5, fill: 'var(--bg)'
      }));
    }
    s.appendChild(svg('circle', { cx: cx, cy: cy, r: 6.5, fill: 'var(--bg)' }));

    // A row of slits near the top, like a folded cut.
    for (var k = 0; k < 3; k++) {
      s.appendChild(svg('rect', {
        x: 14 + k * 18, y: 12, width: 5, height: 13, rx: 2.5, fill: 'var(--bg)'
      }));
    }
    return s;
  }

  /* Flags are laid out by height, so a flag drawn 74 wide by 92 tall renders
   * about 47px across at the 58px strip height. Counting by the design width
   * gave half as many as the screen needed and left the string dangling in the
   * middle, so the count comes from the rendered width. */
  var FLAG_W = 58 * (74 / 92);

  function banner() {
    var wrap = document.createElement('div');
    wrap.className = 'papel';
    wrap.setAttribute('aria-hidden', 'true');
    var n = Math.max(6, Math.ceil(window.innerWidth / FLAG_W));
    for (var i = 0; i < n; i++) {
      wrap.appendChild(flag(css(PALETTE[i % PALETTE.length]), i));
    }
    return wrap;
  }

  /* Re-strung on resize, or a window dragged wider ends in a bare patch. */
  var restring;
  window.addEventListener('resize', function () {
    clearTimeout(restring);
    restring = setTimeout(function () {
      var old = document.querySelector('.papel');
      if (old) old.replaceWith(banner());
    }, 200);
  });

  /* ── Talavera lattice ─────────────────────────────────────
   * An eight-fold rosette in a square, the geometry Puebla tiles are built
   * on. Rendered once to a data URI and handed to CSS as a repeating
   * background, so the browser tiles it for free.
   */
  function tileArt() {
    var S = 132, c = S / 2;
    var parts = [];
    function petal(cx, cy, rot, fill, op) {
      return '<path d="M' + cx + ' ' + (cy - 15) +
             ' q 11 11 0 22 q -11 -11 0 -22 Z" fill="' + fill + '" opacity="' + op +
             '" transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')"/>';
    }
    var ink = css('--ink-faint');
    var tq = css('--turquesa');
    var am = css('--amarillo');

    for (var i = 0; i < 8; i++) parts.push(petal(c, c, i * 45, tq, .16));
    parts.push('<circle cx="' + c + '" cy="' + c + '" r="6" fill="' + am + '" opacity=".2"/>');
    // Corner quarter-rosettes, so neighbouring tiles interlock.
    [[0, 0], [S, 0], [0, S], [S, S]].forEach(function (pt) {
      for (var j = 0; j < 8; j++) parts.push(petal(pt[0], pt[1], j * 45, ink, .1));
    });
    parts.push('<rect x="0" y="0" width="' + S + '" height="' + S +
               '" fill="none" stroke="' + ink + '" stroke-opacity=".07"/>');

    var doc = '<svg xmlns="http://www.w3.org/2000/svg" width="' + S + '" height="' + S + '">' +
              parts.join('') + '</svg>';
    return 'url("data:image/svg+xml,' + encodeURIComponent(doc) + '")';
  }

  /* ── The mural ────────────────────────────────────────────
   * Flat colour, hard edges, a turning sun: the vocabulary of a painted wall.
   * Composed here rather than drawn by hand so it recolours with the theme.
   */
  function mural(headline, sub, kicker) {
    var wrap = document.createElement('div');
    wrap.className = 'mural';

    var W = 800, H = 300;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true', focusable: 'false' });

    // Sky
    var grad = svg('linearGradient', { id: 'sky', x1: '0', y1: '0', x2: '0', y2: '1' });
    [['0%', '--morado'], ['55%', '--rosa'], ['100%', '--naranja']].forEach(function (st) {
      grad.appendChild(svg('stop', { offset: st[0], 'stop-color': css(st[1]) }));
    });
    var defs = svg('defs', {});
    defs.appendChild(grad);
    s.appendChild(defs);
    s.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#sky)' }));

    // Sun: a disc with a ring of rays that turns.
    var sun = svg('g', { transform: 'translate(600 108)' });
    var rays = svg('g', { class: 'rays' });
    for (var i = 0; i < 24; i++) {
      rays.appendChild(svg('rect', {
        x: -2.5, y: -96, width: 5, height: 30, rx: 2.5,
        fill: css('--amarillo'), opacity: i % 2 ? '.55' : '.9',
        transform: 'rotate(' + (i * 15) + ')'
      }));
    }
    sun.appendChild(rays);
    sun.appendChild(svg('circle', { r: 54, fill: css('--amarillo') }));
    sun.appendChild(svg('circle', { r: 40, fill: css('--bg'), opacity: '.22' }));
    s.appendChild(sun);

    // Birds, crossing at their own pace.
    for (var b = 0; b < 3; b++) {
      var y = 52 + b * 26;
      s.appendChild(svg('path', {
        class: 'bird',
        d: 'M0 ' + y + ' q 9 -8 18 0 q 9 -8 18 0',
        fill: 'none', stroke: css('--bg'), 'stroke-width': 3,
        'stroke-linecap': 'round', opacity: '.75'
      }));
    }

    // Hills, back to front.
    s.appendChild(svg('path', {
      d: 'M0 210 Q 150 140 320 200 T 800 170 V300 H0 Z',
      fill: css('--morado'), opacity: '.55'
    }));
    s.appendChild(svg('path', {
      d: 'M0 240 Q 200 180 420 232 T 800 214 V300 H0 Z',
      fill: css('--azul'), opacity: '.75'
    }));

    // An arcade of arches along the foreground — the shape every zocalo has.
    var arcade = svg('g', {});
    arcade.appendChild(svg('rect', { x: 0, y: 250, width: W, height: 50, fill: css('--naranja') }));
    for (var a = 0; a < 10; a++) {
      var x = 18 + a * 80;
      arcade.appendChild(svg('path', {
        d: 'M' + x + ' 300 V272 a22 22 0 0 1 44 0 V300 Z',
        fill: css('--ink'), opacity: '.55'
      }));
    }
    s.appendChild(arcade);

    // Agave in the near corner: straight blades from one point.
    var agave = svg('g', { transform: 'translate(96 300)' });
    [-64, -44, -22, 0, 22, 44, 64].forEach(function (deg, i) {
      agave.appendChild(svg('path', {
        d: 'M0 0 L-9 -34 L0 -' + (74 - Math.abs(deg) * 0.35).toFixed(0) + ' L9 -34 Z',
        fill: css('--verde'),
        opacity: i % 2 ? '.85' : '1',
        transform: 'rotate(' + deg + ')'
      }));
    });
    s.appendChild(agave);

    wrap.appendChild(s);

    var over = document.createElement('div');
    over.className = 'over';
    if (kicker) {
      var k = document.createElement('div');
      k.className = 'kicker';
      k.textContent = kicker;
      over.appendChild(k);
    }
    var line = document.createElement('div');
    line.className = 'line';
    line.textContent = headline;
    over.appendChild(line);
    if (sub) {
      var sb = document.createElement('div');
      sb.className = 'sub';
      sb.textContent = sub;
      over.appendChild(sb);
    }
    wrap.appendChild(over);
    return wrap;
  }

  /* ── Confetti ─────────────────────────────────────────────
   * For the moments worth marking. Self-cleaning: the layer removes itself
   * once the last piece has landed, so nothing accumulates.
   */
  function confetti(count) {
    if (reduced) return;
    count = count || 70;
    var layer = document.createElement('div');
    layer.className = 'confetti-layer';
    layer.setAttribute('aria-hidden', 'true');

    for (var i = 0; i < count; i++) {
      var p = document.createElement('i');
      p.className = 'confetti';
      var dur = 1.9 + Math.random() * 1.8;
      p.style.left = (Math.random() * 100) + 'vw';
      p.style.top = (-12 - Math.random() * 22) + 'vh';
      p.style.background = css(PALETTE[i % PALETTE.length]);
      p.style.setProperty('--dur', dur + 's');
      p.style.setProperty('--dx', (Math.random() * 220 - 110) + 'px');
      p.style.setProperty('--spin', (Math.random() * 1080 - 540) + 'deg');
      if (i % 3 === 0) p.style.borderRadius = '50%';
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(function () { layer.remove(); }, 4200);
  }

  /* ── Entrances ────────────────────────────────────────────
   * Cards arrive in sequence. Capped, because a long list staggered to the
   * end leaves the last item arriving after the reader got there.
   */
  function reveal(root) {
    if (reduced || !root) return;
    var items = root.querySelectorAll('.card, .mural, .grid > *, .section-title');
    for (var i = 0; i < items.length; i++) {
      if (items[i].closest('.mural') && !items[i].classList.contains('mural')) continue;
      items[i].classList.add('rise');
      items[i].style.animationDelay = Math.min(i * 45, 400) + 'ms';
    }
  }

  /* Draw attention to a counter that just changed. */
  function pop(el) {
    if (!el || reduced) return;
    el.classList.remove('pop');
    void el.offsetWidth;          // restart the animation
    el.classList.add('pop');
  }

  function install() {
    document.documentElement.style.setProperty('--tile-art', tileArt());
    var bar = document.querySelector('.topbar');
    if (bar && !document.querySelector('.papel')) {
      bar.insertAdjacentElement('afterend', banner());
    }
  }

  PARLA.decor = {
    install: install,
    mural: mural,
    confetti: confetti,
    reveal: reveal,
    pop: pop,
    reduced: reduced
  };
})();
