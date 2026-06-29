'use client';

import { useMemo } from 'react';
import { Note } from '@/types';
import { computeBacklinks } from '@/utils/markdown';

/**
 * Compute backlinks across all notes.
 * Memoized on the notes array identity.
 *
 * Returns:
 *  - backlinks: Map<noteId, Note[]>  — the notes that reference each note
 *  - totalConnections: number — total wiki-link edges in the graph
 */
export function useBacklinks(notes: Note[]) {
  return useMemo(() => {
    const map = computeBacklinks(notes);
    const backlinkNotes: Record<string, Note[]> = {};
    let totalConnections = 0;
    for (const n of notes) {
      const ids = map[n.id] || [];
      backlinkNotes[n.id] = ids
        .map((id) => notes.find((m) => m.id === id))
        .filter((m): m is Note => Boolean(m));
      totalConnections += ids.length;
    }
    return { backlinks: backlinkNotes, totalConnections };
  }, [notes]);
}
