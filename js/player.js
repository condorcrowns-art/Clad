'use strict';
/* ============================================================
   GLITCHTOPIA — player: physics, inventory, gear, actions
   ============================================================ */

class Player extends Entity {
  constructor() {
    super(0, 0, 22, 46);
    this.maxHp = 100; this.hp = 100;
    this.facing = 1;
    this.inv = {};                    // itemId -> count
    this.hotbar = ['fist', null, null, null, null, null, null, null, null];
    this.sel = 0;
    this.equip = { back: null, feet: null, chip: null };
    this.iframes = 0;
    this.jumpsUsed = 0;
    this.fuel = 1; // 0..1 of jetpack
    this.dashT = 0; this.dashCd = 0;
    this.swingT = 0;   // cosmetic swing anim
    this.actionCd = 0; // attack/mine rate limiter
    this.regenT = 0;
    this.jetting = false;
  }

  /* ---------- gear helpers ---------- */
  gearFx(key) {
    let v = null;
    for (const slot of ['back', 'feet', 'chip']) {
      const id = this.equip[slot];
      if (id && ITEMS[id].fx && ITEMS[id].fx[key] !== undefined) v = ITEMS[id].fx[key];
    }
    return v;
  }
  magnetRange() { const m = this.gearFx('magnet'); return m || 1.2; }
  dmgMult() { return this.gearFx('dmgMult') || 1; }
  heldItem() { const id = this.hotbar[this.sel]; return id ? ITEMS[id] : ITEMS.fist; }

  give(id, n) {
    this.inv[id] = (this.inv[id] || 0) + (n || 1);
    // auto-slot into empty hotbar space
    if (!this.hotbar.includes(id)) {
      const free = this.hotbar.indexOf(null);
      if (free > 0) this.hotbar[free] = id;
    }
    ui.dirty = true;
  }
  take(id, n) {
    n = n || 1;
    if ((this.inv[id] || 0) < n) return false;
    this.inv[id] -= n;
    if (this.inv[id] <= 0) {
      delete this.inv[id];
      for (let i = 0; i < 9; i++) if (this.hotbar[i] === id) this.hotbar[i] = null;
      for (const s of ['back', 'feet', 'chip']) if (this.equip[s] === id) this.equip[s] = null;
    }
    ui.dirty = true;
    return true;
  }
  count(id) { return this.inv[id] || 0; }

  /* ---------- damage ---------- */
  hurt(dmg, game, kx) {
    if (this.iframes > 0 || this.hp <= 0) return;
    const armor = this.gearFx('armor') || 0;
    dmg = Math.max(1, Math.round(dmg * (1 - armor)));
    this.hp -= dmg;
    this.iframes = 0.7;
    if (kx) { this.vx = kx; this.vy = -220; }
    game.fx.explode(this.x, this.y, '#ff4d6d', 8);
    game.sfx.play('hurt');
    game.shake = Math.max(game.shake, 0.25);
    ui.updateHUD();
    if (this.hp <= 0) game.onPlayerDeath();
  }

