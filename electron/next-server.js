'use strict';

const { app } = require('electron');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const log = require('./log');
const config = require('./config');

/**
 * Owns the Next.js server that backs the desktop app.
 *
 * In development we attach to whatever `next dev` is already serving. In a
 * packaged build we spawn the standalone server that `desktop:build` assembled
 * into resources/server, and we spawn it with Electron's own binary in Node
 * mode (ELECTRON_RUN_AS_NODE) — that is what lets the app run on a machine
 * with no Node installed.
 */

const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 150;

/**
 * The port has to be *stable across launches*, not merely free.
 *
 * Braindot keeps the whole vault in localStorage, and localStorage is scoped to
 * an origin — scheme, host and port. Handing the app a fresh ephemeral port on
 * every launch would therefore hand it an empty vault every launch. So we pick
 * a port once, remember it, and only move if it is genuinely taken.
 */
const DEFAULT_PORT = 41573;

let child = null;
let origin = null;
let chosenPort = null;
let stopping = false;
let onUnexpectedExit = null;

function portFile() {
  return path.join(app.getPath('userData'), 'port.json');
}

function readSavedPort() {
  try {
    const { port } = JSON.parse(fs.readFileSync(portFile(), 'utf8'));
    return Number.isInteger(port) && port > 1024 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

function savePort(port) {
  try {
    fs.mkdirSync(path.dirname(portFile()), { recursive: true });
    fs.writeFileSync(portFile(), JSON.stringify({ port }, null, 2) + '\n', 'utf8');
  } catch (err) {
    log.warn('could not persist port:', err);
  }
}

/** Can we bind this exact port right now? */
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, HOST, () => {
      probe.close(() => resolve(true));
    });
  });
}

/** Ask the OS for any free port — the fallback when our remembered one is taken. */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

/**
 * The port to serve on: the one we used last time if it is still available,
 * otherwise a new one (which does cost the local cache — logged loudly, since
 * it is the one situation where a user sees their local vault reload).
 */
async function resolvePort() {
  if (chosenPort) return chosenPort;

  const preferred = readSavedPort() || DEFAULT_PORT;
  if (await isPortFree(preferred)) {
    chosenPort = preferred;
    if (preferred !== readSavedPort()) savePort(preferred);
    return chosenPort;
  }

  const fallback = await findFreePort();
  log.warn(
    `port ${preferred} is taken; moving to ${fallback}.`,
    'Locally cached vault state is scoped to the old origin and will be re-synced from Convex.',
  );
  chosenPort = fallback;
  savePort(fallback);
  return chosenPort;
}

/**
 * Resolve to true as soon as the port answers HTTP at all. We deliberately do
 * not care about the status code — a 404 still proves the server is listening,
 * and that keeps this check independent of which routes happen to exist.
 */
function pingOnce(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port, path: '/api', timeout: 2000 },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitUntilReady(port, deadline) {
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`server exited with code ${child.exitCode} before it became ready`);
    }
    if (await pingOnce(port)) return;
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
  throw new Error(`server did not respond within ${Math.round(READY_TIMEOUT_MS / 1000)}s`);
}

/** Where `desktop:build` puts the assembled standalone server. */
function serverDir() {
  return path.join(process.resourcesPath, 'server');
}

function serverEntry() {
  return path.join(serverDir(), 'server.js');
}

/**
 * Start the server and resolve with its origin. Safe to call once; callers get
 * the existing origin back on a second call.
 */
async function start() {
  if (origin) return origin;

  if (!app.isPackaged) {
    // `bun run desktop:dev` starts next dev separately; we just point at it.
    const devOrigin = process.env.BRAINDOT_DEV_URL || 'http://localhost:3000';
    log.info('dev mode — attaching to', devOrigin);
    const port = Number(new URL(devOrigin).port || 80);
    await waitUntilReady(port, Date.now() + READY_TIMEOUT_MS);
    origin = devOrigin;
    return origin;
  }

  const entry = serverEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `The bundled app server is missing (expected ${entry}). ` +
        'This build was packaged without running `bun run desktop:build`.',
    );
  }
  // Checked separately because electron-builder will happily package the server
  // while filtering its node_modules away, which fails much less legibly later.
  if (!fs.existsSync(path.join(serverDir(), 'node_modules'))) {
    throw new Error(
      'The bundled app server has no node_modules. The extraResources filter in ' +
        'electron-builder.yml is what keeps them, and this build lost them.',
    );
  }

  const port = await resolvePort();
  const env = {
    ...process.env,
    ...config.read(),
    // Run Electron's bundled Node instead of requiring a system Node install.
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    PORT: String(port),
    HOSTNAME: HOST,
    // Next prints a banner with the URL; nothing reads it here, but the log does.
    NEXT_TELEMETRY_DISABLED: '1',
  };

  log.info('starting bundled server on port', String(port));
  stopping = false;

  const proc = spawn(process.execPath, [entry], {
    cwd: serverDir(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child = proc;

  proc.stdout.on('data', (c) => log.raw('SRV  ', c));
  proc.stderr.on('data', (c) => log.raw('SRV! ', c));

  proc.on('exit', (code, signal) => {
    log.info('server exited', `code=${code}`, `signal=${signal}`);
    // A restart replaces `child` before the old process finishes dying; only
    // the process we currently consider live may report an unexpected exit.
    if (child !== proc) return;
    const wasStopping = stopping;
    child = null;
    origin = null;
    if (!wasStopping && typeof onUnexpectedExit === 'function') {
      onUnexpectedExit(code, signal);
    }
  });

  proc.on('error', (err) => log.error('failed to spawn server:', err));

  await waitUntilReady(port, Date.now() + READY_TIMEOUT_MS);
  origin = `http://${HOST}:${port}`;
  log.info('server ready at', origin);
  return origin;
}

/**
 * Stop the server. On Windows a plain kill() can leave the process alive if it
 * ever spawns children of its own, so fall back to a tree kill.
 */
function stop() {
  if (!child) return;
  stopping = true;
  const pid = child.pid;
  log.info('stopping server', `pid=${pid}`);

  try {
    child.kill();
  } catch (err) {
    log.warn('kill failed:', err);
  }

  if (process.platform === 'win32' && pid) {
    // /T takes the process tree, /F forces it. Errors here are expected when
    // the process already exited cleanly above.
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
  }

  child = null;
  origin = null;
}

module.exports = {
  start,
  stop,
  getOrigin: () => origin,
  setUnexpectedExitHandler: (fn) => {
    onUnexpectedExit = fn;
  },
};
