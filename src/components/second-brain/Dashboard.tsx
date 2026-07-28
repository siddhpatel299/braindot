'use client';

import { useId, useMemo, useState } from 'react';
import { Note, TodoItem, KanbanCardItem, LibraryItem, Highlight } from '@/types';
import { forceDirectedLayout } from '@/utils/graph';
import { relativeTime, plural } from '@/utils/markdown';
import { LucideIcon } from 'lucide-react';
import {
  ArrowRight, Sparkles, Calendar, Hash, Download, Upload, Unlink, Clock,
  BookOpen, Circle, CheckCircle2, GraduationCap, Plus,
} from 'lucide-react';

interface DashboardProps {
  notes: Note[];
  streak: number;
  todos: TodoItem[];
  kanbanCards: KanbanCardItem[];
  libraryItems: LibraryItem[];
  highlights: Highlight[];
  onOpenNote: (id: string) => void;
  onCreateNote: () => void;
  onCreateJournal: () => void;
  onAskAI: () => void;
  onStudyMode: () => void;
  onViewGraph: () => void;
  onExportVault: () => void;
  onImportVault: (file: File) => void;
  onToggleTodo: (id: string) => void;
  onNavigate: (view: 'kanban' | 'reading' | 'search') => void;
}

/* ---------- date helpers ---------- */

const DAY_MS = 86400000;

/** Local YYYY-MM-DD key — must be local, not UTC, or the heatmap shifts a day. */
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

