'use strict';
/* ============================================================
   GLITCHTOPIA — worlds: tile engine, generation, trees, tile FX
   ============================================================ */

// --- world-only tiles (not obtainable) ---
defItem('bedrock', { name: 'Bedrock', kind: 'block', hp: 9999, solid: true, unbreakable: true, noDrop: true, color: '#2a2f3a', color2: '#171b23', desc: 'The edge of the simulation.' });
defItem('magma',   { name: 'Magma', kind: 'block', hp: 8, solid: true, noDrop: true, color: '#ff5714', color2: '#992200', animated: true, fx: { damage: 18, glow: 4 }, desc: 'Hurts. Do not stand on.' });
defItem('corrupt', { name: 'Corrupted Data', kind: 'block', hp: 5, solid: true, noDrop: true, gemRich: true, color: '#7b2cbf', color2: '#4a1578', desc: 'Glitched blocks, dense with loose gems.' });
defItem('cloudb',  { name: 'Cloud Platform', kind: 'block', hp: 4, solid: true, noDrop: true, color: '#dfe7f5', color2: '#aab8d0', desc: 'Compressed vapor. Somehow solid.' });

function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

class World {
  constructor(id, name, w, h, theme) {
    this.id = id; this.name = name; this.w = w; this.h = h;
    this.theme = theme; // {sky:[c1,c2], bgWall, dark:0..1}
    this.tiles = new Array(w * h).fill(null);
    this.bg = new Uint8Array(w * h); // 1 = background wall behind
    this.meta = {};                  // idx -> {dir} for conveyors
    this.trees = new Map();          // idx -> {result, plantedAt, growTime, spliced}
    this.damage = new Map();         // idx -> {dmg, t}
    this.spawn = { x: 0, y: 0 };
    this.portals = [];               // {x, y (px), target, label, locked()}
    this.spawnPoints = [];           // tile coords for enemies
    this.enemyTypes = [];
    this.enemyCap = 0;
    this.bossZone = null;            // {x1 (px), spawnX, spawnY}
    this.isHome = false;
  }
  idx(tx, ty) { return ty * this.w + tx; }
  inB(tx, ty) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  get(tx, ty) { return this.inB(tx, ty) ? this.tiles[this.idx(tx, ty)] : 'bedrock'; }
  set(tx, ty, id) { if (this.inB(tx, ty)) this.tiles[this.idx(tx, ty)] = id; }
  item(tx, ty) { const t = this.get(tx, ty); return t ? ITEMS[t] : null; }
  isSolid(tx, ty) { const it = this.item(tx, ty); if (it && it.solid) return true; return this.trees.has(this.idx(tx, ty)) ? false : false; }
  solidAtPx(px, py) { return this.isSolid(Math.floor(px / TS), Math.floor(py / TS)); }

  // ---- trees ----
  plantSeed(tx, ty, seedId) {
    const i = this.idx(tx, ty);
    if (this.tiles[i] || this.trees.has(i)) return false;
    if (!this.isSolid(tx, ty + 1)) return false;
    const seed = ITEMS[seedId];
    this.trees.set(i, { result: seed.grows, plantedAt: Date.now(), growTime: seed.growTime, spliced: false });
    return true;
  }
  spliceTree(tx, ty, seedId) {
    const i = this.idx(tx, ty);
    const tr = this.trees.get(i);
    if (!tr || this.treeReady(tr)) return 'no';
    const seed = ITEMS[seedId];
    if (seed.grows === tr.result) return 'same';
    const res = spliceResult(tr.result, seed.grows);
    if (!res) return 'fail';
    const resSeed = ITEMS[res + '_seed'];
    this.trees.set(i, { result: res, plantedAt: Date.now(), growTime: resSeed ? resSeed.growTime : 90, spliced: true });
    return res;
  }
  treeReady(tr) { return Date.now() - tr.plantedAt >= tr.growTime * 1000; }
  treeProgress(tr) { return Math.min(1, (Date.now() - tr.plantedAt) / (tr.growTime * 1000)); }

