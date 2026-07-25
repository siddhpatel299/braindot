'use client';

import { useState, useEffect, useCallback } from 'react';

// The reading font for the editor's prose (title, subtitle, body, preview).
// Chrome/UI stays monospace regardless. Default is monospace so nothing
// changes for users who like the terminal look; serif/sans are opt-in and
// persist per device. Applied as data-editor-font on <html> (see globals.css
// + the no-flash init script in layout.tsx).

export type EditorFont = 'mono' | 'serif' | 'sans';

const KEY = 'sb-editor-font';

export const EDITOR_FONT_OPTIONS: { id: EditorFont; label: string; hint: string }[] = [
  { id: 'mono', label: 'Monospace', hint: 'JetBrains Mono — the terminal look' },
  { id: 'serif', label: 'Serif', hint: 'Comfortable for long reading & writing' },
  { id: 'sans', label: 'Sans', hint: 'Clean and neutral' },
];

function apply(font: EditorFont) {
  if (typeof document === 'undefined') return;
  if (font === 'mono') document.documentElement.removeAttribute('data-editor-font');
  else document.documentElement.setAttribute('data-editor-font', font);
}

export function useEditorFont() {
  const [font, setFontState] = useState<EditorFont>('mono');

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === 'serif' || saved === 'sans') setFontState(saved);
  }, []);

  const setFont = useCallback((next: EditorFont) => {
    setFontState(next);
    apply(next);
    try {
      if (next === 'mono') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
  }, []);

  return { font, setFont };
}
