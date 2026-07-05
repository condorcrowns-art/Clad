'use strict';
/* ============================================================
   GLITCHTOPIA — item registry, splice recipes, shop, icons
   Every item DOES something. No cosmetic junk.
   ============================================================ */

const TS = 32; // tile size in px (world units = px)

const ITEMS = {};
function defItem(id, o) { ITEMS[id] = Object.assign({ id }, o); return ITEMS[id]; }

/* ---------- kinds ----------
   block   : placeable tile (fx object = what it does)
   seed    : plantable, grows a tree that yields `grows`
   tool    : mining implement (minePower, mineRate, dmg)
   weapon  : melee or ranged (dmg, rate, range | projectile)
   gear    : equip slot back/feet/chip (passive/active powers)
   consumable : use from hotbar
------------------------------------------------------------- */

/* ===================== BLOCKS ===================== */
// tier: how deep in the splice tree (0 = natural)
defItem('dirt',  { name: 'Dirt Block', kind: 'block', tier: 0, hp: 3, solid: true, color: '#8a5a34', color2: '#6e4426',
  desc: 'Basic soil. Soft — even a fist chews through it fast.' });
defItem('stone', { name: 'Stone Block', kind: 'block', tier: 0, hp: 6, solid: true, color: '#7d8597', color2: '#5c636e',
  desc: 'Sturdy rock. Slow to punch — a pickaxe helps.' });
defItem('wood',  { name: 'Wood Block', kind: 'block', tier: 0, hp: 4, solid: true, color: '#a4763f', color2: '#7f5a2e',
  desc: 'Compiled timber. Burns hot in a splice.' });
defItem('sand',  { name: 'Sand Block', kind: 'block', tier: 0, hp: 2, solid: true, color: '#e0c068', color2: '#bfa050',
  desc: 'Loose grains of silicon. The seed of all glass and light.' });

defItem('brick', { name: 'Brick Block', kind: 'block', tier: 1, hp: 12, solid: true, color: '#b5484d', color2: '#8c3439',
  desc: 'Hardened composite. Takes a beating — build your vault with it.' });
defItem('glass', { name: 'Glass Block', kind: 'block', tier: 1, hp: 3, solid: true, transparent: true, color: '#9adcf0', color2: '#6fb8d4',
  desc: 'Solid but see-through. Enemies path into it. You see them coming.' });
defItem('spring_pad', { name: 'Spring Pad', kind: 'block', tier: 1, hp: 5, solid: true, color: '#3ddc84', color2: '#22a35c',
  fx: { bounce: 1050 }, desc: 'FUNCTION: launches anything that lands on it high into the air.' });
defItem('conveyor', { name: 'Conveyor Belt', kind: 'block', tier: 1, hp: 5, solid: true, color: '#5b6577', color2: '#3d4453',
  fx: { conveyor: 240 }, desc: 'FUNCTION: drags whoever stands on it sideways. Faces the way you face when placing.' });
defItem('led_block', { name: 'LED Block', kind: 'block', tier: 1, hp: 3, solid: true, color: '#fff3b0', color2: '#e0c95e',
  fx: { glow: 5 }, desc: 'FUNCTION: radiates light. Marks your tunnels and bases.' });
defItem('spike_trap', { name: 'Spike Trap', kind: 'block', tier: 1, hp: 5, solid: true, color: '#c0c6d4', color2: '#7e8697',
  fx: { damage: 22 }, desc: 'FUNCTION: hurts anything that touches it — including YOU. Place with care.' });

defItem('teleporter', { name: 'Teleporter', kind: 'block', tier: 2, hp: 8, solid: true, color: '#b388ff', color2: '#7c4dff',
  fx: { teleport: true, glow: 4 }, desc: 'FUNCTION: stand on it and press [S] to warp to your next teleporter. Place two or more!' });
defItem('repair_node', { name: 'Repair Node', kind: 'block', tier: 2, hp: 8, solid: true, color: '#7bf1a8', color2: '#38b26b',
  fx: { heal: 6, healRange: 4.5, glow: 4 }, desc: 'FUNCTION: regenerates your HP while you stand near it. A campfire for the digital age.' });
defItem('sentry', { name: 'Sentry Node', kind: 'block', tier: 2, hp: 10, solid: true, color: '#ff9e6d', color2: '#d96b36',
  fx: { sentry: { range: 8, rate: 0.8, dmg: 12 } }, desc: 'FUNCTION: auto-targets enemies in range and opens fire. Your first ally.' });
