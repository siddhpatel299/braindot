// Helpers to robustly detect and repair Mermaid diagrams from LLM output.
// Models frequently fence a diagram with its type as the language
// (```gantt, ```timeline, ```flowchart) instead of ```mermaid, and sometimes
// omit the leading type keyword. We accept both and normalize.

// Mermaid diagram type keywords (the first token of a valid diagram).
export const MERMAID_TYPES = [
  'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'stateDiagram-v2',
  'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'mindmap', 'timeline',
  'quadrantChart', 'requirementDiagram', 'gitGraph', 'C4Context', 'sankey-beta',
  'xychart-beta', 'block-beta',
];

// Fence languages we should treat as a Mermaid diagram.
export function isMermaidLang(lang: string | undefined): boolean {
  if (!lang) return false;
  const l = lang.trim().toLowerCase();
  if (l === 'mermaid') return true;
  return MERMAID_TYPES.some((t) => t.toLowerCase() === l);
}

function startsWithType(src: string): boolean {
  const head = src.trimStart();
  return MERMAID_TYPES.some((t) => {
    const re = new RegExp('^' + t.replace(/[-]/g, '\\-') + '\\b', 'i');
    return re.test(head);
  });
}

/**
 * Return a Mermaid-parseable source given the fence language and raw code.
 * If the code lacks a leading diagram-type keyword but the fence language is
 * a known type (e.g. ```gantt), prepend that keyword.
 */
export function normalizeMermaidSource(lang: string | undefined, code: string): string {
  const src = code.trim();
  if (startsWithType(src)) return src;
  const l = (lang || '').trim().toLowerCase();
  const keyword = MERMAID_TYPES.find((t) => t.toLowerCase() === l);
  if (keyword) return `${keyword}\n${src}`;
  return src;
}
