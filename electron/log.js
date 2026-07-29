'use strict';

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

/**
 * A deliberately small file logger.
 *
 * When the packaged app fails, it usually fails in the child Node process that
 * serves the app — and there is no terminal attached to read its stderr. This
 * writes both sides to one file so the error dialog can point at something
 * useful.
 */

const MAX_BYTES = 1024 * 1024; // rotate at 1MB, keep one previous file

let stream = null;
let logFile = null;

function filePath() {
  if (!logFile) logFile = path.join(app.getPath('userData'), 'logs', 'desktop.log');
  return logFile;
}

function rotateIfLarge(file) {
  try {
    const { size } = fs.statSync(file);
    if (size < MAX_BYTES) return;
    fs.rmSync(`${file}.1`, { force: true });
    fs.renameSync(file, `${file}.1`);
  } catch {
    // No file yet, or it is locked — either way, just keep appending.
  }
}

function open() {
  if (stream) return stream;
  const file = filePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  rotateIfLarge(file);
  stream = fs.createWriteStream(file, { flags: 'a' });
  return stream;
}

function stamp() {
  return new Date().toISOString();
}

function writeLine(level, parts) {
  const text = parts
    .map((p) => (typeof p === 'string' ? p : safeInspect(p)))
    .join(' ');
  const line = `[${stamp()}] ${level} ${text}\n`;
  try {
    open().write(line);
  } catch {
    // Logging must never take the app down.
  }
  if (!app.isPackaged) process.stdout.write(line);
}

function safeInspect(value) {
  if (value instanceof Error) return value.stack || value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Raw passthrough for child-process output, which already has its own lines. */
function writeRaw(prefix, chunk) {
  const text = chunk.toString().replace(/\s+$/, '');
  if (!text) return;
  for (const line of text.split(/\r?\n/)) {
    writeLine(prefix, [line]);
  }
}

module.exports = {
  filePath,
  info: (...parts) => writeLine('INFO ', parts),
  warn: (...parts) => writeLine('WARN ', parts),
  error: (...parts) => writeLine('ERROR', parts),
  raw: writeRaw,
};
