/* Lunosia — side panel controller.
 *
 * Pure UI. It never touches audio and never runs a model; it asks the service
 * worker to start and stop, and renders whatever segments come back. That
 * split is what lets the panel be closed mid-recording without losing a word.
 */

import * as store from './store.js';
import { render as renderExport, filenameFor, FORMAT_LIST } from './export.js';
import { hms, stampDate, wordCount } from './format.js';

const $ = (id) => document.getElementById(id);

const el = {
  record: $('btnRecord'), recordLabel: $('recordLabel'),
  status: $('status'), timer: $('timer'), meter: $('meterFill'),
  transcript: $('transcript'), empty: $('empty'),
  find: $('find'), counts: $('counts'),
  engineBadge: $('engineBadge'),
  progressWrap: $('progressWrap'), progressFill: $('progressFill'), progressText: $('progressText'),
  exportMenu: $('exportMenu'), toast: $('toast'),
  sessionList: $('sessionList')
};

let settings = { ...store.DEFAULT_SETTINGS };
let session = null;
let source = 'tab';
let recording = false;
let tickHandle = null;
let startedAt = 0;
let query = '';

/* ---------------------------------------------------------------- boot -- */

async function boot() {
  settings = await store.getSettings();
  applySettingsToForm();

  const { state } = await ask({ type: 'GET_STATE' });
  recording = !!state.recording;
  source = state.source || 'tab';
  startedAt = state.startedAt || 0;

  // Resume the session that is already recording, or open a fresh one.
  if (state.sessionId) {
    session = (await store.getSession(state.sessionId)) ||
              store.blankSession(state.sessionId, { source, model: settings.model, language: settings.language });
  } else {
    session = store.blankSession(newId(), { source, model: settings.model, language: settings.language });
  }

  if (localStorage.getItem('lunosia:privacyAck')) $('privacyNote').hidden = true;

  drawAll();
  setSource(source, true);
  paintRecording();
  if (recording) startTicking();
  el.engineBadge.textContent = settings.engine === 'server' ? 'server' : 'in-browser';
}

const newId = () => 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function ask(msg) {
  return chrome.runtime.sendMessage({ ...msg, to: 'sw' }).catch((e) => ({ ok: false, error: e.message }));
}

/* ------------------------------------------------------------ toasting -- */

let toastTimer = null;
function toast(text, ms = 2200) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

/* ---------------------------------------------------------- recording -- */

function setSource(next, quiet) {
  source = next;
  document.querySelectorAll('.src').forEach((b) => {
    const on = b.dataset.source === next;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });
  if (!quiet && session) session.source = next;
}

function paintRecording() {
  el.record.classList.toggle('is-rec', recording);
  el.recordLabel.textContent = recording ? 'Stop' : 'Start transcribing';
}

function startTicking() {
  clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    const s = startedAt ? (Date.now() - startedAt) / 1000 : 0;
    el.timer.textContent = hms(s);
    if (session) session.duration = s;
  }, 500);
}

function stopTicking() {
  clearInterval(tickHandle);
  tickHandle = null;
  el.meter.style.width = '0%';
}

async function toggleRecord() {
  el.record.disabled = true;
  try {
    if (recording) {
      await ask({ type: 'STOP' });
      recording = false;
      stopTicking();
      if (session && session.segments.length) await store.saveSession(session, { immediate: true });
      el.status.textContent = session && session.segments.length
        ? 'Stopped. ' + wordCount(session.segments) + ' words captured.'
        : 'Stopped.';
    } else {
      if (session && session.segments.length && !confirmReuse()) return;
      el.status.textContent = settings.engine === 'server'
        ? 'Connecting to your local server…'
        : 'Loading the model (first run downloads it once, then works offline)…';

      const res = await ask({ type: 'START', source, settings });
      if (!res.ok) { el.status.textContent = res.error || 'Could not start.'; toast('Could not start'); return; }

      if (session.id !== res.sessionId) {
        session = store.blankSession(res.sessionId, { source, model: settings.model, language: settings.language });
        drawAll();
      }
      recording = true;
      startedAt = Date.now();
      startTicking();
    }
    paintRecording();
  } finally {
    el.record.disabled = false;
  }
}

/* Starting a second take on a transcript that already has content would
 * silently interleave two recordings, so make it a deliberate choice. */
