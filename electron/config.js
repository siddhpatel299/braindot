'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Runtime configuration for the desktop app.
 *
 * Secrets are deliberately NOT baked into the packaged bundle — an installer
 * you hand to someone else should not carry your OpenAI key. Everything the
 * bundled Next server needs at runtime is read from
 *
 *     %APPDATA%/braindot/config.json
 *
 * which the user owns and can edit (Settings, or File > Open config folder).
 * A real environment variable, if one is set when the app launches, wins over
 * the file — that is what makes `OPENAI_API_KEY=... braindot.exe` work.
 *
 * NEXT_PUBLIC_CONVEX_URL is the exception: Next inlines NEXT_PUBLIC_* into the
 * client bundle at build time, so the value baked in by `desktop:build` is the
 * one the renderer actually talks to. It is kept here only so the server half
 * sees the same value, and so Settings can show you which deployment you are
 * pointed at.
 */

/** Keys we persist and forward to the Next server, with their defaults. */
const DEFAULTS = {
  OPENAI_API_KEY: '',
  OPENAI_MODEL: 'gpt-4o-mini',
  NEXT_PUBLIC_CONVEX_URL: '',
};

/** Keys that must never be written to the log or shown in full. */
const SECRET_KEYS = new Set(['OPENAI_API_KEY']);

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

/**
 * Values captured at build time, shipped alongside the server bundle. Only
 * non-secret values land here (see scripts/build-desktop.mjs) — it exists so a
 * fresh install already knows which Convex deployment to sync with.
 */
function buildTimeDefaults() {
  try {
    const file = path.join(process.resourcesPath, 'server', 'desktop-env.json');
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function readFile() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    // Missing or corrupt config is not fatal — fall back to defaults and let
    // the next write heal the file.
    return {};
  }
}

/**
 * The effective config: defaults < build-time values < config.json < real env.
 * Returns a plain object of string values, safe to spread into a child env.
 */
function read() {
  const stored = readFile();
  const seeded = buildTimeDefaults();
  const out = {};

  for (const key of Object.keys(DEFAULTS)) {
    const fromEnv = process.env[key];
    const value =
      (typeof fromEnv === 'string' && fromEnv !== '' ? fromEnv : undefined) ??
      (typeof stored[key] === 'string' && stored[key] !== '' ? stored[key] : undefined) ??
      (typeof seeded[key] === 'string' && seeded[key] !== '' ? seeded[key] : undefined) ??
      DEFAULTS[key];
    out[key] = String(value);
  }

  return out;
}

/** Merge a partial update into config.json. Unknown keys are ignored. */
function write(patch) {
  const stored = readFile();
  for (const [key, value] of Object.entries(patch || {})) {
    if (!(key in DEFAULTS)) continue;
    stored[key] = typeof value === 'string' ? value.trim() : '';
  }

  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(stored, null, 2) + '\n', 'utf8');
  return read();
}

/** Create config.json on first run so there is something obvious to edit. */
function ensureFile() {
  const file = configPath();
  if (fs.existsSync(file)) return file;

  const seeded = buildTimeDefaults();
  const initial = {};
  for (const key of Object.keys(DEFAULTS)) {
    initial[key] = typeof seeded[key] === 'string' ? seeded[key] : DEFAULTS[key];
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(initial, null, 2) + '\n', 'utf8');
  return file;
}

/**
 * The same shape as read(), but with secrets reduced to a presence flag and a
 * masked hint. This is what crosses into a renderer.
 */
function readForRenderer() {
  const cfg = read();
  const out = {};
  for (const [key, value] of Object.entries(cfg)) {
    if (SECRET_KEYS.has(key)) {
      out[key] = {
        set: value !== '' && value !== 'mock',
        isMock: value === 'mock',
        hint: value ? maskSecret(value) : '',
      };
    } else {
      out[key] = value;
    }
  }
  out.configPath = configPath();
  return out;
}

function maskSecret(value) {
  if (value.length <= 8) return '•'.repeat(value.length);
  return `${value.slice(0, 3)}${'•'.repeat(12)}${value.slice(-4)}`;
}

module.exports = {
  DEFAULTS,
  SECRET_KEYS,
  configPath,
  ensureFile,
  read,
  readForRenderer,
  write,
};
