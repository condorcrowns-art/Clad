/**
 * Talking Head — single page app.
 *
 * Three ways to drive the same avatar:
 *   microphone  live audio → spectrum → visemes (lipsync-driver.js)
 *   playback    an audio file or a recorded clip through the same analysis
 *   text        browser speech synthesis + TalkingHead's own viseme generation
 */

import { AVATAR, HEAD_OPTIONS } from './config.js';
import { AudioEngine } from './audio-engine.js';
import { LipsyncDriver } from './lipsync-driver.js';
import { TextSpeaker } from './speech.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const ui = {
  loader: $('#loader'),
  loaderText: $('#loader-text'),
  loaderBar: $('#loader-bar'),
  fatal: $('#fatal'),
  fatalText: $('#fatal-text'),
  chip: $('#state-chip'),
  meter: $('#meter-fill'),
  subtitles: $('#subtitles')
};

const audio = new AudioEngine();
let head = null;
let driver = null;
let speaker = null;
let mode = 'mic';
let fileBuffer = null;
let clipBuffer = null;
let subtitleTimer = 0;

boot();

// ── Start-up ──────────────────────────────────────────────────────────────

async function boot() {
  let TalkingHead;
  try {
    ({ TalkingHead } = await import('talkinghead'));
  } catch (err) {
    console.error(err);
    return fatal('Could not load the TalkingHead library from the CDN. Check your network connection and reload.');
  }

  try {
    // Share one audio context with the library so speech, playback and
    // analysis all live in the same graph.
    audio.create();

    head = new TalkingHead($('#avatar'), { ...HEAD_OPTIONS, audioCtx: audio.ctx });

    await head.showAvatar(AVATAR, ev => {
      const pct = ev && ev.total ? Math.round((ev.loaded / ev.total) * 100) : null;
      ui.loaderText.textContent = pct === null ? 'Loading avatar…' : `Loading avatar… ${pct}%`;
      ui.loaderBar.style.width = `${pct === null ? 15 : pct}%`;
    });
  } catch (err) {
    console.error(err);
    return fatal(`The avatar could not be loaded. ${err.message || err}`);
  }

  driver = new LipsyncDriver(head, audio);
  driver.onLevel = level => { ui.meter.style.width = `${Math.round(level * 100)}%`; };
  driver.onActivity = speaking => {
    if (audio.recording) {
      setChip('recording', 'rec');
    } else {
      setChip(speaking ? 'speaking' : (audio.micActive || audio.playing ? 'listening' : 'idle'),
              speaking ? 'live' : '');
    }
    if (speaking && $('#mic-eyecontact').checked) head.makeEyeContact(2500);
  };

  speaker = new TextSpeaker(head);
  speaker.onSubtitle = showSubtitle;
  speaker.onEnd = () => {
    $('#text-speak').classList.remove('active');
    setChip('idle');
    hideSubtitle(600);
  };

  audio.onPlaybackEnd = () => stopPlayback();

  wireUi();
  await fillVoices();
  fillMoods();

  ui.loader.classList.add('hidden');
  setChip('idle');
}

function fatal(message) {
  ui.loader.classList.add('hidden');
  ui.fatal.classList.remove('hidden');
  ui.fatalText.textContent = message;
}

// ── UI wiring ─────────────────────────────────────────────────────────────

