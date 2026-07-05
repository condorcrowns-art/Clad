'use strict';
/* ============================================================
   GLITCHTOPIA — the four corrupted processes (bosses)
   Each sector's boss drops unique BOSS TECH on first kill.
   ============================================================ */

const BOSS_META = {
  firewall_daemon: { name: 'FIREWALL DAEMON', hp: 650, gems: [140, 200], drops: [['flame_blade', 1], ['firewall_block', 6]] },
  null_wurm:       { name: 'NULL WURM', hp: 950, gems: [180, 260], drops: [['wurm_drill', 1]] },
  kraken:          { name: 'KRAKEN.SYS', hp: 1450, gems: [240, 360], drops: [['torrent_lance', 1], ['buoy_chip', 1]] },
  storm_kernel:    { name: 'STORM KERNEL', hp: 1250, gems: [220, 320], drops: [['storm_boots', 1]] },
  rootkit:         { name: 'R O O T K I T', hp: 1650, gems: [300, 440], drops: [['wraith_chip', 1]] },
  admin:           { name: 'A D M I N', hp: 1900, gems: [400, 600], drops: [['admin_crown', 1], ['trophy_core', 1]] },
};

class Boss extends Entity {
  constructor(id, x, y, w, h) {
    super(x, y, w, h);
    this.id = id;
    this.meta = BOSS_META[id];
    this.maxHp = this.meta.hp; this.hp = this.maxHp;
    this.t = 0; this.hitFlash = 0; this.contactDmg = 20;
    this.gravity = 0;
    this.phase2 = false;
  }
  hurt(dmg, game) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 0.1;
    game.fx.hitNum(this.x + (Math.random() - 0.5) * this.w, this.y - this.h / 2, dmg);
    game.sfx.play('hit');
    if (!this.phase2 && this.hp < this.maxHp * 0.5) { this.phase2 = true; this.onPhase2(game); game.sfx.play('bossroar'); game.toast(this.meta.name + ' is ENRAGED!', 'warn'); }
    if (this.hp <= 0) {
      this.dead = true;
      game.onBossDefeated(this);
    }
  }
  onPhase2(game) {}
  contact(game, dt) {
    const p = game.player;
    if (!this.dead && this.overlaps(p)) p.hurt(this.contactDmg, game, Math.sign(p.x - this.x) * 340, this);
  }
  baseUpdate(dt) { this.t += dt; this.hitFlash = Math.max(0, this.hitFlash - dt); }
}

/* ============ 1. FIREWALL DAEMON — hovering fire wall face ============ */
class FirewallDaemon extends Boss {
  constructor(x, y) {
    super('firewall_daemon', x, y, 90, 90);
    this.homeX = x; this.homeY = y;
    this.atkT = 2; this.pillarT = 6;
    this.contactDmg = 24;
  }
  update(dt, world, game) {
    this.baseUpdate(dt);
    const p = game.player;
    const spd = this.phase2 ? 1.6 : 1;
    // hover figure-8 around home, drifting toward player x
    this.homeX += Math.sign(p.x - this.homeX) * 40 * spd * dt;
    this.x = this.homeX + Math.sin(this.t * 1.2 * spd) * 90;
    this.y = this.homeY + Math.sin(this.t * 2.4 * spd) * 34;
    // fireball volley
    this.atkT -= dt;
    if (this.atkT <= 0) {
      this.atkT = (this.phase2 ? 1.3 : 2.2);
      const n = this.phase2 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = Math.atan2(p.y - this.y, p.x - this.x) + (i - (n - 1) / 2) * 0.25;
        game.projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * 330, Math.sin(a) * 330, 14, false, '#ff5714', { r: 8, life: 3.5 }));
      }
      game.sfx.play('eshoot');
    }
    // fire pillar attack: telegraph at player's x, then erupt
    this.pillarT -= dt;
    if (this.pillarT <= 0) {
      this.pillarT = this.phase2 ? 3.4 : 5.5;
      const xs = this.phase2 ? [p.x - TS * 3, p.x, p.x + TS * 3] : [p.x];
      for (const px of xs) game.hazards.push(new FirePillar(px, 1.0));
      game.sfx.play('bossroar');
    }
    this.contact(game, dt);
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy);
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.2)';
    // flame aura
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.28 + time * 2;
      const r = 52 + Math.sin(time * 6 + k) * 10;
      ctx.fillStyle = k % 2 ? '#ff5714' : '#ffd166';
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 14, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // core face
    ctx.fillStyle = this.phase2 ? '#c41e00' : '#992200';
    ctx.fillRect(-45, -45, 90, 90);
    ctx.fillStyle = '#ff5714'; ctx.fillRect(-38, -38, 76, 76);
    // brick pattern (it IS a firewall)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ctx.fillRect(-36 + c * 26 + (r % 2) * 12, -36 + r * 19, 22, 15);
    // eyes
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(-24, -18, 16, this.phase2 ? 18 : 10); ctx.fillRect(8, -18, 16, this.phase2 ? 18 : 10);
    ctx.fillStyle = '#fff'; ctx.fillRect(-20, -14, 6, 6); ctx.fillRect(12, -14, 6, 6);
    // angry mouth
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-20, 22); ctx.lineTo(-10, 14); ctx.lineTo(0, 22); ctx.lineTo(10, 14); ctx.lineTo(20, 22); ctx.stroke();
    ctx.restore();
  }
}

