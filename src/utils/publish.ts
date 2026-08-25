// Braindot — turning a note, or a whole folder, into pages a stranger can read.
//
// The vault is local-first and full of things that only mean something inside
// it: `[[wiki-links]]` that resolve against the note list, `braindot:img/…`
// refs that resolve against this browser's IndexedDB. A reader on a shared
// link has neither. So publishing is a translation, and this file is the
// translator — pure functions over plain data, no Convex and no IndexedDB, so
// the awkward parts are testable on their own.
//
// The image upload that has to happen alongside it lives in hooks/usePublish,
// because that is the part that needs the network.

import type { Folder, Note } from '@/types';
// The real extension, so `npm run check:publish` can run this file straight
// through Node the way the other checked utils do (see tsconfig's note on
// allowImportingTsExtensions).
import { IMAGE_SCHEME } from './imageStore.ts';

/** Mirrors convex/publish.ts. Kept here so the UI can say "too big" before a
 *  round-trip, and there rather than only here because the server cannot
 *  trust a limit that only the client enforces. */
export const MAX_PUBLISHED_PAGES = 250;
export const MAX_PUBLISHED_BODY_CHARS = 400_000;
/** Per-page limits are not enough on their own — see the note on
 *  MAX_TOTAL_CHARS in convex/publish.ts. */
export const MAX_PUBLISHED_TOTAL_CHARS = 4_000_000;

export interface PublishedChild {
  path: string;
  title: string;
  kind: 'note' | 'folder';
  subtitle: string;
}

export interface PublishedPage {
  /** '' for the root page. Otherwise a '/'-joined chain of url-safe segments,
   *  which is literally the path under /p/<slug>/. */
  path: string;
  kind: 'note' | 'folder';
  title: string;
  subtitle: string;
  tags: string[];
  body: string;
  wordCount: number;
  updatedAt: string;
  order: number;
  children: PublishedChild[];
  trail: { path: string; title: string }[];
}

export interface PublishPlan {
  kind: 'note' | 'folder';
  rootLocalId: string;
  title: string;
  pages: PublishedPage[];
  /** Every local image ref found across the pages, deduplicated. The caller
   *  uploads these and hands back a map before the plan is finished. */
  localImageIds: string[];
  /** The notes these pages were copied from. Plan-level rather than per-page
   *  because it never leaves the browser: the caller writes resolved image
   *  URLs back into these, and a published page must not carry a pointer
   *  into the vault it came from. */
  sourceNoteIds: string[];
}

/* ============================================================
   Paths
   ============================================================ */

/**
 * A URL segment for a page.
 *
 * The id is appended rather than trusted alone: two notes called "Inbox" in
 * different folders would otherwise collide, and a title made entirely of
 * punctuation would leave nothing at all. The title still leads, because a
 * link someone pastes into a message should say what it is.
 */
export function pageSlug(title: string, localId: string): string {
  const stem = title
    .toLowerCase()
    .normalize('NFKD')
    // Strip the combining marks NFKD just split off, so "café" slugs as
    // "cafe" rather than losing the letter entirely to the class below.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  // The id's own characters are not guaranteed url-safe either.
  const suffix = localId.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(-6) || 'x';
  return stem ? `${stem}-${suffix}` : `page-${suffix}`;
}

/* ============================================================
   Body rewriting
   ============================================================ */

const LOCAL_IMAGE_IN_MARKDOWN = new RegExp(
  `!\\[([^\\]]*)\\]\\(${IMAGE_SCHEME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^)\\s]+)\\)`,
  'g',
);

const INLINE_CODE = /`[^`\n]*`/g;

/**
 * Run `fn` over the prose and nothing else.
 *
 * A slip-box is full of notes *about* markdown, and a note explaining how
 * wiki-links work will have `[[Some Note]]` inside a code fence. Rewriting
 * that would change what the author wrote into something that is no longer
 * an example of anything — silently, and only in the copy strangers read.
 *
 * The fence and inline-code rules here are deliberately the same ones
 * renderMarkdownHtml uses (a line starting with ``` toggles a block; a
 * backtick pair is a span), so what gets protected is exactly what will
 * render as code.
 */
