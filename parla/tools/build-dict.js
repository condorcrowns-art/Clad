/* Build js/data/dict-es.json from open data.
 *
 * The app shipped with 521 hand-written words. That is a phrasebook, not a
 * vocabulary, and "any word I throw at it" is not something a phrasebook can
 * do. This turns four freely-licensed datasets into a real dictionary:
 *
 *   wikt-es-en.txt  en.wiktionary's Spanish->English glosses, exported by
 *                   Matthias Buchmeier (CC BY-SA 3.0 / GFDL). Headword, part
 *                   of speech, gender, register labels, human-written glosses.
 *   wikt-en-es.txt  the same export in the other direction. Used to tell which
 *                   of a word's six glosses is the one it actually means: a
 *                   gloss that translates back to the word you started from is
 *                   its core sense, and the others are the long tail.
 *   freq-es.txt     hermitdave/FrequencyWords over OpenSubtitles 2018
 *                   (CC BY-SA 4.0). This is what makes the result a
 *                   *curriculum* rather than a word list - it says which words
 *                   a learner meets first, and it decides what gets shipped.
 *   freq-en.txt     the same for English, which ranks glosses: given "to have,
 *                   possess an object" and "to be of a measure or age", the
 *                   one containing the commoner English word is the one a
 *                   beginner wants on the back of the card.
 *
 * Run:  node tools/build-dict.js              downloads to tools/cache/ if empty
 *       node tools/build-dict.js --offline    fails rather than reaching the network
 *
 * The output is committed, so the app never touches any of this at runtime and
 * nobody has to run this to use Parla.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CACHE = path.join(__dirname, 'cache');
const OUT = path.join(ROOT, 'js', 'data', 'dict-es.json');

const SOURCES = {
  'wikt-es-en.txt': 'https://raw.githubusercontent.com/open-dsl-dict/wiktionary-dict/master/src/es-en-enwiktionary.txt',
  'wikt-en-es.txt': 'https://raw.githubusercontent.com/open-dsl-dict/wiktionary-dict/master/src/en-es-enwiktionary.txt',
  'freq-es.txt':    'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/es/es_50k.txt',
  'freq-en.txt':    'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt'
};

/* A phrase is only as common as its rarest word, and past this point the words
 * in it are ones a learner has not met, so the phrase is noise to them. */
const PHRASE_CEILING = 9000;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); return resolve(get(res.headers.location));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(url + ' -> ' + res.statusCode)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

