/**
 * Checks for the SVG contract validator.
 *
 * Run with:  npm run check:svg
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * Each case is a diagram that breaks exactly one rule, so a failure names the
 * rule that regressed rather than "something is wrong".
 */

import { validateSvg, textWidth, scanSvg } from './svgContract.ts';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

/** Asserts the given rule fires (and, for the clean case, that none do). */
function expectRule(name: string, svg: string, rule: string) {
  const r = validateSvg(svg);
  const hit = r.findings.some((f) => f.rule === rule && f.severity === 'error');
  check(name, hit, hit ? '' : `expected an error from "${rule}", got: ${r.findings.map((f) => f.rule).join(', ') || 'nothing'}`);
}

const ARROW = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>';

/* ============================================================
   1. A diagram that obeys the contract
   ============================================================
   Two tiers, one connector, sized by the character table:
   "Ingest" is 6 chars × 8 = 48, +24 = 72 → a 140px box is ample. */
const CLEAN = `<svg width="100%" viewBox="0 0 680 208" role="img"><title>Ingest to store</title><desc>Two stages joined by one arrow.</desc>${ARROW}
<g class="c-blue"><rect x="120" y="40" width="180" height="44" rx="4" stroke-width="0.5"/></g>
<text class="th" x="210" y="62" text-anchor="middle" dominant-baseline="central">Ingest</text>
<g class="c-blue"><rect x="380" y="40" width="180" height="44" rx="4" stroke-width="0.5"/></g>
<text class="th" x="470" y="62" text-anchor="middle" dominant-baseline="central">Store</text>
<line class="arr" x1="300" y1="62" x2="370" y2="62" marker-end="url(#arrow)"/>
<text class="ts" x="340" y="184" text-anchor="middle">One pass</text>
</svg>`;

const clean = validateSvg(CLEAN);
check('clean diagram has no errors', clean.errors === 0,
  clean.findings.filter((f) => f.severity === 'error').map((f) => `${f.rule}: ${f.message}`).join(' | '));
check('clean diagram reports ok', clean.ok === true);
check('clean diagram height agrees', clean.expectedHeight === 208, `got ${clean.expectedHeight}`);

/* ============================================================
   2. One case per rule
   ============================================================ */

// The width is load-bearing; 800 would rescale every label.
expectRule('viewBox width must be 680',
  CLEAN.replace('viewBox="0 0 680 208"', 'viewBox="0 0 800 208"'), 'canvas');

// Unstyled text inherits the wrong font — the tell for forgotten styling.
expectRule('every text needs a size class',
  CLEAN.replace('<text class="th" x="210"', '<text x="210"'), 'text-class');

expectRule('a text may not carry two size classes',
  CLEAN.replace('class="th" x="210"', 'class="th ts" x="210"'), 'text-class');

// A path with no fill renders as a solid black blob.
expectRule('connector paths need fill="none"',
  CLEAN.replace('<line class="arr" x1="300" y1="62" x2="370" y2="62" marker-end="url(#arrow)"/>',
    '<path class="arr" d="M 300 62 L 370 62" marker-end="url(#arrow)"/>'), 'path-fill');

// Hardcoded hex is invisible in dark mode.
expectRule('hex fill on a rect is rejected',
  CLEAN.replace('<rect x="120" y="40" width="180" height="44" rx="4" stroke-width="0.5"/>',
    '<rect x="120" y="40" width="180" height="44" rx="4" fill="#4f8cff" stroke-width="0.5"/>'), 'colour');

expectRule('a palette class may not sit on a path',
  CLEAN.replace('<line class="arr"', '<path class="c-blue" fill="none" d="M 300 62 L 370 62"/><line class="arr"'), 'palette');

expectRule('no style block',
  CLEAN.replace('<title>', '<style>.t{fill:red}</style><title>'), 'style');

// Content clipped off the bottom is the failure a guessed H produces.
expectRule('height must equal the bottom-most element plus 20',
  CLEAN.replace('viewBox="0 0 680 208"', 'viewBox="0 0 680 120"'), 'height');

// Boxes that overlap are the classic four-in-a-row failure.
expectRule('overlapping boxes are caught',
  CLEAN.replace('<rect x="380" y="40" width="180" height="44" rx="4" stroke-width="0.5"/>',
    '<rect x="200" y="40" width="180" height="44" rx="4" stroke-width="0.5"/>'), 'overlap');

// Outside the safe area.
expectRule('a box outside the safe area is caught',
  CLEAN.replace('<rect x="380" y="40"', '<rect x="560" y="40"'), 'bounds');

// A label wider than its box.
expectRule('a label too wide for its box is caught',
  CLEAN.replace('>Ingest<', '>Files, APIs, streams and everything else<'), 'text-fit');

