'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useConvexAuth } from 'convex/react';
import {
  KanbanCardItem, TodoItem, CanvasBoard, LibraryItem, Highlight,
} from '@/types';
import { useCollectionSync } from '@/hooks/useCollectionSync';

// ============================================================
// Generic localStorage hook factory
// ============================================================
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount — localStorage hydration is intentionally a synchronous
  // setState in an effect
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        setValue(JSON.parse(raw));
      }
    } catch {}
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [key]);

  // Debounced save
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      // Skip writes while signing out — the vault keys were just cleared
      if ((window as unknown as { __sbSignout?: boolean }).__sbSignout) return;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [value, key, hydrated]);

  return [value, setValue, hydrated] as const;
}

// Cloud sync is on for signed-in (non-demo) users once local state loaded
function useSyncEnabled(hydrated: boolean): boolean {
  const { isAuthenticated } = useConvexAuth();
  const [isDemo, setIsDemo] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDemo(localStorage.getItem('second-brain-demo') === 'true');
  }, []);
  return hydrated && isAuthenticated && !isDemo;
}

// Convex documents cap at ~1MB — leave headroom for other fields
const MAX_SYNCED_CONTENT = 900_000;

// ============================================================
// Kanban + Todos
// ============================================================
const KANBAN_KEY = 'sb-kanban-cards';
const TODOS_KEY = 'sb-todos';

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useKanbanTodos() {
  const [kanbanCards, setKanbanCards, kanbanHydrated] = useLocalStorage<KanbanCardItem[]>(KANBAN_KEY, []);
  const [todos, setTodos, todosHydrated] = useLocalStorage<TodoItem[]>(TODOS_KEY, []);
  const syncEnabled = useSyncEnabled(kanbanHydrated && todosHydrated);

  useCollectionSync<KanbanCardItem>({
    table: 'kanbanCards',
    enabled: syncEnabled,
    items: kanbanCards,
    hydrate: useCallback((items: KanbanCardItem[]) => setKanbanCards(items), [setKanbanCards]),
    toDoc: useCallback((c: KanbanCardItem) => ({
      localId: c.id, title: c.title, description: c.description, status: c.status,
      tags: c.tags, linkedNoteId: c.linkedNoteId, order: c.order,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    }), []),
    fromDoc: useCallback((d: Record<string, unknown>): KanbanCardItem => ({
      id: String(d.localId), title: String(d.title), description: String(d.description ?? ''),
      status: d.status as KanbanCardItem['status'], tags: (d.tags as string[]) ?? [],
      linkedNoteId: (d.linkedNoteId as string | null) ?? null, order: Number(d.order ?? 0),
      createdAt: String(d.createdAt), updatedAt: String(d.updatedAt),
    }), []),
  });

  useCollectionSync<TodoItem>({
    table: 'todos',
    enabled: syncEnabled,
    items: todos,
    hydrate: useCallback((items: TodoItem[]) => setTodos(items), [setTodos]),
    toDoc: useCallback((t: TodoItem) => ({
      localId: t.id, text: t.text, done: t.done, priority: t.priority,
      dueGroup: t.dueGroup, dueDate: t.dueDate, linkedNoteId: t.linkedNoteId,
      order: t.order, createdAt: t.createdAt,
    }), []),
    fromDoc: useCallback((d: Record<string, unknown>): TodoItem => ({
      id: String(d.localId), text: String(d.text), done: Boolean(d.done),
      priority: d.priority as TodoItem['priority'],
      dueGroup: (d.dueGroup as TodoItem['dueGroup']) ?? null,
      dueDate: (d.dueDate as string | null) ?? null,
      linkedNoteId: (d.linkedNoteId as string | null) ?? null,
      order: Number(d.order ?? 0), createdAt: String(d.createdAt),
    }), []),
  });

  const addKanbanCard = useCallback((card: Partial<KanbanCardItem> & Pick<KanbanCardItem, 'title' | 'status'>) => {
    const now = new Date().toISOString();
    // Fill defaults so every card is complete regardless of call site
    const newCard: KanbanCardItem = {
      description: '', tags: [], linkedNoteId: null, order: 0,
      ...card, id: genId('kc'), createdAt: now, updatedAt: now,
    };
    setKanbanCards(prev => [...prev, newCard]);
    return newCard;
  }, [setKanbanCards]);

  const moveKanbanCard = useCallback((cardId: string, newStatus: KanbanCardItem['status']) => {
    setKanbanCards(prev => prev.map(c => c.id === cardId ? { ...c, status: newStatus, updatedAt: new Date().toISOString() } : c));
  }, [setKanbanCards]);

  const updateKanbanCard = useCallback((cardId: string, patch: Partial<KanbanCardItem>) => {
    setKanbanCards(prev => prev.map(c => c.id === cardId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c));
  }, [setKanbanCards]);

  const deleteKanbanCard = useCallback((cardId: string) => {
    setKanbanCards(prev => prev.filter(c => c.id !== cardId));
  }, [setKanbanCards]);

  const addTodo = useCallback((todo: Partial<TodoItem> & Pick<TodoItem, 'text'>) => {
    const newTodo: TodoItem = {
      done: false, priority: 'medium', dueGroup: null, dueDate: null,
      linkedNoteId: null, order: 0,
      ...todo, id: genId('td'), createdAt: new Date().toISOString(),
    };
    setTodos(prev => [...prev, newTodo]);
    return newTodo;
  }, [setTodos]);

  const toggleTodo = useCallback((id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }, [setTodos]);

  const updateTodo = useCallback((id: string, patch: Partial<TodoItem>) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, [setTodos]);

  const deleteTodo = useCallback((id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  }, [setTodos]);

  return {
    kanbanCards, todos,
    addKanbanCard, moveKanbanCard, updateKanbanCard, deleteKanbanCard,
    addTodo, toggleTodo, updateTodo, deleteTodo,
  };
}

