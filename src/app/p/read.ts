// Reading a published page, from the server.
//
// This is the only data access in the app that runs without a signed-in user,
// and it runs on the server rather than in the browser on purpose: a shared
// link should render for someone with JavaScript off, arrive in a link
// preview with a real title, and never ship the app's bundle to a reader who
// only wants to read. `convex/publish.ts:read` is the matching half — it
// returns a hand-written shape so nothing from the row leaks with it.

import { cache } from 'react';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/lib/convex-api';

export interface PublicChild {
  path: string;
  title: string;
  kind: string;
  subtitle: string;
}

export interface PublicPage {
  publication: {
    slug: string;
    kind: string;
    title: string;
    indexable: boolean;
    pageCount: number;
    updatedAt: string;
  };
  page: {
    path: string;
    kind: string;
    title: string;
    subtitle: string;
    tags: string[];
    body: string;
    wordCount: number;
    updatedAt: string;
    children: PublicChild[];
    trail: { path: string; title: string }[];
  };
}

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * One page of a publication, or null for anything that is not one.
 *
 * Null covers a slug that was never issued, a slug whose publication has been
 * taken down, and a path inside a live publication that does not exist. The
 * caller renders the same 404 for all three: telling a visitor which of those
 * it was would confirm that a slug is real, which is the one thing an
 * unguessable link is supposed to withhold.
 *
 * Wrapped in React's `cache` because generateMetadata and the page component
 * both need the same page, and without it every published page would cost two
 * identical round-trips instead of one.
 */
export const readPublicPage = cache(async (
  slug: string,
  path: string,
): Promise<PublicPage | null> => {
  if (!convexUrl) return null;
  try {
    const client = new ConvexHttpClient(convexUrl);
    return (await client.query(api.publish.read, { slug, path })) as PublicPage | null;
  } catch {
    return null;
  }
});

/** The first stretch of prose, for a link preview and the description tag. */
export function summarise(body: string, limit = 180): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[#*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  const cut = plain.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** '2026-08-25T…' → '25 Aug 2026'. Fixed locale so the server and the reader
 *  agree; a date that changes on hydration is a whole class of bug. */
export function readableDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
