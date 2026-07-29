// Braindot — the API the Electron shell injects into the renderer.
//
// `window.braindot` exists only in the desktop build (see electron/preload.js).
// On the web it is undefined, which is exactly how the app tells the two apart.

export type DesktopCommand =
  | 'new-note'
  | 'new-journal'
  | 'save'
  | 'close-tab'
  | 'command-palette'
  | 'toggle-theme'
  | 'export-note'
  | 'export-vault'
  | 'import-file'
  | 'undo'
  | 'redo'
  | 'navigate';

export interface DesktopImportPayload {
  name: string;
  contents: string;
}

export interface BraindotDesktopApi {
  readonly isDesktop: true;
  readonly platform: NodeJS.Platform | string;
  readonly appVersion: string;

  /** True when the window is backed by a native blur material (macOS). */
  readonly hasVibrancy: boolean;

  /** Subscribe to native menu commands. Returns an unsubscribe function. */
  onCommand(
    handler: (command: DesktopCommand, payload?: unknown) => void,
  ): () => void;

  /** Match native chrome to the in-app theme (caption buttons, OS appearance). */
  setTitleBarTheme(colors: {
    theme: 'dark' | 'light';
    color: string;
    symbolColor: string;
  }): void;

  /** Open a URL in the user's browser rather than in the app window. */
  openExternal(url: string): void;

  /** Write a file through the OS save dialog. */
  saveFile(options: {
    suggestedName: string;
    contents: string;
    description?: string;
  }): Promise<{ canceled: boolean; filePath?: string }>;

  openSettings(): void;

  /** Pop the application menu at a point in the window (window coordinates). */
  popupMenu(x: number, y: number): void;
}

declare global {
  interface Window {
    braindot?: BraindotDesktopApi;
  }
}

export {};
