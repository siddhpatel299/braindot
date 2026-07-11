'use client';

import { useMemo, useState } from 'react';
import { Note, Folder } from '@/types';
import { forceDirectedLayout } from '@/utils/graph';
import { relativeTime, countWords } from '@/utils/markdown';
import {
  FileText, Link2, AlignLeft, Flame, TrendingUp, ArrowRight,
  Sparkles, Plus, Calendar, Tag, Hash, Download, Upload,
} from 'lucide-react';

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
}

export function Dashboard({
  notes,
  folders,
  streak,
  totalConnections,
  onOpenNote,
  onCreateNote,
  onCreateJournal,
  onAskAI,
  onViewGraph,
  onExportVault,
  onImportVault,
}: DashboardProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Compute stats
  const stats = useMemo(() => {
    const totalWords = notes.reduce((sum, n) => sum + n.wordCount, 0);
    const evergreenCount = notes.filter((n) => n.status === 'evergreen').length;
    const draftCount = notes.length - evergreenCount;
    const recentlyEdited = [...notes]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6);
    const recentlyCreated = [...notes]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 4);
    return { totalWords, evergreenCount, draftCount, recentlyEdited, recentlyCreated };
  }, [notes]);

  // Build graph data from wiki-links
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
        const targetId = titleToId.get(m[1].toLowerCase());
        if (targetId && targetId !== n.id) {
          const key = [n.id, targetId].sort().join('→');
          if (!seen.has(key)) {
            seen.add(key);
            edges.push({ from: n.id, to: targetId });
          }
        }
      }
    }
    return forceDirectedLayout(
      notes.map((n) => n.id),
      edges,
      null,
      600,
      400,
      400,
    );
  }, [notes]);

  // Tag distribution
  const tagStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      if (n.tags.length === 0) {
        m.set('untagged', (m.get('untagged') || 0) + 1);
      } else {
        for (const t of n.tags) {
          m.set(t, (m.get(t) || 0) + 1);
        }
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [notes]);

  // Folder distribution
  const folderStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      m.set(n.folderId, (m.get(n.folderId) || 0) + 1);
    }
    return folders
      .filter((f) => f.parentId === null) // top-level PARA folders
      .map((f) => ({
        folder: f,
        count: Array.from(m.entries())
          .filter(([fid]) => {
            // count notes in this folder OR its sub-folders
            const isDescendant = (id: string): boolean => {
              if (id === f.id) return true;
              const parent = folders.find((x) => x.id === id)?.parentId;
              if (!parent) return false;
              return isDescendant(parent);
            };
            return isDescendant(fid);
          })
          .reduce((sum, [, c]) => sum + c, 0),
      }));
  }, [notes, folders]);

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const maxTagCount = tagStats.length > 0 ? tagStats[0][1] : 1;

  return (
    <div
      className="sb-scroll"
      style={{
        flex: 1,
        overflowY: 'auto',
        background: 'var(--bg)',
        padding: '40px 56px 80px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ fontSize: 13, color: 'var(--acc2)', marginBottom: 8, letterSpacing: '0.04em' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 style={{
          fontSize: 36,
          fontWeight: 700,
          color: 'var(--t1)',
          margin: 0,
          marginBottom: 8,
          letterSpacing: '-0.02em',
        }}>
          your second brain
        </h1>
        <p style={{
          fontSize: 15,
          color: 'var(--t3)',
          margin: 0,
          fontStyle: 'italic',
        }}>
          {notes.length} notes · {graph.edges.length} connections · {stats.totalWords.toLocaleString()} words written
        </p>
      </div>

      {/* Stats cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        marginBottom: 36,
      }}>
        <StatCard
          icon={FileText}
          label="total notes"
          value={notes.length}
          sub={`${stats.evergreenCount} evergreen · ${stats.draftCount} draft`}
          color="var(--acc2)"
          bgColor="var(--acc-bg)"
          borderColor="#3d378a"
        />
        <StatCard
          icon={Link2}
          label="connections"
          value={graph.edges.length}
          sub={`${(graph.edges.length / Math.max(notes.length, 1)).toFixed(1)} links per note`}
          color="var(--grn)"
          bgColor="var(--grn-bg)"
          borderColor="#1a4a2a"
        />
        <StatCard
          icon={AlignLeft}
          label="words written"
          value={stats.totalWords.toLocaleString()}
          sub={`${Math.round(stats.totalWords / Math.max(notes.length, 1))} avg per note`}
          color="var(--amb)"
          bgColor="var(--amb-bg)"
          borderColor="#4a3010"
        />
        <StatCard
          icon={Flame}
          label="writing streak"
          value={`${streak}d`}
          sub={streak >= 7 ? 'on fire' : streak >= 3 ? 'building momentum' : 'just started'}
          color="var(--red)"
          bgColor="rgba(248,113,113,0.1)"
          borderColor="#5a1a1a"
        />
      </div>

      {/* Quick actions */}
      <div style={{
        display: 'flex',
        gap: 10,
        marginBottom: 36,
      }}>
        <QuickAction icon={Plus} label="new note" onClick={onCreateNote} primary />
        <QuickAction icon={Calendar} label="daily journal" onClick={onCreateJournal} />
        <QuickAction icon={Sparkles} label="ask AI" onClick={onAskAI} />
        <QuickAction icon={TrendingUp} label="view graph" onClick={onViewGraph} />
        <QuickAction icon={Download} label="export" onClick={onExportVault} />
        <QuickAction icon={Upload} label="import" onClick={() => document.getElementById('sb-import-input')?.click()} />
      </div>

      {/* Main grid: recent notes + graph */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 18,
        marginBottom: 18,
      }}>
        {/* Recently edited */}
        <Panel title="recently edited" subtitle={`${stats.recentlyEdited.length} notes`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {stats.recentlyEdited.map((n) => (
              <NoteRow key={n.id} note={n} onOpen={() => onOpenNote(n.id)} />
            ))}
          </div>
        </Panel>

        {/* Graph overview */}
        <Panel title="knowledge graph" subtitle={`${notes.length} nodes · ${graph.edges.length} edges`}>
          <DashboardGraph
            graph={graph}
            noteById={noteById}
            hoveredNode={hoveredNode}
            onHover={setHoveredNode}
            onOpenNote={onOpenNote}
          />
        </Panel>
      </div>

      {/* Bottom grid: tag distribution + folder distribution + recent created */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 18,
      }}>
        {/* Tag distribution */}
        <Panel title="tags" subtitle={`${tagStats.length} tags`}>
          {tagStats.length === 0 ? (
            <Empty text="no tags yet" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tagStats.slice(0, 6).map(([tag, count]) => (
                <div key={tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {tag === 'untagged' ? (
                    <Hash size={13} color="var(--t3)" />
                  ) : (
                    <Tag size={13} color="var(--acc2)" />
                  )}
                  <span style={{ fontSize: 13, color: 'var(--t2)', minWidth: 70 }}>
                    {tag === 'untagged' ? 'untagged' : `#${tag}`}
                  </span>
                  <div style={{
                    flex: 1,
                    height: 6,
                    background: 'var(--bg3)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(count / maxTagCount) * 100}%`,
                      background: tag === 'untagged' ? 'var(--t3)' : 'var(--acc)',
                      borderRadius: 3,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--t3)', minWidth: 20, textAlign: 'right' }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* Folder distribution */}
        <Panel title="para folders" subtitle="by actionability">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {folderStats.map(({ folder, count }) => (
              <div key={folder.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontSize: 13,
                  color: 'var(--t2)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  fontWeight: 600,
                }}>
                  {folder.name}
                </span>
                <span style={{
                  fontSize: 13,
                  color: count > 0 ? 'var(--t1)' : 'var(--t3)',
                  fontWeight: 600,
                }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        {/* Recently created */}
        <Panel title="recently created" subtitle="newest first">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {stats.recentlyCreated.map((n) => (
              <NoteRow key={n.id} note={n} onOpen={() => onOpenNote(n.id)} showCreated />
            ))}
          </div>
        </Panel>
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

/* ---------- Sub-components ---------- */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bgColor,
  borderColor,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  value: string | number;
  sub: string;
  color: string;
  bgColor: string;
  borderColor: string;
}) {
  return (
    <div style={{
      background: 'var(--bg1)',
      border: '1px solid var(--bd)',
      borderRadius: 6,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--t3)',
          fontWeight: 600,
        }}>
          {label}
        </span>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: 5,
          background: bgColor,
          border: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <Icon size={14} strokeWidth={2} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--t3)' }}>
        {sub}
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  primary,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 38,
        padding: '0 16px',
        background: primary ? 'var(--acc)' : 'var(--bg2)',
        color: primary ? '#fff' : 'var(--t2)',
        border: '1px solid ' + (primary ? 'var(--acc)' : 'var(--bd2)'),
        borderRadius: 5,
        fontSize: 13,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontWeight: 600,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => {
        if (primary) e.currentTarget.style.background = 'var(--acc2)';
        else {
          e.currentTarget.style.background = 'var(--bg3)';
          e.currentTarget.style.color = 'var(--t1)';
        }
      }}
      onMouseLeave={(e) => {
        if (primary) e.currentTarget.style.background = 'var(--acc)';
        else {
          e.currentTarget.style.background = 'var(--bg2)';
          e.currentTarget.style.color = 'var(--t2)';
        }
      }}
    >
      <Icon size={14} strokeWidth={2} />
      {label}
    </button>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background: 'var(--bg1)',
      border: '1px solid var(--bd)',
      borderRadius: 6,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 220,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <h2 style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          color: 'var(--t3)',
          margin: 0,
          fontWeight: 600,
        }}>
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: 11, color: 'var(--t3)' }}>{subtitle}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function NoteRow({
  note,
  onOpen,
  showCreated,
}: {
  note: Note;
  onOpen: () => void;
  showCreated?: boolean;
}) {
  return (
    <button
      onClick={onOpen}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--bd)',
        borderRadius: 0,
        padding: '8px 0',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg2)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{
        width: 4,
        height: 4,
        borderRadius: '50%',
        background: note.status === 'evergreen' ? 'var(--grn)' : 'var(--t3)',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          color: 'var(--t1)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: 500,
        }}>
          {note.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>
          {note.wordCount} words · {note.backlinks.length} backlinks
        </div>
      </div>
      <span style={{ fontSize: 11, color: 'var(--t3)', flexShrink: 0 }}>
        {showCreated ? relativeTime(note.createdAt) : relativeTime(note.updatedAt)}
      </span>
      <ArrowRight size={13} color="var(--t3)" style={{ flexShrink: 0, opacity: 0.5 }} />
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 13,
      color: 'var(--t3)',
      fontStyle: 'italic',
      padding: '20px 0',
      textAlign: 'center',
    }}>
      {text}
    </div>
  );
}

