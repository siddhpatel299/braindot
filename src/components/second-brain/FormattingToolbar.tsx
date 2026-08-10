'use client';

import { useCallback } from 'react';
import {
  Bold, Italic, Strikethrough, Code, Code2, ImagePlus,
  Heading1, Heading2, Heading3, List, ListOrdered, Quote, Link as LinkIcon, Brackets,
} from 'lucide-react';

interface FormattingToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  body: string;
  /** Opens the file picker. Insertion is async, so it lives in EditorCanvas. */
  onInsertImage?: () => void;
  /** An upload is in flight — a big paste can take a moment over the network. */
  imageBusy?: boolean;
  onBodyChange: (next: string) => void;
}

export function FormattingToolbar({ textareaRef, body, onBodyChange, onInsertImage, imageBusy }: FormattingToolbarProps) {
  // Wrap selected text with prefix/suffix, or insert placeholder if no selection.
  const wrapSelection = useCallback(
    (prefix: string, suffix: string, placeholder: string = 'text') => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = body.slice(start, end);
      const text = selected || placeholder;
      const inserted = prefix + text + suffix;
      const next = body.slice(0, start) + inserted + body.slice(end);
      onBodyChange(next);
      // restore selection after re-render — use setTimeout(0) to ensure
      // React has committed the new value to the DOM before we set selection
      setTimeout(() => {
        ta.focus();
        if (selected) {
          ta.selectionStart = start;
          ta.selectionEnd = start + inserted.length;
        } else {
          ta.selectionStart = start + prefix.length;
          ta.selectionEnd = start + prefix.length + placeholder.length;
        }
      }, 0);
    },
    [textareaRef, body, onBodyChange],
  );

  // Prefix each line in selection (for bullet lists, numbered lists, quotes)
  const prefixLines = useCallback(
    (prefix: string | ((idx: number) => string)) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = body.slice(start, end) || 'item';
      const lines = selected.split('\n');
      const newLines = lines.map((line, i) => {
        const p = typeof prefix === 'function' ? prefix(i) : prefix;
        return p + line;
      });
      const inserted = newLines.join('\n');
      const next = body.slice(0, start) + inserted + body.slice(end);
      onBodyChange(next);
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = start;
        ta.selectionEnd = start + inserted.length;
      }, 0);
    },
    [textareaRef, body, onBodyChange],
  );

  // Insert a code block (``` ... ```)
  const insertCodeBlock = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end) || 'code here';
    const inserted = '```\n' + selected + '\n```';
    const next = body.slice(0, start) + inserted + body.slice(end);
    onBodyChange(next);
    setTimeout(() => {
      ta.selectionStart = start + 4;
      ta.selectionEnd = start + 4 + selected.length;
      ta.focus();
    });
  }, [textareaRef, body, onBodyChange]);

  // Insert heading at line start
  const insertHeading = useCallback(
    (level: 1 | 2 | 3) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      // find the start of the line containing the cursor
      const lineStart = body.lastIndexOf('\n', start - 1) + 1;
      const prefix = '#'.repeat(level) + ' ';
      // check if line already has a heading prefix; if so, replace it
      const lineEnd = body.indexOf('\n', start);
      const currentLine = body.slice(lineStart, lineEnd === -1 ? body.length : lineEnd);
      const stripped = currentLine.replace(/^#{1,6}\s+/, '');
      const newLine = prefix + stripped;
      const next = body.slice(0, lineStart) + newLine + body.slice(lineEnd === -1 ? body.length : lineEnd);
      onBodyChange(next);
      setTimeout(() => {
        ta.focus();
        ta.selectionStart = lineStart + prefix.length;
        ta.selectionEnd = lineStart + newLine.length;
      }, 0);
    },
    [textareaRef, body, onBodyChange],
  );

  // Insert a wiki-link
  const insertWikiLink = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const text = selected || 'note-title';
    const inserted = '[[' + text + ']]';
    const next = body.slice(0, start) + inserted + body.slice(end);
    onBodyChange(next);
    setTimeout(() => {
      ta.focus();
      if (selected) {
        ta.selectionStart = start;
        ta.selectionEnd = start + inserted.length;
      } else {
        ta.selectionStart = start + 2;
        ta.selectionEnd = start + 2 + text.length;
      }
    }, 0);
  }, [textareaRef, body, onBodyChange]);

  // Insert a regular markdown link [text](url)
  const insertLink = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end) || 'link text';
    const inserted = '[' + selected + '](https://)';
    const next = body.slice(0, start) + inserted + body.slice(end);
    onBodyChange(next);
    setTimeout(() => {
      ta.focus();
      const urlStart = start + selected.length + 3;
      ta.selectionStart = urlStart;
      ta.selectionEnd = urlStart + 8; // "https://"
    }, 0);
  }, [textareaRef, body, onBodyChange]);

  const btnStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 3,
    background: 'transparent',
    border: '1px solid transparent',
    color: 'var(--t2)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.1s, color 0.1s, border 0.1s',
  };

  const hoverHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'var(--bg3)';
      e.currentTarget.style.color = 'var(--t1)';
      e.currentTarget.style.borderColor = 'var(--bd2)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--t2)';
      e.currentTarget.style.borderColor = 'transparent';
    },
  };

  const divider = <div style={{ width: 1, height: 18, background: 'var(--bd)', margin: '0 5px', flexShrink: 0 }} />;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '7px 14px',
        borderBottom: '1px solid var(--bd)',
        background: 'var(--bg1)',
        flexShrink: 0,
        overflowX: 'auto',
      }}
      className="sb-scroll-thin"
    >
      {/* Headings group */}
      <button style={btnStyle} title="Heading 1" onClick={() => insertHeading(1)} {...hoverHandlers}>
        <Heading1 size={15} strokeWidth={1.75} />
      </button>
      <button style={btnStyle} title="Heading 2" onClick={() => insertHeading(2)} {...hoverHandlers}>
        <Heading2 size={15} strokeWidth={1.75} />
      </button>
      <button style={btnStyle} title="Heading 3" onClick={() => insertHeading(3)} {...hoverHandlers}>
        <Heading3 size={15} strokeWidth={1.75} />
      </button>

      {divider}

      {/* Inline formatting group */}
      <button style={btnStyle} title="Bold (⌘B)" onClick={() => wrapSelection('**', '**', 'bold text')} {...hoverHandlers}>
        <Bold size={15} strokeWidth={2} />
      </button>
      <button style={btnStyle} title="Italic (⌘I)" onClick={() => wrapSelection('*', '*', 'italic text')} {...hoverHandlers}>
        <Italic size={15} strokeWidth={2} />
      </button>
      {/* No underline: markdown has no syntax for it, so the button wrote raw
          <u> tags into the file. That leaks HTML into notes that are meant to
          stay portable plain text, and it is the readers who do not know
          markdown who would see the tags. Existing <u> still renders. */}
      <button style={btnStyle} title="Strikethrough" onClick={() => wrapSelection('~~', '~~', 'strikethrough')} {...hoverHandlers}>
        <Strikethrough size={15} strokeWidth={2} />
      </button>
      <button style={btnStyle} title="Inline code" onClick={() => wrapSelection('`', '`', 'code')} {...hoverHandlers}>
        <Code size={15} strokeWidth={2} />
      </button>

      {divider}

      {/* Block elements group */}
      <button style={btnStyle} title="Code block" onClick={insertCodeBlock} {...hoverHandlers}>
        <Code2 size={15} strokeWidth={2} />
      </button>
      <button style={btnStyle} title="Bullet list" onClick={() => prefixLines('- ')} {...hoverHandlers}>
        <List size={15} strokeWidth={2} />
      </button>
      <button style={btnStyle} title="Numbered list" onClick={() => prefixLines((i) => `${i + 1}. `)} {...hoverHandlers}>
        <ListOrdered size={15} strokeWidth={2} />
      </button>
      <button style={btnStyle} title="Quote block" onClick={() => prefixLines('> ')} {...hoverHandlers}>
        <Quote size={15} strokeWidth={2} />
      </button>

      {divider}

      {/* Links group */}
      <button style={btnStyle} title="Wiki-link [[…]]" onClick={insertWikiLink} {...hoverHandlers}>
        <Brackets size={15} strokeWidth={2} />
      </button>
      <button style={btnStyle} title="Link [text](url)" onClick={insertLink} {...hoverHandlers}>
        <LinkIcon size={15} strokeWidth={2} />
      </button>
      {onInsertImage && (
        <button
          style={{ ...btnStyle, opacity: imageBusy ? 0.5 : 1 }}
          title={imageBusy ? 'Uploading image…' : 'Insert image'}
          aria-label="Insert image"
          aria-busy={imageBusy || undefined}
          disabled={imageBusy}
          onClick={onInsertImage}
          {...hoverHandlers}
        >
          <ImagePlus size={15} strokeWidth={2} />
        </button>
      )}

      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic', marginLeft: 8, whiteSpace: 'nowrap' }}>
        markdown · select text to format
      </span>
    </div>
  );
}