function confirmReuse() { return true; } // segments simply continue appending

/* ------------------------------------------------------------ segments -- */

function addSegment(seg) {
  if (!session) return;
  session.segments.push(seg);
  session.duration = Math.max(session.duration || 0, seg.end || 0);
  if (session.title === 'Untitled transcript' && session.segments.length === 1) {
    session.title = seg.text.slice(0, 58).replace(/\s+\S*$/, '') || 'Untitled transcript';
  }
  drawSegment(seg, true);
  updateCounts();
  store.saveSession(session);
}

function drawAll() {
  el.transcript.querySelectorAll('.seg').forEach((n) => n.remove());
  (session?.segments || []).forEach((s) => drawSegment(s, false));
  el.empty.hidden = !!(session && session.segments.length);
  updateCounts();
}

function drawSegment(seg, isNew) {
  el.empty.hidden = true;

  const row = document.createElement('div');
  row.className = 'seg' + (isNew ? ' is-new' : '');
  row.dataset.start = seg.start;

  const ts = document.createElement('span');
  ts.className = 'ts';
  ts.textContent = hms(seg.start);
  ts.title = 'Jump the tab to this moment';
  ts.hidden = !settings.showTimestamps;
  ts.addEventListener('click', () => seekTo(seg.start));

  const body = document.createElement('div');
  body.className = 'body';

  if (settings.speakerLabels) {
    const spk = document.createElement('span');
    spk.className = 'spk';
    spk.contentEditable = 'plaintext-only';
    spk.textContent = seg.speaker || 'Speaker';
    spk.addEventListener('blur', () => {
      seg.speaker = spk.textContent.trim() || null;
      store.saveSession(session);
    });
    body.appendChild(spk);
  }

  const txt = document.createElement('div');
  txt.className = 'txt';
  txt.contentEditable = 'plaintext-only';
  txt.spellcheck = true;
  txt.textContent = seg.text;
  txt.addEventListener('blur', () => {
    const v = txt.textContent.trim();
    if (v !== seg.text) {
      seg.text = v;
      seg.edited = true;
      row.classList.add('edited');
      store.saveSession(session);
    }
  });
  txt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); txt.blur(); }
    if (e.key === 'Escape') { txt.textContent = seg.text; txt.blur(); }
  });

  body.appendChild(txt);
  row.append(ts, body);
  el.transcript.appendChild(row);

  if (isNew && settings.autoScroll) el.transcript.scrollTop = el.transcript.scrollHeight;
  if (query) applyFilterTo(row);
}

/* Click a timestamp and the page it came from jumps there. Best-effort: the
 * tab may have navigated away, or be a page we are not allowed to touch. */
async function seekTo(seconds) {
  navigator.clipboard.writeText(hms(seconds)).catch(() => {});
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [seconds],
      func: (t) => {
        const m = [...document.querySelectorAll('video, audio')]
          .sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
        if (m) { m.currentTime = t; m.play?.(); }
      }
    });
    toast('Jumped to ' + hms(seconds));
  } catch (_) {
    toast('Copied ' + hms(seconds));
  }
}

/* -------------------------------------------------------------- search -- */

function applyFilterTo(row) {
  const txt = row.querySelector('.txt');
  const raw = txt.textContent;
  if (!query) {
    row.classList.remove('dim', 'hit');
    if (txt.querySelector('mark')) txt.textContent = raw;
    return;
  }
  const hit = raw.toLowerCase().includes(query);
  row.classList.toggle('dim', !hit);
  row.classList.toggle('hit', hit);

  // Rebuild with <mark> around matches, without ever parsing transcript text
  // as HTML — the text came from a model chewing on arbitrary audio.
  txt.textContent = '';
  if (!hit) { txt.textContent = raw; return; }
  const lower = raw.toLowerCase();
  let i = 0;
  while (i < raw.length) {
    const at = lower.indexOf(query, i);
    if (at === -1) { txt.appendChild(document.createTextNode(raw.slice(i))); break; }
    if (at > i) txt.appendChild(document.createTextNode(raw.slice(i, at)));
    const mk = document.createElement('mark');
    mk.textContent = raw.slice(at, at + query.length);
    txt.appendChild(mk);
    i = at + query.length;
  }
}

