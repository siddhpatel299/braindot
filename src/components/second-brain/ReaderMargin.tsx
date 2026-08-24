'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Highlight } from '@/types';

interface ReaderMarginProps {
  highlights: Highlight[];
  /** The prose column. Marks are measured against it, not against the page. */
  proseRef: React.RefObject<HTMLDivElement | null>;
  /** The scrolling container, so a mark can bring its passage into view. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Re-measure when any of these change — content, size, or the marks. */
  revision: string;
  onCapture: (highlight: Highlight) => void;
  onDelete: (id: string) => void;
  /** Write a line of your own against the passage. */
  onNote: (id: string, note: string) => void;
}

const GAP = 10;

/**
 * Your marks, in the margin.
 *
 * A book keeps the reader's annotations beside the line that provoked them,
 * and that is the whole capture loop made visible: highlight a passage, watch
 * it appear in the margin, turn it into a note without leaving the page. It
 * replaces a drawer that was closed by default and had to be summoned from a
 * counter in the header — which meant the marks a reader had just made were
 * the one thing they could not see.
 */
export function ReaderMargin({
  highlights, proseRef, scrollRef, revision, onCapture, onDelete, onNote,
}: ReaderMarginProps) {
  const noteRefs = useRef(new Map<string, HTMLDivElement>());
  const [ready, setReady] = useState(false);
  /** Which mark is being annotated, and the text so far. */
  const [writing, setWriting] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  // Position after paint: the marks' tops come from the rendered passages and
  // their heights from the rendered notes, so both have to exist first.
  useLayoutEffect(() => {
    const prose = proseRef.current;
    if (!prose) return;
    const proseTop = prose.getBoundingClientRect().top;

    const placed: { el: HTMLDivElement; top: number }[] = [];
    for (const hl of highlights) {
      const el = noteRefs.current.get(hl.id);
      if (!el) continue;
      const passage = prose.querySelector<HTMLElement>(`[data-hl-id="${hl.id}"]`);
      // A highlight belonging to another chapter has nothing on screen to sit
      // beside, so it is simply not shown until the reader navigates there.
      if (!passage) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      placed.push({ el, top: passage.getBoundingClientRect().top - proseTop });
    }

    // Marks never overlap: each one drops below the previous if it has to, so
    // a densely-highlighted page stays readable instead of stacking into mush.
    placed.sort((a, b) => a.top - b.top);
    let floor = -Infinity;
    for (const p of placed) {
      const top = Math.max(p.top, floor);
      p.el.style.top = `${top}px`;
      floor = top + p.el.offsetHeight + GAP;
    }
    setReady(true);
  }, [highlights, proseRef, revision]);

  const scrollToPassage = useCallback((id: string) => {
    const prose = proseRef.current;
    const scroller = scrollRef.current;
    const passage = prose?.querySelector<HTMLElement>(`[data-hl-id="${id}"]`);
    if (!scroller || !passage) return;
    const delta = passage.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop = scroller.scrollTop + delta - 90;
  }, [proseRef, scrollRef]);

  if (highlights.length === 0) return null;

  return (
    <div style={{ position: 'relative', opacity: ready ? 1 : 0, transition: 'opacity 140ms ease' }}>
      {highlights.map((hl) => (
        <div
          key={hl.id}
          ref={(el) => {
            if (el) noteRefs.current.set(hl.id, el);
            else noteRefs.current.delete(hl.id);
          }}
          className="sb-margin-note"
          data-color={hl.color}
          role="button"
          tabIndex={0}
          onClick={() => scrollToPassage(hl.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollToPassage(hl.id); }
          }}
          title="Go to this passage"
        >
          <div className="sb-margin-note-text">{hl.text}</div>

          {/* One line of your own. Most marginalia is a sentence, and the only
              things on offer were a silent highlight or a whole note. */}
          {writing === hl.id ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => { onNote(hl.id, draft.trim()); setWriting(null); }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); setWriting(null); }
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onNote(hl.id, draft.trim());
                  setWriting(null);
                }
              }}
              rows={2}
              placeholder="a line of your own"
              aria-label="Write a note against this passage"
              style={{
                width: '100%', marginTop: 5, background: 'var(--bg3)',
                border: '1px solid var(--acc-bd)', borderRadius: 3, padding: '3px 5px',
                color: 'var(--t1)', fontFamily: 'inherit', fontSize: 10, lineHeight: 1.45,
                resize: 'none', outline: 'none', caretColor: 'var(--acc2)',
              }}
            />
          ) : hl.note ? (
            <div
              onClick={(e) => { e.stopPropagation(); setWriting(hl.id); setDraft(hl.note ?? ''); }}
              title="Click to edit"
              style={{ marginTop: 5, fontSize: 10, lineHeight: 1.5, color: 'var(--t3)', cursor: 'text' }}
            >
              {hl.note}
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
            {!hl.note && writing !== hl.id && (
              <button
                onClick={(e) => { e.stopPropagation(); setWriting(hl.id); setDraft(''); }}
                style={{
                  background: 'transparent', border: 'none', padding: 0, color: 'var(--t3)',
                  fontSize: 9.5, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.04em',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--acc2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t3)'; }}
              >
                add a line
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onCapture(hl); }}
              style={{
                background: 'transparent', border: 'none', padding: 0,
                color: hl.noteId ? 'var(--grn)' : 'var(--acc2)',
                fontSize: 9.5, fontFamily: 'inherit', cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              {hl.noteId ? 'note made' : 'make a note'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(hl.id); }}
              style={{
                background: 'transparent', border: 'none', padding: 0,
                color: 'var(--t3)', fontSize: 9.5, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
