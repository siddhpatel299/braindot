# Deploying Braindot to Vercel

The app is a Next.js frontend + a Convex backend (database, auth, live sync).
Both deploy together: Vercel hosts the site, and during Vercel's build the
Convex functions/schema are pushed to your Convex deployment.

---

## Current status

**Done:**
- ✅ Production Convex deployed — schema + functions live on `aware-grouse-813`.
- ✅ Auth configured on production (JWT_PRIVATE_KEY, JWKS, SITE_URL set).
- ✅ Repo pushed: https://github.com/siddhpatel299/braindot (private).
- ✅ `vercel.json` build command deploys Convex + Next together.

**What's left — just the Vercel project (steps 4–5 below):**
1. Import the repo at vercel.com.
2. Add env vars: `CONVEX_DEPLOY_KEY` (prod key), `OPENAI_API_KEY`, `OPENAI_MODEL`.
3. Deploy, then set `SITE_URL` on Convex prod to the real Vercel URL.

The dev environment still uses a _preview_ key in `.env.local` (ephemeral,
separate from production).

---

## One-time setup

### 1–3. Production Convex + repo — ✅ DONE

Already completed:
- Production deploy key generated and used to deploy schema + functions.
- Auth env vars (JWT_PRIVATE_KEY, JWKS, SITE_URL) set on production.
- Repo pushed to https://github.com/siddhpatel299/braindot.

Keep your `prod:...` deploy key handy — you'll paste it into Vercel below.

### 4. Create the Vercel project

1. [vercel.com](https://vercel.com) → **Add New → Project** → import the repo.
2. Framework preset: **Next.js** (auto-detected). Leave the build command
   alone — `vercel.json` already sets it to deploy Convex + Next together.
3. Add **Environment Variables** (Settings → Environment Variables):

   | Name                 | Value                                  |
   |----------------------|----------------------------------------|
   | `CONVEX_DEPLOY_KEY`  | your `prod:...` key from step 1         |
   | `OPENAI_API_KEY`     | your real `sk-...` key (or omit for now)|
   | `OPENAI_MODEL`       | `gpt-4o-mini` (optional)               |

   Do **not** set `NEXT_PUBLIC_CONVEX_URL` — the Convex deploy injects it.

4. **Deploy.** Vercel runs `convex deploy` (pushing your backend to
   production) and builds the site with the right Convex URL baked in.

### 5. Finalize the auth URL

After the first deploy you'll have a real URL (e.g. `https://braindot.vercel.app`).
Set it as `SITE_URL` on the production Convex deployment (step 2, last command)
and redeploy on Vercel. Auth callbacks now point at the live site.

---

## How updates work after setup

Push to `main` → Vercel rebuilds → `convex deploy` pushes any backend changes
and redeploys the frontend. One `git push` ships everything.

## Local development

`.env.local` holds your dev config (preview Convex URL + `OPENAI_API_KEY`).
`bun run dev` runs the site against the dev deployment. To push backend
changes to the dev deployment: `bun run convex:deploy`.

## Notes

- `OPENAI_API_KEY=mock` streams a canned demo response so AI features work
  without a real key. Replace with `sk-...` for real answers.
- The production deployment is separate from dev — its data, users, and env
  vars are independent.