// ============================================================
// Canvas boards
// ============================================================
const CANVAS_KEY = 'sb-canvas-boards';

export function useCanvas() {
  const [rawBoards, setBoards, boardsHydrated] = useLocalStorage<CanvasBoard[]>(CANVAS_KEY, []);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const syncEnabled = useSyncEnabled(boardsHydrated);

  // Older saves predate zoom/pan on the board — default them or every
  // coordinate in CanvasView becomes NaN.
  const boards = rawBoards.map((b) => ({ zoom: 1, panX: 0, panY: 0, ...b }));

  useCollectionSync<CanvasBoard>({
    table: 'canvasBoards',
    enabled: syncEnabled,
    items: boards,
    hydrate: useCallback((items: CanvasBoard[]) => setBoards(items), [setBoards]),
    toDoc: useCallback((b: CanvasBoard) => ({
      localId: b.id, name: b.name,
      data: JSON.stringify({
        cards: b.cards, groups: b.groups, connectors: b.connectors,
        zoom: b.zoom ?? 1, panX: b.panX ?? 0, panY: b.panY ?? 0,
      }),
      createdAt: b.createdAt, updatedAt: b.updatedAt,
    }), []),
    fromDoc: useCallback((d: Record<string, unknown>): CanvasBoard => {
      let parsed: Partial<CanvasBoard> = {};
      try { parsed = JSON.parse(String(d.data || '{}')); } catch {}
      return {
        id: String(d.localId), name: String(d.name),
        cards: parsed.cards ?? [], groups: parsed.groups ?? [], connectors: parsed.connectors ?? [],
        zoom: parsed.zoom ?? 1, panX: parsed.panX ?? 0, panY: parsed.panY ?? 0,
        createdAt: String(d.createdAt), updatedAt: String(d.updatedAt),
      };
    }, []),
  });

  // Set first board as active on load
  useEffect(() => {
    if (!activeBoardId && boards.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  const activeBoard = boards.find(b => b.id === activeBoardId) || null;

  const createBoard = useCallback((name: string) => {
    const now = new Date().toISOString();
    const board: CanvasBoard = {
      id: genId('cb'), name, cards: [], groups: [], connectors: [],
      zoom: 1, panX: 0, panY: 0,
      createdAt: now, updatedAt: now,
    };
    setBoards(prev => [...prev, board]);
    setActiveBoardId(board.id);
    return board;
  }, [setBoards]);

  const deleteBoard = useCallback((boardId: string) => {
    setBoards(prev => prev.filter(b => b.id !== boardId));
    if (activeBoardId === boardId) {
      const remaining = boards.filter(b => b.id !== boardId);
      setActiveBoardId(remaining[0]?.id || null);
    }
  }, [setBoards, boards, activeBoardId]);

  const renameBoard = useCallback((boardId: string, name: string) => {
    setBoards(prev => prev.map(b => b.id === boardId ? { ...b, name, updatedAt: new Date().toISOString() } : b));
  }, [setBoards]);

  const updateBoard = useCallback((patch: Partial<CanvasBoard>) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b));
  }, [setBoards, activeBoardId]);

  const addCard = useCallback((card: CanvasBoard['cards'][0]) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, cards: [...b.cards, card], updatedAt: new Date().toISOString() } : b));
  }, [setBoards, activeBoardId]);

  const updateCard = useCallback((cardId: string, patch: Partial<CanvasBoard['cards'][0]>) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? {
      ...b,
      cards: b.cards.map(c => c.id === cardId ? { ...c, ...patch } : c),
      updatedAt: new Date().toISOString(),
    } : b));
  }, [setBoards, activeBoardId]);

  const deleteCard = useCallback((cardId: string) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? {
      ...b,
      cards: b.cards.filter(c => c.id !== cardId),
      connectors: b.connectors.filter(con => con.fromCardId !== cardId && con.toCardId !== cardId),
      updatedAt: new Date().toISOString(),
    } : b));
  }, [setBoards, activeBoardId]);

  const addGroup = useCallback((group: CanvasBoard['groups'][0]) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, groups: [...b.groups, group], updatedAt: new Date().toISOString() } : b));
  }, [setBoards, activeBoardId]);

  const deleteGroup = useCallback((groupId: string) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? {
      ...b,
      groups: b.groups.filter(g => g.id !== groupId),
      updatedAt: new Date().toISOString(),
    } : b));
  }, [setBoards, activeBoardId]);

  const addConnector = useCallback((connector: CanvasBoard['connectors'][0]) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, connectors: [...b.connectors, connector], updatedAt: new Date().toISOString() } : b));
  }, [setBoards, activeBoardId]);

  const deleteConnector = useCallback((connectorId: string) => {
    if (!activeBoardId) return;
    setBoards(prev => prev.map(b => b.id === activeBoardId ? {
      ...b,
      connectors: b.connectors.filter(c => c.id !== connectorId),
      updatedAt: new Date().toISOString(),
    } : b));
  }, [setBoards, activeBoardId]);

  return {
    boards, activeBoard, activeBoardId,
    setActiveBoardId, createBoard, deleteBoard, renameBoard,
    updateBoard, addCard, updateCard, deleteCard,
    addGroup, deleteGroup, addConnector, deleteConnector,
  };
}

