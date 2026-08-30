/* Parla — offline cache
 *
 * The whole app is a handful of static files, so we cache them all on install
 * and serve cache-first. That makes the built-in scripted partner, the SRS and
 * the conjugation trainer work with no network at all.
 *
 * Bump CACHE when you change any shipped file, or browsers will keep the old one.
 */
var CACHE = 'parla-v3';

var ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './js/data/vocab-es.js',
  './js/data/verbs-es.js',
  './js/data/scenarios-es.js',
  './js/data/challenge-es.js',
  './js/store.js',
  './js/speech.js',
  './js/srs.js',
  './js/brain.js',
  './js/ui.js',
  './js/views-talk.js',
  './js/views-drill.js',
  './js/views-progress.js',
  './js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
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
