/**
 * Audio-driven lip-sync.
 *
 * There is no transcript for a live microphone, so the mouth shape is derived
 * from the audio itself. Each frame we look at where the energy sits in the
 * spectrum and turn that into a blend of Oculus visemes:
 *
 *   - loudness            → how far the mouth opens
 *   - energy around F1    → open vowels (aa, E) vs. closed ones (I, O, U)
 *   - energy around F2    → front vowels (I, E) vs. back ones (O, U)
 *   - energy above 4 kHz  → sibilants (SS)
 *
 * The values are written to `head.mtAvatar[…].realtime`, which TalkingHead
 * documents as the way to drive blend shapes from a real-time source: it
 * overrides the idle/speech animation without any easing, so the mouth stays
 * in sync with the input. Setting them back to `null` hands control back to
 * the library's own animation system.
 */

/** Visemes this driver blends between, plus the jaw. */
const KEYS = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U',
              'viseme_SS', 'viseme_sil', 'jawOpen', 'mouthPucker'];

const GATE = 0.06;          // level below which we treat the input as silence
const RELEASE_MS = 350;     // silence needed before the avatar goes back to idle

export class LipsyncDriver {

  /**
   * @param {object} head    TalkingHead instance
   * @param {AudioEngine} audio
   */
  constructor(head, audio) {
    this.head = head;
    this.audio = audio;

    this.running = false;
    this.engaged = false;       // true while we are overriding the blend shapes
    this.sensitivity = 1;
    this.smoothing = 0.5;

    this.level = 0;             // smoothed 0..1 loudness, also drives the VU meter
    this.peak = 0.05;           // running peak for automatic gain
    this.silentSince = 0;
    this.values = Object.fromEntries(KEYS.map(k => [k, 0]));

    this.onLevel = null;        // (level:number) => void
    this.onActivity = null;     // (speaking:boolean) => void
    this.speaking = false;

    this._frame = this._frame.bind(this);
    this._raf = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.silentSince = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.level = 0;
    this._setSpeaking(false);
    this._release();
    if (this.onLevel) this.onLevel(0);
  }

  // ── Per-frame work ────────────────────────────────────────────────────

  _frame() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(this._frame);

    const rms = this.audio.rms();
    const spec = this.audio.spectrum();
    if (!spec) return;

    // Automatic gain: normalise against a slowly decaying peak so the driver
    // works with quiet laptop mics and hot audio files alike.
    this.peak = Math.max(rms, this.peak * 0.995);
    const norm = rms / Math.max(this.peak, 0.02);
    const target = Math.min(1, norm * this.sensitivity);

    // Loudness rises fast and falls slower, which reads as natural speech.
    const k = this.smoothing;
    const rise = 1 - k * 0.55;
    const fall = 1 - k * 0.88;
    this.level += (target - this.level) * (target > this.level ? rise : fall);

    const now = performance.now();
    if (this.level < GATE) {
      if (!this.silentSince) this.silentSince = now;
    } else {
      this.silentSince = 0;
    }

    if (this.onLevel) this.onLevel(this.level);

    // Long enough silence: let TalkingHead's own idle animation take over.
    if (this.silentSince && now - this.silentSince > RELEASE_MS) {
      this._setSpeaking(false);
      this._release();
      return;
    }

    this._setSpeaking(this.level >= GATE);
    this._apply(this._shape(spec), rise, fall);
  }

  /** Turn a spectrum into target viseme weights. */
  _shape(spec) {
    const binHz = this.audio.sampleRate / (spec.length * 2);
    const band = (lo, hi) => {
      const a = Math.max(0, Math.floor(lo / binHz));
      const b = Math.min(spec.length - 1, Math.ceil(hi / binHz));
      let sum = 0;
      for (let i = a; i <= b; i++) { const v = spec[i] / 255; sum += v * v; }
      return sum / Math.max(1, b - a + 1);
    };

    const eps = 1e-6;
    const deep = band(120, 320);     // very closed vowels, /u/
    const low  = band(320, 620);     // low F1
    const mid  = band(620, 1300);    // high F1 — open vowels
    const high = band(1500, 3200);   // F2 — front vowels
    const sib  = band(4200, 9000);   // fricatives

    const voiced = deep + low + mid + eps;
    const open = mid / voiced;                       // 0 closed … 1 open
    const front = high / (mid + high + eps);         // 0 back  … 1 front
    const closed = 1 - open;
    const back = 1 - front;
    const sibRatio = sib / (voiced + sib + eps);
    const deepRatio = deep / (deep + low + eps);

    // Vowel blend, then normalised so the mouth never over-drives.
    let aa = open * back;
    let ee = open * front * 0.9;
    let ii = closed * front;
    let oo = closed * back * (1 - deepRatio);
    let uu = closed * back * deepRatio;

    const sum = aa + ee + ii + oo + uu + eps;
    const gain = this.level / sum;
    aa *= gain; ee *= gain; ii *= gain; oo *= gain; uu *= gain;

    // Sibilants ride on top and pull the vowels down: /s/ is not a vowel.
    const ss = Math.min(1, sibRatio * 2.2) * Math.min(1, this.level * 1.6);
    const duck = 1 - 0.7 * ss;

    return {
      viseme_aa: clamp(aa * duck),
      viseme_E:  clamp(ee * duck),
      viseme_I:  clamp(ii * duck),
      viseme_O:  clamp(oo * duck),
      viseme_U:  clamp(uu * duck),
      viseme_SS: clamp(ss),
      viseme_sil: clamp(1 - this.level),
      jawOpen: clamp(this.level * (0.12 + 0.5 * open) * duck),
      mouthPucker: clamp(uu * 0.5)
    };
  }

  /** Smooth towards the targets and push them into the avatar. */
  _apply(targets, rise, fall) {
    const mt = this.head?.mtAvatar;
    if (!mt) return;
    this.engaged = true;

    for (const key of KEYS) {
      const t = targets[key] ?? 0;
      const v = this.values[key];
      this.values[key] = v + (t - v) * (t > v ? rise : fall);

      const o = mt[key];
      if (o) { o.realtime = this.values[key]; o.needsUpdate = true; }
    }
  }

  /** Hand the blend shapes back to TalkingHead. */
  _release() {
    if (!this.engaged) return;
    this.engaged = false;
    const mt = this.head?.mtAvatar;
    for (const key of KEYS) {
      this.values[key] = 0;
      const o = mt && mt[key];
      if (o) { o.realtime = null; o.needsUpdate = true; }
    }
  }

  _setSpeaking(v) {
    if (v === this.speaking) return;
    this.speaking = v;
    if (this.onActivity) this.onActivity(v);
  }
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
