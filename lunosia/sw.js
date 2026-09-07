/* Lunosia — service worker (MV3 orchestrator)
 *
 * The service worker owns no audio and no model. It cannot: MV3 workers have
 * no DOM, no getUserMedia, and get torn down whenever Chrome feels like it.
 * What it does own is coordination — it is the only context that can see both
 * the side panel (UI) and the offscreen document (capture + inference), so
 * every message between them goes through here.
 *
 *   side panel  <--runtime messages-->  SW  <--runtime messages-->  offscreen
 *      UI only                       router                  audio + Whisper
 *
 * State lives in chrome.storage.session so a worker respawn mid-recording
 * does not lose track of what is running.
 */

const OFFSCREEN_PATH = 'offscreen.html';

/* ---------------------------------------------------------------- state -- */

const DEFAULT_STATE = {
  recording: false,
  source: null,        // 'tab' | 'mic'
  sessionId: null,
  tabId: null,
  tabTitle: '',
  startedAt: 0,
  modelReady: false,
  status: 'idle'
};

async function getState() {
  const { swState } = await chrome.storage.session.get('swState');
  return { ...DEFAULT_STATE, ...(swState || {}) };
}

async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await chrome.storage.session.set({ swState: next });
  broadcast({ to: 'panel', type: 'STATE', state: next });
  return next;
}

/* Messages to the panel are best-effort: if no panel is open, sendMessage
 * rejects with "Receiving end does not exist". That is normal, not an error —
 * recording continues happily with the panel closed. */
function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/* ------------------------------------------------- offscreen lifecycle -- */

let creating = null;

async function hasOffscreen() {
  if (chrome.runtime.getContexts) {
    const ctx = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)]
    });
    return ctx.length > 0;
  }
  return false;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  if (creating) return creating;
  creating = chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['USER_MEDIA', 'WORKERS'],
    justification:
      'Captures tab or microphone audio and runs local Whisper speech recognition. ' +
      'Audio is processed in this document and never sent off the device.'
  });
  try { await creating; } finally { creating = null; }
}

async function closeOffscreen() {
  if (await hasOffscreen()) {
    try { await chrome.offscreen.closeDocument(); } catch (_) {}
  }
}

/* Round-trip a request into the offscreen document, starting it if needed. */
async function toOffscreen(msg) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ ...msg, to: 'offscreen' });
}

/* ------------------------------------------------------ start and stop -- */

async function startRecording({ source = 'tab', tabId = null, settings = {} } = {}) {
  const state = await getState();
  if (state.recording) return { ok: false, error: 'Already recording.' };

  let streamId = null;
  let title = '';

  if (source === 'tab') {
    const tab = tabId
      ? await chrome.tabs.get(tabId)
      : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

    if (!tab) return { ok: false, error: 'No tab to capture.' };
    if (/^(chrome|edge|about|chrome-extension|devtools):/i.test(tab.url || '')) {
      return {
        ok: false,
        error: 'Chrome blocks audio capture on browser-internal pages. Open a normal site and try again.'
      };
    }

    tabId = tab.id;
    title = tab.title || '';

    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    } catch (e) {
      return { ok: false, error: 'Could not capture this tab: ' + e.message };
    }
  }

  const sessionId = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const res = await toOffscreen({
    type: 'START',
    source,
    streamId,
    sessionId,
    settings
  }).catch((e) => ({ ok: false, error: e.message }));

  if (!res || !res.ok) {
    await closeOffscreen();
    return res || { ok: false, error: 'Capture engine did not start.' };
  }

  await setState({
    recording: true,
    source,
    sessionId,
    tabId,
    tabTitle: title,
    startedAt: Date.now(),
    status: 'recording'
  });

  return { ok: true, sessionId };
}

async function stopRecording() {
  const state = await getState();
  if (!state.recording) return { ok: true };

  await toOffscreen({ type: 'STOP' }).catch(() => {});
  await setState({ recording: false, source: null, status: 'idle' });
  // The offscreen document is kept alive briefly so the model stays warm for
  // the next take; it is closed on suspend or when the user unloads it.
  return { ok: true };
}

/* ---------------------------------------------------------- messaging -- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.to !== 'sw') return false;

  (async () => {
    switch (msg.type) {
      case 'START':
        sendResponse(await startRecording(msg));
        break;

      case 'STOP':
        sendResponse(await stopRecording());
        break;

      case 'GET_STATE':
        sendResponse({ ok: true, state: await getState() });
        break;

      case 'WARM_MODEL':
        await ensureOffscreen();
        sendResponse(await toOffscreen({ type: 'WARM_MODEL', settings: msg.settings }).catch((e) => ({ ok: false, error: e.message })));
        break;

      case 'RELEASE_ENGINE':
        await closeOffscreen();
        await setState({ modelReady: false, status: 'idle' });
        sendResponse({ ok: true });
        break;

      /* --- forwarded up from the offscreen document --- */
      case 'SEGMENT':
      case 'PARTIAL':
      case 'LEVEL':
      case 'MODEL_PROGRESS':
      case 'ENGINE_STATUS':
        broadcast({ ...msg, to: 'panel' });
        if (msg.type === 'ENGINE_STATUS' && msg.status) await setState({ status: msg.status });
        if (msg.type === 'MODEL_PROGRESS' && msg.done) await setState({ modelReady: true });
        sendResponse({ ok: true });
        break;

      case 'ENGINE_ERROR':
        broadcast({ to: 'panel', type: 'ERROR', error: msg.error });
        await setState({ recording: false, status: 'idle' });
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({ ok: false, error: 'Unknown message ' + msg.type });
    }
  })();

  return true; // async response
});

/* ------------------------------------------------------------- wiring -- */

chrome.runtime.onInstalled.addListener(async () => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await chrome.storage.session.set({ swState: DEFAULT_STATE });
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.storage.session.set({ swState: DEFAULT_STATE });
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-recording') return;
  const state = await getState();
  if (state.recording) await stopRecording();
  else await startRecording({ source: 'tab' });
});

/* If the captured tab goes away, stop rather than record silence forever. */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state.recording && state.source === 'tab' && state.tabId === tabId) {
    await stopRecording();
    broadcast({ to: 'panel', type: 'NOTICE', text: 'The captured tab was closed — recording stopped.' });
  }
});
