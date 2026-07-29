'use strict';

const { Menu, shell, app } = require('electron');

/**
 * The application menu, for both platforms.
 *
 * The subtlety worth knowing is `registerAccelerator: false`. Braindot already
 * binds Ctrl/Cmd+K/T/W/P/S/J on `window`, and Ctrl/Cmd+Z/Y/B/I/U inside the
 * editor. A menu accelerator is handled *before* the keystroke reaches the
 * page, so registering those would silently break shortcuts that work fine on
 * the web. On Windows and Linux `registerAccelerator: false` keeps the shortcut
 * visible in the menu — which is how people discover it — while letting the key
 * fall through to the app's own handler.
 *
 * **macOS ignores that flag**: a menu accelerator is always registered by the
 * system. That is harmless for the items below that route through `send()`,
 * because the menu click and the page handler do the same thing, so the command
 * still runs exactly once either way. It is *not* harmless for Undo and Redo —
 * see the Edit menu.
 */

const isMac = process.platform === 'darwin';

/** Shortcut the renderer owns: show it, don't capture it (Windows/Linux). */
function passthrough(label, accelerator, command, send) {
  return {
    label,
    accelerator,
    registerAccelerator: false,
    click: () => send(command),
  };
}

/**
 * Undo/Redo.
 *
 * Braindot keeps its own undo stack in `useEditor`, so the native `undo` role
 * (which performs Chromium's DOM-level undo) would desync it. Both platforms
 * therefore route menu clicks to the app's stack via IPC.
 *
 * On Windows the accelerator is displayed but not registered, so the keystroke
 * still reaches the editor's own handler. On macOS it cannot be displayed
 * without also being registered, and a registered Cmd+Z would fire even when
 * focus is in the search box — so macOS shows the items without accelerators
 * and lets the editor keep the keystroke. Cmd+Z still works everywhere it did
 * before; it just is not advertised in the menu.
 */
function undoRedoItems(send) {
  if (isMac) {
    return [
      { label: 'Undo', click: () => send('undo') },
      { label: 'Redo', click: () => send('redo') },
    ];
  }
  return [
    {
      label: 'Undo',
      accelerator: 'CmdOrCtrl+Z',
      registerAccelerator: false,
      click: () => send('undo'),
    },
    {
      label: 'Redo',
      accelerator: 'CmdOrCtrl+Y',
      registerAccelerator: false,
      click: () => send('redo'),
    },
  ];
}

function buildTemplate({ send, openSettings, openLog, importVault, restartServer }) {
  const view = (label, accelerator, target) => ({
    label,
    accelerator,
    click: () => send('navigate', target),
  });

  /** macOS puts Settings, About and Quit in the application menu, not in File. */
  const appMenu = {
    label: app.name,
    submenu: [
      { role: 'about', label: 'About Braindot' },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'Cmd+,', click: () => openSettings() },
      { label: 'Restart App Server', click: () => restartServer() },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: 'Hide Braindot' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: 'Quit Braindot' },
    ],
  };

  const fileMenu = {
    label: '&File',
    submenu: [
      passthrough('New Note', 'CmdOrCtrl+T', 'new-note', send),
      passthrough("Today's Journal", 'CmdOrCtrl+J', 'new-journal', send),
      { type: 'separator' },
      passthrough('Save', 'CmdOrCtrl+S', 'save', send),
      passthrough('Close Tab', 'CmdOrCtrl+W', 'close-tab', send),
      { type: 'separator' },
      { label: 'Import Vault or Note…', click: () => importVault() },
      { label: 'Export Note as Markdown…', click: () => send('export-note') },
      { label: 'Export Vault as JSON…', click: () => send('export-vault') },
      // Settings, restart and quit live in the app menu on macOS.
      ...(isMac
        ? []
        : [
            { type: 'separator' },
            { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => openSettings() },
            { label: 'Restart App Server', click: () => restartServer() },
            { type: 'separator' },
            { role: 'quit', label: 'Exit', accelerator: 'CmdOrCtrl+Q' },
          ]),
    ],
  };

  const editMenu = {
    label: '&Edit',
    submenu: [
      ...undoRedoItems(send),
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle', label: 'Paste as Plain Text' },
      { role: 'delete' },
      { role: 'selectAll' },
    ],
  };

  const viewMenu = {
    label: '&View',
    submenu: [
      view('Dashboard', 'CmdOrCtrl+1', 'dashboard'),
      view('Notes', 'CmdOrCtrl+2', 'notes'),
      view('Search', 'CmdOrCtrl+3', 'search'),
      view('Graph', 'CmdOrCtrl+4', 'graph'),
      view('Kanban & Todos', 'CmdOrCtrl+5', 'kanban'),
      view('Canvas', 'CmdOrCtrl+6', 'canvas'),
      view('Reading', 'CmdOrCtrl+7', 'reading'),
      { type: 'separator' },
      passthrough('Command Palette', 'CmdOrCtrl+K', 'command-palette', send),
      { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+Shift+L', click: () => send('toggle-theme') },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'reload', accelerator: 'CmdOrCtrl+R' },
      // The role carries the right default per platform (F12 on Windows,
      // Cmd+Alt+I on macOS), so do not override it.
      { role: 'toggleDevTools' },
    ],
  };

  const windowMenu = {
    label: '&Window',
    submenu: isMac
      ? [
          { role: 'minimize' },
          { role: 'zoom' },
          // Cmd+W is Close Tab above, so the window gets the shifted variant —
          // the same split VS Code uses.
          { role: 'close', label: 'Close Window', accelerator: 'Cmd+Shift+W' },
          { type: 'separator' },
          { role: 'front' },
        ]
      : [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'close' }],
  };

  const helpMenu = {
    label: '&Help',
    role: 'help',
    submenu: [
      {
        label: 'Braindot on the Web',
        click: () => shell.openExternal('https://braindot.vercel.app'),
      },
      { label: 'Show Logs', click: () => openLog() },
      ...(isMac ? [] : [{ type: 'separator' }, { label: `Version ${app.getVersion()}`, enabled: false }]),
    ],
  };

  return [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ];
}

function install(handlers) {
  const menu = Menu.buildFromTemplate(buildTemplate(handlers));
  Menu.setApplicationMenu(menu);
  return menu;
}

module.exports = { install };
