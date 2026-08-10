'use client';

import { useCallback } from 'react';
import {
  Bold, Italic, Strikethrough, Code, Link as LinkIcon, Brackets,
  List, ListOrdered, ListChecks, ImagePlus, Minus, Table,
} from 'lucide-react';
import { useMarkdownCommands, LINE_MARKERS } from '@/hooks/useMarkdownCommands';

interface FormatPanelProps {
  body: string;
  onBodyChange: (next: string) => void;
  /** True when the editor is showing the note as a document, not as text. */
  readingMode: boolean;
  /** Switches the editor into writing mode so a command has something to act on. */
  onRequestEdit: () => void;
  onInsertImage: () => void;
}

const GROUP_LABEL: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--t3)',
  fontWeight: 600,
  margin: '0 0 8px',
};

/** A paragraph-style button, set in the style it applies. */
function Wide({
  label, hint, onClick, run, style,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  run: (fn: () => void) => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      title={hint}
      onMouseDown={(e) => { e.preventDefault(); run(onClick); }}
      style={{
        height: 34,
        padding: '0 10px',
        borderRadius: 5,
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        color: 'var(--t1)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.borderColor = 'var(--bd2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--bd)'; }}
    >
      {label}
    </button>
  );
}

/** A square icon control for emphasis and lists. */
function IconBtn({
  icon: I, label, onClick, run,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
  run: (fn: () => void) => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onMouseDown={(e) => { e.preventDefault(); run(onClick); }}
      style={{
        height: 30,
        borderRadius: 5,
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        color: 'var(--t2)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t2)'; }}
    >
      <I size={14} strokeWidth={2} />
    </button>
  );
}

const GRID_3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 };
const GRID_4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 };

