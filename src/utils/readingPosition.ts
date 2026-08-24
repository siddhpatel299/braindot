// Where you stopped reading, in a form another device can act on.
//
// The old position was `progress`, a 0–100 percentage derived from the chapter
// index. Two things were wrong with it. It could only ever return you to the
// top of a chapter — open a long one on your phone and you started it again.
// And because it rounded to a whole percent, a book with more than a hundred
// chapters mapped several chapters onto the same number and reopened on the
// wrong one.
//
// This counts characters into the chapter's rendered text instead. That number
// means the same thing everywhere: the markup is identical on every device, so
// character 8,421 is the same word on a phone in one column as on a desktop in
// another, whatever the font size. A pixel offset or a scroll fraction would
// both move when the text reflowed.

/** Where the reader stopped, on one device, at one moment. */
export interface ReadingPosition {
  /** Index into the chapter list. */
  chapter: number;
  /** Characters into that chapter's rendered text. */
  charOffset: number;
  /** ISO timestamp, so the later of two devices wins. */
  updatedAt: string;
}

/**
 * Which text node holds a given character offset, and how far into it.
 *
 * Pure, so the arithmetic can be checked without a DOM. Lengths are the text
 * nodes of the chapter in document order.
 */
export function locateOffset(
  lengths: number[],
  offset: number,
): { index: number; within: number } {
  if (lengths.length === 0) return { index: 0, within: 0 };
  const target = Math.max(0, offset);

  let seen = 0;
  for (let i = 0; i < lengths.length; i++) {
    // `<` not `<=`: an offset landing exactly on a boundary belongs to the
    // start of the next node, not the end of this one, which is what a reader
    // means by "I stopped here".
    if (target < seen + lengths[i]) return { index: i, within: target - seen };
    seen += lengths[i];
  }
  // Past the end — the chapter got shorter, or the offset came from a longer
  // edition. Sit at the last character rather than refusing to restore.
  const last = lengths.length - 1;
  return { index: last, within: Math.max(0, lengths[last]) };
}

/** Running total of characters before each node. */
export function cumulativeOffsets(lengths: number[]): number[] {
  const out: number[] = [];
  let seen = 0;
  for (const len of lengths) {
    out.push(seen);
    seen += len;
  }
  return out;
}

/**
 * Is a remembered position worth acting on?
 *
 * The opening of chapter one is where a book starts anyway, so restoring it
 * is indistinguishable from not restoring — and writing it would overwrite a
 * real position saved on another device with "at the beginning".
 */
export function isWorthRestoring(pos: ReadingPosition | null | undefined): boolean {
  if (!pos) return false;
  return pos.chapter > 0 || pos.charOffset > 0;
}

/**
 * Of two positions for the same book, the one to keep.
 *
 * Both devices write as you read, and the sync layer resolves per document by
 * last writer. Comparing the timestamps here means the position that survives
 * is the one from wherever you were actually reading, rather than whichever
 * push happened to land second.
 */
export function newerPosition(
  a: ReadingPosition | null | undefined,
  b: ReadingPosition | null | undefined,
): ReadingPosition | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return b.updatedAt > a.updatedAt ? b : a;
}

// ============================================================
// DOM side
// ============================================================

/** Every text node of the chapter, in document order. */
function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    out.push(node as Text);
    node = walker.nextNode();
  }
  return out;
}

/**
 * The character offset of whatever is at the top of the viewport.
 *
 * Measured against the rendered text rather than the markdown source: the
 * source carries `#` and `**` that never appear on screen, so an offset into
 * it would drift from what the reader can see. Highlights do not disturb this
 * — a `<mark>` wraps the passage without changing its text.
 */
export function offsetAtViewportTop(prose: HTMLElement, scroller: HTMLElement): number {
  const nodes = textNodes(prose);
  if (nodes.length === 0) return 0;

  const fold = scroller.getBoundingClientRect().top;
  let seen = 0;
  const range = document.createRange();

  for (const node of nodes) {
    const len = node.data.length;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();

    // The first node still on screen. Everything above it has scrolled past.
    if (rect.bottom > fold) {
      // Interpolate within the node so a long paragraph does not snap to its
      // first character. Line-accurate is as good as this needs to be.
      const covered = rect.height > 0
        ? Math.min(1, Math.max(0, (fold - rect.top) / rect.height))
        : 0;
      return seen + Math.round(covered * len);
    }
    seen += len;
  }
  return seen;
}

/**
 * Put a character offset back under the top of the viewport.
 *
 * Returns false when the chapter is not on screen yet, so the caller can wait
 * for a paint and try again rather than silently leaving the reader at the top.
 */
export function scrollToOffset(
  prose: HTMLElement,
  scroller: HTMLElement,
  offset: number,
  /** Breathing room above the line, so it is not flush against the edge. */
  padding = 24,
): boolean {
  const nodes = textNodes(prose);
  if (nodes.length === 0) return false;

  const { index, within } = locateOffset(nodes.map((n) => n.data.length), offset);
  const node = nodes[index];
  if (!node) return false;

  const range = document.createRange();
  try {
    range.setStart(node, Math.min(within, node.data.length));
    range.setEnd(node, Math.min(within + 1, node.data.length));
  } catch {
    return false;
  }

  const rect = range.getBoundingClientRect();
  // A collapsed rect means the node is not laid out yet.
  if (rect.top === 0 && rect.bottom === 0) return false;

  const delta = rect.top - scroller.getBoundingClientRect().top;
  scroller.scrollTop = scroller.scrollTop + delta - padding;

  // Did it actually arrive?
  //
  // Setting scrollTop past the current scrollHeight silently clamps, and on
  // the frame a new chapter is committed the container has the markup but not
  // yet its final height — so the scroll lands at the top and the caller is
  // told it succeeded. Reporting that honestly is what lets the caller retry
  // on a later frame instead of leaving the reader on page one.
  const landed = range.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  return Math.abs(landed - padding) <= LANDING_TOLERANCE_PX;
}

/** How far from the intended line still counts as having arrived. One line of
 *  large type, so a rounding difference is not treated as a failure. */
const LANDING_TOLERANCE_PX = 40;
