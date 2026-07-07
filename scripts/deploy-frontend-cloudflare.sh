#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT_NAME="${CF_PAGES_PROJECT:-alpha-wolf}"
API_BASE="${VITE_API_BASE:-}"

if [[ -z "$API_BASE" ]]; then
  echo "Set VITE_API_BASE to your Cloud Run API base URL, for example https://alpha-wolf-api-xxxxx.a.run.app/api" >&2
  exit 1
fi

if [[ "${ALLOW_DIRTY:-0}" != "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Worktree is dirty. Commit first, or rerun with ALLOW_DIRTY=1." >&2
  exit 1
fi

echo "Building web with VITE_API_BASE=$API_BASE"
VITE_API_BASE="$API_BASE" npm run build:web

echo "Deploying Cloudflare Pages project: $PROJECT_NAME"
npx wrangler pages deploy dist/apps/web \
  --project-name "$PROJECT_NAME" \
  --commit-dirty=true
