'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Note, CanvasBoard, CanvasCard, CanvasCardData, CanvasGroup, CanvasConnector,
} from '@/types';
import {
  MousePointer2, StickyNote as StickyIcon, ArrowRight, Box as BoxIcon, Plus,
  ZoomIn, ZoomOut, Maximize, Search, X, Trash2, Copy, FileText, ChevronDown,
  Pencil, Check,
} from 'lucide-react';
import { plural } from '@/utils/markdown';
import { ViewHeader } from './ViewHeader';
import { AppDialog, DialogState } from './AppDialog';
import {
  Box, Guide, boardBounds, boxContains, boxIntersects, buildNoteGraph, cardCentre,
  freeSpot, geometryFor, noteTier, snapOffset, suggestions,
} from '@/utils/canvas';

interface CanvasViewProps {
  board: CanvasBoard;
  allBoards: CanvasBoard[];
  notes: Note[];
  onOpenNote: (id: string) => void;
  onBack: () => void;
  onUpdateBoard: (patch: Partial<CanvasBoard>) => void;
  onAddCard: (card: CanvasCard) => void;
  onUpdateCard: (cardId: string, patch: Partial<CanvasCard>) => void;
  onDeleteCard: (cardId: string) => void;
  onAddGroup: (group: CanvasGroup) => void;
  onDeleteGroup: (groupId: string) => void;
  onAddConnector: (connector: CanvasConnector) => void;
  onDeleteConnector: (connectorId: string) => void;
  /** Promotion is a selection action now, not a card type. Returns the new
   *  note's id so the board can put it down and draw the links. */
  onCreateNoteFromCards?: (title: string, subtitle: string, sourceCardIds: string[]) => string | undefined;
  onSwitchBoard: (boardId: string) => void;
  onCreateBoard: (name: string) => void;
  onDeleteBoard: (boardId: string) => void;
  onRenameBoard: (boardId: string, name: string) => void;
}

type Tool = 'select' | 'sticky' | 'connector' | 'group';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.2;
const RAIL_W = 206;

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
/** A sticky's first line, used where a one-line label is wanted. */
const firstLine = (t: string) => t.split(String.fromCharCode(10))[0].trim();

/** A group's world box. Groups store x/y/width/height alongside cardIds. */
interface GroupBox extends Box { id: string }

/**
 * The canvas — a table you put notes down on.
 *
 * The board's purpose is arranging *your* notes in space, so the one thing it
 * could not do was choose which notes. Four routes replace the random draw: a
 * search palette, a rail of notes not yet on the table, suggestions ranked by
 * real overlap with what is already here, and drag-and-drop.
 *
 * Every card stores its own width and height at creation and every consumer
 * reads them, so fit-to-screen, the connector anchors and the minimap all
 * describe the boxes actually on screen.
 */
