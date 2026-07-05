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

/* ===================== SEEDS (auto-generated) ===================== */
// Everything spliceable/growable gets a seed. Trees yield the item.
const GROW_TIMES = { 0: 25, 1: 55, 2: 110, 3: 170, 4: 240, 9: 170 }; // seconds by tier
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
      x.strokeStyle = id === 'flame_blade' ? '#ff5714' : (it.color || '#9adcf0'); x.lineWidth = 5;
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
