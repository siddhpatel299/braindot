'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Note, Folder, TAG_COLORS } from '@/types';
import { forceDirectedLayout } from '@/utils/graph';
import {
  getHeat, getNodeRadius, getEdgeStyle, curvedPath, formatTime, formatShortDate,
  HEAT_STYLES, HeatLevel,
} from '@/utils/heat';
import {
  Search, X, Tag, Folder as FolderIcon, Hash, ArrowRight, Network, Activity, Flame,
} from 'lucide-react';

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

  if (filteredNotes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
        <GraphSidebar
          notes={notes}
          folders={folders}
          onBack={onBack}
          colorMode={colorMode}
          setColorMode={setColorMode}
          showMode={showMode}
          setShowMode={setShowMode}
          stats={stats}
          heatMap={heatMap}
          onOpenNote={onOpenNote}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', fontSize: 14, fontStyle: 'italic' }}>
          no notes match your filters
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Left sidebar: filters + stats + legend + activity feed */}
      <GraphSidebar
        notes={notes}
        folders={folders}
        onBack={onBack}
        colorMode={colorMode}
        setColorMode={setColorMode}
        showMode={showMode}
        setShowMode={setShowMode}
        stats={stats}
        heatMap={heatMap}
        onOpenNote={onOpenNote}
      />

      {/* Main canvas: the graph */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
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
                onClick={() => { setSelectedNode(n.id); onOpenNote(n.id); }}
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
                    fill={heat === 'hot' ? 'rgba(251,146,60,0.12)' : 'rgba(176,168,251,0.10)'}
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

        {/* Legend (top-left) */}
        <div style={{
          position: 'absolute', top: 14, left: 14,
          background: 'var(--bg1)', border: '1px solid var(--bd2)', borderRadius: 6,
          padding: '10px 12px', fontSize: 10, color: 'var(--t3)',
          display: 'flex', flexDirection: 'column', gap: 5,
        }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 2 }}>
            {colorMode === 'activity' ? 'Activity Heat' : colorMode === 'tag' ? 'Tag Colors' : 'Link Density'}
          </div>
          {colorMode === 'activity' && (
            <>
              <LegendDot color="#fb923c" size={11} label="today" />
              <LegendDot color="#b0a8fb" size={9} label="this week" />
              <LegendDot color="#534AB7" size={8} label="this month" />
              <LegendDot color="#2e2e44" size={6} label="older" />
              <div style={{ height: 1, background: 'var(--bd)', margin: '3px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 20, height: 1, background: 'var(--acc-bd)' }} />
                <span>strong link</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 20, height: 1, background: '#1e1e21', borderTop: '1px dashed #1e1e21' }} />
                <span>weak link</span>
              </div>
            </>
          )}
          {colorMode === 'tag' && (
            <>
              {Object.entries(TAG_COLORS).map(([tag, c]) => (
                <LegendDot key={tag} color={c.color} size={9} label={`#${tag}`} />
              ))}
              <LegendDot color="#534AB7" size={9} label="no tag" />
            </>
          )}
          {colorMode === 'links' && (
            <>
              <LegendDot color="#b0a8fb" size={11} label="8+ backlinks" />
              <LegendDot color="#7c6ef7" size={9} label="4-7 backlinks" />
              <LegendDot color="#534AB7" size={8} label="1-3 backlinks" />
              <LegendDot color="#2e2e44" size={6} label="orphan" />
            </>
          )}
        </div>

        {/* Hover tooltip */}
        {hoveredNode && noteById.get(hoveredNode) && (
          <NodeTooltip note={noteById.get(hoveredNode)!} heat={heatMap.get(hoveredNode) || 'cold'} />
        )}

        {/* Bottom-right node count */}
        <div style={{
          position: 'absolute', bottom: 14, right: 14,
          background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5,
          padding: '6px 10px', fontSize: 11, color: 'var(--t3)', fontFamily: 'inherit',
        }}>
          {stats.hot} hot · {stats.warm} warm · {stats.cold} fading
        </div>
      </div>
    </div>
  );
}

/* ---------- Graph Sidebar (filters + legend + activity feed) ---------- */

