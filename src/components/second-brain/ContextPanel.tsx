'use client';

import { useState, useMemo } from 'react';
import { Note } from '@/types';
import { generateSuggestions, relativeTime, formatDate, extractWikiLinks } from '@/utils/markdown';
import { radialNeighbourhood } from '@/utils/graph';
import { ArrowUpRight, FileText, Library, GraduationCap, LucideIcon } from 'lucide-react';
import { AIChat, AIMode } from './AIChat';
import { FormatPanel } from './FormatPanel';

export type ContextTab = 'info' | 'format' | 'ai' | 'graph' | 'history';

interface ContextPanelProps {
  note: Note;
  allNotes: Note[];
  activeTab: ContextTab;
  onTabChange: (t: ContextTab) => void;
  /** Format tab: the working copy of the body, and how to change it. */
  body: string;
  onBodyChange: (next: string) => void;
  /** True while the note is shown as a document rather than as editable text. */
  readingMode: boolean;
  onRequestEdit: () => void;
  onInsertImage: () => void;
  /** Which AI sub-tab is showing. Lifted so the palette can jump straight to study. */
  aiMode: AIMode;
  onAiModeChange: (m: AIMode) => void;
  onOpenNote: (id: string) => void;
  onOpenNoteByTitle: (title: string) => void;
  onSaveToNote: (markdown: string) => void;
  onExportEssay: () => void;
  onInsertLink: (linkTitle: string) => void;
  onDraftSynthesis: () => void;
  onAnswerInNewNote: (question: string) => void;
  onScheduleReview: () => void;
  history: { id: string; noteId: string; text: string; timestamp: number }[];
}

const AI_MODES: { id: AIMode; label: string; icon: LucideIcon }[] = [
  { id: 'note', label: 'this note', icon: FileText },
  { id: 'vault', label: 'vault', icon: Library },
  { id: 'study', label: 'study', icon: GraduationCap },
];

export function ContextPanel({
  note,
  allNotes,
  activeTab,
  onTabChange,
  body,
  onBodyChange,
  readingMode,
  onRequestEdit,
  onInsertImage,
  aiMode,
  onAiModeChange,
  onOpenNote,
  onOpenNoteByTitle,
  onSaveToNote,
  onExportEssay,
  onInsertLink,
  onDraftSynthesis,
  onAnswerInNewNote,
  onScheduleReview,
  history,
}: ContextPanelProps) {
  const suggestions = useMemo(() => generateSuggestions(note, allNotes), [note, allNotes]);

  // Mini graph data: nodes for current + neighbors + second-degree
  const graphData = useMemo(() => {
    const titleToId = new Map<string, string>();
    for (const n of allNotes) titleToId.set(n.title.toLowerCase(), n.id);

    // neighbors = notes that this note links to OR that link to this note
    const neighborIds = new Set<string>();
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = wikiLinkRegex.exec(note.body)) !== null) {
      const id = titleToId.get(m[1].toLowerCase());
      if (id && id !== note.id) neighborIds.add(id);
    }
    for (const other of allNotes) {
      if (other.id === note.id) continue;
      if (other.body.toLowerCase().includes(`[[${note.title.toLowerCase()}]]`)) {
        neighborIds.add(other.id);
      }
    }

    // second-degree: neighbors of neighbors (limit)
    const secondDegree = new Set<string>();
    for (const nid of neighborIds) {
      const n = allNotes.find((x) => x.id === nid);
      if (!n) continue;
      let m2: RegExpExecArray | null;
      const re = /\[\[([^\]]+)\]\]/g;
      while ((m2 = re.exec(n.body)) !== null) {
        const id = titleToId.get(m2[1].toLowerCase());
        if (id && id !== note.id && !neighborIds.has(id)) secondDegree.add(id);
      }
    }

    return {
      neighbors: Array.from(neighborIds).map((id) => allNotes.find((n) => n.id === id)!).filter(Boolean),
      distant: Array.from(secondDegree).slice(0, 6).map((id) => allNotes.find((n) => n.id === id)!).filter(Boolean),
    };
  }, [note, allNotes]);

  return (
    <div
      style={{
        width: 300,
        minWidth: 300,
        height: '100%',
        background: 'var(--bg1)',
        borderLeft: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Tabs */}
      <div
        style={{
          height: 34,
          display: 'flex',
          borderBottom: '1px solid var(--bd)',
          flexShrink: 0,
        }}
      >
        {(['info', 'format', 'ai', 'graph', 'history'] as const).map((t) => {
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                flex: 1,
                minWidth: 0,
                padding: '0 2px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--acc)' : '2px solid transparent',
                color: isActive ? 'var(--t1)' : 'var(--t3)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: isActive ? 600 : 400,
                transition: 'color 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--t2)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--t3)';
              }}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* AI is a chat: it owns the full panel height and scrolls internally, so
          it gets its own non-scrolling container rather than the shared one. */}
      {activeTab === 'ai' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 12, gap: 10 }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 5, padding: 2, flexShrink: 0 }}>
            {AI_MODES.map((m) => {
              const isActive = aiMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onAiModeChange(m.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    background: isActive ? 'var(--bg4)' : 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    color: isActive ? 'var(--t1)' : 'var(--t3)',
                    fontSize: 10,
                    fontFamily: 'inherit',
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = 'var(--t2)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = 'var(--t3)';
                  }}
                >
                  <m.icon size={11} />
                  {m.label}
                </button>
              );
            })}
          </div>

          <AIChat
            mode={aiMode}
            note={note}
            allNotes={allNotes}
            onSaveToNote={onSaveToNote}
            onOpenNoteByTitle={onOpenNoteByTitle}
          />
        </div>
      ) : (
        <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {activeTab === 'info' && (
            <InfoPanel
              note={note}
              suggestions={suggestions}
              graphData={graphData}
              onOpenNote={onOpenNote}
              onExportEssay={onExportEssay}
              onInsertLink={onInsertLink}
              onDraftSynthesis={onDraftSynthesis}
              onAnswerInNewNote={onAnswerInNewNote}
              onScheduleReview={onScheduleReview}
            />
          )}
          {activeTab === 'format' && (
            <FormatPanel
              body={body}
              onBodyChange={onBodyChange}
              readingMode={readingMode}
              onRequestEdit={onRequestEdit}
              onInsertImage={onInsertImage}
            />
          )}
          {activeTab === 'graph' && <GraphPanel note={note} allNotes={allNotes} onOpenNote={onOpenNote} />}
          {activeTab === 'history' && <HistoryPanel note={note} history={history} onOpenNote={onOpenNote} />}
        </div>
      )}
    </div>
  );
}

