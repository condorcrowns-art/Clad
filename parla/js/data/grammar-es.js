/* Parla — the things that actually block English speakers
 *
 * Sixty days of conversation is a schedule, not a syllabus. Nothing in it ever
 * stops and explains why "soy cansado" is wrong, and a learner who is never
 * told will make the same mistake for years, politely uncorrected by people who
 * understood them anyway.
 *
 * These are the two dozen points where English and Spanish disagree hard
 * enough that an English speaker gets it wrong by default — not the whole of
 * Spanish grammar, which is a book, but the part where being told once saves
 * you a hundred small failures.
 *
 * Each one carries:
 *   why      the thing English does that causes the mistake
 *   rule     the one sentence to remember
 *   pairs    minimal pairs — the same words, the distinction visible
 *   drill    items to be answered, with the wrong answer a learner would give
 *   topic    the id the grammar checker tags a correction with, so a mistake
 *            in conversation can open the page that explains it
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

PARLA.data.es.grammar = [

  { id: 'serestar', topic: 'serestar', level: 'a1', title: 'ser vs estar',
    sub: 'Two verbs for "to be", and the difference is not optional',
    why: 'English has one verb where Spanish has two, so there is nothing in your ' +
         'native grammar to attach the distinction to. You have to install it.',
    rule: 'ser = what something is. estar = how or where something is right now.',
    more: 'The trap is that both translate as "am". "Soy aburrido" means you are a ' +
          'boring person. "Estoy aburrido" means you are bored at the moment. Native ' +
          'speakers hear the difference the way you hear "I am cold" versus "I am cool".',
    pairs: [
      ['Soy aburrido.', 'I am a boring person.', 'Estoy aburrido.', 'I am bored right now.'],
      ['Es listo.', 'He is clever.', 'Está listo.', 'He is ready.'],
      ['Ella es guapa.', 'She is good-looking.', 'Ella está guapa.', 'She looks good today.'],
      ['La sopa es rica.', 'Soup is delicious (as a thing).', 'La sopa está rica.', 'This soup tastes good.']
    ],
    drill: [
      ['___ cansado después del trabajo.', 'estoy', ['soy'], 'Tiredness passes, so estar.'],
      ['___ profesor de historia.', 'soy', ['estoy'], 'A profession is what you are: ser.'],
      ['Mi hermana ___ en Madrid ahora.', 'está', ['es'], 'Location is always estar.'],
      ['El hielo ___ frío.', 'es', ['está'], 'Cold is what ice is, not how it feels today.'],
      ['La puerta ___ abierta.', 'está', ['es'], 'A door being open is a state, not a nature.'],
      ['Nosotros ___ de México.', 'somos', ['estamos'], 'Where you are from is ser.']
    ]
  },

  { id: 'tener', topic: 'tener', level: 'a1', title: 'Things you have, not things you are',
    sub: 'hunger, thirst, cold, fear, age',
    why: 'English says "I am hungry". Spanish says "I have hunger". Translate the ' +
         'English and you produce "soy hambre", which is not a sentence.',
    rule: 'tener + noun: tengo hambre, tengo frío, tengo 25 años, tengo miedo.',
    more: 'The give-away is that these are nouns in Spanish, not adjectives. You cannot ' +
          'be a hunger. And "mucho" agrees with them: tengo mucha hambre, mucho frío.',
    pairs: [
      ['Tengo hambre.', 'I am hungry.', 'Soy hambre.', '✗ — that says "I am hunger".'],
      ['Tengo 25 años.', 'I am 25.', 'Soy 25 años.', '✗ — you are not 25 years.'],
      ['Hace frío.', 'It is cold (the weather).', 'Tengo frío.', 'I am cold (me).']
    ],
    drill: [
      ['___ mucha sed.', 'tengo', ['soy', 'estoy'], 'Thirst is a thing you have.'],
      ['¿Cuántos años ___?', 'tienes', ['eres', 'estás'], 'Age uses tener.'],
      ['___ frío, cierra la ventana.', 'tengo', ['soy', 'estoy'], 'Feeling cold: tener.'],
      ['___ calor hoy en la calle.', 'hace', ['tiene', 'es'], 'Weather uses hacer, not tener.'],
      ['Mi hijo ___ miedo de los perros.', 'tiene', ['es', 'está'], 'Fear is had, not been.']
    ]
  },

  { id: 'gustar', topic: 'gustar', level: 'a1', title: 'gustar runs backwards',
    sub: 'You do not like things — things please you',
    why: 'Every English speaker starts with "yo gusto" because that is where the ' +
         'subject goes in English. In Spanish the thing being liked is the subject.',
    rule: 'me gusta el café = the coffee pleases me. Plural thing → me gustan.',
    more: 'So the verb agrees with the *thing*, not with you: me gusta el libro, ' +
          'me gustan los libros. To be emphatic you add "a mí": a mí me gusta.',
    pairs: [
      ['Me gusta el café.', 'I like coffee.', 'Yo gusto el café.', '✗ — that means "I please the coffee".'],
      ['Me gustan los perros.', 'I like dogs.', 'Me gusta los perros.', '✗ — plural thing, plural verb.'],
      ['A ella le gusta bailar.', 'She likes dancing.', 'Ella gusta bailar.', '✗ — she is not doing the pleasing.']
    ],
    drill: [
      ['Me ___ las películas españolas.', 'gustan', ['gusta', 'gusto'], 'Plural thing, so gustan.'],
      ['A Juan le ___ el fútbol.', 'gusta', ['gustan', 'gustas'], 'One thing: el fútbol.'],
      ['¿Te ___ este restaurante?', 'gusta', ['gustas', 'gustan'], 'One restaurant.'],
      ['No me ___ nada.', 'gusta', ['gustan'], '"Nada" is singular.'],
      ['Nos ___ mucho viajar.', 'gusta', ['gustan'], 'An infinitive counts as one thing.']
    ]
  },

  { id: 'gender', topic: 'gender', level: 'a1', title: 'Every noun has a gender',
    sub: 'and the article and adjectives have to match it',
    why: 'English nouns have no gender, so there is nothing to remember and nothing ' +
         'to get wrong. In Spanish, getting it wrong is audible in every sentence.',
    rule: 'Learn the article with the word. Not "casa" — "la casa".',
    more: 'The -o/-a pattern is only a guide. la mano, el día, el problema, el mapa, ' +
          'la foto all break it. Words in -ción, -dad, -tad, -tud are feminine without ' +
          'exception, which is thousands of words for one rule.',
    pairs: [
      ['el problema', 'masculine, despite the -a', 'la problema', '✗ — Greek origin, stays masculine.'],
      ['la mano', 'feminine, despite the -o', 'el mano', '✗'],
      ['el agua fría', 'el for sound, but feminine adjectives', 'la agua fría', '✗ — el before stressed a-.']
    ],
    drill: [
      ['___ ciudad es grande.', 'la', ['el'], '-dad is always feminine.'],
      ['___ problema es difícil.', 'el', ['la'], 'Greek -ma nouns are masculine.'],
      ['___ mano derecha.', 'la', ['el'], 'mano is feminine despite the -o.'],
      ['___ agua está fría.', 'el', ['la'], 'el before a stressed a-, but the adjective stays feminine.'],
      ['___ canción es bonita.', 'la', ['el'], '-ción is always feminine.'],
      ['___ mapa de España.', 'el', ['la'], 'mapa is masculine.']
    ]
  },

  { id: 'agreement', topic: 'agreement', level: 'a1', title: 'Adjectives copy their noun',
    sub: 'gender and number, every time',
    why: 'English adjectives never change. Spanish ones agree, and an adjective that ' +
         'does not agree sounds like a missing tooth.',
    rule: 'la casa blanca, los libros rojos, unas chicas altas.',
    more: 'Adjectives ending in -e or a consonant only change for number: grande → ' +
          'grandes, azul → azules. Only the -o family changes for gender.',
    pairs: [
      ['la casa blanca', '', 'la casa blanco', '✗'],
      ['los coches rojos', '', 'los coches rojo', '✗'],
      ['las mesas grandes', 'grande takes no -a', 'las mesas grandas', '✗']
    ],
    drill: [
      ['Las flores son ___.', 'bonitas', ['bonito', 'bonitos', 'bonita'], 'Feminine plural.'],
      ['Los zapatos están ___.', 'sucios', ['sucio', 'sucias'], 'Masculine plural.'],
      ['La comida está ___.', 'fría', ['frío', 'fríos'], 'Feminine singular.'],
      ['Mis amigos son muy ___.', 'amables', ['amable', 'amabless'], '-e adjectives only add -s.']
    ]
  },

  { id: 'wordorder', topic: 'wordorder', level: 'a1', title: 'The describing word comes second',
    sub: 'casa roja, not roja casa',
    why: 'English puts the adjective in front and it never moves. Spanish puts it after ' +
         'the noun by default, and moving it in front changes the meaning.',
    rule: 'noun + adjective. un coche rápido, una idea buena.',
    more: 'In front, an adjective becomes subjective rather than descriptive: ' +
          '"un viejo amigo" is a long-standing friend; "un amigo viejo" is an elderly ' +
          'one. Numbers, and words like mucho, otro, cada, always go in front.',
    pairs: [
      ['una casa roja', 'a red house', 'una roja casa', '✗'],
      ['un viejo amigo', 'a friend of many years', 'un amigo viejo', 'an old man who is your friend'],
      ['mucho tiempo', 'quantity words go first', 'tiempo mucho', '✗']
    ],
    drill: [
      ['Quiero un ___.', 'café solo', ['solo café'], 'Describing word after.'],
      ['Es una ___.', 'película larga', ['larga película'], 'Describing word after.'],
      ['Tengo ___ trabajo.', 'mucho', ['trabajo mucho'], 'Quantity goes in front.']
    ]
  },

  { id: 'person', topic: 'person', level: 'a1', title: 'The verb ending is the pronoun',
    sub: 'so the pronoun is usually dropped',
    why: 'English needs "I" because "speak" alone says nothing. Spanish endings already ' +
         'say who, so saying "yo" every time sounds like you are insisting it was you.',
    rule: 'hablo = I speak. Say "yo hablo" only for contrast or emphasis.',
    more: 'It also means the ending has to be right: "yo tiene" is not a small slip, ' +
          'it is a sentence with two different people in it.',
    pairs: [
      ['Hablo español.', 'natural', 'Yo hablo español.', 'emphatic — "*I* speak Spanish"'],
      ['¿Trabajas aquí?', 'natural', '¿Tú trabajas aquí?', 'emphatic — "do *you* work here?"']
    ],
    drill: [
      ['Yo ___ al cine los viernes.', 'voy', ['va', 'vas', 'vamos'], 'yo → voy.'],
      ['Nosotros ___ en Madrid.', 'vivimos', ['vive', 'vivo', 'viven'], 'nosotros → -imos.'],
      ['Ellos ___ mucho café.', 'beben', ['bebe', 'bebo'], 'ellos → -en.'],
      ['¿Tú ___ la respuesta?', 'sabes', ['sabe', 'sé'], 'tú → sabes.']
    ]
  },

  { id: 'preterito', topic: 'pasttense', level: 'a2', title: 'Two past tenses',
    sub: 'preterite for what happened, imperfect for what was going on',
    why: 'English uses "I ate" for both a finished event and a habit. Spanish splits ' +
         'them, and choosing wrong changes what you said rather than how you said it.',
    rule: 'Preterite = one finished event. Imperfect = a background, a habit, a state.',
    more: 'Comí a las dos — I ate at two, done. Comía a las dos — I used to eat at two. ' +
          'A useful test: could you say "used to" or "was ...ing" in English? Imperfect.',
    pairs: [
      ['Ayer comí paella.', 'one meal, finished', 'Ayer comía paella.', 'sets a scene — something else happened'],
      ['Fui a México en 2019.', 'a trip, over', 'Iba a México cada año.', 'used to go, repeatedly'],
      ['Cuando llegué, llovía.', 'arrived (event) while it was raining (background)', '', '']
    ],
    drill: [
      ['Cuando era niño, ___ mucho.', 'jugaba', ['jugué'], 'A childhood habit: imperfect.'],
      ['Ayer ___ a mi abuela.', 'visité', ['visitaba'], 'One finished visit.'],
      ['___ las tres cuando salimos.', 'eran', ['fueron'], 'Time of day is always imperfect.'],
      ['El año pasado ___ a España.', 'viajé', ['viajaba'], 'A completed trip.'],
      ['Mientras ___, sonó el teléfono.', 'cocinaba', ['cociné'], 'Background action: imperfect.']
    ]
  },

  { id: 'porpara', topic: 'porpara', level: 'a2', title: 'por vs para',
    sub: 'both are "for", and they are not interchangeable',
    why: 'English collapses cause and purpose into one word. Spanish keeps them apart, ' +
         'and the wrong one can invert your meaning.',
    rule: 'para = the destination, the deadline, the purpose. por = the cause, the ' +
          'exchange, the route, the duration.',
    more: 'Lo hice por ti = I did it because of you. Lo hice para ti = I did it for you ' +
          'to have. Both are correct sentences; only one is what you meant.',
    pairs: [
      ['Es para ti.', "it's yours", 'Es por ti.', "it's because of you"],
      ['Salgo para Madrid.', 'heading there', 'Paso por Madrid.', 'passing through'],
      ['Estudio para el examen.', 'purpose', 'Gracias por el regalo.', 'cause / in exchange']
    ],
    drill: [
      ['Este regalo es ___ mi madre.', 'para', ['por'], 'The recipient: para.'],
      ['Gracias ___ tu ayuda.', 'por', ['para'], 'In exchange for: por.'],
      ['Trabajo ___ una empresa grande.', 'para', ['por'], 'Employer: para.'],
      ['Lo compré ___ diez euros.', 'por', ['para'], 'An exchange: por.'],
      ['La tarea es ___ el lunes.', 'para', ['por'], 'A deadline: para.'],
      ['Caminamos ___ el parque.', 'por', ['para'], 'Through: por.']
    ]
  },

  { id: 'personal-a', topic: 'personala', level: 'a2', title: 'The personal a',
    sub: 'a small word English has no version of',
    why: 'English marks the object by position alone. Spanish adds "a" before a person ' +
         'who is the object, and leaving it out is one of the loudest learner tells.',
    rule: 'Verb + a + a specific person. Veo a María. Busco a mi hermano.',
    more: 'Not for things: veo la casa. Not after tener: tengo dos hermanos. Pets count ' +
          'as people if they are yours.',
    pairs: [
      ['Veo a María.', '', 'Veo María.', '✗'],
      ['Busco a mi hermano.', '', 'Busco mi hermano.', '✗'],
      ['Veo la casa.', 'a thing, no a', 'Veo a la casa.', '✗']
    ],
    drill: [
      ['Conozco ___ tu hermana.', 'a', ['—'], 'A specific person.'],
      ['Quiero ___ un café.', '—', ['a'], 'A thing takes no personal a.'],
      ['Llamé ___ mi madre.', 'a', ['—'], 'A person.'],
      ['Tengo ___ dos hijos.', '—', ['a'], 'tener does not take it.']
    ]
  },

  { id: 'subjunctive', topic: 'subjunctive', level: 'b1', title: 'The subjunctive',
    sub: 'for what is wanted, doubted or not yet real',
    why: 'English lost most of its subjunctive, so there is no habit to lean on. It is ' +
         'not a tense — it is a mood, and it marks that something is not being asserted.',
    rule: 'After wanting, doubting, feeling, denying, and after "para que", "antes de ' +
          'que", "cuando" about the future.',
    more: 'Quiero que vengas — I want you to come; the coming is not a fact yet. ' +
          'Sé que vienes — I know you are coming; that is a fact, so indicative.',
    pairs: [
      ['Quiero que vengas.', 'not yet real', 'Sé que vienes.', 'a fact'],
      ['Espero que esté bien.', 'hope', 'Creo que está bien.', 'belief, so indicative'],
      ['Cuando llegues, llámame.', 'future, unreal yet', 'Cuando llegué, te llamé.', 'past fact']
    ],
    drill: [
      ['Quiero que ___ conmigo.', 'vengas', ['vienes'], 'After querer que: subjunctive.'],
      ['Es importante que ___ pronto.', 'salgamos', ['salimos'], 'Impersonal + que: subjunctive.'],
      ['Creo que ___ razón.', 'tienes', ['tengas'], 'Belief is asserted, so indicative.'],
      ['No creo que ___ razón.', 'tengas', ['tienes'], 'Denied belief: subjunctive.'],
      ['Cuando ___ tiempo, te llamo.', 'tenga', ['tengo'], 'Future "when": subjunctive.']
    ]
  },

  { id: 'negation', topic: 'negation', level: 'a1', title: 'Two negatives are correct',
    sub: 'no veo nada',
    why: 'English forbids the double negative. Spanish requires it, and the ' +
         'English habit produces sentences that sound broken.',
    rule: 'If a negative word follows the verb, "no" goes before it.',
    more: 'Or put the negative word first and drop the "no": nada veo. Both are right; ' +
          'the second is emphatic.',
    pairs: [
      ['No veo nada.', 'I see nothing.', 'Veo nada.', '✗'],
      ['No viene nadie.', 'Nobody is coming.', 'Nadie viene.', 'also right, more emphatic'],
      ['No voy nunca.', 'I never go.', 'Nunca voy.', 'also right']
    ],
    drill: [
      ['___ quiero nada.', 'no', ['—'], 'The no is required before the verb.'],
      ['___ hay nadie en casa.', 'no', ['—'], 'Same rule.'],
      ['Nunca ___ tarde.', 'llego', ['no llego'], 'Negative first means no second "no".']
    ]
  },

  { id: 'muymucho', topic: 'muymucho', level: 'a1', title: 'muy vs mucho',
    sub: 'very vs a lot, and they never stack',
    why: 'English uses "very" and "much" loosely and even together ("very much"). ' +
         'Spanish assigns them different jobs.',
    rule: 'muy + adjective or adverb. mucho + noun, or after a verb.',
    more: 'And mucho agrees when it goes with a noun: mucha agua, muchos libros. ' +
          '"Very much" is one word: muchísimo.',
    pairs: [
      ['muy grande', 'with an adjective', 'mucho grande', '✗'],
      ['mucho trabajo', 'with a noun', 'muy trabajo', '✗'],
      ['Me gusta muchísimo.', 'very much', 'Me gusta muy mucho.', '✗']
    ],
    drill: [
      ['La casa es ___ bonita.', 'muy', ['mucha', 'mucho'], 'Before an adjective: muy.'],
      ['Tengo ___ hambre.', 'mucha', ['muy', 'mucho'], 'hambre is a feminine noun.'],
      ['Trabaja ___.', 'mucho', ['muy'], 'After a verb: mucho.'],
      ['Es ___ tarde.', 'muy', ['mucho'], 'tarde is an adverb here.']
    ]
  },

  { id: 'saberconocer', topic: 'saberconocer', level: 'a2', title: 'saber vs conocer',
    sub: 'two kinds of knowing',
    why: 'English has one "know" for facts, skills and people. Spanish splits facts and ' +
         'skills from acquaintance.',
    rule: 'saber = a fact, or how to do something. conocer = to be acquainted with a ' +
          'person, a place, a work.',
    more: 'Sé nadar — I can swim. Conozco Madrid — I have been there, I know it. ' +
          'You never "sabes" a person.',
    pairs: [
      ['Sé la respuesta.', 'a fact', 'Conozco la respuesta.', '✗'],
      ['Conozco a Juan.', 'a person', 'Sé a Juan.', '✗'],
      ['Sé cocinar.', 'a skill', 'Conozco cocinar.', '✗']
    ],
    drill: [
      ['___ hablar francés.', 'sé', ['conozco'], 'A skill: saber.'],
      ['¿___ a mi hermana?', 'conoces', ['sabes'], 'A person: conocer.'],
      ['No ___ dónde está.', 'sé', ['conozco'], 'A fact: saber.'],
      ['___ muy bien esta ciudad.', 'conozco', ['sé'], 'A place: conocer.']
    ]
  },

  { id: 'reflexive', topic: 'reflexive', level: 'a2', title: 'Verbs that turn on themselves',
    sub: 'me levanto, se llama, nos vemos',
    why: 'English says "I get up" and hides the reflexive. Spanish states it, and the ' +
         'pronoun changes with the person.',
    rule: 'me / te / se / nos / os / se, in front of the conjugated verb.',
    more: 'Some verbs change meaning entirely: ir = to go, irse = to leave. dormir = to ' +
          'sleep, dormirse = to fall asleep. That is not a nuance, it is a different verb.',
    pairs: [
      ['Me levanto a las siete.', 'I get up', 'Levanto a las siete.', 'I lift something at seven'],
      ['Se llama Ana.', 'She is called Ana', 'Llama Ana.', 'Ana is calling'],
      ['Voy.', 'I am going', 'Me voy.', 'I am leaving']
    ],
    drill: [
      ['___ llamo Carlos.', 'me', ['se', 'te'], 'First person: me.'],
      ['¿Cómo ___ llamas?', 'te', ['se', 'me'], 'Second person: te.'],
      ['Los niños ___ acuestan tarde.', 'se', ['nos', 'me'], 'Third person plural: se.'],
      ['Nosotros ___ vemos mañana.', 'nos', ['se', 'me'], 'First person plural: nos.']
    ]
  },

  { id: 'contractions', topic: 'contractions', level: 'a1', title: 'del and al',
    sub: 'two contractions that are not optional',
    why: 'English contractions are casual. These two are compulsory — "de el" is simply ' +
         'not written or said.',
    rule: 'de + el = del. a + el = al. Nothing else contracts.',
    more: 'Not before a name: "Vengo de El Salvador". And not with "ella", "ellos", ' +
          '"la": de la casa stays as it is.',
    pairs: [
      ['el libro del profesor', '', 'el libro de el profesor', '✗'],
      ['Voy al cine.', '', 'Voy a el cine.', '✗'],
      ['la casa de la profesora', 'no contraction with la', '', '']
    ],
    drill: [
      ['Vengo ___ mercado.', 'del', ['de el'], 'de + el = del.'],
      ['Vamos ___ parque.', 'al', ['a el'], 'a + el = al.'],
      ['Es la casa ___ vecina.', 'de la', ['dela', 'del'], 'Only el contracts.']
    ]
  },

  { id: 'falsefriends', topic: 'falsefriends', level: 'a2', title: 'Words that lie',
    sub: 'they look English and mean something else',
    why: 'A word that looks familiar is one you will never look up, so the mistake ' +
         'survives for years.',
    rule: 'When a Spanish word looks exactly like an English one, be suspicious.',
    more: 'Some of these are merely wrong. "Estoy embarazada" in front of your ' +
          'colleagues is not merely wrong.',
    pairs: [
      ['embarazada', 'pregnant — not embarrassed', 'avergonzada', 'embarrassed'],
      ['éxito', 'success — not exit', 'salida', 'exit'],
      ['actualmente', 'currently — not actually', 'en realidad', 'actually'],
      ['sensible', 'sensitive — not sensible', 'sensato', 'sensible'],
      ['librería', 'bookshop — not library', 'biblioteca', 'library'],
      ['sopa', 'soup — not soap', 'jabón', 'soap']
    ],
    drill: [
      ['Estoy muy ___ por lo que dije.', 'avergonzado', ['embarazado'], 'Embarazada means pregnant.'],
      ['La ___ está a la derecha.', 'salida', ['éxito'], 'Éxito means success.'],
      ['___ vivo en Madrid.', 'actualmente', ['en realidad'], 'Currently: actualmente.'],
      ['Compré el libro en la ___.', 'librería', ['biblioteca'], 'A shop, not a library.']
    ]
  },

  { id: 'questions', topic: 'questions', level: 'a1', title: 'Asking a question',
    sub: 'no "do", and two question marks',
    why: 'English builds questions with "do" and by shuffling the words. Spanish does ' +
         'neither — it just changes the tune.',
    rule: '¿Hablas español? Same words, question marks at both ends.',
    more: 'Question words take an accent: qué, quién, dónde, cuándo, cómo, cuánto. ' +
          'Without the accent they mean something else: "que" is "that".',
    pairs: [
      ['¿Hablas español?', '', '¿Haces hablar español?', '✗ — there is no "do".'],
      ['¿Dónde está?', 'question word, accented', 'Donde está.', 'a statement about where it is'],
      ['¿Qué quieres?', '', 'Que quieres', '✗ — needs ¿ and the accent']
    ],
    drill: [
      ['¿___ te llamas?', 'cómo', ['como'], 'A question word takes the accent.'],
      ['¿___ vives?', 'dónde', ['donde'], 'Accented in a question.'],
      ['¿___ cuesta?', 'cuánto', ['cuanto'], 'Accented in a question.']
    ]
  },

  { id: 'haypersonal', topic: 'hay', level: 'a1', title: 'hay, and what it is not',
    sub: 'there is, there are — one word for both',
    why: 'English changes "there is" to "there are". Spanish does not, and learners ' +
         'reach for "son" or "están" instead.',
    rule: 'hay = there is / there are, for something whose existence is being announced.',
    more: 'Use estar for something whose location is being given, when both you and the ' +
          'listener already know it exists: ¿Dónde está el baño? — El baño está allí. ' +
          'But: ¿Hay un baño aquí?',
    pairs: [
      ['Hay dos sillas.', 'there are two chairs', 'Son dos sillas.', 'they are two chairs'],
      ['¿Hay un banco cerca?', 'does one exist?', '¿Está un banco cerca?', '✗'],
      ['El banco está en la esquina.', 'a known bank, its location', '', '']
    ],
    drill: [
      ['___ mucha gente en la calle.', 'hay', ['están', 'son'], 'Announcing existence.'],
      ['El libro ___ en la mesa.', 'está', ['hay'], 'A known book, its location.'],
      ['¿___ un supermercado por aquí?', 'hay', ['está'], 'Does one exist?']
    ]
  },

  { id: 'accents', topic: 'accents', level: 'a2', title: 'The accent is not decoration',
    sub: 'it changes the word',
    why: 'English has no written stress, so an accent looks optional. In Spanish it is ' +
         'often the only difference between two words.',
    rule: 'Where two words are spelt the same, the accent marks the stressed or ' +
          'questioning one.',
    more: 'It also marks where the stress falls, which changes the tense: hablo (I ' +
          'speak) versus habló (he spoke). Getting it wrong on paper changes who did it ' +
          'and when.',
    pairs: [
      ['sí', 'yes', 'si', 'if'],
      ['tú', 'you', 'tu', 'your'],
      ['él', 'he', 'el', 'the'],
      ['más', 'more', 'mas', 'but (literary)'],
      ['hablo', 'I speak', 'habló', 'he spoke']
    ],
    drill: [
      ['___ quieres, vamos.', 'si', ['sí'], 'This one is "if".'],
      ['___ eres mi amigo.', 'tú', ['tu'], 'This one is "you".'],
      ['Es ___ hermano.', 'tu', ['tú'], 'This one is "your".'],
      ['Ayer ___ con María.', 'habló', ['hablo'], 'Past tense takes the accent.']
    ]
  }
];

/* Quick lookup by the id the grammar checker tags a correction with, so a
 * mistake made in conversation can open the lesson that explains it. */
PARLA.data.es.grammarByTopic = (function () {
  var map = {};
  PARLA.data.es.grammar.forEach(function (g) { map[g.topic] = g; });
  return map;
})();
