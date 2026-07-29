'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The bridge between the packaged app shell and the Braindot renderer.
 *
 * Only these functions cross the boundary — `ipcRenderer` itself is never
 * exposed, and every channel name is a literal here rather than something the
 * page can choose. The web build has no `window.braindot` at all, which is how
 * the React side knows whether it is running on the desktop.
 */

/** Menu items and shell events arrive as commands on this one channel. */
const COMMAND_CHANNEL = 'braindot:command';

contextBridge.exposeInMainWorld('braindot', {
  isDesktop: true,
  platform: process.platform,
  appVersion: process.env.BRAINDOT_VERSION || '',

  /**
   * True when the window sits on a native blur material, so the page should
   * make its surfaces translucent and let it through. macOS only for now —
   * see MAC_VIBRANCY in main.js.
   */
  hasVibrancy: process.platform === 'darwin',

  /**
   * Subscribe to commands from the native menu ('new-note', 'navigate', …).
   * Returns an unsubscribe function so React effects can clean up.
   */
  onCommand(handler) {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, command, payload) => handler(command, payload);
    ipcRenderer.on(COMMAND_CHANNEL, listener);
    return () => ipcRenderer.removeListener(COMMAND_CHANNEL, listener);
  },

  /**
   * Keep native chrome in step with the in-app theme. Called by the desktop
   * hook whenever `data-theme` changes on <html>. The colours repaint the
   * Windows caption buttons; `theme` sets the OS appearance, which is what the
   * popup menu and the macOS vibrancy material follow.
   */
  setTitleBarTheme(colors) {
    ipcRenderer.send('braindot:title-bar-theme', {
      theme: colors?.theme === 'light' ? 'light' : 'dark',
      color: String(colors?.color || ''),
      symbolColor: String(colors?.symbolColor || ''),
    });
  },

  /** Open a URL in the user's real browser instead of inside the app window. */
  openExternal(url) {
    ipcRenderer.send('braindot:open-external', String(url || ''));
  },

  /** Native save dialog for vault/note exports, so downloads feel like an app. */
  saveFile({ suggestedName, contents, description } = {}) {
    return ipcRenderer.invoke('braindot:save-file', {
      suggestedName: String(suggestedName || 'braindot-export.md'),
      contents: String(contents ?? ''),
      description: String(description || 'File'),
    });
  },

  /** Open the Settings window (also on the application menu). */
  openSettings() {
    ipcRenderer.send('braindot:open-settings');
  },

  /**
   * Pop the application menu at a point in the window. Windows does not draw a
   * menu bar for a window with a hidden title bar, so the app provides its own
   * button and asks for the menu here.
   */
  popupMenu(x, y) {
    ipcRenderer.send('braindot:popup-menu', {
      x: Math.round(Number(x) || 0),
      y: Math.round(Number(y) || 0),
    });
  },
});