/* ---------- Info Tab ---------- */

function InfoPanel({
  note,
  suggestions,
  graphData,
  onOpenNote,
  onExportEssay,
  onInsertLink,
  onDraftSynthesis,
  onAnswerInNewNote,
  onScheduleReview,
}: {
  note: Note;
  suggestions: ReturnType<typeof generateSuggestions>;
  graphData: { neighbors: Note[]; distant: Note[] };
  onOpenNote: (id: string) => void;
  onExportEssay: () => void;
  onInsertLink: (linkTitle: string) => void;
  onDraftSynthesis: () => void;
  onAnswerInNewNote: (question: string) => void;
  onScheduleReview: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          className="sb-pulse"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--acc)',
            boxShadow: '0 0 6px rgba(124,110,247,0.6)',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--acc2)', letterSpacing: '0.04em' }}>live suggestions</span>
      </div>

      {/* Suggestion cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map((s, i) => {
          let onClick: (() => void) | undefined;
          if (s.type === 'missing link' && s.action.startsWith('insert')) {
            // Extract the title from the description (the quoted name before "appears")
            const match = s.description.match(/^"([^"]+)"/);
            const title = match ? match[1] : '';
            onClick = () => onInsertLink(title);
          } else if (s.type === 'synthesis ready') {
            onClick = onDraftSynthesis;
          } else if (s.type === 'review due') {
            onClick = onScheduleReview;
          } else if (s.type === 'open question') {
            onClick = () => onAnswerInNewNote(s.description);
          }
          return <SuggestionCard key={i} suggestion={s} onClick={onClick} />;
        })}
      </div>

      {/* Mini knowledge graph */}
      <div>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--t3)',
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          local graph
        </div>
        <MiniGraph note={note} neighbors={graphData.neighbors} distant={graphData.distant} onOpenNote={onOpenNote} />
      </div>

      {/* Ask AI and Study now live in the AI tab next door, not behind a button. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        <ActionButton label="export as essay" onClick={onExportEssay} />
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  onClick,
}: {
  suggestion: ReturnType<typeof generateSuggestions>[number];
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 4,
        padding: '7px 10px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.12s, border 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        e.currentTarget.style.background = 'var(--acc-bg)';
        e.currentTarget.style.borderColor = 'var(--acc)';
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.background = 'var(--bg2)';
        e.currentTarget.style.borderColor = 'var(--bd)';
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--t3)',
          marginBottom: 3,
          fontWeight: 600,
        }}
      >
        {suggestion.type}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5, marginBottom: 5 }}>
        {suggestion.description}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--acc)',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
        }}
      >
        {suggestion.action}
        <ArrowUpRight size={9} />
      </div>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 3,
        padding: '8px 11px',
        color: 'var(--t2)',
        fontSize: 11,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        transition: 'background 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg3)';
        e.currentTarget.style.color = 'var(--t1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg2)';
        e.currentTarget.style.color = 'var(--t2)';
      }}
    >
      <ArrowUpRight size={10} />
      {label}
    </button>
  );
}

/* ---------- Mini Graph (SVG) ---------- */

function MiniGraph({
  note,
  neighbors,
  distant,
  onOpenNote,
}: {
  note: Note;
  neighbors: Note[];
  distant: Note[];
  onOpenNote: (id: string) => void;
}) {
  const W = 200;
  const H = 100;

  // Position current note in center
  const cx = W / 2;
  const cy = H / 2;

  // Place neighbors around in a circle
  const neighborPositions = neighbors.slice(0, 5).map((n, i, arr) => {
    const angle = (i / Math.max(arr.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = 32;
    return {
      note: n,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  });

  // Distant notes on outer ring
  const distantPositions = distant.slice(0, 4).map((n, i, arr) => {
    const angle = (i / Math.max(arr.length, 1)) * Math.PI * 2;
    const r = 46;
    return {
      note: n,
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    };
  });

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {/* Edges from center to neighbors */}
      {neighborPositions.map((p, i) => (
        <line
          key={`e-${i}`}
          x1={cx}
          y1={cy}
          x2={p.x}
          y2={p.y}
          stroke="var(--acc-bd)"
          strokeWidth={1}
        />
      ))}
      {/* Dashed edges between neighbors and distant */}
      {neighborPositions.map((p, i) => {
        const d = distantPositions[i % distantPositions.length];
        if (!d) return null;
        return (
          <line
            key={`d-${i}`}
            x1={p.x}
            y1={p.y}
            x2={d.x}
            y2={d.y}
            stroke="var(--acc-bd)"
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
        );
      })}

      {/* Distant notes (small) */}
      {distantPositions.map((p) => (
        <g key={`dist-${p.note.id}`} style={{ cursor: 'pointer' }} onClick={() => onOpenNote(p.note.id)}>
          <circle cx={p.x} cy={p.y} r={2.5} fill="var(--acc-bd)" />
          <text x={p.x + 4} y={p.y + 2} fontSize={7} fill="var(--t2)" fontFamily="JetBrains Mono">
            {p.note.title.slice(0, 8)}
          </text>
        </g>
      ))}

      {/* Neighbor notes (medium) */}
      {neighborPositions.map((p) => (
        <g key={`nb-${p.note.id}`} style={{ cursor: 'pointer' }} onClick={() => onOpenNote(p.note.id)}>
          <circle cx={p.x} cy={p.y} r={4} fill="#534AB7" />
          <text x={p.x + 6} y={p.y + 2} fontSize={7} fill="var(--t2)" fontFamily="JetBrains Mono">
            {p.note.title.slice(0, 10)}
          </text>
        </g>
      ))}

      {/* Current note (large) */}
      <circle cx={cx} cy={cy} r={6} fill="var(--acc)" />
      <text
        x={cx + 9}
        y={cy + 3}
        fontSize={7}
        fill="var(--acc2)"
        fontFamily="JetBrains Mono"
        fontWeight={600}
      >
        {note.title.slice(0, 12)}
      </text>
    </svg>
  );
}

/* ---------- Graph Tab ---------- */

function GraphPanel({
  note,
  allNotes,
  onOpenNote,
}: {
  note: Note;
  allNotes: Note[];
  onOpenNote: (id: string) => void;
}) {
  const W = 232;
  const H = 300;

  // Build edges from wiki-links (deduplicated)
  const titleToId = new Map<string, string>();
  for (const n of allNotes) {
    titleToId.set(n.title.toLowerCase(), n.id);
    titleToId.set(n.filename.toLowerCase().replace(/\.md$/, ''), n.id);
  }
  const edges: { from: string; to: string }[] = [];
  const seenEdges = new Set<string>();
  for (const n of allNotes) {
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(n.body)) !== null) {
      const targetId = titleToId.get(m[1].toLowerCase());
      if (targetId && targetId !== n.id) {
        const key = [n.id, targetId].sort().join('→');
        if (!seenEdges.has(key)) {
          seenEdges.add(key);
          edges.push({ from: n.id, to: targetId });
        }
      }
    }
  }

  /* A radial neighbourhood, not a simulation: for a dozen nodes around one
     subject the force pass bought nothing, and centring on the current note is
     the point here rather than the bug it was on the full map. */
  const layout = useMemo(
    () => radialNeighbourhood(allNotes.map((n) => n.id), edges, note.id, W, H),
    [allNotes, edges, note.id],
  );

  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          color: 'var(--t3)',
          fontWeight: 600,
        }}
      >
        full graph — {allNotes.length} notes
      </div>
      <svg width={W} height={H} style={{ display: 'block', background: 'var(--bg)', borderRadius: 4 }}>
        {/* Edges */}
        {layout.edges.map((e, i) => {
          const a = nodeMap.get(e.from);
          const b = nodeMap.get(e.to);
          if (!a || !b) return null;
          const isCurrent = e.from === note.id || e.to === note.id;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={isCurrent ? 'var(--acc)' : 'var(--acc-bd)'}
              strokeWidth={isCurrent ? 1.2 : 0.6}
              opacity={isCurrent ? 0.85 : 0.5}
            />
          );
        })}
        {/* Nodes */}
        {layout.nodes.map((n) => {
          const noteData = allNotes.find((x) => x.id === n.id);
          const isCurrent = n.id === note.id;
          const r = isCurrent ? 7 : Math.max(3, n.radius);
          const fill = isCurrent ? 'var(--acc)' : n.degree > 0 ? '#534AB7' : 'var(--acc-bd)';
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenNote(n.id)}
            >
              {n.degree > 0 && !isCurrent && (
                <circle cx={n.x} cy={n.y} r={r + 3} fill="none" stroke="var(--acc-bd)" strokeWidth={0.5} opacity={0.4} />
              )}
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={fill}
              />
              {(isCurrent || n.degree >= 2) && noteData && (
                <text
                  x={n.x + r + 4}
                  y={n.y + 3}
                  fontSize={8}
                  fill={isCurrent ? 'var(--acc2)' : 'var(--t2)'}
                  fontFamily="JetBrains Mono"
                  fontWeight={isCurrent ? 600 : 400}
                >
                  {noteData.title.slice(0, 14)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
        {edges.length} connections across {allNotes.length} notes. Node size = connection count. Click any node to open it.
      </div>
    </div>
  );
}

/* ---------- History Tab ---------- */

function HistoryPanel({
  note,
  history,
  onOpenNote,
}: {
  note: Note;
  history: { id: string; noteId: string; text: string; timestamp: number }[];
  onOpenNote: (id: string) => void;
}) {
  // "This note" — entries for the currently open note
  const noteHistory = history.filter((h) => h.noteId === note.id);
  // "Recent activity" — entries for OTHER notes (avoids duplicate display)
  const recent = history.filter((h) => h.noteId !== note.id).slice(0, 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          color: 'var(--t3)',
          marginBottom: 4,
          fontWeight: 600,
        }}
      >
        this note
      </div>
      {noteHistory.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>no recorded edits yet</div>
      ) : (
        noteHistory.slice(0, 8).map((h) => (
          <HistoryRow key={h.id} text={h.text} timestamp={h.timestamp} />
        ))
      )}

      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          color: 'var(--t3)',
          margin: '10px 0 4px',
          fontWeight: 600,
        }}
      >
        recent activity
      </div>
      {recent.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>no other recent activity</div>
      ) : (
        recent.map((h) => (
          <button
            key={h.id}
            onClick={() => onOpenNote(h.noteId)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              color: 'var(--t3)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--acc2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--t3)';
            }}
          >
            <HistoryRow text={h.text} timestamp={h.timestamp} />
          </button>
        ))
      )}
    </div>
  );
}

function HistoryRow({ text, timestamp }: { text: string; timestamp: number }) {
  return (
    <div
      style={{
        fontSize: 12,
        color: 'var(--t3)',
        lineHeight: 1.5,
        padding: '2px 0',
      }}
    >
      {text}
      <span style={{ color: 'var(--t3)', opacity: 0.7 }}> · {relativeTime(timestamp)}</span>
    </div>
  );
}
