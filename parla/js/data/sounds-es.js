/* Parla — the sounds English speakers get wrong
 *
 * Not the Spanish sound system, which is small and mostly easy. These are the
 * ten places an English mouth does something else by reflex, ordered by how
 * much they cost you: an American r in place of both Spanish r's makes you hard
 * to follow; a slightly off vowel does not.
 *
 * Each one carries what an English speaker needs and a phonetics book does not
 * give them:
 *
 *   mouth    what to physically do, in words you can act on
 *   instead  what English makes you do, and why it happens
 *   pairs    two real words that differ only in this sound — the drill that
 *            proves you can hear it before you try to say it
 *   words    things to say, easiest first
 *   tell     what the recogniser tends to return when you get it wrong, which
 *            is what js/phon.js matches against to name the problem
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

PARLA.data.es.sounds = [

  { id: 'rr', symbol: 'rr', title: 'The rolled r', cost: 'high',
    letters: 'rr, and r at the start of a word',
    mouth: 'Put your tongue tip just behind your top teeth, where you say "d". ' +
           'Now push air past it and let it flutter — you are not moving the tongue, ' +
           'the air is moving it. Relax the tongue; a tense tongue cannot vibrate.',
    instead: 'English has no trill, so you reach for the American r, which is made ' +
             'with the tongue bunched at the back and never touching anything. It is ' +
             'about as far from a Spanish rr as a sound can be.',
    trick: 'Say "pot of tea" fast, over and over, in an American accent. The "t of t" ' +
           'is already a tap. Speed it up and lean on it and it becomes a trill.',
    pairs: [
      ['perro', 'dog', 'pero', 'but'],
      ['carro', 'car', 'caro', 'expensive'],
      ['parra', 'vine', 'para', 'for'],
      ['cerro', 'hill', 'cero', 'zero']
    ],
    words: ['rojo', 'ropa', 'río', 'rápido', 'perro', 'carro', 'guitarra', 'arriba', 'ferrocarril'],
    tell: 'You said a single tap, so it came out as the other word.'
  },

  { id: 'r', symbol: 'r', title: 'The single tap r', cost: 'high',
    letters: 'r between vowels, and at the end',
    mouth: 'One flick. The tongue tip touches the ridge behind your teeth once and ' +
           'leaves. It is over before you notice it.',
    instead: 'English speakers either substitute the American r — which is a different ' +
             'sound entirely — or over-roll it into a trill, which turns "caro" into ' +
             '"carro" and changes the word.',
    trick: 'It is the same sound as the tt in "butter" or the dd in "ladder" in an ' +
           'American accent. You already make it a hundred times a day.',
    pairs: [
      ['caro', 'expensive', 'carro', 'car'],
      ['pero', 'but', 'perro', 'dog'],
      ['ahora', 'now', 'ahorra', 'he saves'],
      ['coro', 'choir', 'corro', 'I run']
    ],
    words: ['para', 'pero', 'caro', 'hora', 'mira', 'quiero', 'comer', 'hablar', 'trabajar'],
    tell: 'You rolled it. One tap only, or you have said a different word.'
  },

  { id: 'j', symbol: 'j / g', title: 'The j', cost: 'high',
    letters: 'j always, and g before e or i',
    mouth: 'Back of the tongue near the roof of the mouth, and scrape. It is the ch ' +
           'in Scottish "loch" or German "Bach" — friction, not just breath.',
    instead: 'English speakers use their h, which is only breath with no friction. ' +
             '"Jamón" comes out as "hamón", which is understandable but immediately ' +
             'marks you as a beginner.',
    trick: 'Start to say "k" and then let the air keep flowing instead of releasing ' +
           'it cleanly. That leak is the sound.',
    pairs: [
      ['jamón', 'ham', 'hamón', '— not a word'],
      ['caja', 'box', 'casa', 'house'],
      ['gente', 'people', 'guente', '— not a word'],
      ['ojo', 'eye', 'oso', 'bear']
    ],
    words: ['jamón', 'hijo', 'trabajo', 'mujer', 'ojo', 'gente', 'girar', 'general', 'ejercicio'],
    tell: 'That was an English h. Spanish needs friction at the back of the mouth.'
  },

  { id: 'n-tilde', symbol: 'ñ', title: 'The ñ', cost: 'medium',
    letters: 'ñ',
    mouth: 'The whole front of your tongue flat against the roof of the mouth, and ' +
           'the sound comes down your nose. One sound, not two.',
    instead: 'English speakers say n + y, as in "canyon". Close, and understandable, ' +
             'but it is two sounds where Spanish has one, and it is audible.',
    trick: 'Say "onion" and freeze on the middle. That is nearly it — now make it a ' +
           'single movement rather than a slide.',
    pairs: [
      ['año', 'year', 'ano', 'anus'],
      ['caña', 'cane, beer', 'cana', 'grey hair'],
      ['sueño', 'dream, sleep', 'sueno', 'I sound'],
      ['niño', 'child', 'nino', '— not a word']
    ],
    words: ['año', 'niño', 'España', 'mañana', 'señor', 'pequeño', 'compañero', 'cumpleaños'],
    tell: 'That came out as a plain n — and "año" without the ñ is a word you do not want.'
  },

  { id: 'b-v', symbol: 'b = v', title: 'b and v are the same', cost: 'medium',
    letters: 'b and v, always',
    mouth: 'At the start of a word or after m or n: both lips, a normal b. Between ' +
           'vowels: bring the lips close but do not close them — the air keeps ' +
           'flowing, like a b that never quite commits.',
    instead: 'English speakers make a real v, with the top teeth on the bottom lip. ' +
             'That sound does not exist in Spanish at all. And they make a hard b ' +
             'between vowels, where a Spaniard softens it.',
    trick: 'There is nothing to learn about telling b from v, because they are the ' +
           'same sound. "Vaca" and "baca" are homophones. What is worth learning is ' +
           'the soft version between vowels.',
    pairs: [
      ['vaca', 'cow', 'baca', 'roof rack — said identically', 'same'],
      ['tubo', 'tube', 'tuvo', 'he had — said identically', 'same'],
      ['la boca', 'the mouth — the b softens between vowels', 'boca', 'mouth — a hard b to start']
    ],
    words: ['vaca', 'vino', 'bueno', 'saber', 'trabajo', 'nuevo', 'llevar', 'escribir'],
    tell: 'Spanish has no English v. Both letters are one sound, soft between vowels.'
  },

  { id: 'd', symbol: 'd', title: 'The soft d', cost: 'medium',
    letters: 'd between vowels, and at the end of a word',
    mouth: 'Tongue tip lightly on the *back of the top teeth* — further forward than ' +
           'English — and let air escape. It is the th in "this", not the d in "dog".',
    instead: 'English d is made further back, on the ridge, and is fully stopped. ' +
             'Used between vowels it makes "nada" sound clipped and foreign.',
    trick: 'Say "nada" as "na-tha", with the th of "father". That is much closer than ' +
           'anything with an English d in it.',
    pairs: [
      ['nada', 'nothing', 'nata', 'cream'],
      ['cada', 'each', 'cata', 'tasting'],
      ['todo', 'all', 'toto', '— not a word'],
      ['dedo', 'finger', 'deto', '— not a word']
    ],
    words: ['nada', 'cada', 'todo', 'dedo', 'ciudad', 'usted', 'verdad', 'estudiar'],
    tell: 'A hard English d between vowels. Soften it towards the th in "this".'
  },

  { id: 'll', symbol: 'll / y', title: 'll and y', cost: 'low',
    letters: 'll, and y before a vowel',
    mouth: 'The middle of the tongue rises to the roof of the mouth. In most of the ' +
           'Spanish-speaking world this is the y in "yes"; in Argentina and Uruguay it ' +
           'is the s in "measure".',
    instead: 'English speakers say an l, or the j of "jam". Neither is wrong enough to ' +
             'stop you being understood, which is why it survives for years.',
    trick: 'Start from the y in "yes" and you are already right almost everywhere.',
    pairs: [
      ['llave', 'key', 'lave', 'I wash'],
      ['calle', 'street', 'cale', 'it fits'],
      ['pollo', 'chicken', 'polo', 'polo'],
      ['mayo', 'May', 'malo', 'bad']
    ],
    words: ['llave', 'calle', 'pollo', 'ella', 'yo', 'ya', 'ayer', 'llamar', 'lluvia'],
    tell: 'That was an l or an English j. Start from the y in "yes".'
  },

  { id: 'vowels', symbol: 'a e i o u', title: 'Five pure vowels', cost: 'high',
    letters: 'every vowel, every time',
    mouth: 'Each one is a single steady sound that does not move while you say it. ' +
           'a as in "father", e as in "bet", i as in "machine", o as in "or", u as in ' +
           '"food". Say them short and do not let them drift.',
    instead: 'English vowels glide — "no" is really "no-oo", "say" is "se-ee". Bring ' +
             'that into Spanish and every word wobbles. English also reduces unstressed ' +
             'vowels to "uh", which Spanish never does: the o in "teléfono" is a full o.',
    trick: 'Hold each vowel for two seconds and listen for movement. If the sound ' +
           'changes while you hold it, it is an English vowel.',
    pairs: [
      ['peso', 'weight', 'piso', 'floor'],
      ['pero', 'but', 'puro', 'pure'],
      ['casa', 'house', 'cosa', 'thing'],
      ['mesa', 'table', 'misa', 'mass']
    ],
    words: ['casa', 'mesa', 'piso', 'todo', 'mucho', 'teléfono', 'universidad', 'oportunidad'],
    tell: 'A vowel drifted or went slack. Five sounds, each one steady.'
  },

  { id: 'h', symbol: 'h', title: 'h is silent', cost: 'low',
    letters: 'h, everywhere',
    mouth: 'Nothing at all. Say the word as though the letter were not printed. ' +
           'Not a soft h, not a slight breath — no sound whatsoever.',
    instead: 'Every English speaker breathes on it once. "Hola" is "ola", exactly the ' +
             'same as the word for wave.',
    trick: 'There is no trick. It is silent in every word, with no exceptions.',
    pairs: [
      ['hola', 'hello', 'ola', 'wave — said identically', 'same'],
      ['hasta', 'until', 'asta', 'flagpole — said identically', 'same'],
      ['hecho', 'done', 'echo', 'I throw — said identically', 'same']
    ],
    words: ['hola', 'hasta', 'hombre', 'hora', 'hacer', 'hijo', 'ahora', 'hospital'],
    tell: 'You breathed on the h. It is never pronounced.'
  },

  { id: 'stress', symbol: '´', title: 'Where the stress falls', cost: 'high',
    letters: 'every word of more than one syllable',
    mouth: 'Push harder on one syllable. Spanish stress is a rule, not a memory: an ' +
           'accent mark decides it; otherwise a word ending in a vowel, n or s is ' +
           'stressed on the second-last syllable, and anything else on the last.',
    instead: 'English speakers carry over the English stress pattern, which puts it ' +
             'near the front. "Teléfono" becomes "TE-le-fo-no" and stops being a word.',
    trick: 'Stress changes meaning: hablo is "I speak", habló is "he spoke". Getting ' +
           'it wrong can change the tense of what you said.',
    pairs: [
      ['hablo', 'I speak', 'habló', 'he spoke', 'stress'],
      ['papa', 'potato', 'papá', 'dad', 'stress'],
      ['esta', 'this', 'está', 'he is', 'stress'],
      ['termino', 'I finish', 'terminó', 'he finished', 'stress']
    ],
    words: ['teléfono', 'música', 'difícil', 'español', 'hablar', 'trabajo', 'universidad'],
    tell: 'The stress landed on the wrong syllable.'
  }
];

PARLA.data.es.soundsById = (function () {
  var m = {};
  PARLA.data.es.sounds.forEach(function (s) { m[s.id] = s; });
  return m;
})();
