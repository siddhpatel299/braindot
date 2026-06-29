'use client';

import { useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Note } from '@/types';

interface EditorTabsProps {
  notes: Note[];
  openTabs: string[];
  activeTab: string;
  dirtyIds: Set<string>;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
  onReorder: (fromId: string, toId: string) => void;
}

export function EditorTabs({
  notes,
  openTabs,
  activeTab,
  dirtyIds,
  onSelect,
  onClose,
  onCreate,
  onReorder,
}: EditorTabsProps) {
  const dragFrom = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const tabNotes = openTabs
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => Boolean(n));

  return (
    <div
      style={{
        height: 34,
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '0 6px 0 0',
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
      className="sb-scroll-thin"
    >
      {tabNotes.map((n) => {
        const isActive = n.id === activeTab;
        const isDirty = dirtyIds.has(n.id);
        const isDragOver = dragOver === n.id;
        return (
          <div
            key={n.id}
            draggable
            onDragStart={() => {
              dragFrom.current = n.id;
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragFrom.current && dragFrom.current !== n.id) {
                setDragOver(n.id);
              }
            }}
            onDragLeave={() => {
              setDragOver(null);
            }}
            onDrop={() => {
              if (dragFrom.current && dragFrom.current !== n.id) {
                onReorder(dragFrom.current, n.id);
              }
              dragFrom.current = null;
              setDragOver(null);
            }}
            onClick={() => onSelect(n.id)}
            style={{
              height: 28,
              minWidth: 140,
              maxWidth: 220,
              padding: '0 8px 0 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: isActive ? 'var(--bg)' : 'transparent',
              color: isActive ? 'var(--t1)' : 'var(--t3)',
              borderBottom: isActive ? '2px solid var(--acc)' : '2px solid transparent',
              borderTop: isActive ? '1px solid var(--bd)' : '1px solid transparent',
              borderLeft: isActive ? '1px solid var(--bd)' : '1px solid transparent',
              borderRight: isActive ? '1px solid var(--bd)' : '1px solid transparent',
              marginBottom: isActive ? -1 : 0,
              marginRight: 2,
              borderRadius: '4px 4px 0 0',
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'inherit',
              position: 'relative',
              opacity: isDragOver ? 0.6 : 1,
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--bg2)';
                e.currentTarget.style.color = 'var(--t2)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--t3)';
              }
            }}
          >
            {isDirty && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--amb)',
                  flexShrink: 0,
                  boxShadow: '0 0 6px rgba(251,191,36,0.4)',
                }}
              />
            )}
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {n.filename}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(n.id);
              }}
              title="Close tab"
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: 'transparent',
                border: 'none',
                color: 'var(--t3)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity 0.1s',
              }}
              className="sb-tab-close"
            >
              <X size={11} strokeWidth={2} />
            </button>
          </div>
        );
      })}

      {/* New tab button */}
      <button
        onClick={onCreate}
        title="New tab (⌘T)"
        style={{
          width: 28,
          height: 28,
          background: 'transparent',
          border: 'none',
          color: 'var(--t3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 0,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--t1)';
          e.currentTarget.style.background = 'var(--bg2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--t3)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
