'use strict';

const { app, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Remembers where the window was, and refuses to restore it somewhere you
 * cannot see. Unplugging a second monitor between runs is the usual way an app
 * ends up opening at x=2400 on a machine that is now 1920 wide.
 */

const DEFAULTS = { width: 1440, height: 900 };
const MINIMUM = { width: 960, height: 620 };
const SAVE_DEBOUNCE_MS = 400;

let saveTimer = null;

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** True when the saved rectangle meaningfully overlaps some current display. */
function isVisibleOnSomeDisplay(bounds) {
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return false;
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    // Require a real chunk of titlebar to be reachable, not one stray pixel.
    return overlapX > 120 && overlapY > 60;
  });
}

/** Options to hand to the BrowserWindow constructor. */
function restore() {
  const saved = readState();
  const primary = screen.getPrimaryDisplay().workArea;

  const width = clamp(saved.width, MINIMUM.width, Math.max(MINIMUM.width, primary.width)) || DEFAULTS.width;
  const height = clamp(saved.height, MINIMUM.height, Math.max(MINIMUM.height, primary.height)) || DEFAULTS.height;

  const bounds = { x: saved.x, y: saved.y, width, height };
  const placed = isVisibleOnSomeDisplay(bounds);

  return {
    width,
    height,
    ...(placed ? { x: saved.x, y: saved.y } : {}),
    minWidth: MINIMUM.width,
    minHeight: MINIMUM.height,
    isMaximized: saved.isMaximized === true,
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(Math.max(Math.round(value), min), max);
}

function persist(win) {
  if (!win || win.isDestroyed()) return;
  try {
    // getNormalBounds() is the un-maximized rectangle, which is what we want to
    // restore to when the user un-maximizes later.
    const bounds = win.getNormalBounds();
    const state = { ...bounds, isMaximized: win.isMaximized() };
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2) + '\n', 'utf8');
  } catch {
    // Losing window position is not worth surfacing to the user.
  }
}

/** Track a window: debounced saves while moving, one final save on close. */
function manage(win) {
  const schedule = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(win), SAVE_DEBOUNCE_MS);
  };

  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('maximize', schedule);
  win.on('unmaximize', schedule);
  win.on('close', () => {
    clearTimeout(saveTimer);
    persist(win);
  });
}

module.exports = { restore, manage, MINIMUM };
