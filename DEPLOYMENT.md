# Deploying Braindot to Vercel

The app is a Next.js frontend + a Convex backend (database, auth, live sync).
Both deploy together: Vercel hosts the site, and during Vercel's build the
Convex functions/schema are pushed to your Convex deployment.

---

## Current status

- **Convex works.** Schema, functions, auth, and live sync are all verified.
- **BUT the key in `.env.local` is a _preview_ key.** Convex preview
  deployments are ephemeral — they get auto-deleted and change URLs (this
  already happened once: `determined-starling-161` → `merry-beagle-541`).
  They are for CI branch previews, **not** for a hosted app.
- **For hosting you need a _production_ Convex deploy key** (one-time, from the
  dashboard). Everything else is ready.

---

## One-time setup

### 1. Get a production Convex deploy key

1. Open the Convex dashboard → **braindot** project → your **production**
   deployment (the dashboard showed `aware-grouse-813`).
2. **Settings → Deploy Keys → Generate Production Deploy Key**.
3. Copy it — it looks like `prod:...|...`.

### 2. Configure auth on the production deployment

Convex Auth needs three env vars on the **production** deployment. Run these
locally with your production key (replace `prod:...` with the real key):

```bash
# One-off: generate a JWT keypair
node -e "const {exportJWK,exportPKCS8,generateKeyPair}=require('jose');(async()=>{const k=await generateKeyPair('RS256',{extractable:true});const pk=await exportPKCS8(k.privateKey);const jwk=await exportJWK(k.publicKey);require('fs').writeFileSync('jwt.txt',pk.trim().replace(/\n/g,' '));require('fs').writeFileSync('jwks.txt',JSON.stringify({keys:[{use:'sig',...jwk}]}));console.log('ok')})()"

# Set them on production (uses CONVEX_DEPLOY_KEY from the env)
CONVEX_DEPLOY_KEY="prod:..." npx convex env set --prod JWT_PRIVATE_KEY -- "$(cat jwt.txt)"
CONVEX_DEPLOY_KEY="prod:..." npx convex env set --prod JWKS -- "$(cat jwks.txt)"
# SITE_URL must be your final Vercel URL (set after the first deploy, then redeploy)
CONVEX_DEPLOY_KEY="prod:..." npx convex env set --prod SITE_URL https://YOUR-APP.vercel.app

rm jwt.txt jwks.txt
```

### 3. Push the repo to GitHub (for Vercel's git integration)

There's no git remote yet. Create an empty GitHub repo, then:

```bash
git add -A
git commit -m "Prepare for Vercel deploy"
git remote add origin https://github.com/<you>/braindot.git
git push -u origin main
```

(`.env.local` is gitignored — your secrets are never committed.)

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
