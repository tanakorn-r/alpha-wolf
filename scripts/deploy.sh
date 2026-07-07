#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# deploy.sh - Build, push, and deploy AlphaWolf API to Cloud Run.
# Frontend deploys separately through the Cloudflare Pages Git pipeline.
# Usage: ./scripts/deploy.sh
# ---------------------------------------------------------------------------
set -euo pipefail
[[ "${DEPLOY_DEBUG:-0}" == "1" ]] && set -x

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# -- Config -----------------------------------------------------------------
GCP_PROJECT="${GCP_PROJECT:-${GCP_PROJECT_ID:-alpha-wolf-501716}}"
GCP_REGION="${GCP_REGION:-asia-southeast3}"
REPO="${ARTIFACT_REPOSITORY:-alpha-wolf-repo}"
SERVICE="${CLOUD_RUN_SERVICE:-alpha-wolf-api}"
IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPO}/${SERVICE}:latest"
ENV_FILE="${ENV_FILE:-.env.production}"
ENV_YAML="${ENV_YAML:-/tmp/alpha-wolf-cloudrun-env.yaml}"
TURSO_DB_NAME="${TURSO_DB_NAME:-alpha-wolf-marjod}"

# -- Helpers ----------------------------------------------------------------
log() { echo "▶ $*"; }
die() { echo "✗ $*" >&2; exit 1; }

read_env_value() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

yaml_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# -- Pre-flight checks -------------------------------------------------------
log "Starting AlphaWolf API deploy"
log "Project: $GCP_PROJECT"
log "Region: $GCP_REGION"
log "Repository: $REPO"
log "Service: $SERVICE"
log "Image: $IMAGE"
log "Env file: $ENV_FILE"

[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found. Copy .env.production.example to $ENV_FILE and fill secrets."
command -v docker >/dev/null || die "docker not found"
command -v gcloud >/dev/null || die "gcloud not found"
docker --version
gcloud --version | head -1

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
    turso db create "$TURSO_DB_NAME" --location nrt
  else
    log "Turso database '$TURSO_DB_NAME' already exists"
  fi

  TURSO_URL="$(turso db show "$TURSO_DB_NAME" --url)"
  TURSO_AUTH_TOKEN="$(turso db tokens create "$TURSO_DB_NAME")"
  upsert_env_value TURSO_URL "$TURSO_URL"
  upsert_env_value TURSO_AUTH_TOKEN "$TURSO_AUTH_TOKEN"
  upsert_env_value LIBSQL_DATABASE_URL "$TURSO_URL"
  upsert_env_value LIBSQL_AUTH_TOKEN "$TURSO_AUTH_TOKEN"
  log "Turso configured: $TURSO_URL"
else
  log "Turso already configured: $TURSO_URL"
  [[ -n "$LIBSQL_DATABASE_URL" ]] || upsert_env_value LIBSQL_DATABASE_URL "$TURSO_URL"
  [[ -z "$TURSO_AUTH_TOKEN" || -n "$LIBSQL_AUTH_TOKEN" ]] || upsert_env_value LIBSQL_AUTH_TOKEN "$TURSO_AUTH_TOKEN"
fi

# -- Build env-vars YAML for Cloud Run --------------------------------------
log "Building env vars YAML from $ENV_FILE..."
printf "" > "$ENV_YAML"
ENV_KEY_COUNT=0
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
  ENV_KEY_COUNT=$((ENV_KEY_COUNT + 1))
done < "$ENV_FILE"
log "Prepared $ENV_KEY_COUNT Cloud Run env vars at $ENV_YAML"

# -- Authenticate Docker with Artifact Registry -----------------------------
log "Authenticating Docker with Artifact Registry..."
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet

# -- Ensure Artifact Registry repo exists -----------------------------------
log "Checking Artifact Registry repository: $REPO"
if gcloud artifacts repositories describe "$REPO" \
  --project "$GCP_PROJECT" \
  --location "$GCP_REGION" >/dev/null 2>&1; then
  log "Artifact Registry repository exists"
else
  log "Creating Artifact Registry repository: $REPO"
  gcloud artifacts repositories create "$REPO" \
    --project "$GCP_PROJECT" \
    --location "$GCP_REGION" \
    --repository-format docker \
    --quiet
fi

log "Checking Docker buildx builder..."
docker buildx inspect >/dev/null

# -- Build for linux/amd64 and push -----------------------------------------
log "Building and pushing image: $IMAGE"
docker buildx build \
  --progress plain \
  --platform linux/amd64 \
  --file apps/api/Dockerfile \
  --tag "$IMAGE" \
  --push \
  apps/api
log "Image pushed: $IMAGE"

# -- Deploy to Cloud Run -----------------------------------------------------
log "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE" \
  --project "$GCP_PROJECT" \
  --image "$IMAGE" \
  --region "$GCP_REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --env-vars-file "$ENV_YAML" \
  --quiet
log "Cloud Run deploy finished"

rm -f "$ENV_YAML"

log "Done! Service URL:"
gcloud run services describe "$SERVICE" \
  --project "$GCP_PROJECT" \
  --region "$GCP_REGION" \
  --format "value(status.url)"
