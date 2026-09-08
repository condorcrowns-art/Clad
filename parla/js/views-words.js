/* Parla — the word bank
 *
 * Thirty-one thousand words, and the honest question a learner has about them:
 * which ones do I not know yet, and which of those matter most?
 *
 * The dictionary is ordered commonest-first, so that question has an answer.
 * The top 1,000 words are about three-quarters of everything anyone says; the
 * top 3,000 is most of a conversation. This screen turns that ordering into
 * bands you can work through, shows how much of each you already have, and
 * lets you take a word into your deck with one tap.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  var BANDS = [
    [1, 250, 'First 250', 'Where every conversation starts.'],
    [251, 500, 'To 500', 'Enough to hold a simple one.'],
    [501, 1000, 'To 1,000', 'Roughly three quarters of everything said.'],
    [1001, 2000, 'To 2,000', 'You stop needing to translate in your head.'],
    [2001, 3000, 'To 3,000', 'Most of a real conversation.'],
    [3001, 5000, 'To 5,000', 'Television without subtitles.'],
    [5001, 10000, 'To 10,000', 'Novels, news, jokes.']
  ];

  var POS_FILTERS = [
    ['', 'Everything'], ['n', 'Nouns'], ['v', 'Verbs'],
    ['adj', 'Adjectives'], ['adv', 'Adverbs'], ['phrase', 'Phrases']
  ];

  var POS_NAME = {
    n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun',
    prep: 'preposition', conj: 'conjunction', interj: 'interjection',
    num: 'number', phrase: 'phrase', prop: 'name', abbr: 'abbreviation', other: ''
  };

  /* Everything already in the deck, as a lookup. */
  function knownSet() {
    var st = PARLA.store.state;
    var set = Object.create(null);
    var norm = PARLA.brain.normalise;
    (PARLA.data.es.vocab || []).forEach(function (v) {
      set[norm(v[0])] = 1;
      set[norm(String(v[0]).replace(/^(el|la|los|las)\s+/, ''))] = 1;
    });
    (st.phrases || []).forEach(function (p) { set[norm(p.es)] = 1; });
    return set;
  }

  function viewWords(params) {
    init();
    var st = PARLA.store.state;
    var main = el('main');
    var D = PARLA.dict;

    main.appendChild(el('h1', 'Word bank'));

    if (!D) return main;

    if (!D.ready()) {
      var loading = el('div.card.center',
        el('p', D.failure() ? 'The dictionary could not be loaded.' : 'Loading the dictionary…'),
        el('p.small.muted', D.failure()
          ? D.failure() + ' — it is a one-off download of about half a megabyte; ' +
            'after that it works offline.'
          : 'About half a megabyte, once. After that it is offline for good.'));
      main.appendChild(loading);
      D.load().then(function () { PARLA.app.go('words', params); });
      return main;
    }

    var known = knownSet();
    var norm = PARLA.brain.normalise;
    var isKnown = function (term) {
      return !!(known[norm(term)] || known[norm(String(term).replace(/^(el|la|los|las)\s+/, ''))]);
    };

    /* ── how far through the language you are ───────────────*/
    var cov = D.coverage(isKnown, 1000);
    var cov3 = D.coverage(isKnown, 3000);

    var head = el('div.card');
    head.appendChild(el('div.row',
      el('div',
        el('div.wb-big', cov.have + ' / ' + cov.total),
        el('div.small.muted', 'of the 1,000 commonest words')),
      el('div.spacer'),
      el('div.right',
        el('div.wb-big', cov3.pct + '%'),
        el('div.small.muted', 'of the top 3,000'))));
    head.appendChild(ui.bar(cov.pct / 100));
    head.appendChild(el('p.small.muted', { style: { marginTop: '10px' } },
      cov.pct < 10 ? 'Early days. The first few hundred words carry an outsized amount of meaning — ' +
                     'get those and everything after them is easier.'
      : cov.pct < 40 ? 'This is the part where the graph does the most work per word. Keep going.'
      : cov.pct < 75 ? 'Past halfway on the words that matter most. The gaps left are worth hunting deliberately.'
      : 'You have most of the common ground. From here it is the long tail, and the long tail is where character is.'));
    main.appendChild(head);

    /* ── bands ──────────────────────────────────────────────*/
    main.appendChild(ui.sectionTitle('By how common they are'));
    var bandGrid = el('div.grid.two');
    BANDS.forEach(function (b) {
      var words = D.band(b[0], b[1], 4000);
      var have = words.filter(function (w) { return isKnown(w.term); }).length;
      var pct = words.length ? Math.round(have * 100 / words.length) : 0;
      bandGrid.appendChild(el('button.band-card', {
        onclick: function () { PARLA.app.go('words', { band: b[0] + '-' + b[1] }); }
      },
        el('div.row',
          el('strong', b[2]),
          el('div.spacer'),
          el('span.chip' + (pct >= 80 ? '.good' : ''), pct + '%')),
        el('div.small.muted', b[3]),
        ui.bar(pct / 100),
        el('div.small.faint', have + ' of ' + words.length + ' in your deck')));
    });
    main.appendChild(bandGrid);

    /* ── search and browse ──────────────────────────────────*/
    main.appendChild(ui.sectionTitle('Look through them'));

    var q = el('input.ask-input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
      placeholder: 'Spanish or English — “sombra”, “to melt”, “kitchen”'
    });
    var posSel = '';
    var band = null;
    var onlyNew = false;

    if (params && params.band) {
      var m = /^(\d+)-(\d+)$/.exec(params.band);
      if (m) band = [Number(m[1]), Number(m[2])];
    }

    var controls = el('div.wb-controls');
    controls.appendChild(q);
    var posRow = el('div.tense-row');
    POS_FILTERS.forEach(function (p) {
      posRow.appendChild(el('button.tense-btn', {
        'aria-pressed': p[0] === posSel ? 'true' : 'false',
        onclick: function () { posSel = p[0]; paintPos(); draw(); }
      }, p[1]));
    });
    controls.appendChild(posRow);

    var toggles = el('div.btn-row', { style: { marginTop: '8px' } },
      el('button.ghost', { onclick: function () {
        onlyNew = !onlyNew;
        this.setAttribute('aria-pressed', onlyNew ? 'true' : 'false');
        this.textContent = onlyNew ? '☑ Only words I do not have' : '☐ Only words I do not have';
        draw();
      } }, '☐ Only words I do not have'));
    if (band) {
      toggles.appendChild(el('span.chip.hot', 'band ' + band[0] + '–' + band[1]));
      toggles.appendChild(el('button.ghost', { onclick: function () {
        band = null; PARLA.app.go('words');
      } }, 'clear'));
    }
    controls.appendChild(toggles);
    main.appendChild(controls);

    function paintPos() {
      [].forEach.call(posRow.children, function (b, i) {
        b.setAttribute('aria-pressed', POS_FILTERS[i][0] === posSel ? 'true' : 'false');
      });
    }

    var list = el('div.wb-list');
    main.appendChild(list);

    var timer = null;
    q.oninput = function () { clearTimeout(timer); timer = setTimeout(draw, 140); };

    function draw() {
      var res = D.search({ q: q.value, pos: posSel, band: band, limit: onlyNew ? 400 : 120 });
      if (onlyNew) res = res.filter(function (e) { return !isKnown(e.term); }).slice(0, 120);
      ui.clear(list);

      if (!res.length) {
        list.appendChild(ui.empty('🔍', 'Nothing matches',
          'Try fewer letters, or search the English meaning instead.'));
        return;
      }

      res.forEach(function (e) {
        var have = isKnown(e.term);
        var article = e.gender === 'f' ? 'la ' : (e.gender === 'm' ? 'el ' : '');
        var row = el('div.wb-row' + (have ? '.have' : ''),
          ui.speakBtn(article + e.term, '🔊'),
          el('div.wb-main',
            el('div.wb-term.es', article + e.term),
            el('div.wb-en', e.glosses.slice(0, 2).join(' · ')),
            el('div.wb-meta',
              POS_NAME[e.pos] ? el('span', POS_NAME[e.pos]) : null,
              e.band ? el('span', '#' + e.band.toLocaleString()) : null,
              e.register ? el('span.tag-soft', e.register) : null,
              e.region ? el('span.tag-soft', e.region) : null)),
          have
            ? el('span.chip.good', '✓')
            : el('button.primary.small-btn', { onclick: function () {
                PARLA.store.addWord(article + e.term, e.glosses[0], '', '');
                known[norm(e.term)] = 1;
                ui.toast('“' + e.term + '” added', 'good');
                draw();
              } }, '+'),
          el('button.ghost.small-btn', {
            title: 'Everything about this word',
            onclick: function () { PARLA.app.go('coach', { q: e.term }); }
          }, '›'));
        list.appendChild(row);
      });

      if (res.length >= 120) {
        list.appendChild(el('div.small.faint.center',
          { style: { padding: '10px' } },
          'Showing the first 120. Narrow it with the search box.'));
      }
    }

    paintPos();
    draw();
    return main;
  }

  PARLA.views = PARLA.views || {};
  PARLA.views.words = viewWords;
})();
