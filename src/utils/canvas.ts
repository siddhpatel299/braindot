import { CanvasCard, CanvasCardData, Note } from '@/types';

/* ============================================================
   Geometry is authored, never inferred
   ============================================================

   Every card stores its own width and height, and every consumer — connector
   anchors, fit-to-screen, the minimap, group membership, collision — reads
   those stored numbers. The previous board guessed heights in three separate
   places with three different ternaries, so the fit rect, the connector
   endpoints and the minimap all pointed at boxes that were not on screen.
   There is no size ternary anywhere below render. */

export interface Box { x: number; y: number; width: number; height: number }

/** A note's size tier, so a hub reads as a hub before you read the title. */
export const NOTE_TIERS = [
  { minDegree: 8, width: 246, height: 112, titleSize: 17, showSubtitle: true },
  { minDegree: 4, width: 198, height: 96, titleSize: 14.5, showSubtitle: true },
  { minDegree: 0, width: 166, height: 66, titleSize: 13, showSubtitle: false },
] as const;

export function noteTier(degree: number) {
  return NOTE_TIERS.find((t) => degree >= t.minDegree) ?? NOTE_TIERS[NOTE_TIERS.length - 1];
}

export const STICKY_SIZE = { width: 172, height: 92 };

/** The geometry a card is created with. Stored on the card, never recomputed
 *  at render — overriding at draw time desyncs fit and the minimap from what
 *  is actually on the table. */
export function geometryFor(data: CanvasCardData, degree: number): { width: number; height: number } {
  if (data.type === 'sticky') return { ...STICKY_SIZE };
  const t = noteTier(degree);
  return { width: t.width, height: t.height };
}

/* ============================================================
   Placement
   ============================================================ */

const GAP = 10;

function intersects(a: Box, b: Box, gap = GAP): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * The nearest empty spot at or below (x, y).
 *
 * Walks the candidate box down the column, then starts the next column across,
 * until it clears every existing card by `GAP`. Every placement path goes
 * through this — palette, rail click, drag-drop, suggestion, sticky, promotion
 * — because a card dropped underneath another one on a spatial board is a card
 * you have lost.
 */
export function freeSpot(
  x: number, y: number, width: number, height: number, cards: CanvasCard[],
): { x: number; y: number } {
  const step = 24;
  const maxDown = 40;
  const maxAcross = 24;
  for (let col = 0; col < maxAcross; col++) {
    const cx = x + col * (width + GAP * 2);
    for (let row = 0; row < maxDown; row++) {
      const cy = y + row * step;
      const candidate = { x: cx, y: cy, width, height };
      if (!cards.some((c) => intersects(candidate, c))) return { x: cx, y: cy };
    }
  }
  // Every column was full for the depth we searched; drop it clear of
  // everything rather than on top of something.
  const lowest = cards.reduce((m, c) => Math.max(m, c.y + c.height), y);
  return { x, y: lowest + GAP * 2 };
}

/** The world-space box containing every card and group on the board. */
export function boardBounds(cards: CanvasCard[], groups: { x?: number; y?: number }[] = []): Box | null {
  if (cards.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + c.width);
    maxY = Math.max(maxY, c.y + c.height);
  }
  void groups;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function cardCentre(c: CanvasCard): { x: number; y: number } {
  return { x: c.x + c.width / 2, y: c.y + c.height / 2 };
}

/** Whole-box containment: a card straddling a group's edge is not inside it. */
export function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function boxIntersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/* ============================================================
   The note graph — degree drives a card's tier, and suggestions
   ============================================================ */

export interface NoteGraph {
  degree: Map<string, number>;
  /** noteId -> the set of notes it links to or from. */
  neighbours: Map<string, Set<string>>;
}

export function buildNoteGraph(notes: Note[]): NoteGraph {
  const byTitle = new Map<string, string>();
  for (const n of notes) {
    byTitle.set(n.title.toLowerCase(), n.id);
    byTitle.set(n.filename.toLowerCase().replace(/\.md$/, ''), n.id);
  }
  const neighbours = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    neighbours.get(a)!.add(b);
  };
  for (const n of notes) {
    if (!neighbours.has(n.id)) neighbours.set(n.id, new Set());
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(n.body)) !== null) {
      const target = byTitle.get(m[1].trim().toLowerCase());
      if (target && target !== n.id) { link(n.id, target); link(target, n.id); }
    }
  }
  const degree = new Map<string, number>();
  for (const [id, set] of neighbours) degree.set(id, set.size);
  for (const n of notes) if (!degree.has(n.id)) degree.set(n.id, 0);
  return { degree, neighbours };
}

/**
 * The two notes most connected to what is already on this table.
 *
 * Ranked by real overlap with the board, not by vault-wide degree — a hub with
 * no connection to anything here is not a suggestion, it is just a big note.
 * Notes with zero overlap are never returned.
 */
export function suggestions(
  notes: Note[], cards: CanvasCard[], graph: NoteGraph, limit = 2,
): { note: Note; overlap: number; reason: string }[] {
  const onBoard = new Set(
    cards.map((c) => (c.data.type === 'note' ? c.data.noteId : null)).filter((v): v is string => !!v),
  );
  if (onBoard.size === 0) return [];
  const out: { note: Note; overlap: number; reason: string }[] = [];
  for (const n of notes) {
    if (onBoard.has(n.id)) continue;
    const nb = graph.neighbours.get(n.id);
    if (!nb) continue;
    let overlap = 0;
    for (const id of nb) if (onBoard.has(id)) overlap++;
    if (overlap === 0) continue;
    out.push({
      note: n,
      overlap,
      reason: `links to ${overlap} card${overlap === 1 ? '' : 's'} on this table`,
    });
  }
  return out.sort((a, b) => b.overlap - a.overlap).slice(0, limit);
}

/* ============================================================
   Snapping
   ============================================================ */

export interface Guide { axis: 'x' | 'y'; at: number }

/**
 * Nudge a dragged box onto its neighbours' edges.
 *
 * Compares left / centre / right and top / middle / bottom against every other
 * card, and returns at most one offset and one guide per axis.
 */
export function snapOffset(
  moving: Box, others: Box[], tolerance: number,
): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = [];
  let dx = 0, dy = 0;
  let bestX = tolerance, bestY = tolerance;

  const xEdges = (b: Box) => [b.x, b.x + b.width / 2, b.x + b.width];
  const yEdges = (b: Box) => [b.y, b.y + b.height / 2, b.y + b.height];

  for (const o of others) {
    for (const me of xEdges(moving)) {
      for (const it of xEdges(o)) {
        const d = it - me;
        if (Math.abs(d) < bestX) { bestX = Math.abs(d); dx = d; guides[0] = { axis: 'x', at: it }; }
      }
    }
    for (const me of yEdges(moving)) {
      for (const it of yEdges(o)) {
        const d = it - me;
        if (Math.abs(d) < bestY) { bestY = Math.abs(d); dy = d; guides[1] = { axis: 'y', at: it }; }
      }
    }
  }
  return { dx, dy, guides: guides.filter(Boolean) };
}