function wireUi() {

  // Tabs
  $$('.tabs button').forEach(btn => {
    btn.addEventListener('click', () => selectMode(btn.dataset.tab));
  });

  // Camera views
  $$('#stage-bottom [data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#stage-bottom [data-view]').forEach(b => b.classList.toggle('on', b === btn));
      head.setView(btn.dataset.view);
    });
  });

  // Gestures
  $$('#gestures button').forEach(btn => {
    btn.addEventListener('click', () => head.playGesture(btn.dataset.gesture, 3));
  });

  // Mood
  $('#mood-select').addEventListener('change', e => head.setMood(e.target.value));

  // ── Microphone ──
  $('#mic-toggle').addEventListener('click', toggleMic);

  bindRange('#sens', '#sens-out', v => { driver.sensitivity = v; }, v => v.toFixed(1));
  bindRange('#smooth', '#smooth-out', v => { driver.smoothing = v; }, v => v.toFixed(2));

  // ── Playback ──
  $('#file-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    $('#file-name').textContent = 'Decoding…';
    try {
      fileBuffer = await audio.decode(file);
      $('#file-name').textContent = `${file.name} · ${fmtDuration(fileBuffer.duration)}`;
      $('#file-play').disabled = false;
    } catch (err) {
      console.error(err);
      fileBuffer = null;
      $('#file-play').disabled = true;
      $('#file-name').textContent = 'That file could not be decoded — try MP3, WAV, OGG or M4A.';
    }
  });

  $('#file-play').addEventListener('click', () => startPlayback(fileBuffer));
  $('#file-stop').addEventListener('click', stopPlayback);
  $('#rec-toggle').addEventListener('click', toggleRecording);
  $('#rec-play').addEventListener('click', () => startPlayback(clipBuffer));

  // ── Text ──
  bindRange('#rate', '#rate-out', () => {}, v => v.toFixed(2));
  $('#text-speak').addEventListener('click', speakText);
  $('#text-stop').addEventListener('click', () => speaker.stop());

  if (!TextSpeaker.supported) {
    $('#text-speak').disabled = true;
    $('.tabpanel[data-tab="text"] .hint').textContent =
      'This browser has no speech synthesis, so the text mode is unavailable.';
  }

  window.addEventListener('pagehide', () => {
    speaker?.stop();
    driver?.stop();
    audio.stopMic();
  });
}

function bindRange(input, output, apply, format) {
  const el = $(input);
  const out = $(output);
  const update = () => {
    const v = parseFloat(el.value);
    out.textContent = format(v);
    apply(v);
  };
  el.addEventListener('input', update);
  update();
}

