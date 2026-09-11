/* Parla — things to write
 *
 * The app could talk, listen, read, correct and coach, and had nowhere to
 * *produce* Spanish in your own time. Speaking is production too, but it is
 * production under time pressure, where you say the sentence you can reach
 * rather than the one you mean. Writing is where you find out what you can
 * actually build, because nothing is moving and there is no partner filling
 * the silence.
 *
 * Each task is built around one thing an English speaker has to get right and
 * would rather avoid: gustar being backwards, ser against estar, the preterite
 * against the imperfect, a subjunctive after a trigger. The prompt is chosen so
 * that you cannot answer it without meeting that thing.
 *
 * Fields:
 *   ask     the prompt, in Spanish, as it appears on screen
 *   en      what it is asking, in English
 *   forces  the grammar the answer cannot avoid — shown after you write
 *   hint    words you are likely to reach for, and their meanings
 *   model   two answers, a short one and a fuller one
 *
 * Every Spanish sentence in this file is run through the grammar checker by
 * test/writing.test.js.
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

PARLA.data.es.writing = [

  /* ── A1 ──────────────────────────────────────────────────*/
  { id: 'presentarse', level: 'a1', minutes: 3,
    ask: '¿Cómo te llamas y de dónde eres?',
    en: 'Introduce yourself: your name, where you are from, where you live now.',
    forces: 'llamarse is reflexive and ser is the verb for where you are from — ' +
            '"soy de", never "vengo de" for the country you belong to.',
    hint: [['llamarse', 'to be called'], ['ser de', 'to be from'],
           ['vivir', 'to live'], ['ahora', 'now']],
    model: ['Me llamo Ana y soy de Irlanda.',
            'Me llamo Ana, soy de Irlanda y vivo en Madrid desde hace dos años.'] },

  { id: 'familia', level: 'a1', minutes: 3,
    ask: '¿Cómo es tu familia?',
    en: 'Describe your family: who is in it, and one thing about one of them.',
    forces: 'Every noun drags its article and its gender behind it, and every ' +
            'adjective has to follow: mi hermana pequeña, mis dos hermanos mayores.',
    hint: [['el hermano', 'brother'], ['la hermana', 'sister'],
           ['mayor', 'older'], ['menor', 'younger'], ['trabajar', 'to work']],
    model: ['Tengo dos hermanos y una hermana.',
            'Somos cuatro en casa. Mi hermana mayor trabaja en un hospital y mis ' +
            'padres viven en el campo.'] },

  { id: 'gustos', level: 'a1', minutes: 3,
    ask: '¿Qué te gusta hacer los fines de semana?',
    en: 'Say what you like doing at weekends, and one thing you do not like.',
    forces: 'Gustar runs backwards: the thing you like is the subject. One thing ' +
            'is "me gusta", several things are "me gustan", and both are third person.',
    hint: [['gustar', 'to be pleasing'], ['salir', 'to go out'],
           ['cocinar', 'to cook'], ['aburrido', 'boring']],
    model: ['Me gusta cocinar y salir con mis amigos.',
            'Los sábados me gusta dormir hasta tarde. No me gustan las tiendas ' +
            'porque siempre hay demasiada gente.'] },

  { id: 'rutina', level: 'a1', minutes: 3,
    ask: '¿Qué haces todos los días?',
    en: 'Describe an ordinary day, from waking up to going to bed.',
    forces: 'Reflexive verbs, which English hides: levantarse, ducharse, acostarse. ' +
            'And the present tense of half a dozen verbs in a row, all in the yo form.',
    hint: [['levantarse', 'to get up'], ['desayunar', 'to have breakfast'],
           ['volver', 'to come back'], ['acostarse', 'to go to bed']],
    model: ['Me levanto a las siete y desayuno en casa.',
            'Me levanto a las siete, trabajo hasta las cinco y vuelvo a casa en ' +
            'autobús. Ceno sobre las nueve y me acuesto tarde.'] },

  { id: 'casa', level: 'a1', minutes: 3,
    ask: '¿Cómo es tu casa?',
    en: 'Describe where you live: the rooms, what is in them, what you like about it.',
    forces: 'Hay for what exists, estar for where it is, ser for what it is like — ' +
            'three verbs where English has one.',
    hint: [['la habitación', 'room'], ['la cocina', 'kitchen'],
           ['al lado de', 'next to'], ['luminoso', 'bright']],
    model: ['Mi casa es pequeña pero muy luminosa.',
            'Vivo en un piso con dos habitaciones. La cocina está al lado del ' +
            'salón y hay una ventana grande que da a la calle.'] },

  { id: 'comida', level: 'a1', minutes: 3,
    ask: '¿Qué comiste ayer?',
    en: 'Say what you ate yesterday, at each meal.',
    forces: 'The preterite of comer and beber in the yo form, and food nouns with ' +
            'the right article: el pan, la carne, las verduras.',
    hint: [['desayunar', 'to have breakfast'], ['la comida', 'lunch, food'],
           ['la cena', 'dinner'], ['probar', 'to try, taste']],
    model: ['Ayer comí pollo con arroz.',
            'Desayuné café y una tostada. Al mediodía comí una ensalada en el ' +
            'trabajo y por la noche cené sopa.'] },

  { id: 'tiempo', level: 'a1', minutes: 2,
    ask: '¿Qué tiempo hace hoy donde estás?',
    en: 'Describe the weather today, and say whether you like it.',
    forces: 'Weather is hacer, not ser or estar: hace frío, hace sol. And "tengo ' +
            'frío" for the person, which is tener and not estar.',
    hint: [['hacer frío', 'to be cold (weather)'], ['llover', 'to rain'],
           ['el paraguas', 'umbrella'], ['la nube', 'cloud']],
    model: ['Hoy hace frío y hay muchas nubes.',
            'Está lloviendo desde esta mañana y hace bastante frío. No me gusta ' +
            'salir sin paraguas.'] },

  { id: 'compras', level: 'a1', minutes: 3,
    ask: 'Estás en una tienda. Escribe lo que le dices al dependiente.',
    en: 'Write what you say in a shop: what you want, asking the price, paying.',
    forces: 'Querer and poder in polite forms, and the numbers you need to ' +
            'understand a price said out loud.',
    hint: [['querer', 'to want'], ['costar', 'to cost'],
           ['probarse', 'to try on'], ['la talla', 'size']],
    model: ['Quiero esta camiseta, por favor. ¿Cuánto cuesta?',
            'Buenos días. ¿Puedo probarme esta camisa? Creo que necesito una ' +
            'talla más grande.'] },

  { id: 'ciudad', level: 'a1', minutes: 3,
    ask: '¿Cómo es tu ciudad?',
    en: 'Describe your town or city: what there is, what it is like, what is missing.',
    forces: 'Hay against estar again, and plural agreement across a list: muchos ' +
            'parques, dos museos pequeños, tiendas caras.',
    hint: [['el parque', 'park'], ['tranquilo', 'quiet'],
           ['el barrio', 'neighbourhood'], ['faltar', 'to be lacking']],
    model: ['Mi ciudad es pequeña y muy tranquila.',
            'Vivo en un barrio tranquilo con dos parques y un mercado. No hay ' +
            'cine, y eso es lo único que echo de menos.'] },

  { id: 'mananana', level: 'a1', minutes: 2,
    ask: '¿Qué vas a hacer mañana?',
    en: 'Say three things you are going to do tomorrow.',
    forces: 'Ir a + infinitive, which is how Spanish actually talks about ' +
            'tomorrow. The conjugated verb is ir; everything after it stays as it is.',
    hint: [['ir a', 'going to'], ['quedar con', 'to meet up with'],
           ['temprano', 'early'], ['luego', 'later']],
    model: ['Mañana voy a trabajar por la mañana.',
            'Voy a levantarme temprano, voy a comer con mi hermana y luego vamos ' +
            'a ver una película.'] },

  /* ── A2 ──────────────────────────────────────────────────*/
  { id: 'finde', level: 'a2', minutes: 4,
    ask: '¿Qué hiciste el fin de semana pasado?',
    en: 'Tell what you did last weekend, in order, with at least four verbs.',
    forces: 'The preterite across several verbs, including the irregular ones ' +
            'nobody escapes: fui, hice, estuve, tuve.',
    hint: [['ir', 'to go'], ['quedar', 'to arrange to meet'],
           ['tarde', 'late'], ['al final', 'in the end']],
    model: ['El sábado fui al cine con un amigo.',
            'El viernes salí tarde del trabajo y no hice nada. El sábado quedé ' +
            'con mi hermano y fuimos a la playa. El domingo estuve en casa todo ' +
            'el día.'] },

  { id: 'infancia', level: 'a2', minutes: 4,
    ask: '¿Cómo eras de niño o de niña?',
    en: 'Describe what you were like as a child, and what you used to do.',
    forces: 'The imperfect, which is what Spanish uses for "used to" and for how ' +
            'things were — era, tenía, jugaba — as against the preterite for what ' +
            'happened once.',
    hint: [['de niño', 'as a child'], ['jugar', 'to play'],
           ['tímido', 'shy'], ['siempre', 'always']],
    model: ['De niña era muy tímida y no hablaba mucho.',
            'Vivíamos en un pueblo pequeño. Jugaba en la calle todas las tardes ' +
            'y siempre volvía a casa tarde.'] },

  { id: 'viaje', level: 'a2', minutes: 4,
    ask: 'Cuenta un viaje que hiciste.',
    en: 'Tell about a trip: where, when, who with, and one thing that went wrong.',
    forces: 'The preterite for the events and the imperfect for the background, ' +
            'in the same paragraph. This is the pair English speakers get wrong ' +
            'most and for longest.',
    hint: [['el viaje', 'trip'], ['perder', 'to miss, to lose'],
           ['llegar', 'to arrive'], ['por suerte', 'luckily']],
    model: ['El año pasado fui a Portugal con mi hermana.',
            'Hace dos años fuimos a Lisboa en tren. Llovía cuando llegamos y ' +
            'perdimos el hotel dos veces, pero al final fue un viaje precioso.'] },

  { id: 'comparar', level: 'a2', minutes: 3,
    ask: 'Compara la ciudad donde vives con otra que conoces.',
    en: 'Compare where you live with somewhere else you know.',
    forces: 'Más que, menos que, tan como — and the four comparatives that refuse ' +
            'to follow the pattern: mejor, peor, mayor, menor.',
    hint: [['más que', 'more than'], ['tan como', 'as as'],
           ['barato', 'cheap'], ['ruidoso', 'noisy']],
    model: ['Madrid es más grande que mi ciudad.',
            'Madrid es mucho más ruidosa que Sevilla, pero el transporte es ' +
            'mejor y hay más cosas que hacer.'] },

  { id: 'trabajo', level: 'a2', minutes: 4,
    ask: '¿En qué trabajas, o qué te gustaría hacer?',
    en: 'Describe your job, or the job you would like, and why.',
    forces: 'Ser for what you are — soy profesora, with no article — and the ' +
            'reasons that follow it, which need porque and a full clause.',
    hint: [['el sueldo', 'salary'], ['el horario', 'hours, schedule'],
           ['encargarse de', 'to be in charge of'], ['duro', 'hard']],
    model: ['Soy profesora en una escuela pequeña.',
            'Trabajo en una oficina y me encargo de los clientes. El horario es ' +
            'duro, pero me gusta la gente con la que trabajo.'] },

  { id: 'problema', level: 'a2', minutes: 4,
    ask: 'Escribe una queja educada sobre algo que salió mal.',
    en: 'Write a polite complaint about something that went wrong.',
    forces: 'Being firm without being rude, which in Spanish means the conditional ' +
            'and an impersonal construction rather than an accusation: me gustaría, ' +
            'ha habido un error.',
    hint: [['la queja', 'complaint'], ['el error', 'mistake'],
           ['devolver', 'to return, refund'], ['agradecer', 'to be grateful for']],
    model: ['Creo que ha habido un error con mi pedido.',
            'Compré esta chaqueta la semana pasada y ha venido rota. Me gustaría ' +
            'cambiarla o que me devuelvan el dinero.'] },

  { id: 'consejo', level: 'a2', minutes: 3,
    ask: 'Un amigo va a visitar tu país. Dale tres consejos.',
    en: 'A friend is visiting your country. Give three pieces of advice.',
    forces: 'The tú command, which is the él form for regular verbs and a short ' +
            'irregular for the common ones: ven, pon, haz, ten, sal, di.',
    hint: [['traer', 'to bring'], ['evitar', 'to avoid'],
           ['el billete', 'ticket'], ['merecer la pena', 'to be worth it']],
    model: ['Trae un paraguas, porque llueve mucho.',
            'Compra los billetes de tren con tiempo, evita el centro los sábados ' +
            'y no te pierdas los pueblos pequeños. Merece la pena.'] },

  { id: 'salud', level: 'a2', minutes: 3,
    ask: 'Estás en el médico. Explica qué te pasa.',
    en: 'You are at the doctor. Explain what is wrong.',
    forces: 'Doler works like gustar — me duele la cabeza, not "tengo dolor de" ' +
            'as a first resort — and body parts take the article, not a possessive.',
    hint: [['doler', 'to hurt'], ['desde hace', 'for (a length of time)'],
           ['la garganta', 'throat'], ['la fiebre', 'fever']],
    model: ['Me duele la garganta desde hace tres días.',
            'Llevo una semana con fiebre y me duele todo el cuerpo. No he podido ' +
            'dormir bien.'] },

  /* ── B1 ──────────────────────────────────────────────────*/
  { id: 'opinion', level: 'b1', minutes: 5,
    ask: '¿Crees que las redes sociales han mejorado la vida de la gente?',
    en: 'Say whether you think social media has improved people’s lives, and why.',
    forces: 'Creo que takes the indicative and no creo que takes the subjunctive. ' +
            'Making the case then needs connectors: sin embargo, por un lado, aunque.',
    hint: [['sin embargo', 'however'], ['por un lado', 'on the one hand'],
           ['aunque', 'although'], ['darse cuenta de', 'to realise']],
    model: ['Creo que las redes sociales tienen cosas buenas y malas.',
            'Por un lado nos permiten hablar con gente que está lejos. Sin ' +
            'embargo, no creo que nos hagan más felices, y mucha gente se da ' +
            'cuenta demasiado tarde.'] },

  { id: 'ojala', level: 'b1', minutes: 4,
    ask: '¿Qué cambiarías de tu vida si pudieras?',
    en: 'What would you change about your life if you could?',
    forces: 'The whole si clause: si + imperfect subjunctive, then the ' +
            'conditional. Si pudiera, viviría — never "si podría".',
    hint: [['si pudiera', 'if I could'], ['mudarse', 'to move house'],
           ['arrepentirse', 'to regret'], ['el idioma', 'language']],
    model: ['Si pudiera, viviría en otro país.',
            'Si tuviera más tiempo, aprendería a tocar el piano. Y si hubiera ' +
            'empezado antes con los idiomas, ahora hablaría tres.'] },

  { id: 'recomendar', level: 'b1', minutes: 4,
    ask: 'Recomienda una película o un libro, y explica por qué.',
    en: 'Recommend a film or a book, and say why.',
    forces: 'Recomiendo que + subjunctive, and talking about a story without ' +
            'telling it: trata de, se trata de, va sobre.',
    hint: [['tratar de', 'to be about'], ['el guion', 'script'],
           ['merecer la pena', 'to be worth it'], ['el final', 'ending']],
    model: ['Te recomiendo una película española que vi el mes pasado.',
            'Trata de una familia que se separa durante la guerra. No es alegre, ' +
            'pero el final merece la pena y no se me ha olvidado.'] },

  { id: 'futuro', level: 'b1', minutes: 4,
    ask: '¿Cómo crees que será tu vida dentro de diez años?',
    en: 'How do you think your life will be in ten years?',
    forces: 'The real future tense, which Spanish keeps for prediction, and ' +
            'cuando + subjunctive for a time that has not happened: cuando tenga ' +
            'cuarenta años.',
    hint: [['dentro de', 'in (a length of time)'], ['seguir', 'to carry on'],
           ['probablemente', 'probably'], ['jubilarse', 'to retire']],
    model: ['Creo que dentro de diez años viviré en otra ciudad.',
            'Probablemente seguiré en el mismo trabajo, pero cuando tenga ' +
            'cuarenta años me gustaría trabajar menos horas y viajar más.'] },

  { id: 'desacuerdo', level: 'b1', minutes: 5,
    ask: 'Alguien dice que aprender idiomas ya no sirve de nada. Contéstale.',
    en: 'Someone says learning languages is pointless now. Answer them.',
    forces: 'Disagreeing without being rude, which needs a concession before the ' +
            'objection: entiendo que, es verdad que, pero no estoy de acuerdo en que ' +
            '+ subjunctive.',
    hint: [['estar de acuerdo', 'to agree'], ['servir para', 'to be useful for'],
           ['la herramienta', 'tool'], ['al fin y al cabo', 'at the end of the day']],
    model: ['No estoy de acuerdo. Un idioma no es solo una herramienta.',
            'Entiendo el argumento y es verdad que traducir es cada vez más ' +
            'fácil. Pero no creo que una máquina pueda darte lo que da hablar ' +
            'con alguien en su idioma.'] },

  { id: 'anecdota', level: 'b1', minutes: 5,
    ask: 'Cuenta la vez que peor lo pasaste en otro idioma.',
    en: 'Tell about the worst time you had in another language.',
    forces: 'A story with three pasts in it: the imperfect for the scene, the ' +
            'preterite for the events, and the pluperfect for what had already ' +
            'happened before them.',
    hint: [['darse cuenta', 'to realise'], ['la vergüenza', 'embarrassment'],
           ['equivocarse', 'to be wrong, to make a mistake'], ['nadie', 'nobody']],
    model: ['Una vez pedí algo en un restaurante y me trajeron otra cosa.',
            'Había estudiado el idioma dos años y creía que lo hablaba bien. ' +
            'Entonces pregunté algo en una tienda, nadie me entendió, y me di ' +
            'cuenta de que llevaba dos años pronunciándolo mal.'] }
];

PARLA.data.es.writingById = (function () {
  var m = {};
  PARLA.data.es.writing.forEach(function (w) { m[w.id] = w; });
  return m;
})();
