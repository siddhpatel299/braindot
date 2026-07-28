'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Note, Folder, TAG_COLORS } from '@/types';
import { forceDirectedLayout } from '@/utils/graph';
import { plural } from '@/utils/markdown';
import {
  getHeat, getNodeRadius, getEdgeStyle, curvedPath, formatTime, formatShortDate,
  HEAT_STYLES, HeatLevel,
} from '@/utils/heat';
import {
  Search, X, Tag, Folder as FolderIcon, Hash, ArrowRight, Network, Activity, Flame, ChevronDown,
} from 'lucide-react';
import { ViewHeader, ViewEmptyState } from './ViewHeader';

interface GraphViewProps {
  notes: Note[];
  folders: Folder[];
  onOpenNote: (id: string) => void;
  onBack: () => void;
}

type ColorMode = 'activity' | 'tag' | 'links';
type ShowMode = 'all' | 'hot' | 'orphans';

// localStorage key for graph positions
const POS_KEY = 'second-brain-graph-positions';

export function GraphView({ notes, folders, onOpenNote, onBack }: GraphViewProps) {
  const [colorMode, setColorMode] = useState<ColorMode>('activity');
  const [showMode, setShowMode] = useState<ShowMode>('all');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [svgDims, setSvgDims] = useState({ width: 800, height: 600 });

  // Measure available space
  useEffect(() => {
    const measure = () => {
      const el = svgRef.current?.parentElement;
      if (el) setSvgDims({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Build edges from wiki-links (deduplicated)
  const allEdges = useMemo(() => {
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
    return edges;
  }, [notes]);

  // Compute heat for each note
  const heatMap = useMemo(() => {
    const m = new Map<string, HeatLevel>();
    for (const n of notes) m.set(n.id, getHeat(n.updatedAt));
    return m;
  }, [notes]);

  // Filter notes based on showMode
  const filteredNotes = useMemo(() => {
    if (showMode === 'all') return notes;
    if (showMode === 'orphans') {
      const connected = new Set<string>();
      for (const e of allEdges) { connected.add(e.from); connected.add(e.to); }
      return notes.filter((n) => !connected.has(n.id) || n.backlinks.length === 0);
    }
    // hot only: hot + warm nodes + their direct neighbors
    const hotIds = new Set<string>();
    for (const n of notes) {
      const h = heatMap.get(n.id);
      if (h === 'hot' || h === 'warm') hotIds.add(n.id);
    }
    // Add neighbors
    for (const e of allEdges) {
      if (hotIds.has(e.from)) hotIds.add(e.to);
      if (hotIds.has(e.to)) hotIds.add(e.from);
    }
    return notes.filter((n) => hotIds.has(n.id));
  }, [notes, showMode, allEdges, heatMap]);

  const filteredNoteIds = useMemo(() => new Set(filteredNotes.map((n) => n.id)), [filteredNotes]);
  const filteredEdges = useMemo(() => {
    return allEdges.filter((e) => filteredNoteIds.has(e.from) && filteredNoteIds.has(e.to));
  }, [allEdges, filteredNoteIds]);

  // Load/save positions from localStorage
  const savedPositions = useMemo(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      return raw ? JSON.parse(raw) as Record<string, { x: number; y: number }> : null;
    } catch { return null; }
  }, []);

  // Compute layout (use saved positions if available)
  const layout = useMemo(() => {
    const nodeIds = filteredNotes.map((n) => n.id);
    if (savedPositions && nodeIds.every((id) => savedPositions[id])) {
      // Use saved positions
      return {
        nodes: nodeIds.map((id) => ({
          id,
          label: id,
          x: savedPositions[id].x,
          y: savedPositions[id].y,
          vx: 0, vy: 0, radius: 6, isCurrent: false, degree: 0,
        })),
        edges: filteredEdges,
      };
    }
    return forceDirectedLayout(nodeIds, filteredEdges, selectedNode, svgDims.width, svgDims.height - 20, 500);
  }, [filteredNotes, filteredEdges, selectedNode, svgDims, savedPositions]);

  // Save positions after layout settles
  useEffect(() => {
    if (layout.nodes.length === 0) return;
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of layout.nodes) positions[n.id] = { x: n.x, y: n.y };
    try { localStorage.setItem(POS_KEY, JSON.stringify(positions)); } catch { /* ignore */ }
  }, [layout]);

  const nodeMap = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  // Compute stats
  const stats = useMemo(() => {
    let hot = 0, warm = 0, month = 0, cold = 0;
    for (const n of notes) {
      const h = heatMap.get(n.id) || 'cold';
      if (h === 'hot') hot++;
      else if (h === 'warm') warm++;
      else if (h === 'month') month++;
      else cold++;
    }
    return { hot, warm, month, cold, total: notes.length, edges: allEdges.length };
  }, [notes, heatMap, allEdges]);

  // Get node color based on colorMode
  const getNodeColor = useCallback((noteId: string): string => {
    const note = noteById.get(noteId);
    if (!note) return '#2e2e44';
    if (colorMode === 'activity') {
      const heat = heatMap.get(noteId) || 'cold';
      return HEAT_STYLES[heat].color;
    }
    if (colorMode === 'tag') {
      if (note.tags.length > 0) {
        const tag = note.tags[0];
        return TAG_COLORS[tag]?.color || '#534AB7';
      }
      return '#534AB7';
    }
    // links mode — quartile coloring
    const bl = note.backlinks.length;
    if (bl >= 8) return '#b0a8fb';
    if (bl >= 4) return '#7c6ef7';
    if (bl >= 1) return '#534AB7';
    return '#2e2e44';
  }, [colorMode, heatMap, noteById]);

  // Animation refs
  const animRef = useRef<number>(0);
  const hotNodeIds = useMemo(() => {
    return filteredNotes.filter((n) => {
      const h = heatMap.get(n.id);
      return h === 'hot' || h === 'warm';
    }).map((n) => n.id);
  }, [filteredNotes, heatMap]);

  // Pulse animation using requestAnimationFrame
  useEffect(() => {
    if (hotNodeIds.length === 0) return;
    let t = 0;
    const svg = svgRef.current;
    if (!svg) return;

    const animate = () => {
      t += 0.025;
      for (const nodeId of hotNodeIds) {
        const heat = heatMap.get(nodeId);
        if (!heat) continue;
        const ring = svg.querySelector(`[data-pulse-ring="${nodeId}"]`) as SVGCircleElement | null;
        if (!ring) continue;
        const note = noteById.get(nodeId);
        const baseR = note ? getNodeRadius(note.backlinks.length, heat) : 6;
        if (heat === 'hot') {
          const scale = 1 + Math.sin(t) * 0.18;
          ring.setAttribute('r', String((baseR + 4) * scale));
          ring.setAttribute('opacity', String(0.12 + Math.sin(t) * 0.06));
        } else if (heat === 'warm') {
          const scale = 1 + Math.sin(t + Math.PI) * 0.10;
          ring.setAttribute('r', String((baseR + 4) * scale));
          ring.setAttribute('opacity', String(0.10 + Math.sin(t + Math.PI) * 0.04));
        }
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [hotNodeIds, heatMap, noteById]);

  // Helpers
  const getNodeFill = (noteId: string): string => {
    const note = noteById.get(noteId);
    if (!note) return '#2e2e44';
    if (colorMode === 'activity') {
      const heat = heatMap.get(noteId) || 'cold';
      return HEAT_STYLES[heat].color;
    }
    return getNodeColor(noteId);
  };

  const hasGlow = (noteId: string): boolean => {
    if (colorMode !== 'activity') return false;
    const heat = heatMap.get(noteId);
    return heat === 'hot' || heat === 'warm';
  };

  const hasPulse = (noteId: string): boolean => {
    if (colorMode !== 'activity') return false;
    const heat = heatMap.get(noteId);
    return heat === 'hot' || heat === 'warm';
  };

  const orphanCount = useMemo(() => {
    const connected = new Set<string>();
    for (const e of allEdges) { connected.add(e.from); connected.add(e.to); }
    return notes.filter((n) => !connected.has(n.id)).length;
  }, [notes, allEdges]);

  const header = (
    <ViewHeader
      icon={Network}
      title="Graph"
      facts={`${plural(notes.length, 'note')} · ${plural(allEdges.length, 'link')} · ${plural(orphanCount, 'orphan')}`}
    >
      {/* Colour-by and the filter belong here, not in a 260px control panel. */}
      <HeaderSelect
        value={colorMode}
        onChange={(v) => setColorMode(v as ColorMode)}
        options={[
          { id: 'activity', label: 'colour by edit recency' },
          { id: 'tag', label: 'colour by tag' },
          { id: 'links', label: 'colour by link count' },
        ]}
      />
      <HeaderSelect
        value={showMode}
        onChange={(v) => setShowMode(v as ShowMode)}
        options={[
          { id: 'all', label: 'all notes' },
          { id: 'hot', label: 'recently edited' },
          { id: 'orphans', label: 'orphans only' },
        ]}
      />
    </ViewHeader>
  );

  if (notes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {header}
        <ViewEmptyState
          icon={Network}
          heading="Too few notes to draw."
          body="The graph starts saying something at around twenty notes with a few links each. Link two notes with [[double brackets]] and the shape appears on its own."
          primaryLabel="back to notes"
          onPrimary={onBack}
          secondary="no setup — the graph is generated from your links"
        />
      </div>
    );
  }

  if (filteredNotes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {header}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', fontSize: 13 }}>
          No notes match this filter.
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {header}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
      {/* Main canvas: the graph */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg)', minWidth: 0 }}>
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${svgDims.width} ${svgDims.height}`}
          style={{ display: 'block' }}
        >
          {/* Edges */}
          {layout.edges.map((e, i) => {
            const a = nodeMap.get(e.from);
            const b = nodeMap.get(e.to);
            if (!a || !b) return null;
            const fromHeat = heatMap.get(e.from) || 'cold';
            const toHeat = heatMap.get(e.to) || 'cold';
            const edgeStyle = colorMode === 'activity' ? getEdgeStyle(fromHeat, toHeat) : { stroke: 'var(--acc-bd)', strokeWidth: 0.8 };
            const isHighlighted = hoveredNode && (e.from === hoveredNode || e.to === hoveredNode) ||
                                  selectedNode && (e.from === selectedNode || e.to === selectedNode);
            const path = curvedPath(a.x, a.y, b.x, b.y);
            return (
              <path
                key={i}
                d={path}
                fill="none"
                stroke={isHighlighted ? 'var(--acc)' : edgeStyle.stroke}
                strokeWidth={isHighlighted ? 1.8 : edgeStyle.strokeWidth}
                strokeDasharray={edgeStyle.dashArray}
                opacity={isHighlighted ? 0.95 : 0.5}
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((n) => {
            const note = noteById.get(n.id);
            if (!note) return null;
            const heat = heatMap.get(n.id) || 'cold';
            const r = getNodeRadius(note.backlinks.length, heat);
            const fill = getNodeFill(n.id);
            const glow = hasGlow(n.id);
            const pulse = hasPulse(n.id);
            const isHovered = hoveredNode === n.id;
            const isSelected = selectedNode === n.id;
            const showLabel = r >= 8 || isHovered || isSelected;
            const heatStyle = HEAT_STYLES[heat];
            const labelColor = colorMode === 'activity' ? heatStyle.labelColor : 'var(--t3)';

            return (
              <g
                key={n.id}
                style={{ cursor: 'pointer' }}
                // Click inspects, double-click opens. Clicking used to jump
                // straight into the editor, which left no way to look at a node
                // without leaving the graph.
                onClick={() => setSelectedNode(n.id)}
                onDoubleClick={() => onOpenNote(n.id)}
                onMouseEnter={() => setHoveredNode(n.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Soft glow halo (concentric circle, no filter) */}
                {glow && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r + (heat === 'hot' ? 6 : 4)}
                    fill={fill}
                    opacity={heat === 'hot' ? 0.15 : 0.10}
                  />
                )}
                {/* Pulse ring (only for hot/warm in activity mode) */}
                {pulse && (
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={r + 4}
                    fill={heat === 'hot' ? 'rgba(176,168,251,0.14)' : 'rgba(124,110,247,0.10)'}
                    data-pulse-ring={n.id}
                  />
                )}
                {/* Main node */}
                <circle
                  cx={n.x}
                  cy={n.y}
                  r={isHovered || isSelected ? r * 1.3 : r}
                  fill={fill}
                  opacity={isHovered || isSelected ? 1 : 0.88}
                  stroke={heat === 'cold' && colorMode === 'activity' ? '#333338' : 'none'}
                  strokeWidth={heat === 'cold' && colorMode === 'activity' ? 1 : 0}
                  style={{ transition: 'r 0.15s, opacity 0.15s' }}
                />
                {/* Label */}
                {showLabel && (
                  <text
                    x={n.x}
                    y={n.y + r + 12}
                    textAnchor="middle"
                    fontSize={9}
                    fill={isHovered || isSelected ? 'var(--t1)' : labelColor}
                    fontFamily="JetBrains Mono"
                    fontWeight={isHovered || isSelected ? 600 : 400}
                    pointerEvents="none"
                  >
                    {note.title.slice(0, 20)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredNode && noteById.get(hoveredNode) && (
          <NodeTooltip note={noteById.get(hoveredNode)!} heat={heatMap.get(hoveredNode) || 'cold'} />
        )}

        {/* One sentence instead of two legend boxes. The ramp is monotonic, so
            "brighter = more recent" is the whole key. */}
        <div style={{
          position: 'absolute', left: 18, bottom: 16, maxWidth: '52ch',
          fontSize: 11, lineHeight: 1.7, color: 'var(--t3)', pointerEvents: 'none',
        }}>
          {colorMode === 'activity' && <>Brighter nodes were edited more recently. </>}
          {colorMode === 'tag' && <>Node colour is the note&rsquo;s first tag. </>}
          {colorMode === 'links' && <>Brighter and larger nodes have more backlinks. </>}
          <span style={{ color: 'var(--t2)' }}>
            {stats.hot > 0 ? `${plural(stats.hot, 'note')} touched today; ` : ''}
            {orphanCount > 0
              ? `${plural(orphanCount, 'note')} with no links at all sit unattached at the edges.`
              : 'every note is connected to at least one other.'}
          </span>
        </div>
      </div>

      {/* Right: inspector for the selected node — the thing you actually want
          after clicking, rather than a panel of controls you set once. */}
      <NodeInspector
        note={selectedNode ? noteById.get(selectedNode) ?? null : null}
        allNotes={notes}
        heat={selectedNode ? heatMap.get(selectedNode) ?? 'cold' : 'cold'}
        edges={allEdges}
        noteById={noteById}
        onClear={() => setSelectedNode(null)}
        onOpenNote={onOpenNote}
        onSelectNote={setSelectedNode}
      />
      </div>
    </div>
  );
}

/* ---------- Header select ---------- */

function HeaderSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 28,
          padding: '0 26px 0 11px',
          borderRadius: 5,
          border: '1px solid var(--bd2)',
          background: 'transparent',
          color: 'var(--t2)',
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          appearance: 'none',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} style={{ background: 'var(--bg2)', color: 'var(--t1)' }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        color="var(--t3)"
        style={{ position: 'absolute', right: 9, pointerEvents: 'none' }}
      />
    </div>
  );
}

/* ---------- Node inspector ---------- */

function NodeInspector({
  note,
  allNotes,
  heat,
  edges,
  noteById,
  onClear,
  onOpenNote,
  onSelectNote,
}: {
  note: Note | null;
  allNotes: Note[];
  heat: HeatLevel;
  edges: { from: string; to: string }[];
  noteById: Map<string, Note>;
  onClear: () => void;
  onOpenNote: (id: string) => void;
  onSelectNote: (id: string) => void;
}) {
  const neighbours = useMemo(() => {
    if (!note) return [];
    const ids = new Set<string>();
    for (const e of edges) {
      if (e.from === note.id) ids.add(e.to);
      if (e.to === note.id) ids.add(e.from);
    }
    return Array.from(ids).map((id) => noteById.get(id)).filter((n): n is Note => Boolean(n));
  }, [note, edges, noteById]);

  return (
    <div
      style={{
        width: 300,
        minWidth: 300,
        flexShrink: 0,
        background: 'var(--bg1)',
        borderLeft: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 40,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 16px',
          borderBottom: '1px solid var(--bd)',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: note ? HEAT_STYLES[heat].color : 'var(--bd2)',
          }}
        />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: note ? 'var(--t1)' : 'var(--t3)' }}>
          {note ? 'selected' : 'nothing selected'}
        </span>
        {note && (
          <button
            onClick={onClear}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              color: 'var(--t3)',
              fontSize: 10.5,
              fontFamily: 'inherit',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            clear
          </button>
        )}
      </div>

      {!note ? (
        <div style={{ padding: '20px 16px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--t3)' }}>
          Click any node to see what it links to, what links back, and how long since you touched it.
        </div>
      ) : (
        <div
          className="sb-scroll"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          <div>
            <div
              className="sb-reading"
              style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25, marginBottom: 8 }}
            >
              {note.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 10.5, color: 'var(--t3)', flexWrap: 'wrap' }}>
              {note.status === 'evergreen' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--grn)' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--grn)' }} />
                  evergreen
                </span>
              )}
              <span>{plural(note.wordCount, 'word')}</span>
              <span style={{ color: HEAT_STYLES[heat].activityColor }}>{HEAT_STYLES[heat].activityString}</span>
            </div>
          </div>

          {note.subtitle && (
            <p className="sb-reading" style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--t2)', margin: 0 }}>
              {note.subtitle}
            </p>
          )}

          <div>
            <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t2)', marginBottom: 10 }}>
              connected · {neighbours.length}
            </div>
            {neighbours.length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--t3)' }}>
                Nothing links here yet. This note is one of the orphans.
              </div>
            ) : (
              neighbours.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  onClick={() => onSelectNote(n.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '7px 0',
                    borderBottom: '1px solid var(--bd)',
                    fontSize: 12,
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    borderBottomWidth: 1,
                    borderBottomStyle: 'solid',
                    borderBottomColor: 'var(--bd)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: n.status === 'evergreen' ? 'var(--grn)' : 'var(--bd2)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t2)' }}>
                    {n.title}
                  </span>
                </button>
              ))
            )}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => onOpenNote(note.id)}
              style={{
                flex: 1,
                height: 32,
                borderRadius: 5,
                background: 'var(--acc)',
                border: '1px solid var(--acc)',
                color: '#fff',
                fontSize: 11.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--acc2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--acc)')}
            >
              open note <ArrowRight size={12} />
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)' }}>
            {allNotes.length} notes in the vault
          </div>
        </div>
      )}
    </div>
  );
}

function NodeTooltip({ note, heat }: { note: Note; heat: HeatLevel }) {
  const heatStyle = HEAT_STYLES[heat];
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: 16,
      background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 5,
      padding: '10px 14px', fontSize: 12, color: 'var(--t1)',
      pointerEvents: 'none', maxWidth: 320,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 13 }}>{note.title}</div>
      {note.subtitle && (
        <div style={{ color: 'var(--t3)', fontStyle: 'italic', marginBottom: 6, fontSize: 11 }}>{note.subtitle}</div>
      )}
      <div style={{ color: 'var(--t3)', fontSize: 11, display: 'flex', gap: 10 }}>
        <span>{plural(note.backlinks.length, 'backlink')}</span>
        <span>·</span>
        <span>{plural(note.wordCount, 'word')}</span>
        {note.tags.length > 0 && <><span>·</span><span>{note.tags.map((t) => `#${t}`).join(' ')}</span></>}
      </div>
      <div style={{ color: heatStyle.activityColor, fontSize: 10, marginTop: 4, fontWeight: 600 }}>
        {heatStyle.activityString}
      </div>
    </div>
  );
}
