/* Parla — things to read
 *
 * The app could talk, drill, correct and coach, and had nothing at all to
 * read. That is a real gap: extended input is how vocabulary stops being
 * flashcards and starts being language, and it is the one activity a learner
 * will do voluntarily for twenty minutes.
 *
 * Twelve texts, graded A1 to B1. They are short stories rather than textbook
 * paragraphs, because "María va a la tienda" is not something anyone wants to
 * finish, and wanting to know what happens next is the only reliable engine
 * for reading in a language you do not speak.
 *
 * Each carries:
 *   lines   the text, one sentence per line, so audio and reveal work per line
 *   en      a translation per line, hidden until asked for
 *   ask     comprehension questions — meaning, not vocabulary recall
 *   words   the handful worth banking, with the sense used here
 *
 * Every sentence in this file has been run through the grammar checker.
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

PARLA.data.es.reading = [

  { id: 'perro', level: 'a1', minutes: 2, title: 'El perro del tercero',
    blurb: 'A dog on the stairs, and nobody claims it.',
    lines: [
      ['Hay un perro en la escalera.', 'There is a dog on the stairs.'],
      ['Es pequeño y está mojado.', 'It is small and it is wet.'],
      ['No tiene collar.', 'It has no collar.'],
      ['Llamo a la puerta del tercero.', 'I knock on the third-floor door.'],
      ['—¿Es tuyo este perro? —pregunto.', '"Is this dog yours?" I ask.'],
      ['—No —dice la señora—. Nunca he tenido perro.', '"No," says the woman. "I have never had a dog."'],
      ['Bajo al segundo. La misma respuesta.', 'I go down to the second floor. The same answer.'],
      ['El perro me sigue.', 'The dog follows me.'],
      ['Ahora está en mi cocina, comiendo pollo.', 'Now it is in my kitchen, eating chicken.'],
      ['Creo que ya tengo perro.', 'I think I have a dog now.']
    ],
    ask: [
      ['¿Dónde está el perro al principio?', 'En la escalera', ['En la cocina', 'En la calle']],
      ['¿De quién es el perro?', 'De nadie', ['De la señora del tercero', 'Del vecino del segundo']],
      ['¿Qué pasa al final?', 'El narrador se queda con el perro',
        ['El perro se va', 'La señora se lleva el perro']]
    ],
    words: [['la escalera', 'the stairs'], ['mojado', 'wet'], ['el collar', 'the collar'],
            ['seguir', 'to follow'], ['quedarse', 'to stay, to keep']]
  },

  { id: 'autobus', level: 'a1', minutes: 2, title: 'El último autobús',
    blurb: 'Almost home, and then not.',
    lines: [
      ['Son las once y media de la noche.', 'It is half past eleven at night.'],
      ['Estoy en la parada, solo.', 'I am at the stop, alone.'],
      ['Hace frío y no llevo abrigo.', 'It is cold and I am not wearing a coat.'],
      ['El autobús llega tarde, como siempre.', 'The bus arrives late, as always.'],
      ['Subo y me siento al fondo.', 'I get on and sit at the back.'],
      ['El conductor pone música muy baja.', 'The driver puts on music, very quietly.'],
      ['Cierro los ojos un momento.', 'I close my eyes for a moment.'],
      ['Cuando los abro, no conozco la calle.', 'When I open them, I do not recognise the street.'],
      ['He pasado mi parada.', 'I have missed my stop.'],
      ['El conductor me mira por el espejo y sonríe.', 'The driver looks at me in the mirror and smiles.'],
      ['—Te llevo —dice—. Vivo por aquí.', '"I will take you," he says. "I live around here."']
    ],
    ask: [
      ['¿Qué hora es?', 'Las once y media', ['Las diez y media', 'Las doce']],
      ['¿Por qué no reconoce la calle?', 'Se ha dormido', ['El autobús cambió de ruta', 'Es de noche']],
      ['¿Qué hace el conductor al final?', 'Se ofrece a llevarlo',
        ['Le pide dinero', 'Lo deja en la calle']]
    ],
    words: [['la parada', 'the stop'], ['el abrigo', 'the coat'], ['el fondo', 'the back'],
            ['el espejo', 'the mirror'], ['sonreír', 'to smile']]
  },

  { id: 'cocina', level: 'a1', minutes: 2, title: 'La receta de mi abuela',
    blurb: 'A recipe with one ingredient missing.',
    lines: [
      ['Mi abuela hace una tortilla perfecta.', 'My grandmother makes a perfect omelette.'],
      ['Solo lleva huevos, patatas, cebolla y sal.', 'It only has eggs, potatoes, onion and salt.'],
      ['La he visto cocinar cien veces.', 'I have watched her cook it a hundred times.'],
      ['Ayer lo intenté en mi casa.', 'Yesterday I tried it at my house.'],
      ['Compré los mismos huevos y las mismas patatas.', 'I bought the same eggs and the same potatoes.'],
      ['Seguí todos los pasos.', 'I followed every step.'],
      ['El resultado fue terrible.', 'The result was terrible.'],
      ['La llamé por teléfono.', 'I called her on the phone.'],
      ['—Abuela, ¿qué me falta?', '"Grandma, what am I missing?"'],
      ['—Paciencia —dijo—. Bajas el fuego y esperas.', '"Patience," she said. "You turn the heat down and you wait."']
    ],
    ask: [
      ['¿Qué lleva la tortilla?', 'Huevos, patatas, cebolla y sal',
        ['Huevos, queso y jamón', 'Solo huevos y patatas']],
      ['¿Qué le falta al narrador?', 'Paciencia', ['Un ingrediente secreto', 'Una sartén mejor']],
      ['¿Cómo lo descubre?', 'Llama a su abuela', ['Lo lee en un libro', 'Lo intenta otra vez']]
    ],
    words: [['la receta', 'the recipe'], ['la cebolla', 'the onion'], ['el paso', 'the step'],
            ['faltar', 'to be missing'], ['el fuego', 'the heat, the fire']]
  },

  { id: 'farmacia', level: 'a2', minutes: 3, title: 'En la farmacia',
    blurb: 'A word that means two things, at the worst moment.',
    lines: [
      ['Llevaba tres días con dolor de garganta.', 'I had had a sore throat for three days.'],
      ['Entré en la farmacia de la esquina.', 'I went into the pharmacy on the corner.'],
      ['Había mucha gente y esperé casi veinte minutos.', 'There were a lot of people and I waited nearly twenty minutes.'],
      ['Cuando llegó mi turno, quise explicar el problema.', 'When my turn came, I wanted to explain the problem.'],
      ['—Estoy constipado —dije, muy seguro de mí mismo.', '"I have a cold," I said, very sure of myself.'],
      ['La farmacéutica levantó una ceja.', 'The pharmacist raised an eyebrow.'],
      ['Yo pensaba que estaba diciendo otra cosa.', 'I thought I was saying something else.'],
      ['En inglés, esa palabra significa algo bastante distinto.', 'In English, that word means something rather different.'],
      ['Ella me dio un jarabe para la tos y sonrió.', 'She gave me a cough syrup and smiled.'],
      ['—Tranquilo —dijo—. Lo dijiste bien.', '"Relax," she said. "You said it right."'],
      ['Salí con el jarabe y con una palabra nueva que nunca voy a olvidar.',
       'I left with the syrup and with a new word I will never forget.']
    ],
    ask: [
      ['¿Cuánto tiempo llevaba enfermo?', 'Tres días', ['Una semana', 'Veinte minutos']],
      ['¿Por qué levantó la ceja la farmacéutica?', 'Porque el narrador creía haberse equivocado',
        ['Porque no lo entendió', 'Porque no tenía el medicamento']],
      ['¿Qué significa "constipado" en español?', 'Resfriado',
        ['Estreñido', 'Cansado']]
    ],
    words: [['la garganta', 'the throat'], ['el turno', 'the turn'], ['la ceja', 'the eyebrow'],
            ['el jarabe', 'the syrup'], ['la tos', 'the cough']]
  },

  { id: 'entrevista', level: 'a2', minutes: 3, title: 'La entrevista',
    blurb: 'The best answer he had, at the wrong question.',
    lines: [
      ['Me había preparado durante dos semanas.', 'I had prepared for two weeks.'],
      ['Sabía la historia de la empresa de memoria.', 'I knew the company history by heart.'],
      ['Llegué veinte minutos antes y esperé en la recepción.', 'I arrived twenty minutes early and waited in reception.'],
      ['El hombre que me entrevistó parecía cansado.', 'The man who interviewed me seemed tired.'],
      ['Me hizo tres preguntas fáciles y yo contesté muy bien.', 'He asked me three easy questions and I answered very well.'],
      ['Entonces cerró la carpeta y me miró.', 'Then he closed the folder and looked at me.'],
      ['—¿Por qué quiere trabajar aquí de verdad? —preguntó.', '"Why do you really want to work here?" he asked.'],
      ['Le conté lo que había preparado.', 'I told him what I had prepared.'],
      ['Él esperó. No dijo nada.', 'He waited. He said nothing.'],
      ['Después de un silencio largo, le dije la verdad.', 'After a long silence, I told him the truth.'],
      ['—Porque necesito el dinero y creo que se me daría bien.',
       '"Because I need the money and I think I would be good at it."'],
      ['Empiezo el lunes.', 'I start on Monday.']
    ],
    ask: [
      ['¿Cuánto tiempo se preparó?', 'Dos semanas', ['Dos días', 'Un mes']],
      ['¿Qué hizo el entrevistador después de la respuesta preparada?', 'Esperó en silencio',
        ['Se rió', 'Hizo otra pregunta']],
      ['¿Por qué consiguió el trabajo?', 'Porque al final fue sincero',
        ['Porque sabía la historia de la empresa', 'Porque llegó pronto']]
    ],
    words: [['la empresa', 'the company'], ['la carpeta', 'the folder'], ['contestar', 'to answer'],
            ['la verdad', 'the truth'], ['conseguir', 'to get, to manage']]
  },

  { id: 'apagon', level: 'a2', minutes: 3, title: 'El apagón',
    blurb: 'The building goes dark and everyone comes out.',
    lines: [
      ['Se fue la luz a las nueve de la noche.', 'The power went out at nine at night.'],
      ['Todo el edificio se quedó a oscuras.', 'The whole building went dark.'],
      ['Al principio nadie hizo nada.', 'At first nobody did anything.'],
      ['Después empezaron a abrirse las puertas.', 'Then doors started opening.'],
      ['Salimos todos al rellano con velas y linternas.', 'We all came out onto the landing with candles and torches.'],
      ['Conocí a mis vecinos de enfrente después de cuatro años.', 'I met my neighbours across the hall after four years.'],
      ['Se llaman Rosa y Miguel y tienen un gato enorme.', 'They are called Rosa and Miguel and they have an enormous cat.'],
      ['Alguien trajo vino. Alguien más trajo queso.', 'Somebody brought wine. Somebody else brought cheese.'],
      ['Estuvimos hablando en la escalera hasta la una.', 'We were talking on the stairs until one o\'clock.'],
      ['Cuando volvió la luz, nadie quería entrar en casa.', 'When the power came back, nobody wanted to go inside.'],
      ['Ahora nos saludamos todos los días.', 'Now we say hello to each other every day.']
    ],
    ask: [
      ['¿Qué pasó a las nueve?', 'Se fue la luz', ['Llegó un vecino', 'Empezó una fiesta']],
      ['¿A quién conoció el narrador?', 'A sus vecinos de enfrente',
        ['A Rosa solamente', 'Al portero']],
      ['¿Qué cambió después del apagón?', 'Los vecinos se saludan',
        ['Se mudó de piso', 'Compró un gato']]
    ],
    words: [['el apagón', 'the power cut'], ['a oscuras', 'in the dark'], ['el rellano', 'the landing'],
            ['la vela', 'the candle'], ['saludar', 'to greet']]
  },

  { id: 'partido', level: 'a2', minutes: 3, title: 'El partido del domingo',
    blurb: 'Watching a match with someone who does not watch the match.',
    lines: [
      ['Mi padre nunca ha entendido el fútbol.', 'My father has never understood football.'],
      ['Aun así, ve todos los partidos conmigo.', 'Even so, he watches every match with me.'],
      ['No pregunta quién gana ni quién marca.', 'He does not ask who is winning or who scores.'],
      ['Pregunta por qué ese chico está triste.', 'He asks why that boy is sad.'],
      ['O por qué el otro corre tanto si ya está cansado.', 'Or why the other one runs so much if he is already tired.'],
      ['Al principio me molestaba mucho.', 'At first it bothered me a lot.'],
      ['Ahora creo que ve el partido mejor que yo.', 'Now I think he watches the match better than I do.'],
      ['El domingo pasado perdimos tres a cero.', 'Last Sunday we lost three-nil.'],
      ['Yo estaba de mal humor y no hablaba.', 'I was in a bad mood and was not talking.'],
      ['Él apagó la tele y dijo:', 'He turned the television off and said:'],
      ['—Han jugado mal, pero han jugado juntos. Eso también cuenta.',
       '"They played badly, but they played together. That counts too."']
    ],
    ask: [
      ['¿Qué pregunta el padre durante los partidos?', 'Cosas sobre los jugadores',
        ['El resultado', 'Quién marca']],
      ['¿Cómo se sentía el narrador al principio?', 'Molesto', ['Contento', 'Aburrido']],
      ['¿Qué dice el padre al final?', 'Que jugar juntos también cuenta',
        ['Que el fútbol es aburrido', 'Que van a ganar la próxima vez']]
    ],
    words: [['el partido', 'the match'], ['marcar', 'to score'], ['molestar', 'to bother'],
            ['el humor', 'the mood'], ['apagar', 'to turn off']]
  },

  { id: 'mensaje', level: 'b1', minutes: 4, title: 'Un mensaje que no era para mí',
    blurb: 'A wrong number, answered honestly.',
    lines: [
      ['El mensaje llegó a las siete de la mañana de un número que no conocía.',
       'The message arrived at seven in the morning from a number I did not know.'],
      ['Decía: «Ya está. Se lo he dicho todo. Gracias por convencerme».',
       'It said: "That is that. I have told her everything. Thank you for convincing me."'],
      ['Me quedé mirando la pantalla un buen rato.', 'I sat looking at the screen for a good while.'],
      ['Podría haber escrito «creo que se ha equivocado» y olvidarlo.',
       'I could have written "I think you have the wrong number" and forgotten it.'],
      ['Pero alguien acababa de hacer algo difícil y creía que yo lo sabía.',
       'But somebody had just done something difficult and thought I knew about it.'],
      ['Escribí: «No sé quién eres, pero me alegro de que se lo hayas dicho».',
       'I wrote: "I do not know who you are, but I am glad you told her."'],
      ['Tardó diez minutos en contestar.', 'It took ten minutes to reply.'],
      ['«Ay, perdón. Número equivocado. Qué vergüenza».',
       '"Oh, sorry. Wrong number. How embarrassing."'],
      ['Y después, un minuto más tarde:', 'And then, a minute later:'],
      ['«Pero gracias igualmente. Hacía falta que alguien lo dijera».',
       '"But thank you anyway. Somebody needed to say it."'],
      ['No he vuelto a saber nada de esa persona.', 'I have never heard from that person again.'],
      ['Espero que le haya ido bien.', 'I hope it went well for them.']
    ],
    ask: [
      ['¿Por qué no ignoró el mensaje?', 'Porque alguien había hecho algo difícil',
        ['Porque conocía el número', 'Porque quería ayudar a un amigo']],
      ['¿Qué contestó la otra persona primero?', 'Que se había equivocado de número',
        ['Que estaba enfadada', 'Que quería hablar']],
      ['¿Qué dijo un minuto más tarde?', 'Que hacía falta que alguien lo dijera',
        ['Que no importaba', 'Que iba a llamar']]
    ],
    words: [['la pantalla', 'the screen'], ['equivocarse', 'to be wrong, to make a mistake'],
            ['alegrarse', 'to be glad'], ['la vergüenza', 'the embarrassment'],
            ['hacer falta', 'to be needed']]
  },

  { id: 'mudanza', level: 'b1', minutes: 4, title: 'La caja que no abrí',
    blurb: 'Four moves, and one box that never gets opened.',
    lines: [
      ['Me he mudado cuatro veces en seis años.', 'I have moved four times in six years.'],
      ['En cada mudanza hay una caja que no abro.', 'In every move there is one box I do not open.'],
      ['Va del salón de un piso al salón del siguiente sin que nadie la toque.',
       'It goes from the living room of one flat to the living room of the next without anyone touching it.'],
      ['Está marcada con una palabra: «varios».', 'It is marked with one word: "miscellaneous".'],
      ['La semana pasada, por fin, la abrí.', 'Last week, at last, I opened it.'],
      ['Dentro había cables de aparatos que ya no tengo.',
       'Inside there were cables for devices I no longer own.'],
      ['Había también un cuaderno del instituto y tres fotos.',
       'There was also a school notebook and three photographs.'],
      ['En una de ellas salgo yo con dieciséis años, en una playa, muerto de frío.',
       'In one of them I am sixteen, on a beach, freezing.'],
      ['No me acordaba de ese día en absoluto.', 'I did not remember that day at all.'],
      ['Ahora no puedo dejar de pensar en él.', 'Now I cannot stop thinking about it.'],
      ['He tirado los cables y he guardado las fotos.', 'I have thrown out the cables and kept the photographs.'],
      ['La caja está vacía y no pienso volver a llenarla.',
       'The box is empty and I do not intend to fill it again.']
    ],
    ask: [
      ['¿Cuántas veces se ha mudado?', 'Cuatro', ['Seis', 'Tres']],
      ['¿Qué había dentro de la caja?', 'Cables, un cuaderno y fotos',
        ['Ropa vieja', 'Libros del instituto']],
      ['¿Qué hizo al final?', 'Tiró los cables y guardó las fotos',
        ['Volvió a cerrar la caja', 'Tiró todo']]
    ],
    words: [['la mudanza', 'the move'], ['el cuaderno', 'the notebook'], ['acordarse', 'to remember'],
            ['tirar', 'to throw away'], ['vacío', 'empty']]
  },

  { id: 'taxi', level: 'b1', minutes: 4, title: 'El taxista que no hablaba',
    blurb: 'Forty minutes of silence, and one sentence at the end.',
    lines: [
      ['Cogí un taxi al aeropuerto a las cinco de la mañana.', 'I took a taxi to the airport at five in the morning.'],
      ['El conductor no dijo ni «buenos días».', 'The driver did not even say "good morning".'],
      ['Yo iba nervioso porque llegaba tarde y porque odio volar.',
       'I was nervous because I was late and because I hate flying.'],
      ['Durante cuarenta minutos no hablamos.', 'For forty minutes we did not speak.'],
      ['Puso la radio muy baja, música de los ochenta.', 'He put the radio on very low, eighties music.'],
      ['Yo miraba el móvil sin leer nada.', 'I was looking at my phone without reading anything.'],
      ['Cuando llegamos, saqué la tarjeta para pagar.', 'When we arrived, I got my card out to pay.'],
      ['Él se giró y me dijo, con mucha calma:', 'He turned round and said to me, very calmly:'],
      ['—Llega usted con tiempo de sobra. No corra.',
       '"You are here with plenty of time to spare. Do not run."'],
      ['No sé cómo sabía que lo necesitaba.', 'I do not know how he knew I needed that.'],
      ['Fue lo único que dijo en todo el trayecto y fue exactamente lo que hacía falta.',
       'It was the only thing he said in the whole journey and it was exactly what was needed.'],
      ['Llegué a la puerta de embarque andando.', 'I got to the gate walking.']
    ],
    ask: [
      ['¿Por qué estaba nervioso?', 'Llegaba tarde y odia volar',
        ['El taxista conducía mal', 'Había mucho tráfico']],
      ['¿Qué dijo el taxista?', 'Que tenía tiempo de sobra',
        ['Que iba a llegar tarde', 'Cuánto costaba']],
      ['¿Cómo llegó a la puerta de embarque?', 'Andando', ['Corriendo', 'En autobús']]
    ],
    words: [['el trayecto', 'the journey'], ['girarse', 'to turn round'], ['de sobra', 'to spare'],
            ['odiar', 'to hate'], ['el embarque', 'boarding']]
  },

  { id: 'vecina', level: 'a1', minutes: 2, title: 'La vecina de arriba',
    blurb: 'Someone upstairs walks at night.',
    lines: [
      ['Mi vecina de arriba camina por la noche.', 'My upstairs neighbour walks at night.'],
      ['La oigo a las dos, a las tres, a las cuatro.', 'I hear her at two, at three, at four.'],
      ['Siempre el mismo camino: cocina, salón, cocina.', 'Always the same route: kitchen, living room, kitchen.'],
      ['Al principio me enfadaba mucho.', 'At first it made me very angry.'],
      ['Un día la vi en el ascensor.', 'One day I saw her in the lift.'],
      ['Es muy mayor y lleva un bastón.', 'She is very old and uses a stick.'],
      ['Me dijo que no puede dormir desde que murió su marido.',
       'She told me she has not been able to sleep since her husband died.'],
      ['Ahora, cuando la oigo, no me enfado.', 'Now, when I hear her, I do not get angry.'],
      ['Pienso que hay alguien despierto encima de mí.',
       'I think that there is somebody awake above me.'],
      ['A veces eso ayuda.', 'Sometimes that helps.']
    ],
    ask: [
      ['¿Cuándo camina la vecina?', 'Por la noche', ['Por la mañana', 'Todo el día']],
      ['¿Por qué no puede dormir?', 'Murió su marido', ['Está enferma', 'Tiene miedo']],
      ['¿Cómo se siente el narrador al final?', 'Acompañado', ['Enfadado', 'Cansado']]
    ],
    words: [['el vecino', 'the neighbour'], ['enfadarse', 'to get angry'], ['el ascensor', 'the lift'],
            ['el bastón', 'the walking stick'], ['despierto', 'awake']]
  },

  { id: 'llaves', level: 'a1', minutes: 2, title: 'Las llaves',
    blurb: 'Locked out, with a plan.',
    lines: [
      ['He cerrado la puerta y las llaves están dentro.', 'I have shut the door and the keys are inside.'],
      ['Son las diez de la noche.', 'It is ten at night.'],
      ['No tengo dinero ni teléfono.', 'I have no money and no phone.'],
      ['Bajo a la calle y pienso.', 'I go down to the street and I think.'],
      ['El bar de la esquina todavía está abierto.', 'The bar on the corner is still open.'],
      ['El camarero me conoce.', 'The barman knows me.'],
      ['Le explico el problema.', 'I explain the problem to him.'],
      ['Me deja usar su teléfono y me da un café.', 'He lets me use his phone and gives me a coffee.'],
      ['Mi hermana llega media hora después con la copia.', 'My sister arrives half an hour later with the spare.'],
      ['El café estaba frío pero fue el mejor de mi vida.', 'The coffee was cold but it was the best of my life.']
    ],
    ask: [
      ['¿Dónde están las llaves?', 'Dentro de casa', ['En el bar', 'Las ha perdido']],
      ['¿Quién le ayuda primero?', 'El camarero', ['Su hermana', 'Un vecino']],
      ['¿Cómo entra en casa?', 'Su hermana trae otra llave',
        ['Rompe la ventana', 'Llama a un cerrajero']]
    ],
    words: [['la llave', 'the key'], ['el camarero', 'the waiter, barman'], ['dejar', 'to let, to leave'],
            ['la copia', 'the copy, the spare'], ['abierto', 'open']]
  }
];

PARLA.data.es.readingById = (function () {
  var m = {};
  PARLA.data.es.reading.forEach(function (r) { m[r.id] = r; });
  return m;
})();
