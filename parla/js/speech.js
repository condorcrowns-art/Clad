/* Parla — speech in and out
 *
 * Recognition is a native browser API, which is why this app can be free:
 * SpeechRecognition gives speech-to-text with no API key and no per-minute
 * cost. It needs Chrome/Edge/Safari and a secure context (https:// or
 * localhost — file:// will not get a microphone). Everything degrades to
 * typing if recognition is missing.
 *
 * Output has two engines, tried in this order:
 *   1. Piper — a neural voice running on this machine, served by serve.ps1
 *      at /tts. Same origin, so no CORS; free, offline, and it sounds like
 *      a person rather than a 2009 satnav.
 *   2. speechSynthesis — the browser's own voices. Always there, quality
 *      entirely at the mercy of what the operating system shipped.
 *
 * A saved voice is a plain browser voiceURI, or 'piper:<voice-id>'. If Piper
 * is installed and nothing is saved yet, Piper wins by default.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  var LANGS = {
    es: { code: 'es-ES', label: 'Spanish (Spain)', alt: ['es-MX', 'es-US', 'es-AR'] },
    fr: { code: 'fr-FR', label: 'French (France)', alt: ['fr-CA'] }
  };

  var PIPER_PREFIX = 'piper:';

  /* Declared up here, not down with the Piper code, because the browser voice
   * list can settle synchronously during the bootstrap below and the ready
   * gate reads this the moment it does. */
  var piper = { available: false, voices: [], settled: false };

  /* ── Browser voice inventory ────────────────────────────── */

  var voices = [];
  var voicesSettled = false;

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    var v = window.speechSynthesis.getVoices();
    if (v && v.length) {
      voices = v;
      settleVoices();
    }
  }

  function settleVoices() {
    if (voicesSettled) return;
    voicesSettled = true;
    maybeReady();
  }

  if ('speechSynthesis' in window) {
    refreshVoices();
    // Chrome populates the list asynchronously; this fires when it is ready.
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    // Safari sometimes never fires the event — poll briefly as a backstop,
    // then give up so a machine with no voices at all still settles.
    var tries = 0;
    var poll = setInterval(function () {
      refreshVoices();
      if (voicesSettled || ++tries > 20) { clearInterval(poll); settleVoices(); }
    }, 250);
  } else {
    voicesSettled = true;
  }

  /* Rank voices by how good they actually sound.
   *
   * This used to prefer localService voices for offline capability, which was
   * a mistake: on Windows the local Spanish voices are decade-old SAPI ones
   * (Helena, Sabina) that sound robotic, while Chrome ships genuinely good
   * network voices for free. Optimising for offline handed people the worst
   * voice on the machine. Quality wins; offline is the tiebreak.
   */
  function voiceScore(v) {
    var n = String(v.name || '');
    var s = 0;
    if (/^Google/i.test(n))            s += 100;  // Chrome's own, clearly the best free option
    if (/natural|neural/i.test(n))     s += 90;   // Windows 11 / Edge neural voices
    if (/premium|enhanced/i.test(n))   s += 60;   // macOS upgraded voices
    if (/online/i.test(n))             s += 40;
    if (/desktop/i.test(n))            s -= 40;   // legacy SAPI desktop entries
    if (v.localService && /^Microsoft/i.test(n)) s -= 30;  // old SAPI
    if (v.default)                     s += 5;
    return s;
  }

  /* A coarse label for the settings screen, so the choice is not a guess. */
  function voiceQuality(v) {
    var s = voiceScore(v);
    if (s >= 90) return 'best';
    if (s >= 40) return 'good';
    if (s < 0)   return 'basic';
    return 'ok';
  }

  /* Voices whose language matches the target, best-sounding first. */
  function voicesFor(lang) {
    var prefix = (LANGS[lang] || LANGS.es).code.slice(0, 2);
    return voices.filter(function (v) {
      return (v.lang || '').toLowerCase().indexOf(prefix) === 0;
    }).sort(function (a, b) {
      var d = voiceScore(b) - voiceScore(a);
      if (d) return d;
      // Same quality tier: prefer local, which is faster and needs no network.
      return (b.localService ? 1 : 0) - (a.localService ? 1 : 0);
    });
  }

  function pickVoice(lang, uri) {
    var list = voicesFor(lang);
    if (uri && uri.indexOf(PIPER_PREFIX) !== 0) {
      var exact = list.filter(function (v) { return v.voiceURI === uri; })[0] ||
                  voices.filter(function (v) { return v.voiceURI === uri; })[0];
      if (exact) return exact;
    }
    return list[0] || null;
  }

  /* ── Piper inventory ────────────────────────────────────── */

  function probePiper() {
    // A file:// page has no server to ask, and the test harness has no fetch.
    if (typeof fetch !== 'function' ||
        typeof location === 'undefined' ||
        !/^https?:$/.test(location.protocol)) {
      piper.settled = true;
      maybeReady();
      return;
    }

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      piper.settled = true;
      maybeReady();
    }
    // Never let a wedged server hold the settings screen hostage.
    setTimeout(finish, 4000);

    fetch('/tts/voices', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && j.available && j.voices && j.voices.length) {
          piper.available = true;
          piper.voices = j.voices;
        }
        finish();
      })
      .catch(finish);
  }

  var QUALITY_RANK = { high: 3, medium: 2, low: 1 };

  function piperVoicesFor(lang) {
    var want = (lang || 'es').slice(0, 2).toLowerCase();
    // Recognition listens in es-ES, so speaking in es-ES keeps both halves of
    // the conversation in one accent. A higher-quality voice in the wrong
    // region is a worse match, not a better one.
    var home = (LANGS[lang] || LANGS.es).code.replace('-', '_').toLowerCase();

    function homeness(v) { return String(v.locale || '').toLowerCase() === home ? 1 : 0; }

    return piper.voices.filter(function (v) {
      return String(v.lang || '').slice(0, 2).toLowerCase() === want;
    }).sort(function (a, b) {
      var d = homeness(b) - homeness(a);
      if (d) return d;
      return (QUALITY_RANK[b.quality] || 0) - (QUALITY_RANK[a.quality] || 0);
    });
  }

  function titleCase(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* One list for the settings screen: neural voices first, then whatever the
   * browser has. Each entry is { id, label, quality, engine }. */
  function allVoicesFor(lang) {
    var out = piperVoicesFor(lang).map(function (v) {
      return {
        id: PIPER_PREFIX + v.id,
        label: titleCase(v.name) + ' (' + String(v.locale || '').replace('_', '-') + ')',
        quality: 'neural',
        engine: 'piper'
      };
    });
    voicesFor(lang).forEach(function (v) {
      out.push({
        id: v.voiceURI,
        label: v.name + ' (' + v.lang + ')',
        quality: voiceQuality(v),
        engine: 'browser'
      });
    });
    return out;
  }

  /* ── Ready gate ─────────────────────────────────────────── */
  /* Fires once both inventories have settled, so the settings screen draws a
   * complete list rather than a browser-only one that grows a second later. */

  var readyWaiters = [];

  /* Enough to draw a useful list. A machine with Piper installed should not
   * stare at an empty dropdown for five seconds waiting on a browser voice
   * list that may turn out to be empty anyway. */
  function usable() { return piper.settled && (voicesSettled || piper.available); }

  /* Both inventories in. */
  function complete() { return piper.settled && voicesSettled; }

  function call(fn) {
    try { fn(voices); } catch (e) { /* a broken listener is not our problem */ }
  }

  function maybeReady() {
    if (!usable()) return;
    var pending = readyWaiters;
    if (complete()) readyWaiters = [];
    pending.forEach(call);
  }

  /* Called once as soon as there is something worth showing, and once more if
   * the other engine's voices turn up later - so listeners must be safe to run
   * twice. Both flags settle exactly once, so this can never fire more than
   * that, and the list is dropped afterwards rather than leaking per render. */
  function onVoicesReady(fn) {
    if (!complete()) readyWaiters.push(fn);
    if (usable()) call(fn);
  }

  probePiper();

  /* ── Text to speech ─────────────────────────────────────── */

  var speaking = false;
  var audioEl = null;
  // Bumped on every new utterance AND on every cancel, so a reply that arrives
  // late — or an 'ended' event fired by tearing down the audio element — can
  // tell it has been superseded and stay quiet.
  var token = 0;

  function resolveVoiceId(lang, uri) {
    if (uri) {
      if (uri.indexOf(PIPER_PREFIX) === 0) {
        if (!piper.available) return null;          // saved voice is gone; use the browser
        var id = uri.slice(PIPER_PREFIX.length);
        var hit = piper.voices.filter(function (v) { return v.id === id; })[0];
        return hit ? hit.id : (piperVoicesFor(lang)[0] || {}).id || null;
      }
      return null;                                   // an explicit browser voice
    }
    // Nothing saved: the neural voice is simply better, so take it.
    if (!piper.available) return null;
    return (piperVoicesFor(lang)[0] || {}).id || null;
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!text) {
      if (opts.onend) opts.onend();
      return function () {};
    }

    cancelSpeech();
    var mine = ++token;
    var lang = opts.lang || 'es';
    var piperId = resolveVoiceId(lang, opts.voiceURI);

    if (piperId) {
      speaking = true;
      speakPiper(text, opts, mine, piperId, function () {
        // Piper failed — the server may have stopped, or the voice file may
        // have gone. Say it with a browser voice rather than saying nothing.
        if (mine !== token) return;
        speakBrowser(text, opts, mine);
      });
    } else {
      speakBrowser(text, opts, mine);
    }

    return function () { cancelSpeech(); };
  }

  function speakPiper(text, opts, mine, voiceId, onFail) {
    fetch('/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voice: voiceId,
        lang: (opts.lang || 'es').slice(0, 2),
        rate: opts.rate != null ? opts.rate : 0.9
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('tts ' + r.status);
      return r.blob();
    }).then(function (blob) {
      if (mine !== token) return;                    // a newer utterance won

      var url = URL.createObjectURL(blob);
      var a = new Audio(url);
      audioEl = a;

      var settled = false;
      function finish(failed) {
        if (settled) return;
        settled = true;
        try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
        if (audioEl === a) { audioEl = null; speaking = false; }
        if (mine !== token) return;                  // cancelled: stay silent
        if (failed) { onFail(); return; }
        if (opts.onend) opts.onend();
      }

      a.onended = function () { finish(false); };
      a.onerror = function () { finish(true); };

      var p = a.play();
      // Autoplay policy can reject this. speechSynthesis is treated more
      // leniently by browsers, so falling back actually helps here.
      if (p && typeof p.catch === 'function') {
        p['catch'](function () { finish(true); });
      }
    })['catch'](function () {
      if (mine !== token) return;
      speaking = false;
      onFail();
    });
  }

  function speakBrowser(text, opts, mine) {
    if (!('speechSynthesis' in window)) {
      speaking = false;
      if (mine === token && opts.onend) opts.onend();
      return;
    }

    var u = new SpeechSynthesisUtterance(text);
    var lang = opts.lang || 'es';
    var v = pickVoice(lang, opts.voiceURI);
    if (v) u.voice = v;
    u.lang = v ? v.lang : (LANGS[lang] || LANGS.es).code;
    u.rate = opts.rate != null ? opts.rate : 0.9;
    u.pitch = opts.pitch != null ? opts.pitch : 1;

    speaking = true;
    function done() {
      speaking = false;
      if (mine === token && opts.onend) opts.onend();
    }
    u.onend = done;
    u.onerror = done;

    window.speechSynthesis.speak(u);
  }

  function cancelSpeech() {
    // Invalidate anything in flight before tearing things down, so the
    // 'ended' events that teardown provokes do not look like real endings and
    // reopen the microphone behind the user's back.
    token++;
    if (audioEl) {
      try { audioEl.pause(); audioEl.src = ''; } catch (e) { /* ignore */ }
      audioEl = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
    speaking = false;
  }

  /* ── Speech to text ─────────────────────────────────────── */
  /* listen() returns a handle with stop() and abort(). Callbacks:
   *   onstart, onpartial(text), onfinal(text, confidence), onerror(kind), onend
   */
  function listen(opts) {
    opts = opts || {};
    if (!SR) {
      if (opts.onerror) opts.onerror('unsupported');
      if (opts.onend) opts.onend();
      return { stop: function () {}, abort: function () {} };
    }

    // Never listen while the app is talking, or the mic hears our own voice.
    cancelSpeech();

    var rec = new SR();
    var lang = opts.lang || 'es';
    rec.lang = (LANGS[lang] || LANGS.es).code;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    var finalText = '';
    var confidence = 0;
    var done = false;

    rec.onstart = function () { if (opts.onstart) opts.onstart(); };

    rec.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var r = e.results[i];
        if (r.isFinal) {
          finalText += r[0].transcript;
          confidence = r[0].confidence || 0;
        } else {
          interim += r[0].transcript;
        }
      }
      if (opts.onpartial) opts.onpartial((finalText + ' ' + interim).trim());
    };

    rec.onerror = function (e) {
      // 'no-speech' and 'aborted' are normal outcomes, not failures worth shouting about.
      if (opts.onerror) opts.onerror(e.error || 'error');
    };

    rec.onend = function () {
      if (done) return;
      done = true;
      var t = finalText.trim();
      if (t && opts.onfinal) opts.onfinal(t, confidence);
      if (opts.onend) opts.onend();
    };

    try {
      rec.start();
    } catch (e) {
      if (opts.onerror) opts.onerror('start-failed');
      if (opts.onend) opts.onend();
    }

    return {
      stop: function () { try { rec.stop(); } catch (e) { /* ignore */ } },
      abort: function () { done = true; try { rec.abort(); } catch (e) { /* ignore */ } }
    };
  }

  PARLA.speech = {
    supported: !!SR,
    ttsSupported: 'speechSynthesis' in window,
    secure: window.isSecureContext !== false,
    langs: LANGS,
    speak: speak,
    cancel: cancelSpeech,
    listen: listen,
    voicesFor: voicesFor,
    voiceQuality: voiceQuality,
    pickVoice: pickVoice,
    onVoicesReady: onVoicesReady,
    isSpeaking: function () { return speaking; },

    // Neural voices
    piper: piper,
    piperPrefix: PIPER_PREFIX,
    piperVoicesFor: piperVoicesFor,
    allVoicesFor: allVoicesFor,
    // Exposed so the test harness can drive the probe without a network.
    _setPiper: function (available, list) {
      piper.available = !!available;
      piper.voices = list || [];
      piper.settled = true;
      maybeReady();
    }
  };
})();
