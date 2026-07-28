'use client';

import { useState, useEffect, useCallback } from 'react';

// The reading font for the editor's prose (title, subtitle, body, preview).
// Chrome/UI stays monospace regardless. Default is monospace so nothing
// changes for users who like the terminal look; serif/sans are opt-in and
// persist per device. Applied as data-editor-font on <html> (see globals.css
// + the no-flash init script in layout.tsx).

export type EditorFont = 'serif' | 'sans' | 'mono';

const KEY = 'sb-editor-font';

// Serif is the default: this is a writing app, and prose reads better in a
// text face than in a code face. Mono stays available for people who want it.
export const EDITOR_FONT_OPTIONS: { id: EditorFont; label: string; hint: string }[] = [
  { id: 'serif', label: 'Serif', hint: 'Newsreader — best for long reading' },
  { id: 'sans', label: 'Sans', hint: 'IBM Plex Sans — clean and neutral' },
  { id: 'mono', label: 'Monospace', hint: 'JetBrains Mono — the terminal look' },
];

function apply(font: EditorFont) {
  if (typeof document === 'undefined') return;
  if (font === 'serif') document.documentElement.removeAttribute('data-editor-font');
  else document.documentElement.setAttribute('data-editor-font', font);
}

export function useEditorFont() {
  const [font, setFontState] = useState<EditorFont>('serif');

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'mono' || saved === 'sans') setFontState(saved);
  }, []);

  const setFont = useCallback((next: EditorFont) => {
    setFontState(next);
    apply(next);
    try {
      if (next === 'serif') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
  }, []);

  return { font, setFont };
}