function GraphSidebar({
  notes, folders, onBack, colorMode, setColorMode, showMode, setShowMode, stats, heatMap, onOpenNote,
}: {
  notes: Note[];
  folders: Folder[];
  onBack: () => void;
  colorMode: ColorMode;
  setColorMode: (m: ColorMode) => void;
  showMode: ShowMode;
  setShowMode: (m: ShowMode) => void;
  stats: { hot: number; warm: number; month: number; cold: number; total: number; edges: number };
  heatMap: Map<string, HeatLevel>;
  onOpenNote: (id: string) => void;
}) {
  // Activity feed data
  const hotNotes = useMemo(() => notes.filter((n) => heatMap.get(n.id) === 'hot').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [notes, heatMap]);
  const warmNotes = useMemo(() => notes.filter((n) => heatMap.get(n.id) === 'warm').sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [notes, heatMap]);
  const coldNotes = useMemo(() => notes.filter((n) => heatMap.get(n.id) === 'cold').sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()).slice(0, 5), [notes, heatMap]);

  // 14-day heatmap data
  const heatmapData = useMemo(() => {
    const days: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const count = notes.filter((n) => n.updatedAt.slice(0, 10) === dateStr).length;
      days.push({ date: dateStr, count });
    }
    return days;
  }, [notes]);

  return (
    <div style={{
      width: 260, minWidth: 260,
      background: 'var(--bg1)', borderRight: '1px solid var(--bd)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
        {/* Back button */}
        <button onClick={onBack} style={{
          background: 'transparent', border: '1px solid var(--bd2)', borderRadius: 4,
          padding: '6px 10px', color: 'var(--t2)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18,
        }}>
          <ArrowRight size={12} style={{ transform: 'rotate(180deg)' }} /> back
        </button>

        {/* Title */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Network size={16} color="var(--acc2)" />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', margin: 0 }}>living graph</h1>
          </div>
          <p style={{ fontSize: 12, color: 'var(--t3)', margin: 0 }}>activity-aware knowledge map</p>
        </div>

        {/* Color by */}
        <div style={{ marginBottom: 16 }}>
          <Label>color by</Label>
          <div style={{ display: 'flex', gap: 3 }}>
                {([
                  { id: 'activity', label: 'activity', icon: Activity },
                  { id: 'tag', label: 'tag', icon: Tag },
                  { id: 'links', label: 'links', icon: Network },
                ] as const).map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button key={opt.id} onClick={() => setColorMode(opt.id)} style={{
                      flex: 1, padding: '5px 6px', borderRadius: 4,
                      background: colorMode === opt.id ? 'var(--acc-bg)' : 'transparent',
                      border: '1px solid ' + (colorMode === opt.id ? 'var(--acc-bd)' : 'var(--bd2)'),
                      color: colorMode === opt.id ? 'var(--acc2)' : 'var(--t3)',
                      fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                    }}>
                      <Icon size={10} />
                      {opt.label}
                    </button>
                  );
                })}
          </div>
        </div>

        {/* Show */}
        <div style={{ marginBottom: 16 }}>
          <Label>show</Label>
          <div style={{ display: 'flex', gap: 3 }}>
            {([
              { id: 'all', label: 'all' },
              { id: 'hot', label: 'hot only' },
              { id: 'orphans', label: 'orphans' },
            ] as const).map((opt) => (
              <button key={opt.id} onClick={() => setShowMode(opt.id)} style={{
                flex: 1, padding: '5px 6px', borderRadius: 4,
                background: showMode === opt.id ? 'var(--acc-bg)' : 'transparent',
                border: '1px solid ' + (showMode === opt.id ? 'var(--acc-bd)' : 'var(--bd2)'),
                color: showMode === opt.id ? 'var(--acc2)' : 'var(--t3)',
                fontSize: 10, fontFamily: 'inherit', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 5, padding: '12px 14px', marginBottom: 16 }}>
          <Label>graph stats</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fb923c' }} />
              <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 600 }}>{stats.hot}</span>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>hot</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#b0a8fb' }} />
              <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 600 }}>{stats.warm}</span>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>warm</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2e2e44' }} />
              <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 600 }}>{stats.cold}</span>
              <span style={{ fontSize: 10, color: 'var(--t3)' }}>fading</span>
            </span>
          </div>
          <StatRow label="nodes" value={stats.total} />
          <StatRow label="edges" value={stats.edges} />
        </div>

        {/* Activity feed: 14-day heatmap */}
        <div style={{ marginBottom: 16 }}>
          <Label>writing heat — last 14 days</Label>
          <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
            {heatmapData.map((day) => {
              const intensity = Math.min(day.count / 3, 1);
              const bg = day.count === 0 ? 'var(--bg3)' : `rgba(124,110,247,${0.3 + intensity * 0.7})`;
              return (
                <div key={day.date} title={`${day.date}: ${day.count} edits`} style={{
                  flex: 1, height: 24, borderRadius: 2, background: bg,
                  border: intensity > 0.7 ? '1px solid #fb923c' : '1px solid transparent',
                }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--t3)' }}>
            <span>{formatShortDate(heatmapData[0]?.date || new Date().toISOString())}</span>
            <span>today</span>
          </div>
        </div>

        {/* Today — hot notes */}
        {hotNotes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Label>today — {hotNotes.length} touched</Label>
            {hotNotes.map((n) => (
              <ActivityRow key={n.id} note={n} dotColor="#fb923c" timeLabel={formatTime(n.updatedAt)} onOpen={() => onOpenNote(n.id)} />
            ))}
          </div>
        )}

        {/* This week — warm notes */}
        {warmNotes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Label>this week</Label>
            {warmNotes.map((n) => (
              <ActivityRow key={n.id} note={n} dotColor="#b0a8fb" timeLabel={formatShortDate(n.updatedAt)} onOpen={() => onOpenNote(n.id)} />
            ))}
          </div>
        )}

        {/* Fading — cold notes */}
        {coldNotes.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <Label>fading — 30d+ untouched</Label>
            {coldNotes.map((n) => (
              <ActivityRow key={n.id} note={n} dotColor="#2e2e44" timeLabel={formatShortDate(n.updatedAt)} muted onOpen={() => onOpenNote(n.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
      color: 'var(--t3)', fontWeight: 600, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: 'var(--t3)' }}>{label}</span>
      <span style={{ color: 'var(--t1)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function LegendDot({ color, size, label }: { color: string; size: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: color }} />
      <span>{label}</span>
    </div>
  );
}

function ActivityRow({
  note, dotColor, timeLabel, muted, onOpen,
}: {
  note: Note;
  dotColor: string;
  timeLabel: string;
  muted?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      style={{
        width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--bd)',
        borderRadius: 0, padding: '6px 0', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: muted ? 'var(--t3)' : 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title}
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0 }}>{timeLabel}</span>
    </button>
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
        <span>{note.backlinks.length} backlinks</span>
        <span>·</span>
        <span>{note.wordCount} words</span>
        {note.tags.length > 0 && <><span>·</span><span>{note.tags.map((t) => `#${t}`).join(' ')}</span></>}
      </div>
      <div style={{ color: heatStyle.activityColor, fontSize: 10, marginTop: 4, fontWeight: 600 }}>
        {heatStyle.activityString}
      </div>
    </div>
  );
}
