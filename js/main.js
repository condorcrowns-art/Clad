'use strict';
/* ============================================================
   GLITCHTOPIA — game orchestration: loop, input, camera,
   world switching, bosses, economy, saving
   ============================================================ */

let game = null;
const SAVE_KEY = 'glitchtopia_save_v1';

const STATS_DEFAULT = { broken: 0, planted: 0, splices: 0, harvests: 0, placed: 0, kills: 0, keys: 0, fish: 0, gemsEarned: 0, maxDepth: 0, summits: 0, defrags: 0, spireBest: 0, painted: 0 };
const BIOMES = ['verdant', 'desert', 'tundra', 'volcanic'];
const RUSH_ORDER = ['firewall_daemon', 'null_wurm', 'kraken', 'storm_kernel', 'rootkit', 'admin'];

/* ---------------- quests ---------------- */
const QUESTS = [
  { id: 'break20', name: 'Demolition Novice', desc: 'Break 20 blocks', goal: 20, val: (s) => s.broken, reward: { gems: 25 } },
  { id: 'plant3', name: 'Green Thumb.exe', desc: 'Plant 3 seeds', goal: 3, val: (s) => s.planted, reward: { gems: 25 } },
  { id: 'splice1', name: 'Gene Hacker', desc: 'Splice your first item', goal: 1, val: (s) => s.splices, reward: { gems: 40 } },
  { id: 'harvest5', name: 'Tree Farmer', desc: 'Harvest 5 trees', goal: 5, val: (s) => s.harvests, reward: { gems: 50 } },
  { id: 'place25', name: 'Architect', desc: 'Place 25 blocks', goal: 25, val: (s) => s.placed, reward: { gems: 40 } },
  { id: 'kill10', name: 'Debugger', desc: 'Destroy 10 enemies', goal: 10, val: (s) => s.kills, reward: { items: [['medkit', 2]] } },
  { id: 'keys3', name: 'Cipher Runner', desc: 'Collect 3 cipher keys', goal: 3, val: (s) => s.keys, reward: { items: [['bomb', 2]] } },
  { id: 'fish3', name: 'Data Angler', desc: 'Catch 3 fish', goal: 3, val: (s) => s.fish, reward: { gems: 80 } },
  { id: 'boss1', name: 'Firewall Breaker', desc: 'Purge the FIREWALL DAEMON', goal: 1, val: (s, g) => g.progress.beaten.firewall_daemon ? 1 : 0, reward: { gems: 100 } },
  { id: 'pet1', name: 'Best Friend Protocol', desc: 'Equip a pet familiar', goal: 1, val: (s, g) => g.player.equip.pet ? 1 : 0, reward: { gems: 60 } },
  { id: 'boss4', name: 'Network Liberator', desc: 'Purge four corrupted processes', goal: 4, val: (s, g) => Object.keys(g.progress.beaten).length, reward: { gems: 300 } },
  { id: 'depth100', name: 'Core Miner', desc: 'Reach depth 100 in THE MINESHAFT', goal: 100, val: (s) => s.maxDepth, reward: { gems: 150 } },
  { id: 'summit', name: 'Stack Overflow', desc: 'Reach the summit of THE STACK', goal: 1, val: (s) => s.summits, reward: { gems: 200 } },
  { id: 'kraken', name: 'Depth Charge', desc: 'Purge KRAKEN.SYS', goal: 1, val: (s, g) => g.progress.beaten.kraken ? 1 : 0, reward: { gems: 150 } },
  { id: 'rootkit', name: 'Process Killer', desc: 'Purge R O O T K I T', goal: 1, val: (s, g) => g.progress.beaten.rootkit ? 1 : 0, reward: { gems: 150 } },
  { id: 'lvl5', name: 'Power User', desc: 'Reach level 5', goal: 5, val: (s, g) => g.level, reward: { gems: 100 } },
  { id: 'defrag1', name: 'Disk Doctor', desc: 'Successfully DEFRAG a Corrupted Drive', goal: 1, val: (s) => s.defrags, reward: { gems: 80 } },
  { id: 'spire5', name: 'Tower Defense', desc: 'Survive to wave 5 in the BLACK SPIRE', goal: 5, val: (s) => s.spireBest, reward: { gems: 200 } },
  { id: 'paint5', name: 'Decorator', desc: 'Paint 5 blocks', goal: 5, val: (s) => s.painted || 0, reward: { items: [['paint_purple', 3]] } },
  { id: 'world2', name: 'Land Baron', desc: 'Found a world with a World Lock', goal: 1, val: (s, g) => Object.keys(g.ownedWorlds).length, reward: { gems: 250 } },
  { id: 'boss6', name: 'Total Purge', desc: 'Purge all six corrupted processes', goal: 6, val: (s, g) => Object.keys(g.progress.beaten).length, reward: { items: [['overclock_cola', 3]] } },
  { id: 'boss7', name: 'Exterminator', desc: 'Purge the SWARM QUEEN', goal: 1, val: (s, g) => g.progress.beaten.swarm_queen ? 1 : 0, reward: { gems: 200 } },
  { id: 'rush1', name: 'OVERCLOCKED', desc: 'Clear the BOSS RUSH', goal: 1, val: (s, g) => g.progress.rushDone ? 1 : 0, reward: { gems: 500 } },
];