// telegraphed fire pillar hazard
class FirePillar {
  constructor(x, warn) { this.x = x; this.warnT = warn; this.burnT = 1.4; this.dead = false; this.w = TS * 1.2; }
  update(dt, world, game) {
    if (this.warnT > 0) { this.warnT -= dt; return; }
    this.burnT -= dt;
    if (this.burnT <= 0) { this.dead = true; return; }
    const p = game.player;
    if (Math.abs(p.x - this.x) < this.w / 2 + p.w / 2) p.hurt(16, game, 0);
  }
  draw(ctx, cam, time, vh) {
    const sx = this.x - cam.x;
    if (this.warnT > 0) {
      ctx.fillStyle = 'rgba(255,87,20,' + (0.15 + 0.15 * Math.sin(time * 20)) + ')';
      ctx.fillRect(sx - this.w / 2, 0, this.w, vh);
      ctx.strokeStyle = '#ff5714'; ctx.setLineDash([8, 8]);
      ctx.strokeRect(sx - this.w / 2, 0, this.w, vh); ctx.setLineDash([]);
    } else {
      ctx.fillStyle = 'rgba(255,87,20,0.75)';
      ctx.fillRect(sx - this.w / 2, 0, this.w, vh);
      ctx.fillStyle = 'rgba(255,209,102,0.8)';
      for (let k = 0; k < 6; k++) {
        const fy = ((time * 500 + k * 173) % vh);
        ctx.fillRect(sx - this.w / 2 + Math.sin(time * 10 + k) * 6 + this.w / 2 - 6, vh - fy, 12, 26);
      }
    }
  }
}

