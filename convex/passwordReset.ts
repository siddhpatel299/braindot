// Braindot — the code that gets you back into your own vault.
//
// Convex Auth's Password provider already knows the whole reset dance; it just
// refuses to start it until it is handed somewhere to send a code. Given one:
//
//   flow: "reset"               mints a short-lived code against the account
//                               and calls sendVerificationRequest with it
//   flow: "reset-verification"  redeems the code, writes the new password and
//                               invalidates every other session
//
// So all this file owes it is a way to get eight digits into an inbox.
//
// Delivery is Resend's HTTP API called with fetch, not the `resend` package:
// one less dependency, and the Convex runtime already has fetch. With no key
// configured the code goes to the deployment log instead, so the flow can be
// walked end to end on a local deployment without signing up for anything.
// The code is never returned to the browser — a reset code on screen is a
// reset available to anyone who can reach the form.

import type { EmailConfig } from "@convex-dev/auth/server";
import type { ActionCtx } from "./_generated/server";
// Spelled with the extension, unlike the rest of convex/, so that plain Node
// can load this module too — src/utils/passwordReset.test.ts exercises the
// send path, which no deployment without a mail key ever reaches.
import { internal } from "./_generated/api.js";

/** How long a code is good for. Long enough to go and find the email, short
 *  enough that one left sitting in an inbox is not a spare key. */
const CODE_TTL_S = 15 * 60;

/** Sends allowed per address per window. The limit is not there to stop the
 *  person who owns the mailbox — they get a few honest retries — but the one
 *  who does not, and would otherwise use this form to bury someone under mail
 *  we pay to send. */
const MAX_SENDS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Eight digits, uniformly.
 *
 * Eight rather than six because a code short enough to guess is the weakest
 * link in a flow that ends in "set any password you like". Convex Auth caps
 * failed verifications at ten an hour per address on top of this, so the two
 * together leave nothing worth attacking.
 */
function resetCode(length = 8): string {
  let code = "";
  while (code.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // 250 is the largest multiple of 10 below 256. Anything above it would
      // make the digits 0–5 fractionally likelier than 6–9, so it is thrown
      // back rather than folded in.
      if (b < 250 && code.length < length) code += (b % 10).toString();
    }
  }
  return code;
}

/** Grouped for the eye, so the digits can be read off a phone without losing
 *  the place. The form strips whatever spacing the user types back out. */
function grouped(code: string): string {
  return `${code.slice(0, 4)} ${code.slice(4)}`;
}

/** Which counter this address spends from. Hashed for the same reason the IP
 *  in `rateLimits` is: nothing downstream needs to read it back, and a table
 *  of addresses is a table worth stealing. Salted with the secret the
 *  deployment already has, so the hashes are not a dictionary away. */
async function counterKey(email: string): Promise<string> {
  const salt = process.env.RATE_LIMIT_SECRET ?? "braindot";
  const bytes = new TextEncoder().encode(`${salt}:${email.trim().toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function plainText(email: string, code: string): string {
  return [
    `Someone asked to reset the braindot password for ${email}.`,
    "",
    `Your code is ${grouped(code)}`,
    "",
    "It works once, and it expires in 15 minutes.",
    "",
    "If this was not you, nothing has happened yet and nothing will — your",
    "password only changes once this code is used. You can ignore this email.",
  ].join("\n");
}

function html(email: string, code: string): string {
  // Inline styles and a table-free layout: mail clients strip <style> blocks
  // and disagree about everything else.
  return `<div style="font-family:ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1b1b20;max-width:460px;margin:0 auto;padding:28px 4px">
  <p style="margin:0 0 20px">Someone asked to reset the braindot password for <strong>${escapeHtml(email)}</strong>.</p>
  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b6b76">Your code</p>
  <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:0.14em;color:#4b3fd6">${grouped(code)}</p>
  <p style="margin:0 0 20px">It works once, and it expires in 15 minutes.</p>
  <p style="margin:0;color:#6b6b76;font-size:13.5px">If this was not you, nothing has happened yet and nothing will — your password only changes once this code is used. You can ignore this email.</p>
</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;"
      : c === "<" ? "&lt;"
        : c === ">" ? "&gt;"
          : c === '"' ? "&quot;"
            : "&#39;",
  );
}

/**
 * Send the code, or explain in the log why nobody could.
 *
 * Throwing here fails the whole `signIn` call, which is what we want: a form
 * that says "check your email" after the send failed is a form that sends the
 * user to wait for something that is never coming.
 */
async function sendResetCode(
  { identifier: email, token }: { identifier: string; token: string },
  ctx: ActionCtx,
): Promise<void> {
  const verdict = await ctx.runMutation(internal.rateLimit.spend, {
    key: `pw-reset:${await counterKey(email)}`,
    limit: MAX_SENDS,
    windowMs: SEND_WINDOW_MS,
  });
  if (!verdict.ok) {
    throw new Error("TooManyResetRequests");
  }

  const apiKey = process.env.AUTH_RESEND_KEY;
  const from = process.env.AUTH_EMAIL_FROM ?? "braindot <onboarding@resend.dev>";

  if (!apiKey) {
    // Not an error: a deployment without a mail key is a developer's, and the
    // log is the inbox. Production sets AUTH_RESEND_KEY and never lands here.
    console.warn(
      `[passwordReset] AUTH_RESEND_KEY is not set on this deployment, so no ` +
        `email was sent. The code for ${email} is ${grouped(token)} and it ` +
        `expires in ${CODE_TTL_S / 60} minutes. Set the key with ` +
        `\`npx convex env set AUTH_RESEND_KEY re_...\` to send it for real.`,
    );
    return;
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your braindot reset code",
      text: plainText(email, token),
      html: html(email, token),
    }),
  });

  if (!response.ok) {
    // The body carries Resend's reason — an unverified sending domain, a key
    // from the wrong project. Worth logging in full; worth telling the browser
    // nothing beyond "it did not send".
    const detail = await response.text().catch(() => "");
    console.error(
      `[passwordReset] Resend refused the send (${response.status}): ${detail}`,
    );
    throw new Error("ResetEmailFailed");
  }
}

/**
 * The email provider the Password provider resets through.
 *
 * Written out rather than built with the `Email` helper because the helper
 * pins the id and drops `generateVerificationToken`, and this needs both: an
 * id of its own so the code cannot be redeemed against some other flow, and a
 * code a person can retype.
 */
export const PasswordReset: EmailConfig = {
  id: "password-reset",
  type: "email",
  name: "Braindot password reset",
  from: process.env.AUTH_EMAIL_FROM ?? "braindot <onboarding@resend.dev>",
  maxAge: CODE_TTL_S,
  apiKey: process.env.AUTH_RESEND_KEY,
  generateVerificationToken: async () => resetCode(),

  /**
   * A code this short is only safe alongside the address it was sent to:
   * without this check a code that landed in one inbox could be spent against
   * whichever account the caller named.
   */
  authorize: async (params, account) => {
    if (typeof params.email !== "string") {
      throw new Error("Password reset requires an `email` alongside the code.");
    }
    if (account.providerAccountId !== params.email) {
      throw new Error("This code was issued for a different account.");
    }
  },

  // The runtime hands the action ctx as a second argument that Auth.js's own
  // type does not know about — the library suppresses the same mismatch with
  // a ts-expect-error at the call site, for exactly this reason.
  sendVerificationRequest: sendResetCode as unknown as EmailConfig["sendVerificationRequest"],
};
