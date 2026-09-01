/* Verify the ranking actually puts good voices first, using the real voice
 * shapes Windows/Chrome expose. */
const { makeSandbox, load } = require('./harness');
const ctx = makeSandbox();
// speech.js touches speechSynthesis; stub enough for it to load.
const vm = require('vm');
vm.runInContext(`
  globalThis.setInterval = function(){ return 0; };
  globalThis.clearInterval = function(){};
  var __voices = [];
  globalThis.speechSynthesis = { getVoices: function(){ return __voices; }, cancel: function(){}, speak: function(){} };
  globalThis.SpeechSynthesisUtterance = function(){};
  globalThis.isSecureContext = true;
`, ctx);
load(ctx, 'js/speech.js');

// A realistic Windows 11 + Chrome voice list, in the arbitrary order the API returns.
const voices = [
  { name: 'Microsoft Helena Desktop - Spanish (Spain)', lang: 'es-ES', localService: true,  voiceURI: 'helena-desktop' },
  { name: 'Microsoft Sabina Desktop - Spanish (Mexico)', lang: 'es-MX', localService: true, voiceURI: 'sabina-desktop' },
  { name: 'Microsoft Pablo - Spanish (Spain)',          lang: 'es-ES', localService: true,  voiceURI: 'pablo' },
  { name: 'Google español',                              lang: 'es-ES', localService: false, voiceURI: 'google-es' },
  { name: 'Google español de Estados Unidos',            lang: 'es-US', localService: false, voiceURI: 'google-es-us' },
  { name: 'Microsoft Alvaro Online (Natural) - Spanish (Spain)', lang: 'es-ES', localService: false, voiceURI: 'alvaro-natural' },
  { name: 'Microsoft David - English (United States)',   lang: 'en-US', localService: true,  voiceURI: 'david' }
];
vm.runInContext('__voices = ' + JSON.stringify(voices) + ';', ctx);
vm.runInContext('speechSynthesis.onvoiceschanged && speechSynthesis.onvoiceschanged();', ctx);

const S = ctx.PARLA.speech;
// force a refresh now that voices exist
const list = S.voicesFor('es');

const fail = [];
function check(n, c, x){ console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  — '+x:'')); if(!c) fail.push(n); }

console.log('Ranked order:');
list.forEach((v,i)=>console.log('  '+(i+1)+'. '+v.name+'   ['+S.voiceQuality(v)+']'));

console.log('\nChecks:');
check('English voice excluded', !list.some(v=>v.lang.startsWith('en')));
// Windows 11 "Natural" voices are Azure neural and genuinely beat Google's,
// so the assertion is that a top-tier voice wins - not that Google does.
check('a top-tier voice ranks first', S.voiceQuality(list[0])==='best', list[0].name);
check('no legacy SAPI voice ranks first', !/Desktop/.test(list[0].name) && list[0].name!=='Microsoft Pablo - Spanish (Spain)', list[0].name);
check('every neural/Google voice outranks every legacy one',
  Math.max(...list.map((v,i)=>/Natural|^Google/.test(v.name)?i:-1)) <
  Math.min(...list.map((v,i)=>/Natural|^Google/.test(v.name)?99:i)));
check('old SAPI Desktop voices rank last',
  /Desktop/.test(list[list.length-1].name), list[list.length-1].name);
check('Natural voice beats plain SAPI',
  list.findIndex(v=>/Natural/.test(v.name)) < list.findIndex(v=>v.name==='Microsoft Pablo - Spanish (Spain)'));
check('Desktop voices labelled "basic"', S.voiceQuality(list[list.length-1])==='basic',
  S.voiceQuality(list[list.length-1]));
check('Google labelled "best"', S.voiceQuality(list[0])==='best', S.voiceQuality(list[0]));
check('pickVoice with no saved URI returns the best', S.pickVoice('es','').name===list[0].name);
check('pickVoice honours an explicit saved choice', S.pickVoice('es','pablo').voiceURI==='pablo');

console.log('\n'+(fail.length?'FAILURES: '+fail.join(', '):'ALL VOICE CHECKS PASSED'));
process.exit(fail.length?1:0);
