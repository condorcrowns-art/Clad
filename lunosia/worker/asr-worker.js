/* Lunosia — speech recognition worker
 *
 * Two interchangeable backends, both of which keep audio on this machine:
 *
 *   'local'  Whisper compiled to ONNX, executed by onnxruntime-web inside this
 *            worker. WebGPU when the machine has it, WASM otherwise. The model
 *            weights are fetched from Hugging Face exactly once and then cached
 *            by the browser; after that the extension works with the network
 *            off entirely. The audio itself is never sent anywhere.
 *
 *   'server' A whisper.cpp / faster-whisper server on 127.0.0.1. Nothing leaves
 *            the loopback interface. Slower to set up, better accuracy, and it
 *            can use a full large-v3 model that would not fit in a tab.
 *
 * What this file deliberately does NOT contain is a cloud API client. The
 * browser's own webkitSpeechRecognition would have been three lines of code,
 * but it streams your microphone to Google's servers — which is the exact
 * thing an extension called "private transcription" must not do.
 */

import { pipeline, env } from '../lib/transformers.js';

/* Point onnxruntime at the .wasm we ship. Without this it tries a CDN, and
 * MV3's content security policy blocks that — correctly. */
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('lib/ort/');
env.backends.onnx.wasm.numThreads = Math.min(4, (navigator.hardwareConcurrency || 4));
env.allowLocalModels = false;
env.useBrowserCache = true;

const MODELS = {
  tiny:  'onnx-community/whisper-tiny',
  base:  'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small'
};

let transcriber = null;
let loading = null;
let cfg = {
  engine: 'local',
  model: 'base',
  language: 'en',
  task: 'transcribe',
  serverUrl: 'http://127.0.0.1:8080/inference',
  dtype: 'q8'
};

let queue = [];
let working = false;

/* ------------------------------------------------------------- loading -- */

async function pickDevice() {
  try {
    if (navigator.gpu && (await navigator.gpu.requestAdapter())) return 'webgpu';
  } catch (_) {}
  return 'wasm';
}

async function load(settings = {}) {
  cfg = { ...cfg, ...settings };

  if (cfg.engine === 'server') {
    transcriber = null;
    self.postMessage({ type: 'ready', backend: 'server', model: cfg.serverUrl });
    return;
  }

  if (transcriber && transcriber.__key === cfg.model + cfg.dtype) {
    self.postMessage({ type: 'ready', backend: transcriber.__device, model: cfg.model });
    return;
  }
  if (loading) return loading;

  loading = (async () => {
    const device = await pickDevice();
    const id = MODELS[cfg.model] || MODELS.base;

    const t = await pipeline('automatic-speech-recognition', id, {
      device,
      dtype: device === 'webgpu' ? 'fp32' : cfg.dtype,
      progress_callback: (p) => {
        if (p.status === 'progress') {
          self.postMessage({
            type: 'progress',
            file: p.file,
            loaded: p.loaded,
            total: p.total,
            pct: p.total ? Math.round((p.loaded / p.total) * 100) : 0
          });
        }
      }
    });

    t.__key = cfg.model + cfg.dtype;
    t.__device = device;
    transcriber = t;
    self.postMessage({ type: 'ready', backend: device, model: cfg.model });
  })();

  try { await loading; } catch (e) {
    self.postMessage({ type: 'error', error: 'Could not load the speech model: ' + e.message });
  } finally { loading = null; }
}

/* ------------------------------------------------------------ server -- */

/* Minimal 16-bit PCM WAV wrapper — whisper.cpp's HTTP server wants a real file. */
function toWav(samples, rate = 16000) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };

  str(0, 'RIFF');  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');  str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);

  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

async function viaServer(audio) {
  const fd = new FormData();
  fd.append('file', toWav(audio), 'chunk.wav');
  fd.append('temperature', '0');
  fd.append('response_format', 'json');
  if (cfg.language && cfg.language !== 'auto') fd.append('language', cfg.language);

  const res = await fetch(cfg.serverUrl, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`local server returned ${res.status}`);
  const j = await res.json();
  return { text: j.text || j.transcription || '', words: null };
}

/* ------------------------------------------------------------- local -- */

async function viaLocal(audio) {
  if (!transcriber) await load(cfg);
  if (!transcriber) throw new Error('model unavailable');

  const out = await transcriber(audio, {
    language: cfg.language === 'auto' ? null : cfg.language,
    task: cfg.task,
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
    temperature: 0,
    no_repeat_ngram_size: 4   // blunts Whisper's habit of looping on silence
  });

  const words = (out.chunks || [])
    .filter((c) => c.timestamp && c.timestamp[0] != null)
    .map((c) => ({ w: (c.text || '').trim(), s: c.timestamp[0], e: c.timestamp[1] }));

  return { text: out.text || '', words: words.length ? words : null };
}

/* Whisper emits these when handed near-silence. They are artefacts, not speech. */
const GHOSTS = [
  'thank you.', 'thanks for watching!', 'you', 'thank you for watching.',
  '.', 'bye.', 'okay.', 'so', 'subtitles by the amara.org community',
  'transcription by castingwords', '[music]', '[blank_audio]', '(silence)'
];

function isGhost(text) {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return true;
  if (GHOSTS.includes(t)) return true;
  // A single token repeated to fill the window is always a hallucination.
  const parts = t.split(/\s+/);
  if (parts.length > 6 && new Set(parts).size <= 2) return true;
  return false;
}

/* ------------------------------------------------------------- queue -- */

async function pump() {
  if (working || !queue.length) return;
  working = true;
  self.postMessage({ type: 'busy' });

  const job = queue.shift();
  try {
    const r = cfg.engine === 'server' ? await viaServer(job.audio) : await viaLocal(job.audio);
    const text = isGhost(r.text) ? '' : r.text;

    // Word timestamps come back relative to the chunk; shift to wall clock.
    const words = r.words
      ? r.words.map((w) => ({ ...w, s: job.start + (w.s || 0), e: job.start + (w.e || 0) }))
      : null;

    self.postMessage({ type: 'result', id: job.id, start: job.start, end: job.end, text, words });
  } catch (e) {
    self.postMessage({ type: 'error', error: e.message });
  } finally {
    working = false;
    if (queue.length) pump();
  }
}

self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'load') {
    load(m.settings);
  } else if (m.type === 'transcribe') {
    queue.push(m);
    // Never let a backlog grow without bound; drop the middle, keep recent.
    if (queue.length > 8) queue.splice(0, queue.length - 8);
    pump();
  } else if (m.type === 'config') {
    cfg = { ...cfg, ...m.settings };
  }
};
