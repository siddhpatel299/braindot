'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Note, AppState, NoteCollection } from '@/types';
import { SEED_NOTES, generateNoteId } from '@/utils/seedData';
import { computeBacklinks, countWords, todayKey } from '@/utils/markdown';

const STORAGE_KEY = 'second-brain-state-v1';

interface PersistedState {
  notes: Note[];
  openTabs: string[];
  activeTab: string;
  streak: number;
  totalConnections: number;
  lastEditDay: string;
}

function loadState(): PersistedState {
  if (typeof window === 'undefined') {
    return seedState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as PersistedState;
    // sanity check
    if (!parsed.notes || parsed.notes.length === 0) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

function seedState(): PersistedState {
  const notes = SEED_NOTES.map((n) => ({ ...n }));
  const backlinks = computeBacklinks(notes);
  for (const n of notes) {
    n.backlinks = backlinks[n.id] || [];
  }
  return {
    notes,
    openTabs: [notes[0].id],
    activeTab: notes[0].id,
    streak: 14,
    totalConnections: 1084,
    lastEditDay: todayKey(),
  };
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function useNotes() {
  const [state, setState] = useState<PersistedState>(() => loadState());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // hydrate from localStorage on mount (avoids SSR mismatch)
  useEffect(() => {
    setState(loadState()); // eslint-disable-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  // Debounced save
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveState(state);
    }, 600);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  // Recompute backlinks whenever notes change
  const recomputeBacklinks = useCallback((notes: Note[]): Note[] => {
    const backlinks = computeBacklinks(notes);
    return notes.map((n) => ({ ...n, backlinks: backlinks[n.id] || [] }));
  }, []);

  const updateNote = useCallback(
    (id: string, patch: Partial<Note>, opts?: { silent?: boolean }) => {
      setState((prev) => {
        const notes = prev.notes.map((n) => {
          if (n.id !== id) return n;
          const next: Note = { ...n, ...patch };
          if (patch.body !== undefined) {
            next.wordCount = countWords(patch.body);
          }
          next.updatedAt = opts?.silent ? n.updatedAt : new Date().toISOString();
          return next;
        });
        const withBacklinks = recomputeBacklinks(notes);

        // Streak update
        let { streak, lastEditDay } = prev;
        if (!opts?.silent) {
          const today = todayKey();
          if (lastEditDay !== today) {
            // check if yesterday
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
            if (lastEditDay === yKey) streak = streak + 1;
            else if (lastEditDay !== today) streak = 1;
            lastEditDay = today;
          }
        }

        return {
          ...prev,
          notes: withBacklinks,
          streak,
          lastEditDay,
        };
      });
    },
    [recomputeBacklinks],
  );

  const createNote = useCallback(
    (collection: NoteCollection = 'learning'): Note => {
      const id = generateNoteId();
      const now = new Date().toISOString();
      const n: Note = {
        id,
        filename: `untitled-${id.slice(-6)}.md`,
        title: 'Untitled note',
        subtitle: 'A new thought, waiting to be shaped.',
        tags: [],
        body: '',
        backlinks: [],
        createdAt: now,
        updatedAt: now,
        wordCount: 0,
        status: 'draft',
        collection,
      };
      setState((prev) => {
        const notes = [n, ...prev.notes];
        const withBacklinks = recomputeBacklinks(notes);
        return {
          ...prev,
          notes: withBacklinks,
          openTabs: [...prev.openTabs, id],
          activeTab: id,
        };
      });
      return n;
    },
    [recomputeBacklinks],
  );

  const deleteNote = useCallback((id: string) => {
    setState((prev) => {
      const notes = prev.notes.filter((n) => n.id !== id);
      const openTabs = prev.openTabs.filter((t) => t !== id);
      let activeTab = prev.activeTab;
      if (activeTab === id) {
        activeTab = openTabs[openTabs.length - 1] || notes[0]?.id || '';
      }
      const withBacklinks = recomputeBacklinks(notes);
      return {
        ...prev,
        notes: withBacklinks,
        openTabs,
        activeTab,
      };
    });
  }, [recomputeBacklinks]);

  const openTab = useCallback((id: string) => {
    setState((prev) => {
      if (!prev.notes.find((n) => n.id === id)) return prev;
      const openTabs = prev.openTabs.includes(id) ? prev.openTabs : [...prev.openTabs, id];
      return { ...prev, openTabs, activeTab: id };
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setState((prev) => {
      const idx = prev.openTabs.indexOf(id);
      const openTabs = prev.openTabs.filter((t) => t !== id);
      let activeTab = prev.activeTab;
      if (activeTab === id) {
        const next = openTabs[idx] || openTabs[idx - 1] || openTabs[openTabs.length - 1] || '';
        activeTab = next;
      }
      return { ...prev, openTabs, activeTab };
    });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeTab: id }));
  }, []);

  const reorderTabs = useCallback((fromId: string, toId: string) => {
    setState((prev) => {
      const fromIdx = prev.openTabs.indexOf(fromId);
      const toIdx = prev.openTabs.indexOf(toId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const openTabs = [...prev.openTabs];
      const [moved] = openTabs.splice(fromIdx, 1);
      openTabs.splice(toIdx, 0, moved);
      return { ...prev, openTabs };
    });
  }, []);

  const resetAll = useCallback(() => {
    const fresh = seedState();
    setState(fresh);
    saveState(fresh);
  }, []);

  return {
    state,
    hydrated,
    updateNote,
    createNote,
    deleteNote,
    openTab,
    closeTab,
    setActiveTab,
    reorderTabs,
    resetAll,
  };
}

export type UseNotesReturn = ReturnType<typeof useNotes>;
