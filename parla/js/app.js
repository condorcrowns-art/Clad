/* Parla — bootstrap and router */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var appEl, navEl, current = null, currentView = '';

  /* Views reachable from the bottom nav. */
  var NAV = ['home', 'scenarios', 'review', 'conjugate', 'challenge', 'progress'];

  function applyTheme() {
    var t = PARLA.store.state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  function paintChips() {
    var st = PARLA.store.state;
    var streak = document.querySelector('#chipStreak span');
    if (streak) streak.textContent = String(st.progress.streak);

    var lvl = document.getElementById('chipLevel');
    if (lvl) lvl.textContent = 'LV ' + PARLA.store.level();

    var brain = document.getElementById('chipBrain');
    if (brain) {
      var names = { scripted: 'built-in', ollama: 'ollama', gemini: 'gemini' };
      brain.textContent = names[st.settings.brain] || st.settings.brain;
      brain.className = 'chip' + (st.settings.brain === 'scripted' ? '' : ' good');
    }
  }

  function paintNav() {
    if (!navEl) return;
    Array.prototype.forEach.call(navEl.querySelectorAll('button'), function (b) {
      if (b.getAttribute('data-view') === currentView) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    // The nav is noise during onboarding.
    navEl.classList.toggle('hidden', currentView === 'onboard');
  }

  function go(view, params) {
    var fn = PARLA.views[view];
    if (!fn) { console.warn('Parla: no view named', view); return; }

    // Let the outgoing view tear down microphones and speech.
    if (current && typeof current._onLeave === 'function') {
      try { current._onLeave(); } catch (e) { /* ignore */ }
    }
    PARLA.speech.cancel();

    currentView = view;
    var node = fn(params || {});
    PARLA.ui.clear(appEl);
    appEl.appendChild(node);
    current = node;

    paintChips();
    paintNav();
    window.scrollTo(0, 0);

    // Keep the URL honest so refresh and back behave sensibly.
    var hash = '#' + view;
    if (params && params.id) hash += '/' + params.id;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function fromHash() {
    var raw = (location.hash || '').replace(/^#/, '');
    if (!raw) return null;
    var bits = raw.split('/');
    if (!PARLA.views[bits[0]]) return null;
    // Deep links into a conversation need the scenario, not a half-built session.
    if (bits[0] === 'talk' && !bits[1]) return null;
    if (bits[0] === 'summary') return null;
    return { view: bits[0], params: bits[1] ? { id: bits[1] } : {} };
  }

  function boot() {
    appEl = document.getElementById('app');
    navEl = document.getElementById('nav');

    PARLA.store.load();
    applyTheme();

    navEl.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-view]');
      if (b) go(b.getAttribute('data-view'));
    });

    var brand = document.getElementById('brandBtn');
    if (brand) brand.addEventListener('click', function () { go('home'); });

    document.getElementById('chipBrain').addEventListener('click', function () { go('settings'); });
    document.getElementById('chipLevel').addEventListener('click', function () { go('progress'); });
    document.getElementById('chipStreak').addEventListener('click', function () { go('challenge'); });

    window.addEventListener('hashchange', function () {
      var h = fromHash();
      if (h && h.view !== currentView) go(h.view, h.params);
    });

    // Stop speech when the tab is hidden — nothing worse than a voice from a
    // background tab.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) PARLA.speech.cancel();
    });

    if (!PARLA.store.state.profile.created) {
      go('onboard');
    } else {
      var h = fromHash();
      go(h ? h.view : 'home', h ? h.params : {});
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // Offline support is a bonus, not a requirement.
      });
    }
  }

  PARLA.app = { go: go, applyTheme: applyTheme, paintChips: paintChips };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
