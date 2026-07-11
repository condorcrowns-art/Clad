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

/* ---------------- daily quests (rotate every real day, tracked by stat delta) ---------------- */
const DAILY_POOL = [
  { id: 'd_break', name: 'Demolition', stat: 'broken', goal: 40, reward: { shards: 2 } },
  { id: 'd_kill', name: 'Purge', stat: 'kills', goal: 15, reward: { shards: 2 } },
  { id: 'd_splice', name: 'Splicer', stat: 'splices', goal: 5, reward: { shards: 2 } },
  { id: 'd_place', name: 'Builder', stat: 'placed', goal: 40, reward: { shards: 2 } },
  { id: 'd_fish', name: 'Angler', stat: 'fish', goal: 4, reward: { shards: 2 } },
  { id: 'd_plant', name: 'Gardener', stat: 'planted', goal: 10, reward: { shards: 2 } },
  { id: 'd_harvest', name: 'Harvester', stat: 'harvests', goal: 8, reward: { shards: 2 } },
];
const DAILY_MAP = {}; for (const d of DAILY_POOL) DAILY_MAP[d.id] = d;

/* ---------------- 7-day login reward calendar ---------------- */
const LOGIN_REWARDS = [
  { label: '75 ◆', gems: 75 },
  { label: '150 ◆', gems: 150 },
  { label: '2 ◈', shards: 2 },
  { label: '250 ◆', gems: 250 },
  { label: '3× Medkit', items: [['medkit', 3]] },
  { label: '3 ◈', shards: 3 },
  { label: '400 ◆ + Cola', gems: 400, items: [['overclock_cola', 2]] },
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

/* ---------------- guild perks (level up your clan for account-wide bonuses) ---------------- */
// guild XP comes from contributing gems; each level grants a stacking perk
function guildXpNeed(lvl) { return Math.floor(500 * Math.pow(lvl, 1.5)); }
function guildPerks(lvl) {
  return {
    gemBonus: Math.min(0.5, lvl * 0.03),      // +3% gem drops per level (cap +50%)
    xpBonus: Math.min(0.5, lvl * 0.03),       // +3% XP per level
    hpBonus: Math.min(60, lvl * 4),           // +4 max HP per level
  };
}

/* ---------------- SHARD STORE (in-game premium store — simulated, no real payments) ---------------- */
const STORE = [
  { id: 'gems_small', name: 'Pouch of Gems', desc: '+500 gems', cost: 5, give: (g) => g.addGems(500) },
  { id: 'gems_big', name: 'Chest of Gems', desc: '+2,500 gems', cost: 20, give: (g) => g.addGems(2500) },
  { id: 'lock_bundle', name: 'World Lock ×3', desc: 'found 3 worlds', cost: 30, give: (g) => g.player.give('world_lock', 3) },
  { id: 'buy_mannequin', name: 'Outfit Mannequin ×2', desc: 'DECOR: place a mannequin that wears your current outfit', cost: 6, give: (g) => g.player.give('mannequin', 2) },
  { id: 'xp_boost', name: 'XP Surge', desc: '+2000 XP instantly', cost: 8, give: (g) => g.addXp(2000) },
  { id: 'ally_pass', name: 'Hire a Comrade', desc: 'summon an AI ally that fights beside you', cost: 25, give: (g) => g.summonCompanion() },
  { id: 'starter', name: 'Starter Pack', desc: 'jetpack + sword + 3 medkits + 300 gems', cost: 15, once: true, give: (g) => { g.player.give('jetpack', 1); g.player.give('sword', 1); g.player.give('medkit', 3); g.addGems(300); } },
  // pure cosmetics (avatar flair, no gameplay effect)
  { id: 'skin_gold', name: 'Golden Avatar', desc: 'COSMETIC: shine like a legend', cost: 40, once: true, cosmetic: 'gold', give: (g) => { g.setCosmetic('gold'); } },
  { id: 'skin_shadow', name: 'Shadow Avatar', desc: 'COSMETIC: a sleek dark look', cost: 40, once: true, cosmetic: 'shadow', give: (g) => { g.setCosmetic('shadow'); } },
  { id: 'skin_rainbow', name: 'Prism Avatar', desc: 'COSMETIC: cycle every color', cost: 60, once: true, cosmetic: 'rainbow', give: (g) => { g.setCosmetic('rainbow'); } },
  { id: 'skin_crimson', name: 'Crimson Avatar', desc: 'COSMETIC: molten red with an ember aura', cost: 40, once: true, cosmetic: 'crimson', give: (g) => { g.setCosmetic('crimson'); } },
  { id: 'skin_ocean', name: 'Tidal Avatar', desc: 'COSMETIC: deep-sea blue, cool glow', cost: 40, once: true, cosmetic: 'ocean', give: (g) => { g.setCosmetic('ocean'); } },
  { id: 'skin_toxic', name: 'Toxic Avatar', desc: 'COSMETIC: radioactive green shimmer', cost: 45, once: true, cosmetic: 'toxic', give: (g) => { g.setCosmetic('toxic'); } },
  { id: 'skin_void', name: 'Void Avatar', desc: 'COSMETIC: a walking starfield', cost: 75, once: true, cosmetic: 'void', give: (g) => { g.setCosmetic('void'); } },
];

/* ---------------- SKILL TREE (spend a point each level) ---------------- */
const SKILL_MAX = 10;
const SKILLS = [
  { id: 'vitality', name: 'Vitality', icon: '❤', per: 8,    unit: 'HP',       desc: '+8 max HP per rank' },
  { id: 'power',    name: 'Power',    icon: '⚔', per: 0.06, unit: '% dmg',    desc: '+6% weapon damage per rank' },
  { id: 'mining',   name: 'Mining',   icon: '⛏', per: 0.08, unit: '% speed',  desc: '+8% mining speed per rank' },
  { id: 'agility',  name: 'Agility',  icon: '👟', per: 0.04, unit: '% move',   desc: '+4% movement speed per rank' },
  { id: 'fortune',  name: 'Fortune',  icon: '◆', per: 0.05, unit: '% gems',   desc: '+5% gem drops per rank' },
];
const DIFFICULTIES = {
  chill:    { name: 'CHILL',    dmg: 0.6, xp: 0.9,  desc: 'Enemies hit for 60% — relax and build.' },
  normal:   { name: 'NORMAL',   dmg: 1.0, xp: 1.0,  desc: 'The intended experience.' },
  hardcore: { name: 'HARDCORE', dmg: 1.7, xp: 1.25, desc: 'Enemies hit for 170%, but +25% XP.' },
};

/* ---------------- REMAPPABLE ACTION KEYS ---------------- */
// panel/action keys the player can rebind (movement stays fixed with arrow aliases)
const DEFAULT_KEYS = { inv: 'e', shop: 'b', codex: 'c', quest: 'q', worlds: 'v', ach: 'g', guild: 'h', store: 'k', skills: 't', trade: 'y', sheet: 'j', wardrobe: 'u', emote: 'o', pause: 'p' };
const KEY_LABELS = { inv: 'Inventory', shop: 'Shop', codex: 'Splice codex', quest: 'Quests', worlds: 'Worlds', ach: 'Achievements', guild: 'Guild', store: 'Shard store', skills: 'Skill tree', trade: 'Trade', sheet: 'Character sheet', wardrobe: 'Wardrobe', emote: 'Emotes', pause: 'Pause / settings' };
const RESERVED_KEYS = { a: 1, d: 1, w: 1, s: 1, ' ': 1, shift: 1, escape: 1, arrowleft: 1, arrowright: 1, arrowup: 1, arrowdown: 1, '1': 1, '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '7': 1, '8': 1, '9': 1 };
// emotes — Growtopia/Pixel-Worlds-style animated gestures
const EMOTES = [
  { id: 'wave', name: 'Wave', emoji: '👋', dur: 1.4 },
  { id: 'dance', name: 'Dance', emoji: '🕺', dur: 3.2 },
  { id: 'cheer', name: 'Cheer', emoji: '🎉', dur: 1.8 },
  { id: 'laugh', name: 'Laugh', emoji: '😂', dur: 1.6 },
  { id: 'love', name: 'Love', emoji: '❤️', dur: 1.8 },
  { id: 'cry', name: 'Cry', emoji: '😢', dur: 1.8 },
  { id: 'angry', name: 'Angry', emoji: '😡', dur: 1.6 },
  { id: 'sit', name: 'Sit', emoji: '🪑', dur: 3.5 },
];
const EMOTES_MAP = {}; for (const e of EMOTES) EMOTES_MAP[e.id] = e;
// earnable player titles shown on the nameplate (Growtopia titles)
const TITLES = [
  { id: 'novice', name: 'Novice', desc: 'Everyone starts here.', cond: () => true },
  { id: 'slayer', name: 'Boss Slayer', desc: 'Purge any corrupted process.', cond: g => Object.keys(g.progress.beaten).filter(b => !WORLD_BOSSES[b]).length >= 1 },
  { id: 'splicer', name: 'Master Splicer', desc: 'Discover 100 splice recipes.', cond: g => Object.keys(g.progress.discovered || {}).length >= 100 },
  { id: 'fashionista', name: 'Fashionista', desc: 'Own 30 cosmetics.', cond: g => Object.keys(g.progress.ownedCosmetics || {}).length >= 30 },
  { id: 'tycoon', name: 'the Tycoon', desc: 'Hold 5,000 gems.', cond: g => g.gems >= 5000 },
  { id: 'guildmaster', name: 'Guild Master', desc: 'Belong to a guild.', cond: g => !!g.progress.guild },
  { id: 'purifier', name: 'the Purifier', desc: 'Purge all seven sector bosses.', cond: g => ['firewall_daemon', 'null_wurm', 'kraken', 'storm_kernel', 'rootkit', 'admin', 'swarm_queen'].every(b => g.progress.beaten[b]) },
  { id: 'worldender', name: 'World-Ender', desc: 'Defeat a world boss.', cond: g => Object.keys(WORLD_BOSSES).some(b => g.progress.beaten[b]) },
  { id: 'founder', name: 'Founder', desc: 'A founding player.', cond: g => !!g.progress.founder },
];
const TITLES_MAP = {}; for (const t of TITLES) TITLES_MAP[t.id] = t;
// world bosses — endgame arenas gated behind N sector-boss clears; each drops a strong set
const WORLD_BOSSES = {
  overseer:  { need: 3, setName: 'Overseer', pieces: ['overseer_halo', 'overseer_cape', 'overseer_blade'] },
  archivist: { need: 5, setName: 'Archivist', pieces: ['archivist_crown', 'archivist_wings', 'archivist_quill'] },
  sovereign: { need: 7, setName: 'Null Sovereign', pieces: ['sovereign_crown', 'sovereign_mantle', 'sovereign_scepter'] },
  omega: { needWorld: true, setName: 'Omega', pieces: ['omega_crown', 'omega_wings', 'omega_blade'] },
};
// seasonal / limited events (real-calendar windows). Reward sets only drop while live.
const EVENTS = [
  { id: 'bloomfall', name: 'BLOOMFALL', from: [2, 1], to: [4, 31], set: 'bloom', setName: 'Bloomfall', pieces: ['petal_crown', 'petal_wings', 'bloom_aura'] }, // Mar 1 – May 31
  { id: 'solstice', name: 'SOLSTICE SURGE', from: [5, 1], to: [8, 30], set: 'frostfire', setName: 'Frostfire', pieces: ['frostfire_crown', 'frostfire_wings', 'frostfire_aura'] }, // Jun 1 – Sep 30
  { id: 'hallow', name: "HALLOW'S END", from: [9, 1], to: [10, 15], set: 'hallow', setName: "Hallow's End", pieces: ['pumpkin_hat', 'spectre_cloak', 'pumpkin_lantern'] }, // Oct 1 – Nov 15
  { id: 'newyear', name: 'NEW YEAR BASH', from: [11, 28], to: [0, 3], set: 'newyear', setName: 'New Year', pieces: ['ny_crown', 'ny_wings', 'ny_aura'] }, // Dec 28 – Jan 3 (wraps, wins over Winterburn)
  { id: 'winterburn', name: 'WINTERBURN', from: [10, 16], to: [1, 29], set: 'frostfire', setName: 'Frostfire', pieces: ['frostfire_crown', 'frostfire_wings', 'frostfire_aura'] }, // Nov 16 – Feb 29 (wraps)
];

/* ---------------- TRADING (Data Broker barter window) ---------------- */
// items the broker offers to trade you (infinite stock; priced above their sell value)
const TRADER_STOCK = ['dirt_seed', 'stone_seed', 'wood_seed', 'sand_seed', 'medkit', 'bomb', 'fishing_rod',
  'firework', 'mystery_seed', 'crystal_cluster', 'speed_boots', 'glider_wings', 'drone_pet', 'world_lock'];

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
    this.shards = 0; this.companions = []; this.dungeon = null; this.trade = null;
    this.buff = null;
    this.ownedWorlds = {};   // name -> World instance
    this.spire = null;       // wave-defense state
    this.defrag = null;      // minigame state (owned by ui)
    this.merchant = null; this._merchantT = 60 + Math.random() * 120;
    this._rainT = 150 + Math.random() * 150; this.rain = 0;
    this.boss = null; this.bossDefeatedThisVisit = false;
    this.fx = new FXSystem();
    this.sfx = new SFX();
    this.progress = { beaten: {}, discovered: {}, tutorial: 0, quests: {}, achievements: {}, stats: Object.assign({}, STATS_DEFAULT), rushDone: false, streak: 0, lastLogin: '', skills: {}, skillPoints: 0, difficulty: 'normal', sfxVol: 0.8, sfxMuted: false, playerName: '', avatarColor: '#4361ee', keys: Object.assign({}, DEFAULT_KEYS), bloom: true, wardrobe: { hat: null, face: null, hair: null, back: null, shirt: null, hand: null, aura: null }, dyes: {}, loadouts: [], title: 'novice', ownedCosmetics: { cap: 1, round_glasses: 1 } };
    this._rebinding = null;
    this.paused = false;
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
      const k = e.key.toLowerCase();
      // capture a key when rebinding from the settings screen
      if (this._rebinding) { e.preventDefault(); this.rebindKey(this._rebinding, k); this._rebinding = null; if (ui.renderSettings) ui.renderSettings(); return; }
      if (e.repeat) return;
      if (k === 'a' || k === 'arrowleft') this.input.left = true;
      if (k === 'd' || k === 'arrowright') this.input.right = true;
      if (k === ' ' || k === 'arrowup') { this.input.jump = true; this.input.jumpPressed = true; e.preventDefault(); }
      if (k === 'w') { if (!this.tryPortal()) { this.input.jump = true; this.input.jumpPressed = true; } }
      if (k === 'shift') this.input.dashPressed = true;
      if (k === 's' || k === 'arrowdown') { this.input.down = true; this.tryTeleport(); }
      if (k >= '1' && k <= '9') { this.player.sel = +k - 1; ui.dirty = true; }
      if (k === 'escape') { ui.closeAll(); this.paused = false; return; }
      // remappable action keys
      const km = this.progress.keys || DEFAULT_KEYS;
      for (const act in km) { if (km[act] === k) { this.doAction(act); break; } }
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

  /* ---------------- skill tree ---------------- */
  skillRank(id) { return (this.progress.skills && this.progress.skills[id]) || 0; }
  skillMult(id) { const s = SKILLS.find(k => k.id === id); return s ? 1 + this.skillRank(id) * s.per : 1; }
  skillHp() { return this.skillRank('vitality') * 8; }
  spendSkill(id) {
    if ((this.progress.skillPoints || 0) <= 0) { this.toast('No skill points. Level up to earn them.', 'warn'); return false; }
    if (this.skillRank(id) >= SKILL_MAX) { this.toast('That skill is maxed.', 'warn'); return false; }
    this.progress.skills = this.progress.skills || {};
    this.progress.skills[id] = this.skillRank(id) + 1;
    this.progress.skillPoints--;
    const s = SKILLS.find(k => k.id === id);
    this.toast('▲ ' + s.name + ' rank ' + this.progress.skills[id] + '!', 'gold');
    this.sfx.play('buy');
    this.player.recomputeSoon = true;
    this.save(); ui.updateHUD();
    return true;
  }

  /* ---------------- difficulty ---------------- */
  difficulty() { return DIFFICULTIES[this.progress.difficulty] || DIFFICULTIES.normal; }
  diffMult() { return this.difficulty().dmg; }
  setDifficulty(d) { if (DIFFICULTIES[d]) { this.progress.difficulty = d; this.toast('Difficulty: ' + DIFFICULTIES[d].name, 'gold'); this.save(); if (typeof ui !== 'undefined' && ui.renderSettings) ui.renderSettings(); } }

  /* ---------------- graphics settings ---------------- */
  toggleBloom() { this.progress.bloom = !this.progress.bloom; this.save(); if (typeof ui !== 'undefined' && ui.renderSettings) ui.renderSettings(); }

  /* ---------------- audio settings ---------------- */
  setVolume(v) { v = Math.max(0, Math.min(1, v)); this.sfx.vol = v; this.progress.sfxVol = v; this.save(); }
  toggleMute() { this.sfx.muted = !this.sfx.muted; this.progress.sfxMuted = this.sfx.muted; if (!this.sfx.muted) this.sfx.play('buy'); this.save(); if (typeof ui !== 'undefined' && ui.renderSettings) ui.renderSettings(); }

  /* ---------------- player profile ---------------- */
  playerName() { return (this.progress.playerName || '').trim() || 'Player'; }
  setProfile(name, color) {
    const clean = (name || '').trim().slice(0, 14).replace(/[<>]/g, '');
    this.progress.playerName = clean || 'Player';
    if (color) this.progress.avatarColor = color;
    this.save();
  }

  /* ---------------- keybinds ---------------- */
  doAction(a) {
    if (a === 'trade') this.toggleTrade();
    else if (a === 'pause') this.togglePause();
    else ui.togglePanel(a);
  }
  beginRebind(act) { this._rebinding = act; if (ui.renderSettings) ui.renderSettings(); }
  rebindKey(act, k) {
    if (k === 'escape') return;             // cancel
    if (RESERVED_KEYS[k]) { this.toast('That key is reserved for movement/hotbar.', 'warn'); return; }
    this.progress.keys = this.progress.keys || Object.assign({}, DEFAULT_KEYS);
    // if another action already uses this key, swap them
    for (const other in this.progress.keys) {
      if (other !== act && this.progress.keys[other] === k) this.progress.keys[other] = this.progress.keys[act];
    }
    this.progress.keys[act] = k;
    this.toast('Bound ' + (KEY_LABELS[act] || act) + ' to [' + k.toUpperCase() + ']', 'gold');
    this.save();
  }

  /* ---------------- pause ---------------- */
  togglePause() {
    ui.togglePanel('settings');
    this.paused = !ui.el.settingsPanel.classList.contains('hidden');
  }

  /* ---------------- trading (Data Broker) ---------------- */
  brokerPrice(id) { // what the broker charges you for one of its items
    const shop = SHOP.find(s => s.id === id);
    if (shop) return shop.price;
    return Math.max(4, Math.ceil((sellPrice(id) || 2) * 2.6));
  }
  toggleTrade() {
    const open = !ui.el.tradePanel.classList.contains('hidden');
    if (!open) this.trade = { give: {}, get: {}, giveGems: 0, getGems: 0 };
    ui.togglePanel('trade');
  }
  tradeVal(side) {
    const t = this.trade; if (!t) return 0;
    let v = side === 'give' ? t.giveGems : t.getGems;
    const map = side === 'give' ? t.give : t.get;
    for (const id in map) v += (side === 'give' ? (sellPrice(id) || 1) : this.brokerPrice(id)) * map[id];
    return v;
  }
  tradeAdd(side, id) {
    const t = this.trade; if (!t) return;
    if (side === 'give') { if ((this.player.count(id) || 0) > (t.give[id] || 0)) t.give[id] = (t.give[id] || 0) + 1; }
    else t.get[id] = (t.get[id] || 0) + 1;
    ui.renderTrade();
  }
  tradeRemove(side, id) {
    const t = this.trade; if (!t) return;
    const m = side === 'give' ? t.give : t.get;
    if (m[id]) { m[id]--; if (m[id] <= 0) delete m[id]; }
    ui.renderTrade();
  }
  tradeGems(side, delta) {
    const t = this.trade; if (!t) return;
    if (side === 'give') t.giveGems = Math.max(0, Math.min(this.gems, t.giveGems + delta));
    else t.getGems = Math.max(0, t.getGems + delta);
    ui.renderTrade();
  }
  tradeConfirm() {
    const t = this.trade; if (!t) return;
    const gv = this.tradeVal('give'), gt = this.tradeVal('get');
    const hasGive = Object.keys(t.give).length || t.giveGems;
    const hasGet = Object.keys(t.get).length || t.getGems;
    if (!hasGive || !hasGet) { this.toast('Put an offer on both sides of the trade.', 'warn'); return; }
    if (t.giveGems > this.gems) { this.toast('You don\'t have that many gems.', 'warn'); return; }
    if (gv < gt) { this.toast('The broker declines — your offer (◆' + gv + ') is worth less than theirs (◆' + gt + ').', 'warn'); return; }
    for (const id in t.give) this.player.take(id, t.give[id]);
    if (t.giveGems) { this.gems -= t.giveGems; }
    for (const id in t.get) this.player.give(id, t.get[id]);
    if (t.getGems) { this.gems += t.getGems; }
    this.progress.stats.trades = (this.progress.stats.trades || 0) + 1;
    this.toast('✔ Trade complete with the Data Broker.', 'gold');
    this.sfx.play('buy');
    this.trade = { give: {}, get: {}, giveGems: 0, getGems: 0 };
    this.save(); ui.updateHUD(); ui.renderTrade();
  }

  /* ---------------- economy / spawning ---------------- */
  guildPerks() { return this.progress.guild ? guildPerks(this.progress.guild.level) : { gemBonus: 0, xpBonus: 0, hpBonus: 0 }; }
  addShards(n) { this.shards = Math.max(0, this.shards + n); ui.updateHUD(); }
  addGems(n) {
    if (n > 0 && this.progress.overdrive) n = Math.round(n * 2);
    if (n > 0) n = Math.round(n * (1 + this.guildPerks().gemBonus) * this.skillMult('fortune')); // guild + fortune skill
    this.gems = Math.max(0, this.gems + n);
    if (n > 0) {
      this.progress.stats.gemsEarned += n;
      if (this.player.gearFx('greed')) this.addXp(Math.max(1, Math.ceil(n / 4)));
    }
    ui.updateHUD();
  }

  /* ---------------- guilds ---------------- */
  foundGuild(rawName) {
    const name = (rawName || '').trim().slice(0, 20);
    if (!name) { this.toast('Name your guild first.', 'warn'); return false; }
    if (this.progress.guild) { this.toast('You already lead a guild.', 'warn'); return false; }
    if (this.gems < 500) { this.toast('Founding a guild costs ◆500.', 'warn'); return false; }
    this.addGems(-500);
    this.progress.guild = { name, level: 1, xp: 0 };
    this.toast('⚑ GUILD FOUNDED: ' + name + '! Contribute gems to level it up.', 'gold');
    this.sfx.play('victory');
    this.save();
    return true;
  }
  contributeGuild(amount) {
    const g = this.progress.guild;
    if (!g) return;
    amount = Math.min(amount, this.gems);
    if (amount <= 0) { this.toast('Not enough gems to contribute.', 'warn'); return; }
    this.addGems(-amount);
    g.xp += amount;
    let leveled = false;
    while (g.xp >= guildXpNeed(g.level)) { g.xp -= guildXpNeed(g.level); g.level++; leveled = true; }
    if (leveled) {
      this.toast('⚑ ' + g.name + ' reached guild level ' + g.level + '! Perks improved.', 'gold');
      if (g.level % 5 === 0) this.toast('⚔ Guild milestone: a free ally slot unlocked!', 'gold');
      this.sfx.play('victory');
      this.fx.explode(this.player.x, this.player.y, '#c77dff', 24);
      this.respawnCompanions(); // new free ally slots take effect
    } else this.toast('Contributed ◆' + amount + ' to ' + g.name + '.', '');
    this.save();
  }

  /* ---------------- AI companions (the co-op roster) ---------------- */
  // total ally slots = hired allies (from the store) + free guild slots (1 per 5 levels)
  allyCap() {
    const hired = (this.progress.allySlots || 0);
    const guildFree = this.progress.guild ? Math.floor(this.progress.guild.level / 5) : 0;
    return Math.min(4, hired + guildFree);
  }
  // (re)build the live roster to match the cap, positioning members behind the player
  respawnCompanions() {
    const cap = this.allyCap();
    const p = this.player;
    this.companions = [];
    for (let i = 0; i < cap; i++) this.companions.push(new Companion(p.x - p.facing * (40 + i * 34), p.y, i));
  }
  // buying "Hire a Comrade" permanently adds a roster slot
  summonCompanion() {
    this.progress.allySlots = (this.progress.allySlots || 0) + 1;
    this.respawnCompanions();
    const n = this.companions.length;
    this.toast('⚔ Comrade hired! Your roster is now ' + n + ' all' + (n === 1 ? 'y' : 'ies') + '. They fight beside you and revive when downed.', 'gold');
    this.fx.explode(this.player.x, this.player.y, '#2de2a3', 20);
    this.sfx.play('victory');
    this.save();
  }

  /* ---------------- DUNGEONS (procedural multi-room crawls) ---------------- */
  updateDungeon(dt) {
    const d = this.dungeon, w = this.world;
    if (!d || !w.isDungeon) return;
    // advance when the current room is cleared of enemies
    if (d.room < d.rooms.length && !this.enemies.some(e => !e.dead) && this.player.x > d.rooms[d.room].openAt) {
      const r = d.rooms[d.room];
      // open the door to the next room
      for (let y = 2; y < w.h - 2; y++) if (w.get(r.doorCol, y) === 'gate') w.set(r.doorCol, y, null);
      this.fx.puff(r.doorCol * TS, this.player.y, '#c77dff');
      this.sfx.play('splice');
      d.room++;
      if (d.room < d.rooms.length) {
        const nr = d.rooms[d.room];
        const label = { treasure: '💰 TREASURE VAULT', gauntlet: '⚠ TRAP GAUNTLET', elite: '★ ELITE CHAMBER', combat: 'Room' }[nr.type] || 'Room';
        this.toast('Room cleared! ' + label + ' — ' + (d.room + 1) + ' of ' + d.rooms.length + ' unlocked.', 'gold');
        this.spawnRoom(nr);
      } else {
        // final room: themed guardian
        this.toast('⚠ FINAL CHAMBER — the guardian awakens!', 'warn');
        const gLvl = 2 + Math.floor(this.bossKillCount / 2);
        this.enemies.push(new Enemy(w.dungeonBoss || 'warden', (w.w - 8) * TS, (d.floorY - 3) * TS, gLvl, { elite: this.bossKillCount >= 3 }));
        this.sfx.play('bossroar');
        d.bossSpawned = true;
      }
    }
    // reward on the guardian's death
    if (d.bossSpawned && !d.done && !this.enemies.some(e => !e.dead)) {
      d.done = true;
      const reward = 200 + d.rooms.length * 60;
      this.spawnGems(this.player.x, this.player.y - 30, reward);
      this.addShards(3);
      this.addXp(150);
      this.spawnDrop(this.player.x, this.player.y, 'corrupted_drive', 1);
      if (Math.random() < 0.4) this.spawnDrop(this.player.x, this.player.y, 'world_lock', 1);
      this.progress.stats.dungeons = (this.progress.stats.dungeons || 0) + 1;
      this.toast('★ DUNGEON CLEARED! +' + reward + ' ◆, +3 ◈ Shards, loot dropped!', 'gold');
      this.sfx.play('victory');
      this.save();
    }
  }
  spawnRoom(r) {
    const w = this.world;
    const pool = r.pool || ['glitchling', 'ember', 'drone', 'zapper', 'spitter', 'brute', 'shielder'];
    const lvl = 1 + Math.floor(this.bossKillCount / 2);
    // elite chambers spawn one buffed elite among the pack
    if (r.type === 'elite') {
      const et = pool[Math.floor(Math.random() * pool.length)];
      this.enemies.push(new Enemy(et, (r.x0 + r.w / 2) * TS, (this.dungeon.floorY - 3) * TS, lvl + 1, { elite: true }));
    }
    for (let k = 0; k < r.count; k++) {
      const type = pool[Math.floor(Math.random() * pool.length)];
      this.enemies.push(new Enemy(type, (r.x0 + 3 + Math.random() * (r.w - 6)) * TS, (this.dungeon.floorY - 2) * TS, lvl));
    }
  }

  // equip a cosmetic skin (from a purchase, or re-selecting an owned one; null clears it)
  setCosmetic(c) {
    this.progress.cosmetic = c;
    if (c) this.fx.explode(this.player.x, this.player.y, '#ffd166', 16);
    this.save();
    if (typeof ui !== 'undefined') { ui.renderStore && ui.renderStore(); }
  }

  /* ---------------- wardrobe (layered accessories) ---------------- */
  ownsCosmetic(id) { return !!(this.progress.ownedCosmetics && this.progress.ownedCosmetics[id]); }
  grantCosmetic(id, quiet) {
    if (typeof COSMO === 'undefined' || !COSMO[id]) return;
    this.progress.ownedCosmetics = this.progress.ownedCosmetics || {};
    if (this.progress.ownedCosmetics[id]) return;
    this.progress.ownedCosmetics[id] = 1;
    this.save();
    if (!quiet) {
      this.toast('✦ Unlocked cosmetic: ' + COSMO[id].name + '! Equip it in the Wardrobe [' + (this.progress.keys.wardrobe || 'U').toUpperCase() + ']', 'gold');
      this.sfx && this.sfx.play('victory');
    }
  }
  /* ---------------- mystery cosmetic chest (gacha) ---------------- */
  mysteryChestCost() { return 10; }
  openMysteryChest() {
    const cost = this.mysteryChestCost();
    if (this.shards < cost) { this.toast('Not enough Shards (◈' + cost + ') for a Mystery Chest.', 'warn'); return; }
    // pool: buyable (store/starter) cosmetics you don't already own, weighted so commons are likelier
    const pool = (typeof COSMETICS !== 'undefined') ? COSMETICS.filter(c => (c.src === 'store' || c.src === 'start') && !this.ownsCosmetic(c.id)) : [];
    this.addShards(-cost);
    if (!pool.length) { this.addGems(500); this.toast('🎁 You already own every chest cosmetic — 500 ◆ gems instead!', 'gold'); this.sfx && this.sfx.play('buy'); this.save(); return; }
    const weighted = [];
    for (const c of pool) { const w = Math.max(1, 6 - (typeof cosTier === 'function' ? cosTier(c) : 1)); for (let i = 0; i < w; i++) weighted.push(c); }
    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    this.grantCosmetic(pick.id, true);
    this._chestReveal = pick.id;
    const tc = (typeof TIER_COLORS !== 'undefined') ? (TIER_COLORS[cosTier(pick)] || '#ffd166') : '#ffd166';
    const tn = (typeof TIER_NAMES !== 'undefined') ? (TIER_NAMES[cosTier(pick)] || 'COMMON') : 'COMMON';
    this.fx.explode(this.player.x, this.player.y - 16, tc, 34);
    this.sfx && this.sfx.play('victory');
    this.toast('🎁 Mystery Chest → ' + pick.name + ' · ' + tn + '!', 'gold');
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  buyCosmetic(id) {
    const c = (typeof COSMO !== 'undefined') ? COSMO[id] : null;
    if (!c) return;
    if (this.ownsCosmetic(id)) { this.equipCosmetic(id); return; }
    if (c.src !== 'store') { this.toast('That cosmetic is unlocked by playing, not bought.', 'warn'); return; }
    const cost = c.cost || 0;
    if (this.shards < cost) { this.toast('Not enough Shards (◈' + cost + '). Earn them from bosses/achievements or the daily grant.', 'warn'); return; }
    this.addShards(-cost);
    this.grantCosmetic(id, true);
    this.equipCosmetic(id);
    this.toast('◈ Purchased & equipped: ' + c.name + '!', 'gold');
    this.sfx && this.sfx.play('buy');
    this.save();
  }
  equipCosmetic(id) {
    const c = (typeof COSMO !== 'undefined') ? COSMO[id] : null;
    if (!c || !this.ownsCosmetic(id)) return;
    this.progress.wardrobe = this.progress.wardrobe || { hat: null, face: null, back: null };
    // toggle off if already worn
    if (this.progress.wardrobe[c.slot] === id) this.progress.wardrobe[c.slot] = null;
    else this.progress.wardrobe[c.slot] = id;
    this.fx.explode(this.player.x, this.player.y, '#8ecae6', 12);
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  unequipSlot(slot) {
    this.progress.wardrobe = this.progress.wardrobe || { hat: null, face: null, back: null };
    this.progress.wardrobe[slot] = null;
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  // dyes: a per-slot hue-rotation (degrees, or 'rainbow' to cycle) recolours whatever is worn
  setDye(slot, hue) {
    this.progress.dyes = this.progress.dyes || {};
    if (hue == null) delete this.progress.dyes[slot]; else this.progress.dyes[slot] = hue;
    this.fx.explode(this.player.x, this.player.y, hue === 'rainbow' ? '#c77dff' : 'hsl(' + (hue || 0) + ',80%,60%)', 10);
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  /* ---------------- outfit loadout presets ---------------- */
  saveLoadout(name) {
    name = (name || '').trim().slice(0, 18) || ('Outfit ' + ((this.progress.loadouts || []).length + 1));
    this.progress.loadouts = this.progress.loadouts || [];
    if (this.progress.loadouts.length >= 8) { this.toast('Loadout slots full (8). Delete one first.', 'warn'); return false; }
    this.progress.loadouts.push({
      name,
      wardrobe: Object.assign({}, this.progress.wardrobe),
      dyes: Object.assign({}, this.progress.dyes),
    });
    this.toast('💾 Outfit saved: ' + name, 'gold');
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
    return true;
  }
  applyLoadout(i) {
    const lo = (this.progress.loadouts || [])[i]; if (!lo) return;
    // only equip cosmetics the player actually owns
    const wr = { hat: null, face: null, hair: null, back: null, shirt: null, hand: null, aura: null };
    for (const slot in wr) { const id = lo.wardrobe[slot]; if (id && this.ownsCosmetic(id)) wr[slot] = id; }
    this.progress.wardrobe = wr;
    this.progress.dyes = Object.assign({}, lo.dyes || {});
    this.fx.explode(this.player.x, this.player.y, '#8ecae6', 16);
    this.sfx && this.sfx.play('place');
    this.toast('Wearing: ' + lo.name, 'gold');
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  deleteLoadout(i) {
    if (!this.progress.loadouts) return;
    this.progress.loadouts.splice(i, 1);
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  /* ---------------- emotes ---------------- */
  playEmote(id) {
    const e = EMOTES_MAP[id]; if (!e || !this.player) return;
    this.player.emote = { id, t: 0, dur: e.dur };
    this.sfx && this.sfx.play('place');
  }
  /* ---------------- titles ---------------- */
  titleUnlocked(id) { const t = TITLES_MAP[id]; return t ? !!t.cond(this) : false; }
  titleName() {
    const id = this.progress.title || 'novice';
    return (TITLES_MAP[id] && this.titleUnlocked(id)) ? TITLES_MAP[id].name : '';
  }
  setTitle(id) {
    if (id && !this.titleUnlocked(id)) { this.toast('That title is still locked.', 'warn'); return; }
    this.progress.title = id || null;
    this.save();
    if (typeof ui !== 'undefined') { ui.renderSheet && ui.renderSheet(); ui.dirty = true; }
  }
  clearWardrobe() {
    this.progress.wardrobe = { hat: null, face: null, hair: null, back: null, shirt: null, hand: null, aura: null };
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  randomizeWardrobe() {
    if (typeof COSMETICS === 'undefined') return;
    const wr = { hat: null, face: null, hair: null, back: null, shirt: null, hand: null, aura: null };
    for (const slot of ['hat', 'face', 'hair', 'back', 'shirt', 'hand', 'aura']) {
      const owned = COSMETICS.filter(c => c.slot === slot && this.ownsCosmetic(c.id));
      if (owned.length) wr[slot] = owned[Math.floor(Math.random() * owned.length)].id;
    }
    this.progress.wardrobe = wr;
    this.fx.explode(this.player.x, this.player.y, '#c77dff', 16);
    this.sfx && this.sfx.play('place');
    this.save();
    if (typeof ui !== 'undefined' && ui.renderWardrobe) ui.renderWardrobe();
  }
  // combat value of the currently-worn cosmetics (rarity-scaled + set bonuses)
  cosmeticStats() {
    const wr = this.progress.wardrobe || {};
    let power = 0; const setCount = {};
    if (typeof COSMO !== 'undefined') {
      for (const slot in wr) {
        const c = COSMO[wr[slot]]; if (!c) continue;
        power += cosPower(c);
        if (c.set) setCount[c.set] = (setCount[c.set] || 0) + 1;
      }
    }
    let set = null;
    if (typeof COSMO_SETS !== 'undefined') {
      for (const s in setCount) { const def = COSMO_SETS[s]; if (def && setCount[s] >= def.need) set = Object.assign({ id: s }, def); }
    }
    let bossDmg = 1 + power * 0.012;                 // ~1.2% boss damage per power point
    let reduce = Math.min(0.30, power * 0.0025);     // up to 30% incoming reduction from power
    if (set) { bossDmg += set.dmg; reduce = Math.min(0.55, reduce + set.reduce); }
    return { power, bossDmg, reduce, set };
  }
  cosmeticBossDmg() { return this.cosmeticStats().bossDmg; }
  cosmeticReduce() { return this.cosmeticStats().reduce; }

  /* ---------------- seasonal / limited events ---------------- */
  activeEvent() {
    const d = new Date(), m = d.getMonth(), day = d.getDate();
    for (const ev of EVENTS) {
      const [fm, fd] = ev.from, [tm, td] = ev.to;
      const after = (m > fm) || (m === fm && day >= fd);
      const before = (m < tm) || (m === tm && day <= td);
      const inWin = (fm <= tm) ? (after && before) : (after || before); // handle wrap (e.g. Dec→Feb)
      if (inWin) return ev;
    }
    return null;
  }
  // one-time founding reward — granted once, ever, per save
  grantFounderReward() {
    if (this.progress.founder) return;
    this.progress.founder = true;
    this.grantCosmetic('founder_halo', true);
    this.save();
    this.toast("✦ ONE-TIME: Founder's Aureole granted — the permanent mark of an early player. Equip it in the Wardrobe [U].", 'gold');
  }
  onWorldBossDefeated(boss) {
    this.bossDefeatedThisVisit = true;
    const wb = WORLD_BOSSES[boss.id];
    const first = !this.progress.beaten[boss.id];
    this.progress.beaten[boss.id] = true;
    this.addShards(first ? 15 : 5);
    this.addXp(500);
    this.spawnGems(boss.x, boss.y, 300);
    // world-boss loot: its signature set (strong)
    for (const pid of wb.pieces) this.grantCosmetic(pid);
    this.toast('★★★ ' + boss.meta.name + ' FALLS — the ' + wb.setName + ' world-boss set is yours! (+' + (first ? 15 : 5) + ' ◈)', 'gold');
    // limited seasonal loot — only while an event is live
    const ev = this.activeEvent();
    if (ev) {
      for (const pid of ev.pieces) this.grantCosmetic(pid, true);
      this.toast('✦ LIMITED — the ' + ev.setName + ' set dropped! Only obtainable during the ' + ev.name + ' event.', 'gold');
    }
    this.fx.explode(boss.x, boss.y, '#ff2e63', 60);
    setTimeout(() => { this.boss = null; ui.bossBar(null); }, 100);
    this.save();
  }

  /* ---------------- shard store (simulated purchases) ---------------- */
  buyStore(id) {
    const item = STORE.find(s => s.id === id);
    // re-selecting an already-owned cosmetic just equips it (free)
    if (item && item.cosmetic && (this.progress.storeBought || {})[id]) { this.setCosmetic(item.cosmetic); this.toast('Equipped: ' + item.name, 'gold'); return; }
    if (!item) return;
    if (item.once && (this.progress.storeBought || {})[id]) { this.toast('Already owned.', 'warn'); return; }
    if (this.shards < item.cost) { this.toast('Not enough Shards (◈' + item.cost + '). Earn them from bosses/achievements or the daily grant.', 'warn'); return; }
    this.addShards(-item.cost);
    item.give(this);
    this.progress.storeBought = this.progress.storeBought || {};
    if (item.once) this.progress.storeBought[id] = true;
    this.toast('◈ Purchased: ' + item.name + '!', 'gold');
    this.sfx.play('buy');
    this.save();
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
    n = Math.max(1, Math.round(n * (this.player.gearFx('xpMult') || 1) * (this.player.xpAuraM || 1) * (1 + this.guildPerks().xpBonus) * this.difficulty().xp));
    this.xp += n;
    while (this.xp >= this.xpNeed()) {
      this.xp -= this.xpNeed();
      this.level++;
      this.progress.skillPoints = (this.progress.skillPoints || 0) + 1; // earn a skill point each level
      this.player.maxHp = 100 + (this.level - 1) * 3;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 30);
      this.toast('▲ LEVEL UP! Level ' + this.level + ' — +3 max HP, +1 skill point [T]', 'gold');
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
    this.merchant = null; this.spire = null; this.dungeon = null;
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
    } else if (id === 'dungeon') {
      this.world = World.genDungeon(this.bossKillCount);
      this.dungeon = { rooms: this.world.dungeonRooms, floorY: this.world.dungeonFloorY, room: 0, bossSpawned: false, done: false };
      this.toast(this.world.name + ' — clear each room to open the next. Treasure, gauntlet & elite chambers await. Bring allies (Shard Store) for co-op!', 'warn');
      setTimeout(() => { if (this.dungeon) this.spawnRoom(this.dungeon.rooms[0]); }, 300);
    } else if (id === 'spire') {
      this.world = World.genSpire();
      this.spire = { wave: 0, betweenT: 4, active: false };
      this.toast('BLACK SPIRE — survive escalating waves. Leave through the exit between waves.', 'warn');
    } else if (WORLD_BOSSES[id]) {
      this.world = id === 'omega' ? World.genOmega() : id === 'archivist' ? World.genArchivist() : id === 'sovereign' ? World.genSovereign() : World.genOverseer();
      const ev = this.activeEvent();
      this.toast('⚠ ' + this.world.name + ' — a world boss of another magnitude. Approach to begin the fight.', 'warn');
      if (ev) this.toast('✦ ' + ev.name + ' EVENT is LIVE — defeat it now to claim the limited ' + ev.setName + ' set!', 'gold');
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
    this.respawnCompanions();
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
    // special: world bosses (endgame — each gated behind N sector-boss clears, or all world bosses for OMEGA)
    if (WORLD_BOSSES[name]) {
      const wb = WORLD_BOSSES[name];
      if (wb.needWorld) {
        const others = Object.keys(WORLD_BOSSES).filter(b => b !== name && !WORLD_BOSSES[b].needWorld);
        if (!others.every(b => this.progress.beaten[b])) {
          this.toast('OMEGA.EXE is sealed. Defeat the OVERSEER, ARCHIVIST and NULL SOVEREIGN first.', 'warn');
          return false;
        }
      } else {
        const sectorKills = Object.keys(this.progress.beaten).filter(b => !WORLD_BOSSES[b]).length;
        if (sectorKills < wb.need) {
          this.toast('You are not ready for ' + name.toUpperCase() + '. Purge at least ' + wb.need + ' corrupted processes first.', 'warn');
          return false;
        }
      }
      this.enterWorld(name); return true;
    }
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

  /* ---------------- login reward calendar ---------------- */
  checkLoginReward() {
    const today = new Date().toDateString();
    this.progress.login = this.progress.login || { day: 0, last: '', streak: 0 };
    const lg = this.progress.login;
    if (lg.last === today) { this._loginPending = false; return; }
    const yesterday = new Date(Date.now() - 864e5).toDateString();
    lg.day = (lg.last === yesterday) ? (lg.day % 7) + 1 : 1; // continue the cycle or restart
    this._loginPending = true;
    this.save();
  }
  claimLoginReward() {
    if (!this._loginPending) return;
    const lg = this.progress.login;
    const r = LOGIN_REWARDS[(lg.day - 1) % 7];
    if (r.gems) this.addGems(r.gems);
    if (r.shards) this.addShards(r.shards);
    if (r.items) for (const [id, n] of r.items) this.player.give(id, n);
    lg.last = new Date().toDateString();
    lg.streak = (lg.streak || 0) + 1;
    this._loginPending = false;
    this.toast('🎁 Login day ' + lg.day + ' claimed: ' + r.label + '! (streak ' + lg.streak + ')', 'gold');
    this.sfx && this.sfx.play('victory');
    this.fx.explode(this.player.x, this.player.y, '#ffd166', 24);
    this.save();
    if (typeof ui !== 'undefined' && ui.renderLogin) ui.renderLogin();
  }

  /* ---------------- daily quests ---------------- */
  rollDailyQuests() {
    const today = new Date().toDateString();
    if (this.progress.daily && this.progress.daily.date === today) return;
    const pool = DAILY_POOL.slice(), pick = [];
    for (let i = 0; i < 3 && pool.length; i++) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    const s = this.progress.stats;
    this.progress.daily = { date: today, allDone: false, tasks: pick.map(t => ({ tid: t.id, base: (s[t.stat] || 0), done: false })) };
    this.save();
  }
  dailyProgress(task) { const t = DAILY_MAP[task.tid]; if (!t) return 0; return Math.max(0, Math.min(t.goal, (this.progress.stats[t.stat] || 0) - task.base)); }
  checkDailies() {
    const d = this.progress.daily; if (!d || !d.tasks) return;
    let all = true;
    for (const task of d.tasks) {
      const t = DAILY_MAP[task.tid]; if (!t) continue;
      if (!task.done && this.dailyProgress(task) >= t.goal) {
        task.done = true;
        if (t.reward.shards) this.addShards(t.reward.shards);
        if (t.reward.gems) this.addGems(t.reward.gems);
        this.addXp(30);
        this.toast('✅ Daily done: ' + t.name + ' (+◈' + (t.reward.shards || 0) + ')', 'gold');
        this.sfx && this.sfx.play('victory');
      }
      if (!task.done) all = false;
    }
    if (all && !d.allDone) {
      d.allDone = true; this.addShards(5); this.addGems(300);
      this.toast('★ All daily quests complete! +5 ◈ +300 ◆. Fresh set tomorrow.', 'gold');
    }
    this.save();
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
        this.addShards(1);
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
    if (WORLD_BOSSES[boss.id]) { this.onWorldBossDefeated(boss); return; }
    const first = !this.progress.beaten[boss.id];
    if (first) {
      this.progress.beaten[boss.id] = true;
      this.addShards(2);
      for (const [id, n] of boss.meta.drops) this.spawnDrop(boss.x, boss.y, id, n);
      this.toast('★ ' + boss.meta.name + ' PURGED! Unique boss tech dropped! (+2 ◈)', 'gold');
      if (boss.id === 'admin') {
        this.toast('THE NETWORK IS LIBERATED. You have root now. Build freely.', 'gold');
      } else {
        this.toast('A new portal has unlocked on your HOME SERVER.', 'gold');
      }
      // --- wardrobe cosmetic unlocks tied to boss progression ---
      const bossesBeaten = Object.keys(this.progress.beaten).length;
      this.grantCosmetic('crown_c');                          // 1 boss → Royal Crown
      if (bossesBeaten >= 2) this.grantCosmetic('pirate_hat'); // 2 → Pirate Tricorn
      if (bossesBeaten >= 3) this.grantCosmetic('cape');       // 3 → Hero Cape
      if (bossesBeaten >= 4) this.grantCosmetic('shirt_armor'); // 4 → Plate Armor
      if (bossesBeaten >= 5) this.grantCosmetic('dragon_wings'); // 5 → Dragon Wings
      if (bossesBeaten >= 6) this.grantCosmetic('hand_katana_c'); // 6 → Spirit Katana
      if (bossesBeaten >= 7) { this.grantCosmetic('cyber_visor'); this.grantCosmetic('aura_rainbow'); } // all 7
      if (boss.id === 'admin') { this.grantCosmetic('halo'); this.grantCosmetic('aura_fire'); this.grantCosmetic('hair_flame'); } // liberate the network
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
        v: 3, gems: this.gems, shards: this.shards, inv: p.inv, hotbar: p.hotbar, equip: p.equip, sel: p.sel,
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
      this.shards = s.shards || 0;
      this.level = s.level || 1;
      this.player.maxHp = 100 + (this.level - 1) * 3;
      this.player.hp = s.hp > 0 ? Math.min(s.hp, this.player.maxHp) : this.player.maxHp;
      this.progress = Object.assign({ beaten: {}, discovered: {}, tutorial: 99, quests: {}, achievements: {}, rushDone: false, streak: 0, lastLogin: '', overdrive: false }, s.progress);
      this.progress.achievements = this.progress.achievements || {};
      this.progress.stats = Object.assign({}, STATS_DEFAULT, this.progress.stats || {});
      this.progress.quests = this.progress.quests || {};
      this.progress.skills = this.progress.skills || {};
      if (typeof this.progress.skillPoints !== 'number') this.progress.skillPoints = 0;
      this.progress.difficulty = this.progress.difficulty || 'normal';
      this.progress.playerName = this.progress.playerName || '';
      this.progress.avatarColor = this.progress.avatarColor || '#4361ee';
      this.progress.keys = Object.assign({}, DEFAULT_KEYS, this.progress.keys || {});
      if (typeof this.progress.bloom !== 'boolean') this.progress.bloom = true;
      this.progress.wardrobe = Object.assign({ hat: null, face: null, hair: null, back: null, shirt: null, hand: null, aura: null }, this.progress.wardrobe || {});
      this.progress.dyes = this.progress.dyes || {};
      this.progress.loadouts = this.progress.loadouts || [];
      this.progress.ownedCosmetics = Object.assign({ cap: 1, round_glasses: 1 }, this.progress.ownedCosmetics || {});
      // apply saved audio settings
      this.sfx.vol = typeof this.progress.sfxVol === 'number' ? this.progress.sfxVol : 0.8;
      this.sfx.muted = !!this.progress.sfxMuted;
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
    setTimeout(() => this.grantFounderReward(), 1800); // one-time founding cosmetic
    this.rollDailyQuests(); // refresh the daily quest set if it's a new day
    this.checkLoginReward();
    if (this._loginPending) setTimeout(() => { ui.togglePanel('login'); }, 1400); // pop the login calendar
    if (this.progress.tutorial !== 0) setTimeout(() => this.toast('Welcome back, ' + this.playerName() + '.', 'gold'), 400);
    // daily login bonus (streaks, like a proper live-service sandbox)
    const today = new Date().toDateString();
    if (this.progress.lastLogin !== today) {
      const yesterday = new Date(Date.now() - 864e5).toDateString();
      this.progress.streak = this.progress.lastLogin === yesterday ? (this.progress.streak || 0) + 1 : 1;
      this.progress.lastLogin = today;
      const bonus = Math.min(50 + (this.progress.streak - 1) * 25, 150);
      this.addGems(bonus);
      this.addShards(3);
      setTimeout(() => this.toast('☀ Daily login: +' + bonus + ' ◆ and +3 ◈ Shards (day ' + this.progress.streak + ' streak)', 'gold'), 1200);
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
    for (const c of this.companions) c.update(dt, w, this);
    this.updateDungeon(dt);

    this.updateFishing(dt);
    for (const k of this.keyPickups) if (!k.dead) k.update(dt, w, this);
    this.keyPickups = this.keyPickups.filter(k => !k.dead);
    for (const z of this.zaps) z.life -= dt;
    this.zaps = this.zaps.filter(z => z.life > 0);

    this._questT += dt;
    if (this._questT > 1.5) { this._questT = 0; this.checkQuests(); this.checkDailies(); }
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
    if (this.boss && !this.boss.dead) {
      // soft menacing glow behind every boss (cheap, universal polish)
      const b = this.boss, bsx = b.x - cam.x, bsy = b.y - cam.y, br = Math.max(b.w, b.h) * (b.phase2 ? 1.1 : 0.9);
      const bgl = ctx.createRadialGradient(bsx, bsy, br * 0.3, bsx, bsy, br);
      const bc = b.phase2 ? '255,60,80' : '255,120,60';
      bgl.addColorStop(0, 'rgba(' + bc + ',' + (0.22 + 0.08 * Math.sin(this.time * 4)) + ')');
      bgl.addColorStop(1, 'rgba(' + bc + ',0)');
      ctx.fillStyle = bgl; ctx.beginPath(); ctx.arc(bsx, bsy, br, 0, 7); ctx.fill();
      // ground shadow under the boss
      ctx.save(); ctx.translate(bsx, bsy + b.h / 2); ctx.scale(1, 0.35);
      const bs = ctx.createRadialGradient(0, 0, 2, 0, 0, b.w * 0.6); bs.addColorStop(0, 'rgba(0,0,0,0.3)'); bs.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bs; ctx.beginPath(); ctx.arc(0, 0, b.w * 0.6, 0, 7); ctx.fill(); ctx.restore();
      this.boss.draw(ctx, cam, this.time);
    }
    if (this.pet) this.pet.draw(ctx, cam, this.time);
    for (const c of this.companions) c.draw(ctx, cam, this.time);
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
    this.postProcess(ctx, cam);   // bloom over the world + effects (before HUD overlays)
    this.drawMinimap(ctx);
    this.drawBuffBadge(ctx);
    this.drawCursor(ctx, cam);
    this.drawScreenFx(ctx, cam);
  }

  // active-buff HUD badge (consumable food/drink timers), under the HP bar
  drawBuffBadge(ctx) {
    if (!this.buffActive()) return;
    const b = this.buff, rem = Math.max(0, b.until - this.time);
    const label = b.gem ? '☘ +50% gems' : (b.speed >= 2 ? '⚡ ADRENALINE' : '⚡ +' + Math.round((b.dmg - 1) * 100) + '% dmg/spd');
    const col = b.gem ? '#3ddc84' : (b.speed >= 2 ? '#ff4d6d' : '#ff9e6d');
    ctx.save();
    ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
    const txt = label + '  ' + rem.toFixed(0) + 's';
    const w = ctx.measureText(txt).width + 16, x = 16, y = 44;
    ctx.fillStyle = 'rgba(8,12,24,0.78)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 20, 6) : ctx.rect(x, y, w, 20); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(txt, x + 8, y + 14);
    ctx.restore();
  }

  // additive bloom: bright-pass the frame at half-res, blur it, add it back so
  // lights, lava, crystals, projectiles and boss effects glow cinematically
  postProcess(ctx, cam) {
    if (this.progress && this.progress.bloom === false) return;
    const vw = cam.view.w, vh = cam.view.h;
    if (!vw || !vh) return;
    const bw = Math.max(1, vw >> 1), bh = Math.max(1, vh >> 1);
    if (!this._bloom || this._bloom.width !== bw || this._bloom.height !== bh) {
      this._bloom = document.createElement('canvas'); this._bloom.width = bw; this._bloom.height = bh;
      this._bloomCtx = this._bloom.getContext('2d');
    }
    const bc = this._bloomCtx;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, bw, bh);
    // bright-pass: downscale + hard contrast so only genuine highlights survive
    try { bc.filter = 'brightness(0.9) contrast(3.2) saturate(1.25)'; } catch (e) {}
    bc.drawImage(this.canvas, 0, 0, bw, bh);
    bc.filter = 'none';
    // additive, blurred composite back over the scene
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    try { ctx.filter = 'blur(5px)'; } catch (e) {}
    ctx.drawImage(this._bloom, 0, 0, vw, vh);
    ctx.filter = 'none';
    ctx.restore();
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
  const $ = (id) => document.getElementById(id);
  const playBtn = $('playBtn');
  const menuInner = $('menuInner'), profileScreen = $('profileScreen'), creditsBox = $('creditsBox');

  // peek at the saved profile name for a personal greeting / continue button
  let savedName = 'Player';
  if (hasSave) { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); savedName = (s.progress && s.progress.playerName) || 'Player'; } catch (e) {} }
  playBtn.textContent = hasSave ? '▶ CONTINUE' : '▶ NEW GAME';
  if (hasSave) {
    $('menuGreet').textContent = 'Welcome back, ' + savedName + '.';
    $('menuGreet').classList.remove('hidden');
    $('newCharBtn').classList.remove('hidden');
  }

  // ---- character-creation state ----
  const PALETTE = ['#4361ee', '#e63946', '#2de2a3', '#ffb703', '#c77dff', '#ff6ec7', '#38d9f5', '#f77f00', '#2a2140', '#e8e8e8'];
  let chosenColor = PALETTE[0];
  const preview = $('avatarPreview'), pctx = preview.getContext('2d');
  pctx.imageSmoothingEnabled = false;
  function drawPreview() {
    pctx.clearRect(0, 0, 88, 104);
    const cx = 44, dk = (h, f) => { const n = parseInt(h.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return 'rgb(' + (r * f | 0) + ',' + (g * f | 0) + ',' + (b * f | 0) + ')'; };
    pctx.fillStyle = dk(chosenColor, 0.4); pctx.fillRect(cx - 12, 74, 10, 22); pctx.fillRect(cx + 2, 74, 10, 22); // legs
    pctx.fillStyle = chosenColor; pctx.fillRect(cx - 16, 40, 32, 36); // body
    pctx.fillStyle = dk(chosenColor, 0.55); pctx.fillRect(cx - 16, 66, 32, 8);
    pctx.fillStyle = '#ffd8b1'; pctx.fillRect(cx - 13, 12, 26, 27); // head
    pctx.fillStyle = '#0d1526'; pctx.fillRect(cx - 3, 20, 18, 10);   // visor
    pctx.fillStyle = '#6ee7ff'; pctx.fillRect(cx + 1, 22, 12, 5);
    pctx.fillStyle = '#e8c49e'; pctx.fillRect(cx + 14, 44, 14, 8);   // arm
  }
  const pal = $('colorPalette');
  PALETTE.forEach((c, i) => {
    const sw = document.createElement('button');
    sw.className = 'swatch' + (i === 0 ? ' on' : ''); sw.style.background = c;
    sw.addEventListener('click', () => { chosenColor = c; pal.querySelectorAll('.swatch').forEach(s => s.classList.remove('on')); sw.classList.add('on'); drawPreview(); });
    pal.appendChild(sw);
  });
  drawPreview();
  $('nameInput').addEventListener('keydown', e => e.stopPropagation());

  function openProfile() { menuInner.classList.add('hidden'); creditsBox.classList.add('hidden'); profileScreen.classList.remove('hidden'); $('nameInput').focus(); }
  function beginGame(newProfile) {
    game.sfx.init();
    if (newProfile) {
      localStorage.removeItem(SAVE_KEY);
      game.newGame();
      game.setProfile($('nameInput').value, chosenColor);
    } else if (!game.load()) {
      game.newGame();
      game.setProfile($('nameInput').value, chosenColor);
    }
    $('menu').classList.add('hidden');
    game.start();
  }

  playBtn.addEventListener('click', () => { if (hasSave) beginGame(false); else openProfile(); });
  $('newCharBtn').addEventListener('click', () => { if (confirm('Start a NEW character? Your current save will be erased.')) openProfile(); });
  $('profileGo').addEventListener('click', () => beginGame(true));
  $('profileBack').addEventListener('click', () => { profileScreen.classList.add('hidden'); menuInner.classList.remove('hidden'); });
  $('settingsBtn').addEventListener('click', () => { game.sfx.init(); ui.togglePanel('settings'); });
  $('creditsBtn').addEventListener('click', () => { menuInner.classList.add('hidden'); creditsBox.classList.remove('hidden'); });
  $('creditsBack').addEventListener('click', () => { creditsBox.classList.add('hidden'); menuInner.classList.remove('hidden'); });
  $('wipeBtn').addEventListener('click', () => {
    if (confirm('Delete your save and home world forever?')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
  });
  $('respawnBtn').addEventListener('click', () => game.respawn());

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    try { if (game.running && !game.paused) game.loop(dt); }
    catch (e) { console.error('loop error', e); }  // never let one bad frame kill the game
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
});
