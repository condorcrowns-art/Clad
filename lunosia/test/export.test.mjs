/* Exporter tests. Run: node test/export.test.mjs
 * These run in plain node — the exporters are deliberately free of DOM and
 * chrome.* so the formatting can be verified without a browser. */

import assert from 'node:assert/strict';
import { render, paragraphs, toSrt, toVtt, filenameFor } from '../src/export.js';
import { hms, srtTime, vttTime } from '../src/format.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('  ok  ' + name); };

const session = {
  title: 'Design review — audio pipeline',
  createdAt: Date.UTC(2026, 8, 7, 12, 0, 0),
  duration: 95.5,
  source: 'tab',
  model: 'base',
  language: 'en',
  segments: [
    { start: 0.0,  end: 3.2,  text: 'Right, can everyone hear me?', speaker: 'Speaker 1' },
    { start: 3.4,  end: 6.0,  text: 'Yes, coming through clearly.', speaker: 'Speaker 1' },
    { start: 12.0, end: 18.4, text: 'Let us start with the capture path.', speaker: 'Speaker 2' },
    { start: 61.0, end: 65.25, text: 'Agreed, ship it.', speaker: 'Speaker 2' }
  ]
};

console.log('format helpers');
t('hms under an hour omits the hour field', () => {
  assert.equal(hms(73.4), '1:13');
  assert.equal(hms(0), '0:00');
});
t('hms past an hour includes it', () => assert.equal(hms(3725), '1:02:05'));
t('srt timestamps use a comma', () => assert.equal(srtTime(73.4), '00:01:13,400'));
t('vtt timestamps use a dot', () => assert.equal(vttTime(73.4), '00:01:13.400'));
t('millisecond rounding does not overflow', () => assert.equal(srtTime(1.9999), '00:00:02,000'));

console.log('paragraph merging');
t('adjacent same-speaker segments merge', () => {
  const p = paragraphs(session.segments);
  assert.equal(p[0].text, 'Right, can everyone hear me? Yes, coming through clearly.');
  assert.equal(p[0].end, 6.0);
});
t('a long gap breaks the paragraph', () => {
  const p = paragraphs(session.segments);
  assert.equal(p.length, 3, 'expected 3 paragraphs, got ' + p.length);
});
t('a speaker change breaks the paragraph', () => {
  const p = paragraphs([
    { start: 0, end: 1, text: 'A one.', speaker: 'S1' },
    { start: 1.1, end: 2, text: 'B two.', speaker: 'S2' }
  ]);
  assert.equal(p.length, 2);
});

console.log('exporters');
t('srt is well formed and 1-indexed', () => {
  const s = toSrt(session);
  assert.match(s, /^1\n00:00:00,000 --> 00:00:03,200\nSpeaker 1: Right, can everyone hear me\?\n/);
  assert.equal((s.match(/-->/g) || []).length, 4);
  assert.ok(!/^0\n/m.test(s), 'srt indices must start at 1');
});
t('vtt carries the WEBVTT header and voice spans', () => {
  const v = toVtt(session);
  assert.ok(v.startsWith('WEBVTT\n'));
  assert.match(v, /<v Speaker 1>Right, can everyone hear me\?/);
});
t('text export carries timestamps and speakers', () => {
  const { body } = render(session, 'txt');
  assert.match(body, /^\[0:00\] Speaker 1: Right, can everyone/);
});
t('text export can drop timestamps', () => {
  const { body } = render(session, 'txt', { timestamps: false });
  assert.ok(!body.includes('[0:00]'));
});
t('markdown has a title and attribution', () => {
  const { body } = render(session, 'md');
  assert.match(body, /^# Design review — audio pipeline/);
  assert.match(body, /transcribed locally by Lunosia/);
});
t('json round-trips and keeps every segment', () => {
  const { body } = render(session, 'json');
  const back = JSON.parse(body);
  assert.equal(back.segments.length, 4);
  assert.equal(back.generator, 'Lunosia (local Whisper)');
});
t('empty segments are skipped by subtitle formats', () => {
  const s = toSrt({ ...session, segments: [...session.segments, { start: 70, end: 71, text: '   ' }] });
  assert.equal((s.match(/-->/g) || []).length, 4);
});
t('unknown format is rejected loudly', () => {
  assert.throws(() => render(session, 'docx'), /Unknown export format/);
});
t('filenames are dated and slugged', () => {
  const f = filenameFor(session, 'md');
  assert.match(f, /^lunosia-2026090\d-design-review-audio-pipeline\.md$/);
});
t('an empty transcript still exports without throwing', () => {
  const empty = { ...session, segments: [] };
  for (const fmt of ['txt', 'md', 'srt', 'vtt', 'json']) render(empty, fmt);
});

console.log(`\n${pass} assertions passed.`);
