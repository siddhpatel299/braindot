'use client';

import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider, useAuthToken } from '@convex-dev/auth/react';
import { ReactNode, useEffect } from 'react';
import { setAuthToken } from '@/lib/authToken';

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

/**
 * Publishes the auth token so non-React callers can read it.
 *
 * The AI routes are metered per account, which means every fetch to one has to
 * carry the token, and useAuthToken is the only supported way to get it.
 * Renders nothing — it exists to be inside the provider.
 */
function AuthTokenBridge() {
  const token = useAuthToken();
  useEffect(() => { setAuthToken(token); }, [token]);
  return null;
}

// ConvexAuthProvider wraps ConvexProviderWithAuth internally — do not nest
// a plain ConvexProvider around it or queries will not carry auth tokens.
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return (
    <ConvexAuthProvider client={convex}>
      <AuthTokenBridge />
      {children}
    </ConvexAuthProvider>
  );
}
