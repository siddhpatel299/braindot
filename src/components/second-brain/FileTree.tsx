'use client';

import { useState, useMemo } from 'react';
import { FileText, Plus, Pin } from 'lucide-react';
import { Note, COLLECTION_ORDER, COLLECTION_LABELS, NoteCollection } from '@/types';

interface FileTreeProps {
  notes: Note[];
  activeId: string;
  filter: string;
  onSelect: (id: string) => void;
  onCreate: (collection: NoteCollection) => void;
}

export function FileTree({ notes, activeId, filter, onSelect, onCreate }: FileTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<NoteCollection>>(new Set());

  const filteredNotes = useMemo(() => {
    if (!filter.trim()) return notes;
    const f = filter.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(f) ||
        n.filename.toLowerCase().includes(f) ||
        n.tags.some((t) => t.toLowerCase().includes(f)),
    );
  }, [notes, filter]);

  const byCollection = useMemo(() => {
    const m: Record<NoteCollection, Note[]> = {
      pinned: [],
      strategy: [],
      learning: [],
      reading: [],
      research: [],
    };
    for (const n of filteredNotes) m[n.collection].push(n);
    // sort: evergreen first, then by updatedAt desc
    for (const c of COLLECTION_ORDER) {
      m[c].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'evergreen' ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }
    return m;
  }, [filteredNotes]);

  const toggleCollapse = (c: NoteCollection) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  return (
    <div
      style={{
        width: 200,
        minWidth: 200,
        height: '100%',
        background: 'var(--bg1)',
        borderRight: '1px solid var(--bd)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 34,
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--bd)',
        }}
      >
        <span
          style={{
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: 'var(--t3)',
            fontWeight: 600,
          }}
        >
          Notes
        </span>
        <button
          onClick={() => onCreate('learning')}
          title="New note"
          style={{
            width: 22,
            height: 22,
            borderRadius: 3,
            background: 'transparent',
            border: 'none',
            color: 'var(--t2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg2)';
            e.currentTarget.style.color = 'var(--t1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--t2)';
          }}
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>

      {/* List */}
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {COLLECTION_ORDER.map((c) => {
          const items = byCollection[c];
          if (items.length === 0 && filter.trim()) return null;
          const isCollapsed = collapsed.has(c);
          return (
            <div key={c} style={{ marginBottom: 4 }}>
              <button
                onClick={() => toggleCollapse(c)}
                style={{
                  width: '100%',
                  padding: '6px 12px 4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: 'var(--t3)',
                }}
              >
                <span style={{ fontSize: 8, opacity: 0.7 }}>{isCollapsed ? '▸' : '▾'}</span>
                <span
                  style={{
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '0.09em',
                    fontWeight: 600,
                  }}
                >
                  {COLLECTION_LABELS[c]}
                </span>
                <span style={{ fontSize: 9, color: 'var(--t3)', opacity: 0.6 }}>
                  {items.length}
                </span>
              </button>
              {!isCollapsed &&
                items.map((n) => {
                  const isActive = n.id === activeId;
                  return (
                    <div
                      key={n.id}
                      className="sb-note-row"
                      onClick={() => onSelect(n.id)}
                      style={{
                        height: 26,
                        padding: '0 10px 0 22px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: isActive ? 'var(--acc-bg)' : 'transparent',
                        color: isActive ? 'var(--acc2)' : 'var(--t2)',
                        borderLeft: isActive ? '2px solid var(--acc)' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.1s, color 0.1s',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'var(--bg2)';
                          e.currentTarget.style.color = 'var(--t1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--t2)';
                        }
                      }}
                    >
                      {c === 'pinned' ? (
                        <Pin size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
                      ) : (
                        <FileText size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {n.title}
                      </span>
                      <span
                        style={{
                          fontSize: 9,
                          background: 'var(--bg3)',
                          color: 'var(--t3)',
                          padding: '1px 5px',
                          borderRadius: 3,
                          minWidth: 16,
                          textAlign: 'center',
                        }}
                      >
                        {n.backlinks.length}
                      </span>
                    </div>
                  );
                })}
            </div>
          );
        })}
        {filteredNotes.length === 0 && (
          <div
            style={{
              padding: '20px 12px',
              fontSize: 10,
              color: 'var(--t3)',
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            no notes match
            <br />
            "{filter}"
          </div>
        )}
      </div>
    </div>
  );
}
