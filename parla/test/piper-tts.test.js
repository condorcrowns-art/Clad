/* Exercise the neural-voice path in js/speech.js against a fake /tts.
 *
 * What this can and cannot cover: everything below runs in Node against
 * stubbed fetch/Audio, so it proves the browser half - routing, ordering,
 * fallback, cancellation. It says nothing about serve.ps1 or piper.exe, which
 * only exist on Windows and are verified by setup-windows.ps1 on the machine
 * that runs them.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext(`
  globalThis.setInterval = function(){ return 0; };
  globalThis.clearInterval = function(){};
  globalThis.isSecureContext = true;

  globalThis.__spoken = [];
  globalThis.speechSynthesis = {
    getVoices: function(){ return globalThis.__voices; },
    cancel: function(){}, speak: function(u){ globalThis.__spoken.push(u); }
  };
  globalThis.SpeechSynthesisUtterance = function(t){ this.text = t; };

  globalThis.__voices = [
    { name: 'Microsoft Helena Desktop - Spanish (Spain)', lang: 'es-ES', localService: true, voiceURI: 'helena' },
    { name: 'Google espanol', lang: 'es-ES', localService: false, voiceURI: 'google-es' }
  ];

  // /tts stub. __ttsFail flips it to a 503 so the fallback can be tested.
  globalThis.__ttsCalls = [];
  globalThis.__ttsFail = false;
  globalThis.fetch = function (url, init) {
    globalThis.__ttsCalls.push({ url: url, body: JSON.parse((init && init.body) || '{}') });
    if (globalThis.__ttsFail) {
      return Promise.resolve({ ok: false, status: 503 });
    }
    return Promise.resolve({ ok: true, status: 200, blob: function(){ return Promise.resolve({ fake: 'wav' }); } });
  };

  globalThis.URL = { createObjectURL: function(){ return 'blob:fake'; }, revokeObjectURL: function(){} };

  globalThis.__players = [];
  globalThis.Audio = function (src) {
    this.src = src;
    this.paused = false;
    globalThis.__players.push(this);
    var self = this;
    this.play = function(){ return Promise.resolve(); };
    this.pause = function(){ self.paused = true; };
  };
`, ctx);

load(ctx, 'js/speech.js');

const run = (code) => vm.runInContext(code, ctx);
const tick = () => new Promise((r) => setTimeout(r, 5));

const PIPER_VOICES = [
  { id: 'es_MX-claude-high',   name: 'claude', locale: 'es_MX', lang: 'es', quality: 'high' },
  { id: 'es_ES-davefx-medium', name: 'davefx', locale: 'es_ES', lang: 'es', quality: 'medium' },
  { id: 'fr_FR-siwis-medium',  name: 'siwis',  locale: 'fr_FR', lang: 'fr', quality: 'medium' }
];

const fail = [];
function check(name, cond, extra) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  - ' + extra : ''));
  if (!cond) fail.push(name);
}
function reset() {
  run('__ttsCalls = []; __players = []; __spoken = []; __ttsFail = false;');
}

(async function () {
  console.log('Piper TTS wiring\n');

  /* — inventory — */
  run('PARLA.speech._setPiper(false, []);');
  let list = run('JSON.stringify(PARLA.speech.allVoicesFor("es"))');
  check('with no piper, only browser voices are offered',
    JSON.parse(list).every((v) => v.engine === 'browser'));

  run('PARLA.speech._setPiper(true, ' + JSON.stringify(PIPER_VOICES) + ');');
  list = JSON.parse(run('JSON.stringify(PARLA.speech.allVoicesFor("es"))'));
  console.log('\n  Offered for Spanish:');
  list.forEach((v, i) => console.log('    ' + (i + 1) + '. ' + v.label + '  [' + v.quality + ']  ' + v.engine));
  console.log('');

  check('neural voices are listed above browser voices',
    list[0].engine === 'piper' && list[list.length - 1].engine === 'browser');
  check('the es-ES voice outranks the higher-quality es-MX one',
    list[0].id === 'piper:es_ES-davefx-medium', list[0].id);
  check('French voices are not offered for Spanish',
    !list.some((v) => /fr_FR/.test(v.id)));
  check('French asks get the French voice',
    JSON.parse(run('JSON.stringify(PARLA.speech.allVoicesFor("fr"))'))[0].id === 'piper:fr_FR-siwis-medium');

  /* — routing — */
  console.log('');
  reset();
  run('PARLA.speech.speak("Hola", { lang: "es", rate: 0.9 });');
  await tick();
  let calls = JSON.parse(run('JSON.stringify(__ttsCalls)'));
  check('no saved voice goes to the neural engine',
    calls.length === 1 && calls[0].url === '/tts');
  check('and picks the es-ES voice',
    calls[0] && calls[0].body.voice === 'es_ES-davefx-medium', calls[0] && calls[0].body.voice);
  check('rate is passed through', calls[0] && calls[0].body.rate === 0.9);
  check('audio was played', JSON.parse(run('String(__players.length)')) === '1' || run('__players.length') === 1);

  reset();
  run('PARLA.speech.speak("Hola", { lang: "es", voiceURI: "google-es" });');
  await tick();
  check('an explicitly chosen browser voice is not overridden',
    run('__ttsCalls.length') === 0 && run('__spoken.length') === 1);

  reset();
  run('PARLA.speech.speak("Hola", { lang: "es", voiceURI: "piper:es_MX-claude-high" });');
  await tick();
  check('an explicitly chosen neural voice is used',
    run('__ttsCalls[0] && __ttsCalls[0].body.voice') === 'es_MX-claude-high');

  /* — fallback — */
  console.log('');
  reset();
  run('__ttsFail = true;');
  run('PARLA.speech.speak("Hola", { lang: "es" });');
  await tick();
  check('a dead /tts falls back to the browser voice, it does not go silent',
    run('__spoken.length') === 1);

  reset();
  run('PARLA.speech._setPiper(true, ' + JSON.stringify(PIPER_VOICES) + ');');
  run('PARLA.speech.speak("Hola", { lang: "es", voiceURI: "piper:no-such-voice" });');
  await tick();
  check('a saved voice that no longer exists falls back to a real one',
    run('__ttsCalls[0] && __ttsCalls[0].body.voice') === 'es_ES-davefx-medium');

  run('PARLA.speech._setPiper(false, []);');
  reset();
  run('PARLA.speech.speak("Hola", { lang: "es", voiceURI: "piper:es_ES-davefx-medium" });');
  await tick();
  check('a saved neural voice after piper is uninstalled uses the browser',
    run('__ttsCalls.length') === 0 && run('__spoken.length') === 1);

  /* — lifecycle — */
  console.log('');
  run('PARLA.speech._setPiper(true, ' + JSON.stringify(PIPER_VOICES) + ');');
  reset();
  run('globalThis.__ended = 0; PARLA.speech.speak("Hola", { lang: "es", onend: function(){ globalThis.__ended++; } });');
  await tick();
  run('__players[0].onended();');
  check('onend fires when the clip finishes', run('__ended') === 1);

  reset();
  run('globalThis.__ended = 0; PARLA.speech.speak("Hola", { lang: "es", onend: function(){ globalThis.__ended++; } });');
  await tick();
  run('PARLA.speech.cancel();');
  run('__players[0].onended && __players[0].onended();');
  check('cancel does not fire onend, so leaving a view cannot reopen the mic',
    run('__ended') === 0);
  check('cancel stops the audio', run('__players[0].paused') === true);

  reset();
  run('globalThis.__ended = 0; PARLA.speech.speak("first", { lang: "es", onend: function(){ globalThis.__ended++; } });');
  run('PARLA.speech.speak("second", { lang: "es" });');
  await tick();
  check('a superseded utterance never plays', run('__players.length') === 1);
  check('and its onend is not fired', run('__ended') === 0);

  reset();
  run('globalThis.__ended = 0; PARLA.speech.speak("", { lang: "es", onend: function(){ globalThis.__ended++; } });');
  await tick();
  check('empty text still calls back, so callers never hang',
    run('__ended') === 1 && run('__ttsCalls.length') === 0);

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