/* ============ 2. NULL WURM — terrain-eating segmented worm ============ */
class NullWurm extends Boss {
  constructor(x, y) {
    super('null_wurm', x, y, 44, 44);
    this.contactDmg = 22;
    this.angle = 0;
    this.speed = 220;
    this.trail = [];        // head position history
    this.segments = 9;
    this.spitT = 4;
  }
  update(dt, world, game) {
    this.baseUpdate(dt);
    const p = game.player;
    const spd = this.speed * (this.phase2 ? 1.45 : 1);
    // steer toward player with wobble
    const want = Math.atan2(p.y - this.y, p.x - this.x);
    let da = want - this.angle;
    while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
    this.angle += Math.max(-2.2 * dt, Math.min(2.2 * dt, da)) + Math.sin(this.t * 5) * 0.9 * dt;
    this.x += Math.cos(this.angle) * spd * dt;
    this.y += Math.sin(this.angle) * spd * dt;
    // stay in world
    this.x = Math.max(TS * 2, Math.min(world.w * TS - TS * 2, this.x));
    this.y = Math.max(TS * 3, Math.min(world.h * TS - TS * 3, this.y));
    // EAT terrain
    const tx = Math.floor(this.x / TS), ty = Math.floor(this.y / TS);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const it = world.item(tx + dx, ty + dy);
      if (it && !it.unbreakable) world.breakTile(tx + dx, ty + dy, game, true);
    }
    // trail for segments
    this.trail.unshift({ x: this.x, y: this.y });
    if (this.trail.length > this.segments * 8 + 8) this.trail.pop();
    // spit corrupted globs in phase 2
    if (this.phase2) {
      this.spitT -= dt;
      if (this.spitT <= 0) {
        this.spitT = 2.0;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * 6.283 + this.t;
          game.projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * 260, Math.sin(a) * 260, 12, false, '#c77dff', { r: 7, life: 2.5 }));
        }
        game.sfx.play('eshoot');
      }
    }
    // contact: head + segments
    this.contact(game, dt);
    for (let s = 1; s <= this.segments; s++) {
      const pt = this.trail[s * 8];
      if (!pt) break;
      if (Math.abs(pt.x - p.x) < 34 && Math.abs(pt.y - p.y) < 34) p.hurt(12, game, Math.sign(p.x - pt.x) * 260);
    }
  }
  // segments take half damage — game melee checks overlap with boss aabb; widen via custom overlaps
  overlaps(o) {
    if (super.overlaps(o)) return true;
    for (let s = 1; s <= this.segments; s++) {
      const pt = this.trail[s * 8];
      if (pt && Math.abs(pt.x - o.x) < (36 + o.w) / 2 && Math.abs(pt.y - o.y) < (36 + o.h) / 2) return true;
    }
    return false;
  }
  draw(ctx, cam, time) {
    // segments back-to-front
    for (let s = this.segments; s >= 1; s--) {
      const pt = this.trail[s * 8];
      if (!pt) continue;
      const r = 20 - s * 0.9;
      ctx.fillStyle = s % 2 ? '#4a1578' : '#7b2cbf';
      ctx.beginPath(); ctx.arc(pt.x - cam.x, pt.y - cam.y, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(110,231,255,0.5)';
      ctx.beginPath(); ctx.arc(pt.x - cam.x, pt.y - cam.y, r * 0.4, 0, 7); ctx.fill();
    }
    // head
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(this.angle);
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.2)';
    ctx.fillStyle = this.phase2 ? '#9d4edd' : '#7b2cbf';
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.fill();
    // jaw
    const jaw = Math.abs(Math.sin(time * 8)) * 0.6;
    ctx.fillStyle = '#2a0a45';
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(30, -14 - jaw * 12); ctx.lineTo(30, 14 + jaw * 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(10 + k * 6, -8 - jaw * 8); ctx.lineTo(13 + k * 6, -2); ctx.lineTo(16 + k * 6, -8 - jaw * 8); ctx.fill(); }
    // eye
    ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(-4, -10, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3, -11, 2, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* ============ 3. STORM KERNEL — teleporting lightning core ============ */
class StormKernel extends Boss {
  constructor(x, y) {
    super('storm_kernel', x, y, 70, 70);
    this.contactDmg = 20;
    this.tpT = 3; this.boltT = 2.5; this.sparkT = 1.6;
    this.alpha = 1;
  }
  update(dt, world, game) {
    this.baseUpdate(dt);
    const p = game.player;
    this.y += Math.sin(this.t * 2) * 20 * dt;
    this.alpha = Math.min(1, this.alpha + dt * 3);
    // teleport near player
    this.tpT -= dt;
    if (this.tpT <= 0) {
      this.tpT = this.phase2 ? 2.0 : 3.2;
      game.fx.explode(this.x, this.y, '#6ee7ff', 12);
      const zx = game.world.bossZone ? game.world.bossZone.x1 : TS * 4;
      this.x = Math.max(zx + TS * 2, Math.min(game.world.w * TS - TS * 3, p.x + (Math.random() < 0.5 ? -1 : 1) * (TS * 4 + Math.random() * TS * 4)));
      this.y = p.y - TS * (3 + Math.random() * 3);
      this.alpha = 0;
      game.sfx.play('tp');
    }
    // lightning columns (telegraphed)
    this.boltT -= dt;
    if (this.boltT <= 0) {
      this.boltT = this.phase2 ? 2.2 : 3.6;
      const n = this.phase2 ? 3 : 2;
      for (let i = 0; i < n; i++) game.hazards.push(new LightningBolt(p.x + (i - (n - 1) / 2) * TS * 3.5, 0.85));
      game.sfx.play('eshoot');
    }
    // homing spark
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = this.phase2 ? 1.4 : 2.4;
      const a = Math.atan2(p.y - this.y, p.x - this.x);
      const pr = new Projectile(this.x, this.y, Math.cos(a) * 300, Math.sin(a) * 300, 14, false, '#6ee7ff', { r: 7, life: 3 });
      pr.homing = 260;
      game.projectiles.push(pr);
    }
    this.contact(game, dt);
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy); ctx.globalAlpha = this.alpha;
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.2)';
    // storm cloud ring
    ctx.fillStyle = '#2a3f66';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * 6.28 + time;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 34, Math.sin(a) * 22, 20, 0, 7); ctx.fill();
    }
    // core
    ctx.fillStyle = this.phase2 ? '#a7e8ff' : '#6ee7ff';
    ctx.shadowColor = '#6ee7ff'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    // angry eye
    ctx.fillStyle = '#0a1a2e'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(2, -2, 4, 0, 7); ctx.fill();
    // crackles
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      const a = time * 4 + k * 2.1;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 24, Math.sin(a) * 24);
      ctx.lineTo(Math.cos(a) * 36 + 6, Math.sin(a) * 36); ctx.lineTo(Math.cos(a) * 46 - 4, Math.sin(a) * 46); ctx.stroke();
    }
    ctx.restore();
  }
}

