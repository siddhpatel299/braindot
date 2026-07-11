'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Note } from '@/types';
import { countWords } from '@/utils/markdown';

/**
 * Editor state hook: tracks unsaved changes (debounced save),
 * live word count, and the local working copy of the note body.
 * Includes undo/redo history for the body.
 */
export function useEditor(
  note: Note | undefined,
  onSave: (id: string, patch: Partial<Note>) => void,
) {
  const [body, setBody] = useState<string>(note?.body ?? '');
  const [title, setTitle] = useState<string>(note?.title ?? '');
  const [subtitle, setSubtitle] = useState<string>(note?.subtitle ?? '');
  const [dirty, setDirty] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNoteId = useRef<string | undefined>(note?.id);
  const skipNextExternalUpdate = useRef<boolean>(false);

  // Undo/redo stacks
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastBodySnapshot = useRef<string>(note?.body ?? '');
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Update undo/redo availability
  useEffect(() => {
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(redoStack.current.length > 0);
  }, [body]);

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
      // Reset undo/redo stacks for the new note
      undoStack.current = [];
      redoStack.current = [];
      lastBodySnapshot.current = note?.body ?? '';
      setCanUndo(false);
      setCanRedo(false);
    } else if (note && !skipNextExternalUpdate.current) {
      // external change (e.g., reset all) — only sync if we are not dirty
      if (!dirty) {
        setBody(note.body);
        setTitle(note.title);
        setSubtitle(note.subtitle);
      }
    }
  }, [note?.id, note?.body, note?.title, note?.subtitle, dirty, flushSave, note]);

  // Update body with debounce + undo snapshot
  const updateBody = useCallback(
    (next: string) => {
      // Snapshot the previous body for undo (debounced — don't snapshot every keystroke)
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
      snapshotTimer.current = setTimeout(() => {
        if (lastBodySnapshot.current !== next) {
          undoStack.current.push(lastBodySnapshot.current);
          if (undoStack.current.length > 50) undoStack.current.shift();
          redoStack.current = [];
          lastBodySnapshot.current = next;
          setCanUndo(undoStack.current.length > 0);
          setCanRedo(false);
        }
      }, 500);

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

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const prev = undoStack.current.pop()!;
    redoStack.current.push(bodyRef.current);
    lastBodySnapshot.current = prev;
    setBody(prev);
    setDirty(true);
    setCanUndo(undoStack.current.length > 0);
    setCanRedo(true);
    if (note) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onSave(note.id, { body: prev });
        setDirty(false);
        skipNextExternalUpdate.current = true;
      }, 500);
    }
  }, [note, onSave]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(bodyRef.current);
    lastBodySnapshot.current = next;
    setBody(next);
    setDirty(true);
    setCanUndo(true);
    setCanRedo(redoStack.current.length > 0);
    if (note) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onSave(note.id, { body: next });
        setDirty(false);
        skipNextExternalUpdate.current = true;
      }, 500);
    }
  }, [note, onSave]);

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
    canUndo,
    canRedo,
    updateBody,
    updateTitle,
    updateSubtitle,
    flushSave,
    undo,
    redo,
  };
}