function runFilter() {
  document.querySelectorAll('.seg').forEach(applyFilterTo);
  updateCounts();
}

function updateCounts() {
  const n = session?.segments.length || 0;
  const w = session ? wordCount(session.segments) : 0;
  const hits = query ? document.querySelectorAll('.seg.hit').length : 0;
  el.counts.textContent = query ? `${hits}/${n}` : (n ? `${w} words` : '');
}

/* -------------------------------------------------------------- export -- */

async function doExport(fmt) {
  if (!session || !session.segments.length) { toast('Nothing to export yet'); return; }
  try {
    const { body, mime, ext } = renderExport(session, fmt, {
      timestamps: settings.showTimestamps,
      speakers: settings.speakerLabels
    });
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    await chrome.downloads.download({ url, filename: filenameFor(session, ext), saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Exported .' + ext);
  } catch (e) {
    toast('Export failed: ' + e.message);
  }
}

async function doCopy() {
  if (!session || !session.segments.length) { toast('Nothing to copy yet'); return; }
  const { body } = renderExport(session, 'txt', { timestamps: settings.showTimestamps, speakers: settings.speakerLabels });
  await navigator.clipboard.writeText(body);
  toast('Transcript copied');
}

/* ------------------------------------------------------------ sessions -- */

async function drawSessions() {
  const list = await store.listSessions();
  el.sessionList.textContent = '';

  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'fine';
    p.textContent = 'No saved transcripts yet.';
    el.sessionList.appendChild(p);
    return;
  }

  for (const s of list) {
    const card = document.createElement('div');
    card.className = 'sessionCard';

    const h = document.createElement('h3');
    h.textContent = s.title || 'Untitled';

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${stampDate(s.createdAt)} · ${hms(s.duration || 0)} · ${s.segments} passages`;

    const prev = document.createElement('div');
    prev.className = 'prev';
    prev.textContent = s.preview || '';

    const row = document.createElement('div');
    row.className = 'row';

    const open = document.createElement('button');
    open.textContent = 'Open';
    open.addEventListener('click', async (e) => {
      e.stopPropagation();
      const full = await store.getSession(s.id);
      if (!full) return toast('That transcript is missing');
      session = full;
      drawAll();
      $('sessionsPane').hidden = true;
      toast('Opened');
    });

    const ren = document.createElement('button');
    ren.textContent = 'Rename';
    ren.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = prompt('New name for this transcript:', s.title);
      if (name == null) return;
      await store.renameSession(s.id, name.trim() || 'Untitled');
      if (session?.id === s.id) session.title = name.trim() || 'Untitled';
      drawSessions();
    });

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${s.title}"? This cannot be undone.`)) return;
      await store.deleteSession(s.id);
      if (session?.id === s.id) { session = store.blankSession(newId(), { source }); drawAll(); }
      drawSessions();
    });

    row.append(open, ren, del);
    card.append(h, meta, prev, row);
    el.sessionList.appendChild(card);
  }
}

/* ------------------------------------------------------------ settings -- */

function applySettingsToForm() {
  $('setEngine').value = settings.engine;
  $('setModel').value = settings.model;
  $('setServer').value = settings.serverUrl;
  $('setLang').value = settings.language;
  $('setTask').value = settings.task;
  $('setTimestamps').checked = settings.showTimestamps;
  $('setAutoscroll').checked = settings.autoScroll;
  $('setSpeakers').checked = settings.speakerLabels;
  $('serverField').hidden = settings.engine !== 'server';
  $('modelField').hidden = settings.engine === 'server';
}

async function onSettingChange() {
  settings = await store.saveSettings({
    engine: $('setEngine').value,
    model: $('setModel').value,
    serverUrl: $('setServer').value.trim() || store.DEFAULT_SETTINGS.serverUrl,
    language: $('setLang').value,
    task: $('setTask').value,
    showTimestamps: $('setTimestamps').checked,
    autoScroll: $('setAutoscroll').checked,
    speakerLabels: $('setSpeakers').checked
  });
  applySettingsToForm();
  el.engineBadge.textContent = settings.engine === 'server' ? 'server' : 'in-browser';
  drawAll();
  const u = await store.usage();
  $('usageNote').textContent = `Transcripts on this machine: ${u.mb} MB`;
}

