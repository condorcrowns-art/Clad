/* Parla — ask it anything
 *
 * The shipped word list is 521 words. The model knows the language. Capping a
 * lookup at a hand-typed list was the wrong instinct, so this screen takes any
 * word, phrase or sentence — Spanish or English, spelled right or not — and
 * comes back with the meaning, the dictionary form, the gender, the full
 * conjugation if it is a verb, how a sentence is built around it, and the
 * mistake English speakers make with it.
 *
 * The corpus and the conjugation engine answer first wherever they can: they
 * are instant, free, and never wrong. The model fills in the rest, which is
 * most of the language.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';
  var el, ui;
  function init() { ui = PARLA.ui; el = ui.el; }

  function viewCoach(params) {
    init();
    var st = PARLA.store.state;
    var main = el('main');
    var pending = 0;

    main.appendChild(el('h1', 'Ask about any word'));
    main.appendChild(el('p.muted',
      'Any form of it — conjugated, plural, feminine, with pronouns on the end.'));

    var dictLine = el('div.small.faint', { style: { marginBottom: '10px' } });
    main.appendChild(dictLine);
    function paintDict() {
      var D = PARLA.dict;
      if (!D) return;
      if (D.ready()) {
        dictLine.textContent = D.size().toLocaleString() + ' words offline, no model needed.';
      } else if (D.failure()) {
        dictLine.textContent = 'Dictionary not loaded (' + D.failure() + ') — answers will be thinner.';
      } else {
        dictLine.textContent = 'Loading the dictionary…';
        D.load().then(paintDict);
      }
    }
    paintDict();

    var input = el('input.ask-input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
      placeholder: 'a word, or how it sounded'
    });
    var goBtn = el('button.primary', { onclick: function () { ask(input.value); } }, 'Ask');
    input.onkeydown = function (e) { if (e.key === 'Enter') ask(input.value); };

    main.appendChild(el('div.ask-row', input, goBtn));

    var recent = (st.asked || []).slice(0, 8);
    if (recent.length) {
      var chips = el('div.ask-recent');
      chips.appendChild(el('span.small.faint', 'Recently:'));
      recent.forEach(function (q) {
        chips.appendChild(el('button.ask-chip', { onclick: function () { ask(q); } }, q));
      });
      main.appendChild(chips);
    }

    var out = el('div.ask-out');
    main.appendChild(out);

    /* An empty screen with one text box on it tells a beginner nothing about
     * what it can do. These are here to be tapped, and each one demonstrates
     * something different the engine handles. */
    var TRY = [
      ['madrugar', 'a verb the shipped list never had'],
      ['pidiéndoselo', 'a form with two pronouns stuck on it'],
      ['tuvieron', 'an irregular preterite'],
      ['canciones', 'a plural'],
      ['rápidamente', 'an adverb built from an adjective'],
      ['buenísimo', 'the -ísimo superlative'],
      ['güey', 'slang, and where it is said'],
      ['habíamos comido', 'two words, one tense']
    ];
    var starter = el('div.ask-starter');
    starter.appendChild(el('div.small.faint', 'Nothing to ask yet? Try one of these.'));
    var tryRow = el('div.ask-recent');
    TRY.forEach(function (t) {
      tryRow.appendChild(el('button.ask-chip', { title: t[1], onclick: function () { ask(t[0]); } },
        el('span.es', t[0]), el('span.small.faint', t[1])));
    });
    starter.appendChild(tryRow);
    main.appendChild(starter);

    function hideStarter() { starter.hidden = true; }

    function ask(query) {
      query = String(query || '').trim();
      if (!query) { input.focus(); return; }
      input.value = query;

      st.asked = [query].concat((st.asked || []).filter(function (q) { return q !== query; })).slice(0, 20);
      PARLA.store.save();

      var mine = ++pending;
      hideStarter();
      ui.clear(out);
      out.appendChild(el('div.card', el('div.muted', 'Looking it up…')));

      PARLA.brain.explain({
        query: query,
        lang: st.profile.target || 'es',
        settings: Object.assign({}, st.settings, { level: st.profile.level })
      }).then(function (res) {
        if (mine !== pending) return;             // a newer question won
        ui.clear(out);
        out.appendChild(res ? render(res) : notFound(query));
        if (PARLA.decor) PARLA.decor.reveal(out);
      });
    }

    function notFound(query) {
      return el('div.card',
        el('h2', 'Nothing to go on'),
        el('p.muted',
          'Nothing in the dictionary matches “' + query + '”, and no form of it ' +
          'works backwards to a word either. Check the spelling — or connect an ' +
          'AI partner in Settings, which can answer for things a dictionary cannot.'),
        el('div.btn-row',
          el('button', { onclick: function () { PARLA.app.go('settings'); } }, 'Settings')));
    }

    function render(r) {
      var card = el('div.card.ask-card');

      var article = r.gender === 'f' ? 'la ' : (r.gender === 'm' ? 'el ' : '');
      var headword = r.lemma || r.term;

      card.appendChild(el('div.ask-head',
        el('div.ask-term.es', headword),
        r.pos ? el('span.chip', r.pos + (r.gender ? ' · ' + (r.gender === 'f' ? 'feminine' : 'masculine') : '')) : null,
        el('div.spacer'),
        ui.speakBtn(r.term || headword, '🔊')
      ));

      if (r.en) card.appendChild(el('div.ask-en', r.en));
      else card.appendChild(el('div.ask-en.muted', 'No confident meaning — try rephrasing it.'));

      // Other senses of the same word. A learner who only ever sees the first
      // one will use "mano" for the hand of a clock and wonder why nobody
      // understands.
      if (r.senses && r.senses.length > 1) {
        card.appendChild(el('div.ask-senses',
          el('span.small.faint', 'also: '),
          el('span', r.senses.slice(1).join(' · '))));
      }

      // Register and region are the difference between sounding fluent and
      // sounding like you learned Spanish from one country's television.
      if (r.register || r.region) {
        var tags = el('div.ask-tags');
        if (r.register) {
          tags.appendChild(el('span.tag-' + (r.register === 'vulgar' || r.register === 'rude'
            ? 'warn' : 'soft'), REGISTER_TEXT[r.register] || r.register));
        }
        if (r.region) tags.appendChild(el('span.tag-soft', '📍 ' + r.region));
        card.appendChild(tags);
      }

      if (r.term && r.term !== headword) {
        card.appendChild(el('div.small.muted', 'you asked about: ' + r.term));
      }
      if (r.note) card.appendChild(el('div.ask-note', r.note));
      if (r.rarity) card.appendChild(el('div.small.faint', r.rarity +
        (r.band ? '  (#' + r.band.toLocaleString() + ' commonest)' : '')));

      // Every other way the form could be read. "casas" is the plural of a
      // house far more often than it is the tú-form of "to marry", but it is
      // both, and being shown both is how you stop being confused by it.
      if (r.readings && r.readings.length > 1) {
        var alt = el('div.ask-block',
          el('div.ask-label', 'It could also be'));
        r.readings.slice(1, 4).forEach(function (a2) {
          alt.appendChild(el('div.ask-reading',
            el('span.es', a2.lemma),
            el('span.small.muted', ' — ' + (a2.why || a2.en || '')),
            el('button.linkish', { onclick: function () { ask(a2.lemma); } }, 'look up')));
        });
        card.appendChild(alt);
      }

      if (r.structure) {
        card.appendChild(el('div.ask-block',
          el('div.ask-label', 'How it is used'),
          el('div', r.structure)));
      }

      if (r.pitfall) {
        card.appendChild(el('div.ask-block.warn',
          el('div.ask-label', 'What English speakers get wrong'),
          el('div', r.pitfall)));
      }

      if (r.examples && r.examples.length) {
        var ex = el('div.ask-block',
          el('div.ask-label', r.examples.length > 1 ? 'Examples' : 'Example'));
        r.examples.forEach(function (e) {
          ex.appendChild(el('div.ask-example',
            ui.speakBtn(e.es, '🔊'),
            el('div',
              el('div.es', e.es),
              e.en ? el('div.small.muted', e.en) : null)));
        });
        card.appendChild(ex);
      }

      if (r.conjugation) card.appendChild(conjugationBlock(r.conjugationOf || headword, r));

      // Everything looked up is a candidate for the deck, whether or not it
      // was ever in the shipped list.
      // Compare with the article off both sides, or "cuenta" gets a second
      // card next to the "la cuenta" already in the deck.
      var bare = function (t) {
        return PARLA.brain.normalise(String(t).replace(/^(el|la|los|las|un|una)\s+/i, ''));
      };
      var already = (st.phrases || []).some(function (p) {
        return bare(p.es) === bare(headword);
      }) || !!(PARLA.data.es.vocab || []).filter(function (v) {
        return bare(v[0]) === bare(headword);
      })[0];

      // A card with no meaning on the back is not a flashcard, it is a blank.
      // Better to say why than to let someone fill their deck with them.
      card.appendChild(el('div.btn-row', { style: { marginTop: '14px' } },
        already
          ? el('button', { disabled: 'disabled' }, '✓ Already in your deck')
          : !r.en
          ? el('button', { disabled: 'disabled', title: 'No meaning to put on the card yet' },
              'Needs a meaning first')
          : el('button.primary', { onclick: function () {
              var ex0 = (r.examples || [])[0] || {};
              PARLA.store.addWord(article + headword === headword ? headword : headword,
                                  r.en, ex0.es || '', ex0.en || '');
              ui.toast('“' + headword + '” added to your deck', 'good');
              PARLA.app.go('coach', { q: r.term });
            } }, '+ Learn this'),
        el('button', { onclick: function () { PARLA.app.go('review'); } }, 'Go review')));

      if (r.partial) {
        var D2 = PARLA.dict;
        card.appendChild(el('div.hint', { style: { marginTop: '10px' } },
          D2 && D2.ready()
            ? 'From the ' + D2.size().toLocaleString() + '-word dictionary and the grammar ' +
              'engine — no model involved, and it works offline. An AI partner would add ' +
              'the sentence-level advice: how it is used, and what English speakers get wrong.'
            : 'From the built-in word list and grammar engine. The full dictionary has not ' +
              'loaded yet, so this answer is thinner than it should be.'));
      }
      return card;
    }

    function conjugationBlock(inf, r) {
      var V = PARLA.data.es.verbs;
      var block = el('div.ask-block');
      var tenses = Object.keys(r.conjugation);
      var shown = 'presente';

      block.appendChild(el('div.ask-label', 'Conjugation'));

      var picker = el('div.tense-row');
      tenses.forEach(function (t) {
        picker.appendChild(el('button.tense-btn', {
          'aria-pressed': t === shown ? 'true' : 'false',
          onclick: function () { shown = t; draw(); }
        }, V.tenses[t] ? V.tenses[t].label : t));
      });
      block.appendChild(picker);

      var table = el('div.conj-table');
      block.appendChild(table);

      // The table is generated from the same rules that drive the verb drill,
      // which is more reliable than an 8B model reciting one from memory. For a
      // verb it has never been told is irregular, that is a guess - and it says so.
      if (r.participle || r.gerund) {
        block.appendChild(el('div.conj-extra',
          r.gerund ? el('span', el('span.small.faint', 'doing it: '),
                        el('span.es', r.gerund)) : null,
          r.participle ? el('span', el('span.small.faint', 'done: '),
                            el('span.es', r.participle)) : null));
      }

      // Why this verb bends, when it does. "Irregular" on its own teaches
      // nothing; "the e breaks when the stress lands on it" is a rule you can
      // carry to the next verb.
      if (r.irregularNote) {
        block.appendChild(el('div.hint.good-hint', r.irregularNote));
      } else if (!r.conjugationExact) {
        block.appendChild(el('div.hint',
          'Generated from the regular pattern. If “' + inf + '” is irregular, ' +
          'check a form before trusting it.'));
      }

      function draw() {
        ui.clear(table);
        var forms = r.conjugation[shown] || [];
        [].forEach.call(picker.children, function (b) {
          b.setAttribute('aria-pressed', b.textContent === (V.tenses[shown] ? V.tenses[shown].label : shown) ? 'true' : 'false');
        });
        V.pronouns.forEach(function (p, i) {
          table.appendChild(el('div.conj-row',
            el('span.conj-p', p),
            el('span.conj-f.es', forms[i] || '—'),
            ui.speakBtn(forms[i] || '', '🔊')));
        });
      }
      draw();
      return block;
    }

    // Arriving with a question already in hand — from a tapped word, say.
    if (params && params.q) {
      setTimeout(function () { ask(params.q); }, 0);
    } else {
      setTimeout(function () { input.focus(); }, 40);
    }

    return main;
  }

  var REGISTER_TEXT = {
    vulgar: '⚠️ vulgar', rude: '⚠️ rude', slang: 'slang', informal: 'informal',
    formal: 'formal', literary: 'literary', dated: 'old-fashioned', rare: 'rare',
    euphemism: 'a polite way of putting it', humorous: 'jokey'
  };

  PARLA.views = PARLA.views || {};
  PARLA.views.coach = viewCoach;
})();
