// Telling someone when a save did not happen.
//
// Every localStorage write in the vault used to be wrapped in
// `try { ... } catch {}`. When the quota ran out the exception went nowhere:
// the app carried on, the editor kept accepting text, and the work since the
// last successful write was gone on reload with nothing having said so.
//
// Swallowing is right for a UI preference — a lost sidebar width is not worth
// a message. It is wrong for anything the reader typed. These let the callers
// that hold real data report a failure to whoever is listening.

/** Does this exception mean "out of room" rather than something else? */
export function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // Firefox and Safari each have their own name for it, and older WebKit uses
  // a numeric code with no useful name at all.
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (err as { code?: number }).code === 22 ||
    (err as { code?: number }).code === 1014
  );
}

export interface StorageFailure {
  /** The localStorage key that could not be written. */
  key: string;
  /** True when the cause was the quota rather than an unexpected error. */
  outOfRoom: boolean;
}

type Listener = (failure: StorageFailure) => void;

const listeners = new Set<Listener>();

/** Report a write that did not happen. Safe to call from anywhere. */
export function reportStorageFailure(key: string, err: unknown) {
  const failure: StorageFailure = { key, outOfRoom: isQuotaError(err) };
  // Always leave a trace, even with nothing subscribed.
  console.error(
    `[storage] could not write "${key}"${failure.outOfRoom ? ' — out of room' : ''}:`,
    err instanceof Error ? err.message : err,
  );
  for (const listener of listeners) {
    try { listener(failure); } catch { /* a bad listener must not break saving */ }
  }
}

export function onStorageFailure(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Write, and say whether it worked.
 *
 * Replaces the bare `try/catch {}` at each call site that holds real data.
 */
export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    reportStorageFailure(key, err);
    return false;
  }
}
