'use strict';
/* ============================================================
   GLITCHTOPIA — entities: physics base, enemies, drops,
   projectiles, particles, sound
   ============================================================ */

class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0; this.dead = false;
    this.onGround = false; this.gravity = 1900;
  }
  aabb() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
  overlaps(o) {
    return Math.abs(this.x - o.x) < (this.w + o.w) / 2 && Math.abs(this.y - o.y) < (this.h + o.h) / 2;
  }
  // swept tile collision
  moveAndCollide(dt, world) {
    this.onGround = false;
    // horizontal
    let nx = this.x + this.vx * dt;
    const hw = this.w / 2, hh = this.h / 2 - 0.01;
    if (this.vx !== 0) {
      const dir = Math.sign(this.vx);
      const edge = nx + dir * hw;
      const tx = Math.floor(edge / TS);
      let hit = false;
      for (let ty = Math.floor((this.y - hh) / TS); ty <= Math.floor((this.y + hh) / TS); ty++) {
        if (world.isSolid(tx, ty)) { hit = true; break; }
      }
      if (hit) { nx = dir > 0 ? tx * TS - hw - 0.01 : (tx + 1) * TS + hw + 0.01; this.vx = 0; }
    }
    this.x = nx;
    // vertical
    const preBottom = this.y + this.h / 2;
    let ny = this.y + this.vy * dt;
    if (this.vy !== 0) {
      const dir = Math.sign(this.vy);
      const edge = ny + dir * this.h / 2;
      const ty = Math.floor(edge / TS);
      let hit = false, hitTile = null;
      for (let tx = Math.floor((this.x - hw + 0.01) / TS); tx <= Math.floor((this.x + hw - 0.01) / TS); tx++) {
        if (world.isSolid(tx, ty)) { hit = true; hitTile = world.get(tx, ty); break; }
        // one-way platforms: solid only when falling onto them from above
        if (dir > 0 && !this.dropThrough) {
          const it2 = world.item(tx, ty);
          if (it2 && it2.fx && it2.fx.platform && preBottom <= ty * TS + 4) { hit = true; hitTile = world.get(tx, ty); break; }
        }
      }
      if (hit) {
        ny = dir > 0 ? ty * TS - this.h / 2 - 0.01 : (ty + 1) * TS + this.h / 2 + 0.01;
        if (dir > 0) {
          this.onGround = true;
          this.groundTile = hitTile;
          const it = ITEMS[hitTile];
          const bounceStr = it && it.fx && (it.fx.bounce || (it.fx.softBounce && this.vy > 260 ? it.fx.softBounce : 0));
          if (bounceStr && this.vy > 200) {
            this.vy = -bounceStr;
            this.onGround = false;
            if (game) {
              game.fx.puff(this.x, ny + this.h / 2, it.fx.softBounce ? '#eef3fb' : '#3ddc84');
              if (it.fx.note) game.sfx.note([0, 2, 4, 7, 9, 12][Math.floor(Math.random() * 6)]);
              else game.sfx.play('bounce');
            }
          } else this.vy = 0;
        } else this.vy = 0;
      } else this.groundTile = null;
    }
    this.y = ny;
  }
  tilesTouching(world, cb) {
    const hw = this.w / 2 - 1, hh = this.h / 2 - 1;
    for (let ty = Math.floor((this.y - hh) / TS); ty <= Math.floor((this.y + hh + 2) / TS); ty++) {
      for (let tx = Math.floor((this.x - hw) / TS); tx <= Math.floor((this.x + hw) / TS); tx++) {
        const it = world.item(tx, ty);
        if (it) cb(it, tx, ty);
      }
    }
  }
}

/* ===================== ENEMIES ===================== */
const ENEMY_DEFS = {
  glitchling: { hp: 34, dmg: 12, speed: 90, color: '#c77dff', color2: '#7b2cbf', w: 26, h: 24, ai: 'walker', gems: [2, 6] },
  ember:      { hp: 26, dmg: 14, speed: 70, color: '#ff5714', color2: '#ffd166', w: 24, h: 24, ai: 'hopper', gems: [2, 5] },
  drone:      { hp: 24, dmg: 10, speed: 110, color: '#8899aa', color2: '#ff4d6d', w: 26, h: 18, ai: 'flyer', gems: [3, 6] },
  zapper:     { hp: 30, dmg: 12, speed: 95, color: '#6ee7ff', color2: '#ffd166', w: 26, h: 20, ai: 'flyer', shoots: true, gems: [3, 8] },
  spitter:    { hp: 40, dmg: 10, speed: 55, color: '#94d82d', color2: '#5c940d', w: 28, h: 22, ai: 'walker', lobs: true, gems: [3, 8] },
  brute:      { hp: 120, dmg: 22, speed: 45, color: '#e8590c', color2: '#862e0a', w: 40, h: 36, ai: 'walker', gems: [8, 14] },
  warden:     { hp: 550, dmg: 26, speed: 65, color: '#f1c40f', color2: '#7d6608', w: 52, h: 46, ai: 'walker', lobs: true, miniboss: true, gems: [60, 90] },
  wraith:     { hp: 20, dmg: 14, speed: 170, color: '#2a2a3d', color2: '#ff4d6d', w: 24, h: 26, ai: 'flyer', gems: [4, 9] },
  hornet:     { hp: 14, dmg: 9, speed: 200, color: '#ffb703', color2: '#3d2e00', w: 20, h: 16, ai: 'flyer', gems: [2, 5] },
  sapper:     { hp: 46, dmg: 16, speed: 60, color: '#8d6a3f', color2: '#4d3620', w: 28, h: 26, ai: 'walker', digger: true, gems: [4, 9] },
  shielder:   { hp: 60, dmg: 12, speed: 70, color: '#4a5568', color2: '#8ecae6', w: 30, h: 30, ai: 'walker', frontShield: true, gems: [5, 11] },
  mender:     { hp: 34, dmg: 6, speed: 90, color: '#95d5b2', color2: '#2d6a4f', w: 24, h: 22, ai: 'flyer', mender: true, gems: [5, 12] },
  golem:      { hp: 210, dmg: 24, speed: 34, color: '#6b7280', color2: '#374151', w: 44, h: 42, ai: 'walker', gems: [10, 18] },
  phantom:    { hp: 28, dmg: 15, speed: 185, color: '#7048c0', color2: '#c77dff', w: 24, h: 24, ai: 'flyer', shoots: true, gems: [5, 11] },
};