// ============================================================
// Reading / Library
// ============================================================
const LIBRARY_KEY = 'sb-library-items';
const HIGHLIGHTS_KEY = 'sb-highlights';

export function useReading() {
  const [libraryItems, setLibraryItems, libraryHydrated] = useLocalStorage<LibraryItem[]>(LIBRARY_KEY, []);
  const [highlights, setHighlights, highlightsHydrated] = useLocalStorage<Highlight[]>(HIGHLIGHTS_KEY, []);
  const syncEnabled = useSyncEnabled(libraryHydrated && highlightsHydrated);

  useCollectionSync<LibraryItem>({
    table: 'libraryItems',
    enabled: syncEnabled,
    items: libraryItems,
    hydrate: useCallback((items: LibraryItem[]) => setLibraryItems(items), [setLibraryItems]),
    toDoc: useCallback((i: LibraryItem) => ({
      localId: i.id, title: i.title, author: i.author, type: i.type, source: i.source,
      content: i.content.length > MAX_SYNCED_CONTENT ? i.content.slice(0, MAX_SYNCED_CONTENT) : i.content,
      excerpt: i.excerpt ?? '', status: i.status, progress: i.progress,
      coverUrl: i.coverUrl, highlights: i.highlights ?? [],
      createdAt: i.addedAt, updatedAt: i.updatedAt,
    }), []),
    fromDoc: useCallback((d: Record<string, unknown>): LibraryItem => ({
      id: String(d.localId), title: String(d.title),
      author: (d.author as string | null) ?? null,
      type: d.type as LibraryItem['type'], source: String(d.source ?? ''),
      content: String(d.content ?? ''), excerpt: String(d.excerpt ?? ''),
      status: d.status as LibraryItem['status'], progress: Number(d.progress ?? 0),
      coverUrl: (d.coverUrl as string | null) ?? null,
      highlights: (d.highlights as string[]) ?? [],
      addedAt: String(d.createdAt), updatedAt: String(d.updatedAt),
    }), []),
  });

  useCollectionSync<Highlight>({
    table: 'highlights',
    enabled: syncEnabled,
    items: highlights,
    hydrate: useCallback((items: Highlight[]) => setHighlights(items), [setHighlights]),
    toDoc: useCallback((h: Highlight) => ({
      localId: h.id, libraryItemId: h.libraryItemId, noteId: h.noteId,
      text: h.text, color: h.color, page: h.page, createdAt: h.createdAt,
    }), []),
    fromDoc: useCallback((d: Record<string, unknown>): Highlight => ({
      id: String(d.localId), libraryItemId: String(d.libraryItemId),
      noteId: (d.noteId as string | null) ?? null, text: String(d.text ?? ''),
      color: d.color as Highlight['color'], page: (d.page as number | null) ?? null,
      createdAt: String(d.createdAt),
    }), []),
  });

  const addLibraryItem = useCallback((item: Omit<LibraryItem, 'id' | 'addedAt' | 'updatedAt' | 'highlights'>) => {
    const now = new Date().toISOString();
    const newItem: LibraryItem = { ...item, id: genId('li'), addedAt: now, updatedAt: now, highlights: [] };
    setLibraryItems(prev => [newItem, ...prev]);
    return newItem;
  }, [setLibraryItems]);

  const updateLibraryItem = useCallback((id: string, patch: Partial<LibraryItem>) => {
    setLibraryItems(prev => prev.map(i => i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i));
  }, [setLibraryItems]);

  const deleteLibraryItem = useCallback((id: string) => {
    setLibraryItems(prev => prev.filter(i => i.id !== id));
    setHighlights(prev => prev.filter(h => h.libraryItemId !== id));
  }, [setLibraryItems, setHighlights]);

  const addHighlight = useCallback((highlight: Omit<Highlight, 'id' | 'createdAt'>) => {
    const newHighlight: Highlight = { ...highlight, id: genId('hl'), createdAt: new Date().toISOString() };
    setHighlights(prev => [...prev, newHighlight]);
    setLibraryItems(prev => prev.map(i => i.id === highlight.libraryItemId ? { ...i, highlights: [...i.highlights, newHighlight.id] } : i));
    return newHighlight;
  }, [setHighlights, setLibraryItems]);

  const updateHighlight = useCallback((id: string, patch: Partial<Highlight>) => {
    setHighlights(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
  }, [setHighlights]);

  const deleteHighlight = useCallback((id: string) => {
    setHighlights(prev => prev.filter(h => h.id !== id));
    setLibraryItems(prev => prev.map(i => ({ ...i, highlights: i.highlights.filter(hid => hid !== id) })));
  }, [setHighlights, setLibraryItems]);

  return {
    libraryItems, highlights,
    addLibraryItem, updateLibraryItem, deleteLibraryItem,
    addHighlight, updateHighlight, deleteHighlight,
  };
}
