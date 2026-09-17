/* Lunosia — offline cache
 *
 * The whole app is a handful of static files, so we cache them all on install
 * and serve cache-first. That makes the built-in scripted partner, the SRS and
 * the conjugation trainer work with no network at all.
 *
 * Bump CACHE when you change any shipped file, or browsers will keep the old one.
 */
var CACHE = 'lunosia-v8';

/* The dictionary is 1.5 MB and changes only when it is rebuilt, so it lives in
 * a cache of its own that deploys do not touch. In the single versioned cache
 * it was evicted on every release: a phone on mobile data paid for the whole
 * thing again each time a comma moved in the CSS.
 *
 * It is served stale-while-revalidate — answered instantly from the cache, with
 * a fresh copy fetched behind it — so it is still current a visit later without
 * anyone waiting on a megabyte. */
var DATA = 'lunosia-data-v1';
var DICT = 'js/data/dict-es.json';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './css/fiesta.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon.svg',
  './about.html',
  './privacy.html',
  './css/page.css',
  './contact.html',
  './terms.html',
  './guides/gender-and-agreement.html',
  './guides/index.html',
  './guides/past-and-subjunctive.html',
  './guides/pronunciation.html',
  './guides/ser-estar.html',
  './guides/small-words.html',
  './guides/verbs-that-differ.html',
  './js/data/vocab-es.js',
  './js/data/verbs-es.js',
  './js/data/grammar-es.js',
  './js/data/sounds-es.js',
  './js/data/reading-es.js',
  './js/data/writing-es.js',
  './js/data/scenarios-es.js',
  './js/data/challenge-es.js',
  './js/decor.js',
  './js/store.js',
  './js/saytext.js',
  './js/speech.js',
  './js/srs.js',
  './js/brain.js',
  './js/ui.js',
  './js/views-talk.js',
  './js/views-coach.js',
  './js/views-drill.js',
  './js/views-games.js',
  './js/views-words.js',
  './js/views-grammar.js',
  './js/views-fix.js',
  './js/views-say.js',
  './js/views-read.js',
  './js/views-listen.js',
  './js/views-write.js',
  './js/dict.js',
  './js/morph.js',
  './js/grammar.js',
  './js/phon.js',
  './js/views-progress.js',
  './js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );

  /* Warm the dictionary too, but off to one side: the shell must not wait on a
   * megabyte, and the word bank should not need a second visit before it works
   * on a train. Skipped when a copy is already there, so this costs nothing
   * after the first install. */
  e.waitUntil(
    caches.open(DATA).then(function (c) {
      return c.match(DICT).then(function (hit) {
        return hit ? null : c.add(DICT).catch(function () { /* offline: later */ });
      });
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k === CACHE || k === DATA) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);

  // Never cache the AI backends — Ollama and Gemini must always go to the network.
  if (url.origin !== location.origin) return;
  if (e.request.method !== 'GET') return;

  // Nor the speech endpoints. /tts/voices is a GET and would otherwise be
  // cached, which would freeze "no neural voice installed" in place forever —
  // including for the person who then goes and installs one.
  if (/\/tts(\/|$)/.test(url.pathname)) return;

  // Nor the site's own API. GET /api/chat and GET /api/speak are the probes
  // that decide whether the app claims an AI partner or a hosted voice is
  // available; cached, either would answer from a snapshot of whether the
  // binding existed the day it was first asked. POST to either is a live
  // reply or a live utterance, never something to replay from cache.
  if (/^\/api(\/|$)/.test(url.pathname)) return;

  // The dictionary: answer from the kept cache at once, and refresh behind it.
  if (url.pathname.indexOf(DICT) !== -1 && url.origin === location.origin) {
    e.respondWith(
      caches.open(DATA).then(function (c) {
        return c.match(e.request).then(function (hit) {
          var live = fetch(e.request).then(function (res) {
            if (res && res.ok) c.put(e.request, res.clone());
            return res;
          }).catch(function () { return hit || Response.error(); });
          return hit || live;
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        // Offline and not cached: fall back to the shell so navigation still works.
        return e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error();
      });
    })
  );
});