class LightningBolt {
  constructor(x, warn) { this.x = x; this.warnT = warn; this.zapT = 0.35; this.dead = false; this.w = TS * 0.9; }
  update(dt, world, game) {
    if (this.warnT > 0) {
      this.warnT -= dt;
      if (this.warnT <= 0) game.sfx.play('boom');
      return;
    }
    this.zapT -= dt;
    if (this.zapT <= 0) { this.dead = true; return; }
    const p = game.player;
    if (Math.abs(p.x - this.x) < this.w / 2 + p.w / 2) p.hurt(24, game, 0);
  }
  draw(ctx, cam, time, vh) {
    const sx = this.x - cam.x;
    if (this.warnT > 0) {
      ctx.strokeStyle = 'rgba(110,231,255,' + (0.3 + 0.3 * Math.sin(time * 24)) + ')';
      ctx.setLineDash([6, 10]); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, vh); ctx.stroke(); ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
      ctx.beginPath(); let y = 0, x = sx;
      ctx.moveTo(x, 0);
      while (y < vh) { y += 30 + Math.random() * 30; x = sx + (Math.random() - 0.5) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(110,231,255,0.6)'; ctx.lineWidth = 12; ctx.stroke();
    }
  }
}

/* ============ 4. ADMIN — final boss, wields the ban hammer ============ */
class AdminBoss extends Boss {
  constructor(x, y) {
    super('admin', x, y, 80, 110);
    this.contactDmg = 26;
    this.state = 'float'; this.stateT = 3;
    this.homeY = y;
    this.slamTargetX = 0;
    this.minionT = 9;
  }
  update(dt, world, game) {
    this.baseUpdate(dt);
    const p = game.player;
    const spd = this.phase2 ? 1.5 : 1;
    this.stateT -= dt;
    if (this.state === 'float') {
      // drift above the player
      this.x += Math.max(-160, Math.min(160, (p.x - this.x) * 1.4)) * dt;
      this.y = this.homeY + Math.sin(this.t * 2) * 26;
      if (this.stateT <= 0) {
        const roll = Math.random();
        if (roll < 0.45) { this.state = 'slamRise'; this.stateT = 0.7; this.slamTargetX = p.x; }
        else { this.state = 'burst'; this.stateT = this.phase2 ? 1.6 : 1.2; this._burstN = 0; }
      }
      // summon minions periodically
      this.minionT -= dt;
      if (this.minionT <= 0) {
        this.minionT = this.phase2 ? 7 : 11;
        for (let i = 0; i < (this.phase2 ? 3 : 2); i++) {
          const e = new Enemy(Math.random() < 0.5 ? 'glitchling' : 'zapper', this.x + (i - 1) * 60, this.y, 3);
          game.enemies.push(e);
        }
        game.toast('ADMIN spawned enforcers!', 'warn');
        game.sfx.play('bossroar');
      }
    } else if (this.state === 'slamRise') {
      this.slamTargetX += (p.x - this.slamTargetX) * 2 * dt;
      this.x += (this.slamTargetX - this.x) * 6 * dt;
      this.y -= 260 * dt;
      if (this.stateT <= 0) { this.state = 'slam'; this.vy = 0; }
    } else if (this.state === 'slam') {
      this.vy += 4200 * dt;
      this.y += this.vy * dt;
      // land when hitting ground below
      const ty = Math.floor((this.y + this.h / 2) / TS);
      let landed = false;
      for (let tx = Math.floor((this.x - this.w / 2) / TS); tx <= Math.floor((this.x + this.w / 2) / TS); tx++) {
        if (world.isSolid(tx, ty)) { landed = true; break; }
      }
      if (landed) {
        this.y = ty * TS - this.h / 2 - 0.01;
        this.state = 'recover'; this.stateT = this.phase2 ? 0.8 : 1.4;
        game.shake = 0.5;
        game.sfx.play('boom');
        game.fx.explode(this.x, this.y + this.h / 2, '#ffd166', 26);
        // shockwaves along the ground
        for (const dir of [-1, 1]) {
          game.projectiles.push(new Projectile(this.x + dir * 40, this.y + this.h / 2 - 12, dir * 420, 0, 18, false, '#ffd166', { r: 12, life: 1.6 }));
        }
        if (Math.abs(p.x - this.x) < 120 && Math.abs(p.y - this.y) < 140) p.hurt(30, game, Math.sign(p.x - this.x) * 420);
      }
    } else if (this.state === 'recover') {
      if (this.stateT <= 0) { this.state = 'rise'; }
    } else if (this.state === 'rise') {
      this.y += (this.homeY - this.y) * 3 * dt;
      if (Math.abs(this.y - this.homeY) < 12) { this.state = 'float'; this.stateT = this.phase2 ? 1.8 : 3; }
    } else if (this.state === 'burst') {
      this._burstTick = (this._burstTick || 0) - dt;
      if (this._burstTick <= 0) {
        this._burstTick = 0.4;
        this._burstN++;
        const n = this.phase2 ? 12 : 8;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * 6.283 + this._burstN * 0.3;
          game.projectiles.push(new Projectile(this.x, this.y, Math.cos(a) * 300, Math.sin(a) * 300, 12, false, '#ff4d6d', { r: 6, life: 3 }));
        }
        game.sfx.play('eshoot');
      }
      if (this.stateT <= 0) { this.state = 'float'; this.stateT = this.phase2 ? 1.6 : 2.6; }
    }
    this.contact(game, dt);
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy);
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.2)';
    // cloak
    ctx.fillStyle = this.phase2 ? '#3d0a1e' : '#1c2536';
    ctx.beginPath();
    ctx.moveTo(-40, -40); ctx.lineTo(40, -40); ctx.lineTo(34 + Math.sin(time * 3) * 5, 55); ctx.lineTo(-34 - Math.sin(time * 3) * 5, 55);
    ctx.closePath(); ctx.fill();
    // face void
    ctx.fillStyle = '#05070d'; ctx.fillRect(-26, -36, 52, 40);
    // glowing admin eyes
    ctx.fillStyle = '#ffd166'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 12;
    ctx.fillRect(-18, -24, 12, this.phase2 ? 12 : 6); ctx.fillRect(6, -24, 12, this.phase2 ? 12 : 6);
    ctx.shadowBlur = 0;
    // crown
    ctx.fillStyle = '#ffd166';
    ctx.beginPath(); ctx.moveTo(-30, -40); ctx.lineTo(-30, -58); ctx.lineTo(-15, -46); ctx.lineTo(0, -60); ctx.lineTo(15, -46); ctx.lineTo(30, -58); ctx.lineTo(30, -40); ctx.closePath(); ctx.fill();
    // ban hammer
    const swing = this.state === 'slam' ? 2.4 : this.state === 'slamRise' ? -0.9 : Math.sin(time * 2) * 0.2;
    ctx.save(); ctx.translate(44, -10); ctx.rotate(swing);
    ctx.fillStyle = '#7a5a3a'; ctx.fillRect(-4, -8, 8, 62);
    ctx.fillStyle = '#8899aa'; ctx.fillRect(-20, 48, 40, 26);
    ctx.fillStyle = '#ff4d6d'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
    ctx.fillText('BAN', 0, 66);
    ctx.restore();
    ctx.restore();
  }
}

