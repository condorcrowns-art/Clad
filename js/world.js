'use strict';
/* ============================================================
   GLITCHTOPIA — worlds: tile engine, generation, trees, tile FX
   ============================================================ */

// --- world-only tiles (not obtainable) ---
defItem('bedrock', { name: 'Bedrock', kind: 'block', hp: 9999, solid: true, unbreakable: true, noDrop: true, color: '#2a2f3a', color2: '#171b23', desc: 'The edge of the simulation.' });
defItem('magma',   { name: 'Magma', kind: 'block', hp: 8, solid: true, noDrop: true, color: '#ff5714', color2: '#992200', animated: true, fx: { damage: 18, glow: 4 }, desc: 'Hurts. Do not stand on.' });
defItem('corrupt', { name: 'Corrupted Data', kind: 'block', hp: 5, solid: true, noDrop: true, gemRich: true, color: '#7b2cbf', color2: '#4a1578', desc: 'Glitched blocks, dense with loose gems.' });
defItem('cloudb',  { name: 'Cloud Platform', kind: 'block', hp: 4, solid: true, noDrop: true, color: '#dfe7f5', color2: '#aab8d0', desc: 'Compressed vapor. Somehow solid.' });
defItem('water',   { name: 'Liquid Data', kind: 'block', hp: 2, solid: false, noDrop: true, swim: true, animated: true, color: '#3a86ff', color2: '#2667cc', desc: 'Swimmable liquid data. Cast a Data Rod into it and see what bites.' });
defItem('gate',    { name: 'Cipher Gate', kind: 'block', hp: 9999, solid: true, unbreakable: true, noDrop: true, animated: true, color: '#3d2c52', color2: '#241a33', desc: 'Sealed by cipher keys. Find all 3 keys in this sector to open it.' });
defItem('chest',   { name: 'Data Cache', kind: 'block', hp: 4, solid: true, noDrop: true, chest: true, color: '#8a5a2a', color2: '#5e3c1a', desc: 'A locked cache of loot. Break it open.' });
defItem('gold_cache', { name: 'Golden Cache', kind: 'block', hp: 8, solid: true, noDrop: true, chest: true, rich: true, animated: true, color: '#ffd166', color2: '#b8860b', fx: { glow: 4 }, desc: 'The Stack\'s summit treasure. Jackpot inside.' });
defItem('copper_ore', { name: 'Copper Vein', kind: 'block', hp: 6, solid: true, noDrop: true, gemVal: [3, 6], color: '#b87333', color2: '#7a4a1e', desc: 'Shallow ore. Pops into gems.' });
defItem('silver_ore', { name: 'Silver Vein', kind: 'block', hp: 8, solid: true, noDrop: true, gemVal: [8, 14], color: '#c0c0cc', color2: '#7e7e8a', desc: 'Mid-depth ore. A solid payday.' });
defItem('aurum_ore', { name: 'Aurum Vein', kind: 'block', hp: 10, solid: true, noDrop: true, gemVal: [18, 28], color: '#ffd700', color2: '#a8860b', desc: 'Deep ore. Miners dream about this.' });
defItem('core_crystal', { name: 'Core Crystal', kind: 'block', hp: 12, solid: true, noDrop: true, gemVal: [40, 65], animated: true, fx: { glow: 4 }, color: '#ff6ec7', color2: '#a4247d', desc: 'The mineshaft\'s rarest prize. Worth a fortune, might hide a seed.' });
// (snow & ice are defined in items.js so their seeds exist for splicing)

// weather programs for the home server's sky (Growtopia-style weather machines)
const WEATHERS = [
  { name: 'DAYLIGHT', sky: ['#12294d', '#3a6ea5'], dark: 0 },
  { name: 'SUNSET', sky: ['#3d1635', '#e56b4a'], dark: 0 },
  { name: 'MIDNIGHT', sky: ['#05070d', '#101d38'], dark: 0.5 },
  { name: 'MATRIX RAIN', sky: ['#020a04', '#0a2e14'], dark: 0.3 },
  { name: 'VAPORWAVE', sky: ['#2b1055', '#ff6ec7'], dark: 0 },
];

function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; }

class World {
  constructor(id, name, w, h, theme) {
    this.id = id; this.name = name; this.w = w; this.h = h;
    this.theme = theme; // {sky:[c1,c2], bgWall, dark:0..1}
    this.tiles = new Array(w * h).fill(null);
    this.bg = new Uint8Array(w * h); // 1 = natural background wall behind
    this.bgT = new Array(w * h).fill(null); // player-placed background wall blocks
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
    this.keySpots = [];              // px positions of cipher keys (sectors)
    this.gateCol = -1;               // tile column of the cipher gate
    this.themeIdx = 0;               // weather program (home)
    this.doorIdx = -1;               // respawn door tile index (home)
    this.mini = null;                // minimap canvas
  }
  applyWeather(idx) {
    this.themeIdx = ((idx % WEATHERS.length) + WEATHERS.length) % WEATHERS.length;
    const w = WEATHERS[this.themeIdx];
    this.theme.sky = w.sky;
    this.theme.dark = w.dark;
  }
  openGate(game) {
    if (this.gateCol < 0) return;
    for (let y = 0; y < this.h; y++) {
      if (this.get(this.gateCol, y) === 'gate') {
        this.set(this.gateCol, y, null);
        game.fx.puff(this.gateCol * TS + TS / 2, y * TS + TS / 2, '#c77dff');
      }
    }
    game.sfx.play('splice');
    game.toast('🔑 CIPHER GATE OPENED — the boss arena awaits.', 'gold');
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

  // ---- background walls (right-click building layer) ----
  placeBg(tx, ty, id) {
    const i = this.idx(tx, ty);
    if (this.tiles[i] || this.bgT[i] || this.trees.has(i)) return false;
    this.bgT[i] = id;
    return true;
  }
  hitBg(tx, ty, power, game) {
    const i = this.idx(tx, ty);
    const id = this.bgT[i];
    if (!id || this.tiles[i]) return false;
    const it = ITEMS[id];
    const key = -(i + 1);
    let d = this.damage.get(key);
    if (!d || performance.now() - d.t > 3500) d = { dmg: 0, t: 0 };
    d.dmg += power; d.t = performance.now();
    this.damage.set(key, d);
    game.fx.tileHit(tx, ty, it);
    if (d.dmg >= Math.ceil(it.hp / 2)) {
      this.bgT[i] = null;
      this.damage.delete(key);
      game.fx.tileBreak(tx, ty, it);
      if (!it.noDrop && Math.random() < 0.4) game.spawnDrop(tx * TS + TS / 2, ty * TS + TS / 2, id, 1);
      return true;
    }
    return false;
  }

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
    const oldMeta = this.meta[i];
    this.tiles[i] = null;
    this.damage.delete(i);
    delete this.meta[i];
    if (i === this.doorIdx) this.doorIdx = -1;
    // shelves/vendors give their contents back
    if (oldMeta) {
      if (oldMeta.display) game.spawnDrop(tx * TS + TS / 2, ty * TS + TS / 2, oldMeta.display, 1);
      if (oldMeta.stock && oldMeta.stock.n > 0) game.spawnDrop(tx * TS + TS / 2, ty * TS + TS / 2, oldMeta.stock.id, oldMeta.stock.n);
    }
    if (!silent) game.fx.tileBreak(tx, ty, it);
    game.progress.stats.broken++;
    if (!silent) game.addXp(1);
    const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
    if (it.chest) { // loot caches
      if (it.rich) { // Golden Cache (Stack summit / secret vaults)
        game.spawnGems(cx, cy, 40 + Math.floor(Math.random() * 41));
        if (Math.random() < 0.6) game.spawnDrop(cx, cy, 'mystery_seed', 1);
        if (Math.random() < 0.4) game.spawnDrop(cx, cy, 'golden_fish', 1);
        if (Math.random() < 0.3) game.spawnDrop(cx, cy, 'corrupted_drive', 1);
        if (Math.random() < 0.06) { game.spawnDrop(cx, cy, 'world_lock', 1); game.toast('★★ A WORLD LOCK was inside!', 'gold'); }
        game.spawnDrop(cx, cy, 'medkit', 1);
      } else {
        game.spawnGems(cx, cy, 5 + Math.floor(Math.random() * 11));
        if (Math.random() < 0.5) game.spawnDrop(cx, cy, ['dirt_seed', 'stone_seed', 'wood_seed', 'sand_seed', 'brick_seed', 'glass_seed'][Math.floor(Math.random() * 6)], 1);
        if (Math.random() < 0.3) game.spawnDrop(cx, cy, Math.random() < 0.5 ? 'medkit' : 'bomb', 1);
        if (Math.random() < 0.12) game.spawnDrop(cx, cy, 'corrupted_drive', 1);
        if (Math.random() < 0.06) game.spawnDrop(cx, cy, 'mystery_seed', 1);
      }
      game.sfx.play('buy');
      return;
    }
    if (it.gemVal) { // ore veins & crystal clusters burst into gems
      const [g0, g1] = it.gemVal;
      const boost = (game.player.gearFx('oreBoost') || 1) * (game.player.heldItem().oreBoost || 1);
      game.spawnGems(cx, cy, Math.round((g0 + Math.floor(Math.random() * (g1 - g0 + 1))) * boost));
      if (it.id === 'core_crystal' && Math.random() < 0.25) game.spawnDrop(cx, cy, 'mystery_seed', 1);
      if (it.id === 'crystal_cluster' && Math.random() < 0.14 && ITEMS.crystal_cluster_seed) game.spawnDrop(cx, cy, 'crystal_cluster_seed', 1);
      game.sfx.play('gem');
      return;
    }
    if (!it.noDrop) {
      if (Math.random() < 0.33) game.spawnDrop(cx, cy, it.id, 1);
      if (Math.random() < 0.16 && ITEMS[it.id + '_seed']) game.spawnDrop(cx, cy, it.id + '_seed', 1);
    }
    const fortune = (game.player.gemAuraOn || (game.buffActive() && game.buff.gem)) ? 1.5 : 1;
    const gemChance = (it.gemRich ? 0.65 : 0.2) * fortune;
    if (Math.random() < gemChance) game.spawnGems(cx, cy, Math.round((1 + Math.floor(Math.random() * (it.gemRich ? 4 : 3))) * fortune));
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
    const n = 1 + Math.floor(Math.random() * 3) + (game.player.gearFx('harvestBonus') || 0);
    game.spawnDrop(cx, cy, tr.result, n);
    if (ITEMS[tr.result + '_seed']) {
      if (Math.random() < 0.45) game.spawnDrop(cx, cy, tr.result + '_seed', 1);
      if (Math.random() < 0.15) game.spawnDrop(cx, cy, tr.result + '_seed', 1);
    }
    game.spawnGems(cx, cy, 1 + Math.floor(Math.random() * 2));
    this.trees.delete(i);
    game.progress.stats.harvests++;
    game.addXp(4);
    game.fx.harvest(cx, cy, ITEMS[tr.result].color || '#8f8');
    game.sfx.play('harvest');
    return true;
  }

