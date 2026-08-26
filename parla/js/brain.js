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
      '- ALWAYS hand the turn back: ask something, offer something, or react with an',
      '  opinion. Never reply with bare acknowledgement like "Muy bien." and stop.',
      '- React to what they ACTUALLY said. Do not run a script. If they surprise you,',
      '  go with it and stay in character.',
      '- Never explain grammar inside your spoken reply. Never write English there.',
      '- If they speak English, answer in Spanish anyway and pull them back gently.',
      '',
      'THEIR GOAL IN THIS SCENE: ' + ((sc.goals || []).join('; ') || 'just talk'),
      'Steer toward that goal without announcing it.',
      '',
      'CORRECTIONS',
      correctionRule,
      'Correct only their SPANISH. Never "correct" a fact, an opinion, or a choice.',
      'If their Spanish was fine, correction MUST be null. Do not invent errors.',
      '',
      'OUTPUT',
      'Return ONLY a JSON object. No prose, no markdown fence, no commentary.',
      '{"reply_es": string, "reply_en": string, "correction": null | {"original": string, "fixed": string, "note": string}}',
      '',
      'EXAMPLES OF THE SHAPE (not of this scene):',
      '{"reply_es":"¡Pues claro! ¿Y para beber algo?","reply_en":"Of course! And something to drink?","correction":null}',
      '{"reply_es":"Vale, marchando. ¿Algo más?","reply_en":"Okay, coming up. Anything else?",' +
        '"correction":{"original":"Yo quiero un cafe y soy cansado","fixed":"Quiero un café y estoy cansado",' +
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

    var sys = systemPrompt(ctx) + (extraSystem ? '\n\n' + extraSystem : '');
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
          temperature: 0.85,
          top_p: 0.9,
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
    // Set at boot by app.js so views can explain why the AI partner is not in use.
    health: { checked: false, ok: false, detail: '' },
    _scripted: scriptedReply,
    _parseLLM: parseLLM,
    _systemPrompt: systemPrompt
  };
})();
