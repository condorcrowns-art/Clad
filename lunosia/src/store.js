/* Session storage.
 *
 * chrome.storage.local, one record per session plus a lightweight index so the
 * session list can render without deserialising every transcript. Writes are
 * debounced because a live recording appends a segment every few seconds and
 * storage.local is not free.
 */

const INDEX_KEY = 'lunosia:index';
const KEY = (id) => 'lunosia:session:' + id;
const SETTINGS_KEY = 'lunosia:settings';

export const DEFAULT_SETTINGS = {
  engine: 'local',
  model: 'base',
  language: 'en',
  task: 'transcribe',
  serverUrl: 'http://127.0.0.1:8080/inference',
  showTimestamps: true,
  autoScroll: true,
  speakerLabels: false
};

export async function getSettings() {
  const o = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(o[SETTINGS_KEY] || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/* ------------------------------------------------------------- index -- */

export async function listSessions() {
  const o = await chrome.storage.local.get(INDEX_KEY);
  return (o[INDEX_KEY] || []).sort((a, b) => b.createdAt - a.createdAt);
}

async function writeIndex(entries) {
  await chrome.storage.local.set({ [INDEX_KEY]: entries });
}

async function touchIndex(session) {
  const idx = (await listSessions()).filter((e) => e.id !== session.id);
  idx.unshift({
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    duration: session.duration,
    source: session.source,
    segments: session.segments.length,
    preview: (session.segments[0]?.text || '').slice(0, 90)
  });
  await writeIndex(idx.slice(0, 200));
}

/* ---------------------------------------------------------- sessions -- */

export function blankSession(id, { source = 'tab', title = '', model = 'base', language = 'en' } = {}) {
  return {
    id,
    title: title || 'Untitled transcript',
    createdAt: Date.now(),
    duration: 0,
    source,
    model,
    language,
    notes: '',
    segments: []
  };
}

export async function getSession(id) {
  const o = await chrome.storage.local.get(KEY(id));
  return o[KEY(id)] || null;
}

let flushTimer = null;
let dirty = new Map();

export async function saveSession(session, { immediate = false } = {}) {
  dirty.set(session.id, session);
  if (immediate) return flush();
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 1200);
}

async function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  const batch = {};
  const pending = [...dirty.values()];
  dirty.clear();
  for (const s of pending) batch[KEY(s.id)] = s;
  if (!pending.length) return;
  await chrome.storage.local.set(batch);
  for (const s of pending) await touchIndex(s);
}

export async function deleteSession(id) {
  await chrome.storage.local.remove(KEY(id));
  await writeIndex((await listSessions()).filter((e) => e.id !== id));
}

export async function renameSession(id, title) {
  const s = await getSession(id);
  if (!s) return null;
  s.title = title;
  await saveSession(s, { immediate: true });
  return s;
}

/** Rough storage accounting so the UI can warn before Chrome does. */
export async function usage() {
  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    return { bytes, mb: (bytes / 1048576).toFixed(1) };
  } catch (_) {
    return { bytes: 0, mb: '0.0' };
  }
}