defItem('firewall_block', { name: 'Firewall Block', kind: 'block', tier: 9, hp: 10, solid: true, color: '#ff5714', color2: '#c41e00', animated: true,
  fx: { enemyDamage: 35, glow: 5 }, unspliceable: true,
  desc: 'BOSS TECH: living fire that burns only ENEMIES. You walk through it unharmed. Build burning corridors.' });
defItem('trophy_core', { name: 'Network Core Trophy', kind: 'block', tier: 9, hp: 40, solid: true, color: '#ffd166', color2: '#c79a2a', animated: true,
  fx: { glow: 8, heal: 10, healRange: 7 }, unspliceable: true,
  desc: 'BOSS TECH: the liberated heart of the network. Massive heal aura. You earned this.' });

defItem('tesla_coil', { name: 'Tesla Coil', kind: 'block', tier: 3, hp: 12, solid: true, color: '#6ee7ff', color2: '#2a6f8f', animated: true,
  fx: { tesla: { range: 7, rate: 1.4, dmg: 10, chains: 3 }, glow: 4 }, desc: 'FUNCTION: zaps up to 3 enemies at once with chain lightning. The sentry\'s angrier sibling.' });
defItem('shield_gen', { name: 'Shield Generator', kind: 'block', tier: 3, hp: 12, solid: true, color: '#90f1c1', color2: '#2f9e6e', animated: true,
  fx: { shield: 0.25, shieldRange: 6, glow: 4 }, desc: 'FUNCTION: projects a dome — you take 25% less damage while near it. Anchor your boss camps here.' });
defItem('grinder', { name: 'Grinder Block', kind: 'block', tier: 2, hp: 8, solid: true, color: '#aab4c4', color2: '#5d6673', animated: true,
  fx: { enemyDamage: 60 }, desc: 'FUNCTION: spinning blades that shred ENEMIES on contact. Harmless to you. Line your moats.' });
defItem('weather_core', { name: 'Weather Core', kind: 'block', tier: 2, hp: 6, solid: true, color: '#f4a261', color2: '#c76f2e', animated: true,
  fx: { glow: 4, weather: true }, desc: 'FUNCTION: reprograms your home server\'s sky. Stand on it and press [S] to cycle weather.' });
defItem('door', { name: 'Home Door', kind: 'block', tier: 1, hp: 6, solid: false, color: '#9c6b3f', color2: '#6e4426',
  fx: { door: true }, desc: 'FUNCTION: walk-through door. Placing one on your HOME SERVER sets your respawn/arrival point.' });
defItem('sign', { name: 'Data Sign', kind: 'block', tier: 1, hp: 4, solid: false, color: '#c9a227', color2: '#8a6d1d',
  fx: { sign: true }, desc: 'FUNCTION: writable sign. You set its text when placing; it displays when anyone stands near.' });
