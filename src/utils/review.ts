/**
 * When to see a thing again.
 *
 * The app has been telling every note "Spaced repetition: overdue" since the
 * beginning, computed from how long ago the file was last edited. That is a
 * measure of neglect, not of memory — a note you reread every day and never
 * retype looks overdue, and a note you touched to fix a typo looks fresh.
 *
 * This is the real thing: an SM-2 variant, the algorithm behind SuperMemo and
 * Anki. The idea is that the right moment to see something again is just
 * before you would have forgotten it, and the only evidence of where that
 * moment is is how easily you recalled it last time. Recall it easily and the
 * gap widens; fail and it collapses back to the start.
 *
 * Everything here is pure and works in whole days. No Date.now(), no
 * randomness unless it is handed in — the caller passes today, so the same
 * inputs always give the same schedule and the tests can prove it.
 */

/** What the reviewer says about how the recall went. */
export type Grade = 'forgot' | 'hard' | 'good' | 'easy';

/** A calendar day, 'YYYY-MM-DD'. Local, matching `todayDateKey`. */
export type DateKey = string;

export interface ReviewState {
  /** How far apart the last two sightings were, in whole days. */
  intervalDays: number;
  /** SM-2's ease factor: the multiplier a 'good' recall applies. */
  ease: number;
  /** The day this comes up again. */
  due: DateKey;
  /** Completed reviews, including lapses. */
  reps: number;
  /** Times this was forgotten after having been learned. */
  lapses: number;
  /** The day of the last review, or null if it has never been seen. */
  lastReviewed: DateKey | null;
}

/* SM-2's floor. Below about 1.3 the interval stops growing meaningfully and
   the item just churns; SuperMemo clamps here and so does everyone since. */
export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

/* Before an item is "learned" it steps through fixed gaps rather than being
   multiplied — one night's sleep, then three. Multiplying from zero would
   make the first easy recall throw the item six months away on no evidence. */
export const GRADUATING_STEPS = [1, 3];

/* How each grade moves the ease. 'good' is the neutral case and leaves it
   alone — that is what makes ease a record of difficulty rather than a
   record of how often you pressed the middle button. */
const EASE_DELTA: Record<Grade, number> = {
  forgot: -0.20,
  hard: -0.15,
  good: 0,
  easy: +0.15,
};

/** Days to add on a 'hard' recall: a small step forward, never a leap. */
const HARD_MULTIPLIER = 1.2;
/** The bonus an 'easy' recall gets on top of the ease factor. */
const EASY_BONUS = 1.3;

/** An interval this long is far enough out that precision is meaningless. */
export const MAX_INTERVAL_DAYS = 365 * 5;

/* ---------- calendar ---------- */

/** 'YYYY-MM-DD' for a Date, in local time. */
export function dateKey(d: Date): DateKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add whole days to a date key.
 *
 * Parsed at noon rather than midnight: a day that loses an hour to daylight
 * saving would otherwise land the arithmetic on the previous date, and a
 * review queue that silently shifts by one twice a year is a bug nobody ever
 * manages to reproduce.
 */
export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const base = new Date(y, m - 1, d, 12, 0, 0, 0);
  base.setDate(base.getDate() + Math.round(days));
  return dateKey(base);
}

/** Whole days from `a` to `b`; negative if `b` is earlier. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const start = new Date(ay, am - 1, ad, 12, 0, 0, 0).getTime();
  const end = new Date(by, bm - 1, bd, 12, 0, 0, 0).getTime();
  return Math.round((end - start) / 86400000);
}

/* ---------- the schedule ---------- */

/** A thing enrolled today and due today — everything starts by being seen. */
export function newReviewState(today: DateKey): ReviewState {
  return {
    intervalDays: 0,
    ease: DEFAULT_EASE,
    due: today,
    reps: 0,
    lapses: 0,
    lastReviewed: null,
  };
}

/** Has this item been through the graduating steps? */
export function isLearning(state: ReviewState): boolean {
  return state.reps < GRADUATING_STEPS.length;
}

/**
 * Move an item on after a review.
 *
 * `fuzz` spreads the due date so that a batch enrolled on the same day does
 * not come back as the same batch forever — a hundred notes added in one
 * sitting would otherwise land on one another's heads every time. It is a
 * parameter rather than a call to Math.random so that the schedule stays a
 * function of its inputs and the tests can pin it down; pass `spreadFuzz` for
 * the real thing.
 */
