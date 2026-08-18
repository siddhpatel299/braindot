import { Note, Task, TaskAxis, TaskEffort, TaskOutput, TaskState, TaskWhen } from '@/types';

/* ============================================================
   The four axes
   ============================================================ */

export const AXES: { id: TaskAxis; label: string; columns: string[] }[] = [
  { id: 'state', label: 'state', columns: ['backlog', 'doing', 'review', 'done'] },
  { id: 'when', label: 'time', columns: ['overdue', 'today', 'week', 'later'] },
  { id: 'output', label: 'output', columns: ['drafts', 'evergreen', 'marks', 'none'] },
  { id: 'effort', label: 'effort', columns: ['quick', 'deep', 'waiting'] },
];

export const AXIS_COLUMNS: Record<TaskAxis, string[]> = AXES.reduce(
  (acc, a) => { acc[a.id] = a.columns; return acc; },
  {} as Record<TaskAxis, string[]>,
);

/** Every column value across every axis: its default name and its ink. */
export const COLUMN: Record<string, { label: string; ink: string }> = {
  backlog: { label: 'Backlog', ink: 'var(--t3)' },
  doing: { label: 'Doing', ink: 'var(--acc2)' },
  review: { label: 'Review', ink: 'var(--amb)' },
  done: { label: 'Done', ink: 'var(--grn)' },
  overdue: { label: 'Overdue', ink: 'var(--red)' },
  today: { label: 'Today', ink: 'var(--t1)' },
  week: { label: 'This week', ink: 'var(--t2)' },
  later: { label: 'Later', ink: 'var(--t3)' },
  drafts: { label: 'Drafts', ink: 'var(--acc2)' },
  evergreen: { label: 'Evergreen', ink: 'var(--grn)' },
  marks: { label: 'Reading marks', ink: 'var(--amb)' },
  none: { label: 'No note yet', ink: 'var(--t3)' },
  quick: { label: 'Quick pass', ink: 'var(--t2)' },
  deep: { label: 'Deep work', ink: 'var(--acc)' },
  waiting: { label: 'Waiting', ink: 'var(--amb)' },
};

/** How each value reads in a card's apparatus line, as running prose. */
export const WHEN_WORD: Record<TaskWhen, string> = {
  overdue: 'overdue', today: 'today', week: 'this week', later: 'later',
};
export const EFFORT_WORD: Record<TaskEffort, string> = {
  quick: 'quick pass', deep: 'deep work', waiting: 'waiting',
};
export const STATE_WORD: Record<TaskState, string> = {
  backlog: 'backlog', doing: 'doing', review: 'review', done: 'done',
};
export const OUTPUT_WORD: Record<TaskOutput, string> = {
  drafts: 'draft', evergreen: 'evergreen note', marks: 'reading marks', none: 'no note',
};

/** The 2px rail down a card's left edge. Effort is the one axis you feel
 *  before you read, so it is the one carried as colour. */
export const EFFORT_INK: Record<TaskEffort, string> = {
  quick: 'var(--bd2)', deep: 'var(--acc)', waiting: 'var(--amb)',
};

export function isAxis(v: string): v is TaskAxis {
  return v === 'state' || v === 'when' || v === 'effort' || v === 'output';
}

/** The three axes a card should print, given the one its column already says. */
export function apparatus(task: Task, axis: TaskAxis): string {
  const bits: string[] = [];
  if (axis !== 'output') bits.push(OUTPUT_WORD[task.output]);
  if (axis !== 'when') bits.push(WHEN_WORD[task.when]);
  if (axis !== 'effort') bits.push(EFFORT_WORD[task.effort]);
  if (axis !== 'state') bits.push(STATE_WORD[task.state]);
  return bits.join(' · ');
}

/* ============================================================
   Output — derived from the note a task produces
   ============================================================ */

/**
 * The artefact class of a task's linked note.
 *
 * This is the single place the rule lives, so no path can produce a task that
 * prints a note title and declares it has none.
 */
export function outputFor(linkedNoteId: string | null, notes: Note[]): TaskOutput {
  if (!linkedNoteId) return 'none';
  const note = notes.find((n) => n.id === linkedNoteId);
  if (!note) return 'drafts';
  if (note.status === 'evergreen') return 'evergreen';
  if ((note.tags || []).some((t) => /^(reading|marks|highlights)$/i.test(t))) return 'marks';
  return 'drafts';
}

/**
 * Reconcile a task's output with the note it links to.
 *
 * The column supplies its own value first; a note then overrides an
 * incompatible output. Adding a note in "No note yet" files the task under
 * Drafts rather than leaving it claiming to produce nothing, and clearing the
 * note sends it back to `none`. Both the composer and the edit sheet call
 * this, so they cannot disagree.
 */
