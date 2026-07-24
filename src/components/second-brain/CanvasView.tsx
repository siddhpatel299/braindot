'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Note, CanvasBoard, CanvasCard, CanvasNoteCard, CanvasSticky, CanvasSynthesisCard,
  CanvasGroup, CanvasConnector, TAG_COLORS,
} from '@/types';
import {
  MousePointer2, StickyNote as StickyIcon, ArrowRight, Box, Plus,
  ZoomIn, ZoomOut, Maximize, FileText, Sparkles, X, Trash2, Type,
} from 'lucide-react';

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
  onCreateNoteFromSynthesis?: (title: string, subtitle: string) => void;
  onSwitchBoard: (boardId: string) => void;
  onCreateBoard: (name: string) => void;
  onDeleteBoard: (boardId: string) => void;
  onRenameBoard: (boardId: string, name: string) => void;
}

type Tool = 'select' | 'sticky' | 'connector' | 'group' | 'text';

export function CanvasView({
  board,
  allBoards,
  notes,
  onOpenNote,
  onBack,
  onUpdateBoard,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onAddGroup,
  onDeleteGroup,
  onAddConnector,
  onDeleteConnector,
  onCreateNoteFromSynthesis,
  onSwitchBoard,
  onCreateBoard,
  onDeleteBoard,
  onRenameBoard,
}: CanvasViewProps) {
  const [tool, setTool] = useState<Tool>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });
  const [draggingCard, setDraggingCard] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectorFrom, setConnectorFrom] = useState<string | null>(null);
  const [drawingGroup, setDrawingGroup] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [editingSticky, setEditingSticky] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  // Convert screen coordinates to canvas coordinates
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (screenX - rect.left - board.panX) / board.zoom,
      y: (screenY - rect.top - board.panY) / board.zoom,
    };
  }, [board.panX, board.panY, board.zoom]);

  // Handle canvas mouse down (panning or tool actions)
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    // Only handle clicks on the canvas background, not on cards
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('sb-canvas-bg')) return;
    const canvasPos = screenToCanvas(e.clientX, e.clientY);

    if (tool === 'select') {
      // Start panning
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, panX: board.panX, panY: board.panY });
    } else if (tool === 'sticky') {
      // Drop a new sticky note
      const newSticky: CanvasSticky = {
        id: 'cvst_' + Math.random().toString(36).slice(2, 10),
        type: 'sticky',
        text: 'New note',
        x: canvasPos.x,
        y: canvasPos.y,
        width: 140,
        variant: 'amber',
      };
      onAddCard(newSticky);
      setEditingSticky(newSticky.id);
      setTool('select');
    } else if (tool === 'text') {
      // Drop a new neutral text card (same as sticky but neutral variant)
      const newText: CanvasSticky = {
        id: 'cvst_' + Math.random().toString(36).slice(2, 10),
        type: 'sticky',
        text: 'Type something…',
        x: canvasPos.x,
        y: canvasPos.y,
        width: 160,
        variant: 'neutral',
      };
      onAddCard(newText);
      setEditingSticky(newText.id);
      setTool('select');
    } else if (tool === 'group') {
      // Start drawing a group region
      setDrawingGroup({ x: canvasPos.x, y: canvasPos.y, w: 0, h: 0 });
    }
  }, [tool, board.panX, board.panY, screenToCanvas, onAddCard]);

  // Handle mouse move (panning, card drag, group drawing)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      onUpdateBoard({ panX: panStart.panX + dx, panY: panStart.panY + dy });
    } else if (draggingCard) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      onUpdateCard(draggingCard, { x: canvasPos.x - dragOffset.x, y: canvasPos.y - dragOffset.y });
    } else if (drawingGroup) {
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      setDrawingGroup({
        x: Math.min(drawingGroup.x, canvasPos.x),
        y: Math.min(drawingGroup.y, canvasPos.y),
        w: Math.abs(canvasPos.x - drawingGroup.x),
        h: Math.abs(canvasPos.y - drawingGroup.y),
      });
    }
  }, [isPanning, panStart, draggingCard, drawingGroup, screenToCanvas, dragOffset, onUpdateBoard, onUpdateCard]);

  // Handle mouse up (end panning, card drag, group drawing)
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDraggingCard(null);
    if (drawingGroup && drawingGroup.w > 30 && drawingGroup.h > 30) {
      const newGroup: CanvasGroup = {
        id: 'cvg_' + Math.random().toString(36).slice(2, 10),
        label: 'New group',
        x: drawingGroup.x,
        y: drawingGroup.y,
        width: drawingGroup.w,
        height: drawingGroup.h,
      };
      onAddGroup(newGroup);
    }
    setDrawingGroup(null);
  }, [drawingGroup, onAddGroup]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.25, Math.min(2, board.zoom + delta));
    onUpdateBoard({ zoom: newZoom });
  }, [board.zoom, onUpdateBoard]);

  // Zoom controls
  const zoomIn = () => onUpdateBoard({ zoom: Math.min(2, board.zoom + 0.15) });
  const zoomOut = () => onUpdateBoard({ zoom: Math.max(0.25, board.zoom - 0.15) });
  const fitToScreen = () => {
    // Compute bounding box of all cards
    if (board.cards.length === 0) {
      onUpdateBoard({ zoom: 1, panX: 0, panY: 0 });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of board.cards) {
      const w = ('width' in c ? c.width : 170) || 170;
      const h = c.type === 'sticky' ? 80 : c.type === 'synthesis' ? 80 : 90;
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + w);
      maxY = Math.max(maxY, c.y + h);
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 60;
    const zoomX = (rect.width - padding * 2) / (maxX - minX);
    const zoomY = (rect.height - padding * 2) / (maxY - minY);
    const newZoom = Math.min(zoomX, zoomY, 1.5);
    onUpdateBoard({
      zoom: newZoom,
      panX: padding - minX * newZoom,
      panY: padding - minY * newZoom,
    });
  };

  // Handle card click
  const handleCardClick = useCallback((card: CanvasCard, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tool === 'connector') {
      if (!connectorFrom) {
        setConnectorFrom(card.id);
      } else if (connectorFrom !== card.id) {
        onAddConnector({
          id: 'cvcn_' + Math.random().toString(36).slice(2, 10),
          fromCardId: connectorFrom,
          toCardId: card.id,
          style: 'solid',
        });
        setConnectorFrom(null);
        setTool('select');
      }
    } else if (card.type === 'note') {
      const note = noteById.get((card as CanvasNoteCard).noteId);
      if (note) onOpenNote(note.id);
    }
  }, [tool, connectorFrom, onAddConnector, onOpenNote, noteById]);

  // Start card drag
  const handleCardMouseDown = useCallback((card: CanvasCard, e: React.MouseEvent) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    const canvasPos = screenToCanvas(e.clientX, e.clientY);
    setDraggingCard(card.id);
    setDragOffset({ x: canvasPos.x - card.x, y: canvasPos.y - card.y });
  }, [tool, screenToCanvas]);

  // Compute connector path
  const getConnectorPath = (conn: CanvasConnector) => {
    const from = board.cards.find((c) => c.id === conn.fromCardId);
    const to = board.cards.find((c) => c.id === conn.toCardId);
    if (!from || !to) return null;
    const fromW = ('width' in from ? from.width : 170) || 170;
    const toW = ('width' in to ? to.width : 170) || 170;
    const fromH = from.type === 'sticky' ? 80 : from.type === 'synthesis' ? 80 : 90;
    const toH = to.type === 'sticky' ? 80 : to.type === 'synthesis' ? 80 : 90;
    // Anchor to center of each card
    const x1 = from.x + fromW / 2;
    const y1 = from.y + fromH / 2;
    const x2 = to.x + toW / 2;
    const y2 = to.y + toH / 2;
    // Curved bezier
    const cx1 = x1 + (x2 - x1) * 0.5;
    const cy1 = y1;
    const cx2 = x2 - (x2 - x1) * 0.5;
    const cy2 = y2;
    return { x1, y1, x2, y2, cx1, cy1, cx2, cy2 };
  };

  // Promote synthesis card to a real note
  const handlePromoteSynthesis = (card: CanvasSynthesisCard) => {
    if (onCreateNoteFromSynthesis) {
      onCreateNoteFromSynthesis(card.title, card.subtitle);
      onDeleteCard(card.id);
    }
  };

  const toolBtnStyle = (active: boolean): React.CSSProperties => ({
    width: 30, height: 30, borderRadius: 4,
    background: active ? 'var(--acc-bg)' : 'transparent',
    border: '1px solid ' + (active ? 'var(--acc-bd)' : 'var(--bd2)'),
    color: active ? 'var(--acc2)' : 'var(--t3)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.1s, color 0.1s',
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Breadcrumb + toolbar */}
      <div style={{
        height: 44, background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t3)' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: 0 }}>dashboard</button>
          <span>/</span>
          <span style={{ color: 'var(--t1)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Box size={13} color="var(--acc2)" /> canvas
          </span>
        </div>
        {/* Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 3, background: 'var(--bg3)', borderRadius: 5, padding: 3 }}>
            <button onClick={() => setTool('select')} style={toolBtnStyle(tool === 'select')} title="Select / move (pan)"><MousePointer2 size={14} /></button>
            <button onClick={() => setTool('sticky')} style={toolBtnStyle(tool === 'sticky')} title="Add sticky note"><StickyIcon size={14} /></button>
            <button onClick={() => setTool('text')} style={toolBtnStyle(tool === 'text')} title="Add text card"><Type size={14} /></button>
            <button onClick={() => setTool('connector')} style={toolBtnStyle(tool === 'connector')} title="Draw connector"><ArrowRight size={14} /></button>
            <button onClick={() => setTool('group')} style={toolBtnStyle(tool === 'group')} title="Draw group region"><Box size={14} /></button>
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--bd)' }} />
          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={zoomOut} style={toolBtnStyle(false)} title="Zoom out"><ZoomOut size={14} /></button>
            <span style={{ fontSize: 11, color: 'var(--t2)', minWidth: 42, textAlign: 'center' }}>{Math.round(board.zoom * 100)}%</span>
            <button onClick={zoomIn} style={toolBtnStyle(false)} title="Zoom in"><ZoomIn size={14} /></button>
            <button onClick={fitToScreen} style={toolBtnStyle(false)} title="Fit to screen"><Maximize size={14} /></button>
          </div>
        </div>
      </div>

      {/* Board stats bar */}
      <div style={{
        height: 36, background: 'var(--bg1)', borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 14, fontSize: 11, color: 'var(--t3)', flexShrink: 0,
      }}>
        <span style={{ color: 'var(--t2)', fontWeight: 600 }}>{board.name}</span>
        <span>·</span>
        <span>{board.cards.length} cards</span>
        <span>·</span>
        <span>{board.groups.length} groups</span>
        <span>·</span>
        <span>{board.connectors.length} connectors</span>
        {tool !== 'select' && (
          <span style={{ color: 'var(--acc2)', fontStyle: 'italic' }}>· {tool} mode — {tool === 'connector' && connectorFrom ? 'click target card' : 'click on canvas'}</span>
        )}
      </div>

      {/* Main area: board sidebar + canvas */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Board sidebar */}
        <div style={{
          width: 200, minWidth: 200,
          background: 'var(--bg1)',
          borderRight: '1px solid var(--bd)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            height: 34, padding: '0 10px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--bd)',
          }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--t3)', fontWeight: 600 }}>Boards</span>
            <button
              onClick={() => {
                const name = prompt('Canvas name:', 'New canvas');
                if (name) onCreateBoard(name);
              }}
              title="New canvas"
              style={{
                width: 22, height: 22, borderRadius: 3,
                background: 'transparent', border: 'none', color: 'var(--t2)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Plus size={13} strokeWidth={2} />
            </button>
          </div>
          <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {allBoards.map((b) => {
              const isActive = b.id === board.id;
              return (
                <div
                  key={b.id}
                  onClick={() => onSwitchBoard(b.id)}
                  style={{
                    height: 28, padding: '0 12px',
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: isActive ? 'var(--acc-bg)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--acc)' : '2px solid transparent',
                    cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg2)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Box size={11} style={{ flexShrink: 0, color: isActive ? 'var(--acc2)' : 'var(--t3)', opacity: 0.7 }} />
                  <span style={{
                    fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: isActive ? 'var(--acc2)' : 'var(--t2)',
                  }} onDoubleClick={() => {
                    const name = prompt('Rename canvas:', b.name);
                    if (name) onRenameBoard(b.id, name);
                  }} title={`${b.name} (double-click to rename)`}>
                    {b.name}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--t3)', opacity: 0.5 }}>{b.cards.length}</span>
                  {allBoards.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete canvas "${b.name}"?`)) onDeleteBoard(b.id);
                      }}
                      style={{
                        width: 16, height: 16, borderRadius: 2,
                        background: 'transparent', border: 'none', color: 'var(--t3)',
                        cursor: 'pointer', padding: 0, opacity: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                      className="sb-cv-board-delete"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <style>{`
            .sb-cv-board-delete { opacity: 0 !important; }
            div:hover > .sb-cv-board-delete { opacity: 0.5 !important; }
            div:hover > .sb-cv-board-delete:hover { opacity: 1 !important; }
          `}</style>
        </div>

        {/* Canvas area */}
        <div
          ref={canvasRef}
          className="sb-canvas-bg"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'hidden',
            background: 'radial-gradient(circle, #18181b 0.6px, transparent 0.6px) 0 0/22px 22px',
          cursor: isPanning ? 'grabbing' : tool === 'select' ? 'grab' : 'crosshair',
        }}
      >
        {/* Pannable / zoomable container */}
        <div style={{
          position: 'absolute',
          left: 0, top: 0,
          transform: `translate(${board.panX}px, ${board.panY}px) scale(${board.zoom})`,
          transformOrigin: '0 0',
          width: '100%', height: '100%',
        }}>
          {/* SVG layer for connectors (behind cards) */}
          <svg
            width="100%" height="100%"
            style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}
          >
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#3d378a" />
              </marker>
            </defs>
            {board.connectors.map((conn) => {
              const path = getConnectorPath(conn);
              if (!path) return null;
              const d = `M ${path.x1} ${path.y1} C ${path.cx1} ${path.cy1}, ${path.cx2} ${path.cy2}, ${path.x2} ${path.y2}`;
              return (
                <g key={conn.id} style={{ pointerEvents: 'auto', cursor: 'pointer' }} onClick={() => onDeleteConnector(conn.id)}>
                  <path d={d} fill="none" stroke={conn.style === 'solid' ? 'var(--acc-bd)' : 'var(--bd)'} strokeWidth={conn.style === 'solid' ? 1.2 : 1} strokeDasharray={conn.style === 'dashed' ? '4,3' : undefined} markerEnd={conn.style === 'solid' ? 'url(#arrowhead)' : undefined} opacity={0.7} />
                  {/* Invisible thicker hit area for easier clicking */}
                  <path d={d} fill="none" stroke="transparent" strokeWidth={10} />
                </g>
              );
            })}
          </svg>

          {/* Group regions (behind cards) */}
          {board.groups.map((group) => (
            <div
              key={group.id}
              style={{
                position: 'absolute',
                left: group.x, top: group.y,
                width: group.width, height: group.height,
                border: '1px dashed var(--bd2)',
                borderRadius: 8,
                pointerEvents: 'none',
              }}
            >
              <div style={{
                position: 'absolute', top: 6, left: 10,
                fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
                color: 'var(--t3)', fontWeight: 600,
                background: 'var(--bg)', padding: '0 4px',
              }}>{group.label}</div>
              <button
                onClick={() => onDeleteGroup(group.id)}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 18, height: 18, borderRadius: 3,
                  background: 'transparent', border: 'none',
                  color: 'var(--t3)', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'auto', opacity: 0.5,
                }}
              >
                <X size={10} />
              </button>
            </div>
          ))}

          {/* Drawing group (while dragging) */}
          {drawingGroup && (
            <div style={{
              position: 'absolute',
              left: drawingGroup.x, top: drawingGroup.y,
              width: drawingGroup.w, height: drawingGroup.h,
              border: '1px dashed var(--acc)',
              borderRadius: 8,
              background: 'rgba(124,110,247,0.05)',
              pointerEvents: 'none',
            }} />
          )}

          {/* Cards */}
          {board.cards.map((card) => {
            if (card.type === 'note') {
              return (
                <CanvasNoteCardView
                  key={card.id}
                  card={card as CanvasNoteCard}
                  note={noteById.get((card as CanvasNoteCard).noteId)}
                  isConnectorSource={connectorFrom === card.id}
                  onMouseDown={(e) => handleCardMouseDown(card, e)}
                  onClick={(e) => handleCardClick(card, e)}
                  onDelete={() => onDeleteCard(card.id)}
                />
              );
            }
            if (card.type === 'sticky') {
              return (
                <CanvasStickyView
                  key={card.id}
                  card={card as CanvasSticky}
                  isEditing={editingSticky === card.id}
                  isConnectorSource={connectorFrom === card.id}
                  onMouseDown={(e) => handleCardMouseDown(card, e)}
                  onClick={(e) => handleCardClick(card, e)}
                  onTextChange={(text) => onUpdateCard(card.id, { text } as Partial<CanvasSticky>)}
                  onVariantToggle={() => onUpdateCard(card.id, { variant: (card as CanvasSticky).variant === 'amber' ? 'neutral' : 'amber' } as Partial<CanvasSticky>)}
                  onFinishEdit={() => setEditingSticky(null)}
                  onDelete={() => onDeleteCard(card.id)}
                />
              );
            }
            if (card.type === 'synthesis') {
              return (
                <CanvasSynthesisView
                  key={card.id}
                  card={card as CanvasSynthesisCard}
                  isConnectorSource={connectorFrom === card.id}
                  onMouseDown={(e) => handleCardMouseDown(card, e)}
                  onClick={(e) => handleCardClick(card, e)}
                  onPromote={() => handlePromoteSynthesis(card as CanvasSynthesisCard)}
                  onDelete={() => onDeleteCard(card.id)}
                />
              );
            }
            return null;
          })}
        </div>

        {/* Minimap */}
        <Minimap board={board} canvasRef={canvasRef} />

        {/* Add card button (top right, outside canvas) — for adding note cards */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          display: 'flex', gap: 6,
        }}>
          <button
            onClick={() => {
              const center = screenToCanvas(canvasRef.current!.getBoundingClientRect().left + canvasRef.current!.clientWidth / 2, canvasRef.current!.getBoundingClientRect().top + canvasRef.current!.clientHeight / 2);
              // Pick a random note to link
              if (notes.length > 0) {
                const randomNote = notes[Math.floor(Math.random() * notes.length)];
                onAddCard({
                  id: 'cvn_' + Math.random().toString(36).slice(2, 10),
                  type: 'note',
                  noteId: randomNote.id,
                  x: center.x - 85,
                  y: center.y - 45,
                  width: 170,
                } as CanvasNoteCard);
              }
            }}
            style={{
              height: 32, padding: '0 12px',
              background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 5,
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
            }}
          >
            <Plus size={13} /> add note card
          </button>
          <button
            onClick={() => {
              const center = screenToCanvas(canvasRef.current!.getBoundingClientRect().left + canvasRef.current!.clientWidth / 2, canvasRef.current!.getBoundingClientRect().top + canvasRef.current!.clientHeight / 2);
              onAddCard({
                id: 'cvsy_' + Math.random().toString(36).slice(2, 10),
                type: 'synthesis',
                title: 'New synthesis idea',
                subtitle: 'draft idea — not yet a real note',
                x: center.x - 85,
                y: center.y - 40,
              } as CanvasSynthesisCard);
            }}
            style={{
              height: 32, padding: '0 12px',
              background: 'var(--bg2)', color: 'var(--acc2)', border: '1px solid #3d378a', borderRadius: 5,
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
            }}
          >
            <Sparkles size={13} /> synthesis
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Note Card ---------- */

function CanvasNoteCardView({
  card, note, isConnectorSource, onMouseDown, onClick, onDelete,
}: {
  card: CanvasNoteCard;
  note?: Note;
  isConnectorSource: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDelete: () => void;
}) {
  const w = card.width || 170;
  const tagColors = note?.tags[0] ? TAG_COLORS[note.tags[0]] : null;

  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: card.x, top: card.y,
        width: w,
        background: 'var(--bg2)',
        border: '1px solid ' + (isConnectorSource ? 'var(--acc)' : 'var(--bd2)'),
        borderRadius: 7,
        overflow: 'hidden',
        cursor: 'grab',
        transition: 'border 0.12s',
        boxShadow: isConnectorSource ? '0 0 0 2px rgba(124,110,247,0.2)' : 'none',
      }}
      onMouseEnter={(e) => { if (!isConnectorSource) e.currentTarget.style.borderColor = 'var(--acc)'; }}
      onMouseLeave={(e) => { if (!isConnectorSource) e.currentTarget.style.borderColor = 'var(--bd2)'; }}
    >
      {/* Header */}
      <div style={{
        padding: '6px 9px',
        borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <FileText size={10} color="var(--t3)" />
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t3)', fontWeight: 600 }}>note</span>
      </div>
      {/* Body */}
      <div style={{ padding: '8px 9px' }}>
        {tagColors && note?.tags[0] && (
          <div style={{
            display: 'inline-block', fontSize: 8, textTransform: 'uppercase',
            color: tagColors.color, background: tagColors.bg, border: `1px solid ${tagColors.border}`,
            padding: '1px 5px', borderRadius: 2, marginBottom: 4, fontWeight: 600,
          }}>#{note.tags[0]}</div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--t1)', fontWeight: 500, lineHeight: 1.3, marginBottom: 3 }}>
          {note?.title || '(missing note)'}
        </div>
        <div style={{ fontSize: 9, color: 'var(--t3)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note?.subtitle || ''}
        </div>
      </div>
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 18, height: 18, borderRadius: 3,
          background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0,
        }}
        className="sb-cv-card-delete"
      >
        <X size={10} />
      </button>
      <style>{`
        .sb-cv-card-delete { opacity: 0 !important; }
        div:hover > .sb-cv-card-delete { opacity: 0.6 !important; }
        div:hover > .sb-cv-card-delete:hover { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

/* ---------- Sticky Note ---------- */

function CanvasStickyView({
  card, isEditing, isConnectorSource, onMouseDown, onClick, onTextChange, onVariantToggle, onFinishEdit, onDelete,
}: {
  card: CanvasSticky;
  isEditing: boolean;
  isConnectorSource: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onTextChange: (text: string) => void;
  onVariantToggle: () => void;
  onFinishEdit: () => void;
  onDelete: () => void;
}) {
  const w = card.width || 140;
  const isAmber = card.variant === 'amber';

  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={(e) => { e.stopPropagation(); }}
      style={{
        position: 'absolute',
        left: card.x, top: card.y,
        width: w,
        background: isAmber ? 'var(--amb-bg)' : 'var(--bg2)',
        border: '1px solid ' + (isConnectorSource ? 'var(--acc)' : isAmber ? 'var(--amb-bd)' : 'var(--bd2)'),
        borderRadius: 7,
        padding: '10px 11px',
        cursor: 'grab',
        boxShadow: isConnectorSource ? '0 0 0 2px rgba(124,110,247,0.2)' : 'none',
        transition: 'border 0.12s',
      }}
    >
      {isEditing ? (
        <textarea
          autoFocus
          defaultValue={card.text}
          onBlur={(e) => { onTextChange(e.target.value); onFinishEdit(); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { onFinishEdit(); }
            if (e.key === 'Enter' && e.metaKey) { (e.target as HTMLTextAreaElement).blur(); }
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%', minHeight: 50,
            background: 'transparent', border: 'none', outline: 'none', resize: 'none',
            color: isAmber ? 'var(--amb)' : 'var(--t2)',
            fontSize: 11, fontFamily: 'inherit', lineHeight: 1.4,
            caretColor: 'var(--acc2)',
          }}
        />
      ) : (
        <div
          style={{
            fontSize: 11, lineHeight: 1.4,
            color: isAmber ? 'var(--amb)' : 'var(--t2)',
            cursor: 'text',
          }}
          onDoubleClick={(e) => { e.stopPropagation(); }}
        >
          {card.text}
        </div>
      )}
      {/* Variant toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); onVariantToggle(); }}
        style={{
          position: 'absolute', top: 4, right: 22,
          width: 16, height: 16, borderRadius: 3,
          background: isAmber ? 'var(--amb-bg)' : 'var(--bg3)', border: 'none',
          color: isAmber ? 'var(--amb)' : 'var(--t3)', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0,
        }}
        className="sb-cv-sticky-toggle"
        title="Toggle amber/neutral"
      >
        <StickyIcon size={9} />
      </button>
      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 16, height: 16, borderRadius: 3,
          background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0,
        }}
        className="sb-cv-sticky-toggle"
      >
        <X size={10} />
      </button>
      <style>{`
        .sb-cv-sticky-toggle { opacity: 0 !important; }
        div:hover > .sb-cv-sticky-toggle { opacity: 0.6 !important; }
        div:hover > .sb-cv-sticky-toggle:hover { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

/* ---------- Synthesis Card ---------- */

function CanvasSynthesisView({
  card, isConnectorSource, onMouseDown, onClick, onPromote, onDelete,
}: {
  card: CanvasSynthesisCard;
  isConnectorSource: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onPromote: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: card.x, top: card.y,
        width: 170,
        background: 'var(--bg2)',
        border: '1px solid ' + (isConnectorSource ? 'var(--acc)' : 'var(--acc)'),
        borderRadius: 7,
        overflow: 'hidden',
        cursor: 'grab',
        boxShadow: isConnectorSource ? '0 0 0 2px rgba(124,110,247,0.3)' : '0 0 0 1px rgba(124,110,247,0.1)',
      }}
    >
      <div style={{
        padding: '6px 9px',
        borderBottom: '1px solid var(--bd)',
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'var(--acc-bg)',
      }}>
        <Sparkles size={10} color="var(--acc2)" />
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--acc2)', fontWeight: 600 }}>synthesis</span>
      </div>
      <div style={{ padding: '8px 9px' }}>
        <div style={{ fontSize: 10.5, color: 'var(--t1)', fontWeight: 500, lineHeight: 1.3, marginBottom: 3 }}>
          {card.title}
        </div>
        <div style={{ fontSize: 9, color: 'var(--t3)', fontStyle: 'italic' }}>
          {card.subtitle}
        </div>
      </div>
      {/* Promote button */}
      <button
        onClick={(e) => { e.stopPropagation(); onPromote(); }}
        style={{
          width: '100%', padding: '5px 0',
          background: 'transparent', borderTop: '1px solid var(--bd)', border: 'none',
          color: 'var(--acc2)', fontSize: 9, fontFamily: 'inherit', cursor: 'pointer',
          textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
        }}
      >
        promote to note →
      </button>
      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          position: 'absolute', top: 4, right: 4,
          width: 18, height: 18, borderRadius: 3,
          background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0,
        }}
        className="sb-cv-syn-delete"
      >
        <X size={10} />
      </button>
      <style>{`
        .sb-cv-syn-delete { opacity: 0 !important; }
        div:hover > .sb-cv-syn-delete { opacity: 0.6 !important; }
        div:hover > .sb-cv-syn-delete:hover { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

/* ---------- Minimap ---------- */

function Minimap({ board, canvasRef }: { board: CanvasBoard; canvasRef: React.RefObject<HTMLDivElement | null> }) {
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    const update = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      // The viewport in canvas coordinates is:
      // visible canvas x = (-panX) / zoom, visible canvas y = (-panY) / zoom
      // visible width = rect.width / zoom, visible height = rect.height / zoom
      setViewport({
        x: -board.panX / board.zoom,
        y: -board.panY / board.zoom,
        w: rect.width / board.zoom,
        h: rect.height / board.zoom,
      });
    };
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [board.panX, board.panY, board.zoom, canvasRef]);

  // Compute bounding box of all cards + viewport
  const allItems = [
    ...board.cards.map((c) => ({ x: c.x, y: c.y, w: ('width' in c ? c.width : 170) || 170, h: c.type === 'sticky' ? 80 : 80 })),
    { x: viewport.x, y: viewport.y, w: viewport.w, h: viewport.h },
  ];
  if (allItems.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of allItems) {
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + item.w);
    maxY = Math.max(maxY, item.y + item.h);
  }
  const padding = 50;
  minX -= padding; minY -= padding; maxX += padding; maxY += padding;
  const worldW = maxX - minX;
  const worldH = maxY - minY;
  const minimapW = 140;
  const minimapH = 90;
  const scale = Math.min(minimapW / worldW, minimapH / worldH);
  const offsetX = (minimapW - worldW * scale) / 2;
  const offsetY = (minimapH - worldH * scale) / 2;
  const toMinimap = (x: number, y: number) => ({
    x: (x - minX) * scale + offsetX,
    y: (y - minY) * scale + offsetY,
  });

  return (
    <div style={{
      position: 'absolute', bottom: 14, right: 14,
      width: minimapW, height: minimapH,
      background: 'var(--bg1)', border: '1px solid var(--bd2)', borderRadius: 6,
      padding: 4, overflow: 'hidden',
      pointerEvents: 'none',
    }}>
      <svg width={minimapW - 8} height={minimapH - 8} style={{ display: 'block' }}>
        {/* Card dots */}
        {board.cards.map((c) => {
          const p = toMinimap(c.x, c.y);
          const w = ('width' in c ? c.width : 170) * scale;
          const h = (c.type === 'sticky' ? 80 : 80) * scale;
          const fill = c.type === 'synthesis' ? 'var(--acc)' : c.type === 'sticky' ? 'var(--amb)' : '#534AB7';
          return <rect key={c.id} x={p.x} y={p.y} width={Math.max(2, w)} height={Math.max(2, h)} fill={fill} opacity={0.7} rx={1} />;
        })}
        {/* Viewport rect */}
        {viewport.w > 0 && (
          (() => {
            const p = toMinimap(viewport.x, viewport.y);
            const w = viewport.w * scale;
            const h = viewport.h * scale;
            return <rect x={p.x} y={p.y} width={w} height={h} fill="none" stroke="var(--acc2)" strokeWidth={1} opacity={0.8} rx={1} />;
          })()
        )}
      </svg>
    </div>
  );
}
