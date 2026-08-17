/**
 * A single Web Audio graph shared by every input mode.
 *
 *   mic       ──► analyser                (analysed only, never audible)
 *   file/clip ──┬► analyser
 *               └► destination            (audible)
 *
 * The analyser is deliberately never connected to the destination, so holding
 * a live microphone open cannot feed back through the speakers.
 */
export class AudioEngine {

  constructor() {
    this.ctx = null;
    this.analyser = null;
    this.time = null;        // Float32Array, time domain
    this.freq = null;        // Uint8Array, frequency domain

    this.micStream = null;
    this.micSource = null;
    this.source = null;      // currently playing AudioBufferSourceNode
    this.recorder = null;
    this.recordedChunks = [];

    this.onPlaybackEnd = null;
  }

  /**
   * Build the graph. Safe to call before any user gesture: the context simply
   * starts out suspended, and TalkingHead can share it from the start.
   */
  create() {
    if (this.ctx) return this.ctx;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('This browser has no Web Audio support.');
    this.ctx = new Ctx();

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.analyser.minDecibels = -85;
    this.analyser.maxDecibels = -10;

    this.time = new Float32Array(this.analyser.fftSize);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    return this.ctx;
  }

  /** Resume the context. Must be called from a user gesture the first time. */
  async ensure() {
    this.create();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  get sampleRate() { return this.ctx ? this.ctx.sampleRate : 48000; }

  // ── Microphone ────────────────────────────────────────────────────────

  get micActive() { return !!this.micStream; }

  async startMic() {
    await this.ensure();
    if (this.micStream) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone capture needs a secure context (https:// or localhost).');
    }

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        // Leave the level alone: automatic gain fights the lip-sync envelope.
        autoGainControl: false
      }
    });

    this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    this.micSource.connect(this.analyser);
  }

  stopMic() {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    if (this.micSource) { this.micSource.disconnect(); this.micSource = null; }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }

  // ── Recording ─────────────────────────────────────────────────────────

  get recording() { return !!this.recorder && this.recorder.state === 'recording'; }

  /** Record from the microphone; resolves with an audio Blob when stopped. */
  async startRecording() {
    await this.startMic();
    if (!window.MediaRecorder) throw new Error('This browser has no MediaRecorder support.');

    this.recordedChunks = [];
    this.recorder = new MediaRecorder(this.micStream);
    this.recorder.ondataavailable = e => { if (e.data.size) this.recordedChunks.push(e.data); };

    return new Promise((resolve, reject) => {
      this.recorder.onstop = () => {
        const type = this.recorder.mimeType || 'audio/webm';
        resolve(new Blob(this.recordedChunks, { type }));
      };
      this.recorder.onerror = e => reject(e.error || new Error('Recording failed.'));
      this.recorder.start();
    });
  }

  stopRecording() {
    if (this.recording) this.recorder.stop();
  }

  // ── Playback ──────────────────────────────────────────────────────────

  get playing() { return !!this.source; }

  async decode(blobOrFile) {
    await this.ensure();
    const bytes = await blobOrFile.arrayBuffer();
    return await this.ctx.decodeAudioData(bytes);
  }

  /** Play a decoded buffer, analysed and audible. */
  async play(buffer) {
    await this.ensure();
    this.stopPlayback();

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser);
    src.connect(this.ctx.destination);
    src.onended = () => {
      if (this.source === src) {
        this.source = null;
        if (this.onPlaybackEnd) this.onPlaybackEnd();
      }
    };
    src.start();
    this.source = src;
  }

  stopPlayback() {
    if (!this.source) return;
    const src = this.source;
    this.source = null;
    src.onended = null;
    try { src.stop(); } catch { /* already stopped */ }
    src.disconnect();
  }

  // ── Analysis ──────────────────────────────────────────────────────────

  /** Root-mean-square amplitude of the current frame, 0..1. */
  rms() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.time);
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) sum += this.time[i] * this.time[i];
    return Math.sqrt(sum / this.time.length);
  }

  /** Current magnitude spectrum, 0..255 per bin. */
  spectrum() {
    if (!this.analyser) return null;
    this.analyser.getByteFrequencyData(this.freq);
    return this.freq;
  }

  dispose() {
    this.stopPlayback();
    this.stopMic();
    if (this.ctx) this.ctx.close();
    this.ctx = null;
  }
}
