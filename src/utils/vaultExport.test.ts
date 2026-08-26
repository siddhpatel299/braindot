/**
 * Checks for the vault export, and for the zip writer under it.
 *
 * Run with:  npm run check:export
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * The export is the app's exit door, so what is worth checking is that nothing
 * silently fails to come out: every note gets a file, two notes that would
 * collide on disk both survive, and the archive a browser hands over is one a
 * real unzip program will open.
 */

import {
  buildVaultFiles, exportFilename, folderPaths, referencedImageIds,
  rewriteImagePaths, safeName,
} from './vaultExport.ts';
import { crc32, dosDateTime, makeZip } from './zip.ts';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

const IMG = 'braindot:img/';
const WHEN = new Date('2026-08-26T09:30:00.000Z');

let seq = 0;
function note(over: Record<string, any> = {}): any {
  seq++;
  return {
    id: over.id ?? `note_x${seq}`, filename: 'x.md', title: `Note ${seq}`,
    subtitle: '', tags: [], body: '', backlinks: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    wordCount: 0, status: 'draft', folderId: 'f_a', pinned: false, ...over,
  };
}
function folder(id: string, name: string, parentId: string | null = null): any {
  return { id, name, parentId, createdAt: '2026-01-01T00:00:00.000Z', expanded: true };
}
function emptyVault(over: Record<string, any> = {}): any {
  return {
    notes: [], folders: [], tasks: [], library: [],
    highlights: [], bookmarks: [], boards: [], ...over,
  };
}

/* ============================================================
   Filenames
   ============================================================ */

eq('a plain title is left alone', safeName('My Note'), 'My Note');
eq('path separators cannot escape the folder', safeName('a/b\\c'), 'a-b-c');
eq('the characters Windows refuses are replaced', safeName('what? <yes>: "no"|maybe*'), 'what- -yes-- -no--maybe-');
eq('a reserved device name is defused', safeName('CON'), 'CON-');
eq('trailing dots go, because Windows strips them silently', safeName('note...'), 'note');
eq('trailing spaces go for the same reason', safeName('note   '), 'note');
eq('an empty name falls back', safeName(''), 'untitled');
eq('a name of nothing but junk falls back', safeName('///'), 'untitled');
eq('a name in another script is kept', safeName('日本語'), '日本語');
check('a very long title is cut to something openable', safeName('A'.repeat(300)).length <= 80);
// A filename must never contain a path separator after sanitising, or the
// archive writes outside the folder it was extracted into.
for (const nasty of ['../../etc/passwd', 'a\\..\\b', 'x/y/z']) {
  check(`"${nasty}" cannot traverse`, !safeName(nasty).includes('/') && !safeName(nasty).includes('\\'),
    safeName(nasty));
}

/* ============================================================
   The folder tree
   ============================================================ */

const tree = [
  folder('f_p', 'Projects'),
  folder('f_deep', 'Deep', 'f_p'),
  folder('f_a', 'Areas'),
];
const dirs = folderPaths(tree);
eq('a top-level folder is one level deep', dirs.get('f_p'), { dir: 'Projects', depth: 1 });
eq('a nested folder carries its parent', dirs.get('f_deep'), { dir: 'Projects/Deep', depth: 2 });

// Two sibling folders with one name must not merge into a single directory
// and silently interleave their notes.
const twins = folderPaths([folder('f_1', 'Notes'), folder('f_2', 'Notes')]);
check('sibling folders sharing a name stay apart',
  twins.get('f_1')!.dir !== twins.get('f_2')!.dir,
  `${twins.get('f_1')!.dir} vs ${twins.get('f_2')!.dir}`);

// A corrupt tree must not hang the browser mid-export.
const cycleA = folder('f_ca', 'A', 'f_cb');
const cycleB = folder('f_cb', 'B', 'f_ca');
const cycled = folderPaths([cycleA, cycleB]);
check('a cyclic folder tree terminates', cycled.size === 2);