defItem('laser_rifle', { name: 'Lance Beam', kind: 'weapon', tier: 3, dmg: 20, rate: 4, projectile: { speed: 900, color: '#ff4d6d', pierce: true }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: piercing beam — one shot skewers every enemy in a line.' });
defItem('drone_pet', { name: 'Pocket Drone', kind: 'gear', slot: 'pet', tier: 3,
  fx: { pet: { dmg: 9, rate: 1.2, range: 7, color: '#8899aa' } },
  desc: 'FUNCTION: a loyal familiar that hovers beside you and shoots whatever you\'re fighting.' });
defItem('core_sprite', { name: 'Core Sprite', kind: 'gear', slot: 'pet', tier: 9, unspliceable: true,
  fx: { pet: { dmg: 16, rate: 0.9, range: 8, color: '#ffd166', heal: 2 } },
  desc: 'BOSS TECH: a fragment of the liberated Core. Fights harder than a drone and slowly mends your HP.' });
defItem('overclock_chip', { name: 'Overclock Chip', kind: 'gear', slot: 'chip', tier: 9, unspliceable: true,
  fx: { speed: 1.2, dmgMult: 1.35, magnet: 5 },
  desc: 'BOSS TECH: BOSS RUSH exclusive. Runs your whole rig hot: +20% speed, +35% damage, loot magnet.' });
defItem('fishing_rod', { name: 'Data Rod', kind: 'tool', tier: 1, minePower: 1, mineRate: 4, dmg: 6, rate: 3, range: 1.4, rod: true,
  desc: 'FUNCTION: click water to cast. When the bobber shouts [!], click again to reel in gems, fish, and rare seeds.' });
defItem('data_fish', { name: 'Data Fish', kind: 'consumable', tier: 0, heal: 30,
  desc: 'FUNCTION: click to eat. Restores 30 HP. Tastes like packets.' });
defItem('golden_fish', { name: 'Golden Fish', kind: 'consumable', tier: 2, heal: 100,
  desc: 'FUNCTION: click to eat for a FULL heal — or recycle it for a fat stack of gems.' });

defItem('crystal_cluster', { name: 'Crystal Cluster', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#6ee7ff', color2: '#2a6f8f',
  gemVal: [6, 12], fx: { glow: 3 }, desc: 'FUNCTION: a farmable gem deposit — bursts into 6–12 gems when broken. Grow forests of these and get rich.' });
defItem('note_block', { name: 'Chime Block', kind: 'block', tier: 2, hp: 5, solid: true, color: '#f7a8d8', color2: '#c26aa4', animated: true,
  fx: { note: true }, desc: 'FUNCTION: plays a musical tone when you step on it. Stand on it and press [S] to tune the pitch. Build songs into your floor.' });
defItem('glider_wings', { name: 'Glider Wings', kind: 'gear', slot: 'back', tier: 2,
  fx: { glide: { fall: 85, boost: 1.2 } },
  desc: 'FUNCTION: hold [SPACE] in the air to glide — slow fall, extra drift. The budget jetpack (no fuel needed).' });
defItem('torrent_lance', { name: 'Torrent Lance', kind: 'weapon', tier: 9, dmg: 28, rate: 3.5, unspliceable: true,
  projectile: { speed: 820, color: '#38d9f5', pierce: true }, knock: 420, minePower: 1, mineRate: 4,
  desc: 'BOSS TECH: KRAKEN.SYS\'s pressure cannon. Piercing water lances that blast enemies backwards.' });
defItem('buoy_chip', { name: 'Buoy Chip', kind: 'gear', slot: 'chip', tier: 9, unspliceable: true,
  fx: { buoy: true, magnet: 4 },
  desc: 'BOSS TECH: you float to the surface of liquid data and swim like a torpedo. Includes a loot magnet.' });
defItem('wraith_chip', { name: 'Wraith Chip', kind: 'gear', slot: 'chip', tier: 9, unspliceable: true,
  fx: { dodge: 0.15, speed: 1.1 },
  desc: 'BOSS TECH: ROOTKIT\'s phase trick. 15% of all attacks pass straight through you. +10% speed.' });
defItem('recall_disc', { name: 'Recall Disc', kind: 'weapon', tier: 3, dmg: 18, rate: 2.5, minePower: 1, mineRate: 4,
  projectile: { speed: 640, color: '#3ddc84', pierce: true, boomerang: true },
  desc: 'FUNCTION: a piercing disc that flies out, then RETURNS to you — hitting everything twice.' });
defItem('overclock_cola', { name: 'Overclock Cola', kind: 'consumable', tier: 1, buff: { dur: 30, speed: 1.4, dmg: 1.4 },
  desc: 'FUNCTION: click to chug. +40% speed and damage for 30 seconds. Do not shake.' });
defItem('ember_pet', { name: 'Ember Kit', kind: 'gear', slot: 'pet', tier: 9, unspliceable: true,
  fx: { pet: { dmg: 11, rate: 1.0, range: 7, color: '#ff5714', burn: { dps: 6, dur: 2 } } },
  desc: 'BOSS TECH: a baby flame daemon. Its shots IGNITE enemies. Rare drop from repeat Firewall Daemon kills.' });

/* --- Growtopia-style world expansion & utility items --- */
defItem('world_lock', { name: 'World Lock', kind: 'special', tier: 3, unspliceable: true,
  desc: 'FUNCTION: claims a brand-new world in your name. Open MY WORLDS [V] to found it — each new world rolls a random biome.' });
defItem('display_shelf', { name: 'Display Shelf', kind: 'block', tier: 2, hp: 6, solid: false, color: '#c9ada7', color2: '#8a7a74',
  fx: { shelf: true }, desc: 'FUNCTION: stand on its tile and press [S] with an item selected to exhibit it. Build museums and shops. Press [S] again to take it back.' });
defItem('vendor_bot', { name: 'Vendor Bot', kind: 'block', tier: 3, hp: 10, solid: true, animated: true, color: '#9d8189', color2: '#6d5a60',
  fx: { vendor: true, glow: 2 }, desc: 'FUNCTION: press [S] with a sellable item selected to stock up to 10 of it. The bot sells one every 25s and spits out the gems. Idle income!' });
defItem('firework', { name: 'Firework Rocket', kind: 'consumable', tier: 1, firework: true,
  desc: 'FUNCTION: click to launch. Explodes in glorious color — and deals heavy damage to any enemy near the burst.' });
defItem('corrupted_drive', { name: 'Corrupted Drive', kind: 'consumable', tier: 2, defrag: true,
  desc: 'FUNCTION: click to jack in and DEFRAG it — a timed minigame of scans, patches and purges. Flawless work pays out big.' });
// paint buckets (Growtopia paint!)
const PAINTS = { paint_red: '#ff4d6d', paint_yellow: '#ffd166', paint_green: '#3ddc84', paint_cyan: '#6ee7ff', paint_purple: '#c77dff', paint_white: '#e8ecf4' };
for (const [pid, pcol] of Object.entries(PAINTS)) {
  defItem(pid, { name: pid.replace('paint_', '').replace(/^./, c => c.toUpperCase()) + ' Paint', kind: 'consumable', tier: 0, paint: pcol,
    desc: 'FUNCTION: click any placed block to paint it ' + pid.replace('paint_', '') + '. One charge per block.' });
}
defItem('paint_clear', { name: 'Paint Stripper', kind: 'consumable', tier: 0, paint: 'clear',
  desc: 'FUNCTION: click a painted block to strip the paint off.' });

/* ===================== TOOLS ===================== */
defItem('fist', { name: 'Fist', kind: 'tool', tier: 0, minePower: 1, mineRate: 4, dmg: 8, rate: 3, range: 1.4, noDrop: true,
  desc: 'Your bare hands. They punch blocks. Slowly.' });
defItem('pickaxe', { name: 'Data Pickaxe', kind: 'tool', tier: 2, minePower: 2, mineRate: 5, dmg: 12, rate: 3, range: 1.6,
  desc: 'FUNCTION: mines 2x harder per hit, swings faster. Doubles as a clumsy weapon.' });
defItem('drill', { name: 'Plasma Drill', kind: 'tool', tier: 3, minePower: 3, mineRate: 8, dmg: 10, rate: 4, range: 1.6,
  desc: 'FUNCTION: chews through terrain at 8 hits/sec. Stone melts like butter.' });
defItem('wurm_drill', { name: 'Wurmbore Drill', kind: 'tool', tier: 9, minePower: 4, mineRate: 8, dmg: 18, rate: 4, range: 1.8, area: 1, unspliceable: true,
  desc: 'BOSS TECH: the Null Wurm’s jaw, weaponized. Devours a 3x3 area of blocks per bite.' });

/* ===================== WEAPONS ===================== */
defItem('sword', { name: 'Shard Blade', kind: 'weapon', tier: 2, dmg: 24, rate: 3, range: 2.0, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: a blade of compressed glass. Wide melee arc, real damage.' });
defItem('blaster', { name: 'Photon Blaster', kind: 'weapon', tier: 2, dmg: 14, rate: 5, projectile: { speed: 720, color: '#6ee7ff' }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: rapid-fire light bolts. Point at problem, hold click.' });
defItem('flame_blade', { name: 'Daemonfire Blade', kind: 'weapon', tier: 9, dmg: 34, rate: 3, range: 2.2, burn: { dps: 8, dur: 2.5 }, minePower: 1, mineRate: 4, unspliceable: true,
  desc: 'BOSS TECH: forged from the Firewall Daemon’s core. Hits ignite enemies, burning them over time.' });

/* ===================== GEAR ===================== */
defItem('jetpack', { name: 'Ion Jetpack', kind: 'gear', slot: 'back', tier: 3,
  fx: { jetpack: { thrust: 1500, fuel: 2.6, regen: 1.0 } },
  desc: 'FUNCTION: hold [SPACE] in the air to fly. Fuel recharges on the ground. The sandbox is now 3D-ish.' });
defItem('speed_boots', { name: 'Velocity Boots', kind: 'gear', slot: 'feet', tier: 2,
  fx: { speed: 1.35, doubleJump: 1 },
  desc: 'FUNCTION: +35% run speed and a mid-air double jump.' });
defItem('storm_boots', { name: 'Stormstep Boots', kind: 'gear', slot: 'feet', tier: 9, unspliceable: true,
  fx: { speed: 1.5, doubleJump: 2, dash: { speed: 900, dur: 0.18, cd: 1.2 } },
  desc: 'BOSS TECH: the Storm Kernel’s charge, bottled. +50% speed, TRIPLE jump, and press [SHIFT] to lightning-dash.' });
defItem('magnet_chip', { name: 'Magnet Chip', kind: 'gear', slot: 'chip', tier: 2,
  fx: { magnet: 6.5 },
  desc: 'FUNCTION: drops and gems fly to you from 6 tiles away. Never chase loot again.' });
defItem('aegis_chip', { name: 'Aegis Chip', kind: 'gear', slot: 'chip', tier: 2,
  fx: { armor: 0.3 },
  desc: 'FUNCTION: projects a shield lattice. All damage you take is reduced by 30%.' });
defItem('admin_crown', { name: 'ADMIN Crown', kind: 'gear', slot: 'chip', tier: 9, unspliceable: true,
  fx: { armor: 0.25, magnet: 7, dmgMult: 1.5, regen: 2 },
  desc: 'BOSS TECH: root access. +50% damage, 25% armor, loot magnet, passive regen. You ARE the admin now.' });

/* ===================== CONSUMABLES ===================== */
defItem('medkit', { name: 'Medkit', kind: 'consumable', tier: 0, heal: 50,
  desc: 'FUNCTION: click to restore 50 HP instantly.' });
defItem('bomb', { name: 'Logic Bomb', kind: 'consumable', tier: 0, bomb: { radius: 2.5, dmg: 60 },
  desc: 'FUNCTION: click a spot to detonate — shreds blocks and enemies in a big radius.' });
defItem('mystery_seed', { name: 'Mystery Seed', kind: 'consumable', tier: 1, mystery: true,
  desc: 'FUNCTION: click to decode into a random spliced seed. Gambling, but botanical.' });

/* ===================== SEEDS (auto-generated) ===================== */
// Everything spliceable/growable gets a seed. Trees yield the item.
const GROW_TIMES = { 0: 25, 1: 55, 2: 110, 3: 170, 9: 170 }; // seconds by tier
for (const id of Object.keys(ITEMS)) {
  const it = ITEMS[id];
  if (it.kind === 'seed' || it.noDrop || it.kind === 'consumable' || it.kind === 'special') continue;
  if (['trophy_core', 'admin_crown', 'core_sprite', 'overclock_chip', 'torrent_lance', 'buoy_chip', 'wraith_chip', 'ember_pet'].includes(id)) continue; // one-of-a-kind
  defItem(id + '_seed', {
    name: it.name.replace(/ (Block|Pad|Belt|Trap|Node|Blade|Blaster|Pickaxe|Drill|Jetpack|Boots|Chip)$/, '') + ' Seed',
    kind: 'seed', grows: id, tier: it.tier, growTime: GROW_TIMES[it.tier] || 60,
    color: it.color || '#8f8',
    desc: 'Plant on solid ground. Grows ' + it.name + ' in ' + (GROW_TIMES[it.tier] || 60) + 's. Splice by planting a DIFFERENT seed on the sapling.',
  });
}

/* ===================== SPLICE RECIPES ===================== */
// key: two GROWN item ids sorted + joined with '+', value: result item id
const RECIPES = {};
function defRecipe(a, b, result) { RECIPES[[a, b].sort().join('+')] = result; }
// Tier 1 — natural + natural
defRecipe('dirt', 'stone', 'brick');
defRecipe('sand', 'stone', 'glass');
defRecipe('dirt', 'wood', 'spring_pad');
defRecipe('stone', 'wood', 'conveyor');
defRecipe('sand', 'wood', 'led_block');
defRecipe('dirt', 'sand', 'spike_trap');
// Tier 2 — compiled tech
defRecipe('glass', 'stone', 'teleporter');
defRecipe('glass', 'led_block', 'repair_node');
defRecipe('brick', 'led_block', 'sentry');
defRecipe('brick', 'wood', 'pickaxe');
defRecipe('brick', 'glass', 'sword');
defRecipe('glass', 'wood', 'blaster');
defRecipe('spring_pad', 'conveyor', 'speed_boots');
defRecipe('led_block', 'conveyor', 'magnet_chip');
defRecipe('brick', 'spring_pad', 'aegis_chip');
// Tier 3 — advanced
defRecipe('pickaxe', 'glass', 'drill');
defRecipe('blaster', 'spring_pad', 'jetpack');
defRecipe('sentry', 'glass', 'tesla_coil');
defRecipe('repair_node', 'brick', 'shield_gen');
defRecipe('spike_trap', 'conveyor', 'grinder');
defRecipe('led_block', 'spring_pad', 'weather_core');
defRecipe('dirt', 'glass', 'door');
defRecipe('wood', 'led_block', 'sign');
defRecipe('blaster', 'glass', 'laser_rifle');
defRecipe('sentry', 'blaster', 'drone_pet');
defRecipe('brick', 'stone', 'crystal_cluster');
defRecipe('glass', 'spring_pad', 'glider_wings');
defRecipe('sand', 'glass', 'note_block');
defRecipe('conveyor', 'glass', 'recall_disc');
defRecipe('stone', 'led_block', 'display_shelf');
defRecipe('sentry', 'conveyor', 'vendor_bot');

function spliceResult(grownA, grownB) { return RECIPES[[grownA, grownB].sort().join('+')] || null; }

// list of tier-1/2/3 results for mystery seed
const MYSTERY_POOL = Object.values(RECIPES).filter((r, i, a) => a.indexOf(r) === i);

/* ===================== SHOP ===================== */
const SHOP = [
  { id: 'dirt_seed', price: 12, qty: 1 },
  { id: 'stone_seed', price: 15, qty: 1 },
  { id: 'wood_seed', price: 15, qty: 1 },
  { id: 'sand_seed', price: 12, qty: 1 },
  { id: 'medkit', price: 25, qty: 1 },
  { id: 'bomb', price: 40, qty: 1 },
  { id: 'fishing_rod', price: 60, qty: 1 },
  { id: 'overclock_cola', price: 55, qty: 1 },
  { id: 'firework', price: 30, qty: 1 },
  { id: 'paint_red', price: 18, qty: 3 },
  { id: 'paint_yellow', price: 18, qty: 3 },
  { id: 'paint_green', price: 18, qty: 3 },
  { id: 'paint_cyan', price: 18, qty: 3 },
  { id: 'paint_purple', price: 18, qty: 3 },
  { id: 'paint_white', price: 18, qty: 3 },
  { id: 'paint_clear', price: 8, qty: 3 },
  { id: 'mystery_seed', price: 120, qty: 1 },
  { id: 'world_lock', price: 1500, qty: 1 },
];

// recycler: gems paid when selling one unit (boss tech is priceless)
function sellPrice(id) {
  const it = ITEMS[id];
  if (!it || it.noDrop) return 0;
  if (id === 'golden_fish') return 100;
  if (id === 'data_fish') return 8;
  if (it.tier === 9) return 0;
  const base = { 0: 2, 1: 5, 2: 14, 3: 35 }[it.tier] || 2;
  return it.kind === 'seed' ? Math.max(1, Math.ceil(base * 0.6)) : base;
}

/* ===================== ICON RENDERER ===================== */
const _iconCache = {};
function iconFor(id) {
  if (_iconCache[id]) return _iconCache[id];
  const it = ITEMS[id];
  const c = document.createElement('canvas');
  c.width = 40; c.height = 40;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  if (!it) { _iconCache[id] = c; return c; }
  if (it.kind === 'block') {
    drawBlockIcon(x, it, 4, 4, 32);
  } else if (it.kind === 'seed') {
    const base = ITEMS[it.grows];
    // seed packet: little pouch + sprout in item color
    x.fillStyle = '#3a2c1e'; x.fillRect(8, 14, 24, 22);
    x.fillStyle = '#241a10'; x.fillRect(8, 14, 24, 5);
    x.fillStyle = base ? base.color : '#8f8';
    x.beginPath(); x.arc(20, 26, 6, 0, 7); x.fill();
    x.strokeStyle = '#3ddc84'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(20, 14); x.quadraticCurveTo(24, 6, 30, 6); x.stroke();
  } else if (id === 'fist') {
    x.fillStyle = '#ffd8b1';
    x.fillRect(10, 14, 20, 16); x.fillRect(6, 18, 6, 8);
    x.fillStyle = '#e0b48c';
    for (let k = 0; k < 4; k++) x.fillRect(12 + k * 5, 12, 3, 6);
  } else if (it.rod) {
    x.strokeStyle = '#7a5a3a'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(8, 36); x.quadraticCurveTo(22, 10, 32, 6); x.stroke();
    x.strokeStyle = '#9adcf0'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(32, 6); x.lineTo(32, 24); x.stroke();
    x.fillStyle = '#ff4d6d'; x.beginPath(); x.arc(32, 26, 4, 0, 7); x.fill();
  } else if (it.kind === 'tool') {
    x.strokeStyle = '#7a5a3a'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(12, 34); x.lineTo(26, 10); x.stroke();
    x.fillStyle = id === 'wurm_drill' ? '#c77dff' : id === 'drill' ? '#6ee7ff' : '#aab4c4';
    if (id.includes('drill')) { x.beginPath(); x.moveTo(20, 4); x.lineTo(34, 14); x.lineTo(22, 20); x.closePath(); x.fill(); }
    else { x.beginPath(); x.moveTo(14, 8); x.quadraticCurveTo(26, 2, 36, 12); x.quadraticCurveTo(28, 10, 20, 14); x.closePath(); x.fill(); }
  } else if (it.kind === 'weapon') {
    if (it.projectile) {
      x.fillStyle = '#44506b'; x.fillRect(8, 18, 22, 8);
      x.fillStyle = '#2a3347'; x.fillRect(6, 24, 8, 10);
      x.fillStyle = it.projectile.color; x.fillRect(28, 20, 8, 4);
    } else {
      x.strokeStyle = id === 'flame_blade' ? '#ff5714' : '#9adcf0'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(10, 34); x.lineTo(30, 8); x.stroke();
      x.strokeStyle = '#7a5a3a'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(8, 28); x.lineTo(16, 36); x.stroke();
    }
  } else if (it.kind === 'gear') {
    if (it.slot === 'pet') {
      x.fillStyle = it.fx.pet.color; x.fillRect(10, 14, 20, 14);
      x.fillStyle = '#0d1526'; x.fillRect(14, 18, 5, 5); x.fillRect(22, 18, 5, 5);
      x.fillStyle = '#6ee7ff'; x.fillRect(15, 19, 3, 3); x.fillRect(23, 19, 3, 3);
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(12, 10, 16, 3);
    } else if (it.slot === 'back') { x.fillStyle = '#8899aa'; x.fillRect(10, 8, 9, 24); x.fillRect(22, 8, 9, 24); x.fillStyle = '#ff9e6d'; x.fillRect(11, 32, 7, 6); x.fillRect(23, 32, 7, 6); }
    else if (it.slot === 'feet') { x.fillStyle = id === 'storm_boots' ? '#ffd166' : '#3ddc84'; x.fillRect(8, 12, 10, 18); x.fillRect(8, 26, 18, 8); x.fillStyle = '#1c2536'; x.fillRect(8, 30, 18, 4); }
    else { x.fillStyle = id === 'admin_crown' ? '#ffd166' : '#2de2a3'; x.fillRect(8, 12, 24, 18); x.fillStyle = '#0d1526'; x.fillRect(12, 16, 4, 4); x.fillRect(20, 16, 4, 4); x.fillRect(12, 24, 12, 2);
      if (id === 'admin_crown') { x.fillStyle = '#ffd166'; x.beginPath(); x.moveTo(8, 12); x.lineTo(12, 4); x.lineTo(16, 12); x.lineTo(20, 4); x.lineTo(24, 12); x.lineTo(28, 4); x.lineTo(32, 12); x.fill(); } }
  } else if (it.kind === 'special') {
    // world lock: padlock with a globe
    x.fillStyle = '#ffd166'; x.fillRect(8, 18, 24, 18);
    x.strokeStyle = '#ffd166'; x.lineWidth = 4;
    x.beginPath(); x.arc(20, 18, 8, Math.PI, 0); x.stroke();
    x.fillStyle = '#0d1526'; x.beginPath(); x.arc(20, 26, 5, 0, 7); x.fill();
    x.strokeStyle = '#0d1526'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(20, 26, 3.2, 0, 7); x.moveTo(16.8, 26); x.lineTo(23.2, 26); x.stroke();
  } else if (it.kind === 'consumable') {
    if (it.paint) {
      x.fillStyle = '#aab4c4'; x.fillRect(10, 16, 20, 18);
      x.fillStyle = it.paint === 'clear' ? '#44506b' : it.paint;
      x.fillRect(12, 18, 16, 6);
      x.strokeStyle = '#7e8697'; x.lineWidth = 2;
      x.beginPath(); x.arc(20, 16, 8, Math.PI, 0); x.stroke();
      if (it.paint !== 'clear') { x.fillStyle = it.paint; x.beginPath(); x.arc(28, 32, 4, 0, 7); x.fill(); }
    } else if (it.firework) {
      x.fillStyle = '#ff4d6d'; x.fillRect(16, 6, 8, 18);
      x.beginPath(); x.moveTo(16, 6); x.lineTo(20, 0); x.lineTo(24, 6); x.fill();
      x.fillStyle = '#7a5a3a'; x.fillRect(19, 24, 2, 12);
      x.fillStyle = '#ffd166'; x.fillRect(14, 8, 3, 3); x.fillRect(23, 14, 3, 3);
    } else if (it.defrag) {
      x.fillStyle = '#2a3347'; x.fillRect(8, 10, 24, 22);
      x.fillStyle = '#7b2cbf'; x.fillRect(11, 13, 18, 5);
      x.fillStyle = '#ff4d6d'; x.fillRect(11, 21, 8, 8); x.fillRect(22, 21, 7, 4);
      x.fillStyle = '#3ddc84'; x.fillRect(22, 27, 7, 2);
    } else if (id === 'data_fish' || id === 'golden_fish') {
      x.fillStyle = id === 'golden_fish' ? '#ffd166' : '#6ee7ff';
      x.beginPath(); x.ellipse(18, 20, 12, 7, 0, 0, 7); x.fill();
      x.beginPath(); x.moveTo(28, 20); x.lineTo(36, 13); x.lineTo(36, 27); x.closePath(); x.fill();
      x.fillStyle = '#0d1526'; x.fillRect(11, 17, 3, 3);
    } else if (it.heal) { x.fillStyle = '#e8ecf4'; x.fillRect(6, 10, 28, 22); x.fillStyle = '#ff4d6d'; x.fillRect(16, 14, 8, 14); x.fillRect(13, 17, 14, 8); }
    else if (it.bomb) { x.fillStyle = '#1c2536'; x.beginPath(); x.arc(20, 24, 12, 0, 7); x.fill(); x.strokeStyle = '#ffd166'; x.lineWidth = 2; x.beginPath(); x.moveTo(24, 14); x.quadraticCurveTo(30, 6, 34, 8); x.stroke(); x.fillStyle = '#ff5714'; x.fillRect(32, 5, 4, 4); }
    else if (it.buff) { x.fillStyle = '#ff9e6d'; x.fillRect(12, 10, 16, 26); x.fillStyle = '#ffd166'; x.fillRect(12, 16, 16, 4); x.fillStyle = '#e8ecf4'; x.fillRect(14, 6, 12, 4); x.fillStyle = '#0d1526'; x.font = 'bold 11px monospace'; x.fillText('OC', 13, 32); }
    else { x.fillStyle = '#2a1c3a'; x.fillRect(8, 14, 24, 22); x.fillStyle = '#c77dff'; x.font = 'bold 20px monospace'; x.fillText('?', 14, 32); }
  }
  _iconCache[id] = c;
  return c;
}

function drawBlockIcon(x, it, px, py, s) {
  x.fillStyle = it.color; x.fillRect(px, py, s, s);
  x.fillStyle = it.color2 || '#000';
  // noise pattern
  for (let i = 0; i < 6; i++) x.fillRect(px + ((i * 13) % (s - 6)) + 2, py + ((i * 23) % (s - 6)) + 2, 4, 4);
  x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 2;
  x.strokeRect(px + 1, py + 1, s - 2, s - 2);
  if (it.fx && it.fx.damage) { x.fillStyle = '#fff'; x.beginPath(); x.moveTo(px + s / 2, py + 2); x.lineTo(px + s / 2 - 5, py + 12); x.lineTo(px + s / 2 + 5, py + 12); x.fill(); }
  if (it.fx && it.fx.bounce) { x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(px + 6, py + s - 8); x.lineTo(px + s / 2, py + 6); x.lineTo(px + s - 6, py + s - 8); x.stroke(); }
  if (it.fx && it.fx.teleport) { x.strokeStyle = '#fff'; x.beginPath(); x.arc(px + s / 2, py + s / 2, 8, 0, 5); x.stroke(); }
  if (it.fx && it.fx.sentry) { x.fillStyle = '#1c2536'; x.fillRect(px + s / 2 - 2, py + 4, 14, 5); }
}
