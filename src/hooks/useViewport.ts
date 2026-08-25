'use client';

// Is this a phone-sized viewport?
//
// `use-mobile.ts` answers the same question for the shadcn sidebar primitive,
// but it settles in an effect — the desktop shell paints for a frame before
// it flips, which on a phone is a visible lurch of a 638px-wide chrome that
// then vanishes. useSyncExternalStore reads the media query during the first
// client render instead, so the mobile shell is the first thing painted.

import { useSyncExternalStore } from 'react';

/** Below this the four-zone desktop shell has no room to stand up. */
export const MOBILE_BREAKPOINT = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// The server has no viewport. Desktop is the safer guess: it is what every
// existing user has, and a phone corrects it on the first client render.
function getServerSnapshot(): boolean {
  return false;
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Wide enough for the desktop shell, too narrow to also carry the margin.
 *  Rail + list + margin is 638px of chrome; at 1100px that leaves the page
 *  about 460px, and below it the page starts losing to its own apparatus. */
export const NARROW_BREAKPOINT = 1100;

const NARROW_QUERY = `(max-width: ${NARROW_BREAKPOINT - 1}px)`;

function subscribeNarrow(onChange: () => void): () => void {
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getNarrowSnapshot(): boolean {
  return window.matchMedia(NARROW_QUERY).matches;
}

export function useIsNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, getNarrowSnapshot, getServerSnapshot);
}
