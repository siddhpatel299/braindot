import type { NextConfig } from "next";

/**
 * Response headers, everywhere.
 *
 * This app renders markdown a person wrote into HTML and hands it to
 * dangerouslySetInnerHTML — in the editor's preview, in the reader, and on
 * /p/<slug>, which is public and needs no account. The renderer escapes what
 * it is given (utils/markdownHtml.ts, and the checks in markdownHtml.test.ts),
 * so these are the second line rather than the first: what should hold if a
 * single escape is ever missed.
 *
 * No script-src. Restricting scripts properly means a nonce on every inline
 * script, including the theme script in layout.tsx and the ones Next emits for
 * hydration, which is a middleware change and not something to ship untested.
 * The four directives below need no nonce and cost nothing:
 *
 *   frame-ancestors  nothing may frame this app; there are no iframes in it
 *   object-src       no <object>/<embed>, which are script by another name
 *   base-uri         a stray <base href> cannot re-point every relative URL
 *   form-action      a planted form cannot post the page's contents elsewhere
 */
const CSP = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  // A response typed text/plain stays text/plain. The AI routes stream as
  // text/plain and echo the caller's own words back, so sniffing one into
  // HTML is exactly the trick this closes.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Belt to the frame-ancestors braces, for anything that predates CSP.
  { key: 'X-Frame-Options', value: 'DENY' },
  // A published note's URL is a credential — it is unguessable, and that is
  // the whole of its protection. Without this, following any link out of a
  // published page would hand the destination that URL in the Referer header.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const nextConfig: NextConfig = {
  // Type errors fail the build again. They were ignored here, and behind that
  // the tree had drifted to 19 of them — including four files importing types
  // that no longer existed, which the build shipped without a word.
  reactStrictMode: false,

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
