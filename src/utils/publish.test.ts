/**
 * Checks for the publishing translation.
 *
 * Run with:  npm run check:publish
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * What is worth checking here is everything that decides what a stranger can
 * see: which pages a folder drags into public with it, which wiki-links stay
 * pointing at private notes, and whether an image that failed to upload takes
 * the author's copy down with it.
 */

import {
  finishPlan, localImageIds, pageSlug, placeholderUnresolvedImages,
  planFolder, planNote, publishBlocker, resolveWikiLinks, rewriteResolvedImages,
} from './publish.ts';

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

/* ============================================================
   Fixtures
   ============================================================ */

let seq = 0;
function note(over: Partial<any> = {}): any {
  seq++;
  return {
    id: over.id ?? `note_a1b2c${seq}`,
    filename: 'x.md',
    title: `Note ${seq}`,
    subtitle: '',
    tags: [],
    body: '',
    backlinks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    wordCount: 0,
    status: 'draft',
    folderId: 'f_root',
    pinned: false,
    ...over,
  };
}

function folder(id: string, name: string, parentId: string | null = null): any {
  return { id, name, parentId, createdAt: '2026-01-01T00:00:00.000Z', expanded: true };
}

const IMG = 'braindot:img/';

/* ============================================================
   Paths
   ============================================================ */

check('a slug leads with the title', pageSlug('Second Brain', 'note_abc123').startsWith('second-brain-'));
check('the id disambiguates two same-named notes',
  pageSlug('Inbox', 'note_aaa111') !== pageSlug('Inbox', 'note_bbb222'));
eq('punctuation-only titles still produce a path', pageSlug('!!!???', 'note_abc123'), 'page-abc123');
eq('accents survive as their base letters', pageSlug('Café', 'note_abc123'), 'cafe-abc123');
eq('an empty title still produces a path', pageSlug('', 'note_abc123'), 'page-abc123');
// The server rejects anything outside [a-z0-9-]; the client must not build one.
const SAFE = /^[a-z0-9][a-z0-9-]*$/;
for (const title of ['Hello, World!', '  spaced  out  ', '你好', '2026/01/01', '---', 'A'.repeat(200)]) {
  check(`"${title.slice(0, 12)}" slugs url-safe`, SAFE.test(pageSlug(title, 'note_abc123')),
    pageSlug(title, 'note_abc123'));
}

/* ============================================================
   Local images
   ============================================================ */

const withImages = `Before\n\n![a shot](${IMG}img1)\n\ntext ![again](${IMG}img1) and ![other](${IMG}img2)\n`;

eq('every local ref is found once, in order', localImageIds(withImages), ['img1', 'img2']);
eq('a body with no images reports none', localImageIds('plain text ![](https://x/y.png)'), []);

const oneUploaded = new Map([['img1', 'https://files.convex.cloud/abc']]);

// The author's own note is rewritten with this, so a failed upload must not
// cost them the picture.
check('a resolved ref becomes an https image',
  rewriteResolvedImages(withImages, oneUploaded).includes('![a shot](https://files.convex.cloud/abc)'));
check('an unresolved ref is left exactly as it was',
  rewriteResolvedImages(withImages, oneUploaded).includes(`![other](${IMG}img2)`));
eq('nothing uploaded changes nothing',
  rewriteResolvedImages(withImages, new Map()), withImages);

// The snapshot, by contrast, must never ship a ref no reader can resolve.
const snapshot = placeholderUnresolvedImages(rewriteResolvedImages(withImages, oneUploaded));
check('the snapshot keeps no local refs', !snapshot.includes(IMG), snapshot);
check('the placeholder carries the alt text', snapshot.includes('*[image not published: other]*'));
check('a resolved image survives the placeholder pass',
  snapshot.includes('![a shot](https://files.convex.cloud/abc)'));
eq('an image with no alt text still says something',
  placeholderUnresolvedImages(`![](${IMG}z)`), '*[image not published]*');

/* ============================================================
   Wiki-links
   ============================================================ */

const paths = new Map([['alpha', 'alpha-aaa111'], ['root note', '']]);

eq('a link to a published note becomes a real link',
  resolveWikiLinks('see [[Alpha]] for more', paths, '/p/SLUG'),
  'see [Alpha](/p/SLUG/alpha-aaa111) for more');
eq('the link text keeps the author\'s casing',
  resolveWikiLinks('[[ALPHA]]', paths, '/p/SLUG'), '[ALPHA](/p/SLUG/alpha-aaa111)');
eq('the root page links to the publication root',
  resolveWikiLinks('[[Root Note]]', paths, '/p/SLUG'), '[Root Note](/p/SLUG)');