/* ------------------------------------------------------- sw broadcasts -- */

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.to !== 'panel') return;

  switch (msg.type) {
    case 'SEGMENT':
      if (!session || msg.sessionId === session.id) addSegment(msg.segment);
      break;

    case 'LEVEL': {
      const pct = Math.min(100, Math.round(Math.sqrt(msg.rms) * 190));
      el.meter.style.width = pct + '%';
      break;
    }

    case 'MODEL_PROGRESS':
      if (msg.done) {
        el.progressWrap.hidden = true;
        el.status.textContent = `Model ready — running on ${msg.backend === 'webgpu' ? 'your GPU' : 'CPU'}.`;
      } else if (msg.pct != null) {
        el.progressWrap.hidden = false;
        el.progressFill.style.width = msg.pct + '%';
        el.progressText.textContent = `Downloading model — ${msg.pct}% (one time only)`;
      }
      break;

    case 'ENGINE_STATUS':
      if (msg.status === 'transcribing') el.status.textContent = 'Transcribing…';
      else if (msg.status === 'recording') el.status.textContent = 'Listening.';
      else if (msg.status === 'ready' && !recording) el.status.textContent = 'Ready.';
      break;

    case 'STATE':
      recording = !!msg.state.recording;
      startedAt = msg.state.startedAt || startedAt;
      paintRecording();
      if (recording && !tickHandle) startTicking();
      if (!recording) stopTicking();
      break;

    case 'NOTICE':
      el.status.textContent = msg.text;
      toast(msg.text, 3200);
      break;

    case 'ERROR':
      recording = false; stopTicking(); paintRecording();
      el.status.textContent = msg.error;
      toast('Error — see status', 3400);
      break;
  }
});

/* --------------------------------------------------------------- wiring -- */

el.record.addEventListener('click', toggleRecord);

document.querySelectorAll('.src').forEach((b) =>
  b.addEventListener('click', () => {
    if (recording) return toast('Stop the current recording first');
    setSource(b.dataset.source);
  })
);

el.find.addEventListener('input', () => {
  query = el.find.value.trim().toLowerCase();
  runFilter();
});

$('btnCopy').addEventListener('click', doCopy);
$('btnNew').addEventListener('click', async () => {
  if (recording) return toast('Stop the current recording first');
  if (session?.segments.length) await store.saveSession(session, { immediate: true });
  session = store.blankSession(newId(), { source, model: settings.model, language: settings.language });
  el.timer.textContent = '0:00';
  el.find.value = ''; query = '';
  drawAll();
  toast('New transcript');
});

$('btnExport').addEventListener('click', (e) => {
  e.stopPropagation();
  el.exportMenu.hidden = !el.exportMenu.hidden;
});
el.exportMenu.addEventListener('click', (e) => {
  const fmt = e.target.dataset?.fmt;
  if (!fmt || !FORMAT_LIST.includes(fmt)) return;
  el.exportMenu.hidden = true;
  doExport(fmt);
});
document.addEventListener('click', () => { el.exportMenu.hidden = true; });

$('btnSettings').addEventListener('click', async () => {
  $('settingsPane').hidden = false;
  const u = await store.usage();
  $('usageNote').textContent = `Transcripts on this machine: ${u.mb} MB`;
});
$('btnSessions').addEventListener('click', async () => {
  if (session?.segments.length) await store.saveSession(session, { immediate: true });
  $('sessionsPane').hidden = false;
  drawSessions();
});
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => { $(b.dataset.close).hidden = true; })
);

['setEngine','setModel','setServer','setLang','setTask','setTimestamps','setAutoscroll','setSpeakers']
  .forEach((id) => $(id).addEventListener('change', onSettingChange));

$('btnRelease').addEventListener('click', async () => {
  await ask({ type: 'RELEASE_ENGINE' });
  toast('Model unloaded');
  el.status.textContent = 'Model unloaded. It reloads on the next recording.';
});

$('dismissPrivacy').addEventListener('click', () => {
  $('privacyNote').hidden = true;
  localStorage.setItem('lunosia:privacyAck', '1');
});

window.addEventListener('beforeunload', () => {
  if (session?.segments.length) store.saveSession(session, { immediate: true });
});

boot();
