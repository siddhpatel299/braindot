// Braindot — turning a vault into a folder of files somebody else's app can open.
//
// The point of an export is not backup, it is exit. Years of writing should
// never be hostage to whether this app still exists, so what comes out is
// plain markdown in the folder tree you filed it under, with front matter in
// the convention Obsidian and every static-site generator already read.
//
// Deliberately not a serialisation of the database. Tasks and highlights come
// out as readable markdown rather than as a dump of their rows, because a dump
// is only useful for importing back into this app, and this app is the one
// thing the export is meant to survive. The JSON export next to this one is
// the round-trip format; this one is the exit.
//
// Pure functions over plain data: the image bytes and the zipping happen in
// the caller (hooks/useVaultExport), so everything below is testable.

import type { Bookmark, CanvasBoard, Folder, Highlight, LibraryItem, Note, Task } from '@/types';
import { IMAGE_SCHEME } from './imageStore.ts';

export interface ExportFile {
  path: string;
  content: string;
}

export interface VaultInput {
  notes: Note[];
  folders: Folder[];
  tasks: Task[];
  library: LibraryItem[];
  highlights: Highlight[];
  bookmarks: Bookmark[];
  boards: CanvasBoard[];
}

export const ATTACHMENTS_DIR = '_attachments';

/* ============================================================
   Names
   ============================================================ */

/** Characters Windows, macOS and Linux between them refuse in a filename,
 *  plus the control range. Spaces and hyphens are deliberately absent:
 *  "My Note.md" is a better filename than "My-Note.md", and every
 *  filesystem still in use takes it. */
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;
/** Windows will not create a file with any of these stems, extension or not. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A filename that will survive being unzipped on any machine.
 *
 * Trailing dots and spaces go because Windows silently strips them, which
 * turns two distinct notes into one collision at extraction time.
 */
export function safeName(raw: string, fallback = 'untitled'): string {
  let name = raw.replace(ILLEGAL, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  // A title of pure punctuation sanitises to a row of hyphens, which is a
  // legal filename and a useless one. Any letter or digit in any script
  // counts — "日本語" is a perfectly good name and must not fall back.
  if (!/[\p{L}\p{N}]/u.test(name)) name = fallback;
  if (RESERVED.test(name)) name = `${name}-`;
  return name.slice(0, 80).replace(/[. ]+$/, '') || fallback;
}

/**
 * Hand out a path nothing else has taken.
 *
 * Two notes called "Inbox" in one folder is ordinary in a slip-box and fatal
 * in a filesystem, so the second becomes "Inbox 2". Compared case-insensitively
 * because macOS and Windows both are.
 */
function uniquePath(taken: Set<string>, dir: string, name: string, ext: string): string {
  const base = dir ? `${dir}/${name}` : name;
  let candidate = `${base}${ext}`;
  let n = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} ${n}${ext}`;
    n++;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/* ============================================================
   Front matter
   ============================================================ */

/** Bare words YAML reads as booleans or null rather than as text. */
const RESERVED_YAML = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);

/** YAML needs quoting far more often than it looks. Anything that could start
 *  a different YAML type, or that carries a colon, is quoted and escaped. */
function yamlString(value: string): string {
  if (value === '') return '""';
  if (/^[A-Za-z0-9][A-Za-z0-9 _.\-]*$/.test(value) && !RESERVED_YAML.has(value.toLowerCase())) {
    return value;
  }
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function frontMatter(fields: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${key}: [${value.map(yamlString).join(', ')}]`);
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${yamlString(value)}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n');
}

/* ============================================================
   Images
   ============================================================ */

const LOCAL_IMAGE = new RegExp(
  `(!\\[[^\\]]*\\]\\()${IMAGE_SCHEME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^)\\s]+)(\\))`,
  'g',
);

/** Every device-local image the vault refers to, deduplicated. */
export function referencedImageIds(notes: Note[]): string[] {
  const ids: string[] = [];
  for (const note of notes) {
    for (const m of note.body.matchAll(LOCAL_IMAGE)) {
      if (!ids.includes(m[2])) ids.push(m[2]);
    }
  }
  return ids;
}

