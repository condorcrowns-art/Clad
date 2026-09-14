/* Lunosia — build the written pages from the app's own teaching material.
 *
 *   node tools/build-pages.js
 *
 * The twenty grammar lessons and ten pronunciation topics are the most
 * substantial original writing in this project, and until now they existed
 * only inside a JavaScript application — unreadable to anyone who has not
 * loaded and run it, and invisible to anything that indexes text.
 *
 * WHY THIS IS A GENERATOR AND NOT A FOLDER OF HAND-WRITTEN PAGES: the lessons
 * are edited as data, because the app drills them and the grammar checker
 * links corrections to them by id. A hand-maintained second copy would be
 * wrong within a month, and a wrong explanation is worse than a missing one.
 *
 * WHY SIX PAGES AND NOT THIRTY: one page per lesson would be thirty pages of
 * three hundred words each, and one page per dictionary entry would be thirty
 * thousand. Both are what Google's spam policy calls scaled content abuse, and
 * the second is a fast route to a permanent ban. Grouped by theme, each page
 * carries three to five related lessons and reads as something a person would
 * actually sit down with.
 *
 * The framing prose below is written by hand, per page. The generator arranges
 * material; it does not pretend to have something to say.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://lunosia.com/';

/* Where the pages land. Defaults to the site itself; the test points it at a
 * scratch directory so it can rebuild and compare without touching anything —
 * which is how it can tell whether the committed pages still match the lessons
 * they were generated from. A guide that quietly disagrees with the app is
 * worse than no guide. */
const OUT = process.env.LUNOSIA_OUT_DIR || ROOT;

