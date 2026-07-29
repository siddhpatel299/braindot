'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * A separate, smaller bridge for the Settings window.
 *
 * Config writes deliberately do not exist on the main app's preload — the only
 * surface that can change your API key is this window, which loads a local
 * file and never renders remote content.
 */

contextBridge.exposeInMainWorld('braindotSettings', {
  /** Current values, with secrets reduced to a presence flag and a mask. */
  load: () => ipcRenderer.invoke('braindot:config-read'),

  /**
   * Merge a patch into config.json. Omit a key to leave it untouched; pass an
   * empty string to clear it. Resolves with the updated (masked) config.
   */
  save: (patch) => ipcRenderer.invoke('braindot:config-write', patch),

  /** Reveal config.json in Explorer. */
  revealConfig: () => ipcRenderer.send('braindot:reveal-config'),

  /** Open the desktop log, which is where server startup failures land. */
  openLog: () => ipcRenderer.send('braindot:open-log'),

  /** Restart the bundled server so a new key takes effect immediately. */
  applyAndRestart: () => ipcRenderer.invoke('braindot:restart-server'),

  close: () => ipcRenderer.send('braindot:close-settings'),
});