// A line slashing through an unrelated box.
const CROSSER = `<svg width="100%" viewBox="0 0 680 240" role="img"><title>t</title><desc>d</desc>${ARROW}
<g class="c-gray"><rect x="60" y="40" width="120" height="44" rx="4"/></g>
<g class="c-gray"><rect x="260" y="40" width="120" height="44" rx="4"/></g>
<g class="c-gray"><rect x="460" y="40" width="120" height="44" rx="4"/></g>
<line class="arr" x1="120" y1="62" x2="520" y2="62" marker-end="url(#arrow)"/>
</svg>`;
expectRule('a connector through an unrelated box is caught', CROSSER, 'crossing');

// Emoji and decoration.
expectRule('emoji in text is caught', CLEAN.replace('>Ingest<', '>Ingest 🚀<'), 'text-emoji');
expectRule('a gradient is caught',
  CLEAN.replace('</defs>', '<linearGradient id="g"/></defs>'), 'decoration');
expectRule('defs may hold only the arrow marker',
  CLEAN.replace('</defs>', '<linearGradient id="g"/></defs>'), 'defs');

/* ============================================================
   3. Wrapped subtitles — the tspan case
   ============================================================
   SVG text does not wrap, so a wrapped subtitle is a <text> broken by
   tspans. The box must hold the longest line; measuring the concatenation
   would reject every legitimate wrap, and measuring only the tail would let
   an overlong first line through. Both directions are checked. */

const WRAPPED = (first: string) => `<svg width="100%" viewBox="0 0 680 116" role="img"><title>t</title><desc>d</desc>
<g class="c-blue"><rect x="260" y="40" width="160" height="56" rx="4" stroke-width="0.5"/></g>
<text class="ts" x="340" y="64" text-anchor="middle" dominant-baseline="central">${first}<tspan x="340" dy="1.2em">from four sources</tspan></text>
</svg>`;

const okWrap = validateSvg(WRAPPED('Batch and stream'));
check('a legitimately wrapped subtitle is not flagged', okWrap.errors === 0,
  okWrap.findings.filter((f) => f.severity === 'error').map((f) => f.message).join(' | '));

expectRule('an overlong line before a tspan is still caught',
  WRAPPED('Files, APIs, streams and everything else'), 'text-fit');

// The run before a tspan must survive scanning, or the label measures short.
const wrapNodes = scanSvg(WRAPPED('Batch and stream')).nodes;
const parentText = wrapNodes.find((n) => n.tag === 'text');
check('text before a tspan is kept, not dropped', parentText?.text === 'Batch and stream',
  `got "${parentText?.text}"`);

/* ============================================================
   4. The pieces underneath
   ============================================================ */

check('char table: 14px medium', textWidth(10, 'th') === 80, `got ${textWidth(10, 'th')}`);
check('char table: 14px regular', textWidth(10, 't') === 75, `got ${textWidth(10, 't')}`);
check('char table: 12px', textWidth(10, 'ts') === 70, `got ${textWidth(10, 'ts')}`);

// The contract's own worked example: "Files, APIs, streams" is 20 chars and
// needs 164px as a title.
check('the contract’s worked example holds', Math.round(textWidth(20, 'th') + 4) === 164,
  `20 chars at 8px + padding = ${textWidth(20, 'th')}`);

// translate() on a group must move its children, or every bound is wrong.
const TRANSLATED = `<svg width="100%" viewBox="0 0 680 200" role="img"><title>t</title><desc>d</desc>
<g transform="translate(100, 40)"><rect x="0" y="0" width="100" height="44" rx="4"/></g></svg>`;
const scanned = scanSvg(TRANSLATED);
const rectNode = scanned.nodes.find((n) => n.tag === 'rect');
check('translate on a group is applied to children', rectNode?.dx === 100 && rectNode?.dy === 40,
  `got dx=${rectNode?.dx} dy=${rectNode?.dy}`);

// Unbalanced tags must be reported, not thrown.
const BROKEN = '<svg width="100%" viewBox="0 0 680 100" role="img"><title>t</title><desc>d</desc><g><rect x="60" y="10" width="80" height="44"/></svg>';
const brokenReport = validateSvg(BROKEN);
check('unbalanced tags are reported, not thrown', brokenReport.findings.some((f) => f.rule === 'parse'));

// No <svg> at all — the model returned prose.
const prose = validateSvg('Here is your diagram!');
check('prose instead of an SVG is reported', !prose.ok && prose.findings[0].rule === 'parse');

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nSVG contract checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`SVG contract checks: all ${passed} passed.`);
