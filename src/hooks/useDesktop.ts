'use client';

import { useEffect, useRef, useState } from 'react';
import type { DesktopCommand, DesktopImportPayload } from '@/types/desktop';

/**
 * Everything the app needs to know about running inside the Electron shell.
 *
 * On the web `window.braindot` is undefined and every branch here is inert, so
 * the same components serve both builds. Three jobs:
 *
 *   1. mark <html> with `is-desktop`, which unlocks the title-bar CSS
 *   2. keep the native caption buttons matching the in-app theme
 *   3. route native menu commands to the app's existing handlers
 */

/** Caption-button colours per theme — mirrors --bg1 and --t2 in globals.css. */
const TITLE_BAR_COLORS = {
  dark: { color: '#111113', symbolColor: '#888894' },
  light: { color: '#ffffff', symbolColor: '#5a5a56' },
} as const;

export interface DesktopHandlers {
  onNewNote?: () => void;
  onNewJournal?: () => void;
  onSave?: () => void;
  onCloseTab?: () => void;
  onCommandPalette?: () => void;
  onToggleTheme?: () => void;
  onExportNote?: () => void;
  onExportVault?: () => void;
  onImportFile?: (file: File) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onNavigate?: (view: string) => void;
}

export interface DesktopShell {
  /** True only in the packaged desktop app, and only after mount (SSR-safe). */
  isDesktop: boolean;
  /** macOS puts its window controls on the left, and has a real menu bar. */
  isMac: boolean;
}

/**
 * Which shell the app is running in. The classes on <html> are also set by the
 * inline script in layout.tsx so the CSS applies on first paint; setting them
 * again here is harmless, and they are never removed — they describe the
 * document's host, not the lifetime of any one component.
 */
export function useDesktopShell(): DesktopShell {
  const [shell, setShell] = useState<DesktopShell>({ isDesktop: false, isMac: false });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.braindot) return;
    const isMac = window.braindot.platform === 'darwin';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShell({ isDesktop: true, isMac });

    const root = document.documentElement;
    root.classList.add('is-desktop');
    if (isMac) root.classList.add('is-mac');
    if (window.braindot.hasVibrancy) root.classList.add('is-glass');
  }, []);

  return shell;
}

/** Back-compat shorthand for components that only care whether this is desktop. */
export function useIsDesktop(): boolean {
  return useDesktopShell().isDesktop;
}

export function useDesktop(handlers: DesktopHandlers): boolean {
  const { isDesktop } = useDesktopShell();

  // Handlers are rebuilt every render; a ref keeps the IPC subscription stable
  // so we are not tearing it down and rebuilding it on every keystroke.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // Keep the Windows caption buttons painted like the rest of the app.
  useEffect(() => {
    if (!isDesktop) return;
    const api = window.braindot;
    if (!api) return;

    const push = () => {
      const theme = document.documentElement.getAttribute('data-theme') === 'light'
        ? 'light'
        : 'dark';
      api.setTitleBarTheme({ theme, ...TITLE_BAR_COLORS[theme] });
    };

    push();
    const observer = new MutationObserver(push);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [isDesktop]);

  // Route native menu commands into the app.
  useEffect(() => {
    if (!isDesktop) return;
    const api = window.braindot;
    if (!api) return;

    return api.onCommand((command: DesktopCommand, payload?: unknown) => {
      const h = handlersRef.current;
      switch (command) {
        case 'new-note':
          h.onNewNote?.();
          break;
        case 'new-journal':
          h.onNewJournal?.();
          break;
        case 'save':
          h.onSave?.();
          break;
        case 'close-tab':
          h.onCloseTab?.();
          break;
        case 'command-palette':
          h.onCommandPalette?.();
          break;
        case 'toggle-theme':
          h.onToggleTheme?.();
          break;
        case 'export-note':
          h.onExportNote?.();
          break;
        case 'export-vault':
          h.onExportVault?.();
          break;
        case 'undo':
          h.onUndo?.();
          break;
        case 'redo':
          h.onRedo?.();
          break;
        case 'navigate':
          if (typeof payload === 'string') h.onNavigate?.(payload);
          break;
        case 'import-file': {
          // The shell read the file through the OS picker; rebuild a File so
          // the existing import path does not need a desktop-only branch.
          const { name, contents } = (payload || {}) as DesktopImportPayload;
          if (!name) break;
          h.onImportFile?.(new File([contents ?? ''], name, { type: 'text/plain' }));
          break;
        }
      }
    });
  }, [isDesktop]);

  return isDesktop;
}
