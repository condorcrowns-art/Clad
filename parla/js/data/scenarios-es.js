/* Parla — Spanish conversation scenarios
 *
 * Each scenario serves two masters:
 *   1. It briefs the LLM backends (role, setting, goals) so an AI partner
 *      stays in character and pushes toward the learning objective.
 *   2. Its `script` beats let the app hold a real conversation with NO AI at
 *      all — keyword matching walks the learner through the exchange. That is
 *      what makes the app work offline, instantly, at zero cost.
 *
 * Beat matching is accent- and case-insensitive (see brain.js normalise()).
 */
window.PARLA = window.PARLA || {};
PARLA.data = PARLA.data || {};
PARLA.data.es = PARLA.data.es || {};

PARLA.data.es.scenarios = [

  /* ── Food & drink ─────────────────────────────────────────── */
  {
    id: 'cafe', title: 'Ordering at a café', emoji: '☕', cat: 'Food & drink', level: 'a1',
    setting: 'A busy neighbourhood café in Madrid. You are standing at the counter.',
    role: 'Marta, a warm but brisk barista who has a queue behind you',
    voice: { gender: 'f', age: 'adult' },
    opener: { es: '¡Buenos días! ¿Qué le pongo?', en: 'Good morning! What can I get you?' },
    goals: ['Order a drink', 'Say whether it is to stay or take away', 'Ask how much it costs'],
    phrases: ['un café con leche, por favor', 'para llevar', '¿cuánto es?', 'para tomar aquí'],
    script: [
      { match: ['cafe', 'cortado', 'te', 'leche', 'americano', 'chocolate', 'zumo', 'quiero', 'quisiera', 'poner'],
        say: { es: 'Marchando. ¿Para tomar aquí o para llevar?', en: 'Coming right up. To have here or to take away?' } },
      { match: ['llevar', 'aqui', 'tomar', 'quedo', 'mesa'],
        say: { es: 'Perfecto. ¿Quiere algo de comer? Tenemos tostadas y croissants.', en: 'Perfect. Would you like something to eat? We have toast and croissants.' } },
      { match: ['no', 'nada', 'gracias', 'si', 'tostada', 'croissant', 'quiero'],
        say: { es: 'Muy bien. Son tres euros con veinte.', en: 'Very good. That comes to three twenty.' } },
      { match: ['cuanto', 'tarjeta', 'efectivo', 'euros', 'pagar', 'aqui tiene', 'toma'],
        say: { es: 'Gracias. Aquí tiene su cambio. ¡Que aproveche!', en: 'Thanks. Here is your change. Enjoy!' } }
    ],
    fallback: [
      { es: 'Perdone, ¿me lo repite? Hay mucho ruido aquí.', en: 'Sorry, could you repeat that? It is noisy in here.' },
      { es: '¿Un café entonces? Dígame qué quiere tomar.', en: 'A coffee then? Tell me what you would like to drink.' }
    ]
  },

  {
    id: 'restaurante', title: 'Dinner at a restaurant', emoji: '🍽️', cat: 'Food & drink', level: 'a2',
    setting: 'A mid-range restaurant at 21:00. You have just been seated.',
    role: 'Diego, an attentive waiter who happily recommends dishes',
    voice: { gender: 'm', age: 'young' },
    opener: { es: 'Buenas noches. Aquí tiene la carta. ¿Van a beber algo mientras deciden?', en: 'Good evening. Here is the menu. Would you like something to drink while you decide?' },
    goals: ['Order a drink and a main course', 'Ask what the waiter recommends', 'Ask for the bill'],
    phrases: ['¿qué me recomienda?', 'de primero voy a tomar...', 'la cuenta, por favor', 'soy alérgico a...'],
    script: [
      { match: ['agua', 'vino', 'cerveza', 'beber', 'tomar', 'refresco', 'nada'],
        say: { es: 'Muy bien. ¿Ya saben qué van a pedir o les doy un momento?', en: 'Very good. Do you know what you will order, or shall I give you a moment?' } },
      { match: ['recomienda', 'recomendacion', 'sugiere', 'bueno', 'especial', 'momento', 'minuto'],
        say: { es: 'Hoy el pescado está buenísimo, y la paella es la especialidad de la casa.', en: 'The fish is excellent today, and the paella is the house speciality.' } },
      { match: ['paella', 'pescado', 'pollo', 'carne', 'ensalada', 'sopa', 'quiero', 'voy a', 'tomar', 'primero'],
        say: { es: 'Excelente elección. ¿Y de postre? Tenemos flan casero.', en: 'Excellent choice. And for dessert? We have homemade flan.' } },
      { match: ['flan', 'postre', 'no', 'cafe', 'nada', 'gracias'],
        say: { es: 'Perfecto. Enseguida se lo traigo.', en: 'Perfect. I will bring it right over.' } },
      { match: ['cuenta', 'pagar', 'cobrar', 'tarjeta', 'propina'],
        say: { es: 'Claro, ahora mismo se la traigo. ¿Todo ha estado bien?', en: 'Of course, I will bring it right away. Was everything all right?' } }
    ],
    fallback: [
      { es: 'Disculpe, no le he entendido bien. ¿Me lo repite?', en: 'Sorry, I did not quite catch that. Could you repeat it?' },
      { es: '¿Quiere que le explique algún plato de la carta?', en: 'Would you like me to explain any dish on the menu?' }
    ]
  },

  {
    id: 'mercado', title: 'Shopping at the market', emoji: '🍅', cat: 'Food & drink', level: 'a2',
    setting: 'A covered market on a Saturday morning, at a fruit and vegetable stall.',
    role: 'Rosa, a chatty stallholder who likes to upsell',
    voice: { gender: 'f', age: 'older' },
    opener: { es: '¡Buenos días! ¿Qué le doy hoy? Los tomates están de temporada.', en: 'Good morning! What can I give you today? The tomatoes are in season.' },
    goals: ['Ask for a quantity of something', 'Ask the price per kilo', 'Politely decline an extra'],
    phrases: ['un kilo de...', 'medio kilo', '¿a cuánto está el kilo?', 'nada más, gracias'],
    script: [
      { match: ['kilo', 'quiero', 'deme', 'poner', 'tomate', 'manzana', 'naranja', 'patata', 'cebolla'],
        say: { es: 'Marchando. ¿Algo más? Las naranjas están dulcísimas hoy.', en: 'Coming up. Anything else? The oranges are so sweet today.' } },
      { match: ['naranja', 'si', 'tambien', 'no', 'nada mas', 'gracias', 'ya esta'],
        say: { es: 'Muy bien. Son cuatro con cincuenta en total.', en: 'Very good. That is four fifty in total.' } },
      { match: ['cuanto', 'precio', 'euros', 'esta el kilo', 'pagar', 'aqui tiene'],
        say: { es: 'Aquí tiene. ¡Gracias y hasta la próxima!', en: 'Here you go. Thanks and see you next time!' } }
    ],
    fallback: [
      { es: 'Perdone, ¿cuánto quiere? ¿Un kilo, medio kilo?', en: 'Sorry, how much would you like? A kilo, half a kilo?' }
    ]
  },

  /* ── Travel ───────────────────────────────────────────────── */
  {
    id: 'direcciones', title: 'Asking for directions', emoji: '🧭', cat: 'Travel', level: 'a1',
    setting: 'A street corner in an unfamiliar city. You stop a passer-by.',
    role: 'a helpful local in a slight hurry who gives clear, simple directions',
    voice: { gender: 'm', age: 'young' },
    opener: { es: 'Dígame, ¿en qué le puedo ayudar?', en: 'Tell me, how can I help you?' },
    goals: ['Ask where a place is', 'Ask if it is far', 'Confirm you understood'],
    phrases: ['¿dónde está...?', '¿está lejos de aquí?', 'todo recto', '¿puede repetir, por favor?'],
    script: [
      { match: ['donde', 'estacion', 'museo', 'plaza', 'banco', 'hotel', 'busco', 'llego', 'como'],
        say: { es: 'Está a unos diez minutos. Siga todo recto y gire a la izquierda en el semáforo.', en: 'It is about ten minutes away. Go straight ahead and turn left at the traffic light.' } },
      { match: ['lejos', 'cerca', 'minutos', 'andando', 'pie', 'autobus', 'metro'],
        say: { es: 'Se puede ir andando tranquilamente, no hace falta el autobús.', en: 'You can easily walk it, you do not need the bus.' } },
      { match: ['repetir', 'entendi', 'entiendo', 'despacio', 'otra vez', 'perdon'],
        say: { es: 'Claro: todo recto, y a la izquierda en el semáforo. No tiene pérdida.', en: 'Of course: straight ahead, then left at the light. You cannot miss it.' } },
      { match: ['gracias', 'vale', 'perfecto', 'muy amable', 'entendido'],
        say: { es: 'De nada. ¡Que tenga buen día!', en: 'You are welcome. Have a good day!' } }
    ],
    fallback: [
      { es: '¿Qué está buscando exactamente?', en: 'What exactly are you looking for?' }
    ]
  },

  {
    id: 'hotel', title: 'Checking into a hotel', emoji: '🏨', cat: 'Travel', level: 'a2',
    setting: 'The reception desk of a small hotel. You arrive with your suitcase.',
    role: 'Álvaro, a polite receptionist who uses formal usted throughout',
    voice: { gender: 'm', age: 'adult' },
    opener: { es: 'Buenas tardes, bienvenido. ¿Tiene una reserva?', en: 'Good afternoon, welcome. Do you have a reservation?' },
    goals: ['Give your name and confirm a reservation', 'Ask about breakfast and wifi', 'Ask what time checkout is'],
    phrases: ['tengo una reserva a nombre de...', '¿a qué hora es el desayuno?', '¿cuál es la contraseña del wifi?'],
    script: [
      { match: ['reserva', 'nombre', 'si', 'tengo', 'llamo', 'soy'],
        say: { es: 'Perfecto, la tengo aquí. Una habitación doble, tres noches. ¿Me deja su pasaporte?', en: 'Perfect, I have it here. A double room, three nights. May I have your passport?' } },
      { match: ['pasaporte', 'aqui tiene', 'claro', 'toma', 'documento'],
        say: { es: 'Gracias. Habitación 204, segunda planta. Aquí tiene la llave.', en: 'Thank you. Room 204, second floor. Here is your key.' } },
      { match: ['desayuno', 'wifi', 'contrasena', 'hora', 'incluido'],
        say: { es: 'El desayuno es de siete a diez, y la contraseña del wifi está en la tarjeta.', en: 'Breakfast is from seven to ten, and the wifi password is on the card.' } },
      { match: ['salida', 'checkout', 'irme', 'dejar', 'maleta', 'gracias'],
        say: { es: 'La salida es a las doce. Si necesita algo, estamos aquí. ¡Que disfrute!', en: 'Checkout is at twelve. If you need anything, we are here. Enjoy your stay!' } }
    ],
    fallback: [
      { es: '¿Me puede dar su nombre, por favor?', en: 'Could you give me your name, please?' }
    ]
  },

  {
    id: 'tren', title: 'Buying a train ticket', emoji: '🚆', cat: 'Travel', level: 'a2',
    setting: 'A ticket window at a train station. The next train leaves soon.',
    role: 'a ticket clerk behind glass who speaks quickly and practically',
    voice: { gender: 'f', age: 'adult' },
    opener: { es: 'Buenas. ¿Adónde viaja?', en: 'Hello. Where are you travelling to?' },
    goals: ['Say your destination', 'Ask for a return ticket', 'Ask which platform'],
    phrases: ['un billete a Sevilla', 'de ida y vuelta', '¿de qué andén sale?', '¿a qué hora sale?'],
    script: [
      { match: ['sevilla', 'madrid', 'barcelona', 'valencia', 'viajo', 'billete', 'quiero', 'voy'],
        say: { es: '¿Ida sola o ida y vuelta?', en: 'One way or return?' } },
      { match: ['ida', 'vuelta', 'solo', 'return', 'sencillo'],
        say: { es: 'Muy bien. El próximo sale a las once y cuarto. Son cuarenta y dos euros.', en: 'Very good. The next one leaves at quarter past eleven. That is forty-two euros.' } },
      { match: ['anden', 'via', 'hora', 'sale', 'cuando', 'tarjeta', 'pagar', 'euros'],
        say: { es: 'Andén cuatro. Le quedan doce minutos, dese prisa.', en: 'Platform four. You have twelve minutes, hurry.' } },
      { match: ['gracias', 'vale', 'perfecto', 'entendido'],
        say: { es: 'A usted. ¡Buen viaje!', en: 'Thank you. Have a good trip!' } }
    ],
    fallback: [
      { es: 'Perdone, ¿adónde quiere ir?', en: 'Sorry, where do you want to go?' }
    ]
  },

  {
    id: 'aeropuerto', title: 'A problem at the airport', emoji: '✈️', cat: 'Travel', level: 'b1',
    setting: 'An airline desk. Your connecting flight was cancelled.',
    role: 'a calm airline agent dealing with a long queue of upset passengers',
    voice: { gender: 'f', age: 'adult' },
    opener: { es: 'Buenas tardes. Ya veo que su vuelo se ha cancelado. ¿Cuál es su destino final?', en: 'Good afternoon. I see your flight has been cancelled. What is your final destination?' },
    goals: ['Explain your problem', 'Ask about alternatives', 'Ask about compensation or a hotel'],
    phrases: ['mi vuelo se ha cancelado', '¿hay otro vuelo hoy?', '¿quién paga el hotel?', 'tengo una conexión'],
    script: [
      { match: ['vuelo', 'destino', 'voy', 'conexion', 'perdi', 'cancelado', 'lisboa', 'paris'],
        say: { es: 'Entiendo. Puedo ponerle en el vuelo de mañana a las siete de la mañana.', en: 'I understand. I can put you on tomorrow morning’s flight at seven.' } },
      { match: ['hoy', 'antes', 'otro', 'alternativa', 'mañana', 'temprano', 'no puedo'],
        say: { es: 'Lo siento, hoy ya no queda nada. El de mañana es la primera opción disponible.', en: 'I am sorry, there is nothing left today. Tomorrow’s is the first available option.' } },
      { match: ['hotel', 'paga', 'compensacion', 'noche', 'dormir', 'derecho', 'dinero'],
        say: { es: 'La compañía le cubre el hotel y la cena. Aquí tiene los vales.', en: 'The airline covers your hotel and dinner. Here are the vouchers.' } },
      { match: ['maleta', 'equipaje', 'gracias', 'vale', 'entiendo'],
        say: { es: 'Su equipaje sigue facturado hasta destino. Lamento las molestias.', en: 'Your luggage stays checked through to your destination. Sorry for the inconvenience.' } }
    ],
    fallback: [
      { es: '¿Me puede explicar cuál es el problema exactamente?', en: 'Can you explain exactly what the problem is?' }
    ]
  },

  /* ── Shopping ─────────────────────────────────────────────── */
  {
    id: 'ropa', title: 'Buying clothes', emoji: '👕', cat: 'Shopping', level: 'a2',
    setting: 'A clothing shop. A sales assistant approaches you.',
    role: 'Lucía, a friendly shop assistant who wants to be helpful without pushing',
    voice: { gender: 'f', age: 'young' },
    opener: { es: '¡Hola! ¿Le puedo ayudar en algo?', en: 'Hi! Can I help you with anything?' },
    goals: ['Say what you are looking for', 'Ask for a different size or colour', 'Ask to try it on'],
    phrases: ['busco una camisa', '¿tiene una talla más grande?', '¿me lo puedo probar?', 'solo estoy mirando'],
    script: [
      { match: ['busco', 'camisa', 'pantalon', 'abrigo', 'zapatos', 'quiero', 'necesito', 'mirando'],
        say: { es: 'Claro, tenemos varios modelos. ¿Qué talla usa?', en: 'Of course, we have several styles. What size do you take?' } },
      { match: ['talla', 'mediana', 'grande', 'pequena', 'numero', 'no se'],
        say: { es: 'Perfecto. Este le quedaría muy bien. ¿Se lo quiere probar?', en: 'Perfect. This one would suit you well. Would you like to try it on?' } },
      { match: ['probar', 'si', 'probador', 'donde', 'color', 'otro'],
        say: { es: 'Los probadores están al fondo a la derecha.', en: 'The fitting rooms are at the back on the right.' } },
      { match: ['llevo', 'compro', 'gusta', 'no', 'grande', 'pequeno', 'aprieta', 'cuanto'],
        say: { es: 'Muy bien. Pase por caja cuando quiera. Son veintinueve noventa.', en: 'Very good. Come to the till whenever you like. That is twenty-nine ninety.' } }
    ],
    fallback: [
      { es: '¿Está buscando algo en concreto?', en: 'Are you looking for anything in particular?' }
    ]
  },

  {
    id: 'devolucion', title: 'Returning something', emoji: '🧾', cat: 'Shopping', level: 'b1',
    setting: 'The customer service desk. You bought something that does not fit.',
    role: 'a customer-service employee who follows the rules but is not unkind',
    voice: { gender: 'm', age: 'adult' },
    opener: { es: 'Buenas tardes, dígame.', en: 'Good afternoon, how can I help?' },
    goals: ['Explain you want to return an item', 'Say what is wrong with it', 'Ask for a refund or exchange'],
    phrases: ['quiero devolver esto', 'no me queda bien', '¿me pueden devolver el dinero?', 'aquí está el recibo'],
    script: [
      { match: ['devolver', 'cambiar', 'compre', 'esto', 'camisa', 'no me queda', 'problema'],
        say: { es: 'Sin problema. ¿Tiene el recibo?', en: 'No problem. Do you have the receipt?' } },
      { match: ['recibo', 'ticket', 'si', 'aqui', 'tengo', 'no tengo', 'perdi'],
        say: { es: 'Gracias. ¿Prefiere que le devuelva el dinero o cambiarlo por otra talla?', en: 'Thank you. Would you prefer a refund or to exchange it for another size?' } },
      { match: ['dinero', 'reembolso', 'cambiar', 'talla', 'otro', 'prefiero'],
        say: { es: 'Perfecto. Le hago la devolución a la misma tarjeta. Tarda unos días.', en: 'Perfect. I will refund it to the same card. It takes a few days.' } },
      { match: ['gracias', 'vale', 'cuando', 'dias', 'perfecto'],
        say: { es: 'A usted. Que tenga buen día.', en: 'Thank you. Have a good day.' } }
    ],
    fallback: [
      { es: '¿Qué problema ha tenido con el artículo?', en: 'What problem did you have with the item?' }
    ]
  },

  /* ── Social ───────────────────────────────────────────────── */
  {
    id: 'presentarse', title: 'Meeting someone new', emoji: '🤝', cat: 'Social', level: 'a1',
    setting: 'A friend’s birthday party. Someone sits down next to you.',
    role: 'Javi, a relaxed, curious person at the party who asks easy questions',
    voice: { gender: 'm', age: 'young' },
    opener: { es: '¡Hola! Creo que no nos conocemos. Yo soy Javi. ¿Y tú?', en: 'Hi! I do not think we have met. I am Javi. And you?' },
    goals: ['Introduce yourself', 'Say where you are from and what you do', 'Ask a question back'],
    phrases: ['me llamo...', 'soy de...', 'trabajo en...', '¿y tú a qué te dedicas?'],
    script: [
      { match: ['llamo', 'soy', 'hola', 'encantado', 'mucho gusto', 'nombre'],
        say: { es: 'Encantado. ¿Y de dónde eres? Tu acento no es de aquí.', en: 'Nice to meet you. And where are you from? Your accent is not from here.' } },
      { match: ['de', 'vengo', 'canada', 'estados unidos', 'inglaterra', 'vivo', 'nací'],
        say: { es: '¡Qué interesante! ¿Y qué haces? ¿Trabajas o estudias?', en: 'How interesting! And what do you do? Do you work or study?' } },
      { match: ['trabajo', 'estudio', 'soy', 'dedico', 'empresa', 'universidad'],
        say: { es: 'Qué bien. Yo soy diseñador, trabajo desde casa. ¿Cómo conoces a Ana?', en: 'Nice. I am a designer, I work from home. How do you know Ana?' } },
      { match: ['ana', 'amigo', 'trabajo', 'conozco', 'hermana', 'clase', 'y tu'],
        say: { es: 'Ah, mira qué casualidad. Oye, ¿quieres algo de beber?', en: 'Ah, what a coincidence. Hey, do you want something to drink?' } }
    ],
    fallback: [
      { es: 'Perdona, con la música no te oigo bien. ¿Cómo te llamas?', en: 'Sorry, I cannot hear you over the music. What is your name?' }
    ]
  },

  {
    id: 'planes', title: 'Making plans with a friend', emoji: '📅', cat: 'Social', level: 'a2',
    setting: 'A voice message exchange with a friend about the weekend.',
    role: 'Carmen, an old friend who is easygoing but has a busy schedule',
    voice: { gender: 'f', age: 'young' },
    opener: { es: '¡Ey! ¿Qué haces este fin de semana? ¿Hacemos algo?', en: 'Hey! What are you doing this weekend? Shall we do something?' },
    goals: ['Suggest an activity', 'Agree on a day and time', 'Agree on a place to meet'],
    phrases: ['¿qué tal si vamos al cine?', 'el sábado me viene bien', 'quedamos a las ocho', '¿dónde nos vemos?'],
    script: [
      { match: ['cine', 'cena', 'tomar', 'parque', 'museo', 'vamos', 'que tal si', 'podemos'],
        say: { es: '¡Me apunto! ¿Qué día te viene mejor, el sábado o el domingo?', en: 'I am in! Which day suits you better, Saturday or Sunday?' } },
      { match: ['sabado', 'domingo', 'viernes', 'mejor', 'puedo', 'viene bien'],
        say: { es: 'Vale, el sábado entonces. ¿A qué hora quedamos?', en: 'Okay, Saturday then. What time shall we meet?' } },
      { match: ['ocho', 'siete', 'nueve', 'hora', 'tarde', 'noche', 'quedamos'],
        say: { es: 'Perfecto. ¿Nos vemos en la plaza o paso a buscarte?', en: 'Perfect. Shall we meet in the square or shall I pick you up?' } },
      { match: ['plaza', 'casa', 'alli', 'buscar', 'vemos', 'vale', 'perfecto'],
        say: { es: '¡Genial! Nos vemos el sábado entonces. ¡Un beso!', en: 'Great! See you Saturday then. Take care!' } }
    ],
    fallback: [
      { es: 'Bueno, ¿tú qué quieres hacer? Yo me apunto a lo que sea.', en: 'Well, what do you want to do? I am up for anything.' }
    ]
  },

  {
    id: 'smalltalk', title: 'Small talk with a neighbour', emoji: '🏘️', cat: 'Social', level: 'a2',
    setting: 'You bump into your neighbour in the lift.',
    role: 'Doña Pilar, a chatty older neighbour who loves to talk about the weather and the building',
    voice: { gender: 'f', age: 'older' },
    opener: { es: '¡Anda, hola! ¡Qué calor hace hoy!, ¿verdad?', en: 'Oh, hello! It is so hot today, is it not?' },
    goals: ['Respond to small talk about the weather', 'Ask a polite question back', 'Say goodbye naturally'],
    phrases: ['sí, hace muchísimo calor', '¿qué tal está usted?', 'que tenga buen día', 'pues nada, hasta luego'],
    script: [
      { match: ['calor', 'si', 'verdad', 'mucho', 'frio', 'tiempo', 'horrible'],
        say: { es: 'Y que lo diga. ¿Qué tal le va todo? ¿Se ha instalado ya del todo?', en: 'You can say that again. How is everything going? Have you settled in completely?' } },
      { match: ['bien', 'tal', 'instalado', 'todavia', 'poco', 'gracias', 'usted'],
        say: { es: 'Me alegro. Si necesita cualquier cosa, estoy en el tercero.', en: 'I am glad. If you need anything, I am on the third floor.' } },
      { match: ['gracias', 'amable', 'vale', 'muy', 'igualmente'],
        say: { es: 'De nada, hija. Bueno, aquí me bajo. ¡Que tenga buen día!', en: 'You are welcome, dear. Well, this is my floor. Have a good day!' } }
    ],
    fallback: [
      { es: 'Perdone, ¿cómo dice? Estoy un poco sorda.', en: 'Sorry, what was that? I am a little hard of hearing.' }
    ]
  },

  /* ── Everyday admin ───────────────────────────────────────── */
  {
    id: 'medico', title: 'At the doctor', emoji: '🩺', cat: 'Health', level: 'a2',
    setting: 'A doctor’s consultation room. You have not been feeling well.',
    role: 'Dr. Ramos, a patient GP who asks one clear question at a time',
    voice: { gender: 'm', age: 'older' },
    opener: { es: 'Buenos días, siéntese. Cuénteme, ¿qué le pasa?', en: 'Good morning, have a seat. Tell me, what is wrong?' },
    goals: ['Describe a symptom', 'Say how long it has lasted', 'Understand the treatment'],
    phrases: ['me duele la cabeza', 'desde hace tres días', 'tengo fiebre', '¿tengo que tomar algo?'],
    script: [
      { match: ['duele', 'dolor', 'fiebre', 'mal', 'garganta', 'cabeza', 'estomago', 'tos', 'resfriado'],
        say: { es: 'Entiendo. ¿Desde cuándo se siente así?', en: 'I see. How long have you been feeling like this?' } },
      { match: ['dias', 'semana', 'ayer', 'desde', 'hace', 'anoche', 'lunes'],
        say: { es: '¿Y ha tenido fiebre? ¿Ha tomado algo ya?', en: 'And have you had a fever? Have you taken anything yet?' } },
      { match: ['fiebre', 'si', 'no', 'tomado', 'pastilla', 'nada', 'paracetamol'],
        say: { es: 'Muy bien. No parece grave. Le receto algo y debería mejorar en unos días.', en: 'All right. It does not seem serious. I will prescribe something and you should improve in a few days.' } },
      { match: ['receta', 'tomar', 'cuando', 'cuantas', 'veces', 'gracias', 'mejor'],
        say: { es: 'Una pastilla cada ocho horas, con comida. Y descanse. Si empeora, vuelva.', en: 'One tablet every eight hours, with food. And rest. If it gets worse, come back.' } }
    ],
    fallback: [
      { es: 'Dígame qué síntomas tiene exactamente.', en: 'Tell me exactly what symptoms you have.' }
    ]
  },

  {
    id: 'farmacia', title: 'At the pharmacy', emoji: '💊', cat: 'Health', level: 'a2',
    setting: 'A pharmacy counter. You need something for a minor problem.',
    role: 'a pharmacist who gives quick practical advice',
    voice: { gender: 'f', age: 'adult' },
    opener: { es: 'Hola, buenas. ¿Qué necesita?', en: 'Hello. What do you need?' },
    goals: ['Describe what you need', 'Ask if you need a prescription', 'Understand the dosage'],
    phrases: ['necesito algo para el dolor de garganta', '¿hace falta receta?', '¿cada cuánto lo tomo?'],
    script: [
      { match: ['necesito', 'algo', 'para', 'dolor', 'garganta', 'cabeza', 'tos', 'alergia'],
        say: { es: 'Le puedo dar esto, es lo más efectivo sin receta.', en: 'I can give you this, it is the most effective one without a prescription.' } },
      { match: ['receta', 'hace falta', 'necesito', 'sin', 'cuanto', 'precio'],
        say: { es: 'No, para esto no hace falta. Son seis euros con ochenta.', en: 'No, you do not need one for this. That is six eighty.' } },
      { match: ['tomo', 'cuanto', 'veces', 'dia', 'cuando', 'comida'],
        say: { es: 'Cada ocho horas, después de las comidas. No más de tres al día.', en: 'Every eight hours, after meals. No more than three a day.' } },
      { match: ['gracias', 'vale', 'perfecto', 'entendido'],
        say: { es: 'A usted. Que se mejore.', en: 'You are welcome. Get well soon.' } }
    ],
    fallback: [
      { es: '¿Para qué lo necesita exactamente?', en: 'What exactly do you need it for?' }
    ]
  },

  {
    id: 'telefono', title: 'A phone call you did not expect', emoji: '📞', cat: 'Everyday', level: 'b1',
    setting: 'Your phone rings with an unknown number. It is about a delivery.',
    role: 'a delivery driver who is outside, in a hurry, and hard to hear',
    voice: { gender: 'm', age: 'adult' },
    opener: { es: '¿Sí? Buenas, llamo del reparto. Estoy en la puerta y no contesta nadie.', en: 'Hello? Hi, I am calling from the delivery service. I am at the door and nobody is answering.' },
    goals: ['Explain you are not home', 'Propose a solution', 'Confirm the new arrangement'],
    phrases: ['no estoy en casa ahora mismo', '¿puede dejarlo con el portero?', '¿puede volver mañana?'],
    script: [
      { match: ['no estoy', 'casa', 'trabajo', 'fuera', 'ahora', 'puedo'],
        say: { es: 'Vaya. ¿Y qué hago con el paquete? Tengo más entregas.', en: 'Oh dear. What do I do with the parcel? I have more deliveries.' } },
      { match: ['portero', 'vecino', 'buzon', 'dejar', 'manana', 'volver', 'puede'],
        say: { es: 'Vale, se lo dejo al portero entonces. ¿Me confirma el número de piso?', en: 'Okay, I will leave it with the porter then. Can you confirm your flat number?' } },
      { match: ['piso', 'segundo', 'tercero', 'numero', 'puerta', 'es el'],
        say: { es: 'Perfecto, apuntado. Le llegará un mensaje de confirmación.', en: 'Perfect, noted. You will get a confirmation message.' } },
      { match: ['gracias', 'vale', 'perfecto', 'disculpe'],
        say: { es: 'Nada, hasta luego.', en: 'No worries, goodbye.' } }
    ],
    fallback: [
      { es: 'Perdone, no le oigo bien. ¿Me lo repite más alto?', en: 'Sorry, I cannot hear you well. Could you repeat that louder?' }
    ]
  },

  {
    id: 'piso', title: 'Viewing an apartment', emoji: '🔑', cat: 'Everyday', level: 'b1',
    setting: 'You are viewing a flat you might rent. The landlord shows you around.',
    role: 'a landlord who is friendly but evasive about the small print',
    voice: { gender: 'm', age: 'older' },
    opener: { es: 'Pase, pase. Este es el salón. ¿Qué le parece?', en: 'Come in, come in. This is the living room. What do you think?' },
    goals: ['React to the flat', 'Ask about the rent and bills', 'Ask a practical question'],
    phrases: ['me gusta mucho', '¿cuánto es el alquiler?', '¿están incluidos los gastos?', '¿hay calefacción?'],
    script: [
      { match: ['gusta', 'bonito', 'grande', 'luminoso', 'parece', 'bien', 'pequeno'],
        say: { es: 'Sí, es muy luminoso. La cocina está reformada y hay ascensor.', en: 'Yes, it is very bright. The kitchen has been renovated and there is a lift.' } },
      { match: ['alquiler', 'cuanto', 'precio', 'mes', 'euros', 'cuesta'],
        say: { es: 'Son novecientos al mes, más gastos.', en: 'It is nine hundred a month, plus bills.' } },
      { match: ['gastos', 'incluido', 'agua', 'luz', 'internet', 'calefaccion', 'fianza'],
        say: { es: 'Agua y comunidad van aparte. La fianza es de dos meses.', en: 'Water and building fees are separate. The deposit is two months.' } },
      { match: ['pensar', 'aviso', 'interesa', 'gracias', 'llamo', 'decidir'],
        say: { es: 'Claro, tómese su tiempo. Pero hay más gente interesada, eh.', en: 'Of course, take your time. But there are other interested people, mind you.' } }
    ],
    fallback: [
      { es: '¿Tiene alguna pregunta sobre el piso?', en: 'Do you have any questions about the flat?' }
    ]
  },

  {
    id: 'trabajo', title: 'A job interview', emoji: '💼', cat: 'Work', level: 'b1',
    setting: 'A job interview for a role you actually want.',
    role: 'Elena, a hiring manager who asks open questions and follows up',
    voice: { gender: 'f', age: 'adult' },
    opener: { es: 'Gracias por venir. Cuénteme un poco sobre usted.', en: 'Thanks for coming. Tell me a little about yourself.' },
    goals: ['Introduce your background', 'Explain why you want the job', 'Ask a question about the role'],
    phrases: ['tengo experiencia en...', 'me interesa mucho este puesto', '¿cómo sería un día normal?'],
    script: [
      { match: ['soy', 'trabajo', 'experiencia', 'anos', 'estudie', 'llevo', 'dedico'],
        say: { es: 'Muy interesante. ¿Y por qué le interesa este puesto en concreto?', en: 'Very interesting. And why are you interested in this position specifically?' } },
      { match: ['interesa', 'porque', 'empresa', 'quiero', 'busco', 'creo', 'aprender'],
        say: { es: 'Bien. ¿Cómo se maneja usted trabajando en equipo?', en: 'Good. How do you handle working in a team?' } },
      { match: ['equipo', 'compañeros', 'colaborar', 'bien', 'trabajar', 'comunico'],
        say: { es: 'Perfecto. ¿Tiene alguna pregunta para mí?', en: 'Perfect. Do you have any questions for me?' } },
      { match: ['pregunta', 'dia', 'horario', 'equipo', 'sueldo', 'empezar', 'cuando', 'si'],
        say: { es: 'Buena pregunta. Le contamos todo en la segunda entrevista. Le llamamos esta semana.', en: 'Good question. We will explain everything in the second interview. We will call you this week.' } }
    ],
    fallback: [
      { es: 'Tómese su tiempo. Cuénteme lo que quiera destacar de su perfil.', en: 'Take your time. Tell me whatever you would like to highlight about your background.' }
    ]
  },

  {
    id: 'reunion', title: 'Speaking up in a meeting', emoji: '🗣️', cat: 'Work', level: 'b1',
    setting: 'A team meeting where you need to give an opinion.',
    role: 'Tomás, a team lead who invites input and gently challenges it',
    voice: { gender: 'm', age: 'adult' },
    opener: { es: 'Bueno, ya habéis visto los números. ¿Qué opináis?', en: 'Right, you have all seen the numbers. What do you think?' },
    goals: ['Give an opinion', 'Agree or disagree politely', 'Propose something concrete'],
    phrases: ['en mi opinión...', 'no estoy del todo de acuerdo', 'yo propondría...', '¿puedo añadir algo?'],
    script: [
      { match: ['creo', 'opinion', 'pienso', 'parece', 'diria', 'veo'],
        say: { es: 'Entiendo tu punto. Pero, ¿no crees que eso nos retrasaría?', en: 'I see your point. But do you not think that would slow us down?' } },
      { match: ['acuerdo', 'razon', 'pero', 'no creo', 'quiza', 'entiendo', 'cierto'],
        say: { es: 'Vale. ¿Y qué propondrías tú en concreto?', en: 'Okay. And what would you propose specifically?' } },
      { match: ['propongo', 'propondria', 'podriamos', 'hacer', 'sugiero', 'primero'],
        say: { es: 'Me gusta. Lo llevamos a la próxima reunión. ¿Lo preparas tú?', en: 'I like it. We will take it to the next meeting. Will you prepare it?' } },
      { match: ['si', 'claro', 'vale', 'preparo', 'puedo', 'sin problema'],
        say: { es: 'Genial, gracias. Pasamos al siguiente punto.', en: 'Great, thanks. Let us move to the next item.' } }
    ],
    fallback: [
      { es: '¿Alguna idea? Cualquier opinión vale.', en: 'Any thoughts? Any opinion is welcome.' }
    ]
  },

  /* ── Problems & repair ────────────────────────────────────── */
  {
    id: 'queja', title: 'Making a complaint', emoji: '😤', cat: 'Everyday', level: 'b1',
    setting: 'Your order arrived wrong and you are back at the counter.',
    role: 'a manager who is defensive at first but comes around if you stay polite',
    voice: { gender: 'f', age: 'adult' },
    opener: { es: 'Dígame, ¿cuál es el problema?', en: 'Tell me, what is the problem?' },
    goals: ['State the problem clearly', 'Stay polite while insisting', 'Get a solution'],
    phrases: ['esto no es lo que pedí', 'me gustaría hablar con el encargado', '¿me lo pueden cambiar?'],
    script: [
      { match: ['no es', 'pedi', 'problema', 'equivocado', 'mal', 'frio', 'roto'],
        say: { es: 'Ah, pues aquí pone lo que se pidió. ¿Está seguro?', en: 'Ah, well it says here what was ordered. Are you sure?' } },
      { match: ['seguro', 'si', 'pedi', 'claramente', 'mire', 'recibo', 'dije'],
        say: { es: 'Vale, déjeme comprobarlo... Tiene razón, ha sido un error nuestro.', en: 'Okay, let me check... You are right, it was our mistake.' } },
      { match: ['cambiar', 'devolver', 'solucion', 'hacer', 'dinero', 'otro'],
        say: { es: 'Se lo cambiamos ahora mismo y le invitamos al postre. Disculpe las molestias.', en: 'We will change it right now and the dessert is on us. Sorry for the trouble.' } },
      { match: ['gracias', 'vale', 'perfecto', 'amable'],
        say: { es: 'Gracias a usted por la paciencia.', en: 'Thank you for your patience.' } }
    ],
    fallback: [
      { es: 'Explíqueme qué ha pasado exactamente, por favor.', en: 'Explain to me exactly what happened, please.' }
    ]
  },

  {
    id: 'banco', title: 'At the bank', emoji: '🏦', cat: 'Everyday', level: 'b1',
    setting: 'A bank branch. You need to sort out an account problem.',
    role: 'a bank employee who needs to verify everything before helping',
    voice: { gender: 'm', age: 'adult' },
    opener: { es: 'Buenos días, siéntese. ¿En qué le puedo ayudar?', en: 'Good morning, take a seat. How can I help you?' },
    goals: ['Explain what you need', 'Answer identity questions', 'Understand the next step'],
    phrases: ['quiero abrir una cuenta', 'mi tarjeta no funciona', 'aquí tiene mi documento', '¿cuánto tarda?'],
    script: [
      { match: ['cuenta', 'tarjeta', 'abrir', 'problema', 'funciona', 'transferencia', 'quiero'],
        say: { es: 'Entiendo. ¿Me deja su documento de identidad, por favor?', en: 'I see. May I have your ID document, please?' } },
      { match: ['documento', 'pasaporte', 'aqui', 'tiene', 'dni', 'claro'],
        say: { es: 'Gracias. ¿Y me confirma su dirección actual?', en: 'Thank you. And can you confirm your current address?' } },
      { match: ['calle', 'vivo', 'direccion', 'numero', 'es'],
        say: { es: 'Perfecto, todo correcto. Lo tramito ahora mismo.', en: 'Perfect, everything is correct. I will process it right now.' } },
      { match: ['tarda', 'cuando', 'cuanto', 'listo', 'gracias', 'vale'],
        say: { es: 'Entre tres y cinco días hábiles. Le avisamos por mensaje.', en: 'Between three and five working days. We will notify you by message.' } }
    ],
    fallback: [
      { es: '¿Me puede explicar un poco mejor qué necesita?', en: 'Could you explain a bit more clearly what you need?' }
    ]
  },

  {
    id: 'emergencia', title: 'An emergency', emoji: '🚨', cat: 'Health', level: 'b1',
    setting: 'Someone has fallen in the street. You call for help.',
    role: 'an emergency dispatcher who needs precise information fast',
    voice: { gender: 'f', age: 'adult' },
    opener: { es: 'Emergencias, dígame. ¿Qué ha ocurrido?', en: 'Emergency services, go ahead. What has happened?' },
    goals: ['Describe the emergency', 'Give the location', 'Follow instructions'],
    phrases: ['ha habido un accidente', 'estoy en la calle...', 'necesitamos una ambulancia', 'está consciente'],
    script: [
      { match: ['accidente', 'caido', 'herido', 'ambulancia', 'ayuda', 'persona', 'senora', 'senor'],
        say: { es: 'De acuerdo. ¿Dónde se encuentra exactamente?', en: 'All right. Where exactly are you?' } },
      { match: ['calle', 'plaza', 'esquina', 'cerca', 'estoy', 'avenida', 'numero'],
        say: { es: 'Ya envío una ambulancia. ¿La persona está consciente? ¿Respira?', en: 'I am sending an ambulance. Is the person conscious? Are they breathing?' } },
      { match: ['consciente', 'respira', 'si', 'no', 'habla', 'responde', 'sangre'],
        say: { es: 'No la mueva. Quédese con ella y hable con ella. Llegamos en cinco minutos.', en: 'Do not move them. Stay with them and keep talking to them. We arrive in five minutes.' } },
      { match: ['vale', 'entendido', 'gracias', 'aqui', 'espero'],
        say: { es: 'Bien. No cuelgue, por favor, sigo con usted.', en: 'Good. Do not hang up, please, I am staying on with you.' } }
    ],
    fallback: [
      { es: 'Necesito que me diga qué ha pasado y dónde está.', en: 'I need you to tell me what happened and where you are.' }
    ]
  },

  /* ── Free conversation ────────────────────────────────────── */
  {
    id: 'libre', title: 'Free conversation', emoji: '💬', cat: 'Open', level: 'a2',
    setting: 'A relaxed chat with no agenda. Talk about whatever you like.',
    role: 'a patient conversation partner who asks follow-up questions and keeps the chat going',
    voice: { gender: 'f', age: 'young' },
    opener: { es: '¡Hola! ¿De qué quieres hablar hoy?', en: 'Hi! What do you want to talk about today?' },
    goals: ['Keep a conversation going for five turns', 'Ask at least one question', 'Use a past tense'],
    phrases: ['hoy quiero hablar de...', '¿y tú qué piensas?', 'el fin de semana pasado...'],
    script: [
      { match: [],
        say: { es: 'Cuéntame más sobre eso. ¿Por qué te interesa?', en: 'Tell me more about that. Why does it interest you?' } },
      { match: [],
        say: { es: 'Qué curioso. ¿Y cuándo fue la última vez que lo hiciste?', en: 'How interesting. And when was the last time you did it?' } },
      { match: [],
        say: { es: 'Entiendo. ¿Y qué harías si tuvieras más tiempo libre?', en: 'I see. And what would you do if you had more free time?' } },
      { match: [],
        say: { es: 'Tiene sentido. Cambiando de tema, ¿qué tal tu semana?', en: 'That makes sense. Changing the subject, how has your week been?' } }
    ],
    fallback: [
      { es: 'Puedes hablarme de tu día, de tus planes, de lo que quieras.', en: 'You can tell me about your day, your plans, whatever you like.' }
    ]
  },

  {
    id: 'debate', title: 'Defending an opinion', emoji: '⚖️', cat: 'Open', level: 'b2',
    setting: 'A friendly but real disagreement. Your partner pushes back on what you say.',
    role: 'a sharp but good-natured debater who always asks "¿por qué?" and offers a counter-argument',
    voice: { gender: 'm', age: 'young' },
    opener: { es: 'Te propongo un tema: ¿es mejor vivir en la ciudad o en el campo? Dime qué opinas y por qué.', en: 'Here is a topic: is it better to live in the city or the countryside? Tell me what you think and why.' },
    goals: ['State a position with a reason', 'Handle a counter-argument', 'Concede a point without giving up'],
    phrases: ['en mi opinión...', 'por un lado... por otro lado...', 'entiendo tu punto, pero...', 'tienes razón en que...'],
    script: [
      { match: [],
        say: { es: 'Interesante. Pero, ¿no crees que eso depende mucho de la situación de cada uno?', en: 'Interesting. But do you not think that depends a lot on each person’s situation?' } },
      { match: [],
        say: { es: 'Ya, aunque yo diría lo contrario. ¿Qué le responderías a alguien que piensa así?', en: 'Right, though I would say the opposite. What would you say to someone who thinks that way?' } },
      { match: [],
        say: { es: 'Buen argumento. ¿Y hay algo que te haría cambiar de opinión?', en: 'Good argument. And is there anything that would change your mind?' } },
      { match: [],
        say: { es: 'Me convences a medias. Resúmeme tu postura en una frase.', en: 'You half convince me. Sum up your position in one sentence.' } }
    ],
    fallback: [
      { es: 'Da igual la postura, defiéndela. ¿Qué prefieres tú?', en: 'The position does not matter, just defend it. Which do you prefer?' }
    ]
  }

];