/* ---------- Dashboard Graph ---------- */

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
  const W = 600;
  const H = 280;

  // Scale node positions to fit the panel
  const padding = 20;
  const xs = graph.nodes.map((n) => n.x);
  const ys = graph.nodes.map((n) => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scaleX = (W - padding * 2) / Math.max(maxX - minX, 1);
  const scaleY = (H - padding * 2) / Math.max(maxY - minY, 1);
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (W - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = (H - (maxY - minY) * scale) / 2 - minY * scale;

  const sx = (x: number) => x * scale + offsetX;
  const sy = (y: number) => y * scale + offsetY;

  if (graph.nodes.length === 0) {
    return <Empty text="no notes yet" />;
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* Edges */}
        {graph.edges.map((e, i) => {
          const a = graph.nodes.find((n) => n.id === e.from);
          const b = graph.nodes.find((n) => n.id === e.to);
          if (!a || !b) return null;
          const isHighlighted = hoveredNode && (e.from === hoveredNode || e.to === hoveredNode);
          return (
            <line
              key={i}
              x1={sx(a.x)}
              y1={sy(a.y)}
              x2={sx(b.x)}
              y2={sy(b.y)}
              stroke={isHighlighted ? 'var(--acc)' : 'var(--acc-bd)'}
              strokeWidth={isHighlighted ? 1.5 : 0.8}
              opacity={isHighlighted ? 0.9 : 0.5}
            />
          );
        })}
        {/* Nodes */}
        {graph.nodes.map((n) => {
          const note = noteById.get(n.id);
          const isHovered = hoveredNode === n.id;
          const r = n.radius * (isHovered ? 1.3 : 1);
          const fill = n.degree > 0 ? 'var(--acc)' : '#534AB7';
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenNote(n.id)}
              onMouseEnter={() => onHover(n.id)}
              onMouseLeave={() => onHover(null)}
            >
              <circle
                cx={sx(n.x)}
                cy={sy(n.y)}
                r={r}
                fill={fill}
                opacity={isHovered ? 1 : 0.85}
                style={{ transition: 'r 0.15s, opacity 0.15s' }}
              />
              {(isHovered || n.degree >= 2) && note && (
                <text
                  x={sx(n.x) + r + 4}
                  y={sy(n.y) + 3}
                  fontSize={10}
                  fill={isHovered ? 'var(--t1)' : 'var(--t3)'}
                  fontFamily="JetBrains Mono"
                >
                  {note.title.slice(0, 18)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {/* Hover tooltip */}
      {hoveredNode && noteById.get(hoveredNode) && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          background: 'var(--bg3)',
          border: '1px solid var(--bd2)',
          borderRadius: 4,
          padding: '6px 10px',
          fontSize: 11,
          color: 'var(--t1)',
          pointerEvents: 'none',
          maxWidth: 250,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {noteById.get(hoveredNode)!.title}
          </div>
          <div style={{ color: 'var(--t3)', fontSize: 10 }}>
            {noteById.get(hoveredNode)!.wordCount} words · {noteById.get(hoveredNode)!.backlinks.length} backlinks · click to open
          </div>
        </div>
      )}
    </div>
  );
}
