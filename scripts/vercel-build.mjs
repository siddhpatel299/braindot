/**
 * The build command Vercel runs.
 *
 * It used to be `npx convex deploy --cmd 'next build' …` hard-coded in
 * vercel.json, which meant every build without a Convex deploy key died on
 * its first step — before `next build` was ever invoked. On this project that
 * is every preview and every branch build, so a branch deploy always came
 * back red for a reason that had nothing to do with the code in it, and the
 * log never showed a compiler error because the compiler never ran.
 *
 * So: deploy Convex when there is a key to deploy with, and otherwise just
 * build. A preview without Convex is not broken — src/lib/convex.tsx already
 * treats a missing NEXT_PUBLIC_CONVEX_URL as "backend disabled" and renders
 * the app without a provider, so /landing, /demo and every static surface
 * work. Sign-in and sync do not, which is the honest trade for a preview.
 */
import { spawnSync } from 'node:child_process';

const CLOUD = Boolean(process.env.CONVEX_DEPLOY_KEY);
const SELF_HOSTED = Boolean(
  process.env.CONVEX_SELF_HOSTED_URL && process.env.CONVEX_SELF_HOSTED_ADMIN_KEY,
);

function run(args) {
  console.log(`\n$ npx ${args.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}\n`);
  // `--cmd` carries "next build": one argument with a space in it. A shell
  // re-joins argv into a string and splits it again on whitespace, which turns
  // that into `--cmd next` plus a stray positional `build` — so on any shell
  // path the argument has to be quoted back up.
  //
  // Vercel builds on Linux, where argv goes straight through and no shell is
  // involved. Windows is local-only and needs one either way: since Node 22,
  // spawning a .cmd shim without a shell fails outright with EINVAL.
  const win = process.platform === 'win32';
  const r = spawnSync(
    win ? 'npx.cmd' : 'npx',
    win ? args.map((a) => (a.includes(' ') ? `"${a}"` : a)) : args,
    { stdio: 'inherit', shell: win, env: process.env },
  );
  if (r.error) {
    console.error(r.error);
    process.exit(1);
  }
  process.exitCode = r.status ?? 1;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (CLOUD || SELF_HOSTED) {
  console.log(
    `[build] Convex credentials found (${CLOUD ? 'CONVEX_DEPLOY_KEY' : 'self-hosted'}). ` +
      'Deploying functions and injecting NEXT_PUBLIC_CONVEX_URL into the build.',
  );
  run(['convex', 'deploy', '--cmd', 'next build', '--cmd-url-env-var-name', 'NEXT_PUBLIC_CONVEX_URL']);
} else {
  console.log(
    '[build] No Convex credentials in this environment, so the Convex deploy step is skipped.\n' +
      '[build] Building the frontend only. The app will run with its backend disabled unless\n' +
      '[build] NEXT_PUBLIC_CONVEX_URL is already set here — /landing and /demo work either way,\n' +
      '[build] sign-in and sync do not.\n' +
      '[build] To deploy Convex from this environment, set CONVEX_DEPLOY_KEY (Convex Cloud) or\n' +
      '[build] CONVEX_SELF_HOSTED_URL + CONVEX_SELF_HOSTED_ADMIN_KEY in the Vercel project.',
  );
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    console.log('[build] NEXT_PUBLIC_CONVEX_URL is also unset — the backend will be off in this deployment.');
  }
  run(['next', 'build']);
}