/* ── the data, read the way the browser reads it ─────────── */
const ctx = vm.createContext({});
vm.runInContext('var window = this; var LUNOSIA;', ctx);
['grammar-es', 'sounds-es'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data', f + '.js'), 'utf8'), ctx));
const DATA = vm.runInContext('LUNOSIA.data.es', ctx);
const lesson = id => {
  const l = DATA.grammar.filter(g => g.id === id)[0];
  if (!l) throw new Error('no lesson "' + id + '" — the guide is out of step with the data');
  return l;
};

/* ── the guides ──────────────────────────────────────────────
 * `intro` is the page's own argument for existing: what these particular
 * lessons have in common and why they are worth an hour. */
const GUIDES = [
  {
    slug: 'ser-estar',
    title: 'ser, estar, tener and hay',
    blurb: 'Four ways Spanish says what English says with "to be" and "to have".',
    lessons: ['serestar', 'tener', 'haypersonal'],
    intro: `English gets by with two verbs here — <em>to be</em> and <em>to have</em> —
      and Spanish uses four, split along lines English does not draw. This is the
      first wall every learner hits, and it is not a matter of vocabulary: there
      is nothing in your own grammar for the distinction to attach to, so it has
      to be installed deliberately.
      <br><br>
      The good news is that the rules are short and they are rules, not
      tendencies. Learn the four below and a large share of the sentences you
      will build in your first year stop being guesswork.`
  },
  {
    slug: 'gender-and-agreement',
    title: 'Gender, agreement and word order',
    blurb: 'Why "la problema" and "un rojo coche" mark you out, and how to stop saying them.',
    lessons: ['gender', 'agreement', 'wordorder', 'contractions'],
    intro: `English nouns have no gender and English adjectives never change
      shape, so all of this is new machinery rather than a different setting on
      machinery you already own. It is also the most visible thing about a
      learner's Spanish: gender and agreement errors do not stop you being
      understood, which is exactly why they go uncorrected for years.
      <br><br>
      The rules are mechanical and they hold. The exceptions worth knowing are
      few enough to list, and they are listed here.`
  },
  {
    slug: 'verbs-that-differ',
    title: 'Verbs that do not behave like English',
    blurb: 'gustar runs backwards, the ending is the pronoun, and two verbs mean "to know".',
    lessons: ['gustar', 'person', 'reflexive', 'saberconocer'],
    intro: `Some Spanish verbs are not harder than their English equivalents —
      they are arranged differently, and translating word by word produces
      sentences that are grammatical nonsense rather than mere mistakes.
      <em>Yo gusto el café</em> does not mean "I like coffee"; it means you are
      pleasing the coffee.
      <br><br>
      Each of these has a single structural insight behind it. Once you see the
      shape, the whole family of sentences comes with it.`
  },
  {
    slug: 'past-and-subjunctive',
    title: 'The two past tenses, por vs para, and the subjunctive',
    blurb: 'The four things that separate getting by from being fluent.',
    lessons: ['preterito', 'porpara', 'personal-a', 'subjunctive'],
    intro: `This is the intermediate wall. Everything above can be brute-forced
      with enough practice; these four cannot, because each asks you to make a
      distinction English simply does not make, and to make it every single time
      you open your mouth.
      <br><br>
      They are also what a listener notices. A learner who has these is
      understood as a Spanish speaker with an accent. A learner who has not is
      understood as someone learning.`
  },
  {
    slug: 'small-words',
    title: 'The small words that give you away',
    blurb: 'Double negatives, muy against mucho, question marks, accents, and words that lie.',
    lessons: ['negation', 'muymucho', 'questions', 'accents', 'falsefriends'],
    intro: `None of these will stop you being understood, and all of them are
      noticed. They are the difference between Spanish that works and Spanish
      that sounds like Spanish — and because none of them causes a
      misunderstanding, nobody ever corrects them for you.
      <br><br>
      Each takes about five minutes to learn and then stays learned. Of
      everything on this site this is the best return on the time.`
  }
];

/* ── html ────────────────────────────────────────────────── */
/* Quotes included: these strings go into attributes as well as into text, and
 * a blurb containing "la problema" closed the content attribute early and threw
 * the rest of the sentence into the tag. The page still rendered, so only a
 * machine reading the description would ever have noticed. */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [
  ['index.html', 'The app'],
  ['guides/', 'Guides'],
  ['about.html', 'About'],
  ['contact.html', 'Contact']
];

function shell(o) {
  const up = o.depth ? '../' : '';
  const nav = NAV.map(([href, label]) => {
    const to = href === 'guides/' ? up + 'guides/index.html' : up + href;
    const here = o.current === href;
    return `<a href="${to}"${here ? ' aria-current="page"' : ''}>${label}</a>`;
  }).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${SITE}${o.path}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${SITE}${o.path}">
<meta property="og:site_name" content="Lunosia">
<meta name="theme-color" content="#e01a76">
<link rel="manifest" href="${up}manifest.json">
<link rel="apple-touch-icon" href="${up}icon-192.png">
<link rel="icon" type="image/svg+xml" href="${up}icon.svg">
<link rel="alternate icon" href="${up}icon-192.png">
<link rel="stylesheet" href="${up}css/style.css">
<link rel="stylesheet" href="${up}css/page.css">
<!-- AdSense. Present on every page because Google verifies ownership by
     finding it; ad units are a separate step and are kept off the
     conversation screens. -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6431955508681504"
     crossorigin="anonymous"></script>
</head>
<body>

<header class="site-head">
  <div class="inner">
    <a class="wordmark" href="${up}index.html"><img src="${up}icon.svg" alt="" width="26" height="26">Lunosia</a>
    <nav aria-label="Site">
        ${nav}
    </nav>
  </div>
</header>

<main class="page">
${o.body}
</main>

<footer class="site-foot">
  <div class="inner">
    <nav aria-label="Footer">
      <a href="${up}index.html">Open Lunosia</a>
      <a href="${up}guides/index.html">Guides</a>
      <a href="${up}about.html">About</a>
      <a href="${up}contact.html">Contact</a>
      <a href="${up}privacy.html">Privacy</a>
      <a href="${up}terms.html">Terms</a>
    </nav>
    <p>Lunosia is a free Spanish trainer. No account, no subscription, and it
       works offline once you have opened it.</p>
  </div>
</footer>

</body>
</html>
`;
}

function pairsBlock(pairs) {
  if (!pairs || !pairs.length) return '';
  return '<div class="pairs">\n' + pairs.map(([aEs, aEn, bEs, bEn]) => {
    // The second column is the mistake in a grammar lesson and the other real
    // word in a pronunciation one. A ✗ in the gloss is how the data marks it.
    const wrong = /^✗/.test(String(bEn || ''));
    return `  <div class="pair">
    <div><span class="es">${esc(aEs)}</span><span class="en">${esc(aEn)}</span></div>
    <div${wrong ? ' class="wrong"' : ''}><span class="es">${esc(bEs)}</span><span class="en">${esc(bEn)}</span></div>
  </div>`;
  }).join('\n') + '\n</div>';
}

function drillBlock(drill) {
  if (!drill || !drill.length) return '';
  return `<h3>Check yourself</h3>
<ol class="drills">
` + drill.map(([q, a, , why]) => `  <li><span class="q">${esc(q)}</span> —
    <span class="a">${esc(a)}</span>${why ? `<span class="why">${esc(why)}</span>` : ''}</li>`).join('\n')
    + '\n</ol>';
}

function lessonBlock(l) {
  return `<h2 id="${esc(l.id)}">${esc(l.title)}<span class="level">${esc(l.level)}</span></h2>
<p class="lede">${esc(l.sub)}</p>
<p><strong>Why English speakers get this wrong.</strong> ${esc(l.why)}</p>
<p class="rule"><b>The rule:</b> ${esc(l.rule)}</p>
${l.more ? `<p>${esc(l.more)}</p>` : ''}
${pairsBlock(l.pairs)}
${drillBlock(l.drill)}`;
}

/* ── write them ──────────────────────────────────────────── */
const out = [];
function write(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  out.push({ rel, words });
}

GUIDES.forEach(g => {
  const body = `<h1>${esc(g.title)}</h1>
<p class="lede">${esc(g.blurb)}</p>
<p>${g.intro}</p>
<p><a class="cta" href="../index.html">Practise this in Lunosia →</a></p>

${g.lessons.map(id => lessonBlock(lesson(id))).join('\n\n<hr style="border:0;border-top:1px solid var(--line-soft);margin:38px 0">\n\n')}

<h2>Keep going</h2>
<p>Reading a rule is not the same as producing it under time pressure, which is
   the only thing that makes it stick. Lunosia drills every point on this page,
   corrects what you say out loud, and brings your own mistakes back days later
   until you can fix them from memory.</p>
<p><a class="cta" href="../index.html">Open Lunosia →</a></p>
<p><a href="index.html">← All guides</a></p>`;

  write('guides/' + g.slug + '.html', shell({
    title: g.title + ' — Spanish for English speakers',
    description: g.blurb,
    path: 'guides/' + g.slug + '.html',
    current: 'guides/', depth: 1, body
  }));
});

/* Pronunciation, which is shaped differently enough to build on its own. */
const soundsBody = `<h1>Ten Spanish sounds an English mouth gets wrong</h1>
<p class="lede">Not a list of what the letters say — a list of what your mouth
   does instead, and what to do about it.</p>
<p>Pronunciation advice usually stops at "the Spanish r is rolled", which tells
   you the target and nothing about how to hit it. The useful part is the
   comparison: what your tongue is doing now, what it needs to do instead, and
   which English sound is already close enough to build from.</p>
<p>Each one below is rated by how much it costs you. High means it changes
   words — <em>perro</em> and <em>pero</em> are dog and but — so getting it
   wrong is not an accent, it is a different sentence.</p>
<p><a class="cta" href="../index.html">Practise these out loud →</a></p>

${DATA.sounds.map(s => `<h2 id="${esc(s.id)}">${esc(s.title)}<span class="level">${esc(s.cost)} cost</span></h2>
<p class="rule"><b>Written:</b> ${esc(s.letters)}</p>
<p><strong>What your mouth does instead.</strong> ${esc(s.instead)}</p>
<p><strong>What it should do.</strong> ${esc(s.mouth)}</p>
${s.trick ? `<p><strong>The shortcut.</strong> ${esc(s.trick)}</p>` : ''}
${pairsBlock(s.pairs)}
${s.words && s.words.length ? `<p><strong>Words to practise:</strong> ${s.words.map(esc).join(', ')}.</p>` : ''}`)
  .join('\n\n<hr style="border:0;border-top:1px solid var(--line-soft);margin:38px 0">\n\n')}

<h2>Hearing it is the hard part</h2>
<p>You cannot reliably make a distinction you cannot hear, and the pairs above
   are the test. Lunosia plays them, listens to you say them back, and tells you
   <em>which sound broke</em> rather than only that the word was wrong — because
   the second is something you already knew.</p>
<p><a class="cta" href="../index.html">Open Lunosia →</a></p>
<p><a href="index.html">← All guides</a></p>`;

write('guides/pronunciation.html', shell({
  title: 'Spanish pronunciation for English speakers — ten sounds that matter',
  description: 'The ten Spanish sounds English speakers get wrong by reflex: what your mouth does instead, what it should do, and the minimal pairs that prove it.',
  path: 'guides/pronunciation.html', current: 'guides/', depth: 1, body: soundsBody
}));

/* The hub. */
const cards = GUIDES.map(g =>
  `  <a href="${g.slug}.html"><b>${esc(g.title)}</b><span>${esc(g.blurb)}</span></a>`)
  .concat([`  <a href="pronunciation.html"><b>Pronunciation: ten sounds that matter</b><span>What your mouth does instead of a rolled r, a Spanish j, an ñ — and how to fix each one.</span></a>`])
  .join('\n');

write('guides/index.html', shell({
  title: 'Spanish grammar guides for English speakers',
  description: 'The twenty points where Spanish and English disagree hard enough that an English speaker gets it wrong by default — explained, with minimal pairs and practice.',
  path: 'guides/index.html', current: 'guides/', depth: 1,
  body: `<h1>Spanish for English speakers</h1>
<p class="lede">The points where Spanish and English disagree hard enough that
   you get them wrong by default — and being told once saves a hundred small
   failures.</p>
<p>These are not a course in Spanish grammar, which is a book. They are the
   specific places where your English is actively working against you: where
   translating what you would say in English produces a sentence that is wrong,
   or worse, produces one that is right but means something else.</p>
<p>Every rule here comes with minimal pairs — the same words, the distinction
   visible — because a rule you cannot hear the effect of is a rule you will
   forget. All of it is drilled in the app, free and without an account.</p>

<div class="cards">
${cards}
</div>

<h2>How to use these</h2>
<p>Read one. Not all of them — one, the one covering the mistake you know you
   make. Then go and produce twenty sentences that use it, out loud, and get
   them corrected. Reading a rule and being able to apply it under time pressure
   are separated by exactly that work, and nothing else substitutes for it.</p>
<p>That is what the app is for: it holds a conversation with you, corrects what
   you say, names the rule you broke, and schedules the sentence to come back
   days later so you have to produce the fix from memory.</p>
<p><a class="cta" href="../index.html">Open Lunosia →</a></p>`
}));

/* ── the written pages ───────────────────────────────────────
 * Bodies live here rather than as loose .html files so that every page on the
 * site gets the same header, footer, canonical and icons from one place. A
 * hand-maintained page drifts: it keeps the nav it had on the day it was
 * written, and a visitor who lands on it finds a smaller site than the one
 * that exists. */
const PAGES = [
  { slug: 'about', current: 'about.html',
    title: 'About Lunosia — a free Spanish speaking trainer',
    description: 'Lunosia is a free Spanish conversation trainer. Speak out loud, get corrected by a grammar engine that names the rule, and have your mistakes come back until they stick. No account, no subscription, works offline.',
    body: `<h1>Lunosia</h1>
  <p class="lede">A free Spanish speaking trainer that corrects you and tells you
     which rule you broke. No account, no subscription, and it keeps working with
     the aeroplane mode on.</p>

  <a class="cta" href="index.html">Open Lunosia →</a>

  <h2>What it is for</h2>
  <p>Most people who study Spanish for a year still cannot hold a conversation.
     The reason is not vocabulary and it is not grammar — it is that reading and
     tapping multiple-choice answers never involves producing a sentence under
     time pressure, and speaking is the only thing that teaches you to speak.</p>
  <p>Lunosia is built around that one idea. You have a conversation, out loud,
     with a partner who stays in character and asks you things. When you get
     something wrong it tells you what to say instead and names the rule, and
     then that sentence comes back days later and you have to produce the fix
     from memory.</p>

  <h2>The six things it teaches</h2>

  <h3>Speaking</h3>
  <p>Twenty-three scenarios — ordering coffee, a doctor's appointment, a job
     interview, an argument. Your turn ends after a real silence rather than at
     the first pause, so you can stop mid-sentence to think without having half
     a thought submitted for you.</p>

  <h3>Listening</h3>
  <p>The same twelve short stories the reader uses, with the text hidden. Play a
     line, decide whether you caught it, then look. A speed control, because
     natural speed is the wall and the way over it is meeting the same sentence
     slow, then slower-than-natural, then at speed.</p>

  <h3>Reading</h3>
  <p>Twelve graded short stories, A1 to B1 — a dog nobody claims, a false friend
     in a pharmacy, forty minutes in a silent taxi. Every word is one tap from
     its meaning: not a translation of the sentence, which just means reading
     the English, but the word you are stuck on, its dictionary form, and what
     the ending is doing. <em>tiene — to have — from tener, present, él/ella.</em></p>

  <h3>Writing</h3>
  <p>Twenty-four tasks, each built around one thing an English speaker has to
     get right and would rather avoid, with the prompt chosen so the answer
     cannot dodge it. Everything you write goes through the grammar checker, and
     every mistake it catches is scheduled for review.</p>

  <h3>Pronunciation</h3>
  <p>Ten sounds an English mouth does something else with by reflex. The drill
     tells you <em>which sound broke</em> — your rolled r came out as a single
     tap — rather than just that the word was wrong, because the second is
     something you already knew.</p>

  <h3>Grammar</h3>
  <p>Twenty lessons on the things English pulls you away from: ser against
     estar, gustar running backwards, the preterite against the imperfect, the
     personal <em>a</em>. Each one leads with the rule in a sentence, says why
     English speakers get it wrong, and ends in a drill.</p>

  <h2>How the corrections work</h2>
  <p>The grammar checker is a rules engine, not a language model. It knows the
     gender of eighteen thousand nouns and the person of any verb form, so where
     it speaks it is not guessing — and it can say which rule it applied, which
     is what turns a correction into a lesson.</p>
  <p>It is measured at zero false positives across more than eight hundred
     sentences of known-good Spanish, because a learner told their correct
     sentence was wrong learns something false and stops trusting the tool. It
     also gets a veto over the conversation partner: if the model proposes a
     "correction" that makes a sentence worse, the rules throw it out.</p>

  <h2>What it costs</h2>
  <p>Nothing, and there is no paid tier to upgrade to. The dictionary is built
     from open data, the grammar and pronunciation engines run in your browser,
     and the conversation partner runs on free infrastructure. There is nothing
     to subscribe to because there is nothing that costs money to run.</p>

  <h2>What it does with your data</h2>
  <p>Everything it knows about you lives in your own browser. There is no
     account, no server-side profile, and no copy held anywhere else — which is
     also why there is nothing to leak. The one thing that leaves your device is
     your side of a conversation, when the hosted partner is selected, and the
     <a href="privacy.html">privacy page</a> says exactly what goes where.</p>

  <h2>Where it works</h2>
  <p>Any current browser. It installs to a phone's home screen and runs
     full-screen and offline after the first visit. Speaking needs Chrome, Edge,
     Safari or Samsung Internet — Firefox has never implemented speech
     recognition — and in Firefox you can type your side of the conversation
     instead, with everything else unchanged.</p>

  <a class="cta" href="index.html">Open Lunosia →</a>` },
  { slug: 'privacy', current: '',
    title: 'Privacy — Lunosia',
    description: 'What Lunosia stores, where it stores it, and the one thing that leaves your device.',
    body: `<h1>Privacy</h1>
  <p class="updated">Last updated 14 September 2026. This describes what the app
     actually does; check it still matches what you are running before publishing it.</p>

  <h2>The short version</h2>
  <p>Everything Lunosia knows about you — your progress, your words, your mistakes —
     is stored in your own browser and is never sent anywhere. There is no account
     and no server-side copy of any of it.</p>
  <p>The one thing that does leave your device is the conversation itself. On this
     site the conversation partner runs on Cloudflare's Workers AI, so what you say
     to it is sent there to be answered. That is the default here, because it is the
     only partner that works on a phone. You can switch it off in Settings — the
     built-in partner runs entirely in the page. Both are described under
     <a href="#partner">The conversation partner</a> below.</p>

  <h2>What is stored, and where</h2>
  <p>Lunosia keeps all of this in your browser's <code>localStorage</code>, on the
     device you are using. There is no account, no server-side profile, and no
     copy held anywhere else:</p>
  <ul>
    <li>the name and level you entered</li>
    <li>your progress: XP, streak, which of the 60 days you have done</li>
    <li>your vocabulary deck and its review schedule, including words you added yourself</li>
    <li>your mistake journal — corrections you have been given</li>
    <li>which reading passages you have read and which listening clips you have heard</li>
    <li>your writing tasks and the drafts you wrote for them</li>
    <li>your pronunciation scores and which grammar lessons you have finished</li>
    <li>notes your conversation partner wrote about you, so it remembers you between sessions</li>
    <li>your settings, including any API key you enter</li>
  </ul>
  <p>Clearing your browser's site data for this domain erases all of it
     permanently. There is no backup. Settings → Export writes it to a file you
     control if you want one.</p>

  <h2>Speech</h2>
  <p><strong>Speaking:</strong> Chrome and Edge perform speech recognition on
     Google's servers, not on your device. When you use the microphone, the
     audio is sent to Google by the browser itself. This is how the Web Speech
     API works in those browsers and Lunosia cannot change it. If that is not
     acceptable to you, type instead — everything works by typing.</p>
  <p><strong>Listening:</strong> speech is generated locally where the neural
     voice is installed, and by your operating system's own voices otherwise.
     Nothing is uploaded to produce it.</p>

  <h2>The dictionary</h2>
  <p>The 31,000-word dictionary is a file served from this site and stored in your
     browser's cache. Looking a word up, working out what form it is in, and every
     number on the word bank screen happen entirely on your device. Nothing you look
     up is sent anywhere, and nobody — including whoever runs this site — can see
     which words you searched for.</p>
  <p>It is built from <a href="https://en.wiktionary.org">en.wiktionary.org</a> and
     from the OpenSubtitles frequency lists published as
     <a href="https://github.com/hermitdave/FrequencyWords">hermitdave/FrequencyWords</a>,
     both under Creative Commons Attribution-ShareAlike. The built file carries the
     same licence.</p>

  <h2 id="partner">The conversation partner</h2>
  <ul>
    <li><strong>Built-in (scripted):</strong> runs entirely in the page. Nothing leaves the device.</li>
    <li><strong>Ollama:</strong> runs on a machine you control. Nothing leaves that machine.</li>
    <li><strong>This site:</strong> <em>this one sends data off your device.</em> It is the
        default on the public site, because it is the only partner that works on a
        phone. What you type and what the microphone transcribed is sent to
        Cloudflare's Workers AI — over this site's own address, not to a third-party
        API you signed up for — along with the scenario and the recent turns of the
        conversation, and a reply comes back. Cloudflare's own privacy terms apply to
        that processing. Nothing is stored on the server: there is no account, no
        conversation history kept off your device, and no key to leak. Switch to
        Built-in or Ollama if you would rather nothing left the device at all.</li>
    <li><strong>Gemini:</strong> <em>this one sends data off your device.</em> If you
        switch it on, what you type and what the microphone transcribed is sent
        to Google to generate a reply, along with the scenario and recent turns.
        Google's own privacy policy applies to that. Your API key is stored in
        your browser and sent only to Google.</li>
  </ul>

  <h2>Advertising</h2>
  <p>Every page of this site loads Google AdSense. That script is Google's, it
     runs in your browser, and it can set cookies and read device identifiers to
     select and measure advertising — including on pages where no advert is
     shown, because the same script does the measuring.</p>
  <p>What it cannot do is see anything Lunosia knows about you. Your progress,
     your words, your mistakes and your conversations are held in your browser's
     own storage, which a script from another origin has no access to. Nothing
     on this site passes any of it to Google, and no advert is targeted using it.</p>
  <p>Google's use of advertising cookies is described in
     <a href="https://policies.google.com/technologies/ads" rel="noopener">their
     advertising policies</a>, and you can turn off personalised advertising at
     <a href="https://myadcenter.google.com" rel="noopener">My Ad Center</a>. A
     content blocker will stop the script loading at all, and nothing on this
     site breaks if you use one — the app does not check, and would still work
     offline with the network gone entirely.</p>
  <p>If you are in the EU or the UK, a consent notice appears before any
     advertising cookie is set, and your answer is respected.</p>

  <h2>Analytics</h2>
  <p>None. There is no analytics script, no telemetry and no error reporting,
     and Lunosia itself makes no request on its own beyond fetching its own
     files and, if you are using the hosted partner, sending your turn of the
     conversation. The advertising script described above is the one thing on
     these pages that talks to anyone else, and it is Google's rather than this
     site's.</p>

  <h2>Children</h2>
  <p>This is a study tool with no accounts and no social features, and it
     collects nothing that identifies anyone. The advertising described above is
     subject to Google's own policies on ad serving, including those on
     advertising to children.</p>

  <h2>Contact</h2>
  <p>Questions about this policy, or about anything the site does with your data,
     go to <a href="mailto:Canarybears@gmail.com">Canarybears@gmail.com</a>.</p>` },
  { slug: 'terms', current: '',
    title: 'Terms of use — Lunosia',
    description: 'The short version: Lunosia is free, your work stays yours, and it is a study aid rather than a guarantee.',
    body: `<h1>Terms of use</h1>
<p class="updated">Last updated 14 September 2026.</p>

<p>Lunosia is a free Spanish learning tool run by one person. These terms are
   short because the arrangement is simple: you use the site, it costs nothing,
   and neither of us owes the other anything beyond what is written here.</p>

<h2>Using it</h2>
<p>You may use Lunosia for your own learning, personal or professional, at no
   charge. There is no account to create, nothing to sign, and no licence to
   accept beyond continuing to use the site.</p>
<p>Please do not: attempt to overload or disrupt the service; use automated
   tools to send large volumes of requests to the conversation endpoint; or
   republish the site's content as your own. The dictionary is a separate case
   and is covered below.</p>

<h2>Your work stays yours</h2>
<p>Anything you type, say or write into Lunosia belongs to you. It is stored in
   your own browser and, apart from the conversation itself, never reaches any
   server — the <a href="privacy.html">privacy page</a> sets out exactly what
   goes where and why.</p>

<h2>The dictionary and the lessons</h2>
<p>The 31,000-word dictionary is built from
   <a href="https://en.wiktionary.org" rel="noopener">en.wiktionary.org</a> and
   the OpenSubtitles frequency lists published as
   <a href="https://github.com/hermitdave/FrequencyWords" rel="noopener">hermitdave/FrequencyWords</a>,
   both under Creative Commons Attribution-ShareAlike. The built file carries
   the same licence, and you may reuse it on those terms.</p>
<p>The grammar lessons, pronunciation guides, reading texts and writing tasks
   are original work and are not under that licence. You are welcome to learn
   from them, quote them with attribution, and link to them.</p>

<h2>What is not promised</h2>
<p>Lunosia is provided as it is. It is a study aid written by one person, not a
   qualified teacher, an examination board or a translation service, and it can
   be wrong. Do not rely on it for anything where being wrong matters — legal,
   medical, immigration or contractual language especially.</p>
<p>The site may be slow, may be down, and may change or disappear. Nothing here
   creates an obligation to keep it running, and because it is free there is
   nothing to refund. Export your progress from Settings if losing it would
   bother you.</p>
<p>To the extent the law allows, no liability is accepted for any loss arising
   from using the site. Where your local consumer law gives you rights that
   cannot be signed away, those rights stand regardless of this page.</p>

<h2>Speech and third parties</h2>
<p>Speech recognition is performed by your browser, which on Chrome and Edge
   means Google's servers. The conversation partner on this site runs on
   Cloudflare's Workers AI. Those companies' own terms apply to their part of
   it, and neither is under this site's control.</p>

<h2>Changes</h2>
<p>If these terms change, the date at the top changes with them. There is no
   mailing list to notify, so the date is the honest signal.</p>

<h2>Getting in touch</h2>
<p>Questions about any of this go to
   <a href="mailto:Canarybears@gmail.com">Canarybears@gmail.com</a>.</p>` },
  { slug: 'contact', current: 'contact.html',
    title: 'Contact — Lunosia',
    description: 'How to reach the person who builds and runs Lunosia, and what is most useful to write about.',
    body: `<h1>Contact</h1>
<p class="lede">One person builds and runs Lunosia. Mail reaches them directly.</p>

<p><a class="cta" href="mailto:Canarybears@gmail.com">Canarybears@gmail.com</a></p>

<h2>What is worth writing about</h2>
<p><strong>Something is wrong with the Spanish.</strong> This is the most useful
   mail to send. The grammar checker is a rules engine measured at zero false
   positives across more than eight hundred sentences of known-good Spanish, but
   eight hundred is not all of Spanish. If it corrected a sentence that was
   already right, that is a bug and it will be fixed — please include the exact
   sentence.</p>
<p><strong>Something is broken.</strong> A screen that will not load, audio that
   will not play, the microphone refusing to start. Say which browser and which
   device; those two facts resolve most of it.</p>
<p><strong>A word is missing or wrong.</strong> The dictionary is built
   automatically from open data and inherits its gaps.</p>
<p><strong>Privacy.</strong> Anything about what the site stores or sends. The
   <a href="privacy.html">privacy page</a> answers most of it; if it does not,
   that is worth knowing too.</p>

<h2>What to expect</h2>
<p>A reply usually within a few days. This is not a company and there is no
   support desk — but every message is read, and a report of Spanish that was
   marked wrong when it was right goes to the front of the queue.</p>

<h2>Before you write</h2>
<p>The <a href="about.html">about page</a> covers what Lunosia is and which
   browsers it works in — including why speaking needs Chrome, Edge or Safari,
   and what to do in Firefox. The <a href="guides/index.html">guides</a> may
   already answer a question about the language itself.</p>` }
];

PAGES.forEach(p => write(p.slug + '.html', shell({
  title: p.title, description: p.description, path: p.slug + '.html',
  current: p.current, depth: 0, body: p.body
})));

/* ── the sitemap ─────────────────────────────────────────────
 * Generated from what was actually written, because a hand-kept sitemap lists
 * a page that was renamed six months ago and misses the four added since. A
 * crawler treats both as a sign of a site nobody is minding. */
const URLS = [{ loc: SITE, freq: 'weekly', pri: '1.0' }]
  .concat(out.map(o => ({
    loc: SITE + o.rel.replace(/(^|\/)index\.html$/, '$1'),
    freq: /^guides\//.test(o.rel) ? 'monthly' : (o.rel === 'privacy.html' || o.rel === 'terms.html' ? 'yearly' : 'monthly'),
    pri: o.rel === 'guides/index.html' ? '0.9'
       : /^guides\//.test(o.rel) ? '0.8'
       : o.rel === 'about.html' ? '0.8' : '0.4'
  })));

fs.writeFileSync(path.join(OUT, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  URLS.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`).join('\n') +
  '\n</urlset>\n');

if (process.env.LUNOSIA_QUIET) process.exit(0);

console.log('Wrote ' + out.length + ' pages:');
out.forEach(o => console.log('  ' + o.rel.padEnd(36) + o.words + ' words'));
console.log('  ' + out.reduce((n, o) => n + o.words, 0) + ' words total');
console.log('sitemap.xml: ' + URLS.length + ' URLs');
