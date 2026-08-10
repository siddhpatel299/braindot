'use client';

import { useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Note, TAG_COLORS } from '@/types';

interface TagEditorProps {
  tags: string[];
  /** Every note in the vault — the source of the suggestion list. */
  allNotes: Note[];
  onChange: (tags: string[]) => void;
}

/** Known tags keep their colour; anything the writer invents gets a neutral
 *  chip rather than borrowing an unrelated tag's meaning. */
function chipColors(tag: string) {
  return TAG_COLORS[tag] || { color: 'var(--t2)', bg: 'var(--bg2)', border: 'var(--bd2)' };
}

/** A tag is one word — spaces and "#" would break [[link]] and search parsing. */
function normalize(raw: string): string {
  return raw.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');
}

/**
 * Tags, editable where they are shown.
 *
 * They used to render as read-only chips with no way to add one — the vault
 * had tags, a tag view and tag colours, and no interface for putting a tag on
 * a note. This is that interface, in the note header where the tags already
 * live rather than buried in a settings surface.
 */
export function TagEditor({ tags, allNotes, onChange }: TagEditorProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Suggest tags already used elsewhere, so a vault does not drift into
  // "reading", "read" and "readings" meaning the same thing.
  const suggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of allNotes) {
      for (const t of n.tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const q = normalize(draft);
    return [...counts.entries()]
      .filter(([t]) => !tags.includes(t) && (!q || t.includes(q)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t);
  }, [allNotes, tags, draft]);

  const commit = (raw: string) => {
    const tag = normalize(raw);
    if (tag && !tags.includes(tag)) onChange([...tags, tag]);
    setDraft('');
    setAdding(false);
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <>
      {tags.map((t) => {
        const c = chipColors(t);
        return (
          <span
            key={t}
            className="sb-tag-chip"
            style={{
              fontSize: 11,
              color: c.color,
              background: c.bg,
              border: `1px solid ${c.border}`,
              padding: '3px 4px 3px 8px',
              borderRadius: 3,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            #{t}
            <button
              onClick={() => remove(t)}
              title={`Remove #${t}`}
              aria-label={`Remove tag ${t}`}
              className="sb-tag-x"
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        );
      })}

      {adding ? (
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <input
            ref={inputRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit(suggestions.length === 1 && !normalize(draft) ? suggestions[0] : draft);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft('');
                setAdding(false);
              } else if (e.key === 'Backspace' && !draft && tags.length) {
                remove(tags[tags.length - 1]);
              }
            }}
            // A click on a suggestion has to land before the blur closes the
            // field, so the close is deferred by a frame.
            onBlur={() => setTimeout(() => { setAdding(false); setDraft(''); }, 140)}
            placeholder="tag name"
            aria-label="New tag"
            style={{
              width: 110,
              height: 23,
              padding: '0 7px',
              borderRadius: 3,
              background: 'var(--bg2)',
              border: '1px solid var(--acc-bd)',
              color: 'var(--t1)',
              fontSize: 11,
              fontFamily: 'inherit',
              outline: 'none',
              caretColor: 'var(--acc2)',
            }}
          />
          {suggestions.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 27,
                left: 0,
                zIndex: 60,
                minWidth: 150,
                background: 'var(--bg2)',
                border: '1px solid var(--bd2)',
                borderRadius: 5,
                boxShadow: '0 8px 22px rgba(0,0,0,0.3)',
                padding: 3,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {suggestions.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  style={{
                    textAlign: 'left',
                    padding: '5px 7px',
                    borderRadius: 3,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--t2)',
                    fontSize: 11,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--t2)'; }}
                >
                  #{s}
                </button>
              ))}
            </span>
          )}
        </span>
      ) : (
        <button
          onClick={() => setAdding(true)}
          title="Add a tag to this note"
          style={{
            fontSize: 11,
            color: 'var(--t3)',
            background: 'transparent',
            border: '1px dashed var(--bd2)',
            padding: '3px 8px 3px 6px',
            borderRadius: 3,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t1)'; e.currentTarget.style.borderColor = 'var(--acc-bd)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
        >
          <Plus size={11} strokeWidth={2.5} />
          tag
        </button>
      )}
    </>
  );
}