/* ============ 5. KRAKEN.SYS — flooded archive leviathan ============ */
class KrakenBoss extends Boss {
  constructor(x, y) {
    super('kraken', x, y, 100, 84);
    this.homeX = x; this.homeY = y;
    this.inkT = 2.5; this.tentT = 5;
    this.contactDmg = 24;
  }
  update(dt, world, game) {
    this.baseUpdate(dt);
    const p = game.player;
    const spd = this.phase2 ? 1.5 : 1;
    this.homeX += Math.sign(p.x - this.homeX) * 34 * spd * dt;
    this.x = this.homeX + Math.sin(this.t * 0.9 * spd) * 70;
    this.y = this.homeY + Math.sin(this.t * 1.7) * 18;
    // arcing ink volley
    this.inkT -= dt;
    if (this.inkT <= 0) {
      this.inkT = this.phase2 ? 1.7 : 2.8;
      const n = this.phase2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const dx = p.x - this.x + (i - (n - 1) / 2) * TS * 2.5, tt = 1.0;
        game.projectiles.push(new Projectile(this.x, this.y, dx / tt, (p.y - this.y) / tt - 0.5 * 1000 * tt, 14, false, '#1d3557', { r: 8, gravity: 1000, life: 2.6 }));
      }
      game.sfx.play('eshoot');
    }
    // tentacles erupt from below
    this.tentT -= dt;
    if (this.tentT <= 0) {
      this.tentT = this.phase2 ? 3.2 : 5.2;
      const xs = this.phase2 ? [p.x - TS * 3.5, p.x, p.x + TS * 3.5] : [p.x - TS * 2, p.x + TS * 2];
      for (const tx of xs) game.hazards.push(new Tentacle(tx, 0.9, world));
      game.sfx.play('bossroar');
    }
    // phase 2: whirlpool drag
    if (this.phase2) {
      const d = Math.hypot(p.x - this.x, p.y - this.y);
      if (d < 12 * TS && d > 2 * TS) p.x += Math.sign(this.x - p.x) * 60 * dt;
    }
    this.contact(game, dt);
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy);
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.2)';
    // dangling tentacles
    ctx.strokeStyle = this.phase2 ? '#26547c' : '#1d3557'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.5;
      ctx.beginPath(); ctx.moveTo(k * 18 - 36, 30);
      ctx.quadraticCurveTo(k * 18 - 36 + Math.sin(time * 3 + k) * 16, 62, k * 18 - 36 + Math.sin(time * 2 + k * 2) * 26 + a * 10, 88);
      ctx.stroke();
    }
    // head
    ctx.fillStyle = this.phase2 ? '#2a628f' : '#1d3557';
    ctx.beginPath(); ctx.ellipse(0, -4, 50, 44, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(56,217,245,0.25)';
    ctx.beginPath(); ctx.ellipse(-14, -22, 18, 12, -0.4, 0, 7); ctx.fill();
    // eyes
    for (const ex of [-20, 20]) {
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(ex, -8, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#05070d'; ctx.beginPath(); ctx.ellipse(ex + Math.sign(ex) * 2, -8, 4, this.phase2 ? 9 : 6, 0, 0, 7); ctx.fill();
    }
    // beak
    ctx.fillStyle = '#0a1a2e';
    ctx.beginPath(); ctx.moveTo(-8, 18); ctx.lineTo(0, 30 + Math.sin(time * 6) * 4); ctx.lineTo(8, 18); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

// tentacle column rising from the world floor
class Tentacle {
  constructor(x, warn, world) {
    this.x = x; this.warnT = warn; this.upT = 1.5; this.dead = false;
    this.w = TS * 1.1; this.floorY = world.h * TS - TS * 2;
    this.height = 15 * TS; this.rise = 0;
  }
  update(dt, world, game) {
    if (this.warnT > 0) { this.warnT -= dt; return; }
    this.upT -= dt;
    this.rise = Math.min(1, this.rise + dt * 4);
    if (this.upT <= 0) { this.rise -= dt * 3; if (this.rise <= 0) { this.dead = true; return; } }
    const p = game.player;
    const topY = this.floorY - this.height * this.rise;
    if (Math.abs(p.x - this.x) < this.w / 2 + p.w / 2 && p.y + p.h / 2 > topY) p.hurt(18, game, Math.sign(p.x - this.x) * 300);
  }
  draw(ctx, cam, time, vh) {
    const sx = this.x - cam.x;
    if (this.warnT > 0) {
      const fy = this.floorY - cam.y;
      ctx.fillStyle = 'rgba(56,217,245,' + (0.2 + 0.2 * Math.sin(time * 20)) + ')';
      ctx.fillRect(sx - this.w / 2, fy - 30, this.w, 30);
      return;
    }
    const topY = this.floorY - this.height * Math.max(0, this.rise) - cam.y;
    const fy = this.floorY - cam.y;
    ctx.fillStyle = '#1d3557';
    ctx.beginPath();
    ctx.moveTo(sx - this.w / 2, fy);
    ctx.quadraticCurveTo(sx - this.w / 2 + Math.sin(time * 5) * 6, (topY + fy) / 2, sx, topY);
    ctx.quadraticCurveTo(sx + this.w / 2 + Math.sin(time * 5) * 6, (topY + fy) / 2, sx + this.w / 2, fy);
    ctx.closePath(); ctx.fill();
    // suckers
    ctx.fillStyle = 'rgba(56,217,245,0.5)';
    for (let k = 1; k < 6; k++) {
      const yy = topY + (fy - topY) * (k / 6);
      ctx.beginPath(); ctx.arc(sx + Math.sin(k * 2 + time * 5) * 6, yy, 4, 0, 7); ctx.fill();
    }
  }
}

/* ============ 6. ROOTKIT — the invisible stalker ============ */
class RootkitBoss extends Boss {
  constructor(x, y) {
    super('rootkit', x, y, 60, 90);
    this.homeY = y;
    this.state = 'visible'; this.stateT = 3;
    this.alpha = 1;
    this.dashLine = null; this.minionT = 8;
    this.contactDmg = 22;
  }
  update(dt, world, game) {
    this.baseUpdate(dt);
    const p = game.player;
    const spd = this.phase2 ? 1.5 : 1;
    this.stateT -= dt;
    if (this.state === 'visible') {
      this.alpha = Math.min(1, this.alpha + dt * 2);
      this.x += Math.sign(p.x - this.x) * 70 * spd * dt;
      this.y = this.homeY + Math.sin(this.t * 2) * 20;
      if (this.stateT <= 0) { this.state = 'cloak'; this.stateT = this.phase2 ? 2.6 : 3.4; game.toast('ROOTKIT vanished from the process list…', 'warn'); game.sfx.play('tp'); }
      this.minionT -= dt;
      if (this.minionT <= 0) {
        this.minionT = this.phase2 ? 6 : 10;
        for (let i = 0; i < (this.phase2 ? 3 : 2); i++) game.enemies.push(new Enemy('wraith', this.x + (i - 1) * 50, this.y - 30, 3));
        game.sfx.play('bossroar');
      }
    } else if (this.state === 'cloak') {
      this.alpha = Math.max(0.06, this.alpha - dt * 2.5);
      // circle the player unseen
      const a = this.t * 1.6 * spd;
      this.x += ((p.x + Math.cos(a) * TS * 7) - this.x) * 2 * dt;
      this.y += ((p.y - TS * 3 + Math.sin(a) * TS * 2) - this.y) * 2 * dt;
      if (this.stateT <= 0) {
        this.state = 'aim'; this.stateT = 0.7;
        const ang = Math.atan2(p.y - this.y, p.x - this.x);
        this.dashLine = { x: this.x, y: this.y, ang };
      }
    } else if (this.state === 'aim') {
      this.alpha = 0.35 + Math.sin(this.t * 20) * 0.2;
      if (this.stateT <= 0) {
        this.state = 'dash'; this.stateT = 0.5;
        this.vx = Math.cos(this.dashLine.ang) * 950;
        this.vy = Math.sin(this.dashLine.ang) * 950;
        game.sfx.play('dash');
      }
    } else if (this.state === 'dash') {
      this.alpha = 1;
      this.x += this.vx * dt; this.y += this.vy * dt;
      // clamp to world
      this.x = Math.max(TS * 2, Math.min(world.w * TS - TS * 2, this.x));
      this.y = Math.max(TS * 3, Math.min(world.h * TS - TS * 4, this.y));
      if (this.stateT <= 0) {
        this.dashLine = null;
        if (this.phase2 && !this._chained) { this._chained = true; this.state = 'aim'; this.stateT = 0.5; const ang = Math.atan2(p.y - this.y, p.x - this.x); this.dashLine = { x: this.x, y: this.y, ang }; }
        else { this._chained = false; this.state = 'visible'; this.stateT = this.phase2 ? 2.2 : 3; }
      }
    }
    this.contact(game, dt);
  }
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    // dash telegraph
    if (this.dashLine && this.state === 'aim') {
      ctx.strokeStyle = 'rgba(255,77,109,' + (0.3 + 0.3 * Math.sin(time * 24)) + ')';
      ctx.setLineDash([10, 8]); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(this.dashLine.ang) * 900, sy + Math.sin(this.dashLine.ang) * 900);
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.save(); ctx.translate(sx, sy);
    ctx.globalAlpha = this.alpha;
    if (this.hitFlash > 0) ctx.filter = 'brightness(2.2)';
    // ragged shadow cloak
    ctx.fillStyle = '#12121f';
    ctx.beginPath();
    ctx.moveTo(-30, -40);
    ctx.quadraticCurveTo(0, -56, 30, -40);
    for (let k = 5; k >= -5; k--) ctx.lineTo(k * 6, 42 + Math.sin(time * 4 + k) * 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // eyes stay faintly visible even cloaked
    ctx.globalAlpha = Math.max(0.5, this.alpha);
    ctx.fillStyle = '#ff4d6d';
    const blink = Math.sin(time * 2.4) > -0.92 ? 1 : 0.1;
    ctx.fillRect(sx - 13, sy - 26, 9, 5 * blink * (this.phase2 ? 1.8 : 1));
    ctx.fillRect(sx + 4, sy - 26, 9, 5 * blink * (this.phase2 ? 1.8 : 1));
    ctx.globalAlpha = 1;
  }
}

function spawnBoss(id, x, y) {
  switch (id) {
    case 'firewall_daemon': return new FirewallDaemon(x, y);
    case 'null_wurm': return new NullWurm(x, y);
    case 'kraken': return new KrakenBoss(x, y);
    case 'storm_kernel': return new StormKernel(x, y);
    case 'rootkit': return new RootkitBoss(x, y);
    case 'admin': return new AdminBoss(x, y);
  }
}
