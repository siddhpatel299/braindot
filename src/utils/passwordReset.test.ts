/**
 * Checks for the password-reset email provider.
 *
 * Run with:  npm run check:reset
 * Node 22 strips the types, so this needs no test runner and no dependency.
 *
 * Convex Auth owns the flow around this provider — minting the code, redeeming
 * it, rewriting the password — and that part is exercised by using the app.
 * What is left is the piece between: the code itself, the check that binds a
 * code to the address it was sent to, and the send. The send is the awkward
 * one, because on any deployment without a mail key it never runs at all, so
 * it is driven here with a stubbed fetch instead.
 */

import { PasswordReset } from '../../convex/passwordReset.ts';

let passed = 0;
const failures: string[] = [];

function check(what: string, ok: boolean, detail = '') {
  if (ok) { passed++; return; }
  failures.push(detail ? `${what} — ${detail}` : what);
}

async function throws(what: string, run: () => Promise<unknown>, expected: string) {
  try {
    await run();
    failures.push(`${what} — resolved instead of throwing ${expected}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(what, msg.includes(expected), `threw "${msg}", wanted ${expected}`);
  }
}

/* ============================================================
   The code
   ============================================================ */

const mint = PasswordReset.generateVerificationToken!;
const codes: string[] = [];
for (let i = 0; i < 400; i++) codes.push(await mint());

check('every code is eight characters', codes.every((c) => c.length === 8));
check('every code is digits only', codes.every((c) => /^[0-9]{8}$/.test(c)));
check(
  'the rejection sampling still reaches every digit',
  new Set(codes.join('')).size === 10,
  `saw ${[...new Set(codes.join(''))].sort().join('')}`,
);
check(
  'codes are not repeating',
  new Set(codes).size > 395,
  `${codes.length - new Set(codes).size} collisions in ${codes.length}`,
);

/* ============================================================
   The code is only good for the address it went to

   Eight digits is small enough that without this check a code that landed in
   one inbox could be spent against whichever account the caller named.
   ============================================================ */

const authorize = PasswordReset.authorize!;
const account = { providerAccountId: 'reader@example.com' } as never;

await authorize({ email: 'reader@example.com', code: '12345678' }, account);
passed++;

await throws(
  'a code redeemed against another account is refused',
  () => authorize({ email: 'someone-else@example.com', code: '12345678' }, account),
  'different account',
);
await throws(
  'a code redeemed with no address at all is refused',
  () => authorize({ code: '12345678' }, account),
  'requires an `email`',
);

/* ============================================================
   The send
   ============================================================ */

type SendParams = { identifier: string; token: string };
type FakeCtx = { runMutation: (ref: unknown, args: unknown) => Promise<{ ok: boolean }> };
const send = PasswordReset.sendVerificationRequest as unknown as (
  params: SendParams,
  ctx: FakeCtx,
) => Promise<void>;

const allowed: FakeCtx = { runMutation: async () => ({ ok: true }) };
const overQuota: FakeCtx = { runMutation: async () => ({ ok: false }) };

/** Run `body` with the console and fetch replaced, and hand back what they saw. */
async function record(body: () => Promise<void>, response?: Response) {
  const logs: string[] = [];
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const realWarn = console.warn;
  const realError = console.error;
  const realFetch = globalThis.fetch;
  console.warn = (...args: unknown[]) => { logs.push(args.join(' ')); };
  console.error = (...args: unknown[]) => { logs.push(args.join(' ')); };
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response ?? new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  try {
    await body();
  } finally {
    console.warn = realWarn;
    console.error = realError;
    globalThis.fetch = realFetch;
  }
  return { logs: logs.join('\n'), calls };
}

/* --- No mail key: the code goes to the log, and nowhere near the browser --- */

delete process.env.AUTH_RESEND_KEY;
const noKey = await record(() => send({ identifier: 'reader@example.com', token: '13572468' }, allowed));

check('without a key, nothing is sent over the wire', noKey.calls.length === 0);
check(
  'without a key, the code is written to the deployment log',
  noKey.logs.includes('1357 2468') && noKey.logs.includes('reader@example.com'),
  noKey.logs.slice(0, 160),
);
check(
  'the log says how to make it send for real',
  noKey.logs.includes('AUTH_RESEND_KEY'),
);

/* --- Over quota: refused before anything is sent --- */

process.env.AUTH_RESEND_KEY = 're_test_key';
const throttled = await record(async () => {
  await throws(
    'an address over its send quota is refused',
    () => send({ identifier: 'reader@example.com', token: '13572468' }, overQuota),
    'TooManyResetRequests',
  );
});
check('an address over its quota is never mailed', throttled.calls.length === 0);

/* --- With a key: one POST to Resend, carrying the code --- */

const sent = await record(() => send({ identifier: 'reader@example.com', token: '13572468' }, allowed));
check('a configured deployment sends exactly one email', sent.calls.length === 1);

const [call] = sent.calls;
if (call) {
  check('it goes to Resend', call.url === 'https://api.resend.com/emails', call.url);
  const headers = call.init.headers as Record<string, string>;
  check('it carries the key as a bearer token', headers.Authorization === 'Bearer re_test_key');
  const body = JSON.parse(String(call.init.body));
  check('it is addressed to the person who asked', JSON.stringify(body.to) === '["reader@example.com"]');
  check('it has a from address', typeof body.from === 'string' && body.from.length > 0);
  check('the subject names the app', /braindot/i.test(body.subject), body.subject);
  check('the plain text carries the code', body.text.includes('1357 2468'));
  check('the html carries the code', body.html.includes('1357 2468'));
  check(
    'it says how long the code lasts',
    body.text.includes('15 minutes') && body.html.includes('15 minutes'),
  );
  check(
    'it tells a bystander that nothing has happened yet',
    /nothing has happened/i.test(body.text),
  );
}

/* --- An address is not a place to put markup --- */

const nasty = await record(() =>
  send({ identifier: 'a"><script>alert(1)</script>@example.com', token: '13572468' }, allowed),
);
const nastyBody = JSON.parse(String(nasty.calls[0].init.body));
check(
  'an address with markup in it is escaped into the html',
  !nastyBody.html.includes('<script>') && nastyBody.html.includes('&lt;script&gt;'),
);

/* --- Resend said no: loud, and specific in the log --- */

const refused = await record(async () => {
  await throws(
    'a refused send is reported as a failure',
    () => send({ identifier: 'reader@example.com', token: '13572468' }, allowed),
    'ResetEmailFailed',
  );
}, new Response('{"message":"domain is not verified"}', { status: 403 }));
check(
  'the reason Resend gave is kept in the log',
  refused.logs.includes('domain is not verified'),
  refused.logs.slice(0, 160),
);
check(
  'the code is not in the failure log line',
  !refused.logs.includes('1357 2468'),
);

delete process.env.AUTH_RESEND_KEY;

/* ============================================================
   Result
   ============================================================ */

if (failures.length > 0) {
  console.error(`\nPassword reset checks: ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log(`Password reset checks: all ${passed} passed.`);