/* ---------------- achievements (permanent milestones, gem rewards) ---------------- */
const ACHIEVEMENTS = [
  { id: 'first_blood', name: 'First Blood', desc: 'Destroy your first enemy', icon: '⚔', val: (s) => s.kills >= 1, gems: 20 },
  { id: 'slayer', name: 'Slayer', desc: 'Destroy 100 enemies', icon: '💀', val: (s) => s.kills >= 100, gems: 100 },
  { id: 'genocide', name: 'Debugger Supreme', desc: 'Destroy 500 enemies', icon: '☠', val: (s) => s.kills >= 500, gems: 300 },
  { id: 'demolisher', name: 'Demolisher', desc: 'Break 500 blocks', icon: '⛏', val: (s) => s.broken >= 500, gems: 80 },
  { id: 'strip_miner', name: 'Strip Miner', desc: 'Break 2500 blocks', icon: '🏗', val: (s) => s.broken >= 2500, gems: 250 },
  { id: 'architect', name: 'Architect', desc: 'Place 500 blocks', icon: '🧱', val: (s) => s.placed >= 500, gems: 120 },
  { id: 'green_thumb', name: 'Green Thumb', desc: 'Harvest 100 trees', icon: '🌳', val: (s) => s.harvests >= 100, gems: 120 },
  { id: 'geneticist', name: 'Geneticist', desc: 'Splice 25 times', icon: '🧬', val: (s) => s.splices >= 25, gems: 100 },
  { id: 'mad_scientist', name: 'Mad Scientist', desc: 'Discover 60 recipes', icon: '⚗', val: (s, g) => Object.keys(g.progress.discovered).length >= 60, gems: 400 },
  { id: 'completionist', name: 'Compiler of All', desc: 'Discover 120 recipes', icon: '📖', val: (s, g) => Object.keys(g.progress.discovered).length >= 120, gems: 1000 },
  { id: 'angler', name: 'Master Angler', desc: 'Catch 25 fish', icon: '🎣', val: (s) => s.fish >= 25, gems: 120 },
  { id: 'tycoon', name: 'Gem Tycoon', desc: 'Earn 10,000 gems total', icon: '💎', val: (s) => s.gemsEarned >= 10000, gems: 300 },
  { id: 'spelunker', name: 'Spelunker', desc: 'Reach depth 120 in the Mineshaft', icon: '🕳', val: (s) => s.maxDepth >= 120, gems: 150 },
  { id: 'tower_king', name: 'Tower King', desc: 'Survive to Spire wave 10', icon: '🗼', val: (s) => s.spireBest >= 10, gems: 300 },
  { id: 'liberator', name: 'Network Liberator', desc: 'Purge all 7 corrupted processes', icon: '👑', val: (s, g) => Object.keys(g.progress.beaten).length >= 7, gems: 500 },
  { id: 'overlord', name: 'Overlord', desc: 'Clear the Boss Rush', icon: '🔥', val: (s, g) => g.progress.rushDone, gems: 400 },
  { id: 'landlord', name: 'Landlord', desc: 'Found 3 worlds', icon: '🌍', val: (s, g) => Object.keys(g.ownedWorlds).length >= 3, gems: 300 },
  { id: 'decorator', name: 'Interior Decorator', desc: 'Paint 50 blocks', icon: '🎨', val: (s) => (s.painted || 0) >= 50, gems: 100 },
  { id: 'surgeon', name: 'Disk Surgeon', desc: 'Successfully DEFRAG 10 drives', icon: '💾', val: (s) => (s.defrags || 0) >= 10, gems: 200 },
  { id: 'veteran', name: 'Veteran', desc: 'Reach level 20', icon: '⭐', val: (s, g) => g.level >= 20, gems: 400 },
];

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
    this.zaps = []; this.keyPickups = [];
    this.keysGot = 0; this.keysNeed = 0;
    this.pet = null; this.fishing = null; this.rush = null;
    this.xp = 0; this.level = 1;
    this.buff = null;
    this.ownedWorlds = {};   // name -> World instance
    this.spire = null;       // wave-defense state
    this.defrag = null;      // minigame state (owned by ui)
    this.merchant = null; this._merchantT = 60 + Math.random() * 120;
    this._rainT = 150 + Math.random() * 150; this.rain = 0;
    this.boss = null; this.bossDefeatedThisVisit = false;
    this.fx = new FXSystem();
    this.sfx = new SFX();
    this.progress = { beaten: {}, discovered: {}, tutorial: 0, quests: {}, achievements: {}, stats: Object.assign({}, STATS_DEFAULT), rushDone: false, streak: 0, lastLogin: '' };
    this._questNotified = {};
    this._questT = 0; this._miniT = 0;
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
      if (k === 's' || k === 'arrowdown') { this.input.down = true; this.tryTeleport(); }
      if (k >= '1' && k <= '9') { this.player.sel = +k - 1; ui.dirty = true; }
      if (k === 'e') ui.togglePanel('inv');
      if (k === 'b') ui.togglePanel('shop');
      if (k === 'c') ui.togglePanel('codex');
      if (k === 'q') ui.togglePanel('quest');
      if (k === 'v') ui.togglePanel('worlds');
      if (k === 'g') ui.togglePanel('ach');
      if (k === 'escape') ui.closeAll();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'a' || k === 'arrowleft') this.input.left = false;
      if (k === 'd' || k === 'arrowright') this.input.right = false;
      if (k === ' ' || k === 'w' || k === 'arrowup') this.input.jump = false;
      if (k === 's' || k === 'arrowdown') this.input.down = false;
    });
    this.canvas.addEventListener('mousemove', (e) => { this.input.mouse.x = e.clientX; this.input.mouse.y = e.clientY; });
    document.addEventListener('mousedown', (e) => {
      if (!this.running || ui.anyPanelOpen()) return;
      if (e.target !== this.canvas) return;
      if (e.button === 0) this.input.mouse.held = true;
      if (e.button === 2) this.input.mouse.heldR = true;
      if (e.button === 1) { e.preventDefault(); this.pipette(e.clientX + this.cam.x, e.clientY + this.cam.y); }
      this.input.mouse.x = e.clientX; this.input.mouse.y = e.clientY;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.mouse.held = false;
      if (e.button === 2) this.input.mouse.heldR = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('beforeunload', () => this.save());
  }

  // middle-click: pick the hovered block into your hotbar if you own it
  pipette(wx, wy) {
    const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    const id = this.world.get(tx, ty) || this.world.bgT[this.world.idx(tx, ty)];
    if (!id || !this.player.count(id)) return;
    const p = this.player;
    let slot = p.hotbar.indexOf(id);
    if (slot < 0) { slot = p.hotbar.indexOf(null); if (slot < 1) slot = 1; p.hotbar[slot] = id; }
    p.sel = slot;
    ui.dirty = true;
    this.sfx.play('place');
  }

  rollMerchantStock() {
    const pool = [
      { id: 'tesla_coil_seed', price: 95 }, { id: 'drone_pet_seed', price: 160 },
      { id: 'golden_fish', price: 55 }, { id: 'mystery_seed', price: 85 },
      { id: 'overclock_cola', price: 40 }, { id: 'glider_wings_seed', price: 130 },
      { id: 'crystal_cluster_seed', price: 110 }, { id: 'recall_disc_seed', price: 120 },
      { id: 'shield_gen_seed', price: 100 }, { id: 'medkit', price: 15 },
      { id: 'jetpack_seed', price: 200 }, { id: 'note_block_seed', price: 45 },
    ].filter(d => ITEMS[d.id]);
    const stock = [];
    while (stock.length < 4 && pool.length) stock.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return stock;
  }

  tryPortal() {
    // merchant first
    if (this.merchant && Math.abs(this.player.x - this.merchant.x) < TS * 2 && Math.abs(this.player.y - this.merchant.y) < TS * 3) {
      ui.openMerchant();
      return true;
    }
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
    // display shelf: player stands in its (non-solid) tile
    for (const sy2 of [Math.floor(p.y / TS), Math.floor((p.y + p.h / 2 - 2) / TS)]) {
      if (w.get(tx, sy2) === 'display_shelf') {
        const i = w.idx(tx, sy2);
        const m = w.meta[i] = w.meta[i] || {};
        if (m.display) {
          this.spawnDrop(tx * TS + TS / 2, sy2 * TS, m.display, 1);
          delete m.display;
          this.toast('Item taken off display.', '');
        } else {
          const held = p.heldItem();
          if (held.id !== 'fist' && p.count(held.id)) {
            p.take(held.id, 1);
            m.display = held.id;
            this.toast('★ ' + held.name + ' is now on display.', 'gold');
            this.sfx.play('buy');
          } else this.toast('Select an item in your hotbar to exhibit it.', 'warn');
        }
        if (w.isHome) this.saveSoon();
        return;
      }
    }
    if (w.get(tx, ty) === 'vendor_bot') { // stock / withdraw
      const i = w.idx(tx, ty);
      const m = w.meta[i] = w.meta[i] || {};
      if (m.stock) {
        this.spawnDrop(tx * TS + TS / 2, (ty - 1) * TS, m.stock.id, m.stock.n);
        this.toast('Withdrew remaining stock.', '');
        delete m.stock;
      } else {
        const held = p.heldItem();
        const price = sellPrice(held.id);
        if (price > 0 && p.count(held.id)) {
          const n = Math.min(10, p.count(held.id));
          p.take(held.id, n);
          m.stock = { id: held.id, n, t: 0 };
          this.toast('Stocked ' + n + '× ' + held.name + ' — sells one every 25s for ◆' + price + '.', 'gold');
          this.sfx.play('buy');
        } else this.toast('Select a sellable item to stock the Vendor Bot.', 'warn');
      }
      if (w.isHome) this.saveSoon();
      return;
    }
    if (w.get(tx, ty) === 'compost') { // feed / collect the bin
      const i = w.idx(tx, ty);
      const m = w.meta[i] = w.meta[i] || {};
      if (m.comp && m.comp.done) {
        const pool = ['dirt_seed', 'stone_seed', 'wood_seed', 'sand_seed', 'brick_seed', 'glass_seed', 'spring_pad_seed', 'conveyor_seed', 'led_block_seed', 'spike_trap_seed'];
        this.spawnDrop(tx * TS + TS / 2, (ty - 1) * TS, pool[Math.floor(Math.random() * pool.length)], 1);
        delete m.comp;
        this.toast('The compost turned into a seed!', 'gold');
        this.sfx.play('harvest');
      } else if (m.comp) {
        this.toast('Still composting… ' + Math.ceil((m.comp.until - Date.now()) / 1000) + 's to go.', '');
      } else {
        const held = p.heldItem();
        if (held.id !== 'fist' && held.kind !== 'special' && held.tier !== 9 && p.count(held.id)) {
          p.take(held.id, 1);
          m.comp = { until: Date.now() + 60000 };
          this.toast('Fed 1× ' + held.name + ' to the bin. Check back in 60s.', '');
          this.sfx.play('plant');
        } else this.toast('Select any (non-boss) item to compost it into a seed.', 'warn');
      }
      if (w.isHome) this.saveSoon();
      return;
    }
    const underIt = w.item(tx, ty);
    if (underIt && underIt.fx && underIt.fx.note && !underIt.fx.drum) { // tune the chime
      const i = w.idx(tx, ty);
      const m = w.meta[i] = w.meta[i] || {};
      m.pitch = ((m.pitch || 0) + 1) % 13;
      this.sfx.note(m.pitch - (underIt.fx.noteLow ? 12 : 0));
      if (w.isHome) this.saveSoon();
      return;
    }
    if (w.get(tx, ty) === 'weather_core') { // reprogram the sky
      w.applyWeather(w.themeIdx + 1);
      this.toast('☁ Weather program: ' + WEATHERS[w.themeIdx].name, 'gold');
      this.sfx.play('tp');
      if (w.isHome) this.saveSoon();
      return;
    }
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
  addGems(n) {
    if (n > 0 && this.progress.overdrive) n = Math.round(n * 2);
    this.gems = Math.max(0, this.gems + n);
    if (n > 0) {
      this.progress.stats.gemsEarned += n;
      if (this.player.gearFx('greed')) this.addXp(Math.max(1, Math.ceil(n / 4)));
    }
    ui.updateHUD();
  }

  /* ---------------- XP & levels ---------------- */
  xpNeed() { return Math.floor(60 * Math.pow(this.level, 1.35)); }
  onPlayerDealt(dmg) { // leech chip lifesteal
    const leech = this.player.gearFx('leech');
    if (leech && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + dmg * leech);
      ui.updateHUD();
    }
  }
  addXp(n) {
    n = Math.max(1, Math.round(n * (this.player.gearFx('xpMult') || 1) * (this.player.xpAuraM || 1)));
    this.xp += n;
    while (this.xp >= this.xpNeed()) {
      this.xp -= this.xpNeed();
      this.level++;
      this.player.maxHp = 100 + (this.level - 1) * 3;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
      this.toast('▲ LEVEL UP! You are now level ' + this.level + ' (+3 max HP)', 'gold');
      this.fx.explode(this.player.x, this.player.y, '#2de2a3', 24);
      this.sfx.play('victory');
      this.save();
    }
    ui.updateHUD();
  }
  buffActive() { return this.buff && this.time < this.buff.until; }
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
    this.zaps = []; this.keyPickups = []; this.fishing = null; this.rush = null;
    this.keysGot = 0; this.keysNeed = 0;
    this.boss = null; this.bossDefeatedThisVisit = false;
    this.merchant = null; this.spire = null;
    if (id === 'home') {
      this.world = this.homeWorld;
    } else if (id.startsWith('world:')) {
      const name = id.slice(6);
      if (!this.ownedWorlds[name]) return;
      this.world = this.ownedWorlds[name];
      this.toast('Welcome to ' + name.toUpperCase() + ' — a ' + this.world.biome + ' world. It saves like home.', 'gold');
    } else if (id.startsWith('visit:')) {
      const name = id.slice(6);
      // owned worlds always win over a public visit of the same name
      if (this.ownedWorlds[name]) { this.world = this.ownedWorlds[name]; }
      else {
        this.world = World.genPublic(name);
        this.toast('Now visiting ' + name.toUpperCase() + ' — a public ' + this.world.biome + ' world. Changes here reset; press [V] to CLAIM it.', 'gold');
      }
    } else if (id === 'spire') {
      this.world = World.genSpire();
      this.spire = { wave: 0, betweenT: 4, active: false };
      this.toast('BLACK SPIRE — survive escalating waves. Leave through the exit between waves.', 'warn');
    } else if (id === 'rush') {
      this.world = World.genRush();
      this.rush = { stage: 0, timer: 3 };
      this.toast('BOSS RUSH: all six corrupted processes, back to back. No gate, no mercy.', 'warn');
    } else if (id === 'mine') {
      this.world = World.genMine();
      this.toast('THE MINESHAFT — the deeper you dig, the richer the veins. And the meaner the residents.', 'warn');
    } else if (id === 'stack') {
      this.world = World.genStack();
      this.toast('THE STACK — climb to the summit. Three Golden Caches await the worthy.', 'warn');
    } else {
      const n = +id.replace('sector', '');
      this.world = World.genSector(n);
      this.keysNeed = this.world.keySpots.length;
      for (const s of this.world.keySpots) this.keyPickups.push(new KeyPickup(s.x, s.y));
      this.toast('Entering ' + this.world.name + ' — find ' + this.keysNeed + ' cipher keys to unseal the boss gate.', 'warn');
      this.toast('Careful: dying in a sector costs 20% of your gems.', 'warn');
      // the WARDEN sometimes stalks a sector (nether miniboss)
      if (Math.random() < 0.28) {
        const far = this.world.spawnPoints.filter(s => s.x > this.world.w * 0.35 && s.x < this.world.gateCol - 2);
        if (far.length) {
          const s = far[Math.floor(Math.random() * far.length)];
          this.enemies.push(new Enemy('warden', s.x * TS + TS / 2, s.y * TS - 8, n));
          this.toast('⚠ Something heavy is patrolling this sector…', 'warn');
        }
      }
    }
    const p = this.player;
    p.x = this.world.spawn.x; p.y = this.world.spawn.y;
    // arrive at your Home Door if you've placed one
    if (this.world.isHome && this.world.doorIdx >= 0 && this.world.tiles[this.world.doorIdx] === 'door') {
      const dtx = this.world.doorIdx % this.world.w, dty = Math.floor(this.world.doorIdx / this.world.w);
      p.x = dtx * TS + TS / 2; p.y = (dty + 1) * TS - p.h / 2 - 1;
    }
    p.vx = 0; p.vy = 0;
    this.cam.x = p.x - this.cam.view.w / 2; this.cam.y = p.y - this.cam.view.h / 2;
    this.world.buildMini(this);
    ui.updateHUD();
    this.sfx.play('tp');
  }

  /* ---------------- founded worlds (World Locks) ---------------- */
  foundWorld(rawName) {
    const name = (rawName || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16);
    if (!name) { this.toast('Give your world a name (letters/numbers).', 'warn'); return false; }
    if (name === 'home' || this.ownedWorlds[name]) { this.toast('That world name is taken.', 'warn'); return false; }
    if (!this.player.count('world_lock')) { this.toast('You need a WORLD LOCK (shop, ◆1500 — or find one in a Golden Cache).', 'warn'); return false; }
    this.player.take('world_lock', 1);
    const biome = BIOMES[Math.floor(Math.random() * BIOMES.length)];
    this.ownedWorlds[name] = World.genOwned(name, biome);
    this.toast('★ WORLD FOUNDED: ' + name.toUpperCase() + ' — biome: ' + biome.toUpperCase() + '!', 'gold');
    this.sfx.play('victory');
    this.save();
    this.enterWorld('world:' + name);
    return true;
  }

  // travel to ANY world by name (Growtopia/Pixel Worlds shared namespace)
  normalizeWorldName(raw) { return (raw || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 16); }
  visitWorld(rawName) {
    const name = this.normalizeWorldName(rawName);
    if (!name) { this.toast('Type a world name to travel there.', 'warn'); return false; }
    if (name === 'home') { this.enterWorld('home'); return true; }
    this.progress.visited = this.progress.visited || {};
    this.progress.visited[name] = Date.now();
    this.enterWorld(this.ownedWorlds[name] ? 'world:' + name : 'visit:' + name);
    return true;
  }
  randomWorld() {
    const syl = ['ka', 'zor', 'lux', 'mi', 'the', 'gla', 'nova', 'rex', 'vy', 'pixel', 'qua', 'zen', 'orb', 'fro', 'ember'];
    let n = ''; const c = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < c; i++) n += syl[Math.floor(Math.random() * syl.length)];
    this.visitWorld(n);
  }
  // claim the public world you're standing in with a World Lock → it becomes owned & persists
  claimCurrentWorld() {
    const w = this.world;
    if (!w || !w.visited) { this.toast('You can only claim public worlds you are visiting.', 'warn'); return false; }
    const name = w.publicName;
    if (this.ownedWorlds[name]) { this.toast('You already own this world.', 'warn'); return false; }
    if (!this.player.count('world_lock')) { this.toast('You need a WORLD LOCK to claim this world (shop ◆1500, Golden Cache, or Spire wave 10).', 'warn'); return false; }
    this.player.take('world_lock', 1);
    // promote the current in-memory world to an owned, saveable world
    w.id = 'world:' + name; w.visited = false; w.ownedName = name;
    w.portals = w.portals.filter(p => p.target === 'home');
    this.ownedWorlds[name] = w;
    this.progress.stats.claimed = (this.progress.stats.claimed || 0) + 1;
    this.toast('★ WORLD CLAIMED: ' + name.toUpperCase() + ' is now yours and will save!', 'gold');
    this.sfx.play('victory');
    this.fx.explode(this.player.x, this.player.y, '#ffd166', 28);
    this.save();
    ui.renderWorlds();
    return true;
  }

  /* ---------------- fireworks ---------------- */
  launchFirework(x, y) {
    this.sfx.play('shoot');
    this.hazards.push({
      x, y, vy: -560, t: 0, dead: false,
      hue: ['#ff4d6d', '#ffd166', '#3ddc84', '#6ee7ff', '#c77dff'][Math.floor(Math.random() * 5)],
      update(dt, world, game) {
        this.t += dt;
        this.y += this.vy * dt;
        if (Math.random() < 0.6) game.fx.add(this.x, this.y + 8, (Math.random() - 0.5) * 30, 60, '#ffd166', 0.3, 2.5, 0);
        if (this.t > 0.85) {
          this.dead = true;
          game.sfx.play('boom');
          game.shake = Math.max(game.shake, 0.2);
          for (let ring = 0; ring < 2; ring++) {
            for (let i = 0; i < 26; i++) {
              const a = (i / 26) * 6.283;
              const s = 150 + ring * 130;
              game.fx.add(this.x, this.y, Math.cos(a) * s, Math.sin(a) * s, ring ? '#fff' : this.hue, 0.9, 3.5, 160);
            }
          }
          const targets = game.boss && !game.boss.dead ? [...game.enemies, game.boss] : game.enemies;
          for (const e of targets) if (!e.dead && Math.hypot(e.x - this.x, e.y - this.y) < 3 * TS) e.hurt(45, game);
        }
      },
      draw(ctx, cam) {
        ctx.fillStyle = this.hue;
        ctx.fillRect(this.x - cam.x - 3, this.y - cam.y - 6, 6, 12);
      },
    });
  }

  /* ---------------- fishing ---------------- */
  castRod(tx, ty) {
    // lure buoys nearby: faster bites, luckier catches
    let lured = false;
    for (let dy = -5; dy <= 5 && !lured; dy++) for (let dx = -5; dx <= 5; dx++) {
      const it = this.world.item(tx + dx, ty + dy);
      if (it && it.fx && it.fx.lure && Math.hypot(dx, dy) <= it.fx.lure) { lured = true; break; }
    }
    this.fishing = { x: tx * TS + TS / 2, y: ty * TS + 6, t: 0, biteAt: (2 + Math.random() * 4) * (lured ? 0.45 : 1), bite: false, biteT: 0, lured };
    this.sfx.play('plant');
    this.fx.puff(this.fishing.x, this.fishing.y, lured ? '#ff8fa3' : '#9adcf0');
  }
  reelRod() {
    const f = this.fishing;
    if (!f) return;
    this.fishing = null;
    if (!f.bite) { this.toast('Nothing yet — wait for the [!] before reeling.', 'warn'); return; }
    this.fx.harvest(f.x, f.y, '#6ee7ff');
    this.sfx.play('harvest');
    this.progress.stats.fish++;
    this.addXp(6);
    const r = Math.random() + (f.lured ? 0.12 : 0);
    if (r < 0.5) { this.spawnGems(f.x, f.y - 20, 4 + Math.floor(Math.random() * 9)); this.toast('Reeled in a gem cluster!', 'gold'); }
    else if (r < 0.75) this.spawnDrop(f.x, f.y - 20, 'data_fish', 1);
    else if (r < 0.92) {
      const pool = ['dirt_seed', 'stone_seed', 'wood_seed', 'sand_seed', 'brick_seed', 'glass_seed', 'spring_pad_seed', 'led_block_seed'];
      this.spawnDrop(f.x, f.y - 20, pool[Math.floor(Math.random() * pool.length)], 1);
      this.toast('A seed washed up on your line!', 'gold');
    } else { this.spawnDrop(f.x, f.y - 20, 'golden_fish', 1); this.toast('★ GOLDEN FISH! Eat it or sell it — it\'s worth a fortune.', 'gold'); }
  }
  updateFishing(dt) {
    const f = this.fishing;
    if (!f) return;
    const held = this.player.heldItem();
    if (!held.rod || Math.hypot(this.player.x - f.x, this.player.y - f.y) > 6.5 * TS) { this.fishing = null; return; }
    f.t += dt;
    if (!f.bite && f.t >= f.biteAt) {
      f.bite = true; f.biteT = 1.3;
      this.sfx.play('bounce');
      this.fx.puff(f.x, f.y, '#fff');
    }
    if (f.bite) {
      f.biteT -= dt;
      if (f.biteT <= 0) { this.fishing = null; this.toast('It got away…', 'warn'); this.sfx.play('error'); }
    }
  }

  /* ---------------- quests ---------------- */
  questProgress(q) { return Math.min(q.goal, q.val(this.progress.stats, this)); }
  claimQuest(id) {
    const q = QUESTS.find(x => x.id === id);
    if (!q || this.progress.quests[id] || this.questProgress(q) < q.goal) return;
    this.progress.quests[id] = true;
    if (q.reward.gems) this.addGems(q.reward.gems);
    if (q.reward.items) for (const [iid, n] of q.reward.items) this.player.give(iid, n);
    this.addXp(25);
    this.toast('Quest reward claimed: ' + q.name + '!', 'gold');
    this.sfx.play('victory');
    this.save();
  }
  checkQuests() {
    for (const q of QUESTS) {
      if (this.progress.quests[q.id] || this._questNotified[q.id]) continue;
      if (this.questProgress(q) >= q.goal) {
        this._questNotified[q.id] = true;
        this.toast('✔ Quest complete: ' + q.name + ' — press [Q] to claim!', 'gold');
        this.sfx.play('buy');
      }
    }
    // achievements unlock & auto-reward the moment their condition is met
    for (const a of ACHIEVEMENTS) {
      if (this.progress.achievements[a.id]) continue;
      if (a.val(this.progress.stats, this)) {
        this.progress.achievements[a.id] = true;
        this.addGems(a.gems);
        this.toast('🏆 ACHIEVEMENT: ' + a.name + ' (+' + a.gems + ' ◆)', 'gold');
        this.fx.explode(this.player.x, this.player.y, '#ffd166', 24);
        this.sfx.play('victory');
        this.save();
      }
    }
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
    if (this.world.isRush && this.rush) { // boss rush chain
      this.shake = 0.8;
      this.sfx.play('victory');
      this.fx.explode(boss.x, boss.y, '#ffd166', 50);
      this.spawnGems(boss.x, boss.y, 60 + Math.floor(Math.random() * 40));
      this.spawnDrop(boss.x, boss.y, 'medkit', 1);
      this.rush.stage++;
      this.addXp(120);
      setTimeout(() => { this.boss = null; ui.bossBar(null); }, 100);
      if (this.rush.stage >= RUSH_ORDER.length) {
        if (!this.progress.rushDone) {
          this.progress.rushDone = true;
          this.spawnDrop(boss.x, boss.y, 'overclock_chip', 1);
          this.spawnDrop(boss.x, boss.y, 'core_sprite', 1);
          this.toast('★★★ BOSS RUSH CLEARED — Overclock Chip + Core Sprite pet acquired!', 'gold');
          this.toast('OVERDRIVE MODE unlocked — toggle it in the GEM EXCHANGE [B].', 'gold');
        } else {
          this.spawnGems(boss.x, boss.y, 400);
          this.toast('★ BOSS RUSH cleared again. The network fears you.', 'gold');
        }
        this.rush = null;
        this.save();
      } else {
        this.rush.timer = 3.5;
        this.toast('Process ' + this.rush.stage + '/' + RUSH_ORDER.length + ' purged. Next one incoming…', 'warn');
      }
      return;
    }
    this.bossDefeatedThisVisit = true;
    this.shake = 0.8;
    this.sfx.play('victory');
    this.fx.explode(boss.x, boss.y, '#ffd166', 50);
    const [g0, g1] = boss.meta.gems;
    this.spawnGems(boss.x, boss.y, g0 + Math.floor(Math.random() * (g1 - g0)));
    this.addXp(120);
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
      if (boss.id === 'firewall_daemon') {
        this.spawnDrop(boss.x, boss.y, 'firewall_block', 3);
        if (Math.random() < 0.15 && !this.player.count('ember_pet')) {
          this.spawnDrop(boss.x, boss.y, 'ember_pet', 1);
          this.toast('★ RARE DROP: an Ember Kit crawled out of the wreckage!', 'gold');
        }
      }
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
    if (!this.homeWorld) return;
    try {
      const p = this.player;
      const worlds = {};
      for (const name in this.ownedWorlds) worlds[name] = this.ownedWorlds[name].serialize();
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 3, gems: this.gems, inv: p.inv, hotbar: p.hotbar, equip: p.equip, sel: p.sel,
        hp: p.hp, xp: this.xp, level: this.level,
        progress: this.progress, home: this.homeWorld.serialize(), worlds,
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
      this.xp = s.xp || 0;
      this.level = s.level || 1;
      this.player.maxHp = 100 + (this.level - 1) * 3;
      this.player.hp = s.hp > 0 ? Math.min(s.hp, this.player.maxHp) : this.player.maxHp;
      this.progress = Object.assign({ beaten: {}, discovered: {}, tutorial: 99, quests: {}, achievements: {}, rushDone: false, streak: 0, lastLogin: '', overdrive: false }, s.progress);
      this.progress.achievements = this.progress.achievements || {};
      this.progress.stats = Object.assign({}, STATS_DEFAULT, this.progress.stats || {});
      this.progress.quests = this.progress.quests || {};
      this.player.equip = Object.assign({ back: null, feet: null, chip: null, pet: null }, this.player.equip);
      this.homeWorld = World.deserializeHome(s.home);
      this.ownedWorlds = {};
      for (const name in (s.worlds || {})) this.ownedWorlds[name] = World.deserializeOwned(name, s.worlds[name]);
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
    // daily login bonus (streaks, like a proper live-service sandbox)
    const today = new Date().toDateString();
    if (this.progress.lastLogin !== today) {
      const yesterday = new Date(Date.now() - 864e5).toDateString();
      this.progress.streak = this.progress.lastLogin === yesterday ? (this.progress.streak || 0) + 1 : 1;
      this.progress.lastLogin = today;
      const bonus = Math.min(50 + (this.progress.streak - 1) * 25, 150);
      this.addGems(bonus);
      setTimeout(() => this.toast('☀ Daily login bonus: +' + bonus + ' ◆ (day ' + this.progress.streak + ' streak)', 'gold'), 1200);
      this.save();
    }
    if (this.progress.tutorial === 0) {
      const tips = [
        ['Welcome to your HOME SERVER. Punch blocks (click) to harvest materials and find seeds.', 0],
        ['Plant seeds on solid ground. Trees grow in real time — even while you\'re away.', 6],
        ['SPLICE: plant a DIFFERENT seed onto a sapling. Try Dirt + Wood = Spring Pad. Codex: [C]', 12],
        ['Every item DOES something. Springs bounce, sentries shoot, teleporters warp.', 20],
        ['RIGHT-CLICK places blocks as BACKGROUND WALLS — wallpaper your base. Middle-click picks a block.', 24],
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

    // held mouse = act toward cursor (left: main, right: background layer)
    if (this.input.mouse.held && !ui.anyPanelOpen()) {
      const wx = this.input.mouse.x + this.cam.x;
      const wy = this.input.mouse.y + this.cam.y;
      p.act(this, wx, wy);
    } else if (this.input.mouse.heldR && !ui.anyPanelOpen()) {
      const wx = this.input.mouse.x + this.cam.x;
      const wy = this.input.mouse.y + this.cam.y;
      p.actBg(this, wx, wy);
    }

    this.updateAmbient(dt);

    // ambient enemy spawns in sectors
    if (w.enemyCap && this.enemies.filter(e => !e.dead).length < w.enemyCap) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 2.2;
        const cands = w.spawnPoints.filter(s => {
          const d = Math.hypot(s.x * TS - p.x, s.y * TS - p.y);
          return d > 9 * TS && d < 34 * TS;
        });
        if (cands.length) {
          const s = cands[Math.floor(Math.random() * cands.length)];
          const type = w.enemyTypes[Math.floor(Math.random() * w.enemyTypes.length)];
          let lvl = w.sectorN || 1;
          if (w.isMine) lvl = 1 + Math.floor(Math.max(0, s.y - 10) / 45);
          if (this.progress.overdrive) lvl += 3;
          this.enemies.push(new Enemy(type, s.x * TS + TS / 2, s.y * TS + TS / 2 - 4, lvl));
        }
      }
    }

    // boss rush sequencer
    if (w.isRush && this.rush && !this.boss) {
      this.rush.timer -= dt;
      if (this.rush.timer <= 0) {
        this.boss = spawnBoss(RUSH_ORDER[this.rush.stage], w.w * TS / 2, 17 * TS);
        this.sfx.play('bossroar');
        this.shake = 0.5;
        this.toast('⚠ ' + this.boss.meta.name + ' enters the arena!', 'warn');
      }
    }

    // BLACK SPIRE wave defense
    if (w.isSpire && this.spire) {
      const sp = this.spire;
      if (!sp.active) {
        sp.betweenT -= dt;
        if (sp.betweenT <= 0) {
          sp.wave++; sp.active = true;
          const count = 2 + sp.wave;
          for (let k = 0; k < count; k++) {
            const s = w.spawnPoints[Math.floor(Math.random() * w.spawnPoints.length)];
            const pool = ['glitchling', 'ember', 'drone', 'zapper', 'spitter'];
            this.enemies.push(new Enemy(pool[Math.floor(Math.random() * pool.length)], s.x * TS + TS / 2, s.y * TS - 6, 1 + Math.floor(sp.wave / 2) + (this.progress.overdrive ? 3 : 0)));
          }
          if (sp.wave % 5 === 0) this.enemies.push(new Enemy('warden', w.w * TS / 2, 22 * TS, Math.max(1, Math.floor(sp.wave / 4))));
          this.toast('⚔ WAVE ' + sp.wave + (sp.wave % 5 === 0 ? ' — ELITE WAVE!' : ''), 'warn');
          this.sfx.play('bossroar');
          ui.updateHUD();
        }
      } else if (!this.enemies.some(e => !e.dead)) {
        sp.active = false; sp.betweenT = 5;
        const reward = 12 * sp.wave;
        this.spawnGems(p.x, p.y - 40, reward);
        this.addXp(15 + sp.wave * 5);
        if (sp.wave % 3 === 0) this.spawnDrop(w.w * TS / 2, 22 * TS, 'corrupted_drive', 1);
        if (sp.wave > (this.progress.stats.spireBest || 0)) this.progress.stats.spireBest = sp.wave;
        if (sp.wave === 10 && !this.progress.spireLockGiven) {
          this.progress.spireLockGiven = true;
          this.spawnDrop(w.w * TS / 2, 22 * TS, 'world_lock', 1);
          this.toast('★★★ WAVE 10 CONQUERED — the Spire yields a WORLD LOCK!', 'gold');
        } else this.toast('Wave ' + sp.wave + ' cleared! +' + reward + ' ◆ — next in 5s, or take the EXIT.', 'gold');
        this.save();
      }
    }

    // mineshaft depth + stack summit tracking
    if (w.isMine) {
      const depth = Math.max(0, Math.floor(p.y / TS) - 10);
      if (depth > this.progress.stats.maxDepth) this.progress.stats.maxDepth = depth;
    }
    if (w.isStack && p.y < 16 * TS && !this.progress.stats.summits) {
      this.progress.stats.summits = 1;
      this.toast('★ SUMMIT REACHED — the Golden Caches are yours!', 'gold');
      this.sfx.play('victory');
    }

    // the traveling merchant appears on your home server
    if (w.isHome) {
      if (this.merchant) {
        this.merchant.until -= dt;
        if (this.merchant.until <= 0) {
          this.merchant = null;
          this.toast('The merchant packed up and vanished…', '');
          if (!ui.el.shopPanel.classList.contains('hidden') && ui.shopMode === 'merchant') ui.closeAll();
        }
      } else {
        this._merchantT -= dt;
        if (this._merchantT <= 0) {
          this._merchantT = 240 + Math.random() * 240;
          this.merchant = { x: 39.5 * TS, y: 22 * TS, until: 90, stock: this.rollMerchantStock() };
          this.toast('❖ A traveling MERCHANT has docked at your server! (90s — press [W] near him)', 'gold');
          this.sfx.play('tp');
        }
      }
      // gem rain event
      this._rainT -= dt;
      if (this._rainT <= 0 && this.rain <= 0) {
        this._rainT = 240 + Math.random() * 240;
        this.rain = 9;
        this.toast('◆◆◆ GEM RAIN! The network is leaking currency — catch it!', 'gold');
        this.sfx.play('victory');
      }
      if (this.rain > 0) {
        this.rain -= dt;
        if (Math.random() < 0.25) {
          const gx = p.x + (Math.random() - 0.5) * this.cam.view.w * 0.8;
          const d = new Drop(gx, this.cam.y - 20, '__gem', 1 + Math.floor(Math.random() * 2));
          d.vy = 100; d.vx = (Math.random() - 0.5) * 60;
          this.drops.push(d);
        }
      }
    }
    this.maybeTriggerBoss();
    if (this.boss && !this.boss.dead) this.boss.update(dt, w, this);

    // pet familiar
    const wantPet = p.equip.pet;
    if ((this.pet && this.pet.itemId !== wantPet) || (!this.pet && wantPet)) {
      this.pet = wantPet ? new Pet(wantPet) : null;
      if (this.pet) { this.pet.x = p.x; this.pet.y = p.y - 40; }
    }
    if (this.pet && !wantPet) this.pet = null;
    if (this.pet) this.pet.update(dt, this);

    this.updateFishing(dt);
    for (const k of this.keyPickups) if (!k.dead) k.update(dt, w, this);
    this.keyPickups = this.keyPickups.filter(k => !k.dead);
    for (const z of this.zaps) z.life -= dt;
    this.zaps = this.zaps.filter(z => z.life > 0);

    this._questT += dt;
    if (this._questT > 1.5) { this._questT = 0; this.checkQuests(); }
    this._miniT += dt;
    if (this._miniT > 2.5) { this._miniT = 0; w.buildMini(this); }

    for (const e of this.enemies) if (!e.dead) e.update(dt, w, this);
    this.enemies = this.enemies.filter(e => !e.dead);
    for (const pr of this.projectiles) pr.update(dt, w, this);
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
    for (const d of this.drops) if (!d.dead) d.update(dt, w, this);
    this.drops = this.drops.filter(d => !d.dead);
    for (const h of this.hazards) h.update(dt, w, this);
    this.hazards = this.hazards.filter(h => !h.dead);
    this.fx.update(dt);

    // camera — with velocity look-ahead so you see more of where you're going
    const cam = this.cam;
    const lead = this.camLead || 0;
    const targetLead = Math.max(-1, Math.min(1, (p.vx || 0) / 260)) * 90;
    this.camLead = lead + (targetLead - lead) * Math.min(1, 3 * dt);
    const tx2 = p.x + this.camLead - cam.view.w / 2, ty2 = p.y - cam.view.h / 2 - 40;
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
    if (this.merchant) this.drawMerchant(ctx, cam);
    for (const k of this.keyPickups) k.draw(ctx, cam, this.time);
    if (this.boss && !this.boss.dead) this.boss.draw(ctx, cam, this.time);
    if (this.pet) this.pet.draw(ctx, cam, this.time);
    this.player.draw(ctx, cam, this.time);
    for (const pr of this.projectiles) pr.draw(ctx, cam);
    // tesla arcs
    for (const z of this.zaps) {
      ctx.strokeStyle = 'rgba(110,231,255,' + Math.min(1, z.life * 8) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(z.x1 - cam.x, z.y1 - cam.y);
      const mx = (z.x1 + z.x2) / 2 + (Math.random() - 0.5) * 16, my = (z.y1 + z.y2) / 2 + (Math.random() - 0.5) * 16;
      ctx.quadraticCurveTo(mx - cam.x, my - cam.y, z.x2 - cam.x, z.y2 - cam.y);
      ctx.stroke();
    }
    // fishing bobber + line
    if (this.fishing) {
      const f = this.fishing;
      const bx = f.x - cam.x, by = f.y - cam.y + Math.sin(this.time * 3) * 2 + (f.bite ? Math.sin(this.time * 25) * 4 : 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(this.player.x - cam.x + this.player.facing * 20, this.player.y - cam.y - 14);
      ctx.quadraticCurveTo(bx, by - 40, bx, by); ctx.stroke();
      ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(bx, by, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by - 2, 2.5, 0, 7); ctx.fill();
      if (f.bite) {
        ctx.fillStyle = '#ffd166'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
        ctx.fillText('!', bx, by - 16);
      }
    }
    for (const h of this.hazards) h.draw(ctx, cam, this.time, cam.view.h);
    this.fx.draw(ctx, cam);
    this.drawMinimap(ctx);
    this.drawCursor(ctx, cam);
    this.drawScreenFx(ctx, cam);
  }

  // full-screen juice: scanlines, low-HP danger vignette, damage flash
  drawScreenFx(ctx, cam) {
    const vw = cam.view.w, vh = cam.view.h;
    if (!vw || !vh) return;
    // subtle CRT scanlines for the digital theme
    ctx.globalAlpha = 0.05; ctx.fillStyle = '#000';
    for (let y = 0; y < vh; y += 3) ctx.fillRect(0, y, vw, 1);
    ctx.globalAlpha = 1;
    // low-HP danger vignette (pulsing red edge)
    const p = this.player, frac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
    if (frac < 0.3 && p.hp > 0) {
      const intensity = (0.3 - frac) / 0.3 * (0.35 + 0.25 * Math.sin(this.time * 6));
      const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vh * 0.75);
      g.addColorStop(0, 'rgba(217,4,41,0)');
      g.addColorStop(1, 'rgba(217,4,41,' + intensity + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    // damage-taken red flash
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - 0.05);
    if (this.hurtFlash > 0) {
      ctx.fillStyle = 'rgba(255,40,70,' + this.hurtFlash * 0.32 + ')';
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  /* ---------------- ambient world particles ---------------- */
  updateAmbient(dt) {
    this._ambT = (this._ambT || 0) - dt;
    if (this._ambT > 0) return;
    this._ambT = 0.12;
    const w = this.world, cam = this.cam;
    const rx = () => cam.x + Math.random() * cam.view.w;
    const ry = () => cam.y + Math.random() * cam.view.h;
    const id = w.id;
    if (w.isHome) {
      const wt = w.themeIdx;
      if (w.biome === 'tundra') { // snowfall
        for (let k = 0; k < 2; k++) this.fx.add(rx(), cam.y - 8, (Math.random() - 0.5) * 26 + 12, 50 + Math.random() * 40, 'rgba(238,243,251,0.85)', 3, 3, 0);
      } else if (w.biome === 'volcanic') {
        this.fx.add(rx(), cam.y + cam.view.h + 6, (Math.random() - 0.5) * 30, -50 - Math.random() * 60, 'rgba(255,87,20,0.65)', 2.2, 3, 0);
      } else if (w.biome === 'desert' && Math.random() < 0.4) {
        this.fx.add(cam.x - 8, ry(), 200 + Math.random() * 120, (Math.random() - 0.5) * 20, 'rgba(224,164,88,0.35)', 1.4, 3, 0);
      }
      if (wt === 3) { // MATRIX RAIN: falling glyphs
        for (let k = 0; k < 2; k++) this.fx.add(rx(), cam.y - 10, 0, 160 + Math.random() * 120, 'rgba(70,220,110,0.8)', 2.2, 0, 0, String.fromCharCode(0x30A0 + Math.floor(Math.random() * 60)));
      } else if (wt === 4) { // VAPORWAVE: pink motes
        this.fx.add(rx(), ry(), (Math.random() - 0.5) * 20, -14, 'rgba(255,110,199,0.5)', 2.5, 3, 0);
      } else if (Math.random() < 0.5) { // data motes drifting
        this.fx.add(rx(), ry(), (Math.random() - 0.5) * 16, -8 - Math.random() * 10, 'rgba(110,231,255,0.35)', 3, 2.5, 0);
      }
      if (this.rain > 0) this.fx.add(rx(), cam.y - 6, 20, 320, 'rgba(255,209,102,0.7)', 1.4, 0, 0, '◆');
    } else if (id === 'sector1' || id === 'sector4') { // embers rise
      this.fx.add(rx(), cam.y + cam.view.h + 6, (Math.random() - 0.5) * 30, -60 - Math.random() * 70, Math.random() < 0.5 ? 'rgba(255,87,20,0.7)' : 'rgba(255,209,102,0.6)', 2.2, 3, 0);
    } else if (id === 'sector2' || id === 'mine') { // dust & glitch flecks
      this.fx.add(rx(), ry(), (Math.random() - 0.5) * 12, 8, id === 'mine' ? 'rgba(160,140,110,0.35)' : 'rgba(199,125,255,0.4)', 2.4, 2.5, 0);
    } else if (id === 'sector3' || id === 'stack') { // wind streaks
      this.fx.add(cam.x - 10, ry(), 380 + Math.random() * 160, 0, 'rgba(255,255,255,0.25)', 0.8, 0, 0, '—');
    } else if (id === 'sector5') { // bubbles from the depths
      if (Math.random() < 0.6) this.fx.bubble(rx(), cam.y + cam.view.h - Math.random() * 100);
    } else if (id === 'sector6') { // shadow wisps
      this.fx.add(rx(), ry(), (Math.random() - 0.5) * 26, -6, 'rgba(141,128,201,0.28)', 3, 4, 0);
    }
  }

  drawMerchant(ctx, cam) {
    const m = this.merchant;
    const sx = m.x - cam.x, sy = m.y - cam.y;
    if (sx < -100 || sx > cam.view.w + 100) return;
    ctx.save(); ctx.translate(sx, sy);
    const bob = Math.sin(this.time * 2) * 2;
    // cart
    ctx.fillStyle = '#5e3c1a'; ctx.fillRect(10, -26 + bob, 34, 22);
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(10, -30 + bob, 34, 6);
    ctx.fillStyle = '#1c2536';
    ctx.beginPath(); ctx.arc(18, -2, 6, 0, 7); ctx.arc(36, -2, 6, 0, 7); ctx.fill();
    // wares glinting
    ctx.fillStyle = '#6ee7ff'; ctx.fillRect(14, -34 + bob, 5, 5);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(24, -36 + bob, 5, 6);
    ctx.fillStyle = '#c77dff'; ctx.fillRect(34, -34 + bob, 5, 5);
    // hooded figure
    ctx.fillStyle = '#2a1c3a';
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-24, -36 + bob); ctx.quadraticCurveTo(-14, -48 + bob, -4, -36 + bob); ctx.lineTo(-4, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-19, -32 + bob, 4, 4); ctx.fillRect(-11, -32 + bob, 4, 4);
    // label
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('❖ MERCHANT', -4, -54);
    ctx.fillStyle = '#9fb4d0'; ctx.font = '10px monospace';
    ctx.fillText('[W] trade · ' + Math.ceil(m.until) + 's', -4, -42);
    ctx.restore();
  }

  drawMinimap(ctx) {
    const w = this.world;
    if (!w.mini) return;
    const sc = Math.min(170 / w.w, 110 / w.h);
    const mw = w.w * sc, mh = w.h * sc;
    const mx = this.cam.view.w - mw - 12, my = 34;
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(5,7,13,0.8)'; ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(w.mini, mx, my, mw, mh);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#2de2a3'; ctx.lineWidth = 1; ctx.strokeRect(mx - 3, my - 3, mw + 6, mh + 6);
    // markers
    const dot = (px, py, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx + px / TS * sc, my + py / TS * sc, r || 2, 0, 7); ctx.fill(); };
    for (const k of this.keyPickups) dot(k.x, k.y, '#c77dff', 2.5);
    for (const b of (w._beacons || [])) dot(b.x, b.y, '#48cae4', 2.5);
    if (w.bossZone) dot(w.bossZone.spawnX, w.bossZone.spawnY, '#ff4d6d', 3);
    for (const p2 of w.portals) dot(p2.x, p2.y - TS, p2.locked && p2.locked() ? '#44506b' : '#2de2a3', 2);
    if (Math.floor(this.time * 4) % 2 === 0) dot(this.player.x, this.player.y, '#ffffff', 2.5);
  }

  drawCursor(ctx, cam) {
    if (ui.anyPanelOpen()) return;
    const wx = this.input.mouse.x + cam.x, wy = this.input.mouse.y + cam.y;
    const tx = Math.floor(wx / TS), ty = Math.floor(wy / TS);
    const sx = tx * TS - cam.x, sy = ty * TS - cam.y;
    const dist = Math.hypot(wx - this.player.x, wy - this.player.y) / TS;
    const inReach = dist <= 4.2;
    const w = this.world;
    const i = w.inB(tx, ty) ? w.idx(tx, ty) : -1;
    const held = this.player.heldItem();
    const empty = i >= 0 && !w.tiles[i] && !w.trees.has(i);

    // ghost placement preview for blocks & seeds
    if (inReach && empty && (held.kind === 'block' || held.kind === 'seed')) {
      const ok = held.kind === 'block' || w.isSolid(tx, ty + 1);
      ctx.save();
      ctx.globalAlpha = 0.42;
      if (held.kind === 'block') w.drawTile(ctx, held.id, tx, ty, sx, sy, this.time, this);
      else {
        ctx.strokeStyle = '#3ddc84'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx + TS / 2, sy + TS); ctx.quadraticCurveTo(sx + TS / 2 + 5, sy + 14, sx + TS / 2, sy + 8); ctx.stroke();
        ctx.fillStyle = ITEMS[held.grows] ? ITEMS[held.grows].color : '#8f8';
        ctx.beginPath(); ctx.arc(sx + TS / 2, sy + 8, 5, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = ok ? 'rgba(45,226,163,0.9)' : 'rgba(255,77,109,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, TS - 2, TS - 2);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = inReach ? 'rgba(45,226,163,0.8)' : 'rgba(255,77,109,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 1, sy + 1, TS - 2, TS - 2);
    // hovered tile label
    const hovId = i >= 0 && (w.tiles[i] || (w.trees.has(i) ? '__tree' : w.bgT[i]));
    if (hovId) {
      const name = hovId === '__tree' ? ITEMS[w.trees.get(i).result].name + ' Tree' : ITEMS[hovId].name + (w.tiles[i] ? '' : ' (wall)');
      ctx.font = '10px monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(5,7,13,0.7)';
      const tw = ctx.measureText(name).width + 8;
      ctx.fillRect(sx + TS / 2 - tw / 2, sy - 16, tw, 13);
      ctx.fillStyle = '#9fb4d0';
      ctx.fillText(name, sx + TS / 2, sy - 6);
    }
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
    try { if (game.running) game.loop(dt); }
    catch (e) { console.error('loop error', e); }  // never let one bad frame kill the game
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
