# Deploy AlphaWolf

Backend deploys to Google Cloud Run. Frontend deploys automatically through the Cloudflare Workers Git pipeline.

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

## Cloudflare Workers

Cloudflare should build and deploy the frontend Worker from git after each commit/push.

Run the frontend commands from `apps/web` so Wrangler reads the colocated config:

```txt
Framework preset: None
Root directory: apps/web
Build command: npm run build
Deploy command: npx wrangler deploy
```

The production Cloud Run origin is versioned in `apps/web/wrangler.json` as the
non-secret `API_ORIGIN` Worker variable:

```txt
API_ORIGIN=https://alpha-wolf-api-6r4m3zptwq-an.a.run.app
```

Browser builds deliberately call same-origin `/api`; `apps/web/worker.js` proxies
those requests to `API_ORIGIN` before the static asset fallback runs. This keeps the
HttpOnly session cookie first-party for Safari. Do not set `VITE_API_BASE` for browser
requests; that variable is reserved for packaged Capacitor builds, which have no edge proxy.

The Worker intentionally returns 503 when `API_ORIGIN` is absent instead of silently
falling back to a URL embedded in application code. When the Cloud Run service URL
changes, update the Wrangler variable in the same change that switches production.

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
with the Turso `nrt` database and optimize for Cloud Run's monthly free allowance:

- request-based billing with CPU throttled outside requests
- scale to zero, with at most one instance
- 1 vCPU, 512 MiB memory, four concurrent requests, and no startup CPU boost
- an Artifact Registry cleanup policy that retains the three newest image versions

These defaults bound resource use and avoid idle-instance charges, but they cannot
guarantee a zero bill: Cloud Run's free allowance is usage-based, network egress and
other Google Cloud products have separate pricing, and traffic can exceed the monthly
allowance. Set a billing budget/alert in Google Cloud and monitor actual usage.

The free-tier defaults can be tuned with `CLOUD_RUN_CONCURRENCY`,
`CLOUD_RUN_MIN_INSTANCES`, `CLOUD_RUN_MAX_INSTANCES`, `CLOUD_RUN_CPU`, and
`CLOUD_RUN_MEMORY`. Setting a nonzero minimum or disabling request-based CPU behavior
will add idle compute charges. Set `CONFIGURE_ARTIFACT_CLEANUP=0` only if repository
cleanup is managed elsewhere.

After the first Tokyo deploy, update `vars.API_ORIGIN` in `apps/web/wrangler.json` to
the new URL printed by the deploy script (without adding `/api`), then trigger a frontend
deployment. Keep the Jakarta service for rollback until the live Worker has been checked.

Current Tokyo service URL:

```txt
https://alpha-wolf-api-6r4m3zptwq-an.a.run.app
```
