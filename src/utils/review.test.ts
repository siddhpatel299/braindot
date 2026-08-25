/**
 * Checks for the review scheduler.
 *
 * Run with:  npm run check:review
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * The scheduler decides when you see a thing again, and it is the kind of
 * arithmetic that is wrong quietly — an off-by-one in the calendar or an ease
 * that drifts below its floor does not throw, it just teaches you badly for a
 * year. So the day arithmetic is checked across the seams (month ends, leap
 * day, both daylight-saving transitions) and every grade is walked end to end.
 */

import {
  dateKey, addDays, daysBetween,
  newReviewState, schedule, isLearning, isDue, overdueBy,
  dueQueue, reviewSummary, spreadFuzz,
  MIN_EASE, DEFAULT_EASE, GRADUATING_STEPS, MAX_INTERVAL_DAYS,
  type ReviewState, type Grade,
} from './review.ts';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

/** Walk a state through a run of grades from one day, letting the due date
 *  carry the clock forward — i.e. reviewing exactly when asked to. */
function run(grades: Grade[], from = '2026-01-01'): ReviewState {
  let state = newReviewState(from);
  let today = from;
  for (const g of grades) {
    state = schedule(state, g, today);
    today = state.due;
  }
  return state;
}

/* ============================================================
   The calendar

   Everything downstream is "today plus N days". If this is wrong the whole
   schedule is wrong, and it is wrong exactly twice a year.
   ============================================================ */

eq('a date key is zero-padded', dateKey(new Date(2026, 0, 5, 9, 0, 0)), '2026-01-05');
eq('adding zero days is a no-op', addDays('2026-01-05', 0), '2026-01-05');
eq('adding crosses a month end', addDays('2026-01-31', 1), '2026-02-01');
eq('adding crosses a year end', addDays('2026-12-31', 1), '2027-01-01');
eq('subtracting crosses a month start', addDays('2026-03-01', -1), '2026-02-28');
eq('a leap day exists in 2028', addDays('2028-02-28', 1), '2028-02-29');
eq('a non-leap February has 28 days', addDays('2026-02-28', 1), '2026-03-01');
eq('a long interval lands correctly', addDays('2026-01-01', 365), '2027-01-01');

/* Daylight saving. In the northern spring a day is 23 hours long and in the
   autumn 25; midnight arithmetic slips by one across both. Noon does not. */
eq('spring forward keeps the date', addDays('2026-03-07', 1), '2026-03-08');
eq('spring forward spans the change', addDays('2026-03-07', 2), '2026-03-09');
eq('autumn back keeps the date', addDays('2026-10-31', 1), '2026-11-01');
eq('autumn back spans the change', addDays('2026-10-31', 2), '2026-11-02');

eq('days between counts forward', daysBetween('2026-01-01', '2026-01-08'), 7);
eq('days between counts backward', daysBetween('2026-01-08', '2026-01-01'), -7);
eq('days between a day and itself is zero', daysBetween('2026-05-05', '2026-05-05'), 0);
eq('days between spans daylight saving', daysBetween('2026-03-07', '2026-03-09'), 2);

/* ============================================================
   A new item

   Enrolled today, due today. Nothing is scheduled into the future on no
   evidence at all.
   ============================================================ */

const fresh = newReviewState('2026-01-01');
eq('a new item is due the day it is enrolled', fresh.due, '2026-01-01');
eq('a new item has no interval yet', fresh.intervalDays, 0);
eq('a new item starts at the default ease', fresh.ease, DEFAULT_EASE);
eq('a new item has never been reviewed', fresh.lastReviewed, null);
check('a new item is due now', isDue(fresh, '2026-01-01'));
check('a new item is in learning', isLearning(fresh));

/* ============================================================
   The graduating steps

   Before an item is learned it walks fixed gaps. Multiplying an interval of
   zero would throw a first-time 'easy' months into the future on the strength
   of one answer.
   ============================================================ */

const step1 = schedule(fresh, 'good', '2026-01-01');
eq('the first good recall waits one night', step1.intervalDays, GRADUATING_STEPS[0]);
eq('...and is due the next day', step1.due, '2026-01-02');
eq('...and counts as a rep', step1.reps, 1);
eq('...and records the day it was seen', step1.lastReviewed, '2026-01-01');
check('...and is still learning', isLearning(step1));

const step2 = schedule(step1, 'good', '2026-01-02');
eq('the second good recall waits three', step2.intervalDays, GRADUATING_STEPS[1]);
eq('...and is due three days on', step2.due, '2026-01-05');
check('...and has now graduated', !isLearning(step2));