export function CanvasView({
  board, allBoards, notes,
  onOpenNote, onUpdateBoard, onAddCard, onUpdateCard, onDeleteCard,
  onAddGroup, onDeleteGroup, onAddConnector, onDeleteConnector,
  onCreateNoteFromCards, onSwitchBoard, onCreateBoard, onDeleteBoard, onRenameBoard,
}: CanvasViewProps) {
  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<string[]>([]);
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [railQuery, setRailQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [spacePressed, setSpacePressed] = useState(false);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  /** Where the next placement lands when it has no point of its own. */
  const lastClick = useRef({ x: 120, y: 120 });
  const drag = useRef<null | {
    kind: 'card' | 'group' | 'resize' | 'pan' | 'marquee';
    id?: string;
    startX: number; startY: number;
    origin: Map<string, { x: number; y: number }>;
    originBox?: Box;
    panX?: number; panY?: number;
  }>(null);

  const { zoom, panX, panY } = board;
  const cards = board.cards;
  const graph = useMemo(() => buildNoteGraph(notes), [notes]);
  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  /* Groups carry a box on the board record. Older boards stored only cardIds,
     so derive a box from the members rather than dropping the group. */
  const groupBoxes = useMemo<GroupBox[]>(() => board.groups.map((g) => {
    const raw = g as CanvasGroup & Partial<Box>;
    if (typeof raw.x === 'number' && typeof raw.width === 'number') {
      return { id: g.id, x: raw.x, y: raw.y ?? 0, width: raw.width, height: raw.height ?? 120 };
    }
    const members = cards.filter((c) => g.cardIds.includes(c.id));
    const b = boardBounds(members);
    return b ? { id: g.id, x: b.x - 16, y: b.y - 30, width: b.width + 32, height: b.height + 46 }
             : { id: g.id, x: 40, y: 40, width: 220, height: 140 };
  }), [board.groups, cards]);

  /* The surface's own size, measured rather than polled — the minimap and the
     fit rect both need it and neither should read a ref while rendering. */
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Same-size writes are dropped, so the first measurement is the only
      // state change on a board that never resizes.
      setSurfaceSize((cur) => (cur.width === r.width && cur.height === r.height
        ? cur : { width: r.width, height: r.height }));
    };
    // Measure once now: an observer's first callback can be missed when the
    // effect is torn down and re-run, which left the minimap with no viewport.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  /* ---------- coordinate conversion ---------- */
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = surfaceRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: (clientX - r.left - panX) / zoom, y: (clientY - r.top - panY) / zoom };
  }, [panX, panY, zoom]);

  /* ---------- zoom, anchored ---------- */
  const zoomAt = useCallback((nextZoom: number, cx: number, cy: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    if (z === zoom) return;
    // pan' = c − (c − pan) × (z' / z): the world point under the cursor stays
    // under the cursor.
    onUpdateBoard({
      zoom: z,
      panX: cx - (cx - panX) * (z / zoom),
      panY: cy - (cy - panY) * (z / zoom),
    });
  }, [zoom, panX, panY, onUpdateBoard]);

  const zoomByButton = (factor: number) => {
    const r = surfaceRef.current?.getBoundingClientRect();
    zoomAt(zoom * factor, r ? r.width / 2 : 0, r ? r.height / 2 : 0);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = surfaceRef.current?.getBoundingClientRect();
      if (!r) return;
      zoomAt(zoom * (1 - e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
    } else {
      onUpdateBoard({ panX: panX - e.deltaX, panY: panY - e.deltaY });
    }
  };

  const fitToScreen = useCallback(() => {
    const r = surfaceRef.current?.getBoundingClientRect();
    const b = boardBounds(cards);
    if (!r || !b) { onUpdateBoard({ zoom: 1, panX: 40, panY: 40 }); return; }
    const pad = 60;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
      Math.min((r.width - pad * 2) / b.width, (r.height - pad * 2) / b.height)));
    onUpdateBoard({
      zoom: z,
      panX: r.width / 2 - (b.x + b.width / 2) * z,
      panY: r.height / 2 - (b.y + b.height / 2) * z,
    });
  }, [cards, onUpdateBoard]);

  /* ---------- placement: one door for every route ---------- */
  const placeNote = useCallback((note: Note, at?: { x: number; y: number }) => {
    const degree = graph.degree.get(note.id) ?? 0;
    const data: CanvasCardData = {
      type: 'note', noteId: note.id, title: note.title, preview: note.subtitle || '',
    };
    const { width, height } = geometryFor(data, degree);
    const p = at ?? lastClick.current;
    const spot = freeSpot(p.x, p.y, width, height, cards);
    onAddCard({ id: uid('cc'), ...spot, width, height, data, groupId: null });
  }, [cards, graph.degree, onAddCard]);

  const placeSticky = useCallback((text: string, at?: { x: number; y: number }) => {
    const data: CanvasCardData = { type: 'sticky', text, variant: 'claim' };
    const { width, height } = geometryFor(data, 0);
    const p = at ?? lastClick.current;
    const spot = freeSpot(p.x, p.y, width, height, cards);
    const id = uid('cc');
    onAddCard({ id, ...spot, width, height, data, groupId: null });
    setEditingSticky(id);
    setSelection([id]);
  }, [cards, onAddCard]);

  /* ---------- selection helpers ---------- */
  const selected = useMemo(() => cards.filter((c) => selection.includes(c.id)), [cards, selection]);
  const selectedStickies = selected.filter((c) => c.data.type === 'sticky');

  const deleteSelection = useCallback(() => {
    for (const id of selection) {
      for (const k of board.connectors.filter((c) => c.fromCardId === id || c.toCardId === id)) {
        onDeleteConnector(k.id);
      }
      onDeleteCard(id);
    }
    setSelection([]);
  }, [selection, board.connectors, onDeleteCard, onDeleteConnector]);

  const duplicateSelection = useCallback(() => {
    const made: string[] = [];
    for (const c of selected) {
      const spot = freeSpot(c.x + 18, c.y + 18, c.width, c.height, cards);
      const id = uid('cc');
      made.push(id);
      onAddCard({ ...c, id, ...spot, groupId: null });
    }
    setSelection(made);
  }, [selected, cards, onAddCard]);

  const groupSelection = useCallback(() => {
    if (selected.length < 2) return;
    const b = boardBounds(selected);
    if (!b) return;
    const g: CanvasGroup & Box = {
      id: uid('cg'), label: 'New group', color: 'var(--acc)',
      cardIds: selected.map((c) => c.id),
      x: b.x - 16, y: b.y - 30, width: b.width + 32, height: b.height + 46,
    };
    onAddGroup(g);
  }, [selected, onAddGroup]);

  /**
   * Promotion: any selection becomes one note, put down below the selection
   * and joined to every card it came from. This is the move the synthesis
   * card type was gesturing at, and it works on notes, stickies and mixtures.
   */
  const promoteSelection = useCallback(() => {
    if (selected.length === 0 || !onCreateNoteFromCards) return;
    const titles = selected
      .map((c) => (c.data.type === 'note' ? c.data.title : firstLine(c.data.text)))
      .filter(Boolean);
    const title = `What ${titles.length > 1 ? 'these' : 'this'} adds up to`;
    const subtitle = titles.slice(0, 3).join(' · ');
    const noteId = onCreateNoteFromCards(title, subtitle, selected.map((c) => c.id));
    if (!noteId) return;

    const b = boardBounds(selected);
    const data: CanvasCardData = { type: 'note', noteId, title, preview: subtitle };
    const { width, height } = geometryFor(data, selected.length);
    const below = b ? { x: b.x, y: b.y + b.height + 40 } : lastClick.current;
    const spot = freeSpot(below.x, below.y, width, height, cards);
    const id = uid('cc');
    onAddCard({ id, ...spot, width, height, data, groupId: null });
    for (const src of selected) {
      onAddConnector({ id: uid('cn'), fromCardId: src.id, toCardId: id, style: 'dashed' });
    }
    setSelection([id]);
  }, [selected, cards, onCreateNoteFromCards, onAddCard, onAddConnector]);

  const setStickyVariant = (variant: 'claim' | 'aside') => {
    for (const c of selectedStickies) {
      onUpdateCard(c.id, { data: { ...c.data, variant } as CanvasCardData });
    }
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' && !typing(e.target)) { setSpacePressed(true); }
      // Every shortcut below is inert while a field has focus, so typing a
      // sticky or a query can never delete the selection or switch tools.
      if (typing(e.target)) {
        if (e.key === 'Escape') { setPaletteOpen(false); (e.target as HTMLElement).blur(); }
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSelection(cards.map((c) => c.id)); return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
      if (e.key === 'Escape') {
        setSelection([]); setPaletteOpen(false); setConnectFrom(null);
        setTool('select'); setEditingSticky(null); setEditingGroup(null);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'v') setTool('select');
      if (k === 's') setTool('sticky');
      if (k === 'c') setTool('connector');
      if (k === 'g') setTool('group');
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') setSpacePressed(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); };
  }, [cards, deleteSelection, duplicateSelection]);

  /* ---------- pointer ---------- */
  const onSurfaceMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || spacePressed) {
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origin: new Map(), panX, panY };
      e.preventDefault();
      return;
    }
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.surface) return;
    const w = toWorld(e.clientX, e.clientY);
    lastClick.current = w;

    if (tool === 'sticky') { placeSticky(''); setTool('select'); return; }
    if (tool === 'group') {
      drag.current = { kind: 'marquee', startX: w.x, startY: w.y, origin: new Map() };
      setMarquee({ x: w.x, y: w.y, width: 0, height: 0 });
      return;
    }
    setSelection([]);
    setConnectFrom(null);
    drag.current = { kind: 'marquee', startX: w.x, startY: w.y, origin: new Map() };
    setMarquee({ x: w.x, y: w.y, width: 0, height: 0 });
  };

  const onCardMouseDown = (e: React.MouseEvent, card: CanvasCard) => {
    e.stopPropagation();
    if (tool === 'connector') {
      if (!connectFrom) setConnectFrom(card.id);
      else if (connectFrom !== card.id) {
        onAddConnector({ id: uid('cn'), fromCardId: connectFrom, toCardId: card.id, style: 'solid' });
        setConnectFrom(null);
      }
      return;
    }
    const next = e.shiftKey
      ? (selection.includes(card.id) ? selection.filter((i) => i !== card.id) : [...selection, card.id])
      : (selection.includes(card.id) ? selection : [card.id]);
    setSelection(next);
    const origin = new Map<string, { x: number; y: number }>();
    for (const c of cards) if (next.includes(c.id)) origin.set(c.id, { x: c.x, y: c.y });
    drag.current = { kind: 'card', id: card.id, startX: e.clientX, startY: e.clientY, origin };
  };

  const onGroupMouseDown = (e: React.MouseEvent, g: GroupBox, kind: 'group' | 'resize') => {
    e.stopPropagation();
    const group = board.groups.find((x) => x.id === g.id);
    const origin = new Map<string, { x: number; y: number }>();
    if (kind === 'group' && group) {
      // Whole-box containment: a card straddling the edge is not a member, so
      // dragging the group cannot drag a card that only looks like it belongs.
      for (const c of cards) if (boxContains(g, c)) origin.set(c.id, { x: c.x, y: c.y });
    }
    drag.current = { kind, id: g.id, startX: e.clientX, startY: e.clientY, origin, originBox: { ...g } };
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === 'pan') {
        onUpdateBoard({ panX: (d.panX ?? 0) + (e.clientX - d.startX), panY: (d.panY ?? 0) + (e.clientY - d.startY) });
        return;
      }
      if (d.kind === 'marquee') {
        const w = toWorld(e.clientX, e.clientY);
        setMarquee({
          x: Math.min(d.startX, w.x), y: Math.min(d.startY, w.y),
          width: Math.abs(w.x - d.startX), height: Math.abs(w.y - d.startY),
        });
        return;
      }
      const dxRaw = (e.clientX - d.startX) / zoom;
      const dyRaw = (e.clientY - d.startY) / zoom;

      if (d.kind === 'resize' && d.originBox) {
        const g = board.groups.find((x) => x.id === d.id);
        if (!g) return;
        onUpdateBoard({
          groups: board.groups.map((x) => (x.id === d.id
            ? { ...x, width: Math.max(120, d.originBox!.width + dxRaw), height: Math.max(90, d.originBox!.height + dyRaw) } as CanvasGroup
            : x)),
        });
        return;
      }

      if (d.kind === 'group' && d.originBox) {
        onUpdateBoard({
          groups: board.groups.map((x) => (x.id === d.id
            ? { ...x, x: d.originBox!.x + dxRaw, y: d.originBox!.y + dyRaw } as CanvasGroup
            : x)),
        });
        for (const [id, o] of d.origin) onUpdateCard(id, { x: o.x + dxRaw, y: o.y + dyRaw });
        return;
      }

      // Card drag: snap the lead card, apply the same offset to the rest.
      const lead = cards.find((c) => c.id === d.id);
      const leadOrigin = lead && d.origin.get(lead.id);
      let dx = dxRaw, dy = dyRaw;
      if (lead && leadOrigin) {
        const moving: Box = { x: leadOrigin.x + dxRaw, y: leadOrigin.y + dyRaw, width: lead.width, height: lead.height };
        const others = cards.filter((c) => !d.origin.has(c.id));
        const snap = snapOffset(moving, others, 6 / zoom);
        dx += snap.dx; dy += snap.dy;
        setGuides(snap.guides);
      }
      for (const [id, o] of d.origin) onUpdateCard(id, { x: o.x + dx, y: o.y + dy });
    };
    const up = () => {
      const d = drag.current;
      if (d?.kind === 'marquee') {
        const m = marquee;
        if (m && (m.width > 4 || m.height > 4)) {
          const hit = cards.filter((c) => boxIntersects(m, c)).map((c) => c.id);
          if (tool === 'group' && hit.length >= 2) {
            const b = boardBounds(cards.filter((c) => hit.includes(c.id)))!;
            onAddGroup({
              id: uid('cg'), label: 'New group', color: 'var(--acc)', cardIds: hit,
              x: b.x - 16, y: b.y - 30, width: b.width + 32, height: b.height + 46,
            } as CanvasGroup & Box);
            setTool('select');
          } else {
            setSelection(hit);
          }
        }
      }
      drag.current = null;
      setMarquee(null);
      setGuides([]);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [cards, board.groups, marquee, tool, zoom, toWorld, onUpdateBoard, onUpdateCard, onAddGroup]);

  /* ---------- rail + palette data ---------- */
  const onBoardNoteIds = useMemo(
    () => new Set(cards.map((c) => (c.data.type === 'note' ? c.data.noteId : '')).filter(Boolean)),
    [cards],
  );
  const railNotes = useMemo(() => {
    const q = railQuery.trim().toLowerCase();
    return notes
      .filter((n) => !onBoardNoteIds.has(n.id))
      .filter((n) => !q || n.title.toLowerCase().includes(q))
      .slice(0, 60);
  }, [notes, onBoardNoteIds, railQuery]);
  const suggested = useMemo(() => suggestions(notes, cards, graph), [notes, cards, graph]);
  const paletteHits = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return notes.slice(0, 8);
    return notes.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 8);
  }, [notes, paletteQuery]);

  const commitPalette = () => {
    const top = paletteHits[0];
    if (top) placeNote(top);
    else if (paletteQuery.trim()) placeSticky(paletteQuery.trim());
    setPaletteOpen(false);
    setPaletteQuery('');
  };

  /* ---------- board picker dialogs ---------- */
  const newBoard = () => setDialog({
    type: 'prompt', title: 'New canvas', label: 'Name', placeholder: 'e.g. Legibility essay',
    confirmLabel: 'Create', onConfirm: (v) => onCreateBoard(v.trim() || 'Untitled canvas'),
  });
  const renameBoard = () => setDialog({
    type: 'prompt', title: 'Rename canvas', label: 'Name', defaultValue: board.name,
    confirmLabel: 'Rename', onConfirm: (v) => onRenameBoard(board.id, v.trim() || board.name),
  });
  const removeBoard = () => setDialog({
    type: 'confirm', title: 'Delete canvas', danger: true, confirmLabel: 'Delete',
    message: `Delete “${board.name}”? The notes on it stay in your vault; the arrangement does not.`,
    onConfirm: () => onDeleteBoard(board.id),
  });

  const facts = [
    plural(cards.length, 'card'),
    plural(board.groups.length, 'group'),
    plural(board.connectors.length, 'link'),
  ].join(' · ') + (tool !== 'select' ? ` · ${tool} mode` : '');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      <ViewHeader
        icon={BoxIcon}
        title={
          <BoardPicker
            board={board} allBoards={allBoards} open={pickerOpen}
            onToggle={() => setPickerOpen((o) => !o)} onClose={() => setPickerOpen(false)}
            onSwitch={onSwitchBoard} onNew={newBoard} onRename={renameBoard} onDelete={removeBoard}
          />
        }
        facts={facts}
      >
        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 5, padding: 2, gap: 1 }}>
          {([
            { id: 'select' as const, icon: MousePointer2, label: 'select  V' },
            { id: 'sticky' as const, icon: StickyIcon, label: 'sticky  S' },
            { id: 'connector' as const, icon: ArrowRight, label: 'connect  C' },
            { id: 'group' as const, icon: BoxIcon, label: 'group  G' },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              title={t.label}
              aria-pressed={tool === t.id}
              style={{
                width: 30, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: tool === t.id ? 'var(--bg4)' : 'transparent',
                color: tool === t.id ? 'var(--t1)' : 'var(--t3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <t.icon size={13} strokeWidth={1.9} />
            </button>
          ))}
        </div>
        <span style={{ width: 1, height: 18, background: 'var(--bd)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconBtn label="Zoom out" onClick={() => zoomByButton(1 / 1.15)}><ZoomOut size={13} strokeWidth={1.9} /></IconBtn>
          <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)', minWidth: 34, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <IconBtn label="Zoom in" onClick={() => zoomByButton(1.15)}><ZoomIn size={13} strokeWidth={1.9} /></IconBtn>
          <IconBtn label="Fit to screen" onClick={fitToScreen}><Maximize size={13} strokeWidth={1.9} /></IconBtn>
        </div>
        <button
          onClick={() => setPaletteOpen(true)}
          style={{
            height: 28, padding: '0 11px', background: 'var(--acc-bg)', border: '1px solid var(--acc-bd)',
            borderRadius: 5, color: 'var(--acc2)', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
          }}
        >
          <Search size={12} strokeWidth={1.9} />
          find a note
        </button>
      </ViewHeader>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        <NotesRail
          notes={railNotes} query={railQuery} onQuery={setRailQuery}
          graph={graph} suggested={suggested}
          onPlace={(n) => placeNote(n)}
          onDragNote={(n, e) => { e.dataTransfer.setData('text/note-id', n.id); e.dataTransfer.effectAllowed = 'copy'; }}
        />

        <div
          ref={surfaceRef}
          data-surface="1"
          onMouseDown={onSurfaceMouseDown}
          onWheel={onWheel}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/note-id')) e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/note-id');
            const n = noteById.get(id);
            if (n) placeNote(n, toWorld(e.clientX, e.clientY));
          }}
          style={{
            flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
            cursor: spacePressed ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
            // The grid is part of the table, so it pans and zooms with it.
            backgroundImage: 'radial-gradient(circle, var(--bd2) 0.8px, transparent 0.8px)',
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
            backgroundPosition: `${panX}px ${panY}px`,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}>
            {groupBoxes.map((g) => {
              const group = board.groups.find((x) => x.id === g.id)!;
              return (
                <GroupShape
                  key={g.id} box={g} group={group}
                  editing={editingGroup === g.id}
                  onStartEdit={() => setEditingGroup(g.id)}
                  onRename={(label) => {
                    onUpdateBoard({ groups: board.groups.map((x) => (x.id === g.id ? { ...x, label } : x)) });
                    setEditingGroup(null);
                  }}
                  onDelete={() => onDeleteGroup(g.id)}
                  onDragTab={(e) => onGroupMouseDown(e, g, 'group')}
                  onResize={(e) => onGroupMouseDown(e, g, 'resize')}
                />
              );
            })}

            <Connectors
              cards={cards} connectors={board.connectors} onDelete={onDeleteConnector}
            />

            {cards.map((c) => (
              <CardShape
                key={c.id} card={c}
                selected={selection.includes(c.id)}
                connecting={connectFrom === c.id}
                editing={editingSticky === c.id}
                degree={c.data.type === 'note' ? graph.degree.get(c.data.noteId) ?? 0 : 0}
                onMouseDown={(e) => onCardMouseDown(e, c)}
                onDoubleClick={() => {
                  if (c.data.type === 'sticky') setEditingSticky(c.id);
                  else onOpenNote(c.data.noteId);
                }}
                onCommitText={(text) => {
                  onUpdateCard(c.id, { data: { ...c.data, text } as CanvasCardData });
                  setEditingSticky(null);
                }}
              />
            ))}

            {guides.map((g, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute', pointerEvents: 'none',
                  ...(g.axis === 'x'
                    ? { left: g.at, top: -4000, width: 1, height: 8000 }
                    : { top: g.at, left: -4000, height: 1, width: 8000 }),
                  borderLeft: g.axis === 'x' ? '1px dashed var(--acc2)' : undefined,
                  borderTop: g.axis === 'y' ? '1px dashed var(--acc2)' : undefined,
                }}
              />
            ))}

            {marquee && (
              <div style={{
                position: 'absolute', left: marquee.x, top: marquee.y,
                width: marquee.width, height: marquee.height,
                border: '1px solid var(--acc)', background: 'var(--acc-bg)', opacity: 0.5, pointerEvents: 'none',
              }} />
            )}
          </div>

          {cards.length === 0 && (
            <EmptyTable onFind={() => setPaletteOpen(true)} />
          )}

          {/* Bar and minimap share one bottom-anchored row. Anchored apart they
              collide below about 1110px and the bar silently eats the
              minimap's clicks. */}
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 14px 14px',
            display: 'flex', alignItems: 'flex-end', gap: 12, pointerEvents: 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
              {selection.length > 0 && (
                <SelectionBar
                  count={selection.length}
                  stickies={selectedStickies.length}
                  canGroup={selection.length >= 2}
                  onPromote={promoteSelection}
                  onClaim={() => setStickyVariant('claim')}
                  onAside={() => setStickyVariant('aside')}
                  onGroup={groupSelection}
                  onDuplicate={duplicateSelection}
                  onDelete={deleteSelection}
                />
              )}
            </div>
            <Minimap
              cards={cards} zoom={zoom} panX={panX} panY={panY}
              viewport={surfaceSize} onCentre={(wx, wy) => {
                const r = surfaceRef.current?.getBoundingClientRect();
                if (!r) return;
                onUpdateBoard({ panX: r.width / 2 - wx * zoom, panY: r.height / 2 - wy * zoom });
              }}
            />
          </div>
        </div>
      </div>

      {paletteOpen && (
        <Palette
          query={paletteQuery} hits={paletteHits}
          onQuery={setPaletteQuery}
          onPick={(n) => { placeNote(n); setPaletteOpen(false); setPaletteQuery(''); }}
          onCommit={commitPalette}
          onClose={() => { setPaletteOpen(false); setPaletteQuery(''); }}
        />
      )}

      <AppDialog dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/* ============================================================
   Chrome
   ============================================================ */

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} title={label} aria-label={label}
      style={{
        width: 26, height: 24, borderRadius: 4, background: 'transparent', border: 'none',
        color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t3)'; }}
    >
      {children}
    </button>
  );
}

