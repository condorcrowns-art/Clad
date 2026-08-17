/**
 * Text mode: the browser speaks, TalkingHead does the lip-sync.
 *
 * The Web Speech API gives us a voice but no audio buffer we could analyse, so
 * instead of driving the mouth from the sound we drive it from the words. The
 * avatar is put into streaming mode with `waitForAudioChunks: false`, which
 * TalkingHead documents as "play lip-sync without audio", and each word is
 * handed over with a timestamp as the synthesiser reaches it. TalkingHead's own
 * English lip-sync module turns those words into visemes, so the mouth shapes
 * are the library's, not an approximation.
 *
 * Some voices never emit boundary events. If none has arrived shortly after
 * speech starts, the whole utterance is scheduled up front from estimated
 * word timings instead.
 */

/** Voices that tend to be female, in rough order of preference. */
const FEMALE_HINTS = [
  'google uk english female', 'google us english', 'samantha', 'karen', 'moira',
  'tessa', 'fiona', 'serena', 'victoria', 'zira', 'hazel', 'susan', 'allison',
  'ava', 'joanna', 'amelie', 'female'
];

const BOUNDARY_GRACE_MS = 700;   // wait this long for a boundary event
const KEEPALIVE_MS = 9000;       // Chrome truncates long utterances without this

export class TextSpeaker {

  constructor(head) {
    this.head = head;
    this.utterance = null;
    this.t0 = 0;
    this.streaming = false;
    this.boundaries = 0;
    this._timers = [];
    this.onEnd = null;
    this.onSubtitle = null;
  }

  static get supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  get speaking() { return !!this.utterance; }

  /** Available voices, English ones first, likely-female ones at the top. */
  voices() {
    if (!TextSpeaker.supported) return [];
    const all = window.speechSynthesis.getVoices();
    const score = v => {
      const name = v.name.toLowerCase();
      const hint = FEMALE_HINTS.findIndex(h => name.includes(h));
      return (v.lang.startsWith('en') ? 0 : 100) + (hint === -1 ? 50 : hint);
    };
    return all.slice().sort((a, b) => score(a) - score(b));
  }

  /** Resolves once the voice list is populated (it loads asynchronously). */
  static async voicesReady() {
    if (!TextSpeaker.supported) return;
    if (window.speechSynthesis.getVoices().length) return;
    await new Promise(resolve => {
      const done = () => { window.speechSynthesis.removeEventListener('voiceschanged', done); resolve(); };
      window.speechSynthesis.addEventListener('voiceschanged', done);
      setTimeout(done, 1500);
    });
  }

  /**
   * Speak `text`, lip-syncing as it goes.
   * @param {string} text
   * @param {{voice?:SpeechSynthesisVoice, rate?:number, mood?:string}} opt
   */
  async speak(text, opt = {}) {
    if (!TextSpeaker.supported) throw new Error('This browser has no speech synthesis.');
    const trimmed = text.trim();
    if (!trimmed) return;

    this.stop();

    const rate = opt.rate ?? 1;
    const words = tokenize(trimmed);

    const utt = new SpeechSynthesisUtterance(trimmed);
    if (opt.voice) { utt.voice = opt.voice; utt.lang = opt.voice.lang; }
    utt.rate = rate;
    this.utterance = utt;

    // Enter streaming mode: lip-sync only, no audio chunks — the voice comes
    // from the speech synthesiser instead.
    await this.head.streamStart(
      {
        waitForAudioChunks: false,
        lipsyncType: 'words',
        lipsyncLang: 'en',
        ...(opt.mood ? { mood: opt.mood } : {})
      },
      null,
      null,
      line => { if (this.onSubtitle) this.onSubtitle(line); }
    );
    this.streaming = true;
    this.boundaries = 0;
    this.t0 = performance.now();

    utt.onstart = () => {
      this.t0 = performance.now();
      // Fall back to estimated timings if the voice stays silent about words.
      this._timers.push(setTimeout(() => {
        if (this.boundaries === 0 && this.streaming) this._scheduleAll(words, rate);
      }, BOUNDARY_GRACE_MS));
    };

    utt.onboundary = e => {
      if (e.name && e.name !== 'word') return;
      const word = wordAt(trimmed, e.charIndex, e.charLength);
      if (!word) return;
      this.boundaries++;
      this._send([word], [this._now()], [estimate(word, rate)]);
    };

    utt.onend = utt.onerror = () => this._finish();

    this._keepalive = setInterval(() => {
      // Chrome stops long utterances unless the queue is nudged.
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, KEEPALIVE_MS);

    window.speechSynthesis.speak(utt);
  }

  stop() {
    this._clearTimers();
    if (TextSpeaker.supported) window.speechSynthesis.cancel();
    this._finish();
  }

  // ── Internals ─────────────────────────────────────────────────────────

  /** Milliseconds since the timeline the avatar is scheduling against. */
  _now() {
    // TalkingHead restarts its stream clock whenever it drops out of the
    // speaking state, so re-anchor when that happens.
    if (!this.head.isSpeaking) this.t0 = performance.now();
    return Math.max(0, performance.now() - this.t0);
  }

  _send(words, wtimes, wdurations) {
    if (!this.streaming) return;
    try {
      this.head.streamAudio({ words, wtimes, wdurations });
    } catch (err) {
      console.warn('streamAudio failed', err);
    }
  }

  /** No boundary events: schedule the whole utterance from estimates. */
  _scheduleAll(words, rate) {
    const wtimes = [];
    const wdurations = [];
    let t = this._now();
    for (const w of words) {
      const d = estimate(w.text, rate);
      wtimes.push(t);
      wdurations.push(d);
      t += d + pauseAfter(w.text) / rate;
    }
    this._send(words.map(w => w.text), wtimes, wdurations);
  }

  _finish() {
    this._clearTimers();
    this.utterance = null;
    if (this.streaming) {
      this.streaming = false;
      try { this.head.streamStop(); } catch { /* not streaming */ }
    }
    if (this.onEnd) this.onEnd();
  }

  _clearTimers() {
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (this._keepalive) { clearInterval(this._keepalive); this._keepalive = null; }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function tokenize(text) {
  const out = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ text: m[0], index: m.index });
  return out;
}

/** The word starting at `index`, used to turn a boundary event into a token. */
function wordAt(text, index, length) {
  if (typeof index !== 'number') return null;
  if (length) return text.substr(index, length).trim() || null;
  const m = /^\S+/.exec(text.slice(index));
  return m ? m[0] : null;
}

/** Rough spoken length of a word in milliseconds. */
function estimate(word, rate) {
  const letters = word.replace(/[^A-Za-z']/g, '').length || word.length;
  return Math.max(120, (70 + letters * 58) / rate);
}

/** Extra silence after sentence and clause endings. */
function pauseAfter(word) {
  if (/[.!?]["')\]]?$/.test(word)) return 300;
  if (/[,;:]["')\]]?$/.test(word)) return 140;
  return 30;
}
