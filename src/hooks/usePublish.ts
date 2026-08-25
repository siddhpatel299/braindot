'use client';

// Publishing, from the app's side of the wire.
//
// utils/publish.ts does the thinking (which pages, which paths, which links);
// this does the parts that need a network and a browser: uploading the images
// a note only holds locally, minting the slug, writing the snapshot.
//
// The one surprising thing it does is edit the author's own note. A pasted
// image lives in IndexedDB as `braindot:img/<id>`, which is device-local by
// design (see utils/imageStore.ts) — a reader on a shared link cannot resolve
// it, and neither can the author's phone. Publishing is the first moment the
// app has a reason to put those bytes somewhere durable, so it does, and
// rewrites the ref in place to the https URL it now has. The note ends up
// more portable than it was: the picture survives export, and shows up on
// every device instead of one.

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/lib/convex-api';
import type { Folder, Note } from '@/types';
import { getImageBlob } from '@/utils/imageStore';
import {
  finishPlan,
  localImageIds,
  planFolder,
  planNote,
  publishBlocker,
  publicUrl,
  rewriteResolvedImages,
  type PublishPlan,
} from '@/utils/publish';

export interface PublicationSummary {
  slug: string;
  kind: 'note' | 'folder';
  rootLocalId: string;
  title: string;
  indexable: boolean;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PublishResult =
  | { ok: true; slug: string; url: string; pageCount: number; imagesUploaded: number }
  | { ok: false; error: string };

interface Options {
  /** False in demo mode and while signed out — there is no account to publish
   *  from, and every mutation below would throw. */
  enabled: boolean;
  notes: Note[];
  folders: Folder[];
  /** Used to write resolved image URLs back into the vault. */
  updateNote: (id: string, patch: Partial<Note>, opts?: { silent?: boolean }) => void;
}

export function usePublish({ enabled, notes, folders, updateNote }: Options) {
  const rows = useQuery(api.publish.listMine, enabled ? {} : 'skip');
  const reserveSlug = useMutation(api.publish.reserveSlug);
  const writePages = useMutation(api.publish.publish);
  const removePublication = useMutation(api.publish.unpublish);
  const generateUploadUrl = useMutation(api.functions.generateUploadUrl);
  const getImageUrl = useMutation(api.functions.getImageUrl);

  /** Which rootLocalId is mid-flight, so one button can show a spinner
   *  without every other share button in the tree going busy with it. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const byRoot = useMemo(() => {
    const map = new Map<string, PublicationSummary>();
    for (const r of (rows ?? []) as PublicationSummary[]) {
      // A reserved-but-never-filled slug is not a published page; `read`
      // 404s on it. Showing it as published would offer a dead link.
      if (r.pageCount > 0) map.set(r.rootLocalId, r);
    }
    return map;
  }, [rows]);

  /**
   * Put every device-local image the plan depends on into Convex storage.
   *
   * Failures are per-image and non-fatal: one picture that will not upload
   * should not stop a note from being shared. The caller sees how many made
   * it and the snapshot says so where one did not.
   */
  const uploadImages = useCallback(
    async (ids: string[]): Promise<Map<string, string>> => {
      const urlById = new Map<string, string>();
      for (const id of ids) {
        try {
          const blob = await getImageBlob(id);
          if (!blob) continue;
          const uploadUrl = await generateUploadUrl();
          const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'application/octet-stream' },
            body: blob,
          });
          if (!res.ok) continue;
          const { storageId } = await res.json();
          const url = await getImageUrl({ storageId });
          if (url) urlById.set(id, url);
        } catch {
          // Keep going; the ref survives untouched and the next publish retries.
        }
      }
      return urlById;
    },
    [generateUploadUrl, getImageUrl],
  );

  /** Write the newly-durable URLs back into the notes they came from. */
  const adoptImageUrls = useCallback(
    (sourceNoteIds: string[], urlById: Map<string, string>) => {
      if (urlById.size === 0) return;
      const wanted = new Set(sourceNoteIds);
      for (const note of notes) {
        if (!wanted.has(note.id)) continue;
        if (!localImageIds(note.body).some((id) => urlById.has(id))) continue;
        // `silent` because the author did not touch the note — this must not
        // move updatedAt, break the "changes since last save" diff, or count
        // towards the writing streak.
        updateNote(note.id, { body: rewriteResolvedImages(note.body, urlById) }, { silent: true });
      }
    },
    [notes, updateNote],
  );

  const run = useCallback(
    async (plan: PublishPlan, indexable: boolean): Promise<PublishResult> => {
      if (!enabled) {
        return { ok: false, error: 'Sign in to publish — a shared link needs an account behind it.' };
      }
      const blocker = publishBlocker(plan);
      if (blocker) return { ok: false, error: blocker };

      setBusyId(plan.rootLocalId);
      try {
        const urlById = await uploadImages(plan.localImageIds);
        adoptImageUrls(plan.sourceNoteIds, urlById);

        const { slug } = await reserveSlug({
          kind: plan.kind,
          rootLocalId: plan.rootLocalId,
          title: plan.title,
        });

        const finished = finishPlan(plan, urlById, slug);
        try {
          await writePages({
            kind: finished.kind,
            rootLocalId: finished.rootLocalId,
            title: finished.title,
            indexable,
            pages: finished.pages,
          });
        } catch (err) {
          // The slug was reserved a moment ago and has nothing behind it.
          // Leaving it would show up as a published page that 404s, so take
          // it back down before reporting the failure — unless this was a
          // republish, in which case the previous pages are still standing.
          if (!byRoot.has(plan.rootLocalId)) {
            try { await removePublication({ rootLocalId: plan.rootLocalId }); } catch {}
          }
          throw err;
        }

        return {
          ok: true,
          slug,
          url: publicUrl(slug),
          pageCount: finished.pages.length,
          imagesUploaded: urlById.size,
        };
      } catch (err) {
        return { ok: false, error: messageOf(err) };
      } finally {
        setBusyId(null);
      }
    },
    [enabled, uploadImages, adoptImageUrls, reserveSlug, writePages, removePublication, byRoot],
  );

  const publishNote = useCallback(
    (note: Note, opts?: { indexable?: boolean }) =>
      run(planNote(note), opts?.indexable ?? false),
    [run],
  );

  const publishFolder = useCallback(
    (folder: Folder, opts?: { indexable?: boolean }) =>
      run(planFolder(folder, folders, notes), opts?.indexable ?? false),
    [run, folders, notes],
  );

  /** Takes the link down. Safe to call for something that was never
   *  published, so callers on the way to deleting a note need not check. */
  const unpublish = useCallback(
    async (rootLocalId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!enabled) return { ok: true };
      setBusyId(rootLocalId);
      try {
        await removePublication({ rootLocalId });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: messageOf(err) };
      } finally {
        setBusyId(null);
      }
    },
    [enabled, removePublication],
  );

  return {
    /* rootLocalId → what is published from it. Absent means not published,
       including for the moment before the list has loaded — the app already
       holds its whole render until the initial Convex pull lands, and this
       query goes out with it, so there is no window worth a loading flag. */
    publications: byRoot,
    busyId,
    publishNote,
    publishFolder,
    unpublish,
  };
}

export type UsePublishReturn = ReturnType<typeof usePublish>;

function messageOf(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Convex wraps a thrown Error with its own framing; the sentence the
  // mutation actually wrote is the last useful line.
  const match = raw.match(/Uncaught Error:\s*(.+?)(?:\n|$)/);
  return (match ? match[1] : raw).trim() || 'Publishing failed.';
}
