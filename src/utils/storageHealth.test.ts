/**
 * Checks for the storage failure reporter.
 *
 * Run with:  npm run check:storage
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * The bug this guards against is silence: a write that throws, a catch block
 * that does nothing, and a reader who finds out on reload. Every case here is
 * a failure that has to reach someone.
 */

import { isQuotaError, writeLocal, onStorageFailure, reportStorageFailure } from './storageHealth.ts';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) { passed++; return; }
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

/* ============================================================
   Recognising "out of room" across browsers

   Each engine reports a full quota differently, and treating one of these as
   an unexpected error would give the reader the wrong advice.
   ============================================================ */

function domError(name: string, code?: number) {
  const err = new Error('quota');
  err.name = name;
  if (code !== undefined) (err as { code?: number }).code = code;
  return err;
}

check('Chrome QuotaExceededError', isQuotaError(domError('QuotaExceededError')));
check('Firefox NS_ERROR_DOM_QUOTA_REACHED', isQuotaError(domError('NS_ERROR_DOM_QUOTA_REACHED')));
check('legacy WebKit code 22', isQuotaError(domError('SomethingElse', 22)));
check('Firefox legacy code 1014', isQuotaError(domError('SomethingElse', 1014)));

check('an ordinary error is not a quota error', !isQuotaError(new Error('boom')));
check('a non-error is not a quota error', !isQuotaError('QuotaExceededError'));
check('null is not a quota error', !isQuotaError(null));

/* ============================================================
   A failed write is reported, not swallowed
   ============================================================ */

const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
const originalConsoleError = console.error;

function withStorage(setItem: (k: string, v: string) => void, run: () => void) {
  (globalThis as { localStorage?: unknown }).localStorage = {
    setItem,
    getItem: () => null,
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };
  console.error = () => {}; // the reporter logs by design; keep the run quiet
  try { run(); } finally {
    console.error = originalConsoleError;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  }
}

// A write that works reports nothing and says so.
withStorage(() => {}, () => {
  let heard = 0;
  const off = onStorageFailure(() => { heard++; });
  const ok = writeLocal('sb-test', { a: 1 });
  off();
  check('a successful write returns true', ok === true);
  check('a successful write notifies nobody', heard === 0, `heard ${heard}`);
});

// A write that hits the quota reports it, and says the write did not happen.
withStorage(() => { throw domError('QuotaExceededError'); }, () => {
  const seen: { key: string; outOfRoom: boolean }[] = [];
  const off = onStorageFailure((f) => seen.push(f));
  const ok = writeLocal('sb-notes', { a: 1 });
  off();
  check('a failed write returns false', ok === false);
  check('a failed write notifies a listener', seen.length === 1, `heard ${seen.length}`);
  check('the failure names the key', seen[0]?.key === 'sb-notes', `got ${seen[0]?.key}`);
  check('the failure is flagged as out of room', seen[0]?.outOfRoom === true);
});

// A failure that is not the quota must not tell the reader to delete books.
withStorage(() => { throw new Error('SecurityError: storage disabled'); }, () => {
  const seen: { outOfRoom: boolean }[] = [];
  const off = onStorageFailure((f) => seen.push(f));
  writeLocal('sb-notes', { a: 1 });
  off();
  check('a non-quota failure is still reported', seen.length === 1);
  check('a non-quota failure is not "out of room"', seen[0]?.outOfRoom === false);
});

// Every listener hears it, and one bad listener cannot stop the others.
withStorage(() => { throw domError('QuotaExceededError'); }, () => {
  let a = 0, c = 0;
  const offA = onStorageFailure(() => { a++; });
  const offB = onStorageFailure(() => { throw new Error('bad listener'); });
  const offC = onStorageFailure(() => { c++; });
  let threw = false;
  try { writeLocal('sb-notes', {}); } catch { threw = true; }
  offA(); offB(); offC();
  check('a throwing listener does not break the write path', !threw);
  check('listeners before the bad one still hear', a === 1);
  check('listeners after the bad one still hear', c === 1, `c=${c}`);
});

// Unsubscribing works — a component that unmounts stops hearing.
withStorage(() => {}, () => {
  let heard = 0;
  const off = onStorageFailure(() => { heard++; });
  off();
  console.error = () => {};
  reportStorageFailure('sb-test', domError('QuotaExceededError'));
  console.error = originalConsoleError;
  check('an unsubscribed listener hears nothing', heard === 0, `heard ${heard}`);
});

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nStorage health checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Storage health checks: all ${passed} passed.`);
