'use client';

// Generic local-first ⇄ Convex collection sync.
//
// The app keeps every collection in client state (instant interactions,
// no cursor jumps in the editor). This hook mirrors one collection to
// Convex for the signed-in user:
//
//   1. Pull once on login. If the server has docs, they replace local state
//      (cloud is the source of truth across devices). If the server is empty
//      but local has data, local wins and is pushed up (first-login
//      migration of existing localStorage vaults).
//   2. After that, every local change is diffed against the last-synced
//      snapshot and pushed (upserts + deletes) after a short debounce.
//   3. LIVE SYNC: the pull query is a Convex subscription, so changes made
//      on another device/tab keep arriving. They are merged into local state
//      whenever the local copy of that document is clean — a locally
//      modified document always wins until its push lands (last writer
//      wins per document).
//
// That conflict policy is fine for a single-user PKM app.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/lib/convex-api';

interface SyncOptions<T extends { id: string }> {
  table: string;
  enabled: boolean;
  items: T[];
  /** Replace local state with cloud state (login pull + live remote merges). */
  hydrate: (items: T[]) => void;
  /** Map a local item to its Convex doc shape (must include localId). */
  toDoc: (item: T) => Record<string, unknown> & { localId: string };
  /** Map a Convex doc back to the local item shape. */
  fromDoc: (doc: Record<string, unknown>) => T;
}

export interface CollectionSyncState {
  /** True once the initial pull has resolved (or sync is disabled). */
  cloudReady: boolean;
  /** True while a push is in flight. */
  syncing: boolean;
}

type AnyDoc = Record<string, unknown>;

function stripSystemFields(doc: AnyDoc): AnyDoc {
  const { _id, _creationTime, tokenIdentifier, ...fields } = doc;
  return fields;
}

export function useCollectionSync<T extends { id: string }>(
  opts: SyncOptions<T>,
): CollectionSyncState {
  const { table, enabled, items, hydrate, toDoc, fromDoc } = opts;

  const pulled = useQuery(api.functions.pull, enabled ? { table } : 'skip');
  const pushMut = useMutation(api.functions.push);

  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // localId -> canonical serialized doc as last confirmed on the server
  const lastSynced = useRef<Map<string, string>>(new Map());
  const pushing = useRef(false);

  const hydrateRef = useRef(hydrate);
  hydrateRef.current = hydrate;
  const fromDocRef = useRef(fromDoc);
  fromDocRef.current = fromDoc;
  const toDocRef = useRef(toDoc);
  toDocRef.current = toDoc;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Canonical form: server docs pass through fromDoc→toDoc so both sides
  // serialize with identical keys and key order.
  const canonRemote = useCallback((fields: AnyDoc): string => {
    return JSON.stringify(toDocRef.current(fromDocRef.current(fields)));
  }, []);

  // Reset when sync turns off (sign-out)
  useEffect(() => {
    if (!enabled && cloudHydrated) {
      setCloudHydrated(false);
      lastSynced.current = new Map();
    }
  }, [enabled, cloudHydrated]);

  // ---- Initial pull ----
  useEffect(() => {
    if (!enabled || cloudHydrated || pulled === undefined) return;
    if (pulled.length > 0) {
      const snapshot = new Map<string, string>();
      const cloudItems: T[] = [];
      for (const doc of pulled) {
        const fields = stripSystemFields(doc as AnyDoc);
        const item = fromDocRef.current(fields);
        snapshot.set(item.id, JSON.stringify(toDocRef.current(item)));
        cloudItems.push(item);
      }
      lastSynced.current = snapshot;
      hydrateRef.current(cloudItems);
    }
    // Server empty → keep local items; the push loop below uploads them.
    setCloudHydrated(true);
  }, [enabled, cloudHydrated, pulled]);

  // ---- Live remote merge (multi-device / multi-tab) ----
  useEffect(() => {
    if (!enabled || !cloudHydrated || pulled === undefined) return;
    if (pushing.current) return; // wait until our own push settles

    const current = itemsRef.current;
    const itemsById = new Map(current.map((it) => [it.id, it]));
    const remoteIds = new Set<string>();
    let changed = false;
    let next = [...current];

    for (const doc of pulled) {
      const fields = stripSystemFields(doc as AnyDoc);
      const id = String(fields.localId);
      remoteIds.add(id);
      const remoteJson = canonRemote(fields);
      const known = lastSynced.current.get(id);
      if (known === remoteJson) continue; // nothing new from the server

      const localItem = itemsById.get(id);
      if (!localItem) {
        if (known === undefined) {
          // Created on another device → add locally
          next.push(fromDocRef.current(fields));
          lastSynced.current.set(id, remoteJson);
          changed = true;
        }
        // else: deleted locally with the delete push pending — local wins
      } else {
        const localJson = JSON.stringify(toDocRef.current(localItem));
        if (localJson === known || localJson === remoteJson) {
          // Local copy is clean (or already identical) → apply remote
          next = next.map((it) => (it.id === id ? fromDocRef.current(fields) : it));
          lastSynced.current.set(id, remoteJson);
          if (localJson !== remoteJson) changed = true;
        }
        // else: local has unpushed edits — local wins, push will overwrite
      }
    }

    // Remote deletions: known to the server before, now gone
    for (const [id, known] of Array.from(lastSynced.current.entries())) {
      if (remoteIds.has(id)) continue;
      const localItem = itemsById.get(id);
      if (!localItem) {
        lastSynced.current.delete(id);
        continue;
      }
      const localJson = JSON.stringify(toDocRef.current(localItem));
      if (localJson === known) {
        // Deleted on another device and untouched here → remove locally
        next = next.filter((it) => it.id !== id);
        lastSynced.current.delete(id);
        changed = true;
      }
      // else: edited locally after the remote delete — local wins, the
      // pending upsert will re-create it on the server
    }

    if (changed) hydrateRef.current(next);
  }, [enabled, cloudHydrated, pulled, canonRemote]);

  // ---- Debounced diff push ----
  const doPush = useCallback(async (current: T[]) => {
    if (pushing.current) return;
    const upserts: Record<string, unknown>[] = [];
    const currentIds = new Set<string>();
    for (const item of current) {
      currentIds.add(item.id);
      const doc = toDocRef.current(item);
      const json = JSON.stringify(doc);
      if (lastSynced.current.get(item.id) !== json) {
        upserts.push(doc);
      }
    }
    const deletes: string[] = [];
    for (const id of lastSynced.current.keys()) {
      if (!currentIds.has(id)) deletes.push(id);
    }
    if (upserts.length === 0 && deletes.length === 0) return;

    pushing.current = true;
    setSyncing(true);
    try {
      await pushMut({ table, upserts, deletes });
      for (const doc of upserts) {
        lastSynced.current.set(String(doc.localId), JSON.stringify(doc));
      }
      for (const id of deletes) lastSynced.current.delete(id);
    } catch (err) {
      console.error(`[sync:${table}] push failed`, err);
    } finally {
      pushing.current = false;
      setSyncing(false);
    }
  }, [pushMut, table]);

  useEffect(() => {
    if (!enabled || !cloudHydrated) return;
    const t = setTimeout(() => { void doPush(items); }, 900);
    return () => clearTimeout(t);
  }, [enabled, cloudHydrated, items, doPush]);

  // Flush pending changes when the tab is hidden/closed
  useEffect(() => {
    if (!enabled || !cloudHydrated) return;
    const flush = () => { void doPush(items); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [enabled, cloudHydrated, items, doPush]);

  return { cloudReady: !enabled || cloudHydrated, syncing };
}
