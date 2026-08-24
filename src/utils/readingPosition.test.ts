/**
 * Checks for the reading-position arithmetic.
 *
 * Run with:  npm run check:position
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * The DOM half cannot be exercised here; this covers the mapping every resume
 * depends on — which text node holds character N, and which of two devices'
 * positions is the one to keep.
 */

import {
  locateOffset, cumulativeOffsets, isWorthRestoring, newerPosition,
} from './readingPosition.ts';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

/* ============================================================
   Finding the node that holds a character
   ============================================================ */

const NODES = [10, 5, 20]; // 0–9 | 10–14 | 15–34

eq('offset 0 is the first node', locateOffset(NODES, 0), { index: 0, within: 0 });
eq('offset 7 is inside the first', locateOffset(NODES, 7), { index: 0, within: 7 });
// A boundary belongs to the start of the next node, which is what "I stopped
// here" means to a reader.
eq('offset 10 starts the second', locateOffset(NODES, 10), { index: 1, within: 0 });
eq('offset 14 ends the second', locateOffset(NODES, 14), { index: 1, within: 4 });
eq('offset 15 starts the third', locateOffset(NODES, 15), { index: 2, within: 0 });
eq('offset 34 is the last character', locateOffset(NODES, 34), { index: 2, within: 19 });

// Past the end: a chapter that got shorter, or an offset from another edition.
// Sitting at the end beats refusing to restore.
eq('past the end clamps to the last node', locateOffset(NODES, 999), { index: 2, within: 20 });
eq('a negative offset clamps to the start', locateOffset(NODES, -5), { index: 0, within: 0 });
eq('no nodes at all is survivable', locateOffset([], 12), { index: 0, within: 0 });

// Empty text nodes sit between real ones in rendered markup and must not
// swallow an offset that belongs after them.
eq('an empty leading node is skipped', locateOffset([0, 4], 0), { index: 1, within: 0 });
eq('empty nodes in the middle are skipped', locateOffset([3, 0, 0, 4], 3), { index: 3, within: 0 });

/* ============================================================
   Running totals
   ============================================================ */

eq('cumulative offsets', cumulativeOffsets([10, 5, 20]), [0, 10, 15]);
eq('cumulative offsets of nothing', cumulativeOffsets([]), []);

/* ============================================================
   Is a position worth acting on
   ============================================================ */

const at = (chapter: number, charOffset: number, updatedAt = '2026-01-01T00:00:00.000Z') =>
  ({ chapter, charOffset, updatedAt });

check('the very start of a book is not worth restoring', !isWorthRestoring(at(0, 0)));
check('an offset into chapter one is', isWorthRestoring(at(0, 500)));
check('a later chapter is, even at its start', isWorthRestoring(at(3, 0)));
check('no position at all is not', !isWorthRestoring(null));
check('undefined is not', !isWorthRestoring(undefined));

/* ============================================================
   Two devices, one book

   Both write as you read and the sync layer resolves per document by last
   writer. Comparing timestamps means the surviving position is the one from
   wherever you were actually reading, not whichever push landed second.
   ============================================================ */

const older = at(1, 100, '2026-03-01T10:00:00.000Z');
const newer = at(4, 900, '2026-03-01T18:30:00.000Z');

eq('the later timestamp wins', newerPosition(older, newer), newer);
eq('order of arguments does not matter', newerPosition(newer, older), newer);
eq('a missing local position yields the remote', newerPosition(null, newer), newer);
eq('a missing remote position keeps the local', newerPosition(older, null), older);
eq('two missing positions yield nothing', newerPosition(null, undefined), null);

// Same instant, both directions: must be stable rather than flip-flopping.
const twinA = at(1, 10, '2026-03-01T12:00:00.000Z');
const twinB = at(9, 99, '2026-03-01T12:00:00.000Z');
eq('an exact tie keeps the first', newerPosition(twinA, twinB), twinA);

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nReading position checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Reading position checks: all ${passed} passed.`);
