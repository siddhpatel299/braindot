'use client';

import { X } from 'lucide-react';
import { Folder } from '@/types';
import { plural } from '@/utils/markdown';

export interface NotebookSummary {
  folder: Folder;
  color: string;
  noteCount: number;
}

/**
 * All notebooks, as covers.
 *
 * The restrained version of the reference this came from: no artwork, just the
 * title set on the boards with one band of colour at the head — the same
 * treatment an unjacketed book gets on the reading shelf.
 */
export function NotebookShelf({ notebooks, currentId, onOpen, onCreate, onClose }: {
  notebooks: NotebookSummary[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="All notebooks"
      style={{
        position: 'absolute', inset: 0, zIndex: 80, background: 'var(--bg1)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 8px 0 12px', borderBottom: '1px solid var(--bd)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--t1)' }}>
          All notebooks
        </span>
        <span style={{ fontSize: 10, color: 'var(--t3)', opacity: 0.6 }}>{notebooks.length}</span>
        <button
          onClick={onClose}
          title="Close"
          aria-label="Close all notebooks"
          style={{
            marginLeft: 'auto', width: 22, height: 22, borderRadius: 3, background: 'transparent',
            border: 'none', color: 'var(--t3)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t3)'; }}
        >
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      <div
        className="sb-scroll"
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 12px 20px',
          // minmax(0, …), not 1fr: a bare 1fr floors at min-content, so the
          // widest notebook name would make its column the wider of the two.
          display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '16px 12px', alignContent: 'start',
        }}
      >
        {notebooks.map(({ folder, color, noteCount }) => {
          const current = folder.id === currentId;
          return (
            <button
              key={folder.id}
              onClick={() => onOpen(folder.id)}
              title={`${folder.name} — ${noteCount === 0 ? 'empty' : plural(noteCount, 'note')}`}
              style={{
                display: 'flex', flexDirection: 'column', gap: 7, background: 'transparent',
                border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', color: 'inherit',
              }}
            >
              <span
                className="sb-notebook-cover"
                style={{
                  display: 'flex', flexDirection: 'column', gap: 6, width: '100%', aspectRatio: '2 / 3',
                  padding: '11px 10px', background: 'var(--bg2)', borderTop: `3px solid ${color}`,
                  borderRadius: 2,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.38), 0 8px 20px rgba(0,0,0,0.38)',
                  outline: current ? '1px solid var(--acc-bd)' : 'none', outlineOffset: 2,
                }}
              >
                <span style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 700, color }}>
                  {folder.name}
                </span>
                <span style={{ fontSize: 12, lineHeight: 1.35, color: 'var(--t1)', fontWeight: 600, textWrap: 'pretty' }}>
                  {folder.name}
                </span>
                <span style={{ marginTop: 'auto', fontSize: 9.5, color: 'var(--t3)' }}>
                  {noteCount === 0 ? 'empty' : plural(noteCount, 'note')}
                </span>
              </span>
              <span style={{
                fontSize: 10.5, color: current ? 'var(--t1)' : 'var(--t2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {folder.name}
              </span>
            </button>
          );
        })}

        <button
          onClick={onCreate}
          title="New notebook"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%',
            aspectRatio: '2 / 3', background: 'transparent', border: '1px dashed var(--bd2)',
            borderRadius: 2, color: 'var(--t3)', fontFamily: 'inherit', fontSize: 10.5, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
        >
          + new notebook
        </button>
      </div>
    </div>
  );
}
