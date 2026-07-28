'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Network, CheckSquare, KanbanSquare, AlertCircle } from 'lucide-react';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  action: () => void;
}

interface SlashMenuProps {
  open: boolean;
  position: { x: number; y: number } | null;
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function SlashMenu({ open, position, commands, onSelect, onClose }: SlashMenuProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setQuery('');
      setSelected(0);
      /* eslint-enable react-hooks/set-state-in-effect */
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(0);
  }, [query]);

  useEffect(() => {
    const child = listRef.current?.children[selected] as HTMLElement | undefined;
    if (child) child.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open || !position) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selected];
      if (cmd) onSelect(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 300,
      }}
      onKeyDown={handleKeyDown}
    >
      <div style={{
        width: 280,
        background: 'var(--bg2)',
        border: '1px solid var(--bd2)',
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
      }}>
        {/* Search input */}
        <div style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--bd)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span style={{ color: 'var(--t3)', fontSize: 12 }}>/</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="insert embed…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--t1)',
              fontSize: 12,
              fontFamily: 'inherit',
              caretColor: 'var(--acc2)',
            }}
          />
        </div>
        {/* Command list */}
        <div ref={listRef} className="sb-scroll" style={{ maxHeight: 220, overflowY: 'auto', padding: 4 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '14px', fontSize: 11, color: 'var(--t3)', textAlign: 'center', fontStyle: 'italic' }}>
              no matches for "{query}"
            </div>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              const isSelected = i === selected;
              return (
                <div
                  key={cmd.id}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => onSelect(cmd)}
                  style={{
                    padding: '7px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    background: isSelected ? 'var(--acc-bg)' : 'transparent',
                    border: isSelected ? '1px solid var(--acc-bd)' : '1px solid transparent',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={14} strokeWidth={1.75} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: isSelected ? 'var(--t1)' : 'var(--t2)', fontWeight: 500 }}>
                      /{cmd.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                      {cmd.description}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// Default slash commands factory
export function createSlashCommands(
  onInsertMindMap: () => void,
  onInsertTodo: () => void,
  onInsertKanban: () => void,
): SlashCommand[] {
  return [
    {
      id: 'mindmap',
      label: 'mindmap',
      description: 'embed an interactive mind map',
      icon: Network,
      action: onInsertMindMap,
    },
    {
      id: 'todo',
      label: 'todo',
      description: 'embed a lightweight checklist',
      icon: CheckSquare,
      action: onInsertTodo,
    },
    {
      id: 'kanban',
      label: 'kanban',
      description: 'embed a kanban board preview',
      icon: KanbanSquare,
      action: onInsertKanban,
    },
  ];
}
