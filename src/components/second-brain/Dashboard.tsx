'use client';

import { useMemo } from 'react';
import { Note, Folder } from '@/types';
import { forceDirectedLayout } from '@/utils/graph';
import { relativeTime } from '@/utils/markdown';

interface DashboardProps {
  notes: Note[];
  folders: Folder[];
  streak: number;
  totalConnections: number;
  onOpenNote: (id: string) => void;
  onCreateNote: () => void;
  onCreateJournal: () => void;
  onAskAI: () => void;
  onViewGraph: () => void;
  onExportVault: () => void;
  onImportVault: (file: File) => void;
  onOpenNotes?: () => void;
  onOpenTag?: (tag: string) => void;
}

/* ---------- shared bits ---------- */

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-code)',
  fontSize: 9.5,
  letterSpacing: '.09em',
  textTransform: 'uppercase',
  color: 'var(--t3)',
};

const CARD: React.CSSProperties = {
  border: '1px solid var(--bd)',
  borderRadius: 10,
  background: 'var(--bg1)',
};

function Panel({
  title,
  action,
  onAction,
  children,
  pad,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
  pad?: boolean;
}) {
  return (
    <div style={{ ...CARD, overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '11px 14px 9px', borderBottom: '1px solid var(--bd)',
      }}>
        <span style={{ ...LABEL, flex: 1 }}>{title}</span>
        {action && (
          <button
            onClick={onAction}
            style={{
              fontFamily: 'var(--font-code)', fontSize: 10, color: 'var(--t2)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; }}
          >
            {action}
          </button>
        )}
      </div>
      <div style={{ padding: pad === false ? 0 : 5 }}>{children}</div>
    </div>
  );
}

function Row({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 9px', borderRadius: 6, cursor: onClick ? 'pointer' : 'default',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </div>
  );
}

const META: React.CSSProperties = {
  fontFamily: 'var(--font-code)', fontSize: 9.5, color: 'var(--t3)',
};

export function Dashboard({
  notes, folders, streak, onOpenNote, onCreateNote, onCreateJournal,
  onAskAI, onViewGraph, onExportVault, onImportVault, onOpenNotes, onOpenTag,
}: DashboardProps) {
  const stats = useMemo(() => {
    const totalWords = notes.reduce((s, n) => s + n.wordCount, 0);
    const evergreen = notes.filter((n) => n.status === 'evergreen').length;
    return {
      totalWords,
      evergreen,
      draft: notes.length - evergreen,
      recentEdited: [...notes]
        .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
        .slice(0, 6),
      recentCreated: [...notes]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 4),
    };
  }, [notes]);

  const graph = useMemo(() => {
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
        const target = titleToId.get(m[1].trim().toLowerCase());
        if (target && target !== n.id) {
          const key = [n.id, target].sort().join('|');
          if (!seen.has(key)) { seen.add(key); edges.push({ from: n.id, to: target }); }
        }
      }
    }
    const layout = forceDirectedLayout(notes.map((n) => n.id), edges, null, 460, 242);
    const pos = new Map(layout.nodes.map((nd) => [nd.id, nd]));
    return { edges, layout, pos };
  }, [notes]);

  // 14-day writing heat, from note update timestamps
  const heat = useMemo(() => {
    const days: { key: string; label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.key, i]));
    for (const n of notes) {
      const k = (n.updatedAt || '').slice(0, 10);
      const i = idx.get(k);
      if (i !== undefined) days[i].count += 1;
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    return { days, max, total: days.reduce((s, d) => s + d.count, 0) };
  }, [notes]);

  const para = useMemo(() => {
    const roots = folders.filter((f) => f.paraType);
    const descendants = (rootId: string) => {
      const ids = new Set([rootId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const f of folders) {
          if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
        }
      }
      return ids;
    };
    const rows = roots.map((r) => {
      const ids = descendants(r.id);
      return { name: r.name, count: notes.filter((n) => ids.has(n.folderId)).length };
    });
    const max = Math.max(1, ...rows.map((r) => r.count));
    return { rows, max };
  }, [folders, notes]);

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) for (const t of n.tags) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [notes]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // No ref/.click() here — a <label> wrapping the hidden input opens the
  // picker natively, which is both simpler and keyboard accessible.
  const quickActions: { label: string; onClick: () => void }[] = [
    { label: '+ new note', onClick: onCreateNote },
    { label: 'journal', onClick: onCreateJournal },
    { label: 'ask AI', onClick: onAskAI },
    { label: 'graph', onClick: onViewGraph },
    { label: 'export', onClick: onExportVault },
  ];

  const pillStyle: React.CSSProperties = {
    padding: '6px 11px', border: '1px solid var(--bd)', borderRadius: 6,
    background: 'var(--bg1)', fontSize: 12, color: 'var(--t2)',
    cursor: 'pointer', fontFamily: 'inherit',
  };

  const dashStats = [
    { label: 'notes', value: String(notes.length), sub: `${stats.evergreen} evergreen · ${stats.draft} draft`, color: 'var(--t1)' },
    { label: 'connections', value: String(graph.edges.length), sub: `${(graph.edges.length / Math.max(1, notes.length)).toFixed(1)} per note`, color: 'var(--acc)' },
    { label: 'words', value: stats.totalWords.toLocaleString(), sub: `${Math.round(stats.totalWords / Math.max(1, notes.length))} avg`, color: 'var(--t1)' },
    { label: 'streak', value: `${streak}d`, sub: streak > 0 ? 'keep going' : 'start today', color: 'var(--amb)' },
    { label: 'orphans', value: String(graph.layout.nodes.filter((n) => !n.degree).length), sub: 'unlinked notes', color: 'var(--t1)' },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '26px 32px 60px', minWidth: 0 }} className="sb-scroll">
      {/* header + quick actions */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 23, fontWeight: 600, letterSpacing: '-0.5px', color: 'var(--t1)' }}>{greeting}</div>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>
            {notes.length} notes · {graph.edges.length} connections · {stats.totalWords.toLocaleString()} words
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {quickActions.map((q) => (
            <button
              key={q.label}
              onClick={q.onClick}
              style={{
                padding: '6px 11px', border: '1px solid var(--bd)', borderRadius: 6,
                background: 'var(--bg1)', fontSize: 12, color: 'var(--t2)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--acc)'; e.currentTarget.style.color = 'var(--acc)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.color = 'var(--t2)'; }}
            >
              {q.label}
            </button>
          ))}
          <label
            style={{ ...pillStyle, display: 'inline-flex', alignItems: 'center' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--acc)'; e.currentTarget.style.color = 'var(--acc)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.color = 'var(--t2)'; }}
          >
            import
            <input
              type="file" accept=".json,.md,.txt" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportVault(f); e.target.value = ''; }}
            />
          </label>
        </div>
      </div>

      {/* stat row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))',
        gap: 10, marginBottom: 14,
      }}>
        {dashStats.map((st) => (
          <div key={st.label} style={{ ...CARD, padding: '13px 15px' }}>
            <div style={LABEL}>{st.label}</div>
            <div style={{ fontSize: 27, fontWeight: 600, letterSpacing: '-0.8px', marginTop: 6, color: st.color }}>
              {st.value}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 2 }}>{st.sub}</div>
          </div>
        ))}
      </div>

      {/* two columns */}
      <div className="sb-dash-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel title="recently edited" action="all notes →" onAction={onOpenNotes}>
            {stats.recentEdited.map((n) => (
              <Row key={n.id} onClick={() => onOpenNote(n.id)}>
                <span style={{
                  width: 5, height: 5, borderRadius: 1, flex: 'none',
                  background: n.status === 'evergreen' ? 'var(--grn)' : 'var(--t3)',
                }} />
                <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}>
                  {n.title}
                </span>
                <span style={META}>{n.backlinks.length}</span>
                <span style={{ ...META, width: 58, textAlign: 'right' }}>{relativeTime(n.updatedAt)}</span>
              </Row>
            ))}
          </Panel>

          <div style={{ ...CARD, padding: '13px 15px 15px' }}>
            <div style={{ ...LABEL, marginBottom: 11 }}>writing, last 14 days</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 64 }}>
              {heat.days.map((d) => (
                <div key={d.key} title={`${d.label} — ${d.count} note${d.count === 1 ? '' : 's'}`}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <div style={{
                    borderRadius: 3, minHeight: 3,
                    height: `${(d.count / heat.max) * 100}%`,
                    background: d.count === 0 ? 'var(--bg3)' : 'var(--acc)',
                    opacity: d.count === 0 ? 1 : 0.45 + 0.55 * (d.count / heat.max),
                  }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', ...META, marginTop: 7 }}>
              <span>{heat.days[0].label}</span>
              <span>{heat.total} edits</span>
              <span>today</span>
            </div>
          </div>

          <div style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ ...LABEL, marginBottom: 10 }}>para</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {para.rows.map((p) => (
                <div key={p.name}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, color: 'var(--t1)' }}>
                    <span style={{ flex: 1 }}>{p.name}</span>
                    <span style={{ fontFamily: 'var(--font-code)', fontSize: 10, color: 'var(--t3)' }}>{p.count}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--bg3)', marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, background: 'var(--acc)', width: `${(p.count / para.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel title="knowledge graph" action="open →" onAction={onViewGraph} pad={false}>
            <svg
              viewBox="0 0 460 242" onClick={onViewGraph}
              style={{ width: '100%', height: 242, display: 'block', cursor: 'pointer' }}
            >
              {graph.edges.map((e, i) => {
                const a = graph.pos.get(e.from); const b = graph.pos.get(e.to);
                if (!a || !b) return null;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--bd2)" strokeWidth={1} />;
              })}
              {graph.layout.nodes.map((nd) => (
                <circle
                  key={nd.id} cx={nd.x} cy={nd.y} r={3 + Math.min(nd.degree, 6) * 0.9}
                  fill={nd.degree ? 'var(--acc)' : 'var(--t3)'}
                  opacity={nd.degree ? 0.9 : 0.5}
                />
              ))}
            </svg>
          </Panel>

          <div style={{ ...CARD, padding: '13px 15px' }}>
            <div style={{ ...LABEL, marginBottom: 10 }}>tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {tags.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--t3)' }}>no tags yet</span>}
              {tags.map(([name, count]) => (
                <button
                  key={name}
                  onClick={() => onOpenTag?.(name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px',
                    borderRadius: 13, border: '1px solid var(--bd)', fontSize: 11.5,
                    color: 'var(--t2)', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--acc)'; e.currentTarget.style.color = 'var(--acc)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.color = 'var(--t2)'; }}
                >
                  <span>#{name}</span>
                  <span style={META}>{count}</span>
                </button>
              ))}
            </div>
          </div>

          <Panel title="recently created">
            {stats.recentCreated.map((n) => (
              <Row key={n.id} onClick={() => onOpenNote(n.id)}>
                <span style={{ flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}>
                  {n.title}
                </span>
                <span style={META}>{relativeTime(n.createdAt)}</span>
              </Row>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}
