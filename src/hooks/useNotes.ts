'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Note, AppState, NoteCollection, Folder, ParaType } from '@/types';
import { SEED_NOTES, SEED_FOLDERS, SEED_FOLDER_IDS, generateNoteId, generateFolderId } from '@/utils/seedData';
import { computeBacklinks, countWords, todayKey } from '@/utils/markdown';

const STORAGE_KEY = 'second-brain-state-v2';
const LEGACY_KEY = 'second-brain-state-v1';

interface PersistedState {
  notes: Note[];
  folders: Folder[];
  openTabs: string[];
  activeTab: string;
  streak: number;
  totalConnections: number;
  lastEditDay: string;
}

// Map legacy collection → seed folder id
function migrateCollectionToFolder(collection: NoteCollection): string {
  switch (collection) {
    case 'pinned':    return SEED_FOLDER_IDS.resourcesPkm;
    case 'strategy':  return SEED_FOLDER_IDS.areasStrategy;
    case 'learning':  return SEED_FOLDER_IDS.resourcesLearning;
    case 'reading':   return SEED_FOLDER_IDS.resourcesReading;
    case 'research':  return SEED_FOLDER_IDS.resourcesResearch;
  }
}

function loadState(): PersistedState {
  if (typeof window === 'undefined') {
    return seedState();
  }
  // Check for new user FIRST — before looking at existing localStorage
  const isNewUser = localStorage.getItem('second-brain-new-user') === 'true';
  const isDemo = localStorage.getItem('second-brain-demo') === 'true';
  if (isNewUser && !isDemo) {
    localStorage.removeItem('second-brain-new-user');
    // Also clear any existing state so the new user doesn't get old data
    localStorage.removeItem(STORAGE_KEY);
    return newUserState();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.notes && parsed.notes.length > 0 && parsed.folders) {
        return parsed;
      }
    }
    // Try migrating from v1
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      try {
        const legacy = JSON.parse(legacyRaw) as { notes: any[]; openTabs: string[]; activeTab: string; streak: number; totalConnections: number; lastEditDay: string };
        if (legacy.notes && legacy.notes.length > 0) {
          const folders = SEED_FOLDERS.map((f) => ({ ...f }));
          const notes: Note[] = legacy.notes.map((n) => {
            const folderId = n.folderId || (n.collection ? migrateCollectionToFolder(n.collection) : SEED_FOLDER_IDS.resourcesPkm);
            const pinned = n.pinned ?? (n.collection === 'pinned');
            return {
              id: n.id,
              filename: n.filename,
              title: n.title,
              subtitle: n.subtitle ?? '',
              tags: n.tags ?? [],
              body: n.body ?? '',
              backlinks: [],
              createdAt: n.createdAt,
              updatedAt: n.updatedAt,
              wordCount: n.wordCount ?? countWords(n.body ?? ''),
              status: n.status ?? 'draft',
              folderId,
              pinned,
            };
          });
          const backlinks = computeBacklinks(notes);
          for (const n of notes) n.backlinks = backlinks[n.id] || [];
          const state: PersistedState = {
            notes,
            folders,
            openTabs: legacy.openTabs?.length ? legacy.openTabs : [notes[0].id],
            activeTab: legacy.activeTab && notes.find((n) => n.id === legacy.activeTab) ? legacy.activeTab : notes[0].id,
            streak: legacy.streak ?? 14,
            totalConnections: legacy.totalConnections ?? 1084,
            lastEditDay: legacy.lastEditDay ?? todayKey(),
          };
          return state;
        }
      } catch {
        // fall through to seed
      }
    }
    return seedState();
  } catch {
    return seedState();
  }
}

function seedState(): PersistedState {
  // Demo mode or default — full seed data
  // New-user check is ONLY in loadState(), NOT here
  const notes = SEED_NOTES.map((n) => ({ ...n }));
  const folders = SEED_FOLDERS.map((f) => ({ ...f }));
  const backlinks = computeBacklinks(notes);
  for (const n of notes) {
    n.backlinks = backlinks[n.id] || [];
  }
  return {
    notes,
    folders,
    openTabs: [notes[0].id],
    activeTab: notes[0].id,
    streak: 14,
    totalConnections: 1084,
    lastEditDay: todayKey(),
  };
}