export function Dashboard({
  notes,
  streak,
  todos,
  kanbanCards,
  libraryItems,
  highlights,
  onOpenNote,
  onCreateNote,
  onCreateJournal,
  onAskAI,
  onStudyMode,
  onViewGraph,
  onExportVault,
  onImportVault,
  onToggleTodo,
  onNavigate,
}: DashboardProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

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

  const layout = useMemo(
    () => forceDirectedLayout(notes.map((n) => n.id), linkGraph.edges, null, 600, 400, 400),
    [notes, linkGraph.edges],
  );

  const stats = useMemo(() => {
    const totalWords = notes.reduce((sum, n) => sum + n.wordCount, 0);
    const evergreenCount = notes.filter((n) => n.status === 'evergreen').length;
    const recentlyEdited = [...notes].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return { totalWords, evergreenCount, draftCount: notes.length - evergreenCount, recentlyEdited };
  }, [notes]);

  /* ---------- activity: every dated event in the vault ---------- */
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
    for (const t of todos) bump(t.createdAt);
    for (const c of kanbanCards) bump(c.createdAt);
    for (const h of highlights) bump(h.createdAt);
    for (const l of libraryItems) bump(l.addedAt);

    // 53 columns ending with the current week, aligned to Sunday.
    const end = startOfDay(new Date());
    const lastSunday = new Date(end);
    lastSunday.setDate(lastSunday.getDate() - lastSunday.getDay());
    const firstSunday = new Date(lastSunday);
    firstSunday.setDate(firstSunday.getDate() - 52 * 7);

    const weeks: { key: string; date: Date; count: number; future: boolean }[][] = [];
    const byMonth = new Map<number, number>();
    let total = 0;
    let activeDays = 0;
    let best = 0;
    let gap = 0;
    let longestGap = 0;
    let gapEnd: Date | null = null;
    // Only count gaps *between* recorded activity. The empty stretch before the
    // vault existed is not a lapse, and reporting it says "290 day gap" on a
    // week-old vault.
    let started = false;

    for (let w = 0; w < 53; w++) {
      const col: { key: string; date: Date; count: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(firstSunday);
        date.setDate(date.getDate() + w * 7 + d);
        const key = dayKey(date);
        const count = byDay.get(key) || 0;
        const future = date.getTime() > end.getTime();
        if (!future) {
          total += count;
          if (count > 0) {
            activeDays++;
            started = true;
            gap = 0;
          } else if (started) {
            gap++;
            if (gap > longestGap) {
              longestGap = gap;
              gapEnd = new Date(date);
            }
          }
          if (count > best) best = count;
          byMonth.set(date.getMonth(), (byMonth.get(date.getMonth()) || 0) + count);
        }
        col.push({ key, date, count, future });
      }
      weeks.push(col);
    }

    const busiest = Array.from(byMonth.entries()).sort((a, b) => b[1] - a[1])[0];
    const monthName = (m: number) => new Date(2000, m, 1).toLocaleDateString('en-US', { month: 'long' });

    return {
      weeks,
      total,
      activeDays,
      best,
      byDay,
      // Plain English beats a colour legend nobody acts on.
      summary:
        total === 0
          ? 'No activity recorded yet.'
          : [
              busiest && busiest[1] > 0 ? `Busiest in ${monthName(busiest[0])} — ${plural(busiest[1], 'event')}.` : '',
              longestGap > 2 && gapEnd
                ? `Longest gap: ${longestGap} days to ${gapEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
                : '',
            ]
              .filter(Boolean)
              .join(' '),
    };
  }, [notes, todos, kanbanCards, highlights, libraryItems]);

  const week = useMemo(() => {
    const out: { label: string; key: string; active: boolean; today: boolean }[] = [];
    const today = startOfDay(new Date());
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      const key = dayKey(d);
      out.push({
        label: ['s', 'm', 't', 'w', 't', 'f', 's'][d.getDay()],
        key,
        active: (activity.byDay.get(key) || 0) > 0,
        today: i === 0,
      });
    }
    return out;
  }, [activity.byDay]);

  const tagStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      if (n.tags.length === 0) m.set('untagged', (m.get('untagged') || 0) + 1);
      else for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  const hubs = useMemo(
    () =>
      [...notes]
        .map((n) => ({ note: n, degree: linkGraph.degree.get(n.id) || 0 }))
        .filter((x) => x.degree > 0)
        .sort((a, b) => b.degree - a.degree)
        .slice(0, 5),
    [notes, linkGraph.degree],
  );

  const health = useMemo(() => {
    const orphans: Note[] = [];
    const untagged: Note[] = [];
    const stale: Note[] = [];
    const aging: Note[] = [];
    for (const n of notes) {
      if ((linkGraph.degree.get(n.id) || 0) === 0) orphans.push(n);
      if (n.tags.length === 0) untagged.push(n);
      if (n.status === 'evergreen' && daysSince(n.updatedAt) > 30) stale.push(n);
      if (n.status === 'draft' && daysSince(n.createdAt) > 14 && daysSince(n.updatedAt) > 14) aging.push(n);
    }
    // One row per note — the most urgent reason wins, so nothing is listed twice.
    const seen = new Set<string>();
    const items: { note: Note; reason: string; color: string; icon: LucideIcon }[] = [];
    const push = (list: Note[], reason: string, color: string, icon: LucideIcon) => {
      for (const n of list) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        items.push({ note: n, reason, color, icon });
      }
    };
    push(orphans, 'no links', 'var(--red)', Unlink);
    push(stale, 'stale', 'var(--amb)', Clock);
    push(aging, 'aging draft', 'var(--amb)', Clock);
    push(untagged, 'untagged', 'var(--t2)', Hash);

    const connectedPct = notes.length === 0 ? 0 : Math.round(((notes.length - orphans.length) / notes.length) * 100);
    return {
      items: items.slice(0, 5),
      summary: [
        `${connectedPct}% of notes connected`,
        orphans.length > 0 ? plural(orphans.length, 'orphan') : '',
        stale.length > 0 ? `${stale.length} stale evergreen${stale.length === 1 ? '' : 's'}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }, [notes, linkGraph.degree]);

  const focus = useMemo(() => {
    const todayK = dayKey(new Date());
    const open = todos.filter((t) => !t.done);
    const scored = open
      .map((t) => {
        const dueK = t.dueDate ? dayKey(t.dueDate) : null;
        const overdue = dueK !== null && dueK < todayK;
        const dueToday = t.dueGroup === 'today' || dueK === todayK;
        const prio = { urgent: 0, high: 1, medium: 2, low: 3 }[t.priority] ?? 2;
        return { todo: t, overdue, dueToday, rank: (overdue ? 0 : dueToday ? 1 : 2) * 10 + prio };
      })
      .sort((a, b) => a.rank - b.rank);

    const board = {
      backlog: kanbanCards.filter((c) => c.status === 'backlog').length,
      'in-progress': kanbanCards.filter((c) => c.status === 'in-progress').length,
      review: kanbanCards.filter((c) => c.status === 'review').length,
      done: kanbanCards.filter((c) => c.status === 'done').length,
    };

    const reading =
      [...libraryItems].filter((i) => i.status === 'reading').sort((a, b) => b.progress - a.progress)[0] ?? null;

    return {
      todos: scored.slice(0, 6),
      openCount: open.length,
      overdueCount: scored.filter((s) => s.overdue).length,
      board,
      boardTotal: kanbanCards.length,
      reading,
      unread: libraryItems.filter((i) => i.status === 'unread').length,
    };
  }, [todos, kanbanCards, libraryItems]);

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const resume = stats.recentlyEdited[0] ?? null;
  const maxTagCount = tagStats.length > 0 ? tagStats[0][1] : 1;

  return (
    <div
      className="sb-scroll"
      style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', padding: '36px 44px 56px' }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 30 }}>

        {/* ============ Hero: the vault's subject, not a stats readout ============ */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 11,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--t2)',
                marginBottom: 16,
              }}
            >
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {greeting()}
            </div>

            {resume ? (
              <>
                <div style={{ fontSize: 12, color: 'var(--acc2)', letterSpacing: '0.06em', marginBottom: 9 }}>
                  pick up where you left off
                </div>
                <button
                  onClick={() => onOpenNote(resume.id)}
                  className="sb-reading"
                  style={{
                    display: 'block',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 32,
                    fontWeight: 700,
                    letterSpacing: '-0.022em',
                    lineHeight: 1.15,
                    color: 'var(--t1)',
                    marginBottom: 12,
                    maxWidth: '100%',
                  }}
                >
                  {resume.title}
                </button>
                <p
                  className="sb-reading"
                  style={{
                    margin: 0,
                    fontSize: 15,
                    lineHeight: 1.75,
                    color: 'var(--t2)',
                    maxWidth: '62ch',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {excerpt(resume.body) || 'Empty note — start writing.'}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginTop: 16,
                    fontSize: 10.5,
                    color: 'var(--t2)',
                    flexWrap: 'wrap',
                  }}
                >
                  {resume.status === 'evergreen' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--grn)' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--grn)' }} />
                      evergreen
                    </span>
                  )}
                  <span>{plural(resume.wordCount, 'word')}</span>
                  <span>{plural(linkGraph.degree.get(resume.id) || 0, 'link')}</span>
                  {resume.tags.slice(0, 2).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                  <span style={{ color: 'var(--t3)' }}>edited {relativeTime(resume.updatedAt)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
                  Nothing here yet.
                </div>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, color: 'var(--t2)', maxWidth: '58ch' }}>
                  Braindot gets useful once links start finding each other. Write the first note, or import a folder of
                  markdown you already have.
                </p>
              </>
            )}
          </div>

          {/* Actions + streak */}
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {resume ? (
                <>
                  <SecondaryButton icon={GraduationCap} label="study this" onClick={onStudyMode} />
                  <SecondaryButton icon={Sparkles} label="ask AI" onClick={onAskAI} />
                  <PrimaryButton label="resume writing" onClick={() => onOpenNote(resume.id)} />
                </>
              ) : (
                <PrimaryButton label="write the first note" onClick={onCreateNote} />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1 }}>{streak}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>day streak</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {week.map((d, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div
                      title={d.key}
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        background: d.active ? 'var(--acc)' : 'var(--bg3)',
                        border: `1px solid ${d.today ? 'var(--acc2)' : 'transparent'}`,
                      }}
                    />
                    <span style={{ fontSize: 9, color: d.today ? 'var(--acc2)' : 'var(--t3)' }}>{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ============ Activity + Today ============ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18 }}>
          <Panel title="Activity" meta={`${plural(activity.total, 'event')} · ${activity.activeDays} active days`}>
            <ActivityHeatmap weeks={activity.weeks} />
            <div
              style={{
                marginTop: 16,
                paddingTop: 12,
                borderTop: '1px solid var(--bd)',
                fontSize: 11,
                color: 'var(--t2)',
              }}
            >
              {activity.summary}
            </div>
          </Panel>

          <Panel
            title="Today"
            meta={
              focus.openCount === 0
                ? 'nothing open'
                : `${focus.openCount} open${focus.overdueCount > 0 ? ` · ${focus.overdueCount} overdue` : ''}`
            }
          >
            <FocusPanel focus={focus} onToggleTodo={onToggleTodo} onNavigate={onNavigate} />
          </Panel>
        </div>

        {/* ============ Recent + graph ============ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Panel title="Recently edited" meta={`all ${plural(notes.length, 'note')}`}>
            {stats.recentlyEdited.length === 0 ? (
              <Empty text="nothing edited yet" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {stats.recentlyEdited.slice(0, 6).map((n) => (
                  <NoteRow key={n.id} note={n} degree={linkGraph.degree.get(n.id) || 0} onOpen={() => onOpenNote(n.id)} />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Knowledge graph"
            action={{ label: 'open graph', onClick: onViewGraph }}
          >
            <DashboardGraph
              graph={layout}
              noteById={noteById}
              hoveredNode={hoveredNode}
              onHover={setHoveredNode}
              onOpenNote={onOpenNote}
            />
          </Panel>
        </div>

        {/* ============ Vault health — one panel replacing four ============ */}
        <Panel title="Vault health" meta={health.summary}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <HealthColumn label="needs attention">
              {health.items.length === 0 ? (
                <Empty text="nothing to fix" />
              ) : (
                health.items.map(({ note, reason, color, icon: Icon }) => (
                  <HoverRow key={note.id} onClick={() => onOpenNote(note.id)}>
                    <Icon size={12} color={color} style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: 'var(--t1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note.title}
                    </span>
                    <span style={{ fontSize: 10, color, flexShrink: 0 }}>{reason}</span>
                  </HoverRow>
                ))
              )}
            </HealthColumn>

            <HealthColumn label="most connected" divider>
              {hubs.length === 0 ? (
                <Empty text="no links yet" />
              ) : (
                hubs.map(({ note, degree }) => (
                  <HoverRow key={note.id} onClick={() => onOpenNote(note.id)}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: 'var(--t1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {note.title}
                    </span>
                    <MiniBar pct={(degree / Math.max(hubs[0].degree, 1)) * 100} color="var(--acc)" />
                    <span style={{ fontSize: 10, color: 'var(--t2)', width: 12, textAlign: 'right', flexShrink: 0 }}>
                      {degree}
                    </span>
                  </HoverRow>
                ))
              )}
            </HealthColumn>

            <HealthColumn label="tags" divider>
              {tagStats.length === 0 ? (
                <Empty text="no tags yet" />
              ) : (
                tagStats.slice(0, 5).map(([tag, count]) => (
                  <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 12,
                        color: tag === 'untagged' ? 'var(--t2)' : 'var(--t1)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tag === 'untagged' ? 'untagged' : `#${tag}`}
                    </span>
                    <MiniBar
                      pct={(count / maxTagCount) * 100}
                      color={tag === 'untagged' ? 'var(--t3)' : 'var(--acc)'}
                    />
                    <span style={{ fontSize: 10, color: 'var(--t2)', width: 12, textAlign: 'right', flexShrink: 0 }}>
                      {count}
                    </span>
                  </div>
                ))
              )}
            </HealthColumn>
          </div>
        </Panel>

        {/* ============ Quiet foot: the numbers, plus the actions with no other home ============ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 10.5,
            color: 'var(--t3)',
            flexWrap: 'wrap',
          }}
        >
          <span>{plural(notes.length, 'note')}</span>
          <span>{plural(linkGraph.edges.length, 'connection')}</span>
          <span>{plural(stats.totalWords, 'word')}</span>
          <span>
            {stats.evergreenCount} evergreen · {stats.draftCount} draft
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
            <FootLink icon={Plus} label="new note" onClick={onCreateNote} />
            <FootLink icon={Calendar} label="daily journal" onClick={onCreateJournal} />
            <FootLink icon={Download} label="export" onClick={onExportVault} />
            <FootLink
              icon={Upload}
              label="import"
              onClick={() => document.getElementById('sb-import-input')?.click()}
            />
          </span>
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

/* ---------- Buttons ---------- */

function PrimaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 34,
        padding: '0 16px',
        background: 'var(--acc)',
        color: '#fff',
        border: '1px solid var(--acc)',
        borderRadius: 6,
        fontSize: 12.5,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--acc2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--acc)')}
    >
      {label}
      <ArrowRight size={14} />
    </button>
  );
}

