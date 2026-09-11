/* Carrying progress from one device to another.
 *
 * Everything the app knows about you lives in one browser's localStorage.
 * That is two problems wearing one coat: clear the site data and a sixty-day
 * streak goes with it, and the phone and the computer keep two decks that
 * never meet. Both are solved by the same exported file — but only if
 * bringing it in *merges*. Import used to replace, so carrying the phone's
 * save to the computer destroyed the computer's.
 *
 * The rule these check is that neither side loses: the union of what you have
 * collected, and where the same thing is on both, whichever record represents
 * more work. And that the counters are taken as a maximum rather than a sum,
 * because one session synced both ways is one session and not two.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

function freshStore() {
  const ctx = makeSandbox();
  vm.runInContext(`
    globalThis.fetch = function(){ return Promise.reject(new Error('no network')); };
    var __ls = {};
    globalThis.localStorage = {
      getItem: function (k) { return __ls[k] == null ? null : __ls[k]; },
      setItem: function (k, v) { __ls[k] = String(v); },
      removeItem: function (k) { delete __ls[k]; }
    };
    globalThis.console = console;
  `, ctx);
  load(ctx, 'js/srs.js', 'js/store.js');
  vm.runInContext('PARLA.store.load();', ctx);
  return ctx.PARLA.store;
}

/* — the phone — */
const phone = freshStore();
phone.addWord('la escalera', 'the stairs', 'Hay un perro en la escalera.', '');
phone.addWord('el collar', 'the collar', '', '');
phone.rememberMistake({ es: 'soy cansado', fix: 'estoy cansado', note: 'ser/estar', topic: 'serestar' });
phone.markRead('perro', 3, 3);
phone.state.sounds = { rr: { tries: 9, ok: 7 } };
phone.state.progress.xp = 400;
phone.state.progress.streak = 6;
phone.state.progress.bestStreak = 6;
phone.state.progress.challengeDone = [0, 1, 2];
phone.state.progress.totals.sessions = 12;
phone.state.memory.name = 'Condo';
phone.state.memory.facts = ['They are from Chicago'];
phone.state.history = [{ when: 1000, scenarioId: 'cafe', turns: 8, xp: 40 }];
phone.save();
const fromPhone = phone.exportJSON();

/* — the computer, with its own separate work on it — */
const pc = freshStore();
pc.addWord('la escalera', 'the stairs', '', '');   // the same word, learned twice
pc.addWord('la llave', 'the key', '', '');
pc.rememberMistake({ es: 'la problema', fix: 'el problema', note: 'gender', topic: 'gender' });
pc.markRead('llaves', 2, 3);
pc.state.sounds = { rr: { tries: 3, ok: 1 }, j: { tries: 5, ok: 5 } };
pc.state.progress.xp = 250;
pc.state.progress.streak = 2;
pc.state.progress.bestStreak = 9;
pc.state.progress.challengeDone = [0, 5];
pc.state.progress.totals.sessions = 7;
pc.state.settings.rate = 1.4;                      // this device's own voice speed
pc.state.history = [{ when: 2000, scenarioId: 'tienda', turns: 5, xp: 25 }];
pc.save();

// A card the computer is further along on, and one the phone is.
const kEsc = 'la escalera';
pc.state.srs[kEsc] = { ease: 2.5, interval: 21, due: 9e12, reps: 6, lapses: 0 };
const phoneSave = JSON.parse(fromPhone);
phoneSave.srs[kEsc] = { ease: 2.5, interval: 1, due: 1, reps: 1, lapses: 0 };
phoneSave.srs['el collar'] = { ease: 2.5, interval: 4, due: 5e12, reps: 3, lapses: 0 };
pc.save();

console.log('Bringing the phone in\n');
const got = pc.mergeJSON(JSON.stringify(phoneSave));

