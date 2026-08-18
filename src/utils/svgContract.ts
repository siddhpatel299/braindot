/**
 * The SVG generation contract, checked deterministically.
 *
 * Every rule in the contract exists because breaking it produces a specific,
 * repeatable rendering failure. Asking a model whether it followed its own
 * rules costs a round trip and answers unreliably; the same questions are
 * arithmetic, so this answers them by parsing the output and measuring it.
 *
 * The caller decides what to do with the result — regenerate, repair, or ship.
 * Nothing here calls a model or mutates the SVG.
 *
 * Dependency-free on purpose: it runs in a route handler, in a script, and in
 * the browser without a DOM.
 */

/* ============================================================
   The contract's constants
   ============================================================ */

export const CANVAS_WIDTH = 680;
export const SAFE_LEFT = 40;
export const SAFE_RIGHT = 640;
/** Bottom-most element plus this equals the viewBox height. */
export const BOTTOM_PADDING = 20;
/** Widest a row of boxes may be: SAFE_RIGHT − SAFE_LEFT − a 10px slack. */
export const MAX_ROW_WIDTH = 590;

export const PALETTE = [
  'c-gray', 'c-blue', 'c-teal', 'c-purple', 'c-coral', 'c-pink', 'c-green', 'c-amber', 'c-red',
] as const;

/** Text classes and the per-character width the contract sizes boxes by. */
export const TEXT_CLASSES: Record<string, { px: number; charWidth: number }> = {
  t: { px: 14, charWidth: 7.5 },
  ts: { px: 12, charWidth: 7 },
  th: { px: 14, charWidth: 8 },
};

/** Elements a palette class may sit on. Never <path>. */
const COLOURABLE = new Set(['g', 'rect', 'circle', 'ellipse']);

/** Descent below the baseline, for the height calculation. */
const DESCENT = 4;

export type Severity = 'error' | 'warning';

export interface SvgFinding {
  rule: string;
  severity: Severity;
  message: string;
}

export interface SvgReport {
  ok: boolean;
  errors: number;
  warnings: number;
  findings: SvgFinding[];
  /** What the viewBox height should be, so a caller can repair rather than retry. */
  expectedHeight: number | null;
}

/* ============================================================
   A minimal element scanner
   ============================================================

   Not a general XML parser: it reads the subset the contract permits —
   well-formed tags, double-quoted attributes, no CDATA, no comments carrying
   tag-like text. That is enough to measure a diagram, and it keeps this file
   free of a parser dependency. Malformed input surfaces as a parse finding
   rather than a throw. */

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  /** Text content, for <text>, <tspan>, <title>, <desc>. */
  text: string;
  /** Accumulated translate() from ancestors. */
  dx: number;
  dy: number;
  /** Tag names from the root down, excluding this node. */
  ancestors: string[];
  /** Classes on this node and every ancestor. */
  inheritedClasses: string[];
  /** Index into the node list of the enclosing element, or -1 at the root. */
  parentIndex: number;
}

const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const ATTR_RE = /([\w:-]+)\s*=\s*"([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw)) !== null) out[m[1]] = m[2];
  return out;
}

/** translate(x, y) — the only transform the contract allows to move things. */
function translateOf(attrs: Record<string, string>): { x: number; y: number } {
  const t = attrs.transform;
  if (!t) return { x: 0, y: 0 };
  const m = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)?\s*\)/.exec(t);
  if (!m) return { x: 0, y: 0 };
  return { x: Number(m[1]) || 0, y: Number(m[2] ?? 0) || 0 };
}