/**
 * Point a note's images at the files travelling with it.
 *
 * The link is relative and walks up out of however deep the note is filed,
 * so the folder tree can be moved anywhere and the pictures still resolve.
 * An id with no file — bytes that were only ever on another device — keeps
 * its original ref rather than becoming a link to nothing.
 */
export function rewriteImagePaths(
  body: string,
  fileById: Map<string, string>,
  depth: number,
): string {
  const up = depth > 0 ? '../'.repeat(depth) : './';
  return body.replace(LOCAL_IMAGE, (match, open: string, id: string, close: string) => {
    const file = fileById.get(id);
    return file ? `${open}${up}${ATTACHMENTS_DIR}/${file}${close}` : match;
  });
}

/* ============================================================
   The tree
   ============================================================ */

/** Folder id → its path in the export, and how deep it sits. */
export function folderPaths(folders: Folder[]): Map<string, { dir: string; depth: number }> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out = new Map<string, { dir: string; depth: number }>();
  // Names are made unique per parent, so two sibling folders called "Notes"
  // do not merge into one directory and silently interleave their contents.
  const takenPerParent = new Map<string, Set<string>>();

  function resolve(folder: Folder, seen: Set<string>): { dir: string; depth: number } {
    const cached = out.get(folder.id);
    if (cached) return cached;
    // A cycle means a corrupt tree; treat the folder as top-level rather than
    // recursing forever.
    if (seen.has(folder.id)) return { dir: '', depth: 0 };
    seen.add(folder.id);

    const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    const base = parent ? resolve(parent, seen) : { dir: '', depth: 0 };

    const key = base.dir.toLowerCase();
    let taken = takenPerParent.get(key);
    if (!taken) { taken = new Set(); takenPerParent.set(key, taken); }

    let name = safeName(folder.name, 'folder');
    let candidate = name;
    let n = 2;
    while (taken.has(candidate.toLowerCase())) { candidate = `${name} ${n}`; n++; }
    taken.add(candidate.toLowerCase());
    name = candidate;

    const resolved = {
      dir: base.dir ? `${base.dir}/${name}` : name,
      depth: base.depth + 1,
    };
    out.set(folder.id, resolved);
    return resolved;
  }

  for (const folder of folders) resolve(folder, new Set());
  return out;
}

/* ============================================================
   Files
   ============================================================ */

function noteFile(
  note: Note,
  dir: string,
  depth: number,
  fileById: Map<string, string>,
): string {
  return (
    frontMatter({
      title: note.title || 'Untitled',
      subtitle: note.subtitle,
      tags: note.tags,
      created: note.createdAt,
      updated: note.updatedAt,
      status: note.status,
      pinned: note.pinned || undefined,
    }) +
    // The H1 is not repeated from the title: front matter already carries it,
    // and every markdown app that reads front matter shows it as the heading.
    `${rewriteImagePaths(note.body, fileById, depth)}\n`
  );
}

