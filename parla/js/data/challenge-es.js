/* Parla — the 60-day speaking challenge
 *
 * One prompt per day, ordered so grammar arrives when you actually need it.
 * Each day: a speaking task, a grammar focus, and a linked scenario to run.
 * Days are gated by completion, not by the calendar — miss a day and you pick
 * up where you left off rather than losing the streak's meaning entirely.
 *
 * [title, prompt_en, focus, scenarioId, minTurns, [kind, id]]
 *
 * The sixth field is the day's second task, and it exists because the plan had
 * become narrower than the app. Sixty days of nothing but conversation meant a
 * learner who followed it literally never opened the reading, the listening,
 * the writing or the sounds — four of the six things the app can teach.
 *
 * kind is one of read, listen, write, sound, lesson, and the id points into
 * reading-es, writing-es, sounds-es or grammar-es. Where it can, it matches the
 * day: day 9 is "me gusta" and its second task is the lesson on gustar running
 * backwards; day 23 is the preterite of ir and its second task is writing about
 * last weekend. The sounds do not map onto conversation topics and do not
 * pretend to — they are spread evenly so all ten get a turn.
 *
 * A text is always read before it is heard: perro on day 7, and again without
 * the text on day 19.
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

PARLA.data.es.challenge = [
  /* Week 1 — survive a first exchange */
  ['Say hello and your name', 'Greet your partner, say your name, and ask for theirs.', 'me llamo / ¿cómo te llamas?', 'presentarse', 3, ['write', 'presentarse']],
  ['Say where you are from', 'Introduce yourself and say what country and city you are from.', 'ser + de', 'presentarse', 3, ['lesson', 'serestar']],
  ['Order a coffee', 'Order one drink and say whether it is to stay or take away.', 'quiero / quisiera', 'cafe', 4, ['sound', 'rr']],
  ['Count and pay', 'Ask how much something costs and hand over money.', 'numbers 1–100', 'cafe', 4, ['write', 'compras']],
  ['Describe your family', 'Say how many brothers and sisters you have and what they do.', 'tener + numbers', 'presentarse', 4, ['write', 'familia']],
  ['Ask where something is', 'Stop someone and ask where the station is.', '¿dónde está...?', 'direcciones', 4, ['lesson', 'questions']],
  ['Week 1 review', 'Have a full conversation using everything from this week.', 'mixed review', 'libre', 5, ['read', 'perro']],

  /* Week 2 — the present tense */
  ['Talk about your day', 'Describe what you do on a normal weekday.', 'regular present tense', 'libre', 5, ['write', 'rutina']],
  ['Say what you like', 'Talk about three things you like and one you do not.', 'me gusta / no me gusta', 'libre', 5, ['lesson', 'gustar']],
  ['Order a full meal', 'Order a starter, a main and a drink at a restaurant.', 'voy a tomar...', 'restaurante', 5, ['write', 'comida']],
  ['Ask for a recommendation', 'Ask your waiter what they recommend, then decide.', '¿qué me recomienda?', 'restaurante', 5, ['sound', 'j']],
  ['Buy fruit at a market', 'Ask for a specific quantity and the price per kilo.', 'quantities', 'mercado', 4, ['lesson', 'muymucho']],
  ['Describe where you live', 'Describe your home: rooms, what you like about it.', 'hay / tener', 'piso', 5, ['write', 'casa']],
  ['Week 2 review', 'Free conversation. Use the present tense throughout.', 'present tense', 'libre', 6, ['read', 'autobus']],

  /* Week 3 — questions and small talk */
  ['Ask five questions', 'Ask your partner five different questions about their life.', 'question words', 'presentarse', 5, ['write', 'gustos']],
  ['Small talk in a lift', 'Handle two minutes of weather-and-neighbours small talk.', 'polite register', 'smalltalk', 4, ['write', 'ciudad']],
  ['Make a plan', 'Suggest an activity, agree a day, time, and meeting place.', 'quedar / ¿qué tal si...?', 'planes', 5, ['write', 'mananana']],
  ['Check into a hotel', 'Confirm a reservation and ask about breakfast and wifi.', 'formal usted', 'hotel', 5, ['sound', 'vowels']],
  ['Ask someone to repeat', 'Deliberately get lost, then use repair phrases to recover.', 'repair phrases', 'direcciones', 5, ['listen', 'perro']],
  ['Talk about the weather', 'Describe today, yesterday, and what you prefer.', 'hace + weather', 'smalltalk', 4, ['write', 'tiempo']],
  ['Week 3 review', 'Conversation where you ask as many questions as you answer.', 'questions', 'libre', 6, ['read', 'cocina']],

  /* Week 4 — the past */
  ['What you did yesterday', 'Describe three things you did yesterday.', 'preterite: regular', 'libre', 5, ['lesson', 'preterito']],
  ['Your last trip', 'Describe a trip you took: where, when, who with.', 'preterite: ir / ser', 'libre', 5, ['write', 'finde']],
  ['Buy a train ticket', 'Buy a return ticket and ask which platform.', 'ida y vuelta', 'tren', 5, ['sound', 'r']],
  ['A story that went wrong', 'Tell a short story about something that did not go to plan.', 'preterite: irregulars', 'libre', 6, ['write', 'viaje']],
  ['Buy clothes', 'Ask for a size, try something on, decide.', 'direct object pronouns', 'ropa', 5, ['read', 'llaves']],
  ['What you used to do', 'Describe what you did as a child.', 'imperfect tense', 'libre', 5, ['write', 'infancia']],
  ['Week 4 review', 'Tell one story in the past, start to finish, uninterrupted.', 'past tenses', 'libre', 6, ['listen', 'autobus']],

  /* Week 5 — problems and pressure */
  ['Describe a symptom', 'Tell a doctor what hurts and for how long.', 'doler + body parts', 'medico', 5, ['write', 'salud']],
  ['At the pharmacy', 'Ask for something without a prescription and confirm the dose.', 'necesito algo para...', 'farmacia', 5, ['read', 'farmacia']],
  ['Return an item', 'Return something and ask for a refund.', 'past + object pronouns', 'devolucion', 5, ['lesson', 'reflexive']],
  ['Make a complaint', 'Complain politely but firmly until it is resolved.', 'polite insistence', 'queja', 6, ['write', 'problema']],
  ['An unexpected phone call', 'Handle a call from a delivery driver you cannot see.', 'phone register', 'telefono', 5, ['read', 'mensaje']],
  ['A missed connection', 'Sort out a cancelled flight at the airline desk.', 'conditional requests', 'aeropuerto', 6, ['sound', 'd']],
  ['Week 5 review', 'Handle one problem scenario with no preparation.', 'problem-solving', 'queja', 6, ['listen', 'farmacia']],

  /* Week 6 — the future and plans */
  ['Your plans this week', 'Say what you are going to do over the next few days.', 'ir a + infinitive', 'planes', 5, ['lesson', 'porpara']],
  ['Next year', 'Describe your plans and hopes for next year.', 'future tense', 'libre', 5, ['write', 'futuro']],
  ['At the bank', 'Sort out an account problem and understand the timeline.', 'formal transactions', 'banco', 5, ['sound', 'b-v']],
  ['View a flat', 'View an apartment, ask about rent and bills.', 'question forms', 'piso', 6, ['lesson', 'haypersonal']],
  ['If I had time', 'Say what you would do with more free time or money.', 'conditional', 'libre', 5, ['write', 'ojala']],
  ['Give directions', 'Reverse roles: explain to someone how to get somewhere.', 'imperatives', 'direcciones', 5, ['write', 'consejo']],
  ['Week 6 review', 'Talk for two full minutes about your future without stopping.', 'future forms', 'libre', 6, ['listen', 'cocina']],

  /* Week 7 — opinions */
  ['Give an opinion', 'State an opinion on something and back it with a reason.', 'creo que / me parece', 'reunion', 6, ['write', 'opinion']],
  ['Agree and disagree', 'Practise agreeing and disagreeing politely.', 'no estoy de acuerdo', 'reunion', 6, ['write', 'desacuerdo']],
  ['A job interview', 'Introduce your background and say why you want the role.', 'professional register', 'trabajo', 6, ['read', 'entrevista']],
  ['Speak up in a meeting', 'Give an opinion, take pushback, propose something.', 'proposing', 'reunion', 6, ['lesson', 'subjunctive']],
  ['Compare two things', 'Compare two cities, jobs, or foods and pick one.', 'más/menos... que', 'libre', 5, ['write', 'comparar']],
  ['Explain a process', 'Explain step by step how to do something you know well.', 'sequencing words', 'libre', 6, ['sound', 'll']],
  ['Week 7 review', 'Defend an opinion for a full conversation.', 'argumentation', 'debate', 7, ['listen', 'entrevista']],

  /* Week 8 — under pressure */
  ['An emergency call', 'Report an emergency clearly and follow instructions.', 'urgency + clarity', 'emergencia', 6, ['sound', 'stress']],
  ['Interrupt politely', 'Practise interrupting and holding the floor.', 'perdona que te interrumpa', 'reunion', 6, ['sound', 'n-tilde']],
  ['Talk about a mistake', 'Describe something you got wrong and what you learned.', 'past + reflection', 'libre', 6, ['write', 'anecdota']],
  ['Persuade someone', 'Convince your partner to change their mind about something.', 'persuasion', 'debate', 7, ['read', 'mudanza']],
  ['Handle a hard question', 'Answer a question you are not prepared for, without freezing.', 'buying time', 'debate', 6, ['lesson', 'saberconocer']],
  ['Tell a long story', 'Tell a story with a beginning, middle and end. No English.', 'narrative tenses', 'libre', 7, ['write', 'recomendar']],
  ['Week 8 review', 'Free conversation. Notice how much less you hesitate.', 'fluency', 'libre', 7, ['listen', 'mensaje']],

  /* Final stretch — consolidation */
  ['Restaurant, no notes', 'Run the full restaurant scenario with no phrases on screen.', 'recall', 'restaurante', 6, ['sound', 'h']],
  ['Interview, no notes', 'Full job interview, unaided.', 'recall', 'trabajo', 7, ['write', 'trabajo']],
  ['Your own topic', 'Choose the hardest topic you can and talk about it.', 'self-directed', 'libre', 8, ['read', 'taxi']],
  ['Day 60 — the long conversation', 'Ten turns, any topic, no English, no notes. You have earned it.', 'everything', 'libre', 10, ['listen', 'taxi']]
];