export function scanSvg(svg: string): { nodes: SvgNode[]; malformed: boolean } {
  const nodes: SvgNode[] = [];
  const stack: { tag: string; dx: number; dy: number; classes: string[]; index: number }[] = [];
  let malformed = false;
  let m: RegExpExecArray | null;
  let lastIndex = 0;

  /* Text belongs to the innermost element open at the time, so a <text> that
     is interrupted by a <tspan> keeps the run before it. Assigning on the
     closing tag instead loses that run, and the label then measures short. */
  const absorbText = (upTo: number) => {
    const run = svg.slice(lastIndex, upTo).trim();
    if (!run) return;
    const frame = stack[stack.length - 1];
    if (!frame) return;
    const node = nodes[frame.index];
    node.text = node.text ? `${node.text} ${run}` : run;
  };

  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(svg)) !== null) {
    const [, closing, tagRaw, attrRaw, selfClose] = m;
    const tag = tagRaw.toLowerCase();
    absorbText(m.index);

    if (closing) {
      const top = stack.pop();
      if (!top || top.tag !== tag) malformed = true;
      lastIndex = TAG_RE.lastIndex;
      continue;
    }

    const attrs = parseAttrs(attrRaw);
    const parent = stack[stack.length - 1];
    const t = translateOf(attrs);
    const dx = (parent?.dx ?? 0) + t.x;
    const dy = (parent?.dy ?? 0) + t.y;
    const own = (attrs.class || '').split(/\s+/).filter(Boolean);
    const inherited = [...(parent?.classes ?? []), ...own];

    nodes.push({
      tag, attrs, text: '', dx, dy,
      ancestors: stack.map((s) => s.tag),
      inheritedClasses: inherited,
      parentIndex: parent ? parent.index : -1,
    });

    if (!selfClose) stack.push({ tag, dx, dy, classes: inherited, index: nodes.length - 1 });
    lastIndex = TAG_RE.lastIndex;
  }
  if (stack.length > 0) malformed = true;
  return { nodes, malformed };
}

/* ============================================================
   Geometry
   ============================================================ */

export interface Rect { x: number; y: number; width: number; height: number }
interface Segment { x1: number; y1: number; x2: number; y2: number }

const num = (v: string | undefined, fallback = NaN) => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The estimated rendered width of a run of text, by the contract's table. */
export function textWidth(chars: number, cls: string): number {
  return chars * (TEXT_CLASSES[cls]?.charWidth ?? 7.5);
}

function rectOf(n: SvgNode): Rect | null {
  if (n.tag !== 'rect') return null;
  const x = num(n.attrs.x), y = num(n.attrs.y);
  const width = num(n.attrs.width), height = num(n.attrs.height);
  if ([x, y, width, height].some((v) => !Number.isFinite(v))) return null;
  return { x: x + n.dx, y: y + n.dy, width, height };
}

/** Every coordinate pair in a path's `d`, in order. Enough for M/L bends and
 *  for the bounding box of a curve's control points. */
function pathPoints(d: string, dx: number, dy: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const nums = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi);
  if (!nums) return out;
  // Absolute commands only — the contract's connectors are written absolute.
  if (/[a-z]/.test(d.replace(/[eE]/g, ''))) {
    // A relative command is present; bail rather than report wrong coordinates.
    return out;
  }
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: Number(nums[i]) + dx, y: Number(nums[i + 1]) + dy });
  }
  return out;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointInRect(px: number, py: number, r: Rect): boolean {
  return px > r.x && px < r.x + r.width && py > r.y && py < r.y + r.height;
}

/** Does a segment pass through a rect's interior? Endpoints touching the edge
 *  do not count — a connector is supposed to start and end at a box. */
function segmentCrossesRect(s: Segment, r: Rect): boolean {
  if (pointInRect(s.x1, s.y1, r) || pointInRect(s.x2, s.y2, r)) return true;
  const edges: Segment[] = [
    { x1: r.x, y1: r.y, x2: r.x + r.width, y2: r.y },
    { x1: r.x + r.width, y1: r.y, x2: r.x + r.width, y2: r.y + r.height },
    { x1: r.x + r.width, y1: r.y + r.height, x2: r.x, y2: r.y + r.height },
    { x1: r.x, y1: r.y + r.height, x2: r.x, y2: r.y },
  ];
  let hits = 0;
  for (const e of edges) if (segmentsIntersect(s, e)) hits++;
  // One crossing means an endpoint sits on the boundary (a legitimate
  // connection); two means it goes in one side and out the other.
  return hits >= 2;
}

