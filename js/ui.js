'use strict';
/* ============================================================
   GLITCHTOPIA — DOM UI: hotbar, inventory, shop, codex, HUD
   ============================================================ */

const ui = {
  dirty: true,
  el: {},
  init() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hpBar: $('hpBar'), hpText: $('hpText'), gemText: $('gemText'), worldName: $('worldName'),
      fuelWrap: $('fuelWrap'), fuelBar: $('fuelBar'),
      bossWrap: $('bossWrap'), bossName: $('bossName'), bossBar: $('bossBar'),
      hotbar: $('hotbar'), invPanel: $('invPanel'), invGrid: $('invGrid'),
      shopPanel: $('shopPanel'), shopList: $('shopList'), sellGrid: $('sellGrid'),
      questPanel: $('questPanel'), questList: $('questList'),
      keyWrap: $('keyWrap'), keyText: $('keyText'),
      lvlText: $('lvlText'), xpBar: $('xpBar'),
      worldsPanel: $('worldsPanel'), worldsList: $('worldsList'), worldNameInput: $('worldNameInput'), lockCount: $('lockCount'),
      defragPanel: $('defragPanel'), defragStep: $('defragStep'), defragSymbol: $('defragSymbol'), defragTimer: $('defragTimer'), defragFaults: $('defragFaults'),
      codexPanel: $('codexPanel'), codexList: $('codexList'),
      tooltip: $('tooltip'), toasts: $('toasts'),
      menu: $('menu'), deathOverlay: $('deathOverlay'), deathText: $('deathText'),
    };
    // hotbar slots
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'hbSlot';
      d.innerHTML = '<span class="key">' + (i + 1) + '</span><span class="cnt"></span>';
      d.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button === 2) { if (i > 0) { game.player.hotbar[i] = null; this.dirty = true; } }
        else { game.player.sel = i; this.dirty = true; }
      });
      d.addEventListener('contextmenu', (e) => e.preventDefault());
      d.addEventListener('mousemove', (e) => this.showTip(e, game.player.hotbar[i]));
      d.addEventListener('mouseleave', () => this.hideTip());
      this.el.hotbar.appendChild(d);
    }
    // equip slots
    document.querySelectorAll('.equipSlot').forEach(el => {
      el.addEventListener('click', () => {
        const slot = el.dataset.slot;
        if (game.player.equip[slot]) { game.player.equip[slot] = null; this.dirty = true; game.sfx.play('place'); game.save(); }
      });
      el.addEventListener('mousemove', (e) => this.showTip(e, game.player.equip[el.dataset.slot]));
      el.addEventListener('mouseleave', () => this.hideTip());
    });
    document.querySelectorAll('.panel').forEach(p => {
      p.addEventListener('mousedown', e => e.stopPropagation());
    });
    document.getElementById('worldCreateBtn').addEventListener('click', () => {
      if (game.foundWorld(this.el.worldNameInput.value)) { this.el.worldNameInput.value = ''; this.closeAll(); }
    });
    this.el.worldNameInput.addEventListener('keydown', e => e.stopPropagation());
    document.querySelectorAll('.dfBtn').forEach(b => {
      b.addEventListener('click', () => this.defragPress(b.dataset.op));
    });
  },

  /* ---------- DEFRAG minigame (Growtopia surgery homage) ---------- */
  DF_SYM: { scan: '⌕', patch: '⚙', purge: '⚡', cool: '❄' },
  startDefrag() {
    game.defrag = { step: 0, total: 5, faults: 0, need: null, t: 0, limit: 2.4 };
    this.el.defragPanel.classList.remove('hidden');
    game.sfx.play('splice');
    this.defragNext();
    if (this._dfInt) clearInterval(this._dfInt);
    this._dfInt = setInterval(() => {
      const d = game.defrag;
      if (!d) { clearInterval(this._dfInt); return; }
      d.t += 0.05;
      this.el.defragTimer.style.width = Math.max(0, 100 - d.t / d.limit * 100) + '%';
      if (d.t >= d.limit) this.defragFault();
    }, 50);
  },
  defragNext() {
    const d = game.defrag;
    const ops = Object.keys(this.DF_SYM);
    d.need = ops[Math.floor(Math.random() * ops.length)];
    d.t = 0;
    d.limit = Math.max(1.2, 2.4 - d.step * 0.25);
    this.el.defragStep.textContent = 'OPERATION ' + (d.step + 1) + ' / ' + d.total;
    this.el.defragSymbol.textContent = this.DF_SYM[d.need];
    this.el.defragFaults.textContent = '✖ '.repeat(d.faults);
  },
  defragPress(op) {
    const d = game.defrag;
    if (!d) return;
    if (op === d.need) {
      game.sfx.play('pickup');
      d.step++;
      if (d.step >= d.total) return this.defragEnd(true);
      this.defragNext();
    } else this.defragFault();
  },
  defragFault() {
    const d = game.defrag;
    if (!d) return;
    d.faults++;
    game.sfx.play('error');
    if (d.faults >= 3) return this.defragEnd(false);
    this.defragNext();
  },
  defragEnd(success) {
    const d = game.defrag;
    clearInterval(this._dfInt);
    this.el.defragPanel.classList.add('hidden');
    game.defrag = null;
    const p = game.player;
    if (success) {
      game.progress.stats.defrags++;
      const gems = 45 + Math.floor(Math.random() * 45) - d.faults * 12;
      game.spawnGems(p.x, p.y - 40, Math.max(15, gems));
      if (Math.random() < 0.35) game.spawnDrop(p.x, p.y - 40, 'overclock_cola', 1);
      if (Math.random() < 0.3) {
        const pool = MYSTERY_POOL.filter(r => (ITEMS[r].tier || 0) <= 2);
        game.spawnDrop(p.x, p.y - 40, pool[Math.floor(Math.random() * pool.length)] + '_seed', 1);
      }
      game.addXp(30);
      game.fx.explode(p.x, p.y, '#2de2a3', 20);
      game.sfx.play('victory');
      game.toast(d.faults === 0 ? '★ FLAWLESS DEFRAG — maximum payout!' : 'Drive defragged (' + d.faults + ' fault' + (d.faults > 1 ? 's' : '') + ').', 'gold');
      game.save();
    } else {
      game.fx.explode(p.x, p.y, '#ff4d6d', 14);
      game.sfx.play('death');
      game.toast('DRIVE LOST — too many faults. The data is gone.', 'warn');
    }
  },

  /* ---------- My Worlds ---------- */
  renderWorlds() {
    const list = this.el.worldsList;
    list.innerHTML = '';
    const mk = (label, biome, target, current) => {
      const d = document.createElement('div');
      d.className = 'worldRow';
      d.innerHTML = '<span class="worldName2">' + label + '</span><span class="worldBiome ' + biome + '">' + biome.toUpperCase() + '</span>';
      if (current) { const s = document.createElement('span'); s.className = 'worldGo'; s.style.opacity = 0.4; s.textContent = 'HERE'; d.appendChild(s); }
      else {
        const btn = document.createElement('button');
        btn.className = 'worldGo'; btn.textContent = 'TRAVEL';
        btn.addEventListener('click', () => { this.closeAll(); game.enterWorld(target); });
        d.appendChild(btn);
      }
      list.appendChild(d);
    };
    mk('HOME SERVER', 'verdant', 'home', game.world.id === 'home');
    for (const name in game.ownedWorlds) mk(name.toUpperCase(), game.ownedWorlds[name].biome, 'world:' + name, game.world.id === 'world:' + name);
    this.el.lockCount.textContent = '⚿ World Locks: ' + game.player.count('world_lock');
  },

  updateHUD() {
    const p = game.player;
    this.el.hpBar.style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
    this.el.hpText.textContent = Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp;
    this.el.gemText.textContent = game.gems;
    this.el.worldName.textContent = game.world ? (game.world.name + (game.spire && game.spire.wave ? ' — WAVE ' + game.spire.wave : '')) : '';
    this.el.lvlText.textContent = 'LV ' + game.level;
    this.el.xpBar.style.width = Math.min(100, game.xp / game.xpNeed() * 100) + '%';
    if (p.equip.back && ITEMS[p.equip.back].fx.jetpack) {
      this.el.fuelWrap.classList.remove('hidden');
      this.el.fuelBar.style.width = (p.fuel * 100) + '%';
    } else this.el.fuelWrap.classList.add('hidden');
    if (game.keysNeed > 0 && game.keysGot < game.keysNeed) {
      this.el.keyWrap.classList.remove('hidden');
      this.el.keyText.textContent = game.keysGot + '/' + game.keysNeed;
    } else this.el.keyWrap.classList.add('hidden');
  },

  bossBar(boss) {
    if (boss && !boss.dead) {
      this.el.bossWrap.classList.remove('hidden');
      this.el.bossName.textContent = boss.meta.name + (boss.phase2 ? ' [ENRAGED]' : '');
      this.el.bossBar.style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
    } else this.el.bossWrap.classList.add('hidden');
  },

  refresh() {
    if (!this.dirty) return;
    this.dirty = false;
    const p = game.player;
    // hotbar
    const slots = this.el.hotbar.children;
    for (let i = 0; i < 9; i++) {
      const d = slots[i];
      const id = p.hotbar[i];
      d.classList.toggle('sel', p.sel === i);
      let cv = d.querySelector('canvas');
      if (cv) cv.remove();
      if (id) {
        cv = iconFor(id).cloneNode();
        cv.getContext('2d').drawImage(iconFor(id), 0, 0);
        d.appendChild(cv);
        const it = ITEMS[id];
        d.querySelector('.cnt').textContent = (it.kind === 'block' || it.kind === 'seed' || it.kind === 'consumable') ? (p.inv[id] || 0) : '';
      } else d.querySelector('.cnt').textContent = '';
    }
    // inventory grid
    if (!this.el.invPanel.classList.contains('hidden')) this.renderInv();
  },

  renderInv() {
    const p = game.player;
    const g = this.el.invGrid;
    g.innerHTML = '';
    const ids = Object.keys(p.inv).sort((a, b) => (ITEMS[a].kind + ITEMS[a].name).localeCompare(ITEMS[b].kind + ITEMS[b].name));
    for (const id of ids) {
      const d = document.createElement('div');
      d.className = 'invSlot';
      const cv = document.createElement('canvas');
      cv.width = 40; cv.height = 40;
      cv.getContext('2d').drawImage(iconFor(id), 0, 0);
      d.appendChild(cv);
      const cnt = document.createElement('span');
      cnt.className = 'cnt'; cnt.textContent = p.inv[id];
      d.appendChild(cnt);
      d.addEventListener('mousemove', (e) => this.showTip(e, id));
      d.addEventListener('mouseleave', () => this.hideTip());
      d.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const it = ITEMS[id];
        if (it.kind === 'gear') {
          p.equip[it.slot] = p.equip[it.slot] === id ? null : id;
          game.sfx.play('buy'); game.toast(p.equip[it.slot] ? 'Equipped ' + it.name : 'Unequipped ' + it.name, '');
          game.save();
        } else {
          // put in selected hotbar slot (slot 0 stays fist)
          const slot = p.sel === 0 ? (p.hotbar.indexOf(id) >= 0 ? p.hotbar.indexOf(id) : (p.hotbar.indexOf(null) > 0 ? p.hotbar.indexOf(null) : 1)) : p.sel;
          if (!p.hotbar.includes(id)) p.hotbar[slot] = id;
          p.sel = p.hotbar.indexOf(id);
          game.sfx.play('place');
        }
        this.dirty = true; this.refresh(); this.renderEquip();
      });
      g.appendChild(d);
    }
    this.renderEquip();
  },

  renderEquip() {
    document.querySelectorAll('.equipSlot').forEach(el => {
      const id = game.player.equip[el.dataset.slot];
      const box = el.querySelector('.equipIcon');
      box.innerHTML = '';
      el.classList.toggle('filled', !!id);
      if (id) {
        const cv = document.createElement('canvas');
        cv.width = 40; cv.height = 40;
        cv.getContext('2d').drawImage(iconFor(id), 0, 0);
        box.appendChild(cv);
      }
    });
  },

  shopMode: 'shop',
  openMerchant() {
    this.shopMode = 'merchant';
    ['invPanel', 'codexPanel', 'questPanel'].forEach(p => this.el[p].classList.add('hidden'));
    this.el.shopPanel.classList.remove('hidden');
    this.renderShop();
    game.sfx.play('buy');
  },

  renderShop() {
    const merchant = this.shopMode === 'merchant' && game.merchant;
    const list = this.el.shopList;
    list.innerHTML = '';
    this.el.shopPanel.querySelector('.panelTitle').firstChild.textContent = merchant ? '❖ BLACK MARKET ' : 'GEM EXCHANGE ';
    const stock = merchant ? game.merchant.stock : SHOP;
    // overdrive toggle after clearing the boss rush
    if (!merchant && game.progress.rushDone) {
      const od = document.createElement('div');
      od.className = 'shopRow';
      od.innerHTML = '<div class="shopInfo"><div class="shopName" style="color:#ff4d6d">OVERDRIVE MODE: ' + (game.progress.overdrive ? 'ON' : 'OFF') +
        '</div><div class="shopDesc">Enemies +3 levels everywhere, but all gems earned are DOUBLED.</div></div>';
      const btn = document.createElement('button');
      btn.className = 'shopBuy';
      btn.textContent = game.progress.overdrive ? 'DISABLE' : 'ENABLE';
      btn.addEventListener('click', () => {
        game.progress.overdrive = !game.progress.overdrive;
        game.toast(game.progress.overdrive ? '⚠ OVERDRIVE ON — good luck.' : 'Overdrive off.', 'warn');
        game.sfx.play('bossroar');
        game.save();
        this.renderShop();
      });
      od.appendChild(btn);
      list.appendChild(od);
    }
    for (const row of stock) {
      const it = ITEMS[row.id];
      const d = document.createElement('div');
      d.className = 'shopRow';
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
      cv.getContext('2d').drawImage(iconFor(row.id), 0, 0);
      d.appendChild(cv);
      const info = document.createElement('div');
      info.className = 'shopInfo';
      info.innerHTML = '<div class="shopName">' + it.name + '</div><div class="shopDesc">' + it.desc + '</div>';
      d.appendChild(info);
      const btn = document.createElement('button');
      btn.className = 'shopBuy';
      btn.textContent = '◆ ' + row.price;
      btn.disabled = game.gems < row.price;
      btn.addEventListener('click', () => {
        if (game.gems < row.price) return;
        game.addGems(-row.price);
        game.player.give(row.id, row.qty);
        game.sfx.play('buy');
        game.toast('Bought ' + it.name, 'gold');
        this.renderShop();
        game.save();
      });
      d.appendChild(btn);
      list.appendChild(d);
    }
    this.renderSell();
  },

  renderSell() {
    const g = this.el.sellGrid;
    g.innerHTML = '';
    const p = game.player;
    const ids = Object.keys(p.inv).filter(id => sellPrice(id) > 0).sort((a, b) => sellPrice(b) - sellPrice(a));
    for (const id of ids) {
      const d = document.createElement('div');
      d.className = 'invSlot';
      const cv = document.createElement('canvas'); cv.width = 40; cv.height = 40;
      cv.getContext('2d').drawImage(iconFor(id), 0, 0);
      d.appendChild(cv);
      const cnt = document.createElement('span'); cnt.className = 'cnt'; cnt.textContent = p.inv[id];
      d.appendChild(cnt);
      d.addEventListener('mousemove', (e) => {
        this.showTip(e, id);
        this.el.tooltip.innerHTML += '<div class="ttDesc" style="color:#ffd166">SELL: ◆ ' + sellPrice(id) + ' each — click to sell 1</div>';
      });
      d.addEventListener('mouseleave', () => this.hideTip());
      d.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (p.take(id, 1)) {
          game.addGems(sellPrice(id));
          game.sfx.play('buy');
          this.renderShop();
        }
      });
      g.appendChild(d);
    }
    if (!ids.length) g.innerHTML = '<div style="grid-column:1/-1;color:#5b7395;font-size:12px">Nothing sellable. Boss tech can never be sold.</div>';
  },

  renderQuests() {
    const list = this.el.questList;
    list.innerHTML = '';
    for (const q of QUESTS) {
      const claimed = game.progress.quests[q.id];
      const prog = game.questProgress(q);
      const done = prog >= q.goal;
      const d = document.createElement('div');
      d.className = 'questRow' + (claimed ? ' claimed' : done ? ' done' : '');
      const rewardTxt = q.reward.gems ? '◆ ' + q.reward.gems : q.reward.items.map(([id, n]) => n + '× ' + ITEMS[id].name).join(', ');
      d.innerHTML = '<div class="questInfo"><div class="questName">' + q.name + '</div><div class="questDesc">' + q.desc + ' · reward: ' + rewardTxt + '</div></div>' +
        '<div class="questProg">' + prog + '/' + q.goal + '</div>';
      if (done && !claimed) {
        const btn = document.createElement('button');
        btn.className = 'questClaim'; btn.textContent = 'CLAIM';
        btn.addEventListener('click', () => { game.claimQuest(q.id); this.renderQuests(); });
        d.appendChild(btn);
      } else if (claimed) {
        const s = document.createElement('span'); s.className = 'questProg'; s.textContent = '✔'; d.appendChild(s);
      }
      list.appendChild(d);
    }
  },

  renderCodex() {
    const list = this.el.codexList;
    list.innerHTML = '';
    const keys = Object.keys(RECIPES);
    for (const key of keys) {
      const [a, b] = key.split('+');
      const res = RECIPES[key];
      const known = game.progress.discovered[res];
      const d = document.createElement('div');
      d.className = 'codexRow' + (known ? '' : ' locked');
      const mk = (id) => { const cv = document.createElement('canvas'); cv.width = 28; cv.height = 28; cv.getContext('2d').drawImage(iconFor(id), 0, 0, 28, 28); return cv; };
      d.appendChild(mk(a + '_seed'));
      const plus = document.createElement('span'); plus.className = 'codexOp'; plus.textContent = '+'; d.appendChild(plus);
      d.appendChild(mk(b + '_seed'));
      const eq = document.createElement('span'); eq.className = 'codexOp'; eq.textContent = '='; d.appendChild(eq);
      if (known) d.appendChild(mk(res));
      const nm = document.createElement('span'); nm.className = 'codexName';
      nm.textContent = known ? ITEMS[res].name : ITEMS[a].name.split(' ')[0] + ' + ' + ITEMS[b].name.split(' ')[0];
      d.appendChild(nm);
      if (known) { const fx = document.createElement('span'); fx.className = 'codexFx'; fx.textContent = ITEMS[res].desc.replace('FUNCTION: ', ''); d.appendChild(fx); }
      list.appendChild(d);
    }
    const hint = document.createElement('div');
    hint.className = 'codexRow';
    hint.innerHTML = '<span class="codexFx" style="max-width:100%">Boss tech (Daemonfire Blade, Wurmbore Drill, Stormstep Boots, ADMIN Crown, Firewall Blocks) cannot be spliced — defeat the corrupted processes to claim it.</span>';
    list.appendChild(hint);
  },

  togglePanel(name) {
    const el = this.el[name + 'Panel'];
    const wasHidden = el.classList.contains('hidden');
    ['invPanel', 'shopPanel', 'codexPanel', 'questPanel', 'worldsPanel'].forEach(p => this.el[p].classList.add('hidden'));
    if (wasHidden) {
      el.classList.remove('hidden');
      if (name === 'inv') this.renderInv();
      if (name === 'shop') { this.shopMode = 'shop'; this.renderShop(); }
      if (name === 'codex') this.renderCodex();
      if (name === 'quest') this.renderQuests();
      if (name === 'worlds') this.renderWorlds();
    }
    this.hideTip();
  },
  anyPanelOpen() {
    return ['invPanel', 'shopPanel', 'codexPanel', 'questPanel', 'worldsPanel', 'defragPanel'].some(p => !this.el[p].classList.contains('hidden'));
  },
  closeAll() { ['invPanel', 'shopPanel', 'codexPanel', 'questPanel', 'worldsPanel'].forEach(p => this.el[p].classList.add('hidden')); this.hideTip(); },

  showTip(e, id) {
    if (!id) { this.hideTip(); return; }
    const it = ITEMS[id];
    const t = this.el.tooltip;
    t.classList.remove('hidden');
    t.innerHTML = '<div class="ttName">' + it.name + '</div><div class="ttKind">' + it.kind + (it.tier === 9 ? ' · boss tech' : '') + '</div><div class="ttDesc">' + it.desc + '</div>';
    const x = Math.min(e.clientX + 14, window.innerWidth - 280);
    const y = Math.min(e.clientY + 14, window.innerHeight - 120);
    t.style.left = x + 'px'; t.style.top = y + 'px';
  },
  hideTip() { this.el.tooltip.classList.add('hidden'); },

  toast(msg, cls) {
    const d = document.createElement('div');
    d.className = 'toast ' + (cls || '');
    d.textContent = msg;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 3200);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  },
};
