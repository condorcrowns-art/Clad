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
      'A word, a phrase, or a whole sentence — in Spanish or English. ' +
      'If you are not sure how it is spelled, write it how it sounded.'));

    var input = el('input.ask-input', {
      type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
      placeholder: 'e.g. madrugar   ·   la cuenta   ·   how do I say "I forgot"'
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

    function ask(query) {
      query = String(query || '').trim();
      if (!query) { input.focus(); return; }
      input.value = query;

      st.asked = [query].concat((st.asked || []).filter(function (q) { return q !== query; })).slice(0, 20);
      PARLA.store.save();

      var mine = ++pending;
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
          'The word list here does not have “' + query + '”, and there is no AI ' +
          'partner connected to ask. Start Ollama and this screen answers for ' +
          'any word in the language.'),
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

      if (r.term && r.term !== headword) {
        card.appendChild(el('div.small.muted', 'you asked about: ' + r.term));
      }
      if (r.note) card.appendChild(el('div.ask-note', r.note));

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

      if (r.conjugation) card.appendChild(conjugationBlock(headword, r));

      // Everything looked up is a candidate for the deck, whether or not it
      // was ever in the shipped list.
      var already = (st.phrases || []).some(function (p) {
        return PARLA.brain.normalise(p.es) === PARLA.brain.normalise(headword);
      }) || !!(PARLA.data.es.vocab || []).filter(function (v) {
        return PARLA.brain.normalise(v[0]) === PARLA.brain.normalise(headword);
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
        card.appendChild(el('div.hint', { style: { marginTop: '10px' } },
          'Answered from the built-in word list and grammar engine. ' +
          'With an AI partner connected this covers the whole language.'));
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
      if (!r.conjugationExact) {
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

  PARLA.views = PARLA.views || {};
  PARLA.views.coach = viewCoach;
})();
