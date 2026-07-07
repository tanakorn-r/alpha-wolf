# Deploy AlphaWolf

Backend deploys to Google Cloud Run. Frontend deploys to Cloudflare Pages.

## One-time setup

Install CLIs and authenticate:

```sh
gcloud auth login
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
npx wrangler login
```

Set deploy variables:

```sh
export GCP_PROJECT_ID="alpha-wolf-501716"
export GCP_REGION="asia-southeast1"
export CLOUD_RUN_SERVICE="alpha-wolf-api"
export ARTIFACT_REPOSITORY="alpha-wolf"
export CF_PAGES_PROJECT="alpha-wolf"
export LIBSQL_DATABASE_URL="libsql://alpha-wolf-marjod.aws-ap-northeast-1.turso.io"
export LIBSQL_AUTH_TOKEN="your-turso-auth-token"
```

Cloud Run secrets such as `OPENAI_API_KEY` and `LIBSQL_AUTH_TOKEN` should be configured in GCP or exported locally for deploy. Do not commit them.

## Deploy after commit

```sh
./scripts/deploy-all.sh
```

Or deploy separately:

```sh
./scripts/deploy-backend-cloudrun.sh
export VITE_API_BASE="https://YOUR-CLOUD-RUN-URL.a.run.app/api"
./scripts/deploy-frontend-cloudflare.sh
```

The scripts stop on a dirty worktree by default. To deploy a local work-in-progress:

```sh
ALLOW_DIRTY=1 ./scripts/deploy-all.sh
```
