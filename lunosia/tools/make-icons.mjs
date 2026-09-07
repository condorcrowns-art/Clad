/* Renders the Lunosia crescent to PNG at every size the manifest asks for.
 * Pure node + zlib, no image library — keeps the repo dependency-free and the
 * icons reproducible from source rather than checked in as opaque binaries. */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const SIZES = [16, 32, 48, 128];

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* Supersampled coverage so the curves are not staircases at 16px. */
function coverage(px, py, size, fn, ss = 4) {
  let hits = 0;
  for (let sy = 0; sy < ss; sy++)
    for (let sx = 0; sx < ss; sx++)
      if (fn((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size)) hits++;
  return hits / (ss * ss);
}

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/* Rounded square background, crescent moon knocked out of a filled disc. */
const bg = (x, y) => {
  const r = 0.22, lo = r, hi = 1 - r;
  const cx = Math.min(Math.max(x, lo), hi);
  const cy = Math.min(Math.max(y, lo), hi);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const moon = (x, y) => inCircle(x, y, 0.46, 0.5, 0.30) && !inCircle(x, y, 0.60, 0.40, 0.28);

const BG = [17, 19, 28];        // near-black plate
const FG = [168, 151, 255];     // Lunosia violet

mkdirSync('icons', { recursive: true });

for (const size of SIZES) {
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const aBg = coverage(x, y, size, bg);
      const aMoon = coverage(x, y, size, moon);
      // Composite the moon over the plate, then the plate over transparency.
      const m = Math.min(aMoon, aBg);
      const r = BG[0] * (1 - m) + FG[0] * m;
      const g = BG[1] * (1 - m) + FG[1] * m;
      const b = BG[2] * (1 - m) + FG[2] * m;
      buf[i] = Math.round(r); buf[i + 1] = Math.round(g); buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(aBg * 255);
    }
  }
  writeFileSync(`icons/${size}.png`, png(size, size, buf));
  console.log(`icons/${size}.png`);
}
