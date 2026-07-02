import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  // Site URL is needed for auth cookies/redirects in production
  siteUrl: process.env.CONVEX_SITE_URL || "http://localhost:3000",
});
