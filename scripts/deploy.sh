#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh - Build, push, and deploy AlphaWolf API to Cloud Run.
# Frontend deploys separately through the Cloudflare Pages Git pipeline.
# Usage: ./scripts/deploy.sh
# ---------------------------------------------------------------------------
set -euo pipefail
[[ "${DEPLOY_DEBUG:-0}" == "1" ]] && set -x
trap 'status=$?; die "Deploy failed near line ${LINENO}: ${BASH_COMMAND} (exit ${status}). Run with DEPLOY_DEBUG=1 for full trace."' ERR

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# -- Config -----------------------------------------------------------------
GCP_PROJECT="${GCP_PROJECT:-${GCP_PROJECT_ID:-alpha-wolf-501716}}"
TURSO_LOCATION="${TURSO_LOCATION:-nrt}"
# nrt is Tokyo; keep the default Cloud Run service in the same metro so every
# libSQL operation does not pay a Jakarta-to-Tokyo network hop.
GCP_REGION="${GCP_REGION:-asia-northeast1}"
REPO="${ARTIFACT_REPOSITORY:-alpha-wolf-be}"
SERVICE="${CLOUD_RUN_SERVICE:-alpha-wolf-api}"
CLOUD_RUN_CONCURRENCY="${CLOUD_RUN_CONCURRENCY:-8}"
CLOUD_RUN_MIN_INSTANCES="${CLOUD_RUN_MIN_INSTANCES:-1}"
CLOUD_RUN_MEMORY="${CLOUD_RUN_MEMORY:-1Gi}"

# GENERATE UNIQUE VERSION TAG (Fixes the Artifact Registry Immutability error)
TAG=$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d-%H%M%S)
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO}/${SERVICE}:${TAG}"

ENV_FILE="${ENV_FILE:-.env.production}"
ENV_YAML="${ENV_YAML:-/tmp/alpha-wolf-cloudrun-env.yaml}"
TURSO_DB_NAME="${TURSO_DB_NAME:-alpha-wolf-marjod}"

# -- Helpers ----------------------------------------------------------------
log() { echo "▶ $*"; }
die() { echo "✗ $*" >&2; exit 1; }

read_env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { value = substr($0, length(key) + 2) } END { gsub(/^["'\'']|["'\'']$/, "", value); print value }' "$ENV_FILE"
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    # Added a explicit newline print here so it never stitches onto an existing line
    printf "\n%s=%s" "$key" "$value" >> "$ENV_FILE"
  fi
}

yaml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# -- Pre-flight checks -------------------------------------------------------
log "Starting AlphaWolf API deploy"
log "Image: $IMAGE"

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy .env.production.example to $ENV_FILE and fill secrets."
command -v docker >/dev/null || die "docker not found"
command -v gcloud >/dev/null || die "gcloud not found"

if [[ "${ALLOW_DIRTY:-0}" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  die "Worktree is dirty. Commit first, or rerun with ALLOW_DIRTY=1."
fi

# -- Turso setup -------------------------------------------------------------
TURSO_URL="$(read_env_value TURSO_URL)"
LIBSQL_DATABASE_URL="$(read_env_value LIBSQL_DATABASE_URL)"
TURSO_AUTH_TOKEN="$(read_env_value TURSO_AUTH_TOKEN)"
LIBSQL_AUTH_TOKEN="$(read_env_value LIBSQL_AUTH_TOKEN)"

if [[ -z "$TURSO_URL" && -n "$LIBSQL_DATABASE_URL" ]]; then
  TURSO_URL="$LIBSQL_DATABASE_URL"
fi
if [[ -z "$TURSO_AUTH_TOKEN" && -n "$LIBSQL_AUTH_TOKEN" ]]; then
  TURSO_AUTH_TOKEN="$LIBSQL_AUTH_TOKEN"
fi

if [[ -z "$TURSO_URL" ]]; then
  log "Turso not configured - setting up now..."
  command -v turso >/dev/null || die "turso CLI not found. Install: brew install tursodatabase/tap/turso && turso auth login"

  if ! turso db show "$TURSO_DB_NAME" >/dev/null 2>&1; then
    log "Creating Turso database: $TURSO_DB_NAME"
    turso db create "$TURSO_DB_NAME" --location "$TURSO_LOCATION"
  else
    log "Turso database '$TURSO_DB_NAME' already exists"
  fi

  TURSO_URL="$(turso db show "$TURSO_DB_NAME" --url)"
  TURSO_AUTH_TOKEN="$(turso db tokens create "$TURSO_DB_NAME")"
  log "Turso configured: $TURSO_URL"
else
  log "Turso already configured: $TURSO_URL"
  [[ -n "$LIBSQL_DATABASE_URL" ]]
  [[ -z "$TURSO_AUTH_TOKEN" || -n "$LIBSQL_AUTH_TOKEN" ]]
fi

# -- Build env-vars YAML for Cloud Run --------------------------------------
log "Building env vars YAML from $ENV_FILE..."
printf "" > "$ENV_YAML"
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *"="* ]] && continue

  key="${line%%=*}"
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"

  [[ -z "$value" ]] && continue
  [[ "$value" == your_* ]] && continue
  [[ "$key" == "PORT" ]] && continue
  [[ "$key" == "DB_PATH" ]] && continue
  [[ "$key" == VITE_* ]] && continue

  echo "${key}: \"$(yaml_escape "$value")\"" >> "$ENV_YAML"
done < "$ENV_FILE"

# -- Authenticate Docker with Artifact Registry -----------------------------
log "Authenticating Docker with Artifact Registry..."
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

# -- Ensure Artifact Registry repo exists -----------------------------------
if gcloud artifacts repositories describe "$REPO" \
  --project "$GCP_PROJECT" \
  --location "$GCP_REGION" >/dev/null 2>&1; then
  :
else
  log "Creating Artifact Registry repository: $REPO"
  gcloud artifacts repositories create "$REPO" \
    --project "$GCP_PROJECT" \
    --location "$GCP_REGION" \
    --repository-format docker \
    --quiet
fi

docker buildx inspect >/dev/null

# -- Build for linux/amd64 and push -----------------------------------------
log "Building and pushing image: $IMAGE"
docker buildx build \
  --platform linux/amd64 \
  --file apps/api/Dockerfile \
  --tag "$IMAGE" \
  --push \
  apps/api

# -- Deploy to Cloud Run -----------------------------------------------------
log "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --project "$GCP_PROJECT" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --concurrency "$CLOUD_RUN_CONCURRENCY" \
  --min "$CLOUD_RUN_MIN_INSTANCES" \
  --cpu-boost \
  --no-cpu-throttling \
  --memory "$CLOUD_RUN_MEMORY" \
  --env-vars-file "$ENV_YAML" \
  --quiet

rm -f "$ENV_YAML"

log "Done! Service URL:"
gcloud run services describe "$SERVICE" \
  --project "$GCP_PROJECT" \
  --region "$GCP_REGION" \
  --format "value(status.url)"
