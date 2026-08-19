import type { Folder, Note } from '@/types';

/**
 * The vault as a map.
 *
 * Layout is cluster-seeded and deterministic, not simulated: topics go on a
 * ring, notes spiral out inside their topic's disc by descending degree, and a
 * short grid-accelerated relaxation removes overlaps. It runs in a few
 * milliseconds at 500 notes, gives the same answer every reload, and produces
 * a map with place names on it instead of a hairball.
 *
 * The force simulation this replaces was O(n²) over 500 iterations and — worse
 * — took the selected note as an argument and pinned it to the centre, so
 * inspecting a note rearranged the whole vault and overwrote the saved
 * coordinates. Nothing here takes a selection.
 */

export interface GraphEdge { from: string; to: string }
export interface Point { x: number; y: number }

/** A node's drawn size comes from its link count, and only from that. */
export const RADIUS = (degree: number) => 2.4 + Math.sqrt(degree) * 1.55;

/** Colour is link count too, so there are exactly four tiers. */
export const TIERS = [
  { min: 8, fill: 'var(--acc2)', stroke: 'none', hollow: false, label: '8+' },
  { min: 4, fill: 'var(--acc)', stroke: 'none', hollow: false, label: '4' },
  { min: 1, fill: 'var(--acc-bd)', stroke: 'none', hollow: false, label: '1' },
  { min: 0, fill: 'none', stroke: 'var(--bd2)', hollow: true, label: '0' },
] as const;

export const tierOf = (degree: number) => (degree >= 8 ? 0 : degree >= 4 ? 1 : degree >= 1 ? 2 : 3);

/** One circle as a pair of arcs, so a whole tier is a single path. */
export function circleArc(x: number, y: number, r: number): string {
  const left = (x - r).toFixed(1);
  const cy = y.toFixed(1);
  const d = (r * 2).toFixed(1);
  const rr = r.toFixed(1);
  return `M${left} ${cy}a${rr} ${rr} 0 1 0 ${d} 0a${rr} ${rr} 0 1 0 -${d} 0`;
}

/* ============================================================
   Edges and degree
   ============================================================ */

