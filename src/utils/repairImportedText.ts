// Braindot — repairing books imported by the old extractor.
//
// Until recently the epub importer replaced every HTML tag with a newline and
// then emitted each resulting line as its own paragraph, promoting any short
// fragment to a `##` heading along the way. Fixing the importer only helps the
// next import; the books already in a library carry the damage in their stored
// text, and the original file is not kept, so there is nothing to re-extract
// from.
//
// This puts them back together. It runs on read, leaves correctly-imported
// text untouched, and never writes — so it cannot make anything worse.

/** Lines that are structure rather than prose, and must stay on their own. */
const STRUCTURAL = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\||---\s*$)/;

const ENDS_SENTENCE = /[.!?…:;]["'”’)\]]?\s*$/;

function median(ns: number[]): number {
  if (ns.length === 0) return 0;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Does this text look like it came out of the old importer?
 *
 * Two signals together, because either alone has false positives: the blocks
 * are short (they are wrapped source lines, not paragraphs), and most of them
 * stop mid-sentence — real paragraphs almost always end on punctuation.
 */
export function looksHardWrapped(content: string): boolean {
  const blocks = content.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const prose = blocks.filter((b) => !STRUCTURAL.test(b));
  if (prose.length < 8) return false;

  const lengths = prose.map((b) => b.length);
  if (median(lengths) > 110) return false;

  const finished = prose.filter((b) => ENDS_SENTENCE.test(b)).length;
  return finished / prose.length < 0.6;
}

/**
 * Rejoin hard-wrapped lines into paragraphs.
 *
 * Where a paragraph ended is not recorded anywhere, so it is inferred the way
 * every text-reflow tool infers it: a wrapped paragraph's lines all run close
 * to the wrap width, and the one line that falls well short of it is its last.
 */
function unwrap(blocks: string[]): string[] {
  const prose = blocks.filter((b) => !STRUCTURAL.test(b));
  const widths = prose.map((b) => b.length).sort((a, b) => a - b);
  // The wrap width, taken from the upper quartile rather than the maximum: a
  // few long lines (a merged fragment, a stray unwrapped line) must not drag
  // it up, or every ordinary line starts counting as "short" and nothing joins.
  const wrapWidth = widths.length ? widths[Math.floor(widths.length * 0.75)] : 80;
  const shortLine = wrapWidth * 0.72;

  const out: string[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer.trim()) out.push(buffer.trim());
    buffer = '';
  };

  for (const block of blocks) {
    if (STRUCTURAL.test(block)) {
      flush();
      out.push(block);
      continue;
    }
    buffer = buffer ? `${buffer} ${block}` : block;
    // A line that stops well short of the wrap width ended its paragraph.
    if (block.length < shortLine) flush();
  }
  flush();
  return out;
}

/**
 * Un-mark headings the old importer invented, without joining anything yet.
 *
 * It promoted any line under 60 characters that did not end in a full stop,
 * which caught the tail of a great many ordinary sentences. A heading that
 * continues the sentence above it — because that sentence never finished — was
 * never a heading.
 *
 * The marker comes off but the block stays where it is. Folding it into the
 * previous line here would destroy the thing the rejoining step reads: a
 * paragraph's last line is the short one, and these fragments *are* those
 * short last lines.
 */
function unmarkFalseHeadings(blocks: string[]): string[] {
  return blocks.map((block, i) => {
    const heading = block.match(/^#{1,6}\s+([\s\S]+)$/);
    if (!heading) return block;
    const prev = blocks[i - 1];
    const prevIsProse = prev !== undefined && !STRUCTURAL.test(prev);
    return prevIsProse && !ENDS_SENTENCE.test(prev) ? heading[1].trim() : block;
  });
}

/** Collapse a heading repeated back to back — the old double-title bug. */
function dedupeHeadings(blocks: string[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    const isHeading = /^#{1,6}\s/.test(block);
    if (isHeading && prev !== undefined) {
      const a = block.replace(/^#{1,6}\s+/, '').trim().toLowerCase();
      const b = prev.replace(/^#{1,6}\s+/, '').trim().toLowerCase();
      if (a === b) continue;
    }
    out.push(block);
  }
  return out;
}

/**
 * Put an imported book back together, or return it untouched if it is fine.
 */
export function repairImportedText(content: string): string {
  if (!content || !looksHardWrapped(content)) return content;
  const blocks = content.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return dedupeHeadings(unwrap(unmarkFalseHeadings(blocks))).join('\n\n');
}