class Enemy extends Entity {
  constructor(type, x, y, lvl, opts) {
    const d = ENEMY_DEFS[type];
    const elite = !!(opts && opts.elite);
    super(x, y, elite ? d.w * 1.5 : d.w, elite ? d.h * 1.5 : d.h);
    this.type = type; this.def = d;
    this.lvl = lvl || 1;
    this.elite = elite;
    const mult = (1 + (this.lvl - 1) * 0.55) * (elite ? 3 : 1);
    this.maxHp = Math.round(d.hp * mult); this.hp = this.maxHp;
    this.dmg = Math.round(d.dmg * (1 + (this.lvl - 1) * 0.3) * (elite ? 1.5 : 1));
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.t = Math.random() * 10;
    this.burn = 0; this.burnT = 0; this.chillT = 0;
    this.shootT = 1 + Math.random() * 2;
    this.hitFlash = 0;
    if (d.ai === 'flyer') this.gravity = 0;
  }
  hurt(dmg, game, kx) {
    this.hp -= dmg;
    this.hitFlash = 0.12;
    this.vx += (kx || 0);
    game.fx.hitNum(this.x, this.y - this.h, dmg);
    game.fx.spark(this.x, this.y, '#fff', 4);
    game.sfx.play('hit');
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.progress.stats.kills++;
      game.addXp(Math.max(3, Math.round(this.maxHp / 8)));
      game.fx.explode(this.x, this.y, this.def.color, this.def.miniboss ? 34 : 14);
      game.sfx.play('kill');
      const [g0, g1] = this.def.gems;
      game.spawnGems(this.x, this.y, (g0 + Math.floor(Math.random() * (g1 - g0 + 1)) * this.lvl) * (this.elite ? 4 : 1));
      if (this.elite) { // elite guaranteed loot
        game.spawnDrop(this.x, this.y, 'medkit', 1);
        game.spawnDrop(this.x, this.y, 'corrupted_drive', 1);
        if (Math.random() < 0.3) game.spawnDrop(this.x, this.y, 'mystery_seed', 1);
        game.fx.explode(this.x, this.y, '#ffd166', 26);
        game.toast('★ Elite purged — extra loot dropped!', 'gold');
      }
      if (Math.random() < 0.06) game.spawnDrop(this.x, this.y, 'medkit', 1);
      if (Math.random() < 0.05) game.spawnDrop(this.x, this.y, 'bomb', 1);
      if (Math.random() < 0.05) game.spawnDrop(this.x, this.y, 'corrupted_drive', 1);
      if (this.def.miniboss) { // WARDEN treasure (Pixel Worlds nether miniboss homage)
        game.spawnDrop(this.x, this.y, 'mystery_seed', 1);
        game.spawnDrop(this.x, this.y, 'medkit', 2);
        if (Math.random() < 0.35) game.spawnDrop(this.x, this.y, 'golden_fish', 1);
        game.toast('★ WARDEN destroyed — treasure secured!', 'gold');
      }
    }
  }
  update(dt, world, game) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.burnT > 0) {
      this.burnT -= dt;
      this._burnTick = (this._burnTick || 0) - dt;
      if (this._burnTick <= 0) { this._burnTick = 0.5; this.hurt(Math.round(this.burn * 0.5), game); game.fx.puff(this.x, this.y - this.h / 2, '#ff5714'); }
    }
    const p = game.player;
    const distP = Math.hypot(p.x - this.x, p.y - this.y);
    // frost coils chill everything near them
    this.chillT = Math.max(0, this.chillT - dt);
    if (world._coils) for (const c of world._coils) {
      if (Math.hypot(c.x - this.x, c.y - this.y) < 7 * TS) { this.chillT = 0.4; break; }
    }
    const spdM = this.chillT > 0 ? 0.5 : 1;
    if (this.chillT > 0 && Math.random() < 0.08) game.fx.add(this.x, this.y - this.h / 2, 0, -20, '#a8d8f0', 0.4, 2.5, 0);
    // scare totems: enemies flee the aura; bait totems: they can't resist
    let repelled = 0;
    if (world._repels) for (const rp of world._repels) {
      const d = Math.hypot(rp.x - this.x, rp.y - this.y);
      if (d < rp.r) { repelled = Math.sign(this.x - rp.x) || 1; break; }
    }
    if (!repelled && world._baits) for (const bt of world._baits) {
      const d = Math.hypot(bt.x - this.x, bt.y - this.y);
      if (d < bt.r && d > TS) {
        repelled = Math.sign(bt.x - this.x) || 1; // reuse the steering override, toward the bait
        if (this.def.ai === 'flyer') this.vy += Math.sign(bt.y - this.y) * 300 * dt;
        break;
      }
    }
    const ai = this.def.ai;
    if (repelled) {
      this.dir = repelled;
      if (ai === 'flyer') { this.vx += repelled * 700 * dt; }
    }
    if (ai === 'walker') {
      if (distP < 9 * TS && !repelled) this.dir = Math.sign(p.x - this.x) || this.dir;
      this.vx = this.dir * this.def.speed * spdM;
      if (this.def.lobs && distP < 10 * TS) {
        this.shootT -= dt;
        if (this.shootT <= 0) {
          this.shootT = this.def.miniboss ? 1.6 : 2.8;
          const dx = p.x - this.x, t = 0.9;
          const vx = dx / t, vy = (p.y - this.y) / t - 0.5 * 1100 * t;
          game.projectiles.push(new Projectile(this.x, this.y - this.h / 2, vx, vy, this.dmg, false, '#94d82d', { r: 7, gravity: 1100, life: 2.5 }));
          game.sfx.play('eshoot');
        }
      }
      // sappers tunnel straight through terrain toward you
      if (this.def.digger && distP < 16 * TS) {
        this._digT = (this._digT || 0) - dt;
        if (this._digT <= 0) {
          this._digT = 0.25;
          const ax = Math.floor((this.x + this.dir * (this.w / 2 + 3)) / TS);
          for (let dyi = -1; dyi <= 1; dyi++) {
            const ay = Math.floor(this.y / TS) + dyi;
            const t = world.item(ax, ay);
            if (t && !t.unbreakable && t.solid) { world.breakTile(ax, ay, game, true); game.fx.add(ax * TS + TS / 2, ay * TS + TS / 2, (Math.random() - 0.5) * 100, -60, t.color, 0.4, 3, 400); }
          }
        }
      }
      // hop over walls (non-diggers)
      if (this.onGround && !this.def.digger) {
        const aheadX = Math.floor((this.x + this.dir * (this.w / 2 + 4)) / TS);
        const footY = Math.floor((this.y + this.h / 2 - 4) / TS);
        if (world.isSolid(aheadX, footY)) this.vy = -560;
      }
      this.vy += this.gravity * dt;
    } else if (ai === 'hopper') {
      if (this.onGround) {
        this.vx = 0;
        this._hopT = (this._hopT || 0) - dt;
        if (this._hopT <= 0) {
          this._hopT = 0.9 + Math.random() * 0.8;
          if (distP < 10 * TS) this.dir = Math.sign(p.x - this.x) || this.dir;
          this.vx = this.dir * this.def.speed * 2.2 * spdM;
          this.vy = -520 * (spdM === 1 ? 1 : 0.75);
        }
      }
      this.vy += this.gravity * dt;
    } else if (ai === 'flyer') {
      if (distP < 12 * TS && !repelled) {
        const a = Math.atan2(p.y - 20 - this.y, p.x - this.x);
        this.vx += Math.cos(a) * 500 * dt;
        this.vy += Math.sin(a) * 500 * dt;
      }
      this.vx *= 0.98; this.vy *= 0.98;
      this.vy += Math.sin(this.t * 3) * 30 * dt;
      const sp = Math.hypot(this.vx, this.vy), max = this.def.speed * 1.6 * spdM;
      if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
      if (this.def.shoots && distP < 9 * TS) {
        this.shootT -= dt;
        if (this.shootT <= 0) {
          this.shootT = 2.2 + Math.random();
          const a = Math.atan2(p.y - this.y, p.x - this.x);
          game.projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * 380, Math.sin(a) * 380, this.dmg, false, '#ffd166'));
          game.sfx.play('eshoot');
        }
      }
      // menders keep their swarm alive
      if (this.def.mender) {
        this._healT = (this._healT || 0) - dt;
        if (this._healT <= 0) {
          this._healT = 1.2;
          for (const e of game.enemies) {
            if (e === this || e.dead || e.hp >= e.maxHp) continue;
            if (Math.hypot(e.x - this.x, e.y - this.y) < 6 * TS) {
              e.hp = Math.min(e.maxHp, e.hp + Math.round(e.maxHp * 0.12));
              game.fx.add(e.x, e.y - e.h / 2, 0, -40, '#95d5b2', 0.6, 3, 0);
            }
          }
        }
      }
    }
    this.moveAndCollide(dt, world);
    if (this.vx !== 0 && ai === 'walker' && this.onGround && Math.abs(this.vx) < 5) this.dir *= -1;
    // hazard tiles hurt enemies too (firewall blocks, grinders, barbed wire, mines!)
    this.tilesTouching(world, (it, ttx, tty) => {
      if (it.fx && it.fx.enemyDamage) {
        this._fwTick = (this._fwTick || 0) - dt;
        if (this._fwTick <= 0) {
          this._fwTick = 0.4;
          this.hurt(Math.round(it.fx.enemyDamage * 0.4), game);
          if (it.fx.enemyBurn) { this.burn = it.fx.enemyBurn.dps; this.burnT = it.fx.enemyBurn.dur; }
        }
      }
      if (it.fx && it.fx.mine && !this.dead) {
        world.breakTile(ttx, tty, game, true);
        game.sfx.play('boom');
        game.shake = Math.max(game.shake, 0.3);
        game.fx.explode(ttx * TS + TS / 2, tty * TS + TS / 2, '#ffd166', 22);
        for (const e of game.enemies) {
          if (!e.dead && Math.hypot(e.x - ttx * TS, e.y - tty * TS) < it.fx.mine.r * TS + 24) e.hurt(it.fx.mine.dmg, game);
        }
      }
      if (it.fx && (it.fx.sticky || it.fx.enemySticky)) this.vx *= 0.5;
    });
    // contact damage — to the player, and to the ally if it's in the way
    if (!this.dead && this.overlaps(p)) p.hurt(this.dmg, game, Math.sign(p.x - this.x) * 260, this);
    if (!this.dead && game.companions) for (const c of game.companions) {
      if (c.downT <= 0 && this.overlaps(c)) { c.hurt(this.dmg * 0.5, game); break; }
    }
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const d = this.def;
    const _rr = (typeof _rrPath === 'function') ? _rrPath : (c, X, Y, w, h) => c.rect(X, Y, w, h);
    const _sh = (typeof _shade === 'function') ? _shade : (h) => h;
    // soft ground shadow (grounders only)
    if (d.ai !== 'flyer') {
      ctx.save(); ctx.translate(sx, sy + this.h / 2 - 1); ctx.scale(1, 0.4);
      const gs = ctx.createRadialGradient(0, 0, 1, 0, 0, this.w * 0.7); gs.addColorStop(0, 'rgba(0,0,0,0.28)'); gs.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gs; ctx.beginPath(); ctx.arc(0, 0, this.w * 0.7, 0, 7); ctx.fill(); ctx.restore();
    }
    ctx.save(); ctx.translate(sx, sy);
    if (this.elite) { // pulsing golden aura + crown
      const pr = this.w * 0.7 + Math.sin(time * 4) * 3;
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, pr);
      g.addColorStop(0, 'rgba(255,209,102,0.35)'); g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, pr, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(-8, -this.h / 2 - 2); ctx.lineTo(-8, -this.h / 2 - 10); ctx.lineTo(-3, -this.h / 2 - 5); ctx.lineTo(0, -this.h / 2 - 11); ctx.lineTo(3, -this.h / 2 - 5); ctx.lineTo(8, -this.h / 2 - 10); ctx.lineTo(8, -this.h / 2 - 2); ctx.closePath(); ctx.fill();
    }
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.5)';
    const wob = Math.sin(this.t * 8) * 2;
    if (d.ai === 'flyer') {
      // rounded shaded chassis with a rim light
      const bg = ctx.createLinearGradient(0, -this.h / 2 + wob, 0, this.h / 2 - 6 + wob);
      bg.addColorStop(0, _sh(d.color, 0.25)); bg.addColorStop(1, _sh(d.color, -0.25));
      ctx.fillStyle = bg; _rr(ctx, -this.w / 2, -this.h / 2 + wob, this.w, this.h - 6, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1; _rr(ctx, -this.w / 2, -this.h / 2 + wob, this.w, this.h - 6, 4); ctx.stroke();
      ctx.fillStyle = d.color2; _rr(ctx, -4, -this.h / 2 + 4 + wob, 8, 6, 2); ctx.fill();
      // rotor
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const rw = Math.abs(Math.sin(this.t * 20)) * this.w;
      _rr(ctx, -rw / 2, -this.h / 2 - 4 + wob, rw, 3, 1.5); ctx.fill();
    } else {
      // blobby glitch creature — radial shading + soft outline
      const r = this.w / 2, cyy = wob * 0.5;
      const bg = ctx.createRadialGradient(-r * 0.3, cyy - r * 0.3, 1, 0, cyy, r);
      bg.addColorStop(0, _sh(d.color, 0.28)); bg.addColorStop(1, _sh(d.color, -0.22));
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, cyy, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, cyy, r, 0, 7); ctx.stroke();
      ctx.fillStyle = _sh(d.color2, -0.05); _rr(ctx, -this.w / 2 + 2, -2 + cyy, this.w - 4, 4, 2); ctx.fill();
      // eyes (rounded, with a highlight)
      for (const ex of [this.dir * 4 - 2.5, this.dir * 4 + 4.5]) {
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, -6 + cyy, 2.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(ex + this.dir * 0.6, -6 + cyy, 1.5, 0, 7); ctx.fill();
      }
    }
    // distinctive markers for the new enemy types
    if (d.frontShield) { // shielder plate on facing side
      ctx.fillStyle = d.color2;
      ctx.fillRect(this.dir * (this.w / 2 - 1), -this.h / 2 + 2, this.dir * 5, this.h - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(this.dir * (this.w / 2 + 1), -this.h / 2 + 4, this.dir * 2, this.h - 10);
    }
    if (d.digger) { // sapper drill snout
      ctx.fillStyle = '#c0c6d4';
      ctx.save(); ctx.rotate(this.t * 12);
      ctx.beginPath(); ctx.moveTo(this.dir * 6, 0); ctx.lineTo(this.dir * (this.w / 2 + 8), -4); ctx.lineTo(this.dir * (this.w / 2 + 8), 4); ctx.fill();
      ctx.restore();
    }
    if (d.mender) { // green cross
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2, -this.h / 2 - 6, 4, 8); ctx.fillRect(-4, -this.h / 2 - 4, 8, 4);
    }
    if (this.type === 'hornet') { // stinger + buzz wings
      ctx.fillStyle = '#3d2e00';
      ctx.fillRect(this.dir * (this.w / 2 - 1), -1, this.dir * 5, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const bw2 = Math.abs(Math.sin(this.t * 30)) * 10 + 4;
      ctx.fillRect(-2, -this.h / 2 - bw2, 4, bw2);
    }
    if (this.def.miniboss) {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(-14, -this.h / 2 + 4); ctx.lineTo(-14, -this.h / 2 - 8); ctx.lineTo(-7, -this.h / 2 - 1); ctx.lineTo(0, -this.h / 2 - 10); ctx.lineTo(7, -this.h / 2 - 1); ctx.lineTo(14, -this.h / 2 - 8); ctx.lineTo(14, -this.h / 2 + 4); ctx.closePath(); ctx.fill();
    }
    if (this.burnT > 0) { ctx.fillStyle = 'rgba(255,87,20,0.7)'; ctx.beginPath(); ctx.arc(0, -this.h / 2 - 4, 5 + Math.sin(time * 12) * 2, 0, 7); ctx.fill(); }
    ctx.restore();
    // hp bar
    if (this.hp < this.maxHp || this.def.miniboss) {
      const bw = this.def.miniboss ? 52 : 32;
      ctx.fillStyle = '#1a0a12'; ctx.fillRect(sx - bw / 2, sy - this.h / 2 - 12, bw, 5);
      ctx.fillStyle = this.def.miniboss ? '#ffd166' : '#ff4d6d';
      ctx.fillRect(sx - bw / 2, sy - this.h / 2 - 12, bw * Math.max(0, this.hp / this.maxHp), 5);
      if (this.def.miniboss) { ctx.fillStyle = '#ffd166'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('WARDEN', sx, sy - this.h / 2 - 16); }
    }
  }
}

