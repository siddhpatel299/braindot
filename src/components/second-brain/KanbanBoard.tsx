'use client';

import { useState, useMemo } from 'react';
import { KanbanCardItem, Note } from '@/types';
import { Plus, Link as LinkIcon, X, Pencil } from 'lucide-react';

interface KanbanBoardProps {
  cards: KanbanCardItem[];
  notes?: Note[];
  onAddCard?: (status: KanbanCardItem['status'], title: string) => void;
  onMoveCard?: (cardId: string, newStatus: KanbanCardItem['status']) => void;
  onUpdateCard?: (cardId: string, patch: Partial<KanbanCardItem>) => void;
  onDeleteCard?: (cardId: string) => void;
  onOpenNote?: (id: string) => void;
}

const COLUMNS: { id: KanbanCardItem['status']; label: string; dotColor: string }[] = [
  { id: 'backlog', label: 'Backlog', dotColor: 'var(--t3)' },
  { id: 'in-progress', label: 'In progress', dotColor: '#60a5fa' },
  { id: 'review', label: 'Review', dotColor: 'var(--amb)' },
  { id: 'done', label: 'Done', dotColor: 'var(--grn)' },
];

const TAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  purple: { bg: 'rgba(124,110,247,0.12)', border: 'var(--acc-bd)', text: '#b0a8fb' },
  green: { bg: 'rgba(52,211,153,0.10)', border: 'var(--grn-bd)', text: '#34d399' },
  amber: { bg: 'rgba(251,191,36,0.10)', border: 'var(--amb-bd)', text: '#fbbf24' },
  blue: { bg: 'rgba(96,165,250,0.10)', border: '#1e3a5a', text: '#60a5fa' },
};