console.log('Nothing the computer had is lost\n');
const words = pc.state.phrases.map(p => p.es);
check('its own words are still there', words.includes('la llave'), words.join(' / '));
check('its own mistakes are still there',
  pc.state.mistakes.some(m => m.es === 'la problema'));
check('its own reading is still there', !!pc.state.reading.llaves);
check('and its own voice speed was not overwritten by the phone’s',
  pc.state.settings.rate === 1.4, String(pc.state.settings.rate));

console.log('\nAnd everything from the phone arrives\n');
check('the words', words.includes('el collar'), String(got.words) + ' new');
check('the mistakes', pc.state.mistakes.some(m => m.es === 'soy cansado'));
check('what it had read', !!pc.state.reading.perro);
check('and the sessions', pc.state.history.some(h => h.when === 1000));
check('the report says what arrived, not just that something did',
  got.words === 1 && got.mistakes === 1 && got.texts === 1 && got.sessions === 1,
  JSON.stringify(got));

console.log('\nThe same word learned on both devices\n');
check('is one word, not two',
  words.filter(w => w === 'la escalera').length === 1, words.join(' / '));
// Six recalls beats one. Taking the phone's card would have thrown away three
// weeks of the computer's spacing.
check('and keeps the card that is further along',
  pc.state.srs[kEsc].reps === 6 && pc.state.srs[kEsc].interval === 21,
  JSON.stringify(pc.state.srs[kEsc]));
check('while a card only the phone had comes across whole',
  pc.state.srs['el collar'] && pc.state.srs['el collar'].reps === 3);

console.log('\nCounters are pooled, never added up\n');
const p = pc.state.progress;
check('XP is the higher of the two, not the sum', p.xp === 400, String(p.xp));
check('the streak is the longer one', p.streak === 6, String(p.streak));
check('and the best streak survives from whichever device set it',
  p.bestStreak === 9, String(p.bestStreak));
check('challenge days are the union', p.challengeDone.join(',') === '0,1,2,5',
  p.challengeDone.join(','));
check('and a session synced both ways is still one session',
  p.totals.sessions === 12, String(p.totals.sessions));

console.log('\nPer-sound scores keep the one with more practice\n');
check('nine tries beats three', pc.state.sounds.rr.tries === 9,
  JSON.stringify(pc.state.sounds.rr));
check('and a sound only this device practised is untouched',
  pc.state.sounds.j.tries === 5);

console.log('\nWho the partner is talking to\n');
check('a name arrives when this device had none', pc.state.memory.name === 'Condo');
check('and what it knows comes with it',
  pc.state.memory.facts.includes('They are from Chicago'));

console.log('\nMerging the same file twice changes nothing\n');
const before = JSON.stringify(pc.state);
const again = pc.mergeJSON(JSON.stringify(phoneSave));
check('no duplicates the second time round',
  JSON.stringify(pc.state) === before, JSON.stringify(again));
check('and it says so rather than claiming success',
  again.words === 0 && again.mistakes === 0 && again.sessions === 0,
  JSON.stringify(again));

console.log('\nA file that is not a save\n');
[['not json at all', '{{{'],
 ['an empty object', '{}'],
 ['someone else’s json', '{"tracks":[{"name":"x"}]}'],
 ['a bare array', '[1,2,3]']
].forEach(([what, text]) => {
  let threw = false;
  try { pc.mergeJSON(text); } catch (e) { threw = true; }
  check(what + ' is refused rather than half-applied', threw);
});
check('and the deck is untouched after all that',
  JSON.stringify(pc.state) === before);

console.log('\nA save with fields this version has never heard of\n');
const future = JSON.parse(fromPhone);
future.somethingNew = { a: 1 };
future.progress.newCounter = 99;
let ok = true;
try { pc.mergeJSON(JSON.stringify(future)); } catch (e) { ok = false; }
check('is merged for the parts that are understood', ok);
check('without inventing state for the parts that are not',
  pc.state.somethingNew === undefined);

console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll transfer checks passed\n');
process.exit(fail.length ? 1 : 0);
