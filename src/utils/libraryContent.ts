// Where the text of a book actually lives.
//
// A LibraryItem carries the whole extracted text of an epub or PDF — routinely
// hundreds of kilobytes, occasionally megabytes. localStorage gives the origin
// about 5MB for everything, so three or four books were enough to fill it, and
// from then on every write of the vault threw QuotaExceededError. Notes, tasks
// and canvases are small; they were being evicted by book text.
//
// So the text moves to IndexedDB, which is measured in hundreds of megabytes,
// and localStorage keeps only what the shelf needs to draw itself. Same trade
// already made for pasted images in `imageStore.ts`.
//
// `content` stays on the in-memory LibraryItem throughout: the Convex sync path
// reads it straight off the object, and nothing about that changes.

import { get, set, del, keys, createStore } from 'idb-keyval';

// Its own store — book text and image blobs have unrelated lifetimes, and
// clearing one should never touch the other.
const contentStore = createStore('braindot-library', 'content');

/**
 * Covers, kept apart from the text.
 *
 * Once the text was gone, covers were what filled localStorage: a shelf-sized
 * JPEG as a data URL runs 20–60KB, so a few hundred books still hit the wall,
 * for pictures.
 *
 * Its own *database*, not another store in the one above: idb-keyval opens
 * without a version number, so the upgrade that creates an object store only
 * runs when the database does not yet exist. A second store named here would
 * never be created and every transaction against it would throw. Same reason
 * `imageStore.ts` has a database to itself.
 */
const coverStore = createStore('braindot-covers', 'covers');

/**
 * What was last written, so an unchanged book is not written again.
 *
 * Holds the same string the item holds — JS strings are immutable and shared
 * by reference, so this costs a pointer per book, not a second copy of the
 * text. Without it, a save triggered by scrolling one page would compare by
 * reading every book back out of IndexedDB first.
 */
const lastWritten = new Map<string, string>();
const lastCover = new Map<string, string>();

/** Read back the text for one item. Missing is normal, not an error. */
export async function loadContent(id: string): Promise<string | null> {
  try {
    const value = await get<string>(id, contentStore);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Write the text for one item. */
export async function saveContent(id: string, content: string): Promise<void> {
  await set(id, content, contentStore);
}

export async function deleteContent(id: string): Promise<void> {
  try {
    await del(id, contentStore);
  } catch {
    // A stale row costs a little space and nothing else.
  }
  try { await del(id, coverStore); } catch { /* a stale cover is harmless */ }
  lastWritten.delete(id);
  lastCover.delete(id);
}

/**
 * Persist the text of every item, and forget the ones that have gone.
 *
 * Writes only what changed. The vault's debounced save fires on any edit at
 * all — including reading progress ticking over, which happens constantly —
 * and rewriting a megabyte of book text each time would put real work on the
 * IndexedDB queue for no reason.
 */
export async function syncContent(
  items: { id: string; content: string; coverUrl?: string | null }[],
): Promise<void> {
  const wanted = new Map(items.map((i) => [i.id, i.content ?? '']));

  const writes = [...wanted].map(async ([id, content]) => {
    if (!content) return;
    if (lastWritten.get(id) === content) return;
    // Nothing remembered for this id yet — it may still be identical on disk,
    // from a previous session. Worth one read to avoid a large write.
    if (!lastWritten.has(id) && (await loadContent(id)) === content) {
      lastWritten.set(id, content);
      return;
    }
    await saveContent(id, content);
    lastWritten.set(id, content);
  });

  let existing: string[] = [];
  try {
    existing = (await keys(contentStore)).map(String);
  } catch {
    // Cannot enumerate — still write what we have rather than give up.
  }
  const removals = existing
    .filter((id) => !wanted.has(id))
    .map(async (id) => {
      await deleteContent(id);
      lastWritten.delete(id);
    });

  // Covers, by the same rules.
  const wantedCovers = new Map(items.map((i) => [i.id, i.coverUrl ?? '']));
  const coverWrites = [...wantedCovers].map(async ([id, url]) => {
    if (!url) return;
    if (lastCover.get(id) === url) return;
    if (!lastCover.has(id) && (await loadCover(id)) === url) {
      lastCover.set(id, url);
      return;
    }
    await set(id, url, coverStore);
    lastCover.set(id, url);
  });

  let existingCovers: string[] = [];
  try {
    existingCovers = (await keys(coverStore)).map(String);
  } catch {
    // Cannot enumerate — still write what we have.
  }
  const coverRemovals = existingCovers
    .filter((id) => !wantedCovers.has(id))
    .map(async (id) => {
      try { await del(id, coverStore); } catch { /* a stale cover is harmless */ }
      lastCover.delete(id);
    });

  await Promise.all([...writes, ...removals, ...coverWrites, ...coverRemovals]);
}

/** Read back the cover for one item. */
export async function loadCover(id: string): Promise<string | null> {
  try {
    const value = await get<string>(id, coverStore);
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Put the text back onto items that were read out of localStorage.
 *
 * An item whose text is already present is left alone: that is the shape a
 * vault written before this change has, and the first save afterwards is what
 * moves it across.
 */
export async function rejoinContent<
  T extends { id: string; content: string; coverUrl?: string | null },
>(items: T[]): Promise<T[]> {
  return Promise.all(
    items.map(async (item) => {
      const [content, coverUrl] = await Promise.all([
        item.content ? Promise.resolve(item.content) : loadContent(item.id),
        item.coverUrl ? Promise.resolve(item.coverUrl) : loadCover(item.id),
      ]);
      const merged = { ...item };
      if (content) merged.content = content;
      if (coverUrl) merged.coverUrl = coverUrl;
      return merged;
    }),
  );
}
