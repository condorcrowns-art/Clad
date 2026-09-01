/* The microphone's endpointing, against a fake SpeechRecognition that behaves
 * the way Chrome's actually does: it ends the session on its own every few
 * seconds, whatever `continuous` is set to.
 *
 * The bug this exists for: with continuous = false, a learner saying
 * "Me llamo..." and pausing to think had "Me llamo" submitted as a finished
 * sentence. Everything below is about not doing that again.
 */
const vm = require('vm');
const { makeSandbox, load } = require('./harness');

const ctx = makeSandbox();
vm.runInContext(`
  globalThis.setInterval = function(){ return 0; };
  globalThis.clearInterval = function(){};
  globalThis.isSecureContext = true;
  globalThis.speechSynthesis = { getVoices: function(){ return []; }, cancel: function(){}, speak: function(){} };
  globalThis.SpeechSynthesisUtterance = function(){};

  globalThis.__recs = [];
  function FakeRecognition() {
    var self = this;
    this.started = false;
    this.aborted = false;
    globalThis.__recs.push(this);
    this.start = function () {
      if (self.started) throw new Error('InvalidStateError');
      self.started = true;
      if (self.onstart) self.onstart();
    };
    this.stop  = function () { self.started = false; if (self.onend) self.onend(); };
    this.abort = function () { self.aborted = true; self.started = false; if (self.onend) self.onend(); };

    // Feed results the way the API does: a growing results list.
    this.say = function (chunks) {
      var results = chunks.map(function (c) {
        var r = [{ transcript: c.t, confidence: c.c == null ? 0.9 : c.c }];
        r.isFinal = !!c.final;
        return r;
      });
      results.resultIndex = 0;
      if (self.onresult) self.onresult({ results: results, resultIndex: 0 });
    };
    this.die = function () { self.started = false; if (self.onend) self.onend(); };
    this.fail = function (kind) { if (self.onerror) self.onerror({ error: kind }); };
  }
  globalThis.SpeechRecognition = FakeRecognition;
`, ctx);

load(ctx, 'js/speech.js');
vm.runInContext('PARLA.speech._setPiper(false, []);', ctx);

const run = (c) => vm.runInContext(c, ctx);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const fail = [];
function check(n, c, x) { console.log((c?'  PASS  ':'  FAIL  ')+n+(x?'  - '+x:'')); if(!c) fail.push(n); }

function begin(opts) {
  // Retire the previous handle first. A listener left running keeps its
  // silence timer armed and will happily deliver a transcript into the next
  // test's globals - which is exactly the cross-talk the abort() case exists
  // to prevent, so leaving it in would have hidden a passing implementation
  // behind a failing harness.
  run('if (globalThis.__h) { try { __h.abort(); } catch (e) {} }');
  run('__recs = []; globalThis.__final = null; globalThis.__conf = null; globalThis.__ends = 0; ' +
      'globalThis.__partials = []; globalThis.__errs = [];');
  run(`globalThis.__h = PARLA.speech.listen({
    lang: 'es', ${opts || ''}
    onpartial: function (t) { __partials.push(t); },
    onfinal: function (t, c) { __final = t; __conf = c; },
    onerror: function (k) { __errs.push(k); },
    onend: function () { __ends++; }
  });`);
}
const rec = (i) => `__recs[${i}]`;

(async function () {
  console.log('Microphone endpointing\n');

  /* — the reported bug — */
  begin('silenceMs: 300,');
  run(`${rec(0)}.say([{ t: 'Me llamo', final: true }])`);
  await wait(120);
  check('a pause shorter than the threshold does not end the turn', run('__final') === null);
  run(`${rec(0)}.say([{ t: 'Me llamo', final: true }, { t: ' Condo', final: true }])`);
  await wait(500);
  check('the full sentence is what gets sent, not the fragment',
    run('__final') === 'Me llamo Condo', JSON.stringify(run('__final')));
  check('onend fired exactly once', run('__ends') === 1);

  /* — Chrome ending the session underneath us — */
  begin('silenceMs: 400,');
  run(`${rec(0)}.say([{ t: 'Quiero un cafe', final: true }])`);
  run(`${rec(0)}.die()`);                       // Chrome gives up mid-thought
  await wait(60);
  check('a spontaneous end restarts recognition instead of finishing',
    run('__recs.length') === 2 && run('__final') === null, run('__recs.length') + ' sessions');
  run(`${rec(1)}.say([{ t: 'con leche', final: true }])`);
  await wait(600);
  check('the transcript is stitched across the seam',
    run('__final') === 'Quiero un cafe con leche', JSON.stringify(run('__final')));

  /* — interim text — */
  begin('silenceMs: 400,');
  run(`${rec(0)}.say([{ t: 'Buenos', final: false }])`);
  await wait(50);
  check('interim words are reported as you speak', run('__partials').includes('Buenos'));
  check('but interim words alone do not end the turn', run('__final') === null);

  /* — the escape hatches — */
  begin('silenceMs: 9000,');
  run(`${rec(0)}.say([{ t: 'Hola que tal', final: true }])`);
  run('__h.stop()');
  await wait(50);
  check('tapping the mic sends immediately without waiting out the silence',
    run('__final') === 'Hola que tal');

  begin('silenceMs: 9000,');
  run(`${rec(0)}.say([{ t: 'no queria decir eso', final: true }])`);
  run('__h.abort()');
  await wait(400);
  check('cancel discards the transcript', run('__final') === null);
  check('cancel does not fire onend', run('__ends') === 0);
  check('cancel stops the recogniser', run(`${rec(0)}.aborted`) === true);

  /* — errors — */
  begin('silenceMs: 400,');
  run(`${rec(0)}.fail('no-speech')`);
  await wait(50);
  check('no-speech is not surfaced as an error', run('__errs').length === 0);
  run(`${rec(0)}.fail('not-allowed')`);
  await wait(50);
  check('a blocked microphone is surfaced', run('__errs').includes('not-allowed'));
  run(`${rec(0)}.die()`);
  await wait(60);
  check('and does not retry into the same refusal', run('__recs.length') === 1);

  /* — nothing said at all — */
  begin('silenceMs: 300, noSpeechMs: 200,');
  await wait(500);
  check('silence with no speech ends without submitting', run('__final') === null && run('__ends') === 1);

  /* — confidence reaches the caller — */
  begin('silenceMs: 200,');
  run(`${rec(0)}.say([{ t: 'algo raro', final: true, c: 0.4 }])`);
  await wait(400);
  check('the recogniser\'s confidence is passed on', run('__conf') === 0.4, String(run('__conf')));

  /* — the hard ceiling — */
  begin('silenceMs: 9000, maxMs: 250,');
  run(`${rec(0)}.say([{ t: 'hablando sin parar', final: true }])`);
  await wait(600);
  check('a stuck recogniser cannot listen forever', run('__final') === 'hablando sin parar');

  console.log('\n' + (fail.length ? fail.length + ' FAILED: ' + fail.join(', ') : 'All checks passed.'));
  process.exit(fail.length ? 1 : 0);
})();
