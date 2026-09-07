/* AudioWorklet: pulls raw frames off the audio thread and ships them to the
 * offscreen document in fixed-size blocks.
 *
 * This runs on the realtime audio thread, so it does the absolute minimum:
 * copy samples into a block, compute a cheap RMS for the level meter, and post.
 * All the interesting work (windowing, Whisper) happens elsewhere.
 *
 * The AudioContext is created at 16 kHz, which is exactly what Whisper wants,
 * so there is no resampling to do here — the browser already did it.
 */

const BLOCK = 4096; // ~256 ms at 16 kHz

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(BLOCK);
    this._n = 0;
    this._muted = false;
    this.port.onmessage = (e) => {
      if (e.data && e.data.type === 'mute') this._muted = !!e.data.value;
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    // Downmix every channel to mono — tab audio is usually stereo, Whisper is not.
    const chans = input.length;
    const frames = input[0].length;

    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (let c = 0; c < chans; c++) sum += input[c][i];
      this._buf[this._n++] = sum / chans;

      if (this._n === BLOCK) {
        let peak = 0, energy = 0;
        for (let k = 0; k < BLOCK; k++) {
          const v = this._buf[k];
          energy += v * v;
          const a = v < 0 ? -v : v;
          if (a > peak) peak = a;
        }
        if (!this._muted) {
          // Transfer the buffer so there is no copy; allocate a fresh one after.
          const out = this._buf;
          this.port.postMessage(
            { samples: out, rms: Math.sqrt(energy / BLOCK), peak },
            [out.buffer]
          );
          this._buf = new Float32Array(BLOCK);
        }
        this._n = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
