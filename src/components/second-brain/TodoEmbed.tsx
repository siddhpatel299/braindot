'use client';

import { TodoEmbedBlock, TodoItem, Note } from '@/types';
import { CheckSquare, X, Plus, Check } from 'lucide-react';

interface TodoEmbedProps {
  block: TodoEmbedBlock;
  onUpdate: (block: TodoEmbedBlock) => void;
  onRemove: () => void;
  onOpenNote?: (id: string) => void;
  notes?: Note[];
}

export function TodoEmbed({ block, onUpdate, onRemove, onOpenNote, notes }: TodoEmbedProps) {
  const handleToggle = (itemId: string) => {
    onUpdate({
      ...block,
      items: block.items.map((t) => (t.id === itemId ? { ...t, done: !t.done } : t)),
    });
  };

  const handleAdd = () => {
    const newItem: TodoItem = {
      id: 'ti_' + Math.random().toString(36).slice(2, 8),
      text: 'New task',
      done: false,
      priority: 'medium',
      dueGroup: 'today',
    };
    onUpdate({ ...block, items: [...block.items, newItem] });
  };

  const handleDelete = (itemId: string) => {
    onUpdate({ ...block, items: block.items.filter((t) => t.id !== itemId) });
  };

  const handleRename = (itemId: string, text: string) => {
    onUpdate({
      ...block,
      items: block.items.map((t) => (t.id === itemId ? { ...t, text } : t)),
    });
  };

  const PRIORITY_DOT: Record<TodoItem['priority'], string> = {
    urgent: 'var(--red)',
    high: 'var(--amb)',
    medium: 'var(--acc2)',
    low: 'var(--t3)',
  };

  return (
    <div style={{
      border: '1px solid var(--bd2)',
      borderRadius: 8,
      overflow: 'hidden',
      margin: '16px 0',
      background: 'var(--bg)',
    }}>
      {/* Header */}
      <div style={{
        height: 32,
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckSquare size={12} color="var(--t3)" />
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--t3)',
            fontWeight: 600,
          }}>
            todo list — embedded
          </span>
        </div>
        <button
          onClick={onRemove}
          title="Remove"
          style={{
            width: 22, height: 22, borderRadius: 3,
            background: 'transparent', border: 'none',
            color: 'var(--t3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Checklist body */}
      <div style={{ padding: '10px 14px' }}>
        {block.items.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 0',
              borderBottom: '1px solid var(--bd)',
            }}
          >
            <button
              onClick={() => handleToggle(item.id)}
              style={{
                width: 13,
                height: 13,
                borderRadius: 3,
                background: item.done ? 'var(--grn)' : 'transparent',
                border: `1.5px solid ${item.done ? 'var(--grn)' : 'var(--bd2)'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                padding: 0,
              }}
            >
              {item.done && <Check size={9} color="#0c0c0e" strokeWidth={3} />}
            </button>
            <div style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: PRIORITY_DOT[item.priority],
              flexShrink: 0,
            }} />
            <input
              value={item.text}
              onChange={(e) => handleRename(item.id, e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: item.done ? 'var(--t3)' : 'var(--t1)',
                fontSize: 12,
                fontFamily: 'inherit',
                textDecoration: item.done ? 'line-through' : 'none',
                caretColor: 'var(--acc2)',
              }}
            />
            <button
              onClick={() => handleDelete(item.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--t3)',
                cursor: 'pointer',
                padding: 0,
                opacity: 0.4,
              }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
        {/* Add item */}
        <button
          onClick={handleAdd}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            padding: '6px 0 2px',
            color: 'var(--t3)',
            fontSize: 11,
            fontFamily: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontStyle: 'italic',
          }}
        >
          <Plus size={12} />
          add item
        </button>
      </div>
    </div>
  );
}
