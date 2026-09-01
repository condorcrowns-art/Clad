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
  /* listen() returns a handle with stop(), abort() and text(). Callbacks:
   *   onstart, onpartial(text), onfinal(text, confidence), onerror(kind), onend
   *
   * This used to run with continuous = false, which ends recognition at the
   * FIRST pause. A learner saying "Me llamo..." and pausing to remember their
   * own name had "Me llamo" submitted as a finished sentence before they could
   * say it — and then had to argue with a partner who cheerfully carried on.
   * That is not a slow speaker's fault; it is the wrong endpoint.
   *
   * So: recognition runs continuously, and WE decide when the turn is over,
   * after a real silence. Chrome also ends recognition on its own every few
   * seconds regardless of the flag, so a spontaneous end is restarted
   * underneath and the transcript is stitched across the seam.
   */
  function listen(opts) {
    opts = opts || {};
    if (!SR) {
      if (opts.onerror) opts.onerror('unsupported');
      if (opts.onend) opts.onend();
      return { stop: function () {}, abort: function () {}, text: function () { return ''; } };
    }

    // How long a gap means "I have finished my sentence" rather than "I am
    // thinking". Beginners pause mid-sentence constantly, so this is generous
    // and adjustable in settings.
    var silenceMs  = opts.silenceMs  != null ? opts.silenceMs  : 1600;
    // Give up if they never say anything at all.
    var noSpeechMs = opts.noSpeechMs != null ? opts.noSpeechMs : 10000;
    // A hard ceiling so a stuck recogniser cannot listen forever.
    var maxMs      = opts.maxMs      != null ? opts.maxMs      : 60000;

    // Never listen while the app is talking, or the mic hears our own voice.
    cancelSpeech();

    var lang = opts.lang || 'es';
    var rec = newRecogniser(lang);

    var committed = '';      // finals from earlier recognition sessions
    var sessionFinal = '';   // finals from the current one
    var interim = '';
    var scores = [];
    var heard = false;

    var settled = false;     // callbacks already delivered
    var closing = false;     // we asked it to stop; do not restart
    var killed = false;      // aborted; deliver nothing
    var started = false;     // onstart already reported
    var restarts = 0;

    var silenceTimer = null;
    var hardTimer = null;

    function fullText() {
      return (committed + sessionFinal + ' ' + interim).replace(/\s+/g, ' ').trim();
    }

    function confidence() {
      if (!scores.length) return 0;
      var sum = 0;
      for (var i = 0; i < scores.length; i++) sum += scores[i];
      return sum / scores.length;
    }

    function clearTimers() {
      if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
      if (hardTimer) { clearTimeout(hardTimer); hardTimer = null; }
    }

    function settle() {
      if (settled) return;
      settled = true;
      clearTimers();
      if (killed) return;
      var t = fullText();
      if (t && opts.onfinal) opts.onfinal(t, confidence());
      if (opts.onend) opts.onend();
    }

    function endNow() {
      closing = true;
      clearTimers();
      try { rec.stop(); } catch (e) { settle(); }
      // If the engine never delivers its end event, do not hang the UI.
      setTimeout(settle, 1200);
    }

    function armSilence() {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(endNow, heard ? silenceMs : noSpeechMs);
    }

    function wire(r) {
      r.onstart = function () {
        if (started) return;             // restarts must not re-announce
        started = true;
        if (opts.onstart) opts.onstart();
      };

      r.onresult = function (e) {
        // Rebuild from scratch each time: in continuous mode e.results holds
        // every result of this session, and a result can stop being interim.
        var fin = '', itm = '';
        scores = [];
        for (var i = 0; i < e.results.length; i++) {
          var r0 = e.results[i][0];
          if (e.results[i].isFinal) {
            fin += r0.transcript + ' ';
            if (typeof r0.confidence === 'number' && r0.confidence > 0) scores.push(r0.confidence);
          } else {
            itm += r0.transcript + ' ';
          }
        }
        sessionFinal = fin;
        interim = itm;
        if (fullText()) heard = true;
        if (opts.onpartial) opts.onpartial(fullText());
        armSilence();
      };

      r.onerror = function (e) {
        var kind = e.error || 'error';
        // 'no-speech' and 'aborted' are normal outcomes of a continuous
        // session, not failures worth showing anyone.
        if (kind === 'no-speech' || kind === 'aborted') return;
        if (kind === 'not-allowed' || kind === 'service-not-allowed') {
          closing = true;   // no point restarting into the same refusal
        }
        if (opts.onerror) opts.onerror(kind);
      };

      r.onend = function () {
        if (settled) return;
        if (closing || killed) { settle(); return; }
        // Chrome ends the session on its own every few seconds. Restart and
        // carry the transcript over, so the seam is invisible to the speaker.
        if (restarts >= 12) { settle(); return; }
        restarts++;
        committed += sessionFinal;
        sessionFinal = '';
        interim = '';
        restart();
      };
    }

    function restart() {
      var next = newRecogniser(lang);
      wire(next);
      rec = next;
      try {
        next.start();
      } catch (err) {
        // "already started" can survive a beat; one retry, then give up
        // gracefully with whatever was captured.
        setTimeout(function () {
          if (settled || closing || killed) return;
          try { next.start(); } catch (e2) { settle(); }
        }, 120);
      }
    }

    wire(rec);
    armSilence();
    hardTimer = setTimeout(endNow, maxMs);

    try {
      rec.start();
    } catch (e) {
      if (opts.onerror) opts.onerror('start-failed');
      settled = true;
      clearTimers();
      if (opts.onend) opts.onend();
      return { stop: function () {}, abort: function () {}, text: function () { return ''; } };
    }

    return {
      // Finish the turn and send what was heard.
      stop: endNow,
      // Throw it away — the speaker changed their mind, or is leaving.
      abort: function () {
        killed = true;
        closing = true;
        clearTimers();
        try { rec.abort(); } catch (e) { /* ignore */ }
        settled = true;
      },
      text: fullText
    };
  }

  function newRecogniser(lang) {
    var r = new SR();
    r.lang = (LANGS[lang] || LANGS.es).code;
    r.interimResults = true;
    r.continuous = true;
    // Alternatives cost nothing and let the engine revise its own guess as
    // more of the sentence arrives.
    r.maxAlternatives = 3;
    return r;
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
    defaultPauseMs: 1600,

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
