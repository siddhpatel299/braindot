'use client';

import { useState, useMemo } from 'react';
import { TodoItem, Note } from '@/types';
import { Check, Plus, Link as LinkIcon, X, Calendar, Flag } from 'lucide-react';

interface TodoListProps {
  todos: TodoItem[];
  compact: boolean;
  notes?: Note[];
  onToggle?: (id: string) => void;
  onAdd?: (text: string, priority: TodoItem['priority'], dueGroup: TodoItem['dueGroup']) => void;
  onUpdate?: (id: string, patch: Partial<TodoItem>) => void;
  onDelete?: (id: string) => void;
  onOpenNote?: (id: string) => void;
}

const PRIORITY_COLORS: Record<TodoItem['priority'], string> = {
  urgent: 'var(--red)',
  high: 'var(--amb)',
  medium: 'var(--acc2)',
  low: 'var(--t3)',
};

const PRIORITY_LABELS: Record<TodoItem['priority'], string> = {
  urgent: 'urgent',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

const DUE_GROUP_LABELS: Record<TodoItem['dueGroup'], string> = {
  overdue: 'overdue',
  today: 'today',
  'this-week': 'this week',
};

export function TodoList({ todos, compact, notes, onToggle, onAdd, onUpdate, onDelete, onOpenNote }: TodoListProps) {
  const [addingText, setAddingText] = useState('');
  const [addingPriority, setAddingPriority] = useState<TodoItem['priority']>('medium');
  const [addingDueGroup, setAddingDueGroup] = useState<TodoItem['dueGroup']>('today');
  const [isAdding, setIsAdding] = useState(false);
  const [tabFilter, setTabFilter] = useState<'all' | 'linked' | 'unlinked'>('all');

  const noteById = useMemo(() => {
    const m = new Map<string, Note>();
    if (notes) for (const n of notes) m.set(n.id, n);
    return m;
  }, [notes]);

  // Filter by tab (only in full mode)
  const filteredTodos = useMemo(() => {
    if (compact) return todos;
    return todos.filter((t) => {
      if (tabFilter === 'linked') return !!t.linkedNoteId;
      if (tabFilter === 'unlinked') return !t.linkedNoteId;
      return true;
    });
  }, [todos, compact, tabFilter]);

  // Group by dueGroup
  const grouped = useMemo(() => {
    const groups: Record<string, TodoItem[]> = { overdue: [], today: [], 'this-week': [] };
    for (const t of filteredTodos) {
      if (!groups[t.dueGroup]) groups[t.dueGroup] = [];
      groups[t.dueGroup].push(t);
    }
    return groups;
  }, [filteredTodos]);

  const handleAdd = () => {
    if (addingText.trim() && onAdd) {
      onAdd(addingText.trim(), addingPriority, addingDueGroup);
      setAddingText('');
      setAddingPriority('medium');
      setAddingDueGroup('today');
      setIsAdding(false);
    }
  };

  const checkboxSize = compact ? 13 : 16;
  const rowPadding = compact ? 6 : 11;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Add todo input */}
      <div style={{ padding: compact ? '0 0 8px' : '0 0 12px' }}>
        {isAdding ? (
          <div style={{
            background: 'var(--bg3)',
            border: '1px solid var(--acc)',
            borderRadius: 4,
            padding: compact ? '6px 8px' : '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <input
              autoFocus
              value={addingText}
              onChange={(e) => setAddingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setIsAdding(false); setAddingText(''); }
              }}
              placeholder="what needs to be done?"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--t1)',
                fontSize: compact ? 12 : 13,
                fontFamily: 'inherit',
                caretColor: 'var(--acc2)',
              }}
            />
            {/* Priority + due group selectors */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Flag size={10} color="var(--t3)" />
              <select
                value={addingPriority}
                onChange={(e) => setAddingPriority(e.target.value as TodoItem['priority'])}
                style={{
                  background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 3,
                  padding: '2px 6px', color: 'var(--t2)', fontSize: 10, fontFamily: 'inherit',
                  outline: 'none', colorScheme: 'dark',
                }}
              >
                <option value="urgent">urgent</option>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
              <Calendar size={10} color="var(--t3)" />
              <select
                value={addingDueGroup}
                onChange={(e) => setAddingDueGroup(e.target.value as TodoItem['dueGroup'])}
                style={{
                  background: 'var(--bg2)', border: '1px solid var(--bd2)', borderRadius: 3,
                  padding: '2px 6px', color: 'var(--t2)', fontSize: 10, fontFamily: 'inherit',
                  outline: 'none', colorScheme: 'dark',
                }}
              >
                <option value="overdue">overdue</option>
                <option value="today">today</option>
                <option value="this-week">this week</option>
              </select>
              <div style={{ flex: 1 }} />
              <button
                onClick={handleAdd}
                style={{
                  background: 'var(--acc)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  padding: '3px 10px',
                  fontSize: 10,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                add
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px dashed var(--bd2)',
              borderRadius: 4,
              padding: compact ? '5px 8px' : '7px 10px',
              color: 'var(--t3)',
              fontSize: compact ? 11 : 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontStyle: 'italic',
            }}
          >
            <Plus size={12} />
            add a todo
          </button>
        )}
      </div>

      {/* Tab filters (full mode only) */}
      {!compact && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['all', 'linked', 'unlinked'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTabFilter(t)}
              style={{
                background: tabFilter === t ? 'var(--acc-bg)' : 'transparent',
                border: '1px solid ' + (tabFilter === t ? '#3d378a' : 'var(--bd2)'),
                borderRadius: 3,
                padding: '3px 8px',
                color: tabFilter === t ? 'var(--acc2)' : 'var(--t3)',
                fontSize: 10,
                fontFamily: 'inherit',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                fontWeight: 600,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Todo list grouped by dueGroup */}
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto' }}>
        {(['overdue', 'today', 'this-week'] as const).map((group) => {
          const items = grouped[group] || [];
          if (items.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                color: group === 'overdue' ? 'var(--red)' : 'var(--t3)',
                fontWeight: 600,
                marginBottom: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                {DUE_GROUP_LABELS[group]}
                <span style={{ opacity: 0.5 }}>{items.length}</span>
              </div>
              {items.map((todo) => {
                const linkedNote = todo.linkedNoteId ? noteById.get(todo.linkedNoteId) : null;
                const backlinkCount = linkedNote?.backlinks.length || 0;
                return (
                  <div
                    key={todo.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: `${rowPadding}px 4px`,
                      borderBottom: '1px solid var(--bd)',
                    }}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => onToggle?.(todo.id)}
                      style={{
                        width: checkboxSize,
                        height: checkboxSize,
                        borderRadius: 3,
                        background: todo.done ? 'var(--grn)' : 'transparent',
                        border: `1.5px solid ${todo.done ? 'var(--grn)' : 'var(--bd2)'}`,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 2,
                        padding: 0,
                      }}
                    >
                      {todo.done && <Check size={checkboxSize - 4} color="#0c0c0e" strokeWidth={3} />}
                    </button>

                    {/* Priority dot */}
                    <div style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: PRIORITY_COLORS[todo.priority],
                      marginTop: compact ? 5 : 7,
                      flexShrink: 0,
                      title: PRIORITY_LABELS[todo.priority],
                    } as React.CSSProperties} />

                    {/* Text + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: compact ? 12 : 13,
                        color: todo.done ? 'var(--t3)' : 'var(--t1)',
                        textDecoration: todo.done ? 'line-through' : 'none',
                        lineHeight: 1.4,
                        wordBreak: 'break-word',
                      }}>
                        {todo.text}
                      </div>
                      {/* Footer row: due date + link badge (full mode only) */}
                      {!compact && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 3,
                          fontSize: 10,
                          color: 'var(--t3)',
                        }}>
                          {todo.dueDate && (
                            <span>{todo.dueDate}</span>
                          )}
                          {linkedNote && (
                            <button
                              onClick={() => onOpenNote?.(linkedNote.id)}
                              style={{
                                background: 'var(--bg3)',
                                border: '1px solid var(--bd2)',
                                borderRadius: 3,
                                padding: '1px 6px',
                                color: 'var(--acc2)',
                                fontSize: 10,
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                            >
                              <LinkIcon size={9} />
                              linked
                              {backlinkCount > 0 && <span style={{ color: 'var(--t3)' }}>· {backlinkCount}</span>}
                            </button>
                          )}
                        </div>
                      )}
                      {/* Compact mode: link badge icon only */}
                      {compact && linkedNote && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onOpenNote?.(linkedNote.id); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--acc2)',
                            cursor: 'pointer',
                            padding: 0,
                            marginTop: 2,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            fontFamily: 'inherit',
                          }}
                        >
                          <LinkIcon size={10} />
                          {backlinkCount > 0 && <span style={{ color: 'var(--t3)' }}>{backlinkCount}</span>}
                        </button>
                      )}
                    </div>

                    {/* Delete button */}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(todo.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--t3)',
                          cursor: 'pointer',
                          padding: 2,
                          opacity: 0,
                          flexShrink: 0,
                        }}
                        className="sb-todo-delete"
                      >
                        <X size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {filteredTodos.length === 0 && (
          <div style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: 'var(--t3)',
            fontStyle: 'italic',
            fontSize: 12,
          }}>
            no todos {tabFilter !== 'all' ? `in "${tabFilter}" filter` : 'yet'}
          </div>
        )}
      </div>

      <style>{`
        .sb-todo-delete { opacity: 0 !important; transition: opacity 0.1s; }
        div:hover > .sb-todo-delete { opacity: 0.5 !important; }
        div:hover > .sb-todo-delete:hover { opacity: 1 !important; }
      `}</style>
    </div>
  );
}
