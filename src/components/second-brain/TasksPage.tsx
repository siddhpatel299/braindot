'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Note, Task, TaskAxis, TaskEffort, TaskState, TaskWhen } from '@/types';
import { KanbanSquare, List, Columns3, Plus, X } from 'lucide-react';
import { ViewHeader, HeaderSegment, HeaderButton, HeaderDivider, ViewEmptyState } from './ViewHeader';
import {
  AXES, AXIS_COLUMNS, COLUMN, EFFORT_INK, EFFORT_WORD, STATE_WORD, WHEN_WORD,
  apparatus, isAxis, noteByTitle, reconcileOutput,
} from '@/utils/tasks';

interface TasksPageProps {
  notes: Note[];
  tasks: Task[];
  onAddTask: (task: Partial<Task> & Pick<Task, 'title'>) => Task;
  onUpdateTask: (id: string, patch: Partial<Task>) => void;
  onMoveTask: (id: string, axis: TaskAxis, value: string) => void;
  onDeleteTask: (id: string) => void;
  onToggleTask: (id: string) => void;
  onOpenNote: (id: string) => void;
}

const AXIS_KEY = 'sb-tasks-axis';
const VIEW_KEY = 'sb-tasks-view';
const ORDER_KEY = 'sb-tasks-col-order';
const LABEL_KEY = 'sb-tasks-col-labels';

type ViewMode = 'board' | 'list';

/** The composer's draft. It outlives an axis switch, so what you typed is
 *  still there after you change how the board is grouped. */
interface Draft {
  title: string;
  noteText: string;
  state: TaskState;
  when: TaskWhen;
  effort: TaskEffort;
}

const EMPTY_DRAFT: Draft = { title: '', noteText: '', state: 'backlog', when: 'today', effort: 'quick' };

/**
 * Tasks — one model, four axes.
 *
 * The screen used to run a kanban board and a todo rail side by side, which
 * was two task systems rather than two views of one. There is now a single
 * task carrying state, due window, effort and output; the board groups by
 * whichever of those you pick, and dragging a card writes the field the
 * columns currently represent. The same gesture reschedules, restates or
 * re-files depending on how you are looking at the list.
 */
