/**
 * Checks for the URL guard in front of the article reader.
 *
 * Run with:  npm run check:ssrf
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * The reader fetches an address the caller supplies, so the guard is the only
 * thing standing between a text box on the page and the machine's own network.
 * Every case below is an address that used to get through.
 */

import { isPubliclyFetchable, guardedFetch } from './urlGuard.ts';

let passed = 0;
const failures: string[] = [];

function refuses(url: string, why: string) {
  const r = isPubliclyFetchable(url);
  if (!r.ok) { passed++; return; }
  failures.push(`${why} — ${url} was allowed`);
}

function allows(url: string, why: string) {
  const r = isPubliclyFetchable(url);
  if (r.ok) { passed++; return; }
  failures.push(`${why} — ${url} was refused with "${r.reason}"`);
}

/* ============================================================
   Not a web address at all
   ============================================================ */

refuses('file:///etc/passwd', 'a file:// URL reads the disk');
refuses('gopher://example.com/', 'only http and https are fetchable');
refuses('not a url', 'unparseable input');

/* ============================================================
   IPv4 — the ranges that reach a local network
   ============================================================ */

refuses('http://127.0.0.1/', 'loopback');
refuses('http://10.1.2.3/', 'private 10/8');
refuses('http://192.168.1.1/', 'private 192.168/16');
refuses('http://172.16.0.1/', 'private 172.16/12, low end');
refuses('http://172.31.255.254/', 'private 172.16/12, high end');
refuses('http://169.254.169.254/latest/meta-data/', 'cloud metadata');
refuses('http://0.0.0.0/', '"this network"');

// Not aligned to a dot, so a /^prefix\./ test cannot express them.
refuses('http://100.64.0.1/', 'carrier-grade NAT 100.64/10');
refuses('http://100.127.255.255/', 'carrier-grade NAT, high end');
refuses('http://198.18.0.1/', 'benchmarking range');
refuses('http://192.0.0.1/', 'IETF protocol assignments');
refuses('http://239.255.255.250/', 'multicast');
refuses('http://255.255.255.255/', 'reserved');

// The URL parser folds every spelling of an address down to a dotted quad
// before the guard sees it. Worth pinning so a future rewrite cannot regress
// into matching on the raw string.
refuses('http://2130706433/', 'loopback written as a decimal integer');
refuses('http://0x7f000001/', 'loopback written in hex');
refuses('http://0177.0.0.1/', 'loopback written in octal');
refuses('http://127.1/', 'loopback written short');

/* ============================================================
   IPv6 — the old guard knew only the literal ::1
   ============================================================ */

refuses('http://[::1]/', 'loopback');
refuses('http://[::]/', 'unspecified address');
refuses('http://[fd00::1]/', 'unique local fc00::/7');
refuses('http://[fc00::1]/', 'unique local, low end');
refuses('http://[fe80::1]/', 'link-local fe80::/10');
refuses('http://[::ffff:127.0.0.1]/', 'IPv4-mapped loopback, dotted form');
refuses('http://[::ffff:7f00:1]/', 'IPv4-mapped loopback, the form Node prints');
refuses('http://[::ffff:169.254.169.254]/', 'IPv4-mapped cloud metadata');

/* ============================================================
   Names that resolve somewhere local
   ============================================================ */

refuses('http://localhost/', 'localhost');
refuses('http://localhost:3000/admin', 'localhost on another port');
refuses('http://db.internal/', '.internal');
refuses('http://printer.local/', '.local mDNS');
refuses('http://foo.localhost/', '.localhost subdomain');

/* ============================================================
   Ordinary public addresses must still be readable
   ============================================================ */

allows('https://example.com/article', 'a plain https page');
allows('http://example.com/article', 'plain http is allowed too');
allows('https://www.theguardian.com/world/rss', 'a feed the app ships with');
allows('https://172.32.0.1/', '172.32 is outside 172.16/12 and public');
allows('https://100.128.0.1/', '100.128 is outside 100.64/10 and public');
allows('https://8.8.8.8/', 'a public address literal');
allows('https://[2606:4700::1]/', 'a public IPv6 literal');


/* ============================================================
   Redirects — every hop is judged, not just the first

   This is what the guard was actually missing: the address the caller typed
   was checked, then `redirect: 'follow'` went wherever the reply pointed.
   fetch is stubbed so the chain is exercised without touching the network.
   ============================================================ */

const realFetch = globalThis.fetch;

/** Replies with a 302 to `to`, then 200 for anything else. */
function stubRedirect(to: string) {
  const visited: string[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    visited.push(url);
    if (visited.length === 1) {
      return new Response(null, { status: 302, headers: { location: to } });
    }
    return new Response('<html><body>ok</body></html>', { status: 200 });
  }) as typeof fetch;
  return visited;
}

async function redirectIsRefused(to: string, why: string) {
  const visited = stubRedirect(to);
  try {
    const r = await guardedFetch(new URL('https://example.com/a'), new AbortController().signal);
    if (r.ok) {
      failures.push(`${why} — followed the redirect to ${to}`);
      return;
    }
    if (visited.length > 1) {
      failures.push(`${why} — refused, but only after fetching ${visited[1]}`);
      return;
    }
    passed++;
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function redirectIsFollowed(to: string, why: string) {
  const visited = stubRedirect(to);
  try {
    const r = await guardedFetch(new URL('https://example.com/a'), new AbortController().signal);
    if (r.ok && visited.length === 2 && visited[1] === to) { passed++; return; }
    failures.push(`${why} — expected a hop to ${to}, saw ${JSON.stringify(visited)}`);
  } finally {
    globalThis.fetch = realFetch;
  }
}

await redirectIsRefused('http://169.254.169.254/latest/meta-data/', 'redirect to cloud metadata');
await redirectIsRefused('http://127.0.0.1:3000/', 'redirect to loopback');
await redirectIsRefused('http://10.0.0.5/admin', 'redirect to a private 10/8 host');
await redirectIsRefused('http://[fd00::1]/', 'redirect to a unique-local IPv6 host');
await redirectIsRefused('file:///etc/passwd', 'redirect to a file:// URL');
await redirectIsFollowed('https://example.org/moved', 'an ordinary redirect between public pages');

// A loop must end, rather than spinning until the request times out.
{
  globalThis.fetch = (async () =>
    new Response(null, { status: 302, headers: { location: 'https://example.com/again' } })) as typeof fetch;
  const r = await guardedFetch(new URL('https://example.com/a'), new AbortController().signal);
  globalThis.fetch = realFetch;
  if (!r.ok && /too many times/.test(r.reason)) passed++;
  else failures.push('a redirect loop should stop after MAX_REDIRECTS');
}

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nURL guard checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`URL guard checks: all ${passed} passed.`);