async function source(name) {
  const file = path.join(CACHE, name);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
  if (process.argv.includes('--offline')) throw new Error('missing ' + file + ' and --offline was given');
  process.stderr.write('fetching ' + name + '\n');
  const text = await get(SOURCES[name]);
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

function fold(w) {
  return String(w || '').toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Parts of speech, collapsed to the handful a learner acts on differently. A
 * transitive verb and an intransitive one conjugate identically; what matters
 * to someone studying is that it is a verb. */
const POS = {
  m: 'n', f: 'n', mf: 'n', fp: 'n', mp: 'n', n: 'n', 'm pl': 'n', 'f pl': 'n', 'mf pl': 'n',
  v: 'v', vt: 'v', vi: 'v', vr: 'v', vp: 'v', vtr: 'v', vit: 'v', 'v impers': 'v',
  adj: 'adj', adv: 'adv', pron: 'pron', prep: 'prep', conj: 'conj',
  interj: 'interj', num: 'num', 'cardinal num': 'num', 'ordinal num': 'num',
  phrase: 'phrase', proverb: 'phrase', prop: 'prop',
  abbr: 'abbr', initialism: 'abbr', acronym: 'abbr'
};
const POS_ORDER = ['n', 'v', 'adj', 'adv', 'pron', 'prep', 'conj', 'num', 'interj', 'phrase', 'prop', 'abbr'];
const GENDER = { m: 'm', f: 'f', mf: 'mf', mp: 'm', fp: 'f', 'm pl': 'm', 'f pl': 'f' };

/* Labels worth keeping, because using the wrong register is a mistake learners
 * actually make. The other few thousand topic tags are dropped. */
const REGISTER = {
  vulgar: 'vulgar', offensive: 'vulgar', derogatory: 'rude', pejorative: 'rude',
  slang: 'slang', colloquial: 'informal', informal: 'informal', familiar: 'informal',
  formal: 'formal', literary: 'literary', poetic: 'literary',
  rare: 'rare', childish: 'informal', euphemistic: 'euphemism', humorous: 'humorous'
};
const REGIONS = {
  spain: 'Spain', mexico: 'Mexico', argentina: 'Argentina', chile: 'Chile',
  colombia: 'Colombia', peru: 'Peru', venezuela: 'Venezuela', cuba: 'Cuba',
  'puerto rico': 'Puerto Rico', uruguay: 'Uruguay', bolivia: 'Bolivia',
  ecuador: 'Ecuador', guatemala: 'Guatemala', honduras: 'Honduras',
  paraguay: 'Paraguay', nicaragua: 'Nicaragua', 'costa rica': 'Costa Rica',
  panama: 'Panama', 'el salvador': 'El Salvador', 'dominican republic': 'Dominican Republic',
  'latin america': 'Latin America', 'south america': 'Latin America',
  'central america': 'Latin America', 'canary islands': 'Spain', andalusia: 'Spain',
  'rio de la plata': 'Argentina'
};

/* Glosses that describe an inflected form rather than defining a word. Those
 * are the morphology engine's job; shipping them would mean a flashcard whose
 * back reads "feminine plural of X". */
const FORM_OF = /\b(spelling of|form of|plural of|feminine of|masculine of|participle of|inflection of|compound of|alternative (form|spelling)|misspelling|eye dialect|apocopic|obsolete)\b/i;

function cleanGloss(g) {
  let s = g.trim()
    .replace(/\s*\{\{[^}]*\}\}/g, '')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/''+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[;,]\s*$/, '')
    .trim();
  if (/^\(.*\)$/.test(s)) s = s.slice(1, -1).trim();
  // "A cart", "To hold" - Wiktionary sentence-cases a lot of glosses. On the
  // back of a flashcard next to three lowercase ones it just looks broken.
  const w0 = s.split(/\s/)[0];
  if (w0 && w0 !== 'I' && !(w0.length > 1 && w0 === w0.toUpperCase())) {
    s = s[0].toLowerCase() + s.slice(1);
  }
  return s;
}

/* The part of a gloss that is the translation, with the explanation stripped:
 * "to crush, overcome (a person)" -> "to crush". This is what gets matched
 * against the English side and the English frequency list. */
function core(gloss) {
  let s = gloss.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.split(/[;|]/)[0].split(',')[0].trim();
  return s.toLowerCase().replace(/^(to|a|an|the)\s+/, '').trim();
}

const STOP_EN = new Set(['of', 'the', 'a', 'an', 'to', 'in', 'on', 'at', 'or', 'and',
  'for', 'by', 'with', 'be', 'is', 'as', 'that', 'it', 'from', 'one', 'used', 'form']);

