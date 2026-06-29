// Second Brain — Markdown parsing & rendering utilities
// We render markdown into a styled HTML overlay that visually highlights
// wiki-links, callouts, headings, bold, italic, bullets — while a transparent
// textarea sits on top so the user edits the raw markdown directly.

import { Note } from '@/types';

/** Extract all [[wiki-link]] target titles from a markdown body. */
export function extractWikiLinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

/** Compute backlinks: for each note, find every other note whose body
 *  contains [[<this-note-title>]]. Returns map of noteId → array of backlinking note IDs. */
export function computeBacklinks(notes: Note[]): Record<string, string[]> {
  const titleToId = new Map<string, string>();
  for (const n of notes) {
    titleToId.set(n.title.toLowerCase(), n.id);
    titleToId.set(n.filename.toLowerCase().replace(/\.md$/, ''), n.id);
  }
  const result: Record<string, string[]> = {};
  for (const n of notes) result[n.id] = [];

  for (const n of notes) {
    const links = extractWikiLinks(n.body);
    const seen = new Set<string>();
    for (const link of links) {
      const targetId = titleToId.get(link.toLowerCase());
      if (targetId && targetId !== n.id && !seen.has(targetId)) {
        seen.add(targetId);
        // n references targetId, so targetId has a backlink from n
        if (!result[targetId].includes(n.id)) {
          result[targetId].push(n.id);
        }
      }
    }
  }
  return result;
}

/** Count words in a markdown body (ignoring markup noise). */
export function countWords(body: string): number {
  // Strip wiki-link brackets and markdown punctuation for cleaner count
  const cleaned = body
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/** Escape HTML special characters. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render markdown body to a styled HTML string for the editor overlay.
 * The geometry (line breaks, whitespace) MUST match the textarea exactly,
 * so we preserve newlines and use white-space: pre-wrap.
 *
 * Tokens styled:
 *  - ## Heading  → .sb-tok-h (with horizontal rule via ::after)
 *  - **bold**    → .sb-tok-bold
 *  - _italic_ or *italic*  → .sb-tok-italic
 *  - [[wiki-link]] → .sb-tok-wiki (data attribute so we can click)
 *  - > [!callout]  blocks → .sb-tok-callout with .sb-tok-callout-label
 *  - - bullet     → bullet char in .sb-tok-bullet
 */
export function renderMarkdownOverlay(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];

  let i = 0;
  let inCallout = false;
  let calloutBuffer: string[] = [];
  let calloutType = 'callout';

  const flushCallout = () => {
    if (!inCallout) return;
    const labelHtml = `<span class="sb-tok-callout-label">${escapeHtml(calloutType)}</span>`;
    const bodyHtml = calloutBuffer
      .map((line) => renderInline(line))
      .join('<br/>');
    out.push(`<span class="sb-tok-callout">${labelHtml}${bodyHtml}</span>`);
    inCallout = false;
    calloutBuffer = [];
    calloutType = 'callout';
  };

  const renderInline = (line: string): string => {
    let s = escapeHtml(line);
    // wiki-links  [[Title]]
    s = s.replace(
      /\[\[([^\]]+)\]\]/g,
      (_m, p1) => `<span class="sb-tok-wiki" data-wiki="${escapeHtml(p1)}">[[${escapeHtml(p1)}]]</span>`,
    );
    // bold  **text**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<span class="sb-tok-bold">**$1**</span>');
    // italic _text_ or *text*  (single underscores or single asterisks, not double)
    s = s.replace(/(^|[^*_])\*([^*\n]+)\*(?!\*)/g, '$1<span class="sb-tok-italic">*$2*</span>');
    s = s.replace(/(^|[^*_])_([^_\n]+)_(?!_)/g, '$1<span class="sb-tok-italic">_$2_</span>');
    // bullets: lines starting with "- " → render dash in muted color
    s = s.replace(/^(\s*)(-) /, '$1<span class="sb-tok-bullet">$2</span> ');
    return s;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Callout block: starts with > [!type], continues with > lines
    const calloutStart = line.match(/^>\s*\[!([^\]]+)\]/);
    if (calloutStart) {
      flushCallout();
      inCallout = true;
      calloutType = calloutStart[1].toLowerCase();
      // Capture rest of the first line after the [!type] marker
      const rest = line.replace(/^>\s*\[![^\]]+\]\s*/, '');
      if (rest.trim()) calloutBuffer.push(rest);
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        const cl = lines[i].replace(/^>\s?/, '');
        calloutBuffer.push(cl);
        i++;
      }
      flushCallout();
      continue;
    }

    // Heading  ## Title  (also # and ###)
    const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (hMatch) {
      out.push(`<span class="sb-tok-h">${escapeHtml(line)}</span>`);
      i++;
      continue;
    }

    // Empty line — preserve as-is so geometry matches
    if (line === '') {
      out.push('');
      i++;
      continue;
    }

    out.push(renderInline(line));
    i++;
  }

  flushCallout();
  // Join with \n so the <pre> wraps with correct line breaks
  return out.join('\n');
}

