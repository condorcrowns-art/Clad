/* Lunosia — capture engine (offscreen document)
 *
 * Owns the microphone/tab MediaStream, the AudioContext, and the Whisper
 * worker. Speaks only to the service worker.
 *
 * Segmentation is silence-driven rather than fixed-window. Chopping audio
 * every N seconds regardless of content cuts words in half and Whisper
 * hallucinates across the seam; waiting for a natural pause instead means
 * every chunk handed to the model is a whole phrase. A hard ceiling stops
 * a monologue with no pauses from buffering forever.
 */

const SAMPLE_RATE   = 16000;
const MAX_WINDOW_S  = 22;    // force a flush after this much unbroken speech
const MIN_WINDOW_S  = 1.0;   // ignore blips shorter than this
const SILENCE_RMS   = 0.006; // below this counts as "not speech"
const SILENCE_HOLD_S = 0.45; // this much quiet ends a phrase
const PREROLL_S     = 0.25;  // keep a little audio from before speech started

let ctx = null;
let stream = null;
let node = null;
let srcNode = null;
let passthrough = null;
let worker = null;

let sessionId = null;
let sourceKind = null;
let running = false;

/* rolling capture state */
let pending = [];        // Float32Array blocks in the current phrase
let pendingLen = 0;
let preroll = [];        // blocks seen while silent, kept as lead-in
let prerollLen = 0;
let quietFor = 0;        // seconds of continuous silence
let sawSpeech = false;
let clockS = 0;          // absolute seconds since recording started
let phraseStartS = 0;
let levelTick = 0;

/* --------------------------------------------------------------- utils -- */

function send(msg) {
  return chrome.runtime.sendMessage({ ...msg, to: 'sw' }).catch(() => {});
}

function concat(blocks, total) {
  const out = new Float32Array(total);
  let o = 0;
  for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
}

/* ---------------------------------------------------------- asr worker -- */

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker('worker/asr-worker.js', { type: 'module' });

  worker.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === 'progress') {
      send({ type: 'MODEL_PROGRESS', file: m.file, loaded: m.loaded, total: m.total, pct: m.pct, done: false });
    } else if (m.type === 'ready') {
      send({ type: 'MODEL_PROGRESS', done: true, backend: m.backend, model: m.model });
      send({ type: 'ENGINE_STATUS', status: running ? 'recording' : 'ready' });
    } else if (m.type === 'result') {
      if (m.text && m.text.trim()) {
        send({
          type: 'SEGMENT',
          sessionId,
          segment: {
            id: m.id,
            start: m.start,
            end: m.end,
            text: m.text.trim(),
            words: m.words || null,
            confidence: m.confidence ?? null
          }
        });
      }
      send({ type: 'ENGINE_STATUS', status: running ? 'recording' : 'ready' });
    } else if (m.type === 'busy') {
      send({ type: 'ENGINE_STATUS', status: 'transcribing' });
    } else if (m.type === 'error') {
      send({ type: 'ENGINE_ERROR', error: m.error });
    }
  };

  worker.onerror = (e) => send({ type: 'ENGINE_ERROR', error: 'Worker crashed: ' + e.message });
  return worker;
}

/* --------------------------------------------------------- segmenting -- */

function flushPhrase(force) {
  if (!pendingLen) return;
  const durS = pendingLen / SAMPLE_RATE;
  if (!force && durS < MIN_WINDOW_S) { resetPhrase(); return; }
  if (durS < 0.35) { resetPhrase(); return; } // too short to be a word

  const audio = concat(pending, pendingLen);
  const start = phraseStartS;
  const end = start + durS;

  ensureWorker().postMessage(
    { type: 'transcribe', id: `${sessionId}:${start.toFixed(2)}`, audio, start, end },
    [audio.buffer]
  );

  resetPhrase();
}

function resetPhrase() {
  pending = [];
  pendingLen = 0;
  sawSpeech = false;
  quietFor = 0;
}

