'use client';

import { useState, useEffect, useCallback } from 'react';

// The reading font for the editor's prose (title, subtitle, body, preview).
// Chrome/UI stays monospace regardless.
//
// The default is serif: a note is a document, and monospace costs real reading
// speed over a few hundred words. Monospace is one click away for anyone who
// wants the terminal look, and the choice persists per device. Applied as
// data-editor-font on <html> (see globals.css + the no-flash init script in
// layout.tsx).

export type EditorFont = 'mono' | 'serif' | 'sans';

const KEY = 'sb-editor-font';
const DEFAULT_FONT: EditorFont = 'serif';

export const EDITOR_FONT_OPTIONS: { id: EditorFont; label: string; hint: string }[] = [
  { id: 'serif', label: 'Serif', hint: 'Easiest to read at length' },
  { id: 'sans', label: 'Sans', hint: 'Clean and neutral' },
  { id: 'mono', label: 'Monospace', hint: 'JetBrains Mono — the terminal look' },
];

function apply(font: EditorFont) {
  if (typeof document === 'undefined') return;
  if (font === DEFAULT_FONT) document.documentElement.removeAttribute('data-editor-font');
  else document.documentElement.setAttribute('data-editor-font', font);
}

export function useEditorFont() {
  const [font, setFontState] = useState<EditorFont>(DEFAULT_FONT);

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved === 'serif' || saved === 'sans' || saved === 'mono') setFontState(saved);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setFont = useCallback((next: EditorFont) => {
    setFontState(next);
    apply(next);
    // Written even for the default, so "I chose serif" survives a change of
    // default later — the absence of a key means "never chose", not "mono".
    try { localStorage.setItem(KEY, next); } catch {}
  }, []);

  return { font, setFont };
}
