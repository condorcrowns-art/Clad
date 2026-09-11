/* The sixty-day plan, and the second task each day now carries.
 *
 * The plan is the spine of the app: it is on the home screen, it has its own
 * tab, and it is what a learner who wants to be told what to do will follow.
 * It had become narrower than the app — sixty days of nothing but conversation
 * meant someone following it literally never opened the reading, the
 * listening, the writing or the sounds, four of the six things Parla can
 * teach.
 *
 * These check the pairing holds together, and above all that every id resolves.
 * A second task pointing at a text that was renamed is a dead card on the home
 * screen, and it would not throw — it would just quietly disappear.
 */
const { makeSandbox, load } = require('./harness');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = [];
const check = (n, c, x) => { console.log((c ? '  PASS  ' : '  FAIL  ') + n + (x ? '  - ' + x : '')); if (!c) fail.push(n); };

const ctx = load(makeSandbox(),
  ...fs.readdirSync(ROOT + '/js/data').filter(f => f.endsWith('.js')).map(f => 'js/data/' + f));
const d = ctx.PARLA.data.es;
const days = d.challenge;

console.log('The plan\n');
check('sixty days', days.length === 60, String(days.length));
check('every day names a scenario that exists',
  days.every(x => d.scenarios.some(s => s.id === x[3])),
  days.filter(x => !d.scenarios.some(s => s.id === x[3])).map(x => x[3]).join(', '));

console.log('\nEvery day has a second thing to do\n');
check('all sixty of them', days.every(x => Array.isArray(x[5]) && x[5].length === 2),
  days.map((x, i) => (Array.isArray(x[5]) ? '' : i + 1)).filter(Boolean).join(', '));

const KINDS = ['read', 'listen', 'write', 'sound', 'lesson'];
check('each is one of the five kinds',
  days.every(x => KINDS.indexOf(x[5][0]) !== -1),
  days.filter(x => KINDS.indexOf(x[5][0]) === -1).map(x => x[5][0]).join(', '));

// The one that matters: a dangling id is a dead card on the home screen, and
// it would not throw — it would quietly render nothing.
const resolve = {
  read: id => !!d.readingById[id],
  listen: id => !!d.readingById[id],
  write: id => !!d.writingById[id],
  sound: id => !!d.soundsById[id],
  lesson: id => d.grammar.some(g => g.id === id)
};
const dead = days
  .map((x, i) => (resolve[x[5][0]] && resolve[x[5][0]](x[5][1])) ? null : 'day ' + (i + 1) + ' → ' + x[5].join(':'))
  .filter(Boolean);
check('and every id points at something that exists', dead.length === 0, dead.join(', '));

console.log('\nIt covers the app rather than one corner of it\n');
const kinds = {};
days.forEach(x => { kinds[x[5][0]] = (kinds[x[5][0]] || 0) + 1; });
check('all five kinds are used', KINDS.every(k => kinds[k] > 0), JSON.stringify(kinds));
check('writing carries the most, since it is the one that makes you produce',
  kinds.write >= 20, JSON.stringify(kinds));
check('every one of the ten sounds gets a turn',
  new Set(days.filter(x => x[5][0] === 'sound').map(x => x[5][1])).size === d.sounds.length,
  JSON.stringify(days.filter(x => x[5][0] === 'sound').map(x => x[5][1])));
check('most of the writing tasks are reached',
  new Set(days.filter(x => x[5][0] === 'write').map(x => x[5][1])).size >= d.writing.length - 2);
check('and most of the texts',
  new Set(days.filter(x => x[5][0] === 'read').map(x => x[5][1])).size >= d.reading.length - 3);

console.log('\nA text is read before it is heard\n');
// Listening to a text you have never seen is the hardest version of the
// exercise, and a plan that starts there is a plan people give up on.
const firstRead = {}, firstHeard = {};
days.forEach((x, i) => {
  if (x[5][0] === 'read' && firstRead[x[5][1]] == null) firstRead[x[5][1]] = i;
  if (x[5][0] === 'listen' && firstHeard[x[5][1]] == null) firstHeard[x[5][1]] = i;
});
const outOfOrder = Object.keys(firstHeard).filter(id =>
  firstRead[id] == null || firstRead[id] > firstHeard[id]);
check('every listening day follows the day that text was read',
  outOfOrder.length === 0, outOfOrder.join(', '));

console.log('\nThe grammar arrives when it is needed, not before\n');
// A plan that puts the subjunctive on day 4 is a plan that teaches nobody.
const lessonDay = {};
days.forEach((x, i) => { if (x[5][0] === 'lesson') lessonDay[x[5][1]] = i + 1; });
check('the subjunctive is in the second half',
  !lessonDay.subjunctive || lessonDay.subjunctive > 30, String(lessonDay.subjunctive));
check('the preterite comes before it',
  !lessonDay.preterito || !lessonDay.subjunctive || lessonDay.preterito < lessonDay.subjunctive,
  lessonDay.preterito + ' vs ' + lessonDay.subjunctive);
check('and gustar is in the first fortnight, since it is needed on day one',
  !lessonDay.gustar || lessonDay.gustar <= 14, String(lessonDay.gustar));

console.log('\nNo day repeats itself\n');
const seen = {};
const dupes = [];
days.forEach((x, i) => {
  const k = x[5].join(':');
  // read and listen on the same text is the point, so key on both.
  if (seen[k]) dupes.push('day ' + (i + 1) + ' repeats day ' + seen[k] + ' (' + k + ')');
  seen[k] = i + 1;
});
check('every second task is different', dupes.length === 0, dupes.join(', '));

console.log(fail.length ? '\n' + fail.length + ' FAILED\n' : '\nAll challenge checks passed\n');
process.exit(fail.length ? 1 : 0);
