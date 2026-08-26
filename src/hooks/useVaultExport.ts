'use client';

// Getting the whole vault onto disk.
//
// utils/vaultExport decides what the files are; utils/zip turns them into an
// archive. This is the part that needs a browser: reading image bytes out of
// IndexedDB, and handing the result to the download the user asked for.
//
// It runs entirely on the client on purpose. The vault already lives here, so
// there is nothing to upload and nothing to wait for — and an export that
// needs the network is an export you cannot take when the service is down,
// which is exactly when you want one.

import { useCallback, useState } from 'react';
import type { Bookmark, CanvasBoard, Folder, Highlight, LibraryItem, Note, Task } from '@/types';
import { getImageBlob } from '@/utils/imageStore';
import {
  ATTACHMENTS_DIR, buildVaultFiles, exportFilename, referencedImageIds,
  type VaultInput,
} from '@/utils/vaultExport';
import { makeZip, type ZipEntry } from '@/utils/zip';

/** Extension for the blob's own type, so the file opens by double-click. */
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

export interface ExportResult {
  ok: boolean;
  filename?: string;
  noteCount?: number;
  imageCount?: number;
  /** Images the note bodies point at whose bytes are not on this device.
   *  Worth reporting: those pictures are simply not in the archive. */
  missingImages?: number;
  error?: string;
}

interface Options {
  notes: Note[];
  folders: Folder[];
  tasks: Task[];
  library: LibraryItem[];
  highlights: Highlight[];
  bookmarks: Bookmark[];
  boards: CanvasBoard[];
}

export function useVaultExport(vault: Options) {
  const [busy, setBusy] = useState(false);

  const exportVault = useCallback(async (): Promise<ExportResult> => {
    setBusy(true);
    try {
      const when = new Date();
      const wanted = referencedImageIds(vault.notes);

      // Collected before the markdown is built, because the filenames the
      // notes link to are decided here.
      const entries: ZipEntry[] = [];
      const fileById = new Map<string, string>();
      let missing = 0;

      for (const id of wanted) {
        const blob = await getImageBlob(id);
        if (!blob) { missing++; continue; }
        const ext = EXTENSIONS[blob.type] ?? 'bin';
        const filename = `${id}.${ext}`;
        fileById.set(id, filename);
        entries.push({
          path: `${ATTACHMENTS_DIR}/${filename}`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }

      for (const file of buildVaultFiles(vault as VaultInput, fileById, when)) {
        entries.push({ path: file.path, data: file.content });
      }

      const filename = exportFilename(when);
      const blob = await makeZip(entries, when);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return {
        ok: true,
        filename,
        noteCount: vault.notes.length,
        imageCount: fileById.size,
        missingImages: missing,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      setBusy(false);
    }
  }, [vault]);

  return { exportVault, busy };
}