function onBlock(samples, rms) {
  const blockS = samples.length / SAMPLE_RATE;
  clockS += blockS;

  const isSpeech = rms >= SILENCE_RMS;

  if (isSpeech) {
    if (!sawSpeech) {
      // Start the phrase a hair early so the first consonant survives.
      phraseStartS = Math.max(0, clockS - blockS - prerollLen / SAMPLE_RATE);
      if (prerollLen) { pending.push(...preroll); pendingLen += prerollLen; }
      sawSpeech = true;
    }
    pending.push(samples);
    pendingLen += samples.length;
    quietFor = 0;
    preroll = []; prerollLen = 0;
  } else if (sawSpeech) {
    // Trailing silence still belongs to the phrase until the hold expires.
    pending.push(samples);
    pendingLen += samples.length;
    quietFor += blockS;
    if (quietFor >= SILENCE_HOLD_S) flushPhrase(false);
  } else {
    // Idle: keep a short pre-roll so we do not clip the start of speech.
    preroll.push(samples);
    prerollLen += samples.length;
    const maxPre = PREROLL_S * SAMPLE_RATE;
    while (prerollLen > maxPre) { prerollLen -= preroll.shift().length; }
  }

  if (pendingLen / SAMPLE_RATE >= MAX_WINDOW_S) flushPhrase(true);
}

/* ------------------------------------------------------ start and stop -- */

async function buildStream(kind, streamId) {
  if (kind === 'mic') {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true }
    });
  }
  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId }
    }
  });
}

async function start({ source, streamId, sessionId: sid, settings }) {
  if (running) return { ok: false, error: 'Engine already running.' };

  sessionId = sid;
  sourceKind = source;

  try {
    stream = await buildStream(source, streamId);
  } catch (e) {
    return {
      ok: false,
      error: source === 'mic'
        ? 'Microphone access was refused. Grant it once from the panel and try again.'
        : 'Tab audio capture failed: ' + e.message
    };
  }

  ctx = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
  await ctx.audioWorklet.addModule('worker/capture-processor.js');

  srcNode = ctx.createMediaStreamSource(stream);
  node = new AudioWorkletNode(ctx, 'capture-processor');

  node.port.onmessage = (e) => {
    const { samples, rms } = e.data;
    if (!running) return;
    onBlock(samples, rms);
    if (++levelTick % 2 === 0) send({ type: 'LEVEL', rms, t: clockS });
  };

  srcNode.connect(node);
  // The worklet has no output, so give it a sink or Chrome may cull it.
  node.connect(ctx.destination);

  // Capturing a tab mutes it for the user. Route the captured audio straight
  // back to the speakers so the meeting/video keeps playing normally.
  if (source === 'tab') {
    passthrough = ctx.createGain();
    passthrough.gain.value = 1;
    srcNode.connect(passthrough);
    passthrough.connect(ctx.destination);
  }

  clockS = 0;
  resetPhrase();
  preroll = []; prerollLen = 0;
  running = true;

  ensureWorker().postMessage({ type: 'load', settings: settings || {} });
  send({ type: 'ENGINE_STATUS', status: 'recording' });

  // If the user stops sharing from Chrome's own bar, tear down cleanly.
  stream.getAudioTracks().forEach((t) => {
    t.onended = () => { stop(); send({ type: 'ENGINE_STATUS', status: 'idle' }); };
  });

  return { ok: true };
}

async function stop() {
  if (!running) return { ok: true };
  running = false;

  flushPhrase(true); // do not lose the tail

  try { node && (node.port.onmessage = null); } catch (_) {}
  try { srcNode && srcNode.disconnect(); } catch (_) {}
  try { passthrough && passthrough.disconnect(); } catch (_) {}
  try { node && node.disconnect(); } catch (_) {}
  try { stream && stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
  try { ctx && (await ctx.close()); } catch (_) {}

  ctx = null; stream = null; node = null; srcNode = null; passthrough = null;
  send({ type: 'ENGINE_STATUS', status: 'ready' });
  return { ok: true };
}

/* ---------------------------------------------------------- messaging -- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.to !== 'offscreen') return false;

  (async () => {
    try {
      if (msg.type === 'START')       sendResponse(await start(msg));
      else if (msg.type === 'STOP')   sendResponse(await stop());
      else if (msg.type === 'WARM_MODEL') {
        ensureWorker().postMessage({ type: 'load', settings: msg.settings || {} });
        sendResponse({ ok: true });
      }
      else sendResponse({ ok: false, error: 'Unknown message ' + msg.type });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true;
});