async function main() {
  const [wikt, back, freqEsRaw, freqEnRaw] = await Promise.all(
    ['wikt-es-en.txt', 'wikt-en-es.txt', 'freq-es.txt', 'freq-en.txt'].map(source));

  /* — frequency — */
  const rankEs = new Map(), rankEn = new Map(), rankEsFolded = new Map();
  freqEsRaw.split('\n').forEach((l, i) => {
    const w = l.split(' ')[0];
    if (!w) return;
    if (!rankEs.has(w)) rankEs.set(w, i + 1);
    // A folded fallback for words the list spells with accents and Wiktionary
    // does not - but never the other way round, or "una" lends its rank to
    // "una" the fingernail and a beginner's first page fills with junk.
    const f = fold(w);
    if (f && !rankEsFolded.has(f)) rankEsFolded.set(f, i + 1);
  });
  freqEnRaw.split('\n').forEach((l, i) => { const w = l.split(' ')[0]; if (w && !rankEn.has(w)) rankEn.set(w, i + 1); });

  const esRank = (w) => rankEs.get(w) || rankEsFolded.get(fold(w)) || 0;

  /* — the reverse direction: which English words translate to this Spanish one — */
  const roundTrip = new Map();   // "tener" -> Set("have", "hold", ...)
  const BACK = /^(.+?)\s+\{([^}]*)\}[^:]*::\s*(.+)$/;
  for (const line of back.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = BACK.exec(line);
    if (!m) continue;
    const en = m[1].trim().toLowerCase();
    if (en.includes(' ')) continue;
    for (const chunk of m[3].split(',')) {
      const es = chunk.replace(/\{[^}]*\}/g, '').replace(/\([^)]*\)/g, '').trim().toLowerCase();
      if (!es || es.length > 30) continue;
      if (!roundTrip.has(es)) roundTrip.set(es, new Set());
      roundTrip.get(es).add(en);
    }
  }

  /* — the Spanish side — */
  const LINE = /^(.+?)\s+\{([^}]*)\}\s*(?:\[([^\]]*)\])?\s*::\s*(.*)$/;
  const entries = new Map();
  let glossLines = 0, formLines = 0;

  for (const line of wikt.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const m = LINE.exec(line);
    if (!m) continue;

    const term = m[1].trim();
    const rawPos = m[2].trim().toLowerCase();
    const labels = (m[3] || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const gloss = cleanGloss(m[4] || '');

    if (!gloss) { formLines++; continue; }
    if (FORM_OF.test(gloss)) { formLines++; continue; }
    if (labels.some(l => l === 'obsolete' || l === 'archaic' || l === 'dated' || l === 'historical')) continue;
    if (/[^\p{L}\p{M}'’\- ]/u.test(term) || term.length > 34) continue;
    const pos = POS[rawPos];
    if (!pos) continue;
    // "TU", "DE": scanned-subtitle shouting, not headwords.
    if (term.length <= 4 && term === term.toUpperCase() && /\p{L}/u.test(term)) continue;
    glossLines++;

    const key = term.toLowerCase();
    let e = entries.get(key);
    if (!e) { e = { term: term, senses: [], posCount: {} }; entries.set(key, e); }
    // A sense that translates back to this word is worth more than three that
    // do not. Without this, "perro" is an adjective, because the source files
    // "perro :: dog" as feminine and lists three senses of "perro" = awful.
    const rt = roundTrip.get(key);
    const weight = rt && rt.has(core(gloss)) ? 4 : 1;
    e.posCount[pos] = (e.posCount[pos] || 0) + weight;

    let reg = null, region = null;
    for (const l of labels) {
      if (REGISTER[l] && !reg) reg = REGISTER[l];
      if (REGIONS[l] && !region) region = REGIONS[l];
    }
    e.senses.push({ pos: pos, gloss: gloss, gender: GENDER[rawPos] || null, reg: reg, region: region });
  }

  /* — settle each headword — */
  const list = [];
  for (const e of entries.values()) {
    const key = e.term.toLowerCase();

    // The part of speech with the most senses wins; a word that is both a noun
    // and an adjective is learned as whichever it usually is.
    const pos = Object.keys(e.posCount).sort((a, b) =>
      e.posCount[b] - e.posCount[a] || POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b))[0];
    const senses = e.senses.filter(s => s.pos === pos);

    const backSet = roundTrip.get(key) || new Set();
    for (const s of senses) {
      const c = core(s.gloss);
      const words = c.split(/\s+/).filter(w => w && !STOP_EN.has(w));
      // How common is the commonest English word in this gloss? A gloss made
      // of words nobody uses is a gloss for a sense nobody means.
      let best = 99999;
      for (const w of words) best = Math.min(best, rankEn.get(w) || 60000);
      s.score = best
        + (backSet.has(c) ? -40000 : 0)                       // it translates back: this is the sense
        + (words.some(w => backSet.has(w)) ? -12000 : 0)
        + (pos === 'v' && /^to\s/i.test(s.gloss) ? -3000 : 0) // verbs read as verbs
        + Math.min(s.gloss.length, 120) * 12
        + (/[;(]/.test(s.gloss) ? 2500 : 0)                   // an elaboration, not a translation
        + (/^[A-Z]/.test(s.gloss) && pos !== 'prop' ? 1200 : 0);
    }
    senses.sort((a, b) => a.score - b.score);

    const glosses = [];
    for (const s of senses) { if (glosses.length < 3 && !glosses.includes(s.gloss)) glosses.push(s.gloss); }
    if (!glosses.length) continue;

    // Register and region describe the *primary* sense. Letting any sense set
    // them is how "agua" ends up labelled Guatemalan slang.
    const primary = senses[0];
    // Take the tag only when every sense agrees. "perro" is filed as both
    // masculine and feminine by the source, and a disagreement is the source
    // telling you it does not know.
    var tags = senses.map(s => s.gender).filter(Boolean);
    var unanimous = tags.length && tags.every(g => g === tags[0]) ? tags[0] : null;

    list.push({
      term: e.term, pos: pos, glosses: glosses,
      gender: unanimous, reg: primary.reg, region: primary.region
    });
  }

  /* — gender: the source files "perro" as feminine, so the endings win where
   * they are reliable and the tag only fills the gaps — */
  // "el hambre" takes a masculine article only because it starts with a
  // stressed a-; the noun is feminine, and "mucho hambre" is the mistake that
  // follows from getting this wrong.
  const FEM_EXC = new Set(['mano', 'foto', 'moto', 'radio', 'libido', 'nao', 'disco', 'polio',
    'hambre', 'sangre', 'liebre', 'fiebre', 'nieve', 'llave', 'carne', 'gente', 'suerte',
    'muerte', 'noche', 'tarde', 'clase', 'frase', 'base', 'calle', 'leche', 'parte', 'fuente',
    'corriente', 'serpiente', 'mente', 'imagen', 'orden', 'sal', 'piel', 'miel', 'senal',
    'catedral', 'labor', 'flor', 'coliflor', 'sor', 'razon', 'sazon']);
  const MASC_EXC = new Set(['dia', 'mapa', 'problema', 'sistema', 'tema', 'programa',
    'idioma', 'clima', 'planeta', 'sofa', 'tranvia', 'poeta', 'cura', 'papa', 'drama',
    'poema', 'esquema', 'dilema', 'sintoma', 'aroma', 'diploma', 'panorama', 'fantasma',
    'karma', 'enigma', 'trauma', 'lema', 'cometa', 'guardia', 'espia', 'atleta', 'pijama']);
  for (const e of list) {
    if (e.pos !== 'n') { e.gender = null; continue; }
    const f = fold(e.term);
    if (f.includes(' ')) continue;
    if (MASC_EXC.has(f)) { e.gender = 'm'; continue; }
    if (FEM_EXC.has(f)) { e.gender = 'f'; continue; }
    if (/(cion|sion|dad|tad|tud|umbre|eza|icie)$/.test(f)) { e.gender = 'f'; continue; }
    if (/(aje|ambre|ma)$/.test(f)) { e.gender = 'm'; continue; }
    if (/or$/.test(f) && !/(flor|labor|coliflor)$/.test(f)) { e.gender = 'm'; continue; }
    if (/o$/.test(f)) { e.gender = 'm'; continue; }
    if (/a$/.test(f)) { e.gender = 'f'; continue; }
    // Nouns in -z are feminine, with a short list of stubborn exceptions.
    if (/z$/.test(f)) {
      e.gender = /(pez|arroz|lapiz|maiz|ajedrez|antifaz|altavoz|barniz|matiz|disfraz|cariz)$/.test(f)
        ? 'm' : 'f';
      continue;
    }
    // Otherwise the tag stands, but only because every sense agreed on it.
    if (e.gender === 'm' || e.gender === 'f') continue;
    // No ending rule applies and the source tag cannot be trusted on its own -
    // it files "güey" as feminine and "perro" as a feminine noun meaning dog.
    // Better to print no article than the wrong one.
    e.gender = null;
  }

  /* — rank —
   * Two jobs pull in opposite directions here. Studying wants the commonest
   * words first and nothing else. Looking a word up wants *everything*, because
   * the word you did not recognise is by definition not a common one.
   *
   * So ship both: a frequency-ordered head, then the whole rest of the
   * dictionary behind it. `ranked` in the output says where the head ends, and
   * only the head is used for study bands - the tail exists so that a word you
   * heard on the street has an answer.
   *
   * A single word is ranked by how often Spanish speakers say it. A phrase is
   * ranked by its *rarest* word, because that is the one that stopped you
   * understanding it, plus a nudge so single words fill the early bands. */
  const kept = [];
  for (const e of list) {
    const parts = e.term.toLowerCase().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    if (parts.length === 1) {
      e.rank = esRank(parts[0]);
    } else {
      let worst = 0, missing = false;
      for (const p of parts) {
        const r = esRank(p);
        if (!r) { missing = true; break; }
        worst = Math.max(worst, r);
      }
      // A phrase made of words you have not met is not a phrase you can use.
      if (missing || worst > PHRASE_CEILING) continue;
      // You cannot use a phrase before you know the words in it, so a phrase
      // sits behind the single words of the same rarity rather than beside
      // them - otherwise the first page of the dictionary is "a eso de".
      e.rank = Math.round(worst * 2) + 400;
    }
    kept.push(e);
  }
  kept.sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank || a.term.localeCompare(b.term, 'es');
    if (a.rank) return -1;
    if (b.rank) return 1;
    return a.term.localeCompare(b.term, 'es');
  });


  /* — the curated list wins where it exists —
   * 521 words were written by hand with exactly the gloss a beginner wants.
   * Wiktionary is broader; it is not better on those. */
  const vocabSrc = fs.readFileSync(path.join(ROOT, 'js', 'data', 'vocab-es.js'), 'utf8');
  const curated = new Map();
  for (const m of vocabSrc.matchAll(/\[\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"/g)) {
    const es = m[1].replace(/\\"/g, '"'), en = m[2].replace(/\\"/g, '"');
    if (es && en) curated.set(es.toLowerCase(), en);
  }
  /* The commonest words in the language are the ones a dictionary built from
   * Wiktionary handles worst: it will tell you "una" is "an indefinite plural
   * pronoun using a singular feminine item" and leave a beginner none the
   * wiser. These are the first hundred words anyone meets, so they are worth
   * writing by hand. */
  const FUNCTION_POS = {
    del: 'prep', al: 'prep', hay: 'v', ti: 'pron', conmigo: 'pron', contigo: 'pron',
    esto: 'pron', eso: 'pron', esta: 'pron', estas: 'pron', estos: 'pron',
    esos: 'pron', esas: 'pron', mis: 'pron', tus: 'pron', sus: 'pron',
    gran: 'adj', buen: 'adj', primer: 'adj', 'algún': 'adj', 'ningún': 'adj',
    cualquier: 'adj', oye: 'interj', venga: 'interj', anda: 'interj',
    'ojalá': 'interj', sino: 'conj', peor: 'adj', mejor: 'adj', mayor: 'adj',
    menor: 'adj', vos: 'pron', che: 'interj', 'demás': 'adj', ambos: 'adj',
    varios: 'adj', cierto: 'adj', propio: 'adj', ajeno: 'adj', maldito: 'adj'
  };

  const FUNCTION_WORDS = {
    'el': ['the (masculine)'], 'la': ['the (feminine)'], 'los': ['the (masculine plural)'],
    'las': ['the (feminine plural)'], 'un': ['a, an (masculine)'], 'una': ['a, an (feminine)'],
    'unos': ['some (masculine)'], 'unas': ['some (feminine)'],
    'de': ['of, from'], 'a': ['to, at'], 'en': ['in, on, at'], 'con': ['with'],
    'sin': ['without'], 'por': ['by, through, because of'], 'para': ['for, in order to'],
    'sobre': ['on, about'], 'entre': ['between, among'], 'hasta': ['until, up to'],
    'desde': ['from, since'], 'hacia': ['towards'], 'segun': ['according to'],
    'y': ['and'], 'o': ['or'], 'pero': ['but'], 'porque': ['because'],
    'que': ['that, which, than'], 'si': ['if'], 'sí': ['yes'], 'no': ['no, not'],
    'como': ['like, as'], 'cuando': ['when'], 'donde': ['where'], 'mientras': ['while'],
    'aunque': ['although'], 'ni': ['nor, not even'], 'pues': ['well, then, since'],
    'yo': ['I'], 'tú': ['you (informal)'], 'usted': ['you (formal)'],
    'él': ['he, him'], 'ella': ['she, her'], 'nosotros': ['we, us'],
    'vosotros': ['you all (Spain)'], 'ellos': ['they, them'], 'ellas': ['they, them (feminine)'],
    'ustedes': ['you all'], 'me': ['me, myself'], 'te': ['you, yourself'],
    'se': ['himself, herself, itself, themselves'], 'nos': ['us, ourselves'],
    'lo': ['it, him (object)'], 'le': ['to him, to her, to you'], 'les': ['to them, to you all'],
    'mi': ['my'], 'tu': ['your'], 'su': ['his, her, your, their'],
    'nuestro': ['our'], 'mío': ['mine'], 'tuyo': ['yours'], 'suyo': ['his, hers, theirs'],
    'este': ['this'], 'esta': ['this (feminine)'], 'ese': ['that'], 'esa': ['that (feminine)'],
    'aquel': ['that one over there'], 'esto': ['this (thing)'], 'eso': ['that (thing)'],
    'qué': ['what'], 'quién': ['who'], 'cuál': ['which'], 'cómo': ['how'],
    'cuándo': ['when'], 'dónde': ['where'], 'cuánto': ['how much'], 'por qué': ['why'],
    'muy': ['very'], 'más': ['more, most'], 'menos': ['less, fewer'],
    'también': ['also, too'], 'tampoco': ['neither, not either'],
    'ya': ['already, now'], 'todavía': ['still, yet'], 'aún': ['still, even'],
    'siempre': ['always'], 'nunca': ['never'], 'ahora': ['now'], 'luego': ['later, then'],
    'aquí': ['here'], 'allí': ['there'], 'ahí': ['there'], 'bien': ['well'], 'mal': ['badly'],
    'todo': ['all, everything'], 'nada': ['nothing'], 'algo': ['something'],
    'alguien': ['someone'], 'nadie': ['nobody'], 'cada': ['each, every'],
    'otro': ['other, another'], 'mismo': ['same, self'], 'tanto': ['so much'],
    'poco': ['little, few'], 'mucho': ['a lot, much'], 'demasiado': ['too much'],
    'bastante': ['enough, quite'], 'casi': ['almost'], 'solo': ['only, alone'],
    'sólo': ['only'], 'incluso': ['even, including'], 'quizá': ['maybe'],
    'quizás': ['maybe'], 'tal vez': ['maybe'], 'claro': ['of course, clear'],
    'vale': ['okay (Spain)'], 'entonces': ['then, so'], 'así': ['like this, so'],
    'del': ['of the, from the'], 'al': ['to the'], 'hay': ['there is, there are'],
    'esto': ['this (thing)'], 'esta': ['this (feminine)'], 'estas': ['these (feminine)'],
    'estos': ['these'], 'esos': ['those'], 'esas': ['those (feminine)'],
    'aquella': ['that one over there (feminine)'], 'aquellos': ['those over there'],
    'ti': ['you (after a preposition)'], 'conmigo': ['with me'], 'contigo': ['with you'],
    'mis': ['my (plural)'], 'tus': ['your (plural)'], 'sus': ['his, her, your, their (plural)'],
    'nuestra': ['our (feminine)'], 'nuestros': ['our (plural)'], 'vuestro': ['your (Spain, plural)'],
    'gran': ['great, big (before a noun)'], 'buen': ['good (before a masculine noun)'],
    'mal': ['bad (before a masculine noun); badly'], 'primer': ['first (before a masculine noun)'],
    'algún': ['some (before a masculine noun)'], 'alguna': ['some (feminine)'],
    'algunos': ['some (plural)'], 'algunas': ['some (feminine plural)'],
    'cualquier': ['any, whichever'], 'ningún': ['no, not any (before a masculine noun)'],
    'ninguno': ['none, not one'], 'ninguna': ['none (feminine)'],
    'mucha': ['a lot of (feminine)'], 'muchos': ['many'], 'muchas': ['many (feminine)'],
    'poca': ['little (feminine)'], 'pocos': ['few'], 'pocas': ['few (feminine)'],
    'otra': ['another (feminine)'], 'otros': ['others'], 'otras': ['others (feminine)'],
    'misma': ['same (feminine)'], 'mismos': ['same (plural)'],
    'toda': ['all (feminine)'], 'todos': ['everyone, all'], 'todas': ['all (feminine plural)'],
    'tanta': ['so much (feminine)'], 'tantos': ['so many'],
    'cuánta': ['how much (feminine)'], 'cuántos': ['how many'],
    'cuánto': ['how much'], 'quiénes': ['who (plural)'], 'cuáles': ['which (plural)'],
    'nadie': ['nobody'], 'jamás': ['never, ever'], 'apenas': ['barely, hardly'],
    'acá': ['here'], 'allá': ['over there'], 'afuera': ['outside'], 'adentro': ['inside'],
    'encima': ['on top'], 'debajo': ['underneath'], 'delante': ['in front'],
    'detrás': ['behind'], 'cerca': ['near'], 'lejos': ['far'], 'dentro': ['inside'],
    'fuera': ['outside'], 'arriba': ['up, above'], 'abajo': ['down, below'],
    'antes': ['before'], 'después': ['after'], 'durante': ['during'],
    'mientras tanto': ['meanwhile'], 'sino': ['but rather'], 'aunque no': ['even if not'],
    'ojalá': ['I hope, hopefully (takes the subjunctive)'],
    'oye': ['hey, listen'], 'venga': ['come on (Spain)'], 'anda': ['go on, come on'],
    'peor': ['worse, worst'], 'mejor': ['better, best'], 'mayor': ['bigger, older, main'],
    'menor': ['smaller, younger, minor'], 'vos': ['you (Argentina, Uruguay, Central America)'],
    'che': ['hey (Argentina)'], 'maldito': ['damned, cursed'], 'demás': ['the rest, the others'],
    'ambos': ['both'], 'varios': ['several'], 'cierto': ['certain, true'],
    'propio': ['own, one\'s own'], 'ajeno': ['belonging to someone else']
  };
  for (const [w, gl] of Object.entries(FUNCTION_WORDS)) curated.set(w, gl[0]);

  let overridden = 0, added = 0;
  const index = new Map(kept.map(e => [e.term.toLowerCase(), e]));
  for (const [es, en] of curated) {
    const e = index.get(es) || index.get(es.replace(/^(el|la|los|las)\s+/, ''));
    if (e) {
      if (e.glosses[0] !== en) {
        e.glosses = [en].concat(e.glosses.filter(g => g !== en)).slice(0, 3);
        overridden++;
      }
      e.curated = 1;
      continue;
    }
    // Wiktionary simply has no entry for "del", "hay", "gran" or "algún" - they
    // are contractions and shortened forms rather than headwords. They are also
    // among the two hundred commonest words in the language, so a dictionary
    // that shrugs at them is not a dictionary a beginner can use.
    const r = esRank(es);
    if (!r || es.includes(' ')) continue;
    const row = { term: es, pos: FUNCTION_POS[es] || 'other', glosses: [en],
                  gender: null, reg: null, region: null, rank: r, curated: 1 };
    kept.push(row); index.set(es, row); added++;
  }
  if (added) {
    kept.sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank || a.term.localeCompare(b.term, 'es');
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.term.localeCompare(b.term, 'es');
    });
  }

  const ranked = kept.filter(e => e.rank).length;

  /* Rows, not objects: at this size the repeated key names would be a third of
   * the file. [ term, pos, gender, glosses joined by " | ", register, region ] */
  const rows = kept.map(e => {
    const row = [e.term, e.pos, e.gender || '', e.glosses.join(' | ')];
    if (e.reg || e.region) row.push(e.reg || '');
    if (e.region) row.push(e.region);
    return row;
  });

  const out = {
    lang: 'es',
    built: new Date().toISOString().slice(0, 10),
    count: rows.length,
    ranked: ranked,
    fields: ['term', 'pos', 'gender', 'glosses', 'register', 'region'],
    note: 'The first `ranked` rows are ordered commonest-first and their index is ' +
          'the word\'s frequency band. The rest are everything else, alphabetical, ' +
          'so that looking up an uncommon word still has an answer.',
    sources: [
      'en.wiktionary.org Spanish-English and English-Spanish glosses, exported by Matthias Buchmeier (CC BY-SA 3.0 / GFDL)',
      'hermitdave/FrequencyWords over OpenSubtitles 2018, Spanish and English (CC BY-SA 4.0)'
    ],
    licence: 'CC BY-SA 4.0 - this file is a derivative and carries the same terms',
    rows: rows
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));

  const byPos = {};
  kept.forEach(e => { byPos[e.pos] = (byPos[e.pos] || 0) + 1; });
  console.log('glosses read   ' + glossLines + '  (' + formLines + ' inflected forms left to the morphology engine)');
  console.log('headwords      ' + entries.size + ' -> shipped ' + rows.length +
              '  (' + ranked + ' frequency-ranked, ' + (rows.length - ranked) + ' in the long tail)');
  console.log('by part        ' + Object.entries(byPos).sort((a, b) => b[1] - a[1]).map(x => x[0] + ' ' + x[1]).join('  '));
  console.log('phrases        ' + kept.filter(e => e.term.includes(' ')).length);
  console.log('with gender    ' + kept.filter(e => e.gender).length);
  console.log('register/region ' + kept.filter(e => e.reg).length + ' / ' + kept.filter(e => e.region).length);
  console.log('curated glosses kept ' + overridden + ' of ' + curated.size);
  console.log('written        ' + OUT + '  ' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
}

main().catch(e => { console.error(e.message); process.exit(1); });