function SecondaryButton({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 34,
        padding: '0 14px',
        background: 'transparent',
        color: 'var(--t2)',
        border: '1px solid var(--bd2)',
        borderRadius: 6,
        fontSize: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--t1)';
        e.currentTarget.style.borderColor = 'var(--acc-bd)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--t2)';
        e.currentTarget.style.borderColor = 'var(--bd2)';
      }}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function FootLink({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        color: 'var(--t3)',
        fontSize: 10.5,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--acc2)')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t3)')}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

/* ---------- Panel shell ---------- */

function Panel({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--bg1)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
        padding: '16px 18px 18px',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {/* Sentence case at readable weight — these are headings, not shouty labels. */}
        <h2 style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', letterSpacing: '0.02em', margin: 0 }}>
          {title}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {meta && (
            <span
              style={{
                fontSize: 10.5,
                color: 'var(--t3)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {meta}
            </span>
          )}
          {action && (
            <button
              onClick={action.onClick}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--acc2)',
                fontSize: 10.5,
                fontFamily: 'inherit',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--t1)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--acc2)')}
            >
              {action.label}
              <ArrowRight size={11} />
            </button>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function HealthColumn({
  label,
  divider,
  children,
}: {
  label: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: divider ? '0 0 0 28px' : '0 28px 0 0',
        marginLeft: divider ? 28 : 0,
        borderLeft: divider ? '1px solid var(--bd)' : 'none',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--t2)',
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <span
      style={{
        width: 56,
        height: 3,
        background: 'var(--bg3)',
        borderRadius: 2,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'block',
      }}
    >
      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
    </span>
  );
}

/* ---------- Small primitives ---------- */

function HoverRow({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderRadius: 5,
        padding: '7px 8px',
        margin: '0 -8px',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: 'calc(100% + 16px)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 11.5, color: 'var(--t3)', padding: '14px 0' }}>{text}</div>;
}

/* ---------- Note rows ---------- */

function NoteRow({ note, degree, onOpen }: { note: Note; degree: number; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--bd)',
        borderRadius: 0,
        padding: '11px 8px',
        margin: '0 -8px',
        width: 'calc(100% + 16px)',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        title={note.status}
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: note.status === 'evergreen' ? 'var(--grn)' : 'var(--t3)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12.5,
          color: 'var(--t1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {note.title}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--t3)', flexShrink: 0 }}>
        {plural(note.wordCount, 'word')} · {plural(degree, 'link')}
      </span>
      <span style={{ fontSize: 10.5, color: 'var(--t3)', flexShrink: 0, width: 52, textAlign: 'right' }}>
        {relativeTime(note.updatedAt)}
      </span>
    </button>
  );
}