  /* ---------- update ---------- */
  update(dt, world, game, input) {
    const feet = this.equip.feet ? ITEMS[this.equip.feet].fx : null;
    const speedMult = (feet && feet.speed) || 1;
    const baseSpeed = 250 * speedMult;
    this.iframes = Math.max(0, this.iframes - dt);
    this.actionCd = Math.max(0, this.actionCd - dt);
    this.swingT = Math.max(0, this.swingT - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    // passive regen from admin crown
    const regen = this.gearFx('regen');
    if (regen && this.hp < this.maxHp) {
      this.regenT += dt;
      if (this.regenT > 1) { this.regenT = 0; this.hp = Math.min(this.maxHp, this.hp + regen); ui.updateHUD(); }
    }

    // dash
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vy = 0;
    } else {
      // walk
      let mx = 0;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (mx !== 0) this.facing = mx;
      const accel = this.onGround ? 12 : 7;
      this.vx += (mx * baseSpeed - this.vx) * Math.min(1, accel * dt);

      // jump / double jump
      if (input.jumpPressed) {
        const extraJumps = (feet && feet.doubleJump) || 0;
        if (this.onGround) { this.vy = -640; this.jumpsUsed = 0; game.fx.puff(this.x, this.y + this.h / 2, '#9fb4d0'); }
        else if (this.jumpsUsed < extraJumps) { this.jumpsUsed++; this.vy = -580; game.fx.puff(this.x, this.y + this.h / 2, '#2de2a3'); game.sfx.play('bounce'); }
        input.jumpPressed = false;
      }

      // jetpack
      const jp = this.equip.back ? ITEMS[this.equip.back].fx.jetpack : null;
      this.jetting = false;
      if (jp && input.jump && !this.onGround && this.vy > -420 && this.fuel > 0) {
        this.vy -= jp.thrust * dt;
        this.fuel = Math.max(0, this.fuel - dt / jp.fuel);
        this.jetting = true;
        if (Math.random() < 0.5) game.fx.add(this.x - this.facing * 8, this.y + this.h / 2 - 6, (Math.random() - 0.5) * 60, 200 + Math.random() * 100, Math.random() < 0.5 ? '#ff9e6d' : '#ffd166', 0.35, 4, 0);
        if (Math.random() < 0.12) game.sfx.play('jet');
      }
      if (jp && this.onGround) this.fuel = Math.min(1, this.fuel + dt / jp.regen);

      // dash (storm boots)
      const dash = feet && feet.dash;
      if (dash && input.dashPressed && this.dashCd <= 0) {
        this.dashT = dash.dur; this.dashCd = dash.cd;
        this.vx = this.facing * dash.speed; this.vy = 0;
        this.iframes = Math.max(this.iframes, dash.dur + 0.1);
        game.fx.explode(this.x, this.y, '#6ee7ff', 8);
        game.sfx.play('dash');
      }
      input.dashPressed = false;

      this.vy += this.gravity * dt;
      this.vy = Math.min(this.vy, 1100);
    }
    if (this.onGround) this.jumpsUsed = 0;

    this.moveAndCollide(dt, world);

    // tile effects on touch
    let onConveyor = 0, healNear = 0;
    this.tilesTouching(world, (it, tx, ty) => {
      if (it.fx) {
        if (it.fx.damage) this.hurt(it.fx.damage, game, 0);
        if (it.fx.conveyor && this.onGround && Math.floor((this.y + this.h / 2 + 2) / TS) === ty) {
          onConveyor = ((world.meta[world.idx(tx, ty)] || {}).dir || 1) * it.fx.conveyor;
        }
      }
    });
    if (onConveyor) this.x += onConveyor * dt;

    // heal auras (repair nodes / trophy) — scan nearby tiles
    const ptx = Math.floor(this.x / TS), pty = Math.floor(this.y / TS);
    outer:
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const it = world.item(ptx + dx, pty + dy);
      if (it && it.fx && it.fx.heal && Math.hypot(dx, dy) <= it.fx.healRange) { healNear = Math.max(healNear, it.fx.heal); break outer; }
    }
    if (healNear && this.hp < this.maxHp) {
      this._healT = (this._healT || 0) + dt;
      if (this._healT > 0.5) {
        this._healT = 0;
        this.hp = Math.min(this.maxHp, this.hp + healNear / 2);
        game.fx.add(this.x + (Math.random() - 0.5) * 20, this.y - 10, 0, -60, '#7bf1a8', 0.6, 4, 0);
        ui.updateHUD();
      }
    }