function BoardPicker({ board, allBoards, open, onToggle, onClose, onSwitch, onNew, onRename, onDelete }: {
  board: CanvasBoard; allBoards: CanvasBoard[]; open: boolean;
  onToggle: () => void; onClose: () => void; onSwitch: (id: string) => void;
  onNew: () => void; onRename: () => void; onDelete: () => void;
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none',
          padding: '2px 4px', margin: '0 -4px', borderRadius: 4, cursor: 'pointer',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--t1)', whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {board.name}
        <ChevronDown size={11} strokeWidth={2} style={{ color: 'var(--t3)' }} />
      </button>
      {open && (
        <>
          <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div role="menu" style={{
            position: 'absolute', top: 26, left: -4, zIndex: 70, width: 230,
            background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 6,
            boxShadow: '0 10px 28px rgba(0,0,0,0.38)', padding: 4,
          }}>
            {allBoards.map((b) => (
              <button
                key={b.id}
                onClick={() => { onSwitch(b.id); onClose(); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 4, background: b.id === board.id ? 'var(--acc-bg)' : 'transparent',
                  border: 'none', color: b.id === board.id ? 'var(--acc2)' : 'var(--t2)',
                  fontFamily: 'inherit', fontSize: 11.5, textAlign: 'left', cursor: 'pointer',
                }}
                onMouseEnter={(e) => { if (b.id !== board.id) e.currentTarget.style.background = 'var(--bg3)'; }}
                onMouseLeave={(e) => { if (b.id !== board.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span>
                <span className="sb-fig" style={{ fontSize: 9.5, color: 'var(--t3)' }}>{b.cards.length}</span>
              </button>
            ))}
            <div style={{ height: 1, background: 'var(--bd)', margin: '4px 0' }} />
            <MenuRow icon={Plus} label="new canvas" onClick={() => { onNew(); onClose(); }} />
            <MenuRow icon={Pencil} label="rename this canvas" onClick={() => { onRename(); onClose(); }} />
            <MenuRow icon={Trash2} label="delete this canvas" danger onClick={() => { onDelete(); onClose(); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuRow({ icon: Icon, label, onClick, danger }: {
  icon: typeof Plus; label: string; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        borderRadius: 4, background: 'transparent', border: 'none',
        color: danger ? 'var(--red)' : 'var(--t2)', fontFamily: 'inherit', fontSize: 11,
        textAlign: 'left', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon size={11} strokeWidth={1.9} />
      {label}
    </button>
  );
}

/* ============================================================
   Cards
   ============================================================ */

/** Sticky inks. Two variants, both reachable from the selection bar. */
const STICKY_INK = {
  claim: { bg: 'var(--amb-bg)', bd: 'var(--amb)', ink: 'var(--t1)' },
  aside: { bg: 'var(--bg2)', bd: 'var(--bd2)', ink: 'var(--t2)' },
} as const;

function CardShape({ card, selected, connecting, editing, degree, onMouseDown, onDoubleClick, onCommitText }: {
  card: CanvasCard; selected: boolean; connecting: boolean; editing: boolean; degree: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onCommitText: (text: string) => void;
}) {
  const common: React.CSSProperties = {
    position: 'absolute', left: card.x, top: card.y, width: card.width, height: card.height,
    borderRadius: 6, cursor: 'grab', overflow: 'hidden',
    outline: selected ? '2px solid var(--acc)' : connecting ? '2px dashed var(--acc2)' : 'none',
    outlineOffset: 1,
  };

  if (card.data.type === 'sticky') {
    const ink = STICKY_INK[card.data.variant];
    return (
      <div
        onMouseDown={onMouseDown}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
        style={{ ...common, background: ink.bg, border: `1px solid ${ink.bd}`, padding: 9, display: 'flex' }}
      >
        {editing ? (
          <StickyEditor text={card.data.text} onCommit={onCommitText} />
        ) : (
          <span style={{ fontSize: 11.5, lineHeight: 1.45, color: ink.ink, whiteSpace: 'pre-wrap', overflow: 'hidden' }}>
            {card.data.text || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>double-click to write</span>}
          </span>
        )}
      </div>
    );
  }

  // Note card. The tier decides the type sizes; the box comes from the stored
  // geometry and is never recomputed here.
  const tier = noteTier(degree);
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick(); }}
      title={`${card.data.title} — ${plural(degree, 'link')}`}
      style={{
        ...common, background: 'var(--bg2)', border: '1px solid var(--bd)',
        padding: '10px 11px', display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileText size={10} strokeWidth={1.9} style={{ color: 'var(--t3)', flexShrink: 0 }} />
        <span className="sb-fig" style={{ fontSize: 9, color: 'var(--t3)' }}>{degree}</span>
      </div>
      <span
        className="sb-front-serif"
        style={{
          fontSize: tier.titleSize, lineHeight: 1.22, color: 'var(--t1)', fontWeight: 600,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}
      >
        {card.data.title}
      </span>
      {tier.showSubtitle && card.data.preview && (
        <span style={{ fontSize: 10, lineHeight: 1.4, color: 'var(--t3)', overflow: 'hidden' }}>
          {card.data.preview}
        </span>
      )}
    </div>
  );
}

/** Stickies are editable whenever you double-click, not only at birth. */
function StickyEditor({ text, onCommit }: { text: string; onCommit: (t: string) => void }) {
  const [v, setV] = useState(text);
  return (
    <textarea
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onCommit(text); }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onCommit(v); }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        flex: 1, width: '100%', background: 'transparent', border: 'none', outline: 'none',
        resize: 'none', color: 'var(--t1)', fontSize: 11.5, lineHeight: 1.45,
        fontFamily: 'inherit', caretColor: 'var(--acc2)',
      }}
    />
  );
}

/* ============================================================
   Groups — the body stays click-through, the tab and handle do not
   ============================================================ */

function GroupShape({ box, group, editing, onStartEdit, onRename, onDelete, onDragTab, onResize }: {
  box: Box; group: CanvasGroup; editing: boolean;
  onStartEdit: () => void; onRename: (label: string) => void; onDelete: () => void;
  onDragTab: (e: React.MouseEvent) => void; onResize: (e: React.MouseEvent) => void;
}) {
  return (
    <div style={{
      position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height,
      border: '1px dashed var(--bd2)', borderRadius: 8, background: 'var(--bg1)', opacity: 0.55,
      pointerEvents: 'none',
    }}>
      <div
        onMouseDown={onDragTab}
        onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(); }}
        style={{
          position: 'absolute', top: -22, left: 0, height: 20, maxWidth: box.width,
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
          background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 4,
          pointerEvents: 'auto', cursor: 'grab',
        }}
      >
        {editing ? (
          <GroupLabelEditor initial={group.label} onCommit={onRename} />
        ) : (
          <span style={{
            fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t2)',
            fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {group.label}
          </span>
        )}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          title="Ungroup"
          style={{
            width: 14, height: 14, borderRadius: 2, background: 'transparent', border: 'none',
            color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 0, flexShrink: 0,
          }}
        >
          <X size={9} strokeWidth={2.4} />
        </button>
      </div>
      <div
        onMouseDown={onResize}
        title="Resize group"
        style={{
          position: 'absolute', right: -4, bottom: -4, width: 12, height: 12,
          background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 3,
          pointerEvents: 'auto', cursor: 'nwse-resize',
        }}
      />
    </div>
  );
}

/** Mounted only while a group is being renamed, so its initial value is the
 *  label as it stands and nothing has to sync a prop into state. */
function GroupLabelEditor({ initial, onCommit }: { initial: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(initial);
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft.trim() || initial)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); onCommit(draft.trim() || initial); }
        if (e.key === 'Escape') { e.preventDefault(); onCommit(initial); }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Rename group"
      style={{
        width: 120, background: 'var(--bg3)', border: '1px solid var(--acc)', borderRadius: 3,
        padding: '1px 5px', color: 'var(--t1)', fontFamily: 'inherit', fontSize: 9.5,
        outline: 'none', caretColor: 'var(--acc2)',
      }}
    />
  );
}

