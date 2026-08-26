'use client';

import { useMemo } from 'react';
import { Note, Task, LibraryItem, Highlight } from '@/types';
import { relativeTime, plural } from '@/utils/markdown';
import { LucideIcon } from 'lucide-react';
import { ArrowRight, Calendar, Download, Upload, Plus, Sparkles, GraduationCap, FolderDown } from 'lucide-react';

interface DashboardProps {
  notes: Note[];
  streak: number;
  tasks: Task[];
  libraryItems: LibraryItem[];
  highlights: Highlight[];
  onOpenNote: (id: string) => void;
  onCreateNote: () => void;
  onCreateJournal: () => void;
  onAskAI: () => void;
  onStudyMode: () => void;
  onViewGraph: () => void;
  onExportVault: () => void;
  /** The whole vault as markdown files, openable in any other app. */
  onExportMarkdown: () => void;
  exportBusy?: boolean;
  onImportVault: (file: File) => void;
  onToggleTask: (id: string) => void;
  /* Widened from kanban/reading/search to the destinations Elsewhere offers.
     No new plumbing: the caller already passes handleIconSelect, which has
     always accepted every one of these. */
  onNavigate: (view: 'notes' | 'graph' | 'tags' | 'kanban' | 'reading' | 'search') => void;
}

/* ---------- date helpers ---------- */

const DAY_MS = 86400000;

/** Local YYYY-MM-DD key — must be local, not UTC, or the day bars shift a day. */
function dayKey(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / DAY_MS;
}

