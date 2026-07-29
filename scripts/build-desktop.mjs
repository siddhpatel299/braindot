#!/usr/bin/env node
/**
 * Assemble the Next.js server that ships inside the desktop app.
 *
 * `next build` with output:"standalone" emits a server plus only the
 * node_modules it actually traced — but it deliberately leaves out the static
 * assets, on the assumption that a CDN serves them. Electron has no CDN, so we
 * copy them back in and end up with one directory that runs on its own:
 *
 *     desktop-build/server/
 *       server.js          <- entry point, spawned by electron/next-server.js
 *       node_modules/      <- traced dependencies only
 *       .next/static/      <- client chunks and CSS
 *       public/            <- logo, robots.txt
 *       desktop-env.json   <- non-secret build-time values
 *
 * electron-builder then drops that directory into resources/server.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Must match `distDir` in next.config.ts for the desktop target. */
const DIST_DIR = '.next-desktop';
const standalone = path.join(root, DIST_DIR, 'standalone');
const outDir = path.join(root, 'desktop-build', 'server');

/** Values baked into the bundle. Secrets are NOT included — see electron/config.js. */
const PUBLIC_ENV_KEYS = ['NEXT_PUBLIC_CONVEX_URL'];

function step(message) {
  process.stdout.write(`\n\x1b[35m▸\x1b[0m ${message}\n`);
}

function fail(message) {
  process.stderr.write(`\n\x1b[31m✗ ${message}\x1b[0m\n`);
  process.exit(1);
}

/**
 * Minimal .env reader. Next loads these itself during the build; we need the
 * same values here to write desktop-env.json, and pulling in a dependency for
 * KEY=value would be silly.
 */
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Same precedence Next uses: .env.local wins over .env, real env wins over both. */
function collectEnv() {
  const merged = {
    ...readEnvFile(path.join(root, '.env')),
    ...readEnvFile(path.join(root, '.env.local')),
  };
  const out = {};
  for (const key of PUBLIC_ENV_KEYS) {
    out[key] = process.env[key] || merged[key] || '';
  }
  return out;
}

// ---------------------------------------------------------------- build

const env = collectEnv();

if (!env.NEXT_PUBLIC_CONVEX_URL) {
  fail(
    'NEXT_PUBLIC_CONVEX_URL is not set.\n' +
      '  Convex is what syncs the vault, and Next inlines NEXT_PUBLIC_* at build\n' +
      '  time — building without it produces a desktop app that can never sign in.\n' +
      '  Set it in .env.local and run this again.',
  );
}

step('Building Next.js (standalone output)');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!fs.existsSync(nextBin)) fail('next is not installed — run `bun install` first.');

const build = spawnSync(process.execPath, [nextBin, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ...env, BUILD_TARGET: 'desktop', NEXT_TELEMETRY_DISABLED: '1' },
});
if (build.status !== 0) fail(`next build exited with code ${build.status}`);

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  fail(
    `No ${DIST_DIR}/standalone/server.js was produced.\n` +
      '  next.config.ts only switches on standalone when BUILD_TARGET=desktop.',
  );
}

// ---------------------------------------------------------------- assemble

step('Assembling desktop-build/server');
fs.rmSync(path.join(root, 'desktop-build'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.cpSync(standalone, outDir, { recursive: true });

// Standalone omits these two on purpose — it assumes a CDN serves them.
// Without them every page 404s its CSS and JS chunks. The destination keeps the
// distDir name, because that is the path the generated server resolves against.
fs.cpSync(path.join(root, DIST_DIR, 'static'), path.join(outDir, DIST_DIR, 'static'), {
  recursive: true,
});
if (fs.existsSync(path.join(root, 'public'))) {
  fs.cpSync(path.join(root, 'public'), path.join(outDir, 'public'), { recursive: true });
}

// src/app/landing/route.ts reads this file relative to cwd. It is prerendered
// at build time, and the desktop shell routes /landing to /auth anyway, but
// shipping it means the route still works if it is ever hit dynamically.
const landingSrc = path.join(root, 'src', 'app', 'landing', 'landing.html');
if (fs.existsSync(landingSrc)) {
  const landingDest = path.join(outDir, 'src', 'app', 'landing');
  fs.mkdirSync(landingDest, { recursive: true });
  fs.copyFileSync(landingSrc, path.join(landingDest, 'landing.html'));
}

// Next's standalone output copies the project's .env files in beside the
// server. Nothing in the desktop app should read them — runtime config lives in
// %APPDATA%\braindot\config.json — and an installer must never be a way to hand
// someone your keys. Strip them unconditionally rather than trusting that
// whichever .env got copied happened to be the harmless one.
for (const entry of fs.readdirSync(outDir)) {
  if (entry === '.env' || entry.startsWith('.env.')) {
    fs.rmSync(path.join(outDir, entry), { force: true });
    process.stdout.write(`  removed ${entry} from the bundle\n`);
  }
}

fs.writeFileSync(
  path.join(outDir, 'desktop-env.json'),
  JSON.stringify(env, null, 2) + '\n',
  'utf8',
);

// ---------------------------------------------------------------- report

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

const mb = (dirSize(outDir) / 1024 / 1024).toFixed(1);
process.stdout.write(
  `\n\x1b[32m✓\x1b[0m Server bundle ready — ${mb} MB in desktop-build/server\n` +
    `  Convex: ${env.NEXT_PUBLIC_CONVEX_URL}\n` +
    '  Next: `bun run desktop:dist` to build the Windows installer.\n\n',
);