/* ============================================================
   Connectors — centre to centre, off the stored geometry
   ============================================================ */

function Connectors({ cards, connectors, onDelete }: {
  cards: CanvasCard[]; connectors: CanvasConnector[]; onDelete: (id: string) => void;
}) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
      <defs>
        <marker id="sb-canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--t3)" />
        </marker>
      </defs>
      {connectors.map((k) => {
        const a = byId.get(k.fromCardId);
        const b = byId.get(k.toCardId);
        if (!a || !b) return null;
        const p1 = cardCentre(a);
        const p2 = cardCentre(b);
        const dx = Math.abs(p2.x - p1.x) * 0.4;
        const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
        return (
          <g key={k.id}>
            <path
              d={d} fill="none" stroke="var(--t3)" strokeWidth={1.4}
              strokeDasharray={k.style === 'dashed' ? '5 4' : undefined}
              markerEnd="url(#sb-canvas-arrow)"
            />
            {/* A 1.4px line is not a click target, so a fat transparent path
                takes the clicks. */}
            <path
              d={d} fill="none" stroke="transparent" strokeWidth={14}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onDelete(k.id); }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ============================================================
   The notes rail
   ============================================================ */

function NotesRail({ notes, query, onQuery, graph, suggested, onPlace, onDragNote }: {
  notes: Note[]; query: string; onQuery: (q: string) => void;
  graph: { degree: Map<string, number> };
  suggested: { note: Note; overlap: number; reason: string }[];
  onPlace: (n: Note) => void;
  onDragNote: (n: Note, e: React.DragEvent) => void;
}) {
  return (
    <div style={{
      width: RAIL_W, minWidth: RAIL_W, height: '100%', background: 'var(--bg1)',
      borderRight: '1px solid var(--bd)', display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, height: 30, margin: '8px 8px 4px',
        padding: '0 8px', borderRadius: 4, background: 'var(--bg2)',
        border: `1px solid ${query ? 'var(--acc-bd)' : 'var(--bd)'}`, flexShrink: 0,
      }}>
        <Search size={11} color="var(--t3)" strokeWidth={2} style={{ flexShrink: 0 }} />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onQuery(''); }}
          placeholder="notes not on the table"
          aria-label="Filter notes not yet on the board"
          style={{
            flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--t1)', fontSize: 11, fontFamily: 'inherit', caretColor: 'var(--acc2)',
          }}
        />
      </div>

      <div className="sb-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '2px 0 8px' }}>
        {notes.length === 0 ? (
          <div style={{ padding: '14px 12px', fontSize: 10.5, lineHeight: 1.6, color: 'var(--t3)' }}>
            {query ? 'No note by that name.' : 'Every note is already on the table.'}
          </div>
        ) : notes.map((n) => (
          <button
            key={n.id}
            draggable
            onDragStart={(e) => onDragNote(n, e)}
            onClick={() => onPlace(n)}
            title={`${n.title} — click or drag onto the table`}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
              background: 'transparent', border: 'none', color: 'inherit',
              fontFamily: 'inherit', textAlign: 'left', cursor: 'grab',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{
              width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
              background: n.status === 'evergreen' ? 'var(--grn)' : 'var(--t3)',
            }} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 11, color: 'var(--t2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {n.title}
            </span>
            <span className="sb-fig" style={{ fontSize: 9, color: 'var(--t3)', flexShrink: 0 }}>
              {graph.degree.get(n.id) ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Ranked by overlap with this table, so a vault-wide hub with nothing
          in common here is never suggested. The section is absent, not empty,
          when nothing overlaps. */}
      {suggested.length > 0 && (
        <div style={{ borderTop: '1px solid var(--bd)', padding: '8px 12px 10px', flexShrink: 0 }}>
          <span style={{
            fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: 'var(--t3)', fontWeight: 600,
          }}>
            Suggested
          </span>
          {suggested.map((s) => (
            <button
              key={s.note.id}
              onClick={() => onPlace(s.note)}
              style={{
                width: '100%', display: 'block', textAlign: 'left', marginTop: 8, padding: 0,
                background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.75'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              <span style={{
                display: 'block', fontSize: 11, color: 'var(--acc2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {s.note.title}
              </span>
              <span style={{ display: 'block', fontSize: 9.5, color: 'var(--t3)', marginTop: 2 }}>
                {s.reason}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Palette, selection bar, minimap, empty table
   ============================================================ */

function Palette({ query, hits, onQuery, onPick, onCommit, onClose }: {
  query: string; hits: Note[];
  onQuery: (q: string) => void; onPick: (n: Note) => void; onCommit: () => void; onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Find a note"
        style={{
          width: 460, maxWidth: '92vw', background: 'var(--bg2)', border: '1px solid var(--bd2)',
          borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderBottom: '1px solid var(--bd)' }}>
          <Search size={13} color="var(--t3)" strokeWidth={2} />
          <input
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
              if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            }}
            placeholder="find a note, or type to make a sticky"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit', caretColor: 'var(--acc2)',
            }}
          />
        </div>
        <div className="sb-scroll" style={{ maxHeight: 300, overflowY: 'auto', padding: 4 }}>
          {hits.length === 0 ? (
            <div style={{ padding: '14px 10px', fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
              {query.trim()
                ? <>No note by that name. <span style={{ color: 'var(--acc2)' }}>⏎</span> makes a sticky saying “{query.trim()}”.</>
                : 'Type to search your notes.'}
            </div>
          ) : hits.map((n, i) => (
            <button
              key={n.id}
              onClick={() => onPick(n)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
                borderRadius: 4, background: i === 0 ? 'var(--acc-bg)' : 'transparent', border: 'none',
                color: i === 0 ? 'var(--acc2)' : 'var(--t2)', fontFamily: 'inherit', fontSize: 12,
                textAlign: 'left', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { if (i !== 0) e.currentTarget.style.background = 'var(--bg3)'; }}
              onMouseLeave={(e) => { if (i !== 0) e.currentTarget.style.background = 'transparent'; }}
            >
              <FileText size={11} strokeWidth={1.9} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {n.title}
              </span>
              {i === 0 && <span style={{ fontSize: 9.5, color: 'var(--t3)' }}>⏎</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectionBar({ count, stickies, canGroup, onPromote, onClaim, onAside, onGroup, onDuplicate, onDelete }: {
  count: number; stickies: number; canGroup: boolean;
  onPromote: () => void; onClaim: () => void; onAside: () => void;
  onGroup: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  return (
    <div style={{
      pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 8px', background: 'var(--bg2)', border: '1px solid var(--bd2)',
      borderRadius: 7, boxShadow: '0 8px 24px -8px rgba(0,0,0,0.5)',
    }}>
      <span className="sb-fig" style={{ fontSize: 10, color: 'var(--t3)', padding: '0 4px', whiteSpace: 'nowrap' }}>
        {count} selected
      </span>
      <span style={{ width: 1, height: 16, background: 'var(--bd)' }} />
      <BarBtn label="make a note from this" accent onClick={onPromote} />
      {stickies > 0 && (
        <>
          <BarBtn label="claim" onClick={onClaim} ink="var(--amb)" />
          <BarBtn label="aside" onClick={onAside} />
        </>
      )}
      {canGroup && <BarBtn label="group" onClick={onGroup} />}
      <BarBtn label="duplicate" onClick={onDuplicate} icon={Copy} />
      <BarBtn label="delete" onClick={onDelete} icon={Trash2} ink="var(--red)" />
    </div>
  );
}

function BarBtn({ label, onClick, accent, ink, icon: Icon }: {
  label: string; onClick: () => void; accent?: boolean; ink?: string; icon?: typeof Copy;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        height: 24, padding: '0 9px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit',
        fontSize: 10.5, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
        background: accent ? 'var(--acc-bg)' : 'transparent',
        border: `1px solid ${accent ? 'var(--acc-bd)' : 'transparent'}`,
        color: accent ? 'var(--acc2)' : ink || 'var(--t2)',
        fontWeight: accent ? 600 : 400,
      }}
      onMouseEnter={(e) => { if (!accent) e.currentTarget.style.background = 'var(--bg3)'; }}
      onMouseLeave={(e) => { if (!accent) e.currentTarget.style.background = 'transparent'; }}
    >
      {Icon && <Icon size={11} strokeWidth={1.9} />}
      {label}
    </button>
  );
}

const MINIMAP_W = 152;
const MINIMAP_H = 100;

/**
 * The minimap, derived from the same stored geometry as everything else and
 * re-rendered with state rather than polled. The old one ran a 5fps interval
 * and could not be clicked.
 */
function Minimap({ cards, zoom, panX, panY, viewport, onCentre }: {
  cards: CanvasCard[]; zoom: number; panX: number; panY: number;
  viewport: { width: number; height: number };
  onCentre: (wx: number, wy: number) => void;
}) {
  const dragging = useRef(false);
  // The surface size arrives as measured state rather than a ref read during
  // render, so the map redraws with the board instead of lagging a frame.
  const view = viewport.width > 0
    ? { x: -panX / zoom, y: -panY / zoom, width: viewport.width / zoom, height: viewport.height / zoom }
    : null;

  const world = useMemo(() => {
    const boxes: Box[] = [...cards];
    if (view) boxes.push(view);
    if (boxes.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of boxes) {
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
    }
    const pad = 40;
    return { x: minX - pad, y: minY - pad, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 };
  }, [cards, view]);

  const s = Math.min(MINIMAP_W / world.width, MINIMAP_H / world.height);
  const px = (wx: number) => (wx - world.x) * s;
  const py = (wy: number) => (wy - world.y) * s;

  const centreFromEvent = (e: React.MouseEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onCentre(world.x + (e.clientX - box.left) / s, world.y + (e.clientY - box.top) / s);
  };

  return (
    <div
      onMouseDown={(e) => { dragging.current = true; centreFromEvent(e); }}
      onMouseMove={(e) => { if (dragging.current) centreFromEvent(e); }}
      onMouseUp={() => { dragging.current = false; }}
      onMouseLeave={() => { dragging.current = false; }}
      title="Click or drag to move the view"
      style={{
        pointerEvents: 'auto', width: MINIMAP_W, height: MINIMAP_H, flexShrink: 0, position: 'relative',
        background: 'var(--bg1)', border: '1px solid var(--bd)', borderRadius: 5,
        overflow: 'hidden', cursor: 'pointer',
      }}
    >
      {cards.map((c) => (
        <div
          key={c.id}
          style={{
            position: 'absolute', left: px(c.x), top: py(c.y),
            width: Math.max(2, c.width * s), height: Math.max(2, c.height * s),
            background: c.data.type === 'sticky' ? 'var(--amb)' : 'var(--t3)',
            borderRadius: 1, opacity: 0.75,
          }}
        />
      ))}
      {view && (
        <div style={{
          position: 'absolute', left: px(view.x), top: py(view.y),
          width: view.width * s, height: view.height * s,
          border: '1px solid var(--acc2)', background: 'var(--acc-bg)', opacity: 0.5,
        }} />
      )}
    </div>
  );
}

function EmptyTable({ onFind }: { onFind: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none', padding: 24,
    }}>
      <span className="sb-front-serif" style={{ fontSize: 22, fontWeight: 600, color: 'var(--t1)' }}>
        An empty table.
      </span>
      <span style={{
        fontSize: 12, lineHeight: 1.7, color: 'var(--t3)', maxWidth: '46ch',
        textAlign: 'center', textWrap: 'pretty',
      }}>
        Put your notes down, move them until they argue with each other, then make
        the note that says what they add up to.
      </span>
      <button
        onClick={onFind}
        style={{
          pointerEvents: 'auto', marginTop: 4, height: 30, padding: '0 13px',
          background: 'var(--acc)', border: 'none', borderRadius: 5, color: 'var(--on-acc)',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--acc2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--acc)'; }}
      >
        <Search size={12} strokeWidth={2} />
        find a note  ⌘K
      </button>
      <span style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>
        or drag one in from the rail, or press S for a sticky
      </span>
    </div>
  );
}