// The important one: a reference to something private stays inert. Rewriting
// it would invite a reader to go looking for a page that is not theirs.
eq('a link to an unpublished note is left alone',
  resolveWikiLinks('see [[Secret]] here', paths, '/p/SLUG'), 'see [[Secret]] here');
eq('surrounding whitespace in the target still matches',
  resolveWikiLinks('[[ Alpha ]]', paths, '/p/SLUG'), '[ Alpha ](/p/SLUG/alpha-aaa111)');

/* ============================================================
   Code is not prose
   ============================================================ */

/* A slip-box is full of notes about markdown. A note explaining wiki-link
   syntax has [[Some Note]] inside a code fence, and rewriting that turns an
   example into something that is no longer an example of anything — silently,
   and only in the copy strangers read. */
const fenced = [
  'Write a link like this:',
  '',
  '```md',
  'See [[Alpha]] for the argument.',
  '```',
  '',
  'Or inline: `[[Alpha]]`.',
  '',
  'And for real: [[Alpha]]',
].join('\n');

const rewritten = resolveWikiLinks(fenced, paths, '/p/SLUG');
check('a wiki-link inside a fence is untouched',
  rewritten.includes('See [[Alpha]] for the argument.'), rewritten);
check('a wiki-link inside an inline code span is untouched',
  rewritten.includes('`[[Alpha]]`'), rewritten);
check('a wiki-link in the prose still resolves',
  rewritten.includes('And for real: [Alpha](/p/SLUG/alpha-aaa111)'), rewritten);
