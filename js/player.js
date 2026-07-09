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
    this.equip = { back: null, feet: null, chip: null, pet: null };
    this.shieldNear = 0;
    this.iframes = 0;
    this.jumpsUsed = 0;
    this.fuel = 1; // 0..1 of jetpack
    this.dashT = 0; this.dashCd = 0;
    this.swingT = 0;   // cosmetic swing anim
    this.actionCd = 0; // attack/mine rate limiter
    this.regenT = 0;
    this.jetting = false;
    this.squash = 0;       // landing squash-and-stretch
    this.runPhase = 0;     // walk cycle phase
    this.ghosts = [];      // dash afterimages
    this._dustT = 0; this._bubT = 0; this._auraT = 0;
    this._wasGround = false; this._lastVy = 0;
    this.coyoteT = 0; this.jumpBufT = 0;
  }

  /* ---------- gear helpers ---------- */
  gearFx(key) {
    let v = null;
    for (const slot of ['back', 'feet', 'chip', 'pet']) {
      const id = this.equip[slot];
      if (id && ITEMS[id].fx && ITEMS[id].fx[key] !== undefined) v = ITEMS[id].fx[key];
    }
    return v;
  }
  magnetRange() {
    const held = this.heldItem();
    return Math.max(this.gearFx('magnet') || 1.2, held.magnet || 0);
  }
  dmgMult() {
    let m = (this.gearFx('dmgMult') || 1) * (game.buffActive() ? game.buff.dmg : 1) * (game.skillMult ? game.skillMult('power') : 1);
    const berserk = this.gearFx('berserk');
    if (berserk && this.hp < this.maxHp * 0.4) m *= berserk;
    return m;
  }
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
  hurt(dmg, game, kx, src) {
    if (this.iframes > 0 || this.hp <= 0) return;
    const thorns = this.gearFx('thorns');
    if (thorns && src && src.hurt && !src.dead) {
      src.hurt(Math.max(1, Math.round(dmg * thorns)), game);
      game.fx.spark(this.x, this.y, '#e07a5f', 4);
    }
    if (src && !src.dead) { // elemental shells retaliate on contact
      const ct = this.gearFx('chillTouch');
      if (ct && src.chillT !== undefined) src.chillT = ct;
      const bt = this.gearFx('burnTouch');
      if (bt && src.burnT !== undefined) { src.burn = bt.dps; src.burnT = bt.dur; }
    }
    const dodge = this.gearFx('dodge') || 0;
    if (dodge && Math.random() < dodge) {
      game.fx.hitNum(this.x, this.y - this.h, 'MISS');
      game.sfx.play('dash');
      this.iframes = 0.3;
      return;
    }
    const armor = this.gearFx('armor') || 0;
    const diff = game.diffMult ? game.diffMult() : 1; // difficulty scales incoming damage
    dmg = Math.max(1, Math.round(dmg * (1 - armor) * (1 - (this.shieldNear || 0)) * diff));
    this.hp -= dmg;
    this.iframes = 0.7;
    if (kx) { this.vx = kx; this.vy = -220; }
    game.fx.explode(this.x, this.y, '#ff4d6d', 8);
    game.sfx.play('hurt');
    game.shake = Math.max(game.shake, 0.25);
    game.hurtFlash = Math.min(1, (game.hurtFlash || 0) + Math.min(0.7, dmg / 40));
    ui.updateHUD();
    if (this.hp <= 0) game.onPlayerDeath();
  }

  /* ---------- update ---------- */
  update(dt, world, game, input) {
    const feet = this.equip.feet ? ITEMS[this.equip.feet].fx : null;
    let speedMult = ((feet && feet.speed) || 1) * ((this.equip.chip && ITEMS[this.equip.chip].fx.speed) || 1)
      * ((this.equip.back && ITEMS[this.equip.back].fx.speed) || 1) * (this.speedAuraM || 1) * (game.skillMult ? game.skillMult('agility') : 1);
    if (game.buffActive()) speedMult *= game.buff.speed;
    const baseSpeed = 250 * speedMult;
    // crystal heart, level, guild & vitality-skill scaling
    const wantMax = 100 + (game.level - 1) * 3 + (this.gearFx('maxHp') || 0) + (game.guildPerks ? game.guildPerks().hpBonus : 0) + (game.skillHp ? game.skillHp() : 0);
    if (this.maxHp !== wantMax) { this.maxHp = wantMax; this.hp = Math.min(this.hp, this.maxHp); ui.updateHUD(); }
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

    // ladder climbing (Rung Rails / Escalator Vines)
    const ladTile = (dy2) => { const t = world.item(Math.floor(this.x / TS), Math.floor((this.y + dy2) / TS)); return (t && t.fx && t.fx.ladder) ? t.fx : null; };
    const ladFx = ladTile(0) || ladTile(this.h / 2 - 4);
    this.onLadder = !!ladFx;
    this.onEscalator = !!(ladFx && ladFx.escalator);

    // dash
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vy = 0;
    } else if (this.onLadder && !this.onGround) {
      // climb: SPACE up, S down, else cling
      let mx = 0;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (mx !== 0) this.facing = mx;
      this.vx += (mx * baseSpeed * 0.5 - this.vx) * Math.min(1, 10 * dt);
      this.vy = this.onEscalator && !input.down ? -175 : (input.jump ? -170 : (input.down ? 190 : this.vy * 0.5));
      this.jumpsUsed = 0;
      input.jumpPressed = false;
    } else {
      // walk
      let mx = 0;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      if (mx !== 0) this.facing = mx;
      const onIce = this.onGround && this.groundTile && ITEMS[this.groundTile] && ITEMS[this.groundTile].slippery;
      const skating = feet && feet.skate;
      const accel = this.onGround ? ((onIce || skating) ? 1.6 : 12) : 7;
      this.vx += (mx * baseSpeed - this.vx) * Math.min(1, accel * dt);

      // swimming in liquid data?
      const ctile = world.get(Math.floor(this.x / TS), Math.floor(this.y / TS));
      this.inWater = !!(ctile && ITEMS[ctile] && ITEMS[ctile].swim);
      if (this.inWater && !this._wasWater && this.vy > 200) { // entry splash
        for (let k = 0; k < 8; k++) game.fx.add(this.x + (Math.random() - 0.5) * this.w, this.y - this.h / 2, (Math.random() - 0.5) * 180, -120 - Math.random() * 120, 'rgba(160,216,240,0.9)', 0.5, 3, 500);
        game.sfx.play('bounce');
      }
      this._wasWater = this.inWater;

      // gecko chip: wall slide + wall jump
      this.wallSliding = false;
      if (this.gearFx('wallCling') && !this.onGround && !this.inWater && this.vy > 0) {
        const dirIn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (dirIn !== 0 && world.isSolid(Math.floor((this.x + dirIn * (this.w / 2 + 3)) / TS), Math.floor(this.y / TS))) {
          this.wallSliding = true;
          this.vy = Math.min(this.vy, 95);
          if (Math.random() < 0.2) game.fx.dust(this.x + dirIn * this.w / 2, this.y, -dirIn);
          if (input.jumpPressed) {
            this.vy = -610; this.vx = -dirIn * 360; this.facing = -dirIn;
            input.jumpPressed = false;
            game.fx.puff(this.x + dirIn * 10, this.y, '#2de2a3');
            game.sfx.play('bounce');
          }
        }
      }

      // coyote time (jump shortly after leaving a ledge) + jump buffering
      // (press slightly before landing and it still fires) — makes platforming forgiving
      this.coyoteT = this.onGround ? 0.09 : Math.max(0, this.coyoteT - dt);
      this.jumpBufT = input.jumpPressed ? 0.11 : Math.max(0, this.jumpBufT - dt);
      // jump / double jump / swim stroke
      if (this.jumpBufT > 0) {
        const extraJumps = ((feet && feet.doubleJump) || 0) + ((this.equip.chip && ITEMS[this.equip.chip].fx.doubleJump) || 0);
        const jumpV = (feet && feet.jump) || 640;
        if (this.inWater) { this.vy = -250; game.fx.puff(this.x, this.y - this.h / 2, '#9adcf0'); this.jumpBufT = 0; }
        else if (this.onGround || this.coyoteT > 0) { this.vy = -jumpV; this.jumpsUsed = 0; this.coyoteT = 0; this.jumpBufT = 0; game.fx.puff(this.x, this.y + this.h / 2, '#9fb4d0'); }
        else if (this.jumpsUsed < extraJumps) { this.jumpsUsed++; this.vy = -jumpV * 0.9; this.jumpBufT = 0; game.fx.puff(this.x, this.y + this.h / 2, '#2de2a3'); game.sfx.play('bounce'); }
        input.jumpPressed = false;
      }

      // jetpack / glider / hover pack
      const backFx = this.equip.back ? ITEMS[this.equip.back].fx : null;
      const jp = backFx && backFx.jetpack;
      const glide = backFx && backFx.glide;
      const hv = backFx && backFx.hover;
      this.jetting = false; this.gliding = false; this.hovering = false;
      if (hv && input.jump && !this.onGround && this.fuel > 0) {
        this.hovering = true;
        this.vy += (0 - this.vy) * Math.min(1, 12 * dt);
        this.fuel = Math.max(0, this.fuel - hv.drain * dt * (this.gearFx('energy') ? 0.6 : 1));
        this.jetting = true;
        if (Math.random() < 0.3) game.fx.add(this.x + (Math.random() - 0.5) * 16, this.y + this.h / 2, 0, 120, 'rgba(110,231,255,0.7)', 0.3, 3, 0);
      }
      if (hv && this.onGround) this.fuel = Math.min(1, this.fuel + dt / hv.regen);
      if (glide && input.jump && !this.onGround && this.vy > 0 && !this.inWater) {
        this.vy = Math.min(this.vy, glide.fall);
        this.vx += this.facing * 40 * dt;
        this.gliding = true;
      }
      const energy = this.gearFx('energy');
      if (jp && input.jump && !this.onGround && this.vy > -420 && this.fuel > 0) {
        this.vy -= jp.thrust * dt;
        this.fuel = Math.max(0, this.fuel - dt / jp.fuel * (energy ? 0.6 : 1));
        this.jetting = true;
        if (Math.random() < 0.5) game.fx.add(this.x - this.facing * 8, this.y + this.h / 2 - 6, (Math.random() - 0.5) * 60, 200 + Math.random() * 100, Math.random() < 0.5 ? '#ff9e6d' : '#ffd166', 0.35, 4, 0);
        if (Math.random() < 0.12) game.sfx.play('jet');
      }
      if (jp && this.onGround) this.fuel = Math.min(1, this.fuel + dt / jp.regen * (energy ? 1.5 : 1));

      // dash (storm boots / blink chip)
      const dash = (feet && feet.dash) || (this.equip.chip && ITEMS[this.equip.chip].fx.dash);
      if (dash && input.dashPressed && this.dashCd <= 0) {
        this.dashT = dash.dur; this.dashCd = dash.cd * (this.gearFx('energy') ? 0.6 : 1);
        this.vx = this.facing * dash.speed; this.vy = 0;
        this.iframes = Math.max(this.iframes, dash.dur + 0.1);
        game.fx.explode(this.x, this.y, '#6ee7ff', 8);
        game.sfx.play('dash');
      }
      input.dashPressed = false;

      // updraft turbines & sky geysers: ride the wind column
      const ptx2 = Math.floor(this.x / TS);
      for (let dy2 = 0; dy2 <= 16; dy2++) {
        const ty2 = Math.floor((this.y + this.h / 2) / TS) + dy2;
        const t2 = world.get(ptx2, ty2);
        if (!t2) continue;
        if (ITEMS[t2].fx && ITEMS[t2].fx.updraft && ITEMS[t2].fx.updraft >= dy2) {
          this.vy -= 3600 * dt; // beats gravity with lift to spare
          this.vy = Math.max(this.vy, -430);
          if (Math.random() < 0.25) game.fx.add(this.x + (Math.random() - 0.5) * 20, this.y + 20, 0, -180, 'rgba(200,235,255,0.5)', 0.4, 3, 0);
          break;
        }
        if (ITEMS[t2].solid) break;
      }

      const gm = ((feet && feet.gravMult) || 1) * (this.gravAuraM || 1);
      if (this.inWater) {
        if (this.gearFx('buoy')) {
          this.vy -= 900 * dt; // buoy chip: float hard to the surface
          this.vy = Math.max(-190, Math.min(this.vy, 120));
        } else {
          this.vy += this.gravity * 0.25 * dt;
          this.vy = Math.max(-260, Math.min(this.vy, 150));
        }
        this.jumpsUsed = 0;
      } else if (!this.hovering) {
        this.vy += this.gravity * gm * dt;
        this.vy = Math.min(this.vy, 1100);
      }
    }
    if (this.onGround) this.jumpsUsed = 0;

    const prevVy = this.vy;
    this.moveAndCollide(dt, world);

    /* ---- animation bookkeeping & motion particles ---- */
    this.squash = Math.max(0, this.squash - dt * 3);
    if (!this._wasGround && this.onGround && prevVy > 450) {
      this.squash = Math.min(0.3, prevVy / 3200);
      for (let k = 0; k < 5; k++) game.fx.dust(this.x + (Math.random() - 0.5) * this.w, this.y + this.h / 2, Math.random() < 0.5 ? -1 : 1);
    }
    this._wasGround = this.onGround;
    if (this.onGround && Math.abs(this.vx) > 40) this.runPhase += dt * Math.abs(this.vx) * 0.055;
    // footstep dust
    this._dustT -= dt;
    if (this.onGround && Math.abs(this.vx) > 150 && this._dustT <= 0) {
      this._dustT = 0.14;
      game.fx.dust(this.x - this.facing * 8, this.y + this.h / 2 - 2, this.facing);
    }
    // swim bubbles
    this._bubT -= dt;
    if (this.inWater && this._bubT <= 0 && (Math.abs(this.vx) > 40 || Math.abs(this.vy) > 40)) {
      this._bubT = 0.22;
      game.fx.bubble(this.x + this.facing * 8, this.y - 10);
    }
    // dash afterimages
    if (this.dashT > 0) {
      this.ghosts.push({ x: this.x, y: this.y, facing: this.facing, life: 0.25 });
    }
    for (const g of this.ghosts) g.life -= dt;
    this.ghosts = this.ghosts.filter(g => g.life > 0);
    // chip aura particles
    this._auraT -= dt;
    if (this._auraT <= 0) {
      this._auraT = 0.28;
      const chip = this.equip.chip;
      if (chip === 'wraith_chip' && Math.abs(this.vx) > 60) game.fx.add(this.x - this.facing * 10, this.y + (Math.random() - 0.5) * 30, -this.facing * 30, -10, 'rgba(141,128,201,0.8)', 0.5, 4, 0);
      else if (chip === 'overclock_chip') game.fx.add(this.x + (Math.random() - 0.5) * 20, this.y + 16, 0, -60, '#ff9e6d', 0.4, 3, 0);
      else if (chip === 'buoy_chip' && this.inWater) game.fx.bubble(this.x, this.y);
      else if (chip === 'admin_crown') game.fx.add(this.x + (Math.random() - 0.5) * 16, this.y - 34, 0, -30, '#ffd166', 0.6, 2.5, 0);
    }
    if (this.gliding && Math.random() < 0.25) game.fx.add(this.x - this.facing * 16, this.y - 8, -this.facing * 60, 10, 'rgba(255,255,255,0.5)', 0.3, 2.5, 0);
    // blaze runners: sprinting ignites enemies you brush past
    const trail = feet && feet.fireTrail;
    if (trail && Math.abs(this.vx) > 220) {
      this._trailT = (this._trailT || 0) - dt;
      if (this._trailT <= 0) {
        this._trailT = 0.15;
        game.fx.add(this.x - this.facing * 12, this.y + this.h / 2 - 4, -this.facing * 40, -30, Math.random() < 0.5 ? '#ff5714' : '#ffd166', 0.4, 4, 0);
        for (const e of game.enemies) {
          if (!e.dead && Math.abs(e.x - this.x) < 44 && Math.abs(e.y - this.y) < 44) { e.burn = trail.dps; e.burnT = trail.dur; }
        }
      }
    }
    // aqua striders: liquid data becomes a road
    if (feet && feet.waterWalk && !this.inWater && this.vy >= 0) {
      const wtx = Math.floor(this.x / TS), wty = Math.floor((this.y + this.h / 2 + 3) / TS);
      const below = world.item(wtx, wty);
      if (below && below.swim) {
        this.y = wty * TS - this.h / 2 - 0.01;
        this.vy = 0;
        this.onGround = true;
        this.groundTile = 'water';
        if (Math.abs(this.vx) > 60 && Math.random() < 0.3) game.fx.bubble(this.x, this.y + this.h / 2);
      }
    }

    // note blocks chime underfoot
    if (this.onGround && this.groundTile && ITEMS[this.groundTile] && ITEMS[this.groundTile].fx && ITEMS[this.groundTile].fx.note) {
      const ntx = Math.floor(this.x / TS), nty = Math.floor((this.y + this.h / 2 + 2) / TS);
      const ni = world.idx(ntx, nty);
      if (ni !== this._noteIdx) {
        this._noteIdx = ni;
        const nfx = ITEMS[this.groundTile].fx;
        const pitch = (world.meta[ni] || {}).pitch || 0;
        if (nfx.drum) game.sfx.play('punch');
        else game.sfx.note(pitch - (nfx.noteLow ? 12 : 0));
        game.fx.add(this.x, this.y - this.h / 2 - 8, (Math.random() - 0.5) * 40, -70, '#f7a8d8', 0.8, 5, 0);
      }
    } else if (this.groundTile !== 'note_block') this._noteIdx = -1;

    // tile effects on touch
    let onConveyor = 0, healNear = 0;
    this.tilesTouching(world, (it, tx, ty) => {
      if (it.fx) {
        if (it.fx.damage) this.hurt(it.fx.damage, game, 0);
        if (it.fx.conveyor && this.onGround && Math.floor((this.y + this.h / 2 + 2) / TS) === ty) {
          onConveyor = ((world.meta[world.idx(tx, ty)] || {}).dir || 1) * it.fx.conveyor;
        }
        if (it.fx.speedPad && this.onGround && Math.floor((this.y + this.h / 2 + 2) / TS) === ty) {
          const dir = (world.meta[world.idx(tx, ty)] || {}).dir || 1;
          if (Math.abs(this.vx) < it.fx.speedPad * 0.95) {
            this.vx = dir * it.fx.speedPad;
            game.fx.dust(this.x, this.y + this.h / 2, -dir);
            game.sfx.play('dash');
          }
        }
        if (it.fx.sticky && this.onGround) this.vx *= Math.max(0, 1 - 7 * dt);
        if (it.fx.ring && !this.onGround) {
          const i = world.idx(tx, ty);
          const m = world.meta[i] = world.meta[i] || {};
          if (!m.ringCd || performance.now() - m.ringCd > 600) {
            m.ringCd = performance.now();
            this.vy = -it.fx.ring;
            this.jumpsUsed = 0;
            game.fx.spark(tx * TS + TS / 2, ty * TS + TS / 2, '#6ee7ff', 8);
            game.sfx.play('bounce');
          }
        }
      }
    });
    if (onConveyor) this.x += onConveyor * dt;

    // heal / shield / grav / fuel / speed auras — scan nearby tiles
    const ptx = Math.floor(this.x / TS), pty = Math.floor(this.y / TS);
    this.shieldNear = 0; this.gravAuraM = 1; this.speedAuraM = 1;
    this.gemAuraOn = false; this.xpAuraM = 1;
    let fuelAura = false;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      const it = world.item(ptx + dx, pty + dy);
      if (!it || !it.fx) continue;
      const d = Math.hypot(dx, dy);
      if (it.fx.heal && d <= it.fx.healRange) healNear = Math.max(healNear, it.fx.heal);
      if (it.fx.shield && d <= it.fx.shieldRange) this.shieldNear = Math.max(this.shieldNear, it.fx.shield);
      if (it.fx.gravAura && d <= it.fx.auraRange) this.gravAuraM = Math.min(this.gravAuraM, it.fx.gravAura);
      if (it.fx.fuelAura && d <= it.fx.auraRange) fuelAura = true;
      if (it.fx.speedAura && d <= it.fx.auraRange) this.speedAuraM = Math.max(this.speedAuraM, it.fx.speedAura);
      if (it.fx.gemAura && d <= it.fx.gemAura) this.gemAuraOn = true;
      if (it.fx.xpAura && d <= it.fx.auraRange) this.xpAuraM = Math.max(this.xpAuraM, it.fx.xpAura);
    }
    if (fuelAura) { this.fuel = Math.min(1, this.fuel + dt * 0.8); this.dashCd = Math.max(0, this.dashCd - dt); }
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

    // fishing rod: cast into water / reel in
    if (held.rod) {
      if (game.fishing) { game.reelRod(); this.actionCd = 0.35; return; }
      const it = world.item(tx, ty);
      if (it && it.swim && inReach) { game.castRod(tx, ty); this.actionCd = 0.45; return; }
      // otherwise falls through: the rod is a (bad) tool
    }

    // consumables
    if (held.kind === 'consumable') {
      this.actionCd = 0.35;
      if (held.paint) {
        if (!inReach) { game.toast('Too far to paint.', 'warn'); return; }
        const i = world.idx(tx, ty);
        const t = world.tiles[i];
        if (!t || ITEMS[t].unbreakable) { game.toast('Nothing paintable there.', 'warn'); return; }
        const m = world.meta[i] = world.meta[i] || {};
        if (held.paint === 'clear') {
          if (!m.tint) { game.toast('No paint on that block.', 'warn'); return; }
          delete m.tint;
        } else {
          if (m.tint === held.paint) return;
          m.tint = held.paint;
        }
        this.take(held.id, 1);
        game.progress.stats.painted = (game.progress.stats.painted || 0) + 1;
        game.fx.spark(tx * TS + TS / 2, ty * TS + TS / 2, held.paint === 'clear' ? '#fff' : held.paint, 7);
        game.sfx.play('plant');
        if (world.isHome) game.saveSoon();
        return;
      }
      if (held.firework) {
        this.take(held.id, 1);
        game.launchFirework(this.x, this.y - 20);
        return;
      }
      if (held.defrag) {
        if (game.defrag) return;
        this.take(held.id, 1);
        ui.startDefrag();
        return;
      }
      if (held.warp) {
        if (game.world.isHome && game.world.id === 'home') { game.toast('You are already home.', 'warn'); return; }
        this.take(held.id, 1);
        game.fx.explode(this.x, this.y, '#2de2a3', 20);
        game.toast('⌂ Warped home!', 'gold');
        game.enterWorld('home');
        return;
      }
      if (held.invuln) {
        this.take(held.id, 1);
        this.iframes = held.invuln;
        game.fx.explode(this.x, this.y, '#6ee7ff', 16);
        game.toast('NANO SHIELD: invulnerable for ' + held.invuln + 's!', 'gold');
        game.sfx.play('splice');
        return;
      }
      if (held.xpGain) {
        this.take(held.id, 1);
        game.addXp(held.xpGain);
        game.fx.harvest(this.x, this.y - 20, '#b298dc');
        game.toast('+' + held.xpGain + ' XP. Delicious knowledge.', 'gold');
        game.sfx.play('victory');
        return;
      }
      if (held.heal) {
        if (this.hp >= this.maxHp && !held.buff) { game.toast('HP already full.', 'warn'); return; }
        this.take(held.id, 1);
        this.hp = Math.min(this.maxHp, this.hp + held.heal);
        if (held.buff) { // royal jelly & friends: heal + buff
          game.buff = { until: game.time + held.buff.dur, speed: held.buff.speed, dmg: held.buff.dmg, gem: held.buff.gem };
          game.toast('Restored & empowered!', 'gold');
        }
        game.fx.harvest(this.x, this.y, '#ff4d6d'); game.sfx.play('harvest'); ui.updateHUD();
      } else if (held.bomb) {
        if (!inReach) { game.toast('Too far to throw.', 'warn'); return; }
        this.take(held.id, 1);
        game.detonate(wx, wy, held.bomb.radius, held.bomb.dmg);
      } else if (held.buff) {
        this.take(held.id, 1);
        game.buff = { until: game.time + held.buff.dur, speed: held.buff.speed, dmg: held.buff.dmg, gem: held.buff.gem };
        game.toast(held.buff.gem ? '☘ LUCKY! +50% gem drops for ' + held.buff.dur + 's' : 'OVERCLOCKED! +40% speed & damage for ' + held.buff.dur + 's', 'gold');
        game.fx.explode(this.x, this.y, '#ffd166', 16);
        game.sfx.play('victory');
      } else if (held.cluster) {
        if (!inReach) { game.toast('Too far to throw.', 'warn'); return; }
        this.take(held.id, 1);
        for (let k = 0; k < held.cluster.count; k++) {
          setTimeout(() => game.detonate(wx + (k - 1) * TS * 1.5, wy + (Math.random() - 0.5) * TS, held.cluster.radius, held.cluster.dmg), k * 220);
        }
      } else if (held.stasis) {
        this.take(held.id, 1);
        let n = 0;
        for (const e of game.enemies) if (!e.dead) { e.chillT = held.stasis; n++; }
        game.fx.explode(this.x, this.y, '#a8d8f0', 24);
        game.toast('⏸ STASIS — ' + n + ' enemies slowed for ' + held.stasis + 's!', 'gold');
        game.sfx.play('tp');
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
          game.progress.stats.splices++;
          game.toast('SPLICE SUCCESS → ' + ITEMS[res].name + ' tree!', 'gold');
          game.fx.harvest(tx * TS + TS / 2, ty * TS + TS / 2, '#2de2a3');
          game.sfx.play('splice');
          game.save();
        }
      } else if (world.plantSeed(tx, ty, held.id)) {
        this.take(held.id, 1);
        game.progress.stats.planted++;
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
      // don't place solid blocks inside yourself
      const px = tx * TS + TS / 2, py = ty * TS + TS / 2;
      if (held.solid && Math.abs(px - this.x) < (TS + this.w) / 2 && Math.abs(py - this.y) < (TS + this.h) / 2) return;
      if (!this.take(held.id, 1)) return;
      world.set(tx, ty, held.id);
      game.progress.stats.placed++;
      if (held.fx && (held.fx.conveyor || held.fx.speedPad)) world.meta[i] = { dir: this.facing };
      if (held.fx && held.fx.door && world.isHome) { world.doorIdx = i; game.toast('Respawn point set — you\'ll arrive at this door.', 'gold'); }
      if (held.fx && held.fx.sign) {
        const txt = (window.prompt('Sign text:', '') || '').slice(0, 40);
        if (txt) world.meta[i] = { text: txt };
      }
      game.sfx.play('place');
      if (!world.isHome) game.toast('Note: sector worlds reset when you leave.', '');
      return;
    }

    // tools & weapons: mine blocks / harvest trees / attack
    this.tryHarvestOrMine(game, tx, ty, wx, wy);
  }

  /* ---------- secondary action: background wall place / break ---------- */
  actBg(game, wx, wy) {
    if (this.actionCd > 0) return;
    const world = game.world;
    const held = this.heldItem();
    const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    if (Math.hypot(wx - this.x, wy - this.y) / TS > 4.2 || !world.inB(tx, ty)) return;
    this.facing = wx >= this.x ? 1 : -1;
    const i = world.idx(tx, ty);
    if (held.kind === 'block' && !world.tiles[i] && !world.bgT[i] && !world.trees.has(i)) {
      if (!this.take(held.id, 1)) return;
      world.placeBg(tx, ty, held.id);
      this.actionCd = 0.18;
      this.swingT = 0.15;
      game.progress.stats.placed++;
      game.fx.spark(tx * TS + TS / 2, ty * TS + TS / 2, ITEMS[held.id].color, 4);
      game.sfx.play('place');
      if (world.isHome) game.saveSoon();
    } else if (world.bgT[i] && !world.tiles[i]) {
      const tool = (held.kind === 'tool' || held.kind === 'weapon') ? held : ITEMS.fist;
      this.actionCd = 1 / ((tool.mineRate || 4) * (game.skillMult ? game.skillMult('mining') : 1));
      this.swingT = 0.15;
      game.sfx.play('punch');
      if (world.hitBg(tx, ty, tool.minePower || 1, game)) game.sfx.play('break');
      if (world.isHome) game.saveSoon();
    }
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
        const baseA = Math.atan2(wy - this.y, wx - this.x);
        const n = tool.pellets || 1;
        const gp = this.gearFx('gunPower') || 1;
        for (let pi2 = 0; pi2 < n; pi2++) {
          const a = baseA + (n > 1 ? (pi2 - (n - 1) / 2) * (tool.spread / (n - 1)) * 2 : 0);
          game.projectiles.push(new Projectile(this.x + Math.cos(a) * 20, this.y - 6 + Math.sin(a) * 20,
            Math.cos(a) * tool.projectile.speed * gp, Math.sin(a) * tool.projectile.speed * gp,
            Math.round(tool.dmg * this.dmgMult() * gp), true, tool.projectile.color,
            { pierce: tool.projectile.pierce, boomerang: tool.projectile.boomerang, knock: tool.knock, burn: tool.burn, chill: tool.chill, homing: tool.projectile.homing, life: tool.projectile.life }));
        }
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
            e.hurt(dmg, game, this.facing * (tool.knock || 200));
            if (tool.burn) { e.burn = tool.burn.dps; e.burnT = tool.burn.dur; }
            if (tool.chill && e.chillT !== undefined) e.chillT = tool.chill;
            game.onPlayerDealt(dmg);
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
    // dash afterimages
    for (const g of this.ghosts) {
      ctx.save();
      ctx.translate(g.x - cam.x, g.y - cam.y);
      ctx.globalAlpha = g.life * 2.2;
      ctx.fillStyle = '#6ee7ff';
      ctx.fillRect(-10, -30, 20, 52);
      ctx.restore();
    }
    const sx = this.x - cam.x, sy = this.y - cam.y;
    // cosmetic skin from the shard store (purely visual)
    const cos = (typeof game !== 'undefined' && game.progress && game.progress.cosmetic) || null;
    // base body colour comes from the chosen avatar colour at character creation
    const baseCol = (typeof game !== 'undefined' && game.progress && game.progress.avatarColor) || '#4361ee';
    const darken = (hex, f) => { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')'; };
    let bodyCol = baseCol, bodyTrim = darken(baseCol, 0.55);
    const COSMETICS = {
      gold:    { body: '#ffcf3f', trim: '#b8860b', glow: '255,207,63' },
      shadow:  { body: '#2a2140', trim: '#120a24', glow: '120,90,200' },
      crimson: { body: '#e63946', trim: '#7a1520', glow: '255,80,60' },
      ocean:   { body: '#118ab2', trim: '#073b4c', glow: '80,200,255' },
      toxic:   { body: '#70e000', trim: '#38610a', glow: '140,255,60' },
      void:    { body: '#1a1030', trim: '#0a0518', glow: '150,110,255' },
    };
    const cm = COSMETICS[cos];
    if (cm) { bodyCol = cm.body; bodyTrim = cm.trim; }
    else if (cos === 'rainbow') {
      const hue = (time * 90) % 360;
      bodyCol = 'hsl(' + hue + ',85%,60%)';
      bodyTrim = 'hsl(' + ((hue + 40) % 360) + ',85%,42%)';
    }
    // cosmetic aura glow behind the avatar
    if (cos) {
      ctx.save();
      ctx.translate(sx, sy - 4);
      const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
      if (cos === 'rainbow') {
        g.addColorStop(0, 'hsla(' + ((time * 90) % 360) + ',90%,60%,0.5)');
        g.addColorStop(1, 'hsla(' + ((time * 90) % 360) + ',90%,60%,0)');
      } else if (cm) {
        g.addColorStop(0, 'rgba(' + cm.glow + ',0.45)');
        g.addColorStop(1, 'rgba(' + cm.glow + ',0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      // void skin: orbiting starfield
      if (cos === 'void') {
        for (let i = 0; i < 7; i++) {
          const a = time * 1.5 + i * 0.9, r = 18 + (i % 3) * 6;
          ctx.fillStyle = 'rgba(220,210,255,' + (0.4 + 0.4 * Math.sin(time * 4 + i)) + ')';
          ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r * 0.8 - 4, 2, 2);
        }
      }
      ctx.restore();
    }
    ctx.save(); ctx.translate(sx, sy);
    // squash & stretch anchored at the feet
    if (this.squash > 0) {
      ctx.translate(0, this.h / 2);
      ctx.scale(1 + this.squash * 0.9, 1 - this.squash);
      ctx.translate(0, -this.h / 2);
    }
    if (this.iframes > 0 && Math.floor(time * 14) % 2 === 0) ctx.globalAlpha = 0.4;
    // pose
    const running = Math.abs(this.vx) > 40 && this.onGround;
    let walk = 0, legSpread = 0, bob = 0;
    if (running) { walk = Math.sin(this.runPhase); bob = Math.abs(Math.cos(this.runPhase)) * -1.6; }
    else if (this.inWater) { walk = Math.sin(time * 9) * 0.8; }
    else if (!this.onGround) { legSpread = Math.max(-1, Math.min(1, this.vy / 500)); }
    else { bob = Math.sin(time * 2.2) * 1.1; } // idle breathing
    ctx.translate(0, bob);
    const _cw = (typeof game !== 'undefined' && game.progress && game.progress.wardrobe) || null;
    const _cd = (slot) => { if (_cw && _cw[slot] && typeof COSMO !== 'undefined' && COSMO[_cw[slot]]) { try { COSMO[_cw[slot]].draw(ctx, this.facing, time, this); } catch (e) {} } };
    // aura cosmetic — radiates behind everything
    _cd('aura');

    // back gear: jetpack or glider wings
    if (this.equip.back === 'glider_wings') {
      const spread = this.gliding ? 1 : 0.35;
      ctx.fillStyle = '#3ddc84';
      ctx.beginPath(); ctx.moveTo(-this.facing * 8, -14);
      ctx.lineTo(-this.facing * (10 + 22 * spread), -14 - 14 * spread);
      ctx.lineTo(-this.facing * (10 + 16 * spread), -2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2aa864';
      ctx.beginPath(); ctx.moveTo(-this.facing * 8, -10);
      ctx.lineTo(-this.facing * (8 + 17 * spread), -10 - 8 * spread);
      ctx.lineTo(-this.facing * (8 + 13 * spread), 2);
      ctx.closePath(); ctx.fill();
    } else if (this.equip.back) {
      ctx.fillStyle = '#8899aa';
      ctx.fillRect(-this.facing * 16 - 4, -14, 8, 20);
      if (this.jetting) { ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.moveTo(-this.facing * 16 - 4, 6); ctx.lineTo(-this.facing * 16, 16 + Math.random() * 8); ctx.lineTo(-this.facing * 16 + 4, 6); ctx.fill(); }
    }
    // back cosmetic (wings / cape) — behind the body
    _cd('back');
    // legs: walk cycle swing / air split / swim kick
    ctx.fillStyle = this.equip.feet ? (this.equip.feet === 'storm_boots' ? '#ffd166' : '#2de2a3') : '#33415e';
    if (!this.onGround && !this.inWater) {
      ctx.save(); ctx.translate(-5, 10); ctx.rotate(-0.35 - legSpread * 0.3); ctx.fillRect(-3, 0, 7, 14); ctx.restore();
      ctx.save(); ctx.translate(6, 10); ctx.rotate(0.35 + legSpread * 0.2); ctx.fillRect(-3, 0, 7, 14); ctx.restore();
    } else {
      ctx.save(); ctx.translate(-5, 9); ctx.rotate(walk * 0.55 * this.facing); ctx.fillRect(-3.5, 0, 7, 14); ctx.restore();
      ctx.save(); ctx.translate(6, 9); ctx.rotate(-walk * 0.55 * this.facing); ctx.fillRect(-3.5, 0, 7, 14); ctx.restore();
    }
    // body
    ctx.fillStyle = bodyCol;
    ctx.fillRect(-10, -12, 20, 22);
    ctx.fillStyle = bodyTrim; ctx.fillRect(-10, 4, 20, 6);
    // shirt cosmetic — over the torso
    _cd('shirt');
    // head
    ctx.fillStyle = '#ffd8b1';
    ctx.fillRect(-8, -30, 16, 17);
    // hair cosmetic — frames the head (under the hat)
    _cd('hair');
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
    // face + hat cosmetics — layered over the head
    _cd('face');
    _cd('hat');
    // back arm (behind body counter-swing)
    ctx.fillStyle = '#e8c49e';
    ctx.save();
    ctx.translate(-this.facing * 8, -8);
    ctx.rotate(-walk * 0.5 * this.facing + (this.gliding ? -1.9 * this.facing : 0));
    ctx.fillRect(0, -3, -this.facing * 10, 6);
    ctx.restore();
    // held item / front arm
    const held = this.heldItem();
    const swingP = this.swingT > 0 ? (this.swingT / 0.18) : 0; // 1 → 0
    const swing = swingP > 0 ? (-1.4 + (1 - swingP) * 1.8) : walk * 0.4;
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
    // hand cosmetic — held in the front hand (front-most layer)
    _cd('hand');
    // melee slash arc
    if (swingP > 0 && !held.projectile && (held.kind === 'weapon' || held.kind === 'tool')) {
      const range = ((held.range || 1.4) * TS) * 0.9;
      ctx.save();
      ctx.globalAlpha = swingP * 0.65;
      ctx.strokeStyle = held.id === 'flame_blade' ? '#ff5714' : '#e8f6ff';
      ctx.lineWidth = 5 * swingP + 1;
      ctx.lineCap = 'round';
      const a0 = this.facing > 0 ? -1.5 + (1 - swingP) * 1.6 : 4.6 - (1 - swingP) * 1.6;
      ctx.beginPath(); ctx.arc(0, -6, range, a0, a0 + 1.1 * this.facing, this.facing < 0); ctx.stroke();
      ctx.globalAlpha = swingP * 0.25;
      ctx.lineWidth = 12 * swingP;
      ctx.beginPath(); ctx.arc(0, -6, range * 0.85, a0, a0 + 1.0 * this.facing, this.facing < 0); ctx.stroke();
      ctx.restore();
    }
    // aegis shield shimmer
    if (this.equip.chip === 'aegis_chip' || this.equip.chip === 'admin_crown') {
      ctx.strokeStyle = 'rgba(45,226,163,' + (0.2 + 0.15 * Math.sin(time * 3)) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, -6, 34, 0, 7); ctx.stroke();
    }
    ctx.restore();
    // floating nameplate (Growtopia-style) — drawn in screen space above the head
    if (typeof game !== 'undefined' && game.progress && game.progress.playerName) {
      const nm = game.progress.playerName;
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
      const tw = ctx.measureText(nm).width + 12;
      const ny = sy - 48;
      ctx.fillStyle = 'rgba(8,12,24,0.7)';
      ctx.fillRect(sx - tw / 2, ny - 10, tw, 15);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(nm, sx, ny + 1);
    }
  }
}