/* ============================================================
   Images
   ============================================================ */

const withImages = note({ body: `![a](${IMG}i1) and ![b](${IMG}i2) and ![a again](${IMG}i1)` });
eq('each referenced image is listed once', referencedImageIds([withImages]), ['i1', 'i2']);

const files = new Map([['i1', 'i1.webp']]);
eq('a note at the top links across',
  rewriteImagePaths(`![a](${IMG}i1)`, files, 0), '![a](./_attachments/i1.webp)');
eq('a note two folders deep walks back up',
  rewriteImagePaths(`![a](${IMG}i1)`, files, 2), '![a](../../_attachments/i1.webp)');
// Bytes that only ever existed on another device: better a ref that means
// something to this app than a link to a file that is not in the archive.
eq('an image with no file keeps its original ref',
  rewriteImagePaths(`![b](${IMG}i2)`, files, 1), `![b](${IMG}i2)`);
eq('an ordinary web image is untouched',
  rewriteImagePaths('![c](https://x/y.png)', files, 1), '![c](https://x/y.png)');

/* ============================================================
   The files that come out
   ============================================================ */

const vault = emptyVault({
  folders: tree,
  notes: [
    note({ id: 'n1', title: 'First', folderId: 'f_p', tags: ['research'], body: 'Body one.' }),
    note({ id: 'n2', title: 'Second', folderId: 'f_deep', body: `Deep ![a](${IMG}i1)` }),
    note({ id: 'n3', title: 'Loose', folderId: 'f_gone' }),
  ],
});
const out = buildVaultFiles(vault, new Map([['i1', 'i1.webp']]), WHEN);
const paths = out.map((f) => f.path);

check('there is a README explaining the archive', paths.includes('README.md'));
check('a note lands in its folder', paths.includes('Projects/First.md'), paths.join(' | '));
check('a nested note lands in its nested folder', paths.includes('Projects/Deep/Second.md'));
// An export that quietly loses writing is worse than one with a stray file.
check('a note whose folder is gone still comes out', paths.includes('Loose.md'), paths.join(' | '));
eq('every note produced exactly one file',
  paths.filter((p) => p.endsWith('.md') && p !== 'README.md').length, 3);

const first = out.find((f) => f.path === 'Projects/First.md')!.content;
check('front matter opens the file', first.startsWith('---\n'), first.slice(0, 40));
check('the title is in the front matter', first.includes('title: First'));
check('tags come out as a YAML list', first.includes('tags: [research]'));
check('the body follows the front matter', first.includes('Body one.'));
check('the title is not also repeated as a heading', !first.includes('# First'));

const second = out.find((f) => f.path === 'Projects/Deep/Second.md')!.content;
check('a nested note images relative to itself',
  second.includes('](../../_attachments/i1.webp)'), second);

// Two notes with one title in one folder is ordinary in a slip-box and fatal
// on a filesystem.
const collide = buildVaultFiles(
  emptyVault({
    folders: [folder('f_a', 'Areas')],
    notes: [note({ title: 'Inbox', folderId: 'f_a' }), note({ title: 'Inbox', folderId: 'f_a' })],
  }),
  new Map(), WHEN,
);
const collidePaths = collide.map((f) => f.path).filter((p) => p !== 'README.md');
eq('both same-named notes survive', collidePaths.length, 2);
eq('the second is renamed rather than overwriting the first',
  new Set(collidePaths).size, 2);

// Case-insensitive filesystems collide on names that differ only by case.
const casey = buildVaultFiles(
  emptyVault({
    folders: [folder('f_a', 'Areas')],
    notes: [note({ title: 'Inbox', folderId: 'f_a' }), note({ title: 'INBOX', folderId: 'f_a' })],
  }),
  new Map(), WHEN,
);
const caseyPaths = casey.map((f) => f.path).filter((p) => p !== 'README.md');
eq('names differing only in case do not collide',
  new Set(caseyPaths.map((p) => p.toLowerCase())).size, 2);

