/* Transcript exporters.
 *
 * Everything is built as a plain string in the page and handed to the browser
 * as a Blob — no server round-trip, which matters for a tool whose whole point
 * is that your words stay on your machine.
 */

import { srtTime, vttTime, hms, stampDate, slug } from './format.js';

/** Merge adjacent segments from the same speaker into readable paragraphs. */
export function paragraphs(segments, gapS = 2.0) {
  const out = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (
      last &&
      last.speaker === s.speaker &&
      s.start - last.end <= gapS &&
      (last.text.length + s.text.length) < 900
    ) {
      last.text = (last.text + ' ' + s.text).replace(/\s+/g, ' ').trim();
      last.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

export function toText(session, { timestamps = true, speakers = true } = {}) {
  const segs = paragraphs(session.segments);
  return segs
    .map((s) => {
      const bits = [];
      if (timestamps) bits.push(`[${hms(s.start)}]`);
      if (speakers && s.speaker) bits.push(`${s.speaker}:`);
      bits.push(s.text);
      return bits.join(' ');
    })
    .join('\n\n');
}

export function toMarkdown(session, opts = {}) {
  const segs = paragraphs(session.segments);
  const head = [
    `# ${session.title || 'Transcript'}`,
    '',
    `*Recorded ${stampDate(session.createdAt)} · ${hms(session.duration || 0)} · ` +
      `${segs.length} passage${segs.length === 1 ? '' : 's'} · transcribed locally by Lunosia*`,
    ''
  ];
  if (session.notes) head.push('> ' + session.notes.replace(/\n/g, '\n> '), '');
  head.push('---', '');

  const body = segs.map((s) => {
    const label = s.speaker ? `**${s.speaker}** ` : '';
    return `${label}\`${hms(s.start)}\`\n\n${s.text}`;
  });

  return head.concat(body).join('\n\n') + '\n';
}

export function toSrt(session) {
  const segs = session.segments.filter((s) => s.text && s.text.trim());
  return segs
    .map((s, i) => {
      const label = s.speaker ? `${s.speaker}: ` : '';
      return `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${label}${s.text.trim()}\n`;
    })
    .join('\n');
}

export function toVtt(session) {
  const segs = session.segments.filter((s) => s.text && s.text.trim());
  const cues = segs.map((s, i) => {
    const label = s.speaker ? `<v ${s.speaker}>` : '';
    return `${i + 1}\n${vttTime(s.start)} --> ${vttTime(s.end)}\n${label}${s.text.trim()}\n`;
  });
  return 'WEBVTT\n\n' + cues.join('\n');
}

export function toJson(session) {
  return JSON.stringify(
    {
      title: session.title,
      createdAt: session.createdAt,
      duration: session.duration,
      source: session.source,
      model: session.model,
      language: session.language,
      generator: 'Lunosia (local Whisper)',
      segments: session.segments.map((s) => ({
        start: s.start, end: s.end, speaker: s.speaker || null,
        text: s.text, words: s.words || undefined
      }))
    },
    null,
    2
  );
}

const FORMATS = {
  txt:  { fn: toText,     mime: 'text/plain;charset=utf-8',       ext: 'txt' },
  md:   { fn: toMarkdown, mime: 'text/markdown;charset=utf-8',    ext: 'md' },
  srt:  { fn: toSrt,      mime: 'application/x-subrip;charset=utf-8', ext: 'srt' },
  vtt:  { fn: toVtt,      mime: 'text/vtt;charset=utf-8',         ext: 'vtt' },
  json: { fn: toJson,     mime: 'application/json;charset=utf-8', ext: 'json' }
};

export function render(session, format, opts) {
  const f = FORMATS[format];
  if (!f) throw new Error('Unknown export format: ' + format);
  return { body: f.fn(session, opts), mime: f.mime, ext: f.ext };
}

export function filenameFor(session, ext) {
  const d = new Date(session.createdAt || Date.now());
  const p = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `lunosia-${date}-${slug(session.title)}.${ext}`;
}

export const FORMAT_LIST = Object.keys(FORMATS);
