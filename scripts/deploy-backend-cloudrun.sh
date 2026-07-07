#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_ID="${GCP_PROJECT_ID:-alpha-wolf-501716}"
REGION="${GCP_REGION:-asia-southeast1}"
SERVICE="${CLOUD_RUN_SERVICE:-alpha-wolf-api}"
REPOSITORY="${ARTIFACT_REPOSITORY:-alpha-wolf}"
IMAGE_NAME="${IMAGE_NAME:-alpha-wolf-api}"
LIBSQL_DATABASE_URL="${LIBSQL_DATABASE_URL:-${TURSO_DATABASE_URL:-libsql://alpha-wolf-marjod.aws-ap-northeast-1.turso.io}}"
LIBSQL_AUTH_TOKEN="${LIBSQL_AUTH_TOKEN:-${TURSO_AUTH_TOKEN:-}}"
COMMIT_SHA="$(git rev-parse --short HEAD)"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Set GCP_PROJECT_ID before deploying." >&2
  exit 1
fi

if [[ "${ALLOW_DIRTY:-0}" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Worktree is dirty. Commit first, or rerun with ALLOW_DIRTY=1." >&2
  exit 1
fi

command -v gcloud >/dev/null || { echo "gcloud is required." >&2; exit 1; }

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${COMMIT_SHA}"

echo "Building API..."
npm run build:api

echo "Ensuring Artifact Registry repository exists..."
gcloud artifacts repositories describe "$REPOSITORY" \
  --project "$PROJECT_ID" \
  --location "$REGION" >/dev/null 2>&1 || \
gcloud artifacts repositories create "$REPOSITORY" \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --repository-format docker

echo "Submitting image: $IMAGE"
gcloud builds submit apps/api \
  --project "$PROJECT_ID" \
  --tag "$IMAGE"

echo "Deploying Cloud Run service: $SERVICE"
ENV_VARS="OPENAI_MODEL=${OPENAI_MODEL:-gpt-5.4-mini},LIBSQL_DATABASE_URL=${LIBSQL_DATABASE_URL}"
if [[ -n "$LIBSQL_AUTH_TOKEN" ]]; then
  ENV_VARS="${ENV_VARS},LIBSQL_AUTH_TOKEN=${LIBSQL_AUTH_TOKEN}"
fi

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "$IMAGE" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "$ENV_VARS"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
echo "Cloud Run URL: $URL"