export function schedule(
  state: ReviewState,
  grade: Grade,
  today: DateKey,
  fuzz: (days: number) => number = (d) => d,
): ReviewState {
  const ease = clampEase(state.ease + EASE_DELTA[grade]);

  // Forgetting is the one case that is not a multiplication. The item goes
  // back to the start of the steps: whatever the interval had grown to, the
  // evidence for it was just contradicted.
  if (grade === 'forgot') {
    return {
      intervalDays: 0,
      ease,
      due: addDays(today, GRADUATING_STEPS[0]),
      reps: 0,
      lapses: state.lapses + 1,
      lastReviewed: today,
    };
  }

  const nextInterval = isLearning(state)
    ? graduatingInterval(state, grade)
    : reviewInterval(state, grade, ease);

  const capped = Math.min(nextInterval, MAX_INTERVAL_DAYS);

  return {
    intervalDays: capped,
    ease,
    // Fuzz moves the calendar day without moving the recorded interval — the
    // interval is the memory model's number and should stay clean.
    due: addDays(today, Math.max(1, fuzz(capped))),
    reps: state.reps + 1,
    lapses: state.lapses,
    lastReviewed: today,
  };
}

/** Still on the fixed steps: take the next one, or jump the queue on 'easy'. */
function graduatingInterval(state: ReviewState, grade: Grade): number {
  if (grade === 'easy') {
    // An easy recall while still learning skips the remaining steps and
    // leaves at the last one — earned, but not extrapolated.
    return GRADUATING_STEPS[GRADUATING_STEPS.length - 1];
  }
  const step = GRADUATING_STEPS[state.reps];
  return step ?? GRADUATING_STEPS[GRADUATING_STEPS.length - 1];
}

/** Graduated: the interval is multiplied by how well it went. */
function reviewInterval(state: ReviewState, grade: Grade, ease: number): number {
  const base = Math.max(state.intervalDays, 1);
  if (grade === 'hard') return Math.max(base + 1, Math.round(base * HARD_MULTIPLIER));
  if (grade === 'easy') return Math.round(base * ease * EASY_BONUS);
  return Math.round(base * ease);
}

function clampEase(ease: number): number {
  // Rounded to avoid the long float tails that come of repeatedly adding
  // 0.15 — an ease of 2.4499999999999997 is the same number and reads badly
  // anywhere it is shown.
  return Math.round(Math.max(MIN_EASE, ease) * 100) / 100;
}

/**
 * The real fuzz: up to ±5% of the interval, and never on short ones.
 *
 * Deterministic per item so that a card does not move every time the queue is
 * rebuilt — the caller passes a stable seed (the item's id), and the same
 * card on the same day always lands on the same date.
 */
export function spreadFuzz(seed: string): (days: number) => number {
  return (days: number) => {
    if (days < 7) return days;
    const spread = Math.max(1, Math.round(days * 0.05));
    // A small stable hash of the seed, mapped into [-spread, +spread].
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const offset = (Math.abs(h) % (spread * 2 + 1)) - spread;
    return Math.max(1, days + offset);
  };
}

/* ---------- the queue ---------- */

export function isDue(state: ReviewState, today: DateKey): boolean {
  return daysBetween(state.due, today) >= 0;
}

/** How overdue, in days. Negative for things not yet due. */
export function overdueBy(state: ReviewState, today: DateKey): number {
  return daysBetween(state.due, today);
}

/**
 * The order to work through what is due.
 *
 * Most overdue first, because those are the ones closest to being forgotten
 * outright. Ties break on the smaller interval — a fragile item ahead of a
 * settled one — and then on id, so the order is total and a queue rebuilt
 * mid-session does not reshuffle under the reviewer.
 */
export function dueQueue<T extends { id: string; review: ReviewState }>(
  items: T[],
  today: DateKey,
): T[] {
  return items
    .filter((it) => isDue(it.review, today))
    .sort((a, b) => {
      const byOverdue = overdueBy(b.review, today) - overdueBy(a.review, today);
      if (byOverdue !== 0) return byOverdue;
      const byInterval = a.review.intervalDays - b.review.intervalDays;
      if (byInterval !== 0) return byInterval;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** What the dashboard needs to say in one line. */
export function reviewSummary<T extends { review: ReviewState }>(
  items: T[],
  today: DateKey,
): { due: number; overdue: number; learning: number; tomorrow: number } {
  let due = 0;
  let overdue = 0;
  let learning = 0;
  let tomorrow = 0;
  const nextDay = addDays(today, 1);
  for (const it of items) {
    const gap = overdueBy(it.review, today);
    if (gap >= 0) {
      due++;
      if (gap > 0) overdue++;
    } else if (it.review.due === nextDay) {
      tomorrow++;
    }
    if (isLearning(it.review)) learning++;
  }
  return { due, overdue, learning, tomorrow };
}
