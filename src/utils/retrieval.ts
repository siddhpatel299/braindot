// Lightweight lexical retrieval over the vault for "chat with your vault".
// Runs entirely client-side and instantly (no model download), which keeps
// the chat snappy; the top-K notes are sent to the AI as grounding context.

import { Note } from '@/types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'about', 'from',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'it',
  'its', 'my', 'your', 'our', 'their', 'his', 'her', 'do', 'does', 'did',
  'how', 'why', 'when', 'where', 'can', 'could', 'should', 'would', 'will',
  'i', 'you', 'we', 'they', 'he', 'she', 'me', 'us', 'them', 'not', 'no',
  'have', 'has', 'had', 'as', 'if', 'so', 'than', 'then', 'there', 'here',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export interface RetrievedNote {
  note: Note;
  score: number;
}

/**
 * Rank vault notes by lexical relevance to a query.
 * Title matches weigh most, then tags, subtitle, and body frequency.
 * Falls back to the most recently edited notes when nothing matches.
 */
export function retrieveRelevantNotes(query: string, notes: Note[], k = 6): RetrievedNote[] {
  const terms = Array.from(new Set(tokenize(query)));
  const queryLower = query.toLowerCase();

  const scored: RetrievedNote[] = notes.map((note) => {
    let score = 0;
    const titleLower = note.title.toLowerCase();
    const titleTokens = new Set(tokenize(note.title));
    const subtitleTokens = new Set(tokenize(note.subtitle || ''));
    const tagSet = new Set(note.tags.map((t) => t.toLowerCase()));
    const bodyLower = note.body.toLowerCase();

    // Whole-title phrase mention in the query is a very strong signal
    if (titleLower.length > 3 && queryLower.includes(titleLower)) score += 12;

    for (const term of terms) {
      if (titleTokens.has(term)) score += 4;
      if (tagSet.has(term)) score += 3;
      if (subtitleTokens.has(term)) score += 2;
      // Capped body term frequency so one giant note doesn't dominate
      let idx = 0;
      let count = 0;
      while (count < 5 && (idx = bodyLower.indexOf(term, idx)) !== -1) {
        count++;
        idx += term.length;
      }
      score += count * 0.6;
    }

    // Well-connected notes are slightly more likely to be relevant hubs
    score += Math.min(note.backlinks.length, 4) * 0.15;
    return { note, score };
  });

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  if (matched.length > 0) return matched;

  // No lexical overlap — hand the AI the freshest thinking instead
  return [...notes]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, Math.min(k, 4))
    .map((note) => ({ note, score: 0 }));
}

/** Shape retrieved notes into the (truncated) context payload for the API. */
export function toContextNotes(retrieved: RetrievedNote[], maxBodyChars = 1600) {
  return retrieved.map(({ note }) => ({
    title: note.title,
    subtitle: note.subtitle || undefined,
    tags: note.tags.length ? note.tags : undefined,
    body:
      note.body.length > maxBodyChars
        ? note.body.slice(0, maxBodyChars) + '\n[…truncated]'
        : note.body,
  }));
}
