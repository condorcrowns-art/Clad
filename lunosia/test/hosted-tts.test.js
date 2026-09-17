/* The hosted neural voice (Cloudflare Workers AI, called at /api/speak),
 * exercised the same way test/piper-tts.test.js exercises Piper: a fake
 * fetch and Audio in Node, proving the routing and fallback logic in
 * js/speech.js rather than the real network call.
 *
 * This is the fix for "why is the voice bad on the site" — on the public
 * site nobody has run the Windows setup, so Piper is never available, and
 * before this there was nothing between that and the operating system's own
 * robotic voice. This is what fills the gap.
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
    { name: 'Microsoft Helena Desktop - Spanish (Spain)', lang: 'es-ES', localService: true, voiceURI: 'helena' }
  ];

  // /tts (Piper) always 404s in this file: the point is testing what happens
  // when Piper is not there at all, which is the truth on the public site.
  // /api/speak is controlled by the test below.
  globalThis.__speakCalls = [];
  globalThis.__speakFail = false;
  globalThis.__speakStatus = 200;
  globalThis.fetch = function (url, init) {
    if (String(url).indexOf('/tts') === 0) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    if (String(url).indexOf('/api/speak') === 0) {
      globalThis.__speakCalls.push({ url: url, init: init || {} });
      if (!init || !init.method) {
        // the GET probe
        return Promise.resolve({ ok: true, json: function () {
          return Promise.resolve({ available: globalThis.__speakAvailable !== false }); } });
      }
      if (globalThis.__speakFail || globalThis.__speakStatus !== 200) {
        return Promise.resolve({ ok: false, status: globalThis.__speakStatus || 500 });
      }
      return Promise.resolve({ ok: true, status: 200,
        blob: function () { return Promise.resolve({ fake: 'mp3' }); } });
    }
    return Promise.resolve({ ok: false, status: 404 });
  };

  globalThis.URL = { createObjectURL: function(){ return 'blob:fake'; }, revokeObjectURL: function(){} };

  globalThis.__players = [];
  globalThis.Audio = function (src) {
    this.src = src;
    this.playbackRate = 1;
    globalThis.__players.push(this);
    var self = this;
    this.play = function(){ return Promise.resolve(); };
    this.pause = function(){};
  };
`, ctx);

load(ctx, 'js/saytext.js', 'js/speech.js');

const run = code => vm.runInContext(code, ctx);
const tick = () => new Promise(r => setTimeout(r, 5));

const fail = [];
function check(name, cond, extra) {
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  - ' + extra : ''));
  if (!cond) fail.push(name);
}
function reset() {
  run('__speakCalls = []; __players = []; __spoken = []; __speakFail = false; __speakStatus = 200;');
}

(async function () {
  console.log('The hosted voice — inventory\n');

  run('LUNOSIA.speech._setPiper(false, []); LUNOSIA.speech._setHostedTTS(false);');
  let list = JSON.parse(run('JSON.stringify(LUNOSIA.speech.allVoicesFor("es"))'));
  check('with nothing available, only the browser voice is offered',
    list.every(v => v.engine === 'browser'), JSON.stringify(list));

  run('LUNOSIA.speech._setHostedTTS(true);');
  list = JSON.parse(run('JSON.stringify(LUNOSIA.speech.allVoicesFor("es"))'));
  check('the hosted voice appears once available', list.some(v => v.engine === 'hosted'));
  check('ranked above the plain browser voice',
    list.findIndex(v => v.engine === 'hosted') < list.findIndex(v => v.engine === 'browser'));
  check('its id carries the language', list.find(v => v.engine === 'hosted').id === 'hosted:es');

  const PIPER_VOICES = [{ id: 'es_ES-davefx-medium', name: 'davefx', locale: 'es_ES', lang: 'es', quality: 'medium' }];
  run('LUNOSIA.speech._setPiper(true, ' + JSON.stringify(PIPER_VOICES) + ');');
  list = JSON.parse(run('JSON.stringify(LUNOSIA.speech.allVoicesFor("es"))'));
  check('Piper still ranks above the hosted voice when both are installed',
    list[0].engine === 'piper' && list.some(v => v.engine === 'hosted'));
  run('LUNOSIA.speech._setPiper(false, []);');   // back to the public-site case

  console.log('\nWho gets picked with nothing saved\n');

  const cast = JSON.parse(run('JSON.stringify(LUNOSIA.speech.castVoice("es", "", null, {}, 1))'));
  check('with no Piper, the hosted voice is chosen automatically', cast.engine === 'hosted', JSON.stringify(cast));
  check('over the plain browser voice', cast.engine !== null);

  run('LUNOSIA.speech._setHostedTTS(false);');
  const castNoHosted = JSON.parse(run('JSON.stringify(LUNOSIA.speech.castVoice("es", "", null, {}, 1))'));
  check('with neither installed, it falls through to the browser voice',
    castNoHosted.engine === null, JSON.stringify(castNoHosted));
  run('LUNOSIA.speech._setHostedTTS(true);');

  console.log('\nSpeaking through it\n');
  reset();
  run(`LUNOSIA.speech.speak('Hola, ¿qué tal?', { lang: 'es', rate: 0.9 });`);
  await tick();
  let calls = JSON.parse(run('JSON.stringify(__speakCalls)'));
  const posted = calls.filter(c => c.init && c.init.method === 'POST');
  check('it posts to /api/speak', posted.length === 1, JSON.stringify(calls));
  check('with the text and language', posted.length &&
    JSON.parse(posted[0].init.body).text.indexOf('qué tal') !== -1 &&
    JSON.parse(posted[0].init.body).lang === 'es');
  check('audio was actually played', run('__players.length') === 1);

  console.log('\nAn explicitly saved hosted voice is honoured\n');
  reset();
  run(`LUNOSIA.speech.speak('Buenos días', { lang: 'es', voiceURI: 'hosted:es' });`);
  await tick();
  check('still goes to the hosted engine', run('__speakCalls.filter(c => c.init.method === "POST").length') === 1);

  console.log('\nFallbacks — the point of building this at all\n');

  reset();
  run('__speakFail = true;');
  run(`LUNOSIA.speech.speak('hola', { lang: 'es' });`);
  await tick();
  check('a dead /api/speak does not go silent — the browser voice speaks instead',
    run('__spoken.length') >= 1, run('__spoken.length'));

  console.log('\nPiper failing falls back to the hosted voice before the browser\n');
  reset();
  const ctx2voices = [{ id: 'es_ES-davefx-medium', name: 'davefx', locale: 'es_ES', lang: 'es', quality: 'medium' }];
  // Make /tts fail (it already 404s in this fake) with Piper "installed":
  run('LUNOSIA.speech._setPiper(true, ' + JSON.stringify(ctx2voices) + ');');
  run(`LUNOSIA.speech.speak('hola de nuevo', { lang: 'es' });`);
  await tick();
  await tick();
  check('the hosted voice is tried before giving up to the browser',
    run('__speakCalls.filter(c => c.init.method === "POST").length') === 1,
    run('JSON.stringify(__speakCalls)'));
  run('LUNOSIA.speech._setPiper(false, []);');

  console.log('\nSpeaking speed is applied as playback rate, since there is no server-side pitch control\n');
  reset();
  run(`LUNOSIA.speech.speak('rapido', { lang: 'es', rate: 1.2 });`);
  await tick();
  const rate = run('__players[0] ? __players[0].playbackRate : null');
  check('the audio element\'s playbackRate reflects the requested speed',
    typeof rate === 'number' && rate > 1, rate);

  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
  process.exit(fail.length ? 1 : 0);
})();
