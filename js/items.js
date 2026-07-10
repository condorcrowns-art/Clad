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

defItem('snow', { name: 'Snow Block', kind: 'block', tier: 0, hp: 3, solid: true, color: '#eef3fb', color2: '#c6d4ea',
  desc: 'Packed frost from tundra worlds. Crunchy.' });
defItem('ice',  { name: 'Ice Block', kind: 'block', tier: 0, hp: 3, solid: true, transparent: true, slippery: true, color: '#a8d8f0', color2: '#6fb8d4',
  desc: 'FUNCTION: frictionless! You (and your enemies) slide right off it. Build skating rinks or trap corridors.' });

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

/* ============ THE SPLICE NETWORK — 40 cross-family results ============ */
/* construction & traversal */
defItem('platform', { name: 'Cloud Plank', kind: 'block', tier: 2, hp: 4, solid: false, color: '#d9c8a9', color2: '#a8926b',
  fx: { platform: true }, desc: 'FUNCTION: one-way platform — jump up through it, land on top. The builder\'s best friend.' });
defItem('ladder', { name: 'Rung Rail', kind: 'block', tier: 2, hp: 4, solid: false, color: '#a4763f', color2: '#6e4426',
  fx: { ladder: true }, desc: 'FUNCTION: climbable! Hold [SPACE] to climb up, [S] to slide down.' });
defItem('speed_pad', { name: 'Dash Pad', kind: 'block', tier: 2, hp: 6, solid: true, animated: true, color: '#ffb703', color2: '#c98a02',
  fx: { speedPad: 620 }, desc: 'FUNCTION: hurls whoever steps on it sideways at high speed. Faces your placing direction.' });
defItem('tar', { name: 'Tar Block', kind: 'block', tier: 1, hp: 5, solid: true, animated: true, color: '#232020', color2: '#0d0b0b',
  fx: { sticky: true }, desc: 'FUNCTION: gooey — anything standing on it slows to a crawl. Moat material.' });
defItem('obsidian', { name: 'Obsidian Plate', kind: 'block', tier: 4, hp: 26, solid: true, color: '#231942', color2: '#120c24',
  desc: 'FUNCTION: the toughest buildable block in the game. 26 hits. Vault-grade.' });
defItem('cloud_block', { name: 'Nimbus Block', kind: 'block', tier: 2, hp: 4, solid: false, color: '#eef3fb', color2: '#c9d8ee',
  fx: { platform: true, softBounce: 420 }, desc: 'FUNCTION: a one-way platform of solid vapor that gently bounces whatever lands on it.' });
defItem('turbine', { name: 'Updraft Turbine', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#8ecae6', color2: '#4a7fa5',
  fx: { updraft: 8 }, desc: 'FUNCTION: blasts a column of air 8 tiles high — step over it and ride the wind up. Build elevators.' });
defItem('antigrav', { name: 'Grav Well', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#7b68ee', color2: '#483d8b',
  fx: { gravAura: 0.45, auraRange: 6, glow: 3 }, desc: 'FUNCTION: bends gravity — you fall at half speed and jump floaty anywhere near it.' });
/* base infrastructure */
defItem('growth_lamp', { name: 'Grow Lamp', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#d4f7c5', color2: '#7fbf6a',
  fx: { growAura: 2, auraRange: 5, glow: 4 }, desc: 'FUNCTION: trees within its light grow TWICE as fast. Farm real estate just got valuable.' });
defItem('fuel_pad', { name: 'Charge Pad', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#ffe066', color2: '#c9a227',
  fx: { fuelAura: true, auraRange: 5, glow: 3 }, desc: 'FUNCTION: recharges jetpack fuel and dash cooldowns even in mid-air near it.' });
defItem('beacon', { name: 'Waypoint Beacon', kind: 'block', tier: 2, hp: 8, solid: true, animated: true, color: '#48cae4', color2: '#0096c7',
  fx: { beacon: true, glow: 5 }, desc: 'FUNCTION: fires a light pillar into the sky and marks itself on your minimap. Never lose your base again.' });
defItem('disco', { name: 'Disco Core', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#ff70a6', color2: '#b34c78',
  fx: { disco: true, speedAura: 1.18, auraRange: 5, glow: 4 }, desc: 'FUNCTION: strobes rainbow light and makes everyone near it move 18% faster. Party utility.' });
defItem('fountain', { name: 'Data Fountain', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#90e0ef', color2: '#4ea8c9',
  fx: { heal: 3, healRange: 3.5, fountain: true, glow: 2 }, desc: 'FUNCTION: an ever-flowing plume of liquid data. Gently heals anyone beside it. Gorgeous.' });
defItem('magnet_pylon', { name: 'Magnet Pylon', kind: 'block', tier: 3, hp: 10, solid: true, animated: true, color: '#e63946', color2: '#9a1f2a',
  fx: { pull: 7 }, desc: 'FUNCTION: drags all loose drops within 7 tiles to itself. Put one under your farm and collect in one place.' });
defItem('compost', { name: 'Compost Bin', kind: 'block', tier: 2, hp: 8, solid: true, color: '#606c38', color2: '#3a4222',
  fx: { compost: true }, desc: 'FUNCTION: press [S] with any item selected to feed it in — 60s later it decomposes into a random SEED.' });
defItem('alarm', { name: 'Alarm Node', kind: 'block', tier: 2, hp: 8, solid: true, animated: true, color: '#ef476f', color2: '#a62646',
  fx: { alarm: 10 }, desc: 'FUNCTION: shrieks when an enemy comes within 10 tiles. Your base\'s early-warning system.' });
/* defense network */
defItem('barbed', { name: 'Barbed Block', kind: 'block', tier: 1, hp: 6, solid: true, color: '#7f5539', color2: '#4d3421',
  fx: { enemyDamage: 12 }, desc: 'FUNCTION: wooden spikes that scratch ENEMIES on contact — harmless to you. Budget firewall.' });
defItem('mine_trap', { name: 'Proximity Mine', kind: 'block', tier: 2, hp: 6, solid: true, animated: true, color: '#588157', color2: '#344e41',
  fx: { mine: { dmg: 60, r: 2 } }, desc: 'FUNCTION: detonates when an ENEMY touches it — big blast, single use. Sleep soundly.' });
defItem('flak_turret', { name: 'Flak Turret', kind: 'block', tier: 3, hp: 12, solid: true, color: '#bc6c25', color2: '#7f4a19',
  fx: { sentry: { range: 9, rate: 1.1, dmg: 16, arc: true } }, desc: 'FUNCTION: lobs explosive arcing flak over walls. Covers the ground the sentry can\'t.' });
defItem('mega_sentry', { name: 'Sentry MkII', kind: 'block', tier: 4, hp: 16, solid: true, color: '#ff6d00', color2: '#b34c00',
  fx: { sentry: { range: 10, rate: 0.5, dmg: 18 }, glow: 2 }, desc: 'FUNCTION: double the range, double the fire rate, half the mercy.' });
defItem('frost_coil', { name: 'Frost Coil', kind: 'block', tier: 3, hp: 10, solid: true, animated: true, color: '#a8d8f0', color2: '#5a9dbf',
  fx: { chillAura: 7, glow: 3 }, desc: 'FUNCTION: radiates cold — every enemy within 7 tiles moves at HALF speed. Kiting made easy.' });
defItem('fortress_core', { name: 'Fortress Core', kind: 'block', tier: 4, hp: 18, solid: true, animated: true, color: '#dda15e', color2: '#9c6f37',
  fx: { heal: 4, healRange: 5, shield: 0.25, shieldRange: 5, glow: 4 }, desc: 'FUNCTION: heal aura AND a 25% damage-reduction dome in one block. The heart of any boss camp.' });
/* weapons web */
defItem('war_hammer', { name: 'Breaker Maul', kind: 'weapon', tier: 3, dmg: 46, rate: 1.4, range: 1.9, knock: 460, minePower: 2, mineRate: 3, color: '#adb5bd',
  desc: 'FUNCTION: slow, colossal swings that send enemies FLYING. Also cracks blocks decently.' });
defItem('katana', { name: 'Pulse Katana', kind: 'weapon', tier: 3, dmg: 17, rate: 6, range: 2.0, minePower: 1, mineRate: 4, color: '#e5e5e5',
  desc: 'FUNCTION: six slashes a second. Death by a thousand cuts.' });
defItem('venom_edge', { name: 'Venom Edge', kind: 'weapon', tier: 3, dmg: 20, rate: 3.2, range: 2.0, burn: { dps: 10, dur: 3 }, minePower: 1, mineRate: 4, color: '#80b918',
  desc: 'FUNCTION: coats enemies in corrosive script that keeps eating them for 3 seconds after the hit.' });