export function reconcileOutput(
  linkedNoteId: string | null,
  requested: TaskOutput,
  notes: Note[],
): TaskOutput {
  if (!linkedNoteId) return 'none';
  if (requested === 'none') return outputFor(linkedNoteId, notes);
  return requested;
}

/** Find a note by title, case-insensitively — how the composer resolves `¶`. */
export function noteByTitle(title: string, notes: Note[]): Note | null {
  const q = title.trim().toLowerCase();
  if (!q) return null;
  return (
    notes.find((n) => n.title.toLowerCase() === q) ??
    notes.find((n) => n.title.toLowerCase().startsWith(q)) ??
    null
  );
}

/* ============================================================
   Migration: two collections into one
   ============================================================ */

/** The shapes on disk before the merge. Declared here rather than in types
 *  so nothing new can be written against them. */
interface LegacyCard {
  id: string; title: string; description?: string; status?: string;
  tags?: string[]; linkedNoteId?: string | null; order?: number;
  createdAt?: string; updatedAt?: string;
}
interface LegacyTodo {
  id: string; text: string; done?: boolean; priority?: string;
  dueGroup?: string | null; dueDate?: string | null;
  linkedNoteId?: string | null; order?: number; createdAt?: string;
}

const DAY_MS = 86400000;

/** Local day key, so a due date does not shift by a day near midnight. */
function dayKey(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** A free-text due date folds into the four windows nothing else groups by. */
export function whenFromDueDate(dueDate: string | null | undefined): TaskWhen | null {
  if (!dueDate) return null;
  const t = new Date(dueDate).getTime();
  if (!Number.isFinite(t)) return null;
  const todayK = dayKey(new Date());
  const k = dayKey(t);
  if (k < todayK) return 'overdue';
  if (k === todayK) return 'today';
  return t - Date.now() <= 7 * DAY_MS ? 'week' : 'later';
}

const STATE_FROM_STATUS: Record<string, TaskState> = {
  backlog: 'backlog', 'in-progress': 'doing', doing: 'doing',
  review: 'review', done: 'done',
};

/** urgent/high need a sitting; medium/low fit in a gap. */
const EFFORT_FROM_PRIORITY: Record<string, TaskEffort> = {
  urgent: 'deep', high: 'deep', medium: 'quick', low: 'quick',
};

const WHEN_FROM_DUE_GROUP: Record<string, TaskWhen> = {
  today: 'today', tomorrow: 'week', week: 'week', someday: 'later',
};

/**
 * Merge legacy cards and todos into one task list.
 *
 * Ids are prefixed by origin, so running this twice over the same source
 * cannot produce two tasks for one card, and a task that already exists in
 * `existing` is left exactly as it is.
 */
export function migrateToTasks(
  cards: LegacyCard[],
  todos: LegacyTodo[],
  existing: Task[],
  notes: Note[],
): Task[] {
  const have = new Set(existing.map((t) => t.id));
  const out: Task[] = [...existing];
  const now = new Date().toISOString();

  cards.forEach((c, i) => {
    const id = `tk_c_${c.id}`;
    if (have.has(id)) return;
    have.add(id);
    const linkedNoteId = c.linkedNoteId ?? null;
    out.push({
      id,
      title: c.title || 'Untitled task',
      state: STATE_FROM_STATUS[c.status ?? 'backlog'] ?? 'backlog',
      when: 'later',
      effort: 'quick',
      output: outputFor(linkedNoteId, notes),
      linkedNoteId,
      order: c.order ?? i,
      createdAt: c.createdAt || now,
      updatedAt: c.updatedAt || c.createdAt || now,
      description: c.description || undefined,
    });
  });

  todos.forEach((t, i) => {
    const id = `tk_t_${t.id}`;
    if (have.has(id)) return;
    have.add(id);
    const linkedNoteId = t.linkedNoteId ?? null;
    out.push({
      id,
      title: t.text || 'Untitled task',
      state: t.done ? 'done' : 'backlog',
      when: whenFromDueDate(t.dueDate) ?? WHEN_FROM_DUE_GROUP[t.dueGroup ?? ''] ?? 'later',
      effort: EFFORT_FROM_PRIORITY[t.priority ?? 'medium'] ?? 'quick',
      output: outputFor(linkedNoteId, notes),
      linkedNoteId,
      order: t.order ?? cards.length + i,
      createdAt: t.createdAt || now,
      updatedAt: t.createdAt || now,
      dueDate: t.dueDate ?? undefined,
    });
  });

  return out;
}
