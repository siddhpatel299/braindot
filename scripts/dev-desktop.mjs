#!/usr/bin/env node
/**
 * Development loop: `next dev` in one process, Electron pointed at it in
 * another. Fast refresh keeps working, because the renderer is talking to the
 * ordinary dev server — the shell is the only thing that differs from
 * `bun run dev`.
 *
 * Ctrl+C, closing the app window, or either process dying takes both down.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || '3000';
const devUrl = `http://localhost:${PORT}`;

let shuttingDown = false;
const children = [];

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }
  }
  process.exit(code);
}

function run(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
    // next is a .cmd shim on Windows when invoked by name; we invoke the JS
    // entry points directly instead, so no shell is needed.
    shell: false,
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    process.stdout.write(`\n${label} exited (code=${code} signal=${signal}) — stopping.\n`);
    shutdown(code ?? 0);
  });
  child.on('error', (err) => {
    process.stderr.write(`\n${label} failed to start: ${err.message}\n`);
    shutdown(1);
  });
  children.push(child);
  return child;
}

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const electronBin = path.join(root, 'node_modules', 'electron', 'cli.js');

for (const [name, file] of [['next', nextBin], ['electron', electronBin]]) {
  if (!fs.existsSync(file)) {
    process.stderr.write(`${name} is not installed — run \`bun install\` first.\n`);
    process.exit(1);
  }
}

process.stdout.write(`\n\x1b[35m▸\x1b[0m dev server on ${devUrl}, Electron will attach\n\n`);

run('next dev', process.execPath, [nextBin, 'dev', '-p', PORT]);

// electron/next-server.js polls the dev URL until it answers, so there is no
// need to sleep here — the splash window covers the wait.
run('electron', process.execPath, [electronBin, root], {
  BRAINDOT_DEV_URL: devUrl,
  ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(0));
}
