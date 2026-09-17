'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Note, Folder } from '@/types';
import { plural } from '@/utils/markdown';
import { getHeat } from '@/utils/heat';
import {
  Point, RADIUS, TIERS, SpatialHash, boundsOf, buildEdges, circleArc, degreeMap,
  adjacency, seedLayout, tierOf, UNLINKED, Cluster,
} from '@/utils/graph';
import { Search, X, Network, RotateCcw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { ViewHeader } from './ViewHeader';

interface GraphViewProps {
  notes: Note[];
  folders: Folder[];
  onOpenNote: (id: string) => void;
  onBack: () => void;
}

/** Pins only, keyed by note id — not a snapshot of every coordinate. A full
 *  snapshot was discarded wholesale the moment one note was added. */
const PIN_KEY = 'sb-graph-pins';

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3.2;
/** The foot of the surface always carries the overlay row, so it is not map. */
const FOOT_RESERVE = 78;

/** Drawn radius is additive, never clamped: `Math.max(RADIUS, k/zoom)` flattens
 *  the whole size ramp to one dot the moment the floor passes the largest true
 *  radius. Hit-testing keeps using true RADIUS. */
const drawR = (degree: number, zoom: number) => RADIUS(degree) + 0.9 / zoom;

interface LabelBox { x1: number; y1: number; x2: number; y2: number }

/**
 * The vault as a map.
 *
 * Three decisions carry this at 500+ notes. Layout is cluster-seeded and
 * derived on demand, so selecting a note cannot rearrange the vault — the old
 * view passed the selection into the simulation, re-ran it, and wrote the
 * result over the saved positions, which destroyed your spatial memory of the
 * map every time you inspected anything. Nodes are four bucketed paths rather
 * than 500 elements, with hit-testing done mathematically against a spatial
 * hash. Type lives in an unscaled HTML overlay, so labels stay legible at every
 * zoom instead of scaling with the content.
 */
export function GraphView({ notes, folders, onOpenNote, onBack }: GraphViewProps) {
  const [zoom, setZoom] = useState(0.34);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [dims, setDims] = useState({ w: 1000, h: 600 });
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<Record<string, Point>>({});
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [pinned, setPinned] = useState<Record<string, Point>>({});
  const [reseed, setReseed] = useState(0);
  const [panning, setPanning] = useState(false);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const drag = useRef<null | {
    kind: 'node' | 'pan';
    id?: string; ox?: number; oy?: number;
    cx?: number; cy?: number; pan?: Point; moved?: boolean;
  }>(null);
  const fittedRef = useRef(false);
  /* Latched in an effect, never assigned during render: the layout reads it
     from a callback, so it must not be a render-phase write. */
  const pinnedRef = useRef(pinned);
  useEffect(() => { pinnedRef.current = pinned; }, [pinned]);

  /* ---------- the graph itself ---------- */
  const edges = useMemo(() => buildEdges(notes), [notes]);
  const degree = useMemo(() => degreeMap(notes, edges), [notes, edges]);
  const adj = useMemo(() => adjacency(edges), [edges]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  /** The note *set*, not the notes' contents: editing a body should not move
   *  the map, but adding or removing a note should. */
  const vaultSignature = useMemo(
    () => `${notes.length}:${edges.length}:${notes.map((n) => n.id).join(',')}`,
    [notes, edges.length],
  );

  /* ---------- pins ---------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PIN_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Point>;
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setPinned(parsed && typeof parsed === 'object' ? parsed : {});
    } catch { /* a corrupt key is not worth failing the view over */ }
  }, []);

  /** Drop pins for notes that no longer exist, so a deleted note cannot leave
   *  a coordinate behind for an id that will never come back.
   *
   *  Reads the state, not the ref: the ref is latched by its own effect, which
   *  has not run yet the first time this one does, so a ref read here sees the
   *  empty initial value and prunes nothing. */
  useEffect(() => {
    const ids = Object.keys(pinned);
    const live = ids.filter((id) => noteById.has(id));
    if (live.length === ids.length) return;
    const next: Record<string, Point> = {};
    for (const id of live) next[id] = pinned[id];
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPinned(next);
    try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch {}
  }, [noteById, pinned]);

  const savePins = useCallback((next: Record<string, Point>) => {
    setPinned(next);
    try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch {}
  }, []);

  /* ---------- layout, derived on demand ----------
     Depends on the note set and the re-derive button, and on nothing else.
     Selection, hover, search, pan and zoom are all absent from this list on
     purpose: that is the whole fix. */
  useEffect(() => {
    const r = seedLayout(notes, edges, folders, pinnedRef.current);
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPos(r.pos);
    setClusters(r.clusters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultSignature, reseed, folders]);

  const hash = useMemo(() => new SpatialHash(pos), [pos]);

  /* ---------- measurement ---------- */
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setDims((cur) => (cur.w === r.width && cur.h === r.height ? cur : { w: r.width, h: r.height }));
    };
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  /* ---------- view ---------- */
  const fit = useCallback(() => {
    const b = boundsOf(pos);
    const pad = 54;
    const usableH = Math.max(120, dims.h - FOOT_RESERVE);
    const z = Math.max(MIN_ZOOM, Math.min(1.2, Math.min(
      (dims.w - pad * 2) / Math.max(1, b.maxX - b.minX),
      (usableH - pad * 2) / Math.max(1, b.maxY - b.minY),
    )));
    setZoom(z);
    setPan({
      x: (dims.w - (b.maxX - b.minX) * z) / 2 - b.minX * z,
      y: (usableH - (b.maxY - b.minY) * z) / 2 - b.minY * z,
    });
  }, [pos, dims]);

  // Fit once, when the first layout and a real size are both in hand. The
  // guard means this runs exactly once per mount, not on every measurement.
  useEffect(() => {
    if (fittedRef.current) return;
    if (dims.w < 10 || Object.keys(pos).length === 0) return;
    fittedRef.current = true;
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    fit();
  }, [dims, pos, fit]);

  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
    setZoom((cur) => {
      if (z === cur) return cur;
      setPan((p) => ({ x: cx - (cx - p.x) * (z / cur), y: cy - (cy - p.y) * (z / cur) }));
      return z;
    });
  }, []);

  const zoomBy = (f: number) => zoomAt(zoom * f, dims.w / 2, dims.h / 2);

  const flyTo = useCallback((id: string, z?: number) => {
    const p = pos[id];
    if (!p) return;
    const nz = z ?? Math.max(zoom, 1.1);
    setSel(id);
    setZoom(nz);
    setPan({ x: dims.w / 2 - p.x * nz, y: (dims.h - FOOT_RESERVE) / 2 - p.y * nz });
  }, [pos, zoom, dims]);

  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (clientX - r.left - pan.x) / zoom, y: (clientY - r.top - pan.y) / zoom };
  }, [pan, zoom]);

  const pick = useCallback((clientX: number, clientY: number): string | null => {
    const w = toWorld(clientX, clientY);
    return hash.nearest(w.x, w.y, pos, degree, 6 / zoom);
  }, [hash, pos, degree, zoom, toWorld]);

  /* ---------- pointer ---------- */
  const onMouseDown = (e: React.MouseEvent) => {
    const id = pick(e.clientX, e.clientY);
    if (id) {
      const w = toWorld(e.clientX, e.clientY);
      const p = pos[id];
      drag.current = { kind: 'node', id, ox: w.x - p.x, oy: w.y - p.y, moved: false };
      setSel(id);
    } else {
      drag.current = { kind: 'pan', cx: e.clientX, cy: e.clientY, pan: { ...pan } };
      setPanning(true);
    }
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === 'pan') {
        setPan({ x: d.pan!.x + (e.clientX - d.cx!), y: d.pan!.y + (e.clientY - d.cy!) });
        return;
      }
      const w = toWorld(e.clientX, e.clientY);
      d.moved = true;
      setPos((cur) => ({ ...cur, [d.id!]: { x: w.x - d.ox!, y: w.y - d.oy! } }));
    };
    const up = () => {
      const d = drag.current;
      // Moving a node by hand is what pins it; the pin records where you put it.
      if (d?.kind === 'node' && d.moved && d.id) {
        const p = pos[d.id];
        if (p) savePins({ ...pinnedRef.current, [d.id]: { x: p.x, y: p.y } });
      }
      drag.current = null;
      setPanning(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [toWorld, pos, savePins]);

  const onWheel = (e: React.WheelEvent) => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r) return;
    if (e.ctrlKey || e.metaKey) {
      zoomAt(zoom * (1 - e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        if (e.key === 'Escape') el.blur();
        return;
      }
      if (e.key === 'Escape') { setSel(null); setQuery(''); }
      if (e.key === 'f') fit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fit]);

  /* ---------- selection, search ---------- */
  const q = query.trim().toLowerCase();
  const hits = useMemo(
    () => (q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : []),
    [q, notes],
  );
  const hitIds = useMemo(() => new Set(hits.map((n) => n.id)), [hits]);
  const selNote = sel ? noteById.get(sel) ?? null : null;
  const neighbourIds = useMemo(
    () => (selNote ? adj.get(selNote.id) ?? new Set<string>() : new Set<string>()),
    [selNote, adj],
  );

  const dimmed = useCallback((id: string) => {
    if (q) return !hitIds.has(id);
    if (selNote) return id !== selNote.id && !neighbourIds.has(id);
    return false;
  }, [q, hitIds, selNote, neighbourIds]);

  /* ---------- geometry for the renderer ---------- */
  const edgePath = useMemo(() => {
    let d = '';
    for (const e of edges) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) continue;
      d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
  }, [edges, pos]);

  const hotPath = useMemo(() => {
    if (!selNote) return '';
    let d = '';
    for (const e of edges) {
      if (e.from !== selNote.id && e.to !== selNote.id) continue;
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) continue;
      d += `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
    }
    return d;
  }, [selNote, edges, pos]);

  const tierPaths = useMemo(() => {
    const bright = ['', '', '', ''];
    const faded = ['', '', '', ''];
    for (const n of notes) {
      const p = pos[n.id];
      if (!p) continue;
      const deg = degree.get(n.id) ?? 0;
      const arc = circleArc(p.x, p.y, drawR(deg, zoom));
      if (dimmed(n.id)) faded[tierOf(deg)] += arc;
      else bright[tierOf(deg)] += arc;
    }
    return { bright, faded };
  }, [notes, pos, degree, zoom, dimmed]);

  /* ---------- rings ---------- */
  const rings = useMemo(() => {
    const out: { id: string; x: number; y: number; r: number; stroke: string; sw: number; op: number }[] = [];
    const push = (id: string, stroke: string, extra: number, sw: number, op: number) => {
      const p = pos[id];
      if (!p) return;
      out.push({ id: `${id}-${stroke}`, x: p.x, y: p.y, r: drawR(degree.get(id) ?? 0, zoom) + extra, stroke, sw, op });
    };
    // Recency is all that survives of the old heat ramp: a thin amber ring.
    for (const n of notes) {
      if (getHeat(n.updatedAt) === 'hot' && !dimmed(n.id)) push(n.id, 'var(--amb)', 2.6, 1 / zoom, 0.5);
    }
    for (const id of Object.keys(pinned)) if (pos[id]) push(id, 'var(--t2)', 4, 1 / zoom, 0.5);
    for (const n of hits.slice(0, 60)) push(n.id, 'var(--acc2)', 4.5, 1.6 / zoom, 0.9);
    if (hover) push(hover, 'var(--t1)', 3.5, 1.4 / zoom, 0.8);
    if (selNote) push(selNote.id, 'var(--acc2)', 5.5, 2 / zoom, 1);
    return out;
  }, [notes, pos, degree, zoom, pinned, hits, hover, selNote, dimmed]);

  /* ---------- labels: one occupancy list, claimed in priority order ---------- */
  const labels = useMemo(() => {
    const sx = (x: number) => x * zoom + pan.x;
    const sy = (y: number) => y * zoom + pan.y;
    const inView = (x: number, y: number, m: number) => x > -m && x < dims.w + m && y > -m && y < dims.h + m;

    const taken: LabelBox[] = [];
    const PAD = 3;
    const free = (b: LabelBox) => !taken.some((t) => b.x1 < t.x2 && b.x2 > t.x1 && b.y1 < t.y2 && b.y2 > t.y1);

    const nodeLabels: { id: string; title: string; x: number; y: number; size: number; op: number }[] = [];
    const placeLabels: { id: string; name: string; x: number; y: number; size: number }[] = [];

    const pushNode = (n: Note, size: number, op: number, force: boolean) => {
      const p = pos[n.id];
      if (!p) return;
      const deg = degree.get(n.id) ?? 0;
      const x = sx(p.x);
      const y = sy(p.y) + drawR(deg, zoom) * zoom + 4;
      if (!inView(x, y, 90)) return;
      const title = n.title.length > 34
        ? `${n.title.slice(0, 33).replace(/[\s,;:.]+$/, '')}…`
        : n.title;
      const w = title.length * size * 0.5;
      const h = size * 1.3;
      const box = { x1: x - w / 2 - PAD, x2: x + w / 2 + PAD, y1: y - PAD, y2: y + h + PAD };
      if (!force && !free(box)) return;
      taken.push(box);
      nodeLabels.push({ id: n.id, title, x: Math.round(x), y: Math.round(y), size, op });
    };

    /* A territory with no name on it is worse than two labels sitting close, so
       a place name shifts to clear a collision but is never dropped. */
    const pushPlace = (id: string, name: string, wx: number, wy: number, size: number) => {
      const w = name.length * size * 0.78;
      const h = size * 1.35;
      const offsets = [0, -20, 20, -38, 38];
      for (let i = 0; i < offsets.length; i++) {
        const x = sx(wx);
        const y = sy(wy) + offsets[i];
        if (!inView(x, y, 130)) return;
        const box = { x1: x - w / 2 - PAD, x2: x + w / 2 + PAD, y1: y - h / 2 - PAD, y2: y + h / 2 + PAD };
        const last = i === offsets.length - 1;
        if (!free(box) && !last) continue;
        taken.push(box);
        placeLabels.push({ id, name, x: Math.round(x), y: Math.round(y), size });
        return;
      }
    };

    if (selNote) pushNode(selNote, 14, 1, true);
    if (hover && hover !== sel) {
      const h = noteById.get(hover);
      if (h) pushNode(h, 13, 1, true);
    }

    if (zoom < 1.5) {
      for (const c of clusters) {
        if (c.noteIds.length === 0) continue;
        if (c.id === UNLINKED) {
          pushPlace(c.id, `Unlinked · ${c.noteIds.length}`, c.centre.x, c.centre.y - 46 / zoom, 12);
        } else {
          pushPlace(c.id, c.name, c.centre.x, c.centre.y, zoom < 0.45 ? 15 : 12);
        }
      }
    }

    const minDeg = zoom < 0.5 ? 12 : zoom < 0.9 ? 6 : zoom < 1.6 ? 3 : 1;
    const budget = 48;
    const ranked = notes
      .filter((n) => (degree.get(n.id) ?? 0) >= minDeg)
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    for (const n of ranked) {
      if (nodeLabels.length >= budget) break;
      if (dimmed(n.id)) continue;
      pushNode(n, zoom < 0.9 ? 11 : 12.5, 0.85, false);
    }
    return { nodeLabels, placeLabels };
  }, [notes, pos, degree, zoom, pan, dims, clusters, selNote, hover, sel, noteById, dimmed]);

  /* ---------- facts and copy ---------- */
  const unlinkedCount = useMemo(
    () => notes.filter((n) => (degree.get(n.id) ?? 0) === 0).length,
    [notes, degree],
  );
  const hubCount = useMemo(
    () => notes.filter((n) => (degree.get(n.id) ?? 0) >= 8).length,
    [notes, degree],
  );

  const facts = notes.length === 0
    ? 'no notes yet'
    : `${plural(notes.length, 'note')} · ${plural(edges.length, 'link')} · ${unlinkedCount} unlinked`;

  const keyLine = notes.length < 50
    ? `${notes.length} notes, ${edges.length} links. A map needs about fifty before it tells you `
      + 'anything you did not already know — until then this is a sketch, and that is fine.'
    : `Bigger and brighter means more links. ${hubCount} notes carry eight or more; `
      + `${unlinkedCount} have none and sit in the band below the map. Drag a note to pin it where you put it.`;

  const neighbours = useMemo(() => {
    if (!selNote) return [];
    return [...neighbourIds]
      .map((id) => noteById.get(id))
      .filter((n): n is Note => !!n)
      .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
      .slice(0, 12);
  }, [selNote, neighbourIds, noteById, degree]);

  if (notes.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        <ViewHeader icon={Network} title="Graph" />
        <EmptyVault onBack={onBack} />
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      <ViewHeader icon={Network} title="Graph" facts={facts}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 28, padding: '0 10px',
          background: 'var(--bg2)', border: `1px solid ${q ? 'var(--acc-bd)' : 'var(--bd)'}`, borderRadius: 5,
        }}>
          <Search size={12} color="var(--t3)" strokeWidth={1.9} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && hits.length) flyTo(hits[0].id, 1.4);
              if (e.key === 'Escape') setQuery('');
            }}
            placeholder="find in the map…"
            aria-label="Find a note in the map"
            style={{
              width: 150, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--t1)', fontFamily: 'inherit', fontSize: 11, caretColor: 'var(--acc2)',
            }}
          />
          <span className="sb-fig" style={{ fontSize: 9.5, color: 'var(--t3)', minWidth: 34, textAlign: 'right' }}>
            {q ? (hits.length ? `${hits.length} found` : 'none') : ''}
          </span>
        </div>
        <span style={{ width: 1, height: 20, background: 'var(--bd)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GraphBtn label="Zoom out" onClick={() => zoomBy(1 / 1.18)}><ZoomOut size={14} strokeWidth={1.9} /></GraphBtn>
          <span className="sb-fig" style={{ fontSize: 11, color: 'var(--t2)', minWidth: 42, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <GraphBtn label="Zoom in" onClick={() => zoomBy(1.18)}><ZoomIn size={14} strokeWidth={1.9} /></GraphBtn>
          <GraphBtn label="Fit the whole vault" onClick={fit}><Maximize size={14} strokeWidth={1.9} /></GraphBtn>
        </div>
        <button
          onClick={() => setReseed((r) => r + 1)}
          title="Re-derive the layout — pinned notes stay put"
          style={{
            height: 28, padding: '0 11px', background: 'transparent', border: '1px solid var(--bd2)',
            borderRadius: 5, color: 'var(--t2)', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t2)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
        >
          <RotateCcw size={12} strokeWidth={1.9} />
          re-derive
        </button>
      </ViewHeader>

      <div
        ref={surfaceRef}
        onMouseDown={onMouseDown}
        onMouseMove={(e) => { if (!drag.current) { const id = pick(e.clientX, e.clientY); if (id !== hover) setHover(id); } }}
        onMouseLeave={() => setHover(null)}
        onDoubleClick={(e) => { const id = pick(e.clientX, e.clientY); if (id) onOpenNote(id); }}
        onWheel={onWheel}
        style={{
          flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', background: 'var(--bg)',
          cursor: panning ? 'grabbing' : hover ? 'pointer' : 'default',
        }}
      >
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, display: 'block' }}>
          <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {/* Every stroke inside the scaled group divides by zoom: a stroke
                authored in world units disappears when you zoom out. */}
            <path
              d={edgePath} fill="none" stroke="var(--bd)"
              strokeWidth={(q || selNote ? 0.6 : 0.8) / zoom}
              opacity={q || selNote ? 0.18 : 0.5}
            />
            {hotPath && <path d={hotPath} fill="none" stroke="var(--acc)" strokeWidth={1.6 / zoom} opacity={0.85} />}
            {TIERS.map((t, i) => tierPaths.faded[i] && (
              <path
                key={`f${i}`} d={tierPaths.faded[i]} fill={t.fill}
                stroke={t.stroke} strokeWidth={t.hollow ? 1.2 / zoom : 0} opacity={0.14}
              />
            ))}
            {TIERS.map((t, i) => tierPaths.bright[i] && (
              <path
                key={`b${i}`} d={tierPaths.bright[i]} fill={t.fill}
                stroke={t.stroke} strokeWidth={t.hollow ? 1.2 / zoom : 0} opacity={0.92}
              />
            ))}
            {rings.map((r) => (
              <circle key={r.id} cx={r.x} cy={r.y} r={r.r} fill="none" stroke={r.stroke} strokeWidth={r.sw} opacity={r.op} />
            ))}
          </g>
        </svg>

        {/* Type is an unscaled overlay, so it stays 11–15px at every zoom. */}
        {labels.placeLabels.map((p) => (
          <span
            key={p.id}
            className="sb-front-serif"
            style={{
              position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%,-50%)',
              fontSize: p.size, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--t2)', pointerEvents: 'none', whiteSpace: 'nowrap',
            }}
          >
            {p.name}
          </span>
        ))}
        {labels.nodeLabels.map((n) => (
          <span
            key={n.id}
            className="sb-front-serif"
            style={{
              position: 'absolute', left: n.x, top: n.y, transform: 'translate(-50%,0)',
              fontSize: n.size, lineHeight: 1.2, color: 'var(--t2)', opacity: n.op,
              pointerEvents: 'none', whiteSpace: 'nowrap', textShadow: '0 1px 3px var(--bg)',
            }}
          >
            {n.title}
          </span>
        ))}

        {/* The card and the legend share one bottom row, so they cannot land on
            each other the way two separately-anchored overlays did. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 14, padding: '0 16px',
          display: 'flex', alignItems: 'flex-end', gap: 14, pointerEvents: 'none',
        }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
            {selNote ? (
              <NoteCard
                note={selNote}
                degree={degree.get(selNote.id) ?? 0}
                cluster={clusters.find((c) => c.noteIds.includes(selNote.id))?.name ?? 'unfiled'}
                neighbours={neighbours}
                degreeOf={(id) => degree.get(id) ?? 0}
                pinnedHere={!!pinned[selNote.id]}
                onClose={() => setSel(null)}
                onOpen={() => onOpenNote(selNote.id)}
                onGo={(id) => flyTo(id)}
                onTogglePin={() => {
                  const next = { ...pinned };
                  if (next[selNote.id]) delete next[selNote.id];
                  else if (pos[selNote.id]) next[selNote.id] = { ...pos[selNote.id] };
                  savePins(next);
                }}
              />
            ) : (
              <span style={{ maxWidth: '56ch', fontSize: 11, lineHeight: 1.75, color: 'var(--t3)' }}>
                {keyLine}
              </span>
            )}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--t3)' }}>
              Links
            </span>
            {[...TIERS].reverse().map((t, i) => (
              <span key={t.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  width: [5, 7, 9, 12][i], height: [5, 7, 9, 12][i], borderRadius: '50%',
                  background: t.hollow ? 'transparent' : t.fill,
                  border: `1px solid ${t.hollow ? t.stroke : t.fill}`,
                }} />
                <span className="sb-fig" style={{ fontSize: 9, color: 'var(--t3)' }}>{t.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Pieces
   ============================================================ */

function GraphBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} title={label} aria-label={label}
      style={{
        width: 30, height: 30, borderRadius: 4, background: 'transparent', border: '1px solid var(--bd2)',
        color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
    >
      {children}
    </button>
  );
}

function NoteCard({
  note, degree, cluster, neighbours, degreeOf, pinnedHere, onClose, onOpen, onGo, onTogglePin,
}: {
  note: Note; degree: number; cluster: string; neighbours: Note[];
  degreeOf: (id: string) => number; pinnedHere: boolean;
  onClose: () => void; onOpen: () => void; onGo: (id: string) => void; onTogglePin: () => void;
}) {
  const days = Math.floor((Date.now() - new Date(note.updatedAt).getTime()) / 86400000);
  const meta = [
    plural(degree, 'link'),
    plural(note.wordCount, 'word'),
    note.status === 'evergreen' ? 'evergreen' : null,
    days <= 0 ? 'edited today' : `edited ${days}d ago`,
    cluster.toLowerCase(),
  ].filter(Boolean).join(' · ');

  return (
    <div style={{
      width: 330, background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 8,
      boxShadow: '0 14px 40px rgba(0,0,0,0.5)', pointerEvents: 'auto',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '13px 15px 11px', display: 'flex', flexDirection: 'column', gap: 7, borderBottom: '1px solid var(--bd)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
          <span className="sb-front-serif" style={{
            flex: 1, minWidth: 0, fontSize: 17, lineHeight: 1.25, fontWeight: 700,
            letterSpacing: '-0.01em', color: 'var(--t1)', textWrap: 'pretty',
          }}>
            {note.title}
          </span>
          <button
            onClick={onClose} aria-label="Close"
            style={{
              width: 20, height: 20, flexShrink: 0, background: 'transparent', border: 'none',
              color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
          >
            <X size={12} strokeWidth={2.2} />
          </button>
        </div>
        <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.02em' }}>{meta}</span>
      </div>

      <div className="sb-scroll" style={{ maxHeight: 168, overflowY: 'auto', padding: '4px 15px 8px' }}>
        <span style={{
          display: 'block', fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase',
          color: 'var(--t3)', padding: '9px 0 3px',
        }}>
          {neighbours.length ? `connects to ${neighbours.length}` : 'nothing links here yet'}
        </span>
        {neighbours.map((nb) => (
          <button
            key={nb.id}
            onClick={() => onGo(nb.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 0',
              background: 'transparent', border: 'none', borderBottom: '1px solid var(--bd)',
              fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <span style={{
              width: 4, height: 4, borderRadius: '50%', flexShrink: 0,
              background: nb.status === 'evergreen' ? 'var(--grn)' : 'var(--bd2)',
            }} />
            <span className="sb-front-serif" style={{
              flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--t2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {nb.title}
            </span>
            <span className="sb-fig" style={{ fontSize: 9, color: 'var(--t3)' }}>{degreeOf(nb.id)}</span>
          </button>
        ))}
      </div>

      <div style={{ padding: '10px 15px 12px', borderTop: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 7 }}>
        <button
          onClick={onOpen}
          style={{
            flex: 1, height: 29, background: 'var(--acc)', border: 'none', borderRadius: 5,
            color: 'var(--on-acc)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--acc)'; }}
        >
          open note
        </button>
        <button
          onClick={onTogglePin}
          title="A pin keeps this note where you put it when the layout is re-derived"
          style={{
            height: 29, padding: '0 10px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 10.5, whiteSpace: 'nowrap',
            background: pinnedHere ? 'var(--acc-bg)' : 'transparent',
            border: `1px solid ${pinnedHere ? 'var(--acc-bd)' : 'var(--bd2)'}`,
            color: pinnedHere ? 'var(--acc2)' : 'var(--t2)',
          }}
        >
          {pinnedHere ? 'unpin' : 'pin here'}
        </button>
      </div>
    </div>
  );
}

function EmptyVault({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ maxWidth: 390, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 11 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: 'var(--acc-bg)', border: '1px solid var(--acc-bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 5,
        }}>
          <Network size={16} color="var(--acc2)" strokeWidth={1.75} />
        </div>
        <span className="sb-front-serif" style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.3, color: 'var(--t1)' }}>
          Nothing to map yet.
        </span>
        <span style={{ fontSize: 11.5, lineHeight: 1.8, color: 'var(--t2)' }}>
          There is nothing to set up — the map is drawn from your links. Write a few notes, join two of
          them with <span style={{ color: 'var(--acc2)' }}>[[double brackets]]</span>, and the shape appears on its own.
        </span>
        <button
          onClick={onBack}
          style={{
            height: 32, padding: '0 14px', marginTop: 5, background: 'var(--acc)', border: 'none',
            borderRadius: 5, color: 'var(--on-acc)', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--acc)'; }}
        >
          back to notes
        </button>
        <span style={{ fontSize: 10.5, color: 'var(--t3)', lineHeight: 1.7 }}>
          Around fifty notes is when it starts to show you something.
        </span>
      </div>
    </div>
  );
}