    // fell out of world
    if (this.y > world.h * TS + 200) this.hurt(35, game, 0), this.y = world.h * TS - TS * 4, this.vy = 0;
  }

  /* ---------- primary action: mine / attack / place / plant / consume ---------- */
  act(game, wx, wy) {
    if (this.actionCd > 0) return;
    const world = game.world;
    const held = this.heldItem();
    const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    const dist = Math.hypot(wx - this.x, wy - this.y) / TS;
    const inReach = dist <= 4.2;
    this.facing = wx >= this.x ? 1 : -1;

    // consumables
    if (held.kind === 'consumable') {
      this.actionCd = 0.35;
      if (held.heal) {
        if (this.hp >= this.maxHp) { game.toast('HP already full.', 'warn'); return; }
        this.take(held.id, 1);
        this.hp = Math.min(this.maxHp, this.hp + held.heal);
        game.fx.harvest(this.x, this.y, '#ff4d6d'); game.sfx.play('harvest'); ui.updateHUD();
      } else if (held.bomb) {
        if (!inReach) { game.toast('Too far to throw.', 'warn'); return; }
        this.take(held.id, 1);
        game.detonate(wx, wy, held.bomb.radius, held.bomb.dmg);
      } else if (held.mystery) {
        this.take(held.id, 1);
        const pick = MYSTERY_POOL[Math.floor(Math.random() * MYSTERY_POOL.length)];
        this.give(pick + '_seed', 1);
        game.toast('Mystery seed decoded: ' + ITEMS[pick + '_seed'].name + '!', 'gold');
        game.sfx.play('splice');
      }
      return;
    }

    // seeds: plant or splice
    if (held.kind === 'seed') {
      this.actionCd = 0.3;
      if (!inReach) return;
      const i = world.idx(tx, ty);
      if (world.trees.has(i)) {
        const res = world.spliceTree(tx, ty, held.id);
        if (res === 'same') game.toast('Same seed — nothing to splice.', 'warn');
        else if (res === 'fail') { game.toast('These genes refuse to compile. Check the CODEX [C].', 'warn'); game.sfx.play('error'); }
        else if (res !== 'no') {
          this.take(held.id, 1);
          game.progress.discovered[res] = true;
          game.toast('SPLICE SUCCESS → ' + ITEMS[res].name + ' tree!', 'gold');
          game.fx.harvest(tx * TS + TS / 2, ty * TS + TS / 2, '#2de2a3');
          game.sfx.play('splice');
          game.save();
        }
      } else if (world.plantSeed(tx, ty, held.id)) {
        this.take(held.id, 1);
        game.fx.puff(tx * TS + TS / 2, ty * TS + TS / 2, '#3ddc84');
        game.sfx.play('plant');
      } else game.toast('Needs an empty spot with solid ground below.', 'warn');
      return;
    }

    // blocks: place
    if (held.kind === 'block') {
      this.actionCd = 0.18;
      if (!inReach) return;
      const i = world.idx(tx, ty);
      if (world.tiles[i] || world.trees.has(i)) { this.tryHarvestOrMine(game, tx, ty, wx, wy); return; }
      // don't place inside self or enemies
      const px = tx * TS + TS / 2, py = ty * TS + TS / 2;
      if (Math.abs(px - this.x) < (TS + this.w) / 2 && Math.abs(py - this.y) < (TS + this.h) / 2) return;
      if (!this.take(held.id, 1)) return;
      world.set(tx, ty, held.id);
      if (held.fx && held.fx.conveyor) world.meta[i] = { dir: this.facing };
      game.sfx.play('place');
      if (!world.isHome) game.toast('Note: sector worlds reset when you leave.', '');
      return;
    }

    // tools & weapons: mine blocks / harvest trees / attack
    this.tryHarvestOrMine(game, tx, ty, wx, wy);
  }

  tryHarvestOrMine(game, tx, ty, wx, wy) {
    const world = game.world;
    const held = this.heldItem();
    const tool = (held.kind === 'tool' || held.kind === 'weapon') ? held : ITEMS.fist;
    const dist = Math.hypot(wx - this.x, wy - this.y) / TS;
    const inReach = dist <= 4.2;

    // 1) melee/ranged attack if aiming at enemy or empty air
    const i = world.idx(tx, ty);
    const aimAtTile = inReach && (world.tiles[i] || world.trees.has(i));

    if (!aimAtTile) {
      // ATTACK
      const rate = tool.rate || 3;
      this.actionCd = 1 / rate;
      this.swingT = 0.18;
      if (tool.projectile) {
        const a = Math.atan2(wy - this.y, wx - this.x);
        game.projectiles.push(new Projectile(this.x + Math.cos(a) * 20, this.y - 6 + Math.sin(a) * 20,
          Math.cos(a) * tool.projectile.speed, Math.sin(a) * tool.projectile.speed,
          Math.round(tool.dmg * this.dmgMult()), true, tool.projectile.color));
        game.sfx.play('shoot');
      } else {
        // melee arc
        const range = (tool.range || 1.4) * TS;
        const dmg = Math.round((tool.dmg || 8) * this.dmgMult());
        let hitSomething = false;
        const targets = game.boss && !game.boss.dead ? [...game.enemies, game.boss] : game.enemies;
        for (const e of targets) {
          if (e.dead) continue;
          const dx = e.x - this.x, dy = e.y - this.y;
          if (Math.sign(dx) !== this.facing && Math.abs(dx) > e.w) continue;
          if (Math.hypot(dx, dy) < range + e.w / 2) {
            e.hurt(dmg, game, this.facing * 200);
            if (tool.burn) { e.burn = tool.burn.dps; e.burnT = tool.burn.dur; }
            hitSomething = true;
          }
        }
        game.sfx.play(hitSomething ? 'hit' : 'punch');
      }
      return;
    }

    // 2) MINE / HARVEST
    this.actionCd = 1 / (tool.mineRate || 4);
    this.swingT = 0.15;
    if (world.trees.has(i)) { world.harvestTree(tx, ty, game); return; }
    game.sfx.play('punch');
    const area = tool.area || 0;
    for (let dy = -area; dy <= area; dy++) for (let dx = -area; dx <= area; dx++) {
      if (world.get(tx + dx, ty + dy)) {
        const broke = world.hitTile(tx + dx, ty + dy, tool.minePower || 1, game);
        if (broke) game.sfx.play('break');
      }
    }
    if (world.isHome) game.saveSoon();
  }

  /* ---------- draw ---------- */
  draw(ctx, cam, time) {
    const sx = this.x - cam.x, sy = this.y - cam.y;
    ctx.save(); ctx.translate(sx, sy);
    if (this.iframes > 0 && Math.floor(time * 14) % 2 === 0) ctx.globalAlpha = 0.4;
    const walk = Math.abs(this.vx) > 20 && this.onGround ? Math.sin(time * 12) : 0;

    // jetpack on back
    if (this.equip.back) {
      ctx.fillStyle = '#8899aa';
      ctx.fillRect(-this.facing * 16 - 4, -14, 8, 20);
      if (this.jetting) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(-this.facing * 16 - 4, 6); ctx.lineTo(-this.facing * 16, 16 + Math.random() * 8); ctx.lineTo(-this.facing * 16 + 4, 6); ctx.fill(); }
    }
    // legs
    ctx.fillStyle = this.equip.feet ? (this.equip.feet === 'storm_boots' ? '#ffd166' : '#2de2a3') : '#33415e';
    ctx.fillRect(-9, 8 + walk * 3, 7, 15 - walk * 3);
    ctx.fillRect(2, 8 - walk * 3, 7, 15 + walk * 3);
    // body
    ctx.fillStyle = '#4361ee';
    ctx.fillRect(-10, -12, 20, 22);
    ctx.fillStyle = '#3a0ca3'; ctx.fillRect(-10, 4, 20, 6);
    // head
    ctx.fillStyle = '#ffd8b1';
    ctx.fillRect(-8, -30, 16, 17);
    // visor
    ctx.fillStyle = '#0d1526';
    ctx.fillRect(this.facing > 0 ? -2 : -10, -27, 12, 7);
    ctx.fillStyle = '#6ee7ff';
    ctx.fillRect(this.facing > 0 ? 0 : -8, -26, 8, 4);
    // crown if admin chip
    if (this.equip.chip === 'admin_crown') {
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(-8, -38); ctx.lineTo(-3, -33); ctx.lineTo(0, -39); ctx.lineTo(3, -33); ctx.lineTo(8, -38); ctx.lineTo(8, -30); ctx.closePath(); ctx.fill();
    }
    // held item / arm
    const held = this.heldItem();
    const swing = this.swingT > 0 ? -0.9 : 0;
    ctx.save();
    ctx.translate(this.facing * 10, -6);
    ctx.rotate(this.facing * (0.3 + swing));
    ctx.fillStyle = '#ffd8b1'; ctx.fillRect(0, -3, this.facing * 12, 6);
    if (held.id !== 'fist') {
      const ic = iconFor(held.id);
      ctx.save();
      ctx.translate(this.facing * 16, -6);
      if (this.facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(ic, -6, -8, 28, 28);
      ctx.restore();
    }
    ctx.restore();
    // aegis shield shimmer
    if (this.equip.chip === 'aegis_chip' || this.equip.chip === 'admin_crown') {
      ctx.strokeStyle = 'rgba(45,226,163,' + (0.2 + 0.15 * Math.sin(time * 3)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -6, 34, 0, 7); ctx.stroke();
    }
    ctx.restore();
  }
}