export function buildEdges(notes: Note[]): GraphEdge[] {
  const byTitle = new Map<string, string>();
  for (const n of notes) {
    byTitle.set(n.title.toLowerCase(), n.id);
    byTitle.set(n.filename.toLowerCase().replace(/\.md$/, ''), n.id);
  }
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const n of notes) {
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(n.body)) !== null) {
      const to = byTitle.get(m[1].trim().toLowerCase());
      if (!to || to === n.id) continue;
      const key = n.id < to ? `${n.id}|${to}` : `${to}|${n.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: n.id, to });
    }
  }
  return edges;
}

export function degreeMap(notes: Note[], edges: GraphEdge[]): Map<string, number> {
  const d = new Map<string, number>();
  for (const n of notes) d.set(n.id, 0);
  for (const e of edges) {
    d.set(e.from, (d.get(e.from) ?? 0) + 1);
    d.set(e.to, (d.get(e.to) ?? 0) + 1);
  }
  return d;
}

export function adjacency(edges: GraphEdge[]): Map<string, Set<string>> {
  const a = new Map<string, Set<string>>();
  const push = (x: string, y: string) => {
    if (!a.has(x)) a.set(x, new Set());
    a.get(x)!.add(y);
  };
  for (const e of edges) { push(e.from, e.to); push(e.to, e.from); }
  return a;
}

/* ============================================================
   Clustering — the map's place names
   ============================================================ */

export interface Cluster {
  id: string;
  name: string;
  noteIds: string[];
  /** Filled in by the seed, once the notes have coordinates. */
  centre: Point;
}

export const UNLINKED = '__unlinked__';

/**
 * A note's territory: its folder if it has one, otherwise the tag it and its
 * neighbours most agree on. A note with no links belongs to the unlinked band
 * regardless — that band is the reason "find the gaps" was worth building.
 */
export function clusterNotes(
  notes: Note[], folders: Folder[], degree: Map<string, number>, adj: Map<string, Set<string>>,
): Cluster[] {
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const byId = new Map(notes.map((n) => [n.id, n]));
  const buckets = new Map<string, { name: string; ids: string[] }>();
  const put = (key: string, name: string, id: string) => {
    if (!buckets.has(key)) buckets.set(key, { name, ids: [] });
    buckets.get(key)!.ids.push(id);
  };

  for (const n of notes) {
    if ((degree.get(n.id) ?? 0) === 0) { put(UNLINKED, 'Unlinked', n.id); continue; }
    if (n.folderId && folderName.has(n.folderId)) {
      put(`f:${n.folderId}`, folderName.get(n.folderId)!, n.id);
      continue;
    }
    // No folder: take the tag this note and its neighbours most agree on.
    const tally = new Map<string, number>();
    const count = (t: string) => tally.set(t, (tally.get(t) ?? 0) + 1);
    for (const t of n.tags) count(t);
    for (const nb of adj.get(n.id) ?? []) {
      const other = byId.get(nb);
      if (other) for (const t of other.tags) count(t);
    }
    const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) put(`t:${best[0]}`, best[0], n.id);
    else put('f:__unfiled__', 'Unfiled', n.id);
  }

  // Largest first, so the ring reads clockwise from the biggest territory —
  // and the unlinked band is never given a slot on the ring.
  return [...buckets.entries()]
    .filter(([key]) => key !== UNLINKED)
    .sort((a, b) => b[1].ids.length - a[1].ids.length)
    .map(([id, v]) => ({ id, name: v.name, noteIds: v.ids, centre: { x: 0, y: 0 } }))
    .concat(
      buckets.has(UNLINKED)
        ? [{ id: UNLINKED, name: 'Unlinked', noteIds: buckets.get(UNLINKED)!.ids, centre: { x: 0, y: 0 } }]
        : [],
    );
}

/* ============================================================
   The seed
   ============================================================ */

const RING = 1180;
/** Do not squash harder: a stronger squash bunches centroids left and right,
 *  and those discs then touch. */
const SQUASH = 0.85;
const GOLDEN = 2.39996323;

export interface SeedResult {
  pos: Record<string, Point>;
  clusters: Cluster[];
  unlinkedIds: string[];
}

/**
 * Place every note. Pinned notes keep the coordinates they were given.
 *
 * @param pinned  id → point, the notes the user has placed by hand.
 */
export function seedLayout(
  notes: Note[], edges: GraphEdge[], folders: Folder[], pinned: Record<string, Point> = {},
): SeedResult {
  const degree = degreeMap(notes, edges);
  const adj = adjacency(edges);
  const clusters = clusterNotes(notes, folders, degree, adj);
  const pos: Record<string, Point> = {};
  if (notes.length === 0) return { pos, clusters: [], unlinkedIds: [] };

  const byId = new Map(notes.map((n) => [n.id, n]));
  const ringClusters = clusters.filter((c) => c.id !== UNLINKED);
  const unlinked = clusters.find((c) => c.id === UNLINKED);

  ringClusters.forEach((cluster, ci) => {
    const n = cluster.noteIds.length;
    const a = (ci / Math.max(1, ringClusters.length)) * Math.PI * 2 - Math.PI / 2;
    const cx = Math.cos(a) * RING;
    const cy = Math.sin(a) * RING * SQUASH;
    /* The relaxation only needs RADIUS(a)+RADIUS(b)+9 between neighbours. A
       larger disc makes adjacent topics overlap into one violet haze, which is
       the whole premise failing. */
    const disc = 60 + Math.sqrt(n) * 18;
    const sorted = [...cluster.noteIds].sort((p, q) => (degree.get(q) ?? 0) - (degree.get(p) ?? 0));
    sorted.forEach((id, i) => {
      if (pinned[id]) { pos[id] = { ...pinned[id] }; return; }
      const rr = disc * Math.sqrt(i / Math.max(1, n - 1));
      const th = i * GOLDEN;
      pos[id] = { x: cx + Math.cos(th) * rr, y: cy + Math.sin(th) * rr };
    });
  });

  /* The unlinked get their own labelled place below the map rather than being
     flung to the viewport edges by repulsion. */
  const unlinkedIds = unlinked?.noteIds ?? [];
  const perRow = 20;
  unlinkedIds.forEach((id, k) => {
    if (pinned[id]) { pos[id] = { ...pinned[id] }; return; }
    pos[id] = {
      x: -((Math.min(perRow, unlinkedIds.length) - 1) * 46) / 2 + (k % perRow) * 46,
      y: RING * SQUASH + 180 + Math.floor(k / perRow) * 52,
    };
  });

  relax(notes, edges, pos, degree, pinned);

  for (const c of clusters) c.centre = centroid(c.noteIds, pos);
  void byId;
  return { pos, clusters, unlinkedIds };
}

/** Short grid-accelerated relaxation: separate overlaps, tighten links.
 *  O(n·k), not O(n²) — a few milliseconds at 532 notes. */
function relax(
  notes: Note[], edges: GraphEdge[], pos: Record<string, Point>,
  degree: Map<string, number>, pinned: Record<string, Point>,
) {
  const CELL = 56;
  const ITERS = 26;
  for (let iter = 0; iter < ITERS; iter++) {
    const grid = new Map<string, string[]>();
    for (const n of notes) {
      const p = pos[n.id];
      if (!p) continue;
      const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k)!.push(n.id);
    }
    for (const n of notes) {
      if (pinned[n.id]) continue;
      const p = pos[n.id];
      if (!p) continue;
      const gx = Math.floor(p.x / CELL), gy = Math.floor(p.y / CELL);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const bucket = grid.get(`${gx + dx},${gy + dy}`);
          if (!bucket) continue;
          for (const oid of bucket) {
            if (oid === n.id) continue;
            const q = pos[oid];
            const ddx = p.x - q.x, ddy = p.y - q.y;
            const d2 = ddx * ddx + ddy * ddy;
            const want = RADIUS(degree.get(n.id) ?? 0) + RADIUS(degree.get(oid) ?? 0) + 9;
            if (d2 < want * want && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = ((want - d) / d) * 0.5;
              p.x += ddx * push; p.y += ddy * push;
            }
          }
        }
      }
    }
    for (const e of edges) {
      const pa = pos[e.from], pb = pos[e.to];
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const want = 46 + RADIUS(degree.get(e.from) ?? 0) + RADIUS(degree.get(e.to) ?? 0);
      const f = ((d - want) / d) * 0.045;
      if (!pinned[e.from]) { pa.x += dx * f; pa.y += dy * f; }
      if (!pinned[e.to]) { pb.x -= dx * f; pb.y -= dy * f; }
    }
  }
  // The loop ends on attraction, which can pull a pair back into contact after
  // the last push. One final separation pass settles those.
  separate(notes, pos, degree, pinned);
}

/** One repulsion-only pass, same grid, no edge forces. */
function separate(
  notes: Note[], pos: Record<string, Point>,
  degree: Map<string, number>, pinned: Record<string, Point>,
) {
  const CELL = 56;
  const grid = new Map<string, string[]>();
  for (const n of notes) {
    const p = pos[n.id];
    if (!p) continue;
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(n.id);
  }
  for (const n of notes) {
    if (pinned[n.id]) continue;
    const p = pos[n.id];
    if (!p) continue;
    const gx = Math.floor(p.x / CELL), gy = Math.floor(p.y / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const oid of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (oid === n.id) continue;
          const q = pos[oid];
          const ddx = p.x - q.x, ddy = p.y - q.y;
          const d2 = ddx * ddx + ddy * ddy;
          const want = RADIUS(degree.get(n.id) ?? 0) + RADIUS(degree.get(oid) ?? 0) + 9;
          if (d2 < want * want && d2 > 0.0001) {
            const d = Math.sqrt(d2);
            const push = ((want - d) / d) * 0.6;
            p.x += ddx * push; p.y += ddy * push;
          }
        }
      }
    }
  }
}

export function centroid(ids: string[], pos: Record<string, Point>): Point {
  let x = 0, y = 0, n = 0;
  for (const id of ids) {
    const p = pos[id];
    if (!p) continue;
    x += p.x; y += p.y; n++;
  }
  return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
}

export function boundsOf(pos: Record<string, Point>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of Object.values(pos)) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (minX === Infinity) return { minX: -500, minY: -500, maxX: 500, maxY: 500 };
  return { minX, minY, maxX, maxY };
}

/* ============================================================
   Spatial hash — hit-testing without 500 DOM nodes
   ============================================================ */

export class SpatialHash {
  private cell = 64;
  private buckets = new Map<string, string[]>();

  constructor(pos: Record<string, Point>) {
    for (const [id, p] of Object.entries(pos)) {
      const k = `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`;
      if (!this.buckets.has(k)) this.buckets.set(k, []);
      this.buckets.get(k)!.push(id);
    }
  }

  /** The node whose centre is nearest the point and within its own radius —
   *  nearest, not merely first in the bucket, so a dense hub picks correctly. */
  nearest(
    x: number, y: number, pos: Record<string, Point>,
    degree: Map<string, number>, slack: number,
  ): string | null {
    const gx = Math.floor(x / this.cell), gy = Math.floor(y / this.cell);
    let best: string | null = null;
    let bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = this.buckets.get(`${gx + dx},${gy + dy}`);
        if (!bucket) continue;
        for (const id of bucket) {
          const p = pos[id];
          if (!p) continue;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d < RADIUS(degree.get(id) ?? 0) + slack && d < bestD) { bestD = d; best = id; }
        }
      }
    }
    return best;
  }
}

/* ============================================================
   A note's own neighbourhood
   ============================================================ */

/** The shape ContextPanel's neighbourhood view draws from. */
export interface NeighbourNode {
  id: string;
  x: number;
  y: number;
  radius: number;
  degree: number;
  isCurrent?: boolean;
}
export interface LayoutResult { nodes: NeighbourNode[]; edges: GraphEdge[] }

/**
 * The small graph shown beside a note: the note at the centre, its neighbours
 * on a ring, everything else on a wider ring.
 *
 * Deterministic and O(n) — for a dozen nodes around one subject a simulation
 * bought nothing, and here centring on the current note is the point rather
 * than the bug it was on the full map.
 */
export function radialNeighbourhood(
  ids: string[], edges: GraphEdge[], centreId: string | null, width: number, height: number,
): LayoutResult {
  const cx = width / 2, cy = height / 2;
  const adj = adjacency(edges);
  const deg = (id: string) => (adj.get(id)?.size ?? 0);
  const near = centreId ? adj.get(centreId) ?? new Set<string>() : new Set<string>();
  const inner = ids.filter((id) => id !== centreId && near.has(id));
  const outer = ids.filter((id) => id !== centreId && !near.has(id));
  const rInner = Math.min(width, height) * 0.28;
  const rOuter = Math.min(width, height) * 0.44;
  const radius = (id: string, current: boolean) =>
    current ? 9 : Math.min(8, 3.5 + Math.sqrt(deg(id)) * 1.4);

  const nodes: NeighbourNode[] = [];
  if (centreId && ids.includes(centreId)) {
    nodes.push({ id: centreId, x: cx, y: cy, radius: radius(centreId, true), degree: deg(centreId), isCurrent: true });
  }
  inner.forEach((id, i) => {
    const a = (i / Math.max(1, inner.length)) * Math.PI * 2 - Math.PI / 2;
    nodes.push({ id, x: cx + Math.cos(a) * rInner, y: cy + Math.sin(a) * rInner, radius: radius(id, false), degree: deg(id) });
  });
  outer.forEach((id, i) => {
    const a = (i / Math.max(1, outer.length)) * Math.PI * 2 - Math.PI / 2 + 0.3;
    nodes.push({ id, x: cx + Math.cos(a) * rOuter, y: cy + Math.sin(a) * rOuter, radius: radius(id, false), degree: deg(id) });
  });

  const present = new Set(ids);
  return { nodes, edges: edges.filter((e) => present.has(e.from) && present.has(e.to)) };
}
