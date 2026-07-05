'use strict';
/* ============================================================
   GLITCHTOPIA — game orchestration: loop, input, camera,
   world switching, bosses, economy, saving
   ============================================================ */

let game = null;
const SAVE_KEY = 'glitchtopia_save_v1';

class Game {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.cam = { x: 0, y: 0, view: { w: 0, h: 0 } };
    this.player = new Player();
    this.gems = 0;
    this.world = null;
    this.homeWorld = null;
    this.enemies = []; this.projectiles = []; this.drops = []; this.hazards = [];
    this.boss = null; this.bossDefeatedThisVisit = false;
    this.fx = new FXSystem();
    this.sfx = new SFX();
    this.progress = { beaten: {}, discovered: {}, tutorial: 0 };
    this.time = 0; this.shake = 0;
    this.spawnT = 0;
    this._saveT = 0; this._savePending = false;
    this.running = false;
    this.input = { left: false, right: false, jump: false, jumpPressed: false, dashPressed: false, mouse: { x: 0, y: 0, held: false } };
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
  }
  get bossKillCount() { return Object.keys(this.progress.beaten).length; }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.cam.view.w = this.canvas.width;
    this.cam.view.h = this.canvas.height;
    this.ctx.imageSmoothingEnabled = false;
  }

  /* ---------------- input ---------------- */
  bindInput() {
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') this.input.left = true;
      if (k === 'd' || k === 'arrowright') this.input.right = true;
      if (k === ' ' || k === 'arrowup') { this.input.jump = true; this.input.jumpPressed = true; e.preventDefault(); }
      if (k === 'w') { if (!this.tryPortal()) { this.input.jump = true; this.input.jumpPressed = true; } }
      if (k === 'shift') this.input.dashPressed = true;
      if (k === 's' || k === 'arrowdown') this.tryTeleport();
      if (k >= '1' && k <= '9') { this.player.sel = +k - 1; ui.dirty = true; }
      if (k === 'e') ui.togglePanel('inv');
      if (k === 'b') ui.togglePanel('shop');
      if (k === 'c') ui.togglePanel('codex');
      if (k === 'escape') ui.closeAll();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') this.input.left = false;
      if (k === 'd' || k === 'arrowright') this.input.right = false;
      if (k === ' ' || k === 'w' || k === 'arrowup') this.input.jump = false;
    });
    this.canvas.addEventListener('mousemove', (e) => { this.input.mouse.x = e.clientX; this.input.mouse.y = e.clientY; });
    document.addEventListener('mousedown', (e) => {
      if (!this.running || ui.anyPanelOpen()) return;
      if (e.target !== this.canvas) return;
      if (e.button === 0) this.input.mouse.held = true;
      this.input.mouse.x = e.clientX; this.input.mouse.y = e.clientY;
    });
    document.addEventListener('mouseup', () => { this.input.mouse.held = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('beforeunload', () => this.save());
  }

  tryPortal() {
    for (const p of this.world.portals) {
      if (p.locked && p.locked()) continue;
      if (Math.abs(this.player.x - p.x) < TS * 1.6 && Math.abs(this.player.y - (p.y - TS)) < TS * 2.2) {
        this.enterWorld(p.target);
        return true;
      }
    }
    return false;
  }

  tryTeleport() {
    const w = this.world;
    const p = this.player;
    const tx = Math.floor(p.x / TS), ty = Math.floor((p.y + p.h / 2 + 4) / TS);
    if (w.get(tx, ty) !== 'teleporter') return;
    const tps = w.teleportTargets();
    if (tps.length < 2) { this.toast('You need at least two teleporters.', 'warn'); return; }
    const cur = w.idx(tx, ty);
    const at = tps.indexOf(cur);
    const next = tps[(at + 1) % tps.length];
    const ntx = next % w.w, nty = Math.floor(next / w.w);
    this.fx.explode(p.x, p.y, '#b388ff', 12);
    p.x = ntx * TS + TS / 2; p.y = nty * TS - p.h / 2 - 2;
    p.vx = 0; p.vy = 0;
    this.fx.explode(p.x, p.y, '#b388ff', 12);
    this.sfx.play('tp');
  }

  /* ---------------- economy / spawning ---------------- */
  addGems(n) { this.gems = Math.max(0, this.gems + n); ui.updateHUD(); }
  spawnDrop(x, y, id, count) { this.drops.push(new Drop(x, y, id, count)); }
  spawnGems(x, y, total) {
    while (total > 0) { const v = Math.min(total, 1 + Math.floor(Math.random() * 3)); total -= v; this.drops.push(new Drop(x, y, '__gem', v)); }
  }
  detonate(wx, wy, radius, dmg) {
    this.sfx.play('boom');
    this.shake = 0.5;
    this.fx.explode(wx, wy, '#ffd166', 30);
    const tr = Math.ceil(radius);
    const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    for (let dy = -tr; dy <= tr; dy++) for (let dx = -tr; dx <= tr; dx++) {
      if (dx * dx + dy * dy <= radius * radius && this.world.get(tx + dx, ty + dy)) this.world.breakTile(tx + dx, ty + dy, this);
    }
    const targets = this.boss && !this.boss.dead ? [...this.enemies, this.boss] : this.enemies;
    for (const e of targets) {
      if (!e.dead && Math.hypot(e.x - wx, e.y - wy) < (radius + 1.5) * TS) e.hurt(dmg, this);
    }
    if (Math.hypot(this.player.x - wx, this.player.y - wy) < radius * TS) this.player.hurt(25, this, Math.sign(this.player.x - wx) * 300);
    if (this.world.isHome) this.saveSoon();
  }

  /* ---------------- worlds ---------------- */
  enterWorld(id) {
    if (this.world && this.world.isHome) this.save();
    this.enemies = []; this.projectiles = []; this.drops = []; this.hazards = [];
    this.boss = null; this.bossDefeatedThisVisit = false;
    if (id === 'home') {
      this.world = this.homeWorld;
    } else {
      const n = +id.replace('sector', '');
      this.world = World.genSector(n);
      this.toast('Entering ' + this.world.name + ' — reach the far side to face the corrupted process.', 'warn');
      this.toast('Careful: dying in a sector costs 20% of your gems.', 'warn');
    }
    const p = this.player;
    p.x = this.world.spawn.x; p.y = this.world.spawn.y;
    p.vx = 0; p.vy = 0;
    this.cam.x = p.x - this.cam.view.w / 2; this.cam.y = p.y - this.cam.view.h / 2;
    ui.updateHUD();
    this.sfx.play('tp');
  }

  /* ---------------- boss flow ---------------- */
  maybeTriggerBoss() {
    const w = this.world;
    if (!w.bossZone || this.boss || this.bossDefeatedThisVisit) return;
    if (this.player.x > w.bossZone.x1) {
      this.boss = spawnBoss(w.bossId, w.bossZone.spawnX, w.bossZone.spawnY);
      this.sfx.play('bossroar');
      this.shake = 0.6;
      this.toast('⚠ ' + this.boss.meta.name + ' has awakened!', 'warn');
    }
  }
  onBossDefeated(boss) {
    this.bossDefeatedThisVisit = true;
    this.shake = 0.8;
    this.sfx.play('victory');
    this.fx.explode(boss.x, boss.y, '#ffd166', 50);
    const [g0, g1] = boss.meta.gems;
    this.spawnGems(boss.x, boss.y, g0 + Math.floor(Math.random() * (g1 - g0)));
    const first = !this.progress.beaten[boss.id];
    if (first) {
      this.progress.beaten[boss.id] = true;
      for (const [id, n] of boss.meta.drops) this.spawnDrop(boss.x, boss.y, id, n);
      this.toast('★ ' + boss.meta.name + ' PURGED! Unique boss tech dropped!', 'gold');
      if (boss.id === 'admin') {
        this.toast('THE NETWORK IS LIBERATED. You have root now. Build freely.', 'gold');
      } else {
        this.toast('A new portal has unlocked on your HOME SERVER.', 'gold');
      }
    } else {
      this.toast(boss.meta.name + ' purged again. Gems acquired.', 'gold');
      if (Math.random() < 0.5) this.spawnDrop(boss.x, boss.y, 'medkit', 2);
      if (boss.id === 'firewall_daemon') this.spawnDrop(boss.x, boss.y, 'firewall_block', 3);
    }
    setTimeout(() => { this.boss = null; ui.bossBar(null); }, 100);
    this.save();
  }

  onPlayerDeath() {
    this.running = false;
    this.sfx.play('death');
    let msg = 'You were disconnected on your home server. No harm done.';
    if (!this.world.isHome) {
      const lost = Math.floor(this.gems * 0.2);
      this.addGems(-lost);
      msg = 'The sector purged ' + lost + ' ◆ gems from your account. Boss tech and items are safe.';
    }
    document.getElementById('deathText').textContent = msg;
    ui.el.deathOverlay.classList.remove('hidden');
    this.save();
  }
  respawn() {
    this.player.hp = this.player.maxHp;
    ui.el.deathOverlay.classList.add('hidden');
    this.running = true;
    this.enterWorld('home');
  }

  /* ---------------- save / load ---------------- */
  save() {
    try {
      const p = this.player;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1, gems: this.gems, inv: p.inv, hotbar: p.hotbar, equip: p.equip, sel: p.sel,
        hp: p.hp, progress: this.progress, home: this.homeWorld.serialize(),
      }));
    } catch (e) { console.warn('save failed', e); }
    this._savePending = false;
  }
  saveSoon() { this._savePending = true; }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s) return false;
      this.gems = s.gems || 0;
      this.player.inv = s.inv || {};
      this.player.hotbar = s.hotbar || this.player.hotbar;
      this.player.equip = s.equip || this.player.equip;
      this.player.sel = s.sel || 0;
      this.player.hp = s.hp > 0 ? s.hp : this.player.maxHp;
      this.progress = Object.assign({ beaten: {}, discovered: {}, tutorial: 99 }, s.progress);
      this.homeWorld = World.deserializeHome(s.home);
      return true;
    } catch (e) { console.warn('load failed', e); return false; }
  }

  /* ---------------- new game ---------------- */
  newGame() {
    this.homeWorld = World.genHome();
    this.gems = 30;
    const p = this.player;
    p.give('dirt', 8);
    p.give('dirt_seed', 2);
    p.give('wood_seed', 1);
    p.give('medkit', 1);
    this.progress.tutorial = 0;
  }

  start() {
    this.running = true;
    this.enterWorld('home');
    ui.dirty = true;
    ui.updateHUD();
    if (this.progress.tutorial === 0) {
      const tips = [
        ['Welcome to your HOME SERVER. Punch blocks (click) to harvest materials and find seeds.', 0],
        ['Plant seeds on solid ground. Trees grow in real time — even while you\'re away.', 6],
        ['SPLICE: plant a DIFFERENT seed onto a sapling. Try Dirt + Wood = Spring Pad. Codex: [C]', 12],
        ['Every item DOES something. Springs bounce, sentries shoot, teleporters warp.', 20],
        ['When ready, take the leftmost portal [W] and purge the FIREWALL DAEMON.', 28],
      ];
      for (const [msg, delay] of tips) setTimeout(() => this.toast(msg, 'gold'), delay * 1000 + 500);
      this.progress.tutorial = 1;
    }
  }

  toast(msg, cls) { ui.toast(msg, cls); }

  /* ---------------- main loop ---------------- */
  loop(dt) {
    if (!this.running) return;
    this.time += dt;
    const w = this.world, p = this.player;

    p.update(dt, w, this, this.input);
    w.update(dt, this);

    // held mouse = act toward cursor
    if (this.input.mouse.held && !ui.anyPanelOpen()) {
      const wx = this.input.mouse.x + this.cam.x;
      const wy = this.input.mouse.y + this.cam.y;
      p.act(this, wx, wy);
    }

    // ambient enemy spawns in sectors
    if (w.enemyCap && this.enemies.filter(e => !e.dead).length < w.enemyCap) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 2.2;
        const cands = w.spawnPoints.filter(s => {
          const d = Math.abs(s.x * TS - p.x);
          return d > 9 * TS && d < 34 * TS;
        });
        if (cands.length) {
          const s = cands[Math.floor(Math.random() * cands.length)];
          const type = w.enemyTypes[Math.floor(Math.random() * w.enemyTypes.length)];
          this.enemies.push(new Enemy(type, s.x * TS + TS / 2, s.y * TS + TS / 2 - 4, w.sectorN || 1));
        }
      }
    }

    this.maybeTriggerBoss();
    if (this.boss && !this.boss.dead) this.boss.update(dt, w, this);

    for (const e of this.enemies) if (!e.dead) e.update(dt, w, this);
    this.enemies = this.enemies.filter(e => !e.dead);
    for (const pr of this.projectiles) pr.update(dt, w, this);
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
    for (const d of this.drops) if (!d.dead) d.update(dt, w, this);
    this.drops = this.drops.filter(d => !d.dead);
    for (const h of this.hazards) h.update(dt, w, this);
    this.hazards = this.hazards.filter(h => !h.dead);
    this.fx.update(dt);

    // camera
    const cam = this.cam;
    const tx2 = p.x - cam.view.w / 2, ty2 = p.y - cam.view.h / 2 - 40;
    cam.x += (tx2 - cam.x) * Math.min(1, 8 * dt);
    cam.y += (ty2 - cam.y) * Math.min(1, 8 * dt);
    cam.x = Math.max(0, Math.min(w.w * TS - cam.view.w, cam.x));
    cam.y = Math.max(0, Math.min(w.h * TS - cam.view.h, cam.y));
    if (w.w * TS < cam.view.w) cam.x = (w.w * TS - cam.view.w) / 2;
    this.shake = Math.max(0, this.shake - dt);
    if (this.shake > 0) { cam.x += (Math.random() - 0.5) * this.shake * 22; cam.y += (Math.random() - 0.5) * this.shake * 22; }

    // periodic autosave
    this._saveT += dt;
    if (this._saveT > 12) { this._saveT = 0; if (this.world.isHome || this._savePending) this.save(); }

    ui.refresh();
    ui.bossBar(this.boss);
    this.render();
  }

  render() {
    const ctx = this.ctx, cam = this.cam, w = this.world;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    w.draw(ctx, cam, this.time, this);
    for (const d of this.drops) d.draw(ctx, cam, this.time);
    for (const e of this.enemies) e.draw(ctx, cam, this.time);
    if (this.boss && !this.boss.dead) this.boss.draw(ctx, cam, this.time);
    this.player.draw(ctx, cam, this.time);
    for (const pr of this.projectiles) pr.draw(ctx, cam);
    for (const h of this.hazards) h.draw(ctx, cam, this.time, cam.view.h);
    this.fx.draw(ctx, cam);
    this.drawCursor(ctx, cam);
  }

  drawCursor(ctx, cam) {
    if (ui.anyPanelOpen()) return;
    const wx = this.input.mouse.x + cam.x, wy = this.input.mouse.y + cam.y;
    const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    const dist = Math.hypot(wx - this.player.x, wy - this.player.y) / TS;
    const inReach = dist <= 4.2;
    ctx.strokeStyle = inReach ? 'rgba(45,226,163,0.8)' : 'rgba(255,77,109,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(tx * TS - cam.x + 1, ty * TS - cam.y + 1, TS - 2, TS - 2);
  }
}

/* ---------------- boot ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  ui.init();
  game = new Game();

  const hasSave = !!localStorage.getItem(SAVE_KEY);
  const playBtn = document.getElementById('playBtn');
  playBtn.textContent = hasSave ? '▶ RECONNECT' : '▶ BOOT UP';

  playBtn.addEventListener('click', () => {
    game.sfx.init();
    if (!game.load()) game.newGame();
    document.getElementById('menu').classList.add('hidden');
    game.start();
  });
  document.getElementById('wipeBtn').addEventListener('click', () => {
    if (confirm('Delete your save and home world forever?')) {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  });
  document.getElementById('respawnBtn').addEventListener('click', () => game.respawn());

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (game.running) game.loop(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