  // ---- block damage (regenerates like Growtopia) ----
  hitTile(tx, ty, power, game) {
    const it = this.item(tx, ty);
    if (!it || it.unbreakable) return false;
    const i = this.idx(tx, ty);
    let d = this.damage.get(i);
    if (!d || performance.now() - d.t > 3500) d = { dmg: 0, t: 0 };
    d.dmg += power; d.t = performance.now();
    this.damage.set(i, d);
    game.fx.tileHit(tx, ty, it);
    if (d.dmg >= it.hp) {
      this.breakTile(tx, ty, game);
      return true;
    }
    return false;
  }
  breakTile(tx, ty, game, silent) {
    const it = this.item(tx, ty);
    if (!it || it.unbreakable) return;
    const i = this.idx(tx, ty);
    this.tiles[i] = null;
    this.damage.delete(i);
    delete this.meta[i];
    if (!silent) game.fx.tileBreak(tx, ty, it);
    const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
    if (!it.noDrop) {
      if (Math.random() < 0.33) game.spawnDrop(cx, cy, it.id, 1);
      if (Math.random() < 0.16 && ITEMS[it.id + '_seed']) game.spawnDrop(cx, cy, it.id + '_seed', 1);
    }
    const gemChance = it.gemRich ? 0.65 : 0.2;
    if (Math.random() < gemChance) game.spawnGems(cx, cy, 1 + Math.floor(Math.random() * (it.gemRich ? 4 : 3)));
  }
  harvestTree(tx, ty, game) {
    const i = this.idx(tx, ty);
    const tr = this.trees.get(i);
    if (!tr) return false;
    const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
    if (!this.treeReady(tr)) { // chopping an ungrown tree destroys it, returns nothing (Growtopia rules)
      this.trees.delete(i);
      game.fx.puff(cx, cy, '#7d93b3');
      game.toast('Sapling destroyed — it wasn\'t ready.', 'warn');
      return true;
    }
    const n = 1 + Math.floor(Math.random() * 3);
    game.spawnDrop(cx, cy, tr.result, n);
    if (Math.random() < 0.45) game.spawnDrop(cx, cy, tr.result + '_seed', 1);
    if (Math.random() < 0.15) game.spawnDrop(cx, cy, tr.result + '_seed', 1);
    game.spawnGems(cx, cy, 1 + Math.floor(Math.random() * 2));
    this.trees.delete(i);
    game.fx.harvest(cx, cy, ITEMS[tr.result].color || '#8f8');
    game.sfx.play('harvest');
    return true;
  }

