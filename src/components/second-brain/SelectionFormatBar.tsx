'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bold, Italic, Strikethrough, Code, Quote, List,
  Heading1, Heading2, Link as LinkIcon, Brackets,
} from 'lucide-react';
import { getCaretCoordinates } from '@/utils/caret';
import { useMarkdownCommands, LINE_MARKERS } from '@/hooks/useMarkdownCommands';

interface SelectionFormatBarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  body: string;
  onBodyChange: (next: string) => void;
  /** Hidden while another surface owns the caret (slash menu, link autocomplete). */
  suppressed?: boolean;
}

const BAR_HEIGHT = 37;
/** Close enough to keep the bar on screen; the bar itself sizes to content. */
const BAR_WIDTH = 322;

function Btn({
  icon: Icon, label, onClick,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="sb-selbar-btn"
      title={label}
      aria-label={label}
      // mousedown, not click: the textarea must not lose its selection before
      // the command reads it.
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      <Icon size={14} strokeWidth={2} />
    </button>
  );
}

/**
 * Formatting, where the formatting is happening.
 *
 * The fast path for someone who already knows what they want. The Format tab
 * in the right panel is the same set of commands, named in words, for someone
 * who does not — both run through useMarkdownCommands so they cannot drift.
 */
export function SelectionFormatBar({ textareaRef, body, onBodyChange, suppressed }: SelectionFormatBarProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const resolve = useCallback(() => textareaRef.current, [textareaRef]);
  const cmd = useMarkdownCommands(resolve, body, onBodyChange);

  // Watch the selection rather than any one event: a selection can be made
  // with the mouse, with shift+arrows, or with ⌘A, and selectionchange is the
  // only signal that covers all three.
  useEffect(() => {
    const sync = () => {
      const ta = textareaRef.current;
      if (!ta || document.activeElement !== ta) return;
      const { selectionStart: start, selectionEnd: end } = ta;
      if (start === end) {
        setAnchor(null);
        return;
      }
      const style = window.getComputedStyle(ta);
      const lineHeight = parseFloat(style.lineHeight) || 20;
      // getCaretCoordinates returns the bottom of the caret's line; the bar
      // sits a comfortable gap above the first line of the selection.
      const caret = getCaretCoordinates(ta, start);
      const x = Math.min(Math.max(10, caret.x - BAR_WIDTH / 2), window.innerWidth - BAR_WIDTH - 10);
      let y = caret.y - lineHeight - BAR_HEIGHT - 10;
      // No room above (selection near the top of the window) — drop below the
      // selection's last line instead of clipping off-screen.
      if (y < 10) y = getCaretCoordinates(ta, end).y + 10;
      setAnchor({ x, y });
    };

    document.addEventListener('selectionchange', sync);
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    return () => {
      document.removeEventListener('selectionchange', sync);
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
    };
  }, [textareaRef]);

  if (!anchor || suppressed) return null;

  return (
    <div className="sb-selbar" style={{ left: anchor.x, top: anchor.y }} role="toolbar" aria-label="Format selection">
      <Btn icon={Heading1} label="Title" onClick={() => cmd.setHeading(1)} />
      <Btn icon={Heading2} label="Heading" onClick={() => cmd.setHeading(2)} />
      <span className="sb-selbar-sep" />
      <Btn icon={Bold} label="Bold  ⌘B" onClick={() => cmd.wrap('**', '**', 'bold text')} />
      <Btn icon={Italic} label="Italic  ⌘I" onClick={() => cmd.wrap('*', '*', 'italic text')} />
      <Btn icon={Strikethrough} label="Strikethrough" onClick={() => cmd.wrap('~~', '~~', 'struck text')} />
      <Btn icon={Code} label="Code  ⌘⇧K" onClick={() => cmd.wrap('`', '`', 'code')} />
      <span className="sb-selbar-sep" />
      <Btn icon={LinkIcon} label="Link to a page" onClick={cmd.insertLink} />
      <Btn icon={Brackets} label="Link to another note" onClick={() => cmd.wrap('[[', ']]', 'note title')} />
      <span className="sb-selbar-sep" />
      <Btn icon={Quote} label="Quote" onClick={() => cmd.toggleLinePrefix('> ', LINE_MARKERS.quote)} />
      <Btn icon={List} label="Bullet list" onClick={() => cmd.toggleLinePrefix('- ', LINE_MARKERS.bullet)} />
    </div>
  );
}
