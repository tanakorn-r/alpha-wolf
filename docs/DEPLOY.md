# Deploy AlphaWolf

Backend deploys to Google Cloud Run. Frontend deploys automatically through the Cloudflare Pages Git pipeline.

## One-time setup

Install CLIs and authenticate:

```sh
gcloud auth login
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
```

Set deploy variables:

```sh
export GCP_PROJECT_ID="alpha-wolf-501716"
export GCP_REGION="asia-southeast1"
export CLOUD_RUN_SERVICE="alpha-wolf-api"
export ARTIFACT_REPOSITORY="alpha-wolf"
export LIBSQL_DATABASE_URL="libsql://alpha-wolf-marjod.aws-ap-northeast-1.turso.io"
export LIBSQL_AUTH_TOKEN="your-turso-auth-token"
```

Cloud Run secrets such as `OPENAI_API_KEY` and `LIBSQL_AUTH_TOKEN` should be configured in GCP or exported locally for deploy. Do not commit them.

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
./scripts/deploy-all.sh
```

Or:

```sh
./scripts/deploy-backend-cloudrun.sh
```

The scripts stop on a dirty worktree by default. To deploy a local work-in-progress:

```sh
ALLOW_DIRTY=1 ./scripts/deploy-all.sh
```
