/* Marta the barista should not speak in a baritone, and Javi should not sound
 * like a woman. One voice reading every part is the detail that quietly tells
 * you nobody was paying attention.
 *
 * Piper has no pitch control and its model cards do not record a speaker's
 * gender, so the app asks who sounds like whom and shifts pitch by resampling.
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
    getVoices: function(){ return []; }, cancel: function(){},
    speak: function(u){ globalThis.__spoken.push({ text: u.text, pitch: u.pitch }); }
  };
  globalThis.SpeechSynthesisUtterance = function(t){ this.text = t; };
  globalThis.__tts = [];
  globalThis.fetch = function (url, init) {
    globalThis.__tts.push(JSON.parse((init && init.body) || '{}'));
    return Promise.resolve({ ok: true, status: 200, blob: function(){ return Promise.resolve({}); } });
  };
  globalThis.URL = { createObjectURL: function(){ return 'blob:x'; }, revokeObjectURL: function(){} };
  globalThis.Audio = function () { this.play = function(){ return Promise.resolve(); }; this.pause = function(){}; };
`, ctx);
load(ctx, 'js/data/vocab-es.js', 'js/data/verbs-es.js', 'js/data/scenarios-es.js', 'js/speech.js');

const S = ctx.PARLA.speech;
const VOICES = [
  { id: 'es_ES-davefx-medium',   name: 'davefx',   locale: 'es_ES', lang: 'es', quality: 'medium' },
  { id: 'es_ES-sharvard-medium', name: 'sharvard', locale: 'es_ES', lang: 'es', quality: 'medium' }
];
vm.runInContext('PARLA.speech._setPiper(true, ' + JSON.stringify(VOICES) + ');', ctx);

const run = c => vm.runInContext(c, ctx);
const tick = () => new Promise(r => setTimeout(r, 5));
const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

const cast = (character, roles, base) =>
  JSON.parse(run('JSON.stringify(PARLA.speech.castVoice("es", "", ' +
    JSON.stringify(character) + ', ' + JSON.stringify(roles || {}) + ', ' + (base || 1) + '))'));

(async function () {
  console.log('Casting\n');

  /* — who plays whom — */
  const roles = { f: 'es_ES-sharvard-medium', m: 'es_ES-davefx-medium' };
  check('a woman gets the voice cast as female',
    cast({ gender: 'f', age: 'adult' }, roles).id === 'es_ES-sharvard-medium');
  check('a man gets the voice cast as male',
    cast({ gender: 'm', age: 'adult' }, roles).id === 'es_ES-davefx-medium');
  check('no character at all still picks a voice',
    cast(null, roles).id === 'es_ES-davefx-medium');

  /* — only one voice tagged — */
  const half = { m: 'es_ES-davefx-medium' };
  const she = cast({ gender: 'f', age: 'adult' }, half);
  check('an untagged gender still gets a voice rather than silence', !!she.id);
  check('and is shifted towards it instead of sounding identical', she.pitch > 1.1, String(she.pitch));
  const he = cast({ gender: 'm', age: 'adult' }, half);
  check('while the tagged one is left alone', he.pitch === 1, String(he.pitch));

  /* — age — */
  const young = cast({ gender: 'm', age: 'young' }, roles).pitch;
  const adult = cast({ gender: 'm', age: 'adult' }, roles).pitch;
  const older = cast({ gender: 'm', age: 'older' }, roles).pitch;
  check('a twenty-year-old sounds higher than an adult', young > adult, young + ' vs ' + adult);
  check('an older character sounds lower', older < adult, older + ' vs ' + adult);
  check('the whole cast shifts with the global dial',
    cast({ gender: 'm', age: 'adult' }, roles, 1.1).pitch > adult);
  check('and characters keep their order within it',
    cast({ gender: 'm', age: 'young' }, roles, 1.1).pitch >
    cast({ gender: 'm', age: 'older' }, roles, 1.1).pitch);

  /* — it reaches the wire — */
  run('__tts = [];');
  run(`PARLA.speech.speak('Hola', { lang: 'es', character: { gender: 'f', age: 'young' },
        voiceRoles: ${JSON.stringify(roles)}, pitchScale: 1 });`);
  await tick();
  const sent = JSON.parse(run('JSON.stringify(__tts[0] || {})'));
  check('the request names the cast voice', sent.voice === 'es_ES-sharvard-medium', sent.voice);
  check('and carries a pitch above 1 for a young character', sent.pitch > 1, String(sent.pitch));

  /* — with no neural voice, the browser still gets the age — */
  run('PARLA.speech._setPiper(false, []); __spoken = [];');
  run("PARLA.speech.speak('Hola', { lang: 'es', character: { gender: 'm', age: 'young' } });");
  await tick();
  const spokenYoung = JSON.parse(run('JSON.stringify(__spoken[0] || {})')).pitch;
  run('__spoken = [];');
  run("PARLA.speech.speak('Hola', { lang: 'es', character: { gender: 'm', age: 'older' } });");
  await tick();
  const spokenOld = JSON.parse(run('JSON.stringify(__spoken[0] || {})')).pitch;
  check('browser voices carry the age too', spokenYoung > spokenOld, spokenYoung + ' vs ' + spokenOld);
  check('and stay inside what the API accepts', spokenYoung <= 2 && spokenOld >= 0.5);

  /* — every scenario is cast — */
  const scenarios = JSON.parse(run('JSON.stringify(PARLA.data.es.scenarios.map(function(s){return {id:s.id,role:s.role,voice:s.voice};}))'));
  const uncast = scenarios.filter(s => !s.voice || !s.voice.gender || !s.voice.age);
  check('every scenario has a cast character', uncast.length === 0,
    uncast.map(s => s.id).join(', '));
  const javi = scenarios.filter(s => /Javi/.test(s.role))[0];
  check('Javi is cast as a man', javi && javi.voice.gender === 'm', javi && JSON.stringify(javi.voice));
  const marta = scenarios.filter(s => /Marta/.test(s.role))[0];
  check('Marta is cast as a woman', marta && marta.voice.gender === 'f');
  check('there is a spread of ages, not one flat cast',
    new Set(scenarios.map(s => s.voice.age)).size >= 3);

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