defItem('scattergun', { name: 'Scatter Cannon', kind: 'weapon', tier: 3, dmg: 9, rate: 2.2, pellets: 5, spread: 0.35, projectile: { speed: 640, color: '#ffb703' }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: five pellets per blast. Devastating point-blank, confetti at range.' });
defItem('frost_blaster', { name: 'Cryo Blaster', kind: 'weapon', tier: 3, dmg: 12, rate: 4, chill: 2.2, projectile: { speed: 700, color: '#a8d8f0' }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: every hit CHILLS the target to half speed. Boss kiting fuel.' });
defItem('railgun', { name: 'Railgun', kind: 'weapon', tier: 4, dmg: 62, rate: 0.9, knock: 380, projectile: { speed: 1400, color: '#c77dff', pierce: true }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: a hypersonic slug that punches through EVERYTHING in a line. Slow to charge, apocalyptic on arrival.' });
defItem('starcannon', { name: 'Star Cannon', kind: 'weapon', tier: 4, dmg: 30, rate: 3, knock: 260, burn: { dps: 8, dur: 2 }, projectile: { speed: 900, color: '#ffd166', pierce: true }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: piercing, burning, knockback starfire at 3 rounds a second. The craftable endgame gun.' });
/* tools web */
defItem('jackhammer', { name: 'Jackhammer', kind: 'tool', tier: 3, minePower: 3, mineRate: 10, dmg: 8, rate: 4, range: 1.6, color: '#f4a261',
  desc: 'FUNCTION: 10 strikes per second. Terrain simply stops existing in front of you.' });
defItem('omni_tool', { name: 'Omni-Tool', kind: 'tool', tier: 4, minePower: 3, mineRate: 8, dmg: 28, rate: 3.2, range: 1.9, knock: 220, color: '#2de2a3',
  desc: 'FUNCTION: elite mining AND a real weapon in one slot. The craftable do-everything.' });
/* gear web */
defItem('rocket_boots', { name: 'Rocket Boots', kind: 'gear', slot: 'feet', tier: 3,
  fx: { speed: 1.2, jump: 830, doubleJump: 1 },
  desc: 'FUNCTION: +30% jump height with thruster-assisted double jump. The vertical build enabler.' });
defItem('moon_boots', { name: 'Moon Boots', kind: 'gear', slot: 'feet', tier: 3,
  fx: { speed: 1.1, jump: 740, gravMult: 0.65, doubleJump: 1 },
  desc: 'FUNCTION: personal low gravity — floaty jumps, gentle falls, lunar swagger.' });
defItem('hover_pack', { name: 'Hover Pack', kind: 'gear', slot: 'back', tier: 4,
  fx: { hover: { drain: 0.45, regen: 1.2 } },
  desc: 'FUNCTION: hold [SPACE] mid-air to HOVER in place — perfect for building and boss dodging. Fuel recharges on the ground.' });
defItem('climb_chip', { name: 'Gecko Chip', kind: 'gear', slot: 'chip', tier: 3,
  fx: { wallCling: true },
  desc: 'FUNCTION: press into a wall to slide down it slowly — and JUMP off it. Wall-jump like you mean it.' });
defItem('scholar_chip', { name: 'Scholar Chip', kind: 'gear', slot: 'chip', tier: 2,
  fx: { xpMult: 1.3 },
  desc: 'FUNCTION: +30% XP from everything. Level while you build.' });
defItem('leech_chip', { name: 'Leech Chip', kind: 'gear', slot: 'chip', tier: 3,
  fx: { leech: 0.1 },
  desc: 'FUNCTION: 10% of all damage you deal comes back as HP. Aggression is a healing strategy.' });
defItem('miner_chip', { name: 'Miner Chip', kind: 'gear', slot: 'chip', tier: 2,
  fx: { oreBoost: 1.6 },
  desc: 'FUNCTION: ore veins and crystal clusters burst with 60% more gems while equipped.' });
defItem('garden_chip', { name: 'Garden Chip', kind: 'gear', slot: 'chip', tier: 2,
  fx: { harvestBonus: 1 },
  desc: 'FUNCTION: every tree harvest yields one extra item. The farmer\'s edge.' });
defItem('crystal_heart', { name: 'Crystal Heart', kind: 'gear', slot: 'chip', tier: 4,
  fx: { maxHp: 30, regen: 1 },
  desc: 'FUNCTION: +30 maximum HP and a slow trickle of regeneration. Life, crystallized.' });

/* ============ NETWORK WAVE 2 — utility, totems, pets, renewables ============ */
defItem('lure_buoy', { name: 'Lure Buoy', kind: 'block', tier: 3, hp: 6, solid: true, animated: true, color: '#ff8fa3', color2: '#c95a72',
  fx: { lure: 5, glow: 2 }, desc: 'FUNCTION: fish bite twice as fast near it — and rare catches get far more likely. Place beside your pond.' });
defItem('sprinkler', { name: 'Sprinkler', kind: 'block', tier: 3, hp: 6, solid: true, animated: true, color: '#74c0fc', color2: '#3f7fb5',
  fx: { growAura: 1.5, auraRange: 4, fountain: true }, desc: 'FUNCTION: mists nearby soil — trees within 4 tiles grow 50% faster. Stacks a farm nicely with Grow Lamps.' });
defItem('fortune_totem', { name: 'Fortune Totem', kind: 'block', tier: 4, hp: 10, solid: true, animated: true, color: '#ffd166', color2: '#b8901f',
  fx: { gemAura: 6, glow: 3 }, desc: 'FUNCTION: while you mine near it, blocks drop gems 50% more often. Miners\' shrine.' });
defItem('xp_shrine', { name: 'XP Shrine', kind: 'block', tier: 3, hp: 10, solid: true, animated: true, color: '#b298dc', color2: '#7a5fa0',
  fx: { xpAura: 1.5, auraRange: 6, glow: 3 }, desc: 'FUNCTION: everything you do near it grants +50% XP. Build your grind spot around one.' });
defItem('scare_totem', { name: 'Scare Totem', kind: 'block', tier: 3, hp: 10, solid: true, animated: true, color: '#e07a5f', color2: '#9c4a35',
  fx: { repel: 6 }, desc: 'FUNCTION: enemies refuse to come within 6 tiles of it. Peace, enforced by spooky mask.' });
defItem('jukebox', { name: 'Jukebox', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#495867', color2: '#2b3441',
  fx: { music: true, glow: 2 }, desc: 'FUNCTION: plays an endless generative melody while you\'re nearby. Every base needs a soundtrack.' });
defItem('ghost_brick', { name: 'Ghost Brick', kind: 'block', tier: 2, hp: 12, solid: false, color: '#b5484d', color2: '#8c3439',
  fx: { fake: true }, desc: 'FUNCTION: looks EXACTLY like brick… but you walk straight through it. Hide your vault entrance in plain sight.' });
defItem('boost_ring', { name: 'Boost Ring', kind: 'block', tier: 3, hp: 5, solid: false, animated: true, color: '#6ee7ff', color2: '#2a9db8',
  fx: { ring: 520 }, desc: 'FUNCTION: fly through it mid-air for an upward boost AND a refreshed double-jump. Chain them into sky roads.' });
defItem('glow_vine', { name: 'Glow Vine', kind: 'block', tier: 3, hp: 5, solid: false, color: '#9ef01a', color2: '#5c8a0f',
  fx: { ladder: true, glow: 3 }, desc: 'FUNCTION: a climbable vine that lights the way. Ladder + lamp in one tile.' });
defItem('mega_spring', { name: 'Mega Spring', kind: 'block', tier: 4, hp: 8, solid: true, color: '#06ffa5', color2: '#02a86b',
  fx: { bounce: 1650 }, desc: 'FUNCTION: launches you HALF A WORLD upward. Handle with respect.' });
defItem('speed_rail', { name: 'Frost Rail', kind: 'block', tier: 3, hp: 6, solid: true, animated: true, color: '#8ce0f5', color2: '#4aa5c2',
  fx: { conveyor: 470 }, desc: 'FUNCTION: a hyper-lubricated conveyor moving at double speed. Cross your world in seconds.' });
defItem('life_ledge', { name: 'Life Ledge', kind: 'block', tier: 3, hp: 6, solid: false, color: '#95d5b2', color2: '#5a9c77',
  fx: { platform: true, heal: 2, healRange: 2 }, desc: 'FUNCTION: a one-way platform that mends you while you stand on it. Parkour checkpoints, effectively.' });
defItem('trap_ledge', { name: 'Trap Ledge', kind: 'block', tier: 3, hp: 6, solid: false, color: '#adb5bd', color2: '#6c757d',
  fx: { platform: true, enemyDamage: 20 }, desc: 'FUNCTION: a one-way platform bristling with enemy-shredding barbs. You stand safely; they don\'t.' });
/* gear wave */
defItem('turtle_pack', { name: 'Turtle Pack', kind: 'gear', slot: 'back', tier: 3,
  fx: { armor: 0.2, speed: 0.9 },
  desc: 'FUNCTION: a hardened shell — 20% less damage taken, 10% slower walk. The tank build\'s back slot.' });
defItem('battery_chip', { name: 'Battery Chip', kind: 'gear', slot: 'chip', tier: 3,
  fx: { energy: true },
  desc: 'FUNCTION: jetpacks & hover packs burn 40% less fuel and recharge 50% faster; dashes cool down 40% sooner.' });
defItem('thorn_chip', { name: 'Thorn Chip', kind: 'gear', slot: 'chip', tier: 3,
  fx: { thorns: 0.35 },
  desc: 'FUNCTION: anything that touches you takes 35% of the hit right back. Hug the problem away.' });
defItem('frost_pet', { name: 'Chill Wisp', kind: 'gear', slot: 'pet', tier: 3,
  fx: { pet: { dmg: 7, rate: 1.1, range: 7, color: '#a8d8f0', chill: 2 } },
  desc: 'FUNCTION: a frosty familiar whose shots slow enemies to half speed. Crowd control that follows you.' });
defItem('loot_weevil', { name: 'Loot Weevil', kind: 'gear', slot: 'pet', tier: 3,
  fx: { pet: { dmg: 4, rate: 1.6, range: 6, color: '#ffd166' }, magnet: 9 },
  desc: 'FUNCTION: barely fights, but drops and gems fly to you from 9 tiles away while it\'s out. A living vacuum.' });
/* renewable consumables (farm your supplies!) */
defItem('warp_whistle', { name: 'Warp Whistle', kind: 'consumable', tier: 2, warp: true,
  desc: 'FUNCTION: click to teleport HOME instantly from anywhere — deep mines, boss arenas, anywhere. Grow a tree of them.' });
defItem('nano_shield', { name: 'Nano Shield', kind: 'consumable', tier: 3, invuln: 4,
  desc: 'FUNCTION: click for 4 seconds of total invulnerability. Save it for the enrage phase.' });
defItem('brain_juice', { name: 'Brain Juice', kind: 'consumable', tier: 2, xpGain: 150,
  desc: 'FUNCTION: click to drink +150 XP on the spot. Tastes like homework.' });

/* ============ NETWORK WAVE 3 — the fire branch & the elemental matrix ============ */
/* the torch unlocks fire tech */
defItem('torch', { name: 'Torch Block', kind: 'block', tier: 2, hp: 4, solid: true, animated: true, color: '#c46a1f', color2: '#8a4712',
  fx: { glow: 4, enemyDamage: 8 }, desc: 'FUNCTION: burning pitch — lights your tunnels and singes any enemy that touches it. The root of all fire tech.' });
defItem('hearth', { name: 'Hearth', kind: 'block', tier: 3, hp: 10, solid: true, animated: true, color: '#9c4a2a', color2: '#6b2f19',
  fx: { glow: 5, heal: 2, healRange: 3.5 }, desc: 'FUNCTION: a cozy fireplace that slowly mends anyone gathered around it. Home is where the hearth is.' });
defItem('eruption_pad', { name: 'Eruption Pad', kind: 'block', tier: 3, hp: 7, solid: true, animated: true, color: '#e25822', color2: '#a03612',
  fx: { bounce: 1080, enemyDamage: 14, glow: 3 }, desc: 'FUNCTION: launches you skyward on a plume of flame — and roasts enemies that step on it.' });
defItem('lantern_ledge', { name: 'Lantern Ledge', kind: 'block', tier: 3, hp: 5, solid: false, color: '#d9a05b', color2: '#a1723a',
  fx: { platform: true, glow: 4 }, desc: 'FUNCTION: a one-way platform with a built-in lantern. Light your climb.' });
defItem('frost_lamp', { name: 'Frost Lamp', kind: 'block', tier: 2, hp: 4, solid: true, animated: true, color: '#bde0fe', color2: '#7fb3d9',
  fx: { glow: 4, chillAura: 3 }, desc: 'FUNCTION: cold light — chills enemies that wander within 3 tiles. Mood lighting with teeth.' });
defItem('void_lamp', { name: 'Void Lamp', kind: 'block', tier: 2, hp: 4, solid: true, animated: true, color: '#5a189a', color2: '#38106b',
  fx: { glow: 3, repel: 2.5 }, desc: 'FUNCTION: an unsettling glow enemies refuse to stand near. Subtle area denial.' });
defItem('aurora_lamp', { name: 'Aurora Lamp', kind: 'block', tier: 2, hp: 4, solid: true, animated: true, color: '#80ffdb', color2: '#48bfa0',
  fx: { glow: 4, gravAura: 0.8, auraRange: 3 }, desc: 'FUNCTION: shimmering polar light that gently lowers gravity around it. Floaty porch vibes.' });
/* elemental weapon matrix */
defItem('ember_saber', { name: 'Ember Saber', kind: 'weapon', tier: 3, dmg: 20, rate: 3.2, range: 2.0, burn: { dps: 7, dur: 2.5 }, minePower: 1, mineRate: 4, color: '#ff7b00',
  desc: 'FUNCTION: a blade dipped in torchfire. Every hit keeps burning.' });
defItem('frost_saber', { name: 'Frost Saber', kind: 'weapon', tier: 3, dmg: 19, rate: 3.2, range: 2.0, chill: 2.2, minePower: 1, mineRate: 4, color: '#a8d8f0',
  desc: 'FUNCTION: a blade of living ice — every hit slows the target to half speed.' });
defItem('blaze_katana', { name: 'Blaze Katana', kind: 'weapon', tier: 4, dmg: 16, rate: 6, range: 2.0, burn: { dps: 6, dur: 2 }, minePower: 1, mineRate: 4, color: '#ff5714',
  desc: 'FUNCTION: six burning slashes a second. The DoT stacks up terrifyingly fast.' });
defItem('frost_fang', { name: 'Frost Fang', kind: 'weapon', tier: 4, dmg: 15, rate: 6, range: 2.0, chill: 1.8, minePower: 1, mineRate: 4, color: '#caf0f8',
  desc: 'FUNCTION: blinding-fast ice slashes that keep the whole crowd permanently slowed.' });
defItem('magma_maul', { name: 'Magma Maul', kind: 'weapon', tier: 4, dmg: 44, rate: 1.4, range: 1.9, knock: 480, burn: { dps: 9, dur: 3 }, minePower: 2, mineRate: 3, color: '#e25822',
  desc: 'FUNCTION: colossal burning swings — enemies fly away ON FIRE.' });
defItem('glacier_maul', { name: 'Glacier Maul', kind: 'weapon', tier: 4, dmg: 42, rate: 1.4, range: 1.9, knock: 480, chill: 3, minePower: 2, mineRate: 3, color: '#90e0ef',
  desc: 'FUNCTION: a hammer of packed glacier. What it doesn\'t kill, it leaves crawling.' });
defItem('ember_blaster', { name: 'Ember Blaster', kind: 'weapon', tier: 3, dmg: 12, rate: 5, burn: { dps: 6, dur: 2 }, projectile: { speed: 700, color: '#ff7b00' }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: rapid-fire cinders that set everything alight.' });
defItem('dragon_breath', { name: 'Dragon Breath', kind: 'weapon', tier: 4, dmg: 8, rate: 2.2, pellets: 5, spread: 0.4, burn: { dps: 7, dur: 2 }, projectile: { speed: 600, color: '#ff5714' }, minePower: 1, mineRate: 4,
  desc: 'FUNCTION: a shotgun cone of fire. Five burning pellets per roar.' });
/* elemental & heavy turrets */
defItem('flame_sentry', { name: 'Flame Sentry', kind: 'block', tier: 3, hp: 12, solid: true, color: '#e25822', color2: '#a03612',
  fx: { sentry: { range: 7, rate: 0.9, dmg: 10, burn: { dps: 6, dur: 2 } }, glow: 2 }, desc: 'FUNCTION: a turret that shoots fire — its targets keep burning after the hit.' });
defItem('venom_sentry', { name: 'Venom Sentry', kind: 'block', tier: 4, hp: 12, solid: true, color: '#80b918', color2: '#527513',
  fx: { sentry: { range: 8, rate: 1.0, dmg: 9, burn: { dps: 9, dur: 3 } } }, desc: 'FUNCTION: fires corrosive script that eats targets for 3 full seconds per hit.' });
defItem('snowball_turret', { name: 'Snowball Turret', kind: 'block', tier: 2, hp: 8, solid: true, color: '#dbe9f4', color2: '#9db4c9',
  fx: { sentry: { range: 8, rate: 0.8, dmg: 6, chill: 2, knock: 420 } }, desc: 'FUNCTION: pelts enemies with heavy snowballs — barely hurts, but slows them AND knocks them flying.' });
defItem('pitch_thrower', { name: 'Pitch Thrower', kind: 'block', tier: 3, hp: 10, solid: true, color: '#3d3535', color2: '#211c1c',
  fx: { sentry: { range: 7, rate: 1.2, dmg: 8, chill: 2.5 } }, desc: 'FUNCTION: hurls globs of sticky tar that bog enemies down to half speed.' });
defItem('bunker_turret', { name: 'Bunker Turret', kind: 'block', tier: 4, hp: 26, solid: true, color: '#4a4e69', color2: '#2b2d3f',
  fx: { sentry: { range: 9, rate: 0.7, dmg: 15 }, glow: 1 }, desc: 'FUNCTION: a sentry in obsidian armor — 26 hits to crack, and it shoots back the whole time.' });
defItem('guard_post', { name: 'Guard Post', kind: 'block', tier: 3, hp: 14, solid: true, animated: true, color: '#bc4749', color2: '#823033',
  fx: { sentry: { range: 9, rate: 0.8, dmg: 12 }, alarm: 10 }, desc: 'FUNCTION: turret + alarm in one block. It warns you AND opens fire.' });
/* defense blocks */
defItem('spiked_wall', { name: 'Spiked Wall', kind: 'block', tier: 3, hp: 16, solid: true, color: '#9a6a4a', color2: '#6b4a33',
  fx: { enemyDamage: 18 }, desc: 'FUNCTION: a fortified wall studded with enemy-shredding spikes. The proper moat lining.' });
defItem('snare_trap', { name: 'Snare Trap', kind: 'block', tier: 2, hp: 6, solid: true, animated: true, color: '#2e2828', color2: '#181414',
  fx: { enemyDamage: 8, enemySticky: true }, desc: 'FUNCTION: tar studded with barbs — enemies crossing it slow to a crawl while being shredded.' });
defItem('powder_drift', { name: 'Powder Drift', kind: 'block', tier: 2, hp: 4, solid: true, color: '#e8eff7', color2: '#b9c9db',
  fx: { enemySticky: true }, desc: 'FUNCTION: deep snow — ENEMIES wade through at half speed, you walk on top just fine.' });
defItem('mega_mine', { name: 'Cluster Mine', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#2d6a4f', color2: '#1b4332',
  fx: { mine: { dmg: 110, r: 3 } }, desc: 'FUNCTION: a proximity mine with triple the payload and a wider blast. Sleep even more soundly.' });
defItem('icicle_trap', { name: 'Icicle Trap', kind: 'block', tier: 2, hp: 5, solid: true, color: '#bde0fe', color2: '#7fb3d9',
  fx: { enemyDamage: 14, chillAura: 2 }, desc: 'FUNCTION: jagged ice that cuts AND chills enemies on contact.' });
/* traversal wave 3 */
defItem('escalator', { name: 'Escalator Vine', kind: 'block', tier: 3, hp: 5, solid: false, color: '#52b788', color2: '#2d6a4f',
  fx: { ladder: true, escalator: true }, desc: 'FUNCTION: a climbing vine that carries you UP automatically. Stand in it and rise.' });
defItem('sky_geyser', { name: 'Sky Geyser', kind: 'block', tier: 4, hp: 8, solid: true, animated: true, color: '#56cfe1', color2: '#2e8fa3',
  fx: { updraft: 16 }, desc: 'FUNCTION: an industrial updraft twice as tall — 16 tiles of rideable wind. Skyscraper elevator shafts.' });
defItem('launch_rail', { name: 'Launch Rail', kind: 'block', tier: 4, hp: 7, solid: true, animated: true, color: '#f9c74f', color2: '#bd932f',
  fx: { conveyor: 470, bounce: 900 }, desc: 'FUNCTION: a hyper-conveyor that also flings you upward at the end. Rollercoaster engineering.' });
defItem('glacier_ledge', { name: 'Glacier Ledge', kind: 'block', tier: 3, hp: 5, solid: false, transparent: true, slippery: true, color: '#a8d8f0', color2: '#6fb8d4',
  fx: { platform: true }, desc: 'FUNCTION: a one-way platform of pure ice — you slide the moment you land. Parkour spice.' });
defItem('feather_ledge', { name: 'Feather Ledge', kind: 'block', tier: 4, hp: 5, solid: false, color: '#cdb4db', color2: '#9a7fb0',
  fx: { platform: true, gravAura: 0.5, auraRange: 3 }, desc: 'FUNCTION: a platform wrapped in low gravity — jumps near it float like the moon.' });
defItem('jingle_spring', { name: 'Jingle Spring', kind: 'block', tier: 3, hp: 6, solid: true, animated: true, color: '#f7a8d8', color2: '#c26aa4',
  fx: { bounce: 950, note: true }, desc: 'FUNCTION: a bounce pad that plays a chime on every launch. Build a playable bounce-organ.' });
defItem('aquarium', { name: 'Aquarium', kind: 'block', tier: 3, hp: 6, solid: true, transparent: true, animated: true, color: '#48cae4', color2: '#2e8fa3',
  fx: { lure: 3, glow: 2 }, desc: 'FUNCTION: a glass tank of live data-fish. Decorative AND doubles as a weak fishing lure.' });
defItem('prism_cluster', { name: 'Prism Cluster', kind: 'block', tier: 4, hp: 12, solid: true, animated: true, color: '#ff9de2', color2: '#b25fa3',
  gemVal: [14, 24], fx: { glow: 4 }, desc: 'FUNCTION: the premium gem farm — bursts into 14–24 gems. Obsidian-pressed crystal.' });
/* gear wave 3 */
defItem('skate_blades', { name: 'Skate Blades', kind: 'gear', slot: 'feet', tier: 3,
  fx: { speed: 1.6, skate: true },
  desc: 'FUNCTION: +60% top speed, but you handle like you\'re ALWAYS on ice. High skill, high speed.' });
defItem('groove_boots', { name: 'Groove Boots', kind: 'gear', slot: 'feet', tier: 4,
  fx: { speed: 1.3, dodge: 0.08, doubleJump: 1 },
  desc: 'FUNCTION: disco-powered footwork — +30% speed, a double jump, and 8% of attacks simply miss you.' });
defItem('bramble_shell', { name: 'Bramble Shell', kind: 'gear', slot: 'back', tier: 4,
  fx: { armor: 0.25, thorns: 0.25 },
  desc: 'FUNCTION: armored AND spiteful — 25% less damage taken, 25% reflected back.' });
defItem('freerun_chip', { name: 'Freerun Chip', kind: 'gear', slot: 'chip', tier: 4,
  fx: { wallCling: true, doubleJump: 1 },
  desc: 'FUNCTION: wall-slides, wall-jumps AND an extra mid-air jump. The complete parkour kit on one chip.' });
defItem('greed_chip', { name: 'Greed Chip', kind: 'gear', slot: 'chip', tier: 4,
  fx: { greed: true, magnet: 5 },
  desc: 'FUNCTION: every gem you collect also grants XP. Wealth IS knowledge.' });
defItem('mortar_mite', { name: 'Mortar Mite', kind: 'gear', slot: 'pet', tier: 4,
  fx: { pet: { dmg: 16, rate: 1.9, range: 8, color: '#bc6c25' } },
  desc: 'FUNCTION: a slow, heavy-hitting artillery familiar. Boom, reload, boom.' });
defItem('spark_sprite', { name: 'Spark Sprite', kind: 'gear', slot: 'pet', tier: 4,
  fx: { pet: { dmg: 5, rate: 0.45, range: 7, color: '#6ee7ff' } },
  desc: 'FUNCTION: a hyperactive zap-bug firing more than twice a second. Death by static.' });
/* consumable arsenal */
defItem('elixir', { name: 'Elixir', kind: 'consumable', tier: 3, heal: 999,
  desc: 'FUNCTION: a FULL heal in a bottle. Grow a tree of second chances.' });
defItem('cluster_bomb', { name: 'Cluster Bomb', kind: 'consumable', tier: 3, cluster: { count: 3, radius: 2, dmg: 45 },
  desc: 'FUNCTION: click a spot to carpet it with three staggered detonations. Excavation OR extermination.' });
defItem('stasis_grenade', { name: 'Stasis Grenade', kind: 'consumable', tier: 3, stasis: 4,
  desc: 'FUNCTION: click to freeze-frame the fight — EVERY enemy on screen crawls at half speed for 4 seconds.' });
defItem('lucky_soda', { name: 'Lucky Soda', kind: 'consumable', tier: 3, buff: { dur: 60, speed: 1, dmg: 1, gem: true },
  desc: 'FUNCTION: 60 seconds of +50% gem drops from everything you break. Chug before a mining run.' });

/* ============ NETWORK WAVE 4 — capstones, automation, exotics ============ */
/* traps & coils */
defItem('venom_spikes', { name: 'Venom Spikes', kind: 'block', tier: 4, hp: 8, solid: true, color: '#80b918', color2: '#527513',
  fx: { enemyDamage: 14, enemyBurn: { dps: 9, dur: 3 } }, desc: 'FUNCTION: envenomed barbs — enemies that touch them keep corroding for 3 seconds.' });
defItem('shock_trap', { name: 'Shock Trap', kind: 'block', tier: 4, hp: 10, solid: true, animated: true, color: '#6ee7ff', color2: '#2a6f8f',
  fx: { enemyDamage: 30, glow: 2 }, desc: 'FUNCTION: a charged plate that discharges 30 damage into anything hostile that touches it.' });
defItem('blizzard_coil', { name: 'Blizzard Coil', kind: 'block', tier: 4, hp: 12, solid: true, animated: true, color: '#caf0f8', color2: '#7fb3d9',
  fx: { chillAura: 10, glow: 4 }, desc: 'FUNCTION: an industrial cold engine — every enemy within TEN tiles crawls at half speed.' });
defItem('inferno_coil', { name: 'Inferno Coil', kind: 'block', tier: 4, hp: 12, solid: true, animated: true, color: '#ff5714', color2: '#a03612',
  fx: { tesla: { range: 7, rate: 1.4, dmg: 8, chains: 3, burn: { dps: 7, dur: 2 } }, glow: 4 }, desc: 'FUNCTION: chain lightning that IGNITES all three targets it arcs through.' });
defItem('pyre', { name: 'Grand Pyre', kind: 'block', tier: 3, hp: 8, solid: true, animated: true, color: '#e25822', color2: '#8a3212',
  fx: { glow: 8, enemyDamage: 12 }, desc: 'FUNCTION: a bonfire visible from across the world — lights everything, burns any enemy that touches it.' });
defItem('solar_lamp', { name: 'Solar Lamp', kind: 'block', tier: 4, hp: 10, solid: true, animated: true, color: '#ffea00', color2: '#c9b800',
  fx: { growAura: 2.5, auraRange: 6, glow: 6 }, desc: 'FUNCTION: bottled sunlight — trees within 6 tiles grow 2.5× faster. The endgame farm core.' });
defItem('sanctuary', { name: 'Sanctuary Stone', kind: 'block', tier: 4, hp: 14, solid: true, animated: true, color: '#ffe8d6', color2: '#c9a88a',
  fx: { heal: 8, healRange: 6, glow: 5 }, desc: 'FUNCTION: a consecrated hearthstone with double the healing over triple the range. Boss-camp core.' });
defItem('gilded_ledge', { name: 'Gilded Ledge', kind: 'block', tier: 4, hp: 6, solid: false, color: '#ffd166', color2: '#b8901f',
  fx: { platform: true, gemAura: 3 }, desc: 'FUNCTION: a golden one-way platform — mining while standing on it drops 50% more gems.' });
defItem('bait_totem', { name: 'Bait Totem', kind: 'block', tier: 4, hp: 12, solid: true, animated: true, color: '#d90429', color2: '#8a0018',
  fx: { bait: 8, glow: 2 }, desc: 'FUNCTION: enemies can\'t resist walking toward it. Place it over a grinder pit and let physics farm for you.' });
/* automation */
defItem('harvest_bot', { name: 'Harvest Bot', kind: 'block', tier: 4, hp: 12, solid: true, animated: true, color: '#80b918', color2: '#527513',
  fx: { harvester: 5, glow: 2 }, desc: 'FUNCTION: automatically harvests every READY tree within 5 tiles. Pair with a Magnet Pylon for a zero-click farm.' });
/* elemental turret capstones */
defItem('railgun_turret', { name: 'Railgun Turret', kind: 'block', tier: 4, hp: 16, solid: true, color: '#c77dff', color2: '#7a4bad',
  fx: { sentry: { range: 12, rate: 2.4, dmg: 32, pierce: true } }, desc: 'FUNCTION: a slow, screen-crossing slug that pierces EVERY enemy in the line.' });
defItem('heavy_mortar', { name: 'Heavy Mortar', kind: 'block', tier: 4, hp: 18, solid: true, color: '#7f4a19', color2: '#4d2c0e',
  fx: { sentry: { range: 10, rate: 2.0, dmg: 30, arc: true } }, desc: 'FUNCTION: long-range explosive shells lobbed clean over your walls.' });
/* music */
defItem('bass_block', { name: 'Bass Block', kind: 'block', tier: 3, hp: 5, solid: true, color: '#3a2e39', color2: '#221a21',
  fx: { note: true, noteLow: true }, desc: 'FUNCTION: a chime block pitched an octave DOWN. Now your floor-songs have a bassline. Tune with [S].' });
defItem('drum_pad', { name: 'Drum Pad', kind: 'block', tier: 3, hp: 6, solid: true, color: '#9c6644', color2: '#6b4630',
  fx: { note: true, drum: true }, desc: 'FUNCTION: a percussive step-pad — every footfall is a beat. Complete the band.' });
/* super tools */
defItem('gem_drill', { name: 'Gem Drill', kind: 'tool', tier: 4, minePower: 3, mineRate: 9, dmg: 10, rate: 4, range: 1.6, oreBoost: 1.5, color: '#6ee7ff',
  desc: 'FUNCTION: elite mining speed AND ore veins yield 50% more gems while you hold it.' });
defItem('obsidian_pick', { name: 'Obsidian Pick', kind: 'tool', tier: 4, minePower: 4, mineRate: 6, dmg: 16, rate: 3, range: 1.7, color: '#9d4edd',
  desc: 'FUNCTION: power-4 mining without fighting a single boss. Obsidian cracks like glass.' });
defItem('vacuum_drill', { name: 'Vacuum Drill', kind: 'tool', tier: 4, minePower: 3, mineRate: 8, dmg: 10, rate: 4, range: 1.6, magnet: 6, color: '#e63946',
  desc: 'FUNCTION: a drill with a built-in loot magnet — everything you mine flies straight to you.' });
/* elemental discs */
defItem('meteor_disc', { name: 'Meteor Disc', kind: 'weapon', tier: 4, dmg: 20, rate: 2.5, burn: { dps: 7, dur: 2 }, minePower: 1, mineRate: 4,
  projectile: { speed: 640, color: '#ff7b00', pierce: true, boomerang: true },
  desc: 'FUNCTION: a returning disc of fire — everything it passes through burns twice.' });
defItem('glacier_disc', { name: 'Glacier Disc', kind: 'weapon', tier: 4, dmg: 18, rate: 2.5, chill: 2.2, minePower: 1, mineRate: 4,
  projectile: { speed: 640, color: '#a8d8f0', pierce: true, boomerang: true },
  desc: 'FUNCTION: a returning blade of ice that leaves the whole crowd slowed in both directions.' });
defItem('storm_disc', { name: 'Storm Disc', kind: 'weapon', tier: 4, dmg: 26, rate: 2.5, knock: 300, minePower: 1, mineRate: 4,
  projectile: { speed: 700, color: '#6ee7ff', pierce: true, boomerang: true },
  desc: 'FUNCTION: the heaviest recall disc — thunderous damage and knockback, out AND back.' });
/* melee capstones */
defItem('equinox_maul', { name: 'Equinox Maul', kind: 'weapon', tier: 4, dmg: 50, rate: 1.3, range: 2.0, knock: 520, burn: { dps: 8, dur: 2.5 }, chill: 2.5, minePower: 2, mineRate: 3, color: '#f72585',
  desc: 'FUNCTION: fire AND ice in one swing — targets fly away burning and frozen at once. The melee capstone.' });
defItem('paradox_fang', { name: 'Paradox Fang', kind: 'weapon', tier: 4, dmg: 17, rate: 7, range: 2.0, burn: { dps: 5, dur: 1.5 }, chill: 1.5, minePower: 1, mineRate: 4, color: '#fff',
  desc: 'FUNCTION: seven contradictory slashes per second, each one burning and freezing simultaneously.' });
/* gear wave 4 */
defItem('frost_shell', { name: 'Frost Shell', kind: 'gear', slot: 'back', tier: 4,
  fx: { armor: 0.2, chillTouch: 2.5 },
  desc: 'FUNCTION: a shell of living ice — 20% armor, and anything that hits you gets frozen to half speed.' });
defItem('cinder_shell', { name: 'Cinder Shell', kind: 'gear', slot: 'back', tier: 4,
  fx: { armor: 0.15, burnTouch: { dps: 8, dur: 2.5 } },
  desc: 'FUNCTION: smoldering plate — 15% armor, and attackers catch fire on contact.' });
defItem('afterburner', { name: 'Afterburner', kind: 'gear', slot: 'back', tier: 4,
  fx: { jetpack: { thrust: 1950, fuel: 3.6, regen: 0.8 } },
  desc: 'FUNCTION: the jetpack, overclocked — 30% more thrust, 40% more air time, faster refuel.' });
defItem('sniper_chip', { name: 'Sniper Chip', kind: 'gear', slot: 'chip', tier: 4,
  fx: { gunPower: 1.3 },
  desc: 'FUNCTION: +30% damage AND velocity on every projectile weapon. The gunner\'s chip.' });
defItem('berserk_chip', { name: 'Berserk Chip', kind: 'gear', slot: 'chip', tier: 4,
  fx: { berserk: 1.6 },
  desc: 'FUNCTION: below 40% HP, ALL your damage jumps +60%. Live dangerously, hit apocalyptically.' });
defItem('blink_chip', { name: 'Blink Chip', kind: 'gear', slot: 'chip', tier: 4,
  fx: { dash: { speed: 950, dur: 0.16, cd: 2.0 } },
  desc: 'FUNCTION: press [SHIFT] to blink-dash — no special boots required. Movement is a weapon.' });
defItem('blaze_runners', { name: 'Blaze Runners', kind: 'gear', slot: 'feet', tier: 4,
  fx: { speed: 1.4, fireTrail: { dps: 8, dur: 1.5 } },
  desc: 'FUNCTION: +40% speed and a wake of fire — enemies you brush past while sprinting IGNITE.' });
defItem('aqua_striders', { name: 'Aqua Striders', kind: 'gear', slot: 'feet', tier: 4,
  fx: { speed: 1.2, waterWalk: true },
  desc: 'FUNCTION: walk ON water. Liquid data becomes a road. (+20% speed on any surface.)' });
/* pets wave 4 */
defItem('nurse_gnat', { name: 'Nurse Gnat', kind: 'gear', slot: 'pet', tier: 4,
  fx: { pet: { dmg: 3, rate: 1.8, range: 6, color: '#95d5b2', heal: 1.5 } },
  desc: 'FUNCTION: a gentle medical familiar that patches you up mid-fight. Barely fights; constantly heals.' });
defItem('soot_imp', { name: 'Soot Imp', kind: 'gear', slot: 'pet', tier: 4,
  fx: { pet: { dmg: 9, rate: 1.0, range: 7, color: '#3d3535', chill: 1.2 } },
  desc: 'FUNCTION: a grimy little gremlin whose tar-wads slow whatever they splatter.' });
defItem('prospector_beetle', { name: 'Prospector Beetle', kind: 'gear', slot: 'pet', tier: 4,
  fx: { pet: { dmg: 6, rate: 1.4, range: 6, color: '#ffd166' }, oreBoost: 1.3 },
  desc: 'FUNCTION: a mining companion — ore veins yield 30% more gems while it scuttles beside you.' });
/* consumables wave 4 */
defItem('adrenaline_shot', { name: 'Adrenaline Shot', kind: 'consumable', tier: 3, buff: { dur: 15, speed: 2, dmg: 1 },
  desc: 'FUNCTION: DOUBLE movement speed for 15 seconds. Outrun everything.' });

/* --- THE HIVE tech --- */
defItem('honeycomb', { name: 'Honeycomb Block', kind: 'block', tier: 2, hp: 6, solid: true, animated: true, color: '#f4a800', color2: '#b87f00',
  fx: { enemySticky: true }, desc: 'FUNCTION: sweet, gluey wax — ENEMIES bog down to half speed crossing it. You walk on top just fine.' });
defItem('hive_staff', { name: 'Hive Staff', kind: 'weapon', tier: 9, dmg: 16, rate: 4, unspliceable: true,
  projectile: { speed: 480, color: '#ffd166', homing: 520, life: 3.5 }, minePower: 1, mineRate: 4,
  desc: 'BOSS TECH: fires HOMING stingers that chase enemies down. Point in their general direction and let the swarm sort it out.' });
defItem('queen_wing', { name: 'Queen\'s Wings', kind: 'gear', slot: 'back', tier: 9, unspliceable: true,
  fx: { glide: { fall: 60, boost: 1.4 }, doubleJump: 1 },
  desc: 'BOSS TECH: iridescent wings — glide at will AND a bonus mid-air jump. No fuel, ever.' });
defItem('hive_turret', { name: 'Hive Turret', kind: 'block', tier: 3, hp: 12, solid: true, animated: true, color: '#f4a800', color2: '#8a5e00',
  fx: { sentry: { range: 8, rate: 0.8, dmg: 11 }, glow: 2 }, desc: 'FUNCTION: a turret that spits swarms of homing stingers. Wax-built, endlessly angry.' });
defItem('honey_pot', { name: 'Honey Pot', kind: 'block', tier: 3, hp: 6, solid: true, animated: true, color: '#f4a800', color2: '#b87f00',
  fx: { bounce: 900, enemySticky: true }, desc: 'FUNCTION: a springy pot of honey — launches YOU high while gluing enemies that step on it.' });
defItem('royal_jelly', { name: 'Royal Jelly', kind: 'consumable', tier: 3, heal: 80, buff: { dur: 20, speed: 1.2, dmg: 1.3 },
  desc: 'FUNCTION: heals 80 AND grants +20% speed / +30% damage for 20s. Fit for a queen.' });
defItem('nectar', { name: 'Nectar', kind: 'consumable', tier: 2, heal: 45,
  desc: 'FUNCTION: sweet restorative — heals 45 HP. Grows on a fast, cheap tree.' });

/* ============ DECORATIVE BLOCKS — pure cosmetics (Growtopia-style) ============
   No fx, no function — just for building beautiful bases. `deco:true` marks
   them so the renderer draws bespoke art. They still paint, wall-place, and sell. */
defItem('marble',      { name: 'Marble Block', kind: 'block', tier: 2, hp: 10, solid: true, deco: true, color: '#eae6dd', color2: '#c9c2b4', desc: 'DECOR: polished white marble. The foundation of any grand build.' });
defItem('fabric',      { name: 'Fabric Bolt', kind: 'block', tier: 2, hp: 4, solid: true, deco: true, color: '#c9556e', color2: '#8a3049', desc: 'DECOR: rich woven cloth. Base material for banners and rugs.' });
defItem('pillar',      { name: 'Grand Pillar', kind: 'block', tier: 3, hp: 12, solid: true, deco: true, color: '#eae6dd', color2: '#b8b0a0', desc: 'DECOR: a fluted marble column. Frame your throne room.' });
defItem('statue',      { name: 'Hero Statue', kind: 'block', tier: 3, hp: 12, solid: true, deco: true, color: '#d8d2c6', color2: '#a49c8c', desc: 'DECOR: a heroic figure carved in stone. Immortalize yourself.' });
defItem('painting',    { name: 'Framed Painting', kind: 'block', tier: 2, hp: 5, solid: false, deco: true, color: '#8a5a2a', color2: '#3a6ea5', desc: 'DECOR: a gilded landscape painting. Hang it on any wall.' });
defItem('banner',      { name: 'Wall Banner', kind: 'block', tier: 2, hp: 4, solid: false, deco: true, color: '#c9556e', color2: '#ffd166', desc: 'DECOR: a heraldic banner. Declare your house colors.' });
defItem('rug',         { name: 'Ornate Rug', kind: 'block', tier: 2, hp: 4, solid: false, deco: true, color: '#9c2b3e', color2: '#ffd166', desc: 'DECOR: a plush patterned rug. Tie the room together.' });
defItem('chandelier',  { name: 'Chandelier', kind: 'block', tier: 3, hp: 5, solid: false, deco: true, animated: true, color: '#ffd166', color2: '#c9a227', desc: 'DECOR: a crystal chandelier that shimmers. Purely for the ambiance.' });
defItem('potted_plant',{ name: 'Potted Fern', kind: 'block', tier: 1, hp: 4, solid: false, deco: true, color: '#57904a', color2: '#8a5a2a', desc: 'DECOR: a leafy houseplant. Brings the room to life.' });
defItem('neon_sign',   { name: 'Neon Sign', kind: 'block', tier: 3, hp: 5, solid: true, deco: true, animated: true, color: '#ff6ec7', color2: '#6ee7ff', desc: 'DECOR: a buzzing neon arrow. Vaporwave storefront energy.' });
defItem('bookshelf',   { name: 'Bookshelf', kind: 'block', tier: 2, hp: 6, solid: true, deco: true, color: '#7a4a1e', color2: '#c9556e', desc: 'DECOR: a shelf packed with tomes. Look scholarly.' });
defItem('stained_glass',{ name: 'Stained Glass', kind: 'block', tier: 3, hp: 5, solid: true, deco: true, transparent: true, color: '#c77dff', color2: '#6ee7ff', desc: 'DECOR: a jewel-toned cathedral window. Light pours through it.' });
defItem('grand_clock', { name: 'Grand Clock', kind: 'block', tier: 3, hp: 6, solid: true, deco: true, animated: true, color: '#7a4a1e', color2: '#ffd166', desc: 'DECOR: a stately grandfather clock, hands sweeping. Tells no time, all vibe.' });
defItem('trophy_deco', { name: 'Trophy', kind: 'block', tier: 2, hp: 5, solid: false, deco: true, color: '#ffd166', color2: '#c9a227', desc: 'DECOR: a gleaming golden trophy. You earned this. (Or crafted it.)' });
// second decorative wave — the network keeps branching, still purely for looks
defItem('throne',      { name: 'Royal Throne', kind: 'block', tier: 4, hp: 14, solid: true, deco: true, color: '#c9a227', color2: '#8a3049', desc: 'DECOR: a gilded throne draped in velvet. Sit atop your empire.' });
defItem('fountain_deco',{ name: 'Ornate Fountain', kind: 'block', tier: 3, hp: 8, solid: true, deco: true, animated: true, color: '#a8d8f0', color2: '#c9c2b4', desc: 'DECOR: a marble fountain with trickling water. Pure ambiance.' });
defItem('sconce',      { name: 'Wall Sconce', kind: 'block', tier: 2, hp: 4, solid: false, deco: true, animated: true, color: '#ffb347', color2: '#7a4a1e', desc: 'DECOR: a flickering wall candle. Sets the mood, casts no real light.' });
defItem('mirror',      { name: 'Standing Mirror', kind: 'block', tier: 3, hp: 5, solid: true, deco: true, color: '#c9c2b4', color2: '#8be9fd', desc: 'DECOR: a tall gilded mirror. Admire your avatar.' });
defItem('vase',        { name: 'Flower Vase', kind: 'block', tier: 2, hp: 4, solid: false, deco: true, color: '#4da3ff', color2: '#ff6ec7', desc: 'DECOR: a painted vase bursting with blooms.' });
defItem('curtain',     { name: 'Silk Curtains', kind: 'block', tier: 2, hp: 4, solid: false, deco: true, color: '#9c2b3e', color2: '#ffd166', desc: 'DECOR: draped silk curtains. Frame a window in style.' });
defItem('arcade',      { name: 'Arcade Cabinet', kind: 'block', tier: 3, hp: 8, solid: true, deco: true, animated: true, color: '#2b1055', color2: '#6ee7ff', desc: 'DECOR: a retro arcade machine, attract screen glowing. Plays nothing.' });
defItem('fishbowl',    { name: 'Fishbowl', kind: 'block', tier: 2, hp: 4, solid: false, deco: true, animated: true, color: '#6ee7ff', color2: '#ffb347', desc: 'DECOR: a little fishbowl with a lazy goldfish.' });
defItem('disco_ball',  { name: 'Disco Ball', kind: 'block', tier: 3, hp: 5, solid: false, deco: true, animated: true, color: '#dfe7f5', color2: '#c77dff', desc: 'DECOR: a mirrored ball scattering light. Non-functional glam.' });
defItem('gargoyle',    { name: 'Stone Gargoyle', kind: 'block', tier: 3, hp: 12, solid: true, deco: true, color: '#8a8a94', color2: '#4a4a52', desc: 'DECOR: a brooding carved gargoyle. Guards nothing, judges everything.' });

/* ===================== CONTENT WAVE 6 — new functional gear/pets/consumable ===================== */
defItem('medic_drone', { name: 'Medic Drone', kind: 'gear', slot: 'pet', tier: 3,
  fx: { pet: { dmg: 5, rate: 1.3, range: 8, color: '#3ddc84', heal: 4 } },
  desc: 'FUNCTION: a support familiar — light shots, but it mends your HP while it hovers beside you.' });
defItem('venom_drone', { name: 'Venom Wasp', kind: 'gear', slot: 'pet', tier: 4,
  fx: { pet: { dmg: 8, rate: 1.1, range: 7, color: '#94d82d', burn: { dps: 8, dur: 3 } } },
  desc: 'FUNCTION: a stinging familiar whose shots leave enemies dissolving in acid over time.' });
defItem('prism_lance', { name: 'Prism Lance', kind: 'weapon', tier: 4, dmg: 24, rate: 2.8, minePower: 1, mineRate: 4,
  projectile: { speed: 780, color: '#c77dff', pierce: true },
  desc: 'FUNCTION: fires a refracted crystal beam that skewers everything in a line.' });
defItem('scout_boots', { name: 'Scout Boots', kind: 'gear', slot: 'feet', tier: 3,
  fx: { speed: 1.42, doubleJump: 2 },
  desc: 'FUNCTION: +42% run speed and a TRIPLE jump. Cover ground and climb sky-builds fast.' });
defItem('ward_chip', { name: 'Ward Chip', kind: 'gear', slot: 'chip', tier: 4,
  fx: { armor: 0.2, thorns: 0.25 },
  desc: 'FUNCTION: 20% less damage taken, and 25% of every hit reflected back at the attacker.' });
defItem('nano_broth', { name: 'Nano Broth', kind: 'consumable', tier: 2, heal: 55, buff: { dur: 15, dmg: 1.25, speed: 1.15 },
  desc: 'FUNCTION: restores 55 HP and grants +25% damage & +15% speed for 15s. Field rations for the corrupted frontier.' });

/* ===================== CONTENT WAVE 7 — weapons, gear, pet, block, consumable, decor ===================== */
defItem('war_maul', { name: 'War Maul', kind: 'weapon', tier: 4, dmg: 46, rate: 1.7, range: 1.4, knock: 400, minePower: 3, mineRate: 3,
  color: '#9aa4b4', desc: 'FUNCTION: a colossal two-hand maul — slow, but it flattens crowds and knocks them flying.' });
defItem('plasma_smg', { name: 'Plasma SMG', kind: 'weapon', tier: 4, dmg: 8, rate: 8, minePower: 1, mineRate: 3,
  projectile: { speed: 900, color: '#6ee7ff' }, desc: 'FUNCTION: a buzzsaw of plasma bolts — low damage each, absurd fire rate.' });
defItem('titan_chip', { name: 'Titan Chip', kind: 'gear', slot: 'chip', tier: 4,
  fx: { armor: 0.35 }, desc: 'FUNCTION: heavy plating — take 35% less damage from everything. Tank up.' });
defItem('guardian_orb', { name: 'Guardian Orb', kind: 'gear', slot: 'pet', tier: 4,
  fx: { pet: { dmg: 15, rate: 1.4, range: 8, color: '#ffd166' } },
  desc: 'FUNCTION: a heavy combat familiar — slow shots, but each one hits like a cannon.' });
defItem('battle_stim', { name: 'Battle Stim', kind: 'consumable', tier: 3, heal: 25, buff: { dur: 22, dmg: 1.4, speed: 1.25 },
  desc: 'FUNCTION: a combat injector — +40% damage & +25% speed for 22s, with a small heal. Go loud.' });
defItem('crystal_lamp', { name: 'Crystal Lamp', kind: 'block', tier: 3, hp: 6, solid: true, deco: true, animated: true,
  color: '#a5e8ff', color2: '#6ee7ff', fx: { glow: 4 }, desc: 'DECOR: a faceted crystal lamp that casts soft light. Beautiful, and it actually glows.' });

/* ===================== SEEDS (auto-generated) ===================== */
// Everything spliceable/growable gets a seed. Trees yield the item.
const GROW_TIMES = { 0: 25, 1: 55, 2: 110, 3: 170, 4: 240, 9: 170 }; // seconds by tier
for (const id of Object.keys(ITEMS)) {
  const it = ITEMS[id];
  if (it.kind === 'seed' || it.noDrop || it.kind === 'consumable' || it.kind === 'special') continue;
  if (it.tier === 9 || it.unspliceable) continue; // boss tech: no seeds, obtained only from bosses
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
function defRecipe(a, b, result) {
  const key = [a, b].sort().join('+');
  if (RECIPES[key]) console.warn('DUPLICATE RECIPE PAIR:', key, RECIPES[key], 'vs', result);
  if (!ITEMS[a] || !ITEMS[b] || !ITEMS[result]) console.warn('RECIPE REFERENCES MISSING ITEM:', a, b, result);
  RECIPES[key] = result;
}
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
// ---- the splice network: construction & traversal ----
defRecipe('wood', 'spring_pad', 'platform');
defRecipe('wood', 'conveyor', 'ladder');
defRecipe('brick', 'conveyor', 'speed_pad');
defRecipe('dirt', 'spike_trap', 'tar');
defRecipe('brick', 'crystal_cluster', 'obsidian');
defRecipe('snow', 'spring_pad', 'cloud_block');
defRecipe('conveyor', 'teleporter', 'turbine');
defRecipe('spring_pad', 'teleporter', 'antigrav');
// ---- base infrastructure ----
defRecipe('led_block', 'repair_node', 'growth_lamp');
defRecipe('led_block', 'teleporter', 'fuel_pad');
defRecipe('glass', 'teleporter', 'beacon');
defRecipe('led_block', 'note_block', 'disco');
defRecipe('glass', 'repair_node', 'fountain');
defRecipe('magnet_chip', 'stone', 'magnet_pylon');
defRecipe('dirt', 'repair_node', 'compost');
defRecipe('led_block', 'sentry', 'alarm');
// ---- defense web ----
defRecipe('spike_trap', 'wood', 'barbed');
defRecipe('spike_trap', 'blaster', 'mine_trap');
defRecipe('spike_trap', 'sentry', 'flak_turret');
defRecipe('drill', 'sentry', 'mega_sentry');
defRecipe('ice', 'sentry', 'frost_coil');
defRecipe('repair_node', 'shield_gen', 'fortress_core');
// ---- weapons web ----
defRecipe('brick', 'pickaxe', 'war_hammer');
defRecipe('conveyor', 'sword', 'katana');
defRecipe('spike_trap', 'sword', 'venom_edge');
defRecipe('blaster', 'conveyor', 'scattergun');
defRecipe('blaster', 'ice', 'frost_blaster');
defRecipe('drill', 'laser_rifle', 'railgun');
defRecipe('laser_rifle', 'scattergun', 'starcannon');
// ---- tools web ----
defRecipe('conveyor', 'drill', 'jackhammer');
defRecipe('jackhammer', 'war_hammer', 'omni_tool');
// ---- gear web ----
defRecipe('speed_boots', 'spring_pad', 'rocket_boots');
defRecipe('snow', 'speed_boots', 'moon_boots');
defRecipe('glider_wings', 'jetpack', 'hover_pack');
defRecipe('glass', 'ladder', 'climb_chip');
defRecipe('led_block', 'sign', 'scholar_chip');
defRecipe('glass', 'spike_trap', 'leech_chip');
defRecipe('led_block', 'pickaxe', 'miner_chip');
defRecipe('dirt', 'led_block', 'garden_chip');
defRecipe('crystal_cluster', 'repair_node', 'crystal_heart');
// ---- network wave 2: totems, utility, secret tech ----
defRecipe('glass', 'note_block', 'lure_buoy');
defRecipe('dirt', 'fountain', 'sprinkler');
defRecipe('crystal_cluster', 'led_block', 'fortune_totem');
defRecipe('brick', 'sign', 'xp_shrine');
defRecipe('led_block', 'spike_trap', 'scare_totem');
defRecipe('conveyor', 'note_block', 'jukebox');
defRecipe('brick', 'teleporter', 'ghost_brick');
defRecipe('glider_wings', 'spring_pad', 'boost_ring');
defRecipe('ladder', 'led_block', 'glow_vine');
defRecipe('crystal_cluster', 'spring_pad', 'mega_spring');
defRecipe('conveyor', 'ice', 'speed_rail');
defRecipe('platform', 'repair_node', 'life_ledge');
defRecipe('platform', 'spike_trap', 'trap_ledge');
// ---- gear wave 2 ----
defRecipe('brick', 'shield_gen', 'turtle_pack');
defRecipe('conveyor', 'crystal_cluster', 'battery_chip');
defRecipe('brick', 'spike_trap', 'thorn_chip');
defRecipe('drone_pet', 'ice', 'frost_pet');
defRecipe('drone_pet', 'magnet_chip', 'loot_weevil');
// ---- renewable consumable farms ----
defRecipe('teleporter', 'wood', 'warp_whistle');
defRecipe('glass', 'shield_gen', 'nano_shield');
defRecipe('sign', 'wood', 'brain_juice');
defRecipe('repair_node', 'wood', 'medkit');
defRecipe('pickaxe', 'spike_trap', 'bomb');
defRecipe('blaster', 'led_block', 'firework');
defRecipe('crystal_cluster', 'glass', 'overclock_cola');
// ---- wave 3: the fire branch ----
defRecipe('tar', 'wood', 'torch');
defRecipe('torch', 'brick', 'hearth');
defRecipe('torch', 'spring_pad', 'eruption_pad');
defRecipe('torch', 'platform', 'lantern_ledge');
defRecipe('torch', 'sword', 'ember_saber');
defRecipe('torch', 'katana', 'blaze_katana');
defRecipe('torch', 'war_hammer', 'magma_maul');
defRecipe('torch', 'blaster', 'ember_blaster');
defRecipe('torch', 'scattergun', 'dragon_breath');
defRecipe('torch', 'sentry', 'flame_sentry');
// ---- wave 3: the frost branch ----
defRecipe('ice', 'sword', 'frost_saber');
defRecipe('ice', 'katana', 'frost_fang');
defRecipe('ice', 'war_hammer', 'glacier_maul');
defRecipe('ice', 'led_block', 'frost_lamp');
defRecipe('ice', 'spike_trap', 'icicle_trap');
defRecipe('ice', 'platform', 'glacier_ledge');
defRecipe('ice', 'speed_boots', 'skate_blades');
defRecipe('snow', 'led_block', 'aurora_lamp');
defRecipe('snow', 'sentry', 'snowball_turret');
defRecipe('snow', 'conveyor', 'powder_drift');
// ---- wave 3: shadow & heavy branch ----
defRecipe('tar', 'led_block', 'void_lamp');
defRecipe('tar', 'sentry', 'pitch_thrower');
defRecipe('tar', 'spike_trap', 'snare_trap');
defRecipe('venom_edge', 'sentry', 'venom_sentry');
defRecipe('obsidian', 'sentry', 'bunker_turret');
defRecipe('obsidian', 'crystal_cluster', 'prism_cluster');
defRecipe('alarm', 'sentry', 'guard_post');
defRecipe('barbed', 'brick', 'spiked_wall');
defRecipe('mine_trap', 'brick', 'mega_mine');
// ---- wave 3: traversal ----
defRecipe('ladder', 'conveyor', 'escalator');
defRecipe('turbine', 'antigrav', 'sky_geyser');
defRecipe('speed_rail', 'spring_pad', 'launch_rail');
defRecipe('platform', 'antigrav', 'feather_ledge');
defRecipe('note_block', 'spring_pad', 'jingle_spring');
defRecipe('glass', 'lure_buoy', 'aquarium');
// ---- wave 3: gear ----
defRecipe('disco', 'speed_boots', 'groove_boots');
defRecipe('turtle_pack', 'thorn_chip', 'bramble_shell');
defRecipe('climb_chip', 'spring_pad', 'freerun_chip');
defRecipe('magnet_chip', 'crystal_cluster', 'greed_chip');
defRecipe('flak_turret', 'drone_pet', 'mortar_mite');
defRecipe('tesla_coil', 'drone_pet', 'spark_sprite');
// ---- wave 3: consumable arsenal ----
defRecipe('fountain', 'repair_node', 'elixir');
defRecipe('mine_trap', 'blaster', 'cluster_bomb');
defRecipe('frost_coil', 'glass', 'stasis_grenade');
defRecipe('fortune_totem', 'glass', 'lucky_soda');
// ---- wave 4: traps, coils, capstone blocks ----
defRecipe('spike_trap', 'venom_edge', 'venom_spikes');
defRecipe('tesla_coil', 'spike_trap', 'shock_trap');
defRecipe('frost_coil', 'snow', 'blizzard_coil');
defRecipe('tesla_coil', 'torch', 'inferno_coil');
defRecipe('torch', 'led_block', 'pyre');
defRecipe('growth_lamp', 'torch', 'solar_lamp');
defRecipe('hearth', 'repair_node', 'sanctuary');
defRecipe('platform', 'crystal_cluster', 'gilded_ledge');
defRecipe('scare_totem', 'tar', 'bait_totem');
defRecipe('vendor_bot', 'growth_lamp', 'harvest_bot');
defRecipe('railgun', 'sentry', 'railgun_turret');
defRecipe('flak_turret', 'brick', 'heavy_mortar');
defRecipe('note_block', 'tar', 'bass_block');
defRecipe('note_block', 'brick', 'drum_pad');
// ---- wave 4: super tools & discs ----
defRecipe('drill', 'crystal_cluster', 'gem_drill');
defRecipe('obsidian', 'pickaxe', 'obsidian_pick');
defRecipe('drill', 'magnet_pylon', 'vacuum_drill');
defRecipe('recall_disc', 'torch', 'meteor_disc');
defRecipe('recall_disc', 'ice', 'glacier_disc');
defRecipe('recall_disc', 'tesla_coil', 'storm_disc');
defRecipe('magma_maul', 'glacier_maul', 'equinox_maul');
defRecipe('blaze_katana', 'frost_fang', 'paradox_fang');
// ---- wave 4: gear & pets ----
defRecipe('turtle_pack', 'ice', 'frost_shell');
defRecipe('turtle_pack', 'torch', 'cinder_shell');
defRecipe('jetpack', 'crystal_cluster', 'afterburner');
defRecipe('laser_rifle', 'led_block', 'sniper_chip');
defRecipe('war_hammer', 'led_block', 'berserk_chip');
defRecipe('speed_rail', 'glass', 'blink_chip');
defRecipe('torch', 'speed_boots', 'blaze_runners');
defRecipe('lure_buoy', 'speed_boots', 'aqua_striders');
defRecipe('drone_pet', 'repair_node', 'nurse_gnat');
defRecipe('drone_pet', 'tar', 'soot_imp');
defRecipe('drone_pet', 'crystal_cluster', 'prospector_beetle');
defRecipe('speed_boots', 'glass', 'adrenaline_shot');
// ---- wave 5: hive + misc utility ----
defRecipe('sand', 'led_block', 'honeycomb');   // golden wax
defRecipe('honeycomb', 'sentry', 'hive_turret');
defRecipe('honeycomb', 'spring_pad', 'honey_pot');
defRecipe('honeycomb', 'repair_node', 'royal_jelly');
defRecipe('honeycomb', 'glass', 'nectar');
// ---- decorative branch (cosmetic-only, Growtopia decor) ----
defRecipe('stone', 'snow', 'marble');
defRecipe('wood', 'snow', 'fabric');
defRecipe('marble', 'brick', 'pillar');
defRecipe('marble', 'stone', 'statue');
defRecipe('fabric', 'wood', 'painting');
defRecipe('fabric', 'brick', 'banner');
defRecipe('fabric', 'sand', 'rug');
defRecipe('marble', 'led_block', 'chandelier');
defRecipe('dirt', 'marble', 'potted_plant');
defRecipe('sand', 'marble', 'neon_sign');
defRecipe('wood', 'marble', 'bookshelf');
defRecipe('glass', 'marble', 'stained_glass');
defRecipe('fabric', 'marble', 'grand_clock');
defRecipe('fabric', 'led_block', 'trophy_deco');
// decorative wave 2 — deeper deco splices (results splice with results)
defRecipe('pillar', 'fabric', 'throne');
defRecipe('marble', 'ice', 'fountain_deco');
defRecipe('wood', 'chandelier', 'sconce');
defRecipe('glass', 'statue', 'mirror');
defRecipe('fabric', 'potted_plant', 'vase');
defRecipe('fabric', 'glass', 'curtain');
defRecipe('neon_sign', 'brick', 'arcade');
defRecipe('glass', 'potted_plant', 'fishbowl');
defRecipe('neon_sign', 'glass', 'disco_ball');
defRecipe('statue', 'brick', 'gargoyle');
// content wave 6 — new functional gear/pets/weapon/consumable
defRecipe('drone_pet', 'fountain', 'medic_drone');
defRecipe('drone_pet', 'spike_trap', 'venom_drone');
defRecipe('blaster', 'crystal_cluster', 'prism_lance');
defRecipe('speed_boots', 'glider_wings', 'scout_boots');
defRecipe('aegis_chip', 'thorn_chip', 'ward_chip');
defRecipe('crystal_cluster', 'fountain', 'nano_broth');
// content wave 7 — weapons, gear, pet, block, consumable
defRecipe('crystal_cluster', 'spike_trap', 'war_maul');
defRecipe('blaster', 'battery_chip', 'plasma_smg');
defRecipe('aegis_chip', 'crystal_cluster', 'titan_chip');
defRecipe('drone_pet', 'sentry', 'guardian_orb');
defRecipe('crystal_cluster', 'sand', 'battle_stim');
defRecipe('crystal_cluster', 'snow', 'crystal_lamp');

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
  const base = { 0: 2, 1: 5, 2: 14, 3: 35, 4: 85 }[it.tier] || 2;
  return it.kind === 'seed' ? Math.max(1, Math.ceil(base * 0.6)) : base;
}


/* ===================== COSMETIC WARDROBE ===================== */
// hand-drawn, layered avatar cosmetics (Growtopia-style dress-up). Each draw()
// runs in the avatar's local space (head ≈ x[-8..8] y[-30..-13], f = facing).
const COSMETICS = [
  // ---- HATS ----
  { id: 'cap', slot: 'hat', name: 'Ball Cap', src: 'start', desc: 'A classic curved-brim cap.', draw: (x, f) => {
    x.fillStyle = '#e63946'; x.beginPath(); x.arc(0, -30, 9, Math.PI, 0); x.fill();
    x.fillRect(f > 0 ? 0 : -15, -31, 15, 3);
    x.fillStyle = '#b5202e'; x.fillRect(-9, -31, 18, 2);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(0, -37, 1.6, 0, 7); x.fill();
  } },
  { id: 'tophat', slot: 'hat', name: 'Top Hat', src: 'store', cost: 20, desc: 'Dapper as it gets.', draw: (x) => {
    x.fillStyle = '#15151d'; x.fillRect(-12, -31, 24, 3);
    x.fillRect(-7, -43, 14, 12);
    x.fillStyle = '#c9556e'; x.fillRect(-7, -35, 14, 3);
  } },
  { id: 'safari', slot: 'hat', name: 'Safari Hat', src: 'store', cost: 25, desc: 'For the explorer. Feather included.', draw: (x, f) => {
    x.fillStyle = '#c9b280'; x.beginPath(); x.ellipse(0, -30, 14, 4, 0, 0, 7); x.fill();
    x.fillStyle = '#b09a68'; x.fillRect(-7, -40, 14, 10);
    x.fillStyle = '#7a5a2a'; x.fillRect(-7, -33, 14, 2);
    x.strokeStyle = '#e63946'; x.lineWidth = 2; x.beginPath(); x.moveTo(f * 5, -39); x.lineTo(f * 10, -48); x.stroke();
  } },
  { id: 'wizard', slot: 'hat', name: 'Wizard Hat', src: 'store', cost: 30, desc: 'Star-speckled arcane cone.', draw: (x, f, t) => {
    x.fillStyle = '#4a2a82'; x.beginPath(); x.moveTo(-10, -30); x.lineTo(2, -52); x.lineTo(10, -30); x.closePath(); x.fill();
    x.fillStyle = '#2f1a55'; x.fillRect(-11, -31, 22, 3);
    x.fillStyle = '#ffd166'; const tw = 0.6 + 0.4 * Math.sin((t || 0) * 4);
    x.globalAlpha = tw; x.fillRect(-3, -40, 2, 2); x.fillRect(4, -45, 2, 2); x.fillRect(0, -48, 2, 2); x.globalAlpha = 1;
  } },
  { id: 'crown_c', slot: 'hat', name: 'Royal Crown', src: 'boss', desc: 'Dropped by purging a corrupted process.', draw: (x) => {
    x.fillStyle = '#ffd166'; x.beginPath(); x.moveTo(-9, -30); x.lineTo(-9, -39); x.lineTo(-3.5, -33); x.lineTo(0, -41); x.lineTo(3.5, -33); x.lineTo(9, -39); x.lineTo(9, -30); x.closePath(); x.fill();
    x.fillStyle = '#ff4d6d'; x.beginPath(); x.arc(0, -34, 1.6, 0, 7); x.fill();
    x.fillStyle = '#6ee7ff'; x.beginPath(); x.arc(-6, -33, 1.2, 0, 7); x.arc(6, -33, 1.2, 0, 7); x.fill();
  } },
  { id: 'halo', slot: 'hat', name: 'Angel Halo', src: 'ach', desc: 'A glowing ring of light. Earned, not bought.', draw: (x, f, t) => {
    x.save(); x.strokeStyle = '#ffe066'; x.lineWidth = 3; x.shadowColor = '#ffe066'; x.shadowBlur = 8 + 3 * Math.sin((t || 0) * 3);
    x.beginPath(); x.ellipse(0, -40, 9, 3, 0, 0, 7); x.stroke(); x.restore();
  } },
  // ---- FACE ----
  { id: 'round_glasses', slot: 'face', name: 'Round Glasses', src: 'start', desc: 'Scholarly and cute.', draw: (x) => {
    x.strokeStyle = '#20242e'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(-4, -23, 3.4, 0, 7); x.arc(4, -23, 3.4, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(-0.6, -23); x.lineTo(0.6, -23); x.stroke();
    x.fillStyle = 'rgba(200,240,255,0.5)'; x.beginPath(); x.arc(-5, -24, 1, 0, 7); x.arc(3, -24, 1, 0, 7); x.fill();
  } },
  { id: 'shades', slot: 'face', name: 'Cool Shades', src: 'store', cost: 15, desc: 'Deal with it.', draw: (x) => {
    x.fillStyle = '#0d0d12'; x.fillRect(-8, -26, 7, 5); x.fillRect(1, -26, 7, 5); x.fillRect(-2, -25, 3, 1);
    x.fillStyle = 'rgba(110,231,255,0.55)'; x.fillRect(-7, -25, 3, 2); x.fillRect(2, -25, 3, 2);
  } },
  // ---- BACK ----
  { id: 'angel_wings', slot: 'back', name: 'Angel Wings', src: 'store', cost: 40, desc: 'Feathered wings that spread as you glide.', draw: (x, f, t) => {
    for (const s of [-1, 1]) {
      x.fillStyle = '#f4f6ff';
      x.beginPath(); x.moveTo(s * 7, -10); x.quadraticCurveTo(s * 24, -20, s * 21, 4); x.quadraticCurveTo(s * 14, -3, s * 7, 0); x.closePath(); x.fill();
      x.strokeStyle = '#d3daf0'; x.lineWidth = 1;
      for (let k = 1; k <= 3; k++) { x.beginPath(); x.moveTo(s * 8, -8 + k * 3); x.lineTo(s * (10 + k * 4), -6 + k * 4); x.stroke(); }
    }
  } },
  { id: 'bat_wings', slot: 'back', name: 'Bat Wings', src: 'store', cost: 40, desc: 'Membraned wings for a darker look.', draw: (x) => {
    for (const s of [-1, 1]) {
      x.fillStyle = '#2a2140';
      x.beginPath(); x.moveTo(s * 7, -12); x.lineTo(s * 24, -16); x.lineTo(s * 20, -6); x.lineTo(s * 25, -2); x.lineTo(s * 18, 0); x.lineTo(s * 22, 6); x.lineTo(s * 8, 2); x.closePath(); x.fill();
      x.strokeStyle = '#4a3a68'; x.lineWidth = 1; x.beginPath(); x.moveTo(s * 8, -10); x.lineTo(s * 20, -12); x.moveTo(s * 8, -4); x.lineTo(s * 22, -2); x.stroke();
    }
  } },
  { id: 'cape', slot: 'back', name: 'Hero Cape', src: 'boss', desc: 'A billowing cape. Boss-tier drip.', draw: (x, f, t) => {
    const sw = Math.sin((t || 0) * 3) * 2;
    x.fillStyle = '#9c2b3e'; x.beginPath(); x.moveTo(-8, -12); x.lineTo(8, -12); x.lineTo(6 + sw, 17); x.lineTo(-6 + sw, 17); x.closePath(); x.fill();
    x.fillStyle = '#7a1f30'; x.fillRect(-8, -12, 16, 3);
  } },

  // ===== EXPANSION WAVE — more hand-drawn cosmetics =====
  // ---- HATS ----
  { id: 'beanie', slot: 'hat', name: 'Knit Beanie', src: 'store', cost: 12, tier: 1, desc: 'Snug and warm.', draw: (x) => {
    x.fillStyle = '#2a9d8f'; x.beginPath(); x.arc(0, -29, 9, Math.PI, 0); x.fill(); x.fillRect(-9, -29, 18, 3);
    x.fillStyle = '#21867a'; x.fillRect(-9, -31, 18, 3);
    x.strokeStyle = '#1c716a'; x.lineWidth = 1; for (let i = -7; i <= 7; i += 3) { x.beginPath(); x.moveTo(i, -37); x.lineTo(i, -29); x.stroke(); }
    x.fillStyle = '#e9f5db'; x.beginPath(); x.arc(0, -39, 2.4, 0, 7); x.fill();
  } },
  { id: 'party_hat', slot: 'hat', name: 'Party Hat', src: 'store', cost: 12, tier: 1, desc: 'Every day is a celebration.', draw: (x, f, t) => {
    x.fillStyle = '#ff6392'; x.beginPath(); x.moveTo(-8, -30); x.lineTo(0, -50); x.lineTo(8, -30); x.closePath(); x.fill();
    x.fillStyle = '#ffd166'; x.beginPath(); x.moveTo(-8, -30); x.lineTo(-5, -38); x.lineTo(1, -34); x.lineTo(-2, -30); x.closePath(); x.fill();
    const b = 0.7 + 0.3 * Math.sin((t || 0) * 5);
    x.globalAlpha = b; x.fillStyle = '#6ee7ff'; x.beginPath(); x.arc(0, -51, 2.6, 0, 7); x.fill(); x.globalAlpha = 1;
  } },
  { id: 'headphones', slot: 'hat', name: 'Headphones', src: 'store', cost: 22, tier: 2, desc: 'Beats while you build.', draw: (x, f, t) => {
    x.strokeStyle = '#20242e'; x.lineWidth = 3; x.beginPath(); x.arc(0, -30, 11, Math.PI, 0); x.stroke();
    for (const s of [-1, 1]) { x.fillStyle = '#2b2f3a'; x.fillRect(s * 11 - 3, -32, 6, 9); x.fillStyle = '#ff4d6d'; x.fillRect(s * 11 - 2, -30, 4, 2); }
    const b = 0.4 + 0.4 * Math.abs(Math.sin((t || 0) * 6));
    x.globalAlpha = b; x.fillStyle = '#6ee7ff'; x.fillRect(-1, -42, 2, 2); x.globalAlpha = 1;
  } },
  { id: 'flower_crown', slot: 'hat', name: 'Flower Crown', src: 'store', cost: 22, tier: 2, desc: 'A ring of blossoms.', draw: (x) => {
    const cols = ['#ff6392', '#ffd166', '#8ecae6', '#c77dff', '#3ddc84'];
    for (let i = 0; i < 5; i++) { const px = -8 + i * 4; x.fillStyle = cols[i]; x.beginPath(); x.arc(px, -30, 2.4, 0, 7); x.fill(); x.fillStyle = '#fff5cc'; x.beginPath(); x.arc(px, -30, 0.9, 0, 7); x.fill(); }
    x.strokeStyle = '#3ddc84'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-9, -29); x.quadraticCurveTo(0, -33, 9, -29); x.stroke();
  } },
  { id: 'horns', slot: 'hat', name: 'Demon Horns', src: 'store', cost: 25, tier: 2, desc: 'A little mischief.', draw: (x) => {
    for (const s of [-1, 1]) { x.fillStyle = '#c1121f'; x.beginPath(); x.moveTo(s * 5, -29); x.quadraticCurveTo(s * 11, -34, s * 8, -44); x.quadraticCurveTo(s * 6, -36, s * 2, -30); x.closePath(); x.fill(); x.fillStyle = '#7a0c15'; x.beginPath(); x.arc(s * 4, -30, 1, 0, 7); x.fill(); }
  } },
  { id: 'pirate_hat', slot: 'hat', name: 'Pirate Tricorn', src: 'boss', tier: 3, desc: 'Yarr. Dropped by a purged process.', draw: (x) => {
    x.fillStyle = '#1a1a22'; x.beginPath(); x.moveTo(-13, -30); x.quadraticCurveTo(0, -46, 13, -30); x.quadraticCurveTo(0, -35, -13, -30); x.closePath(); x.fill();
    x.fillStyle = '#c9a227'; x.fillRect(-9, -33, 18, 1.5);
    x.fillStyle = '#eaeaea'; x.beginPath(); x.arc(0, -37, 1.8, 0, 7); x.fill(); x.fillRect(-2.4, -36, 4.8, 1.4);
  } },
  { id: 'cyber_visor', slot: 'hat', name: 'Cyber Visor', src: 'ach', tier: 4, desc: 'A glowing band of light. Earned by clearing the network.', draw: (x, f, t) => {
    const b = 0.6 + 0.4 * Math.sin((t || 0) * 4);
    x.save(); x.shadowColor = '#6ee7ff'; x.shadowBlur = 7 * b;
    x.fillStyle = '#0e2233'; x.fillRect(-10, -33, 20, 5);
    x.fillStyle = 'rgba(110,231,255,' + b + ')'; x.fillRect(-9, -32, 18, 2);
    x.restore();
  } },
  // ---- FACE ----
  { id: 'eyepatch', slot: 'face', name: 'Eye Patch', src: 'store', cost: 12, tier: 1, desc: 'Battle-scarred.', draw: (x) => {
    x.strokeStyle = '#15151d'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(-8, -27); x.lineTo(8, -25); x.stroke();
    x.fillStyle = '#15151d'; x.fillRect(-7, -26, 6, 5);
  } },
  { id: 'monocle', slot: 'face', name: 'Monocle', src: 'store', cost: 18, tier: 2, desc: 'Quite distinguished.', draw: (x) => {
    x.strokeStyle = '#d4af37'; x.lineWidth = 1.4; x.beginPath(); x.arc(4, -23, 3.4, 0, 7); x.stroke();
    x.fillStyle = 'rgba(200,240,255,0.4)'; x.beginPath(); x.arc(3, -24, 1.2, 0, 7); x.fill();
    x.strokeStyle = '#d4af37'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(6, -20); x.lineTo(8, -13); x.stroke();
  } },
  { id: 'mustache', slot: 'face', name: 'Fancy Stache', src: 'store', cost: 10, tier: 1, desc: 'A magnificent moustache.', draw: (x) => {
    x.fillStyle = '#3a2a1a'; x.beginPath(); x.moveTo(0, -16); x.quadraticCurveTo(-6, -18, -8, -14); x.quadraticCurveTo(-5, -15, 0, -15); x.quadraticCurveTo(5, -15, 8, -14); x.quadraticCurveTo(6, -18, 0, -16); x.closePath(); x.fill();
  } },
  { id: 'ninja_mask', slot: 'face', name: 'Ninja Mask', src: 'store', cost: 20, tier: 2, desc: 'Silent and unseen.', draw: (x) => {
    x.fillStyle = '#1b2430'; x.fillRect(-8, -27, 16, 5);
    x.fillStyle = '#0d1017'; x.fillRect(-8, -22, 16, 9);
    x.fillStyle = '#6ee7ff'; x.fillRect(-5, -25, 3, 1.6); x.fillRect(3, -25, 3, 1.6);
  } },
  // ---- BACK ----
  { id: 'scarf', slot: 'back', name: 'Flowing Scarf', src: 'store', cost: 15, tier: 1, desc: 'Trails dramatically in the wind.', draw: (x, f, t) => {
    const sw = Math.sin((t || 0) * 3.5) * 3;
    x.fillStyle = '#e63946'; x.fillRect(-7, -13, 14, 4);
    x.beginPath(); x.moveTo(-f * 4, -10); x.lineTo(-f * 4 - 4, -9); x.lineTo(-f * 9 + sw, 6); x.lineTo(-f * 5 + sw, 6); x.closePath(); x.fill();
  } },
  { id: 'backpack', slot: 'back', name: 'Explorer Pack', src: 'store', cost: 25, tier: 2, desc: 'Ready for adventure.', draw: (x) => {
    x.fillStyle = '#8a5a2b'; x.fillRect(-7, -10, 14, 16); x.fillStyle = '#6f4620'; x.fillRect(-7, -10, 14, 3);
    x.fillStyle = '#c98f4f'; x.fillRect(-5, -4, 10, 6); x.fillStyle = '#3a2a1a'; x.fillRect(-1, -5, 2, 8);
  } },
  { id: 'butterfly_wings', slot: 'back', name: 'Butterfly Wings', src: 'store', cost: 45, tier: 3, desc: 'Delicate, iridescent wings.', draw: (x, f, t) => {
    const fl = 1 + 0.12 * Math.sin((t || 0) * 4);
    for (const s of [-1, 1]) {
      x.save(); x.scale(s * fl, 1);
      x.fillStyle = '#c77dff'; x.beginPath(); x.ellipse(13, -6, 9, 7, -0.4, 0, 7); x.fill();
      x.fillStyle = '#8ecae6'; x.beginPath(); x.ellipse(11, 6, 6, 5, 0.3, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.arc(14, -7, 1.6, 0, 7); x.fill();
      x.restore();
    }
  } },
  { id: 'jetpack_c', slot: 'back', name: 'Chrome Jetpack', src: 'store', cost: 50, tier: 3, desc: 'Cosmetic jetpack with a live flame.', draw: (x, f, t) => {
    for (const s of [-1, 1]) { x.fillStyle = '#b8c0cc'; x.fillRect(s * 6 - 3, -11, 6, 15); x.fillStyle = '#7f8896'; x.fillRect(s * 6 - 3, -11, 6, 3); }
    const fl = 3 + 2 * Math.abs(Math.sin((t || 0) * 12));
    for (const s of [-1, 1]) { x.fillStyle = '#ffb703'; x.beginPath(); x.moveTo(s * 6 - 2, 4); x.lineTo(s * 6 + 2, 4); x.lineTo(s * 6, 4 + fl); x.closePath(); x.fill(); }
  } },
  { id: 'dragon_wings', slot: 'back', name: 'Dragon Wings', src: 'boss', tier: 4, desc: 'Vast draconic wings. Purge five processes to earn them.', draw: (x, f, t) => {
    const fl = 1 + 0.1 * Math.sin((t || 0) * 3);
    for (const s of [-1, 1]) {
      x.save(); x.scale(s * fl, 1);
      x.fillStyle = '#3a1a4a'; x.beginPath(); x.moveTo(6, -12); x.lineTo(26, -20); x.lineTo(22, -8); x.lineTo(28, -3); x.lineTo(20, 0); x.lineTo(24, 8); x.lineTo(14, 4); x.lineTo(7, 2); x.closePath(); x.fill();
      x.strokeStyle = '#7b2ff7'; x.lineWidth = 1; x.beginPath(); x.moveTo(8, -9); x.lineTo(24, -16); x.moveTo(8, -2); x.lineTo(26, -2); x.moveTo(9, 2); x.lineTo(22, 6); x.stroke();
      x.restore();
    }
  } },

  // ===== HAIR (framing the head, under the hat) =====
  { id: 'hair_spiky', slot: 'hair', name: 'Spiky Hair', src: 'store', cost: 12, tier: 1, desc: 'Gravity-defying spikes.', draw: (x) => {
    x.fillStyle = '#3a2a1a'; for (let i = -7; i <= 7; i += 3.5) { x.beginPath(); x.moveTo(i - 2, -29); x.lineTo(i, -38); x.lineTo(i + 2, -29); x.closePath(); x.fill(); }
  } },
  { id: 'hair_long', slot: 'hair', name: 'Long Hair', src: 'store', cost: 12, tier: 1, desc: 'Flowing locks.', draw: (x) => {
    x.fillStyle = '#5a3a1a'; x.fillRect(-9, -31, 18, 5); x.fillRect(-10, -30, 3, 18); x.fillRect(7, -30, 3, 18);
  } },
  { id: 'hair_mohawk', slot: 'hair', name: 'Mohawk', src: 'store', cost: 18, tier: 2, desc: 'Punk to the core.', draw: (x) => {
    x.fillStyle = '#ff4d6d'; for (let i = -6; i <= 6; i += 3) { x.beginPath(); x.moveTo(i - 1.5, -30); x.lineTo(i, -41); x.lineTo(i + 1.5, -30); x.closePath(); x.fill(); }
  } },
  { id: 'hair_afro', slot: 'hair', name: 'Afro', src: 'store', cost: 18, tier: 2, desc: 'Big, round and proud.', draw: (x) => {
    x.fillStyle = '#25201a'; for (let a = 0; a <= Math.PI; a += 0.5) { x.beginPath(); x.arc(Math.cos(a) * 11, -30 - Math.sin(a) * 6, 5, 0, 7); x.fill(); }
  } },
  { id: 'hair_ponytail', slot: 'hair', name: 'Ponytail', src: 'store', cost: 15, tier: 1, desc: 'Tied back and tidy.', draw: (x, f) => {
    x.fillStyle = '#e0a92b'; x.fillRect(-9, -31, 18, 5);
    x.beginPath(); x.moveTo(-f * 8, -30); x.quadraticCurveTo(-f * 15, -24, -f * 12, -12); x.quadraticCurveTo(-f * 8, -20, -f * 6, -28); x.closePath(); x.fill();
  } },
  { id: 'hair_flame', slot: 'hair', name: 'Flame Hair', src: 'ach', tier: 4, desc: 'Hair of living fire. Earned by liberating the network.', draw: (x, f, t) => {
    const fl = Math.sin((t || 0) * 8);
    for (let i = -6; i <= 6; i += 3) { x.fillStyle = i % 2 ? '#ff5714' : '#ffb703'; x.beginPath(); x.moveTo(i - 2, -29); x.lineTo(i + fl, -40 - Math.abs(fl) * 3); x.lineTo(i + 2, -29); x.closePath(); x.fill(); }
  } },

  // ===== SHIRTS (over the torso) =====
  { id: 'shirt_hoodie', slot: 'shirt', name: 'Hoodie', src: 'store', cost: 15, tier: 1, desc: 'Comfy street style.', draw: (x) => {
    x.fillStyle = '#3a86ff'; x.fillRect(-10, -12, 20, 20); x.fillStyle = '#2f6fd6'; x.fillRect(-10, -12, 20, 4);
    x.fillStyle = '#254e9c'; x.fillRect(-2, -12, 4, 8); x.strokeStyle = '#dfe8ff'; x.lineWidth = 1; x.beginPath(); x.moveTo(-1, -6); x.lineTo(-1, 4); x.moveTo(1, -6); x.lineTo(1, 4); x.stroke();
  } },
  { id: 'shirt_suit', slot: 'shirt', name: 'Sharp Suit', src: 'store', cost: 22, tier: 2, desc: 'Dressed to impress.', draw: (x) => {
    x.fillStyle = '#20232b'; x.fillRect(-10, -12, 20, 20);
    x.fillStyle = '#f4f6ff'; x.beginPath(); x.moveTo(-4, -12); x.lineTo(4, -12); x.lineTo(0, 2); x.closePath(); x.fill();
    x.fillStyle = '#c1121f'; x.beginPath(); x.moveTo(-1.5, -8); x.lineTo(1.5, -8); x.lineTo(1, 2); x.lineTo(-1, 2); x.closePath(); x.fill();
  } },
  { id: 'shirt_tee_star', slot: 'shirt', name: 'Star Tee', src: 'store', cost: 12, tier: 1, desc: 'A bright graphic tee.', draw: (x) => {
    x.fillStyle = '#2de2a3'; x.fillRect(-10, -12, 20, 20);
    x.fillStyle = '#ffd166'; x.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 4 * Math.PI / 5; const px = Math.cos(a) * 6, py = -2 + Math.sin(a) * 6; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.fill();
  } },
  { id: 'shirt_hazmat', slot: 'shirt', name: 'Hazmat Suit', src: 'store', cost: 20, tier: 2, desc: 'Contamination-proof.', draw: (x, f, t) => {
    x.fillStyle = '#f2b807'; x.fillRect(-10, -12, 20, 20); x.fillStyle = '#c99400'; x.fillRect(-1, -12, 2, 20);
    const g = 0.5 + 0.5 * Math.abs(Math.sin((t || 0) * 4)); x.globalAlpha = g; x.fillStyle = '#2de2a3'; x.beginPath(); x.arc(0, -2, 3, 0, 7); x.fill(); x.globalAlpha = 1;
  } },
  { id: 'shirt_overalls', slot: 'shirt', name: 'Overalls', src: 'store', cost: 15, tier: 1, desc: 'Ready to work.', draw: (x) => {
    x.fillStyle = '#3457a8'; x.fillRect(-10, -2, 20, 12); x.fillRect(-8, -12, 3, 12); x.fillRect(5, -12, 3, 12);
    x.fillStyle = '#ffd166'; x.fillRect(-3, 0, 6, 4);
  } },
  { id: 'shirt_armor', slot: 'shirt', name: 'Plate Armor', src: 'boss', tier: 3, desc: 'Battle-forged plating. Purge four processes to earn it.', draw: (x, f, t) => {
    x.fillStyle = '#9aa7bd'; x.fillRect(-10, -12, 20, 20); x.fillStyle = '#c3cede'; x.fillRect(-10, -12, 20, 4);
    x.fillStyle = '#727f95'; x.fillRect(-10, -1, 20, 2); x.fillRect(-1, -12, 2, 20);
    const g = 0.4 + 0.3 * Math.sin((t || 0) * 3); x.fillStyle = 'rgba(110,231,255,' + g + ')'; x.beginPath(); x.arc(0, -4, 2.4, 0, 7); x.fill();
  } },

  // ===== HELD (drawn at a hand origin (0,0); item rises upward, gripped by the front hand) =====
  { id: 'hand_torch', slot: 'hand', name: 'Torch', src: 'store', cost: 12, tier: 1, desc: 'A merrily burning torch.', draw: (x, f, t) => {
    x.fillStyle = '#7a4a1e'; x.fillRect(-1.5, -2, 3, 12);
    const fl = 2 + Math.abs(Math.sin((t || 0) * 10)) * 3; x.save(); x.shadowColor = '#ff8a00'; x.shadowBlur = 6;
    x.fillStyle = '#ffb703'; x.beginPath(); x.moveTo(-3, -2); x.lineTo(0, -6 - fl); x.lineTo(3, -2); x.closePath(); x.fill();
    x.fillStyle = '#ff5714'; x.beginPath(); x.arc(0, -3, 1.8, 0, 7); x.fill(); x.restore();
  } },
  { id: 'hand_balloon', slot: 'hand', name: 'Balloon', src: 'store', cost: 12, tier: 1, desc: 'A cheerful floating balloon.', draw: (x, f, t) => {
    const sw = Math.sin((t || 0) * 2) * 1.5; x.strokeStyle = '#cfd8e6'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(0, 2); x.lineTo(sw, -16); x.stroke();
    x.fillStyle = '#ff4d6d'; x.beginPath(); x.arc(sw, -20, 5, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,0.5)'; x.beginPath(); x.arc(sw - 1.5, -22, 1.4, 0, 7); x.fill();
  } },
  { id: 'hand_flower', slot: 'hand', name: 'Bouquet', src: 'store', cost: 15, tier: 1, desc: 'A little bunch of flowers.', draw: (x, f) => {
    x.strokeStyle = '#3ddc84'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(0, 4); x.lineTo(0, -10); x.stroke();
    const cols = ['#ff6392', '#ffd166', '#c77dff']; cols.forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.arc((i - 1) * 3, -12, 2.2, 0, 7); x.fill(); });
  } },
  { id: 'hand_staff', slot: 'hand', name: 'Arcane Staff', src: 'store', cost: 25, tier: 2, desc: 'Crackles with idle magic.', draw: (x, f, t) => {
    x.strokeStyle = '#6f4620'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 12); x.lineTo(0, -16); x.stroke();
    x.strokeStyle = '#5a3818'; x.lineWidth = 1; x.beginPath(); x.moveTo(-1.5, -13); x.lineTo(1.5, -13); x.stroke();
    const g = 0.6 + 0.4 * Math.sin((t || 0) * 5); x.save(); x.shadowColor = '#c77dff'; x.shadowBlur = 9 * g;
    x.fillStyle = '#c77dff'; x.beginPath(); x.arc(0, -19, 3.2, 0, 7); x.fill(); x.fillStyle = '#f0dbff'; x.beginPath(); x.arc(-1, -20, 1, 0, 7); x.fill(); x.restore();
  } },
  { id: 'hand_shield', slot: 'hand', name: 'Round Shield', src: 'store', cost: 22, tier: 2, desc: 'A sturdy cosmetic shield.', draw: (x, f) => {
    x.fillStyle = '#8a5a2b'; x.beginPath(); x.arc(0, 0, 7, 0, 7); x.fill(); x.strokeStyle = '#c9a227'; x.lineWidth = 1.4; x.beginPath(); x.arc(0, 0, 7, 0, 7); x.stroke(); x.fillStyle = '#c9a227'; x.beginPath(); x.arc(0, 0, 2, 0, 7); x.fill();
  } },
  { id: 'hand_umbrella', slot: 'hand', name: 'Umbrella', src: 'store', cost: 20, tier: 2, desc: 'Rain or shine.', draw: (x, f) => {
    x.strokeStyle = '#cfd8e6'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, -8); x.lineTo(0, 10); x.stroke();
    x.fillStyle = '#e63946'; x.beginPath(); x.arc(0, -8, 9, Math.PI, 0); x.fill(); x.fillStyle = '#b5202e'; for (let i = -9; i < 9; i += 6) { x.beginPath(); x.moveTo(i, -8); x.lineTo(i + 3, -11); x.lineTo(i + 6, -8); x.closePath(); x.fill(); }
  } },
  { id: 'hand_lantern', slot: 'hand', name: 'Lantern', src: 'store', cost: 18, tier: 2, desc: 'A warm guiding glow.', draw: (x, f, t) => {
    x.strokeStyle = '#555'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -4); x.lineTo(0, -10); x.stroke();
    const g = 0.6 + 0.3 * Math.sin((t || 0) * 4); x.save(); x.shadowColor = '#ffd166'; x.shadowBlur = 9 * g; x.fillStyle = '#3a3a2a'; x.fillRect(-4, -4, 8, 10); x.fillStyle = 'rgba(255,209,102,' + g + ')'; x.fillRect(-2.5, -2, 5, 6); x.restore();
  } },
  { id: 'hand_katana_c', slot: 'hand', name: 'Spirit Katana', src: 'boss', tier: 3, desc: 'A ceremonial blade. Purge six processes to earn it.', draw: (x, f, t) => {
    x.save(); x.rotate(-0.15);
    x.fillStyle = '#20242e'; x.fillRect(-1.5, 2, 3, 7); x.fillStyle = '#c9a227'; x.fillRect(-3, 0, 6, 2);
    const g = 0.5 + 0.4 * Math.sin((t || 0) * 4); x.save(); x.shadowColor = '#6ee7ff'; x.shadowBlur = 7 * g; x.fillStyle = '#dbe9ff'; x.fillRect(-1, -22, 2, 22); x.restore(); x.restore();
  } },

  // ===== AURAS (radiating around the avatar) =====
  { id: 'aura_sparkle', slot: 'aura', name: 'Sparkle Aura', src: 'store', cost: 25, tier: 2, desc: 'Twinkling motes orbit you.', draw: (x, f, t) => {
    const tt = (t || 0); for (let i = 0; i < 6; i++) { const a = tt * 1.5 + i * Math.PI / 3; const px = Math.cos(a) * 26, py = -6 + Math.sin(a) * 22; const s = 0.5 + 0.5 * Math.sin(tt * 5 + i); x.globalAlpha = s; x.fillStyle = '#fff5cc'; x.fillRect(px - 1, py - 1, 2, 2); } x.globalAlpha = 1;
  } },
  { id: 'aura_ice', slot: 'aura', name: 'Frost Aura', src: 'store', cost: 30, tier: 2, desc: 'A ring of drifting frost.', draw: (x, f, t) => {
    const tt = (t || 0); for (let i = 0; i < 7; i++) { const a = -tt * 1.2 + i * 2 * Math.PI / 7; const px = Math.cos(a) * 27, py = -6 + Math.sin(a) * 23; x.globalAlpha = 0.7; x.fillStyle = '#8ecae6'; x.beginPath(); x.moveTo(px, py - 2.5); x.lineTo(px + 2, py); x.lineTo(px, py + 2.5); x.lineTo(px - 2, py); x.closePath(); x.fill(); } x.globalAlpha = 1;
  } },
  { id: 'aura_shadow', slot: 'aura', name: 'Shadow Aura', src: 'store', cost: 30, tier: 2, desc: 'Darkness pulses around you.', draw: (x, f, t) => {
    const p = 26 + Math.sin((t || 0) * 3) * 3; const g = x.createRadialGradient(0, -6, 8, 0, -6, p); g.addColorStop(0, 'rgba(80,20,120,0)'); g.addColorStop(0.7, 'rgba(60,10,90,0.28)'); g.addColorStop(1, 'rgba(20,0,40,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, -6, p, 0, 7); x.fill();
  } },
  { id: 'aura_hearts', slot: 'aura', name: 'Heart Aura', src: 'store', cost: 25, tier: 2, desc: 'Floating hearts of adoration.', draw: (x, f, t) => {
    const tt = (t || 0); for (let i = 0; i < 3; i++) { const ph = (tt * 0.6 + i / 3) % 1; const py = 8 - ph * 34, px = Math.sin(tt * 2 + i * 2) * 16; x.globalAlpha = 1 - ph; x.fillStyle = '#ff6392'; x.beginPath(); x.arc(px - 1.5, py, 1.5, 0, 7); x.arc(px + 1.5, py, 1.5, 0, 7); x.moveTo(px + 3, py + 0.5); x.lineTo(px, py + 4); x.lineTo(px - 3, py + 0.5); x.closePath(); x.fill(); } x.globalAlpha = 1;
  } },
  { id: 'aura_fire', slot: 'aura', name: 'Inferno Aura', src: 'boss', tier: 4, desc: 'A roaring ring of flame. Dropped by the A D M I N.', draw: (x, f, t) => {
    const tt = (t || 0); for (let i = 0; i < 10; i++) { const a = i * 2 * Math.PI / 10; const fl = 3 + Math.abs(Math.sin(tt * 8 + i)) * 5; const px = Math.cos(a) * 24, py = -6 + Math.sin(a) * 20; x.fillStyle = i % 2 ? '#ff5714' : '#ffb703'; x.globalAlpha = 0.85; x.beginPath(); x.moveTo(px - 2, py); x.lineTo(px + Math.cos(a) * fl, py + Math.sin(a) * fl); x.lineTo(px + 2, py); x.closePath(); x.fill(); } x.globalAlpha = 1;
  } },
  { id: 'aura_rainbow', slot: 'aura', name: 'Prism Aura', src: 'ach', tier: 4, desc: 'A cycling rainbow halo. Earned by purging all seven.', draw: (x, f, t) => {
    const tt = (t || 0); x.lineWidth = 2.5; for (let i = 0; i < 12; i++) { const a = i * 2 * Math.PI / 12; x.strokeStyle = 'hsl(' + ((tt * 90 + i * 30) % 360) + ',90%,62%)'; x.globalAlpha = 0.8; x.beginPath(); x.arc(0, -6, 26, a, a + 0.4); x.stroke(); } x.globalAlpha = 1;
  } },

  // ===== WORLD-BOSS LOOT — the "Overseer" set (src 'world', very strong) =====
  { id: 'overseer_halo', slot: 'hat', name: 'Overseer Halo', src: 'world', set: 'overseer', desc: 'A crown of corrupted light dropped by THE OVERSEER world boss.', draw: (x, f, t) => {
    const g = 0.6 + 0.4 * Math.sin((t || 0) * 3); x.save(); x.shadowColor = '#ff2e63'; x.shadowBlur = 10 * g;
    x.strokeStyle = '#ff2e63'; x.lineWidth = 2.5; x.beginPath(); x.ellipse(0, -40, 10, 3.4, 0, 0, 7); x.stroke();
    x.fillStyle = '#ff2e63'; for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(i * 6, -41); x.lineTo(i * 6, -47); x.lineTo(i * 6 + 2, -41); x.closePath(); x.fill(); } x.restore();
  } },
  { id: 'overseer_cape', slot: 'back', name: 'Overseer Cape', src: 'world', set: 'overseer', desc: 'A cape woven from the void. World-boss loot.', draw: (x, f, t) => {
    const sw = Math.sin((t || 0) * 3) * 2.5;
    const g = x.createLinearGradient(0, -12, 0, 18); g.addColorStop(0, '#2b1055'); g.addColorStop(1, '#0a0518');
    x.fillStyle = g; x.beginPath(); x.moveTo(-9, -12); x.lineTo(9, -12); x.lineTo(7 + sw, 18); x.lineTo(-7 + sw, 18); x.closePath(); x.fill();
    x.save(); x.shadowColor = '#7b2ff7'; x.shadowBlur = 6; x.strokeStyle = '#a06bff'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -10); x.lineTo(sw, 16); x.stroke(); x.restore();
  } },
  { id: 'overseer_blade', slot: 'hand', name: 'Overseer Greatblade', src: 'world', set: 'overseer', desc: 'A humming greatblade. World-boss loot.', draw: (x, f, t) => {
    x.save(); x.rotate(-0.12);
    x.fillStyle = '#20242e'; x.fillRect(-2, 2, 4, 9); x.fillStyle = '#7b2ff7'; x.fillRect(-5, 0, 10, 2.5);
    const g = 0.5 + 0.5 * Math.sin((t || 0) * 4); x.save(); x.shadowColor = '#ff2e63'; x.shadowBlur = 9 * g;
    const bg = x.createLinearGradient(0, -26, 0, 0); bg.addColorStop(0, '#ff6b9d'); bg.addColorStop(1, '#c77dff');
    x.fillStyle = bg; x.beginPath(); x.moveTo(-2.5, 0); x.lineTo(2.5, 0); x.lineTo(1.5, -26); x.lineTo(0, -30); x.lineTo(-1.5, -26); x.closePath(); x.fill(); x.restore(); x.restore();
  } },

  // ===== EVENT / SEASONAL / LIMITED — the strongest gear (src 'event') =====
  { id: 'frostfire_crown', slot: 'hat', name: 'Frostfire Crown', src: 'event', set: 'frostfire', desc: 'LIMITED — a crown of eternal ice and flame. Winterburn event.', draw: (x, f, t) => {
    const g = 0.6 + 0.4 * Math.sin((t || 0) * 4); x.save(); x.shadowBlur = 9 * g;
    x.shadowColor = '#6ee7ff'; x.fillStyle = '#8ecae6'; x.beginPath(); x.moveTo(-9, -30); x.lineTo(-9, -40); x.lineTo(-3, -34); x.closePath(); x.fill();
    x.shadowColor = '#ff5714'; x.fillStyle = '#ff8a3d'; x.beginPath(); x.moveTo(9, -30); x.lineTo(9, -40); x.lineTo(3, -34); x.closePath(); x.fill();
    x.shadowColor = '#fff'; x.fillStyle = '#e9f5ff'; x.beginPath(); x.moveTo(-3, -34); x.lineTo(0, -44); x.lineTo(3, -34); x.closePath(); x.fill();
    x.fillStyle = '#ffd166'; x.fillRect(-9, -31, 18, 2.5); x.restore();
  } },
  { id: 'frostfire_wings', slot: 'back', name: 'Frostfire Wings', src: 'event', set: 'frostfire', desc: 'LIMITED — one wing of ice, one of fire. Winterburn event.', draw: (x, f, t) => {
    const fl = 1 + 0.12 * Math.sin((t || 0) * 4);
    x.save(); x.scale(-fl, 1); x.shadowColor = '#6ee7ff'; x.shadowBlur = 7; x.fillStyle = '#8ecae6';
    x.beginPath(); x.moveTo(7, -10); x.quadraticCurveTo(24, -20, 21, 4); x.quadraticCurveTo(14, -3, 7, 0); x.closePath(); x.fill(); x.restore();
    x.save(); x.scale(fl, 1); x.shadowColor = '#ff5714'; x.shadowBlur = 7; x.fillStyle = '#ff8a3d';
    x.beginPath(); x.moveTo(7, -10); x.quadraticCurveTo(24, -20, 21, 4); x.quadraticCurveTo(14, -3, 7, 0); x.closePath(); x.fill(); x.restore();
  } },
  { id: 'frostfire_aura', slot: 'aura', name: 'Frostfire Aura', src: 'event', set: 'frostfire', desc: 'LIMITED — a swirling ring of frost and ember. Winterburn event.', draw: (x, f, t) => {
    const tt = (t || 0); for (let i = 0; i < 10; i++) { const a = tt * 1.4 + i * 2 * Math.PI / 10; const px = Math.cos(a) * 25, py = -6 + Math.sin(a) * 21; const ice = i % 2 === 0; x.save(); x.shadowColor = ice ? '#6ee7ff' : '#ff5714'; x.shadowBlur = 6; x.fillStyle = ice ? '#bfeaff' : '#ffb703'; x.beginPath(); x.arc(px, py, 1.8, 0, 7); x.fill(); x.restore(); }
  } },
  { id: 'founder_halo', slot: 'hat', name: "Founder's Aureole", src: 'event', pw: 20, desc: 'ONE-TIME — the mark of a founding player. Never obtainable again.', draw: (x, f, t) => {
    const tt = (t || 0); x.save(); x.shadowColor = '#ffd700'; x.shadowBlur = 12;
    x.strokeStyle = '#ffe066'; x.lineWidth = 3; x.beginPath(); x.ellipse(0, -41, 11, 3.6, 0, 0, 7); x.stroke();
    for (let i = 0; i < 8; i++) { const a = tt * 2 + i * Math.PI / 4; x.fillStyle = 'rgba(255,224,102,' + (0.4 + 0.4 * Math.sin(tt * 5 + i)) + ')'; x.fillRect(Math.cos(a) * 13 - 1, -41 + Math.sin(a) * 5 - 1, 2, 2); } x.restore();
  } },
];
const COSMO = {}; for (const c of COSMETICS) COSMO[c.id] = c;
// rarity tier for a cosmetic (drives the wardrobe cell border colour, Growtopia-style)
function cosTier(c) {
  if (!c) return 0;
  if (c.tier != null) return c.tier;
  if (c.src === 'event' || c.src === 'world') return 4;
  if (c.src === 'boss') return 3;
  if (c.src === 'ach') return 4;
  if (c.src === 'store') return (c.cost || 0) >= 40 ? 3 : (c.cost || 0) >= 20 ? 2 : 1;
  return 0;
}
// combat POWER of a cosmetic — the harder to obtain, the stronger.
// Easy-to-splice store clothes barely help; boss/milestone gear is solid;
// world-boss loot is strong; seasonal / limited / one-time event gear is the best.
function cosPower(c) {
  if (!c) return 0;
  if (c.pw != null) return c.pw;
  switch (c.src) {
    case 'event': return 15;   // seasonal / limited / 1-time — strongest
    case 'world': return 12;   // world-boss drops
    case 'ach':   return 8;    // milestones (all-boss clears)
    case 'boss':  return 6;    // sector boss drops
    case 'store': return (c.tier || 1); // 1–3, easy to buy
    default:      return 0;    // starters
  }
}
// themed set bonuses — wear the whole set for a big extra kick
const COSMO_SETS = {
  overseer:  { name: 'Overseer', need: 3, dmg: 0.30, reduce: 0.12, desc: '+30% boss damage · +12% resist' },
  frostfire: { name: 'Frostfire', need: 3, dmg: 0.35, reduce: 0.08, desc: '+35% boss damage · +8% resist' },
};
// small mini-avatar swatch showing a cosmetic, for the wardrobe UI
function cosmeticIcon(id) {
  const c = document.createElement('canvas'); c.width = 52; c.height = 52;
  const x = c.getContext('2d');
  x.translate(26, 42); x.scale(0.66, 0.66);
  const rr = (typeof _rrPath === 'function') ? _rrPath : (ctx, X, Y, w, h) => ctx.rect(X, Y, w, h);
  const sh = (typeof _shade === 'function') ? _shade : (h) => h;
  // rounded, shaded mini-avatar to match the in-game look
  const bg = x.createLinearGradient(0, -12, 0, 10); bg.addColorStop(0, sh('#4361ee', 0.26)); bg.addColorStop(0.55, '#4361ee'); bg.addColorStop(1, sh('#4361ee', -0.22));
  rr(x, -10, -12, 20, 22, 6); x.fillStyle = bg; x.fill();
  const hg = x.createLinearGradient(0, -30, 0, -12); hg.addColorStop(0, sh('#ffd8b1', 0.13)); hg.addColorStop(1, sh('#ffd8b1', -0.16));
  rr(x, -8, -30, 16, 18, 5); x.fillStyle = hg; x.fill();
  rr(x, -3, -27, 12, 8, 3); x.fillStyle = '#0b1220'; x.fill();
  x.fillStyle = '#6ee7ff'; rr(x, -1.5, -25.5, 8.5, 4, 2); x.fill();
  const cm = COSMO[id]; if (cm) { x.save(); if (cm.slot === 'hand') x.translate(13, -6); try { cm.draw(x, 1, 1.2); } catch (e) {} x.restore(); }
  return c;
}

/* ===================== ICON RENDERER v2 ===================== */
// rarity tiers drive icon accents and UI slot borders
const TIER_COLORS = { 0: '#8d99ae', 1: '#3ddc84', 2: '#4cc9f0', 3: '#c77dff', 4: '#ffd166', 9: '#ff4d6d' };
const TIER_NAMES = { 0: 'COMMON', 1: 'UNCOMMON', 2: 'RARE', 3: 'EPIC', 4: 'LEGENDARY', 9: 'BOSS TECH' };
function tierColor(id) { const it = ITEMS[id]; return TIER_COLORS[(it && it.tier) || 0] || TIER_COLORS[0]; }

const _iconCache = {};
// a minimal stand-in world so block icons render with the REAL in-game tile art
const _iconStub = {
  meta: {}, trees: new Map(), bgT: [], doorIdx: -2, w: 9, h: 9,
  idx: () => -1, isSolid: () => false, get: () => null, item: () => null,
};

const ICON_SS = 3;    // supersample: render source art at 3× for smoother, higher-fidelity curves
const ICON_N = 56;    // final icon resolution (was 40) — bigger, crisper stickers in the UI
const ICON_PIX = 46;  // pixelate target — high pixel count per object, detail retained
function iconFor(id) {
  if (_iconCache[id]) return _iconCache[id];
  const art = document.createElement('canvas');
  art.width = 40 * ICON_SS; art.height = 40 * ICON_SS;
  const x = art.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.scale(ICON_SS, ICON_SS); // drawItemIcon keeps drawing in its native 40-unit space
  const it = ITEMS[id];
  if (it) {
    try { drawItemIcon(x, it, id); }
    catch (e) { x.fillStyle = it.color || '#888'; x.fillRect(6, 6, 28, 28); }
  }
  const c = gtFinish(art);
  _iconCache[id] = c;
  return c;
}

// Growtopia-style sticker finish: pixelate → dark outline → gloss bevel → rim → drop shadow
function gtFinish(art) {
  const N = ICON_N;
  const inset = Math.round(N * 0.045), inner = N - inset * 2;
  // 1) pixelate through a mid-res pass (crisp pixel art)
  const small = document.createElement('canvas');
  small.width = ICON_PIX; small.height = ICON_PIX;
  const sx2 = small.getContext('2d');
  sx2.imageSmoothingEnabled = true;
  sx2.drawImage(art, 0, 0, ICON_PIX, ICON_PIX);
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ox = c.getContext('2d', { willReadFrequently: true });
  ox.imageSmoothingEnabled = false;
  ox.drawImage(small, inset, inset, inner, inner);
  // 2) dark sticker outline traced from alpha
  const img = ox.getImageData(0, 0, N, N);
  const d = img.data;
  const a = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) a[i] = d[i * 4 + 3];
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const i = y * N + xx;
    if (a[i] > 50) continue;
    const n = (xx > 0 && a[i - 1] > 90) || (xx < N - 1 && a[i + 1] > 90) || (y > 0 && a[i - N] > 90) || (y < N - 1 && a[i + N] > 90);
    if (n) { const p = i * 4; d[p] = 10; d[p + 1] = 14; d[p + 2] = 26; d[p + 3] = 255; }
  }
  ox.putImageData(img, 0, 0);
  // 3) gloss bevel masked to the sprite
  ox.globalCompositeOperation = 'source-atop';
  const g = ox.createLinearGradient(0, 0, 0, N);
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.05)');
  g.addColorStop(0.62, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.26)');
  ox.fillStyle = g;
  ox.fillRect(0, 0, N, N);
  // 3b) soft top-left rim light for a rounded, sculpted read
  const rim = ox.createRadialGradient(N * 0.33, N * 0.3, N * 0.05, N * 0.37, N * 0.35, N * 0.66);
  rim.addColorStop(0, 'rgba(255,255,255,0.30)');
  rim.addColorStop(0.5, 'rgba(255,255,255,0.06)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  ox.fillStyle = rim; ox.fillRect(0, 0, N, N);
  ox.globalCompositeOperation = 'source-over';
  // 4) composite the finished sprite over its own soft drop shadow for a sticker lift
  const out = document.createElement('canvas');
  out.width = N; out.height = N;
  const oc = out.getContext('2d');
  oc.save();
  oc.globalAlpha = 0.30;
  try { oc.filter = 'blur(1px) brightness(0)'; } catch (e) {}
  oc.drawImage(c, N * 0.04, N * 0.06);   // darkened, blurred, offset silhouette = drop shadow
  oc.restore();
  oc.drawImage(c, 0, 0);   // crisp finished sprite on top
  return out;
}

function drawItemIcon(x, it, id) {
  const T = 1.35; // frozen animation time for a flattering pose
  if (it.kind === 'block') {
    if (id === 'door') { // door renders 2 tiles tall in-world; draw a scaled mini door
      x.fillStyle = it.color; x.fillRect(10, 3, 20, 34);
      x.fillStyle = it.color2; x.fillRect(13, 6, 14, 28);
      x.fillStyle = '#ffd166'; x.fillRect(24, 19, 4, 4);
      return;
    }
    // real in-world appearance, decorations included
    if (typeof World !== 'undefined') World.prototype.drawTile.call(_iconStub, x, id, 3, 5, 4, 4, T, null);
    else { x.fillStyle = it.color; x.fillRect(4, 4, 32, 32); }
    return;
  }
  if (it.kind === 'seed') {
    const base = ITEMS[it.grows] || {};
    // seed pouch, item swatch, tier ribbon
    x.fillStyle = '#4a3826'; x.fillRect(7, 12, 26, 24);
    x.fillStyle = '#332614'; x.fillRect(7, 12, 26, 5);
    x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(9, 19, 22, 6);
    x.fillStyle = base.color || (base.projectile && base.projectile.color) || '#8f8';
    x.beginPath(); x.arc(20, 26, 6.5, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(18, 24, 2.2, 0, 7); x.fill();
    x.strokeStyle = '#3ddc84'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(20, 12); x.quadraticCurveTo(24, 4, 31, 4); x.stroke();
    x.beginPath(); x.moveTo(20, 12); x.quadraticCurveTo(17, 7, 13, 6); x.stroke();
    x.fillStyle = tierColor(it.grows); x.fillRect(7, 34, 26, 2.5);
    return;
  }
  if (it.kind === 'tool') {
    if (it.rod) {
      x.strokeStyle = '#7a5a3a'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(8, 36); x.quadraticCurveTo(22, 10, 32, 6); x.stroke();
      x.strokeStyle = '#9adcf0'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(32, 6); x.lineTo(32, 24); x.stroke();
      x.fillStyle = '#ff4d6d'; x.beginPath(); x.arc(32, 26, 4, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(31, 24.5, 1.5, 0, 7); x.fill();
      return;
    }
    const col = it.color || '#aab4c4';
    x.strokeStyle = '#7a5a3a'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(12, 35); x.lineTo(25, 12); x.stroke();
    if (it.mineRate >= 9 || id === 'jackhammer') { // motorized head
      x.fillStyle = col; x.fillRect(17, 4, 16, 12);
      x.fillStyle = '#1c2536'; x.fillRect(21, 8, 8, 4);
      x.fillStyle = col; x.beginPath(); x.moveTo(33, 8); x.lineTo(39, 11); x.lineTo(33, 14); x.fill();
    } else if (it.area || (it.minePower || 0) >= 4) { // heavy bore cone
      x.fillStyle = col;
      x.beginPath(); x.moveTo(19, 4); x.lineTo(36, 13); x.lineTo(22, 20); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(23, 8); x.lineTo(31, 12); x.stroke();
    } else { // pick head
      x.fillStyle = col;
      x.beginPath(); x.moveTo(13, 9); x.quadraticCurveTo(26, 0, 38, 12); x.quadraticCurveTo(28, 9, 19, 15); x.closePath(); x.fill();
    }
    if (it.magnet) { x.strokeStyle = '#ff4d6d'; x.lineWidth = 3; x.beginPath(); x.arc(10, 10, 6, Math.PI * 0.9, Math.PI * 2.1); x.stroke(); }
    if (it.oreBoost) { x.fillStyle = '#6ee7ff'; x.beginPath(); x.moveTo(8, 8); x.lineTo(12, 12); x.lineTo(8, 16); x.lineTo(4, 12); x.fill(); }
    return;
  }
  if (it.kind === 'weapon') {
    const col = (it.projectile && it.projectile.color) || it.color || '#9adcf0';
    if (it.projectile) {
      if (it.projectile.boomerang) { // recall discs
        x.save(); x.translate(20, 20); x.rotate(0.6);
        x.fillStyle = col;
        x.fillRect(-14, -4, 28, 8); x.fillRect(-4, -14, 8, 28);
        x.fillStyle = 'rgba(255,255,255,0.7)'; x.beginPath(); x.arc(0, 0, 4.5, 0, 7); x.fill();
        x.restore();
      } else if (it.projectile.pierce) { // rail weapons
        x.fillStyle = '#2a3347'; x.fillRect(4, 20, 12, 8);
        x.fillStyle = '#44506b'; x.fillRect(10, 17, 26, 6);
        x.fillStyle = col;
        for (let k = 0; k < 3; k++) x.fillRect(16 + k * 7, 15, 3, 10);
        x.fillRect(34, 18, 6, 4);
        x.shadowColor = col; x.shadowBlur = 6; x.fillRect(34, 18, 6, 4); x.shadowBlur = 0;
      } else if (it.pellets) { // scatterguns
        x.fillStyle = '#44506b'; x.fillRect(6, 18, 20, 9);
        x.fillStyle = '#2a3347'; x.fillRect(4, 25, 8, 10);
        x.fillStyle = col;
        x.beginPath(); x.moveTo(26, 16); x.lineTo(38, 12); x.lineTo(38, 32); x.lineTo(26, 29); x.closePath(); x.fill();
      } else { // blasters
        x.fillStyle = '#44506b'; x.fillRect(8, 18, 20, 8);
        x.fillStyle = '#2a3347'; x.fillRect(6, 24, 8, 10);
        x.fillStyle = col; x.fillRect(28, 20, 8, 4);
        x.shadowColor = col; x.shadowBlur = 7; x.fillRect(28, 20, 8, 4); x.shadowBlur = 0;
      }
    } else {
      const heavy = (it.rate || 3) <= 2, fast = (it.rate || 3) >= 5;
      if (heavy) { // mauls & hammers
        x.strokeStyle = '#7a5a3a'; x.lineWidth = 4;
        x.beginPath(); x.moveTo(14, 37); x.lineTo(24, 10); x.stroke();
        x.fillStyle = it.color || '#adb5bd';
        x.fillRect(14, 3, 20, 14);
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(14, 12, 20, 5);
      } else { // blades: fast = slimmer & longer
        x.strokeStyle = it.color || '#9adcf0'; x.lineWidth = fast ? 3.5 : 5.5;
        x.beginPath(); x.moveTo(fast ? 8 : 10, fast ? 36 : 34); x.lineTo(fast ? 34 : 30, fast ? 4 : 8); x.stroke();
        x.strokeStyle = '#7a5a3a'; x.lineWidth = 4;
        x.beginPath(); x.moveTo(7, 27); x.lineTo(15, 35); x.stroke();
        x.strokeStyle = '#c9a227'; x.lineWidth = 2.5;
        x.beginPath(); x.moveTo(9, 31); x.lineTo(16, 25); x.stroke();
      }
      // elemental aura pips
      if (it.burn) { x.fillStyle = '#ff7b00'; x.beginPath(); x.arc(31, 9, 3, 0, 7); x.arc(26, 5, 2, 0, 7); x.fill(); }
      if (it.chill) { x.fillStyle = '#a8d8f0'; x.beginPath(); x.arc(34, 15, 3, 0, 7); x.arc(37, 9, 2, 0, 7); x.fill(); }
    }
    return;
  }
  if (it.kind === 'gear') {
    drawGearIcon(x, it, id);
    return;
  }
  if (it.kind === 'special') { // world lock
    x.fillStyle = '#ffd166'; x.fillRect(8, 18, 24, 18);
    x.strokeStyle = '#ffd166'; x.lineWidth = 4;
    x.beginPath(); x.arc(20, 18, 8, Math.PI, 0); x.stroke();
    x.fillStyle = '#0d1526'; x.beginPath(); x.arc(20, 26, 5, 0, 7); x.fill();
    x.strokeStyle = '#0d1526'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(20, 26, 3.2, 0, 7); x.moveTo(16.8, 26); x.lineTo(23.2, 26); x.stroke();
    return;
  }
  drawConsumableIcon(x, it, id);
}

function drawGearIcon(x, it, id) {
  const fx = it.fx || {};
  if (it.slot === 'pet') {
    const col = (fx.pet && fx.pet.color) || '#8899aa';
    x.fillStyle = col; x.fillRect(9, 13, 22, 16);
    x.fillStyle = '#0d1526'; x.fillRect(13, 18, 5, 5); x.fillRect(22, 18, 5, 5);
    x.fillStyle = '#6ee7ff'; x.fillRect(14, 19, 3, 3); x.fillRect(23, 19, 3, 3);
    x.strokeStyle = col; x.lineWidth = 2;
    x.beginPath(); x.moveTo(20, 13); x.lineTo(20, 7); x.stroke();
    x.fillStyle = '#ffd166'; x.beginPath(); x.arc(20, 6, 2.5, 0, 7); x.fill();
    if (fx.pet && fx.pet.heal) { x.fillStyle = '#fff'; x.fillRect(18, 30, 4, 9); x.fillRect(15.5, 32.5, 9, 4); }
    if (fx.pet && fx.pet.burn) { x.fillStyle = '#ff7b00'; x.beginPath(); x.moveTo(6, 16); x.lineTo(9, 9); x.lineTo(11, 15); x.fill(); }
    if (fx.pet && fx.pet.chill) { x.fillStyle = '#a8d8f0'; x.beginPath(); x.moveTo(33, 10); x.lineTo(36, 16); x.lineTo(30, 14); x.fill(); }
    if (fx.magnet) { x.strokeStyle = '#ff4d6d'; x.lineWidth = 2.5; x.beginPath(); x.arc(33, 32, 5, Math.PI * 0.9, Math.PI * 2.1); x.stroke(); }
    return;
  }
  if (it.slot === 'back') {
    if (fx.jetpack) {
      const hot = fx.jetpack.thrust > 1600;
      x.fillStyle = hot ? '#c1121f' : '#8899aa';
      x.fillRect(9, 6, 9, 24); x.fillRect(22, 6, 9, 24);
      x.fillStyle = '#5b6577'; x.fillRect(17, 10, 6, 12);
      x.fillStyle = '#ffd166';
      x.beginPath(); x.moveTo(10, 30); x.lineTo(13.5, 39); x.lineTo(17, 30); x.fill();
      x.beginPath(); x.moveTo(23, 30); x.lineTo(26.5, 39); x.lineTo(30, 30); x.fill();
    } else if (fx.hover) {
      x.fillStyle = '#8899aa'; x.fillRect(12, 14, 16, 16);
      x.strokeStyle = '#6ee7ff'; x.lineWidth = 3;
      x.beginPath(); x.ellipse(20, 10, 15, 4.5, 0, 0, 7); x.stroke();
      x.fillStyle = 'rgba(110,231,255,0.5)'; x.fillRect(14, 31, 3, 6); x.fillRect(23, 31, 3, 6);
    } else if (fx.glide) {
      x.fillStyle = '#3ddc84';
      x.beginPath(); x.moveTo(20, 26); x.quadraticCurveTo(2, 8, 4, 20); x.quadraticCurveTo(10, 26, 20, 28); x.fill();
      x.beginPath(); x.moveTo(20, 26); x.quadraticCurveTo(38, 8, 36, 20); x.quadraticCurveTo(30, 26, 20, 28); x.fill();
      x.fillStyle = '#2aa864'; x.fillRect(18, 22, 4, 10);
    } else { // shells
      const col = fx.burnTouch ? '#e25822' : fx.chillTouch ? '#a8d8f0' : fx.thorns ? '#7f5539' : '#588157';
      x.fillStyle = col;
      x.beginPath(); x.arc(20, 24, 14, Math.PI, 0); x.fill();
      x.fillStyle = 'rgba(0,0,0,0.25)';
      x.beginPath(); x.arc(20, 24, 9, Math.PI, 0); x.fill();
      x.fillStyle = col; x.fillRect(6, 24, 28, 4);
      if (fx.thorns) { x.fillStyle = '#4d3421'; for (const [px2, py2] of [[10, 12], [20, 7], [30, 12]]) { x.beginPath(); x.moveTo(px2 - 3, py2 + 5); x.lineTo(px2, py2 - 3); x.lineTo(px2 + 3, py2 + 5); x.fill(); } }
    }
    return;
  }
  if (it.slot === 'feet') {
    const col = fx.fireTrail ? '#e25822' : fx.waterWalk ? '#48cae4' : fx.skate ? '#8ce0f5' : fx.gravMult ? '#cdb4db' : (id === 'storm_boots' ? '#ffd166' : '#3ddc84');
    x.fillStyle = col;
    x.fillRect(10, 8, 11, 18); x.fillRect(10, 22, 22, 10);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(10, 28, 22, 4);
    if (fx.skate) { x.fillStyle = '#e8ecf4'; x.fillRect(8, 33, 26, 2.5); }
    if (fx.dash || (fx.speed || 1) >= 1.4) { x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 2; x.beginPath(); x.moveTo(4, 12); x.lineTo(9, 12); x.moveTo(2, 17); x.lineTo(8, 17); x.stroke(); }
    if (fx.gravMult) { x.fillStyle = '#fff'; x.beginPath(); x.arc(30, 10, 4.5, 0, 7); x.fill(); x.fillStyle = col; x.beginPath(); x.arc(32, 9, 3.5, 0, 7); x.fill(); }
    if (fx.doubleJump) { x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2; x.beginPath(); x.moveTo(26, 18); x.lineTo(29, 13); x.lineTo(32, 18); x.stroke(); }
    if (fx.fireTrail) { x.fillStyle = '#ffd166'; x.beginPath(); x.moveTo(4, 30); x.lineTo(8, 22); x.lineTo(10, 30); x.fill(); }
    if (fx.waterWalk) { x.strokeStyle = '#caf0f8'; x.lineWidth = 2; x.beginPath(); x.moveTo(6, 36); x.quadraticCurveTo(12, 33, 18, 36); x.quadraticCurveTo(24, 39, 34, 36); x.stroke(); }
    return;
  }
  // chips: base + effect glyph
  const base = TIER_COLORS[it.tier] || '#2de2a3';
  x.fillStyle = '#12203a'; x.fillRect(7, 9, 26, 22);
  x.strokeStyle = base; x.lineWidth = 2; x.strokeRect(8, 10, 24, 20);
  x.fillStyle = base;
  for (let k = 0; k < 4; k++) { x.fillRect(11 + k * 6, 5, 3, 4); x.fillRect(11 + k * 6, 31, 3, 4); }
  const fxg = it.fx || {};
  x.fillStyle = '#fff'; x.strokeStyle = '#fff'; x.lineWidth = 2;
  if (id === 'admin_crown') { x.fillStyle = '#ffd166'; x.beginPath(); x.moveTo(12, 26); x.lineTo(12, 15); x.lineTo(16, 20); x.lineTo(20, 13); x.lineTo(24, 20); x.lineTo(28, 15); x.lineTo(28, 26); x.fill(); }
  else if (fxg.dodge) { x.globalAlpha = 0.4; x.fillRect(11, 15, 6, 11); x.globalAlpha = 0.7; x.fillRect(16, 14, 6, 12); x.globalAlpha = 1; x.fillRect(21, 13, 7, 14); }
  else if (fxg.thorns) { for (const px2 of [13, 20, 27]) { x.beginPath(); x.moveTo(px2 - 3, 26); x.lineTo(px2, 14); x.lineTo(px2 + 3, 26); x.fill(); } }
  else if (fxg.xpMult) { x.beginPath(); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * 2.513; const a2 = a + 1.257; x.lineTo(20 + Math.cos(a) * 8, 20 + Math.sin(a) * 8); x.lineTo(20 + Math.cos(a2) * 3.5, 20 + Math.sin(a2) * 3.5); } x.closePath(); x.fill(); }
  else if (fxg.leech) { x.beginPath(); x.moveTo(20, 12); x.quadraticCurveTo(27, 21, 20, 28); x.quadraticCurveTo(13, 21, 20, 12); x.fill(); x.fillStyle = '#ff4d6d'; x.beginPath(); x.arc(20, 22, 3, 0, 7); x.fill(); }
  else if (fxg.oreBoost) { x.beginPath(); x.moveTo(20, 12); x.lineTo(27, 20); x.lineTo(20, 28); x.lineTo(13, 20); x.closePath(); x.fill(); x.fillStyle = '#6ee7ff'; x.beginPath(); x.moveTo(20, 15); x.lineTo(24, 20); x.lineTo(20, 25); x.lineTo(16, 20); x.closePath(); x.fill(); }
  else if (fxg.harvestBonus) { x.beginPath(); x.moveTo(20, 28); x.quadraticCurveTo(12, 20, 20, 12); x.quadraticCurveTo(28, 20, 20, 28); x.fill(); x.strokeStyle = '#12203a'; x.beginPath(); x.moveTo(20, 26); x.lineTo(20, 15); x.stroke(); }
  else if (fxg.maxHp) { x.beginPath(); x.moveTo(20, 28); x.lineTo(12, 19); x.arc(16, 15.5, 4.7, Math.PI, 0, false); x.arc(24, 15.5, 4.7, Math.PI, 0, false); x.closePath(); x.fill(); }
  else if (fxg.energy) { x.beginPath(); x.moveTo(22, 11); x.lineTo(14, 21); x.lineTo(19, 21); x.lineTo(17, 29); x.lineTo(26, 19); x.lineTo(21, 19); x.closePath(); x.fill(); }
  else if (fxg.greed) { x.fillStyle = '#6ee7ff'; x.beginPath(); x.moveTo(20, 11); x.lineTo(27, 18); x.lineTo(20, 29); x.lineTo(13, 18); x.closePath(); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 9px monospace'; x.fillText('XP', 14, 23); }
  else if (fxg.wallCling) { for (const px2 of [13, 19, 25]) x.fillRect(px2, 13, 3, 9); x.fillRect(13, 22, 15, 4); }
  else if (fxg.gunPower) { x.beginPath(); x.arc(20, 20, 7, 0, 7); x.stroke(); x.beginPath(); x.moveTo(20, 10); x.lineTo(20, 30); x.moveTo(10, 20); x.lineTo(30, 20); x.stroke(); }
  else if (fxg.berserk) { x.fillStyle = '#ff4d6d'; for (const px2 of [14, 22]) { x.beginPath(); x.moveTo(px2, 14); x.lineTo(px2 + 4, 14); x.lineTo(px2 + 2, 26); x.fill(); } }
  else if (fxg.dash) { x.beginPath(); x.moveTo(12, 14); x.lineTo(20, 20); x.lineTo(12, 26); x.moveTo(20, 14); x.lineTo(28, 20); x.lineTo(20, 26); x.stroke(); }
  else if (fxg.buoy) { x.beginPath(); x.arc(20, 20, 7, 0, 7); x.stroke(); x.beginPath(); x.arc(16, 14, 2.5, 0, 7); x.fill(); }
  else if (fxg.magnet) { x.strokeStyle = '#ff4d6d'; x.lineWidth = 4; x.beginPath(); x.arc(20, 22, 7, Math.PI * 0.95, Math.PI * 2.05); x.stroke(); }
  else if (fxg.armor) { x.beginPath(); x.moveTo(20, 11); x.lineTo(28, 14); x.lineTo(27, 24); x.lineTo(20, 29); x.lineTo(13, 24); x.lineTo(12, 14); x.closePath(); x.fill(); }
  else { x.fillRect(14, 14, 12, 12); }
}

function drawConsumableIcon(x, it, id) {
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
    x.fillStyle = '#ffd166'; x.fillRect(12, 8, 3, 3); x.fillRect(25, 14, 3, 3);
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
  } else if (it.warp) {
    x.fillStyle = '#2de2a3'; x.fillRect(8, 16, 18, 9);
    x.beginPath(); x.arc(26, 20.5, 6, 0, 7); x.fill();
    x.fillStyle = '#0d1526'; x.beginPath(); x.arc(26, 20.5, 2.5, 0, 7); x.fill();
    x.strokeStyle = '#9fe8cf'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(34, 12); x.quadraticCurveTo(38, 16, 34, 20); x.stroke();
  } else if (it.invuln) {
    x.fillStyle = '#6ee7ff';
    x.beginPath(); x.moveTo(20, 5); x.lineTo(33, 10); x.lineTo(31, 26); x.lineTo(20, 35); x.lineTo(9, 26); x.lineTo(7, 10); x.closePath(); x.fill();
    x.fillStyle = '#0d3a4a';
    x.beginPath(); x.moveTo(20, 10); x.lineTo(28, 13); x.lineTo(27, 24); x.lineTo(20, 30); x.lineTo(13, 24); x.lineTo(12, 13); x.closePath(); x.fill();
    x.fillStyle = '#6ee7ff'; x.font = 'bold 12px monospace'; x.fillText('∞', 14, 24);
  } else if (it.xpGain) {
    x.fillStyle = '#b298dc';
    x.beginPath(); x.moveTo(17, 6); x.lineTo(23, 6); x.lineTo(23, 15); x.lineTo(30, 32); x.lineTo(10, 32); x.lineTo(17, 15); x.closePath(); x.fill();
    x.fillStyle = '#7a5fa0'; x.beginPath(); x.moveTo(13, 26); x.lineTo(27, 26); x.lineTo(30, 32); x.lineTo(10, 32); x.fill();
    x.fillStyle = '#fff'; x.fillRect(18, 2, 4, 4);
  } else if (it.stasis) {
    x.strokeStyle = '#a8d8f0'; x.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI / 3;
      x.beginPath(); x.moveTo(20 - Math.cos(a) * 12, 20 - Math.sin(a) * 12); x.lineTo(20 + Math.cos(a) * 12, 20 + Math.sin(a) * 12); x.stroke();
    }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(20, 20, 4, 0, 7); x.fill();
  } else if (it.cluster) {
    x.fillStyle = '#1c2536';
    for (const [bx, by] of [[13, 25], [24, 27], [19, 17]]) { x.beginPath(); x.arc(bx, by, 7, 0, 7); x.fill(); }
    x.strokeStyle = '#ffd166'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(21, 11); x.quadraticCurveTo(26, 4, 31, 6); x.stroke();
  } else if (it.heal && it.heal >= 999) {
    x.fillStyle = '#ffe8d6';
    x.beginPath(); x.moveTo(17, 8) ; x.lineTo(23, 8); x.lineTo(24, 14); x.quadraticCurveTo(30, 18, 30, 25); x.quadraticCurveTo(30, 34, 20, 34); x.quadraticCurveTo(10, 34, 10, 25); x.quadraticCurveTo(10, 18, 16, 14); x.closePath(); x.fill();
    x.fillStyle = '#ff4d6d'; x.fillRect(18, 18, 4, 12); x.fillRect(14, 22, 12, 4);
    x.fillStyle = '#fff'; x.fillRect(17, 4, 6, 4);
  } else if (it.heal) {
    x.fillStyle = '#e8ecf4'; x.fillRect(6, 10, 28, 22);
    x.fillStyle = '#ff4d6d'; x.fillRect(16, 14, 8, 14); x.fillRect(13, 17, 14, 8);
  } else if (it.bomb) {
    x.fillStyle = '#1c2536'; x.beginPath(); x.arc(20, 24, 12, 0, 7); x.fill();
    x.strokeStyle = '#ffd166'; x.lineWidth = 2; x.beginPath(); x.moveTo(24, 14); x.quadraticCurveTo(30, 6, 34, 8); x.stroke();
    x.fillStyle = '#ff5714'; x.fillRect(32, 5, 4, 4);
  } else if (it.buff) {
    const col = it.buff.gem ? '#3ddc84' : it.buff.speed >= 2 ? '#ff4d6d' : '#ff9e6d';
    x.fillStyle = col; x.fillRect(12, 10, 16, 26);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(14, 12, 4, 22);
    x.fillStyle = '#e8ecf4'; x.fillRect(14, 6, 12, 4);
    x.fillStyle = '#0d1526'; x.font = 'bold 10px monospace';
    x.fillText(it.buff.gem ? '$' : it.buff.speed >= 2 ? '>>' : 'OC', it.buff.gem ? 17 : 13, 26);
  } else {
    x.fillStyle = '#2a1c3a'; x.fillRect(8, 14, 24, 22);
    x.fillStyle = '#c77dff'; x.font = 'bold 20px monospace'; x.fillText('?', 14, 32);
  }
}
