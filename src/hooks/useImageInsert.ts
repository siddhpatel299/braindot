'use client';

// Turns a picked/pasted/dropped file into the markdown URL that goes in a note.
//
// Signed in  → Convex file storage, and the note gets the ordinary HTTPS URL
//              Convex serves it from. The image travels with the note: it
//              appears on every device, and survives an export because the
//              link is a real one, not an app-private reference.
//
// Signed out → IndexedDB in this browser, referenced as braindot:img/<id>.
//              Demo mode has no account to attach a file to, so this keeps the
//              public demo usable rather than failing the drop outright.

import { useCallback } from 'react';
import { useConvexAuth, useMutation } from 'convex/react';
import { api } from '@/lib/convex-api';
import { normaliseImage, putImage, idToRef } from '@/utils/imageStore';

export type ImageInsertResult = {
  url: string;
  /** False when the image only exists in this browser. */
  synced: boolean;
};

export function useImageInsert() {
  const { isAuthenticated } = useConvexAuth();
  const generateUploadUrl = useMutation(api.functions.generateUploadUrl);
  const getImageUrl = useMutation(api.functions.getImageUrl);

  return useCallback(
    async (file: Blob): Promise<ImageInsertResult> => {
      // Downscale first either way — it decides what gets uploaded, not just
      // what gets stored.
      const blob = await normaliseImage(file);

      if (isAuthenticated) {
        try {
          const postUrl = await generateUploadUrl();
          const res = await fetch(postUrl, {
            method: 'POST',
            headers: { 'Content-Type': blob.type || 'application/octet-stream' },
            body: blob,
          });
          if (!res.ok) throw new Error(`upload failed: ${res.status}`);
          const { storageId } = await res.json();
          const url = await getImageUrl({ storageId });
          if (url) return { url, synced: true };
          throw new Error('no url returned for uploaded file');
        } catch {
          // Offline, or storage rejected it. Falling back to local keeps the
          // image rather than losing the paste; the caller reports it as
          // this-device-only so the difference is not silent.
        }
      }

      const id = await putImage(blob);
      return { url: idToRef(id), synced: false };
    },
    [isAuthenticated, generateUploadUrl, getImageUrl],
  );
}