/* ===================== PROJECTILES ===================== */
class Projectile {
  constructor(x, y, vx, vy, dmg, friendly, color, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.friendly = friendly; this.color = color || '#fff';
    this.dead = false; this.life = (opts && opts.life) || 2.2;
    this.r = (opts && opts.r) || 5;
    this.pierce = (opts && opts.pierce) || false;
    this.gravity = (opts && opts.gravity) || 0;
    this.burn = opts && opts.burn;
    this.chill = (opts && opts.chill) || 0;
    this.knock = (opts && opts.knock) || 120;
    this.boomerang = (opts && opts.boomerang) || false;
    this.homing = (opts && opts.homing) || 0;
    this.phase = 'out'; this.outT = 0.38;
    this._hit = new Set();
    this.trail = [];
    this.w = this.r * 2; this.h = this.r * 2;
  }
  update(dt, world, game) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += this.gravity * dt;
    if (this.homing && !this.friendly) {
      const p = game.player;
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.vx += Math.cos(a) * this.homing * dt;
      this.vy += Math.sin(a) * this.homing * dt;
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > 340) { this.vx *= 340 / sp; this.vy *= 340 / sp; }
    } else if (this.homing && this.friendly) {
      // seek the nearest live target (enemy or boss) by STEERING the velocity
      // vector at a fixed turn rate — this guarantees convergence (no orbiting)
      let best = null, bd = 12 * TS;
      for (const e of game.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - this.x, e.y - this.y); if (d < bd) { bd = d; best = e; } }
      if (game.boss && !game.boss.dead) { const d = Math.hypot(game.boss.x - this.x, game.boss.y - this.y); if (d < bd) { bd = d; best = game.boss; } }
      if (best) {
        const desired = Math.atan2(best.y - this.y, best.x - this.x);
        let cur = Math.atan2(this.vy, this.vx);
        let da = desired - cur; while (da > Math.PI) da -= 6.2832; while (da < -Math.PI) da += 6.2832;
        cur += Math.max(-8 * dt, Math.min(8 * dt, da)); // ~8 rad/s turn = ~55px radius at speed 440
        const sp = 440;
        this.vx = Math.cos(cur) * sp; this.vy = Math.sin(cur) * sp;
      }
      if (Math.random() < 0.4) game.fx.add(this.x, this.y, 0, 0, this.color, 0.3, 3, 0);
    }
    // recall disc returns to its thrower
    if (this.boomerang) {
      this.outT -= dt;
      if (this.phase === 'out' && this.outT <= 0) { this.phase = 'back'; this._hit.clear(); }
      if (this.phase === 'back') {
        const p = game.player;
        const a = Math.atan2(p.y - this.y, p.x - this.x);
        const sp = Math.hypot(this.vx, this.vy) || 1;
        this.vx += (Math.cos(a) * 640 - this.vx) * Math.min(1, 6 * dt);
        this.vy += (Math.sin(a) * 640 - this.vy) * Math.min(1, 6 * dt);
        if (Math.hypot(p.x - this.x, p.y - this.y) < 30) { this.dead = true; return; }
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (world.solidAtPx(this.x, this.y)) {
      if (this.boomerang) {
        if (this.phase === 'out') { this.phase = 'back'; this._hit.clear(); }
      } else {
        this.dead = true;
        game.fx.puff(this.x, this.y, this.color);
        return;
      }
    }
    if (this.friendly) {
      for (const e of game.enemies) {
        if (e.dead || this._hit.has(e) || !e.overlaps(this)) continue;
        // shielders deflect shots coming at their front
        if (e.def && e.def.frontShield && Math.sign(this.vx) === -e.dir) {
          this.dead = true;
          game.fx.spark(this.x, this.y, '#8ecae6', 6);
          game.sfx.play('hit');
          return;
        }
        e.hurt(this.dmg, game, Math.sign(this.vx) * this.knock);
        if (this.burn) { e.burn = this.burn.dps; e.burnT = this.burn.dur; }
        if (this.chill) e.chillT = this.chill;
        game.onPlayerDealt(this.dmg);
        if (!this.pierce) { this.dead = true; return; }
        this._hit.add(e);
      }
      if (game.boss && !game.boss.dead && !this._hit.has(game.boss) && game.boss.overlaps(this)) {
        game.boss.hurt(this.dmg, game);
        game.onPlayerDealt(this.dmg);
        if (!this.pierce) this.dead = true;
        else this._hit.add(game.boss);
      }
    } else if (game.player.overlaps(this)) {
      game.player.hurt(this.dmg, game, Math.sign(this.vx) * 200);
      this.dead = true;
    }
  }
  overlaps(o) { return Math.abs(this.x - o.x) < (this.w + o.w) / 2 && Math.abs(this.y - o.y) < (this.h + o.h) / 2; }
  draw(ctx, cam) {
    // fading motion trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 6) this.trail.shift();
    ctx.fillStyle = this.color;
    for (let i = 0; i < this.trail.length; i++) {
      ctx.globalAlpha = (i / this.trail.length) * 0.35;
      const t = this.trail[i];
      ctx.beginPath(); ctx.arc(t.x - cam.x, t.y - cam.y, this.r * (0.4 + 0.6 * i / this.trail.length), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.shadowColor = this.color; ctx.shadowBlur = 8;
    if (this.boomerang) {
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(performance.now() / 60);
      ctx.fillRect(-this.r, -2.5, this.r * 2, 5);
      ctx.fillRect(-2.5, -this.r, 5, this.r * 2);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, this.r, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }
}

/* ===================== DROPS ===================== */
class Drop extends Entity {
  constructor(x, y, itemId, count) {
    super(x, y, 18, 18);
    this.itemId = itemId; this.count = count || 1;
    this.vx = (Math.random() - 0.5) * 160;
    this.vy = -160 - Math.random() * 120;
    this.t = Math.random() * 10;
    this.pickupDelay = 0.35;
    this.gem = itemId === '__gem';
    this.gemVal = this.gem ? count : 0;
  }
  update(dt, world, game) {
    this.t += dt; this.pickupDelay -= dt;
    const p = game.player;
    const mag = this.gem ? Math.max(3.2, p.magnetRange()) : p.magnetRange();
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.pickupDelay <= 0 && d < mag * TS) {
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      this.vx += Math.cos(a) * 1600 * dt; this.vy += Math.sin(a) * 1600 * dt;
      this.gravity = 0;
    } else {
      this.gravity = 1400;
      // magnet pylons collect strays
      if (this.pickupDelay <= 0 && world._pylons) {
        for (const py2 of world._pylons) {
          const dp = Math.hypot(py2.x - this.x, py2.y - this.y);
          if (dp < 7 * TS && dp > 20) {
            const a = Math.atan2(py2.y - 14 - this.y, py2.x - this.x);
            this.vx += Math.cos(a) * 900 * dt; this.vy += Math.sin(a) * 900 * dt;
            this.gravity = 200;
            break;
          }
        }
      }
    }
    this.vy += this.gravity * dt;
    this.vx *= 0.99;
    this.moveAndCollide(dt, world);
    if (this.onGround) this.vx *= 0.85;
    if (this.pickupDelay <= 0 && d < 26) {
      this.dead = true;
      if (this.gem) { game.addGems(this.gemVal); game.fx.hitNum(this.x, this.y - 6, '+' + this.gemVal, '#6ee7ff'); game.sfx.play('gem'); }
      else { game.player.give(this.itemId, this.count); game.sfx.play('pickup'); game.toast('+' + this.count + ' ' + ITEMS[this.itemId].name, ''); }
    }
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y + Math.sin(this.t * 4) * 3;
    if (this.gem) {
      ctx.save(); ctx.translate(sx, sy);
      ctx.fillStyle = '#6ee7ff'; ctx.shadowColor = '#6ee7ff'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(6, 0); ctx.lineTo(0, 7); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3, 0); ctx.lineTo(0, 2); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      const ic = iconFor(this.itemId);
      ctx.drawImage(ic, sx - 12, sy - 12, 24, 24);
    }
  }
}

/* ===================== PET FAMILIAR ===================== */
class Pet {
  constructor(itemId) {
    this.itemId = itemId;
    this.fx = ITEMS[itemId].fx.pet;
    this.x = 0; this.y = 0; this.t = Math.random() * 10;
    this.shootT = 0; this.healT = 0;
  }
  update(dt, game) {
    this.t += dt;
    const p = game.player;
    const tx = p.x - p.facing * 34, ty = p.y - 44 + Math.sin(this.t * 3) * 5;
    this.x += (tx - this.x) * Math.min(1, 6 * dt);
    this.y += (ty - this.y) * Math.min(1, 6 * dt);
    // attack nearest enemy / boss
    this.shootT -= dt;
    if (this.shootT <= 0) {
      let best = null, bd = this.fx.range * TS;
      const targets = game.boss && !game.boss.dead ? [...game.enemies, game.boss] : game.enemies;
      for (const e of targets) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) {
        this.shootT = this.fx.rate;
        const a = Math.atan2(best.y - this.y, best.x - this.x);
        game.projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * 620, Math.sin(a) * 620, this.fx.dmg, true, this.fx.color, { burn: this.fx.burn, chill: this.fx.chill }));
        game.sfx.play('sentry');
      }
    }
    // core sprite heals its owner
    if (this.fx.heal && p.hp < p.maxHp) {
      this.healT += dt;
      if (this.healT > 2.5) {
        this.healT = 0;
        p.hp = Math.min(p.maxHp, p.hp + this.fx.heal);
        game.fx.add(p.x, p.y - 30, 0, -50, '#ffd166', 0.6, 4, 0);
        ui.updateHUD();
      }
    }
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = this.fx.color;
    ctx.fillRect(-9, -6, 18, 12);
    ctx.fillStyle = '#0d1526'; ctx.fillRect(-5, -3, 4, 4); ctx.fillRect(2, -3, 4, 4);
    ctx.fillStyle = '#6ee7ff'; ctx.fillRect(-4, -2, 2, 2); ctx.fillRect(3, -2, 2, 2);
    // rotor shimmer
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    const rw = Math.abs(Math.sin(time * 18)) * 18;
    ctx.fillRect(-rw / 2, -10, rw, 2);
    if (this.fx.heal) { ctx.strokeStyle = 'rgba(255,209,102,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 13 + Math.sin(time * 4) * 2, 0, 7); ctx.stroke(); }
    ctx.restore();
  }
}

