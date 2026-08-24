// Braindot — who is calling a paid endpoint, and may they.
//
// Server only. The AI routes reach OpenAI on the caller's behalf, so until
// this existed anyone who knew the deployment's address could spend the
// project's API budget by POSTing to it in a loop.
//
// Identity is a Convex Auth JWT the browser already holds, verified here
// against the deployment's public keys — no round-trip, and nothing the
// client sends is taken on trust.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/lib/convex-api';

/** The `.convex.site` twin of the deployment URL, which is what signs tokens. */
const siteUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\.convex\.cloud\/?$/, '.convex.site');

// Cached across invocations on a warm instance; jose refetches on key rotation.
const jwks = siteUrl ? createRemoteJWKSet(new URL(`${siteUrl}/.well-known/jwks.json`)) : null;

export interface Caller {
  /** Convex user id, or null when nobody is signed in. */
  userId: string | null;
  /** Stable per-caller label used to key the counter. */
  key: string;
}

/**
 * The address the request actually came from.
 *
 * This decides which bucket an anonymous caller is counted in, so a header the
 * caller can choose would be a header that hands them a fresh allowance per
 * request. `x-real-ip` is set by the platform and overwritten if a client
 * sends its own, which is why it is asked first.
 *
 * `x-forwarded-for` is a list anyone can prepend to, so only the last entry —
 * the one the proxy nearest us appended — means anything. Reading the first,
 * as most snippets do, is the bypass.
 */
function clientIp(req: NextRequest): string {
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real;

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }

  // No address at all. Everyone in this position shares one bucket, which is
  // strict rather than lax — the alternative is an unmetered hole.
  return 'unknown';
}

/** Hashed with the shared secret as salt — an address is personal data, and
 *  nothing downstream needs to read it back. */
async function hashIp(ip: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify the bearer token, if one was sent.
 *
 * An absent or bad token is not an error — it is an anonymous caller, who is
 * allowed a smaller allowance rather than turned away.
 */
export async function identify(req: NextRequest, salt: string): Promise<Caller> {
  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (bearer && jwks && siteUrl) {
    try {
      const { payload } = await jwtVerify(bearer, jwks, {
        issuer: siteUrl,
        audience: 'convex',
      });
      // sub is "<userId>|<sessionId>"; the session half changes on every
      // sign-in, so the quota follows the user, not the tab.
      const userId = String(payload.sub ?? '').split('|')[0];
      if (userId) return { userId, key: `u:${userId}` };
    } catch {
      // Expired or forged — fall through and treat as anonymous.
    }
  }
  return { userId: null, key: `a:${await hashIp(clientIp(req), salt)}` };
}

export interface Quota {
  /** Calls a signed-in user gets, and over what stretch. */
  user: number;
  userWindowMs: number;
  /** The same for an anonymous caller. Deliberately a smaller number over a
   *  longer window: enough to see what the feature does, not enough to run a
   *  workload through it. */
  anon: number;
  anonWindowMs: number;
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

type Allowed = { ok: true; caller: Caller };
type Denied = { ok: false; response: NextResponse };

/**
 * Establish who is calling and spend one unit of their allowance.
 *
 * Fails closed. If the secret or the deployment URL is missing the endpoint
 * refuses rather than serving unmetered — an open AI endpoint costs real money
 * and a broken one only costs a deploy.
 */
export async function guard(
  req: NextRequest,
  bucket: string,
  quota: Quota,
): Promise<Allowed | Denied> {
  const secret = process.env.RATE_LIMIT_SECRET;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!secret || !convexUrl) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            'This endpoint is not configured. Set RATE_LIMIT_SECRET on both the ' +
            'web server and the Convex deployment, and NEXT_PUBLIC_CONVEX_URL here.',
        },
        { status: 503 },
      ),
    };
  }

  const caller = await identify(req, secret);
  const limit = caller.userId ? quota.user : quota.anon;
  const windowMs = caller.userId ? quota.userWindowMs : quota.anonWindowMs;

  let verdict: { ok: boolean; remaining: number; resetAt: number };
  try {
    const convex = new ConvexHttpClient(convexUrl);
    verdict = await convex.mutation(api.rateLimit.consume, {
      secret,
      key: `${caller.key}:${bucket}`,
      limit,
      windowMs,
    });
  } catch (err) {
    // The counter is unreachable or misconfigured. Refuse: an endpoint that
    // cannot be metered is exactly the one not to leave open.
    console.error('[apiGuard] rate limit unavailable:', err instanceof Error ? err.message : err);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'AI is briefly unavailable. Try again in a moment.' },
        { status: 503 },
      ),
    };
  }

  if (!verdict.ok) {
    const waitMins = Math.max(1, Math.ceil((verdict.resetAt - Date.now()) / 60000));
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: caller.userId
            ? `You have used your AI allowance for now. It resets in about ${waitMins} minute${waitMins === 1 ? '' : 's'}.`
            : 'That is the free trial\'s AI allowance for today. Sign in to keep using it.',
          signInRequired: !caller.userId,
        },
        {
          status: 429,
          headers: { 'retry-after': String(Math.ceil((verdict.resetAt - Date.now()) / 1000)) },
        },
      ),
    };
  }

  return { ok: true, caller };
}