function selectMode(next) {
  if (next === mode) return;

  // Leaving a mode always releases whatever it was holding.
  stopMic();
  stopPlayback();
  if (audio.recording) audio.stopRecording();
  speaker.stop();

  mode = next;
  $$('.tabs button').forEach(b => {
    const on = b.dataset.tab === next;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  $$('.tabpanel').forEach(p => p.classList.toggle('hidden', p.dataset.tab !== next));
}

// ── Microphone ────────────────────────────────────────────────────────────

async function toggleMic() {
  if (audio.micActive && !audio.recording) return stopMic();

  try {
    await audio.ensure();
    await audio.startMic();
  } catch (err) {
    console.error(err);
    setChip('no mic');
    alert(micError(err));
    return;
  }

  driver.start();
  $('#mic-toggle').textContent = 'Stop microphone';
  $('#mic-toggle').classList.add('active');
  setChip('listening', 'live');
}

function stopMic() {
  if (!audio.micActive) return;
  audio.stopMic();
  driver.stop();
  $('#mic-toggle').textContent = 'Start microphone';
  $('#mic-toggle').classList.remove('active');
  ui.meter.style.width = '0';
  setChip('idle');
}

function micError(err) {
  if (err.name === 'NotAllowedError') return 'Microphone access was blocked. Allow it in the address bar and try again.';
  if (err.name === 'NotFoundError') return 'No microphone was found on this device.';
  return err.message || 'The microphone could not be started.';
}

// ── Playback ──────────────────────────────────────────────────────────────

async function startPlayback(buffer) {
  if (!buffer) return;
  try {
    await audio.ensure();
    await audio.play(buffer);
  } catch (err) {
    console.error(err);
    return;
  }
  driver.start();
  $('#file-stop').disabled = false;
  $('#file-play').disabled = true;
  $('#rec-play').disabled = true;
  setChip('playing', 'live');
}

function stopPlayback() {
  audio.stopPlayback();
  if (!audio.micActive) driver.stop();
  $('#file-stop').disabled = true;
  $('#file-play').disabled = !fileBuffer;
  $('#rec-play').disabled = !clipBuffer;
  ui.meter.style.width = '0';
  setChip('idle');
}

async function toggleRecording() {
  const btn = $('#rec-toggle');

  if (audio.recording) {
    audio.stopRecording();
    return;
  }

  stopPlayback();
  btn.textContent = 'Stop recording';
  btn.classList.add('active');
  $('#rec-status').textContent = 'Recording…';
  setChip('recording', 'rec');

  let blob;
  try {
    await audio.ensure();
    const pending = audio.startRecording();   // resolves with a Blob once stopped
    driver.start();                           // lip-sync while the clip is captured
    blob = await pending;
  } catch (err) {
    console.error(err);
    $('#rec-status').textContent = micError(err);
    setChip('idle');
    btn.textContent = 'Record from mic';
    btn.classList.remove('active');
    return;
  } finally {
    driver.stop();
    audio.stopMic();
    ui.meter.style.width = '0';
  }

  btn.textContent = 'Record from mic';
  btn.classList.remove('active');
  setChip('idle');

  try {
    clipBuffer = await audio.decode(blob);
    $('#rec-status').textContent = `Recorded ${fmtDuration(clipBuffer.duration)} — press play`;
    $('#rec-play').disabled = false;
  } catch (err) {
    console.error(err);
    $('#rec-status').textContent = 'The recording could not be decoded.';
  }
}

// ── Text ──────────────────────────────────────────────────────────────────

async function speakText() {
  const text = $('#text-input').value;
  if (!text.trim()) return;

  const select = $('#voice-select');
  const voice = speaker.voices()[Number(select.value)] || null;

  try {
    await audio.ensure();
    // Resolves once the utterance is queued, not when it finishes.
    await speaker.speak(text, {
      voice,
      rate: parseFloat($('#rate').value),
      mood: $('#mood-select').value
    });
    if (speaker.speaking) {
      $('#text-speak').classList.add('active');
      setChip('speaking', 'live');
    }
  } catch (err) {
    console.error(err);
    $('#text-speak').classList.remove('active');
    setChip('idle');
  }
}

async function fillVoices() {
  const select = $('#voice-select');
  if (!TextSpeaker.supported) {
    select.disabled = true;
    return;
  }
  await TextSpeaker.voicesReady();
  const voices = speaker.voices();
  select.innerHTML = '';
  if (!voices.length) {
    select.innerHTML = '<option>No voices installed</option>';
    select.disabled = true;
    return;
  }
  voices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${v.name} (${v.lang})`;
    select.appendChild(opt);
  });
}

function fillMoods() {
  const select = $('#mood-select');
  const moods = head.getMoodNames ? head.getMoodNames() : ['neutral', 'happy', 'sad', 'angry', 'love'];
  select.innerHTML = '';
  moods.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === AVATAR.avatarMood) opt.selected = true;
    select.appendChild(opt);
  });
}

// ── Small helpers ─────────────────────────────────────────────────────────

function setChip(text, cls = '') {
  ui.chip.textContent = text;
  ui.chip.className = `chip ${cls}`.trim();
}

function showSubtitle(line) {
  clearTimeout(subtitleTimer);
  const current = ui.subtitles.classList.contains('on') ? ui.subtitles.textContent : '';
  ui.subtitles.textContent = (current + line).slice(-160);
  ui.subtitles.classList.add('on');
  hideSubtitle(2600);
}

function hideSubtitle(delay) {
  clearTimeout(subtitleTimer);
  subtitleTimer = setTimeout(() => {
    ui.subtitles.classList.remove('on');
    ui.subtitles.textContent = '';
  }, delay);
}

function fmtDuration(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
