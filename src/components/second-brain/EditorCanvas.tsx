'use client';

import { useRef, useEffect, useMemo, useCallback } from 'react';
import { Note, TAG_COLORS } from '@/types';
import { renderMarkdownOverlay, formatDate, countWords } from '@/utils/markdown';
import { useEditor } from '@/hooks/useEditor';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { FormattingToolbar } from './FormattingToolbar';

interface EditorCanvasProps {
  note: Note;
  allNotes: Note[];
  dirty: boolean;
  editor: ReturnType<typeof useEditor>;
  onSave: (id: string, patch: Partial<Note>) => void;
  onOpenNote: (id: string) => void;
  onOpenNoteByTitle: (title: string) => void;
  onToggleEvergreen: (id: string) => void;
}

export function EditorCanvas({
  note,
  allNotes,
  dirty,
  editor,
  onSave,
  onOpenNote,
  onOpenNoteByTitle,
  onToggleEvergreen,
}: EditorCanvasProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  // Auto-resize textarea to match content height
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [editor.body, note?.id, autoResize]);

  // Re-measure on window resize
  useEffect(() => {
    const handler = () => autoResize();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [autoResize]);

  // Render markdown to HTML overlay
  const overlayHtml = useMemo(() => renderMarkdownOverlay(editor.body), [editor.body]);

  // Wiki-link click handling: clicks pass through the transparent textarea
  // only when the underlying <pre> has a data-wiki span at that location.
  // Approach: handle clicks on the <pre> itself, but since textarea is on top,
  // we use mousedown coordinates to detect wiki-link targets by walking the
  // overlay DOM. To keep this simple, we add a click handler on the wrap and
  // check the underlying element via document.elementFromPoint.
  const handleWrapClick = useCallback(
    (e: React.MouseEvent) => {
      // Only intercept if user wasn't selecting text
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;
      // Only intercept Ctrl/Cmd-click to open wiki-link, so normal clicks
      // place the caret as expected.
      if (!e.metaKey && !e.ctrlKey) return;

      const target = e.target as HTMLElement;
      // Hide textarea temporarily to get element under cursor
      const ta = textareaRef.current;
      if (!ta) return;
      const prevPointer = ta.style.pointerEvents;
      ta.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      ta.style.pointerEvents = prevPointer;

      const wikiEl = el?.closest('[data-wiki]') as HTMLElement | null;
      if (wikiEl) {
        const title = wikiEl.getAttribute('data-wiki');
        if (title) {
          e.preventDefault();
          onOpenNoteByTitle(title);
        }
      }
    },
    [onOpenNoteByTitle],
  );

  const wrapSelection = useCallback(
    (prefix: string, suffix: string, placeholder: string = 'text') => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = editor.body.slice(start, end);
      const text = selected || placeholder;
      const inserted = prefix + text + suffix;
      const next = editor.body.slice(0, start) + inserted + editor.body.slice(end);
      editor.updateBody(next);
      requestAnimationFrame(() => {
        if (selected) {
          ta.selectionStart = start;
          ta.selectionEnd = start + inserted.length;
        } else {
          ta.selectionStart = start + prefix.length;
          ta.selectionEnd = start + prefix.length + placeholder.length;
        }
        ta.focus();
      });
    },
    [editor],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const meta = e.metaKey || e.ctrlKey;
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = e.currentTarget;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const next = editor.body.slice(0, start) + '  ' + editor.body.slice(end);
        editor.updateBody(next);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
        return;
      }
      // Formatting shortcuts
      if (meta && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        wrapSelection('**', '**', 'bold text');
      } else if (meta && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        wrapSelection('*', '*', 'italic text');
      } else if (meta && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        wrapSelection('<u>', '</u>', 'underlined');
      } else if (meta && e.shiftKey && e.key.toLowerCase() === 'k') {
        // Cmd+Shift+K — inline code (Cmd+K alone is the command palette)
        e.preventDefault();
        wrapSelection('`', '`', 'code');
      }
    },
    [editor, wrapSelection],
  );

  // Backlinks for this note: use the precomputed backlinks field, then
  // resolve to Note objects.
  const backlinks = useMemo(() => {
    return note.backlinks
      .map((id) => allNotes.find((n) => n.id === id))
      .filter((n): n is Note => Boolean(n));
  }, [allNotes, note.backlinks]);

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Formatting toolbar */}
      <FormattingToolbar
        textareaRef={textareaRef}
        body={editor.body}
        onBodyChange={editor.updateBody}
      />

      <div
        className="sb-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '28px 48px 80px',
        }}
      >
        {/* Note header: tags + metadata */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
            flexWrap: 'wrap',
          }}
        >
          {note.tags.map((t) => {
            const c = TAG_COLORS[t] || TAG_COLORS.strategy;
            return (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  color: c.color,
                  background: c.bg,
                  border: `1px solid ${c.border}`,
                  padding: '3px 8px',
                  borderRadius: 3,
                  fontFamily: 'inherit',
                }}
              >
                #{t}
              </span>
            );
          })}
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>{formatDate(note.updatedAt)}</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>{countWords(note.body)} words</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>{backlinks.length} backlinks</span>
          <span style={{ color: 'var(--t3)', fontSize: 11 }}>·</span>
          <button
            onClick={() => onToggleEvergreen(note.id)}
            title="Toggle evergreen status"
            style={{
              fontSize: 11,
              color: note.status === 'evergreen' ? 'var(--grn)' : 'var(--t3)',
              background: note.status === 'evergreen' ? 'var(--grn-bg)' : 'transparent',
              border:
                note.status === 'evergreen' ? '1px solid #1a4a2a' : '1px solid var(--bd2)',
              padding: '3px 8px',
              borderRadius: 3,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'inherit',
            }}
          >
            {note.status === 'evergreen' ? (
              <>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grn)' }} />
                evergreen
              </>
            ) : (
              <>
                <RefreshCw size={11} />
                draft
              </>
            )}
          </button>
        </div>

        {/* Title */}
        <input
          value={editor.title}
          onChange={(e) => editor.updateTitle(e.target.value)}
          placeholder="Untitled note"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--t1)',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            padding: 0,
            marginBottom: 6,
            fontFamily: 'inherit',
            caretColor: 'var(--acc2)',
          }}
        />

        {/* Subtitle */}
        <input
          value={editor.subtitle}
          onChange={(e) => editor.updateSubtitle(e.target.value)}
          placeholder="A short tagline…"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--t3)',
            fontSize: 15,
            fontStyle: 'italic',
            padding: 0,
            marginBottom: 28,
            fontFamily: 'inherit',
            caretColor: 'var(--acc2)',
          }}
        />

        {/* Body: overlay editor */}
        <div
          className="sb-editor-wrap"
          onClick={handleWrapClick}
          style={{ position: 'relative', minHeight: 200 }}
        >
          <pre
            ref={preRef}
            className="sb-editor-pre"
            dangerouslySetInnerHTML={{ __html: overlayHtml }}
            aria-hidden="true"
          />
          <textarea
            ref={textareaRef}
            className="sb-editor-textarea"
            value={editor.body}
            onChange={(e) => editor.updateBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="# Start writing your note…"
            spellCheck={false}
            rows={1}
          />
        </div>

        {/* Backlinks section */}
        <div
          style={{
            marginTop: 40,
            background: 'var(--bg2)',
            border: '1px solid var(--bd)',
            borderRadius: 4,
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              color: 'var(--t3)',
              marginBottom: 10,
              fontWeight: 600,
            }}
          >
            backlinks — {backlinks.length} {backlinks.length === 1 ? 'note' : 'notes'} reference this
          </div>
          {backlinks.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--t3)', fontStyle: 'italic' }}>
              no backlinks yet. link this note from elsewhere with [[{note.title}]].
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {backlinks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => onOpenNote(b.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    color: 'var(--t2)',
                    fontSize: 13,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--acc2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--t2)';
                  }}
                >
                  <ArrowLeft size={13} style={{ opacity: 0.6 }} />
                  {b.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hint at bottom for wiki-link click */}
        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            color: 'var(--t3)',
            opacity: 0.7,
            fontStyle: 'italic',
          }}
        >
          tip: ⌘+click a [[wiki-link]] to open that note in a new tab
        </div>
      </div>
    </div>
  );
}
