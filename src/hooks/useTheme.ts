'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'dark' | 'light';

/**
 * Theme hook — manages data-theme attribute on <html>.
 * Persists choice to localStorage, respects prefers-color-scheme on first load.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  // Initialize theme on mount — intentional hydration setState
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const saved = localStorage.getItem('sb-theme') as Theme | null;
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      // Respect system preference on first visit
      const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      const initial: Theme = systemLight ? 'light' : 'dark';
      setTheme(initial);
      document.documentElement.setAttribute('data-theme', initial);
    }
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Apply theme whenever it changes
  const applyTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('sb-theme', next);
    // Dispatch event so components like graph view can re-render
    window.dispatchEvent(new CustomEvent('theme-changed', { detail: next }));
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      return next;
    });
  }, [applyTheme]);

  return { theme, toggle, mounted };
}