/* ---------- Today / focus ---------- */

interface FocusData {
  todos: { todo: TodoItem; overdue: boolean; dueToday: boolean }[];
  openCount: number;
  overdueCount: number;
  board: Record<string, number>;
  boardTotal: number;
  reading: LibraryItem | null;
  unread: number;
}

const PRIORITY_RING: Record<string, string> = {
  urgent: 'var(--red)',
  high: 'var(--amb)',
  medium: 'var(--t3)',
  low: 'var(--t3)',
};

function FocusPanel({
  focus,
  onToggleTodo,
  onNavigate,
}: {
  focus: FocusData;
  onToggleTodo: (id: string) => void;
  onNavigate: (view: 'kanban' | 'reading' | 'search') => void;
}) {
  const boardOrder: { key: string; color: string }[] = [
    { key: 'backlog', color: 'var(--bd2)' },
    { key: 'in-progress', color: 'var(--acc)' },
    { key: 'review', color: 'var(--amb)' },
    { key: 'done', color: 'var(--grn)' },
  ];
  const done = focus.board.done || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {focus.todos.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {focus.todos.map(({ todo, overdue, dueToday }) => (
            <div
              key={todo.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 0',
                fontSize: 12,
                borderBottom: '1px solid var(--bd)',
              }}
            >
              <button
                onClick={() => onToggleTodo(todo.id)}
                aria-label={`complete ${todo.text}`}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  border: `1.5px solid ${overdue ? 'var(--red)' : PRIORITY_RING[todo.priority] ?? 'var(--t3)'}`,
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: overdue || dueToday ? 'var(--t1)' : 'var(--t2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {todo.text}
              </span>
              {overdue ? (
                <span style={{ fontSize: 10, color: 'var(--red)', flexShrink: 0 }}>overdue</span>
              ) : dueToday ? (
                <span style={{ fontSize: 10, color: 'var(--amb)', flexShrink: 0 }}>today</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12 }}>
          <CheckCircle2 size={13} color="var(--grn)" />
          <span style={{ color: 'var(--t2)' }}>no open tasks</span>
          <button
            onClick={() => onNavigate('kanban')}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--acc2)',
              fontSize: 10.5,
              fontFamily: 'inherit',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            add one →
          </button>
        </div>
      )}

      {/* Board progress — a single bar, not four labelled counts */}
      {focus.boardTotal > 0 && (
        <button
          onClick={() => onNavigate('kanban')}
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span style={{ flex: 1, display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
            {boardOrder.map((s) =>
              (focus.board[s.key] || 0) > 0 ? (
                <span
                  key={s.key}
                  title={`${s.key}: ${focus.board[s.key]}`}
                  style={{ flex: focus.board[s.key], background: s.color, borderRadius: 2 }}
                />
              ) : null,
            )}
          </span>
          <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
            {done} of {focus.boardTotal} done
          </span>
        </button>
      )}

      {/* Reading */}
      <div style={{ marginTop: 'auto', paddingTop: 18 }}>
        {focus.reading ? (
          <button
            onClick={() => onNavigate('reading')}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <BookOpen size={12} color="var(--t2)" style={{ flexShrink: 0 }} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11.5,
                  color: 'var(--t2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {focus.reading.title}
              </span>
              <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>
                {Math.round(focus.reading.progress)}%
              </span>
            </div>
            <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(Math.max(focus.reading.progress, 0), 100)}%`,
                  background: 'var(--t2)',
                  borderRadius: 2,
                }}
              />
            </div>
          </button>
        ) : (
          <button
            onClick={() => onNavigate('reading')}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              fontSize: 11,
              color: 'var(--t3)',
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--acc2)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--t3)')}
          >
            <BookOpen size={12} />
            {focus.unread > 0 ? `${plural(focus.unread, 'unread item')} in the library` : 'library is empty'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Activity heatmap ---------- */

const HEAT_OPACITY = [0, 0.28, 0.5, 0.75, 1];

function heatLevel(count: number, ceiling: number): number {
  if (count <= 0) return 0;
  const step = Math.max(ceiling / 4, 1);
  return Math.min(4, Math.ceil(count / step));
}

function ActivityHeatmap({ weeks }: { weeks: { key: string; date: Date; count: number; future: boolean }[][] }) {
  const CELL = 11;
  const GAP = 3;
  const PITCH = CELL + GAP;
  const LEFT = 26;
  const TOP = 14;
  const W = LEFT + weeks.length * PITCH - GAP;
  const H = TOP + 7 * PITCH - GAP;

  const ceiling = Math.max(...weeks.flat().map((d) => d.count), 1);

  const monthLabels: { x: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((col, i) => {
    const m = col[0].date.getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      monthLabels.push({ x: LEFT + i * PITCH, label: col[0].date.toLocaleDateString('en-US', { month: 'short' }) });
    }
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', maxWidth: W * 1.5 }}>
      {monthLabels.map((m, i) => (
        <text key={i} x={m.x} y={9} fontSize={8.5} fill="var(--t2)">
          {m.label}
        </text>
      ))}
      {[1, 3, 5].map((d) => (
        <text key={d} x={0} y={TOP + d * PITCH + CELL - 2} fontSize={8.5} fill="var(--t2)">
          {['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d]}
        </text>
      ))}
      {weeks.map((col, wi) =>
        col.map((day, di) => {
          if (day.future) return null;
          const level = heatLevel(day.count, ceiling);
          return (
            <rect
              key={day.key}
              x={LEFT + wi * PITCH}
              y={TOP + di * PITCH}
              width={CELL}
              height={CELL}
              rx={2.5}
              fill={level === 0 ? 'var(--bg3)' : 'var(--acc)'}
              fillOpacity={level === 0 ? 1 : HEAT_OPACITY[level]}
            >
              <title>{`${plural(day.count, 'event')} on ${day.date.toDateString()}`}</title>
            </rect>
          );
        }),
      )}
    </svg>
  );
}

/* ---------- Dashboard graph ---------- */

function DashboardGraph({
  graph,
  noteById,
  hoveredNode,
  onHover,
  onOpenNote,
}: {
  graph: ReturnType<typeof forceDirectedLayout>;
  noteById: Map<string, Note>;
  hoveredNode: string | null;
  onHover: (id: string | null) => void;
  onOpenNote: (id: string) => void;
}) {
  const uid = useId().replace(/:/g, '');
  const W = 600;
  const H = 250;

  if (graph.nodes.length === 0) {
    return <Empty text="no notes yet" />;
  }

  const padding = 26;
  const xs = graph.nodes.map((n) => n.x);
  const ys = graph.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (W - padding * 2) / Math.max(maxX - minX, 1),
    (H - padding * 2) / Math.max(maxY - minY, 1),
  );
  const offsetX = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (H - (maxY - minY) * scale) / 2 - minY * scale;
  const sx = (x: number) => x * scale + offsetX;
  const sy = (y: number) => y * scale + offsetY;

  const neighbours = new Set<string>();
  if (hoveredNode) {
    for (const e of graph.edges) {
      if (e.from === hoveredNode) neighbours.add(e.to);
      if (e.to === hoveredNode) neighbours.add(e.from);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          <radialGradient id={`node-glow-${uid}`}>
            <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--acc)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {graph.edges.map((e, i) => {
          const a = graph.nodes.find((n) => n.id === e.from);
          const b = graph.nodes.find((n) => n.id === e.to);
          if (!a || !b) return null;
          const lit = hoveredNode !== null && (e.from === hoveredNode || e.to === hoveredNode);
          const dim = hoveredNode !== null && !lit;
          const mx = (sx(a.x) + sx(b.x)) / 2 + (sy(b.y) - sy(a.y)) * 0.08;
          const my = (sy(a.y) + sy(b.y)) / 2 - (sx(b.x) - sx(a.x)) * 0.08;
          return (
            <path
              key={i}
              d={`M${sx(a.x)} ${sy(a.y)} Q${mx} ${my} ${sx(b.x)} ${sy(b.y)}`}
              fill="none"
              stroke={lit ? 'var(--acc2)' : 'var(--acc-bd)'}
              strokeWidth={lit ? 1.6 : 0.8}
              opacity={dim ? 0.15 : lit ? 0.95 : 0.5}
            />
          );
        })}

        {graph.nodes.map((n) => {
          const note = noteById.get(n.id);
          const isHovered = hoveredNode === n.id;
          const isNeighbour = neighbours.has(n.id);
          const dim = hoveredNode !== null && !isHovered && !isNeighbour;
          const r = n.radius * (isHovered ? 1.35 : 1);
          const evergreen = note?.status === 'evergreen';
          const fill = isHovered ? 'var(--acc2)' : evergreen ? 'var(--grn)' : n.degree > 0 ? 'var(--acc)' : 'var(--bd2)';
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenNote(n.id)}
              onMouseEnter={() => onHover(n.id)}
              onMouseLeave={() => onHover(null)}
            >
              {isHovered && <circle cx={sx(n.x)} cy={sy(n.y)} r={r * 3.2} fill={`url(#node-glow-${uid})`} />}
              <circle
                cx={sx(n.x)}
                cy={sy(n.y)}
                r={r}
                fill={fill}
                opacity={dim ? 0.25 : 1}
                style={{ transition: 'r 0.15s, opacity 0.15s' }}
              />
              {(isHovered || isNeighbour || n.degree >= 2) && note && (
                <text
                  x={sx(n.x) + r + 5}
                  y={sy(n.y) + 3}
                  fontSize={10}
                  fill={isHovered ? 'var(--t1)' : 'var(--t2)'}
                  opacity={dim ? 0.3 : 1}
                >
                  {note.title.length > 20 ? note.title.slice(0, 20) + '…' : note.title}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 8,
          fontSize: 10,
          color: 'var(--t3)',
          justifyContent: 'center',
        }}
      >
        <LegendDot color="var(--grn)" label="evergreen" />
        <LegendDot color="var(--acc)" label="linked" />
        <LegendDot color="var(--bd2)" label="orphan" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  );
}