  // ---- per-frame world logic: sentries, tesla coils ----
  update(dt, game) {
    // all turret-family blocks (sentry, mega sentry, flak) share one brain
    this._sentryT = (this._sentryT || 0) - dt;
    if (this._sentryT <= 0) {
      this._sentryT = 0.5;
      for (let i = 0; i < this.tiles.length; i++) {
        const t = this.tiles[i];
        if (!t) continue;
        const def = ITEMS[t];
        if (!def.fx || !def.fx.sentry) continue;
        const S = def.fx.sentry;
        const m = this.meta[i] = this.meta[i] || {};
        m.cd = (m.cd || 0) - 0.5;
        if (m.cd > 0) continue;
        const tx = i % this.w, ty = Math.floor(i / this.w);
        const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
        let best = null, bd = S.range * TS;
        for (const e of game.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - cx, e.y - cy);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          m.cd = S.rate;
          const opts = { burn: S.burn, chill: S.chill, knock: S.knock, pierce: S.pierce };
          if (S.arc) {
            const tt = 0.8;
            game.projectiles.push(new Projectile(cx, cy - TS * 0.85, (best.x - cx) / tt, (best.y - cy) / tt - 0.5 * 1100 * tt, S.dmg, true, '#ffb703', Object.assign({ r: 7, gravity: 1100, life: 2.2 }, opts)));
          } else {
            const a = Math.atan2(best.y - cy, best.x - cx);
            // spawn the bolt just OUTSIDE the turret's own solid tile
            game.projectiles.push(new Projectile(cx + Math.cos(a) * TS * 0.8, cy + Math.sin(a) * TS * 0.8, Math.cos(a) * 560, Math.sin(a) * 560, S.dmg, true, def.color || '#ff9e6d', opts));
          }
          game.sfx.play('sentry');
        }
      }
    }