/** A full-width insert action: icon, then what it does, in plain words. */
function Row({
  icon: I, label, hint, onClick, run,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  hint: string;
  onClick: () => void;
  run: (fn: () => void) => void;
}) {
  return (
    <button
      title={hint}
      onMouseDown={(e) => { e.preventDefault(); run(onClick); }}
      style={{
        height: 32,
        padding: '0 10px',
        borderRadius: 5,
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        color: 'var(--t2)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 11.5,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--t1)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.color = 'var(--t2)'; }}
    >
      <I size={13} strokeWidth={2} />
      {label}
    </button>
  );
}

/**
 * Formatting for people who do not write markdown.
 *
 * The bar over a selection is the fast path, and `/` is the fast path for
 * inserting — but both have to be discovered. This panel is the one that does
 * not: it is visible, it is labelled in words rather than syntax, and it says
 * what each control does to the sentence you are on.
 */
export function FormatPanel({
  body,
  onBodyChange,
  readingMode,
  onRequestEdit,
  onInsertImage,
}: FormatPanelProps) {
  const resolve = useCallback(
    () => document.querySelector<HTMLTextAreaElement>('.sb-editor-textarea'),
    [],
  );
  const cmd = useMarkdownCommands(resolve, body, onBodyChange);

  // A format command implies editing. Rather than greying the whole panel out
  // in reading mode, the first click switches modes and then runs — the writer
  // asked to change the text, which is unambiguous.
  const run = useCallback(
    (fn: () => void) => {
      if (readingMode) {
        onRequestEdit();
        setTimeout(fn, 60);
        return;
      }
      fn();
    },
    [readingMode, onRequestEdit],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--t3)', lineHeight: 1.6 }}>
        {readingMode
          ? 'Pick a style and the note switches to writing.'
          : 'Put the cursor in a line, or select some words, then pick a style.'}
      </p>

      <div>
        <h3 style={GROUP_LABEL}>Paragraph style</h3>
        <div style={{ ...GRID_3, marginBottom: 6 }}>
          <Wide run={run} label="Title" hint="Biggest heading" onClick={() => cmd.setHeading(1)}
            style={{ fontSize: 14, fontWeight: 700, justifyContent: 'center' }} />
          <Wide run={run} label="Heading" hint="Section heading" onClick={() => cmd.setHeading(2)}
            style={{ fontSize: 12.5, fontWeight: 700, justifyContent: 'center' }} />
          <Wide run={run} label="Sub" hint="Smaller heading" onClick={() => cmd.setHeading(3)}
            style={{ fontSize: 11.5, fontWeight: 700, justifyContent: 'center' }} />
        </div>
        <div style={GRID_3}>
          <Wide run={run} label="Body" hint="Plain paragraph" onClick={() => cmd.setHeading(0)}
            style={{ fontSize: 11.5, justifyContent: 'center' }} />
          <Wide run={run} label="Quote" hint="Set the line as a quotation"
            onClick={() => cmd.toggleLinePrefix('> ', LINE_MARKERS.quote)}
            style={{ fontSize: 11.5, fontStyle: 'italic', justifyContent: 'center' }} />
          <Wide run={run} label="Code" hint="Fenced code block"
            onClick={() => cmd.insertBlock('```\n\n```')}
            style={{ fontSize: 11.5, justifyContent: 'center' }} />
        </div>
      </div>

      <div>
        <h3 style={GROUP_LABEL}>Emphasis</h3>
        <div style={GRID_4}>
          <IconBtn run={run} icon={Bold} label="Bold  ⌘B" onClick={() => cmd.wrap('**', '**', 'bold text')} />
          <IconBtn run={run} icon={Italic} label="Italic  ⌘I" onClick={() => cmd.wrap('*', '*', 'italic text')} />
          <IconBtn run={run} icon={Strikethrough} label="Strikethrough" onClick={() => cmd.wrap('~~', '~~', 'struck text')} />
          <IconBtn run={run} icon={Code} label="Code  ⌘⇧K" onClick={() => cmd.wrap('`', '`', 'code')} />
        </div>
      </div>

      <div>
        <h3 style={GROUP_LABEL}>Lists</h3>
        <div style={GRID_3}>
          <IconBtn run={run} icon={List} label="Bulleted list"
            onClick={() => cmd.toggleLinePrefix('- ', LINE_MARKERS.bullet)} />
          <IconBtn run={run} icon={ListOrdered} label="Numbered list"
            onClick={() => cmd.toggleLinePrefix((i) => `${i + 1}. `, LINE_MARKERS.numbered)} />
          <IconBtn run={run} icon={ListChecks} label="Checklist"
            onClick={() => cmd.toggleLinePrefix('- [ ] ', LINE_MARKERS.checklist)} />
        </div>
      </div>

      <div>
        <h3 style={GROUP_LABEL}>Insert</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row icon={LinkIcon} label="Link to a page" hint="Turn the selected words into a link"
            onClick={cmd.insertLink} run={run} />
          <Row icon={Brackets} label="Link to another note" hint="A [[wiki-link]] to a note in your vault"
            onClick={() => cmd.wrap('[[', ']]', 'note title')} run={run} />
          <Row icon={ImagePlus} label="Picture" hint="Choose an image from this device"
            onClick={onInsertImage} run={run} />
          {/* Padded so the source looks like a table too — someone editing
              the raw text should be able to see the columns. */}
          <Row icon={Table} label="Table" hint="A three-column table"
            onClick={() => cmd.insertBlock(
              '| Column 1 | Column 2 | Column 3 |\n'
              + '| -------- | -------- | -------- |\n'
              + '| Cell     | Cell     | Cell     |',
            )}
            run={run} />
          <Row icon={Minus} label="Divider" hint="A horizontal rule across the page"
            onClick={() => cmd.insertBlock('---')} run={run} />
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 10.5, color: 'var(--t3)', lineHeight: 1.7 }}>
        Selecting text brings these up right where you are working, and typing{' '}
        <span style={{ color: 'var(--t2)' }}>/</span> on an empty line inserts
        any of them.
      </p>
    </div>
  );
}
