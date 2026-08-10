// Local image store.
//
// Image bytes live in IndexedDB; the note body only carries a reference of the
// form `![alt](braindot:img/<id>)`. This is deliberate: a note syncs to Convex
// as a single document, and Convex caps a document at 1MB (see the note on
// `libraryItems.content` in convex/schema.ts, which already truncates for the
// same reason). One pasted screenshot as a base64 data URI would be enough to
// push a note past that ceiling and break sync for it.
//
// The trade-off is that these images are device-local — they do not sync, and
// they do not survive an export to another markdown app. Cloud-backed images
// need Convex file storage, which is a larger change than this one.

import { get, set, del, createStore } from 'idb-keyval';

// Kept out of the embeddings store — unrelated lifetimes and sizes.
const imageStore = createStore('braindot-images', 'images');

export const IMAGE_SCHEME = 'braindot:img/';

// Long-edge cap. A screenshot from a high-DPI display is routinely 3000px
// across; nothing rendered inside a 680px writing column needs more than this.
const MAX_EDGE = 1600;
const WEBP_QUALITY = 0.82;

export function isImageRef(url: string): boolean {
  return url.startsWith(IMAGE_SCHEME);
}

export function refToId(url: string): string {
  return url.slice(IMAGE_SCHEME.length);
}

export function idToRef(id: string): string {
  return IMAGE_SCHEME + id;
}

/**
 * Shrink oversized bitmaps before storing. Returns the original blob whenever
 * re-encoding would not actually help — a small PNG can come out of a WebP
 * round-trip larger than it went in.
 *
 * Exported because the cloud upload path wants the same treatment: a 5MB phone
 * photo should not become 5MB of Convex storage and 5MB of download per view.
 */
export async function normaliseImage(file: Blob): Promise<Blob> {
  // SVG keeps its resolution independence and GIF keeps its frames only if we
  // leave them alone; a canvas round-trip would flatten both.
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // unsupported/corrupt — store the bytes as they came
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 400_000) {
    bitmap.close();
    return file;
  }

  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const encoded = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
  );
  return encoded && encoded.size < file.size ? encoded : file;
}

/** Store an image locally and return its id. Used when signed out / in demo. */
export async function putImage(file: Blob): Promise<string> {
  const blob = await normaliseImage(file);
  const id = crypto.randomUUID();
  await set(id, blob, imageStore);
  return id;
}

// Object URLs are cached per id. Creating a fresh one on every render would
// leak a handle to the blob each time, and these live as long as the tab.
const urlCache = new Map<string, string>();

/** Resolve a stored image to a displayable URL, or null if it is gone. */
export async function getImageObjectUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await get<Blob>(id, imageStore);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export async function deleteImage(id: string): Promise<void> {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
  await del(id, imageStore);
}
