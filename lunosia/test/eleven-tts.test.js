/* The ElevenLabs premium voice — exercised the same way test/hosted-tts.test.js
 * and test/piper-tts.test.js exercise their engines: a fake fetch and Audio in
 * Node, proving the routing, priority and fallback logic in js/speech.js
 * rather than the real network call (api.elevenlabs.io is unreachable from
 * this sandbox — confirmed separately with a direct curl, which came back
 * blocked by the outbound proxy).
 *
 * This is the BYO-key premium tier added after MeloTTS's voice quality was
 * reported as bad even once the playback-rate bug (see hosted-tts.test.js)
 * was fixed: someone who pastes in their own ElevenLabs key gets a genuinely
 * better voice, following the same pattern as the optional Gemini chat
 * partner in js/brain.js — the key is sent straight from this browser to
 * ElevenLabs, never through anything of ours.
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

  // Piper always 404s, exactly as it does on the public site. /api/speak and
  // ElevenLabs are both controlled by the test below.
  globalThis.__speakCalls = [];   // /api/speak (hosted MeloTTS)
  globalThis.__elevenCalls = [];  // api.elevenlabs.io
  globalThis.__elevenFail = false;
  globalThis.__speakAvailable = true;
  globalThis.fetch = function (url, init) {
    var u = String(url);
    if (u.indexOf('/tts') === 0) {
      return Promise.resolve({ ok: false, status: 404 });
    }
    if (u.indexOf('/api/speak') === 0) {
      globalThis.__speakCalls.push({ url: u, init: init || {} });
      if (!init || !init.method) {
        return Promise.resolve({ ok: true, json: function () {
          return Promise.resolve({ available: globalThis.__speakAvailable !== false }); } });
      }
      return Promise.resolve({ ok: true, status: 200,
        blob: function () { return Promise.resolve({ fake: 'melotts' }); } });
    }
    if (u.indexOf('https://api.elevenlabs.io/') === 0) {
      globalThis.__elevenCalls.push({ url: u, init: init || {} });
      if (globalThis.__elevenFail) {
        return Promise.resolve({ ok: false, status: 401 });
      }
      return Promise.resolve({ ok: true, status: 200,
        blob: function () { return Promise.resolve({ fake: 'elevenlabs-mp3' }); } });
    }
    return Promise.resolve({ ok: false, status: 404 });
  };

  globalThis.URL = { createObjectURL: function(){ return 'blob:fake'; }, revokeObjectURL: function(){} };

  globalThis.__players = [];
  globalThis.Audio = function (src) {
    this.src = src;
    this.playbackRate = 1;
    globalThis.__players.push(this);
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
  run('__speakCalls = []; __elevenCalls = []; __players = []; __spoken = []; __elevenFail = false;');
}

(async function () {
  console.log('Inventory — the ElevenLabs entry only appears with a key\n');

  run('LUNOSIA.speech._setPiper(false, []); LUNOSIA.speech._setHostedTTS(true);');
  let list = JSON.parse(run('JSON.stringify(LUNOSIA.speech.allVoicesFor("es"))'));
  check('no key: nothing eleven-flavoured is offered', !list.some(v => v.engine === 'eleven'));

  list = JSON.parse(run('JSON.stringify(LUNOSIA.speech.allVoicesFor("es", { key: "sk_test" }))'));
  check('a key present adds the ElevenLabs entry', list.some(v => v.engine === 'eleven'));
  check('ranked above the hosted voice',
    list.findIndex(v => v.engine === 'eleven') < list.findIndex(v => v.engine === 'hosted'));
  check('its id carries the default voice',
    list.find(v => v.engine === 'eleven').id === 'eleven:21m00Tcm4TlvDq8ikWAM');

  list = JSON.parse(run('JSON.stringify(LUNOSIA.speech.allVoicesFor("es", { key: "sk_test", voiceId: "myVoice123" }))'));
  check('a custom voice id is carried through',
    list.find(v => v.engine === 'eleven').id === 'eleven:myVoice123');

  console.log('\nCasting — ElevenLabs outranks Piper and the hosted voice when configured\n');

  const PIPER_VOICES = [{ id: 'es_ES-davefx-medium', name: 'davefx', locale: 'es_ES', lang: 'es', quality: 'medium' }];
  run('LUNOSIA.speech._setPiper(true, ' + JSON.stringify(PIPER_VOICES) + ');');

  let cast = JSON.parse(run('JSON.stringify(LUNOSIA.speech.castVoice("es", "", null, {}, 1, { key: "sk_test" }))'));
  check('with a key, casting picks ElevenLabs over an installed Piper voice',
    cast.engine === 'eleven', JSON.stringify(cast));

  cast = JSON.parse(run('JSON.stringify(LUNOSIA.speech.castVoice("es", "", null, {}, 1))'));
  check('with no key passed, Piper wins as before', cast.engine === 'piper', JSON.stringify(cast));

  cast = JSON.parse(run('JSON.stringify(LUNOSIA.speech.castVoice("es", "piper:es_ES-davefx-medium", null, {}, 1, { key: "sk_test" }))'));
  check('an explicitly saved Piper voice is still honoured over a configured key',
    cast.engine === 'piper', JSON.stringify(cast));

  cast = JSON.parse(run('JSON.stringify(LUNOSIA.speech.castVoice("es", "eleven:otherVoice", null, {}, 1, { key: "sk_test", voiceId: "defaultVoice" }))'));
  check('an explicitly saved ElevenLabs voice id overrides the default',
    cast.engine === 'eleven' && cast.id === 'otherVoice', JSON.stringify(cast));

  run('LUNOSIA.speech._setPiper(false, []);');   // back to the public-site case

  console.log('\nSpeaking through it\n');
  reset();
  run(`LUNOSIA.speech.speak('Hola, ¿qué tal?', { lang: 'es', elevenlabsKey: 'sk_live_abc' });`);
  await tick();
  let calls = JSON.parse(run('JSON.stringify(__elevenCalls)'));
  check('it posts to the real ElevenLabs endpoint',
    calls.length === 1 && calls[0].url.indexOf('https://api.elevenlabs.io/v1/text-to-speech/') === 0,
    JSON.stringify(calls));
  check('carrying the key in the header, not the URL or body',
    calls.length && calls[0].init.headers['xi-api-key'] === 'sk_live_abc');
  check('and the text to speak', calls.length &&
    JSON.parse(calls[0].init.body).text.indexOf('qué tal') !== -1);
  check('never touches /api/speak at all', run('__speakCalls.filter(c => c.init.method === "POST").length') === 0);
  check('audio was actually played', run('__players.length') === 1);

  console.log('\nA custom voice id reaches the URL\n');
  reset();
  run(`LUNOSIA.speech.speak('Buenos días', { lang: 'es', elevenlabsKey: 'sk_x', elevenlabsVoiceId: 'customVoiceId' });`);
  await tick();
  calls = JSON.parse(run('JSON.stringify(__elevenCalls)'));
  check('the chosen voice id is in the path',
    calls.length && calls[0].url.indexOf('customVoiceId') !== -1, JSON.stringify(calls));

  console.log('\nWith no key configured, ElevenLabs is never called\n');
  reset();
  run('LUNOSIA.speech._setHostedTTS(true);');
  run(`LUNOSIA.speech.speak('hola', { lang: 'es' });`);
  await tick();
  check('no eleven call was made', run('__elevenCalls.length') === 0);
  check('the hosted voice was used instead', run('__speakCalls.filter(c => c.init.method === "POST").length') === 1);

  console.log('\nFallback — a bad key or dead network falls through, never silent\n');
  reset();
  run('__elevenFail = true; LUNOSIA.speech._setHostedTTS(true);');
  run(`LUNOSIA.speech.speak('hola', { lang: 'es', elevenlabsKey: 'sk_bad' });`);
  await tick();
  await tick();
  check('ElevenLabs was tried', run('__elevenCalls.length') === 1);
  check('and the hosted voice picked up the turn rather than going silent',
    run('__speakCalls.filter(c => c.init.method === "POST").length') === 1);

  reset();
  run('__elevenFail = true; LUNOSIA.speech._setHostedTTS(false);');
  run(`LUNOSIA.speech.speak('hola de nuevo', { lang: 'es', elevenlabsKey: 'sk_bad' });`);
  await tick();
  await tick();
  check('with nothing else available either, the browser voice finishes the turn',
    run('__spoken.length') >= 1, run('__spoken.length'));
  run('LUNOSIA.speech._setHostedTTS(true);');

  console.log('\nThe app\'s speaking-speed setting never touches this voice either\n');
  reset();
  run(`LUNOSIA.speech.speak('rapido', { lang: 'es', rate: 1.2, elevenlabsKey: 'sk_x' });`);
  await tick();
  const rate = run('__players[0] ? __players[0].playbackRate : null');
  check('a fast rate setting does not speed up the ElevenLabs voice',
    rate === 1 || rate === null, rate);

  console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll checks passed.\n');
  process.exit(fail.length ? 1 : 0);
})();
