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
    let ny = this.y + this.vy * dt;
    if (this.vy !== 0) {
      const dir = Math.sign(this.vy);
      const edge = ny + dir * this.h / 2;
      const ty = Math.floor(edge / TS);
      let hit = false, hitTile = null;
      for (let tx = Math.floor((this.x - hw + 0.01) / TS); tx <= Math.floor((this.x + hw - 0.01) / TS); tx++) {
        if (world.isSolid(tx, ty)) { hit = true; hitTile = world.get(tx, ty); break; }
      }
      if (hit) {
        ny = dir > 0 ? ty * TS - this.h / 2 - 0.01 : (ty + 1) * TS + this.h / 2 + 0.01;
        if (dir > 0) {
          this.onGround = true;
          this.groundTile = hitTile;
          const it = ITEMS[hitTile];
          if (it && it.fx && it.fx.bounce && this.vy > 200) {
            this.vy = -it.fx.bounce;
            this.onGround = false;
            if (game) { game.fx.puff(this.x, ny + this.h / 2, '#3ddc84'); game.sfx.play('bounce'); }
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
};

class Enemy extends Entity {
  constructor(type, x, y, lvl) {
    const d = ENEMY_DEFS[type];
    super(x, y, d.w, d.h);
    this.type = type; this.def = d;
    this.lvl = lvl || 1;
    const mult = 1 + (this.lvl - 1) * 0.55;
    this.maxHp = Math.round(d.hp * mult); this.hp = this.maxHp;
    this.dmg = Math.round(d.dmg * (1 + (this.lvl - 1) * 0.3));
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.t = Math.random() * 10;
    this.burn = 0; this.burnT = 0;
    this.shootT = 1 + Math.random() * 2;
    this.hitFlash = 0;
    if (d.ai === 'flyer') this.gravity = 0;
  }
  hurt(dmg, game, kx) {
    this.hp -= dmg;
    this.hitFlash = 0.12;
    this.vx += (kx || 0);
    game.fx.hitNum(this.x, this.y - this.h, dmg);
    game.sfx.play('hit');
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.progress.stats.kills++;
      game.fx.explode(this.x, this.y, this.def.color, this.def.miniboss ? 34 : 14);
      game.sfx.play('kill');
      const [g0, g1] = this.def.gems;
      game.spawnGems(this.x, this.y, g0 + Math.floor(Math.random() * (g1 - g0 + 1)) * this.lvl);
      if (Math.random() < 0.06) game.spawnDrop(this.x, this.y, 'medkit', 1);
      if (Math.random() < 0.05) game.spawnDrop(this.x, this.y, 'bomb', 1);
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
    const ai = this.def.ai;
    if (ai === 'walker') {
      if (distP < 9 * TS) this.dir = Math.sign(p.x - this.x) || this.dir;
      this.vx = this.dir * this.def.speed;
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
      // hop over walls
      if (this.onGround) {
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
          this.vx = this.dir * this.def.speed * 2.2;
          this.vy = -520;
        }
      }
      this.vy += this.gravity * dt;
    } else if (ai === 'flyer') {
      if (distP < 12 * TS) {
        const a = Math.atan2(p.y - 20 - this.y, p.x - this.x);
        this.vx += Math.cos(a) * 500 * dt;
        this.vy += Math.sin(a) * 500 * dt;
      }
      this.vx *= 0.98; this.vy *= 0.98;
      this.vy += Math.sin(this.t * 3) * 30 * dt;
      const sp = Math.hypot(this.vx, this.vy), max = this.def.speed * 1.6;
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
    }
    this.moveAndCollide(dt, world);
    if (this.vx !== 0 && ai === 'walker' && this.onGround && Math.abs(this.vx) < 5) this.dir *= -1;
    // hazard tiles hurt enemies too (firewall blocks!)
    this.tilesTouching(world, (it) => {
      if (it.fx && it.fx.enemyDamage) {
        this._fwTick = (this._fwTick || 0) - dt;
        if (this._fwTick <= 0) { this._fwTick = 0.4; this.hurt(Math.round(it.fx.enemyDamage * 0.4), game); }
      }
    });
    // contact damage
    if (!this.dead && this.overlaps(p)) p.hurt(this.dmg, game, Math.sign(p.x - this.x) * 260);
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    const d = this.def;
    ctx.save(); ctx.translate(sx, sy);
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.5)';
    const wob = Math.sin(this.t * 8) * 2;
    if (d.ai === 'flyer') {
      ctx.fillStyle = d.color;
      ctx.fillRect(-this.w / 2, -this.h / 2 + wob, this.w, this.h - 6);
      ctx.fillStyle = d.color2;
      ctx.fillRect(-4, -this.h / 2 + 4 + wob, 8, 6);
      // rotor
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const rw = Math.abs(Math.sin(this.t * 20)) * this.w;
      ctx.fillRect(-rw / 2, -this.h / 2 - 4 + wob, rw, 3);
    } else {
      // blobby glitch creature
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.arc(0, wob * 0.5, this.w / 2, 0, 7); ctx.fill();
      ctx.fillStyle = d.color2;
      ctx.fillRect(-this.w / 2 + 2, -2 + wob * 0.5, this.w - 4, 4);
      // eyes
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.dir * 4 - 5, -8 + wob * 0.5, 5, 5); ctx.fillRect(this.dir * 4 + 2, -8 + wob * 0.5, 5, 5);
      ctx.fillStyle = '#000';
      ctx.fillRect(this.dir * 4 - 4 + this.dir, -7 + wob * 0.5, 3, 3); ctx.fillRect(this.dir * 4 + 3 + this.dir, -7 + wob * 0.5, 3, 3);
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
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (world.solidAtPx(this.x, this.y)) {
      this.dead = true;
      game.fx.puff(this.x, this.y, this.color);
      return;
    }
    if (this.friendly) {
      for (const e of game.enemies) {
        if (e.dead || !e.overlaps(this)) continue;
        e.hurt(this.dmg, game, Math.sign(this.vx) * 120);
        if (this.burn) { e.burn = this.burn.dps; e.burnT = this.burn.dur; }
        if (!this.pierce) { this.dead = true; return; }
      }
      if (game.boss && !game.boss.dead && game.boss.overlaps(this)) {
        game.boss.hurt(this.dmg, game);
        if (!this.pierce) this.dead = true;
      }
    } else if (game.player.overlaps(this)) {
      game.player.hurt(this.dmg, game, Math.sign(this.vx) * 200);
      this.dead = true;
    }
  }
  overlaps(o) { return Math.abs(this.x - o.x) < (this.w + o.w) / 2 && Math.abs(this.y - o.y) < (this.h + o.h) / 2; }
  draw(ctx, cam) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(sx, sy, this.r, 0, 7); ctx.fill();
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
    } else this.gravity = 1400;
    this.vy += this.gravity * dt;
    this.vx *= 0.99;
    this.moveAndCollide(dt, world);
    if (this.onGround) this.vx *= 0.85;
    if (this.pickupDelay <= 0 && d < 26) {
      this.dead = true;
      if (this.gem) { game.addGems(this.gemVal); game.sfx.play('gem'); }
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
        game.projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * 620, Math.sin(a) * 620, this.fx.dmg, true, this.fx.color));
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
  add(x, y, vx, vy, color, life, size, grav) {
    this.parts.push({ x, y, vx, vy, color, life, maxLife: life, size: size || 4, grav: grav === undefined ? 800 : grav });
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
  hitNum(x, y, n) { this.nums.push({ x: x + (Math.random() - 0.5) * 14, y, n, life: 0.8 }); }
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
      ctx.fillRect(p.x - cam.x - p.size / 2, p.y - cam.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    for (const n of this.nums) {
      ctx.globalAlpha = Math.min(1, n.life * 2);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.strokeText(n.n, n.x - cam.x, n.y - cam.y);
      ctx.fillText(n.n, n.x - cam.x, n.y - cam.y);
    }
    ctx.globalAlpha = 1;
  }
}

/* ===================== SOUND (tiny webaudio synth) ===================== */
class SFX {
  constructor() { this.ctx = null; }
  init() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  play(name) {
    if (!this.ctx) return;
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
    };
    const seq = defs[name];
    if (!seq) return;
    for (const s of seq) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      const t0 = t + (s.delay || 0);
      o.type = s.type;
      o.frequency.setValueAtTime(s.f, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, s.f2), t0 + s.dur);
      g.gain.setValueAtTime(s.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + s.dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0); o.stop(t0 + s.dur + 0.02);
    }
  }
}
