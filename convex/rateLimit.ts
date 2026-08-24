import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// Rate limiting for the endpoints that cost money
//
// The AI routes live in Next.js, not Convex, so the counter has to be
// somewhere both a serverless function and its neighbours can see. Vercel
// gives every request a possibly-cold, possibly-parallel instance, so an
// in-process Map would have counted a fraction of the traffic and let the
// configured limit through several times over.
//
// This is a fixed-window counter: one row per key, replaced when the window
// rolls. Cheaper and simpler than a sliding log, and the failure mode — up to
// 2x the limit across a window boundary — does not matter for a spend cap.
// ============================================================

/**
 * Only the Next.js server may move these counters.
 *
 * Without this the mutation would be the bypass: anyone could call it with a
 * key they invented and get a fresh allowance, or spend a stranger's. The
 * secret says "this call came from our own server, and the key in it is one
 * that server derived" — neither of which a browser can claim.
 */
function assertCaller(secret: string) {
  const expected = process.env.RATE_LIMIT_SECRET;
  if (!expected) {
    throw new Error(
      "RATE_LIMIT_SECRET is not set on this Convex deployment. Set it with " +
        "`npx convex env set RATE_LIMIT_SECRET <value>` and give the Next.js " +
        "server the same value.",
    );
  }
  // Compared without an early exit, so the time taken says nothing about how
  // much of a guess was right.
  let diff = secret.length ^ expected.length;
  for (let i = 0; i < secret.length; i++) {
    diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i % expected.length);
  }
  if (diff !== 0) throw new Error("Bad rate-limit secret");
}

/**
 * Spend one unit against `key`, and say whether it was there to spend.
 *
 * Returns rather than throws when the limit is hit: a caller over quota is an
 * ordinary answer the route turns into a 429, not an error worth logging.
 */
export const consume = mutation({
  args: {
    secret: v.string(),
    key: v.string(),
    limit: v.number(),
    windowMs: v.number(),
  },
  handler: async (ctx, args) => {
    assertCaller(args.secret);

    const now = Date.now();
    const windowStart = Math.floor(now / args.windowMs) * args.windowMs;
    const resetAt = windowStart + args.windowMs;

    const row = await ctx.db
      .query("rateLimits")
      .withIndex("byKey", (q) => q.eq("key", args.key))
      .first();

    // No row, or one left over from a window that has since rolled.
    if (!row || row.windowStart !== windowStart) {
      const fields = { key: args.key, windowStart, count: 1, expiresAt: resetAt };
      if (row) await ctx.db.patch(row._id, fields);
      else await ctx.db.insert("rateLimits", fields);
      return { ok: true, remaining: Math.max(0, args.limit - 1), resetAt };
    }

    if (row.count >= args.limit) {
      return { ok: false, remaining: 0, resetAt };
    }

    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { ok: true, remaining: Math.max(0, args.limit - row.count - 1), resetAt };
  },
});

/**
 * Drop rows whose window ended long ago.
 *
 * A signed-in user reuses one row forever, but every anonymous address gets
 * its own and never comes back, so without this the table only grows. Run it
 * from a cron:
 *
 *   crons.daily("sweep rate limits", { hourUTC: 4, minuteUTC: 0 },
 *     internal.rateLimit.sweep, {});
 */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    // An hour past expiry, so a window still being counted is never touched.
    const cutoff = Date.now() - 60 * 60 * 1000;
    const stale = await ctx.db
      .query("rateLimits")
      .withIndex("byExpiry", (q) => q.lt("expiresAt", cutoff))
      .take(2000);
    for (const row of stale) await ctx.db.delete(row._id);
    return { deleted: stale.length };
  },
});
