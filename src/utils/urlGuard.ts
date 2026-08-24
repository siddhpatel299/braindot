// Braindot — deciding whether a URL may be fetched from the server.
//
// Lives apart from the reader because it is the one piece with a security
// consequence, and because a module with no path-alias imports can be run
// directly by Node for its checks (npm run check:ssrf).

import { lookup } from 'node:dns';
import { promisify } from 'node:util';

const dnsLookup = promisify(lookup) as (
  host: string,
  opts: { all: true; verbatim: boolean },
) => Promise<{ address: string; family: number }[]>;

/** Hops followed before giving up. Each one is re-checked against the guard. */
export const MAX_REDIRECTS = 5;

/**
 * Every IPv4 range that must never be reached from here.
 *
 * Judged on parsed octets rather than string prefixes, so the ranges that do
 * not align to a dot land correctly — 172.16/12 and 100.64/10 in particular,
 * where /^172\./ was both too wide (172.32 is public) and /^100\./ absent.
 * The many ways of spelling an address are not this function's problem: the
 * WHATWG URL parser has already folded 2130706433, 0x7f000001 and 127.1 down
 * to 127.0.0.1 by the time a hostname reaches here.
 */
function isBlockedIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c] = m.slice(1, 4).map(Number);
  return (
    a === 0 ||                              // 0.0.0.0/8 — "this network"
    a === 10 ||                             // private
    a === 127 ||                            // loopback
    (a === 100 && b >= 64 && b <= 127) ||   // 100.64/10 carrier-grade NAT
    (a === 169 && b === 254) ||             // link-local, and cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||    // private
    (a === 192 && b === 0 && c === 0) ||    // IETF protocol assignments
    (a === 192 && b === 168) ||             // private
    (a === 198 && (b === 18 || b === 19)) ||// benchmarking
    a >= 224                                // multicast 224/4 + reserved 240/4
  );
}

/**
 * The same for IPv6, which the old check knew only as the literal "::1".
 *
 * fd00::1 and fe80::1 both reach a local network and both used to pass, and an
 * IPv4-mapped address is written by Node as ::ffff:7f00:1 rather than
 * ::ffff:127.0.0.1, so the embedded address is rebuilt before it is judged.
 */
function isBlockedIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true;

  const dotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (dotted) return isBlockedIpv4(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isBlockedIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.'));
  }

  const head = parseInt(h.split(':')[0] || '0', 16);
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7  unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  return false;
}

/**
 * Refuse anything that is not a public web page, judged on the URL alone.
 *
 * This fetches a URL the caller supplies, so without this it would happily
 * read the machine's own network on request — cloud metadata services and
 * internal hosts included. Cheap and synchronous, so a route can answer 400
 * before any network work happens; resolvesToPublicHost is the other half.
 */
export function isPubliclyFetchable(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'That does not look like a web address.' }; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https addresses can be read.' };
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.internal') || host.endsWith('.local') ||
    isBlockedIpv4(host) || isBlockedIpv6(host);
  if (blocked) return { ok: false, reason: 'That address is on a private network.' };
  return { ok: true, url };
}

/**
 * Resolve the hostname and refuse it if any address it answers with is private.
 *
 * A name the blocklist cannot judge — not-suspicious.example.com — is free to
 * resolve to 169.254.169.254, so the name check alone never proved anything.
 *
 * This narrows that to a race rather than an open door: the address is checked
 * here and resolved again by fetch a moment later, and a record with a one
 * second TTL can differ between the two. Closing it entirely means pinning the
 * connection to the address that was checked, which needs a custom dispatcher.
 */
export async function resolvesToPublicHost(url: URL): Promise<{ ok: true } | { ok: false; reason: string }> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // An address literal was already judged in full by isPubliclyFetchable.
  if (/^[\d.]+$/.test(host) || host.includes(':')) return { ok: true };

  let addresses: { address: string }[];
  try {
    addresses = await dnsLookup(host, { all: true, verbatim: true });
  } catch {
    return { ok: false, reason: 'That address could not be looked up.' };
  }
  if (!addresses.length) return { ok: false, reason: 'That address could not be looked up.' };
  for (const { address } of addresses) {
    if (isBlockedIpv4(address) || isBlockedIpv6(address)) {
      return { ok: false, reason: 'That address is on a private network.' };
    }
  }
  return { ok: true };
}

/**
 * Fetch, following redirects by hand so every hop is checked.
 *
 * redirect: 'follow' checked only the URL the caller typed, which made the
 * guard advisory: any public page was free to answer 302 with a Location of
 * http://169.254.169.254/ and be followed there without a further word.
 */
export async function guardedFetch(
  start: URL,
  signal: AbortSignal,
  headers: Record<string, string> = {},
): Promise<{ ok: true; res: Response; url: URL } | { ok: false; reason: string }> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const shape = isPubliclyFetchable(url.toString());
    if (!shape.ok) return shape;
    const resolved = await resolvesToPublicHost(url);
    if (!resolved.ok) return resolved;

    const res = await fetch(url, {
      signal,
      redirect: 'manual',
      headers,
    });

    if (res.status < 300 || res.status >= 400) return { ok: true, res, url };

    const location = res.headers.get('location');
    if (!location) return { ok: false, reason: 'The site redirected without saying where to.' };
    try {
      url = new URL(location, url);
    } catch {
      return { ok: false, reason: 'The site redirected to an address that could not be read.' };
    }
  }
  return { ok: false, reason: 'That address redirected too many times.' };
}
