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
  },

  updateHUD() {
    const p = game.player;
    this.el.hpBar.style.width = Math.max(0, p.hp / p.maxHp * 100) + '%';
    this.el.hpText.textContent = Math.max(0, Math.ceil(p.hp)) + ' / ' + p.maxHp;
    this.el.gemText.textContent = game.gems;
    this.el.worldName.textContent = game.world ? game.world.name : '';
    if (p.equip.back) {
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

  renderShop() {
    const list = this.el.shopList;
    list.innerHTML = '';
    for (const row of SHOP) {
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
    ['invPanel', 'shopPanel', 'codexPanel', 'questPanel'].forEach(p => this.el[p].classList.add('hidden'));
    if (wasHidden) {
      el.classList.remove('hidden');
      if (name === 'inv') this.renderInv();
      if (name === 'shop') this.renderShop();
      if (name === 'codex') this.renderCodex();
      if (name === 'quest') this.renderQuests();
    }
    this.hideTip();
  },
  anyPanelOpen() {
    return ['invPanel', 'shopPanel', 'codexPanel', 'questPanel'].some(p => !this.el[p].classList.contains('hidden'));
  },
  closeAll() { ['invPanel', 'shopPanel', 'codexPanel', 'questPanel'].forEach(p => this.el[p].classList.add('hidden')); this.hideTip(); },

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
