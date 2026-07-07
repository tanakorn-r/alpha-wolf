#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${ALLOW_DIRTY:-0}" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Worktree is dirty. Commit first, or rerun with ALLOW_DIRTY=1." >&2
  exit 1
fi

./scripts/deploy-backend-cloudrun.sh

if [[ -z "${VITE_API_BASE:-}" ]]; then
  PROJECT_ID="${GCP_PROJECT_ID:-}"
  REGION="${GCP_REGION:-asia-southeast1}"
  SERVICE="${CLOUD_RUN_SERVICE:-alpha-wolf-api}"
  if [[ -n "$PROJECT_ID" ]]; then
    CLOUD_RUN_URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
    export VITE_API_BASE="${CLOUD_RUN_URL}/api"
  fi
fi

./scripts/deploy-frontend-cloudflare.sh
