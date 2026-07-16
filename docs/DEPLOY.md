# Deploy AlphaWolf

Backend deploys to Google Cloud Run. Frontend deploys automatically through the Cloudflare Pages Git pipeline.

## One-time setup

Install CLIs and authenticate:

```sh
gcloud auth login
gcloud auth configure-docker asia-northeast1-docker.pkg.dev
```

Set deploy variables:

```sh
export GCP_PROJECT="alpha-wolf-501716"
export GCP_REGION="asia-northeast1"
export CLOUD_RUN_SERVICE="alpha-wolf-api"
export ARTIFACT_REPOSITORY="alpha-wolf-be"
```

Create `.env.production` from the example and fill the real secrets:

```sh
cp .env.production.example .env.production
```

Cloud Run env vars are built from `.env.production`. Do not commit that file.

Set a long random `TELEMETRY_ADMIN_TOKEN` in `.env.production` to enable the
private aggregate operational-metrics endpoint. This is server-only and must
never be added to Cloudflare or any `VITE_*` variable.

## Cloudflare Pages

Cloudflare should build the frontend from git after each commit/push.

Do not use Wrangler for the frontend deploy. This repo is an Nx workspace, and Wrangler's app detection can fail when it scans the workspace root.

Use these Pages settings:

```txt
Framework preset: None
Root directory: apps/web
Build command: npm run build
Build output directory: dist
```

Set this Cloudflare Pages Function environment variable:

```txt
API_ORIGIN=https://YOUR-CLOUD-RUN-URL.a.run.app
```

Browser builds deliberately call same-origin `/api`; `apps/web/functions/api/[[path]].js`
proxies those requests to `API_ORIGIN`. This keeps the HttpOnly session cookie
first-party for Safari. Do not set `VITE_API_BASE` for the browser deployment; that
variable is reserved for packaged Capacitor builds, which have no Pages Function.

The frontend build uses the standalone `apps/web/package.json`, so Cloudflare never scans the Nx workspace root.

## Backend Deploy

```sh
./scripts/deploy.sh
```

Compatibility aliases:

```sh
./scripts/deploy-all.sh
./scripts/deploy-backend-cloudrun.sh
```

The scripts stop on a dirty worktree by default. To deploy a local work-in-progress:

```sh
ALLOW_DIRTY=1 ./scripts/deploy-all.sh
```

The production defaults deliberately co-locate Cloud Run in Tokyo (`asia-northeast1`)
with the Turso `nrt` database, keep one instance warm, allow eight concurrent requests,
and leave CPU available after a response so stale Yahoo cache refreshes can finish.

After the first Tokyo deploy, update Cloudflare's production `API_ORIGIN` to the
new URL printed by the deploy script (without adding `/api`), then trigger a frontend
deployment. Keep the Jakarta service for rollback until the live Worker has been checked.

Current Tokyo service URL:

```txt
https://alpha-wolf-api-6r4m3zptwq-an.a.run.app
```
