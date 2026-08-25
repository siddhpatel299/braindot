// The one place identity is turned into a storage key.
//
// It used to live inside functions.ts, which was fine while every function in
// the app was a sync function. Publishing added a second module that has to
// answer the same question, and an auth check that exists twice is an auth
// check that eventually disagrees with itself.

/**
 * The stable per-user key rows are filed under, or a thrown error.
 *
 * Under Convex Auth, identity.subject is "<userId>|<sessionId>". The session
 * part changes on every sign-in, so key data by the stable userId only —
 * otherwise each login would see an empty vault.
 */
export async function getVerifiedToken(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated — please sign in");
  }
  return String(identity.subject).split("|")[0];
}
