'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Note } from '@/types';
import {
  getEmbeddingPipeline,
  embedText,
  cosineSimilarity,
  textHash,
  getEmbedding,
  setEmbedding,
  getAllEmbeddings,
  getNoteEmbeddingText,
} from '@/utils/embeddings';

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export interface SearchResult {
  note: Note;
  score: number; // 0-1 similarity
  matchedConcepts: string[];
  keywordMatched: boolean;
  semanticScore: number;
}

interface UseSemanticSearchReturn {
  // Model state
  modelState: 'idle' | 'loading' | 'ready' | 'error';
  modelError: string | null;

  // Indexing state
  indexedCount: number;
  totalCount: number;
  indexing: boolean;

  // Search
  results: SearchResult[];
  searching: boolean;
  lastQuery: string;

  // Actions
  embedNote: (note: Note) => Promise<void>;
  reindexAll: (notes: Note[]) => Promise<void>;
  search: (query: string, notes: Note[], mode: SearchMode) => Promise<SearchResult[]>;
  ensureModelLoaded: () => Promise<void>;
}

export function useSemanticSearch(notes: Note[]): UseSemanticSearchReturn {
  const [modelState, setModelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [modelError, setModelError] = useState<string | null>(null);
  const [indexedCount, setIndexedCount] = useState(0);
  const [indexing, setIndexing] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  const indexingAbortRef = useRef<boolean>(false);
  const indexCheckRef = useRef<boolean>(false);

  // Total count = notes that have meaningful text
  const totalCount = useMemo(
    () => notes.filter((n) => n.title.trim() || n.body.trim()).length,
    [notes],
  );

  // Check existing embeddings count on mount
  useEffect(() => {
    if (indexCheckRef.current) return;
    indexCheckRef.current = true;
    (async () => {
      try {
        const all = await getAllEmbeddings();
        setIndexedCount(all.length);
      } catch (e) {
        console.error('Failed to count embeddings:', e);
      }
    })();
  }, []);

  // Background indexing: embed notes that are missing or stale
  useEffect(() => {
    if (modelState !== 'ready') return;
    if (indexing) return;

    let cancelled = false;

    const runIndexing = async () => {
      try {
        const toEmbed: Note[] = [];
        for (const note of notes) {
          const text = getNoteEmbeddingText(note);
          if (!text) continue;
          const existing = await getEmbedding(note.id);
          if (!existing || existing.textHash !== textHash(text)) {
            toEmbed.push(note);
          }
        }

        if (toEmbed.length === 0) {
          // All up to date — just sync count
          const all = await getAllEmbeddings();
          if (!cancelled) setIndexedCount(all.length);
          return;
        }

        if (!cancelled) setIndexing(true);
        indexingAbortRef.current = false;

        // Embed in batches of 5, in idle time
        let done = 0;
        for (let i = 0; i < toEmbed.length; i += 5) {
          if (cancelled || indexingAbortRef.current) break;
          const batch = toEmbed.slice(i, i + 5);

          // Use requestIdleCallback if available, else setTimeout
          await new Promise<void>((resolve) => {
            const run = async () => {
              for (const note of batch) {
                if (cancelled || indexingAbortRef.current) {
                  resolve();
                  return;
                }
                try {
                  const text = getNoteEmbeddingText(note);
                  const vector = await embedText(text);
                  if (!cancelled && !indexingAbortRef.current) {
                    await setEmbedding(note.id, vector, text);
                    done++;
                    // Update count progressively
                    const all = await getAllEmbeddings();
                    if (!cancelled) setIndexedCount(all.length);
                  }
                } catch (e) {
                  console.error(`Failed to embed note ${note.id}:`, e);
                }
              }
              resolve();
            };
            if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
              (window as any).requestIdleCallback(() => run(), { timeout: 2000 });
            } else {
              setTimeout(run, 50);
            }
          });
        }

        if (!cancelled) {
          const all = await getAllEmbeddings();
          setIndexedCount(all.length);
          setIndexing(false);
        }
      } catch (e) {
        console.error('Background indexing failed:', e);
        if (!cancelled) setIndexing(false);
      }
    };

    runIndexing();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelState, notes]);

  // Ensure model is loaded (call when user opens search view)
  const ensureModelLoaded = useCallback(async () => {
    if (modelState === 'ready' || modelState === 'loading') return;
    setModelState('loading');
    setModelError(null);
    try {
      await getEmbeddingPipeline();
      setModelState('ready');
    } catch (e) {
      console.error('Failed to load embedding model:', e);
      setModelState('error');
      setModelError(e instanceof Error ? e.message : 'Failed to load semantic model');
    }
  }, [modelState]);

  // Embed a single note (called on note save)
  const embedNote = useCallback(async (note: Note) => {
    if (modelState !== 'ready') return;
    const text = getNoteEmbeddingText(note);
    if (!text) return;
    try {
      const vector = await embedText(text);
      await setEmbedding(note.id, vector, text);
      const all = await getAllEmbeddings();
      setIndexedCount(all.length);
    } catch (e) {
      console.error(`Failed to embed note ${note.id}:`, e);
    }
  }, [modelState]);

  // Re-index all notes (manual trigger)
  const reindexAll = useCallback(async (allNotes: Note[]) => {
    if (modelState !== 'ready') {
      await ensureModelLoaded();
    }
    indexingAbortRef.current = false;
    setIndexing(true);

    let done = 0;
    for (let i = 0; i < allNotes.length; i += 5) {
      if (indexingAbortRef.current) break;
      const batch = allNotes.slice(i, i + 5);
      for (const note of batch) {
        if (indexingAbortRef.current) break;
        const text = getNoteEmbeddingText(note);
        if (!text) continue;
        try {
          const vector = await embedText(text);
          await setEmbedding(note.id, vector, text);
          done++;
          setIndexedCount(done);
        } catch (e) {
          console.error(`Failed to embed note ${note.id}:`, e);
        }
      }
      // Yield to UI between batches
      await new Promise((r) => setTimeout(r, 10));
    }

    setIndexing(false);
  }, [modelState, ensureModelLoaded]);

  // Search across notes
  const search = useCallback(async (
    query: string,
    allNotes: Note[],
    mode: SearchMode,
  ): Promise<SearchResult[]> => {
    if (!query.trim()) {
      setResults([]);
      setLastQuery('');
      return [];
    }

    setSearching(true);
    setLastQuery(query);

    try {
      let semanticResults: SearchResult[] = [];
      let keywordResults: SearchResult[] = [];

      // --- Keyword search ---
      if (mode === 'keyword' || mode === 'hybrid') {
        const q = query.toLowerCase();
        const terms = q.split(/\s+/).filter(Boolean);
        keywordResults = allNotes
          .map((note) => {
            const haystack = `${note.title} ${note.subtitle} ${note.body} ${note.tags.join(' ')}`.toLowerCase();
            const matched = terms.every((t) => haystack.includes(t));
            if (!matched) return null;
            // Score: ratio of terms found
            const foundCount = terms.filter((t) => haystack.includes(t)).length;
            const score = foundCount / terms.length;
            return {
              note,
              score,
              matchedConcepts: terms.slice(0, 2),
              keywordMatched: true,
              semanticScore: 0,
            } as SearchResult;
          })
          .filter((r): r is SearchResult => r !== null)
          .sort((a, b) => b.score - a.score);
      }

      // --- Semantic search ---
      if (mode === 'semantic' || mode === 'hybrid') {
        if (modelState !== 'ready') {
          await ensureModelLoaded();
        }
        if (modelState === 'ready' || modelState === 'loading') {
          // Wait if still loading
          let attempts = 0;
          while (modelState === 'loading' && attempts < 50) {
            await new Promise((r) => setTimeout(r, 100));
            attempts++;
          }
        }

        try {
          const queryVector = await embedText(query);
          const allEmbs = await getAllEmbeddings();
          const embMap = new Map(allEmbs.map((e) => [e.noteId, e]));

          semanticResults = allNotes
            .map((note) => {
              const emb = embMap.get(note.id);
              if (!emb) return null;
              const score = cosineSimilarity(queryVector, emb.vector);
              // Generate concept labels from the note's tags and title keywords
              const matchedConcepts = generateConceptLabels(note, query);
              return {
                note,
                score,
                matchedConcepts,
                keywordMatched: false,
                semanticScore: score,
              } as SearchResult;
            })
            .filter((r): r is SearchResult => r !== null && r.score > 0.45)
            .sort((a, b) => b.score - a.score);
        } catch (e) {
          console.error('Semantic search failed:', e);
        }
      }

      // --- Merge for hybrid mode ---
      let merged: SearchResult[];
      if (mode === 'hybrid') {
        const seen = new Set<string>();
        merged = [];
        // Interleave: take top semantic, then top keyword, alternating
        const sem = [...semanticResults];
        const kw = [...keywordResults];
        while (sem.length || kw.length) {
          if (sem.length) {
            const r = sem.shift()!;
            if (!seen.has(r.note.id)) {
              seen.add(r.note.id);
              r.keywordMatched = keywordResults.some((k) => k.note.id === r.note.id);
              merged.push(r);
            }
          }
          if (kw.length) {
            const r = kw.shift()!;
            if (!seen.has(r.note.id)) {
              seen.add(r.note.id);
              r.semanticScore = semanticResults.find((s) => s.note.id === r.note.id)?.semanticScore || 0;
              merged.push(r);
            }
          }
        }
      } else if (mode === 'semantic') {
        merged = semanticResults;
      } else {
        merged = keywordResults;
      }

      // Top 10
      merged = merged.slice(0, 10);

      setResults(merged);
      return merged;
    } finally {
      setSearching(false);
    }
  }, [modelState, ensureModelLoaded]);

  return {
    modelState,
    modelError,
    indexedCount,
    totalCount,
    indexing,
    results,
    searching,
    lastQuery,
    embedNote,
    reindexAll,
    search,
    ensureModelLoaded,
  };
}

/**
 * Generate simple concept labels from a note's tags and title.
 * Used for the "matched: X, Y" badge on result cards.
 */
function generateConceptLabels(note: Note, query: string): string[] {
  const concepts: string[] = [];

  // Use tags as concepts
  if (note.tags.length > 0) {
    concepts.push(...note.tags.slice(0, 2));
  }

  // Extract significant words from title
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'of', 'to', 'in', 'on', 'and', 'or', 'but', 'for', 'with', 'how', 'what', 'why']);
  const titleWords = note.title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 2);
  concepts.push(...titleWords);

  // Dedupe and take first 2
  const unique = Array.from(new Set(concepts));
  return unique.slice(0, 2);
}
