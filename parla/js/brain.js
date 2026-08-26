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

  function scriptedReply(ctx) {
    var sc = ctx.scenario;
    var st = ctx.scriptState || (ctx.scriptState = { used: [], fb: 0 });
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
        // Multi-word keys match as a phrase; single words match whole tokens.
        if (key.indexOf(' ') !== -1) {
          if (said.indexOf(key) !== -1) score += 2;
        } else if (saidWords.indexOf(key) !== -1) {
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

  function systemPrompt(ctx) {
    var sc = ctx.scenario;
    var style = ctx.settings.correctionStyle;
    var lvl = (ctx.settings.level || 'a1').toUpperCase();

    var correctionRule =
      style === 'off'    ? 'Do NOT correct the learner. Always set "correction" to null.' :
      style === 'strict' ? 'Correct every grammatical error, including small ones.' :
                           'Correct only errors that would confuse a native speaker or that repeat. Let small slips go.';

    return [
      'You are a Spanish conversation partner in a language-learning app.',
      'ROLE: You are ' + sc.role + '.',
      'SETTING: ' + sc.setting,
      'The learner is at CEFR level ' + lvl + '. Match your Spanish to that level:',
      'short sentences, common vocabulary, and speak like a real person, not a textbook.',
      '',
      'RULES:',
      '1. Reply in Spanish, IN CHARACTER, in 1-2 sentences. Never break character.',
      '2. Always move the conversation forward — ask a question or react, never just acknowledge.',
      '3. ' + correctionRule,
      '4. Never lecture. Never write in English inside "reply_es".',
      '5. If the learner writes in English, respond in Spanish and gently steer them back.',
      '',
      'The learner is trying to: ' + (sc.goals || []).join('; ') + '.',
      '',
      'Respond with ONLY a JSON object, no markdown fence, in this exact shape:',
      '{"reply_es":"<your Spanish reply>",',
      ' "reply_en":"<literal English translation of your reply>",',
      ' "correction":null or {"original":"<what they said>","fixed":"<corrected Spanish>","note":"<one short English sentence explaining why>"}}'
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

    return {
      es: obj.reply_es || obj.es || '',
      en: obj.reply_en || obj.en || '',
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

  /* ── Ollama backend ─────────────────────────────────────── */

  function ollamaReply(ctx) {
    var s = ctx.settings;
    var url = (s.ollamaUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/api/chat';

    var messages = [{ role: 'system', content: systemPrompt(ctx) }];
    historyPairs(ctx.history).forEach(function (m) {
      messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
    });
    messages.push({ role: 'user', content: ctx.text });

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: s.ollamaModel || 'llama3.2',
        messages: messages,
        stream: false,
        format: 'json',
        options: { temperature: 0.8 }
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('Ollama returned ' + r.status);
      return r.json();
    }).then(function (data) {
      var content = data && data.message && data.message.content;
      var out = parseLLM(content, ctx.text);
      out.source = 'ollama';
      return out;
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
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
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
      var base = (settings.ollamaUrl || '').replace(/\/+$/, '');
      return fetch(base + '/api/tags')
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function (d) {
          var names = (d.models || []).map(function (m) { return m.name; });
          return {
            ok: true,
            detail: names.length
              ? 'Connected. Models: ' + names.slice(0, 6).join(', ')
              : 'Connected, but no models installed. Run: ollama pull llama3.2'
          };
        })
        .catch(function (e) {
          return {
            ok: false,
            detail: 'Could not reach Ollama (' + e.message + '). Is it running, and did you ' +
                    'start it with OLLAMA_ORIGINS="*" so the browser is allowed to call it?'
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
    normalise: normalise,
    words: words,
    correctOffline: correctOffline,
    _scripted: scriptedReply,
    _parseLLM: parseLLM
  };
})();
