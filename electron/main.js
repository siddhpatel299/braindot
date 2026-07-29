'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  session,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

// Set before anything reads app.getPath('userData'), so config, logs and the
// remembered port all land in %APPDATA%/braindot.
app.setName('braindot');

const log = require('./log');
const config = require('./config');
const server = require('./next-server');
const menu = require('./menu');
const windowState = require('./window-state');

/**
 * Braindot desktop.
 *
 * The app is the real Next.js app, served by a Node process that this shell
 * spawns on a stable local port (see next-server.js for why "stable" matters).
 * Convex still does sync and auth over the network exactly as it does on the
 * web — this shell owns the window, the menu, the native dialogs and the
 * lifecycle, not the data.
 */

const IS_MAC = process.platform === 'darwin';

/** Title bar colours, taken from the theme blocks in src/app/globals.css. */
const TITLE_BAR = {
  dark: { color: '#111113', symbolColor: '#888894' },
  light: { color: '#ffffff', symbolColor: '#5a5a56' },
};
const TITLE_BAR_HEIGHT = 48; // matches the CommandBar, which acts as the title bar

/**
 * macOS "liquid glass": the window is backed by a real NSVisualEffectView, so
 * what shows through is the desktop behind it, blurred by the compositor rather
 * than by CSS. For any of it to be visible the page has to be translucent too —
 * that half lives in the `.is-glass` token layer in globals.css.
 *
 * 'under-window' is the material that reads as the window's own frosted pane;
 * 'sidebar' and 'fullscreen-ui' are the other sensible choices.
 */
const MAC_VIBRANCY = 'under-window';

let mainWindow = null;
let splashWindow = null;
let settingsWindow = null;
let appOrigin = null;
let isQuitting = false;

/* ------------------------------------------------------------------ *
 * Splash
 * ------------------------------------------------------------------ */

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 340,
    height: 260,
    frame: false,
    resizable: false,
    movable: true,
    show: false,
    center: true,
    transparent: true,
    backgroundColor: '#00000000',
    skipTaskbar: false,
    title: 'braindot',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
  return splashWindow;
}

function setSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safe = JSON.stringify(String(text));
  splashWindow.webContents
    .executeJavaScript(`document.getElementById('status').textContent = ${safe};`)
    .catch(() => {});
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
  splashWindow = null;
}

/* ------------------------------------------------------------------ *
 * Main window
 * ------------------------------------------------------------------ */

function currentTitleBar() {
  return nativeTheme.shouldUseDarkColors ? TITLE_BAR.dark : TITLE_BAR.light;
}

function createMainWindow(origin) {
  const restored = windowState.restore();
  const bar = currentTitleBar();

  mainWindow = new BrowserWindow({
    width: restored.width,
    height: restored.height,
    x: restored.x,
    y: restored.y,
    minWidth: restored.minWidth,
    minHeight: restored.minHeight,
    show: false,
    title: 'braindot',
    // On macOS the window must not paint an opaque background, or it would sit
    // on top of the vibrancy material and hide it entirely.
    backgroundColor: IS_MAC ? '#00000000' : bar.color,
    ...(IS_MAC
      ? {
          // 'hiddenInset' keeps the traffic lights but drops the title bar, and
          // trafficLightPosition centres them in the 48px CommandBar.
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 18, y: 17 },
          vibrancy: MAC_VIBRANCY,
          // Keep the material lit even when the window is not focused;
          // 'followWindow' would grey it out on blur.
          visualEffectState: 'active',
        }
      : {
          // The CommandBar at the top of the app *is* the title bar; Windows
          // draws only the caption buttons over it.
          titleBarStyle: 'hidden',
          titleBarOverlay: { ...bar, height: TITLE_BAR_HEIGHT },
        }),
    // Windows draws no menu bar for a hidden-title-bar window. The menu is
    // still installed — its accelerators work, and the CommandBar's menu button
    // pops it up (see 'braindot:popup-menu'). macOS has a real menu bar and
    // ignores this.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      // The app talks to Convex and OpenAI over TLS; nothing here needs the
      // web security model relaxed.
      webSecurity: true,
    },
  });

  windowState.manage(mainWindow);
  if (restored.isMaximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log.error('renderer gone:', details.reason);
    // Quitting kills the renderer too, and it is reported as a crash. Showing a
    // dialog and reloading on the way out would be both wrong and unclosable.
    if (isQuitting || details.reason === 'clean-exit') return;
    if (!mainWindow || mainWindow.isDestroyed()) return;

    dialog.showErrorBox(
      'Braindot stopped responding',
      `The app window crashed (${details.reason}). It will reload.`,
    );
    mainWindow.reload();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, description, url) => {
    // -3 is ABORTED, which fires for ordinary client-side navigations.
    if (code === -3) return;
    log.error('did-fail-load', String(code), description, url);
  });

  applyNavigationPolicy(mainWindow.webContents, origin);
  mainWindow.loadURL(`${origin}/`);
  return mainWindow;
}