/* ===================== AI COMPANION (hired ally — the co-op stand-in) ===================== */
const COMPANION_KITS = [
  { name: 'ALLY',    body: '#2de2a3', trim: '#1c7a58', legs: '#2a6b4a', bolt: '#8be9fd', col: 640, cd: 0.55, hp: 120 },
  { name: 'GUNNER',  body: '#ffa94d', trim: '#c9741f', legs: '#8a4b12', bolt: '#ffd166', col: 720, cd: 0.4,  hp: 100 },
  { name: 'WARDEN',  body: '#4da3ff', trim: '#1f5fb0', legs: '#123a70', bolt: '#a5d8ff', col: 560, cd: 0.7,  hp: 170 },
  { name: 'HEXER',   body: '#c77dff', trim: '#8b3fd6', legs: '#5a2494', bolt: '#e0b0ff', col: 600, cd: 0.5,  hp: 130 },
];
class Companion extends Entity {
  constructor(x, y, slot) {
    super(x, y, 22, 44);
    this.slot = slot || 0;
    this.kit = COMPANION_KITS[this.slot % COMPANION_KITS.length];
    this.maxHp = this.kit.hp; this.hp = this.kit.hp;
    this.facing = 1; this.shootT = 0; this.downT = 0; this.t = Math.random() * 10;
  }
  update(dt, world, game) {
    this.t += dt;
    if (this.downT > 0) { // knocked out — revives after a bit
      this.downT -= dt; this.vx = 0; this.vy += this.gravity * dt; this.moveAndCollide(dt, world);
      if (this.downT <= 0) { this.hp = this.maxHp * 0.6; game.fx.explode(this.x, this.y, '#2de2a3', 12); }
      return;
    }
    const p = game.player;
    // find nearest enemy/boss to engage
    let best = null, bd = 11 * TS;
    for (const e of game.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - this.x, e.y - this.y); if (d < bd) { bd = d; best = e; } }
    if (game.boss && !game.boss.dead) { const d = Math.hypot(game.boss.x - this.x, game.boss.y - this.y); if (d < bd + 4 * TS) best = game.boss; }
    // spread roster members out behind the player so they don't stack
    const spread = 40 + this.slot * 34;
    const followX = p.x - p.facing * spread;
    let targetX = followX;
    if (best && Math.hypot(p.x - best.x, p.y - best.y) < 12 * TS) {
      // stay near the enemy but not on top of the player's target range
      targetX = best.x - Math.sign(best.x - this.x) * (60 + this.slot * 24);
      this.facing = Math.sign(best.x - this.x) || this.facing;
      this.shootT -= dt;
      if (this.shootT <= 0 && Math.abs(best.y - this.y) < 5 * TS) {
        this.shootT = this.kit.cd;
        const a = Math.atan2(best.y - this.y, best.x - this.x);
        game.projectiles.push(new Projectile(this.x + this.facing * 12, this.y - 6, Math.cos(a) * this.kit.col, Math.sin(a) * this.kit.col, 14, true, this.kit.bolt));
        game.sfx.play('shoot');
      }
    } else this.facing = Math.sign(p.x - this.x) || this.facing;
    // move toward target, teleport if the player gets far
    if (Math.hypot(p.x - this.x, p.y - this.y) > 20 * TS) { this.x = p.x; this.y = p.y; this.vy = 0; }
    const dx = targetX - this.x;
    this.vx = Math.abs(dx) > 12 ? Math.sign(dx) * 220 : this.vx * 0.6;
    if (this.onGround) { // hop over walls / gaps
      const ah = Math.floor((this.x + Math.sign(this.vx || 1) * 16) / TS), fy = Math.floor((this.y + this.h / 2 - 4) / TS);
      if (world.isSolid(ah, fy)) this.vy = -560;
    }
    this.vy += this.gravity * dt;
    this.moveAndCollide(dt, world);
    if (this.y > world.h * TS + 200) { this.x = p.x; this.y = p.y - 60; this.vy = 0; }
  }
  hurt(dmg, game) {
    if (this.downT > 0) return;
    this.hp -= dmg;
    game.fx.spark(this.x, this.y, '#ff4d6d', 4);
    if (this.hp <= 0) { this.hp = 0; this.downT = 6; game.fx.explode(this.x, this.y, '#ff4d6d', 14); game.toast('Your comrade went down — reviving in 6s.', 'warn'); }
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy);
    const down = this.downT > 0;
    if (down) { ctx.globalAlpha = 0.4 + 0.2 * Math.sin(time * 10); ctx.rotate(1.4); }
    const walk = Math.abs(this.vx) > 20 && this.onGround ? Math.sin(time * 12) : 0;
    const k = this.kit;
    const rr = (typeof _rrPath === 'function') ? _rrPath : (c, X, Y, w, h) => c.rect(X, Y, w, h);
    const sh = (typeof _shade === 'function') ? _shade : (h) => h;
    // ground shadow
    ctx.save(); ctx.translate(0, this.h / 2 - 1); ctx.scale(1, 0.4); const gs = ctx.createRadialGradient(0, 0, 1, 0, 0, 13); gs.addColorStop(0, 'rgba(0,0,0,0.28)'); gs.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gs; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill(); ctx.restore();
    // kit-clad ally — rounded, shaded to match the player
    ctx.fillStyle = sh(k.legs, -0.1); rr(ctx, -9, 8 + walk * 3, 7, 15 - walk * 3, 3); ctx.fill(); rr(ctx, 2, 8 - walk * 3, 7, 15 + walk * 3, 3); ctx.fill();
    ctx.save(); rr(ctx, -10, -12, 20, 23, 6); ctx.clip();
    const bg = ctx.createLinearGradient(0, -12, 0, 11); bg.addColorStop(0, sh(k.body, 0.26)); bg.addColorStop(0.55, k.body); bg.addColorStop(1, sh(k.body, -0.22));
    ctx.fillStyle = bg; ctx.fillRect(-10, -12, 20, 23);
    ctx.fillStyle = k.trim; ctx.fillRect(-10, 4, 20, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-10, -12, 3, 23);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.26)'; ctx.lineWidth = 1; rr(ctx, -10, -12, 20, 23, 6); ctx.stroke();
    const hg = ctx.createLinearGradient(0, -30, 0, -12); hg.addColorStop(0, sh('#ffd8b1', 0.13)); hg.addColorStop(1, sh('#ffd8b1', -0.16));
    rr(ctx, -8, -30, 16, 18, 5); ctx.fillStyle = hg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1; rr(ctx, -8, -30, 16, 18, 5); ctx.stroke();
    const vx = this.facing > 0 ? -3 : -9;
    rr(ctx, vx, -27, 12, 8, 3); ctx.fillStyle = '#0b1220'; ctx.fill();
    ctx.fillStyle = k.bolt; rr(ctx, vx + 1.5, -25.5, 8.5, 4, 2); ctx.fill();
    // little blaster
    ctx.fillStyle = '#44506b'; rr(ctx, this.facing > 0 ? 8 : -20, -8.5, 12, 5, 2); ctx.fill();
    ctx.restore();
    // hp bar
    ctx.fillStyle = '#1a2a1a'; ctx.fillRect(sx - 15, sy - 40, 30, 4);
    ctx.fillStyle = down ? '#ff4d6d' : k.body; ctx.fillRect(sx - 15, sy - 40, 30 * Math.max(0, this.hp / this.maxHp), 4);
    ctx.fillStyle = '#cfe8dd'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillText(down ? 'DOWN' : k.name, sx, sy - 44);
  }
}

