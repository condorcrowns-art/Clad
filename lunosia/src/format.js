/* Time and text formatting shared by the panel and the exporters. */

export function clamp(n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; }

/** 73.4 -> "1:13" ; 3725 -> "1:02:05" */
export function hms(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** SubRip wants "00:01:13,400" — comma before the milliseconds. */
export function srtTime(sec) {
  return stamp(sec, ',');
}

/** WebVTT wants the same thing with a dot. */
export function vttTime(sec) {
  return stamp(sec, '.');
}

function stamp(sec, sep) {
  // Work in whole milliseconds from the start. Formatting the seconds and the
  // fraction separately looks fine until a value like 1.9999 rounds its
  // fraction up to 1000 and emits "00:00:01,1000", which is not a legal
  // timestamp and breaks the whole subtitle file from that cue onward.
  let ms = Math.round(Math.max(0, sec || 0) * 1000);

  const h = Math.floor(ms / 3600000); ms -= h * 3600000;
  const m = Math.floor(ms / 60000);   ms -= m * 60000;
  const s = Math.floor(ms / 1000);    ms -= s * 1000;

  return (
    String(h).padStart(2, '0') + ':' +
    String(m).padStart(2, '0') + ':' +
    String(s).padStart(2, '0') + sep +
    String(ms).padStart(3, '0')
  );
}

/** "2026-09-07 14:03" — local, sortable, no library. */
export function stampDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function slug(s, fallback = 'transcript') {
  const out = (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return out || fallback;
}

export function wordCount(segments) {
  return segments.reduce((n, s) => n + (s.text ? s.text.trim().split(/\s+/).length : 0), 0);
}