const graduated = schedule(step2, 'good', '2026-01-05');
eq('the first graduated interval multiplies by ease', graduated.intervalDays, Math.round(3 * DEFAULT_EASE));
eq('...which is 8 days', graduated.intervalDays, 8);
eq('...due on the 13th', graduated.due, '2026-01-13');

/* An 'easy' while still learning is earned, but must not be extrapolated. */
const easyEarly = schedule(fresh, 'easy', '2026-01-01');
eq('an early easy leaves at the last step, not beyond', easyEarly.intervalDays, GRADUATING_STEPS[GRADUATING_STEPS.length - 1]);
check('an early easy raises the ease', easyEarly.ease > DEFAULT_EASE);

/* ============================================================
   Growth

   'good' multiplies by ease and leaves ease alone. That is what makes ease a
   record of how hard the item is rather than of how often the middle button
   was pressed.
   ============================================================ */

const settled = run(['good', 'good', 'good', 'good']);
eq('ease is unchanged by a run of good recalls', settled.ease, DEFAULT_EASE);
eq('four good recalls reach 20 days', settled.intervalDays, 20);
eq('...over four reps', settled.reps, 4);
eq('...with no lapses', settled.lapses, 0);

const easyRun = run(['good', 'good', 'easy']);
check('easy grows faster than good', easyRun.intervalDays > graduated.intervalDays);
check('easy raises the ease', easyRun.ease > DEFAULT_EASE);

const hardRun = run(['good', 'good', 'hard']);
check('hard grows slower than good', hardRun.intervalDays < graduated.intervalDays);
check('hard lowers the ease', hardRun.ease < DEFAULT_EASE);
check('hard still moves forward', hardRun.intervalDays > 3);

/* A 'hard' on a short interval must still advance. Rounding 1 * 1.2 gives 1,
   which would leave the item stuck on the same gap for ever. */
const shortHard = schedule(
  { intervalDays: 1, ease: 2.5, due: '2026-01-01', reps: 5, lapses: 0, lastReviewed: '2025-12-31' },
  'hard', '2026-01-01',
);
check('hard on a one-day interval still grows', shortHard.intervalDays > 1, `got ${shortHard.intervalDays}`);

/* ============================================================
   Forgetting

   The one case that is not a multiplication. Whatever the interval had grown
   to, the evidence for it was just contradicted.
   ============================================================ */

const longStanding = run(['good', 'good', 'good', 'good', 'good']);
check('a long-standing item has a wide interval', longStanding.intervalDays > 30, `got ${longStanding.intervalDays}`);

const lapsed = schedule(longStanding, 'forgot', '2026-06-01');
eq('forgetting collapses the interval', lapsed.intervalDays, 0);
eq('...back to the first step', lapsed.due, addDays('2026-06-01', GRADUATING_STEPS[0]));
eq('...counts a lapse', lapsed.lapses, 1);
eq('...and resets the reps so the steps are walked again', lapsed.reps, 0);
check('...and is learning again', isLearning(lapsed));
check('...and lowers the ease', lapsed.ease < longStanding.ease);

/* Ease has a floor. Without it, a repeatedly failed item drops toward zero
   and its interval stops growing at all — it churns for ever. */
let punished = newReviewState('2026-01-01');
for (let i = 0; i < 40; i++) punished = schedule(punished, 'forgot', '2026-01-01');
eq('ease never falls below its floor', punished.ease, MIN_EASE);
eq('...after 40 failures', punished.lapses, 40);

/* And a ceiling on the interval, so nothing is scheduled past the point where
   the date is meaningless. */
const enormous: ReviewState = {
  intervalDays: MAX_INTERVAL_DAYS, ease: 2.5, due: '2026-01-01',
  reps: 99, lapses: 0, lastReviewed: '2025-01-01',
};
eq('the interval is capped', schedule(enormous, 'easy', '2026-01-01').intervalDays, MAX_INTERVAL_DAYS);

/* Ease should not carry float tails from repeated addition. */
const drifted = run(['good', 'easy', 'hard', 'easy', 'hard']);
eq('ease stays at two decimal places', drifted.ease, Math.round(drifted.ease * 100) / 100);

/* ============================================================
   Fuzz

   A hundred notes enrolled in one sitting must not come back as one wall for
   ever. Fuzz is stable per item, so a queue rebuilt mid-session does not
   reshuffle under the reviewer.
   ============================================================ */

const fuzzA = spreadFuzz('note-alpha');
const fuzzB = spreadFuzz('note-beta');
eq('fuzz is stable for the same seed', fuzzA(30), fuzzA(30));

/* The property that matters is not that any two seeds differ — on a 30-day
   interval the whole spread is five days wide, so collisions are expected and
   harmless. It is that a batch does not land as a batch. */
