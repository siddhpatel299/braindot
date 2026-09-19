import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { PasswordReset } from "./passwordReset";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  // `reset` is what turns on the "reset" and "reset-verification" flows the
  // /auth page calls. Without it the provider answers both with
  // "Password reset is not enabled".
  providers: [Password({ reset: PasswordReset })],
});