/** Format a relative time like "2 min ago", "1h ago", "3d ago". */
export function relativeTime(iso: string | number): string {
  const then = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  return `${mo}mo ago`;
}

/** Format a date like "Jun 29, 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Get today's date as YYYY-MM-DD in the user's timezone. */
export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Given a note body, find notes whose titles appear as words in the body
 *  but are not currently linked with [[...]]. Used for the "missing link" suggestion. */
export function findMissingLinks(note: Note, allNotes: Note[]): Note[] {
  const linkedTitles = new Set(extractWikiLinks(note.body).map((s) => s.toLowerCase()));
  const bodyLower = note.body.toLowerCase();
  const missing: Note[] = [];
  for (const other of allNotes) {
    if (other.id === note.id) continue;
    if (linkedTitles.has(other.title.toLowerCase())) continue;
    // Look for the title as a whole word (case-insensitive)
    const titleEscaped = other.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${titleEscaped}\\b`, 'i');
    if (re.test(bodyLower)) {
      missing.push(other);
    }
  }
  return missing;
}

/** Generate AI suggestion cards for a note. Purely deterministic for v1. */
export function generateSuggestions(note: Note, allNotes: Note[]): {
  type: 'missing link' | 'synthesis ready' | 'review due' | 'open question';
  description: string;
  action: string;
}[] {
  const cards: {
    type: 'missing link' | 'synthesis ready' | 'review due' | 'open question';
    description: string;
    action: string;
  }[] = [];

  // 1. missing link
  const missing = findMissingLinks(note, allNotes).slice(0, 1);
  if (missing.length > 0) {
    cards.push({
      type: 'missing link',
      description: `"${missing[0].title}" appears in body but isn't linked.`,
      action: 'insert link ↗',
    });
  } else {
    cards.push({
      type: 'missing link',
      description: 'Well connected. No unlinked mentions detected.',
      action: 'view graph ↗',
    });
  }

  // 2. synthesis ready
  const sameTags = allNotes.filter(
    (n) => n.id !== note.id && n.tags.some((t) => note.tags.includes(t)),
  );
  cards.push({
    type: 'synthesis ready',
    description: `${sameTags.length + 1} notes share tags. Merge their core claims?`,
    action: 'draft synthesis ↗',
  });

  // 3. review due
  const daysSinceUpdate = (Date.now() - new Date(note.updatedAt).getTime()) / 86400000;
  const dueLabel = daysSinceUpdate > 14 ? 'overdue' : daysSinceUpdate > 7 ? 'due soon' : 'on schedule';
  cards.push({
    type: 'review due',
    description: `Last edited ${Math.floor(daysSinceUpdate)}d ago. Spaced repetition: ${dueLabel}.`,
    action: 'schedule review ↗',
  });

  // 4. open question
  const questionBank: Record<string, string> = {
    strategy: 'What decision would this change if acted on today?',
    learning: 'How would you teach this in two sentences?',
    reading: 'What claim from the source do you most want to challenge?',
    research: 'What observation would falsify this?',
  };
  const q = note.tags.map((t) => questionBank[t]).filter(Boolean)[0] || 'What is the strongest counter-argument?';
  cards.push({
    type: 'open question',
    description: q,
    action: 'answer in new note ↗',
  });

  return cards;
}
