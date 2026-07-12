'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  KanbanCardItem, TodoItem, CanvasBoard, LibraryItem, Highlight,
} from '@/types';

// ============================================================
// Generic localStorage hook factory
// ============================================================
function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        setValue(JSON.parse(raw));
      }
    } catch {}
    setHydrated(true);
  }, [key]);

  // Debounced save
  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [value, key, hydrated]);

  return [value, setValue] as const;
}

// ============================================================
// Kanban + Todos
// ============================================================
const KANBAN_KEY = 'sb-kanban-cards';
const TODOS_KEY = 'sb-todos';

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useKanbanTodos() {
  const [kanbanCards, setKanbanCards] = useLocalStorage<KanbanCardItem[]>(KANBAN_KEY, []);
  const [todos, setTodos] = useLocalStorage<TodoItem[]>(TODOS_KEY, []);

  const addKanbanCard = useCallback((card: Omit<KanbanCardItem, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newCard: KanbanCardItem = { ...card, id: genId('kc'), createdAt: now, updatedAt: now };
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

  const addTodo = useCallback((todo: Omit<TodoItem, 'id' | 'createdAt'>) => {
    const newTodo: TodoItem = { ...todo, id: genId('td'), createdAt: new Date().toISOString() };
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
  const [boards, setBoards] = useLocalStorage<CanvasBoard[]>(CANVAS_KEY, []);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);

  // Set first board as active on load
  useEffect(() => {
    if (!activeBoardId && boards.length > 0) {
      setActiveBoardId(boards[0].id);
    }
  }, [boards, activeBoardId]);

  const activeBoard = boards.find(b => b.id === activeBoardId) || null;

  const createBoard = useCallback((name: string) => {
    const now = new Date().toISOString();
    const board: CanvasBoard = {
      id: genId('cb'), name, cards: [], groups: [], connectors: [],
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
  const [libraryItems, setLibraryItems] = useLocalStorage<LibraryItem[]>(LIBRARY_KEY, []);
  const [highlights, setHighlights] = useLocalStorage<Highlight[]>(HIGHLIGHTS_KEY, []);

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
