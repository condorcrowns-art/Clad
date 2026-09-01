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

  function scriptedReply(ctx) {
    var sc = ctx.scenario;
    var st = ctx.scriptState || (ctx.scriptState = { used: [], fb: 0 });

    var cut = cutOffReply(ctx.text);
    if (cut) return cut;

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

    var fb = sc.fallback && sc.fallback.length
      ? sc.fallback[st.fb++ % sc.fallback.length]
      : { es: 'Sigue, te escucho.', en: 'Go on, I am listening.' };

    return {
      es: fb.es, en: fb.en,
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
      '- If they speak English, answer in Spanish anyway and pull them back gently.',
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
      ' "remember": string[], "correction": null | {"original": string, "fixed": string, "note": string}}',
      '"asked_to_repeat" is true when your reply is you asking them to supply or',
      'repeat something you did not get. Otherwise false.',
      '',
      'EXAMPLES OF THE SHAPE (not of this scene):',
      '{"reply_es":"!Pues claro! ?Y para beber algo?","reply_en":"Of course! And something to drink?",' +
        '"asked_to_repeat":false,"remember":[],"correction":null}',
      // The failure this rule exists for: an unfinished sentence must not be
      // silently accepted as a complete one.
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

    return {
      es: obj.reply_es || obj.es || '',
      en: obj.reply_en || obj.en || '',
      askedToRepeat: asked,
      remember: remember,
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

  /* ── Ollama backend ─────────────────────────────────────── */

  /* Installed models ranked by how well they actually hold a Spanish
   * conversation, best first. The app picks the best one you have rather than
   * making you know which to choose. */
  var MODEL_RANK = [
    /^qwen2\.5[:-].*(32b|14b)/i,
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
          num_ctx: 4096
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

  var BACKENDS = { scripted: scriptedReply, ollama: ollamaReply, gemini: geminiReply };

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
    bestModel: bestModel,
    normalise: normalise,
    words: words,
    correctOffline: correctOffline,
    suggest: suggest,
    _suggestPrompt: suggestPrompt,
    _parseSuggestions: parseSuggestions,
    _scriptedSuggestions: scriptedSuggestions,
    // Set at boot by app.js so views can explain why the AI partner is not in use.
    health: { checked: false, ok: false, detail: '' },
    _scripted: scriptedReply,
    _parseLLM: parseLLM,
    _systemPrompt: systemPrompt,
    _turnNotes: turnNotes,
    extractName: extractName
  };
})();