function tasksFile(tasks: Task[], notesById: Map<string, Note>): string {
  const order: Task['state'][] = ['doing', 'review', 'backlog', 'done'];
  const label: Record<string, string> = {
    doing: 'Doing', review: 'Review', backlog: 'Backlog', done: 'Done',
  };
  const lines = ['# Tasks', ''];
  for (const state of order) {
    const inState = tasks.filter((t) => t.state === state).sort((a, b) => a.order - b.order);
    if (inState.length === 0) continue;
    lines.push(`## ${label[state]}`, '');
    for (const t of inState) {
      const linked = t.linkedNoteId ? notesById.get(t.linkedNoteId) : undefined;
      const bits: string[] = [];
      if (t.dueDate) bits.push(`due ${t.dueDate}`);
      if (t.effort) bits.push(t.effort);
      if (linked) bits.push(`[[${linked.title}]]`);
      lines.push(
        `- [${state === 'done' ? 'x' : ' '}] ${t.title}${bits.length ? ` — ${bits.join(' · ')}` : ''}`,
      );
      if (t.description?.trim()) {
        for (const line of t.description.trim().split('\n')) lines.push(`  ${line}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

function bookFile(
  item: LibraryItem,
  marks: Highlight[],
  places: Bookmark[],
  notesById: Map<string, Note>,
): string {
  const body: string[] = [
    frontMatter({
      title: item.title,
      author: item.author ?? undefined,
      type: item.type,
      source: item.source,
      status: item.status,
      progress: item.progress,
      added: item.addedAt,
    }),
  ];

  if (marks.length > 0) {
    body.push('## Highlights', '');
    for (const h of marks) {
      body.push(`> ${h.text.trim().replace(/\n/g, '\n> ')}`);
      const notes: string[] = [];
      if (h.page !== null) notes.push(`p. ${h.page}`);
      const promoted = h.noteId ? notesById.get(h.noteId) : undefined;
      if (promoted) notes.push(`[[${promoted.title}]]`);
      if (notes.length) body.push(`> — ${notes.join(' · ')}`);
      if (h.note?.trim()) body.push('', h.note.trim());
      body.push('');
    }
  }

  if (places.length > 0) {
    body.push('## Bookmarks', '');
    for (const b of places) body.push(`- ${b.label} (chapter ${b.chapter + 1})`);
    body.push('');
  }

  if (marks.length === 0 && places.length === 0) {
    body.push(`*Nothing marked yet.*${item.excerpt ? `\n\n${item.excerpt}` : ''}`, '');
  }

  return body.join('\n');
}

function readme(input: VaultInput, when: Date, imageCount: number): string {
  const stamp = when.toISOString().slice(0, 10);
  return [
    '# Braindot export',
    '',
    `Everything in this vault as of ${stamp}.`,
    '',
    `- **${input.notes.length}** notes, in the folders you filed them under`,
    `- **${imageCount}** images in \`${ATTACHMENTS_DIR}/\`, linked from the notes that use them`,
    `- **${input.tasks.length}** tasks in \`_tasks.md\``,
    `- **${input.library.length}** books and articles in \`_reading/\`, with their highlights`,
    `- **${input.boards.length}** canvas boards in \`_canvas/\``,
    '',
    'Notes are plain markdown with YAML front matter, so Obsidian, Logseq and',
    'most static-site generators will read this folder as-is. Links between',
    'notes are left as `[[wiki-links]]`, which is the same convention.',
    '',
    'Canvas boards are JSON: a board is positions on a plane and markdown has',
    'nowhere to put that. Everything else here is readable without any app.',
    '',
  ].join('\n');
}

/* ============================================================
   Assembly
   ============================================================ */

/**
 * Every file in the export except the image bytes.
 *
 * `imageFileById` maps a local image id to the filename the caller is putting
 * in `_attachments/`; ids missing from it keep their original refs.
 */
export function buildVaultFiles(
  input: VaultInput,
  imageFileById: Map<string, string>,
  when: Date = new Date(),
): ExportFile[] {
  const files: ExportFile[] = [];
  const taken = new Set<string>();
  const dirs = folderPaths(input.folders);
  const notesById = new Map(input.notes.map((n) => [n.id, n]));

  files.push({ path: 'README.md', content: readme(input, when, imageFileById.size) });

  // Notes, in the tree. A note whose folder no longer exists lands at the top
  // rather than being dropped — an export that quietly loses writing is worse
  // than one with a stray file in it.
  for (const note of input.notes) {
    const place = dirs.get(note.folderId) ?? { dir: '', depth: 0 };
    const path = uniquePath(taken, place.dir, safeName(note.title, 'untitled'), '.md');
    files.push({ path, content: noteFile(note, place.dir, place.depth, imageFileById) });
  }

  if (input.tasks.length > 0) {
    files.push({ path: '_tasks.md', content: tasksFile(input.tasks, notesById) });
  }

  const readingTaken = new Set<string>();
  for (const item of input.library) {
    const marks = input.highlights.filter((h) => h.libraryItemId === item.id);
    const places = input.bookmarks.filter((b) => b.libraryItemId === item.id);
    const path = uniquePath(readingTaken, '_reading', safeName(item.title, 'untitled'), '.md');
    files.push({ path, content: bookFile(item, marks, places, notesById) });
  }

  const canvasTaken = new Set<string>();
  for (const board of input.boards) {
    const path = uniquePath(canvasTaken, '_canvas', safeName(board.name, 'board'), '.json');
    files.push({ path, content: `${JSON.stringify(board, null, 2)}\n` });
  }

  return files;
}

/** What the downloaded archive is called. */
export function exportFilename(when: Date = new Date()): string {
  return `braindot-${when.toISOString().slice(0, 10)}.zip`;
}