export function KanbanBoard({ cards, notes, onAddCard, onMoveCard, onUpdateCard, onDeleteCard, onOpenNote }: KanbanBoardProps) {
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newCardText, setNewCardText] = useState('');
  const [editingCard, setEditingCard] = useState<KanbanCardItem | null>(null);

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    if (notes) for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  const cardsByColumn = useMemo(() => {
    const m: Record<string, KanbanCardItem[]> = { backlog: [], 'in-progress': [], review: [], done: [] };
    for (const c of cards) {
      if (!m[c.status]) m[c.status] = [];
      m[c.status].push(c);
    }
    return m;
  }, [cards]);

  const handleAdd = (status: KanbanCardItem['status']) => {
    if (newCardText.trim()) {
      onAddCard?.(status, newCardText.trim());
      setNewCardText('');
      setAddingIn(null);
    }
  };

  return (
    <>
      <div
        className="sb-scroll"
        style={{
          flex: 1.8,
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          overflowY: 'hidden',
          padding: '14px 16px',
          background: 'var(--bg)',
        }}
      >
        {COLUMNS.map((col) => {
          const colCards = cardsByColumn[col.id] || [];
          const isDragOver = dragOverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(col.id);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                const cardId = e.dataTransfer.getData('text/kanban-card');
                if (cardId && onMoveCard) {
                  onMoveCard(cardId, col.id);
                }
                setDragOverCol(null);
              }}
              style={{
                width: 240,
                minWidth: 240,
                display: 'flex',
                flexDirection: 'column',
                background: isDragOver ? 'var(--acc-bg)' : 'var(--bg1)',
                border: '1px solid ' + (isDragOver ? 'var(--acc)' : 'var(--bd)'),
                borderRadius: 6,
                overflow: 'hidden',
                transition: 'background 0.12s, border 0.12s',
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--bd)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                flexShrink: 0,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: col.dotColor, flexShrink: 0 }} />
                <span style={{
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.09em',
                  color: 'var(--t2)', fontWeight: 600, flex: 1,
                }}>{col.label}</span>
                <span style={{
                  fontSize: 10, background: 'var(--bg3)', color: 'var(--t3)',
                  padding: '1px 6px', borderRadius: 3, minWidth: 18, textAlign: 'center',
                }}>{colCards.length}</span>
              </div>

              {/* Cards */}
              <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {colCards.map((card) => {
                  const linkedNote = card.linkedNoteId ? noteById.get(card.linkedNoteId) : null;
                  const backlinkCount = linkedNote?.backlinks.length || 0;
                  const tagColors = card.tag ? TAG_COLORS[card.tag.color] : null;
                  return (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/kanban-card', card.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={() => setEditingCard(card)}
                      style={{
                        background: 'var(--bg2)',
                        border: '1px solid var(--bd)',
                        borderRadius: 6,
                        padding: '10px 11px',
                        marginBottom: 8,
                        cursor: 'pointer',
                        transition: 'border 0.12s, background 0.12s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--bd2)';
                        e.currentTarget.style.background = 'var(--bg3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--bd)';
                        e.currentTarget.style.background = 'var(--bg2)';
                      }}
                    >
                      {card.tag && tagColors && (
                        <div style={{
                          display: 'inline-block', fontSize: 9, textTransform: 'uppercase',
                          letterSpacing: '0.06em', color: tagColors.text, background: tagColors.bg,
                          border: `1px solid ${tagColors.border}`, padding: '1px 6px', borderRadius: 3,
                          marginBottom: 6, fontWeight: 600,
                        }}>{card.tag.label}</div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--t1)', lineHeight: 1.4, marginBottom: 6 }}>
                        {card.title}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                        {linkedNote && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenNote?.(linkedNote.id); }}
                            style={{
                              background: 'var(--bg3)', border: '1px solid var(--bd)', borderRadius: 3,
                              padding: '1px 6px', color: 'var(--acc2)', fontSize: 10, fontFamily: 'inherit',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3,
                            }}
                          >
                            <LinkIcon size={9} />
                            {backlinkCount}
                          </button>
                        )}
                        {card.dueDate && (
                          <span style={{ color: 'var(--t3)' }}>{card.dueDate}</span>
                        )}
                        <div style={{ flex: 1 }} />
                        <span style={{ color: 'var(--t3)', opacity: 0.5, fontSize: 9 }}>
                          <Pencil size={9} />
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Add card input or button */}
                {addingIn === col.id ? (
                  <div style={{
                    background: 'var(--bg2)', border: '1px solid var(--acc)', borderRadius: 6, padding: '8px 10px',
                  }}>
                    <textarea
                      autoFocus
                      value={newCardText}
                      onChange={(e) => setNewCardText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(col.id); }
                        if (e.key === 'Escape') { setAddingIn(null); setNewCardText(''); }
                      }}
                      onBlur={() => { if (newCardText.trim()) handleAdd(col.id); else { setAddingIn(null); setNewCardText(''); } }}
                      placeholder="card title…"
                      rows={2}
                      style={{
                        width: '100%', background: 'transparent', border: 'none', outline: 'none',
                        color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', resize: 'none', caretColor: 'var(--acc2)',
                      }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingIn(col.id); setNewCardText(''); }}
                    style={{
                      width: '100%', background: 'transparent', border: '1px dashed var(--bd2)', borderRadius: 4,
                      padding: '8px 10px', color: 'var(--t3)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                      textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5, fontStyle: 'italic',
                    }}
                  >
                    <Plus size={12} /> add card
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Card edit modal */}
      {editingCard && onUpdateCard && (
        <CardEditModal
          card={editingCard}
          notes={notes || []}
          onUpdate={(patch) => {
            onUpdateCard(editingCard.id, patch);
            setEditingCard({ ...editingCard, ...patch });
          }}
          onDelete={() => { onDeleteCard?.(editingCard.id); setEditingCard(null); }}
          onClose={() => setEditingCard(null)}
          onOpenNote={(id) => { onOpenNote?.(id); setEditingCard(null); }}
        />
      )}
    </>
  );
}

/* ---------- Card Edit Modal ---------- */