/* ===================== CIPHER KEY PICKUP ===================== */
class KeyPickup {
  constructor(x, y) { this.x = x; this.y = y; this.t = Math.random() * 10; this.dead = false; this.w = 20; this.h = 20; }
  update(dt, world, game) {
    this.t += dt;
    const p = game.player;
    if (Math.hypot(p.x - this.x, p.y - this.y) < 34) {
      this.dead = true;
      game.keysGot++;
      game.progress.stats.keys++;
      game.fx.explode(this.x, this.y, '#c77dff', 14);
      game.sfx.play('splice');
      game.toast('🔑 Cipher key ' + game.keysGot + '/' + game.keysNeed + ' acquired!', 'gold');
      if (game.keysGot >= game.keysNeed) world.openGate(game);
      ui.updateHUD();
    }
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y + Math.sin(this.t * 3) * 5;
    ctx.save(); ctx.translate(sx, sy);
    ctx.shadowColor = '#c77dff'; ctx.shadowBlur = 12;
    ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -4, 5, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 10); ctx.moveTo(0, 6); ctx.lineTo(4, 6); ctx.moveTo(0, 10); ctx.lineTo(5, 10); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
    // beacon column so it's findable
    ctx.fillStyle = 'rgba(199,125,255,0.10)';
    ctx.fillRect(sx - 8, 0, 16, sy);
  }
}

