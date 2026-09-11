/* Parla — the conversation brain
 *
 * One interface, three backends, all free:
 *
 *   scripted — keyword matching over the scenario's own beats. No AI, no
 *              network, no setup. Works instantly and forever.
 *   ollama   — a model running on your own machine. Unlimited, private,
 *              genuinely free. The best experience if you can run it.
 *   gemini   — Google's permanently free API tier. No credit card, but
 *              quota-limited and your text goes to Google.
 *
 * Every backend returns the same shape:
 *   { es, en, correction: { original, fixed, note } | null, source }
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  /* ── Text helpers ───────────────────────────────────────── */

  function normalise(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
      .replace(/[¿?¡!.,;:()"']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function words(s) {
    return normalise(s).split(' ').filter(Boolean);
  }

  /* ── Offline corrector ──────────────────────────────────────
   * Catches the mistakes English speakers actually make, without an LLM.
   * Each rule: [pattern, replacement, note]. Applied to the raw utterance.
   * Deliberately conservative — a false correction is worse than a miss.
   */
  var RULES = [
    [/\bsoy\s+(cansad[oa]|enferm[oa]|listo|lista|content[oa]|trist[e])\b/i,
      'estoy $1', 'Temporary states use estar, not ser.'],
    [/\bestoy\s+((?:de\s+)?(?:canadiense|americano|americana|ingl[ée]s|inglesa|espa[ñn]ol|espa[ñn]ola|mexicano|mexicana|franc[ée]s|francesa)\w*)/i,
      'soy $1', 'Nationality is permanent — use ser: soy canadiense.'],
    [/\b(soy|es)\s+(\d+)\s+a[ñn]os\b/i,
      'tengo $2 años', 'Age uses tener, not ser: tengo 25 años.'],
    [/\bestoy\s+(\d+)\s+a[ñn]os\b/i,
      'tengo $1 años', 'Age uses tener: tengo 25 años.'],
    [/\bsoy\s+de\s+acuerdo\b/i,
      'estoy de acuerdo', 'The fixed expression is estar de acuerdo.'],
    [/\btengo\s+calor(oso)?\b/i, 'tengo calor', ''],
    [/\bsoy\s+calor\b/i, 'tengo calor', 'Feeling hot uses tener: tengo calor.'],
    [/\bsoy\s+fr[íi]o\b/i, 'tengo frío', 'Feeling cold uses tener: tengo frío.'],
    [/\bsoy\s+hambre\b/i, 'tengo hambre', 'Hunger uses tener: tengo hambre.'],
    [/\bes\s+calor\b/i, 'hace calor', 'Weather uses hacer: hace calor.'],
    [/\bes\s+fr[íi]o\b/i, 'hace frío', 'Weather uses hacer: hace frío.'],
    [/\bbuenos\s+noches\b/i, 'buenas noches', 'Noche is feminine: buenas noches.'],
    [/\bbuenas\s+d[íi]as\b/i, 'buenos días', 'Día is masculine despite the -a: buenos días.'],
    [/\bbuenos\s+tardes\b/i, 'buenas tardes', 'Tarde is feminine: buenas tardes.'],
    [/\bmucho\s+gracias\b/i, 'muchas gracias', 'Gracias is feminine plural: muchas gracias.'],
    [/\bla\s+problema\b/i, 'el problema', 'Problema is masculine: el problema.'],
    [/\bel\s+gente\b/i, 'la gente', 'Gente is feminine: la gente.'],
    [/\bla\s+d[íi]a\b/i, 'el día', 'Día is masculine: el día.'],
    [/\byo\s+gusto\b/i, 'me gusta', 'Gustar works backwards: me gusta.'],
    [/\bt[úu]\s+gustas\b/i, 'te gusta', 'Gustar works backwards: te gusta.'],
    [/\bs[íi]\s+quiero\s+ir\s+pero\s+no\s+puedo\s+ir\b/i, 'sí quiero ir, pero no puedo', ''],
    [/\bpor\s+que\s+(no\s+)?(fui|vine|hice)\b/i, 'porque $2$3', 'One word (porque) for "because".'],
    [/\bs[eé]\s+llamo\b/i, 'me llamo', 'Introducing yourself: me llamo.'],
    [/\bque\s+hora\s+es\s+it\b/i, 'qué hora es', ''],
    [/\bestoy\s+(profesor|médico|ingeniero|estudiante|camarero)\b/i,
      'soy $1', 'Professions use ser: soy profesor.'],
    [/\ben\s+la\s+noche\s+pasada\b/i, 'anoche', 'More natural: anoche.'],
    [/\bmuy\s+mucho\b/i, 'muchísimo', 'Muy and mucho do not stack — use muchísimo.'],
    [/\bpara\s+mi\s+es\s+gusta\b/i, 'a mí me gusta', '']
  ];

  /* Words that betray a switch back to English. */
  var EN_HINTS = ['the', 'and', 'but', 'because', 'want', 'have', 'like', 'sorry',
    'please', 'thanks', 'yes', 'what', 'where', 'how', 'this', 'that', 'with',
    'from', 'my', 'your', 'is', 'are', 'was', 'were', 'can', 'could', 'would'];

  function correctOffline(text) {
    if (!text) return null;

    /* The grammar engine first. It knows the gender of eighteen thousand nouns
     * and the person of any verb form, so where it speaks it is not guessing —
     * and it can say which rule it applied, which is what turns a correction
     * into a lesson. The hand-written patterns below are what is left: fixed
     * expressions that no amount of agreement checking would catch. */
    if (PARLA.grammar && PARLA.grammar.ready()) {
      var g = PARLA.grammar.correct(text);
      if (g) return g;
    }

    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r[0].test(text)) {
        var fixed = text.replace(r[0], r[1]);
        if (normalise(fixed) !== normalise(text)) {
          return { original: text, fixed: fixed, note: r[2] || 'Small fix.' };
        }
      }
    }

    // Flag heavy English only when it dominates — a stray loanword is fine.
    var w = words(text);
    if (w.length >= 3) {
      var en = w.filter(function (x) { return EN_HINTS.indexOf(x) !== -1; }).length;
      if (en / w.length >= 0.4) {
        return {
          original: text, fixed: '',
          note: 'That was mostly English — try saying it in Spanish, even imperfectly.'
        };
      }
    }
    return null;
  }

  /* ── Scripted backend ───────────────────────────────────── */

  /* Sentences the recogniser clearly truncated. Matching a script beat against
   * "Me llamo" would answer a question the learner never finished asking, so
   * the scripted partner asks for the rest first - same rule the LLM follows. */
  var CUT_OFF = [
    { re: /\bme llamo$/i,        es: 'Perdona, no te he oido. ?Como te llamas?', en: "Sorry, I didn't catch that. What's your name?" },
    { re: /\bse llama$/i,        es: '?Como se llama?',                          en: 'What is their name?' },
    { re: /\bquiero(?: un| una)?$/i, es: '?Que quieres exactamente?',            en: 'What exactly would you like?' },
    { re: /\bnecesito(?: un| una)?$/i, es: '?Que necesitas?',                    en: 'What do you need?' },
    { re: /\bvoy a$/i,           es: '?Adonde vas?',                             en: 'Where are you going?' },
    { re: /\b(soy|estoy)$/i,     es: 'Perdona, ?como dices?',                    en: 'Sorry, what was that?' },
    { re: /\b(un|una|el|la|los|las|de|con|para|por|mi|tu|y|o|que|muy|mas)$/i,
      es: 'Perdona, no te he oido bien. ?Me lo repites?',                         en: "Sorry, I didn't hear you properly. Could you say that again?" }
  ];

  function cutOffReply(text) {
    var t = String(text || '').trim().replace(/[.,!?\u00bf\u00a1]+$/, '');
    if (!t || t.split(/\s+/).length > 8) return null;   // a long sentence is not a fragment
    for (var i = 0; i < CUT_OFF.length; i++) {
      if (CUT_OFF[i].re.test(t)) {
        return {
          es: CUT_OFF[i].es, en: CUT_OFF[i].en,
          askedToRepeat: true,
          correction: null,          // never correct what you did not hear
          source: 'scripted'
        };
      }
    }
    return null;
  }

  /* Something to say when the script has nothing left. Each one asks a
   * question, because a reply that does not is a reply the learner cannot
   * answer, and the point of the screen is that they keep talking.
   *
   * There used to be one of these per scenario. In a ten-turn conversation
   * with a four-beat script that meant the same sentence six times, which is
   * worse than saying nothing. */
  var KEEP_GOING = [
    { es: 'Ya veo. ¿Y eso por qué?', en: 'I see. And why is that?' },
    { es: 'Cuéntame un poco más.', en: 'Tell me a bit more.' },
    { es: '¿En serio? ¿Desde cuándo?', en: 'Really? Since when?' },
    { es: 'Qué bien. ¿Y te gusta?', en: 'Nice. And do you like it?' },
    { es: 'Ah, ¿sí? ¿Y qué tal?', en: 'Oh, yeah? And how is it?' },
    { es: 'Vale. ¿Y qué vas a hacer?', en: 'Right. And what are you going to do?' },
    { es: 'Interesante. ¿Y antes?', en: 'Interesting. And before that?' },
    { es: 'Claro. ¿Y con quién?', en: 'Of course. And with whom?' },
    { es: 'Entiendo. ¿Y dónde exactamente?', en: 'I understand. And where exactly?' },
    { es: 'Ajá. ¿Y eso es normal para ti?', en: 'Uh-huh. And is that normal for you?' },
    { es: 'Oye, ¿y cuánto tiempo llevas así?', en: 'Hey, and how long have you been like that?' },
    { es: 'Vaya. ¿Y qué piensas hacer?', en: 'Wow. And what do you plan to do?' }
  ];

  /* A greeting on its own. Answering it is not the same as answering the
   * question the scene opened with, and it must not consume a script beat:
   * "hola" used to match the beat keyed on "llamo/soy/hola", so the learner's
   * actual name, one turn later, was met with "what is your name?" — the exact
   * thing that makes a partner feel like a machine. */
  var GREETING_ONLY = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que tal|qué tal|hola que tal|holaa+)[\s!.,¡]*$/i;

  var GREET_BACK = [
    { es: '¡Hola! ', en: 'Hi! ' },
    { es: '¡Buenas! ', en: 'Hello! ' },
    { es: '¡Hola, qué tal! ', en: 'Hi, how are you! ' }
  ];

  /* The question at the end of a line, so greeting someone back does not mean
   * reciting the whole opening speech at them a second time. */
  function lastQuestion(line) {
    var parts = String(line || '').split(/(?<=[.!?])\s+/).filter(Boolean);
    for (var i = parts.length - 1; i >= 0; i--) {
      if (/\?/.test(parts[i])) return parts[i];
    }
    return parts[parts.length - 1] || String(line || '');
  }

  /* Something they actually said, handed back. Not comprehension — but
   * repeating a real word from their sentence is the difference between a
   * partner who is listening and a recording. */
  function echoWord(text) {
    if (!PARLA.dict || !PARLA.dict.ready() || !PARLA.morph) return null;
    var ws = words(text).filter(function (w) { return w.length >= 4; });
    for (var i = ws.length - 1; i >= 0; i--) {
      var a = PARLA.morph.analyse(ws[i]);
      if (!a.length) continue;
      var top = a[0];
      // A noun the learner chose is the thing they were talking about; a
      // function word is not worth repeating back at them.
      if (top.pos !== 'n' || !top.entry || !top.entry.band || top.entry.band > 6000) continue;
      var art = top.entry.gender === 'f' ? 'la ' : (top.entry.gender === 'm' ? 'el ' : '');
      return { word: art + top.lemma, lemma: top.lemma };
    }
    return null;
  }

  /* English words common enough that finding them in the Spanish dictionary
   * means the dictionary is wrong about which language you are in. "mean" is
   * the ellos-form of "mear", which is correct Spanish and produced, for "what
   * does trabajas mean", a definition of the word for urinating. The
   * morphology was right; it was asked the wrong question. */
  var EN_COMMON = {};
  ('the a an and or but if so then than that this these those there here it its ' +
   'i you he she we they me him her us them my your his our their mine yours ' +
   'is are was were be been being am do does did done doing have has had having ' +
   'will would shall should can could may might must ' +
   'what how why when where who whom which whose ' +
   'mean means meant say says said tell told ask asked answer word words ' +
   'call called name named translate translation pronounce pronounced spell ' +
   'use used using work works worked working think thought know knew help ' +
   'make made get got go goes went come came see saw look looked find found ' +
   'give gave take took put let want wanted need needed like liked love ' +
   'about because but for with from into onto over under again also just only ' +
   'very really quite too much many more most less least some any all none ' +
   'not no yes okay ok please sorry thanks thank hello hi hey bye ' +
   'in on at to of by up down out off between during before after ' +
   'time day week month year today tomorrow yesterday now later ' +
   'good bad big small new old long short right wrong sure fine ' +
   'one two three four five six seven eight nine ten ' +
   'thing things people person man woman boy girl ' +
   'sentence phrase question language spanish english grammar verb noun'
  ).split(' ').forEach(function (w) { EN_COMMON[w] = 1; });

  /* The Spanish inside an English question, looked up. Quoted first, since
   * that is what someone asking about a word actually types. */
  function askedAbout(text) {
    if (!PARLA.dict || !PARLA.dict.ready() || !PARLA.morph) return null;
    var raw = String(text || '');
    var quoted = raw.match(/["'“”«»]([^"'“”«»]{1,40})["'“”«»]/);
    var cands = [];
    // Split the raw text, not the normalised one: normalise strips accents,
    // and answering "«donde» — where" for a learner who wrote "dónde" hands
    // them back a misspelling of the word they asked about.
    var raws = raw.split(/[^A-Za-zÀ-ÿñÑ'’-]+/).filter(Boolean);
    if (quoted) {
      cands.push(quoted[1].trim());
      // A quoted phrase: also its own words, longest first, since "de dónde"
      // is two words and only one of them carries the meaning.
      quoted[1].trim().split(/\s+/).filter(function (w) { return w.length >= 3; })
        .sort(function (a, b) { return b.length - a.length; })
        .forEach(function (w) { cands.push(w); });
    }
    // Then whatever is not plainly English, last first — the thing being asked
    // about is usually at the end of the question.
    raws.filter(function (w) { return w.length >= 3 && !EN_COMMON[normalise(w)]; })
      .reverse().forEach(function (w) { cands.push(w); });

    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var a = PARLA.morph.analyse(c);
      if (!a.length) continue;
      var top = a[0];
      var gloss = (top.entry && top.entry.glosses && top.entry.glosses[0]) || top.en;
      if (!gloss) continue;
      // A word out of the long tail is more likely a bad match than the word
      // they meant, unless they quoted it.
      if (!quoted && top.entry && (!top.entry.band || top.entry.band > 8000)) continue;
      return '“' + c + '” — ' + gloss +
        (top.lemma && normalise(top.lemma) !== normalise(c)
          ? ' (from ' + top.lemma + (top.why ? ', ' + top.why : '') + ')'
          : '');
    }
    return null;
  }

  function scriptedReply(ctx) {
    var sc = ctx.scenario;
    var st = ctx.scriptState || (ctx.scriptState = { used: [], fb: 0 });

    var cut = cutOffReply(ctx.text);
    if (cut) return cut;

    // A bare greeting: greet back and put the scene's own question again,
    // without spending a beat on it.
    if (GREETING_ONLY.test(String(ctx.text || '').trim())) {
      var g = GREET_BACK[(st.fb++) % GREET_BACK.length];
      var askAgain = sc.opener || { es: '¿Y tú qué tal?', en: 'And how about you?' };
      return {
        es: g.es + lastQuestion(askAgain.es),
        en: g.en + lastQuestion(askAgain.en),
        correction: null,
        source: 'scripted'
      };
    }

    // English, with no model to translate it. Answering as though it were
    // Spanish would be a lie; the honest move is to hand them the phrases this
    // scene actually needs and let them try again.
    if (detectLanguage(ctx.text) === 'en') {
      var phrase = (sc.phrases || [])[0];
      // "What does 'de dónde' mean?" is a question this app can answer without
      // a model — it ships thirty-one thousand words and a morphology engine.
      // Sending them away with "in Spanish please" while holding the answer is
      // the kind of thing that makes a tool feel obstinate.
      var asked = askedAbout(ctx.text);
      return {
        es: 'Perdona, en español si puedes. ' + (phrase ? 'Prueba: "' + phrase + '".' : ''),
        en: 'Sorry, in Spanish if you can. ' + (phrase ? 'Try: "' + phrase + '".' : ''),
        note: asked || null,
        askedToRepeat: true,
        sayThis: phrase ? { es: phrase, en: '' } : null,
        correction: null,
        source: 'scripted'
      };
    }

    var script = sc.script || [];
    var said = normalise(ctx.text);
    var saidWords = words(ctx.text);

    var best = null, bestScore = 0, bestIdx = -1;

    for (var i = 0; i < script.length; i++) {
      if (st.used.indexOf(i) !== -1) continue;
      var beat = script[i];
      var keys = beat.match || [];

      if (!keys.length) {
        // An open beat (free conversation) matches anything, but only once
        // every keyword beat has been exhausted or skipped.
        if (bestScore === 0 && best === null) { best = beat; bestIdx = i; }
        continue;
      }

      var score = 0;
      for (var k = 0; k < keys.length; k++) {
        var key = normalise(keys[k]);
        if (!key) continue;
        // Multi-word keys match as a phrase; single words match whole tokens,
        // or on a shared stem so conjugations and plurals still land
        // (quiero/quería/querría, cafe/cafes, tomar/tomamos).
        if (key.indexOf(' ') !== -1) {
          if (said.indexOf(key) !== -1) score += 3;
        } else if (saidWords.indexOf(key) !== -1) {
          score += 2;
        } else if (key.length >= 5 && saidWords.some(function (w) {
          return w.length >= 4 && (w.indexOf(key.slice(0, 4)) === 0 || key.indexOf(w.slice(0, 4)) === 0);
        })) {
          score += 1;
        }
      }
      if (score > bestScore) { bestScore = score; best = beat; bestIdx = i; }
    }

    if (best && bestIdx !== -1) {
      st.used.push(bestIdx);
      return {
        es: best.say.es, en: best.say.en,
        correction: correctOffline(ctx.text),
        source: 'scripted'
      };
    }

    // The scenario's own lines first, then the shared pool — and never the
    // same one twice running, which is what made the old single fallback
    // unbearable.
    var pool = (sc.fallback || []).concat(KEEP_GOING);
    var fb = null;
    for (var f = 0; f < pool.length; f++) {
      var cand = pool[(st.fb + f) % pool.length];
      if (cand.es !== st.lastFb) { fb = cand; st.fb = (st.fb + f + 1) % pool.length; break; }
    }
    if (!fb) fb = pool[0] || { es: 'Sigue, te escucho.', en: 'Go on, I am listening.' };
    st.lastFb = fb.es;

    // If they said something with a real noun in it, open with that noun. It
    // is not comprehension, but it is the difference between a partner who was
    // listening and one reading from a card.
    var echo = echoWord(ctx.text);
    return {
      es: (echo ? '¿' + echo.word.charAt(0).toUpperCase() + echo.word.slice(1) + '? ' : '') + fb.es,
      en: (echo ? echo.lemma + '? ' : '') + fb.en,
      correction: correctOffline(ctx.text),
      source: 'scripted'
    };
  }

  /* ── Shared LLM prompt ──────────────────────────────────── */

  /* Per-turn facts the model cannot work out for itself: how much to trust the
   * transcript, and what it has already said too often. Kept separate from the
   * system prompt so the stable part of the prompt stays cacheable. */
  function turnNotes(ctx) {
    var notes = [];

    var t = (ctx.text || '').trim();

    // A trailing function word is the signature of a sentence the recogniser
    // cut off mid-thought - "Me llamo", "Quiero un", "Voy a".
    var DANGLING = /\b(me llamo|se llama|quiero|quiero un|quiero una|necesito|voy a|tengo|soy|estoy|hay|es|un|una|el|la|los|las|de|con|para|por|mi|tu|y|o|que|muy|mas)$/i;
    var lowConfidence = ctx.confidence > 0 && ctx.confidence < 0.6;

    if (detectLanguage(t) === 'en') {
      notes.push('THEY ANSWERED IN ENGLISH. Stay in character, reply in Spanish, and ' +
                 'put the Spanish they were reaching for in "say_this" so they can read ' +
                 'it out loud. Do not comment on the fact that they used English.');
    }

    if (DANGLING.test(t.replace(/[.,!?¿¡]+$/, ''))) {
      notes.push('WARNING: their sentence ends on a word that needs something after it. ' +
                 'It was almost certainly cut off. Do NOT guess the missing part - ask for it.');
    } else if (lowConfidence) {
      notes.push('WARNING: the speech recogniser was unsure of this transcript. If it does ' +
                 'not make sense in context, assume you misheard and ask, rather than ' +
                 'answering something they did not say.');
    }

    // When the recogniser was unsure, its runner-up guesses are often the right
    // one - and the model has the context to tell which sentence makes sense.
    if (lowConfidence && ctx.alternatives && ctx.alternatives.length > 1) {
      notes.push('The recogniser also considered: "' +
                 ctx.alternatives.slice(1, 3).join('", "') +
                 '". If one of those fits the conversation better, answer that instead.');
    }

    // Small models re-ask the same question for several turns running.
    var mine = (ctx.history || []).filter(function (m) { return m.role === 'partner'; })
                                  .slice(-3).map(function (m) { return m.text; });
    if (mine.length) {
      notes.push('You have already said these. Do not repeat them or ask the same thing ' +
                 'again:\n- ' + mine.join('\n- '));
    }

    // Conversation is the best drill there is, so point it at the words this
    // person keeps forgetting instead of whatever the model felt like saying.
    var targets = (ctx.targetWords || []).slice(0, 6).filter(Boolean);
    if (targets.length) {
      notes.push('They are currently weak on these words. Work one or two in where it ' +
                 'fits naturally - never all of them, and never in a list: ' +
                 targets.join(', '));
    }

    // Their own recurring errors, so a repeat offence gets caught rather than
    // waved through as "close enough".
    var watch = (ctx.pastMistakes || []).slice(0, 4).filter(Boolean);
    if (watch.length) {
      notes.push('They have made these mistakes before. If one happens again, correct it ' +
                 'even if you would normally let it go:\n- ' + watch.join('\n- '));
    }

    return notes.length ? '\n\nTHIS TURN\n' + notes.join('\n') : '';
  }

  /* ── Which language did they just speak? ──────────────────
   *
   * A learner who falls back to English has not failed, they have hit a wall
   * and told you exactly where it is. That is the single most useful moment in
   * a lesson, and it was being thrown away: the old rule was "answer in
   * Spanish anyway and pull them back gently", which leaves them still not
   * knowing how to say the thing they wanted to say.
   *
   * Counting function words is crude, but function words are what a learner
   * cannot avoid using, and it needs no model - so the offline partner catches
   * it too.
   */
  var EN_WORDS = /\b(the|and|is|are|was|were|am|be|been|i|you|he|she|it|we|they|to|of|in|on|at|for|with|from|what|how|why|when|where|who|do|does|did|can|could|would|should|will|my|your|his|her|our|their|this|that|these|those|there|here|not|dont|cant|want|wanted|need|needed|like|liked|have|has|had|about|because|but|if|so|just|really|very|please|sorry|thanks|thank|yes|no|okay|ok)\b/g;

  var ES_WORDS = /\b(el|la|los|las|un|una|unos|unas|de|del|al|que|y|o|es|son|soy|eres|somos|estoy|esta|estas|estan|estamos|no|si|por|para|con|sin|me|te|se|nos|le|les|mi|tu|su|sus|mis|tus|como|donde|cuando|cuanto|quien|quiero|quieres|quiere|necesito|tengo|tiene|hay|muy|mas|menos|pero|porque|tambien|gracias|hola|adios|bien|mal|aqui|alli|ahora|hoy|manana|ayer|puedo|puede|voy|vas|va|hacer|ser|estar|senor|senora|favor|vale|pues|claro)\b/g;

  function countMatches(text, re) {
    re.lastIndex = 0;
    var n = 0;
    while (re.exec(text) !== null) n++;
    return n;
  }

  /* 'en', 'es', or '' when it is too short or too mixed to call. */
  function detectLanguage(text) {
    // A learner asking about Spanish quotes Spanish: "what does 'de dónde'
    // mean?" is an English question, and counting the quoted part made it
    // Spanish — so the partner answered in Spanish and the grammar checker
    // told them to put a ¿ in front of "What".
    var outside = String(text || '').replace(/["'“”«»]([^"'“”«»]{1,40})["'“”«»]/g, ' ');
    var t = normalise(outside);
    if (!t) return '';
    var en = countMatches(t, EN_WORDS);
    var es = countMatches(t, ES_WORDS);

    // Spanish-only letters settle it — unless the English evidence is strong,
    // which is exactly the quoting case above.
    if (/[ñáéíóúü¿¡]/i.test(outside) && !(en >= 2 && en > es)) return 'es';

    if (en >= 2 && en > es) return 'en';
    if (es >= 2 && es > en) return 'es';

    // Very short utterances: one unmistakable marker is enough either way.
    var words = t.split(/\s+/).filter(Boolean);
    if (words.length <= 4) {
      if (en >= 1 && es === 0) return 'en';
      if (es >= 1 && en === 0) return 'es';
    }
    return '';
  }

  /* Pull a name out of the learner's own words. The model is asked to do this
   * too, but a name is the one fact worth having even when there is no model
   * running, or when the model returns something unparseable. */
  var NAME_PATTERNS = [
    /\bme llamo\s+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ'-]{1,20})/i,
    /\bmi nombre es\s+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ'-]{1,20})/i,
    /\b[Ss]oy\s+([A-ZÀ-Ý][a-zA-ZÀ-ÿ'-]{1,20})\b/  // the NAME must be capitalised: "soy alto" is not one
  ];
  // Words that follow "soy" far more often than any name does.
  var NOT_NAMES = /^(de|un|una|el|la|muy|mas|bien|mal|alto|bajo|joven|viejo|nuevo|americano|americana|ingles|inglesa|estudiante|profesor|profesora|feliz|triste|cansado|cansada)$/i;

  function extractName(text) {
    var t = String(text || '').trim();
    for (var i = 0; i < NAME_PATTERNS.length; i++) {
      var m = t.match(NAME_PATTERNS[i]);
      if (m && m[1] && !NOT_NAMES.test(m[1])) {
        return m[1].charAt(0).toUpperCase() + m[1].slice(1);
      }
    }
    return '';
  }

  /* What the partner already knows about this person, from earlier sessions.
   * Kept short on purpose: a wall of remembered trivia crowds out the rules
   * above it, and small models start ignoring the lot. */
  function knownBlock(ctx) {
    var mem = ctx.memory || {};
    var lines = [];
    if (mem.name) lines.push('Their name is ' + mem.name + '.');
    (mem.facts || []).slice(0, 8).forEach(function (f) {
      var t = typeof f === 'string' ? f : (f && f.text);
      if (t && lines.indexOf(t) === -1) lines.push(t);
    });
    if (!lines.length) return '';
    return '\nYOU ALREADY KNOW THIS ABOUT THEM, from talking before:\n- ' +
           lines.join('\n- ') +
           '\nUse it. Greet them by name if you have one. Do not ask for any of it again.';
  }

  function systemPrompt(ctx) {
    var sc = ctx.scenario;
    var style = ctx.settings.correctionStyle;
    var lvl = (ctx.settings.level || 'a1').toUpperCase();

    var correctionRule =
      style === 'off'    ? 'Do NOT correct the learner. Always set "correction" to null.' :
      style === 'strict' ? 'Correct every grammatical error, including small ones.' :
                           'Correct only errors that would confuse a native speaker or that repeat. Let small slips go.';

    var register = /usted|formal|receptionist|clerk|doctor|manager|agent|dispatcher|employee/i
      .test(sc.role) ? 'Use "usted" — this is a formal situation.'
                     : 'Use "tú" — this is an informal situation.';

    return [
      'You role-play ONE character in a Spanish conversation. You are not an assistant,',
      'not a tutor, and not a chatbot. You are a person with your own goals and mood.',
      '',
      'YOU ARE: ' + sc.role,
      'WHERE: ' + sc.setting,
      'REGISTER: ' + register,
      '',
      'HOW TO SPEAK',
      '- 1-2 sentences. Never more. Real people do not monologue.',
      '- Sound like spoken Spanish, not written Spanish. Use "pues", "vale", "oye",',
      '  "mira", "bueno", "es que", contractions, and half-sentences where natural.',
      '- Stay at CEFR ' + lvl + ': common words, simple clauses. Do not show off.',
      '- Hand the turn back: ask something, offer something, or react with an',
      '  opinion. Never reply with bare acknowledgement like "Muy bien." and stop.',
      '- Never explain grammar inside your spoken reply. Never write English there.',
      '',
      'WHEN THEY ANSWER IN ENGLISH',
      'They have not failed - they have shown you the exact sentence they cannot',
      'say yet. That is the most useful thing that happens in a lesson.',
      '- Stay in character and keep replying in Spanish.',
      '- Never scold them. Never switch to English yourself. Never break the',
      '  scene to teach - the lesson goes in "say_this", not in your reply.',
      '- Put the Spanish they were reaching for in "say_this": what THEY were',
      '  trying to say, at their level, ready to read out loud. Not your reply.',
      '- Then answer as though they had said it, so the scene keeps moving.',
      '- If they only threw in one English word, give them the whole sentence',
      '  in Spanish anyway - the word alone is no use without the sentence.',
      '',
      'UNDERSTAND BEFORE YOU ANSWER  --  this is the most important rule.',
      'Their words reach you through speech recognition, so sentences arrive cut',
      'off, mis-heard, or half-finished. You are a person, not a form-filler.',
      '- NEVER invent, assume, or fill in information they did not actually give.',
      '  If they say "Me llamo" and stop, you do NOT know their name. You did not',
      '  hear it. Ask for it, the way a person would.',
      '- If a sentence is incomplete, contradicts what they said before, or you',
      '  genuinely cannot tell what they meant: say so IN CHARACTER and ask.',
      '  A waiter says "Perdona, no te he oido bien, que querias?" - not',
      '  "I did not understand your input."',
      '- Ask about the specific missing piece, not in general. Missing name ->',
      '  "?Como te llamas?". Missing dish -> "?Cual quieres?". Never a blank',
      '  "?Que?" when you can name what you are missing.',
      '- Do not correct grammar in a sentence you did not understand. Ask first.',
      '- When it IS clear, do not stall for confirmation. Only ask when something',
      '  is actually missing or ambiguous. Asking about everything is as bad as',
      '  assuming everything.',
      '',
      'REMEMBER WHAT THEY TOLD YOU',
      'Everything they have already said is true and yours to use: their name,',
      'their order, what they like, where they are from. Use it naturally. Never',
      'ask twice for something they already told you, and never contradict it.',
      knownBlock(ctx),
      '',
      'If they tell you something worth remembering for next time - their name,',
      'where they live, their job, what they like or hate - put it in "remember"',
      'as a short English sentence: ["Their name is Ana", "They hate coffee"].',
      'Only things THEY said. Leave it empty otherwise. Never guess.',
      '',
      'THEIR GOAL IN THIS SCENE: ' + ((sc.goals || []).join('; ') || 'just talk'),
      'Steer toward that goal without announcing it.',
      '',
      'CORRECTIONS',
      correctionRule,
      'Correct only their SPANISH. Never "correct" a fact, an opinion, or a choice.',
      'If their Spanish was fine, correction MUST be null. Do not invent errors.',
      'If you had to ask them to repeat, correction MUST be null.',
      '',
      'OUTPUT',
      'Return ONLY a JSON object. No prose, no markdown fence, no commentary.',
      '{"reply_es": string, "reply_en": string, "asked_to_repeat": boolean,',
      ' "remember": string[], "say_this": null | {"es": string, "en": string},',
      ' "correction": null | {"original": string, "fixed": string, "note": string}}',
      '"say_this" is ONLY for when they spoke English: the Spanish they wanted.',
      'Leave it null every other turn.',
      '"asked_to_repeat" is true when your reply is you asking them to supply or',
      'repeat something you did not get. Otherwise false.',
      '',
      'EXAMPLES OF THE SHAPE (not of this scene):',
      '{"reply_es":"!Pues claro! ?Y para beber algo?","reply_en":"Of course! And something to drink?",' +
        '"asked_to_repeat":false,"remember":[],"correction":null}',
      // The failure this rule exists for: an unfinished sentence must not be
      // silently accepted as a complete one.
      'They answered in English - "I would like a coffee please":',
      '{"reply_es":"Marchando. ?Solo o con leche?","reply_en":"Coming up. Black or with milk?",' +
        '"asked_to_repeat":false,"remember":[],' +
        '"say_this":{"es":"Quer\u00eda un caf\u00e9, por favor.","en":"I would like a coffee, please."},' +
        '"correction":null}',
      'They said "Me llamo" and nothing more:',
      '{"reply_es":"Perdona, no te he oido. ?Como te llamas?","reply_en":"Sorry, I didn\'t catch that. What\'s your name?",' +
        '"asked_to_repeat":true,"remember":[],"correction":null}',
      'They said "Quiero un" and nothing more:',
      '{"reply_es":"?Un que? Tenemos cafe, te y zumo.","reply_en":"A what? We have coffee, tea and juice.",' +
        '"asked_to_repeat":true,"remember":[],"correction":null}',
      'They made a real mistake but were clear:',
      '{"reply_es":"Vale, marchando. ?Algo mas?","reply_en":"Okay, coming up. Anything else?",' +
        '"asked_to_repeat":false,"remember":[],' +
        '"correction":{"original":"Yo quiero un cafe y soy cansado","fixed":"Quiero un cafe y estoy cansado",' +
        '"note":"Tiredness is a temporary state, so it takes estar, not ser."}}'
    ].join('\n');
  }

  function parseLLM(raw, original) {
    var text = (raw || '').trim();
    // Models sometimes wrap JSON in a code fence despite instructions.
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    // Or prepend prose — grab the outermost object.
    if (text[0] !== '{') {
      var s = text.indexOf('{'), e = text.lastIndexOf('}');
      if (s !== -1 && e > s) text = text.slice(s, e + 1);
    }

    var obj;
    try {
      obj = JSON.parse(text);
    } catch (err) {
      // Unparseable: still better to say the raw text than to fail the turn.
      return { es: (raw || '').trim().slice(0, 300), en: '', correction: null, source: 'llm-raw' };
    }

    var corr = obj.correction;
    if (corr && (!corr.fixed || normalise(corr.fixed) === normalise(original || ''))) corr = null;

    /* A small model will sometimes "fix" Spanish that was already right, which
     * is the most damaging thing a language app can do. The rules engine gets
     * a veto: if the sentence it proposes has more errors in it than the one
     * the learner wrote, the correction is dropped. */
    if (corr && corr.fixed && PARLA.grammar && PARLA.grammar.ready()) {
      if (PARLA.grammar.agrees(original || corr.original || '', corr.fixed) === false) corr = null;
    }
    /* And where the rules *do* have something to say, they say it better: an
     * exact rule with a named reason beats a paraphrase. */
    if (PARLA.grammar && PARLA.grammar.ready() && original) {
      var sure = PARLA.grammar.correct(original);
      if (sure) corr = sure;
    }

    // Asking someone to repeat themselves and correcting the fragment you did
    // not hear are contradictory. If the model does both, the question wins.
    var asked = obj.asked_to_repeat === true;
    if (asked) corr = null;

    // Only keep facts that look like facts. A model asked for an array will
    // sometimes hand back a sentence, an object, or its own reply again.
    var remember = [];
    if (Array.isArray(obj.remember)) {
      remember = obj.remember
        .map(function (f) { return typeof f === 'string' ? f.trim() : ''; })
        .filter(function (f) { return f && f.length <= 120; })
        .slice(0, 4);
    }

    var sayThis = null;
    if (obj.say_this && typeof obj.say_this === 'object' && obj.say_this.es) {
      sayThis = { es: String(obj.say_this.es).trim(), en: String(obj.say_this.en || '').trim() };
    }

    return {
      es: obj.reply_es || obj.es || '',
      en: obj.reply_en || obj.en || '',
      askedToRepeat: asked,
      remember: remember,
      sayThis: sayThis,
      correction: corr ? {
        original: corr.original || original || '',
        fixed: corr.fixed || '',
        note: corr.note || ''
      } : null,
      source: 'llm'
    };
  }

  function historyPairs(history) {
    // Trim to the last 12 turns — plenty of context, small payload.
    return (history || []).slice(-12);
  }

  /* ── "I don't know what to say" ───────────────────────────
   *
   * The moment a beginner gives up is the moment they are standing there with
   * nothing to say and the mic waiting. Three things they could actually say
   * right now, at their level, is the difference between carrying on and
   * closing the tab.
   *
   * Falls back to the scenario's own script lines, so it works with no model
   * and no network - the same rule the rest of the app follows.
   */
  function suggestPrompt(ctx) {
    var sc = ctx.scenario;
    var lvl = (ctx.settings.level || 'a1').toUpperCase();
    var last = (ctx.history || []).filter(function (m) { return m.role === 'partner'; }).slice(-1)[0];

    return [
      'A learner is in the middle of a Spanish conversation and is stuck.',
      'You are their coach, not their partner.',
      '',
      'THE SCENE: ' + sc.setting,
      'THEY ARE TALKING TO: ' + sc.role,
      last ? 'THE LAST THING SAID TO THEM: ' + last.text : 'The conversation has just started.',
      'THEIR GOAL: ' + ((sc.goals || []).join('; ') || 'keep the conversation going'),
      '',
      'Give THREE things they could say next. Rules:',
      '- Spanish a CEFR ' + lvl + ' learner could actually pronounce. Short.',
      '- Three DIFFERENT directions - not three wordings of one idea.',
      '- Each must genuinely answer or advance what was just said to them.',
      '- No greetings unless the conversation has only just started.',
      '',
      'Return ONLY JSON: {"options":[{"es":string,"en":string},...]}'
    ].join('\n');
  }

  function parseSuggestions(raw) {
    var text = (raw || '').trim();
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    if (text[0] !== '{') {
      var a = text.indexOf('{'), b = text.lastIndexOf('}');
      if (a !== -1 && b > a) text = text.slice(a, b + 1);
    }
    try {
      var obj = JSON.parse(text);
      var opts = (obj.options || obj.suggestions || []).filter(function (o) {
        return o && typeof o.es === 'string' && o.es.trim();
      }).slice(0, 3).map(function (o) {
        return { es: String(o.es).trim(), en: String(o.en || '').trim() };
      });
      return opts;
    } catch (e) {
      return [];
    }
  }

  /* Without a model: the scenario's own phrasebook, minus anything already
   * said. Not tailored to the exact moment the way a model's are, but always
   * correct Spanish, always on-topic, and instant. */
  function scriptedSuggestions(ctx) {
    var sc = ctx.scenario || {};
    var said = (ctx.history || []).filter(function (m) { return m.role === 'user'; })
                                  .map(function (m) { return normalise(m.text); });

    var out = [];
    (sc.phrases || []).forEach(function (phrase) {
      var text = String(phrase || '').trim();
      if (!text) return;
      var key = normalise(text);
      // Skip anything they have already used - suggesting it back is noise.
      if (said.some(function (u) { return u.indexOf(key) !== -1; })) return;
      if (out.some(function (o) { return normalise(o.es) === key; })) return;
      out.push({ es: text, en: '' });
    });

    // Everything used already: fall back to the goals, which are always
    // something they still have to do.
    if (!out.length) {
      (sc.goals || []).slice(0, 3).forEach(function (g) {
        out.push({ es: '', en: g, goal: true });
      });
    }
    return out.slice(0, 3);
  }

  function suggest(ctx) {
    var s = ctx.settings || {};
    var offline = function () {
      return { options: scriptedSuggestions(ctx), source: 'scripted' };
    };

    if (s.brain === 'hosted') {
      return askHosted(suggestPrompt(ctx), 'What could I say?', 260)
        .then(function (obj) {
          var opts = parseSuggestions(JSON.stringify(obj));
          return opts.length ? { options: opts, source: 'hosted' } : offline();
        })
        .catch(offline);
    }

    if (s.brain === 'ollama') {
      var model = s.ollamaModel;
      var ready = model ? Promise.resolve(model)
                        : detectOllama(s).then(function (d) { return d.best; });
      return ready.then(function (m) {
        if (!m) throw new Error('no model');
        var url = (s.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/api/chat';
        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: m, stream: false, format: 'json', keep_alive: '30m',
            messages: [{ role: 'system', content: suggestPrompt(ctx) },
                       { role: 'user', content: 'What could I say?' }],
            options: { temperature: 0.6, num_predict: 200, num_ctx: 4096 }
          })
        }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            var opts = parseSuggestions(d && d.message && d.message.content);
            return opts.length ? { options: opts, source: 'ollama' } : offline();
          });
      }).catch(offline);
    }

    return Promise.resolve(offline());
  }

  /* ── Look up any word you just heard ──────────────────────
   *
   * A fixed word list is always the wrong list: it contains words you already
   * know and lacks the one your partner just used. Every Spanish word in the
   * conversation is a candidate, so tapping one has to work for ANY word -
   * which means falling through from the corpus, to the conjugation engine,
   * to the model, in that order. The first two are instant and free.
   */
  function lookupLocal(word, lang) {
    var target = normalise(word);
    if (!target) return null;
    var data = PARLA.data && PARLA.data[lang || 'es'];
    if (!data) return null;

    var vocab = data.vocab || [];
    var i;

    // The word itself, with or without its article.
    for (i = 0; i < vocab.length; i++) {
      var key = normalise(vocab[i][0]);
      if (key === target) return { en: vocab[i][1], lemma: vocab[i][0], source: 'corpus' };
      if (key.replace(/^(el|la|los|las|un|una) /, '') === target) {
        return { en: vocab[i][1], lemma: vocab[i][0], source: 'corpus' };
      }
    }

    // The dictionary and the morphology engine: thirty-one thousand words and
    // every form of every one of them. Asked before the fifty-verb reverse
    // index because it says more - "gerund, with se and lo on the end" rather
    // than "Gerund of pedir".
    var m = morphLookup(word);
    if (m) return m;

    // A conjugated verb: the trainer already knows every form it generates, so
    // it can name the infinitive without anyone having to type a table out.
    var verbs = data.verbs;
    if (verbs && verbs.identify) {
      var hit = verbs.identify(word);
      if (hit) {
        var row = vocab.filter(function (v) { return normalise(v[0]) === normalise(hit.verb); })[0];
        return {
          en: row ? row[1] : '',
          lemma: hit.verb,
          note: hit.person + ' ' + hit.tense + ' of "' + hit.verb + '"',
          source: 'verbs'
        };
      }
    }

    return null;
  }

  /* One reading of a surface form, in the shape the rest of the app expects. */
  function morphLookup(word) {
    if (!PARLA.morph || !PARLA.morph.ready()) return null;
    var a = PARLA.morph.analyse(word);
    if (!a.length) return null;
    var top = a[0];
    if (!top.en) return null;
    return {
      en: top.en,
      lemma: top.lemma,
      note: top.why || '',
      pos: top.pos,
      gender: top.entry ? top.entry.gender : null,
      register: top.entry ? top.entry.register : null,
      region: top.entry ? top.entry.region : null,
      band: top.entry ? top.entry.band : 0,
      analyses: a,
      source: 'dict'
    };
  }

  function translate(ctx) {
    var word = String(ctx.word || '').trim();
    if (!word) return Promise.resolve(null);

    var local = lookupLocal(word, ctx.lang || 'es');
    var s = ctx.settings || {};

    // The corpus answer is exact and instant, but it cannot tell you which
    // sense was meant. With a model available, ask it too - it has the
    // sentence in front of it.
    if (s.brain === 'hosted') {
      return askHosted(dictSystem(), 'WORD: ' + word + '\nSENTENCE: ' + (ctx.sentence || word))
        .then(function (obj) {
          if (!obj || !obj.en) return local;
          return { en: String(obj.en).trim().slice(0, 60),
                   lemma: String(obj.lemma || word).trim().slice(0, 60),
                   note: String(obj.note || '').trim().slice(0, 80), source: 'hosted' };
        })
        .catch(function () { return local; });
    }
    if (s.brain !== 'ollama') return Promise.resolve(local);

    var model = s.ollamaModel;
    var ready = model ? Promise.resolve(model)
                      : detectOllama(s).then(function (d) { return d.best; });

    return ready.then(function (m) {
      if (!m) throw new Error('no model');
      var url = (s.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/api/chat';
      var sys = [
        'You are a Spanish dictionary for an English-speaking learner.',
        'Given a word and the sentence it appeared in, return JSON only:',
        '{"en": string, "lemma": string, "note": string}',
        '- "en": the meaning IN THIS SENTENCE, 1-4 words, no article.',
        '- "lemma": the dictionary form. A verb becomes the infinitive; a noun',
        '  gets its article ("la cuenta"); an adjective goes masculine singular.',
        '- "note": at most 8 words, and ONLY if the form is worth naming',
        '  ("third person preterite of tener"). Otherwise "".',
        'No explanation, no markdown, no extra keys.'
      ].join('\n');

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m, stream: false, format: 'json', keep_alive: '30m',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: 'WORD: ' + word + '\nSENTENCE: ' + (ctx.sentence || word) }
          ],
          options: { temperature: 0.1, num_predict: 120, num_ctx: 2048 }
        })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          var raw = d && d.message && d.message.content;
          var text = String(raw || '').trim();
          var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fence) text = fence[1].trim();
          if (text[0] !== '{') {
            var a = text.indexOf('{'), b = text.lastIndexOf('}');
            if (a !== -1 && b > a) text = text.slice(a, b + 1);
          }
          var obj = JSON.parse(text);
          if (!obj || !obj.en) return local;
          return {
            en: String(obj.en).trim().slice(0, 60),
            lemma: String(obj.lemma || word).trim().slice(0, 60),
            note: String(obj.note || '').trim().slice(0, 80),
            source: 'ollama'
          };
        })
        .catch(function () { return local; });
    }).catch(function () { return local; });
  }

  /* ── Ask it anything ──────────────────────────────────────
   *
   * The corpus is 521 words. The model knows the language. Capping a lookup at
   * a list somebody typed by hand was the wrong instinct: whatever word you
   * throw at this, it should come back with the meaning, the dictionary form,
   * the gender, the conjugation if it is a verb, how the sentence is built
   * around it, and the mistake an English speaker makes with it.
   *
   * The corpus and the conjugation engine still answer first where they can,
   * because they are instant, free and never wrong. The model fills in
   * everything they cannot reach - which is most of the language.
   */
  function explainPrompt(ctx) {
    var lvl = (ctx.settings && ctx.settings.level || 'a1').toUpperCase();
    return [
      'You are a Spanish teacher answering a single question from an',
      'English-speaking learner at CEFR ' + lvl + '. Be exact and be brief.',
      '',
      'They will give you a word, a phrase or a whole sentence, in Spanish or',
      'in English. Work out which, and explain the SPANISH.',
      '',
      'Return ONLY this JSON:',
      '{',
      '  "term": string,        // the Spanish, spelled correctly and accented',
      '  "en": string,          // what it means, plainly. 1-8 words.',
      '  "lemma": string,       // dictionary form: infinitive / noun with its',
      '                         // article / adjective masculine singular',
      '  "pos": string,         // "noun" | "verb" | "adjective" | "adverb" |',
      '                         // "phrase" | "preposition" | "other"',
      '  "gender": string,      // "m" | "f" | "" - nouns only',
      '  "note": string,        // the form, if worth naming. "" if not.',
      '  "structure": string,   // how a sentence is built around it, in ONE',
      '                         // sentence. What it takes after it, which verb',
      '                         // it needs, where it sits. "" if nothing to say.',
      '  "pitfall": string,     // the mistake English speakers make with this',
      '                         // exact word. "" if there is not an obvious one.',
      '  "examples": [ {"es": string, "en": string} ]   // exactly 2, at their level',
      '}',
      '',
      'If they wrote English, "term" is the Spanish for it and you explain that.',
      'If they wrote a sentence with a mistake, "term" is the CORRECTED sentence',
      'and "pitfall" says what was wrong.',
      'Never invent a word. If it is not Spanish and has no Spanish equivalent,',
      'set "en" to "" and say so in "note".',
      'No markdown, no prose outside the JSON.'
    ].join('\n');
  }

  function parseExplain(raw) {
    var text = String(raw || '').trim();
    var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    if (text[0] !== '{') {
      var a = text.indexOf('{'), b = text.lastIndexOf('}');
      if (a !== -1 && b > a) text = text.slice(a, b + 1);
    }
    var o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || (!o.term && !o.en)) return null;

    var str = function (v, cap) { return String(v == null ? '' : v).trim().slice(0, cap || 200); };
    var examples = Array.isArray(o.examples) ? o.examples : [];

    return {
      term: str(o.term, 120),
      en: str(o.en, 120),
      lemma: str(o.lemma, 80) || str(o.term, 80),
      pos: str(o.pos, 24).toLowerCase(),
      gender: /^[mf]$/.test(str(o.gender, 2)) ? str(o.gender, 2) : '',
      note: str(o.note, 140),
      structure: str(o.structure, 260),
      pitfall: str(o.pitfall, 260),
      examples: examples.filter(function (e) { return e && e.es; })
                        .slice(0, 3)
                        .map(function (e) { return { es: str(e.es, 160), en: str(e.en, 160) }; }),
      source: 'ollama'
    };
  }

  /* Everything the app can work out with no model at all. Always computed, so
   * it can be merged over a model answer - the conjugation table in particular
   * is generated from rules and is more reliable than a 8B model reciting one. */
  function explainLocal(query, lang) {
    var word = String(query || '').trim();
    if (!word) return null;

    var local = lookupLocal(word, lang || 'es');
    var data = PARLA.data && PARLA.data[lang || 'es'];
    var out = {
      term: word,
      en: local ? local.en : '',
      lemma: local ? local.lemma : word,
      pos: '', gender: '', note: local ? (local.note || '') : '',
      structure: '', pitfall: '', examples: [], conjugation: null,
      source: local ? local.source : 'none'
    };

    // Article and part of speech straight out of the corpus row.
    if (data && data.vocab) {
      var row = data.vocab.filter(function (v) {
        return normalise(v[0]) === normalise(out.lemma) || normalise(v[0]) === normalise(word);
      })[0];
      if (row) {
        out.pos = row[2].indexOf('noun') === 0 ? 'noun' : row[2];
        out.gender = row[2] === 'noun-f' ? 'f' : (row[2] === 'noun-m' ? 'm' : '');
        if (row[3]) out.examples = [{ es: row[3], en: row[4] }];
      }
    }

    /* The dictionary. Thirty-one thousand headwords with gender, register and
     * where a word is said - and, through the morphology engine, every form of
     * every one of them. All of it offline, none of it a guess. */
    if (PARLA.morph && PARLA.morph.ready()) {
      var readings = PARLA.morph.analyse(word);
      if (readings.length) {
        var top = readings[0];
        var e = top.entry;
        // Only rename the headword if nothing better already named it. The
        // curated list calls it "la cuenta"; the dictionary calls it "cuenta";
        // and letting the dictionary win would offer a second card for a word
        // the deck already has.
        if (out.source === 'none') out.lemma = top.lemma || out.lemma;
        out.en = out.en || top.en || '';
        out.source = out.source === 'none' ? 'dict' : out.source;
        out.readings = readings;
        if (top.why) out.note = out.note || top.why;
        if (e) {
          out.pos = out.pos || POS_NAME[e.pos] || e.pos;
          out.gender = out.gender || e.gender || '';
          out.senses = e.glosses;
          out.register = e.register;
          out.region = e.region;
          out.band = e.band;
          if (e.band) {
            out.rarity = e.band <= 500 ? 'One of the 500 commonest words in Spanish.'
              : e.band <= 1000 ? 'In the commonest 1,000 words.'
              : e.band <= 3000 ? 'In the commonest 3,000 words.'
              : e.band <= 10000 ? 'Not rare, but not everyday either.'
              : 'An uncommon word.';
          }
        }
        // If the word was a conjugated form, the table belongs to its verb.
        if (top.pos === 'v' && top.lemma) out.verbLemma = top.lemma;
      }
    }

    // The conjugation engine works from rules, so it handles ANY infinitive -
    // the fifty in the drill list are only the drill's pool, not its limit.
    var verbs = data && data.verbs;
    if (verbs && verbs.conjugate) {
      var inf = out.verbLemma || (/(ar|er|ir|ír)$/i.test(out.lemma) ? out.lemma : null);
      if (inf) {
        var table = {};
        Object.keys(verbs.tenses).forEach(function (t) {
          var forms = verbs.conjugate(inf, t);
          if (forms) table[t] = forms;
        });
        if (Object.keys(table).length) {
          out.conjugation = table;
          out.conjugationOf = inf;
          out.pos = out.pos || 'verb';
          out.participle = verbs.participle(inf);
          out.gerund = verbs.gerund(inf);
          out.irregularNote = verbs.irregularNote ? verbs.irregularNote(inf) : null;
          // The rules now cover stem changes, spelling changes and the
          // compounds of the irregular verbs, so "exact" means something
          // stronger than it used to: the engine knows *why* this verb bends.
          out.conjugationExact = !!verbs.isIrregular(inf) ||
            !!(PARLA.dict && PARLA.dict.ready() && PARLA.dict.isVerb(inf)) ||
            !!(data.vocab || []).filter(function (v) { return v[0] === inf; })[0];
        }
      }
    }
    return out;
  }

  var POS_NAME = {
    n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun',
    prep: 'preposition', conj: 'conjunction', interj: 'interjection',
    num: 'number', phrase: 'phrase', prop: 'proper noun', abbr: 'abbreviation'
  };

  function explain(ctx) {
    var query = String(ctx.query || '').trim();
    if (!query) return Promise.resolve(null);

    var lang = ctx.lang || 'es';
    var local = explainLocal(query, lang);
    var s = ctx.settings || {};

    function merge(model) {
      if (!model) {
        if (local) local.partial = true;
        return local;
      }
      // The model is the dictionary; the engine is the conjugator. Take each
      // where it is strongest, and recompute the table for whatever lemma the
      // model settled on rather than the raw word that was typed.
      var lemmaLocal = explainLocal(model.lemma || model.term, lang);
      model.conjugation = (lemmaLocal && lemmaLocal.conjugation) || null;
      model.conjugationExact = lemmaLocal ? lemmaLocal.conjugationExact : false;
      if (!model.examples.length && local && local.examples.length) {
        model.examples = local.examples;
      }
      return model;
    }

    if (s.brain === 'hosted') {
      return askHosted(explainPrompt(ctx),
                       'QUESTION: ' + query + (ctx.sentence ? '\nIT APPEARED IN: ' + ctx.sentence : ''),
                       500)
        .then(function (obj) { return merge(parseExplain(JSON.stringify(obj))); })
        .catch(function () { return merge(null); });
    }
    if (s.brain !== 'ollama') return Promise.resolve(merge(null));

    var model = s.ollamaModel;
    var ready = model ? Promise.resolve(model)
                      : detectOllama(s).then(function (d) { return d.best; });

    return ready.then(function (m) {
      if (!m) throw new Error('no model');
      var url = (s.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/api/chat';
      var user = 'QUESTION: ' + query +
                 (ctx.sentence ? '\nIT APPEARED IN: ' + ctx.sentence : '');

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m, stream: false, format: 'json', keep_alive: '30m',
          messages: [{ role: 'system', content: explainPrompt(ctx) },
                     { role: 'user', content: user }],
          options: { temperature: 0.2, num_predict: 500, num_ctx: 4096 }
        })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return merge(parseExplain(d && d.message && d.message.content)); })
        .catch(function () { return merge(null); });
    }).catch(function () { return merge(null); });
  }

  /* ── Ollama backend ─────────────────────────────────────── */

  /* Installed models ranked by how well they actually hold a Spanish
   * conversation, best first. The app picks the best one you have rather than
   * making you know which to choose. */
  /* Ranked by how well they actually hold a Spanish conversation, best first -
   * which is not the same as how they score on English benchmarks.
   *
   * Models trained explicitly for multilingual use sit above general models of
   * the same size: aya-expanse is Cohere's multilingual line, and mistral-nemo
   * was trained with Spanish as a first-class language rather than as English
   * with extras. Both hold register and idiom noticeably better than a general
   * 7B, which is what this app is asking them to do all day.
   */
  var MODEL_RANK = [
    /^aya-expanse[:-].*32b/i,
    /^qwen2\.5[:-].*(32b|14b)/i,
    /^mistral-nemo/i,
    /^aya-expanse/i,
    /^gemma2[:-].*27b/i,
    /^qwen3[:-]/i,
    /^qwen2\.5[:-].*7b/i,
    /^qwen2\.5(:latest)?$/i,
    /^llama3\.1[:-].*8b/i,
    /^gemma2[:-].*9b/i,
    /^mistral[:-]/i,
    /^llama3\.1/i,
    /^qwen2\.5[:-].*3b/i,
    /^gemma2/i,
    /^llama3\.2/i,
    /^phi3/i
  ];

  function bestModel(names) {
    for (var i = 0; i < MODEL_RANK.length; i++) {
      for (var j = 0; j < names.length; j++) {
        if (MODEL_RANK[i].test(names[j])) return names[j];
      }
    }
    return names[0] || '';
  }

  /* Ask Ollama what it has. Resolves {ok, models, best} or {ok:false, detail}. */
  function detectOllama(settings) {
    var base = (settings.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '');
    // no-store matters: the browser will happily serve a stale model list, so a
    // model you just pulled (or an Ollama you just started) would not show up.
    return fetch(base + '/api/tags', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var names = (d.models || []).map(function (m) { return m.name; });
        return { ok: true, models: names, best: bestModel(names) };
      })
      .catch(function (e) {
        // A browser CORS block and a dead server both surface as a TypeError
        // here, so name both possibilities rather than guessing wrong.
        return { ok: false, models: [], best: '', detail: e.message || String(e) };
      });
  }

  function ollamaCall(ctx, model, extraSystem) {
    var s = ctx.settings;
    var url = (s.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/api/chat';

    var sys = systemPrompt(ctx) + turnNotes(ctx) + (extraSystem ? '\n\n' + extraSystem : '');
    var messages = [{ role: 'system', content: sys }];
    historyPairs(ctx.history).forEach(function (m) {
      messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
    });
    messages.push({ role: 'user', content: ctx.text });

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: false,
        format: 'json',
        // Keep the model resident so the second turn is not another cold start.
        keep_alive: '30m',
        options: {
          // 0.85 made small models embellish - inventing names, orders and
          // details the learner never gave. Comprehension matters more here
          // than flair, and the character comes from the prompt, not the heat.
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
          repeat_penalty: 1.15,   // small models loop on stock phrases without this
          num_predict: 220,
          // The prompt carries what it remembers about you, your weak words,
          // your past mistakes and a dozen turns of history. 4096 was starting
          // to push the oldest turns out of the window mid-conversation.
          num_ctx: 8192
        }
      })
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('Ollama returned ' + r.status + (t ? ': ' + t.slice(0, 160) : ''));
        });
      }
      return r.json();
    }).then(function (data) {
      return data && data.message && data.message.content;
    });
  }

  function ollamaReply(ctx) {
    var s = ctx.settings;
    var model = s.ollamaModel;

    var ready = model
      ? Promise.resolve(model)
      : detectOllama(s).then(function (d) {
          if (!d.ok) throw new Error(d.detail || 'Ollama unreachable');
          if (!d.best) throw new Error('Ollama is running but has no models. Run: ollama pull qwen2.5:7b');
          s.ollamaModel = d.best;          // remember what we picked
          return d.best;
        });

    return ready.then(function (m) {
      return ollamaCall(ctx, m).then(function (content) {
        var out = parseLLM(content, ctx.text);
        if (out.source !== 'llm-raw' && out.es) { out.source = 'ollama'; out.model = m; return out; }

        // The model ignored the JSON contract. Give it exactly one blunter try
        // before falling back — small models often comply on the retry.
        return ollamaCall(ctx, m,
          'YOUR LAST REPLY WAS REJECTED. Output raw JSON only. Start with { and end with }. ' +
          'No prose before or after. Keys: reply_es, reply_en, correction.'
        ).then(function (retry) {
          var out2 = parseLLM(retry, ctx.text);
          out2.source = 'ollama';
          out2.model = m;
          return out2;
        });
      });
    });
  }

  /* ── Hosted backend (Cloudflare Workers AI) ───────────────
   *
   * The one that works on a phone. A page on https cannot reach Ollama on a PC
   * at http://localhost, so on the hosted site there was no AI partner at all.
   * This calls a Pages Function on the same origin, which runs a model on
   * Cloudflare's own edge - no key, no PC, nothing to install, and the request
   * never leaves the site you are already on.
   */
  /* The small JSON asks - dictionary lookup, suggestions, the Ask screen - all
   * have the same shape: a system prompt, one user message, JSON back. */
  function askHosted(system, user, maxTokens) {
    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.2, max_tokens: maxTokens || 400
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      var text = String((d && d.reply) || '').trim();
      var fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) text = fence[1].trim();
      if (text[0] !== '{') {
        var a = text.indexOf('{'), b = text.lastIndexOf('}');
        if (a !== -1 && b > a) text = text.slice(a, b + 1);
      }
      return JSON.parse(text);
    });
  }

  function dictSystem() {
    return [
      'You are a Spanish dictionary for an English-speaking learner.',
      'Given a word and the sentence it appeared in, return JSON only:',
      '{"en": string, "lemma": string, "note": string}',
      '- "en": the meaning IN THIS SENTENCE, 1-4 words, no article.',
      '- "lemma": the dictionary form.',
      '- "note": at most 8 words naming the form, or "".',
      'No explanation, no markdown, no extra keys.'
    ].join('\n');
  }

  function hostedAvailable() {
    return fetch('/api/chat', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        return d && d.available
          ? { ok: true, models: d.models || [] }
          : { ok: false, detail: 'This site has no Workers AI binding yet. See DEPLOY.md.' };
      })
      .catch(function (e) {
        return { ok: false, detail: 'No /api/chat on this origin (' + (e.message || e) + ')' };
      });
  }

  function hostedCall(ctx, extraSystem) {
    var sys = systemPrompt(ctx) + turnNotes(ctx) + (extraSystem ? '\n\n' + extraSystem : '');
    var messages = [{ role: 'system', content: sys }];
    historyPairs(ctx.history).forEach(function (m) {
      messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
    });
    messages.push({ role: 'user', content: ctx.text });

    return fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, temperature: 0.7, max_tokens: 320 })
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.detail || d.error || ('HTTP ' + r.status));
        return d.reply || '';
      });
    });
  }

  function hostedReply(ctx) {
    return hostedCall(ctx).then(function (content) {
      var out = parseLLM(content, ctx.text);
      if (out.source !== 'llm-raw' && out.es) { out.source = 'hosted'; return out; }
      // Edge models are smaller than a desktop one and drop the JSON contract
      // more often, so the blunter retry matters more here, not less.
      return hostedCall(ctx,
        'YOUR LAST REPLY WAS REJECTED. Output raw JSON only. Start with { and end with }. ' +
        'No prose before or after.'
      ).then(function (retry) {
        var out2 = parseLLM(retry, ctx.text);
        out2.source = 'hosted';
        return out2;
      });
    });
  }

  /* ── Gemini backend ─────────────────────────────────────── */

  function geminiReply(ctx) {
    var s = ctx.settings;
    if (!s.geminiKey) return Promise.reject(new Error('No Gemini API key set.'));

    var model = s.geminiModel || 'gemini-2.5-flash-lite';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent';

    var contents = [];
    historyPairs(ctx.history).forEach(function (m) {
      contents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      });
    });
    contents.push({ role: 'user', parts: [{ text: ctx.text }] });

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': s.geminiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(ctx) + turnNotes(ctx) }] },
        contents: contents,
        generationConfig: {
          temperature: 0.8,
          responseMimeType: 'application/json'
        }
      })
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error('Gemini returned ' + r.status + ': ' + t.slice(0, 200));
        });
      }
      return r.json();
    }).then(function (data) {
      var cand = data && data.candidates && data.candidates[0];
      var text = cand && cand.content && cand.content.parts &&
                 cand.content.parts.map(function (p) { return p.text || ''; }).join('');
      var out = parseLLM(text, ctx.text);
      out.source = 'gemini';
      return out;
    });
  }

  /* ── Dispatcher ─────────────────────────────────────────── */

  var BACKENDS = { scripted: scriptedReply, ollama: ollamaReply,
                   gemini: geminiReply, hosted: hostedReply };

  /* Always resolves. If an AI backend fails (Ollama not running, quota spent,
   * no network) the scripted engine picks up the turn so practice never stops. */
  function reply(ctx) {
    var name = (ctx.settings && ctx.settings.brain) || 'scripted';
    var fn = BACKENDS[name] || scriptedReply;

    if (fn === scriptedReply) {
      return Promise.resolve(scriptedReply(ctx));
    }

    // Boot-time probe already found the backend dead — go straight to scripted
    // rather than making every single turn wait on a failing request.
    if (PARLA.brain.health.checked && !PARLA.brain.health.ok) {
      var quick = scriptedReply(ctx);
      quick.degraded = true;
      quick.error = PARLA.brain.health.detail;
      return Promise.resolve(quick);
    }

    return Promise.resolve()
      .then(function () { return fn(ctx); })
      .then(function (out) {
        if (!out || !out.es) throw new Error('Empty reply from ' + name);
        return out;
      })
      .catch(function (err) {
        var out = scriptedReply(ctx);
        out.degraded = true;
        out.error = err && err.message ? err.message : String(err);
        return out;
      });
  }

  /* Connection check used by the settings screen. */
  function testBackend(settings) {
    if (settings.brain === 'ollama') {
      return detectOllama(settings).then(function (d) {
        if (!d.ok) {
          return {
            ok: false,
            detail: 'Could not reach Ollama (' + d.detail + '). Two usual causes: it is not ' +
                    'running (start it), or it is running but refusing the browser because ' +
                    'OLLAMA_ORIGINS is not set to *.'
          };
        }
        if (!d.models.length) {
          return { ok: false, detail: 'Ollama is running but has no models. Run: ollama pull qwen2.5:7b' };
        }
        return {
          ok: true,
          detail: 'Connected. Using ' + (settings.ollamaModel || d.best) +
                  '. Installed: ' + d.models.slice(0, 6).join(', ')
        };
      });
    }

    if (settings.brain === 'hosted') {
      return hostedAvailable().then(function (d) {
        if (!d.ok) return { ok: false, detail: d.detail };
        return { ok: true, detail: 'Connected to this site\'s own AI. Nothing to install.' };
      });
    }

    if (settings.brain === 'gemini') {
      if (!settings.geminiKey) return Promise.resolve({ ok: false, detail: 'No API key entered.' });
      return reply({
        scenario: { role: 'a tester', setting: 'a test', goals: [] },
        history: [], text: 'Hola', settings: settings, scriptState: { used: [], fb: 0 }
      }).then(function (out) {
        return out.degraded
          ? { ok: false, detail: out.error || 'Request failed.' }
          : { ok: true, detail: 'Connected. Test reply: ' + out.es };
      });
    }

    return Promise.resolve({ ok: true, detail: 'Scripted mode needs no setup — it always works.' });
  }

  PARLA.brain = {
    reply: reply,
    testBackend: testBackend,
    detectOllama: detectOllama,
    hostedAvailable: hostedAvailable,
    morphLookup: morphLookup,
    bestModel: bestModel,
    normalise: normalise,
    words: words,
    correctOffline: correctOffline,
    suggest: suggest,
    translate: translate,
    explain: explain,
    _explainLocal: explainLocal,
    _parseExplain: parseExplain,
    _explainPrompt: explainPrompt,
    lookupLocal: lookupLocal,
    _suggestPrompt: suggestPrompt,
    _parseSuggestions: parseSuggestions,
    _scriptedSuggestions: scriptedSuggestions,
    // Set at boot by app.js so views can explain why the AI partner is not in use.
    health: { checked: false, ok: false, detail: '' },
    _scripted: scriptedReply,
    _parseLLM: parseLLM,
    _systemPrompt: systemPrompt,
    _turnNotes: turnNotes,
    extractName: extractName,
    detectLanguage: detectLanguage
  };
})();