/** Plain-text preview of a markdown body, markup stripped. */
function excerpt(body: string, len = 260): string {
  const clean = (src: string) =>
    src
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s{0,3}>\s?/gm, '')
      .replace(/^\s{0,3}[-*+]\s+/gm, '')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  // Prose first. Notes that are *only* a diagram or code block would strip to
  // nothing, so fall back to the fence's contents rather than showing blank.
  let s = clean(body.replace(/```[\s\S]*?```/g, ' '));
  if (!s) s = clean(body.replace(/^\s*```.*$/gm, ' '));

  return s.length > len ? s.slice(0, len).replace(/\s\S*$/, '') + '…' : s;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'still up';
  if (h < 12) return 'good morning';
  if (h < 18) return 'good afternoon';
  return 'good evening';
}

/**
 * The front page, set as an edition rather than a wall of panels.
 *
 * There are no boxes on this screen. Structure is carried by hairline rules
 * and column gutters, the way a newspaper carries it, so the eye reads the
 * hierarchy — masthead, lead, then the three standing columns — instead of
 * counting containers. Serif for the things you read, mono for the apparatus
 * that labels them.
 */
export function Dashboard({
  notes,
  streak,
  tasks,
  libraryItems,
  highlights,
  onOpenNote,
  onCreateNote,
  onCreateJournal,
  onAskAI,
  onStudyMode,
  onViewGraph,
  onExportVault,
  onExportMarkdown,
  exportBusy = false,
  onImportVault,
  onToggleTask,
  onNavigate,
}: DashboardProps) {
  /* ---------- link graph: edges + degree, computed once ---------- */
  const linkGraph = useMemo(() => {
    const titleToId = new Map<string, string>();
    for (const n of notes) {
      titleToId.set(n.title.toLowerCase(), n.id);
      titleToId.set(n.filename.toLowerCase().replace(/\.md$/, ''), n.id);
    }
    const edges: { from: string; to: string }[] = [];
    const seen = new Set<string>();
    for (const n of notes) {
      const re = /\[\[([^\]]+)\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(n.body)) !== null) {
        const targetId = titleToId.get(m[1].trim().toLowerCase());
        if (targetId && targetId !== n.id) {
          const key = [n.id, targetId].sort().join('→');
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ from: n.id, to: targetId });
          }
        }
      }
    }
    const degree = new Map<string, number>();
    for (const n of notes) degree.set(n.id, 0);
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) || 0) + 1);
      degree.set(e.to, (degree.get(e.to) || 0) + 1);
    }
    return { edges, degree };
  }, [notes]);

  const stats = useMemo(() => {
    const totalWords = notes.reduce((sum, n) => sum + n.wordCount, 0);
    const evergreenCount = notes.filter((n) => n.status === 'evergreen').length;
    const recentlyEdited = [...notes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return { totalWords, evergreenCount, draftCount: notes.length - evergreenCount, recentlyEdited };
  }, [notes]);

  /* ---------- activity: every dated event in the vault, by local day ---------- */
  const activity = useMemo(() => {
    const byDay = new Map<string, number>();
    const bump = (iso: string | undefined | null) => {
      if (!iso) return;
      const t = new Date(iso).getTime();
      if (!Number.isFinite(t)) return;
      const k = dayKey(t);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    };
    for (const n of notes) {
      bump(n.createdAt);
      if (dayKey(n.updatedAt) !== dayKey(n.createdAt)) bump(n.updatedAt);
    }
    for (const t of tasks) bump(t.createdAt);
    for (const h of highlights) bump(h.createdAt);
    for (const l of libraryItems) bump(l.addedAt);
    return { byDay };
  }, [notes, tasks, highlights, libraryItems]);

  /** The last fourteen local days, oldest first. A fortnight is long enough to
   *  show a rhythm and short enough that every bar is a day you remember. */
  const fortnight = useMemo(() => {
    const today = startOfDay(new Date());
    const out: { key: string; date: Date; count: number; isToday: boolean }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const key = dayKey(d);
      out.push({ key, date: d, count: activity.byDay.get(key) || 0, isToday: i === 0 });
    }
    return out;
  }, [activity.byDay]);

  const fortnightPeak = Math.max(1, ...fortnight.map((d) => d.count));
  const activeDays = fortnight.filter((d) => d.count > 0).length;

  const tagCount = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) for (const t of n.tags) s.add(t);
    return s.size;
  }, [notes]);

  /** Words in notes touched in the last seven days. The vault keeps no history
   *  of word counts, so this is what can be said honestly — not "words written
   *  this week", which would need a per-day delta nothing records. */
  const weekWords = useMemo(
    () => notes.filter((n) => daysSince(n.updatedAt) <= 7).reduce((sum, n) => sum + n.wordCount, 0),
    [notes],
  );

  const focus = useMemo(() => {
    const open = tasks.filter((t) => t.state !== 'done');
    // Same ranking the todo rail used, now read off the one model: overdue
    // first, then due today, then everything else; deep work outranks a quick
    // pass within a band, since it is the thing that needs the sitting.
    const rank = (t: Task) =>
      (t.when === 'overdue' ? 0 : t.when === 'today' ? 1 : t.when === 'week' ? 2 : 3) * 10 +
      (t.effort === 'deep' ? 0 : t.effort === 'waiting' ? 2 : 1);
    const scored = [...open]
      .sort((a, b) => rank(a) - rank(b) || a.order - b.order)
      .map((t) => ({ task: t, overdue: t.when === 'overdue', dueToday: t.when === 'today' }));

    const board = {
      backlog: tasks.filter((t) => t.state === 'backlog').length,
      doing: tasks.filter((t) => t.state === 'doing').length,
      review: tasks.filter((t) => t.state === 'review').length,
      done: tasks.filter((t) => t.state === 'done').length,
    };

    return {
      todos: scored.slice(0, 6),
      openCount: open.length,
      overdueCount: scored.filter((s) => s.overdue).length,
      board,
      boardTotal: tasks.length,
      unread: libraryItems.filter((i) => i.status === 'unread').length,
    };
  }, [tasks, libraryItems]);

  const lead = stats.recentlyEdited[0] ?? null;
  const recent = stats.recentlyEdited.slice(0, 5);

  const dateline = [
    new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    greeting(),
    plural(notes.length, 'note'),
    plural(linkGraph.edges.length, 'connection'),
  ].join(' · ');

  const boardSegments = [
    { key: 'backlog', n: focus.board.backlog, bg: 'var(--bd2)' },
    { key: 'doing', n: focus.board.doing, bg: 'var(--acc)' },
    { key: 'review', n: focus.board.review, bg: 'var(--amb)' },
    { key: 'done', n: focus.board.done, bg: 'var(--grn)' },
  ].filter((s) => s.n > 0);

  const places: { name: string; count: string; go: () => void }[] = [
    { name: 'Notes', count: String(notes.length), go: () => onNavigate('notes') },
    { name: 'Graph', count: String(linkGraph.edges.length), go: onViewGraph },
    { name: 'Board', count: String(tasks.length), go: () => onNavigate('kanban') },
    { name: 'Library', count: String(libraryItems.length), go: () => onNavigate('reading') },
    { name: 'Tags', count: String(tagCount), go: () => onNavigate('tags') },
    { name: 'Search', count: '⌘K', go: () => onNavigate('search') },
  ];

  return (
    <div
      className="sb-scroll sb-front-page"
      style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', background: 'var(--bg)', padding: '32px 40px 52px' }}
    >
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>

        {/* ============ 1. Masthead ============ */}
        <div
          style={{
            borderBottom: '3px double var(--bd2)', paddingBottom: 12,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24,
          }}
        >
          <span
            className="sb-front-serif"
            style={{ fontSize: 40, fontWeight: 700, letterSpacing: '0.02em', lineHeight: 1, color: 'var(--t1)' }}
          >
            Braindot
          </span>
          <span
            className="sb-fig"
            style={{ fontSize: 10.5, color: 'var(--t3)', letterSpacing: '0.04em', paddingBottom: 4, textAlign: 'right' }}
          >
            {dateline}
          </span>
        </div>

        {/* ============ 2. Lead + recently edited ============ */}
        <div
          className="sb-front-lead"
          style={{
            display: 'grid', gridTemplateColumns: 'minmax(440px, 1.55fr) minmax(260px, 1fr)',
            gap: '0 34px', padding: '22px 0 20px', borderBottom: '1px solid var(--bd)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, paddingRight: 34, borderRight: '1px solid var(--bd)', minWidth: 0 }}>
            {lead ? (
              <>
                <Kicker text="where you left off" color="var(--acc2)" />
                <button
                  onClick={() => onOpenNote(lead.id)}
                  className="sb-front-serif"
                  style={{
                    display: 'block', background: 'transparent', border: 'none', padding: 0,
                    textAlign: 'left', cursor: 'pointer', fontSize: 33, lineHeight: 1.1, fontWeight: 700,
                    letterSpacing: '-0.02em', color: 'var(--t1)', textWrap: 'pretty',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
                >
                  {lead.title}
                </button>
                <p
                  className="sb-front-serif"
                  style={{
                    margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--t2)', maxWidth: '58ch',
                    textAlign: 'justify', hyphens: 'auto', WebkitHyphens: 'auto',
                  }}
                >
                  {excerpt(lead.body)}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
                  <span className="sb-fig" style={{ fontSize: 10.5, color: 'var(--t3)' }}>
                    {plural(lead.wordCount, 'word')} · {plural(linkGraph.degree.get(lead.id) || 0, 'link')} ·
                    {' '}edited {relativeTime(lead.updatedAt)}
                  </span>
                  <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <OutlineButton label="study this" onClick={onStudyMode} />
                    <PrimaryButton label="resume writing" onClick={() => onOpenNote(lead.id)} />
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="sb-front-serif" style={{ fontSize: 33, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--t1)' }}>
                  Nothing here yet.
                </div>
                <p className="sb-front-serif" style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--t2)', maxWidth: '58ch' }}>
                  Braindot gets useful once links start finding each other. Write the first note, or import a folder of
                  markdown you already have.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <PrimaryButton label="write the first note" onClick={onCreateNote} />
                  <OutlineButton label="import markdown" onClick={() => document.getElementById('sb-import-input')?.click()} />
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Kicker text="recently edited" color="var(--t2)" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {recent.length === 0 ? (
                <Empty text="Nothing edited yet." />
              ) : (
                recent.map((n) => <NoteRow key={n.id} note={n} onOpen={() => onOpenNote(n.id)} />)
              )}
            </div>
          </div>
        </div>

        {/* ============ 3. Today / Progress / Elsewhere ============ */}
        <div
          className="sb-front-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(380px, 1.2fr) minmax(210px, 1fr) minmax(210px, 1fr)',
            gap: 0, paddingTop: 22,
          }}
        >
          {/* ---- Today ---- */}
          <div style={{ paddingRight: 30, borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 13, minWidth: 0 }}>
            <Kicker
              text="today"
              color="var(--t2)"
              trailing={
                focus.openCount === 0
                  ? undefined
                  : `— ${focus.openCount} open${focus.overdueCount > 0 ? ` · ${focus.overdueCount} overdue` : ''}`
              }
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {focus.todos.length === 0 ? (
                <Empty text="Nothing due. The list is clear." />
              ) : (
                focus.todos.map(({ task, overdue, dueToday }, i) => {
                  const later = !overdue && !dueToday;
                  return (
                    <button
                      key={task.id}
                      onClick={() => onToggleTask(task.id)}
                      title="Mark done"
                      style={{
                        display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0', width: '100%',
                        background: 'transparent', border: 'none', borderBottom: '1px solid var(--bd)',
                        fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', color: 'inherit',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span className="sb-fig" style={{ fontSize: 9.5, color: 'var(--t3)', flexShrink: 0, width: 15 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        style={{
                          flex: 1, minWidth: 0, fontSize: 12, color: later ? 'var(--t2)' : 'var(--t1)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {task.title}
                      </span>
                      {(overdue || dueToday) && (
                        <span
                          style={{
                            fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0,
                            color: overdue ? 'var(--red)' : 'var(--amb)',
                          }}
                        >
                          {overdue ? 'overdue' : 'today'}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {focus.boardTotal === 0 ? (
              <span style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>No cards on the board.</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                <span style={{ flex: 1, display: 'flex', height: 5, gap: 2, minWidth: 0 }}>
                  {boardSegments.map((s) => (
                    <span key={s.key} title={`${s.n} ${s.key}`} style={{ borderRadius: 2, flex: s.n, background: s.bg }} />
                  ))}
                </span>
                <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
                  {focus.board.done} of {focus.boardTotal} done
                </span>
              </div>
            )}
          </div>

          {/* ---- Progress ---- */}
          <div style={{ padding: '0 30px', borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Kicker text="progress" color="var(--t2)" />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
              <span
                className="sb-front-serif sb-fig"
                style={{ fontSize: 52, lineHeight: 0.86, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--t1)' }}
              >
                {streak}
              </span>
              {/* Just the label. The fortnight's active-day count is a ruled
                  fact below, and repeating it here invited the streak and the
                  bars to contradict each other in front of the reader. */}
              <span style={{ fontSize: 10.5, color: 'var(--t3)', paddingBottom: 6, lineHeight: 1.5 }}>
                day streak
                {streak === 0 && <><br />write today to start one</>}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
              {fortnight.map((d) => (
                <span
                  key={d.key}
                  title={`${d.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} — ${plural(d.count, 'event')}`}
                  style={{
                    flex: 1, borderRadius: 1,
                    height: d.count === 0 ? 2 : Math.max(3, Math.round((d.count / fortnightPeak) * 44)),
                    background: d.count === 0 ? 'var(--bg3)' : d.isToday ? 'var(--acc2)' : 'var(--acc)',
                  }}
                />
              ))}
            </div>
            <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.02em' }}>
              events per day, last fortnight
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 2 }}>
              <Fact label="active days, fortnight" value={`${activeDays} of 14`} />
              <Fact label="words in notes touched this week" value={weekWords.toLocaleString('en-GB')} />
              <Fact label="notes evergreen" value={`${stats.evergreenCount} of ${notes.length}`} />
            </div>
          </div>

          {/* ---- Elsewhere ---- */}
          <div style={{ paddingLeft: 30, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Kicker text="elsewhere" color="var(--t2)" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {places.map((p) => (
                <HoverRow key={p.name} onClick={p.go}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--t1)' }}>{p.name}</span>
                  <span className="sb-fig" style={{ fontSize: 10.5, color: 'var(--t3)' }}>{p.count}</span>
                  <span style={{ fontSize: 11, color: 'var(--acc2)' }}>→</span>
                </HoverRow>
              ))}
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <FootLink icon={Plus} label="new note" onClick={onCreateNote} />
              <FootLink icon={Calendar} label="daily journal" onClick={onCreateJournal} />
              <FootLink icon={Sparkles} label="ask ai" onClick={onAskAI} />
              {/* Two exports doing two jobs. The JSON one pairs with import
                  next to it — that is backup and restore. The markdown one is
                  the exit: a folder of files that opens without this app. */}
              <FootLink icon={Download} label="backup (json)" onClick={onExportVault} />
              <FootLink
                icon={FolderDown}
                label={exportBusy ? 'exporting…' : 'export markdown'}
                onClick={onExportMarkdown}
                disabled={exportBusy}
              />
              <FootLink
                icon={Upload}
                label="import"
                onClick={() => document.getElementById('sb-import-input')?.click()}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        id="sb-import-input"
        type="file"
        accept=".json,.md,.txt"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            Array.from(files).forEach((f) => onImportVault(f));
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}

/* ---------- Apparatus ---------- */

/** A column's name. Mono, small, letterspaced — it labels, it does not shout. */
function Kicker({ text, color, trailing }: { text: string; color: string; trailing?: string }) {
  return (
    <span style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>
      {text}
      {trailing && (
        <span className="sb-fig" style={{ color: 'var(--t3)', letterSpacing: '0.04em', textTransform: 'none' }}>
          {' '}
          {trailing}
        </span>
      )}
    </span>
  );
}

/** One ruled fact: label left, figure right. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11,
        padding: '7px 0', borderBottom: '1px solid var(--bd)',
      }}
    >
      <span style={{ color: 'var(--t2)', flex: 1, minWidth: 0 }}>{label}</span>
      <span className="sb-fig" style={{ color: 'var(--t1)', flexShrink: 0 }}>{value}</span>
    </div>
  );
}

/* ---------- Buttons ---------- */

function PrimaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 14px',
        background: 'var(--acc)',
        color: '#fff',
        // No border: it was the accent over itself. Nothing on this page
        // carries a fill and a border at once.
        border: 'none',
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--acc)'; }}
    >
      {label}
      <ArrowRight size={13} />
    </button>
  );
}

function OutlineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 30,
        padding: '0 13px',
        background: 'transparent',
        border: '1px solid var(--bd2)',
        borderRadius: 5,
        color: 'var(--t2)',
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
    >
      {label === 'study this' && <GraduationCap size={12} />}
      {label}
    </button>
  );
}

function FootLink({ icon: Icon, label, onClick, disabled = false }: {
  icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        color: 'var(--t3)',
        fontSize: 10.5,
        fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = 'var(--acc2)'; }}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t3)')}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

/* ---------- Rows ---------- */

/**
 * The page's one interactive shape. A rule underneath, never a box around:
 * nothing here carries both a border and a fill at rest.
 */
function HoverRow({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 10,
        padding: '8px 0',
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--bd)',
        fontFamily: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 11.5, color: 'var(--t3)', padding: '14px 0' }}>{text}</div>;
}

function NoteRow({ note, onOpen }: { note: Note; onOpen: () => void }) {
  return (
    <HoverRow onClick={onOpen} title={note.title}>
      <span
        title={note.status}
        style={{
          width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
          background: note.status === 'evergreen' ? 'var(--grn)' : 'var(--t3)',
        }}
      />
      <span
        style={{
          flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--t1)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {note.title}
      </span>
      <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
        {relativeTime(note.updatedAt)}
      </span>
    </HoverRow>
  );
}