// Optional sections stay out of the archive when there is nothing in them.
const bare = buildVaultFiles(emptyVault(), new Map(), WHEN).map((f) => f.path);
eq('an empty vault still exports a README', bare, ['README.md']);

// YAML that would be read as something other than text.
const tricky = buildVaultFiles(
  emptyVault({ notes: [note({ title: 'Notes: a study', subtitle: 'yes' })] }),
  new Map(), WHEN,
).find((f) => f.path !== 'README.md')!.content;
check('a title with a colon is quoted', tricky.includes('title: "Notes: a study"'), tricky.slice(0, 80));
check('a subtitle YAML would read as a boolean is quoted', tricky.includes('subtitle: "yes"'), tricky.slice(0, 90));

check('the archive is named for the day it was made',
  exportFilename(WHEN) === 'braindot-2026-08-26.zip', exportFilename(WHEN));

/* ============================================================
   The archive itself
   ============================================================ */

// A known vector: CRC32 of "123456789" is 0xCBF43926 by definition.
eq('crc32 matches the standard check value',
  crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
eq('crc32 of nothing is zero', crc32(new Uint8Array(0)), 0);

const dt = dosDateTime(new Date(2026, 7, 26, 9, 30, 20));
eq('the DOS date encodes 26 Aug 2026', dt.date, ((2026 - 1980) << 9) | (8 << 5) | 26);
eq('the DOS time encodes 09:30:20', dt.time, (9 << 11) | (30 << 5) | 10);
// ZIP cannot represent anything before 1980; wrapping would give a nonsense year.
check('a pre-1980 date clamps rather than wrapping',
  dosDateTime(new Date(1970, 0, 1)).date >> 9 === 0);

const zipped = await makeZip(
  [
    { path: 'a.md', data: 'hello '.repeat(200) },
    { path: 'nested/b.txt', data: 'plain' },
    { path: 'img/c.png', data: new Uint8Array([1, 2, 3, 4]) },
    { path: 'empty.md', data: '' },
  ],
  WHEN,
);
const bytes = new Uint8Array(await zipped.arrayBuffer());

eq('the archive is served as a zip', zipped.type, 'application/zip');
// Local file header signature, first four bytes.
eq('it starts with a local file header', [...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
// End of central directory, last 22 bytes when there is no comment.
const eocd = bytes.length - 22;
eq('it ends with the central directory record',
  [...bytes.slice(eocd, eocd + 4)], [0x50, 0x4b, 0x05, 0x06]);
const view = new DataView(bytes.buffer);
eq('the record counts every entry', view.getUint16(eocd + 10, true), 4);
eq('the two entry counts agree',
  view.getUint16(eocd + 8, true), view.getUint16(eocd + 10, true));
eq('the central directory offset lands on its signature',
  [...bytes.slice(view.getUint32(eocd + 16, true), view.getUint32(eocd + 16, true) + 4)],
  [0x50, 0x4b, 0x01, 0x02]);
check('names are flagged UTF-8', (view.getUint16(6, true) & 0x0800) !== 0);
check('repeating text was actually compressed', bytes.length < 6 * 200, `${bytes.length} bytes`);

// The bytes have to survive the round trip, or the export is a corrupt file
// that only looks like an archive.
async function firstEntryBody(archive: Uint8Array): Promise<string> {
  const v = new DataView(archive.buffer);
  const method = v.getUint16(8, true);
  const compressed = v.getUint32(18, true);
  const nameLen = v.getUint16(26, true);
  const extraLen = v.getUint16(28, true);
  const start = 30 + nameLen + extraLen;
  const body = archive.slice(start, start + compressed);
  if (method === 0) return new TextDecoder().decode(body);
  const stream = new Blob([body as BlobPart]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
eq('the first entry inflates back to what went in',
  await firstEntryBody(bytes), 'hello '.repeat(200));

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nVault export checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Vault export checks: all ${passed} passed.`);