export function TasksPage({
  notes, tasks,
  onAddTask, onUpdateTask, onMoveTask, onDeleteTask, onToggleTask, onOpenNote,
}: TasksPageProps) {
  const [axis, setAxisState] = useState<TaskAxis>('state');
  const [view, setView] = useState<ViewMode>('board');
  const [order, setOrder] = useState<Record<TaskAxis, string[]>>(() => ({ ...AXIS_COLUMNS }));
  const [labels, setLabels] = useState<Record<string, string>>({});

  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  /* ---- persisted UI state, read after mount so SSR cannot disagree ---- */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const a = localStorage.getItem(AXIS_KEY);
      if (a && isAxis(a)) setAxisState(a);
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'board' || v === 'list') setView(v);
      const o = localStorage.getItem(ORDER_KEY);
      if (o) {
        const parsed = JSON.parse(o) as Record<string, string[]>;
        // Only keep values the axis actually has, so a stale key cannot
        // produce a column for a value that no longer exists.
        const next = { ...AXIS_COLUMNS };
        for (const ax of Object.keys(next) as TaskAxis[]) {
          const saved = parsed[ax];
          if (!Array.isArray(saved)) continue;
          const valid = saved.filter((c) => AXIS_COLUMNS[ax].includes(c));
          const missing = AXIS_COLUMNS[ax].filter((c) => !valid.includes(c));
          next[ax] = [...valid, ...missing];
        }
        setOrder(next);
      }
      const l = localStorage.getItem(LABEL_KEY);
      if (l) setLabels(JSON.parse(l));
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const persist = (key: string, value: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };

  const columnLabel = useCallback(
    (id: string) => labels[id] || COLUMN[id]?.label || id,
    [labels],
  );

  /** Switching axis keeps the composer open, moved to the column the draft
   *  would now land in — the text you typed survives the regrouping. */
  const setAxis = (next: TaskAxis) => {
    setAxisState(next);
    try { localStorage.setItem(AXIS_KEY, next); } catch {}
    setRenaming(null);
    setAddingIn((cur) => {
      if (cur === null) return null;
      if (next === 'output') return draftOutput(draft);
      return draft[next as 'state' | 'when' | 'effort'];
    });
  };

  const chooseView = (v: ViewMode) => {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  };

  /** What column a draft belongs in on the output axis. */
  function draftOutput(d: Draft): string {
    const note = noteByTitle(d.noteText, notes);
    return note ? reconcileOutput(note.id, 'none', notes) : 'none';
  }

  /* ---- grouping ---- */
  const columns = order[axis] ?? AXIS_COLUMNS[axis];
  const grouped = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const c of columns) m.set(c, []);
    for (const t of tasks) {
      const key = String(t[axis]);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    for (const list of m.values()) list.sort((a, b) => a.order - b.order);
    return m;
  }, [tasks, columns, axis]);

  /* ---- drag ---- */
  const dropOn = (colId: string) => {
    // A live card drag always wins. A column drag only applies while its own
    // gesture is running; its dragend clears the id if the user thinks better
    // of it, so an abandoned column drag cannot hijack the next card drop.
    if (dragTaskId) {
      if (axis === 'output' && colId === 'none') {
        // "Produces no note" and "has no linked note" are the same fact. Left
        // apart, the board could show a card printing a note title in the
        // column that says it has none.
        onUpdateTask(dragTaskId, { output: 'none', linkedNoteId: null });
      } else {
        onMoveTask(dragTaskId, axis, colId);
      }
    } else if (dragColId) {
      reorderColumns(dragColId, colId);
    }
    setDragTaskId(null);
    setDragColId(null);
    setDragOverCol(null);
  };

  const reorderColumns = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const cols = [...columns];
    const from = cols.indexOf(fromId);
    const to = cols.indexOf(toId);
    if (from < 0 || to < 0) return;
    const [moved] = cols.splice(from, 1);
    // Index recomputed *after* the removal — reading it before puts a
    // left-to-right move one slot past its target.
    const insertAt = cols.indexOf(toId) + (from < to ? 1 : 0);
    cols.splice(insertAt, 0, moved);
    const next = { ...order, [axis]: cols };
    setOrder(next);
    persist(ORDER_KEY, next);
  };

  const commitRename = (id: string) => {
    // Enter commits directly and blur is the fallback, so the guard keeps the
    // second one from re-running. Delegating Enter to blur() alone meant a
    // rename could silently do nothing if the field never held focus.
    if (renaming !== id) return;
    const next = { ...labels, [id]: renameText.trim() || COLUMN[id]?.label || id };
    if (!renameText.trim()) delete next[id];
    setLabels(next);
    persist(LABEL_KEY, next);
    setRenaming(null);
  };

  /* ---- composer ---- */
  const openComposer = (colId: string) => {
    setAddingIn(colId);
    setDraft(EMPTY_DRAFT);
  };

  const commitDraft = () => {
    const title = draft.title.trim();
    if (!title || !addingIn) { setAddingIn(null); setDraft(EMPTY_DRAFT); return; }

    // The column supplies its own axis first; a resolved note then overrides
    // an incompatible output. Same order as the edit sheet, so the two paths
    // cannot disagree about where a task lands.
    const base: Pick<Task, 'state' | 'when' | 'effort'> = {
      state: draft.state, when: draft.when, effort: draft.effort,
    };
    if (axis !== 'output') {
      (base as Record<string, string>)[axis] = addingIn;
    }
    const note = noteByTitle(draft.noteText, notes);
    const linkedNoteId = note ? note.id : null;
    const requested = axis === 'output' ? (addingIn as Task['output']) : 'none';
    const output = reconcileOutput(linkedNoteId, requested, notes);

    onAddTask({ title, ...base, output, linkedNoteId });
    setAddingIn(null);
    setDraft(EMPTY_DRAFT);
  };

  const cancelDraft = () => { setAddingIn(null); setDraft(EMPTY_DRAFT); };

  /* ---- facts ---- */
  const openCount = tasks.filter((t) => t.state !== 'done').length;
  const overdueCount = tasks.filter((t) => t.when === 'overdue' && t.state !== 'done').length;
  const producing = tasks.filter((t) => t.linkedNoteId).length;
  const facts = `${openCount} open · ${overdueCount} overdue · ${producing} produce a note`;

  const editing = editingId ? tasks.find((t) => t.id === editingId) ?? null : null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      <ViewHeader icon={KanbanSquare} title="Tasks" facts={tasks.length === 0 ? undefined : facts}>
        <span style={{ fontSize: 10.5, color: 'var(--t3)', whiteSpace: 'nowrap' }}>group by</span>
        <HeaderSegment
          value={axis}
          onChange={setAxis}
          options={AXES.map((a) => ({ id: a.id, label: a.label }))}
        />
        <HeaderDivider />
        <HeaderSegment
          value={view}
          onChange={chooseView}
          options={[
            { id: 'board' as const, label: 'board', icon: Columns3 },
            { id: 'list' as const, label: 'list', icon: List },
          ]}
        />
        <HeaderButton
          icon={Plus}
          label="add task"
          accent
          onClick={() => { chooseView('board'); openComposer(columns[0]); }}
        />
      </ViewHeader>

      {tasks.length === 0 && addingIn === null ? (
        <ViewEmptyState
          icon={KanbanSquare}
          heading="No tasks yet."
          body="Tasks here are the ones that produce notes — a draft to finish, a chapter to read. Anything else belongs in your calendar."
          primaryLabel="add the first task"
          onPrimary={() => { chooseView('board'); openComposer(columns[0]); }}
          secondary="or press ⌘K and type “task”"
        />
      ) : view === 'board' ? (
        <div
          className="sb-scroll sb-task-board"
          style={{
            flex: 1, minHeight: 0, display: 'flex', gap: 11, padding: '14px 16px',
            overflowX: 'auto', overflowY: 'hidden', alignItems: 'flex-start',
          }}
        >
          {columns.map((colId) => {
            const list = grouped.get(colId) ?? [];
            const over = dragOverCol === colId;
            return (
              <div
                key={colId}
                onDragOver={(e) => { e.preventDefault(); if (dragOverCol !== colId) setDragOverCol(colId); }}
                onDragLeave={() => setDragOverCol((c) => (c === colId ? null : c))}
                onDrop={(e) => { e.preventDefault(); dropOn(colId); }}
                className="sb-task-column"
                style={{
                  width: 252, minWidth: 252, maxHeight: '100%',
                  background: over ? 'var(--acc-bg)' : 'var(--bg1)',
                  border: `1px solid ${over ? 'var(--acc)' : 'var(--bd)'}`,
                  borderRadius: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}
              >
                <div
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragColId(colId); }}
                  onDragEnd={() => setDragColId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); dropOn(colId); }}
                  style={{
                    padding: '9px 11px', borderBottom: '1px solid var(--bd)', display: 'flex',
                    alignItems: 'center', gap: 7, flexShrink: 0,
                    background: dragColId === colId ? 'var(--bg3)' : 'transparent',
                  }}
                >
                  <span title="drag to reorder" style={{ fontSize: 10, color: 'var(--t3)', cursor: 'grab', letterSpacing: '-0.1em', flexShrink: 0 }}>
                    ⠿
                  </span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLUMN[colId]?.ink ?? 'var(--t3)', flexShrink: 0 }} />
                  {renaming === colId ? (
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => commitRename(colId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitRename(colId); }
                        if (e.key === 'Escape') setRenaming(null);
                      }}
                      aria-label={`Rename ${columnLabel(colId)}`}
                      style={{
                        flex: 1, minWidth: 0, background: 'var(--bg3)', border: '1px solid var(--acc)',
                        borderRadius: 3, padding: '2px 6px', color: 'var(--t1)', fontFamily: 'inherit',
                        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.09em',
                        outline: 'none', caretColor: 'var(--acc2)',
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => { setRenaming(colId); setRenameText(columnLabel(colId)); }}
                      title="click to rename"
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left', padding: 0, background: 'transparent',
                        border: 'none', fontFamily: 'inherit', fontSize: 10.5, textTransform: 'uppercase',
                        letterSpacing: '0.09em', color: 'var(--t2)', fontWeight: 600, cursor: 'text',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; }}
                    >
                      {columnLabel(colId)}
                    </button>
                  )}
                  <span className="sb-fig" style={{ fontSize: 9.5, background: 'var(--bg3)', color: 'var(--t3)', padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>
                    {list.length}
                  </span>
                </div>

                <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {list.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      axis={axis}
                      note={t.linkedNoteId ? noteById.get(t.linkedNoteId) ?? null : null}
                      dragging={dragTaskId === t.id}
                      onDragStart={() => setDragTaskId(t.id)}
                      onDragEnd={() => { setDragTaskId(null); setDragOverCol(null); }}
                      onOpen={() => setEditingId(t.id)}
                      onToggle={() => onToggleTask(t.id)}
                      onOpenNote={onOpenNote}
                    />
                  ))}

                  {addingIn === colId ? (
                    <Composer
                      axis={axis}
                      draft={draft}
                      notes={notes}
                      onChange={setDraft}
                      onCommit={commitDraft}
                      onCancel={cancelDraft}
                    />
                  ) : (
                    <button
                      onClick={() => openComposer(colId)}
                      style={{
                        padding: '7px 9px', background: 'transparent', border: '1px dashed var(--bd2)',
                        borderRadius: 4, color: 'var(--t3)', fontFamily: 'inherit', fontSize: 10.5,
                        fontStyle: 'italic', textAlign: 'left', cursor: 'pointer', flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
                    >
                      + add card
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 22px 40px' }}>
          <div style={{ maxWidth: 900, display: 'flex', flexDirection: 'column' }}>
            {columns.map((colId) => {
              const list = grouped.get(colId) ?? [];
              if (list.length === 0) return null;
              return (
                <div key={colId} style={{ display: 'flex', flexDirection: 'column', paddingBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 7px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLUMN[colId]?.ink ?? 'var(--t3)' }} />
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t2)', fontWeight: 600 }}>
                      {columnLabel(colId)}
                    </span>
                    <span className="sb-fig" style={{ fontSize: 9.5, color: 'var(--t3)' }}>{list.length}</span>
                    <span style={{ flex: 1, height: 1, background: 'var(--bd)' }} />
                  </div>
                  {list.map((t) => (
                    <TaskListRow
                      key={t.id}
                      task={t}
                      axis={axis}
                      note={t.linkedNoteId ? noteById.get(t.linkedNoteId) ?? null : null}
                      onOpen={() => setEditingId(t.id)}
                      onToggle={() => onToggleTask(t.id)}
                      onOpenNote={onOpenNote}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <EditSheet
          task={editing}
          notes={notes}
          onClose={() => setEditingId(null)}
          onSave={(patch) => { onUpdateTask(editing.id, patch); setEditingId(null); }}
          onDelete={() => { onDeleteTask(editing.id); setEditingId(null); }}
        />
      )}
    </div>
  );
}

/* ============================================================
   Cards
   ============================================================ */

function Checkbox({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      title={done ? 'mark not done' : 'mark done'}
      aria-pressed={done}
      style={{
        width: 13, height: 13, marginTop: 1, flexShrink: 0,
        border: `1.5px solid ${done ? 'var(--grn)' : 'var(--bd2)'}`,
        background: done ? 'var(--grn)' : 'transparent',
        borderRadius: 3, cursor: 'pointer', padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {done && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

function TaskCard({ task, axis, note, dragging, onDragStart, onDragEnd, onOpen, onToggle, onOpenNote }: {
  task: Task; axis: TaskAxis; note: Note | null; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onOpen: () => void;
  onToggle: () => void; onOpenNote: (id: string) => void;
}) {
  const done = task.state === 'done';
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      style={{
        display: 'flex', background: 'var(--bg2)', border: '1px solid var(--bd)',
        borderRadius: 5, overflow: 'hidden', cursor: 'pointer',
        opacity: dragging ? 0.4 : 1, flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--bd2)'; e.currentTarget.style.background = 'var(--bg3)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.background = 'var(--bg2)'; }}
    >
      <span title={EFFORT_WORD[task.effort]} style={{ width: 2, flexShrink: 0, background: EFFORT_INK[task.effort] }} />
      <div style={{ flex: 1, minWidth: 0, padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <Checkbox done={done} onToggle={onToggle} />
          <span style={{
            fontSize: 12, lineHeight: 1.4, minWidth: 0,
            color: done ? 'var(--t3)' : 'var(--t1)',
            textDecoration: done ? 'line-through' : 'none',
          }}>
            {task.title}
          </span>
        </div>
        {note && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenNote(note.id); }}
            title={`open ${note.title}`}
            style={{
              padding: '0 0 0 21px', background: 'transparent', border: 'none', textAlign: 'left',
              fontFamily: 'inherit', fontSize: 10, color: 'var(--acc2)', lineHeight: 1.4, cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
          >
            ¶ {note.title}
          </button>
        )}
        <span className="sb-fig" style={{ fontSize: 9.5, color: 'var(--t3)', paddingLeft: 21, letterSpacing: '0.02em' }}>
          {apparatus(task, axis)}
        </span>
      </div>
    </div>
  );
}

function TaskListRow({ task, axis, note, onOpen, onToggle, onOpenNote }: {
  task: Task; axis: TaskAxis; note: Note | null;
  onOpen: () => void; onToggle: () => void; onOpenNote: (id: string) => void;
}) {
  const done = task.state === 'done';
  return (
    <div
      onClick={onOpen}
      style={{
        display: 'grid', gridTemplateColumns: '14px minmax(0,1fr) auto', gap: '0 12px',
        alignItems: 'center', padding: '8px 6px', borderBottom: '1px solid var(--bd)', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Checkbox done={done} onToggle={onToggle} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: done ? 'var(--t3)' : 'var(--t1)', textDecoration: done ? 'line-through' : 'none' }}>
          {task.title}
        </span>
        {note && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenNote(note.id); }}
            title={`open ${note.title}`}
            style={{ background: 'transparent', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 10, color: 'var(--acc2)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
          >
            ¶ {note.title}
          </button>
        )}
      </div>
      <span className="sb-fig" style={{ fontSize: 9.5, color: 'var(--t3)', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
        {apparatus(task, axis)}
      </span>
    </div>
  );
}

/* ============================================================
   Composer — everything the task needs, before it exists
   ============================================================ */

function Chips<T extends string>({ label, options, value, onChange }: {
  label: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t3)' }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              aria-pressed={on}
              style={{
                padding: '3px 7px', borderRadius: 3,
                background: on ? 'var(--acc-bg)' : 'var(--bg3)',
                border: `1px solid ${on ? 'var(--acc-bd)' : 'var(--bd2)'}`,
                color: on ? 'var(--acc2)' : 'var(--t3)',
                fontSize: 9.5, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const EFFORT_OPTS = (Object.keys(EFFORT_WORD) as TaskEffort[]).map((id) => ({ id, label: EFFORT_WORD[id] }));
const WHEN_OPTS = (Object.keys(WHEN_WORD) as TaskWhen[]).map((id) => ({ id, label: WHEN_WORD[id] }));
const STATE_OPTS = (Object.keys(STATE_WORD) as TaskState[]).map((id) => ({ id, label: STATE_WORD[id] }));

function Composer({ axis, draft, notes, onChange, onCommit, onCancel }: {
  axis: TaskAxis; draft: Draft; notes: Note[];
  onChange: (d: Draft) => void; onCommit: () => void; onCancel: () => void;
}) {
  const listId = useId();
  const resolved = noteByTitle(draft.noteText, notes);
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onCommit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--acc)', borderRadius: 5, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 10px 8px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        <textarea
          autoFocus
          rows={2}
          value={draft.title}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          onKeyDown={key}
          placeholder="what needs doing?"
          aria-label="Task title"
          style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--t1)', fontSize: 12, lineHeight: 1.4, fontFamily: 'inherit',
            resize: 'none', caretColor: 'var(--acc2)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--acc2)', flexShrink: 0 }}>¶</span>
          <input
            list={listId}
            value={draft.noteText}
            onChange={(e) => onChange({ ...draft, noteText: e.target.value })}
            onKeyDown={key}
            placeholder="note it produces (optional)"
            aria-label="Note this task produces"
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--t1)', fontSize: 10.5, fontFamily: 'inherit', caretColor: 'var(--acc2)',
            }}
          />
          <datalist id={listId}>
            {notes.slice(0, 200).map((n) => <option key={n.id} value={n.title} />)}
          </datalist>
        </div>
      </div>
      <div style={{ padding: '0 10px 9px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* The column already says whichever field the axis represents, so that
            picker is hidden rather than asked twice. */}
        {axis !== 'effort' && (
          <Chips label="Effort" options={EFFORT_OPTS} value={draft.effort} onChange={(v) => onChange({ ...draft, effort: v })} />
        )}
        {axis !== 'when' && (
          <Chips label="Due" options={WHEN_OPTS} value={draft.when} onChange={(v) => onChange({ ...draft, when: v })} />
        )}
        {axis !== 'state' && (
          <Chips label="State" options={STATE_OPTS} value={draft.state} onChange={(v) => onChange({ ...draft, state: v })} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>
          <span style={{ fontSize: 9, color: 'var(--t3)', flex: 1, minWidth: 0 }}>
            {draft.noteText.trim() && !resolved
              ? 'no note by that name — it will be added without one'
              : draft.title.trim() ? '⏎ to add' : 'a task is something that makes a note'}
          </span>
          <button
            onClick={onCancel}
            style={{ height: 22, padding: '0 8px', background: 'transparent', border: '1px solid var(--bd2)', borderRadius: 4, color: 'var(--t3)', fontFamily: 'inherit', fontSize: 9.5, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
          >
            esc
          </button>
          <button
            onClick={onCommit}
            style={{ height: 22, padding: '0 10px', background: 'var(--acc)', border: 'none', borderRadius: 4, color: 'var(--on-acc)', fontFamily: 'inherit', fontSize: 9.5, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--acc)'; }}
          >
            add
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Edit sheet — for changing your mind, not for finishing the task
   ============================================================ */

function EditSheet({ task, notes, onClose, onSave, onDelete }: {
  task: Task; notes: Note[];
  onClose: () => void; onSave: (patch: Partial<Task>) => void; onDelete: () => void;
}) {
  const linked = task.linkedNoteId ? notes.find((n) => n.id === task.linkedNoteId) ?? null : null;
  const [title, setTitle] = useState(task.title);
  const [noteText, setNoteText] = useState(linked?.title ?? '');
  const [effort, setEffort] = useState<TaskEffort>(task.effort);
  const [when, setWhen] = useState<TaskWhen>(task.when);
  const [state, setState] = useState<TaskState>(task.state);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resolved = noteByTitle(noteText, notes);
  const save = () => {
    const linkedNoteId = resolved ? resolved.id : null;
    // Same order as the composer: the note decides the output, and clearing
    // it puts the task back under "No note yet".
    onSave({
      title: title.trim() || 'Untitled task',
      linkedNoteId,
      output: reconcileOutput(linkedNoteId, task.output, notes),
      effort, when, state,
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Edit task"
        style={{
          width: 440, maxWidth: '90vw', background: 'var(--bg2)', border: '1px solid var(--bd2)',
          borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex',
          flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>edit task</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ width: 24, height: 24, borderRadius: 3, background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="task">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={inputStyle(13)}
            />
          </Field>

          <Field label="output — the note this produces">
            <input
              list={listId}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="none yet"
              style={inputStyle(12)}
            />
            <datalist id={listId}>
              {notes.slice(0, 200).map((n) => <option key={n.id} value={n.title} />)}
            </datalist>
            <span style={{ fontSize: 10, color: 'var(--t3)', marginTop: 6, display: 'block' }}>
              {noteText.trim() && !resolved
                ? 'No note by that name — this task will be saved without one.'
                : resolved
                  ? `Linked. Grouped under ${COLUMN[reconcileOutput(resolved.id, task.output, notes)].label} when you group by output.`
                  : 'Tasks without an output collect under “No note yet”.'}
            </span>
          </Field>

          <Field label="effort"><Row options={EFFORT_OPTS} value={effort} onChange={setEffort} /></Field>
          <Field label="due"><Row options={WHEN_OPTS} value={when} onChange={setWhen} /></Field>
          <Field label="state"><Row options={STATE_OPTS} value={state} onChange={setState} /></Field>
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onDelete}
            style={{ background: 'transparent', border: '1px solid var(--red)', borderRadius: 4, padding: '7px 12px', color: 'var(--red)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}
          >
            delete
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: '1px solid var(--bd2)', borderRadius: 4, padding: '7px 14px', color: 'var(--t2)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; }}
            >
              cancel
            </button>
            <button
              onClick={save}
              style={{ background: 'var(--acc)', border: 'none', borderRadius: 4, padding: '7px 14px', color: 'var(--on-acc)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--acc)'; }}
            >
              save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function inputStyle(fontSize: number): React.CSSProperties {
  return {
    width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4,
    padding: '8px 10px', color: 'var(--t1)', fontSize, fontFamily: 'inherit',
    outline: 'none', caretColor: 'var(--acc2)',
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 5, display: 'block' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Row<T extends string>({ options, value, onChange }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            aria-pressed={on}
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 4,
              background: on ? 'var(--acc-bg)' : 'var(--bg3)',
              border: `1px solid ${on ? 'var(--acc-bd)' : 'var(--bd2)'}`,
              color: on ? 'var(--acc2)' : 'var(--t3)',
              fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
              letterSpacing: '0.04em', fontWeight: 600,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
