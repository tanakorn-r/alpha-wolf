# Deploy AlphaWolf

Backend deploys to Google Cloud Run. Frontend deploys automatically through the Cloudflare Pages Git pipeline.

## One-time setup

Install CLIs and authenticate:

```sh
gcloud auth login
gcloud auth configure-docker asia-southeast3-docker.pkg.dev
```

Set deploy variables:

```sh
export GCP_PROJECT="alpha-wolf-501716"
export GCP_REGION="asia-southeast3"
export CLOUD_RUN_SERVICE="alpha-wolf-api"
export ARTIFACT_REPOSITORY="alpha-wolf-repo"
```

Create `.env.production` from the example and fill the real secrets:

```sh
cp .env.production.example .env.production
```

Cloud Run env vars are built from `.env.production`. Do not commit that file.

## Cloudflare Pages

Cloudflare should build the frontend from git after each commit/push.

Use these Pages settings:

```txt
Build command: npm run build:web:static
Build output directory: dist/apps/web
Root directory: /
```

Set this Cloudflare environment variable:

```txt
VITE_API_BASE=https://YOUR-CLOUD-RUN-URL.a.run.app/api
```

The frontend build uses plain Vite (`npm run build:web:static`) so Cloudflare does not need to detect Nx executors like `@nx/vite:build`.

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