function outsideCode(body: string, fn: (prose: string) => string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^```/.test(line)) { inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }
    let rebuilt = '';
    let last = 0;
    for (const span of line.matchAll(INLINE_CODE)) {
      rebuilt += fn(line.slice(last, span.index)) + span[0];
      last = span.index + span[0].length;
    }
    out.push(rebuilt + fn(line.slice(last)));
  }
  return out.join('\n');
}

/** Every device-local image this body depends on, in order of first use. */
export function localImageIds(body: string): string[] {
  const ids: string[] = [];
  // Through outsideCode so an image ref quoted in a code sample is not
  // uploaded for a link that will never point at it.
  outsideCode(body, (prose) => {
    for (const m of prose.matchAll(LOCAL_IMAGE_IN_MARKDOWN)) {
      if (!ids.includes(m[2])) ids.push(m[2]);
    }
    return prose;
  });
  return ids;
}

/**
 * Swap `braindot:img/<id>` for the https URL it was uploaded to, and leave
 * every id that is not in the map exactly as it was.
 *
 * The leaving-alone matters, because this runs against the author's own note
 * as well as against the snapshot: an upload that failed must not cost them
 * the picture. It stays a local ref, still renders in the app, and the next
 * publish tries again.
 */
export function rewriteResolvedImages(body: string, urlById: Map<string, string>): string {
  return outsideCode(body, (prose) =>
    prose.replace(LOCAL_IMAGE_IN_MARKDOWN, (match, alt: string, id: string) => {
      const url = urlById.get(id);
      return url ? `![${alt}](${url})` : match;
    }),
  );
}

/**
 * Turn any local ref still standing into a line that admits it.
 *
 * Only ever applied to the snapshot. A reader gets told something is missing
 * rather than shown a torn page, and the author's alt text survives to say
 * what it was.
 */
export function placeholderUnresolvedImages(body: string): string {
  return outsideCode(body, (prose) =>
    prose.replace(LOCAL_IMAGE_IN_MARKDOWN, (_match, alt: string) => {
      const label = String(alt).trim();
      return `*[image not published${label ? `: ${label}` : ''}]*`;
    }),
  );
}

const WIKI_LINK = /\[\[([^\]]+)\]\]/g;

/**
 * Turn `[[Some Note]]` into a real link when "Some Note" is also in this
 * publication, and leave it alone when it is not.
 *
 * Leaving it alone is the deliberate half. A wiki-link to a note the author
 * did not publish is a reference to something private; rewriting it into a
 * dead link would invite a reader to go looking, and silently deleting it
 * would change what the sentence says. It stays as the author typed it, and
 * the published stylesheet renders it as unremarkable text.
 */
export function resolveWikiLinks(
  body: string,
  pathByTitle: Map<string, string>,
  linkBase: string,
): string {
  return outsideCode(body, (prose) =>
    prose.replace(WIKI_LINK, (match, target: string) => {
      const path = pathByTitle.get(target.trim().toLowerCase());
      if (path === undefined) return match;
      // The link text keeps the author's casing; only the destination is ours.
      return `[${target}](${linkBase}${path ? `/${path}` : ''})`;
    }),
  );
}

/* ============================================================
   Building the plan
   ============================================================ */

function childOf(page: PublishedPage): PublishedChild {
  return { path: page.path, title: page.title, kind: page.kind, subtitle: page.subtitle };
}

/** Notes sort the way the sidebar shows them: pinned first, then by title. */
function byShelfOrder(a: Note, b: Note): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/**
 * Lay out one note as a single-page publication.
 *
 * Bodies still carry their `braindot:img/` refs at this stage — the caller
 * uploads what `localImageIds` reports and calls `finishPlan` to finish.
 */
export function planNote(note: Note): PublishPlan {
  const page: PublishedPage = {
    path: '',
    kind: 'note',
    title: note.title || 'Untitled',
    subtitle: note.subtitle || '',
    tags: note.tags ?? [],
    body: note.body,
    wordCount: note.wordCount ?? 0,
    updatedAt: note.updatedAt,
    order: 0,
    children: [],
    trail: [],
  };
  return {
    kind: 'note',
    rootLocalId: note.id,
    title: page.title,
    pages: [page],
    localImageIds: localImageIds(note.body),
    sourceNoteIds: [note.id],
  };
}

/**
 * Lay out a folder and everything nested inside it.
 *
 * Depth-first, so a subfolder's pages sit next to it in the list and the
 * order the reader meets them matches the order the sidebar showed them.
 * Empty subfolders are kept: a section with nothing in it yet is still part
 * of how the author has arranged the thing, and dropping it silently would
 * make the published tree disagree with the vault.
 */
export function planFolder(
  root: Folder,
  folders: Folder[],
  notes: Note[],
): PublishPlan {
  const childFolders = new Map<string, Folder[]>();
  for (const f of folders) {
    const key = f.parentId ?? '';
    const list = childFolders.get(key);
    if (list) list.push(f);
    else childFolders.set(key, [f]);
  }
  for (const list of childFolders.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const notesByFolder = new Map<string, Note[]>();
  for (const n of notes) {
    const list = notesByFolder.get(n.folderId);
    if (list) list.push(n);
    else notesByFolder.set(n.folderId, [n]);
  }
  for (const list of notesByFolder.values()) list.sort(byShelfOrder);

  const pages: PublishedPage[] = [];
  const sourceNoteIds: string[] = [];
  let order = 0;

  // A folder can only be its own ancestor if the tree is corrupt, but a cycle
  // here would hang the browser rather than fail, so it is guarded anyway.
  const visited = new Set<string>();

  function walk(
    folder: Folder,
    parentPath: string,
    trail: { path: string; title: string }[],
  ): PublishedPage {
    visited.add(folder.id);
    const isRoot = folder.id === root.id;
    const segment = isRoot ? '' : pageSlug(folder.name, folder.id);
    const path = isRoot ? '' : parentPath ? `${parentPath}/${segment}` : segment;

    const page: PublishedPage = {
      path,
      kind: 'folder',
      title: folder.name || 'Untitled folder',
      subtitle: '',
      tags: [],
      body: '',
      wordCount: 0,
      updatedAt: folder.createdAt,
      order: order++,
      children: [],
      trail,
    };
    pages.push(page);

    const childTrail = [...trail, { path, title: page.title }];

    for (const note of notesByFolder.get(folder.id) ?? []) {
      const notePath = path
        ? `${path}/${pageSlug(note.title, note.id)}`
        : pageSlug(note.title, note.id);
      const notePage: PublishedPage = {
        path: notePath,
        kind: 'note',
        title: note.title || 'Untitled',
        subtitle: note.subtitle || '',
        tags: note.tags ?? [],
        body: note.body,
        wordCount: note.wordCount ?? 0,
        updatedAt: note.updatedAt,
        order: order++,
        children: [],
        trail: childTrail,
      };
      pages.push(notePage);
      sourceNoteIds.push(note.id);
      page.children.push(childOf(notePage));
    }

    for (const sub of childFolders.get(folder.id) ?? []) {
      if (visited.has(sub.id)) continue;
      page.children.push(childOf(walk(sub, path, childTrail)));
    }

    return page;
  }

  walk(root, '', []);

  const ids: string[] = [];
  for (const page of pages) {
    for (const id of localImageIds(page.body)) {
      if (!ids.includes(id)) ids.push(id);
    }
  }

  return {
    kind: 'folder',
    rootLocalId: root.id,
    title: root.name || 'Untitled folder',
    pages,
    localImageIds: ids,
    sourceNoteIds,
  };
}

/**
 * The last pass: resolve images and wiki-links now that both maps exist.
 *
 * Split out from the planners because the image URLs are only known after a
 * network round-trip, and the destination of a wiki-link is only known once
 * the publication has a slug — neither can be done while walking the tree.
 */
export function finishPlan(
  plan: PublishPlan,
  urlById: Map<string, string>,
  slug: string,
): PublishPlan {
  const linkBase = `/p/${slug}`;
  const pathByTitle = new Map<string, string>();
  for (const page of plan.pages) {
    if (page.kind !== 'note') continue;
    const key = page.title.trim().toLowerCase();
    // First page wins. Two notes sharing a title is something the author has
    // to disambiguate; guessing which one a link meant would be worse.
    if (!pathByTitle.has(key)) pathByTitle.set(key, page.path);
  }

  return {
    ...plan,
    pages: plan.pages.map((page) => ({
      ...page,
      body: resolveWikiLinks(
        placeholderUnresolvedImages(rewriteResolvedImages(page.body, urlById)),
        pathByTitle,
        linkBase,
      ),
    })),
  };
}

/**
 * Why this plan cannot be published, or null if it can.
 *
 * Every rule here is enforced again in convex/publish.ts, which is the one
 * that counts — a limit only the client applies is not a limit. This exists
 * so the answer arrives before an upload does, rather than after.
 */
export function publishBlocker(plan: PublishPlan): string | null {
  if (plan.pages.length > MAX_PUBLISHED_PAGES) {
    return `That folder holds ${plan.pages.length} pages. Publishing tops out at ${MAX_PUBLISHED_PAGES}.`;
  }
  const tooLong = plan.pages.find((p) => p.body.length > MAX_PUBLISHED_BODY_CHARS);
  if (tooLong) return `"${tooLong.title}" is too long to publish.`;
  const total = plan.pages.reduce((n, p) => n + p.body.length, 0);
  if (total > MAX_PUBLISHED_TOTAL_CHARS) {
    return `That folder holds about ${Math.round(total / 100_000) / 10}MB of writing. Publishing tops out at ${MAX_PUBLISHED_TOTAL_CHARS / 1_000_000}MB — publish a subfolder instead.`;
  }
  return null;
}

/** The absolute link to hand someone, built against the current origin. */
export function publicUrl(slug: string, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/p/${slug}`;
}