    // per-second: aura caches, grow lamps, compost, alarms, fountains
    this._auraT = (this._auraT || 0) - dt;
    if (this._auraT <= 0) {
      this._auraT = 1;
      this._coils = []; this._pylons = []; this._beacons = []; this._lamps = []; this._repels = []; this._baits = [];
      for (let i = 0; i < this.tiles.length; i++) {
        const t = this.tiles[i];
        if (!t) continue;
        const fx = ITEMS[t].fx;
        if (!fx) continue;
        const cx = (i % this.w) * TS + TS / 2, cy = Math.floor(i / this.w) * TS + TS / 2;
        if (fx.chillAura) this._coils.push({ x: cx, y: cy });
        if (fx.pull) this._pylons.push({ x: cx, y: cy });
        if (fx.beacon) this._beacons.push({ x: cx, y: cy });
        if (fx.repel) this._repels.push({ x: cx, y: cy, r: fx.repel * TS });
        if (fx.bait) this._baits.push({ x: cx, y: cy, r: fx.bait * TS });
        if (fx.harvester) { // harvest bots reap ready trees nearby
          const R = fx.harvester * TS;
          const ready = [];
          this.trees.forEach((tr, ti) => {
            if (!this.treeReady(tr)) return;
            const tx2 = (ti % this.w) * TS + TS / 2, ty2 = Math.floor(ti / this.w) * TS + TS / 2;
            if (Math.hypot(tx2 - cx, ty2 - cy) <= R) ready.push(ti);
          });
          for (const ti of ready.slice(0, 2)) this.harvestTree(ti % this.w, Math.floor(ti / this.w), game);
        }
        if (fx.music) { // jukebox: generative pentatonic while the player is near
          if (Math.hypot(game.player.x - cx, game.player.y - cy) < 9 * TS) {
            const m = this.meta[i] = this.meta[i] || {};
            m.beat = (m.beat || 0) + 1;
            const scale = [0, 2, 4, 7, 9, 12];
            game.sfx.note(scale[Math.floor(hash2(m.beat, i) * scale.length)]);
            if (m.beat % 2 === 0) game.fx.add(cx + (Math.random() - 0.5) * 10, cy - TS, (Math.random() - 0.5) * 20, -40, '#f7a8d8', 0.9, 0, 0, '♪');
          }
        }
        if (fx.growAura) this._lamps.push({ x: cx, y: cy, r: fx.auraRange * TS, mult: fx.growAura });
        if (fx.alarm) {
          const near = game.enemies.some(e => !e.dead && Math.hypot(e.x - cx, e.y - cy) < fx.alarm * TS);
          const m = this.meta[i] = this.meta[i] || {};
          m.alarmCd = (m.alarmCd || 0) - 1;
          if (near && m.alarmCd <= 0) { m.alarmCd = 4; game.sfx.play('error'); game.fx.spark(cx, cy - 10, '#ef476f', 8); }
        }
        if (fx.compost) {
          const m = this.meta[i];
          if (m && m.comp && Date.now() >= m.comp.until && !m.comp.done) { m.comp.done = true; game.sfx.play('plant'); game.fx.puff(cx, cy - 10, '#80b918'); }
        }
      }
      // grow lamps accelerate nearby trees (adds bonus elapsed time)
      if (this._lamps.length) {
        this.trees.forEach((tr, i) => {
          const cx = (i % this.w) * TS + TS / 2, cy = Math.floor(i / this.w) * TS + TS / 2;
          for (const L of this._lamps) {
            if (Math.hypot(L.x - cx, L.y - cy) <= L.r) { tr.plantedAt -= (L.mult - 1) * 1000; break; }
          }
        });
      }
    }
    // fountain plumes
    this._fntT = (this._fntT || 0) - dt;
    if (this._fntT <= 0) {
      this._fntT = 0.12;
      for (let i = 0; i < this.tiles.length; i++) {
        if (this.tiles[i] !== 'fountain') continue;
        const cx = (i % this.w) * TS + TS / 2, cy = Math.floor(i / this.w) * TS;
        if (Math.abs(cx - game.player.x) > game.cam.view.w) continue;
        game.fx.add(cx + (Math.random() - 0.5) * 8, cy, (Math.random() - 0.5) * 60, -180 - Math.random() * 80, 'rgba(144,224,239,0.8)', 0.9, 3, 300);
      }
    }
    // vendor bots sell their stock over time
    this._vendT = (this._vendT || 0) - dt;
    if (this._vendT <= 0) {
      this._vendT = 1;
      for (let i = 0; i < this.tiles.length; i++) {
        if (this.tiles[i] !== 'vendor_bot') continue;
        const m = this.meta[i];
        if (!m || !m.stock || m.stock.n <= 0) continue;
        m.stock.t = (m.stock.t || 0) + 1;
        if (m.stock.t >= 25) {
          m.stock.t = 0; m.stock.n--;
          const val = sellPrice(m.stock.id);
          const tx = i % this.w, ty = Math.floor(i / this.w);
          game.spawnGems(tx * TS + TS / 2, ty * TS - 6, val);
          game.fx.spark(tx * TS + TS / 2, ty * TS + 6, '#ffd166', 5);
          game.sfx.play('gem');
          if (m.stock.n <= 0) { delete m.stock; game.toast('A Vendor Bot sold out of stock.', ''); }
          if (this.isHome) game.saveSoon();
        }
      }
    }
    this._teslaT = (this._teslaT || 0) - dt;
    if (this._teslaT <= 0) {
      this._teslaT = 1.4;
      for (let i = 0; i < this.tiles.length; i++) {
        const tid = this.tiles[i];
        if (!tid || !ITEMS[tid].fx || !ITEMS[tid].fx.tesla) continue;
        const fx = ITEMS[tid].fx.tesla;
        const tx = i % this.w, ty = Math.floor(i / this.w);
        const cx = tx * TS + TS / 2, cy = ty * TS + TS / 2;
        const inRange = game.enemies.filter(e => !e.dead && Math.hypot(e.x - cx, e.y - cy) < fx.range * TS)
          .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))
          .slice(0, fx.chains);
        let px = cx, py = cy - TS / 2;
        for (const e of inRange) {
          game.zaps.push({ x1: px, y1: py, x2: e.x, y2: e.y, life: 0.18 });
          e.hurt(fx.dmg, game);
          if (fx.burn) { e.burn = fx.burn.dps; e.burnT = fx.burn.dur; }
          px = e.x; py = e.y;
        }
        if (inRange.length) game.sfx.play('sentry');
      }
    }
  }

  // 1px-per-tile minimap
  buildMini(game) {
    if (!this.mini) { this.mini = document.createElement('canvas'); this.mini.width = this.w; this.mini.height = this.h; }
    const x = this.mini.getContext('2d');
    x.clearRect(0, 0, this.w, this.h);
    for (let i = 0; i < this.tiles.length; i++) {
      const t = this.tiles[i];
      if (!t && !this.trees.has(i)) continue;
      x.fillStyle = this.trees.has(i) ? '#3ddc84' : (ITEMS[t] ? ITEMS[t].color : '#888');
      x.fillRect(i % this.w, Math.floor(i / this.w), 1, 1);
    }
    return this.mini;
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

    // natural background walls
    ctx.fillStyle = this.theme.bgWall;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (this.bg[this.idx(tx, ty)]) ctx.fillRect(tx * TS - cam.x, ty * TS - cam.y, TS, TS);
    }
    // player-built background walls (dimmed blocks, inset frame)
    const bgGlows = [];
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const bid = this.bgT[this.idx(tx, ty)];
      if (!bid) continue;
      const it = ITEMS[bid];
      const sx = tx * TS - cam.x, sy = ty * TS - cam.y;
      ctx.fillStyle = it.color; ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = it.color2;
      ctx.fillRect(sx + Math.floor(hash2(tx, ty) * 20) + 3, sy + Math.floor(hash2(ty, tx) * 20) + 3, 5, 5);
      ctx.fillStyle = 'rgba(5,8,18,0.5)'; ctx.fillRect(sx, sy, TS, TS);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 1.5, sy + 1.5, TS - 3, TS - 3);
      if (it.fx && it.fx.glow && bgGlows.length < 12) bgGlows.push([sx + TS / 2, sy + TS / 2, it.fx.glow * TS * 0.3, it.color]);
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

    // sign text bubbles (shown when the player stands near)
    if (game && game.player) {
      for (const k in this.meta) {
        const m = this.meta[k];
        if (!m.text) continue;
        const i = +k;
        const stx = (i % this.w) * TS + TS / 2, sty = Math.floor(i / this.w) * TS;
        if (Math.hypot(game.player.x - stx, game.player.y - sty) > 3.5 * TS) continue;
        const sx = stx - cam.x, sy = sty - cam.y;
        ctx.font = '12px monospace';
        const tw = ctx.measureText(m.text).width + 14;
        ctx.fillStyle = 'rgba(10,14,24,0.92)';
        ctx.fillRect(sx - tw / 2, sy - 34, tw, 22);
        ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1;
        ctx.strokeRect(sx - tw / 2, sy - 34, tw, 22);
        ctx.fillStyle = '#eaf4ef'; ctx.textAlign = 'center';
        ctx.fillText(m.text, sx, sy - 19);
      }
    }

    // beacon light pillars
    if (this._beacons) {
      for (const b of this._beacons) {
        const bx = b.x - cam.x;
        if (bx < -60 || bx > vw + 60) continue;
        const grad = ctx.createLinearGradient(0, 0, 0, b.y - cam.y);
        grad.addColorStop(0, 'rgba(72,202,228,0)');
        grad.addColorStop(1, 'rgba(72,202,228,' + (0.22 + 0.08 * Math.sin(time * 3)) + ')');
        ctx.fillStyle = grad;
        ctx.fillRect(bx - 7, 0, 14, Math.max(0, b.y - cam.y - TS / 2));
      }
    }

    // player torchlight in dark worlds
    if (this.theme.dark >= 0.4 && game && game.player) {
      glows.push([game.player.x - cam.x, game.player.y - cam.y - 10, 6.5 * TS, '#ffe9c9']);
    }

    for (const g2 of bgGlows) glows.push(g2);

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
    // fully custom non-cube tiles
    if (id === 'water') {
      ctx.fillStyle = 'rgba(58,134,255,0.55)'; ctx.fillRect(sx, sy, TS, TS);
      const above = this.get(tx, ty - 1);
      if (above !== 'water') {
        ctx.fillStyle = 'rgba(160,210,255,0.7)';
        for (let k = 0; k < 4; k++) ctx.fillRect(sx + ((k * 9 + Math.floor(time * 14)) % TS), sy, 5, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(sx + ((tx * 7 + Math.floor(time * 8)) % TS), sy + 10 + Math.sin(time * 2 + tx) * 4, 6, 2);
      return;
    }
    if (id === 'door') {
      ctx.fillStyle = it.color; ctx.fillRect(sx + 4, sy - TS + 4, TS - 8, TS * 2 - 8);
      ctx.fillStyle = it.color2; ctx.fillRect(sx + 8, sy - TS + 8, TS - 16, TS * 2 - 16);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(sx + TS - 12, sy + 2, 4, 4);
      if (this.idx(tx, ty) === this.doorIdx) { ctx.fillStyle = '#2de2a3'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText('SPAWN', sx + TS / 2, sy - TS); }
      return;
    }
    if (id === 'sign') {
      ctx.fillStyle = '#7a5a3a'; ctx.fillRect(sx + TS / 2 - 2, sy + 12, 4, TS - 12);
      ctx.fillStyle = it.color; ctx.fillRect(sx + 3, sy + 2, TS - 6, 14);
      ctx.fillStyle = it.color2;
      ctx.fillRect(sx + 6, sy + 6, TS - 14, 2); ctx.fillRect(sx + 6, sy + 10, TS - 18, 2);
      return;
    }
    if (it.fx && it.fx.platform) {
      ctx.fillStyle = it.color;
      if (id === 'cloud_block') {
        ctx.beginPath(); ctx.arc(sx + 8, sy + 8, 7, 0, 7); ctx.arc(sx + 18, sy + 6, 8, 0, 7); ctx.arc(sx + 26, sy + 9, 6, 0, 7); ctx.fill();
        ctx.fillRect(sx + 2, sy + 6, TS - 4, 6);
      } else {
        ctx.fillRect(sx, sy, TS, 9);
        ctx.fillStyle = it.color2;
        ctx.fillRect(sx, sy + 7, TS, 2);
        ctx.fillRect(sx + 4, sy + 2, 2, 4); ctx.fillRect(sx + TS - 6, sy + 2, 2, 4);
        if (id === 'life_ledge') { ctx.fillStyle = '#fff'; ctx.fillRect(sx + TS / 2 - 1, sy + 1, 3, 7); ctx.fillRect(sx + TS / 2 - 3, sy + 3, 7, 3); }
        if (id === 'trap_ledge') { ctx.fillStyle = '#e8ecf4'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(sx + 3 + k * 8, sy + 9); ctx.lineTo(sx + 6 + k * 8, sy + 15); ctx.lineTo(sx + 9 + k * 8, sy + 9); ctx.fill(); } }
      }
      return;
    }
    if (it.fx && it.fx.ladder) {
      ctx.fillStyle = it.color;
      if (id === 'glow_vine') {
        ctx.strokeStyle = it.color; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(sx + TS / 2 + Math.sin(ty) * 5, sy);
        ctx.quadraticCurveTo(sx + TS / 2 + Math.sin(ty * 3 + 1) * 8, sy + TS / 2, sx + TS / 2 + Math.sin(ty + 1) * 5, sy + TS);
        ctx.stroke();
        ctx.fillStyle = 'rgba(158,240,26,' + (0.6 + 0.3 * Math.sin(time * 3 + ty)) + ')';
        ctx.beginPath(); ctx.arc(sx + TS / 2 + Math.sin(ty * 2) * 7, sy + 10 + (ty % 3) * 7, 3.5, 0, 7); ctx.fill();
      } else {
        ctx.fillRect(sx + 5, sy, 4, TS); ctx.fillRect(sx + TS - 9, sy, 4, TS);
        ctx.fillStyle = it.color2;
        for (let k = 0; k < 3; k++) ctx.fillRect(sx + 7, sy + 4 + k * 11, TS - 14, 4);
      }
      return;
    }
    if (id === 'boost_ring') {
      const pulse = 1 + Math.sin(time * 5 + tx) * 0.12;
      ctx.strokeStyle = it.color; ctx.lineWidth = 3.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.ellipse(sx + TS / 2, sy + TS / 2, 12 * pulse, 14 * pulse, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(sx + TS / 2, sy + TS / 2, 7 * pulse, 9 * pulse, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    // neighbor-aware base render: edges only where exposed, per-material texture
    const openU = !this.isSolid(tx, ty - 1), openD = !this.isSolid(tx, ty + 1);
    const openL = !this.isSolid(tx - 1, ty), openR = !this.isSolid(tx + 1, ty);
    ctx.fillStyle = it.color; ctx.fillRect(sx, sy, TS, TS);
    if (it.transparent) { ctx.clearRect(sx + 3, sy + 3, TS - 6, TS - 6); ctx.fillStyle = it.color + '44'; ctx.fillRect(sx + 3, sy + 3, TS - 6, TS - 6); }
    ctx.fillStyle = it.color2;
    if (id === 'brick' || id === 'bedrock' || id === 'ghost_brick') {
      // mortar courses with offset rows
      for (let r = 0; r < 3; r++) {
        ctx.fillRect(sx, sy + 9 + r * 11, TS, 2);
        const off = ((ty * 3 + r) % 2) * 12;
        ctx.fillRect(sx + ((10 + off) % TS), sy + r * 11, 2, 9);
      }
    } else if (id === 'wood') {
      ctx.fillRect(sx, sy + 9, TS, 2); ctx.fillRect(sx, sy + 21, TS, 2);
      if (hash2(tx, ty) < 0.3) { ctx.beginPath(); ctx.arc(sx + 8 + hash2(ty, tx) * 16, sy + 15, 3, 0, 7); ctx.fill(); }
    } else if (id === 'sand') {
      for (let k = 0; k < 9; k++) ctx.fillRect(sx + Math.floor(hash2(tx * 3 + k, ty * 7 + k) * (TS - 4)) + 2, sy + Math.floor(hash2(tx * 7 - k, ty * 3 + k) * (TS - 4)) + 2, 2, 2);
    } else if (it.transparent) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx + 6, sy + TS - 6); ctx.lineTo(sx + TS - 6, sy + 6);
      ctx.moveTo(sx + 14, sy + TS - 6); ctx.lineTo(sx + TS - 6, sy + 14); ctx.stroke();
    } else if (id === 'corrupt') {
      for (let k = 0; k < 3; k++) {
        const fl = hash2(tx + k, ty + Math.floor(time * (2 + k))) ;
        ctx.fillStyle = fl < 0.5 ? it.color2 : '#b16be8';
        ctx.fillRect(sx + Math.floor(hash2(tx * 5 + k, ty) * (TS - 8)) + 2, sy + Math.floor(hash2(tx, ty * 5 + k) * (TS - 8)) + 2, 6, 6);
      }
      ctx.fillStyle = it.color2;
    } else {
      for (let k = 0; k < 4; k++) {
        const nx = Math.floor(hash2(tx * 3 + k, ty * 5 + k) * (TS - 8)), ny = Math.floor(hash2(tx * 5 + k, ty * 3 - k) * (TS - 8));
        ctx.fillRect(sx + nx + 2, sy + ny + 2, 4, 4);
      }
    }
    // grass cap on exposed dirt (home-world greenery)
    if (id === 'dirt' && openU) {
      ctx.fillStyle = '#4f9d3f'; ctx.fillRect(sx, sy, TS, 5);
      ctx.fillStyle = '#63c24f';
      for (let k = 0; k < 4; k++) {
        const bx = sx + 3 + Math.floor(hash2(tx * 9 + k, ty) * (TS - 8));
        ctx.fillRect(bx, sy - 3 - Math.floor(hash2(tx + k, ty * 9) * 3), 2, 5);
      }
    }
    // exposed-edge shading (sun above, shadow below, side AO)
    if (openU && id !== 'dirt') { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(sx, sy, TS, 3); }
    if (openD) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(sx, sy + TS - 3, TS, 3); }
    if (openL) { ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(sx, sy, 2, TS); }
    if (openR) { ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(sx + TS - 2, sy, 2, TS); }
    // paint tint
    const paintM = this.meta[this.idx(tx, ty)];
    if (paintM && paintM.tint) {
      ctx.fillStyle = paintM.tint;
      ctx.globalAlpha = 0.4; ctx.fillRect(sx, sy, TS, TS); ctx.globalAlpha = 1;
    }
    // special decorations
    const fx = it.fx;
    if (!fx && !it.animated) return;
    if (id === 'spring_pad') {
      ctx.strokeStyle = '#0d1526'; ctx.lineWidth = 2;
      ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(sx + 6, sy + 10 + k * 7); ctx.lineTo(sx + TS - 6, sy + 10 + k * 7); } ctx.stroke();
    } else if (it.fx && it.fx.conveyor) {
      const dir = (this.meta[this.idx(tx, ty)] || {}).dir || 1;
      const off = ((time * (it.fx.conveyor > 300 ? 90 : 40) * dir) % 12 + 12) % 12;
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
    } else if (id === 'tesla_coil') {
      ctx.fillStyle = '#1c2536'; ctx.fillRect(sx + 12, sy + 2, 8, 12);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      const a = time * 6 + tx;
      ctx.beginPath(); ctx.moveTo(sx + 16, sy + 4);
      ctx.lineTo(sx + 16 + Math.sin(a) * 8, sy - 4); ctx.lineTo(sx + 16 + Math.sin(a * 1.7) * 12, sy - 10); ctx.stroke();
    } else if (id === 'shield_gen') {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.3 * Math.sin(time * 3)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2, 10, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#0d1526'; ctx.fillRect(sx + TS / 2 - 3, sy + TS / 2, 6, 10);
    } else if (id === 'grinder') {
      ctx.save(); ctx.translate(sx + TS / 2, sy + TS / 2); ctx.rotate(time * 6);
      ctx.fillStyle = '#e8ecf4';
      for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13, -5); ctx.lineTo(13, 5); ctx.fill(); }
      ctx.restore();
    } else if (id === 'weather_core') {
      const a = time * 2;
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(sx + TS / 2 + Math.cos(a) * 7, sy + TS / 2 + Math.sin(a) * 7, 4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + TS / 2 - Math.cos(a) * 7, sy + TS / 2 - Math.sin(a) * 7, 3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (id === 'gate') {
      ctx.fillStyle = '#c77dff';
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 4 + ty);
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2, 6, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 1;
      ctx.strokeRect(sx + 4, sy + 4, TS - 8, TS - 8);
    } else if (id === 'display_shelf') {
      ctx.fillStyle = it.color2; ctx.fillRect(sx + 2, sy + 22, TS - 4, 5);
      ctx.fillRect(sx + 4, sy + 27, 3, 5); ctx.fillRect(sx + TS - 7, sy + 27, 3, 5);
      const m = this.meta[this.idx(tx, ty)];
      if (m && m.display) ctx.drawImage(iconFor(m.display), sx + 6, sy + 2, 20, 20);
    } else if (id === 'vendor_bot') {
      ctx.fillStyle = '#1c2536'; ctx.fillRect(sx + 6, sy + 4, 20, 14);
      ctx.fillStyle = '#3ddc84'; ctx.fillRect(sx + 9, sy + 8, 4, 4); ctx.fillRect(sx + 19, sy + 8, 4, 4);
      const m = this.meta[this.idx(tx, ty)];
      if (m && m.stock) {
        ctx.drawImage(iconFor(m.stock.id), sx + 18, sy + 16, 13, 13);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
        ctx.fillText(m.stock.n, sx + 3, sy + TS - 4);
      } else if (Math.sin(time * 2 + tx) > 0.6) {
        ctx.fillStyle = '#ffd166'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
        ctx.fillText('[S]', sx + TS / 2, sy - 3);
      }
    } else if (id === 'chest' || id === 'gold_cache') {
      ctx.fillStyle = id === 'gold_cache' ? '#fff' : '#ffd166';
      ctx.fillRect(sx + 4, sy + 14, TS - 8, 4);
      ctx.fillRect(sx + TS / 2 - 3, sy + 12, 6, 8);
      if (id === 'gold_cache') { ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 5); ctx.fillStyle = '#fff'; ctx.fillText('★', sx + TS / 2, sy - 2); ctx.globalAlpha = 1; }
    } else if (id === 'crystal_cluster' || id === 'core_crystal' || it.gemVal) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.25 * Math.sin(time * 3 + tx + ty)) + ')';
      for (let k = 0; k < 3; k++) {
        const gx = sx + 6 + k * 9, gy = sy + 8 + (k % 2) * 10;
        ctx.beginPath(); ctx.moveTo(gx, gy - 4); ctx.lineTo(gx + 4, gy); ctx.lineTo(gx, gy + 4); ctx.lineTo(gx - 4, gy); ctx.closePath(); ctx.fill();
      }
    } else if (id === 'speed_pad') {
      const dir = (this.meta[this.idx(tx, ty)] || {}).dir || 1;
      ctx.fillStyle = '#0d1526';
      for (let k = 0; k < 3; k++) {
        const ax = sx + 5 + k * 9;
        ctx.beginPath();
        if (dir > 0) { ctx.moveTo(ax, sy + 8); ctx.lineTo(ax + 6, sy + 16); ctx.lineTo(ax, sy + 24); ctx.lineTo(ax + 3, sy + 16); }
        else { ctx.moveTo(ax + 6, sy + 8); ctx.lineTo(ax, sy + 16); ctx.lineTo(ax + 6, sy + 24); ctx.lineTo(ax + 3, sy + 16); }
        ctx.fill();
      }
    } else if (id === 'tar') {
      ctx.fillStyle = 'rgba(60,55,55,0.9)';
      for (let k = 0; k < 3; k++) {
        const bx = sx + 5 + k * 10, bh = 4 + Math.sin(time * 2 + k * 2 + tx) * 3;
        ctx.beginPath(); ctx.arc(bx, sy + 6 + (k % 2) * 8, 3 + bh * 0.4, 0, 7); ctx.fill();
      }
    } else if (id === 'obsidian') {
      ctx.strokeStyle = 'rgba(199,125,255,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx + 4, sy + TS - 6); ctx.lineTo(sx + TS - 6, sy + 4); ctx.stroke();
    } else if (id === 'turbine') {
      ctx.save(); ctx.translate(sx + TS / 2, sy + TS / 2); ctx.rotate(time * 9);
      ctx.fillStyle = '#e8f4fb';
      for (let k = 0; k < 3; k++) { ctx.rotate(2.094); ctx.beginPath(); ctx.ellipse(0, -8, 3.5, 9, 0, 0, 7); ctx.fill(); }
      ctx.restore();
      // rising air streaks
      ctx.strokeStyle = 'rgba(200,235,255,0.4)'; ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        const off = ((time * 90 + k * 40) % 70);
        ctx.beginPath(); ctx.moveTo(sx + 8 + k * 14, sy - off); ctx.lineTo(sx + 8 + k * 14, sy - off - 12); ctx.stroke();
      }
    } else if (id === 'antigrav') {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
      for (let k = 0; k < 2; k++) {
        const r = 5 + ((time * 12 + k * 8) % 14);
        ctx.globalAlpha = 1 - r / 16;
        ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2, r, 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (id === 'growth_lamp') {
      ctx.fillStyle = 'rgba(255,255,220,' + (0.65 + 0.25 * Math.sin(time * 3)) + ')';
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 12, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a6b32'; ctx.fillRect(sx + TS / 2 - 3, sy + 20, 6, 8);
    } else if (id === 'fuel_pad') {
      ctx.fillStyle = '#0d1526';
      ctx.beginPath(); ctx.moveTo(sx + 18, sy + 5); ctx.lineTo(sx + 11, sy + 17); ctx.lineTo(sx + 16, sy + 17); ctx.lineTo(sx + 13, sy + 27); ctx.lineTo(sx + 22, sy + 14); ctx.lineTo(sx + 17, sy + 14); ctx.closePath(); ctx.fill();
    } else if (id === 'beacon') {
      ctx.save(); ctx.translate(sx + TS / 2, sy + TS / 2); ctx.rotate(time * 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    } else if (id === 'disco') {
      ctx.fillStyle = 'hsla(' + ((time * 140 + tx * 40) % 360) + ',90%,65%,0.55)';
      ctx.fillRect(sx + 3, sy + 3, TS - 6, TS - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2, 5, 0, 7); ctx.fill();
    } else if (id === 'fountain') {
      ctx.fillStyle = '#1c4a5e'; ctx.fillRect(sx + 6, sy + 8, TS - 12, 6);
      ctx.fillStyle = '#0d2530'; ctx.fillRect(sx + 12, sy + 14, 8, 14);
    } else if (id === 'magnet_pylon') {
      ctx.strokeStyle = '#e8ecf4'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 16, 8, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#e8ecf4'; ctx.fillRect(sx + 8, sy + 14, 5, 6); ctx.fillRect(sx + TS - 13, sy + 14, 5, 6);
    } else if (id === 'compost') {
      const m = this.meta[this.idx(tx, ty)];
      ctx.fillStyle = '#2a3018'; ctx.fillRect(sx + 6, sy + 8, TS - 12, TS - 12);
      if (m && m.comp) {
        ctx.fillStyle = m.comp.done ? '#3ddc84' : '#80b918';
        ctx.beginPath(); ctx.arc(sx + TS / 2, sy + TS / 2 + 2, m.comp.done ? 6 : 4 + Math.sin(time * 3) * 1.5, 0, 7); ctx.fill();
        if (m.comp.done) { ctx.fillStyle = '#fff'; ctx.font = '9px monospace'; ctx.textAlign = 'center'; ctx.fillText('[S]', sx + TS / 2, sy - 3); }
      }
    } else if (id === 'alarm') {
      ctx.fillStyle = (Math.sin(time * 10) > 0 ? '#ff173f' : '#7a0f23');
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 12, 6, Math.PI, 0); ctx.fill();
      ctx.fillRect(sx + TS / 2 - 8, sy + 12, 16, 3);
    } else if (id === 'barbed') {
      ctx.strokeStyle = '#3d2a1a'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + 3, sy + 10); ctx.lineTo(sx + TS - 3, sy + 20);
      ctx.moveTo(sx + 3, sy + 22); ctx.lineTo(sx + TS - 3, sy + 8);
      ctx.stroke();
      ctx.fillStyle = '#3d2a1a';
      for (const [bx, by] of [[10, 12], [20, 18], [16, 15]]) { ctx.fillRect(sx + bx, sy + by - 3, 2, 6); ctx.fillRect(sx + bx - 2, sy + by - 1, 6, 2); }
    } else if (id === 'mine_trap') {
      ctx.fillStyle = '#1c2536'; ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 18, 9, 0, 7); ctx.fill();
      ctx.fillStyle = Math.sin(time * 6) > 0 ? '#ff4d6d' : '#5a1020';
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 14, 2.5, 0, 7); ctx.fill();
    } else if (id === 'flak_turret') {
      ctx.fillStyle = '#1c2536';
      ctx.save(); ctx.translate(sx + TS / 2, sy + 14); ctx.rotate(-0.8);
      ctx.fillRect(-3, -14, 6, 14); ctx.restore();
      ctx.fillRect(sx + 8, sy + 14, 16, 8);
    } else if (id === 'mega_sentry') {
      ctx.fillStyle = '#1c2536'; ctx.fillRect(sx + 6, sy + 2, 20, 12);
      ctx.fillRect(sx + 12, sy + 5, 18, 3); ctx.fillRect(sx + 12, sy + 10, 18, 3);
      ctx.fillStyle = '#ff4d6d'; ctx.fillRect(sx + 10, sy + 6, 4, 4);
    } else if (id === 'frost_coil') {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(sx + 6 + k * 10, sy + 6); ctx.lineTo(sx + 9 + k * 10, sy + 16 + (k % 2) * 5); ctx.lineTo(sx + 12 + k * 10, sy + 6); ctx.fill();
      }
    } else if (id === 'fortress_core') {
      ctx.fillStyle = '#7f4f24'; ctx.fillRect(sx + TS / 2 - 2, sy + 2, 4, 14);
      ctx.fillStyle = '#c1121f';
      ctx.beginPath(); ctx.moveTo(sx + TS / 2 + 2, sy + 3); ctx.lineTo(sx + TS / 2 + 14, sy + 6 + Math.sin(time * 4) * 2); ctx.lineTo(sx + TS / 2 + 2, sy + 10); ctx.fill();
    } else if (id === 'lure_buoy') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 12, 7, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 12, 7, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx + TS / 2, sy + 19); ctx.lineTo(sx + TS / 2 + Math.sin(time * 4) * 4, sy + 28); ctx.stroke();
    } else if (id === 'fortune_totem') {
      ctx.fillStyle = '#6ee7ff';
      ctx.save(); ctx.translate(sx + TS / 2, sy + TS / 2); ctx.rotate(time);
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (id === 'xp_shrine') {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.6 + 0.3 * Math.sin(time * 3)) + ')';
      ctx.beginPath(); ctx.moveTo(sx + TS / 2, sy + 6); ctx.lineTo(sx + TS / 2 - 8, sy + 22); ctx.lineTo(sx + TS / 2 + 8, sy + 22); ctx.closePath(); ctx.fill();
      ctx.fillRect(sx + TS / 2 - 2, sy + 22, 4, 6);
    } else if (id === 'scare_totem') {
      ctx.fillStyle = '#0d1526';
      ctx.beginPath(); ctx.ellipse(sx + 11, sy + 13, 4, 6, 0, 0, 7); ctx.ellipse(sx + 21, sy + 13, 4, 6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 24, 4, 0, Math.PI); ctx.fill();
      ctx.fillStyle = Math.sin(time * 2 + tx) > 0.7 ? '#ffd166' : '#0d1526';
      ctx.fillRect(sx + 9, sy + 11, 3, 3); ctx.fillRect(sx + 19, sy + 11, 3, 3);
    } else if (id === 'jukebox') {
      ctx.save(); ctx.translate(sx + TS / 2, sy + TS / 2); ctx.rotate(time * 3);
      ctx.fillStyle = '#0d1526'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, 4); ctx.stroke();
      ctx.restore();
    } else if (id === 'mega_spring') {
      ctx.strokeStyle = '#0d1526'; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.moveTo(sx + 5, sy + 7 + k * 6); ctx.lineTo(sx + TS - 5, sy + 7 + k * 6); }
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.fillRect(sx + 4, sy + 2, TS - 8, 4);
    } else if (id === 'torch' || id === 'hearth' || id === 'eruption_pad') {
      // flame flicker
      ctx.fillStyle = 'rgba(255,209,102,' + (0.5 + 0.3 * Math.sin(time * 9 + tx * 3)) + ')';
      const fh = 9 + Math.sin(time * 7 + tx) * 3;
      ctx.beginPath(); ctx.moveTo(sx + 10, sy + 16); ctx.lineTo(sx + TS / 2, sy + 16 - fh); ctx.lineTo(sx + TS - 10, sy + 16); ctx.fill();
      ctx.fillStyle = 'rgba(255,87,20,0.7)';
      ctx.beginPath(); ctx.moveTo(sx + 13, sy + 17); ctx.lineTo(sx + TS / 2, sy + 17 - fh * 0.6); ctx.lineTo(sx + TS - 13, sy + 17); ctx.fill();
    } else if (it.fx && it.fx.sentry && !['sentry', 'mega_sentry', 'flak_turret'].includes(id)) {
      // generic turret barrel for the elemental turret family
      ctx.fillStyle = '#1c2536'; ctx.fillRect(sx + 7, sy + 5, 16, 10);
      ctx.fillRect(sx + 18, sy + 8, 12, 4);
      ctx.fillStyle = it.color2; ctx.fillRect(sx + 10, sy + 8, 4, 4);
    } else if (id === 'note_block') {
      ctx.fillStyle = '#0d1526';
      ctx.beginPath(); ctx.arc(sx + 13, sy + 20, 4, 0, 7); ctx.fill();
      ctx.fillRect(sx + 15, sy + 8, 3, 12);
      ctx.fillRect(sx + 15, sy + 8, 9, 3);
      const pitch = (this.meta[this.idx(tx, ty)] || {}).pitch || 0;
      ctx.fillStyle = '#fff'; ctx.font = '8px monospace'; ctx.textAlign = 'right';
      ctx.fillText(pitch, sx + TS - 3, sy + TS - 4);
    }
  }

  drawTree(ctx, tr, sx, sy, time) {
    const prog = this.treeProgress(tr);
    const ready = this.treeReady(tr);
    const col = ITEMS[tr.result] ? ITEMS[tr.result].color : '#8f8';
    ctx.save();
    ctx.translate(sx + TS / 2, sy + TS);
    const sway = Math.sin(time * 1.4 + sx * 0.05) * 0.06 + Math.sin(time * 3.1 + sy) * 0.02;
    const h = 8 + prog * 20;
    // trunk bends with the wind
    ctx.strokeStyle = '#6a8f3f'; ctx.lineWidth = 3 + prog * 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(sway * 10, -h * 0.6, sway * h * 0.8, -h); ctx.stroke();
    ctx.translate(sway * h * 0.8, -h);
    ctx.rotate(sway);
    const r = 5 + prog * 9;
    ctx.fillStyle = ready ? '#57904a' : '#4a6b32';
    if (ready) { ctx.shadowColor = col; ctx.shadowBlur = 8 + Math.sin(time * 5) * 4; }
    ctx.beginPath(); ctx.arc(0, -r * 0.5, r, 0, 7); ctx.fill();
    if (prog > 0.5) {
      ctx.beginPath(); ctx.arc(-r * 0.7, 2 - r * 0.3, r * 0.7, 0, 7); ctx.arc(r * 0.7, 2 - r * 0.3, r * 0.7, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
    // fruit: the item itself, ripening from buds
    if (prog > 0.55) {
      const fr = ready ? 4 : 2.5;
      ctx.fillStyle = ready ? col : '#7a9a5a';
      for (const [fx2, fy2] of [[-r * 0.55, -r * 0.2], [r * 0.5, -r * 0.55], [0, r * 0.25]]) {
        ctx.beginPath(); ctx.arc(fx2, fy2, fr + (ready ? Math.sin(time * 4 + fx2) * 0.7 : 0), 0, 7); ctx.fill();
      }
      if (ready) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (const [fx2, fy2] of [[-r * 0.55, -r * 0.2], [r * 0.5, -r * 0.55], [0, r * 0.25]]) {
          ctx.beginPath(); ctx.arc(fx2 - 1.3, fy2 - 1.3, 1.3, 0, 7); ctx.fill();
        }
      }
    }
    ctx.rotate(-sway);
    if (ready) {
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('✦', 0, -r - 8 + Math.sin(time * 3) * 2);
    } else if (tr.spliced) {
      ctx.fillStyle = '#2de2a3'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('SPLICED', 0, -r - 8);
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
    const bdata = this.bgT.map(t => {
      if (!t) return 0;
      if (pi[t] === undefined) { pi[t] = pal.length + 1; pal.push(t); }
      return pi[t];
    });
    const trees = [];
    this.trees.forEach((tr, i) => trees.push([i, tr.result, tr.plantedAt, tr.growTime, tr.spliced ? 1 : 0]));
    return { pal, data, bdata, bg: Array.from(this.bg), meta: this.meta, trees, themeIdx: this.themeIdx, doorIdx: this.doorIdx, biome: this.biome };
  }
  static deserializeHome(s) {
    const w = World.genHome(null); // fresh shell (portals, theme, spawn)
    if (s && s.pal) {
      w.tiles = s.data.map(v => v === 0 ? null : s.pal[v - 1] || null);
      if (s.bdata) w.bgT = s.bdata.map(v => v === 0 ? null : s.pal[v - 1] || null);
      w.bg = Uint8Array.from(s.bg);
      w.meta = s.meta || {};
      w.trees = new Map();
      for (const [i, result, plantedAt, growTime, spliced] of s.trees) {
        if (ITEMS[result]) w.trees.set(i, { result, plantedAt, growTime, spliced: !!spliced });
      }
      w.applyWeather(s.themeIdx || 0);
      w.doorIdx = s.doorIdx === undefined ? -1 : s.doorIdx;
      World.ensurePlatform(w);
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

  // biome palettes for founded worlds (World Locks)
  static biomeTheme(biome) {
    return {
      verdant:  { sky: ['#12294d', '#3a6ea5'], bgWall: 'rgba(30,22,16,0.85)', dark: 0 },
      desert:   { sky: ['#3d2410', '#e0a458'], bgWall: 'rgba(48,32,14,0.85)', dark: 0 },
      tundra:   { sky: ['#22304a', '#9db4d0'], bgWall: 'rgba(26,34,52,0.85)', dark: 0 },
      volcanic: { sky: ['#1a0808', '#69201a'], bgWall: 'rgba(40,12,8,0.88)', dark: 0.35 },
    }[biome] || { sky: ['#12294d', '#3a6ea5'], bgWall: 'rgba(30,22,16,0.85)', dark: 0 };
  }

  static genHomeLike(w, biome, seed) {
    const hs = World.surfaceLine(w.w, 24, 2.5, seed || 7);
    for (let x = 0; x < w.w; x++) {
      for (let y = hs[x]; y < w.h; y++) {
        const depth = y - hs[x];
        let id;
        if (biome === 'desert') id = depth < 6 ? 'sand' : 'stone';
        else if (biome === 'tundra') id = depth < 2 ? 'snow' : depth < 7 ? 'dirt' : 'stone';
        else if (biome === 'volcanic') id = depth < 2 ? 'stone' : hash2(x, y) < 0.15 ? 'dirt' : 'stone';
        else id = depth < 7 ? 'dirt' : 'stone';
        w.set(x, y, id);
        if (depth >= 1) w.bg[w.idx(x, y)] = 1;
      }
    }
    World.carveCaves(w, 7, 30);
    World.pocket(w, 'wood', biome === 'desert' ? 4 : 10, 26, 45, 7);
    World.pocket(w, 'sand', biome === 'desert' ? 0 : 8, 25, 50, 7);
    if (biome === 'tundra') { World.pocket(w, 'ice', 10, hs[0], 40, 7); World.pocket(w, 'snow', 6, 26, 45, 6); }
    if (biome === 'volcanic') { World.pocket(w, 'magma', 9, 28, w.h - 6, 6); World.pocket(w, 'corrupt', 5, 30, w.h - 6, 5); }
    if (biome === 'desert') {
      // cacti (spike traps you can harvest!)
      for (let c = 0; c < 8; c++) {
        const cx2 = 6 + Math.floor(hash2(c, seed || 7) * (w.w - 12));
        if (cx2 > 34 && cx2 < 66) continue;
        for (let y = 2; y < w.h - 3; y++) if (w.isSolid(cx2, y)) { if (!w.get(cx2, y - 1)) w.set(cx2, y - 1, 'spike_trap'); break; }
      }
    }
    // fishing ponds (frozen over in tundra, dry in desert/volcanic)
    if (biome !== 'desert' && biome !== 'volcanic') {
      for (const px of [18, 78]) {
        const py2 = hs[px];
        for (let dx = -4; dx <= 4; dx++) {
          const depth = 3 - Math.floor(Math.abs(dx) * 0.7);
          for (let dy = 0; dy < depth; dy++) w.set(px + dx, py2 + dy, dy === 0 && biome === 'tundra' && Math.abs(dx) > 1 ? 'ice' : 'water');
          for (let dy = depth; dy < 4; dy++) if (!w.get(px + dx, py2 + dy)) w.set(px + dx, py2 + dy, 'dirt');
        }
      }
    }
    // spawn platform: flatten x 36..64
    const py = 22;
    for (let x = 36; x <= 64; x++) {
      for (let y = 0; y < py; y++) { w.set(x, y, null); }
      w.set(x, py, 'bedrock');
      for (let y = py + 1; y < py + 4; y++) if (!w.get(x, y)) w.set(x, y, biome === 'desert' ? 'sand' : 'dirt');
    }
    w.spawn = { x: 50 * TS, y: (py - 2) * TS };
    return py;
  }

  static genHome() {
    const w = new World('home', 'HOME SERVER', 100, 60, World.biomeTheme('verdant'));
    w.isHome = true;
    w.biome = 'verdant';
    const py = World.genHomeLike(w, 'verdant', 7);
    World.addHomePortals(w, py);
    return w;
  }

  // a world founded with a World Lock — random biome, fully persistent
  static genOwned(name, biome) {
    const w = new World('world:' + name, name.toUpperCase(), 100, 60, World.biomeTheme(biome));
    w.isHome = true; w.ownedName = name; w.biome = biome;
    const py = World.genHomeLike(w, biome, 7 + name.length * 13 + biome.length);
    w.portals.push({ x: 39 * TS, y: py * TS, target: 'home', label: 'HOME', color: '#2de2a3' });
    return w;
  }
  static deserializeOwned(name, s) {
    const w = World.genOwned(name, s.biome || 'verdant');
    if (s && s.pal) {
      w.tiles = s.data.map(v => v === 0 ? null : s.pal[v - 1] || null);
      if (s.bdata) w.bgT = s.bdata.map(v => v === 0 ? null : s.pal[v - 1] || null);
      w.bg = Uint8Array.from(s.bg);
      w.meta = s.meta || {};
      w.trees = new Map();
      for (const [i, result, plantedAt, growTime, spliced] of s.trees) {
        if (ITEMS[result]) w.trees.set(i, { result, plantedAt, growTime, spliced: !!spliced });
      }
      w.applyWeather(s.themeIdx || 0);
      w.doorIdx = s.doorIdx === undefined ? -1 : s.doorIdx;
    }
    return w;
  }

  /* ---- BLACK SPIRE: wave-defense arena ---- */
  static genSpire() {
    const w = new World('spire', 'BLACK SPIRE', 56, 32, { sky: ['#0a0a14', '#1c1c30'], bgWall: 'rgba(16,16,30,0.9)', dark: 0.55 });
    w.isSpire = true;
    const fy = 24;
    for (let x = 0; x < w.w; x++) for (let y = fy; y < w.h; y++) w.set(x, y, y === fy ? 'brick' : 'bedrock');
    // side pillars for cover
    for (const px of [14, 28, 42]) { for (let y = fy - 3; y < fy; y++) w.set(px, y, 'brick'); }
    World.frame(w);
    w.spawn = { x: 5 * TS, y: (fy - 2) * TS };
    w.portals.push({ x: 2.5 * TS, y: fy * TS, target: 'home', label: 'EXIT', color: '#2de2a3' });
    for (let x = 8; x < w.w - 4; x += 4) w.spawnPoints.push({ x, y: fy - 1 });
    return w;
  }

  static addHomePortals(w, py) {
    const meta = [
      ['mine', 'MINESHAFT', '#b87333', () => false],
      ['stack', 'THE STACK', '#f7a8d8', () => false],
      ['sector1', 'FIREWALL SECTOR', '#ff5714', () => game.bossKillCount < 0],
      ['sector2', 'DATA MINES', '#c77dff', () => game.bossKillCount < 1],
      ['sector5', 'FLOODED ARCHIVE', '#38d9f5', () => game.bossKillCount < 2],
      ['sector3', 'THE CLOUD', '#6ee7ff', () => game.bossKillCount < 2],
      ['sector6', 'SHADOW PARTITION', '#8d80c9', () => game.bossKillCount < 3],
      ['sector4', 'THE CORE', '#ffd166', () => game.bossKillCount < 4],
      ['spire', 'BLACK SPIRE', '#8d99ae', () => game.bossKillCount < 1],
      ['rush', 'BOSS RUSH', '#ff4d6d', () => !game.progress.beaten.admin],
    ];
    meta.forEach(([id, label, color, locked], k) => {
      w.portals.push({ x: (36.6 + k * 2.8) * TS, y: py * TS, target: id, label, color, labelUp: k % 2 === 1, locked });
    });
  }

  // patch older saved home worlds so the wider portal row has floor
  static ensurePlatform(w) {
    const py = 22;
    for (let x = 36; x <= 64; x++) {
      for (let y = py - 6; y < py; y++) { const t = w.get(x, y); if (t && t !== 'bedrock') w.set(x, y, null); }
      w.set(x, py, 'bedrock');
      for (let y = py + 1; y < py + 4; y++) if (!w.get(x, y)) w.set(x, y, 'dirt');
    }
  }

  /* ---- THE MINESHAFT: deep vertical mining world ---- */
  static genMine() {
    const w = new World('mine', 'THE MINESHAFT', 64, 140, { sky: ['#1a1208', '#2e2214'], bgWall: 'rgba(24,16,8,0.9)', dark: 0.8 });
    w.isMine = true;
    const sy = 10;
    for (let x = 0; x < w.w; x++) for (let y = sy; y < w.h; y++) {
      w.set(x, y, hash2(x, y) < 0.22 ? 'dirt' : 'stone');
      w.bg[w.idx(x, y)] = 1;
    }
    World.carveCaves(w, 28, sy + 4);
    World.pocket(w, 'copper_ore', 30, sy + 3, 55, 5);
    World.pocket(w, 'silver_ore', 24, 55, 100, 5);
    World.pocket(w, 'aurum_ore', 18, 95, w.h - 4, 4);
    World.pocket(w, 'core_crystal', 8, 110, w.h - 4, 2);
    World.pocket(w, 'magma', 14, 70, w.h - 4, 5);
    // surface deck
    for (let x = 1; x < w.w - 1; x++) { for (let y = 1; y < sy; y++) w.set(x, y, null); w.set(x, sy, 'dirt'); }
    w.spawn = { x: 26 * TS, y: (sy - 2) * TS };
    World.frame(w);
    w.portals.push({ x: 20 * TS, y: sy * TS, target: 'home', label: 'EXIT', color: '#2de2a3' });
    for (let x = 6; x < w.w - 4; x += 3) {
      for (let y = sy + 2; y < w.h - 4; y++) {
        if (w.isSolid(x, y) && !w.get(x, y - 1) && !w.get(x, y - 2)) { w.spawnPoints.push({ x, y: y - 1 }); break; }
      }
    }
    w.enemyTypes = ['glitchling', 'brute', 'spitter'];
    w.enemyCap = 8;
    return w;
  }

  /* ---- THE STACK: vertical parkour gauntlet ---- */
  static genStack() {
    const w = new World('stack', 'THE STACK', 40, 110, { sky: ['#2b1055', '#7597de'], bgWall: 'rgba(30,20,60,0.5)', dark: 0 });
    w.isStack = true;
    const fy = 104;
    for (let x = 0; x < w.w; x++) for (let y = fy; y < w.h; y++) w.set(x, y, 'brick');
    let px = 8, y = fy - 4;
    while (y > 16) {
      const pw = 4 + Math.floor(hash2(y, 3) * 4);
      for (let x = px; x < Math.min(px + pw, w.w - 2); x++) w.set(x, y, 'stone');
      const r = hash2(y, 4);
      if (r < 0.28) w.set(px + Math.floor(pw / 2), y - 1, 'spike_trap');
      else if (r < 0.46) w.set(Math.min(px + pw - 1, w.w - 3), y - 1, 'spring_pad');
      else if (r < 0.58) { const cx2 = px + 1; w.set(cx2, y - 1, 'conveyor'); w.meta[w.idx(cx2, y - 1)] = { dir: hash2(y, 9) < 0.5 ? 1 : -1 }; }
      if (hash2(y, 5) < 0.2 && px > 5) w.set(px - 2, y, 'magma');
      const dir = px > 24 ? -1 : (px < 8 ? 1 : (hash2(y, 6) < 0.5 ? -1 : 1));
      px = Math.max(3, Math.min(w.w - 10, px + dir * (3 + Math.floor(hash2(y, 7) * 4))));
      y -= 3;
    }
    // summit
    for (let x = 8; x < 32; x++) w.set(x, 13, 'brick');
    w.set(16, 12, 'gold_cache'); w.set(19, 12, 'gold_cache'); w.set(22, 12, 'gold_cache');
    w.set(19, 11, null);
    World.frame(w);
    w.spawn = { x: 6 * TS, y: (fy - 2) * TS };
    w.portals.push({ x: 3 * TS, y: fy * TS, target: 'home', label: 'EXIT', color: '#2de2a3' });
    return w;
  }

  static genRush() {
    const w = new World('rush', 'BOSS RUSH', 74, 36, { sky: ['#14020a', '#4a1024'], bgWall: 'rgba(30,5,15,0.9)', dark: 0.4 });
    const fy = 27;
    for (let x = 0; x < w.w; x++) for (let y = fy; y < w.h; y++) w.set(x, y, y === fy ? 'brick' : 'bedrock');
    World.frame(w);
    w.spawn = { x: 6 * TS, y: (fy - 2) * TS };
    w.portals.push({ x: 3 * TS, y: fy * TS, target: 'home', label: 'EXIT', color: '#2de2a3' });
    w.isRush = true;
    return w;
  }

  static genSector(n) {
    const defs = {
      1: { name: 'FIREWALL SECTOR', sky: ['#1a0505', '#5c1a0a'], bgWall: 'rgba(40,10,5,0.85)', dark: 0.5, ground: 'stone', hazard: 'magma', enemies: ['ember', 'drone', 'brute'], cap: 6, boss: 'firewall_daemon' },
      2: { name: 'DATA MINES', sky: ['#0a0514', '#241448'], bgWall: 'rgba(18,8,30,0.9)', dark: 0.8, ground: 'stone', hazard: null, enemies: ['glitchling', 'ember', 'spitter'], cap: 7, boss: 'null_wurm' },
      3: { name: 'THE CLOUD', sky: ['#4a6ea8', '#a8c8e8'], bgWall: 'rgba(120,140,180,0.4)', dark: 0, ground: 'cloudb', hazard: null, enemies: ['drone', 'zapper'], cap: 7, boss: 'storm_kernel' },
      4: { name: 'THE CORE', sky: ['#14020a', '#3d0a1e'], bgWall: 'rgba(30,5,15,0.9)', dark: 0.6, ground: 'corrupt', hazard: 'magma', enemies: ['glitchling', 'zapper', 'spitter', 'brute'], cap: 9, boss: 'admin' },
      5: { name: 'FLOODED ARCHIVE', sky: ['#02131f', '#0a3d52'], bgWall: 'rgba(6,30,42,0.9)', dark: 0.3, ground: 'stone', hazard: null, enemies: ['drone', 'spitter', 'glitchling'], cap: 7, boss: 'kraken', flood: 24 },
      6: { name: 'SHADOW PARTITION', sky: ['#030308', '#0d0d1a'], bgWall: 'rgba(10,10,20,0.92)', dark: 0.95, ground: 'corrupt', hazard: null, enemies: ['wraith', 'glitchling', 'zapper'], cap: 8, boss: 'rootkit' },
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
          if (n === 4 || n === 6) id = hash2(x, y) < 0.5 ? 'corrupt' : 'stone';
          if (n === 5) id = hash2(x, y) < 0.2 ? 'sand' : 'stone';
          w.set(x, y, id);
          if (depth >= 1) w.bg[w.idx(x, y)] = 1;
        }
      }
      World.carveCaves(w, n === 2 ? 14 : 8, n === 2 ? 16 : 26);
      if (defs.hazard) World.pocket(w, defs.hazard, n === 4 ? 14 : 10, hs[0] + 2, w.h - 6, 6);
      if (n === 2) { World.pocket(w, 'corrupt', 16, 16, w.h - 6, 8); World.pocket(w, 'wood', 6, 16, 40, 6); }
      // spawn ledge
      const ly = n === 5 ? 21 : hs[4];
      for (let x = 2; x <= 8; x++) { for (let y = 0; y < ly; y++) w.set(x, y, null); w.set(x, ly, 'bedrock'); }
      w.spawn = { x: 5 * TS, y: (ly - 2) * TS };
      // boss arena: flatten last 26 tiles
      const ay = n === 2 ? 34 : n === 5 ? 30 : 26;
      for (let x = w.w - 28; x < w.w - 1; x++) {
        for (let y = 2; y < ay; y++) w.set(x, y, null);
        for (let y = ay; y < w.h - 2; y++) if (!w.get(x, y)) w.set(x, y, defs.ground);
        w.set(x, ay, (n === 4 || n === 6) ? 'corrupt' : defs.ground);
      }
      w.bossZone = { x1: (w.w - 26) * TS, spawnX: (w.w - 13) * TS, spawnY: (ay - 7) * TS };
      // flood pass (FLOODED ARCHIVE): open space below the waterline fills with liquid data
      if (defs.flood) {
        for (let x = 1; x < w.w - 1; x++) for (let y = defs.flood; y < w.h - 2; y++) {
          if (!w.get(x, y)) w.set(x, y, 'water');
        }
      }
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
    // cipher gate: seal the arena entrance column (through open air AND water)
    w.gateCol = Math.floor(w.bossZone.x1 / TS) - 1;
    for (let y = 2; y < w.h - 2; y++) {
      const t = w.get(w.gateCol, y);
      if (!t || t === 'water') w.set(w.gateCol, y, 'gate');
    }
    // 3 cipher keys hidden across the sector (Pixel Worlds Netherworld style)
    const before = w.spawnPoints.filter(s => s.x < w.gateCol - 3 && s.x > 8);
    for (const frac of [0.28, 0.55, 0.82]) {
      const targetX = w.w * frac;
      if (!before.length) break;
      const s = before.reduce((a, b) => Math.abs(a.x - targetX) < Math.abs(b.x - targetX) ? a : b);
      before.splice(before.indexOf(s), 1);
      w.keySpots.push({ x: s.x * TS + TS / 2, y: (s.y - 1) * TS });
    }
    // loot caches
    let placedChests = 0;
    for (let tries = 0; tries < 200 && placedChests < 6; tries++) {
      const s = w.spawnPoints[Math.floor(Math.random() * w.spawnPoints.length)];
      if (!s || s.x >= w.gateCol - 1) continue;
      if (!w.get(s.x, s.y) && w.isSolid(s.x, s.y + 1)) { w.set(s.x, s.y, 'chest'); placedChests++; }
    }
    // secret vault: a sealed brick room buried somewhere — dig to find it
    const vx = 14 + Math.floor(Math.random() * Math.max(4, w.gateCol - 24));
    const vy = Math.min(w.h - 9, 28 + Math.floor(Math.random() * (w.h - 38)));
    for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 5; dy++) {
      const edge = dx === 0 || dy === 0 || dx === 6 || dy === 4;
      w.set(vx + dx, vy + dy, edge ? 'brick' : null);
    }
    w.set(vx + 3, vy + 3, 'gold_cache');
    w.set(vx + 1, vy + 3, 'chest'); w.set(vx + 5, vy + 3, 'chest');
    return w;
  }
}