function segmentsIntersect(a: Segment, b: Segment): boolean {
  const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const d1 = d(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1);
  const d2 = d(a.x1, a.y1, a.x2, a.y2, b.x2, b.y2);
  const d3 = d(b.x1, b.y1, b.x2, b.y2, a.x1, a.y1);
  const d4 = d(b.x1, b.y1, b.x2, b.y2, a.x2, a.y2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/** The tspans belonging to a given <text>. */
function tspansOf(t: SvgNode, nodes: SvgNode[]): SvgNode[] {
  const i = nodes.indexOf(t);
  return nodes.filter((n) => n.tag === 'tspan' && n.parentIndex === i);
}

/* ============================================================
   The rules
   ============================================================ */

export function validateSvg(svg: string): SvgReport {
  const findings: SvgFinding[] = [];
  const add = (rule: string, severity: Severity, message: string) =>
    findings.push({ rule, severity, message });

  const { nodes, malformed } = scanSvg(svg);
  if (malformed) add('parse', 'error', 'Tags are unbalanced — the SVG will not render as written.');

  const root = nodes.find((n) => n.tag === 'svg');
  if (!root) {
    return { ok: false, errors: 1, warnings: 0, expectedHeight: null,
      findings: [{ rule: 'parse', severity: 'error', message: 'No <svg> element found in the output.' }] };
  }

  /* ---- canvas ---- */
  const vb = (root.attrs.viewBox || '').trim().split(/[\s,]+/).map(Number);
  let declaredHeight: number | null = null;
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v))) {
    add('canvas', 'error', `viewBox is missing or unreadable (got "${root.attrs.viewBox ?? ''}").`);
  } else {
    const [minX, minY, w, h] = vb;
    declaredHeight = h;
    if (minX !== 0 || minY !== 0) add('canvas', 'error', `viewBox must start at "0 0" — got "${minX} ${minY}".`);
    if (w !== CANVAS_WIDTH) {
      add('canvas', 'error',
        `viewBox width is ${w}; it is fixed at ${CANVAS_WIDTH} so one unit renders as one CSS pixel.`);
    }
  }
  if (root.attrs.width !== '100%') add('canvas', 'warning', 'The <svg> should carry width="100%".');
  if (root.attrs.role !== 'img') add('canvas', 'warning', 'The <svg> should carry role="img".');
  if (!nodes.some((n) => n.tag === 'title' && n.text)) add('canvas', 'error', 'Missing a non-empty <title>.');
  if (!nodes.some((n) => n.tag === 'desc' && n.text)) add('canvas', 'error', 'Missing a non-empty <desc>.');

  /* ---- no stylesheet, no stray hex ---- */
  if (nodes.some((n) => n.tag === 'style')) {
    add('style', 'error', 'A <style> block is present; the palette classes handle light and dark mode.');
  }
  for (const n of nodes) {
    for (const [k, v] of Object.entries(n.attrs)) {
      if (!/#[0-9a-fA-F]{3,8}\b/.test(v)) continue;
      const strokeOnConnector = k === 'stroke' && (n.tag === 'path' || n.tag === 'line');
      if (!strokeOnConnector) {
        add('colour', 'error',
          `Hex colour "${v}" on <${n.tag} ${k}>. Hex is only allowed on a connector stroke; everything else uses a palette class.`);
      }
    }
  }

  /* ---- palette ---- */
  for (const n of nodes) {
    const classes = (n.attrs.class || '').split(/\s+/).filter(Boolean);
    for (const c of classes) {
      const isPalette = (PALETTE as readonly string[]).includes(c);
      if (isPalette && !COLOURABLE.has(n.tag)) {
        add('palette', 'error', `Palette class "${c}" on <${n.tag}>. It belongs on g, rect, circle or ellipse.`);
      }
      if (!isPalette && !TEXT_CLASSES[c] && c !== 'arr' && c !== 'node') {
        add('palette', 'warning', `Unknown class "${c}" on <${n.tag}>; it will not be styled.`);
      }
    }
  }

  /* ---- text ---- */
  const texts = nodes.filter((n) => n.tag === 'text');
  for (const t of texts) {
    const classes = (t.attrs.class || '').split(/\s+/).filter((c) => TEXT_CLASSES[c]);
    if (classes.length === 0) {
      add('text-class', 'error', `<text> "${t.text.slice(0, 32)}" has no size class — it will inherit the wrong font.`);
    } else if (classes.length > 1) {
      add('text-class', 'error', `<text> "${t.text.slice(0, 32)}" carries ${classes.length} size classes; it must carry exactly one.`);
    }
    if (t.text && t.text === t.text.toUpperCase() && /[A-Z]{3,}/.test(t.text)) {
      add('text-case', 'warning', `"${t.text.slice(0, 32)}" is upper case; the contract asks for sentence case.`);
    }
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t.text)) {
      add('text-emoji', 'error', `Emoji in "${t.text.slice(0, 32)}".`);
    }
  }

  /* ---- geometry ---- */
  const rectNodes = nodes.map((n) => ({ n, r: rectOf(n) })).filter((x): x is { n: SvgNode; r: Rect } => x.r !== null);

  // Text inside a box: baseline and fit.
  for (const t of texts) {
    const cls = (t.attrs.class || '').split(/\s+/).find((c) => TEXT_CLASSES[c]) || 't';
    const tx = num(t.attrs.x, NaN) + t.dx;
    const ty = num(t.attrs.y, NaN) + t.dy;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
    const anchor = t.attrs['text-anchor'];
    /* SVG text does not wrap, so a <text> broken by tspans is several lines.
       The box has to hold the longest one, not the concatenation — measuring
       the join would fail every legitimately wrapped subtitle. */
    const lineLengths = [t.text.length, ...tspansOf(t, nodes).map((s2) => s2.text.length)];
    const w = textWidth(Math.max(...lineLengths), cls);
    const left = anchor === 'middle' ? tx - w / 2 : anchor === 'end' ? tx - w : tx;

    if (left < SAFE_LEFT - 0.5 || left + w > SAFE_RIGHT + 0.5) {
      add('bounds', 'error',
        `"${t.text.slice(0, 28)}" spans x=${Math.round(left)}..${Math.round(left + w)}, outside the safe area ${SAFE_LEFT}..${SAFE_RIGHT}.`);
    }

    const host = rectNodes.find(({ r }) => pointInRect(tx, ty, r));
    if (host) {
      if (w > host.r.width - 16) {
        add('text-fit', 'error',
          `"${t.text.slice(0, 28)}" needs ~${Math.round(w)}px but its box is ${host.r.width}px (needs ${Math.round(w + 24)}px by the sizing rule).`);
      }
      if (t.attrs['dominant-baseline'] !== 'central') {
        add('baseline', 'warning',
          `"${t.text.slice(0, 28)}" sits in a box without dominant-baseline="central"; it will render high.`);
      }
    }
  }

  // Nothing outside the safe area, nothing negative.
  for (const { n, r } of rectNodes) {
    if (r.x < SAFE_LEFT - 0.5 || r.x + r.width > SAFE_RIGHT + 0.5) {
      add('bounds', 'error',
        `<rect> spans x=${Math.round(r.x)}..${Math.round(r.x + r.width)}, outside ${SAFE_LEFT}..${SAFE_RIGHT}.`);
    }
    if (r.x < 0 || r.y < 0) add('bounds', 'error', `<rect> has a negative coordinate (${r.x}, ${r.y}).`);
    void n;
  }

  // Boxes must not overlap each other.
  for (let i = 0; i < rectNodes.length; i++) {
    for (let j = i + 1; j < rectNodes.length; j++) {
      const a = rectNodes[i], b = rectNodes[j];
      // A rect drawn inside another on purpose (a nested <g>) is not an overlap.
      if (a.n.ancestors.length !== b.n.ancestors.length) continue;
      if (rectsOverlap(a.r, b.r)) {
        add('overlap', 'error',
          `Two boxes overlap: ${Math.round(a.r.x)},${Math.round(a.r.y)} ${a.r.width}×${a.r.height} and ${Math.round(b.r.x)},${Math.round(b.r.y)} ${b.r.width}×${b.r.height}.`);
      }
    }
  }

  /* ---- connectors ---- */
  const segments: { seg: Segment; label: string }[] = [];
  for (const n of nodes) {
    if (n.tag === 'line') {
      const s = {
        x1: num(n.attrs.x1) + n.dx, y1: num(n.attrs.y1) + n.dy,
        x2: num(n.attrs.x2) + n.dx, y2: num(n.attrs.y2) + n.dy,
      };
      if (Object.values(s).every(Number.isFinite)) segments.push({ seg: s, label: '<line>' });
    }
    if (n.tag === 'path') {
      if (n.attrs.fill !== 'none') {
        add('path-fill', 'error',
          'A <path> has no fill="none"; SVG defaults paths to black fill and the curve renders as a solid blob.');
      }
      const pts = pathPoints(n.attrs.d || '', n.dx, n.dy);
      for (let i = 0; i + 1 < pts.length; i++) {
        segments.push({ seg: { x1: pts[i].x, y1: pts[i].y, x2: pts[i + 1].x, y2: pts[i + 1].y }, label: '<path>' });
      }
    }
  }
  for (const { seg, label } of segments) {
    for (const { r } of rectNodes) {
      if (segmentCrossesRect(seg, r)) {
        add('crossing', 'error',
          `A ${label} connector runs through the box at ${Math.round(r.x)},${Math.round(r.y)} — use an L-bend around it.`);
      }
    }
  }

  /* ---- defs ---- */
  const defsChildren = nodes.filter((n) => n.ancestors.includes('defs') && n.ancestors[n.ancestors.length - 1] === 'defs');
  for (const c of defsChildren) {
    if (c.tag !== 'marker') add('defs', 'error', `<defs> contains <${c.tag}>; only the arrow marker belongs there.`);
  }
  if (segments.length > 0 && !nodes.some((n) => n.tag === 'marker' && n.attrs.id === 'arrow')) {
    add('defs', 'warning', 'Connectors are present but the #arrow marker is not defined.');
  }

  /* ---- forbidden decoration ---- */
  for (const n of nodes) {
    if (/gradient|filter|feGaussianBlur|feDropShadow/i.test(n.tag)) {
      add('decoration', 'error', `<${n.tag}> is not allowed — no gradients, shadows, blur or glow.`);
    }
    if (n.attrs.transform && /rotate\(/.test(n.attrs.transform) && n.tag === 'text') {
      add('decoration', 'error', 'Rotated text is not allowed.');
    }
  }

  /* ---- height, computed the way the contract computes it ---- */
  let bottom = -Infinity;
  for (const { r } of rectNodes) bottom = Math.max(bottom, r.y + r.height);
  for (const t of texts) {
    const ty = num(t.attrs.y, NaN) + t.dy;
    if (Number.isFinite(ty)) bottom = Math.max(bottom, ty + DESCENT);
  }
  for (const n of nodes) {
    if (n.tag === 'circle') {
      const cy = num(n.attrs.cy) + n.dy, r = num(n.attrs.r);
      if (Number.isFinite(cy) && Number.isFinite(r)) bottom = Math.max(bottom, cy + r);
    }
    if (n.tag === 'ellipse') {
      const cy = num(n.attrs.cy) + n.dy, ry = num(n.attrs.ry);
      if (Number.isFinite(cy) && Number.isFinite(ry)) bottom = Math.max(bottom, cy + ry);
    }
    if (n.tag === 'line') {
      const y1 = num(n.attrs.y1) + n.dy, y2 = num(n.attrs.y2) + n.dy;
      if (Number.isFinite(y1)) bottom = Math.max(bottom, y1);
      if (Number.isFinite(y2)) bottom = Math.max(bottom, y2);
    }
    if (n.tag === 'path') for (const p of pathPoints(n.attrs.d || '', n.dx, n.dy)) bottom = Math.max(bottom, p.y);
  }
  const expectedHeight = Number.isFinite(bottom) ? Math.round(bottom + BOTTOM_PADDING) : null;
  if (declaredHeight !== null && expectedHeight !== null && declaredHeight !== expectedHeight) {
    const verb = declaredHeight < expectedHeight ? 'clips the bottom' : 'leaves dead space';
    add('height', declaredHeight < expectedHeight ? 'error' : 'warning',
      `viewBox height is ${declaredHeight} but the content bottoms out at ${Math.round(bottom)}, so it should be ${expectedHeight} — ${verb}.`);
  }

  const errors = findings.filter((f) => f.severity === 'error').length;
  return { ok: errors === 0, errors, warnings: findings.length - errors, findings, expectedHeight };
}

/** A short report for a log line or a retry decision. */
export function formatReport(report: SvgReport): string {
  if (report.findings.length === 0) return 'SVG contract: clean.';
  return [
    `SVG contract: ${report.errors} error(s), ${report.warnings} warning(s).`,
    ...report.findings.map((f) => `  [${f.severity}] ${f.rule}: ${f.message}`),
  ].join('\n');
}