/* ===================== PARTICLES & FX ===================== */
class FXSystem {
  constructor() { this.parts = []; this.nums = []; }
  add(x, y, vx, vy, color, life, size, grav, ch) {
    if (this.parts.length > 750) this.parts.splice(0, 50);
    this.parts.push({ x, y, vx, vy, color, life, maxLife: life, size: size || 4, grav: grav === undefined ? 800 : grav, ch });
  }
  spark(x, y, color, n) {
    for (let i = 0; i < (n || 5); i++) {
      const a = Math.random() * 6.28, s = 60 + Math.random() * 180;
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, color, 0.25 + Math.random() * 0.15, 2.5, 0);
    }
  }
  dust(x, y, dir) {
    this.add(x, y, -dir * (30 + Math.random() * 50), -20 - Math.random() * 40, 'rgba(180,180,190,0.7)', 0.35, 3, -60);
  }
  bubble(x, y) {
    this.add(x, y, (Math.random() - 0.5) * 20, -40 - Math.random() * 40, 'rgba(190,230,255,0.8)', 0.9, 3, -30);
  }
  tileHit(tx, ty, it) {
    for (let i = 0; i < 3; i++) this.add(tx * TS + TS / 2, ty * TS + TS / 2, (Math.random() - 0.5) * 200, -Math.random() * 200, it.color, 0.4, 3);
  }
  tileBreak(tx, ty, it) {
    for (let i = 0; i < 10; i++) this.add(tx * TS + TS / 2, ty * TS + TS / 2, (Math.random() - 0.5) * 320, -Math.random() * 300, Math.random() < 0.5 ? it.color : it.color2, 0.6, 4);
  }
  puff(x, y, color) { for (let i = 0; i < 6; i++) this.add(x, y, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, color, 0.4, 3, 0); }
  explode(x, y, color, n) { for (let i = 0; i < (n || 20); i++) { const a = Math.random() * 6.28, s = 100 + Math.random() * 340; this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, Math.random() < 0.3 ? '#fff' : color, 0.7, 5, 300); } }
  harvest(x, y, color) { for (let i = 0; i < 12; i++) this.add(x, y - 20, (Math.random() - 0.5) * 220, -Math.random() * 260, color, 0.7, 4); }
  hitNum(x, y, n, color) { this.nums.push({ x: x + (Math.random() - 0.5) * 14, y, n, life: 0.8, color }); }
  update(dt) {
    for (const p of this.parts) { p.life -= dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    this.parts = this.parts.filter(p => p.life > 0);
    for (const n of this.nums) { n.life -= dt; n.y -= 50 * dt; }
    this.nums = this.nums.filter(n => n.life > 0);
  }
  draw(ctx, cam) {
    for (const p of this.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      if (p.ch) { ctx.font = 'bold 13px monospace'; ctx.fillText(p.ch, p.x - cam.x, p.y - cam.y); }
      else ctx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    for (const n of this.nums) {
      ctx.globalAlpha = Math.min(1, n.life * 2);
      ctx.fillStyle = n.color || '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.strokeText(n.n, n.x - cam.x, n.y - cam.y);
      ctx.fillText(n.n, n.x - cam.x, n.y - cam.y);
    }
    ctx.globalAlpha = 1;
  }
}

/* ===================== SOUND (tiny webaudio synth) ===================== */
class SFX {
  constructor() { this.ctx = null; this.vol = 0.8; this.muted = false; }
  init() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  note(semitone) { // chime blocks: pentatonic-ish pitches
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const f = 440 * Math.pow(2, (semitone - 5) / 12);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.16 * this.vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + 0.55);
  }
  play(name) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const defs = {
      punch:  [{ f: 180, f2: 90, dur: 0.08, type: 'square', vol: 0.12 }],
      hit:    [{ f: 320, f2: 120, dur: 0.1, type: 'sawtooth', vol: 0.12 }],
      kill:   [{ f: 500, f2: 60, dur: 0.3, type: 'sawtooth', vol: 0.16 }],
      break:  [{ f: 240, f2: 60, dur: 0.15, type: 'square', vol: 0.14 }],
      place:  [{ f: 300, f2: 420, dur: 0.07, type: 'square', vol: 0.1 }],
      plant:  [{ f: 520, f2: 700, dur: 0.12, type: 'sine', vol: 0.12 }],
      splice: [{ f: 440, f2: 880, dur: 0.25, type: 'sine', vol: 0.15 }, { f: 550, f2: 1100, dur: 0.25, type: 'sine', vol: 0.1 }],
      harvest:[{ f: 660, f2: 990, dur: 0.18, type: 'triangle', vol: 0.14 }],
      pickup: [{ f: 700, f2: 1000, dur: 0.06, type: 'sine', vol: 0.09 }],
      gem:    [{ f: 1100, f2: 1600, dur: 0.09, type: 'sine', vol: 0.1 }],
      shoot:  [{ f: 800, f2: 300, dur: 0.09, type: 'sawtooth', vol: 0.08 }],
      eshoot: [{ f: 400, f2: 200, dur: 0.12, type: 'sawtooth', vol: 0.08 }],
      sentry: [{ f: 900, f2: 500, dur: 0.07, type: 'square', vol: 0.06 }],
      hurt:   [{ f: 200, f2: 80, dur: 0.2, type: 'sawtooth', vol: 0.18 }],
      bounce: [{ f: 300, f2: 700, dur: 0.15, type: 'sine', vol: 0.12 }],
      tp:     [{ f: 200, f2: 1400, dur: 0.3, type: 'sine', vol: 0.14 }],
      buy:    [{ f: 880, f2: 1320, dur: 0.12, type: 'triangle', vol: 0.12 }],
      boom:   [{ f: 150, f2: 30, dur: 0.5, type: 'sawtooth', vol: 0.25 }],
      bossroar: [{ f: 90, f2: 40, dur: 0.8, type: 'sawtooth', vol: 0.25 }, { f: 120, f2: 55, dur: 0.8, type: 'square', vol: 0.15 }],
      victory:[{ f: 523, f2: 523, dur: 0.12, type: 'square', vol: 0.14 }, { f: 659, f2: 659, dur: 0.12, type: 'square', vol: 0.14, delay: 0.12 }, { f: 784, f2: 784, dur: 0.12, type: 'square', vol: 0.14, delay: 0.24 }, { f: 1047, f2: 1047, dur: 0.3, type: 'square', vol: 0.16, delay: 0.36 }],
      dash:   [{ f: 600, f2: 1200, dur: 0.14, type: 'sawtooth', vol: 0.1 }],
      jet:    [{ f: 120, f2: 140, dur: 0.08, type: 'sawtooth', vol: 0.04 }],
      death:  [{ f: 400, f2: 40, dur: 1.0, type: 'sawtooth', vol: 0.2 }],
      error:  [{ f: 220, f2: 180, dur: 0.15, type: 'square', vol: 0.1 }],
      uiOpen: [{ f: 480, f2: 760, dur: 0.08, type: 'sine', vol: 0.07 }],
      uiClose:[{ f: 640, f2: 360, dur: 0.07, type: 'sine', vol: 0.06 }],
      uiTick: [{ f: 900, f2: 1150, dur: 0.03, type: 'square', vol: 0.05 }],
    };
    const seq = defs[name];
    if (!seq) return;
    for (const s of seq) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      const t0 = t + (s.delay || 0);
      o.type = s.type;
      o.frequency.setValueAtTime(s.f, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, s.f2), t0 + s.dur);
      g.gain.setValueAtTime(s.vol * this.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + s.dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + s.dur + 0.02);
    }
  }
}