function newUserState(): PersistedState {
  // New user — empty vault with 3 template notes and PARA folders
  const now = new Date().toISOString();
  const templateNotes: Note[] = [
    {
      id: 'tpl_welcome',
      filename: 'welcome-to-second-brain.md',
      title: 'Welcome to Second Brain',
      subtitle: 'Your knowledge, connected.',
      tags: ['strategy', 'learning'],
      body: `# Welcome to Second Brain

This is your first note. It lives in your **Resources** folder under **PKM**.

## What is this app?

Second Brain is a PKM workspace where notes connect to each other, your reading flows into your vault, and AI helps you see patterns.

## How to get started

1. **Create a note** — click "+ new note" or press ⌘T
2. **Write in markdown** — use the formatting toolbar for bold, italic, headings
3. **Link notes** — type [[note-title]] to create a wiki-link
4. **Open command palette** — press ⌘K to search and navigate
5. **Explore the dashboard** — click the brain logo (top-left)

> [!callout]
> The best way to learn is to start writing. Create a note about something you learned today.

## Tips

- Press **⌘K** for the command palette
- Type **/** in the editor to insert embeds
- Switch between **edit** and **preview** modes using the tabs above the editor`,
      backlinks: [],
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
      status: 'evergreen',
      folderId: SEED_FOLDER_IDS.resourcesPkm,
      pinned: true,
    },
    {
      id: 'tpl_first_note',
      filename: 'my-first-note.md',
      title: 'My First Note',
      subtitle: 'Start here — write something you learned today.',
      tags: [],
      body: `# My First Note

Write something you learned today. It doesn't have to be profound — just one idea, in your own words.

## What did I learn?

[Start typing here. Delete this placeholder and write your thought.]

## How does this connect?

Use [[wiki-links]] to connect this note to other notes. For example, link to [[welcome-to-second-brain]].`,
      backlinks: [],
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
      status: 'draft',
      folderId: SEED_FOLDER_IDS.resourcesPkm,
      pinned: false,
    },
  ].map(n => ({ ...n, wordCount: n.body.split(/\s+/).filter(Boolean).length }));

  const backlinks = computeBacklinks(templateNotes);
  for (const n of templateNotes) n.backlinks = backlinks[n.id] || [];

  return {
    notes: templateNotes,
    folders: SEED_FOLDERS.map((f) => ({ ...f })),
    openTabs: [templateNotes[0].id],
    activeTab: templateNotes[0].id,
    streak: 0, // new users start at 0
    totalConnections: 0,
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
  const [state, setState] = useState<PersistedState>(() => {
    // During SSR or first render, return empty state — real loading happens in useEffect
    if (typeof window === 'undefined') return seedState();
    return seedState();
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // hydrate from localStorage on mount — this is where the REAL state loading happens
  useEffect(() => {
    const loaded = loadState(); // This checks new-user flag, demo flag, existing state, etc.
    /* eslint-disable react-hooks/set-state-in-effect */
    setState(loaded);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Debounced save — only save AFTER hydration is complete
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

        let { streak, lastEditDay } = prev;
        if (!opts?.silent) {
          const today = todayKey();
          if (lastEditDay !== today) {
            const y = new Date();
            y.setDate(y.getDate() - 1);
            const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
            if (lastEditDay === yKey) streak = streak + 1;
            else if (lastEditDay !== today) streak = 1;
            lastEditDay = today;
          }
        }

        return { ...prev, notes: withBacklinks, streak, lastEditDay };
      });
    },
    [recomputeBacklinks],
  );

  const createNote = useCallback(
    (folderId: string): Note => {
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
        folderId,
        pinned: false,
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
      return { ...prev, notes: withBacklinks, openTabs, activeTab };
    });
  }, [recomputeBacklinks]);

  const moveNote = useCallback((noteId: string, folderId: string) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n)),
    }));
  }, []);

  const togglePinned = useCallback((noteId: string) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === noteId ? { ...n, pinned: !n.pinned } : n)),
    }));
  }, []);

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

  // ---------- Folder CRUD ----------
  const createFolder = useCallback((parentId: string | null, name: string, paraType?: ParaType): Folder => {
    const id = generateFolderId();
    const folder: Folder = {
      id,
      name: name || 'New folder',
      parentId,
      paraType,
      createdAt: new Date().toISOString(),
      expanded: true,
    };
    setState((prev) => ({
      ...prev,
      folders: [...prev.folders, folder],
    }));
    return folder;
  }, []);

  const renameFolder = useCallback((id: string, name: string) => {
    setState((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => (f.id === id ? { ...f, name } : f)),
    }));
  }, []);

  const deleteFolder = useCallback((id: string) => {
    setState((prev) => {
      // collect all descendant folder ids
      const toDelete = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const f of prev.folders) {
          if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
            toDelete.add(f.id);
            changed = true;
          }
        }
      }
      // move notes in deleted folders to Resources root (or first remaining folder)
      const fallbackFolder = prev.folders.find((f) => f.id === SEED_FOLDER_IDS.resources) || prev.folders.find((f) => f.parentId === null);
      const fallbackId = fallbackFolder?.id || prev.folders[0]?.id || '';
      const notes = prev.notes.map((n) =>
        toDelete.has(n.folderId) ? { ...n, folderId: fallbackId } : n,
      );
      const folders = prev.folders.filter((f) => !toDelete.has(f.id));
      return { ...prev, folders, notes };
    });
  }, []);

  const toggleFolderExpanded = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      folders: prev.folders.map((f) => (f.id === id ? { ...f, expanded: !f.expanded } : f)),
    }));
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
    moveNote,
    togglePinned,
    openTab,
    closeTab,
    setActiveTab,
    reorderTabs,
    createFolder,
    renameFolder,
    deleteFolder,
    toggleFolderExpanded,
    resetAll,
  };
}

export type UseNotesReturn = ReturnType<typeof useNotes>;