/**
 * Keep the window on the app, and send everything else to the real browser.
 *
 * The one rewrite: `/landing` is the marketing page, which the web app bounces
 * signed-out visitors to. A desktop app that has already been installed should
 * go straight to sign-in instead.
 */
function applyNavigationPolicy(contents, origin) {
  const isInternal = (url) => {
    try {
      return new URL(url).origin === new URL(origin).origin;
    } catch {
      return false;
    }
  };
  const isLanding = (url) => {
    try {
      return isInternal(url) && new URL(url).pathname.replace(/\/$/, '') === '/landing';
    } catch {
      return false;
    }
  };

  contents.on('will-navigate', (event, url) => {
    if (isLanding(url)) {
      event.preventDefault();
      contents.loadURL(`${origin}/auth`);
      return;
    }
    if (isInternal(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (isLanding(url)) {
      contents.loadURL(`${origin}/auth`);
      return { action: 'deny' };
    }
    // Nothing in Braindot needs a second window; links open outside.
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ------------------------------------------------------------------ *
 * Security hardening
 * ------------------------------------------------------------------ */

function hardenSession() {
  const ses = session.defaultSession;

  // Braindot needs none of the powerful web APIs. Denying by default means a
  // compromised page cannot quietly reach the microphone or the filesystem.
  ses.setPermissionRequestHandler((_contents, permission, callback) => {
    const allowed = new Set(['clipboard-sanitized-write', 'notifications']);
    callback(allowed.has(permission));
  });
  ses.setPermissionCheckHandler((_contents, permission) =>
    permission === 'clipboard-sanitized-write' || permission === 'notifications',
  );

  // Exports go through a native save dialog rather than dropping silently into
  // the Downloads folder.
  ses.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({
      title: 'Save export',
      defaultPath: path.join(app.getPath('downloads'), item.getFilename()),
    });
    item.once('done', (_e, state) => {
      if (state === 'completed') log.info('download saved:', item.getSavePath());
      else log.warn('download did not complete:', state);
    });
  });
}

// A preload is the only script we ever want attached, and no webviews exist.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

/** Push a menu command down to the app. */
function send(command, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('braindot:command', command, payload);
}

function fromSettings(event) {
  return settingsWindow && !settingsWindow.isDestroyed() && event.sender === settingsWindow.webContents;
}

function fromMainWindow(event) {
  return mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents;
}

function registerIpc() {
  ipcMain.on('braindot:title-bar-theme', (event, colors) => {
    if (!fromMainWindow(event) || !mainWindow) return;

    // Tell the OS which appearance the app is wearing. This is what makes
    // native surfaces agree with the in-app theme: the popup menu and system
    // dialogs on both platforms, and on macOS the vibrancy material itself,
    // which picks its light or dark variant from the effective appearance.
    if (colors?.theme === 'dark' || colors?.theme === 'light') {
      nativeTheme.themeSource = colors.theme;
    }

    // titleBarOverlay is Windows/Linux only — macOS draws the traffic lights
    // itself, and there is nothing to recolour.
    if (IS_MAC) return;

    const hex = /^#[0-9a-f]{6}$/i;
    const color = hex.test(colors?.color) ? colors.color : currentTitleBar().color;
    const symbolColor = hex.test(colors?.symbolColor)
      ? colors.symbolColor
      : currentTitleBar().symbolColor;
    try {
      mainWindow.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT });
      mainWindow.setBackgroundColor(color);
    } catch (err) {
      log.warn('could not update title bar overlay:', err);
    }
  });

  ipcMain.on('braindot:open-external', (_event, url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  ipcMain.on('braindot:popup-menu', (event, { x, y } = {}) => {
    if (!fromMainWindow(event) || !mainWindow) return;
    const appMenu = Menu.getApplicationMenu();
    if (appMenu) appMenu.popup({ window: mainWindow, x, y });
  });

  ipcMain.handle('braindot:save-file', async (event, { suggestedName, contents, description }) => {
    if (!fromMainWindow(event)) return { canceled: true };
    const ext = path.extname(suggestedName).replace('.', '') || 'txt';
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export from Braindot',
      defaultPath: path.join(app.getPath('documents'), suggestedName),
      filters: [
        { name: description, extensions: [ext] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return { canceled: true };
    await fs.promises.writeFile(filePath, contents, 'utf8');
    log.info('exported', filePath);
    return { canceled: false, filePath };
  });

  ipcMain.on('braindot:open-settings', () => openSettingsWindow());
  ipcMain.on('braindot:close-settings', (event) => {
    if (fromSettings(event)) settingsWindow.close();
  });

  ipcMain.handle('braindot:config-read', (event) =>
    fromSettings(event) ? config.readForRenderer() : null,
  );

  ipcMain.handle('braindot:config-write', (event, patch) => {
    if (!fromSettings(event)) return null;
    config.write(patch || {});
    return config.readForRenderer();
  });

  ipcMain.on('braindot:reveal-config', (event) => {
    if (fromSettings(event)) shell.showItemInFolder(config.configPath());
  });

  ipcMain.on('braindot:open-log', (event) => {
    if (fromSettings(event) || fromMainWindow(event)) shell.openPath(log.filePath());
  });

  ipcMain.handle('braindot:restart-server', async (event) => {
    if (!fromSettings(event)) return { ok: false };
    return restartServer();
  });
}

/* ------------------------------------------------------------------ *
 * Settings window
 * ------------------------------------------------------------------ */

function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 620,
    parent: mainWindow || undefined,
    modal: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    title: 'Braindot Settings',
    backgroundColor: IS_MAC ? '#00000000' : currentTitleBar().color,
    ...(IS_MAC
      ? {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 14, y: 15 },
          vibrancy: MAC_VIBRANCY,
          visualEffectState: 'active',
        }
      : {
          titleBarStyle: 'hidden',
          titleBarOverlay: { ...currentTitleBar(), height: 44 },
        }),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.once('ready-to-show', () => settingsWindow?.show());
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  return settingsWindow;
}

/* ------------------------------------------------------------------ *
 * Menu actions
 * ------------------------------------------------------------------ */

/**
 * Import goes through the OS file picker in the main process, then hands the
 * text to the renderer — which rebuilds a File and feeds the app's existing
 * import path, so JSON vaults and loose markdown behave exactly as on the web.
 */
async function importVault() {
  if (!mainWindow) return;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import into Braindot',
    properties: ['openFile'],
    filters: [
      { name: 'Braindot vault or note', extensions: ['json', 'md', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (canceled || !filePaths?.length) return;

  const filePath = filePaths[0];
  try {
    const contents = await fs.promises.readFile(filePath, 'utf8');
    send('import-file', { name: path.basename(filePath), contents });
  } catch (err) {
    log.error('import failed:', err);
    dialog.showErrorBox('Import failed', `Could not read ${filePath}.\n\n${err.message}`);
  }
}

/** Restart the Next server in place, keeping the same port and the same origin. */
async function restartServer() {
  try {
    log.info('restarting server');
    server.stop();
    const origin = await server.start();
    appOrigin = origin;
    if (mainWindow && !mainWindow.isDestroyed()) {
      applyNavigationPolicy(mainWindow.webContents, origin);
      mainWindow.reload();
    }
    return { ok: true, origin };
  } catch (err) {
    log.error('restart failed:', err);
    dialog.showErrorBox('Could not restart', String(err.message || err));
    return { ok: false, error: String(err.message || err) };
  }
}

/* ------------------------------------------------------------------ *
 * Startup
 * ------------------------------------------------------------------ */

async function boot() {
  hardenSession();
  registerIpc();

  menu.install({
    send,
    importVault,
    restartServer,
    openSettings: openSettingsWindow,
    openLog: () => shell.openPath(log.filePath()),
  });

  createSplash();
  setSplashStatus('starting the app server…');

  try {
    config.ensureFile();
    appOrigin = await server.start();
  } catch (err) {
    log.error('startup failed:', err);
    closeSplash();
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Braindot could not start',
      message: 'The app server did not start.',
      detail: `${err.message}\n\nThe log may say more:\n${log.filePath()}`,
      buttons: ['Open log', 'Quit'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice === 0) await shell.openPath(log.filePath());
    app.exit(1);
    return;
  }

  setSplashStatus('opening your vault…');
  createMainWindow(appOrigin);
}

server.setUnexpectedExitHandler((code) => {
  if (isQuitting) return;
  log.error('server exited unexpectedly with code', String(code));
  dialog.showErrorBox(
    'Braindot lost its app server',
    'The background server stopped. Use File > Restart App Server, or restart Braindot.',
  );
});

nativeTheme.on('updated', () => {
  // Only matters before the renderer reports its own theme; after that the
  // renderer is authoritative because the user can override the system theme.
  if (IS_MAC) return; // no overlay to repaint — macOS handles its own chrome
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setTitleBarOverlay({ ...currentTitleBar(), height: TITLE_BAR_HEIGHT });
  } catch {
    /* window may not have an overlay yet */
  }
});

// One vault, one window. A second launch focuses the window that already exists.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.setAppUserModelId('com.braindot.desktop');

  app.whenReady().then(boot).catch((err) => {
    log.error('fatal:', err);
    dialog.showErrorBox('Braindot failed to start', String(err.stack || err));
    app.exit(1);
  });
}

app.on('window-all-closed', () => {
  // Windows and Linux quit with the last window; there is no dock to return to.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && appOrigin) createMainWindow(appOrigin);
});

app.on('before-quit', () => {
  isQuitting = true;
  server.stop();
});

process.on('uncaughtException', (err) => {
  log.error('uncaught exception:', err);
});
