/* Parla — spaced repetition (SM-2)
 *
 * This is the piece Victor does not really have, and it is the difference
 * between "I recognise that word" and "I can say that word". Cards you get
 * wrong come back tomorrow; cards you nail disappear for months.
 *
 * Grades map to the four review buttons:
 *   0 again · 3 hard · 4 good · 5 easy
 */
window.PARLA = window.PARLA || {};

(function () {
  'use strict';

  var DAY = 86400000;
  var MIN_EASE = 1.3;
  var LEECH_AT = 6;   // lapses before a card is flagged as a leech

  function startOf(ts) {
    var d = new Date(ts == null ? Date.now() : ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function newCard() {
    return { ease: 2.5, interval: 0, due: startOf(), reps: 0, lapses: 0 };
  }

  /* Apply a grade to a card and return the updated card. */
  function grade(card, q, now) {
    card = card || newCard();
    now = now == null ? Date.now() : now;
    var c = {
      ease: card.ease || 2.5,
      interval: card.interval || 0,
      due: card.due || startOf(now),
      reps: card.reps || 0,
      lapses: card.lapses || 0
    };

    if (q < 3) {
      // Forgotten: reset the ladder but keep the ease penalty modest.
      c.reps = 0;
      c.lapses += 1;
      c.interval = 0;                       // relearn today
      c.ease = Math.max(MIN_EASE, c.ease - 0.2);
      c.due = startOf(now);
      c.relearn = true;
      return c;
    }

    c.relearn = false;
    c.reps += 1;
    if (c.reps === 1)      c.interval = 1;
    else if (c.reps === 2) c.interval = 6;
    else                   c.interval = Math.round(c.interval * c.ease) || 1;

    // Standard SM-2 ease adjustment.
    c.ease = c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (c.ease < MIN_EASE) c.ease = MIN_EASE;

    // Easy answers earn a bonus; hard ones are held back.
    if (q === 5) c.interval = Math.round(c.interval * 1.3);
    if (q === 3) c.interval = Math.max(1, Math.round(c.interval * 0.8));

    c.due = startOf(now) + c.interval * DAY;
    return c;
  }

  function isDue(card, now) {
    if (!card) return true;
    return (card.due || 0) <= startOf(now);
  }

  function isLeech(card) {
    return !!card && (card.lapses || 0) >= LEECH_AT;
  }

  /* Build today's queue: due cards first (oldest due first), then new cards.
   * `keys` is the full ordered pool; `deck` is the saved srs map. */
  function buildQueue(keys, deck, opts) {
    opts = opts || {};
    var now = opts.now == null ? Date.now() : opts.now;
    var maxNew = opts.maxNew == null ? 10 : opts.maxNew;
    var maxTotal = opts.maxTotal == null ? 30 : opts.maxTotal;

    var due = [], fresh = [];
    keys.forEach(function (k) {
      var card = deck[k];
      if (!card) fresh.push(k);
      else if (isDue(card, now)) due.push(k);
    });

    due.sort(function (a, b) { return (deck[a].due || 0) - (deck[b].due || 0); });

    var queue = due.slice(0, maxTotal);
    var room = Math.min(maxNew, maxTotal - queue.length);
    if (room > 0) queue = queue.concat(fresh.slice(0, room));
    return queue;
  }

  function stats(keys, deck, now) {
    var s = { total: keys.length, seen: 0, due: 0, fresh: 0, mature: 0, leeches: 0 };
    keys.forEach(function (k) {
      var c = deck[k];
      if (!c) { s.fresh++; return; }
      s.seen++;
      if (isDue(c, now)) s.due++;
      if ((c.interval || 0) >= 21) s.mature++;
      if (isLeech(c)) s.leeches++;
    });
    return s;
  }

  PARLA.srs = {
    newCard: newCard,
    grade: grade,
    isDue: isDue,
    isLeech: isLeech,
    buildQueue: buildQueue,
    stats: stats,
    GRADES: { again: 0, hard: 3, good: 4, easy: 5 }
  };
})();
