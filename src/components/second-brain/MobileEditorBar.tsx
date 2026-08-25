'use client';

import { ChevronLeft, Undo2, Eye, Pencil, MoreHorizontal } from 'lucide-react';
import { ViewMode } from './EditorBar';

interface MobileEditorBarProps {
  title: string;
  dirty: boolean;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  canUndo: boolean;
  onUndo: () => void;
  onBack: () => void;
  onOpenPanel: () => void;
}

/**
 * One row of chrome, and the only row the editor gets on a phone.
 *
 * The desktop bar carries tabs, two panel toggles, three view modes, a font
 * picker, undo/redo and an image button. None of that survives contact with a
 * 375px screen, and every pixel it would spend is a pixel off the writing
 * area. What is left is what a thumb reaches for mid-sentence: get out, undo,
 * see it as a document, and everything else behind one more tap.
 */
export function MobileEditorBar({
  title, dirty, viewMode, onViewModeChange, canUndo, onUndo, onBack, onOpenPanel,
}: MobileEditorBarProps) {
  const reading = viewMode !== 'edit';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        height: 44,
        flexShrink: 0,
        padding: '0 2px 0 0',
        background: 'var(--bg1)',
        borderBottom: '1px solid var(--bd)',
      }}
    >
      <button onClick={onBack} aria-label="Back to notes" style={{ ...barButton, width: 42 }}>
        <ChevronLeft size={21} strokeWidth={2} />
      </button>

      <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            minWidth: 0, fontSize: 12.5, color: 'var(--t1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {title || 'untitled'}
        </span>
        {/* The status bar is desk furniture and does not come to the phone, so
            the one piece of it that matters mid-sentence rides here instead. */}
        <span
          aria-label={dirty ? 'saving' : 'saved'}
          title={dirty ? 'saving…' : 'saved'}
          style={{
            width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
            background: dirty ? 'var(--amb)' : 'var(--grn)',
          }}
        />
      </span>

      <button
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
        style={{ ...barButton, color: canUndo ? 'var(--t2)' : 'var(--t4, var(--t3))', opacity: canUndo ? 1 : 0.4 }}
      >
        <Undo2 size={17} strokeWidth={1.9} />
      </button>

      <button
        onClick={() => onViewModeChange(reading ? 'edit' : 'preview')}
        aria-label={reading ? 'Edit this note' : 'Read as a document'}
        aria-pressed={reading}
        style={{ ...barButton, color: reading ? 'var(--acc2)' : 'var(--t2)' }}
      >
        {reading ? <Pencil size={17} strokeWidth={1.9} /> : <Eye size={17} strokeWidth={1.9} />}
      </button>

      <button onClick={onOpenPanel} aria-label="Note tools" style={barButton}>
        <MoreHorizontal size={19} strokeWidth={2} />
      </button>
    </div>
  );
}

const barButton: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 6,
  flexShrink: 0,
  background: 'transparent',
  border: 'none',
  color: 'var(--t2)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  WebkitTapHighlightColor: 'transparent',
};