const batch = new Set(
  Array.from({ length: 40 }, (_, i) => spreadFuzz(`note-${i}`)(30)),
);
check('a batch of forty spreads across the window', batch.size >= 4, `landed on ${batch.size} distinct days`);
check('...without escaping it', [...batch].every((d) => Math.abs(d - 30) <= 2), `got ${[...batch].join(',')}`);
eq('short intervals are not fuzzed', fuzzA(3), 3);
eq('...nor are six-day ones', fuzzA(6), 6);
check('fuzz stays within five percent', Math.abs(fuzzA(100) - 100) <= 5, `got ${fuzzA(100)}`);
check('fuzz never returns less than a day', fuzzA(7) >= 1);

const fuzzed = schedule(step2, 'good', '2026-01-05', fuzzA);
eq('fuzz moves the due date but not the recorded interval', fuzzed.intervalDays, 8);

/* ============================================================
   The queue

   Most overdue first — those are the ones closest to being forgotten
   outright. The order has to be total, or the list reshuffles as it is worked.
   ============================================================ */

const item = (id: string, due: string, intervalDays = 10): { id: string; review: ReviewState } => ({
  id,
  review: { intervalDays, ease: 2.5, due, reps: 3, lapses: 0, lastReviewed: null },
});

const today = '2026-04-10';
const queue = dueQueue([
  item('c', '2026-04-10'),
  item('a', '2026-04-01'),
  item('future', '2026-04-20'),
  item('b', '2026-04-05'),
], today);

eq('only due items are queued', queue.length, 3);
eq('the most overdue comes first', queue.map((i) => i.id), ['a', 'b', 'c']);
check('nothing not yet due is included', !queue.some((i) => i.id === 'future'));

/* Ties: the more fragile item — the shorter interval — goes first. */
const tied = dueQueue([
  item('settled', today, 90),
  item('fragile', today, 2),
  item('middling', today, 20),
], today);
eq('ties break toward the shorter interval', tied.map((i) => i.id), ['fragile', 'middling', 'settled']);

/* Fully tied: fall back to id so the order is total and stable. */
const identical = dueQueue([item('z', today, 5), item('m', today, 5), item('a', today, 5)], today);
eq('a full tie breaks on id', identical.map((i) => i.id), ['a', 'm', 'z']);

eq('an empty vault has an empty queue', dueQueue([], today).length, 0);

/* Due "today" means due — the boundary is inclusive, or an item scheduled for
   today would sit unreviewable until tomorrow. */
check('an item due today is due', isDue(item('x', today).review, today));
check('an item due tomorrow is not', !isDue(item('x', '2026-04-11').review, today));
eq('overdue is measured in days', overdueBy(item('x', '2026-04-01').review, today), 9);
eq('not-yet-due reads negative', overdueBy(item('x', '2026-04-20').review, today), -10);

/* ============================================================
   The summary line
   ============================================================ */

const summary = reviewSummary([
  item('overdue1', '2026-04-01'),
  item('overdue2', '2026-04-09'),
  item('dueToday', today),
  item('tomorrow', '2026-04-11'),
  item('later', '2026-05-01'),
  { id: 'new', review: newReviewState(today) },
], today);

eq('due counts everything at or past its date', summary.due, 4);
eq('overdue excludes what is due today', summary.overdue, 2);
eq('tomorrow counts only the next day', summary.tomorrow, 1);
eq('learning counts items still on the steps', summary.learning, 1);

eq('an empty vault summarises to zeroes', reviewSummary([], today), { due: 0, overdue: 0, learning: 0, tomorrow: 0 });

/* ============================================================
   A whole life

   The point of the thing: a note recalled well should drift out to months,
   and one that keeps failing should stay close.
   ============================================================ */

const wellKnown = run(['good', 'good', 'good', 'good', 'good', 'good']);
check('six good recalls reach past two months', wellKnown.intervalDays > 60, `got ${wellKnown.intervalDays}`);

const troublesome = run(['good', 'good', 'forgot', 'good', 'forgot', 'good', 'forgot']);
check('a repeatedly forgotten note stays close', troublesome.intervalDays <= GRADUATING_STEPS[0] + 1, `got ${troublesome.intervalDays}`);
eq('...and its lapses are counted', troublesome.lapses, 3);
check('...and its ease has fallen', troublesome.ease < DEFAULT_EASE);

/* Reviewing late must not be punished into a reset — the item is simply seen
   later than planned, and a good recall after a long gap is good evidence. */
const late = schedule(graduated, 'good', addDays(graduated.due, 30));
check('a late but successful review still grows', late.intervalDays > graduated.intervalDays);
eq('...and is scheduled from the day it was actually done', late.due, addDays(addDays(graduated.due, 30), late.intervalDays));

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nReview scheduler checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Review scheduler checks: all ${passed} passed.`);