function CardEditModal({
  card, notes, onUpdate, onDelete, onClose, onOpenNote,
}: {
  card: KanbanCardItem;
  notes: Note[];
  onUpdate: (patch: Partial<KanbanCardItem>) => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenNote: (id: string) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [tagLabel, setTagLabel] = useState(card.tag?.label || '');
  const [tagColor, setTagColor] = useState<KanbanCardItem['tag'] extends { color: infer C } ? C : never>(card.tag?.color || 'purple');
  const [dueDate, setDueDate] = useState(card.dueDate || '');
  const [linkedNoteId, setLinkedNoteId] = useState(card.linkedNoteId || '');

  const handleSave = () => {
    const patch: Partial<KanbanCardItem> = {
      title: title.trim() || 'Untitled',
      dueDate: dueDate || undefined,
      linkedNoteId: linkedNoteId || undefined,
    };
    if (tagLabel.trim()) {
      patch.tag = { label: tagLabel.trim(), color: tagColor as 'purple' | 'green' | 'amber' | 'blue' };
    } else {
      patch.tag = undefined;
    }
    onUpdate(patch);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: '90vw', background: 'var(--bg2)', border: '1px solid var(--bd2)',
          borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--bd)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>edit card</span>
          <button onClick={onClose} style={{
            width: 24, height: 24, borderRadius: 3, background: 'transparent', border: 'none',
            color: 'var(--t3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><X size={14} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 5, display: 'block' }}>title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4,
                padding: '8px 10px', color: 'var(--t1)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
                caretColor: 'var(--acc2)',
              }}
            />
          </div>

          {/* Tag */}
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 5, display: 'block' }}>tag</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={tagLabel}
                onChange={(e) => setTagLabel(e.target.value)}
                placeholder="tag label…"
                style={{
                  flex: 1, background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4,
                  padding: '8px 10px', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                  caretColor: 'var(--acc2)',
                }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {(['purple', 'green', 'amber', 'blue'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setTagColor(c as never)}
                    style={{
                      width: 28, height: 28, borderRadius: 4,
                      background: TAG_COLORS[c].bg, border: '2px solid ' + (tagColor === c ? TAG_COLORS[c].border : 'transparent'),
                      cursor: 'pointer', padding: 0, transition: 'border 0.1s',
                    }}
                    title={c}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 5, display: 'block' }}>due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4,
                padding: '8px 10px', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>

          {/* Link note */}
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 5, display: 'block' }}>link to note</label>
            <select
              value={linkedNoteId}
              onChange={(e) => setLinkedNoteId(e.target.value)}
              style={{
                width: '100%', background: 'var(--bg3)', border: '1px solid var(--bd2)', borderRadius: 4,
                padding: '8px 10px', color: 'var(--t1)', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                colorScheme: 'dark',
              }}
            >
              <option value="">— none —</option>
              {notes.map((n) => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
            {linkedNoteId && (
              <button
                onClick={() => onOpenNote(linkedNoteId)}
                style={{
                  marginTop: 6, background: 'transparent', border: 'none', color: 'var(--acc2)',
                  fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <LinkIcon size={11} /> open linked note
              </button>
            )}
          </div>

          {/* Status */}
          <div>
            <label style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t3)', fontWeight: 600, marginBottom: 5, display: 'block' }}>status</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {COLUMNS.map((col) => (
                <button
                  key={col.id}
                  onClick={() => onUpdate({ status: col.id })}
                  style={{
                    flex: 1, padding: '6px 8px', borderRadius: 4,
                    background: card.status === col.id ? 'var(--acc-bg)' : 'var(--bg3)',
                    border: '1px solid ' + (card.status === col.id ? 'var(--acc-bd)' : 'var(--bd2)'),
                    color: card.status === col.id ? 'var(--acc2)' : 'var(--t3)',
                    fontSize: 10, fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase',
                    letterSpacing: '0.04em', fontWeight: 600,
                  }}
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--bd)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={() => { if (confirm('Delete this card?')) { onDelete(); } }}
            style={{
              background: 'transparent', border: '1px solid var(--red)', borderRadius: 4,
              padding: '7px 12px', color: 'var(--red)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
            }}
          >
            <X size={12} /> delete
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: '1px solid var(--bd2)', borderRadius: 4,
                padding: '7px 14px', color: 'var(--t2)', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >cancel</button>
            <button
              onClick={handleSave}
              style={{
                background: 'var(--acc)', border: 'none', borderRadius: 4,
                padding: '7px 14px', color: '#fff', fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                fontWeight: 600,
              }}
            >save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
