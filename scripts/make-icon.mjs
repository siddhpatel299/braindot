#!/usr/bin/env node
/**
 * Render the application icon.
 *
 * The brand mark is a terminal block caret (see public/logo.svg) — a bare
 * purple bar on transparency, which reads as a stray rectangle once Windows
 * shows it at 32px in a taskbar. So the app icon sets that same caret on a
 * dark rounded tile, which is what gives it a silhouette.
 *
 * electron-builder generates the .ico and the .icns from this PNG at package
 * time, so one source is all that is needed.
 *
 *     node scripts/make-icon.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'electron', 'build-assets');
// 1024 is what macOS wants for the largest .icns representation; electron-builder
// downsamples from here for both the .icns and the Windows .ico.
const SIZE = 1024;

// The caret keeps the aspect ratio of public/logo.svg (13:19), but sits a
// little smaller than a direct scale-up would put it. Filling the same
// proportion of a full-bleed tile as it does of the 32px logo box makes it
// read as a plain rounded rectangle; pulling it in gives it the margin that
// says "cursor".
const RATIO = 13 / 19;
const height = SIZE * 0.46;
const width = height * RATIO;
const caret = {
  x: (SIZE - width) / 2,
  y: (SIZE - height) / 2,
  width,
  height,
  rx: width * 0.17,
};

const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1c1a33"/>
      <stop offset="55%" stop-color="#141418"/>
      <stop offset="100%" stop-color="#0c0c0e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0%" stop-color="#7c6ef7" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#7c6ef7" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#9b90ff"/>
      <stop offset="100%" stop-color="#6f5ff5"/>
    </linearGradient>
  </defs>

  <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.215}" fill="url(#tile)"/>
  <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.215}" fill="url(#glow)"/>
  <rect x="1" y="1" width="${SIZE - 2}" height="${SIZE - 2}" rx="${SIZE * 0.215 - 1}"
        fill="none" stroke="#3d378a" stroke-opacity="0.55" stroke-width="2"/>

  <rect x="${caret.x}" y="${caret.y}" width="${caret.width}" height="${caret.height}"
        rx="${caret.rx}" fill="url(#mark)"/>
</svg>
`.trim();

fs.mkdirSync(outDir, { recursive: true });

const pngPath = path.join(outDir, 'icon.png');
await sharp(Buffer.from(svg)).png().toFile(pngPath);
fs.writeFileSync(path.join(outDir, 'icon.svg'), svg + '\n', 'utf8');

const { size } = fs.statSync(pngPath);
process.stdout.write(
  `\x1b[32m✓\x1b[0m icon written — ${SIZE}x${SIZE}, ${(size / 1024).toFixed(1)} KB\n` +
    `  ${path.relative(root, pngPath)}\n`,
);
