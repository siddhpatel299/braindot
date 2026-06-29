'use client';

import { useState, useMemo } from 'react';
import { Note } from '@/types';
import { generateSuggestions, relativeTime, formatDate } from '@/utils/markdown';
import { ArrowUpRight } from 'lucide-react';

interface ContextPanelProps {
  note: Note;
  allNotes: Note[];
  activeTab: 'ai' | 'graph' | 'history';
  onTabChange: (t: 'ai' | 'graph' | 'history') => void;
  onOpenNote: (id: string) => void;
  history: { id: string; noteId: string; text: string; timestamp: number }[];
}

export function ContextPanel({ note, allNotes, activeTab, onTabChange, onOpenNote, history }: ContextPanelProps) {
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
        width: 240,
        minWidth: 240,
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
        }}
      >
        {(['ai', 'graph', 'history'] as const).map((t) => {
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => onTabChange(t)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--acc)' : '2px solid transparent',
                color: isActive ? 'var(--t1)' : 'var(--t3)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
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

      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {activeTab === 'ai' && <AIPanel note={note} suggestions={suggestions} graphData={graphData} onOpenNote={onOpenNote} />}
        {activeTab === 'graph' && <GraphPanel note={note} allNotes={allNotes} onOpenNote={onOpenNote} />}
        {activeTab === 'history' && <HistoryPanel note={note} history={history} onOpenNote={onOpenNote} />}
      </div>
    </div>
  );
}

/* ---------- AI Tab ---------- */

function AIPanel({
  note,
  suggestions,
  graphData,
  onOpenNote,
}: {
  note: Note;
  suggestions: ReturnType<typeof generateSuggestions>;
  graphData: { neighbors: Note[]; distant: Note[] };
  onOpenNote: (id: string) => void;
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
        <span style={{ fontSize: 10, color: 'var(--acc2)', letterSpacing: '0.04em' }}>live suggestions</span>
      </div>

      {/* Suggestion cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map((s, i) => (
          <SuggestionCard key={i} suggestion={s} />
        ))}
      </div>

      {/* Mini knowledge graph */}
      <div>
        <div
          style={{
            fontSize: 9,
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

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        <ActionButton label="export as essay" />
        <ActionButton label="ask AI about this" />
      </div>
    </div>
  );
}

function SuggestionCard({
  suggestion,
}: {
  suggestion: ReturnType<typeof generateSuggestions>[number];
}) {
  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 4,
        padding: '7px 10px',
        cursor: 'pointer',
        transition: 'background 0.12s, border 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--acc-bg)';
        e.currentTarget.style.borderColor = 'var(--acc)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg2)';
        e.currentTarget.style.borderColor = 'var(--bd)';
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--t3)',
          marginBottom: 3,
          fontWeight: 600,
        }}
      >
        {suggestion.type}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--t2)', lineHeight: 1.45, marginBottom: 4 }}>
        {suggestion.description}
      </div>
      <div
        style={{
          fontSize: 9.5,
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

function ActionButton({ label }: { label: string }) {
  return (
    <button
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 3,
        padding: '7px 10px',
        color: 'var(--t2)',
        fontSize: 10,
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
          stroke="#3d378a"
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
            stroke="#3d378a"
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
        );
      })}

      {/* Distant notes (small) */}
      {distantPositions.map((p) => (
        <g key={`dist-${p.note.id}`} style={{ cursor: 'pointer' }} onClick={() => onOpenNote(p.note.id)}>
          <circle cx={p.x} cy={p.y} r={2.5} fill="#3d378a" />
          <text x={p.x + 4} y={p.y + 2} fontSize={6} fill="var(--t3)" fontFamily="JetBrains Mono">
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
  const W = 216;
  const H = 280;

  // Build edges from wiki-links
  const titleToId = new Map<string, string>();
  for (const n of allNotes) titleToId.set(n.title.toLowerCase(), n.id);

  const edges: { from: string; to: string }[] = [];
  for (const n of allNotes) {
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(n.body)) !== null) {
      const targetId = titleToId.get(m[1].toLowerCase());
      if (targetId && targetId !== n.id) {
        edges.push({ from: n.id, to: targetId });
      }
    }
  }

  // Position nodes in a circle
  const positions = new Map<string, { x: number; y: number }>();
  const cx = W / 2;
  const cy = H / 2;
  const r = 100;
  allNotes.forEach((n, i) => {
    const angle = (i / allNotes.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(n.id, {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    });
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.09em',
          color: 'var(--t3)',
          fontWeight: 600,
        }}
      >
        full graph — {allNotes.length} notes
      </div>
      <svg width={W} height={H} style={{ display: 'block', background: 'var(--bg)' }}>
        {/* Edges */}
        {edges.map((e, i) => {
          const from = positions.get(e.from);
          const to = positions.get(e.to);
          if (!from || !to) return null;
          const isCurrent = e.from === note.id || e.to === note.id;
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={isCurrent ? 'var(--acc)' : '#3d378a'}
              strokeWidth={isCurrent ? 1 : 0.5}
              strokeDasharray={isCurrent ? '' : '2 2'}
              opacity={isCurrent ? 0.8 : 0.5}
            />
          );
        })}
        {/* Nodes */}
        {allNotes.map((n) => {
          const p = positions.get(n.id)!;
          const isCurrent = n.id === note.id;
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onOpenNote(n.id)}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={isCurrent ? 6 : 3.5}
                fill={isCurrent ? 'var(--acc)' : '#534AB7'}
              />
              <text
                x={p.x + 7}
                y={p.y + 2}
                fontSize={7}
                fill={isCurrent ? 'var(--acc2)' : 'var(--t3)'}
                fontFamily="JetBrains Mono"
                fontWeight={isCurrent ? 600 : 400}
              >
                {n.title.slice(0, 14)}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ fontSize: 9, color: 'var(--t3)', lineHeight: 1.6 }}>
        {edges.length} connections across {allNotes.length} notes. Click any node to open it.
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
          fontSize: 9,
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
        <div style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>no recorded edits yet</div>
      ) : (
        noteHistory.slice(0, 8).map((h) => (
          <HistoryRow key={h.id} text={h.text} timestamp={h.timestamp} />
        ))
      )}

      <div
        style={{
          fontSize: 9,
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
        <div style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic' }}>no other recent activity</div>
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
        fontSize: 10,
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
