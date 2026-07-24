'use client';

import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ReactNode } from 'react';

// The deployment URL is injected at build time by `convex deploy` (Vercel)
// or read from .env.local in dev. No hard-coded fallback — a stale one would
// silently point the app at a dead deployment.
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.error(
    'NEXT_PUBLIC_CONVEX_URL is not set. Convex/auth are disabled. ' +
      'Set it in .env.local (dev) or let `convex deploy` inject it (Vercel).',
  );
}

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

// ConvexAuthProvider wraps ConvexProviderWithAuth internally — do not nest
// a plain ConvexProvider around it or queries will not carry auth tokens.
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
