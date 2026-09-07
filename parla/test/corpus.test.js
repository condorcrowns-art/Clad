/* The content is the product. A duplicate word silently steals a review slot
 * from a word you have not seen; a malformed row breaks a drill mid-session.
 * Neither is visible until you are already using it, so they are checked here.
 */
const { makeSandbox, load } = require('./harness');
const D = load(makeSandbox(), 'js/data/vocab-es.js', 'js/data/verbs-es.js',
                              'js/data/scenarios-es.js', 'js/data/challenge-es.js').PARLA.data.es;

const fail = [];
const check = (n,c,x)=>{console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:''));if(!c)fail.push(n);};

console.log('Corpus\n');

const v = D.vocab;
check('the deck is worth studying', v.length >= 400, v.length + ' words');

const shape = v.filter(r => !Array.isArray(r) || r.length !== 6 ||
                            r.some(x => typeof x !== 'string' || !x.trim()));
check('every row is complete', shape.length === 0,
  shape.slice(0, 3).map(r => JSON.stringify(r)).join(' '));

const seen = new Set(), dup = [];
v.forEach(r => { if (seen.has(r[0])) dup.push(r[0]); seen.add(r[0]); });
check('no word appears twice', dup.length === 0, dup.slice(0, 6).join(', '));

const POS = /^(noun-m|noun-f|verb|adj|adv|prep|conj|interj|phrase|num|pron)$/;
const badPos = v.filter(r => !POS.test(r[2]));
check('every part of speech is one of the documented set', badPos.length === 0,
  badPos.slice(0, 4).map(r => r[0] + '=' + r[2]).join(', '));

const badTag = v.filter(r => !/\|(a1|a2|b1|b2)$/.test(r[5]));
check('every word carries a CEFR level', badTag.length === 0,
  badTag.slice(0, 4).map(r => r[0] + '=' + r[5]).join(', '));

// The example is what makes a word learnable, and the cloze drill needs the
// word to actually occur in it.
const bare = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                    .replace(/[^a-z0-9ñ ]/g, ' ').replace(/^(el|la|los|las|un|una)\s+/, '').trim();
const noExample = v.filter(r => r[3].trim().length < 6);
check('every word has a real example sentence', noExample.length === 0,
  noExample.slice(0, 4).map(r => r[0]).join(', '));

const clozeable = v.filter(r => {
  const head = bare(r[0]).split(' ').pop();
  return head.length >= 4 && new RegExp('\\b' + head, 'i').test(bare(r[3]));
});
check('most words appear in their own example, so the fill-in drill has material',
  clozeable.length > v.length * 0.5, clozeable.length + ' of ' + v.length);

const levels = {};
v.forEach(r => { const m = r[5].match(/\|(a1|a2|b1|b2)$/); if (m) levels[m[1]] = (levels[m[1]]||0)+1; });
check('there is material at every level', Object.keys(levels).length >= 3, JSON.stringify(levels));

console.log('\nScenarios\n');
const sc = D.scenarios;
check('scenario ids are unique', new Set(sc.map(s => s.id)).size === sc.length);
check('every scenario has an opener', sc.every(s => s.opener && s.opener.es && s.opener.en));
check('every scenario has goals', sc.every(s => (s.goals || []).length > 0));
check('every scenario has phrases for when you are stuck',
  sc.every(s => (s.phrases || []).length >= 2),
  sc.filter(s => (s.phrases||[]).length < 2).map(s => s.id).join(', '));
check('every scenario has offline script beats', sc.every(s => (s.script || []).length > 0));

console.log('\nChallenge\n');
check('the challenge is exactly 60 days', D.challenge.length === 60, String(D.challenge.length));
const ids = new Set(sc.map(s => s.id));
const orphan = D.challenge.filter(d => !ids.has(d[3]));
check('every day points at a scenario that exists', orphan.length === 0,
  orphan.slice(0, 4).map(d => d[3]).join(', '));

console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
process.exit(fail.length ? 1 : 0);
