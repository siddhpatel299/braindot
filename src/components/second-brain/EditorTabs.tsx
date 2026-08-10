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

/**
 * Open notes, as flat labels rather than skeuomorphic browser tabs.
 *
 * The tabs sit inside the editor bar now, so they carry no chrome of their
 * own: the active note is the one written in full-strength ink with a mark
 * under it. Titles, not filenames — the filename is a storage detail.
 */
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
      className="sb-scroll-thin"
      role="tablist"
      aria-label="Open notes"
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'stretch',
        gap: 2,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      {tabNotes.map((n) => {
        const isActive = n.id === activeTab;
        const isDirty = dirtyIds.has(n.id);
        const isDragOver = dragOver === n.id;
        return (
          <div
            key={n.id}
            draggable
            onDragStart={() => { dragFrom.current = n.id; }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragFrom.current && dragFrom.current !== n.id) setDragOver(n.id);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => {
              if (dragFrom.current && dragFrom.current !== n.id) onReorder(dragFrom.current, n.id);
              dragFrom.current = null;
              setDragOver(null);
            }}
            onClick={() => onSelect(n.id)}
            // A tab has to be reachable without a mouse. It stays a div
            // because it is also a drag handle, so the role and the key
            // handling are supplied by hand.
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(n.id);
              }
            }}
            title={n.filename}
            style={{
              minWidth: 96,
              maxWidth: 190,
              padding: '0 6px 0 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
              color: isActive ? 'var(--t1)' : 'var(--t3)',
              boxShadow: isActive ? 'inset 0 -2px 0 var(--acc)' : 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'inherit',
              opacity: isDragOver ? 0.5 : 1,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--t2)'; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--t3)'; }}
          >
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {n.title || 'Untitled note'}
            </span>
            {/* Unsaved work is the one thing a tab must never hide, so the dot
                holds its place and the close button appears beside it. */}
            {isDirty && (
              <span
                title="Unsaved changes"
                style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amb)', flexShrink: 0 }}
              />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(n.id); }}
              title={`Close ${n.title}`}
              aria-label={`Close ${n.title}`}
              className="sb-tab-close"
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: 'transparent',
                border: 'none',
                color: 'var(--t2)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={11} strokeWidth={2.25} />
            </button>
          </div>
        );
      })}

      <button
        onClick={onCreate}
        title="New note  ⌘T"
        aria-label="New note"
        style={{
          width: 24,
          alignSelf: 'center',
          height: 24,
          background: 'transparent',
          border: 'none',
          color: 'var(--t3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.background = 'var(--bg3)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'transparent'; }}
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
