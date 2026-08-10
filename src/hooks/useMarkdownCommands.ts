'use client';

import { useCallback, useMemo } from 'react';

/**
 * The formatting verbs, in one place.
 *
 * Three surfaces reach for these — the bar that appears over a selection, the
 * Format inspector in the right panel, and the ⌘B/⌘I shortcuts — and they must
 * behave identically, or "bold" means something slightly different depending
 * on where you clicked it.
 *
 * Every command restores the selection afterwards, so commands stack: bold a
 * phrase, then italicise the same phrase, without reselecting it.
 */
export interface MarkdownCommands {
  /** Wrap the selection (or insert a placeholder) — bold, italic, code… */
  wrap: (prefix: string, suffix: string, placeholder: string) => void;
  /** Set the heading level of the caret's line. Same level again clears it. */
  setHeading: (level: 1 | 2 | 3 | 0) => void;
  /** Add or remove a line marker across every line the selection touches. */
  toggleLinePrefix: (prefix: string | ((index: number) => string), match: RegExp) => void;
  /** Insert an inline [text](url), leaving the caret on the URL. */
  insertLink: () => void;
  /** Drop a block at the caret, padded so it does not fuse with its neighbours. */
  insertBlock: (text: string) => void;
  /** True when there is a live selection — used to label commands honestly. */
  hasSelection: () => boolean;
}

export function useMarkdownCommands(
  resolve: () => HTMLTextAreaElement | null,
  body: string,
  onBodyChange: (next: string) => void,
): MarkdownCommands {
  // Re-selects after React has committed the new value. setTimeout(0) rather
  // than a layout effect because the textarea is a plain uncontrolled-ish DOM
  // node here and the value lands on the next tick.
  const restore = useCallback((ta: HTMLTextAreaElement, start: number, end: number) => {
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = start;
      ta.selectionEnd = end;
    }, 0);
  }, []);

  /** Grow a range to cover whole lines — block commands act on lines. */
  const lineRange = useCallback((start: number, end: number) => {
    const from = body.lastIndexOf('\n', start - 1) + 1;
    const toRaw = body.indexOf('\n', end);
    return { from, to: toRaw === -1 ? body.length : toRaw };
  }, [body]);

  const wrap = useCallback<MarkdownCommands['wrap']>((prefix, suffix, placeholder) => {
    const ta = resolve();
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end);
    const text = selected || placeholder;
    const inserted = prefix + text + suffix;
    onBodyChange(body.slice(0, start) + inserted + body.slice(end));
    if (selected) restore(ta, start, start + inserted.length);
    else restore(ta, start + prefix.length, start + prefix.length + placeholder.length);
  }, [resolve, body, onBodyChange, restore]);

  const setHeading = useCallback<MarkdownCommands['setHeading']>((level) => {
    const ta = resolve();
    if (!ta) return;
    const { from, to } = lineRange(ta.selectionStart, ta.selectionStart);
    const current = body.slice(from, to);
    const stripped = current.replace(/^#{1,6}\s+/, '');
    const marker = level === 0 ? '' : '#'.repeat(level) + ' ';
    // Clicking the level a line already has turns it back into body text, so
    // each button is a toggle rather than a one-way door.
    const next = marker && current.startsWith(marker) ? stripped : marker + stripped;
    onBodyChange(body.slice(0, from) + next + body.slice(to));
    restore(ta, from, from + next.length);
  }, [resolve, body, onBodyChange, lineRange, restore]);

  const toggleLinePrefix = useCallback<MarkdownCommands['toggleLinePrefix']>((prefix, match) => {
    const ta = resolve();
    if (!ta) return;
    const { from, to } = lineRange(ta.selectionStart, ta.selectionEnd);
    const lines = body.slice(from, to).split('\n');
    // Remove only when every line already carries the marker; a partly-marked
    // block is more likely a half-finished list than one the writer wants gone.
    const allMarked = lines.every((l) => match.test(l));
    const next = lines
      .map((line, i) => {
        if (allMarked) return line.replace(match, '');
        const p = typeof prefix === 'function' ? prefix(i) : prefix;
        return match.test(line) ? line : p + line;
      })
      .join('\n');
    onBodyChange(body.slice(0, from) + next + body.slice(to));
    restore(ta, from, from + next.length);
  }, [resolve, body, onBodyChange, lineRange, restore]);

  const insertLink = useCallback(() => {
    const ta = resolve();
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end) || 'link text';
    const inserted = `[${selected}](https://)`;
    onBodyChange(body.slice(0, start) + inserted + body.slice(end));
    // Land on the URL: the words are already written, the address is what is
    // still missing.
    const urlStart = start + selected.length + 3;
    restore(ta, urlStart, urlStart + 8);
  }, [resolve, body, onBodyChange, restore]);

  const insertBlock = useCallback((text: string) => {
    const ta = resolve();
    const start = ta ? ta.selectionStart : body.length;
    const end = ta ? ta.selectionEnd : body.length;
    const before = body.slice(0, start);
    const after = body.slice(end);
    const lead = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const trail = after && !after.startsWith('\n') ? '\n' : '';
    onBodyChange(before + lead + text + trail + after);
    if (ta) {
      const pos = start + lead.length + text.length;
      restore(ta, pos, pos);
    }
  }, [resolve, body, onBodyChange, restore]);

  const hasSelection = useCallback(() => {
    const ta = resolve();
    return Boolean(ta && ta.selectionStart !== ta.selectionEnd);
  }, [resolve]);

  return useMemo(
    () => ({ wrap, setHeading, toggleLinePrefix, insertLink, insertBlock, hasSelection }),
    [wrap, setHeading, toggleLinePrefix, insertLink, insertBlock, hasSelection],
  );
}

/** Line-marker patterns shared by the toggles. */
export const LINE_MARKERS = {
  quote: /^>\s?/,
  bullet: /^[-*+]\s/,
  numbered: /^\d+\.\s/,
  checklist: /^-\s\[[ xX]\]\s/,
};