eq('the fence markers survive', (rewritten.match(/```/g) || []).length, 2);

// The same protection has to hold for images, which are rewritten into the
// author's own note and not just the snapshot.
const fencedImg = ['```md', `![x](${IMG}img1)`, '```', '', `![y](${IMG}img1)`].join('\n');
eq('an image ref inside a fence is not collected', localImageIds(fencedImg), ['img1']);
check('an image ref inside a fence is not rewritten',
  rewriteResolvedImages(fencedImg, oneUploaded).includes(`![x](${IMG}img1)`));
check('an image ref in the prose is rewritten',
  rewriteResolvedImages(fencedImg, oneUploaded).includes('![y](https://files.convex.cloud/abc)'));
check('an image ref inside a fence is not placeholdered',
  placeholderUnresolvedImages(fencedImg).includes(`![x](${IMG}img1)`));

// An unterminated fence runs to the end of the note, which is how
// renderMarkdownHtml reads it too.
const openFence = ['before [[Alpha]]', '```', 'after [[Alpha]]'].join('\n');
const openOut = resolveWikiLinks(openFence, paths, '/p/SLUG');
check('prose before an unterminated fence resolves', openOut.includes('before [Alpha](/p/SLUG/'));
check('everything after an unterminated fence is code', openOut.includes('after [[Alpha]]'), openOut);

/* ============================================================
   Planning one note
   ============================================================ */

const solo = note({ id: 'note_solo11', title: 'Solo', subtitle: 'a subtitle', tags: ['x'], body: `hi ![p](${IMG}q)` });
const soloPlan = planNote(solo);

eq('a note publishes as exactly one page', soloPlan.pages.length, 1);
eq('the note is the root page', soloPlan.pages[0].path, '');
eq('the publication is keyed to the note', soloPlan.rootLocalId, 'note_solo11');
eq('its images are collected', soloPlan.localImageIds, ['q']);
eq('the note is its own source', soloPlan.sourceNoteIds, ['note_solo11']);
eq('an untitled note is still called something', planNote(note({ title: '' })).pages[0].title, 'Untitled');

/* ============================================================
   Planning a folder
   ============================================================ */

/*  research/                 <- published root
      Beta         (note)
      Alpha        (note, pinned)
      deep/
        Gamma      (note)
        deeper/
          Delta    (note)
      empty/
    elsewhere/                <- outside the publication
      Secret       (note)
*/
const fRoot = folder('f_res123', 'Research');
const fDeep = folder('f_deep11', 'Deep', 'f_res123');
const fDeeper = folder('f_dpr222', 'Deeper', 'f_deep11');
const fEmpty = folder('f_emp333', 'Empty', 'f_res123');
const fOther = folder('f_els444', 'Elsewhere');

const nBeta = note({ id: 'note_bbb111', title: 'Beta', folderId: 'f_res123' });
const nAlpha = note({ id: 'note_aaa222', title: 'Alpha', folderId: 'f_res123', pinned: true });
const nGamma = note({ id: 'note_ggg333', title: 'Gamma', folderId: 'f_deep11' });
const nDelta = note({ id: 'note_ddd444', title: 'Delta', folderId: 'f_dpr222' });
const nSecret = note({ id: 'note_sss555', title: 'Secret', folderId: 'f_els444' });

const allFolders = [fRoot, fDeep, fDeeper, fEmpty, fOther];
const allNotes = [nBeta, nAlpha, nGamma, nDelta, nSecret];
const plan = planFolder(fRoot, allFolders, allNotes);

const titles = plan.pages.map((p) => p.title);
eq('nesting is followed all the way down',
  titles, ['Research', 'Alpha', 'Beta', 'Deep', 'Gamma', 'Deeper', 'Delta', 'Empty']);
// The whole point of the boundary: a note in a sibling folder is not swept in.
check('a note outside the folder stays private', !titles.includes('Secret'));
eq('the folder is the root page', plan.pages[0].path, '');
eq('a pinned note leads its folder', plan.pages[1].title, 'Alpha');

const deltaPage = plan.pages.find((p) => p.title === 'Delta')!;
check('a deeply nested note gets a nested path',
  /^deep-[a-z0-9]+\/deeper-[a-z0-9]+\/delta-[a-z0-9]+$/.test(deltaPage.path), deltaPage.path);
eq('its breadcrumb walks back to the root',
  deltaPage.trail.map((t) => t.title), ['Research', 'Deep', 'Deeper']);
eq('the root crumb points at the publication root', deltaPage.trail[0].path, '');

const rootPage = plan.pages[0];
eq('the root page lists its notes then its folders',
  rootPage.children.map((c) => c.title), ['Alpha', 'Beta', 'Deep', 'Empty']);
// An empty section is still part of how the author arranged the thing.
eq('an empty subfolder is kept', plan.pages.find((p) => p.title === 'Empty')!.children, []);
eq('only notes count as sources', plan.sourceNoteIds.length, 4);
check('the private note is not a source', !plan.sourceNoteIds.includes('note_sss555'));

// Every path the client builds has to satisfy the server's SAFE_PATH.
const SAFE_PATH = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;
for (const page of plan.pages) {
  check(`"${page.title}" has a server-safe path`,
    page.path === '' || SAFE_PATH.test(page.path), page.path);
}
eq('exactly one page claims the root', plan.pages.filter((p) => p.path === '').length, 1);
eq('no two pages claim the same path',
  new Set(plan.pages.map((p) => p.path)).size, plan.pages.length);

// A parentId cycle would hang the walk rather than fail; it must terminate.
const cycleA = folder('f_cyc111', 'A', 'f_cyc222');
const cycleB = folder('f_cyc222', 'B', 'f_cyc111');
const cyclePlan = planFolder(cycleA, [cycleA, cycleB], []);
check('a cyclic tree terminates', cyclePlan.pages.length === 2, `${cyclePlan.pages.length} pages`);

/* ============================================================
   Finishing the plan
   ============================================================ */

const linked = planFolder(
  fRoot,
  allFolders,
  allNotes.map((n) => n.id === 'note_bbb111'
    ? { ...n, body: 'points at [[Alpha]] and at [[Secret]]' }
    : n),
);
const finished = finishPlan(linked, new Map(), 'SLUG');
const betaBody = finished.pages.find((p) => p.title === 'Beta')!.body;

check('a link inside the publication resolves',
  betaBody.includes('[Alpha](/p/SLUG/alpha-'), betaBody);
check('a link outside it does not', betaBody.includes('[[Secret]]'), betaBody);
eq('finishing does not add or drop pages', finished.pages.length, linked.pages.length);

/* ============================================================
   Blockers
   ============================================================ */

eq('an ordinary plan is publishable', publishBlocker(plan), null);
check('an oversized body is refused',
  publishBlocker({ ...soloPlan, pages: [{ ...soloPlan.pages[0], body: 'x'.repeat(400_001) }] }) !== null);
check('a body exactly at the limit is allowed',
  publishBlocker({ ...soloPlan, pages: [{ ...soloPlan.pages[0], body: 'x'.repeat(400_000) }] }) === null);
check('too many pages is refused',
  publishBlocker({ ...plan, pages: Array.from({ length: 251 }, () => plan.pages[0]) }) !== null);
// Per-page limits alone would wave through 250 pages that each sit just under
// the cap — far more than one Convex mutation can carry.
const fatPage = { ...soloPlan.pages[0], body: 'x'.repeat(399_000) };
check('a folder under every per-page limit but over the total is refused',
  publishBlocker({ ...plan, pages: Array.from({ length: 20 }, () => fatPage) }) !== null);
check('a folder under the total is allowed',
  publishBlocker({ ...plan, pages: Array.from({ length: 10 }, () => fatPage) }) === null);

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nPublishing checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Publishing checks: all ${passed} passed.`);
