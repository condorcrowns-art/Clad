/* Parla — speech in and out
 *
 * Both halves are native browser APIs, which is why this app can be free:
 *   - SpeechRecognition  → speech to text, no API key, no per-minute cost
 *   - speechSynthesis    → text to speech with real Spanish voices
 *
 * Support is uneven. Recognition needs Chrome/Edge/Safari and a secure
 * context (https:// or localhost — file:// will not get a microphone).
 * Everything degrades to typing if recognition is missing.
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;

  var LANGS = {
    es: { code: 'es-ES', label: 'Spanish (Spain)', alt: ['es-MX', 'es-US', 'es-AR'] },
    fr: { code: 'fr-FR', label: 'French (France)', alt: ['fr-CA'] }
  };

  var voices = [];
  var voicesReady = false;
  var voiceWaiters = [];

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    var v = window.speechSynthesis.getVoices();
    if (v && v.length) {
      voices = v;
      voicesReady = true;
      voiceWaiters.splice(0).forEach(function (fn) { fn(voices); });
    }
  }

  if ('speechSynthesis' in window) {
    refreshVoices();
    // Chrome populates the list asynchronously; this fires when it is ready.
    window.speechSynthesis.onvoiceschanged = refreshVoices;
    // Safari sometimes never fires the event — poll briefly as a backstop.
    var tries = 0;
    var poll = setInterval(function () {
      refreshVoices();
      if (voicesReady || ++tries > 20) clearInterval(poll);
    }, 250);
  }

  function onVoicesReady(fn) {
    if (voicesReady) fn(voices);
    else voiceWaiters.push(fn);
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
    if (uri) {
      var exact = list.filter(function (v) { return v.voiceURI === uri; })[0] ||
                  voices.filter(function (v) { return v.voiceURI === uri; })[0];
      if (exact) return exact;
    }
    return list[0] || null;
  }

  /* ── Text to speech ─────────────────────────────────────── */
  var speaking = false;

  function speak(text, opts) {
    opts = opts || {};
    if (!('speechSynthesis' in window) || !text) {
      if (opts.onend) opts.onend();
      return function () {};
    }
    cancelSpeech();

    var u = new SpeechSynthesisUtterance(text);
    var lang = opts.lang || 'es';
    var v = pickVoice(lang, opts.voiceURI);
    if (v) u.voice = v;
    u.lang = v ? v.lang : (LANGS[lang] || LANGS.es).code;
    u.rate = opts.rate != null ? opts.rate : 0.9;
    u.pitch = opts.pitch != null ? opts.pitch : 1;

    speaking = true;
    u.onend = function () { speaking = false; if (opts.onend) opts.onend(); };
    u.onerror = function () { speaking = false; if (opts.onend) opts.onend(); };

    window.speechSynthesis.speak(u);
    return function () { cancelSpeech(); };
  }

  function cancelSpeech() {
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
    isSpeaking: function () { return speaking; }
  };
})();