  // ---- per-frame world logic: sentries, decay ----
  update(dt, game) {
    this._sentryT = (this._sentryT || 0) - dt;
    if (this._sentryT <= 0) {
      this._sentryT = 0.8;
      for (let i = 0; i < this.tiles.length; i++) {
        const t = this.tiles[i];
        if (t !== 'sentry') continue;
        const tx = i % this.w, ty = Math.floor(i / this.w);
        const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
        let best = null, bd = 8 * TS;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - cx, e.y - cy);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          const a = Math.atan2(best.y - cy, best.x - cx);
          game.projectiles.push(new Projectile(cx, cy, Math.cos(a) * 560, Math.sin(a) * 560, 12, true, '#ff9e6d'));
          game.sfx.play('sentry');
        }
      }
    }
  }

  teleportTargets() {
    const out = [];
    for (let i = 0; i < this.tiles.length; i++) if (this.tiles[i] === 'teleporter') out.push(i);
    return out;
  }

  /* ============ RENDERING ============ */
  draw(ctx, cam, time, game) {
    const { w: vw, h: vh } = cam.view;
    // sky
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, this.theme.sky[0]); g.addColorStop(1, this.theme.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    // parallax grid scanlines for digital vibe
    ctx.globalAlpha = 0.05; ctx.strokeStyle = '#6ee7ff'; ctx.lineWidth = 1;
    const gs = 64, ox = -(cam.x * 0.3) % gs, oy = -(cam.y * 0.3) % gs;
    ctx.beginPath();
    for (let x = ox; x < vw; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, vh); }
    for (let y = oy; y < vh; y += gs) { ctx.moveTo(0, y); ctx.lineTo(vw, y); }
    ctx.stroke(); ctx.globalAlpha = 1;

    const x0 = Math.max(0, Math.floor(cam.x / TS)), x1 = Math.min(this.w - 1, Math.ceil((cam.x + vw) / TS));
    const y0 = Math.max(0, Math.floor(cam.y / TS)), y1 = Math.min(this.h - 1, Math.ceil((cam.y + vh) / TS));

    // background walls
    ctx.fillStyle = this.theme.bgWall;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.bg[this.idx(tx, ty)]) ctx.fillRect(tx * TS - cam.x, ty * TS - cam.y, TS, TS);
    }

    // tiles
    const glows = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const i = this.idx(tx, ty);
      const t = this.tiles[i];
      const sx = tx * TS - cam.x, sy = ty * TS - cam.y;
      if (t) {
        this.drawTile(ctx, t, tx, ty, sx, sy, time, game);
        const it = ITEMS[t];
        if (it.fx && it.fx.glow) glows.push([sx + TS / 2, sy + TS / 2, it.fx.glow * TS, it.color]);
        // crack overlay
        const d = this.damage.get(i);
        if (d && performance.now() - d.t < 3500) {
          const frac = Math.min(1, d.dmg / it.hp);
          ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5;
          ctx.beginPath();
          const n = Math.ceil(frac * 4);
          for (let k = 0; k < n; k++) {
            const a = hash2(tx * 7 + k, ty * 13) * 6.28;
            ctx.moveTo(sx + TS / 2, sy + TS / 2);
            ctx.lineTo(sx + TS / 2 + Math.cos(a) * TS * 0.45 * frac * (0.6 + 0.4 * hash2(tx + k, ty + k)), sy + TS / 2 + Math.sin(a) * TS * 0.45 * frac);
          }
          ctx.stroke();
        }
      }
      const tr = this.trees.get(i);
      if (tr) this.drawTree(ctx, tr, sx, sy, time);
    }

    // portals
    for (const p of this.portals) {
      const sx = p.x - cam.x, sy = p.y - cam.y;
      if (sx < -80 || sx > vw + 80) continue;
      const locked = p.locked && p.locked();
      const col = locked ? '#44506b' : (p.color || '#c77dff');
      const pulse = 1 + Math.sin(time * 3 + p.x) * 0.08;
      ctx.save(); ctx.translate(sx, sy);
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(0, -TS, TS * 0.65 * pulse, TS * 1.05 * pulse, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = locked ? 0.15 : 0.35; ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(0, -TS, TS * 0.5 * pulse, TS * 0.9 * pulse, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = locked ? '#5b7395' : '#eaf4ef';
      ctx.fillText(locked ? '🔒 ' + p.label : p.label, 0, p.labelUp ? -TS * 3.1 : -TS * 2.4);
      if (!locked) { ctx.fillStyle = '#5b7395'; ctx.fillText('[W]', 0, TS * 0.6); }
      ctx.restore();
      if (!locked) glows.push([sx, sy - TS, 3.2 * TS, col]);
    }

    // glow pass
    if (glows.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const [gx, gy, r, col] of glows) {
        const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00');
        ctx.fillStyle = gr; ctx.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
      ctx.restore();
    }

    // darkness vignette per theme
    if (this.theme.dark) {
      ctx.fillStyle = 'rgba(2,4,10,' + this.theme.dark * 0.25 + ')';
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  drawTile(ctx, id, tx, ty, sx, sy, time, game) {
    const it = ITEMS[id];
    ctx.fillStyle = it.color; ctx.fillRect(sx, sy, TS, TS);
    if (it.transparent) { ctx.clearRect(sx + 3, sy + 3, TS - 6, TS - 6); ctx.fillStyle = it.color + '44'; ctx.fillRect(sx + 3, sy + 3, TS - 6, TS - 6); }
    // deterministic noise
    ctx.fillStyle = it.color2;
    for (let k = 0; k < 4; k++) {
      const nx = Math.floor(hash2(tx * 3 + k, ty * 5 + k) * (TS - 8)), ny = Math.floor(hash2(tx * 5 + k, ty * 3 - k) * (TS - 8));
      ctx.fillRect(sx + nx + 2, sy + ny + 2, 5, 5);
    }
    // bevel
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(sx, sy, TS, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx, sy + TS - 3, TS, 3);
    // special decorations
    const fx = it.fx;
    if (!fx && !it.animated) return;
    if (id === 'spring_pad') {
      ctx.strokeStyle = '#0d1526'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(sx + 6, sy + 10 + k * 7); ctx.lineTo(sx + TS - 6, sy + 10 + k * 7); } ctx.stroke();
    } else if (id === 'conveyor') {
      const dir = (this.meta[this.idx(tx, ty)] || {}).dir || 1;
      const off = ((time * 40 * dir) % 12 + 12) % 12;
      ctx.fillStyle = '#2de2a3';
      for (let k = -1; k < 3; k++) {
        const ax = sx + k * 12 + off;
        if (ax < sx || ax > sx + TS - 8) continue;
        ctx.beginPath();
        if (dir > 0) { ctx.moveTo(ax, sy + 8); ctx.lineTo(ax + 7, sy + 14); ctx.lineTo(ax, sy + 20); }
        else { ctx.moveTo(ax + 7, sy + 8); ctx.lineTo(ax, sy + 14); ctx.lineTo(ax + 7, sy + 20); }
        ctx.fill();
      }
    } else if (id === 'spike_trap') {
      ctx.fillStyle = '#e8ecf4';
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(sx + 4 + k * 10, sy + TS - 4); ctx.lineTo(sx + 9 + k * 10, sy + 4); ctx.lineTo(sx + 14 + k * 10, sy + TS - 4); ctx.fill(); }
    } else if (id === 'teleporter') {
      const a = time * 2 + tx;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2, 8 + Math.sin(a) * 3, a, a + 4.5); ctx.stroke();
    } else if (id === 'repair_node') {
      const p = 0.7 + Math.sin(time * 4) * 0.3;
      ctx.globalAlpha = p; ctx.fillStyle = '#fff';
      ctx.fillRect(sx + TS / 2 - 3, sy + 7, 6, 18); ctx.fillRect(sx + 7, sy + TS / 2 - 3, 18, 6);
      ctx.globalAlpha = 1;
    } else if (id === 'sentry') {
      ctx.fillStyle = '#1c2536'; ctx.fillRect(sx + 8, sy + 4, 16, 10);
      ctx.fillStyle = '#ff4d6d'; ctx.fillRect(sx + 14, sy + 7, 4, 4);
    } else if (id === 'firewall_block' || id === 'magma') {
      ctx.fillStyle = 'rgba(255,220,80,' + (0.3 + 0.3 * Math.sin(time * 8 + tx * 2 + ty)) + ')';
      for (let k = 0; k < 3; k++) {
        const fh = 8 + hash2(tx + k, ty) * 10 + Math.sin(time * 6 + k * 2 + tx) * 4;
        ctx.beginPath(); ctx.moveTo(sx + 4 + k * 11, sy + TS); ctx.lineTo(sx + 9 + k * 11, sy + TS - fh); ctx.lineTo(sx + 14 + k * 11, sy + TS); ctx.fill();
      }
    } else if (id === 'trophy_core') {
      const p = 0.6 + Math.sin(time * 3) * 0.4;
      ctx.globalAlpha = p; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2, 7, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
  }

  drawTree(ctx, tr, sx, sy, time) {
    const prog = this.treeProgress(tr);
    const ready = this.treeReady(tr);
    const col = ITEMS[tr.result] ? ITEMS[tr.result].color : '#8f8';
    ctx.save();
    ctx.translate(sx + TS / 2, sy + TS);
    const h = 8 + prog * 20;
    ctx.strokeStyle = '#6a8f3f'; ctx.lineWidth = 3 + prog * 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.stroke();
    const r = 5 + prog * 9;
    ctx.fillStyle = ready ? col : '#4a6b32';
    if (ready) { ctx.shadowColor = col; ctx.shadowBlur = 8 + Math.sin(time * 5) * 4; }
    ctx.beginPath(); ctx.arc(0, -h - r * 0.5, r, 0, 7); ctx.fill();
    if (prog > 0.5) { ctx.beginPath(); ctx.arc(-r * 0.7, -h + 2 - r * 0.3, r * 0.7, 0, 7); ctx.arc(r * 0.7, -h + 2 - r * 0.3, r * 0.7, 0, 7); ctx.fill(); }
    ctx.shadowBlur = 0;
    if (ready) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('✦', 0, -h - r - 6);
    } else if (tr.spliced) {
      ctx.fillStyle = '#2de2a3'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('SPLICED', 0, -h - r - 6);
    }
    ctx.restore();
  }

  /* ============ SERIALIZATION (home world) ============ */
  serialize() {
    const pal = []; const pi = {};
    const data = this.tiles.map(t => {
      if (!t) return 0;
      if (pi[t] === undefined) { pi[t] = pal.length + 1; pal.push(t); }
      return pi[t];
    });
    const trees = [];
    this.trees.forEach((tr, i) => trees.push([i, tr.result, tr.plantedAt, tr.growTime, tr.spliced ? 1 : 0]));
    return { pal, data, bg: Array.from(this.bg), meta: this.meta, trees };
  }
  static deserializeHome(s) {
    const w = World.genHome(null); // fresh shell (portals, theme, spawn)
    if (s && s.pal) {
      w.tiles = s.data.map(v => v === 0 ? null : s.pal[v - 1] || null);
      w.bg = Uint8Array.from(s.bg);
      w.meta = s.meta || {};
      w.trees = new Map();
      for (const [i, result, plantedAt, growTime, spliced] of s.trees) {
        if (ITEMS[result]) w.trees.set(i, { result, plantedAt, growTime, spliced: !!spliced });
      }
    }
    return w;
  }

  /* ============ GENERATORS ============ */
  static surfaceLine(w, base, amp, seed) {
    const hs = [];
    for (let x = 0; x < w; x++) {
      hs.push(Math.round(base + Math.sin(x * 0.09 + seed) * amp + Math.sin(x * 0.023 + seed * 2) * amp * 1.6 + (hash2(x, seed * 100 | 0) - 0.5) * 2));
    }
    return hs;
  }
  static frame(w) {
    for (let x = 0; x < w.w; x++) { w.set(x, w.h - 1, 'bedrock'); w.set(x, w.h - 2, 'bedrock'); w.set(x, 0, 'bedrock'); }
    for (let y = 0; y < w.h; y++) { w.set(0, y, 'bedrock'); w.set(w.w - 1, y, 'bedrock'); }
  }
  static carveCaves(w, n, minY) {
    for (let c = 0; c < n; c++) {
      let cx = 4 + Math.random() * (w.w - 8), cy = minY + Math.random() * (w.h - minY - 6);
      for (let s = 0; s < 30 + Math.random() * 40; s++) {
        const r = 1 + Math.random() * 1.6;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r) {
            const tx = Math.floor(cx + dx), ty = Math.floor(cy + dy);
            if (tx > 1 && ty > 2 && tx < w.w - 2 && ty < w.h - 3) w.set(tx, ty, null);
          }
        }
        cx += (Math.random() - 0.5) * 3; cy += (Math.random() - 0.4) * 2;
      }
    }
  }
  static pocket(w, id, n, minY, maxY, size) {
    for (let p = 0; p < n; p++) {
      const px = 3 + Math.floor(Math.random() * (w.w - 6)), py = minY + Math.floor(Math.random() * (maxY - minY));
      for (let k = 0; k < size; k++) {
        const tx = px + Math.floor((Math.random() - 0.5) * 4), ty = py + Math.floor((Math.random() - 0.5) * 3);
        if (w.get(tx, ty) && w.get(tx, ty) !== 'bedrock') w.set(tx, ty, id);
      }
    }
  }

  static genHome() {
    const w = new World('home', 'HOME SERVER', 100, 60, { sky: ['#12294d', '#3a6ea5'], bgWall: 'rgba(30,22,16,0.85)', dark: 0 });
    w.isHome = true;
    const hs = World.surfaceLine(w.w, 24, 2.5, 7);
    for (let x = 0; x < w.w; x++) {
      for (let y = hs[x]; y < w.h; y++) {
        const depth = y - hs[x];
        w.set(x, y, depth < 1 ? 'dirt' : depth < 7 ? 'dirt' : 'stone');
        if (depth >= 1) w.bg[w.idx(x, y)] = 1;
      }
    }
    World.carveCaves(w, 7, 30);
    World.pocket(w, 'wood', 10, 26, 45, 7);
    World.pocket(w, 'sand', 8, 25, 50, 7);
    // spawn platform: flatten x 44..56
    const py = 22;
    for (let x = 42; x <= 58; x++) {
      for (let y = 0; y < py; y++) { w.set(x, y, null); }
      w.set(x, py, 'bedrock');
      for (let y = py + 1; y < py + 4; y++) if (!w.get(x, y)) w.set(x, y, 'dirt');
    }
    w.spawn = { x: 50 * TS, y: (py - 2) * TS };
    // portals to the four corrupted sectors
    const sectorMeta = [
      ['sector1', 'FIREWALL SECTOR', '#ff5714', 0],
      ['sector2', 'DATA MINES', '#c77dff', 1],
      ['sector3', 'THE CLOUD', '#6ee7ff', 2],
      ['sector4', 'THE CORE', '#ffd166', 3],
    ];
    sectorMeta.forEach(([id, label, color, req], k) => {
      w.portals.push({ x: (43.5 + k * 3.7) * TS, y: py * TS, target: id, label, color, labelUp: k % 2 === 1, locked: () => game.bossKillCount < req });
    });
    return w;
  }

  static genSector(n) {
    const defs = {
      1: { name: 'FIREWALL SECTOR', sky: ['#1a0505', '#5c1a0a'], bgWall: 'rgba(40,10,5,0.85)', dark: 0.5, ground: 'stone', hazard: 'magma', enemies: ['ember', 'drone'], cap: 6, boss: 'firewall_daemon' },
      2: { name: 'DATA MINES', sky: ['#0a0514', '#241448'], bgWall: 'rgba(18,8,30,0.9)', dark: 0.8, ground: 'stone', hazard: null, enemies: ['glitchling', 'ember'], cap: 7, boss: 'null_wurm' },
      3: { name: 'THE CLOUD', sky: ['#4a6ea8', '#a8c8e8'], bgWall: 'rgba(120,140,180,0.4)', dark: 0, ground: 'cloudb', hazard: null, enemies: ['drone', 'zapper'], cap: 7, boss: 'storm_kernel' },
      4: { name: 'THE CORE', sky: ['#14020a', '#3d0a1e'], bgWall: 'rgba(30,5,15,0.9)', dark: 0.6, ground: 'corrupt', hazard: 'magma', enemies: ['glitchling', 'zapper', 'ember'], cap: 9, boss: 'admin' },
    }[n];
    const w = new World('sector' + n, defs.name, 130, 50, { sky: defs.sky, bgWall: defs.bgWall, dark: defs.dark });
    w.enemyTypes = defs.enemies; w.enemyCap = defs.cap; w.bossId = defs.boss; w.sectorN = n;

    if (n === 3) {
      // floating islands over a void of static
      for (let isl = 0; isl < 16; isl++) {
        const ix = 6 + Math.random() * (w.w - 40), iy = 12 + Math.random() * 26, iw = 5 + Math.random() * 9;
        for (let x = 0; x < iw; x++) for (let y = 0; y < 2 + Math.random() * 2; y++) w.set(Math.floor(ix + x), Math.floor(iy + y), 'cloudb');
      }
      // guaranteed path platforms
      for (let px = 4; px < w.w - 24; px += 7) {
        const py = 24 + Math.sin(px * 0.4) * 6;
        for (let x = 0; x < 4; x++) w.set(px + x, Math.floor(py), 'cloudb');
      }
      for (let x = 1; x < w.w - 1; x++) for (let y = w.h - 5; y < w.h; y++) w.set(x, y, 'magma'); // static sea
      w.spawn = { x: 5.5 * TS, y: 21 * TS };
      // arena
      for (let x = w.w - 24; x < w.w - 1; x++) { w.set(x, 34, 'cloudb'); w.set(x, 35, 'cloudb'); for (let y = 36; y < w.h - 5; y++) w.set(x, y, 'cloudb'); }
      w.bossZone = { x1: (w.w - 22) * TS, spawnX: (w.w - 11) * TS, spawnY: 26 * TS };
    } else {
      const hs = World.surfaceLine(w.w, n === 2 ? 12 : 20, n === 2 ? 1.5 : 3, n * 13);
      for (let x = 0; x < w.w; x++) {
        for (let y = hs[x]; y < w.h; y++) {
          const depth = y - hs[x];
          let id = defs.ground;
          if (n === 1) id = depth < 4 ? 'stone' : 'stone';
          if (n === 2) id = depth < 3 ? 'dirt' : hash2(x, y) < 0.12 ? 'corrupt' : 'stone';
          if (n === 4) id = hash2(x, y) < 0.5 ? 'corrupt' : 'stone';
          w.set(x, y, id);
          if (depth >= 1) w.bg[w.idx(x, y)] = 1;
        }
      }
      World.carveCaves(w, n === 2 ? 14 : 8, n === 2 ? 16 : 26);
      if (defs.hazard) World.pocket(w, defs.hazard, n === 4 ? 14 : 10, hs[0] + 2, w.h - 6, 6);
      if (n === 2) { World.pocket(w, 'corrupt', 16, 16, w.h - 6, 8); World.pocket(w, 'wood', 6, 16, 40, 6); }
      // spawn ledge
      for (let x = 2; x <= 8; x++) { for (let y = 0; y < hs[4]; y++) w.set(x, y, null); w.set(x, hs[4], 'bedrock'); }
      w.spawn = { x: 5 * TS, y: (hs[4] - 2) * TS };
      // boss arena: flatten last 26 tiles
      const ay = n === 2 ? 34 : 26;
      for (let x = w.w - 28; x < w.w - 1; x++) {
        for (let y = 2; y < ay; y++) w.set(x, y, null);
        for (let y = ay; y < w.h - 2; y++) if (!w.get(x, y)) w.set(x, y, defs.ground);
        w.set(x, ay, n === 4 ? 'corrupt' : defs.ground);
      }
      w.bossZone = { x1: (w.w - 26) * TS, spawnX: (w.w - 13) * TS, spawnY: (ay - 7) * TS };
    }
    World.frame(w);
    // exit portal at spawn
    w.portals.push({ x: w.spawn.x - TS * 1.5, y: w.spawn.y + TS * 2, target: 'home', label: 'EXIT', color: '#2de2a3' });
    // enemy spawn points: scan for ground with 2 air above
    for (let x = 10; x < w.w - 4; x += 3) {
      for (let y = 4; y < w.h - 4; y++) {
        if (w.isSolid(x, y) && !w.get(x, y - 1) && !w.get(x, y - 2)) { w.spawnPoints.push({ x, y: y - 1 }); break; }
      }
    }
    return w;
  }
}
