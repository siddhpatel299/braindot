'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Note } from '@/types';
import { countWords } from '@/utils/markdown';

/**
 * Editor state hook: tracks unsaved changes (debounced save),
 * live word count, and the local working copy of the note body.
 *
 * Save semantics:
 *  - On body change, mark note as "dirty" (shows amber dot on tab)
 *  - After 1000ms of no further edits, call onSave with the new body
 *  - On tab switch, the debounced save will fire normally; we also
 *    expose flushSave() for explicit flush on ⌘S or unmount.
 */
export function useEditor(
  note: Note | undefined,
  onSave: (id: string, patch: Partial<Note>) => void,
) {
  const [body, setBody] = useState<string>(note?.body ?? '');
  const [title, setTitle] = useState<string>(note?.title ?? '');
  const [subtitle, setSubtitle] = useState<string>(note?.subtitle ?? '');
  const [dirty, setDirty] = useState<boolean>(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNoteId = useRef<string | undefined>(note?.id);
  // We track this so we don't clobber user typing when the note prop updates
  // from the save round-trip.
  const skipNextExternalUpdate = useRef<boolean>(false);

  // Keep latest values in refs so flushSave can read them without
  // being recreated on every keystroke.
  const bodyRef = useRef(body);
  const titleRef = useRef(title);
  const subtitleRef = useRef(subtitle);
  const dirtyRef = useRef(dirty);
  const noteRef = useRef(note);

  useEffect(() => { bodyRef.current = body; }, [body]);
  useEffect(() => { titleRef.current = title; }, [title]);
  useEffect(() => { subtitleRef.current = subtitle; }, [subtitle]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { noteRef.current = note; }, [note]);

  const flushSave = useCallback(() => {
    const n = noteRef.current;
    if (!n) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirtyRef.current) {
      onSave(n.id, {
        body: bodyRef.current,
        title: titleRef.current,
        subtitle: subtitleRef.current,
      });
      setDirty(false);
      skipNextExternalUpdate.current = true;
    }
  }, [onSave]);

  // When note id changes (tab switch), reset local state from the new note.
  useEffect(() => {
    if (note?.id !== lastNoteId.current) {
      // flush previous (using the ref-based flushSave so we read latest values)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      flushSave();
      lastNoteId.current = note?.id;
      setBody(note?.body ?? '');
      setTitle(note?.title ?? '');
      setSubtitle(note?.subtitle ?? '');
      setDirty(false);
      skipNextExternalUpdate.current = false;
    } else if (note && !skipNextExternalUpdate.current) {
      // external change (e.g., reset all) — only sync if we are not dirty
      if (!dirty) {
        setBody(note.body);
        setTitle(note.title);
        setSubtitle(note.subtitle);
      }
    }
  }, [note?.id, note?.body, note?.title, note?.subtitle, dirty, flushSave, note]);

  // Update body / title / subtitle with debounce
  const updateBody = useCallback(
    (next: string) => {
      setBody(next);
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (note) {
          onSave(note.id, { body: next });
          setDirty(false);
          skipNextExternalUpdate.current = true;
        }
      }, 1000);
    },
    [note, onSave],
  );

  const updateTitle = useCallback(
    (next: string) => {
      setTitle(next);
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (note) {
          onSave(note.id, { title: next });
          setDirty(false);
          skipNextExternalUpdate.current = true;
        }
      }, 1000);
    },
    [note, onSave],
  );

  const updateSubtitle = useCallback(
    (next: string) => {
      setSubtitle(next);
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (note) {
          onSave(note.id, { subtitle: next });
          setDirty(false);
          skipNextExternalUpdate.current = true;
        }
      }, 1000);
    },
    [note, onSave],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const wordCount = countWords(body);

  return {
    body,
    title,
    subtitle,
    dirty,
    wordCount,
    updateBody,
    updateTitle,
    updateSubtitle,
    flushSave,
  };
}
